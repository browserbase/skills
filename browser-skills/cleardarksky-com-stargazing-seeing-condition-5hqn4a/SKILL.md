---
name: cleardarksky-com-stargazing-seeing-condition-5hqn4a
title: Stargazing Viewing Conditions (Clear Sky Chart)
description: >-
  Given a location, return the best stargazing time slots for tonight and the
  next couple of nights from its ClearDarkSky Clear Sky Chart, plus warnings
  (clouds, moon, poor seeing/transparency, wind, smoke, dew). Read-only.
website: cleardarksky.com
category: astronomy
tags:
  - astronomy
  - stargazing
  - weather
  - forecast
  - read-only
source: 'browserbase: agent-runtime 2026-06-17'
updated: '2026-06-17'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      A remote browser session works too: `browse open` the chart page then
      `browse snapshot` — the image-map `<area title>` cells surface as
      StaticText nodes in the accessibility tree, so the same data is
      extractable without OCR'ing the color GIF. Costs ~$1.6/run and ~15 turns
      vs. a single free HTTP fetch, so only use it if direct fetch is
      unavailable.
verified: false
proxies: false
---
# Stargazing Viewing Conditions (Clear Sky Chart)

## Purpose

Given a location, determine the best **stargazing time slots for tonight and the next couple of nights** from cleardarksky.com's "Clear Sky Chart" (the Allan Rahill / Canadian Meteorological Centre astronomy forecast), and surface what to watch out for (clouds, bright moon, poor transparency/seeing, wind, smoke, dew). The chart's famous colored grid is *also* fully encoded as **text** inside the page's image-map `<area title="...">` attributes — so the entire task is solvable with a single HTTP `fetch` of the chart page and a parse, with **no image/vision reading, no browser, no auth, and no proxy**. Read-only.

## When to Use

- "Is tonight good for stargazing near {place}? When is it best?"
- Planning an observing / astrophotography session over the next 2–3 nights.
- Deciding go / no-go for a star party, and flagging dew, moonlight, or smoke risk.
- Any flow that needs hourly cloud / transparency / seeing / darkness / moon data for an observing site in North America.

## Workflow

The recommended method is a plain `fetch` of the chart page. The colored GIF is decorative — **do not OCR it**; every hour of the forecast is duplicated as readable text in the page's HTML image map.

### 1. Resolve the chart key for the location

Each chart has a short key (e.g. `SpcrObAZ`, `ChrSprPkPA`, `Ottawa`). Find it with the `find_chart.py` CGI (returns HTML; links point to `../c/<KEY>key.html`):

- **By name (most common):**
  ```
  GET https://www.cleardarksky.com/cgi-bin/find_chart.py?type=text&keys=<URL-ENCODED NAME>&Mn=dobsonian&doit=Find
  ```
  Parse result anchors matching `href=../c/([A-Za-z0-9]+)key\.html>\s*<name>`. There are ~6,300 charts (observatories, parks, towns) across North America; an exact city may map to a nearby named observing site — pick the closest/best match and note it.
- **By coordinates** (when no named site matches): `?type=llmap&olat=<lat>&olong=<lon>&unit=1` (decimal degrees) returns nearby charts.
- **By request IP:** `?type=geoLocate`.

The `Mn=` param is cosmetic. A trailing `?1` on `...key.html` links is just a cache-buster.

### 2. Fetch the chart page

```
GET https://www.cleardarksky.com/c/<KEY>key.html
```
Returns 200, plain HTML, no cookies/auth/anti-bot. Extract three things from the HTML:
- `tz` offset → from the `tz=-X.X` token in the "Sun & Moon Data" link.
- Model run date (YYYYMMDD, run at **12:00 UTC**) → from any `f.php?p=YYYYMMDD…` href.
- `Last updated YYYY-MM-DD HH:MM:SS` (local) → freshness check.

### 3. Parse the image-map cells

Each `<area>` carries the forecast value in its `title` and (for the weather rows) a code in its `href`.

