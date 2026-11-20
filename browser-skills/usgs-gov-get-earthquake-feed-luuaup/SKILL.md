---
name: usgs-gov-get-earthquake-feed-luuaup
title: USGS Earthquake Feed
description: >-
  Fetch recent earthquakes from the USGS Earthquake Hazards Program (summary
  feed, FDSN query, or single event ID) and return them as normalized structured
  JSON with magnitude, location, depth, intensity, alert level, tsunami flag,
  significance, status, and canonical event URL.
website: usgs.gov
category: geoscience
tags:
  - earthquakes
  - usgs
  - geojson
  - fdsn
  - seismic
  - geoscience
  - public-api
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      The earthquake.usgs.gov web UI (map, list, and per-event pages) is a thin
      client over the same GeoJSON the API returns. Browser scraping would
      re-derive the same fields at ~100x the cost and latency, and the JSON API
      has no auth, no anti-bot, and permissive CORS. Only fall back to browser
      when the API is unreachable for network-policy reasons on the calling
      side.
verified: false
proxies: false
---
# USGS Earthquake Feed

## Purpose

Fetch recent earthquakes from the USGS Earthquake Hazards Program and return them as normalized, structured JSON. Supports four input shapes — a canonical summary-feed URL, a `{magnitude, period}` bucket, an FDSN query (bounding box / radius / time range / magnitude / depth / event-type / alert / review-status), or a single USGS event ID — and emits one row per event with magnitude, place, origin time, lat/lon, depth, intensity, alert level, tsunami flag, significance, status, event type, and the canonical eventpage URL. Read-only.

## When to Use

- Building a real-time / near-real-time earthquake monitor over a region or magnitude threshold.
- Backfilling a historical catalog for a bounding box or epicenter radius.
- Looking up a single event's full detail by USGS event ID (`us7000abcd`, `nc73831706`, etc.).
- Replacing screen-scraping of `earthquake.usgs.gov/earthquakes/map/` — the underlying GeoJSON is the same data the map is rendered from, and it is faster, structurally typed, and free.
- Cross-checking another seismic source (EMSC, JMA, GEOFON) against the canonical USGS reading.

## Workflow

The USGS Earthquake Hazards Program publishes two stable, public, no-auth HTTP surfaces that return GeoJSON: the **Earthquake Catalog summary feeds** (CDN-cached, fixed pre-built buckets, updated ~1 min) and the **FDSN Event Service** (parameterized query, updated continuously). The web UI at `earthquake.usgs.gov/earthquakes/map/` and the per-event pages at `earthquake.usgs.gov/earthquakes/eventpage/{id}` are thin clients over these endpoints — **always hit the API directly**. No API key, no cookies, no `Referer`, no User-Agent gating beyond a "please identify your client" courtesy convention. CORS is permissive; no residential proxy needed.

Pick the correct endpoint for the input shape, fetch GeoJSON, then map `features[*].properties` + `features[*].geometry.coordinates` + `features[*].id` to the normalized row schema in **Expected Output**.

### 1. Direct summary-feed URL passthrough

If the caller hands you a URL that already matches `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/{magnitude}_{period}.geojson`, fetch it as-is. No transformation. Validate that `{magnitude} ∈ {significant, 4.5, 2.5, 1.0, all}` and `{period} ∈ {hour, day, week, month}` before sending — anything else is a 404.

### 2. `{magnitude, period}` bucket → summary feed

Build the URL by template:

```
https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/{magnitude}_{period}.geojson
```

Valid combinations are the **Cartesian product of the two enums**, so there are exactly 20 summary feeds. `significant_hour`, `4.5_day`, `2.5_week`, `1.0_month`, `all_hour`, etc. These are pre-built and CDN-cached; they are the fastest path when the bucket fits.

### 3. Bounding box / radius / arbitrary filter → FDSN Event Service

```
GET https://earthquake.usgs.gov/fdsnws/event/1/query
    ?format=geojson
    &starttime=2026-05-11T00:00:00Z
    &endtime=2026-05-18T00:00:00Z
    &minlatitude=32.0&maxlatitude=42.0
    &minlongitude=-125.0&maxlongitude=-114.0
    &minmagnitude=2.5
    &orderby=time
    &limit=2000
```

