---
name: kijiji-ca-search-listings-by-query-r934xv
title: Kijiji Search Listings by Query
description: >-
  Search Kijiji in a given city and category for listings matching a keyword
  query, returning each listing's title, price, location, posting date, and
  listing URL.
website: kijiji.ca
category: marketplace
tags:
  - kijiji
  - marketplace
  - listings
  - search
  - classifieds
source: 'browserbase: agent-runtime 2026-07-08'
updated: '2026-07-08'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      When the SSR HTML is ever blocked or the __NEXT_DATA__ shape changes, open
      the same SEO URL with a headless browser and read the identical
      __NEXT_DATA__ blob (or the rendered cards) from the fully server-rendered
      page. Verified working via autobrowse but ~100x slower and costlier than
      the single fetch.
verified: false
proxies: false
---
# Kijiji Search Listings by Query

## Purpose

Return a list of Kijiji classifieds postings matching a keyword query in a given city and category — title, price, location, posting date, listing ID, and canonical listing URL, plus the total result count for the query. Read-only; never posts, messages, or edits.

## When to Use

- Monitoring new/updated listings matching a keyword in one or more Canadian cities.
- Bulk extraction across categories, cities, or provinces.
- Anywhere you'd otherwise scrape Kijiji's rendered HTML — the listings are already embedded as structured JSON in the server-rendered page, so a single HTTP fetch beats driving a browser.

## Workflow

Kijiji's search results page is a Next.js app that **server-renders the full listing data into the initial HTML** as a `__NEXT_DATA__` JSON blob (an Apollo GraphQL cache). You do **not** need to render JavaScript, log in, use cookies, or use stealth/residential proxies — a plain HTTP GET returns HTTP 200 with all 40 listings on the page fully decoded. Lead with the fetch path. The browser path (below) works as a fallback but pays a large cost/latency premium because it drives a headless session to read the exact same blob.

1. **Build the search URL.** The canonical SEO form is:
   ```
   https://www.kijiji.ca/b-{category-slug}/{city-slug}/{keywords}/k0c{categoryId}l{locationId}
   ```
   - The human-readable slug segments (`b-bikes`, `city-of-toronto`) are **cosmetic** — only the trailing codes are authoritative. You can pass placeholder slugs (e.g. `b-x/x`) and the results are identical. Keep `{keywords}` (the 3rd path segment) correct — that is the actual query.
   - `k0` is the page-1 marker. For subsequent pages insert `/page-N/` **before** the `k0c…l…` segment: `…/{keywords}/page-2/k0c{cat}l{loc}` (page 2 = offset 40, page 3 = offset 80, …).
   - `c{categoryId}` selects the category. **Omit the `c…` code entirely for all categories** (URL becomes `…/k0l{locationId}`), or use `c0`.
   - `l{locationId}` selects the geography. Use `l0` for all of Canada.
   - Sort: append `?sort=dateDesc` for newest-first (maps to `sort=DATE&order=DESC`); default (no param) is `sort=MATCH` relevance. `priceAsc` / `priceDesc` also work.

2. **Fetch the HTML** (no proxy, no stealth):
   ```
   GET https://www.kijiji.ca/b-x/x/{keywords}/k0c{categoryId}l{locationId}
   ```
   e.g. via `browse cloud fetch "<url>"`.

3. **Extract the embedded JSON.** Pull the contents of `<script id="__NEXT_DATA__" type="application/json">…</script>` and `JSON.parse` it. Navigate to `props.pageProps.__APOLLO_STATE__` (call it `apollo`).

4. **Locate the result set.** In `apollo.ROOT_QUERY`, find the single key beginning `searchResultsPageByUrl:` → call it `srp`.
   - `srp.pagination` → `{ offset, limit, totalCount }` (totalCount is the query-wide count; each page holds up to 40 organic results).
   - `srp.searchQuery.searchString` → the decoded server query params (useful sanity check: `keywords=…&category=…&location=…&sort=…`).
   - `srp.results.topListings` → array of `{ "__ref": "StandardListing:<id>" }` — **promoted / TOP_AD ads**; usually exclude these from organic results.
   - The key matching `srp.results["mainListings({...})"]` → array of `{ "__ref": "StandardListing:<id>" }` — the **organic results** for this page. (The key literally embeds the pagination args, e.g. `mainListings({"pagination":{"limit":40,"offset":0}})` — match by prefix `mainListings`.)

