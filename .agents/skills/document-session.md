# Document sessions

- Change active document state, document titles, dirty tracking, session-owned history, active editor mode, and per-document scroll state in `src/js/document-session.js` and `src/js/app.js`.
- Store new document ownership in `storageProviderId`, `storageResource`, `storageRevision`, and `workspaceId`. Treat `storageResource.opaque` as provider-owned.
- Keep `fileHandle`, `workspaceFileHandle`, `workspaceDirHandle`, and `workspaceFolder` only for local compatibility; new application code uses the provider/resource fields.
- Use this file when the work affects how editor state is owned by the current document.
