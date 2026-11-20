---
name: craigslist-org-search-listings-hw5qri
title: Craigslist Search Listings
description: >-
  Search Craigslist in a given city and category for listings matching a query,
  returning each listing's title, price, location, posting date, and listing
  URL.
website: craigslist.org
category: marketplace
tags:
  - craigslist
  - marketplace
  - listings
  - search
  - classifieds
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      When the JSON API is rate-limited or blocked (rare — no auth or anti-bot
      today), fall back to opening the city subdomain's /search/{category} page
      directly and parsing the rendered HTML with the per-listing regex set
      documented in the browser-fallback workflow. ~100× more expensive than the
      API path.
verified: false
proxies: false
---
# Craigslist Search Listings

## Purpose

Return a list of Craigslist postings matching a query in a given city and category — title, price, location, posting time, lat/lon, posting ID, and canonical listing URL. Read-only; never posts, edits, replies to, or flags any listing.

## When to Use

- Daily / hourly monitoring of new listings matching a query (cars, bikes, apartments, jobs, free stuff, etc.).
- Bulk extraction across multiple cities, categories, or price/bedroom ranges.
- Anywhere you'd otherwise scrape Craigslist HTML — the JSON API is faster, cheaper, and structurally more reliable than rendering `/search/{cat}` and harvesting per-listing anchors.

## Workflow

The Craigslist web UI is a thin client over a public JSON API at `https://sapi.craigslist.org` — no auth, no cookies, no session state, no anti-bot stealth required. Send a `Referer` header matching the target city subdomain; if your outbound IP is in a different region than the target city, add `postal=<zip>&search_distance=<mi>` to the query — the API geo-scopes by IP only when no `postal` is supplied (see the gotcha below). **A residential proxy is not required.** Lead with the API path; the browser path works as a fallback but pays a ~100× cost premium because the search page is fully JS-rendered (`browse snapshot` returns 0 a11y refs and harvesting per-listing URLs costs ~3 turns each).

1. **Pick city + category** (and optionally subarea). City is the Craigslist subdomain (`sfbay`, `newyork`, `losangeles`, `seattle`, `chicago`, `boston`, …). Category is the search-path abbreviation (`sss` for-sale-all, `cta` cars+trucks, `apa` apartments, `ggg` for-sale-by-owner, `jjj` jobs, `zip` free stuff, etc.). To scope to a specific subarea (city-within-region), prefix the category in `searchPath` — e.g. `searchPath=sfc/apa` for SF-proper apartments, `searchPath=eby/cta` for East Bay cars. Subarea codes are listed in each response's `data.decode.locations[i][2]`. Subarea-scoping is significantly more efficient than fetching region-wide and filtering client-side (e.g. `apa` returns ~9,800 bay-wide vs. ~253 for `sfc/apa`).

2. **First page**:
   ```
   GET https://sapi.craigslist.org/web/v8/postings/search/full
       ?searchPath={cat}
       &query={q}
       &sort={date|rel|priceasc|pricedsc}
       &batch=1-0-360-1-0
       &lang=en&cc=us
   Referer: https://{city}.craigslist.org/
   ```
   Returns JSON with `data.totalResultCount`, `data.items[]`, and decode tables under `data.decode`. Confirm the response is scoped to the right region via `data.areas` (e.g. `{"3": {"name": "newyork"}}`) — if it shows the wrong city, add `postal=<zip>&search_distance=<mi>` (any ZIP in the target metro) to override the IP-based geo-scope.

   **Common filter params** (append as query args; check `data.humanReadableParams` to confirm acceptance): `min_price`, `max_price`, `min_bedrooms`, `max_bedrooms`, `min_bathrooms`, `bundleDuplicates=1`, `hasPic=1`, `postal=<zip>`, `search_distance=<mi>`, `availabilityMode=available`, `auto_make_model=<text>`, `min_auto_year`/`max_auto_year`, `min_auto_miles`/`max_auto_miles`. Unrecognized params are silently dropped.

