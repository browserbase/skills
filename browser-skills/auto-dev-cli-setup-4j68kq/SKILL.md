---
name: auto-dev-cli-setup-4j68kq
title: Auto.dev CLI Setup
description: >-
  Install, authenticate, and use the Auto.dev `auto` CLI (npm @auto.dev/sdk) for
  any automotive-data task — VIN decode, specs, listings, recalls, payments,
  plate lookup — plus MCP wiring for AI agents.
website: auto.dev
category: developer-tools
tags:
  - automotive
  - cli
  - mcp
  - vin
  - vehicle-data
  - setup
  - api
source: 'browserbase: agent-runtime 2026-06-03'
updated: '2026-06-03'
recommended_method: cli
alternative_methods:
  - method: mcp
    rationale: >-
      For AI agents, the bundled stdio MCP server (auto --mcp) or remote MCP at
      https://mcp.auto.dev/mcp exposes every CLI verb as an auto_-prefixed
      native tool — no shelling out, same auth/config.
  - method: api
    rationale: >-
      Direct REST against https://api.auto.dev (Bearer key or ?apiKey=) when
      embedding calls outside a shell/agent; CLI/MCP shorthand params map to
      dotted names (make→vehicle.make).
  - method: fetch
    rationale: >-
      Same REST endpoints via a plain HTTP fetch with an Authorization: Bearer
      sk_ad_... header for lightweight one-off lookups.
verified: false
proxies: false
---
# Auto.dev CLI Setup

## Purpose

Get an agent installed, authenticated, and productive with the Auto.dev `auto` CLI (npm package `@auto.dev/sdk`) so it can run any automotive-data task — VIN decode, vehicle specs/build data, retail listings search, photos, recalls, payment/APR/TCO/tax calculators, and license-plate-to-VIN lookups. All commands are read-only data lookups against `https://api.auto.dev`; nothing here mutates remote state. This skill covers install, the three auth modes, command/parameter discovery, output shaping, MCP wiring for AI clients, and the failure modes a future agent will actually hit. Verified end-to-end in a clean sandbox against `@auto.dev/sdk@0.1.23` (the current npm `latest`).

## When to Use

- Bootstrapping a fresh machine, container, or CI runner that needs Auto.dev automotive data from the shell.
- An agent that should call automotive endpoints as native tools — wire up the bundled MCP server instead of shelling out per call.
- Any task phrased as "decode this VIN", "find Toyota listings under $40k in CA", "what are the recalls / monthly payment / total cost of ownership for this vehicle", "resolve this plate to a VIN".
- Discovering what endpoints/parameters exist and which plan tier gates them — `auto explore` is a zero-auth, offline catalog.
- Scripting bulk lookups where `--json`/`--yaml` output feeds a downstream pipeline.

## Workflow

The optimal path is the **CLI** (`auto`) for shell/scripting and the **bundled stdio MCP server** for in-agent tool calls — both ship in the same `@auto.dev/sdk` npm package, share one credential store and config file (`~/.auto-dev/config.json`), and expose the identical command surface (CLI verb `decode` ⇄ MCP tool `auto_decode`). There is also a plain REST API (`https://api.auto.dev`) and a TypeScript SDK; prefer those only when you're embedding calls in application code rather than driving them from an agent/shell. There is **no browser flow to script** — the website is only for signup/dashboard/API-key issuance, so this skill has no browser fallback.

1. **Install.** One command installs the global `auto` CLI *and* auto-configures the MCP server for Claude Code, Claude Desktop, and Cursor:
   ```bash
   npx @auto.dev/sdk mcp install
   ```
   CLI-only (no MCP wiring):
   ```bash
   npm install -g @auto.dev/sdk      # provides the `auto` binary
   auto --version                    # verify → 0.1.23
   ```

