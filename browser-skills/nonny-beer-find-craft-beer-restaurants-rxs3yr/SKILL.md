---
name: nonny-beer-find-craft-beer-restaurants-rxs3yr
title: Find Craft Non-Alcoholic Beer Restaurants
description: >-
  Find bars and restaurants serving Nonny craft non-alcoholic beer near a given
  latitude/longitude, returning name, address, distance, phone, and website per
  result. Sorted by distance, category-filtered to Bars/Restaurants only.
website: nonny.beer
category: food-and-drink
tags:
  - restaurants
  - non-alcoholic
  - beer
  - store-locator
  - stockist
  - nonny
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      The find-us page at us.nonny.beer/pages/find-us reproduces the same data
      via the embedded Stockist widget, which geocodes user-typed addresses
      client-side via Google Maps and then calls the same Stockist API. Use only
      when direct API access fails — it costs ~5-10× more turns than the single
      HTTP GET.
  - method: url-param
    rationale: >-
      Not applicable. The find-us page does not accept lat/lng or query params
      in its URL — search state is owned entirely by the Stockist widget's JS
      runtime.
verified: true
proxies: true
---
# Find Craft Non-Alcoholic Beer Restaurants

## Purpose

Given a latitude/longitude (and optional radius), return the list of bars and restaurants near that point that serve Nonny — a Canadian craft non-alcoholic beer brand — sorted by distance. Each result includes name, full address, distance, phone (when listed), and website (when listed). The skill exposes the same data that powers the public store-locator at `https://us.nonny.beer/pages/find-us`. Read-only; never submits any form on the site.

## When to Use

- A user asks "where can I drink Nonny (or craft NA beer) near me / in {city}".
- An agent comparing NA-beer-on-tap availability across a metro.
- Any flow that needs Nonny's bar/restaurant footprint by city — the JSON API is faster, cheaper, and more reliably structured than scraping the Shopify+Stockist storefront.
- Cross-checking whether a specific restaurant carries Nonny (its `name` will appear in the response near that lat/lng).

## Workflow

