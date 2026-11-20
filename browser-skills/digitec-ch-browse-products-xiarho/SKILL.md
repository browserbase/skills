---
name: digitec-ch-browse-products-xiarho
title: Digitec Browse Products
description: >-
  Search and browse products on digitec.ch, returning each product's name,
  brand, price (CHF), product URL/ID, rating, review count, availability, and
  key specs.
website: digitec.ch
category: ecommerce
tags:
  - ecommerce
  - shopping
  - search
  - digitec
  - galaxus
  - products
source: 'browserbase: agent-runtime 2026-06-01'
updated: '2026-06-01'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      The site is a Relay/GraphQL SPA whose product lists load from POST
      /graphql using persisted query IDs (hashes that change per deployment,
      e.g. searchImageSERPSidebarQuery=8d5c11aea498ccd0e17b4bf979df2fd0).
      Replaying it requires the current queryId + the exact variables shape and
      the response is positional/normalized — brittle and not worth it versus
      reading the rendered grid.
  - method: fetch
    rationale: >-
      Plain HTTP GET of /en/search?q=... returns 200 (no proxy needed) but the
      HTML and __NEXT_DATA__ contain zero product data — only nav + a preloaded
      search-query stub. Products are fetched client-side, so a JS-executing
      browser is required to see results.
verified: false
proxies: false
---
# Digitec Browse Products

## Purpose

Search and browse the product catalog on **digitec.ch** (Digitec, the Swiss-market arm of Digitec Galaxus) and return a structured list of matching products. For each product card you get: display name, brand, model, price in CHF, canonical product URL, numeric product ID, average star rating, review count, stock/availability hint, product type, and a one-line spec summary. Read-only — this skill only searches and reads listings; it never adds to cart, compares, or checks out.

## When to Use

- "Find <product> on digitec.ch" / "what laptops does digitec sell" / "search digitec for a Logitech mouse".
- Price/assortment monitoring for a query or a whole product category.
- Pulling the top-N products for a category sorted by price, rating, or popularity.
- Any time you'd otherwise scrape the digitec search HTML — the page is a client-rendered SPA, so a real (JS-executing) browser session is required.

## Workflow

digitec.ch is a Relay/GraphQL single-page app behind Akamai. **Product data is NOT in the server HTML** — a plain `fetch` of the search URL returns 200 but ships zero products (only navigation chrome and a preloaded query stub in `__NEXT_DATA__`). You must drive a JS-executing browser and read the **rendered** grid. A bare Browserbase session (no proxies, no verified/stealth) was sufficient on 2026-06-01; escalate to `--proxies`/`--verified` only if you hit an Akamai challenge.

1. **Open the search URL** (English locale — digitec defaults to German otherwise):
   ```
   https://www.digitec.ch/en/search?q=<url-encoded query>
   ```
   ```bash
   sid=$(browse cloud sessions create --keep-alive | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
   export BROWSE_SESSION="$sid"
   browse open "https://www.digitec.ch/en/search?q=laptop" --remote
   ```
   The search engine is "smart": it usually **redirects to the best-matching producttype page and auto-applies filters**. E.g. `q=laptop` → `/en/s1/producttype/notebooks-6?q=laptop`; `q=logitech mouse` → `/en/s1/producttype/mouse-62?q=logitech+mouse&filter=bra=292` (brand pre-filtered). This is expected — the rendered grid is still your result set. To browse a category directly without a text query, open the producttype URL itself (e.g. `/en/s1/producttype/notebooks-6`).

2. **Wait for the grid to render** (~5–8s after `open`). Confirm with `browse get url` (it will have settled on the `…/producttype/…` URL) and that the page title contains `Search` or the category name.

3. **Read the product list as markdown** — the cheapest high-signal extraction:
   ```bash
   browse get markdown body --remote > grid.md
   ```
   The header line `## <X> of <Y> products` gives the matched count `X` and the category total `Y`. Each product card is a repeating block under `### Product List`:
   ```
   [](/en/s1/product/<slug>-<productId>)
   ![<Full Name> (<spec>)](https://static01.galaxus.com/...jpeg)
   In our showroom                 ← optional availability line
   [<Product Type>](/en/s1/producttype/<type>-<id>)
    CHF<price>
   **<Brand>** <Model>
   <spec summary line>
   <reviewCount>                    ← trailing integer = number of ratings
   ```
   Parse per card:
   - **product_url**: the `/en/s1/product/…` link → prefix with `https://www.digitec.ch`.
   - **product_id**: the trailing integer of that slug (e.g. `…notebooks-62428416` → `62428416`). Only links whose path contains `/product/` are products; `/producttype/` links are categories.
   - **name / spec**: from the image alt text `![Name (spec)](…)`, or `**Brand** Model` + the spec summary line.
   - **brand**: the bold token (`**ASUS**`).
   - **price_chf**: the `CHF…` value. Swiss formatting: `.–` means `.00`; an apostrophe is the thousands separator (`CHF1'459.–`).
   - **review_count**: the lone trailing integer after the spec line.
   - **availability**: optional free-text line ("In our showroom", "Mail delivery", "Available: …") — absent on many cards.

4. **Get the star rating** (not present in markdown — it renders as star SVGs). Use the accessibility snapshot; each rated card exposes an `image` node whose label is `"<count> ratings <avg> out of 5 stars"`:
   ```bash
   browse snapshot --remote | grep -E "out of 5 stars"
   # e.g. "674 ratings 4.8 out of 5 stars"
   ```
   Join these to cards in order, or skip if you only need count/price.

