---
name: dior-com-find-all-products-qxm8lj
title: Dior Find All Products
description: >-
  Enumerate every product in Dior's storefront for a given locale via the public
  Algolia search index for /fashion (~5.7k products per locale, 18 API calls)
  and the per-locale beauty sitemap for /beauty (~350 products). Returns
  objectID, name, category path, price, color, material, image, URL, and stock
  state per product. Read-only.
website: dior.com
category: luxury-retail
tags:
  - luxury
  - fashion
  - beauty
  - catalog
  - algolia
  - akamai
  - read-only
source: 'browserbase: agent-runtime 2026-05-21'
updated: '2026-05-21'
recommended_method: hybrid
alternative_methods:
  - method: api
    rationale: >-
      Fashion catalog (~5.7k products per locale) is served by a public Algolia
      search index. Region-specific app IDs (CLOUD_US=C1J7AZ5107,
      CLOUD_EU=6EGOOSX817, CLOUD_JP=9CHAZ88O0K) and search-only API keys are
      inlined in any fashion page's window.__ENV__. Slice by
      category_lvl0/category_lvl1 to defeat the 1000-result paginationLimitedTo
      cap; full dump in ~18 POSTs.
  - method: fetch
    rationale: >-
      Beauty catalog (~350 products per locale) has no public JSON API —
      SFCC/Demandware OCAPI and controller endpoints return 404. The per-locale
      sitemap at /{locale}/beauty/sitemap.xml is the only canonical product-URL
      source; product IDs (Y\d{7}) are encoded in the URL and image URLs are
      constructable from them.
  - method: browser
    rationale: >-
      Per-product hydration on beauty (and Algolia-key re-discovery when keys
      rotate) needs a stealth Browserbase session (--verified --proxies) because
      Akamai 403s direct origin fetches of dior.com PDPs.
verified: true
proxies: true
---
# Dior Find All Products

## Purpose

Enumerate every product currently offered on Dior's storefront for a given locale and return one record per product (objectID, name, category path, price, color, material, primary image asset, product URL, stock availability). The fashion (couture) catalog is served by a public Algolia search index — full catalog dumps in ~18 HTTP calls, no auth flow, no anti-bot. The beauty catalog runs on a separate Salesforce Commerce Cloud (SFCC/Demandware) stack with no public JSON API; the recommended path there is the per-locale sitemap (`/{locale}/beauty/sitemap.xml`) plus optional stealth-browser hydration of individual product detail pages. Read-only — never adds to cart, places orders, or signs in.

## When to Use

- Daily or weekly snapshot of the entire fashion catalog for a locale (price + availability monitoring, new-arrival detection, color/material/category analytics).
- Cross-locale comparison (US vs UK vs Japan vs France assortments and pricing).
- Building a search index, product feed, or affiliate catalog mirror.
- Fashion is the primary path (~5.7k products, fully structured JSON). Beauty (~350 products) is sitemap + browser scrape.

## Workflow

### Recommended method — fashion: public Algolia API (no browser needed)

Every Dior `/{locale}/fashion/*` listing page is rendered client-side from a public Algolia search index. The Algolia App ID + search-only API Key are inlined in `window.__ENV__` of any fashion page and are stable across locales — they are the production keys, not staging. The endpoint requires no cookies, no `Referer`, no stealth, and no proxy. The only constraint is Algolia's per-query pagination cap (`paginationLimitedTo` ≈ 1000 hits per query for these keys, `browse` ACL is disabled), so a full catalog dump slices by `category_lvl0` / `category_lvl1` facets.

**Region → App ID → API Key → index name** (verified 2026-05-21 against `dior.com/{locale}/fashion`):

| Region (cloud) | App ID | Search API Key | Index name pattern | Verified locales |
|---|---|---|---|---|
| US | `C1J7AZ5107` | `2c1e320cc4d942713a65869b99252740` | `search_prod_live_{locale}` | `en_us` (5,736 products) |
| EU | `6EGOOSX817` | `5d568623ff9f43194a18399a53d04ae4` | `search_prod_live_{locale}` | `fr_fr` (5,946), `en_gb` (5,971) |
| JP | `9CHAZ88O0K` | `feb72a58eb3214acf582857bc6e8e04a` | `search_prod_live_{locale}` | `ja_jp` (5,537) |

For any other locale, pull `window.__ENV__` from one of its fashion pages (e.g. `https://www.dior.com/en_int/fashion/womens-fashion/all-ready-to-wear`) and read `ALGOLIA_CLOUD_{REGION}_APP_ID` / `ALGOLIA_CLOUD_{REGION}_API_KEY` / `ALGOLIA_CLOUD_{REGION}_LOCALES` to map locale → region. The fashion page HTML is itself protected by Akamai for *some* network shapes, so use a stealth Browserbase session (`browse cloud sessions create --verified --proxies`) to fetch it the first time per locale, cache the result, and never re-do the bootstrap fetch.

