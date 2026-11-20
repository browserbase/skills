---
name: kayak-com-compare-flights-9xc047
title: Kayak Flight Comparison
description: >-
  Search Kayak.com for flights between two airports on given dates with the full
  left-rail filter surface (stops, airlines, alliance, time windows, duration,
  layover, booking sites, amenities, bags, quality filters, sort) and return
  matching itineraries as structured JSON with per-leg detail, Best score,
  deep-link URL, and CO2 emissions badge.
website: kayak.com
category: travel
tags:
  - travel
  - flights
  - metasearch
  - kayak
  - read-only
  - anti-bot
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      No public flight-search REST or GraphQL API. Every endpoint backing the
      SPA (/i/api/search/v3/..., /s/horizon/flights/..., /api/search/V8/flight)
      responds 404 NOT_FOUND to anonymous cookieless GET — verified 2026-05-18.
      The /mvm/smartyv2/search autocomplete endpoint IS usable for resolving
      airport names to IATA codes, but it does not cover flight pricing/results.
  - method: url-param
    rationale: >-
      Kayak's results URL is fully parameterised — origin/destination/dates in
      the path, every filter dimension as ?fs=... key/value clauses. Construct
      the URL directly to skip the homepage form. This is still a browser path
      because the response is a JS-rendered SPA shell that hydrates
      progressively; the URL params just bypass the form-fill step.
verified: true
proxies: true
---
# Kayak Flight Comparison

## Purpose

Search Kayak.com for flights between two airports on a given set of dates and return matching itineraries as structured JSON. Supports round-trip / one-way / multi-city, the full passenger mix Kayak exposes (adults, students, seniors, youth, children, seat infants, lap infants), all four cabin classes, and **every left-rail filter the results page surfaces** — stops, price range, airlines, alliance, departure / arrival time windows per leg, total duration, layover constraints (min/max, allowed/disallowed airports, overnight toggle), connecting-airport include/exclude, booking-site filter, aircraft / cabin amenities (Wi-Fi, power, lie-flat, live TV), bag inclusion, quality filters (Hacker Fares, self-transfer, hidden-city), and the five sort orders Kayak supports (Cheapest, Best, Quickest, Earliest, Latest). For each itinerary returns total price (formatted + raw + currency), price source / booking site, deep-link URL, Kayak "Best" score, total duration, stop count, per-leg details (flight number, marketing + operating airline, aircraft, IATA + airport name + terminal, local depart/arrive, segment duration, layover after, fare class, baggage policy, amenities, CO2 emissions badge), the page-wide total result count, the list of active filter chips, and any "Price Predict" widget data. **Read-only — never click Select, View Deal, Book, Sign In, or Set Price Alert.**

## When to Use

- Comparing airfare across airlines / OTAs for a specific route + date without logging in.
- Daily / weekly fare monitoring for a saved route.
- Augmenting a travel-planning agent that needs structured per-leg detail (aircraft, terminals, amenities, CO2) richer than a typical metasearch JSON export.
- Anything that would otherwise click through Google Flights → individual airline sites: Kayak aggregates 100+ OTAs and airline-direct fares in one page, with consistent per-leg structure.
- **NOT** for booking. Stop at the results page; clicking "View Deal" deep-links to a third-party booking site. Use a separate booking skill for that.

## Workflow

Kayak's flight-results page is the only reliable surface. There is **no public flights-search REST or GraphQL API** — the `/mvm/smartyv2/search` autocomplete endpoint is open (returns `200 + application/json` for airport lookups) but every flight-search endpoint that backs the SPA is gated behind a session-bound CSRF token, cookies set by the SPA shell, and PerimeterX/HUMAN telemetry. Lead with scripted browsing through a Browserbase session with **residential proxies enabled and Verified browser mode enabled**. Without `--proxies`, the very first GET of any `/flights/...` URL responds `200 OK` with `<title>Please verify that you are a real user</title>` and a reCAPTCHA Enterprise challenge (sitekey `6LeueuEeAAAAAOMbwQteKH2r6w5zMZa_SqyPhUjk`) — verified by direct fetch on 2026-05-18.

