---
name: surfline-com-get-forecast-0ry7ls
title: Surfline Spot Forecast
description: >-
  Return Surfline's free-tier surf forecast for a single spot — given a spot
  URL, 24-char spot ID, or name (with optional region qualifier). Current
  conditions, multi-day surf height + swell + wind, tide table, sunrise/sunset,
  live-cam URL, and canonical URL. Read-only; Premium features (16-day, observed
  wind, HD rewind) are surfaced as omitted.
website: surfline.com
category: weather
tags:
  - surfing
  - weather
  - forecast
  - ocean
  - tides
  - surfline
source: 'browserbase: admin-edit 2026-05-18'
updated: '2026-05-18'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      Surfline spot pages are Next.js with full SSR hydration — the
      spot.report.data block in __NEXT_DATA__ mirrors the /kbyg/spots/reports
      JSON. Use as a fallback when services.surfline.com is unreachable. The
      multi-day forecast endpoints are NOT in __NEXT_DATA__, so the API path is
      still required for the 5-day window.
verified: false
proxies: false
---
# Surfline Spot Forecast

## Purpose

Return Surfline's free-tier surf forecast for a single spot — given a Surfline spot URL, a Surfline spot ID, or a spot name (optionally qualified by region). Output includes current conditions (surf-height range, POOR/FAIR/GOOD/EPIC rating, wind, water temp, air temp, tide stage), a multi-day forecast (per-day AM/PM/dawn/dusk surf-height + wind + swell components), today's tide table, sunrise/sunset, the live-cam still + HLS URLs when the spot has cams, and the canonical spot URL. Read-only — never logs in, books, or modifies anything on Surfline.

## When to Use

- A surfer / agent asks for the current report or upcoming forecast for a named spot ("how's Ocean Beach tomorrow morning?", "is Pipeline firing?").
- Periodic polling of a spot for swell-event detection (rising swell, wind switch, tide drop into the optimal window).
- Pre-trip planning across multiple spots — call once per spotId and stitch the results.
- Any flow that needs the free-tier consumer forecast. **Long-range (16-day) forecast, expert analyst write-ups, HD rewind clips, and `sl_live-wind` observed-wind feeds are Premium-gated — this skill does not cover them.** See gotchas for the auth boundary.

## Workflow

**Surfline publishes a public, anonymous JSON API at `https://services.surfline.com/...` that serves the entire free-tier dataset with zero auth and zero anti-bot.** Use it directly — do not drive the browser. The `__NEXT_DATA__` JSON in the spot HTML page contains a subset of the same data (used for SSR hydration) and is the documented browser-fallback when the API is unreachable. The cost difference is ~30× (a single `browse cloud fetch` call vs. a full Browserbase session for the same payload).

### 1. Resolve the input to a 24-character `spotId`

| Input shape | Resolution |
|---|---|
| `https://www.surfline.com/surf-report/<slug>/<spotId>` | `spotId` is the trailing path segment — a 24-char hex ObjectId. The slug is decorative; Surfline routes purely on the `spotId`. |
| Bare 24-char hex ObjectId (e.g. `5842041f4e65fad6a77087f9`) | Use as-is. |
| Spot name (`"Ocean Beach"`, `"Pipeline"`, `"Bondi"`) — optionally with region qualifier | Call the Search API (step 2). |

### 2. Spot-name search (only when no `spotId` is in hand)

```
GET https://services.surfline.com/search/site?q=<urlenc spot name>&querySize=10&suggestionSize=5
```

Returns a JSON **array** (not object) of 5 Elasticsearch-style sections, in this fixed order: `[0]` spots, `[1]` subregions, `[2]` geonames, `[3]` editorial, `[4]` travel. Parse section `[0].hits.hits[]` — each hit has:

```jsonc
{
  "_id": "5842041f4e65fad6a77087f9",          // the spotId
  "_score": 20.4,
  "_type": "spot",
  "_source": {
    "name": "South Ocean Beach",
    "breadCrumbs": ["United States","California","San Francisco County","San Francisco"],
    "location": {"lat": 37.74, "lon": -122.51},
    "href": "https://www.surfline.com/surf-report/south-ocean-beach/...",
    "cams": ["<camId>", ...],
    "humanReported": true
  }
}
```

**Disambiguate by filtering `_source.breadCrumbs`** against the caller's region qualifier (case-insensitive substring match against the joined breadcrumb is reliable). If the caller gave just a spot name and multiple hits remain after filtering, emit `{ "ambiguous": true, "matches": [...] }` with the top hits so the user can pick. **Do not** include the region in the `q=` query — see gotchas; Surfline's search index is name-only, and `q=ocean+beach+san+francisco` returns 0 spot hits, while `q=ocean+beach` returns the four real SF Ocean Beach spots.