3. **Decode each item**. `data.items[]` is an array of positional arrays. **Critical: many fields are offsets / lookup keys, not absolute values** — always read against `data.decode.*`:
   - `item[0]` — `postingIdOffset`. Absolute id = `data.decode.minPostingId + item[0]`.
   - `item[1]` — `postedDateOffset` (seconds). Absolute epoch = `data.decode.minPostedDate + item[1]`.
   - `item[2]` — `categoryId` (integer). Maps to a 3-letter sub-category abbreviation (`cat3`) used in canonical URLs. The mapping is **not** in the response — it's a fixed Craigslist enum. Observed values: `68 → bik` (bicycles), `93 → spo` (sporting goods), `122 → pts` (parts), `197 → bop` (bicycle parts/accessories), `5 → fua` (furniture by-owner), `101 → foa` (furniture all). Other categories will need to be back-derived or resolved via the redirect-URL fallback in step 4.
   - `item[3]` — price as integer (0 or missing for free items).
   - `item[4]` — `"locIdx:hoodDescIdx:hoodIdx~lat~lon"`. Look up `data.decode.locations[locIdx]` → `[1, city, subareaAbbr]`; `data.decode.locationDescriptions[hoodDescIdx]` → display location string; parse `lat~lon` for coordinates.
   - **Title** — last array element that is a plain string (i.e. not a tagged `[code, ...]` block). For `cta` (cars+trucks) this is `item[-1]`. For `apa` (apartments) and other housing categories, a trailing `[5, beds, sqft]` housing-meta block pushes the title earlier — iterate from the end and take the first plain string.
   - Tagged blocks `[code, value]` mid-array: `code === 5` is `[beds, sqft]` (housing categories); `code === 6` is the URL slug; `code === 10` is the formatted price string ("$1,350"); `code === 4` is image-id refs; `code === 13` is the geo/cluster cell.

4. **Construct canonical post URL**:
   ```
   https://{city}.craigslist.org/{subareaAbbr}/{cat3}/d/{slug}/{postingId}.html
   ```
   - `postingId` from step 3 (offset + minPostingId)
   - `subareaAbbr` from `data.decode.locations[locIdx][2]` (e.g. `nby`, `sby`, `sfc`, `eby`, `pen`)
   - `cat3` from the categoryId enum (step 3)
   - `slug` from the `[6, ...]` tagged block

   **Wrong `cat3` will 404**. If you don't know the mapping for a categoryId, fall back to `https://{city}.craigslist.org/search/{cat}?postingId={postingId}` which redirects to the canonical URL.

5. **Paginate** (only if results > 360):
   ```
   GET https://sapi.craigslist.org/web/v8/postings/search/batch
       ?batch=1-{OFFSET}-1080-1-0-{startTs}-{endTs}
       &cacheId={cacheId from step 2}
   Referer: https://{city}.craigslist.org/
   ```
   Increment `OFFSET` in steps of 1080. `startTs`/`endTs` are the `data.cacheTs` from step 2's response and the current epoch.

### Browser fallback

When the API is unreachable or geo-locked away from the target city (rare — `postal=<zip>` almost always resolves it), open `https://{city}.craigslist.org/search/{cat}?query={q}&sort=date` directly (bypassing the bare-domain geo-redirect), then capture `browse get html body` and split per-listing chunks by the regex `<div data-pid="(\d+)" class="cl-search-result`. Within each chunk, extract:

- **URL**: `<a class="main" href="(...\.html)"` (gallery view) or `class="...posting-title" href="(...)"` (text view)
- **Title**: `class="label">([^<]+)</span>` inside the posting-title anchor
- **Posted**: `class="result-posted-date">([^<]+)</span>` (relative time, e.g. "6h ago" or "4/30")
- **Neighborhood**: `class="result-location">([^<]+)</span>`
- **Price**: `class="priceinfo">([^<]+)</span>`
- **Housing meta** (br/sqft, when present): `class="housing">([^<]+)</span>`

Skip `browse snapshot`/`click` on `/search/` — snapshot returns 0 refs and click-through costs ~3 turns per listing. Stable across `cta` and `apa` in prior validation.

## Site-Specific Gotchas

