---
name: poke-com-send-message
title: "Poke Send Message"
description: "Send structured context to Poke through the official inbound API so the user's Poke assistant can process it like an incoming message. Includes API-key handling, safe external-action gating, smoke-test verification, and Poke recipe packaging notes."
website: "poke.com"
category: "productivity"
tags: ["poke", "assistant", "api", "messaging", "automation", "external-actions"]
status: "launched"
partner: true
source: "first-party-browserbase"
updated: "2026-05-08"
recommended_method: "api"
alternative_methods:
  - method: "browser"
    rationale: "Use browser automation only for one-time setup tasks such as creating an API key in Kitchen. Sending runtime messages should use the official inbound API."
---

# Poke Send Message

## Purpose

Send a message or structured JSON payload to Poke via the official inbound API:

```text
POST https://poke.com/api/v1/inbound/api-message
```

The API is the preferred runtime surface for handing context from a Browserbase skill, CLI, browser extension, webhook, scheduled job, or agent workflow to Poke. The payload appears in the user's Poke conversation and is processed by their Poke assistant.

Official docs:

```text
https://poke.com/docs/api
https://poke.com/docs/creating-recipes
```

## When to Use

- Forward a browser or CLI finding to Poke for later follow-up.
- Trigger a Poke workflow from CI, monitoring, scheduled jobs, or user automation.
- Package a Poke recipe that receives structured context from Browserbase.
- Run a harmless demo or smoke test proving Poke delivery works.

Do not use this skill to silently trigger sensitive external actions. If the message asks Poke to email, text, buy, book, schedule, delete, publish, or change anything outside the current system, get explicit user approval first and include that approval in the payload.

## Inputs

Required:

| Name | Description |
|---|---|
| `POKE_API_KEY` | V2 Poke API key from Kitchen. Send it as `Authorization: Bearer <key>`. |
| `message` | Human-readable instruction or context for Poke. |

Optional structured fields:

| Name | Description |
|---|---|
| `source` | Identify the caller, e.g. `browserbase.browse.sh`. |
| `run_id` | Stable ID for dedupe/debugging. |
| `user_approved_external_action` | Boolean. Must be `true` only after explicit approval for external side effects. |
| `metadata` | JSON object with URLs, timestamps, entities, screenshots, extracted data, or trace IDs. |

The endpoint accepts any JSON object. Prefer a structured object with a top-level `message` string so the instruction is obvious to both humans and Poke.

## Workflow

### 1. Get the API key

Create a V2 API key in Poke Kitchen, then store it as an environment variable:

```bash
export POKE_API_KEY="..."
```

Do not commit the key, print it in logs, put it in recipe source, or pass it in a URL. Existing legacy `pk_` keys created in older app settings are for the deprecated webhook endpoint and should not be used with this skill.

### 2. Build a structured payload

Use an explicit, plain-language `message` plus any machine-readable context Poke may need:

```json
{
  "message": "Browserbase found three candidate invoices that need review. Please summarize them and ask before sending any email.",
  "source": "browserbase.browse.sh",
  "run_id": "bb-run-2026-05-08T12:34:56Z",
  "user_approved_external_action": false,
  "metadata": {
    "origin": "scheduled-browserbase-job",
    "records": [
      { "vendor": "Acme", "amount": "$42.00", "url": "https://example.com/invoices/123" }
    ]
  }
}
```

For demo or smoke-test runs, use a harmless no-op message:

```json
{
  "message": "Browserbase Poke skill smoke test. No action needed.",
  "source": "browserbase.browse.sh",
  "user_approved_external_action": false
}
```

### 3. Send the request

```bash
curl -sS 'https://poke.com/api/v1/inbound/api-message' \
  -H "Authorization: Bearer ${POKE_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Browserbase Poke skill smoke test. No action needed.",
    "source": "browserbase.browse.sh",
    "user_approved_external_action": false
  }'
```

Node example:

```js
const payload = {
  message: "Browserbase Poke skill smoke test. No action needed.",
  source: "browserbase.browse.sh",
  user_approved_external_action: false,
};

const response = await fetch("https://poke.com/api/v1/inbound/api-message", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.POKE_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(payload),
});

const result = await response.json();
if (!response.ok || result.success !== true) {
  throw new Error(`Poke delivery failed: ${response.status} ${JSON.stringify(result)}`);
}
```

### 4. Verify delivery

A successful API response is:

```json
{
  "success": true,
  "message": "Message sent successfully"
}
```

Treat delivery as successful only when all of these are true:

- HTTP status is 2xx.
- Response parses as JSON.
- `success === true`.

If any check fails, return a structured failure with the status code and response body. Never retry a side-effectful message blindly. For idempotent smoke tests, one retry is acceptable after a short delay.

### 5. Package as a Poke recipe

For Poke recipe packaging:

- Keep `POKE_API_KEY` in the recipe or deployment secret store, not in recipe code.
- Pass Browserbase outputs as structured JSON under `metadata`.
- Include a concise top-level `message` that tells Poke what to do with the context.
- Mark whether the user already approved any external action.
- If the recipe may send email, schedule meetings, purchase items, publish content, or modify external systems, design it to ask the user before doing the action unless the user already gave specific approval.
- Include a smoke-test command in the recipe README or setup notes using `Browserbase Poke skill smoke test. No action needed.`

## Safety Rules

- **External actions require approval.** Do not ask Poke to take externally visible actions unless the user explicitly requested that action.
- **Keep payloads minimal.** Send only the context Poke needs. Avoid secrets, auth tokens, raw cookies, payment details, private keys, and unnecessary PII.
- **Prefer structured context.** Put records, links, and tool outputs in `metadata`; keep `message` readable.
- **Make no-op demos obvious.** Demo payloads should include `No action needed.` so Poke does not infer work to perform.
- **Preserve auditability.** Include `source`, `run_id`, and relevant URLs when useful.

## Expected Output

On success:

```json
{
  "success": true,
  "delivered": true,
  "message": "Message sent successfully"
}
```

On failure:

```json
{
  "success": false,
  "delivered": false,
  "status": 401,
  "reason": "invalid_or_missing_api_key",
  "responseBody": { "success": false, "message": "..." }
}
```

Common failure branches:

| Condition | Handling |
|---|---|
| Missing `POKE_API_KEY` | Stop and ask the user to provide the key or configure the environment. |
| 401 / 403 | Treat as invalid, expired, or wrong-generation API key. Create a V2 key in Kitchen. |
| Non-JSON response | Return the raw text body for debugging. |
| 429 / 5xx | Retry only if the payload is idempotent or the caller provided a `run_id` and understands duplicate-delivery risk. |
