---
name: gopay-kg-generate-payment-link-tdj3me
title: Generate GoPay Payment Link
description: >-
  Create a hosted payment link on GoPay.kg (Kyrgyzstan ELQR gateway) via a
  signed HMAC-SHA512 POST to /v1/payments. Returns checkout_url, QR data, and
  per-bank-app deep links for MBank, MegaPay, Optima24, and 17+ other partner
  apps.
website: gopay.kg
category: payments
tags:
  - payments
  - kyrgyzstan
  - elqr
  - qr-code
  - fintech
  - api
  - hmac
source: 'browserbase: agent-runtime 2026-05-21'
updated: '2026-05-21'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      Useful only for a logged-in human operator creating a one-off invoice via
      the merchant.gopay.kg dashboard. Strictly slower and less reliable than
      the API, and the dashboard form is itself a thin client over the same POST
      /v1/payments endpoint.
verified: true
proxies: true
---
# Generate Payment Link (GoPay.kg)

## Purpose

Create a hosted payment link on GoPay (Kyrgyzstan, EMVCO/ELQR-based gateway built on top of the Kyrgyzstan Interbank QR system) that a merchant can send to a buyer via WhatsApp / SMS / email. The buyer opens the link, pays through any of 20+ partner banking apps (MBank, MegaPay, Optima24, O!Деньги, KICB, Bakai, etc.), and the merchant receives a webhook with the result. This skill is **read/write** — it creates a real payment record server-side — but does **not** move funds itself (funds only move when the buyer completes the payment in their bank app). The skill returns the `checkout_url` (the payment link), the QR-code image URL, the raw EMVCO QR data, and per-app deep links.

## When to Use

- Merchant wants a short URL to bill a single customer (invoice, custom order, food delivery, freelance work).
- Webshop / SaaS checkout flow needs a one-off payment intent with a specific `order_id` and amount.
- Integrating GoPay as a payment method into an existing CRM, ERP, or storefront where you would otherwise embed Stripe/Tilopay.
- Generating a sharable QR for in-person sale at a counter (use `qr_url` PNG or `qr_data` for your own renderer).
- Testing an integration end-to-end (set `testing_mode: true` to have GoPay auto-commit the payment without a real bank transaction).

Do **not** use this skill if the customer needs a permanent QR (e.g. for a printed sticker at a cashier) — that is a separate endpoint (`POST /v1/static-qr/`), not covered here.

## Workflow

**Optimal path: direct API call to `POST https://api.gopay.kg/v1/payments`.** GoPay is an API-first product — the "create payment" form in the merchant dashboard at https://merchant.gopay.kg is itself just a thin client over this endpoint. Browser-driving the dashboard to fill that form would (a) require persistent merchant credentials in a headless browser session, (b) be slower and less reliable than a signed HTTP call, and (c) still return the exact same `checkout_url` you get from the API. There is no faster or more honest path than the API.

### Step 1 — Obtain merchant credentials (one-time, manual; cannot be automated)

You need an `api_key` + `secret_key` pair, issued in the merchant dashboard. There is **no programmatic onboarding** — a merchant has to:

1. Submit the "Оставьте заявку" lead form at https://www.gopay.kg/ (name, phone, business).
2. Sign a contract with «ОсОО Го Пей» and Bakai Bank (the acquiring partner).
3. Receive login credentials for https://merchant.gopay.kg.
4. Open **Developer → API Keys** in the dashboard and copy the `GoPay-Api-Key` (public) and `GoPay-Secret-Key` (private, server-side only — never ship to a client).
5. (Recommended) On the same screen, open **Developer → Webhooks** and configure an `events_url` endpoint so the merchant's backend receives `payment.committed` / `payment.failed` notifications. The legacy `callback_url` mechanism still works but is documented as deprecated.

Store the secret key like any other server credential (env var, secret manager). Treat the API key as semi-public — it is logged in support tickets.

### Step 2 — Sign and POST the request

The signing scheme is **HMAC-SHA512 in upper-case hex**, computed over a three-line payload:

```
payload = nonce + "\n" + request_body_json + "\n"
signature = HMAC-SHA512(payload, secret_key).hexdigest().upper()
```

Three headers are required on every request:

| Header | Value |
|---|---|
| `GoPay-Api-Key` | the public key from the dashboard |
| `GoPay-Nonce` | a fresh random string per request, ≤ 32 chars (UUID-hex is fine) |
| `GoPay-Signature` | the upper-case hex HMAC-SHA512 digest from above |

The body must be `Content-Type: application/json`. The exact JSON string you sign **must** be the exact bytes you send — do not pretty-print one and serialize another, or the signature will not match (server error code `4001`).

**Python reference implementation (copy verbatim):**

```python
import hmac, hashlib, json, uuid, requests

API_KEY    = "..."   # from merchant dashboard
SECRET_KEY = "..."   # from merchant dashboard

data    = {
    "order_id": "ORDER-20260521-001",       # ≤ 32 chars, unique per merchant
    "amount": "1500.00",                     # decimal string, 0.01 – 999999.99
    "description": "Order #001",             # optional, ≤ 255 chars
    "lifetime": 3600,                        # optional, seconds; 300–86400; default 3600
    "callback_url": "https://example.com/gopay/webhook",  # optional, HTTPS only
    "success_url":  "https://example.com/paid",           # optional
    "failure_url":  "https://example.com/failed",         # optional
    # "testing_mode": True,                  # optional; auto-commits without real bank op
}
nonce    = uuid.uuid4().hex                  # 32 hex chars, OK
data_str = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
payload  = nonce + "\n" + data_str + "\n"
signature = hmac.new(
    SECRET_KEY.encode("utf-8"),
    msg=payload.encode("utf-8"),
    digestmod=hashlib.sha512,
).hexdigest().upper()

r = requests.post(
    "https://api.gopay.kg/v1/payments",
    headers={
        "Content-Type":    "application/json",
        "GoPay-Api-Key":   API_KEY,
        "GoPay-Nonce":     nonce,
        "GoPay-Signature": signature,
    },
    data=data_str.encode("utf-8"),           # send the exact bytes that were signed
    timeout=30,
)
result = r.json()
assert result["status"] == "OK", result
payment_link = result["data"]["checkout_url"]    # ← THIS is the payment link
```

**cURL equivalent (for ad-hoc / shell):**

```bash
API_KEY="..."
SECRET_KEY="..."
NONCE=$(openssl rand -hex 16)
DATA='{"order_id":"ORDER-20260521-001","amount":"1500.00"}'
PAYLOAD=$(printf '%s\n%s\n' "$NONCE" "$DATA")
SIGNATURE=$(printf '%s' "$PAYLOAD" \
  | openssl dgst -sha512 -hmac "$SECRET_KEY" \
  | awk '{print toupper($2)}')

curl -sS -X POST https://api.gopay.kg/v1/payments \
  -H 'Content-Type: application/json' \
  -H "GoPay-Api-Key: $API_KEY" \
  -H "GoPay-Nonce: $NONCE" \
  -H "GoPay-Signature: $SIGNATURE" \
  -d "$DATA"
```

### Step 3 — Hand the `checkout_url` to the buyer

The 200-OK response (HTTP status is **always 200** — read the body `status` field) contains a `data` object with everything you need:

- `data.checkout_url` — the hosted payment page (`https://pay.gopay.kg/p/<payment_id>/`). **This is the payment link.** Send it via WhatsApp / SMS / email, or 302-redirect the buyer to it from your own checkout.
- `data.qr_url` — PNG image of the EMVCO QR code (render in an `<img>` if you want a desktop / in-store flow).
- `data.qr_data` — raw EMVCO payload (`https://pay.payqr.kg#00020101...`) for self-rendering with `qrcode` libs.
- `data.app_links` — a map of `{bank_code: deeplink}` (e.g. `{"mbank": "mbank://elqr?data=..."}`). Use these on mobile to launch the buyer directly into a specific bank app, bypassing the QR scan step.
- `data.payment_id` — GoPay's ID; persist it alongside your `order_id` for later status queries.
- `data.expires_at` — when the link goes stale (CREATED → EXPIRED).

### Step 4 — Confirm settlement (poll or webhook)

The buyer pays asynchronously. Two ways to learn the outcome:

