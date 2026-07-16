package sshconn

import (
	"context"
	"sync"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"

	bridgeconfig "localdraftai/bridge/internal/config"
)

type State string

const (
	StateDisconnected      State = "disconnected"
	StateConnecting        State = "connecting"
	StateWaitingForHostKey State = "waiting-for-host-key"
	StateWaitingForSecret  State = "waiting-for-secret"
	StateConnected         State = "connected"
	StateReconnecting      State = "reconnecting"
	StateClosing           State = "closing"
	StateError             State = "error"
)

type Status struct {
	ConnectionID string `json:"connectionId"`
	Label        string `json:"label"`
	Host         string `json:"host"`
	Port         int    `json:"port"`
	User         string `json:"user"`
	State        State  `json:"state"`
	ErrorCode    string `json:"errorCode,omitempty"`
	ErrorMessage string `json:"errorMessage,omitempty"`
}

type Connection struct {
	mu           sync.RWMutex
	profile      bridgeconfig.Profile
	state        State
	errorCode    string
	errorMessage string
	sshClient    *ssh.Client
	sftpClient   *sftp.Client
	stop         chan struct{}
	stopOnce     sync.Once
	cancel       context.CancelFunc
}

func (c *Connection) setCancel(cancel context.CancelFunc) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.cancel = cancel
}

func (c *Connection) cancelAttempt() {
	c.mu.RLock()
	cancel := c.cancel
	c.mu.RUnlock()
	if cancel != nil {
		cancel()
	}
}

func newConnection(profile bridgeconfig.Profile) *Connection {
	return &Connection{profile: profile, state: StateDisconnected, stop: make(chan struct{})}
}

func (c *Connection) setState(state State, errorCode, errorMessage string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.state = state
	c.errorCode = errorCode
	c.errorMessage = errorMessage
}

func (c *Connection) attach(sshClient *ssh.Client, sftpClient *sftp.Client) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	select {
	case <-c.stop:
		return false
	default:
	}
	c.sshClient = sshClient
	c.sftpClient = sftpClient
	return true
}

func (c *Connection) stopped() bool {
	select {
	case <-c.stop:
		return true
	default:
		return false
	}
}

func (c *Connection) closeClients() {
	c.stopOnce.Do(func() { close(c.stop) })
	c.mu.Lock()
	sftpClient := c.sftpClient
	sshClient := c.sshClient
	c.sftpClient = nil
	c.sshClient = nil
	c.mu.Unlock()
	if sftpClient != nil {
		_ = sftpClient.Close()
	}
	if sshClient != nil {
		_ = sshClient.Close()
	}
}

func (c *Connection) status() Status {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return Status{
		ConnectionID: c.profile.ID,
		Label:        c.profile.Label,
		Host:         c.profile.Host,
		Port:         c.profile.Port,
		User:         c.profile.User,
		State:        c.state,
		ErrorCode:    c.errorCode,
		ErrorMessage: c.errorMessage,
	}
}

func (c *Connection) clients() (*ssh.Client, *sftp.Client) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.sshClient, c.sftpClient
}
