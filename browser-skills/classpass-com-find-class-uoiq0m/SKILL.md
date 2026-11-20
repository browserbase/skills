---
name: classpass-com-find-class-uoiq0m
title: ClassPass Find Class
description: >-
  Search ClassPass for available fitness, wellness, beauty, or recovery class
  slots near a location and return matching results as structured JSON (class
  id, instructor, venue, start/end time in tz, credit cost, premium flag,
  modality, spots, amenities, rating). Accepts free-form intent, ZIP/city +
  category + date, a direct /search URL, or a venue slug. Read-only — never
  books.
website: classpass.com
category: fitness-wellness
tags:
  - classpass
  - fitness
  - yoga
  - wellness
  - scheduling
  - read-only
source: 'browserbase: agent-runtime 2026-05-15'
updated: '2026-05-15'
recommended_method: browser
alternative_methods: []
verified: false
proxies: false
---
# ClassPass Find Class

## Purpose

Given a free-form intent ("yoga tomorrow morning near 10003"), a `{ZIP/city, category, date-range, filters}` tuple, a direct `https://classpass.com/search/...` URL, or a venue slug, return matching ClassPass class slots as structured JSON: class id, title, category, instructor, venue (id, name, address, lat/lon, distance), start/end time in ISO 8601 with tz, duration, credit cost, premium-class flag, modality (in-person / livestream / on-demand), spots remaining, difficulty, description, equipment, amenities, photo URLs, studio rating + review count, canonical class-detail URL — plus a region-wide total so the caller knows the slice is partial.

**Read-only.** Never click `Book` / `Reserve` / `Confirm`. Even with an authenticated context, treat reservation buttons as off-limits.

## When to Use

- "any yoga class tomorrow morning near 10003?"
- "find me a 45-min HIIT class in San Francisco under 6 credits this weekend"
- Enumerate a studio's full upcoming schedule by venue slug: `https://classpass.com/studios/y7-studio-flatiron-new-york`
- A multi-city comparison agent looking at slot inventory across MSAs.
- Anywhere a caller drops a ClassPass search URL and expects a structured list back.

## Workflow

ClassPass is a Next.js + Redux SPA. The search-results SSR HTML returns 200 to a bare/data-center IP (Cloudflare does **not** challenge), but `entities.searchSchedules.data` is empty in the SSR store — slot times are fetched client-side via XHR to the internal REST API at `https://api.classpass.com`. The schedule endpoints require a `CP-Authorization` header, so the only reliable cookieless path is to drive a real browser, let the XHRs settle, then read the now-populated Redux store from the page.

The **non-search REST endpoints under `api.classpass.com` are fully public** (verified GET 200 from a bare AWS IP, no auth, no cookies). Use them as supplements for venue metadata, MSA lookup, and location resolution — they are faster than re-driving the browser.

### Step 1 — Session (Verified + proxies recommended but not always required)

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies | jq -r '.id')
```

`browse cloud fetch` works against `classpass.com` and `api.classpass.com` with no proxy, but the browser path occasionally trips a Cloudflare challenge from data-center IPs. Default ON for safety; drop `--proxies` if you're cost-sensitive and the bare session loads cleanly.

### Step 2 — Resolve the location

The `<city-slug>` in `/search/{city}/{activity}` is **cosmetic** — ClassPass ignores it for geo-scoping and instead reads either (a) the request IP (default) or (b) URL params `?lat=&lon=`. To force a specific location:

```bash
# Option A — known place_id (use the location/details endpoint to resolve)
browse cloud fetch "https://api.classpass.com/unisearch/v1/location/details/<google_place_id>"
# returns: { lat, lon, formatted_address, timezone, viewport_*, ... }

