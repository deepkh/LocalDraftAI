# AGENTS.md

## Project

LocalDraftAI is a local-first, browser-based Markdown-first text editor with Markdown WYSIWYG/source editing, source-only plain text and structured files, Soft Wrap, local file access, image asset handling, multi-tab sessions, validation warnings, and AI-assisted writing actions.

The app is currently a dependency-free static HTML/CSS/JavaScript project. Preserve that structure unless the user explicitly asks for a build system or new dependencies.

## Core Rules

- Keep the app local-first and usable without an AI server.
- Keep Markdown as the source of truth.
- Keep changes small, readable, and easy to review.
- Do not add dependencies unless requested.
- Do not rewrite unrelated code.
- Ask before destructive actions, deleting files, or rewriting git history.
- Ask before reading or writing outside this repo or `/tmp`.
- It is OK to run normal inspection, edit, and test commands inside this repo.

## Important Paths

```text
src/local_draft_ai.html      Main app shell
assets/LocalDraftAI.ico      App favicon
assets/local-draft-ai-snapshot.png README snapshot image
src/styles.css               App styling
src/js/app.js                App startup and wiring
src/js/command-registry.js   Application command registration and execution
src/js/menu-bar.js           Application menu interaction and command dispatch
src/js/activity-bar.js       Workbench view and sidebar routing
src/js/theme.js              Application light/dark theme state, persistence, and control synchronization
src/js/status-bar.js         Compact workspace, document, editor, and AI status
src/js/document-session.js   Per-tab document state
src/js/storage-resource.js   Provider-neutral document resource identity and revision metadata
src/js/storage-provider-registry.js Storage provider lookup and normalized errors
src/js/local-filesystem-provider.js Local File System Access provider
src/js/bridge-client.js       Authenticated same-origin JSON-RPC bridge client and detection
src/js/remote-status.js       Remote Status Bar state, labels, menu, and command availability
src/js/remote-connection-ui.js SSH profile, prompt, folder selection, and connection-log dialogs
src/js/remote-ssh-provider.js Remote SSH document and workspace storage provider
src/js/document-type.js      Central supported-extension and document-capability registry
src/js/document-validation.js Warning-only JSON and YAML syntax validation
src/js/tab-manager.js        Multi-tab behavior
src/js/markdown.js           Markdown conversion/rendering
src/js/editor-mode.js        Editor mode, Soft Wrap, and caret/offset helpers
src/js/editor-actions.js     Editor formatting commands
src/js/file-store.js         Local file open/save
src/js/recent-files.js       Recent files
src/js/workspace-store.js    Eager local and lazy remote supported text-document tree model
src/js/workspace-sidebar.js  Left workspace sidebar rendering, persisted mode, and resizing
src/js/workspace-session.js  IndexedDB workspace handle, recent workspaces, and opened-tab session restore
src/js/workspace-operations.js Safe text-document/folder operations from the workspace sidebar
src/js/workspace-search.js   Supported workspace content search helpers
src/js/workspace-related.js  Related file and plan-file detection helpers
src/js/asset-store.js        Local image workspace/assets handling
bridge/                      Isolated Go loopback bridge module
bridge/internal/remotefs/    Workspace-confined SFTP directory and text-read service
src/js/ai-assistant.js       AI workflow, side-panel review/apply, revisions, and modal fallback
src/js/ai-actions.js         Compatibility facade for configured AI actions
src/js/ai-action-defaults.js Default AI Actions YAML
src/js/ai-action-config.js   AI Actions YAML parsing, validation, and compatibility adapter
src/js/ai-action-config-store.js IndexedDB AI Actions YAML persistence and fallback
src/js/ai-action-config-dialog.js Configure AI Actions dialog
src/js/ai-diff.js            Visual diff helpers for AI review results
src/js/ai-patch.js           Interactive AI diff accept/reject state
src/js/ai-provider.js        Compatibility wrapper for AI provider calls
src/js/ai-provider-registry.js Built-in AI provider descriptors, groups, defaults, aliases
src/js/ai-provider-manager.js Provider registry, settings migration, normalized AI results
src/js/ai-provider-common.js Shared AI provider request, parsing, and error helpers
src/js/ai-provider-openai-compatible.js OpenAI-compatible custom and cloud provider transport
src/js/ai-provider-ollama.js Native Ollama provider
src/js/ai-provider-openai.js OpenAI compatibility registration
src/js/ai-provider-anthropic.js Claude/Anthropic Messages provider
src/js/ai-provider-gemini.js Gemini compatibility registration
src/js/ai-reasoning.js       Reasoning mode normalization and provider mappings
src/js/ai-settings.js        AI settings dialog
src/js/ai-status.js          AI connection/status display
src/js/ai-context-menu.js    Right-click editor clipboard and AI action menu
src/js/markdown-ai-guards.js AI output safety checks for Markdown
src/js/markdown-repair.js    Markdown cleanup helpers
src/js/resizer.js            AI Assistant panel resize behavior
tests/e2e/workbench-layout.headless.mjs Semantic workbench and responsive layout smoke test
tests/e2e/wysiwyg-paste-sanitization.headless.mjs Safe rich HTML paste and Markdown round-trip smoke test
tests/unit/                  Dependency-free unit tests
tests/e2e/                   Dependency-free browser smoke tests
.agents/skills/              More detailed subsystem guidance
```

