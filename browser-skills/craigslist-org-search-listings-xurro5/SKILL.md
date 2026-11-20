---
name: craigslist-org-search-listings-xurro5
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
source: 'browserbase: agent-runtime 2026-05-28'
updated: '2026-05-28'
recommended_method: api
alternative_methods:
  - method: fetch
    rationale: >-
      The public JSON API at sapi.craigslist.org is unauthenticated and returns
      up to 360 listings in a single ~150KB response. Use `browse cloud fetch`
      (no proxies needed) with `postal=<zip>&search_distance=<mi>` to override
      the IP-based geo-scope.
  - method: browser
    rationale: >-
      Fallback when the JSON API is unreachable or rate-limited. Open
      https://{city}.craigslist.org/search/{cat} directly, then parse the
      rendered DOM via `browse get html body` and the `data-pid="\d+"
      class="cl-search-result` chunk regex. ~100x more expensive than the API
      path; avoid unless necessary.
verified: false
proxies: false
---
# Craigslist Search Listings

## Purpose

Search Craigslist within a chosen city subdomain and category for postings matching a query, returning each listing's title, price, location/neighborhood, posting date (absolute epoch + relative label), lat/lon, posting ID, and canonical listing URL. Read-only — never posts, edits, replies, or flags. Optimised for the public JSON API at `sapi.craigslist.org`; falls back to the rendered HTML search page when the API is unreachable or geo-locked away from the desired city.

## When to Use

- Hourly or daily monitoring for new postings matching a saved query/category in one or more cities.
- Bulk extraction across multiple cities or sub-areas (cleaner than scraping the JS-rendered search page).
- Building a normalized dataset of for-sale, housing, jobs, or services listings with stable coordinates, prices, and canonical URLs.
- Anywhere you would otherwise scrape Craigslist HTML — the JSON API is faster, cheaper, schema-stable, and returns ~360 listings in a single ~150 KB response.

## Workflow

The Craigslist web UI is a thin JavaScript client over an unauthenticated public JSON API at `https://sapi.craigslist.org`. There is no auth, cookies, captcha, or anti-bot stealth on this endpoint, but it **geo-scopes by request IP** — when no `postal=` parameter is supplied it returns the city corresponding to your outbound IP, ignoring the `Referer` header. Add `postal=<zip>&search_distance=<mi>` to force the desired metro. A residential proxy is NOT required (and in fact slows the request without changing the source-IP region). Lead with the API; the rendered-page fallback is ~100× more expensive because the search page is fully JS-rendered (`browse snapshot` returns a forest of generic `div/span` xpaths with no clickable listing refs).

1. **Pick city + category** (optionally sub-area).
   - **City** = Craigslist subdomain (`sfbay`, `newyork`, `losangeles`, `chicago`, `seattle`, `boston`, …).
   - **Category** = search-path abbreviation: `sss` for-sale-all, `bia` bicycles-all, `cta` cars+trucks, `apa` apartments, `ggg` for-sale-by-owner, `jjj` jobs, `bbb` gigs, etc.
   - **Sub-area** (city-within-region): prefix the category in `searchPath`. E.g. `searchPath=sfc/apa` = SF-proper apartments only (returns ~250 vs. ~9,800 region-wide); `searchPath=eby/cta` = East Bay cars only. Sub-area codes are emitted in each response at `data.decode.locations[i][2]` (`sfc`, `eby`, `nby`, `sby`, `pen`, `que`, `mnh`, `brk`, …). Sub-area scoping is dramatically cheaper than fetching region-wide and filtering client-side.

2. **First page request**:
   ```
   GET https://sapi.craigslist.org/web/v8/postings/search/full
       ?searchPath={cat}
       &query={q}
       &sort={date|rel|priceasc|pricedsc}
       &batch=1-0-360-1-0
       &lang=en&cc=us
       &postal={zip}&search_distance={mi}    # optional but REQUIRED if your IP is in a different metro
   Referer: https://{city}.craigslist.org/
   ```
   Returns JSON with `data.totalResultCount`, `data.items[]` (up to 360 entries), `data.cacheTs`, `data.cacheId` (for pagination), `data.location` (the resolved metro), and `data.decode.*` lookup tables. **Verify scope** via `data.areas` (e.g. `{"3": {"name": "newyork"}}`) and `data.location.url`; if it shows the wrong city, add `postal=` for any ZIP in the target metro plus `search_distance=` (~10–50 mi typically).

   **Common filter params** (append as additional query args; check `data.humanReadableParams` to confirm acceptance — unknown params are silently dropped):
   `min_price`, `max_price`, `min_bedrooms`, `max_bedrooms`, `min_bathrooms`, `min_sqft`, `max_sqft`, `bundleDuplicates=1`, `hasPic=1`, `availabilityMode=available`, `auto_make_model=<text>`, `min_auto_year`, `max_auto_year`, `min_auto_miles`, `max_auto_miles`, `condition=<int>`, `srchType=T` (title-only).

