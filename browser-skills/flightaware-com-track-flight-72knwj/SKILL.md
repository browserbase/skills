---
name: flightaware-com-track-flight-72knwj
title: FlightAware Live Flight Tracking
description: >-
  Given an airline+flight number or tail number (and optional date), return live
  FlightAware status: state, origin/destination, scheduled/estimated/actual
  times, aircraft, route, en-route position, delay, and live-map link.
website: flightaware.com
category: travel
tags:
  - aviation
  - flight-tracking
  - logistics
  - flightaware
  - travel
source: 'browserbase: agent-runtime 2026-06-04'
updated: '2026-06-04'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      Browserbase with --verified --proxies renders the same data visually and
      is the fallback if the HTTP fetch is ever blocked; confirmed working in
      testing.
  - method: api
    rationale: >-
      FlightAware AeroAPI exists but its usable tier is paid ($100 minimum) and
      exposes less than the free consumer page, so it is not recommended.
verified: true
proxies: true
---
# FlightAware Live Flight Tracking

## Purpose

Given a flight identifier — an airline + flight number (e.g. `UA 2402`) or a
registration/tail number (e.g. `N12345`) — and an optional date, return the live
flight status from FlightAware: current state, origin and destination airports
(IATA + ICAO + name + gate/terminal when shown), scheduled / estimated / actual
departure and arrival times, aircraft type and registration, filed route,
en-route position (lat/lng, altitude, ground speed, heading), delay minutes, and
a link to the live map. **Read-only** — this skill only reads public flight data
and never signs in, subscribes, or sets up alerts.

The single best source is FlightAware's own consumer flight page, which embeds
the complete flight payload as a JSON blob in the page HTML. One HTTP GET through
residential proxies returns everything — no browser, no JS execution, and far
richer data than AeroAPI's paid tier.

## When to Use

- "Where is flight UA 2402 right now / is it delayed?"
- "What's the status of American 100 today — gate, times, aircraft?"
- "Track tail number N12345 / what airport is it at?"
- "Give me the current altitude, speed, and position of an en-route flight."
- "Did flight DL100 land / is it cancelled or diverted?"
- Any time you need structured flight status (status, route, times, position)
  from a flight number or tail number.

## Workflow

The recommended method is a plain HTTP fetch of the consumer flight page plus a
parse of the embedded `trackpollBootstrap` JSON. The page is Cloudflare-fronted
with bot detection, so route the request through Browserbase's residential
proxies (`browse cloud fetch ... --proxies`). No browser session is required.

1. **Normalize the identifier.** Convert the airline+number to the **ICAO** form
   for the URL path: United 2402 → `UAL2402` (ICAO airline code + number), American
   100 → `AAL100`, Delta 100 → `DAL100`. IATA forms (`UA2402`) usually resolve too,
   but ICAO is canonical. A tail/registration (`N12345`) is used as-is.

2. **Fetch the page through proxies** (always the `www.` host — the apex
   `flightaware.com` issues a 308 redirect to `www.`):
   ```bash
   browse cloud fetch "https://www.flightaware.com/live/flight/UAL2402" --proxies
   ```
   The response is a JSON envelope; the HTML is in its `content` field.

3. **Extract the embedded payload.** Find `var trackpollBootstrap = ` in the HTML,
   then brace-match from the first `{` to its matching `}` and `JSON.parse` it:
   ```js
   const s = html.indexOf("var trackpollBootstrap = ");
   let i = html.indexOf("{", s), d = 0, end = -1;
   for (let k = i; k < html.length; k++){ const c = html[k];
     if (c === "{") d++; else if (c === "}"){ d--; if (!d){ end = k+1; break; } } }
   const boot = JSON.parse(html.slice(i, end));
   const flight = boot.flights[Object.keys(boot.flights)[0]];
   ```

4. **Map the fields** (see Site-Specific Gotchas for units and quirks):
   - `flightStatus` → state; `ident`/`iataIdent`/`friendlyIdent`/`airline`.
   - `origin` / `destination` → `{iata, icao, friendlyName, gate, terminal,
     coord:[lng,lat], TZ}`.
   - `gateDepartureTimes` / `takeoffTimes` / `landingTimes` / `gateArrivalTimes`,
     each `{scheduled, estimated, actual}` in **unix epoch seconds**. Convert to
     local using each airport's `TZ` (strip the leading `:`), and to UTC directly.
   - `aircraft.type` / `aircraft.friendlyType` / `aircraft.tail` (null when
     `redactedTail:true`).
   - For en-route flights: top-level `altitude` (hundreds of feet), `groundspeed`
     (knots), `heading` (deg); current lat/lng = last element of `track[]`.
   - `flightPlan.route` (filed route), `waypoints` (planned polyline),
     `distance.remaining` / `distance.elapsed` (statute miles).
   - Delay minutes = `(takeoffTimes.estimated - takeoffTimes.scheduled) / 60`.

5. **Pick the right date.** The bare `/live/flight/<IDENT>` shows the **most recent**
   leg. To target a specific date, read `flight.activityLog.flights[]` (recent +
   upcoming legs, each with `links.permanent` =
   `/live/flight/<IDENT>/history/<YYYYMMDD>/<HHMM>Z/<dep>/<arr>`) and fetch that
   permanent path instead.

6. **Emit JSON** per the Expected Output schema. The live-map link is the flight
   page URL itself: `https://www.flightaware.com/live/flight/<IDENT>`.

### Browser fallback

If the fetch path is ever blocked, drive the page in a Browserbase session with
stealth on (this was confirmed working):

```bash
browse open "https://flightaware.com/live/flight/UAL2402" --remote   # session created with --verified --proxies
browse get text body --remote      # or `browse snapshot` (~730 refs)
```

