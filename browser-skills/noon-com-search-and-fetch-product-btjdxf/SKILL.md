---
name: noon-com-search-and-fetch-product-btjdxf
title: Noon Product Search & Fetch
description: >-
  Search noon.com (UAE/Saudi/Egypt marketplace) by free-text query and return
  normalized product list; then fetch detailed product info (description, specs,
  images, price, seller, stock) by sku, catalog_sku, or offer_code. Pure JSON
  in, pure JSON out — read-only.
website: noon.com
category: ecommerce
tags:
  - ecommerce
  - marketplace
  - noon
  - products
  - search
  - read-only
source: 'browserbase: agent-runtime 2026-05-26'
updated: '2026-05-26'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      Fallback only — noon's `__NEXT_DATA__` script tag on the rendered page
      carries the identical JSON the API serves, so a stealth Browserbase
      session can recover the same data if the JSON API ever rate-limits or
      regionally blocks. Costs ~10× the API path (JS render + DOM ref
      enumeration). Verified working in iter-1 on both /search/ and
      /{slug}/{sku}/p/ pages.
verified: true
proxies: true
---
# Noon Product Search & Fetch

## Purpose

Given a search query, return a normalized list of matching noon.com products (`sku`, `catalog_sku`, `offer_code`, `name`, `brand`, prices, rating, image, product URL, stock state). Given a `sku` or `catalog_sku`, return a normalized product-detail object (title, brand, long description, images, specifications, price, seller, stock). Read-only — never calls cart/checkout/wishlist endpoints. Pure JSON in, pure JSON out.

## When to Use

- A shopping/comparison agent looking up products on noon (UAE / Saudi / Egypt marketplace) by free-text query.
- A pricing pipeline that needs to dereference a noon `sku` to brand, price, rating, image, and seller.
- Anywhere you'd otherwise scrape noon's React-rendered HTML — the JSON API returns the same payload the React app consumes, in a fraction of the bytes and with no DOM-rendering wait.

## Workflow

noon.com exposes a **public, unauthenticated JSON API** that is the same surface the React storefront calls. Two endpoints cover the entire skill — no scripted browser session, no cookies, no anti-bot warm-up. Both endpoints geolocate by request IP and default to UAE / English / AED (verified 2026-05-26 from a US-egress proxy). A residential proxy is **not** strictly required (the API also returned `200` from a bare egress IP in the same run) — recommend keeping `--proxies` on as a soft hedge against region-level rate limiting, but a vanilla `fetch` will succeed.

### 1. Search

```
GET https://www.noon.com/_vs/nc/mp-customer-catalog-api/api/v3/u/search?q={URL-encoded-query}
Accept: application/json
```

Returns `200 application/json`. Top-level shape:

```jsonc
{
  "nbHits":   59296,          // total result count, what you map to `total`
  "nbPages":  50,             // page count for the default page size (50)
  "hits":     [ /* 50 hit objects */ ],
  "search":   { "originalQuery": "milk", "page": 1, "limit": 50, "sort": {...} },
  "meta":     { "title": "...", "desc": "...", "h1": "milk" },
  "canonical_url": "/search?q=milk",
  "type":     "catalog"
}
```

Each `hit` carries everything you need for the list-item shape — no per-product round trip required:

| Source field (noon)           | Normalized field      |
|---|---|
| `sku`                         | `id`, `sku`           |
| `catalog_sku`                 | `catalog_sku`         |
| `sku_config`                  | `sku_config`          |
| `offer_code`                  | `offer_code`          |
| `name`                        | `name`                |
| `brand`                       | `brand`               |
| `price`                       | `price` (was/list)    |
| `sale_price`                  | `sale_price`          |
| *(implicit — UAE default)*    | `currency` → `"AED"`  |
| `product_rating.value`        | `rating`              |
| `product_rating.count`        | `review_count`        |
| `image_url`                   | `image_url`           |
| `url` + `sku`                 | `product_url` (built) |
| `url`                         | `url_slug`            |
| `is_buyable`                  | `in_stock`            |

**Build `product_url`** as `https://www.noon.com/uae-en/{url_slug}/{sku}/p/` (trailing slash required for canonical noon URLs — they 308-redirect to add it otherwise). Swap `uae-en` for `saudi-en` / `egypt-en` for those locales (see locale gotcha below).

**Empty result set:** the response is well-formed with `nbHits: 0` and `hits: []` — emit the empty-result shape, do NOT raise an error.

**On non-2xx, retry once** with the same URL (the API has occasional CDN-MISS slow-paths). If the retry also fails, surface the error rather than fabricating data.

### 2. Resolve identifier → product detail

When the caller supplies a `sku`, `catalog_sku`, or `offer_code`:

```
GET https://www.noon.com/_vs/nc/mp-customer-catalog-api/api/v1/u/{sku-or-catalog_sku}/p
Accept: application/json
```

