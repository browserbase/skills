---
name: ulta-com-browse-products-by-category-x7ej7h
title: Ulta Browse Products by Category
description: >-
  Browse Ulta.com by category taxonomy (Makeup, Skin Care, Hair, etc.) instead
  of search. Returns brand, name, price, rating, SKU, URL, image, and badges for
  every product in any category leaf — with URL-param filtering (form, finish,
  brand, price bucket) and server-side sorting.
website: ulta.com
category: shopping
tags:
  - beauty
  - cosmetics
  - shopping
  - catalog
  - read-only
  - akamai
source: 'browserbase: agent-runtime 2026-05-25'
updated: '2026-05-25'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      Browser fallback for the rare case the fetch path is blocked or when an
      agent needs to interact with the live rendered grid. Requires a stealth +
      residential-proxy session (--verified --proxies) — bare sessions get
      Akamai's 'Q R Code' verification interstitial. Slower and more expensive
      than the fetch path, which returns the same SSR Apollo state.
  - method: api
    rationale: >-
      Ulta exposes an internal GraphQL endpoint (NonCachedPage queries served
      from istio-envoy at www.ulta.com) but there's no public, documented JSON
      API. The SSR Apollo state inlined into category-page HTML is the practical
      'API' — same data, no auth headers, no persisted-query handshake.
verified: false
proxies: false
---
# Ulta Browse Products by Category

## Purpose

Browse products listed on Ulta.com by **navigating its category taxonomy** (Makeup → Lips → Lipstick, Skin Care → Moisturizers, etc.) instead of using the on-site search box. Returns a structured list of products in any category — brand, product name, list/sale price, rating, review count, SKU, product-detail URL, image URL, variant label, and badges/promo text. Read-only; never adds anything to a bag or wishlist.

## When to Use

- "What lipsticks does Ulta carry?" / "Show me all moisturizers" — taxonomy-first browsing, not keyword search.
- Crawling an entire category for price comparison, brand inventory tracking, or recommendation seeding.
- Pulling the catalog under a narrow leaf category with filters applied (e.g. matte-finish lipsticks under $15).
- Anywhere you'd otherwise scrape Ulta search-result pages — the category route is faster, cheaper, and stable across sessions because the data is server-rendered on the category URL itself.
- **Do NOT use** when the user query is keyword-style ("find the Maybelline Sky High mascara"). Search is the right surface for that; this skill is the wrong tool.

## Workflow

Ulta's category pages are React/Apollo apps **but** the first 64 products of each category are server-side-rendered into a `window.__APOLLO_STATE__` blob inside the HTML. That means a plain HTTPS GET against the category URL — no browser, no cookies, no auth, no stealth, no proxy — returns the data directly. Filters and pagination compose cleanly via URL query params. Lead with this fetch path; the browser path is a fallback when an unknown filter/sort doesn't take effect or when you need to interact with the live UI for some other reason.

### 1. Discover categories

The full category taxonomy is in `https://www.ulta.com/l/category_filter_sitemap.xml` (~1.5 MB, ~247 distinct base category paths plus many filter-variant URLs). Categories nest up to three levels deep:

```
https://www.ulta.com/shop/<top>                       ← landing page (curated, ~12 products)
https://www.ulta.com/shop/<top>/all                   ← full grid of every product in <top>
https://www.ulta.com/shop/<top>/<sub>                 ← e.g. /shop/makeup/lips
https://www.ulta.com/shop/<top>/<sub>/<leaf>          ← e.g. /shop/makeup/lips/lipstick
```

Top-level slugs observed: `makeup`, `skin-care`, `hair`, `fragrance`, `body-care`, `tools-brushes`, `k-beauty`, `men`, `luxury-at-ulta-beauty`, `wellness-by-ulta-beauty`, `travel-size-mini`, `gifts`.

