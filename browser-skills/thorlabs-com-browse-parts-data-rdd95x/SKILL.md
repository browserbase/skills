---
name: thorlabs-com-browse-parts-data-rdd95x
title: 'Thorlabs Parts, Pricing & Datasheets'
description: >-
  Look up Thorlabs parts by part number or keyword search and return price
  (incl. quantity-tier pricing), product info (availability, ECCN, origin,
  weight, warranty), and datasheet/CAD document download URLs — via the site's
  GraphQL + Algolia APIs. Read-only.
website: thorlabs.com
category: photonics
tags:
  - thorlabs
  - photonics
  - optics
  - pricing
  - datasheets
  - graphql
  - parts
source: 'browserbase: agent-runtime 2026-08-07'
updated: '2026-08-07'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      Navigate /item/{PN}, wait for the Vue SPA to render, and read the price +
      Support Documents list. Works, but document URLs are not exposed as DOM
      hrefs (click handlers only) so they must be reconstructed as
      media.thorlabs.com/globalassets/... from filenames — slow and error-prone
      (an autobrowse run exhausted all 30 turns on it). Use only if GraphQL is
      unavailable.
  - method: hybrid
    rationale: >-
      For search, POST directly to Algolia (products_en / familypages_en
      indexes) to enumerate part numbers, then resolve price + docs per part
      through the GraphQL GetProduct / GetProductsPricing operations.
verified: false
proxies: false
---
# Thorlabs Parts, Pricing & Datasheets

## Purpose

Given a Thorlabs part number (or a free-text search query), return the part's
price, core product information (availability, ECCN, country of origin, weight,
warranty, release/discontinued dates, item status), and the download URLs for
its documents — datasheet/manual PDF plus CAD/optical model files (CAD PDF, DXF,
STEP, SolidWorks, Zemax). Also supports browsing/searching the catalog to
discover part numbers and product-family pages. Read-only; never adds to cart or
checks out.

## When to Use

- Look up the current price of one or many Thorlabs part numbers (e.g. `PDA36A2`,
  `AC254-050-A`, `LA1131`), including quantity-tier pricing.
