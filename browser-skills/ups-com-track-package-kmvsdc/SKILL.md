---
name: ups-com-track-package-kmvsdc
title: UPS Package Tracking
description: >-
  Given a UPS tracking number, return the package's current status, last-known
  scan location, scheduled or estimated delivery date, signed-by name when
  delivered, and the full chronological event timeline (timestamp, location,
  status description). Read-only — drives www.ups.com/track behind Akamai Bot
  Manager.
website: ups.com
category: logistics
tags:
  - logistics
  - tracking
  - ups
  - shipping
  - akamai
  - read-only
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      UPS Developer API (onlinetools.ups.com/api/track/v1/details/{N}) returns
      the same data as JSON, but requires OAuth client_credentials provisioned
      at developer.ups.com. Use only if the caller already has
      UPS_CLIENT_ID/UPS_CLIENT_SECRET — there is no zero-config API path.
  - method: browser
    rationale: >-
      The public tracking page www.ups.com/track is the only zero-config
      surface. Akamai Bot Manager + reCAPTCHA gating makes Verified + residential
      proxy mandatory; the internal AJAX endpoints
      (webapis.pkginfo.ups.com/track, www.ups.com/track/api/Track/GetStatus) are
      confirmed dead-ends from the URL layer alone (verified 2026-05-18).
verified: true
proxies: true
---
# UPS Package Tracking

## Purpose

Given a UPS tracking number (or "InfoNotice" door-tag number), return the package's current status, last-known scan location, scheduled or estimated delivery date, signed-by name when delivered, and the full chronological event timeline (timestamp, location, status description) — by driving `https://www.ups.com/track`. Read-only; never edits delivery preferences, signs up for "UPS My Choice", or interacts with the booking surface.

## When to Use

- "Where is my UPS package, tracking number `1Z…`?"
- Order-status agents reconciling shipper-confirmation emails against current delivery state.
- Delivery-monitoring jobs polling for `Out for Delivery` → `Delivered` transitions.
- Recovering the signed-by name and delivery timestamp after the fact.
- Any tracking flow that does **not** have access to UPS Developer API OAuth credentials (which require an enrolled UPS account — see Gotchas).

## Workflow

UPS exposes three tracking surfaces; only one is usable without merchant credentials:

| Surface | Reachable? | Notes |
|---|---|---|
| `https://www.ups.com/track?tracknum={N}` (public web UI) | **Yes** — Akamai-gated, requires Verified + residential proxy | The only zero-config surface. **This is the recommended path.** |
| UPS Developer API (`https://onlinetools.ups.com/api/track/v1/details/{N}`) | OAuth client-credentials only | Free tier exists (≤ 250 calls/day) but requires app registration at `developer.ups.com` — not zero-config. Use only if you already hold a `client_id`/`client_secret`. |
| Internal AJAX (`webapis.pkginfo.ups.com/track` POST, `www.ups.com/track/api/Track/GetStatus`) | **No** — confirmed dead-ends | Both require a fully-warmed Akamai cookie jar (`_abck`, `bm_sz`, `bm_sc`, `AKA_A2`) AND a CSRF token bound to the SPA's bootstrap. Posting cookieless from `browse cloud fetch --proxies` returns `500 Internal Server Error` (pkginfo) or `302 → /error.page` (GetStatus). Verified 2026-05-18. Don't waste time on these. |

### Recommended path: drive the public tracking page

1. **Create a Verified + residential-proxy session.** Both `--verified` and `--proxies` are mandatory — a bare session lands on the Akamai Bot Manager challenge page (`<div id="sec-if-cpt-container">`, "Powered and protected by Akamai"), which never resolves to tracking content.

   ```bash
   SID=$(browse cloud sessions create --keep-alive --verified --proxies --region us-east-1 \
         | python3 -c 'import json,sys;print(json.load(sys.stdin)["id"])')
   export BROWSE_SESSION="$SID"
   ```

2. **Open the canonical tracking URL** with `requester=ST` (the "self-tracking" referrer that suppresses upsell modals):

   ```bash
   browse open --remote \
     "https://www.ups.com/track?loc=en_US&tracknum=${TN}&requester=ST/"
   browse wait load --remote
   browse wait timeout 4000 --remote      # Angular SPA renders progressively
   ```

   The page is an Angular SPA (`/track/client/main.*.js`). `wait load` fires on the shell HTML; the tracking-summary block paints 1–4 seconds later. **Skip the wait and you snapshot an empty `<app-root>`.**

