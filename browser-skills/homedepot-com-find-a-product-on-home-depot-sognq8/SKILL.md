---
name: homedepot-com-find-a-product-on-home-depot-sognq8
title: Home Depot Find a Product
description: >-
  Search homedepot.com for products matching a free-text query, brand+model, or
  itemId; return canonical /p/{slug}/{itemId} URLs, titles, images, and
  (optionally, via a Verified browser session) price, availability, brand,
  rating, and key specs. Read-only.
website: homedepot.com
category: shopping
tags:
  - home-improvement
  - shopping
  - product-search
  - akamai
  - hybrid
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: hybrid
alternative_methods:
  - method: api
    rationale: >-
      Browserbase Search API (bb search) indexes Home Depot's catalog via
      Google/Bing and returns canonical /p/{slug}/{itemId} URLs, titles, and
      images for $0 browser cost. Validated as the discovery shortcut for this
      skill. Sufficient on its own when the caller only needs to resolve a query
      to a product URL + image.
  - method: browser
    rationale: >-
      When the caller needs price, availability, specs, or reviews — fields not
      in the search-API snippet — a Verified+residential-proxy browser session is
      required. Both --verified and --proxies are mandatory; the
      cookieless Browserbase Fetch API (with or without --proxies) is 100%
      Akamai-blocked across every homedepot.com path tested in iter-1.
  - method: cli
    rationale: >-
      Confirmed dead-end: bb fetch returns HTTP 200 with the Akamai sensor
      challenge body on /, /s/, /p/{itemId}, /p-search/, /robots.txt, and
      /api/v1/products/{itemId}. apionline.homedepot.com returns 403 from
      datacenter IPs. Don't waste turns on cookieless paths.
verified: true
proxies: true
---
# Home Depot Find a Product

## Purpose

Given a natural-language product query (free text, brand+model, or a Home Depot itemId), return one or more matching products from `homedepot.com` — title, canonical URL, 9-digit itemId, image URL, and (when a browser session is used) current price, availability, brand, rating, and key specs. Read-only — never adds to cart, never checks out.

## When to Use

- "Find me a DEWALT cordless drill on Home Depot."
- "Get the Home Depot URL and current price for a Behr Marquee paint in Cameo White."
- "I have model number DCD791P1 — pull the Home Depot listing."
- Bulk product-URL resolution for a list of brand+model strings prior to price-monitoring.
- Any flow where the next step is "open the product page in a browser" — this skill yields the canonical `/p/{slug}/{itemId}` URL plus enough metadata to disambiguate.

## Workflow

Home Depot is fronted by Akamai Bot Manager. Cookieless HTTP paths (raw `curl`, `bb fetch` with or without `--proxies`) get a 200 OK whose body is the Akamai sensor challenge page — never the rendered product HTML. Verified across `/`, `/s/?`, `/p-search/?`, `/p/{itemId}`, `/robots.txt`, and `apionline.homedepot.com` (the last 403s outright from datacenter IPs). **There is no public JSON API and no cookieless fetch path that bypasses Akamai.**

There IS, however, a much cheaper discovery shortcut than driving the search page: **Browserbase Search API** (`bb search`) indexes Home Depot's catalog through Google/Bing and returns canonical `/p/{slug}/{itemId}` URLs + titles + product images — for zero browser cost and no anti-bot exposure. Use it as step 1; only spin up a Verified browser if the caller needs fields the search snippet doesn't include (price, stock, specs, reviews).

### 1. Discovery — `bb search` (no browser, no anti-bot risk)

```bash
bb search "<your query> site:homedepot.com/p" --num-results 10 --output /tmp/hd-search.json
```

Each result for a `/p/` URL contains:

```json
{
  "id":  "https://www.homedepot.com/p/DEWALT-...-DCD791P1/312119566",
  "url": "https://www.homedepot.com/p/DEWALT-...-DCD791P1/312119566",
  "title": "20V MAX XR Cordless Brushless 1/2 in. Drill/Driver with (1) 20V 5.0Ah Battery, Charger and Bag",
  "publishedDate": "2025-03-26T00:00:00.000Z",
  "image": "https://images.thdstatic.com/productImages/.../dewalt-power-drills-dcd791p1-64_1000.jpg"
}
```

Parse the trailing 9-digit segment as `itemId`:

```bash
itemid=$(echo "$url" | grep -oE '/[0-9]{9,}([?/]|$)' | grep -oE '[0-9]{9,}')
```

