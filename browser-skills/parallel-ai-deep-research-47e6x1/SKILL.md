---
name: parallel-ai-deep-research-47e6x1
title: Parallel CLI Deep Research
description: >-
  Install and use the Parallel CLI (parallel-cli) to run open-ended,
  citation-backed Deep Research via the pro/ultra Task API processors, then
  retrieve analyst-grade reports with sources and confidence levels.
website: parallel.ai
category: research
tags:
  - research
  - cli
  - deep-research
  - parallel
  - task-api
  - web-research
source: 'browserbase: agent-runtime 2026-06-04'
updated: '2026-06-04'
recommended_method: cli
alternative_methods:
  - method: api
    rationale: >-
      The CLI is a thin client over Parallel's Task API; you can POST a task run
      with an output schema directly using pro/ultra processors if you don't
      want the CLI's bundled auth/balance/polling.
  - method: mcp
    rationale: >-
      The Parallel Task MCP server exposes deep research as a tool call for
      MCP-capable agents (Claude, Cursor) without shelling out to the CLI.
verified: false
proxies: true
---
# Parallel CLI Deep Research

## Purpose

Install and drive the **Parallel CLI** (`parallel-cli`) to run *Deep Research* — open-ended, analyst-grade web research where quality and depth matter more than latency. You give the CLI a natural-language research question; Parallel's Task API conducts multi-step web exploration across authoritative sources and returns a synthesized report **with inline citations, reasoning, and per-field confidence levels** (the "research basis"). This skill covers the full lifecycle: install → authenticate → fund → run research → retrieve results. Deep Research is a paid, asynchronous operation (a single run can take from ~2 minutes up to ~50 minutes depending on processor), so it is **not** read-only — every run consumes account balance.

## When to Use

- You need a comprehensive, citation-backed intelligence report on an open-ended question (market/competitor analysis, due diligence, literature surveys, technical landscape reviews).
- The task is exploratory research from a *question or topic*, not enrichment of an existing structured dataset (for enrichment, use `parallel-cli enrich` instead).
- You want depth and source verification over speed, and are willing to wait minutes and pay per run.
- You're building a standalone agent/script that needs programmatic, `--json`-shaped deep-research output, or you want `/parallel:parallel-deep-research` slash-commands inside Claude Code / Cursor via Agent Skills.

## Workflow

This is a **CLI-first** skill — the CLI is the optimal interface and there is no browser flow to script. `parallel-cli` is fully non-interactive: every command accepts `--json` and can be driven entirely by flags, making it ideal for agents.

### 1. Install `parallel-cli`

Pick the method that matches the host. Require version **`>= 0.4.0`**; for Deep Research the `research` subcommands need a recent build.

```bash
# macOS (Homebrew)
brew install parallel-web/tap/parallel-cli

# Any OS, isolated tool env (recommended for agents) — pure Python, no glibc issues
pipx install "parallel-web-tools[cli]" && pipx ensurepath

# Any OS, Astral uv (faster pipx alternative) — pure Python
uv tool install "parallel-web-tools[cli]"

# Node toolchains — installs a prebuilt standalone binary
npm install -g parallel-web-cli

# Standalone binary, no Python/Node required (detects platform, installs to ~/.local/bin)
curl -fsSL https://parallel.ai/install.sh | bash
```

Verify it is on PATH: `command -v parallel-cli`. To upgrade, match the install method (`parallel-cli update` for the standalone binary, `pipx upgrade parallel-web-tools`, `uv tool upgrade parallel-web-tools`, `npm update -g parallel-web-cli`, `brew upgrade parallel-cli`).

> The `npm` package and `curl | bash` installer ship a **prebuilt standalone binary** (PyInstaller bundle). On older Linux it can fail at runtime with a glibc error (see Gotchas). On such hosts use a pure-Python install (`pipx`/`uv`/`pip`) instead.

### 2. Authenticate

```bash
parallel-cli auth --json            # check current status first
```

If not authenticated (or `selected_org_id` is `"legacy"`), log in. Two paths:

```bash
parallel-cli login                  # interactive OAuth, opens a browser
parallel-cli login --device         # device-code flow for SSH / containers / CI / headless
# headless + JSON streaming for agent harnesses:
parallel-cli login --json --no-browser
```

