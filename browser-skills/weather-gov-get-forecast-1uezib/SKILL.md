---
name: weather-gov-get-forecast-1uezib
title: NWS Weather Forecast for a US Point
description: >-
  Given a US location (lat/lon, ZIP, or city+state), return the National Weather
  Service forecast: current observation, hourly forecast, 7-day multi-day
  periods, active alerts/watches/warnings, the forecast office, and the
  underlying grid cell. Read-only via the public api.weather.gov JSON surface
  (no auth).
website: weather.gov
category: weather
tags:
  - weather
  - forecast
  - nws
  - noaa
  - alerts
  - read-only
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      When api.weather.gov is unreachable (NWS server outage, restricted
      network), fall back to scripted browsing of
      forecast.weather.gov/MapClick.php?lat=X&lon=Y — plain HTML, no anti-bot,
      but ~30x slower and structurally less reliable than the API.
verified: false
proxies: false
---
# NWS Weather Forecast for a US Point

## Purpose

Given a US location (latitude+longitude, ZIP, or city+state), return the National Weather Service forecast for that point: current observation, hourly forecast (next ~24–48h), multi-day forecast (~7 days × day+night periods), any active alerts/watches/warnings, the forecast office (WFO) handling the point, and the underlying grid cell. Read-only. The public `api.weather.gov` JSON surface (no auth, no anti-bot, CORS-enabled) is the canonical and recommended path; scripted browsing of `forecast.weather.gov` is a last-resort fallback when the API is unreachable.

## When to Use

- A user asks "what's the weather in {ZIP / city / lat,lon}?" and wants more than a one-line summary — full hourly + multi-day + alerts.
- Routing / logistics flows that need the active forecast for a US point along a path.
- Triage workflows that need to know whether a point is under an active watch/warning/advisory (and the severity/urgency/certainty fields a CAP alert carries).
- Anywhere you'd otherwise scrape `forecast.weather.gov` — the API is faster, structured, and rate-limit-friendly (24h cache on `/points/`, 2-minute cache on `/forecast`).

**Do NOT use** when the point is outside US territory — NWS only covers US states, DC, Puerto Rico, US Virgin Islands, Guam, and CONUS coastal/marine zones. For non-US points, `/points/{lat,lon}` returns 404 with `"title": "Data Unavailable For Requested Point"`.

## Workflow

The NWS API is a three-call chain from a `(lat, lon)`: **resolve point → fetch forecast(s) + observations → fetch active alerts**. Then a geocoder up front if the input is a ZIP or city. No auth, no cookies, no anti-bot. **A residential proxy is not required.** Set a descriptive `User-Agent` (NWS terms of service request it — `App-Name (contact-email)` — and although the API currently returns 200 without one via Browserbase Fetch, an honest UA avoids future-proofing pain).

### 1. Resolve the input to `(lat, lon)`

If the user passed a ZIP or city+state, geocode first. The NWS API itself does **not** accept ZIPs or city names — only decimal lat/lon.

- **ZIP code** (`66526`):
  ```
  GET https://nominatim.openstreetmap.org/search?postalcode=66526&country=us&format=json&limit=1
  ```
  Use `[0].lat`, `[0].lon` from the response. Set `User-Agent: <yourapp> (<contact>)` — Nominatim enforces this.
- **City + state** (`Boulder, CO`):
  ```
  GET https://nominatim.openstreetmap.org/search?city=Boulder&state=Colorado&country=us&format=json&limit=1
  ```
- **Already lat/lon**: pass through. Round to **≤ 4 decimal places** before the next call (see gotcha below).

### 2. Resolve the point → grid cell + downstream URLs

```
GET https://api.weather.gov/points/{lat},{lon}
Accept: application/geo+json
User-Agent: yourapp/1.0 (contact@example.com)
```

