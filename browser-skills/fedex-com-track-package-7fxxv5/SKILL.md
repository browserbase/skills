---
name: fedex-com-track-package-7fxxv5
title: FedEx Package Tracking
description: >-
  Track a FedEx package by tracking number and return current status, last-known
  location, scheduled/estimated delivery window, service type, signed-by name,
  and the full chronological scan-event timeline. Read-only — never schedules,
  holds, or modifies a shipment.
website: fedex.com
category: logistics
tags:
  - logistics
  - tracking
  - fedex
  - shipping
  - oauth2
  - akamai
  - read-only
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: api
alternative_methods: []
verified: true
proxies: true
---
# FedEx Package Tracking

## Purpose

Given a FedEx tracking number, return the package's **current status**, **last-known location**, **scheduled or estimated delivery date / time window**, **service type** (Ground / Express / Home Delivery / Ground Economy / Freight / International), **signed-by name** when delivered, and the **full chronological event timeline** (timestamp, location, status description). Read-only — never schedules, holds, redirects, or modifies a shipment.

## When to Use

- Customer-facing "where is my package?" lookups.
- Logistics monitoring dashboards (e.g., trigger a downstream workflow when status flips to `DELIVERED` or `OUT_FOR_DELIVERY`).
- ETA arbitration across multiple carriers (combine with UPS / USPS / DHL skills).
- Anywhere you'd otherwise scrape `fedex.com/fedextrack` — the official Track API is faster, structurally typed, and not gated by Akamai.

## Workflow

FedEx has two viable surfaces. **Lead with the official Track API** at `apis.fedex.com/track/v1/trackingnumbers` (OAuth2, free developer tier). The public web flow at `fedex.com/fedextrack/?trknbr=...` is a fully JS-rendered SPA behind Akamai and pays a 5–15× cost premium per tracking number; use it only when API credentials are unavailable. There is **no public unauthenticated JSON endpoint** — the internal `/trackingCal/track` XHR used by the web UI is gated by Akamai session cookies and will 403/404 to cookieless callers (verified: GET returns `FedEx Page Not Found`; the JS bundle at `/wtrk/track/main-*.js` exposes the path as constant `WTRK_ENDPOINTS.TRKC` but it is XHR-only).

### Primary path — Track API (recommended)

1. **Obtain credentials once.** Register at `developer.fedex.com`, create a Track API project, and capture `client_id` + `client_secret`. The same credentials work for both sandbox (`apis-sandbox.fedex.com`) and production (`apis.fedex.com`) once the project is approved; sandbox is open immediately, production requires moving the project to Production state on the portal.

2. **Mint an access token** (cache for ~58 minutes; the token TTL is 60 min):
   ```
   POST https://apis.fedex.com/oauth/token
   Content-Type: application/x-www-form-urlencoded

   grant_type=client_credentials&client_id={ID}&client_secret={SECRET}
   ```
   Response: `{"access_token":"...","token_type":"bearer","expires_in":3600,"scope":"CXS"}`. Returns 405 on GET (verified) and 401 with `NOT.AUTHORIZED.ERROR` on bad creds.

3. **Call the tracking endpoint**:
   ```
   POST https://apis.fedex.com/track/v1/trackingnumbers
   Authorization: Bearer {access_token}
   Content-Type: application/json
   X-locale: en_US

   {
     "includeDetailedScans": true,
     "trackingInfo": [
       { "trackingNumberInfo": { "trackingNumber": "{NUMBER}" } }
     ]
   }
   ```
   Up to 30 tracking numbers per call. `includeDetailedScans: true` is what makes `scanEvents[]` populated — without it you get only the latest status.