### 3. Fetch the current report

```
GET https://services.surfline.com/kbyg/spots/reports?spotId=<spotId>
```

Returns:

```jsonc
{
  "associated": {
    "href": "https://www.surfline.com/surf-report/<slug>/<spotId>",  // canonical URL — copy verbatim
    "timezone": "America/Los_Angeles",
    "utcOffset": -7,
    "units": {"temperature":"F","tideHeight":"FT","waveHeight":"FT","windSpeed":"KTS",...}
  },
  "spot": {
    "_id": "...", "name": "South Ocean Beach", "lat": ..., "lon": ...,
    "breadcrumb": [{"name":"United States","href":"..."}, ...],
    "cameras": [
      {
        "title": "SF - Taraval",
        "alias": "wc-taraval",
        "streamUrl": "https://hls.cdn-surfline.com/.../playlist.m3u8",  // HLS live stream
        "stillUrlFull": "https://camstills.cdn-surfline.com/.../latest_full.jpg",  // latest frame
        "rewindBaseUrl": "https://camrewinds.cdn-surfline.com/...",
        "isPremium": false, "nighttime": true, "status": {"isDown": false}
      }
    ]
  },
  "forecast": {
    "waveHeight": {"min":3,"max":4,"plus":false,"humanRelation":"Waist to chest"},
    "conditions": {"value":"FAIR","sortableCondition":3},   // POOR / FAIR / GOOD / EPIC
    "wind":       {"speed":3,"direction":194,"directionType":"Cross-shore","gust":8},
    "waterTemp":  {"min":63,"max":63},
    "weather":    {"temperature":61,"condition":"NIGHT_MOSTLY_CLOUDY"},
    "tide":       {"previous":{"type":"HIGH","height":7,"timestamp":...},
                   "current": {"type":"NORMAL","height":6.7,"timestamp":...},
                   "next":    {"type":"LOW","height":-1.7,"timestamp":...}},
    "wetsuit":    {"thickness":"4/3 mm w/ booties","type":"Fullsuit"}
  },
  "permissions": {"violations": [{"permission":{"name":"sl_core-16day-forecast"}}, ...]}
}
```

This single call covers the **current conditions** block. `associated.href` is the canonical spot URL; emit it verbatim. `spot.cameras[]` is the live-cam URL surface — if the array is empty (some spots have no cam), set `live_cam_url: null` in your output.

### 4. Fetch the multi-day forecast

Five parallel calls, all anonymous:

```
GET https://services.surfline.com/kbyg/spots/forecasts/wave?spotId=<spotId>&days=5&intervalHours=3
GET https://services.surfline.com/kbyg/spots/forecasts/wind?spotId=<spotId>&days=5&intervalHours=3
GET https://services.surfline.com/kbyg/spots/forecasts/tides?spotId=<spotId>&days=5
GET https://services.surfline.com/kbyg/spots/forecasts/sunlight?spotId=<spotId>&days=5
GET https://services.surfline.com/kbyg/spots/forecasts/conditions?spotId=<spotId>&days=5
```

- `wave.data.wave[]` — `intervalHours=3` gives 8 points/day. Each item has `timestamp`, `surf.min/max/plus/humanRelation`, and `swells[]` (an array of up to 6 swell components, each with `height/period/direction/impact/power`). Component[0] is the primary swell; component[1] is the secondary; later components are usually trace energy (height ≈ 0).
- `wind.data.wind[]` — same 3-hour grid, with `speed`, `direction` (degrees, 0 = from N), `directionType` (`Onshore` / `Offshore` / `Cross-shore`), `gust`.
- `tides.data.tides[]` — continuous hourly heights (~28/day, 140 over 5 days) with `type` ∈ `{LOW, HIGH, NORMAL}`. Filter to `type !== "NORMAL"` to get just the high/low extrema (typically 4/day) for a tide table.
- `sunlight.data.sunlight[]` — one entry per day with `dawn`, `sunrise`, `sunset`, `dusk` (unix seconds, with `*UTCOffset` siblings for local-time conversion).
- `conditions.data.conditions[]` — one entry per day with `forecastDay` (`YYYY-MM-DD`), human `headline`, long-form `observation`, optional `forecaster.{name,avatar}`, and `am` / `pm` rating blocks. **The `am`/`pm` rating blocks are frequently null/empty on the free tier** — derive AM/PM surf-height ranges yourself from the `wave[]` 3-hour grid (group by local-time hour < 12 vs ≥ 12, take min/max).

