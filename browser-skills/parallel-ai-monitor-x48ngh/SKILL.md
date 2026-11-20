---
name: parallel-ai-monitor-x48ngh
title: Create a Parallel Monitor (Web Change Tracking)
description: >-
  Use the Parallel CLI to create and manage Monitors that continuously watch the
  web for new, material changes and notify you via webhook, polling, or Slack.
website: parallel.ai
category: web-monitoring
tags:
  - monitoring
  - parallel-cli
  - web-changes
  - webhooks
  - alerts
  - automation
source: 'browserbase: agent-runtime 2026-06-03'
updated: '2026-06-03'
recommended_method: cli
alternative_methods:
  - method: api
    rationale: >-
      The CLI wraps POST /v1/monitors; call the REST API or Python/TS SDK
      directly for production services or when the CLI binary can't be installed
      (e.g. glibc < 2.35).
  - method: hybrid
    rationale: >-
      Create monitors via Slack slash commands (/monitor, /hourly) for
      human-in-the-loop notification delivery into Slack channels.
verified: false
proxies: false
---
# Create a Parallel Monitor (Web Change Tracking via the Parallel CLI)

## Purpose

This skill creates and manages **Parallel Monitors** — agents that continuously
watch the web for *new, material changes* matching a query and notify you when
something changes (via webhook, polling, or Slack). It uses the official
`parallel-cli`, which is a thin wrapper over Parallel's Monitor API
(`POST /v1/monitors`). The recommended path is the CLI for one-off/agent use;
the underlying REST API and Python/TypeScript SDKs are equivalent alternatives
for production services.

There are two monitor types:

- **`event_stream`** — tracks a natural-language search query and emits one event
  per new material change found on the open web (the default, what `monitor create
  "<query>"` produces).
- **`snapshot`** — re-runs an existing Task Run on a schedule and diffs its output
  field-by-field, emitting an event when the output materially changes.

Creating a monitor is a **write** operation that incurs usage cost against your
Parallel balance. The monitor runs once immediately at creation, then on the
configured cadence. Listing/getting/reading events is read-only.

## When to Use

- Watch for funding/M&A/earnings announcements, executive changes, hiring signals,
  or competitive product launches as they happen.
- Track ecommerce price/stock changes, real-estate listing changes, or regulatory
  filing/rule changes on a schedule.
- Monitor a structured Task output (e.g. "current C-suite of Acme Corp") for
  field-level changes over time (`snapshot` type).
- Push detected changes to a webhook, a Slack channel, or pull them by polling.
- **Do NOT use for historical/retrospective research** — Monitor only surfaces
  changes from creation time forward. Use Parallel Deep Research / Task API for
  "what happened in the last 2 years" questions.

## Workflow

The recommended method is the **Parallel CLI** (`parallel-cli`). It requires a
Parallel account, an API key or OAuth login, and a non-zero balance.

1. **Install `parallel-cli` (require `>= 0.4.0`).** Pick the method that matches
   your platform; prefer `pipx`/`uv`/Homebrew over `curl | bash`:
   ```bash
   # macOS
   brew install parallel-web/tap/parallel-cli
   # Linux/macOS/Windows (isolated, on PATH)
   pipx install "parallel-web-tools[cli]" && pipx ensurepath
   # or, with Astral uv
   uv tool install "parallel-web-tools[cli]"
   # or npm (ships a standalone binary — see glibc gotcha below)
   npm install -g parallel-web-cli
   ```
   Verify: `command -v parallel-cli && parallel-cli --version`.

2. **Authenticate.** Two paths:
   ```bash
   parallel-cli auth --json            # check current status first
   # Interactive device OAuth (a human authorizes the code in a browser):
   parallel-cli login --json           # add --no-browser in headless sessions
   # OR non-interactive (CI / agents / headless) — no human needed:
   export PARALLEL_API_KEY="your_api_key"   # get the key from platform.parallel.ai
   ```
   If `auth --json` shows `"authenticated": false` or `"selected_org_id": "legacy"`,
   you must (re-)login or set `PARALLEL_API_KEY`. The env-var key path is the only
   one that works fully headless.

3. **Confirm balance** (monitor creation costs money and is blocked at $0):
   ```bash
   parallel-cli balance get
   parallel-cli balance add <AMOUNT_IN_CENTS>   # if zero; needs a payment method
   ```

