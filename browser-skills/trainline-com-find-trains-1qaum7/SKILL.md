---
name: trainline-com-find-trains-1qaum7
title: Trainline Train Times & Prices
description: >-
  Look up train (and bus) journey options on trainline.com for a given origin,
  destination, date, and passenger count. Returns each option's
  departure/arrival times, duration, changes, operator, fare type, and
  cheapest+first-class prices. Hybrid skill: clean public locations-search API
  for URN resolution, stealth browser deep-link for results. Read-only.
website: trainline.com
category: travel
tags:
  - travel
  - trains
  - rail
  - uk
  - europe
  - read-only
  - datadome
source: 'browserbase: agent-runtime 2026-05-22'
updated: '2026-05-22'
recommended_method: hybrid
alternative_methods:
  - method: api
    rationale: >-
      /api/locations-search/v2/search is fully open (no auth, no DataDome) — the
      URN-resolution half of the workflow is a pure API call. Required param:
      locale=en-US.
  - method: browser
    rationale: >-
      /book/results deep-link is the only practical surface for journey results.
      /api/journey-search/ POST is DataDome-gated and confirmed not callable
      from out-of-band fetches. Stealth (--verified --proxies) renders the page
      despite a cosmetic DataDome iframe overlay.
verified: true
proxies: true
---
# Trainline — Find Train Times & Prices

## Purpose

Given a one-way or return journey query — origin station, destination station, outbound date/time (and optional return), passenger count — return a structured list of train options from trainline.com (canonical host: `thetrainline.com`). Each option carries departure & arrival times, origin & destination station names, duration, number of changes, operator (carrier), cheapest and standard/first-class prices, and fare type. **Read-only — never click "Buy"; stop at the results list.**

Recommended path is **hybrid**: hit Trainline's clean public locations-search JSON API (no auth, no anti-bot) to resolve station URN codes, then open a single deep-link `/book/results?...` URL in a stealth `--verified --proxies` Browserbase session and extract the rendered journey cards. The page's underlying `/api/journey-search/` XHR endpoint is gated by DataDome cookies and is **not** directly callable; the deep-link route is the cheapest reliable surface (one navigation, no form-filling).

## When to Use

- "what are the cheapest morning trains from London to Edinburgh on 15 Jun?"
- Daily / hourly monitoring of fares on a fixed route (e.g. commute fare-tracking).
- Comparison flows across UK + European rail/bus carriers — Trainline aggregates ATOC (UK rail), Eurostar, SNCF, DB, Trenitalia, Renfe, NationalExpress (UK coach), Benerail, Distribusion, and more.
- Building itinerary suggestions when departure/arrival times matter (not just price).
- Anywhere you'd otherwise scrape the trainline.com homepage by filling form fields — the deep-link bypasses that flow entirely.

## Workflow

### 1. Resolve station URN codes via the locations-search API

```bash
browse cloud fetch \
  "https://www.thetrainline.com/api/locations-search/v2/search?searchTerm=<URLENC_TERM>&locale=en-US" \
  --proxies
```

Response shape:

```json
{
  "searchLocations": [
    {
      "name": "London",
      "code": "urn:trainline:generic:loc:182gb",
      "locationType": "stationGroup",
      "countryCode": "GB",
      "score": 1.0,
      "extraInfo": { "subtitle": "Any", "attributes": ["BusStation","category:point"] }
    },
    {
      "name": "London Euston",
      "code": "urn:trainline:generic:loc:EUS1444gb",
      "locationType": "station",
      "shortName": "EUS",
      ...
    }
  ]
}
```

- **`locale=en-US` is required** — omitting it returns `400 {"errors":[{"code":"ReferenceDataSearch.Request.Validation.Locale","detail":"The Locale field is required."}]}`. The locale value itself doesn't materially affect station results.
- `score` is sorted descending. The first hit is usually correct.
- `locationType: "stationGroup"` is a city-level "Any station" pseudo-location (e.g. "London (Any)" = `182gb`) — use this for city-name queries to maximise coverage. `locationType: "station"` is a specific terminal (e.g. `EUS1444gb` = London Euston) — use this when the user named the exact terminal.
- The endpoint has **no auth and no DataDome gate**. `browse cloud fetch --proxies` works reliably. (Proxies are not strictly required for this endpoint, but they keep the run consistent with the browser step downstream.)
- Cache the URN per `(name, countryCode)` pair — they're stable across runs.

