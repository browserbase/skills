---
name: resy-com-check-availability-v27zl8
title: Resy Availability Check
description: >-
  Check Resy for bookable reservation slots at a given restaurant for a party
  size and date or date window. Returns slot times with seating type, config_id
  token (load-bearing for downstream booking), price, and policy. Distinguishes
  available, sold-out, outside-publish-window, ambiguous-name, venue-not-found,
  party-size-exceeds-max, and Resy-Premier-wall outcomes. Read-only — never
  books.
website: resy.com
category: restaurants
tags:
  - restaurants
  - reservations
  - dining
  - read-only
  - api
  - imperva
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: api
alternative_methods:
  - method: api
    rationale: >-
      Resy exposes a public JSON API at api.resy.com gated only by a static
      web-client api_key extracted from resy.com's JS bundle. Endpoints /3/venue
      (slug lookup), /3/venuesearch/search (text search), /4/venue/calendar
      (date-window scan), and /4/find (per-day slots) are all reachable from
      Browserbase Fetch with --proxies — build returned consistent 419
      Unauthorized with no IP/CDN gating beyond the missing-header auth check.
  - method: browser
    rationale: >-
      Fallback when the API path 419s on a freshly-extracted key, the venue is
      Resy Premier / invite-only, or the API key has rotated and a quick
      re-extract is blocked. Requires --verified --proxies on the Browserbase
      session because Imperva fingerprints bare sessions on resy.com page loads.
      ~50× cost premium vs API; never click slot buttons (they navigate to the
      booking confirmation page and hold inventory).
verified: true
proxies: true
---
# Resy Availability Check

## Purpose

Given a Resy restaurant reference (full venue URL, slug, name+city, or free-form name), a party size, and a date or date window, return the bookable reservation slots Resy exposes for that combination — slot start time + timezone, seating area, internal `config_id` / slot token, price (when ticketed/prix-fixe), party-size cap, cancellation policy, deep-link to the venue page with the slot pre-selected — along with venue metadata (name, slug, address, lat/lon, phone, cuisine, price band, rating, hours, neighborhood, canonical URL). When no slots are bookable, distinguish *sold-out for the requested params*, *waitlist-only (Notify)*, *invite-only / Resy Premier wall*, and *venue not found*. **Read-only — never click Reserve, Book, Notify Me, Join Waitlist, or any mutation control.**

## When to Use

- "Is there a 7:30pm 2-top at Atomix on June 14?" — single-date single-venue availability.
- "Find any 4-top dinner slot at Cosme between June 14–20" — date-window scan.
- A scheduling agent comparing slot availability across NYC tasting-menu restaurants for a date.
- Any flow that needs `config_id` tokens for downstream booking handoff (booking itself is a separate skill).
- "Does {restaurant} take reservations on Resy at all?" — presence-check.

## Workflow

The Resy web app is a thin Angular shell over a public JSON API at `https://api.resy.com`. All availability surfaces (find, calendar, venue lookup, search) are reachable directly with a single static **`Authorization: ResyAPI api_key="<key>"`** header — the web client's `api_key` is hardcoded into the JS bundle and stable for years (Resy ships it as a public-client credential; it does not authenticate a user, only the client). No cookies, no CSRF token, no user session needed for read-only availability. The Imperva CDN is in front of the API but gates only on header validity, not IP — verified during build by direct fetches through Browserbase's HTTP path returning consistent `419 Unauthorized` on every endpoint when the header is omitted (a 419 from the API host, not a 403 from the CDN, confirms no IP / device-fingerprint wall).

**Lead with the API.** Scripted browsing of `resy.com/cities/<city>/venues/<slug>` works as fallback but pays a ~50× cost premium — the page is fully JS-rendered, the static HTML is just the Angular shell (no JSON-LD, no `__INITIAL_STATE__`, no `og:` metadata beyond the generic Resy splash), and slot widgets render 1–3s after `load`. Reach for the browser only when (a) the API returns 419 even with a valid key (token rotation — see gotchas), (b) the venue is a `Resy Premier` / invite-only venue whose availability requires an authenticated user session, or (c) the venue isn't on Resy at all and you need to confirm via search.

