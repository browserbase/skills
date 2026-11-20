---
name: streeteasy-com-extract-listings-1emkts
title: StreetEasy For-Sale Listings Extraction
description: >-
  Extract StreetEasy for-sale listings (NYC + NJ) matching multi-dimensional
  filters — price, beds/baths, sqft, year built, property type, amenities, and
  area — returning structured per-listing data via the JSON-LD path. Bypasses
  PerimeterX by using headless HTTP fetch instead of a full browser session.
website: streeteasy.com
category: real-estate
tags:
  - real-estate
  - listings
  - nyc
  - streeteasy
  - perimeterx
  - json-ld
source: 'browserbase: agent-runtime 2026-05-24'
updated: '2026-05-24'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      Discouraged. Browser sessions on streeteasy.com — even with --verified
      --proxies — land on a HUMAN/PerimeterX 'Press & Hold' challenge titled
      'Access to this page has been denied'. Verified across two fresh sessions
      in this run. Page-context fetch() from inside a bot-walled browser also
      returns only the challenge HTML. Use `browse cloud fetch` (the headless
      HTTP path) instead — it returns 200 OK with the full rendered HTML
      including JSON-LD listing blocks and the inline RSC search-state payload.
verified: false
proxies: false
---
# StreetEasy For-Sale Listings Extraction

## Purpose

Given a multi-dimensional filter (price, beds/baths, sqft, year built, property type, amenities, area), return a structured list of StreetEasy for-sale listings — address, neighborhood, ZIP, lat/lon, beds, baths, sqft, price, building type, image URLs, and the canonical listing URL. Read-only; never saves a search, contacts an agent, or favorites a listing.

## When to Use

- Daily / hourly monitoring of new NYC for-sale inventory matching a saved search.
- Bulk extraction across multiple boroughs or neighborhoods for market analysis.
- Anywhere you'd otherwise scrape rendered StreetEasy HTML — the JSON-LD path is faster, cheaper, and structurally more reliable, and the full-browser path is gated by PerimeterX (see gotchas).

## Workflow

StreetEasy's `/for-sale/{area}/{pipe-filter-string}` URLs are server-rendered Next.js pages whose HTML embeds (a) one JSON-LD `<script type="application/ld+json">` block per listing with full structured data, and (b) an inline `__next_f.push(...)` RSC payload containing `paramsState`, `criteria`, `totalCount`, `totalPages`, `currentPage`, `perPage`. **Lead with `browse cloud fetch <url>`** — it returns the same HTML the browser sees but without triggering PerimeterX. The browser path is gated by a "Press & Hold to confirm you are a human" challenge even with `--verified --proxies` (verified 2026-05-24 across two fresh sessions, see gotchas). No residential proxy or auth is required on the `cloud fetch` path; 200 OK on a bare fetch.

### 1. Map filter dimensions to URL syntax

StreetEasy encodes filters in a `|`-separated path segment after the area slug. URL-encode `|` as `%7C`, `>` as `%3E`, `<` as `%3C` before sending.

```
https://streeteasy.com/for-sale/{area-slug-or-area:NNN}/{key1:val1|key2:val2|key3>=N|key4<=N}[?page=N]
```

