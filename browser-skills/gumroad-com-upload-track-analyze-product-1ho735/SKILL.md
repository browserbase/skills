---
name: gumroad-com-upload-track-analyze-product-1ho735
title: 'Gumroad: Upload, Track & Analyze a Product'
description: >-
  End-to-end Gumroad seller workflow over the public OAuth REST API: upload a
  digital product (create + multipart file upload + publish), track its sales,
  and analyze earnings. No browser scripting required.
website: gumroad.com
category: ecommerce
tags:
  - gumroad
  - creator
  - products
  - api
  - sales
  - earnings
  - oauth
source: 'browserbase: agent-runtime 2026-06-22'
updated: '2026-06-22'
recommended_method: api
alternative_methods:
  - method: cli
    rationale: >-
      The official `gumroad` CLI (github.com/antiwork/gumroad-cli, `brew install
      antiwork/cli/gumroad`) wraps every endpoint and is explicitly built for AI
      agents. Functionally identical to the REST calls; use it when the binary
      is installable and you want one command for upload+attach+publish.
  - method: browser
    rationale: >-
      The web dashboard (gumroad.com/products/new, /customers, /analytics) is
      only needed for the one-time OAuth app + access-token creation at
      /settings/advanced, and as a manual fallback if the API is unavailable.
      The dashboard sits behind Cloudflare and a login wall, so it is slower and
      less reliable than the API for the recurring workflow.
verified: false
proxies: false
---
# Gumroad: Upload, Track & Analyze a Product

## Purpose

Run the full Gumroad seller lifecycle for a single product entirely over Gumroad's public OAuth 2.0 REST API (`https://api.gumroad.com/v2`): **upload** a digital product (create the product record, upload its file(s) via S3 multipart, optionally attach a cover/thumbnail, then publish), **track** its sales, and **analyze** revenue (per-product sales counts/totals plus an annual earnings breakdown). This is a read/write workflow — it creates and publishes a real product on the authenticated user's account — and every step has a one-line `gumroad` CLI equivalent. Browser automation is **not** required; the dashboard is only used once, by a human, to mint the access token.

## When to Use

- Programmatically publishing a digital product (ebook, course, PDF, software download) to a Gumroad store from a build pipeline or agent.
- Bulk-uploading or syncing a catalog of products and their files.
- Polling sales for a product (new orders, buyer email, license key, refunds, reviews, UTM attribution).
- Pulling an annual gross/fees/taxes/net earnings summary, or per-product `sales_count` / `sales_usd_cents`, for reporting or dashboards.
- Anywhere you'd otherwise script the Gumroad web dashboard — the API is faster, auth-gated rather than anti-bot-gated, and structurally stable.

## Workflow

**Recommended method: the REST API (plain `curl`, no dependencies) or the official `gumroad` CLI.** Everything below is doable with an access token; nothing requires driving a browser. Authenticate by sending `access_token=<TOKEN>` as a form/query param **or** an `Authorization: Bearer <TOKEN>` header on every call. The API host (`api.gumroad.com`) returns clean JSON and is **not** behind Cloudflare/anti-bot — no proxy or stealth session needed.

### One-time setup (human, in browser — done once, then reused)
1. Log in to Gumroad and go to **`https://gumroad.com/settings/advanced#application-form`** ("Settings → Advanced → Applications"). This page is login-walled (`/settings/advanced` → `302 /login?next=…` when unauthenticated).
2. Register an OAuth application, then click **"Generate access token"** to get a token scoped to your own account.
3. Choose scopes for what the agent will do: `edit_products` (create/update/upload/publish), `view_sales` (read sales + per-product sales counts), `view_tax_data` (annual earnings). `account` grants all of them. Store the token as a secret (e.g. `GUMROAD_TOKEN`).

### Step 1 — Upload the file (multipart S3 flow), if the product has a downloadable
File upload is a **four-step flow**; skip it for link-only or info products.
1. **Presign** — `POST /files/presign` with `filename` + `file_size` (bytes, ≤ 20 GB). Returns `upload_id`, `key`, a canonical `file_url`, and a `parts[]` array (one presigned URL per 100 MB chunk).
   ```
   curl https://api.gumroad.com/v2/files/presign \
     -d "access_token=$GUMROAD_TOKEN" -d "filename=course.pdf" -d "file_size=104857600" -X POST
   ```
2. **Upload each part** — `PUT` the raw bytes of each 100 MB chunk to its `presigned_url` (expires after 900 s). Capture each response's `ETag` header.
3. **Complete** — `POST /files/complete` with `upload_id`, `key`, and `parts[][part_number]` + `parts[][etag]`. Returns the final canonical `file_url`. **Call this exactly once** — `upload_id` is single-use; if you lose the response, abort and restart with a fresh presign.
4. (On failure) **Abort** — `POST /files/abort` with `upload_id` + `key`; loop while `status: "accepted"`, stop on `already_gone`.

