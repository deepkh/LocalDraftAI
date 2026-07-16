package remotefs

import (
	"context"
	"errors"
	"path"
	"strconv"
	"strings"

	"github.com/pkg/sftp"
)

func (s *Service) WriteText(ctx context.Context, workspaceID, relativePath, text string, expected Revision, force bool) (WriteResult, error) {
	client, workspace, err := s.clientAndWorkspace(workspaceID)
	if err != nil {
		return WriteResult{}, err
	}
	payload := []byte(text)
	if int64(len(payload)) > MaximumTextFileSize {
		return WriteResult{}, &Error{Code: "FILE_TOO_LARGE", Message: "The remote text file is larger than 10 MB."}
	}
	normalized, resolved, info, current, err := readFileBytes(ctx, client, workspace, relativePath)
	if err != nil {
		return WriteResult{}, err
	}
	currentRevision := revisionForBytes(info, current)
	if !force && expected.Hash != currentRevision.Hash {
		return WriteResult{}, &Error{
			Code:    "REVISION_CONFLICT",
			Message: "The remote file changed after it was opened.",
			Details: map[string]any{"currentRevision": currentRevision},
		}
	}
	if err := atomicWrite(ctx, clientAtomicWriteOperations(client), resolved, payload, info.Mode().Perm(), false); err != nil {
		return WriteResult{}, mapFilesystemError(err, "Could not write the remote file.")
	}
	revision, err := verifyWrittenBytes(ctx, client, workspace, normalized, payload)
	if err != nil {
		return WriteResult{}, err
	}
	return WriteResult{Path: normalized, Name: path.Base(normalized), Revision: revision}, nil
}

func (s *Service) CreateTextFile(ctx context.Context, workspaceID, directoryPath, name, text string) (WriteResult, error) {
	if err := validateName(name); err != nil {
		return WriteResult{}, err
	}
	client, workspace, err := s.clientAndWorkspace(workspaceID)
	if err != nil {
		return WriteResult{}, err
	}
	payload := []byte(text)
	if int64(len(payload)) > MaximumTextFileSize {
		return WriteResult{}, &Error{Code: "FILE_TOO_LARGE", Message: "The remote text file is larger than 10 MB."}
	}
	relativePath := name
	if directoryPath != "" {
		directoryPath, err = validateRelativePath(directoryPath, true)
		if err != nil {
			return WriteResult{}, err
		}
		relativePath = directoryPath + "/" + name
	}
	normalized, _, target, err := guardNewTarget(client, workspace, relativePath)
	if err != nil {
		return WriteResult{}, err
	}
	if exists, err := remotePathExists(client, target); err != nil {
		return WriteResult{}, err
	} else if exists {
		return WriteResult{}, &Error{Code: "RESOURCE_ALREADY_EXISTS", Message: "A remote file or folder with this name already exists."}
	}
	if err := atomicWrite(ctx, clientAtomicWriteOperations(client), target, payload, 0o644, true); err != nil {
		if exists, _ := remotePathExists(client, target); exists {
			return WriteResult{}, &Error{Code: "RESOURCE_ALREADY_EXISTS", Message: "A remote file or folder with this name already exists.", Cause: err}
		}
		return WriteResult{}, mapFilesystemError(err, "Could not create the remote file.")
	}
	revision, err := verifyWrittenBytes(ctx, client, workspace, normalized, payload)
	if err != nil {
		return WriteResult{}, err
	}
	return WriteResult{Path: normalized, Name: name, Revision: revision}, nil
}

func (s *Service) CreateDirectory(ctx context.Context, workspaceID, directoryPath, name string) (DirectoryResult, error) {
	if err := validateName(name); err != nil {
		return DirectoryResult{}, err
	}
	client, workspace, err := s.clientAndWorkspace(workspaceID)
	if err != nil {
		return DirectoryResult{}, err
	}
	relativePath := name
	if directoryPath != "" {
		directoryPath, err = validateRelativePath(directoryPath, true)
		if err != nil {
			return DirectoryResult{}, err
		}
		relativePath = directoryPath + "/" + name
	}
	normalized, _, target, err := guardNewTarget(client, workspace, relativePath)
	if err != nil {
		return DirectoryResult{}, err
	}
	if exists, err := remotePathExists(client, target); err != nil {
		return DirectoryResult{}, err
	} else if exists {
		return DirectoryResult{}, &Error{Code: "RESOURCE_ALREADY_EXISTS", Message: "A remote file or folder with this name already exists."}
	}
	if err := ctx.Err(); err != nil {
		return DirectoryResult{}, connectionLost(err)
	}
	if err := client.Mkdir(target); err != nil {
		return DirectoryResult{}, mapFilesystemError(err, "Could not create the remote folder.")
	}
	return DirectoryResult{Path: normalized, Name: name}, nil
}