To enumerate sub-categories of an unknown top-level, parse the sitemap:
```bash
browse cloud fetch "https://www.ulta.com/l/category_filter_sitemap.xml" \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const o=JSON.parse(s.slice(s.indexOf('{'))); const m=o.content.match(/<loc>[^<]+<\/loc>/g)||[]; m.map(x=>x.slice(5,-6)).filter(u=>u.startsWith('https://www.ulta.com/shop/makeup/')&&!u.includes('?')).forEach(u=>console.log(u));}"
```

### 2. Fetch the category page (no browser, no proxy)

```bash
browse cloud fetch "https://www.ulta.com/shop/makeup/lips/lipstick"
```

A bare `fetch` is enough. The response status is 200 and the body is the SSR'd HTML with the Apollo state inlined. **You do not need `--proxies` for the fetch path** — verified with anonymous requests across multiple categories during 2026-05-25 iteration.

Read these two facts from the HTML *before* parsing:
- **Total product count**: extract from the page title — `<title>Lipstick - Makeup - <COUNT> Products | Ulta Beauty</title>`. Also surfaces as `<COUNT> Products` in the body text. Use this to plan pagination.
- **Per-page size**: always `64` (`"pageSize":64` in the Apollo state). Compute `Math.ceil(total / 64)` to know how many pages to walk.

### 3. Extract `window.__APOLLO_STATE__` and walk for products

The Apollo state is assigned to `window.__APOLLO_STATE__ = { ... };` as a single JSON object inside a `<script>` tag. Brace-balanced extraction (the value can contain string-literal braces, so use a depth counter that respects double-quoted strings):

```js
function extractApolloState(html) {
  const marker = html.indexOf('window.__APOLLO_STATE__');
  const eq = html.indexOf('=', marker);
  let depth = 0, inStr = false, esc = false, started = false, end = -1;
  for (let i = eq; i < html.length; i++) {
    const ch = html[i];
    if (inStr) { if (esc) { esc = false; continue; } if (ch === '\\') { esc = true; continue; } if (ch === '"') inStr = false; continue; }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') { depth++; started = true; }
    else if (ch === '}') { depth--; if (started && depth === 0) { end = i + 1; break; } }
  }
  return JSON.parse(html.slice(eq + 1, end).trim());
}
```

Then walk `apollo.ROOT_QUERY[<the only key that starts with "Page(">]` recursively, collecting every object that has **both** `productName` and `brandName` keys — those are the product cards. Each card has this shape (full key list):

```
{
  brandName, productName, productId, skuId,
  image: { imageUrl, ... },
  listPrice, salePrice, discount, kitPrice, priceLabel, promoText,
  rating, reviewCount, reviewAccessibilityLabel,
  variantLabel, badge, badgeTags, productCardTags,
  sponsored, isLimitedStock, bookmarked,
  action: { url, ... },                ← canonical product-detail URL
  addToBagAction, viewOptionAction, bookmarkAction, removeBookmarkAction,
  dataCapture: { ... }, dataCaptureData: { dataLayer: { Tealium: { ... } } }
}
```

The canonical product-detail URL is at `card.action.url`, shaped like `https://www.ulta.com/p/<slug>-<productId>?sku=<skuId>` (e.g. `https://www.ulta.com/p/macximal-silky-matte-lipstick-pimprod2043558?sku=2635484`). Image CDN URLs follow `https://media.ultainc.com/i/ulta/<skuId>`.

### 4. Paginate

Append `?page=N` (1-indexed; `?page=1` is identical to the bare URL):

```
https://www.ulta.com/shop/makeup/lips/lipstick?page=2
https://www.ulta.com/shop/makeup/lips/lipstick?page=3
...
```

Walk pages until you've collected ≥ `total` products (the last page returns `total mod 64` products, not a full 64). Verified: lipstick category with `total=217` returned `64 + 64 + 64 + 25 = 217` across 4 pages.

### 5. Apply filters and sort via URL params (optional)

Filters compose with each other and with `?page=N`. Pass them as query args — server returns a smaller, filtered Apollo state with its own correct count.

