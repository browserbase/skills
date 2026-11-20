---
name: zappos-com-search-shoes-j77j97
title: Zappos Search Shoes
description: >-
  Search Zappos for shoes (and apparel, bags, accessories) matching a query plus
  filter set (size, width, brand, color, price, sort, etc.) and return
  structured per-product JSON — price, brand, ratings, colorways, image URLs,
  badges, canonical URL, plus the page total and active filter chips. Read-only.
website: zappos.com
category: shopping
tags:
  - shopping
  - shoes
  - apparel
  - search
  - zappos
  - amazon
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: browser
alternative_methods:
  - method: browser
    rationale: >-
      Zappos has no public JSON API. Both the search/category surface and the
      PDP hydrate from JSON state objects embedded directly in the HTML
      (window.__INITIAL_STATE__ on search, window.__next_f on the PDP). Parsing
      those state objects in a stealth + residential-proxy Browserbase session
      is dramatically more reliable than DOM-scraping the listing cards and
      avoids the silent-degradation failure mode of bare sessions.
  - method: api
    rationale: >-
      Confirmed unavailable. Zappos is Amazon-owned but exposes no public
      Zappos-specific API. The internal calypso.zappos.com / cloudCatalog
      endpoints referenced in the embedded page config require Amazon SSO.
verified: false
proxies: true
---
# Zappos Search Shoes

## Purpose

Search Zappos for shoes (and apparel, bags, accessories) matching a query plus an optional filter set, and return the matching results as structured JSON: per-product price, brand, ratings, colorways, image URLs, badges, canonical URL, plus the page-wide total result count and the active filter chip list. Optionally drill into each product's PDP for the full size × width × stock matrix. **Read-only — never click Add to Cart, Add to Favorites, Sign In, or any purchase-flow control.**

## When to Use

- A shopping/comparison agent collecting structured product listings for a query like *"running shoes men size 11 wide"* or *"women's black leather boots under $200"*.
- Bulk extraction of Zappos's full filter surface (gender × department × size × width × color × brand × material × occasion × discount × sort), which is materially richer than Amazon's general-purpose search.
- Tasks that need the per-variant size × width × stock matrix (only available on the PDP, not the listing page).
- Resolving a Zappos product-ID list to canonical product URLs and pricing.

## Workflow

Zappos has no public JSON API. Both surfaces hydrate from a JSON state object embedded directly in the HTML — **parsing the state object is dramatically more reliable than DOM-scraping the rendered listing cards** (avoids lazy-loaded image placeholders, ref invalidation on scroll, and `srcset` ambiguity). Zappos inherits some Amazon anti-bot patterns but is lighter-touch than amazon.com proper; lead with a **Browserbase stealth + residential-proxy session**. A bare local Chromium will sometimes get a low-quality "robot-friendly" variant of the page without `colorFacet`/`txAttrFacet_*` populated — pay the stealth-proxy tax up front. Direct egress from non-Browserbase hosts is also DNS-blocked from this sandbox, so the browser is mandatory either way.

### 1. Create the session

```bash
export BROWSERBASE_API_KEY="$BB_API_KEY"
browse env remote
# Subsequent verbs auto-use this remote, stealth+proxies session.
browse open "<URL>" --advanced-stealth --proxies --keep-alive --session-timeout 600
```

`--advanced-stealth --proxies --keep-alive` should be passed on the **first** `browse open` of a session; the daemon persists the session for follow-up verbs.

### 2. Build the search URL

Accept any of these input shapes and normalize to a Zappos URL:

