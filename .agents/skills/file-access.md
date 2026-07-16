# File access

- Change browser file picker integration and File System Access API calls in `src/js/local-filesystem-provider.js`.
- Keep source-text decoding, UTF-8 BOM detection, line-ending preservation, final-newline preservation, and provider-neutral save/open orchestration in `src/js/file-store.js`.
- Use `src/js/storage-resource.js` for document identity/revision metadata and `src/js/storage-provider-registry.js` for provider lookup and normalized errors.
- Keep IndexedDB-backed standalone local recent files in `src/js/recent-files.js`; reopen them through the local provider rather than calling `getFile()` directly.
- Keep the app dependency-free and preserve the static HTML/CSS/JavaScript structure.
