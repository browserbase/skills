---
name: windy-com-geo-weather-fetch-w3o49h
title: Windy.com Location Weather Fetch
description: >-
  Fetch current weather and 5–10 day forecast for a city from Windy.com:
  temperature, wind, precipitation, pressure, humidity, gust. Returns structured
  JSON (Zod-shaped).
website: windy.com
category: weather
tags:
  - weather
  - forecast
  - geolocation
  - ecmwf
  - windy
source: 'browserbase: agent-runtime 2026-05-21'
updated: '2026-05-21'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      When the node.windy.com forecast endpoint is unreachable or you need the
      live-observed (vs. model-forecast) reading, drive the Windy SPA: search
      for the city, read the Wx-station temperature inline in the search
      dropdown, or open the right-click 'Forecast for this location' detail
      panel. Slower (~20–40s wall) than the API (~0.3s) but works without
      trusting node.windy.com availability.
verified: false
proxies: false
---
# Windy.com Location Weather Fetch

## Purpose

Given a city name (and optional country/state disambiguator), return Windy.com's current and multi-day forecast for that location: temperature, "feels like" via dew point, wind speed + direction + gust, precipitation (rain/snow accumulation), cloud cover code, pressure, relative humidity. Output is one structured JSON document per call, shaped for direct Zod validation. Read-only; no auth, no cookies, no clicks that change state.

**Honest framing about the prompt's "residential proxy" hint:** the requested skill description suggests routing the Browserbase session through the target country's residential proxy. That requirement is unnecessary for the optimal path. Windy.com's public forecast endpoint at `node.windy.com` is **not geo-restricted** — verified during iteration by fetching Tokyo, London, Sydney, and Lima forecasts from a `us-west-2` IP with zero proxy bytes consumed. A country-routed residential proxy is only meaningful for the **browser fallback**, where windy.com's SPA picks the "nearest Wx station" by client IP. Lead with the API; reach for proxies only if you fall back to the browser.

## When to Use

- "What's the weather right now in {city}?" → take the first hourly entry from today's data.
- 1–10 day forecast lookups for planning (sailing, flying, outdoor events).
- Multi-city batch fetches — the API is cheap (~26 KB JSON, ~300 ms p50) so you can fan out across cities in parallel without budget concerns.
- Anywhere a static-key weather API (OpenWeather, Tomorrow.io) would otherwise be the path of least resistance — Windy's `node.windy.com` is keyless and returns ECMWF/GFS/ICON at the same resolution paid providers expose.

## Workflow

The optimal path is a **two-hop pure-HTTP flow**: geocode the city name to lat/lon, then fetch the forecast. No browser, no session, no proxy. Both endpoints are public, keyless, and CORS-permissive when called server-side.

### 1. Geocode city → lat/lon (OSM Nominatim)

```
GET https://nominatim.openstreetmap.org/search
    ?q={URL-encoded city, e.g. "Tokyo" or "Paris, France"}
    &format=json
    &limit=1
User-Agent: <your bot identifier — Nominatim requires one>
```

