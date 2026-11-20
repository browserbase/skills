---
name: realtor-ca-list-properties-5d4p1l
title: REALTOR.ca List Properties
description: >-
  List MLS-listed properties on REALTOR.ca within a bounding box or named
  Canadian city, filtered by sale/rental, price range, beds, and baths. Returns
  price, address, lat/lon, beds, baths, size, photo, agent, and canonical
  listing URL. Read-only.
website: realtor.ca
category: real-estate
tags:
  - real-estate
  - listings
  - mls
  - canada
  - search
  - incapsula
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: hybrid
alternative_methods:
  - method: api
    rationale: >-
      POST api2.realtor.ca/Listing.svc/PropertySearch_Post returns up to 600
      listings per bbox in one ~90KB JSON response with all displayed fields
      plus FloorAreaMeasurements and agent metadata. Works only from inside a
      Browserbase session that has visited realtor.ca to mint Incapsula reese84
      + incap_ses_* cookies — pure curl from outside is challenge-walled. Hence
      'hybrid', not 'api'.
  - method: browser
    rationale: >-
      Fallback path: navigate to /{province}/{city}/real-estate and scrape ~11
      listing cards per page from rendered HTML. Use only when the API is
      blocked or you need rendered-DOM evidence. ~3x more turns and ~10x cost
      per listing harvested vs the API path.
verified: true
proxies: true
---
# REALTOR.ca List Properties

## Purpose

Return a list of MLS®-listed properties on REALTOR.ca within a geographic bounding box (or within a named Canadian city), filtered by transaction type (sale or rental), property type group, price range, beds, and baths. For each match, return MLS number, price, address, lat/lon, property type, beds/baths, interior size, listing photo, and the canonical detail URL on `realtor.ca`. Read-only — never contacts an agent, never books a viewing, never modifies favourites or hidden-listing state.

## When to Use

- "What's currently for sale in {city}/{neighbourhood} between $X and $Y with N+ beds?"
- Daily / hourly monitoring of new listings in a target area (sort by date-desc and dedupe by MlsNumber).
- Pulling all rental listings (`TransactionTypeId=3`) in a metro area for market analysis.
- Anywhere you'd otherwise scrape the rendered REALTOR.ca map — the JSON API is one POST per ≤600 results and exposes every field the UI shows (plus several it doesn't, like agent contact metadata and FloorAreaMeasurements).

## Workflow

REALTOR.ca's `/map` and city-listing pages are thin clients over a single POST endpoint at `api2.realtor.ca/Listing.svc/PropertySearch_Post`. The endpoint sits behind Imperva/Incapsula (`reese84`, `incap_ses_*` cookies) so a **bare curl from outside a real browser session always fails** — you need a Browserbase session that has visited `https://www.realtor.ca/` at least once to mint the challenge cookies. Once warmed, a page-context `fetch()` to the API returns up to 600 listings as JSON per call, ~90 KB, in 1–2 seconds. Lead with the API; the rendered HTML at `/{province}/{city}/real-estate` works as a fallback but only surfaces ~11 listing cards per page and costs ~3× more turns to harvest the same data.

### 1. Open a stealth + residential-proxy session

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies --region us-east-1 \
        | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>console.log(JSON.parse(d).id))')
