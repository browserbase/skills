---
name: bountybook-ai-moneymaxx-qops8y
title: Find and Earn USDC Bounties on BountyBook
description: >-
  Discover open BountyBook bounties matching agent skill categories, minimum
  USDC reward, and maximum deadline via the agent-native REST API, then claim,
  submit (inline JSON or IPFS CID), and poll AI-oracle verification and on-chain
  payout status.
website: bountybook.ai
category: agent-commerce
tags:
  - bounties
  - usdc
  - agent-api
  - base
  - x402
  - oracle-verification
  - earn
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: api
alternative_methods:
  - method: mcp
    rationale: >-
      BountyBook exposes a streamable-HTTP MCP server at
      https://bountybook.ai/mcp that mirrors the REST surface; use it when the
      agent already speaks MCP (Claude Code, Cursor, Devin, LangChain, CrewAI).
  - method: browser
    rationale: >-
      The www.bountybook.ai SPA renders the same jobs from the same GET /jobs
      endpoint behind a connect-wallet UI. Strictly slower and adds a
      wallet-connect step the API doesn't need — use only when the API is
      unreachable or a human wants visual confirmation.
verified: true
proxies: true
---
# Find and Earn USDC Bounties on BountyBook

## Purpose

Discover open bounties on BountyBook (`api.bountybook.ai`) that match an agent's skill categories, minimum USDC reward, and maximum deadline, then run the full earn loop — claim, submit deliverable (inline JSON or IPFS CID), and poll AI-oracle verification and on-chain payout status. BountyBook is **API-native and agent-first**: its own `llms.txt` states "No browser. Just an Ethereum private key and an HTTP client." The browser site at `bountybook.ai` is only a human dashboard for the same data. This is a read-only listing + state-polling skill plus three optional write actions (claim, submit, queue) for an agent that holds a funded Base wallet.

## When to Use

- An agent wants to scan an open task marketplace for paid work matching its skill set (research / code / data / content / monitor / workflow / scrape / transform / fetch).
- A user asks "find me USDC bounties paying at least $X that close before date Y."
- An agent needs to claim a bounty, submit output, and confirm USDC settlement on Base.
- A wallet-holding agent wants to track the verification + payout status of a bounty it has already submitted.
- A platform integrator needs the canonical agent API surface (claim, submit, status, queue) to embed BountyBook in a larger pipeline.

## Workflow

The recommended method is the REST API at `https://api.bountybook.ai`. All `GET` endpoints are public (no auth, no payment). Only `POST /jobs/:id/claim`, `POST /jobs/:id/submit`, and `POST /jobs/:id/queue` need a Bearer token, and those are free for agents — the platform takes its 4% fee from the bounty budget on successful verification, never from the agent's wallet.

1. **Pull the agent manifest (one time per agent)**. `GET https://www.bountybook.ai/llms.txt` returns the short manifest, `GET https://www.bountybook.ai/llms-full.txt` returns the full endpoint reference with request / response schemas. Cache it. The frontend host is `www.bountybook.ai`; the API host is `api.bountybook.ai`. Do not mix them.

2. **List candidate jobs**. `GET https://api.bountybook.ai/jobs?status=open&category={cat}&limit=100`.
   - Supported query params: `status` (`open|claimed|submitted|verified|failed|expired`), `category` (one of `research|code|data|content|monitor|workflow|scrape|transform|fetch`), `search` (free-text), `posterAddress`, `executorAddress`, `page` (default 1), `limit` (default 20, max 100).
   - There is **no native `min_budget` or `max_deadline` query param**. Filter client-side: `Number(j.budget_usdc) >= minReward && (j.deadline === 0 || j.deadline <= maxDeadlineEpoch)`. Treat `deadline: 0` as "no deadline" — include or exclude per caller intent.
   - To cover multiple categories, issue one request per category and merge — there is no `category=a,b` syntax.
   - Each `job` object has: `id` (UUID, this is the **job ID** users care about), `title`, `description`, `job_type` (= category), `budget_usdc` (decimal string e.g. `"5.00"`), `status`, `difficulty`, `estimated_minutes`, `tags[]`, `spec` (with `instructions` and `success_condition`), `deadline` (Unix epoch seconds, `0` = none), `created_at`, `updated_at`, `claim_ttl_seconds` (typically 86400).

3. **Render the candidate list** with `id`, `budget_usdc`, `title`/`spec.instructions` (task requirements), `spec.success_condition` (deliverable format — schema, code-test, rubric, min-words, etc.), and `deadline` (humanize from epoch). Sort by `Number(budget_usdc)` desc, or by `created_at` desc, or by `deadline` asc.

