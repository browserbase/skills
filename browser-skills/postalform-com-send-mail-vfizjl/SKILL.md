---
name: postalform-com-send-mail-vfizjl
title: PostalForm Send Mail
description: >-
  Place a real print-and-mail order on PostalForm — upload (or compose) a
  document, attach a sender and recipient address, choose mail options, pay, and
  receive a tracked order ID. Supports letters (PDF/DOCX/Markdown/HTML/RTF) and
  postcards (4x6/6x9/11x6). Optimized for agent-native machine payments
  (x402/MPP/MCP) with a browser-Stripe fallback.
website: postalform.com
category: logistics
tags:
  - mail
  - usps
  - certified-mail
  - x402
  - mcp
  - machine-payments
  - postcards
source: 'browserbase: agent-runtime 2026-05-28'
updated: '2026-05-28'
recommended_method: api
alternative_methods:
  - method: mcp
    rationale: >-
      PostalForm runs a streamable JSON-RPC 2.0 MCP server at /mcp with 12 tools
      (search_addresses, create_pdf_upload, create_order_draft,
      create_machine_order, get_order_status, etc.). Equivalent to the REST API;
      use when the agent runtime speaks MCP natively. UCP shopping-checkout
      binding is at /ucp/mcp for shopping-agent platforms.
  - method: api
    rationale: >-
      Documented x402 (USDC on Base) and MPP (Tempo crypto or Stripe Shared
      Payment Token) endpoints at /api/machine/orders and
      /api/machine/mpp/orders. Validate-first design returns a binding quote
      with no side effects; payment uses HTTP 402 challenge/retry. OpenAPI at
      /openapi.json, manifest at /.well-known/x402.
  - method: browser
    rationale: >-
      Fallback for human/Stripe-card checkout. Inertia.js SPA — file upload at
      homepage triggers same-URL transition to recipient-address step. No
      anti-bot wall observed; stealth/proxies unnecessary. Use only when machine
      payments are unavailable or the owner must approve checkout interactively.
verified: true
proxies: true
---
# PostalForm Send Mail

## Purpose

Place a real print-and-mail order on PostalForm — upload (or compose) a document, attach a sender and recipient address, choose mail options, pay, and receive a tracked order ID. PostalForm prints the document, prepares the envelope and postage, and hands it to a carrier (USPS via Lob / PostGrid for letters, Click2Mail for Express, Florist One for flower letters). Both **letters** (PDF, DOCX, Markdown, HTML, RTF, or plain text) and **postcards** (`4x6`, `6x9`, `11x6` PDF) are supported. This skill is **not** read-only — it places a paid order on the owner's behalf.

> **PostalForm does not ship postcards through a `/postcards` web flow** — `/postcards.md` 404s. Postcards are an API-only product today; see Site-Specific Gotchas.

## When to Use

- Mailing a signed letter, demand notice, IRS form (1099-NEC, 1120, 5471, 8822, 843, etc.), Certified Mail packet, or any document a recipient needs in physical mail.
- Mailing a postcard (artwork side + blank mailing side — PostalForm fills the mailing block automatically).
- Bulk mail merges (one CSV → one mailpiece per row with `{{column}}` template variables).
- Same-business-day USPS handoff for U.S. Express orders submitted before **10:00 AM Eastern**.
- Any agent flow where the owner wants the agent to make a real-world mailing happen autonomously (x402 USDC, MPP Tempo/Stripe SPT, or MCP draft-and-checkout).

## Workflow

PostalForm is one of a handful of sites that publishes a **first-class agent-facing API** at `https://postalform.com/agents`, with HTTP-402 machine payments (x402 + MPP), a streamable MCP server at `/mcp`, a UCP shopping-checkout binding at `/ucp/mcp`, and an OpenAPI document at `/openapi.json`. **Prefer the API over scripted browsing** — the browser flow uses Stripe Elements + Inertia.js multi-step state that is brittle to drive, while the API is documented, idempotent, validate-first, and supports both stablecoin and Stripe Shared Payment Tokens. Browser is the fallback for human checkout or when machine payments are unavailable.

### Method A — x402 (USDC on Base) — recommended for crypto-capable agents