export BROWSE_SESSION="$SID"
```

Both `--verified` and `--proxies` are **mandatory**. A bare session is served Incapsula's "Request unsuccessful" challenge HTML on the very first navigation. `us-east-1` is the cheapest region that consistently routes through a Canadian-friendly proxy pool; if you need to scope to a specific province, you can re-request with a Canadian residential IP later, but the API does not geo-restrict by source IP.

### 2. Warm the session

```bash
browse open "https://www.realtor.ca/" --remote --session "$SID"
```

A single GET to the homepage is enough — it mints `reese84`, `incap_ses_2105_*`, `GUID`, `Language=1`, `Currency=CAD`, `app_mode=1`, and the AppInsights / GA tracking cookies. **Do not skip this step.** The `PropertySearch_Post` endpoint requires the Incapsula challenge tokens to be present on the request.

### 3. Resolve city or area to a lat/lon bounding box

The API only accepts a bounding box (`LatitudeMin`, `LatitudeMax`, `LongitudeMin`, `LongitudeMax`) plus a `ZoomLevel` (1–20, controls clustering / pin granularity). There is no `city=` parameter. Use these stable bboxes for the most-requested Canadian cities (verified 2026-05-19; pick a `ZoomLevel` of 11–13 to get individual pins instead of clusters):

| City | LatitudeMin | LatitudeMax | LongitudeMin | LongitudeMax | ZoomLevel |
|---|---|---|---|---|---|
| Toronto (City of) | 43.58 | 43.85 | -79.64 | -79.12 | 11 |
| Toronto (downtown core) | 43.63 | 43.68 | -79.43 | -79.35 | 13 |
| Vancouver | 49.20 | 49.32 | -123.27 | -123.02 | 11 |
| Calgary | 50.84 | 51.18 | -114.32 | -113.86 | 11 |
| Ottawa | 45.30 | 45.50 | -75.93 | -75.55 | 11 |
| Montreal | 45.40 | 45.71 | -73.98 | -73.47 | 11 |
| Edmonton | 53.39 | 53.71 | -113.71 | -113.30 | 11 |
| Hamilton | 43.20 | 43.30 | -80.00 | -79.75 | 12 |
| Mississauga | 43.50 | 43.65 | -79.78 | -79.55 | 12 |
| Oakville | 43.40 | 43.52 | -79.78 | -79.60 | 12 |

For arbitrary cities or neighbourhoods, do not try the `api2.realtor.ca/Search.svc/AutoSuggest` endpoint from page-context — it 0-status fails on CORS because the bundled XHR client adds custom headers that get pre-flighted (see Gotchas). Instead, navigate to `https://www.realtor.ca/{province-code}/{city-slug}/real-estate` (e.g., `/on/toronto/real-estate`, `/bc/vancouver/real-estate`, `/ab/calgary/real-estate`) and read `window.__INITIAL_STATE__` or the active map bounds via:

```bash
browse open "https://www.realtor.ca/$PROV/$CITY/real-estate" --remote --session "$SID"
# Then either parse listing cards directly (fallback, ~11 per page) OR
# read the bbox the city page initialises its map with, then POST PropertySearch_Post.
```

Province codes are the standard two-letter ISO 3166-2:CA codes lowercased: `on`, `bc`, `ab`, `qc`, `mb`, `sk`, `ns`, `nb`, `nl`, `pe`, `yt`, `nt`, `nu`. City slugs are the city name lowercased with spaces → hyphens (`new-westminster`, `prince-george`).

### 4. POST PropertySearch_Post from the warmed session's page context

```bash
browse eval --remote --session "$SID" '
(async () => {
  const params = new URLSearchParams({
    ZoomLevel: "12",
    LatitudeMin: "43.63", LatitudeMax: "43.68",
    LongitudeMin: "-79.43", LongitudeMax: "-79.35",
    Sort: "6-D",                    // 6-D = date-desc (newest first); 1-A = price-asc; 1-D = price-desc
    PropertyTypeGroupID: "1",       // 1 = Residential; 2 = Commercial
    TransactionTypeId: "2",         // 2 = For Sale; 3 = For Rent
    PropertySearchTypeId: "0",      // 0 = All residential subtypes
    Currency: "CAD",
    IncludeHiddenListings: "false",
    RecordsPerPage: "50",           // 1..200 sane; >200 server-caps to RecordsShowing=600 in one shot
    ApplicationId: "1",
    CultureId: "1",                 // 1 = en-CA; 2 = fr-CA
    Version: "7.0",
    CurrentPage: "1",
    // Optional filters — append only the ones the caller asked for:
    // PriceMin: "500000", PriceMax: "900000",
    // BedRange: "2-0",     // "2-0" = 2+ beds, no upper bound; "2-3" = 2..3 beds
    // BathRange: "2-0",    // same shape as BedRange
    // Keywords: "waterfront pool",
    // OpenHouse: "1",
  });
  const r = await fetch("https://api2.realtor.ca/Listing.svc/PropertySearch_Post", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: params.toString(),
  });
  return await r.json();
})()
'
```

