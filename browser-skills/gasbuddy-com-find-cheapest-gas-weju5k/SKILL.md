---
name: gasbuddy-com-find-cheapest-gas-weju5k
title: GasBuddy Find Cheapest Gas
description: >-
  Given a US ZIP code (or City, ST text), return the cheapest gas stations
  nearby on GasBuddy — with station name, brand, address, fuel grade, current
  price per gallon, reporter, how recently it was reported, and an optional
  ZIP-centroid distance. Read-only.
website: gasbuddy.com
category: automotive
tags:
  - gas-prices
  - automotive
  - cloudflare
  - next-js
  - read-only
  - consumer
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: browser
alternative_methods:
  - method: hybrid
    rationale: >-
      Browser navigation to /home?search=<query>&fuel=N renders the full station
      list server-side, plus an asynchronous POST /graphql StationPrices XHR
      hydrates current prices for canonical city slugs. The GraphQL POST is
      structurally cleaner JSON but requires a gbcsrf cookie (bootstrapped from
      a prior GET) and prior knowledge of the city slug, so it accelerates
      repeat queries against the same city rather than replacing the browser
      path.
  - method: url-param
    rationale: >-
      The URL /home?search=<URL-encoded ZIP or City%2C+ST>&fuel=<1|2|3|4> is the
      single canonical entry — no form submission needed. ZIP-search has a tight
      proximity radius (0-2 results for dense urban ZIPs); City-search returns
      up to 20.
verified: false
proxies: true
---
# GasBuddy Find Cheapest Gas

## Purpose

Given a US ZIP code (or "City, ST" text), return the cheapest gas stations near that location from GasBuddy — including each station's name, brand, full street address, fuel grade searched, current price per gallon (cash or credit), the reporter who submitted that price, how recently it was reported, and an optional straight-line distance from the ZIP centroid. Read-only — never reports a price, never logs in, never books anything.

## When to Use

- A consumer-shopping agent needs to surface the 1-20 cheapest stations near a given ZIP for a specific fuel grade (Regular / Midgrade / Premium / Diesel).
- A trip-planning agent needs station-level prices ranked by cost (not by proximity).
- A market-research workflow scanning prices across multiple cities daily — `/home?search=<query>` is the single canonical entry point.
- Use `restaurants/opentable-check-availability` style branching — multiple distinct outcome shapes are returned (success-N, success-one, no-stations-for-zip, ambiguous-text-search). See **Expected Output** below.

## Workflow

GasBuddy's `/home?search=<query>&fuel=<N>` page server-renders a ranked list of cheapest stations as `GenericStationListItem` cards. The list size is **search-term-shape dependent** (this is the most important gotcha — see Site-Specific Gotchas):

- A **ZIP code** → tight proximity search → typically **0-2** stations (just the very cheapest in walking distance from the ZIP centroid). Often **zero** results for dense urban Manhattan / downtown Chicago ZIPs, where the nearest station is outside the radius.
- A **"City, ST"** text → city-wide search → up to **20** stations server-rendered in one page.
- A **canonical city slug page** (`/gasprices/<state-slug>/<city-slug>`) → up to **10** stations + an asynchronous `StationPrices` GraphQL hydration for current prices.

The recommended flow is browser-driven because the page is a fully client-rendered Next.js SPA behind Cloudflare; cookieless HTTP fetches return the HTML shell but skip the post-hydration price refresh. Lead with a Browserbase remote session with **residential proxies** (`--proxies`); advanced stealth (`--verified`) is **not** required during validation.

### 1. Open a Browserbase session with proxies

```bash
SID=$(browse cloud sessions create --keep-alive --proxies | jq -r .id)
export BROWSE_SESSION="$SID"
```

`--verified` was tested and is unnecessary — bare `--proxies` returned 200s on every request across multiple ZIPs. Skipping `--verified` halves session cost.

### 2. Search by ZIP first

```bash
FUEL=1                                # 1=Regular, 2=Midgrade, 3=Premium, 4=Diesel
URL="https://www.gasbuddy.com/home?search=${ZIP}&fuel=${FUEL}"
browse open "$URL" --remote --session "$SID"
browse wait load --session "$SID"
browse wait timeout 4000 --session "$SID"     # post-hydration price refresh
```

Then `browse get html body --session "$SID"` to retrieve the fully rendered HTML.

### 3. Parse `GenericStationListItem` cards

Split the HTML on the regex `class="[^"]*GenericStationListItem-module__station[^"]*"\s+id="(\d+)"` — each match anchors one station card. Within each card chunk:

