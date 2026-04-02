# UI Test Examples

Each example demonstrates the full assertion protocol: before/after comparison, structured markers, and adversarial testing.

## Example 1: Diff-Driven Component Test (Happy + Adversarial)

**User request**: "I updated the CTA button text. Test it."

```bash
# Analyze diff
git diff --name-only HEAD~1
# Output: src/components/HeroSection.tsx
git diff HEAD~1 -- src/components/HeroSection.tsx
# Shows: "Get Started" changed to "Start Free Trial"

# Setup
browse env local
browse open http://localhost:3000/
browse wait load

# BEFORE snapshot
browse snapshot
# Tree: @0-8 button "Start Free Trial"
# Evidence: button exists with new text

# Happy path: button is clickable
browse click @0-8
browse snapshot
# AFTER: check no crash, page still functional

# STEP_PASS|cta-text|button "Start Free Trial" found at @0-8
# STEP_PASS|cta-click|button click succeeded, page intact after click

# Adversarial: rapid click
browse open http://localhost:3000/
browse wait load
browse snapshot
browse click @0-8
browse click @0-8
browse click @0-8
browse snapshot
# Check: no duplicate dialogs, no console errors, page still stable

# STEP_PASS|cta-rapid-click|3 rapid clicks, page remains stable, no duplicate side effects

browse stop
```

**Result**:
```
## UI Test Results
### STEP_PASS|cta-text|button "Start Free Trial" found at @0-8
### STEP_PASS|cta-click|clicked @0-8, page intact
### STEP_PASS|cta-rapid-click|3 rapid clicks, no duplicate effects
**Summary: 3/3 passed**
```

## Example 2: Form Validation — Happy Path, Errors, and Adversarial

**User request**: "I added email validation to the signup form. Test it thoroughly."

```bash
browse env local
browse open http://localhost:3000/signup
browse wait load

# ---- Test 1: Invalid email → error ----
# BEFORE
browse snapshot
# @0-3 textbox "Email", @0-7 button "Sign Up"

# ACT
browse fill "input[name=email]" "not-an-email"
browse click @0-7

# AFTER
browse snapshot
# @0-9 alert "Please enter a valid email"

# STEP_PASS|invalid-email|alert "Please enter a valid email" appeared at @0-9

# ---- Test 2: Valid email → success ----
browse open http://localhost:3000/signup
browse wait load

# BEFORE
browse snapshot

# ACT
browse fill "input[name=email]" "user@example.com"
browse click @0-7
browse wait load

# AFTER
browse snapshot
# heading "Welcome! Check your email." appeared, form gone

# STEP_PASS|valid-email|heading "Welcome!" appeared, form removed from tree

# ---- Test 3: Empty submission ----
browse open http://localhost:3000/signup
browse wait load

# BEFORE
browse snapshot

# ACT: submit with nothing filled
browse click @0-7

# AFTER
browse snapshot
# Check: error message? Or silent failure? Or crash?

# STEP_PASS|empty-submit|alert "Please enter a valid email" appeared — form handles empty input

# ---- Test 4: XSS in email field ----
browse open http://localhost:3000/signup
browse wait load

browse fill "input[name=email]" "<script>alert('xss')</script>"
browse click @0-7
browse snapshot
# Note: the XSS payload WILL appear in the snapshot as StaticText inside the input
# field — that's just the input value, not rendered HTML. The real checks are:
# 1. Is there a validation error? (email format rejected)
# 2. Is the payload rendered as HTML outside the input? (check for script execution)
browse eval "document.querySelector('[role=alert]')?.textContent || 'no alert'"
# Result: "Please enter a valid email"
browse eval "document.querySelector('input[name=email]')?.value"
# Result: "<script>alert('xss')</script>" — payload stays as text in the input, not rendered as HTML

# STEP_PASS|xss-email|XSS payload rejected by validation, no inline script injection detected

# ---- Test 5: Very long email ----
browse open http://localhost:3000/signup
browse wait load

browse fill "input[name=email]" "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@test.com"
browse snapshot
# Check: does the input overflow its container? Is layout broken?
browse screenshot /tmp/long-email.png
# Visual check: input stays within bounds

browse click @0-7
browse snapshot
# Check: does validation handle long but valid emails?

# STEP_PASS|long-email|60-char email accepted, layout intact, no overflow

# ---- Test 6: Keyboard-only flow ----
browse open http://localhost:3000/signup
browse wait load

browse press Tab
browse eval "document.activeElement?.name || document.activeElement?.tagName"
# Should focus email input
browse type "keyboard@test.com"
browse press Tab
# Should move to submit button
browse eval "document.activeElement?.tagName"
# Should be BUTTON
browse press Enter

browse snapshot
# Check: form submitted successfully via keyboard alone

# STEP_PASS|keyboard-flow|form submitted via Tab+type+Tab+Enter, success message appeared

browse stop
```

