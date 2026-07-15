# `src/styles.css`

- Change layout, spacing, colors, responsive behavior, pane presentation, toolbar appearance, and editor typography here.
- Use this file when the work affects the visual design system.
- Keep application menus in the Menu Bar and document controls in the Editor Area toolbar.
- Preserve the semantic workbench regions: Activity Bar, left Primary Sidebar, center Editor Area, right AI Secondary Sidebar, and bottom Status Bar.
- Keep application theme state in `src/js/theme.js`. Supported values are `light` and `dark`, persisted under `localdraftai.appearance.theme`.
- Define theme-sensitive colors as semantic variables in `:root`, with dark overrides under `html[data-theme="dark"]`; component rules should consume the variables instead of hard-coding light surfaces or text colors.
- Load and apply the persisted theme before `styles.css` renders, and keep theme switching appearance-only so editor and workbench state remain untouched.
