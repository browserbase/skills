---
name: ui-test
description: "AI-powered UI testing that catches what Playwright can't — visual quality, accessibility, UX heuristics, responsive design, and exploratory bug finding. Reads code diffs or the full codebase to generate targeted tests, then runs them via the browse CLI. Use when the user asks to test UI changes, verify a feature works, QA a pull request, audit accessibility, or run exploratory testing. Supports both local browser (localhost) and remote Browserbase (deployed sites via cookie-sync)."
license: MIT
metadata:
  author: browserbase
  version: "0.3.0"
allowed-tools: Bash, Read, Write, Glob, Grep, Agent, TaskCreate, TaskUpdate, TaskGet
compatibility: "Requires the browse CLI (`npm install -g @browserbasehq/browse-cli`). For remote testing: BROWSERBASE_API_KEY and cookie-sync skill."
---

# UI Test — Agentic UI Testing Skill

Test UI changes in a real browser. Your job is to **try to break things**, not confirm they work.

Two workflows:
- **Diff-driven** — analyze a git diff, generate targeted tests, run them
- **Full QA suite** — read the codebase, generate comprehensive tests, run against local or remote

## Testing Philosophy

**You are an adversarial tester.** Your goal is to find bugs, not prove correctness.

- **Try to break every feature you test.** Don't just check "does the button exist?" — click it twice rapidly, submit empty forms, paste 500 characters, press Escape mid-flow.
- **Test what the developer didn't think about.** Empty states, error recovery, keyboard-only navigation, mobile overflow.
- **Every assertion must be evidence-based.** Compare before/after snapshots. Check specific elements by ref. Never report PASS without concrete evidence from the accessibility tree or a deterministic check.
- **Report failures with enough detail to reproduce.** Include the exact action, what you expected, what you got, and a suggested fix.

## Assertion Protocol

Every test step MUST produce a structured assertion. Do not write freeform "this looks good."

### Step markers

For each test step, emit exactly one marker:

```
STEP_PASS|<step-id>|<evidence>
```
or
```
STEP_FAIL|<step-id>|<expected> → <actual>
```

- `step-id`: short identifier like `homepage-cta`, `form-validation-error`, `modal-cancel`
- `evidence`: what you observed that proves the step passed (element ref, text content, URL, eval result)
- `expected → actual`: what you expected vs what you got

### How to verify (in order of rigor)

1. **Deterministic check** (strongest) — `browse eval` returns structured data you can inspect. Examples: axe-core violation count, `document.title`, form field value, console error array, element count.
2. **Snapshot element match** — a specific element with a specific role and text exists in the accessibility tree. Check by ref: `@0-12 button "Save"`. An element either exists in the tree or it doesn't.
3. **Before/after comparison** — snapshot before action, act, snapshot after. Verify the tree changed in the expected way (element appeared, disappeared, text changed).
4. **Screenshot + visual judgment** (weakest) — only for visual-only properties (color, spacing, layout) that the accessibility tree cannot capture. Always accompany with what specifically you're evaluating.

### Before/after comparison pattern

This is the core verification loop. Use it for every interaction:

```bash
# 1. BEFORE: capture state
browse snapshot
# Record: what elements exist, their text, their refs

# 2. ACT: perform the interaction
browse click @0-12

# 3. AFTER: capture new state
browse snapshot
# Compare: what changed? What appeared? What disappeared?

# 4. ASSERT: emit marker based on comparison
# If dialog appeared: STEP_PASS|modal-open|dialog "Confirm" appeared at @0-20
# If nothing changed: STEP_FAIL|modal-open|expected dialog to appear → snapshot unchanged
```

## Setup

```bash
which browse || npm install -g @browserbasehq/browse-cli
```

### Avoid permission fatigue

This skill runs many `browse` commands (snapshots, clicks, evals). To avoid approving each one, add `browse` to your allowed commands:

**Project-level** (`.claude/settings.json` in repo root — shared with team):
```json
{
  "permissions": {
    "allow": [
      "Bash(browse:*)"
    ]
  }
}
```