3. **Decode each item — `data.items[]` entries are positional arrays, NOT named-field objects**, and several fields are offsets/lookup keys, not absolute values. Always decode against `data.decode.*`:

   | Position | Meaning | Resolve via |
   |---|---|---|
   | `item[0]` | `postingIdOffset` | **postingId = `data.decode.minPostingId + item[0]`** |
   | `item[1]` | `postedDateOffset` (seconds) | **epoch = `data.decode.minPostedDate + item[1]`** |
   | `item[2]` | `categoryId` (int) | Maps to 3-letter sub-category `cat3` used in canonical URLs — undocumented enum, see Gotchas |
   | `item[3]` | price (integer dollars) | `0` for free, missing/`-1` for "contact for price" |
   | `item[4]` | `"locIdx[:hoodDescIdx[:hoodIdx]]~lat~lon"` | `data.decode.locations[locIdx]` → `[areaId, city, subareaAbbr]`; lat/lon parse directly from the trailing `~lat~lon` |
   | mid-array `[code, value]` tagged blocks | metadata | `code=4` image refs (array); `code=5` `[beds, sqft]` housing meta; `code=6` URL slug string; `code=10` formatted price string ("$1,350"); `code=13` opaque hash |
   | **Title** | last array element that is a **plain string** (i.e. not a `[code, ...]` tagged block) | iterate from the end and take the first non-array, non-number element |

   **Why "from the end" matters**: for `sss`/`bia`/`cta` the title is typically `item[-1]`. For housing (`apa`, `roo`, `reb`, …), a trailing `[5, beds, sqft]` block pushes the title to `item[-2]`. Some items also contain a raw integer (e.g. `-12`) mid-array as an image-count flag — your decoder should ignore non-string non-tagged entries when looking for the title.

4. **Construct the canonical post URL**:
   ```
   https://{city}.craigslist.org/{subareaAbbr}/{cat3}/d/{slug}/{postingId}.html
   ```
   - `postingId` from step 3 (offset + `minPostingId`).
   - `subareaAbbr` from `data.decode.locations[locIdx][2]` (`sfc`, `eby`, `nby`, `sby`, `pen`, `que`, `mnh`, `brk`, …); if the locations row has only 2 elements (no sub-area abbreviation), the sub-area segment can be omitted and Craigslist will still resolve via redirect.
   - `cat3` from the categoryId enum (see Gotchas — undocumented).
   - `slug` from the `[6, "..."]` tagged block.

   **Fallback when `cat3` is unknown**: `https://{city}.craigslist.org/search/{cat}?postingId={postingId}` redirects to the canonical URL. Always works; cheaper than re-deriving the enum.

5. **Paginate (only when `totalResultCount > 360`)**:
   ```
   GET https://sapi.craigslist.org/web/v8/postings/search/batch
       ?batch=1-{OFFSET}-1080-1-0-{startTs}-{endTs}
       &cacheId={data.cacheId from step 2}
       &lang=en&cc=us
   Referer: https://{city}.craigslist.org/
   ```
   Increment `OFFSET` in steps of 1080. `startTs = data.cacheTs` (from step 2), `endTs = current epoch`. Same `data.decode.*` semantics; `cacheId` ties continuation pages to the original snapshot.

### Browser fallback (use only when the JSON API is unreachable / geo-locked / rate-limited)

The rendered `/search/{cat}` page is fully JS-rendered. Open it directly (bypass the geo-redirect from `www.craigslist.org`):

```
https://{city}.craigslist.org/search/{cat}?query={q}&sort=date
```

Then either:

- **Recommended**: `browse get html body --remote` (returns the post-render DOM as `{"html": "..."}` JSON envelope — unwrap before regex-matching). Skip `browse snapshot` / `browse click` — snapshot returns thousands of unstructured xpath leaves with no listing-anchor refs, and click-through costs ~3 turns per listing.

