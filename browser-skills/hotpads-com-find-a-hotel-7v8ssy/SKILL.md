---
name: hotpads-com-find-a-hotel-7v8ssy
title: HotPads Find a Rental
description: >-
  Search HotPads for rental listings (apartments, houses, condos, townhomes,
  rooms, sublets) in a city, neighborhood, ZIP, or lat/lon bounding box. Returns
  address, rent range, beds, baths, sqft, photos, amenities, and detail-page URL
  per listing. Read-only.
website: hotpads.com
category: real-estate
tags:
  - rentals
  - apartments
  - real-estate
  - listings
  - hotpads
  - zillow
source: 'browserbase: agent-runtime 2026-05-15'
updated: '2026-05-15'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      Use only when the internal JSON API at
      hotpads-api-gke-prod-1-west-20250228-public.hotpads.com is unreachable.
      The public HTML at hotpads.com/{resource}/apartments-for-rent is fronted
      by PerimeterX (appId PXxOR1K5b6) and requires --verified
      --proxies; popular-city HTML responses exceed browse cloud fetch's 1MB cap so a full
      Browserbase browser session is required to read
      window.__PRELOADED_STATE__.
verified: false
proxies: false
---
# HotPads Find a Rental

## Purpose

Search HotPads (Zillow Group's rental marketplace) for rentals in a city, neighborhood, or arbitrary lat/lon bounding box — returning each listing's title (building or address), street address, monthly rent (min/max), bedrooms (min/max), bathrooms, square footage, property type, lat/lon, photo URL, and canonical detail-page URL. Read-only; never sends inquiries, applications, or "Contact" form submissions.

The site name has "pads" — these are **rental apartments / houses / condos / townhomes / rooms / sublets**, not hotels. If a user asks for a "hotel" on HotPads, interpret it as "find a place to stay / rent" and return rentals.

## When to Use

- "Apartments under $3000 in San Francisco with 1+ bedroom."
- Bulk extraction of rentals in a city, neighborhood, ZIP code, or county.
- Map-bounded searches (e.g., "rentals within these lat/lon corners near the user's office").
- Anywhere you'd otherwise scrape the HotPads HTML grid — the internal JSON API is faster, cheaper, and avoids the PerimeterX captcha on the HTML surface entirely.

## Workflow

HotPads' web UI is a Next-style thin client over a public-looking JSON API hosted at `hotpads-api-gke-prod-1-west-20250228-public.hotpads.com` (the hostname is stable across pages and is exposed in `window.__PRELOADED_STATE__.location.ssrEntry.requests` on every search page). Two endpoints do the entire job — `area/byResourceId` to resolve a city slug into an areaId + bounding box, then `listing/byCoordsV2` to fetch the listings. **No auth, no cookies, no CSRF, no PerimeterX challenge — the API is reachable from a bare `browse cloud fetch` without `--proxies`.** Lead with the API; the HTML/browser path costs ~100× more (PerimeterX captcha-blocks bare requests, city pages are > 1MB so `browse cloud fetch` 502s on them, and you'd need a Verified + residential-proxy browser session).

1. **Resolve the area** — turn a user's city name into a canonical HotPads `resourceId`. The format is `<city-slug-hyphenated>-<state-code-lowercase>` (e.g. `san-francisco-ca`, `new-york-ny`, `brooklyn-new-york-ny`, `topeka-ks`, `austin-tx`). For neighborhood- or ZIP-scoped searches, the resourceId is the neighborhood / ZIP slug (e.g. `mission-san-francisco-ca`, `94110-ca`). Then call:

   ```
   GET https://hotpads-api-gke-prod-1-west-20250228-public.hotpads.com/hotpads-api/api/v2/area/byResourceId
       ?resourceId={resourceId}
   ```

   Returns `data.{id, name, type, city, state, county, minLat, maxLat, minLon, maxLon, uriV2}`. The `id` (e.g. `1112868274` for San Francisco) is the numeric areaId you pass to the listings endpoint. The four `min/max Lat/Lon` fields are the city's bounding box. `type` is one of `city`, `neighborhood`, `zip`, `borough`, `county`, `state`.

   Save discovered areaIds to a local cache — they are stable. Confirmed at 2026-05-15: SF `1112868274`, NYC `117776782`, Boston `1299308461`, Chicago `2067068844`, Austin `216213232`, Topeka `1292505385`, Brooklyn (borough) `391588231`.

