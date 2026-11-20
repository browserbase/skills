---
name: happycow-net-search-vegan-ei6wpc
title: HappyCow Vegan Search
description: >-
  Search HappyCow for vegan, vegetarian, and veg-friendly venues (restaurants,
  health/veg stores, juice bars, bakeries) in any location, honoring HappyCow's
  full filter surface (diet/venue type, cuisine, features, rating sort,
  distance, open-now time slider). Returns structured JSON with venue ID, name,
  slug, diet, coords, address, phone, rating, hours, photos, and region totals.
website: happycow.net
category: restaurants
tags:
  - restaurants
  - vegan
  - vegetarian
  - happycow
  - search
  - imperva
  - read-only
source: 'browserbase: agent-runtime 2026-05-16'
updated: '2026-05-16'
recommended_method: url-param
alternative_methods:
  - method: url-param
    rationale: >-
      Lead with the server-rendered /searchmap/print?... endpoint — it honors
      every filter the UI exposes (filters=, ft=, f=, term=, order=, radius=,
      metric=, page=, lat/lng or bb=) and returns a static HTML list of all
      matching venues (~180/page), behind Imperva's bot wall but reliably 200
      with a Browserbase residential proxy.
  - method: hybrid
    rationale: >-
      Enrich each row with optional per-venue detail fetches to
      /reviews/{slug}-{venue_id} (schema.org Restaurant microdata + data-* attrs
      for lat/lng, photos, tags, hours) when the caller needs IDs/coords/photos
      beyond what print yields. Discover slug+ID via city-slug landing pages
      (/europe/.../<city>/, /north-america/usa/.../<city>/) which expose anchors
      with the canonical IDs.
  - method: browser
    rationale: >-
      Fallback only when /searchmap/print is unreachable. Drive a Verified+proxy
      Browserbase session against /searchmap?... and read the rendered list (or
      capture the /ajax/views/searchmap/venues XHR response via browser-trace).
      Slower and more expensive; same data is available cheaper via the print
      path.
  - method: api
    rationale: >-
      Confirmed blocked: the /ajax/views/searchmap/venues XHR requires a
      session-cookie + CSRF context established by a hydrated browser.
      Cookieless POSTs from browse cloud fetch — even with X-Requested-With, Accept:
      application/json, correct Referer, and a real UA — return the HappyCow 404
      page. api.happycow.net is a Symfony API Platform for the
      shop/users/partner-pricing surface, not venue search. Don't spend turns on
      these.
verified: true
proxies: true
---
# HappyCow Vegan Search

## Purpose

Search HappyCow for vegan, vegetarian, and veg-friendly restaurants — plus health-food stores, vegan stores, and other veg-friendly venues (bakeries, juice bars, ice cream, coffee) — in any location, honoring the full filter surface (diet/venue type, cuisine, features, price, rating, distance, sort) and return matches as structured JSON. Read-only — never clicks `Add a Place`, `Write a Review`, `Sign In`, `Bookmark`, or any mutation control.

## When to Use

- "List vegan and vegetarian restaurants within 10 km of Berlin, sorted by rating."
- "Find Italian-cuisine vegan spots with outdoor seating in Brooklyn."
- "Map all health-food stores within 5 miles of Austin, TX."
- Any read-only HappyCow listing extraction — pulling the full venue catalog for a metro, neighborhood, or lat/lng radius.

## Workflow

HappyCow's `/searchmap?...` UI hydrates the venue list via an internal XHR (`GET /ajax/views/searchmap/venues?...`). That XHR is **confirmed-blocked from cookieless fetch** (returns the HappyCow 404 page; requires PHPSESSID + `X-Requested-With: XMLHttpRequest` from a hydrated browser session — see Site-Specific Gotchas). The good news: HappyCow ships a **server-rendered printable view at `/searchmap/print?...` that honors every filter the UI exposes** and returns a static HTML list of all matching venues (paginated ~180/page). Lead with that; fall back to scripted browsing only when the print path is unreachable.

Anti-bot: HappyCow is behind Imperva (Incapsula). A bare `browse cloud fetch` is 403'd at the bot-check; `browse cloud fetch --proxies` (Browserbase residential proxy) returns 200. For browser sessions, use both `--verified` and `--proxies`.

### Step 1 — Build the query