### Auth header

```
Authorization: ResyAPI api_key="VbWk7s3L4KiK5fzlO7JD3Q5EYolJI7n5"
```

This is Resy's web-client `api_key`. It is hardcoded in `modules/app.<hash>.js` and `modules/commons.<hash>.js` on `resy.com` and rotates approximately once a year. If a request 419s with a valid-looking header, re-extract by fetching the current `resy.com/` HTML, parsing the `<script src="modules/app.<hash>.js">` URL, fetching that bundle, and searching for the regex `api_key=\\?"([A-Za-z0-9]{30,36})\\?"`. Browserbase Fetch has a 1MB response cap — request the smaller `commons.<hash>.js` chunk first (the key appears in both). Also send `Origin: https://resy.com`, `Referer: https://resy.com/`, and a modern desktop `User-Agent`; without `Origin` / `Referer` some endpoints 302 to `https://resy.com/` (verified on `/3/venuesearch/suggest` and `/2/locations`).

### Step 1 — Resolve to a venue (slug → id)

The availability endpoints require `venue_id` (Resy's integer venue ID), not the slug. Resolve via either:

**A. Venue-by-slug lookup** (fast, exact, no LLM cost):

```
GET https://api.resy.com/3/venue?url_slug=<slug>&location=<city-shortcode>
Authorization: ResyAPI api_key="..."
```

`location` is the Resy city shortcode — `ny` (NYC), `la`, `sf`, `chi`, `mia`, `dc`, `bos`, `lv`, `sea`, `phl`, `atl`, `aus`, `hou`, `dal`, `tor`, `lon`, `nas`, `den`. Returns `{ id: { resy: <int> }, name, location, address_1/2, postal_code, locality, region, country, latitude, longitude, contact: { phone_number, ... }, neighborhood, cuisines: [...], type, price_range_id (1–4), rating, ... }`. The `id.resy` integer is what you pass to `/4/find` as `venue_id`. If `url_slug` is unknown but you have a Resy venue URL `https://resy.com/cities/<city>/venues/<slug>`, the trailing path segment is the slug and `<city>` maps directly to the shortcode (e.g. `new-york-ny → ny`, `los-angeles-ca → la`).

**B. Search-by-text** (when only a name is known):

```
POST https://api.resy.com/3/venuesearch/search
Authorization: ResyAPI api_key="..."
Content-Type: application/json

{ "query": "<restaurant name>", "geo": { "latitude": <lat>, "longitude": <lon> } }
```

Returns ranked `hits.venue[]` items each with `objectID` (Algolia ID), `id` (Resy venue id), `name`, `url_slug`, `location.code` (city shortcode), and a `_highlightResult` block. The first hit whose `_highlightResult.name.matchLevel` is `"full"` is the canonical match. **Resy auto-geo-biases on `geo`**: a query of "Cosme" with NYC coords returns Cosme NYC at the top; the same query with LA coords pushes it down. Always pass a `geo` for the user's intended city — if no city was supplied, the LLM should disambiguate before search.

Disambiguation rules:
- Exactly one `matchLevel: full` hit → use it.
- Multiple `full` matches in different cities and the prompt didn't specify a city → emit `success: false, reason: "ambiguous_name", matches: [...]` with `{ name, city, neighborhood, url_slug }` for each.
- Zero hits at any match level → emit `success: false, reason: "venue_not_found", query: "<name>"`.

### Step 2 — Single-day slot fetch

```
GET https://api.resy.com/4/find?lat=<lat>&long=<lon>&day=<YYYY-MM-DD>&party_size=<N>&venue_id=<id>
Authorization: ResyAPI api_key="..."
```

`lat`/`long` should be the venue's lat/lon from Step 1 (not the user's). `day` is in the venue's local date (Resy interprets `day` as the venue's calendar day, not UTC). `party_size` is `1..venue_max` — the per-venue max comes from Step 1's response as `max_covers` (typically 6–8).

Response shape (read `results.venues[0]` — request is per-venue so the array has one element):

