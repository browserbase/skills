---
name: poshmark-com-search-listings-vrg59r
title: Poshmark Search Listings
description: >-
  Search Poshmark for fashion / lifestyle listings via the public /vm-rest/posts
  JSON endpoint (free-text + sort + pagination) with a browser fallback on
  /search?... for strict facet filters. Returns each match with listing id,
  title, price (raw + formatted), brand, size, color, department/category,
  inventory status (available/sold), seller, images, and engagement counts.
  Read-only.
website: poshmark.com
category: marketplace
tags:
  - marketplace
  - fashion
  - resale
  - listings
  - search
  - read-only
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: api
alternative_methods: []
verified: true
proxies: true
---
# Poshmark Search Listings

## Purpose

Search Poshmark for listings matching a query and return each match as structured JSON — listing id, title, price (raw + formatted + currency), original retail, brand, size, color(s), department/category breadcrumb, condition (NWT), inventory status (`available` / `sold_out` / `reserved` / `not_for_sale`), seller (`creator_username` + display handle + full name + posh-ambassador flag), like/share/comment counts, full image-URL set (cover + up to 16 additional photos), discount/shipping flags, canonical listing URL, and the page-wide result total. Read-only — never click Buy Now, Add to Bundle, Make Offer, Like, Follow, Share, or Sign In.

## When to Use

- Free-text Poshmark queries (`"Madewell jeans size 28"`, `"vintage Coach bag"`).
- Brand/size/department-scoped product searches with sort + pagination.
- Single-listing lookup by listing ID (e.g. for price-watching or comp pricing).
- Closet-scoped enumeration of a specific seller's listings (`/closet/{username}`).
- Bulk listing-data ingestion where the public web `/search` page is too slow / blocked.

## Workflow

Poshmark exposes a public mobile-API endpoint at `https://poshmark.com/vm-rest/posts` that backs the same data the web search UI hydrates from. It is undocumented but **un-authenticated, un-cookied, and proxy-stable through Browserbase Fetch + residential proxies** — verified during iteration. Lead with the JSON API; fall back to the browser-driven `/search?...` page **only when filter facets the API doesn't recognise are required, or when the rare Akamai 403 surfaces on the proxy IP**. The browser path is roughly 50–100× more expensive (full Vue SSR page is >1 MB) and offers no extra fields.

### 1. Pick the search endpoint

| Use-case | Endpoint |
|---|---|
| Keyword / brand / department search | `GET /vm-rest/posts?request=<URL-encoded JSON>` |
| Single listing detail by ID | `GET /vm-rest/posts/{listingId}` |
| All listings in a specific closet | `GET /vm-rest/users/{username}/posts?count=N&offset=N` |
| Closet owner / seller profile + badges | `GET /vm-rest/users/{username}` |

