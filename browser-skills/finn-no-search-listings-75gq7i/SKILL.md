---
name: finn-no-search-listings-75gq7i
title: FINN.no Real Estate Search
description: >-
  Search FINN.no real estate (homes for sale, rentals, holiday homes, plots, new
  builds, commercial) by location, free text, price, area, and bedrooms,
  returning structured listings plus total counts and pagination via the React
  Router single-fetch .data endpoint.
website: finn.no
category: real-estate
tags:
  - real-estate
  - listings
  - search
  - norway
  - finn
  - property
  - read-only
source: 'browserbase: agent-runtime 2026-06-03'
updated: '2026-06-03'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      Fallback when the .html.data single-fetch endpoint is blocked or changes
      shape. Drives the human search page, dismisses the Sourcepoint
      cookie-consent modal, and parses listings from the SSR DOM. ~100x more
      expensive than the fetch path (a DOM-walking browser run cost $4.59 / 27
      turns in testing).
  - method: api
    rationale: >-
      No longer available — the legacy https://www.finn.no/api/search-qf JSON
      API returns HTTP 404. Confirmed dead; do not use.
verified: false
proxies: false
---
# FINN.no Real Estate Search

## Purpose

Search the real estate (Eiendom) section of FINN.no — Norway's dominant property marketplace — and return structured listings: heading, asking/total price (NOK), address, living area (m²), bedrooms, property type, broker, coordinates, viewing dates, and the canonical ad URL, plus the total result count and pagination metadata. Works across every real-estate subvertical (homes for sale, rentals, holiday homes, plots, new builds, commercial). **Read-only** — it only reads search results; it never logs in, contacts a broker, or saves a search.

## When to Use

- Monitoring new homes-for-sale or rental listings in a Norwegian municipality/city.
- Bulk extraction of listings matching price / size / bedroom / property-type filters.
- Pulling structured fields (price, area, coordinates, broker) you would otherwise scrape from rendered HTML.
- Comparing inventory counts ("how many homes for sale in Oslo under 5M NOK").

## Workflow

FINN's real-estate search pages are server-rendered with React Router v7 single-fetch. **There is no public JSON search API anymore** — the old `https://www.finn.no/api/search-qf?...` endpoint now returns `404` (verified). Instead, every search route exposes a **single-fetch data endpoint**: append `.data` to the `search.html` path and you get the route loader's serialized data (`Content-Type: text/x-script`, ~230 KB) containing the full result set and facets — no browser, no JS execution, no XHR. This is ~100× cheaper than driving the page (a browser run that reads listings one DOM node at a time burned 1.5M input tokens / $4.59 / 27 turns in testing). **Lead with the `.data` fetch; the browser path is a fallback only.**

### 1. Build the search URL

```
https://www.finn.no/realestate/{subvertical}/search.html.data?{params}
```

**Subverticals** (each maps to a `SEARCH_ID_REALESTATE_*` search key, set automatically by the path):

| Path segment | Listings | search_key |
|---|---|---|
| `homes` | Homes for sale (Bolig til salgs) | `SEARCH_ID_REALESTATE_HOMES` |
| `lettings` | Rentals (Bolig til leie) | `SEARCH_ID_REALESTATE_LETTINGS` |
| `leisuresale` | Holiday homes for sale (Fritidsbolig) | `SEARCH_ID_REALESTATE_LEISURESALE` |
| `plots` | Residential plots (Boligtomter) | `SEARCH_ID_REALESTATE_PLOTS` |
| `leisureplots` | Holiday plots | `SEARCH_ID_REALESTATE_LEISUREPLOTS` |
| `newbuildings` | New-build projects | `SEARCH_ID_REALESTATE_DEVELOPMENT` |
| `abroad` | Property abroad | `SEARCH_ID_REALESTATE_ABROAD` |
| `businesssale` / `businessrent` / `businessplots` / `companyforsale` | Commercial | — |

**Common query params** (all optional; omit to search nationwide):

- `location` — FINN geo code (see gotcha for the hierarchy). Oslo = `0.20061`. Repeatable to OR multiple areas.
- `q` — free-text query. Accepts a place name too (`q=bergen`) when you don't have a location code.
- `sort` — `PUBLISHED_DESC` (newest), `PRICE_ASC`/`PRICE_DESC` (total price), `PRICE_ASKING_ASC`/`PRICE_ASKING_DESC` (asking price), `AREA_PROM_ASC`/`AREA_PROM_DESC` (area), `PRICE_SQM_ASC`/`PRICE_SQM_DESC` (price/m²), `RELEVANCE`, `CLOSEST`.
- `page` — 1-based page number (50 listings/page; see paging gotcha).
- `price_from` / `price_to` — asking price (prisantydning), NOK.
- `price_collective_from` / `price_collective_to` — total price incl. shared debt (totalpris), NOK.
- `area_from` / `area_to` — living area, m².
- `min_bedrooms` — minimum bedrooms.
- `property_type` — boligtype code (e.g. enebolig, leilighet — discover exact codes from the `property_type` facet in `results.filters`).
- `ownership_type`, `construction_year_from`/`_to`, `energy_label`, `facilities`, `published`, `is_private_broker` — see the full facet list in `results.filters`.