1. **Read discovery once and cache.**
   - `GET https://postalform.com/.well-known/x402` → range pricing, network, facilitator (`https://api.cdp.coinbase.com/platform/v2/x402`), token (`USDC`), eip155:8453.
   - `GET https://postalform.com/openapi.json` → per-route input schemas and `info.guidance` planning hints.

2. **Build address strategy.** Pick exactly one per party:
   - **Manual** (when you already have line1/city/state/zip) — set `*_address_type: "Manual"` and `*_address_manual: { line1, line2?, city, state, zip, countryCode? }`.
   - **Loqate** (when you only have partial info) — call `postalform.search_addresses` via MCP **or** the in-page autocomplete via browser; resolve to `type="Address"` (never `"Container"` — drill down with a `container` param first). Set `*_address_type: "Address"`, `*_address_id: "US|LP|..."`, and `*_address_text: "${text}, ${description}"`.
   - You may mix: manual sender + Loqate recipient (or vice versa).

3. **Draft the order payload.** Required fields:
   - `request_id` — UUID (idempotency key; reuse it for the unpaid + paid retry of the same logical order; generate a fresh UUID for a different mailing).
   - `buyer_name`, `buyer_email` (the email is set as Stripe `receipt_email`).
   - Exactly one document source:
     - `pdf: { upload_token }` (preferred canonical form), or `{ download_url, file_id }`, or top-level `"data:application/pdf;base64,..."` string, or an allowlisted https URL.
     - `letter: { format: "text"|"html"|"markdown"|"rtf", title?, body, signature? }` — PostalForm server-renders the PDF.
     - `form: { …workflow-form payload… }` — discovered via `GET /api/machine/forms` + `GET /api/machine/forms/{slug}/schema`.
   - Sender + recipient name and address per step 2.
   - Options (all optional with sane defaults):
     - `double_sided` (default `true`)
     - `color` (default `false`)
     - `mail_class` — `"standard"` (First Class), `"priority"`, `"express"`
     - `certified` (default `false`; First Class only — combining with Express is rejected at validate)
     - `certified_return_receipt` (default `false`; ignored unless `certified=true`)
     - `mailpiece_type: "letter"` (default) or `"postcard"`; postcards also require `postcard_size: "4x6" | "6x9" | "11x6"`.

4. **Validate first (no payment side effects).**
   ```
   POST https://postalform.com/api/machine/orders/validate
   Content-Type: application/json
   <payload>
   ```
   Returns `200` with `{ request_id, request_hash, order_id: null, status: "validated_new_order", quote: { price_usd, full_price_usd, billable_page_count, provider, ... } }`. Verified: a 1-page B&W double-sided standard letter quotes **$3.40**; the same letter with `certified=true, certified_return_receipt=true` quotes **$14.40**. Validation errors come back as `422 { code: "invalid_request", errors: [{ path, message, hint, fix_examples }] }` — read `fix_examples` before retrying.

5. **Create the order (unpaid).** Same body, hit:
   ```
   POST https://postalform.com/api/machine/orders
   ```
   Expect `402 Payment Required` with a `PAYMENT-REQUIRED` header describing amount, asset, network, facilitator, and any nonce/recipient address.

6. **Pay and retry.** Sign the x402 challenge (Coinbase CDP facilitator handles settlement), put the proof in the `PAYMENT-SIGNATURE` header, and re-POST the **exact same body** (including the same `request_id`). PostalForm settles via the facilitator and returns `202 Accepted` with a `PAYMENT-RESPONSE` header and `{ order_id, status, ... }`.

7. **Poll status** until terminal:
   ```
   GET https://postalform.com/api/machine/orders/{order_id}
   ```
   States progress: `awaiting_payment` → `paid` → `queued` → `processing` → `printed` → `handed_off` → `in_transit` → `delivered`. For Certified Mail, USPS tracking number appears once carrier acceptance occurs.

### Method B — MPP (Tempo crypto or Stripe Shared Payment Token)

Same 4-step shape, swap endpoints + header conventions:

