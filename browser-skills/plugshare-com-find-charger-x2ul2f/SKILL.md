---
name: plugshare-com-find-charger-x2ul2f
title: PlugShare Find EV Charger
description: >-
  Search PlugShare for EV charging stations near a location, route, or
  coordinate and return matching chargers as structured JSON — including
  per-plug connector/kW/status, network, PlugScore, recent check-ins, photos,
  and pricing. Read-only.
website: plugshare.com
category: ev-charging
tags:
  - ev
  - charging
  - plugshare
  - maps
  - read-only
  - cognito
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: hybrid
alternative_methods:
  - method: browser
    rationale: >-
      Drive the AngularJS SPA's filter panel + map directly. Required when
      filter-name → API-param mapping isn't reverse-engineered yet, or when the
      token-replay path 401s mid-paging.
  - method: api
    rationale: >-
      Replay JSON requests to
      api.plugshare.com/v3/locations/{region,nearby,search,polyline,<id>} with
      the Cognito bearer captured from the SPA's localStorage. Cheap,
      structured, and pagination-friendly — but requires a real session to mint
      the bearer (no public-key shortcut).
  - method: url-param
    rationale: >-
      For single-station lookups where only name, description, image, PlugScore,
      and review count are needed, GET /location/{id} returns server-rendered
      JSON-LD + og:* meta tags without auth. Verified 200 OK on id=9176. Cannot
      supply lat/lon, plugs, network, or check-ins.
verified: true
proxies: true
---
# PlugShare Find Charger

## Purpose

Given a location query — direct PlugShare URL, free-form address/place name, lat+lon (+ optional radius), a station ID, or an origin+destination route — return matching EV charging stations as structured JSON. For each station: ID, name, lat/lon, address, network, owner/operator, per-plug list (connector type, kW, count, last-reported status), pricing summary, access policy, hours, amenities, photo URLs, recent-check-in count + most-recent timestamp, PlugScore (community rating 1–10), review count, canonical PlugShare URL, and a sampled snippet of the most recent comments/problem reports. Also captures the region-wide total visible in the map cluster summary so the caller knows when results were clipped. **Read-only — never check in, comment, edit a station, or claim a check-in.**

## When to Use

- "Find the nearest fast chargers to 1600 Amphitheatre Pkwy with at least 150 kW."
- "Tesla Superchargers within 5 mi of these coordinates, only stations with restrooms."
- "PlugScore-≥9 chargers on the route SF → LA with detour ≤ 10 mi."
- One-shot single-station detail lookup from a `/location/{id}` URL.
- Bulk extraction of stations in a viewport (e.g. for a regional charger map).
- Anywhere you'd otherwise scrape PlugShare manually.

## Workflow

PlugShare's web app at `www.plugshare.com` is an **AngularJS** SPA (not React — verified via `ng-app="plugshare"` on `<html>`) backed by a JSON API at `https://api.plugshare.com/v3`. The API is gated by an `Authorization: Bearer <jwt>` header — **not** `x-api-key`-style. The bearer is an AWS Cognito access token (User Pool `us-east-1_oweQ7XmGf`, Web Client ID `2u0qi3r0ekc3hnsl2rsg311ci`, OAuth domain `auth.plugshare.com`) acquired by the SPA on page load. All `api.plugshare.com/v3/*` paths return `401 Unauthorized: Unknown consumer` to anonymous callers — verified against `locations/region`, `locations/nearby`, `locations/search`, and `locations/{id}`.

**Recommended method: hybrid.** Drive a Verified + residential-proxy Browserbase session to load `https://www.plugshare.com/` once, capture the Cognito bearer the SPA's interceptor attaches to outbound XHRs, then either (a) replay JSON requests against `api.plugshare.com/v3/*` with that bearer for cheap, structured paging, or (b) continue driving the map UI for filters whose URL/API mapping you haven't reversed yet. For the special case of a single-station read where only the marketing fields (`name`, `description`, `aggregateRating`, `reviewCount`, photo URL, `publicAccess`) are needed, the server-rendered JSON-LD on `/location/{id}` works without a session — see the alternative path at the bottom.