**Known-good URNs (verified 2026-05-22)**:

| Station | URN |
|---|---|
| London (Any) | `urn:trainline:generic:loc:182gb` |
| London Euston | `urn:trainline:generic:loc:EUS1444gb` |
| London Kings Cross | `urn:trainline:generic:loc:KGX6121gb` |
| London Paddington | `urn:trainline:generic:loc:PAD3087gb` |
| London St Pancras International | `urn:trainline:generic:loc:STP1555gb` |
| London Waterloo | `urn:trainline:generic:loc:WAT5598gb` |
| Edinburgh (Waverley) | `urn:trainline:generic:loc:EDB9328gb` |

### 2. Open a stealth Browserbase session

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies \
      | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const i=s.indexOf('{');process.stdout.write(JSON.parse(s.slice(i)).id)})")
export BROWSE_SESSION="$SID"
```

`--verified --proxies` is **mandatory**. A bare session triggers DataDome blocking on `/book/results`.

### 3. Navigate to the deep-link results URL

Construct:

```
https://www.thetrainline.com/book/results
  ?origin=<URLENC origin URN>
  &destination=<URLENC destination URN>
  &outwardDate=<URLENC 2026-06-15T09:00:00>           # ISO local time, no zone suffix
  &outwardDateType=departAfter                          # or 'arriveBefore'
  &journeySearchType=single                             # 'single' | 'open-return' | 'return'
  &passengers[]=1996-01-01                              # passenger DOB, one entry per traveller
  # for return trips:
  # &returnDate=2026-06-17T17:00:00
  # &returnDateType=departAfter
```

URL-encode the URNs (`:` → `%3A`) and the `[` `]` in `passengers[]` (`%5B%5D`).

```bash
browse open "$URL" --remote --session "$SID"
browse wait load --remote --session "$SID"
browse wait timeout 5000 --remote --session "$SID"   # journey cards stream in after initial load
```

The URL bar will gain an extra `&selectedOutward=...` param after first results render — Trainline auto-selects the first journey. Ignore it.

### 4. Extract journey cards

Two extraction routes — use whichever fits your downstream needs:

**Route A — `browse get text body` (preferred for cheap text-based extraction)**

Each journey card surfaces as a roughly contiguous run of text matching:

```
{origin station name} to {destination station name}{h-and-min duration}{long duration}, {N changes}{operator}{fare type}{price}...T&C boilerplate
```

Example real text from one card:

```
London Kings Cross to Edinburgh (Waverley)4h 17m4 hours 17 minutes, 0 changesLumoFixed (Standard Class)$67.61Specified train only. No refunds. Only valid on booke...
```

Split on `to {destination station name}` (or use a regex anchored on `\d+h \d+m`) and parse each chunk.

**Route B — `browse snapshot` (preferred for structured extraction with times)**

The accessibility tree gives one `listitem` per journey card with this canonical sub-structure:

```
[X-Y] listitem                                  ← one journey card
  ...
  StaticText: departs at 9:03 am                ← departure time (12h format on en-US locale)
  StaticText: arrives at 1:32 pm                ← arrival time (suffix " +1" if next-day)
  StaticText: Plat. 1
  StaticText: estimated                         ← realtime/estimated indicator
  StaticText: London Kings Cross                ← origin station
  StaticText: Edinburgh (Waverley)              ← destination station
  group                                         ← fare options
    radio: Standard fare, cost: $88.92          ← cheapest standard-class price
    StaticText: Only 6 left                     ← (optional) seat-scarcity warning
    radio: First class fare, cost: $185.89      ← (optional) first-class price
    StaticText: Only 7 left
  button: Duration, 4 hours 29 minutes. 0 changes. Button. Click to open live tracker
    StaticText: 4 hours 29 minutes              ← duration (long form)
    StaticText: 0 changes                       ← '0 changes' = direct; otherwise 'N change(s)'
