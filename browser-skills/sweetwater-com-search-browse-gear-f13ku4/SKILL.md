---
name: sweetwater-com-search-browse-gear-f13ku4
title: Search & Browse Gear on Sweetwater
description: >-
  Search Sweetwater for products and browse categories, returning structured
  data — model number, brand, price, sale/rebate flags, and new/used/demo
  condition — via the residential-proxy Fetch API (the browser path is blocked
  by PerimeterX).
website: sweetwater.com
category: ecommerce
tags:
  - ecommerce
  - music-gear
  - search
  - pricing
  - used-gear
  - sweetwater
source: 'browserbase: agent-runtime 2026-06-12'
updated: '2026-06-12'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      Confirmed blocked. `browse open --remote` returns PerimeterX 'Access to
      this page has been denied' even with --verified --proxies and a 25s+
      CAPTCHA-solve wait. Not a viable path.
  - method: api
    rationale: >-
      Search is powered by Algolia (index production_products), but the data is
      delivered fully inside the page's __NEXT_DATA__ blob — fetching the
      /store/search HTML is simpler and avoids needing Algolia app/API keys.
verified: false
proxies: true
---
# Search & Browse Gear on Sweetwater

## Purpose

Search Sweetwater (the music-gear retailer) for products, browse categories, and read back fully
structured data for each item — model number, brand, name, current price, list/retail price, sale
and rebate flags, ratings, and **new vs. used/demo/open-box** condition with per-condition pricing.
This skill is **read-only**: it never adds to cart or checks out. The recommended path uses the
Browserbase **Fetch API over a residential proxy** (`browse cloud fetch --proxies`), which returns
HTTP 200 with the full server-rendered HTML. Direct browser navigation is blocked by PerimeterX and
should not be attempted.

## When to Use

- "What does the Shure SM7B cost on Sweetwater?" / look up a specific model number or product name.
- "Find all electric guitars under $500" / browse a product category and read prices.
- "Is this item on sale?" — compare `finalPrice` vs `retailPrice` and read price-drop/rebate flags.
- "Does Sweetwater have a used/demo/open-box version of X?" — read the alternate-condition pricing.
- Pull a comparison table of model numbers, brands, prices, and conditions across search results.

## Workflow

Sweetwater is a Next.js storefront whose **keyword search is powered by Algolia** and whose **category
grids are server-rendered HTML**. The site sits behind PerimeterX (HUMAN) bot protection that denies
scripted browser sessions, but the Browserbase Fetch API with a residential proxy passes cleanly.

### Method A — Keyword / model-number search (Algolia `__NEXT_DATA__`)

1. Fetch the search URL through the residential-proxy fetch path:
   ```bash
   browse cloud fetch "https://www.sweetwater.com/store/search?s=<query>" --proxies
   ```
   The response is a JSON envelope; the HTML is in the `content` field (NOT `body`). `statusCode`
   should be `200`.
2. Extract the embedded state blob from the HTML:
   `<script id="__NEXT_DATA__" type="application/json">…</script>`. Parse it as JSON.
3. Read results from:
   - `props.pageProps.hitsTotal` — total match count.
   - `props.pageProps.hitsPerPage` — page size (42).
   - `props.pageProps.resultsState.results[0].hits` — the array of products.
4. For each hit, the useful fields are:
   - `objectID` — the **model number / item id** (e.g. `SM7B`).
   - `brand`, `productName`, `genericName`, `longDescription`.
   - `price` → `{ finalPrice, basePrice, catalogPrice, retailPrice, hasPriceDrop, isSpecialPrice,
     instantRebateAmount, mailInRebateAmount }`. **On sale** ⇔ `retailPrice > finalPrice` OR
     `hasPriceDrop` OR `isSpecialPrice` OR a non-zero rebate.
   - `attributes.condition` — usually `"New"` (or `"Demo"` for demo-only listings).
   - `attributes.alternateConditions` — array of `{ condition, itemid, price }` for **used / demo /
     B-stock** variants of the same product (e.g. `{ "condition":"Demo","itemid":"SM7Bd3","price":395.1 }`).
   - `attributes.inStock`, `attributes.isInStock`, `attributes.available`, `attributes.priceRange`.
   - `categories.lvl0` / `lvl1` / `lvl2` — hierarchical category path.
   - `rating` → `{ average, count, reviewUrl }`; `url` — relative product-detail path; `specialOffer`,
     `financing`.

### Method B — Category browse (server-rendered product cards)

1. Category URLs come in two shapes, both fetchable the same way:
   - Human-readable: `/shop/<group>/<subcategory>/` (e.g. `/shop/guitars/electric-guitars/`).
   - ID-based: `/c<ID>--<Name>` (e.g. `/c590--Solidbody_Guitars`).
   Find them in the homepage / search-page navigation, or the category landing `/shop/by-category/`.
   ```bash
   browse cloud fetch "https://www.sweetwater.com/c590--Solidbody_Guitars" --proxies
   ```
2. Category pages do **not** carry `__NEXT_DATA__`. Parse the server-rendered grid: each product is a
   `<div class="product-card …" data-itemid="<MODEL#>" …>` containing:
   - `data-itemid` — the model number.
   - `product-card__name` — full product name.
   - the price text (e.g. `$359.99`) and `product-card__offers` (e.g. `"$300.00 Off While Supplies Last"`).
   - used/open-box availability as `"Certified Open Box available for $X"` inside the card.
   - an `<a href="/store/detail/…">` link to the product detail page.
   There is also a small `ItemList` JSON-LD block, but it lists only the top ~5 featured items — use
   the `data-itemid` cards for the full grid.

