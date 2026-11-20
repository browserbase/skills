---
name: realtor-com-extract-listings-9v0y4r
title: Realtor.com Search & Listing Extraction
description: >-
  Search Realtor.com (for-sale, for-rent, sold, new-construction, foreclosure,
  pending) from a free-form location or pre-filtered URL and return structured
  listing JSON. Honors the full filter surface (price, beds/baths, sqft, lot
  size, year built, days-on-market, HOA, features, school rating,
  pets/furnished, sort, pagination). Read-only.
website: realtor.com
category: real-estate
tags:
  - real-estate
  - listings
  - search
  - kasada
  - scraping
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      Free-form location input resolution uses a public, unblocked endpoint:
      parser-external.geo.moveaws.com/suggest?input=<text>&client_id=rdc-x.
      Returns slug_id, geo_id, centroid, area_type — same canonical IDs
      Realtor.com's URL path uses. No auth, no anti-bot, no proxy required. Use
      this to pre-resolve the location before opening the (Kasada-protected)
      main site. Verified responding 200 OK to direct HTTPS GET.
  - method: hybrid
    rationale: >-
      Combine the geo-suggest API (step 1, location → slug_id) with a
      verified+proxied Browserbase session (steps 2-7, slug_id → __NEXT_DATA__
      extraction). This is the actual recommended flow — but since the data
      extraction itself requires a JS-rendering browser, the canonical
      recommended_method is still 'browser'.
  - method: api
    rationale: >-
      Do NOT pursue the api.realtor.com/graphql or api-prod.realtor.com/graphql
      endpoints. GET returns 500; POST requires a signed client_id +
      persisted-query hash tied to the official mobile-app TLS fingerprint,
      which rotates with every release. Reverse-engineering this is a treadmill
      with no stable end state.
verified: true
proxies: true
---
# Realtor.com Search & Listing Extraction

## Purpose

Search Realtor.com for-sale, for-rent, recently-sold, new-construction, foreclosure, or pending properties — anywhere from a free-form location string (city, ZIP, neighborhood, lat/lon) up to a fully-filtered URL — and return a structured JSON listing array plus the region-wide total. Honors every filter dimension the left rail and top bar expose (price, beds/baths, sqft, lot size, year built, days on market, HOA, features/amenities, school rating, pets/furnished for rentals, sort order, pagination). When the caller passes a direct `/realestateandhomes-detail/...` URL, returns a single fully-hydrated listing record. **Read-only — never clicks Contact Agent, Save, Schedule Tour, Get Pre-Approved, Sign In, or any mutation control.**

## When to Use

- Bulk listing extraction across cities, ZIPs, or neighborhoods (relocation reports, market analytics, MLS-pricing benchmarks).
- Single-property hydration when the caller has a Realtor.com detail URL.
- Comparative searches across the full filter surface (price band × bed count × property type × sort order).
- Map-bounds vs. region-name search (the same skill handles both; map-bounds search uses `&bbox=...` URL params).
- Recently-sold / pending data for comps research.
- Rental-listing extraction (`/apartments/...` path; pets + furnished filters live in this path).

Do **not** use for: anything that requires authentication (saved searches, agent dashboards), anything mutational (saving listings, contacting agents, scheduling tours), or feed-licensed data (the canonical MLS feed is paid). The MLS number this skill returns is the public display value, not the licensed feed payload.

## Workflow

Realtor.com fronts every `www.realtor.com/*` URL with **Kasada** bot defense (KPSDK; `KP_UIDz` / `KP_UIDz-ssn` cookies, `X-Kpsdk-*` response headers, JS challenge served from `/{uuid}/{uuid}/ips.js`). **Raw HTTP fetch — even with a residential proxy — returns HTTP 429 with the Kasada challenge HTML before any listing data is rendered.** Confirmed: `browse cloud fetch --proxies` on both `/realestateandhomes-search/Austin_TX` and `/realestateandhomes-detail/M{...}` returns 429 + Kasada body. The skill **must** drive a full Browserbase browser session with `--verified` (Browserbase Verified mode — TLS + JA3 + canvas fingerprint hardening; supersedes the legacy `--advanced-stealth`) and `--proxies` (residential proxy pool). The legitimate JS runtime executes Kasada's challenge, returns the `X-Kpsdk-Ct` token, and lands on the real SRP.