4. **Parse the response.** Tracking data lives at `output.completeTrackResults[i].trackResults[j]`. The fields that map to the requested output:
   - **Current status** — `latestStatusDetail.code` (`DL`=delivered, `OD`=out for delivery, `IT`=in transit, `PU`=picked up, `OC`=order created, `SE`=shipment exception, `CA`=canceled) and `latestStatusDetail.description` for user-facing text. `latestStatusDetail.statusByLocale` is the localized version.
   - **Last-known location** — `latestStatusDetail.scanLocation` (object: `city`, `stateOrProvinceCode`, `countryCode`) or the most recent `scanEvents[0].scanLocation`. `scanEvents[]` is sorted newest-first.
   - **Scheduled / estimated delivery** — `estimatedDeliveryTimeWindow.window.{begins,ends}` (ISO timestamps; recipients in US/CA/BE/DE/NL on Express/Ground/Home Delivery). Falls back to `standardTransitTimeWindow.window.ends` or `dateAndTimes[].dateTime` where `dateAndTimes[].type === "ESTIMATED_DELIVERY"` or `"ACTUAL_DELIVERY"`.
   - **Service type** — `serviceDetail.type` (e.g. `GROUND_HOME_DELIVERY`, `FEDEX_GROUND`, `FEDEX_EXPRESS_SAVER`, `PRIORITY_OVERNIGHT`, `INTERNATIONAL_PRIORITY`, `FEDEX_FREIGHT_ECONOMY`) and `serviceDetail.description` for the marketing name. SmartPost is now `GROUND_ECONOMY` post-rebrand.
   - **Signed-by name** — `deliveryDetails.receivedByName` when status is `DL`. Also check `deliveryDetails.signatureType` (`DIRECT`, `INDIRECT`, `ADULT`, `NO_SIGNATURE_REQUIRED`); when `NO_SIGNATURE_REQUIRED`, `receivedByName` is typically null even though the package is delivered.
   - **Event timeline** — `scanEvents[]` array. Each entry: `date` (ISO), `eventType` (2-letter code), `eventDescription` (user-facing), `scanLocation.{city,stateOrProvinceCode,countryCode,postalCode}`, optional `exceptionCode` / `exceptionDescription`, and `delayDetail.{status,type,subType}` when delayed (`status` ∈ `ON_TIME` / `EARLY` / `DELAYED`).

5. **Surface error states** from the response:
   - `errors[]` at the top level of the request → transport-level error (auth, validation, rate limit).
   - `output.alerts[]` with `alertType: "NOTE"` and code like `TRACKING.DATA.NOTFOUND.404` → tracking number not found (or too old; FedEx purges most numbers after ~18 months).
   - `output.completeTrackResults[].trackResults[].error` → per-tracking-number error (invalid format, retired number, etc.).
   - `latestStatusDetail.statusByLocale === "Label created"` with no `scanEvents` → label printed but package not yet picked up.

### Browser fallback

Use only when API credentials are unavailable. **Verified + residential proxy mandatory** — fedex.com is Akamai-fronted; bare sessions get Access-Denied HTML. Cost is 5–15× the API path because the entire tracking detail UI renders client-side after the XHR resolves; you cannot read tracking data from the initial HTML (verified: zero hits for the tracking number in the 56KB HTML body returned by direct GET).

```bash
SID=$(bb sessions create --keep-alive --verified --proxies | jq -r '.id')

browse --connect "$SID" open "https://www.fedex.com/fedextrack/?trknbr={NUMBER}"
browse --connect "$SID" wait load
browse --connect "$SID" wait timeout 4000      # XHR-driven render is 1–3s after `load`

# Detail view — single tracking number, valid, single shipment:
#   URL contains /apps/wtrk/detailedtracking
#   Snapshot exposes:
#     - heading: "<status>" (e.g. "Delivered", "On the way", "Pending")
#     - subheading: "<service type> · <weight>"
#     - "Scheduled delivery" or "Delivered" date+time row
#     - "Signed for by:" row (when delivered + signature captured)
#     - "Travel history" / "Shipment facts" expanders → click each to enumerate events

browse --connect "$SID" snapshot                 # parse status, dates, signature
browse --connect "$SID" click '@<travel-history-toggle>'   # expand timeline
browse --connect "$SID" snapshot                 # extract scan events

bb sessions update "$SID" --status REQUEST_RELEASE
```

Branch on the SPA route after navigation (read `browse --connect "$SID" get url`):

| URL fragment after navigation | Outcome |
|---|---|
| `/apps/wtrk/detailedtracking` | success — single shipment, parse detail |
| `/apps/wtrk/multitrkidsummary` or `/summary` | success — multi-shipment, iterate cards |
| `/apps/wtrk/multitrkidnotfound` or `/no-results-found` | tracking number not found |
| `/duplicate-results` | ambiguous — multiple shipments share the number, requires `trkqual` disambiguator |
| `/system-error` | FedEx backend error; retry with a fresh session |
| `/guestAuthentication` or `/howtoproceed` | private shipment — recipient ZIP + address verification required (out of scope for read-only) |

## Site-Specific Gotchas

