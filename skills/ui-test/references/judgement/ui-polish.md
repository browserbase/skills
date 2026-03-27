# UI Polish

Typography, visual design, layout, and visual refinements.

## Typography

### Font Rendering

Always apply antialiased font smoothing:

```css
body {
  -webkit-font-smoothing: antialiased;
}
```

### Font Subsetting

Subset fonts based on content, alphabet, or relevant language(s) to minimize file size. Only include the characters you actually use.

### Preventing Layout Shift

**Font weight:** Never change font weight on hover or selected states. This causes layout shift.

```css
/* Bad - causes layout shift */
.tab:hover {
  font-weight: 600;
}
.tab.selected {
  font-weight: 600;
}

/* Good - consistent weight */
.tab {
  font-weight: 500;
}
.tab.selected {
  color: var(--color-primary);
}
```

**Tabular numbers:** Use `font-variant-numeric: tabular-nums` for numbers that change dynamically (counters, prices, timers).

```css
.counter {
  font-variant-numeric: tabular-nums;
}
```

### Font Weight Variables

Define font weights as CSS variables so you can adjust them globally

```css
:root {
  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;
}
```

### Text Wrapping

Use `text-wrap: balance` on headings for better line breaks.

```css
h1,
h2,
h3 {
  text-wrap: balance;
}
```

### Letter Spacing by Size

Larger text needs tighter letter spacing; smaller text needs looser spacing. Use a Text component to pair font sizes with their optimal letter spacing:

```tsx
// Letter spacing is handled inside the Text component

<Text size="lg>Heading</Text>
```

Keep in mind that this is font depended.

## Typography Characters

Use proper typographic characters:

| Instead of | Use                    |
| ---------- | ---------------------- |
| `...`      | `…` (ellipsis)         |
| `'`        | `'` (curly apostrophe) |
| `"`        | `"` (curly quotes)     |

## Visual Design

### Shadows for Borders

Use shadows instead of normal borders for better blending with backgrounds:

```css
/* Instead of border: 1px solid rgba(0, 0, 0, 0.08) */
box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.08);
```

This blends better with varying background colors and avoids the harsh border look.

### Hairline Borders

Use 0.5px borders on retina displays for crisp, subtle dividers. Define a CSS variable that adapts to screen density:

```css
:root {
  --border-hairline: 1px;

  @media only screen and (min-device-pixel-ratio: 2),
    only screen and (min-resolution: 192dpi) {
    --border-hairline: 0.5px;
  }
}

.divider {
  border-bottom: var(--border-hairline) solid var(--gray-6);
}
```

This gives you sharp 0.5px lines on retina screens while falling back to 1px on standard displays. Works for borders, dividers, and any fine UI details.

### Gradients

**Eased gradients:** Use eased gradients over linear gradients when using solid colors. Linear gradients have visible banding; eased gradients are smoother.

Tool: https://larsenwork.com/easing-gradients/

**Mask over gradient:** Prefer `mask-image` over gradients for fades. Masks work better with varying content.

```css
.fade-bottom {
  mask-image: linear-gradient(to bottom, black 80%, transparent);
}
```

### Scrollable Content

Do not apply fade on scrollable lists or scrollable components. The fade restricts the viewable area and cuts off content.

### Scrollbars

Do not replace page scrollbars with custom ones. Only customize scrollbars in smaller elements like code snippets:

```css
.code-block::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.code-block::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
}
```

### Focus Outlines

Do not change the default outline color to anything other than grey, black, or white. Custom colored outlines often clash with the interface.

## Layout

### Preventing Layout Shift

Dynamic elements should cause no layout shift. Use hardcoded dimensions for:

- Skeleton loaders
- Image placeholders
- Dynamic content areas

### Z-Index

Use a fixed z-index scale. Avoid arbitrary values like `z-index: 9999`.

```css
:root {
  --z-dropdown: 100;
  --z-modal: 200;
  --z-tooltip: 300;
  --z-toast: 400;
}
```

**Better approach:** Avoid z-index entirely when possible. Use `isolation: isolate` or `position: relative` to create new stacking contexts.

```css
.card {
  isolation: isolate;
}
```

### Safe Areas

Account for device safe areas (notches, home indicators) with the `env()` function:

```css
.footer {
  padding-bottom: env(safe-area-inset-bottom);
}

.sidebar {
  padding-left: env(safe-area-inset-left);
}
```

### Scroll Margins

Set `scroll-margin-top` for scrollable elements to ensure proper space above elements when scrolling to anchors:

```css
[id] {
  scroll-margin-top: 80px; /* Height of sticky header */
}
```

### Grid Text Truncation

When using grids, ensure text within cells is truncated when needed using `line-clamp`:

```css
.grid-cell-text {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
```

## Dark Mode

### Theme Variables

Use a numerical scale for color variables so you can easily switch between light and dark themes by replacing variables:

```css
:root {
  --gray-1: #fafafa;
  --gray-2: #f5f5f5;
  --gray-12: #171717;
}

[data-theme="dark"] {
  --gray-1: #171717;
  --gray-2: #1f1f1f;
  --gray-12: #fafafa;
}
```

### Tailwind Dark Mode

Do not use Tailwind's `dark:` modifier to adjust colors manually. Use CSS variables and flip them instead. This keeps the code cleaner and more maintainable.

```css
/* Good - variables flip automatically */
.button {
  background: var(--gray-12);
  color: var(--gray-1);
}

/* Avoid - manual dark mode overrides everywhere */
.button {
  @apply bg-gray-900 dark:bg-gray-100;
}
```

## Decorative Elements

### Pointer Events

Decorative elements should disable `pointer-events` to not hijack events from interactive elements beneath them:

```css
.decorative-bg {
  pointer-events: none;
}
```

### Code Illustrations

Illustrations made in code should have disabled text selection:

```css
.illustration {
  user-select: none;
}
```

## Refresh Behavior

Refresh should cause no flash of content in interactive components. Ensure initial state stays consistent by:

- Storing state in localStorage/sessionStorage
- Using proper SSR hydration
- Setting initial state before render