To bucket the wave grid into AM / PM / dawn / dusk per day:

1. For each `wave[i]`, compute local time = `wave[i].timestamp + wave[i].utcOffset*3600` (then `%86400 / 3600` for hour-of-day).
2. AM = `hour ∈ [6, 12)`, PM = `hour ∈ [12, 18)`, dawn = the point nearest `sunlight[d].dawn`, dusk = nearest `sunlight[d].dusk`.
3. Per-bucket `min` = min of `surf.min` across points in the bucket; `max` = max of `surf.max`.

### 5. Stitch and emit

Combine into the schema in the **Expected Output** section. `spotId`, `name`, `region` come from step 3's `spot` / `associated`. `live_cam_url` is `spot.cameras[0].streamUrl` (or `stillUrlFull` if you prefer the static frame). `canonical_url` is `associated.href`. Forecast window is 5 days unless caller overrides (max 10 — see gotchas).

### Browser fallback (use only if the API is blocked / unreachable)

Surfline spot pages are Next.js with full SSR hydration. Open the canonical URL and read `<script id="__NEXT_DATA__">` — the JSON contains `props.pageProps.ssrReduxState.spot.report.data.{forecast, spot}` which mirrors the `/kbyg/spots/reports` payload. The multi-day forecast endpoints are **not** in `__NEXT_DATA__` — for full 5-day data the API path is still the only option. `browse cloud fetch <spot URL>` works on the HTML route too (verified — Cloudflare returns 200, no anti-bot challenge).

```bash
browse cloud fetch "https://www.surfline.com/surf-report/<slug>/<spotId>" --output spot.html
# Extract __NEXT_DATA__ JSON from <script id="__NEXT_DATA__">...</script>
# Parse props.pageProps.ssrReduxState.spot.report.data
```

## Site-Specific Gotchas

