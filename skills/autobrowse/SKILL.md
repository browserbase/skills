---
name: autobrowse
description: Self-improving browser automation via the auto-research loop. Iteratively runs a browsing task, reads the trace, and improves the navigation skill (strategy.md) until it reliably passes. Supports parallel runs across multiple tasks using sub-agents. Use when you want to build or improve browser automation skills for specific website tasks.
license: See LICENSE.txt
compatibility: "Requires Node.js 18+, browse CLI, and ANTHROPIC_API_KEY. Run from the autobrowse app directory."
allowed-tools: Bash Read Write Edit Glob Grep Agent
metadata:
  author: browserbase
  homepage: https://github.com/browserbase/skills
---

# AutoBrowse — Self-Improving Browser Skill

Build reliable browser automation skills through iterative experimentation. An inner agent browses the site (`evaluate.ts`). You — the outer agent — read what happened and improve the instructions (`strategy.md`). Repeat until it passes consistently.

## Entry Points

Invocation is flexible — both explicit flags and free-form natural language work:

```
/autobrowse --task google-flights
/autobrowse --task google-flights --iterations 10 --env remote
/autobrowse --tasks google-flights,amazon-add-to-cart
/autobrowse --all

# Also fine — parse freely:
/autobrowse https://flights.google.com/
/autobrowse book a flight on delta.com
/autobrowse fix the existing google-flights skill
```

When the user drops a URL or free-form instruction instead of `--task <name>`:
- If an existing task in `${WORKSPACE}/tasks/` clearly matches the site/intent, use it.
- Otherwise, pick a short kebab-case name, create `${WORKSPACE}/tasks/<name>/task.md` from `${CLAUDE_SKILL_DIR}/references/example-task.md`, fill in the URL/goal based on what the user said, and proceed. Tell the user the chosen name in one line.

---

## How to run

### Step 1 — Parse arguments and orient

Check what was passed:
- `--task <name>` → single task mode
- `--tasks a,b,c` or `--all` → multi-task mode (spawn sub-agents)
- `--iterations N` → how many evaluate → improve cycles (default: 5)
- `--env local|remote` → browser environment (default: local; use remote for bot-protected sites)

If the user passed free-form text instead, map it to one of the above before continuing.

### Step 2 — Set up the workspace

All training artifacts (task definitions, strategy iterations, traces, reports) live in a workspace directory in the **current working directory** — NOT inside `~/.claude/skills/`. This keeps the inner agent's file writes out of Claude's home dir and away from permission friction.

Default workspace: `${CWD}/autobrowse/`

```bash
mkdir -p ./autobrowse/tasks ./autobrowse/traces ./autobrowse/reports
```

If the task directory (`./autobrowse/tasks/<task>/task.md`) doesn't exist yet, scaffold it:

```bash
mkdir -p ./autobrowse/tasks/<task>
cp ${CLAUDE_SKILL_DIR}/references/example-task.md ./autobrowse/tasks/<task>/task.md
# Then edit task.md to describe the URL, inputs, steps, and expected JSON output
```

The skill source at `${CLAUDE_SKILL_DIR}` stays read-only — only `./autobrowse/` in CWD gets written to during training. Graduation (final step) writes a single file to `~/.claude/skills/<task>/SKILL.md`.

List available tasks:
```bash
ls ./autobrowse/tasks/
```

### Step 3 — Multi-task: spawn parallel sub-agents

If running multiple tasks, use the Agent tool to spawn one sub-agent per task simultaneously. Each sub-agent receives a self-contained prompt to run the full autobrowse loop for its task:

> "You are running the autobrowse skill for task `<name>`. Workspace: `<absolute-path-to-workspace>` (e.g. `/path/to/project/autobrowse`). Run `<N>` iterations of: evaluate → read trace → improve strategy.md → repeat. Use `--env <env>`. Pass `--workspace <workspace>` to every evaluate.mjs invocation. Follow the autobrowse loop instructions exactly.
>
> When graduating, install the skill to `~/.claude/skills/<task-name>/SKILL.md` with proper agentskills frontmatter (name + description). Do not just copy strategy.md — write a self-contained skill.
>
> At the end, output a structured summary with: task name, pass/fail on final run, total cumulative cost, iterations completed, per-iteration table (iter number, turns, cost, status, hypothesis tested), and 2-3 bullet key learnings."

Spawn all sub-agents in parallel, wait for all to complete, then collect their summaries and write the session report.

**For single task**, skip this step and run the loop directly below.

---

## The Loop (run this for each task)

### Iteration start