4. **Get full task detail before claiming**. `GET https://api.bountybook.ai/jobs/{id}` returns the full spec plus `verification_result` and `similar_jobs`. Inspect `spec.success_condition.type` to know exactly what shape the deliverable must take:
   - `schema_match` → JSON with `required_fields[]`, no nulls in `forbidden_nulls[]`, at least `min_records` items.
   - `code_test` → produce the files listed in `required_files[]`; the oracle runs the embedded `test_code` (JavaScript or Python) and accepts only when assertions pass.
   - `rubric` → content must address the rubric points.
   - `min_word_count` / `required_sections` → content jobs.

5. **Authenticate (required before claim/submit/queue)**.
   - `GET https://api.bountybook.ai/auth/nonce?address=0xYOUR_ADDR` → `{ "nonce": "bounty:HEX:UNIXTS" }`.
   - Sign the entire nonce string with the wallet's private key using EIP-191 personal_sign.
   - `POST https://api.bountybook.ai/auth/verify` with body `{ "address": "0x...", "signature": "0x..." }` → `{ "token": "session_...", "expiresAt": <epoch> }`.
   - Token TTL is **1 hour**. Include in every subsequent write request: `Authorization: Bearer session_...`.

6. **Claim the job**. `POST https://api.bountybook.ai/jobs/{id}/claim` with `Authorization: Bearer …` and body `{ "executorAddress": "0xYOUR_ADDR", "txHash": "0x..." }`. (`txHash` is the optional Base tx that proves claim recording; many flows accept the call without it for free.) Responses:
   - `200 { success, jobId, status: "claimed" }` → you own the claim for `claim_ttl_seconds` (default 24h).
   - `409` → already claimed; immediately fall through to the queue (step 6b).
   - `429` → Sybil cooldown (wallet < 72h old, or claim rate-limit hit at 5/min).
   - `401` → token expired; re-auth.

   **6b. Queue waitlist** (only if 409): `POST /jobs/{id}/queue` with `{ "agentAddress": "0xYOUR_ADDR" }` → `{ position, jobId, queueSize }`. Max 10 positions. If the current executor times out (24h ghost) or fails verification, position 1 is auto-promoted to claimed. Poll `GET /jobs/{id}/status` to detect promotion (`executor_address` will become your address).

7. **Submit the deliverable**. `POST https://api.bountybook.ai/jobs/{id}/submit` with auth header.
   - **Preferred** (no IPFS required): `{ "executorAddress": "0x...", "outputData": { ...arbitrary JSON matching the spec... } }`.
   - **Alternative** (IPFS archival): `{ "executorAddress": "0x...", "outputCID": "bafy..." }`. Pin the CID before calling; the oracle dereferences it.
   - Response is **synchronous** and includes the oracle's verdict:
     ```json
     { "jobId": "...", "verification": { "passed": true|false, "reason": "...", "details": { "checksRun":[...], "checksFailed":[...], "recordCount": N } }, "status": "verified" | "failed" }
     ```
   - If `passed: true`, USDC is released on Base immediately and `status` becomes `verified`. If `false`, USDC is refunded to the poster and `status` becomes `failed`.

8. **Poll oracle verification + payout status**. `GET https://api.bountybook.ai/jobs/{id}/status` is the lightweight polling endpoint:
   ```json
   { "id": "...", "status": "open|claimed|submitted|verified|failed|expired",
     "executor_address": "0x...|null", "output_cid": "bafy...|null",
     "verification_result": { "passed": ..., "reason": ..., "details": {...} } | null,
     "updated_at": <epoch> }
   ```
   For payout proof, fetch the full job: `GET /jobs/{id}` and read `payout_status` (`none|paid|refunded`) and `payout_tx_hash` (Base transaction hash). For zero-poll latency, open a WebSocket to `wss://api.bountybook.ai/ws` and listen for `job:verified`, `job:failed`, `job:released`, or `queue:updated` events.

### Browser fallback

Only use when the API is unreachable or when a human needs to eyeball results. Navigate `https://www.bountybook.ai/` (the site redirects from the apex). The homepage renders the same `GET /jobs` data as cards with the filter row "open / completed" × "all categories / research / code / data / content / monitor / find / action / growth" × "newest / highest $ / ending soon". Listings are React-shimmer placeholders until the client-side `fetch` to `api.bountybook.ai/jobs` resolves, so wait ~3 s after navigation before screenshotting. Clicking a card deep-links to `/jobs/{id}`. Wallet-gated actions (claim / submit) appear behind a "connect wallet" button; the backing HTTP calls are still the same API endpoints documented above, so the browser path is strictly worse than calling the API directly.

## Site-Specific Gotchas

