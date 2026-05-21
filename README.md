# Markdown Forge

![GitHub](https://img.shields.io/badge/GitHub-Markdown_Forge-181717?style=for-the-badge&logo=github)
![Static App](https://img.shields.io/badge/Static_HTML-CSS_JS-0969da?style=for-the-badge&logo=github)
![MIT License](https://img.shields.io/badge/License-MIT-2da44e?style=for-the-badge&logo=github)

A small local Markdown editor that runs in the browser.

## Snapshot

![Markdown Forge snapshot](assets/markdown-forge-snapshot.png)

## What It Does

- Edit in WYSIWYG mode or plain Markdown mode.
- Paste rich HTML into the WYSIWYG editor.
- Paste plain text into the Markdown editor.
- See a live Markdown preview beside the editor.
- Hide or show the preview pane.
- Use common toolbar actions for headings, bold, italic, code, lists, quotes, links, undo, and redo.

## Run It

Open this file in a browser:

```text
src/markdown_forge.html
```

No install step is needed.

## Project Layout

```text
src/
├── markdown_forge.html
├── styles.css
└── js/
    ├── app.js
    ├── editor-actions.js
    ├── history.js
    ├── markdown.js
    ├── resizer.js
    ├── utils.js
    └── viewport.js
```

## License

MIT