`PropertySearch_Post` is the **synchronous** endpoint — it blocks until results are ready and returns them in one JSON payload. The site itself uses `AsyncPropertySearch_Post` followed by a long-poll, which is unnecessary overhead for a scripted client. Stick with the sync version.

A 200 OK response has:

```json
{
  "ErrorCode": { "Id": 200, "Description": "Success - OK", ... },
  "Paging": {
    "RecordsPerPage": 50,
    "CurrentPage": 1,
    "TotalRecords": 645,        // total matches in the bbox/filter
    "MaxRecords": 600,          // hard server cap per bbox
    "TotalPages": 13,
    "RecordsShowing": 600,      // == min(TotalRecords, MaxRecords)
    "Pins": 436                 // # of distinct map pins (may be < RecordsShowing if listings cluster)
  },
  "Results": [ /* 1..RecordsPerPage listings */ ],
  "Pins": [ /* map-pin clusters, ignore for listing harvest */ ],
  "GroupingLevel": 4
}
```

### 5. Decode each `Results[]` item

Each item is a fully-named object (no positional-array decoding like Craigslist). Map to a clean shape:

```js
const out = j.Results.map(x => ({
  mls_number: x.MlsNumber,                                    // e.g. "C13141142"
  realtor_id: x.Id,                                           // realtor.ca internal id, used for /real-estate/{Id}/...
  price: x.Property?.Price,                                   // formatted string, e.g. "$740,000"
  price_value: Number(x.Property?.PriceUnformattedValue),     // numeric CAD
  address: x.Property?.Address?.AddressText?.replace("|", ", "), // "1201 - 81 WELLESLEY STREET E, Toronto (Church-Yonge Corridor), Ontario M4Y0C5"
  lat: Number(x.Property?.Address?.Latitude),
  lon: Number(x.Property?.Address?.Longitude),
  postal_code: x.PostalCode,
  province: x.ProvinceName,
  property_type: x.Property?.Type,                            // "Single Family", "Multi-family", "Vacant Land", ...
  beds: x.Building?.Bedrooms,                                 // "4 + 1" means 4 above-grade + 1 below
  baths_total: x.Building?.BathroomTotal,                     // includes half-baths
  baths_half: x.Building?.HalfBathTotal,
  size_interior: x.Building?.SizeInterior,                    // e.g. "232.2557 m2"
  floor_area: x.Building?.FloorAreaMeasurements?.[0]?.Area,   // e.g. "2500+ sqft"
  ownership: x.Property?.OwnershipType,                       // "Freehold", "Condominium", "Leasehold", ...
  parking: x.Property?.Parking?.map(p => p.Name).join(", "),
  parking_spaces: x.Property?.ParkingSpaceTotal,
  photo_url: x.Property?.Photo?.[0]?.HighResPath,
  remarks: x.PublicRemarks,
  time_on_realtor: x.TimeOnRealtor,                           // human-readable: "3 min ago", "2 hours ago"
  inserted_date_utc: x.InsertedDateUTC,                       // .NET ticks (see gotcha below)
  url: "https://www.realtor.ca" + x.RelativeURLEn,
  agent_name: x.Individual?.[0]?.Name,
  agent_organization: x.Individual?.[0]?.Organization?.Name,
}));
```

### 6. Paginate if `Paging.TotalRecords > RecordsShowing`

The API returns at most `MaxRecords` (currently 600) per bbox regardless of `RecordsPerPage`. To get the rest, **shrink the bbox** (split into quadrants) rather than incrementing `CurrentPage` beyond `ceil(MaxRecords/RecordsPerPage)` — page numbers past that cap return empty `Results`. For dense areas (downtown Toronto pulls 11,902 total in one zoom-11 bbox), recursively split into four sub-bboxes until each is ≤600.

### 7. Release the session

