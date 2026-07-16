package testssh

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/subtle"
	"encoding/pem"
	"errors"
	"net"
	"os"
	"path/filepath"
	"sync"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

type Options struct {
	Root        string
	User        string
	Password    string
	HostKey     ed25519.PrivateKey
	UserKey     ed25519.PrivateKey
	DisableSFTP bool
}

type Server struct {
	Address        string
	Root           string
	User           string
	Password       string
	HostSigner     ssh.Signer
	UserSigner     ssh.Signer
	UserPrivateKey ed25519.PrivateKey
	listener       net.Listener
	disableSFTP    bool
	mu             sync.Mutex
	connections    map[*ssh.ServerConn]struct{}
	wait           sync.WaitGroup
}

func Start(options Options) (*Server, error) {
	if options.Root == "" {
		root, err := os.MkdirTemp("", "localdraft-test-ssh-")
		if err != nil {
			return nil, err
		}
		options.Root = root
	}
	if options.User == "" {
		options.User = "testuser"
	}
	if options.Password == "" {
		options.Password = "test-password"
	}
	if len(options.HostKey) == 0 {
		_, privateKey, err := ed25519.GenerateKey(rand.Reader)
		if err != nil {
			return nil, err
		}
		options.HostKey = privateKey
	}
	if len(options.UserKey) == 0 {
		_, privateKey, err := ed25519.GenerateKey(rand.Reader)
		if err != nil {
			return nil, err
		}
		options.UserKey = privateKey
	}
	hostSigner, err := ssh.NewSignerFromKey(options.HostKey)
	if err != nil {
		return nil, err
	}
	userSigner, err := ssh.NewSignerFromKey(options.UserKey)
	if err != nil {
		return nil, err
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, err
	}
	server := &Server{
		Address:        listener.Addr().String(),
		Root:           options.Root,
		User:           options.User,
		Password:       options.Password,
		HostSigner:     hostSigner,
		UserSigner:     userSigner,
		UserPrivateKey: options.UserKey,
		listener:       listener,
		disableSFTP:    options.DisableSFTP,
		connections:    make(map[*ssh.ServerConn]struct{}),
	}
	server.wait.Add(1)
	go server.acceptLoop()
	return server, nil
}

func (s *Server) acceptLoop() {
	defer s.wait.Done()
	for {
		connection, err := s.listener.Accept()
		if err != nil {
			return
		}
		s.wait.Add(1)
		go s.handleConnection(connection)
	}
}

func (s *Server) handleConnection(networkConnection net.Conn) {
	defer s.wait.Done()
	config := &ssh.ServerConfig{
		PublicKeyCallback: func(metadata ssh.ConnMetadata, key ssh.PublicKey) (*ssh.Permissions, error) {
			if metadata.User() == s.User && subtle.ConstantTimeCompare(key.Marshal(), s.UserSigner.PublicKey().Marshal()) == 1 {
				return nil, nil
			}
			return nil, errors.New("public key rejected")
		},
		PasswordCallback: func(metadata ssh.ConnMetadata, password []byte) (*ssh.Permissions, error) {
			if metadata.User() == s.User && subtle.ConstantTimeCompare(password, []byte(s.Password)) == 1 {
				return nil, nil
			}
			return nil, errors.New("password rejected")
		},
	}
	config.AddHostKey(s.HostSigner)
	serverConnection, channels, requests, err := ssh.NewServerConn(networkConnection, config)
	if err != nil {
		_ = networkConnection.Close()
		return
	}
	s.mu.Lock()
	s.connections[serverConnection] = struct{}{}
	s.mu.Unlock()
	defer func() {
		s.mu.Lock()
		delete(s.connections, serverConnection)
		s.mu.Unlock()
		_ = serverConnection.Close()
	}()
	go func() {
		for request := range requests {
			if request.WantReply {
				_ = request.Reply(request.Type == "keepalive@openssh.com", nil)
			}
		}
	}()
	for newChannel := range channels {
		if newChannel.ChannelType() != "session" {
			_ = newChannel.Reject(ssh.UnknownChannelType, "session channels only")
			continue
		}
		channel, channelRequests, err := newChannel.Accept()
		if err != nil {
			continue
		}
		s.wait.Add(1)
		go s.handleSession(channel, channelRequests)
	}
}

func (s *Server) handleSession(channel ssh.Channel, requests <-chan *ssh.Request) {
	defer s.wait.Done()
	defer channel.Close()
	for request := range requests {
		if request.Type != "subsystem" || s.disableSFTP {
			if request.WantReply {
				_ = request.Reply(false, nil)
			}
			continue
		}
		var subsystem struct{ Name string }
		if err := ssh.Unmarshal(request.Payload, &subsystem); err != nil || subsystem.Name != "sftp" {
			if request.WantReply {
				_ = request.Reply(false, nil)
			}
			continue
		}
		if request.WantReply {
			_ = request.Reply(true, nil)
		}
		server, err := sftp.NewServer(channel, sftp.WithServerWorkingDirectory(s.Root))
		if err != nil {
			return
		}
		_ = server.Serve()
		_ = server.Close()
		return
	}
}

func (s *Server) WriteIdentityFile(path string, passphrase []byte) error {
	var block *pem.Block
	var err error
	if len(passphrase) > 0 {
		block, err = ssh.MarshalPrivateKeyWithPassphrase(s.UserPrivateKey, "localdraft-test", passphrase)
	} else {
		block, err = ssh.MarshalPrivateKey(s.UserPrivateKey, "localdraft-test")
	}
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	return os.WriteFile(path, pem.EncodeToMemory(block), 0o600)
}

func (s *Server) CloseConnections() {
	s.mu.Lock()
	connections := make([]*ssh.ServerConn, 0, len(s.connections))
	for connection := range s.connections {
		connections = append(connections, connection)
	}
	s.mu.Unlock()
	for _, connection := range connections {
		_ = connection.Close()
	}
}

func (s *Server) Close() error {
	err := s.listener.Close()
	s.CloseConnections()
	s.wait.Wait()
	if errors.Is(err, net.ErrClosed) {
		return nil
	}
	return err
}