- **Geo-redirect on bare domain**: `https://www.craigslist.org/` redirects to a city based on the request IP. Always open `{city}.craigslist.org` directly. Confirmed 2026-05-19: bare-domain still redirects; deep-link to subdomain is the only reliable bypass.
- **API geolocates by request IP — `postal=<zip>&search_distance=<mi>` overrides it**: No auth, no cookies, no anti-bot — but if no `postal` is supplied, the API scopes results to the city corresponding to the request's source IP, not the `Referer` header (e.g. a NY query from an SF IP silently returns `{"1": {"name": "sfbay"}}` results). Adding `postal=<zip>` for any ZIP in the target metro plus `search_distance=<mi>` forces the result set to that region. Re-verified 2026-05-19 with direct `browse cloud fetch` calls returning correct NYC apartments (`postal=10001&search_distance=10`, 860 results, `data.areas` shows `newyork/newjersey/longisland/hudsonvalley` cluster) and SF Bay bicycles (`postal=94103&search_distance=25`, 5,635 results, `data.areas: {"1": "sfbay"}`). **A residential proxy is not required and is actively counterproductive** — `browse cloud fetch --proxies` *without* `postal` is also geo-locked to the proxy's exit-IP region, and adding `postal` to a direct fetch is ~8× faster than the proxy path. Always verify scope via `data.areas` in the response.
- **Snapshot returns 0 refs on `/search/`**: The search page is fully JS-rendered (React). Don't use `browse snapshot`/`click` to enumerate listings — fall back to `browse get html body` + regex per the Browser fallback section.
- **Compact response format**: `data.items[]` uses positional arrays + `data.decode.*` lookup tables to keep the response small (~130 KB for 360 items). Don't expect named fields per item — decode by position.
- **Pagination batch sizes**: First page is ~360 (`batch=1-0-360-1-0`); subsequent batches are 1080 each (`batch=1-OFFSET-1080-1-0`). Mixing these sizes will cause the response to silently truncate.
- **Free items have no price**: `item[3]` may be `0` or absent. Map both to `price: null` (or `"free"`) in your output; don't render `$0`.
- **Posting time precision**: The rendered HTML shows relative ("< 1 hr ago", "6h ago", "4/30"); absolute epoch is only available via the API as `data.decode.minPostedDate + item[1]`.
- **`item[0]` is NOT the postingId** — it's an offset from `data.decode.minPostingId`. Naïvely treating `item[0]` as the postingId produces 404s on every URL you construct.
- **`data.decode.locations` indexing is per-response, not stable.** The same query at two different times can produce `locations[1] → ["sfbay","sfc"]` vs. `locations[1] → ["sfbay","eby"]`. The decode block is rebuilt per cache TTL — **always look up `locations[locIdx]` from the response in hand**, never cache or hardcode the table across requests.
- **Neighborhood labels are unreliable**: `data.decode.locationDescriptions` varies per response and per category. The same neighborhood may appear under different label-table indices across responses, may be missing in some categories (e.g. "Russian Hill" shows up in `apa` but is absent from `cta` decode tables), and is sometimes replaced by a generic city-level label by the poster. For neighborhood-scoped searches, use **lat/lon bounding-box matching** on `item[4]`'s coordinates as a fallback or supplement to label-string matching. Example bbox for North Beach + Russian Hill: `lat 37.794–37.810, lon -122.425 to -122.404`.
- **Categories are an undocumented enum** — the response decode tables don't include the `categoryId → cat3` mapping; observed values across iters: `5→fua, 68→bik, 93→spo, 101→foa, 122→pts, 197→bop` (and likely many more for non-bicycle queries). The redirect URL `https://{city}.craigslist.org/search/{cat}?postingId={id}` is the safest fallback when an unknown categoryId is encountered.
- **Rate-limit self-imposed**: No formal block but Craigslist throttles aggressive clients with terse 403s. Keep ≤ 1 req/s sustained; pagination loops should sleep ~1s between batches.
- **Don't waste time on stealth fingerprinting** — the API has no anti-bot today (verified 2026-05-19 via direct unproxied `browse cloud fetch` returning 200 + 134 KB JSON on the first try with no Referer). The expensive Browserbase `--verified --proxies` flags do not improve success rate and actively slow the path.

## Expected Output

```json
{
  "city": "sfbay",
  "category": "sss",
  "query": "bicycle",
  "sort": "date",
  "total_results": 5635,
  "listings": [
    {
      "posting_id": 7927446618,
      "title": "Kryptonite Evolution 1090 3 Ft Long 10mm Steel Bike Chain BRAND NEW",
      "price": "$100",
      "location": "san leandro",
      "subarea": "eby",
      "category_id": 197,
      "cat3": "bop",
      "lat": 37.6875,
      "lon": -122.1445,
      "posted_at_epoch_seconds": 1779140987,
      "url": "https://sfbay.craigslist.org/eby/bop/d/san-leandro-kryptonite-evolution-ft/7927446618.html"
    }
  ]
}
```

Free items omit price:

```json
{
  "posting_id": 7926112233,
  "title": "Free moving boxes — Mission",
  "price": null,
  "location": "mission district",
  "subarea": "sfc",
  "cat3": "zip",
  "url": "https://sfbay.craigslist.org/sfc/zip/d/.../7926112233.html"
}
```

When the postal-override resolves to a multi-area cluster (NY metro returns 4 sub-areas), `data.areas` enumerates them and individual listings carry the correct sub-area in `locations[locIdx][1]`:

```json
{
  "city": "newyork",
  "category": "apa",
  "query": "studio",
  "total_results": 860,
  "areas": ["newyork", "newjersey", "longisland", "hudsonvalley", "elmira"],
  "listings": [
    {
      "posting_id": 7935281805,
      "title": "Newly renovated Charming Spacious Studio Near Prospect Park",
      "price": "$2,599",
      "location": "brooklyn",
      "subarea": "brk",
      "cat3": "apa",
      "lat": 40.6724,
      "lon": -73.9573,
      "url": "https://newyork.craigslist.org/brk/apa/d/brooklyn-newly-renovated-charming/7935281805.html"
    }
  ]
}
```