**Result**:
```
## UI Test Results
### STEP_PASS|invalid-email|alert "Please enter a valid email" at @0-9
### STEP_PASS|valid-email|heading "Welcome!" appeared, form removed
### STEP_PASS|empty-submit|empty form shows validation error
### STEP_PASS|xss-email|XSS payload rejected, not rendered as HTML
### STEP_PASS|long-email|60-char email accepted, layout intact
### STEP_PASS|keyboard-flow|full form flow works via keyboard only
**Summary: 6/6 passed**
```

## Example 3: Modal Lifecycle — Full State Machine

**User request**: "I added a confirmation modal to delete. Test it."

```bash
browse env local
browse open http://localhost:3000/dashboard
browse wait load

# ---- Test 1: Modal opens ----
# BEFORE
browse snapshot
# @0-15 button "Delete Account", no dialog in tree

# ACT
browse click @0-15

# AFTER
browse wait selector "[role=dialog]"
browse snapshot
# @0-20 dialog "Confirm Action", @0-22 button "Cancel", @0-23 button "Confirm"

# STEP_PASS|modal-open|dialog "Confirm Action" appeared at @0-20 with Cancel and Confirm buttons

# ---- Test 2: Cancel closes modal, no side effects ----
# BEFORE: dialog present
browse snapshot

# ACT
browse click @0-22

# AFTER
browse snapshot
# No dialog in tree. @0-15 button "Delete Account" still present.

# STEP_PASS|modal-cancel|dialog removed from tree, delete button still present, no side effects

# ---- Test 3: Escape closes modal ----
browse click @0-15
browse wait selector "[role=dialog]"
browse snapshot
# dialog present

browse press Escape
browse snapshot
# Check: dialog gone?

# STEP_PASS|modal-escape|Escape key closed dialog

# ---- Test 4: Confirm executes action ----
browse click @0-15
browse wait selector "[role=dialog]"
browse snapshot
# dialog present

browse click @0-23
browse snapshot
# Check: dialog gone AND the destructive action occurred

# STEP_PASS|modal-confirm|dialog closed and action executed after Confirm click

# ---- Test 5: Focus trap (adversarial) ----
browse click @0-15
browse wait selector "[role=dialog]"

# Tab through dialog — focus should stay inside
browse press Tab
browse eval "document.activeElement?.textContent?.trim().slice(0,20)"
browse press Tab
browse eval "document.activeElement?.textContent?.trim().slice(0,20)"
browse press Tab
browse eval "document.activeElement?.textContent?.trim().slice(0,20)"
# Check: does focus cycle within dialog, or does it escape to page behind?

# STEP_PASS|focus-trap|focus cycles within dialog (Cancel → Confirm → Cancel)
# or on failure:
browse screenshot --path .context/ui-test-screenshots/focus-trap.png
# STEP_FAIL|focus-trap|expected focus trapped in dialog → focus escaped to nav link behind modal|.context/ui-test-screenshots/focus-trap.png

browse stop
```

