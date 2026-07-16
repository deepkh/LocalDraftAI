package protocol

import (
	"context"
	"encoding/json"
	"errors"

	"localdraftai/bridge/internal/remotefs"
)

func RegisterRemoteFilesystemHandlers(router *Router, service *remotefs.Service) {
	router.Register("workspace.open", func(ctx context.Context, params json.RawMessage) (any, *Error) {
		var request struct {
			ConnectionID string `json:"connectionId"`
			Path         string `json:"path"`
		}
		if err := decodeParams(params, &request); err != nil || request.ConnectionID == "" || request.Path == "" {
			return nil, NewError(InvalidParamsCode, "connectionId and path are required")
		}
		workspace, err := service.OpenWorkspace(ctx, request.ConnectionID, request.Path)
		if err != nil {
			return nil, remoteFilesystemError(err)
		}
		return workspace, nil
	})
	router.Register("workspace.close", func(_ context.Context, params json.RawMessage) (any, *Error) {
		workspaceID, rpcError := workspaceIDParam(params)
		if rpcError != nil {
			return nil, rpcError
		}
		if err := service.CloseWorkspace(workspaceID); err != nil {
			return nil, remoteFilesystemError(err)
		}
		return map[string]bool{"closed": true}, nil
	})
	router.Register("workspace.getStatus", func(ctx context.Context, params json.RawMessage) (any, *Error) {
		workspaceID, rpcError := workspaceIDParam(params)
		if rpcError != nil {
			return nil, rpcError
		}
		status, err := service.GetStatus(ctx, workspaceID)
		if err != nil {
			return nil, remoteFilesystemError(err)
		}
		return status, nil
	})
	router.Register("fs.listDirectory", func(ctx context.Context, params json.RawMessage) (any, *Error) {
		var request struct {
			WorkspaceID string `json:"workspaceId"`
			Path        string `json:"path"`
		}
		if err := decodeParams(params, &request); err != nil || request.WorkspaceID == "" {
			return nil, NewError(InvalidParamsCode, "workspaceId is required")
		}
		entries, err := service.ListDirectory(ctx, request.WorkspaceID, request.Path)
		if err != nil {
			return nil, remoteFilesystemError(err)
		}
		return map[string]any{"entries": entries, "path": request.Path}, nil
	})
	router.Register("fs.stat", func(ctx context.Context, params json.RawMessage) (any, *Error) {
		var request struct {
			WorkspaceID string `json:"workspaceId"`
			Path        string `json:"path"`
		}
		if err := decodeParams(params, &request); err != nil || request.WorkspaceID == "" {
			return nil, NewError(InvalidParamsCode, "workspaceId is required")
		}
		entry, err := service.Stat(ctx, request.WorkspaceID, request.Path)
		if err != nil {
			return nil, remoteFilesystemError(err)
		}
		return entry, nil
	})
	router.Register("fs.readText", func(ctx context.Context, params json.RawMessage) (any, *Error) {
		var request struct {
			WorkspaceID string `json:"workspaceId"`
			Path        string `json:"path"`
		}
		if err := decodeParams(params, &request); err != nil || request.WorkspaceID == "" || request.Path == "" {
			return nil, NewError(InvalidParamsCode, "workspaceId and path are required")
		}
		file, err := service.ReadText(ctx, request.WorkspaceID, request.Path)
		if err != nil {
			return nil, remoteFilesystemError(err)
		}
		return file, nil
	})
	router.Register("fs.writeText", func(ctx context.Context, params json.RawMessage) (any, *Error) {
		var request struct {
			WorkspaceID      string            `json:"workspaceId"`
			Path             string            `json:"path"`
			Text             string            `json:"text"`
			ExpectedRevision remotefs.Revision `json:"expectedRevision"`
			Force            bool              `json:"force"`
		}
		if err := decodeParams(params, &request); err != nil || request.WorkspaceID == "" || request.Path == "" {
			return nil, NewError(InvalidParamsCode, "workspaceId and path are required")
		}
		result, err := service.WriteText(ctx, request.WorkspaceID, request.Path, request.Text, request.ExpectedRevision, request.Force)
		if err != nil {
			return nil, remoteFilesystemError(err)
		}
		return result, nil
	})
	router.Register("fs.createTextFile", func(ctx context.Context, params json.RawMessage) (any, *Error) {
		var request struct {
			WorkspaceID   string `json:"workspaceId"`
			DirectoryPath string `json:"directoryPath"`
			Name          string `json:"name"`
			Text          string `json:"text"`
		}
		if err := decodeParams(params, &request); err != nil || request.WorkspaceID == "" || request.Name == "" {
			return nil, NewError(InvalidParamsCode, "workspaceId and name are required")
		}
		result, err := service.CreateTextFile(ctx, request.WorkspaceID, request.DirectoryPath, request.Name, request.Text)
		if err != nil {
			return nil, remoteFilesystemError(err)
		}
		return result, nil
	})
	router.Register("fs.createDirectory", func(ctx context.Context, params json.RawMessage) (any, *Error) {
		var request struct {
			WorkspaceID   string `json:"workspaceId"`
			DirectoryPath string `json:"directoryPath"`
			Name          string `json:"name"`
		}
		if err := decodeParams(params, &request); err != nil || request.WorkspaceID == "" || request.Name == "" {
			return nil, NewError(InvalidParamsCode, "workspaceId and name are required")
		}
		result, err := service.CreateDirectory(ctx, request.WorkspaceID, request.DirectoryPath, request.Name)
		if err != nil {
			return nil, remoteFilesystemError(err)
		}
		return result, nil
	})
	router.Register("fs.rename", func(ctx context.Context, params json.RawMessage) (any, *Error) {
		var request struct {
			WorkspaceID string `json:"workspaceId"`
			Path        string `json:"path"`
			NewName     string `json:"newName"`
		}
		if err := decodeParams(params, &request); err != nil || request.WorkspaceID == "" || request.Path == "" || request.NewName == "" {
			return nil, NewError(InvalidParamsCode, "workspaceId, path, and newName are required")
		}
		result, err := service.Rename(ctx, request.WorkspaceID, request.Path, request.NewName)
		if err != nil {
			return nil, remoteFilesystemError(err)
		}
		return result, nil
	})
	router.Register("fs.duplicate", func(ctx context.Context, params json.RawMessage) (any, *Error) {
		var request struct {
			WorkspaceID string `json:"workspaceId"`
			Path        string `json:"path"`
			Name        string `json:"name"`
		}
		if err := decodeParams(params, &request); err != nil || request.WorkspaceID == "" || request.Path == "" || request.Name == "" {
			return nil, NewError(InvalidParamsCode, "workspaceId, path, and name are required")
		}
		result, err := service.Duplicate(ctx, request.WorkspaceID, request.Path, request.Name)
		if err != nil {
			return nil, remoteFilesystemError(err)
		}
		return result, nil
	})
}

func workspaceIDParam(params json.RawMessage) (string, *Error) {
	var request struct {
		WorkspaceID string `json:"workspaceId"`
	}
	if err := decodeParams(params, &request); err != nil || request.WorkspaceID == "" {
		return "", NewError(InvalidParamsCode, "workspaceId is required")
	}
	return request.WorkspaceID, nil
}

func remoteFilesystemError(err error) *Error {
	var remoteError *remotefs.Error
	if errors.As(err, &remoteError) {
		return NewStorageError(-32020, remoteError.Code, remoteError.Message, remoteError.Retryable, remoteError.Details)
	}
	return NewStorageError(-32020, "PROVIDER_UNAVAILABLE", "The remote filesystem request failed.", false, nil)
}
