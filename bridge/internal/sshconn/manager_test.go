package sshconn

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"errors"
	"net"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/agent"

	bridgeconfig "localdraftai/bridge/internal/config"
	"localdraftai/bridge/internal/testssh"
)

func managerPaths(t *testing.T) bridgeconfig.Paths {
	directory := t.TempDir()
	return bridgeconfig.Paths{
		Directory:       directory,
		ConnectionsFile: filepath.Join(directory, "connections.json"),
		KnownHostsFile:  filepath.Join(directory, "known_hosts"),
		OpenSSHConfig:   filepath.Join(directory, "ssh_config"),
	}
}

func serverProfile(server *testssh.Server) bridgeconfig.Profile {
	host, portText, _ := net.SplitHostPort(server.Address)
	port, _ := net.LookupPort("tcp", portText)
	return bridgeconfig.Profile{
		Label: "Test SSH",
		Host:  host,
		Port:  port,
		User:  server.User,
		Auth: bridgeconfig.AuthProfile{
			UseAgent:      false,
			AllowPassword: false,
		},
	}
}

type promptAnswers struct {
	passphrase  string
	password    string
	trust       bool
	mu          sync.Mutex
	hostPrompts int
	secretTypes []string
}

func newPromptingManager(t *testing.T, paths bridgeconfig.Paths, store *bridgeconfig.Store, answers *promptAnswers, configure func(*ManagerConfig)) *Manager {
	t.Helper()
	var manager *Manager
	config := ManagerConfig{
		Store:             store,
		Paths:             paths,
		DialTimeout:       5 * time.Second,
		KeepaliveInterval: time.Hour,
		Events: func(method string, params any) {
			values, ok := params.(map[string]any)
			if !ok {
				return
			}
			promptID, _ := values["promptId"].(string)
			if promptID == "" {
				return
			}
			switch method {
			case "connection.hostKeyPrompt":
				answers.mu.Lock()
				answers.hostPrompts++
				answers.mu.Unlock()
				if err := manager.RespondToPrompt(promptID, PromptResponse{Trust: answers.trust}); err != nil {
					t.Errorf("respond to host prompt: %v", err)
				}
			case "connection.secretPrompt":
				promptType, _ := values["type"].(string)
				answers.mu.Lock()
				answers.secretTypes = append(answers.secretTypes, promptType)
				answers.mu.Unlock()
				secret := answers.password
				if promptType == "passphrase" {
					secret = answers.passphrase
				}
				if err := manager.RespondToPrompt(promptID, PromptResponse{Secret: secret}); err != nil {
					t.Errorf("respond to secret prompt: %v", err)
				}
			}
		},
	}
	if configure != nil {
		configure(&config)
	}
	manager = NewManager(config)
	return manager
}