5. **Decode each listing.** For every ref, read `apollo["StandardListing:<id>"]`:
   - `title` — string.
   - `price` — object. `price.amount` is in **cents** (divide by 100). `price.type` is `FIXED`, `FREE`, `SWAP_TRADE`, `PLEASE_CONTACT`, etc. `price.amount` is `null`/absent when the type isn't a fixed amount — guard for it. `price.originalAmount` (cents) present on price-drop listings.
   - `location.name` (e.g. "Old Toronto"), `location.address`, and `location.coordinates.{latitude,longitude}`.
   - `sortingDate` — ISO timestamp used for date-sort ordering (the "posted/bumped" date shown on the card). `activationDate` — original publish timestamp.
   - `url` — absolute canonical listing URL (`https://www.kijiji.ca/v-{catslug}/{cityslug}/{titleslug}/{id}`). Use it directly; don't reconstruct it.
   - `adSource` (`ORGANIC` vs `TOP_AD`) and `flags.topAd` let you filter promoted ads if any leak into a list.

6. **Paginate** if `pagination.totalCount > 40`: refetch with `/page-N/` inserted before `k0c…l…` and repeat steps 3–5. Keep to ≤ ~1 req/s.

### Discovering category & location codes

- **Category codes**: every search page's `srp.controls.filtering` has a `categorySection` group whose `values[]` list `{ label, value (=categoryId), seoUrl, totalResults }` for the current category subtree — read the code and the ready-made `seoUrl` straight from there. Verified (Bikes subtree): `10`=Buy & Sell (top), `644`=Bikes, `645`=BMX, `649`=Frames & Parts, `650`=Bike Clothing/Shoes/Accessories, `14654001`=eBike, `15096001`=Cruiser/Commuter/Hybrid, `15096002`=Fixie.
- **Location codes**: the `locationSelection` filter group lists sibling/child locations with codes + `seoUrl`. Verified: `0`=Canada (all), and provinces `9004`=Ontario, `9007`=British Columbia, `9003`=Alberta, `9001`=Québec, `9006`=Manitoba, `9009`=Saskatchewan, `9002`=Nova Scotia, `9005`=New Brunswick, `9008`=Newfoundland, `9011`=PEI, `9010`=Territories; cities/regions `1700272`=Toronto (GTA), `1700273`=City of Toronto. To resolve an arbitrary city, fetch a search in its province (`l90xx`) and read the child cities from `locationSelection.values[].seoUrl`, or start broad with `l0` (all Canada) and narrow via the returned filters.

### Browser fallback

Only if the fetch path is ever blocked or the JSON shape changes:
1. `browse open "<same SEO URL>" --remote` then `browse wait load`.
2. `browse get html body` and extract the identical `__NEXT_DATA__` blob (steps 3–5 apply unchanged) — the page is fully server-rendered, so the listings are present in the initial DOM without scrolling.
3. If you must read from the rendered DOM instead, each card is a `<li data-testid="rich-card-list-item-N">` / `<article>` with the title, price, location, date and an `<a href>` to the listing; `browse get markdown` renders all 40 cards in one shot. This path was validated end-to-end via autobrowse but is ~100× the cost of the single fetch.

## Site-Specific Gotchas

