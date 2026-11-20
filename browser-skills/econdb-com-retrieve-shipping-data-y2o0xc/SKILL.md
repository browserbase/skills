---
name: econdb-com-retrieve-shipping-data-y2o0xc
title: EconDB Global Shipping Time Series
description: >-
  Retrieve EconDB's global maritime/container-shipping time series (global trade
  in TEU, Shanghai freight index, port throughput, operator revenue, congestion)
  directly from the site's public /widgets/<name>/data/ JSON endpoints — no
  browser, auth, or proxy required.
website: econdb.com
category: economic-data
tags:
  - shipping
  - maritime
  - time-series
  - trade
  - econdb
  - logistics
  - api
source: 'browserbase: agent-runtime 2026-08-14'
updated: '2026-08-14'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      The human-facing /maritime/ HTML pages sit behind a Cloudflare JS
      challenge (needs a --proxies --verified Browserbase session) and enforce a
      ~10 free page-views/day preview limit. Only use the browser to discover
      new widget names/params by reading window.performance resource entries;
      the JSON endpoints those pages call are directly fetchable and are the
      real data source.
verified: false
proxies: false
---
# EconDB Global Shipping Time Series

## Purpose

Retrieve EconDB's global maritime / container-shipping time series — global trade volumes (TEU by month and region), the Shanghai Containerized Freight Index, port throughput, revenue by shipping operator, port congestion, weekly schedule reliability, and more. Every chart on EconDB's `/maritime/` dashboards is backed by a public, unauthenticated JSON endpoint of the form `https://www.econdb.com/widgets/<name>/data/`. This skill reads those endpoints directly and returns clean `{Date, value, ...}` records. **Read-only** — it only fetches published series; it never logs in, subscribes, or mutates anything.

## When to Use

- Building a dashboard or model that needs monthly global container-trade volumes, freight-rate indices, or port throughput.
- Periodic (daily/weekly) polling of shipping indicators such as the Shanghai Containerized Freight Index.
- Comparing container liftings / revenue across carriers (Maersk, MSC, CMA CGM, Cosco, Hapag-Lloyd, …).
- Anywhere you would otherwise scrape EconDB's maritime charts — the JSON API is faster, cleaner, and not behind the Cloudflare wall or the free page-view limit that the HTML pages are.

## Workflow

**Optimal path — hit the widget JSON API directly (no browser, no auth, no proxy).** EconDB's `/maritime/` HTML pages are just thin React shells that fetch their chart data from `https://www.econdb.com/widgets/<name>/data/`. Those `/widgets/.../data/` endpoints returned `200` with full JSON in testing both **with and without** a residential proxy and **without** any cookie, token, or Cloudflare clearance — even though the parent HTML page itself is behind a Cloudflare JS challenge. So skip the browser entirely for data retrieval; only fall back to a stealth browser session if you need to *discover* a new widget's name or parameters (see Browser fallback).

1. **Pick the series (widget) you need.** Each maritime chart maps to one widget name. Verified global-shipping widgets:

   | Widget name | Series returned | Useful params |
   |---|---|---|
   | `global-trade` | Global exports/imports in TEU by month, broken out by world region (Total, East Asia, Europe, North America, …) | `type=export\|import`, `net=0\|1`, `transform=0`, `freq=month` |
   | `global-seasonal` | Global TEU liftings, one series per calendar year (seasonal overlay) | *(none)* |
   | `shanghai-containerized-index` | Shanghai Containerized Freight Index — prompt-month future, underlying, forward curve | *(none)* |
   | `top-port-comparison` | Throughput (thousand TEU) for top global ports, current month vs. same month prior year (bar) | *(none)* |
   | `port-time-series` | Port throughput/count broken down by vessel TEU class or by operator | `unit=throughput\|count`, `by=teu_class\|operator`, `type=arrivals\|departures`, `country=<ISO2>`, `freq=month` |
   | `revenue-by-operator` | Revenue (or other metric) per carrier, monthly | `metric=revenue` |
   | `containers-in-terminal` | Containers dwelling in terminal, by region | `region=<name>` (e.g. `East Asia`) |
   | `omissions-time-series` | Skipped/omitted port calls, by region | `region=<name>` |
   | `weekly-schedule-profile` | Weekly schedule reliability profile | `region=<name>`, `metric=TEU`, `size=ALL` |