- **`sku` and `catalog_sku` are interchangeable** on this endpoint — for the products observed, both fields hold the same value (e.g. `N12278277A`). Pass whichever you have.
- **`offer_code` is NOT directly resolvable** by this endpoint (`/api/v1/u/{offer_code}/p` → `404 {"userMessage":"Page not found"}`). When the caller supplies only an `offer_code`, you must first locate the corresponding `sku` (either from a prior `/search` result you have cached, or by running `/search?q={offer_code}` as a fallback) and then call `/api/v1/u/{sku}/p`.
- The alternative path `/api/v1/u/{url_slug}/{sku}/p` also works and returns an identical payload — useful when you have a noon canonical URL and want to avoid parsing it.

Detail payload shape (relevant subset):

```jsonc
{
  "product": {
    "sku": "N12278277A",
    "product_title": "Long Life Milk Low Fat Plain 1Liters Pack of 4",
    "brand": "Almarai",
    "long_description": "<p>…</p>",         // HTML — strip tags for the normalized `description`
    "specifications": [                       // array of {code, name, value, value_code}
      { "code": "size", "name": "Size", "value": "1 Liters" },
      { "code": "item_pack_quantity", "name": "Pack Quantity", "value": "Pack of 4" },
      …
    ],
    "image_urls": ["https://f.nooncdn.com/…", …],
    "offer_code": "a3aec6710c3a42ae",
    "product_rating": { "value": 4.8, "count": 90 },
    "variants": [
      {
        "sku": "N12278277A",
        "offers": [
          {
            "offer_code": "…",
            "price": 24.57,                    // list / was price
            "sale_price": 17.55,               // current price
            "store_name": "noon Grocery",      // → seller
            "is_buyable": true,                // → in_stock
            "stock": 10
          }
        ]
      }
    ]
  }
}
```