- **No public unauthenticated JSON API.** `apis.fedex.com/track/v1/trackingnumbers` requires OAuth2 (returns 401 without `Authorization: Bearer ...`). The internal `/trackingCal/track` XHR used by the web UI is bound to Akamai session cookies acquired through a real page load — cookieless POST returns 403/404 (GET → "FedEx Page Not Found", verified). Don't waste cycles trying to call `/trackingCal/track` from curl.
- **Akamai protection on every fedex.com surface.** Cookies set on first load: `_abck`, `ak_bmsc`, `bm_mi`, `bm_sz`, `fdx_cbid`, `fdx_bman`, `Rbt`, `xacc`, `siteDC`. A bare-cookie session gets 403 / Access-Denied HTML for browser flows. Always use `--verified --proxies`.
- **The tracking page is a JS SPA, not SSR.** GET on `/fedextrack/?trknbr=...` returns ~56KB of HTML shell + Angular bundle URLs at `/wtrk/track/main-*.js` — zero tracking data is in the HTML body. Wait at least 3–4 seconds after `wait load` before snapshotting; the XHR-driven render fires 1–3s after `load`.
- **Use `trknbr=` not `trackingnumber=`.** Both are accepted but the JS canonicalizes to `trknbr`; the alt form sometimes triggers a redirect through the landing page that loses session continuity.
- **16-character tracking numbers route to POD-order tracking.** The JS guard in `chunk-PA2U5XJF` redirects `tracking_number.length === 16 && action === "track"` to `appConfig.podOrderTrackingUrl` — these are FedEx Delivery Manager confirmation codes, not standard tracking numbers, and require a different flow. Standard FedEx tracking numbers are 12 (Express), 15 (Ground), or 22 digits (SmartPost / Ground Economy).
- **Multi-tracking via comma**: `trknbr=A,B,C` lands on `/apps/wtrk/multitrkidsummary` with one card per shipment — useful for batched lookups, but each card shows summary only (status + ETA); to get full timeline you must click into each.
- **`trackingQualifier` disambiguates duplicates.** Some FedEx services (especially Freight and some Express returns) reuse tracking numbers across years. If the API returns multiple results or the browser lands on `/duplicate-results`, you must pass `trkqual=` (URL) or `trackingNumberInfo.trackingNumberUniqueId` (API) to pin to one shipment. The qualifier is opaque; either accept all duplicates and let the caller pick, or pin the most recent by `dateAndTimes[type=SHIP].dateTime`.
- **Private / authenticated shipments**: error codes `TRACKING.AUTHORIZATION.ERROR` and `TRACKING.AUTHENTICATEDDELIVERY.ERROR` (extracted from the JS bundle) mean the shipper marked the shipment private — the API returns no scan events, only an auth-required note. Recipient ZIP verification is the only unlock and is out of scope for a read-only skill; report as `success: false, reason: "authentication_required"`.
- **`includeDetailedScans` defaults to false.** A response with only `latestStatusDetail` and no `scanEvents[]` means you forgot the flag — re-request with `includeDetailedScans: true`.
- **`scanEvents[]` is sorted newest-first.** Don't assume chronological; reverse it for a human-readable timeline.
- **Estimated Delivery Time Window (EDTW) is regional.** Only populated for packages destined to US / CA / BE / DE / NL on Express, Ground, or Home Delivery. International, Freight, and SmartPost / Ground Economy will typically lack `estimatedDeliveryTimeWindow`; fall back to `standardTransitTimeWindow` or `dateAndTimes[type=ESTIMATED_DELIVERY]`.
- **Service type rebrand**: `SMART_POST` is now `GROUND_ECONOMY` in the API. Some older records still emit `SMART_POST` in `serviceDetail.type` — treat both as the same family. Freight is `FEDEX_FREIGHT_PRIORITY` / `FEDEX_FREIGHT_ECONOMY` (no scan events for many freight shipments — the response leans on `dateAndTimes` only).
- **`signedByName` only for direct-signature services.** `deliveryDetails.receivedByName` is null when `signatureType` is `NO_SIGNATURE_REQUIRED` even though the package is delivered — this is not an error; emit `signedBy: null` and `signatureType: "NO_SIGNATURE_REQUIRED"` together.
- **OAuth token caching.** Tokens expire in 3600s. Cache and reuse; don't mint per request — FedEx rate-limits OAuth aggressively (sandbox is more lenient than prod, but neither will tolerate a fresh token per tracking call at scale).
- **Rate limits**: production Track API caps at ~10 RPS per developer account; bursts above that return 429. Sandbox is much lower. Batch up to 30 numbers per call instead of fanning out.
- **Retention**: tracking data is typically purged after 18 months. Calls for older numbers return `TRACKING.DATA.NOTFOUND.404` even if the package was real and delivered. The web UI renders this as a "Historical Tracking" / "We don't have any information" panel.
- **`apis-sandbox.fedex.com` exists and is open immediately** (verified: 405 on GET `/oauth/token` with the same Layer7 gateway as prod). Use it for development; tracking numbers `123456789012`, `111111111111`, and `999999999999` are the documented sandbox test numbers covering in-transit / delivered / exception states.

