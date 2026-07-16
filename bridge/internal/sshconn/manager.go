package sshconn

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"strconv"
	"sync"
	"time"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"

	bridgeconfig "localdraftai/bridge/internal/config"
)

type EventHandler func(method string, params any)

type ManagerConfig struct {
	Store             *bridgeconfig.Store
	Paths             bridgeconfig.Paths
	Events            EventHandler
	DialTimeout       time.Duration
	KeepaliveInterval time.Duration
	KeepaliveFailures int
	ReconnectDelays   []time.Duration
}

type PromptResponse struct {
	Secret string `json:"secret"`
	Trust  bool   `json:"trust"`
	Cancel bool   `json:"cancel"`
}

type pendingPrompt struct {
	connectionID string
	response     chan PromptResponse
}

type automaticReconnect struct {
	cancel context.CancelFunc
}

type Manager struct {
	config      ManagerConfig
	verifier    *HostKeyVerifier
	mu          sync.RWMutex
	connections map[string]*Connection
	promptMu    sync.Mutex
	prompts     map[string]pendingPrompt
	reconnectMu sync.Mutex
	reconnects  map[string]*automaticReconnect
}

func NewManager(config ManagerConfig) *Manager {
	if config.DialTimeout <= 0 {
		config.DialTimeout = 15 * time.Second
	}
	if config.KeepaliveInterval <= 0 {
		config.KeepaliveInterval = 30 * time.Second
	}
	if config.KeepaliveFailures <= 0 {
		config.KeepaliveFailures = 3
	}
	if len(config.ReconnectDelays) == 0 {
		config.ReconnectDelays = []time.Duration{time.Second, 2 * time.Second, 4 * time.Second}
	}
	return &Manager{
		config:      config,
		verifier:    NewHostKeyVerifier(config.Paths.KnownHostsFile),
		connections: make(map[string]*Connection),
		prompts:     make(map[string]pendingPrompt),
		reconnects:  make(map[string]*automaticReconnect),
	}
}

func (m *Manager) Connect(ctx context.Context, connectionID string) (Status, error) {
	profile, err := m.resolveProfile(connectionID)
	if err != nil {
		return Status{}, err
	}
	m.mu.Lock()
	if existing := m.connections[connectionID]; existing != nil {
		status := existing.status()
		if status.State == StateConnected {
			m.mu.Unlock()
			return status, nil
		}
		if status.State == StateConnecting || status.State == StateWaitingForHostKey || status.State == StateWaitingForSecret {
			m.mu.Unlock()
			return status, errors.New("a connection attempt is already in progress")
		}
	}
	connection := newConnection(profile)
	m.connections[connectionID] = connection
	m.mu.Unlock()
	attemptContext, cancel := context.WithCancel(ctx)
	connection.setCancel(cancel)
	defer cancel()
	m.setState(connection, StateConnecting, "", "")

	sshClient, sftpClient, err := m.establish(attemptContext, connection)
	if err != nil {
		if connection.stopped() {
			return connection.status(), err
		}
		code, message, retryable, details := classifyConnectionError(err)
		m.setState(connection, StateError, code, message)
		m.emit("connection.error", map[string]any{
			"connectionId": connectionID,
			"code":         code,
			"message":      message,
			"retryable":    retryable,
			"details":      details,
		})
		return connection.status(), err
	}
	if !connection.attach(sshClient, sftpClient) {
		_ = sftpClient.Close()
		_ = sshClient.Close()
		return connection.status(), context.Canceled
	}
	m.setState(connection, StateConnected, "", "")
	m.startKeepalive(connection)
	return connection.status(), nil
}

func (m *Manager) establish(ctx context.Context, connection *Connection) (*ssh.Client, *sftp.Client, error) {
	profile := connection.profile
	secretPrompt := func(ctx context.Context, promptType, message string) ([]byte, error) {
		m.setState(connection, StateWaitingForSecret, "", "")
		response, err := m.requestPrompt(ctx, connection.profile.ID, "connection.secretPrompt", map[string]any{
			"type":    promptType,
			"label":   connection.profile.Label,
			"message": message,
		})
		m.setState(connection, StateConnecting, "", "")
		if err != nil {
			return nil, err
		}
		secret := []byte(response.Secret)
		response.Secret = ""
		return secret, nil
	}
	methods, closeAgent, err := publicAuthenticationMethods(ctx, profile, secretPrompt)
	if err != nil {
		return nil, nil, err
	}
	defer closeAgent()
	hostKeyCallback := m.verifier.Callback(ctx, profile, func(ctx context.Context, prompt HostKeyPrompt) (bool, error) {
		m.setState(connection, StateWaitingForHostKey, "", "")
		response, err := m.requestPrompt(ctx, connection.profile.ID, "connection.hostKeyPrompt", map[string]any{
			"type":        "host-key",
			"host":        prompt.Host,
			"address":     prompt.Address,
			"algorithm":   prompt.Algorithm,
			"fingerprint": prompt.Fingerprint,
		})
		m.setState(connection, StateConnecting, "", "")
		if err != nil {
			return false, err
		}
		return response.Trust, nil
	})
	client, err := m.dial(ctx, profile, methods, hostKeyCallback)
	if err != nil && profile.Auth.AllowPassword && isAuthenticationFailure(err) {
		secret, promptErr := secretPrompt(ctx, "password", "Enter the SSH password for "+profile.User+"@"+profile.Label)
		if promptErr != nil {
			return nil, nil, promptErr
		}
		password := string(secret)
		zeroBytes(secret)
		client, err = m.dial(ctx, profile, []ssh.AuthMethod{ssh.Password(password)}, hostKeyCallback)
		password = ""
	}
	if err != nil {
		return nil, nil, err
	}
	sftpClient, err := sftp.NewClient(client)
	if err != nil {
		_ = client.Close()
		return nil, nil, fmt.Errorf("start SFTP client: %w", err)
	}
	return client, sftpClient, nil
}

