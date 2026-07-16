package appserver

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"

	"localdraftai/bridge/internal/protocol"
	"localdraftai/bridge/internal/testssh"
)

type testBridge struct {
	server   *Server
	listener net.Listener
	done     chan error
	root     string
}

func startTestBridge(t *testing.T, configure func(*Config)) *testBridge {
	t.Helper()
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "src"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, "assets"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "src", "local_draft_ai.html"), []byte("<!doctype html><title>test</title>"), 0o644); err != nil {
		t.Fatal(err)
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	config := Config{
		ListenAddress:    listener.Addr().String(),
		WebRoot:          root,
		ConfigDir:        filepath.Join(root, "config"),
		OperationTimeout: time.Second,
		SearchTimeout:    time.Second,
	}
	if configure != nil {
		configure(&config)
	}
	server, err := New(config)
	if err != nil {
		listener.Close()
		t.Fatal(err)
	}
	bridge := &testBridge{server: server, listener: listener, done: make(chan error, 1), root: root}
	go func() { bridge.done <- server.Serve(listener) }()
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = server.Shutdown(ctx)
		select {
		case <-bridge.done:
		case <-time.After(2 * time.Second):
			t.Error("bridge did not stop")
		}
	})
	return bridge
}

func exchangeSession(t *testing.T, bridge *testBridge) *http.Cookie {
	t.Helper()
	client := &http.Client{CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
		return http.ErrUseLastResponse
	}}
	response, err := client.Get(bridge.server.StartupURL())
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusSeeOther {
		t.Fatalf("session exchange status = %d", response.StatusCode)
	}
	for _, cookie := range response.Cookies() {
		if cookie.Name == sessionCookieName {
			if !cookie.HttpOnly || cookie.SameSite != http.SameSiteStrictMode {
				t.Fatalf("session cookie flags are not strict: %#v", cookie)
			}
			return cookie
		}
	}
	t.Fatal("session cookie was not set")
	return nil
}

func dialBridge(t *testing.T, bridge *testBridge, cookie *http.Cookie, origin string) *websocket.Conn {
	t.Helper()
	header := http.Header{}
	header.Set("Cookie", cookie.String())
	header.Set("Origin", origin)
	connection, response, err := websocket.Dial(context.Background(), strings.Replace(bridge.server.Origin(), "http://", "ws://", 1)+"/api/bridge", &websocket.DialOptions{
		HTTPHeader: header,
	})
	if err != nil {
		if response != nil {
			response.Body.Close()
		}
		t.Fatal(err)
	}
	return connection
}

func rpcCall(t *testing.T, connection *websocket.Conn, payload string) protocol.Response {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := connection.Write(ctx, websocket.MessageText, []byte(payload)); err != nil {
		t.Fatal(err)
	}
	_, message, err := connection.Read(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var response protocol.Response
	if err := json.Unmarshal(message, &response); err != nil {
		t.Fatal(err)
	}
	return response
}

func TestValidateListenAddress(t *testing.T) {
	if err := ValidateListenAddress("127.0.0.1:4782", false); err != nil {
		t.Fatal(err)
	}
	if err := ValidateListenAddress("[::1]:4782", false); err != nil {
		t.Fatal(err)
	}
	if err := ValidateListenAddress("0.0.0.0:4782", false); err == nil {
		t.Fatal("non-loopback listener was accepted")
	}
	if err := ValidateListenAddress("0.0.0.0:4782", true); err != nil {
		t.Fatal(err)
	}
}

func TestStartupTokenIsOneTimeAndCookieIsRequired(t *testing.T) {
	bridge := startTestBridge(t, nil)
	cookie := exchangeSession(t, bridge)
	client := &http.Client{CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}
	response, err := client.Get(bridge.server.StartupURL())
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != http.StatusUnauthorized {
		t.Fatalf("reused token status = %d", response.StatusCode)
	}

	request := httptest.NewRequest(http.MethodGet, bridge.server.Origin()+"/api/bridge", nil)
	request.Header.Set("Origin", bridge.server.Origin())
	recorder := httptest.NewRecorder()
	bridge.server.Handler().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("missing cookie status = %d", recorder.Code)
	}
	request = httptest.NewRequest(http.MethodGet, bridge.server.Origin()+"/api/bridge", nil)
	request.AddCookie(&http.Cookie{Name: sessionCookieName, Value: "invalid"})
	request.Header.Set("Origin", bridge.server.Origin())
	recorder = httptest.NewRecorder()
	bridge.server.Handler().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("invalid cookie status = %d", recorder.Code)
	}
	_ = cookie
}