- **The KBYG API is fully public — no auth, no cookies, no API key, no anti-bot, no per-IP rate-limit observed.** `browse cloud fetch` against `services.surfline.com/...` returns 200 directly. `--verified` and `--proxies` are not required.
- **Premium auth boundary surfaces as a `permissions.violations[]` array, not a 4xx.** Every anonymous response includes the violations the caller doesn't have permission for — most commonly `sl_core-16day-forecast` (the 6-to-16-day extension) and `sl_live-wind` (real-time observed wind from anemometer stations). Authenticated Premium cookies fill the data behind those permissions but **return the same HTTP 200 and the same response shape**. Treat `permissions.violations` as informational — your code can keep advertising the visible data and surface the violation names as a `premium_features_omitted` list in the output if useful.
- **`days` parameter caps at 10 on the free tier, not 5.** `days=5`, `7`, `10` all return full data anonymously (verified iter-1). `days=16` returns HTTP 400 `Bad Request` — that's the Premium upper bound. The prompt's "5+ days = Premium" is an over-simplification; the real free ceiling is 10. The conservative default for "free-tier window" is `days=5`.
- **`intervalHours` ∈ {1, 3, 6, 12}.** 3 is the default and matches what the website renders. `intervalHours=1` returns 24 points/day for fine-grained AM/PM bucketing.
- **`spotId` is a 24-character hex ObjectId. The slug in the URL is decorative — Surfline routes purely on the trailing ID.** A wrong-slug + correct-ID URL still resolves to the right spot. Conversely, a "guessed" spot ID like `5842041f4e65fad6a7708cef` is *not* SF Ocean Beach (it's Praia da Vila Imbituba, Brazil) — never guess; always resolve via the Search API or accept the ID from the user.
- **The Search API is name-only — adding a city qualifier to `q=` returns 0 spot hits.** `q=ocean beach san francisco` → 0 spots. `q=ocean beach` → 4 spots including all three SF Ocean Beach sub-spots and SD's Ocean Beach Pier. **Filter by `_source.breadCrumbs` in the search response, not by widening the query.** When the user gives `"Ocean Beach, San Francisco"`, search `q=ocean beach` then filter for `"San Francisco"` in breadCrumbs.
- **`Ocean Beach` is famously overloaded.** Search returns Ocean Beach Pier (San Diego), South / North / Central Ocean Beach (SF, all distinct spots — Surfline split the SF stretch into segments years ago). For SF, `South Ocean Beach` (`5842041f4e65fad6a77087f9`) is the most-trafficked report. **There is no single "Ocean Beach (SF)" spot** — pick a segment and document the choice in your output, or return ambiguous.
- **Camera array is empty for spots without a published cam.** Don't assume `spot.cameras[0]` exists. Some spots have only `internalCameras` (Surfline editorial/back-office; not publicly streamable) — treat those the same as no cam.
- **`cameras[i].streamUrl` is an HLS `.m3u8` playlist, not an MP4.** A web client needs hls.js or Safari to render it; if your downstream needs a single frame, use `stillUrlFull` (latest JPEG) instead. `rewindBaseUrl` + a date-suffixed clip name gives the last day's recorded rewind (Premium gets HD; free tier gets the SD `.mp4` clip that's already linked in `cameras[i].rewindClip`).
- **`cameras[i].nighttime: true`** signals the cam is in darkness — the still frame will be black/grey. Useful for clients that want to suppress dead-of-night cam thumbnails.
- **Wind direction is degrees-from (meteorological), 0 = North**, not vector-toward. `directionType` is the spot-relative classifier (`Onshore`, `Offshore`, `Cross-shore`, `Glassy`); prefer that for human-readable output.
- **The daily `conditions[].am` / `conditions[].pm` blocks are usually null/empty on free-tier responses.** The `headline` and `observation` strings are populated when a forecaster is on duty (varies by region — SF often has them; minor international spots rarely do). For deterministic AM/PM surf-height ranges, derive them from the `wave[].surf.min/max` 3-hour grid yourself (see step 4 of the workflow).
- **Units come from `associated.units`** — usually imperial (`FT`, `KTS`, `F`). Some country presets default to metric. The data values are already in those units; do not convert blindly. If your output needs a fixed unit system, convert based on the `units` block.
- **`tides[]` is 28 points/day, not 4.** Each entry has `type` ∈ `{LOW, HIGH, NORMAL}`; the `NORMAL` entries are interpolated hourly heights. For a classic tide table (4 extrema/day), filter `type !== "NORMAL"`.
- **All timestamps are unix seconds with a separate `utcOffset` (hours).** Convert to local time as `new Date((timestamp + utcOffset*3600) * 1000).toUTCString()` and strip "GMT" to display. Don't trust the host's local timezone — spots span every UTC offset.
- **`browse cloud browse` (driving a live Browserbase session over WSS) was unreachable from the sandbox runtime this skill was built in** (`connect.usw2.browserbase.com` did not resolve). All discovery was done through `browse cloud fetch`. The skill itself only needs `browse cloud fetch` to run, so this is not a blocker for users.
- **The Search API also returns geonames, editorial, travel, and subregion sections — do NOT use these for spot resolution.** Only section `[0]` (`_type: spot`) carries `_id` values usable with the `/kbyg/spots/reports` endpoint. Geoname IDs are different (e.g. `5378706`) and will 404 on the spot endpoints.
- **Cloudflare fronts the website (`www.surfline.com`) but not the API (`services.surfline.com`).** The HTML route sets a `__cf_bm` bot-management cookie on every response; the API route does not. Don't try to forward HTML-route cookies into API requests — they're ignored.

## Expected Output

