# AGENTS.md

## Project Purpose

- A local, browser-based Markdown editor.
- The app supports in-memory document tabs. Each tab owns its own session state, file handle, workspace folder, history, active mode, scroll state, dirty state, and image object URLs.
- The left pane has two editing modes:
  - WYSIWYG mode supports rich text editing and `text/html` paste.
  - Markdown mode shows plain Markdown text and only accepts `text/plain` paste.
- The app keeps Markdown as the source text. WYSIWYG edits are converted to Markdown in the background, and Markdown edits update the preview immediately.
- Markdown image syntax renders in the editor and preview.
- Pasted, dropped, or inserted local images are copied into an `assets/` folder inside a user-selected workspace folder and inserted as relative Markdown links.
- The right pane is a live, read-only Markdown preview. It can be shown or hidden.
- Focus mode hides the file toolbar and formatting controls behind a small floating Exit Focus button while keeping the tab strip docked above the editor and preview so open documents remain accessible.
- The first toolbar row provides file actions: document title, active file name, New, Open, Save, Save As, and Recent files with removable entries.
- The second toolbar row provides common editor actions such as headings, bold, italic, code, lists, blockquotes, links, undo, redo, mode switching, preview toggling, Focus mode, and About with the MIT license.
- The tab strip provides scroll controls, clickable open document tabs, close controls, dirty indicators, drag reordering, and a `+` button for a new tab.
- The app warns before closing a dirty tab or before refresh/close discards unsaved changes in any open document.
- The AI Assistant works only in Markdown mode and only replaces selected text after a review dialog. It is available from the toolbar and from the Markdown editor context menu when text is selected.
- File shortcuts are Ctrl/Cmd+N for New tab, Ctrl/Cmd+O for Open into a tab, Ctrl/Cmd+S for Save, and Ctrl/Cmd+Shift+S for Save As.
- Tab shortcuts are Ctrl/Cmd+W for Close tab, Ctrl/Cmd+PageUp/PageDown for previous/next tab, Ctrl/Cmd+Shift+PageUp/PageDown for moving the active tab left/right, and Ctrl/Cmd+1 through Ctrl/Cmd+9 for tab positions.
- Focus mode shortcuts are Ctrl/Cmd+Shift+F to toggle Focus mode and Escape to exit Focus mode.

## Current Folder Layout

```text
.
├── assets
│   ├── MarkdownForge.ico
│   └── markdown-forge-snapshot.png
├── .agents
│   └── skills
│       ├── ai-assistant.md
│       ├── asset-store.md
│       ├── app.md
│       ├── document-session.md
│       ├── editor-actions.md
│       ├── file-access.md
│       ├── history.md
│       ├── markdown-editor-html.md
│       ├── markdown.md
│       ├── resizer.md
│       ├── tab-manager.md
│       ├── styles.md
│       ├── utils.md
│       └── viewport.md
├── AGENTS.md
├── LICENSE
├── README.md
├── src
│   ├── markdown_forge.html
│   ├── styles.css
│   └── js
│       ├── app.js
│       ├── asset-store.js
│       ├── ai-actions.js
│       ├── ai-assistant.js
│       ├── ai-context-menu.js
│       ├── ai-provider.js
│       ├── document-session.js
│       ├── editor-actions.js
│       ├── file-store.js
│       ├── history.js
│       ├── markdown.js
│       ├── markdown-ai-guards.js
│       ├── markdown-repair.js
│       ├── recent-files.js
│       ├── resizer.js
│       ├── tab-manager.js
│       ├── utils.js
│       └── viewport.js
└── tests
    └── unit
        ├── ai-actions.test.js
        └── tab-manager.test.js
```

## Important Paths

```text
.agents/skills/
.agents/skills/ai-assistant.md
assets/MarkdownForge.ico
src/markdown_forge.html
src/styles.css
src/js/app.js
src/js/asset-store.js
src/js/ai-actions.js
src/js/ai-assistant.js
src/js/ai-context-menu.js
src/js/ai-provider.js
src/js/document-session.js
src/js/file-store.js
src/js/recent-files.js
src/js/markdown.js
src/js/markdown-ai-guards.js
src/js/markdown-repair.js
src/js/editor-actions.js
src/js/history.js
src/js/tab-manager.js
src/js/viewport.js
src/js/resizer.js
src/js/utils.js
tests/unit/ai-actions.test.js
tests/unit/tab-manager.test.js
```

## Skill Routing

- Keep subsystem routing in `.agents/skills/`.
- Use the matching file there when a change touches the relevant area.
- Use `.agents/skills/ai-assistant.md` when a change touches AI Assistant menus, selected-text AI workflows, provider calls, review/apply behavior, or local mock AI transforms.
- Use `.agents/skills/asset-store.md` when a change touches local image workspace storage.
- Use `.agents/skills/tab-manager.md` when a change touches in-memory tab ownership, active tab selection, tab closing, or file-handle lookup across tabs.
- Add or update a small skill file when a new subsystem needs routing guidance.

## Load Only Relevant Detail

- Read only the files directly related to the requested change before editing.
- Prefer `rg` and `rg --files` when searching the project.
- Keep diffs small and reviewable.

## Safety Rules

- Allow for using any tools / CLI commands without asking permission in this repo and /tmp.
- Ask before using any tools / CLI command to read / write outside of this repo and /tmp.
- Ask before destructive commands such as deleting files or rewriting git history.
- Do not add dependencies unless asked.
- Preserve the dependency-free static app structure unless the user asks for a build system.

## Documentation Rule

- Keep documentation simple, human readable, and consistent with the current static HTML/CSS/JavaScript implementation.
- For every code change, update `README.md` and `AGENTS.md` in the same run so user-facing behavior, project layout, important paths, and routing rules stay current.
- Update the folder layout in this file when files are added, removed, or moved.
