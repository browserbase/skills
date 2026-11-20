---
name: redfin-com-get-comparable-sales-lzph4d
title: Redfin Comparable Sales
description: >-
  Return recent comparable sales (sold comps) on Redfin for a subject property,
  with every filter dimension the Recently Sold UI exposes (recency, distance,
  price, beds, baths, sqft, lot, year built, property type, days-on-market,
  sort). Read-only.
website: redfin.com
category: real-estate
tags:
  - real-estate
  - comps
  - sold-listings
  - appraisal
  - read-only
  - stingray-api
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: api
alternative_methods:
  - method: api
    rationale: >-
      Redfin's /stingray/api/gis endpoint returns the full sold-comp record
      (propertyId, address, lat/lon,
      beds/baths/sqft/lot/year/photos/MLS#/agent/price/soldDate) as JSON. All
      filter dimensions Redfin's Recently Sold URL exposes map cleanly to
      query-string params. Cookieless via Browserbase Fetch + residential
      proxies. 10-50x faster than browsing the rendered map UI.
  - method: browser
    rationale: >-
      Required only when (a) the caller provides a raw street address and
      propertyId resolution is needed (autocomplete endpoint is 403 cookieless),
      or (b) the Fetch path hits sustained rate-limit walls across the proxy
      pool. Use Verified + residential-proxy Browserbase session and read the gis
      XHR via browser-trace.
  - method: hybrid
    rationale: >-
      List-price-vs-sale-price delta and Redfin Estimate are NOT in the gis JSON
      — they require fetching each property's detail page and parsing JSON-LD +
      rendered HTML. Use this path only when the caller asks for list-vs-sale
      filtering or the subject's Redfin Estimate.
verified: true
proxies: true
---
# Redfin Comparable Sales (Sold Comps)

## Purpose

Given a subject property (Redfin URL, MLS/property ID, full street address, or lat+lon), return recent comparable sales ("comps") in the surrounding area as structured JSON. Every dimension Redfin's "Recently Sold" filter exposes is mapped to the underlying query-string keys (recency, distance, price, beds, baths, sqft, lot, year built, property type, days-on-market, sort order, pagination). The skill also returns the subject's address, lat/lon, Redfin Estimate, and most-recent sale info so the caller can frame the comp set against the subject. **Read-only — never click Save, Tour, Contact Agent, Get Pre-Approved, Sign In, or any mutation control.**

## When to Use

- Pulling 3–25 recent local sales to support an AVM, broker price opinion, or appraisal review.
- Bulk extraction across many subjects (one comp set per address) for portfolio analysis or property-tax challenges.
- Surfacing "what did houses like this go for" for a buyer/seller chat agent.
- Anywhere you'd otherwise screenshot Redfin's Recently-Sold map UI — the JSON endpoint is 10–50× faster, cheaper, and exposes the full property record (beds/baths/sqft/lot/year/photos/MLS#/agent) per result.

## Workflow

Redfin's web UI is a thin client over a public-but-undocumented JSON endpoint at `https://www.redfin.com/stingray/api/gis?...`. No auth or cookies required, but **Browserbase residential proxies are mandatory** — Redfin's edge throttles non-residential IPs aggressively (intermittent 403/captcha on 2–3 sequential requests from the same datacenter IP). The Fetch path (`browse cloud fetch <url> --proxies`) is the optimal surface; the rendered web UI is only used as a fallback when the proxy pool is exhausted, when the subject must be resolved from a raw street address (autocomplete is cookie-walled), or when the Redfin Estimate / list-price-vs-sale delta must be surfaced (those are not in the gis JSON — they only live on the property detail page).

1. **Resolve the subject into `{propertyId, regionId, regionType, market, lat, lon, zip}`**.
   - **Redfin URL given** → propertyId is the trailing path segment after `/home/`. Fetch the URL with `browse cloud fetch --proxies --allow-redirects` and extract from the JSON-LD `<script type="application/ld+json">` blocks: `mainEntity.address`, `mainEntity.geo.{latitude,longitude}`, `mainEntity.numberOfBedrooms`, `mainEntity.numberOfBathroomsTotal`, `mainEntity.floorSize.value`. The breadcrumb block (`BreadcrumbList`) carries the city's region URL `/city/{regionId}/{ST}/{City}` — pull `{regionId}` from there. (Region type for city is 6.) The Redfin Estimate is in the rendered HTML as `<div class="price smallerFont">$X,XXX,XXX</div>` inside `id="redfin-estimate"`.
   - **Property ID given** → fetch `https://www.redfin.com/CA/-/home/{id}` (Redfin rewrites the slug; follow redirects), then the same JSON-LD extraction.
   - **Lat/lon given** → use a `poly=` rectangle of `±delta` around the point (see step 3). No region required. Pick `market=` from the lat/lon's metro (e.g. `sanfrancisco`, `losangeles`, `seattle`, `boston`, `newyork`, `chicago`, `dallasfortworth`, `dc`); `market` is a required argument on the gis endpoint and gates the sold-filter behavior.
   - **Street address given** → Redfin's `/stingray/do/location-autocomplete?location=...` returns 403 cookieless. **The Fetch path cannot resolve a raw street address to a propertyId.** Browser-fallback: use a `--remote` Browserbase session, navigate to `https://www.redfin.com/`, type the address into the search input, press Enter, capture the redirected URL — the URL contains the propertyId. Then go back to the Fetch path with `{propertyId}`. Many callers can avoid this by accepting a ZIP code instead (`region_type=2&region_id={zip}`) and lat/lon for distance-ranking.

2. **Pick the recency window**. Map the caller's `sale_recency` to `sold_within_days`:

   | Caller value | `sold_within_days` |
   |---|---|
   | `Last 1 month` | `30` |
   | `Last 3 months` | `90` |
   | `Last 6 months` | `180` |
   | `Last 1 year` | `365` |
   | `Last 2 years` | `730` |
   | `Last 3 years` | `1095` |
   | explicit `sold_after=YYYY-MM-DD` | compute days delta from today, round up to nearest preset (Redfin only honors discrete buckets) |

3. **Pick the search area**.
   - **Region-by-id** (preferred when the subject's city or ZIP is known): `region_type=2&region_id={ZIP}` for ZIP-scoped, or `region_type=6&region_id={cityId}` for city-scoped. Use ZIP for tight comp sets (typical appraisal radius); use city when the ZIP is sparse.
   - **Bounded radius / lat-lon recentered**: pass `poly={lon1}+{lat1},{lon2}+{lat2},{lon3}+{lat3},{lon4}+{lat4},{lon1}+{lat1}` (the rectangle must close — first vertex repeated; `+` between lon and lat, `%2C` between vertices). Compute the rectangle as `subjectLat ± (miles/69)` and `subjectLon ± (miles / (69·cos(lat)))`. **`poly` requires `market=<metro>`** to be supplied or it silently returns the entire metro's homes.
   - **Map bounds passed by caller**: drop straight into `poly=` in the same lon+lat order.

4. **Build the request** to `https://www.redfin.com/stingray/api/gis?...`. Required scaffolding params: `al=1&v=8&start=0&page_number=1&num_homes={limit}&include_nearby_homes=true&market={metro}&mpt=13&uipt={uipt-csv}&status=9`. Then layer each filter onto the query string:

   | Caller filter | Query param(s) | Notes |
   |---|---|---|
   | Sale recency | `sold_within_days={N}` | Required to switch the endpoint into sold-comps mode. Without it, the same URL returns ACTIVE listings — `status` alone is not enough. |
   | Distance / radius | `poly=...` rectangle (see step 3) **or** `region_type=2&region_id={ZIP}` for "same ZIP" | Redfin does not expose a pure-radius param; emulate via bounding box. |
   | Beds (min) | `num_beds={N}` | NOT `min_beds`. Aliases silently dropped. |
   | Beds (max) | `max_num_beds={N}` | |
   | Beds (exact) | `num_beds=N&max_num_beds=N` | |
   | Baths (min, half-bath OK) | `num_baths={N.0\|N.5}` | Half-bath increments work: `num_baths=2.5`. |
   | Baths (max) | `max_num_baths={N}` | |
   | Price (min) | `min_price={N}` | Raw dollars (no $/k/M suffix). |
   | Price (max) | `max_price={N}` | |
   | SqFt (min) | `min_sqft={N}` (plus `min_listing_approx_size={N}` — Redfin's filter page sends both) | |
   | SqFt (max) | `max_sqft={N}` (plus `max_listing_approx_size={N}`) | |
   | Lot size (min, sqft) | `min_parcel_size={sqft}` | 1 acre = 43560 sqft. |
   | Lot size (max, sqft) | `max_parcel_size={sqft}` | |
   | Year built (min) | `min_year_built={YYYY}` | |
   | Year built (max) | `max_year_built={YYYY}` | |
   | Property type | `uipt=` CSV of `1,2,3,4,5,7,8` | 1=Single-Family, 2=Condo, 3=Townhouse, 4=Multi-Family, 5=Land, 7=Mobile/Manufactured, 8=Co-op. Combine freely. |
   | Days-on-market max | `time_on_market_range={N}-` (note trailing dash = "N or fewer") | |
   | Stories (min/max) | `min_stories={N}&max_stories={N}` | Optional — also requires `sf=1,2,3,5,6,7` (search-feature mask). |
   | HOA max | **No URL param.** Filter client-side on `home.hoa.value` after fetch. | Redfin's filter UI redirects when `max-hoa-fee=…` is passed → confirmed unsupported on the sold-comps endpoint. |
   | Sold-above/below/at list | **No URL param.** Filter client-side: fetch each home's property-page JSON-LD to get list price, then compute delta. | Redfin's UI does not expose this as a query filter for the sold view. |
   | Has-photos toggle | **No URL param.** Filter client-side on `home.numPictures > 0`. | Redfin's URL filter `has-photos` redirects away → confirmed unsupported. |
   | Sort: most-recent sale | `ord=redfin-recommended-asc` (default; "Recently Sold" page implicitly sorts by sale recency in display order) | Redfin does NOT expose a `sort=newest`/`sold-date-desc` URL key. `ord=last-sale-date-desc` is parsed but does NOT actually reorder — the response is identical to recommended order. To get most-recent sales first, sort client-side on `home.soldDate` after fetch. |
   | Sort: price ↓ | `ord=price-desc&sf=1,2,3,5,6,7` | |
   | Sort: price ↑ | `ord=price-asc&sf=1,2,3,5,6,7` | |
   | Sort: $/sqft ↑/↓ | `ord=dollars-per-sq-ft-asc\|-desc&sf=1,2,3,5,6,7` | |
   | Sort: sqft ↑/↓ | `ord=square-footage-asc\|-desc&sf=1,2,3,5,6,7` | |
   | Sort: closest to subject | `ord=distance-asc` | Only meaningful when `poly=` is set; otherwise distance is from region centroid. |
   | Limit / page size | `num_homes={1..350}` | Hard cap 350 per page. |
   | Pagination | `page_number={N}&start={(N-1)*num_homes}` | Both required; otherwise Redfin returns page 1. |

5. **Fetch & decode**:
   ```bash
   browse cloud fetch "https://www.redfin.com/stingray/api/gis?<query>" --proxies
   ```
   The response body starts with the XSSI prefix `{}&&` — **strip the first 4 bytes** before parsing as JSON. Then read:
   - `payload.originalHomes.homes[]` — primary results (homes inside the requested region/poly).
   - `payload.nearbyHomes.homes[]` — expanded radius (populated when `include_nearby_homes=true` and the inner result set is sparse).
   - `payload.nearbyHomeDistance` — miles of the expanded ring (typically 1.0).
   - `payload.originalHomes.searchMedian` — region medians: `{price, sqFt, pricePerSqFt, beds, baths}`.
   - `payload.originalHomes.gisHomesQueryId` — handle for the request (helpful for caching/replay).
   - **Region-wide total count is NOT returned on this endpoint.** The "X homes sold matching your criteria" header on the web UI is computed client-side from the returned `homes.length` when `< num_homes` was requested. To get an exact total, request `num_homes=350` and check if a 2nd page returns more; iterate until empty. (`gis-aggregates` exists but its payload is empty for sold queries — confirmed.)

6. **Decode each home**. Every `homes[i]` follows the same shape:
   - **Identity**: `propertyId` (Redfin's stable ID), `listingId` (per-listing), `mlsId.value` (MLS#), `url` (relative path; prepend `https://www.redfin.com`).
   - **Location**: `streetLine.value`, `unitNumber.value`, `city`, `state`, `zip`, `postalCode.value`, `latLong.value.{latitude,longitude}`, `countryCode`.
   - **Sold price + date**: `price.value` (USD raw int — this is the SOLD price for sold-status homes), `pricePerSqFt.value`, `soldDate` (ms epoch — divide by 1000 for seconds, format as ISO). `mlsStatus` is `"Sold" | "Closed" | "Closed Sale"`; `searchStatus=4` means sold.
   - **Specs**: `beds`, `baths` (decimal — `2.5` = 2 full + 1 half), `fullBaths`, `sqFt.value`, `lotSize.value` (sqft), `yearBuilt.value`, `stories`, `propertyType` (raw MLS code — varies by source), `uiPropertyType` (Redfin's normalized bucket: 1=SFR, 2=Condo, 3=Townhouse, 4=Multi-Family, 5=Land, 6/7=Mfd, 8=Co-op).
   - **HOA**: `hoa.value` (monthly $; absent or `{level:1}` with no `value` ⇒ no HOA or undisclosed). `isHoaFrequencyKnown`.
   - **Photos**: `photos.value` is a compact spec like `"0-36:2"` meaning photos 0–36, format spec `:2`. `numPictures` is the count. `photoFormat` is `"webp"` or `"jpg"`. Construct the primary photo URL as: `https://ssl.cdn-redfin.com/photo/{dataSourceId}/mbphoto/{last3OfListingId}/genMid.{mlsId}_0.jpg` (variants: `bigphoto`, `mbpaddedwide`, `bcsphoto` — bigphoto is highest res). `additionalPhotosInfo[]` is usually empty in the list view — to get every photo URL, fetch the property page and parse `<img>` srcs.
   - **Brokerage**: `sellingBroker.name`, `sellingAgent.name`, `sellingAgent.redfinAgentId`, `sellingBroker.isRedfin`. (For sold-on-Redfin listings only; absent for off-MLS or stale records.)
   - **Days on market**: `dom.value` (when level≥2 — gated by access level). Empty `dom: {level: 1}` means Redfin hasn't surfaced it to the caller; fall back to the property page.
   - **Misc**: `timeOnRedfin`, `timeZone`, `listingTags[]` (highlight bullets), `listingRemarks` (MLS description), `sashes[]` (UI badges; `sashTypeName=="Bought"` confirms a sold-with-Redfin transaction with `lastSaleDate` populated).

7. **List-price-vs-sale delta (when caller requests it)** — NOT in the gis JSON. For each home you want this for, fetch `https://www.redfin.com/{home.url}` with `--proxies`, extract `offers.price` from the JSON-LD block — that's the closing/list price displayed on the detail page. The MLS public-record sometimes shows `originalListPrice` separately in the property's "Sale & Tax History" table (further down the HTML — parse a row labelled "Listed"); subtract from `price.value` for the delta. **Each property-page fetch costs roughly the same as one gis request** — only do this when truly needed (e.g. when the caller filtered on `sold_above_list`/`sold_below_list`/`sold_at_list`).

8. **Paginate** when `homes.length === num_homes` (likely more results). Bump `page_number` and recompute `start=(page-1)*num_homes`. Stop when a page returns fewer than `num_homes`.

9. **Subject framing**. Attach to the response: `{address, latLong, redfinEstimate, lastSale: {price, date}, url}` extracted from step 1. If the caller passed lat/lon and you used a `poly=` search (no propertyId), set `subject.address = null` and report `{lat, lon, radius_miles}` only.

10. **Read-only enforcement**. Do NOT call any `/stingray/do/*` POST endpoint (Save, Tour, Schedule, Submit Offer). All required data is GET-only. If the caller asks for "comps for [property] + book a tour", refuse the second clause.

### Browser fallback

Only when the Fetch path fails (sustained 403s across the proxy pool, or you must resolve a raw street address):

1. Create a Verified + residential-proxy session:
   ```bash
   sid=$(browse cloud sessions create --keep-alive --proxies --verified | python -c "import sys,json;print(json.load(sys.stdin)['id'])")
   export BROWSE_SESSION="$sid"
   ```
2. `browse open "https://www.redfin.com/" --remote` → type the address into the search input → press Enter → capture the redirected URL with `browse get url`. The URL contains the propertyId.
3. `browse open "https://www.redfin.com/city/{regionId}/{ST}/{City}/filter/property-type=house,min-beds=3,max-beds=4,min-baths=2,min-price=500k,max-price=2M,include=sold-3mo" --remote` and read the network panel via the `browser-trace` skill — the `gis` XHR is the same endpoint as the Fetch path. If you can extract the XHR URL, switch back to Fetch.
4. `browse cloud sessions update "$sid" --status REQUEST_RELEASE` when done.

## Site-Specific Gotchas

- **XSSI prefix is mandatory to strip**: every `/stingray/api/*` JSON response is prefixed with the literal bytes `{}&&` — strip the first 4 bytes before `JSON.parse`. Forgetting this is the #1 cause of "the API returned garbage."
- **`status=9` alone does NOT restrict to sold homes** — even though Redfin's recently-sold UI URL shows `status=9`, the operative param is `sold_within_days={N}`. Without it, the same URL returns ACTIVE listings. `status` becomes a no-op once `sold_within_days` is set; you can pass `status=1` or omit it and get the same sold results. Verified during iteration: status=1/2/4/8/16 with `sold_within_days=180` all returned identical sold-only result sets.
- **`market=<metro>` is required when using `poly=`**. Without it, `poly` is silently ignored and you get whole-metro homes. The `market` enum is the lowercase metro slug: `sanfrancisco`, `losangeles`, `seattle`, `chicago`, `newyork`, `boston`, `dc`, `dallasfortworth`, `houston`, `phoenix`, `atlanta`, `miami`, `portland`, `denver`, `philadelphia`, etc. You can read it from the property page JSON-LD or from the breadcrumb URL (city URL contains the metro). When you only have a `region_id`, omit `poly` entirely and the region-based scoping works without `market` strictness.
- **Param name aliases silently dropped**: Redfin's filter page sends `num_beds`/`max_num_beds`/`num_baths`/`max_num_baths`/`min_parcel_size`/`max_parcel_size`/`min_year_built`/`max_year_built`/`min_listing_approx_size`/`max_listing_approx_size`. The "natural" aliases (`min_beds`, `max_beds`, `min_lot_size`, `min_baths`, `min_sqft`) are accepted by the server with HTTP 200 but **silently ignored** — you get unfiltered results. Always use the canonical names enumerated in step 4.
- **`min_sqft` AND `min_listing_approx_size` are both sent** by the official UI for the same min-sqft filter. Either alone works; the UI passes both for redundancy. Same for `max_sqft`/`max_listing_approx_size`.
- **HOA, has-photos, % over/under list, pending toggle are NOT URL filters** on the sold endpoint. Redfin's filter page redirects these specs back to a bare URL. To honor these dimensions, filter the result set client-side after fetching.
- **Sort key `last-sale-date-desc` is parsed but a no-op**. The response is identical to `redfin-recommended-asc`. Same for `sold-date-desc` (rejected as "Invalid arguments") and `closest` (rejected). To deliver "Most recent sale" sort, sort the returned homes client-side on `soldDate desc`.
- **`num_homes` caps at 350 per page**. Higher values are accepted but the response still returns ≤350.
- **Pagination requires BOTH `page_number` and `start`**: `page_number=2&start=350` (for `num_homes=350`). Passing only `page_number` returns page 1.
- **`region_type` enum**: 1=State, 2=ZIP code, 5=County, 6=City, 12=School district. For comps you almost always want 2 (ZIP, tight) or 6 (city, broad). For a ZIP, `region_id` is the 5-digit ZIP itself (e.g. `region_type=2&region_id=94110`); for a city, look up the numeric Redfin city ID from the breadcrumb URL — there is no public city-id resolver beyond the breadcrumb.
- **`mpt` (map-page-type) matters**: `mpt=13` = sale-search-map (homepage map), `mpt=99` = filter-page-map (used by `/city/.../filter/...` pages). Either works for the gis endpoint, but `mpt` must be present (omitting it returns 0 homes in some configurations). Default to `mpt=13`.
- **`uipt` (UI Property Type) is the correct property-type filter — NOT `propertyType`**. `propertyType` is the raw MLS source code (varies wildly by MLS), `uiPropertyType` is Redfin's normalized 1–8 enum. The URL filter is `uipt=`.
- **Autocomplete is 403 cookieless**: `https://www.redfin.com/stingray/do/location-autocomplete?location=...` returns 403 from cookieless Fetch even with residential proxy. To resolve a raw street address to a propertyId, the only working path is a full browser session (see Browser fallback). Always prefer accepting `{propertyId, ZIP, or lat+lon}` from the caller and skipping address resolution.
- **`belowTheFold` is 403 cookieless**: `https://www.redfin.com/stingray/api/home/details/belowTheFold?...` returns 403. Subject-property enrichment beyond JSON-LD requires the rendered property page HTML (parse `id="redfin-estimate"` div for the Redfin Estimate, parse the "Sale & Tax History" table for prior list/sold prices).
- **`soldDate` is in milliseconds-since-epoch** (not seconds). Divide by 1000 before passing to `datetime.fromtimestamp`. The value is the closing date (deed-of-trust filing), not the offer-accepted date.
- **`mlsStatus` values for sold listings vary by MLS**: `"Sold" | "Closed" | "Closed Sale"`. Treat all three as "sold." Use `searchStatus === 4` for a clean integer check.
- **`baths` is decimal**, `fullBaths` is an int, but Redfin does not expose `halfBaths` directly — compute as `Math.round((baths - fullBaths) * 2)`.
- **`dom` (days on market) is access-gated**. For sold homes it's often surfaced only at level≥2 (Redfin sign-in). The cookieless Fetch path frequently returns `{level: 1}` (no value). When you need DOM, fetch the property page and parse the "Sale & Tax History" `Days on Market` field, OR compute `soldDate - listDate` from the same table.
- **Photo URL pattern by `dataSourceId`**: dataSourceId 8 (MLSListings/Bay Area) → `bigphoto` and `mbpaddedwide` directories with `ML{mlsId}_{N}.jpg`. dataSourceId 10 (BAREIS) → `mbphoto`/`bcsphoto` with `genMid.{mlsId}_{N}.jpg`. Don't hardcode the directory — extract from a sample URL on the property page and use the discovered pattern. `numPictures` tells you the upper bound on `_{N}`.
- **`listingRemarks` access-gated**: cookieless Fetch may return a truncated description with `remarksAccessLevel: 1`. Full remarks need the property page.
- **`include_nearby_homes=true` expands the result set** when the inner region/poly has few hits — `nearbyHomes.homes[]` is populated with comps from a wider 1-mile ring. Set `include_nearby_homes=false` if the caller wants a strict in-region cut.
- **Rate limit**: Redfin's edge throttles non-residential IPs. Even with residential proxies, keep sustained throughput ≤1 req/sec and rotate the proxy pool. Bursts of 5+ same-IP gis requests in <1s reliably trigger 403/captcha. The Browserbase Fetch API rotates IPs internally per request when `--proxies` is set — single-shot queries are reliable; sustained scraping is not.
- **`poly` rectangle format**: `lon1+lat1,lon2+lat2,lon3+lat3,lon4+lat4,lon1+lat1` with lon and lat space-separated within each vertex (URL-encoded space = `+`), and `%2C` between vertices. The polygon must close (first vertex repeated). Order is **longitude first, then latitude** — reversing them returns 0 homes silently. Without `market=` the param is silently dropped.
- **Region-wide total count is not on the endpoint**. `payload.numHomesOnServer`, `totalUnclusteredHomes`, and `originalHomesCount` are all null in the sold-comps response shape. To emit "X homes matching" you must paginate until exhaustion and sum, or accept "≥N" semantics.
- **`gis-aggregates` returns empty `payload: {}`** for sold-status queries — don't waste a request on it.
- **Sale-to-list delta and "% over/under list" are not URL-filterable**. If the caller filters on `sold_above_list`/`sold_below_list`/`sold_at_list`, fetch the raw set (no list/sale filter), then for each home pull its property page JSON-LD `offers.price` (list/last price) and compute `delta = soldPrice - listPrice`; partition client-side. Cost-of-each-extra-property-page is ~1 fetch per comp.
- **Redfin Estimate is not in any JSON endpoint cookieless** — it's only rendered into the property page HTML as `<div class="price smallerFont">$X,XXX,XXX</div>` inside `id="redfin-estimate"`. Regex out the dollar string.
- **MLS rules on photo display**: some MLS sources require sign-in to surface listing photos. Cookieless Fetch may return `photos.value` populated but the actual CDN URL returns 403 or a placeholder. Check the response when fetching the photo URL itself; fall back to the property-page `<img>` srcs if needed.

## Expected Output

The skill returns a single JSON object framing the subject and the comp set. Distinct outcome shapes:

```jsonc
// 1. Success — propertyId-driven, region-scoped, with comps
{
  "success": true,
  "subject": {
    "input_kind": "redfin_url",                       // "redfin_url" | "property_id" | "address" | "latlon"
    "property_id": 1668106,
    "url": "https://www.redfin.com/CA/Milpitas/1966-Yosemite-Dr-95035/home/1668106",
    "address": {
      "street": "1966 Yosemite Dr",
      "unit": null,
      "city": "Milpitas",
      "state": "CA",
      "zip": "95035",
      "country": "US"
    },
    "lat": 37.4302812,
    "lon": -121.8691767,
    "beds": 4,
    "baths": 2.5,
    "sqft": 2030,
    "year_built": null,
    "property_type": "Single-Family",
    "redfin_estimate_usd": 1919023,
    "last_sale": { "price_usd": 520000, "date": "2000-06-22" }
  },
  "filters_applied": {
    "sold_within_days": 90,
    "region_type": 6,
    "region_id": 12204,
    "market": "sanfrancisco",
    "uipt": [1],
    "min_price_usd": null,
    "max_price_usd": 2000000,
    "min_beds": 4,
    "max_beds": 4,
    "min_baths": null,
    "min_sqft": null,
    "max_sqft": null,
    "min_lot_sqft": null,
    "max_lot_sqft": null,
    "min_year_built": null,
    "max_year_built": null,
    "time_on_market_max_days": null,
    "sort": "redfin-recommended-asc",
    "limit": 20,
    "page_number": 1
  },
  "total_returned": 10,
  "page_size": 20,
  "more_pages_available": false,
  "region_median": {
    "sold_price_usd": 1357934,
    "sqft": 1568,
    "price_per_sqft_usd": 886,
    "beds": 3,
    "baths": 2.5
  },
  "nearby_ring_miles": 1.0,
  "comps": [
    {
      "property_id": 551401,
      "listing_id": 212753137,
      "mls_number": "ML82037320",
      "url": "https://www.redfin.com/CA/Milpitas/390-Valmy-St-95035/home/551401",
      "address": {
        "street": "390 Valmy St",
        "unit": null,
        "city": "Milpitas",
        "state": "CA",
        "zip": "95035",
        "country": "US"
      },
      "lat": 37.4550111,
      "lon": -121.9032729,
      "distance_miles": 1.69,
      "sold_price": { "formatted": "$1,500,000", "raw": 1500000, "currency": "USD" },
      "sold_date": "2026-03-24",
      "list_price_usd": null,                         // populated only if step 7 was run
      "list_to_sale_delta_usd": null,
      "list_to_sale_pct": null,
      "days_on_market": null,                          // null when access-gated; fetch property page to backfill
      "beds": 3,
      "baths": 2.0,
      "full_baths": 2,
      "half_baths": 0,
      "interior_sqft": 1100,
      "lot_sqft": 6396,
      "lot_acres": 0.147,
      "year_built": 1958,
      "stories": 1.0,
      "property_type": "Single-Family",
      "ui_property_type_id": 1,
      "hoa_monthly_usd": null,
      "price_per_sqft_usd": 1364,
      "primary_photo_url": "https://ssl.cdn-redfin.com/photo/8/bigphoto/137/ML82037320_0.jpg",
      "photo_count": 37,
      "additional_photo_urls": [],
      "selling_broker": "Redfin",
      "selling_agent": "Karan Kandel",
      "selling_broker_is_redfin": true,
      "mls_status": "Sold",
      "listing_tags": ["MODERN OPEN LAYOUT", "DESIGNER CABINETS", "WATERFALL ISLAND"]
    }
    // ...up to `limit` more comps
  ]
}

// 2. Success — lat/lon driven, poly-rectangle scoped, no propertyId
{
  "success": true,
  "subject": {
    "input_kind": "latlon",
    "property_id": null,
    "url": null,
    "address": null,
    "lat": 37.4302812,
    "lon": -121.8691767,
    "radius_miles": 0.5,
    "redfin_estimate_usd": null,
    "last_sale": null
  },
  "filters_applied": { /* same shape; region_id/region_type null, poly populated */ },
  "comps": [ /* ... */ ]
}

// 3. Empty result set — no homes matched
{ "success": true, "subject": { /*...*/ }, "filters_applied": {/*...*/}, "total_returned": 0, "comps": [] }

// 4. Address resolution failed (raw street address + cookieless Fetch path)
{ "success": false, "reason": "address_resolution_unavailable",
  "detail": "Redfin's autocomplete endpoint is cookie-walled (403 from Fetch). Pass a Redfin URL, propertyId, ZIP, or lat/lon, or fall back to a Verified browser session.", "input": "..." }

// 5. Anti-bot wall (sustained 403 across proxy pool)
{ "success": false, "reason": "rate_limited",
  "detail": "Redfin returned 403 across N retries with rotating residential proxies. Throttle to ≤1 req/sec, or switch to the browser-fallback path.", "retries": 3 }

// 6. Invalid input (region not found, malformed ID)
{ "success": false, "reason": "subject_not_found", "detail": "...", "input": "..." }
```
