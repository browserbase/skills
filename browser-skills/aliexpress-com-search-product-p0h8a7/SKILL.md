---
name: aliexpress-com-search-product-p0h8a7
title: AliExpress Search Products by Name
description: >-
  Search AliExpress by product name / keyword and return a structured list of
  matching listings — productId, canonical detail URL, title, current price,
  list price, discount %, rating, sold count, and badges. Read-only.
website: aliexpress.com
category: ecommerce
tags:
  - ecommerce
  - aliexpress
  - search
  - products
  - read-only
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      No public storefront API for search. AliExpress's internal MTOP/GraphQL
      endpoints (gdp.alicdn.com/mtop.aliexpress.search.*) require per-request
      Alibaba `sign` headers derived from browser-only `_m_h5_tk` cookies and
      cannot be replayed from a cookieless HTTP client. Confirmed dead-end
      during iteration.
  - method: url-param
    rationale: >-
      The canonical URL pattern (/w/wholesale-<slug>.html) takes
      SortType/minPrice/maxPrice/shipFromCountry filter params, but item data is
      server-rendered into the DOM, not exposed as JSON — a browser is still
      required to extract.
verified: true
proxies: true
---
# AliExpress Search Products by Name

## Purpose

Given a product name / search query (e.g. "wireless headphones", "iphone 15 case"), return a structured list of matching AliExpress listings — for each result: product id, canonical detail-page URL, title, current price, original/list price (when discounted), discount %, star rating, sold count, and promotional badges. Read-only — never adds to cart, never proceeds to checkout, never signs in.

## When to Use

- Quick product discovery: "find me {query} on AliExpress".
- Comparing the cheapest or best-rated listings for a generic product across sellers.
- Building a price/availability watcher for a query slug.
- Feeding a downstream "fetch product detail" skill — this skill returns the `productId` and canonical detail URL each item-detail skill needs.

## Workflow

The recommended path is **browser-driven**. There is no public JSON API for the storefront search surface — items are server-side-rendered into the page's HTML, and the GraphQL/MTOP endpoints AliExpress uses internally (`gdp.alicdn.com/mtop.aliexpress.*`) require Alibaba-signed `m-h5-tk` + `_m_h5_tk_enc` browser cookies and a per-request `sign` derived from those (not reproducible from a cookieless `curl`). The page-rendered HTML is the cheapest reliable surface. A stealth + residential-proxy session (`--verified --proxies`) is required — bare sessions trip Cloudflare/Akamai-style verification challenges intermittently from datacenter IPs.

**Important architectural note for the agent reading this**: search-results items are NOT in `window._dida_config_._init_data_` (the page-state blob). The `cards2023_*` field where you'd expect them is empty — items are baked directly into the rendered DOM. Don't waste turns inspecting that object.

### 1. Create a stealth + proxied session

```bash
sid=$(browse cloud sessions create --keep-alive --verified --proxies \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$sid"
```

Both `--verified` and `--proxies` are required. AliExpress shows captcha / "Verify you're human" pages on a non-trivial fraction of bare-session loads.

### 2. Navigate to the canonical search URL

```bash
# Slugify the query: lowercase, ASCII letters/digits only, spaces → hyphens.
slug=$(echo "$QUERY" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]\+/-/g' | sed 's/^-//;s/-$//')

browse open "https://www.aliexpress.com/w/wholesale-${slug}.html" --remote
browse wait load --remote
browse wait timeout 3500 --remote   # search grid hydrates 1–3 s after `load`
```

Equivalent URL form: `https://www.aliexpress.com/wholesale?SearchText=<urlenc>` — AliExpress 302-redirects this to the canonical `/w/wholesale-<slug>.html` path. Prefer the canonical form to skip the redirect round-trip.

**Optional URL params** (appended as `?key=val&...`):

| Param | Meaning |
|---|---|
| `SortType=default` | Best Match (default) |
| `SortType=total_tranpro_desc` | Sort by Orders (most-sold first) |
| `SortType=price_asc` / `price_desc` | Sort by price ascending / descending |
| `SortType=latest_desc` | Newest listings first |
| `minPrice=N&maxPrice=N` | Numeric price bounds in the page's currency |
| `shipFromCountry=US,CN,...` | Filter origin country (comma-separated ISO-2) |
| `g=y` | Filter to "Choice" (AliExpress-curated faster shipping) items |