Set up a Browserbase session config (proxies mandatory, Verified recommended) for any browser fallback. For pure fetch, no session is needed — just `browse cloud fetch --proxies`.

```bash
# Browser fallback session (only if print path fails)
SID=$(browse cloud sessions create --keep-alive --verified --proxies | jq -r '.id')
```

Map the user's location + filters → URL params. The full param schema (extracted from `/js/modules/happycow.common.search.map.js` + the search form):

| Param | Meaning | Example |
|---|---|---|
| `location` | Free-form location string (server geocodes) | `Berlin%2C+Germany`, `Shibuya%2C+Tokyo`, `78704` |
| `lat`, `lng` | Direct lat/lng (override `location` geocode) | `lat=52.52&lng=13.405` |
| `bb` | Bounding box `swLat,swLng,neLat,neLng` (overrides `lat`/`lng`/`radius` when set) | `bb=52.4,13.2,52.6,13.6` |
| `zoom` | Map zoom (clamped to 12 if > 19) | `zoom=11` |
| `radius` | Distance from center | `radius=10` |
| `metric` | Distance unit | `metric=km` or `metric=mi` |
| `limit` | Results-per-page hint (UI offers 18/27/81; print page returns ~180 regardless) | `limit=81` |
| `page` | 1-based page for pagination | `page=2` |
| `order` | Sort order | `default`, `mostrecommended`, `distance`, `rating`, `mostreviews`, `vegtype`, `open` |
| `filters` | Dash-joined diet/venue-type filter IDs | `filters=vegan-vegetarian` |
| `ft` | Comma-joined cuisine/food-type IDs | `ft=10,15` |
| `f` | Comma-joined feature IDs | `f=1,6` |
| `term` | Comma-joined free-text keywords | `term=ramen,gluten-free` |
| `s` | View-state byte (used by the page; print accepts but does not require) | `s=2` |
| `openAt` / `openAtDay` | Open-now time-slider state | `openAt=1200&openAtDay=Fri` |

**Diet / venue-type filter IDs** (`filters=` is dash-joined; each token corresponds to a button `name=` in the form):

Restaurants: `vegan`, `vegetarian`, `vegfriendly`, `veganprofessional` (chains), `delivery`, `catering`, `foodtruck`, `chains`.
Stores & more: `bakery`, `coffee`, `juicebar`, `icecream`, `health` (health store), `vegshop`, `veganStores` (vegan-only stores), `farmers`, `marketvendor`, `bnb`, `spa`, `organization`, `other`.

**Cuisine / food-type IDs** (`ft=` is comma-joined; values verified against the in-page filter buttons):

| ID | Cuisine | ID | Cuisine | ID | Cuisine |
|---|---|---|---|---|---|
| 5 | American | 18 | Mediterranean | 32 | Catering |
| 6 | Pizza | 19 | Fast food | 34 | European |
| 7 | Chinese | 20 | Salad bar | 35 | French |
| 8 | Indian | 21 | Juice bar | 36 | Fusion |
| 9 | International | 22 | Beer/Wine | 37 | German |
| 10 | Italian | 23 | Delivery | 39 | Middle Eastern |
| 11 | Japanese | 24 | Take out | 40 | Spanish |
| 12 | Macrobiotic | 25 | Mexican | 41 | Taiwanese |
| 13 | Organic | 28 | Asian | 42 | Vietnamese |
| 14 | Raw Food | 29 | Bakery | 43 | Gluten-free |
| 15 | Thai | 30 | British | 45 | Latin |
| 16 | Western | 31 | Caribbean | 46 | Brazilian |
| 17 | Buffet | 47 | Australian | 48 | Breakfast |
| 49 | African | 50 | Korean | | |

**Feature / amenity IDs** (`f=` is comma-joined):

| ID | Feature |
|---|---|
| 1 | Outdoor seating |
| 2 | Reservations required |
| 3 | Wheelchair accessible |
| 4 | Accepts credit cards |
| 5 | Cash only |
| 6 | Free Wi-Fi |

**Rating / Open-now / Price** — the searchmap UI does **not** expose rating-min, "open now" boolean, or a price filter as standalone URL params. Sort by `order=rating` and filter the response. Open-now is encoded through the time-slider as `openAt=<HHMM>&openAtDay=<Mon|Tue|...>` (separate handling from a simple `open=1` flag). Price tier comes back per-venue from the detail page (`itemprop="priceRange"`) — filter client-side.