### 1. Verified + residential-proxy session (mandatory)

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies | jq -r '.id')
export BROWSE_SESSION="$SID"
```

Both `--verified` and `--proxies` are mandatory. A bare session lands on the reCAPTCHA Enterprise challenge page on the very first navigation. The `solve-captchas` flag is **not** a useful shortcut — the challenge here is invisible reCAPTCHA Enterprise, not the v2 image-grid CAPTCHA that captcha-solvers target; even when "solved" the session reputation stays poisoned and subsequent searches stall.

### 2. Resolve airport names to IATA (skip if caller supplied IATA)

If the caller passed `"San Francisco"` instead of `"SFO"`, hit the autocomplete endpoint directly (no browser required) — it's the same JSON the homepage typeahead consumes:

```
GET https://www.kayak.com/mvm/smartyv2/search
    ?searchTerm=<URL-encoded city or airport name>
    &searchScope=ORIGIN_DESTINATION_FLIGHT
    &clientId=horizon
```

Returns an array of suggestion objects keyed by display name; the IATA code lives on the `airportCode` / `code` field. Empty array means "no match" — surface `airport_not_resolved`. The param shape is finicky; if a 200+`[]` comes back, retry with `searchScope=FLIGHT` and `searchScope=AIRPORTS` before giving up.

### 3. Build the results URL directly

Kayak's results URL is fully parameterised in the path + querystring — there is no need to fill the homepage search form, which costs a full round-trip and gives anti-bot more telemetry to chew on.

| Trip shape | URL pattern |
|---|---|
| Round-trip | `/flights/{ORIGIN}-{DEST}/{YYYY-MM-DD}/{YYYY-MM-DD}` |
| One-way | `/flights/{ORIGIN}-{DEST}/{YYYY-MM-DD}` |
| Multi-city | `/flights/{O1}-{D1}/{YYYY-MM-DD}/{O2}-{D2}/{YYYY-MM-DD}/.../{ON}-{DN}/{YYYY-MM-DD}` |

Append querystring params for everything else:

- **Passengers**: `?adults=1&students=0&seniors=0&youth=0&children=0&seatinfant=0&lapinfant=0`. Children/youth/seat-infants/lap-infants are encoded as digit-suffixed counts; ages of children & youth are part of the path on some locales (`/flights/SFO-JFK/2026-08-15/children5-12`). Default to omitting passenger params when count is 0 — Kayak interprets an absent param as 0.
- **Cabin**: append `/business`, `/premium`, or `/first` as a trailing path segment (e.g. `/flights/SFO-JFK/2026-08-15/2026-08-22/business`). Omit for Economy.
- **Sort**: `?sort=bestflight_a` (Best, default), `price_a` (Cheapest), `duration_a` (Quickest), `depart_a` / `depart_d` (Earliest / Latest departure), `arrive_a` / `arrive_d` (return-leg sorts).
- **Stops**: `?fs=stops=0` (Nonstop only), `stops=-2` (Nonstop + 1 stop), `stops=~0` (exclude nonstop). Multiple stop filters comma-separated.
- **Airlines**: `?fs=airlines=UA,DL,AA` (include only); prefix a single code with `~` to exclude (`airlines=~B6`).
- **Alliance**: `?fs=alliance=STAR,ONE,SKY`.
- **Times** (24h, separate sliders for outbound and return): `?fs=takeoff=0,12;1320,1740` (outbound 0:00-12:00 AND return 22:00-05:00 next-day). Format is `start_min,end_min` per leg, semicolon-separated. Same shape for `landing=` (arrival window).
- **Total duration**: `?fs=legdur=-720` (max 12h per leg) or `tripdur=-1080`.
- **Layover**: `?fs=layoverdur=60,360` (min/max minutes), `layoverair=DFW,ORD` (allow only), `~layoverair=ATL` (exclude), `overnight=true|false`.
- **Connecting airports**: covered by `layoverair=`.
- **Booking sites**: `?fs=providers=Expedia,Priceline,United` (include); add `excludeBE=true` to hide Basic Economy.
- **Amenities**: `?fs=cfeat=WIFI,POWER,LIE_FLAT,LIVE_TV` (Kayak surfaces these only when present in the result set).
- **Bags**: `?fs=baginclusion=CARRY_ON,CHECKED`.
- **Quality**: `?fs=virtualinterline=true` (Hacker Fares), `selftransfer=true`, `hiddencity=true` (the toggle is only exposed when at least one such itinerary exists).

Send all `fs=` clauses as a single comma-separated value (Kayak parses them as one composite filter blob), e.g. `?fs=stops=0;airlines=UA,DL;legdur=-540`.

### 4. Navigate and wait for the result-count header

```bash
browse open "$URL" --remote --session "$SID"
browse wait load
# Kayak hydrates results progressively after `load` fires. The skeleton
# placeholders (class `Hv20-skeleton` / `nrc6-skeleton`) animate while React
# is fetching. Wait for the "X results" header to appear and stabilize.
browse wait selector '[class*="nrc6-content"][data-testid="result-count"]' --timeout 30000
browse wait timeout 2000   # final settle - the result count itself ticks up as more sources land
browse snapshot
```

If the snapshot title reads "Please verify that you are a real user", or the URL has bounced to `https://www.kayak.com/security/p2.html` or `/security/captcha`, you've hit the bot wall — screenshot and emit `captcha_wall` (see Site-Specific Gotchas).

