---
name: tesla-com-find-lowest-used-car-price-nidwyt
title: Find Lowest-Priced Used Tesla Near a ZIP
description: >-
  Given a ZIP code, search distance in miles, and a model filter (m3/my/ms/mx),
  return the lowest-priced used Tesla within range — price, year, trim,
  odometer, location, VIN, and listing URL.
website: tesla.com
category: automotive
tags:
  - automotive
  - tesla
  - used-cars
  - inventory
  - pricing
  - akamai
  - read-only
source: 'browserbase: agent-runtime 2026-08-18'
updated: '2026-08-18'
recommended_method: hybrid
alternative_methods:
  - method: api
    rationale: >-
      The data comes from /inventory/api/v4/inventory-results, but a cookieless
      call is Akamai-429'd. It only returns 200 when issued from inside a warmed
      stealth browser session (page-context fetch), so it is a browser+API
      hybrid rather than a standalone API skill.
  - method: browser
    rationale: >-
      The warmed inventory page renders the price-sorted grid; with
      arrangeby=plh the first card is the cheapest. Slower and needs the on-page
      location control to set the ZIP (lat/lng can't be set via URL); use only
      if the API call is unavailable.
verified: true
proxies: true
---
# Find Lowest-Priced Used Tesla Near a ZIP

## Purpose

Given a ZIP code, a search distance in miles, and a used-car filter (the Tesla model — `m3`, `my`, `ms`, `mx`), return the **lowest-priced used Tesla within that radius**: its price, year, trim, odometer, location, VIN, a link to the listing, and the total number of matching cars in range. Read-only — never configures an order, reserves, or purchases.

The Tesla used-inventory web UI is a thin client over a public JSON API (`/inventory/api/v4/inventory-results`). The recommended method calls that API directly from inside a stealth browser session (so Akamai's `_abck` cookie is present) — one HTTP round-trip returns the fully-sorted result set. A pure browser-DOM fallback is documented at the end.

## When to Use

- "What's the cheapest used Model 3 within 200 miles of 90210?"
- Monitoring the floor price of used Tesla inventory for a metro area over time.
- Comparing the lowest available price across models (`m3` vs `my` vs `ms` vs `mx`) for one location.
- Any flow that needs the cheapest in-range used Tesla without going through the order/reserve UI.

## Workflow

**Anti-bot reality:** `tesla.com` sits behind Akamai. A cookieless request to the inventory API returns **HTTP 429** (`Server: AkamaiGHost`), and the homepage probe returns 403. You must first load a Tesla page in a **stealth Browserbase session (`--verified --proxies`)** to obtain the `_abck` cookie, then issue the API call **from page context** so that cookie is attached. From a warmed session the API returns HTTP 200.

**Geo-scoping reality (critical):** the API scopes results by **`lat`/`lng`**, not by the bare `zip`. Sending only `zip`+`range` is silently ignored — results fall back to the *session-IP* location (with residential proxies this is wherever the proxy egresses, e.g. an Oregon ZIP), and `range` is treated as `0`. You must geocode the ZIP to `lat`/`lng`/state yourself and pass them in the query. Once `lat`/`lng`/`region` are present, `range` filters correctly (verified: San Diego, ~120 mi from 90210, appears at `range:200` but not at `range:100`).

### 1. Open a stealth session and warm Akamai

```bash
sid=$(browse cloud sessions create --keep-alive --verified --proxies \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
browse open "https://www.tesla.com/inventory/used/m3?arrangeby=plh" --remote --session "$sid"
browse wait load --remote --session "$sid"
```

`arrangeby=plh` = "price low → high". Use the target model in the path so the warmed page matches the query you'll run.

### 2. Geocode the ZIP → lat / lng / state

```bash
# From page context (avoids sandbox egress restrictions):
browse eval --remote --session "$sid" '(async()=>{
  const g = await (await fetch("https://api.zippopotam.us/us/90210")).json();
  const p = g.places[0];
  return JSON.stringify({lat:+p.latitude, lng:+p.longitude, region:p["state abbreviation"]});
})()'
# → {"lat":34.0901,"lng":-118.4065,"region":"CA"}
```

`api.zippopotam.us` is a no-key US ZIP geocoder. Any equivalent geocoder works — you only need decimal `lat`, `lng`, and the 2-letter state abbreviation.

### 3. Call the inventory API from page context

Build the query JSON, URL-encode it, and `fetch` it inside the page (so the `_abck` cookie rides along):

```bash
browse eval --remote --session "$sid" '(async()=>{
  const zip="90210", range=200, model="m3";
  const lat=34.0901, lng=-118.4065, region="CA";       // from step 2
  const q = {query:{model, condition:"used", options:{},
    arrangeby:"Price", order:"asc", market:"US", language:"en",
    "super_region":"north america", zip, range, lat, lng, region},
    offset:0, count:1, outsideOffset:0, outsideSearch:false};
  const url = "https://www.tesla.com/inventory/api/v4/inventory-results?query="
    + encodeURIComponent(JSON.stringify(q));
  const j = await (await fetch(url,{headers:{accept:"application/json"}})).json();
  const c = (j.results||[])[0] || null;
  return JSON.stringify({total:j.total_matches_found, cheapest:c});
})()'
```

Query-field meanings:
- `model` — the used-car filter: `m3` (Model 3), `my` (Model Y), `ms` (Model S), `mx` (Model X).
- `condition:"used"` — used inventory only (not `new`).
- `arrangeby:"Price"`, `order:"asc"` — cheapest first, so `results[0]` is the lowest price.
- `zip` + `range` — ZIP is cosmetic/echo; `range` (miles) is the search radius and only filters when `lat`/`lng` are also present.
- `lat`/`lng`/`region` — the real geo-scope (from step 2).
- `outsideSearch:false` — **stay within `range`.** Set `true` and it ignores the radius and returns cheapest cars nationwide (in-range ones aren't guaranteed first).
- `count` — page size. `count:1` is enough for the single cheapest car; raise it to list more.

### 4. Read the result

- `total_matches_found` — number of used cars of that model within `range`.
- `results[0]` — the lowest-priced car. Useful fields: `Price` / `TotalPrice` / `InventoryPrice` (all the listed price in USD), `Year`, `TrimName`, `Odometer` + `OdometerType`, `City`, `StateProvince`, `VIN`, `Model`.
- Listing URL: `https://www.tesla.com/{model}/order/{VIN}?titleStatus=used`.
- If `total_matches_found` is `0` / `results` is empty → no used cars of that model in range (valid result, not an error).

### 5. Release the session

```bash
browse cloud sessions update "$sid" --status REQUEST_RELEASE
```

### Browser fallback (no API)

If the API path is unavailable, the warmed inventory page itself renders the sorted results. With `arrangeby=plh` the **first result card is the cheapest**. Because `lat`/`lng` can't be set from the URL (the page geocodes the ZIP internally and resets an unrecognized URL `zip` to the session-IP location), you must set the ZIP through the on-page location control (the header button showing the current ZIP), let the grid re-render, then read the first card's price/VIN with `browse get text body` / `browse snapshot`. This is slower and needs the location UI to cooperate — prefer the API path.

## Site-Specific Gotchas

- **Cookieless API = 429.** A direct `browse cloud fetch`/curl of `/inventory/api/v4/inventory-results` returns HTTP 429 from AkamaiGHost (and sets a decoy `_abck`). You must warm a real stealth session and call from page context. Stealth `--verified --proxies` was required for the working run.
- **`lat`/`lng` drive geo-scoping, not `zip`.** Sending only `zip`+`range` is silently ignored: results default to the session-IP location and `range` collapses to `0`. Two different ZIPs with no lat/lng returned byte-identical result sets in testing. Always geocode and pass `lat`/`lng`/`region`.
- **Residential proxy skews the IP fallback.** With `--proxies` on, the "default" location is the proxy's egress ZIP (observed `97818`, Oregon), not your real location — another reason to always pass explicit `lat`/`lng`.
- **URL `zip`/`range` params don't stick.** Navigating to `.../used/m3?zip=90210&range=200` gets rewritten to `?zip=<proxy-ip-zip>&range=0` after load. The URL is not a reliable way to set location; use the API query fields (or the on-page location control for the fallback).
- **`outsideSearch:true` ignores the radius.** It returns the cheapest cars nationwide and does not guarantee in-range cars sort first (e.g. a Baltimore car appeared above San Diego for a 90210 search). Use `outsideSearch:false` for a true "within X miles" answer.
- **Top-level count key is `total_matches_found`** (not `total_matches` / `total`).
- **Price fields.** `Price`, `TotalPrice`, and `InventoryPrice` were all equal in observed used listings (the listed sale price, before fees/taxes/destination). `PurchasePrice` may add fees. Use `TotalPrice` for the headline number.
- **Model codes:** `m3`=Model 3, `my`=Model Y, `ms`=Model S, `mx`=Model X. Path segment and query `model` use the same code.
- **Empty result is legitimate.** Rare/expensive models in a small radius (e.g. used Model S within 50 mi of 94043) return `total_matches_found:0`. Report `lowest_price: null`, not an error.
- **API version.** `v4` is current (`/inventory/api/v4/inventory-results`). Older docs reference `v1`/`v3`; if `v4` 404s, the query-JSON shape is otherwise compatible across versions.

## Expected Output

```json
// Matches found — the lowest-priced used car in range
{
  "success": true,
  "zip": "90210",
  "distance_miles": 200,
  "model": "m3",
  "total_matches": 63,
  "lowest_price": 23500,
  "currency": "USD",
  "vehicle": {
    "year": 2020,
    "trim": "Long Range All-Wheel Drive",
    "odometer": 95548,
    "odometer_unit": "Miles",
    "city": "San Diego",
    "state": "CA",
    "vin": "5YJ3E1EB8LF647704"
  },
  "listing_url": "https://www.tesla.com/m3/order/5YJ3E1EB8LF647704?titleStatus=used",
  "error_reasoning": null
}

// No used cars of that model within range (valid, not an error)
{
  "success": true,
  "zip": "94043",
  "distance_miles": 50,
  "model": "ms",
  "total_matches": 0,
  "lowest_price": null,
  "vehicle": null,
  "listing_url": null,
  "error_reasoning": null
}

// Blocked / failed (e.g. Akamai 429 from a non-warmed session)
{
  "success": false,
  "zip": "90210",
  "distance_miles": 200,
  "model": "m3",
  "error_reasoning": "Inventory API returned 429 (AkamaiGHost) — session was not warmed with a Tesla page load / stealth flags."
}
```