- Pull a part's datasheet/manual PDF or CAD models programmatically.
- Search the Thorlabs catalog by keyword ("mounted photodiode", "achromatic
  lens") to enumerate matching parts and their product-family pages.
- Any BOM-pricing, procurement, or spec-gathering workflow across many SKUs —
  the API path is far faster and more reliable than scraping the rendered page.

## Workflow

`www.thorlabs.com` is a Vue single-page app. The legacy ColdFusion URLs
(`/thorproduct.cfm?partnumber={PN}`, `/newgrouppage9.cfm?objectgroup_id=…`) still
work but **301-redirect** to clean routes (`/item/{PN}` for a part,
`/{family-slug}` for a family page). A plain HTTP GET of `/item/{PN}` returns
only a ~3.5 KB JS shell — the data arrives via a backend **GraphQL API**. Read
the data from that API, not the DOM.

**Recommended method — GraphQL API (`POST /graphql`).** Two calls resolve a part
number to full data. No login, cookies, or anti-bot stealth are required
(anonymous access is allowed; `userId` may be an empty string). Because the
sandbox has no direct network egress, run the `fetch` from **page context** after
navigating to any `thorlabs.com` page — it is same-origin, so no CORS/headers
issue. A pure-HTTP client can `POST /graphql` directly with
`content-type: application/json` and `apollographql-client-name: spa`.

Constants for all calls: `storeId: "Thorlabs-Website"`, `cultureName: "en-US"`,
`currencyCode: "USD"` (change to localize).

1. **Navigate to establish origin (browser path only):**
   `browse open https://www.thorlabs.com/item/{PN} --remote`, then
   `browse wait load` + `browse wait timeout 2000`.

2. **Resolve the part number → product GUID** with `GetSlugInfo`:
   ```graphql
   query GetSlugInfo($slug:String,$storeId:String,$userId:String,$cultureName:String){
     slugInfo(slug:$slug storeId:$storeId userId:$userId cultureName:$cultureName){
       entityInfo{ objectId objectType isActive }
     }
   }
   ```
   variables: `{ slug: "item/{PN}", storeId:"Thorlabs-Website", userId:"", cultureName:"en-US" }`.
   `entityInfo.objectId` is the product GUID. **If `entityInfo` is `null` (HTTP
   still 200), the part number does not exist → return `success:false`.**

3. **Fetch full product data** with `GetProduct` (pass the GUID as `id`):
   ```graphql
   query GetProduct($storeId:String!,$currencyCode:String!,$cultureName:String,$id:String!){
     product(storeId:$storeId id:$id currencyCode:$currencyCode cultureName:$cultureName){
       name code slug outline itemStatusTL releasedDateTL discontinuedDateTL
       eccnTL originCountryTL weight weightUnit warrantyTextTL
       dataSheetUrlTL hasDataSheetsTL
       price{ actual{ amount formattedAmount } list{ amount formattedAmount } }
       availabilityData{ availableQuantity isAvailable isInStock isBuyable }
       assets{ id name url size mimeType group description }
       breadcrumbs{ title seoPath }
     }
   }
   ```
   Price is in `price.actual.formattedAmount` (e.g. `"$400.01"`).

4. **Documents live in `product.assets[]`** — each is `{ group, name, url, mimeType, size }`.
   Map `group`: `"Manual"` = the datasheet/manual PDF; `"CAD PDF"` = mechanical
   drawing; `"Step"`, `"Solidworks"`, `"Zemax (ZAR)"`, `"Zemax (ZMX)"`,
   `"eDrawing / 3D Model"` = CAD/optical models. **Do not rely on
   `dataSheetUrlTL`/`hasDataSheetsTL` — they are usually `null`/`false` even when
   a Manual asset exists.**

5. **Rewrite the asset host to download.** `asset.url` points at the internal CDN
   `https://thin01mstroc282prod.dxcloud.episerver.net/globalassets/…`. Replace the
   host with `https://media.thorlabs.com` (keep the path + `?v=` query) to get the
   publicly downloadable URL — verified `200 application/pdf`.

6. **Batch pricing (many SKUs at once)** — skip the per-part GUID round-trip with
   `GetProductsPricing`, filtering by SKU list:
   ```graphql
   query GetProductsPricing($storeId:String!,$userId:String!,$currencyCode:String!,$cultureName:String,$filter:String,$first:Int){
     products(storeId:$storeId userId:$userId currencyCode:$currencyCode cultureName:$cultureName filter:$filter first:$first){
       items{ code price{ actual{ amount formattedAmount } list{ amount formattedAmount }
         tierPrices{ quantity price{ amount formattedAmount } } } }
     }
   }
   ```
   variables: `{ storeId:"Thorlabs-Website", userId:"", currencyCode:"USD", cultureName:"en-US", filter:"sku:PDA36A2,AC254-050-A,LA1131", first:15 }`.
   `tierPrices` carries quantity-break pricing.

### Searching / browsing for parts (Algolia)

Site search is **Algolia InstantSearch** (a separate host — the on-site
`/search` path is disallowed to crawlers in robots.txt, but the client hits
Algolia directly). Public credentials observed in the client:
`applicationId = TDDBKZ98JB`, search key `a1937531c100eee2b1920e01075885c4`.
```
POST https://TDDBKZ98JB-dsn.algolia.net/1/indexes/*/queries
     ?x-algolia-application-id=TDDBKZ98JB&x-algolia-api-key=a1937531c100eee2b1920e01075885c4
body: {"requests":[{"indexName":"products_en","query":"<q>","hitsPerPage":15}]}
```
Indexes: `products_en` (individual parts — hit `objectID` = **part number**,
`name`, `url` = `/item/{pn}`, plus `familyPageName`/`familyPageUrl`,
`itemStatus`, `releasedDate`), `familypages_en` (product-family/category pages),
`softwarepages_en`. Feed each `objectID` back into step 2/3, or into the batch
pricing filter. Algolia does **not** return price — get price from GraphQL.

### Browser fallback

If GraphQL is unavailable, `browse open /item/{PN}`, wait for render, and read
the rendered price and "Support Documents" list. **Caveat:** document URLs are
NOT exposed as `href`s in the DOM (they are click handlers) — you must
reconstruct them as `https://media.thorlabs.com/globalassets/items/<path>/<filename>`
from the filename shown in the button label. This is slow and error-prone
(an autobrowse run spent all 30 turns on it); prefer the API.

## Site-Specific Gotchas

- **`/item/{PN}` is an empty SPA shell over HTTP** (~3.5 KB, `<title>Thorlabs</title>`,
  loads `/assets/index-*.js`). Never parse the raw GET HTML for product data —
  use GraphQL or a rendered browser.
- **Legacy `.cfm` URLs 301-redirect.** `/thorproduct.cfm?partnumber={PN}` → `/item/{PN}`;
  `/newgrouppage9.cfm?objectgroup_id=…` → the family slug. Old bookmarks work but
  land on the SPA.
- **Not-found is a silent `null`.** `GetSlugInfo` returns HTTP 200 with
  `entityInfo: null` for a non-existent part number — check for null, don't rely
  on an error status.
- **`dataSheetUrlTL` / `hasDataSheetsTL` are unreliable** — both were `null`/`false`
  for every part tested even when a datasheet/manual PDF existed. The real
  documents are always in `assets[]` (`group:"Manual"`).
- **Asset URLs need a host rewrite.** They come back on the internal
  `thin01mstroc282prod.dxcloud.episerver.net` host; swap to `media.thorlabs.com`
  (same path) to download. CAD file types (`.step`, `.dxf`, `.sldprt`, `.zip`) are
  `Disallow`ed in robots.txt for crawlers but are directly downloadable.
- **Price/availability are parameter-scoped, not IP-scoped.** `currencyCode`
  (USD/EUR/…) and `cultureName` in the query drive currency and localization;
  Thorlabs runs separate stores (`thorlabs.co.jp`, `thorlabschina.cn`) with their
  own catalogs. `availabilityData.availableQuantity` can be `0` while
  `isInStock/isBuyable` are `true` (stocked overseas / made-to-order); the
  rendered page maps this to labels like "Today" or "In Stock Overseas".
- **No anti-bot.** The pre-run probe found none; a bare Browserbase session
  (no `--verified`, no `--proxies`) loaded pages and returned GraphQL 200s. A
  residential proxy is not required. `robots.txt` sets `Crawl-delay: 30` for
  generic agents and disallows `/search`, `/thorcat/`, `/content/`, `/static/` —
  keep request rate polite.
- **GraphQL needs no auth.** `userId:""` works; `storeId` is the literal
  `"Thorlabs-Website"`. Send `content-type: application/json`; the
  `apollographql-client-name: spa` header mirrors the site client.
- **Search price gap.** Algolia hits carry no price — always resolve price via
  `GetProduct` or `GetProductsPricing`.

## Expected Output

Single part (success):
```json
{
  "success": true,
  "part_number": "PDA36A2",
  "name": "PDA36A2 Si Switchable Gain Detector, 350 - 1100 nm, 12 MHz BW, 13 mm², Universal 8-32 / M4 Taps",
  "price": { "amount": 400.01, "formatted": "$400.01", "currency": "USD" },
  "availability": { "availableQuantity": 0, "isInStock": true, "isBuyable": true },
  "item_status": "Active",
  "released_date": "2018-03-14T17:22:35.277Z",
  "eccn": "EAR99",
  "country_of_origin": "USA",
  "weight": { "value": 2.5156, "unit": "pounds" },
  "warranty": "Two year warranty. Incorporated light sources are warrantied for the lesser of one year or (to the extent applicable) the number of hours stated in the specifications.",
  "documents": [
    { "type": "Manual",     "name": "TTN135069-D02.pdf", "url": "https://media.thorlabs.com/globalassets/items/p/pd/pda/pda36a2/ttn135069-d02.pdf" },
    { "type": "CAD PDF",    "name": "TTN135069-E0W.pdf", "url": "https://media.thorlabs.com/globalassets/items/p/pd/pda/pda36a2/ttn135069-e0w.pdf" },
    { "type": "Step",       "name": "TTN135069-E0W.step","url": "https://media.thorlabs.com/globalassets/items/p/pd/pda/pda36a2/ttn135069-e0w.step" }
  ],
  "product_url": "https://www.thorlabs.com/item/PDA36A2",
  "error_reasoning": null
}
```

Batch pricing (multiple SKUs):
```json
{
  "success": true,
  "currency": "USD",
  "items": [
    { "part_number": "LA1131",      "price": "$26.39",  "tier_prices": [{ "quantity": 1, "price": "$26.39" }] },
    { "part_number": "AC254-050-A", "price": "$95.34",  "tier_prices": [{ "quantity": 1, "price": "$95.34" }] },
    { "part_number": "PDA36A2",     "price": "$400.01", "tier_prices": [{ "quantity": 1, "price": "$400.01" }] }
  ]
}
```

Search results (browse for parts):
```json
{
  "success": true,
  "query": "mounted photodiode",
  "total_hits": 125,
  "parts": [
    { "part_number": "PBM42",  "name": "Bias Module for Mounted Photodiodes, BNC Input, SMA Output", "url": "https://www.thorlabs.com/item/pbm42" },
    { "part_number": "AMP102", "name": "Transimpedance Amplifier, 100 kHz Bandwidth, Switchable Gain: 1, 10, or 100 kV/A", "url": "https://www.thorlabs.com/item/amp102" }
  ],
  "family_pages": [
    { "id": "282632", "name": "Mounted Photodiodes", "url": "https://www.thorlabs.com/mounted-photodiodes" }
  ]
}
```

Part not found:
```json
{
  "success": false,
  "part_number": "NOTAREALPART999",
  "error_reasoning": "GetSlugInfo returned HTTP 200 with slugInfo.entityInfo = null; no product exists for this part number.",
  "error": "not_found"
}
```