func (m *Manager) dial(ctx context.Context, profile bridgeconfig.Profile, methods []ssh.AuthMethod, hostKeyCallback ssh.HostKeyCallback) (*ssh.Client, error) {
	address := net.JoinHostPort(profile.Host, strconv.Itoa(profile.Port))
	dialer := net.Dialer{Timeout: m.config.DialTimeout}
	networkConnection, err := dialer.DialContext(ctx, "tcp", address)
	if err != nil {
		return nil, err
	}
	clientConfig := &ssh.ClientConfig{
		User:            profile.User,
		Auth:            methods,
		HostKeyCallback: hostKeyCallback,
		Timeout:         m.config.DialTimeout,
	}
	_ = networkConnection.SetDeadline(time.Now().Add(m.config.DialTimeout))
	sshConnection, channels, requests, err := ssh.NewClientConn(networkConnection, address, clientConfig)
	if err != nil {
		_ = networkConnection.Close()
		return nil, err
	}
	_ = networkConnection.SetDeadline(time.Time{})
	return ssh.NewClient(sshConnection, channels, requests), nil
}

func (m *Manager) Disconnect(connectionID string) error {
	m.cancelAutomaticReconnect(connectionID)
	m.mu.RLock()
	connection := m.connections[connectionID]
	m.mu.RUnlock()
	if connection == nil {
		return errors.New("connection was not found")
	}
	m.setState(connection, StateClosing, "", "")
	connection.cancelAttempt()
	connection.closeClients()
	m.cancelPrompts(connectionID)
	m.setState(connection, StateDisconnected, "", "")
	return nil
}

func (m *Manager) Close() {
	m.mu.RLock()
	connectionIDs := make([]string, 0, len(m.connections))
	for connectionID := range m.connections {
		connectionIDs = append(connectionIDs, connectionID)
	}
	m.mu.RUnlock()
	for _, connectionID := range connectionIDs {
		_ = m.Disconnect(connectionID)
	}
}

func (m *Manager) Reconnect(ctx context.Context, connectionID string) (Status, error) {
	m.cancelAutomaticReconnect(connectionID)
	_ = m.Disconnect(connectionID)
	return m.Connect(ctx, connectionID)
}