1. **Discover bucket sizes for the locale**:
   ```
   POST https://{APPID}-dsn.algolia.net/1/indexes/search_prod_live_{locale}/query
   X-Algolia-Application-Id: {APPID}
   X-Algolia-API-Key: {KEY}
   Content-Type: application/json
   Body: { "query": "", "hitsPerPage": 0, "facets": ["category_lvl0","category_lvl1"] }
   ```
   The response's `facets.category_lvl0` is a small map (5 buckets for en_us: Women=3405, Men=1567, Baby Dior=514, Jewellery=152, Timepieces=96). Anything ≤ 1000 is fetchable in one query; anything > 1000 needs lvl1 drill-down (Women + Men in en_us).

2. **Fetch each bucket**. For buckets ≤ 1000:
   ```
   Body: {
     "query": "",
     "hitsPerPage": 1000,
     "filters": "category_lvl0:\"Baby Dior\"",
     "attributesToRetrieve": ["objectID","name","subtitle","description","price","minimumPrice","categories","category_lvl0","category_lvl1","category_lvl2","category_lvl3","color.label","color.code","material.label","damAssets.defaultView","variants.size","stock.hasStock","levelOfStocks","availableOnline","isNew","is_bestseller","collection","saison_diorcom"],
     "attributesToHighlight": []
   }
   ```
   For buckets > 1000 (Women, Men in en_us), first re-facet within the bucket:
   ```
   Body: { "query":"", "hitsPerPage":0, "filters":"category_lvl0:\"Women\"", "facets":["category_lvl1"] }
   ```
   then iterate `category_lvl1` values and send one query per `(lvl0, lvl1)` pair:
   ```
   Body: { "query":"", "hitsPerPage":1000, "filters":"category_lvl0:\"Women\" AND category_lvl1:\"Clothing\"", ... }
   ```
   The deepest split needed in practice is two levels — every `(lvl0, lvl1)` pair observed on en_us is < 1000.

3. **Construct product URL from `objectID`**: `https://www.dior.com/{locale}/fashion/products/{objectID}` (e.g. `KCO531DET_S30T` → `…/fashion/products/KCO531DET_S30T`). The objectID is `{styleCode}_{colorCode}` — a SKU-variant key, already deduped at the color level.

4. **Construct image URL from `damAssets.defaultView.viewCode`**: `https://assets.christiandior.com/is/image/diorprod/{objectID}_{viewCode}-1?wid=800&hei=1000` (Scene7 path; the viewCode is typically `E01`/`E02`/`E03`). The fashion image base path is hard-coded on the Scene7 CDN — not in `window.__ENV__`.

5. **Verify totality**: sum hits across every bucket and compare to the `nbHits` of an unfiltered `hitsPerPage:0` query. Expect a small (< 1%) gap from products that fall outside the lvl0+lvl1 taxonomy entirely (2 / 5,736 missing on en_us 2026-05-21). To recover them, run a final unfiltered `hitsPerPage:1000, page:0` query and union the result.

Total cost for en_us full dump: 18 Algolia POSTs, ~5 seconds wall, $0 LLM. Cross-locale: multiply by however many locales you need.

### Recommended method — beauty: sitemap + optional stealth-browser hydration

Beauty runs on SFCC/Demandware (site name `dior_us`, master library `BGXS_PRD`). No public JSON API — OCAPI (`/s/BGXS_PRD/dw/shop/v22_8/...`) returns 404 from the public origin; `Sites-DiorUS-Site` and `Sites-dior_us-Site` Demandware controller paths (Search-Show, Product-Show) also 404. The beauty catalog must be enumerated from the per-locale beauty sitemap.

1. **Get the product URL list** (no browser, no proxy):
   ```
   GET https://www.dior.com/{locale}/beauty/sitemap.xml
   ```
   Parse `<loc>…/beauty/products/{slug}-{Y\d+}.html</loc>` entries. For `en_us`: 347 product URLs out of 555 total entries (rest are editorial pages, fragrance landing pages, etc.).

2. **Extract product ID from URL**: the trailing `Y\d{7}` token is the SFCC master product ID (e.g. `Y0998004` for *Sauvage Parfum*). Image URLs follow `https://www.dior.com/dw/image/v2/BGXS_PRD/on/demandware.static/-/Sites-master_dior/default/dw{hash}/{Y_ID}/{Y_ID}_C{COLOR_ID}_E{VIEW}_{R|G}HC.jpg`.

