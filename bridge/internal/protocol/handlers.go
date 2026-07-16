package protocol

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"path"
	"strings"
	"sync"

	bridgeconfig "localdraftai/bridge/internal/config"
	"localdraftai/bridge/internal/sshconn"
)

type Handler func(context.Context, json.RawMessage) (any, *Error)

type Router struct {
	mu       sync.RWMutex
	handlers map[string]Handler
}

func RegisterSSHHandlers(router *Router, store *bridgeconfig.Store, paths bridgeconfig.Paths, manager *sshconn.Manager) {
	router.Register("profile.list", func(_ context.Context, _ json.RawMessage) (any, *Error) {
		profiles, err := store.List()
		if err != nil {
			return nil, internalStorageError(err)
		}
		return map[string]any{"profiles": profiles}, nil
	})
	router.Register("profile.listOpenSSHHosts", func(_ context.Context, _ json.RawMessage) (any, *Error) {
		profiles, err := bridgeconfig.ListOpenSSHHosts(paths.OpenSSHConfig)
		if err != nil {
			return nil, internalStorageError(err)
		}
		return map[string]any{"profiles": profiles}, nil
	})
	router.Register("profile.create", func(_ context.Context, params json.RawMessage) (any, *Error) {
		var request struct {
			Profile bridgeconfig.Profile `json:"profile"`
		}
		if err := decodeParams(params, &request); err != nil {
			return nil, NewError(InvalidParamsCode, err.Error())
		}
		profile, err := store.Create(request.Profile)
		if err != nil {
			return nil, NewStorageError(-32010, "INVALID_PATH", err.Error(), false, nil)
		}
		return map[string]any{"profile": profile}, nil
	})
	router.Register("profile.update", func(_ context.Context, params json.RawMessage) (any, *Error) {
		var request struct {
			Profile bridgeconfig.Profile `json:"profile"`
		}
		if err := decodeParams(params, &request); err != nil {
			return nil, NewError(InvalidParamsCode, err.Error())
		}
		profile, err := store.Update(request.Profile)
		if err != nil {
			return nil, NewStorageError(-32010, "RESOURCE_NOT_FOUND", err.Error(), false, nil)
		}
		return map[string]any{"profile": profile}, nil
	})
	router.Register("profile.remove", func(_ context.Context, params json.RawMessage) (any, *Error) {
		var request struct {
			ConnectionID string `json:"connectionId"`
		}
		if err := decodeParams(params, &request); err != nil || request.ConnectionID == "" {
			return nil, NewError(InvalidParamsCode, "connectionId is required")
		}
		_ = manager.Disconnect(request.ConnectionID)
		if err := store.Remove(request.ConnectionID); err != nil {
			return nil, NewStorageError(-32010, "RESOURCE_NOT_FOUND", err.Error(), false, nil)
		}
		return map[string]bool{"removed": true}, nil
	})
	router.Register("connection.connect", func(ctx context.Context, params json.RawMessage) (any, *Error) {
		connectionID, rpcError := connectionIDParam(params)
		if rpcError != nil {
			return nil, rpcError
		}
		status, err := manager.Connect(ctx, connectionID)
		if err != nil {
			code, message, retryable, details := sshconn.ErrorInfo(err)
			return nil, NewStorageError(-32010, code, message, retryable, details)
		}
		return status, nil
	})
	router.Register("connection.respondToPrompt", func(_ context.Context, params json.RawMessage) (any, *Error) {
		var request struct {
			PromptID string `json:"promptId"`
			Secret   string `json:"secret"`
			Trust    bool   `json:"trust"`
			Cancel   bool   `json:"cancel"`
		}
		if err := decodeParams(params, &request); err != nil || request.PromptID == "" {
			request.Secret = ""
			return nil, NewError(InvalidParamsCode, "promptId is required")
		}
		err := manager.RespondToPrompt(request.PromptID, sshconn.PromptResponse{
			Secret: request.Secret,
			Trust:  request.Trust,
			Cancel: request.Cancel,
		})
		request.Secret = ""
		if err != nil {
			return nil, NewStorageError(-32010, "AUTHENTICATION_REQUIRED", err.Error(), false, nil)
		}
		return map[string]bool{"accepted": true}, nil
	})
	router.Register("connection.disconnect", func(_ context.Context, params json.RawMessage) (any, *Error) {
		connectionID, rpcError := connectionIDParam(params)
		if rpcError != nil {
			return nil, rpcError
		}
		if err := manager.Disconnect(connectionID); err != nil {
			return nil, NewStorageError(-32010, "CONNECTION_LOST", err.Error(), true, nil)
		}
		status, _ := manager.GetStatus(connectionID)
		return status, nil
	})
	router.Register("connection.getStatus", func(_ context.Context, params json.RawMessage) (any, *Error) {
		connectionID, rpcError := connectionIDParam(params)
		if rpcError != nil {
			return nil, rpcError
		}
		status, _ := manager.GetStatus(connectionID)
		return status, nil
	})
	router.Register("connection.reconnect", func(ctx context.Context, params json.RawMessage) (any, *Error) {
		connectionID, rpcError := connectionIDParam(params)
		if rpcError != nil {
			return nil, rpcError
		}
		status, err := manager.Reconnect(ctx, connectionID)
		if err != nil {
			code, message, retryable, details := sshconn.ErrorInfo(err)
			return nil, NewStorageError(-32010, code, message, retryable, details)
		}
		return status, nil
	})
	router.Register("remote.getHomeDirectory", func(_ context.Context, params json.RawMessage) (any, *Error) {
		connectionID, rpcError := connectionIDParam(params)
		if rpcError != nil {
			return nil, rpcError
		}
		client, err := manager.SFTP(connectionID)
		if err != nil {
			return nil, NewStorageError(-32010, "CONNECTION_LOST", err.Error(), true, nil)
		}
		home, err := client.RealPath(".")
		if err != nil {
			return nil, NewStorageError(-32010, "PERMISSION_DENIED", "Could not read the remote home directory.", false, nil)
		}
		return map[string]string{"path": home}, nil
	})
	router.Register("remote.listAbsoluteDirectory", func(ctx context.Context, params json.RawMessage) (any, *Error) {
		var request struct {
			ConnectionID string `json:"connectionId"`
			Path         string `json:"path"`
		}
		if err := decodeParams(params, &request); err != nil || request.ConnectionID == "" || !strings.HasPrefix(request.Path, "/") || strings.Contains(request.Path, `\`) {
			return nil, NewError(InvalidParamsCode, "connectionId and an absolute POSIX path are required")
		}
		client, err := manager.SFTP(request.ConnectionID)
		if err != nil {
			return nil, NewStorageError(-32010, "CONNECTION_LOST", err.Error(), true, nil)
		}
		canonical, err := client.RealPath(request.Path)
		if err != nil {
			return nil, NewStorageError(-32010, "RESOURCE_NOT_FOUND", "The remote directory was not found.", false, nil)
		}
		entries, err := client.ReadDir(canonical)
		if err != nil {
			return nil, NewStorageError(-32010, "PERMISSION_DENIED", "Could not list the remote directory.", false, nil)
		}
		directories := make([]map[string]string, 0)
		for _, entry := range entries {
			if err := ctx.Err(); err != nil {
				return nil, NewStorageError(-32010, "CONNECTION_LOST", "The directory listing was cancelled.", true, nil)
			}
			if !entry.IsDir() || entry.Name() == "." || entry.Name() == ".." {
				continue
			}
			if len(directories) >= 5000 {
				return nil, NewStorageError(-32010, "FILE_TOO_LARGE", "The directory contains too many entries.", false, nil)
			}
			directories = append(directories, map[string]string{
				"name": entry.Name(),
				"path": path.Join(canonical, entry.Name()),
			})
		}
		return map[string]any{"path": canonical, "entries": directories}, nil
	})
}

func decodeParams(params json.RawMessage, target any) error {
	if len(params) == 0 {
		params = json.RawMessage("{}")
	}
	decoder := json.NewDecoder(bytes.NewReader(params))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return errors.New("only one params object is allowed")
	}
	return nil
}

func connectionIDParam(params json.RawMessage) (string, *Error) {
	var request struct {
		ConnectionID string `json:"connectionId"`
	}
	if err := decodeParams(params, &request); err != nil || request.ConnectionID == "" {
		return "", NewError(InvalidParamsCode, "connectionId is required")
	}
	return request.ConnectionID, nil
}

func internalStorageError(err error) *Error {
	return NewStorageError(-32010, "PROVIDER_UNAVAILABLE", err.Error(), false, nil)
}

func NewRouter() *Router {
	return &Router{handlers: make(map[string]Handler)}
}

func (r *Router) Register(method string, handler Handler) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if method == "" || handler == nil {
		panic("protocol: method and handler are required")
	}
	if _, exists := r.handlers[method]; exists {
		panic("protocol: duplicate method " + method)
	}
	r.handlers[method] = handler
}

func (r *Router) Handle(ctx context.Context, request Request) (any, *Error) {
	r.mu.RLock()
	handler := r.handlers[request.Method]
	r.mu.RUnlock()
	if handler == nil {
		return nil, NewError(MethodNotFoundCode, "Method not found")
	}
	return handler(ctx, request.Params)
}
