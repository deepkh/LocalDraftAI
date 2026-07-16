package appserver

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"

	"localdraftai/bridge/internal/protocol"
)

type notification struct {
	JSONRPC string `json:"jsonrpc"`
	Method  string `json:"method"`
	Params  any    `json:"params"`
}

func (s *Server) broadcastNotification(method string, params any) {
	payload, err := json.Marshal(notification{JSONRPC: protocol.Version, Method: method, Params: params})
	if err != nil || int64(len(payload)) > s.config.MaximumMessageSize {
		return
	}
	s.connectionMu.Lock()
	type target struct {
		connection *websocket.Conn
		writes     *sync.Mutex
	}
	targets := make([]target, 0, len(s.connections))
	for connection, writes := range s.connections {
		targets = append(targets, target{connection: connection, writes: writes})
	}
	s.connectionMu.Unlock()
	for _, target := range targets {
		target.writes.Lock()
		writeContext, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		_ = target.connection.Write(writeContext, websocket.MessageText, payload)
		cancel()
		target.writes.Unlock()
	}
}

func (s *Server) handleWebSocket(response http.ResponseWriter, request *http.Request) {
	if !s.sessions.validRequest(request) {
		http.Error(response, "Bridge session required", http.StatusUnauthorized)
		return
	}
	if request.Header.Get("Origin") != s.origin {
		http.Error(response, "Unexpected WebSocket origin", http.StatusForbidden)
		return
	}
	connection, err := websocket.Accept(response, request, &websocket.AcceptOptions{
		OriginPatterns: []string{request.Host},
	})
	if err != nil {
		return
	}
	connection.SetReadLimit(s.config.MaximumMessageSize)
	writes := &sync.Mutex{}
	s.connectionMu.Lock()
	s.connections[connection] = writes
	s.connectionMu.Unlock()
	s.logs.Append("info", "websocket", "browser bridge session connected")
	defer func() {
		s.connectionMu.Lock()
		delete(s.connections, connection)
		s.connectionMu.Unlock()
		_ = connection.Close(websocket.StatusNormalClosure, "bridge session closed")
		s.logs.Append("info", "websocket", "browser bridge session disconnected")
	}()
	s.serveWebSocket(request.Context(), connection, writes)
}

func (s *Server) serveWebSocket(ctx context.Context, connection *websocket.Conn, writes *sync.Mutex) {
	semaphore := make(chan struct{}, s.config.MaximumConcurrent)
	var calls sync.WaitGroup
	defer calls.Wait()

	writeResponse := func(response protocol.Response) {
		payload, err := json.Marshal(response)
		if err != nil {
			return
		}
		if int64(len(payload)) > s.config.MaximumMessageSize {
			payload, err = json.Marshal(protocol.Failure(response.ID, protocol.NewStorageError(
				-32020,
				"FILE_TOO_LARGE",
				"The bridge response exceeds the JSON message limit.",
				false,
				nil,
			)))
			if err != nil || int64(len(payload)) > s.config.MaximumMessageSize {
				return
			}
		}
		writes.Lock()
		defer writes.Unlock()
		writeContext, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = connection.Write(writeContext, websocket.MessageText, payload)
	}

	for {
		messageType, payload, err := connection.Read(ctx)
		if err != nil {
			return
		}
		if messageType != websocket.MessageText {
			_ = connection.Close(websocket.StatusUnsupportedData, "JSON text messages required")
			return
		}
		var request protocol.Request
		if err := json.Unmarshal(payload, &request); err != nil {
			writeResponse(protocol.Failure(nil, protocol.NewError(protocol.ParseErrorCode, "Parse error")))
			continue
		}
		if !request.Valid() {
			writeResponse(protocol.Failure(request.ID, protocol.NewError(protocol.InvalidRequestCode, "Invalid Request")))
			continue
		}

		semaphore <- struct{}{}
		calls.Add(1)
		go func(request protocol.Request) {
			defer calls.Done()
			defer func() { <-semaphore }()
			defer func() {
				for index := range request.Params {
					request.Params[index] = 0
				}
			}()
			timeout := s.config.OperationTimeout
			if request.Method == "fs.searchText" {
				timeout = s.config.SearchTimeout
			}
			callContext, cancel := context.WithTimeout(ctx, timeout)
			defer cancel()
			result, rpcError := s.router.Handle(callContext, request)
			if request.IsNotification() {
				return
			}
			if rpcError != nil {
				writeResponse(protocol.Failure(request.ID, rpcError))
				return
			}
			writeResponse(protocol.Success(request.ID, result))
		}(request)
	}
}
