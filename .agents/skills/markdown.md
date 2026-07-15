# `src/js/markdown.js`

- Change Markdown rendering, inline syntax, Markdown-to-HTML behavior, WYSIWYG HTML-to-Markdown conversion, pasted HTML sanitizing, and supported Markdown syntax here.
- Use this file when the work affects parsing or rendering.
- Pasted HTML uses explicit `keep`, `unwrap`, and `drop subtree` policies. Preserve Markdown-compatible document elements, unwrap redundant `div` layout containers around block content, strip unsupported wrappers while keeping useful children, and remove controls, executable/embedded content, media widgets, and SVG with all of their content.
