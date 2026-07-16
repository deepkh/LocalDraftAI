# `src/js/asset-store.js`

- Change local image file selection, workspace folder prompts, provider-aware `assets/` directory creation, generated image filenames, and copied image writes here.
- Use this file when the work affects pasted, dropped, or inserted image storage.
- For Remote SSH sessions, dispatch binary writes through the active storage provider. Never open a local destination picker, retain SSH details, or fall back to a local asset folder.
- Keep remote names safe and unique, store assets below the canonical workspace root, and return a workspace-relative path so the app can form a Markdown-relative link for nested documents.
- Remote image object URLs are document-session state owned by `app.js`; revoke them on tab close or document reload.