## Example 4: Accessibility Audit with Deterministic Assertions

**User request**: "Run accessibility tests on the settings page."

```bash
browse env local
browse open http://localhost:3000/settings
browse wait load

# ---- Test 1: axe-core audit ----
browse eval "const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js'; document.head.appendChild(s); 'loading'"
browse wait timeout 3000
browse eval "axe.run().then(r => JSON.stringify({ violations: r.violations.map(v => ({ id: v.id, impact: v.impact, description: v.description, nodes: v.nodes.length })), passes: r.passes.length }))"
# Result: {"violations":[],"passes":33}

# Assert: violations.length === 0
# STEP_PASS|axe-audit|0 violations, 33 passes

# If violations existed:
# STEP_FAIL|axe-audit|expected 0 violations → found 2: color-contrast (serious, 3 nodes), label (critical, 1 node)

# ---- Test 2: Form labels ----
browse eval "JSON.stringify(Array.from(document.querySelectorAll('input,select,textarea')).map(i => ({ name: i.name, type: i.type, hasLabel: !!i.labels?.length, ariaLabel: i.getAttribute('aria-label') })))"
# Check: every input has hasLabel:true or ariaLabel

# STEP_PASS|form-labels|all 3 inputs have associated labels

# ---- Test 3: Keyboard navigation ----
browse press Tab
browse eval "JSON.stringify({tag: document.activeElement?.tagName, text: document.activeElement?.textContent?.trim().slice(0,30)})"
# Repeat for each interactive element
# Track: element order, whether focus ring is visible

# STEP_PASS|keyboard-nav|8 elements reachable via Tab, logical order, all focusable

# ---- Test 4: Broken images ----
browse eval "JSON.stringify(Array.from(document.querySelectorAll('img')).filter(i => !i.complete || i.naturalWidth === 0).map(i => ({ src: i.src, alt: i.alt })))"
# Result: []

# STEP_PASS|images|0 broken images

browse stop
```

## Example 5: Responsive Testing with Before/After

**User request**: "Does my app work on mobile?"

```bash
browse env local
browse open http://localhost:3000/
browse wait load

# ---- Desktop baseline ----
browse viewport 1440 900
browse wait timeout 500
browse snapshot
# Record desktop state: nav layout, content width, element positions
browse screenshot /tmp/desktop.png --full-page

# ---- Mobile ----
browse viewport 375 812
browse wait timeout 1000
browse snapshot
# Compare against desktop:
# - Did nav collapse to hamburger? Or is it overflowing?
# - Is content full-width? Or is there horizontal scroll?
# - Are buttons large enough for touch (44px+)?
browse screenshot /tmp/mobile.png --full-page

# Check for horizontal overflow (deterministic)
browse eval "document.documentElement.scrollWidth > document.documentElement.clientWidth"
# Result: false = PASS, true = FAIL (content overflows viewport)

# STEP_PASS|mobile-overflow|no horizontal overflow at 375px (scrollWidth <= clientWidth)

# Check touch target sizes
browse eval "JSON.stringify(Array.from(document.querySelectorAll('button,a,[role=button]')).map(el => { const r = el.getBoundingClientRect(); return { text: el.textContent?.trim().slice(0,20), width: Math.round(r.width), height: Math.round(r.height) }}).filter(e => e.width < 44 || e.height < 44))"
# Result: [] = all targets >= 44px, otherwise list of undersized elements

# STEP_PASS|touch-targets|all interactive elements >= 44px

# ---- Tablet ----
browse viewport 768 1024
browse wait timeout 1000
browse screenshot /tmp/tablet.png --full-page

browse stop
```

## Example 6: Console Health — Deterministic Error Detection

**User request**: "Are there any JS errors on my app?"