Check that `./autobrowse/tasks/<task>/task.md` exists (scaffold it from the template if not — see Step 2). `strategy.md` is auto-created empty by the harness on first run.

### Requirements

- `ANTHROPIC_API_KEY` must be in the environment (or in a `.env` file in CWD — `evaluate.mjs` auto-loads it). If missing, the harness prints a clear error and exits; don't hunt for keys in other paths.

### Run the inner agent

```bash
node ${CLAUDE_SKILL_DIR}/scripts/evaluate.mjs --task <task-name> --workspace ./autobrowse
# or for bot-protected sites:
node ${CLAUDE_SKILL_DIR}/scripts/evaluate.mjs --task <task-name> --workspace ./autobrowse --env remote
```

This runs the browser session and writes a full trace to `./autobrowse/traces/<task>/latest/`.

### Read the trace

```bash
cat ./autobrowse/traces/<task-name>/latest/summary.md
```

The summary has duration, cost, turns, the decision log, and the final JSON output.

If the agent failed or got stuck, look deeper:
- Read `./autobrowse/traces/<task-name>/latest/trace.json` — search for the failure turn
- Read screenshots around the failure point with the Read tool

### Form one hypothesis

Find the exact turn where things went wrong. What single heuristic would have prevented it?

Examples:
- "After clicking the dropdown, wait 1s — options animate in before they're clickable"
- "Navigate directly to `/pay-invoice/` — skip the landing page entirely"
- "Use `browse fill #field_3 value` not `browse type` — this field clears on focus"
- "The page shows a spinner at turn 8 — add `browse wait timeout 2000` before snapshot"

### Update strategy.md

Edit `./autobrowse/tasks/<task-name>/strategy.md`. Keep everything that worked. Fix the specific failure. Add a concrete heuristic.

Good strategies have:
- **Fast path**: direct URL or shortcuts to skip exploration
- **Step-by-step workflow**: exact sequence with timing notes
- **Site-specific knowledge**: selector IDs, form field names, success indicators
- **Failure recovery**: what to do when X goes wrong

### Judge the result

Read the new summary. Did it pass? Make clear progress?
- **Pass or progress** → keep, next iteration
- **No progress or regression** → revert strategy.md to the previous version and try a different hypothesis

### After all iterations — publish if ready

If the task passed on 2+ of the last 3 iterations **or has reached the max iteration limit**, install it as a Claude Code skill. **Do not just copy strategy.md** — the skill must be self-contained and useful to someone who has never seen this codebase. If graduating at max iterations without a clean pass, note the known failure point but still document everything learned.

Install by writing to `~/.claude/skills/<task-name>/SKILL.md`:

```bash
mkdir -p ~/.claude/skills/<task-name>
```

Use this structure for the SKILL.md:

```markdown
---
name: <task-name>
description: <1-2 sentences describing what this skill does and when to use it. Include trigger keywords.>
---

# <Task Title> — Browser Skill

## Purpose
<1-2 sentences: what this automates and why it exists.>

## When to Use
<When should someone reach for this skill.>

## Browse CLI Reference
The inner agent uses the `browse` CLI. Key commands for this task:
- `browse stop` — kill existing session (always run before switching to remote)
- `browse env remote` — start a fresh Browserbase cloud session
- `browse newpage <url>` — open URL in a new tab (required in remote mode — `browse open` fails with "no page available")
- `browse open <url>` — navigate existing tab (local mode only)
- `browse wait load` — wait for page to finish loading
- `browse wait timeout <ms>` — wait a fixed amount of time for spinners or animations
- `browse wait selector "<selector>"` — wait for an element to become visible
- `browse get title` — verify you're on the right page
- `browse get text body` — extract all visible text (preferred for content extraction)
- `browse snapshot` — get accessibility tree; each node has a ref in `[X-Y]` format (e.g. `[0-5]`, `[2-147]`)
- `browse click [X-Y]` — click element by ref from the latest snapshot (include the brackets)

**Never use `--session <name>` flags in SKILL.md.** Named sessions are a parallel-run workaround — they contaminate skills with infrastructure concerns. Skills must work in isolation with the default session.

## Workflow

### Step 1 — Start session
<exact browse commands in order>

### Step 2 — Navigate
<exact URL and verification steps>

### Step 3 — Extract
<exact extraction commands>

### Step 4 — Output
<what JSON to emit, referencing the schema below>

## Site-Specific Gotchas
<Bullet list of every hard-won heuristic from the iterations. This is the core value of the skill.>

## Failure Recovery
<What to do when navigation fails, session is contaminated, or extraction returns garbage>

## Expected Output
```json
<paste the exact expected output schema from task.md>
```
```