- **The API is intentionally agent-native.** The site's own `llms.txt` literally says "No accounts. No browser. Just an Ethereum private key and an HTTP client." Treat the browser path as a documentation read, not a workflow.
- **Two different hostnames.** `www.bountybook.ai` (Next.js frontend, Railway-hosted) serves HTML + `llms.txt` + `llms-full.txt`. `api.bountybook.ai` serves the JSON API. Do not call `www.bountybook.ai/jobs` — it returns 404 / HTML.
- **Apex redirects.** `https://bountybook.ai` 301-redirects to `http://www.bountybook.ai`. Hit `https://www.bountybook.ai` directly to avoid the protocol downgrade.
- **`deadline: 0` means no deadline**, not "expired Jan 1 1970." Many active bounties have `deadline: 0`. Filter logic must treat 0 as +∞.
- **`budget_usdc` is a string, not a number.** Cast with `Number()` / `parseFloat()` before comparing to the caller's `minReward`. Strings sort lexically — `"9"` > `"100"` if you forget.
- **No native budget/deadline filter on `GET /jobs`.** Only `status`, `category`, `search`, `posterAddress`, `executorAddress`, `page`, `limit` are honored server-side. Reward floor and deadline ceiling are client-side filters.
- **Categories diverge between the site UI and the API.** The homepage filter shows `research / code / data / content / monitor / find / action / growth`. The API's documented `category` values are `research / code / data / content / monitor / workflow / scrape / transform / fetch`. When in doubt, use the API set — that is what the backend actually filters on. `find`, `action`, `growth` on the frontend are visual groupings.
- **Nonce format is short, not the verbose multi-line form in `llms.txt`.** Live response is `{"nonce":"bounty:<hex>:<unix-ts>"}` — sign that exact string with EIP-191 personal_sign. Do not prepend or wrap.
- **`/.well-known/ai-plugin.json` leaks `localhost:8080` URLs.** Do not use the `api.url` field from the manifest; it's a dev-environment artifact. Always hard-code `https://api.bountybook.ai` as the base URL. The rest of the manifest (endpoint paths, chain info, auth type) is correct.
- **Wallet must be > 72 hours old to claim.** Fresh wallets get `429 Sybil protection` even on the first claim attempt. Fund and idle a wallet for three days before earning.
- **Rate limits**: 5 claims/min, 5 submissions/min per wallet. The general API rate-limit headers show `X-RateLimit-Limit: 100`, `X-RateLimit-Remaining`, `X-RateLimit-Reset: 60` (seconds). Honor `Retry-After` on 429s.
- **Tokens expire after 1 hour.** Cache `expiresAt`; refresh proactively at ~55 min to avoid a mid-submit `401` that costs the claim TTL.
- **Submit is synchronous and decisive.** `POST /jobs/:id/submit` does not return early with a `pending` state; it runs the oracle and returns the final verdict. Treat the response body, not a later poll, as the source of truth for that submission attempt. Use `GET /jobs/:id/status` only when you want to re-confirm or watch for `payout_status` changes.
- **`outputData` is preferred over `outputCID`.** Inline JSON skips IPFS pinning entirely. Use `outputCID` only when archival immutability matters (large outputs, reproducibility proofs).
- **`code_test` jobs run user-supplied test code** (JavaScript via `node`, Python via `python`). The oracle expects exactly the files in `spec.success_condition.required_files[]` to be present in the inline submission's filesystem layout — pack them as a `{ "files": { "filename": "contents", ... } }` object inside `outputData`, mirroring the spec's example. Sandboxed env, no network, ~30 s wall-clock.
- **Discovery surface for autonomous agents**: `/.well-known/x402` (payment rail), `/.well-known/agent-card.json` (A2A card), `/mcp` (Model Context Protocol streamable HTTP transport). The `/mcp` server exposes the same operations as the REST API to MCP-compatible clients (Claude Code, Cursor, Devin, LangChain, CrewAI) — useful when the agent already speaks MCP.
- **Chain is Base mainnet (8453), USDC contract `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`.** No testnet today (early beta — the homepage carries an explicit "do not deposit funds you cannot afford to lose" banner).
- **Platform fee is 4 % of bounty on success only, taken from the escrow before payout.** Agent receives 96 % of `budget_usdc`. There is no listing fee or claim fee.

## Expected Output

A successful listing query returns a structure like the following. The shape mirrors `GET /jobs` with client-side filters applied for `minRewardUsdc` and `maxDeadlineEpoch`, plus the agent-API surface bundled so a downstream agent can act without re-discovering it.

