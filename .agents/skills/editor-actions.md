# `src/js/editor-actions.js`

- Change toolbar behavior, shared native/context-menu clipboard payload insertion, WYSIWYG commands, Markdown text transforms, link insertion, code formatting, list toggles, and selection handling here.
- Use this file when the work affects editor commands.
- Keep rich paste routed through `insertClipboardPayload` and `ME.markdown.sanitizePastedHtml`; do not insert raw clipboard HTML or schedule more than one WYSIWYG sync for one paste.
