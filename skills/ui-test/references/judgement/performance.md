# Performance

Optimization, virtualization, and performance considerations.

## Animation Performance

See [animations.md](animations.md) for detailed animation performance guidelines. Key rules:

- Only animate `transform` and `opacity`
- Avoid animating `height`, `width`, `padding`, `margin`
- Avoid `blur` filters above 20px
- Use `will-change: transform` for GPU acceleration
- Pause looping animations when off-screen

## Lists & Virtualization

Virtualize large lists. Don't render hundreds of DOM nodes when only a few are visible:

```jsx
import { useVirtualizer } from '@tanstack/react-virtual';

function VirtualList({ items }) {
  const parentRef = useRef(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50,
  });

  return (
    <div ref={parentRef} style={{ height: '400px', overflow: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: virtualItem.start,
              height: virtualItem.size,
            }}
          >
            {items[virtualItem.index]}
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Transitions

### Avoid `transition: all`

Never use `transition: all`. It causes accidental animations and performance issues:

```css
/* Bad */
.button {
  transition: all 200ms ease;
}

/* Good - specify exact properties */
.button {
  transition: background-color 200ms ease, transform 200ms ease;
}
```

### Theme Switching

Switching themes should not trigger transitions. Disable transitions during theme changes:

```js
function setTheme(theme) {
  // Disable transitions
  document.documentElement.classList.add('no-transitions');

  // Apply theme
  document.documentElement.setAttribute('data-theme', theme);

  // Re-enable transitions after paint
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.documentElement.classList.remove('no-transitions');
    });
  });
}
```

```css
.no-transitions,
.no-transitions * {
  transition: none !important;
}
```

## Layout Performance

### Prevent Layout Shift

Dynamic elements should cause no layout shift:

- Use hardcoded dimensions for images and videos
- Reserve space for async content with skeletons
- Use `font-variant-numeric: tabular-nums` for changing numbers
- Don't change font weight on hover

### Font Loading

Preload fonts to prevent layout shift:

```jsx
import { preload } from 'react-dom';

preload('/fonts/inter-var.woff2', {
  as: 'font',
  type: 'font/woff2',
  crossOrigin: 'anonymous',
});
```

## React Performance

### Minimize Re-renders

For animations, animate outside React's render cycle when possible:

```jsx
// Bad - causes re-render on every frame
const [position, setPosition] = useState(0);

// Good - use refs for direct DOM manipulation
const elementRef = useRef(null);

useEffect(() => {
  let frame;
  function animate() {
    elementRef.current.style.transform = `translateX(${position}px)`;
    frame = requestAnimationFrame(animate);
  }
  frame = requestAnimationFrame(animate);
  return () => cancelAnimationFrame(frame);
}, []);
```

### Framer Motion Performance

```jsx
// Hardware accelerated (uses transform string)
<motion.div animate={{ transform: "translateX(100px)" }} />

// NOT hardware accelerated (more readable but slower)
<motion.div animate={{ x: 100 }} />
```

## CSS Performance

### CSS Variables

Avoid animating CSS variables in deep component trees. Each variable change triggers style recalculation for all descendants.

### Blur Filters

`blur()` filters above 20px are expensive, especially in Safari. Keep blur values subtle or avoid them on frequently-animating elements.

## Static Generation

Generate static content at build time:

```jsx
// Next.js example
export async function getStaticProps() {
  const posts = await fetchPosts();
  return {
    props: { posts },
    revalidate: 3600, // Revalidate hourly
  };
}
```

Don't fetch blog posts, changelog entries, or docs at request time when they can be pre-generated.

## Preloading

### Critical Images

Preload above-the-fold images:

```html
<link rel="preload" as="image" href="/hero.webp" />
```

### Fonts

```html
<link
  rel="preload"
  href="/fonts/inter.woff2"
  as="font"
  type="font/woff2"
  crossorigin
/>
```

## Off-Screen Content

Pause or stop resource-intensive operations when off-screen:

```js
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      startAnimation();
    } else {
      pauseAnimation();
    }
  });
});

observer.observe(element);
```