## Subsystem Routing

Before editing, read only the relevant files and the matching skill file under `.agents/skills/`.

Use these routes:

- AI Assistant, AI menu, settings, provider, status, review/apply flow:
  - `.agents/skills/ai-assistant.md`
  - `src/js/ai-*.js`
  - `src/js/markdown-ai-guards.js`
  - `src/js/markdown-repair.js`
- Tabs, active document ownership, dirty state, tab scrolling, tab reordering:
  - `.agents/skills/tab-manager.md`
  - `src/js/tab-manager.js`
  - `src/js/document-session.js`
- Local file open/save and recent files:
  - `.agents/skills/file-access.md`
  - `src/js/storage-resource.js`
  - `src/js/storage-provider-registry.js`
  - `src/js/local-filesystem-provider.js`
  - `src/js/file-store.js`
  - `src/js/recent-files.js`
- Local bridge server, browser bridge client, protocol, startup authentication, and security:
  - `.agents/skills/remote-ssh-workspace.md`
  - `src/js/bridge-client.js`
  - `src/js/remote-status.js`
  - `src/js/remote-connection-ui.js`
  - `src/js/remote-ssh-provider.js`
  - `bridge/internal/appserver/`
  - `bridge/internal/protocol/`
  - `bridge/internal/logbuffer/`
  - `bridge/internal/config/`
  - `bridge/internal/sshconn/`
  - `bridge/internal/remotefs/`
  - `bridge/internal/testssh/`
- Supported document types and structured validation:
  - `src/js/document-type.js`
  - `src/js/document-validation.js`
  - `src/js/document-session.js`
  - `src/js/file-store.js`
- Workspace sidebar, folder open, supported-document file tree, session restore, file operations, content search, related files, workspace sidebar sizing/state:
  - `.agents/skills/workspace-sidebar.md`
  - `src/js/workspace-store.js`
  - `src/js/workspace-sidebar.js`
  - `src/js/workspace-session.js`
  - `src/js/workspace-operations.js`
  - `src/js/workspace-search.js`
  - `src/js/workspace-related.js`
  - `src/js/app.js`
  - `src/styles.css`
- Images and workspace assets:
  - `.agents/skills/asset-store.md`
  - `src/js/asset-store.js`
- Markdown parsing, rendering, Markdown mode, WYSIWYG conversion:
  - `.agents/skills/markdown.md`
  - `.agents/skills/markdown-editor-html.md`
  - `src/js/markdown.js`
- Formatting buttons and editor commands:
  - `.agents/skills/editor-actions.md`
  - `src/js/editor-actions.js`
- Layout, editor surface, Soft Wrap, focus mode, viewport behavior:
  - `.agents/skills/workbench-layout.md`
  - `.agents/skills/styles.md`
  - `.agents/skills/resizer.md`
  - `.agents/skills/viewport.md`
  - `src/js/activity-bar.js`
  - `src/js/command-registry.js`
  - `src/js/menu-bar.js`
  - `src/js/status-bar.js`
  - `src/js/app.js`
  - `src/styles.css`
  - `src/js/resizer.js`
  - `src/js/viewport.js`

If a new subsystem is added, create or update a small skill file in `.agents/skills/`.

## Behavior Notes

