# Browser Recipes for UI Testing

Copy-paste recipes using the `browse` CLI for deterministic UI checks. Works with both local and remote browsers.

**Important**: `browse eval` does not support top-level `await`. Use `.then()` for async operations, or split into multiple eval calls.

## Accessibility Audit (axe-core)

Two-step recipe (load script, then run):

```bash
browse open "TARGET_URL"
browse wait load

# Step 1: Load axe-core
browse eval "const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js'; document.head.appendChild(s); 'loading'"

# Step 2: Wait for script to load, then run audit
# (wait 2-3 seconds for the script to load)
browse eval "axe.run().then(r => JSON.stringify({ violations: r.violations.map(v => ({ id: v.id, impact: v.impact, description: v.description, nodes: v.nodes.length, help: v.helpUrl })), passes: r.passes.length, incomplete: r.incomplete.length }))"
```

Interpret results:
- `impact: "critical"` or `"serious"` = must fix
- `impact: "moderate"` or `"minor"` = should fix
- Check `helpUrl` for remediation guidance

## Performance Metrics

```bash
browse open "TARGET_URL"
browse wait load
browse eval "
  const nav = performance.getEntriesByType('navigation')[0];
  const paint = performance.getEntriesByType('paint');
  JSON.stringify({
    domContentLoaded: Math.round(nav?.domContentLoadedEventEnd),
    loadComplete: Math.round(nav?.loadEventEnd),
    firstPaint: Math.round(paint.find(p => p.name === 'first-paint')?.startTime),
    firstContentfulPaint: Math.round(paint.find(p => p.name === 'first-contentful-paint')?.startTime),
    transferSize: nav?.transferSize,
    domInteractive: Math.round(nav?.domInteractive),
  });
"
```

Thresholds (Doherty Threshold + Web Vitals):
- FCP < 1.8s = good, < 3s = needs improvement, > 3s = poor
- Load complete < 3s = good for SaaS dashboards
- DOM interactive < 400ms = feels instant (Doherty Threshold)

## Broken Images

```bash
browse open "TARGET_URL"
browse wait load
browse eval "
  const imgs = Array.from(document.querySelectorAll('img'));
  const broken = imgs.filter(i => !i.complete || i.naturalWidth === 0);
  JSON.stringify(broken.map(i => ({ src: i.src, alt: i.alt })));
"
```

## Console Errors

**Important**: Injecting on `about:blank` then navigating wipes the capture (different page context). Instead, use one of these approaches:

### Method 1: Check failed resources on page load (deterministic)

```bash
browse open "TARGET_URL"
browse wait load
browse eval "JSON.stringify(performance.getEntries().filter(e => e.entryType === 'resource' && e.responseStatus >= 400).map(e => ({ url: e.name, status: e.responseStatus })))"
```

### Method 2: Capture runtime errors during interaction

```bash
browse open "TARGET_URL"
browse wait load

# Inject capture on the page itself
browse eval "window.__logs = []; const orig = { error: console.error, warn: console.warn }; console.error = (...args) => { window.__logs.push({type:'error', text: args.join(' ')}); orig.error(...args); }; console.warn = (...args) => { window.__logs.push({type:'warn', text: args.join(' ')}); orig.warn(...args); }; window.addEventListener('error', e => window.__logs.push({type:'uncaught', text: e.message})); window.addEventListener('unhandledrejection', e => window.__logs.push({type:'rejection', text: String(e.reason)})); 'installed'"

# Interact with the page (clicks, form submits, etc.)
browse click @some-ref
browse eval "JSON.stringify(window.__logs)"
```

This captures errors that occur during interaction, not on initial load. For initial load errors, use Method 1.

## Keyboard Navigation

Tab through all focusable elements and record the order:

```bash
# Start on the page
browse open "TARGET_URL"
browse wait load

# Tab through elements one at a time
browse press Tab
browse eval "JSON.stringify({tag: document.activeElement?.tagName, text: document.activeElement?.textContent?.trim().slice(0,40), role: document.activeElement?.getAttribute('role'), ariaLabel: document.activeElement?.getAttribute('aria-label'), hasFocus: window.getComputedStyle(document.activeElement).outlineStyle !== 'none'})"

# Repeat browse press Tab + eval to build the full tab order
# Stop when activeElement returns BODY (looped back)
```

What to check in the results:
- Every interactive element should appear in the tab order
- Order should follow visual layout (top-to-bottom, left-to-right)
- `hasFocus` should be true for every element (visible focus ring)
- No elements should be skipped or appear out of order

## Responsive Screenshot Sweep

```bash
browse open "TARGET_URL"
browse wait load

# Mobile (iPhone SE)
browse viewport 375 812
browse wait timeout 1000
browse screenshot /tmp/mobile.png --full-page

# Tablet (iPad)
browse viewport 768 1024
browse wait timeout 1000
browse screenshot /tmp/tablet.png --full-page

# Desktop
browse viewport 1440 900
browse wait timeout 1000
browse screenshot /tmp/desktop.png --full-page
```

After capturing, read each screenshot with the Read tool and evaluate:
- Mobile: is there a hamburger menu? Are touch targets ≥44px? Does content overflow?
- Tablet: does the layout adapt or just shrink? Is the sidebar behavior correct?
- Desktop: is content width reasonable? Not stretched edge-to-edge?

## Check All Links

```bash
browse open "TARGET_URL"
browse wait load
browse eval "
  const links = Array.from(document.querySelectorAll('a[href]'));
  JSON.stringify(links.map(a => ({
    href: a.href,
    text: a.textContent?.trim().slice(0, 50),
    isExternal: !a.href.startsWith(location.origin),
    opensNewTab: a.target === '_blank'
  })));
"
```

## Check Form Structure

```bash
browse open "TARGET_URL"
browse wait load
browse eval "
  const forms = Array.from(document.querySelectorAll('form'));
  JSON.stringify(forms.map(f => ({
    action: f.action,
    method: f.method,
    inputs: Array.from(f.querySelectorAll('input,select,textarea')).map(i => ({
      name: i.name, type: i.type, required: i.required,
      hasLabel: !!i.labels?.length || !!i.getAttribute('aria-label'),
      placeholder: i.placeholder
    }))
  })));
"
```

## Check Empty State

Navigate to a page/section with no data and screenshot it:

```bash
browse open "TARGET_URL"  # e.g., /sessions with no sessions
browse wait load
browse screenshot /tmp/empty-state.png --full-page
browse snapshot  # check if there's helpful text/CTA
```

Evaluate: does it have a message? An illustration? A CTA to create the first item? Or is it just blank?
