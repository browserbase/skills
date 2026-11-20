---
name: turo-com-block-calendar-qy3euh
title: Turo — Block Calendar Dates for Off-Platform Bookings
description: >-
  As a logged-in Turo host, block (mark unavailable) one or more dates on a
  vehicle's availability calendar to prevent on-platform bookings while the car
  is committed to an off-platform reservation, maintenance, or personal use.
  Uses Turo's documented 'Unavailability' affordance; submits a Daily or Hourly
  block via the host Calendar UI.
website: turo.com
category: car-rental
tags:
  - turo
  - host-tools
  - calendar
  - availability
  - cloudflare
  - auth-required
source: 'browserbase: agent-runtime 2026-05-24'
updated: '2026-05-24'
recommended_method: browser
alternative_methods:
  - method: browser
    rationale: >-
      Browser is the only viable method. Turo's host calendar lives behind
      passwordless OTP login (SMS/email/Apple/Google) and is protected by
      Cloudflare bot management. The /api/v2/* endpoints return Cloudflare 403
      'You've been blocked' to unauthenticated cloud-fetch requests; there is no
      public/partner API for setting host availability. Even logged in, the
      underlying XHRs use rotating CSRF + session cookies that are easier to
      drive from a logged-in browser tab than to replicate stand-alone.
verified: true
proxies: true
---
# Turo — Block Calendar Dates for Off-Platform Bookings

## Purpose

Acting on behalf of a logged-in Turo host, mark a date range (or a non-contiguous set of dates, or specific hour windows within dates) **unavailable** on one of the host's vehicles so the car cannot be booked through Turo while it is committed to an off-platform reservation, in maintenance, or otherwise reserved.

Turo calls this feature "**Unavailability**" or "**blocking your availability**" — there is *no distinct "off-platform booking" UI affordance*. The operator simply marks the dates unavailable; the reason is the host's own bookkeeping. Returns a confirmation of the dates that were blocked, plus a list of dates within the requested range that were **not** modified because they overlap with an existing in-progress or upcoming on-platform trip (Turo's calendar refuses to block over a live trip).

**This skill modifies host state** (it writes to the host's availability calendar). It is host-owned, not guest-side. Stop and verify before clicking the final confirm button if the operator can't tolerate accidental blocks — there is no undo button beyond re-selecting the dates and clicking **Remove**.

## When to Use

- A Turo host accepted a side-channel rental (cash booking, friend, partner platform) and needs to prevent Turo guests from double-booking the car for the same dates.
- The car is going in for service and the host wants to block the shop dates from the marketplace.
- The host is taking the vehicle on personal travel for a known date range.
- A previously-confirmed Turo trip was cancelled by a guest off-platform and the host wants to keep the dates blocked rather than re-list immediately.
- The host wants to mark a recurring weekly window (e.g. every weekend) as unavailable — the calendar supports multi-select day picking before applying a block.

**Use a different flow** when the block is longer than ~2 weeks and the vehicle should be removed from search entirely (no on-platform discoverability at all): Turo's own recommendation in [Managing availability](https://help.turo.com/setting-your-car's-availability-BkpBSVxVq) is to **Snooze** the listing instead at `/us/en/your-car/listings` → vehicle row → status menu → Snooze. Snoozed listings auto-relist when the snooze period ends, so the host doesn't have to remember to undo. Blocks are best for short / hourly / patterned windows.

## Workflow

Browser-driven, authenticated host session. Cloudflare bot management is enforced on every `turo.com/us/en/your-car/*` and `turo.com/us/en/trips/*` path, so the harness must be stealth + residential-proxy from the first navigation. **The session must already be logged in** — see the auth callout below.

### 1. Stealth + residential-proxy session, with the host's auth state already loaded

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies \
        --context "$TURO_HOST_CONTEXT_ID" \
      | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$SID"
```

`--verified --proxies` are both mandatory. A bare session sees Cloudflare's `Just a moment...` JS interstitial on every host-side page and `/api/*` calls return HTTP 403 with the `You've been blocked | Turo car sharing marketplace` page (97–140 KB of HTML, `cf-cache-status: MISS`). The Cloudflare challenge clears with stealth+proxies but takes 6–15 s the first time per origin — `browse wait load` is not enough; layer `browse wait timeout 4000` on top.

For `--context`, use a Browserbase context that has the host's `turo.com` cookies and `localStorage` populated. Turo login is **passwordless** — there is no username/password to programmatically submit. Options:

| Auth strategy | Notes |
|---|---|
| **Pre-warmed Browserbase context** (recommended) | Have the host log in once in a `keep-alive` session via SMS / email magic-link / Apple / Google, persist the context, then reuse the context ID on every subsequent session. Tokens last ~30 days. |
| **Cookie injection** | If the host provides their `turo.com` session cookies out-of-band (e.g., from their own browser), import them with `browse cookie set` at session start. |
| **Live OTP-bridge** | If the agent has read access to the host's SMS / email mailbox, drive `/us/en/login` → enter phone → fetch SMS code → enter code → land on `/us/en/trips`. This is the most fragile path; only use when the OTP-recipient channel is programmatic and the host has consented. |

### 2. Navigate to the multi-vehicle host Calendar

```bash
browse open "https://turo.com/us/en/trips/calendar" --remote --session "$SID"
browse wait load --remote --session "$SID"
browse wait timeout 4000 --remote --session "$SID"   # Cloudflare clear
```

If the session is not logged in, this URL redirects to `https://turo.com/us/en/login?next=%2Fus%2Fen%2Ftrips%2Fcalendar`. Detect that by checking `browse get url` for the `/login` substring; if seen, halt with `error_reasoning: "not_authenticated"` rather than attempting an OTP flow inline.

The Calendar lists every vehicle the host owns, alphabetical by **make, model, year**. The header has a **Sort** dropdown (today's price | license plate | booked days).

### 3. Scope to the single vehicle to block (if the host has more than one)

Click the vehicle's photo / row in the multi-vehicle Calendar → the per-vehicle Calendar opens. The per-vehicle URL pattern is `https://turo.com/us/en/your-car/listings/{vehicleId}/calendar` (Cloudflare-challenged on cold navigation; expect a 6–15 s wait). Confirm the page header shows the correct **Year Make Model** before continuing.

If the host has only one vehicle, the multi-vehicle and per-vehicle views are the same surface; skip this step.

### 4. Select the dates to block

The Calendar supports three selection modes:

- **Single day** — click one date cell.
- **Range** — click the start date, then click the end date. The intermediate cells highlight automatically.
- **Multi-select non-contiguous days** — `cmd/ctrl`-click or `shift`-click multiple non-adjacent cells (e.g., every Saturday for the next two months).

After selection, the right rail / bottom sheet exposes the editor. On the web flow this is labeled **"Edit and view details"** (vs. the mobile-app label **"Edit prices"**). Both lead to the same editor.

### 5. Apply a **Daily** or **Hourly** block

Two affordances inside the editor:

- **Daily** — blocks one continuous time period (defaults to the whole day) across **every** selected day. Use this for full-day off-platform reservations, multi-day maintenance, etc.
- **Hourly** — blocks the *same* time window inside *each* selected day. Use this for recurring patterns (e.g., "every weekend, block 6 pm Fri to 9 am Mon" — though for that exact case, prefer setting Pickup-and-return hours instead, which is the structurally correct affordance for weekly availability windows).

Pick the mode → set the start/end time (Daily) or the daily hour window (Hourly) → submit. Turo's wording for the submit button varies by app version; expect labels in the family of **Save**, **Apply**, or **Block**. Read the accessibility tree before clicking — do not click a button labeled **Remove** or **Delete** by mistake (those are the inverse action).

### 6. Verify the block landed and capture the response shape

After submit, the Calendar re-renders with the blocked dates rendered in the "unavailable" visual treatment (grey/striped, with `Unavailable` text on hover). Snapshot and confirm:

- The blocked range matches the input dates exactly.
- No dates inside the range are still rendered as "available" (i.e., the block went through end-to-end).
- If any selected date overlaps an existing in-progress / upcoming trip, that date is **silently skipped** by the editor (per Turo's docs, "Unavailability won't impact in-progress trips"). Detect skipped dates by diffing the requested range against the post-submit visual state and surface them as `dates_skipped_due_to_existing_trip[]` in the output. Do not re-attempt the block on those dates.

Optionally take a screenshot of the calendar post-submit so the host can audit.

### 7. Release the session

```bash
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

### Remove (undo) a previously-applied block

Same Calendar surface: select the blocked date(s) → in the editor, click **Remove**. This is the *only* documented way to undo. There is no global "blocks history" or activity log for blocks.

## Site-Specific Gotchas

- **"Off-platform booking" is not a UI concept on Turo.** The host calendar exposes only "block / unblock availability." Reason / category fields do not exist. Skill consumers asking for "block as off-platform" should be told the block is opaque to Turo — the reason is the host's own bookkeeping.
- **Cloudflare bot management is mandatory-bypass.** `--verified --proxies` is non-negotiable. Without it: `/your-car/*` and `/trips/*` serve the `Just a moment...` JS interstitial indefinitely, and `/api/v2/*` returns 403 with the `You've been blocked` HTML page (140 KB, `Server: cloudflare`, title `You've been blocked | Turo car sharing marketplace`). Verified 2026-05-24: cloud-fetch `/api/v2/vehicle/12345`, `/api/v2/calendar?vehicleId=...`, and `/api/vehicle/12345` all return identical 403 payloads even with `--proxies`. Don't waste a turn trying to drive this through a stand-alone HTTP client.
- **Login is passwordless.** Turo's `/us/en/login` page exposes only: phone (Country code dropdown + Phone number → "Continue" sends SMS OTP), "Continue with email" (magic-link), "Continue with Apple," "Continue with Google." There is no `<input type="password">`. Plan auth around session-context reuse, cookie injection, or programmatic OTP retrieval — never around scripted password submission.
- **The host calendar URL needs the `/us/en/` locale prefix.** Bare `/trips/calendar` 302s through `/us/en/trips/calendar` → `/us/en/login?next=...`. The intermediate redirect is auth-gated so it costs an extra round-trip. Always navigate directly to `https://turo.com/us/en/trips/calendar`.
- **Per-vehicle calendar URL is `/us/en/your-car/listings/{vehicleId}/calendar`** (auth-gated). The earlier `/us/en/your-car/{vehicleId}/calendar` variant (without `listings/`) also resolves but lands on the same logical view; prefer the `listings/` form to match the host listings index path. Probed paths `/us/en/owner/calendar` and `/us/en/host/calendar` are **not** real routes — they silently render the public marketing homepage (`<title>Turo car sharing marketplace | Rent the perfect car</title>`) rather than 404'ing or redirecting to login. Don't use these as a "is logged in?" probe.
- **Cloudflare interstitial wall time is ~6–15 s the *first* time per origin.** Subsequent navigations within the same session re-use the `cf_clearance` cookie and clear instantly. Add `browse wait timeout 4000` after `wait load` on the first navigation to any `/your-car/*` or `/trips/*` page. The help-center origin (`help.turo.com`) is on a separate Cloudflare ruleset and clears immediately — don't use help-center timings to calibrate the main-site wait.
- **In-progress trips silently absorb block requests.** Per Turo's `Managing availability` doc, "Unavailability won't impact in-progress trips." The Calendar UI does not error when a block range overlaps an existing trip — it just skips those date cells. The skill must diff the requested range against the post-submit visual state and report skipped dates explicitly, or it will silently lie to the operator.
- **Snooze is the documented alternative for long blocks.** For a vehicle that should be off-market for more than a couple of weeks, Turo's own recommendation is to Snooze the listing at `/us/en/your-car/listings` → vehicle row → status menu → Snooze (auto-relists at end of snooze period). The Snooze affordance is a separate skill — do not silently convert a "block dates" request into a Snooze. Surface the recommendation to the caller and let them choose.
- **Calendar UI has Daily and Hourly modes — there is no calendar-level "all day" toggle.** Picking **Daily** with no time-window edit defaults to the full day, which is what the operator usually means by "block these dates." Picking **Hourly** without a custom window does *not* block the whole day — it blocks an hourly default window inside each day. Always set the mode explicitly to **Daily** unless the operator's intent is sub-day hourly windows.
- **Mobile-app button labels diverge.** Turo's help docs note web uses "Edit and view details" → "Trip" / "Block" while the app uses "Edit prices" → "View trips" / "Block." This skill is web-only. If the future agent observes "Edit prices" as the editor label, it is being rendered through a mobile WebView shim — bail and re-open the page in a desktop user-agent.
- **`Year Make Model` is the only stable per-vehicle identifier in the multi-vehicle Calendar header.** License plates and `vehicleId` numerics are not surfaced in the multi-vehicle DOM by default. Confirm vehicle identity by reading the per-vehicle Calendar header after clicking the row, not before.
- **Tutorial widget exists.** Per Turo: tap/click the info widget at the top-left of the Calendar page → "Launch tutorial" surfaces a visual walkthrough. Useful for an unfamiliar host but not for the agent — skip it.
- **Help-article URL slugs do not match titles.** The "Using the calendar" article lives at `https://help.turo.com/setting-custom-prices-HJmHSVgNc` and "Managing availability" lives at `https://help.turo.com/setting-your-car's-availability-BkpBSVxVq` — both are Kustomer CMS slug-from-old-title artifacts. Always link to the URL, not the slug.

## Expected Output

Five distinct outcome shapes:

```json
// 1. Full success — every requested date now unavailable
{
  "success": true,
  "vehicle": { "id": "12345", "year_make_model": "2021 Toyota RAV4" },
  "block_mode": "daily",
  "dates_blocked": ["2026-06-12", "2026-06-13", "2026-06-14"],
  "dates_skipped_due_to_existing_trip": [],
  "removable_via": "calendar:select-dates → Remove",
  "screenshot_path": "screenshots/turo-block-confirmed.png"
}

// 2. Partial success — some dates overlapped an existing on-platform trip and were silently skipped
{
  "success": true,
  "vehicle": { "id": "12345", "year_make_model": "2021 Toyota RAV4" },
  "block_mode": "daily",
  "dates_blocked": ["2026-06-12", "2026-06-13"],
  "dates_skipped_due_to_existing_trip": ["2026-06-14"],
  "warning": "1 date(s) inside the requested range overlap an in-progress or upcoming trip and were not blocked. Cancel the trip first or re-quote the range.",
  "screenshot_path": "screenshots/turo-block-partial.png"
}

// 3. Idempotent — dates were already unavailable; no-op
{
  "success": true,
  "vehicle": { "id": "12345", "year_make_model": "2021 Toyota RAV4" },
  "block_mode": "daily",
  "dates_blocked": [],
  "dates_already_unavailable": ["2026-06-12", "2026-06-13"],
  "note": "All requested dates were already blocked. No state change."
}

// 4. Auth failure — session not logged in
{
  "success": false,
  "error_reasoning": "not_authenticated",
  "detail": "Navigation to /us/en/trips/calendar redirected to /us/en/login?next=... — host session is missing or expired. Re-warm the Browserbase context with a fresh OTP login before retrying."
}

// 5. Vehicle not found in host's listings
{
  "success": false,
  "error_reasoning": "vehicle_not_owned",
  "detail": "Vehicle id 99999 is not present in this host's /us/en/your-car/listings index. Confirm the vehicleId belongs to the authenticated host before retrying."
}
```