| Param | Example values | Notes |
|---|---|---|
| `sort` | `best_sellers` *(default)*, `price_asc`, `price_desc`, `top_rated`, `new_arrivals` | **Use `sort=`, not `sortBy=`.** `sortBy=` is silently ignored — products come back in default order. |
| `finish` | `matte`, `cream`, `glitter`, `high+shine`, `metallic`, ... | URL-encoded; spaces become `+`. |
| `form` | `liquid`, `cream`, `gel`, `stick`, `aerosol`, `balm`, `serum`, `lotion`, ... | |
| `skin+type` | `combination`, `dry`, `normal`, `oily`, `sensitive`, `all` | Literal space in key — encoded as `skin+type` in the URL. |
| `brand` | brand-slug (e.g. `mac`, `nyx-professional-makeup`) | Discoverable from the facet rail; multiple brands as repeated param. |
| `price` | `under-15`, `15-25`, `25-50`, `50-100`, `over-100` | (Verified-by-pattern from facet URLs. **`priceRange=0-15` does NOT work** — the param name is `price` and the values are bucket slugs, not min-max ranges.) |
| `page` | `2`, `3`, ... | 1-indexed; combines with everything above. |

Compose freely: `?finish=matte&sort=price_asc&page=2` is valid and the server returns the correct filtered+sorted+paginated subset. Verified: `?finish=matte` reduced lipstick from 217 → 117 and the title even updated to "Matte Lipstick - 117 Products". Filter param names match the URLs harvested from `/l/category_filter_sitemap.xml` — when in doubt, search the sitemap for `?<key>=` to confirm a key exists.

### Browser fallback

Use only when the fetch path is genuinely blocked (none observed during 2026-05-25 testing) or when you specifically need to interact with the rendered UI:

1. **Stealth + proxy session is mandatory** for the browser route. A bare session lands on Akamai's `<title>Q R Code</title>` interstitial that requires app-side verification.
   ```bash
   sid=$(browse cloud sessions create --keep-alive --verified --proxies | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
   export BROWSE_SESSION="$sid"
   ```
2. `browse open "<category-url>" --remote` then `browse wait load --remote` + `browse wait timeout 3000 --remote` before the snapshot (the product grid renders 1–3s after `load`).
3. From the snapshot, the product cards expose Add to Bag and a clickable image — **read only**, don't click the bag.
4. To paginate, change the URL — the in-page pagination control issues a new GraphQL `NonCachedPage` query whose response is non-trivial to parse, while `browse open ".../?page=N"` re-renders the same SSR Apollo state you'd get from a bare fetch.
5. Release: `browse cloud sessions update "$sid" --status REQUEST_RELEASE`.

## Site-Specific Gotchas

