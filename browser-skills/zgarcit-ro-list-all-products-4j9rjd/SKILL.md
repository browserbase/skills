---
name: zgarcit-ro-list-all-products-4j9rjd
title: List All Products on zgârcit.ro
description: >-
  Enumerate the full zgârcit.ro catalog of Romanian grocery discounts across 9
  retail chains by paging the ?page=N listing and parsing the inline Next.js RSC
  payload (no public API).
website: zgarcit.ro
category: ecommerce
tags:
  - ecommerce
  - grocery
  - price-comparison
  - romania
  - catalog
  - scraping
source: 'browserbase: agent-runtime 2026-06-03'
updated: '2026-06-03'
recommended_method: fetch
alternative_methods:
  - method: api
    rationale: >-
      No public JSON/GraphQL API exists; /api/ is Disallow-ed in robots.txt and
      not the data source. Product data lives only in the server-rendered RSC
      flight payload.
  - method: browser
    rationale: >-
      Works as a fallback if the RSC payload shape changes, but is slower and
      unnecessary — the grid is virtualized and pagination is fully
      URL-addressable via ?page=N.
verified: false
proxies: true
---
# List All Products on zgârcit.ro

## Purpose

Enumerate the complete catalog of current grocery discounts ("produse") aggregated by [zgârcit.ro](https://zgarcit.ro), a Romanian price-comparison site that tracks weekly promotions across nine retail chains (Kaufland, Lidl, Auchan, Mega Image, Penny, Carrefour, Profi, Selgros, Metro). This skill is **read-only** and returns a structured list of every deal — product title, store, category, discounted price, original price, loyalty-card requirement, and image — paginated 60 items per page across the full result set (~18,679 products / 312 pages at time of writing).

## When to Use

- "Get me every product / deal currently listed on zgârcit.ro."
- "List all discounts from Lidl (or Kaufland, Penny, …) on zgârcit.ro."
- "Export the full zgârcit.ro catalog as JSON."
- "Find all products matching `lapte` (milk) and their prices."
- Building a dataset of Romanian grocery promotions, price tracking, or cross-store comparison.

## Workflow

**Recommended method: HTTP fetch + RSC parse (no browser needed).**

zgârcit.ro is a Next.js App Router site. There is **no public JSON API** (`/api/` is `Disallow`-ed in robots.txt and returns nothing useful), but every listing page server-renders its product data inline as a React Server Components (RSC) flight payload inside `<script>self.__next_f.push(...)</script>` tags. You can fetch the plain HTML for any page and parse the products out deterministically — far cheaper and more reliable than driving a browser. Cloudflare fronts the origin, so route the fetch through residential proxies.

1. **Discover the page count.** Fetch the homepage and read `totalPages` from the RSC payload:
   ```bash
   browse cloud fetch "https://zgarcit.ro/" --proxies
   ```
   Grep the response body for `"totalPages":<N>` (escaped as `totalPages\":312` in the raw stream) and `"currentPage":1`. Each page holds **60 products** (the last page holds the remainder).

2. **Iterate every page** via the `?page=N` query param (1-indexed, `1 … totalPages`):
   ```bash
   for p in $(seq 1 312); do
     browse cloud fetch "https://zgarcit.ro/?page=$p" --proxies --output "page-$p.html"
   done
   ```

3. **Parse products from each page's RSC payload.** Two component prop blocks per product carry all reliable fields — match both by `id` and join:
   - Meta block: `{"id":"…","category":"…","provider":"…","requiresVendorCard":false,"local":false}`
   - Price block: `{"id":"…","title":"…","newPrice":0.99,"oldPrice":1.49,"provider":"…","priceTiers":null}`
   - Image: the adjacent `{"src":"https://bucket.zgarcit.ro/<provider>/<hash>","alt":"<title>"}`

   The raw bytes are JSON-string-escaped (every `"` appears as `\"`), so regex against the escaped form, e.g. `\\"newPrice\\":([0-9.]+)`. Example extractor logic (Node): collect a `{id → {category, requiresVendorCard, local}}` map from meta blocks, then walk the price blocks in document order (they map 1:1 and in-order to the image `src` list) and merge.

4. **Aggregate** all pages' products into one list. Expect `≈ (totalPages-1) × 60 + lastPageCount` items; the UI header ("18679 produse") gives the authoritative count to validate against.

**Optional filters** (all are real URL deep-links, combinable with `&page=N`):
- Single store: `?providers=Lidl` (exact display name, URL-encode spaces, e.g. `?providers=Mega%20Image`).
- Multiple stores: repeat the param — `?providers=Lidl&providers=Kaufland`. **CSV does not work** (`?providers=Lidl,Kaufland` returns 0 products).
- Text search: `?search=lapte` (NOT `?q=` — `q` is silently ignored and returns the full catalog).
- Each filtered view recomputes its own `totalPages`, so re-read it after applying a filter.

### Browser fallback

Only needed if the RSC payload format changes. Open `https://zgarcit.ro/`, dismiss the "Cookie-uri?" dialog (click **Accept**), and read the product grid. Pagination controls are top-right (`1 2 … 312`); the left sidebar has store checkboxes ("Magazine") and sort controls ("Sortare"). Navigate pages by editing `?page=N` in the URL rather than clicking, since the grid is virtualized. Extract each card's title, the two stacked prices (discounted in orange, struck-through original), the `RON/kg` unit price, and the validity date (e.g. "9 iunie"). Do **not** use the in-page sort buttons as a deep-link — sorting is client-side state only and never appears in the URL.

## Site-Specific Gotchas

- **No JSON API.** `/api/` is `Disallow`-ed in robots.txt and is not the data source. All product data is in the server-rendered RSC flight payload (`self.__next_f`). Don't waste time hunting for a REST/GraphQL endpoint — there isn't one.
- **Cloudflare in front.** Origin is a Railway-hosted Next.js app behind Cloudflare. Plain fetches work but use `--proxies` (residential) to avoid edge challenges. Responses are `zstd`/`gzip` encoded; `browse cloud fetch` decodes them for you.
- **Raw bytes are double-escaped.** Inside the HTML, the RSC JSON has every `"` written as `\"`. Regex/parse against the escaped form (`\\"title\\":\\"…\\"`), not clean JSON.
- **60 products per page, fixed.** Pagination is strictly `?page=N`, 1-indexed. There is no page-size parameter — you must walk all pages.
- **`?search=` not `?q=`.** The search param is `search`. `q=` is silently ignored and returns the unfiltered full catalog (a 312-page false positive — easy to mistake for "no filter applied").
- **Multi-store is repeated params, not CSV.** `?providers=A&providers=B` works; `?providers=A,B` returns 0 results.
- **Store names are exact display strings.** Use `Mega Image` (URL-encoded `Mega%20Image`), `Kaufland`, `Lidl`, `Auchan`, `Penny`, `Carrefour`, `Profi`, `Selgros`, `Metro`. The canonical list is in `/sitemap.xml`.
- **Sorting is not URL-addressable.** Clicking "Preț crescător" / "Discount descrescător" etc. changes only client-side state; the URL stays `/`. If you need sorted output, sort the extracted list yourself.
- **`oldPrice` can be `null`** and `priceTiers` is usually `null` but can be an array for quantity/loyalty-tier pricing (e.g. some Lidl Plus deals). Handle both.
- **`requiresVendorCard: true`** marks deals that need the chain's loyalty card (e.g. ~23 of the 61 Lidl deals require Lidl Plus). `local: true` marks region-specific deals.
- **Unit price (`RON/kg`) and validity date** are rendered as display text in the card DOM, not as clean fields in the price-block props — derive them from the rendered HTML if needed, or compute unit price from `newPrice` + the quantity in the title.
- **Catalog is volatile** — deals refresh weekly (sitemap `changefreq: daily`), so `totalPages` and the exact product set drift day to day. Always re-read `totalPages` at run time rather than hardcoding 312.
- A separate `/peco` page lists fuel (PECO) prices — out of scope for "products"; the homepage grid is the grocery catalog.

## Expected Output

A JSON object with the catalog total and a flat product array. Each product:

```json
{
  "totalProducts": 18679,
  "totalPages": 312,
  "pageSize": 60,
  "scrapedAt": "2026-06-03T15:30:00Z",
  "products": [
    {
      "id": "n5ibm29azfh31d3",
      "title": "Demibaghetă",
      "provider": "Kaufland",
      "category": "Brutărie & patiserie",
      "newPrice": 0.99,
      "oldPrice": 1.49,
      "currency": "RON",
      "requiresVendorCard": false,
      "local": false,
      "priceTiers": null,
      "image": "https://bucket.zgarcit.ro/kaufland/5c8b832810c5b2dae02d5dea5b00d022e2d59ff3e9f04b6d7787403383107576"
    },
    {
      "id": "3d6th7vnqg5yi2q",
      "title": "Covridog",
      "provider": "Kaufland",
      "category": "Brutărie & patiserie",
      "newPrice": 3.19,
      "oldPrice": 3.89,
      "currency": "RON",
      "requiresVendorCard": false,
      "local": true,
      "priceTiers": null,
      "image": "https://bucket.zgarcit.ro/kaufland/3dc0eb8471d45dde811cfac78535a9903d1d78c7d44e9b17efc16048266c84e5"
    }
  ]
}
```

Variant — a deal requiring a loyalty card with no recorded original price:

```json
{
  "id": "abc123examplex",
  "title": "ORLANDO Salam pentru câini",
  "provider": "Lidl",
  "category": "Hrană animale",
  "newPrice": 5.99,
  "oldPrice": null,
  "currency": "RON",
  "requiresVendorCard": true,
  "local": false,
  "priceTiers": null,
  "image": "https://bucket.zgarcit.ro/lidl/<hash>"
}
```

When scoped with a filter (e.g. `?providers=Lidl`), the same shape is returned but `totalProducts`/`totalPages` reflect the filtered subset (e.g. 61 products / 2 pages for Lidl alone).