2. **(Optional) Discover valid parameter values.** Most widgets expose a sibling `options/` endpoint that lists every accepted param and its allowed values:
   ```
   GET https://www.econdb.com/widgets/<name>/options/
   → {"params":[{"name":"Type","param":"type","options":[{"value":"arrivals","name":"Arrivals","default":true}, …]}, …]}
   ```
   e.g. `port-time-series/options/` enumerates `type`, `unit`, and a full `country` ISO-2 list. Read `default:true` to know what the UI requests by default.

3. **Fetch the data.**
   ```
   GET https://www.econdb.com/widgets/<name>/data/?<params>
   Accept: application/json
   ```
   Example:
   ```
   GET https://www.econdb.com/widgets/global-trade/data/?type=export&net=0&transform=0&freq=month
   ```
   Any plain HTTPS client works. In this toolchain the reliable, browser-free call is:
   ```bash
   browse cloud fetch "https://www.econdb.com/widgets/global-trade/data/?type=export&net=0&transform=0&freq=month"
   ```
   (No `--proxies` needed for the widget endpoints. `browse cloud fetch` wraps the response in an envelope — parse `.content` as JSON.)

4. **Parse the uniform response shape.** Every widget returns:
   ```json
   { "plots": [ { "type": "timeseries", "title": "...", "series": [ {"code":"Total","name":"Total"}, ... ], "data": [ {"Date":"YYYY-MM-01", "<series code>": <number|null>, ...}, ... ] } ] }
   ```
   - Iterate `plots[]` (usually one plot; some pages return several).
   - `plots[i].series[]` is the column dictionary — each `code` is a key that appears in every `data` row; `name` is its human label; `display` (`"stacked"`/`"bar"`) is a chart hint you can ignore for data extraction.
   - `plots[i].data[]` is the actual time series: each row has a `Date` (`"YYYY-MM-01"`, first-of-month for monthly data) plus one numeric field per series `code`. Missing observations are `null`.
   - **Non-time-series plots** (e.g. `top-port-comparison`) set `"type":"series"` and key rows on `"name"` (the port) instead of `"Date"`, often with `"transpose":true`. Detect via `plots[i].type` / presence of a `Date` field before assuming a temporal axis.

5. **Emit** the flattened records (see Expected Output).

### Browser fallback (only for discovering new widgets/params)

The `/maritime/` HTML pages are behind Cloudflare and are **not** needed to read data — use this path only to find a widget name or param set you don't already know.

```bash
sid=$(browse cloud sessions create --keep-alive --proxies --verified | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$sid"
browse open "https://www.econdb.com/maritime/summary/trade-aggregates/" --remote   # bare www.econdb.com/maritime/ redirects here
sleep 6   # let the Cloudflare managed challenge clear (proxies+verified session passes it automatically)
# harvest the widget endpoints the page called:
browse eval "JSON.stringify([...new Set(performance.getEntriesByType('resource').map(e=>e.name).filter(n=>/\/widgets\/[^/]+\/data/.test(n)).map(n=>n.replace('https://www.econdb.com','')))])" --remote
browse cloud sessions update "$sid" --status REQUEST_RELEASE
```

Then feed the discovered `/widgets/<name>/data/?...` URL back into the direct-fetch path (step 3) — do not scrape the rendered chart.

## Site-Specific Gotchas