Response is a JSON array; take `[0].lat` and `[0].lon` (both strings, parse as float). OSM Nominatim rate-limits to **1 req/s sustained** per the OSM usage policy — cache results per city (lat/lon doesn't move).

Disambiguation: "Springfield" → many hits worldwide. Always include the country (and US state, if applicable) in the query: `Springfield, Illinois, USA`. The Nominatim `addresstype` + `display_name` fields confirm you got the right place before calling Windy.

### 2. Fetch forecast (`node.windy.com`)

```
GET https://node.windy.com/forecast/{model}/{lat}/{lon}
```

- `{model}` is one of `ecmwf`, `gfs`, `icon` (global, free). Regional/premium models exist (`arome`, `hrrr`, `gem`, `nems`) but may require an account-attached `Authorization` header — confirmed-blocked from anonymous fetch.
- `{lat}` / `{lon}` are decimal degrees, ~4 decimal places is enough. Windy snaps to the nearest model grid cell — the response echoes the snapped coordinate in the `X-Orig-Lat` / `X-Orig-Lon` headers (e.g. requested `35.689,139.692` returned snapped `35.698,139.694` for ECMWF, ~1 km offset).
- **Default to `ecmwf`** — best global skill, 9 km resolution, 11 days available. GFS is a useful sanity check (22 km, 11 days). ICON is sharper over Europe (13 km, 8 days).

Response (gzip-encoded JSON, ~26 KB for 10 days):

```jsonc
{
  "header": {
    "model": "ECMWF",
    "refTime": "2026-05-20T12:00:00Z",     // model init time (UTC ISO)
    "update": "2026-05-20T19:56:48Z",      // when this run was published
    "updateTs": 1779307008000,             // epoch ms
    "elevation": 31,                        // requested point elevation (m)
    "step": 3,                              // hours between entries (3 for ECMWF, 1 for HRRR)
    "utcOffset": 9,                         // local timezone offset hours
    "tzName": "Asia/Tokyo",                 // IANA tz of the requested point
    "sunset": 1779356676487,                 // epoch ms, today's sunset at that point
    "sunrise": 1779305633077,
    "hasWaves": false,                       // true for coastal points
    "daysAvail": 11,                         // forecast horizon in days
    "modelElevation": 0                      // model-grid elevation; |elevation - modelElevation| is the terrain bias
  },
  "data": {
    "2026-05-21": [ /* array of hourly entries, length 24/step */ ],
    "2026-05-22": [ /* ... */ ],
    /* ...up to daysAvail entries... */
  }
}
```

Each hourly entry under `data[date]`:

```jsonc
{
  "day": "2026-05-21",
  "hour": 0,                                // local hour of day
  "ts": 1779289200000,                       // epoch ms (UTC)
  "origTs": 1779289200000,                   // same; pre-DST raw timestamp
  "isDay": 0,                                // 0 night, 1 day, fractional during sunrise/sunset
  "moonPhase": 6,
  "origDate": "2026-05-21T00:00:00+09:00",   // local-tz ISO
  "icon": 19,                                 // weather icon code (1=sunny, 4=cloudy, 7=fog, 14=snow,
                                              //   18/19/20/21=rain bands, see https://www.windy.com/...)
  "icon2": 19,                                // same as icon for free models; differs on premium
  "weathercode": "SCT,CU,CS,BR,-,RA,SH,",    // METAR-ish: cloud cover, cloud type, precip-intensity, type, ...
  "mm": 0.3,                                  // total precipitation mm in this {step}h window
  "snowPrecip": 0,                            // mm water-equivalent of snow
  "convPrecip": 0,                            // mm convective precip
  "rain": 1,                                  // intensity code: 0 none, 1 light, 2 mod, 3 heavy
  "snow": 0,
  "temp": 296.63,                             // KELVIN — subtract 273.15 for °C
  "dewPoint": 295.37,                         // KELVIN
  "wind": 7.4,                                // m/s — multiply 3.6 for km/h, 2.237 for mph, 1.944 for kt
  "windDir": 229,                             // degrees, 0=N, 90=E, 180=S, 270=W
  "rh": 93,                                   // % relative humidity
  "gust": 10.4,                               // m/s
  "pressure": 101250.26,                      // Pa — divide 100 for hPa/mbar
  "cbase": 10456                              // cloud base in m AGL
}
```

### 3. Transform to skill output (Zod-validated)

```ts
const HourlyForecastSchema = z.object({
  ts_utc: z.string(),               // ISO 8601 UTC
  ts_local: z.string(),             // ISO 8601 with local offset
  is_day: z.boolean(),
  temp_c: z.number(),               // header.temp - 273.15
  feels_like_c: z.number().optional(),
  dew_point_c: z.number(),
  humidity_pct: z.number().int(),
  wind_mps: z.number(),
  wind_kmh: z.number(),
  wind_dir_deg: z.number().int(),
  wind_dir_cardinal: z.string(),    // bin to N/NNE/NE/.../NNW
  gust_mps: z.number(),
  pressure_hpa: z.number(),
  cloud_base_m: z.number().nullable(),
  precip_mm: z.number(),
  precip_kind: z.enum(["none","rain","sleet","snow"]),
  icon_code: z.number().int(),
  raw_weathercode: z.string(),
});

const WeatherSchema = z.object({
  success: z.literal(true),
  city: z.string(),
  resolved_address: z.string(),    // OSM display_name
  lat: z.number(),
  lon: z.number(),
  elevation_m: z.number(),
  timezone: z.string(),
  utc_offset_hours: z.number(),
  model: z.enum(["ECMWF","GFS","ICON"]),
  model_run_utc: z.string(),
  model_published_utc: z.string(),
  step_hours: z.number(),
  days_available: z.number().int(),
  sunrise_utc: z.string(),
  sunset_utc: z.string(),
  current: HourlyForecastSchema,           // = data[today][nearest-future hour]
  hourly: z.array(HourlyForecastSchema),   // flatten data[*] in chronological order
  daily: z.array(z.object({                 // aggregate hourly per local-day
    date: z.string(),
    temp_c_min: z.number(),
    temp_c_max: z.number(),
    precip_mm: z.number(),
    wind_mps_max: z.number(),
    gust_mps_max: z.number(),
    humidity_pct_avg: z.number(),
  })),
});
```

"Current" = pick the entry in `data[today]` whose `ts` is closest to `Date.now()`; for the typical 3 h ECMWF cadence the worst-case lag is 90 minutes. If freshness matters more than model skill, switch to `icon` (1 h step in some regions) or fall back to the browser path for the live Wx-station reading.

### Browser fallback

Use only when `node.windy.com` returns 5xx or times out twice. The site is bot-friendly with a bare Browserbase session — no Akamai, no captcha observed across iterations.

1. Create a bare session: `browse cloud sessions create --keep-alive`. **A residential proxy is not required for the API**, but if you do route through the target country's residential pool (`--body '{"proxies":[{"type":"browserbase","geolocation":{"country":"JP","city":"TOKYO"}}], ...}'`), the SPA picks closer Wx stations and renders place names in the local script (e.g. Japanese kanji for Tokyo districts). The proxy does **not** unlock anything that's otherwise blocked.
2. Navigate to `https://www.windy.com/?{lat},{lon},{zoom}` (querystring form, comma-delimited, zoom 9–11 for city scale). The path-style URL `/lat,lon,zoom` is silently ignored and redirected to the IP-geolocated default.
3. `browse snapshot` → grab the search textbox ref. `browse click @<ref>` then `browse type "{city}"` then wait 2 s for the autocomplete dropdown.
4. Within the dropdown, the **first link starting with "Wx station: …"** carries the live-observed temperature inline as its accessible name (e.g. `"Wx station: Tokyo 47662, Japan 71°F"`). Regex-extract `(\d+)°([FC])` from the link text. This is the cheapest live-observed reading windy.com exposes without a click.
5. For multi-day forecast in browser mode, click the named-city link instead of the Wx station; the URL hash mutates to include detail params and the right-side panel renders a 10-day table. Read with `browse get markdown body` and parse the table rows.

## Site-Specific Gotchas

- **Residential proxy is not required for the API path.** The prompt asks for a country-routed Browserbase session; that requirement applies only to the browser fallback. The `node.windy.com` endpoint returns identical bytes from any source IP — verified 4 cities × 3 models from `us-west-2` with `proxyBytes: 0`.
- **Browserbase `--proxies` flag, when combined with `--body '{"proxies":[...]}'`, silently no-ops in the session-create CLI path used here.** Sessions created with the array-form proxies config came back with no `proxies` field on the response and `proxyBytes: 0` after multiple requests; `ipinfo.io/json` consistently returned the AWS Boardman IP (`52.x.x.x`, `org: AS16509 Amazon`). If you actually need the residential pool to apply, use the boolean `--proxies` flag for generic residential and verify with `https://api.country.is/` before trusting the routing. **Confirmed-blocked path:** geo-targeted residential routing via `--body` JSON.
- **Path-style coordinate URLs don't work.** `https://www.windy.com/35.689,139.692,11` redirects to the IP-default view. Use the querystring form: `https://www.windy.com/?35.689,139.692,11`. The `?detail,lat,lon` and `?lat,lon,zoom,d:picker` hash variants I attempted (cribbed from old windy URL schemes) also fail to render a detail panel — the SPA expects detail panels to be opened via the right-click context menu or by clicking a Wx-station search result.
- **Units are SI all the way down**: `temp` and `dewPoint` are **Kelvin**, `wind` and `gust` are **m/s**, `pressure` is **Pa**. Skipping the conversion will produce "23°C" readings of `296.63` and silently propagate. Convert at the API-to-schema boundary, never in the consumer.
- **`step` differs per model.** ECMWF = 3 h, ICON ≈ 1 h, GFS = 3 h. `Object.keys(data.data).length` is the number of local-tz days; per-day entries = `24 / step`. Compute "current" by `data[today].find(h => h.ts >= Date.now())` or the previous-ish entry — don't assume hourly granularity.
- **`refTime` is UTC, `origDate` is local.** Mixing them produces 9-hour skews for Tokyo, 5-hour skews for NYC. Carry `header.tzName` through to the consumer and prefer `origDate` when displaying hours.
- **`X-Orig-Lat` / `X-Orig-Lon` headers reveal the snapped grid cell.** For ECMWF in Tokyo, the request `35.689,139.692` snapped to `35.698,139.694` (~1 km offset). If you need to surface the actual modeled location to the consumer, prefer the snapped coordinates over the input.
- **OSM Nominatim rate limit is real.** 1 req/s sustained, identifiable User-Agent required. Cache lat/lon per city — they don't move. Bulk-geocoding many cities at once will get you a 429; throttle or use a self-hosted Nominatim mirror.
- **Premium models (`arome`, `hrrr`, `gem`, `meteoblue`, `nems`)** require an `Authorization` header tied to a Windy Premium account. Anonymous fetch returns 401 or empty `data`. Don't waste turns probing them without an account.
- **`hasWaves: true`** appears for coastal points; the response then includes `wave_height`, `wave_period`, `wave_direction` per hourly entry. Plumb these through when relevant; inland points omit the fields silently.
- **`weathercode` is a comma-delimited METAR-ish string** (`"BKN,CU,CS,BR,-,RA,SH,"`) — 8 fields: cloud cover (FEW/SCT/BKN/OVC), low-cloud type, mid-cloud type, obstructions (BR=mist, FG=fog), precip intensity (-/~/+), precip type (RA/SN/PL/IC), precip qualifier (SH=showers/TS=thunderstorms), trailing reserved. The numeric `icon` field is a more agent-friendly summary (1=sun, 4=overcast, 14=snow, 18/19/20/21=rain bands).
- **`hour: 0` entries have `isDay: 0`.** Don't treat `isDay` as the "is it daytime in absolute UTC" — it's local-night/day with fractional values during civil twilight (e.g. `0.05556` at 6 AM local for a Tokyo May entry).
- **`mm` is the precip total over the next `step` hours, not hourly rate.** For ECMWF with `step: 3` a `mm: 0.3` reading means 0.3 mm in 3 h, not 0.3 mm/h. Document this in your schema to prevent consumers double-multiplying.

## Expected Output

Successful fetch (Tokyo, ECMWF, captured 2026-05-21 ~00:11 UTC):

```json
{
  "success": true,
  "city": "Tokyo",
  "resolved_address": "Tokyo, Japan",
  "lat": 35.6768601,
  "lon": 139.7638947,
  "elevation_m": 31,
  "timezone": "Asia/Tokyo",
  "utc_offset_hours": 9,
  "model": "ECMWF",
  "model_run_utc": "2026-05-20T12:00:00Z",
  "model_published_utc": "2026-05-20T19:56:48Z",
  "step_hours": 3,
  "days_available": 11,
  "sunrise_utc": "2026-05-20T19:33:53Z",
  "sunset_utc": "2026-05-21T09:44:36Z",
  "current": {
    "ts_utc": "2026-05-20T15:00:00Z",
    "ts_local": "2026-05-21T00:00:00+09:00",
    "is_day": false,
    "temp_c": 23.5,
    "dew_point_c": 22.2,
    "humidity_pct": 93,
    "wind_mps": 7.4,
    "wind_kmh": 26.6,
    "wind_dir_deg": 229,
    "wind_dir_cardinal": "SW",
    "gust_mps": 10.4,
    "pressure_hpa": 1012.5,
    "cloud_base_m": 10456,
    "precip_mm": 0.3,
    "precip_kind": "rain",
    "icon_code": 19,
    "raw_weathercode": "SCT,,CS,,-,RA,,"
  },
  "hourly": [ /* up to days_available × (24/step_hours) entries */ ],
  "daily": [
    { "date": "2026-05-21", "temp_c_min": 23.2, "temp_c_max": 26.4, "precip_mm": 1.1, "wind_mps_max": 10.8, "gust_mps_max": 14.2, "humidity_pct_avg": 87 }
  ]
}
```

Failure shapes:

```json
{ "success": false, "reason": "city_not_found", "city": "Atlanis" }
```

```json
{ "success": false, "reason": "ambiguous_city", "city": "Springfield",
  "matches": [
    { "display_name": "Springfield, Illinois, USA", "lat": 39.8017, "lon": -89.6437 },
    { "display_name": "Springfield, Missouri, USA", "lat": 37.2090, "lon": -93.2923 },
    { "display_name": "Springfield, Massachusetts, USA", "lat": 42.1015, "lon": -72.5898 }
  ]
}
```

```json
{ "success": false, "reason": "model_unavailable", "city": "Tokyo", "model": "arome",
  "detail": "AROME has no coverage at 35.677,139.764 (Europe-only); fall back to ecmwf or icon." }
```

```json
{ "success": false, "reason": "upstream_error", "city": "Tokyo", "model": "ecmwf",
  "status_code": 502, "detail": "node.windy.com returned 502 after 2 retries; try browser fallback." }
```
