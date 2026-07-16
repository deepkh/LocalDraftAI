package protocol

import (
	"bytes"
	"testing"

	"localdraftai/bridge/internal/remotefs"
)

func TestBinaryUploadStoreAssemblesBoundedOrderedChunks(t *testing.T) {
	store := newBinaryUploadStore()
	first := []byte("first")
	second := []byte("second")
	uploadID, payload, next, complete, rpcError := store.append(binaryUploadRequest{
		WorkspaceID: "workspace", Path: "assets/image.png", MIMEType: "image/png",
		TotalSize: int64(len(first) + len(second)), Bytes: first,
	})
	if rpcError != nil || uploadID == "" || payload != nil || next != int64(len(first)) || complete {
		t.Fatalf("first chunk = %q %q %d %v %#v", uploadID, payload, next, complete, rpcError)
	}
	_, payload, next, complete, rpcError = store.append(binaryUploadRequest{
		WorkspaceID: "workspace", Path: "assets/image.png", MIMEType: "image/png", UploadID: uploadID,
		Offset: int64(len(first)), TotalSize: int64(len(first) + len(second)), Bytes: second, Complete: true,
	})
	if rpcError != nil || !complete || next != int64(len(first)+len(second)) || !bytes.Equal(payload, append(first, second...)) {
		t.Fatalf("final chunk = %q %d %v %#v", payload, next, complete, rpcError)
	}
}

func TestBinaryUploadStoreRejectsLimitsAndSequenceChanges(t *testing.T) {
	store := newBinaryUploadStore()
	if _, _, _, _, rpcError := store.append(binaryUploadRequest{
		WorkspaceID: "workspace", Path: "assets/image.png", MIMEType: "image/png",
		TotalSize: remotefs.MaximumBinaryAssetSize + 1, Bytes: []byte("x"), Complete: true,
	}); rpcError == nil || rpcError.Data.Code != "FILE_TOO_LARGE" {
		t.Fatalf("size error = %#v", rpcError)
	}
	uploadID, _, _, _, rpcError := store.append(binaryUploadRequest{
		WorkspaceID: "workspace", Path: "assets/image.png", MIMEType: "image/png",
		TotalSize: 2, Bytes: []byte("x"),
	})
	if rpcError != nil {
		t.Fatal(rpcError)
	}
	if _, _, _, _, rpcError = store.append(binaryUploadRequest{
		WorkspaceID: "workspace", Path: "assets/image.png", MIMEType: "image/png", UploadID: uploadID,
		Offset: 0, TotalSize: 2, Bytes: []byte("y"), Complete: true,
	}); rpcError == nil || rpcError.Data.Code != "INVALID_PATH" {
		t.Fatalf("sequence error = %#v", rpcError)
	}
}
