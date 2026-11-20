---
name: bitcoinsapi-com-get-bitcoin-fees-ahpurb
title: Get Bitcoin Fee Recommendations (Satoshi API)
description: >-
  Fetch current Bitcoin fee-rate recommendations (fastest, halfHour, hour,
  economy, minimum) in sat/vB from the Satoshi API's free
  /api/v1/fees/recommended endpoint. Read-only HTTP GET — no API key, wallet, or
  signup required.
website: bitcoinsapi.com
category: crypto-data
tags:
  - bitcoin
  - fees
  - mempool
  - satoshi-api
  - x402
  - api
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: api
alternative_methods:
  - method: api
    rationale: >-
      Paid /api/v1/fees/now ($0.001 USDC via x402 on Base) returns the same five
      fee rates plus a 'recommendation' verdict string and 'mempool_pressure'
      label. Use only when the verdict text is required and an x402 wallet is
      funded.
  - method: browser
    rationale: >-
      Not useful — the bitcoinsapi.com landing page is marketing only, fee data
      is exposed only via the JSON endpoint. Skip browser entirely.
verified: false
proxies: false
---
# Get Bitcoin Fee Recommendations from Satoshi API

## Purpose

Return current Bitcoin fee-rate recommendations (sat/vB) for five confirmation horizons — next block, half hour, hour, economy, and minimum — by calling the Satoshi API's free `/api/v1/fees/recommended` endpoint. Backed by a live Bitcoin Core node's `estimatesmartfee` output. Read-only HTTP GET; no API key, wallet, signup, or cookies required.

## When to Use

- An agent needs a fee-rate snapshot to decide what `feerate` to attach to an outgoing Bitcoin transaction.
- "Should I send Bitcoin now or wait?" / "How fast will this confirm at N sat/vB?" / "What's the current mempool fee floor?" questions.
- Periodic polling for fee-monitoring dashboards or send-or-wait alerts (rate limit is 30 req/min anonymous; register for a free key for 10K/day).
- As a substitute for `mempool.space` `/api/v1/fees/recommended` when you want a second source — Satoshi API uses Bitcoin Core's estimator rather than mempool-block-based heuristics, so values can differ during congestion.

## Workflow

The Satoshi API exposes a public, no-auth HTTP/JSON endpoint. **Use the API path directly** — there is no browser-driving step worth doing, and the response is canonical JSON behind Cloudflare with a 10-second `Cache-Control` window. The endpoint accepts no query parameters or headers (besides standard `Accept: application/json`).

1. **Send the request.**
   ```
   GET https://bitcoinsapi.com/api/v1/fees/recommended
   Accept: application/json
   ```
   No body, no auth, no cookies. Anonymous tier permits 30 req/min (see `X-RateLimit-Limit` / `X-RateLimit-Remaining` response headers). For higher limits register a free key via `POST /api/v1/register` and send `X-API-Key` on subsequent calls (10K req/day free tier).

2. **Parse the JSON envelope.** The response is wrapped in a top-level `{ "data": {...}, "meta": {...} }` shape:
   ```json
   {
     "data": {
       "recommendation": "Fees are very low. 1.0 sat/vB should confirm within a day.",
       "estimates": { "1": 1.087, "3": 1.087, "6": 1.0, "25": 1.0, "144": 1.0 },
       "savings_estimate": { "...": "..." }
     },
     "meta": {
       "timestamp": "2026-05-19T04:10:28.815158+00:00",
       "node_height": 950030,
       "chain": "main",
       "syncing": false,
       "cached": true,
       "cache_age_seconds": 0
     }
   }
   ```

3. **Map the `data.estimates` object** (keyed by Bitcoin Core confirmation target in blocks) onto the requested field names. The numeric values are fee rates in **sat/vB**:
   - `fastestFee`  ← `data.estimates["1"]`   (next block, ~10 min)
   - `halfHourFee` ← `data.estimates["3"]`   (~30 min, 3 blocks)
   - `hourFee`    ← `data.estimates["6"]`   (~1 hour, 6 blocks)
   - `economyFee` ← `data.estimates["25"]`  (~4 hours, 25 blocks)
   - `minimumFee` ← `data.estimates["144"]` (~1 day, 144 blocks)