### Step 2 — Fetch the printable list (the optimal path)

```bash
QS="location=Berlin%2C+Germany&metric=km&radius=10&filters=vegan-vegetarian&order=rating"
browse cloud fetch --proxies \
  "https://www.happycow.net/searchmap/print?${QS}&page=1" \
  --output /tmp/hc-print-p1.html
```

The HTML is server-rendered. Key extractable fields per venue card:

- **Name + diet type** — heading line `<NAME> (<DIET>) <distance> <unit>` where `<DIET>` is one of `Vegan`, `Vegetarian`, `Veg-options`, `Health Store`, `Veg Store`, `Vegan Store`, `Other`. HTML entities (`&#039;` for `'`, `&amp;` for `&`) appear in names — un-escape.
- **Distance** — number + unit (`km` or `mi`) immediately after the diet paren.
- **Rating (stars)** — `<ul class="rating-list">` with exactly five `<li>` children. Each `<li>` contains one `<path d="...">`. The first ~30 chars of the `d` attribute identify the star state:
  - `M480-219.913` → full star (+1.0)
  - `M358.544-253.457` → half star (+0.5)
  - `M480-627.109` → empty star (+0)

  Sum across the 5 li → rating (0.0 – 5.0).
- **Address + phone** — `<p class="mt-3 font-normal">Street, City, Country, Postal - Telephone: +CC-...</p>`. When phone is unlisted the line reads `... - Telephone: N/A`. Card boundary: split the HTML on `<div class="mt-3 flex items-center">`.

The page header carries two crucial scope fields:

- **Heading** — `<h3>Vegetarian Restaurants & Health Food Stores</h3>` (or store-only/restaurant-only variant depending on filters).
- **Radius line** — `<p>Within a radius of <X> <km|mi> of your location - Total Results: <N></p>`. This gives you `total_results` for the region.

### Step 3 — Paginate

The print page returns ~180 cards/page (180 was observed for Berlin page 1 and page 2 with `radius=10&metric=km`, with `Total Results: 1833`). Iterate `page=1, page=2, ...` until you've consumed `Total Results / 180` pages (round up), or until a page returns zero cards.

```bash
for PAGE in $(seq 1 N); do
  browse cloud fetch --proxies "https://www.happycow.net/searchmap/print?${QS}&page=${PAGE}" \
    --output "/tmp/hc-print-p${PAGE}.html"
done
```

### Step 4 — Enrich (optional, only when caller needs `venue_id`, `slug`, `lat/lng`, photos, hours, website, features, cuisine tags, claimed-by-owner)

The print view **does not include venue IDs, slugs, lat/lng, photos, or feature/cuisine tags** — only what's listed above. For richer fields, two enrichment paths:

**(a) City-slug landing pages** — `/europe/<country>/<city>/`, `/north-america/usa/<state>/<city>/`, `/asia/<country>/<city>/`. These pages render ~50 curated venue cards as `<a href="/reviews/<slug>-<venue_id>">...</a>` anchors with the data-* map markers (`data-lat`, `data-lng`, `data-vegonly`, `data-new`) and full thumbnail URLs. Best when the caller's location is a known city and they want top venues with full IDs.

```bash
browse cloud fetch --proxies "https://www.happycow.net/europe/germany/berlin/" \
  --output /tmp/hc-berlin-slug.html
# Extract: grep -oE 'href="/reviews/[a-z0-9-]+-(\d+)"' yields slug→venue_id pairs (~54 unique for Berlin).
```

Then build the canonical URL: `https://www.happycow.net/reviews/{slug}-{venue_id}`.

**(b) Venue detail page** — `/reviews/{slug}-{venue_id}` returns full schema.org `Restaurant` microdata plus HappyCow `data-*` attrs. Fields available (verified on `/reviews/19-77-vegan-diner-bar-ramones-museum-berlin-414540`):