2. **Search for listings**:

   ```
   GET https://hotpads-api-gke-prod-1-west-20250228-public.hotpads.com/hotpads-api/api/v2/listing/byCoordsV2
       ?areas={areaId}
       &minLat={}&maxLat={}&minLon={}&maxLon={}
       &searchSlug={apartments-for-rent|houses-for-rent|condos-for-rent|townhomes-for-rent|rooms-for-rent|...}
       &listingTypes=rental,room,sublet,corporate
       &propertyTypes=condo,divided,garden,house,large,medium,townhouse
       &bedrooms=1,2,3,4,5,6,7,8plus
       &bathrooms=0,0.5,1,1.5,2,2.5,3,3.5,4,4.5,5,5.5,6,6.5,7,7.5,8plus
       &orderBy=score
       &limit=200
       &components=basic,useritem,quality,model,photos
       &trimResponse=true
   ```

   Use the bbox from step 1 verbatim. Returns:

   ```jsonc
   { "data": {
       "numListingsAvailable": 982,    // total matching listings in the bbox
       "numBuildingsAvailable": 982,   // total matching buildings
       "numListingsIncluded": 212,     // listings actually returned (may exceed buildings.length when a building has multiple listings)
       "buildings": [
         {
           "lotIdEncoded": "sknnxb",
           "geo": { "lat": 39.13, "lon": -95.71, "quad": "..." },
           "uri": "/emory-lakes-luxury-apartments-topeka-ks-66618-sknnxb/building",
           "listings": [ { /* see step 3 */ } ],
           "neighborhoods": [...]
         }
       ]
   } }
   ```

3. **Decode each listing**. Within `data.buildings[i].listings[j]`, the relevant fields are:

   | Field | Meaning |
   |---|---|
   | `title` | Building name (e.g. "Emory Lakes Luxury Apartments") or `null` for individual houses (use `address.street` in that case) |
   | `address.{street, city, state, zip, hideStreet}` | Postal address. `hideStreet: true` means HotPads suppresses the exact street; surface only `city, state, zip`. |
   | `propertyType` | `large` (mid/high-rise apartment complex), `medium`, `garden`, `house`, `townhouse`, `condo`, `divided`, `land` |
   | `listingType` | `rental`, `room`, `sublet`, `corporate` |
   | `modelSummary.{minPrice, maxPrice, minBeds, maxBeds, minBaths, maxBaths, minSqft, maxSqft}` | Aggregate price/bed/bath/sqft across all units in the building |
   | `models[]` | Per-floorplan breakdown: `{numBeds, lowPrice, highPrice}` |
   | `uriMalone` | Canonical detail-page path. Construct full URL as `https://hotpads.com{uriMalone}` (e.g. `/emory-lakes-luxury-apartments-topeka-ks-66618-sknnxb/pad`) |
   | `medPhotoUrl` | Primary thumbnail at 500×500 |
   | `photoCount` | Total photos on the detail page |
   | `amenities.highlightedAmenities[]` | `{persisted, display, subtypes: [{persisted, display}]}` — top 5 amenities. Common `persisted` keys: `pets`, `laundry`, `hvac`, `gym`, `parking`, `outdoorAreas`, `dishwasher` |
   | `hasSpecialOffers` | true → building advertises a promo (free month, waived fees) |
   | `trusted` | true → verified by HotPads ops (paid multifamily listing) |
   | `incomeRestricted`, `seniorHousing`, `studentHousing`, `militaryHousing` | Subsidized-housing flags |

   The building's `uri` ends in `/building`; the listing's `uriMalone` ends in `/pad` (or `/pad-for-sublet`). Both render; prefer `uriMalone` for the unit detail and `uri` for the building overview.

4. **Apply user filters as query params**. Confirmed working: `maxPrice=<N>`, `minPrice=<N>`. Narrow `bedrooms=` to a subset (e.g. `bedrooms=1,2`) or use `bedrooms=studio,1,2,3,4,5,6,7,8plus`. Narrow `listingTypes=` (`rental` only for non-shared apartments; add `room` for shared housing; `sublet` for short-term). Narrow `propertyTypes=` (`house,townhouse` to exclude apartment buildings, `large,medium,garden` to focus on apartments). The full enum sets are the defaults shown above — drop categories to filter them out. **Unrecognized params are silently dropped, so always verify the returned `numListingsAvailable` reflects your intent.**