5. **Sort (optional)** via the "Sort by:" combobox. Click it, then click the desired option:
   ```bash
   browse snapshot --remote                 # find the combobox + option refs
   browse click @<sort-combobox-ref> --remote
   browse click @<option-ref> --remote      # Lowest price / Highest price / Rating / ...
   ```
   Options: **Relevance, Lowest price, Highest price, Rating, Delivery date, Top-selling, New on Digitec, Discount**. Selecting one writes a `so=<n>` query param to the URL (observed `so=5` = Lowest price) and reloads the grid. The combobox is the reliable path — the `so=` enum values are non-obvious and a literal `&sort=price` in the URL is ignored.

6. **Paginate / load more.** The grid lazy-loads ~48 cards initially (`## 48 of <X> products`). It uses **infinite scroll**, not numbered pages — scroll to the bottom to trigger the next batch, then re-read markdown:
   ```bash
   browse press End --remote   # or repeated scroll; wait ~2s, then re-read grid.md
   ```
   Repeat until the loaded count reaches `X` (or enough for your N).

7. **Release** the session when done: `browse cloud sessions update "$sid" --status REQUEST_RELEASE`.

### Browser fallback / escalation
The bare session above is the recommended (and only confirmed-working) path. If Akamai starts challenging (unexpected redirect loops, 403, or a JS challenge page), recreate the session with `--proxies` and, if still blocked, `--verified`, and retry from step 1. There is no faster non-browser path — see the GraphQL gotcha below.

## Site-Specific Gotchas

- **Products are client-rendered — `fetch` is useless for data.** `browse cloud fetch https://www.digitec.ch/en/search?q=laptop` returns 200 with full HTML, but the HTML and `__NEXT_DATA__` (only ~8 KB) contain **no products** — just nav and a `searchImageSERPSidebarQuery` stub. You must execute JS. Don't waste a turn fetching and grepping for prices; there are none.
- **Don't bother reverse-engineering GraphQL.** The SPA POSTs to `/graphql` using Relay **persisted query IDs** (hashes like `8d5c11aea498ccd0e17b4bf979df2fd0`) rather than inline query text. The IDs rotate on every front-end deploy, the variables shape is undocumented, and `graphqlGatewayForceQueryId` gates whether raw query text is even accepted. Confirmed not worth it vs. reading the rendered grid.
- **Search redirects + auto-filters.** A text query rarely stays on `/en/search`; it 301/clientside-redirects to the best `producttype` and may inject a brand/category `filter=` (e.g. `filter=bra=292` for Logitech). Treat the landed producttype grid as your results. If you specifically need an un-narrowed multi-category search, this site won't reliably give it for product-like queries.
- **Locale matters.** digitec.ch is Switzerland and defaults to **German**. Always use the `/en/` path prefix for English labels ("Product List", "Sort by", availability strings). Currency is always **CHF**.
- **Swiss number formatting.** Price `.–` = `.00`; thousands separator is an apostrophe (`CHF1'459.–`). Strip `'` and map `.–`→`.00` before parsing to a number.
- **Star rating is image-only.** The numeric average ("4.8 out of 5") exists solely in the rating `image` accessibility label; the markdown shows only the integer **review count**. Use `browse snapshot` for the average, `browse get markdown` for the count.
- **Counts mean two things.** `## 187 of 4548 products` = 187 matched the (filtered) query out of 4548 in that producttype; later `## 48 of 187 products` = 48 currently loaded of 187 matched (lazy-load progress). Don't confuse "loaded" with "total".
- **Infinite scroll, no page numbers.** There is no `?page=N` — scroll to load more batches of ~48.
- **Anti-bot:** Akamai Bot Manager is present (`ak_bmsc` cookie set on every response) but did not challenge a bare Browserbase session or plain fetch on 2026-06-01. Metadata reflects this (`verified:false, proxies:false`); escalate only on a visible challenge.
- **Network capture caveat (tooling):** `browse network on` and a second CDP tracer attach did not record requests on this remote session in testing (daemon "running but not responding" warning) — driving the page and reading the DOM is the dependable route.

## Expected Output

A normalized list, e.g.:

```json
{
  "query": "logitech mouse",
  "landed_url": "https://www.digitec.ch/en/s1/producttype/mouse-62?q=logitech+mouse&filter=bra=292",
  "product_type": "Mouse",
  "matched_count": 187,
  "category_total": 4548,
  "sort": "relevance",
  "products": [
    {
      "product_id": "35791643",
      "name": "Logitech MX Anywhere 3S",
      "brand": "Logitech",
      "model": "MX Anywhere 3S",
      "spec": "Wireless",
      "product_type": "Mouse",
      "price_chf": 54.90,
      "rating": 4.8,
      "review_count": 674,
      "availability": null,
      "url": "https://www.digitec.ch/en/s1/product/logitech-mx-anywhere-3s-wireless-mouse-35791643"
    },
    {
      "product_id": "62428416",
      "name": "ASUS Zenbook 14",
      "brand": "ASUS",
      "model": "Zenbook 14",
      "spec": "14\", 1000 GB, 32 GB, CH, Intel Core Ultra 9 285H",
      "product_type": "Notebooks",
      "price_chf": 1459.00,
      "rating": null,
      "review_count": 9,
      "availability": "Mail delivery",
      "url": "https://www.digitec.ch/en/s1/product/asus-zenbook-14-14-1000-gb-32-gb-ch-intel-core-ultra-9-285h-notebooks-62428416"
    }
  ]
}
```

Notes on shapes:
- `rating` is `null` when the rating image label isn't captured (e.g. you only read markdown); `review_count` is still available from markdown.
- `availability` is `null` for cards with no stock hint line.
- `price_chf` is the numeric value after normalizing Swiss formatting (`'` removed, `.–` → `.00`).
- For a no-results query the grid renders `## 0 of … products` and an empty `### Product List` — return `"products": []` with `matched_count: 0`.