| Field | Selector |
|---|---|
| `venue_id` | `data-id="..."` on the article root |
| `lat` / `lng` | `data-lat`, `data-lng` on the `.map` div |
| `category` / `entrytype` | `data-category`, `data-entrytype` on the `.map` div |
| `vegan-only` flag | `data-vegonly="1"` |
| `recently-added` flag | `data-new="1"` |
| `claimed/promoted` flag | `data-promote="1"` |
| price tier | `<meta itemprop="priceRange" content="Moderate" />` (values: `Inexpensive`, `Moderate`, `Pricey`, `Expensive`) |
| rating (decimal) | `<meta itemprop="ratingValue" content="4.5" />` |
| review count | `<meta itemprop="reviewCount" content="31" />` |
| telephone | `itemprop="telephone"` |
| address | `itemprop="streetAddress"`, `addressLocality`, `postalCode`, `addressCountry` |
| hours | `<span class="hours-summary">Open Mon-Thu 16:00-23:00, Fri 16:00-01:00, ...</span>` (free-form text, parse client-side) |
| description | `<p class="venue-description" itemprop="description">...</p>` |
| feature/cuisine tags | `<div class="bg-gray-100 ... rounded-md px-1.5 h-6">Take-out</div>` siblings under the tags row |
| primary photo | first `data-background-image="https://images.happycow.net/venues/500/{id_prefix}/.../hcmp{venue_id}_*.jpeg"` |
| website | "Website" anchor under venue contact block (when present; many small venues link only to Instagram/Facebook) |
| canonical URL | `https://www.happycow.net/reviews/{slug}-{venue_id}` |

Detail-page fetches are slow (~880 KB HTML each) and rate-cost adds up — only enrich when the caller asks for fields beyond the print summary.

### Step 5 — Emit JSON

Return the schema in **Expected Output** below. Populate `bounding_box` from the print page's "X km of your location" header + the geocoded center if you can recover lat/lng (the `/searchmap?...` HTML embeds `data-lat`/`data-lng` on `#location` after geocode — `browse cloud fetch --proxies` the `/searchmap?location=...` URL once to grab those, then build bbox from `radius`).

### Step 6 — Release session (browser fallback only)

```bash
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

### Browser fallback (only if `/searchmap/print` returns 403 / 5xx)

If the print path is unreachable (Imperva rate-limit, server outage), load the live `/searchmap?...` URL in a Verified+proxy browser session and read the rendered venue list. **The XHR endpoint `/ajax/views/searchmap/venues` is confirmed-blocked to cookieless GETs** (see gotcha), so this path requires actually rendering the page with JS.

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies | jq -r .id)
browse cloud browse --connect "$SID" open "https://www.happycow.net/searchmap?${QS}"
browse cloud browse --connect "$SID" wait load
browse cloud browse --connect "$SID" wait timeout 4000   # XHR hydration lands 2–4s after load
browse cloud browse --connect "$SID" snapshot            # venue cards now in the a11y tree
```

Then extract from `data-id`/`data-lat`/`data-lng` on rendered cards. The XHR response is also visible in `browser-trace` CDP `Network.responseReceived` events under `/ajax/views/searchmap/venues`. Per-card parsing of the rendered list mirrors the venue-detail microdata schema above.

## Site-Specific Gotchas