func TestWebSocketRejectsMissingAndUnexpectedOrigins(t *testing.T) {
	bridge := startTestBridge(t, nil)
	cookie := exchangeSession(t, bridge)
	for _, origin := range []string{"", "https://localdraft.ai"} {
		request := httptest.NewRequest(http.MethodGet, bridge.server.Origin()+"/api/bridge", nil)
		request.AddCookie(cookie)
		if origin != "" {
			request.Header.Set("Origin", origin)
		}
		recorder := httptest.NewRecorder()
		bridge.server.Handler().ServeHTTP(recorder, request)
		if recorder.Code != http.StatusForbidden {
			t.Fatalf("origin %q status = %d", origin, recorder.Code)
		}
	}
}

func TestBridgeHandshakeErrorsAndLogs(t *testing.T) {
	bridge := startTestBridge(t, nil)
	connection := dialBridge(t, bridge, exchangeSession(t, bridge), bridge.server.Origin())
	defer connection.Close(websocket.StatusNormalClosure, "test complete")

	response := rpcCall(t, connection, `{"jsonrpc":"2.0","id":"hello","method":"bridge.hello","params":{}}`)
	if response.Error != nil {
		t.Fatalf("hello error = %#v", response.Error)
	}
	result := response.Result.(map[string]any)
	if result["protocolVersion"].(float64) != ProtocolVersion {
		t.Fatalf("protocol version = %#v", result["protocolVersion"])
	}

	response = rpcCall(t, connection, `{"jsonrpc":"2.0","id":2,"method":"missing.method"}`)
	if response.Error == nil || response.Error.Code != protocol.MethodNotFoundCode {
		t.Fatalf("unknown method response = %#v", response)
	}
	response = rpcCall(t, connection, `{broken`)
	if response.Error == nil || response.Error.Code != protocol.ParseErrorCode {
		t.Fatalf("parse error response = %#v", response)
	}
	response = rpcCall(t, connection, `{"jsonrpc":"2.0","id":"logs","method":"bridge.getLogs"}`)
	if response.Error != nil {
		t.Fatalf("logs error = %#v", response.Error)
	}
}

func TestMessageLimitClosesConnection(t *testing.T) {
	bridge := startTestBridge(t, func(config *Config) { config.MaximumMessageSize = 128 })
	connection := dialBridge(t, bridge, exchangeSession(t, bridge), bridge.server.Origin())
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	message := `{"jsonrpc":"2.0","id":"large","method":"bridge.hello","params":{"value":"` + strings.Repeat("x", 512) + `"}}`
	if err := connection.Write(ctx, websocket.MessageText, []byte(message)); err != nil {
		t.Fatal(err)
	}
	_, _, err := connection.Read(ctx)
	if err == nil {
		t.Fatal("oversized message did not close the connection")
	}
}

func TestOversizedResponseReturnsStructuredLimitError(t *testing.T) {
	bridge := startTestBridge(t, func(config *Config) { config.MaximumMessageSize = 512 })
	bridge.server.router.Register("test.largeResponse", func(context.Context, json.RawMessage) (any, *protocol.Error) {
		return map[string]string{"value": strings.Repeat("x", 2048)}, nil
	})
	connection := dialBridge(t, bridge, exchangeSession(t, bridge), bridge.server.Origin())
	defer connection.Close(websocket.StatusNormalClosure, "test complete")
	response := rpcCall(t, connection, `{"jsonrpc":"2.0","id":"large-response","method":"test.largeResponse"}`)
	if response.Error == nil || response.Error.Data == nil || response.Error.Data.Code != "FILE_TOO_LARGE" {
		t.Fatalf("oversized response = %#v", response)
	}
}