Per-listing chunks are reliably delimited by `data-pid="(\d+)" class="cl-search-result`. Within each chunk:

| Field | Regex |
|---|---|
| Posting ID | from the chunk-splitter capture group above |
| Canonical URL | `class="[^"]*posting-title[^"]*"[^>]+href="(https://[^"]+\.html)"` |
| Title | `posting-title"><span class="label">([^<]+)</span>` |
| Posted relative | `<span class="result-posted-date">([^<]+)</span>` (e.g. `&lt;1hr ago`, `2 hours ago`, `4/30`) |
| Location/neighborhood | `<span class="result-location">([^<]+)</span>` |
| Price | `<span class="priceinfo">([^<]+)</span>` (absent for free / "contact" listings) |
| Housing meta (apa/roo) | `<span class="[^"]*housing[^"]*">([^<]+)</span>` |

Validated 2026-05-28 on `sfbay/sss?query=bicycle&sort=date` — single `browse get html body` returned 200 listing chunks, 200 titles, 200 dates, 200 locations, 184 prices (16 free/contact) with the patterns above.

## Site-Specific Gotchas

- **Geo-redirect on bare domain**: `https://www.craigslist.org/` redirects to a city based on the request IP. Always open `{city}.craigslist.org` directly; never depend on `Referer` to select the city for either the website or the API.
- **API geolocates by request IP — `postal=<zip>&search_distance=<mi>` is the override.** Without `postal`, `sapi.craigslist.org` silently returns results for the metro covering your outbound IP, even when `Referer: newyork.craigslist.org` is set. Add `postal=<any zip in the target metro>` plus `search_distance=<mi>` to force the result set. Verified 2026-05-28: from a sandbox IP that geolocates to SF Bay, requesting `searchPath=sss&query=guitar&postal=10001&search_distance=10` correctly returned `data.areas: {"3": {"name": "newyork"}}` with 928 NYC results. **A residential proxy does NOT change this** — the proxy egress IP is still typically not in the target metro, so `postal=` is the only reliable override. Always validate scope via `data.areas` and `data.location.url` in the response.
- **`item[0]` is NOT the postingId** — it's an offset. Absolute id = `data.decode.minPostingId + item[0]`. Treating `item[0]` as the postingId is the #1 source of 404s on the constructed URL.
- **Posted timestamps are also offset-encoded**: absolute epoch (seconds) = `data.decode.minPostedDate + item[1]`. The rendered HTML page only shows relative ("< 1hr ago", "2 hours ago", "4/30"); the API is the only path to absolute time.
- **`data.decode.locations` indexing is per-response, not stable across requests.** The decode table is rebuilt per cache TTL; the same metro/sub-area may appear at a different `locIdx` between consecutive queries. **Always resolve `locations[locIdx]` from the response in hand** — never cache or hardcode the table.
- **`categoryId → cat3` is an undocumented enum** that the response does NOT supply. Observed mappings (composite across iterations and reference data): `1→apa`, `5→fua` (furniture), `20→bia` (bicycles for sale), `68→bik` (bicycles), `93→spo` (sporting goods), `96→msg` (musical instruments — observed 2026-05-28 in `sss?query=guitar` against newyork), `101→foa`, `107→bar`, `122→pts` (auto parts), `141→bfa` (business), `172→bik` (electric/specialty bikes), `197→bop` (bicycle parts/accessories). **Unknown categoryIds**: don't try to guess — use the redirect fallback `https://{city}.craigslist.org/search/{cat}?postingId={id}` which 302-redirects to the canonical URL with the correct `cat3`.
- **Title-extraction must scan from the END of the item array, not a fixed index.** For housing categories (`apa`, `roo`, `reb`), a trailing `[5, beds, sqft]` block pushes the title to `item[-2]`. Some items contain raw negative integers mid-array (observed `-12`, `-4`, `-2` — likely image-count or status flags); these are not titles. **Rule**: iterate from `length-1` downward, skip arrays and skip numbers, take the first plain string.
- **Snapshot is useless on `/search/` pages.** `browse snapshot --remote` returns >10k xpath leaves on the rendered search page, none of which are accessibility-tagged listing anchors. Don't waste turns iterating over `@ref` IDs — use `browse get html body` + regex, or (preferred) the JSON API.
- **`browse get html body` returns a JSON envelope `{"html": "..."}`** — you must `JSON.parse` and read `.html` before regex-matching. Forgetting this is a silent failure (regex returns 0 matches on the wrapper string).
- **Sub-area scoping is much cheaper than client-side filtering.** Example: `apa` region-wide returned 9,798 SF Bay rentals; `sfc/apa` returned 253 SF-proper rentals — same data shape, ~40× less to download.
- **Neighborhood labels are inconsistent across responses and categories.** `data.decode.locationDescriptions` is rebuilt per cache TTL; the same neighborhood ("Russian Hill") may appear under different indices in two consecutive `apa` calls, and may be entirely absent from the decode table for a different category (`cta`) even in the same metro. **For neighborhood-scoped searches, fall back to lat/lon bounding-box matching on the `lat~lon` in `item[4]`** rather than label-string equality.
- **Free / "contact for price" listings**: `item[3]` may be `0` (free) or absent / `-1` (no price set). The `[10, "$X"]` tagged block is also missing on those.
- **Rate-limiting is self-imposed but real.** No formal block was observed during validation, but bursts >5 req/s on the same `/search/full` endpoint can stall. Keep ≤1 req/s sustained; add 200–500 ms jitter on pagination loops.
- **Cache freshness**: API responses set `Cache-Control: public, max-age=900`; `data.cacheTs` reflects the snapshot epoch. If you need sub-15-minute freshness, expect identical results on repeated calls — the upstream cache is what's slow, not your code.
- **No residential proxy needed.** `browse cloud fetch --proxies` against the sapi endpoint costs more wall-time than a direct fetch and does NOT solve the geo-scoping problem (proxy egress IP is still rarely in the target metro). Use `postal=` instead.