### 5. Apply filters via the left rail when URL-param paths fail

Most filter dimensions can be set via `fs=` (above) without DOM interaction. If a filter doesn't apply (Kayak silently ignores some `fs=` keys for certain routes / dates), fall back to clicking the left-rail control:

- "Stops" radio group: refs `Nonstop`, `1 stop`, `2+ stops` — these are checkboxes, not radios; multi-select.
- "Price" slider: `browse fill` on the `[data-testid="price-min-input"]` / `price-max-input` text inputs.
- "Airlines": expand the "Airlines" accordion (`button: Airlines`), then check each `checkbox` by airline name. Kayak shows the per-airline price next to the checkbox label — useful for "cheapest by airline" extraction.
- "Times": two range sliders per leg; use `browse fill` on the four numeric inputs (`takeoff-start-input`, `takeoff-end-input` × 2 legs).

After any DOM-level filter change, the result list re-fetches — re-run the `wait selector + wait timeout 2000` block before re-snapshotting.

### 6. Lazy-load via "Show more results"

Kayak shows ~10 itineraries on first render. The "Show more results" button at the bottom of the column fetches the next 15. Loop until you have enough or the button disappears:

```bash
while [ "$(browse get text 'button:has-text("Show more results")' 2>/dev/null)" != "" ]; do
  browse click 'button:has-text("Show more results")'
  browse wait timeout 2500    # batch fetches in ~2s
  CURRENT=$(browse eval 'document.querySelectorAll("[data-resultid]").length')
  [ "$CURRENT" -ge "$LIMIT" ] && break
done
```

### 7. Extract result cards