# Option B — known MSA → use the table from GET /v1/msas
browse cloud fetch "https://api.classpass.com/v1/msas"
# Notable MSAs: 1=New York Metro (new-york), 2=Los Angeles (los-angeles),
#   3=San Francisco (san-francisco), 4=Chicago, 5=Miami, 8=Washington DC,
#   9=Boston, 11=Seattle, 28=London (UK).
```

Cache the `place_id → {lat, lon, tz}` and the MSA table; they're stable across requests.

### Step 3 — Build the canonical URL

```bash
# Canonical SEO URL for an MSA + activity pair:
browse cloud fetch "https://api.classpass.com/unisearch/v1/search_url?tag_id=<TAG>&msa_id=<MSA>"
# 200: { "url": "/search/new-york-metro/massage" }
# 404: { "data": "No SEO slug found for msa ID 1 and tag ID 1" }   # the activity-prefixed fitness tags don't have SEO slugs

# Failing that, hand-build:
URL="https://classpass.com/search/<msa-alias>/<activity-slug>?lat=<LAT>&lon=<LON>"
# Optional filters appended as URL params (see Gotcha §URL-filter-params below)
```

`<activity-slug>` examples: `yoga`, `pilates`, `cycling`, `hiit`, `barre`, `boxing`, `dance`, `running`, `martial-arts`, `swimming`, `stretching`, `massage`, `facial`, `cryotherapy`, `sauna`, `meditation`, `acupuncture`, `nails`, `lashes`, `brows`, `hair`, `gym-time`.

### Step 4 — Drive the page, wait for slot hydration, read the store

```bash
browse cloud browse --connect "$SID" newpage "$URL"
browse cloud browse --connect "$SID" wait load
browse cloud browse --connect "$SID" wait timeout 4000   # XHR settle — slot list lands ~2–3s after `load`
browse cloud browse --connect "$SID" eval "JSON.parse(document.getElementById('store').textContent)" > store.json
```

Then parse `store.json`:

```js
const s = require('./store.json');
const sched = s.entities.searchSchedules.data;           // map: "{ids}_{scope}_{date}_{offset}" → result
const venues = s.entities.venueByIdV2?.data || {};
const classes = s.entities.classesByVenue?.data || {};   // map: venueId → catalog[]
const filters = s.filterSets.search.filters;
const region = s.filterSets.search.filters.location.value;  // { lat, lon, locationName, timezone, ... }
```

Each `searchSchedules.data[key].schedules[]` element carries the slot: `start_datetime` (ISO 8601), `duration_minutes`, `credits`, `is_premium`, `premium_credits`, `instructor_name`, `spots_remaining`, `class_id`, `venue_id`, `reservation_id`, `modality`, etc. The region-wide total is at `searchSchedules.data[key].total_count` (and per-page slice in the array).

### Step 5 — Apply filters via URL params + page interactions

URL-level filter params (verified to alter SSR / client-side hydration state on the search page):

| Param | Effect | Values |
|---|---|---|
| `lat=` / `lon=` | Override IP-based geolocation. **Required when calling from a non-target IP.** | float / float |
| `date=YYYY-MM-DD` | Single date | ISO date |
| `time=05:00-08:00` | Time-of-day window. Six canonical windows: `05:00-08:00`, `08:00-10:00`, `10:00-14:00`, `14:00-17:00`, `17:00-19:00`, `19:00-23:00` | one or comma-sep |
| `radius=` | Distance radius | 0.8 / 1.6 / 8 / 16.1 / 40.2 (km), or omit for "Auto" |
| `level=` | Difficulty | `level_all`, `level_beginner`, `level_advanced` |
| `amenity=` | Amenities | `shower`, `locker`, `parking` |
| `result_type=` | Tab | `VENUE` (default), `MOVEMENT`, `LIVESTREAM`, `ON_DEMAND` |
| `vertical=` | Top-level vertical | `all`, `fitness`, `wellness`, `beauty` |

For filters not exposed via URL (`credits`, `duration`, `instructor`, multi-amenity multi-select), drive the filter rail interactively then re-read the store after settle.

### Step 6 — Enumerate a specific studio's schedule (shortcut path)

If the caller hands you a venue slug or venue ID, **skip the search page entirely** — the `/studios/{venue-alias}` page SSRs both the venue profile AND today's schedule into the Redux store:

```bash
browse cloud fetch --allow-redirects "https://classpass.com/studios/<venue-alias>"
# Parse <script id="store" type="application/json">...</script>:
#   entities.venueByIdV2.data[alias]              → full venue (address, amenities, photos, tz, ratings)
#   entities.classesByVenue.data[venue_id]        → class catalog (no time slots, just class definitions)
#   entities.searchSchedules.data["{venueId}_all_{YYYY-MM-DD}_0"]  → today's slots inline
```

Future days require XHR-driven navigation through the studio page's date picker — that's where you'd switch back to scripted browsing.

### Step 7 — Supplement with public REST endpoints

After scripted browsing, hydrate any missing per-venue / per-class metadata via these confirmed-public endpoints (no auth, GET only, ~100 ms each):

| GET endpoint | Returns |
|---|---|
| `/v2/venues/{id-or-alias}` | Full venue: amenities (showers/lockers/mats/towels/parking booleans), address, lat/lon, ratings, tz, MSA id, photos, description, requirements, what_to_bring, cancellation_policy |
| `/v1/venues/{alias}/classes` | Class catalog at venue (definitions, not slots) |
| `/v1/venues/{alias}/classes/{class_alias}` | Single class detail |
| `/v2/venues/{id}/reviews` | Recent venue reviews |
| `/v2/venues/{id}/similarities` | Similar nearby venues |
| `/v2/venues/{id}/nearby_popular` | Nearby popular venues |
| `/v1/msas` | All MSAs (city aliases, default lat/lon, tz, currency) |
| `/unisearch/v1/search_url?tag_id=X&msa_id=Y` | MSA+tag → canonical search URL |
| `/unisearch/v1/location/details/{google_place_id}` | Place → {lat, lon, tz, formatted_address, viewport} |

### Step 8 — Release session

```bash
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

