# Remote SSH workspace

- Keep editor, tab, sidebar, search, related-file, session, and asset code behind the storage-provider contract. Frontend modules may select a provider by ID, but must not implement SSH, SFTP, authentication, or host-key behavior.
- Keep `local-fsa` behavior in `src/js/local-filesystem-provider.js` and remote behavior in `src/js/remote-ssh-provider.js`. Provider-owned handles and identifiers belong in `storageResource.opaque`; application modules must not inspect them.
- Preserve the dependency-free static frontend. Go dependencies are isolated to `bridge/`; do not add frontend packages, generated JavaScript, WebAssembly, a bundler, or a framework.

## Bridge security

- Bind to `127.0.0.1:4782` by default. A non-loopback address requires an explicit unsafe-development flag.
- Serve the frontend and `/api` endpoints from one local origin. Exchange a one-time 32-byte startup token for an HttpOnly, `SameSite=Strict` session cookie and invalidate the token after its first successful use.
- Require the session cookie and an exact listen-host-and-port `Origin` for `/api/bridge`. Reject missing, public, cross-origin, and unauthenticated WebSocket requests.
- Use JSON-RPC 2.0, protocol version 1, bounded messages and concurrency, operation timeouts, structured provider errors, and a redacted bounded in-memory log.
- Serve only the repository `src/` and `assets/` trees. Do not expose the repository root, `.git`, configuration files, or an arbitrary static filesystem.
- Browser bridge detection stays same-origin: check `/api/health`, then authenticate `/api/bridge` with the session cookie. Do not probe loopback from the hosted site.
- Render remote status in local mode on every origin, but enable connection, folder, log, and profile commands only after an authenticated same-origin bridge handshake. Protocol mismatches remain visible and recoverable.
- Never expose an unauthenticated arbitrary-file HTTP endpoint or execute remote shell commands. Use SFTP for every remote filesystem operation.

## Remote paths and revisions

- Resolve an opened absolute remote folder with SFTP `RealPath` and retain the canonical result as the workspace root.
- All normal filesystem requests use normalized `/`-separated relative paths. Reject absolute paths, empty path components where invalid, `.`, `..`, Windows drive paths, and UNC paths.
- Resolve existing targets and new targets' existing parent directories through SFTP. Accept a resolved path only when it equals the canonical root or starts with `root + "/"`; enforce the path boundary to prevent root-prefix and symlink escapes.
- Hash exact file bytes with SHA-256 on read. Conditional writes compare the current hash with the expected revision and return `REVISION_CONFLICT` without changing the target when they differ.
- Write through a same-directory exclusive temporary file and verified atomic replacement. Do not report success until the final target can be statted and its revision returned.

## Remote workspace provider boundary

