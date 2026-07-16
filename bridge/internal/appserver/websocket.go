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
	s.connectionMu.Lock()
	s.connections[connection] = struct{}{}
	s.connectionMu.Unlock()
	s.logs.Append("info", "websocket", "browser bridge session connected")
	defer func() {
		s.connectionMu.Lock()
		delete(s.connections, connection)
		s.connectionMu.Unlock()
		_ = connection.Close(websocket.StatusNormalClosure, "bridge session closed")
		s.logs.Append("info", "websocket", "browser bridge session disconnected")
	}()
	s.serveWebSocket(request.Context(), connection)
}

func (s *Server) serveWebSocket(ctx context.Context, connection *websocket.Conn) {
	semaphore := make(chan struct{}, s.config.MaximumConcurrent)
	var writes sync.Mutex
	var calls sync.WaitGroup
	defer calls.Wait()

	writeResponse := func(response protocol.Response) {
		payload, err := json.Marshal(response)
		if err != nil {
			return
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
