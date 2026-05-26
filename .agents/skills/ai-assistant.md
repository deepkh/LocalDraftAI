# AI Assistant

- Change toolbar AI action menus, selected-text AI workflows, right-click AI context menus, provider calls, AI settings, AI status display, AI review/apply dialogs, AI result diffs, interactive accept/reject patch state, AI action logs, and local mock AI transforms in `src/js/ai-actions.js`, `src/js/ai-assistant.js`, `src/js/ai-diff.js`, `src/js/ai-patch.js`, `src/js/ai-provider*.js`, `src/js/ai-provider-manager.js`, `src/js/ai-provider-common.js`, `src/js/ai-reasoning.js`, `src/js/ai-settings.js`, `src/js/ai-status.js`, `src/js/ai-context-menu.js`, `src/js/markdown-ai-guards.js`, and `src/js/markdown-repair.js`.
- Keep the AI assistant limited to selected text in WYSIWYG mode and Markdown mode.
- Keep the AI review dialog diff text-based and Markdown-safe; do not render compared Markdown as HTML.
- Keep interactive review decisions in review state and do not mutate the editor until the final apply action.
- Preserve the dependency-free static HTML/CSS/JavaScript structure.
- Keep provider adapters behind the provider manager and return normalized AI results with Markdown text plus optional provider-returned reasoning summaries.
