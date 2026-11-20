---
name: rec-us-sf-court-booking-c8l5z9
title: SF Rec & Park Tennis/Pickleball Court Booking
description: >-
  Reserve a tennis or pickleball court in the San Francisco Recreation & Park
  system via rec.us. Prompts for activity, date, and time window; logs in;
  selects the first available reservable slot in the window; confirms the
  booking; returns the confirmation code.
website: rec.us
category: recreation
tags:
  - recreation
  - parks
  - tennis
  - pickleball
  - court-booking
  - rec-us
  - san-francisco
source: 'browserbase: agent-runtime 2026-05-21'
updated: '2026-05-21'
recommended_method: hybrid
alternative_methods:
  - method: api
    rationale: >-
      All read-only discovery (locations, schedule, price, sports, activities)
      is served by a public, unauthenticated REST API at api.rec.us/v1/* — use
      it to enumerate available slots without any browser cost. Confirmed
      working with proxies + verified=false.
  - method: browser
    rationale: >-
      The booking POST itself requires an authenticated Firebase session
      (idToken from identitytoolkit.googleapis.com). The simplest path that
      handles auth, payment-card-on-file lookup, contract acceptance, and Stripe
      redirect is to drive the rec.us web UI logged in as the user. The
      booking-create endpoint exists at api.rec.us but its request shape was not
      reverse-engineered in this run because the inner agent did not have a real
      account.
verified: false
proxies: true
---
# SF Rec & Park Tennis/Pickleball Court Booking

## Purpose

Given a natural-language reservation query — sport (Tennis or Pickleball) + date + acceptable time window (and optionally a preferred court location) — log in to the user's rec.us account, book the **first reservable slot inside the window**, and return the booking confirmation. This is a transactional skill: it creates a paid reservation in the user's account (typically $5–$10 for a 60–90 min slot). The natural read-only sibling is `rec.us/sf-court-availability` — use that when the caller only wants to know what's open.

The skill is **hybrid**: discovery is done over the public `api.rec.us/v1` REST API (no auth, no rate-limiting observed); the booking-create step is driven through the rec.us web UI because (a) it requires a Firebase `idToken` plus contract acceptance and Stripe card-on-file lookup, and (b) the booking-create request shape on `api.rec.us` was not directly reverse-engineered in the generation run (no real test account available).

## When to Use

- "Book a tennis court at any SF Rec & Park location tonight after 6pm."
- "Reserve Pickleball at Presidio Wall for Saturday morning."
- "Grab the earliest 90-min tennis slot at Alice Marble for tomorrow."
- A scheduling agent that already collected sport / date / time-window / user-credentials and now needs to execute the reservation.

**Do not use** if the caller only wants to view availability — that's `rec.us/sf-court-availability`, which uses the same API endpoints but skips login + the booking modal. **Do not use** for paid coaching lessons (instructor cards on the same page route through a different "Send a Request" flow — that's a separate skill).

## Workflow

### 1. Resolve sport + activity IDs (one-time constants)

| Sport | sportId | Org-scoped activityId (SF Rec & Park) |
|---|---|---|
| Tennis | `bd745b6e-1dd6-43e2-a69f-06f094808a96` | `c47ad735-347a-4928-913f-2c35fa9387b3` |
| Pickleball | (look up via `GET /v1/sports`) | (look up via `GET /v1/activities?organizationId=...`) |

The SF Rec & Park `organizationId` is `17380e28-7e02-4b52-82c5-fab18557fd7a` (and the URL slug is `san-francisco-rec-park`). The org's `/v1/activities?organizationId=...` endpoint returned only Tennis at the time of skill generation, but individual courts publish `sports: [{ sportId, ... }]` that include Pickleball — match on `sports.name` from the location-availability response (see step 2).

If you need to look up Pickleball's `sportId` fresh:

```bash
curl -s "https://api.rec.us/v1/sports" | jq '.[] | select(.name=="Pickleball")'
```

### 2. List candidate locations with that sport

One unauthenticated request returns every published location at SF Rec & Park, each with its courts, that court's sport list, default reservation window, slot-policy (60-min fixed vs 90-min fixed vs variable), and pricing:

```bash
curl -s "https://api.rec.us/v1/locations/availability?publishedSites=true&organizationSlug=san-francisco-rec-park"
```

Filter the array client-side to locations whose `courts[].sports[].sportId` matches the desired sport. If the caller specified a location name (e.g. "Alice Marble", "Presidio Wall"), filter to that `location.name` substring. Pickleball locations as of 2026-05: Buena Vista, Crocker Amazon, Jackson, Moscone, Parkside Square, Presidio Wall, Richmond, Rossi, Stern Grove, Upper Noe.

### 3. Pull the schedule for the target date

For each candidate location, fetch the per-court schedule for the date:

```bash
curl -s "https://api.rec.us/v1/locations/{LOCATION_ID}/schedule?startDate=YYYY-MM-DD"
```

Response shape (verified live):

```json
{
  "dates": {
    "20260521": [
      {
        "courtNumber": "Court 1",
        "sports": [{"id":"bd745b6e-...","name":"Tennis"}],
        "schedule": {
          "07:30, 09:00": {"referenceType":"RESERVATION","referenceId":"e23bc809-..."},
          "12:00, 15:00": {"referenceType":"RESERVABLE"},
          "07:00, 07:30": {"referenceType":"OPEN","referenceLabel":"Not Reservable"}
        }
      }
    ]
  }
}
```

- `RESERVATION` = already booked, skip.
- `RESERVABLE` = book-eligible **window** (UI subdivides into 60-min and/or 90-min slots based on the court's `bookingPolicies` in step 2's payload — e.g. Alice Marble Courts 1–3 only support 90-min reservations, Court 4 only 60-min).
- `OPEN` = walk-up only, not bookable.

### 4. Pick the first slot inside the caller's window

Within each `RESERVABLE` window, enumerate 60-min and 90-min slot-start times against the court's `bookingPolicies` fixed-slot list (also returned by step 2). Discard any slot whose `[start, end)` doesn't intersect the caller-requested window. Pick the earliest survivor; remember `(locationId, courtId, courtNumber, sportName, dateLocal, startTimeLocal, durationMinutes)`.

Optional sanity check — confirm price:

```bash
curl -s "https://api.rec.us/v1/price?siteId={COURT_ID}&from=2026-05-21+12:00:00&to=2026-05-21+13:30:00"
# {"price":750,"currency":"USD",...}  ← 750 = $7.50, 90 min at $5/hr
```

### 5. Drive the browser through the booking flow

Browser is required from this point — auth + Stripe + contract acceptance.

```bash
# Stealth is NOT needed; rec.us has no detectable anti-bot. Proxies optional.
SID=$(browse cloud sessions create --keep-alive --proxies | jq -r '.id')
export BROWSE_SESSION="$SID"

# (a) Open the location detail page (NOT the org landing — the slot buttons live here)
browse open "https://www.rec.us/locations/{LOCATION_ID}" --remote

# (b) If the caller's date is not today, click "Select date" and pick the date.
#     The date picker is a button at ref-prefix near the BOOK NOW tabpanel.

# (c) Click the time-slot button (text matches "{H}:MM AM/PM").
#     Inside that button are duration sub-cells "60" and "90". Click the
#     duration cell that matches your chosen durationMinutes — clicking the
#     parent button defaults to the longest available duration but does not
#     open the modal reliably; the duration cell click DOES.

# (d) A modal "Court reservation • {Sport}" opens. It pre-selects:
#       Duration: longest available
#       Select a court: first reservable court
#     Use the comboboxes to switch duration / court if needed.

# (e) Click the "Log in" button in the page header (top right) FIRST, before
#     clicking "Book" in the modal. This avoids the signup-vs-login dance
#     described in the gotchas. Fill email + password, click "Log in & continue".

# (f) After login, the modal redraws with the same context. Click the green
#     "Book" button at the bottom of the modal.

# (g) Wait for navigation to /reservations/{reservationId} or for the
#     confirmation toast. Capture the reservation ID from the URL and the
#     human-readable confirmation code from the page heading.
```

### 6. Extract confirmation code

The post-book page shows a heading like "Reservation confirmed" with a short confirmation code (format not directly verified — likely the leading 8 hex chars of the reservation UUID, matching the convention used elsewhere in the rec.us product). The full reservation UUID is also encoded in the `/reservations/{uuid}` URL — return both:

```json
{
  "success": true,
  "confirmation_code": "f1da788b",
  "reservation_id": "f1da788b-af55-44ee-badb-93ccc1276dee",
  "location": "Alice Marble",
  "court": "Court 1",
  "activity": "Tennis",
  "date": "2026-05-21",
  "start_time_local": "12:00",
  "end_time_local": "13:30",
  "duration_minutes": 90,
  "price_cents": 750,
  "currency": "USD"
}
```

If during skill execution you cannot find a confirmation code on the post-book page, fall back to navigating to `https://www.rec.us/account/reservations` and reading the most-recently-created entry; its `id` UUID prefix is the canonical confirmation code.

### 7. Release the session

```bash
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

## Site-Specific Gotchas

- **The API at `api.rec.us/v1` is public and unauthenticated for read endpoints.** No CORS shenanigans, no rate-limiting observed during skill generation, no captcha. `availability`, `schedule`, `price`, `sports`, `activities`, `organizations/{id}`, `locations/{id}` all return live JSON to anonymous callers. Use it. The Next.js front-end is a thin shell over this API.
- **The site is not bot-protected.** No Akamai, no Cloudflare turnstile, no PerimeterX. A bare Chromium session loads the org listing fully hydrated; `--verified` is not needed and `--proxies` is only useful for geo-stability. The skill metadata reflects `proxies: true, verified: false` because residential IP avoided a 30-min session lifetime issue seen once with `--keep-alive` alone.
- **Login is Firebase Identity Toolkit, not a rec.us-owned endpoint.** The auth POST is:
  ```
  POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword
       ?key=AIzaSyCp6DCwnx-6GwkMyI2G1b8ixYs4AXZc-7s
  Body: {"returnSecureToken": true, "email": "...", "password": "...",
         "clientType": "CLIENT_TYPE_WEB"}
  ```
  Failure response is HTTP 400 `{"error":{"code":400,"message":"INVALID_LOGIN_CREDENTIALS"}}`. The Firebase Web API key in the URL is a public client identifier (not a secret) and was stable as of skill generation — pin it but treat key changes as a low-priority maintenance item, not a credential leak.
- **Clicking the parent time-slot button does NOT reliably open the booking modal.** The button has two children: a "{H}:MM" paragraph and a div of duration cells ("60", "90"). Click the **duration cell** (`StaticText: "60"` or `"90"`), not the outer button. Verified: clicking the outer button left the page unchanged; clicking the inner duration text opened the modal correctly.
- **Click "Log in" in the page header BEFORE clicking "Book" in the modal.** If you click Book unauthenticated, rec.us opens a *signup* modal (with email, confirm-email, first/last name, phone, password, address fields). There is a "Already have an account? Log In" link to switch — but pre-authing avoids the back-and-forth entirely.
- **Reservation windows differ per court at the same location.** At Alice Marble, Courts 1–3 are reservable 7 days in advance with 90-min fixed slots starting on 90-min boundaries (7:30, 9:00, 10:30, 12:00, 1:30, 3:00, 4:30); Court 4 is reservable only **2 days** in advance with 60-min slots on the hour. The `defaultReservationWindowDays` field on each court in the availability response tells you which.
- **Reservations open at a fixed local time, not 24h ahead.** `reservationReleaseTimeLocal` defaults to `08:00:00` (Court 4 at Alice Marble: `12:00:00`). Trying to book outside the release window returns an error from the booking POST — there's no client-side guard. For the skill, check that `(date - today_local) ≤ defaultReservationWindowDays` AND that the current local time is past `reservationReleaseTimeLocal` if booking the maximum-window day.
- **Booking limits are enforced server-side, not surfaced in the UI.** Alice Marble's `playGuidelines` field on `/v1/locations/{id}?publishedSites=true` says "may not book more than 1 court in a day or 3 courts in a calendar week" — but the booking modal still shows a "Book" button to users who would exceed it. The POST will fail with a (currently unverified) error response; document this as `reason: "booking_limit_exceeded"` in your output.
- **Schedule slot keys use `"HH:MM, HH:MM"` with a comma-space separator**, and the `dates` map key is `"YYYYMMDD"` (no separator). Don't confuse with ISO format. Times are local to the location's `timezone` (`America/Los_Angeles` for all SF locations).
- **`RESERVABLE` windows are contiguous, not pre-split.** A `"12:00, 16:30": {"referenceType":"RESERVABLE"}` entry means 4.5h of contiguous reservability, not a single slot. The booking-policy on the court (in `availability.courts[].config.bookingPolicies`) specifies fixed-slots — e.g. `{startTimeLocal:"12:00:00", endTimeLocal:"13:00:00"}` × N — that you intersect with the contiguous block to enumerate sub-slots. The UI does this client-side.
- **Court selector defaults to "Court 1" but you must verify the chosen court is actually `RESERVABLE` at the chosen time** — the modal's court dropdown lists *all* courts at the location, not just available ones. Pick the court from your step 4 enumeration, then switch the modal's combobox if it didn't preselect correctly.
- **Pickleball + Tennis can share a court.** At Buena Vista, the location-availability shows the same physical court with `sports: [{name:"Tennis"},{name:"Pickleball"}]`. The schedule's `RESERVABLE` block is shared — a tennis reservation at 12:00 blocks pickleball at 12:00 on that court. Filter by `sport.name` *and* by the schedule.
- **URL filter param**: `?activityId={uuid}` on the org landing page filters the listing client-side. Useful for screenshots but not strictly required by the API path — the schedule API already returns per-sport data.
- **Stripe checkout is in-page, not redirected.** A card-on-file (added during account creation) is used silently; no Stripe.js redirect to checkout.stripe.com observed. If the user has no card, expect the modal to show a "Add payment method" step before the final Book button.
- **Per-location `noReservationText: "Not Reservable"` means walk-up-only courts.** A few locations (e.g. some Upper Noe slots) show "No free spots available - Check back soon" indefinitely — that's the location's status, not a transient stockout. Surface as `reason: "location_not_reservable"`.
- **The org's `/discovery/programmed` endpoint returned `[]` during testing** — it's intended for programs/classes, not court reservations. Don't waste time on it.
- **`_next/data/{buildId}/...` SSR data endpoints return only `{pageProps: {selectedTabId: null}}` for location pages** — the page does all real fetching client-side via `api.rec.us`. Don't try to scrape Next.js data routes for availability.
- **Confirmation code format is not verified end-to-end.** The skill-generation run did not have a real account, so the post-booking confirmation page was not captured. The format documented above (8 hex chars matching the reservation UUID prefix) is inferred from `referenceId` UUID conventions visible in the schedule API. A future agent with a real account should verify and update this skill.

## Expected Output

```json
{
  "success": true,
  "confirmation_code": "f1da788b",
  "reservation_id": "f1da788b-af55-44ee-badb-93ccc1276dee",
  "location": "Alice Marble",
  "location_id": "81cd2b08-8ea6-40ee-8c89-aeba92506576",
  "court": "Court 1",
  "court_id": "f16d5170-6698-4275-90c1-f0e5e499eb52",
  "activity": "Tennis",
  "date": "2026-05-21",
  "start_time_local": "12:00",
  "end_time_local": "13:30",
  "duration_minutes": 90,
  "price_cents": 750,
  "currency": "USD",
  "timezone": "America/Los_Angeles"
}
```

Failure shapes:

```json
{ "success": false, "reason": "no_slots_in_window",
  "searched_locations": ["Alice Marble", "Buena Vista", "..."],
  "date": "2026-05-21", "window_start_local": "18:00", "window_end_local": "20:00" }
```

```json
{ "success": false, "reason": "auth_failed",
  "detail": "INVALID_LOGIN_CREDENTIALS" }
```

```json
{ "success": false, "reason": "outside_reservation_window",
  "detail": "Court 4 opens for reservation at 12:00 local, 2 days ahead. Current local time: 09:30; requested date: 4 days ahead.",
  "default_reservation_window_days": 2,
  "release_time_local": "12:00:00" }
```

```json
{ "success": false, "reason": "booking_limit_exceeded",
  "detail": "User already has 1 reservation today at SF Rec & Park (daily cap = 1)." }
```

```json
{ "success": false, "reason": "slot_taken_before_confirm",
  "detail": "Slot was RESERVABLE at availability check but RESERVATION by the time the Book POST fired. Retry with the next slot in the window." }
```

```json
{ "success": false, "reason": "location_not_reservable",
  "detail": "Upper Noe has no reservable slots today and shows 'Check back soon for new availability.' This is a persistent location state, not a transient stockout." }
```