### 1. Open a Verified + residential-proxy session

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies | node -e \
  "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>console.log(JSON.parse(s).id))")
export BROWSE_SESSION="$SID"
```

`--verified` (Verified) and `--proxies` (residential) are both mandatory. PlugShare is moderately anti-bot — Cloudflare is in front of `www.plugshare.com` (the response sets `cf-` headers + the Cloudflare insights beacon) and a bare datacenter IP routinely earns a `__cf_bm` challenge before the SPA bundle finishes loading.

### 2. Warm the bundle and capture the Cognito bearer

```bash
browse open "https://www.plugshare.com/" --remote
browse wait load --remote
browse wait timeout 5000 --remote     # let the SPA hit auth.plugshare.com/oauth2/token
```

The Cognito handshake fires on `bootstrap` and the bearer is stored in `window.localStorage` under a key matching `CognitoIdentityServiceProvider.<clientId>.<sub>.accessToken`. Read it back with:

```bash
TOKEN=$(browse eval --remote --expression '
  const pool = "2u0qi3r0ekc3hnsl2rsg311ci";
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith("CognitoIdentityServiceProvider." + pool) && k.endsWith(".accessToken")) {
      return localStorage.getItem(k);
    }
  }
  return null;
' | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>console.log(JSON.parse(s).result||''))")
```

If `TOKEN` is empty, the SPA exposes an unauthenticated guest path on the same bearer — perform any innocuous map interaction (`browse open "https://www.plugshare.com/?latitude=37.7749&longitude=-122.4194&spanLat=0.05&spanLng=0.05"`) and re-read the storage. Once the token is in hand, the JSON-replay path is open.

### 3. Resolve the location query → lat/lon + span

PlugShare's UI exposes five input shapes; map them to the API as follows:

| Input | Resolution |
|---|---|
| Direct `/location/{id}` URL | Use `id` directly with `GET /v3/locations/{id}` |
| Direct map URL with `latLng=lat,lng` (or `?latitude=&longitude=&spanLat=&spanLng=`) | Parse params; feed to `/v3/locations/region` |
| Free-form address / place name | Geocode (Google Maps Geocoding API, or PlugShare's own `?term=` SPA route — open `https://www.plugshare.com/?term=<urlenc>` and read `window.location.search` for the resolved `latitude/longitude/spanLat/spanLng`) |
| lat + lon + optional radius (mi or km) | Convert radius → `spanLat`/`spanLng`. Rough rule: `span° ≈ radius_mi / 35` (1° lat ≈ 69 mi, halve for half-span); for longitude scale by `cos(lat)`. |
| Route (origin → destination, max-detour) | Use `/v3/locations/polyline` — see step 5 |
| Single station ID | `/v3/locations/{id}` |

### 4. Fetch matching stations

For map-viewport / area / nearby queries:

```http
GET https://api.plugshare.com/v3/locations/region
    ?latitude={lat}&longitude={lng}
    &spanLat={dLat}&spanLng={dLng}
    &count={N}                 # max stations to return
    &access=1,3                # 1=public, 2=restricted, 3=private (see Gotchas)
    &minimum_power={kW}        # min kW (DC fast filter)
    &networks={id1},{id2}      # multi-select Networks
    &connectors={id1},{id2}    # multi-select Connectors
    &amenities={id1},{id2}     # multi-select Amenities
    &min_stations={N}          # minimum plug count
    &plugscore_min={1..10}     # community rating filter
    &include_pending=false
    &include_other=false
    &include_residential=false
    &latest_checkins={days}    # restrict to stations with check-ins in last N days
Authorization: Bearer {TOKEN}
Referer: https://www.plugshare.com/
Origin:  https://www.plugshare.com
```

For a known coordinate without a span (nearest-N): `GET /v3/locations/nearby?latitude=&longitude=&count=`.

