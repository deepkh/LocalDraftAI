package remotefs

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	bridgeconfig "localdraftai/bridge/internal/config"
	"localdraftai/bridge/internal/sshconn"
	"localdraftai/bridge/internal/testssh"
)

type remoteFixture struct {
	manager   *sshconn.Manager
	profileID string
	root      string
	server    *testssh.Server
	service   *Service
	workspace Workspace
}

func newRemoteFixture(t *testing.T) *remoteFixture {
	t.Helper()
	root := t.TempDir()
	server, err := testssh.Start(testssh.Options{Root: root})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = server.Close() })
	configDir := t.TempDir()
	paths := bridgeconfig.Paths{
		Directory:       configDir,
		ConnectionsFile: filepath.Join(configDir, "connections.json"),
		KnownHostsFile:  filepath.Join(configDir, "known_hosts"),
		OpenSSHConfig:   filepath.Join(configDir, "ssh_config"),
	}
	identityPath := filepath.Join(t.TempDir(), "id_ed25519")
	if err := server.WriteIdentityFile(identityPath, nil); err != nil {
		t.Fatal(err)
	}
	host, portText, err := net.SplitHostPort(server.Address)
	if err != nil {
		t.Fatal(err)
	}
	port, err := net.LookupPort("tcp", portText)
	if err != nil {
		t.Fatal(err)
	}
	store := bridgeconfig.NewStore(paths)
	profile, err := store.Create(bridgeconfig.Profile{
		Label: "Remote Files",
		Host:  host,
		Port:  port,
		User:  server.User,
		Auth:  bridgeconfig.AuthProfile{IdentityFile: identityPath},
	})
	if err != nil {
		t.Fatal(err)
	}
	var manager *sshconn.Manager
	manager = sshconn.NewManager(sshconn.ManagerConfig{
		Store:             store,
		Paths:             paths,
		DialTimeout:       5 * time.Second,
		KeepaliveInterval: time.Hour,
		Events: func(method string, params any) {
			if method != "connection.hostKeyPrompt" {
				return
			}
			values, _ := params.(map[string]any)
			promptID, _ := values["promptId"].(string)
			if promptID != "" {
				if err := manager.RespondToPrompt(promptID, sshconn.PromptResponse{Trust: true}); err != nil {
					t.Errorf("trust host key: %v", err)
				}
			}
		},
	})
	t.Cleanup(manager.Close)
	if _, err := manager.Connect(context.Background(), profile.ID); err != nil {
		t.Fatal(err)
	}
	service := NewService(manager)
	workspace, err := service.OpenWorkspace(context.Background(), profile.ID, root)
	if err != nil {
		t.Fatal(err)
	}
	return &remoteFixture{
		manager:   manager,
		profileID: profile.ID,
		root:      root,
		server:    server,
		service:   service,
		workspace: workspace,
	}
}

func errorCode(t *testing.T, err error) string {
	t.Helper()
	var remoteError *Error
	if !errors.As(err, &remoteError) {
		t.Fatalf("error = %T %v", err, err)
	}
	return remoteError.Code
}