The device/`--json` flow emits NDJSON events: `auth_start` → `device_code` (carries `user_code` + `verification_uri_complete`) → `auth_waiting` → `auth_success`. It **blocks at `auth_waiting`** until a human visits the URL and enters the code; `auth_success` is only emitted after authorization. In an agent harness, stream stdout rather than blocking on completion. Alternatively, skip OAuth entirely with an API key from <https://platform.parallel.ai>:

```bash
export PARALLEL_API_KEY="your_api_key"
```

### 3. Ensure the org has balance

Deep Research is billed per run, so confirm funds before launching:

```bash
parallel-cli balance get
parallel-cli balance add <AMOUNT_IN_CENTS>   # only works if a payment method exists
```

A payment method must already be attached to the organization; add one at <https://platform.parallel.ai/settings> if `balance add` fails.

### 4. Run the deep research

```bash
# Synchronous: blocks until the report is ready, prints JSON
parallel-cli research run "What are the latest developments in solid-state EV batteries?" --processor pro --json

# Higher depth (multi-source deep research)
parallel-cli research run "Competitive landscape of AI observability startups in 2026" --processor ultra --json

# Read the question from a file; save both .json and .md report files
parallel-cli research run -f question.txt -o report
```

**Choose the processor for depth.** Deep Research is optimized for the `pro` and `ultra` families. `pro` (the default) is exploratory web research; `ultra`/`ultra2x`/`ultra4x` are progressively deeper multi-source research. Append `-fast` (e.g. `pro-fast`, `ultra-fast`) for 2–5× faster turnaround at the same price when you need interactive latency. Use `lite`/`base`/`core` only for shallow lookups — they are not "deep research."

### 5. Async launch + poll (for long ultra runs)

`ultra` runs can take up to ~50 minutes, longer than many shells/harnesses will block. Launch detached and poll:

```bash
parallel-cli research run "question" --no-wait --json   # returns a run_id (trun_xxx)
parallel-cli research status trun_xxx --json            # non-blocking status check
parallel-cli research poll  trun_xxx --json             # block until complete, then return result
```

Tune the blocking ceiling with `--timeout <seconds>` (default 3600). Discover valid tiers with `parallel-cli research processors --json`.

### 6. (Optional) Wire up Agent Skills

To expose deep research as slash-commands inside an agent (Claude Code, Cursor, etc.):

```bash
parallel-cli skills install     # installs skills into ~/.agents/skills
```

Then invoke `/parallel:parallel-deep-research <topic>` (also `/parallel:parallel-web-search`, `/parallel:parallel-web-extract`, `/parallel:parallel-data-enrichment`). Restart the agent if it doesn't hot-reload skills.

### Alternative access (non-CLI)

The CLI is a thin client over Parallel's **Task API** (Deep Research uses the same `pro`/`ultra` processors). If you'd rather call it directly, `POST` to the Task API with an output schema, or use the **Task MCP** server for tool-calling agents. The CLI is the recommended path for standalone agents because it bundles auth, balance, polling, and report file output.

## Site-Specific Gotchas