| Field | Selector (regex) | Notes |
|---|---|---|
| `station_id` | `id="(\d+)"` on the card div | Internal GasBuddy ID; used in `/station/{id}` URL |
| `brand` | `<img alt="([^"]+)" class="image__image[^"]*"` (first match in chunk) | "Shell", "76", "Costco", "DataFeed"-stations show generic-pump icon with no alt |
| `name` | inside `StationDisplay-module__stationNameHeader`, `<a href="/station/\d+"[^>]*>([^<]+)</a>` | Usually equals brand; sometimes a specific franchise name |
| `address` | `<div class="StationDisplay-module__address[^"]*">(.*?)</div>` with `<br>` separator | Line 1 = street, Line 2 = "City, ST" |
| `rating_count` | `class="[^"]*numberOfReviews[^"]*">(\d+)<` | Optional review count |
| `price` | `<span class="[^"]*StationDisplayPrice-module__price[^"]*">([^<]+)</span>` | Format `$X.XX` or `- - -` when stale |
| `reporter` | `class="[^"]*ReportedBy-module__memberLink[^"]*"\s+href="(/member/[^"]+)"[^>]*>(?:<img[^>]*>)?(?:&nbsp;)?([^<]+)<` | Captures both `/member/<username>` URL and display name. Special reporter `DataFeed` (`/member/datafeed`) = automated price feed, not a real user |
| `reported_age` | `<span class="[^"]*ReportedBy-module__postedTime[^"]*">([^<]+)</span>` | Free-text relative time: `"4 Minutes Ago"`, `"6 Hours Ago"`, `"2 Days Ago"`. Convert to absolute by subtracting from `Date.now()` |
| `payment_badge` | `<div class="[^"]*StationDisplayPrice-module__[^"]*">.*?(CASH\|CREDIT)` near price | Cash-discount marker. Absent when not applicable |
| `fuel_grade` | `fuel` URL param echoed back (1→regular, 2→midgrade, 3→premium, 4→diesel) | Not on the card; carry from the request |

### 4. Branch on result count

After parsing:

- **2+ stations** → emit `outcome: "stations_for_zip"` with the parsed list.
- **1 station** → emit `outcome: "single_cheapest_for_zip"` (this is the dominant ZIP-search shape — `/home?search=ZIP` is a tight-radius query and most ZIPs surface exactly the local cheapest).
- **0 stations + visible "No stations found. Try refining your search."** → fall through to step 5. **Do not** emit success-with-zero — the search was too narrow, not actually empty.