CLI shortcut for the whole flow: `gumroad files upload ./course.pdf` (or fold it into create with `--file`, below).

### Step 2 — Create the product (draft)
`POST /products`. Created **unpublished** (`published: false`). Required: `name`, `price` (in the smallest currency unit, e.g. cents). Useful optional params: `native_type` (`digital` default / `course` / `ebook` / `membership` / `bundle` / `coffee` / `call` / `commission` — **cannot be changed later**), `description` (HTML), `price_currency_type` (ISO code), `category` or `taxonomy_id` (mutually exclusive; full path from `GET /v2/categories`, e.g. `design/ui-and-web/figma`), `tags[]`, `customizable_price`+`suggested_price_cents` (pay-what-you-want), `max_purchase_count`, `custom_permalink`, and `files[][url]=<canonical file_url from Step 1>` to attach the upload in the same call.
```
curl https://api.gumroad.com/v2/products \
  -d "access_token=$GUMROAD_TOKEN" -d "native_type=digital" -d "name=My Product" \
  -d "price=500" -d "price_currency_type=usd" \
  -d "files[][url]=<file_url>" -X POST
```
CLI: `gumroad products create --type digital --name "My Product" --price 5.00 --file ./course.pdf` (uploads + attaches + creates in one command). Capture `product.id` (a Base64-ish external ID like `A-m3CDDC5dlrSdKZp0RFhA==`) from the response.

### Step 3 — (Optional) cover / thumbnail
- `POST /products/:id/covers` with a publicly reachable `url` (image/video/YouTube/Vimeo; server fetches and copies it — pre-signed/private URLs are rejected).
- `POST /products/:id/thumbnail` for the square thumbnail.

### Step 4 — Publish
`PUT /products/:id/enable` flips `published` to `true` and makes the product live. (`PUT /products/:id/disable` unpublishes.) Edit later with `PUT /products/:id` — note `files`, `tags`, and `rich_content` are **full replacements** (see gotchas).

### Step 5 — Track sales
`GET /sales` (scope `view_sales`). Filter with `after`/`before` (YYYY-MM-DD), `product_id`, `email`, `order_id`, `name`, `license_key`. Paginate by following `next_page_key` → pass it back as `page_key`. Each sale object includes buyer email, `price`/`gumroad_fee`/`tax_cents`, `created_at`, `product_id`, refund/chargeback/dispute flags, `license_key`, `review`/`product_rating`, UTM attribution, and subscription state. Single sale: `GET /sales/:id`.
```
curl "https://api.gumroad.com/v2/sales?access_token=$GUMROAD_TOKEN&product_id=<id>&after=2026-01-01"
```
CLI: `gumroad sales list --all --product <id> --after 2026-01-01`.

### Step 6 — Analyze
- **Per-product rollups**: `GET /products/:id` returns `sales_count` and `sales_usd_cents` (requires `view_sales`/`account`). `GET /products` lists all products (but **omits** the per-product `files` array — fetch a single product to see files).
- **Annual earnings**: `GET /earnings?year=YYYY` (scope `view_tax_data`) returns `gross_cents`, `fees_cents`, `taxes_cents`, `affiliate_credit_cents`, `net_cents` (all USD). `year` must be within account-creation year … previous calendar year, else `404`.
- **Payouts**: `GET /payouts`, `GET /payouts/:id`, `GET /payouts/upcoming` (scope `view_payouts`).

### Browser fallback
Only if the API is unavailable: log in and use `gumroad.com/products/new` (create/upload form), `gumroad.com/products` (catalog), `gumroad.com/customers` (sales), and `gumroad.com/dashboard`/analytics. These pages are a JS-rendered Inertia/React app behind Cloudflare and a login wall, so prefer remote sessions with `--proxies` and expect to authenticate. There is **no product-creation surface that avoids login** — the dashboard route is strictly a backup to the token-authenticated API.

## Site-Specific Gotchas

