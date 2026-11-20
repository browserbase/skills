---
name: zocdoc-com-find-appointment-ekztri
title: Zocdoc Find Appointment
description: >-
  Search Zocdoc for available appointment slots by specialty + location (+
  optional insurance), returning provider name, specialty, distance,
  next-available date/time, and accepted insurance. Read-only — never books.
website: zocdoc.com
category: healthcare
tags:
  - healthcare
  - appointments
  - scheduling
  - insurance
  - datadome
  - read-only
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      Zocdoc's official REST API at api-developer.zocdoc.com (GET
      /v1/provider_locations + /v1/provider_locations/availability) is
      OAuth-gated via client_credentials and not available without
      partner-issued credentials. Endpoint existence verified 2026-05-18 (401 on
      unauthenticated call); recommend this path only for agents that already
      hold a Zocdoc developer token. The unauthenticated patient-facing site is
      the only path for a generic agent.
  - method: browser
    rationale: >-
      Public consumer site at zocdoc.com is the only viable surface for an agent
      without developer credentials. DataDome-protected — verified --proxies
      session required. Slot data renders in HTML after JS hydration so browser
      snapshot is reliable once the page settles.
verified: true
proxies: true
---
# Zocdoc Find Appointment

## Purpose

Given a medical specialty, a location (ZIP code or city), and optionally an insurance plan, return the set of in-network providers that have the soonest available appointment slots — including provider name, specialty, distance from the search location, the next available date/time, all visible slot times on that date, and the list of accepted insurance plans for that provider-location. Read-only — never click a slot, never reach the booking confirmation page, never submit patient info.

## When to Use

- "Show me dermatologists in Brooklyn 11201 who take Aetna and have appointments this week."
- "What's the soonest a primary care doctor near 90210 can see me?"
- A scheduling agent comparing first-available across specialists for a referral.
- Insurance-network discovery: "Which dentists in ZIP 10001 accept HealthFirst NY plan X?"
- Any flow that needs slots without booking. Booking is a different skill (`zocdoc.com/book-appointment`) and requires PHI (name, DOB, insurance card, address) the user must explicitly supply.

## Workflow

The Zocdoc consumer site at `https://www.zocdoc.com/` is the only viable surface for an agent without Zocdoc developer credentials. The site is **DataDome-protected** — bare HTTP fetch, residential-proxy fetch, and the internal `/wapi/*` JSON endpoints all return `403 Please enable JS` (verified across multiple URL patterns). The full search-results page renders client-side after the DataDome JS challenge passes, so you need a real browser session with **`--verified` and `--proxies`** enabled. The structured data (provider cards, first-available chip, slot grid) is rendered as accessible HTML once the page settles, so `browse snapshot` works once you're past the challenge.

If you have **Zocdoc developer OAuth credentials** (`client_id` / `client_secret` issued via `developer.zocdoc.com`), prefer the official REST API — see "API path (developer-credentialed only)" at the end of this section. The consumer-site flow below is the default path for a generic agent.

### 1. Create a verified + proxied session

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies --api-key "$BB_API_KEY" | jq -r .id)
export BROWSE_SESSION="$SID"
```

Both `--verified` and `--proxies` are mandatory. A bare session or `--proxies`-only session gets a 403 with the DataDome `cmsg` HTML body (the page-source signature is `<script data-cfasync="false" src="https://ct.captcha-delivery.com/i.js">`). `--solve-captchas` is **not** sufficient on its own — DataDome on Zocdoc presents an invisible JS challenge, not a clickable CAPTCHA, so the captcha-solver never triggers.

### 2. Construct the search URL directly — skip the homepage

```
https://www.zocdoc.com/search?
    address={URL-encoded-city-or-zip}
   &search_query={URL-encoded-specialty-display-name}
   &dr_specialty={specialty_id}
   &reason_visit={visit_reason_id}
   &insurance_carrier={carrier_id}     # optional
   &insurance_plan={plan_id}           # optional, pair with insurance_carrier
   &day_filter=AnyDay
   &sort_type=Default
   &visitType=inPersonAndVirtualVisits
   &latitude={float}                    # optional — site geocodes from `address` if absent
   &longitude={float}
   &offset=0