3. **Snapshot and branch on the rendered DOM:**

   ```bash
   browse snapshot --remote > /tmp/snap.txt
   ```

   Match one of the outcomes below, in this order (first match wins):

   | Marker text in snapshot | Outcome |
   |---|---|
   | `heading: Delivered` + sibling time with `Delivered On` + `Signed by:` line | **`delivered`** |
   | `heading: Out For Delivery Today` or `Out for Delivery` + estimated delivery time window | **`out_for_delivery`** |
   | `heading: On the Way` / `In Transit` + "Estimated Delivery Date" date | **`in_transit`** |
   | `heading: Label Created` or "Shipper created a label, UPS has not received the package yet" | **`pre_transit`** |
   | `heading: Delivery Attempted` or "We were unable to deliver your package" | **`exception`** |
   | `heading: Returned to Sender` | **`returned`** |
   | `text: "We are sorry. We could not locate the information"` or "Could not find tracking info" | **`not_found`** |
   | `text: "Please enter a valid tracking number"` or page bounce back to the search form | **`invalid_number`** |

4. **Extract the structured fields** from the rendered DOM (all stable selectors observed across 2024–2026 UPS UI revisions; verify against the live snapshot before emitting):

   - **Status banner**: `[data-spec="header-status-text"]` or `h1.heading-1` inside `<ups-tracking-summary>`.
   - **Estimated delivery date**: `[data-spec="delivery-date-text"]` (also rendered as a date in the format `Friday, May 22` — parse with the current year inferred from local time + a roll-forward if the parsed date is more than 14 days in the past).
   - **Delivery time window** (for `out_for_delivery`): `[data-spec="delivery-time-text"]` ("by 7:00 P.M.").
   - **Signed-by** (for `delivered`): in the right-hand "Proof of Delivery" rail, label text `"Signed By:"` followed by a `<span>` with the recipient surname.
   - **Last-known location**: top of the "Shipment Progress" rail, first item under `[data-spec="activity-list"]`; format `"{City}, {State} {ZIP}, {Country}"`.
   - **Event timeline**: each `<li>` (or `<div role="listitem">`) inside `[data-spec="activity-list"]` is one scan event. Per event, extract:
     - `timestamp`: parse from the `<time>` element's `datetime` attribute when present, else from text in the format `"{Day-name}, {Month} {DD}, {YYYY} at {HH}:{MM} {AM/PM}"`. Normalize to ISO 8601 with UPS's local-time semantics (UPS reports the *local time at the scan location*, not UTC — preserve as naïve local + carry the location's IANA zone if you can resolve it from the city/state).
     - `location`: same `{City}, {State} {ZIP}, {Country}` shape; may be empty string for "Origin Scan" or "Order Processed" events that occur pre-pickup.
     - `description`: the status text line ("Departed from Facility", "Arrived at Facility", "Out For Delivery", "Delivered", "Exception – Address Information Required", etc.).

5. **Release the session.**

   ```bash
   curl -sS -X POST "https://api.browserbase.com/v1/sessions/$SID" \
     -H "X-BB-API-Key: $BROWSERBASE_API_KEY" \
     -H "Content-Type: application/json" \
     -d "{\"projectId\":\"$BB_PROJECT_ID\",\"status\":\"REQUEST_RELEASE\"}"
   ```

   (The `browse cloud sessions update --status` CLI rejects the `status` field as of `browse@0.7.1`; the raw API call above is the working path. Filed bug: `bb-cli#status-update-rejects-field`.)

### Browser-fallback shape if Akamai challenge doesn't auto-clear

If the snapshot still shows `<div id="sec-if-cpt-container">` after `wait load + wait timeout 4000`, the Bot Manager challenge didn't auto-solve. Recovery sequence (in order):

1. `browse wait timeout 8000 --remote` (challenge can take up to ~10s on slow proxy egress).
2. Re-snapshot. Akamai often clears after a single additional poll.
3. If still challenged, navigate to `https://www.ups.com/us/en/home` first (cheaper page, warms `_abck`), wait 2s, then re-navigate to the tracking URL.
4. If still challenged after step 3, the proxy IP is probably on Akamai's bad-reputation list — destroy and recreate the session (fresh proxy IP) and retry once. Do **not** retry more than twice from the same skill invocation — Akamai will escalate to the visible interstitial.

## Site-Specific Gotchas

- **Akamai Bot Manager + service-worker challenge is mandatory** to clear. Bare `browse cloud fetch` (no browser JS) returns the challenge HTML uniformly across `www.ups.com/track`, `wwwapps.ups.com/WebTracking/track`, and `m.ups.com/mobile/track/details` (all confirmed 2026-05-18). `--verified --proxies` on a real browser session is the only viable path.
- **The `requester=ST` query param matters**: without it, the page sometimes renders a UPS My Choice login wall or upsell modal that occludes the tracking summary. `requester=ST/` (note trailing slash — that's how UPS's own email links format it) is the "shipper-self-tracking" mode and renders the tracking summary cleanly for unauthenticated visitors. Other observed `requester` values: `WT` (web tracker, default), `IT` (international tracking), `NT` (My Choice).
- **Don't waste time on the internal AJAX/JSON endpoints.** Three were probed end-to-end on 2026-05-18:
  - `POST https://webapis.pkginfo.ups.com/track` — cookieless GET returns `500 Internal Server Error`; a POST without a fully-warmed Akamai cookie jar (`_abck` + `bm_sz` + `bm_sc` + `AKA_A2`) and a CSRF nonce sourced from the SPA bootstrap is rejected the same way.
  - `GET https://www.ups.com/track/api/Track/GetStatus` — `302 → /error.page` regardless of query params.
  - `GET https://webapis.ups.com/track/api/Track/GetStatus` — returns `200` but the body is the Angular SPA HTML shell, not JSON. (This is the *application* host, not the data host — the route is a SPA fallback.)
- **The JS bundle at `/track/client/main.*.js` returns `403 Forbidden`** when fetched without a warm page session. You cannot statically scrape the bundle to discover the AJAX endpoint shape — Akamai signs script delivery by cookie. Use the rendered DOM, not the source.
- **reCAPTCHA v3 site-key is embedded** (`<meta name="stapp-cap-site-key" content="6LeGXsYiAAAAALO5vceT2N-DmLNfQotjbGM27a8Z">`). UPS does *not* surface a visible reCAPTCHA on every page load — it's invoked only when behavioral signals are suspicious. If a reCAPTCHA iframe surfaces after navigation, the session has been flagged: rotate proxy IP rather than trying to solve.
- **Tracking numbers vary in length and prefix**: `1Z`-prefixed (18 chars) is the standard ground/air shipment number. Other valid formats accepted at the same URL: 9-digit Mail Innovations (`MI...`), 12-digit InfoNotice/door-tag, 7+ char freight pro number, 10-digit reference number (requires shipper account). Don't pre-validate format too strictly — let UPS's own `invalid_number` outcome arbitrate.
- **UPS reports scan times in local time at the scan location**, not UTC. A "Departed from Facility — Louisville, KY — 11:47 P.M." can be followed by "Arrived at Facility — Chicago, IL — 12:23 A.M." (the next calendar day in CT but only 36 minutes later). Don't naïvely sort by parsed string-time — preserve the location-paired local timestamp and convert to UTC only if your downstream consumer needs absolute ordering.
- **Multiple-piece shipments share a master tracking number.** When the input is the master, the page renders a list of child shipments — branch to a `multi_piece` outcome (or `ambiguous`) and emit the child numbers rather than guessing which one the caller meant.
- **InfoNotice numbers** (12-digit, given on left-behind door tags) work in the same input field but the rendered page differs — there's no shipper info, just status + next-attempt date. The skill should accept them but emit a slightly thinner JSON (no `signed_by` will ever surface for InfoNotice-initiated lookups even after delivery).
- **UPS Developer API exists but is OAuth-gated.** If the caller has provisioned `UPS_CLIENT_ID` + `UPS_CLIENT_SECRET`, the JSON path is faster and more reliable: `POST https://onlinetools.ups.com/security/v1/oauth/token` → bearer token → `GET https://onlinetools.ups.com/api/track/v1/details/{trackingNumber}?locale=en_US&returnSignature=true`. Returned `trackResponse.shipment[].package[].activity[]` maps 1:1 to the rendered timeline. Free tier ≤ 250 calls/day. Do not bake credentials into the skill — pass via env or surface a clear "credentials missing → falling back to browser" log line.
- **Read-only.** Never click "Sign up for UPS My Choice", "Change Delivery", "Authorize Driver to Leave", "Hold for Pickup", or any other action buttons. The skill stops at the rendered tracking detail.
- **Page caches aggressively at the edge** (`Cache-Control: no-store` on the SPA shell but the data-fetch behind it is short-TTL'd). Two consecutive loads within ~30s for the same tracking number return identical timestamps even after a real scan event lands. For polling, hold to ≥ 60s between requests per tracking number.

## Expected Output

Seven outcome shapes. Every shape carries `success`, `outcome`, and `tracking_number`. The data fields are populated per outcome.

```json
// 1. Delivered
{
  "success": true,
  "outcome": "delivered",
  "tracking_number": "1Z6Y34W90305161551",
  "service": "UPS Ground",
  "status_text": "Delivered",
  "delivered_at_local": "2026-05-16T14:32:00",
  "delivered_at_location_zone": "America/Los_Angeles",
  "delivered_at_location": {
    "city": "San Francisco",
    "state": "CA",
    "postal_code": "94107",
    "country": "US"
  },
  "signed_by": "HERNANDEZ",
  "delivery_location_description": "Front Door",
  "events": [
    { "timestamp_local": "2026-05-16T14:32:00", "location": "San Francisco, CA 94107, US", "description": "Delivered" },
    { "timestamp_local": "2026-05-16T08:17:00", "location": "San Francisco, CA, US", "description": "Out For Delivery" },
    { "timestamp_local": "2026-05-16T05:54:00", "location": "San Francisco, CA, US", "description": "Arrived at Facility" }
    /* …full chronological list, newest-first as rendered… */
  ]
}

// 2. Out for Delivery (today)
{
  "success": true,
  "outcome": "out_for_delivery",
  "tracking_number": "1Z…",
  "service": "UPS 2nd Day Air",
  "status_text": "Out For Delivery Today",
  "estimated_delivery_date_local": "2026-05-18",
  "estimated_delivery_window": "by 7:00 P.M.",
  "last_scan_at_local": "2026-05-18T07:42:00",
  "last_scan_location": "Oakland, CA, US",
  "events": [ /* … */ ]
}

// 3. In Transit
{
  "success": true,
  "outcome": "in_transit",
  "tracking_number": "1Z…",
  "service": "UPS Ground",
  "status_text": "On the Way",
  "estimated_delivery_date_local": "2026-05-21",
  "estimated_delivery_window": null,
  "last_scan_at_local": "2026-05-18T03:11:00",
  "last_scan_location": "Mesquite, TX 75149, US",
  "events": [ /* … */ ]
}

// 4. Pre-Transit (label created, not yet picked up)
{
  "success": true,
  "outcome": "pre_transit",
  "tracking_number": "1Z…",
  "status_text": "Label Created",
  "estimated_delivery_date_local": null,
  "label_created_at_local": "2026-05-17T16:08:00",
  "events": [
    { "timestamp_local": "2026-05-17T16:08:00", "location": "", "description": "Shipper created a label, UPS has not received the package yet." }
  ]
}

// 5. Exception / Delivery Attempted
{
  "success": true,
  "outcome": "exception",
  "tracking_number": "1Z…",
  "status_text": "Delivery Attempted",
  "reason": "Address Information Required",
  "next_attempt_date_local": "2026-05-19",
  "last_scan_at_local": "2026-05-18T14:11:00",
  "last_scan_location": "Phoenix, AZ, US",
  "events": [ /* … */ ]
}

// 6. Returned to Sender
{
  "success": true,
  "outcome": "returned",
  "tracking_number": "1Z…",
  "status_text": "Returned to Sender",
  "reason": "Recipient Refused Package",
  "events": [ /* … */ ]
}

// 7. Not Found / Invalid
{
  "success": false,
  "outcome": "not_found",          // or "invalid_number"
  "tracking_number": "1Z00000000000000",
  "message": "We are sorry. We could not locate the information for the tracking number you have entered. Please check the number and try again."
}
```

For **multi-piece master numbers**, return:

```json
{
  "success": false,
  "outcome": "multi_piece",
  "tracking_number": "1Z…MASTER…",
  "child_tracking_numbers": ["1Z…001", "1Z…002", "1Z…003"],
  "message": "This is a master tracking number for a multi-piece shipment. Re-query with one of the child numbers."
}
```