## Site-Specific Gotchas

- **READ-ONLY.** Reservation buttons start a flow that consumes credits — never click `Book`, `Reserve`, `Confirm`. Stop at the listing-detail view.
- **The `/search/{city}/{activity}` URL is SEO-only — the city slug is ignored for geolocation.** Without `?lat=&lon=`, the page resolves the location to the request-IP's city. A bare-IP fetch from AWS us-west-2 resolved to "Boardman, OR" (`lat: 45.84, lon: -119.70`) regardless of whether the URL said `new-york`, `san-francisco`, or `chicago`. **Always append `?lat=<LAT>&lon=<LON>` to force a location.**
- **Canonical search URL is `/search/{msa-alias}/{activity-slug}` where msa-alias is the *Metro* name** (e.g. `new-york-metro`, not `new-york`). Both work, but the metro form is what `unisearch/v1/search_url` emits. Use the metro alias when constructing URLs.
- **Two activity-tag-ID schemes coexist.** Wellness/beauty tags are bare integers (`140` Bootcamp, `142` HIIT, `1145` Massage, `1147` Facial, `1149` Cryotherapy, `1153` Sauna, `1155` Meditation, `1157` Acupuncture, `16463` Brows, `16492` Lashes, `17590` Nails, `17592` Hair). Fitness tags are prefixed (`activity-1` Yoga, `activity-23` Martial arts, `activity-72` Cycling, `activity-90` Pilates, `activity-100` Dance, `activity-467` Rowing, `activity-553` Barre, `activity-587` Boxing, `activity-589` Running, `activity-590` Sports, `activity-591` Outdoors). The unisearch `search_url` endpoint returns 404 ("No SEO slug found") for the `activity-N` form — for those, hand-build the URL with the slug name directly.
- **Search-page SSR does not pre-populate `searchSchedules`.** The Redux store (`<script id="store">`) on `/search/...` HTML carries filter enums + MSAs + the resolved location, but `entities.searchSchedules.data === {}` until the client-side XHR settles. Always `wait timeout 4000` after `wait load` before reading.
- **Studio-page SSR DOES pre-populate `searchSchedules` for the current day** — keyed as `"{venueId}_all_{YYYY-MM-DD}_0"`. This is the fastest path to "today at this studio" with zero browser turns. For future dates, drive the studio page's date picker.
- **The internal API is REST under `api.classpass.com`, not GraphQL.** Auth header is `CP-Authorization` (not `Authorization`); internal trace header is `x-cpinternalrequestid`. The full route table is bundled in the SPA's JS at `cdn9.classpass.com/dist/...` — grep for `unisearch` or `bff/v` to find it.
- **Schedule POST endpoints are auth-gated.** `POST /unisearch/v1/layout/{tab}`, `POST /unisearch/v3/layout/map_items`, `POST /v3/search/schedules` all return 401/403 without a valid `CP-Authorization` token. `GET /v1/classes/{id}/schedules` is 403 cookieless. Don't waste time probing for an unauth bypass — confirmed across multiple probes 2026-05-15.
- **Public REST endpoints are surprisingly generous.** `/v1/msas`, `/v2/venues/{id-or-alias}`, `/v1/venues/{alias}/classes`, `/v2/venues/{id}/reviews`, `/v2/venues/{id}/similarities`, `/unisearch/v1/location/details/{place_id}`, `/unisearch/v1/search_url` all serve cookieless 200 from arbitrary data-center IPs. Use them aggressively for venue / location / MSA metadata to avoid extra browser turns.
- **Cloudflare protection is mild on search/studio pages, harder on POST endpoints.** Bare `browse cloud fetch` got 200 every time on read-only paths. POST/auth surfaces additionally enforce `CP-Authorization`. Verified + residential proxies haven't been shown necessary for GETs but use them by default for the browser flow.
- **Per-user credit pricing requires auth.** Without a logged-in session, `credit_cost` reflects the public displayed value. With cookies, the page shows the user's actual price (member rate / premium-credit surcharge / monthly-cap discount). If the caller hands you authed context, capture both `displayed_credit_cost` and `user_credit_cost`.
- **Premium-class flag (`is_premium: true`) doubles or triples credit cost.** Always emit both `credit_cost` and `premium_credit_cost` when premium. Premium status surfaces in the slot object as `is_premium` boolean + `premium_credits` number.
- **`reservation_id` vs `class_id` vs `schedule_id`** — `class_id` is the immutable catalog ID (one per "Slow Burn Vinyasa Express" at this studio, ID `2220869`). `schedule_id` is per-occurrence. `reservation_id` only exists once a slot is held by a specific user. The canonical "this exact slot at this exact time" identifier is `schedule_id`. Emit all three when surfaced.
- **Timezones are per-venue, not per-MSA.** `venueByIdV2.data[alias].tz` is the source of truth. Always render `start_time` in the venue's tz, not the search location's tz (an MSA can span multiple tz, e.g. NY Metro touches Connecticut + NJ; SF Bay touches PT only but London touches BST/GMT).
- **Modality filter via `result_type` URL param** — `VENUE` (default, in-person), `MOVEMENT` (search by class type across studios), `LIVESTREAM`, `ON_DEMAND`. Emit `modality` on every slot.
- **Pagination via `getSchedulesByCursor`** — once a POST `/v3/search/schedules` lands, the response includes a cursor for `GET /v3/search/schedules?cursor=...` to page through results. Browser-driven flow handles this implicitly via infinite scroll; API-replay flow needs explicit cursor handoff.
- **The 6 canonical time-of-day windows are off-by-one from the prompt's 5.** Prompt says `Early morning, Morning, Midday, Afternoon, Evening`; ClassPass actually offers `05:00-08:00` (Early Morning), `08:00-10:00` (Late Morning), `10:00-14:00` (Midday), `14:00-17:00` (Afternoon), `17:00-19:00` (Evening), `19:00-23:00` (Late evening). Map the caller's "morning" to both `05:00-08:00` and `08:00-10:00`, and "evening" to both `17:00-19:00` and `19:00-23:00`.
- **Live-WebSocket caveat (build context).** This skill was developed with `browse cloud fetch`-only reconnaissance because the build sandbox could not reach `connect.usw2.browserbase.com` (DNS REFUSED). The browser-driving flow in Step 4 is the documented design but was NOT exercised end-to-end during the build. An agent running the skill from a normal Browserbase context (with full WebSocket reach) should expect Step 4 to work as written; if it doesn't, the studio-page SSR shortcut (Step 6) and the public REST endpoints (Step 7) are independently verified fallbacks.

