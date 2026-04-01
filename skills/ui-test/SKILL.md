---
name: ui-test
description: "AI-powered adversarial UI testing via the browse CLI. Analyzes git diffs to test only what changed, or explores the full app to find bugs. Tests functional correctness, accessibility, responsive layout, and UX heuristics. Use when the user asks to test UI changes, QA a pull request, audit accessibility, or run exploratory testing. Supports local browser (localhost) and remote Browserbase (deployed sites)."
license: MIT
metadata:
  author: browserbase
  version: "0.4.0"
allowed-tools: Bash Read Glob Grep Agent
compatibility: "Requires the browse CLI (`npm install -g @browserbasehq/browse-cli`). For remote testing: BROWSERBASE_API_KEY and cookie-sync skill."
---

# UI Test — Agentic UI Testing Skill

Test UI changes in a real browser. Your job is to **try to break things**, not confirm they work.

Three workflows:
- **Diff-driven** — analyze a git diff, test only what changed
- **Exploratory** — navigate the app, find bugs the developer didn't think about
- **Parallel** — fan out independent test groups across multiple Browserbase browsers

## Budget & Limits

Every test run has a budget. The main agent **coordinates** — it analyzes the diff, plans test groups, and fans out work to sub-agents. Sub-agents do the actual testing.

### Time math

Each `browse` command takes ~30 seconds. A sub-agent doing 20 steps ≈ 10 min. The bottleneck is the **slowest sub-agent** — if one runs away, the whole run stalls waiting for it.

### Budget structure

| Role | Limit | Why |
|------|-------|-----|
| **Main agent** | Coordinator only — no `browse` commands | It plans, delegates, merges. Zero testing. |
| **Sub-agent** | **20 steps max** (~10 min each) | Hard cap. Stop and report at 20 even if there's more to test. |
| **Max sub-agents** | 5 per run | More agents × fewer steps = fast wall clock |
| **Max pages per agent** | 3 | Keep each agent tightly focused |

**Total cap: ~100 test steps per run** (5 agents × 20 steps). Wall clock target: **~10 min**.

No early stopping on failures — find as many bugs as possible within the step budget.

The key constraint is **per-agent**: 20 steps max, no exceptions. It's better to split work across more focused agents than to let one agent go deep.

### How the main agent should work

1. **Analyze** — read the diff, categorize changes, identify URLs to test
2. **Plan** — split into small, focused groups (1-2 pages per group, one test category each)
3. **Delegate** — launch up to 5 sub-agents in parallel, each with a tight scope and 20-step budget
4. **Merge** — collect results, produce the final report

The main agent should NOT run `browse` commands itself (except to verify the dev server is up). All testing happens in sub-agents.

**Splitting rules:**
- Each sub-agent gets 1-2 pages and one test category (e.g., "signup form validation", "dashboard accessibility", "nav + routing")
- If a page needs both functional and accessibility testing, split into two agents
- Prefer 5 agents × 15 steps over 3 agents × 20 steps — smaller scope = faster, more focused

### Adjusting the budget

| User says | Steps per agent | Max agents | Wall clock |
|-----------|----------------|------------|------------|
| "quick test" | 10 | 2 | ~5 min |
| (default) | 20 | 5 | ~10 min |
| "thorough test" | 30 | 5 | ~15 min |

### Budget reporting

**Every sub-agent must include a budget line when reporting back:**
```
Budget: 14/20 steps used | 2 pages visited | 3 failures
```

**The main agent includes a total in the final report:**
```
Total budget: 62/100 steps across 5 agents | ~10 min wall clock | 7 failures
```

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
STEP_FAIL|<step-id>|<expected> → <actual>|<screenshot-path>
```

- `step-id`: short identifier like `homepage-cta`, `form-validation-error`, `modal-cancel`
- `evidence`: what you observed that proves the step passed (element ref, text content, URL, eval result)
- `expected → actual`: what you expected vs what you got
- `screenshot-path`: path to the saved screenshot (failures only — see Screenshot Capture below)

### Screenshot Capture for Failures

**Every STEP_FAIL MUST have an accompanying screenshot** so the developer can see what went wrong visually.

When a test step fails:

```bash
# 1. Take a screenshot immediately after observing the failure
browse screenshot --path .context/ui-test-screenshots/<step-id>.png