3. **Hydrate per-product detail** (optional — only if you need title, price, description, in-stock state). The beauty PDP is server-rendered behind Akamai. Use a stealth Browserbase session:
   ```bash
   sid=$(browse cloud sessions create --keep-alive --verified --proxies | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s.match(/\{[\s\S]*\}/)[0]).id))")
   browse open "https://www.dior.com/en_us/beauty/products/sauvage-parfum-Y0998004.html" --remote --session "$sid"
   browse get title --remote --session "$sid"
   browse get html body --remote --session "$sid"
   ```
   Title comes back clean (e.g. `"Sauvage Parfum: Refillable Citrus and Woody Fragrance | Dior US"`). Price strings (`$199.00`) are inline in the HTML; there is no JSON-LD `Product` block, so regex the rendered DOM rather than waiting for structured data.

4. **Pace and reuse the session**: keep the same stealth session warm across requests (one `--keep-alive` session can fetch hundreds of beauty pages serially). Don't open new sessions per URL — that triggers Akamai re-challenges.

### Browser fallback (if Algolia keys ever rotate or get rate-limited)

The fashion side has a fallback at `https://www.dior.com/{locale}/fashion/{category}/all-{type}` listing pages (e.g. `/en_us/fashion/womens-fashion/all-ready-to-wear`). These are CSR React pages — `browse snapshot` returns few refs, so don't drive clicks. Instead, scroll/lazy-load triggers more Algolia calls; you can also extract `window.__ENV__` directly from any fashion page HTML to rediscover the Algolia keys if the values in this skill ever change. Stealth + residential proxy (`--verified --proxies`) is mandatory for direct fetches; a bare proxy fetch lands on an Akamai challenge page (`sec-if-cpt-container` div, `Powered and protected by Akamai`).

For beauty there is no API fallback — the sitemap + stealth browser path is the only path.

## Site-Specific Gotchas

- **Two different storefronts share `dior.com`**: `/fashion/*` is a React SPA driven by Algolia; `/beauty/*` is a Salesforce Commerce Cloud (`Sites-dior_us-Site`) classic-rendered site. Their product ID spaces don't overlap (fashion = `{8-9chars}_{4chars}` like `KCO531DET_S30T`; beauty = `Y\d{7}` like `Y0998004`), their image CDNs are different (`assets.christiandior.com/is/image/diorprod/` vs `www.dior.com/dw/image/v2/BGXS_PRD/on/demandware.static/`), and the data-acquisition strategy is different for each. Always handle them as two separate pipelines, then merge.
- **The Algolia search key is search-only**: `listIndexes` returns 403 ("missing ACL list"), the `browse` endpoint returns 403 ("missing ACL browse"), and `paginationLimitedTo` caps `query` results at the first 1000 hits per request — `nbPages` will be `1` even when `nbHits` is 5,736. **Slice by facet** (`category_lvl0` then `category_lvl1`) to get the rest. Don't bother trying `page: 1, 2, 3, ...` — those return empty.
- **`merch_prod_live_en_us` is the wrong index for product enumeration**: it lives on a different app (`KPGNQ6FJI9`), holds 6,419 entries, and includes "push" / promotional card objects (objectID prefix `push-NNNNNN`) interleaved with real products. The clean catalog is `search_prod_live_{locale}` on the `CLOUD_{region}` apps.
- **Locales are split across three Algolia apps**: `ALGOLIA_CLOUD_US_LOCALES=en_us`, `ALGOLIA_CLOUD_EU_LOCALES=fr_fr,en_gb`, `ALGOLIA_CLOUD_JP_LOCALES=ja_jp` — these are the only locales explicitly mapped in `window.__ENV__` as of 2026-05-21. Other dior.com locales (e.g. `en_int`, `es_es`, `de_de`, `it_it`) likely route to the EU app but were not verified in this skill's iteration. Test before trusting.
- **`merch_prod_live_{locale}` indexes are 403 from the CLOUD apps and 200 from MERCH**, but the MERCH app does not have search indices for other locales — the apps are partitioned by *role* (search vs merchandising) AND by region. Don't cross-query.
- **The `PRODUCTS_FRA` index on the CDC app (`N0ZEMF08FA`) is the internal master catalog**: 352,729 entries, French-language metadata, exploded to every size/color variant, includes internal codes (`reference_style_couleur`, `code_distribution`, `talendUpdatedAt`). It's a leaked internal index — useful for deep enrichment if needed, but not the right surface for a customer-facing product list. The customer-facing surface is `search_prod_live_{locale}`.
- **`objectID` is style+color, not style alone**: a single named product like "Dior Book Tote" appears once per color variant (e.g. `M1296ZRIW_M928`, `M1296ZRIW_M928…` — same first 9 chars, different suffix). If you want deduped "design" rows, group by the prefix before `_`. If you want every purchasable color, keep the objectID as-is.
- **No `url` / `permalink` / `slug` field in the Algolia hit** — construct it: `https://www.dior.com/{locale}/fashion/products/{objectID}`. The same objectID is the canonical path segment used by the React router.
- **Image URL is constructed, not stored**: only `damAssets.defaultView.viewCode` is in the hit. Full URL: `https://assets.christiandior.com/is/image/diorprod/{objectID}_{viewCode}-1?wid=800&hei=1000`. Scene7 supports `wid`/`hei`/`scale` params for resizing; preset names like `r4x5listing` are also valid.
- **Sitemap is bigger than Algolia**: `/{locale}/fashion/sitemap.xml` has 6,104 product URLs for en_us, but Algolia reports 5,736 live products. The ~370-product gap is archived/discontinued URLs that still return a 200 on the PDP (with a "no longer available" message) but are excluded from the search index. If you want *purchasable* products, use Algolia; if you want *every URL Dior has ever shipped under `/fashion/products/`*, use the sitemap.
- **Beauty has no JSON-LD**: the SFCC PDP renders product info as plain HTML — no `<script type="application/ld+json">` Product block, no inline `window.__APP_CONFIG__` style global. Title is in `<title>`, prices in the visible DOM as `$NNN.NN` strings. Plan for regex-on-DOM, not JSON parsing.
- **Akamai challenges direct PDP fetches**: `browse cloud fetch --proxies https://www.dior.com/en_us/fashion/products/{objectID}` returns a 403 "Page unavailable" page (with `Reference ID` and an Akamai challenge script). Stealth + verified + residential proxies in a real Chrome session passes. Listing pages have the same protection. Algolia bypasses Akamai entirely — it's a third-party host (`*.algolia.net`).
- **Don't waste time on**: SFCC OCAPI (`/s/BGXS_PRD/dw/shop/v22_8/products/*` → 404), Demandware Search-Show / Product-Show controllers under `Sites-DiorUS-Site` or `Sites-dior_us-Site` (both 404 from the public origin), `https://api-fashion.dior.com/*` (private, requires JWT from a logged-in dior.com session), the GraphQL endpoint pattern (none observed for fashion or beauty).

