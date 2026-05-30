# AGENTS.md

## Project

LocalDraftAI is a local-first, browser-based Markdown editor with WYSIWYG editing, Markdown source editing, Soft Wrap, local file access, image asset handling, multi-tab sessions, and AI-assisted writing actions.

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
src/js/editor-mode.js        Editor mode, Soft Wrap, and caret/offset helpers
src/js/editor-actions.js     Editor formatting commands
src/js/file-store.js         Local file open/save
src/js/recent-files.js       Recent files
src/js/asset-store.js        Local image workspace/assets handling
src/js/ai-assistant.js       AI workflow and review/apply dialog
src/js/ai-actions.js         AI action definitions and transforms
src/js/ai-diff.js            Visual diff helpers for AI review results
src/js/ai-patch.js           Interactive AI diff accept/reject state
src/js/ai-provider.js        Compatibility wrapper for AI provider calls
src/js/ai-provider-registry.js Built-in AI provider descriptors, groups, defaults, aliases
src/js/ai-provider-manager.js Provider registry, settings migration, normalized AI results
src/js/ai-provider-common.js Shared AI provider request, parsing, and error helpers
src/js/ai-provider-openai-compatible.js OpenAI-compatible custom and cloud provider transport
src/js/ai-provider-ollama.js Native Ollama provider
src/js/ai-provider-openai.js OpenAI compatibility registration
src/js/ai-provider-anthropic.js Claude/Anthropic Messages provider
src/js/ai-provider-gemini.js Gemini compatibility registration
src/js/ai-reasoning.js       Reasoning mode normalization and provider mappings
src/js/ai-settings.js        AI settings dialog
src/js/ai-status.js          AI connection/status display
src/js/ai-context-menu.js    Right-click editor clipboard and AI action menu
src/js/markdown-ai-guards.js AI output safety checks for Markdown
src/js/markdown-repair.js    Markdown cleanup helpers
tests/unit/                  Dependency-free unit tests
tests/e2e/                   Dependency-free browser smoke tests
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
- Layout, editor surface, Soft Wrap, focus mode, viewport behavior:
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
- The editor right-click menu should include Cut, Copy, and Paste; Markdown mode uses plain text, while WYSIWYG mode should preserve rich HTML clipboard data when the browser allows it.
- Markdown mode should accept plain Markdown text.
- Markdown rendering and toolbar actions support basic blocks including headings, lists, block quotes, code fences, images, links, and horizontal rules.
- Escaped Markdown punctuation should render and round-trip as literal text in WYSIWYG mode.
- LocalDraftAI uses one main editor surface.
- Only one editor mode is visible at a time: WYSIWYG or Markdown.
- WYSIWYG remains the editable rendered view.
- Markdown remains the source of truth for saving and syncing.
- Soft Wrap affects visual wrapping only in WYSIWYG and Markdown modes and must not change saved Markdown content.
- The right-hand workspace should remain available for future AI Assistant panels.
- AI actions should operate on selected text and show a review dialog before applying changes.
- AI review should keep AI Result editable and refresh the visual diff when it changes.
- AI review should show the AI Engine summary for the provider, model, and reasoning settings that generated the currently visible result.
- AI review Advanced overrides should be temporary to the current action dialog and should only affect output after Regenerate Result succeeds.
- AI interactive review should keep accept/reject choices in review state and apply only after the final apply click.
- AI provider mode should support local mock mode, native Ollama, OpenAI, Gemini, Groq, OpenRouter, Mistral, Claude, Grok, and OpenAI-compatible custom server mode.
- AI reasoning mode should support Auto, Off, Low, Medium, High, and Extra High, map them to provider-supported reasoning controls, and only show provider-returned summaries when requested.
- AI errors should be visible and recoverable, not silent.
- The feedback hint should link to the GitHub issues page.

## Testing

Run the relevant unit tests after changes.

Common commands:

```bash
node tests/unit/ai-actions.test.js
node tests/unit/ai-assistant.test.js
node tests/unit/ai-context-menu.test.js
node tests/unit/ai-diff.test.js
node tests/unit/ai-patch.test.js
node tests/unit/ai-provider-anthropic.test.js
node tests/unit/ai-provider-gemini.test.js
node tests/unit/ai-provider-manager.test.js
node tests/unit/ai-provider-ollama.test.js
node tests/unit/ai-provider-openai.test.js
node tests/unit/ai-provider-registry.test.js
node tests/unit/ai-provider.test.js
node tests/unit/ai-reasoning.test.js
node tests/unit/ai-settings.test.js
node tests/unit/ai-status.test.js
node tests/unit/ai-transport-openai-compatible.test.js
node tests/unit/editor-actions.test.js
node tests/unit/editor-mode.test.js
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

Run the headless browser Soft Wrap and mode-switch smoke test with Chrome available on `PATH`:

```bash
node --experimental-websocket tests/e2e/soft-wrap-mode-switch.headless.mjs
```

## Documentation

When behavior changes, update `README.md` and this file in the same change.

Keep documentation human readable. Prefer short sections, simple examples, and accurate current paths.
