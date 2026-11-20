---
name: dhl-com-track-shipment-18m2jq
title: DHL Shipment Tracking
description: >-
  Track any DHL shipment (Express, Parcel, eCommerce, Global Forwarding) by
  tracking number and return current status, handler, origin, destination,
  last-update timestamp, and the full chronological event timeline.
website: dhl.com
category: logistics
tags:
  - logistics
  - tracking
  - shipping
  - dhl
  - parcel
  - akamai
source: 'browserbase: agent-runtime 2026-05-20'
updated: '2026-05-20'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      DHL's internal unified tracking endpoint
      `https://www.dhl.com/utapi?trackingNumber=...` is confirmed Akamai-blocked
      (HTTP 428 sec-cp-challenge crypto proof-of-work, verified across 3 fetches
      from a warmed page context). DHL's public `developer.dhl.com` Tracking API
      requires registration + API key, so it's out of scope for unauthenticated
      agent flows. Browser-driven DOM scrape is the only practical surface.
verified: true
proxies: true
---
# DHL Shipment Tracking

## Purpose

Given a DHL tracking number (DHL Express, DHL Parcel, DHL eCommerce, DHL Global Forwarding, etc.), return the shipment's current status, service / product name, origin, destination, last-update timestamp + location, and the **full event timeline** (chronological list of every scan / status change with date, local-time, status text, and location). Read-only — never click "Subscribe to notifications", "Schedule delivery", "Redirect package", or any login / account button.

## When to Use

- A user pastes a DHL tracking number and asks "where is my package?" / "has it been delivered?" / "when will it arrive?".
- A logistics or customer-support agent monitoring a shipment for a delivery event.
- Bulk status polling for a list of DHL waybills (e.g., warehouse outbound reconciliation).
- Any flow where you'd otherwise tell the user to "go check the DHL site" — do it for them.

## Workflow

DHL's public web tracker (`dhl.com/<country>/home/tracking.html`) is the only practical surface. The underlying JSON endpoint `https://www.dhl.com/utapi?trackingNumber=...` is **confirmed Akamai-blocked** for any non-page-rendered request (always returns HTTP 428 `sec-cp-challenge` Crypto-Challenge, including from page-context `fetch()` after the page itself has loaded successfully — see Site-Specific Gotchas). DHL's official Tracking API at `developer.dhl.com` requires an API-key registration and is out of scope for unauthenticated browser-agent flows. **Use the browser path; lead with the deep-link URL pattern below.**

1. **Open a Browserbase session with both stealth + residential proxies enabled** — these are mandatory. Akamai's bot-protection (`sec-cpt-if` and `sec-text-if` challenge iframes) is silently embedded on every page load and the verified-fingerprint browser solves the proof-of-work in the background. A bare session fails to render any tracking data and the `utapi` call never resolves.

   ```bash
   sid=$(browse cloud sessions create --keep-alive --verified --proxies \
     | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
   export BROWSE_SESSION="$sid"
   ```

