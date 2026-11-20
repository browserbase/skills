---
name: selgros-ro-scrape-all-products-w4xdxh
title: Selgros.ro Product Catalog Scrape
description: >-
  Enumerate the complete Selgros Romania product assortment (permanent products
  + weekly promo catalogues + PDF catalogues) with per-store prices, stock,
  labels, brand, and category path via the Azure Cognitive Search proxy and XML
  sitemaps.
website: selgros.ro
category: retail
tags:
  - retail
  - grocery
  - wholesale
  - romania
  - catalog
  - azure-search
  - drupal
source: 'browserbase: agent-runtime 2026-05-25'
updated: '2026-05-25'
recommended_method: api
alternative_methods:
  - method: api
    rationale: >-
      POST /proxy/schaufenster/docs/search.post.search?api-version=2024-07-01
      with the api-key header (bootstrap from window.aa) — full assortment,
      faceted filtering, per-store prices in one call. ~1 sec per 1000 products.
  - method: fetch
    rationale: >-
      Sitemap (products-1.xml + products-2.xml) gives 14,502 canonical product
      URLs with no auth; per-product JSON-LD on each detail page gives the
      richest single-product data (multi-store + multi-quantity offers,
      schema.org Product). Slower than the API but auth-free.
  - method: browser
    rationale: >-
      Use only if the api-key bootstrap fails — open a listing page, let the JS
      hit the Azure proxy, and read the React Query cache. ~30s per 48-product
      page vs ~1s/1000 via API.
verified: false
proxies: true
---
# Selgros.ro Product Catalog Scrape

## Purpose

Enumerate the complete Selgros Romania (`selgros.ro`) product assortment — permanent products, weekly promo catalogues, and PDF product catalogues (carne / mărci proprii / bio) — with per-store prices, stock status, category path, brand, labels (isOffer / isStaffel / isApp / isChilipir / isTop / isMarcaProprie), images, and offerTypes (RSGW/RSGS/RSGL/RAPP). Read-only: never posts, adds-to-cart, or mutates state. Selgros is a B2B cash-and-carry chain so prices are tax-aware (`grossPrice`/`netPrice`/`tax`) and quantity-tiered (`quantityPromotions[]`).

## When to Use

- Bulk extraction of the whole assortment for price-monitoring, pantry-tracking, or competitive-intelligence dashboards.
- Daily / weekly checks of which products belong to the currently-active promo catalogue (e.g. "Bucurie de 1 Iunie" 1862718).
- Discovering Selgros marca-proprie (private-label) products across all categories.
- Cross-store price comparison for the same product (~25 Selgros locations across Romania).
- Linking Selgros SKUs to the official product page URLs for canonical citations.

## Workflow

The site is Drupal-on-Pantheon with an Azure Cognitive Search backend exposed via the Drupal proxy `/proxy/schaufenster`. Two complementary enumeration paths exist and the optimal strategy combines them:

1. **Azure Search proxy (primary)** — `POST /proxy/schaufenster/docs/search.post.search?api-version=2024-07-01` returns one JSON document per `{marketId, productId}` pair with full prices/stock/labels/catalog/categoryPath. **An `api-key` header is required**; without it the proxy returns a misleadingly generic `HTTP 400 "Missing product ID."` regardless of path. The key is a public-but-rotated Azure query key embedded in every listing page as `window.aa`. Bootstrap once per session.
2. **XML sitemaps (secondary, canonical URLs)** — `https://www.selgros.ro/sites/default/files/sitemaps/products-1.xml` and `products-2.xml` list 14,502 canonical product detail URLs (matching the JSON-LD `url` and Azure `productId`). Use the sitemap when you need the SEO-canonical URL slug or a stable, auth-free enumeration.
3. **Per-product JSON-LD (per-product fallback)** — `GET /exploreaza-sortimentul-selgros/product/<slug>-<productId>` embeds two `<script type="application/ld+json">` blocks: a `Product` with one `Offer` per `{store × quantity-tier}` (so a single product yields ~25–30 offers), and a `BreadcrumbList` with the full category path. Use when the Azure proxy is unreachable, when you want the long marketing description, or when you need the multi-quantity tier prices for one specific SKU.

### Step 1 — Bootstrap the Azure Search api-key

