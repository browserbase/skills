# Parallel Testing

Run multiple tests concurrently using named `browse` sessions. Each named session gets its own independent browser. Use this when you have multiple independent test groups (different pages, different categories) and want faster results.

Works with both local and remote mode. Named sessions are fully independent — each has its own browser process.

### How sessions work

The `--session` flag (or `BROWSE_SESSION` env var) gives each `browse` command its own independent browser. For localhost, `browse env local` starts each session in a clean isolated browser by default:

```bash
# Session "signup" gets its own browser
# Use env local for localhost URLs, env remote for deployed URLs
BROWSE_SESSION=signup browse env local
BROWSE_SESSION=signup browse open http://localhost:3000/signup

# Session "dashboard" gets a completely separate browser
BROWSE_SESSION=dashboard browse env local
BROWSE_SESSION=dashboard browse open http://localhost:3000/dashboard

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

After generating your test plan (from Workflow A), or identifying pages to test (Workflow B), group tests that can run in parallel:

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
  Use `browse env local` first (localhost URL). If this flow needs existing local credentials, use `browse env local --auto-connect` instead. Run these tests: [list tests].
  Follow the before/after assertion protocol.
  On any STEP_FAIL, immediately take a screenshot:
    BROWSE_SESSION=signup browse screenshot --path .context/ui-test-screenshots/signup-<step-id>.png
  Return structured STEP_PASS/STEP_FAIL markers (include screenshot path for failures).
  Run `BROWSE_SESSION=signup browse stop` when done."

Agent 2 — prompt: "Run dashboard tests using BROWSE_SESSION=dashboard.
  Use `browse env local` first (localhost URL). If this flow needs existing local credentials, use `browse env local --auto-connect` instead. Run these tests: [list tests].
  Follow the before/after assertion protocol.
  On any STEP_FAIL, immediately take a screenshot:
    BROWSE_SESSION=dashboard browse screenshot --path .context/ui-test-screenshots/dashboard-<step-id>.png
  Return structured STEP_PASS/STEP_FAIL markers (include screenshot path for failures).
  Run `BROWSE_SESSION=dashboard browse stop` when done."

Agent 3 — prompt: "Run accessibility audit using BROWSE_SESSION=a11y.
  Use `browse env local` first (localhost URL). If this flow needs existing local credentials, use `browse env local --auto-connect` instead. Run these tests: [list tests].
  Follow the before/after assertion protocol.
  On any STEP_FAIL, immediately take a screenshot:
    BROWSE_SESSION=a11y browse screenshot --path .context/ui-test-screenshots/a11y-<step-id>.png
  Return structured STEP_PASS/STEP_FAIL markers (include screenshot path for failures).
  Run `BROWSE_SESSION=a11y browse stop` when done."
```

**Critical rules for parallel agents:**
- Every `browse` command in the agent MUST be prefixed with `BROWSE_SESSION=<name>`
- If the target URL is localhost/127.0.0.1, each agent must start with `browse env local`; use `browse env local --auto-connect` only when that test needs existing local credentials
- Each agent must call `browse stop` when done (with its session name)
- Pass the full test steps and assertion protocol to each agent — they don't have the skill context
- Include the before/after snapshot pattern in each agent's prompt
- Tell each agent to `mkdir -p .context/ui-test-screenshots` and save screenshots on failure with the naming convention `<session>-<step-id>.png`

### Phase 3: Collect and merge results

As agents complete, collect their STEP_PASS/STEP_FAIL markers and merge into one report:

```
## UI Test Results (Parallel Run)

### Group: signup (session: signup)
STEP_PASS|valid-email|heading "Welcome!" appeared after submit
STEP_PASS|empty-submit|validation error shown for empty form
STEP_FAIL|double-submit|expected single submission → two success toasts appeared|.context/ui-test-screenshots/signup-double-submit.png

### Group: dashboard (session: dashboard)
STEP_PASS|empty-state|"No items yet" message with CTA displayed
STEP_PASS|data-display|table rendered 5 rows with correct columns

### Group: a11y (session: a11y)
STEP_FAIL|axe-audit|expected 0 violations → 2 critical: color-contrast, missing-label|.context/ui-test-screenshots/a11y-axe-audit.png
STEP_PASS|keyboard-nav|all 12 elements reachable via Tab

---
**Summary: 5/7 passed, 2 failed (across 3 parallel sessions)**
Failed: double-submit (signup), axe-audit (a11y)

Screenshots: `.context/ui-test-screenshots/`
- signup-double-submit.png — duplicate toast after rapid submit
- a11y-axe-audit.png — page showing color contrast and missing label violations
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