func (s *Service) Rename(ctx context.Context, workspaceID, relativePath, newName string) (WriteResult, error) {
	if err := validateName(newName); err != nil {
		return WriteResult{}, err
	}
	client, workspace, err := s.clientAndWorkspace(workspaceID)
	if err != nil {
		return WriteResult{}, err
	}
	normalized, source, err := guardExisting(client, workspace, relativePath, false)
	if err != nil {
		return WriteResult{}, err
	}
	sourceInfo, err := client.Stat(source)
	if err != nil {
		return WriteResult{}, mapFilesystemError(err, "The remote file was not found.")
	}
	if !sourceInfo.Mode().IsRegular() {
		return WriteResult{}, &Error{Code: "OPERATION_UNSUPPORTED", Message: "Only remote text files can be renamed."}
	}
	if newName == path.Base(normalized) {
		_, _, info, payload, err := readFileBytes(ctx, client, workspace, normalized)
		if err != nil {
			return WriteResult{}, err
		}
		return WriteResult{Path: normalized, Name: newName, Revision: revisionForBytes(info, payload), Unchanged: true}, nil
	}
	targetRelative := path.Join(path.Dir(normalized), newName)
	if path.Dir(normalized) == "." {
		targetRelative = newName
	}
	targetNormalized, _, target, err := guardNewTarget(client, workspace, targetRelative)
	if err != nil {
		return WriteResult{}, err
	}
	if exists, err := remotePathExists(client, target); err != nil {
		return WriteResult{}, err
	} else if exists {
		return WriteResult{}, &Error{Code: "RESOURCE_ALREADY_EXISTS", Message: "A remote file or folder with this name already exists."}
	}
	if err := ctx.Err(); err != nil {
		return WriteResult{}, connectionLost(err)
	}
	if err := client.Rename(source, target); err != nil {
		return WriteResult{}, mapFilesystemError(err, "Could not rename the remote file.")
	}
	_, _, info, payload, err := readFileBytes(ctx, client, workspace, targetNormalized)
	if err != nil {
		return WriteResult{}, err
	}
	return WriteResult{Path: targetNormalized, Name: newName, Revision: revisionForBytes(info, payload)}, nil
}

func (s *Service) Duplicate(ctx context.Context, workspaceID, relativePath, requestedName string) (WriteResult, error) {
	if err := validateName(requestedName); err != nil {
		return WriteResult{}, err
	}
	client, workspace, err := s.clientAndWorkspace(workspaceID)
	if err != nil {
		return WriteResult{}, err
	}
	normalized, _, _, payload, err := readFileBytes(ctx, client, workspace, relativePath)
	if err != nil {
		return WriteResult{}, err
	}
	directoryPath := path.Dir(normalized)
	if directoryPath == "." {
		directoryPath = ""
	}
	name, err := uniqueDuplicateName(client, workspace, directoryPath, requestedName)
	if err != nil {
		return WriteResult{}, err
	}
	return s.CreateTextFile(ctx, workspaceID, directoryPath, name, string(payload))
}

func uniqueDuplicateName(client *sftp.Client, workspace Workspace, directoryPath, requestedName string) (string, error) {
	extension := path.Ext(requestedName)
	stem := strings.TrimSuffix(requestedName, extension)
	name := requestedName
	for index := 2; index < 10000; index++ {
		relativePath := name
		if directoryPath != "" {
			relativePath = directoryPath + "/" + name
		}
		_, _, target, err := guardNewTarget(client, workspace, relativePath)
		if err != nil {
			return "", err
		}
		exists, err := remotePathExists(client, target)
		if err != nil {
			return "", err
		}
		if !exists {
			return name, nil
		}
		name = stem + " " + strconv.Itoa(index) + extension
	}
	return "", &Error{Code: "RESOURCE_ALREADY_EXISTS", Message: "Could not choose an available duplicate name."}
}

func remotePathExists(client *sftp.Client, absolutePath string) (bool, error) {
	_, err := client.Lstat(absolutePath)
	if err == nil {
		return true, nil
	}
	if isNotExist(err) {
		return false, nil
	}
	var statusError *sftp.StatusError
	if strings.Contains(strings.ToLower(err.Error()), "no such file") || (errors.As(err, &statusError) && statusError.FxCode() == sftp.ErrSSHFxNoSuchFile) {
		return false, nil
	}
	return false, mapFilesystemError(err, "Could not inspect the remote path.")
}