### Method C — Used / demo / open-box gear

- Used and demo variants surface inline in both methods (Algolia `attributes.alternateConditions`;
  category cards' "Certified Open Box available for $X").
- A dedicated used-gear hub exists at `https://www.sweetwater.com/used` (also fetchable with
  `browse cloud fetch … --proxies`).

### Browser fallback

There is effectively **no browser fallback**. `browse open --remote` against any sweetwater.com URL
returns `"Access to this page has been denied"` (PerimeterX), and a `--verified --proxies` session
left to auto-solve the "Press & Hold" challenge for 25s+ still does not pass. Do not spend budget
driving the page — use the fetch path above.

## Site-Specific Gotchas

- **Anti-bot wall (browser path is dead):** sweetwater.com is behind PerimeterX/HUMAN. Both the
  homepage and `/store/search` return a 403 / "Access to this page has been denied" page in a driven
  browser, even with Browserbase `--verified --proxies` and a long CAPTCHA-solve wait. The **only**
  reliable path is `browse cloud fetch <url> --proxies` (residential proxy, returns 200).
- **`--proxies` is mandatory on fetch.** The plain fetch path was not relied upon; always pass
  `--proxies`.
- **Read the `content` field, not `body`.** The `browse cloud fetch` JSON envelope puts the HTML in
  `content` (with `statusCode`, `headers`, `contentType`, `encoding`). A common mistake is reading
  `body`, which is empty.
- **Two different search systems.** Keyword search (`/store/search`) is **Algolia** (`indexName:
  production_products`) and exposes clean JSON in `__NEXT_DATA__`. Category pages (`/shop/…`,
  `/c<ID>--…`) are server-rendered HTML with no `__NEXT_DATA__` — parse `product-card` markup instead.
- **Generic queries redirect to a category page.** A query that exactly matches a category name —
  e.g. `s=microphone`, `s=guitar` — returns **HTTP 307** redirecting to a `/shop/<cat>/…` category
  page (see the `Location` header), which has no Algolia JSON. Model numbers and specific terms
  (e.g. `sm7b`) stay on the Algolia search page and return 200 with `__NEXT_DATA__`. If you get a 307,
  follow the `Location` header and switch to Method B (category-card parsing).
- **`browse` CLI prints an "Update available …" notice on stderr.** This is harmless noise, NOT a
  command failure — don't let it trick you into abandoning the fetch path. (The autobrowse harness
  misread exactly this stderr as an error and wasted a whole run on the dead browser path.)
- **Pagination:** results are paged at `hitsPerPage` = 42. `props.pageProps` carries the current
  page's hits; for more results, request additional pages (the search page is paginated — small
  result sets like `sm7b` (13 hits) fit on one page).
- **Sale detection is multi-signal.** Don't rely on a single field: an item is discounted if
  `retailPrice > finalPrice`, or `hasPriceDrop === true`, or `isSpecialPrice === true`, or
  `instantRebateAmount`/`mailInRebateAmount` > 0. `specialOffer` (when non-null) describes promos.
- **Model number = `objectID`** in Algolia and **`data-itemid`** on category cards — these are the
  canonical Sweetwater item IDs you can feed into `/store/detail/<itemid>--<slug>`.

## Expected Output

### Keyword search (Method A)

```json
{
  "method": "fetch",
  "query": "sm7b",
  "hits_total": 13,
  "hits_per_page": 42,
  "products": [
    {
      "model_number": "SM7B",
      "brand": "Shure",
      "name": "SM7B Dynamic Cardioid Vocal Microphone",
      "final_price": 439,
      "retail_price": 549,
      "on_sale": false,
      "price_drop": false,
      "instant_rebate": 0,
      "condition": "New",
      "alternate_conditions": [
        { "condition": "Demo", "itemid": "SM7Bd3", "price": 395.1 }
      ],
      "in_stock": true,
      "categories": ["Studio & Recording", "Microphones & Wireless", "Dynamic Microphones"],
      "rating": { "average": 5, "count": 258 },
      "url": "/store/detail/SM7B--shure-sm7b-cardioid-dynamic-vocal-microphone"
    }
  ]
}
```

### Generic query redirected to a category (307 → Method B)

```json
{
  "method": "fetch",
  "query": "microphone",
  "redirected": true,
  "redirect_status": 307,
  "category_url": "/shop/studio-recording/microphones/",
  "note": "Generic category-name query redirected; re-fetch the category URL and parse product-card markup (Method B)."
}
```

### Category browse (Method B)

```json
{
  "method": "fetch",
  "category": "/c590--Solidbody_Guitars",
  "products": [
    {
      "model_number": "PAC112VVSB",
      "brand": "Yamaha",
      "name": "Yamaha PAC112V Pacifica Electric Guitar - Old Violin Sunburst",
      "price": 359.99,
      "offer": null,
      "open_box": null,
      "url": "/store/detail/PAC112VVSB--yamaha-pac112v-pacifica-old-violin-sunburst"
    }
  ]
}
```

### Blocked (browser path attempted)

```json
{
  "method": "browser",
  "success": false,
  "error_reasoning": "PerimeterX denied the driven session ('Access to this page has been denied'). Use `browse cloud fetch <url> --proxies` instead."
}
```