Response `properties` carries:
- `cwa` / `gridId` — 3-letter WFO code (e.g. `TOP` = Topeka KS, `BOX` = Boston MA, `MTR` = San Francisco Bay Area, `LWX` = Baltimore/DC, `PAFC` = Anchorage AK, `HFO` = Honolulu HI).
- `gridX`, `gridY` — integer grid cell coordinates in the WFO's 2.5km grid.
- `forecast` — multi-day forecast URL.
- `forecastHourly` — hourly forecast URL.
- `forecastGridData` — raw gridded data (every variable NWS models for the cell).
- `observationStations` — list-URL of nearby METAR stations.
- `forecastZone` — public forecast zone URL (broader than gridpoint).
- `county` — county zone URL.
- `fireWeatherZone` — fire-weather zone URL.
- `timeZone` — IANA tz (e.g. `America/Chicago`).
- `relativeLocation.properties.{city,state}` — nearest named place + distance/bearing. Use this for human-readable display; **do not** use it as a slug for further lookups.
- `forecastOffice` — `https://api.weather.gov/offices/{cwa}` (dereference for office name, address, phone, email if needed).

The `/points/` response is cacheable for 24 hours — persist `(lat,lon → {cwa, gridX, gridY})` locally and skip this call on repeat queries for the same rounded point.

### 3. Fetch the forecasts in parallel

Three independent calls; fan out:

```
GET {properties.forecast}            # 7-day periods, day + night
GET {properties.forecastHourly}      # ~156 hourly periods (~6.5 days)
GET https://api.weather.gov/alerts/active?point={lat},{lon}
```

**Multi-day periods** — typically 14 entries: 7 days × {day, night}. The first period is named contextually: `"This Afternoon"`, `"Tonight"`, `"Overnight"`, then proper weekday names (`"Thursday"`, `"Thursday Night"`, `"Friday"`, ...). Each period carries:

```
name, number, startTime, endTime, isDaytime, temperature, temperatureUnit,
temperatureTrend, probabilityOfPrecipitation:{value,unitCode}, windSpeed,
windDirection, icon, shortForecast, detailedForecast
```

**Hourly periods** — same shape plus `dewpoint`, `relativeHumidity`. `name` is empty (`""`) for hourly; `number` is the sequence index. Returns 156 periods today (~6.5 days); future trim with `Array.slice(0, 48)` if you only want 24–48h.

### 4. Current observation

The point response gives you `observationStations` which is itself a list-URL. Resolve it, take the **first station** (sorted by proximity), then GET its latest observation:

```
GET {properties.observationStations}                    # list of nearby stations
# → features[0].properties.stationIdentifier  e.g. "KCNK"
GET https://api.weather.gov/stations/{stationId}/observations/latest
```

Returns `properties` with `timestamp`, `temperature{value,unitCode}`, `dewpoint`, `windSpeed`, `windDirection`, `windGust`, `barometricPressure`, `visibility`, `relativeHumidity`, `textDescription` (human-readable, e.g. `"Cloudy"`), `icon`, `presentWeather[]`. **All values use WMO unit codes** (`wmoUnit:degC`, `wmoUnit:km_h-1`, `wmoUnit:m`, `wmoUnit:Pa`, `wmoUnit:percent`) — convert to imperial client-side if needed.

If `temperature.value` is `null` or `qualityControl: "Z"` (failed QC), try the next station in the list — small/regional airports drop in and out frequently.

### 5. Alerts

`/alerts/active?point={lat},{lon}` is a `GeoJSON FeatureCollection` of CAP alerts intersecting the point. Each feature's `properties` has:

```
event, severity, urgency, certainty, effective, onset, expires, ends,
status, messageType, category, headline, description, instruction,
sender, senderName, response, areaDesc, affectedZones (URL array),
geocode.{SAME, UGC} (ID arrays)
```

To resolve `affectedZones` to human names, dereference each URL (`/zones/{type}/{id}` returns `properties.name` etc.). Most callers only need `areaDesc` (already a comma-joined human string).

### Browser fallback

When the API is unreachable (NWS server hiccups, network policy block, etc.), the public `forecast.weather.gov` page is parseable HTML — no JS framework, no anti-bot:

```
https://forecast.weather.gov/MapClick.php?lat={lat}&lon={lon}
```

Read with `browse open ... --remote` and `browse get markdown body`. Key DOM hooks:
- `#current_conditions-summary` — current obs (temperature + textDescription).
- `#detailed-forecast-body .row .col-sm-2.forecast-label` / `.col-sm-10.forecast-text` — multi-day forecast period pairs.
- `#seven-day-forecast-container .tombstone-container` — short-form day cards.
- Alerts banner at top: `.panel-danger`, `.panel-warning` divs with `.panel-heading` headlines.

Construct a `(lat, lon)` first (geocoder step 1 is the same). The browser path is ~30× slower and structurally less reliable than the API — use it only as a fallback.

## Site-Specific Gotchas

- **`/points/{lat,lon}` rejects lat/lon with more than 4 decimal places.** Returns HTTP 301 (not 4xx) with `Location: /points/{rounded}` and a body `{"title": "Adjusting Precision Of Point Coordinate"}`. Either pre-truncate client-side (`lat.toFixed(4)`) or set `--allow-redirects` / equivalent. Confirmed against `39.74560,-97.08921` → 301 and `39.745634,-97.089215` → 301; `39.7456,-97.0892` → 200.
- **Lat then lon — not lon,lat.** Despite the GeoJSON response embedding coordinates as `[lon, lat]`, the URL form is `/points/{lat},{lon}`. Reversing them either 404s or returns a forecast for an unintended point (e.g. ocean).
- **`/points/` returns 404 for non-US territory.** Body: `{"title": "Data Unavailable For Requested Point", "detail": "Unable to provide data for requested point ..."}`. Detect by status code and surface a `not_supported_region` outcome.
- **NWS asks for a contact-bearing `User-Agent`.** Per their terms: `User-Agent: AppName/version (contact-email)`. They reserve the right to throttle/block UAs that look bot-generic. The Browserbase Fetch API doesn't expose `--header`, so the default UA from the Fetch backend is what gets sent — production callers should hit the API directly (Browserbase Fetch is fine for read-only sandbox use).
- **Latitude precision affects which gridpoint you get.** Two points within the same 2.5km cell return the same `gridId`/`gridX`/`gridY` and therefore the same forecast. Round generously (3–4 decimal places ≈ 11–110m of precision); going finer wastes the `/points/` cache.
- **`temperatureTrend` is frequently `null` even when the forecast is changing.** The trend is encoded in the `detailedForecast` text (e.g. `"High near 79, with temperatures falling to around 70 in the afternoon"`). If you need an explicit rising/falling flag, regex the detailed forecast or fall back to the hourly forecast's adjacent-period delta.
- **WMO unit codes — not imperial.** Observation `temperature.value` is degrees Celsius (`wmoUnit:degC`), wind speed is km/h (`wmoUnit:km_h-1`), pressure is pascals (`wmoUnit:Pa`), visibility is meters (`wmoUnit:m`). Forecast periods, by contrast, use `temperatureUnit: "F"` and human strings like `"10 to 15 mph"` — units are inconsistent across endpoints. Don't assume the same conversion table.
- **Observation stations return stale or null data more often than you'd expect.** Iterate `features[]` of `/gridpoints/.../stations` in order — first station is closest but may be a regional airport whose ASOS dropped. Filter on `temperature.value != null && qualityControl != "Z"` and walk the list. Most points have 15–25 stations to choose from.
- **Hourly forecast period count is variable.** Observed: 156 periods (~6.5 days) for a typical point; the upper bound seems to be 7 days. Don't hard-code the slice — read `properties.periods.length` and slice to your time horizon.
- **Multi-day first period name is time-of-day-dependent.** At 14:00 local you'll see `"This Afternoon"` → `"Tonight"` → `"Tuesday"` → `"Tuesday Night"` …. At 22:00 local you'll see `"Tonight"` → `"Tuesday"` …. Don't assume `periods[0].name === "Today"`.
- **Alerts: `affectedZones` is an array of URLs, not names.** Each URL is `/zones/{forecast|county|fire}/{ZONE_ID}`. To get human names, dereference; or read `areaDesc` which is already a comma-joined display string. `geocode.UGC` is the legacy UGC code array, `geocode.SAME` is the SAME/FIPS code array.
- **Alert enum values matter for triage.** `severity ∈ {Extreme, Severe, Moderate, Minor, Unknown}`, `urgency ∈ {Immediate, Expected, Future, Past, Unknown}`, `certainty ∈ {Observed, Likely, Possible, Unlikely, Unknown}`, `status ∈ {Actual, Test, Exercise, System, Draft}`. **Filter `status === "Actual"`** unless you explicitly want test traffic.
- **`messageType: "Update"` and `messageType: "Cancel"` follow earlier alerts.** A single weather event will emit Alert → Update → ... → Cancel as conditions evolve. `references[]` links to the prior alert IDs. If you want the latest state of an event, take the alert with the most recent `sent` timestamp among entries sharing a `references` chain.
- **A point can be under multiple simultaneous alerts.** Real example from this point: Tornado Watch + Severe Thunderstorm Warning + Flood Advisory active at the same time. Return them all — agents that pick the "most severe" arbitrarily lose useful detail.
- **Alaska, Hawaii, and territory grid codes are non-CONUS.** `PAFC` Anchorage, `PAFG` Fairbanks, `PAJK` Juneau, `HFO` Honolulu, `SJU` San Juan, `GUM` Guam. The API surface is identical; only the `gridId` namespace differs.
- **Marine/aviation forecasts use different endpoints.** `/gridpoints/{wfo}/{x},{y}/forecast` is the *public land* forecast. Marine forecasts live at `/zones/forecast/{zoneId}/forecast` for coastal/offshore zones. Aviation is at `/stations/{stationId}/tafs/...`. This skill targets land-point forecasts only.
- **`/gridpoints/{wfo}/{x},{y}/forecast/hourly` occasionally returns 500 during NWS model update windows** (typically 00, 06, 12, 18 UTC). Retry with 30s exponential backoff up to 3 times before falling back to the gridded raw `/gridpoints/{wfo}/{x},{y}` and synthesizing hourly periods from `temperature` / `windSpeed` / `probabilityOfPrecipitation` time series.
- **Cache headers are real — respect them.** `/points/` returns `Cache-Control: public, max-age=86400, s-maxage=120`; `/forecast` returns `max-age=120, s-maxage=60`; `/alerts/active` returns very short or `no-cache`. Caching `/points/` by `(rounded_lat, rounded_lon)` for ≥1h cuts request volume drastically.
- **No formal rate limit is published but NWS does throttle abusive UAs.** Stay under ~5 req/s sustained per process; bursts of 20–30 are fine. If you see 429, back off 60s.
- **`forecastOffice` URL is dereferenceable but rarely needed.** It returns office name, postal address, phone, email, `nwsRegion` (e.g. `cr` Central Region). Only fetch it if you're surfacing the WFO to the end user.
- **Outside-US lookups can also fail at the geocoder.** Nominatim happily returns Mexican / Canadian / European cities and ZIP-equivalents. If you geocoded a "ZIP" and got non-US coordinates, the `/points/` call will 404. Check Nominatim's `address.country_code === "us"` before forwarding to NWS.