```json
{
  "spotId": "5842041f4e65fad6a77087f9",
  "name": "South Ocean Beach",
  "region": "San Francisco, California, United States",
  "breadcrumb": ["United States", "California", "San Francisco County", "San Francisco"],
  "lat": 37.741668,
  "lon": -122.51038,
  "timezone": "America/Los_Angeles",
  "utc_offset": -7,
  "units": {
    "temperature": "F",
    "tideHeight": "FT",
    "waveHeight": "FT",
    "windSpeed": "KTS"
  },
  "canonical_url": "https://www.surfline.com/surf-report/south-ocean-beach/5842041f4e65fad6a77087f9",
  "current": {
    "surf_height_min_ft": 3,
    "surf_height_max_ft": 4,
    "surf_height_plus": false,
    "surf_height_human": "Waist to chest",
    "rating": "FAIR",
    "rating_score": 3,
    "wind_speed_kts": 3,
    "wind_direction_deg": 194,
    "wind_direction_type": "Cross-shore",
    "wind_gust_kts": 8,
    "water_temp_f": 63,
    "air_temp_f": 61,
    "weather_condition": "NIGHT_MOSTLY_CLOUDY",
    "tide_stage": {
      "type": "NORMAL",
      "height_ft": 6.7,
      "timestamp": 1778906035,
      "trend": "falling"
    },
    "wetsuit": {"thickness": "4/3 mm w/ booties", "type": "Fullsuit"},
    "as_of_unix": 1778906035
  },
  "live_cam": {
    "title": "SF - Taraval",
    "alias": "wc-taraval",
    "stream_url": "https://hls.cdn-surfline.com/oregon/wc-taraval/playlist.m3u8",
    "still_url": "https://camstills.cdn-surfline.com/.../latest_full.jpg",
    "is_premium": false,
    "is_nighttime": true,
    "rewind_clip_url": "https://camrewinds.cdn-surfline.com/.../wc-taraval.YYYY-MM-DD.mp4"
  },
  "forecast": [
    {
      "date": "2026-05-16",
      "headline": "Solid size, poor conditions all day from strong onshore NW wind.",
      "observation": "...long-form forecaster note when available...",
      "forecaster": {"name": "Matt Kibby", "avatar": "https://..."},
      "dawn":  {"surf_min_ft": 4, "surf_max_ft": 6, "wind_kts": 8,  "wind_direction_type": "Offshore",  "swell_primary":   {"height_ft": 6.5, "period_s": 12, "direction_deg": 285}},
      "am":    {"surf_min_ft": 4, "surf_max_ft": 6, "wind_kts": 12, "wind_direction_type": "Onshore",   "swell_primary":   {"height_ft": 6.5, "period_s": 12, "direction_deg": 285}, "swell_secondary": {"height_ft": 1.8, "period_s": 16, "direction_deg": 200}},
      "pm":    {"surf_min_ft": 5, "surf_max_ft": 7, "wind_kts": 22, "wind_direction_type": "Onshore",   "swell_primary":   {"height_ft": 7.1, "period_s": 12, "direction_deg": 290}},
      "dusk":  {"surf_min_ft": 4, "surf_max_ft": 6, "wind_kts": 18, "wind_direction_type": "Onshore",   "swell_primary":   {"height_ft": 6.8, "period_s": 12, "direction_deg": 290}},
      "sunrise_unix": 1778926000, "sunset_unix": 1778973000,
      "dawn_unix":    1778924500, "dusk_unix":   1778974500
    }
    /* ...4 more entries for days=5 (up to 9 more for days=10) */
  ],
  "tides_today": [
    {"type": "HIGH", "height_ft":  7.0, "timestamp": 1778903407, "local_time": "2026-05-16T03:30:07-07:00"},
    {"type": "LOW",  "height_ft": -1.7, "timestamp": 1778928878, "local_time": "2026-05-16T10:34:38-07:00"},
    {"type": "HIGH", "height_ft":  5.4, "timestamp": 1778951200, "local_time": "2026-05-16T16:46:40-07:00"},
    {"type": "LOW",  "height_ft":  1.1, "timestamp": 1778974900, "local_time": "2026-05-16T23:21:40-07:00"}
  ],
  "sunlight_today": {
    "dawn":    "2026-05-16T05:42:00-07:00",
    "sunrise": "2026-05-16T06:09:00-07:00",
    "sunset":  "2026-05-16T20:13:00-07:00",
    "dusk":    "2026-05-16T20:40:00-07:00"
  },
  "premium_features_omitted": ["sl_core-16day-forecast", "sl_live-wind"],
  "source": "services.surfline.com kbyg/spots/{reports,forecasts/*}"
}
```

Ambiguous-name outcome (multiple SF Ocean Beach segments, or unqualified "Ocean Beach"):

```json
{
  "ambiguous": true,
  "query": "ocean beach",
  "matches": [
    {"spotId":"5842041f4e65fad6a770883f","name":"Ocean Beach Pier","region":"San Diego, California","lat":32.75,"lon":-117.25,"href":"https://www.surfline.com/surf-report/ocean-beach-pier/5842041f4e65fad6a770883f"},
    {"spotId":"5842041f4e65fad6a77087f9","name":"South Ocean Beach","region":"San Francisco, California","lat":37.74,"lon":-122.51,"href":"https://www.surfline.com/surf-report/south-ocean-beach/5842041f4e65fad6a77087f9"},
    {"spotId":"5d9b68deab58860001c7359e","name":"North Ocean Beach","region":"San Francisco, California","lat":37.78,"lon":-122.51,"href":"https://www.surfline.com/surf-report/north-ocean-beach/5d9b68deab58860001c7359e"},
    {"spotId":"638e32a4f052ba4ed06d0e3e","name":"Central Ocean Beach","region":"San Francisco, California","lat":37.76,"lon":-122.51,"href":"https://www.surfline.com/surf-report/central-ocean-beach/638e32a4f052ba4ed06d0e3e"}
  ]
}
```

Not-found outcome:

```json
{ "found": false, "query": "<original query>", "reason": "no spot matches name or breadcrumb filter" }
```
