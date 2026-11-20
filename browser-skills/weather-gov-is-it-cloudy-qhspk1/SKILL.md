---
name: weather-gov-is-it-cloudy-qhspk1
title: 'Is It Cloudy? — Sky Conditions, Visibility & Blue-Sky Check'
description: >-
  Return current sky conditions for a US location: cloud-cover layers (METAR
  CLR/FEW/SCT/BKN/OVC/VV with base heights), surface visibility in meters and
  miles, and a derived 'can you see blue sky?' boolean — pulled from the free
  NWS api.weather.gov JSON API.
website: weather.gov
category: weather
tags:
  - weather
  - sky-conditions
  - cloud-cover
  - visibility
  - nws
  - noaa
  - api
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      Fallback only — open
      https://forecast.weather.gov/MapClick.php?lat={lat}&lon={lon} when
      api.weather.gov is 5xx-ing for >2min. Weather.gov has no anti-bot, no JS
      gating; one `browse open` + `browse get markdown body` is enough. Strictly
      inferior to the API: same data, more turns, visibility is buried as plain
      text.
verified: false
proxies: false
---
# Is It Cloudy? — Sky Conditions, Visibility & Blue-Sky Check

## Purpose

Return current sky conditions for a US location — cloud-cover layers (METAR `CLR/FEW/SCT/BKN/OVC/VV` codes with base heights), surface visibility, a plain-English summary ("Clear", "Mostly Cloudy", "Fog"), and a derived "can you see blue sky?" boolean with a confidence qualifier. Read-only. Pulls from the National Weather Service's free, unauthenticated JSON API at `api.weather.gov`; never logs in, never posts.

## When to Use

- Answer "is it cloudy right now?", "can I see the stars tonight?", "how foggy is it at the airport?"
- Astrophotography / stargazing readiness checks ("is the sky clear enough?")
- Aviation-adjacent ground checks (visibility in meters/miles, ceiling base height)
- Solar-panel output sanity checks (cloud-cover percentage proxy)
- Outdoor-event go/no-go decisions where overcast vs. partial-cloud matters
- Any UI that needs a short, structured sky-state field per location

## Workflow

**Recommended path: NWS JSON API.** `api.weather.gov` is a public, unauthenticated REST service over GeoJSON. No cookies, no anti-bot, no JS rendering, no rate-limit auth — only requirement is a descriptive `User-Agent` header identifying the caller (NWS uses it for abuse contact; missing UA returns 403). A residential proxy is **not** required. Three sequential GETs per location; ~200ms each. The HTML site (`forecast.weather.gov/MapClick.php`) is the browser fallback at the end of this section, but it's strictly inferior — same data, more turns, harder to parse, and the visibility field is buried in plain text.

1. **Resolve location to lat/lon.** NWS only accepts coordinates (4 decimals max, e.g. `40.7128,-74.0060`). Caller supplies coords directly, or geocode an address/place via any geocoder (Census, Nominatim, Mapbox). NWS does **not** geocode for you.

2. **Get the grid + nearest stations URL:**
   ```
   GET https://api.weather.gov/points/{lat},{lon}
   User-Agent: your-app (contact@example.com)
   Accept: application/geo+json
   ```
   Response (`properties`):
   - `gridId`, `gridX`, `gridY` — the forecast office grid cell.
   - `observationStations` — URL listing observation stations ordered by proximity.
   - `forecast` / `forecastHourly` — text-forecast URLs (used in step 5b fallback).
   - `relativeLocation.properties.{city,state}` — nearest named place (good for the response label).
   - `timeZone` — IANA tz of the point.

   **Non-US coords** → HTTP 404 with `type: ".../problems/InvalidPoint"`. Return a `not_supported_region` outcome (see Expected Output).

3. **List nearby stations:**
   ```
   GET {observationStations}    # = https://api.weather.gov/gridpoints/{office}/{x},{y}/stations
   ```
   `features[]` is ordered nearest-first. Pull `features[0].properties.stationIdentifier` (4-letter ICAO, e.g. `KNYC`, `KBFI`).

