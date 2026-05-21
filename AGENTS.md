# AGENTS.md

## Project Purpose

- A local, browser-based Markdown editor.
- The left pane has two editing modes:
  - WYSIWYG mode supports rich text editing and `text/html` paste.
  - Markdown mode shows plain Markdown text and only accepts `text/plain` paste.
- The app keeps Markdown as the source text. WYSIWYG edits are converted to Markdown in the background, and Markdown edits update the preview immediately.
- Markdown image syntax renders in the editor and preview.
- Pasted, dropped, or inserted local images are copied into an `assets/` folder inside a user-selected workspace folder and inserted as relative Markdown links.
- The right pane is a live, read-only Markdown preview. It can be shown or hidden.
- The first toolbar row provides file actions: document title, active file name, New, Open, Save, Save As, and Recent files.
- The second toolbar row provides common editor actions such as headings, bold, italic, code, lists, blockquotes, links, undo, redo, mode switching, preview toggling, and About.
- File shortcuts are Ctrl/Cmd+N for New, Ctrl/Cmd+O for Open, Ctrl/Cmd+S for Save, and Ctrl/Cmd+Shift+S for Save As.

## Current Folder Layout

```text
.
├── .agents
│   └── skills
│       ├── asset-store.md
│       ├── app.md
│       ├── document-session.md
│       ├── editor-actions.md
│       ├── file-access.md
│       ├── history.md
│       ├── markdown-editor-html.md
│       ├── markdown.md
│       ├── resizer.md
│       ├── styles.md
│       ├── utils.md
│       └── viewport.md
├── assets
├── AGENTS.md
├── LICENSE
├── README.md
└── src
    ├── markdown_forge.html
    ├── styles.css
    └── js
        ├── app.js
        ├── asset-store.js
        ├── document-session.js
        ├── editor-actions.js
        ├── file-store.js
        ├── history.js
        ├── markdown.js
        ├── recent-files.js
        ├── resizer.js
        ├── utils.js
        └── viewport.js
```

## Important Paths

```text
.agents/skills/
src/markdown_forge.html
src/styles.css
src/js/app.js
src/js/asset-store.js
src/js/document-session.js
src/js/file-store.js
src/js/recent-files.js
src/js/markdown.js
src/js/editor-actions.js
src/js/history.js
src/js/viewport.js
src/js/resizer.js
src/js/utils.js
```

## Skill Routing

- Keep subsystem routing in `.agents/skills/`.
- Use the matching file there when a change touches the relevant area.
- Use `.agents/skills/asset-store.md` when a change touches local image workspace storage.
- Add or update a small skill file when a new subsystem needs routing guidance.

## Load Only Relevant Detail

- Read only the files directly related to the requested change before editing.
- Prefer `rg` and `rg --files` when searching the project.
- Keep diffs small and reviewable.

## Safety Rules

- Ask before destructive commands such as deleting files or rewriting git history.
- Do not add dependencies unless asked.
- Do not update `requirements.txt` unless asked.
- Preserve the dependency-free static app structure unless the user asks for a build system.

## Documentation Rule

- Keep documentation simple, human readable, and consistent with the current static HTML/CSS/JavaScript implementation.
- For every code change, update `README.md` and `AGENTS.md` in the same run so user-facing behavior, project layout, important paths, and routing rules stay current.
- Update the folder layout in this file when files are added, removed, or moved.