| Dimension | Working URL syntax | Echoed where |
|---|---|---|
| Area (borough / neighborhood) | path slug `manhattan`, `brooklyn`, `ues`, `tribeca`, … OR `area:NNN[,MMM]` for multi-area | `paramsState.searchParams.areas[]` |
| Price range | `price:MIN-MAX`, `price:MIN-`, `price:-MAX` | `paramsState.price`, criteria |
| Beds | `beds>=N`, `beds<=N` | `paramsState.bedrooms` |
| Baths | `baths>=N`, `baths<=N` | `paramsState.bathrooms` |
| Square footage | `sqft:MIN-MAX`, `sqft:MIN-`, `sqft:-MAX` (also `sqft>=N` — applies but not echoed) | `paramsState.sqft` |
| Year built | `year_built:MIN-MAX`, `year_built:MIN-`, `year_built:-MAX` | `paramsState.yearBuilt`, criteria |
| Property type | `type:D1` (condo), `type:P1` (co-op), or path-style `/condos/{area}/…`, `/coops/{area}/…`. Multi-type `type:D1,P1` works | criteria (`type:D1,P1`) |
| Amenities | `amenities:doorman,gym,laundry,parking,elevator,pool,fireplace,dishwasher,washer_dryer,central_ac,smoke_free,storage` (lowercase, comma-AND) | `paramsState.amenities[]` (uppercase) |
| Common charges (maintenance) | `maintenance<=N` (applies — not echoed in criteria; visible in `searchParams`) | `paramsState` |
| Taxes | `taxes<=N` (applies — not echoed) | `paramsState` |
| Open-house flag | `open_house:1` | `paramsState` |
| Pagination | `?page=N` query string (only `page`, not `p` or `currentPage`) | `pageInfo.currentPage` |

**Area-ID lookup table** (back-derived from `paramsState.areas[]` per response — `area:N` accepts integer IDs in the URL):

| ID | Area | ID | Area |
|---|---|---|---|
| 1 | NYC (all 5 boroughs + NJ) | 117 | East Village |
| 100 | Manhattan | 120 | Midtown |
| 200 | Bronx | 135 | Upper West Side (UWS) |
| 300 | Brooklyn | 139 | Upper East Side (UES) |
| 400 | Queens | 157 | West Village |
| 500 | Staten Island | 302 | Williamsburg |
| 105 | Tribeca | 313 | Bushwick |
| 107 | SoHo | 319 | Park Slope |
| 112 | Battery Park City | 401 | Astoria |
| 115 | Chelsea | 402 | Long Island City |

(Discovered values from 21 slug-→-ID probes. For unknown neighborhoods, hit `/for-sale/{slug}/status:open` and read `paramsState.areas[]` to recover the numeric ID — once per unique slug.)

### 2. Fetch the SRP HTML

```bash
URL='https://streeteasy.com/for-sale/manhattan/amenities:doorman|sqft:800|year_built:1990-2025|price:750000-2000000|beds>=2|baths>=1'
ENC=$(node -e "process.stdout.write(encodeURI('$URL'))")
browse cloud fetch "$ENC"   # 200 OK, ~1.7 MB HTML, no proxies needed
```

The response is a `{ id, statusCode, headers, content, … }` JSON envelope where `content` is the full HTML. Status code 200 is the success signal; status 308/404 means an invalid filter slug, status 200 with `totalCount:0` means a valid filter that matched nothing.

### 3. Parse aggregates from the inline RSC payload

`content` contains an inline `<script>self.__next_f.push([1, "..."])</script>` whose string body (escape-encoded with `\"`) carries the full search state. Extract with regex against the escaped form:

```javascript
const cm = c.match(/\\"criteria\\":\\"([^\\]+)\\"/);          // canonical filter string, e.g. "area:100|baths>=1|beds>=2|price:750000-2000000|status:open"
const tm = c.match(/\\"totalCount\\":(\d+)/);                  // 258
const cp = c.match(/\\"currentPage\\":(\d+)/);                 // 1
const tp = c.match(/\\"totalPages\\":(\d+)/);                  // 9
const pp = c.match(/\\"perPage\\":(\d+)/);                     // 29 (StreetEasy paginates at 29 per page)
const sp = c.match(/\\"searchParams\\":\{[^]+?\}\}/);          // the parsed filter object — source of truth
```

`paramsState.searchParams` is the **canonical applied-filter object** — always prefer it over `criteria` (some filters apply but are not echoed in `criteria` — `sqft>=N`, `maintenance<=N`, `taxes<=N`, `amenities:doorman,gym,pool` with 3+ values).

### 4. Parse per-listing data from JSON-LD blocks

