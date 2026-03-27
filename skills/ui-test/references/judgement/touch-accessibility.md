# Touch & Accessibility

Touch devices, mobile considerations, keyboard navigation, and accessibility.

## Touch Devices

### Hover Effects

Disable hover effects on touch devices. Touch devices trigger hover on tap, causing false positives:

```css
/* Only apply hover on devices that support it */
@media (hover: hover) and (pointer: fine) {
  .element:hover {
    transform: scale(1.05);
  }
}
```

**Important:** Don't rely on hover effects for the UI to work properly. Hover should enhance, not enable functionality.

### Touch Action

Disable `touch-action` for custom components that implement pan and zoom gestures to prevent interference from native behavior:

```css
.custom-canvas {
  touch-action: none;
}
```

### Double-Tap Zoom

Set `touch-action: manipulation` to prevent double-tap zoom on controls:

```css
button, a, input {
  touch-action: manipulation;
}
```

### Tap Targets

Ensure minimal tap target of all buttons on touch devices is at least 44px:

```css
.icon-button {
  /* Visual size can be smaller */
  width: 24px;
  height: 24px;
  position: relative;
}

/* But hit area should be 44px */
.icon-button::before {
  content: '';
  position: absolute;
  inset: -10px;
}
```

Or use padding:

```css
.small-button {
  min-width: 44px;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

### Video Autoplay

Apply `muted` and `playsinline` to `<video>` tags to autoplay on iOS without opening a fullscreen video popup:

```html
<video autoplay muted playsinline loop>
  <source src="video.mp4" type="video/mp4" />
</video>
```

### OS-Specific Shortcuts

Replace `Cmd` with `Ctrl` based on operating system:

```js
const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
const modKey = isMac ? 'Cmd' : 'Ctrl';

// Display: "Save (Cmd+S)" on Mac, "Save (Ctrl+S)" on Windows
```

## Keyboard Navigation

### Tab Order

Tabbing should work consistently across the site. Users should only be able to tab through visible elements:

```css
/* Hide from tab order when not visible */
.hidden-panel {
  visibility: hidden;
}

/* Or use inert attribute */
<div inert={!isVisible}>...</div>
```

### Scroll Into View

Ensure keyboard navigation scrolls elements into view if needed:

```jsx
function handleFocus(e) {
  e.target.scrollIntoView({
    behavior: 'smooth',
    block: 'nearest',
  });
}
```

### Focus Management

When opening modals or dialogs, move focus to the first interactive element or the modal itself. When closing, return focus to the trigger element.

## Accessibility

### ARIA Labels

Always set aria labels on buttons with an icon as content:

```html
<button aria-label="Close dialog">
  <CloseIcon />
</button>

<button aria-label="Search">
  <SearchIcon />
</button>
```

### Code Illustrations

Illustrations built in code should have proper `aria-label` attribute:

```jsx
<div
  role="img"
  aria-label="Abstract geometric pattern"
  className="decorative-illustration"
/>
```

### Reduced Motion

See [animations.md](animations.md) for `prefers-reduced-motion` implementation. Every animation needs reduced motion support.

### Videos

For users who prefer reduced motion, show play buttons instead of autoplaying videos:

```jsx
const prefersReducedMotion = window.matchMedia(
  '(prefers-reduced-motion: reduce)'
).matches;

<video
  autoPlay={!prefersReducedMotion}
  controls={prefersReducedMotion}
  muted
  playsinline
/>
```

### Time-Limited Actions

Ensure any time-limited action is frozen when the user switches tabs. Use the `visibilitychange` event:

```js
let timeoutId;
let remainingTime;
let startTime;

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Pause the timer
    clearTimeout(timeoutId);
    remainingTime -= Date.now() - startTime;
  } else {
    // Resume the timer
    startTime = Date.now();
    timeoutId = setTimeout(callback, remainingTime);
  }
});
```

## Feedback

Ensure feedback components are visible on the page. Feedback is important—don't hide it behind hover states or modals.

## Tooltips

### Delay and Animation

Tooltips should have a delay before appearing to prevent accidental activation:

```css
.tooltip {
  transition-delay: 200ms;
}
```

**Sequential tooltips:** Once a tooltip is open, hovering over other tooltips should open them with no delay and no animation. Track "warm" state:

```jsx
const [isWarm, setIsWarm] = useState(false);

// When any tooltip opens, set warm state
// Clear warm state after 300ms of no tooltip being open
```

### Submenus

Apply a safe-area for submenus using clippath to ensure diagonal movement works. Users should be able to move diagonally from parent menu to submenu without the submenu closing.

```css
.submenu-trigger::after {
  content: '';
  position: absolute;
  /* Creates a "safe zone" for cursor movement */
  clip-path: polygon(0 0, 100% 0, 100% 100%);
  /* Adjust based on submenu position */
}
```