- **`browse cloud fetch` works without `--proxies`.** Verified across 4 distinct category URLs on 2026-05-25 — anonymous fetches return 200 with full SSR Apollo state. The browser path *does* need `--verified --proxies` (bare sessions get Akamai's "Q R Code" verification interstitial), but the fetch path bypasses Akamai entirely. Always try fetch first; only escalate to a browser session if a specific page returns `<title>ULTA.com :: Our Apologies</title>` (the "Be Right Back" ESI waiting-room — observed once when fetching `sitemap.xml` directly, never on `/shop/` URLs).
- **Use `sort=` not `sortBy=`.** `?sortBy=price-low-to-high` is silently ignored and the response is unchanged from the default sort. `?sort=price_asc` works. Sort values use underscores (`price_asc`, `best_sellers`, `top_rated`), not hyphens.
- **`priceRange=0-15` does NOT work.** The price filter param is `price=` and takes bucket slugs (`under-15`, `15-25`, etc.) — not a min-max range. If `priceRange=` appears in any URL, it's client-side state and won't affect server-rendered results.
- **`/shop/<top>` (no sub-category) is a curated landing page, not a full grid.** Only ~12 hand-picked products are inlined (`12 items`, "We think you'll like" header). For the complete top-level catalog, use `/shop/<top>/all` — e.g. `/shop/makeup/all` returns 6,657 products (~104 pages) and behaves like a leaf category. Easy to misdiagnose as a broken extractor; double-check the URL has `/all` or a sub-category appended.
- **Page size is always 64.** Hardcoded in the SSR response; no URL param overrides it. Pages 1..N-1 each contain 64 items, the last page contains `total mod 64`.
- **Last page can be empty if `page=N` exceeds the true page count.** Requesting `?page=99` on a 4-page category returns a valid HTML page with the same Apollo skeleton but 0 product cards. Stop walking when an extracted page returns 0 products, even if your computed `Math.ceil(total/64)` was wrong.
- **Sponsored products are mixed into the grid and flagged.** `card.sponsored === true` plus `card.sponsoredBadgeLabel`. Decide whether to include or exclude based on caller intent; default behavior should be to include them and pass the flag through.
- **The page title is the most reliable source for total count.** It's always `"<Leaf> - <Parent> - <N> Products | Ulta Beauty"`. `"<N> Products"` appears multiple times in the body. The Apollo `pageSize:64` is constant but no top-level `totalResults`/`totalCount` field surfaces cleanly — parse the title.
- **Don't expect `__INITIAL_STATE__` / `__NEXT_DATA__`.** Ulta uses Apollo Client, so the only inlined data is `window.__APOLLO_STATE__`. Skip the other common SSR markers.
- **JSON-LD on the page only has `BreadcrumbList`** (Home → Makeup → Lips → Lipstick), not `Product` or `ItemList`. Don't bother grepping for `@type":"Product"` — none exist in the SSR.
- **Product entity keys are not on the Apollo cache root** (no `Product:pim...` top-level entries). The data lives nested under `ROOT_QUERY.Page(...).content.modules.[ProductListingResults].productCards[]`. Walk for `{ productName, brandName }` shape, don't look up by entity ID.
- **`fetch` response size is ~2.3–4 MB per category page** (~1.5 MB Apollo state + ~1 MB CSS/JS strings). The brace-balanced extractor takes ~50ms in Node; full extract+walk for 64 products is <200ms wall.
- **Rate limit is permissive but be polite.** No formal block observed during testing, but sustained > 2 req/s starts triggering Akamai friction (occasionally a 503 from the AkamaiNetStorage tier). Keep ≤ 1 req/s and use `Accept-Encoding: br` (which `browse cloud fetch` does by default) to minimize wire bytes.

## Expected Output

```json
{
  "category_url": "https://www.ulta.com/shop/makeup/lips/lipstick",
  "category_path": ["Home", "Makeup", "Lips", "Lipstick"],
  "filters_applied": { "finish": "matte", "sort": "price_asc" },
  "total_products": 117,
  "page_size": 64,
  "pages_walked": 2,
  "products": [
    {
      "brand": "MAC",
      "name": "M·A·Cximal Silky Matte Lipstick",
      "product_id": "pimprod2043558",
      "sku": "2635484",
      "url": "https://www.ulta.com/p/macximal-silky-matte-lipstick-pimprod2043558?sku=2635484",
      "image_url": "https://media.ultainc.com/i/ulta/2635484",
      "list_price": "$25.00",
      "sale_price": null,
      "discount": null,
      "rating": 4.6,
      "review_count": 1704,
      "variant_label": "46 colors",
      "badge": "",
      "promo_text": null,
      "sponsored": false,
      "is_limited_stock": false
    }
  ]
}
```

Empty-category shape (rare — happens when an over-narrow filter combination matches nothing):

```json
{
  "category_url": "https://www.ulta.com/shop/makeup/lips/lipstick?finish=matte&price=over-100",
  "total_products": 0,
  "page_size": 64,
  "pages_walked": 1,
  "products": []
}
```

Invalid-category shape (the URL doesn't exist in Ulta's taxonomy — the server returns a 200 with an "Our Apologies" or generic 404 body):

```json
{
  "category_url": "https://www.ulta.com/shop/makeup/lips/not-a-real-leaf",
  "error": "category_not_found",
  "products": []
}
```
