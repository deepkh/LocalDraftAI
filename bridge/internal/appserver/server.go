package appserver

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"

	"localdraftai/bridge/internal/logbuffer"
	"localdraftai/bridge/internal/protocol"
)

const (
	BridgeVersion             = "0.1.0"
	ProtocolVersion           = 1
	DefaultListenAddress      = "127.0.0.1:4782"
	DefaultMaximumMessageSize = int64(16 << 20)
	DefaultMaximumConcurrent  = 8
)

type Config struct {
	ListenAddress      string
	WebRoot            string
	ConfigDir          string
	UnsafeNonLoopback  bool
	MaximumMessageSize int64
	MaximumConcurrent  int
	OperationTimeout   time.Duration
	SearchTimeout      time.Duration
	SessionLifetime    time.Duration
}

type Server struct {
	config       Config
	httpServer   *http.Server
	handler      http.Handler
	router       *protocol.Router
	logs         *logbuffer.Buffer
	sessions     *sessionStore
	startupToken string
	origin       string
	startedAt    time.Time
	connections  map[*websocket.Conn]struct{}
	connectionMu sync.Mutex
}

func New(config Config) (*Server, error) {
	if config.ListenAddress == "" {
		config.ListenAddress = DefaultListenAddress
	}
	if err := ValidateListenAddress(config.ListenAddress, config.UnsafeNonLoopback); err != nil {
		return nil, err
	}
	if config.WebRoot == "" {
		config.WebRoot = "."
	}
	if config.MaximumMessageSize <= 0 {
		config.MaximumMessageSize = DefaultMaximumMessageSize
	}
	if config.MaximumConcurrent <= 0 {
		config.MaximumConcurrent = DefaultMaximumConcurrent
	}
	if config.OperationTimeout <= 0 {
		config.OperationTimeout = 30 * time.Second
	}
	if config.SearchTimeout <= 0 {
		config.SearchTimeout = 120 * time.Second
	}
	if config.SessionLifetime <= 0 {
		config.SessionLifetime = 12 * time.Hour
	}

	startupToken, err := randomToken(32)
	if err != nil {
		return nil, fmt.Errorf("generate startup token: %w", err)
	}
	static, err := staticHandler(config.WebRoot)
	if err != nil {
		return nil, fmt.Errorf("configure static frontend: %w", err)
	}
	origin := "http://" + config.ListenAddress
	server := &Server{
		config:       config,
		logs:         logbuffer.New(200),
		router:       protocol.NewRouter(),
		sessions:     newSessionStore(startupToken, config.SessionLifetime),
		startupToken: startupToken,
		origin:       origin,
		startedAt:    time.Now().UTC(),
		connections:  make(map[*websocket.Conn]struct{}),
	}
	server.registerBridgeHandlers()

	mux := http.NewServeMux()
	mux.HandleFunc("/api/session", server.handleSession)
	mux.HandleFunc("/api/health", server.handleHealth)
	mux.HandleFunc("/api/bridge", server.handleWebSocket)
	mux.Handle("/", static)
	server.handler = securityHeaders(mux)
	server.httpServer = &http.Server{
		Handler:           server.handler,
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	return server, nil
}

func ValidateListenAddress(address string, unsafeNonLoopback bool) error {
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return fmt.Errorf("invalid listen address: %w", err)
	}
	loopback := strings.EqualFold(host, "localhost")
	if ip := net.ParseIP(host); ip != nil {
		loopback = ip.IsLoopback()
	}
	if !loopback && !unsafeNonLoopback {
		return errors.New("refusing non-loopback listen address without --unsafe-non-loopback")
	}
	return nil
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		response.Header().Set("Cache-Control", "no-store")
		response.Header().Set("Referrer-Policy", "no-referrer")
		response.Header().Set("X-Content-Type-Options", "nosniff")
		next.ServeHTTP(response, request)
	})
}

func (s *Server) Handler() http.Handler {
	return s.handler
}

func (s *Server) StartupToken() string {
	return s.startupToken
}

func (s *Server) StartupURL() string {
	return s.origin + "/api/session?token=" + url.QueryEscape(s.startupToken)
}

func (s *Server) Origin() string {
	return s.origin
}

func (s *Server) Serve(listener net.Listener) error {
	s.logs.Append("info", "bridge", "bridge server started")
	err := s.httpServer.Serve(listener)
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}

func (s *Server) Shutdown(ctx context.Context) error {
	s.connectionMu.Lock()
	connections := make([]*websocket.Conn, 0, len(s.connections))
	for connection := range s.connections {
		connections = append(connections, connection)
	}
	s.connectionMu.Unlock()
	for _, connection := range connections {
		_ = connection.CloseNow()
	}
	s.logs.Append("info", "bridge", "bridge server stopped")
	return s.httpServer.Shutdown(ctx)
}

func (s *Server) registerBridgeHandlers() {
	s.router.Register("bridge.hello", func(_ context.Context, _ json.RawMessage) (any, *protocol.Error) {
		return map[string]any{
			"protocolVersion": ProtocolVersion,
			"bridgeVersion":   BridgeVersion,
			"capabilities": map[string]bool{
				"ssh":          true,
				"sftp":         true,
				"remoteSearch": true,
				"binaryAssets": false,
			},
		}, nil
	})
	s.router.Register("bridge.getStatus", func(_ context.Context, _ json.RawMessage) (any, *protocol.Error) {
		return map[string]any{
			"bridgeVersion":   BridgeVersion,
			"protocolVersion": ProtocolVersion,
			"status":          "ready",
			"startedAt":       s.startedAt,
		}, nil
	})
	s.router.Register("bridge.getLogs", func(_ context.Context, _ json.RawMessage) (any, *protocol.Error) {
		return map[string]any{"entries": s.logs.Entries()}, nil
	})
}

func (s *Server) handleHealth(response http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		response.Header().Set("Allow", http.MethodGet)
		http.Error(response, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	response.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(response).Encode(map[string]any{
		"status":          "ok",
		"bridgeVersion":   BridgeVersion,
		"protocolVersion": ProtocolVersion,
	})
}