```

`address` accepts both `"Brooklyn, NY 11201"` and bare ZIPs (`"10001"`). The site geocodes server-side and populates `latitude`/`longitude` after the first navigation — you can omit them on initial entry.

`dr_specialty` and `reason_visit` are **numeric IDs on the consumer site**, distinct from the developer-API's string IDs (`sp_153` / `pc_FRO-...`). Map common values from the specialty pivot table below; for unmapped specialties, use the **specialty discovery flow** (step 3).

`insurance_carrier` is the carrier ID (e.g. Aetna, HealthFirst NY) and `insurance_plan` is the specific plan within that carrier. The site treats `insurance_carrier=-1&insurance_plan=-1` as "no insurance filter" and `insurance_carrier=-2&insurance_plan=-2` as "self-pay / no insurance" — both render different result sets.

#### Specialty pivot (verified consumer-site values, partial)

| Specialty (search_query)         | dr_specialty | reason_visit | Example /search URL fragment |
|---|---|---|---|
| Dentist                          | 98  | 12  | `search_query=Dentist&dr_specialty=98&reason_visit=12` |
| Primary Care Doctor (PCP)        | 153 | 75  | `search_query=Primary+Care+Doctor+%28PCP%29&dr_specialty=153&reason_visit=75` |
| Dermatologist                    | 106 | (varies — let site default) | `search_query=Dermatologist&dr_specialty=106` |

For other specialties: open the homepage `browse open --remote --session "$SID" https://www.zocdoc.com/` and use the specialty typeahead — the URL after submit contains both IDs. Cache discovered values; the consumer specialty ID space is undocumented and stable.

### 3. Open the URL and wait for the slot grid to settle

```bash
browse open --remote --session "$SID" "$URL"
browse wait --remote --session "$SID" load
browse wait --remote --session "$SID" timeout 3500   # slot widget hydrates 2–3s after `load`
browse snapshot --remote --session "$SID"
```