4. **Get the latest observation:**
   ```
   GET https://api.weather.gov/stations/{stationId}/observations/latest
   ```
   Key `properties` fields:
   - `textDescription` — short English summary: `"Clear"`, `"Mostly Cloudy"`, `"Light Rain"`, `"Fog"`, …
   - `cloudLayers[]` — array of `{amount, base:{value, unitCode:"wmoUnit:m"}}`. `amount` is one of:
     - `CLR` / `SKC` — sky clear (0/8 octas)
     - `FEW` — 1/8–2/8 octas
     - `SCT` — 3/8–4/8 octas (scattered)
     - `BKN` — 5/8–7/8 octas (broken / mostly cloudy)
     - `OVC` — 8/8 octas (overcast)
     - `VV`  — vertical visibility (sky obscured by fog/precip; `base` = ceiling of obscuration)
     - Empty array `[]` — station has no sky sensor; fall back to step 5.
   - `visibility.value` — meters. Statute miles = `value / 1609.344`. `null` when no METAR vis report.
   - `icon` — `https://api.weather.gov/icons/land/{day|night}/{skc|few|sct|bkn|ovc|fog|...}` — the 3-letter slug after `day/`/`night/` mirrors the highest-coverage `cloudLayers.amount` (lowercased) for non-precip conditions.
   - `timestamp` — ISO-8601 of the observation. Treat anything > 2h old as **stale**; iterate to the next station in step 3's list.
   - `temperature`, `dewpoint`, `relativeHumidity`, `windSpeed`, `windDirection`, `barometricPressure` — bonus context.

