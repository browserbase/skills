---
name: thegoodguys-com-au-get-all-products-yqnslb
title: The Good Guys — Get All Products
description: >-
  Enumerate the full active product catalog of thegoodguys.com.au — every
  listing's id, handle, URL, title, brand, price (AUD), image, category
  breadcrumb, inventory state, and attribute map. Uses the storefront's public
  Algolia search index with cursor pagination via a price-sorted replica; falls
  back to the Shopify sitemap for URL-only enumeration.
website: thegoodguys.com.au
category: ecommerce
tags:
  - ecommerce
  - catalog
  - shopify
  - algolia
  - australia
source: 'browserbase: agent-runtime 2026-05-24'
updated: '2026-05-24'
recommended_method: api
alternative_methods:
  - method: fetch
    rationale: >-
      The Shopify sitemap at
      sitemap.thegoodguys.com.au/product_sitemap_{1..4}.xml gives ~8,791 product
      URLs + first images + sitemap-rebuild-time lastmod, in 4 GET requests. Use
      when only URL enumeration is needed; the Algolia path is required for any
      price/title/inventory data.
  - method: browser
    rationale: >-
      Browsing the Algolia-driven category grids on the storefront works but
      pays a ~100× cost premium versus the direct API. Reserved as last-resort
      fallback if Algolia credentials rotate and can't be re-mined from the
      page-injected ENV blob.
verified: true
proxies: true
---
# The Good Guys — Get All Products

## Purpose

Enumerate the full active product catalog of **thegoodguys.com.au** — every listing currently published on the storefront — and return each product's identifier, URL handle, title, brand, price, image, category path, and availability. Read-only; never adds to cart, never sees account-scoped pricing.

Two parallel data planes are available and both confirmed working as of 2026-05-24:

1. **Algolia public search index** (`recommended_method: api`) — returns fully-hydrated product records (title, brand, price, inventory, hierarchical categories, images, attributes). 1000-record-per-query ceiling, worked around with cursor pagination via the `shopify_prdproducts_price_asc` replica + `numericFilters`. ~10–11 requests for the whole catalog (~9,261 products).
2. **Shopify sitemap** — 4 sub-sitemaps (`product_sitemap_1..4.xml`) with ~8,791 product URLs + first-image URLs + `lastmod`. No price/title/inventory. Use this when you only need the URL list, or as a cross-check against Algolia.

The site is **Shopify Oxygen / Hydrogen** (headless). The classic Shopify Storefront JSON endpoints (`/products.json`, `/collections/all/products.json`, `/collections.json`) are explicitly 404'd by the Hydrogen router — **do not waste time on those**.

## When to Use

- Building a complete catalog mirror for price-monitoring, inventory tracking, or competitive analysis.
- Daily / weekly diffing — Algolia returns `created_at` per product, sitemap exposes per-URL `lastmod`.
- Bulk feature extraction (categories, dimensions, attributes) before per-product deep-dives.
- Backfill jobs that need an authoritative "what exists right now" list.

## Workflow

### Recommended: Algolia direct (full data, ~10 requests)

The storefront's JS bundles inject Algolia search-only credentials in the SSR HTML. They are **public, client-visible keys** — no auth handshake, no cookies, no anti-bot stealth. The sandbox cannot resolve `*-dsn.algolia.net` directly, so route the calls through Browserbase fetch or a browser session.

**Credentials** (from page-injected ENV; if rotated, re-mine from any category page like `/televisions`, search the HTML for `ALGOLIA_APP_ID`):

```
ALGOLIA_APP_ID        = 5H1IDVST06
ALGOLIA_API_KEY       = 81c25e5beef29a96c13e0c011294b307   (search-only)
ALGOLIA_PRODUCT_INDEX = shopify_prdproducts
ALGOLIA_REPLICAS      = shopify_prdproducts_price_asc      (price ascending)
                        shopify_prdproducts_price_desc     (price descending)
ALGOLIA_QUERY_SUGG    = shopify_prdproducts_query_suggestions
```

