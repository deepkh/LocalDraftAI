# LocalDraftAI

![Static App](https://img.shields.io/badge/Static_HTML-CSS_JS-0969da?style=for-the-badge&logo=github)
![Local First](https://img.shields.io/badge/Local_First-AI_Assisted-8250df?style=for-the-badge)
![MIT License](https://img.shields.io/badge/License-MIT-2da44e?style=for-the-badge&logo=github)

**Your local, AI-assisted Markdown-first text editor.**

LocalDraftAI is a local-first, Markdown-first text editor that runs in your browser. Markdown keeps its WYSIWYG and source modes, while plain text, JSON, and YAML open safely in a source-only editor. The app also provides Soft Wrap, local file access, structured-document validation, image handling, multi-tab editing, and AI-assisted writing actions.

Use it immediately at [https://localdraft.ai/](https://localdraft.ai/), or run the same static app from this repo when you want a fully local/offline copy.

It is designed for people who want a simple Markdown workspace without a heavy desktop app or cloud-only workflow.

---

## Highlights

- **Use instantly online**: open [localdraft.ai](https://localdraft.ai/) and start writing without installing anything.
- **Local browser app**: open the HTML file directly or serve it from `localhost`.
- **WYSIWYG + Markdown modes**: edit Markdown visually or work directly with its source in one main editor; WYSIWYG is Markdown-only.
- **Plain-text documents**: open, create, edit, search, restore, and save `.md`, `.markdown`, `.txt`, `.log`, `.json`, `.yml`, and `.yaml` files.
- **JSON/YAML validation**: see valid or invalid syntax in the Status Bar without blocking edits or saves. Files are never automatically reformatted.
- **Soft Wrap**: wrap long lines visually in every supported document type without inserting real line breaks.
- **Day/Night theme**: switch between light and dark workbench themes; the selected appearance is stored locally in the browser.
- **Safe rich paste**: WYSIWYG keyboard, browser-menu, and right-click paste preserve Markdown-compatible document formatting while removing webpage controls, executable content, embedded documents, media widgets, SVG UI, inline styles, and event handlers.
- **Right-click clipboard actions**: cut, copy, and paste from the editor context menu; WYSIWYG copy/paste keeps safe rich HTML when the browser clipboard allows it.
- **Basic Markdown blocks**: render and insert headings, lists, block quotes, code fences, images, links, horizontal rules, and pipe tables.
- **Escaped Markdown characters**: literal Markdown punctuation such as `\*`, `\#`, `\|`, and `\>` stays literal when editing visually.
- **Multi-tab editing**: open multiple documents, switch tabs, close tabs, scroll many tabs, and reorder tabs by drag-and-drop.
- **Local file workflow**: preserve the selected extension, LF/CRLF line endings, UTF-8 BOM, and document text in browsers that support the File System Access API.
- **Workspace sidebar**: browse supported text documents with type indicators and collapsible folders, reopen recent workspaces, restore tabs, search content, and open results by line.
- **Image support**: paste, drop, or insert PNG, JPEG, WebP, and GIF images.
- **Workspace assets folder**: inserted local images can be copied into an `assets/` folder and linked with relative Markdown paths.
- **Configurable AI Assistant**: edit the local YAML action list to add, disable, remove, import, or export writing actions for local mock, local Ollama, cloud, or custom OpenAI-compatible providers.
- **Reasoning mode**: choose Auto, Off, Low, Medium, High, or Extra High reasoning for providers that support it; Auto uses per-action defaults.
- **Review before apply**: AI output opens in a right-hand review panel with the original selection, editable result, visual diffs, the AI engine used for the result, and interactive accept/reject mode before it changes the document.
- **AI revisions and restore**: regenerate AI output as selectable revisions, choose how to apply the result, and restore the original selection after an AI replacement when it can be matched safely.
- **AI status visibility**: see mock mode, connection checks, connected state, server errors, auth errors, and running actions.
- **Feedback link**: use the editor feedback link to report bugs or ideas on GitHub.
- **Focus mode**: hide extra controls and keep writing with fewer distractions.
- **Workbench layout**: a compact Menu Bar, Activity Bar, Primary Sidebar, Editor Area, AI Secondary Sidebar, and live Status Bar keep navigation separate from writing controls.
- **AI side workspace**: the right-hand workspace is used as an AI Assistant review panel while keeping the editor visible, and its width can be resized on desktop with editor-width clamping.
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

Typical Markdown workflow:

```text
Open LocalDraftAI
  -> create or open a supported text document
  -> optionally open a folder from Workspace to browse supported documents
  -> write in WYSIWYG or Markdown mode
  -> select text
  -> run an AI Assistant action
  -> review the result and diff
  -> regenerate and compare revisions if needed
  -> optionally accept or reject individual diff chunks
  -> replace the selection, insert below it, or copy the result
  -> restore the original from the AI panel if needed
  -> save back to local disk
```

### Supported Documents

| Type | Extensions | Editor behavior | Validation | AI replacement actions |
| --- | --- | --- | --- | --- |
| Markdown | `.md`, `.markdown` | WYSIWYG and Markdown source | None | All configured actions |
| Plain Text | `.txt`, `.log` | Source only | None | General writing actions; Markdown-only actions are hidden |
| JSON | `.json` | Source only | JSON syntax warning | Disabled initially |
| YAML | `.yml`, `.yaml` | Source only | YAML syntax warning, including multi-document YAML | Disabled initially |

JSON and YAML always remain editable and saveable when invalid. Validation is a warning, not a save gate. LocalDraftAI does not autoformat structured files and never sends JSON or YAML through Markdown rendering or WYSIWYG conversion.

### Workspace Sidebar

Use `Workspace -> Open Folder` in Chrome or Edge to choose a local folder. LocalDraftAI scans recursively and shows `.md`, `.markdown`, `.txt`, `.log`, `.json`, `.yml`, and `.yaml` files in the left sidebar. Source code, images, binaries, archives, and other unsupported files remain hidden. Explorer rows include `MD`, `TXT`, `{}`, or `YML` indicators.

The sidebar can be expanded, minimized, hidden, searched, and resized. Its mode and width are saved in localStorage. Folders in the Files tree can also be collapsed or expanded; collapsed folder paths are saved per workspace using workspace-relative paths, and the active file's parent folders are revealed automatically. File-name filtering temporarily expands folders with matches without overwriting saved collapse state. Clicking a workspace file opens it in a tab, or switches to the already-open tab for that workspace path. Unsaved workspace files show the same dirty marker pattern used by document tabs.

When a workspace has been opened before, LocalDraftAI stores the directory handle and lightweight tab metadata in browser storage. On reload it offers to restore the previous workspace, reopen supported workspace tabs, restore tab order and the active tab, and recover document type, editor mode, selection, scroll, Soft Wrap, dirty metadata, folder collapse, and sidebar scroll. Source-only documents are always restored into source mode. Restore only happens after you click `Restore Workspace`; if the browser needs folder permission again, the prompt is tied to that click.

The `Workspace` menu also remembers up to 10 recently opened workspaces. Use `Recent Workspaces` to reopen a folder from a date/time ordered list or remove an entry from the list. Reopening a recent workspace may ask for browser permission again before scanning the folder.

When you switch to a different workspace, open workspace tabs from the previous workspace are removed from the tab bar so the tab strip stays scoped to the active workspace. LocalDraftAI keeps lightweight restore metadata for reopening them later. If any removed tabs have unsaved changes, LocalDraftAI asks before discarding those edits.

The sidebar has three views:

- `Files`: browse supported text documents, collapse or expand folders, filter by file name, and use right-click actions.
- `Search`: search all supported document contents case-insensitively and open results by file and line.
- `Related`: all supported documents show same-folder and recently opened files; Markdown also shows linked Markdown documents and plan files.

Right-click safe operations are available in the Files view:

- Folder: `New File...`, `New Folder`, and `Refresh`. A missing extension defaults to `.md`; unsupported extensions are rejected.
- File: `Open`, `Rename`, `Duplicate`, `Copy Relative Path`, and `Reveal in Workspace`.

The `Workspace` menu includes `Expand All Folders` and `Collapse All Folders`. Collapse All keeps parent folders for the active workspace file expanded so the current file does not disappear.

Delete is intentionally not included. Rename is conservative: LocalDraftAI writes the new file first and only removes the old entry when the browser exposes a safe remove operation. If that path is unavailable, use Duplicate and remove the old file manually.

Likely Markdown planning files show a small `PLAN` badge. A Markdown file is treated as a plan when it is under `plans/`, starts with `Plan_`, ends with `_Plan`, or has `plan` in the filename. JSON and YAML files never receive this badge.

Workspace features are still focused on Markdown planning and writing. LocalDraftAI does not execute AI agents, terminal commands, Codex CLI, OpenCode, Git operations, rollback snapshots, embeddings, or multi-file AI edits.

### Layout

The main layout is a lightweight workbench. A compact Menu Bar sits above the Activity Bar, Primary Sidebar, Editor Area, and AI Secondary Sidebar, while a small Status Bar remains at the bottom. Tabs and document formatting controls are contained in the Editor Area. File, Edit, View, Workspace, AI, and Help menus dispatch to the same local file, editor, workspace, and AI behavior used by shortcuts and existing controls.

The Activity Bar switches Explorer, Search, and Related without resetting workspace collapse, search, scroll, or selection state. Clicking the active primary view hides the Primary Sidebar and clicking it again restores the same view. AI Assistant opens or focuses the Secondary Sidebar, and Settings opens the existing provider dialog.

Use the moon/sun button above Settings, or `View -> Dark Theme`, to switch appearance without reloading or changing document and workbench state. Light is the default. The supported `light` or `dark` value is stored under `localdraftai.appearance.theme` in localStorage and restored before the stylesheet renders.

The Status Bar shows the current workspace, unsaved state, document type, editor mode, Soft Wrap, source cursor line and column, word and character counts, JSON/YAML validity, and accessible AI provider status. Lower-priority fields collapse on narrow screens.

On wide screens, the Activity Bar, Primary Sidebar, editor, and AI review panel can coexist. The sidebar and AI panel both clamp their saved widths so the editor remains usable. At medium widths the sidebars become overlays instead of squeezing the editor, and at narrow widths the editor remains the full primary surface without page-level horizontal overflow.

---

## Markdown Tables

Use the `Table` toolbar button to insert a starter pipe table. Tables render in WYSIWYG mode and round-trip back to Markdown, including column alignment and escaped pipes inside cells.

```markdown
| Feature | Status |
| --- | --- |
| WYSIWYG table rendering | Supported |
| Markdown round trip | Supported |
```

---

## Run It

### Storage provider boundary

Local file and folder behavior is routed through a small storage-provider interface. Document sessions store a provider ID, a normalized workspace-relative resource, and revision metadata; local browser handles remain provider-owned compatibility data. Text decoding and serialization stay shared, so UTF-8 BOM, LF/CRLF, final-newline, document-type, validation, and dirty-state behavior are unchanged.

The current hosted and standalone UI still uses the `local-fsa` provider exclusively. The provider boundary is also the foundation for the optional bridge-served Remote SSH mode; SSH credentials and SSH implementation details do not belong in the static editor modules.

Use the hosted static app:

```text
https://localdraft.ai/
```

The hosted site lets you start immediately. Document editing still happens in the browser, and local file access uses your browser's file picker. AI features remain optional and only call the server you configure in the app settings.

Or run the same app from this repo:

Open this file in a browser:

```text
src/local_draft_ai.html
```

No install step is needed.

If you use a local AI server and the browser reports a connection or CORS error, serve the app from a local HTTP origin instead of opening it as `file://`:

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:8000/src/local_draft_ai.html
```

For Ollama, you can also allow browser origins from the Ollama side by setting:

```bash
OLLAMA_ORIGINS=*
```

Restart Ollama after changing the environment variable.

## Browser Support Notes

LocalDraftAI works best in Chromium-based browsers such as Chrome or Edge.

Browsers without the File System Access API can still use the editor, but local open/save controls may be limited or disabled. Local image storage also requires browser file and folder access. Browser-reported MIME types vary, so LocalDraftAI treats the registered filename extension as authoritative.

Right-click Paste uses the browser Clipboard API, so some browsers may ask for clipboard permission or require the app to be served from `localhost`.

All WYSIWYG rich paste routes use the same local sanitizer before insertion. Headings, paragraphs, emphasis, links, lists, code, images, and tables are retained when they can round-trip to Markdown. Redundant webpage layout containers around document blocks are unwrapped so adjacent controls do not flatten headings during insertion. H1, H2, and H3 retain their hierarchy and use compact 24px, 20px, and 18px document typography. Interactive webpage controls, scripts and styles, embedded documents, media widgets, SVG UI icons, inline styles, and event handlers are removed. Markdown mode always pastes plain text.

When you paste, drop, or insert the first local image, the app asks for a workspace folder. It then creates or reuses an `assets/` folder and inserts Markdown image links such as:

```markdown
![photo](assets/photo.png)
```

---

## AI Assistant

The AI Assistant can be opened from the application AI menu or from the editor right-click menu when text is selected. Markdown retains all configured actions. Plain text exposes general writing actions while hiding Markdown-only actions. Replacement-based AI actions are disabled for JSON and YAML in this release.

Selections are sent as Markdown fragments in both editor modes. In WYSIWYG mode, selected lists keep their Markdown list markers in the AI review, while partial text selections inside one list item stay as the selected inline text.

Example actions:

- Fix grammar
- Improve wording
- Make professional
- Summarize
- Make shorter
- Beautify Markdown
- Fix Markdown syntax

Use **Configure AI Actions...** in the AI Assistant menu, or **Configure AI Actions** in AI Assistant Settings, to edit the action YAML. The config is validated before saving and stored locally in the browser with a last-good fallback. You can disable, delete, or add actions, import or export `localdraft-ai-actions.yml`, and restore the built-in defaults without a server or cloud account.

For custom AI Assistant menu items, see [Configurable AI Actions](#configurable-ai-actions).

The AI Assistant uses local mock transforms by default, so the UI can be tested without a real AI server. The review panel supports side-by-side, unified, and interactive diff modes; interactive mode lets you accept or reject changed lines before applying the final replacement.

On desktop, drag the thin handle between the editor and the AI Assistant panel to resize the review workspace. The width is saved in the browser and restored on reload; double-click the handle to reset it.

Regenerate adds a new selectable revision instead of replacing the previous result. The apply mode can replace the selection, insert the result below the selection, or copy the result without changing the document. After a replacement or insert, the panel shows **Restore Original** when the original can be restored safely.

To use a real model, choose an AI provider in settings. Only the selected Markdown or plain text and the configured action prompt are sent to the provider you choose.

### Configure AI Provider

1. Open LocalDraftAI.
2. Click **AI Assistant**.
3. Click **Settings**.
4. Choose a provider.
5. Enter the Base URL.
6. Enter a model name, or click **List Models** and choose one from the dropdown.
7. Enter an API key if your server requires one.
8. Adjust **Reasoning** options if the provider supports them. **Auto** uses a conservative default for each AI action.
9. Click **Test Connection**.
10. Click **Save**.
11. Select text in the editor, choose an AI action, review the result and AI Engine summary in the side panel, then click **Apply** or use **Interactive** mode and click **Apply Accepted Changes**.

### Supported AI Providers

Local providers:

- **Local mock**: deterministic in-browser transforms; no server request.
- **Ollama**: native Ollama `/api/chat`, `/api/tags`, and reasoning `think` support.

Cloud providers:

- **OpenAI**
- **Google Gemini**
- **Groq**
- **OpenRouter**
- **Mistral AI**
- **Claude / Anthropic**
- **Grok / xAI**

Advanced provider:

- **OpenAI-compatible custom**: `/chat/completions` for LM Studio, llama.cpp server, vLLM, proxies, or existing Ollama `/v1` setups.

Cloud providers are optional. LocalDraft AI remains local-first: your files stay local, but selected text and the action prompt are sent to the provider you choose when you run an AI action.

Example settings:

| Provider | Base URL | Model |
| --- | --- | --- |
| Ollama | `http://127.0.0.1:11434` | `qwen3:1.7b` |
| OpenAI | `https://api.openai.com/v1` | `gpt-5.5` |
| Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.5-flash` |
| Groq | `https://api.groq.com/openai/v1` | `openai/gpt-oss-20b` |
| OpenRouter | `https://openrouter.ai/api/v1` | `openai/gpt-oss-20b:free` |
| Mistral | `https://api.mistral.ai/v1` | `mistral-small-latest` |
| Claude | `https://api.anthropic.com/v1` | `claude-sonnet-4-6` |
| Grok | `https://api.x.ai/v1` | `grok-4.3` |
| OpenAI-compatible custom | `http://127.0.0.1:11434/v1` | `local-model` |

Reasoning controls use the same compact values across providers:

- **Off**: explicitly disable reasoning for the AI request. LocalDraftAI sends the action normally without provider reasoning controls.
- **Auto**: choose a reasoning level from the AI action default:
  - Grammar Correction: Off
  - Improve Wording: Low
  - Make Professional: Medium
  - Summarize: Medium
  - Make Shorter: Low
  - Beautify Markdown: Low
  - Fix Markdown Syntax: Medium
- **Low / Medium / High / Extra High**: use the selected reasoning level for every action when the provider supports reasoning. Providers that do not support Extra High receive the closest supported high-effort setting.

Each AI review shows the provider, model, and reasoning setting that generated the current visible revision. The **Advanced** section can temporarily override the model or reasoning for that one result; click **Regenerate Result** to add a new revision with the override. **Apply** always applies the visible result only and never silently regenerates.

Reasoning summaries are only shown when the provider returns a summary and the setting is enabled. Provider adapters map the compact reasoning levels to each provider's supported request fields.

Cloud API keys entered in the settings dialog are stored only in local browser storage, but they are still visible to that browser profile and developer tools. For safer cloud usage, run a local proxy on `127.0.0.1` and keep provider API keys in proxy environment variables.

### Ollama CORS Note

If the browser reports a connection or CORS error, serve the app from `localhost` instead of opening it as `file://`.

For Ollama, you may also need to allow browser origins:

```bash
OLLAMA_ORIGINS=*
```

Restart Ollama after changing the environment variable.

---

## Configurable AI Actions

LocalDraftAI lets you customize the AI Assistant menu. The default AI Actions, such as Grammar Correction, Improve Wording, Summarize, Beautify Markdown, and Fix Markdown Syntax, are stored as local YAML configuration.

You can:

- Add new AI Actions
- Disable or delete existing AI Actions
- Rename menu labels and groups
- Change prompts
- Export or import the YAML configuration
- Reset the configuration to the built-in defaults

The configuration is stored locally in your browser. It is not uploaded to LocalDraftAI servers.

To edit AI Actions:

1. Open LocalDraftAI.
2. Open the **AI Assistant** menu.
3. Choose **Configure AI Actions...**.
4. Edit the YAML.
5. Click **Validate**.
6. Click **Save**.
7. Reopen the AI Assistant menu to see the updated AI Actions.

If the YAML is invalid, LocalDraftAI will not save it. The previous working AI Actions configuration continues to be used.

### YAML Format

The configuration starts with a version and an `actions` list. Each item in the list defines one AI Action:

```yaml
version: 1

actions:
  - id: correctGrammar
    enabled: true
    label: Grammar Correction
    description: Correct grammar and spelling while preserving Markdown.
    category: AI Assistant
    promptType: grammar
    requiresSelection: true
    inputMode: selection
    outputMode: replace-selection
    reasoningDefault: off
    prompt: |
      You are editing Markdown text.

      Task:
      Correct grammar and spelling only.

      Rules:
      - Preserve Markdown structure.
      - Do not change code blocks.
      - Do not change inline code.
      - Do not change URLs.
      - Do not change image paths.
      - Do not change heading levels.
      - Return only the corrected Markdown.
```

Keep `version: 1` at the top, and keep every AI Action indented under `actions:`.

### YAML Fields

| Field | Required | Description |
| --- | --- | --- |
| `id` | Yes | Unique internal AI Action ID. Letters, numbers, `_`, and `-` are recommended. Do not duplicate IDs. |
| `enabled` | No | `true` shows the AI Action in the menu. `false` hides it. The default is `true`. |
| `label` | Yes | Display name shown in the AI Assistant menu. |
| `description` | No | Short explanation of what the AI Action does. |
| `category` | No | Menu group name, such as `AI Assistant`, `Markdown`, `Translation`, or `Custom`. The default is `Custom`. |
| `promptType` | No | Optional internal type name. For a custom AI Action, this can match `id`. |
| `requiresSelection` | No | `true` means the AI Action requires selected text. The default is `true`. |
| `inputMode` | No | Input mode metadata. Use `selection` for current AI Actions. |
| `outputMode` | No | Suggested apply behavior: `replace-selection`, `insert-after-selection`, or `show-only`. The default is `replace-selection`. |
| `reasoningDefault` | No | Default reasoning level: `off`, `low`, `medium`, `high`, `xhigh`, or `auto`. The default is `low`. |
| `prompt` | Yes | Instructions sent to the configured AI provider. Use `prompt: |` for a multi-line prompt. |

The most important fields for a custom AI Action are:

```text
id
enabled
label
category
prompt
```

### Disable an AI Action

Set `enabled: false` to hide an AI Action from the menu without deleting its configuration:

```yaml
- id: makeShorter
  enabled: false
  label: Make Shorter
  description: Shorten selected text.
  category: AI Assistant
  promptType: make_shorter
  requiresSelection: true
  inputMode: selection
  outputMode: replace-selection
  reasoningDefault: low
  prompt: |
    Make the selected Markdown shorter while preserving the key meaning.
```

### Add a Custom AI Action

Add another item under `actions:`. Give it a unique `id`, a menu `label`, and a clear prompt:

```yaml
- id: myCustomAction
  enabled: true
  label: My Custom Action
  description: Describe what this AI Action does.
  category: Custom
  promptType: custom
  requiresSelection: true
  inputMode: selection
  outputMode: replace-selection
  reasoningDefault: low
  prompt: |
    You are editing Markdown text.

    Task:
    Describe exactly what you want the AI to do.

    Rules:
    - Preserve Markdown structure.
    - Do not modify code blocks unless the task requires it.
    - Return only the final result.
```

### Example: English to Traditional Chinese

To translate selected English Markdown into Traditional Chinese, add this item under `actions:`:

```yaml
  - id: englishToTraditionalChinese
    enabled: true
    label: English to Traditional Chinese
    description: Translate selected English Markdown into Traditional Chinese.
    category: Translation
    promptType: translation
    requiresSelection: true
    inputMode: selection
    outputMode: replace-selection
    reasoningDefault: low
    prompt: |
      You are translating Markdown text.

      Task:
      Translate the selected English text into Traditional Chinese.

      Rules:
        - Use natural Traditional Chinese used in Taiwan.
        - Preserve the original meaning.
        - Preserve Markdown structure.
        - Do not translate code blocks.
        - Do not translate inline code.
        - Do not change URLs.
        - Do not change image paths.
        - Keep product names, file names, command names, API names, and variable names unchanged unless translation is clearly appropriate.
        - Return only the translated Markdown.

```

After saving the YAML:

1. Select English text in the editor.
2. Open the AI Assistant menu.
3. Choose **English to Traditional Chinese**.
4. Review the AI result.
5. Apply it to replace the selected text.

### Example: Traditional Chinese to English

```yaml
- id: traditionalChineseToEnglish
  enabled: true
  label: Traditional Chinese to English
  description: Translate selected Traditional Chinese Markdown into English.
  category: Translation
  promptType: translation
  requiresSelection: true
  inputMode: selection
  outputMode: replace-selection
  reasoningDefault: low
  prompt: |
    You are translating Markdown text.

    Task:
    Translate the selected Traditional Chinese text into natural English.

    Rules:
    - Preserve the original meaning.
    - Use clear and natural English.
    - Preserve Markdown structure.
    - Do not translate code blocks.
    - Do not translate inline code.
    - Do not change URLs.
    - Do not change image paths.
    - Keep product names, file names, command names, API names, and variable names unchanged unless translation is clearly appropriate.
    - Return only the translated Markdown.
```

### Prompt Writing Tips

- Be specific about the task.
- Tell the AI whether it must preserve Markdown.
- Tell the AI not to modify code blocks, inline code, URLs, or image paths.
- Tell the AI to return only the final result.
- Use `reasoningDefault: off` or `low` for simple editing tasks.
- Use `reasoningDefault: medium` or higher for complex rewriting, planning, or analysis tasks.

A useful prompt pattern is:

```yaml
prompt: |
  You are editing Markdown text.

  Task:
  Explain the task clearly.

  Rules:
  - Preserve Markdown structure.
  - Do not modify code blocks.
  - Do not change URLs.
  - Return only the final result.
```

### Import, Export, and Reset

- **Export YAML** downloads the current valid AI Actions configuration as `localdraft-ai-actions.yml`.
- **Import YAML** loads a `.yml` or `.yaml` file into the editor. Click **Save** to validate and apply it.
- **Reset Defaults** loads the built-in LocalDraftAI AI Actions into the editor. Click **Save** to apply them.
- Invalid YAML does not overwrite the previous working configuration.

### Privacy Note

AI Actions are stored locally in your browser. The YAML configuration itself is not uploaded to LocalDraftAI servers.

When you run an AI Action, LocalDraftAI sends the selected Markdown and the AI Action prompt to the provider you configured, such as a local Ollama server or an optional cloud provider. Current AI Actions use selected text and do not send the rest of the document. Local mock actions run in the browser without a server request.

For local-first usage, configure a local provider such as Ollama.

### Troubleshooting

#### My AI Action Does Not Appear in the Menu

Check that:

- `enabled` is `true`.
- `id` is unique.
- `label` is not empty.
- `prompt` is not empty.
- YAML indentation is correct.
- You clicked **Save** after editing.

#### YAML Validation Failed

Check that:

- You used spaces, not tabs.
- Every AI Action starts with `- id:` under `actions:`.
- Multi-line prompts use `prompt: |`.
- Prompt lines are indented under `prompt: |`.
- `reasoningDefault` and `outputMode` use supported values from the table above.

#### The AI Changed My Markdown Links or Code

Add stricter rules to the prompt, for example:

```yaml
- Do not modify code blocks.
- Do not modify inline code.
- Do not change URLs.
- Do not change image paths.
```

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
│       ├── ai-action-config-dialog.js
│       ├── ai-action-config-store.js
│       ├── ai-action-config.js
│       ├── ai-action-defaults.js
│       ├── ai-actions.js
│       ├── ai-assistant.js
│       ├── ai-context-menu.js
│       ├── ai-diff.js
│       ├── ai-patch.js
│       ├── ai-provider-anthropic.js
│       ├── ai-provider-common.js
│       ├── ai-provider-gemini.js
│       ├── ai-provider-manager.js
│       ├── ai-provider-ollama.js
│       ├── ai-provider-openai-compatible.js
│       ├── ai-provider-openai.js
│       ├── ai-provider-registry.js
│       ├── ai-provider.js
│       ├── ai-reasoning.js
│       ├── ai-settings.js
│       ├── ai-status.js
│       ├── activity-bar.js
│       ├── command-registry.js
│       ├── document-session.js
│       ├── document-type.js
│       ├── document-validation.js
│       ├── editor-actions.js
│       ├── editor-mode.js
│       ├── file-store.js
│       ├── history.js
│       ├── markdown.js
│       ├── markdown-ai-guards.js
│       ├── markdown-repair.js
│       ├── menu-bar.js
│       ├── recent-files.js
│       ├── resizer.js
│       ├── status-bar.js
│       ├── tab-manager.js
│       ├── utils.js
│       ├── viewport.js
│       ├── workspace-sidebar.js
│       ├── workspace-store.js
│       └── vendor/
│           ├── LICENSE-js-yaml.txt
│           └── js-yaml.min.js
├── tests/
│   ├── e2e/
│   │   ├── ai-action-config.headless.mjs
│   │   ├── markdown-table.headless.mjs
│   │   ├── plain-text-file-support.headless.mjs
│   │   ├── soft-wrap-mode-switch.headless.mjs
│   │   ├── workbench-layout.headless.mjs
│   │   └── wysiwyg-ai-list-capture.headless.mjs
│   └── unit/
│       ├── ai-action-config.test.js
│       ├── ai-actions.test.js
│       ├── ai-assistant.test.js
│       ├── ai-context-menu.test.js
│       ├── ai-diff.test.js
│       ├── ai-provider.test.js
│       ├── ai-provider-anthropic.test.js
│       ├── ai-provider-gemini.test.js
│       ├── ai-provider-manager.test.js
│       ├── ai-provider-ollama.test.js
│       ├── ai-provider-openai.test.js
│       ├── ai-provider-registry.test.js
│       ├── ai-reasoning.test.js
│       ├── ai-settings.test.js
│       ├── ai-status.test.js
│       ├── ai-transport-openai-compatible.test.js
│       ├── activity-bar.test.js
│       ├── command-registry.test.js
│       ├── document-session.test.js
│       ├── document-type.test.js
│       ├── document-validation.test.js
│       ├── editor-actions.test.js
│       ├── file-store.test.js
│       ├── markdown-ai-guards.test.js
│       ├── markdown.test.js
│       ├── status-bar.test.js
│       ├── tab-manager.test.js
│       └── workspace-store.test.js
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
| `src/js/command-registry.js` | Application command registration and execution |
| `src/js/menu-bar.js` | Menu interaction, keyboard behavior, and command dispatch |
| `src/js/activity-bar.js` | Explorer, Search, Related, AI, and Settings routing |
| `src/js/status-bar.js` | Compact workspace, document, editor, and AI status formatting |
| `src/js/document-session.js` | Per-tab document state |
| `src/js/document-type.js` | Supported extensions and per-type capabilities |
| `src/js/document-validation.js` | Warning-only JSON and YAML syntax validation |
| `src/js/tab-manager.js` | Multi-tab behavior |
| `src/js/markdown.js` | Markdown parsing/rendering helpers |
| `src/js/editor-mode.js` | Editor mode, Soft Wrap, and caret/offset helpers |
| `src/js/editor-actions.js` | Editor formatting commands |
| `src/js/file-store.js` | Local file open/save helpers |
| `src/js/recent-files.js` | Recent file list storage |
| `src/js/workspace-store.js` | Local folder scanning and supported text-document tree model |
| `src/js/workspace-sidebar.js` | Workspace sidebar rendering, search, persisted state, and resizing |
| `src/js/asset-store.js` | Local image workspace handling |
| `src/js/ai-action-defaults.js` | Built-in AI Actions YAML |
| `src/js/ai-action-config.js` | AI Actions YAML parsing, validation, normalization, and prompt building |
| `src/js/ai-action-config-store.js` | IndexedDB persistence with last-good and localStorage fallback |
| `src/js/ai-action-config-dialog.js` | YAML validation, save, import, export, and reset dialog |
| `src/js/ai-assistant.js` | AI action workflow, review panel/modal fallback, revisions, and restore |
| `src/js/ai-diff.js` | Visual text diff helpers for AI review UI |
| `src/js/ai-patch.js` | Interactive AI diff accept/reject state and renderer |
| `src/js/ai-provider.js` | Compatibility wrapper for AI provider calls |
| `src/js/ai-provider-manager.js` | Provider registry, settings migration, and normalized AI results |
| `src/js/ai-provider-registry.js` | Built-in AI provider descriptors, groups, defaults, and aliases |
| `src/js/ai-provider-*.js` | Native or compatible adapters for Ollama, OpenAI-compatible cloud providers, Claude, and custom OpenAI-compatible servers |
| `src/js/ai-provider-common.js` | Shared provider request, parsing, and error helpers |
| `src/js/ai-reasoning.js` | LocalDraftAI reasoning setting normalization and provider mappings |
| `src/js/ai-settings.js` | AI settings dialog |
| `src/js/ai-status.js` | AI status display |
| `src/js/ai-context-menu.js` | Right-click AI actions |
| `src/js/markdown-ai-guards.js` | Markdown safety checks for AI output |
| `src/js/markdown-repair.js` | Markdown cleanup helpers |

The local YAML parser is the MIT-licensed `js-yaml` 4.1.0 browser build. Its attribution is kept in `src/js/vendor/LICENSE-js-yaml.txt` and in the vendored file header.

---

## Tests

Run the dependency-free unit tests with Node.js:

```bash
node tests/unit/ai-action-config.test.js
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
node tests/unit/document-type.test.js
node tests/unit/document-validation.test.js
node tests/unit/file-store.test.js
node tests/unit/markdown-ai-guards.test.js
node tests/unit/markdown.test.js
node tests/unit/tab-manager.test.js
node tests/unit/workspace-store.test.js
```

Or run all unit tests from a shell:

```bash
for test in tests/unit/*.test.js; do
  node "$test"
done
```

Run the headless browser smoke tests with Chrome available on `PATH`:

```bash
node --experimental-websocket tests/e2e/soft-wrap-mode-switch.headless.mjs
node --experimental-websocket tests/e2e/wysiwyg-ai-list-capture.headless.mjs
node --experimental-websocket tests/e2e/ai-action-config.headless.mjs
node --experimental-websocket tests/e2e/markdown-table.headless.mjs
node --experimental-websocket tests/e2e/plain-text-file-support.headless.mjs
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
