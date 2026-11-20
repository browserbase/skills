---
name: vagaro-com-rebook-with-same-provider-xekrwo
title: Rebook Vagaro Appointment with Same Provider
description: >-
  Re-book a past Vagaro appointment with the same service provider for a future
  date/time. Logs into the customer account, opens appointment history, and uses
  the Rebook deep-link that pins the original service + provider. Read-only:
  stops at date/time selection.
website: vagaro.com
category: appointments
tags:
  - appointments
  - booking
  - beauty-wellness
  - rebook
  - authenticated
  - read-only
source: 'browserbase: agent-runtime 2026-08-12'
updated: '2026-08-12'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      No usable public API. A customer's appointment history sits behind the
      authenticated consumer app, and the support.vagaro.com docs that describe
      the flow are Zendesk-403'd to non-browser fetches. The browser app is the
      only reliable surface.
verified: false
proxies: false
---
# Rebook a Past Vagaro Appointment with the Same Provider

## Purpose

Given a signed-in Vagaro customer, re-book a previously completed appointment with the **same service provider** for a future date/time. The skill logs into the customer account, opens the appointment history, finds a past appointment, and uses Vagaro's built-in **Rebook** action — which deep-links to the original business's booking widget with the *same service and same provider preselected* — then selects a new future slot. This is a **stateful, authenticated** task: appointment history is gated behind a customer login and there is no public/API path to another person's booking history. **Read-only by default — stop at the date/time selection screen; do not click the final Book/Checkout/confirm button unless the caller explicitly authorizes a real booking.**

## When to Use

- "Book me another appointment with the same stylist/barber/therapist I saw last time."
- "Rebook my last haircut with {provider} for next week."
- A concierge/assistant re-scheduling a recurring service (nails, massage, lashes, personal training) with the same person at the same business.
- Any flow that needs to reach a business's booking widget with the prior provider + service already pinned, for a returning customer.

Do **not** use this for first-time bookings (no prior appointment to rebook) or to browse availability anonymously — that's a plain booking/availability skill and needs no login.

## Workflow

`recommended_method: browser` — this task is only possible through the authenticated consumer web app. Vagaro exposes no public API or unauthenticated deep-link for a customer's own appointment history, and the `support.vagaro.com` help pages that describe the flow are Zendesk-403'd to bots. A bare (non-stealth, non-proxied) Browserbase session is sufficient — the login page, business pages, and booking widget render cleanly with no Akamai/captcha.

**Credentials are mandatory.** Without the customer's Vagaro username/email + password (or a valid SSO session), the flow cannot start — `myaccount/appointments` redirects to `/login`. If no credentials are supplied, return `{"success": false, "reason": "auth_required"}` (see Expected Output).

1. **Start a session and log in.** Open `https://www.vagaro.com/login`. Fill `textbox: Username or Email` and `textbox: Password`, then click `button: Login`. (SSO buttons for Facebook/Google/Apple exist but require an interactive third-party session — prefer username/password.) Wait for the header to switch from a `Login` link to the account/profile menu.

2. **Open appointment history.** Navigate directly to `https://www.vagaro.com/myaccount/appointments` (also reachable via the profile dropdown → "Appointments"). This page lists **Upcoming** and **Past** appointments — switch to the **Past** view.

3. **Find the target past appointment.** Match on provider name + service + business. Each past appointment row exposes a **Rebook** action.

4. **Click "Rebook".** This deep-links into the original business's booking widget at `https://www.vagaro.com/{business-slug}/book-now` (observed canonical form `.../appointments/book-now`) with the **same service and same provider already selected** — this is the mechanism that guarantees "same provider." Confirm the provider's name appears in the booking header before proceeding.

5. **Select a future date/time.** Use the **Choose Date And Time** control (Vagaro lets you "Select Up To 5 Dates"), or the **First Available Time** button, to pick a future slot offered for that provider + service.

6. **Stop — read-only.** Capture the selected slot(s) and the pinned provider/service, and return them. **Do not** advance to the checkout/confirm step unless the caller explicitly authorized a real booking.

### Manual "same provider" fallback (when the Rebook button is unavailable)

If a past appointment row has no Rebook button (older records, cancelled/no-show items, or a business that changed its booking settings), reconstruct the booking manually:

1. Open the business page `https://www.vagaro.com/{business-slug}` (the business name is shown on the past appointment).
2. Open the **Staff** tab → find the same provider → click their **Book** action (pins the provider). URL becomes `/{business}/book-now` with the provider carried in the header.
3. Open the **Services** tab → click **Book Now** on the same service you had before (services are grouped by category with prices).
4. Pick a future date/time and stop, as in steps 5–6 above.

## Site-Specific Gotchas

- **Auth wall is the defining constraint.** `https://www.vagaro.com/myaccount/appointments` redirects unauthenticated requests to `/login` with an encoded return URL. There is NO way to see a customer's past appointments without their credentials/session. If none are provided, the honest outcome is `auth_required` — do not fabricate results.
- **Customer account route map** (menu links are `display:none` in HTML until logged in): `/myaccount/profile`, `/myaccount/appointments`, `/myaccount/products`, `/myaccount/bookmarks`, `/myaccount/points`, `/myaccount/reviews`, `/myaccount/gift`, `/myaccount/packages`, `/myaccount/memberships`, `/myaccount/invoices`, `/myaccount/payrollhistory`, `/myaccount/familyFriends`, `/myaccount/notification`, `/myaccount/paymentmethods`. Appointment history is `/myaccount/appointments`.
- **"Same provider" is pinned by the Rebook deep-link, not by a checkbox.** Rebook carries service + provider into `/{business}/book-now`. Always verify the provider name in the booking header after clicking — if the business later removed that provider, Vagaro may drop the pin and you must re-select on the Staff tab.
- **`/{slug}` is a business namespace.** Paths like `/appointments` resolve to a *business page* (e.g. "Eleven Ten Studio"), not a customer feature. Don't guess customer routes — customer features live under `/myaccount/*`.
- **No public API / no bot-readable docs.** The internal endpoints are behind the authenticated app; `support.vagaro.com` help articles return HTTP 403 to non-browser fetches (Zendesk anti-bot). Don't waste time trying to script an API rebook — confirmed unavailable.
- **Bare session is enough — do NOT add stealth by default.** The pre-run probe reported no anti-bot, and login/business/booking pages all rendered on a plain session (no `--verified`, no `--proxies`). Only escalate if a specific business page or the login POST starts returning challenges.
- **`browse snapshot` can return an empty tree** (it sometimes prints only the `browse` "Update available" banner). Recover with `browse get text body` + `browse get url` + `browse get title`, and re-issue the snapshot after `browse wait timeout 2000`.
- **Booking widget needs settling time.** After `browse wait load` on a business page, wait ~2–3s before interacting with the About/Staff/Services tabs or the date/time control.
- **READ-ONLY.** Vagaro's booking widget can lead to a real reservation and, for some businesses, a deposit/card charge. Never click the final Book/Checkout/confirm button unless the caller explicitly authorized a real booking.
- **SSO logins are impractical for automation.** Prefer Vagaro-native username/password; Facebook/Google/Apple require an interactive third-party auth session.

## Expected Output

```json
// Success — rebook prepared with the same provider, future slot selected, stopped before confirm
{
  "success": true,
  "business": "Eleven Ten Studio",
  "business_slug": "appointments",
  "provider": "Jaqueline Villalpando",
  "service": "Women's Haircut & Blow-Dry",
  "original_appointment_date": "2026-05-14",
  "selected_datetime": "2026-08-19T14:30:00-04:00",
  "booking_url": "https://www.vagaro.com/appointments/book-now",
  "provider_pinned": true,
  "confirmed": false,
  "notes": "Stopped at date/time selection; final Book/Checkout not clicked (read-only)."
}
```

```json
// No credentials / not logged in — appointment history is gated
{
  "success": false,
  "reason": "auth_required",
  "login_url": "https://www.vagaro.com/login",
  "history_url": "https://www.vagaro.com/myaccount/appointments",
  "notes": "Past appointments require a customer login; /myaccount/appointments redirects to /login when unauthenticated."
}
```

```json
// Logged in, but the requested past appointment/provider could not be found
{
  "success": false,
  "reason": "past_appointment_not_found",
  "searched_for": { "provider": "Jane Doe", "service": "Deep Tissue Massage" },
  "notes": "No matching row in Past appointments for this account."
}
```

```json
// Rebook unavailable and provider no longer offered by the business
{
  "success": false,
  "reason": "provider_unavailable",
  "business": "Eleven Ten Studio",
  "provider": "Jaqueline Villalpando",
  "notes": "Rebook deep-link dropped the provider and the Staff tab no longer lists them; cannot pin the same provider."
}
```