1. **Get total count** (sanity check):
   ```http
   POST https://5H1IDVST06-dsn.algolia.net/1/indexes/shopify_prdproducts/query
   X-Algolia-Application-Id: 5H1IDVST06
   X-Algolia-API-Key: 81c25e5beef29a96c13e0c011294b307
   Content-Type: application/json

   { "query": "", "hitsPerPage": 0, "page": 0 }
   ```
   Response `nbHits` is the live catalog size (9,261 on 2026-05-24).

2. **Paginate via the price-ascending replica with cursor `numericFilters`.** The base index hard-caps at 1000 hits returned per query, so naive `page=N` pagination tops out at 1000 records. The fix is cursor pagination on the `_price_asc` replica:

   ```http
   POST https://5H1IDVST06-dsn.algolia.net/1/indexes/shopify_prdproducts_price_asc/query
   Body: {
     "query": "",
     "hitsPerPage": 1000,
     "page": 0,
     "attributesToRetrieve": [
       "id","handle","title","vendor","product_type","price","compare_at_price",
       "image","inventory_available","categories","collections","tags","sku",
       "meta.tgg.breadcrumb","meta.tgg.aggregate_rating","meta.tgg.model_number",
       "meta.tgg.l2category","meta.tgg.l3category"
     ],
     "numericFilters": ["price >= 0"]
   }
   ```

   On each response, take `maxPrice = max(hits[].price)`, then issue the next request with `"numericFilters": ["price >= " + maxPrice]`. **Dedupe by `id`** across the cursor boundary — products that share the boundary price will re-appear in the next batch and must be filtered out. Stop when `hits.length === 0` (typically ~10 requests for a 9k catalog).

3. **Decode each hit**. Useful top-level fields per record:
   - `id` — Shopify product ID (numeric, e.g. `7579558871105`).
   - `handle` — URL slug. Canonical product URL = `https://www.thegoodguys.com.au/{handle}`.
   - `title`, `vendor`, `product_type`, `sku`.
   - `price` (AUD, integer dollars), `compare_at_price` (0 when not on sale).
   - `image` — first product image (`cdn.shopify.com/...`).
   - `inventory_available` (boolean), `inventory_quantity` (signed; negative on backorder), `inventory_policy` (`deny` / `continue`).
   - `categories.lvl0..lvl3` — hierarchical taxonomy. **WARNING:** `lvl0` contains BOTH category roots (e.g. `heating-and-cooling`) AND vendor slugs (e.g. `ewt`) as parallel entries in the same array. Use `meta.tgg.breadcrumb` (single underscore-delimited path like `heating-and-cooling_heaters_electric-heaters`) for the canonical category, not `lvl0`.
   - `collections` — flat list of all collections the product appears in (incl. promo collections like `deals_heaters`, `clearance`, `gifts_under-100`).
   - `meta.tgg.algolia_attributes` — flat key/value map of product specs (dimensions, power, features). Keys are dot-namespaced like `general-information_colour`, `power-and-charging_power`, `product-dimensions_product-height-mm`.
   - `meta.tgg.callouts` / `meta.tgg.algolia_promotions` — active promo tags + end dates.

4. **Construct canonical product URL**:
   ```
   https://www.thegoodguys.com.au/{handle}
   ```
   No category/brand prefix is needed — handles are root-level on the Hydrogen storefront.

### Alternative: Sitemap-only (URL list, ~4 requests)

If you only need URLs + image refs + last-modified timestamps (no price/title/inventory), fetch the sitemap. Faster (~4 requests, ~3 MB total), but ~5% lighter than Algolia's count (8,791 vs 9,261 — see gotchas).

1. **Get sitemap index**:
   ```
   GET https://www.thegoodguys.com.au/sitemap.xml
   ```
   Returns 4 product sub-sitemaps (`product_sitemap_1..4.xml`) plus brand/category/content/article/storelocation sub-sitemaps.