- **Hourly weather rows** — one cell per hour, e.g.
  `<area title="21:00: Clear (12Z+9hr)" coords="..." href="../f.php?p=202606173C00912SpcrObAZ">`.
  The letter after the date+server-digit in `p=` identifies the quantity:
  | code | row | example values |
  |---|---|---|
  | `C` | Cloud Cover | `Clear`, `10%`…`90% covered`, `Overcast` |
  | `T` | Transparency | `Transparent`, `Above Average`, `Average`, `Below Average`, `Poor`, `Too cloudy to forecast` |
  | `S` | Seeing | `Excellent 5/5` … `Bad 1/5`, `Too cloudy to forecast` |
  | `W` | Smoke | `No Smoke`, `…µg/m³` |
  | `D` | Wind | speed range (e.g. `9 to 18 km/hr`) |
  | `H` | Humidity | `%` range |
  | `R` | Temperature | temp range |
- **Darkness / Moon row** — finer **10-minute** cells, NO `f.php` href:
  `<area title="22:00 Limiting Mag:5.9, SunAlt: -24.4&deg;, MoonAlt 3.3&deg;, MoonIllum 13%" coords="...">`.
  This gives, per 10 min: limiting magnitude (sky darkness), Sun altitude, Moon altitude, Moon illumination %.

### 4. Build the timeline and align rows

- Absolute UTC of an hourly cell = `(model-run date at 12:00 UTC) + Nhr` (the `(12Z+Nhr)` age). Local time = UTC + `tz`. The displayed `H:MM` is already local to the site — exactly what the stargazer wants.
- **Align the rows by their column x-coordinate (`coords="x,…"`), NOT by forecast age.** Different rows use slightly different age bases (e.g. the Seeing row starts at `12Z+3hr` while Cloud starts at `12Z+4hr`). Column `x` is the single source of truth that the same time column lines up across all rows.
- For each hourly column, attach the Sun/Moon/limiting-mag from the darkness cell with the nearest x.

### 5. Score and group "best" slots, per night

A good observing hour = **dark** (SunAlt below ≈ −12°; astronomical-dark is below −18°) AND Cloud `Clear`/`10–20% covered` AND Transparency `Average` or better AND Seeing `Average 3/5` or better. Bonus when the Moon is below the horizon (`MoonAlt < 0`) or illumination is low. Group consecutive good hours into local-time ranges and bucket them by the night they belong to (hours after local noon, plus the early-morning hours of the next date, form one "night"). The chart spans ≈81 hourly cells (~3.4 days) → it always covers tonight + the next 2–3 nights.

### 6. Emit warnings

Flag: bright Moon up during dark hours (high `MoonIllum` with `MoonAlt > 0`); Seeing dips to `Poor`/`Bad`; Transparency `Below Average`/`Poor`; high Wind; any Smoke; very high Humidity (dew/frost risk on optics).

### Browser fallback

If direct fetch is unavailable, a remote session works (verified — $1.58, 15 turns):
```bash
browse open "https://www.cleardarksky.com/c/<KEY>key.html" --remote --session "$sid"
browse snapshot --remote --session "$sid"
```
The `<area title>` cells surface as StaticText nodes in the accessibility tree, so the same parse applies. **Do not** try to read the colored GIF visually, and don't bother with `browse get text` on the image — the data lives in the image-map titles, which the snapshot exposes but `get text body` does not.

## Site-Specific Gotchas