**User-level** (`~/.claude/settings.json` — just you):
```json
{
  "permissions": {
    "allow": [
      "Bash(browse:*)"
    ]
  }
}
```

This allows all `browse` subcommands (`browse open`, `browse snapshot`, `browse eval`, etc.) without prompts. The `BROWSE_SESSION` env var prefix is handled automatically.

## Mode Selection

| Target | Mode | Command | Auth |
|--------|------|---------|------|
| `localhost` / `127.0.0.1` | Local | `browse env local` | None needed |
| Deployed/staging site | Remote | `browse env remote` | cookie-sync → `--context-id` |

**Rule: If the URL is localhost, always use local mode.**

### Local Mode (default for localhost)

```bash
browse env local
browse open http://localhost:3000
```

### Remote Mode (deployed sites via cookie-sync)

```bash
# Step 1: Sync cookies from local Chrome to Browserbase
node .claude/skills/cookie-sync/scripts/cookie-sync.mjs --domains your-app.com
# Output: Context ID: ctx_abc123

# Step 2: Switch to remote mode
browse env remote
browse open https://staging.your-app.com --context-id ctx_abc123 --persist
browse snapshot
# ... run tests ...
browse stop
```

Cookie-sync flags: `--domains`, `--context`, `--stealth`, `--proxy "City,ST,US"`

## Workflow A: Diff-Driven Testing

### Phase 1: Analyze the diff

```bash
git diff --name-only HEAD~1          # or: git diff --name-only / git diff --name-only main...HEAD
git diff HEAD~1 -- <file>            # read actual changes
```

Categorize changed files:

| File pattern | UI impact | What to test |
|-------------|-----------|--------------|
| `*.tsx`, `*.jsx`, `*.vue`, `*.svelte` | Component | Render, interaction, state, edge cases |
| `pages/**`, `app/**`, `src/routes/**` | Route/page | Navigation, page load, content, 404 handling |
| `*.css`, `*.scss`, `*.module.css` | Style | Visual appearance (screenshot), responsive |
| `*form*`, `*input*`, `*field*` | Form | Validation, submission, empty input, long input, special chars |
| `*modal*`, `*dialog*`, `*dropdown*` | Interactive | Open/close, escape, focus trap, cancel vs confirm |
| `*nav*`, `*menu*`, `*header*` | Navigation | Links, active states, routing, keyboard nav |
| Non-UI files only | None | Skip — report "no UI tests needed" |

### Phase 2: Map files to URLs

Detect framework: `cat package.json | grep -E '"(next|react|vue|nuxt|svelte|@sveltejs|angular|vite)"'`

| Framework | Default port | File → URL pattern |
|-----------|-------------|-----|
| Next.js App Router | 3000 | `app/dashboard/page.tsx` → `/dashboard` |
| Next.js Pages Router | 3000 | `pages/about.tsx` → `/about` |
| Vite | 5173 | Check router config |
| Nuxt | 3000 | `pages/index.vue` → `/` |
| SvelteKit | 5173 | `src/routes/+page.svelte` → `/` |
| Angular | 4200 | Check routing module |

### Phase 3: Check dev server

```bash
for port in 3000 3001 5173 4200 8080 8000 5000; do
  status=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$port" 2>/dev/null)
  if [ "$status" != "000" ]; then echo "Dev server on port $port (HTTP $status)"; break; fi
done
```

If nothing found: tell the user to start their dev server.

### Phase 4: Generate test plan

For each changed area, plan **both happy path AND adversarial tests**:

```
Test Plan (based on git diff)
=============================
Changed: src/components/SignupForm.tsx (added email validation)

1. [happy] Valid email submits successfully
   URL: http://localhost:3000/signup
   Steps: fill valid email → submit → verify success message appears

2. [adversarial] Invalid email shows error
   Steps: fill "not-an-email" → submit → verify error message appears

3. [adversarial] Empty form submission
   Steps: click submit without filling anything → verify error, no crash

4. [adversarial] XSS in email field
   Steps: fill "<script>alert(1)</script>" → submit → verify sanitized/rejected

5. [adversarial] Rapid double-submit
   Steps: click submit twice quickly → verify no duplicate submission

6. [adversarial] Keyboard-only flow
   Steps: Tab to email → type → Tab to submit → Enter → verify success
```