# If --path is not supported, take the screenshot and save manually:
browse screenshot
# The browse CLI will output the screenshot path — move/copy it:
cp /tmp/browse-screenshot-*.png .context/ui-test-screenshots/<step-id>.png
```

Setup the screenshot directory at the start of any test run:

```bash
mkdir -p .context/ui-test-screenshots
```

**Rules:**
- File name = step-id (e.g., `double-submit.png`, `axe-audit.png`, `modal-focus-trap.png`)
- Store in `.context/ui-test-screenshots/` — this directory is gitignored and accessible to the developer and other agents
- For parallel runs, include the session name: `<session>-<step-id>.png` (e.g., `signup-double-submit.png`)
- Take the screenshot at the moment of failure — capture the broken state, not after recovery
- For visual/layout bugs, also screenshot the baseline (working state) for comparison: `<step-id>-baseline.png`

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
# If nothing changed:
browse screenshot --path .context/ui-test-screenshots/modal-open.png
# STEP_FAIL|modal-open|expected dialog to appear → snapshot unchanged|.context/ui-test-screenshots/modal-open.png
```

## Setup

```bash
which browse || npm install -g @browserbasehq/browse-cli
```

### Avoid permission fatigue

This skill runs many `browse` commands (snapshots, clicks, evals). To avoid approving each one, add `browse` to your allowed commands:

Add both patterns to `.claude/settings.json` (project-level) or `~/.claude/settings.json` (user-level):
```json
{
  "permissions": {
    "allow": [
      "Bash(browse:*)",
      "Bash(BROWSE_SESSION=*)"
    ]
  }
}
```

The first pattern covers plain `browse` commands. The second covers parallel sessions (`BROWSE_SESSION=signup browse open ...`). Both are needed to avoid approval prompts.

## Mode Selection

| Target | Mode | Command | Auth |
|--------|------|---------|------|
| `localhost` / `127.0.0.1` | Local | `browse env local` | None needed |
| Deployed/staging site | Remote | `browse env remote` | cookie-sync → `--context-id` |

**Rule: If the target URL contains `localhost` or `127.0.0.1`, always use `browse env local`.**

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
mkdir -p .context/ui-test-screenshots
# localhost → always use local
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

### STEP_FAIL|double-submit|expected single submission → form submitted twice|.context/ui-test-screenshots/double-submit.png
- URL: http://localhost:3000/signup
- Before: form with submit button @0-7
- Action: clicked @0-7 twice rapidly
- After: two success toasts appeared, suggesting duplicate submission
- Screenshot: .context/ui-test-screenshots/double-submit.png
- Suggestion: disable submit button after first click, or debounce the handler

---
**Summary: 4/6 passed, 2 failed**
Failed: double-submit, xss-sanitization