func (m *Manager) startAutomaticReconnect(connectionID string) {
	m.reconnectMu.Lock()
	if _, exists := m.reconnects[connectionID]; exists {
		m.reconnectMu.Unlock()
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	attempt := &automaticReconnect{cancel: cancel}
	m.reconnects[connectionID] = attempt
	m.reconnectMu.Unlock()

	go func() {
		defer func() {
			m.reconnectMu.Lock()
			if m.reconnects[connectionID] == attempt {
				delete(m.reconnects, connectionID)
			}
			m.reconnectMu.Unlock()
		}()
		for _, delay := range m.config.ReconnectDelays {
			m.mu.RLock()
			connection := m.connections[connectionID]
			m.mu.RUnlock()
			if connection == nil {
				return
			}
			m.reconnectMu.Lock()
			if m.reconnects[connectionID] != attempt || ctx.Err() != nil {
				m.reconnectMu.Unlock()
				return
			}
			connection.setState(StateReconnecting, "", "")
			m.reconnectMu.Unlock()
			m.emit("connection.stateChanged", connection.status())
			timer := time.NewTimer(delay)
			select {
			case <-ctx.Done():
				if !timer.Stop() {
					<-timer.C
				}
				return
			case <-timer.C:
			}
			status, err := m.Connect(ctx, connectionID)
			if err == nil && status.State == StateConnected {
				return
			}
			if ctx.Err() != nil {
				return
			}
			_, _, retryable, _ := classifyConnectionError(err)
			if !retryable {
				return
			}
		}
	}()
}

func (m *Manager) cancelAutomaticReconnect(connectionID string) {
	m.reconnectMu.Lock()
	attempt := m.reconnects[connectionID]
	delete(m.reconnects, connectionID)
	m.reconnectMu.Unlock()
	if attempt != nil {
		attempt.cancel()
	}
}

func (m *Manager) GetStatus(connectionID string) (Status, bool) {
	m.mu.RLock()
	connection := m.connections[connectionID]
	m.mu.RUnlock()
	if connection == nil {
		return Status{ConnectionID: connectionID, State: StateDisconnected}, false
	}
	return connection.status(), true
}

func (m *Manager) SFTP(connectionID string) (*sftp.Client, error) {
	m.mu.RLock()
	connection := m.connections[connectionID]
	m.mu.RUnlock()
	if connection == nil {
		return nil, errors.New("connection was not found")
	}
	_, client := connection.clients()
	if client == nil || connection.status().State != StateConnected {
		return nil, errors.New("connection is not ready")
	}
	return client, nil
}

func (m *Manager) RespondToPrompt(promptID string, response PromptResponse) error {
	m.promptMu.Lock()
	prompt, ok := m.prompts[promptID]
	if ok {
		delete(m.prompts, promptID)
	}
	m.promptMu.Unlock()
	if !ok {
		return errors.New("connection prompt was not found")
	}
	select {
	case prompt.response <- response:
		return nil
	default:
		return errors.New("connection prompt is no longer waiting")
	}
}

func (m *Manager) requestPrompt(ctx context.Context, connectionID, method string, params map[string]any) (PromptResponse, error) {
	promptID, err := randomID()
	if err != nil {
		return PromptResponse{}, err
	}
	waiting := pendingPrompt{connectionID: connectionID, response: make(chan PromptResponse, 1)}
	m.promptMu.Lock()
	m.prompts[promptID] = waiting
	m.promptMu.Unlock()
	params["promptId"] = promptID
	params["connectionId"] = connectionID
	m.emit(method, params)
	defer func() {
		m.promptMu.Lock()
		delete(m.prompts, promptID)
		m.promptMu.Unlock()
	}()
	select {
	case response := <-waiting.response:
		if response.Cancel {
			response.Secret = ""
			return PromptResponse{}, errors.New("connection prompt was cancelled")
		}
		return response, nil
	case <-ctx.Done():
		return PromptResponse{}, ctx.Err()
	}
}

func (m *Manager) cancelPrompts(connectionID string) {
	m.promptMu.Lock()
	defer m.promptMu.Unlock()
	for promptID, prompt := range m.prompts {
		if prompt.connectionID == connectionID {
			delete(m.prompts, promptID)
			select {
			case prompt.response <- PromptResponse{Cancel: true}:
			default:
			}
		}
	}
}

func (m *Manager) resolveProfile(connectionID string) (bridgeconfig.Profile, error) {
	if m.config.Store != nil {
		if profile, found, err := m.config.Store.Get(connectionID); err != nil {
			return bridgeconfig.Profile{}, err
		} else if found {
			return profile, nil
		}
	}
	profiles, err := bridgeconfig.ListOpenSSHHosts(m.config.Paths.OpenSSHConfig)
	if err != nil {
		return bridgeconfig.Profile{}, err
	}
	for _, profile := range profiles {
		if profile.ID == connectionID {
			return profile, nil
		}
	}
	return bridgeconfig.Profile{}, errors.New("connection profile was not found")
}

func (m *Manager) setState(connection *Connection, state State, errorCode, errorMessage string) {
	connection.setState(state, errorCode, errorMessage)
	m.emit("connection.stateChanged", connection.status())
}

func (m *Manager) emit(method string, params any) {
	if m.config.Events != nil {
		m.config.Events(method, params)
	}
}

func randomID() (string, error) {
	value := make([]byte, 16)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return hex.EncodeToString(value), nil
}

func classifyConnectionError(err error) (code, message string, retryable bool, details any) {
	var changed *HostKeyChangedError
	var unknown *HostKeyUnknownError
	if errors.As(err, &changed) {
		return "HOST_KEY_CHANGED", "The SSH host key has changed.", false, changed
	}
	if errors.As(err, &unknown) {
		return "HOST_KEY_UNKNOWN", "The SSH host key was not trusted.", false, nil
	}
	if isAuthenticationFailure(err) {
		return "AUTHENTICATION_REQUIRED", "SSH authentication failed.", false, nil
	}
	if errors.Is(err, context.Canceled) {
		return "CONNECTION_LOST", "The SSH connection attempt was cancelled.", true, nil
	}
	return "CONNECTION_LOST", "Could not connect to the SSH host.", true, nil
}

func ErrorInfo(err error) (code, message string, retryable bool, details any) {
	return classifyConnectionError(err)
}