| Input | URL |
|---|---|
| Free-form query | `https://www.zappos.com/search?term=<urlenc-query>` |
| Query + department | `https://www.zappos.com/search?term=<q>` (Zappos's intent parser usually classifies department automatically — e.g. `running shoes men` auto-applies `txAttrFacet_Gender=Men` and `zc1=Shoes`; verify via `filters.breadcrumbs`) |
| Full Zappos URL passed by caller | Use as-is |
| Brand-browse URL | `https://www.zappos.com/brand/<brandId>` |
| Product-ID list | For each id, open `https://www.zappos.com/product/<productId>` (Zappos redirects to the canonical `/p/<slug>/product/<id>/color/<colorId>`) |
| Apply a UI-discovered filter | Use the `facetZsoUrl` value from `__INITIAL_STATE__.facets.navigation[*].values[*].facetZsoUrl` — these are pre-encoded `/filters/<slug>/<base64>.zso?t=<term>` URLs. They chain when you keep clicking, but the base64 token is not human-readable; the easiest way to build a multi-filter URL is to apply filters one at a time and follow `facetZsoUrl` each step. |

**Pagination**: append `&p=<N>` (0-indexed; 100 results per page). `__INITIAL_STATE__.filters.pageCount` tells you the total number of pages.

**Sort**: append `&s=<key>/<dir>/<key2>/<dir2>/`. Observed values: `goLiveDate/desc/recommended/desc/` (Newest), `recommended/desc/` (Best for You — default), `customerRating/desc/`, `bestSellers/desc/`, `productPrice/asc/`, `productPrice/desc/`, `brandNameFacet/asc/` (Brand A–Z), `reviewCount/desc/` (Most Reviews).

### 3. Load the page and pull the state object

```bash
browse open "$URL"
# Wait briefly for client-side hydration (search page is React + SSR, but
# facets.navigation populates a beat after initial paint).
sleep 3
RESULT=$(browse eval 'JSON.stringify({
  total: window.__INITIAL_STATE__.products.totalProductCount,
  page: window.__INITIAL_STATE__.filters.page,
  pageCount: window.__INITIAL_STATE__.filters.pageCount,
  term: window.__INITIAL_STATE__.filters.term,
  breadcrumbs: window.__INITIAL_STATE__.filters.breadcrumbs.map(b => ({
    name: b.name, removeUrl: b.removeUrl, autoFaceted: b.autoFaceted
  })),
  products: window.__INITIAL_STATE__.products.list.map(p => ({
    productId: p.productId,
    styleId: p.styleId,
    colorId: p.colorId,
    productName: p.productName,
    brandName: p.brandName,
    productType: p.productType,
    gender: p.txAttrFacet_Gender,
    color: p.color,
    styleColor: p.styleColor,
    price: p.price,
    originalPrice: p.originalPrice,
    percentOff: p.percentOff,
    onSale: p.onSale === "true" || p.onSale === true,
    isNew: p.isNew === "true" || p.isNew === true,
    rating: p.reviewRating,
    reviewCount: p.reviewCount,
    badges: (p.badges || []).map(b => b.bid),
    promoBadges: p.promoBadges || [],
    image: p.msaImageId ? `https://m.media-amazon.com/images/I/${p.msaImageId}._AC_SR768,1024_.jpg` : null,
    imageAngles: p.imageMap,
    swatchUrl: p.swatchUrl,
    colorwayCount: (p.relatedStyles || []).length + 1,
    onHand: p.onHand,
    isLowStock: p.isLowStock,
    productUrl: "https://www.zappos.com" + p.productUrl,
  })),
  facets: window.__INITIAL_STATE__.facets.navigation.map(g => ({
    field: g.facetField,
    displayName: g.facetFieldDisplayName,
    values: g.values.map(v => ({
      name: v.name, count: v.count, selected: v.selected, facetZsoUrl: v.facetZsoUrl
    }))
  }))
})')
```

### 4. Paginate (if `pageCount > 1` and caller wants > 100 results)

Loop `p=1`, `p=2`, ... up to `pageCount - 1`, re-running step 3 each time and concatenating `products`.

### 5. (Optional) Drill into the PDP for size × width × stock matrix

The search listing's `sizing` field is empty (`{}`) — the size matrix is **only** on the PDP. PDPs use Next.js streaming RSC, not `__INITIAL_STATE__`. Concatenate `window.__next_f` and parse for `allStockItems`:

```bash
browse open "$productUrl"   # https://www.zappos.com/p/<slug>/product/<id>/color/<colorId>
sleep 3
browse eval "(() => {
  const all = (window.__next_f || []).map(p => Array.isArray(p) ? p[1] : '').join('');
  const matches = [...all.matchAll(/\"size\":(\\d+(?:\\.\\d+)?),\"sizeDimensionValueId\":\"\\d+\",\"sizeDisplayText\":\"([^\"]+)\"[^}]*?\"stockId\":\"([^\"]+)\"[^}]*?\"width\":\"([^\"]+)\"[^}]*?\"isOutOfStock\":(true|false)[^}]*?\"onHand\":\"(\\d+)\"/g)];
  return JSON.stringify(matches.map(m => ({
    size: m[2],
    width: m[4],           // e.g. 'D - Medium', '2E - Wide', '4E - Extra Wide'
    stockId: m[3],
    inStock: m[5] === 'false',
    onHand: parseInt(m[6], 10)
  })));
})()"
```

The width labels on the PDP use the **letter+name** form (`D - Medium`, `2E - Wide`, `4E - Extra Wide`, `B - Medium`, `2A - Narrow`) — these are the canonical Zappos width strings. The **listing-page facet** (`hc_men_width`, `hc_women_width`) uses descriptive names only (`Extra Narrow / Narrow / Medium / Wide / Extra Wide / Extra-Extra Wide`); see the gotcha below.

### 6. Release

```bash
browse stop
```

## Site-Specific Gotchas

- **`window.__INITIAL_STATE__` exists on search/category/filter pages, but NOT on the PDP.** PDPs are a separate Next.js app that streams its state through `window.__next_f` (an array of `[type, chunk]` tuples). Concatenate `__next_f[*][1]` and string-search for keys like `"widths"`, `"allStockItems"`, `"sizing"`. The listing-page parser will silently return empty arrays on the PDP if you don't switch parsers.
- **`onSale`, `isNew`, and `isFabricSwatch` are STRING booleans (`"true"` / `"false"`)**, not real booleans. Coerce with `=== "true"`. `percentOff` is also a string (`"15%"`, `"0%"`), not a number — strip `%` and parseInt if you need a number.
- **`productRating` (integer 0–5) and `reviewRating` (decimal float like 4.2) are both present and different fields.** Use `reviewRating` for the precise stars; `productRating` is the rounded integer used in the star-icon UI.
- **Listing-page `sizing` is always `{}`** — Zappos does not expose the per-size stock matrix on the listing. You must drill into the PDP per product. Plan for this cost (one extra page load per product when callers need the size matrix).
- **Listing width facet is descriptive-only; PDP uses letter codes.** The `hc_men_width` / `hc_women_width` facet on the listing emits `Extra Narrow / Narrow / Medium / Wide / Extra Wide / Extra-Extra Wide`. The PDP's `allStockItems[*].width` emits the canonical letter form (`D - Medium`, `2E - Wide`, `4E - Extra Wide`, `B - Medium`, `2A - Narrow`, `4A - Super Narrow`, `5E`, `6E`). When the caller asks for "wide" or "2E", do the mapping client-side; don't try to pass a letter code to the listing-facet URL.
- **The intent parser auto-applies department + gender filters from the query text.** `term=running+shoes+men` auto-faceted to `zc1=Shoes` + `txAttrFacet_Gender=Men`. Verify what got applied via `__INITIAL_STATE__.filters.breadcrumbs[*]` — each chip carries `autoFaceted: true|false`. If the caller's intent didn't include that filter and the auto-facet is wrong, follow the `removeUrl` on the chip to drop it.
- **`/search?term=...` redirects to a SEO slug path** (`/{slug}/.zso?t=...`) once Zappos's intent parser classifies the query. The final URL is the canonical surface; either form works for follow-up `&p=N` pagination.
- **Filter URLs from `facetZsoUrl` chain irreversibly via an opaque base64 token.** `/filters/running-shoes-men/CK_XAeICAQE.zso?t=...` is the result of applying one filter; click another and the path becomes `/filters/running-shoes-men/CK_XAeICAQE+egLYBIIBAQTiAgEP.zso?t=...`. The token is **not** human-decodable — you cannot construct multi-filter URLs offline. Apply filters by re-issuing `browse open` against the `facetZsoUrl` of the next desired value, read the new `facets.navigation` from the response, and repeat. Budget ~1 page load per filter applied.
- **Image URL template**: from `msaImageId` (e.g. `71xtWRJ+iDL`), the full image URL is `https://m.media-amazon.com/images/I/<msaImageId>._AC_SR<W>,<H>_.jpg`. Common sizes: `SR768,1024` (large), `SR256,256` (thumb). The `imageMap` field has 8 angle codes (`MAIN`, `PAIR`, `FRNT`, `BACK`, `LEFT`, `RGHT`, `TOPP`, `BOTT`) → each is its own msaImageId; expand the same way. `thumbnailImageUrl` is frequently `null` — fall back to `msaImageId` for the cover image.
- **Canonical product URL form**: `https://www.zappos.com/p/<slug>/product/<productId>/color/<colorId>`. The `productUrl` and `productSeoUrl` fields on each listing entry are **paths**, not absolute URLs — prepend `https://www.zappos.com`.
- **Colorways**: each entry in `products.list` represents one colorway of a product. Sibling colorways are in `relatedStyles[]` (same `productId`, different `styleId` + `colorId`). Total colorway count = `relatedStyles.length + 1`. The "different colors" indicator in the UI is computed from this array.
- **Badge codes (`badges[*].bid`)**: observed values include `NEW` (new arrival), `NWC` (new with color refresh / new colorway), `EXC` (Zappos Exclusive), `BST` (best seller), `CFP` (Customer Favorite / "Customer Pick"). `promoBadges` is a separate array for site-wide promotions (e.g. discount codes). Zappos does not show "Amazon's Choice" labels here — that is Amazon-proper-only.
- **Free shipping & free 365-day returns are universal site policies, not per-product flags.** No per-listing field exists; emit them as constants in the output schema (`free_shipping: true`, `free_returns: "365 days"`). Zappos has carried free 365-day returns since 2009.
- **Stealth + residential proxy on the first session create is mandatory.** Without `--advanced-stealth --proxies` the page will frequently load but with hydration shapes that suggest a "robot-friendly" variant — `facets.navigation` populated but `products.list` truncated, or `facetZsoUrl` values returning 200 with zero results. We did not observe an explicit Akamai 403 in one full iteration of search + filter + sort + PDP, so anti-bot is lighter-touch than amazon.com — but the failure mode is silent degradation rather than a hard block. Lead with stealth.
- **The Vercel sandbox cannot do direct `curl` to `www.zappos.com`** — DNS resolution is blocked from this egress. All page fetches must route through the Browserbase session. Don't waste a turn trying.
- **Anchor `/p/<slug>/product/<id>` (no `/color/`) works too** and redirects to the default colorway. Useful when you only have a product-ID list and don't know the colorId.
- **Price string in the PDP RSC payload has a doubled dollar sign (`"$$320.00"`)** — a JSON-encoding artifact of Next.js's RSC `$` prefix for reference markers. Strip one `$` when parsing PDP prices. The search listing's `price` field is clean (`"$139.95"`).
- **No size/width per-letter facet on the listing for kids.** Zappos splits size facets by gender (`hc_men_size`, `hc_women_size`, `hc_kids_size`) — pick the right one based on the active `txAttrFacet_Gender` breadcrumb. Mixing them returns 0 results.
- **Pagination cap**: `pageCount` is capped at ~50 (5000 results); searches that would return more are silently truncated. Use additional facets to narrow if the caller needs deeper drill.

