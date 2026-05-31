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
- Keep the workspace Markdown-focused. Show `.md` and `.markdown` files, keep non-Markdown files hidden, and avoid adding a general source-code explorer unless explicitly requested.
- Restore previous workspaces only after a user clicks the restore action. Store handles and lightweight tab metadata in IndexedDB; restore document text from disk.
- Keep file operations conservative. Do not add Delete. Rename should write the new file first and fail clearly if safe removal of the old entry is unavailable.
- Content search should scan Markdown files only, debounce input, and cap result counts.
- Related files should stay rule-based: same folder, Markdown links, recently opened workspace files, and plan files. Do not add AI agent execution, embeddings, Git, terminal, rollback, Codex CLI, or OpenCode behavior here.
