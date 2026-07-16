# Editor toolbar

- Keep compact topbar structure in `src/local_draft_ai.html`, presentation and responsive priorities in `src/styles.css`, UI coordination in `src/js/editor-toolbar.js`, and application-state synchronization in `src/js/app.js`.
- The controller owns only the formatting-row preference, effective visibility, popup open/close state, positioning, keyboard navigation, focus restoration, command dispatch, and listener cleanup. It must not own document text, editor mode, tabs, AI generation, file operations, or formatting algorithms.
- Persist the user preference under `localdraftai.ui.formatToolbarVisible`. Missing or unreadable storage defaults to collapsed, and storage failures must not prevent current-session UI updates.
- Keep `preferredVisible` separate from `effectiveVisible`. Effective visibility is the preference combined with Markdown-command capability and the inverse of Focus Mode.
- Focus Mode and source-only documents temporarily hide the formatting row without changing the stored preference. Returning to a Markdown document or leaving Focus Mode restores the preferred state.
- Synchronize from the existing active-session, document-type, editor-mode, Focus Mode, workspace-restore, and AI-panel visibility paths in `src/js/app.js`; do not scatter independent state changes across event handlers.
- Topbar popup menus allow only one open menu, close on outside pointer input, resize, active-document changes, Focus Mode, Escape, command activation, or controller destruction, and support Arrow keys, Home, End, Enter, Space, Escape, and Tab.
- Elements with `data-command` execute once through `src/js/command-registry.js`. Elements with `data-action` continue through the single delegated editor-action path in `src/js/app.js`; the toolbar controller closes their menu but never executes the editing action.
- Keep every responsive-hidden primary formatting action available in the formatting More menu. Preserve existing command IDs, control IDs, and editor action names.
- Run `node tests/unit/editor-toolbar.test.js` and `node --experimental-websocket tests/e2e/compact-topbar.headless.mjs` with the relevant editor-action, tab, viewport, layout, mode-switch, source-only, and AI panel regressions.
