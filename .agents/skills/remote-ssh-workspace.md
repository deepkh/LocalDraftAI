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
- Keep remote terminal, command execution, Git, port forwarding, proxy commands, deletion, offline mirrors, multiple active providers, and mixed local/remote workspace tabs out of scope.
