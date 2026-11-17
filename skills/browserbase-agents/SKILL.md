---
name: browserbase-agents
description: Create, run, and integrate Browserbase Agents — autonomous cloud browser agents driven by one API call. Covers the Agents API (create reusable agents with system prompts and result schemas, trigger runs with variables, poll to completion, retrieve structured results and downloads) plus field-tested best practices for prompts, schemas, and anti-bot settings. Use when the user wants to create a Browserbase agent, call the Agents API, run an autonomous browser agent, or automate a web task ("search X and return JSON", "check availability on Y") without writing Playwright or Stagehand code.
license: MIT
compatibility: "Requires Python 3.8+ (stdlib only) and BROWSERBASE_API_KEY."
allowed-tools: Bash, Read, Write
---

# Browserbase Agents

Browserbase Agents are the highest abstraction of the Browserbase platform: describe a web task in natural language, and Browserbase runs an autonomous agent (browser + web search + files + shell, Stagehand-driven) that completes it and returns structured JSON. No Playwright scripts, no model orchestration, no infrastructure.

**Mental model:** an *Agent* is a reusable configuration (`name` + `systemPrompt` + `resultSchema`); a *run* is one asynchronous execution of a `task` against it, on a dedicated browser session. Create the agent once, then fan runs out across queries, dates, or hundreds of portals by changing only `variables`.

## Prerequisites

- A Browserbase API key (dashboard → Settings), exported as `BROWSERBASE_API_KEY`.
- No SDK required — the API is plain REST; the bundled script is stdlib-only Python.

## Core workflow

### 1. Design the agent

Write the `systemPrompt` in four blocks — role/scope, inputs (every `%variable%` documented), numbered procedure, guardrails — and pair it with a strict `resultSchema`. **Read `references/prompt_patterns.md` before writing either**; it contains the patterns that separate reliable agents from flaky ones (echo-back `appliedFilters`, outcome enums, null-over-invented-data, read-only guardrails, SSR-blob extraction, variable-drift mitigations).

A ready-to-adapt example payload lives at `assets/example_agent.json`.

### 2. Create the agent

```bash
python3 scripts/bb_agents.py create --file my_agent.json
# → returns agentId
```

Equivalent raw call: `POST https://api.browserbase.com/v1/agents` with header `x-bb-api-key` and body `{name, systemPrompt, resultSchema}`. Only `name` is required.

### 3. Trigger a run

```bash
python3 scripts/bb_agents.py run --agent-id <agentId> \
  --task "Search for %query% and return structured JSON." \
  --var query="wireless earbuds" --var max_pages=1 \
  --proxies --wait
```

- `--var key=value` becomes the `variables` object; reference values as `%key%` in prompts. Use variables for anything per-run or sensitive (queries, dates, credentials) — values are not persisted.
- `--proxies` / `--verified` set `browserSettings` for anti-bot-protected sites.
- `--context-id` reuses a Browserbase context (cookies/auth) across runs.
- Omitting `--agent-id` creates a new agent and its first run in one call.
- `--wait` polls to completion inline; otherwise poll separately.

### 4. Poll to completion

Runs are asynchronous: `PENDING → RUNNING → COMPLETED | FAILED | TIMED_OUT | STOPPED`.

```bash
python3 scripts/bb_agents.py poll <runId>          # blocks until terminal, prints run
python3 scripts/bb_agents.py messages <runId>      # step-by-step transcript while running
```

The structured output is at `result.output` in the run object and conforms to the `resultSchema`. The run's `sessionId` is a normal Browserbase session — use it for Live View, Session Replay, and logs in the dashboard, and for retrieving downloaded files:

```bash
python3 scripts/bb_agents.py downloads <sessionId>
```

### 5. Verify and iterate

- Compare echoed fields (`appliedFilters`, `date`) against the variables sent — this catches the two most common first-run failures: filters not applied and date drift.
- Thin results on protected sites (PerimeterX, DataDome, Akamai)? Re-run with `--proxies --verified`.
- Use the dashboard **Optimize** tool on any run to get a proposed `systemPrompt` diff, then `scripts/bb_agents.py update <agentId> --file changes.json`.
- Track `completionRate` / `failRate` / `timeoutRate` / `averageDuration` on the Agent page — optimize against numbers, not impressions.

## Bundled resources

| Resource | Use |
|---|---|
| `scripts/bb_agents.py` | Zero-dependency CLI for the full lifecycle: create, update, run (with variables/browserSettings), get, poll, messages, list-agents, list-runs, downloads, delete. Run with `--help` for all flags. |
| `references/api_reference.md` | Condensed endpoint reference: payloads, response shapes, run lifecycle, pagination, downloads, built-in tools, quality metrics. Load when constructing raw API calls. |
| `references/prompt_patterns.md` | System-prompt and schema design patterns with field-tested pitfalls (variable drift, silent filter failures, anti-bot settings). Load before designing any agent. |
| `assets/example_agent.json` | Complete working agent payload (e-commerce search with full filter surface) to copy and adapt. |

## Key facts worth remembering

- Agents choose their own path (may skip the browser entirely if search/fetch suffices); custom tools can't be added yet — extra capability goes in the `systemPrompt`.
- Integration is poll-based today (webhooks planned). Poll every ~5–10 s; typical runs take 2–10 minutes.
- Each run is a separate browser session, so parallel fan-out works up to the account concurrency limit.
- Per-run `resultSchema` overrides the agent's default; per-run `variables` keep secrets out of task text.
- Files: agents can download and produce files (retrieve via Downloads API with the `sessionId`), but files cannot be uploaded to an agent yet; >1 MB data should flow through downloads, not inline extraction.
