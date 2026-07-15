# `src/local_draft_ai.html`

- Change page structure, toolbar controls, the one-surface editor layout, script order, and document metadata here.
- Use this file when the work affects the visible shell of the editor.
- Keep `markdown.js` loaded before `editor-actions.js` and `app.js` so every WYSIWYG rich paste route can use the shared sanitizer; do not add inline HTML paste handlers that bypass app routing.
