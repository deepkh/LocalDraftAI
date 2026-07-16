package remotefs

import (
	"bytes"
	"context"
	"io"
	"os"
	"unicode/utf8"

	"github.com/pkg/sftp"
)

func readFileBytes(ctx context.Context, client *sftp.Client, workspace Workspace, relativePath string) (string, string, os.FileInfo, []byte, error) {
	normalized, resolved, err := guardExisting(client, workspace, relativePath, false)
	if err != nil {
		return "", "", nil, nil, err
	}
	info, err := client.Stat(resolved)
	if err != nil {
		return "", "", nil, nil, mapFilesystemError(err, "The remote file was not found.")
	}
	if !info.Mode().IsRegular() {
		return "", "", nil, nil, &Error{Code: "OPERATION_UNSUPPORTED", Message: "The remote resource is not a regular file."}
	}
	if info.Size() > MaximumTextFileSize {
		return "", "", nil, nil, &Error{Code: "FILE_TOO_LARGE", Message: "The remote text file is larger than 10 MB."}
	}
	file, err := client.Open(resolved)
	if err != nil {
		return "", "", nil, nil, mapFilesystemError(err, "Could not read the remote file.")
	}
	payload, readErr := io.ReadAll(io.LimitReader(file, info.Size()+1))
	closeErr := file.Close()
	if readErr != nil {
		return "", "", nil, nil, mapFilesystemError(readErr, "Could not read the remote file.")
	}
	if closeErr != nil {
		return "", "", nil, nil, mapFilesystemError(closeErr, "Could not finish reading the remote file.")
	}
	if err := ctx.Err(); err != nil {
		return "", "", nil, nil, connectionLost(err)
	}
	if int64(len(payload)) > MaximumTextFileSize {
		return "", "", nil, nil, &Error{Code: "FILE_TOO_LARGE", Message: "The remote text file grew beyond 10 MB while it was being read."}
	}
	after, err := client.Stat(resolved)
	if err != nil {
		return "", "", nil, nil, mapFilesystemError(err, "The remote file changed while it was being read.")
	}
	if int64(len(payload)) != after.Size() {
		return "", "", nil, nil, &Error{Code: "CONNECTION_LOST", Message: "The remote file changed while it was being read.", Retryable: true}
	}
	return normalized, resolved, after, payload, nil
}

func (s *Service) ReadText(ctx context.Context, workspaceID, relativePath string) (TextFile, error) {
	client, workspace, err := s.clientAndWorkspace(workspaceID)
	if err != nil {
		return TextFile{}, err
	}
	normalized, _, info, payload, err := readFileBytes(ctx, client, workspace, relativePath)
	if err != nil {
		return TextFile{}, err
	}
	if !utf8.Valid(payload) {
		return TextFile{}, &Error{Code: "OPERATION_UNSUPPORTED", Message: "The remote file is not valid UTF-8 text."}
	}
	return TextFile{
		Path:     normalized,
		Text:     string(payload),
		Revision: revisionForBytes(info, payload),
	}, nil
}

func verifyWrittenBytes(ctx context.Context, client *sftp.Client, workspace Workspace, relativePath string, expected []byte) (Revision, error) {
	_, _, info, payload, err := readFileBytes(ctx, client, workspace, relativePath)
	if err != nil {
		return Revision{}, err
	}
	if !bytes.Equal(payload, expected) {
		return Revision{}, &Error{Code: "PROVIDER_UNAVAILABLE", Message: "The remote file could not be verified after writing."}
	}
	return revisionForBytes(info, payload), nil
}