- **Webhook (recommended).** Configure `events_url` in the dashboard; GoPay POSTs a signed `payment.committed` / `payment.failed` event. Verify the `gopay-signature` header using the same HMAC-SHA512 scheme with your webhook secret (separate from the API secret, also in the dashboard).
- **Polling fallback.** `POST https://api.gopay.kg/v1/payments/query` with `{"payment_id": "..."}` or `{"order_id": "..."}` returns the current status (`CREATED` / `COMMITTED` / `FAILED` / `EXPIRED`). Same HMAC signing.

### Browser fallback

Only useful for one-off manual generation by a human operator who is already logged in (e.g. a sales rep creating an invoice on the fly):

1. Open https://merchant.gopay.kg/ and sign in (email + password; "Forgot Password" link is present).
2. Navigate to **Payments → New Payment** (Russian: «Создать платёж»).
3. Fill the form: `Сумма` (amount in KGS), `Описание` (description), `Время жизни` (lifetime — radio with three presets: 15 min / 1 hour / 24 h).
4. Click `Создать платёж`. The dashboard returns the same `checkout_url` and a QR preview — copy it from the page.

This fallback is strictly worse than the API for any repeated or programmatic use: it requires real credentials in a stealth browser session, ELQR-specific captcha could be added at any time, and the dashboard UI is Russian-only with no English locale option observed on the login page (English label "Sign In to GoPay" appears, but inner pages render Russian).

## Site-Specific Gotchas

