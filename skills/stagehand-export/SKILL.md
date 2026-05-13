---
name: stagehand-export
description: Translate a graduated /autobrowse task into a deterministic Stagehand TypeScript script. Mines the last passing trace.json for working XPath/CSS selectors, bakes them in as cached Action descriptors, falls back to observe() for ARIA-ref clicks, and auto-generates a Zod schema for extract() from task.md's Output block. Use after /autobrowse has converged to ship a no-LLM-loop runnable script (tsx, Browserbase Functions, cron). Trigger keywords: stagehand-export, export to stagehand, autobrowse to stagehand, convert browse skill to typescript.
allowed-tools: Bash Read Write Edit Glob Grep
metadata:
  author: browserbase
  homepage: https://github.com/browserbase/skills
---

# stagehand-export — autobrowse → Stagehand bridge

`/autobrowse` produces a `strategy.md` and trace history that a Claude session can replay step-by-step using the `browse` CLI. Every replay still pays an LLM bill. `stagehand-export` collapses that loop into a deterministic Stagehand TypeScript script that uses the **exact selectors that worked** in the last passing run, replaying them via Stagehand's cached-`Action` path (no LLM call per step).

## When to use

- A `/autobrowse` task has graduated (`**Status:** completed` + `success: true` JSON on a recent run).
- You want to schedule the task, deploy it as a Browserbase Function, or invoke it from non-Claude code.
- You want to ship the automation without paying per-step inference costs.

Do **not** use this before `/autobrowse` converges — the export needs a passing trace to mine.

## Inputs

A workspace produced by `/autobrowse`:

```
<workspace>/                  # default: ./autobrowse
├── tasks/<task>/
│   ├── task.md
│   └── strategy.md
└── traces/<task>/
    ├── run-001/, run-002/, …
    └── latest/               # symlink to newest run
```

## How it works

1. **Pick the run to mine.** If `--run` is passed, use it. Otherwise walk runs newest-first and pick the most recent whose `summary.md` shows `**Status:** completed` and whose final JSON has `success: true`.
2. **Parse `task.md` → Zod schema.** The fenced JSON block under `## Output` is walked into a Zod schema. Strings, numbers, booleans, arrays, and nullable fields are inferred; mixed types fall back to `z.unknown()`.
3. **Walk `trace.json`, classify each successful `browse` command** (see `references/command-mapping.md`). Each command becomes one of:
   - **Cached `Action`** — for `click`/`fill`/`select` with a stable XPath or CSS selector. Emitted as `await stagehand.act({ selector, method, arguments, description })`. Description is sourced from the assistant's reasoning on that turn.
   - **`observe()` fallback** — for ARIA-ref clicks (`0-970`, `[0-58]`). Refs are session-scoped and can't be replayed; the script emits `const actions = await stagehand.observe('<intent>'); await stagehand.act(actions[0]);`.
   - **Playwright primitive** — `page.goto`, `page.waitForLoadState`, `page.waitForTimeout`, `page.keyboard.press`/`type`, etc.
   - **Dropped** — `browse snapshot`, `browse env`, `browse stop`, `browse get text body` (replaced by `Stagehand` init/close + `extract()`).
4. **Emit `extract()`** at the end with the inferred Zod schema. Stagehand pulls the final result JSON.
5. **Write outputs** into `<workspace>/tasks/<task>/stagehand/`:
   - `<task>.ts` — the script
   - `selectors.cache.json` — the cached Action descriptors as a human-readable index
   - `package.json`, `tsconfig.json` — minimal scaffold
6. **Verify** — `npm install --silent` + `npx tsx <task>.ts`. Parse the script's stdout JSON; pass = `success: true`. Report and stop (no autoloop back into autobrowse).

## How to run

```bash
# Default — verify after generating
node ${CLAUDE_SKILL_DIR}/scripts/export.mjs --task <task-name>

# Custom workspace
node ${CLAUDE_SKILL_DIR}/scripts/export.mjs --task <task-name> --workspace ./autobrowse

# Force a specific run
node ${CLAUDE_SKILL_DIR}/scripts/export.mjs --task <task-name> --run run-022

# Skip the verification run (write files only)
node ${CLAUDE_SKILL_DIR}/scripts/export.mjs --task <task-name> --no-verify
```

The script prints a JSON report to stdout and diagnostics to stderr. Exit codes: `0` = generated and verified, `2` = verification failed (or `--no-verify` and just generated), `1` = generator/install error.

## Output report

```json
{
  "task": "sf-311-request",
  "run": "run-022",
  "script": "./autobrowse/tasks/sf-311-request/stagehand/sf-311-request.ts",
  "cache": "./autobrowse/tasks/sf-311-request/stagehand/selectors.cache.json",
  "cached_actions": 7,
  "observe_fallbacks": 3,
  "schema_fields": 6,
  "verified": true,
  "passed": true,
  "exit_code": 0,
  "run_log": "./autobrowse/tasks/sf-311-request/stagehand/run.log",
  "output": { "success": true, "confirmation_number": "101003821426", ... }
}
```

## Rules

- **Read-only on the autobrowse workspace** — never edit `task.md`, `strategy.md`, or trace files. Only write inside `tasks/<task>/stagehand/`.
- **Re-runnable.** Running `stagehand-export` twice overwrites `<task>.ts` and `selectors.cache.json` but leaves `package.json`/`tsconfig.json`/`node_modules` alone.
- **Fail loud on no passing runs.** Don't silently export from a failed run — the whole point is to bake in *what worked*.
- **Don't reinvent caching.** The generated script uses Stagehand's built-in `cacheDir`. `selectors.cache.json` is a side-car index for humans, not a parallel cache layer.
- **Auth is out of scope for v1.** If `task.md` mentions credentials/cookies/login, the generated script emits a `// TODO: wire up authed context` comment near the Stagehand constructor.

## Reference

- `references/command-mapping.md` — the full `browse` → Stagehand translation table the generator uses.
- `scripts/export.mjs` — the generator. Self-contained Node script, no dependencies beyond stdlib.