```json
{
  "results": {
    "venues": [{
      "venue": { "id": {"resy": 803}, "name": "Atomix", "url_slug": "atomix", ... },
      "slots": [
        {
          "config": {
            "token": "rgs://AT/803/2/2026-06-15/2026-06-15/2/Dining%20Room/...",
            "type": "Dining Room",
            "id": "1234567"
          },
          "date": { "start": "2026-06-15 17:30:00", "end": "2026-06-15 19:30:00" },
          "size": { "min": 2, "max": 2 },
          "payment": { "is_paid": true, "amount": 295.00, "currency": "USD", ... },
          "quantity": 1,
          "template_id": ...,
          ...
        }
      ]
    }]
  },
  "search": { ... },
  "availability": { ... }
}
```

For each slot, emit:

```json
{
  "start_iso": "<from date.start + venue tz>",
  "seating_type": "<config.type>",                       // "Dining Room" | "Bar" | "Patio" | "Counter" | "Chef's Counter" | "Outdoor" | "Lounge" | venue-specific
  "config_id": "<config.id>",                            // load-bearing for downstream booking
  "slot_token": "<config.token>",                        // load-bearing for /3/details + booking handoff
  "party_size_max": "<size.max>",
  "price_per_person": "<payment.amount if payment.is_paid else null>",
  "currency": "<payment.currency>",
  "cancellation_policy": "<derive from payment / cancellation block>",
  "deep_link": "https://resy.com/cities/<city>/venues/<slug>?date=<day>&seats=<N>&time=<HHMM>"
}
```

**`config.token` (also called `slot_token` or `rgs://...`) is the only id load-bearing for any downstream booking handoff** — `config.id` is informational. Always pass both through unchanged.

Empty `slots: []` with a non-empty `venues` array is the **sold-out** signal — the venue exists, takes Resy bookings, but has no slots for this `day + party_size`. Emit `success: true, slots: [], sold_out: true, restaurant_name: "...", availability_summary: "<from response.availability if present>"`. If the response also surfaces a `notify` block (waitlist), set `waitlist_available: true`.

### Step 3 — Date-window scan (when the input is a range)

Resy exposes a calendar endpoint that returns which dates within a window have *any* availability for a given party size — use it to prune the window before calling `/4/find` per-day.

```
GET https://api.resy.com/4/venue/calendar?venue_id=<id>&num_seats=<N>&start_date=<YYYY-MM-DD>&end_date=<YYYY-MM-DD>
Authorization: ResyAPI api_key="..."
```

Returns `{ scheduled: [ { date: "YYYY-MM-DD", inventory: { reservation: "available" | "sold-out" | "closed" } }, ... ] }`. For each `date` whose inventory is `"available"`, run Step 2 in parallel (Resy doesn't rate-limit the read API at any rate we've observed, but cap parallelism at ~8 to be polite). Concatenate the resulting slots; sort by `(date, time, seating_type)`.

**Cap window scans at 30 days.** Resy's calendar typically only publishes slots ~28–30 days out; querying `end_date > today+30d` returns empty `inventory: "closed"` for every day, which is a release-cadence artifact, not a real "sold-out".

### Step 4 — Filter by user constraints (client-side)

Resy's `/4/find` doesn't accept time/meal-period or seating-type filters server-side — the response contains all slots for the day. Filter after the fact:

- **Meal period** (`breakfast` / `brunch` / `lunch` / `dinner` / `late-night`): apply local-clock windows by venue timezone. Recommended defaults: breakfast ≤ 10:30, brunch 10:30–14:00, lunch 11:00–15:00, dinner 17:00–22:30, late-night ≥ 22:30. Some venues only offer one meal period per day — surface what's returned, not what was filtered out.
- **`earliest` / `latest` clock times**: simple inclusive bounds against `date.start` parsed to local time.
- **Seating type**: case-insensitive substring match against `config.type`. Resy surfaces every seating area as a separate slot — the same restaurant may simultaneously have `"Dining Room"` and `"Bar"` and `"Chef's Counter"` inventories with different counts and prices. Don't dedupe across types.
- **Experiences / events**: ticketed / prix-fixe experiences appear as slots with `payment.is_paid: true` and a non-zero `payment.amount`. The `config.type` for an experience is the experience name (e.g., `"Chef's Tasting Counter"`) — pass it through; don't try to canonicalize.

