---
name: mvg-de-plan-route-tn9m0v
title: MVG Route Planning (Munich)
description: >-
  Plan a public-transport route between two stops in the Munich (MVV) network —
  returns leg-by-leg lines, departure/arrival times, real-time delays,
  intermediate stops, walking transfers, and ticketing-zone info. Read-only;
  never books.
website: mvg.de
category: transportation
tags:
  - transit
  - munich
  - routing
  - public-transport
  - read-only
  - json-api
source: 'browserbase: agent-runtime 2026-05-20'
updated: '2026-05-20'
recommended_method: api
alternative_methods:
  - method: url-param
    rationale: >-
      https://www.mvg.de/verbindungen.html?from={name}&to={name}&lang=en
      auto-fills and auto-submits the search on page load. Useful for
      human-readable verification or screenshotting; never needed for data
      extraction since the underlying API powering it (bgw-pt/v3) is callable
      directly without auth.
  - method: browser
    rationale: >-
      The verbindungen.html page renders results via XHR after the deep link
      auto-submits; a11y tree's `listbox: Routenergebnisse` holds parseable
      option strings. Falls back to this only when the JSON API is unreachable —
      pays ~50× cost premium and the autocomplete dropdown is invisible to the
      a11y tree, so the deep-link URL is the only viable browser route.
verified: false
proxies: false
---
# MVG Route Planning (Munich)

## Purpose

Given two stops/locations in the Munich (MVV) public-transport network, return one or more route options with full leg-by-leg details — lines, departure/arrival times, real-time delays, intermediate stops, walking transfers, ticketing zones, and active service disruptions. Read-only — never books a ticket and never opens the customer portal.

The MVV network covers Munich + Greater Munich (S-Bahn, U-Bahn, Tram, Bus, MVV regional bus, and "Bahn" regional rail). Stops in neighboring transit authorities (Ingolstadt, Nürnberg, Landshut, Wolfratshausen, etc.) are also resolvable through the same `globalId` namespace, but their fare zones return empty (`ticketingInformation.zones: []`) because they fall outside the MVV tariff.

## When to Use

- "How do I get from {A} to {B} in Munich [right now | at HH:MM | to arrive by HH:MM]?"
- Daily commute checks: "next train from {home stop} to {work stop}" with real-time delay info.
- Comparing options filtered by mode (e.g. U-Bahn only, no buses, walking only).
- Extracting structured route data (lines, transfer stops, polylines) for downstream display or trip-planning UIs.
- **NOT** for ticket purchasing — use the MVGO app / kundenportal flow instead. This skill stops at the route-suggestions stage.

## Workflow

MVG's public website is a thin client over a JSON REST API at `https://www.mvg.de/api/bgw-pt/v3`. **No auth, no cookies, no anti-bot stealth, no residential proxy** — verified clean 200s direct from a bare sandbox IP. Lead with the API; the browser path works (and is faster than typical because the deep-link URL params auto-submit), but pays a ~50× cost premium and gets you a JS-rendered DOM you have to scrape.

### 1. Resolve each stop name to a `globalId`

`GET https://www.mvg.de/api/bgw-pt/v3/locations?query={text}` — `text` is a partial stop name or street address. Returns an array of up to 50 location matches, ordered by relevance + proximity. Each match has:

```json
{
  "latitude": 48.137245, "longitude": 11.575421,
  "place": "München", "name": "Marienplatz",
  "globalId": "de:09162:2", "divaId": 2,
  "transportTypes": ["SBAHN","UBAHN","BUS"],
  "tariffZones": "m",
  "type": "STATION"
}
```

Pick the right match by `place` (city) + `transportTypes` (mode you care about). Munich proper is `place: "München"`. **Be careful with `Hauptbahnhof`** — Munich alone has four distinct stops with that name (`de:09162:6` for the U-Bahn/Tram hub, `de:09162:100` for the main S-Bahn/regional-rail "München Hbf", `de:09162:7000` Hauptbahnhof Nord, `de:09162:5000` Hauptbahnhof Süd) — each lives on a different platform and routing between them requires walking. Disambiguate by transport mode or by asking the user which entrance.

Empty query → `400 getLocations.query: must not be blank`. Nonsense query (e.g. `xyzqwerasdf`) → `200 []`. Always check the array length before indexing.

### 2. Request routes

`GET https://www.mvg.de/api/bgw-pt/v3/routes?originStationGlobalId={A}&destinationStationGlobalId={B}` — minimum required params. Returns an array of route options (typically 5–7) covering the next ~30 minutes of departures.