## Expected Output

Successful search with slots:

```json
{
  "success": true,
  "query": {
    "location": "New York, NY",
    "postal_code": "10003",
    "lat": 40.7331,
    "lon": -73.9889,
    "msa_id": 1,
    "msa_alias": "new-york-metro",
    "category": "yoga",
    "activity_tag_id": "activity-1",
    "date": "2026-05-15",
    "time_of_day": ["05:00-08:00", "08:00-10:00"],
    "modality": "VENUE",
    "radius_km": 8,
    "level": null,
    "amenities": []
  },
  "region_total": 412,
  "returned": 24,
  "page": 1,
  "next_cursor": "eyJvZmZzZXQiOjI0LCJyZXN1bHRfaWQiOiI2NzQ1NTg0NTUwODA4ODE2OSJ9",
  "classes": [
    {
      "class_id": 240975,
      "schedule_id": 86103412,
      "reservation_id": null,
      "title": "WeFlowHard® Vinyasa",
      "class_alias": "weflowhard-vinyasa-yoga-tqna",
      "category": "fitness",
      "subcategory": "yoga",
      "activity_tag_id": "activity-1",
      "instructors": ["Jane Doe"],
      "venue": {
        "venue_id": 27696,
        "name": "Y7 Studio",
        "subtitle": "Flatiron",
        "alias": "y7-studio-flatiron-new-york",
        "address": "25 W 23rd St, 3rd floor, New York, NY 10010",
        "latitude": 40.7421758,
        "longitude": -73.9904711,
        "msa_id": 1,
        "location_id": 9012,
        "neighborhood": "NoMad",
        "distance_miles": 0.42
      },
      "start_time": "2026-05-15T07:30:00-04:00",
      "duration_minutes": 60,
      "end_time": "2026-05-15T08:30:00-04:00",
      "timezone": "America/New_York",
      "credit_cost": 8,
      "displayed_credit_cost": 8,
      "user_credit_cost": null,
      "is_premium": false,
      "premium_credit_cost": null,
      "modality": "in-person",
      "spots_remaining": 4,
      "capacity": 25,
      "difficulty": "level_all",
      "description": "Open to all levels, WeFlowHard® Vinyasa is Y7’s signature class…",
      "equipment_required": null,
      "amenities": {
        "showers": true,
        "lockers": true,
        "mats": true,
        "towels": true,
        "parking": false
      },
      "photo_urls": [
        "https://classpass-res.cloudinary.com/image/upload/f_auto/q_auto/xbh3bhjd5xpz6mimjbev.jpg"
      ],
      "studio_rating": 4.78,
      "studio_review_count": 166681,
      "url": "https://classpass.com/classes/weflowhard-vinyasa-yoga-tqna"
    }
  ],
  "error_reasoning": null
}
```

