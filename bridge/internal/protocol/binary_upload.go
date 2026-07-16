package protocol

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"

	"localdraftai/bridge/internal/remotefs"
)

const (
	maximumBinaryRPCChunk = 4 << 20
	maximumBinaryUploads  = 8
	binaryUploadLifetime  = 5 * time.Minute
)

type binaryUploadRequest struct {
	WorkspaceID string
	Path        string
	MIMEType    string
	UploadID    string
	Offset      int64
	TotalSize   int64
	Bytes       []byte
	Complete    bool
}

type binaryUpload struct {
	workspaceID string
	path        string
	mimeType    string
	totalSize   int64
	bytes       []byte
	updatedAt   time.Time
}

type binaryUploadStore struct {
	mu      sync.Mutex
	uploads map[string]*binaryUpload
}

func newBinaryUploadStore() *binaryUploadStore {
	return &binaryUploadStore{uploads: make(map[string]*binaryUpload)}
}

func (s *binaryUploadStore) append(request binaryUploadRequest) (string, []byte, int64, bool, *Error) {
	if len(request.Bytes) > maximumBinaryRPCChunk {
		return "", nil, 0, false, binaryLimitError("A binary RPC chunk is larger than 4 MB.")
	}
	if request.TotalSize < 0 || request.TotalSize > remotefs.MaximumBinaryAssetSize {
		return "", nil, 0, false, binaryLimitError("The remote image is larger than 25 MB.")
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	s.removeExpiredLocked(time.Now())

	uploadID := request.UploadID
	upload := s.uploads[uploadID]
	if uploadID == "" {
		if request.Offset != 0 || request.TotalSize != int64(len(request.Bytes)) && request.Complete {
			return "", nil, 0, false, binaryUploadError("The binary upload length is invalid.")
		}
		if request.Complete {
			return "", append([]byte(nil), request.Bytes...), int64(len(request.Bytes)), true, nil
		}
		if len(s.uploads) >= maximumBinaryUploads {
			return "", nil, 0, false, NewStorageError(-32020, "PROVIDER_UNAVAILABLE", "Too many binary uploads are in progress.", true, nil)
		}
		value := make([]byte, 16)
		if _, err := rand.Read(value); err != nil {
			return "", nil, 0, false, NewStorageError(-32020, "PROVIDER_UNAVAILABLE", "Could not start the binary upload.", true, nil)
		}
		uploadID = hex.EncodeToString(value)
		upload = &binaryUpload{
			workspaceID: request.WorkspaceID,
			path:        request.Path,
			mimeType:    request.MIMEType,
			totalSize:   request.TotalSize,
			bytes:       make([]byte, 0, request.TotalSize),
		}
		s.uploads[uploadID] = upload
	}

	if upload == nil || upload.workspaceID != request.WorkspaceID || upload.path != request.Path || upload.mimeType != request.MIMEType || upload.totalSize != request.TotalSize {
		return "", nil, 0, false, binaryUploadError("The binary upload identifier is invalid.")
	}
	if request.Offset != int64(len(upload.bytes)) {
		return "", nil, int64(len(upload.bytes)), false, binaryUploadError("The binary upload chunks are out of order.")
	}
	if int64(len(upload.bytes)+len(request.Bytes)) > upload.totalSize {
		delete(s.uploads, uploadID)
		return "", nil, 0, false, binaryUploadError("The binary upload exceeds its announced size.")
	}
	upload.bytes = append(upload.bytes, request.Bytes...)
	upload.updatedAt = time.Now()
	nextOffset := int64(len(upload.bytes))
	if !request.Complete {
		return uploadID, nil, nextOffset, false, nil
	}
	delete(s.uploads, uploadID)
	if nextOffset != upload.totalSize {
		return "", nil, nextOffset, false, binaryUploadError("The binary upload is incomplete.")
	}
	return uploadID, upload.bytes, nextOffset, true, nil
}

func (s *binaryUploadStore) removeExpiredLocked(now time.Time) {
	for id, upload := range s.uploads {
		if upload.updatedAt.IsZero() || now.Sub(upload.updatedAt) > binaryUploadLifetime {
			delete(s.uploads, id)
		}
	}
}

func binaryLimitError(message string) *Error {
	return NewStorageError(-32020, "FILE_TOO_LARGE", message, false, nil)
}

func binaryUploadError(message string) *Error {
	return NewStorageError(-32020, "INVALID_PATH", message, false, nil)
}