- **No anti-bot / no proxy needed.** Pre-run probe: no antibots detected; direct `browse cloud fetch` (no `--proxies`, no `--verified`) returns HTTP 200 with the full data blob. Adding stealth is unnecessary overhead. The converged/successful method used neither.
- **Slugs are cosmetic — codes rule.** `b-{category}/{city}` slug segments are ignored by the backend; only `c{categoryId}` and `l{locationId}` matter. `b-x/x/{kw}/k0c644l1700273` returns exactly the same results as the pretty URL. Don't fail a run because you can't compute the exact slug — use placeholders.
- **`price.amount` is in CENTS.** Divide by 100. A listing priced $65 shows `amount: 6500`. Missing/null amount means non-fixed price (`FREE`, `SWAP_TRADE`, `PLEASE_CONTACT`) — surface `price.type` rather than a bogus 0.
- **Separate `topListings` (promoted) vs `mainListings` (organic).** `topListings` are paid TOP_AD placements and repeat across pages; for a clean organic result set use only the `mainListings(...)` array. Individual TOP_AD entries can also appear inside `mainListings` — filter on `adSource === "ORGANIC"` / `flags.topAd === false` if you need strictly organic.
- **`mainListings` key embeds its own args.** The Apollo key is literally `mainListings({"pagination":{"limit":40,"offset":0}})`, so match it by the `mainListings` prefix, not an exact string.
- **`totalCount` can wobble by ±1 between fetches** (e.g. 4701 vs 4702) as listings churn — it's a live count, not a stable value. Don't assert exact equality across pages.
- **Pagination is path-based, not a query param.** Insert `/page-N/` before the `k0c…l…` segment; page N maps to `offset = (N-1)*40`. A `page-` segment placed elsewhere is ignored.
- **`sortingDate` vs `activationDate`.** The card's visible "date" is `sortingDate` (reflects bumps/re-posts); `activationDate` is the original publish time. Report `sortingDate` as the posting date unless you specifically need first-publish time.
- **Response Set-Cookie churn is harmless** — `machId`, `kj-ct`, etc. are set on every fetch; you can ignore them for read-only scraping (no session state required between requests).
- **`__NEXT_DATA__` is ~150 KB** and contains far more than listings (ads config, filters, i18n). Parse it, then index straight into `props.pageProps.__APOLLO_STATE__` — don't try to read the whole blob into an LLM context.
- **Inner-agent note (browser path):** driving the DOM one card at a time blows the output-token budget (a naive autobrowse run truncated at 30 turns / max_tokens compiling 40 listings). If you fall back to the browser, read the `__NEXT_DATA__` blob or `browse get markdown` in a single shot instead of per-card extraction.

## Expected Output

```json
{
  "success": true,
  "city": "City of Toronto",
  "location_id": 1700273,
  "category": "Bikes",
  "category_id": 644,
  "query": "bike",
  "sort": "match",
  "total_results": 4701,
  "page_offset": 0,
  "listings": [
    {
      "id": "1740296332",
      "title": "USED Kids MTB Mountain bike for sale",
      "price": 65.0,
      "price_type": "FIXED",
      "location": "City of Toronto",
      "latitude": 43.65508,
      "longitude": -79.42047,
      "posted_date": "2026-07-08T14:37:05.000Z",
      "activation_date": "2026-07-05T09:11:22.000Z",
      "url": "https://www.kijiji.ca/v-kids-bike/city-of-toronto/used-kids-mtb-mountain-bike-for-sale/1740296332",
      "ad_source": "ORGANIC"
    },
    {
      "id": "1709602197",
      "title": "Shotgun kids MTB Handlebars",
      "price": 35.0,
      "price_type": "FIXED",
      "location": "Old Toronto",
      "posted_date": "2026-07-07T15:58:54.000Z",
      "url": "https://www.kijiji.ca/v-kids-bike/city-of-toronto/shotgun-kids-mtb-handlebars/1709602197",
      "ad_source": "ORGANIC"
    }
  ]
}
```

Non-fixed-price and free listings:

```json
{
  "id": "1730000001",
  "title": "Free bike frame - pickup only",
  "price": null,
  "price_type": "FREE",
  "location": "Ottawa",
  "posted_date": "2026-07-06T12:00:00.000Z",
  "url": "https://www.kijiji.ca/v-bike-frames-parts/ottawa/free-bike-frame/1730000001",
  "ad_source": "ORGANIC"
}
```

No results (e.g. an over-narrow query):

```json
{
  "success": true,
  "query": "zxqw-nonexistent",
  "total_results": 0,
  "listings": []
}
```
