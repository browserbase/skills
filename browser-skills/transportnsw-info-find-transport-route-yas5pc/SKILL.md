---
name: transportnsw-info-find-transport-route-yas5pc
title: Transport NSW Trip Planner — Find a Route
description: >-
  Resolve a natural-language origin + destination + (optional) arrive-by /
  leave-at time into the public-transport itineraries returned by
  transportnsw.info: per-itinerary departure / arrival times, duration,
  leg-by-leg mode + route, fare, real-time delay status. Drives the
  deterministic URL-param surface; falls back to the form when location IDs
  aren't yet cached. Read-only.
website: transportnsw.info
category: transit
tags:
  - transit
  - trip-planner
  - public-transport
  - sydney
  - nsw
  - read-only
  - url-param
source: 'browserbase: agent-runtime 2026-05-20'
updated: '2026-05-20'
recommended_method: url-param
alternative_methods:
  - method: browser
    rationale: >-
      Drive the typeahead + form when stop / suburb IDs are not yet cached for a
      given origin or destination string. The URL-param surface needs the
      resolved IDs as input, and the typeahead modal is the only public way to
      discover them. Persist resolved IDs to a local cache so each location is
      resolved exactly once.
  - method: api
    rationale: >-
      Transport for NSW publishes an official OAuth-gated Trip Planner REST API
      at opendata.transport.nsw.gov.au. Use it when the caller has a registered
      API key — it is the canonical machine surface. For unauthenticated agents
      the API returns 401/403, and the URL-param path on transportnsw.info
      documented here is the cheapest deterministic alternative.
verified: true
proxies: true
---
# Find a Public-Transport Route on Transport NSW

## Purpose

Given a natural-language trip query — origin + destination + (optional) arrival/departure time — return the public-transport itineraries offered by the official NSW trip planner: each itinerary's departure time, arrival time, duration, leg-by-leg mode + route number, transfer count, walk time, fare, and real-time delay status. Read-only — never books, never opens a checkout flow (the planner has no checkout — only journey suggestions).

## When to Use

- "Find me a way from Central Station to Bondi Beach arriving by 5 PM tomorrow."
- "What's the next train from Town Hall to Parramatta?"
- Scheduling / commuter assistants that compare itineraries across departure windows.
- Deterministic E2E tests in CI/CD: the URL-param surface gives a single GET that reproducibly drives the planner — no LLM reasoning required on replay.

## Workflow

The Transport NSW trip planner accepts the full origin / destination / time triple via URL query parameters on `https://transportnsw.info/trip-planner/plan`. A single `GET` reproduces the same state the UI would reach after five clicks, so the recommended path is to (1) resolve each location string to a stop / suburb ID via the typeahead, then (2) construct the canonical URL.

The Browser fallback (driving the form click-by-click) is documented at the end and is what you should use when you don't yet have IDs cached.

### 1. URL pattern (the deterministic playbook)

```
https://transportnsw.info/trip-planner/plan
    ?from=<originId>
    &to=<destinationId>
    [&arrivalDateTime=YYYYMMDDHHMM]          # arrive-by; Sydney local time
    [&departureDateTime=YYYYMMDDHHMM]        # leave-at;  Sydney local time
    [&excludedModes=<csv-of-mode-ids>]       # e.g. 11 = school bus, auto-added by the "Plan a trip" splash button
```

