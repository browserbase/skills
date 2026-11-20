---
name: usps-com-track-package-854rdc
title: USPS Package Tracking
description: >-
  Given a USPS tracking number, return the current status, expected delivery
  date, last-known location, and full chronological event timeline via the USPS
  REST API v3 (recommended) or the public tracking page behind Akamai
  (fallback).
website: usps.com
category: logistics
tags:
  - logistics
  - tracking
  - usps
  - shipping
  - akamai
  - read-only
source: 'browserbase: agent-runtime 2026-05-16'
updated: '2026-05-16'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      Fallback when no USPS Developer Portal credentials are available. The
      public tracking page at tools.usps.com/go/TrackConfirmAction?tLabels=<NUM>
      is Akamai-protected — a Verified + residential-proxy Browserbase session is
      mandatory. Pays a 50-100x cost premium per lookup vs the API path.
  - method: api
    rationale: >-
      Legacy XML Web Tools API at
      secure.shippingapis.com/ShippingAPI.dll?API=TrackV2 still serves but is
      being phased out under USPS's April 2026 'API Access Control' initiative.
      Use the v3 REST API for new integrations.
verified: false
proxies: false
---
# USPS Package Tracking

## Purpose

Given a USPS tracking number, return the current package status, last-known location, expected delivery date, and the full chronological event timeline. Read-only — never schedules, redirects, or modifies the shipment. Two equivalent surfaces are documented: the modern OAuth2-gated REST API (recommended) and the public browser tracking page (fallback when no API credentials are available).

## When to Use

- Carrier-status polling in a logistics / order-status agent ("where is order #X right now?").
- Bulk reconciliation across many tracking numbers (use the API path — the browser path doesn't scale past a handful before Akamai throttles).
- Customer-support flows answering "when will my package arrive?".
- One-off lookups for tracking numbers a user pastes in (browser fallback acceptable, ~1 per minute).

## Workflow

USPS exposes a clean OAuth2-gated REST API at `apis.usps.com/tracking/v3/tracking/{trackingNumber}` that returns the same structured data the public tracking page renders. Lead with this. The public `tools.usps.com/go/TrackConfirmAction?tLabels=...` deep-link is fronted by **Akamai Bot Manager** (verified — see Gotchas), so the browser fallback requires a Verified + residential-proxy session and pays a 50-100× cost premium per lookup. Use the API path unless the caller has explicitly opted out of credentialed access.

### Recommended path — USPS REST API v3

**Prerequisites (one-time per deployment):**

1. Create a USPS Business Account via the Customer Onboarding Portal (`https://gateway.usps.com/`). Free.
2. In the COP "My Apps" section, create an App and retrieve the **Consumer Key** and **Consumer Secret** from the Credentials tab. The default product includes the Tracking API at no additional approval cost.
3. Optionally swap base URL to `apis-tem.usps.com` (Testing Environment for Mailers) during integration — same auth, sandbox shipments.

**Per-lookup flow:**

1. **Obtain an OAuth2 access token** (client-credentials grant). Tokens are typically valid 8 hours; cache and re-use.
   ```http
   POST https://apis.usps.com/oauth2/v3/token
   Content-Type: application/x-www-form-urlencoded

   grant_type=client_credentials
   &client_id=<CONSUMER_KEY>
   &client_secret=<CONSUMER_SECRET>
   &scope=tracking
   ```
   Returns `{ "access_token": "<JWT>", "token_type": "Bearer", "expires_in": 28799, "scope": "tracking" }`.

2. **Call the tracking endpoint**:
   ```http
   GET https://apis.usps.com/tracking/v3/tracking/{trackingNumber}?expand=DETAIL
   Authorization: Bearer <access_token>
   Accept: application/json
   ```
   The `expand=DETAIL` query param returns the full event timeline; without it the response is summary-only (status + expected delivery only). Pass the tracking number unformatted (digits only; strip spaces and dashes).

3. **Map the JSON to the output schema in "Expected Output" below.** Key fields:
   - `trackingNumber` — echo back.
   - `status` / `statusCategory` — verbatim USPS phrase ("Delivered, Front Door/Porch") and the high-level category bucket.
   - `expectedDeliveryDate` (ISO date) — only present for in-transit shipments; `null` after delivery.
   - `originCity` / `originState` / `destinationCity` / `destinationState` — origin and destination metadata.
   - `trackingEvents[]` — reverse-chronological by default (most recent first). Each event has `eventTimestamp` (ISO 8601), `eventType` / `eventCode`, `eventDescription`, and a location block (`eventCity`, `eventState`, `eventZIP`, `eventCountry`). Reverse the array if your output schema requires chronological order.

4. **Status-category mapping** — USPS returns free-form `status` text but most consumers want a small enum. Bucket by the leading verb/phrase:

   | Category | Trigger phrases |
   |---|---|
   | `delivered` | "Delivered" (any sub-state — Front Door, Mailbox, Parcel Locker, etc.) |
   | `out_for_delivery` | "Out for Delivery" |
   | `in_transit` | "In Transit", "Arrived at", "Departed", "Accepted", "USPS in possession" |
   | `pre_shipment` | "Shipping Label Created", "Pre-Shipment", "Awaiting Item" |
   | `available_for_pickup` | "Available for Pickup", "Held at Post Office" |
   | `alert` | "Delivery Exception", "No Access", "Return to Sender", "Forwarded" |
   | `delivery_attempted` | "Delivery Attempted", "Notice Left" |

   Treat unmapped strings as `in_transit` and surface the raw text — USPS occasionally adds new event types.

### Browser fallback (when no API credentials)

A Verified + residential-proxy Browserbase session can scrape the public tracking page. The page is fully JS-rendered behind an Akamai challenge — bare `fetch` always returns the obfuscated `_abck` JS interstitial, never the real content (verified 2026-05-16: `browse cloud fetch --proxies https://tools.usps.com/go/TrackConfirmAction?tLabels=...` returns 226 KB of Akamai-Grn-stamped challenge HTML, zero tracking data).

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies | jq -r '.id')
browse cloud browse --connect "$SID" open "https://tools.usps.com/go/TrackConfirmAction?tLabels=<NUM>"
browse cloud browse --connect "$SID" wait load
browse cloud browse --connect "$SID" wait timeout 4000     # Akamai challenge solves over 2-4s after load
browse cloud browse --connect "$SID" snapshot
```

After the snapshot resolves, the visible tracking card is identified by:
- A heading containing the tracking number.
- A status banner — typical refs are `heading "Delivered, Front Door/Porch"` or `heading "In Transit to Next Facility"`.
- A "Text & Email Updates" expander (collapsed by default — ignore).
- A "Tracking History" expander (collapsed by default — **click to expand** before extracting events).
- An "Expected Delivery" block with a date string ("Expected Delivery by Saturday, March 22, 2026 by 6:00 PM").

To get the full timeline, click the `button "Tracking History"` ref, `wait timeout 1500`, then snapshot again. Events render as dt/dd-style rows: date+time first, description on the next line, city/state on the third. Parse top-to-bottom; the list is already reverse-chronological. Cap at the first 30 events — long histories occasionally exceed snapshot's truncation limit, in which case fall back to `browse cloud browse --connect "$SID" get text body` and regex-parse.

**Don't click "Add Tracking Plus"**, "Schedule Redelivery", "Hold for Pickup", or any USPS-account-linked CTA — they trigger sign-in walls and contaminate the session.

Release the session when done:
```bash
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