Listings are emitted as `@type: "Apartment"` items inside a `<script type="application/ld+json">` `itemListElement` array. The HTML carries them un-escaped (regular JSON), so parse the script tag bodies directly:

```javascript
const ldRe = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
const apartments = [];
for (const m of c.matchAll(ldRe)) {
  try {
    const o = JSON.parse(m[1]);
    const lst = o.itemListElement || o["@graph"] || (Array.isArray(o) ? o : []);
    for (const e of lst) {
      const it = e.item || e;
      if (it && it["@type"] === "Apartment") apartments.push(it);
    }
  } catch {}
}
```

Each `Apartment` object has:

```
{
  "@id": "https://streeteasy.com/building/{slug}/{unit}",
  "url": same,
  "name": "100 Claremont Avenue #22E",
  "numberOfBedrooms": 2,
  "numberOfBathroomsTotal": 2,
  "numberOfFullBathrooms": 2,
  "numberOfPartialBathrooms": 0,
  "address": { "streetAddress", "addressLocality" (= neighborhood), "addressRegion", "postalCode", "addressCountry" },
  "geo":     { "latitude", "longitude" },
  "floorSize": { "value": 1090, "unitCode": "SQF", "unitText": "square feet" },
  "image":   [ "ImageObject"… ],
  "additionalProperty": [
    { "name": "Price", "value": "$1,585,000" },
    { "name": "Building Type", "value": "CONDO" }      // CONDO | CO-OP | TOWNHOUSE | …
  ]
}
```

Strip `$` and `,` from `additionalProperty[name=Price].value` to get a numeric price.

### 5. Paginate

```bash
?page=2   # ?page=N — only working pagination key. `?p=N` and `?currentPage=N` are silently ignored.
```

`pageInfo.hasNextPage` is the loop condition. Each page returns up to 38 Apartment blocks (29 organic + sponsored/featured); `paramsState.perPage` always reports 29.

### Browser fallback

**Discouraged.** `browse open https://streeteasy.com/for-sale/manhattan` on a Browserbase session — with or without `--verified --proxies` — lands on `https://streeteasy.com/.../*` rendered as a HUMAN-vendor "Press & Hold to confirm you are a human" challenge page (title = "Access to this page has been denied"). Verified on two fresh sessions in this run (2026-05-24): both got the wall on the first navigation. The challenge page's iframe is HUMAN/PerimeterX and is not solvable from a headless agent. If you must use a browser (e.g., to capture a screenshot for human review), expect the wall and treat any title containing "Access to this page has been denied" as a soft block — do NOT retry, switch to `cloud fetch`.

## Site-Specific Gotchas

- **PerimeterX / HUMAN walls the BROWSER path; `browse cloud fetch` bypasses it.** Browser sessions land on a "Press & Hold" challenge even with `--verified --proxies` (and even after the first session has been used once). `browse cloud fetch` returns 200 OK with a 1.7 MB HTML body containing the full RSC payload and JSON-LD blocks. **Set `recommended_method: fetch`, not `browser`.** Page-context `fetch()` from inside a bot-walled browser also fails (returns ~6 KB challenge HTML).
- **`browse cloud fetch` works without `--proxies`.** The first `--proxies` fetch returned 200; a bare fetch (no flag) ten seconds later also returned 200. The CloudFront edge does not appear to fingerprint Browserbase's outbound IPs for this host. Save the proxy budget for sites that actually need it.
- **The `criteria` field in the RSC payload is NOT the source of truth.** Several filters apply (visible via `totalCount` change) but are not echoed in `criteria`: `sqft>=N`, `maintenance<=N`, `taxes<=N`, multi-value `amenities:a,b,c` with 3+ values. Read `paramsState.searchParams` instead — that's the authoritative parsed filter object.
- **Many seemingly-natural filter keys are silently dropped.** Confirmed dead — do NOT waste cycles probing these:
  - **Days on market** — `days_listed:`, `days_on_market:`, `dom:`, `listed:`, `recently_listed:`, `posted:`, `new:`, `min_listed_dt:`, `listed_in:`, `listed_within:`, `active_days:`, `days_on_streeteasy:`, `recent:`, `recent_listings:` — every one returned `tot=7505` (the unfiltered Manhattan total). No URL-level support; filter client-side on `paramsState.listed_date` if available, or accept that the recommended-method is "fetch + client-side date filter".
  - **Lot size** — `lot:`, `lotsize>=`, `min_lot:`, `lot_sqft:`, `lotSize:` — all dropped.
  - **Monthly payment / PITI** — `monthly:`, `monthly_payment:` — both dropped. (Maintenance + taxes filters work individually; combine those to approximate.)
  - **Listing status (other than open)** — `status:closed`, `status:contract`, `status:in_contract`, `status:incontract`, `status:open,closed`, `status:active` — all return the default `area:N|status:open` criteria, totalCount unchanged. The `/sold/`, `/in-contract/`, `/recently-sold/`, `/closings/`, `/foreclosed/`, `/new-developments/` paths emit 301 redirects to themselves (apparent http↔https cycle) and don't render a results page through `cloud fetch` — non-`open` status flows are out of reach via this method.