```bash
SID=$(browse cloud sessions create --keep-alive --proxies | node -pe "JSON.parse(require('fs').readFileSync(0)).id")
export BROWSE_SESSION="$SID"
browse open "https://www.selgros.ro/exploreaza-sortimentul-selgros" --remote
browse wait load --remote
browse wait timeout 3000 --remote
# api-key + active index name + market list, all in one eval
browse eval --remote "({apiKey: window.aa, activeIndex: window.drupalSettings.schaufenster.activeIndex, marketsMap: window.drupalSettings.schaufenster.marketsMap, defaultMarket: window.drupalSettings.schaufenster.defaultMarket, filterButtons: window.drupalSettings.schaufenster.filterButtons})"
```

Cache the api-key — it has been stable across page loads in a single session, but the value rotates server-side periodically (last observed value: `433757028c7744051481d8462f8133c65761bed34db8a3fcae17e0aef9409d46`, 64-hex). Re-bootstrap whenever a request 401s.

### Step 2 — Enumerate everything in a market via the search endpoint

```bash
# Paginate in 1000-page chunks (Azure Search `top` hard-cap = 1000)
browse eval --remote "(async()=>{
  const out = [];
  const market = 350;  // Brașov; or pick from marketsMap
  let skip = 0, total = 0;
  do {
    const r = await fetch('/proxy/schaufenster/docs/search.post.search?api-version=2024-07-01', {
      method: 'POST',
      headers: {'Content-Type':'application/json','api-key': window.aa},
      body: JSON.stringify({
        search: '*',
        queryType: 'full',
        searchMode: 'any',
        filter: 'markets/any(m: m eq ' + market + ')',
        top: 1000, skip,
        count: true,
        orderby: 'productId asc',  // stable pagination order
        select: 'productId,title,categoryPath,productBrand,catalog,labels,offerTypes,offer,enabled,markets,prices,stock,images'
      })
    });
    const j = await r.json();
    total = j['@odata.count'];
    out.push(...j.value);
    skip += 1000;
  } while (skip < total);
  return {total, returned: out.length, first: out[0]};
})()"
```

Expected counts for market 350 (Brașov, May 2026): `@odata.count` ≈ **52,954** (all docs), ≈ **37,527** with `and stock/any(s: s/status eq true)`, ≈ **14,502** unique canonical products (matches sitemap count). The first count is highest because Azure indexes inactive / `enabled: false` docs too.

### Step 3 — Filter to permanent vs catalogue products

`catalog` is a single-string field on each Azure document: empty (`""`) means "no promo catalogue, permanent assortment"; otherwise it's a numeric catalogue ID like `"1862718"`.

