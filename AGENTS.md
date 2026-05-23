# AGENTS.md

## Project

LocalDraftAI is a local-first, browser-based Markdown editor with WYSIWYG editing, plain Markdown editing, live preview, local file access, image asset handling, multi-tab sessions, and AI-assisted writing actions.

The app is currently a dependency-free static HTML/CSS/JavaScript project. Preserve that structure unless the user explicitly asks for a build system or new dependencies.

## Core Rules

- Keep the app local-first and usable without an AI server.
- Keep Markdown as the source of truth.
- Keep changes small, readable, and easy to review.
- Do not add dependencies unless requested.
- Do not rewrite unrelated code.
- Ask before destructive actions, deleting files, or rewriting git history.
- Ask before reading or writing outside this repo or `/tmp`.
- It is OK to run normal inspection, edit, and test commands inside this repo.

## Important Paths

```text
src/local_draft_ai.html      Main app shell
assets/LocalDraftAI.ico      App favicon
assets/local-draft-ai-snapshot.png README snapshot image
src/styles.css               App styling
src/js/app.js                App startup and wiring
src/js/document-session.js   Per-tab document state
src/js/tab-manager.js        Multi-tab behavior
src/js/markdown.js           Markdown conversion/rendering
src/js/editor-actions.js     Editor formatting commands
src/js/file-store.js         Local file open/save
src/js/recent-files.js       Recent files
src/js/asset-store.js        Local image workspace/assets handling
src/js/ai-assistant.js       AI workflow and review/apply dialog
src/js/ai-actions.js         AI action definitions and transforms
src/js/ai-provider.js        OpenAI-compatible provider calls
src/js/ai-settings.js        AI settings dialog
src/js/ai-status.js          AI connection/status display
src/js/ai-context-menu.js    Right-click AI action menu
src/js/markdown-ai-guards.js AI output safety checks for Markdown
src/js/markdown-repair.js    Markdown cleanup helpers
tests/unit/                  Dependency-free unit tests
.agents/skills/              More detailed subsystem guidance
```

## Subsystem Routing

Before editing, read only the relevant files and the matching skill file under `.agents/skills/`.

Use these routes:

- AI Assistant, AI menu, settings, provider, status, review/apply flow:
  - `.agents/skills/ai-assistant.md`
  - `src/js/ai-*.js`
  - `src/js/markdown-ai-guards.js`
  - `src/js/markdown-repair.js`
- Tabs, active document ownership, dirty state, tab scrolling, tab reordering:
  - `.agents/skills/tab-manager.md`
  - `src/js/tab-manager.js`
  - `src/js/document-session.js`
- Local file open/save and recent files:
  - `.agents/skills/file-access.md`
  - `src/js/file-store.js`
  - `src/js/recent-files.js`
- Images and workspace assets:
  - `.agents/skills/asset-store.md`
  - `src/js/asset-store.js`
- Markdown parsing, rendering, Markdown mode, WYSIWYG conversion:
  - `.agents/skills/markdown.md`
  - `.agents/skills/markdown-editor-html.md`
  - `src/js/markdown.js`
- Formatting buttons and editor commands:
  - `.agents/skills/editor-actions.md`
  - `src/js/editor-actions.js`
- Layout, preview pane, resizing, focus mode, viewport behavior:
  - `.agents/skills/styles.md`
  - `.agents/skills/resizer.md`
  - `.agents/skills/viewport.md`
  - `src/styles.css`
  - `src/js/resizer.js`
  - `src/js/viewport.js`

If a new subsystem is added, create or update a small skill file in `.agents/skills/`.

## Behavior Notes

- Each open document tab owns its own title, dirty state, active mode, scroll state, undo/redo history, file handle, workspace folder, and image object URLs.
- WYSIWYG mode supports rich HTML paste.
- Markdown mode should accept plain Markdown text.
- Markdown rendering and toolbar actions support basic blocks including headings, lists, block quotes, code fences, images, links, and horizontal rules.
- The right pane is a read-only live preview and can be hidden.
- AI actions should operate on selected text and show a review dialog before applying changes.
- AI provider mode should support local mock mode and OpenAI-compatible server mode.
- AI errors should be visible and recoverable, not silent.

## Testing

Run the relevant unit tests after changes.

Common commands:

```bash
node tests/unit/ai-actions.test.js
node tests/unit/ai-assistant.test.js
node tests/unit/ai-context-menu.test.js
node tests/unit/ai-provider.test.js
node tests/unit/ai-settings.test.js
node tests/unit/ai-status.test.js
node tests/unit/editor-actions.test.js
node tests/unit/markdown-ai-guards.test.js
node tests/unit/markdown.test.js
node tests/unit/tab-manager.test.js
```

Run all tests:

```bash
for test in tests/unit/*.test.js; do
  node "$test"
done
```

## Documentation

When behavior changes, update `README.md` and this file in the same change.

Keep documentation human readable. Prefer short sections, simple examples, and accurate current paths.
