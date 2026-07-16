package remotefs

import (
	"context"
	"sort"
)

func (s *Service) ListDirectory(ctx context.Context, workspaceID, relativePath string) ([]DirectoryEntry, error) {
	client, workspace, err := s.clientAndWorkspace(workspaceID)
	if err != nil {
		return nil, err
	}
	normalized, resolved, err := guardExisting(client, workspace, relativePath, true)
	if err != nil {
		return nil, err
	}
	info, err := client.Stat(resolved)
	if err != nil {
		return nil, mapFilesystemError(err, "The remote directory was not found.")
	}
	if !info.IsDir() {
		return nil, &Error{Code: "INVALID_PATH", Message: "The remote path is not a directory."}
	}
	items, err := client.ReadDir(resolved)
	if err != nil {
		return nil, mapFilesystemError(err, "Could not list the remote directory.")
	}
	if len(items) > MaximumDirectorySize {
		return nil, &Error{Code: "FILE_TOO_LARGE", Message: "The remote directory contains more than 5,000 entries."}
	}
	entries := make([]DirectoryEntry, 0, len(items))
	for _, item := range items {
		if err := ctx.Err(); err != nil {
			return nil, connectionLost(err)
		}
		kind := ""
		if item.IsDir() {
			kind = "directory"
		} else if item.Mode().IsRegular() {
			kind = "file"
		}
		if kind == "" || item.Name() == "." || item.Name() == ".." {
			continue
		}
		entryPath := item.Name()
		if normalized != "" {
			entryPath = normalized + "/" + item.Name()
		}
		entries = append(entries, DirectoryEntry{
			Kind: kind,
			Name: item.Name(),
			Path: entryPath,
			Revision: Revision{
				Size:    item.Size(),
				MtimeMs: item.ModTime().UnixMilli(),
				Hash:    "",
			},
		})
	}
	sort.Slice(entries, func(left, right int) bool {
		if entries[left].Kind != entries[right].Kind {
			return entries[left].Kind == "directory"
		}
		return entries[left].Name < entries[right].Name
	})
	return entries, nil
}

func (s *Service) Stat(ctx context.Context, workspaceID, relativePath string) (DirectoryEntry, error) {
	client, workspace, err := s.clientAndWorkspace(workspaceID)
	if err != nil {
		return DirectoryEntry{}, err
	}
	normalized, resolved, err := guardExisting(client, workspace, relativePath, true)
	if err != nil {
		return DirectoryEntry{}, err
	}
	if err := ctx.Err(); err != nil {
		return DirectoryEntry{}, connectionLost(err)
	}
	info, err := client.Stat(resolved)
	if err != nil {
		return DirectoryEntry{}, mapFilesystemError(err, "The remote resource was not found.")
	}
	kind := "file"
	if info.IsDir() {
		kind = "directory"
	} else if !info.Mode().IsRegular() {
		return DirectoryEntry{}, &Error{Code: "OPERATION_UNSUPPORTED", Message: "This remote resource type is not supported."}
	}
	return DirectoryEntry{
		Kind:     kind,
		Name:     info.Name(),
		Path:     normalized,
		Revision: Revision{Size: info.Size(), MtimeMs: info.ModTime().UnixMilli()},
	}, nil
}