**Optional params** (verified accepted):

| Param | Value | Effect |
|---|---|---|
| `routingDateTime` | ISO 8601 UTC with `.000Z`, e.g. `2026-05-21T08:00:00.000Z` | Anchor search to a specific time. **Must be UTC with explicit `Z` suffix** — `2026-05-21T08:00:00` without `Z` returns 400; `+02:00` offset also returns 400. The server applies Munich TZ (`Europe/Berlin`, UTC+1/+2) internally — `08:00Z` in summer → `10:00` Munich local. |
| `routingDateTimeIsArrival` | `true` / `false` (default false) | When `true`, treat `routingDateTime` as the desired arrival time; the planner works backwards. |
| `transportTypes` | CSV of `UBAHN,SBAHN,TRAM,BUS,BAHN,PEDESTRIAN` | Restrict to a mode subset. `transportTypes=PEDESTRIAN` returns a single walking-only route. |
| `offsetInMinutes` | integer | Search starting now + N minutes (alternative to `routingDateTime`). |
| `originLatitude` + `originLongitude` + `destinationLatitude` + `destinationLongitude` | floats | Lat/lon fallback when one or both endpoints are addresses rather than stops. Result will include a leading/trailing `PEDESTRIAN` part to/from the nearest stop. |

Unknown / mistyped params are silently dropped (the API does not echo back validation errors for typos).

### 3. Decode the response

Top-level is an array; each element is one route option with:

```json
{
  "uniqueId": -1166858465652141928,
  "parts": [ /* one entry per leg — see below */ ],
  "ticketingInformation": { "zones": [0], "alternativeZones": [], "unifiedTicketIds": ["9999","KURZE",...] },
  "distance": 1179.55,
  "bannerHash": "",
  "refreshId": "H4sIAAAA…"     // opaque token used by the website for live refresh
}
```

Each `parts[i]` is one leg of the journey:

```json
{
  "from": { "name": "Marienplatz", "place": "München",
            "stationGlobalId": "de:09162:2", "stationDivaId": 2,
            "latitude": 48.137312, "longitude": 11.57534,
            "platform": 2, "platformChanged": false,
            "plannedDeparture": "2026-05-20T20:40:00+02:00",
            "departureDelayInMinutes": 3,
            "transportTypes": ["UBAHN","BUS","SBAHN"],
            "occupancy": "UNKNOWN",
            "hasZoomData": true,             // escalator/elevator live data is published
            "hasOutOfOrderEscalator": true,  // accessibility flag
            "hasOutOfOrderElevator": false },
  "to":   { /* same shape; uses `arrivalDelayInMinutes` instead of departure */ },
  "intermediateStops": [ /* same shape as from/to per intermediate stop */ ],
  "line": { "label": "S8", "transportType": "SBAHN", "destination": "Herrsching",
            "trainType": "", "network": "ddb", "divaId": "92M08", "sev": false },
  "noChangeRequired": false,
  "pathPolyline": "eyxdHitseAw@bGi@...",      // encoded Google polyline of the leg
  "interchangePathPolyline": "",              // walk path between platforms when changing trains
  "pathDescription": [],
  "exitLetter": "",                           // station exit letter (e.g. "B"), when known
  "distance": 1179.55,
  "occupancy": "UNKNOWN",
  "messages": [],
  "infos": [{ "message": "Technischer Defekt am Bahnhof", "type": "INCIDENT", "network": "ddb" }],
  "realTime": true                             // true ⇒ the times include live data; false ⇒ schedule only
}
```