- **Standalone binary needs glibc ≥ 2.35.** The `npm` (`parallel-web-cli`) and `curl | bash` installers drop a PyInstaller bundle whose bundled `libpython3.12.so` requires `GLIBC_2.35`. On older Linux (e.g. Vercel Sandbox / RHEL/CentOS-derived images) it fails at load with `version 'GLIBC_2.35' not found (required by .../libpython3.12.so.1.0)` and the binary will not run. **Fix:** install via `pipx`/`uv`/`pip` (pure Python, uses the system interpreter) on such hosts. Confirmed during this skill's verification.
- **Deep Research costs real money, per run.** Approx. per-run cost (Task pricing is $/1000 runs): `core` ≈ $0.025, `core2x` ≈ $0.05, `pro` ≈ $0.10, `ultra` ≈ $0.30, `ultra2x` ≈ $0.60, `ultra4x` ≈ $1.20. `-fast` variants cost the same as their standard counterpart. Check `parallel-cli balance get` before bulk runs.
- **It's asynchronous and slow by design.** `pro`: ~2–10 min; `ultra`: ~5–25 min; `ultra2x`: ~5–50 min. For anything `ultra` or batched, use `--no-wait` + `research poll` rather than a single blocking `research run`, and raise `--timeout` (default 3600s) or you'll hit timeout exit code 5.
- **Processor matters more than the prompt for "depth."** `lite`/`base`/`core` are enrichment/lookup tiers — they will return shallow answers even on a deep question. Deep Research quality lives in `pro` and `ultra`. Default is `pro`.
- **Exit codes are scriptable:** `0` success, `2` bad input, `3` auth error, `4` API error, `5` timeout. Branch on these in automation rather than parsing stderr.
- **`selected_org_id: "legacy"` counts as not-ready.** Even if `auth --json` reports `authenticated: true`, a `legacy` org id means you should re-run `login` to select a real org before spending.
- **`-o/--output` writes two files**, `<name>.json` and `<name>.md` — the structured result and a human-readable markdown report. `--json` alone prints to stdout without saving.
- **Stdin works:** `echo "Research question" | parallel-cli research run - --json` (the `-` reads the question from stdin), handy for piping.
- **YAML configs / interactive planner need the `[cli]` extra** (`pipx install "parallel-web-tools[cli]"`). The bare `parallel-web-tools` package omits them.
- **Headless auth blocks on a human.** `login --device` / `--no-browser` cannot complete fully autonomously — a person must visit `verification_uri_complete` and approve. For unattended pipelines, provision a `PARALLEL_API_KEY` env var instead of OAuth.
- This run could not execute a live `research run` end-to-end inside the sandbox: PyPI/Astral were network-blocked (so pure-Python install was unavailable) and the npm binary hit the glibc wall above; OAuth/balance also require a human + funded org. All commands, flags, processors, pricing, and output shapes are taken from Parallel's first-party docs (`parallel.ai/agents.md`, `docs.parallel.ai/integrations/cli`, `.../task-api/...`) fetched during this run.

## Expected Output

### `research run ... --json` (completed, text report)

```json
{
  "run": {
    "run_id": "trun_a1b2c3d4e5f6",
    "status": "completed",
    "processor": "pro",
    "is_active": false,
    "created_at": "2026-06-04T03:12:00Z",
    "modified_at": "2026-06-04T03:18:42Z"
  },
  "output": {
    "type": "text",
    "content": "## Solid-state EV batteries: 2026 state of play\n\nToyota and QuantumScape ... [markdown report with inline citations] ...",
    "basis": [
      {
        "field": "content",
        "citations": [
          { "url": "https://example.com/report", "title": "...", "excerpts": ["..."] }
        ],
        "reasoning": "Synthesized from N authoritative sources cross-referenced for consistency.",
        "confidence": "high"
      }
    ]
  }
}
```

`output.type` is `text` for free-form Deep Research reports, or `json` when a structured output schema is supplied. The `basis` array carries one `FieldBasis` per output field with `citations` (source URLs + supporting excerpts), `reasoning`, and a `confidence` level (`low` | `medium` | `high`).

### `research run --no-wait --json` (async launch)

```json
{ "run": { "run_id": "trun_a1b2c3d4e5f6", "status": "queued", "is_active": true } }
```

Poll with `research status trun_xxx --json` → `{ "run": { "run_id": "trun_...", "status": "running" } }` (status transitions `queued` → `running` → `completed` | `failed`), then `research poll trun_xxx --json` for the full result object above.

### `auth --json`

```json
{
  "authenticated": true,
  "method": "oauth",
  "env_var_set": false,
  "has_stored_credentials": true,
  "selected_org_id": "org_xxx",
  "selected_org_name": "Acme Inc",
  "version": 1
}
```

### `research processors --json`

```json
{
  "processors": [
    { "name": "lite",  "tier": "research", "cost_per_1000": 5 },
    { "name": "base",  "tier": "research", "cost_per_1000": 10 },
    { "name": "core",  "tier": "research", "cost_per_1000": 25 },
    { "name": "pro",   "tier": "research", "cost_per_1000": 100 },
    { "name": "ultra", "tier": "research", "cost_per_1000": 300 }
  ]
}
```

### Failure / timeout

A non-zero exit code signals the failure class without parsing output: `3` = auth error (run `login`), `4` = API error (check balance/rate limits), `5` = timeout (raise `--timeout` or switch to `--no-wait` + `poll`). A failed run object reports `"status": "failed"` with an error message in `run`.
