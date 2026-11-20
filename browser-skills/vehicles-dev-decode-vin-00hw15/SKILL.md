---
name: vehicles-dev-decode-vin-00hw15
title: Vehicles.dev VIN Decode
description: >-
  Decode a 17-character VIN into normalized vehicle identity (year, make, model,
  trim, body style, drivetrain, fuel, transmission, cylinders, doors, engine)
  via the authenticated server-to-server Vehicles.dev GET /v1/vehicles/vin/{vin}
  API.
website: vehicles.dev
category: automotive
tags:
  - automotive
  - vin
  - decode
  - api
  - vehicles
source: 'browserbase: agent-runtime 2026-08-23'
updated: '2026-08-23'
recommended_method: api
alternative_methods:
  - method: cli
    rationale: >-
      The official `vehicles decode <VIN>` CLI wraps the same billable GET after
      a one-time `vehicles login`; convenient for humans and scripts without
      hand-writing bearer headers.
  - method: mcp
    rationale: >-
      The vehicles-dev-mcp server exposes VIN decode as the `decode_vin` tool
      for AI agents; the key stays in the server env and the agent never sees
      it. Same per-call metering as direct API calls.
  - method: browser
    rationale: >-
      Not viable — the API is deliberately not browser-callable (no CORS,
      rejects Cookie/Origin headers). Confirmed live: a browser call returns 401
      cookie_credentials_rejected. The only browser-visible VIN data is one
      hard-coded docs example, not a general decoder.
verified: false
proxies: false
---
# Decode a VIN with the Vehicles.dev API

## Purpose

