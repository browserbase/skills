---
name: southwest-com-search-flights-jl329m
title: Southwest Airlines Flight Search
description: >-
  Search southwest.com for available flights between two airports on given dates
  and return matching itineraries with four-bucket fares (Wanna Get Away / Plus
  / Anytime / Business Select) in dollars or Rapid Rewards points. Read-only —
  never books. Southwest refuses syndication to OTAs, so southwest.com is the
  only source of truth for these fares.
website: southwest.com
category: travel
tags:
  - travel
  - flights
  - airlines
  - southwest
  - akamai
  - read-only
  - deep-link
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: browser
alternative_methods:
  - method: url-param
    rationale: >-
      The /air/booking/select.html?… deep-link URL accepts the full search
      payload (origin, destination, dates, adult+senior counts, fareType, promo,
      trip type) and 301-redirects to the React shopping flow — saves ~6 turns
      of form/autocomplete/date-picker driving per search. Use as the primary
      entry point WITHIN the browser-driven flow; children and lap-infants still
      require the in-page passenger drawer (form fallback).
  - method: api
    rationale: >-
      Confirmed-blocked.
      /api/air-booking/v1/air-booking/page/air/booking/shopping and all sibling
      /api/air-booking/v1/* + /api/content/v1/* routes return Akamai 403 Access
      Denied (Reference #18.1071ca17.…) on every cookieless HTTP call — verified
      across direct fetch and residential-proxy fetch in iter-1 reconnaissance.
      Don't waste cycles trying to replay them out-of-band.
verified: true
proxies: true
---
# Southwest Airlines Flight Search

## Purpose

Search southwest.com for available flights between two airports on given dates and return matching itineraries — flight numbers, routing, segments, durations, stop counts, connection airports, layovers, on-time-performance (when shown), and a four-bucket fares object (`wanna_get_away` / `wanna_get_away_plus` / `anytime` / `business_select`) priced in both USD and Rapid Rewards points + tax. Supports round-trip and one-way (multi-city is modeled as a sequence of one-ways — Southwest does not sell true multi-city), Dollars or Points fare mode, full passenger mix (adult / child / lap-infant / senior), promo code, time-of-day / stops / sort filters, and the Low Fare Calendar month-grid sweep. **Read-only — never click Continue, Select, Book, or any seat-selection control.** Southwest deliberately refuses syndication to third-party search engines (Kayak, Google Flights, Expedia), so southwest.com is the only source of truth for Southwest fares.

## When to Use

- Compare Southwest's four fare tiers for a specific O-D pair on specific dates.
- Sweep a month-grid for the cheapest-day fare (Low Fare Calendar).
- Price the same itinerary in dollars vs. Rapid Rewards points to inform a points-vs-cash decision.
- Confirm whether a Southwest route exists at all (Southwest's network is heavily point-to-point — many city pairs require connections, and some "expected" pairs like JFK don't exist because Southwest doesn't serve JFK).
- Any flow that needs Southwest fares — they cannot be obtained from any OTA, meta-search, or GDS aggregator.

## Workflow

The only reliable surface is the **scripted browser flow** with the `/air/booking/select.html?…` deep-link URL. The internal JSON endpoint `/api/air-booking/v1/air-booking/page/air/booking/shopping` (and all sibling `/api/air-booking/v1/*` and `/api/content/v1/*` routes) returns **Akamai 403 Access Denied** on every cookieless HTTP call — verified across direct fetches and a residential-proxy fetch (Reference `#18.1071ca17`). Don't waste cycles trying to hit those endpoints; lead with the deep-link + scripted browsing path described below.

### 1. Verified + residential-proxy + verified session (mandatory)

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies | jq -r .id)
export BROWSE_SESSION="$SID"
```

All three flags (`--keep-alive`, `--verified`, `--proxies`) are mandatory. Southwest is fronted by Akamai Bot Manager (`bazadebezolkohpepadr` token, `/akam/13/8333552` sensor, `ak_bmsc` + `bm_mi` + `bm_sz` cookies). A bare or proxy-less session gets either the generic "There was a problem" error page or an outright Akamai-Access-Denied HTML.

### 2. Skip the form — go directly to the results page via deep-link URL

Southwest accepts the entire search payload as URL query parameters on `/air/booking/select.html`, which 301-redirects to `/air/booking/select-depart.html` and triggers the same React shopping flow the form would. **This saves ~6 turns of form filling, autocomplete waiting, and date-picker clicking per search.**

```
https://www.southwest.com/air/booking/select.html
    ?originationAirportCode=DAL
    &destinationAirportCode=LAS
    &departureDate=2026-06-15
    &returnDate=2026-06-18
    &tripType=roundtrip                  // or "oneway" (no &returnDate)
    &adultPassengersCount=1              // 1-8
    &seniorPassengersCount=0             // 65+; counts toward total (max 8)
    &passengerType=ADULT                 // primary passenger pricing class
    &fareType=USD                        // "USD" (dollars) or "POINTS"
    &promoCode=                          // optional, leave empty for none
    &int=HOMEQBOMAIR                     // internal tracking; safe to omit
```

Open it:

```bash
browse open --remote "https://www.southwest.com/air/booking/select.html?originationAirportCode=DAL&destinationAirportCode=LAS&departureDate=2026-06-15&returnDate=2026-06-18&tripType=roundtrip&adultPassengersCount=1&fareType=USD&passengerType=ADULT"
browse wait --remote load
browse wait --remote timeout 4000          # fare grid hydrates asynchronously
```

URL-param contract (verified from 301-redirect echo behavior and bootstrap config):

| Param | Values | Notes |
|---|---|---|
| `originationAirportCode` / `destinationAirportCode` | 3-letter IATA | Must be a Southwest-served airport (see §3). |
| `departureDate` / `returnDate` | `YYYY-MM-DD` | Local-date at the origin airport. Omit `returnDate` for `tripType=oneway`. |
| `tripType` | `roundtrip` \| `oneway` | Southwest does not offer true multi-city — model as a sequence of one-ways. |
| `adultPassengersCount` | `1` … `8` | |
| `seniorPassengersCount` | `0` … `7` | 65+; reduces the adult bucket. Combined `adult + senior` ≤ 8. |
| `passengerType` | `ADULT` | The lookup pricing class. Children (2–11) and lap-infants are added on the in-page passenger drawer — they are NOT URL-deeplinkable; if you need them, fall through to the form-fill path in §6. |
| `fareType` | `USD` \| `POINTS` | URL form sends `USD`/`POINTS`; the page's own internal state object may show `DOLLARS`/`POINTS` — don't conflate. |
| `promoCode` | string | Optional. |

### 3. Resolve airport codes (when input is a city name, not IATA)

The full Southwest airport list (122 stations, including Caribbean / Mexico / Central America) is published as a base64-encoded JS bundle at:

```
https://www.southwest.com/swa-ui/bootstrap/air-booking-v2/1/data.js
```

Fetch it with `browse cloud fetch <url> --proxies`, base64-decode the response body, and grep for `"emailDisplayName":"…","cityServed":"…","stationName":"…","id":"XYZ"` records. This is faster, cheaper, and more reliable than driving Southwest's airport autocomplete UI for the lookup. Cache the decoded list locally — the bundle is ~650 KB after decode.

Example records:
```
"emailDisplayName":"Dallas (Love)","cityServed":"Dallas","stationName":"Dallas (Love Field)","id":"DAL"
"emailDisplayName":"Chicago (Midway)","cityServed":"Chicago","stationName":"Chicago (Midway)","id":"MDW"
"emailDisplayName":"Chicago (O'Hare-Terminal 5)","cityServed":"Chicago","stationName":"Chicago (O'Hare-Terminal 5)","id":"ORD"
```

Multi-airport cities surface multiple records — use `cityServed` for "any Dallas airport" and pick `DAL` (Love) vs. `DFW` (Southwest does NOT serve DFW; only DAL).

### 4. Wait for the fare grid to hydrate

The HTML shell that comes back from `/air/booking/select-depart.html` is ~5 KB of `<div id="root">` + script tags — the fare cells are rendered client-side after the React app calls `/api/air-booking/v1/air-booking/page/air/booking/shopping` from within the page context (where Akamai accepts the session). The grid takes 2–5 s wall-time to render after `load` fires.

Wait signal: at least one outbound row contains the text **"Wanna Get Away"** in a button. Don't snapshot before that — early snapshots get a skeleton-loader DOM.

```bash
# Snapshot once the price cells render
browse snapshot --remote > /tmp/snap-outbound.txt
```

### 5. Extract per-flight data from the snapshot

Each outbound itinerary card on `/air/booking/select-depart.html` exposes:

- **Flight number(s)** — 4-digit Southwest numerics (e.g., `1234`, `2789`); a connecting itinerary shows multiple flight numbers joined by `/` (e.g., `1234 / 5678`).
- **Routing** — origin → connection(s) → destination IATAs, visible as "DAL → LAS" or "DAL → HOU → LAS".
- **Depart / Arrive times** — local times per segment, displayed as `6:00 AM` etc. Combine with the URL's `departureDate` to build local ISO datetimes.
- **Aircraft type** — when surfaced, appears as "Boeing 737-700", "Boeing 737-800", or "Boeing 737 MAX 8" in the segment detail row. Southwest operates an all-737 fleet.
- **Total duration** — formatted `Xh Ym`.
- **Stop count + connection airport(s)** — "Nonstop", "1 stop in HOU", "2 stops in HOU, MCO".
- **Layover duration** — shown per connection as `Xh Ym layover in <CITY>`.
- **On-time-performance %** — when shown (Southwest surfaces this inconsistently, mostly on mainline routes), labeled "On-time performance: 78%".
- **Four-bucket fares** — `Wanna Get Away` / `Wanna Get Away Plus` / `Anytime` / `Business Select`. In Points mode the cell shows points + `+ $5.60` cash for taxes/fees. **Sold-out buckets render as "Unavailable" or are missing entirely** — flag as `sold_out: true`.

Internal fare-class enum (from the bootstrap config — useful when parsing DOM attributes): `WANNA_GET_AWAY_FARE`, `WANNA_GET_AWAY_PLUS_FARE`, `ANYTIME_FARE`, `BUSINESS_SELECT_FARE`.

For round-trips, the page renders **outbound first**; after extraction, scroll/click the "Return" tab (read-only — selecting a tab is not a booking action) and re-snapshot to extract the return leg using the same shape.

### 6. Form-fallback path (only when URL deep-link is insufficient)

The deep-link URL covers adults + seniors, dates, O-D, fare type, promo. It does **not** cover:
- Children (ages 2–11) — must be added on the in-page passenger drawer.
- Lap infants (< 2) — same.
- Multi-city sequences — drive two one-way searches in sequence.

When the search requires children or lap-infants, open `https://www.southwest.com/air/booking/` (the form, not the deep-link), and drive the form:

1. Click `radio: Round Trip` or `radio: One Way`.
2. Click `combobox: Depart` (the origin field), type the 3-letter IATA, wait 1500 ms for the autocomplete dropdown, click the matching `option: <City>, <ST> - <IATA>`.
3. Repeat for `combobox: Return`.
4. Click the depart-date input → date picker → click the target date cell. Repeat for return date.
5. Click `button: Passengers` → adjust adult / child / lap-infant counts via the +/- steppers → click `button: Confirm`. Senior toggles also live here.
6. Click `button: Search` and continue from §4.

`browse fill` on the airport combobox will auto-press Enter and submit before the dropdown surfaces — use `browse click` then `browse type` separately, then `browse wait timeout 1500` before clicking the option.

### 7. Low Fare Calendar (month-grid sweep)

The Low Fare Calendar shows the cheapest fare across a 30-day window. Deep-link:

```
https://www.southwest.com/air/low-fare-calendar/
    ?originationAirportCode=DAL
    &destinationAirportCode=LAS
    &tripType=roundtrip
    &adultPassengersCount=1
    &fareType=USD
    &passengerType=ADULT
```

(No `departureDate` / `returnDate` — the calendar picks its own anchor month.) Each day-cell renders the lowest available fare for an outbound departing that date (round-trip pricing assumes a 3-night return; one-way mode shows one-way price). Capture per-day cheapest fare and the matching day-cell `data-` attribute or aria-label. Calendar hydration is the same — wait for the first price cell to render before snapshotting.

`/air/low-fare-calendar.html` (note the `.html` suffix) returns 404 — only the trailing-slash form works.

### 8. Filters (results page only)

Once on `/air/booking/select-depart.html`, the results page exposes a filter drawer (`button: Filter`):
- **Stops** — Nonstop / 1 stop / 2+ stops.
- **Departure time window** — Early morning (12am–5am), Morning (5am–noon), Afternoon (noon–6pm), Evening (6pm–midnight).
- **Sort** — Departure / Arrival / Duration / Price (per fare bucket).

Apply via UI clicks; there are no URL-param forms of these filters that survive a 301 redirect. Re-snapshot after each filter click.

### 9. Release the session

```bash
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

## Site-Specific Gotchas

- **READ-ONLY.** Never click `button: Continue`, the per-fare-cell `button: Select`, or any seat-map control. Selecting a fare advances to a passenger-info page and starts a booking flow. Stop at the results / calendar grid.
- **Akamai is the protection layer.** Bot-manager fingerprint script at `/akam/13/8333552`, sensor token `bazadebezolkohpepadr`, edge cookies `ak_bmsc` + `bm_mi` + `bm_sz`. Verified Akamai routing via `Akamai-Request-Bc` response header. `--verified --proxies` is non-negotiable.
- **The internal JSON shopping API is confirmed-blocked from cookieless callers.** `/api/air-booking/v1/air-booking/page/air/booking/shopping`, `/api/air-booking/v1/air-booking/page/air/booking/price`, `/api/air-booking/v1/air-booking/page/air/booking/purchase-secure`, `/api/air-booking/v1/air-booking/page/air/booking/confirmation-secure`, and `/api/content/v1/*` all return Akamai 403 (`Reference #18.1071ca17.…`) when called directly with `browse cloud fetch --proxies` — even with a fresh residential-proxy IP and no other anti-bot diff. Don't try to replay them out-of-band; the page-context fetch the React app makes is the only way Akamai accepts them. **Don't waste time on direct API calls.**
- **`/v2/` path is `Disallow:` in `robots.txt`.** Southwest's robots.txt forbids spidering `/v2/*` (which is where the React static bundles live: `/v2/air/booking/static/9.0.1/...`). This is a politeness signal — the booking flow is on `/air/booking/*` which is allowed.
- **`select.html` → `select-depart.html` 301 redirect is part of the contract.** The form-submit endpoint is `/air/booking/select.html`; that URL 301s to `/air/booking/select-depart.html` carrying all query params unchanged. Build your deep-link against `select.html` and let the redirect resolve — both URLs work, but constructing against `select.html` matches what the form does.
- **`fareType` value mismatch.** The URL param value is `USD` (or `POINTS`); the page's internal state object uses `DOLLARS`/`POINTS`. Don't send `fareType=DOLLARS` in the URL — verified the form sends `USD`.
- **Children and lap-infants are NOT URL-deeplinkable.** Only `adultPassengersCount` and `seniorPassengersCount` are read from the URL; children and lap-infants must be added in the in-page passenger drawer. If you need them, take the form-fill path (§6).
- **Southwest does NOT serve DFW or JFK.** Common pre-flight check: confirm both origin and destination are in the 122-airport list at §3. Don't fabricate a route — the SPA renders "We couldn't find any flights" silently if the route doesn't exist.
- **All-737 fleet.** Aircraft type is always `Boeing 737-700`, `Boeing 737-800`, or `Boeing 737 MAX 8` when shown. Treat any other value as a parse error.
- **The fare grid hydrates 2–5 s after `load`.** Snapshot too early and you get the skeleton DOM with no price cells. Wait until at least one row contains "Wanna Get Away" text before extracting.
- **"There was a problem" generic error page.** When Akamai bot-detection trips mid-session or the hydration XHR fails, Southwest renders a generic error card. Capture the page text, kill the session, re-create with fresh Verified flags, and retry once. If it recurs, return `success: false, reason: "site_error"` rather than re-attempting indefinitely.
- **Geolocation is Akamai-inferred from the proxy IP.** The HTML shell includes `swa.geolocation = "georegion=…,country_code=US,region_code=NY,…"`. This doesn't affect fare results but may cause US dollar/points denomination defaults. For non-US searches, no URL param is needed — Southwest only sells in USD/Rapid Rewards.
- **The bootstrap data bundle is base64-encoded.** `https://www.southwest.com/swa-ui/bootstrap/air-booking-v2/1/data.js` returns a base64 string that decodes to a ~650 KB JS module containing the airport list, fare-class enums, family-trip destination lists, and other UI metadata. The accompanying `…/content/en.js` is similarly base64-encoded but contains CMS strings (homepage copy), not fare/airport data — only `data.js` is useful for the airport-resolution shortcut in §3.
- **Sold-out buckets ≠ missing fare class.** A flight that shows three of four prices with the fourth replaced by "Unavailable" is sold out on that bucket. A flight that shows fewer than four buckets total may be on a fare-class-restricted route (e.g., some short-haul routes don't sell Business Select). Distinguish in output: `sold_out: true` vs `not_offered: true`.
- **Senior fares (`seniorPassengersCount`) are a separate pricing class** but render in the same four-bucket grid; you can verify by re-running the same itinerary with `seniorPassengersCount=1` and confirming a different price (typically only Anytime and Wanna Get Away change).
- **No-change-fees + two-free-bags are static perks.** Surface them as static metadata in the response (`perks: ["Two free checked bags", "No change fees"]`), not as a per-flight field — they apply to all Southwest itineraries equally and the bootstrap config confirms `fareTypes.WGA.features.NO_CHANGE_FEE = true` for every fare bucket.
- **The Low Fare Calendar URL is `/air/low-fare-calendar/` (trailing slash, no `.html`).** `/air/low-fare-calendar.html` returns 404. Easy footgun.
- **Filter state is not URL-encoded.** Stops, time-of-day, and sort filters live in client-side React state only — they do not survive a page reload. Apply filters via UI clicks after the results render; don't try to URL-encode them.

## Expected Output

```json
{
  "success": true,
  "trip_type": "round_trip",
  "origin": "DAL",
  "destination": "LAS",
  "depart_date": "2026-06-15",
  "return_date": "2026-06-18",
  "pay_with": "dollars",
  "passengers": {
    "adults": 1,
    "seniors": 0,
    "children": 0,
    "lap_infants": 0
  },
  "promo_code": null,
  "outbound_flights": [
    {
      "flight_numbers": ["1234"],
      "routing": ["DAL", "LAS"],
      "segments": [
        {
          "flight_number": "1234",
          "origin": "DAL",
          "destination": "LAS",
          "depart_local": "2026-06-15T06:00:00",
          "arrive_local": "2026-06-15T07:25:00",
          "aircraft": "Boeing 737-800"
        }
      ],
      "duration_minutes": 205,
      "stops": 0,
      "connections": [],
      "on_time_performance_pct": 78,
      "fares": {
        "wanna_get_away":      {"price_usd": 79,  "points": 4567,  "points_plus_dollars": 5.60, "sold_out": false},
        "wanna_get_away_plus": {"price_usd": 109, "points": 6800,  "points_plus_dollars": 5.60, "sold_out": false},
        "anytime":             {"price_usd": 280, "points": 17500, "points_plus_dollars": 5.60, "sold_out": false},
        "business_select":     {"price_usd": 330, "points": 20700, "points_plus_dollars": 5.60, "sold_out": false}
      }
    },
    {
      "flight_numbers": ["2789", "3411"],
      "routing": ["DAL", "HOU", "LAS"],
      "segments": [
        {"flight_number": "2789", "origin": "DAL", "destination": "HOU", "depart_local": "2026-06-15T08:15:00", "arrive_local": "2026-06-15T09:20:00", "aircraft": "Boeing 737 MAX 8"},
        {"flight_number": "3411", "origin": "HOU", "destination": "LAS", "depart_local": "2026-06-15T10:55:00", "arrive_local": "2026-06-15T12:10:00", "aircraft": "Boeing 737-700"}
      ],
      "duration_minutes": 295,
      "stops": 1,
      "connections": [{"airport": "HOU", "layover_minutes": 95}],
      "on_time_performance_pct": null,
      "fares": {
        "wanna_get_away":      {"price_usd": 119, "points": 7200,  "points_plus_dollars": 5.60, "sold_out": false},
        "wanna_get_away_plus": {"price_usd": 149, "points": 9400,  "points_plus_dollars": 5.60, "sold_out": false},
        "anytime":             {"price_usd": 350, "points": 21900, "points_plus_dollars": 5.60, "sold_out": true},
        "business_select":     {"price_usd": null,"points": null,  "points_plus_dollars": null, "not_offered": true}
      }
    }
  ],
  "return_flights": [
    {
      "flight_numbers": ["4501"],
      "routing": ["LAS", "DAL"],
      "segments": [
        {"flight_number": "4501", "origin": "LAS", "destination": "DAL", "depart_local": "2026-06-18T17:30:00", "arrive_local": "2026-06-18T22:35:00", "aircraft": "Boeing 737-800"}
      ],
      "duration_minutes": 185,
      "stops": 0,
      "connections": [],
      "on_time_performance_pct": 82,
      "fares": {
        "wanna_get_away":      {"price_usd": 89,  "points": 5300,  "points_plus_dollars": 5.60, "sold_out": false},
        "wanna_get_away_plus": {"price_usd": 119, "points": 7400,  "points_plus_dollars": 5.60, "sold_out": false},
        "anytime":             {"price_usd": 295, "points": 18400, "points_plus_dollars": 5.60, "sold_out": false},
        "business_select":     {"price_usd": 345, "points": 21600, "points_plus_dollars": 5.60, "sold_out": false}
      }
    }
  ],
  "perks": ["Two free checked bags", "No change fees"],
  "error_reasoning": null
}
```

Distinct outcome shapes:

```json
// Site-level error / Akamai wall
{ "success": false, "reason": "site_error", "error_reasoning": "Generic 'There was a problem' page rendered after hydration. Recreate session with fresh Verified flags and retry once.", ... }

// Anti-bot block (page-load 403 Access Denied)
{ "success": false, "reason": "anti_bot_block", "error_reasoning": "Akamai Access Denied at page load. Reference #18.xxxxxxxx.…", ... }

// Route not served by Southwest
{ "success": false, "reason": "route_not_served", "error_reasoning": "Southwest does not operate between <ORIG> and <DEST>. Both airports must appear in the 122-station network list.", ... }

// No availability on the requested date (route exists but zero flights)
{ "success": true, "outbound_flights": [], "return_flights": [], "no_availability": true }

// Low Fare Calendar month-grid sweep
{
  "success": true,
  "mode": "low_fare_calendar",
  "origin": "DAL", "destination": "LAS", "trip_type": "round_trip",
  "calendar": [
    {"date": "2026-06-01", "cheapest_usd": 59,  "fare_class": "wanna_get_away"},
    {"date": "2026-06-02", "cheapest_usd": 69,  "fare_class": "wanna_get_away"},
    {"date": "2026-06-03", "cheapest_usd": null, "sold_out": true}
  ],
  "perks": ["Two free checked bags", "No change fees"]
}
```
