# Browserbase APIs used by Optimize Agent Prompt

## Authentication

Send `X-BB-API-Key: $BROWSERBASE_API_KEY` to `https://api.browserbase.com/v1`. Never write the key into experiment artifacts.

## Agent lifecycle

### Create the reusable Agent

`POST /agents`

```json
{
  "name": "POC prompt experiment",
  "systemPrompt": "...",
  "resultSchema": {}
}
```

Save `agentId` in the ignored experiment state. Create once per experiment.

### Update only the prompt and stable schema

`PATCH /agents/{agentId}`

```json
{
  "systemPrompt": "...",
  "resultSchema": {}
}
```

Persist the exact prompt in each run directory because retrieving the Agent later returns only its newest prompt.

## Run lifecycle

### Start a run

`POST /agents/runs`

```json
{
  "agentId": "...",
  "task": "...",
  "resultSchema": {},
  "variables": {
    "query": { "value": "example", "description": "Search term" }
  },
  "browserSettings": {
    "proxies": true,
    "verified": true
  }
}
```

The run begins as `PENDING`, then becomes `RUNNING`, and terminates as `COMPLETED`, `FAILED`, `STOPPED`, or `TIMED_OUT`.

### Poll status and result

`GET /agents/runs/{runId}`

The requested JSON Schema payload is normally at `result.output`; runner metadata can coexist at `result.summary`, `result.stepsTaken`, and `result.taskDuration`. Normalize with:

```js
const output = run.result?.output ?? run.result ?? null;
```

### Stop a spiral

`POST /agents/runs/{runId}/stop`

Stop when the message or time budget is exceeded. Continue polling until a terminal status so final artifacts are complete.

## Agent trajectory

`GET /agents/runs/{runId}/messages`

Query parameters:

- `since`: last received message ID;
- `limit`: 1–100;
- `all=true`: return all messages after `since`.

Responses are chronological:

```json
{
  "data": [{ "id": "...", "createdAt": "...", "message": {} }],
  "nextSince": "..."
}
```

Pass `nextSince` as the next `since` cursor while polling. Expect AI SDK `UIMessage` parts such as `tool-call`, `tool-result`, `reasoning`, and text/final output. Readable reasoning text is not guaranteed; tool actions and results are the primary evidence surface.

## Browser/session evidence

`GET /sessions/{sessionId}/logs`

Returns CDP command/event records with `method`, `request`, `response`, timestamps, frame IDs, and loader IDs. Use these logs to validate browser-level causes. Do not treat an empty array as failure when the Agent chose non-browser search/fetch tools.

## Operational rules

- Keep task, schema, variables, browser settings, and evaluator fixed when comparing prompts.
- Use one Agent per experiment and one run per prompt version.
- Save raw API responses before summarizing.
- Do not log secrets or variable values that should remain ephemeral.
- Avoid concurrent prompt updates to the same Agent; the prompt applied to a run must be attributable.