The find-us page is a thin Shopify wrapper over the **Stockist.co** store-locator widget (Nonny's widget tag is `u10642`, hard-coded in the page HTML at `<stockist-store-locator data-stockist-widget-tag="u10642">`). The widget's runtime hits a public, unauthenticated JSON API at `https://stockist.co/api/v1/u10642/locations/search`. **Hit the API directly** — no cookies, session, stealth, or proxies required (validated unauthenticated, no-proxy, from a non-residential IP).

### 1. Geocode the user's location to lat/lng

The Stockist API does **not** accept address strings (an `address=` param returns 0 results — confirmed). The caller must supply numeric latitude and longitude. Use any geocoder (Google Geocoding, Nominatim, Mapbox, the LLM's own knowledge of metro centroids, etc.) to convert "San Francisco", "Vancouver, BC", a postal code, or a user-supplied address into a (lat, lng) pair.

Reference centroids known to return good results during validation:
- Vancouver, BC: `49.2827, -123.1207` → 170 bars/restaurants within 100 km
- Seattle, WA: `47.6062, -122.3321` → 205 bars/restaurants within 500 km
- San Francisco, CA: `37.7749, -122.4194` → sparse (1 within 50 km — "The New Bar")
- Portland, OR: `45.5239, -122.6760` (the widget's default map center)
- Toronto, ON: `43.6532, -79.3832` → 6 bars/restaurants within 500 km
- New York, NY: `40.7128, -74.0060` → 1 bar/restaurant within 500 km

Nonny's footprint is **dense in BC and the US Pacific Northwest, sparse east of the Rockies**. Set caller expectations accordingly.

### 2. Call the Stockist locations/search API

```
GET https://stockist.co/api/v1/u10642/locations/search
    ?latitude={lat}
    &longitude={lon}
    &distance={radius_km}     # optional; default behaviour caps at 500 locations total
```

Response is `application/json` shaped:
```json
{
  "locations": [
    {
      "id": 125224191,
      "name": "The New Bar",
      "latitude": "37.79696193",
      "longitude": "-122.43502006",
      "address_line_1": "2181 Union Street",
      "address_line_2": "UNIT A",
      "city": "San Francisco",
      "state": "CA",
      "postal_code": "94123",
      "country": "United States",
      "phone": "",
      "website": "https://thenewbar.com/",
      "email": "",
      "description": "",
      "filters": [{ "id": 11202, "name": "Bars / Restaurants", "position": 1 }],
      "custom_fields": [],
      "distance": 2.8,
      "distance_units": "km"
    }
  ]
}
```

Pre-sorted by ascending `distance`. No auth, no headers, no `Referer` needed. No rate limits observed during testing.

### 3. Filter client-side to Bars / Restaurants

The response includes **four** kinds of stockists, identified by the `filters[].id` (or `filters[].name`):

| filter.id | filter.name           | Meaning                                 |
|-----------|-----------------------|-----------------------------------------|
| 11202     | `Bars / Restaurants`  | The bucket this skill cares about.      |
| 11203     | `Grocery`             | Grocers carrying Nonny on-shelf.        |
| 11675     | `Liquor Store`        | Liquor / bottle shops.                  |
| 14651     | `Online`              | E-commerce-only stockists.              |

Server-side filtering by `tag=`, `tag_filter=`, or `filter[]=` is **silently ignored** — the server returns the unfiltered set regardless. Always filter in your own code:

```js
const bars = data.locations.filter(loc =>
  loc.filters.some(f => f.id === 11202)
  // or: f.name === "Bars / Restaurants"
);
```

A single location can carry multiple filters (e.g. "The American" in Vancouver is both `Bars / Restaurants` and `Grocery`) — use `.some()`, not strict equality on the array.

### 4. Project the fields you need

For the task ("best restaurants in my area with craft NA beer"), the useful subset per result:
- `name`
- `address_line_1`, `address_line_2`, `city`, `state`, `postal_code`, `country` (concatenate for a display address)
- `latitude`, `longitude` (for mapping / re-distancing)
- `distance` + `distance_units` (always reported as `km`, even when you pass `units=mi`)
- `phone`, `website`, `email` — frequently empty strings; treat as optional
- `filters[]` — useful if you want to flag dual-category venues ("also sells bottles to-go")

"Best" is not represented in the Stockist payload — there is no rating, review, or priority score that varies between bars (`priority: 0` for every Bars/Restaurants entry observed). If the caller wants ranking beyond distance, layer in a secondary signal (Google Places rating, Yelp stars, etc.) keyed by `name + address` or `(latitude, longitude)`. Without that, **sort by `distance` ascending and return the top N** as a reasonable proxy for "closest = best".

### Browser fallback

When the Stockist API is unreachable (network egress restrictions, an outage), the user-facing UI at `https://us.nonny.beer/pages/find-us` reproduces the same data via the embedded widget:

1. `browse open https://us.nonny.beer/pages/find-us --remote` — no stealth or proxies required; the Shopify host is Cloudflare-fronted and tolerant.
2. `browse wait timeout 4000` — the Stockist widget mounts asynchronously after page load.
3. `browse click` the "Bars / Restaurants" checkbox (accessibility label `Bars / Restaurants`, near top of the locator region).
4. `browse fill` the search combobox (placeholder `Type a postcode or address...`) with the user's city or postal code and `browse press Enter`.
5. The widget geocodes the input *client-side* via Google Maps, then hits the same Stockist API. Read `browse get text "[role='region'][aria-label='Store locator results']"` — it returns a `131 results found...` summary plus a flat list of `Name / distance / address / website / filters / Directions / View on map` per result.
6. For the Canadian storefront (`nonny.beer/en-ca/pages/find-us`) the same widget tag (`u10642`) backs the locator — no difference in data, just locale chrome.

The browser path costs ~5-10 turns vs. the API's single HTTP GET. Use it only when the API path actually fails.

## Site-Specific Gotchas

- **Widget tag `u10642` is the only Nonny-specific identifier.** It is embedded in the page HTML and is part of every API URL. There is no auth key, project id, or token to manage.
- **`address=` parameter does NOT geocode.** Sending `address=San+Francisco` returns `{"locations":[]}`. The widget geocodes client-side via Google Maps before hitting the API. You must geocode out-of-band.
- **Server-side category filters are silently dropped.** `tag=11202`, `tag_filter=11202`, `filter[]=11202` all return the unfiltered set. Always filter client-side on `filters[].id` or `filters[].name`.
- **Unfiltered `/locations/search?latitude=…&longitude=…` (no `distance`) caps at 500 results.** Pass `distance={km}` when you want a known radius; pass a large value (e.g. `distance=500`) when sweeping a sparse metro.
- **`distance_units` always reports `km` regardless of input.** Passing `units=mi` *does* narrow the radius input proportionally, but the response numbers and the label remain kilometres. Do unit conversion client-side if your UI shows miles.
- **Coverage is regional.** Nonny is BC-based; the database is densest in BC + the US Pacific Northwest. Major US East-Coast and Central metros (NYC, Boston, Chicago, Atlanta, Toronto) return single-digit counts within 500 km radii. If a caller asks for a sparse metro, return what's there and surface a note — don't infer the API is broken.
- **`priority` is always `0` for Bars / Restaurants entries observed.** There is no merchant-supplied ranking signal — distance-ordering is the only built-in sort.
- **One location can carry multiple filter buckets.** E.g. "The American" (Vancouver, 926 Main St) carries both `Bars / Restaurants` AND `Grocery`. Use `.some()` membership tests, not strict scalar equality, when filtering.
- **Storefront is Shopify behind Cloudflare.** `nonny.beer` (bare) 302-redirects to a localised subdomain — `us.nonny.beer` for US visitors, `nonny.beer/en-ca/...` for Canadian. The Stockist widget is identical on both; you do not need to pick the "right" storefront to get the right data.
- **No `Referer` header gating.** The Stockist API accepts requests with no `Referer` and no `Origin` — works from `curl`, the sandbox proxy fetch, or any HTTP client. Don't bother spoofing browser headers.
- **Duplicate entries exist.** Several restaurants appear twice in the same metro under slightly different name spellings (e.g. "Tacofino Yaletown" and "Tacofino - Yaletown"). De-dupe on `(name.toLowerCase().replace(/[\W_]+/g,''), address_line_1.toLowerCase())` if you need a clean set.
- **`custom_fields` is always `[]`** on this widget tag — no extra structured metadata to project.
- **No pagination.** The API returns every match within the radius in a single response (subject to the 500 cap when no `distance` is passed).

## Expected Output

Successful call — restaurants within radius:

```json
{
  "success": true,
  "query": {
    "latitude": 49.2827,
    "longitude": -123.1207,
    "distance_km": 25,
    "filter": "Bars / Restaurants"
  },
  "result_count": 131,
  "restaurants": [
    {
      "name": "Rogue Kitchen & Wetbar",
      "address": "602 W Broadway, Vancouver, BC V5Z 1G2, Canada",
      "address_components": {
        "line1": "602 W Broadway",
        "line2": "",
        "city": "Vancouver",
        "state": "BC",
        "postal_code": "V5Z 1G2",
        "country": "Canada"
      },
      "latitude": 49.262,
      "longitude": -123.117,
      "distance_km": 0.7,
      "phone": "",
      "website": "",
      "filters": ["Bars / Restaurants"],
      "stockist_id": 125224191
    },
    {
      "name": "Cactus Club Cafe",
      "address": "575 West Broadway, Vancouver, BC V5Z 1E6, Canada",
      "address_components": {
        "line1": "575 West Broadway",
        "line2": "Broadway + Ash",
        "city": "Vancouver",
        "state": "BC",
        "postal_code": "V5Z 1E6",
        "country": "Canada"
      },
      "latitude": 49.263,
      "longitude": -123.114,
      "distance_km": 0.8,
      "phone": "",
      "website": "cactusclubcafe.com",
      "filters": ["Bars / Restaurants"],
      "stockist_id": 125223781
    }
  ]
}
```

Successful call — sparse metro with zero matches in radius:

```json
{
  "success": true,
  "query": {
    "latitude": 40.7128,
    "longitude": -74.0060,
    "distance_km": 50,
    "filter": "Bars / Restaurants"
  },
  "result_count": 0,
  "restaurants": [],
  "note": "No Nonny stockists tagged 'Bars / Restaurants' within 50 km of New York City. Nonny coverage is concentrated in British Columbia and the US Pacific Northwest. Widen the radius (try 500 km) or expect single-digit results east of the Rockies."
}
```

Failure — caller did not provide / could not geocode a location:

```json
{
  "success": false,
  "reason": "no_location",
  "error_reasoning": "Stockist API requires numeric latitude and longitude; the 'address' query parameter is silently ignored. Geocode the user's area to (lat, lng) before calling the skill."
}
```

Failure — Stockist API unreachable (network or proxy issue):

```json
{
  "success": false,
  "reason": "api_unreachable",
  "error_reasoning": "GET https://stockist.co/api/v1/u10642/locations/search returned <status/error>. Retry with backoff, or fall back to the browser flow on https://us.nonny.beer/pages/find-us."
}
```