- **The data is in image-map `<area title>` text, not only the color GIF.** This is the whole trick — never OCR/vision the chart image; parse the titles.
- **Align rows by column x-coordinate, never by forecast age.** The Seeing row's age base is offset by one hour vs. the other rows (`12Z+3hr` vs `12Z+4hr`); age-keying silently misaligns Seeing (and potentially others) by a column.
- **Hourly title format is `H:MM: VALUE (12Z+Nhr)` — there are TWO colons.** When capturing the value, skip past the `H:MM:` time prefix or you'll capture `00: Clear` instead of `Clear`.
- **The server digit before the quantity code varies.** In `p=...` the code is preceded by a server id that is `1` for some charts and `3` for others (`…1C004…` vs `…3C004…`). Match `\d{8}\d([A-Z])\d{5}`, do not hardcode `1`.
- **The Darkness/Moon row has no `f.php` href and its y-coordinate differs between charts.** Identify it purely by the `Limiting Mag:…, SunAlt:…, MoonAlt …, MoonIllum …%` title pattern, and x-align it to the hourly columns. It is at 10-minute resolution while the weather rows are hourly.
- **Times are LOCAL to the observing site**, derived from the `tz=-X.X` token; the model run is **12:00 UTC** on the date in the `f.php?p=` param. Don't assume the first cell is `12:00` local — for a UTC−7 site the first cell is `09:00`.
- **Wind/Temperature units depend on the chart's `units` setting** (imperial vs metric → mph/°F vs km/hr/°C). The page declares it in a `units = "…"` JS var; read the actual title text rather than assuming a unit.
- **The Smoke row often has fewer cells** (shorter forecast horizon) than the other rows — expect gaps; treat missing smoke as "No Smoke / unknown".
- **No free machine-readable live feed.** The site sells CSV archives, but those are **historical only** (the homepage samples run 2016–2020) and behind a fee. There is no public live JSON/CSV API — the chart page's image-map text is the live data source.
- **No anti-bot, no auth, no proxy.** Direct `fetch`/`curl` of both `find_chart.py` and `/c/<KEY>key.html` return 200. The pages carry `NOARCHIVE`/`no-cache` meta and Google Analytics, but content is fully open. The pre-run probe showed no anti-bot, and the successful run used a bare (non-verified, non-proxied) session.
- **Darkness scale reference:** SunAlt < −18° = astronomical night (darkest); −12° to −18° = nautical twilight; Limiting Mag higher = darker sky (≈6+ excellent, negative = daylight); MoonAlt > 0 = moon above horizon washing out faint objects; MoonIllum is the lunar phase (% illuminated).
- **Forecast horizon ≈ 81 hours** (~3.4 days) → reliably covers "tonight + the next couple of nights." Forecast skill degrades with age; trust the first night most.

## Expected Output

```json
{
  "success": true,
  "location": "Spencer's Observatory",
  "chart_key": "SpcrObAZ",
  "tz": "UTC-7",
  "model_run_utc": "2026-06-17T12:00:00Z",
  "last_updated_local": "2026-06-17 09:58:54",
  "nights": [
    {
      "night": "2026-06-17",
      "best_slots": ["22:00-04:00"],
      "conditions": {"cloud": "Clear", "transparency": "Transparent", "seeing": "Average 3/5", "limiting_mag": 5.9},
      "moon_illum_pct": 16,
      "moon_up_during_dark": true,
      "warnings": ["High humidity 80-90% — dew risk on optics"]
    },
    {
      "night": "2026-06-18",
      "best_slots": ["21:00-04:00"],
      "conditions": {"cloud": "Clear", "transparency": "Transparent", "seeing": "Average 3/5 (Good 4/5 by 04:00)"},
      "moon_illum_pct": 25,
      "moon_up_during_dark": true,
      "warnings": ["Seeing dips to Poor 2/5 01:00-03:00"]
    },
    {
      "night": "2026-06-19",
      "best_slots": ["21:00-04:00"],
      "conditions": {"cloud": "Clear", "transparency": "Transparent", "seeing": "Good 4/5", "limiting_mag": 5.5},
      "moon_illum_pct": 35,
      "moon_up_during_dark": true,
      "warnings": []
    }
  ],
  "best_overall_night": "2026-06-19",
  "error_reasoning": null
}
```

Outcome shapes:

- **Good viewing** — one or more `best_slots` per night (local-time ranges), as above.
- **No good window (clouds/poor conditions during dark hours)** — chart parsed fine, but a night has clear conditions failing the dark-hour test:
  ```json
  {"success": true, "location": "Cherry Springs State Park", "chart_key": "ChrSprPkPA",
   "nights": [{"night": "2026-06-17", "best_slots": [], "moon_illum_pct": 15,
   "warnings": ["Overcast / poor transparency most of the night", "High humidity — dew risk"]}],
   "error_reasoning": null}
  ```
- **No chart found for the location:**
  ```json
  {"success": false, "location": "<input>", "chart_key": null,
   "error_reasoning": "No Clear Sky Chart matched; try find_chart.py llmap by lat/long for the nearest site."}
  ```