## Expected Output

```json
{
  "city": "newyork",
  "category": "sss",
  "query": "guitar",
  "sort": "date",
  "postal_override": "10001",
  "search_distance_mi": 10,
  "total_results": 928,
  "resolved_area": { "areaId": 3, "name": "newyork", "url": "newyork.craigslist.org" },
  "listings": [
    {
      "posting_id": 7917100985,
      "title": "Guitar Transmitter Receiver Wireless",
      "price_usd": 30,
      "price_label": "$30",
      "location_label": "Long Island City",
      "subarea": "que",
      "category_id": 96,
      "cat3": "msg",
      "lat": 40.7436,
      "lon": -73.9584,
      "posted_at_epoch_seconds": 1780002029,
      "posted_at_iso": "2026-05-28T21:00:29Z",
      "slug": "long-island-city-guitar-transmitter",
      "url": "https://newyork.craigslist.org/que/msg/d/long-island-city-guitar-transmitter/7917100985.html",
      "housing": null
    },
    {
      "posting_id": 7937333457,
      "title": "Sun Kissed Studio in Midtown",
      "price_usd": 3620,
      "price_label": "$3,620",
      "location_label": "Manhattan",
      "subarea": "mnh",
      "category_id": 1,
      "cat3": "apa",
      "lat": 40.7098,
      "lon": -74.007,
      "posted_at_epoch_seconds": 1780000273,
      "posted_at_iso": "2026-05-28T20:31:13Z",
      "slug": "new-york-your-summer-era-sun-kissed",
      "url": "https://newyork.craigslist.org/mnh/apa/d/new-york-your-summer-era-sun-kissed/7937333457.html",
      "housing": { "bedrooms": 0, "sqft_ft2": null }
    }
  ],
  "pagination": {
    "next_offset": 360,
    "cache_id": "f4e3a8b9c1...",
    "cache_ts": 1780002837,
    "has_more": true
  }
}
```

Outcome shapes you may encounter:

- **`success`** — normal case, `total_results > 0`, `listings[].length > 0`.
- **`success_empty`** — query returned no matches: `total_results: 0, listings: []`. The response shape is unchanged; just an empty array.
- **`scope_mismatch`** — `data.areas` returned a different metro than requested (caller forgot `postal=`). Detectable by comparing `resolved_area.name` to the intended `city` subdomain; surface as a warning and retry with `postal=`.
- **`unknown_category_id`** — `item[2]` not in the local `cat3` enum. Use the `?postingId=` redirect fallback URL rather than guessing; surface `cat3: null` and a `url_via_redirect` field.
- **`browser_fallback`** — same `listings[]` schema, populated via the `cl-search-result` regex set against `browse get html body`. Fields that the rendered DOM omits (absolute epoch, lat/lon, area-id) become `null` or are derived from the relative-time string and the `data-pid` only.