For text/place-name search through the in-app autocomplete: `GET /v3/locations/search?q=<urlenc>` (returns places + stations, mixed).

For a single station: `GET /v3/locations/{id}` — returns the full plug list, photos, reviews stub, recent check-ins, score.

Filter parameter names map back to the AngularJS state keys observed in the bundle (`filters_select_kw_min`, `filters_select_kw_max`, `filters_select_plugscore`, `filters_select_stationcount`, `filters_select_amenities_{camping,dining,grocery,hiking,lodging,park,restroom,shopping,valet,wifi}`, `filters_select_parking_{accessible,pullin,pullthrough,trailer}`, `filters_select_payment`, `filters_select_home`, `filters_select_pwps`, `filters_select_restricted`, `filters_select_dealerships`, `filters_select_available`, `filters_select_comingsoon`, `filters_vehicle`, `filters_country`, `filters_network`). The API accepts the trailing slug as the query key (e.g. `kw_min`, `plugscore`, `payment=free`). If a name is rejected silently, drive the UI panel instead — see step 7.

### 5. Trip-planner / route queries

PlugShare's trip-planner endpoint is `/v3/locations/polyline`. POST or GET (driver-dependent) with the encoded polyline + detour budget:

```http
POST https://api.plugshare.com/v3/locations/polyline
Authorization: Bearer {TOKEN}
Content-Type: application/json

{
  "polyline": "<Google encoded polyline of the route>",
  "polyline_radius": <max detour miles>,
  "count": <N>,
  ...filter params from step 4...
}
```