| Goal | OData filter clause |
|---|---|
| Permanent (no promo catalogue) | `catalog eq ''` |
| In a specific catalogue | `catalog eq '1862718'` |
| In any of N catalogues (week's promos) | `search.in(catalog, '1855010,1863301,1851939,...', ',')` |
| Any promo (offer/staffel/app) | `labels/any(c: search.in(c, 'isOffer,isStaffel,isApp'))` |
| App-exclusive offers | `labels/any(c: c eq 'isApp')` |
| Volume-discount products | `labels/any(c: c eq 'isStaffel')` |
| Top-pick offers | `labels/any(c: c eq 'isTop')` |
| Private-label (Marca Proprie) | `labels/any(c: c eq 'isMarcaProprie')` |
| With at least one image | `images/any()` |
| In a top category | `category/any(c: c eq 'Carne proaspătă')` |
| By exact category path | `categoryPath eq 'Carne proaspătă/Carne porc'` |
| By categoryPath prefix | `search.ismatch('Carne proaspătă\\/*', 'categoryPath')` |

Multiple clauses are AND-combined with ` and `. Selgros's own listing JS adds `and stock/any(s: s/status eq true)` and `and images/any()` to hide out-of-stock and image-less SKUs.

### Step 4 — Discover the current week's catalogue IDs

Active promo catalogues are listed in `drupalSettings.schaufenster.filterButtons` on any listing page — the `Promotii` button holds the comma-separated catalogue IDs the marketing team has flagged active that week. Read them once:

```bash
browse eval --remote "(()=>{
  const fbs = window.drupalSettings.schaufenster.filterButtons;
  const out = {};
  function walk(buttons, parentPath){
    for (const b of buttons) {
      const path = parentPath ? parentPath + ' > ' + b.title : b.title;
      if (b.field === 'catalog' && b.value) out[path] = b.value.split(',');
      if (b.children) walk(b.children, path);
    }
  }
  walk(fbs, '');
  return out;
})()"
```

Sample output (May 2026):
```json
{
  "Oferte si promotii > Promotii": ["1855010","1863301","1851939","1854152","1851949","1851959","1845409","1853667","1860491","1856287","1854854","1854860","1858875","1858416","1853472","1858350","1855969","1855967","1862346","1862346","1855193","1863759","1865194","1846854","1868989"],
  "Oferte si promotii > Bucurie de 1 Iunie": ["1862718"],
  "Oferte si promotii > Moda de vara": ["1863274","1863272","1863271","1854216"]
}
```

Alternatively, run a faceted Azure search to enumerate every catalogue ID currently in the index (with its product count):
```bash
# Returns ~364 distinct catalogue values for market 350 (most are historical)
body='{"search":"*","filter":"markets/any(m: m eq 350)","top":0,"facets":["catalog,count:500"]}'
# (use via fetch in browse eval as above)
# response.["@search.facets"].catalog → [{value, count}, ...]
```

### Step 5 — Enumerate the PDF product catalogues

These are the long-form (annual / semi-annual) product catalogues, hosted as Yumpu flipbooks (NOT integrated into the search index — they're standalone editorial PDFs):

```bash
browse cloud fetch https://www.selgros.ro/cataloage --proxies | grep -oE 'yumpu\.com/[^"]+'
```

Currently published:
- `https://www.yumpu.com/ro/document/read/67944690/catalog-carne-selgros-2026` — Catalog Carne 2026
- `https://www.yumpu.com/ro/document/read/65942607/catalog-marci-proprii-transgourmet-editia-iunie-2025` — Mărci Proprii Transgourmet (Selgros own-label)
- `https://www.yumpu.com/ro/document/read/67941277/catalog-bio-2024-selgros` — Bio 2024

Yumpu publishes a JSON metadata endpoint per document at `https://www.yumpu.com/ro/document/json/<docId>` and PDF download at `https://www.yumpu.com/en/document/pdf-online/<docId>`. For products in these PDFs, the canonical equivalents are findable in the Azure index via `labels/any(c: c eq 'isMarcaProprie')` (Mărci Proprii) or `categoryPath` filters (Carne / Bio).

### Step 6 — Hydrate canonical product URLs from sitemap (optional)

The Azure `productId` does NOT include the URL slug. To get the SEO-canonical detail URL, cross-reference the sitemap once and build a `productId → URL` map:

```bash
browse cloud fetch https://www.selgros.ro/sites/default/files/sitemaps/products-1.xml --proxies > p1.json
browse cloud fetch https://www.selgros.ro/sites/default/files/sitemaps/products-2.xml --proxies > p2.json
# Each URL ends in -<productId>; slug regex: /product/(.+)-(\d+)$/
```

For products NOT in the sitemap (e.g. newly added but not yet re-crawled by Drupal's sitemap job, or app-exclusive `isApp` SKUs that don't render a public detail page), construct a fallback search-redirect URL:
```
https://www.selgros.ro/exploreaza-sortimentul-selgros?text=<urlencoded-productId>
```

### Step 7 — Per-product enrichment (optional)

When you need the marketing copy or the full per-store, per-quantity-tier price matrix:
```bash
browse cloud fetch "https://www.selgros.ro/exploreaza-sortimentul-selgros/product/<slug>-<productId>" --proxies
# Extract <script type="application/ld+json">…Product…</script> from response.content
```
The product page JSON-LD `offers[]` has one entry per `{seller.identifier, eligibleQuantity.minValue}` combination — e.g. the Tassimo Marcilla coffee capsule has 3 quantity tiers × ~10 stores = 30 offers, each with its own `price`, `priceValidUntil`, and `availability`.

### Browser fallback

If `/proxy/schaufenster` 4xxs (api-key rotated mid-run, or Cloudflare/Pantheon rate-limits the proxy), open the rendered listing page in a browser session and read the same data from `window.__INITIAL_STATE__`-style rehydration: the page calls the same Azure URL with the same body, and the response sits in the React Query cache. You can read it via `browse eval --remote "(()=>JSON.stringify(Array.from(document.querySelectorAll('script[type=\"application/json\"]')).map(s=>s.textContent.slice(0,500))))()"`. Significantly slower (~30s per 48-product page) and pays a JS-render cost per page; **only fall back if the proxy is genuinely unreachable**.

## Site-Specific Gotchas

- **`api-key` header is mandatory and unforgiving.** Without it, every path under `/proxy/schaufenster/*` returns `HTTP 400 "Missing product ID."` — a Drupal-generic error that suggests the wrong fix. The 64-hex Azure query key is exposed as `window.aa` on every page that renders the schaufenster widget. If you ever see "Missing product ID." treat it as **403** and re-bootstrap the key.
- **The proxy hostname only accepts requests from `www.selgros.ro` Origin / Referer in some configurations.** `browse cloud fetch` (Browserbase's fetch service) appears to spoof both correctly. Page-context `fetch()` from a Browserbase session never has issues. Bare `curl` from outside the sandbox network is irrelevant — selgros.ro Pantheon edge does not gate by Origin, but the api-key check happens at Drupal's PHP-proxy layer.
- **Drupal's proxy returns `200 OK` with the body `"Missing product ID."` when the api-key is missing.** It looks like a routing problem but it's an auth problem.
- **Azure Search `top` is hard-capped at 1000.** Default is 50. Paginate with `skip` up to `@odata.count` (Azure max skip = 100,000 — beyond that, switch to keyset pagination on `productId`).
- **Document key shape is `"{marketId}_{productId}"`.** A single product appears in the index N times, once per market that carries it. Group by `productId` to dedupe; the `markets` field on each doc is a single-element array (the doc's own market) despite looking like it might list all markets carrying the product — it does NOT.
- **`enabled: false` docs are still in the index.** Filter with `enabled eq true` (or use `(enabled eq true or labels/any(c: search.in(c, 'isOffer,isStaffel,isApp')))` to mirror the live site's "show enabled or any promo" logic). The default search returns disabled docs too — the count drop from 52,954 → 37,527 → 14,502 is `all → in-stock → enabled+canonical`.
- **`catalog` is a single string, not an array.** A product can belong to AT MOST one promo catalogue at a time. To match multiple catalogues, use `search.in(catalog, '1862718,1863274', ',')`, not `catalog/any(c: ...)`.
- **The set of "active this week" catalogues is not in the search index.** It lives in `drupalSettings.schaufenster.filterButtons` on listing pages, updated weekly by the marketing CMS. The Azure index keeps historical catalogues forever (364+ distinct values for market 350), so the facet alone won't tell you what's currently promoted.
- **`offerTypes` decode**: `RSGW` = standard catalogue offer, `RSGS` = self-service / shelf-tag offer, `RSGL` = long-running clearance, `RAPP` = Selgros mobile-app exclusive. Mix the right ones depending on whether you want "what's in print" (RSGW) or "everything on promo right now" (`labels: isOffer`).
- **PDF catalogues (`/cataloage`) are Yumpu-hosted, not in the Drupal site.** Three are typically active (Carne, Mărci Proprii Transgourmet, Bio). They are editorial / annual — not weekly promo flyers. Don't conflate with the `catalog` field IDs, which are SAP promo-flight IDs.
- **Prices are tax-inclusive by law (Romania) but the API exposes both.** Use `prices[].price.grossPrice` for the consumer-facing price; `netPrice` is the pre-VAT B2B price (Selgros is technically members-only but everyone has a card). `tax` is the VAT percentage (typically 19% or 21%).
- **`quantityPromotions[]` and `appPrice` are how Staffel discounts surface in the API**, not multiple offer documents. The product-page JSON-LD splits them into multiple `Offer` objects per minValue tier (`eligibleQuantity.minValue`); the search index keeps them nested under one doc.
- **Sitemap count (14,502) is enabled-and-canonical-URL products only.** Don't expect counts to match the Azure `@odata.count`. The sitemap is regenerated weekly (`<lastmod>` reflects last regen), so newly added SKUs may be in Azure but not yet in the sitemap.
- **Image CDN rewrite**: raw image URLs in Azure look like `https://cdn.transgourmet.de/dam/sftp-prod/.../<hash>.jpg`. The frontend rewrites these through `https://azgkybhrcq.cloudimg.io/v7/<rewritten>?vh=<imageVersion>` for responsive sizing. Either URL works for direct image download; the cloudimg.io variant supports query-param resizing.
- **Multi-store price arbitrage exists.** The same SKU can have different `prices[].price.grossPrice` across stores (e.g. Tassimo Marcilla Cortado: 32.19 RON at most stores but the price differs by region). Aggregate across all `marketId` docs to surface the cheapest store, but be aware the consumer must physically visit that store to buy at that price — Selgros has no national e-commerce home delivery.
- **No anti-bot, no rate-limit observed.** The Pantheon edge is Varnish-cached for static assets and the proxy responds in ~200–400ms uncached. A ~5 req/sec sustained pull of the search endpoint completed 53k records in under 60s without throttling. Be courteous: keep ≤ 5 req/sec, use `count: false` on subsequent pages to save server work.
- **Catalogue PDFs on Yumpu are NOT crawlable HTML.** They render as flipbook viewers. To extract products from PDF catalogues programmatically, download the PDF via `https://www.yumpu.com/en/document/pdf-online/<docId>` then OCR — but for most use cases the cross-reference via `labels` / `categoryPath` against the search index gives you the same products with structured data.
- **`activeIndex` value `first-ro-index`** is hardcoded on the Drupal side and is the only RO index. Other countries use `second-pl-index` (Poland) etc.; not relevant here but worth knowing if you adapt this skill to selgros.de / selgros.pl.

## Expected Output

A single JSON envelope summarising the extraction plus a `products[]` array. Each product entry merges Azure Search fields with the canonical sitemap URL where available:

```json
{
  "success": true,
  "domain": "selgros.ro",
  "market": { "id": 350, "name": "Selgros Brașov", "address": "Brașov, Calea București nr. 231" },
  "extraction": {
    "azure_total_docs": 52954,
    "azure_enabled_in_stock": 37527,
    "sitemap_canonical_products": 14502,
    "distinct_catalog_ids": 364,
    "active_promo_catalogues_this_week": ["1862718","1863274","1863272","1863271","1854216"],
    "pdf_catalogues": [
      { "title": "Catalog Carne 2026", "url": "https://www.yumpu.com/ro/document/read/67944690/catalog-carne-selgros-2026" },
      { "title": "Mărci Proprii Transgourmet — Iunie 2025", "url": "https://www.yumpu.com/ro/document/read/65942607/catalog-marci-proprii-transgourmet-editia-iunie-2025" },
      { "title": "Catalog Bio 2024", "url": "https://www.yumpu.com/ro/document/read/67941277/catalog-bio-2024-selgros" }
    ]
  },
  "products": [
    {
      "product_id": "1004511",
      "title": "TASSIMO JACOBS CAPSULE MARCILLA CORTADO 184G",
      "category_path": "Cafea și ceai/Cafea",
      "brand": "TASSIMO",
      "url": "https://www.selgros.ro/exploreaza-sortimentul-selgros/product/tassimo-jacobs-capsule-marcilla-cortado-184g-1004511",
      "image": "https://cdn.transgourmet.de/dam/sftp-prod/8/8a1/.../0b9f4348f8c543ee990abc0d3ebf169d.jpg",
      "labels": ["isOffer"],
      "offer_types": ["RSGW"],
      "catalog_id": "",
      "is_permanent": true,
      "enabled": true,
      "in_stock": true,
      "stock_count": 412,
      "prices": [
        { "unit": "ST", "currency": "RON", "tax": 19.0, "gross_price": 32.19, "net_price": 27.05, "min_quantity": 3, "price_valid_until": "2026-12-31T22:59:59.000+00:00" },
        { "unit": "ST", "currency": "RON", "tax": 19.0, "gross_price": 35.90, "net_price": 30.17, "min_quantity": 2 },
        { "unit": "ST", "currency": "RON", "tax": 19.0, "gross_price": 45.57, "net_price": 38.29, "min_quantity": 1 }
      ],
      "available_at_stores": [
        { "id": 352, "name": "Selgros București Pantelimon" },
        { "id": 350, "name": "Selgros Brașov" },
        { "id": 370, "name": "Selgros Alba Iulia" },
        { "id": 358, "name": "Selgros Oradea" }
      ]
    }
  ]
}
```

### Outcome branches

```json
// Successful permanent product (catalog_id empty, labels empty or [isStaffel])
{ "is_permanent": true, "catalog_id": "", "labels": [], ... }

// Promo catalogue product (catalog_id set, labels contain isOffer)
{ "is_permanent": false, "catalog_id": "1862718", "labels": ["isOffer"], "offer_types": ["RSGW"], ... }

// App-exclusive offer (no public detail page; URL is a search-fallback)
{ "labels": ["isApp"], "url": "https://www.selgros.ro/exploreaza-sortimentul-selgros?text=<productId>", ... }

// Disabled / out-of-stock SKU (still indexed; opt-in via inclusion filter)
{ "enabled": false, "in_stock": false, "stock_count": 0, "prices": [...] }

// Empty result for an unknown filter combination
{ "success": true, "products": [], "extraction": { "azure_total_docs": 0 }, "reason": "no_matches" }

// Auth failure (api-key rotated; re-bootstrap)
{ "success": false, "reason": "api_key_invalid", "http_status": 400, "body": "Missing product ID." }
```