2. **Fetch each product sub-sitemap** at `https://sitemap.thegoodguys.com.au/product_sitemap_N.xml` for N = 1..4. Each `<url>` block contains:
   - `<loc>` — full product URL (extract the handle by stripping `https://www.thegoodguys.com.au/`).
   - `<lastmod>` — ISO timestamp of last index rebuild (all products in a given sitemap share the rebuild time, NOT per-product change time).
   - `<image:image><image:loc>` — first product image URL.

3. Sitemap 1-3 each contain 2,500 URLs; sitemap 4 has the remainder (1,291 on 2026-05-24). Total: 8,791 URLs.

### Browser fallback (only if both APIs become unavailable)

Open `https://www.thegoodguys.com.au/all-products` or a top-level category page and paginate. The product grid is fully Algolia-driven client-side InstantSearch — the SSR'd HTML includes ~24 hydrated products per page. Pagination URLs use `?page=N`. This is **~100× slower** than the API path and is included only as a last-resort fallback. Use the API.

## Site-Specific Gotchas

- **Stock Shopify endpoints are 404'd.** `/products.json`, `/collections/all/products.json`, and `/collections.json` all return HTTP 404 with the Hydrogen "Page Not Found" page. This is a Hydrogen storefront, not a classic Online Store theme — the Storefront JSON API is not exposed on the customer domain. Don't burn iterations trying them.
- **Algolia credentials are page-injected, not in the JS bundle.** The `AlgoliaClientContext-*.js` bundle reads `ENV.ALGOLIA_APP_ID` / `ENV.ALGOLIA_API_KEY` from a server-rendered ENV blob in the HTML. If you grep the JS bundle for the appId, you'll find nothing. To re-mine credentials when they rotate, fetch any category page (e.g. `/televisions`), then `grep -oE '"ALGOLIA_APP_ID","[A-Z0-9]+"' html`. The keys are **search-only and intentionally public** — they ship on every page load.
- **1000-record ceiling per Algolia query.** `page=999` returns `{"nbHits":0,"message":"you can only fetch the 1000 hits..."}`. The `/browse` endpoint that bypasses this limit is **403 with this search-only key** — admin keys are not available. Cursor-paginate via `shopify_prdproducts_price_asc` + `numericFilters: ["price >= LAST_MAX"]` with dedup by `id`.
- **Sitemap count (8,791) ≠ Algolia count (9,261).** ~470 product delta. Algolia includes the full set including OOS / no-longer-orderable / staged items; the sitemap is a subset reflecting whatever the SEO pipeline last published. If you need the complete catalog, **use Algolia**. If you only need indexable/active products, sitemap is fine.
- **`categories.lvl0` mixes categories and brands.** Example record: `"categories":{"lvl0":["heating-and-cooling","ewt"]}`. Iterating `lvl0` to slice the catalog will double-count every product. Use `meta.tgg.breadcrumb` (underscore-delimited single path) for the canonical category, or use the `vendor` field for the brand.
- **Sandbox cannot resolve `*-dsn.algolia.net` directly.** Running `curl https://5H1IDVST06-dsn.algolia.net/...` from the sandbox fails with `Could not resolve host`. Route via `browse cloud fetch <url> --proxies` (note: fetch is GET-only) OR via `browse eval` inside a `browse cloud sessions create` session (supports POST). The eval path is what works for the Algolia POST body.
- **`browse cloud fetch` is GET-only.** Doesn't accept `--method POST`, `--body`, or `--header`. For POST to Algolia, use `browse eval "(async () => { const r = await fetch(..., {method:'POST',...}); return await r.json(); })()"` from inside an active session.
- **Sitemap `lastmod` is the sitemap rebuild time, not per-product change time.** All URLs in a given sitemap share the same `lastmod`. Don't use it as a per-product change signal — use Algolia's `created_at` or hash the full record instead.
- **`price` is in AUD integer dollars.** No fractional cents. A product priced at A$79.95 has `price: 79` in the record (the storefront rounds visually). For exact pricing, scrape the product page or rely on `compare_at_price` + storefront-rendered HTML.
- **Algolia's `/browse` endpoint is 403 with the public key.** Don't try to use it as a workaround for the 1000-cap — only the cursor-via-replica path works.
- **No GraphQL Storefront API exposed.** Standard Shopify Storefront GraphQL would let you enumerate everything cleanly with a private access token, but Hydrogen routes don't expose `/api/{api_version}/graphql.json` on the customer domain. Algolia is the documented public surface.
- **Robots.txt disallows `/products/` and `/search`.** The Algolia API and sub-domain `sitemap.thegoodguys.com.au` are NOT mentioned in robots.txt — neither is disallowed. Standard rate-limit hygiene applies: keep ≤ 5 req/s on Algolia.
- **No anti-bot / Akamai layer observed.** Both Algolia and `www.thegoodguys.com.au` respond 200 from bare Browserbase sessions and `browse cloud fetch` without `--verified` or `--proxies`. The `--proxies` flag is recommended for AU-origin geo-consistency but not required.