```

The button label string `"Duration, 4 hours 29 minutes. 0 changes."` is the most reliable single source — extract duration and changes from there in one regex.

**Operator name (LNER, Lumo, Avanti West Coast, TransPennine, CrossCountry, Eurostar, SNCF, Deutsche Bahn, NationalExpress, ...)** does not appear as `StaticText` in the snapshot — it's rendered as a carrier-logo image (`image: carrier logo`). It DOES appear inline in `browse get text body` between the changes count and the fare-type label. Use Route A's text path to capture the operator string.

### 5. Stop. Do not click "Buy" or proceed to fare selection.

This skill is read-only. Closing the loop with a purchase is out of scope (and belongs in a separate `trainline.com/book-ticket` skill if ever needed).

## Site-Specific Gotchas

- **Canonical host is `thetrainline.com`, not `trainline.com`**: `trainline.com` 301-redirects to `thetrainline.com`. Always issue requests to `www.thetrainline.com`.
- **DataDome anti-bot wall, with a twist**: Trainline uses DataDome (`geo.captcha-delivery.com`). The captcha iframe (`[X-Y] Iframe: Verification system` containing a `RootWebArea: You have been blocked`) **appears in the snapshot tree on a stealth session but does NOT block the underlying results from rendering**. Do not waste turns trying to solve or dismiss the iframe — read past it. Without `--verified --proxies` the entire page is replaced by the DataDome interstitial; with both flags, the iframe is cosmetic and the results panel renders normally.
- **`/api/journey-search/` is DataDome-gated and effectively closed to programmatic clients.** Confirmed not callable via `browse cloud fetch` (no DataDome cookies → 403/redirect to captcha). The deep-link URL is the only practical surface; do NOT spend iterations attempting a direct POST to `/api/journey-search/`.
- **`/api/locations-search/v2/search` IS open** — no auth, no DataDome, returns JSON. Just remember `locale=en-US` is required. This makes the locations step ~10× cheaper than driving the homepage type-ahead via the browser.
- **Currency follows session locale, not URL params.** A US-IP `--proxies` session lands on `/en-us` and shows prices in **USD**. `&currency=GBP` query param is **ignored**. `/en-gb/book/results` **404s** ("Oops! We can't find the page you're looking for") — the locale prefix isn't a real route. To get **GBP** prices, you need a UK-region proxy (set proxy country to `GB` if your Browserbase tier supports proxy-country selection) or change the user's currency by clicking the currency-switcher in the header (`button: Change language or currency` → "Pound Sterling") and then re-navigating to the results URL — the choice persists via the `tlCurrency` / `CULTURE_INFO` cookies. **Always emit the observed currency in the output JSON** rather than assuming GBP/USD.
- **Wrong URN ⇒ ghost search**: Random integer URNs (e.g. `urn:trainline:generic:loc:1006`) resolve to real-but-irrelevant European stations ("Ebersheim", "St-Jean-de-Monts Esplanade de la Mer") and render "No tickets available, please refine your search". The locations API in Step 1 is the only safe URN source — do NOT guess.
- **`passengers[]=YYYY-MM-DD` is passenger DOB, not passenger count.** Each entry is one person's date of birth, which Trainline uses to bucket fare class (`1996-01-01` → 26-59 adult, `2015-01-01` → child, `1955-01-01` → senior). For "1 adult" use `passengers[]=1996-01-01`. For "2 adults" repeat it (`passengers[]=1996-01-01&passengers[]=1996-01-01`). For railcards (16-25, Two Together, Senior), add `&railcards[]=<code>` — codes are observable in the locations API responses' `connections` array (e.g. `urn:trainline:connection:atoc`).
- **`outwardDate` is local (station) time, not UTC.** Format: `YYYY-MM-DDTHH:MM:SS`, no `Z`, no timezone offset. Trainline interprets it in the origin station's timezone.
- **`outwardDateType=departAfter` returns the next ~4-6 trains departing AT-OR-AFTER the given time.** Use `arriveBefore` if the user wants "trains arriving before X". The page shows tabs for ±3 days around the chosen date for cross-day flexibility.
- **Times on en-US locale are 12-hour ("9:03 am").** Convert to 24-hour in the output JSON for consistency. Times occasionally suffix " +1" when the train arrives the next day (overnight services like the Caledonian Sleeper).
- **Operator name is in body text only, not the snapshot.** Carrier logos appear as `image: carrier logo` in the snapshot tree without an alt label. The operator string ("LNER", "Lumo", "Avanti West Coast", etc.) IS present in `browse get text body` output, sandwiched between the "N changes" string and the fare-type label. If you need operators, use the text-body route (Route A in Step 4).
- **Cookie consent banner is non-blocking.** A "Choose Cookies / Accept Cookies" overlay appears on first session navigation. It doesn't gate the results — click "Accept Cookies" only if you want clean screenshots; otherwise skip.
- **Multiple result-pages aren't paginated, they're "Earlier / Later" buttons.** The default render shows 4-6 journeys around your requested time. To get more, click `button: Find earlier trains` (ref label "Earlier") or the analogous "Later" button. Don't expect a `&page=2` URL — there isn't one.
- **`selectedOutward=<base64>` URL suffix appears after first render.** Trainline auto-pins the first journey as selected. Ignore it for extraction; do NOT pass it back when navigating fresh.
- **Tabs for adjacent dates work:** The `tablist` near the top contains `tab: Mon, Jun 15`, `tab: Tue, Jun 16`, etc. Clicking a tab updates the results in-place — cheaper than re-navigating the deep-link URL for cross-day comparison flows.

## Expected Output

```json
{
  "success": true,
  "origin": { "query": "London", "resolved_name": "London (Any)", "urn": "urn:trainline:generic:loc:182gb" },
  "destination": { "query": "Edinburgh", "resolved_name": "Edinburgh (Waverley)", "urn": "urn:trainline:generic:loc:EDB9328gb" },
  "outward_date": "2026-06-15",
  "outward_time_requested": "09:00",
  "journey_type": "single",
  "passengers": 1,
  "currency": "USD",
  "options": [
    {
      "departure_time": "09:03",
      "arrival_time": "13:32",
      "next_day_arrival": false,
      "duration": "4h 29m",
      "duration_minutes": 269,
      "changes": 0,
      "direct": true,
      "origin_station": "London Kings Cross",
      "destination_station": "Edinburgh (Waverley)",
      "operator": "LNER",
      "fare_type": "Standard",
      "cheapest_price": "$88.92",
      "cheapest_price_value": 88.92,
      "first_class_price": "$185.89",
      "seat_warning": "Only 6 left"
    },
    {
      "departure_time": "10:30",
      "arrival_time": "14:47",
      "next_day_arrival": false,
      "duration": "4h 17m",
      "duration_minutes": 257,
      "changes": 0,
      "direct": true,
      "origin_station": "London Kings Cross",
      "destination_station": "Edinburgh (Waverley)",
      "operator": "Lumo",
      "fare_type": "Fixed (Standard Class)",
      "cheapest_price": "$67.61",
      "cheapest_price_value": 67.61,
      "first_class_price": null,
      "seat_warning": null
    }
  ],
  "error_reasoning": null
}
```

**Other outcome shapes**:

- **No journeys for date/route** → `success: true, options: [], note: "no_journeys_found"` plus the page's "No tickets available, please refine your search" copy in `error_reasoning`.
- **Origin / destination unresolved** → `success: false, error_reasoning: "could_not_resolve_<origin|destination>", search_term: "<input>"`. Don't proceed to deep-link with a guessed URN.
- **DataDome hard-block (rare; only on bare sessions)** → `success: false, error_reasoning: "datadome_blocked", note: "Re-run with --verified --proxies."` Capture the iframe URL (`geo.captcha-delivery.com/captcha/...`) and HTTP status if visible.
- **Wrong currency observed** → still return the results; emit the observed currency (`"USD"` from a US-region proxy, `"GBP"` from a UK proxy, `"EUR"` for some EU sessions) so downstream consumers can convert.