5. **Paginate via bbox subdivision (not via `start=` / `offset=`).** The API has a hard cap of ~200 buildings per response — `limit=1000` returns the same 200 as `limit=200`. The `start=` param is the HTML-only pagination knob and is blanket-`Disallow`-ed in robots.txt; the API ignores it. To enumerate beyond 200, **split the lat/lon bounding box in half** and re-query each half:

   ```js
   const midLat = (minLat + maxLat) / 2;
   const leftHalf  = { minLat, maxLat, minLon, maxLon: (minLon+maxLon)/2 };
   const rightHalf = { minLat, maxLat, minLon: (minLon+maxLon)/2, maxLon };
   // Recurse if a half still returns 200 buildings.
   ```

   In practice, for cities with < 200 results in the default bbox (Topeka 178, San Francisco at the default filter set above returns 982 so you'd need ~5 tiles), one or two splits is enough. Dedupe by `building.lotIdEncoded` after merging.

6. **Order** — `orderBy=score` (default, HotPads relevance ranking — favors paid + trusted listings), `weekViews`, `price` (asc), `priceHighToLow`, `recencyTime` (newest first). Note robots.txt forbids `*orderBy` on HTML URLs; the API accepts it freely.

### Browser fallback (only when the API path returns 5xx — historically rare)

If `hotpads-api-gke-prod-1-west-20250228-public.hotpads.com` is unreachable, fall back to the public HTML at `https://hotpads.com/{resourceId}/apartments-for-rent` (or `/houses-for-rent`, etc.). This path requires a **Verified + residential-proxy browser session** because hotpads.com is fronted by **PerimeterX** (Human Security; `appId: PXxOR1K5b6`, captcha URL `/xOR1K5b6/captcha/...`) — bare `browse cloud fetch` and bare browser sessions get a 403 `px-captcha` interstitial. `browse cloud fetch --proxies` bypasses the captcha for the HTML page but the rendered listing-grid HTML for any popular city exceeds 1 MB, which is the `browse cloud fetch` body cap → 502 ("response body exceeded the maximum allowed size of 1MB"). So the realistic fallback is a full Browserbase browser session:

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies | jq -r '.id')
browse cloud browse --connect "$SID" open "https://hotpads.com/{resourceId}/apartments-for-rent"
browse cloud browse --connect "$SID" wait load
# Listings are embedded as JSON inside <script>window.__PRELOADED_STATE__ = {...}</script>
browse cloud browse --connect "$SID" get html body > body.html
node -e 'const html=fs.readFileSync("body.html","utf8");
  const idx=html.indexOf("window.__PRELOADED_STATE__");
  // Walk braces from the first { after "=" to extract the JSON blob,
  // then read state.listings.listingGroups.byCoords[] — same shape as the API,
  // but limited to ~40 items per request (the SSR pre-render slice).'
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

The HTML page returns ~40 listings in `__PRELOADED_STATE__.listings.listingGroups.byCoords` (same field names as the API), plus a `seoFooterLinks` block that lists ~20 related sub-searches (price-bucketed, bedroom-bucketed, pet-friendly, etc.) you can use as discovery URIs.

## Site-Specific Gotchas

