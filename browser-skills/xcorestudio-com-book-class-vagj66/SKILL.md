---
name: xcorestudio-com-book-class-vagj66
title: Book X-Core 7 AM West Portal Class
description: >-
  Reserves the daily 7 AM xBURN class at X-Core Studio's West Portal location
  (Mariana Tek) for a signed-in member, firing at the exact second the booking
  window opens so it runs unattended overnight.
website: xcorestudio.com
category: fitness
tags:
  - fitness
  - booking
  - mariana-tek
  - scheduling
  - x-core
  - west-portal
source: 'browserbase: agent-runtime 2026-06-01'
updated: '2026-06-01'
recommended_method: hybrid
alternative_methods:
  - method: api
    rationale: >-
      Mariana Tek's public read API (classes/locations/regions, tenant xcore)
      reliably resolves the target class id and its authoritative
      booking_start_datetime. An authenticated POST reserve is faster than the
      browser at T=0, but the exact reserve endpoint/payload was not verified
      without member credentials, and unauthenticated me/reservations probes
      returned 404.
  - method: browser
    rationale: >-
      Sign in via the embedded Mariana Tek account widget at /login-account,
      open /ocean-schedule (= West Portal, location 48785), and click Reserve on
      the 7 AM row. This is the verifiable execution path for the actual booking
      but carries more latency than a raw API call.
verified: false
proxies: false
---
# Book X-Core Studio 7 AM West Portal Class

## Purpose

Reserve the daily 7:00 AM xBURN class at X-Core Studio's **West Portal** location (2528 Ocean Ave, San Francisco) for a signed-in member, every weekday (Mon–Fri). X-Core runs its scheduling on **Mariana Tek** (tenant slug `xcore`). Reservations open on a rolling window and the popular 7 AM slot fills to waitlist within seconds of opening, so the value of this skill is **timing**: it must fire the reservation at the exact instant the booking window opens, unattended, while the member is asleep.

This is a **write** skill — it creates a real reservation against the member's account/credits. It signs in with the member's stored credentials, books the single target class, and stops. It does not buy packages, cancel, or modify anything else.

## When to Use

- "Book my 7 AM West Portal class for next Monday (and every weekday)."
- A recurring scheduled job that auto-grabs the 7 AM xBURN slot the moment it becomes reservable.
- Any unattended booking where the class sells out instantly and a human can't be awake at 7 AM to click Reserve.
- Securing a spot (or auto-joining the waitlist) for a specific future weekday class at one named location.

## Workflow

**Recommended method: hybrid.** Use Mariana Tek's public read API to resolve the exact target class and the precise second its booking window opens, then execute the authenticated reservation (browser, signed-in) at that instant. The public API is unauthenticated and was verified end-to-end; the reservation step requires the member's credentials and could not be exercised without them, so treat its exact transport as documented-but-unverified and prefer the browser path for the actual click.

Stable identifiers (verified):
- Mariana Tek tenant: `xcore` → API base `https://xcore.marianatek.com`
- Region (San Francisco): `48608`
- **West Portal location: `48785`** (2528 Ocean Ave, SF 94132, timezone `America/Los_Angeles`)
- 7 AM class start time is `T14:00:00Z` during PDT (UTC−7) and `T15:00:00Z` during PST (UTC−8). Do **not** hardcode the UTC hour — filter on local 07:00 (see gotchas).

### 1. Resolve the target class (public API, no auth)

For the desired calendar date, list West Portal classes and pick the one whose local start time is 07:00:

```bash
# date range should bracket the single target day in local time
curl -s "https://xcore.marianatek.com/api/customer/v1/classes?min_start_date=YYYY-MM-DD&max_start_date=YYYY-MM-DD&location=48785&page_size=200&format=json"
```

Each result includes: `id`, `start_datetime` (UTC `Z`), `class_type.name` (e.g. "xBURN", "xBURN Arms and Abs"), `available_spot_count`, `waitlist_count`, `is_user_reserved`, `is_user_waitlisted`, and critically **`booking_start_datetime`**. Select the result whose start, converted to `America/Los_Angeles`, is 07:00. The class name varies by weekday (xBURN / xBURN Arms and Abs / xBURN Basics / xBURN Booty and Abs) — match on **time + location**, not name.

### 2. Read the booking-open instant — do NOT assume a fixed window

The target class object carries `booking_start_datetime`, e.g. `"2026-06-08T07:00:00-07:00"`. This is the authoritative moment the slot becomes reservable. Across every weekday 7 AM West Portal class observed, this was exactly **7 days (1 week) before class, at 07:00 local time** — i.e. a Monday 7 AM class opens the *previous Monday* at 7:00 AM PT.

> **Assumption / correction:** The request described a "2 weeks in advance / 2 Mondays prior" window. The live API consistently reported a **7-day** window, not 14. The skill must always trust `booking_start_datetime` from the class object and schedule against it, never a hardcoded offset — the studio can change the window at any time and only the field is authoritative.

### 3. Schedule the unattended run

Register a recurring job (this is what lets it "run regardless" while the member sleeps):

- For each desired class day, the booking job must fire at that class's `booking_start_datetime`. Practically: each weekday at **06:59:5x America/Los_Angeles**, target the class exactly one window-length (currently 7 days) ahead, and fire Reserve at **07:00:00.000 PT**.
- The `-07:00`/`-08:00` offset embedded in `booking_start_datetime` already encodes DST, so anchoring the cron to the `America/Los_Angeles` zone (not a fixed UTC hour) keeps "7 AM" correct year-round.
- Pre-resolve the class `id` and **pre-authenticate** (warm a signed-in session) *before* the window opens. The slot goes to "waitlist only" within seconds, so all setup must be done with the session idle and ready, leaving only the single Reserve action to execute at T=0.

