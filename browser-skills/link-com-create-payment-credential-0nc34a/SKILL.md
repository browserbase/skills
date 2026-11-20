---
name: link-com-create-payment-credential-0nc34a
title: Link Create One-Time-Use Payment Credential
description: >-
  Provision a single-use virtual card (or Shared Payment Token) from a Link
  wallet via the @stripe/link-cli spend-request flow, so an agent can pay any
  online merchant on the user's behalf without storing real card details. US
  Link accounts only; every credential requires human approval in the Link app.
website: link.com
category: payments
tags:
  - payments
  - link
  - stripe
  - agentic-commerce
  - cli
  - mcp
  - virtual-card
source: 'browserbase: agent-runtime 2026-06-04'
updated: '2026-06-04'
recommended_method: cli
alternative_methods:
  - method: mcp
    rationale: >-
      The same @stripe/link-cli runs as an MCP server (`--mcp` over stdio, or
      `serve` over HTTP at /mcp), exposing auth / payment-methods /
      spend-request / mpp as tools — preferred for agents that call tools rather
      than shell out.
  - method: browser
    rationale: >-
      No browser path to credential provisioning. app.link.com 302s to /login
      (email OTP + invisible hCaptcha) and the wallet only manages saved cards.
      Confirmed fully gated for an unauthenticated agent; documented as a dead
      end, not a fallback.
verified: true
proxies: true
---
# Link — Create a One-Time-Use Payment Credential

## Purpose