- **HotPads is a rental marketplace, not a hotel marketplace.** The skill name `find-a-hotel` is a misnomer at the slug level; the site only lists rentals (apartments, houses, condos, townhomes, rooms, sublets, corporate housing). If the calling agent really wants a hotel, route them to a hotel-specific site (Booking, Expedia, Google Hotels) — HotPads will return apartments even for hotel-shaped queries.
- **PerimeterX guards the HTML, not the API.** `https://hotpads.com/*` returns a 403 px-captcha interstitial (`appId=PXxOR1K5b6`, served from `/xOR1K5b6/captcha/captcha.js`) on `browse cloud fetch` without `--proxies`. The api host `hotpads-api-gke-prod-1-west-20250228-public.hotpads.com` is **not behind PX** and accepts bare requests. Verified 2026-05-15 with five distinct city resourceIds from a non-residential IP — all 200 with full JSON bodies and zero captcha challenge.
- **`browse cloud fetch` 1MB cap kills the HTML path for popular cities.** SF / NYC / Chicago rental list pages render at 1.2–1.5 MB after Next hydration — `browse cloud fetch` 502s with "response body exceeded the maximum allowed size of 1MB". Small / mid markets (Topeka 860 KB, Billings 920 KB) squeak under. The API path has no body-size limit.
- **resourceId is the URL-slug, not the human name.** `San Francisco, CA` → `san-francisco-ca`. `New York, NY` → `new-york-ny`. `Brooklyn, NY` → `brooklyn-new-york-ny` (not just `brooklyn-ny` — borough resourceIds include the parent city). `Mission District, San Francisco` → `mission-san-francisco-ca`. ZIP-scoped: `94110-ca`. If the slug fails with 4xx, fall back to: (a) the HTML autocomplete UI on hotpads.com via a browser session, or (b) brute-force candidates by stripping/adding parent-city segments. The `/api/v2/area/autocomplete` endpoint exists but its query param name was not determined during testing (it returns `INSUFFICIENT_DATA: Number of chars is below the minimum requirement=2` for every `q=/query=/term=/text=/s=` variant tried) — fall back to direct resourceId guessing or the SSR `seoFooterLinks` discovery block (which lists related-area URIs as `uriV2` fields).
- **`buildings[]` vs. `numListingsIncluded`.** The API returns at most 200 *buildings*, but a building can have multiple listings (different floorplans, sublease vs. lease, etc.). `numListingsIncluded` can exceed `buildings.length`. For "give me N listings", iterate `buildings[i].listings[j]` flat.
- **`numListingsAvailable === numBuildingsAvailable` in practice.** Despite the field-name difference, both report the building-level total. To get unit-level totals, sum `modelTypeUnitCount` or `numUnits` from the `data` object (Topeka returned `numUnits: 366` matching the "366 Rentals" header).
- **`hideStreet: true` listings.** HotPads suppresses the exact street address for some single-family rentals (privacy / anti-scraper). When `address.hideStreet` is true, emit only `city, state, zip` and the `uriMalone` URL — do not synthesize a street.
- **`title: null` is legitimate.** Single-family houses often have no building/complex name. Fall back to `address.street` (or `address.city + state` if `hideStreet`) for display.
- **Asterisks / `+` in displayed prices.** `listingMinMaxPriceBeds.priceDisplay = "$1,264+"` means "from $1,264, but exact varies"; `priceDisplayRange = "$1,264 - $1,651"` is the resolved range. Prefer numeric `modelSummary.minPrice` / `maxPrice` for downstream logic.
- **`start=` is not a real pagination param on the API.** Despite robots.txt's `Disallow: /*start=` (which suggests it exists on the HTML side), the API ignores `start` entirely — verified by passing `start=5` and getting the same first 5 buildings as `start=0`. Use bbox subdivision for > 200 results.
- **`limit` caps at 200.** Anything higher returns 200. `limit=40` is the SSR default; `limit=200` is the practical max.
- **`maxPrice` filters at the building level, not the unit level.** A `maxPrice=4000` query in SF returns buildings where AT LEAST ONE unit is ≤ $4000 — so the response's `modelSummary.maxPrice` can be $8,000+ for a building whose cheapest studio is $3,500. Re-filter on `modelSummary.minPrice <= maxPrice` client-side if you want strictly-affordable buildings, or read `models[].lowPrice` to identify the qualifying floorplans.
- **No JSON-LD listings index on city pages.** The city `SearchResultsPage` JSON-LD block is metadata-only (`contentLocation`, `about`, `breadcrumb`) — it does **not** carry `mainEntity: [...listings]`. Listings are only in `__PRELOADED_STATE__`. Don't waste a parse pass on `<script type="application/ld+json">` for the list view. Individual `/pad` detail pages do carry `@type: ApartmentComplex` with address + geo + amenities (no pricing).
- **`__PRELOADED_STATE__` is one massive JS literal, not JSON5.** It uses single-line-comment-free strict JSON but the closing `;</script>` requires a brace walker (count `{`/`}` while respecting string-quote state) — a regex `({[\s\S]*?});` will mismatch on nested braces. The blob is ~320 KB; extracting it on each page load is fine. Listing array path: `state.listings.listingGroups.byCoords` (the SSR-rendered 40). Other groups (`viewed`, `favorite`, `hidden`, `inquired`, `mostPopular`, `petFriendly`) are user-personalized and empty for a cookieless session.
- **PerimeterX `appId` is `PXxOR1K5b6` (note lowercase x, capital O).** Robots.txt lists `Disallow: /xOR1K5b6/` confirming this is the canonical PX endpoint. If a future PX appId rotation breaks the residential-proxy path, search the 403 body for `_pxAppId` to grab the new value.
- **Sort `weekViews` is a leaky signal of demand**, not price/recency. Use `orderBy=recencyTime` for "newest", `orderBy=price` for cheapest first.
- **READ-ONLY.** Never POST to `/hotpads-api/api/v2/user/item/create`, `/event/trigger`, `/inquiry/completed.htm`, or the `Contact` / "Apply now" / "Send message" buttons — those create tracked leads charged to the landlord.
- **Internal API hostname is dated.** The current host string `hotpads-api-gke-prod-1-west-20250228-public.hotpads.com` embeds a deploy date (`20250228`). If it 404s in the future, re-discover by fetching any small city's search page (e.g. `https://hotpads.com/topeka-ks/apartments-for-rent` via `browse cloud fetch --proxies`) and reading `__PRELOADED_STATE__.location.ssrEntry.requests[].url` — the current API hostname is the prefix of every entry.