Each itinerary is a `div[data-resultid]` (string id, NOT a numeric Kayak id — it's a base64 hash of the legs). Stable selectors as observed in production HTML; verify with `browse snapshot` before parsing:

| Field | Selector / extraction |
|---|---|
| `kayak_id` | `[data-resultid]` attribute value |
| `price.formatted` | `.f8F1-price-text` text |
| `price.amount` | parse numeric from above (strip currency symbol) |
| `price.currency` | inferred from symbol; verify with `<html lang>` + Kayak geo cookie. Default USD on `.com`. |
| `price_source` | `.providerName` or `.M_JD-provider-name` |
| `deep_link` | `a.Iqf3` href (this opens the booking site in a new tab — do NOT navigate; record only) |
| `best_score` | `.c_xkP-best-flight-score` (only present when sort=best) |
| `total_duration_minutes` | parse `.vmXl-mod-variant-default` (e.g. "11h 15m") |
| `stop_count` | parse `.JWEO-stops-text` (e.g. "nonstop", "1 stop", "2 stops") |
| `co2_emissions` | `.PTeO-co2-emission-badge` / `.GAaH-eco-label` ("12% lower emissions") |
| `legs` | iterate `.hJSA-mod-variant-default` blocks; outbound is first, return is second |

Within each leg:

| Field | Selector |
|---|---|
| `flight_number` | `.gQ6A` or `.airline-text` carrier code + flight number; expand details with `.dPzX-mod-variant-default` ("X details") button if hidden |
| `marketing_airline` | `.J0g6-operator-text` |
| `operating_airline` | "Operated by X" line inside the expanded details panel; absent → same as marketing |
| `aircraft` | "Aircraft" row in expanded details panel |
| `origin.iata`, `destination.iata` | `.EFvI-airport-info` 3-letter code |
| `origin.name`, `destination.name` | tooltip on the IATA span (long airport name) |
| `terminal` | "Terminal X" text in the expanded panel; often absent |
| `depart_local`, `arrive_local` | `.VY2U` (time) + the date header above the card; combine to ISO local |
| `segment_duration_minutes` | parse "Xh Ym" from `.xdW8-mod-variant-default` |
| `layover_after_minutes` | "Xh Ym layover in YYY" between segments |
| `fare_class` | "Main cabin" / "Basic economy" badge — usually only shown when filter includes Basic |
| `baggage` | "Carry-on included" / "Checked bag $35" lines below the price |
| `amenities` | icon row near segment details (Wi-Fi, power, etc.) |

### 8. Capture page metadata

- **Total result count**: `[data-testid="result-count"]` text ("412 of 412 results").
- **Active filter chips**: list of `.Iqt3-chip` text values along the top of the result column.
- **Price Predict**: `.Hp2v-pricepredict-widget` block, if present — extract `recommendation` ("Buy" / "Wait") and `confidence` ("High" / "Medium" / "Low") text. Do **not** click "Track prices" or "Get alerts".

### 9. Release the session

```bash
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

## Site-Specific Gotchas

- **READ-ONLY.** Never click "Select", "View Deal", "Book", "Sign In", or "Set Price Alert". "View Deal" deep-links to a third-party booking site (Expedia, Priceline, airline-direct) and starts a session there; it counts as engagement and skews Kayak's bot signal even if the user never books.
- **Residential proxies (`--proxies`) are MANDATORY.** Without them, the very first GET to any `/flights/...` URL returns `200 OK` with `<title>Please verify that you are a real user</title>` + Google reCAPTCHA Enterprise (sitekey `6LeueuEeAAAAAOMbwQteKH2r6w5zMZa_SqyPhUjk`). Verified by direct fetch 2026-05-18 — both `flights/SFO-JFK/2026-08-15/2026-08-22` and `flights/SFO-JFK/2026-08-15` served the same 4954-byte reCAPTCHA shell when fetched without proxy. With `--proxies` enabled, the same URLs return the rendered SPA shell (>1MB). Datacenter proxies are reportedly NOT enough — must be residential.
- **`--verified` is also required for stable runs.** Even with residential proxies, a bare-Verified session occasionally lands on a soft challenge page (Kayak's "Just checking…" interstitial) on the second or third search. Browserbase Verified mode (`--verified`) ships a clean fingerprint that survives multiple consecutive searches.
- **`--solve-captchas` does not help.** The challenge is invisible reCAPTCHA Enterprise, not v2 image-grid. Captcha-solvers don't beat the risk score; meanwhile the session reputation stays poisoned and downstream `/flights/` navigations stall on skeleton placeholders that never hydrate.
- **The robots.txt explicitly disallows `/flights/`.** Every flight-search URL is `Disallow: /flights/` while only the bare `/flights/$` landing is allowed. This is bot-policy signaling — respect it for any unattended bulk crawling; for one-off interactive queries the wall is reCAPTCHA Enterprise, not robots-policy.
- **No public flight-search REST or GraphQL API.** Every endpoint backing the SPA (`/i/api/search/v3/...`, `/s/horizon/flights/...`, `/api/search/V8/flight`) responds `404 NOT_FOUND` to anonymous cookieless GET — verified 2026-05-18. The page-bound XHRs require a session cookie + CSRF token minted by the SPA shell itself. Don't waste cycles trying to bypass.
- **`/mvm/smartyv2/search` autocomplete IS reachable** and returns `200 + application/json` for airport lookups without auth or proxy — useful for resolving city names to IATA codes cheaply before the expensive browser step. The param shape is fragile; if a `200 + []` empty array comes back, retry with different `searchScope` values (`ORIGIN_DESTINATION_FLIGHT`, `FLIGHT`, `AIRPORTS`).
- **Browserbase Fetch API can't return the rendered results page** — `502 The response body exceeded the maximum allowed size of 1MB` when fetching any `/flights/...` URL with proxies. This means `browse cloud fetch` is a non-starter for extraction; a browser session is the only path.
- **Progressive hydration.** After `wait load` the page is mostly skeleton placeholders for 3–8 seconds while React polls Kayak's backend for results from 100+ providers. Wait for `[data-testid="result-count"]` to appear AND for its text to include the word "results" (not "Searching..."), then `wait timeout 2000` for the count to stabilize. Snapshotting before the count stabilizes returns half the itineraries and noisy duplicates.
- **Result count ticks up as providers land.** Final count is only set when the header reads "X of X results" — while still loading it shows "X results" without "of". Pollers using only the first number will under-count.
- **"Show more results" lazy-loads in batches of 15.** First page is ~10 itineraries; each click adds ~15. Click rate-limit is roughly 1 click / 2.5 seconds; faster clicks queue and produce duplicate cards. The button disappears when all results are loaded — that's the loop terminator.
- **`data-resultid` is a base64 hash, not a stable Kayak id.** It changes between sessions, so don't use it as a cross-session de-dupe key. For de-duping use `(airline_code, flight_number, depart_local)` of the first segment.
- **Deep-link URLs expire.** The `View Deal` href contains a session-bound token; record it but expect it to 404 after ~30 minutes. For long-term storage record the canonical airline + flight numbers + dates and rebuild the search on demand.
- **Sort order changes the result set, not just the order.** "Cheapest" surfaces Basic Economy and Hacker Fares; "Best" suppresses some self-transfer itineraries. To get the full set, run two queries (Cheapest + Best) and union by flight tuple.
- **Hacker Fares (`virtualinterline`) and Hidden-City (`hiddencity`) are off by default** and the toggles only appear when at least one such itinerary exists in the result set. If the caller asks for hidden-city specifically and the toggle is absent, that means none exist for the date.
- **Currency follows the storefront, not the user**. `.com` defaults to USD; `.co.uk` to GBP. To force currency, set the `c_curr` cookie (`c_curr=EUR`) before the first navigation, or use the country-specific subdomain.
- **`overnightlayover=true` is a special case**: layovers that cross midnight LOCAL TIME at the connecting airport, not 8h+ layovers. Kayak's definition is stricter than most metasearch engines.
- **CO2 emissions badges**: "X% lower emissions" is relative to Kayak's average for the route, not absolute kg-CO2. Absolute values are NOT exposed in the result-card HTML — they require expanding the leg detail panel and parsing the "Emissions estimate" row, which only appears for ~40% of itineraries.
- **Captcha-wall outcome**: If the snapshot title is "Please verify that you are a real user" or the URL bounced to `/security/p2.html` or `/security/captcha`, the session is poisoned. Screenshot the wall, release the session, create a new one with fresh proxy IP, retry once. After two consecutive walls, emit `success: false, error_reasoning: "captcha_wall"` and ship the screenshot — don't burn another $1+ on a third Verified-spend retry.

## Expected Output

Four distinct outcome shapes:

```json
// Successful search with results
{
  "success": true,
  "search": {
    "origin": "SFO",
    "destination": "JFK",
    "outbound_date": "2026-08-15",
    "return_date": "2026-08-22",
    "trip_type": "round_trip",
    "passengers": {
      "adults": 1, "students": 0, "seniors": 0, "youth": 0,
      "children": 0, "seat_infants": 0, "lap_infants": 0
    },
    "cabin": "economy",
    "currency": "USD"
  },
  "filters_applied": {
    "stops": ["nonstop"],
    "airlines_include": [],
    "airlines_exclude": [],
    "alliance": [],
    "price_min": null,
    "price_max": null,
    "takeoff_outbound": null,
    "takeoff_return": null,
    "landing_outbound": null,
    "landing_return": null,
    "max_trip_duration_minutes": null,
    "layover_min_minutes": null,
    "layover_max_minutes": null,
    "layover_airports_allow": [],
    "layover_airports_exclude": [],
    "overnight_layover": null,
    "booking_sites": [],
    "exclude_basic_economy": false,
    "amenities": [],
    "bags_required": [],
    "hacker_fares": false,
    "self_transfer": false,
    "hidden_city": false,
    "sort": "best"
  },
  "result_count_total": 412,
  "result_count_returned": 5,
  "active_filter_chips": ["Nonstop"],
  "price_predict": {
    "recommendation": "Wait",
    "confidence": "Medium",
    "message": "Prices likely to drop in the next 7 days."
  },
  "itineraries": [
    {
      "kayak_id": "g1Xb...base64hash",
      "price": {"formatted": "$487", "amount": 487, "currency": "USD"},
      "price_source": "Expedia",
      "deep_link": "https://www.kayak.com/book/flight?code=...",
      "best_score": 9.4,
      "total_duration_minutes": 372,
      "stop_count": 0,
      "co2_emissions": {"label": "12% lower emissions", "delta_pct": -12, "kg_co2": null},
      "legs": [
        {
          "direction": "outbound",
          "flight_number": "UA 528",
          "marketing_airline": "United",
          "operating_airline": "United",
          "aircraft": "Boeing 777-200",
          "origin": {"iata": "SFO", "name": "San Francisco Intl", "terminal": "3"},
          "destination": {"iata": "JFK", "name": "John F. Kennedy Intl", "terminal": "7"},
          "depart_local": "2026-08-15T07:15",
          "arrive_local": "2026-08-15T15:45",
          "segment_duration_minutes": 330,
          "layover_after_minutes": 0,
          "fare_class": "Main Cabin",
          "baggage": {"carry_on_included": true, "checked_bag_included": false},
          "amenities": {"wifi": true, "power": true, "lie_flat": false, "live_tv": false}
        },
        {
          "direction": "return",
          "flight_number": "UA 633",
          "marketing_airline": "United",
          "operating_airline": "United",
          "aircraft": "Boeing 757-200",
          "origin": {"iata": "JFK", "name": "John F. Kennedy Intl", "terminal": "7"},
          "destination": {"iata": "SFO", "name": "San Francisco Intl", "terminal": "3"},
          "depart_local": "2026-08-22T18:30",
          "arrive_local": "2026-08-22T22:12",
          "segment_duration_minutes": 402,
          "layover_after_minutes": 0,
          "fare_class": "Main Cabin",
          "baggage": {"carry_on_included": true, "checked_bag_included": false},
          "amenities": {"wifi": true, "power": true, "lie_flat": false, "live_tv": false}
        }
      ]
    }
  ]
}

// Search returned zero results
{
  "success": true,
  "search": { /* ...same shape... */ },
  "filters_applied": { /* ... */ },
  "result_count_total": 0,
  "result_count_returned": 0,
  "active_filter_chips": ["Nonstop", "Under $300"],
  "price_predict": null,
  "itineraries": []
}

// reCAPTCHA Enterprise wall encountered
{
  "success": false,
  "error_reasoning": "captcha_wall",
  "wall_type": "recaptcha_enterprise",
  "sitekey": "6LeueuEeAAAAAOMbwQteKH2r6w5zMZa_SqyPhUjk",
  "screenshot_path": "screenshots/03-recaptcha-wall.png",
  "search": { /* echoed back so caller can retry */ }
}

// Airport name could not be resolved to an IATA code
{
  "success": false,
  "error_reasoning": "airport_not_resolved",
  "unresolved_query": "Saint-Pierre",
  "search": { /* echoed back */ }
}
```