Resolve a 17-character VIN into canonical, normalized vehicle identity — `year`, `make`, `model`, `trim`, `body_style`, `drivetrain`, `fuel`, `transmission`, `cylinders`, `doors`, and a derived `engine` string — via the Vehicles.dev `GET /v1/vehicles/vin/{vin}` endpoint. Read-only: a decode never mutates account state, but each successful (2xx) lookup is a billable metered call (Starter $0.004, drawn from the plan's included calls first). The API is store-first: it returns a matching row from Vehicles.dev's scraped-listings dataset (`origin: "store"`) and falls back to a live NHTSA vPIC decode (`origin: "vpic"`) when the VIN is unknown.

## When to Use

- You have a VIN and need structured make/model/year/trim identity from a backend service.
- Enriching inventory, appraisal, insurance, or fleet records keyed by VIN.
- Any batch VIN-normalization job where you'd otherwise scrape or call NHTSA vPIC directly and want a single store-first + vPIC-fallback surface.
- **Not** for: full build sheets with factory option codes (this is a VIN-*pattern* decode, not a per-car build record), vehicle history, recalls, or valuation — those are separate Vehicles.dev endpoints.

## Workflow

**This API is deliberately server-to-server and is NOT browser-callable.** It serves no CORS headers, rejects any request carrying a `Cookie` or `Origin` header, and requires an `Authorization: Bearer` API key. There is no browser, cookie, or query-string auth path — a headless/automated browser cannot decode a VIN here (see the Browser note at the end). Call it from a backend with a key stored server-side.

Prerequisite: a Vehicles.dev API key (prefix `vdev_`), minted once in the dashboard and held in a server-side secret such as `VEHICLES_API_KEY`. The plaintext secret is shown exactly once at creation and is unrecoverable.

### Recommended: raw HTTP GET

1. **Normalize the VIN.** Must be exactly 17 VIN-safe characters (letters/digits, never `I`, `O`, or `Q`). The API upper-cases it server-side and echoes the upper-cased form in the `vin` field, so case doesn't matter on input. For North American VINs (first character `1`–`5`) the decoder also validates the check digit and rejects a bad one.

2. **Issue the request** to `https://api.vehicles.dev/v1/vehicles/vin/{vin}`:
   ```bash
   curl -sS https://api.vehicles.dev/v1/vehicles/vin/5TDDZRBHXNS221317 \
     -H "Authorization: Bearer $VEHICLES_API_KEY" \
     -H "Accept: application/json"
   ```
   The scheme token is case-sensitive `Bearer` followed by exactly one space — `bearer`, a double space, or any other scheme is rejected `401 invalid_credential`. Do **not** send a `Cookie` or `Origin` header. Timeout budget is 10 s.

3. **Read the response.** On `200`, parse the JSON body (see Expected Output). Branch behavior on `origin` (`"store"` vs `"vpic"`), not on field presence — **null values are omitted, not emitted as null**, so the key set inside `vehicle` varies per VIN. Treat every field as optional. Keep the `x-request-id` response header for support tickets.

4. **Handle errors** by branching on the stable `code` slug in the `application/problem+json` body, never on the prose `detail` (key order is not stable — parse the JSON). Key codes: `400 invalid_vin`, `404 vin_not_decodable`, `503 decode_upstream_unavailable` / `decode_upstream_error` (both `retryable: true` — safe to retry with backoff), `401 authentication_required` / `invalid_credential`, `402 insufficient_credits`, `403 plan_upgrade_required`.

### Alternative: official CLI

```bash
npm install -g vehicles-dev-cli
vehicles login                       # saves key to ~/.vehicles/credentials.json
vehicles decode 5TDDZRBHXNS221317    # same billable GET, prints the JSON body
```

### Alternative: MCP server (for AI agents)

Wire the `vehicles-dev-mcp` npm package into any MCP client (Claude Desktop/Code, Cursor). It exposes VIN decode as the `decode_vin` tool. The key lives in the server's own env (`VEHICLES_API_KEY`) or `~/.vehicles/credentials.json`; the agent never sees it, and each tool call is a direct metered request to `api.vehicles.dev`.
```bash
claude mcp add --transport stdio vehicles-dev -- npx -y vehicles-dev-mcp
```
Remote MCP is also configured at `https://mcp.vehicles.dev/mcp` (attachable via the Claude API with your `vdev_` key as `authorization_token`).

### Alternative: official SDKs

TypeScript (`@vehicles-dev/sdk`, `decodeVin(vin)`) and Python (`vehicles_dev`, `decode_vin(vin)`), both installed from immutable GitHub `v0.1.1` tags (not yet on npm/PyPI). They wrap the same GET and handle bearer headers, problem-document parsing, and timeouts.

### Browser (fallback) — not viable

There is no browser fallback for the decode itself. Confirmed live: opening `https://api.vehicles.dev/v1/vehicles/vin/{vin}` in a browser returns `401 cookie_credentials_rejected` ("Credential rejected.") because the browser attaches a `Cookie` header the API refuses; a fetch without cookies returns `401 authentication_required`. The only browser-adjacent VIN data on the site is the single worked example (`5TDDZRBHXNS221317` → 2022 Toyota Highlander Limited) hard-coded in the `/docs` Quickstart — not a general decoder. To decode any VIN you must call the authenticated API from a backend.

## Site-Specific Gotchas

- **Not browser-callable, by design.** No CORS headers; a `Cookie` header → `401 cookie_credentials_rejected`; an `Origin` header (or a Host that doesn't resolve to a product) → `401 invalid_origin` / `404 route_not_found`. Don't waste time trying to drive this endpoint from a headless browser, an XHR/fetch in page context, or a CORS proxy — all confirmed blocked. Call it server-side.
- **Auth runs before schema validation.** A request that is both unauthenticated and malformed returns `401`, never `400`. Fix the credential first, then the parameters.
- **Bearer scheme is strict.** Exactly `Bearer ` + one space + the `vdev_...` key. Lowercase `bearer`, extra spaces, query-string keys, basic auth, or cookies are all rejected `401`. Keys are product-scoped — a key minted for another product returns `401 invalid_credential`.
- **Null fields are omitted, not null.** The `vehicle` object only contains keys with values; `trim`, `doors`, `cylinders`, and `engine` are frequently absent (vPIC commonly returns no trim or door count, especially for EVs). Never assume a fixed schema — treat every field as optional and check presence.
- **`origin` tells you the data path, not completeness.** `"store"` = matched a row in the scraped-listings store (field completeness varies; some fields come from the listing source or prior enrichment, not vPIC). `"vpic"` = decoded live against NHTSA for this request. `"store"` does **not** guarantee every field was vPIC-enriched.
- **VIN character rules.** Exactly 17 chars; `I`, `O`, `Q` never allowed. North American VINs (first char `1`–`5`) must pass their check digit or you get `400 invalid_vin`. The API upper-cases input and echoes the upper-cased VIN back — input case is irrelevant.
- **Billing settles only on 2xx.** A failed decode costs nothing. Metered fees are prepaid from credits; when included calls are exhausted and credits can't cover a call you get `402 insufficient_credits` (no overage bill). VIN Decode is one of the eleven Starter-plan included endpoints (1,000 calls/mo).
- **`503`s are retryable, other 4xx are not.** `retryable: true` appears on every `503` (`decode_upstream_unavailable` when the 10 s budget elapses or the service is unreachable; `decode_upstream_error` typically when live NHTSA vPIC is down for a never-seen VIN) and on `429`. Retry those with backoff; do not retry `400`/`401`/`402`/`403`/`404`.
- **`engine` is a derived string** composed from vPIC displacement + configuration + cylinder count (e.g. `"3.5L V-Shaped 6cyl"`), and is frequently absent on `store`-origin rows.
- **No anti-bot on the marketing site.** `vehicles.dev` / `vehicles.dev/docs` returned HTTP 200 with no bot protection; the successful path used no `--verified` and no `--proxies`. Stealth/residential proxies are unnecessary — but they're also irrelevant, because the barrier is API-key auth, not IP or fingerprint blocking.

## Expected Output

Successful decode (`200 · application/json`):

```json
{
  "origin": "store",
  "source": "vehicles.dev",
  "vehicle": {
    "year": 2022,
    "make": "Toyota",
    "model": "Highlander",
    "trim": "Limited",
    "body_style": "SUV",
    "drivetrain": "AWD",
    "fuel": "Gasoline",
    "transmission": "Automatic",
    "cylinders": 6,
    "doors": 4
  },
  "vin": "5TDDZRBHXNS221317"
}
```

Sparse decode (live vPIC fallback, many optional fields omitted):

```json
{
  "origin": "vpic",
  "source": "vehicles.dev",
  "vehicle": {
    "year": 2023,
    "make": "Tesla",
    "model": "Model 3"
  },
  "vin": "5YJ3E1EA7PF000000"
}
```

VIN could not be resolved (`404 · application/problem+json`):

```json
{
  "code": "vin_not_decodable",
  "detail": "Neither our store nor NHTSA vPIC could resolve a make or model for that VIN.",
  "instance": "/v1/vehicles/vin/00000000000000000",
  "request_id": "1f9fcd64-c8b4-4d8f-98b1-3b7ed12cae38",
  "retryable": false,
  "status": 404,
  "title": "Not Found",
  "type": "https://api.data-platform.dev/problems/vin-not-decodable"
}
```

Bad VIN (`400 · application/problem+json`):

```json
{
  "code": "invalid_vin",
  "detail": "The VIN failed validation.",
  "instance": "/v1/vehicles/vin/1HGCM82633A00435",
  "request_id": "accbacf9-ddbf-483b-8ee8-612f42d4593c",
  "retryable": false,
  "status": 400,
  "title": "Bad Request",
  "type": "https://api.data-platform.dev/problems/invalid-vin"
}
```

Missing/invalid credential (`401 · application/problem+json`) — the shape you get from any unauthenticated call, including from a browser (`code` is `cookie_credentials_rejected` when a `Cookie` header is present, `authentication_required` when no `Authorization` header is sent):

```json
{
  "code": "authentication_required",
  "detail": "Bearer authentication is required.",
  "instance": "/v1/vehicles/vin/1HGCM82633A004352",
  "request_id": "accbacf9-ddbf-483b-8ee8-612f42d4593c",
  "retryable": false,
  "status": 401,
  "title": "Unauthorized",
  "type": "https://api.data-platform.dev/problems/authentication-required"
}
```