- **Lines**: `line.label` is the public line designation — `S1`–`S8` for S-Bahn, `U1`–`U8` for U-Bahn, integer (e.g. `53`) for buses, `12`/`17`/`19`/etc. for trams. `line.transportType` is one of `UBAHN | SBAHN | TRAM | BUS | BAHN | PEDESTRIAN`. Walking legs have `line.label: "Fussweg"`, `transportType: "PEDESTRIAN"`, `network: "unknown"`.
- **Delays**: `from.departureDelayInMinutes` and `to.arrivalDelayInMinutes` are absent when zero or when no real-time data is available; check `realTime: true` on the part before trusting them. The website renders these as `+3 Minuten Verspätung`.
- **Disruption messages**: `infos[]` carries `INCIDENT` / `MESSAGE` / `STRIKE` etc.; surface these prominently.
- **Total trip duration**: not a top-level field — compute from `parts[0].from.plannedDeparture` to `parts[-1].to.plannedDeparture` (yes, the last part's `to` uses `plannedDeparture` as its arrival timestamp; there is no separate `plannedArrival` field).
- **Ticketing**: `ticketingInformation.zones` is the MVV fare-zone set ("m" = inner Munich = zone `0`; outer zones are integers `1..6`). Empty `zones: []` means the trip crosses out of MVV (e.g. into VGN around Nürnberg) and the fare is not auto-computable.
- **Polylines**: `pathPolyline` uses the standard Google encoded polyline format; decode with `polyline` libraries when rendering on a map.

### 4. Format and return

Emit one of the shapes in **Expected Output**. Always include real-time delay context and any `infos[]` messages so the caller can decide whether to surface a service warning.

### Browser fallback

If the JSON API is unreachable (rate-limited or under maintenance — neither observed in iter-1 testing), navigate the deep-link URL directly:

```
https://www.mvg.de/verbindungen.html?from={URL-encoded stop name}&to={URL-encoded stop name}&lang=en
```

The site auto-fills the form and **auto-submits the search immediately on page load** — no `click` calls needed. After `browse wait load && browse wait timeout 3000`, the `lib-connection-results` element holds a `listbox: Routenergebnisse` with `option:` rows. Each option's accessible name has the shape `Departure HH:MM - Arrival HH:MM Duration NN Min … Take the S-Bahn SX in the direction of {term} … +N Minuten Verspätung`. Parse those fields out of the a11y tree (don't rely on visual CSS classes — they're shadow-DOM Wastl components).

**Browser caveats**:

- The autocomplete dropdown is NOT in the accessibility tree — `browse snapshot` won't see the suggestion list when typing in the stop fields. The deep-link URL bypasses this entirely.
- `?fromStation=de:09162:2&toStation=de:09162:100` style globalId deep-links do **not** auto-fill the form — only the textual `?from=…&to=…` variant works.
- The driver daemon tends to hang after rapid sequential `fill / press ArrowDown / press Enter` cycles against the form fields. The deep-link path is more reliable than scripting the typeahead.
- The website's form-submit does not change the URL — results render in-place via XHR, so you cannot recover the result URL after a manual fill+submit.

## Site-Specific Gotchas

- **No auth, no anti-bot, no proxy needed.** Verified 200s direct from a bare sandbox IP for both `/api/bgw-pt/v3/locations` and `/api/bgw-pt/v3/routes`. Stealth + residential proxy adds latency without changing the result.
- **`fib/v2/*` and `fib/v3/*` are dead paths** — both return the MVG 404 HTML page wrapped in a 200 response (the page is 200; its body is the 404 view). Don't waste time on them. The only working API prefix in 2026-05 is `/api/bgw-pt/v3/`.
- **`routingDateTime` requires UTC with explicit `Z`**. `2026-05-21T08:00:00.000Z` works; bare `2026-05-21T08:00:00` and `…+02:00` both return 400. The server applies Munich TZ (`Europe/Berlin`, CET/CEST) internally — `08:00Z` in summer becomes `10:00` Munich local.
- **The query param is `originStationGlobalId` (camelCase, `Station` in the middle).** Variants like `originGlobalId`, `fromStationGlobalId`, `origin` all return `400 You must provide either station global id or coordinate for origin`. Get the casing wrong and you get nothing.
- **Munich has four distinct "Hauptbahnhof" stops with different `globalId`s** — `de:09162:6` (U-Bahn/Tram), `de:09162:100` ("München Hbf" S-Bahn/regional-rail), `de:09162:7000` (Hauptbahnhof Nord), `de:09162:5000` (Hauptbahnhof Süd). A naive routing between the first two yields a 16-minute *walking* route because they're on opposite ends of the station complex. When the user says "Hauptbahnhof", ask which mode they're using, or default to `de:09162:100` (S-Bahn entrance) for arrivals and `de:09162:6` (U-Bahn entrance) for departures depending on context.
- **Non-existent `globalId` returns `200 []` silently.** No 4xx error, no warning — just an empty array. Always validate that the locations call returned a real match before passing the id to `/routes`, and check `routes.length > 0` before assuming success.
- **Empty `locations.query=` returns `400 getLocations.query: must not be blank`** — the only documented validation error. Treat as user-input error, prompt for a non-empty query.
- **Top-level `distance` and per-part `distance` are in meters** (floats). The Munich U-Bahn/S-Bahn ring averages 1–2 km between adjacent inner stops; trips with `distance > 30000` are likely crossing into MVV outer zones or out of MVV entirely.
- **No `plannedArrival` field.** The last leg's `to.plannedDeparture` doubles as the trip's arrival timestamp. (Yes, it's named `plannedDeparture` even on the destination — that's an API quirk, not a typo.)
- **`ticketingInformation.zones: []` means out-of-MVV.** Cross-network trips (Munich Hbf → Ingolstadt, Munich → Nürnberg via S-Bahn + Regional) return parts populated but no zone info, because the MVV tariff doesn't apply. The `unifiedTicketIds` list is the canonical answer for in-zone fares — `STK-K-1` is a single short trip, `TKK` is a Kurzstrecke, `BT-XY` are day tickets, `E365J`/`E365M` are the Deutschland-Ticket annual fares.
- **`viaStationGlobalId` parameter is accepted (200) but does not appear to enforce the via stop** — observed `isViaStop: false` on all intermediate stops in the response, and the routes returned didn't go through the requested via. If a strict via-stop constraint matters, post-filter routes whose `parts[i].intermediateStops[]` or part boundaries actually include the via id.
- **`refreshId` is an opaque token for the website's auto-refresh feature** — base64+gzip blob with internal state. Not stable across calls; don't try to parse, just pass through if you're proxying the response for the website's UI.
- **Real-time delays only on the day-of.** Routes scheduled for tomorrow or later return `realTime: false` and omit `*DelayInMinutes` fields entirely. Don't promise live delays on multi-day-ahead plans.
- **The MVG marketing site does not expose this API in its docs.** It's a private endpoint powering the public `verbindungen.html` widget. It can change without notice — the `bgw-pt/v3` namespace replaced an older `fahrinfo` API around 2024. If queries start returning 404, check the network tab of `verbindungen.html` for the current path.

## Expected Output

Three outcome shapes:

```json
// Success — one or more routes returned
{
  "success": true,
  "origin":      { "name": "Marienplatz",   "globalId": "de:09162:2",   "place": "München" },
  "destination": { "name": "München Hbf",    "globalId": "de:09162:100", "place": "München" },
  "departureWindow": { "from": "2026-05-20T20:40:00+02:00", "to": "2026-05-20T20:56:00+02:00" },
  "routes": [
    {
      "departure": "2026-05-20T20:40:00+02:00",
      "arrival":   "2026-05-20T20:43:00+02:00",
      "departureDelayMin": 3,
      "arrivalDelayMin":   3,
      "durationMin":       3,
      "distanceMeters":    1180,
      "ticketingZones":    [0],
      "transfers":         0,
      "legs": [
        {
          "mode": "SBAHN",
          "line": "S8",
          "directionHeadsign": "Herrsching",
          "from": { "name": "Marienplatz", "platform": 2, "departure": "2026-05-20T20:40:00+02:00", "delayMin": 3 },
          "to":   { "name": "München Hbf",  "platform": 2, "arrival":   "2026-05-20T20:43:00+02:00", "delayMin": 3 },
          "intermediateStops": [{ "name": "Karlsplatz (Stachus)", "arrival": "2026-05-20T20:42:00+02:00" }],
          "isWalk": false,
          "realTime": true,
          "infos": [{ "message": "Technischer Defekt am Bahnhof", "type": "INCIDENT" }]
        }
      ]
    }
  ]
}

// Stop lookup ambiguous — multiple top-tier candidates in Munich
{
  "success": false,
  "reason": "ambiguous_stop",
  "field": "origin",                              // or "destination"
  "query": "Hauptbahnhof",
  "candidates": [
    { "name": "Hauptbahnhof (U, Tram)", "globalId": "de:09162:6",   "place": "München", "transportTypes": ["BAHN","UBAHN","TRAM"] },
    { "name": "München Hbf",             "globalId": "de:09162:100", "place": "München", "transportTypes": ["BAHN","SBAHN","BUS"] },
    { "name": "Hauptbahnhof Nord",       "globalId": "de:09162:7000","place": "München", "transportTypes": ["TRAM","BUS"] },
    { "name": "Hauptbahnhof Süd",        "globalId": "de:09162:5000","place": "München", "transportTypes": ["TRAM","BUS"] }
  ]
}

// No stop matches the query OR no routes possible between the two ids
{
  "success": false,
  "reason": "no_routes_found",                    // or "stop_not_found"
  "origin": "...", "destination": "...",
  "note":   "API returned [] — origin/destination ids may be invalid or no service at the requested time."
}
```