Bounding box uses the four `min/max{latitude,longitude}` params; antimeridian-crossing boxes are supported via `minlongitude < -180` or `maxlongitude > 180`. **Radius search** uses `latitude=<lat>&longitude=<lon>&maxradiuskm=<km>` (or `maxradius=<deg>`) with optional `minradiuskm` / `minradius`. Combine with any of the time / magnitude / depth / event-type / alert / review-status / pagination filters listed in **Supported FDSN parameters** below.

The FDSN service caps a single response at **20,000 features**; if the caller's filter could exceed that, set `limit` and paginate with `offset` (1-based, default 1). Use `orderby=time-asc` for forward pagination so newly-arrived events don't shift the offset.

### 4. Single event ID → detail GeoJSON

```
GET https://earthquake.usgs.gov/fdsnws/event/1/query?eventid={id}&format=geojson
```

Returns a **single Feature** (not a FeatureCollection — the `type` is `"Feature"` and there is no `features[]` array). The shape is otherwise identical to a summary-feed feature, **plus** a `properties.products` object containing every contributed scientific product (origin, phase-data, shakemap, dyfi, losspager, focal-mechanism, moment-tensor, finite-fault, …). For the row schema in **Expected Output**, you only need the top-level `properties` + `geometry` + `id`; the `products` block is optional enrichment.

`eventid` is what USGS calls the event's *authoritative* id (e.g. `us7000abcd`, `nc73831706`, `ci40624479`). Non-authoritative aliases are listed in `properties.ids` (a comma-padded string like `,us7000abcd,at00rxxxxx,`) — any of them will resolve via the same endpoint.

### 5. Map GeoJSON → row schema

For each `feature` (or the single feature in step 4), build a row:

```
event_id       = feature.id
magnitude      = feature.properties.mag                            # number, may be null
mag_type       = feature.properties.magType                        # "Mw" | "Md" | "Ml" | "Mb" | "mww" | "mb" | ...
place          = feature.properties.place                          # "5km W of Volcano, Hawaii"
origin_time    = new Date(feature.properties.time).toISOString()   # epoch ms → ISO 8601 UTC
updated_time   = new Date(feature.properties.updated).toISOString()
latitude       = feature.geometry.coordinates[1]
longitude      = feature.geometry.coordinates[0]
depth_km       = feature.geometry.coordinates[2]                   # km positive down; may be < 0 for shallow
felt_count     = feature.properties.felt                           # DYFI report count, integer | null
cdi            = feature.properties.cdi                            # Community Decimal Intensity 0-10 | null
mmi            = feature.properties.mmi                            # Modified Mercalli Instrumental 0-10 | null
alert_level    = feature.properties.alert                          # "green" | "yellow" | "orange" | "red" | null
tsunami_flag   = feature.properties.tsunami === 1                  # 0 / 1 → boolean
significance   = feature.properties.sig                            # integer 0..1000
status         = feature.properties.status                         # "automatic" | "reviewed"
event_type     = feature.properties.type                           # "earthquake" | "quarry blast" | "explosion" | "ice quake" | "rock burst" | "sonic boom" | "nuclear explosion" | "mine collapse" | "other event"
event_url      = feature.properties.url                            # canonical eventpage URL on earthquake.usgs.gov
```

Coordinate order is **`[lon, lat, depth_km]`** — GeoJSON spec. Swapping lat/lon is the most common bug. Depth is **km positive down**; very shallow events can report negative values (event above the WGS84 reference surface — usually a calibration artifact, occasionally a real shallow explosion).

### Supported FDSN parameters

Pass-through these to `/fdsnws/event/1/query` — document every one in the skill's parameter surface so callers don't reinvent them:

| Param | Type | Notes |
|---|---|---|
| `format` | enum | `geojson` (use this), `xml` (QuakeML), `csv`, `text`, `kml`, `quakeml`. Default `xml`. **Always send `format=geojson`** — it's the only format the row mapper above is calibrated for. |
| `starttime` | ISO 8601 | UTC. Default = current time − 30 days. |
| `endtime` | ISO 8601 | UTC. Default = present. |
| `updatedafter` | ISO 8601 | Filter to events whose record was updated after this instant (good for incremental polls). |
| `minlatitude`, `maxlatitude` | float (-90..90) | Bounding box. |
| `minlongitude`, `maxlongitude` | float (-360..360) | Bounding box. Antimeridian: allowed to exceed ±180 on one side. |
| `latitude`, `longitude` | float | Center for radius search. Required together. |
| `maxradius` | float (degrees, 0..180) | Radius search, degrees. |
| `maxradiuskm` | float (km, 0..20001.6) | Radius search, kilometers. **Use this unless you have a reason for degrees.** |
| `minradius` / `minradiuskm` | float | Inner radius (annulus search). |
| `mindepth`, `maxdepth` | float (km) | Depth range, km positive down. Allowed range ≈ -100..1000. |
| `minmagnitude`, `maxmagnitude` | float | Inclusive bounds. |
| `magnitudetype` | string | Filter to a specific mag type (`Mw`, `mww`, `Mb`, `Ml`, `Md`, …). Default = any. |
| `eventtype` | string | `earthquake`, `quarry blast`, `explosion`, `ice quake`, `mining explosion`, `nuclear explosion`, `rock burst`, `sonic boom`, `mine collapse`, `other event`. Default = any. |
| `reviewstatus` | enum | `automatic` or `reviewed`. Omit for both. |
| `alertlevel` | enum | `green`, `yellow`, `orange`, `red`. |
| `mincdi` | float | Filter by Community Internet Intensity (DYFI). |
| `minmmi` | float | Filter by instrumental Modified Mercalli. |
| `minfelt` | int | Filter by DYFI report count. |
| `minsig`, `maxsig` | int (0..1000) | PAGER/origin significance score. |
| `producttype` | string | Filter to events that have a specific product attached (e.g. `shakemap`, `dyfi`, `losspager`, `moment-tensor`, `focal-mechanism`, `finite-fault`, `phase-data`). |
| `contributor` | string | Network code of the contributing seismic network (`us`, `ak`, `ci`, `nc`, `nn`, `hv`, `pr`, `uu`, `uw`, …). |
| `catalog` | string | Catalog name (`us`, `ak`, `ci`, …). Subtly different from `contributor` — see gotcha below. |
| `eventid` | string | Single-event lookup (mutually exclusive with the filter surface). |
| `includeallorigins` | bool | Include all contributed origin solutions in `products` (detail mode). |
| `includeallmagnitudes` | bool | Same for magnitudes. |
| `includesuperseded` | bool | Include superseded products in detail responses. |
| `includedeleted` | bool | Include deleted events (false by default; rarely useful). |
| `orderby` | enum | `time` (default, newest first), `time-asc`, `magnitude` (largest first), `magnitude-asc`. |
| `limit` | int (1..20000) | Page size. |
| `offset` | int (≥ 1, **1-based**) | Page offset. Default 1. |
| `jsonerror` | bool | When `true`, return error responses as JSON instead of the default HTML/text. **Always send `jsonerror=true`** so error parsing is deterministic. |

The full canonical reference is at `https://earthquake.usgs.gov/fdsnws/event/1/` (with an interactive form at `…/event/1/`) and the FDSN-WS spec at `https://www.fdsn.org/webservices/`.

## Site-Specific Gotchas