func TestOpenListAndReadRemoteWorkspace(t *testing.T) {
	fixture := newRemoteFixture(t)
	if err := os.Mkdir(filepath.Join(fixture.root, "plans"), 0o755); err != nil {
		t.Fatal(err)
	}
	payload := []byte("\xef\xbb\xbf# Project\r\n\r\nLine\r\n")
	if err := os.WriteFile(filepath.Join(fixture.root, "plans", "project.md"), payload, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(fixture.root, "ignored.png"), []byte("png"), 0o644); err != nil {
		t.Fatal(err)
	}
	entries, err := fixture.service.ListDirectory(context.Background(), fixture.workspace.ID, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 2 || entries[0].Kind != "directory" || entries[0].Name != "plans" || entries[1].Name != "ignored.png" {
		t.Fatalf("entries = %#v", entries)
	}
	file, err := fixture.service.ReadText(context.Background(), fixture.workspace.ID, "plans/project.md")
	if err != nil {
		t.Fatal(err)
	}
	if file.Text != string(payload) {
		t.Fatalf("text bytes changed: %q", file.Text)
	}
	expectedHash := sha256.Sum256(payload)
	if file.Revision.Size != int64(len(payload)) || file.Revision.Hash != hex.EncodeToString(expectedHash[:]) {
		t.Fatalf("revision = %#v", file.Revision)
	}
	status, err := fixture.service.GetStatus(context.Background(), fixture.workspace.ID)
	if err != nil || !status.Available || status.Workspace.RootPath != fixture.root {
		t.Fatalf("status = %#v, error = %v", status, err)
	}
}

func TestRemotePathGuardRejectsUnsafePathsAndSymlinkEscapes(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("POSIX symlink path-guard test")
	}
	fixture := newRemoteFixture(t)
	outside := t.TempDir()
	outsideFile := filepath.Join(outside, "outside.md")
	if err := os.WriteFile(outsideFile, []byte("outside"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outsideFile, filepath.Join(fixture.root, "escape.md")); err != nil {
		t.Fatal(err)
	}
	for _, unsafePath := range []string{"/etc/passwd", "../outside.md", "plans/../../etc/passwd", `C:\file.txt`, `\\server\share`} {
		_, err := fixture.service.ReadText(context.Background(), fixture.workspace.ID, unsafePath)
		if err == nil || errorCode(t, err) != "INVALID_PATH" {
			t.Fatalf("path %q error = %v", unsafePath, err)
		}
	}
	_, err := fixture.service.ReadText(context.Background(), fixture.workspace.ID, "escape.md")
	if err == nil || errorCode(t, err) != "PATH_OUTSIDE_WORKSPACE" {
		t.Fatalf("symlink escape error = %v", err)
	}

	prefixRoot := filepath.Join(filepath.Dir(fixture.root), filepath.Base(fixture.root)+"-sibling")
	if err := os.Mkdir(prefixRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(prefixRoot) })
	if err := os.WriteFile(filepath.Join(prefixRoot, "prefix.md"), []byte("prefix"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(prefixRoot, "prefix.md"), filepath.Join(fixture.root, "prefix.md")); err != nil {
		t.Fatal(err)
	}
	_, err = fixture.service.ReadText(context.Background(), fixture.workspace.ID, "prefix.md")
	if err == nil || errorCode(t, err) != "PATH_OUTSIDE_WORKSPACE" {
		t.Fatalf("root-prefix escape error = %v", err)
	}
}

func TestRemoteReadLimitsMissingInvalidAndPermissionErrors(t *testing.T) {
	fixture := newRemoteFixture(t)
	_, err := fixture.service.ReadText(context.Background(), fixture.workspace.ID, "missing.md")
	if err == nil || errorCode(t, err) != "RESOURCE_NOT_FOUND" {
		t.Fatalf("missing error = %v", err)
	}
	oversized := filepath.Join(fixture.root, "oversized.md")
	file, err := os.Create(oversized)
	if err != nil {
		t.Fatal(err)
	}
	if err := file.Truncate(MaximumTextFileSize + 1); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	_, err = fixture.service.ReadText(context.Background(), fixture.workspace.ID, "oversized.md")
	if err == nil || errorCode(t, err) != "FILE_TOO_LARGE" {
		t.Fatalf("oversized error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(fixture.root, "invalid.md"), []byte{0xff, 0xfe}, 0o644); err != nil {
		t.Fatal(err)
	}
	_, err = fixture.service.ReadText(context.Background(), fixture.workspace.ID, "invalid.md")
	if err == nil || errorCode(t, err) != "OPERATION_UNSUPPORTED" {
		t.Fatalf("invalid UTF-8 error = %v", err)
	}
	protected := filepath.Join(fixture.root, "protected.md")
	if err := os.WriteFile(protected, []byte("protected"), 0o000); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(protected, 0o600) })
	_, err = fixture.service.ReadText(context.Background(), fixture.workspace.ID, "protected.md")
	if err != nil && errorCode(t, err) != "PERMISSION_DENIED" {
		t.Fatalf("permission error = %v", err)
	}
}

func TestClosedRemoteWorkspaceCannotBeUsed(t *testing.T) {
	fixture := newRemoteFixture(t)
	if err := fixture.service.CloseWorkspace(fixture.workspace.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.service.ListDirectory(context.Background(), fixture.workspace.ID, ""); err == nil || errorCode(t, err) != "RESOURCE_NOT_FOUND" {
		t.Fatalf("closed workspace error = %v", err)
	}
}
