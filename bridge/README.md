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

The server limits WebSocket JSON messages to 16 MB, concurrent RPC calls to 8, normal calls to 30 seconds, and search calls to 120 seconds. Its structured in-memory log is bounded to 200 entries and never records request bodies, cookies, startup tokens, secrets, or document contents.

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

The connection manager tries the SSH agent, then the configured identity file, then a session-only passphrase for an encrypted identity, and finally a session-only password when allowed. Secrets are bound to a single prompt and discarded after the attempt. Connections use a 15-second timeout, a 30-second keepalive, and close after three consecutive keepalive failures.

Exact aliases from `~/.ssh/config` may supply `Host`, `HostName`, `User`, `Port`, `IdentityFile`, `IdentitiesOnly`, and `UserKnownHostsFile`. Wildcard hosts and unsupported features such as `Match`, `ProxyJump`, `ProxyCommand`, forwarding, certificates, PKCS#11, and connection sharing are not imported. The bridge never writes to the user's OpenSSH configuration or existing known-host files.

An unknown host key must be confirmed by fingerprint before it is appended to the bridge-managed `known_hosts`. A changed key is blocked and reports both expected and received fingerprints; it is never replaced automatically.

The SSH/SFTP protocol foundation is active, but remote connection controls and remote workspace file operations remain hidden until their frontend phases are complete. The hosted `https://localdraft.ai/` app remains local-only and does not probe a loopback bridge.
