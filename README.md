# LocalDraftAI

![Static App](https://img.shields.io/badge/Static_HTML-CSS_JS-0969da?style=for-the-badge&logo=github)
![Local First](https://img.shields.io/badge/Local_First-AI_Assisted-8250df?style=for-the-badge)
![MIT License](https://img.shields.io/badge/License-MIT-2da44e?style=for-the-badge&logo=github)

**Your local AI-powered Markdown editor.**

LocalDraftAI is a local-first Markdown editor that runs in your browser. It gives you a WYSIWYG editor, plain Markdown editing, live preview, local file access, image handling, multi-tab editing, and AI-assisted writing actions.

It is designed for people who want a simple Markdown workspace without a heavy desktop app or cloud-only workflow.

---

## Snapshot

![LocalDraftAI snapshot](assets/local-draft-ai-snapshot.png)

---

## Highlights

- **Local browser app**: open the HTML file directly or serve it from `localhost`.
- **WYSIWYG + Markdown modes**: edit visually or work directly with Markdown text.
- **Live preview**: preview rendered Markdown beside the editor.
- **Multi-tab editing**: open multiple documents, switch tabs, close tabs, scroll many tabs, and reorder tabs by drag-and-drop.
- **Local file workflow**: open and save `.md`, `.markdown`, and `.txt` files in browsers that support the File System Access API.
- **Image support**: paste, drop, or insert PNG, JPEG, WebP, and GIF images.
- **Workspace assets folder**: inserted local images can be copied into an `assets/` folder and linked with relative Markdown paths.
- **AI Assistant**: fix grammar, improve wording, make text professional, summarize, shorten, and clean up Markdown.
- **Review before apply**: AI output is shown in a review dialog before it replaces selected text.
- **AI status visibility**: see mock mode, connection checks, connected state, server errors, auth errors, and running actions.
- **Focus mode**: hide extra controls and keep writing with fewer distractions.
- **No build step required**: static HTML, CSS, and JavaScript.

---

## What You Can Do With It

LocalDraftAI is useful for writing and editing:

- README files
- technical notes
- project documentation
- blog drafts
- meeting notes
- Markdown documents with local images
- rough text that needs grammar or wording cleanup

Typical workflow:

```text
Open LocalDraftAI
  -> create or open a Markdown file
  -> write in WYSIWYG or Markdown mode
  -> select text
  -> run an AI Assistant action
  -> review the result
  -> apply it
  -> save back to local disk
```

---

## Run It

Open this file in a browser:

```text
src/local_draft_ai.html
```

No install step is required.

For the best local file and AI server behavior, you can serve the project from a local HTTP origin:

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:8000/src/local_draft_ai.html
```

## Browser Support Notes

LocalDraftAI works best in Chromium-based browsers such as Chrome or Edge.

Browsers without the File System Access API can still use the editor, but local open/save controls may be limited or disabled. Local image storage also requires browser file and folder access.

When you paste, drop, or insert the first local image, the app asks for a workspace folder. It then creates or reuses an `assets/` folder and inserts Markdown image links such as:

```markdown
![photo](assets/photo.png)
```

---

## AI Assistant

The AI Assistant can be opened from the toolbar menu or from the editor right-click menu when text is selected.

Example actions:

- Fix grammar
- Improve wording
- Make professional
- Summarize
- Make shorter
- Beautify Markdown
- Fix Markdown syntax

The AI Assistant uses local mock transforms by default, so the UI can be tested without a real AI server.

To use a real model, configure an OpenAI-compatible server.

### Configure AI Server

1. Open LocalDraftAI.
2. Click **AI Assistant**.
3. Click **Settings**.
4. Choose **OpenAI-compatible server**.
5. Enter the server URL.
6. Enter a model name, or click **List Models** and choose one from the dropdown.
7. Enter an API key if your server requires one.
8. Click **Test Connection**.
9. Click **Save**.
10. Select text in the editor, choose an AI action, review the result, then click **Apply**.

Example local Ollama-compatible settings:

```text
Server URL: http://127.0.0.1:11434/v1/
Model: qwen3:4b
API Key: optional
```

The settings dialog lists models from:

```text
/models
```

AI actions are sent to:

```text
/chat/completions
```

### Ollama CORS Note

If the browser reports a connection or CORS error, serve the app from `localhost` instead of opening it as `file://`.

For Ollama, you may also need to allow browser origins:

```bash
OLLAMA_ORIGINS=*
```

Restart Ollama after changing the environment variable.

---

## Keyboard Shortcuts

### File

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd + N` | New tab |
| `Ctrl/Cmd + O` | Open file into a tab |
| `Ctrl/Cmd + S` | Save |
| `Ctrl/Cmd + Shift + S` | Save As |
| `Ctrl/Cmd + W` | Close active tab |

### Tabs

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd + PageUp` | Previous tab |
| `Ctrl/Cmd + PageDown` | Next tab |
| `Ctrl/Cmd + Shift + PageUp` | Move active tab left |
| `Ctrl/Cmd + Shift + PageDown` | Move active tab right |
| `Ctrl/Cmd + 1` through `Ctrl/Cmd + 9` | Jump to tab by position |

### Editing

| Shortcut | Action |
|---|---|
| `Tab` | Indent list item |
| `Shift + Tab` | Outdent list item |
| `Ctrl/Cmd + Shift + F` | Toggle Focus mode |
| `Escape` | Exit Focus mode |

---

## Project Layout

```text
.
├── assets/
│   ├── LocalDraftAI.ico
│   └── local-draft-ai-snapshot.png
├── src/
│   ├── local_draft_ai.html
│   ├── styles.css
│   └── js/
│       ├── app.js
│       ├── asset-store.js
│       ├── ai-actions.js
│       ├── ai-assistant.js
│       ├── ai-context-menu.js
│       ├── ai-provider.js
│       ├── ai-settings.js
│       ├── ai-status.js
│       ├── document-session.js
│       ├── editor-actions.js
│       ├── file-store.js
│       ├── history.js
│       ├── markdown.js
│       ├── markdown-ai-guards.js
│       ├── markdown-repair.js
│       ├── recent-files.js
│       ├── resizer.js
│       ├── tab-manager.js
│       ├── utils.js
│       └── viewport.js
├── tests/
│   └── unit/
│       ├── ai-actions.test.js
│       ├── ai-assistant.test.js
│       ├── ai-context-menu.test.js
│       ├── ai-provider.test.js
│       ├── ai-settings.test.js
│       ├── ai-status.test.js
│       ├── editor-actions.test.js
│       ├── markdown-ai-guards.test.js
│       ├── markdown.test.js
│       └── tab-manager.test.js
├── AGENTS.md
├── LICENSE
└── README.md
```

---

## Main Modules

| File | Purpose |
|---|---|
| `src/local_draft_ai.html` | Main static app shell |
| `src/styles.css` | App layout and visual styles |
| `src/js/app.js` | App startup and high-level wiring |
| `src/js/document-session.js` | Per-tab document state |
| `src/js/tab-manager.js` | Multi-tab behavior |
| `src/js/markdown.js` | Markdown parsing/rendering helpers |
| `src/js/editor-actions.js` | Editor formatting commands |
| `src/js/file-store.js` | Local file open/save helpers |
| `src/js/recent-files.js` | Recent file list storage |
| `src/js/asset-store.js` | Local image workspace handling |
| `src/js/ai-assistant.js` | AI action workflow and review dialog |
| `src/js/ai-provider.js` | OpenAI-compatible provider calls |
| `src/js/ai-settings.js` | AI settings dialog |
| `src/js/ai-status.js` | AI status display |
| `src/js/ai-context-menu.js` | Right-click AI actions |
| `src/js/markdown-ai-guards.js` | Markdown safety checks for AI output |
| `src/js/markdown-repair.js` | Markdown cleanup helpers |

---

## Tests

Run the dependency-free unit tests with Node.js:

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

Or run all unit tests from a shell:

```bash
for test in tests/unit/*.test.js; do
  node "$test"
done
```

---

## Design Goals

LocalDraftAI should stay:

- **local-first**
- **easy to open**
- **simple to understand**
- **safe for local files**
- **useful without AI**
- **better with AI**
- **dependency-free unless a build system is intentionally added**

---

## License

MIT