- Omitting both `arrivalDateTime` and `departureDateTime` → "Leaving now" (server uses Sydney current time, not the browser's clock).
- IDs come in two shapes — both work in `from` and `to`:
  - **Numeric stop ID** (6 digits): a single stop / station. Example: `200060` = Central Station, Sydney.
  - **Suburb / place ID**: structured `suburbID:<int>:1:<URL-encoded-label>:<x>:<y>:GDAV`. Example: `suburbID:95361002:1:Bondi+Beach:4895254:3758264:GDAV`. Use this when the user names a suburb / POI rather than a specific stop — the planner routes to a representative point in the suburb.
- `arrivalDateTime` / `departureDateTime` are in `YYYYMMDDHHMM` and **must be interpreted in Australia/Sydney local time** (not the browser's TZ — see gotcha). A value in the past returns an empty alert ("No results found"), not an error.

Example: Central → Bondi Beach arriving by 17:00 Wed 20 May 2026:
```
https://transportnsw.info/trip-planner/plan?from=200060&to=suburbID:95361002:1:Bondi+Beach:4895254:3758264:GDAV&arrivalDateTime=202605201700
```

### 2. Resolve a location string → ID (typeahead)

When the user names an origin or destination without a cached ID, drive the search modal once and harvest the URL the planner produces:

1. `browse open https://transportnsw.info/trip-planner/plan`
2. `browse click @<ref of "Origin: No location selected">` — opens the search modal.
3. `browse click @<ref of textbox "Search input">` then `browse type "<location string>"`.
4. `browse wait timeout 2500` — typeahead is debounced.
5. The result list has three filter tabs: **All** / **Stops · N** / **Places · M**. Click the first result whose label exactly matches the user's string. Use the Stops tab when the user named a station (Central, Town Hall) and the Places tab when they named a suburb / landmark (Bondi Beach, Opera House).
6. After the click, `browse get url` — the new URL contains the resolved `from=` (or `to=`) ID. Cache it; the IDs are stable across sessions.
7. Repeat for the destination (the Destination button is the second sibling beneath Origin).

The same typeahead is what you'd use to discover new IDs at runtime; once resolved, they should be persisted in a local cache so a CI test never re-discovers them.

### 3. Set arrival / departure time

The cleanest path is to bypass the UI date picker entirely and pass `arrivalDateTime` / `departureDateTime` in the URL (see §1). If for some reason you must drive the picker:

1. `browse click @<ref of "Selected time: Leaving now">` — opens the "Choose date and time" dialog.
2. `browse click @<ref of "Select Arrive by option">` (or `"Select Leave at option"`).
3. The three comboboxes (`Day`, `Hour`, `Minute`) are **custom listboxes**, not native `<select>` — `browse select` will return `selected: []`. Instead, **click the combobox to open it, then click the desired option ref**. Available values:
   - Day: `Today (<weekday>)`, `Tomorrow (<weekday>)`, then absolute dates `DD MMM (<weekday>)` for ~14 days ahead.
   - Hour: `00`–`23` (24-hour).
   - Minute: `00, 05, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55` (5-minute granularity only).
4. `browse click @<ref of "Apply">` — the URL now carries `arrivalDateTime=` / `departureDateTime=` and results refresh in ~2–4 s.

### 4. Read the itineraries

Once the planner has both endpoints + a valid time, the results panel renders a vertical list of `button:` elements — one per itinerary. **Parse each button's `aria-label`** — it's a structured, comma-separated string that enumerates every field cleanly:

```
"Leaving in <N> minutes
 Transfer to <mode-1> Transfer to <mode-2> Walk for <N>min
 <interchange-stop>
 Departing at HH:MM, Duration is N minutes, Arriving at HH:MM[, next day]
 Fare is $X.XX
 [On-time | <N> min late | Real-time unavailable]
 from <first-stop>, Platform <N>
 This service is Accessible
 There is an alert for this service"
```

Each leg is one `Transfer to <mode> <route-number>` clause (e.g. `Transfer to T4 train`, `Transfer to 379 bus`). Walking legs are `Walk for <N>min`. The final segment usually ends with the interchange stop name (e.g. `Bondi Junction`).

The same data appears as child `StaticText` nodes (`16:22`, `34min`, `$5.63`, ...) but those are formatted in the **browser's** local TZ, while the aria-label is in **Sydney AEST**. Always parse the aria-label for deterministic output. (See gotchas.)

Above the list, four tabs gate the mode set: **Public Transport** (default) / **Walk** / **Cycle** / **Drive**. The Drive tab returns a single car-route summary, not a list — keep the Public Transport tab selected unless the user explicitly asked for driving or active-transport directions.

### Browser fallback (use when no cached IDs)

```bash
sid=$(browse cloud sessions create --keep-alive --verified --proxies | …)
export BROWSE_SESSION="$sid"
browse open "https://transportnsw.info/trip-planner/plan" --remote
browse wait load --remote && browse wait timeout 2000 --remote
# Origin
browse click @<ref "Origin: No location selected">
browse click @<ref "Search input"> && browse type "Central Station" --remote
browse wait timeout 2500 --remote
browse click @<ref of first matching result>          # URL gets ?from=200060
# Destination
browse click @<ref "Destination: No location selected">
browse click @<ref "Search input"> && browse type "Bondi Beach" --remote
browse wait timeout 2500 --remote
browse click @<ref of first matching result>          # URL gets &to=suburbID:…
# Time (optional)
browse click @<ref "Selected time: Leaving now">
browse click @<ref "Select Arrive by option">
browse click @<ref Day combobox> ; browse click @<ref "Tomorrow (Wed)">
browse click @<ref Hour combobox> ; browse click @<ref "17">
browse click @<ref Minute combobox>; browse click @<ref "00">
browse click @<ref "Apply">
# Read results
browse snapshot --remote      # parse button aria-labels (see §4)
```

The first-page render after Apply takes 2–4 s; `browse wait timeout 4000` after the Apply click before snapshotting is reliable. A stealth + residential-proxy session (`--verified --proxies`) is what was used during skill development and is the safer default; the site is fronted by CloudFront but does not appear to gate on bot-detection for this surface.

## Site-Specific Gotchas

- **READ-ONLY.** The planner has no booking surface — itineraries are itineraries — but never click into a "Buy ticket" / "Add to Opal" link if one appears in a banner.
- **Time-zone disagreement in the rendered DOM.** The `aria-label` on each itinerary button uses **Sydney AEST (UTC+10)**, but the visible `StaticText` nodes (the `16:22`, `34min`, `23:55` strings) use **the browser session's local timezone**. Verified on a Browserbase US-West session (PDT, UTC-7): aria-label `"Departing at 16:22"` vs StaticText `"23:22"` — a 17-hour offset for the same departure. **Always parse the aria-label**; treat the StaticText fields as display chrome, not data. If you must use StaticText, force the session TZ via `Australia/Sydney`. CI tests should pin the session to Sydney TZ to make the StaticText and aria-label converge.
- **`arrivalDateTime` / `departureDateTime` are in Sydney local time, not the browser's clock.** A value in the past returns the empty `alert: "No results found / There were no services found"` panel — there is no explicit error message. If the planner returns "No results" for a route you know is well-served (e.g. Central → Bondi Beach), the most common cause is a stale `arrivalDateTime` whose date is already in Sydney's past.
- **The Day / Hour / Minute pickers are custom listboxes, not `<select>` elements.** `browse select @<ref> <value>` returns `selected: []` and silently does nothing. Click the combobox first, then click the option ref inside the resulting `listbox`. Minutes are 5-minute increments only (00, 05, 10, …, 55).
- **The picker's "Today" / "Tomorrow" labels are anchored to the browser's clock, not Sydney's.** On a US-West session, "Today (Tue)" can correspond to Sydney's Wednesday. If you need a specific calendar date, **construct the YYYYMMDDHHMM string yourself and pass it via the URL** rather than relying on relative-day clicks.
- **`from` and `to` accept two distinct ID shapes** — a 6-digit numeric stop ID (e.g. `200060` = Central Station) **or** a structured suburb / place ID `suburbID:<int>:1:<URL-encoded-label>:<x>:<y>:GDAV` (e.g. `suburbID:95361002:1:Bondi+Beach:4895254:3758264:GDAV`). Both `from` and `to` accept either shape independently. Picking a "Stop" in the typeahead yields the numeric shape; picking a "Place" yields the suburb shape.
- **`excludedModes=11` is auto-injected by the splash "Plan a trip" button.** Mode 11 appears to be school-bus services. Directly hitting `/trip-planner/plan?from=…&to=…` without `excludedModes` includes all modes, which is usually what you want. Other mode IDs (deduced from the "Mode (7)" filter chip showing 7 modes — Train, Metro, Bus, Light rail, Ferry, Coach, School bus): pass as comma-separated, e.g. `excludedModes=4,9` to exclude Light rail and Ferry.
- **Trip preference is a separate filter, not a URL param.** "Earliest arrival" (default) / "Fewest interchanges" / "Least walking" / "Fastest". Set via the `button: Selected trip preference: Earliest arrival` chip on the results page — there is no `tripPref=` query param.
- **Results auto-populate the moment both `from` and `to` are set** — there is no explicit "Search" / "Submit" button on the form. The "Updated: HH:MM" button in the results panel is a refresh button, not a submit.
- **First result is sometimes a "Place" with the same name as a "Stop".** When typing "Bondi Beach", the top result (`[3-2451] div: Bondi Beach`) is the suburb (`Places` tab); the next two are bus stops named "Bondi Beach" (`Stops` tab). Use the **Places tab** when the user said "Bondi Beach" generically, and the **Stops tab** when they specified a stop ID / station.
- **Don't trust `/trip` or `/trip-planner` as the entry URL** — both render a marketing splash with a "Plan a trip" button, not the form. Open `/trip-planner/plan` directly to skip the splash. (Hitting `/trip-planner/plan` with no params lands on the empty form, ready for input — equivalent to clicking the splash button.)
- **The official Trip Planner API exists but requires OAuth keys.** Transport for NSW publishes a REST trip-planner API at `opendata.transport.nsw.gov.au` (TfNSW Open Data Hub) — if the calling agent has a registered API key, prefer that over scraping. For unauthenticated agents, the URL-param surface documented here is the cheapest deterministic path. Don't waste cycles trying to hit the API anonymously.
- **No `/sapi`-style public JSON behind the page.** The site is a SPA that calls authenticated TfNSW backends; cookie-less direct hits against the internal XHR endpoints return 401/403. The accessibility-tree-driven scrape of `aria-label` strings is the supported public surface.

## Expected Output

```json
{
  "query": {
    "origin": { "raw": "Central Station", "id": "200060", "resolved_label": "Central Station, Sydney" },
    "destination": { "raw": "Bondi Beach", "id": "suburbID:95361002:1:Bondi+Beach:4895254:3758264:GDAV", "resolved_label": "Bondi Beach" },
    "time_anchor": { "mode": "arrive_by", "datetime_local": "2026-05-20T17:00", "tz": "Australia/Sydney" }
  },
  "url": "https://transportnsw.info/trip-planner/plan?from=200060&to=suburbID:95361002:1:Bondi+Beach:4895254:3758264:GDAV&arrivalDateTime=202605201700",
  "itineraries": [
    {
      "depart_local": "16:22",
      "arrive_local": "16:56",
      "next_day": false,
      "duration_min": 34,
      "fare_aud": 5.63,
      "transfers": 1,
      "walk_min": 6,
      "realtime_status": "Real-time unavailable",
      "first_stop": "Central Station, Platform 24",
      "interchange": "Bondi Junction",
      "accessible": true,
      "alerts": true,
      "legs": [
        { "mode": "train", "route": "T4" },
        { "mode": "bus",   "route": "379" },
        { "mode": "walk",  "duration_min": 6 }
      ]
    }
  ],
  "result_status": "ok"
}
```

Distinct outcome shapes:

```json
// ok — one or more itineraries returned
{ "result_status": "ok", "itineraries": [ ... ] }

// empty — planner returned the "No results found" alert (most often: arrivalDateTime in the past, or genuinely unreachable)
{ "result_status": "no_results", "itineraries": [], "alert_text": "There were no services found. Refine your preferences and try again." }

// ambiguous_location — the typeahead returned 0 matches or multiple equally-ranked matches for an origin/destination string
{ "result_status": "ambiguous_location", "field": "destination", "raw": "...", "candidates": [ { "label": "...", "id": "..." }, ... ] }
```