## Expected Output

Single shipment, delivered, with signature:

```json
{
  "success": true,
  "trackingNumber": "394002115586",
  "trackingQualifier": "20260514000000",
  "carrier": "FedEx",
  "serviceType": "FEDEX_GROUND",
  "serviceDescription": "FedEx Ground",
  "status": {
    "code": "DL",
    "description": "Delivered",
    "statusByLocale": "Delivered"
  },
  "lastKnownLocation": {
    "city": "MEMPHIS",
    "stateOrProvinceCode": "TN",
    "countryCode": "US"
  },
  "scheduledDelivery": {
    "estimatedWindow": { "begins": "2026-05-15T08:00:00", "ends": "2026-05-15T20:00:00" },
    "actualDelivery": "2026-05-15T14:32:00"
  },
  "signature": {
    "signedBy": "J SMITH",
    "signatureType": "INDIRECT"
  },
  "events": [
    { "timestamp": "2026-05-15T14:32:00", "city": "MEMPHIS", "stateOrProvinceCode": "TN", "countryCode": "US", "eventType": "DL", "description": "Delivered" },
    { "timestamp": "2026-05-15T08:14:00", "city": "MEMPHIS", "stateOrProvinceCode": "TN", "countryCode": "US", "eventType": "OD", "description": "On FedEx vehicle for delivery" },
    { "timestamp": "2026-05-15T05:42:00", "city": "MEMPHIS", "stateOrProvinceCode": "TN", "countryCode": "US", "eventType": "AR", "description": "At local FedEx facility" },
    { "timestamp": "2026-05-14T22:18:00", "city": "OLIVE BRANCH", "stateOrProvinceCode": "MS", "countryCode": "US", "eventType": "DP", "description": "Departed FedEx hub" }
  ]
}
```

In-transit, no signature yet, EDTW present:

```json
{
  "success": true,
  "trackingNumber": "770000000000",
  "carrier": "FedEx",
  "serviceType": "FEDEX_EXPRESS_SAVER",
  "serviceDescription": "FedEx Express Saver",
  "status": { "code": "IT", "description": "In transit", "statusByLocale": "On the way" },
  "lastKnownLocation": { "city": "INDIANAPOLIS", "stateOrProvinceCode": "IN", "countryCode": "US" },
  "scheduledDelivery": {
    "estimatedWindow": { "begins": "2026-05-19T10:00:00", "ends": "2026-05-19T16:00:00" }
  },
  "signature": null,
  "events": [
    { "timestamp": "2026-05-18T14:02:00", "city": "INDIANAPOLIS", "stateOrProvinceCode": "IN", "countryCode": "US", "eventType": "AR", "description": "Arrived at FedEx hub" },
    { "timestamp": "2026-05-18T03:11:00", "city": "MEMPHIS", "stateOrProvinceCode": "TN", "countryCode": "US", "eventType": "DP", "description": "Departed FedEx hub" }
  ]
}
```

Delayed (weather), still in transit:

```json
{
  "success": true,
  "trackingNumber": "880000000000",
  "carrier": "FedEx",
  "serviceType": "FEDEX_GROUND",
  "status": { "code": "IT", "description": "In transit", "statusByLocale": "Delay" },
  "delayDetail": { "status": "DELAYED", "type": "WEATHER", "subType": "SNOW" },
  "lastKnownLocation": { "city": "BUFFALO", "stateOrProvinceCode": "NY", "countryCode": "US" },
  "scheduledDelivery": { "estimatedWindow": null },
  "signature": null,
  "events": [
    { "timestamp": "2026-05-18T09:00:00", "city": "BUFFALO", "stateOrProvinceCode": "NY", "countryCode": "US", "eventType": "DE", "description": "Delay – Weather (Snow)" }
  ]
}
```

Not found / retired:

```json
{
  "success": false,
  "reason": "tracking_number_not_found",
  "trackingNumber": "123456789012",
  "detail": "TRACKING.DATA.NOTFOUND.404 — number unknown to FedEx or older than the 18-month retention window."
}
```

Private / authentication-required shipment:

```json
{
  "success": false,
  "reason": "authentication_required",
  "trackingNumber": "770000111111",
  "detail": "Shipper marked this shipment private. Recipient ZIP verification required; read-only skill cannot unlock."
}
```