After writing the SKILL.md, confirm it's installed:
```bash
ls ~/.claude/skills/<task-name>/SKILL.md
```

The skill is now available as `/<task-name>` in Claude Code.

---

## Final report (multi-task mode)

After all sub-agents complete, print a markdown table:

| Task | Iterations | Final Status | Graduated | Cost |
|------|-----------|--------------|-----------|------|
| google-flights | 5 | ✅ pass | yes | $0.42 |
| amazon-add-to-cart | 5 | ❌ fail | no | $1.20 |

Then write a persistent session report to `./autobrowse/reports/` so there's a durable record of the run inside the workspace:

```bash
mkdir -p ./autobrowse/reports
```

Write the file `./autobrowse/reports/YYYY-MM-DD-HH-MM-<tasks>.md` with:

```markdown
# AutoBrowse Session Report
**Date:** <ISO date>
**Tasks:** <comma-separated list>
**Environment:** remote|local
**Total cost:** $X.XX

## Results

| Task | Iterations | Pass Rate | Final Status | Graduated | Cost |
|------|-----------|-----------|--------------|-----------|------|
| ... | ... | X/5 | ✅/❌ | yes/no | $X.XX |

## Per-Task Learnings

### <task-name>
- **Key insight 1:** <what the agent learned>
- **Key insight 2:** <another heuristic>
- **Failure mode fixed:** <what was failing and how it was resolved>

## Iteration Log

### <task-name>
| Iter | Turns | Cost | Status | Hypothesis tested |
|------|-------|------|--------|-------------------|
| 1 | 79 | $18.75 | ❌ fail | baseline |
| 2 | 9 | $0.26 | ✅ pass | session contamination fix |
| ... | ... | ... | ... | ... |
```

---

## Export to deterministic Playwright

Once a task has graduated, you can collapse the LLM-driven replay loop into a single deterministic TypeScript script via the `export` subcommand. The export mines the most recent passing run's `trace.json`, resolves session-scoped ARIA refs against the snapshots they came from, and emits a Playwright script that connects to a fresh Browserbase session (optionally bound to a persistent context).

```bash
# Default — generate and verify against the latest passing run
node ${CLAUDE_SKILL_DIR}/scripts/export.mjs --task <task-name>

# Custom workspace / specific run / skip verification
node ${CLAUDE_SKILL_DIR}/scripts/export.mjs --task <task-name> --workspace ./autobrowse
node ${CLAUDE_SKILL_DIR}/scripts/export.mjs --task <task-name> --run run-022
node ${CLAUDE_SKILL_DIR}/scripts/export.mjs --task <task-name> --no-verify
```

The export writes to `<workspace>/tasks/<task>/playwright/`:

- `<task>.ts` — runnable Playwright script. Connects to Browserbase via `chromium.connectOverCDP` when `BROWSERBASE_CONTEXT_ID` is set; falls back to local Chromium otherwise.
- `selectors.cache.json` — resolved locators + ranked fallbacks per action. Used by future self-healing tooling.
- `package.json`, `tsconfig.json` — minimal scaffold with `playwright`, `zod`, `tsx`, `dotenv`.

How refs are resolved: every `[X-Y]` ref in the trace is looked up against the most recent prior `browse snapshot` containing it. The matched node's role + accessible name are turned into a ranked list of Playwright locator candidates — `getByRole({ name })` first, then `getByLabel` / `getByPlaceholder` for form inputs, then `getByText`, then bare `getByRole`. The best candidate is emitted inline; lower-ranked candidates are saved to `selectors.cache.json` for self-healing.

The final extract step is generated with one Claude Haiku call at export time (requires `ANTHROPIC_API_KEY`). The LLM is given the final snapshot, the Zod schema parsed from `task.md`'s `## Output` block, and the agent's final reasoning. If the API key is missing the export still produces a script — the extract block is a TODO placeholder.

