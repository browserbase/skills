---
name: sixt-com-search-car-rental-oulz1k
title: Sixt Car Rental Search
description: >-
  Search the Sixt car-rental site for available vehicles at a given branch on
  given dates and return offer details (class, sample model,
  seats/doors/transmission, mileage policy, per-day and total price). Read-only
  — never books.
website: sixt.com
category: travel
tags:
  - car-rental
  - travel
  - sixt
  - read-only
  - cloudflare
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: browser
alternative_methods:
  - method: url-param
    rationale: >-
      Once the (location_uuid, BRANCH:<id>) pair for a branch is known via the
      homepage typeahead, subsequent searches can be a single GET to
      https://www.sixt.com/betafunnel/#/offerlist?zen_pu_location=…&zen_do_location=…&zen_pu_branch_id=BRANCH:…&zen_pu_time=…&zen_do_time=…&zen_vehicle_type=car&zen_point_of_sale=US
      — no form interaction required. Cache the per-branch UUID/ID pair to
      amortize the ~25-turn first-time discovery cost.
  - method: api
    rationale: >-
      Don't bother — the only backend is binary gRPC-Web at
      grpc-prod.orange.sixt.com
      (com.sixt.service.rent_booking.api.SearchService/*) which requires the
      protobuf wire format plus browser-context cookies. All hopeful REST paths
      (/php/reservation/locations, /api/v3/locations/search) 302 to / or return
      400. No public JSON API exists.
verified: true
proxies: true
---
# Sixt Car Rental Search

## Purpose

Given a pickup location, dropoff location, pickup/dropoff date+time, and (optionally) a preferred vehicle class, return the full list of car-rental offers Sixt surfaces at the requested branch — each with vehicle class, sample model, seats/doors/transmission, mileage policy, total price, and per-day price. Read-only — **never** click the per-card "Book" button or the global continue/checkout button.

## When to Use

- A user asks "what cars can I rent at LAX next weekend?" or similar (city/airport + date range + optional class).
- Comparing prices/availability across multiple Sixt branches on the same dates.
- Bulk fleet/price extraction for one branch on different dates.
- Anywhere a Sixt-specific offer-list snapshot is needed; if the user wants cross-vendor comparison they should use Kayak/Expedia/Google instead.

## Workflow

The Sixt offer-list is a JS-rendered SPA at `/betafunnel/#/offerlist?<zen_…>` whose state lives entirely in the URL hash. The recommended path is **browser + deep-link** — drive the homepage typeahead once to resolve the branch's location-UUID and `BRANCH:<id>` code, then either submit the form or jump straight to a constructed `/betafunnel/#/offerlist?…` URL. There is **no public REST/JSON endpoint** — the backend is binary gRPC at `grpc-prod.orange.sixt.com` (`com.sixt.service.rent_booking.api.SearchService/*`), which is not practical to call from a scripted client. Cloudflare protects the site; a `--verified --proxies` Browserbase session navigates cleanly.

### 1. Session

```bash
sid=$(browse cloud sessions create --keep-alive --proxies --verified \
  | node -e "let s=''; process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$sid"
```

`--verified` (advanced stealth) plus residential `--proxies` is recommended. The site sets `__cf_bm` cookies on every request; a bare session sometimes 403s on the betafunnel SPA.

### 2. Open homepage and dismiss the privacy dialog

```bash
browse open https://www.sixt.com/ --remote
browse snapshot --remote        # locates the cookie/privacy OK button
browse click <ok-ref> --remote  # dismisses the GDPR/cookie banner
```

The privacy dialog appears as the topmost button group on the first paint. Locale `EN | $` shows for US IPs; if you see EUR / a different language, the proxy egress is non-US — pass `&pos=us` style param isn't supported, so re-create the session with a US-egress proxy preference if currency matters.

### 3. Fill the pickup location via typeahead

```bash
browse fill '[data-testid="ibe-pickup-location-input"]' "Los Angeles International Airport" --remote
browse snapshot --remote   # typeahead dropdown is now populated
# Click the first matching menuitem — e.g. "Los Angeles Int Airport"
browse click <typeahead-option-ref> --remote
```

**Do NOT use `browse type`** — the CLI rejects multi-word arguments unless quoted, and `browse fill` is purpose-built for input boxes. `browse fill` does NOT auto-press Enter on this field, so you must click the typeahead suggestion explicitly; otherwise the form submits with an unbound location.

When pickup == dropoff, leave "Different return location" unchecked — Sixt copies the pickup branch into both `zen_pu_branch_id` and `zen_do_branch_id`. For a different dropoff, click that checkbox first, then fill a second input that surfaces.

### 4. Set dates and times

```bash
browse click <pickup-date-button-ref> --remote    # opens 3-month calendar
browse click <jun-10-day-button-ref>   --remote   # pickup date
browse click <jun-14-day-button-ref>   --remote   # return date (same calendar)
browse click <pickup-time-button-ref>  --remote   # opens 15-minute-grid time list
browse click <10-00-am-option-ref>     --remote
browse click <return-time-button-ref>  --remote
browse click <10-00-am-option-ref>     --remote
```

The calendar opens once and accepts both pickup + return clicks before closing. Time pickers open separately for pickup and return. Default time is 12:00 PM if you don't override.

### 5. Submit and grab the constructed deep-link

```bash
browse click <show-cars-button-ref> --remote
browse wait load --remote
browse wait timeout 4000 --remote    # offer cards render 2-4s after `load`
DEEPLINK=$(browse get url --remote)  # capture for cache/replay
```

`DEEPLINK` will look like:

```
https://www.sixt.com/betafunnel/#/offerlist
  ?zen_pu_location=a70b64b2-6cb4-4828-ba9d-a091ada36870
  &zen_do_location=a70b64b2-6cb4-4828-ba9d-a091ada36870
  &zen_pu_title=Los%20Angeles%20Int%20Airport
  &zen_do_title=Los%20Angeles%20Int%20Airport
  &zen_pu_time=2026-06-10T10%3A00
  &zen_do_time=2026-06-14T10%3A00
  &zen_pu_branch_id=BRANCH%3A40352
  &zen_do_branch_id=BRANCH%3A40352
  &zen_offer_matrix_id=37e8a8ba-4682-48d5-a328-6dea803ece55   <-- ephemeral, can be dropped
  &zen_vehicle_type=car
  &zen_pickup_country_code=US
  &zen_resident_country_required=false
  &zen_point_of_sale=US
  &zen_filters=%7B%22group_type%22%3A%5B%5D%2C...%7D         <-- empty JSON object also works
  &zen_order_is_ascending=false
  &zen_order_by=
```

Once the `(zen_pu_location, zen_pu_branch_id)` pair for a branch is known, you can skip steps 2-4 on subsequent runs and `browse open "$URL"` directly — the page re-renders the full offer list on cold load. **`zen_offer_matrix_id` is NOT required** (confirmed: removing it still produces a full offer list). The location UUID + `BRANCH:<id>` pair is the only branch-identity primary key.

Cache `{display_name → (location_uuid, branch_id)}` keyed by airport code / city — discovery costs one full homepage flow (~25-30 turns); replay costs one URL open (1 turn).

### 6. Extract offers from the rendered markdown

```bash
browse get markdown body --remote > offers.md
```

The markdown serialization is dense and reliable. Each offer card is a `####` h4 block:

```
#### Compact Sedan
NISSAN VERSA
Or similar model
5            <- seats
3            <- doors (note: doors include the trunk hatch; "4" usually means 4-door)
Automatic    <- transmission
![Compact Sedan](https://www.sixt.com/.../nissan-versa-4d-grey-2023.png)
Unlimited miles
41$51$41.51/day    <- per-day price (the doubled "41$51" + "$41.51" comes from the markdownifier reading both <span> and aria-label; the canonical "/day" half is "$41.51")
251$14$251.14total <- total price for the whole rental
```

Regex to parse each block (line-by-line):
- **vehicle_class** = the `####` header text, e.g. `Compact Sedan`, `Intermediate SUV`, `Fullsize Convertible`. Sixt's class names follow `<Size> [Elite] <Body>` where Size ∈ `{Mini, Economy, Compact, Intermediate, Standard, Fullsize, Premium, Luxury}`, Body ∈ `{Sedan, SUV, Hatchback, Convertible, Pick-up, Van, Wagon}`, and the optional `Elite` qualifier indicates premium brand (BMW/Mini/Mercedes-style).
- **sample_model** = next non-empty line below the heading (e.g. `NISSAN VERSA`).
- **brand_tag** = next line: `Or similar model` (generic) or `Premium Brand` (Elite tier).
- **seats / doors / transmission** = the next three single-token lines.
- **badges** = optional lines `Top pick`, `Highly rated`, `Hot offer` (in their own short lines).
- **mileage_policy** = the line immediately above the price, e.g. `Unlimited miles` or `700 miles included`.
- **price_per_day** = parse the `/day` line; the canonical value is the dotted form after the second `$`: `41$51$41.51/day` → `$41.51`.
- **total_price** = the `total` line; same pattern: `251$14$251.14total` → `$251.14`.
- **image_url** = the `![alt](url)` PNG href, useful for visual confirmation of vehicle class.

Currency symbol on the price strings reflects the page's locale (`$` for US point-of-sale, `€` for DE, `£` for UK). Read it once from the header `EN | $` button label.

### 7. Filter to the requested vehicle class

**Filter client-side, not via URL.** The `zen_filters` URL param exists but its filter-key enum (`group_type`, `passengers_count`, `bags_count`, `minimum_driver_age`, `features`, `special_rentals`) does NOT accept human-readable category names — passing `{"group_type":["compact"]}` in a fresh navigation returns the full unfiltered list. The reliable approach is to read every offer card and filter the parsed array by a substring match against `vehicle_class`:

```js
const requested = "Compact";  // user's preferred class
const matches = offers.filter(o => o.vehicle_class.toLowerCase().includes(requested.toLowerCase()));
// matches will include "Compact Sedan", "Compact SUV", "Compact Elite SUV", etc.
```

If the request is more specific (e.g. "Compact SUV"), tighten the substring. If it returns no matches, surface the full list as `closest_alternatives` so the caller can pick.

### 8. Release the session

```bash
browse cloud sessions update "$sid" --status REQUEST_RELEASE
```

## Site-Specific Gotchas

- **READ-ONLY.** Never click the per-card "Book Now" or the offer-detail "Continue" button — that progresses into the booking funnel (extras → driver details → payment).
- **`browse type` is unsafe for multi-word inputs.** `browse type Los Angeles International Airport` errors with `Unexpected arguments: Angeles, International, Airport`. Use `browse fill '<selector>' "<quoted phrase>"` instead. `browse fill` does not auto-press Enter on the Sixt typeahead, so you must `browse click` the dropdown suggestion explicitly.
- **Privacy/cookie dialog blocks the form.** A modal overlay covers the search inputs on first visit; clicks on the form silently no-op until it is dismissed. The dialog's OK ref shifts between snapshots — re-snapshot before clicking.
- **`zen_filters` server-side filtering is broken / undocumented.** Passing `{"group_type":["compact"]}` (or any human-readable category name) returns the full unfiltered list; the page applies filters in-client after fetch. Always parse-and-filter client-side. If you need server-side filtering, you would have to drive the on-page Filters UI (a sidebar/modal with checkboxes), but that costs ~5-10 extra turns vs ~0 for client-side filter.
- **`zen_offer_matrix_id` is ephemeral but optional.** A new value is minted per search; removing it from the URL still yields a full offer list on cold navigation. Don't cache it.
- **`zen_pu_location` is a UUID, not a guessable code.** The location-UUID for each branch (e.g. `a70b64b2-6cb4-4828-ba9d-a091ada36870` for LAX) is opaque and must be discovered via the homepage typeahead the first time you target a branch. Cache `{airport_code → (location_uuid, branch_id)}` after first discovery to avoid the ~25-turn cold-discover cost on repeat runs.
- **`BRANCH:<n>` is the Sixt internal station id.** It's surfaced both in `zen_pu_branch_id` and (un-prefixed) in the page's analytics events as `pickup_station_id=40352`. The `40352` numeric form alone is also exposed in `window.dataLayer` GA events if you need a stable canonical id.
- **No JSON/REST API.** Sixt's backend uses binary gRPC-Web at `grpc-prod.orange.sixt.com/com.sixt.service.rent_booking.api.SearchService/{GetSelectedLocation,GetBranchRecommendations,...}`. The wire format is protobuf — not practical to call directly without the .proto definitions, and the endpoint requires browser-context auth/csrf cookies. **Don't waste time looking for a public JSON endpoint — it doesn't exist.** `/php/reservation/*` paths 302 back to `/`.
- **Price markdown is doubled.** `browse get markdown body` renders prices as `41$51$41.51/day` because the page interleaves a visual integer/decimal split (`<span>41</span><span>$</span><span>51</span>`) with a hidden full-dollar-string. Take the value after the second `$` (`$41.51/day`) as canonical.
- **"doors" includes the rear hatch on SUVs/wagons.** A 4-door sedan is "4"; a 4-door SUV with a tailgate is also "4" or "5" depending on Sixt's catalog; a 2-door convertible is "3" (two side doors + 1 trunk). Treat the value as Sixt-reported, not as a passenger-door count.
- **Mileage policy varies by class.** Most US offers are `Unlimited miles`; some premium SUVs (BMW X3 M50, X5 M60, X7; Cadillac Escalade) show `700 miles included` (with per-mile overage fees not displayed on the card). Surface the string verbatim.
- **Locale auto-detection follows the egress IP.** EN/USD for US, DE/EUR for Germany, etc. Override via the language/currency selector in the header (`button: Change language or currency`). For consistent USD pricing, force a US-egress Browserbase proxy.
- **Footer airport-code link doesn't deep-link to offerlist.** `/car-rental/usa/los-angeles/los-angeles-international-airport/` is a marketing landing page, not a search-prefilled URL. You still need to drive the typeahead from the home page.
- **GraphQL/REST anti-pattern.** All hopeful endpoints — `/php/reservation/locations`, `/php/reservation/branches`, `/api/v3/locations/search` — return `400 Bad Request` or `302 → /`. They exist as routes but reject anything but their internal call shape. Don't probe them.

## Expected Output

```json
{
  "success": true,
  "pickup_location": "Los Angeles International Airport (LAX)",
  "pickup_branch_id": "BRANCH:40352",
  "pickup_location_uuid": "a70b64b2-6cb4-4828-ba9d-a091ada36870",
  "dropoff_location": "Los Angeles International Airport (LAX)",
  "dropoff_branch_id": "BRANCH:40352",
  "pickup_at": "2026-06-10T10:00",
  "dropoff_at": "2026-06-14T10:00",
  "rental_days": 4,
  "preferred_class": "Compact",
  "currency": "USD",
  "results_url": "https://www.sixt.com/betafunnel/#/offerlist?zen_pu_location=…",
  "offers_matching_preferred_class": [
    {
      "vehicle_class": "Compact Sedan",
      "sample_model": "NISSAN VERSA",
      "brand_tag": "Or similar model",
      "seats": 5,
      "doors": 3,
      "transmission": "Automatic",
      "air_conditioning": true,
      "mileage_policy": "Unlimited miles",
      "badges": [],
      "price_per_day": 41.51,
      "total_price": 251.14,
      "currency": "USD",
      "image_url": "https://www.sixt.com/fileadmin2/files/global/sideview/user_upload/fleet/png/752x500/nissan-versa-4d-grey-2023.png"
    },
    {
      "vehicle_class": "Compact SUV",
      "sample_model": "VOLKSWAGEN TAOS",
      "brand_tag": "Or similar model",
      "seats": 5,
      "doors": 2,
      "transmission": "Automatic",
      "air_conditioning": true,
      "mileage_policy": "Unlimited miles",
      "badges": [],
      "price_per_day": 41.15,
      "total_price": 251.89,
      "currency": "USD",
      "image_url": "https://www.sixt.com/fileadmin2/files/global/sideview/user_upload/fleet/png/752x500/vw-taos-suv-black-2025.png"
    }
  ],
  "all_offers": [
    { "vehicle_class": "Intermediate Elite SUV", "sample_model": "BMW X1", "brand_tag": "Premium Brand", "seats": 5, "doors": 4, "transmission": "Automatic", "mileage_policy": "Unlimited miles", "badges": ["Top pick", "Hot offer"], "price_per_day": 51.99, "total_price": 309.24 },
    { "vehicle_class": "Compact Sedan",          "sample_model": "NISSAN VERSA", "brand_tag": "Or similar model", "seats": 5, "doors": 3, "transmission": "Automatic", "mileage_policy": "Unlimited miles", "badges": [], "price_per_day": 41.51, "total_price": 251.14 },
    { "vehicle_class": "Premium Elite SUV",      "sample_model": "BMW X7",        "brand_tag": "Premium Brand",     "seats": 7, "doors": 4, "transmission": "Automatic", "mileage_policy": "700 miles included", "badges": [], "price_per_day": 72.45, "total_price": 417.44 }
  ]
}
```

### Alternate outcome shapes

```json
// No matches for the requested class — surface the full list under closest_alternatives
{
  "success": true,
  "offers_matching_preferred_class": [],
  "no_matches_reason": "Sixt does not offer 'Hatchback' as a vehicle class at this branch",
  "closest_alternatives": [ /* every offer on the page */ ]
}

// Branch unknown / typeahead returned no suggestions
{
  "success": false,
  "reason": "branch_not_found",
  "queried_location": "Some Tiny Airport (XYZ)",
  "error_reasoning": "Sixt typeahead returned 0 results for 'Some Tiny Airport (XYZ)'. Branch may not exist in the Sixt network."
}

// Date range outside available booking window (Sixt accepts up to ~12 months out)
{
  "success": false,
  "reason": "date_out_of_range",
  "error_reasoning": "Pickup date 2027-12-01 is beyond Sixt's booking window. The calendar widget did not expose months past <observed-cap>."
}

// Anti-bot / Cloudflare block
{
  "success": false,
  "reason": "blocked",
  "error_reasoning": "Cloudflare interstitial / 403 served by /betafunnel/. Retry with --verified --proxies and confirm the session was created with a US-egress IP."
}
```