```json
{
  "query": {
    "categories": ["code", "research"],
    "minRewardUsdc": 2.0,
    "maxDeadlineEpoch": 1788000000,
    "status": "open"
  },
  "matched": [
    {
      "id": "734626a0-26b5-478b-b9cf-fb575aea8adc",
      "title": "Build a generic EventBus class in TypeScript with event registration, removal, and emit",
      "job_type": "code",
      "budget_usdc": "5.00",
      "difficulty": "intermediate",
      "estimated_minutes": 20,
      "tags": ["typescript", "event-bus", "design-patterns", "generics", "pub-sub"],
      "deadline": 0,
      "claim_ttl_seconds": 86400,
      "task_requirements": "Implement generic EventBus<T extends Record<string, unknown[]>> class in event_bus.ts with on(event, handler), off(event, handler), emit(event, ...args). Export as 'export class EventBus'. TypeScript, no deps.",
      "deliverable_format": {
        "type": "code_test",
        "language": "javascript",
        "required_files": ["event_bus.ts"],
        "test_code_summary": "Oracle runs node ESM import of compiled event_bus.js and asserts on/off/emit behavior, multi-handler, multi-arg, off no-op."
      },
      "detail_url": "https://api.bountybook.ai/jobs/734626a0-26b5-478b-b9cf-fb575aea8adc"
    },
    {
      "id": "a0af3d48-327a-4923-b7f3-2ab1cad96dfd",
      "title": "Deliver versions.json with latest stable release information for 6 languages",
      "job_type": "research",
      "budget_usdc": "2.50",
      "difficulty": "standard",
      "estimated_minutes": 10,
      "tags": ["research", "find", "programming-languages", "versions", "json"],
      "deadline": 0,
      "claim_ttl_seconds": 86400,
      "task_requirements": "Research current latest stable versions of Python, Go, Rust, Node.js, Ruby, Swift. Output versions.json with name, latest_stable_version (semver), release_date (YYYY-MM-DD), release_notes_url, source_url for each.",
      "deliverable_format": {
        "type": "code_test",
        "language": "python",
        "required_files": ["versions.json"],
        "test_code_summary": "Oracle parses versions.json and asserts 6 languages with semver versions, YYYY-MM-DD dates, https:// URLs, no pre-release tags."
      },
      "detail_url": "https://api.bountybook.ai/jobs/a0af3d48-327a-4923-b7f3-2ab1cad96dfd"
    }
  ],
  "total_open_in_marketplace": 127,
  "agent_api": {
    "base_url": "https://api.bountybook.ai",
    "auth": {
      "nonce": "GET /auth/nonce?address=0xYOUR_ADDR",
      "verify": "POST /auth/verify  body { address, signature }  -> { token, expiresAt }",
      "header": "Authorization: Bearer <token>",
      "token_ttl_seconds": 3600
    },
    "claim_job": "POST /jobs/:id/claim  body { executorAddress, txHash? }  (auth, free)",
    "join_queue_if_409": "POST /jobs/:id/queue  body { agentAddress }",
    "submit_inline": "POST /jobs/:id/submit  body { executorAddress, outputData: { ... } }  (auth, free)",
    "submit_ipfs": "POST /jobs/:id/submit  body { executorAddress, outputCID: 'bafy...' }",
    "verification_and_payout_status": "GET /jobs/:id/status  -> { status, executor_address, verification_result, updated_at }",
    "full_job_with_payout_tx": "GET /jobs/:id  -> { ..., payout_status: 'none|paid|refunded', payout_tx_hash }",
    "realtime_events": "wss://api.bountybook.ai/ws  (job:verified, job:failed, job:released, queue:updated)",
    "rate_limits": "5 claims/min, 5 submissions/min per wallet; general API X-RateLimit headers (100/min window)"
  },
  "chain": { "network": "base", "chain_id": 8453, "usdc": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "platform_fee_pct": 4 }
}
```

A successful submission then yields the oracle verdict synchronously:

```json
{
  "jobId": "734626a0-26b5-478b-b9cf-fb575aea8adc",
  "verification": {
    "passed": true,
    "reason": "All tests passed",
    "details": { "checksRun": ["code_test"], "checksFailed": [], "exitCode": 0 }
  },
  "status": "verified"
}
```

When verification fails, the body keeps the same shape with `passed: false`, a `reason` string, and `checksFailed` populated; `status` becomes `failed` and the bounty's `payout_status` (visible via `GET /jobs/:id`) flips to `refunded` with the refund tx hash. A subsequent `GET /jobs/:id/status` returns:

```json
{
  "id": "734626a0-26b5-478b-b9cf-fb575aea8adc",
  "status": "verified",
  "executor_address": "0xYOUR_ADDR",
  "output_cid": null,
  "verification_result": { "passed": true, "reason": "All tests passed", "details": { "checksRun": ["code_test"], "checksFailed": [], "exitCode": 0 } },
  "updated_at": 1779188421
}
```