- **`type:` requires Zillow-internal property-type codes**, not friendly names. Confirmed: `D1` = condo, `P1` = co-op (back-derived from path slug → criteria echo: `/condos/manhattan/...` → `type:D1`; `/coops/manhattan/...` → `type:P1`). `type:condo`, `type:condo,coop`, `type:CO`, `type:CONDO`, `type:1`, `type:1,2` all return `tot=0`. Multi-type works with codes: `type:D1,P1`. Townhouse, multi-family, and condop did not surface their codes in this run — use the path-prefix variants `/townhouses/{area}/`, `/multi-family-homes/{area}/`, `/condops/{area}/` (each 301s on cloud fetch — investigation incomplete; treat these property types as best-effort and verify on integration).
- **Amenity codes are a fixed lowercase enum.** Working: `doorman, gym, laundry, parking, elevator, pool, fireplace, dishwasher, washer_dryer, central_ac, smoke_free, storage` (last echoes back as `STORAGE_SPACE`). NOT working: `pets, cats, dogs, pets_friendly, view, cityview, fios, bike_room, concierge, full_service, hardwood, hardwood_floors, washer, balcony, terrace, garden, waterfront, garage, roofdeck, pre_war, new_construction, penthouse, loft` (loft is echoed but returns `tot=0` — likely not a real amenity, possibly a property attribute). Multi-amenity is AND-logic, comma-separated: `amenities:doorman,gym,pool`.
- **`sqft:` vs `sqft>=`** — both work, but only the colon-range form echoes into `paramsState.searchParams.sqft`. Use `sqft:MIN-` (open upper bound) for consistency.
- **Area slug 404s.** `harlem` and `morningside-heights` return 404 on `/for-sale/{slug}/status:open` — likely require `central-harlem` or a non-obvious slug variant. When a slug 404s, fall back to `area:NNN` numeric form if you've previously discovered the ID for that name. `area:upper-east-side` (string) is silently dropped and falls back to `area:1` (NYC-wide) — always use either the path-slug form OR `area:NNN` integer, never a string after `area:`.
- **Sort is not URL-controllable.** `?orderBy=Listed_DESC`, `?sort=newest`, `sort:listed_desc`, path-form `/sort:price_asc`, and `/order:newest` were all probed — `sorting.attribute` in the RSC payload stays `"RECOMMENDED"` regardless. The dropdown on the rendered page is a client-side `useState` that does not propagate to the URL. **Sort client-side** by `additionalProperty[Price]` (numeric) or `floorSize.value` after parsing.
- **`?page=N` is the only working pagination key.** `?p=N` and `?currentPage=N` are silently ignored (currentPage stays 1, listings stay the same). `/page-N` and `/page:N` path forms 404. Pages render up to 38 listings (29 organic + sponsored); the `paramsState.perPage` always reports 29 — use `pageInfo.hasNextPage` as the loop terminator, not a perPage × N calculation.
- **Cookies set on first fetch are harmless.** `Set-Cookie: srp=v2; srpUserId=…; _se_t=…` lands on every response — none of these are required for subsequent fetches. Don't bother managing a cookie jar.
- **Open-house JSON-LD is a separate block.** The HTML also embeds JSON-LD `Event` schema for listings with upcoming open houses (`@type: "Event"`, `name: "Sale open house at …"`, `offers.price`, `doorTime`, `startDate`). These are a subset of the `Apartment` blocks and should not be confused with the listing-extraction path — parse `Apartment` for canonical listings and treat `Event` only as a side-channel for open-house schedule data.
- **Image URLs are Zillow-hosted CDN paths.** `image[].url` resolves to `photos.zillowstatic.com/fp/{hash}-p_e.webp`. The same hash is reused at multiple sizes (`p_a`, `p_e`, `p_h`, etc.). The `Apartment` block typically lists 5 images per listing.

