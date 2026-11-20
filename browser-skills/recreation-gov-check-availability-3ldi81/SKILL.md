---
name: recreation-gov-check-availability-3ldi81
title: Recreation.gov Availability Check
description: >-
  Check live availability for any Recreation.gov bookable resource — campground,
  backcountry permit, lottery, timed-entry tour, day-use site — over a date
  range and return the per-site/per-division, per-day availability matrix with
  equipment, accessibility, pet policy, fees, and canonical URLs. Read-only.
website: recreation.gov
category: outdoors
tags:
  - camping
  - permits
  - lottery
  - national-parks
  - availability
  - read-only
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      Fallback only. The React SPA at /camping/campgrounds/{id} renders the same
      data the JSON API exposes but costs ~1 MB JS download, ~3 s render, and
      virtualized calendar grids require scrolling — roughly 100x slower and
      dollar-costlier than the API. Reserve for hot-launch moments (Half
      Dome/Mt. Whitney lottery release) when Akamai gates the API; pair with
      --advanced-stealth --proxies.
verified: false
proxies: false
---
# Recreation.gov Availability Check

## Purpose

Given a Recreation.gov bookable resource — campground, backcountry permit, lottery, timed-entry tour, or day-use site — plus a date range and an optional filter surface, return the per-site (or per-division) per-day availability matrix. Resolves names → facility IDs via Recreation.gov's public-but-undocumented JSON API, then pulls structured per-day status, equipment caps, accessibility, pet policy, fees, photos, and canonical site URLs.

**Read-only — never click Reserve, Add to Cart, Add to Lottery, Apply, or Proceed to Payment.**

## When to Use

- "Is Upper Pines open for tents 6/15–6/19?" — campground availability lookups.
- "When does the Half Dome daily-permit lottery draw next, and how many slots remain post-draw?" — backcountry permit + lottery.
- "Any Wave Coyote Buttes North permits left in June 2026?" — daily-lottery + advanced-lottery permits.
- "Mariposa Grove shuttle tickets for next Saturday morning?" — `timedentry` / `timedentry_tour` ticketing.
- Any scraper / agent that previously rendered the React SPA to read availability — replace with the JSON path below for a ~100× speed-up.

## Workflow

Recreation.gov ships a public-but-undocumented JSON API that backs every page of the React SPA. **There is no auth, no cookies, no CSRF token, and no anti-bot challenge on the read endpoints used below** — verified against `/api/search`, `/api/search/suggest`, `/api/camps/availability/campground/{id}/month`, `/api/camps/availability/campsite/{id}/all`, `/api/camps/campsites/{id}`, `/api/camps/campgrounds/{id}`, `/api/permits/{id}/availability`, `/api/permitcontent/{id}`, and `/api/timedentry/availability/facility/{id}` (2026-05-18, no proxies, no stealth, no `Referer`, default browser-shaped UA — all returned 200 with full payload). Lead with the JSON path; only fall back to scripted browsing if Recreation.gov rolls anti-bot onto these endpoints (not observed today, but they reserve the right to gate hot-launch moments — see Gotchas).

### Step 1 — Resolve the input to a typed entity_id

Skip if the caller already gave a `/camping/campgrounds/{id}`, `/permits/{id}`, or `/ticket/facility/{id}` URL — parse the trailing integer and the path segment, which maps directly to the `entity_type` used below:

| URL path | `entity_type` | Use availability endpoint in step 2 |
|---|---|---|
| `/camping/campgrounds/{id}` | `campground` | A |
| `/permits/{id}` | `permit` | B |
| `/ticket/facility/{id}` | `timedentry` / `timedentry_tour` | C |

Otherwise resolve a free-text name (and optional state) through the suggest index:

```
GET https://www.recreation.gov/api/search/suggest?q={URL-encoded name}&geocoder=true
```

Returns `inventory_suggestions[]` with `entity_id`, `entity_type`, `name`, `parent_name`, `state_code` (full state name — "California", not "CA"), `preview_image_url`, and `reservable: bool`. Filter client-side on state if needed — the documented `fq=state_code:"CA"` filter on `/api/search` gets HTML-entity-encoded by the gateway and returns `total: 0`. Stick with suggest + client-side filter.

