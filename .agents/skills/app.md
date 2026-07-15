# `src/js/app.js`

- Change app bootstrapping, shared state, editor mode switching, Soft Wrap state, event binding, paste routing, keyboard shortcuts, counts, and module wiring here.
- Use this file when the work affects how the app runs.
- Native WYSIWYG paste delegates to `editorActions.handleWysiwygPasteEvent`; app wiring only supplies the existing image-storage callback and must not duplicate HTML sanitizing or insertion policy.