Screenshots saved to `.context/ui-test-screenshots/` — open any failed step's screenshot to see the broken state.
```

Always `browse stop` when done.

## Adversarial Test Patterns

Apply these to every interactive element you test. Read [references/adversarial-patterns.md](references/adversarial-patterns.md) for the full pattern library (forms, modals, navigation, error states, keyboard accessibility).

## Deterministic Checks

These produce structured data, not judgment calls. Use them as the strongest form of assertion.

| Check | What it catches | Assertion |
|-------|----------------|-----------|
| axe-core | WCAG violations | `violations.length === 0` |
| Console errors | Runtime exceptions, failed requests | empty error array |
| Broken images | Missing/failed image loads | no images with `naturalWidth === 0` |
| Form labels | Inputs without accessible labels | every input has `hasLabel: true` |

For the exact `browse eval` recipes, read [references/browser-recipes.md](references/browser-recipes.md).

## Workflow B: Exploratory Testing

No diff, no plan — just open the app and try to break it. Use this when the user says "test my app", "find bugs", or "QA this site."

### Approach

1. **Discover the app** — read `package.json` to detect the framework, then open the root URL and snapshot to see what's there
2. **Navigate everything** — click through nav links, visit every reachable page, note what exists
3. **Test what you find** — for each page, apply the adversarial patterns below (forms, modals, navigation, keyboard, error states)
4. **Run deterministic checks** — axe-core, console errors, broken images, form labels on every page
5. **Report findings** — use STEP_PASS/STEP_FAIL markers, include reproduction steps for failures

Don't try to be systematic about coverage. Just explore like a user would, but with the intent to break things. The agent is good at this — let it roam.

### Tips for exploratory runs

- Start with the homepage, then follow the navigation naturally
- Try the 404 page (`/does-not-exist`) — is it custom or default?
- Look for empty states (pages with no data)
- Test forms with garbage input before valid input
- Check mobile viewport (375px) on every page — does it overflow?
- If the app has auth, use cookie-sync first

## Workflow C: Parallel Testing

Run independent test groups concurrently using named `browse` sessions (`BROWSE_SESSION=<name>`). Each session gets its own browser. Works with both local and remote mode.

Use when testing multiple pages or categories and you want faster wall clock time.

Read [references/parallel-testing.md](references/parallel-testing.md) for the full workflow: session setup, agent fan-out, cookie-sync for auth, and result merging.

## Design Consistency

Check whether changed UI matches the rest of the app visually. Read [references/design-consistency.md](references/design-consistency.md) when doing visual or design checks.

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
| Design Consistency | Screenshot baseline + changed page comparison | Visual judgment (cite specific property) |
| Exploratory | Free navigation + adversarial testing | Before/after + judgment |

Reference guides (load on demand):
- **Adversarial patterns** — [references/adversarial-patterns.md](references/adversarial-patterns.md) — load when testing forms, modals, navigation, or keyboard a11y
- **Browser recipes** — [references/browser-recipes.md](references/browser-recipes.md) — load when running deterministic checks (axe-core, console, images, form labels)
- **Exploratory testing** — [references/exploratory-testing.md](references/exploratory-testing.md) — load for Workflow B (no diff, open exploration)
- **UX heuristics** — [references/ux-heuristics.md](references/ux-heuristics.md) — load when evaluating UX quality or citing specific heuristics
- **Design system** — [references/design-system.example.md](references/design-system.example.md) — template for users to customize
- **Design consistency** — [references/design-consistency.md](references/design-consistency.md) — load when doing visual consistency checks
- **Parallel testing** — [references/parallel-testing.md](references/parallel-testing.md) — load for Workflow C (concurrent sessions)

For worked examples with exact commands, read [EXAMPLES.md](EXAMPLES.md) if you need to see the assertion protocol in action.

## Best Practices

1. **Be adversarial** — try to break things, don't just confirm they work
2. **Every assertion needs evidence** — snapshot ref, eval result, or before/after diff
3. **Before/after for every interaction** — snapshot, act, snapshot, compare
4. **Screenshot every failure** — `browse screenshot` immediately on STEP_FAIL, save to `.context/ui-test-screenshots/<step-id>.png`
5. **Deterministic checks first** — axe-core, console errors, form labels before visual judgment
6. **Local for localhost, remote for deployed** — never use Browserbase for localhost
7. **Always `browse stop` when done** — for parallel runs, stop every named session
8. **Report failures with reproduction steps** — action, expected, actual, screenshot path, suggestion
9. **Parallelize independent tests** — use Workflow C with named sessions when testing multiple pages or categories on a deployed site

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