Provision a single-use payment credential from a [Link](https://link.com) (Stripe's consumer wallet) account so an agent can pay at any merchant on the internet **without ever touching the user's real card details**. The credential is one of two shapes: a **virtual card** (PAN + CVC + expiry + billing address) that works in any standard web checkout form (the seller does **not** need to support Link or Stripe), or a **Shared Payment Token (SPT)** for merchants that accept the [Machine Payments Protocol](https://mpp.dev) (HTTP 402). This is a **write / money-movement operation** — every credential requires explicit human approval in the Link mobile app before it becomes spendable, and credentials are short-lived (12 hours) and capped ($500). US Link accounts only.

The honest optimal path is the official **`@stripe/link-cli`** (a CLI that also runs as an MCP server) — purpose-built for agents. The consumer web UI at `app.link.com` is **not** a path to this: it is a login/wallet-management surface only, and it is fully gated behind email-OTP + invisible hCaptcha (see Browser fallback).

## When to Use

- An agent needs to complete a real online purchase on the user's behalf and must not store or transcribe the user's actual card.
- "Buy `<item>` from `<merchant>` for me" flows where a human approves spend out-of-band on their phone.
- Agentic-commerce checkouts against MPP/HTTP-402 merchants (use the SPT credential type).
- Generating a disposable card number for a one-off purchase on a site that does **not** support Link/Stripe directly (virtual-card credential type works anywhere).
- **Not** for recurring/subscription billing — credentials are single-use and expire in 12 hours.

## Workflow

The whole flow is CLI/MCP. There is no useful browser automation surface — `app.link.com` only logs you in and manages saved cards; credential provisioning happens through the `spend-request` API exposed by the CLI.

### 1. Install the CLI

```bash
npm i -g @stripe/link-cli      # or run ad-hoc: npx @stripe/link-cli <cmd>
```

When invoked from a non-TTY (agent) context, every command defaults to **`toon`** output (compact, LLM-friendly). Pass `--format json` for structured parsing. Discover the full command surface with `link-cli --llms-full` and any command's schema with `link-cli <cmd> --schema`. Set `NO_UPDATE_NOTIFIER=1` to silence the update banner in logs.

### 2. Authenticate (device-authorization grant — requires the human's Link app)

```bash
link-cli auth login --clientName "<your agent name>" --interval 5 --timeout 300
```

This is an OAuth device flow against `https://login.link.com`. The command yields a **verification URL + short phrase**; the user opens the URL, logs into their Link account, and enters the phrase to approve the connection. The `--clientName` is shown in the approval prompt (e.g. "Claude Code on my-macbook"). With `--interval > 0` the command yields the code immediately and then **polls inline** until authenticated — strongly preferred for agents that cannot relay the code while a separate blocking poll holds the I/O channel. Check state any time with `link-cli auth status` (`{ "authenticated": true|false, ... }`); disconnect with `link-cli auth logout`. Credentials persist to `~/.config/link-cli-nodejs/config.json` (override with `--auth <path>` or `LINK_AUTH_FILE`; inject a token directly with `LINK_ACCESS_TOKEN`).

### 3. Pick a payment method

```bash
link-cli payment-methods list --format json
```

Returns the cards/bank accounts saved to the Link account; use the `id` (e.g. `csmrpd_xxx`) as `--payment-method-id` in the next step. If the list is empty, the user must add one at `https://app.link.com/wallet` (or `link-cli payment-methods add`, which opens that wallet page).

### 4. Create a spend request and request approval

```bash
link-cli spend-request create \
  --payment-method-id csmrpd_xxx \
  --merchant-name "Stripe Press" \
  --merchant-url  "https://press.stripe.com" \
  --context "Purchasing 'Working in Public' from press.stripe.com on the user's behalf; the user initiated this via the shopping assistant and asked to complete checkout with a one-time card." \
  --amount 3500 \
  --line-item "name:Working in Public,unit_amount:3500,quantity:1" \
  --total "type:total,display_text:Total,amount:3500" \
  --request-approval \
  --format json
```

- **Required fields:** `payment-method-id`, `merchant-name`, `merchant-url`, `context`, `amount`. `--context` **must be ≥ 100 characters** — the user reads it verbatim in the approval prompt, so describe the purchase and why.
- `--amount` is in **cents**, max **50000** ($500). `--currency` defaults to `usd` (3-letter ISO).
- `--line-item` / `--total` are repeatable `key:value` strings (see the gotchas for the key sets).
- `--request-approval` (default `true`) fires a push notification to the user's Link app and **polls until `approved` / `denied` / `expired`**. The user has **10 minutes** to approve. You can instead create first and approve later with `link-cli spend-request request-approval <id>`; update mutable fields before approval with `link-cli spend-request update <id> ...`.
- For MPP/HTTP-402 merchants, pass `--credential-type shared_payment_token` plus `--network-id <id>` (extract the network id from the merchant's `WWW-Authenticate` challenge via `link-cli mpp decode --challenge '...'`). For SPT, `merchant-name`/`merchant-url` are **forbidden**.
- **Development:** add `--test` to mint test-mode credentials backed by Stripe's test card `4242424242424242` — no real money, no real payment method needed beyond a test one. `link-cli demo [--only-card|--only-spt]` runs the full flow in test mode end-to-end.

### 5. Retrieve the card credentials (after approval)

```bash
link-cli spend-request retrieve lsrq_xxx \
  --include card \
  --output-file /tmp/link-card.json --format json
```

Once approved, the spend request carries a `card` object: `number`, `cvc`, `exp_month`, `exp_year`, `billing_address`, `valid_until`. **Retrieve does NOT include card details by default** — pass `--include card`. To avoid leaking the PAN into agent transcripts/logs, use `--output-file <path>`: the full card is written to a `0600` file and **stdout shows only redacted fields** (brand, last4, expiry) plus a `card_output_file` path. Use `--force` to overwrite an existing file. For polling, pass `--interval` (and optionally `--max-attempts`/`--timeout`); polling exits non-zero with `code: "POLLING_TIMEOUT"` if the request is still non-terminal, so a still-pending request is never mistaken for complete.

### 6. Spend the credential

- **Standard checkout (card):** enter `number` / `cvc` / `exp_month` / `exp_year` / `billing_address` into the merchant's checkout form. Works on any site — the card is not restricted to Link/Stripe sellers.
- **MPP merchant (SPT):** `link-cli mpp pay <url> --spend-request-id lsrq_xxx --method POST --data '{...}'`. The SPT is one-time-use; if the payment fails, create a **new** spend request (don't retry the same token).

### MCP server variant

The same flow is exposed over MCP for agents that prefer tool-calls to shelling out:

```bash
npx @stripe/link-cli --mcp                 # stdio MCP server (add to .mcp.json)
link-cli serve --port 54321                # HTTP MCP server, endpoint at /mcp
```

The tool surface mirrors the subcommands above (`auth`, `payment-methods`, `spend-request`, `mpp`, ...).

### Browser fallback (do NOT rely on this for credential creation)

There is **no** browser path to provisioning a one-time card. `https://app.link.com` immediately 302-redirects to `https://app.link.com/login`, which presents only a "Welcome to Link / Log in or sign up" form: a single **Email** field + **Continue** button, gated by an **invisible hCaptcha** (`newassets.hcaptcha.com`, sitekey `5fbf2c13-84a4-472f-a8fa-a9faba5bc3b7`, `size=invisible`) that fires on submit, followed by an **email one-time-passcode**. Even with a stealth + residential-proxy Browserbase session, an agent cannot pass the OTP without access to the account's inbox/phone. The web wallet (`/wallet`) is for *managing saved payment methods*, not for minting agent spend credentials. Use the CLI.

## Site-Specific Gotchas

- **US-only.** The CLI states one-time-credential provisioning is currently available only to US Link accounts.
- **Human approval is mandatory and out-of-band.** No credential is spendable until the user taps approve in the **Link mobile app** (`https://link.com/download`). There is no headless/unattended approval. Budget for the 10-minute approval window.
- **`--context` minimum is 100 characters** — the API rejects shorter strings (`VALIDATION_ERROR`). It is shown to the user at approval time, so make it truthful and specific.
- **Hard limits (per account):** max **$500 / 50000 cents** per request; **$500/day** total; **30** concurrent active (created + approved) requests; **10** concurrent approved; **50** creates/hour; **200** creates per rolling 60 days. Exceeding these errors at create time.
- **Credentials expire 12 hours** after spend-request creation; the approval window is **10 minutes** from `request-approval`. Provision close to when you'll actually pay.
- **One-time-use means one-time-use.** SPTs (and the intent of the virtual card) are single-use; on a failed payment, create a fresh spend request rather than reusing the credential.
- **Card details are secret.** Always use `--output-file` so the PAN/CVC land in a `0600` file and only redacted data hits stdout. Never echo the retrieved card into logs or chat transcripts. `retrieve` omits the card unless you pass `--include card`.
- **Auth lives in a config file.** `~/.config/link-cli-nodejs/config.json` by default; `link-cli auth status` reports `authenticated: false` when unset. Env overrides: `LINK_AUTH_FILE`, `LINK_ACCESS_TOKEN`, `LINK_REFRESH_TOKEN`, `LINK_NO_REFRESH`, `LINK_API_BASE_URL`, `LINK_AUTH_BASE_URL`, `LINK_HTTP_PROXY`.
- **`--line-item` keys:** `name` (required), `quantity`, `unit_amount`, `description`, `sku`, `url`, `image_url`, `product_url`. **`--total` keys:** `type` (required; one of `subtotal, tax, total, items_base_amount, items_discount, discount, fulfillment, shipping, fee, gift_wrap, tip, store_credit`), `display_text` (required), `amount` (required). Amounts are in cents.
- **SPT requests forbid `merchant-name`/`merchant-url`** and require `--network-id` (from `mpp decode`). Card requests require `merchant-name`/`merchant-url`.
- **Use `--test` for development.** Test mode uses card `4242424242424242` and never charges real money — but note that even test-mode `spend-request create` still requires a `payment-method-id` (i.e. an authenticated account), confirmed against the live CLI (`v0.6.0`). `link-cli demo` runs both flows entirely in test mode.
- **Don't try the consumer web UI for provisioning.** Verified against a stealth Browserbase session: `app.link.com` → `/login` is an email-OTP + invisible-hCaptcha wall with no unauthenticated path to a card-creation surface. The auth `device/code` endpoint lives at `https://login.link.com` (a Stripe API host). This is documented so future agents don't re-discover the dead end.
- **Test/verification note for this skill:** the CLI command surface, auth-login device flow, validation rules, and the browser wall were all verified live in-sandbox (CLI `v0.6.0`). A full real end-to-end provision (approval → card retrieval) could **not** be exercised here because no authenticated US Link account / mobile-app approver was available — that step is inherently human-gated.

## Expected Output

The skill yields an approved spend request whose `card` (or SPT) is the one-time payment credential. Representative shapes:

```json
// Approved virtual card (after retrieve --include card; PAN written to --output-file)
{
  "id": "lsrq_001",
  "status": "approved",
  "credential_type": "card",
  "amount": 3500,
  "currency": "usd",
  "merchant_name": "Stripe Press",
  "valid_until": "2026-06-04T15:00:00Z",
  "card": {
    "brand": "visa",
    "last4": "4242",
    "exp_month": 12,
    "exp_year": 2028,
    "billing_address": { "line1": "...", "city": "...", "state": "..", "postal_code": "...", "country": "US" }
  },
  "card_output_file": "/tmp/link-card.json"
}
```

```json
// Awaiting approval (request-approval issued, user has not yet approved)
{ "id": "lsrq_001", "status": "pending_approval", "credential_type": "card", "amount": 3500 }
```

```json
// User denied / window elapsed
{ "id": "lsrq_001", "status": "denied" }     // or "expired" after the 10-minute window
```

```json
// Shared Payment Token (MPP / HTTP-402 merchants)
{ "id": "lsrq_002", "status": "approved", "credential_type": "shared_payment_token", "network_id": "..." }
```

```json
// Validation failure at create (e.g. context < 100 chars, amount > 50000, missing payment-method-id)
{ "code": "VALIDATION_ERROR", "message": "...", "fieldErrors": [ { "path": "context", "message": "..." } ] }
```

```json
// Browser-fallback outcome — provisioning is NOT possible via the web UI
{
  "success": false,
  "reached": "app.link.com/login — email + OTP entry screen",
  "wall": "requires authenticated Link account; email OTP + invisible hCaptcha",
  "one_time_card_created": false,
  "recommended_path": "@stripe/link-cli spend-request flow"
}
```