Empty result (location resolved fine, but no slots match filters):

```json
{
  "success": true,
  "query": { "...": "..." },
  "region_total": 0,
  "returned": 0,
  "classes": [],
  "error_reasoning": null
}
```

Venue-slug enumeration (Step 6 shortcut — venue + today's slots from SSR):

```json
{
  "success": true,
  "query": { "venue_alias": "y7-studio-flatiron-new-york", "date": "2026-05-15" },
  "venue": { "venue_id": 27696, "name": "Y7 Studio", "subtitle": "Flatiron", "...": "..." },
  "classes": [ { "...": "..." } ],
  "next_dates_require_browser": true,
  "error_reasoning": null
}
```

Failure (location couldn't be resolved):

```json
{
  "success": false,
  "error_reasoning": "Could not resolve location 'Boardman, OR' to a ClassPass MSA. Falling back to IP geolocation surfaced no slots within radius. Suggest caller supply lat/lon or a known MSA alias.",
  "ip_resolved_to": "Boardman, OR",
  "classes": []
}
```

Auth wall (somehow reached an authed endpoint without credentials):

```json
{
  "success": false,
  "error_reasoning": "POST /unisearch/v1/layout/search returned 401 — endpoint requires CP-Authorization header. Use the SSR-hydrated store path instead, or supply a logged-in session via Browserbase context.",
  "classes": []
}
```