- Each open document tab owns its own title, dirty state, active mode, scroll state, undo/redo history, file handle, workspace folder, and image object URLs.
- Every document session has a provider ID, normalized storage resource, and revision. Legacy local file and workspace handles remain compatibility fields; provider-neutral application code uses storage resources.
- Local File System Access picker, read, write, directory traversal, and workspace mutation calls belong in `local-filesystem-provider.js`. Local asset storage may retain narrowly scoped browser file calls in `asset-store.js`.
- The optional Go bridge binds to loopback by default, serves only `src/` and `assets/`, exchanges a one-time startup token for an HttpOnly strict-same-site cookie, and accepts WebSockets only from its exact authenticated origin.
- Bridge JSON-RPC protocol version 1 limits messages to 16 MB, concurrent calls to 8, normal operations to 30 seconds, search to 120 seconds, and its redacted in-memory log to 200 structured entries.
- Bridge connection profiles are stored atomically without secrets. SSH authentication tries the agent before a configured identity and uses prompt-scoped passphrases or passwords only in process memory. Unknown host keys require fingerprint confirmation in the bridge-managed `known_hosts`; changed keys are blocked.
- OpenSSH discovery supports exact host aliases and only `Host`, `HostName`, `User`, `Port`, `IdentityFile`, `IdentitiesOnly`, and `UserKnownHostsFile`. Do not write OpenSSH configuration or user-managed known-host files, and do not imply support for deferred proxy, forwarding, certificate, PKCS#11, or connection-sharing options.
- Connected SSH sessions own an SFTP client, use a 15-second connection timeout and a 30-second keepalive, and close after three consecutive keepalive failures. Remote shell commands remain out of scope.
- The static app detects a bridge only through same-origin `/api/health`; the hosted site does not probe loopback. Remote command controls remain disabled unless that handshake succeeds.
- The Remote Status Bar item always identifies local or SSH state. SSH commands are enabled only after an authenticated same-origin bridge handshake; hosted and standalone static origins keep them disabled.
- Remote connection UI owns profile management, host-key confirmation, prompt-scoped password/passphrase entry, remote folder selection, and the redacted connection log. Clear secret inputs before requests settle, never use browser storage for them, and do not switch workspaces until the selected folder opens successfully.
- A bridge-served Remote SSH workspace uses `remote-ssh`, opens only after SFTP canonicalizes its absolute root, and passes only workspace-relative POSIX paths after opening. Existing targets must resolve at or below the canonical root; reject absolute, dot, dot-dot, Windows, UNC, root-prefix, and symlink-escape paths.
- Remote Explorer trees are lazy: open lists only the root, expansion loads one directory through the provider, unsupported files stay hidden through `document-type.js`, empty directories stay visible, and a directory error stays attached to that node. Local workspace trees remain eager.
- Remote text writes carry the opened SHA-256 revision, replace through a same-directory temporary file, preserve the prior mode when possible, and verify the final bytes before success. A mismatched revision returns `REVISION_CONFLICT` without modifying the target.
- Remote Save As, New File, New Folder, Rename, and Duplicate stay inside the active workspace provider and refresh only their affected lazy Explorer directory. They must never invoke local browser file APIs. Delete remains out of scope.
- Remote revision conflicts keep the editor dirty and offer Compare Changes, Reload Remote with dirty confirmation, explicit forced Overwrite, and Cancel. Compare is the default action and uses the shared text diff renderer without entering AI review state.
- SSH connection loss must preserve tabs, dirty buffers, selections, scroll, mode, and Soft Wrap while disabling remote filesystem actions. Keepalive loss permits at most three automatic reconnect attempts with approximately 1, 2, and 4 second delays; Disconnect cancels them and authentication failures are not retried automatically.
- After reconnect, revalidate all open remote resources by SHA-256 without replacing editor content. Update unchanged revisions, mark changed or missing resources, and retain the old expected revision so a later Save conflicts unless the user explicitly overwrites.
- Remote session metadata uses IndexedDB version 3 with a connection ID and canonical root but no document content or secrets. Restore only after explicit user action, reconnect through the saved profile, reread tabs, preserve lightweight editor/sidebar state, and report missing profiles, roots, and files visibly.
- Remote Search is a bridge-side SFTP traversal over registered text extensions, not a loaded-node browser search or remote shell command. Enforce 500 results, 20,000 visited files, 10 MB per file, request timeout/cancellation, and visible truncation or warning counts; Search results may open unloaded paths through provider `stat` and `readText`.
- Remote Related results use loaded same-folder nodes, workspace-scoped recent identities, and provider `stat` for unresolved Markdown links. Do not recursively download a remote workspace for Related or plan discovery.
- Remote binary asset capabilities remain disabled until their phase; do not provide a local asset fallback.
- The left workspace sidebar lists registered text documents (`.md`, `.markdown`, `.txt`, `.log`, `.json`, `.yml`, and `.yaml`), keeps unsupported files hidden, and opens supported workspace files in tabs.
- Every supported extension and its editor, validation, formatting, and AI capabilities must be registered centrally in `document-type.js`; do not duplicate extension regular expressions across modules.
- Markdown behavior must remain backward compatible. Only Markdown may enter Markdown-to-HTML or HTML-to-Markdown conversion, use WYSIWYG, or run Markdown formatting commands.
- JSON and YAML remain source-only, are never automatically reformatted, and show warning-only validation. Invalid structured documents must remain editable and saveable.
- The workspace sidebar supports expanded, minimized, and hidden modes, persists its mode and width in localStorage, supports Files, Search, and Related views, and lets folders in the Files tree collapse or expand with workspace-relative persisted state.
- Workspace session restore uses IndexedDB schema version 3 for provider-aware workspace references, up to 10 recent workspace records, lightweight opened-tab metadata, workspace-relative collapsed folder paths, and sidebar scroll position. Version-2 `workspaceHandle` records normalize to `local-fsa` records indefinitely. Restore remains an explicit user action and normal restore must not store full document contents.
- Switching to a different workspace removes supported workspace tabs owned by the previous workspace from the tab bar while preserving lightweight restore metadata for that workspace. If any of those tabs are dirty, the user must confirm before the switch completes.
- Workspace file operations must stay safe: New File, New Folder, Duplicate, Copy Relative Path, and conservative Rename are allowed for registered document types; Delete is out of scope.
- Workspace content search scans all registered text-document types and should cap matches to avoid runaway UI work.
- Related files are simple rule-based context only: every supported type gets same-folder and recently opened files; Markdown alone gets Markdown links and plan files. Do not add embeddings or AI context execution here.
- Plan badges use simple filename/path rules and must not imply any agent execution feature.
- WYSIWYG mode supports safe rich HTML paste through one shared sanitizer for native and context-menu paste. Markdown-compatible formatting is preserved, redundant layout containers around document blocks are unwrapped, and webpage controls, executable or embedded content, media widgets, SVG UI, unsafe attributes, inline styles, and event handlers are removed with blocked subtree content.
- WYSIWYG H1, H2, and H3 headings use compact 24px, 20px, and 18px document typography at weight 600 so pasted heading hierarchy remains visually consistent.
- The editor right-click menu should include Cut, Copy, and Paste; Markdown mode uses plain text, while WYSIWYG mode should preserve rich HTML clipboard data when the browser allows it.
- Markdown mode should accept plain Markdown text.
- Markdown rendering and toolbar actions support basic blocks including headings, lists, block quotes, code fences, images, links, horizontal rules, and pipe tables.
- Escaped Markdown punctuation should render and round-trip as literal text in WYSIWYG mode.
- LocalDraftAI uses one main editor surface.
- The application shell uses semantic Menu Bar, Activity Bar, Primary Sidebar, Editor Area, Secondary Sidebar, and Status Bar regions.
- The Activity Bar routes Explorer, Search, and Related to the existing workspace sidebar, opens the AI Secondary Sidebar without moving review state, and opens the existing Settings dialog.
- Theme is application-level state with supported `light` and `dark` values stored under `localdraftai.appearance.theme` in localStorage.
- Apply the persisted theme before the stylesheet renders; switching themes must not modify document, editor, tab, sidebar, workspace, or AI state.
- Theme-sensitive colors belong in semantic CSS variables with light defaults and dark overrides.
- The command registry maps Menu Bar commands to existing app behavior; menu modules must not reimplement file, editor, workspace, or AI operations.
- The Status Bar displays workspace, unsaved-document, editor mode, Soft Wrap, Markdown cursor, word count, and AI provider state passed from their existing owners.
- Only one editor mode is visible at a time: WYSIWYG or source. WYSIWYG is available only to Markdown documents.
- WYSIWYG remains the editable rendered view.
- Markdown remains the source of truth for saving and syncing.
- Soft Wrap affects visual wrapping only and must not change saved document content in any supported type.
- Application actions remain available from the compact Menu Bar, while Markdown/WYSIWYG, Soft Wrap, formatting, and Focus Mode stay in the Editor Area toolbar.
- The right-hand workspace hosts the AI Assistant review panel and should keep the editor visible while reviewing output.
- The AI Assistant review panel is manually resizable on wide desktop layouts, stores its width in localStorage, and should clamp against the workspace sidebar so the editor remains usable.
- AI actions should operate on selected text and show review UI before applying changes; keep the modal path available as a fallback while the panel experiment stabilizes.
- AI action menus are generated from validated local YAML. Invalid YAML must not replace the current or last-good config.
- AI capture should send selected content as Markdown fragments in both WYSIWYG and Markdown modes; WYSIWYG list selections should preserve Markdown list markers.
- AI review should keep AI Result - AI can make mistakes editable and refresh the visual diff when it changes.
- AI review should show the AI Engine summary for the provider, model, and reasoning settings that generated the currently visible result.
- AI review Advanced overrides should be temporary to the current action and should only add a new revision after Regenerate Result succeeds.
- AI review should keep generated results as in-memory revisions for the current action; do not persist revision history unless explicitly requested.
- AI interactive review should keep accept/reject choices in review state and apply only after the final apply click.
- AI apply mode should support replacing the selection, inserting below the selection, or copying the result without changing the document.
- Plain text may use general writing AI actions, but Markdown-only actions must be hidden. JSON and YAML replacement-based AI actions remain disabled.
- AI Restore Original should use exact range or safe text-match restoration and show a clear message instead of guessing when restore is unsafe.
- AI provider mode should support local mock mode, native Ollama, OpenAI, Gemini, Groq, OpenRouter, Mistral, Claude, Grok, and OpenAI-compatible custom server mode.
- AI reasoning mode should support Auto, Off, Low, Medium, High, and Extra High, map them to provider-supported reasoning controls, and only show provider-returned summaries when requested.
- AI errors should be visible and recoverable, not silent.
- The feedback hint should link to the GitHub issues page.