func TestIdentityAuthenticationHostTrustSFTPAndReconnect(t *testing.T) {
	server, err := testssh.Start(testssh.Options{Root: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	defer server.Close()
	paths := managerPaths(t)
	identityPath := filepath.Join(t.TempDir(), "id_ed25519")
	if err := server.WriteIdentityFile(identityPath, nil); err != nil {
		t.Fatal(err)
	}
	profile := serverProfile(server)
	profile.Auth.IdentityFile = identityPath
	store := bridgeconfig.NewStore(paths)
	profile, err = store.Create(profile)
	if err != nil {
		t.Fatal(err)
	}
	answers := &promptAnswers{trust: true}
	manager := newPromptingManager(t, paths, store, answers, nil)
	status, err := manager.Connect(context.Background(), profile.ID)
	if err != nil {
		t.Fatal(err)
	}
	if status.State != StateConnected {
		t.Fatalf("status = %#v", status)
	}
	client, err := manager.SFTP(profile.ID)
	if err != nil {
		t.Fatal(err)
	}
	file, err := client.Create(filepath.Join(server.Root, "notes.md"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := file.Write([]byte("# Notes\n")); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	if err := manager.Disconnect(profile.ID); err != nil {
		t.Fatal(err)
	}
	status, err = manager.Connect(context.Background(), profile.ID)
	if err != nil || status.State != StateConnected {
		t.Fatalf("trusted reconnect status = %#v, error = %v", status, err)
	}
	answers.mu.Lock()
	hostPrompts := answers.hostPrompts
	answers.mu.Unlock()
	if hostPrompts != 1 {
		t.Fatalf("host prompts = %d", hostPrompts)
	}
	_ = manager.Disconnect(profile.ID)
	if runtime.GOOS != "windows" {
		info, err := os.Stat(paths.KnownHostsFile)
		if err != nil || info.Mode().Perm() != 0o600 {
			t.Fatalf("known_hosts permissions = %v, error = %v", info.Mode().Perm(), err)
		}
	}
}

func TestEncryptedIdentityPassphrasePrompt(t *testing.T) {
	server, err := testssh.Start(testssh.Options{Root: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	defer server.Close()
	paths := managerPaths(t)
	identityPath := filepath.Join(t.TempDir(), "encrypted_id")
	if err := server.WriteIdentityFile(identityPath, []byte("correct-passphrase")); err != nil {
		t.Fatal(err)
	}
	profile := serverProfile(server)
	profile.Auth.IdentityFile = identityPath
	store := bridgeconfig.NewStore(paths)
	profile, err = store.Create(profile)
	if err != nil {
		t.Fatal(err)
	}
	answers := &promptAnswers{trust: true, passphrase: "correct-passphrase"}
	manager := newPromptingManager(t, paths, store, answers, nil)
	if _, err := manager.Connect(context.Background(), profile.ID); err != nil {
		t.Fatal(err)
	}
	answers.mu.Lock()
	defer answers.mu.Unlock()
	if len(answers.secretTypes) != 1 || answers.secretTypes[0] != "passphrase" {
		t.Fatalf("secret prompts = %#v", answers.secretTypes)
	}
	_ = manager.Disconnect(profile.ID)
}

func TestPasswordAuthenticationPrompt(t *testing.T) {
	server, err := testssh.Start(testssh.Options{Root: t.TempDir(), Password: "correct-password"})
	if err != nil {
		t.Fatal(err)
	}
	defer server.Close()
	paths := managerPaths(t)
	profile := serverProfile(server)
	profile.Auth.AllowPassword = true
	store := bridgeconfig.NewStore(paths)
	profile, err = store.Create(profile)
	if err != nil {
		t.Fatal(err)
	}
	answers := &promptAnswers{trust: true, password: "correct-password"}
	manager := newPromptingManager(t, paths, store, answers, nil)
	if _, err := manager.Connect(context.Background(), profile.ID); err != nil {
		t.Fatal(err)
	}
	answers.mu.Lock()
	defer answers.mu.Unlock()
	if len(answers.secretTypes) != 1 || answers.secretTypes[0] != "password" {
		t.Fatalf("secret prompts = %#v", answers.secretTypes)
	}
	_ = manager.Disconnect(profile.ID)
}

func TestAgentAuthentication(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("unix-domain ssh-agent test")
	}
	server, err := testssh.Start(testssh.Options{Root: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	defer server.Close()
	socketPath := filepath.Join(t.TempDir(), "agent.sock")
	listener, err := net.Listen("unix", socketPath)
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	keyring := agent.NewKeyring()
	if err := keyring.Add(agent.AddedKey{PrivateKey: server.UserPrivateKey}); err != nil {
		t.Fatal(err)
	}
	go func() {
		connection, err := listener.Accept()
		if err == nil {
			_ = agent.ServeAgent(keyring, connection)
			_ = connection.Close()
		}
	}()
	t.Setenv("SSH_AUTH_SOCK", socketPath)
	paths := managerPaths(t)
	profile := serverProfile(server)
	profile.Auth.UseAgent = true
	store := bridgeconfig.NewStore(paths)
	profile, err = store.Create(profile)
	if err != nil {
		t.Fatal(err)
	}
	answers := &promptAnswers{trust: true}
	manager := newPromptingManager(t, paths, store, answers, nil)
	if _, err := manager.Connect(context.Background(), profile.ID); err != nil {
		t.Fatal(err)
	}
	_ = manager.Disconnect(profile.ID)
}

func TestAgentAuthenticationPrecedesEncryptedIdentityPrompt(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("unix-domain ssh-agent test")
	}
	server, err := testssh.Start(testssh.Options{Root: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	defer server.Close()
	socketPath := filepath.Join(t.TempDir(), "agent.sock")
	listener, err := net.Listen("unix", socketPath)
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	keyring := agent.NewKeyring()
	if err := keyring.Add(agent.AddedKey{PrivateKey: server.UserPrivateKey}); err != nil {
		t.Fatal(err)
	}
	go func() {
		connection, err := listener.Accept()
		if err == nil {
			_ = agent.ServeAgent(keyring, connection)
			_ = connection.Close()
		}
	}()
	t.Setenv("SSH_AUTH_SOCK", socketPath)
	identityPath := filepath.Join(t.TempDir(), "encrypted_id")
	if err := server.WriteIdentityFile(identityPath, []byte("unused-passphrase")); err != nil {
		t.Fatal(err)
	}
	paths := managerPaths(t)
	profile := serverProfile(server)
	profile.Auth.UseAgent = true
	profile.Auth.IdentityFile = identityPath
	store := bridgeconfig.NewStore(paths)
	profile, err = store.Create(profile)
	if err != nil {
		t.Fatal(err)
	}
	answers := &promptAnswers{trust: true}
	manager := newPromptingManager(t, paths, store, answers, nil)
	if _, err := manager.Connect(context.Background(), profile.ID); err != nil {
		t.Fatal(err)
	}
	answers.mu.Lock()
	secretPromptCount := len(answers.secretTypes)
	answers.mu.Unlock()
	if secretPromptCount != 0 {
		t.Fatalf("identity prompt occurred before successful agent authentication")
	}
	_ = manager.Disconnect(profile.ID)
}

func TestAuthenticationFailureAndKeepaliveDisconnect(t *testing.T) {
	server, err := testssh.Start(testssh.Options{Root: t.TempDir(), Password: "correct"})
	if err != nil {
		t.Fatal(err)
	}
	defer server.Close()
	paths := managerPaths(t)
	profile := serverProfile(server)
	profile.Auth.AllowPassword = true
	store := bridgeconfig.NewStore(paths)
	profile, err = store.Create(profile)
	if err != nil {
		t.Fatal(err)
	}
	answers := &promptAnswers{trust: true, password: "wrong"}
	manager := newPromptingManager(t, paths, store, answers, nil)
	if _, err := manager.Connect(context.Background(), profile.ID); err == nil {
		t.Fatal("wrong password was accepted")
	}
	status, _ := manager.GetStatus(profile.ID)
	if status.ErrorCode != "AUTHENTICATION_REQUIRED" {
		t.Fatalf("authentication status = %#v", status)
	}

	answers.password = "correct"
	manager = newPromptingManager(t, paths, store, answers, func(config *ManagerConfig) {
		config.KeepaliveInterval = 10 * time.Millisecond
		config.KeepaliveFailures = 1
	})
	if _, err := manager.Connect(context.Background(), profile.ID); err != nil {
		t.Fatal(err)
	}
	server.CloseConnections()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		status, _ = manager.GetStatus(profile.ID)
		if status.State == StateDisconnected && status.ErrorCode == "CONNECTION_LOST" {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("keepalive did not detect disconnect: %#v", status)
}

func TestConnectionHandshakeTimeout(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	accepted := make(chan net.Conn, 1)
	go func() {
		connection, err := listener.Accept()
		if err == nil {
			accepted <- connection
		}
	}()
	host, portText, _ := net.SplitHostPort(listener.Addr().String())
	port, _ := net.LookupPort("tcp", portText)
	paths := managerPaths(t)
	store := bridgeconfig.NewStore(paths)
	profile, err := store.Create(bridgeconfig.Profile{
		Label: "Stalled",
		Host:  host,
		Port:  port,
		User:  "test",
		Auth:  bridgeconfig.AuthProfile{},
	})
	if err != nil {
		t.Fatal(err)
	}
	manager := newPromptingManager(t, paths, store, &promptAnswers{}, func(config *ManagerConfig) {
		config.DialTimeout = 50 * time.Millisecond
	})
	started := time.Now()
	if _, err := manager.Connect(context.Background(), profile.ID); err == nil {
		t.Fatal("stalled handshake succeeded")
	}
	if time.Since(started) > time.Second {
		t.Fatal("stalled handshake did not honor timeout")
	}
	select {
	case connection := <-accepted:
		_ = connection.Close()
	default:
	}
}

func TestChangedHostKeyIsBlocked(t *testing.T) {
	paths := managerPaths(t)
	verifier := NewHostKeyVerifier(paths.KnownHostsFile)
	_, firstPrivate, _ := ed25519.GenerateKey(rand.Reader)
	_, secondPrivate, _ := ed25519.GenerateKey(rand.Reader)
	first, _ := ssh.NewSignerFromKey(firstPrivate)
	second, _ := ssh.NewSignerFromKey(secondPrivate)
	profile := bridgeconfig.Profile{Label: "Changed Host"}
	remote := &net.TCPAddr{IP: net.ParseIP("127.0.0.1"), Port: 2222}
	prompts := 0
	callback := verifier.Callback(context.Background(), profile, func(_ context.Context, _ HostKeyPrompt) (bool, error) {
		prompts++
		return true, nil
	})
	if err := callback("127.0.0.1:2222", remote, first.PublicKey()); err != nil {
		t.Fatal(err)
	}
	err := callback("127.0.0.1:2222", remote, second.PublicKey())
	var changed *HostKeyChangedError
	if !errors.As(err, &changed) {
		t.Fatalf("changed key error = %v", err)
	}
	if prompts != 1 || len(changed.ExpectedFingerprints) != 1 || changed.ReceivedFingerprint == "" {
		t.Fatalf("changed key details = %#v, prompts = %d", changed, prompts)
	}
}