### 2. Fetch the endpoint

A bare datacenter request returns `200` with the full payload (no anti-bot block was observed). A residential proxy is **not required** but is recommended for sustained / bulk pulls (rate-limit hygiene — see gotchas). Send a normal browser `User-Agent`.

```bash
browse cloud fetch "https://www.finn.no/realestate/homes/search.html.data?location=0.20061&sort=PUBLISHED_DESC"
# add --proxies for bulk/sustained use
```

### 3. Rehydrate the turbo-stream payload

The body is a single JSON **array** in React Router's deduplicated single-fetch encoding. Objects are stored as `{"_<keyIdx>": <valueIdx>}` where both numbers are indices into the top-level array (`arr[keyIdx]` is the key string, `arr[valueIdx]` is the value, resolved recursively). Rehydrate it:

```js
const arr = JSON.parse(body);                 // top-level array
const cache = new Map();
function hyd(idx, d = 0) {
  if (d > 60) return null;
  if (cache.has(idx)) return cache.get(idx);
  const v = arr[idx]; let o;
  if (v === null || typeof v !== "object") o = v;
  else if (Array.isArray(v)) { o = []; cache.set(idx, o); for (const e of v) o.push(typeof e === "number" ? hyd(e, d + 1) : e); }
  else { o = {}; cache.set(idx, o); for (const k in v) o[arr[+k.slice(1)]] = hyd(v[k], d + 1); }
  cache.set(idx, o); return o;
}
const root = hyd(0);
// Find the results node generically (survives route-key changes):
let results = null;
(function w(o){ if (results||!o||typeof o!=="object") return;
  if (Array.isArray(o.docs) && o.metadata) { results = o; return; }
  for (const k in o) w(o[k]); })(root);
```

### 4. Read results + metadata

- `results.metadata.result_size.match_count` — total matching ads.
- `results.metadata.result_size.group_count` — count after grouping multi-unit/project ads (this is the number FINN shows as "X treff").
- `results.metadata.paging.current` / `results.metadata.paging.last` — current and last page.
- `results.metadata.num_results` — listings on this page (≤ 50).
- `results.metadata.selected_filters` — echoes the applied filters with human display names (good for confirming your params parsed).
- `results.filters` — every available facet, including the `location` facet tree (use it to discover geo codes) and `property_type`/`sort` codes.
- `results.docs[]` — the listings. Per-doc fields: `id`/`ad_id` (the finnkode), `heading`, `location` (address string), `price_suggestion.amount` (asking), `price_total.amount` (total), `price_shared_cost.amount` (monthly shared cost), `area_range.size_from`/`size_to` (m²), `area_plot.size`, `number_of_bedrooms`, `property_type_description`, `owner_type_description`, `organisation_name` (broker), `local_area_name`, `coordinates`, `timestamp` (ms epoch), `viewing_times[]`, `image_urls`, `canonical_url`.

### 5. Paginate

Add `&page=N` (1-based) and re-fetch until `page > results.metadata.paging.last`. Each page = up to 50 docs.

### Browser fallback

If the `.data` endpoint is ever blocked or changes shape, drive the human page (a verified + residential-proxy session is the safe default for the browser path):

1. `browse open "https://www.finn.no/realestate/homes/search.html?location=0.20061&sort=PUBLISHED_DESC"` then `browse wait load`.
2. **Dismiss the cookie-consent modal** — a Sourcepoint dialog ("Cookieinnstillinger") in a `cmpv2.finn.no` iframe overlays the results. Click **"Godta alle"** (Accept all). The accompanying `playwright.ts` does this and falls back to coordinate-clicking the button if the iframe ref isn't resolvable.
3. Wait for `article` elements / `a[href*="finnkode"]`, then read the total from the `"… treff"` heading and parse each `<article>`: `a[href*="finnkode"]` → finnkode + URL, `h2` → heading, and the price/area/address text nodes.
4. **Do not** set up network interception expecting a search XHR — the first page is fully SSR; no JSON search request fires. Pagination/filter changes re-navigate (they hit the same `.data` route under the hood).

## Site-Specific Gotchas