## Testing

Run the relevant unit tests after changes.

Common commands:

```bash
node tests/unit/ai-actions.test.js
node tests/unit/ai-action-config.test.js
node tests/unit/ai-assistant.test.js
node tests/unit/ai-context-menu.test.js
node tests/unit/ai-diff.test.js
node tests/unit/ai-patch.test.js
node tests/unit/ai-provider-anthropic.test.js
node tests/unit/ai-provider-gemini.test.js
node tests/unit/ai-provider-manager.test.js
node tests/unit/ai-provider-ollama.test.js
node tests/unit/ai-provider-openai.test.js
node tests/unit/ai-provider-registry.test.js
node tests/unit/ai-provider.test.js
node tests/unit/ai-reasoning.test.js
node tests/unit/ai-settings.test.js
node tests/unit/ai-status.test.js
node tests/unit/ai-transport-openai-compatible.test.js
node tests/unit/editor-actions.test.js
node tests/unit/editor-mode.test.js
node tests/unit/document-session.test.js
node tests/unit/document-type.test.js
node tests/unit/document-validation.test.js
node tests/unit/file-store.test.js
node tests/unit/markdown-ai-guards.test.js
node tests/unit/markdown.test.js
node tests/unit/resizer.test.js
node tests/unit/tab-manager.test.js
node tests/unit/theme.test.js
node tests/unit/workspace-store.test.js
```