- **GeoJSON coordinate order is `[lon, lat, depth_km]`** — not `[lat, lon]`. Most common bug; latitude is `coordinates[1]`. Depth is `coordinates[2]`, **km positive down**; the very rare negative depth is "above the WGS84 reference" (calibration artifact or shallow explosion), not malformed data — pass it through.
- **`properties.time` and `properties.updated` are epoch milliseconds**, not seconds and not ISO strings. `new Date(p.time)` works directly in JS; in Python use `datetime.fromtimestamp(p.time/1000, tz=timezone.utc)`. Treating it as seconds yields years like 1970.
- **`properties.mag` and `properties.magType` can be `null`** — most commonly on `quarry blast` / `mining explosion` / `nuclear explosion` event types and on extremely new automatic locations where a magnitude solution hasn't been computed yet. Don't assume non-null; emit `null` downstream.
- **`mag` is a single contributor's preferred magnitude** — the FDSN service returns one origin's mag in the summary, but USGS may publish multiple magnitude solutions per event (Mw, Mww, Mb, mb, Ml, Md). For a single event, `&eventid=...&includeallmagnitudes=true` returns the full set under `properties.products["origin"][*].properties` and `properties.products["moment-tensor"][*]`. The summary feeds and bulk FDSN queries only carry the preferred one.
- **`status: "automatic"` events get revised.** Anything in the first 5-15 minutes after origin is `status=automatic` and **the magnitude, depth, and even the location can shift by tens of km / 0.5+ mag units** when a human analyst reviews it (typically minutes to hours later, sometimes a day or two for small events). If you care about ground truth, only emit `status=reviewed` rows, or re-poll with `&updatedafter=<lastSeen>` and re-emit changed events.
- **`type` is not always `earthquake`.** The FDSN catalog also publishes quarry blasts, mine collapses, sonic booms, ice quakes, rock bursts, and nuclear/chemical explosions. The `all_*` summary feeds and unfiltered FDSN queries include them. **If the caller wants only natural earthquakes, send `eventtype=earthquake`** — filtering client-side works too but wastes bandwidth.
- **`significance score (`sig`)** is USGS's PAGER + felt + magnitude heuristic, integer 0..1000. The `significant_*` summary feeds correspond to `sig ≥ 600`. Don't conflate with magnitude.
- **`alert` (PAGER alert level) is rare.** It's only populated for events large enough to trigger a PAGER loss estimate (roughly M5.5+ globally, lower in populated areas). Most events have `alert: null`. The four valid non-null values are `green`, `yellow`, `orange`, `red` (lowercase strings).
- **`tsunami: 1` is a flag, not a forecast.** USGS sets it when the event meets the regional tsunami-warning-center notification criteria (typically M ≥ 7.0 + shallow + offshore). It does **not** mean a tsunami occurred or was forecast. Authoritative tsunami information comes from NOAA/PTWC/NTWC, not this field. Surface the boolean honestly.
- **`felt` (DYFI report count) lags origin by minutes to hours.** Brand-new events almost always show `felt: null` even when they're widely felt; the field populates as users submit "Did You Feel It?" reports. Re-poll the event 1 hr later if `felt_count` matters.
- **`cdi` vs `mmi`** — `cdi` is the *Community Decimal Intensity* derived from DYFI reports (crowdsourced, lags origin); `mmi` is the *Modified Mercalli Intensity* derived from ShakeMap instrumental + interpolation (lags ~15-60 min after origin, only computed for events that trigger ShakeMap, roughly M ≥ 3.5 in CA / M ≥ 4.5 globally). Either or both may be `null`; they are not interchangeable.
- **`net` + `code` is a stable composite id**, separate from the authoritative `id`. `id = net + code` in the common case (`us` + `7000abcd` = `us7000abcd`), but events that are reassigned to a different authoritative network keep their old `id` and the new network's code in `properties.ids` (a comma-padded string). The `eventid` query param accepts any id in `properties.ids`.
- **`catalog` vs `contributor` distinction**: `contributor` is the seismic network that *submitted* an origin solution; `catalog` is the network whose origin USGS chose as authoritative. They are usually equal but can differ — e.g. an event in Northern California where `nc` (Northern California Seismic System) is authoritative may also be contributed by `us` (USGS National Earthquake Information Center). Filtering by `contributor=us` will miss events authoritatively assigned to a regional network. **Prefer `catalog=` for "events authoritatively from this network" and omit both for "all events in the region regardless of who reports them."**
- **`-360 ≤ longitude ≤ 360` for antimeridian-crossing bounding boxes.** A box covering Fiji / New Zealand / the Aleutians needs e.g. `minlongitude=170&maxlongitude=200` (or `-190 to -160`); the service handles the wrap.
- **20,000-feature hard cap per FDSN response.** Anything past that returns an error. Paginate with `limit` + `offset`, and use `orderby=time-asc` (oldest first) for forward incremental polls so newly-arrived events append at the tail rather than shifting all offsets.
- **Summary feeds are CDN-cached ~60s.** A query that just ran one second ago and a query that runs now may return the same response from the CDN. For ≤ 1-minute latency, hit the FDSN service directly with `starttime=<now − N minutes>`.
- **FDSN `time` query precision is seconds (UTC).** Sub-second `starttime` values are silently truncated. Don't rely on millisecond windowing.
- **`includesuperseded=true` returns *every revision* of every origin/magnitude product**, including ones that were later retracted. Don't enable it unless you specifically want revision history; for current-state queries it inflates the response 3-10×.
- **`jsonerror=true` is opt-in.** Without it, an invalid parameter returns an HTTP 400 with a plain-text or HTML body that's painful to parse programmatically. Always send `jsonerror=true`.
- **No auth, no API key, no rate limit headers** — but be polite: send a meaningful `User-Agent` (e.g. `your-org/1.0 (contact@example.com)`), and don't burst > 5-10 req/s sustained against the FDSN service. The Earthquake Catalog summary feeds are CDN-fronted and tolerate much higher rates because they're static-by-URL.
- **No CORS preflight issues.** `Access-Control-Allow-Origin: *` on both endpoints; safe to call from a browser-side fetch with no proxy.
- **`detail` URL on summary-feed features points to the per-event GeoJSON** (`…/fdsnws/event/1/query?eventid=<id>&format=geojson`), not to the human-facing event page. The human-facing URL is `properties.url` (`…/earthquakes/eventpage/<id>`). Don't conflate.
- **Event URLs are stable.** `https://earthquake.usgs.gov/earthquakes/eventpage/<id>` will redirect to the current authoritative id if `<id>` is a superseded alias.