### Phase 5: Execute tests

```bash
browse stop 2>/dev/null
browse env local
```

For each test, follow the **before/after pattern**:

```bash
# Navigate
browse open http://localhost:3000/path
browse wait load

# BEFORE snapshot
browse snapshot
# Note the current state: elements, refs, text

# ACT
browse click @0-ref
# or: browse fill "selector" "value"
# or: browse type "text"
# or: browse press Enter

# AFTER snapshot
browse snapshot
# Compare against BEFORE: what changed?

# ASSERT with marker
# STEP_PASS|step-id|evidence  OR  STEP_FAIL|step-id|expected → actual
```

### Phase 6: Report results

```
## UI Test Results

### STEP_PASS|valid-email-submit|status "Thanks!" appeared at @0-42 after submit
- URL: http://localhost:3000/signup
- Before: form with email input @0-3, submit button @0-7
- Action: filled "user@test.com", clicked @0-7
- After: form replaced by status element with "Thanks! We'll be in touch."

### STEP_FAIL|double-submit|expected single submission → form submitted twice
- URL: http://localhost:3000/signup
- Before: form with submit button @0-7
- Action: clicked @0-7 twice rapidly
- After: two success toasts appeared, suggesting duplicate submission
- Suggestion: disable submit button after first click, or debounce the handler

---
**Summary: 4/6 passed, 2 failed**
Failed: double-submit, xss-sanitization
```

Always `browse stop` when done.

## Adversarial Test Patterns

Use these patterns to try to break features. Apply them to every interactive element you test.

### Forms — try to break them

```bash
# Empty submission
browse snapshot                          # BEFORE: note form fields
browse click @submit-ref                 # ACT: submit empty
browse snapshot                          # AFTER: error messages should appear

# Long input (500+ chars)
browse fill "#name" "aaaa....(500 chars)"
browse snapshot                          # Check: does layout break? Is text truncated?

# Special characters
browse fill "#name" "<script>alert('xss')</script>"
browse fill "#email" "'; DROP TABLE users;--"
browse snapshot                          # Check: input sanitized? No raw HTML rendered?

# Rapid submit
browse click @submit-ref
browse click @submit-ref                 # Click twice immediately
browse snapshot                          # Check: only one submission processed?
```

### Modals — test the full lifecycle

```bash
browse snapshot                          # BEFORE: no dialog in tree

# Open
browse click @trigger-ref
browse snapshot                          # AFTER: dialog element should appear
# ASSERT: dialog role exists in tree

# Escape to close
browse press Escape
browse snapshot                          # AFTER: dialog should be gone
# ASSERT: dialog role removed from tree

# Re-open and cancel
browse click @trigger-ref
browse snapshot                          # dialog present
browse click @cancel-ref
browse snapshot                          # dialog gone

# Re-open and confirm
browse click @trigger-ref
browse snapshot                          # dialog present
browse click @confirm-ref
browse snapshot                          # dialog gone + side effect occurred
```

### Navigation — verify routing works

```bash
browse snapshot                          # BEFORE: note current URL and content
browse click @nav-link-ref               # ACT: click a navigation link
browse wait load
browse get url                           # Check URL changed
browse snapshot                          # AFTER: content matches the destination
# Compare: different heading, different page content

# Back button
browse back
browse get url                           # Should return to original URL
browse snapshot                          # Content matches original page
```

### Error states — find missing ones