## Expected Output

Two outcome shapes — success (one or more listings matched) and zero-results.

```json
// Success — one or more listings matched the filter
{
  "success": true,
  "filter_url": "https://streeteasy.com/for-sale/manhattan/amenities:doorman%7Csqft:800%7Cyear_built:1990-2025%7Cprice:750000-2000000%7Cbeds%3E=2%7Cbaths%3E=1",
  "criteria": "area:100|baths>=1|beds>=2|price:750000-2000000|status:open",
  "search_params": {
    "areas": [100],
    "amenities": ["DOORMAN"],
    "sqft": { "lowerBound": 800, "upperBound": null },
    "yearBuilt": { "lowerBound": 1990, "upperBound": 2025 },
    "price": { "lowerBound": 750000, "upperBound": 2000000 },
    "bedrooms": { "lowerBound": 2, "upperBound": null },
    "bathrooms": { "lowerBound": 1, "upperBound": null }
  },
  "total_count": 258,
  "total_pages": 9,
  "current_page": 1,
  "per_page": 29,
  "listings": [
    {
      "url": "https://streeteasy.com/building/claremont-hall/22e",
      "name": "100 Claremont Avenue #22E",
      "street_address": "100 Claremont Avenue",
      "neighborhood": "Morningside Heights",
      "region": "NY",
      "postal_code": "10027",
      "lat": 40.8114,
      "lon": -73.9621,
      "beds": 2,
      "baths_total": 2,
      "baths_full": 2,
      "baths_partial": 0,
      "sqft": 1090,
      "price": 1585000,
      "price_display": "$1,585,000",
      "building_type": "CONDO",
      "image_urls": ["https://photos.zillowstatic.com/fp/.../p_e.webp", "..."]
    }
  ]
}

// Zero-results — filter was valid but matched nothing
{
  "success": true,
  "filter_url": "...",
  "criteria": "...",
  "search_params": { ... },
  "total_count": 0,
  "total_pages": 0,
  "current_page": 1,
  "per_page": 29,
  "listings": []
}

// Anti-bot wall hit via browser fallback only
{
  "success": false,
  "reason": "perimeterx_block",
  "page_title": "Access to this page has been denied",
  "vendor": "HUMAN / PerimeterX press-and-hold challenge",
  "remediation": "Use `browse cloud fetch <url>` instead — the headless HTTP path bypasses the wall."
}
```

**Days-on-market and lot-size are NOT in the per-listing schema above** because they are not exposed in either the JSON-LD `Apartment` block or the inline RSC. Skill consumers who need DOM/lot filtering will need to either (a) navigate to each individual listing detail page (3-5 extra fetches per listing) and parse the per-listing detail HTML — out of scope for this list-extraction skill — or (b) accept best-effort approximate filtering on `paramsState`-visible dimensions only.