**Mapping rules:**
- `description` → strip HTML tags from `product.long_description`; collapse whitespace; null if empty.
- `images` → `product.image_urls` (already absolute CDN URLs).
- `attributes` → flatten `product.specifications[]` into `{ [spec.name]: spec.value }`. Preserve original names (`"Size"`, `"Pack Quantity"`, `"Allergy Info"`, etc.) — they're the user-facing labels the site renders.
- `price` / `sale_price` / `seller` / `in_stock` → read from `product.variants[0].offers[0]` (not the top-level — those fields are absent on the detail payload). Multiple variants exist for size/color/configurable SKUs; pick the offer whose `sku` matches the requested identifier, else fall back to `variants[0].offers[0]`.
- `currency` → `"AED"` for UAE (default). See locale gotcha for SAR / EGP.
- Any field absent in the payload → emit `null` (per the task's "normalize missing values to null" rule). Never invent.

**Bad / nonexistent SKU:** `404` with `{"userMessage": "Page not found"}` — surface as a not-found result, do not retry.

### 3. Compose final JSON

Always emit valid JSON only — never HTML, never wrapped prose. Empty-result and not-found shapes:

```json
// Search, no matches
{ "source": "noon", "query": "{query}", "total": 0, "items": [] }

// Detail, unknown sku (404)
{ "source": "noon", "product": null }
```

### Browser fallback

If the JSON API ever returns persistent 4xx (rate-limit, regional block), open the rendered page in a stealth + proxied Browserbase session and read the same JSON from the embedded `__NEXT_DATA__` script tag, which carries the identical search / product payload that the API serves. URLs:

- Search: `https://www.noon.com/uae-en/search/?q={query}`
- Product: `https://www.noon.com/uae-en/{url_slug}/{sku}/p/`

Both pages 200 in the stealth session used in this skill's iter-1. The browser fallback costs ~10× the API path (JS-render wait + DOM ref enumeration) — only invoke when the JSON API is unreachable. Snapshot-and-click-through is **not** required: parse `__NEXT_DATA__` and you get the same `hits[]` / `product` objects as the API.

## Site-Specific Gotchas

- **The API is fully public — no auth, no cookies, no anti-bot.** Verified 2026-05-26: identical `200` JSON returned with and without `--proxies` on both endpoints. The Akamai cookies (`ak_bmsc`, `bm_*`) in the response are set proactively; they are not required on subsequent requests. Keep `--proxies` on as a soft hedge but do not block on it.
- **The endpoint geolocates by request IP — there is no locale query parameter.** Both endpoints default to UAE (English, AED) for unrecognized regions; a US-egress proxy returned UAE results with `meta.title` containing "Dubai, Abu Dhabi and all UAE". To target a specific noon market: route requests through an in-region IP (UAE / Saudi / Egypt). The URL-path prefix `/uae-en/`, `/saudi-en/`, `/egypt-en/` does **not** work on the API surface — `https://www.noon.com/uae-en/_vs/nc/mp-customer-catalog-api/api/v3/u/search/?q=milk` (308-then-200) returns **HTML** (the rendered search page), not JSON. The locale prefix is for the user-facing storefront only.
- **Currency is implicit — derive it from the country, not the response.** No `currency` / `cc` / `iso_currency` field exists on either response. Mapping observed in iter-1: UAE → AED, Saudi Arabia → SAR, Egypt → EGP. Hard-code `"AED"` when defaulting to UAE; only swap if the caller explicitly targets another market AND you can confirm the egress IP / cookie was set accordingly.
- **`sku` and `catalog_sku` are the same string for every product observed.** Both equal `"N12278277A"` in the milk dataset. Treat `sku` as the primary identifier; carry `catalog_sku` through unchanged in case noon ever splits them.
- **`offer_code` is a per-seller binding, not a product identifier.** It identifies a *specific seller's offer on a sku* — useful for cart/buy URLs but not for the `/p` detail endpoint, which requires `sku`. `/api/v1/u/{offer_code}/p` returns `404 {"userMessage":"Page not found"}`. When given only an `offer_code`, resolve to its `sku` via a search call before fetching detail.
- **List-item `price` is the "was" price; `sale_price` is the current price.** Both endpoints share this convention. When `sale_price == price` there's no discount; do not subtract or compute a discount field unless explicitly requested.
- **`product_url` requires the trailing slash.** `https://www.noon.com/uae-en/{slug}/{sku}/p` (no trailing `/`) 308-redirects to `…/p/`. Build the trailing slash directly to avoid the extra hop.
- **Price / stock / seller live under `product.variants[0].offers[0]` on the detail payload, NOT at the top level.** The top-level `product.offer_code` matches `variants[0].offers[0].offer_code` but the prices and `is_buyable` are nested. For configurable products (size/color variants), iterate `variants[]` and pick the offer whose `sku` matches your requested identifier.
- **Description is HTML.** `product.long_description` ships with `<p>`, `<br />`, `<strong>`, `<li>` tags — strip and collapse whitespace before emitting the normalized `description` string.
- **No-result is `nbHits: 0, hits: []` — NOT a 404.** Treat as a successful empty result, not an error to retry.
- **Default page size is 50.** Use `&page={N}` (1-indexed) to paginate. `nbHits` / `nbPages` are in the response. For the documented schema (single-page-of-50), do not paginate.
- **Hits also carry `discount_tag_*` fields** (`B5G10` coupons, `RAK50` bank-card offers, etc.) — these are marketing overlays, not real prices. Ignore them when normalizing.

## Expected Output

### Search response (with matches)

```json
{
  "source": "noon",
  "query": "milk",
  "total": 59296,
  "items": [
    {
      "id": "N12278277A",
      "sku": "N12278277A",
      "catalog_sku": "N12278277A",
      "sku_config": "N12278277A",
      "offer_code": "a3aec6710c3a42ae",
      "name": "Long Life Milk Low Fat Plain 1Liters Pack of 4",
      "brand": "Almarai",
      "price": 24.57,
      "sale_price": 17.55,
      "currency": "AED",
      "rating": 4.8,
      "review_count": 90,
      "image_url": "https://f.nooncdn.com/p/pnsku/N12278277A/45/_/1711622055/bd611911-1285-42ee-8f04-837aaa1290d1.jpg",
      "product_url": "https://www.noon.com/uae-en/long-life-milk-low-fat-plain-1liters-pack-of-4/N12278277A/p/",
      "url_slug": "long-life-milk-low-fat-plain-1liters-pack-of-4",
      "in_stock": true
    }
  ]
}
```

### Search response (no matches)

```json
{ "source": "noon", "query": "zzzqxqwerimpossibletoexist123", "total": 0, "items": [] }
```

### Product detail response

```json
{
  "source": "noon",
  "product": {
    "sku": "N12278277A",
    "catalog_sku": "N12278277A",
    "offer_code": "a3aec6710c3a42ae",
    "name": "Long Life Milk Low Fat Plain 1Liters Pack of 4",
    "brand": "Almarai",
    "description": "About Brand: Almarai is a conglomerate based in Saudi Arabia listed on the stock exchange of Tadawul. It is specialized in the production and distribution of food and beverages. …",
    "price": 24.57,
    "sale_price": 17.55,
    "currency": "AED",
    "images": [
      "https://f.nooncdn.com/p/pnsku/N12278277A/45/_/1711622055/bd611911-1285-42ee-8f04-837aaa1290d1.jpg",
      "https://f.nooncdn.com/p/v1611986341/N12278277A_2.jpg",
      "https://f.nooncdn.com/p/v1611986341/N12278277A_3.jpg",
      "https://f.nooncdn.com/p/v1628171349/N12278277A_15.jpg"
    ],
    "attributes": {
      "Size": "1 Liters",
      "Pack Quantity": "Pack of 4",
      "Diet": "Vegetarian",
      "Shelf Life": "210 day",
      "Flavour": "Plain",
      "Product Ingredients": "Fresh Cow's Milk, Vitamin D3, Vitamin a. Max 1.20% Fat, Min 8.5% Non Fat Solids, Standardized and Pasteurized. 100% Pure Fresh Cow's Milk",
      "Formation": "Liquid",
      "Allergy Info": "Artificial Flavours Free",
      "Milk Source": "Dairy",
      "Fat Content": "Low Fat"
    },
    "rating": 4.8,
    "review_count": 90,
    "seller": "noon Grocery",
    "in_stock": true
  }
}
```

### Product detail response (sku not found)

```json
{ "source": "noon", "product": null }
```
