package remotefs

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"path"
	"strings"
	"sync"
	"time"

	"github.com/pkg/sftp"
)

const (
	MaximumTextFileSize  = int64(10 << 20)
	MaximumDirectorySize = 5000
)

type ClientProvider interface {
	SFTP(connectionID string) (*sftp.Client, error)
}

type Error struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	Retryable bool   `json:"retryable"`
	Details   any    `json:"details,omitempty"`
	Cause     error  `json:"-"`
}

func (e *Error) Error() string {
	return e.Message
}

func (e *Error) Unwrap() error {
	return e.Cause
}

type Service struct {
	clients    ClientProvider
	mu         sync.RWMutex
	workspaces map[string]Workspace
}

func NewService(clients ClientProvider) *Service {
	return &Service{clients: clients, workspaces: make(map[string]Workspace)}
}

func (s *Service) OpenWorkspace(ctx context.Context, connectionID, absolutePath string) (Workspace, error) {
	if strings.TrimSpace(connectionID) == "" {
		return Workspace{}, invalidPath("connectionId is required")
	}
	if err := validateAbsolutePath(absolutePath); err != nil {
		return Workspace{}, err
	}
	client, err := s.clients.SFTP(connectionID)
	if err != nil {
		return Workspace{}, connectionLost(err)
	}
	if err := ctx.Err(); err != nil {
		return Workspace{}, connectionLost(err)
	}
	canonical, err := client.RealPath(path.Clean(absolutePath))
	if err != nil {
		return Workspace{}, mapFilesystemError(err, "The remote folder was not found.")
	}
	if err := validateAbsolutePath(canonical); err != nil {
		return Workspace{}, invalidPath("The remote server returned an invalid canonical path.")
	}
	canonical, err = resolveSymlinks(client, canonical)
	if err != nil {
		return Workspace{}, err
	}
	info, err := client.Stat(canonical)
	if err != nil {
		return Workspace{}, mapFilesystemError(err, "The remote folder was not found.")
	}
	if !info.IsDir() {
		return Workspace{}, &Error{Code: "INVALID_PATH", Message: "The remote workspace root must be a directory."}
	}
	id, err := randomWorkspaceID()
	if err != nil {
		return Workspace{}, &Error{Code: "PROVIDER_UNAVAILABLE", Message: "Could not create the remote workspace.", Cause: err}
	}
	name := path.Base(canonical)
	if canonical == "/" || name == "." {
		name = canonical
	}
	workspace := Workspace{
		ID:           "remote-workspace-" + id,
		ConnectionID: connectionID,
		RootPath:     canonical,
		Name:         name,
	}
	s.mu.Lock()
	s.workspaces[workspace.ID] = workspace
	s.mu.Unlock()
	return workspace, nil
}

func (s *Service) CloseWorkspace(workspaceID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, found := s.workspaces[workspaceID]; !found {
		return &Error{Code: "RESOURCE_NOT_FOUND", Message: "The remote workspace was not found."}
	}
	delete(s.workspaces, workspaceID)
	return nil
}

func (s *Service) Workspace(workspaceID string) (Workspace, error) {
	s.mu.RLock()
	workspace, found := s.workspaces[workspaceID]
	s.mu.RUnlock()
	if !found {
		return Workspace{}, &Error{Code: "RESOURCE_NOT_FOUND", Message: "The remote workspace was not found."}
	}
	return workspace, nil
}

func (s *Service) GetStatus(ctx context.Context, workspaceID string) (Status, error) {
	workspace, err := s.Workspace(workspaceID)
	if err != nil {
		return Status{}, err
	}
	client, err := s.clients.SFTP(workspace.ConnectionID)
	if err != nil {
		return Status{}, connectionLost(err)
	}
	if err := ctx.Err(); err != nil {
		return Status{}, connectionLost(err)
	}
	if _, err := client.Stat(workspace.RootPath); err != nil {
		return Status{}, mapFilesystemError(err, "The remote workspace is unavailable.")
	}
	return Status{Workspace: workspace, Available: true, CheckedAt: time.Now().UTC()}, nil
}

func (s *Service) clientAndWorkspace(workspaceID string) (*sftp.Client, Workspace, error) {
	workspace, err := s.Workspace(workspaceID)
	if err != nil {
		return nil, Workspace{}, err
	}
	client, err := s.clients.SFTP(workspace.ConnectionID)
	if err != nil {
		return nil, Workspace{}, connectionLost(err)
	}
	return client, workspace, nil
}

func randomWorkspaceID() (string, error) {
	value := make([]byte, 16)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return hex.EncodeToString(value), nil
}

func invalidPath(message string) *Error {
	return &Error{Code: "INVALID_PATH", Message: message}
}

func connectionLost(err error) *Error {
	return &Error{Code: "CONNECTION_LOST", Message: "The SSH connection is unavailable.", Retryable: true, Cause: err}
}

func mapFilesystemError(err error, fallback string) *Error {
	var statusError *sftp.StatusError

	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return connectionLost(err)
	}
	if errors.As(err, &statusError) {
		switch statusError.FxCode() {
		case sftp.ErrSSHFxNoSuchFile:
			return &Error{Code: "RESOURCE_NOT_FOUND", Message: fallback, Cause: err}
		case sftp.ErrSSHFxPermissionDenied:
			return &Error{Code: "PERMISSION_DENIED", Message: fallback, Cause: err}
		case sftp.ErrSSHFxNoConnection, sftp.ErrSSHFxConnectionLost:
			return connectionLost(err)
		case sftp.ErrSSHFxOpUnsupported:
			return &Error{Code: "OPERATION_UNSUPPORTED", Message: fallback, Cause: err}
		}
	}
	if errors.Is(err, errors.ErrUnsupported) {
		return &Error{Code: "OPERATION_UNSUPPORTED", Message: fallback, Cause: err}
	}
	if isNotExist(err) {
		return &Error{Code: "RESOURCE_NOT_FOUND", Message: fallback, Cause: err}
	}
	if isPermission(err) {
		return &Error{Code: "PERMISSION_DENIED", Message: fallback, Cause: err}
	}
	return &Error{Code: "PROVIDER_UNAVAILABLE", Message: fallback, Cause: err}
}