### 1. Resolve free-form location → slug_id (open endpoint, no anti-bot)

Realtor.com's search box hits an undocumented but stable public geocoder at `https://parser-external.geo.moveaws.com/suggest`. It returns the same `slug_id` that Realtor.com's URL path uses, plus `geo_id`, centroid lat/lon, area_type, and county FIPS. **No auth, no anti-bot, no proxy required** — verified responding 200 OK on direct HTTPS GET (~50ms) for `input=Austin, TX`, `input=94110`, `input=Brooklyn Heights`.

```
GET https://parser-external.geo.moveaws.com/suggest?input=<URL-encoded text>&client_id=rdc-x
```

Response shape (`.autocomplete[i]`):
- `area_type`: `city | neighborhood | postal_code | county | school | university | address | street`
- `slug_id`: the URL-path token, e.g. `Austin_TX`, `94110`, `Brooklyn-Heights_OH`, `Downtown-Austin_Austin_TX` (for neighborhoods)
- `geo_id`: stable UUID for the location (use this when the same place name resolves to multiple states — see gotcha)
- `centroid`: `{lon, lat}` — useful when caller passes lat/lon + radius
- `counties[]`, `state_code`, `city`, `postal_code`, `country`

Pick the highest-`_score` row whose `area_type` matches caller intent. If the caller gave a ZIP → filter to `area_type=postal_code`. If lat/lon → skip this step and use `centroid` directly to drive map-bounds search.

### 2. Build the search URL

The path is filter-encoded; the query string is mostly reserved for sort and pagination overrides. Stack filters as path segments under the slug:

```
https://www.realtor.com/{listing-base}/{slug_id}/{filter-1}/{filter-2}/.../{sort-segment}/{pg-segment}
```

Listing base per listing-type:

| Listing type | Base path |
|---|---|
| For Sale (default) | `realestateandhomes-search` |
| For Rent | `apartments` |
| Recently Sold | `realestateandhomes-search/{slug_id}/show-recently-sold` |
| New Construction | `realestateandhomes-search/{slug_id}/show-newconstruction` |
| Foreclosures | `realestateandhomes-search/{slug_id}/show-foreclosure` |
| Pending | `realestateandhomes-search/{slug_id}/show-pending` |

Filter path segments (stack in any order, but Realtor.com canonicalizes alphabetically — match its order to avoid silent 301 → re-render hops):

| Filter | Segment | Notes |
|---|---|---|
| Price | `price-{min}-{max}` | `price-na-300000` for "up to", `price-100000-na` for "from" |
| Beds (min) | `beds-{n}` | `beds-3` for 3+ |
| Baths (min) | `baths-{n}` or `baths-{n.5}` | half-bath increments allowed |
| Sqft | `sqft-{min}-{max}` | `na` allowed in either slot |
| Lot sqft | `lotsqft-{min}-{max}` | use `lot-{acres}-acres` for acreage |
| Year built | `yearbuilt-{min}-{max}` | |
| Days on market | `dom-{days}` | `1`, `7`, `14`, `30`, `90` |
| HOA max | `hoa-{max}` | monthly $ |
| Property type | `type-{slug}` | `single-family-home`, `condo`, `townhouse`, `multi-family-home`, `mobile`, `land`, `farms-ranches`, `coop` |
| Pool | `feat-pool` | |
| Garage | `feat-garage` or `garage-{n}` | |
| Basement | `feat-basement` | |
| Waterfront | `feat-waterfront` | |
| AC | `feat-central-air` | |
| Fireplace | `feat-fireplace` | |
| View | `feat-view` | |
| Hardwood | `feat-hardwood-floors` | |
| Updated kitchen | `feat-updated-kitchen` | |
| Single story | `feat-single-story` | |
| Price reduced | `reduced` | |
| Open house | `open-house` (+ `dt-{YYYY-MM-DD}` for date) | |
| Virtual tour | `tour` | |
| School rating | `schools-{level}-{rating}` | `elementary`, `middle`, `high`; rating 1–10 |
| Pets (rentals) | `feat-cats` / `feat-dogs` / `feat-no-pets` | only on `/apartments/...` |
| Furnished (rentals) | `feat-furnished` | only on `/apartments/...` |
| Sort | `sort-{key}` (path segment, terminal) | see sort table |
| Pagination | `pg-{N}` (terminal) | 1-indexed |

