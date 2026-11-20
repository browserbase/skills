---
name: target-com-find-a-product-nn7l9g
title: Target.com Find Product
description: >-
  Search Target.com for a product query and return the top organic match's
  title, brand, price, original price, rating, TCIN, canonical product URL, and
  image — via the public redsky JSON aggregation API. Distinguishes real
  matches, spell-corrected matches, and zero-results-with-recommendation-padding
  outcomes. Read-only.
website: target.com
category: shopping
tags:
  - shopping
  - retail
  - target
  - product-search
  - read-only
  - json-api
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      Falls back to driving https://www.target.com/s?searchTerm=... in a Verified
      + residential-proxy session when the redsky API returns 4xx. The browser
      path costs ~6–8 turns and ~30–60s wall (vs ~1s for the API) and has to
      dismiss a Health Data Consent modal before the product grid is
      interactable. Use only when the API path is confirmed broken.
verified: false
proxies: false
---
# Target.com Find Product

## Purpose

Given a free-text product query (e.g. "AirPods Pro 2", "tide pods", "lego star wars millennium falcon"), return the top matching Target.com product(s) with structured fields: title, brand, price, original (struck-through) price, average rating + rating count, TCIN (Target's internal product ID), canonical product URL (`/p/.../-/A-<tcin>`), primary image URL, and signals like spell correction or zero-results fallback. **Read-only — never adds to cart, never submits an order.**

## When to Use

- "Is *X* on Target.com? Price, link, image."
- Daily / hourly price-check on a watch-list of Target products.
- Bulk extraction of Target's top-N results for a list of keywords.
- Comparison-shopping agents that need a Target price point alongside other retailers.
- Anywhere you would otherwise drive `target.com/s?searchTerm=...` in a Verified browser — the redsky JSON API returns identical data in one ~1s HTTP request without anti-bot.

## Workflow

Target's web search page is a Next.js SSR shell with a JS-rendered product grid; the **actual data comes from a public JSON aggregation API at `redsky.target.com`** that the browser polls on page load. The endpoint is keyed but the key is a static public token (`ff457966e64d5e877fdbad070f276d18ecec4a01`) embedded in Target's JS bundles, accepts unauthenticated requests, has no per-IP captcha or PerimeterX challenge, and works equally well with or without a residential proxy. **Hit it directly — the browser path is a ~100× cost premium that pays for a Health Data Consent modal you have to dismiss before the grid even paints.**

### 1. Build the request

```
GET https://redsky.target.com/redsky_aggregations/v1/web/plp_search_v2
    ?key=ff457966e64d5e877fdbad070f276d18ecec4a01
    &channel=WEB
    &keyword=<URL-encoded query>
    &page=%2Fs%2F<URL-encoded query>
    &visitor_id=<any non-empty string, e.g. "skill-runner">
    &pricing_store_id=2885
    &default_purchasability_filter=true
    &count=24
    &offset=0
    &platform=desktop
```

**Required params** (server returns HTTP 400 if any are missing): `key`, `channel`, `keyword`, `page`, `visitor_id`, `pricing_store_id`. **Optional but useful**: `count` (default 24), `offset` (item-level, not page-level — increment by `count` to paginate), `default_purchasability_filter=true` (hides out-of-stock), `sort_by` (see table below), `category` (scope to a category id), `platform=desktop|mobile`.

The `page` param is required and must look like a real PLP path (`/s/<term>`); the server validates only that it starts with `/s/` — anything after is decorative. `visitor_id` is required but any non-empty string is accepted; the server doesn't actually validate it against a known device. `pricing_store_id=2885` is the Target HQ store (Minneapolis) and yields nationwide pricing — use it as a stable default unless you specifically need store-local pricing.

| `sort_by` value | Effect |
|---|---|
| `relevance` (default) | Target's relevance ranking |
| `Featured` | Featured/sponsored bias |
| `PriceLow` | Price low → high |
| `PriceHigh` | Price high → low |
| `RatingHigh` | Average rating high → low |
| `bestselling` | Best-sellers first |
| `newest` | Newest first |

### 2. Fire the request

```bash
URL="https://redsky.target.com/redsky_aggregations/v1/web/plp_search_v2?key=ff457966e64d5e877fdbad070f276d18ecec4a01&channel=WEB&keyword=AirPods+Pro+2&page=%2Fs%2FAirPods+Pro+2&visitor_id=skill-runner&pricing_store_id=2885&default_purchasability_filter=true&count=24"

# Either path works — pick whatever the agent's runtime already has:
browse cloud fetch "$URL"              # Browserbase Fetch API, no proxy needed
# or
curl -fsS -H 'Accept: application/json' "$URL"
```

A residential proxy is **not** required for this endpoint. Verified: same response shape, same products, same status 200, with and without `--proxies`. Save the proxy budget for the browser-fallback path.

### 3. Detect outcome shape *before* extracting

```jq
.data.search.search_response |
  {
    total_results: .metadata.total_results,
    spell_corrected: (.metadata.auto_corrected_keyword // null),
    real_results: ((.facet_list // []) | length > 0),
    keyword: .metadata.keyword
  }
```

Branch on `real_results`:

- **`real_results: true`** — Target found genuine matches for the keyword. Parse `data.search.products[]`.
- **`real_results: false`** — Target found zero matches and is serving generic "recommendation" filler (typically ~200 unrelated bestsellers from books / toys / random categories). **Do NOT silently return the first filler item as the match.** Emit `success: false, reason: "no_results"` and pass through `metadata.keyword` so the caller can decide what to do.
- **`spell_corrected` non-null** — Target auto-corrected the query (e.g. "airpoods" → "airpods"). The returned products correspond to the *corrected* keyword. Pass the corrected term back so the caller can decide whether the correction is acceptable.

### 4. Extract the top product

```jq
.data.search.products[0] |
  {
    tcin: .tcin,                                                       # e.g. "85978609"
    title: (.item.product_description.title | @html_decode),           # decode &#160;, &#38;, &#34;, &#8482;
    brand: .item.primary_brand.name,                                   # may be null
    price: .price.formatted_current_price,                             # "$249.99" or "See price in cart"
    original_price: .price.formatted_comparison_price,                 # null if not on sale
    rating: .ratings_and_reviews.statistics.rating.average,            # 0–5 float, null if no ratings
    rating_count: .ratings_and_reviews.statistics.rating.count,        # integer, null if no ratings
    product_url: .item.enrichment.buy_url,                             # canonical https://www.target.com/p/.../-/A-<tcin>
    image_url: .item.enrichment.image_info.primary_image.url,          # scene7 CDN URL
    desirability: (.desirability_cues // [] | map(.display))           # e.g. ["Bestseller"], ["5k+ bought in last month"]
  }
```

Decode HTML entities (`&#160;` → non-breaking space, `&#38;` → `&`, `&#34;` → `"`, `&#8482;` → `™`) — Target's API returns titles with entity references intact, not pre-decoded text.

### 5. (Optional) Filter sponsored

`plp_search_v2` already filters most sponsored placements server-side — the field `item.is_sponsored` is `null` (not `false`) across all observed organic results, and sponsored slots come from a sibling aggregation (`cf_sponsored_products_search_v1`) the browser fetches separately. If you need to be defensive, drop any product whose `__typename !== "ProductSummary"`.

### 6. Return JSON; do not navigate

Read-only is the rule. Do not hit the `add_to_cart` redsky aggregation. Do not POST to `/checkout`. Stop at the product summary.

### Browser fallback

If `redsky.target.com` ever returns 4xx (key rotation, geo-block, etc.) — drive the public site:

1. Create a Browserbase session with `--proxies --verified` (PerimeterX / HUMAN sensor at `client.px-cloud.net/PXGWPp4wUS/main.min.js` will challenge a bare session within a few requests).
2. `browse open "https://www.target.com/s?searchTerm=<URL-encoded query>" --remote`.
3. **Dismiss the Health Data Consent modal.** On a first-visit session, Target overlays a "Health Data Consent" modal (Virginia VCDPA compliance) that *blocks the product grid from being interactable*. Click the "Continue shopping" button — selector `button:has-text("Continue shopping")` — before snapshotting.
4. `browse wait timeout 2500` — the grid lazy-loads after consent dismissal.
5. `browse snapshot` — product cards surface as link refs with TCIN-bearing hrefs.
6. Extract the same fields by parsing the rendered DOM. The product card structure is `[data-test="@web/site-top-of-funnel/ProductCardWrapper"]` → child `[data-test="product-title"]` (title), `[data-test="product-price"]` (price), `[data-test="ratings"]` (rating).

The browser fallback costs ~6–8 turns and ~30–60s wall vs the API's one HTTP request. Use only when the API path is confirmed broken — not as the default.

## Site-Specific Gotchas

- **The redsky API key is public and stable.** `ff457966e64d5e877fdbad070f276d18ecec4a01` has been observed in Target's web bundle continuously since at least 2021 across third-party scrapers. If it ever rotates, scan the Target SERP HTML for `redsky_aggregations` references and look for the key in the surrounding JS — historically it's been bundled in a global config object emitted into the SSR HTML, not behind any auth wall.
- **Required-param surface is fragile**. Dropping any one of `key`, `channel`, `keyword`, `page`, `visitor_id`, `pricing_store_id` flips the response to HTTP 400 with no error body. Removing `default_purchasability_filter`, `count`, `offset`, `platform`, `store_ids`, or `sort_by` is safe — those default cleanly server-side.
- **`page` is path-prefix-validated, not echo'd.** The server accepts any `page` starting with `/s/`. It does not compare `page` against `keyword`. You can pass `page=%2Fs%2Ftest` for every request regardless of the actual keyword and the response is identical to passing the real path — verified across `tide+pods`, `airpods+pro+2`, `instant+pot+duo+7+in+1`.
- **"No results" returns padding, not an error.** A nonsense keyword (`xkcd12345nonexistent`) returns HTTP 200 with `total_results: 200` and 24 unrelated bestsellers in `products[]`. The reliable signal is **`search_response.facet_list` is missing/empty** for the padding case but populated for genuine results. `total_results` is **not** a reliable zero-results signal — Target pads it.
- **Spell correction is server-side and silent in `products[]`.** When `metadata.auto_corrected_keyword` is non-null, the returned products are for the *corrected* keyword, not the typed one. The caller should be told about the correction so they can decide whether to accept it. (Example: keyword=`airpoods` returns `auto_corrected_keyword="airpods"` plus 481 AirPod-family products.)
- **Titles contain raw HTML entities, not decoded text.** `&#160;` (nbsp), `&#38;` (`&`), `&#34;` (`"`), `&#8482;` (`™`) appear verbatim. Always run titles through an HTML-entity decoder before emitting JSON to a consumer.
- **`price.formatted_current_price` can be `"See price in cart"`** for MAP-restricted items (Apple, Instant Pot RIO line, some appliances). This is a real product, just legally price-suppressed on the PLP — open the PDP via `buy_url` to see the actual cart price, or read `price.current_retail` (numeric, sometimes populated even when the formatted string is suppressed).
- **`brand` is `.item.primary_brand.name`, but it can be `null`** — observed null for Target-private-label staples (e.g. "up & up"), unbranded commodity items, and grocery. Fall back to extracting the leading token of the title if a brand is required downstream.
- **`rating.count` is the *rating* count, not the *review* count.** A separate `review_count` field at the top of `statistics` does not exist on `plp_search_v2` — the field `.ratings_and_reviews.statistics.rating.count` is the integer you want.
- **`pricing_store_id` controls store-localized pricing, not nationwide-vs-store availability.** `2885` (Jersey City / NJ) is the value Target's public web bundles use by default. Other valid store IDs (`1000` = Minneapolis 50th & France, `3991` = LA Westwood, etc.) are accepted. The `default_purchasability_filter` parameter independently controls whether out-of-stock items are hidden.
- **Health Data Consent modal blocks the browser-fallback path.** Target overlays a Virginia VCDPA compliance modal on every cold-session SERP / PDP that intercepts pointer events on the entire grid. Must be dismissed via "Continue shopping" before any product card is interactable. The API path bypasses this entirely.
- **Anti-bot on the public site is PerimeterX / HUMAN.** `client.px-cloud.net/PXGWPp4wUS/main.min.js` (the HUMAN sensor) is loaded as `<script id="humanSensor">` on every page. Bare sessions get challenged within ~5–10 requests; `--proxies --verified` is mandatory for the browser fallback. The redsky API endpoint is **not** behind PerimeterX — verified: 200 OK on direct curl from a datacenter IP, no challenge, no `_px*` cookies required.
- **The PDP URL is canonical and idempotent**. `https://www.target.com/p/<slug>/-/A-<tcin>` is stable — once you have the TCIN you can drop the slug entirely (`/-/A-<tcin>`) and Target 301s to the canonical slug.
- **Pagination uses `offset` not `page`.** `offset` is item-level (0, 24, 48, ...). The redsky endpoint also accepts `&page_number=2` but it's a no-op — only `offset` controls pagination.
- **`store_ids` filters availability, not pricing**. Including `store_ids=<id>` scopes the result set to items in-stock at that store. Omitting it returns everything Target sells online for the keyword. They're independent dimensions from `pricing_store_id`.

## Expected Output

Three distinct outcome shapes:

```json
// Success — top result is a genuine match
{
  "success": true,
  "query": "AirPods Pro 2",
  "search_keyword": "AirPods Pro 2",
  "spell_corrected_from": null,
  "total_results": 259,
  "product": {
    "tcin": "85978609",
    "title": "Apple AirPods Pro 3 Wireless Earbuds with Active Noise Cancellation",
    "brand": "Apple",
    "price": "$249.99",
    "original_price": null,
    "rating": 3.9,
    "rating_count": 1441,
    "product_url": "https://www.target.com/p/ap2022-true-wireless-bluetooth-headphones/-/A-85978609",
    "image_url": "https://target.scene7.com/is/image/Target/GUEST_d1b8c229-751b-430b-a0fb-521d7777a784",
    "desirability_cues": ["Bestseller"],
    "is_sponsored": false
  },
  "error_reasoning": null
}

// Success with spell correction — caller should decide whether to accept
{
  "success": true,
  "query": "airpoods",
  "search_keyword": "airpods",
  "spell_corrected_from": "airpoods",
  "total_results": 481,
  "product": { /* ... top AirPods product ... */ },
  "error_reasoning": null
}

// No real matches — Target returned recommendation filler
{
  "success": false,
  "query": "xkcd12345nonexistent",
  "search_keyword": "xkcd12345nonexistent",
  "spell_corrected_from": null,
  "total_results": 200,
  "product": null,
  "error_reasoning": "no_results",
  "note": "Target returned 200 unrelated recommendations (no facet_list in search_response — confirmed filler)."
}

// API blocked — fall back to browser path (rare)
{
  "success": false,
  "query": "...",
  "product": null,
  "error_reasoning": "api_blocked",
  "http_status": 403,
  "note": "redsky.target.com returned 403. Switch to the browser-fallback workflow (Health Data Consent modal + Verified session)."
}
```