### 4. Execute the reservation (browser, signed-in)

1. Open `https://www.xcorestudio.com/login-account`, dismiss the "This site uses cookies" banner (`Accept All Cookies`), and click **LOG IN** inside the embedded Mariana Tek account widget. Enter the member's email + password. (The widget is an iframe — see gotchas.)
2. Navigate to the West Portal schedule: `https://www.xcorestudio.com/ocean-schedule` (the Squarespace embed `data-mariana-integrations="/schedule/daily/48608?locations=48785"` confirms region 48608 / location 48785 — "ocean-schedule" IS West Portal).
3. Select the target day tab, find the 7:00 AM row, and click its **Reserve** button the instant it turns from "waitlist only" to reservable. If only the waitlist is available at T=0, join the waitlist (matches the member's intent to secure the recurring slot).
4. Confirm success by re-reading the class via the API: `is_user_reserved: true` (or `is_user_waitlisted: true`). Stop. Do not navigate further or purchase anything.

### Pure-API alternative (documented, unverified)

Mariana Tek exposes authenticated customer endpoints under `https://xcore.marianatek.com/api/customer/v1/...`. Reads (`classes`, `locations`, `regions`) are public and verified. The reservation write requires an OAuth2 bearer token obtained from the member's login; the exact reserve endpoint/payload was **not** verified here (no credentials available) and unauthenticated probes of `me`/`reservations` returned 404. If a valid bearer token is available, an authenticated POST is faster than the browser (lower latency at T=0, which matters for instant-fill classes) — but verify the endpoint against a throwaway/low-demand class before relying on it for the 7 AM rush.

## Site-Specific Gotchas

- **Window is 7 days, not 2 weeks — and it's a field, not a constant.** Every observed 7 AM West Portal class opened booking exactly 7 days prior at 07:00 PT. Always read `booking_start_datetime` off the target class; never hardcode 7 or 14 days.
- **"ocean-schedule" = West Portal.** The West Portal studio is at 2528 Ocean Ave; X-Core's site labels its schedule page `/ocean-schedule` and the embed targets `locations=48785`. There is no separate "west-portal-schedule" URL. Don't be thrown by the name mismatch.
- **Filter on local 07:00, not a UTC hour.** 7 AM PT = `14:00Z` in summer (PDT) but `15:00Z` in winter (PST). Convert `start_datetime` to `America/Los_Angeles` before matching.
- **The 7 AM slot fills instantly.** Every in-window 7 AM class observed showed `available_spot_count: 0` and "waitlist only". You cannot book late — the entire skill hinges on firing at T=0. Pre-resolve the class id and pre-authenticate; leave only the Reserve click for the exact second.
- **Class name varies by weekday.** Mon "xBURN Arms and Abs", Wed "xBURN Basics", Fri "xBURN Booty and Abs", etc. Match on **time + location**, never on class name.
- **The login button is inside a Mariana Tek iframe.** On `/login-account`, a top-document `document.querySelector` will not find the LOG IN control or the email/password fields — they live in the embedded Mariana Tek widget. Interact within the iframe context (e.g. snapshot/click by ref rather than top-frame `eval`).
- **Cookie banner intercepts clicks.** A "This site uses cookies" modal overlays the account area on first load; dismiss `Accept All Cookies` before attempting to log in.
- **No anti-bot friction.** Site is Squarespace + Mariana Tek; the pre-run probe detected no anti-bots and a bare Browserbase session (no `--verified`, no `--proxies`) loaded every page and hit the public API successfully. Stealth/proxies were not required.
- **Read-only API endpoints that work unauthenticated:** `/api/customer/v1/classes`, `/api/customer/v1/locations`, `/api/customer/v1/regions` (append `?format=json`). `me` and `reservations` return 404 without auth — they are not the discovery surface.
- **Credentials required.** This skill cannot run without the member's X-Core (Mariana Tek) email + password. Without them it can resolve the class and timing but cannot reserve.
- **Booking consumes credits/membership.** A successful reserve draws on the member's package/membership and is subject to X-Core's late-cancel policy. This is a real, billable action — only run it for genuinely-wanted classes.

## Expected Output

```json
// Success — spot reserved
{
  "success": true,
  "action": "reserved",
  "location": "West Portal",
  "location_id": "48785",
  "class_id": "86xxxx",
  "class_name": "xBURN Arms and Abs",
  "class_start_local": "2026-06-15T07:00:00-07:00",
  "booking_opened_at": "2026-06-08T07:00:00-07:00",
  "is_user_reserved": true
}

// Slot full at T=0 — joined waitlist instead
{
  "success": true,
  "action": "waitlisted",
  "location": "West Portal",
  "class_id": "86xxxx",
  "class_start_local": "2026-06-15T07:00:00-07:00",
  "is_user_waitlisted": true,
  "waitlist_position_estimate": 2
}

// Could not authenticate
{
  "success": false,
  "reason": "auth_failed",
  "detail": "Mariana Tek login rejected the stored credentials."
}

// No 7 AM class on the target day
{
  "success": false,
  "reason": "no_target_class",
  "detail": "No 07:00 local class at location 48785 on 2026-06-15."
}

// Ran too late — window already closed/filled
{
  "success": false,
  "reason": "window_missed",
  "detail": "booking_start_datetime was 2026-06-08T07:00:00-07:00; class was full by the time Reserve fired."
}
```
