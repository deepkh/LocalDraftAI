# Markdown Forge

![GitHub](https://img.shields.io/badge/GitHub-Markdown_Forge-181717?style=for-the-badge&logo=github)
![Static App](https://img.shields.io/badge/Static_HTML-CSS_JS-0969da?style=for-the-badge&logo=github)
![MIT License](https://img.shields.io/badge/License-MIT-2da44e?style=for-the-badge&logo=github)

A small local Markdown editor that runs in the browser.

## Snapshot

![Markdown Forge snapshot](assets/markdown-forge-snapshot.png)

## What It Does

- Keeps each open document in its own tab with its own title, dirty state, editor mode, scroll state, undo/redo history, file handle, workspace folder, and image object URLs.
- Create, switch, close, scroll through, and reorder in-memory document tabs without discarding other open documents.
- Edit in WYSIWYG mode or plain Markdown mode.
- Paste rich HTML into the WYSIWYG editor.
- Paste plain text into the Markdown editor.
- Render Markdown image syntax such as `![Alt](assets/a.png)` in the editor and preview.
- Paste, drop, or insert PNG, JPEG, WebP, and GIF images in WYSIWYG workflows.
- Store inserted local images in an `assets/` folder inside a user-chosen workspace folder, then add relative Markdown links such as `![photo](assets/photo.png)`.
- See a live Markdown preview beside the editor.
- Hide or show the preview pane.
- Toggle Focus mode to collapse the file toolbar and formatting controls while keeping the tab strip docked above the editor and preview.
- Use the first toolbar row for the app title, active file name, New, Open, Save, Save As, and Recent files.
- Use the tab strip to switch documents by clicking a tab, close tabs, scroll through many open tabs, drag tabs into a new order, or create another untitled tab with `+`.
- Use the second toolbar row for headings, bold, italic, code, lists, quotes, links, undo, redo, mode switching, preview, Focus mode, and About.
- Use the AI Assistant toolbar menu or editor right-click menu to rewrite selected text after reviewing the result.
- Configure AI Assistant provider mode, endpoint, model, and API key from the AI Settings dialog.
- Load OpenAI-compatible model names into a visible AI Settings model dropdown.
- Read AI action details in the review dialog, including mode, endpoint, model, elapsed time, timeout, and recovery suggestions.
- See the AI Assistant status in the toolbar and menu, including mock mode, connection checks, connected state, server errors, auth errors, and running actions.
- Open the AI Assistant toolbar menu as a floating menu so it stays visible below the toolbar.
- Open and save local `.md`, `.markdown`, and `.txt` files in browsers that support the File System Access API.
- Reopen files or remove entries from an IndexedDB-backed recent-file list.
- View the MIT license from the About dialog.
- Warn before closing a dirty tab or refreshing/closing the browser with dirty documents.
- Use file shortcuts: Ctrl/Cmd+N for a new tab, Ctrl/Cmd+O to open a file into a tab, Ctrl/Cmd+S for Save, and Ctrl/Cmd+Shift+S for Save As.
- Use tab shortcuts: Ctrl/Cmd+W closes the active tab, Ctrl/Cmd+PageUp/PageDown switches tabs, Ctrl/Cmd+Shift+PageUp/PageDown reorders the active tab, and Ctrl/Cmd+1 through Ctrl/Cmd+9 jumps to a tab by position.
- Use Focus mode shortcuts: Ctrl/Cmd+Shift+F toggles Focus mode, and Escape exits Focus mode.

Browsers without the File System Access API keep the editor working, but file controls are disabled.
Local image storage also requires browser file and folder access. The first pasted, dropped, or inserted local image asks for a workspace folder, and Markdown Forge creates or reuses that folder's `assets/` directory.

## Run It

Open this file in a browser:

```text
src/markdown_forge.html
```

No install step is needed.

If you use a local AI server and the browser reports a connection or CORS error, serve the app from a local HTTP origin instead of opening it as `file://`:

```text
python3 -m http.server 8000 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:8000/src/markdown_forge.html
```

For Ollama, you can also allow browser origins from the Ollama side by setting:

```text
OLLAMA_ORIGINS=*
```

Restart Ollama after changing the environment variable.

## Project Layout

```text
assets/
├── MarkdownForge.ico
└── markdown-forge-snapshot.png
src/
├── markdown_forge.html
├── styles.css
└── js/
    ├── app.js
    ├── asset-store.js
    ├── ai-actions.js
    ├── ai-assistant.js
    ├── ai-context-menu.js
    ├── ai-provider.js
    ├── ai-settings.js
    ├── ai-status.js
    ├── document-session.js
    ├── editor-actions.js
    ├── file-store.js
    ├── history.js
    ├── markdown.js
    ├── markdown-ai-guards.js
    ├── markdown-repair.js
    ├── recent-files.js
    ├── resizer.js
    ├── tab-manager.js
    ├── utils.js
    └── viewport.js
tests/
└── unit/
    ├── ai-actions.test.js
    ├── ai-context-menu.test.js
    ├── ai-provider.test.js
    ├── ai-settings.test.js
    ├── ai-status.test.js
    ├── markdown-ai-guards.test.js
    └── tab-manager.test.js
```

## AI Provider

The AI Assistant uses local mock transforms by default and labels mock results in the review dialog. The toolbar status badge and AI menu show whether Markdown Forge is using mock mode, checking a configured server, connected, running, or blocked by a reachable provider error.

Configure the provider from the app:

1. Open `src/markdown_forge.html` in Chrome or another supported browser.
2. Open the **AI Assistant** menu.
3. Click **Settings**.
4. Choose **Local mock mode** or **OpenAI-compatible server**.
5. For server mode, enter the server URL and optional API key.
6. Click **List Models** and choose a model from the dropdown, or type a model name manually.
7. Click **Test Connection**.
8. Click **Save**.
9. Switch to WYSIWYG or Markdown mode, select text, right-click or open the AI Assistant menu, choose an AI action, review the result, then click **Apply**.

Example local server settings:

```text
Server URL: http://127.0.0.1:11434/v1/
Model: qwen3:4b
API Key: optional
```

Example remote server settings:

```text
Server URL: https://your-server.example.com/v1/
Model: your-model-name
API Key: your-api-key
```

To return to local mock mode, open **AI Assistant** > **Settings**, choose **Local mock mode**, and click **Save**. Settings are stored in browser `localStorage` under `markdownForge.ai.endpoint`, `markdownForge.ai.model`, and `markdownForge.ai.apiKey`.

The settings dialog defaults the server URL to `http://127.0.0.1:11434/v1/`, lists models from `/models`, and sends AI requests to `/chat/completions`. Connection tests accept reachable OpenAI-compatible completion responses, including reasoning-only test responses from local models, while AI actions still require returned Markdown content. Connection tests and AI actions use request timeouts so an unreachable server does not leave the UI hanging. During each AI action, the review dialog shows a compact activity log with request details, the selected editor mode, the configured action timeout, elapsed time, and error-specific suggestions.

## Tests

Run the dependency-free unit tests with:

```text
node tests/unit/ai-actions.test.js
node tests/unit/ai-provider.test.js
node tests/unit/ai-settings.test.js
node tests/unit/ai-status.test.js
node tests/unit/tab-manager.test.js
```

## License

MIT