- `POST /api/machine/mpp/orders/validate` — quote.
- `POST /api/machine/mpp/orders` (no `Authorization`) → `402` + `WWW-Authenticate: Payment …`.
- Pay with **Tempo** (testnet for staging, mainnet live) **or** mint a Stripe `spt_…` Shared Payment Token via the [Stripe Link CLI](https://github.com/stripe/link-cli) (`link auth login` then `link spt mint`); retry with `Authorization: Payment <serialized-MPP-credential>`.
- Server returns `202` + `Payment-Receipt`; status at `GET /api/machine/mpp/orders/{id}`. Wait for `payment_status: "paid"` (Stripe webhook finalization).

### Method C — MCP (`postalform` server at `/mcp`)

Streamable HTTP MCP server. Use when your agent runtime already speaks JSON-RPC 2.0 MCP.

1. `POST /mcp` with `initialize` → capture the **`mcp-session-id`** response header (server is stateful; subsequent calls must echo this header or you get `400 No valid session ID provided`).
2. `tools/list` → 12 tools exposed:
   - `postalform.list_forms`, `postalform.get_form_schema` — workflow forms catalog
   - `postalform.search_addresses` — Loqate autocomplete with `Container` drill-down
   - `postalform.create_pdf_upload` — get an upload token for a PDF
   - `postalform.create_order_draft`, `postalform.create_letter_order_draft`, `postalform.create_form_order_draft`, `postalform.preview_letter_order_draft` — build a draft (no payment)
   - `postalform.create_machine_order` — direct machine order (validate + pay + create in one call)
   - `complete_checkout` — Instant Checkout for clients that prefer hosted-Stripe payment
   - `postalform.get_order_status`, `postalform.ping`
3. For a draft → hosted-Stripe flow: `create_order_draft` returns a checkout URL the owner (or agent w/ card credential) opens.
4. For an end-to-end machine flow: `create_machine_order` performs the validate-and-pay handshake internally and returns `order_id`.

### Method D — UCP Checkout (shopping-agent platforms only)

PostalForm exposes the UCP Checkout capability at `https://postalform.com/ucp/mcp` with `dev.ucp.shopping.checkout` (version `2026-01-11`). Tools: `create_checkout`, `get_checkout`, `update_checkout`, `complete_checkout`, `cancel_checkout`. **Limitations**: UCP supports PDF-based checkouts with Loqate-resolved addresses only; manual addresses, server-rendered letters, postcards, and form workflows require the regular MCP path. Every UCP call must include `_meta.ucp.profile` pointing to the platform's UCP profile URL.

### Browser fallback

Use when the agent cannot pay via x402/MPP and needs a human (or Browserbase + saved card) to complete Stripe checkout. Stealth + residential proxy are **not** required — site is Cloudflare-fronted but no anti-bot wall observed.

1. `browse open https://postalform.com/` → file input ref appears next to "Upload your Document" (h1: *"Upload a File. We print and mail it for you."*).
2. `browse upload @<file-input-ref> /path/to/letter.pdf` → the SPA replaces the upload card with the recipient address autocomplete (h1: *"Where should we send your document to?"*) **without changing the URL** (stays at `https://postalform.com/`). Wait ~2–3 s for the Inertia re-render before snapshotting.
3. Click the recipient address combobox, type 3+ chars, wait 1.5–2 s for Loqate dropdown, click `menuitem` for the target address (drill into `Container` first if it's a building/complex).
4. Repeat for sender. Choose print options (color/B&W, single/double-sided, First Class/Express, Certified) — these are surfaced as checkboxes/radios on the same page.
5. Final step is a Stripe Elements card form. Do **not** complete checkout from an agent session unless the owner has explicitly authorized payment via a Browserbase-stored card.
6. Order confirmation page contains the `order_id`; same `GET /api/machine/orders/{id}` endpoint works for tracking.

For known-template flows there are shortcuts:
- `https://postalform.com/forms/plain-letter` — write a letter in the in-page editor (no PDF).
- `https://postalform.com/forms/1099-nec` (and other slugs from `/api/machine/forms`) — guided form workflow that builds the PDF for you.
- `https://postalform.com/credit-report-dispute-packets`, `/bulk-mail`, `/flowers` — verticals with their own UIs.

## Site-Specific Gotchas

- **Postcards have no `/postcards` web page — they're API-only.** `/postcards.md` returns 404 even though the top-nav has a "Postcards" link (it redirects through guidelines). To mail a postcard you must use the machine API with `mailpiece_type: "postcard"` + `postcard_size: "4x6" | "6x9" | "11x6"` and supply a **2-page PDF**: page 1 = artwork side, page 2 = mailing side (leave the mailing block blank — PostalForm typesets sender/recipient/indicia/barcode automatically; if you put them in the PDF, the order will be rejected or print wrong). Use the official templates: `/postcard-guidelines/us_intl_postcard_6inx4in.pdf`, `…9inx6in.pdf`, `…11inx6in.pdf`. Server normalizes postcard options to `color=true, double_sided=true, mail_class=standard, certified=false, signature_required=false` — don't try to override.
- **`request_id` is the idempotency key, not just a log tag.** Reuse the same UUID for the unpaid `POST` and the paid retry of the same logical mailing; generate a **fresh** UUID for a legitimately new order. Reusing across distinct orders returns the prior order and skips charge — fine for retry, dangerous for "send the same letter to a second person".
- **`buyer_email` is required.** PostalForm passes it to Stripe as `receipt_email`. Missing → `422 invalid_request`.
- **Loqate `Container` IDs fail late.** A suggestion with `type="Container"` is a building, not an address. Sending it as `*_address_id` passes initial JSON validation but fails Loqate verification *after* payment, leaving the order in a stuck state. Always drill down with `container=<id>` + a refined query until you get `type="Address"`.
- **`*_address_type` must match the field shape.** Mixing `*_address_id` with `Manual`, or `*_address_manual` with `Address`, is silently confusing — validate will accept one but ignore the other. Send exactly one shape per party.
- **`pdf` must be a JSON object, except for data URLs.** `{ "pdf": "data:application/pdf;base64,..." }` is fine as a top-level string, but `{ "pdf": { "data_url": "..." } }` fails with `422 pdf object must be either { upload_token } or { download_url, file_id }` (verified). Canonical preferred form is `{ upload_token }` from `postalform.create_pdf_upload`.
- **Certified Mail is First Class only.** `certified=true` + `mail_class="express"` → `422` at validate. `certified_return_receipt=true` is silently ignored unless `certified=true`. Lob fulfills Certified up to 59 single-sided / 118 double-sided PDF pages; over that, PostalForm routes through PostGrid and Certified is unavailable (the validate response will report the routing).
- **Pricing tiers kick in by sheet count, not page count.** Base $3.00 + $0.20/page B&W or $0.40/page color, **plus** a flat tier fee that depends on billable sheets: double-sided thresholds 12/120/200 → $5.50 / $10.88 / $22.38; single-sided thresholds halve to 6/60/100. Only the highest tier applies. Billable pages = source pages + 1 (an inserted address page on First Class/Standard). Express uses raw PDF pages (no inserted page) and a different click2mail formula. Source of truth: the Python model at `/pricing-calculator.md` mirrors the server math exactly; the checkout/validate quote is the binding price.
- **Express same-business-day cutoff is 10:00 AM Eastern.** Orders placed after the cutoff (or on weekends/federal postal holidays) reach USPS the next business day. Production + carrier handoff is documented as 1–3 business days regardless of service.
- **Cancellation has a tight window.** Once an order enters printing or carrier handoff it is generally non-cancelable and non-refundable. If the agent owner wants out, hit `support@postalform.com` immediately and reference the `order_id`. Carrier delays/loss/forwarding after USPS acceptance are USPS issues, not PostalForm issues — don't open a refund dispute for those.
- **MCP needs `mcp-session-id` echoed.** After `initialize`, the response carries `Mcp-Session-Id`. Every subsequent JSON-RPC call must include `mcp-session-id: <value>` or the server responds `400 No valid session ID provided`. Trivial to miss — verified during recon.
- **UCP can't carry every order shape.** UCP create_checkout only supports `mailpiece_type: "letter"` + PDF source + Loqate addresses (`*_address_type="Address"` only). Postcards, manual addresses, server-rendered letters, and workflow forms require the regular MCP / x402 / MPP path.
- **Markdown alternates exist for every public page.** Append `.md` to any URL (`/agents.md`, `/pricing.md`, `/send-letter-online.md`, `/delivery-times.md`, `/help/what-happens-after-you-mail.md`, etc.) to get clean markdown — much cheaper than rendering the SPA. Notable 404s among plausible slugs: `/postcards.md`, `/mcp.md`, `/flowers.md`, `/bulk-mail.md` (those features exist but only as live SPA routes or API endpoints).
- **Inertia.js + same-URL transitions.** Uploading a file or clicking through steps mutates the page component without changing `window.location`. Don't poll the URL to detect progress — `browse snapshot` the page and look for the next heading (`"Where should we send your document to?"`, `"Confirm your sender address"`, `"Choose print and delivery options"`, etc.).
- **No anti-bot wall today.** Verified `--verified --proxies` and bare sessions both load cleanly. The site is Cloudflare-fronted (`Server: cloudflare`, `Cf-Ray: ...`) but no challenges fired during recon. Don't waste budget on stealth unless you start seeing 403s.
- **Tempo & Stripe SPT are listed in the `.well-known/x402` manifest as separate payment instruments under MPP** — Tempo for crypto, Stripe SPT for card-via-Link. If your runtime doesn't speak either, fall back to x402 (USDC on Base) or the MCP draft + hosted-Stripe checkout flow.

## Expected Output

Four distinct outcome shapes (validate / paid-created / status / error). All amounts are in cents-as-float USD.

### Validate (no payment side effects)

```json
{
  "request_id": "8c1a1b58-2c8f-4f4f-9c46-2c1ac32d7a1b",
  "request_hash": "9c1835a78c5f93cb6ffba285603ee1452e718806c1852a1f05b28687c5682342",
  "order_id": null,
  "status": "validated_new_order",
  "postcard_guidelines_url": null,
  "quote": {
    "price_usd": 3.4,
    "full_price_usd": 3.4,
    "currency": "usd",
    "page_count": 1,
    "billable_page_count": 2,
    "double_sided": true,
    "color": false,
    "mail_class": "standard",
    "certified": false,
    "certified_return_receipt": false,
    "signature_required": false,
    "mailpiece_type": "letter",
    "postcard_size": null,
    "provider": "lob"
  }
}
```

### Order created (after `202 Accepted` payment retry)

```json
{
  "request_id": "8c1a1b58-2c8f-4f4f-9c46-2c1ac32d7a1b",
  "order_id": "ord_01HXY0Z…",
  "status": "paid",
  "quote": { "price_usd": 14.4, "certified": true, "certified_return_receipt": true, "...": "..." },
  "payment": {
    "protocol": "x402",
    "method": "usdc-base",
    "tx_hash": "0x…",
    "amount_usd": 14.4
  }
}
```

### Status poll (`GET /api/machine/orders/{id}` or `…/mpp/orders/{id}`)

```json
{
  "order_id": "ord_01HXY0Z…",
  "status": "in_transit",
  "payment_status": "paid",
  "mail_status": "handed_off",
  "carrier": "usps",
  "service": "first_class_certified_return_receipt",
  "tracking_number": "9407…",
  "tracking_url": "https://tools.usps.com/go/TrackConfirmAction?tLabels=9407…",
  "expected_delivery": "2026-06-02",
  "events": [
    { "at": "2026-05-28T19:42:11Z", "event": "queued" },
    { "at": "2026-05-29T14:08:22Z", "event": "printed" },
    { "at": "2026-05-29T20:31:00Z", "event": "carrier_accepted" }
  ]
}
```

### Validation error (`422` from `validate` or unpaid `create`)

```json
{
  "message": "Validation failure",
  "code": "invalid_request",
  "errors": [
    {
      "path": "pdf",
      "code": "custom",
      "message": "pdf object must be either { upload_token } or { download_url, file_id }.",
      "hint": "Prefer a canonical PDF input: { \"pdf\": { \"upload_token\": \"<token>\" } }. The other accepted formats are data URL or { download_url, file_id }.",
      "fix_examples": [
        { "pdf": { "upload_token": "upload_tok_123" } },
        { "pdf": { "download_url": "https://files.openai.com/v1/files/file_123/content", "file_id": "file_123" } },
        { "pdf": "data:application/pdf;base64,JVBERi0xLjQK..." }
      ]
    }
  ]
}
```