## Expected Output

Two distinct response shapes — collection (summary feed or FDSN query) and single event.

### Collection response

```json
{
  "source": "summary_feed",
  "feed_id": "significant_week",
  "feed_url": "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson",
  "fetched_at": "2026-05-18T14:32:11.812Z",
  "generated_at": "2026-05-18T14:31:00.000Z",
  "count": 7,
  "events": [
    {
      "event_id": "us7000abcd",
      "magnitude": 5.2,
      "mag_type": "mww",
      "place": "5km W of Volcano, Hawaii",
      "origin_time": "2026-05-18T11:14:32.430Z",
      "updated_time": "2026-05-18T11:48:01.120Z",
      "latitude": 19.4106,
      "longitude": -155.2741,
      "depth_km": 4.8,
      "felt_count": 312,
      "cdi": 5.1,
      "mmi": 4.6,
      "alert_level": "green",
      "tsunami_flag": false,
      "significance": 612,
      "status": "reviewed",
      "event_type": "earthquake",
      "event_url": "https://earthquake.usgs.gov/earthquakes/eventpage/us7000abcd"
    }
  ]
}
```

For an FDSN query response, `source` is `"fdsn_query"`, `feed_id` is omitted, and the query string is echoed as `query_url`. Add `next_offset` when the response equals `limit` (signals possible pagination).

### Single-event response

```json
{
  "source": "fdsn_event_detail",
  "event_id": "us7000abcd",
  "fetched_at": "2026-05-18T14:32:11.812Z",
  "event": {
    "event_id": "us7000abcd",
    "magnitude": 5.2,
    "mag_type": "mww",
    "place": "5km W of Volcano, Hawaii",
    "origin_time": "2026-05-18T11:14:32.430Z",
    "updated_time": "2026-05-18T11:48:01.120Z",
    "latitude": 19.4106,
    "longitude": -155.2741,
    "depth_km": 4.8,
    "felt_count": 312,
    "cdi": 5.1,
    "mmi": 4.6,
    "alert_level": "green",
    "tsunami_flag": false,
    "significance": 612,
    "status": "reviewed",
    "event_type": "earthquake",
    "event_url": "https://earthquake.usgs.gov/earthquakes/eventpage/us7000abcd",
    "ids": ["us7000abcd", "at00rxxxxx", "hv73450123"],
    "contributor": "us",
    "catalog": "us",
    "products_available": ["origin", "phase-data", "shakemap", "dyfi", "losspager", "moment-tensor", "focal-mechanism"]
  }
}
```

### Error / empty / not-found shapes

```json
// FDSN query with valid params but zero matching events — NOT an error
{ "source": "fdsn_query", "count": 0, "events": [], "query_url": "..." }

// Single-event lookup, id does not exist
{ "source": "fdsn_event_detail", "event_id": "us0000bogus", "error": "event_not_found" }

// Caller-supplied bad combination (e.g. invalid magnitude bucket, mutually exclusive params)
{ "error": "invalid_parameters", "detail": "magnitude must be one of [significant, 4.5, 2.5, 1.0, all]" }

// FDSN service returned a hard error (with jsonerror=true)
{ "error": "fdsn_error", "http_status": 400, "detail": "<usgs error text>" }
```
