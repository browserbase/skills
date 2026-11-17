# Browserbase Agents API Reference

Base URL: `https://api.browserbase.com/v1`
Auth header on every request: `x-bb-api-key: $BROWSERBASE_API_KEY`
Full docs: https://docs.browserbase.com/platform/agents/overview

## Endpoints at a glance

| Method & path | Purpose |
|---|---|
| `POST /agents` | Create a reusable agent |
| `GET /agents` | List agents (cursor pagination) |
| `GET /agents/{agentId}` | Get one agent |
| `POST /agents/{agentId}` | Update an agent (partial body; omitted fields unchanged) |
| `DELETE /agents/{agentId}` | Delete an agent (past runs unaffected) |
| `POST /agents/runs` | Start a run (with or without `agentId`) |
| `GET /agents/runs` | List runs; filter by `agentId`, `status`, `startAt`/`endAt` |
| `GET /agents/runs/{runId}` | Get a run's status + result |
| `GET /agents/runs/{runId}/messages` | Step-by-step transcript (AI SDK UIMessage format) |
| `GET /downloads?sessionId={id}` | List files the agent downloaded during the run |

## Create an Agent — `POST /agents`

Only `name` is required. An agent with no `systemPrompt` behaves like an unconfigured run.

```json
{
  "name": "Amazon Product Search",              // required, 1-255 chars
  "systemPrompt": "You are ... use %query% ...", // steers every run
  "resultSchema": { "type": "object", "...": "..." } // JSON Schema for run output
}
```

Response (201) is the Agent object:

```json
{
  "agentId": "uuid", "name": "...", "systemPrompt": "...",
  "resultSchema": {}, "createdAt": "...", "updatedAt": "..."
}
```

## Run an Agent — `POST /agents/runs`

```json
{
  "agentId": "uuid",                  // optional; omit for ad-hoc run
  "task": "Search for %query% ...",   // required, natural language
  "resultSchema": {},                 // optional per-run schema override
  "variables": {                      // optional %placeholder% values
    "query": { "value": "wireless earbuds", "description": "what to search" }
  },
  "browserSettings": {                // optional session controls
    "proxies": true,                  // route through Browserbase proxies
    "verified": true,                 // enable Browserbase Verified
    "context": { "id": "ctx_...", "persist": true }  // reuse auth/cookies
  }
}
```

Notes:
- A call with **no `agentId`** creates a new agent and its first run in one call — the response includes both `agentId` and `runId`.
- Variable values are strings. They are NOT persisted. Reference them as `%name%` in the task or system prompt.
- Contexts carry cookies/auth between runs; `persist: true` saves state back after the run.

## Run lifecycle

```
PENDING → RUNNING → COMPLETED | FAILED | TIMED_OUT | STOPPED
```

`PENDING`/`RUNNING` are active; the rest are terminal and never change again.
Integration is **poll-based** (webhooks planned): poll `GET /agents/runs/{runId}` every few seconds.

## Get a run — response shape

```json
{
  "runId": "...", "agentId": "...", "status": "COMPLETED",
  "task": "...", "sessionId": "...",
  "result": { "output": { /* conforms to resultSchema */ } },
  "createdAt": "...", "startedAt": "...", "endedAt": "..."
}
```

- The structured payload lives at `result.output` when a `resultSchema` was set.
- `sessionId` is a normal Browserbase session ID: use it for Live View, Session Replay in the dashboard, logs, and the Downloads API.

## Run messages — `GET /agents/runs/{runId}/messages`

Chronological transcript in [AI SDK UIMessage format](https://ai-sdk.dev/docs/reference/ai-sdk-core/ui-message): each message has `role` and `parts` (text, tool calls, reasoning, files). Pass the response's `nextSince` back as `?since=` to fetch only newer messages — poll this while a run is active to stream progress.

## Pagination

List endpoints return `nextCursor`; pass it back as `?cursor=` for the next page.
`GET /agents/runs` filters: `agentId`, `status`, `limit`, `startAt`, `endAt`.

## Files / downloads

Agents have a sandboxed file workspace (read/write, process PDFs, produce CSVs). Files the agent downloads are stored against the run's session:

```bash
curl "https://api.browserbase.com/v1/downloads?sessionId=$SESSION_ID" \
  --header "x-bb-api-key: $BROWSERBASE_API_KEY"
```

Limits: no file *upload* to an agent yet; large (>1 MB) or paginated tabular data should flow through downloads, not inline extraction.

## Built-in tools (not configurable yet)

1. **Browser control** — Stagehand-driven; adapts to layout changes, no selectors.
2. **Web search** — Search/Fetch APIs to find the right starting URL.
3. **File system** — sandboxed workspace, downloads land in the session.
4. **Shell** — sandboxed runtime commands when scripting beats browsing.

Custom tools cannot be added and built-ins cannot be disabled in the current version. The agent may skip the browser entirely if search/fetch answers the task.

## Quality metrics (dashboard Agent page)

| Field | Meaning |
|---|---|
| `completionRate` | Fraction of runs that completed |
| `failRate` | Fraction of runs that failed |
| `timeoutRate` | Fraction of runs that timed out |
| `averageDuration` | Average run duration (seconds) |

Rising `timeoutRate`/`failRate` → revisit the prompt or use the dashboard Optimize tool.
