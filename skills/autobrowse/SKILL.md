---
name: autobrowse
description: Self-improving browser automation via the auto-research loop. Iteratively runs a browsing task, reads the trace, and improves the navigation skill (strategy.md) until it reliably passes. Supports parallel runs across multiple tasks using sub-agents. Use when you want to build or improve browser automation skills for specific website tasks.
compatibility: "Requires Node.js 18+, tsx, browse CLI, and ANTHROPIC_API_KEY. Run from the autobrowse app directory."
allowed-tools: Bash Read Write Edit Glob Grep Agent
metadata:
  openclaw:
    requires:
      bins:
        - tsx
        - browse
    homepage: https://github.com/browserbase/skills
---

# AutoBrowse — Self-Improving Browser Skill

Build reliable browser automation skills through iterative experimentation. An inner agent browses the site (`evaluate.ts`). You — the outer agent — read what happened and improve the instructions (`strategy.md`). Repeat until it passes consistently.

## Entry Points

### Single task — interactive loop
```
/autobrowse --task <name>
/autobrowse --task <name> --iterations 10
/autobrowse --task <name> --env remote
```

### Multiple tasks — parallel sub-agents
```
/autobrowse --all
/autobrowse --tasks google-flights,slusa-payment --iterations 5
/autobrowse --all --env remote --iterations 10
```

---

## How to run

### Step 1 — Parse arguments and orient

Check what was passed:
- `--task <name>` → single task mode
- `--tasks a,b,c` or `--all` → multi-task mode (spawn sub-agents)
- `--iterations N` → how many evaluate → improve cycles (default: 5)
- `--env local|remote` → browser environment (default: local; use remote for bot-protected sites)

List available tasks if needed:
```bash
ls tasks/
```

### Step 2 — Multi-task: spawn parallel sub-agents

If running multiple tasks, use the Agent tool to spawn one sub-agent per task simultaneously. Each sub-agent receives a self-contained prompt to run the full autobrowse loop for its task:

> "You are running the autobrowse skill for task `<name>`. Working directory: `<cwd>`. Run `<N>` iterations of: evaluate → read trace → improve strategy.md → commit. Use `--env <env>`. Follow the autobrowse loop instructions exactly.
>
> When graduating, write a proper structured skill.md (not a copy of strategy.md) — see the graduation template in SKILL.md.
>
> At the end, output a structured summary with: task name, pass/fail on final run, total cumulative cost, iterations completed, per-iteration table (iter number, turns, cost, status, hypothesis tested), and 2-3 bullet key learnings."

Spawn all sub-agents in parallel, wait for all to complete, then collect their summaries and write the session report.

**For single task**, skip this step and run the loop directly below.

---

## The Loop (run this for each task)

### Iteration start

Check if `tasks/<task>/strategy.md` exists. If not, create it:
```markdown
# <task> Navigation Skill

(This will grow as the agent learns through iterations)
```

### Run the inner agent

```bash
tsx ${CLAUDE_SKILL_DIR}/scripts/evaluate.ts --task <task-name>
# or for bot-protected sites:
tsx ${CLAUDE_SKILL_DIR}/scripts/evaluate.ts --task <task-name> --env remote
```

This runs the browser session and writes a full trace to `traces/<task>/latest/`.

### Read the trace

```bash
cat traces/<task-name>/latest/summary.md
```

The summary has duration, cost, turns, the decision log, and the final JSON output.

If the agent failed or got stuck, look deeper:
- Read `traces/<task-name>/latest/trace.json` — search for the failure turn
- Read screenshots around the failure point with the Read tool

### Form one hypothesis

Find the exact turn where things went wrong. What single heuristic would have prevented it?

Examples:
- "After clicking the dropdown, wait 1s — options animate in before they're clickable"
- "Navigate directly to `/pay-invoice/` — skip the landing page entirely"
- "Use `browse fill #field_3 value` not `browse type` — this field clears on focus"
- "The page shows a spinner at turn 8 — add `browse wait 2000` before snapshot"

### Update strategy.md

Edit `tasks/<task-name>/strategy.md`. Keep everything that worked. Fix the specific failure. Add a concrete heuristic.

Good strategies have:
- **Fast path**: direct URL or shortcuts to skip exploration
- **Step-by-step workflow**: exact sequence with timing notes
- **Site-specific knowledge**: selector IDs, form field names, success indicators
- **Failure recovery**: what to do when X goes wrong

### Commit
```bash
git add tasks/<task-name>/strategy.md
git commit -m "skill: <brief description of what was learned>"
```

### Judge the result

Read the new summary. Did it pass? Make clear progress?
- **Pass or progress** → keep, next iteration
- **No progress or regression** → `git reset --hard HEAD~1`, try a different hypothesis

### After all iterations — publish if ready

If the task passed on 2+ of the last 3 iterations **or has reached the max iteration limit**, write a proper `skill.md` — **do not just copy strategy.md**. The skill.md must be self-contained and useful to someone who has never seen this codebase. If graduating at max iterations without a clean pass, note the known failure point but still document everything learned.

Use this structure:

```markdown
---
task: <task-name>
graduated: <YYYY-MM-DD>
iterations: <N>
pass_rate: <X/N runs passed>
env: remote|local
---

# <Task Title> — Browser Skill

## Purpose
<1-2 sentences: what this automates and why it exists. E.g. "Extracts permit appeal process info from SF.gov Board of Appeals page, including eligibility, deadlines, fees, and contact details.">

## When to Use
<When should someone reach for this skill. E.g. "Use when you need to populate permit appeal data for SF city government workflows.">

## Quick Start
```bash
tsx scripts/evaluate.ts --task <task-name> --env remote
```

## Browse CLI Reference
The inner agent uses the `browse` CLI. Key commands for this task:
- `browse stop` — kill existing session (always run before switching to remote)
- `browse env remote` — start a fresh Browserbase cloud session
- `browse newpage <url>` — open URL in a new tab (required in remote mode — `browse open` fails with "no page available")
- `browse open <url>` — navigate existing tab (local mode only)
- `browse wait load` — wait for page to finish loading
- `browse get title` — verify you're on the right page
- `browse get text body` — extract all visible text (preferred for content extraction)
- `browse snapshot` — get accessibility tree with @ref IDs (use before clicking)
- `browse click <ref>` — click element by @ref from snapshot

**Never use `--session <name>` flags in skill.md.** Named sessions are a parallel-run workaround — they contaminate skills with infrastructure concerns. Skills must work in isolation with the default session.

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

Then commit:
```bash
git add tasks/<task-name>/skill.md
git commit -m "skill: graduate <task-name>"
```

---

## Final report (multi-task mode)

After all sub-agents complete, print a markdown table:

| Task | Iterations | Final Status | Graduated | Cost |
|------|-----------|--------------|-----------|------|
| google-flights | 5 | ✅ pass | yes | $0.42 |
| slusa-payment | 5 | ❌ fail | no | $1.20 |

Then write a persistent session report to `reports/` so there's a durable record of the run:

```bash
mkdir -p reports
```

Write the file `reports/YYYY-MM-DD-HH-MM-<tasks>.md` with:

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

Commit the report:
```bash
git add reports/
git commit -m "report: autobrowse session <date> — <N> tasks, <X> graduated"
```

---

## Rules

- **Only edit `strategy.md`** — never touch `task.md` or `evaluate.ts`
- **One hypothesis per commit** — test one change at a time
- **Build on wins** — keep what worked, add to it
- **Trust the trace** — the inner agent shows exactly what it saw and did