- **The API host is not anti-bot-gated; the marketing/dashboard host is.** `api.gumroad.com/v2/*` returns clean JSON `401`s to unauthenticated, un-proxied requests (verified for `/products`, `/user`, `/sales`) — no Cloudflare challenge, so API calls need **no proxy and no stealth browser**. By contrast `gumroad.com/*` (docs, dashboard) is served through Cloudflare; the homepage probe flagged `likelyNeedsProxies: true`. Don't conflate the two hosts when deciding on session config.
- **Token creation is the only mandatory browser step, and it's login-walled.** `/settings/advanced` 302-redirects to `/login?next=%2Fsettings%2Fadvanced`. There is no API to mint your own token — a human must generate it once in the dashboard, then the agent reuses it.
- **`POST /products` creates a DRAFT.** The product is `published: false` until you call `PUT /products/:id/enable`. Forgetting Step 4 leaves an invisible product.
- **`native_type` is immutable after creation.** Pick `digital`/`course`/`ebook`/`membership`/`bundle`/etc. correctly the first time; it cannot be changed via `PUT`.
- **`price` is in the smallest currency unit (cents).** `price=500` = $5.00. The `gumroad` CLI takes major units (`--price 5.00`) and converts — don't mix the two conventions.
- **File upload is single-use and lossy on the read side.** `/files/complete` accepts an `upload_id` exactly once — never retry it; restart from `/files/presign` instead. Presigned part URLs expire after 900 s. **Save the canonical `file_url` yourself** — `GET /v2/products/:id` returns a time-limited *signed download* URL, not the canonical one, so you can't recover the attachable URL from a read. Renaming a file's display name asynchronously rewrites its canonical URL.
- **`PUT /products/:id` replaces whole collections.** Sending `files`, `tags`, or `rich_content` overwrites the entire set — any file you omit is **deleted**. To keep existing files, resubmit each one's `id` *and* its current canonical `file_url`; entries without a `url` are dropped (and the underlying file removed).
- **`GET /products` (list) omits per-product `files`.** Its `file_info` is legacy and returns `{}` for products with 0 or 2+ files. Fetch `GET /products/:id` to read the real `files` array.
- **`category` and `taxonomy_id` are mutually exclusive** — send one or the other, never both. Get valid values from `GET /v2/categories`.
- **`view_sales` scope gates the money fields.** `sales_count`, `sales_usd_cents`, and `custom_delivery_url` only appear on product objects when the token carries `view_sales` (or `account`); `/earnings` needs `view_tax_data`. A token with only `edit_products` can upload/publish but will see no revenue data.
- **`/earnings` year range is bounded.** Valid years run from the account-creation year through the *previous* calendar year; the current year and out-of-range years `404`. (As of 2026-06-22, request `year=2025` or earlier.)
- **`gum.co` is the short-link domain; `app.gumroad.com` 301-redirects to `gumroad.com`.** Use `gumroad.com` for the dashboard/docs and `api.gumroad.com/v2` for the API.
- **Docs-page scraping caveat (from a browse-trace run):** `gumroad.com/api` is a fully JS-rendered Inertia app — `browse snapshot` returns nothing useful and `browse get text body` truncates. To extract a section, navigate to its anchor (e.g. `gumroad.com/api#files`) and `browse get text #files` / `#sales` / `#earnings`. You shouldn't need to scrape it at all — the endpoint map is captured in this skill.

## Expected Output

`POST /files/presign` (Step 1):
```json
{
  "success": true,
  "upload_id": "ibZBv_75gd9o.uPYmGbJ5JjxqK4_VsP3...",
  "key": "attachments/A-m3CDDC5dlrSdKZp0RFhA==/9f2c1b7d6e4a/original/course.pdf",
  "file_url": "https://gumroad-specials.s3.amazonaws.com/attachments/A-m3CDDC5dlrSdKZp0RFhA==/9f2c1b7d6e4a/original/course.pdf",
  "parts": [{ "part_number": 1, "presigned_url": "https://gumroad-specials.s3.amazonaws.com/...&partNumber=1&uploadId=..." }]
}
```

`POST /products` then `PUT /products/:id/enable` (Steps 2 & 4):
```json
{
  "success": true,
  "product": {
    "id": "A-m3CDDC5dlrSdKZp0RFhA==",
    "name": "My Product",
    "price": 500,
    "currency": "usd",
    "published": true,
    "short_url": "https://gum.co/abcde",
    "category": "design/ui-and-web/figma",
    "category_label": "Figma",
    "files": [{ "id": "f_123", "name": "course", "filetype": "pdf", "size": 104857600, "url": "https://...signed-download..." }],
    "covers": [],
    "sales_count": 0,
    "sales_usd_cents": 0
  }
}
```

`GET /sales` (Step 5 — track):
```json
{
  "success": true,
  "next_page_key": "20230119081040000000-123456",
  "next_page_url": "/v2/sales?page_key=20230119081040000000-123456",
  "sales": [
    {
      "id": "FO8TXN-dvxYabdavG97Y-Q==",
      "email": "buyer@example.com",
      "created_at": "2026-06-20T14:03:11Z",
      "product_id": "A-m3CDDC5dlrSdKZp0RFhA==",
      "product_name": "My Product",
      "price": 500,
      "gumroad_fee": 53,
      "tax_cents": 0,
      "currency_symbol": "$",
      "formatted_total_price": "$5",
      "refunded": false,
      "chargedback": false,
      "license_key": "83DB262A-C19D3B06-A5235A6B-8C079166",
      "product_rating": 5,
      "referrer": "direct"
    }
  ]
}
```

`GET /earnings?year=2025` (Step 6 — analyze):
```json
{
  "success": true,
  "year": 2025,
  "currency": "usd",
  "gross_cents": 123456,
  "fees_cents": 12345,
  "taxes_cents": 678,
  "affiliate_credit_cents": 0,
  "net_cents": 110433
}
```

Error shape (e.g. missing/invalid token → HTTP 401, or bad params → 400/402):
```json
{ "success": false, "message": "The product could not be found." }
```