For a Stagehand-targeted export (self-healing replay via `stagehand.page.act` / `stagehand.page.extract`), pass `--target stagehand`:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/export.mjs --task <task-name> --target stagehand
```

Stagehand-native: every interaction op (clicks, fills, selects) collapses into a `page.act("…")` call. Deterministic ops (goto, waits, keyboard, scroll, eval, page nav) stay as raw `page.*` calls — there's no element to find, so no LLM call is needed. The final extract step uses `page.extract({ instruction, schema })` with a one-sentence instruction generated at export time (Haiku, ~$0.001) or a generic fallback if `ANTHROPIC_API_KEY` is missing.

The Stagehand script reads `BROWSERBASE_API_KEY` / `BROWSERBASE_PROJECT_ID` to run against Browserbase (and `BROWSERBASE_CONTEXT_ID` for pre-authed sessions); when those are absent it falls back to `env: "LOCAL"`. Model selection is controlled by the `STAGEHAND_MODEL` env var (defaults to a current Claude Sonnet).

## Iterative loop (recommended for tasks that need a deterministic artifact)

When the end goal is a runnable script (cron, Browserbase Functions, etc.), prefer `loop.mjs` over manually orchestrating evaluate + export. The loop converges on a workflow that **both** the LLM explorer **and** the deterministic replay can complete — which is a strictly stronger guarantee than "the LLM agent's trace ends with success: true."

```bash
# Playwright (default)
node ${CLAUDE_SKILL_DIR}/scripts/loop.mjs --task <task-name> --env remote \
  --max-iterations 8 --max-turns-per-iter 60

# Stagehand
node ${CLAUDE_SKILL_DIR}/scripts/loop.mjs --task <task-name> --target stagehand --env remote
```

What it does per iteration:

1. Runs `evaluate.mjs` (one LLM-driven exploration round).
2. If the trace passed (`success: true` in the final JSON), runs `export.mjs --target <playwright|stagehand> --no-verify` to emit a fresh script.
3. Runs the emitted script (`npx tsx <task>.ts`) against a new BB session — the actual deterministic replay.
4. If the replay passed → records a pass. If it failed → distills the failure (Claude Haiku, ~$0.01) into a new entry under `strategy.md`'s "Recent Playwright Failures" or "Recent Stagehand Failures" section (target-scoped).
5. Next iteration's evaluate reads the updated strategy.md and adapts.

**Convergence**: graduates when the emitted script passes in 2 of the last 3 iterations.

### Strategy.md sections

The loop expects (and the distiller maintains) this structure:

```markdown
# <task> Navigation Strategy

## Navigation Heuristics
(prose for the LLM explorer — fast-path URLs, timing notes, step sequences)

## Codegen Hints
(per-task overrides for the Playwright emitter — e.g., "use force:true for all radios on this site")

## Recent Playwright Failures
### Iteration 3 — <one-line>
- **What failed**: ...
- **Likely cause**: ...
- **Fix to try next iteration**: ...
```

The emitter (`codegen-playwright.mjs`) bakes in baseline defaults for the most common state-portal patterns: `forceCheck` for checkbox `fill_sel` ops, `forceClickRadio` for radio click ops, `selectWithFallback` (JS-enable + native setter) for every `select_dropdown`, and a `reactFill` helper for inputs that need to bypass keystroke-by-keystroke event handling.

### When to use `loop.mjs` vs `evaluate.mjs` directly

- **Use `loop.mjs`** when you want a Playwright script as the deliverable. Costs more per iteration (each adds a script export + replay) but converges on something that actually replays in prod.
- **Use `evaluate.mjs`** when you want a `/<task>` skill that future Claude sessions invoke (the original autobrowse flow). Cheaper, doesn't generate a Playwright script.

---

### Pre-authed sessions via persistent context

For tasks that need authentication, create a Browserbase context once, log in interactively, and point autobrowse at it via the env var:

```bash
# One-time: create a context, log into the target site via live-view
bb contexts create --project-id $BROWSERBASE_PROJECT_ID --json

# Then, every autobrowse run for this task reuses the cached cookies/storage
export BROWSERBASE_CONTEXT_ID=<id-from-above>
node ${CLAUDE_SKILL_DIR}/scripts/evaluate.mjs --task <name> --env remote
```

When `BROWSERBASE_CONTEXT_ID` is set with `--env remote`, evaluate.mjs creates one BB session bound to that context before the agent loop, transparently injects `--connect <session-id>` into every browse command the agent issues, and releases the session at exit. The agent's `browse env` / `browse stop` / `browse status` calls become no-ops in this mode. Iterations skip the per-run login dance.

The same env var, when set at runtime for the exported script, makes it attach to the same persisted context.

---

## Rules

- **Only edit `strategy.md`** — never touch `task.md` (unless creating it from the template) or `evaluate.mjs`
- **Stay in the workspace** — all training writes go to `./autobrowse/`, never to `~/.claude/skills/autobrowse/`. The skill source is read-only.
- **One hypothesis per iteration** — test one change at a time
- **Build on wins** — keep what worked, add to it
- **Trust the trace** — the inner agent shows exactly what it saw and did
- **Graduate to `~/.claude/skills/`** — the only file you write there is the final graduated `SKILL.md`