The page also renders a `<state> Gas Price Stats` panel with `$X.XX Lowest` and `$Y.YY Average` regardless of station list — extract these as `state_lowest_usd` and `state_average_usd` in every response (they're always present and confirm which US state the ZIP geocoded to).

### 5. Fall back: widen to "City, ST" search

When ZIP-based search returns 0 stations:

1. Read the state name from the stats panel header — regex `>(\w[\w ]+?) Gas Price Stats<` → e.g. `"New York"`, `"Illinois"`.
2. Resolve ZIP → city. GasBuddy itself does not provide a public ZIP→city lookup on this surface; use either: (a) a local `pyzipcode`/`uszipcode` library, (b) an external geocoding service, or (c) a precomputed table of major-metro ZIPs. The skill caller is expected to provide this — see the `city_hint` input field in the example output schema.
3. Re-issue `/home?search=<URL-encoded "City, ST">&fuel=N` and re-parse. This returns up to **20** stations.

Alternatively — if all that's available is the state — navigate to the canonical state directory `https://www.gasbuddy.com/gasprices/<state-slug>` (slug = state name lowercased, spaces → hyphens: `"new-hampshire"`, `"washington-dc"`) and pick a metro from there. The dollar-amount Stats panel on `/home?search=ZIP` also gives a state-wide lowest/average usable as a coarse fallback signal.

### 6. (Optional) Compute distance from ZIP centroid

The web UI **does not display distance**. To populate the `distance_mi` field:

1. After the first navigation, click **VIEW MAP** (or evaluate the link `href`) — it navigates to `/gaspricemap?fuel=1&z=13&lat=<LAT>&lng=<LNG>` where `LAT/LNG` is the geocoded ZIP centroid. Capture those two query params *before* navigating to the map (it's enough to read the link's `href`).
2. Each station's `latitude` / `longitude` is in `window.__APOLLO_STATE__` under `Station:<id>` entries — read via `browse eval "return window.__APOLLO_STATE__"` and locate by station ID.
3. Compute haversine distance in miles between ZIP and station coordinates.

Distance is **post-processed** — GasBuddy does not return it in the rendered HTML.

### 7. Release the session

```bash
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

### Hybrid alternative: direct GraphQL (advanced, fragile)

The page issues `POST https://www.gasbuddy.com/graphql` with `operationName: "StationPrices"` and variables `{ area, countryCode, criteria: { location_type: ["locality","metro"] }, fuel, regionCode }` to hydrate prices for a city slug. Headers required: `content-type: application/json`, `apollo-require-preflight: true`, `gbcsrf: <token>` (from a `gbcsrf` cookie set on first page load). The response carries `cash` / `credit` `{ nickname, postedTime (ISO 8601), price, formattedPrice }` per station — structurally cleaner than HTML parsing.

**Do not lead with this** — it requires (a) bootstrapping a cookie jar from a real GET to set `gbcsrf`, (b) prior knowledge of the canonical city slug and state code (no ZIP-based variant of this operation has been observed), and (c) the operation set rotates with frontend deploys. The browser path tolerates all of that automatically. The GraphQL POST is documented here as a `hybrid` accelerator for repeated queries against the same city slug where reducing per-request latency is worth the cookie-management complexity.

## Site-Specific Gotchas

- **ZIP-based search is a tight-radius proximity query, not a city search.** `/home?search=10001&fuel=1` (Manhattan) returns the literal "No stations found. Try refining your search." text — **0 stations** — because the nearest reported station is outside the radius GasBuddy uses for ZIP queries. The page still renders a "<State> Gas Price Stats" panel, which tricks naïve parsers into thinking the search worked. Verified on `10001` (Manhattan) and `60601` (downtown Chicago) — both returned 0 stations despite having dozens of stations within 2 miles. The same query with `?search=Chicago%2C+IL` returned 20 stations.
- **Same surface, two different result-size ceilings.** `/home?search=` is the only URL pattern that returns up to **20** stations server-rendered in one HTML response; the canonical city page `/gasprices/<state>/<city>` is capped at **10**. If you want a long list, use `/home?search=City%2C+ST`, not the city page.
- **No native distance field.** GasBuddy's web UI never displays distance from the search point. Distance must be computed client-side from station `latitude`/`longitude` (available in `window.__APOLLO_STATE__` under `Station:<id>`) and the ZIP centroid (parsable from the `VIEW MAP` link's `lat=` / `lng=` URL params). Honesty rule: if you can't get both coordinates, emit `distance_mi: null` rather than guessing.
- **`DataFeed` reporter is an automated price feed, not a person.** Stations with `reporter: "DataFeed"` (linking to `/member/datafeed`) are price-fed from POS systems or third-party data partners, not crowd-reported by a user. Surface this in the output as `reporter_type: "automated"` so downstream callers can distinguish freshness sources — `DataFeed` prices tend to be more recent than crowd reports.
- **Stale prices render as `- - -`, not `$0.00` or null.** Stations with no recent report show `<span>- - -</span>` in the price slot and have no `ReportedBy` block. Treat as `price: null, reported_age: null` rather than dropping the row — the address + brand are still useful metadata.
- **`fuel` is a 1-indexed enum, not a fuel-product string.** URL param `fuel=1` Regular, `fuel=2` Midgrade, `fuel=3` Premium, `fuel=4` Diesel. The GraphQL `prices(fuel: N)` argument uses the same integer mapping. Omit `fuel` from the URL and GasBuddy defaults to Regular (`fuel=1`); other absent values are not silently substituted.
- **`?maxAge=0` is "no max age" (i.e. show all reports including ancient ones), NOT "must be 0 minutes old".** This is the inverse of what the URL implies. Set `maxAge` to a positive integer (minutes) only if you want to filter out stale reports. Default is unset (no filter).
- **The form's `FIND GAS` button is decorative when the URL already has `?search=`.** A `browse click` on the FIND GAS button just re-canonicalizes the URL params (alphabetizes them) and re-runs the same search — no new state. Don't waste a turn clicking it; the URL param is the single source of truth.
- **`/gas-prices/<ST>/<ZIP>` (with hyphen) issues a 308 redirect to the lowercase variant `/gas-prices/<st>/<zip>`, which then 404s.** This URL pattern is not a working ZIP-page surface. Don't waste time on it. The working ZIP entry is `/home?search=<ZIP>`.
- **Canonical city slug pattern is `/gasprices/<state-slug>/<city-slug>` (no hyphen in `gasprices`).** Cousin pattern `/gas-prices/<state>/<city>` (with hyphen) 404s. Slug rules: lowercase, spaces → hyphens, no diacritics. `washington-dc`, `new-hampshire`, `puerto-rico`, `beverly-hills`.
- **The `/gaspricemap` page is a heatmap, not a station list.** Clicking `VIEW MAP` from a search result navigates to `/gaspricemap?fuel=N&z=13&lat=X&lng=Y` which renders an interactive Mapbox-style heatmap with no per-station list in the DOM. Useful only to extract the ZIP centroid `(lat, lng)` from the URL — not for harvesting stations.
- **Cloudflare protects the site, but residential proxies alone are sufficient.** `browse cloud sessions create --keep-alive --proxies` was tested across 4 distinct ZIPs (90210, 10001, 60601, 75201) and got `200 OK` on every page load. `--verified` was **not** required. If a future run gets blocked, add `--verified` as the first escalation.
- **Apollo state (`window.__APOLLO_STATE__`) is server-rendered with addresses + lat/lon but NOT prices.** Don't expect to grab prices straight from the Apollo blob — they arrive in a later `StationPrices` GraphQL POST. The rendered HTML after `wait timeout 4000` is the only reliable source of fresh price + reporter + age data.
- **GraphQL POST requires `gbcsrf` header from cookie.** A bare `curl` to `https://www.gasbuddy.com/graphql` returns `400 Bad request` with no payload. The `gbcsrf` token is set as a same-site cookie by the first GET to any `gasbuddy.com` page. Browser path picks this up for free; direct API path requires bootstrapping a cookie jar first.
- **Cookie banner overlays the bottom 60-90px of every page.** Doesn't block extraction (the underlying DOM is rendered) but truncates screenshots. Clicking "Reject All" before screenshotting is optional; the data extraction works regardless.