## Expected Output

The skill emits a flat array of product records. Schema:

```json
{
  "source": "algolia",
  "fetched_at": "2026-05-24T17:35:00Z",
  "total_products": 9261,
  "products": [
    {
      "id": 7579558871105,
      "handle": "ewt-15kw-oil-column-heater-ewt15oc",
      "url": "https://www.thegoodguys.com.au/ewt-15kw-oil-column-heater-ewt15oc",
      "title": "EWT 1.5kW Oil Column Heater",
      "vendor": "EWT",
      "product_type": "",
      "sku": "50088823",
      "model_number": "EWT15OC",
      "price_aud": 57,
      "compare_at_price_aud": 0,
      "currency": "AUD",
      "image": "https://cdn.shopify.com/s/files/1/0641/9388/8321/files/50088823_898559.png?v=1776228208",
      "inventory_available": false,
      "inventory_quantity": -64,
      "inventory_policy": "deny",
      "breadcrumb": "heating-and-cooling_heaters_electric-heaters",
      "categories": {
        "lvl0": ["heating-and-cooling", "ewt"],
        "lvl1": ["ewt_heating-and-cooling", "heating-and-cooling_heaters"],
        "lvl2": ["heating-and-cooling_heaters_oil-heaters", "heating-and-cooling_heaters_electric-heaters"],
        "lvl3": ["heating-and-cooling_heaters_electric-heaters"]
      },
      "collections": ["clearance", "deals_heaters", "gifts_under-100"],
      "aggregate_rating": 4.71,
      "promotions": [
        { "type": "DEAL-DAYS", "id": "754457", "endDate": "2026-05-27T13:59:59Z" }
      ],
      "attributes": {
        "general-information_colour": "White",
        "power-and-charging_power": "1500W",
        "product-dimensions_product-height-mm": 630,
        "product-dimensions_product-width-mm": 560,
        "product-dimensions_product-depth-mm": 245,
        "warranty_manufacturers-warranty": "1 Year"
      }
    }
  ]
}
```

When the sitemap-only path is used (no price/title/inventory available):

```json
{
  "source": "sitemap",
  "fetched_at": "2026-05-24T17:35:00Z",
  "total_products": 8791,
  "products": [
    {
      "handle": "ewt-15kw-oil-column-heater-ewt15oc",
      "url": "https://www.thegoodguys.com.au/ewt-15kw-oil-column-heater-ewt15oc",
      "image": "https://cdn.shopify.com/s/files/1/0641/9388/8321/files/50088823_898559.png?v=1776228208",
      "sitemap_lastmod": "2026-05-24T17:01:26.204Z"
    }
  ]
}
```