The `site:homedepot.com/p` operator filters out the category browse pages (`/b/...`), reviews pages (`/p/reviews/...`), and Q&A pages (`/p/questions/...`) that otherwise pollute results. If the query is generic enough (e.g. "cordless drill"), `/b/` category-listing pages may still appear — filter client-side by requiring `/p/{slug}/{itemId}` in the URL.

For SKU lookups, search with `"<model#> home depot"` rather than the bare model — observed during validation: `"model# DCD791P1 home depot"` resolves cleanly while `"DCD791P1"` alone surfaces the manufacturer's own site as a competing top result.

### 2. Enrichment — only if you need price/stock/specs (browser required)

A Verified + residential-proxy session is mandatory:

```bash
SID=$(bb sessions create --keep-alive --verified --proxies | jq -r '.id')
export BROWSE_SESSION="$SID"
browse --connect "$SID" open "https://www.homedepot.com/p/$itemid"   # short form — redirects to canonical /p/{slug}/{itemId}
browse --connect "$SID" wait load
browse --connect "$SID" wait timeout 3000                            # price widget + JSON-LD hydrate ~1–3 s after load
browse --connect "$SID" snapshot
```

Both `--verified` and `--proxies` are required. A bare or proxies-only session lands on the Akamai bot-challenge page (`<div id="sec-if-cpt-container">`) — that's the failure-mode signature; if you see it in `browse get html body`, treat the session as burned and recreate it.

Extract fields from the snapshot a11y tree or from the embedded `<script type="application/ld+json">` Product block (every `/p/{itemId}` page emits one once Akamai clears). The structured-data block carries `name`, `brand.name`, `image`, `sku`, `offers.price`, `offers.priceCurrency`, `offers.availability` (`InStock` | `OutOfStock` | `PreOrder`), and `aggregateRating.{ratingValue, reviewCount}` — read these first; fall back to a11y-ref scraping only for fields the schema omits (e.g. localized-store inventory, current promo callouts).

Release when done:

```bash
bb sessions update "$SID" --status REQUEST_RELEASE
```

### 3. Combine + emit

Merge step-1 search metadata (URL, title, image, itemId) with step-2 enriched fields (price, availability, brand, rating). If the caller only asked for "find me a product," steps 1 alone suffices — don't open a browser unless price/stock/specs were requested.

## Site-Specific Gotchas