The slot widget renders progressively after `load` fires (verified pattern across Zocdoc's Next.js + React-Query stack). Snapshotting before the timeout returns provider names but `slots: []` arrays.

### 4. Branch on what the snapshot shows

- **Provider cards with `Earliest available: <day-of-week, MMM D>` + visible time-slot buttons** → success path. Each card has:
  - Provider full name + credentials (h3-level heading on each card)
  - Specialty tag (sub-heading)
  - Distance text (`X.X mi` or `X miles away`)
  - "Next available" chip
  - 3–6 visible slot times for the next-available date (more behind a "Show more" expander; click the expander only if you need same-day depth)
  - Insurance row: "Accepts: <plan name>" or "In-network with: ..." or "Accepts most plans"
- **"No appointments available" / "No providers found" header** → `success: true, providers: [], reason: "no_results"`.
- **Top of page shows "Showing results near <DIFFERENT CITY>"** → the `address` parameter was misparsed by Zocdoc's geocoder. Re-issue with a more-specific address string (full street or `<city>, <state> <zip>`).
- **DataDome interstitial (page title `zocdoc.com`, body `Please enable JS and disable any ad blocker`)** → the verified session burned a DataDome cookie. Release the session and create a new one — do not retry on the same session.

### 5. Extract per-provider availability

For each visible provider card on the search-results page, the next-available date and ~3–6 same-day slot buttons are sufficient for this skill's output. **Do not click slot-time buttons** — that initiates the booking flow, which this skill must not do. If the user requested all slots across a multi-day window, visit the provider's profile page instead:

```
https://www.zocdoc.com/doctor/{slug}-{provider-id}
https://www.zocdoc.com/dentist/{slug}-{provider-id}      # dental specialties use /dentist/
```

The profile page's calendar widget shows up to 14 days of slots in a date-paginated grid. Use `browse click` only on the date-navigation arrows (`button: Next day` / `button: Previous day`), never on time-slot buttons.

### 6. Verify before emitting

- Read the page header's location chip. If it doesn't match the requested location (e.g. requested "Brooklyn" but header says "Manhattan"), the geocoder picked a different neighborhood — flag as `location_mismatch` rather than silently emit.
- Read the URL after navigation. Zocdoc occasionally redirects `/search?` to a specialty-by-city landing page (`/dentists/<city-slug>-<code>pm`) when no slot data is server-rendered; if the redirect happens, follow it — the landing page has the same provider-card structure.
- If insurance was specified, confirm each emitted provider's card shows the requested plan in "Accepts" — otherwise mark `accepts_specified_insurance: false` rather than dropping the provider.

### 7. Release the session

```bash
browse cloud sessions update "$SID" --status REQUEST_RELEASE --api-key "$BB_API_KEY"
```

### API path (developer-credentialed only)

If the agent has Zocdoc developer credentials, prefer the documented REST API — it returns JSON directly and bypasses DataDome entirely:

1. `POST https://auth.zocdoc.com/oauth/token` with `grant_type=client_credentials`, your `client_id`, `client_secret`, and `audience=https://api-developer.zocdoc.com/` → `access_token`.
2. `GET https://api-developer.zocdoc.com/v1/provider_locations?zip_code=<5-digit>&specialty_id=<sp_NNN>[&insurance_plan_id=<ip_NNNN>][&max_distance_to_patient_mi=<int>]` with `Authorization: Bearer <token>` → list of `provider_location_id`s + `first_availability_date_in_provider_local_time` + `accepts_patient_insurance` per result.
3. `GET https://api-developer.zocdoc.com/v1/provider_locations/availability?provider_location_ids=<comma-separated>&visit_reason_id=<pc_...>&patient_type=new[&start_date_in_provider_local_time=YYYY-MM-DD]` → timeslot list per provider_location with ISO-8601 `start_time` and a `booking_url` deep-link back to zocdoc.com.

Developer API specialty/visit-reason IDs use string namespaces (`sp_153`, `pc_FRO-18leckytNKtruw5dLR`) — distinct from the consumer-site numeric IDs in step 2 above. The reference-data mapping is **not public** — partners must email `partner-devsupport@zocdoc.com` to receive it. Insurance plan IDs (`ip_NNNN`) are obtainable via the public-on-auth `GET /v1/insurance_plans` endpoint.

The endpoint `https://api-developer.zocdoc.com/v1/provider_locations` returns `401 Unauthorized` to unauthenticated callers (verified 2026-05-18) — confirming the host exists and is OAuth-gated. **Do not waste time probing `https://api.zocdoc.com/v1/*` or `https://www.zocdoc.com/api/v1/*` — both return 404 (verified); the production API host is `api-developer.zocdoc.com`.**

## Site-Specific Gotchas

- **READ-ONLY.** Never click a time-slot button or a "Book" CTA — both start the booking flow. Read-only stops at the search-results page or the provider profile's calendar view.
- **DataDome anti-bot is on by default.** Bare HTTP fetch, residential-proxy HTTP fetch (`browse cloud fetch ... --proxies`), and the internal `/wapi/*` and `/v1/*` consumer endpoints all return `403` with a `<script data-cfasync="false" src="https://ct.captcha-delivery.com/i.js">` body (verified 2026-05-18 across `/`, `/search`, `/dentists/brooklyn-79621pm`, `/robots.txt`, `/wapi/searchResults`). **You must use a browser session with `--verified --proxies`.** `--solve-captchas` does not help — DataDome's challenge here is invisible JS, not a click-CAPTCHA.
- **DataDome exceptions:** `/api/health/*` and unmatched `/*` URLs are routed to the SEO 404 page (15 KB Zocdoc-branded HTML), which **bypasses** the DataDome challenge. This is a debugging signal — if your `--verified` session is mis-configured, fetching `/api/health/x` will succeed (404 page renders) while fetching `/search` will 403. Don't use this as a scrape path though — there's no useful data on the 404 page.
- **Two specialty-ID namespaces — don't cross them.** The consumer site uses numeric IDs in the URL: `dr_specialty=98` (Dentist), `dr_specialty=153` (PCP), `reason_visit=75` (PCP visit), `reason_visit=12` (Dentist visit). The developer API uses string IDs: `sp_153`, `pc_FRO-18leckytNKtruw5dLR`. They are **not interchangeable** — passing `sp_153` to the consumer URL produces a malformed search. Map by name, not by number.
- **`/dentist/` vs `/doctor/`.** Dental specialties (Dentist, Endodontist, Periodontist, Orthodontist, Pediatric Dentist, Oral Surgeon) use `/dentist/{slug}-{id}` for profile URLs. Everything else uses `/doctor/{slug}-{id}`. The `/dentists/<city-slug>-<code>pm` directory pages (note the trailing `pm`) are SEO landing pages — the `pm` is a Zocdoc-internal city-region code, not a meaningful suffix.
- **Slot widget renders 2–3s after `load`.** `browse wait timeout 3500` after `wait load` before `snapshot` — otherwise you get provider cards with empty slot arrays.
- **Geocoder can override the location.** `address=Joe%27s+City` (or any ambiguous string) gets geocoded to whatever Zocdoc thinks you meant. Always verify the location header chip after navigation matches the user's intent; if not, retry with a fuller address (full street, `<city>, <state> <zip>`, or raw ZIP).
- **Insurance trio: `-1` vs `-2` vs explicit IDs.** `insurance_carrier=-1&insurance_plan=-1` is "no filter — show all providers". `insurance_carrier=-2&insurance_plan=-2` is "I'm self-paying, show only providers who accept self-pay". `insurance_carrier=<N>&insurance_plan=<N>` filters to in-network only. The default if the params are omitted entirely is `-1`/`-1` (no filter).
- **Insurance plan IDs are carrier-scoped.** `insurance_carrier=350` is HealthFirst NY; `insurance_plan=17200` is a specific HealthFirst NY plan. Passing `insurance_plan` without the matching `insurance_carrier` parent silently drops the filter. Always send the pair together.
- **`first_availability_date_in_provider_local_time` is in the provider's timezone, not the user's.** A New York patient searching San Francisco providers gets PT-local "earliest available" — convert before emitting if the user expects their own timezone.
- **Provider cards with `Earliest available: Today` + slot buttons** are the success shape. Cards with `Earliest available: <date 14+ days out>` and no visible slot buttons mean "calendar is open but no near-term slots" — emit but flag as `low_availability: true`.
- **Same provider, multiple locations.** A provider with practices in multiple ZIPs appears as multiple cards (one per `provider_location_id`). Don't dedupe by `provider_id` — the user may want a specific location.
- **Verified session is single-use against DataDome.** If a session gets a DataDome 403 mid-flow (cookie expired, signal flagged), do not retry on the same session — release it and create a fresh one. Verified sessions are cheap; recovery on a flagged session is not.
- **Don't probe `/wapi/searchResults` or `/api/v1/search`.** Verified 2026-05-18: both 403 with DataDome regardless of session config. The site does not expose a consumer JSON API.
- **The official API host is `api-developer.zocdoc.com`, not `api.zocdoc.com`.** `api.zocdoc.com/v1/*` returns 404 (verified) — this domain serves a non-API stub. Use `api-developer.zocdoc.com` for all OAuth-authenticated API calls.
- **OAuth audience is required and specific.** When requesting a developer token from `https://auth.zocdoc.com/oauth/token`, you must include `"audience": "https://api-developer.zocdoc.com/"` in the JSON body — omitting it returns a token that the API rejects with 401.

## Expected Output

Three distinct outcome shapes.

### Success — providers with availability

```json
{
  "success": true,
  "query": {
    "specialty": "Dentist",
    "specialty_id_consumer": 98,
    "location": "Brooklyn, NY 11201",
    "latitude": 40.6986772,
    "longitude": -73.9859414,
    "insurance_carrier_id": 350,
    "insurance_plan_id": 17200,
    "insurance_display": "HealthFirst (NY) — Essential Plan 1"
  },
  "result_count": 3,
  "providers": [
    {
      "provider_id": "132039",
      "name": "Dr. Beeren Gajjar, DDS",
      "specialty": "Dentist",
      "distance_mi": 0.4,
      "profile_url": "https://www.zocdoc.com/dentist/beeren-gajjar-dds-132039",
      "next_available_date": "2026-05-19",
      "next_available_date_provider_local": "2026-05-19",
      "timezone": "America/New_York",
      "slots": [
        "2026-05-19T09:00:00-04:00",
        "2026-05-19T09:30:00-04:00",
        "2026-05-19T10:00:00-04:00",
        "2026-05-19T14:15:00-04:00"
      ],
      "accepted_insurance": [
        "HealthFirst (NY)",
        "Aetna",
        "Cigna",
        "Delta Dental"
      ],
      "accepts_specified_insurance": true,
      "low_availability": false
    }
  ]
}
```

### Success — no providers match (empty result set)

```json
{
  "success": true,
  "query": { "...same shape..." },
  "result_count": 0,
  "providers": [],
  "reason": "no_results",
  "note": "Either no providers in-network within search radius, or specialty/insurance combination has no in-network options."
}
```

### Failure — geocoder rerouted the location

```json
{
  "success": false,
  "reason": "location_mismatch",
  "requested_location": "Brooklyn",
  "page_header_location": "Manhattan, NY",
  "suggestion": "Retry with a fuller address: '<city>, <state> <zip>' or a 5-digit ZIP."
}
```
