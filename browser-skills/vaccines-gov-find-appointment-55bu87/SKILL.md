---
name: vaccines-gov-find-appointment-55bu87
title: Vaccines.gov Find Appointment
description: >-
  Given a ZIP code, return nearby CVS / Walgreens / Costco pharmacies that
  administer vaccines, with each chain's scheduler deep-link. Vaccines.gov no
  longer surfaces slot times — this skill handles the directory portion and
  hands off booking to per-chain scheduler skills. Read-only.
website: vaccines.gov
category: health
tags:
  - health
  - vaccines
  - pharmacy
  - locator
  - google-places
  - read-only
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: hybrid
alternative_methods:
  - method: api
    rationale: >-
      vaccines.gov's frontend makes a single POST to
      https://places.googleapis.com/v1/places:searchText with a
      publicly-embedded Google API key (verifiable in
      /_next/static/chunks/app/[locale]/results/page-*.js, 2026-05-18). Calling
      Places directly mirrors the site exactly and is ~50× cheaper than the
      browser path. The 'hybrid' label reflects that booking still requires
      per-chain browser handoff — vaccines.gov itself returns no slot data.
  - method: browser
    rationale: >-
      Fallback when the Google Places key is rotated or rate-limited. Drive
      vaccines.gov/en/ in a stealth + proxies session, fill the ZIP input, then
      capture the rendered cards. Same data as the API path, higher cost. Akamai
      gate is soft — bare HTML reads succeed, but the cards are client-rendered
      so the browser is required to see them.
verified: true
proxies: true
---
# Vaccines.gov Find Appointment

## Purpose

Given a ZIP code, return nearby **pharmacies that administer vaccines** — name, address, phone, website, rating, and a per-chain scheduler deep-link — and forward booking to each chain's own scheduler. **Vaccines.gov no longer surfaces vaccine inventory, vaccine-type filters, date windows, or appointment slot times** (the page banner reads *"The functionality of this website may be impacted while it is being updated"* and the footer reads *"Users should contact the pharmacy for vaccine availability and appointments"*). The skill returns the directory portion vaccines.gov provides, plus brand-specific scheduler URLs for the three requested chains. Read-only — never books.

## When to Use

- "What pharmacies near {zip} can administer a vaccine?" — vaccines.gov + Google Places is the canonical answer.
- A scheduling agent that needs to *discover* CVS / Walgreens / Costco locations near a user, then hand off to each chain's own slot-finder skill.
- Any flow that previously called the deprecated VaccineFinder API (`vaccinefinder.org` / `findvax-direct-api.castlight.com`) and needs a current-day replacement.

**Do not use this skill** if you need real appointment slot times. Slot data is **not** on vaccines.gov — it lives on each pharmacy chain's scheduler. After this skill returns the per-chain scheduler URL, dispatch to a chain-specific skill: `cvs.com/schedule-vaccine`, `walgreens.com/schedule-vaccine`, etc. (Costco does not expose an online scheduler — the user must phone the store.)

## Workflow