5. **Derive "can you see blue sky?"** from `cloudLayers` (use the highest-coverage layer, since lower layers occlude higher):
   | Highest `amount` | `can_see_blue_sky` | `qualifier` |
   |---|---|---|
   | `CLR` or `SKC` | `true` | `"fully clear"` |
   | `FEW`          | `true` | `"mostly blue with a few clouds"` |
   | `SCT`          | `true` | `"partial blue sky"` |
   | `BKN`          | `false`| `"mostly cloudy — limited blue patches"` |
   | `OVC`          | `false`| `"overcast"` |
   | `VV`           | `false`| `"obscured (fog/precip)"` |

   If `cloudLayers` is empty / station has no sky sensor:
   5a. Re-issue step 3 against `features[1..n]` until a station returns non-empty `cloudLayers` (most ASOS stations do; many AWOS stations don't).
   5b. **Last resort — forecast text:** `GET https://api.weather.gov/gridpoints/{office}/{x},{y}/forecast`, take `properties.periods[0].shortForecast` (`"Sunny"`, `"Partly Cloudy"`, `"Mostly Cloudy"`, `"Cloudy"`, `"Fog"`, …) and map by string match. Mark the response `source: "forecast-shortForecast"` so the caller knows it's a forecast, not an observation.

6. **Format the response** per the JSON schema in Expected Output. Always include `observed_at` and `station_id` so the consumer can detect stale data.

### Browser fallback

Only when `api.weather.gov` is unreachable (NWS does occasionally 500/503 during ingest cycles). Open `https://forecast.weather.gov/MapClick.php?lat={lat}&lon={lon}` in a Verified-off remote session (`browse open --remote`) — weather.gov has zero anti-bot. The "Current Conditions" card on the right shows:

- Big text label (`Mostly Cloudy`, `Sunny`, …) → maps 1:1 to `textDescription`.
- "Visibility" row in `Xkm (Ymi)` — parse with `/Visibility\s+([\d.]+)\s*km\s+\(([\d.]+)\s*mi\)/`.
- "Sky Cover" not always present in the table; if absent, infer from the label.
- Station id appears in the small grey text below the label: `Conditions at {Station Name}, {ST} ({CALLSIGN})`.

`browse get markdown body` after a single `browse open` is usually enough — the page is plain HTML, no JS gating. Do not click anywhere; the API path is so much cheaper that any clicks indicate the API path should have been retried instead.

## Site-Specific Gotchas

- **`User-Agent` is mandatory.** Direct calls without UA return `403 Forbidden — User-Agent header is required`. Set something descriptive: `my-app (contact@example.com)`. The Browserbase Fetch path attaches a UA automatically; raw `curl` will get blocked.
- **US-only coverage (incl. PR/USVI/Guam/AK/HI).** Non-US lat/lon → HTTP 404 with body `{"type":".../problems/InvalidPoint","title":"Data Unavailable For Requested Point","status":404}`. Detect and return `not_supported_region` rather than retrying.
- **Stations can be missing sky data.** Many AWOS-only stations report visibility + temp but emit `cloudLayers: []`. Always iterate to the next-nearest station before falling back to the forecast text.
- **Stale observations are common.** Some stations report hourly, a few only every 3h. Always check `properties.timestamp` against now; reject > 2h old. Major airport ASOS (`KJFK`, `KORD`, `KLAX`, `KSEA`, `KBOS`, `KSFO`, `KATL`, `KDEN`, `KDFW`, `KMIA`, `KIAH`, `KMSP`, `KPHX`, `KMCO`, `KPHL`, `KIAD`, `KDCA`, `KBWI`, `KSLC`, `KLAS`) report every 5 min and are almost always fresh.
- **Visibility is in meters, not miles.** `visibility.unitCode === "wmoUnit:m"`. Statute miles = `value / 1609.344` (NOT `1000`). Aviation max-vis cap is **16,090 m** (10 statute miles); values at exactly 16090 mean "10+ mi" not literally 16.09 km.
- **`cloudLayers` is METAR-ordered low-to-high.** First element is the lowest layer. When deriving "highest amount" for the blue-sky check, take the **maximum coverage rank** (CLR < FEW < SCT < BKN < OVC < VV) across layers, NOT just the last entry — METAR cloud reporting can stop at the first OVC because higher layers are obscured by definition, so the **first OVC or BKN at the lowest height is what dominates the observer's view**.
- **`VV` is not a cloud layer — it's vertical visibility into obscuration.** Treat as "sky obscured" (fog, heavy snow, smoke). `base.value` here is the height to which an observer can see vertically, NOT a cloud base.
- **`icon` URL slug is reliable for at-a-glance display but is lossy.** A `bkn` icon will be served for both `BKN` and "Mostly Cloudy" forecast text — don't reverse-engineer the exact cloudLayers from the icon path. Use `cloudLayers[]` as the source of truth; use `icon` only for UI thumbnails.
- **Hourly forecast endpoint occasionally returns HTTP 500.** Observed during iteration: `GET /gridpoints/OKX/33,42/forecast/hourly` → 500 while `GET /gridpoints/OKX/33,42/forecast` (non-hourly) → 200 on the same grid. Always retry once; if still failing, use the 7-period (non-hourly) forecast endpoint. The points + stations + observations chain (steps 2–4) is rock-solid; only the gridded forecast endpoints flake.
- **`Cache-Control` matters for cost.** `/points` and `/gridpoints/.../stations` are `max-age=86400` (24h) — geocoding is permanent for a given lat/lon, so cache aggressively. `/observations/latest` is `max-age=120` (2 min). A naïve caller redoing the points lookup on every request is 3× more requests than needed.
- **Coordinate precision is capped at 4 decimals.** `api.weather.gov/points/40.71281,-74.00601` → 301 redirect to `…/40.7128,-74.006`. Pre-round before requesting to skip the redirect.
- **Station IDs are 3- or 4-letter ICAO**, occasionally numeric for mesonet stations (`E1234`). The full URL `https://api.weather.gov/stations/{id}/observations/latest` works for both.
- **No API key, no auth header, no rate-limit auth.** NWS publishes a courtesy guideline of ≤ 5 req/s per source IP. The Browserbase Fetch API stays well under this. Do not retry-loop on 5xx — back off 1s.
- **Browser path is unnecessary 99% of the time.** Only meaningful failure mode for the API is a multi-minute NWS outage (rare; check `status.weather.gov`). Don't burn turns on the browser fallback unless the API has been 5xx-ing for ≥ 2 minutes.

## Expected Output

The skill produces one of five outcome shapes. The top-level `outcome` field is the discriminator.

### 1. `observed` — happy path: station data fresh and complete

```json
{
  "outcome": "observed",
  "location": {
    "lat": 40.7128,
    "lon": -74.006,
    "label": "Hoboken, NJ",
    "timezone": "America/New_York"
  },
  "station_id": "KNYC",
  "observed_at": "2026-05-18T14:51:00+00:00",
  "sky_summary": "Clear",
  "can_see_blue_sky": true,
  "blue_sky_qualifier": "fully clear",
  "cloud_layers": [
    { "amount": "CLR", "coverage_octas": "0/8", "base_meters": null, "base_feet_agl": null }
  ],
  "highest_coverage": "CLR",
  "visibility": {
    "meters": 14480,
    "statute_miles": 9.0,
    "is_capped_at_10mi": false
  },
  "icon_url": "https://api.weather.gov/icons/land/day/skc?size=medium",
  "source": "observation",
  "extras": {
    "temperature_c": 29.4,
    "dewpoint_c": 18.3,
    "relative_humidity_pct": 51.3
  }
}
```

### 2. `observed` — broken/overcast example with multiple layers

```json
{
  "outcome": "observed",
  "location": { "lat": 47.6062, "lon": -122.3321, "label": "Seattle, WA", "timezone": "America/Los_Angeles" },
  "station_id": "KBFI",
  "observed_at": "2026-05-18T15:53:00+00:00",
  "sky_summary": "Mostly Cloudy",
  "can_see_blue_sky": false,
  "blue_sky_qualifier": "mostly cloudy — limited blue patches",
  "cloud_layers": [
    { "amount": "BKN", "coverage_octas": "5-7/8", "base_meters": 460,  "base_feet_agl": 1510 },
    { "amount": "BKN", "coverage_octas": "5-7/8", "base_meters": 6100, "base_feet_agl": 20013 }
  ],
  "highest_coverage": "BKN",
  "visibility": { "meters": 16090, "statute_miles": 10.0, "is_capped_at_10mi": true },
  "icon_url": "https://api.weather.gov/icons/land/day/bkn?size=medium",
  "source": "observation"
}
```

### 3. `forecast_fallback` — station had no `cloudLayers`, used `shortForecast`

```json
{
  "outcome": "forecast_fallback",
  "location": { "lat": 35.6870, "lon": -105.9378, "label": "Santa Fe, NM", "timezone": "America/Denver" },
  "station_id": "KSAF",
  "observed_at": null,
  "sky_summary": "Partly Sunny",
  "can_see_blue_sky": true,
  "blue_sky_qualifier": "partial blue sky (forecast-derived)",
  "cloud_layers": [],
  "highest_coverage": "SCT",
  "visibility": null,
  "icon_url": null,
  "source": "forecast-shortForecast",
  "forecast_period_name": "This Afternoon"
}
```

### 4. `stale` — most recent obs is > 2h old after exhausting nearby stations

```json
{
  "outcome": "stale",
  "location": { "lat": 64.8401, "lon": -147.7200, "label": "Fairbanks, AK", "timezone": "America/Anchorage" },
  "tried_stations": ["PAFA", "PAEI", "PAIM"],
  "newest_observed_at": "2026-05-18T08:00:00+00:00",
  "age_hours": 8.85,
  "reason": "No station within forecast grid reported within the last 2h"
}
```

### 5. `not_supported_region` — non-US lat/lon

```json
{
  "outcome": "not_supported_region",
  "location": { "lat": 51.5074, "lon": -0.1278 },
  "reason": "NWS api.weather.gov serves US states, territories, and adjacent marine zones only.",
  "nws_error": {
    "type": "https://api.weather.gov/problems/InvalidPoint",
    "title": "Data Unavailable For Requested Point",
    "status": 404
  }
}
```
