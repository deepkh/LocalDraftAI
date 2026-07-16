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
	"strings"
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

func TestOpenRemoteWorkspaceRejectsMissingRoot(t *testing.T) {
	fixture := newRemoteFixture(t)
	_, err := fixture.service.OpenWorkspace(context.Background(), fixture.profileID, filepath.Join(fixture.root, "missing-root"))
	if err == nil || errorCode(t, err) != "RESOURCE_NOT_FOUND" {
		t.Fatalf("missing workspace root error = %v", err)
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
	if err := os.Symlink(outside, filepath.Join(fixture.root, "escape-dir")); err != nil {
		t.Fatal(err)
	}
	_, err = fixture.service.CreateTextFile(context.Background(), fixture.workspace.ID, "escape-dir", "created.md", "escape")
	if err == nil || errorCode(t, err) != "PATH_OUTSIDE_WORKSPACE" {
		t.Fatalf("new-file symlink escape error = %v", err)
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

func TestRemoteSearchTraversesSupportedTextWithLimitsAndCancellation(t *testing.T) {
	fixture := newRemoteFixture(t)
	if err := os.Mkdir(filepath.Join(fixture.root, "plans"), 0o755); err != nil {
		t.Fatal(err)
	}
	files := map[string][]byte{
		"plans/remote.md": []byte("Remote connection settings\nsecond CONNECTION match\n"),
		"settings.JSON":   []byte("{\"connection\": true}\n"),
		"ignored.png":     []byte("connection in unsupported file\n"),
		"invalid.yaml":    {0xff, 0xfe},
	}
	for name, payload := range files {
		filePath := filepath.Join(fixture.root, filepath.FromSlash(name))
		if err := os.WriteFile(filePath, payload, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	oversized, err := os.Create(filepath.Join(fixture.root, "oversized.txt"))
	if err != nil {
		t.Fatal(err)
	}
	if err := oversized.Truncate(MaximumTextFileSize + 1); err != nil {
		t.Fatal(err)
	}
	if err := oversized.Close(); err != nil {
		t.Fatal(err)
	}

	result, err := fixture.service.SearchText(context.Background(), fixture.workspace.ID, "connection", SearchOptions{MaxResults: 10})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Matches) != 3 || result.Truncated {
		t.Fatalf("search result = %#v", result)
	}
	paths := map[string]int{}
	for _, match := range result.Matches {
		paths[match.Path]++
		if match.Line < 1 || match.Column < 0 || match.Preview == "" {
			t.Fatalf("match = %#v", match)
		}
	}
	if paths["plans/remote.md"] != 2 || paths["settings.JSON"] != 1 || paths["ignored.png"] != 0 {
		t.Fatalf("search paths = %#v", paths)
	}
	if result.WarningCount < 2 || result.FilesVisited < 5 {
		t.Fatalf("search counters = %#v", result)
	}

	limited, err := fixture.service.SearchText(context.Background(), fixture.workspace.ID, "connection", SearchOptions{MaxResults: 1})
	if err != nil || len(limited.Matches) != 1 || !limited.Truncated {
		t.Fatalf("limited result = %#v, error = %v", limited, err)
	}
	caseSensitive, err := fixture.service.SearchText(context.Background(), fixture.workspace.ID, "CONNECTION", SearchOptions{CaseSensitive: true, MaxResults: 10})
	if err != nil || len(caseSensitive.Matches) != 1 || caseSensitive.Matches[0].Line != 2 {
		t.Fatalf("case-sensitive result = %#v, error = %v", caseSensitive, err)
	}

	cancelled, cancel := context.WithCancel(context.Background())
	cancel()
	_, err = fixture.service.SearchText(cancelled, fixture.workspace.ID, "connection", SearchOptions{})
	if err == nil || errorCode(t, err) != "CONNECTION_LOST" {
		t.Fatalf("cancelled search error = %v", err)
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

func TestWriteTextPreservesExactBytesAndReturnsVerifiedRevision(t *testing.T) {
	fixture := newRemoteFixture(t)
	filePath := filepath.Join(fixture.root, "document.md")
	original := []byte("# Original\n")
	if err := os.WriteFile(filePath, original, 0o640); err != nil {
		t.Fatal(err)
	}
	opened, err := fixture.service.ReadText(context.Background(), fixture.workspace.ID, "document.md")
	if err != nil {
		t.Fatal(err)
	}
	updated := "\ufeff# Updated\r\n\r\nFinal\r\n"
	result, err := fixture.service.WriteText(context.Background(), fixture.workspace.ID, "document.md", updated, opened.Revision, false)
	if err != nil {
		t.Fatal(err)
	}
	written, err := os.ReadFile(filePath)
	if err != nil {
		t.Fatal(err)
	}
	if string(written) != updated {
		t.Fatalf("written bytes = %q", written)
	}
	expectedHash := sha256.Sum256(written)
	if result.Revision.Size != int64(len(written)) || result.Revision.Hash != hex.EncodeToString(expectedHash[:]) {
		t.Fatalf("revision = %#v", result.Revision)
	}
	info, err := os.Stat(filePath)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o640 {
		t.Fatalf("mode = %o", info.Mode().Perm())
	}

	emptyResult, err := fixture.service.WriteText(context.Background(), fixture.workspace.ID, "document.md", "", result.Revision, false)
	if err != nil {
		t.Fatal(err)
	}
	if emptyResult.Revision.Size != 0 || emptyResult.Revision.Hash == "" {
		t.Fatalf("empty revision = %#v", emptyResult.Revision)
	}
	if value, err := os.ReadFile(filePath); err != nil || len(value) != 0 {
		t.Fatalf("empty file = %q, error = %v", value, err)
	}
	entries, err := os.ReadDir(fixture.root)
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if strings.Contains(entry.Name(), ".localdraft-") || strings.Contains(entry.Name(), ".localdraft-backup-") {
			t.Fatalf("temporary file was not removed: %s", entry.Name())
		}
	}
}

func TestRemoteWorkspaceMutations(t *testing.T) {
	fixture := newRemoteFixture(t)
	folder, err := fixture.service.CreateDirectory(context.Background(), fixture.workspace.ID, "", "plans")
	if err != nil || folder.Path != "plans" {
		t.Fatalf("folder = %#v, error = %v", folder, err)
	}
	created, err := fixture.service.CreateTextFile(context.Background(), fixture.workspace.ID, "plans", "project.md", "# Project\r\n")
	if err != nil {
		t.Fatal(err)
	}
	if created.Path != "plans/project.md" || created.Revision.Hash == "" {
		t.Fatalf("created = %#v", created)
	}
	if _, err := fixture.service.CreateTextFile(context.Background(), fixture.workspace.ID, "plans", "project.md", "overwrite"); err == nil || errorCode(t, err) != "RESOURCE_ALREADY_EXISTS" {
		t.Fatalf("existing file error = %v", err)
	}
	if _, err := fixture.service.CreateDirectory(context.Background(), fixture.workspace.ID, "", "plans"); err == nil || errorCode(t, err) != "RESOURCE_ALREADY_EXISTS" {
		t.Fatalf("existing folder error = %v", err)
	}
	renamed, err := fixture.service.Rename(context.Background(), fixture.workspace.ID, "plans/project.md", "renamed.md")
	if err != nil || renamed.Path != "plans/renamed.md" {
		t.Fatalf("renamed = %#v, error = %v", renamed, err)
	}
	if _, err := os.Stat(filepath.Join(fixture.root, "plans", "project.md")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("old file still exists: %v", err)
	}
	duplicate, err := fixture.service.Duplicate(context.Background(), fixture.workspace.ID, "plans/renamed.md", "renamed copy.md")
	if err != nil || duplicate.Path != "plans/renamed copy.md" {
		t.Fatalf("duplicate = %#v, error = %v", duplicate, err)
	}
	duplicate2, err := fixture.service.Duplicate(context.Background(), fixture.workspace.ID, "plans/renamed.md", "renamed copy.md")
	if err != nil || duplicate2.Path != "plans/renamed copy 2.md" {
		t.Fatalf("second duplicate = %#v, error = %v", duplicate2, err)
	}
	for _, name := range []string{"renamed.md", "renamed copy.md", "renamed copy 2.md"} {
		value, err := os.ReadFile(filepath.Join(fixture.root, "plans", name))
		if err != nil || string(value) != "# Project\r\n" {
			t.Fatalf("%s = %q, error = %v", name, value, err)
		}
	}
}

func TestWriteRejectsStaleRevisionWithoutChangingFile(t *testing.T) {
	fixture := newRemoteFixture(t)
	filePath := filepath.Join(fixture.root, "conflict.md")
	if err := os.WriteFile(filePath, []byte("original"), 0o644); err != nil {
		t.Fatal(err)
	}
	opened, err := fixture.service.ReadText(context.Background(), fixture.workspace.ID, "conflict.md")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filePath, []byte("external"), 0o644); err != nil {
		t.Fatal(err)
	}
	_, err = fixture.service.WriteText(context.Background(), fixture.workspace.ID, "conflict.md", "editor", opened.Revision, false)
	if err == nil || errorCode(t, err) != "REVISION_CONFLICT" {
		t.Fatalf("conflict error = %v", err)
	}
	value, readErr := os.ReadFile(filePath)
	if readErr != nil || string(value) != "external" {
		t.Fatalf("file changed on conflict: %q, error = %v", value, readErr)
	}
	forced, err := fixture.service.WriteText(context.Background(), fixture.workspace.ID, "conflict.md", "editor", opened.Revision, true)
	if err != nil || forced.Revision.Hash == "" {
		t.Fatalf("forced result = %#v, error = %v", forced, err)
	}
	if value, err := os.ReadFile(filePath); err != nil || string(value) != "editor" {
		t.Fatalf("forced file = %q, error = %v", value, err)
	}
}

func TestWriteReportsConnectionLoss(t *testing.T) {
	fixture := newRemoteFixture(t)
	if err := os.WriteFile(filepath.Join(fixture.root, "offline.md"), []byte("online"), 0o644); err != nil {
		t.Fatal(err)
	}
	opened, err := fixture.service.ReadText(context.Background(), fixture.workspace.ID, "offline.md")
	if err != nil {
		t.Fatal(err)
	}
	if err := fixture.manager.Disconnect(fixture.profileID); err != nil {
		t.Fatal(err)
	}
	_, err = fixture.service.WriteText(context.Background(), fixture.workspace.ID, "offline.md", "editor", opened.Revision, false)
	if err == nil || errorCode(t, err) != "CONNECTION_LOST" {
		t.Fatalf("connection loss error = %v", err)
	}
}

func TestWriteRejectsOversizedPayloadBeforeChangingFile(t *testing.T) {
	fixture := newRemoteFixture(t)
	filePath := filepath.Join(fixture.root, "limited.md")
	if err := os.WriteFile(filePath, []byte("original"), 0o644); err != nil {
		t.Fatal(err)
	}
	opened, err := fixture.service.ReadText(context.Background(), fixture.workspace.ID, "limited.md")
	if err != nil {
		t.Fatal(err)
	}
	_, err = fixture.service.WriteText(
		context.Background(),
		fixture.workspace.ID,
		"limited.md",
		strings.Repeat("x", int(MaximumTextFileSize)+1),
		opened.Revision,
		false,
	)
	if err == nil || errorCode(t, err) != "FILE_TOO_LARGE" {
		t.Fatalf("oversized write error = %v", err)
	}
	if value, err := os.ReadFile(filePath); err != nil || string(value) != "original" {
		t.Fatalf("limited file = %q, error = %v", value, err)
	}
}

func TestFilesystemPermissionErrorsStayStructured(t *testing.T) {
	err := mapFilesystemError(os.ErrPermission, "Permission denied.")
	if err.Code != "PERMISSION_DENIED" {
		t.Fatalf("permission error = %#v", err)
	}
}