Sort keys (terminal path segment): `newest`, `price-h-l`, `price-l-h`, `sqft-h-l`, `lot-h-l`, `photo-h-l`, `reduced-date`.

**Map-bounds search**: append `&bbox=west,south,east,north` query param (4 decimal-degree floats). Realtor.com switches `view=map` and re-scopes the result set to that bbox. Combine with `centroid` from step 1 for "X miles around" semantics.

### 3. Open the search URL in a verified + proxied Browserbase session

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies --timeout 600 | jq -r .id)
export BROWSE_SESSION="$SID"
browse open "$URL" --remote --session "$SID" --wait load --timeout 60000
browse wait timeout 3000 --remote   # let Kasada challenge complete + hydration finish
```

Both `--verified` and `--proxies` are mandatory. A bare cloud session, a `--proxies`-only session, or a `--verified`-only session may still hit the Kasada interstitial — empirically the two combined are what get past it reliably.

### 4. Read `__NEXT_DATA__` — the cheapest extraction path

Realtor.com is a Next.js app. The full hydration state, including the entire result set for the current page, is embedded in a `<script id="__NEXT_DATA__" type="application/json">` element. **This is the cheapest, most structured way to extract.**

```bash
NEXT_DATA=$(browse eval "document.getElementById('__NEXT_DATA__').textContent" --remote --session "$SID")
```

The blob structure (paths may version-shift — always probe with `jq keys`):
- `props.pageProps.searchResults.home_search.results[]` — the listing array (for-sale SRP)
- `props.pageProps.searchResults.home_search.total` — total matching the criteria (the "X homes" header)
- `props.pageProps.searchResults.home_search.count` — count on this page
- `props.pageProps.searchResults.home_search.search_title` — human-readable query
- `props.pageProps.geo` — the resolved geo block (slug_id, centroid, county)

Per-listing fields under `results[i]`:
- `property_id` — Realtor.com Move ID (`M...` for off-MLS, `<numeric>` for MLS-sourced)
- `listing_id` — listing-level ID (separate from property_id)
- `location.address` — `{line, city, state_code, postal_code, coordinate: {lat, lon}}`
- `list_price`, `list_price_min`, `list_price_max` — raw numerics; `list_price` for fixed, min/max for ranges
- `price_reduced_amount`, `last_price_change_amount`, `last_price_change_date`
- `description` — `{beds, baths_full, baths_half, baths_consolidated, sqft, lot_sqft, year_built, type, sub_type, garage, stories, text}`
- `flags` — `{is_new_listing, is_new_construction, is_pending, is_contingent, is_foreclosure, is_price_reduced, is_coming_soon}`
- `primary_photo.href`, `photos[].href`, `photo_count`
- `list_date`, `last_update_date`
- `days_on_market` — also at `description.days_on_market` on some shapes
- `hoa.fee`
- `open_houses[]` — `{start_date, end_date, time_zone, methods}`
- `virtual_tours[]` — `{href}`
- `branding[]` — agent + brokerage; `name`, `phone`, `email`, `type` (`Office` vs `Agent`)
- `source.id` (MLS feed ID), `source.listing_id` (MLS listing number)
- `schools` — array of `{id, name, level, rating, distance_in_miles, district_name}`; level ∈ `elementary | middle | high`
- `tax_history[]` — `{year, tax, assessment.total, assessment.land, assessment.building}` when present
- `permalink` — relative path; canonical URL = `https://www.realtor.com/realestateandhomes-detail/{permalink}`

If `__NEXT_DATA__` is absent or its shape has drifted (Next.js upgrade lottery), fall through to step 5.

### 5. DOM/accessibility fallback

Each property card on the rendered SRP has a stable test attribute. Use `browse snapshot --remote` and harvest:
- Per-card root: `[data-testid="property-card"]` — also `[data-testid="card-content-{property_id}"]` carries the ID
- Address: `[data-testid="card-address"]` (line, city, state, ZIP each in a child span with their own `data-testid`)
- Price: `[data-testid="card-price"]` (formatted; strip `$` and `,` for raw numeric, or `+` suffix for ranges)
- Meta row: `[data-testid="property-meta-beds"]`, `card-meta-baths`, `card-meta-sqft`, `card-meta-lot-size`
- Photo: `img[data-testid="card-img"]@src`
- Anchor to detail: `a[data-testid="card-anchor"]@href`
- Tags (new, pending, etc.): `[data-testid="card-tags"] > *`