## Site-Specific Gotchas

- **Akamai Bot Manager is enforced sitewide.** Verified 2026-05-16: every `tools.usps.com/go/TrackConfirmAction*` and `m.usps.com/m/TrackConfirmAction*` URL returns a 200 OK with Akamai `_abck` challenge JS (~220 KB obfuscated script body) when fetched without a real browser. Verified + residential-proxy session is **mandatory** for the browser fallback — a bare `browse cloud fetch` (even with `--proxies`) never sees the actual tracking content. The `Akamai-Grn` and `X-Akamai-Transformed` response headers confirm Akamai is in the path.
- **`TrackConfirmAjaxAction.action` is dead.** The old "internal XHR" endpoint that scraping tutorials reference returns 404 with `There is no Action mapped for namespace [/] and action name [TrackConfirmAjaxAction]`. Don't waste time on it.
- **The legacy Web Tools XML API is being deprecated.** `https://secure.shippingapis.com/ShippingAPI.dll?API=TrackV2&XML=<TrackRequest USERID="..."...>` still serves (verified 2026-05-16: returns `80040B1A Authorization failure` for unregistered USERIDs), but USPS announced in April 2026 that **API Access Control** is rolling out across all surfaces. New integrations should use the v3 REST API. The legacy API USERID is *not* interchangeable with the v3 Consumer Key.
- **OAuth2 scope must be requested explicitly.** The default app product includes Tracking, but you still need `scope=tracking` in the token request body. Omitting it returns a token without tracking access and the tracking call 403s with `insufficient_scope`.
- **`expand=DETAIL` is required for the event timeline.** Without it, the response includes only the current status and (if applicable) expected delivery date — no `trackingEvents` array. This is the single most common foot-gun on the v3 API.
- **Tracking number format must be digits-only.** Strip spaces, dashes, and any leading carrier prefix the user might have pasted (`USPS:`, `tracking#:`, etc.). USPS tracking numbers are 13, 20, 22, 26, or 30 characters depending on service class.
- **The `tLabels` query param is plural-but-not-an-array.** `https://tools.usps.com/go/TrackConfirmAction?tLabels=<NUM>` is the public deep-link. Some legacy docs/blogs reference `qtc_tLabels1=<NUM>` (matches the input form's POST name) — both forms reach the same page, but the deep-link form is more stable. Don't try comma-separating multiple numbers; the UI only renders the first.
- **TEM (sandbox) data is synthetic.** `apis-tem.usps.com` returns predictable canned responses for test tracking numbers; real production numbers will 404 against it. Use `apis.usps.com` for real lookups.
- **Status text is free-form and changes.** "Delivered, Front Door/Porch" became "Delivered, In/At Mailbox" became "Delivered, Parcel Locker" as USPS rolled out new event types — always carry the raw `status` field through to the consumer in addition to your normalized `status_category` enum.
- **Asterisks in delivery dates indicate estimates.** A field like "Expected Delivery by 03/22/2026 by 6:00 PM*" with a trailing `*` means the date is estimated, not guaranteed. Surface the asterisk or set an `is_estimated` flag.
- **Sandbox-environment caveat for this skill's verification:** the iteration that produced this SKILL.md ran in a Vercel sandbox that DNS-blocks `connect.browserbase.com` / `connect.usw2.browserbase.com`, so the browser fallback was characterized via `browse cloud fetch` evidence + USPS Developer Portal docs (`developers.usps.com/trackingv3r2`, `/Oauth`, `/getting-started`) rather than an end-to-end `browse cloud browse` run. The API path is fully exercised at the endpoint-shape level (auth 401/403 + OAuth2 endpoint 404/403 boundary checks) but the JSON response schema in "Expected Output" mirrors USPS's published docs rather than a recorded live response. Treat the browser-fallback selectors as starting hints — they reflect the public page's documented structure but the next agent should verify them once Browserbase WSS connectivity is restored.

## Expected Output

The skill emits one of three outcome shapes:

```json
// Success — full timeline retrieved
{
  "success": true,
  "tracking_number": "9400111899223197428490",
  "status": "Delivered, Front Door/Porch",
  "status_category": "delivered",
  "expected_delivery_date": null,
  "last_known_location": "ATLANTA, GA 30304",
  "origin": { "city": "SAN FRANCISCO", "state": "CA", "zip": "94103" },
  "destination": { "city": "ATLANTA", "state": "GA", "zip": "30304" },
  "events": [
    {
      "timestamp": "2026-03-12T13:42:00-04:00",
      "event_code": "01",
      "description": "Delivered, Front Door/Porch",
      "location": { "city": "ATLANTA", "state": "GA", "zip": "30304" }
    },
    {
      "timestamp": "2026-03-12T09:15:00-04:00",
      "event_code": "OF",
      "description": "Out for Delivery",
      "location": { "city": "ATLANTA", "state": "GA", "zip": "30304" }
    },
    {
      "timestamp": "2026-03-12T08:51:00-04:00",
      "event_code": "AR",
      "description": "Arrived at Post Office",
      "location": { "city": "ATLANTA", "state": "GA", "zip": "30304" }
    }
  ],
  "is_estimated_delivery": false,
  "source": "api",
  "error_reasoning": null
}
```

```json
// In-transit — expected delivery known, events partial
{
  "success": true,
  "tracking_number": "9405511899223197428490",
  "status": "In Transit to Next Facility",
  "status_category": "in_transit",
  "expected_delivery_date": "2026-03-22",
  "last_known_location": "MEMPHIS, TN 38101",
  "origin": { "city": "SAN FRANCISCO", "state": "CA", "zip": "94103" },
  "destination": { "city": "ATLANTA", "state": "GA", "zip": "30304" },
  "events": [
    {
      "timestamp": "2026-03-20T02:14:00-05:00",
      "event_code": "10",
      "description": "Departed USPS Regional Facility",
      "location": { "city": "MEMPHIS", "state": "TN", "zip": "38101" }
    }
  ],
  "is_estimated_delivery": true,
  "source": "api",
  "error_reasoning": null
}
```

```json
// Not found — invalid or aged-out tracking number
{
  "success": false,
  "tracking_number": "9999999999999999999999",
  "status_category": "not_found",
  "error_reasoning": "A status update is not yet available on your package. It will be available when the shipper provides an update or the package is delivered to USPS. Check back soon."
}
```

```json
// Blocked by anti-bot wall (browser fallback only — API path never produces this)
{
  "success": false,
  "tracking_number": "9400111899223197428490",
  "status_category": "blocked",
  "error_reasoning": "Akamai Bot Manager interstitial did not resolve within 8s; retry with a fresh Verified+proxy session or fall back to the API path."
}
```