```bash
# Navigate to a page with no data
browse open http://localhost:3000/items
browse snapshot
# Check: is there a designed empty state with a message and CTA?
# Or just blank space?

# Navigate to a non-existent route
browse open http://localhost:3000/does-not-exist
browse snapshot
# Check: 404 page? Or blank/error?

# Submit invalid data and check error recovery
browse fill "#field" "invalid"
browse click @submit-ref
browse snapshot
# Check: is the error message helpful? Does it tell you what's wrong?
# Check: is the user's input preserved? Or was the form cleared?
```

### Keyboard accessibility — can you use it without a mouse?

```bash
browse open http://localhost:3000/page
browse wait load

# Tab through all interactive elements
browse press Tab
browse eval "JSON.stringify({tag: document.activeElement?.tagName, text: document.activeElement?.textContent?.trim().slice(0,40), role: document.activeElement?.getAttribute('role')})"
# Repeat Tab + eval until activeElement returns to BODY
# Check: every interactive element reachable? Focus ring visible? Order logical?

# Try activating elements via keyboard
browse press Enter                       # Should activate focused button
browse snapshot                          # Verify the action happened
```

## Deterministic Checks

These produce structured data, not judgment calls. Use them as the strongest form of assertion.

### axe-core accessibility audit

```bash
browse eval "const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js'; document.head.appendChild(s); 'loading'"
# Wait 2-3 seconds for script to load
browse eval "axe.run().then(r => JSON.stringify({ violations: r.violations.map(v => ({ id: v.id, impact: v.impact, description: v.description, nodes: v.nodes.length, help: v.helpUrl })), passes: r.passes.length, incomplete: r.incomplete.length }))"
```

Assert: `violations.length === 0` for PASS. Any violation with `impact: "critical"` or `"serious"` is a FAIL.

### Console errors

**Note**: Console capture injected on `about:blank` gets wiped when navigating to a different origin. Instead, navigate to the target page first, then inject the capture and check for errors that occur during interaction:

```bash
browse open "TARGET_URL"
browse wait load

# Inject capture on the actual page
browse eval "window.__logs = []; const orig = { error: console.error, warn: console.warn }; console.error = (...args) => { window.__logs.push({type:'error', text: args.join(' ')}); orig.error(...args); }; console.warn = (...args) => { window.__logs.push({type:'warn', text: args.join(' ')}); orig.warn(...args); }; window.addEventListener('error', e => window.__logs.push({type:'uncaught', text: e.message})); window.addEventListener('unhandledrejection', e => window.__logs.push({type:'rejection', text: String(e.reason)})); 'installed'"

# Now interact with the page — errors during interaction are captured
browse click @some-ref
browse eval "JSON.stringify(window.__logs)"
```

For checking errors on initial page load, use the performance API instead:

```bash
browse open "TARGET_URL"
browse wait load
browse eval "JSON.stringify(performance.getEntries().filter(e => e.entryType === 'resource' && e.responseStatus >= 400).map(e => ({ url: e.name, status: e.responseStatus })))"
```

Assert: empty array for PASS. Any failed resources = FAIL.

### Broken images

```bash
browse eval "JSON.stringify(Array.from(document.querySelectorAll('img')).filter(i => !i.complete || i.naturalWidth === 0).map(i => ({ src: i.src, alt: i.alt })))"
```

Assert: empty array for PASS.

### Form structure

```bash
browse eval "JSON.stringify(Array.from(document.querySelectorAll('form')).map(f => ({ action: f.action, inputs: Array.from(f.querySelectorAll('input,select,textarea')).map(i => ({ name: i.name, type: i.type, required: i.required, hasLabel: !!i.labels?.length })) })))"
```

Assert: every input has `hasLabel: true`. Any `false` = accessibility FAIL.

See [references/browser-recipes.md](references/browser-recipes.md) for more recipes.

## Workflow B: Full QA Suite

For full codebase analysis and suite generation, follow [references/codebase-analysis.md](references/codebase-analysis.md).

## Workflow C: Parallel Testing (Browserbase)

Run multiple tests concurrently using named `browse` sessions — each gets its own Browserbase cloud browser. Use this when you have multiple independent test groups (different pages, different categories) and want faster results.

