package remotefs

import (
	"context"
	"io"
	"unicode/utf8"
)

func (s *Service) ReadText(ctx context.Context, workspaceID, relativePath string) (TextFile, error) {
	client, workspace, err := s.clientAndWorkspace(workspaceID)
	if err != nil {
		return TextFile{}, err
	}
	normalized, resolved, err := guardExisting(client, workspace, relativePath, false)
	if err != nil {
		return TextFile{}, err
	}
	info, err := client.Stat(resolved)
	if err != nil {
		return TextFile{}, mapFilesystemError(err, "The remote file was not found.")
	}
	if !info.Mode().IsRegular() {
		return TextFile{}, &Error{Code: "OPERATION_UNSUPPORTED", Message: "The remote resource is not a regular file."}
	}
	if info.Size() > MaximumTextFileSize {
		return TextFile{}, &Error{Code: "FILE_TOO_LARGE", Message: "The remote text file is larger than 10 MB."}
	}
	file, err := client.Open(resolved)
	if err != nil {
		return TextFile{}, mapFilesystemError(err, "Could not read the remote file.")
	}
	payload, readErr := io.ReadAll(io.LimitReader(file, info.Size()+1))
	closeErr := file.Close()
	if readErr != nil {
		return TextFile{}, mapFilesystemError(readErr, "Could not read the remote file.")
	}
	if closeErr != nil {
		return TextFile{}, mapFilesystemError(closeErr, "Could not finish reading the remote file.")
	}
	if err := ctx.Err(); err != nil {
		return TextFile{}, connectionLost(err)
	}
	if int64(len(payload)) > MaximumTextFileSize {
		return TextFile{}, &Error{Code: "FILE_TOO_LARGE", Message: "The remote text file grew beyond 10 MB while it was being read."}
	}
	after, err := client.Stat(resolved)
	if err != nil {
		return TextFile{}, mapFilesystemError(err, "The remote file changed while it was being read.")
	}
	if int64(len(payload)) != after.Size() {
		return TextFile{}, &Error{Code: "CONNECTION_LOST", Message: "The remote file changed while it was being read.", Retryable: true}
	}
	if !utf8.Valid(payload) {
		return TextFile{}, &Error{Code: "OPERATION_UNSUPPORTED", Message: "The remote file is not valid UTF-8 text."}
	}
	return TextFile{
		Path:     normalized,
		Text:     string(payload),
		Revision: revisionForBytes(after, payload),
	}, nil
}
