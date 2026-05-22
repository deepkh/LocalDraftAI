# Markdown Forge

![GitHub](https://img.shields.io/badge/GitHub-Markdown_Forge-181717?style=for-the-badge&logo=github)
![Static App](https://img.shields.io/badge/Static_HTML-CSS_JS-0969da?style=for-the-badge&logo=github)
![MIT License](https://img.shields.io/badge/License-MIT-2da44e?style=for-the-badge&logo=github)

A small local Markdown editor that runs in the browser.

## Snapshot

![Markdown Forge snapshot](assets/markdown-forge-snapshot.png)

## What It Does

- Keeps the active document in a document session with its own title, dirty state, editor mode, scroll state, and undo/redo history.
- Edit in WYSIWYG mode or plain Markdown mode.
- Paste rich HTML into the WYSIWYG editor.
- Paste plain text into the Markdown editor.
- Render Markdown image syntax such as `![Alt](assets/a.png)` in the editor and preview.
- Paste, drop, or insert PNG, JPEG, WebP, and GIF images in WYSIWYG workflows.
- Store inserted local images in an `assets/` folder inside a user-chosen workspace folder, then add relative Markdown links such as `![photo](assets/photo.png)`.
- See a live Markdown preview beside the editor.
- Hide or show the preview pane.
- Use the first toolbar row for the app title, active file name, New, Open, Save, Save As, and Recent files.
- Use the second toolbar row for headings, bold, italic, code, lists, quotes, links, undo, redo, mode switching, preview, and About.
- Open and save local `.md`, `.markdown`, and `.txt` files in browsers that support the File System Access API.
- Reopen recent files from an IndexedDB-backed recent-file list.
- Warn before New, Open, Recent, refresh, or close discards unsaved changes to the active document.
- Use file shortcuts: Ctrl/Cmd+N for New, Ctrl/Cmd+O for Open, Ctrl/Cmd+S for Save, and Ctrl/Cmd+Shift+S for Save As.

Browsers without the File System Access API keep the editor working, but file controls are disabled.
Local image storage also requires browser file and folder access. The first pasted, dropped, or inserted local image asks for a workspace folder, and Markdown Forge creates or reuses that folder's `assets/` directory.

## Run It

Open this file in a browser:

```text
src/markdown_forge.html
```

No install step is needed.

## Project Layout

```text
assets/
├── MarkdownForge.ico
└── markdown-forge-snapshot.png
src/
├── markdown_forge.html
├── styles.css
└── js/
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

## License

MIT