- **No anti-bot wall on the API itself.** `api.gopay.kg` is served behind Vercel; there is no Cloudflare/Akamai challenge, no rate-limit gate observed for well-signed requests. The marketing site (`www.gopay.kg`, Next.js on Vercel) and docs portal (`doc.gopay.kg`, Scalar + gunicorn) are also bare-friendly. Stealth / residential proxies are **not** required for any HTTP call in this skill.
- **`pay.gopay.kg` is geo-restricted / ELQR-fenced.** Fetching `https://pay.gopay.kg/` from a US datacenter IP returns `ERR_TUNNEL_CONNECTION_FAILED` even via Browserbase residential proxies, and `GET /p/<random_id>/` returned `500 Internal Server Error`. Buyer-side rendering happens inside Kyrgyzstan banking apps that fetch over local mobile networks, so an offshore agent cannot meaningfully verify the buyer flow end-to-end. **Trust the `checkout_url` returned by the API**; do not assert HTTP 200 on a HEAD probe of it.
- **HTTP status is always 200 on the API.** Even errors come back as `{"status": "FAIL", "code": "4001", "error_message": "..."}` with HTTP 200. Always check the body `status` field, never `response.status_code`.
- **`order_id` must be unique per merchant.** Re-submitting the same `order_id` returns `code: "4005"` (Дублирующийся order_id). Generate a fresh ID — `ORDER-{timestamp}-{nonce6}` or a UUID — for every link.
- **Sign the exact bytes you send.** The most common signing bug is computing the signature over a pretty-printed JSON string but sending a compacted one (or vice versa). Use a single canonical `data_str` variable: feed it both into the HMAC input and into the request body, byte-for-byte. Compact separators (`(",", ":")`) match GoPay's reference Python sample.
- **`nonce` ≤ 32 chars.** UUID4 hex (32 chars exactly) is fine; UUID4 with hyphens (36 chars) is **not**. Use `uuid.uuid4().hex` in Python or `crypto.randomBytes(16).toString('hex')` in Node.
- **`callback_url` is deprecated — prefer `events_url`.** The docs explicitly warn that `callback_url` is the legacy mechanism. New integrations should configure `events_url` in the dashboard (Developer → Webhooks) instead; it gets typed events (`payment.committed`, `payment.failed`, future event types), UTC `Z`-suffixed timestamps, a delivery journal, and a "Send test" button. The `callback_url` field on `POST /v1/payments` still works for back-compat.
- **`lifetime` clamps.** Minimum 300 seconds (5 min), maximum 86400 (24 h), default 3600 (1 h). Values outside this range return `code: "4004"` (Неверный параметр запроса).
- **`amount` is a string, not a number.** `"150.00"` (regex: `^-?\d{0,8}(?:\.\d{0,2})?$`). Passing `150` (int) or `150.00` (float) will not validate. Range 0.01 – 999999.99.
- **`testing_mode: true` only fakes the bank step.** A test payment still consumes an `order_id` and produces a real `payment_id` in the merchant's history. GoPay auto-transitions it `CREATED → COMMITTED` and fires the webhook so you can verify end-to-end plumbing. Do not use a production `order_id` for test runs.
- **`buyer` triggers fiscal receipt delivery.** If you set `buyer.email` or `buyer.phone`, GoPay forwards it to ГНС (Kyrgyz tax authority) as ФФД tag 1008 and the tax service sends an electronic receipt directly to the buyer. Required by §6 of the Kyrgyz "Rules for operation of online cash registers". Omit `buyer` if you handle receipts yourself.
- **`items` is required for goods merchants under §17.3.** If the merchant sells physical goods or marked goods (§17.4), you must pass a per-line `items` array; `sum(price * quantity)` must equal `amount`. Service / subscription merchants can omit `items` (the back-end `receipt_builder` synthesizes a single line from merchant config).
- **Documentation is on a Scalar-rendered Django page.** The OpenAPI source is at https://doc.gopay.kg/v1/schema/ — it serves as base64-encoded YAML (not JSON). To parse it, fetch and `base64 -d` first. The interactive console at https://doc.gopay.kg/v1/ injects HMAC headers client-side using a floating "🔑 HMAC Signing" panel that stores keys in `localStorage` under `gopay-doc-api-key` and `gopay-doc-secret-key` — handy if you want to test endpoints in the browser without writing a script.
- **No publicly observable rate limit.** The docs do not document one; behavior under burst load was not probed (would require real credentials and would consume a real merchant's quota).
- **There is no payment-link cancellation endpoint.** Once created, a link can only be voided by waiting for `lifetime` to expire (transitions to `EXPIRED`). If you need to revoke a link sooner, generate a new one with a longer `lifetime` and re-send.

## Expected Output

The skill returns the parsed `data` block of the successful `POST /v1/payments` response. Outcomes branch into one of the following shapes:

### Success (`status: "OK"`, `code: "0000"`)

```json
{
  "status": "OK",
  "code": "0000",
  "data": {
    "payment_id": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
    "order_id":   "ORDER-20260521-001",
    "amount":     "1500.00",
    "status":     "CREATED",
    "description": "Order #001",
    "checkout_url": "https://pay.gopay.kg/p/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4/",
    "qr_url":       "https://pay.gopay.kg/p/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4/qr/",
    "qr_data":      "https://pay.payqr.kg#00020101...",
    "app_links": {
      "mbank":   "mbank://elqr?data=https%3A%2F%2Fpay.payqr.kg%23...",
      "megapay": "megapay://elqr?data=https%3A%2F%2Fpay.payqr.kg%23...",
      "optima":  "optima24://elqr?data=https%3A%2F%2Fpay.payqr.kg%23..."
    },
    "callback_url": "https://example.com/gopay/webhook",
    "success_url":  "https://example.com/paid",
    "failure_url":  "https://example.com/failed",
    "created_at":   "2026-05-21T16:00:00Z",
    "expires_at":   "2026-05-21T17:00:00Z",
    "committed_at": null,
    "bank_op_date": null
  }
}
```

### Success — testing mode (`testing_mode: true`)

Identical shape, but the back-end immediately transitions the payment and fires the webhook. A follow-up `POST /v1/payments/query` will return `status: "COMMITTED"` with a populated `committed_at`.

### Failure — bad signature

```json
{ "status": "FAIL", "code": "4001", "error_message": "Invalid signature" }
```

### Failure — missing required header

```json
{ "status": "FAIL", "code": "4002", "error_message": "Missing required header: GoPay-Nonce" }
```

### Failure — duplicate `order_id`

```json
{ "status": "FAIL", "code": "4005", "error_message": "Duplicate order_id" }
```

### Failure — invalid parameter (e.g. `amount` out of range, `lifetime < 300`, malformed URL)

```json
{ "status": "FAIL", "code": "4004", "error_message": "Invalid request parameter: amount" }
```

### Failure — server error

```json
{ "status": "FAIL", "code": "5001", "error_message": "Internal server error" }
```

Branch on `code`: `"0000"` → succeed (return `data.checkout_url`); `"4001"`/`"4002"` → fix the request signing and retry; `"4004"` → validate input and surface to caller; `"4005"` → generate a new `order_id` and retry; `"5001"` → exponential-backoff retry up to ~3 attempts.