2. **Authenticate** (pick ONE; resolution order is `--api-key` flag → `AUTODEV_API_KEY` env → stored login credentials):
   - **Interactive / desktop** — OAuth, no key to manage:
     ```bash
     auto login          # opens a browser to id.org.ai; auto whoami confirms
     ```
   - **Headless / CI / containers** — OAuth's browser step is not viable, so use an API key (`sk_ad_…`, created at the dashboard → API Keys):
     ```bash
     export AUTODEV_API_KEY=sk_ad_xxx
     ```
   - **Per-invocation override:**
     ```bash
     auto decode 1HGCM82633A004352 --api-key sk_ad_xxx
     ```

3. **Discover endpoints & parameters** (zero auth, fully offline — use this instead of `auto docs`, see Gotchas):
   ```bash
   auto explore                 # catalog of every endpoint, grouped by plan tier
   auto explore listings        # parameters for one endpoint + shorthand→real mapping
   ```
   `auto explore listings` reveals that CLI/MCP shorthand params map to dotted API names, e.g. `make → vehicle.make`, `price → retailListing.price`, `state → retailListing.state`.

4. **Run the task.** Every verb takes `--json` / `--yaml` for machine-readable output and `--raw` to keep the API envelope (`api`, `links`, `user`, `examples`, `discover`, `actions`) that is stripped by default:
   ```bash
   auto decode 1HGCM82633A004352 --json
   auto listings --make Toyota --year 2024 --price 10000-40000 --state CA --json
   auto specs 1HGCM82633A004352 --json
   auto recalls 1HGCM82633A004352 --json
   auto payments 1HGCM82633A004352 --price 35000 --zip 90210 --down-payment 5000 --json
   auto apr 1HGCM82633A004352 --year 2024 --make Honda --model Accord --zip 90210 --credit-score 750 --json
   auto tco 1HGCM82633A004352 --zip 90210 --json
   auto taxes 1HGCM82633A004352 --price 35000 --zip 90210 --json
   auto plate CA ABC1234 --json
   auto usage --json          # remaining quota / tier
   ```

5. **Persist preferences** (shared across CLI, SDK, and MCP via `~/.auto-dev/config.json`):
   ```bash
   auto config set raw true   # always return the full envelope
   auto config list
   ```

6. **For AI agents — use MCP instead of shelling out.** After `npx @auto.dev/sdk mcp install`, confirm wiring and use the `auto_`-prefixed tools (`auto_decode`, `auto_listings`, `auto_payments`, …):
   ```bash
   auto mcp status            # shows per-client install state
   ```
   Manual stdio config for any MCP client:
   ```json
   { "mcpServers": { "auto-dev": { "command": "auto", "args": ["--mcp"] } } }
   ```
   Hosted alternative (no local install): remote MCP at `https://mcp.auto.dev/mcp`, e.g. `claude mcp add --transport http auto-dev https://mcp.auto.dev/mcp`. Both transports expose the same tools and the same plan-tier gating.

## Site-Specific Gotchas

