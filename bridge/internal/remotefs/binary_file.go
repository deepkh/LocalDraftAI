package remotefs

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"os"
	"path"
	"strings"

	"github.com/pkg/sftp"
)

var supportedImageMIMETypes = map[string]bool{
	"image/gif":  true,
	"image/jpeg": true,
	"image/png":  true,
	"image/webp": true,
}

func imageMIMEType(payload []byte) string {
	if len(payload) >= 12 && string(payload[:4]) == "RIFF" && string(payload[8:12]) == "WEBP" {
		return "image/webp"
	}
	mimeType := strings.ToLower(strings.TrimSpace(strings.Split(http.DetectContentType(payload), ";")[0]))
	if supportedImageMIMETypes[mimeType] {
		return mimeType
	}
	return ""
}

func imageExtensionMatches(relativePath, mimeType string) bool {
	extension := strings.ToLower(path.Ext(relativePath))
	switch mimeType {
	case "image/gif":
		return extension == ".gif"
	case "image/jpeg":
		return extension == ".jpg" || extension == ".jpeg"
	case "image/png":
		return extension == ".png"
	case "image/webp":
		return extension == ".webp"
	default:
		return false
	}
}

func readBinaryFileBytes(ctx context.Context, client *sftp.Client, workspace Workspace, relativePath string) (string, string, os.FileInfo, []byte, error) {
	normalized, resolved, err := guardExisting(client, workspace, relativePath, false)
	if err != nil {
		return "", "", nil, nil, err
	}
	info, err := client.Stat(resolved)
	if err != nil {
		return "", "", nil, nil, mapFilesystemError(err, "The remote image was not found.")
	}
	if !info.Mode().IsRegular() {
		return "", "", nil, nil, &Error{Code: "OPERATION_UNSUPPORTED", Message: "The remote image is not a regular file."}
	}
	if info.Size() > MaximumBinaryAssetSize {
		return "", "", nil, nil, &Error{Code: "FILE_TOO_LARGE", Message: "The remote image is larger than 25 MB."}
	}
	file, err := client.Open(resolved)
	if err != nil {
		return "", "", nil, nil, mapFilesystemError(err, "Could not read the remote image.")
	}
	payload, readErr := io.ReadAll(io.LimitReader(file, MaximumBinaryAssetSize+1))
	closeErr := file.Close()
	if readErr != nil {
		return "", "", nil, nil, mapFilesystemError(readErr, "Could not read the remote image.")
	}
	if closeErr != nil {
		return "", "", nil, nil, mapFilesystemError(closeErr, "Could not finish reading the remote image.")
	}
	if err := ctx.Err(); err != nil {
		return "", "", nil, nil, connectionLost(err)
	}
	if int64(len(payload)) > MaximumBinaryAssetSize {
		return "", "", nil, nil, &Error{Code: "FILE_TOO_LARGE", Message: "The remote image grew beyond 25 MB while it was being read."}
	}
	after, err := client.Stat(resolved)
	if err != nil {
		return "", "", nil, nil, mapFilesystemError(err, "The remote image changed while it was being read.")
	}
	if int64(len(payload)) != after.Size() {
		return "", "", nil, nil, &Error{Code: "CONNECTION_LOST", Message: "The remote image changed while it was being read.", Retryable: true}
	}
	return normalized, resolved, after, payload, nil
}

func (s *Service) ReadBinary(ctx context.Context, workspaceID, relativePath string) (BinaryFile, error) {
	client, workspace, err := s.clientAndWorkspace(workspaceID)
	if err != nil {
		return BinaryFile{}, err
	}
	normalized, _, info, payload, err := readBinaryFileBytes(ctx, client, workspace, relativePath)
	if err != nil {
		return BinaryFile{}, err
	}
	mimeType := imageMIMEType(payload)
	if mimeType == "" || !imageExtensionMatches(normalized, mimeType) {
		return BinaryFile{}, &Error{Code: "OPERATION_UNSUPPORTED", Message: "Only valid PNG, JPEG, WebP, and GIF images can be loaded."}
	}
	return BinaryFile{Path: normalized, MIMEType: mimeType, Bytes: payload, Revision: revisionForBytes(info, payload)}, nil
}

func (s *Service) WriteBinary(ctx context.Context, workspaceID, relativePath string, payload []byte, requestedMIMEType string) (BinaryWriteResult, error) {
	if int64(len(payload)) > MaximumBinaryAssetSize {
		return BinaryWriteResult{}, &Error{Code: "FILE_TOO_LARGE", Message: "The remote image is larger than 25 MB."}
	}
	if len(payload) == 0 {
		return BinaryWriteResult{}, &Error{Code: "OPERATION_UNSUPPORTED", Message: "The remote image is empty or invalid."}
	}
	mimeType := imageMIMEType(payload)
	requestedMIMEType = strings.ToLower(strings.TrimSpace(strings.Split(requestedMIMEType, ";")[0]))
	if mimeType == "" || requestedMIMEType != "" && requestedMIMEType != mimeType || !imageExtensionMatches(relativePath, mimeType) {
		return BinaryWriteResult{}, &Error{Code: "OPERATION_UNSUPPORTED", Message: "Only valid PNG, JPEG, WebP, and GIF images can be stored."}
	}
	client, workspace, err := s.clientAndWorkspace(workspaceID)
	if err != nil {
		return BinaryWriteResult{}, err
	}
	normalized, _, target, err := guardNewTarget(client, workspace, relativePath)
	if err != nil {
		return BinaryWriteResult{}, err
	}
	if exists, err := remotePathExists(client, target); err != nil {
		return BinaryWriteResult{}, err
	} else if exists {
		return BinaryWriteResult{}, &Error{Code: "RESOURCE_ALREADY_EXISTS", Message: "A remote file or folder with this name already exists."}
	}
	if err := atomicWrite(ctx, clientAtomicWriteOperations(client), target, payload, 0o644, true); err != nil {
		if exists, _ := remotePathExists(client, target); exists {
			return BinaryWriteResult{}, &Error{Code: "RESOURCE_ALREADY_EXISTS", Message: "A remote file or folder with this name already exists.", Cause: err}
		}
		return BinaryWriteResult{}, mapFilesystemError(err, "Could not store the remote image.")
	}
	_, _, info, written, err := readBinaryFileBytes(ctx, client, workspace, normalized)
	if err != nil {
		return BinaryWriteResult{}, err
	}
	if !bytes.Equal(written, payload) {
		return BinaryWriteResult{}, &Error{Code: "PROVIDER_UNAVAILABLE", Message: "The remote image could not be verified after writing."}
	}
	return BinaryWriteResult{
		Path: normalized, Name: path.Base(normalized), MIMEType: mimeType, Revision: revisionForBytes(info, written),
	}, nil
}
