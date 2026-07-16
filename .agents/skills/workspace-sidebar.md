# Workspace sidebar

- Change local folder scanning, Markdown workspace tree rendering, workspace restore prompts, safe Markdown operations, workspace content search, related files, plan badges, and sidebar sizing/state in:
  - `src/js/workspace-store.js`
  - `src/js/workspace-sidebar.js`
  - `src/js/workspace-session.js`
  - `src/js/workspace-operations.js`
  - `src/js/workspace-search.js`
  - `src/js/workspace-related.js`
  - `src/js/app.js`
  - `src/styles.css`
- Show only document types registered in `document-type.js` (`.md`, `.markdown`, `.txt`, `.log`, `.json`, `.yml`, and `.yaml`). Keep all unsupported files hidden and avoid adding a general source-code explorer unless explicitly requested.
- Treat the local eager tree as a relevant-folder tree: retain a directory only when it has a registered supported-document descendant or its workspace-relative path is temporarily preserved after creation through Explorer. Retain the full ancestor chain, derive local files and directories from the pruned canonical tree, and keep the preservation set session-only.
- Restore previous workspaces only after a user clicks the restore action. Store handles and lightweight tab metadata in IndexedDB; restore document text from disk.
- Represent the active workspace with a provider-aware descriptor. `workspace-store.js` keeps local trees eager and relevant-folder-pruned, while Remote SSH trees stay lazy. Remote open lists only the root, expansion loads and caches one directory, unloaded or empty directories remain visible, and directory errors stay on the affected node. Never recursively scan a remote workspace merely to determine Explorer visibility. `workspace-operations.js` validates names and dispatches mutations to the active provider.
- Keep IndexedDB schema version 3 provider-aware and normalize legacy version-2 `workspaceHandle` records to `local-fsa` without deleting old stores.
- Keep the Primary Sidebar compatible with the workbench layout: expanded/minimized/hidden modes beside the Activity Bar, center editor protected from becoming unusably narrow, and right AI review panel width clamping accounted for when both sides are visible.
- Keep file operations conservative. Do not add Delete. Local rename writes the new file first and removes the old entry only when the browser supports it; Remote SSH rename uses the provider's SFTP rename and updates any open tab resource after success.
- Content search should scan every registered text-document type, debounce input, and cap result counts.
- Related files should stay rule-based: every registered type gets same-folder and recently opened files; Markdown additionally gets Markdown links and plan files. Do not add AI agent execution, embeddings, Git, terminal, rollback, Codex CLI, or OpenCode behavior here.