4. **Create an `event_stream` monitor.** The positional argument is an
   *intent-heavy natural-language* query (not a boolean keyword string):
   ```bash
   parallel-cli monitor create "AI startup funding announcements" \
     --cadence daily \
     --processor lite \
     --webhook https://example.com/webhook \
     --json
   ```
   - `--cadence`: `hourly` | `daily` (default) | `weekly` | `every_two_weeks`
     (these map to API `frequency` values `1h` / `1d` / `1w`).
   - `--processor`: `lite` (default, routine) or `base` (higher recall/breadth,
     higher cost).
   - `--webhook`: URL to receive `monitor.event.detected` notifications.
   - `--output-schema`: JSON string to constrain structured event output.
   - Capture the returned `monitor_id` (e.g. `monitor_b0079f70…`) — you need it
     for every subsequent command.

5. **Manage the monitor:**
   ```bash
   parallel-cli monitor list --json
   parallel-cli monitor get  <monitor_id> --json
   parallel-cli monitor update <monitor_id> --cadence weekly --json
   parallel-cli monitor trigger <monitor_id> --json   # force an immediate run
   parallel-cli monitor cancel  <monitor_id>          # irreversible; stops future runs
   ```

6. **Receive / retrieve notifications.** Three options:
   - **Webhook (recommended)** — push delivery, lowest latency, subscribe to
     `monitor.event.detected`, `monitor.execution.completed`,
     `monitor.execution.failed`. The payload carries `data.event.event_group_id`
     and `data.monitor_id`.
   - **Poll events** — `parallel-cli monitor events <monitor_id> --json` (newest
     first). Each event includes `output.content` and a `basis` array of
     citations + reasoning + confidence.
   - **Slack** — install the Parallel Slack app from platform.parallel.ai →
     Integrations, then `/monitor <query>` (daily), `/hourly <query>`, or reply
     `/cancelmonitor` in the thread.

### Snapshot monitors (track a Task output for changes)

A `snapshot` monitor needs a completed Task Run as its baseline. This path is
primarily driven via the API/SDK (the CLI focuses on `event_stream` queries):

```bash
# 1. Create + complete a Task Run (note its run_id), then:
curl -X POST https://api.parallel.ai/v1/monitors \
  -H 'Content-Type: application/json' -H "x-api-key: $PARALLEL_API_KEY" \
  -d '{ "type":"snapshot", "frequency":"1w", "processor":"lite",
        "settings": { "task_run_id": "taskrun_a1b2c3d4e5f6" },
        "webhook": { "url":"https://example.com/webhook",
                     "event_types":["monitor.event.detected"] } }'
```

### Direct API fallback (no CLI)

The CLI wraps `POST https://api.parallel.ai/v1/monitors`. If the CLI can't be
installed (see glibc gotcha), call the REST API directly or use the SDKs
(`pip install parallel-web` / `npm install parallel-web`). `advanced_settings`
inside `settings` accepts `source_policy` (include/exclude domains) and
`location` (ISO 3166-1 alpha-2 country code).

## Site-Specific Gotchas

- **npm binary needs glibc 2.35 — fails on older Linux.** The `parallel-web-cli`
  npm package ships a bundled PyInstaller binary; on hosts with glibc < 2.35 it
  dies immediately with `Failed to load Python shared library … version
  'GLIBC_2.35' not found`. Confirmed on a glibc-2.34 box during testing. On such
  systems use `pipx`/`uv`/`pip` against a system Python ≥ 3.10, or Homebrew on
  macOS — those run as pure Python and avoid the bundled-libc mismatch. (The
  standalone `curl https://parallel.ai/install.sh | bash` binary is the same
  PyInstaller build and hits the same wall.)
- **Login is interactive by design.** `parallel-cli login` triggers a device
  OAuth flow that blocks at `{"event":"auth_waiting"}` until a *human* visits the
  verification URL and approves the user code. There is no way to complete it
  fully headless — for CI/agents, set `PARALLEL_API_KEY` instead.
- **`selected_org_id: "legacy"`** in `parallel-cli auth --json` means you have not
  selected an org; monitor calls may fail until you re-`login` and pick one.
- **Monitors track forward only.** They watch for *new* changes from creation
  onward. They will not return historical data — use Deep Research for that. The
  monitor does run once at creation, so the first event reflects the current
  state, not a backlog.