- **Akamai blocks all cookieless fetches.** `bb fetch https://www.homedepot.com/<any-path>` returns HTTP 200 with the Akamai challenge body (`<script src="/06MU_...?t=...">` + `<div id="sec-if-cpt-container">`) — including `/robots.txt`, `/p/{itemId}`, `/p-search/?keyword=...`, and `/api/v1/products/{itemId}`. Without `--proxies`, the same paths return HTTP 403. **Don't waste turns trying `bb fetch` variants** — there's no header / param / path combo that defeats the challenge. The browser path with `--verified --proxies` is the only known cookieless-incompatible path that yields rendered HTML.
- **`apionline.homedepot.com` is 403 from datacenter IPs.** Verified during iter-1 with `bb fetch --proxies --allow-redirects`. It returns Akamai's "Access Denied" HTML, not the bot-challenge page — meaning even a successful CAPTCHA solve at the www level wouldn't unlock the GraphQL gateway from a non-residential egress. **Don't waste time on the internal GraphQL endpoint.**
- **`m.homedepot.com` and `store.homedepot.com` are TLS-cert-rotation / redirect traps.** `m.homedepot.com` 502s with "TLS certificate verification failed" through Browserbase Fetch even with `--allow-redirects`; `store.homedepot.com` 500s. Stick to `www.homedepot.com`.
- **URL shape: `/p/{slug}/{itemId}` is canonical; `/p/{itemId}` redirects to it.** ItemIds are 9-digit integers (e.g. `312119566`, `331273305`). The slug is decorative but URL-stable — if Home Depot rewrites the slug across catalog updates, the itemId path still resolves. For storing references, persist the itemId, not the full URL.
- **`bb search` over-indexes auxiliary pages.** Without the `/p` path-filter, top results frequently include `/p/reviews/...`, `/p/questions/...`, and `/b/...` category-listing pages mixed in with actual product pages. Always require `/p/{slug}/{9-digit-itemId}` in the URL when filtering — slug must be non-empty (no `reviews` or `questions` keyword) and itemId must match `[0-9]{9,}`.
- **`bb search` for bare model numbers leaks to the manufacturer site.** A query of `"DCD791P1"` returns the DEWALT.com product page as the second result; `"home depot DCD791P1"` or `"<model> site:homedepot.com/p"` keeps results on `homedepot.com`. Always pin the domain explicitly.
- **Category browse uses an `N-{taxonomy-id}` token.** URLs like `/b/Tools-Power-Tools-Drills/Cordless/Brushless/N-5yc1vZc27fZ1z140i3Z1z17tnq` encode a taxonomy intersection in the `N-` segment (chain of `Z`-delimited refinement codes). This is opaque but stable — if a caller wants "all Brushless Cordless Drills" rather than a single product, capture the `N-...` token from the search result and pass it through; don't try to reconstruct.
- **Search results include a `publishedDate` that is the search-engine first-indexed date, not the catalog list date.** Don't use it as "product launch" or "last updated" — it's a search-engine artifact (typically the date the URL was first crawled). Useful only as a recency tie-breaker between near-duplicate listings.
- **Hammer drill / drill / driver are distinct catalog entries.** Casual queries like "cordless drill" return a mix of drill-drivers and hammer drills, plus impact drivers. If the caller specified one, post-filter `title` for the keyword (`hammer`, `impact`) rather than assuming the top result is correct.
- **`image` field is sometimes absent.** About 20% of search results omit `image` (typically older catalog entries). Don't rely on it being present; if needed, fall back to the `image` field in the `/p/{itemId}` JSON-LD block during step 2.
- **The Akamai sensor JS is the "this session is burned" signal.** If at any point during a browser session `browse get html body` contains `id="sec-if-cpt-container"` or `class="behavioral-content"`, the session has tripped Akamai. Release and recreate with Verified+proxy; don't try to interact with the challenge UI from a script.
- **Sandbox firewall caveat (build-time, not runtime).** The browse-sh build sandbox cannot reach `connect.usw2.browserbase.com` (DNS-firewalled), so this skill's browser path was not directly validated end-to-end in iter-1; only the search-API discovery path was. A runtime agent without that firewall should expect the browser path to behave per the OpenTable / Akamai pattern (Verified + proxies → rendered DOM, sometimes 1–2 retries needed on cold sessions).

## Expected Output

Schema for a search-only response (step 1 alone):

```json
{
  "query": "cordless drill",
  "match_count": 8,
  "method": "bb-search",
  "products": [
    {
      "itemId": "312119566",
      "title": "20V MAX XR Cordless Brushless 1/2 in. Drill/Driver with (1) 20V 5.0Ah Battery, Charger and Bag",
      "url": "https://www.homedepot.com/p/DEWALT-20V-MAX-XR-Cordless-Brushless-1-2-in-Drill-Driver-with-1-20V-5-0Ah-Battery-Charger-and-Bag-DCD791P1/312119566",
      "image": "https://images.thdstatic.com/productImages/a62efdbd-f93b-4614-9e89-7dfad8dc5c3a/svn/dewalt-power-drills-dcd791p1-64_1000.jpg",
      "first_indexed": "2025-03-26"
    }
  ]
}
```

Schema for enriched response (step 1 + step 2):

```json
{
  "query": "DEWALT DCD791P1",
  "match_count": 1,
  "method": "bb-search+browser",
  "products": [
    {
      "itemId": "312119566",
      "title": "20V MAX XR Cordless Brushless 1/2 in. Drill/Driver with (1) 20V 5.0Ah Battery, Charger and Bag",
      "url": "https://www.homedepot.com/p/DEWALT-20V-MAX-XR-Cordless-Brushless-1-2-in-Drill-Driver-with-1-20V-5-0Ah-Battery-Charger-and-Bag-DCD791P1/312119566",
      "image": "https://images.thdstatic.com/productImages/.../dewalt-power-drills-dcd791p1-64_1000.jpg",
      "brand": "DEWALT",
      "model_number": "DCD791P1",
      "price": { "value": 199.00, "currency": "USD" },
      "availability": "InStock",
      "rating": { "value": 4.8, "count": 3471 }
    }
  ]
}
```

Failure shapes:

```json
// No products match the query at all
{ "query": "xyzzy floogle widget", "match_count": 0, "method": "bb-search", "products": [] }

// Browser enrichment hit Akamai and could not recover after 2 retries
{ "query": "...", "match_count": 1, "method": "bb-search+browser",
  "products": [ { "itemId": "...", "title": "...", "url": "...", "_enrichment_error": "akamai_blocked" } ] }
```