- **`auto docs` is broken in the published npm package.** In `@auto.dev/sdk@0.1.23`, both `auto docs` and `auto docs <query>` return `✖ No bundled docs found — Run: npm run build:docs` (or `✖ No docs found for "listings"`). The docs corpus is not shipped in the npm tarball. **For endpoint/param discovery use `auto explore` / `auto explore <endpoint>` (which work offline), or the web docs at `https://docs.auto.dev/v2/cli-mcp-sdk`.** The MCP `auto_docs` tool inherits the same empty corpus — do not rely on it.
- **Errors surface as raw Node uncaught exceptions, not clean CLI messages.** Missing auth prints a stack trace ending in `Error: No API key found. Set AUTODEV_API_KEY or run: auto login`; an unreachable host prints `TypeError: fetch failed … ENOTFOUND api.auto.dev`. Agents parsing CLI stderr must not assume a single tidy error line — match on the trailing `Error:`/`cause` text and treat a non-zero exit as failure.
- **All data verbs require network egress to `https://api.auto.dev`.** Discovery/config verbs (`explore`, `config`, `mcp status`, `whoami`, `--help`) are offline, but `decode`/`listings`/`specs`/etc. will fail with `ENOTFOUND api.auto.dev` in sandboxes/CI that whitelist outbound hosts. Allowlist `api.auto.dev` (and `id.org.ai` if using `auto login`, `mcp.auto.dev` for remote MCP).
- **`auto login` needs a real browser (OAuth at `id.org.ai`).** Not usable headless — fall back to `AUTODEV_API_KEY` in those environments.
- **Signup requires a card on file even for the free tier.** The Starter plan is free (1,000 calls/mo) but Stripe checkout + email verification are mandatory before a key works.
- **Plan tiers gate both CLI verbs and MCP tools.** Starter: `decode`, `photos`, `listings`. Growth: `specs`, `build`, `recalls`, `payments`, `apr`, `tco`. Scale: `open-recalls`, `plate`, `taxes`. Calling a higher-tier verb on a lower plan returns a plan/permission error from the API, not a local validation error.
- **Shorthand vs dotted parameter names.** The CLI/MCP accept friendly names (`make`, `year`, `price`, `miles`, `state`); the REST API and TS SDK expect the dotted forms (`vehicle.make`, `vehicle.year`, `retailListing.price`, `retailListing.miles`, `retailListing.state`). `auto explore listings` prints the exact mapping. Ranges are hyphenated strings: `year=2018-2020`, `price=10000-30000`, `miles=0-50000`.
- **Response metadata is stripped by default.** You get clean vehicle data without `api`/`links`/`user`/`examples`/`discover`/`actions`. Pass `--raw` (or `auto config set raw true`) when you need the envelope, e.g. for `meta.requestId` or `meta.usage.remaining`.
- **Rate limits are per plan:** Starter 5 req/s, Growth 10 req/s, Scale 50 req/s. Throttle bulk loops accordingly.
- **`@auto.dev/sdk` is one package serving three roles** — `auto` CLI binary, stdio MCP server (`auto --mcp`), and importable TS SDK (`import { AutoDev } from '@auto.dev/sdk'`). They share `~/.auto-dev/config.json`, so a `raw`/auth change in one is visible to all.

## Expected Output

Discovery/verification states captured live in this sandbox (offline, no auth):

```text
$ auto --version
0.1.23

$ auto whoami
✖ Not logged in
  Run: auto login

$ auto mcp status
auto.dev MCP Status
  ✖ Claude Code  not installed

$ auto config set raw true
✔ raw set to true          # → ~/.auto-dev/config.json: { "raw": true }
```

Documented data-payload shapes (the SDK/`--json` contract — not captured live because the sandbox blocks egress to `api.auto.dev`). With metadata stripped (default), CLI `--json` returns just the `data` object; the SDK and `--raw` return the full envelope:

```json
{
  "data": {
    "vin": "1HGCM82633A004352",
    "make": "Honda",
    "model": "Accord",
    "year": 2003,
    "trim": "EX",
    "engine": "...",
    "drivetrain": "..."
  },
  "meta": {
    "requestId": "req_...",
    "tier": "starter",
    "usage": { "remaining": 998 }
  }
}
```

Listings (`auto listings --make Toyota --year 2024 --state CA --json`) returns a paginated `data` array; the SDK envelope adds the same `meta` block:

```json
{
  "data": [
    {
      "vin": "...",
      "vehicle": { "make": "Toyota", "model": "Camry", "year": 2024, "trim": "...", "bodyStyle": "sedan" },
      "retailListing": { "price": 32999, "miles": 12000, "state": "CA" }
    }
  ],
  "meta": { "requestId": "req_...", "tier": "growth", "usage": { "remaining": 9871 } }
}
```

Failure shapes an agent must handle (exit code non-zero, stack-trace text on stderr):

```text
# No credentials
Error: No API key found. Set AUTODEV_API_KEY or run: auto login

# Host unreachable / not allowlisted
TypeError: fetch failed
  [cause]: Error: getaddrinfo ENOTFOUND api.auto.dev
```