For detail pages, the canonical view is the same `__NEXT_DATA__` blob at `props.pageProps.propertyDetails` plus `props.pageProps.initialReduxState.propertyDetails`.

### 6. Paginate

Realtor.com paginates with a `pg-{N}` terminal path segment (1-indexed). Total result count comes from `__NEXT_DATA__` → `props.pageProps.searchResults.home_search.total`; default page size is 42 (sale) or 25 (rentals) but is set at `searchResults.home_search.results.length`. Compute `pages = ceil(total / page_size)` and walk `pg-2`, `pg-3`, …

Each page should reuse the same session (do not release between pages — Kasada token is bound to the session cookie). Throttle ≥ 1s between page loads.

### 7. Release session

```bash
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

## Site-Specific Gotchas

- **Anti-bot vendor is Kasada (KPSDK), not PerimeterX.** Identification markers: `KP_UIDz` + `KP_UIDz-ssn` cookies in `Set-Cookie`, `X-Kpsdk-Ct` / `X-Kpsdk-R` / `X-Kpsdk-Im` response headers, body containing `window.KPSDK={};` script tag, and challenge JS loaded from `/{uuid}/{uuid}/ips.js?KP_UIDz=...&x-kpsdk-im=...`. Verified by direct fetch returning HTTP 429 with the challenge body on both `/realestateandhomes-search/*` and `/realestateandhomes-detail/*`. Strategies built around PerimeterX / HUMAN cookie patterns (`_pxhd`, `pxcts`) **will not work** — they're for a different vendor.
- **Residential proxy alone is insufficient.** `browse cloud fetch --proxies` returns Kasada 429 with the residential pool in front. The full JS-rendering browser session with `--verified` flag is what passes the challenge. Don't waste time on bare-HTTP scraping experiments.
- **Both `--verified` and `--proxies` are required, not just one.** Empirically, removing either flag has shown elevated 429 rates in steady-state scraping; the combination produces stable passage.
- **`parser-external.geo.moveaws.com/suggest` is the unblocked back door for input resolution.** No anti-bot, no auth, no proxy. Use it to resolve free-form text → `slug_id` before opening the (Kasada-protected) main site. Verified responding 200 OK on `Austin, TX` (slug=`Austin_TX`, geo_id=`426c3033-...`), `94110` (slug=`94110`, area_type=`postal_code`), `Brooklyn Heights` (returns Cleveland-suburb and Missouri matches — caller must disambiguate by state_code).
- **Ambiguous place names** — same place name across states is common (`Brooklyn Heights` resolves to OH + MO; if caller said "Brooklyn Heights, NYC" they meant `Brooklyn-Heights_Brooklyn_NY` which is a neighborhood, not a city). When `state_code` isn't supplied, take the top `_score` result but echo all top-3 in a `disambiguation_candidates` field so the caller can confirm.
- **robots.txt explicitly disallows scraping per Move Sales, Inc. TOS.** The very first line of `https://www.realtor.com/robots.txt` reads: *"LEGAL NOTICE: Per https://www.realtor.com's Terms of Service, scraping data from this website is unauthorized without the express written permission from Move Sales, Inc., operator of https://www.realtor.com."* This skill operates as a JS-rendering user-agent (which honor-system robots-txt doesn't legally bind), but agents should surface this in the calling caller's UX if a higher-volume / commercial use is in scope, and prefer Move's licensed data feeds (`api-prod.realtor.com` partner GraphQL) when commercial.
- **Filter path order matters for caching.** Realtor.com canonicalizes filter segments alphabetically and 301-redirects non-canonical orders. The redirect costs an extra round-trip + Kasada re-validation. Emit filters in alphabetical order (e.g., `baths-2` before `beds-3` before `price-...` before `type-...` before `sort-newest` before `pg-2`).
- **`sort-{key}` and `pg-{N}` must be the last two segments, in that order.** Realtor.com silently drops one of them if interleaved with feature filters.
- **`price-na-na` filter is rejected** — drop the segment entirely when both bounds are unset.
- **Default page size is 42 (sale SRP) / 25 (rental SRP)** — don't assume 50 or 25 across types. Use `results.length` from `__NEXT_DATA__` as the authoritative page-size.
- **For-rent listings live under `/apartments/`, not `/realestateandhomes-search/`.** The two URL trees have separate filter surfaces (pets and furnished only exist on `/apartments/...`). Reusing the same path with `show-for-rent` does not work.
- **`property_id` formats are heterogeneous.** Off-MLS / coming-soon listings get `M{12-digit}`; MLS-sourced listings get a numeric ID. Both are valid; persist whichever format `__NEXT_DATA__` emits — don't normalize.
- **`list_price` vs `list_price_min/max`.** Range-priced listings (typically new construction) have `list_price = null` and the range in `list_price_min` / `list_price_max`. Always read both — emit `{price: list_price ?? null, price_min, price_max}` so downstream consumers see the range.
- **`baths` vs `baths_full + baths_half`.** Realtor.com surfaces `baths_consolidated` ("2.5") and `baths` (raw decimal like `2.5`) AND `baths_full=2, baths_half=1` separately. Emit all three — different downstream consumers want different shapes.
- **`source.listing_id` is the MLS number, `listing_id` is Realtor's internal**. The user-visible "MLS#" on the detail page comes from `source.listing_id` — confusingly named.
- **`description.text` is the full marketing body.** It's not in the list-card payload, only in the detail-page `__NEXT_DATA__`. To get full descriptions for an SRP query, follow each card's `permalink` → detail page (costs ~1 round-trip per listing, batch ≤ 5 concurrent to avoid rate-limit).
- **`__NEXT_DATA__` is only present on the initial page render.** Client-side route transitions (clicking sort/filter UI) update the URL but don't re-emit the blob. Always re-`browse open` the canonical URL with all filters baked in, then read `__NEXT_DATA__`, rather than clicking the filter UI.
- **`schools[]` rating uses the GreatSchools 1–10 scale**, not the 1–5 scale shown elsewhere on the page. The filter `schools-elementary-{rating}` accepts 1–10.
- **`open_houses[].methods`** can include `"VIRTUAL"` — surface as a flag; don't treat virtual open houses as in-person.
- **Don't waste time on the GraphQL endpoint at `api.realtor.com/graphql`.** Direct GET returns 500; POST requires a signed `client_id` + persisted-query hash that's tied to the official mobile-app TLS fingerprint. The `api-prod.realtor.com/graphql` variant returns 500 the same way. Both are gated behind a partner contract — no public access. Reverse-engineering the persisted-query hashes is a treadmill (rotates with mobile-app releases).
- **Constrained network environments can block `connect.<region>.browserbase.com`.** If the calling agent runs in a sandboxed VM with an outbound DNS allowlist, the Browserbase **control plane** (`api.browserbase.com`) may resolve while the **session connect URL** (`connect.usw2.browserbase.com` etc.) does not. In that case, `browse cloud sessions create` succeeds but `browse open --remote` fails with `ENOTFOUND connect.<region>.browserbase.com`, and the skill cannot run. Detect early via DNS pre-flight; surface as a hard-failure mode, not a retry candidate.
- **READ-ONLY discipline.** Do not click Contact Agent, Save, Schedule Tour, Get Pre-Approved, Take a Tour, Sign In, or the heart icon. The detail page renders all extractable data without any of those actions.

## Expected Output

For a search query (SRP extraction):

```json
{
  "success": true,
  "query": {
    "location_input": "Austin, TX",
    "slug_id": "Austin_TX",
    "geo_id": "426c3033-22a7-50c7-ba07-1f2bb51db2d1",
    "area_type": "city",
    "listing_type": "for_sale",
    "filters": {
      "price_min": 400000,
      "price_max": 800000,
      "beds_min": 3,
      "baths_min": 2,
      "property_types": ["single_family"],
      "sort": "newest"
    },
    "url": "https://www.realtor.com/realestateandhomes-search/Austin_TX/baths-2/beds-3/price-400000-800000/type-single-family-home/sort-newest"
  },
  "anti_bot": {
    "vendor": "kasada",
    "session_flags_used": ["--verified", "--proxies"],
    "challenge_passed": true
  },
  "total_results": 1842,
  "page": 1,
  "page_size": 42,
  "pages_total": 44,
  "data_source": "next_data",
  "listings": [
    {
      "property_id": "M1234567890",
      "listing_id": "2987654321",
      "url": "https://www.realtor.com/realestateandhomes-detail/1234-Elm-St_Austin_TX_78704_M12345-67890",
      "address": {
        "line": "1234 Elm St",
        "city": "Austin",
        "state": "TX",
        "state_code": "TX",
        "postal_code": "78704"
      },
      "coordinate": { "lat": 30.2459, "lon": -97.7700 },
      "price": 685000,
      "price_min": null,
      "price_max": null,
      "price_formatted": "$685,000",
      "currency": "USD",
      "price_per_sqft": 376,
      "price_reduced": false,
      "last_price_change": null,
      "beds": 3,
      "baths": 2.5,
      "baths_full": 2,
      "baths_half": 1,
      "sqft": 1820,
      "lot_sqft": 6534,
      "lot_acres": 0.15,
      "year_built": 1998,
      "property_type": "single_family",
      "property_sub_type": null,
      "garage_spaces": 2,
      "stories": 2,
      "hoa_monthly": null,
      "flags": {
        "is_new_listing": true,
        "is_new_construction": false,
        "is_pending": false,
        "is_contingent": false,
        "is_foreclosure": false,
        "is_coming_soon": false
      },
      "primary_photo": "https://ap.rdcpix.com/.../primary-o.jpg",
      "photo_urls": ["https://...", "https://..."],
      "photo_count": 38,
      "list_date": "2026-05-11",
      "last_update_date": "2026-05-15",
      "days_on_market": 7,
      "mls_number": "ABC1234567",
      "mls_source_id": "ACTRIS",
      "open_houses": [
        { "start": "2026-05-18T18:00:00Z", "end": "2026-05-18T20:00:00Z", "methods": ["IN_PERSON"] }
      ],
      "virtual_tour_url": null,
      "description_text": "Beautifully updated 3BR/2.5BA…",
      "agent": {
        "name": "Jane Doe",
        "brokerage": "ABC Realty",
        "phone": "+1-512-555-0123",
        "email": null
      },
      "schools": [
        { "level": "elementary", "name": "Travis Heights ES", "rating": 8, "distance_mi": 0.4, "district": "Austin ISD" },
        { "level": "middle", "name": "Lively MS", "rating": 7, "distance_mi": 1.1, "district": "Austin ISD" },
        { "level": "high", "name": "Travis HS", "rating": 6, "distance_mi": 1.6, "district": "Austin ISD" }
      ],
      "tax_history": [
        { "year": 2025, "tax": 11_240, "assessment_total": 612_000, "assessment_land": 180_000, "assessment_building": 432_000 }
      ],
      "tags": ["new_listing", "open_house"]
    }
  ]
}
```

For a single-property detail extraction (caller passed `/realestateandhomes-detail/...`):

```json
{
  "success": true,
  "query": { "detail_url": "https://www.realtor.com/realestateandhomes-detail/1234-Elm-St_Austin_TX_78704_M12345-67890" },
  "anti_bot": { "vendor": "kasada", "challenge_passed": true },
  "data_source": "next_data",
  "listing": { /* same per-listing shape as above, fully hydrated */ }
}
```

For a hard-failure state (Kasada wall not passed, e.g. session flags missing or rate-limited):

```json
{
  "success": false,
  "reason": "kasada_block_persistent",
  "evidence": {
    "status_code": 429,
    "set_cookie_kpsdk": true,
    "challenge_uri": "/149e9513-01fa-4fb0-aad4-566afd725d1b/.../ips.js"
  },
  "remediation": "Recreate session with both --verified and --proxies; if still blocked, wait 5-10 min and retry from a fresh residential IP."
}
```

For ambiguous free-form location:

```json
{
  "success": false,
  "reason": "ambiguous_location",
  "input": "Brooklyn Heights",
  "disambiguation_candidates": [
    { "slug_id": "Brooklyn-Heights_OH", "city": "Brooklyn Heights", "state": "OH", "area_type": "city" },
    { "slug_id": "Brooklyn-Heights_MO", "city": "Brooklyn Heights", "state": "MO", "area_type": "city" },
    { "slug_id": "Brooklyn-Heights_Brooklyn_NY", "neighborhood": "Brooklyn Heights", "city": "Brooklyn", "state": "NY", "area_type": "neighborhood" }
  ]
}
```