## Expected Output

```json
{
  "query": "running shoes men",
  "url": "https://www.zappos.com/running-shoes-men/.zso?t=running+shoes+men",
  "total_results": 738,
  "page": 0,
  "page_count": 8,
  "active_filters": [
    { "field": "zc1",                "name": "Shoes", "auto_faceted": true },
    { "field": "txAttrFacet_Gender", "name": "Men",   "auto_faceted": true }
  ],
  "available_facets": [
    {
      "field": "hc_men_width",
      "display_name": "Men's Shoe Width",
      "values": [
        { "name": "Medium",           "count": 724, "selected": false },
        { "name": "Wide",             "count": 180, "selected": false },
        { "name": "Extra Wide",       "count": 6,   "selected": false },
        { "name": "Extra-Extra Wide", "count": 59,  "selected": false }
      ]
    }
  ],
  "products": [
    {
      "product_id": "10016301",
      "style_id":   "6586960",
      "color_id":   742,
      "product_name": "Velocity Nitro Running Shoes",
      "brand":      "PUMA",
      "product_type": "Shoes",
      "gender": ["Men"],
      "color": "White",
      "style_color": "White/Black",
      "price":          { "formatted": "$139.95", "raw": 139.95, "currency": "USD" },
      "original_price": { "formatted": "$139.95", "raw": 139.95, "currency": "USD" },
      "percent_off": 0,
      "on_sale": false,
      "is_new": false,
      "rating": 4.2,
      "review_count": 6,
      "badges":       ["NWC"],
      "promo_badges": [],
      "colorway_count": 4,
      "image": "https://m.media-amazon.com/images/I/71xtWRJ+iDL._AC_SR768,1024_.jpg",
      "image_angles": {
        "MAIN": "https://m.media-amazon.com/images/I/71xtWRJ+iDL._AC_SR768,1024_.jpg",
        "PAIR": "https://m.media-amazon.com/images/I/71xtWRJ+iDL._AC_SR768,1024_.jpg",
        "FRNT": "https://m.media-amazon.com/images/I/61NLcuacfhL._AC_SR768,1024_.jpg",
        "BACK": "https://m.media-amazon.com/images/I/61cnsdix22L._AC_SR768,1024_.jpg",
        "LEFT": "https://m.media-amazon.com/images/I/61M8uJd0QuL._AC_SR768,1024_.jpg",
        "RGHT": "https://m.media-amazon.com/images/I/71c0Tde3tGL._AC_SR768,1024_.jpg",
        "TOPP": "https://m.media-amazon.com/images/I/71ATXAEyjHL._AC_SR768,1024_.jpg",
        "BOTT": "https://m.media-amazon.com/images/I/61v1EiyFv8L._AC_SR768,1024_.jpg"
      },
      "swatch_url": "https://swch-cl2.olympus.zappos.com/fabric/27567/27580/10016301/6586960.jpg",
      "product_url": "https://www.zappos.com/p/puma-velocity-nitro-running-shoes-white-black/product/10016301/color/742",
      "in_stock": true,
      "on_hand_estimate": 17,
      "is_low_stock": false,
      "free_shipping": true,
      "free_returns": "365 days",
      "size_matrix": null
    }
  ]
}
```

When the caller requests the **size × width matrix** (one extra PDP load per product):

```json
"size_matrix": [
  { "size": "8",    "width": "D - Medium", "stock_id": "61282569",                              "in_stock": true,  "on_hand": 1 },
  { "size": "8.5",  "width": "D - Medium", "stock_id": "61282724",                              "in_stock": true,  "on_hand": 1 },
  { "size": "9",    "width": "D - Medium", "stock_id": "out_of_stock_1141186_61808_2831",       "in_stock": false, "on_hand": 0 },
  { "size": "9.5",  "width": "D - Medium", "stock_id": "61282860",                              "in_stock": true,  "on_hand": 3 },
  { "size": "10",   "width": "2E - Wide",  "stock_id": "61283401",                              "in_stock": true,  "on_hand": 2 }
]
```

When the query returns **zero results** (rare — Zappos's typo-correction and intent-parser usually rescue queries; observed only when forcing impossible filter combinations like `hc_men_size=22` on a women-only category):

```json
{
  "query": "<original query>",
  "total_results": 0,
  "products": [],
  "active_filters": [...],
  "autocorrect": "running shoes men",
  "no_results_reason": "filter_intersection_empty"
}
```