4. **Fill the meta fields.**
   - `units`     ← `"sat/vB"` (constant; the API contract is satoshis per virtual byte and is not stated in the response body — the unit is implied by the `recommendation` text and Bitcoin Core's `estimatesmartfee` output convention).
   - `source`    ← `"bitcoin-core-estimates"` (this is the canonical source string the paid `/api/v1/fees/now` endpoint advertises for the same upstream; alternatively `"bitcoinsapi.com"` if you want a provider-level attribution).
   - `timestamp` ← `data.meta.timestamp` (ISO 8601 with microseconds and `+00:00` offset).

5. **(Optional) Sanity-check the node is healthy** before relying on the result: `meta.syncing` must be `false` and `meta.node_height` should be within ~6 blocks of the current chain tip (`https://bitcoinsapi.com/api/v1/status` returns full node state if you want a second check).

6. **(Optional, paid) Upgrade to `/api/v1/fees/now`** for richer send-or-wait context (verdict string, mempool-pressure label, plus the same five fee rates already named `fastest_fee_sat_vb` etc.). This endpoint returns HTTP **402 Payment Required** without payment — settle $0.001 USDC on Base via the x402 protocol and resend with a `PAYMENT-SIGNATURE` header (or just shell out to `npx agentcash@latest fetch "https://bitcoinsapi.com/api/v1/fees/now" --payment-network base --max-amount 0.001`). The free `/fees/recommended` endpoint is sufficient for the field set in this skill — only escalate to the paid path when the caller specifically needs the `recommendation` / `mempool_pressure` verdict strings or has an x402 wallet ready.

## Site-Specific Gotchas

- **Response shape is wrapped in `{data, meta}` — the five fee rates are NOT top-level fields.** Naïvely reading `response.fastestFee` returns `undefined`. The actual rates live under `data.estimates`, keyed by string-encoded block confirmation targets (`"1"`, `"3"`, `"6"`, `"25"`, `"144"`).
- **The confirmation-target keys are strings, not numbers.** `response.data.estimates[1]` works in JavaScript via implicit coercion but fails in strictly-typed languages. Use `response["data"]["estimates"]["1"]`.
- **`fastestFee` and `halfHourFee` are frequently equal** during low-mempool periods — Bitcoin Core's `estimatesmartfee` clamps multiple short horizons to the same floor (observed 1.087 sat/vB for both targets 1 and 3 during validation). This is expected behavior, not a bug; do not de-duplicate fields based on equal values.
- **Values are floats, not integers.** Free-tier output rounds to ~3 decimal places (e.g. `1.087`, not `1`). When constructing actual Bitcoin transactions, round **up** with `Math.ceil(rate * 100) / 100` or use the integer floor (`1`) — paying below the network minrelayfee of 1 sat/vB causes transaction rejection.
- **No `units` field in the response.** The API does not echo a units string; sat/vB is the implicit, hard-coded Bitcoin Core convention. Do not invent a `data.units` field — hard-code the string `"sat/vB"` in your output.
- **No `source` field on the free endpoint either.** Only the paid `/api/v1/fees/now` response carries `"source": "bitcoin-core-estimates"`. For the free endpoint, set `source` to `"bitcoin-core-estimates"` (upstream) or `"bitcoinsapi.com"` (provider) as a constant — the API itself does not declare it.
- **Cloudflare caches the response for 10 s** (`Cache-Control: public, max-age=10`, `meta.cached: true`). Polling faster than every 10 seconds returns the same payload. Use the `meta.timestamp` to detect refresh boundaries; do not rely on `Date` header for freshness.
- **Rate limit is 30 req/min on the anonymous tier.** Headers `X-RateLimit-Limit: 30` and `X-RateLimit-Remaining: N` indicate burst capacity; `X-RateLimit-Reset` is the Unix epoch when the window resets. Exceeding the limit returns HTTP 429. For sustained polling register a free API key (`POST /api/v1/register`) which grants 10K req/day.
- **`X-RateLimit-Daily-Limit: 0` on anonymous calls means "no separate daily cap"**, not "you're throttled". The per-minute cap is the only constraint without a key.
- **The site responds with an `X-Data-Disclaimer` header** ("For informational purposes only. Not financial advice.") — surfacing this in agent output is polite but not required.
- **`/api/v1/fees/now` returns 402, not 401 or 403, when unpaid.** Treating 402 as an auth error and switching to API-key headers does not help — this is a Coinbase x402 micropayment paywall ($0.001 USDC on Base, `eip155:8453`), not a key-auth gate. The response body includes the complete `PAYMENT-REQUIRED` envelope and an `agentcash_fetch_command` that performs the payment. The free `/fees/recommended` endpoint provides the same five fee rates; only escalate to `/fees/now` when the verdict / mempool-pressure verbiage is needed.
- **Don't waste time scraping `bitcoinsapi.com` HTML** — the landing page is a marketing site with no fee data in the DOM; everything useful is at the JSON endpoints. The `https://bitcoinsapi.com/api/v1/agent-context` and `https://bitcoinsapi.com/.well-known/satoshi-agent-context.json` URLs return well-structured discovery documents listing every endpoint and recipe.
- **The endpoint is served via Cloudflare with no anti-bot or stealth-detection layer.** A residential proxy, captcha solver, or `--verified` Browserbase session is unnecessary. Plain `fetch` / `curl` / `requests` works from any IP.
- **`meta.node_height` lags the chain by ~0–2 blocks.** During the validation run the node reported height `950030` and `syncing: false`; if `syncing: true` ever appears, the estimates may reflect a pre-sync state — fall back to another source.

## Expected Output

```json
{
  "fastestFee": 1.087,
  "halfHourFee": 1.087,
  "hourFee": 1.0,
  "economyFee": 1.0,
  "minimumFee": 1.0,
  "units": "sat/vB",
  "source": "bitcoin-core-estimates",
  "timestamp": "2026-05-19T04:10:28.815158+00:00"
}
```

JSON schema:

```json
{
  "type": "object",
  "required": ["fastestFee", "halfHourFee", "hourFee", "economyFee", "minimumFee", "units", "source", "timestamp"],
  "properties": {
    "fastestFee":  { "type": "number", "description": "Fee rate for next-block confirmation (~10 min), in sat/vB." },
    "halfHourFee": { "type": "number", "description": "Fee rate for ~30-min confirmation (3 blocks), in sat/vB." },
    "hourFee":     { "type": "number", "description": "Fee rate for ~1-hour confirmation (6 blocks), in sat/vB." },
    "economyFee":  { "type": "number", "description": "Fee rate for economy confirmation (~25 blocks, ~4 h), in sat/vB." },
    "minimumFee":  { "type": "number", "description": "Fee rate for minimum-priority confirmation (~144 blocks, ~1 day), in sat/vB." },
    "units":       { "type": "string", "enum": ["sat/vB"], "description": "Constant — Satoshi API does not echo a units field; sat/vB is the Bitcoin Core convention." },
    "source":      { "type": "string", "description": "Upstream estimator, e.g. \"bitcoin-core-estimates\" (preferred) or \"bitcoinsapi.com\" (provider)." },
    "timestamp":   { "type": "string", "format": "date-time", "description": "ISO 8601 UTC timestamp from response meta.timestamp; reflects cache-tick freshness, not wall-clock request time." }
  }
}
```

When the node reports `syncing: true` or `meta` is missing, return the same object with `timestamp` set to the HTTP `Date` response header as a fallback, and add an extra `"warning": "node syncing"` field so the caller can decide whether to retry against a secondary source.
