---
name: bestbuy-ca-search-browse-products-o7tjol
title: Best Buy Canada Product Search & Browse
description: >-
  Search bestbuy.ca by keyword or browse a category, with sorting and facet
  filtering, returning structured product results (name, price, rating,
  availability, URL) via the site's public JSON search API.
website: bestbuy.ca
category: e-commerce
tags:
  - e-commerce
  - shopping
  - product-search
  - catalog
  - retail
source: 'browserbase: agent-runtime 2026-08-24'
updated: '2026-08-24'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      The /en-ca/search and /en-ca/category HTML pages render the same catalog
      behind an Akamai edge, but they require dismissing a cookie banner and
      scraping a client-rendered grid. Use only if the JSON API is ever blocked;
      the API returns cleaner, paginated, structured data with no rendering.
verified: true
proxies: true
---
# Best Buy Canada Product Search & Browse

## Purpose

Search Best Buy Canada (`bestbuy.ca`) for products by keyword, or browse a product category, and return structured results — product name, SKU, sale/regular price, customer rating, availability flags, and product URL. This is a **read-only** skill. The fastest and most reliable path is the site's public JSON search API (`GET /api/v2/json/search`), which returns fully structured, paginated data with sorting and facet filtering — no page rendering, no cookie banner, no scraping. A browser fallback is documented at the end.

## When to Use

- "Search Best Buy Canada for `<keyword>` and list the top results with prices and ratings."
- "Find the cheapest / highest-rated `<product>` on bestbuy.ca."
- "Browse everything in the Laptops & MacBooks category, sorted by price."
- "Filter Best Buy CA `<category>` results to a specific brand or price range."
- "Get the SKU, price, and product URL for the first N `<keyword>` matches."
- Any product discovery / catalog-listing task on bestbuy.ca that stops **before** add-to-cart or checkout.

## Workflow

The recommended method is a single HTTP GET against the public JSON API. It answers every search/browse variant through query parameters — no browser needed.

### 1. Call the search API

```
GET https://www.bestbuy.ca/api/v2/json/search?query={keyword}&page=1&pageSize=24&lang=en-CA
```

Issue it through a residential-proxied fetch (the domain sits behind Akamai — see Gotchas):

```bash
browse cloud fetch \
  "https://www.bestbuy.ca/api/v2/json/search?query=laptop&page=1&pageSize=24&lang=en-CA" \
  --proxies
```