Unrecognized params are silently dropped.

### 3. Extract listings from the rendered DOM

Each search result is an `<a href="/item/<productId>.html">` anchor (hostname is either `www.aliexpress.com` or `www.aliexpress.us` — both resolve to the same product). The anchor's `innerText` is **already neatly line-broken** by the page's CSS — split on `\n`, trim, and classify each line by pattern. The DOM uses obfuscated class names (`k7_kg`, `k7_l7`, `nc_nf`, …) that **change per build** — selecting by class is brittle; rely on the line-split heuristic below instead.

```javascript
// Run via: browse eval --remote --session "$sid" '(() => { ... })()'
(() => {
  const seen = new Set();
  const items = [];
  for (const a of document.querySelectorAll('a[href*="/item/"]')) {
    const m = a.href.match(/\/item\/(\d+)\.html/);
    if (!m) continue;
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);

    const lines = (a.innerText || '').split('\n').map(s => s.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    const item = {
      productId: id,
      url: a.href.split('?')[0],   // strip tracking params
      title: lines[0],
      price: null,
      listPrice: null,
      discountPct: null,
      rating: null,
      sold: null,
      badges: []
    };

    const prices = [];
    for (let i = 1; i < lines.length; i++) {
      const ln = lines[i];
      if (/^\$[\d,]+(\.\d{1,2})?$/.test(ln))         { prices.push(ln); continue; }
      if (/^-\d{1,2}%$/.test(ln))                     { item.discountPct = ln; continue; }
      if (item.rating === null && /^[1-5]\.\d$/.test(ln))  { item.rating = parseFloat(ln); continue; }
      if (item.sold === null && /\bsold$/i.test(ln))  { item.sold = ln; continue; }
      item.badges.push(ln);
    }
    item.price = prices[0] || null;
    item.listPrice = prices[1] || null;   // present only when discounted

    // Drop "related search keyword" anchors — they have no price/sold and are not real products.
    if (!item.price && !item.sold) continue;
    items.push(item);
  }
  return items;
})()
```

**Filter rule (critical):** anchors with **only a title line** (no price, no sold count) are related-search keyword shortcuts AliExpress injects into the grid — they are NOT real products and clicking them runs another search. Drop them with the `if (!item.price && !item.sold) continue;` guard above.

### 4. (Optional) Load more results via infinite scroll

The grid is JS-paginated by scroll, not by `?page=N` (anchor scans for `a[href*="page="]` return zero hits). Each scroll-to-bottom triggers an XHR that appends ~12–17 more items to the DOM.

```bash
# Each 3000-px scroll appends one batch. Loop until count stabilises or hits your cap.
for i in 1 2 3 4; do
  browse mouse scroll 500 400 0 3000 --remote
  browse wait timeout 2000 --remote
done
# Then re-run the extractor — it dedupes by productId via the `seen` Set.
```

Observed: initial render ~17 items; +17 per scroll batch; pages cap around 50–60 items per query in normal use. Don't infinite-loop — set a hard cap.

### 5. Release the session

```bash
browse cloud sessions update "$sid" --status REQUEST_RELEASE
```

## Site-Specific Gotchas