```bash
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

### Browser fallback

When the API is blocked (e.g., Incapsula challenge upgrade, residential proxy not available) or you need to confirm a listing's rendered state, open the city URL and scrape the cards:

```bash
browse open "https://www.realtor.ca/$PROV/$CITY/real-estate" --remote --session "$SID"
# Then read DOM:
browse eval --remote --session "$SID" '
  Array.from(document.querySelectorAll("a[href*=\"/real-estate/\"]")).map(a => ({
    url: a.href,
    mls: (a.textContent.match(/MLS®:\s*(\S+)/) || [])[1],
    price: (a.textContent.match(/\$[\d,]+/) || [])[0],
  }))
'
```

Only ~11 listings per page, JS-driven pagination, expect ~3× more turns and ~10× the cost vs. the API path. Sort defaults to "Recent" (date-desc) and respects `Filters` URL params if you wire them in via the `/map?Filters=...` query string.

## Site-Specific Gotchas

- **READ-ONLY.** Do not click "Save Listing", "Hide Listing", "Contact REALTOR®", or any heart/favourite icon — those require auth and would touch user state on shared session contexts.
- **Imperva/Incapsula gates everything.** A bare `curl https://api2.realtor.ca/Listing.svc/PropertySearch_Post` from outside a real browser returns the Incapsula challenge HTML (1KB, 200 OK, `<html>Request unsuccessful...</html>`), not JSON. Even from a Browserbase session, you **must** visit `https://www.realtor.ca/` first to mint `reese84` + `incap_ses_*` before the API call. Verified 2026-05-19: the homepage GET issues `reese84=3:...:...` (Imperva sensor data fingerprint) plus 4 distinct `incap_ses_*` cookies tied to the WAF-protected sub-paths.
- **`browse cloud fetch` is GET-only — it cannot POST `PropertySearch_Post`.** Use `browse eval` from a warmed session instead. Confirmed 2026-05-19 — fetch has no `--method`, `--body`, or `--header` flags.
- **`AutoSuggest` and other auxiliary endpoints fail CORS from page-context.** `GET https://api2.realtor.ca/Search.svc/AutoSuggest?text=oakville&CultureId=1&ApplicationId=1` from inside `browse eval` returns `status: 0` (CORS pre-flight rejected) even on a warmed session. Stick to `PropertySearch_Post` for the listing API; for city → bbox resolution, navigate to `/{province}/{city}/real-estate` and read map state or use the hardcoded bbox table above.
- **600-record server cap per bbox.** `Paging.MaxRecords` is server-fixed at 600. `Paging.TotalRecords` can be 11,902 (downtown Toronto, zoom 12). To capture all matches, recursively subdivide the bbox until each sub-region's `TotalRecords ≤ 600`. Naively requesting `CurrentPage=7` past the cap returns empty `Results[]`, not an error.
- **`AsyncPropertySearch_Post` is a trap.** The web UI itself uses `AsyncPropertySearch_Post` followed by a poll — that's two round-trips and useless for a scripted client. The synchronous `PropertySearch_Post` returns the same data in one POST. Both endpoints share the same form-body schema.
- **Hash-based map navigation does not refetch.** `browse open "https://www.realtor.ca/map#ZoomLevel=12&LatitudeMin=..."` updates the URL hash but **the JavaScript does not listen to `hashchange` for filter refetches**. To re-render the map for a new bbox you must either (a) make the API call directly (preferred) or (b) navigate to `https://www.realtor.ca/map?` with the bbox params as query, then wait for `load`.
- **`Bedrooms` is a string and can be `"4 + 1"`.** Above-grade + below-grade splits are encoded as `"N + M"`. Treat it as a string and parse defensively if you need a single integer.
- **`SizeInterior` units are mixed.** Sometimes `"232.2557 m2"`, sometimes `"2500 sqft"`, sometimes empty. The `FloorAreaMeasurements[0].AreaUnformatted` field carries the raw form ("2500-3000 sqft") if you need a range.
- **`Address.AddressText` uses `|` as a separator** between street and city/province/postal: `"3252 LARRY CRESCENT|Oakville (GO Glenorchy), Ontario L6M0S9"`. Split on `|` (max 1 split) to get street vs. locality.
- **`InsertedDateUTC` is .NET ticks** (100-ns intervals since 0001-01-01 UTC), not ISO 8601. Convert: `epochMs = (ticks - 621355968000000000) / 10000`. Most consumers should just use the human-readable `TimeOnRealtor` ("3 min ago", "2 days ago") or `Tags[0].Label`.
- **`/{province}/{city}/real-estate` is SEO-rendered with only 11 listings.** It is NOT the same backend as `/map` — it's a server-rendered SEO page with classic pagination. Map view + API is ~50× faster per record harvested.
- **Currency defaults to CAD.** Pass `Currency=USD` to convert prices in the response — verified the API supports it but does not change the underlying `PriceUnformattedValue` mapping to CAD.
- **`Sort` codes are positional-key:direction.** `1` = price, `6` = inserted date, `21` = floor area. Append `-A` (ascending) or `-D` (descending). `6-D` = newest first; `1-A` = cheapest first.
- **Photo CDN is unauthenticated.** `cdn.realtor.ca/listings/...` images are fetchable without cookies — safe to surface `HighResPath` in your output.
- **`status: 0` from page-context fetch == CORS block, not network failure.** If you see this, the endpoint is preflighted; switch to a different transport (page navigation + DOM read) or skip the endpoint.
- **Verified flag does not persist `keep-alive` after `REQUEST_RELEASE`.** If you `REQUEST_RELEASE` and immediately re-create with the same flags, the new session gets a fresh challenge round — budget ~3 seconds extra for the first homepage GET.