## Expected Output

Four distinct outcome shapes — emit exactly one per call.

```json
// Outcome 1: ZIP search returned 2+ stations
{
  "outcome": "stations_for_zip",
  "zip": "75201",
  "fuel_grade": "regular",
  "state": "Texas",
  "state_lowest_usd": 2.74,
  "state_average_usd": 3.05,
  "zip_centroid": { "lat": 32.7872, "lng": -96.79925 },
  "stations": [
    {
      "station_id": "44331",
      "name": "Texaco",
      "brand": "Texaco",
      "address_line1": "2607 San Jacinto St",
      "address_city_state": "Dallas, TX",
      "latitude": 32.7842,
      "longitude": -96.7975,
      "fuel_grade": "regular",
      "price_usd": 4.19,
      "price_display": "$4.19",
      "payment_badge": null,
      "reporter": "DataFeed",
      "reporter_url": "https://www.gasbuddy.com/member/datafeed",
      "reporter_type": "automated",
      "reported_age": "6 Hours Ago",
      "distance_mi": 0.18,
      "station_url": "https://www.gasbuddy.com/station/44331"
    }
  ]
}

// Outcome 2: ZIP search returned exactly 1 station (most common for residential/non-dense ZIPs)
{
  "outcome": "single_cheapest_for_zip",
  "zip": "90210",
  "fuel_grade": "regular",
  "state": "California",
  "state_lowest_usd": 4.49,
  "state_average_usd": 6.14,
  "zip_centroid": { "lat": 34.10106, "lng": -118.41473 },
  "stations": [ { /* same shape as above, exactly one entry */ } ]
}

// Outcome 3: ZIP search returned 0 stations (dense urban / radius-exceeded)
{
  "outcome": "no_stations_for_zip",
  "zip": "10001",
  "fuel_grade": "regular",
  "state": "New York",
  "state_lowest_usd": 3.99,
  "state_average_usd": 4.58,
  "zip_centroid": { "lat": 40.7506, "lng": -73.99723 },
  "stations": [],
  "fallback_suggestion": "retry with `search=<City>%2C+<ST>` where City/ST is derived from a ZIP→city lookup (skill input field `city_hint`); /home?search=New+York%2C+NY returned 20 stations on validation."
}

// Outcome 4: caller passed a "City, ST" string (or ZIP fallback widened to city) — returns up to 20
{
  "outcome": "stations_for_city",
  "query": "Chicago, IL",
  "fuel_grade": "regular",
  "state": "Illinois",
  "state_lowest_usd": 4.20,
  "state_average_usd": 5.05,
  "stations": [ /* up to 20 station entries; ordered cheapest-first */ ]
}
```

Field rules:

- `fuel_grade` values: `"regular"`, `"midgrade"`, `"premium"`, `"diesel"` — derived from the `fuel` URL param (1→4).
- `price_usd` is the numeric value; `price_display` preserves the rendered string (`"$4.19"` or `"- - -"`).
- `reporter_type` is `"automated"` when `reporter == "DataFeed"`, else `"crowd"`.
- `reported_age` preserves the human string verbatim. Callers who want absolute timestamps should subtract from `Date.now()` at parse time.
- `distance_mi` is `null` unless step 6 of the workflow was executed (lat/lon-based haversine from ZIP centroid).
- `latitude` / `longitude` per station are only populated if `window.__APOLLO_STATE__` was harvested (`browse eval`); they are `null` if only the HTML was scraped.