- **`--verified --proxies` is required.** Bare sessions intermittently hit Cloudflare/Akamai verification screens. The combination has been stable across all tested queries.
- **Items are NOT in `window._dida_config_._init_data_`.** The page-state object exposes `hierarchy`, decode tables, and refine filters, but `data.data.cards2023_*` (where items would logically live) is empty `{}` — the rendered grid is the canonical source. Don't waste turns spelunking `_dida_config_` for products.
- **No JSON storefront API for search.** AliExpress's internal MTOP/GraphQL surface (`gdp.alicdn.com/mtop.aliexpress.search.*`) requires per-request Alibaba `sign` headers derived from session cookies (`_m_h5_tk`, `_m_h5_tk_enc`). These can't be replayed from a cookieless `curl` and reverse-engineering the sign function is out of scope. The browser-rendered HTML is the practical surface.
- **Class names are obfuscated and per-build (`k7_kg`, `k7_l7`, `nc_nf`, …).** Don't select by class — they change. Use the `innerText` line-split heuristic on `a[href*="/item/"]` anchors.
- **No-results queries silently fall back to "anything goes".** A query like `zxqzxqzxq123nonsense` returns ~5–6 unrelated products with no "0 results" banner. To detect a truly poor match, compare the query tokens against returned titles — if median title-token overlap is < 1, treat it as `no_match`.
- **Related-search anchors masquerade as products.** Inside the grid, AliExpress injects keyword-shortcut anchors (e.g. `<a href="/item/.../1005002856476808.html">iphone 15 vans case</a>`) that have only a title and no price/rating/sold. Filter them out by requiring `price || sold` to be present.
- **Two product-page hostnames coexist: `www.aliexpress.com` and `www.aliexpress.us`.** Same productId, same content, different geo/locale routing. Treat either as canonical; don't normalize one to the other without a reason.
- **The URL pattern is canonicalised to a hyphenated slug.** `/wholesale?SearchText=wireless+headphones` 302s to `/w/wholesale-wireless-headphones.html`. Special characters (`'`, `&`, accents) are dropped from the slug — `iPhone 15 Pro Max` becomes `iphone-15-pro-max`. Use `?SearchText=…` if you need to preserve weird query strings, accept the redirect.
- **Anchor URLs include heavy tracking params (`algo_pvid`, `pdp_npi`, `algo_exp_id`, `curPageLogUid`, `utparam-url`).** Always strip with `.split('?')[0]` for a clean canonical detail URL. The `/item/<id>.html` path alone is sufficient to fetch the product.
- **Rating may be missing on cards.** New listings (or those AliExpress chooses to suppress) omit the `^[1-5]\.\d$` rating line entirely; the sold line may also be absent for brand-new items. Code defensively for nulls in both.
- **Pagination is infinite-scroll only — no `?page=N`.** Sorting via `SortType=` and filtering via `minPrice/maxPrice/shipFromCountry` work via URL params, but page-number navigation does not exist in the URL contract.
- **Wait `~3.5s` after `wait load`** before extracting. The grid hydrates progressively post-`load`; extracting immediately may miss the first batch of items.
- **The `BundleDeals` URL is not a product page.** A handful of anchors point to `/ssr/<id>/BundleDeals2?productIds=...` (a multi-product bundle landing page). The current extractor filters them naturally (no `/item/<id>.html` match), but be aware they appear in the grid.

## Expected Output

```json
{
  "query": "wireless headphones",
  "search_url": "https://www.aliexpress.com/w/wholesale-wireless-headphones.html",
  "sort": "default",
  "result_count": 18,
  "items": [
    {
      "productId": "3256811752642309",
      "url": "https://www.aliexpress.us/item/3256811752642309.html",
      "title": "B36 Wireless Bluetooth 5.3 Over-Ear Headphones with ANC Noise Cancelling 8H Playtime Ergonomic Design HD Microphone Foldable",
      "price": "$8.64",
      "listPrice": null,
      "discountPct": null,
      "rating": 4.9,
      "sold": "179 sold",
      "badges": ["$2 off on $18", "Save $14.45"]
    },
    {
      "productId": "3256806808326673",
      "url": "https://www.aliexpress.us/item/3256806808326673.html",
      "title": "Transparent Magnetic Case For iPhone 15 14 13 Pro Max For Magsafe Clear Wireless Charging Phone Cases",
      "price": "$2.75",
      "listPrice": "$6.91",
      "discountPct": "-60%",
      "rating": 4.9,
      "sold": "100K+ sold",
      "badges": ["$2 off on $18", "New shoppers save $4.16"]
    }
  ]
}
```

Distinct outcome shapes:

```json
// 1. Normal results (above)
{ "result_count": N, "items": [...] }

// 2. Nonsensical query — AliExpress returns unrelated fallback items, NOT a 0-results page.
// Detect via low query-token overlap with returned titles.
{
  "query": "zxqzxqzxq123nonsense",
  "result_count": 6,
  "match_quality": "no_match",
  "items": [ /* unrelated products — surface them as low-confidence or drop */ ]
}

// 3. Verification challenge (rare, on degraded sessions). Detect via page title
// "Verify yourself" / "Are you human" / Cloudflare branding. Recreate session.
{
  "query": "...",
  "error": "verification_challenge",
  "hint": "Recreate session with --verified --proxies and retry."
}
```