Encode the polyline yourself from origin/destination coords (Google's polyline algorithm, level-5 precision is standard). `polyline_radius` is in miles. There is no public `/trip` web route — `https://www.plugshare.com/trip` returns `404`; the trip planner lives inside the SPA as a left-panel mode toggled from `/`.

### 6. Decode each station

The API returns one JSON object per location with these key fields (verified against the bundle's data-binding names + JSON-LD scaffolding):

- `id` — integer station ID.
- `name` — station name (e.g. "Riverside Court Hall of Justice Parking").
- `latitude`, `longitude` — coords.
- `address` — single string, US-style.
- `network` — string or null (e.g. "Electrify America", "Tesla Supercharger", "EVgo"). null = non-network / generic.
- `owner` / `operator` — host display name when surfaced (sometimes a business, sometimes a user handle).
- `stations[]` — array of plug groups; each entry:
  - `connector` — integer code (see Gotchas for the enum: 1=J1772, 2=NACS/Tesla, 3=CHAdeMO, 4=Tesla Roadster/UMC, 5=CCS1, 6=NEMA 14-50, 7=CCS2, 8=Type 2/Mennekes, 9=GB/T DC, 10=GB/T AC, 11=Wall (no specific plug)).
  - `kilowatts` — peak kW.
  - `count` — number of plugs at this group.
  - `available` — last-reported status (0=unknown, 1=available, 2=in use, 3=offline/out-of-service).
  - `restricted` — boolean.
- `score` — PlugScore 1–10 (matches the `aggregateRating.ratingValue` on the JSON-LD).
- `reviews_count` — review count (matches `aggregateRating.reviewCount` in JSON-LD).
- `photos[]` — array of `{ thumbnail, full, caption?, user_id? }`.
- `amenities[]` — bitfield or array of integer amenity IDs (see filter enum above for slugs).
- `payment` — `"free"`, `"paid"`, `"network"`, or null.
- `hours` — text or `"24/7"`.
- `access` — `1` public, `2` restricted, `3` private.
- `description` — host-supplied description.
- `recent_activity` — list of check-ins; each has `created_at`, `checkin_type`, `comment`, `user.id`, `user.username`. Take `recent_activity.length` for the check-in count and `recent_activity[0].created_at` for the most-recent timestamp.
- `recent_reviews` / `comments` — sample of recent comments / problem reports.
- `url` (synthesise) — `https://www.plugshare.com/location/{id}`.

The map cluster summary visible on the UI is the response's top-level `total` (or `count`) field: when present, `total > len(items)` means results were clipped — surface it in the output so the caller can re-query with a tighter span.

### 7. Browser-fallback (when filter mapping is unclear or a token replay path 401s)

Drive the filter panel directly:

```bash
browse open "https://www.plugshare.com/?latitude=$LAT&longitude=$LNG&spanLat=$DLAT&spanLng=$DLNG" --remote
browse wait load --remote
browse wait timeout 4000 --remote
browse snapshot --remote
# Click "Filters" → toggle the relevant filter panel sections
# (e.g. menuitem "Networks", menuitem "Connectors", slider "Minimum kW")
# Then read the resulting marker overlay; each marker carries data-location-id
LOCATIONS=$(browse eval --remote --expression '
  return [...document.querySelectorAll("[data-location-id]")].map(e=>e.dataset.locationId);
')
# For each id, GET /v3/locations/{id} with the captured bearer.
```

Snapshot refs invalidate after every filter click, so re-snapshot before each interaction. The filter panel is left-rail on desktop (≥1024px viewport); on smaller viewports it collapses behind a "Filters" button.

### 8. Release the session

```bash
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

### Alternative path: cheap single-station via JSON-LD (no session needed)

When the only input is a `/location/{id}` URL or a single station ID and the only fields needed are name, description, image, PlugScore, and review count, skip the bearer dance entirely:

```bash
HTML=$(browse cloud fetch "https://www.plugshare.com/location/{id}" --proxies --allow-redirects --output /tmp/loc.html)
```

The server-rendered HTML contains a `<script type="application/ld+json">` block with the schema.org `LocalBusiness` shape — verified live on `id=9176` (status `200 OK`, served unauthenticated):

```json
{
  "@context": "http://schema.org",
  "@type": "LocalBusiness",
  "name": "Riverside Court Hall of Justice Parking",
  "description": "Units are on the first floor, 12th St side of the building next to the parking attendant.",
  "image": "https://photos.plugshare.com/photos/353347.jpg",
  "url": "/location/9176",
  "publicAccess": true,
  "aggregateRating": {
    "@type": "AggregateRating",
    "bestRating": 10,
    "worstRating": 1,
    "ratingValue": "8.8",
    "reviewCount": "41"
  }
}
```

Also surfaced as `<meta property="og:*">` tags: `og:title` ("…  | City, State | EV Station"), `og:description`, `og:image`, `og:url`. **Lat/lon, network, plug list, and recent check-ins are NOT in the HTML** — for those you need the authenticated API (step 4) or to drive the SPA past hydration. Use this fallback only when the marketing fields are sufficient.

## Site-Specific Gotchas

- **READ-ONLY.** Never click "Check In", "Add Photo", "Add Comment", "Edit Station", "Report Issue", or any star/like control. The skill returns observations only.
- **API is auth-gated, period.** Every `api.plugshare.com/v3/*` path returns `401 Unauthorized: Unknown consumer` to anonymous callers — `locations/region`, `locations/nearby`, `locations/search`, `locations/{id}` all confirmed. The bearer must come from a real `https://www.plugshare.com/` session that has completed the Cognito handshake; there is no public-key or guest-token shortcut. Don't waste turns on `x-api-key`, `Consumer:`, or `Plugshare-App-Version:` header probes — the bundle's interceptor is `bearer`-only (`"bearer"===this.tokenType)e.headers.Authorization="Bearer "+this.accessToken`).
- **PWPS sub-API is a 404 dead-end.** The `apiUrl` block in `https://www.plugshare.com/env.js` lists a `pwpsApiUrl: 'https://api.plugshare.com/pwps/v1'` — every probe under that prefix returned `404 Not Found`. PWPS endpoints exist only inside an authenticated booking flow (Plug-and-Charge / pay-with-PlugShare); irrelevant for read-only charger discovery.
- **`/trip` is not a real URL.** `https://www.plugshare.com/trip` 404s. Trip planning is an in-app panel from `/`. Route-based search must POST to `/v3/locations/polyline`.
- **`www.plugshare.com` is behind Cloudflare.** A bare datacenter IP without `__cf_bm` gets a managed challenge before the SPA can boot. `browse cloud sessions create --verified --proxies` (Verified + residential) is mandatory; `--verified` alone passes most loads but the proxy is needed when the residential origin's geo-routing affects which Cognito edge responds first.
- **The SPA is AngularJS, not React.** Many writeups (including the brief sometimes attached to this task) describe it as React — it isn't. `<html ng-app="plugshare" ng-strict-di>` is the giveaway. Don't waste time looking for `__NEXT_DATA__` or React hydration markers; there are none.
- **Token refresh: Cognito tokens expire in ~1 hour.** For long-running paging jobs, re-read `localStorage` and re-extract; or watch for a `401` and reload the page.
- **`access` is a tri-state, not boolean.** `1=public`, `2=restricted (open with caveats — dealerships, hotel-guest-only, etc.)`, `3=private`. The UI filter "Restricted" and "Public" are separate toggles. The "Member-only" filter overlays on top via `filters_select_restricted=1` AND a separate `network`-scoped membership flag — confirm by inspecting the UI panel before assuming a single param does it.
- **`amenities` are an enum of slugs.** Observed from filter state names: `camping`, `dining`, `grocery`, `hiking`, `lodging`, `park`, `restroom`, `shopping`, `valet`, `wifi`. The "Open 24/7" amenity is a separate boolean flag on the location (`hours == "24/7"`), not in the `amenities[]` enum.
- **`connectors` enum** observed integer codes: 1=J1772, 2=Tesla/NACS, 3=CHAdeMO, 4=Tesla Roadster/UMC, 5=CCS1, 6=NEMA 14-50, 7=CCS2, 8=Type 2/Mennekes, 9=GB/T DC, 10=GB/T AC, 11=Wall (no specific plug). Tesla Supercharger vs. Tesla Destination is differentiated by `kilowatts` + the `network` value, not by a distinct connector code. "J1772 + adapter" is selected on the user's vehicle profile (`filters_vehicle`), not on the station — when selected, the API expands "Tesla destination" results that accept a J1772 adapter.
- **`networks` is an integer enum**, populated by `GET /v3/networks` once-per-session. Cache the response (network IDs are stable: Tesla Supercharger, Electrify America, EVgo, ChargePoint, Blink, Volta, Flo, Petro-Canada, Shell Recharge, etc.).
- **PlugScore is `score` in the API, `aggregateRating.ratingValue` in JSON-LD.** Both are on a 1–10 scale. Stations with `<3` reviews often return `null` / `0` — don't treat `0` as "bad", treat it as "insufficient data".
- **`recent_activity` is the check-in feed, not a status timeline.** Most-recent-check-in timestamp = `recent_activity[0].created_at`. Check-in count visible in the UI = `recent_activity.length` (typically capped at 10 in the response — for an exact lifetime count there is no public field; the UI shows the array length).
- **Map cluster total: surface `total` (sometimes `count`) when present.** When the response's region totals exceed `count` (the cap you sent), results are clipped — emit the total so the caller can decide to re-query with a smaller `spanLat`/`spanLng`.
- **`include_pending`, `include_other`, `include_residential` default to `false`.** "Coming soon", non-EV plugs, and residential (homeowner-shared) stations are EXCLUDED by default — pass `true` explicitly if the caller wants them.
- **Geocoding is the caller's problem.** PlugShare's own `?term=` URL param triggers an SPA-side geocode that updates `latitude`/`longitude` in the URL after navigation — usable but adds a second page load. If you have a Google Maps key, geocoding via Google is faster and more accurate. **Do not** try to call PlugShare's `/v3/locations/search` for raw address strings — that endpoint matches station *names*, not addresses, and returns nothing for "1600 Amphitheatre Pkwy".
- **`/location/{id}` JSON-LD is unauthenticated but minimal.** Only `name`, `description`, `image`, `url`, `publicAccess`, and `aggregateRating` are server-rendered. lat/lon, address, plugs, photos[1+], network, owner, check-ins, hours, amenities, comments — all of these require the authenticated API. Don't pretend the JSON-LD fallback is full-fidelity.
- **Photos host is `photos.plugshare.com`.** Photo URLs in the API come back as paths or partial URLs in some response shapes — always normalise to `https://photos.plugshare.com/photos/{photo_id}.jpg`. The `og:image` value on `/location/{id}` is the canonical primary photo.

## Expected Output

```json
{
  "query": {
    "kind": "region",
    "latitude": 37.7749,
    "longitude": -122.4194,
    "span_lat": 0.05,
    "span_lng": 0.05,
    "filters": {
      "minimum_power_kw": 150,
      "networks": ["Electrify America", "EVgo"],
      "connectors": ["CCS1"],
      "amenities": ["restroom", "dining"],
      "plugscore_min": 8,
      "access": ["public"]
    }
  },
  "total_in_region": 42,
  "returned": 10,
  "clipped": true,
  "stations": [
    {
      "id": 9176,
      "name": "Riverside Court Hall of Justice Parking",
      "latitude": 33.9806,
      "longitude": -117.3755,
      "address": "4050 Main St, Riverside, CA 92501",
      "network": null,
      "owner": "City of Riverside",
      "plugs": [
        {
          "connector": "J1772",
          "kilowatts": 7.2,
          "count": 4,
          "status": "available"
        }
      ],
      "pricing": "free",
      "access": "public",
      "hours": "24/7",
      "amenities": ["restroom", "park"],
      "photos": [
        "https://photos.plugshare.com/photos/353347.jpg"
      ],
      "recent_checkin_count": 10,
      "most_recent_checkin": "2026-05-12T18:23:00Z",
      "plugscore": 8.8,
      "reviews_count": 41,
      "url": "https://www.plugshare.com/location/9176",
      "recent_comments": [
        {
          "created_at": "2026-05-12T18:23:00Z",
          "type": "checkin",
          "comment": "Both J1772s working, free parking on weekends."
        }
      ]
    }
  ]
}
```

Single-station JSON-LD fallback (when only marketing fields are needed):

```json
{
  "query": { "kind": "single_station", "id": 9176 },
  "source": "jsonld",
  "station": {
    "id": 9176,
    "name": "Riverside Court Hall of Justice Parking",
    "description": "Units are on the first floor, 12th St side of the building next to the parking attendant.",
    "image": "https://photos.plugshare.com/photos/353347.jpg",
    "plugscore": 8.8,
    "reviews_count": 41,
    "access": "public",
    "url": "https://www.plugshare.com/location/9176",
    "_note": "lat/lon, plugs, network, hours, amenities not in JSON-LD; re-query with bearer to fill"
  }
}
```

Trip-planner outcome (route + max-detour):

```json
{
  "query": {
    "kind": "route",
    "origin": "San Francisco, CA",
    "destination": "Los Angeles, CA",
    "polyline_radius_mi": 10,
    "filters": { "minimum_power_kw": 150, "networks": ["Tesla Supercharger"] }
  },
  "total_along_route": 28,
  "returned": 28,
  "stations": [ /* ...same per-station shape as region query... */ ]
}
```

Error shapes:

```json
// Bearer not found (Cognito handshake failed)
{ "success": false, "reason": "auth_handshake_failed", "hint": "re-open / and read localStorage after a 5s wait" }

// Token expired mid-paging
{ "success": false, "reason": "token_expired", "hint": "reload / and re-extract bearer" }

// Region returned zero stations (valid empty)
{ "success": true, "total_in_region": 0, "returned": 0, "stations": [] }

// Cloudflare challenge interrupted load (proxies/Verified missing)
{ "success": false, "reason": "cloudflare_challenge", "hint": "session must use --verified --proxies" }
```