2. **Navigate directly to the deep-link URL** — skip the homepage form, type-in-and-submit flow entirely. The query-string `tracking-id=<NUMBER>&submit=1` auto-submits and renders results.

   ```bash
   browse open "https://www.dhl.com/us-en/home/tracking.html?tracking-id=<NUMBER>&submit=1" --remote
   ```

   The `/global-en/` locale prefix 302-redirects to a country-specific path (e.g. `/us-en/`). Going directly to `/us-en/` (or any other locale that's stable for your outbound IP) saves one redirect. Localization does NOT change which shipments are visible — DHL's tracking is global; only the page chrome + currency change per locale.

3. **Wait for the result-injection chain to complete.** After `load`, DHL's page makes a request to `https://www.dhl.com/utapi?...`, receives a metadata response, then loads a per-carrier HTML snippet from `/<country>/home/tracking/tracking-content-injection/<carrier>/<status>.html` and injects it into the DOM. The full chain settles ~3–5s after `load`.

   ```bash
   browse wait timeout 5000 --remote
   ```

4. **Detect outcome before extracting** by reading the visible page text. Three top-level branches:

   | Branch | Page-text signature |
   |---|---|
   | **Success** | `Tracking Code: <NUMBER>` appears with a status word (e.g. `Delivered`, `In transit`, `Out for delivery`, `Arrived at`, `Picked up`) and `Last Update: <day>, <date> at <time> Local time, <country>` |
   | **Not found** | `Sorry, your tracking attempt was not successful. Please check your tracking number.` (the tracking number is echoed back digit-spaced and unspaced) |
   | **Anti-bot wall** | Page body contains `Access Denied`, an unfilled Akamai challenge persists (`document.querySelector('#sec-cpt-if')` visible AND no `[role="tabpanel"]` in DOM after `wait timeout 8000`), or `document.title` is "Pardon Our Interruption" / blank |

5. **On success, extract structured fields from the rendered DOM**, not from `utapi`:

   ```javascript
   browse eval --remote -- '(() => {
     const main      = document.querySelector("main, .c-tracking--container");
     const txt       = main?.innerText || "";
     const detailsEl = document.getElementById("panel_details");
     const eventsEl  = document.getElementById("panel_events");

     // Header line — example:
     //   "Delivered , Tracking Code: 1 2 3 4 5 6 7 8 9 0
     //    Last Update: Wednesday, April 29, 2026 at 6:25 PM Local time , France
     //    Origin: Córdoba
     //    Destination: France, France"
     const status      = txt.match(/\n([A-Z][a-zA-Z ]+)\n,\s*Tracking Code:/)?.[1]?.trim() || null;
     const lastUpdate  = txt.match(/Last Update:\s*([^\n]+)/)?.[1]?.trim() || null;
     const origin      = txt.match(/Origin:\s*([^\n]+)/)?.[1]?.trim() || null;
     const destination = txt.match(/Destination:\s*([^\n]+)/)?.[1]?.trim() || null;
     const handler     = txt.match(/handled by:\s*([^\n]+)/)?.[1]?.trim() || null;

     // Details panel — labels are stable: Total Pieces, Service, Weight, Reference, Local Tracking Number
     const detailsText = (detailsEl?.innerText || "").replace(/\s+/g, " ");
     const grab = (label) => {
       const m = detailsText.match(new RegExp(label + "\\s+([^\\s][^A-Z]*?)(?:\\s+[A-Z][a-z]+ [A-Z]|$)"));
       return m?.[1]?.trim() || null;
     };

     // Event log — panel_events renders as a Time / Status / Location table.
     // Each row = 3 line-pairs: "<Month Day, Year>\n<HH:MM (AM|PM) Local time>\n<Status>\n<Location>"
     const eventsRaw = (eventsEl?.innerText || "").replace(/^\s*Time\s+Status Update\s+Location/, "");
     const eventLines = eventsRaw.split(/\n/).map(l => l.trim()).filter(Boolean);
     const events = [];
     for (let i = 0; i + 3 < eventLines.length; ) {
       const dateLine   = eventLines[i];
       const timeLine   = eventLines[i+1];
       const statusLine = eventLines[i+2];
       const locLine    = eventLines[i+3];
       if (/\d{4}/.test(dateLine) && /Local time/.test(timeLine)) {
         events.push({ date: dateLine, time: timeLine, description: statusLine, location: locLine });
         i += 4;
       } else { i += 1; }
     }
     return { status, lastUpdate, origin, destination, handler, eventsCount: events.length, events };
   })()'
   ```

   The three tabpanels in the page are **all rendered non-hidden simultaneously** — DHL's UI uses CSS visibility, not `hidden=true`, to switch tabs. This means you do NOT have to click "Event Log" to access its content; the `panel_events` DOM is populated on initial render and queryable directly. Same for `panel_timeline` and `panel_details`. **Skip the tab-clicking step entirely.**

5b. **Output normalization** — convert the human strings into ISO where possible. `April 29, 2026` + `6:25 PM Local time` → `2026-04-29T18:25:00` (no timezone offset is available from the page — DHL renders the carrier's local time without offset; pass through as-is or annotate `"local_only": true`). The destination string often duplicates the country (`"France, France"`) when only the country is known; collapse identical comma-pairs client-side.

6. **On not-found, return** `{ success: false, reason: "tracking_not_found", tracking_number: "..." }`. No retry — the same response repeats. Don't fallback to a search UI; DHL's tracking page is the only surface and a not-found at `/utapi` is authoritative across all DHL divisions (Express, Parcel, eCommerce, Global Forwarding).

7. **Release the session.**

   ```bash
   browse cloud sessions update "$sid" --status REQUEST_RELEASE
   ```

## Site-Specific Gotchas

- **`--verified --proxies` is mandatory.** Without `--verified` (stealth fingerprint) AND `--proxies` (residential), Akamai's challenge iframes (`#sec-cpt-if`, `#sec-text-if`) never get auto-solved and the `utapi` call never resolves to data — the tracking page stays empty. Both flags are required; one alone is insufficient on bot-protected pages.
- **The `utapi` endpoint is a TRAP — do not try to call it directly.** `https://www.dhl.com/utapi?trackingNumber=...&language=en&requesterCountryCode=US&source=tt` returns `HTTP 428 {"sec-cp-challenge": "true", "provider": "crypto", ...}` for every external call, including from page-context `fetch()` with `credentials: 'include'` after the page has successfully loaded. The challenge token + nonce + difficulty (`15000`) demand a proof-of-work computation that's solved only by DHL's bundled `bundle-utapi-logic.js` running inside an Akamai-cleared browser. **Verified 2026-05-20 with 3 separate fetches from the same warmed session — all 428.** Don't waste time on it; scrape the DOM.
- **The `developer.dhl.com` Tracking API requires registration + key.** It's out of scope for unauthenticated agent flows. Don't mention it as a fallback unless the caller has a key.
- **All three tabpanels render simultaneously.** `panel_details`, `panel_timeline`, `panel_events` are all present and queryable in the DOM after `wait timeout 5000` without any tab-click. The tabs use CSS visibility, not the HTML `hidden` attribute. **Skip the tab-click step** — querying `document.getElementById('panel_events').innerText` after initial load returns the full event table.
- **`panel_events` is the cleanest source for the event timeline** — it's a 3-column table (Time / Status Update / Location) that flattens to predictable `<date>\n<time>\n<status>\n<location>` 4-line groups. `panel_timeline` has the same data but in a richer visual-card layout with extra whitespace; parsing is harder. Always prefer `panel_events`.
- **Status text uses participle phrases that need a location suffix.** The event table has rows like `"In transit in"` + location `"France"` — meaning `"In transit in France"` when concatenated. Similarly: `"Arrived at"` + location, `"Departed from"` + location, `"Picked up"` + location, `"Parcel dropped off at DHL ServicePoint"` + location. Terminal statuses (`"Delivered"`, `"Out for delivery"`) do NOT need the suffix. When emitting `description`, concatenate the status + location for transit/arrival/departure events.
- **Timestamps have no timezone offset.** The page renders `"6:25 PM Local time"` — "local" means the carrier's local time at the event location, not the user's timezone, and the offset is never exposed. Don't fabricate a UTC offset; preserve the human string or annotate the ISO with `"local_only": true`.
- **The tracking number echoes back digit-spaced** in headers (`"1 2 3 4 5 6 7 8 9 0"`) for screen-reader accessibility. The unspaced original is also present (`"Tracking Code: 1234567890"`) — match against the unspaced form, or strip whitespace before comparing.
- **"This shipment is handled by: X" identifies the DHL division** that owns the shipment (`DHL eCommerce Iberia`, `DHL Express`, `DHL Parcel`, etc.). When `Service` in the details panel is generic (`"DHL PARCEL FOR YOU INTERNATIONAL"`), the handler line is the more discriminating field for customer-service routing.
- **`/global-en/` redirects to a country locale.** `https://www.dhl.com/global-en/home/tracking.html?tracking-id=...&submit=1` → `https://www.dhl.com/us-en/home/tracking.html?locale=true&tracking-id=...&submit=1` (or another locale based on outbound IP). Localized paths render identical tracking data — only the page chrome / FAQ links change. To skip the redirect, hit `/us-en/` (or whichever locale is stable for the IP) directly.
- **Origin & Destination can be city-only or country-only.** Observed: `Origin: "Córdoba"` (city only, no country), `Destination: "France, France"` (city == country, label duplicated). Parse both fields tolerantly; never assume `"city, country"` shape.
- **The `Reference` field in the Details panel echoes back the input tracking number**, not a customer reference. The true carrier-side ID is `Local Tracking Number` (e.g. `14 6000018487` for the example shipment), which can be different from what the user pasted. Some divisions show both — preserve both in output.
- **Not-found is detected by string match, not HTTP status.** The page returns HTTP 200 with the body text `"Sorry, your tracking attempt was not successful. Please check your tracking number."` for any unrecognized tracking number — even malformed inputs like `"ZZZZ9999INVALID"`. There is no separate 404 response. Check for this exact substring.
- **`JJD-` and other prefixed formats follow the same flow.** `JJD000390000687283009` was tested as not-found (no public-shipment match), but the URL pattern + extraction code handle it identically — no special-casing per format.
- **Page loads include 4 Akamai/CSP-related iframes** (`#sec-text-if`, `#sec-cpt-if`, plus two unnamed `<iframe>` containers and `<iframe src="https://www.dhl.com/crypto/cca-new.html">`). These are normal; if they're the *only* visible content + tab panels are absent after 8s, that's an unsolved challenge state.
- **Cookie consent banner does not block tracking results.** The "Consent for Data Processing" overlay appears at page bottom but does NOT cover or delay the tracking result render. Skip clicking it.

## Expected Output

Four distinct outcome shapes:

```json
// 1. Success — package found, full timeline available
{
  "success": true,
  "tracking_number": "1234567890",
  "status": "Delivered",
  "handler": "DHL eCommerce Iberia",
  "service": "DHL PARCEL FOR YOU INTERNATIONAL",
  "origin": "Córdoba",
  "destination": "France, France",
  "last_update": "Wednesday, April 29, 2026 at 6:25 PM Local time, France",
  "last_location": "France",
  "local_tracking_number": "14 6000018487",
  "weight": "5 kg",
  "total_pieces": 1,
  "events": [
    { "date": "April 29, 2026", "time": "6:25 PM Local time", "description": "Delivered",                        "location": "France" },
    { "date": "April 29, 2026", "time": "12:26 PM Local time","description": "Out for delivery",                "location": "France" },
    { "date": "April 29, 2026", "time": "5:36 AM Local time", "description": "In transit in",                   "location": "France" },
    { "date": "April 29, 2026", "time": "3:15 AM Local time", "description": "Arrived at",                      "location": "France" },
    { "date": "April 28, 2026", "time": "10:57 PM Local time","description": "In transit in",                  "location": "France" },
    { "date": "April 28, 2026", "time": "6:22 AM Local time", "description": "Departed from",                  "location": "Barcelona" },
    { "date": "April 24, 2026", "time": "4:10 PM Local time", "description": "Departed from",                  "location": "Córdoba" },
    { "date": "April 24, 2026", "time": "1:19 PM Local time", "description": "Picked up",                       "location": "Córdoba" },
    { "date": "April 24, 2026", "time": "11:24 AM Local time","description": "Parcel dropped off at DHL ServicePoint","location": "Córdoba" }
  ],
  "expected_delivery": null
}

// 2. Active shipment — same shape as #1, "status" is one of "In transit", "Out for delivery",
//    "Arrived at <hub>", "Picked up", etc., and the most recent events[0] reflects the live state.
//    `expected_delivery` may be populated when DHL provides an ETA on the page (rare for eCommerce,
//    common for Express); when absent, leave null.

// 3. Not found
{
  "success": false,
  "reason": "tracking_not_found",
  "tracking_number": "ZZZZ9999INVALID",
  "detail": "Sorry, your tracking attempt was not successful. Please check your tracking number."
}

// 4. Anti-bot wall (only when session is misconfigured — e.g. missing --verified or --proxies)
{
  "success": false,
  "reason": "blocked",
  "detail": "Akamai challenge iframe (#sec-cpt-if) persisted past 8s and no tabpanel rendered. Retry with `browse cloud sessions create --verified --proxies`."
}
```

**Schema notes:**
- `events` is sorted **newest-first** as DHL renders it; preserve that order so consumers can read `events[0]` for "most recent activity".
- `description` for transit / arrival / departure events is the participle phrase only (`"In transit in"`, `"Arrived at"`, `"Departed from"`); the noun (location) is in the `location` field. Join with a space for human display: `"In transit in France"`.
- `expected_delivery` is generally null for DHL eCommerce / Parcel and populated for DHL Express; the page surface for ETA varies per carrier and is best-effort.
- `weight` and `total_pieces` are present for DHL eCommerce / Parcel and often absent for DHL Express; both default to null when not in the details panel.