The rendered page shows the same data: a status badge ("EN ROUTE", "ARRIVED OVER
8 HOURS AGO", "SCHEDULED"), origin/destination cards with gates, the Departure /
Arrival Times tables, the Aircraft Info panel, and the live map. Dismiss the
OneTrust cookie banner with `#onetrust-accept-btn-handler` if it overlays content.
**Read-only — never click Sign In, Sign Up, Get Alerts, or Set Up Alerts.**

## Site-Specific Gotchas

- **The whole payload is in the HTML.** `var trackpollBootstrap = {...}` contains
  status, both airports, all four time sets, aircraft, route, track, and waypoints.
  You almost never need to drive a browser for this task.
- **Always use the `www.` host with `--proxies`.** The apex domain 308-redirects,
  and Cloudflare bot detection on `/live/flight/...` will block plain/un-proxied
  requests — residential proxies are required.
- **Coordinates are `[lng, lat]`** (GeoJSON order), not `[lat, lng]`. This applies
  to `origin.coord`, `destination.coord`, every `track[]` entry, and `waypoints`.
- **Times are unix epoch seconds.** Each airport carries its own `TZ` (e.g.
  `:America/Chicago` — strip the leading colon) for local-time conversion.
- **Altitude is in hundreds of feet.** `altitude: 340` means FL340 = 34,000 ft.
  Groundspeed is knots; heading is degrees true.
- **Live-position fields populate only when airborne.** For `scheduled`/`arrived`
  flights, top-level `altitude`/`groundspeed`/`heading`/`coord` are null. For
  en-route flights `coord` is often still null — read the **last `track[]` entry**
  for the current position.
- **Registration is frequently redacted.** `redactedTail: true` (common for United,
  Delta) → `aircraft.tail` is null and the page shows "Upgrade account to see tail
  number". This is not an error; report `registration: null`.
- **ICAO vs IATA ident:** the URL path wants ICAO (`UAL2402`); the payload exposes
  both `ident` (ICAO) and `iataIdent` (`UA2402`).
- **`flightStatus` of empty string** means an upcoming leg that hasn't gone active
  yet — treat as `scheduled`. Booleans `cancelled` / `diverted` / `resultUnknown`
  flag the abnormal states.
- **`averageDelays` is historical average (seconds), not this flight's delay.**
  Compute the actual delay from `estimated - scheduled` on the time objects.
- **Don't waste time on AeroAPI.** FlightAware's API has no useful free tier
  ($100 minimum) and returns less than this free consumer page.
- No CAPTCHA or hard block was encountered across 8+ test idents (airborne and
  arrived) when fetching through residential proxies.

## Expected Output

```json
{
  "success": true,
  "ident": "UAL2402",
  "flight_number": "UA2402",
  "status": "arrived",
  "origin":      { "iata": "IAH", "icao": "KIAH", "name": "Houston Bush Int'ctl", "city": "Houston, TX", "gate": "E3",   "terminal": "E" },
  "destination": { "iata": "EWR", "icao": "KEWR", "name": "Newark Liberty Intl", "city": "Newark, NJ",  "gate": "C107", "terminal": "C" },
  "departure": { "scheduled_utc": "2026-06-03T14:48:00Z", "estimated_utc": "2026-06-03T14:48:00Z", "actual_utc": "2026-06-03T14:48:00Z", "scheduled_local": "09:48 CDT" },
  "arrival":   { "scheduled_utc": "2026-06-03T18:27:00Z", "estimated_utc": "2026-06-03T18:25:00Z", "actual_utc": "2026-06-03T18:26:00Z", "scheduled_local": "02:27 PM EDT" },
  "aircraft_type": "B39M",
  "aircraft_type_friendly": "Boeing 737 MAX 9 (twin-jet)",
  "registration": null,
  "delay_minutes": 12,
  "route": "GUMBY3 GUSTI Q22 UMBRE QUART PHLBO4",
  "position": { "lat": null, "lng": null, "altitude_ft": null, "groundspeed_kt": null, "heading": null },
  "distance_remaining_mi": 0,
  "live_map_url": "https://www.flightaware.com/live/flight/UAL2402",
  "error_reasoning": null
}
```

En-route flight (live position populated from the last `track[]` point):

```json
{
  "success": true,
  "ident": "DAL100",
  "flight_number": "DL100",
  "status": "airborne",
  "origin":      { "iata": "ATL", "icao": "KATL", "name": "Hartsfield-Jackson Intl", "city": "Atlanta, GA",            "gate": "F8", "terminal": "I" },
  "destination": { "iata": "CDG", "icao": "LFPG", "name": "Charles de Gaulle Intl",  "city": "Paris, France",          "gate": "E1", "terminal": null },
  "aircraft_type": "A359",
  "aircraft_type_friendly": "Airbus A350-900 (twin-jet)",
  "registration": null,
  "delay_minutes": 0,
  "route": "GAIRY2 IRQ DEDDY Y436 JAINS L435 FIVZE ... ETOSA",
  "position": { "lat": 33.20, "lng": -81.13, "altitude_ft": 34000, "groundspeed_kt": 524, "heading": 110 },
  "distance_remaining_mi": 1475,
  "live_map_url": "https://www.flightaware.com/live/flight/DAL100",
  "error_reasoning": null
}
```

Not found / unrecognized identifier:

```json
{
  "success": false,
  "ident": "XX9999",
  "status": null,
  "error_reasoning": "No trackpollBootstrap payload on the page — flight identifier not recognized or no recent activity for this ident/date."
}
```

Cancelled / diverted flights set `status` to `"cancelled"` / `"diverted"` (the
payload also exposes the booleans `cancelled` / `diverted`); populate whatever
times and airports are present and leave live-position fields null.