The response body is a JSON string (under the `content` field of `browse cloud fetch`'s envelope). Parse it and read `total`, `totalPages`, and the `products[]` array.

### 2. Choose the query shape

| Goal | Parameters |
|------|-----------|
| Keyword search | `query={keyword}` |
| Browse a category | `categoryid={id}` (id is the trailing number in `/en-ca/category/{slug}/{id}` URLs, e.g. `20352` = Laptops & MacBooks). Can be combined with `query`. |
| Paginate | `page={1-based}` + `pageSize={n}` (24 mirrors the site; larger values work) |
| Sort | `sortBy=` one of `relevance` (default), `price`, `rating`, `name` |
| Sort direction | `sortDir=asc|desc`. `price` and `rating` default to **descending** — add `sortDir=asc` for lowest-price-first |
| Filter by facet | `path={facet}:{value}` — e.g. `path=brandName:HP`, `path=currentprice:[0 TO 500]` |
| Populate facet list | add `include=facets` to get the `facets[]` array of available refinements |
| Locale / region | `lang=en-CA` (or `fr-CA`); `currentRegion=ON` for province-accurate pricing |

### 3. Extract each product

Per element of `products[]`, read: `sku`, `name`, `salePrice`, `regularPrice`, `saleEndDate` (epoch ms), `customerRating`, `customerRatingCount`, `categoryName`, and `productUrl`. **Prefix `productUrl` with `https://www.bestbuy.ca`** — it is returned relative. Availability flags: `isOnlineOnly`, `isInStoreOnly`, `isClearance`, `hasPromotion`, `isMarketplace` (+ `seller`).

### 4. Return the result

Emit the JSON shape in Expected Output. Report `total` (full match count) even if you only return the first page.

### Browser fallback

Only if the JSON API is ever blocked:

1. `browse open "https://www.bestbuy.ca/en-ca/search?search={keyword}" --remote` (start the session with `--proxies --verified`).
2. Dismiss the "Your privacy is important" cookie banner (bottom overlay) before interacting.
3. Results render in a client-side grid; category facets are in the left rail, the **Sort** dropdown is top-right (default "Best Match").
4. Category browse: `browse open "https://www.bestbuy.ca/en-ca/category/{slug}/{id}" --remote`.
5. Extract with `browse get markdown body`. This is strictly worse than the API (client-rendered, banner friction, no clean pagination) — prefer the API.

## Site-Specific Gotchas

- **The JSON API is NOT robots-disallowed; the HTML search pages ARE.** `robots.txt` disallows `/en-ca/search`, `/Search/`, `/search/` for crawlers, but `/api/v2/json/search` is not listed. `/en-ca/category/` and `/en-ca/product/` HTML pages are explicitly `Allow`ed. The API is both the cleanest and the most crawl-compliant path.
- **Akamai edge, but the API answers proxied GETs.** Responses carry `ak_bmsc` / `bm_s` / `_abck` cookies and Dynatrace `Server-Timing` headers. Despite this, `browse cloud fetch --proxies` returns `200` JSON reliably. The pre-run homepage probe reported no active challenge, and both the direct-fetch runs and the autobrowse inner-agent run succeeded with `--proxies --verified`. Keep `--proxies` on — a bare datacenter IP risks an `_abck` challenge.
- **`sortBy` is a strict whitelist — invalid tokens return HTTP 400** `{"message":"Bad Request"}`. Only `relevance`, `price`, `rating`, `name` are valid. Confirmed-rejected (400): `bestSelling`, `bestMatch`, `savings`, `customerRating`, `priceLowToHigh`, `priceAsc`, `nameAscending`, `newest`, `featured`. Don't waste calls guessing other tokens.
- **`price` sort is descending by default.** For lowest-price-first use `sortBy=price&sortDir=asc` (verified: yields $28, $59.74, $75…). Plain `sortBy=price` returns highest-first.
- **Ignored (not rejected) sort params fail silently.** `sortField=`, `sort=`, `sortOrder=`, `sortByDir=` all return `200` but do NOT reorder results — only `sortBy` + `sortDir` work. A `200` with unchanged order means your param was ignored.
- **Facet `values[]` come back empty on plain keyword search** even with `include=facets` — you get the facet *names* (Price, Brands, Discount, Product Condition, Current Offers…) but no value lists. This does not block filtering: `path={facet}:{value}` filters correctly regardless (e.g. `path=brandName:HP` → 3368 results, `path=currentprice:[0 TO 500]` → 2836 results). If you already know the facet key/value you don't need the value list.
- **`productUrl` is relative** (`/en-ca/product/{slug}/{sku}`) — prefix with `https://www.bestbuy.ca`.
- **Prices are region-scoped and sale-aware.** `salePrice` equals `regularPrice` when an item isn't on sale; `saleEndDate` is epoch milliseconds. Pass `currentRegion={province}` (e.g. `ON`) for accurate pricing/availability.
- **Marketplace items** have `isMarketplace: true` and a populated `seller`/`sellerId` (fulfilled by third parties, not Best Buy).
- **`categoryid` scopes to the full category subtree**, so counts are large (e.g. `20352` Laptops & MacBooks ≈ 28.9k, `20001` Computers & Tablets ≈ 268k). Common ids from the homepage nav: `20001` Computers & Tablets, `20352` Laptops & MacBooks, `20006` Cell Phones, `20003` TV & Home Theatre, `20005` Cameras, `659699` Audio, `26517` Appliances, `30438` Smart Home.
- **Zero results is a clean `200`**, not an error: `total: 0`, `totalPages: 0`, `products: []`, `relatedQueries: null`.
- **`lang` accepts `en-CA` / `fr-CA`** (bare `en` is also tolerated). Use `en-CA` for English.

## Expected Output

Keyword search (success):

```json
{
  "success": true,
  "method": "api",
  "query": "laptop",
  "category_id": null,
  "sort": "relevance",
  "total_results": 15014,
  "total_pages": 626,
  "page": 1,
  "products": [
    {
      "sku": "19821568",
      "name": "Dell 15.6\" 120Hz Laptop - AMD Ryzen 7 7730U - 16GB DDR4 - 512GB SSD - Windows 11 Home - Carbon Black",
      "sale_price": 699.99,
      "regular_price": 1199.99,
      "sale_end_date": 1789110000000,
      "customer_rating": 4.54,
      "customer_rating_count": 170,
      "category_name": "Windows Laptops",
      "is_marketplace": false,
      "is_online_only": false,
      "url": "https://www.bestbuy.ca/en-ca/product/dell-15-6-120hz-laptop-amd-ryzen-7-7730u-16gb-ddr4-512gb-ssd-windows-11-home-carbon-black/19821568"
    }
  ],
  "error_reasoning": null
}
```

Category browse with price-ascending sort (`categoryid=20352&sortBy=price&sortDir=asc`):

```json
{
  "success": true,
  "method": "api",
  "query": null,
  "category_id": "20352",
  "sort": "price:asc",
  "total_results": 28905,
  "total_pages": 1205,
  "page": 1,
  "products": [
    { "sku": "…", "name": "…", "sale_price": 28.00, "regular_price": 49.99, "category_name": "Windows Laptops", "url": "https://www.bestbuy.ca/en-ca/product/…" }
  ],
  "error_reasoning": null
}
```

No results (still HTTP 200):

```json
{
  "success": true,
  "method": "api",
  "query": "zzzxqwlkjhasdf",
  "total_results": 0,
  "total_pages": 0,
  "page": 1,
  "products": [],
  "error_reasoning": null
}
```

Failure (e.g. API blocked / non-200):

```json
{
  "success": false,
  "method": "api",
  "query": "laptop",
  "total_results": null,
  "products": [],
  "error_reasoning": "Search API returned HTTP 400 Bad Request (invalid sortBy token) — retry with sortBy in {relevance,price,rating,name}."
}
```