- **Imperva (Incapsula) anti-bot is the universal gate.** Bare `browse cloud fetch` of `/searchmap?...` returns a 403 with an `_Incapsula_Resource` iframe. `browse cloud fetch --proxies` (residential proxy) returns 200 for `/searchmap?...`, `/searchmap/print?...`, `/europe/.../<city>/`, and `/reviews/{slug}-{id}` — proxies are **mandatory** for every fetch, not just session-mode. Verified 2026-05-16 on Berlin and Austin queries.
- **`/ajax/views/searchmap/venues` is confirmed-blocked for cookieless XHR.** Reproduced direct POST to the Browserbase Fetch API with `X-Requested-With: XMLHttpRequest` + `Accept: application/json` + correct `Referer` + `User-Agent` — every variant returned the HappyCow 404 "Page Not Found" HTML. Endpoint requires a `PHPSESSID` cookie established by a prior `/searchmap?...` page load (and likely a CSRF/JS-derived token verified by the Laravel middleware). **Don't waste turns hand-crafting cookieless XHRs to this endpoint — it doesn't work.** The optimal path is `/searchmap/print?...`; the browser fallback exercises the XHR through a real session, where cookies + headers are set automatically.
- **The print page does NOT include venue IDs, slugs, lat/lng, photos, or tag chips.** Only name, diet type, distance, 5-star rating, full address, and phone. If the caller needs richer fields, enrich via city-slug pages (for top ~50 venues with IDs) or per-venue detail pages.
- **Default radius is 15 (units), not from `limit_distance`.** Omitting both `radius` and a bbox returns the server's default 15-of-the-selected-metric. Use `radius=N&metric=km|mi` explicitly. The deprecated `limit_distance=` parameter from older URLs is silently ignored by the print route.
- **The form's `s=` URL param is a view-state byte, not a diet filter.** The page sets `s=2` for the user-visible search panel; the internal AJAX rewrites it to `s=3`. Diet filtering is via `filters=vegan-vegetarian-...` (dash-joined), **not** via `s`. A request without `filters=` returns all venue types.
- **HappyCow geolocates a `location=` string server-side and embeds the resolved `data-lat`/`data-lng` on the searchmap page's `#location` input.** To recover the geocoded center, scrape that input. Free-form like `"Shibuya, Tokyo"` and `"Austin, TX"` and `"78704"` all resolve cleanly. Direct lat/lng pairs work too — pass `lat=&lng=&radius=&metric=` and skip `location=`.
- **The `bb` (bounding-box) param has signature `swLat,swLng,neLat,neLng`** (south-west then north-east, per `/js/search.map.js` `locationEl.setAttribute('data-bounds', ...)`). When `bb` is present, `lat`/`lng`/`radius` are still useful for distance-from-center sort but the bbox is the authoritative spatial scope. Required when the user provides a `searchmap` URL with `bb=`.
- **Pagination on `/searchmap/print` returns ~180 cards/page regardless of the `limit` UI hint.** `limit=18|27|81` is the searchmap *map UI's* visible-marker cap, not the print page's serving size. Iterate `page=1, page=2, ...` until you've consumed `Total Results / 180` pages.
- **HappyCow rating extraction is path-based, not color-based.** All five `<li>` star SVGs use `class="text-yellow-500"` regardless of fill state. Distinguish state by the first 12 chars of the `<path d="...">` attribute: `M480-219.913` = full, `M358.544-253.457` = half, `M480-627.109` = empty. Sum full + 0.5 × half for the rating.
- **Diet type spelling in print HTML uses six values, not the form-name set.** The card heading parens contain one of: `Vegan`, `Vegetarian`, `Veg-options` (≈ veg-friendly), `Health Store`, `Veg Store`, `Vegan Store`, `Other`. Map these to your output diet field; do not expect `Veg-friendly` literally (it's spelled `Veg-options` in the print view).
- **HappyCow domains the world differently from the request IP.** A US-proxy `browse cloud fetch` of `/searchmap?location=Berlin%2C+Germany` correctly returns Berlin venues — the geocode is location-driven, not IP-driven. No need to swap proxy regions per locale. The page does include a `data-is-user-in-europe` flag for GDPR but it doesn't affect search results.
- **`api.happycow.net` is NOT the venue API.** It's a Symfony API Platform serving the shop products, user auth, top-ambassadors, venue claims, and a few partner-pricing resources. The venue-search resources are not exposed there. (Verified by hitting `https://api.happycow.net/index.json` — 36 resource classes listed, none of them venue-search.)
- **`map.happycow.net` is a tile / cluster server, not a JSON places API.** Direct GET returns 500 with no usable schema for skill purposes.
- **Free-form keywords use `term=`, comma-separated, not space-joined.** The UI's "Add keyword" widget appends each term as a separate button; the URL joins them with commas: `term=ramen,gluten-free`. Single-word `term=ramen` works too.
- **"Open now" is not a single boolean flag.** The UI exposes a time-slider that emits `openAt=<HHMM>&openAtDay=<Mon|Tue|...>` URL params. For "open right now" use the current local time at the search location and current day-of-week.
- **Read-only.** Do not click `Add a Place`, `Write a Review`, `Bookmark`, `Sign In`, or any anchor under `/reviews/.../write` or `/members/...`. The `/reviews/{slug}-{id}/write` URL is a review-submission form, not a read-only detail view.
- **Region-wide totals are reliable; "matched cards count" can lag.** The header's `Total Results: N` is the authoritative region-wide hit count. The visible cards on a single page are clamped at ~180, so a page-1 fetch alone is *not* the full picture for any metro with > 180 hits.
- **Sandbox limitation observed during build:** Browserbase regional connect endpoints (`connect.usw2.browserbase.com` etc.) did not resolve via DNS from this build sandbox, so the browser-fallback step was validated only by code inspection of the JS bundles, not by live execution. The `browse cloud fetch --proxies` path was fully validated end-to-end. If you run from a less-restricted environment, the browser fallback should work — but `/searchmap/print` is the recommended path regardless.

## Expected Output

```json
{
  "success": true,
  "search": {
    "location_query": "Berlin, Germany",
    "resolved_center": { "lat": 52.52, "lng": 13.405 },
    "bounding_box": { "sw_lat": 52.43, "sw_lng": 13.27, "ne_lat": 52.61, "ne_lng": 13.54 },
    "radius": 10,
    "metric": "km",
    "filters": {
      "diet": ["vegan", "vegetarian"],
      "cuisines": [],
      "features": [],
      "rating_min": null,
      "open_now": false,
      "price_max_tier": null
    },
    "sort": "rating",
    "page": 1
  },
  "total_results": 1833,
  "page_size": 180,
  "venues": [
    {
      "venue_id": 19181,
      "slug": "cafe-vux-berlin-19181",
      "name": "Cafe Vux",
      "diet": "Vegan",
      "diet_raw": "Vegan",
      "cuisine_tags": ["Cafe", "Bakery", "International"],
      "feature_tags": ["Outdoor seating", "Take-out", "Free Wi-Fi"],
      "rating": 4.5,
      "review_count": 142,
      "price_range": "Inexpensive",
      "address": {
        "street": "Wipperstr 14 (at Karl-Marx-Strasse)",
        "locality": "Berlin",
        "region": null,
        "postal_code": "12055",
        "country": "Germany",
        "full": "Wipperstr 14 (at Karl-Marx-Strasse), Berlin, Germany, 12055"
      },
      "phone": "+49-30680730555",
      "website": "https://cafevux.de",
      "lat": 52.4747,
      "lng": 13.4392,
      "distance": 4.21,
      "distance_unit": "km",
      "hours_summary": "Open Tue-Sun 09:00-20:00. Closed Mon.",
      "primary_photo_url": "https://images.happycow.net/venues/500/19/18/hcmp19181_1234567.jpeg",
      "additional_photos": [],
      "claimed_by_owner": false,
      "recently_added": false,
      "url": "https://www.happycow.net/reviews/cafe-vux-berlin-19181",
      "_source": "print+detail"
    },
    {
      "venue_id": null,
      "slug": null,
      "name": "Cookies Cream",
      "diet": "Vegetarian",
      "diet_raw": "Vegetarian",
      "cuisine_tags": null,
      "feature_tags": null,
      "rating": 5.0,
      "review_count": null,
      "price_range": null,
      "address": {
        "street": "Behrenstr 55 (at above Crackers)",
        "locality": "Berlin",
        "region": null,
        "postal_code": "10117",
        "country": "Germany",
        "full": "Behrenstr 55 (at above Crackers), Berlin, Germany, 10117"
      },
      "phone": "+49-30680730448",
      "website": null,
      "lat": null,
      "lng": null,
      "distance": 1.26,
      "distance_unit": "km",
      "hours_summary": null,
      "primary_photo_url": null,
      "additional_photos": [],
      "claimed_by_owner": null,
      "recently_added": null,
      "url": null,
      "_source": "print"
    }
  ]
}
```

Notes on the schema:

- `_source` indicates which path supplied this row. `"print"` rows have everything the print page yields and `null` for the enrichable fields; `"print+detail"` rows were merged with a `/reviews/{slug}-{id}` detail fetch; `"city-slug"` rows came from `/europe/.../<city>/` and have IDs but limited per-venue depth.
- `diet` is normalized (`vegan` / `vegetarian` / `veg-friendly` / `health-store` / `veg-store` / `vegan-store` / `other`); `diet_raw` preserves the source spelling (`Veg-options`, etc.).
- `phone` is `null` when print shows `"Telephone: N/A"`.
- When `bb=` was supplied or computed, `bounding_box` is populated; when only `radius`/`metric` were used, compute it from `resolved_center` ± `radius` (rough km↔degree conversion).
- For "candidate" / unverified status: if the print path 403s and the browser fallback can't be reached (e.g., DNS-restricted sandbox), emit `{"success": false, "reason": "anti_bot_wall", "diagnostic": "..."}` rather than partial data.