- **The data API is NOT behind Cloudflare; the HTML pages are.** `browse cloud fetch` on `https://www.econdb.com/maritime/` returns a Cloudflare `403 "Just a moment…"` managed-challenge page, but `https://www.econdb.com/widgets/<name>/data/` returns `200` JSON directly — verified both with and without `--proxies`. Don't waste a stealth browser session on data retrieval; go straight to `/widgets/.../data/`.
- **`metadata.proxies`/`verified` are `false` on purpose.** The recommended fetch path needs neither. The `--proxies --verified` session in the Browser fallback is only for the optional discovery step (clearing Cloudflare to read `performance` entries).
- **Free page-view limit applies to the browser UI, not the API.** The rendered dashboard shows a "You viewed N of 10 free pages today … limited preview / Upgrade to Premium" banner, and `page_metadata/` reports `{"pages_seen":N,"pages_limit":10}`. This throttle is on the HTML pages only — the `/widgets/.../data/` JSON endpoints returned full data regardless of it during testing. Another reason to prefer the API.
- **Uniform envelope, but watch `plots[].type`.** Most widgets are `type:"timeseries"` keyed on `Date`. A few (`top-port-comparison`) are `type:"series"` keyed on `name` with `transpose:true` — check for a `Date` field before treating rows as temporal.
- **Series keys come from `series[].code`, not fixed names.** For `global-seasonal` the codes are integer years (`2022`, `2023`, …); for `global-trade` they're region strings; for `revenue-by-operator` they're carrier names. Always read the `series[]` list rather than hardcoding column names, and expect `null` for gaps.
- **Dates are first-of-month for monthly series** (`"2026-08-01"` = the August 2026 observation). Data can extend into the current/near-future month (nowcast); the latest row may be a partial/estimated value.
- **`options/` is the source of truth for params.** Rather than guessing, GET `/widgets/<name>/options/` — it returns every `param`, its allowed `options`, and which is `default:true`. Unrecognized query params are ignored; the widget falls back to its defaults.
- **Some maritime pages (`/maritime/ports/`, `/maritime/summary/vessels-fleet/`, `/maritime/operators/`) did not surface `/widgets/.../data/` calls** in `performance` entries within a few seconds — they render maps/tables via different mechanisms (map tiles, `static/appdata/*.json` like `operators-images.json`). If a page yields no widget URL, give it more load time or inspect its network tab; the `containers-in-terminal`, `omissions-time-series`, and `weekly-schedule-profile` widgets, for example, were found on `/maritime/congestion/`.
- **`www.` matters.** Use `https://www.econdb.com/...`; the apex `econdb.com` 301-redirects (per the pre-run probe).

## Expected Output

Flatten each plot into a list of records. Recommended shape:

```json
{
  "widget": "global-trade",
  "params": { "type": "export", "net": "0", "transform": "0", "freq": "month" },
  "title": "Global exports (TEU by month)",
  "series": ["Total", "Africa", "East Asia", "Europe", "Latin America", "Middle East", "North America", "Others", "South Asia", "Southeast Asia"],
  "frequency": "month",
  "records": [
    { "Date": "2022-02-01", "Total": 17382548.5, "Africa": 713935, "East Asia": 5090464, "Europe": 3863395.5, "Latin America": 919338, "Middle East": 937324, "North America": 1618465.5, "Others": 582820, "South Asia": 764996.5, "Southeast Asia": 2891810 },
    { "Date": "2026-08-01", "Total": 20846616, "Africa": 1199373, "East Asia": 6943980, "Europe": 3544413.5, "Latin America": 1355012.5, "Middle East": 562698.5, "North America": 1246681.5, "Others": 848795.5, "South Asia": 1274020.5, "Southeast Asia": 3871641 }
  ]
}
```

Freight-index example (`shanghai-containerized-index`):

```json
{
  "widget": "shanghai-containerized-index",
  "title": "Shanghai containerized freight index",
  "series": ["price", "SCSFI_EU", "Forward curve", "wkago"],
  "records": [ { "Date": "2024-01-05", "price": 2179.0, "SCSFI_EU": 2000.0, "Forward curve": null, "wkago": null } ]
}
```

Non-time-series example (`top-port-comparison`, `type:"series"` keyed on `name`):

```json
{
  "widget": "top-port-comparison",
  "title": "Throughput during July 26 (thousand TEU)",
  "series": ["July 26", "July 25"],
  "records": [ { "name": "Singapore", "July 26": 3494.0, "July 25": 3312.0 } ]
}
```

Failure/edge shapes:

```json
{ "widget": "global-trade", "success": false, "error": "non-200 from widget endpoint", "status": 403, "note": "If a widget endpoint ever 403s, retry via a --proxies --verified browser session and fetch from page context; the HTML shell is Cloudflare-gated even though data endpoints normally are not." }
```
