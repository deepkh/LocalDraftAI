# Workbench layout

- Keep the semantic shell in `src/local_draft_ai.html` organized as `menu-bar`, `workbench-body`, `activity-bar`, `primary-sidebar`, `editor-area`, `secondary-sidebar`, and `status-bar`.
- Keep workbench geometry and responsive presentation in `src/styles.css`. Preserve the existing `1180px`, `1000px`, and `620px` side-panel breakpoints unless a tested replacement is introduced.
- Layout code may coordinate region visibility and reserve panel widths, but it must not own document text, tabs, workspace files, AI review state, or persisted file handles.
- `src/js/workspace-sidebar.js` continues to own Primary Sidebar mode, active workspace panel, width, collapse state, and scroll state. Do not rename its localStorage keys without migration code.
- `src/js/ai-assistant.js` continues to own AI review visibility and content in the Secondary Sidebar. `src/js/resizer.js` continues to own its persisted width and editor-width clamping.
- `src/js/activity-bar.js` owns only active workbench view and sidebar-visibility coordination. It routes Files, Search, and Related to `workspace-sidebar.js`, and AI visibility to `ai-assistant.js`. AI provider settings remain available inside the AI Assistant panel.
- `src/js/command-registry.js` maps command ids to existing application functions. `src/js/menu-bar.js` owns static menu open/close, positioning, keyboard navigation, and command dispatch; it must not duplicate file, editor, workspace, or AI implementations.
- `src/js/status-bar.js` formats workbench status passed from existing owners. It may debounce display calculations, but it must not become an independent document, workspace, or provider state store.
- At `1180px` and below the AI Secondary Sidebar overlays the editor; at `1000px` and below the expanded Primary Sidebar overlays it. At `620px` and below, lower-priority Status Bar fields and the Menu Bar brand may be hidden so all application menus remain reachable.