**Requirement: Remote mode only.** Each named session spins up a separate Browserbase browser. This does not work with local mode (you'd be fighting over a single Chrome instance).

### How sessions work

The `--session` flag (or `BROWSE_SESSION` env var) gives each `browse` command its own isolated browser:

```bash
# Session "signup" gets its own browser
BROWSE_SESSION=signup browse env remote
BROWSE_SESSION=signup browse open https://app.com/signup

# Session "dashboard" gets a completely separate browser
BROWSE_SESSION=dashboard browse env remote
BROWSE_SESSION=dashboard browse open https://app.com/dashboard

# They don't share state — each has its own page, cookies, refs
```

### When to use parallel vs sequential

| Scenario | Use |
|----------|-----|
| Tests on different pages/routes | **Parallel** — no shared state |
| Tests within one page (fill form → submit → check result) | **Sequential** — steps depend on each other |
| Accessibility audit + visual audit on same page | **Parallel** — independent checks |
| Before/after comparison on one element | **Sequential** — ordering matters |

### Phase 1: Group tests by independence

After generating your test plan (from Workflow A or B), group tests that can run in parallel:

```
Parallel Groups (from diff-driven test plan)
=============================================
Group 1 (session: signup)     → /signup form validation (happy + adversarial)
Group 2 (session: dashboard)  → /dashboard empty state + data display
Group 3 (session: a11y)       → /settings accessibility audit (axe-core + keyboard)
```

Rule: tests within a group run sequentially. Groups run in parallel.

### Phase 2: Launch parallel agents

Use the Agent tool to fan out. Each agent gets a unique session name and runs its test group independently:

```
Launch agents in parallel (use Agent tool with multiple invocations in one message):

Agent 1 — prompt: "Run signup form tests using BROWSE_SESSION=signup.
  Use `browse env remote` first. Run these tests: [list tests].
  Follow the before/after assertion protocol.
  Return structured STEP_PASS/STEP_FAIL markers.
  Run `BROWSE_SESSION=signup browse stop` when done."

Agent 2 — prompt: "Run dashboard tests using BROWSE_SESSION=dashboard.
  Use `browse env remote` first. Run these tests: [list tests].
  Follow the before/after assertion protocol.
  Return structured STEP_PASS/STEP_FAIL markers.
  Run `BROWSE_SESSION=dashboard browse stop` when done."

Agent 3 — prompt: "Run accessibility audit using BROWSE_SESSION=a11y.
  Use `browse env remote` first. Run these tests: [list tests].
  Follow the before/after assertion protocol.
  Return structured STEP_PASS/STEP_FAIL markers.
  Run `BROWSE_SESSION=a11y browse stop` when done."
```

**Critical rules for parallel agents:**
- Every `browse` command in the agent MUST be prefixed with `BROWSE_SESSION=<name>`
- Each agent must call `browse env remote` before any other browse command
- Each agent must call `browse stop` when done (with its session name)
- Pass the full test steps and assertion protocol to each agent — they don't have the skill context
- Include the before/after snapshot pattern in each agent's prompt

### Phase 3: Collect and merge results

As agents complete, collect their STEP_PASS/STEP_FAIL markers and merge into one report:

```
## UI Test Results (Parallel Run)

### Group: signup (session: signup)
STEP_PASS|valid-email|heading "Welcome!" appeared after submit
STEP_PASS|empty-submit|validation error shown for empty form
STEP_FAIL|double-submit|expected single submission → two success toasts appeared

### Group: dashboard (session: dashboard)
STEP_PASS|empty-state|"No items yet" message with CTA displayed
STEP_PASS|data-display|table rendered 5 rows with correct columns

### Group: a11y (session: a11y)
STEP_FAIL|axe-audit|expected 0 violations → 2 critical: color-contrast, missing-label
STEP_PASS|keyboard-nav|all 12 elements reachable via Tab

---
**Summary: 5/7 passed, 2 failed (across 3 parallel sessions)**
Failed: double-submit (signup), axe-audit (a11y)
```

### Parallel with cookie-sync (authenticated pages)

If testing authenticated pages, sync cookies once and share the context ID across sessions:

```bash
# Sync once
node .claude/skills/cookie-sync/scripts/cookie-sync.mjs --domains staging.app.com
# Output: Context ID: ctx_abc123

# Each session uses the same context ID
BROWSE_SESSION=settings browse env remote
BROWSE_SESSION=settings browse open https://staging.app.com/settings --context-id ctx_abc123

BROWSE_SESSION=profile browse env remote
BROWSE_SESSION=profile browse open https://staging.app.com/profile --context-id ctx_abc123
```

### Cleanup

Always stop all sessions when done, even if a test fails:

```bash
BROWSE_SESSION=signup browse stop 2>/dev/null
BROWSE_SESSION=dashboard browse stop 2>/dev/null
BROWSE_SESSION=a11y browse stop 2>/dev/null
```

## Test Categories

| Category | How | Assertion type |
|----------|-----|---------------|
| Accessibility | axe-core + keyboard nav | Deterministic (violation count) |
| Visual Quality | Screenshot + heuristic evaluation | Visual judgment (weakest — note specifics) |
| Responsive | Viewport sweep + screenshots | Visual + deterministic (overflow check) |
| Console Health | Console capture eval | Deterministic (error count) |
| UX Heuristics | Snapshot + Laws of UX + Nielsen's | Structured judgment (cite specific heuristic) |
| Error States | Navigate to empty/error states | Before/after comparison |
| Data Display | Snapshot on tables/dashboards | Element match (column count, formatting) |
| Exploratory | Free navigation + adversarial testing | Before/after + judgment |

Reference guides: [rules/ux-heuristics.md](rules/ux-heuristics.md), [references/exploratory-testing.md](references/exploratory-testing.md)

## Test Suite Format

Tests stored in `.ui-tests/suite.yml`:

```yaml
version: 1
base_url: https://my-app.vercel.app
generated_from: ./src
generated_at: 2026-03-24T12:00:00Z

tests:
  - name: Settings page — keyboard accessibility
    category: accessibility
    priority: high
    target: /settings
    auth_required: true
    intent: >
      Tab through all interactive elements on the settings page.
      Verify focus rings are visible, tab order is logical,
      and axe-core reports zero critical violations.
    pass_criteria:
      - "All elements reachable via Tab"
      - "Zero critical axe-core violations"
      - "Focus rings visible on all interactive elements"
```

## Best Practices

1. **Be adversarial** — try to break things, don't just confirm they work
2. **Every assertion needs evidence** — snapshot ref, eval result, or before/after diff
3. **Before/after for every interaction** — snapshot, act, snapshot, compare
4. **Deterministic checks first** — axe-core, console errors, form labels before visual judgment
5. **Local for localhost, remote for deployed** — never use Browserbase for localhost
6. **Always `browse stop` when done** — for parallel runs, stop every named session
7. **Report failures with reproduction steps** — action, expected, actual, suggestion
8. **Parallelize independent tests** — use Workflow C with named sessions when testing multiple pages or categories on a deployed site

## Troubleshooting

- **"No active page"**: `browse stop`, retry. For zombies: `pkill -f "browse.*daemon"`
- **Dev server not responding**: `curl http://localhost:<port>` — ask user to start it
- **`browse eval` with `await` fails**: Use `.then()` instead — `browse eval` doesn't support top-level await
- **Element ref not found**: `browse snapshot` again — refs change on page update
- **Blank snapshot**: `browse wait load` or `browse wait selector ".expected"` before snapshotting
- **SPA deep links 404**: Navigate to `/` first, then click through
- **Remote auth fails**: Re-run cookie-sync with `--context <id>`, try `--stealth`
- **Parallel session conflicts**: Ensure every `browse` command uses `BROWSE_SESSION=<name>` — without it, commands go to the default session
- **Session not stopping**: `BROWSE_SESSION=<name> browse stop`. For zombies: `pkill -f "browse.*<name>.*daemon"`