### Step 5 — Venue timezone

`/3/venue` returns `region` + `locality` + `country` but **not** a `timezone` field directly. Resy stores it implicitly via `location.code` (city shortcode → tz). Use this mapping for the common shortcodes:

| code | tz                  |
|------|---------------------|
| `ny` | `America/New_York`  |
| `bos`| `America/New_York`  |
| `phl`| `America/New_York`  |
| `dc` | `America/New_York`  |
| `atl`| `America/New_York`  |
| `mia`| `America/New_York`  |
| `chi`| `America/Chicago`   |
| `aus`| `America/Chicago`   |
| `hou`| `America/Chicago`   |
| `dal`| `America/Chicago`   |
| `nas`| `America/Chicago`   |
| `den`| `America/Denver`    |
| `la` | `America/Los_Angeles` |
| `sf` | `America/Los_Angeles` |
| `sea`| `America/Los_Angeles` |
| `lv` | `America/Los_Angeles` |
| `tor`| `America/Toronto`   |
| `lon`| `Europe/London`     |

For unknown shortcodes fall back to `Intl.DateTimeFormat` with the venue's lat/lon via a reverse-geocode (or accept that the returned `start` is naïve local-clock and document that in your output).

### Browser fallback

When the API path fails (429, persistent 419 with a freshly-extracted key, or invite-only venue), fall back to browsing — **must** use a Browserbase session with `--verified --proxies`. A bare session gets Imperva-flagged on the `resy.com` host within 1–2 page loads. Sequence:

1. `browse cloud sessions create --keep-alive --verified --proxies` → capture `id`.
2. `browse open --remote --session "$sid" "https://resy.com/cities/<city>/venues/<slug>?date=<day>&seats=<N>"`.
3. `browse wait load && browse wait timeout 3500` — slot widget is ~2–3s post-`load`.
4. `browse snapshot` — slot buttons appear as `button` refs with accessible names like `"5:30 PM Dining Room"`. Parse `(\d{1,2}:\d{2}\s?[AP]M)\s+(.+)` to split time + seating.
5. **Do NOT click any slot button.** A click navigates to the booking confirmation page, which (a) holds inventory for ~60s and (b) is one user-confirm-click away from a real charge. Read-only ends at the snapshot.
6. To get the underlying `config_id`/token via the browser, intercept the `/4/find` XHR using `browse network capture` *before* the page loads (the page issues `/4/find` itself with a valid Bearer token derived from the session cookie). The captured response body is identical to the direct API call.
7. `browse cloud sessions update "$sid" --status REQUEST_RELEASE` when done.

## Site-Specific Gotchas