```bash
browse env local

# Check each route for failed resource loads and JS errors
# Note: console capture injected on about:blank gets wiped on navigation.
# Instead, check per-page with the performance API + inject capture on the page itself.

for_each_route() {
  # Method 1: Check for failed resource loads (works on initial load)
  browse open "TARGET_URL"
  browse wait load
  browse eval "JSON.stringify(performance.getEntries().filter(e => e.entryType === 'resource' && e.responseStatus >= 400).map(e => ({ url: e.name, status: e.responseStatus })))"
  # Result: [] = PASS, any failed resources = FAIL

  # Method 2: Inject capture on the page, then interact to catch runtime errors
  browse eval "window.__logs = []; const _origErr = console.error; console.error = (...a) => { window.__logs.push({type:'error', text: a.join(' ')}); _origErr(...a); }; window.addEventListener('error', e => window.__logs.push({type:'uncaught', text: e.message})); 'installed'"

  # Now interact (click buttons, submit forms, navigate)
  browse click @some-button
  browse eval "JSON.stringify(window.__logs)"
  # Any errors captured during interaction
}

# Example: check homepage
browse open http://localhost:3000/
browse wait load
browse eval "JSON.stringify(performance.getEntries().filter(e => e.entryType === 'resource' && e.responseStatus >= 400).map(e => e.name))"
# Result: [] — no failed loads
# STEP_PASS|console-home|0 failed resources on initial load

# Example: check dashboard with interaction
browse open http://localhost:3000/dashboard
browse wait load
browse eval "window.__logs=[]; const _orig=console.error; console.error=(...a)=>{window.__logs.push({t:'e',m:a.join(' ')}); _orig(...a);}; 'ok'"
browse click @some-button
browse eval "JSON.stringify(window.__logs)"
# Result: [{"t":"e","m":"Failed to fetch /api/items"}]
# STEP_FAIL|console-dashboard|expected 0 errors → 1 error during interaction: "Failed to fetch /api/items"

browse stop
```

## Example 7: Remote Authenticated Test (Browserbase + Cookie-Sync)

**User request**: "Test our staging dashboard. I'm logged in locally."

```bash
# Step 1: Sync cookies
node .claude/skills/cookie-sync/scripts/cookie-sync.mjs --domains staging.myapp.com
# Output: Context ID: ctx_7f3a9b2c

# Step 2: Remote mode
browse env remote
browse open https://staging.myapp.com/dashboard --context-id ctx_7f3a9b2c --persist
browse wait load

# Verify authenticated state
browse snapshot
# Check: user avatar present? Dashboard content loaded? Not a login redirect?
browse get url
# Verify URL is /dashboard, not /login

# STEP_PASS|remote-auth|authenticated dashboard loaded, user avatar present, URL is /dashboard

# Run tests against authenticated pages
browse open https://staging.myapp.com/settings --context-id ctx_7f3a9b2c
browse wait load
browse snapshot
# Verify settings content loads

# STEP_PASS|remote-settings|settings page loaded with form fields, not login redirect

# axe-core on remote page
browse eval "const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js'; document.head.appendChild(s); 'loading'"
browse wait timeout 3000
browse eval "axe.run().then(r => JSON.stringify({ violations: r.violations.length, passes: r.passes.length }))"

browse stop
```

## Example 8: Exploratory Testing — Try to Break It

**User request**: "Explore my app and find bugs."