## Expected Output

```json
{
  "location": {
    "input": "39.7456,-97.0892",
    "lat": 39.7456,
    "lon": -97.0892,
    "rounded": [39.7456, -97.0892],
    "relative_location": { "city": "Linn", "state": "KS", "distance_m": 7367, "bearing_deg": 358 },
    "time_zone": "America/Chicago"
  },
  "grid": { "wfo": "TOP", "gridX": 32, "gridY": 81 },
  "forecast_office": {
    "id": "TOP",
    "name": "Topeka, KS",
    "phone": "785-234-2592",
    "email": "nws.topeka@noaa.gov",
    "region": "cr"
  },
  "current_observation": {
    "station_id": "KCNK",
    "timestamp": "2026-05-18T19:10:00+00:00",
    "text_description": "Cloudy",
    "icon": "https://api.weather.gov/icons/land/day/ovc?size=medium",
    "temperature_c": 22,
    "temperature_f": 71.6,
    "dewpoint_c": 19,
    "relative_humidity_pct": 83.1,
    "wind_speed_kmh": 9.252,
    "wind_speed_mph": 5.7,
    "wind_direction_deg": 160,
    "wind_gust_kmh": null,
    "barometric_pressure_pa": null,
    "visibility_m": 16093.44
  },
  "forecast_multi_day": [
    {
      "number": 1,
      "name": "This Afternoon",
      "start_time": "2026-05-18T14:00:00-05:00",
      "end_time": "2026-05-18T18:00:00-05:00",
      "is_daytime": true,
      "temperature": 79,
      "temperature_unit": "F",
      "temperature_trend": null,
      "wind_speed": "10 to 15 mph",
      "wind_direction": "SE",
      "probability_of_precipitation_pct": 84,
      "short_forecast": "Chance Showers And Thunderstorms",
      "detailed_forecast": "A chance of showers and thunderstorms before 3pm, then showers and thunderstorms. Some of the storms could be severe...",
      "icon": "https://api.weather.gov/icons/land/day/tsra_sct,80?size=medium"
    }
  ],
  "forecast_hourly": [
    {
      "number": 1,
      "start_time": "2026-05-18T14:00:00-05:00",
      "end_time": "2026-05-18T15:00:00-05:00",
      "is_daytime": true,
      "temperature": 77,
      "temperature_unit": "F",
      "wind_speed": "15 mph",
      "wind_direction": "SE",
      "probability_of_precipitation_pct": 51,
      "dewpoint_c": 19.44,
      "relative_humidity_pct": 71,
      "short_forecast": "Chance Showers And Thunderstorms",
      "icon": "https://api.weather.gov/icons/land/day/tsra_sct,50?size=small"
    }
  ],
  "alerts": [
    {
      "id": "urn:oid:2.49.0.1.840.0.cf592762d2c61016d0c7f733f87f1671a4e8e675.001.1",
      "event": "Tornado Watch",
      "severity": "Extreme",
      "urgency": "Future",
      "certainty": "Possible",
      "status": "Actual",
      "message_type": "Alert",
      "effective": "2026-05-18T12:50:00-05:00",
      "onset": "2026-05-18T12:50:00-05:00",
      "expires": "2026-05-18T20:00:00-05:00",
      "headline": "Tornado Watch issued May 18 at 12:50PM CDT until May 18 at 8:00PM CDT by NWS Topeka KS",
      "description": "THE NATIONAL WEATHER SERVICE HAS ISSUED TORNADO WATCH 222 IN EFFECT UNTIL 8 PM CDT THIS EVENING ...",
      "instruction": null,
      "area_desc": "Atchison, KS; Brown, KS; Doniphan, KS; ...",
      "affected_zones": [
        "https://api.weather.gov/zones/county/KSC013",
        "https://api.weather.gov/zones/county/KSC027"
      ],
      "sender_name": "NWS Topeka KS"
    }
  ]
}
```

Distinct outcome shapes:

```json
// Successful US-point query (above shape, with arrays populated)

// US point with no active alerts
{ "...": "...", "alerts": [] }

// Point is outside US territory (NWS /points/ 404)
{ "success": false, "reason": "outside_us_coverage", "lat": 51.5074, "lon": -0.1278 }

// Geocoder couldn't resolve the input (ZIP/city not found)
{ "success": false, "reason": "input_not_resolvable", "input": "12345 Notarealplace, ZZ" }

// NWS API transient failure (5xx persisting after retries)
{ "success": false, "reason": "nws_api_unavailable", "last_status": 503, "fallback_attempted": true }
```