func TestConcurrentRPCBound(t *testing.T) {
	bridge := startTestBridge(t, func(config *Config) { config.MaximumConcurrent = 2 })
	started := make(chan struct{}, 3)
	release := make(chan struct{}, 3)
	var mu sync.Mutex
	current := 0
	maximum := 0
	bridge.server.router.Register("test.block", func(ctx context.Context, _ json.RawMessage) (any, *protocol.Error) {
		mu.Lock()
		current++
		if current > maximum {
			maximum = current
		}
		mu.Unlock()
		started <- struct{}{}
		select {
		case <-release:
		case <-ctx.Done():
		}
		mu.Lock()
		current--
		mu.Unlock()
		return map[string]bool{"ok": true}, nil
	})
	connection := dialBridge(t, bridge, exchangeSession(t, bridge), bridge.server.Origin())
	defer connection.Close(websocket.StatusNormalClosure, "test complete")
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	for index := 1; index <= 3; index++ {
		message := `{"jsonrpc":"2.0","id":` + string(rune('0'+index)) + `,"method":"test.block"}`
		if err := connection.Write(ctx, websocket.MessageText, []byte(message)); err != nil {
			t.Fatal(err)
		}
	}
	for index := 0; index < 2; index++ {
		select {
		case <-started:
		case <-ctx.Done():
			t.Fatal("RPC did not start")
		}
	}
	select {
	case <-started:
		t.Fatal("third RPC exceeded the concurrency bound")
	case <-time.After(50 * time.Millisecond):
	}
	release <- struct{}{}
	release <- struct{}{}
	for index := 0; index < 2; index++ {
		if _, _, err := connection.Read(ctx); err != nil {
			t.Fatal(err)
		}
	}
	select {
	case <-started:
	case <-ctx.Done():
		t.Fatal("third RPC did not start after capacity was released")
	}
	release <- struct{}{}
	if _, _, err := connection.Read(ctx); err != nil {
		t.Fatal(err)
	}
	mu.Lock()
	defer mu.Unlock()
	if maximum != 2 {
		t.Fatalf("maximum concurrent calls = %d", maximum)
	}
}

func TestHealthStaticFilesAndGracefulShutdown(t *testing.T) {
	bridge := startTestBridge(t, nil)
	response, err := http.Get(bridge.server.Origin() + "/api/health")
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("health status = %d", response.StatusCode)
	}
	response, err = http.Get(bridge.server.Origin() + "/src/local_draft_ai.html")
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("static status = %d", response.StatusCode)
	}
	response, err = http.Get(bridge.server.Origin() + "/go.mod")
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != http.StatusNotFound {
		t.Fatalf("unexpected static exposure status = %d", response.StatusCode)
	}

	connection := dialBridge(t, bridge, exchangeSession(t, bridge), bridge.server.Origin())
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := bridge.server.Shutdown(ctx); err != nil {
		t.Fatal(err)
	}
	_, _, err = connection.Read(ctx)
	if err == nil {
		t.Fatalf("websocket was not closed during shutdown: %v", err)
	}
}