Run all tests:

```bash
for test in tests/unit/*.test.js; do
  node "$test"
done
```

Run bridge checks with Go 1.25 or newer:

```bash
cd bridge
go test ./...
go vet ./...
```

Run the headless browser Soft Wrap and mode-switch smoke test with Chrome available on `PATH`:

```bash
node --experimental-websocket tests/e2e/soft-wrap-mode-switch.headless.mjs
```

Run the headless browser WYSIWYG AI list capture smoke test with Chrome available on `PATH`:

```bash
node --experimental-websocket tests/e2e/wysiwyg-ai-list-capture.headless.mjs
```

Run the safe WYSIWYG rich paste and Markdown round-trip smoke test:

```bash
node --experimental-websocket tests/e2e/wysiwyg-paste-sanitization.headless.mjs
```

Run the configurable AI Actions menu and dialog smoke test:

```bash
node --experimental-websocket tests/e2e/ai-action-config.headless.mjs
```

Run the Markdown table render, round-trip, and toolbar smoke test:

```bash
node --experimental-websocket tests/e2e/markdown-table.headless.mjs
```

Run the semantic workbench and responsive layout smoke test:

```bash
node --experimental-websocket tests/e2e/workbench-layout.headless.mjs
```

Run the Markdown-first plain-text workspace, source-only editor, validation, search, save, and restore smoke test:

```bash
node --experimental-websocket tests/e2e/plain-text-file-support.headless.mjs
```

## Documentation

When behavior changes, update `README.md` and this file in the same change.

Keep documentation human readable. Prefer short sections, simple examples, and accurate current paths.
