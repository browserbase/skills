---
name: usdalocalfoodportal-com-find-market-5xvsgb
title: USDA Local Food Portal — Find Market
description: >-
  Search the USDA Local Food Portal directories (Farmers Markets, CSAs, On-Farm
  Markets, Food Hubs, Agritourism) near a US location and return matching
  listings with full address, lat/lon, distance, plaintext contact, social-media
  URLs, and the canonical detail URL.
website: usdalocalfoodportal.com
category: government-directory
tags:
  - usda
  - farmers-market
  - csa
  - food-hub
  - local-food
  - directory
  - agriculture
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      Only useful when an upstream system requires literal navigation of a
      portal search URL; the page is server-rendered PHP/Bulma and the visible
      cards expose contact_email and contact_phone as PNG-obfuscated images, so
      the browser path is strictly worse than calling the same JSON endpoint the
      page itself uses.
  - method: url-param
    rationale: >-
      The user-facing search URL
      (https://www.usdalocalfoodportal.com/fe/fdirectory_{dtype}/?...) is
      shareable and stateful, but it's a thin client over the same API — the API
      path is the optimal way to consume the same filters programmatically.
verified: false
proxies: false
---
# USDA Local Food Portal — Find Market

## Purpose

Search the four USDA Local Food Portal directories (Farmers Markets, CSAs, On-Farm Markets, Food Hubs — plus the bonus Agritourism directory) near a US location and return matching listings as structured JSON: name, directory type, full address with lat/lon, distance from input, contact (name, email, phone), social-media URLs, and the canonical USDA detail URL. Read-only; never edits or submits the portal's "report this listing" / "claim this listing" forms.

## When to Use

- "Find SNAP-accepting farmers markets within 20 miles of ZIP 60601."
- "Show me CSAs near Madison, WI that operate in June."
- "Look up the listing details for a market named 'Union Square Greenmarket'."
- "Resolve this USDA portal detail URL to a structured record."
- "Pull all on-farm markets in zipcodes 98101–98199" (bulk via per-ZIP API queries).
- Any task that would otherwise scrape the portal's HTML search pages — the underlying JSON API is faster, returns plaintext contact fields the detail page hides as PNG-obfuscated images, and tolerates polite rate limits without proxies.

## Workflow

The portal's web UI is a thin jQuery client over a public JSON API at `https://www.usdalocalfoodportal.com/api/`. Two endpoints matter; both are unauthenticated, return JSON, and work with no proxy and no browser Verified — verified 2026-05-18 with both `--proxies` and direct (non-proxied) Browserbase fetches returning identical 200 responses with full data. Lead with the API path. The browser flow is only useful when an upstream caller hands you an opaque portal search URL they want re-executed verbatim — and even then, the search URL's query string can be replayed against the API.

### 1. Search the list endpoint

```
GET https://www.usdalocalfoodportal.com/api/get_searchresult_list/
    ?mydata[directory]={dtype}
    &mydata[location]={zip-or-address}
    &mydata[radius]={miles}
    &mydata[x]={longitude}
    &mydata[y]={latitude}
    &mydata[term]={keyword}
    &mydata[...filter]=v1|v2|v3
```

**The `mydata[...]` PHP-array bracket syntax is mandatory.** Sending `?mydata={JSON}` returns `HTTP 500 — "Cannot unset string offsets in class_FrontendNonWP.php:188"`. The backend's `$_GET['mydata']` is consumed as a parsed array, not a JSON blob. URL-encode the brackets as `%5B` / `%5D`.

**Required keys:**

- `mydata[directory]` — one of: `farmersmarket`, `csa`, `onfarmmarket`, `foodhub`, `agritourism`. Multi-directory search supported by joining with `|` (e.g. `farmersmarket|csa`).

**Location keys (at least one of these two patterns):**

- ZIP-only: `mydata[location]=10001` plus `mydata[radius]={miles}` is sufficient — the backend geocodes the ZIP server-side.
- Coordinate path: `mydata[x]={longitude}&mydata[y]={latitude}` (note: **`x`=longitude, `y`=latitude** — the portal's HTML form uses Google Places autocomplete which writes lng to `current_x` and lat to `current_y`). Pair with `mydata[location]={display-string}` and `mydata[radius]`.

**Optional filter keys** (omit to skip the filter; multi-select values are pipe-joined):

| Param | Values | Notes |
|---|---|---|
| `mydata[term]` | free text | Matches against listing name. Works without location. |
| `mydata[radius]` | `10`, `30`, `100`, `250` | **Miles. The actual radius enum is 10/30/100/250, not the 5/10/20/50/100 sometimes quoted in upstream tickets.** Default in the UI is 30. |
| `mydata[fnap]` | `SNAP`, `WIC`, `WIC Farmers Market Program`, `Senior Farmers Market Nutrition Program`, `Match Program` | Food / Nutrition Assistance Programs. **There is no separate "WIC Cash Value Voucher" filter** — combine `WIC` + `WIC Farmers Market Program` if a user asks for "WIC CVV". |
| `mydata[acceptedpayment]` | `Cash`, `Debit card`, `Mobile payments`, `Commerical Checks` *(sic — typo in the enum)*, `Personal Checks`, `Barter`, `Volunteer Work` | "Credit cards" maps to the `Debit card` enum value (the label is "Debit card/Credit card"). |
| `mydata[specialproductionmethods]` | `USDA Certified`, `Practicing Organic`, `Naturally Grown`, `Good Agricultural Practices`, `No antibiotics`, `Non-GMO`, `No hormones`, `No pesticides`, `Grass Fed`, `Pasture-raised`, `Humane treatment of animals`, `Fair labor practices`, `Kosher`, `Halal` | **There is no `Conventional` enum** — "conventional" is the absence of any of these, not a positive filter. |
| `mydata[operationmonth]` | `operation_month_1` … `operation_month_12` | One per calendar month. |
| `mydata[operationday]` | `operationtime_sun`, `operationtime_mon`, `operationtime_tue`, `operationtime_wed`, `operationtime_thu`, `operationtime_fri`, `operationtime_sat` | |
| `mydata[orderingmethod]` | `saleschannel_onlineorder`, `saleschannel_phoneorder`, `saleschannel_csaorder` | |
| `mydata[productlist]` | (varies by directory — Farmers Markets accept free-text product names; the dropdown is populated dynamically from the per-directory product taxonomy) | Pipe-join for multi-select. |
| `mydata[location_state]` | full state name, e.g. `New York` | State-level filter independent of radius. |

**Response shape** — a flat array under `data`:

```json
{ "data": [ { "listing_id": "300291", "listing_name": "...", ... }, ... ] }
```

Each record carries **plaintext** `contact_email` and `contact_phone` (unlike the detail endpoint — see gotcha below), full address (`location_street`, `location_city`, `location_state`, `location_zipcode`), lat/lon (`location_x` = longitude, `location_y` = latitude), `distance` (decimal miles from the input coords, only present when a coordinate or location was supplied), `directory_type`, and all six social-media URLs (`media_website`, `media_facebook`, `media_twitter`, `media_instagram`, `media_pinterest`, `media_youtube`, `media_blog`).

### 2. Construct the canonical detail URL

```
https://www.usdalocalfoodportal.com/fe/flisting/?lid={listing_id}&directory_type={directory_type}
```

Both values come directly from the search response. **The trailing slash before `?` is required** — `/fe/flisting?lid=...` returns HTTP 301 to the slash-suffixed form, costing an extra round-trip.

### 3. Single-record lookup

When the caller provides only a market name or only a detail URL:

- **Detail URL given** → parse `lid` and `directory_type` from the query string and re-issue the **search API** with `mydata[directory]={dtype}&mydata[term]={market_name_if_known}` and then filter the response by `listing_id == lid`. This is *preferred* over the listinginfo endpoint because the search API returns plaintext contact fields.
- **Name only** → `mydata[directory]={dtype}&mydata[term]={name}` with no location. The `term` parameter matches against `listing_name` server-side and returns nationwide hits (verified: `term=Union Square` returned 4 records spanning NY, NC, WI, MA).

### 4. Pagination

**There is none.** A single call returns the full result set for the given filters — verified up to 124 records on a single ZIP+radius query. The classic web UI does client-side paging via DataTables over the full result array. If you need to keep payloads small, **subdivide by sub-filter** (state, month, day-of-week, payment type) rather than expecting `limit`/`offset` params.

### Browser fallback

Only useful if (a) the JSON API ever starts returning HTML, or (b) an upstream system requires you to literally navigate the user-facing search URL. The page is server-rendered Bulma/PHP with a Google-Places autocomplete on the location input.

1. Open `https://www.usdalocalfoodportal.com/fe/fdirectory_{dtype}/?source=fe&directory={dtype}&location={loc}&x={lng}&y={lat}` — the same query parameters the API accepts (without the `mydata[...]` bracket wrapping).
2. The page's inline JS calls `get_searchresult_list` on load. Wait for `#myloaderContainer` to hide, then either:
   - **Cheaper**: intercept the XHR via `browse network` and read the JSON envelope directly (it's the same data as step 1).
   - **More expensive**: harvest cards from `#listing_table tr` DOM nodes — each `<tr>` holds an anchor `<a href="https://www.usdalocalfoodportal.com/fe/flisting/?lid={id}&directory_type={dt}">` and visible text spans for name/address/distance, but `contact_email` / `contact_phone` are rendered as PNG images (anti-scrape) so you'll have no plaintext contact.

The browser path costs ~5–8 turns per query versus 1 turn for the API. Don't lead with it.

## Site-Specific Gotchas

- **`mydata` is a PHP array, not a JSON string.** Send `?mydata[directory]=...&mydata[location]=...`. Sending `?mydata={"directory":"..."}` returns HTTP 500 (`Cannot unset string offsets in class_FrontendNonWP.php:188`) — the backend immediately treats `$_GET['mydata']` as an array and calls `unset()` on it.
- **Double-slash in the inline API URL is a red herring.** The page's source emits `url: "https://www.usdalocalfoodportal.com/api//get_searchresult_list"` (note the `//`). The doubled slash 301-redirects to the single-slash form. Always use single-slash + trailing slash: `/api/get_searchresult_list/?...`.
- **Phone and email on the detail page (`/api/listinginfo/`) are PNG-obfuscated.** The detail API returns `contact_phone` and `contact_email` as `<img src="data:image/png;base64,...">` tags rendering the digits/string. The **search list API returns them as plaintext** — always prefer the search endpoint, even for single-record lookups. Don't waste turns OCR-ing the PNGs.
- **The detail API otherwise returns pre-rendered HTML fragments**, not clean fields. Endpoints like `address`, `seasonproducts`, `specialproductionmethods`, `acceptedpayment`, `fnap`, `profile` are HTML blobs you must regex-parse for `<li>` items. The list API doesn't carry these fields — if you need the goods/operating-hours breakdown, fetch `/api/listinginfo/?lid={id}&directory_type={dt}` and parse the `<ul class="myul"><li>...</li></ul>` blocks server-side.
- **The bulk download endpoint exists but is unusable from Browserbase Fetch.** `GET /api/download_by_directory/?directory={dtype}` dumps the entire catalog as a JSON array (no auth), but the response routinely exceeds 1 MB and Browserbase Fetch returns `"502 The response body exceeded the maximum allowed size of 1MB"`. If you need a full dump, page by ZIP-radius-100 grid or by state and merge.
- **Coordinate convention is inverted vs. the usual GIS norm.** Form field `current_x` (and API param `x`) holds **longitude**; `current_y` / `y` holds **latitude**. Same convention is mirrored in response fields `location_x` / `location_y`. Double-check sign and magnitude (US longitudes are negative, between −66 and −125).
- **Radius enum is 10/30/100/250 miles, not 5/10/20/50/100.** Upstream task descriptions sometimes quote the latter set; the actual UI dropdown and API both validate against the former. Out-of-enum values are silently coerced to 30.
- **`Conventional` is not a filter value.** The `specialproductionmethods` enum only carries *positive* practice claims (Organic, Naturally Grown, Grass Fed, Halal, …). To list "conventional" markets, omit the filter entirely and post-filter the response for records whose `specialproductionmethods` field is empty.
- **`WIC Cash Value Voucher` is not a filter value either.** The `fnap` enum has `WIC` (general) and `WIC Farmers Market Program` (FMNP). The "Cash Value Voucher" (CVV) is a subset of general WIC benefits — it's not modelled separately in the portal.
- **`Commerical Checks` is misspelled in the upstream enum.** Send the typo verbatim (URL-encoded) — `mydata[acceptedpayment]=Commerical%20Checks` — or the filter is silently ignored.
- **`agritourism` is a fifth, undocumented directory.** It's in the same backend, accepts the same filters, and is the directory used by the portal's "directories near you" landing page. Worth supporting if the caller's task is location-based "what's nearby" rather than market-specific.
- **No `Referer` / `User-Agent` / cookie checks.** Verified with a bare `browse cloud fetch` (no proxy, no browser session) returning 124 records for ZIP 10001 + radius 30 + directory farmersmarket. Apache `Server: Apache/2.4.59 () OpenSSL/1.0.2k-fips PHP/8.0.30`; no Akamai/Cloudflare/Imperva fronting. Stay polite (≤ 1 req/s sustained) but no Verified is required.
- **`distance` is omitted when no `x`/`y` or `location` is supplied.** A pure `term=` query returns nationwide hits without distance values, so consumers should treat `distance` as optional.
- **`updatetime` in the search response is a human string** (`"Nov 28th, 2022"`), not ISO-8601. Parse with `dateparser`/`dateutil` or treat as opaque display data.

## Expected Output

A single envelope per query, regardless of which input shape was used:

```json
{
  "input": {
    "directory": "farmersmarket",
    "location": "10001",
    "x": -73.997,
    "y": 40.7505,
    "radius_miles": 30,
    "term": null,
    "filters": { "fnap": ["SNAP"], "operationday": ["operationtime_sat"] }
  },
  "result_count": 14,
  "listings": [
    {
      "listing_id": "300291",
      "directory_type": "farmers_market",
      "name": "Down to Earth Chelsea Farmers Market",
      "updated_display": "Nov 28th, 2022",
      "address": {
        "street": "W. 23rd Street off 9th Avenue",
        "city": "New York",
        "state": "New York",
        "zip": "10011",
        "full": "W. 23rd Street off 9th Avenue, New York, New York 10011"
      },
      "latitude": 40.746359,
      "longitude": -74.000805,
      "distance_miles": 0.51,
      "contact": {
        "manager_name": "Down to Earth Markets",
        "email": "info@downtoearthmarkets.com",
        "phone": "9149234837",
        "website": "https://downtoearthmarkets.com/"
      },
      "social_media": {
        "facebook": "https://www.facebook.com/chelseanycfarmersmarket",
        "instagram": "https://www.instagram.com/chelseafarmersmarketnyc",
        "twitter": null,
        "pinterest": null,
        "youtube": null,
        "blog": "https://downtoearthmarkets.tumblr.com/"
      },
      "brief_description": "Open: May to December. Available Products: Fresh fruits; Fresh vegetables; Baked goods; …",
      "detail_url": "https://www.usdalocalfoodportal.com/fe/flisting/?lid=300291&directory_type=farmersmarket"
    }
  ]
}
```

For **single-record lookups by detail URL or by exact name** (the API still returns a list — usually of length 1, occasionally many for ambiguous names), use the same envelope with `result_count: 1` (or N for ambiguous) and a single-element `listings` array. When `result_count > 1` for what the caller expected to be a single hit, surface the ambiguity to the caller — do not silently pick the first record.

For **directory-type variants** (`csa`, `onfarmmarket`, `foodhub`, `agritourism`), the schema is identical — only `directory_type` and the contents of `brief_description` differ. Per-directory product taxonomies differ (CSAs surface "Share size", "Pickup vs. delivery"; food hubs surface "wholesale", "distribution radius") but those nuances live in the detail endpoint's HTML fragments, not the list endpoint.

For **zero-result queries**, return `{ "result_count": 0, "listings": [] }` — the API returns `{ "data": null }` or `{ "data": [] }` and both must be normalized to an empty array.