- `bridge/internal/remotefs/` owns canonical workspace roots, SFTP path validation, directory limits, exact-byte UTF-8 text reads, and SHA-256 revisions. Protocol handlers translate its errors without exposing absolute paths or document contents.
- `src/js/remote-ssh-provider.js` owns Remote SSH resource creation and bridge filesystem calls. Application code must use its workspace descriptor and resources rather than inspect bridge workspace identifiers in `opaque`.
- Keep Remote Explorer trees lazy: list the root once, load only an expanded directory, cache loaded children, retain empty directories, filter file types through `document-type.js`, and attach failures to the affected node.
- Remote text writes must send the session revision, preserve shared text serialization, clear dirty state only after a verified bridge result, and never invoke File System Access pickers. Save As accepts a validated workspace-relative path.
- New File, New Folder, Rename, and Duplicate dispatch through the active provider. Refresh only the affected lazy directory and update an open tab's resource and workspace path after rename or Save As.
- On `REVISION_CONFLICT`, leave the editor and dirty state unchanged. Compare uses the shared text-only diff renderer, Reload rereads the remote bytes and requires dirty-change confirmation, Overwrite alone uses `force: true`, and Cancel performs no mutation. Do not couple this flow to AI review revisions.
- Treat every non-connected SSH state as remote storage unavailable: disable remote reads and writes but keep tabs, editor buffers, history, selections, scroll, modes, and dirty markers. Never fall back to local file access or an offline mirror.
- After reconnect, verify the workspace root and reread every open resource's authoritative hash. Adopt a new revision only when its hash matches the opened revision; otherwise mark the tab remotely changed and retain the prior expected revision for conflict-safe Save.
- Automatic reconnect is bridge-owned, limited to three retryable attempts after keepalive loss, and uses approximately 1, 2, and 4 second delays. Explicit Disconnect cancels pending attempts, and authentication or host-key failures must not loop automatically.
- Store Remote SSH session metadata with `providerId`, connection ID, canonical root, and lightweight tab/sidebar state only. Restore after a user action, reconnect through the saved profile, reread files, skip missing tabs visibly, and never persist ordinary document content or secrets.
- Remote Search traverses SFTP in the bridge, checks cancellation, scans only registered text extensions, skips unreadable and oversized files with a warning count, and stops at 500 results or 20,000 visited files. Search results may `stat` and open paths absent from the lazy tree.
- Keep remote Related rule-based: loaded same-folder nodes, workspace-scoped recent paths, provider `stat` for unresolved Markdown links, and plan rules over loaded nodes only. Never recursively download for Related.
- Binary image RPC accepts only PNG, JPEG, WebP, and GIF, enforces a 25 MB asset limit, and uses 4 MB JSON-RPC chunks to stay below the 16 MB message ceiling. Reads and writes use the same canonical-root and symlink guard as text operations.
- Remote Markdown images load through authenticated provider calls into per-session object URLs. Missing or unsafe paths fail visibly; revoke URLs on close or reload. Paste/drop stores a safe unique file in the remote root `assets/` folder, inserts a document-relative link, refreshes lazy Explorer metadata, and never falls back to local storage.

## Credentials and host keys

- SSH private keys, passwords, passphrases, agent protocol data, session cookies, and startup tokens stay in the bridge process and never enter browser storage or logs.
- Profiles may store authentication preferences and an identity-file path, but never secret values or private-key contents. Write bridge configuration atomically with restrictive permissions.
- Prompt IDs bind session-only passwords and passphrases to one connection attempt; discard the secret immediately after the attempt.
- Clear browser secret inputs before the prompt response finishes and whenever a prompt closes. Host-key prompts show the algorithm and fingerprint and default to no trust until the user explicitly continues.
- Attempt authentication in order: SSH agent, configured identity, passphrase for an encrypted identity, then password when explicitly allowed. Do not prompt for an identity passphrase when the agent has already authenticated successfully.
- Verify host keys against the bridge-managed `known_hosts`. Unknown keys require an explicit fingerprint confirmation. Changed keys are blocked and are never automatically trusted.
- Do not modify the user's OpenSSH config or existing `known_hosts` file.
- Import only exact OpenSSH aliases and the documented `HostName`, `User`, `Port`, `IdentityFile`, `IdentitiesOnly`, and `UserKnownHostsFile` options. Do not claim support for proxy, forwarding, certificate, PKCS#11, `Match`, or connection-sharing directives.

## Scope and tests

- Keep local and remote workspace tests separate. Remote tests use an in-process SSH/SFTP server rooted in a temporary directory; do not depend on a developer's SSH configuration.
- Run frontend regression tests with `for test in tests/unit/*.test.js; do node "$test"; done`.
- Run bridge checks from `bridge/` with Go 1.25 or newer using `go test ./...` and `go vet ./...`.
- Run browser tests with `for test in tests/e2e/*.headless.mjs; do node --experimental-websocket "$test"; done` when Chrome is available on `PATH`.
- Run the SSH workspace browser flow with `node --experimental-websocket tests/e2e/remote-ssh-workspace.headless.mjs`; it builds a temporary bridge and uses the in-process SSH/SFTP server for lazy reads and remote mutations.
- Run conflict and recovery coverage with `node --experimental-websocket tests/e2e/remote-ssh-conflict.headless.mjs` and `node --experimental-websocket tests/e2e/remote-ssh-reconnect.headless.mjs`.
- Run restore and bridge-side search coverage with `node --experimental-websocket tests/e2e/remote-ssh-restore-search.headless.mjs`.
- Run remote binary image coverage with `node --experimental-websocket tests/e2e/remote-ssh-images.headless.mjs`.
- Keep remote terminal, command execution, Git, port forwarding, proxy commands, deletion, offline mirrors, multiple active providers, and mixed local/remote workspace tabs out of scope.
