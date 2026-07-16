package protocol

import (
	"context"
	"encoding/json"
	"sync"
)

type Handler func(context.Context, json.RawMessage) (any, *Error)

type Router struct {
	mu       sync.RWMutex
	handlers map[string]Handler
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