For permit/lottery lookups, the verbose `/api/search?q=...&entity_type=permit` endpoint returns richer cards (camping-equipment-allowed lists, average rating, accessible-campsite counts, mailing/physical addresses) — only call it when you actually need those extra fields. Both endpoints share the same `entity_id` namespace.

### Step 2 — Pull availability based on entity_type

#### A. Campgrounds (`entity_type: "campground"`)

Two endpoint shapes — pick by the shape of the question.

**A1. "What's available across all sites in this campground for these dates?"** — the per-facility, per-month endpoint:

```
GET https://www.recreation.gov/api/camps/availability/campground/{facilityId}/month
    ?start_date=YYYY-MM-01T00%3A00%3A00.000Z
```

- `start_date` **must be the first of a month** in `YYYY-MM-01T00:00:00.000Z` form. Any other day returns `400 {"error":"Only the first of the month is allowed for this request"}`. To cover a multi-month range, **loop month-by-month** and concatenate `campsites[*].availabilities` keys.
- Returns `{campsites: {{campsite_id}: {site, loop, campsite_type, campsite_reserve_type, availabilities: {date: status}, quantities, min_num_people, max_num_people, type_of_use}}, count}`. Upper Pines (232447) returns 235 sites at ~490 KB per month.
- `availabilities[date]` values from this endpoint: `"Available"`, `"Reserved"`, `"Closed"`, `"Not Reservable"`, `"Not Available"`, `"Open"`, `"Walk-up"`. Verified observed in this endpoint shape during sampling: `Available, Reserved, Closed`.

**A2. "What are the next 18 months of availability for one specific site?"** — the per-campsite endpoint:

```
GET https://www.recreation.gov/api/camps/availability/campsite/{campsiteId}/all
```