## Expected Output

```json
{
  "query": {
    "bbox": { "lat_min": 43.63, "lat_max": 43.68, "lon_min": -79.43, "lon_max": -79.35 },
    "zoom": 12,
    "transaction": "sale",
    "property_type_group": "residential",
    "filters": { "price_min": 500000, "price_max": 900000, "beds_min": 2, "baths_min": 2 },
    "sort": "date-desc"
  },
  "paging": {
    "total_records": 645,
    "records_showing": 600,
    "records_returned": 50,
    "current_page": 1,
    "max_per_bbox": 600
  },
  "listings": [
    {
      "mls_number": "C13141142",
      "realtor_id": "29767355",
      "price": "$740,000",
      "price_value": 740000,
      "currency": "CAD",
      "address": "1201 - 81 WELLESLEY STREET E, Toronto (Church-Yonge Corridor), Ontario M4Y0C5",
      "lat": 43.6651,
      "lon": -79.3793,
      "postal_code": "M4Y0C5",
      "province": "Ontario",
      "property_type": "Single Family",
      "beds": "2",
      "baths_total": "2",
      "baths_half": null,
      "size_interior": "75.5 m2",
      "floor_area": "700-800 sqft",
      "ownership": "Condominium",
      "parking": "Underground",
      "parking_spaces": "1",
      "photo_url": "https://cdn.realtor.ca/listings/TS.../highres/0/c13141142_1.jpg",
      "remarks": "Bright south-facing 2-bed corner unit in the heart of Church-Yonge ...",
      "time_on_realtor": "3 hours ago",
      "url": "https://www.realtor.ca/real-estate/29767355/1201-81-wellesley-street-e-toronto-church-yonge-corridor",
      "agent_name": "Jane Doe",
      "agent_organization": "EXAMPLE REALTY INC."
    }
  ]
}
```

For commercial searches, set `PropertyTypeGroupID=2`. For rentals, set `TransactionTypeId=3`. The `listings[]` schema is otherwise identical — rental prices come back as monthly strings ("$2,400 / Monthly").

When the API is unreachable (Incapsula challenge upgrade, no residential proxy available), emit a degraded payload from the city-page fallback:

```json
{
  "query": { "city": "toronto", "province": "on", "transaction": "sale" },
  "paging": { "total_records": 10314, "records_returned": 11, "fallback": "city-page-html" },
  "listings": [
    { "mls_number": "W13141174", "price": "$2,450,000",
      "url": "https://www.realtor.ca/real-estate/29767472/4-robaldon-road-toronto-princess-rosethorn" }
  ]
}
```