All four are publicly accessible. Use `browse cloud fetch <url> --allow-redirects --proxies` (Browserbase Fetch API with residential proxies) for cheap, scriptable access. The Fetch API has a **1 MB response cap**; the JSON endpoints fit easily, but a single search response with `count > ~250` may cross that ceiling — keep `count` ≤ 48 (matches the web UI's page size) to stay safe and to mirror the web client.

### 2. Build the `request` JSON envelope (search)

`/vm-rest/posts` takes a single `request` query-string parameter whose value is a **URL-encoded JSON object**. Verified minimum shape:

```json
{ "query": "madewell jeans", "count": 48, "experience": "all" }
```

| Field | Type | Notes |
|---|---|---|
| `query` | string | Free-text keywords. Poshmark's matcher includes brand, title and description terms (a `query=madewell` search returns ~100% Madewell-branded items even without an explicit brand filter — verified). Empty string is accepted. |
| `count` | **integer** | Page size. Must be a number; sending `"2"` as a string returns `ValidationError 400`. Web UI uses 48. |
| `experience` | string | Required by the endpoint. `"all"` is the only value verified. Omitting it returns generic `InternalError 500 "Something went wrong!"`. |
| `sort_by` | string | Optional. Verified values: `price_asc`, `price_desc`, `best_match`, `relevance`. Default (omit) = `just_in`. **Do not send** `just_shared` or `most_popular` — they return `ValidationError 400`; the correct enum names for those two are not currently mapped (when you need them, fall back to the browser flow on `/search?sort_by=just_shared`). |
| `max_id` | string | Pagination cursor. Pass the `more.next_max_id` from the previous response verbatim (it's a prefixed `ENC_…` base64 token — Poshmark treats it opaquely; do not decode/edit). |

**Filter facets — verification status.** The web UI sends filters via URL params (`brand[]=Madewell&color[]=Black&size[]=US%2028&availability=available&condition=closet_nwt&department=Women&category=Jeans&sub_category=Mini`). When those same names are placed into the `request` JSON envelope sent to `/vm-rest/posts`, the API **silently ignores them** — the response's `selected_catalog` field stays `{department:[], category_v2:[], category_feature:[]}` and the returned items are not facet-filtered. Verified on `brand`, `color`, `size`, `department`, `category`, `sub_category`, `price`, `condition`, `availability`, `shipping_discount`, `authenticated`, `seller_program`, `boutique`, and the nested-object variants. The internal facet-filter shape used by Poshmark's web client (likely a transform layer) is **not currently mapped**.

**Two reliable workarounds:**

1. **Encode brand / category / size directly into the `query` string.** Verified: `query: "Madewell jeans size 28"` returns nearly-pure Madewell denim. This is what most consumers of this skill should do — Poshmark's matcher is good at it.
2. **For strict facet filters that must be exact (e.g. exclude-sold, NWT-only, Boutique-only),** use the browser fallback below: open the public `/search?query=...&brand[]=...&condition=closet_nwt&availability=available` URL in a stealth+proxies Browserbase session, then either (a) read the **same `/vm-rest/posts` XHR** the page itself fires (the auth-less request shape the web client constructs has the correct facet encoding for the server — capture it with `browse network on` and replay), or (b) scrape the rendered listing tiles from the DOM.

### 3. Fire the request

```bash
REQ='{"query":"madewell jeans","count":48,"experience":"all","sort_by":"price_asc"}'
URL="https://poshmark.com/vm-rest/posts?request=$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "$REQ")"
browse cloud fetch "$URL" --allow-redirects --proxies --output page1.json
```

Response is a JSON object with these top-level keys:

```
data[]                — listing items (see field map in step 4)
more                  — { total: 5000, next_max_id: "ENC_...", page_group_id, is_next_max_id_present: true|false }
posts_match_types     — { "lexical.exact": <integer> }   match-quality breakdown
suggested_filters     — chips the UI would render
selected_catalog      — echo of accepted facet filters (almost always empty — see step 2)
colorToHexMap         — Poshmark's 16-color enum + hex
colorToDisplayMap     — display names
query_hash_id         — cache key
trace_id              — Poshmark-side request id for debugging
```

`more.total` is **capped at 5000** for every query — this is Poshmark's hard search-depth limit, not an actual count of matches. Treat it as "5,000+" when displayed to a user.

### 4. Extract each item

Each entry of `data[]` is a flat object — no positional decoding required. Pull these fields:

| Output field | Source path |
|---|---|
| `listing_id` | `id` (24-char Mongo ObjectId hex) |
| `title` | `title` |
| `price_usd` | `price` (integer dollars) — also `price_amount: { val: "17.0", currency_code: "USD", currency_symbol: "$" }` |
| `original_price_usd` | `original_price` / `original_price_amount` (retail; may equal `price`) |
| `brand` | `brand` (display string) — also `brand_obj: { id, canonical_name, slug }` (`slug` uses `Under_scores` for the public `/brand/{slug}` URL) |
| `size` | `size` (display) — also `size_obj.size_system` ('us', 'eu', 'jpn', 'plus', etc.) and `size_obj.display_with_size_system` ('US XXL') |
| `colors` | `colors[]` array of `{ name, rgb, message_id }` (may be empty — sellers can leave color unset) |
| `department` | `department.display` (e.g. "Women") + `.slug` + `.id` |
| `category` | `category_v2.display` (e.g. "Dresses") — preferred. (`category` is a legacy free-form string like "Dresses & Skirts" — keep both if needed.) |
| `category_features` | `category_features[]` — leaf subcategory tags ("Mini", "Wedding", etc.) when set |
| `cover_image` | `cover_shot.url` (CloudFront URL — absolute) — also `url_small` / `url_large` / `url_webp` |
| `images` | `pictures[]` — same structure as `cover_shot`; up to 16 entries |
| `inventory_status` | `inventory.status` — values seen: `"available"`, `"sold_out"`, `"reserved"`, `"not_for_sale"` |
| `nwt` | `inventory.size_quantities[].condition === 'nwt'` (also reflected in top-level `condition === 'nwt'` on the single-listing endpoint) |
| `posh_authenticate` | top-level `posh_pass_eligible` (boolean) |
| `shipping_discount` | `shipping_discount_type` (string code; `null` when no discount) |
| `seller_username` | `creator_username` |
| `seller_display_name` | `creator_display_handle` + `creator_full_name` |
| `seller_picture` | `creator_picture_url` |
| `seller_badge` | derive from `/vm-rest/users/{username}` (the search response does not embed posh-ambassador / suggested-user / boutique badges — see step 5) |
| `like_count` | `like_count` (also `aggregates.likes`) |
| `share_count` | `share_count` (also `aggregates.shares`) |
| `comment_count` | `comment_count` (also `aggregates.comments`) |
| `created_at` | `created_at` (ISO-8601 with `-07:00` Poshmark-HQ offset) |
| `first_published_at` | `first_published_at` |
| `status_changed_at` | `status_changed_at` (when item became sold / unavailable) |
| `match_type` | `search_tracking_info` — JSON-encoded string `{ "match_type": "chip" | "lexical.exact" | ... }` |
| `canonical_url` | `https://poshmark.com/listing/{slugified-title}-{id}` — Poshmark forgives any slug and 301s based on `{id}`; safest to just emit `https://poshmark.com/listing/x-{id}` |

Page-wide:
- `result_count_capped`: `more.total` (capped at 5000)
- `match_breakdown`: `posts_match_types` (e.g. `{ "lexical.exact": 100 }`)

### 5. Enrich with seller-badge info (optional, one extra request per distinct seller)

The search response carries seller username + full name + avatar but **does not include badge flags** (Posh Ambassador, Posh Ambassador II, Suggested User, Boutique). If the user requires them, do one batched lookup per distinct `creator_username` via `GET /vm-rest/users/{username}`:

```bash
browse cloud fetch "https://poshmark.com/vm-rest/users/$USERNAME" --proxies --output u.json
```

Verified fields on that response: `is_posh_ambassador`, `is_posh_ambassador_ii`, `is_suggested_user`, `is_reseller` (Boutique sellers — Poshmark's term is "Boutique"), `closet_rating` (decimal stars 0.0–5.0), `closet_rating_count`, `display_handle`, `first_name`/`last_name`. Cache aggressively — sellers change rarely.

### 6. Paginate

```bash
NEXT=$(node -e 'console.log(JSON.parse(require("fs").readFileSync("page1.json","utf8")).more.next_max_id)')
REQ='{"query":"madewell jeans","count":48,"experience":"all","sort_by":"price_asc","max_id":"'$NEXT'"}'
# ...fetch page 2...
```

Stop when `more.is_next_max_id_present === false`, when `more.next_max_id` is empty, or when you've crossed `more.total` (capped at 5000). Each page returns disjoint items — verified across page1/page2.

### 7. Input-shape branches

| Input | Path |
|---|---|
| Full `https://poshmark.com/search?…` URL | Either (a) parse `query`, `sort_by`, `availability`, and any `brand[]=X`, `size[]=X`, `color[]=X` filters out of the query-string and rebuild the JSON envelope (filter facets are best-effort — see step 2); or (b) just pass through to the browser fallback. |
| Free-form keyword string | Step 2: `query: "<string>"`. |
| Keyword + department | Encode the department slug into the query (`"dress women"` works almost as well as a strict facet); use the browser fallback when an exact department filter is critical. |
| Listing-ID list | For each `id`, `GET /vm-rest/posts/{id}` (single-listing endpoint — top-level item, no `data` wrapper). |
| Closet URL `/closet/{username}` | `GET /vm-rest/users/{username}/posts?count=48&offset=0` — same item shape as search results, paginate by `offset`. |

### Browser fallback

Reach for this when (a) a strict facet filter must be applied that step 2 can't encode, (b) `/vm-rest/posts` returns a transient 5xx, or (c) Akamai 403 appears on the residential-proxy IP (rare — Akamai protects sibling paths like `/vm-rest/posts/search`, not `/vm-rest/posts?request=…`).

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies | jq -r .id)
export BROWSE_SESSION="$SID"
browse open "https://poshmark.com/search?query=madewell+jeans&brand%5B%5D=Madewell&size%5B%5D=US+28&availability=available&sort_by=just_in" --remote
browse network on --remote
browse wait load --remote
browse wait timeout 3000 --remote   # results hydrate progressively after `load`
```

After `wait timeout`, the page has already fired one or more `/vm-rest/posts?request=…` XHRs with the **correct** facet shape; either:
- read the captured request bodies via `browse network path` and replay them with `browse cloud fetch` for cheap paging, or
- scrape rendered `[data-test=tile]` elements from `browse snapshot` (each tile carries `data-id`, brand, price, size, image as text).

Always `browse cloud sessions update "$SID" --status REQUEST_RELEASE` when done.

## Site-Specific Gotchas

- **`/vm-rest/posts?request=<json>` is the only verified search endpoint.** `/vm-rest/posts/search` (looks plausible) returns Akamai 403 — that's a sibling protected path, not the right route. `/vm-rest/v2/posts`, `/vm-rest/feed/search`, `/vm-rest/feed_unit`, `/vm-rest/categories`, and `/api/posts/search` all return JSON 404 (`GoshPosh::Platform::Errors::NotFoundError` — Poshmark's Ruby backend). Do not waste turns probing these.
- **`count` must be an integer.** `count: "48"` (string) returns `ValidationError 400`; `count: 48` returns 200. Same likely applies to any numeric param.
- **`experience: "all"` is required.** Omitting it returns generic HTTP 500 `"Something went wrong!"` with `content-type: text/html`.
- **`more.total` is capped at 5000.** This is a hard search-depth cap, not a real count. Display as "5,000+".
- **Pagination cursors are opaque `ENC_<base64>` tokens.** They base64-decode to JSON `{max_ids:[N], page_num, page_group_id}`, but the server treats them opaquely — pass `more.next_max_id` verbatim into the next request's `max_id`. Don't try to construct them.
- **`sort_by` enum is partly mapped.** Verified working: `price_asc`, `price_desc`, `best_match`, `relevance`. Default (omit) = `just_in` (newest). The web-UI labels `Just Shared` and `Most Popular` map to internal enums that did **not** accept `just_shared` / `most_popular` — both returned `ValidationError 400`. When you need those orderings, use the browser fallback on `/search?sort_by=just_shared` (the web UI knows the right value).
- **Filter facets in the `request` envelope are silently ignored on this endpoint.** Sending `brand`, `color`, `size`, `department`, `category`, `condition`, `availability`, `price` (and their `[]`/`_obj`/`facets.{}`/`selected_catalog.{}` variants) does not filter results — verified across 14 shapes. `selected_catalog` in the response always echoes `{department:[], category_v2:[], category_feature:[]}` for these inputs. Filter-bearing queries that must be exact need the browser fallback. The `query` string itself is your best filter lever via the API path — Poshmark's matcher includes brand and category terms with high accuracy.
- **The `query=""` (empty) request returns the global "Just In" feed** — useful when you only want department/category trending samples, but only via the browser fallback since the API path can't constrain by facet.
- **`price` is integer USD; precision is in `price_amount.val`.** A $24.50 listing is `price: 24` + `price_amount.val: "24.50"`. Use `price_amount.val` (parse to float) for accurate comp.
- **`original_price` is the seller-entered MSRP, not necessarily real retail.** Many sellers leave it equal to `price` (no discount) or set it to a vanity number. Surface both but don't compute "% off" without the user opting in.
- **`category` (legacy) vs `category_v2`.** Old free-form string ("Dresses & Skirts") vs new structured `{id, display, slug, message_id}`. Prefer `category_v2.display` for output; keep `category` as a fallback.
- **Sold listings expose `inventory.status: "sold_out"` plus `status_changed_at`** for the sold date. There is no separate sold-price field — the `price` shown is the last-listed price (which is what the buyer paid in 99% of cases since Poshmark closes the bidding state when sold).
- **`colors[]` can be empty.** Seller-set field; do not assume presence.
- **`pictures[]` does not include the cover.** The cover is in `cover_shot`. Total photo count = `1 + pictures.length` (cap is 16).
- **All image URLs are absolute CloudFront URLs** (`https://di2ponv0v5otw.cloudfront.net/posts/YYYY/MM/DD/{id}/{m|s|l}_{photoId}.{jpeg|webp}`). No reconstruction needed; prefer `url_large` for product-shot quality, `url_small` for thumbnail grids, `url_webp` for bandwidth-sensitive pipelines.
- **Listing canonical URL accepts any slug.** `https://poshmark.com/listing/x-{id}` 301s to the canonical slug, so you don't have to slugify the title. Use that form to be slug-free.
- **`robots.txt` Disallows `/search`, `/api`, `/mapp`, `/listings`, `/user`, `/cp` and most action paths.** This is a politeness directive, not an enforcement; the JSON endpoints we use here are not on the Disallow list (`/vm-rest/...` is not listed). Keep request rate ≤ 1/s sustained and reuse `query_hash_id`/`page_group_id` rather than reissuing the same query.
- **Single-listing detail (`GET /vm-rest/posts/{id}`) returns the item at top level, NOT under `data`.** Search returns `{data: [...], more, …}`; single-listing returns `{id, title, price, …}` directly. Different parser path required.
- **Closet endpoint accepts only ASCII usernames as URL-encoded.** Some closets have unicode in `display_handle` but `username` (the URL slug) is always ASCII. Use `username` for the URL, `display_handle` for display.
- **Poshmark Wholesale Portal items are mixed into normal search.** Distinguish via `creator_username` (wholesale sellers are flagged via `/vm-rest/users/{username}` `is_reseller: true`) or, for prefix-typed listings, via `style_tags[]`.
- **No Akamai 403 observed on `/vm-rest/posts?request=…`** with Browserbase residential proxies during iter-1. The 403 risk is on sibling paths (`/vm-rest/posts/search`) and on the web search page itself when proxied without `--verified`. The recommended-method (API) path bypasses both.
- **Read-only — never call `/vm-rest/posts/{id}/like`, `/vm-rest/posts/{id}/buy`, or any `/listing/{id}/{action}` URL.** They are also `Disallow:` in robots.txt and are state-changing.
- **Sandbox-network caveat (iteration only).** This skill was authored from a sandbox where `connect.*.browserbase.com` (the WebSocket CDP endpoint) was not DNS-resolvable, so all verification ran through `browse cloud fetch` (the Browserbase Fetch API). The API-path findings reproduce identically in a regular environment. The browser-fallback section is documented from Poshmark's public URL conventions and the inner agent should confirm filter facets there on first use.

## Expected Output

Three distinct output shapes, depending on the input branch:

```json
// 1. Free-text / brand / department search — primary path
{
  "success": true,
  "query": "madewell jeans size 28",
  "sort_by": "price_asc",
  "result_count_capped": 5000,
  "match_breakdown": { "lexical.exact": 100 },
  "page_group_id": "6a0b5582450b42eab9e7a97c",
  "next_max_id": "ENC_eyJtYXhfaWRzIjpbNF0sInBhZ2VfbnVtIjoyLCJwYWdlX2dyb3VwX2lkIjoiNmEwYjU1ODI0NTBiNDJlYWI5ZTdhOTdjIn0",
  "is_next_max_id_present": true,
  "listings": [
    {
      "listing_id": "6a0b524853fece38f12856dc",
      "title": "Madewell Roadtripper jeans",
      "price_usd": 3,
      "price_raw": "3.0",
      "currency": "USD",
      "original_price_usd": 88,
      "brand": "Madewell",
      "brand_slug": "Madewell",
      "size": "26",
      "size_system": "us",
      "size_display": "US 26",
      "colors": [{ "name": "Blue", "rgb": "#137fc1" }],
      "department": "Women",
      "category": "Jeans",
      "category_legacy": "Denim",
      "category_features": [],
      "inventory_status": "available",
      "nwt": false,
      "posh_authenticate": false,
      "shipping_discount": null,
      "cover_image": "https://di2ponv0v5otw.cloudfront.net/posts/.../l_<id>.jpeg",
      "images": [
        "https://di2ponv0v5otw.cloudfront.net/posts/.../l_<id1>.jpeg",
        "https://di2ponv0v5otw.cloudfront.net/posts/.../l_<id2>.jpeg"
      ],
      "seller_username": "thebrirunway",
      "seller_display_name": "Bri R.",
      "seller_badge": { "posh_ambassador": false, "boutique": false, "suggested_user": false },
      "seller_rating": { "stars": 4.9, "count": 312 },
      "like_count": 3,
      "share_count": 34,
      "comment_count": 0,
      "created_at": "2026-05-06T12:26:42-07:00",
      "first_published_at": "2026-05-06T12:26:42-07:00",
      "status_changed_at": "2026-05-18T08:30:44-07:00",
      "canonical_url": "https://poshmark.com/listing/x-6a0b524853fece38f12856dc"
    }
  ]
}

// 2. Single-listing lookup
{
  "success": true,
  "listing": { /* same shape as listings[] item above */ }
}

// 3. Closet enumeration
{
  "success": true,
  "closet": {
    "username": "thebrirunway",
    "display_handle": "thebrirunway",
    "full_name": "Bri R.",
    "badges": { "posh_ambassador": true, "posh_ambassador_ii": false, "boutique": false, "suggested_user": false },
    "rating": { "stars": 4.9, "count": 312 }
  },
  "listings": [ /* same shape as listings[] items */ ],
  "next_offset": 48,
  "is_next_present": true
}

// Failure shapes
{ "success": false, "reason": "no_results", "query": "..." }
{ "success": false, "reason": "listing_not_found", "listing_id": "..." }
{ "success": false, "reason": "user_not_found", "username": "..." }
{ "success": false, "reason": "rate_limited_or_blocked", "status_code": 403, "fallback": "browser" }
{ "success": false, "reason": "filter_not_supported_via_api", "unsupported_filters": ["sort_by=just_shared"], "fallback": "browser" }
```