func TestProfileAndPromptedSSHConnectionRPC(t *testing.T) {
	sshServer, err := testssh.Start(testssh.Options{Root: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	defer sshServer.Close()
	identityPath := filepath.Join(t.TempDir(), "id_ed25519")
	if err := sshServer.WriteIdentityFile(identityPath, nil); err != nil {
		t.Fatal(err)
	}
	host, portText, _ := net.SplitHostPort(sshServer.Address)
	port, _ := strconv.Atoi(portText)
	bridge := startTestBridge(t, nil)
	connection := dialBridge(t, bridge, exchangeSession(t, bridge), bridge.server.Origin())
	defer connection.Close(websocket.StatusNormalClosure, "test complete")
	secretProfileResponse := rpcCall(t, connection, `{"jsonrpc":"2.0","id":"secret-profile","method":"profile.create","params":{"profile":{"label":"Unsafe","host":"127.0.0.1","user":"test","auth":{"password":"must-not-store"}}}}`)
	if secretProfileResponse.Error == nil || secretProfileResponse.Error.Code != protocol.InvalidParamsCode {
		t.Fatalf("secret profile fields were accepted: %#v", secretProfileResponse)
	}
	createPayload, _ := json.Marshal(map[string]any{
		"jsonrpc": "2.0",
		"id":      "create-profile",
		"method":  "profile.create",
		"params": map[string]any{
			"profile": map[string]any{
				"label": "RPC SSH",
				"host":  host,
				"port":  port,
				"user":  sshServer.User,
				"auth": map[string]any{
					"useAgent":      false,
					"identityFile":  identityPath,
					"allowPassword": false,
				},
			},
		},
	})
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := connection.Write(ctx, websocket.MessageText, createPayload); err != nil {
		t.Fatal(err)
	}
	_, payload, err := connection.Read(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var createResponse struct {
		Result struct {
			Profile struct {
				ID string `json:"id"`
			} `json:"profile"`
		} `json:"result"`
		Error *protocol.Error `json:"error"`
	}
	if err := json.Unmarshal(payload, &createResponse); err != nil {
		t.Fatal(err)
	}
	if createResponse.Error != nil || createResponse.Result.Profile.ID == "" {
		t.Fatalf("create response = %s", payload)
	}
	connectionID := createResponse.Result.Profile.ID
	connectPayload, _ := json.Marshal(map[string]any{
		"jsonrpc": "2.0",
		"id":      "connect",
		"method":  "connection.connect",
		"params":  map[string]string{"connectionId": connectionID},
	})
	if err := connection.Write(ctx, websocket.MessageText, connectPayload); err != nil {
		t.Fatal(err)
	}
	connected := false
	hostPrompted := false
	trustResponded := false
	for !connected || !trustResponded {
		_, payload, err = connection.Read(ctx)
		if err != nil {
			t.Fatal(err)
		}
		var message struct {
			ID     json.RawMessage `json:"id"`
			Method string          `json:"method"`
			Params map[string]any  `json:"params"`
			Result map[string]any  `json:"result"`
			Error  *protocol.Error `json:"error"`
		}
		if err := json.Unmarshal(payload, &message); err != nil {
			t.Fatal(err)
		}
		if message.Method == "connection.hostKeyPrompt" {
			hostPrompted = true
			promptID, _ := message.Params["promptId"].(string)
			responsePayload, _ := json.Marshal(map[string]any{
				"jsonrpc": "2.0",
				"id":      "trust",
				"method":  "connection.respondToPrompt",
				"params":  map[string]any{"promptId": promptID, "trust": true},
			})
			if err := connection.Write(ctx, websocket.MessageText, responsePayload); err != nil {
				t.Fatal(err)
			}
			continue
		}
		if string(message.ID) == `"connect"` {
			if message.Error != nil || message.Result["state"] != "connected" {
				t.Fatalf("connect response = %s", payload)
			}
			connected = true
		}
		if string(message.ID) == `"trust"` {
			if message.Error != nil {
				t.Fatalf("trust response = %s", payload)
			}
			trustResponded = true
		}
	}
	if !hostPrompted {
		t.Fatal("connection did not request first-use host trust")
	}
	homeResponse := rpcCall(t, connection, `{"jsonrpc":"2.0","id":"home","method":"remote.getHomeDirectory","params":{"connectionId":"`+connectionID+`"}}`)
	if homeResponse.Error != nil {
		t.Fatalf("home response = %#v", homeResponse)
	}
	if err := bridge.server.sshManager.Disconnect(connectionID); err != nil {
		t.Fatal(err)
	}
}