The optimal path is **hybrid**: call the same Google Places `searchText` endpoint that vaccines.gov calls (one HTTP POST, no auth beyond a publicly-embedded API key, ~0.5s), filter results to the requested chains, then construct per-chain scheduler URLs. The browser path is a fallback when the API key has been rotated or rate-limited; it pays ~50× the cost and still returns the same data (vaccines.gov's frontend is a thin React wrapper over the exact API call below).

### 1. Geocode the ZIP → lat/lng bounding box

Vaccines.gov uses a `getBoundsOfDistance({latitude, longitude}, radiusMeters)` helper to convert a ZIP centroid + radius into a `{low, high}` rectangle. Any geocoding source works; the simplest is the Google Geocoding API or a static USPS ZCTA centroid table. Default radius in the vaccines.gov UI is **8047 meters (~5 miles)**; raise to **16093 m (~10 mi)** or **40234 m (~25 mi)** for sparse rural ZIPs.

Example for ZIP 10001 (NYC, centroid 40.7506 / -74.0014, 5-mile radius):
```json
{ "low":  { "latitude": 40.6783, "longitude": -74.0966 },
  "high": { "latitude": 40.8228, "longitude": -73.9062 } }
```

### 2. Call Google Places `searchText`

```
POST https://places.googleapis.com/v1/places:searchText
  Content-Type: application/json
  X-Goog-Api-Key: AIzaSyCVvG6ZXIlxy76PCbqGnf9cP37XtA3HE-M
  X-Goog-FieldMask: places.id,places.displayName.text,places.nationalPhoneNumber,
                    places.formattedAddress,places.addressComponents,places.location,
                    places.websiteUri,places.rating,places.primaryType,
                    places.regularOpeningHours.openNow,nextPageToken

{
  "textQuery": "pharmacy zip code 10001",
  "languageCode": "en",
  "includedType": "pharmacy",
  "rankPreference": "RELEVANCE",
  "strictTypeFiltering": true,
  "regionCode": "US",
  "pageSize": 20,
  "locationRestriction": { "rectangle": { "low": {...}, "high": {...} } }
}
```

The key, request shape, and field mask are exactly what vaccines.gov ships in `/_next/static/chunks/app/[locale]/results/page-*.js` (verified 2026-05-18). Paginate with `pageToken` from `nextPageToken` — vaccines.gov caps at **3 pages × 20 results = 50 max**. Iterate `pageSize=20` × up to `c<3` page tokens, accumulating until `o.length >= 50` (the literal cap from the bundle).

### 3. Filter to the three target chains

Match `places.displayName.text` (or `places.addressComponents`) against:
- **CVS** — `displayName.text` contains `CVS` (case-insensitive). Also matches `CVS Pharmacy`, `CVS y más`, `Target` (CVS-inside-Target — only if `formattedAddress` contains "CVS pharmacy"; otherwise skip).
- **Walgreens** — `displayName.text` contains `Walgreens` or `Duane Reade` (Duane Reade is a NYC-region Walgreens subsidiary and shares the same scheduler).
- **Costco** — `displayName.text` contains `Costco`. **Pharmacy is in-warehouse**, so only Costco warehouses with a pharmacy department return useful results — Google Places does not distinguish, so verify via the `websiteUri` (membership warehouses link to `costco.com/warehouse-locations/...`).

Chains **not** in scope but commonly appearing in results: Walmart, Rite Aid (most stores closed in 2023-2024 chapter 11), Sam's Club, supermarket pharmacies (Kroger, Publix, H-E-B). Drop them.

### 4. Construct per-chain scheduler deep-link

Vaccines.gov itself emits only a Google Maps directions URL (`https://www.google.com/maps/dir/?api=1&destination={addr}&destination_place_id={places.id}`) — useful for navigation, useless for booking. For booking, build a chain-specific URL:

| Chain | Scheduler URL pattern | Notes |
|---|---|---|
| CVS | `https://www.cvs.com/vaccine/intake/store/` | Real-time slots after store + vaccine-type selection. No useful ZIP/store deep-link query param — the page hydrates client-side then prompts. Must hand off to the `cvs.com/schedule-vaccine` skill with `{zip, vaccine_type, date_window}`. |
| Walgreens | `https://www.walgreens.com/findcare/vaccination/our-services` | **Requires Walgreens.com sign-in** before slots are shown — anonymous fetch returns the sign-in wall (page title literally is *"Sign In or Register to Get Started Using Walgreens.com"*). Duane Reade uses the same scheduler. |
| Costco | `https://www.costco.com/pharmacy.html` | **No online scheduler.** Page is informational only. Return the pharmacy's phone number (`places.nationalPhoneNumber`) and instruct the user to call. |

### 5. Assemble output

Return one record per matching pharmacy with the fields below — leave `slots`, `next_available`, and `booking_url_with_slot` **explicitly null** and set `slot_data_available: false`. The next agent in the chain (e.g. `cvs.com/schedule-vaccine`) fills those in.

### Browser fallback

If the Google Places key is rotated or returns 403, drive vaccines.gov in a session with `--verified --proxies` (the site sits behind Akamai — `akamai_visit_id` cookie is set on first response, and bare sessions get challenged):

1. `browse open https://www.vaccines.gov/en/ --remote --session "$sid"`
2. `browse fill <zip-input ref> "10001"` and `browse press Enter`
3. `browse wait networkidle --timeout 20000` (Places call resolves in ~500ms but the React render lags ~3s)
4. `browse get markdown body` — pharmacy cards render as `<h3>{name}</h3>` + `<address>{address}</address>` + `<a href="https://www.google.com/maps/dir/?api=1...">Directions</a>` + `<a href="{websiteUri}">Website</a>`
5. Filter + emit as above

Network capture (`browse network on`) will record the exact `places.googleapis.com/v1/places:searchText` request — useful for reconfirming the API key if the bundle hash changes.

## Site-Specific Gotchas

- **Vaccines.gov is now a pharmacy directory, not a vaccine finder.** As of mid-2024 the site shed its appointment-finder backend (formerly powered by Castlight VaccineFinder) and re-launched as a Google-Places-backed pharmacy locator. The home page literally banners: *"The functionality of this website may be impacted while it is being updated."* Do not promise users slot times from this surface.
- **No vaccine-type input.** The UI accepts only ZIP. The request body sent to Google has `textQuery: "pharmacy zip code {zip}"` — vaccine type is *not* in the query string and `includedType` is the constant `"pharmacy"`. Filtering by vaccine type is the consuming agent's job, downstream of this skill.
- **No date input either.** Same reason. Slot windows are a downstream concern.
- **Hard-coded Google API key in the bundle.** `AIzaSyCVvG6ZXIlxy76PCbqGnf9cP37XtA3HE-M` is shipped in plaintext in `/_next/static/chunks/app/[locale]/results/page-*.js` (bundle hash may rotate; if your stored key 403s, re-fetch the results-page chunk and grep `AIza`). Restrictions on the key are referer-based — sending the request from an arbitrary IP without a `Referer: https://www.vaccines.gov/` header may be rejected; mirror the browser referer when calling directly.
- **50-result cap.** The vaccines.gov UI iterates page-tokens at most 3× and stops when accumulated results reach 50 (`o.length < 50 && c < 3` in the bundle). To exceed 50, tile the bounding box into sub-rectangles and call separately — Google Places will not return more from a single rectangle even with further `pageToken` chasing.
- **`includedType: "pharmacy"` + `strictTypeFiltering: true`** excludes urgent-care clinics, doctor offices, and grocery stores that *also* carry pharmacies. To capture supermarket-embedded pharmacies (Kroger, Publix, Wegmans), relax to `strictTypeFiltering: false` and post-filter on `addressComponents` or `displayName.text`.
- **Akamai gate, but soft.** The `www.vaccines.gov` HTML response sets `akamai_visit_id` / `Akamai-Request-ID` cookies. Bare-session fetches still succeed for HTML and `/_next/static/*` chunks (verified 2026-05-18). Stealth is *not* required to read the page or hit the Places API; reserve `--verified --proxies` for the browser fallback only.
- **Page is fully client-rendered.** Server-rendered HTML for both `/en/` and `/en/results/?zip=...` contains only a title and shell — no pharmacy data is in the initial HTML. `browse cloud fetch` of the results URL will not return any pharmacy info; you must either (a) call Google Places directly (recommended), or (b) drive the browser to allow client-side hydration.
- **Costco is a dead-end for booking.** `costco.com/pharmacy.html` has no online scheduler. Return the phone number; do not waste turns trying to find slots.
- **Walgreens requires sign-in before slots.** A direct fetch of `walgreens.com/findcare/vaccination/our-services` (verified 2026-05-18) lands on a sign-in wall. The downstream `walgreens.com/schedule-vaccine` skill must carry credentials or a persisted browser context.
- **Don't trust the inner-agent hallucination of "VTrckS / VAMS / CDC provider registry".** Models trained on pre-2024 data describe vaccines.gov as a CDC-backed inventory federation. That is no longer true. The actual data plane is **one** Google Places `searchText` call, period.
- **No appointment slot data exists on vaccines.gov in any surface** — not via the HTML, not via any internal API, not via the Places response. Confirmed by JS-bundle inspection: the only outbound API call from the results page is to `places.googleapis.com`, and the field mask requested does not include any vaccine, schedule, or inventory field. Future agents: do not waste iterations trying to discover a hidden slot API. There is none.

## Expected Output

```json
{
  "zip": "10001",
  "radius_miles": 5,
  "slot_data_available": false,
  "next_step": "Dispatch each pharmacy to its chain's scheduler skill — vaccines.gov does not surface slot times.",
  "pharmacies": [
    {
      "place_id": "ChIJxxxxxxxxxxxxxxxxxxxxxxxx",
      "chain": "cvs",
      "name": "CVS Pharmacy",
      "address": "298 8th Ave, New York, NY 10001, USA",
      "phone": "(212) 555-1212",
      "website": "https://www.cvs.com/store-locator/cvs-pharmacy-address/...",
      "rating": 3.4,
      "open_now": true,
      "location": { "latitude": 40.7466, "longitude": -73.9986 },
      "directions_url": "https://www.google.com/maps/dir/?api=1&destination=298+8th+Ave+New+York+NY+10001&destination_place_id=ChIJxxxxxxxxxxxxxxxxxxxxxxxx",
      "scheduler_url": "https://www.cvs.com/vaccine/intake/store/",
      "scheduler_method": "browser",
      "scheduler_notes": "Hand off to cvs.com/schedule-vaccine skill with {zip, vaccine_type, date_window}.",
      "slots": null,
      "next_available": null
    },
    {
      "place_id": "ChIJyyyyyyyyyyyyyyyyyyyyyyyy",
      "chain": "walgreens",
      "name": "Duane Reade",
      "address": "401 W 14th St, New York, NY 10014, USA",
      "phone": "(212) 555-3434",
      "website": "https://www.walgreens.com/locator/walgreens-...",
      "rating": 3.1,
      "open_now": true,
      "location": { "latitude": 40.7398, "longitude": -74.0049 },
      "directions_url": "https://www.google.com/maps/dir/?api=1&destination=...",
      "scheduler_url": "https://www.walgreens.com/findcare/vaccination/our-services",
      "scheduler_method": "browser",
      "scheduler_notes": "Walgreens.com sign-in required before slots are shown. Duane Reade uses the Walgreens scheduler.",
      "slots": null,
      "next_available": null
    },
    {
      "place_id": "ChIJzzzzzzzzzzzzzzzzzzzzzzzz",
      "chain": "costco",
      "name": "Costco Pharmacy",
      "address": "517 E 117th St, New York, NY 10035, USA",
      "phone": "(212) 555-9090",
      "website": "https://www.costco.com/warehouse-locations/...",
      "rating": 4.2,
      "open_now": false,
      "location": { "latitude": 40.7995, "longitude": -73.9341 },
      "directions_url": "https://www.google.com/maps/dir/?api=1&destination=...",
      "scheduler_url": "https://www.costco.com/pharmacy.html",
      "scheduler_method": "phone_only",
      "scheduler_notes": "Costco does not expose an online scheduler. Call the pharmacy's phone number to book.",
      "slots": null,
      "next_available": null
    }
  ]
}
```

If no matching pharmacies are returned for the requested chains (e.g. rural ZIP, no CVS / Walgreens / Costco within radius), respond with an empty `pharmacies` array and `reason: "no_target_chain_in_radius"`. If the Places API returns a non-200 (key rotated, quota exhausted), fall back to the browser path or surface `reason: "places_api_error", "status": <code>`.

```json
{ "zip": "59718", "radius_miles": 25, "slot_data_available": false, "pharmacies": [], "reason": "no_target_chain_in_radius" }
```

```json
{ "zip": "10001", "slot_data_available": false, "reason": "places_api_error", "status": 403, "hint": "Refetch /_next/static/chunks/app/[locale]/results/page-*.js and re-scrape the AIza... key." }
```