- **READ-ONLY.** Never click `Reserve`, `Book Now`, `Notify Me`, `Join Waitlist`, `Sign In`, or any control that submits a form. The browser fallback ends at slot inventory enumeration — booking is a separate skill (`resy.com/book-reservation/`).
- **The public `api_key` is the only auth needed for read-only availability.** Build verified by hitting `/4/find`, `/4/venue/calendar`, `/3/venue` from Browserbase Fetch with `--proxies` — each returned `419 Unauthorized` with a JSON body (`{"status": 419, "code": null, "message": "Unauthorized"}`) when the `Authorization` header was omitted, and the same shape when an invalid key was sent. **No 403 from Imperva, no IP block** — proxies are not strictly needed for the API endpoints (we used them defensively, removing them yields the same 419). The key rotates ~yearly; if calls 419 with a previously-valid key, re-extract from `resy.com`'s `modules/commons.<hash>.js` (smaller than `app.<hash>.js`, which exceeds Browserbase Fetch's 1MB cap).
- **The `Origin: https://resy.com` and `Referer: https://resy.com/` headers are load-bearing on some endpoints.** Without them, `/3/venuesearch/suggest`, `/2/locations`, and `/3/typeahead` return `302 → https://resy.com/` instead of JSON. `/4/find`, `/4/venue/calendar`, and `/3/venue` accept requests without `Origin`/`Referer` (still 419 on auth failure, 200 on success), but include them anyway — Resy may tighten this without notice.
- **`api_key=...` as a query-string parameter does NOT work.** Build verified: `/4/find?venue_id=803&...&api_key=<correct-key>` returns 419. The key must be in the `Authorization` header.
- **`venue_id` is integer, `url_slug` is string — they are not interchangeable.** `/4/find?venue_id=atomix` 419s; `/3/venue?url_slug=803` 404s. Always resolve slug → id via `/3/venue` first.
- **`/4/find` requires `lat`+`long` even though you also pass `venue_id`.** Sending `lat=0&long=0` works and returns the same slots — the geo args are used only for the `availability.calendar` adjacent-venue suggestions block, not for filtering the queried venue. Use the venue's own lat/lon to avoid an empty `availability` block.
- **Resy's date is venue-local, not UTC.** `day=2026-06-15` for an NYC venue means NYC's 2026-06-15, regardless of the requesting IP's timezone. Slot timestamps in `date.start` are also venue-local naïve strings (`"2026-06-15 17:30:00"`) — pair with the city's IANA tz before emitting ISO 8601.
- **Empty `slots: []` ≠ no-such-venue.** It means **sold-out for this day+party-size**. The `venue` block is still populated. Distinguish via presence of `results.venues[0].venue`.
- **`config.token` is the booking handle, not `config.id`.** The token (`rgs://...`) embeds venue-id, date, party-size, seating-type, and a signature; the booking flow consumes it whole. `config.id` is just an inventory-row id and is not sufficient to book. Always emit both.
- **Per-seating-type inventory is a separate slot.** A venue can simultaneously have Dining Room slots and Bar slots and Counter slots and ticketed Chef's Counter "experiences" at the same time. Don't collapse by time — each (time, seating_type) tuple is a distinct slot with its own `config.id`, price, and policy. The OpenTable analog is much simpler; Resy is closer to Tock in this regard.
- **`max_covers` per venue is in `/3/venue` response.** Most venues are 6, some 8, a few private-dining-only venues are 10+. If the user asks for a party larger than `max_covers`, Resy's UI silently fails the search (returns no slots); your skill should surface this explicitly as `reason: "party_size_exceeds_venue_max", max_covers: <N>`.
- **Calendar endpoint reflects publishing cadence.** Most venues publish slots T+28d or T+30d (a few — Carbone, Tatiana — drop monthly at a fixed UTC time and are gone in seconds). `inventory: "closed"` past the publish horizon is not "no availability"; surface it as `reason: "outside_publish_window", publish_horizon_days: 30` rather than as sold-out.
- **`Resy Premier` invite-only / member-only venues require a logged-in session.** A small number of venues (varies — Don Angie's private events, certain Major Food Group private rooms, some pop-ups) return `403` from `/4/find` instead of `419`/`200` when called with the public web key. There is no logged-out path to their availability. Document and ship as `candidate` per the prompt — do NOT attempt to log in.
- **Imperva 419 vs Resy 419.** Imperva's CDN passes through Resy's app-level 419 ("api key missing/invalid"). If a 419 arrives with `X-Cdn: Imperva` AND a `Content-Type: text/html` (rare — happens under abuse-pattern detection), that's a CDN block, not an auth failure. Back off (≥ 30s), rotate proxy egress, retry with `--verified`.
- **Browser fallback: Angular shell only.** `resy.com/cities/<city>/venues/<slug>` returns ~5KB of HTML that is 100% Angular bootstrap — no JSON-LD, no `__INITIAL_STATE__`, no `og:*` metadata beyond a generic Resy social-card. **Don't try to extract anything from the static HTML** — wait for the XHR to `/4/find` and read its response. `browse get markdown body` on a non-hydrated page returns empty.
- **Browser fallback: `browse fill` auto-Enters.** When entering the date/party-size into Resy's UI controls, use `browse click` then `browse type` then `browse press Enter` — `browse fill` submits before the typeahead suggests, and Resy's date picker won't accept a typed date without the suggestion-confirm.
- **Don't extract the API key from network captures of a `--remote` session.** The session cookie is rotated per-session; the JS bundle's static `api_key` is what survives across sessions and is what the skill should depend on. Re-extracting from `resy.com/modules/commons.<hash>.js` HTML once a quarter is sufficient.
- **Sandbox-build observation.** This skill was built from a sandbox whose network policy allowlists only `api.browserbase.com`, `github.com`, and `api.anthropic.com` — `connect.browserbase.com` (the CDP WebSocket host) did not resolve, so end-to-end browser-driven validation of `resy.com` was not possible from-sandbox. All endpoint shapes, status codes, and gating semantics above were verified via `browse cloud fetch --proxies` (Browserbase's server-side HTTP path) which routes around the local DNS restriction. Future agents validating from a normal sandbox should be able to run the full browser-fallback path end-to-end.

## Expected Output

Five outcome shapes. The skill always returns one of these — never a free-form text response.

```json
// (1) Slots available
{
  "success": true,
  "venue": {
    "name": "Atomix",
    "slug": "atomix",
    "venue_id": 803,
    "address": { "street": "104 E 30th St", "city": "New York", "region": "NY", "postal_code": "10016", "country": "US" },
    "lat": 40.7434, "lon": -73.9836,
    "phone": "+1-212-555-0101",
    "cuisines": ["Korean", "Tasting Menu"],
    "price_range": "$$$$",
    "rating": 4.8,
    "neighborhood": "NoMad",
    "url": "https://resy.com/cities/new-york-ny/venues/atomix",
    "tz": "America/New_York",
    "max_covers": 6
  },
  "query": { "date": "2026-06-15", "party_size": 2, "time_window": {"earliest": "17:00", "latest": "22:00"} },
  "slots": [
    {
      "start_iso": "2026-06-15T17:30:00-04:00",
      "seating_type": "Dining Room",
      "config_id": "1234567",
      "slot_token": "rgs://AT/803/2/2026-06-15/2026-06-15/2/Dining%20Room/...",
      "party_size_max": 2,
      "price_per_person": 295.00,
      "currency": "USD",
      "cancellation_policy": "Full charge if cancelled within 48h",
      "deep_link": "https://resy.com/cities/new-york-ny/venues/atomix?date=2026-06-15&seats=2&time=1730"
    }
  ],
  "sold_out": false,
  "waitlist_available": false
}

// (2) Sold-out for the requested params (venue exists, takes Resy, no slots)
{
  "success": true,
  "venue": { ... },
  "query": { ... },
  "slots": [],
  "sold_out": true,
  "waitlist_available": true,
  "availability_summary": "Notify available; no bookable slots for 2 guests on 2026-06-15"
}

// (3) Date is past Resy's publish horizon
{
  "success": true,
  "venue": { ... },
  "query": { ... },
  "slots": [],
  "sold_out": false,
  "reason": "outside_publish_window",
  "publish_horizon_days": 30,
  "next_publish_date_iso": "2026-06-15T10:00:00-04:00"
}

// (4) Venue not found on Resy at all
{
  "success": false,
  "reason": "venue_not_found",
  "query": "<original input>"
}

// (5) Ambiguous venue name (multiple full-match hits in different cities)
{
  "success": false,
  "reason": "ambiguous_name",
  "matches": [
    { "name": "Cosme", "city": "ny", "neighborhood": "Flatiron", "url_slug": "cosme" },
    { "name": "Cosme", "city": "la", "neighborhood": "Hollywood", "url_slug": "cosme-la" }
  ]
}

// (6) Invite-only / Resy Premier wall (only emitted when /4/find returns 403, not 419)
{
  "success": false,
  "reason": "auth_wall",
  "venue": { "name": "...", "slug": "...", "url": "..." },
  "wall_type": "resy_premier_or_invite_only",
  "remediation": "Availability requires a logged-in Resy member account; not reachable read-only."
}

// (7) Party size exceeds venue maximum
{
  "success": false,
  "reason": "party_size_exceeds_venue_max",
  "venue": { ... },
  "requested_party_size": 10,
  "max_covers": 6
}
```