- **Crawling is contractually prohibited; search pages are explicitly allow-listed.** `robots.txt` opens with "Crawling FINN.no is prohibited unless you have written permission" but then `Allow:`s `/realestate/{homes,lettings,leisuresale,abroad,newbuildings,plots,leisureplots,businesssale,businessrent,businessplots,companyforsale}/search.html`. Keep volume low and human-paced; this skill is for targeted lookups, not site-wide harvesting.
- **The legacy `/api/search-qf` JSON API is dead.** `https://www.finn.no/api/search-qf?searchkey=SEARCH_ID_REALESTATE_HOMES&...` returns HTTP `404` (verified, both with and without proxies). Don't waste time on it — use the `.html.data` single-fetch endpoint instead.
- **`.data` payload is dedup-encoded, not plain JSON objects.** It's a flat array with `{"_keyIdx": valIdx}` index references; naïvely `JSON.parse`-ing and reading `.results.docs` fails — you must rehydrate (step 3). Adjacent array slots store key-string then value, so as a quick-and-dirty fallback you can also scan for `"canonical_url"`, `"heading"`, `"amount"` and take the following slot.
- **The route key embeds Remix file paths and can change.** Listings live at `root["routes/realestate+/_search+/$subvertical.search[.html]"].data.results` today — do **not** hardcode that path. Walk the rehydrated tree for the first object that has both `docs` (array) and `metadata` (step 3's `w()` function).
- **`match_count` ≠ "treff" shown on the page.** The UI count is `group_count` (multi-unit buildings and new-build projects collapse into one group). `match_count` is the raw ad count and is larger. Report whichever the caller wants, but know the difference.
- **Pagination caps at 50 pages (`paging.last` ≤ 50) = 2,500 listings max reachable.** A search with `match_count` 5,483 still only paginates to page 50. To reach everything, split the query with tighter filters (price bands, sub-area location codes, `published`).
- **Location codes are a hierarchy, not free-form.** `0.<county>` = a fylke (e.g. Oslo `0.20061`, Akershus `0.20003`, Agder `0.22042`); `1.<county>.<municipality>` = a kommune (e.g. Kristiansand `1.22042.20179`); `2.<county>.<municipality>.<district>` = a bydel/district (e.g. Kristiansand Sentrum `2.22042.20179.20536`). **Discover codes for free** from any response's `results.filters` → the `location` facet is the full nested tree with `display_name` + `value` + `hits`. If you don't have a code, `q=<place name>` free-text works (e.g. `q=bergen`).
- **`price` vs `price_collective`.** `price`/`price_suggestion` = asking price (prisantydning); `price_collective`/`price_total` = total incl. shared debt/fellesgjeld. Filter with `price_from/_to` vs `price_collective_from/_to` accordingly. For co-op (Aksje/Borettslag) units these differ a lot.
- **Browser path has a cookie-consent wall.** A Sourcepoint CMP modal ("Cookieinnstillinger", served from the `cmpv2.finn.no` cross-origin iframe) overlays the rendered results on first load. Click **"Godta alle"**; the iframe means a plain ref-click may miss it — coordinate-click the button as a fallback. The `.data` fetch path is unaffected (no consent gate).
- **No anti-bot block observed on the fetch path.** Bare datacenter `browse cloud fetch` of `.html.data` returned `200` with the full payload. Residential proxies are optional; add `--proxies` only for bulk/sustained pulls to stay polite. The interactive page loaded cleanly under a `--verified --proxies` session.
- **Norwegian field values.** `property_type_description`, `owner_type_description`, labels, and headings are in Norwegian (Bokmål): e.g. `Leilighet` (apartment), `Enebolig` (detached house), `Aksje`/`Borettslag` (share/co-op), `Eier (Selveier)` (freehold). Don't translate the search params — they're codes — but expect Norwegian text in the output.

## Expected Output

```json
{
  "success": true,
  "subvertical": "homes",
  "search_key": "SEARCH_ID_REALESTATE_HOMES",
  "search_url": "https://www.finn.no/realestate/homes/search.html.data?location=0.20061&sort=PUBLISHED_DESC",
  "title": "Oslo",
  "total_match_count": 5483,
  "total_group_count": 3860,
  "page": 1,
  "last_page": 50,
  "num_results": 50,
  "listings": [
    {
      "finnkode": 463670034,
      "heading": "Lys og fin 2-roms på Kampen med solrik balkong | Fyring og v.vann inkl.",
      "location": "Hølandsgata 1A, Oslo",
      "local_area_name": "IDYLLISKE KAMPEN",
      "price_suggestion_nok": 4600000,
      "price_total_nok": 4933976,
      "price_shared_cost_nok": 5069,
      "area_m2": 55,
      "plot_area_m2": 2177,
      "bedrooms": 1,
      "property_type": "Leilighet",
      "owner_type": "Aksje",
      "broker": "Emera eiendomsmegling",
      "coordinates": { "lat": 59.91, "lon": 10.78 },
      "viewing_times": ["2026-06-10T15:00:00.000+00:00"],
      "published_epoch_ms": 1780500115000,
      "url": "https://www.finn.no/realestate/homes/ad.html?finnkode=463670034"
    }
  ],
  "error_reasoning": null
}
```

Other outcome shapes:

```json
// Empty / over-filtered search (valid, not an error)
{ "success": true, "total_match_count": 0, "total_group_count": 0, "num_results": 0, "listings": [], "error_reasoning": null }

// Unknown subvertical or malformed path
{ "success": false, "listings": [], "error_reasoning": "Endpoint returned 404 — check the {subvertical} path segment." }

// Payload shape changed (no results node found after rehydration)
{ "success": false, "listings": [], "error_reasoning": "Could not locate results node (docs+metadata) in rehydrated payload; fall back to browser path." }
```