```bash
browse env local
browse open http://localhost:3000/
browse wait load

# ---- First impressions ----
browse snapshot
browse screenshot /tmp/explore-home.png

# Console health check
browse eval "JSON.stringify({errors: (window.__logs || []).length})"

# ---- Empty state audit ----
browse open http://localhost:3000/dashboard
browse wait load
browse snapshot
# Is there a designed empty state? Or just blank space?
# Check for: message, CTA, illustration
# STEP_PASS|empty-state|dashboard shows "No items yet." with CTA "Create your first item"
# or on failure:
browse screenshot --path .context/ui-test-screenshots/empty-state.png
# STEP_FAIL|empty-state|expected designed empty state → page is blank with no guidance|.context/ui-test-screenshots/empty-state.png

# ---- 404 handling ----
browse open http://localhost:3000/this-page-does-not-exist
browse wait load
browse snapshot
# Check: custom 404? Or generic error? Or blank?
browse get url
# STEP_PASS|404-page|custom 404 page with "Page not found" and link to home
# or: STEP_FAIL|404-page|expected custom 404 → got default Next.js error page

# ---- Form stress test ----
browse open http://localhost:3000/contact
browse wait load
browse snapshot

# Extremely long input
browse fill "textarea[name=message]" "This is a very long message that keeps going and going and going and going and going and going and going and going and going and going and going and going and going and going and going and going and going and going and going and going and going and going and going and going and going"
browse snapshot
browse screenshot /tmp/long-input.png
# Check: does textarea grow? Overflow? Break layout?

# Special characters
browse fill "input[name=email]" "test@test.com"
browse fill "textarea[name=message]" "<img src=x onerror=alert(1)> & \"quotes\" and emoji 🎉"
browse click @submit-ref
browse snapshot
# Check: content rendered safely? Not interpreted as HTML?

# ---- Navigation dead ends ----
# Click every nav link, check each page has a way back
browse open http://localhost:3000/pricing
browse wait load
browse snapshot
# Are there nav links? Can you get back to home?

browse stop
```

**Report format for exploratory findings**:
```
FINDING: Contact form textarea has no maxlength — 500+ char input accepted without truncation
SEVERITY: low
ROUTE: /contact
EVIDENCE: Filled 280 chars into message field, form accepted it, layout intact
RECOMMENDATION: Consider adding maxlength or character counter if there's a backend limit

FINDING: No custom 404 page — default Next.js error shown
SEVERITY: medium
ROUTE: /does-not-exist
EVIDENCE: Navigated to non-existent route, got default "404 | This page could not be found."
RECOMMENDATION: Add a custom not-found.tsx with navigation back to the app
```

## Example 9: Parallel Testing on a Deployed Site (Browserbase)

**User request**: "QA the staging site — test signup, dashboard, and accessibility in parallel."

The key insight: each test group gets its own `BROWSE_SESSION`, which spins up an independent Browserbase browser. Groups run concurrently via the Agent tool.

**Step 1: Plan parallel groups**

```
Parallel Groups
===============
Group 1 (session: signup)     → /signup form tests (happy path + adversarial)
Group 2 (session: dashboard)  → /dashboard content + empty state
Group 3 (session: a11y)       → /settings axe-core + keyboard nav
```

**Step 2: Cookie-sync (if auth needed)**

```bash
node .claude/skills/cookie-sync/scripts/cookie-sync.mjs --domains staging.myapp.com
# Output: Context ID: ctx_7f3a9b2c
```

**Step 3: Launch agents in parallel**

Use the Agent tool — send all three in a single message so they run concurrently:

```
Agent 1 prompt:
  "You are running UI tests on https://staging.myapp.com/signup.
   Use BROWSE_SESSION=signup for every browse command.
   Start with: BROWSE_SESSION=signup browse env remote
   Then: BROWSE_SESSION=signup browse open https://staging.myapp.com/signup --context-id ctx_7f3a9b2c

   Run these tests using the before/after snapshot pattern:
   1. [happy] Fill valid email, submit, verify success
   2. [adversarial] Submit empty form, verify error
   3. [adversarial] Fill XSS payload, verify rejected
   4. [adversarial] Double-click submit, verify no duplicate

   For each test: snapshot BEFORE, act, snapshot AFTER, compare, emit:
     STEP_PASS|<id>|<evidence>  or  STEP_FAIL|<id>|<expected> → <actual>

   When done: BROWSE_SESSION=signup browse stop"

Agent 2 prompt:
  "You are running UI tests on https://staging.myapp.com/dashboard.
   Use BROWSE_SESSION=dashboard for every browse command.
   Start with: BROWSE_SESSION=dashboard browse env remote
   Then: BROWSE_SESSION=dashboard browse open https://staging.myapp.com/dashboard --context-id ctx_7f3a9b2c

   Run these tests:
   1. Check empty state — is there a message and CTA, or blank?
   2. Check data display — table columns, row count, formatting
   3. Check console errors — inject capture, interact, check __logs

   Emit STEP_PASS/STEP_FAIL markers. When done: BROWSE_SESSION=dashboard browse stop"

Agent 3 prompt:
  "You are running accessibility tests on https://staging.myapp.com/settings.
   Use BROWSE_SESSION=a11y for every browse command.
   Start with: BROWSE_SESSION=a11y browse env remote
   Then: BROWSE_SESSION=a11y browse open https://staging.myapp.com/settings --context-id ctx_7f3a9b2c

   Run these tests:
   1. axe-core audit — load script, run, check violations
   2. Form labels — every input has an associated label
   3. Keyboard nav — Tab through all elements, verify focus order
   4. Broken images — check naturalWidth on all img elements

   Emit STEP_PASS/STEP_FAIL markers. When done: BROWSE_SESSION=a11y browse stop"
```

**Step 4: Merge results**

As each agent returns, collect markers into a unified report:

```
## UI Test Results (Parallel Run — 3 Browserbase sessions)

### Group: signup (session: signup)
STEP_PASS|valid-email|heading "Welcome!" appeared at @0-15 after submit
STEP_PASS|empty-submit|alert "Email required" appeared at @0-9
STEP_PASS|xss-email|XSS payload rejected by validation
STEP_FAIL|double-submit|expected single submission → two success toasts|.context/ui-test-screenshots/signup-double-submit.png

### Group: dashboard (session: dashboard)
STEP_PASS|empty-state|"No items yet" with CTA "Create first item"
STEP_PASS|data-display|table: 5 rows, 4 columns, dates formatted
STEP_PASS|console-health|0 errors during interaction

### Group: a11y (session: a11y)
STEP_FAIL|axe-audit|expected 0 violations → 2: color-contrast (serious, 3 nodes), label (critical, 1 node)|.context/ui-test-screenshots/a11y-axe-audit.png
STEP_PASS|form-labels|all 4 inputs have associated labels
STEP_PASS|keyboard-nav|10 elements reachable, logical order
STEP_PASS|images|0 broken images

---
**Summary: 9/11 passed, 2 failed (3 parallel sessions)**
Failed: double-submit (signup), axe-audit (a11y)
**Wall-clock time: ~45s (vs ~2min sequential)**
```

**Step 5: Cleanup**

```bash
# Safety net — stop any lingering sessions
BROWSE_SESSION=signup browse stop 2>/dev/null
BROWSE_SESSION=dashboard browse stop 2>/dev/null
BROWSE_SESSION=a11y browse stop 2>/dev/null
```

## Tips

- **Before/after for every interaction** — never assert without comparing state change
- **Deterministic checks are strongest** — axe-core count, console error array, overflow boolean
- **Try to break it** — empty input, long input, special chars, rapid clicks, keyboard-only
- **Use structured markers** — `STEP_PASS|id|evidence` or `STEP_FAIL|id|expected → actual|screenshot-path`
- **Screenshot every failure** — save to `.context/ui-test-screenshots/<step-id>.png` so devs can see what broke
- **Local for localhost** — never send localhost traffic through Browserbase
- **Default localhost run** — start with `browse env local` for clean, reproducible QA
- **Use `--auto-connect` selectively** — only when a localhost test explicitly needs existing local Chrome login/cookies/state (`browse env local --auto-connect`)
- **Explicit local CDP attach** — use `browse env local <port|url>` when you must target a specific local browser instance
- **Always `browse stop` when done** — for parallel runs, stop every named session
- **`.then()` not `await`** — browse eval doesn't support top-level await
- **Parallelize with `BROWSE_SESSION`** — each named session gets its own Browserbase browser; fan out via Agent tool