## Expected Output

```json
{
  "locale": "en_us",
  "fashion_total": 5736,
  "beauty_total": 347,
  "products": [
    {
      "section": "fashion",
      "objectID": "KCO531DET_S30T",
      "style_code": "KCO531DET",
      "color_code": "S30T",
      "name": "Dior Dentelle Slide",
      "subtitle": "Trench beige embroidered cotton with Dior Oblique motif and white lace",
      "description": "Designed by Jonathan Anderson for the House, the Dior Dentelle slide is a subtle new take on Dior codes of elegance...",
      "categories": ["Women", "Shoes", "Sandals"],
      "category_lvl0": "Women",
      "category_lvl1": "Shoes",
      "category_lvl2": "Sandals",
      "price": { "value": 890, "currency": "USD" },
      "color": { "label": "Beige", "code": "S30T" },
      "material": { "label": "Cotton" },
      "variants": [{ "size": "T34" }, { "size": "T345" }, { "size": "T35" }],
      "stock": { "hasStock": true, "level": "normal" },
      "available_online": true,
      "is_new": false,
      "url": "https://www.dior.com/en_us/fashion/products/KCO531DET_S30T",
      "image_url": "https://assets.christiandior.com/is/image/diorprod/KCO531DET_S30T_E02-1?wid=800&hei=1000"
    },
    {
      "section": "beauty",
      "product_id": "Y0998004",
      "slug": "sauvage-parfum",
      "name": "Sauvage Parfum",
      "url": "https://www.dior.com/en_us/beauty/products/sauvage-parfum-Y0998004.html",
      "price": "$199.00",
      "image_url": "https://www.dior.com/dw/image/v2/BGXS_PRD/on/demandware.static/-/Sites-master_dior/default/dw8bef6812/Y0998004/Y0998004_C099600455_E01_RHC.jpg?sw=800",
      "source": "sitemap+pdp"
    }
  ],
  "discovery_meta": {
    "fashion_index": "search_prod_live_en_us",
    "fashion_app": "C1J7AZ5107",
    "fashion_queries_used": 18,
    "fashion_unique_ids": 5734,
    "fashion_reported_nb": 5736,
    "fashion_coverage_pct": 99.96,
    "beauty_sitemap": "https://www.dior.com/en_us/beauty/sitemap.xml",
    "beauty_urls_in_sitemap": 555,
    "beauty_product_urls": 347
  }
}
```