- Returns ~603 days of availability for one site (≈ 18 months forward from today). Cheaper than month-looping when you only care about one or a handful of sites.
- **Status enum is DIFFERENT here:** values observed are `"Open"`, `"Reserved"`, `"Closed"`, `"NYR"` (Not Yet Released — the future booking window hasn't opened yet). Map `"Open"` → `"Available"` and `"NYR"` → `"Not Reservable"` when normalizing across both endpoints.

#### B. Permits / lotteries (`entity_type: "permit"`)

```
GET https://www.recreation.gov/api/permits/{permitId}/availability
    ?start_date=YYYY-MM-DDT00%3A00%3A00.000Z
    &end_date=YYYY-MM-DDT00%3A00%3A00.000Z
    &commercial_acct=false
    &is_lottery=false
```

- Returns `{payload: {permit_id, next_available_date, availability: {{division_id}: {date_availability: {date: {total, remaining, show_walkup, is_secret_quota}}}}}}`.
- `remaining` is the post-lottery walk-up quota for daily-permit systems (Half Dome, Wave Daily). `is_secret_quota: true` means the API hides the exact number — surface as `remaining: null, is_secret_quota: true` rather than guessing.
- `is_lottery=true` flips the response to lottery-draw quotas (pre-draw applied-count, lottery_close_date, lottery_draw_date) for advanced-lottery permits like Wave Advanced (274309) and Half Dome's Seasonal division.

Fetch division metadata (names like `"Half Dome Cables (Daily)"`, `"Scenic"`, `"Educational"`, accessibility flags, entry/exit points, per-division fees) from `/api/permitcontent/{permitId}` — the `payload.divisions` map is keyed by the same `division_id` returned in the availability response. The same payload exposes `has_lottery: bool`, the `lotteries[]` array of past/current lottery instances (one with `is_active: true, executed: false` is the next draw), and `important_dates[]`.

#### C. Tours / day-use timed entry (`entity_type: "timedentry"` or `"timedentry_tour"`)

```
GET https://www.recreation.gov/api/timedentry/availability/facility/{facilityId}
    ?date=YYYY-MM-DD
```

- **One date per request.** Loop client-side for a range. Bare `YYYY-MM-DD` only — passing `YYYY-MM-DDT00:00:00.000Z` returns `400 {"error":"strconv.Atoi: parsing \"01T00:00:00.000Z\": invalid syntax"}`.
- Returns an array of tour-time slots with `inventory_count.{ANY,COMM,FIT,LOTTERY,WALKUP}` and matching `reservation_count.*` — **available count = `inventory_count.ANY` − `reservation_count.ANY`**. Also surfaces `booking_windows.PRIMARY.{open_timestamp, close_timestamp}` (the visibility window relative to wall time) and `booking_window_open_override` when the agency has shifted the release time.
- The legacy `/api/ticket/...` paths in older docs return 404 or empty arrays — use `/api/timedentry/...`.

### Step 3 — Enrich with per-site metadata

For each `campsite_id` you decide to surface, hit:

```
GET https://www.recreation.gov/api/camps/campsites/{campsiteId}
```

Returns under `campsite.*`:
- `campsite_name` (the public site number, e.g. `"040"`), `loop`, `campsite_type` (`"RV NONELECTRIC"`, `"STANDARD NONELECTRIC"`, `"TENT ONLY NONELECTRIC"`, etc.), `is_accessible` (the ADA flag),
- `permitted_equipment[]` (e.g. `[{equipment_name: "RV", max_length: 20}, {equipment_name: "Pop up", max_length: 18}]`) — `max_length` is in feet,
- `attributes[]` of `{attribute_code, attribute_value}` pairs — pull `pets_allowed`, `max_num_people`, `max_num_vehicles`, `max_vehicle_length`, `driveway_length`, `site_length`,
- `site_details_map.{campfire_allowed, capacity_rating, checkin_time, checkout_time, ...}` for the summary card,
- `notices[]` with `notice_type: "info" | "warning"` — booking caveats the agency surfaces in the UI (HTML-escaped; un-escape `<` before display),
- `campsite_latitude` / `campsite_longitude` for the map pin.

For facility-level metadata (the campground's name, address, phone, time zone, alternate_names, cancellation_description, attached `links[]` of photos):

```
GET https://www.recreation.gov/api/camps/campgrounds/{facilityId}
```

### Step 4 — Apply caller-side filters

The API does not accept filter params on the availability endpoints — apply group_size / site_type / equipment / ADA / pet / loop filters by post-filtering the campsite list against the metadata in step 3.

| Caller filter | Post-filter predicate |
|---|---|
| `group_size: N` | `attributes.max_num_people >= N` |
| `site_type: "Tent Only"` | `campsite_type` startswith `"TENT ONLY"` |
| `rv_length_ft: L` | `any(eq.max_length >= L for eq in permitted_equipment if eq.equipment_name == "RV")` |
| `electric: true` | `campsite_type` does NOT end in `"NONELECTRIC"` (presence of `"ELECTRIC"`, `"FULL HOOKUP"`, or `"FULL HOOKUP ELECTRIC"`) |
| `accessibility: true` | `is_accessible == true` |
| `pets_allowed: true` | `attribute_code "pets_allowed"` value `!= "None"` |
| `loop: "Upper Pines"` | `loop == "Upper Pines"` |

### Step 5 — Construct canonical URLs

```
campground site:        https://www.recreation.gov/camping/campsites/{campsite_id}
campground facility:    https://www.recreation.gov/camping/campgrounds/{facility_id}
permit:                 https://www.recreation.gov/permits/{permit_id}
permit booking:         https://www.recreation.gov/permits/{permit_id}/registration/detailed-availability?type=overnight-permit
tour / timedentry:      https://www.recreation.gov/ticket/facility/{facility_id}
tour booking tour:      https://www.recreation.gov/ticket/{facility_id}/ticket/{tour_id}
```

### Browser fallback

The React SPA at `/camping/campgrounds/{id}` paints the same data the JSON path returns, but every read costs ~1 MB of JS download + ~3 s rendering, the calendar grid is virtualized (must scroll to materialize off-screen weeks), and per-site detail requires opening a modal per click. **The JSON path is ~100× faster and dollar-cheaper.** Only fall back if Recreation.gov starts gating the API endpoints (in which case: open a Browserbase session with `--advanced-stealth --proxies` because the JS bundle and `/api/*` calls then go through Akamai's challenge layer; the public read endpoints listed above do not require it today).

## Site-Specific Gotchas

- **`start_date` must be the 1st of a month on `/api/camps/availability/campground/{id}/month`.** Server returns `400 {"error":"Only the first of the month is allowed for this request"}` for any other day. Multi-month range queries must loop month-by-month and concatenate.
- **The status enum differs between `/month` and `/campsite/.../all`.** `/month` emits `Available | Reserved | Closed | Not Reservable | Not Available | Open | Walk-up`. `/campsite/{id}/all` emits `Open | Reserved | Closed | NYR`. Always normalize when merging the two: `Open → Available`, `NYR → Not Reservable` (the future booking window hasn't opened yet). A naïve consumer that only knows `Available` will treat valid future inventory as unavailable.
- **Tour / timedentry availability is one date per request.** `/api/timedentry/availability/facility/{id}?date=YYYY-MM-DD` — bare YYYY-MM-DD, no ISO suffix. Passing `2026-06-01T00:00:00.000Z` returns `400 strconv.Atoi parsing "01T00:00:00.000Z"`. The legacy `/api/ticket/...` paths return 404 or empty — they were superseded.
- **`is_lottery=true` vs `is_lottery=false` are different views of the same permit.** False returns the post-draw walk-up quota stream (daily walk-up flag + remaining). True returns the pre-draw applied-count / lottery_close_date / lottery_draw_date. For permits with both (Half Dome: daily walk-up *plus* a separate seasonal lottery division), call both shapes and merge by `division_id`.
- **`is_secret_quota: true` means the API hides `remaining`.** Don't infer `remaining: 0` — it's "the agency declines to publish the number." Surface `remaining: null, is_secret_quota: true`.
- **`reservable: false` in `/api/search/suggest`.** Some entities (boundary-only `recarea` entries, decommissioned facilities) come back with `reservable: false` — skip them before hitting any availability endpoint or you'll get an empty-payload 200.
- **`/api/search?q=...&fq=state_code:"CA"`** is HTML-entity-encoded by the gateway: the response echoes `fq:["state_code:&#34;CA&#34;"]` and silently returns `total: 0`. Either drop the `fq` and filter client-side on `state_code` (which is the full state name, e.g. `"California"`, not the ISO code `"CA"`), or use `/api/search/suggest` which doesn't accept `fq` at all.
- **`/api/tours/{id}` returns the React SPA HTML, not JSON.** That route is a client-side React path, not an API. Use `/api/timedentry/availability/facility/{id}` for tour-shaped facilities.
- **`facility_id` ≠ `legacy_id` ≠ `parent_asset_id` ≠ `campsite_id`.** The `/api/search` results expose `entity_id` (which is the `facility_id` for campgrounds, the `permit_id` for permits, and the `facility_id` for tours). Inside a campground response, each site has its own `campsite_id` (the URL-segment for `/camping/campsites/{id}`) plus a `legacy_id` used by older Park-Service systems. The two are not interchangeable in URLs.
- **HTML-escaped notice text.** `campsite.notices[].notice_text` contains literal `<p>` / `<strong>` — un-escape before surfacing or you'll show raw entities.
- **Rate-limiting is not enforced today but the agency reserves the right at launch moments.** The Half Dome / Mt. Whitney / Wave lottery-window opening (15th of each month at 07:00 PT for Yosemite Valley campgrounds, mid-Feb for Mt. Whitney, etc.) historically triggers Akamai 503s and a CAPTCHA wall on `/api/*`. For real-time monitoring during a hot launch, switch to a Browserbase session with `--advanced-stealth --proxies` and back off on 429/503.
- **`state_code` in suggest results is the full state name.** `/api/search/suggest` returns `state_code: "California"`, but `/api/camps/campgrounds/{id}` and `/api/search` return `state: "CA"`. Don't equality-match across the two responses without normalizing.
- **Sites in a campground have heterogeneous reserve types.** `campsite_reserve_type` can be `"Site-Specific"` (book exact site), `"Non Site-Specific"` (book a site class, get one assigned at check-in), or `"Group"` / `"Walk-Up Only"`. Surfaces in both the per-month and the per-site responses.
- **READ-ONLY.** Never POST to `/api/reservations/*`, `/api/order/*`, `/api/permits/{id}/registration/*`, or `/api/timedentry/orders/*`. Never click `Reserve`, `Add to Cart`, `Add to Lottery`, `Apply`, `Proceed to Payment` if you fall back to the browser.

## Expected Output

Three distinct outcome shapes — campground, permit, tour.

```json
// Campground — per-site, per-day matrix
{
  "kind": "campground",
  "facility_id": "232447",
  "facility_name": "Upper Pines Campground",
  "parent_recarea": "Yosemite National Park",
  "state": "CA",
  "facility_url": "https://www.recreation.gov/camping/campgrounds/232447",
  "checkin": "2026-06-15",
  "checkout": "2026-06-19",
  "filters_applied": {"site_type": "TENT ONLY", "group_size": 4, "pets_allowed": true},
  "sites_total": 235,
  "sites_after_filter": 71,
  "sites": [
    {
      "campsite_id": "98",
      "site_number": "040",
      "loop": "Upper Pines",
      "campsite_type": "RV NONELECTRIC",
      "reserve_type": "Site-Specific",
      "max_num_people": 6,
      "max_num_vehicles": 2,
      "is_accessible": false,
      "pets_allowed": "Domestic",
      "permitted_equipment": [
        {"equipment_name": "RV", "max_length_ft": 20},
        {"equipment_name": "Pop up", "max_length_ft": 18}
      ],
      "lat": 37.73751, "lon": -119.56544,
      "availability": {
        "2026-06-15": "Available",
        "2026-06-16": "Available",
        "2026-06-17": "Reserved",
        "2026-06-18": "Available"
      },
      "nightly_price_usd": null,
      "fees_breakdown": [{"label": "Peak", "amount_usd": 36.00}],
      "site_url": "https://www.recreation.gov/camping/campsites/98"
    }
  ]
}

// Permit / lottery — per-division, per-day quota
{
  "kind": "permit",
  "permit_id": "234652",
  "permit_name": "Half Dome Permits",
  "has_lottery": true,
  "lottery_state": {
    "active_lottery_id": "0d1b1413-57c2-4701-acf1-f0b227f7e58e",
    "is_active": true,
    "executed": false,
    "draw_at": "2026-03-15T00:00:00Z",
    "applications_close_at": "2026-03-01T23:59:59Z"
  },
  "divisions": [
    {
      "division_id": "31",
      "division_name": "Half Dome Cables (Daily)",
      "type": "Entry Point",
      "is_accessible": false,
      "is_lottery_option": false,
      "per_date": [
        {"date": "2026-06-01", "total_quota": 275, "remaining": 81, "show_walkup": false, "is_secret_quota": false},
        {"date": "2026-06-02", "total_quota": 275, "remaining": 62, "show_walkup": false, "is_secret_quota": false}
      ]
    }
  ],
  "permit_url": "https://www.recreation.gov/permits/234652"
}

// Tour / timed-entry — per-slot for one date
{
  "kind": "timedentry_tour",
  "facility_id": "10112471",
  "facility_name": "Mariposa Grove Commercial Bus Parking",
  "date": "2026-06-01",
  "booking_window": {
    "primary_opens_at":  "2026-05-02T08:00:00-07:00",
    "primary_closes_at": "2026-06-01T08:00:00-07:00"
  },
  "slots": [
    {
      "tour_time": "08:00",
      "inventory_total": 1,
      "available": 0,
      "reservation_count": 1,
      "is_secondary_window_only": false
    }
  ],
  "facility_url": "https://www.recreation.gov/ticket/facility/10112471"
}
```