- **Write effective queries.** Intent-heavy natural language beats boolean
  keyword strings: prefer `"Parallel Web Systems (parallel.ai) funding or launch
  announcements"` over `"Parallel OR Parallel AI AND Funding OR Launch"`; prefer
  `"AI startup funding announcements"` over `"Find all AI funding news from the
  last 2 years"`.
- **Creation costs money / requires balance.** `parallel-cli balance get` must be
  non-zero; if no payment method is attached, add one at
  https://platform.parallel.ai/settings. A zero balance blocks `monitor create`.
- **Subcommand naming drift.** The installed CLI (GitHub README, the source of
  truth) exposes `monitor create | list | get | update | cancel | events |
  trigger`. Some docs pages also reference `delete` and `simulate` — prefer the
  README spelling: use `cancel` (not `delete`) to stop a monitor and `trigger`
  (not `simulate`) to force an immediate run. `cancel` is irreversible.
- **Events pagination.** `monitor events` returns up to ~300 most-recent
  executions; use the returned `next_cursor` to page, and pass
  `include_completions=true` to also see no-change (`completion`) runs.
- **One outcome per run.** A run either emits detected events OR a single
  `completion` event (no new changes) OR an `error` event — never a mix.
- **Could not be executed end-to-end in this sandbox.** This skill was authored
  from Parallel's official docs + the `parallel-web-tools` README + a real install
  attempt. The CLI could not actually run here (glibc-2.34 wall on the only
  installable artifact; locked-down egress blocked PyPI/Astral/Homebrew; and
  device-OAuth login has no human to approve it, with no `PARALLEL_API_KEY`
  provisioned). Commands and JSON shapes below are verified against authoritative
  sources but were not live-fired. Re-validate `monitor create` on a host with
  glibc ≥ 2.35 (or via pip on Python ≥ 3.10) and a funded, authenticated account.

## Expected Output

`parallel-cli monitor create … --json` returns the created monitor:

```json
{
  "monitor_id": "monitor_b0079f70195e4258a3b982c1b6d8bd3a",
  "type": "event_stream",
  "status": "active",
  "frequency": "1d",
  "processor": "lite",
  "settings": { "query": "AI startup funding announcements" },
  "webhook": {
    "url": "https://example.com/webhook",
    "event_types": ["monitor.event.detected"]
  },
  "metadata": { "external_id": "acme-monitor-001" },
  "created_at": "2025-04-23T20:21:48.037943Z"
}
```

Webhook notification when a change is detected (`monitor.event.detected`):

```json
{
  "type": "monitor.event.detected",
  "timestamp": "2025-12-10T19:00:36.199543+00:00",
  "data": {
    "monitor_id": "monitor_b0079f70195e4258a3b982c1b6d8bd3a",
    "event": { "event_group_id": "mevtgrp_35ab7d16b00f412b9d6b6c0eff1f4973" },
    "metadata": { "external_id": "acme-monitor-001" }
  }
}
```

`parallel-cli monitor events <monitor_id> --json` → `event_stream` event:

```json
{
  "events": [
    {
      "event_id": "mevt_323b37562d1bec451c5bab674ee5afaf",
      "event_group_id": "mevtgrp_35ab7d16b00f412b9d6b6c0eff1f4973",
      "event_date": "2025-01-15",
      "event_type": "event_stream",
      "output": {
        "type": "text",
        "content": "Acme AI raised a $50M Series B led by Example Ventures.",
        "basis": [
          {
            "field": "output",
            "citations": [{ "url": "https://techcrunch.com/2025/01/15/acme-ai-series-b" }],
            "reasoning": "TechCrunch article confirms the round size and lead investor.",
            "confidence": "high"
          }
        ]
      }
    }
  ]
}
```

`snapshot` event (diff of a tracked Task output):

```json
{
  "event_id": "mevt_9f...",
  "event_group_id": "mevtgrp_...",
  "event_date": "2025-02-01",
  "event_type": "snapshot",
  "changed_output": { "executives": [ { "name": "Jane Roe", "title": "CFO" } ] },
  "previous_output": { "executives": [ { "name": "John Doe", "title": "CFO" } ] }
}
```

No-change run (`completion`) and failed run (`error`) are the other two terminal
event types; a single run maps to exactly one of `event_stream`/`snapshot`,
`completion`, or `error`.
