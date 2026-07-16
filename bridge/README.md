# LocalDraft Bridge

`localdraft-bridge` provides the loopback-only native boundary for optional Remote SSH Workspaces.

```text
LocalDraftAI browser UI
  -> authenticated same-origin JSON-RPC WebSocket
  -> localdraft-bridge on 127.0.0.1
  -> SSH connection
  -> SFTP subsystem
  -> remote workspace root
```

The bridge serves the unchanged static frontend, keeps SSH credentials and host verification out of the browser, and will expose only workspace-scoped filesystem operations. No component is installed on the remote host; it needs only OpenSSH, SFTP, and a permitted user account.

## Current bridge surface

- `GET /api/health` returns bridge and protocol versions.
- `GET /api/session?token=...` exchanges the one-time startup token for an HttpOnly, `SameSite=Strict` cookie and redirects to the app.
- `/api/bridge` accepts authenticated, exact-origin JSON-RPC 2.0 WebSockets.
- `/src/` and `/assets/` serve only the repository's static app files. `/` and `/index.html` redirect to the app shell.
- `bridge.hello`, `bridge.getStatus`, and `bridge.getLogs` are available at protocol version 1.
- Profile RPCs list, create, update, and remove saved connections and discover supported aliases from `~/.ssh/config`.
- Connection RPCs connect, answer one-time host-key or secret prompts, disconnect, reconnect, inspect status, and browse absolute remote directories for folder selection.
- Successful SSH authentication starts an SFTP client; no remote shell or LocalDraftAI remote agent is used.
- Workspace RPCs open, close, and inspect a canonical SFTP workspace root. Filesystem RPCs list, stat, read, conditionally write, create, rename, and duplicate through workspace IDs and relative POSIX paths.

The server limits WebSocket JSON messages to 16 MB, concurrent RPC calls to 8, normal calls to 30 seconds, and search calls to 120 seconds. Directory listings are limited to 5,000 entries and text reads to 10 MB; limit violations return structured errors rather than partial content. Its structured in-memory log is bounded to 200 entries and never records request bodies, cookies, startup tokens, secrets, or document contents.

## Build and launch

Go 1.25 or newer is required.

```bash
cd bridge
go test ./...
go vet ./...
go build -o ../build/localdraft-bridge ./cmd/localdraft-bridge
cd ..
./build/localdraft-bridge serve --listen 127.0.0.1:4782 --web-root .
```

Development options:

```text
--config-dir <path>
--no-open
--log-level debug|info|warn|error
--unsafe-non-loopback
```

The default listener is `127.0.0.1:4782`. A non-loopback listener is rejected unless `--unsafe-non-loopback` is explicitly supplied; that flag is for isolated development only and is not a supported deployment mode.

At startup the bridge generates a cryptographically random 32-byte token and opens its one-time session URL without printing the token. The exchange invalidates the token, sets the browser session cookie, and redirects to `/src/local_draft_ai.html`. The WebSocket rejects missing sessions, missing origins, public origins, and any origin whose host and port do not exactly match the bridge.

## SSH configuration and trust

The bridge stores connection profiles and its own host-key database under the platform user configuration directory:

```text
<user-config-dir>/LocalDraftAI/connections.json
<user-config-dir>/LocalDraftAI/known_hosts
```

Profiles contain host, port, user, authentication preferences, an optional identity-file path, and an optional default folder. They never contain passwords, passphrases, or private-key contents. Profile writes are atomic and use restrictive permissions where the platform supports them.

The connection manager tries the SSH agent, then the configured identity file, then a session-only passphrase for an encrypted identity, and finally a session-only password when allowed. Secrets are bound to a single prompt and discarded after the attempt. Connections use a 15-second timeout and a 30-second keepalive. After three consecutive keepalive failures, the bridge closes the failed clients and makes at most three retryable reconnect attempts after approximately 1, 2, and 4 seconds. Explicit Disconnect cancels the retry loop, and authentication or host-key failures are not retried automatically.

Exact aliases from `~/.ssh/config` may supply `Host`, `HostName`, `User`, `Port`, `IdentityFile`, `IdentitiesOnly`, and `UserKnownHostsFile`. Wildcard hosts and unsupported features such as `Match`, `ProxyJump`, `ProxyCommand`, forwarding, certificates, PKCS#11, and connection sharing are not imported. The bridge never writes to the user's OpenSSH configuration or existing known-host files.

An unknown host key must be confirmed by fingerprint before it is appended to the bridge-managed `known_hosts`. A changed key is blocked and reports both expected and received fingerprints; it is never replaced automatically.

## Remote workspaces

`workspace.open` resolves the selected absolute folder through SFTP and stores its canonical path in bridge memory. Subsequent filesystem calls reject absolute paths, dot components, Windows or UNC paths, and any existing target whose resolved path escapes the workspace through a symlink or root-prefix ambiguity. The bridge uses SFTP APIs only; it never constructs remote shell commands.

Remote Explorer listings contain directories and regular files with metadata. The frontend filters supported document types through its central registry and loads directories lazily. `fs.readText` stats before reading, rejects files over 10 MB, reads bounded exact UTF-8 bytes without changing a BOM, line endings, or final newline, then returns size, modification time, and a SHA-256 hash.

`fs.writeText` hashes the current bytes and compares them with the expected revision before changing anything. It writes exact serialized bytes into an exclusive same-directory temporary file, retains the destination mode when possible, uses the SFTP POSIX rename extension when available, and otherwise uses backup, replacement, and rollback renames. The bridge rereads and verifies the final target before returning its new revision. Create operations reserve destinations exclusively; rename rejects existing targets; duplicate preserves exact bytes and chooses a numbered name when needed.

Remote Save, Save As, New File, New Folder, Rename, and Duplicate are enabled only through the authenticated provider. Revision conflicts never change the target and the frontend offers text comparison, confirmed reload, explicit forced overwrite, or cancel. A disconnected workspace keeps browser editor state in memory while remote operations are unavailable. After reconnect, the frontend verifies the workspace and rereads authoritative revisions for open resources; changed or missing files stay marked with their prior expected revision to prevent silent overwrite. Search, restoration, Related integration, and binary assets remain later phases rather than silently falling back to local file access. The hosted `https://localdraft.ai/` app remains local-only and does not probe a loopback bridge.