## Expected Output

```json
{
  "success": true,
  "query": {
    "resource_id": "san-francisco-ca",
    "area_id": "1112868274",
    "area_name": "San Francisco",
    "area_type": "city",
    "bbox": { "min_lat": 37.7076, "max_lat": 37.8429, "min_lon": -122.5367, "max_lon": -122.3299 },
    "search_slug": "apartments-for-rent",
    "filters": { "max_price": 4000, "min_bedrooms": 1, "listing_types": ["rental"] }
  },
  "total_listings_available": 982,
  "total_buildings_available": 982,
  "listings_returned": 10,
  "listings": [
    {
      "title": "NEMA",
      "street": "8 10th St",
      "city": "San Francisco",
      "state": "CA",
      "zip": "94103",
      "hide_street": false,
      "lat": 37.7758,
      "lon": -122.4159,
      "property_type": "large",
      "listing_type": "rental",
      "rent_min": 3750,
      "rent_max": 7925,
      "rent_display": "$3,750 - $7,925",
      "beds_min": 0,
      "beds_max": 2,
      "baths_min": 1,
      "baths_max": 2,
      "sqft_min": 451,
      "sqft_max": 1240,
      "models": [
        { "beds": 0, "low_price": 3750, "high_price": 4200 },
        { "beds": 1, "low_price": 4100, "high_price": 5800 },
        { "beds": 2, "low_price": 5900, "high_price": 7925 }
      ],
      "url": "https://hotpads.com/nema-san-francisco-ca-94103-249xqhy/pad",
      "building_url": "https://hotpads.com/nema-san-francisco-ca-94103-249xqhy/building",
      "photo": "https://photos.zillowstatic.com/fp/.../rentals_medium_500_500.webp",
      "photo_count": 38,
      "amenities": ["pets:catsAndDogs", "laundry:inUnit", "gym:on-site", "parking:garage"],
      "has_special_offers": false,
      "trusted": true,
      "income_restricted": false,
      "lot_id_encoded": "sknnxb",
      "alias_encoded": "fu5dc59wj3ge"
    }
  ],
  "error_reasoning": null
}
```

Failure shapes:

```json
// resourceId not found
{ "success": false, "error_reasoning": "resourceId 'sn-fransicso-ca' returned 4xx from /area/byResourceId — try fuzzy match or check spelling", "query": {...}, "listings": [] }

// API reachable, zero matching listings
{ "success": true, "total_listings_available": 0, "total_buildings_available": 0, "listings_returned": 0, "listings": [], "query": {...} }

// API down → had to fall back to browser, PX captcha not solvable
{ "success": false, "error_reasoning": "API endpoint returned 5xx; browser fallback hit PerimeterX captcha (appId PXxOR1K5b6) — try a residential proxy session or retry later", "query": {...}, "listings": [] }
```
