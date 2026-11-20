---
name: boonemanoraptshouston-com-view-amenities-and-floor-plans-pjzu84
title: Boone Manor Amenities & Floor Plans
description: >-
  Extracts Boone Manor's building and neighborhood amenities plus the full
  floor-plan catalog (beds, baths, square footage, base rent, all-in price,
  availability, lease term) from the property's static server-rendered HTML.
website: boonemanoraptshouston.com
category: real-estate
tags:
  - real-estate
  - apartments
  - floor-plans
  - amenities
  - pricing
  - houston
source: 'browserbase: agent-runtime 2026-05-30'
updated: '2026-05-30'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      A scripted browser reaches the same data, but it is overkill: every page
      renders the full catalog server-side, so a plain HTTP GET is faster and
      more reliable. Use the browser only if you also need screenshots or
      interactive floor-plan images.
  - method: api
    rationale: >-
      No clean public JSON API was found. Pricing/availability are baked into
      the page HTML as data-* attributes by the Spherexx platform; there is no
      separate availability endpoint worth hitting.
verified: false
proxies: false
---
# Boone Manor Amenities & Floor Plans

## Purpose

Read-only skill that returns a complete picture of Boone Manor (a luxury high-rise in Houston's Museum District): the in-unit and community amenities, the surrounding neighborhood perks, and the full floor-plan catalog with bedrooms, bathrooms, square footage, base rent, total ("all-in") monthly price, availability, and quoted lease term. All data lives in static, server-rendered HTML — no login, no JavaScript execution, and no API authentication are required.

## When to Use

- A user asks "what amenities does Boone Manor have?" (in-unit vs. community).
- A user wants to know what's nearby / the neighborhood (dining, arts, shopping, location).
- A user wants the list of floor plans, or wants pricing/availability for a specific unit type (studio, 1/2/3-bedroom, or a named penthouse plan).
- A user wants to compare square footage, bed/bath counts, or rent across plans.
- A user needs the fee breakdown that turns "base rent" into the advertised monthly price.

## Workflow

The recommended method is **`fetch`** (plain HTTP GET). Every page on this site is rendered server-side by the Spherexx platform; the floor-plan pricing, availability, amenities, and neighborhood content are all present in the initial HTML response. A headless browser is unnecessary — a single GET per page returns everything. (A browser fallback is documented at the end for screenshot capture.)

1. **Always use the `www.` host.** The apex domain `https://boonemanoraptshouston.com/` returns a `301` redirect to `https://www.boonemanoraptshouston.com/`. Request the `www.` URLs directly to avoid the hop.

2. **Get the amenities** — fetch `https://www.boonemanoraptshouston.com/amenities/`. The complete categorized list is inside the `div.amenity__full-list-content` block, grouped under `<h3>` category headings (`Apartments` = in-unit, `Community` = building/shared). The 15 items shown in the hero (`li.amenity__item`) are the same set, just un-grouped.

3. **Get the neighborhood** — fetch `https://www.boonemanoraptshouston.com/neighborhood/`. Content lives in the `section.neighborhood-perks` slider: four category headlines (`Central Location`, `Dining & Restaurants Nearby`, `Local Arts & Culture`, `Shopping Nearby`) each with a `div.desktop-description` paragraph that names specific nearby places.

4. **Get the FULL floor-plan catalog** — do NOT rely on `/floorplans/` alone (it only renders *currently available* "Featured Plans" — 3-4 articles). To enumerate all 34 plans including the unavailable ones, fetch each per-type page:
   - `https://www.boonemanoraptshouston.com/floorplans/studio/`
   - `https://www.boonemanoraptshouston.com/floorplans/1bedroom/`
   - `https://www.boonemanoraptshouston.com/floorplans/2bedroom/`
   - `https://www.boonemanoraptshouston.com/floorplans/3bedroom/`
   - `https://www.boonemanoraptshouston.com/floorplans/penthouse/`

5. **Parse each `<article class="floorplans__floorplan">`.** Numeric pricing is in `data-*` attributes on the `<article>`; the human-readable bed/bath/sqft/availability/term are in the article's text:
   - `data-fp` — internal floor-plan ID (stable, e.g. `12596`)
   - `data-base-price` / `data-base-unit-price` — base rent (e.g. `2376`)
   - `data-fee-total-property` — mandatory monthly fee bundle added to base (`149`)
   - `data-fee-total-floorplan` — plan-specific fee add (usually `0`)
   - `data-all-in` — advertised "Total Monthly Leasing Price" = base + fees (e.g. `2525`)
   - Article text yields: plan name, `STUDIO`/`N BED`, `N Bath`, `### SF` (or a range like `849-868 SF`), the quoted lease term (e.g. `14 months`), and the availability token (`N Available`, a date like `7-14-2026`, or `Call For Pricing` + `Not Currently Available`).

6. **(Optional) Fee detail** — `https://www.boonemanoraptshouston.com/floorplans/` contains a "Fee Overview" section enumerating one-time and monthly fees. The four mandatory monthly "Essentials" (Amenity $85, Pest Control $6, Trash $30, Package Locker $28) sum to the `$149` `data-fee-total-property` value baked into every all-in price.

7. **Assemble** the JSON per the Expected Output schema.

### Browser fallback

If you need screenshots or the interactive floor-plan diagrams/photos, drive a remote browser session (no stealth needed — see gotchas):

```bash
sid=$(browse cloud sessions create --keep-alive | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const i=s.indexOf('{');process.stdout.write(JSON.parse(s.slice(i)).id)})")
export BROWSE_SESSION="$sid"
browse open "https://www.boonemanoraptshouston.com/floorplans/2bedroom/" --remote
browse get markdown body --remote          # rendered DOM matches the fetched HTML
browse screenshot --remote --path out.png
browse cloud sessions update "$sid" --status REQUEST_RELEASE
```

## Site-Specific Gotchas

- **`/floorplans/` only lists available units.** Its "Featured Plans" section renders just the 3-4 plans with live availability. The complete 34-plan catalog (including 25+ plans marked "Not Currently Available / Call For Pricing") is only reachable via the per-bedroom pages (`/floorplans/studio/`, `/1bedroom/`, `/2bedroom/`, `/3bedroom/`, `/penthouse/`). Skipping these will silently undercount the catalog.
- **Apex → www 301.** `boonemanoraptshouston.com` redirects to `www.boonemanoraptshouston.com`. Use `www.` directly.
- **No anti-bot, no stealth required.** Pre-run probe reported no anti-bots; a bare `browse cloud fetch` (no `--proxies`) and a bare browser session (no `--verified`/`--proxies`) both returned full content with `200`. Don't waste budget enabling stealth here.
- **Pricing is in HTML, not an API.** There is no separate availability/pricing JSON endpoint worth calling — the Spherexx backend embeds everything as `data-*` attributes on `<article class="floorplans__floorplan">`. Parse the HTML; don't hunt for `/api/...`.
- **"All-in" ≠ base rent.** The big advertised number ("X.00 /mo*", `data-all-in`) is the *Total Monthly Leasing Price* = base rent + `$149` mandatory monthly fees. The asterisk on the page footnotes this. Surface both `base_price` and `all_in_price` so users aren't surprised.
- **Availability token has three shapes:** a count ("`2 Available`"), a future move-in date ("`7-14-2026`", meaning available from that date), or "`Not Currently Available`" paired with "`Call For Pricing`" (no price shown — `data-all-in`/`data-base-price` absent or zero). Normalize accordingly.
- **Square footage can be a range** (e.g. `689-733 SF`, `849-868 SF`) when multiple unit variants share a plan name. Preserve the range string rather than forcing a single integer.
- **Penthouse plans use coded names** (`E2PH`, `A3PH`, `B10PH`, …) instead of "The {Name}" names; they live under `/floorplans/penthouse/` and `/penthouse-collection/`. As of the last capture, only 2 of the 15 penthouse plans were available.
- **Promotional banner is dynamic marketing copy** ("Spring Into Savings – Up to 8 Weeks Free", "Medical Center & Student 'Match' Specials"). It is not a per-plan discount and is not reflected in `data-all-in`; treat it as a site-wide concession note, not authoritative pricing.
- **Values change frequently.** Prices, availability counts, and move-in dates update as units lease. The IDs (`data-fp`), names, bed/bath, and sqft are stable; price/availability are point-in-time. Re-fetch for current numbers.

## Expected Output

```json
{
  "property": {
    "name": "Boone Manor",
    "location": "Museum District, Houston, TX",
    "phone": "281.941.6221",
    "text": "844.478.7502",
    "current_promotion": "Spring Into Savings – Up to 8 Weeks Free (restrictions apply)"
  },
  "amenities": {
    "apartment": [
      "Stone Countertops",
      "Engineered Hardwood Flooring Throughout",
      "Custom Built-In Closets",
      "Stainless Steel Appliances"
    ],
    "community": [
      "Resort Style Pool on the 5th floor",
      "Cafe/Bar on Ground Floor",
      "Fitness Facility",
      "Penthouse Lounge Overlooking Downtown",
      "On-Site Concierge",
      "Mail Center with Package Lockers",
      "EV Charging Stations",
      "Oversized Bicycle Storage Room",
      "Gated VIP Parking",
      "Abundant Resident Parking",
      "Resident exclusive credit building program by paying monthly rent on time"
    ]
  },
  "neighborhood": {
    "summary": "Located in the heart of Houston's Museum District, near Rice University, surrounded by dining, shopping, arts, and entertainment.",
    "perks": [
      { "category": "Central Location", "detail": "Heart of the city in the Museum District." },
      { "category": "Dining & Restaurants Nearby", "detail": "MF Sushi, BCN Taste & Tradition, The Pit Room, and more." },
      { "category": "Local Arts & Culture", "detail": "Houston Zoo, Children's Museum of Houston, Museum of Fine Arts." },
      { "category": "Shopping Nearby", "detail": "Nearby shopping centers covering everyday needs." }
    ]
  },
  "fees": {
    "move_in": [
      { "name": "Application Fee", "amount": "$75.00", "cadence": "one-time", "required": true },
      { "name": "Administration Fee", "amount": "$300.00", "cadence": "one-time", "required": true },
      { "name": "Standard Security Deposit", "amount": "$1,000.00", "cadence": "one-time", "required": true },
      { "name": "Additional Security Deposit", "amount": "1 month's rent", "cadence": "one-time", "required": "situational" }
    ],
    "monthly_essentials": [
      { "name": "Amenity Fee", "amount": "$85.00" },
      { "name": "Pest Control Fee", "amount": "$6.00" },
      { "name": "Trash Fee", "amount": "$30.00" },
      { "name": "Package Locker Fee", "amount": "$28.00" }
    ],
    "monthly_essentials_total": "$149.00",
    "optional": [ { "name": "Parking Fee", "amount": "$15.00", "cadence": "monthly" } ],
    "situational": [
      { "name": "Reletting Fee", "amount": "85% of rent" },
      { "name": "Return Payment", "amount": "$50.00" },
      { "name": "Late Fee", "amount": "$100.00" }
    ]
  },
  "floor_plans": [
    {
      "id": "12596",
      "name": "The Jensen",
      "type": "2bedroom",
      "bedrooms": 2,
      "bathrooms": 2,
      "square_feet": "977",
      "base_price": 2376,
      "all_in_price": 2525,
      "lease_term_months": 14,
      "availability": { "status": "available", "units_available": 2, "available_date": null }
    },
    {
      "id": "12606",
      "name": "The Tillander",
      "type": "studio",
      "bedrooms": 0,
      "bathrooms": 1,
      "square_feet": "689-733",
      "base_price": 1791,
      "all_in_price": 1940,
      "lease_term_months": 12,
      "availability": { "status": "available", "units_available": null, "available_date": "2026-06-12" }
    },
    {
      "id": "12589",
      "name": "The Farnham",
      "type": "1bedroom",
      "bedrooms": 1,
      "bathrooms": 1,
      "square_feet": "758",
      "base_price": null,
      "all_in_price": null,
      "lease_term_months": null,
      "availability": { "status": "not_available", "units_available": 0, "available_date": null }
    }
  ],
  "catalog_summary": {
    "total_plans": 34,
    "by_type": { "studio": 2, "1bedroom": 7, "2bedroom": 9, "3bedroom": 1, "penthouse": 15 }
  }
}
```

Notes on the schema:
- `square_feet` is a string to preserve ranges (e.g. `"849-868"`).
- `bedrooms: 0` denotes a studio.
- `availability.status` is one of `available` (has `units_available` count or a future `available_date`) or `not_available` (shown as "Call For Pricing / Not Currently Available", with prices null).
- `all_in_price = base_price + fee_total_property (149) + fee_total_floorplan (0)`. Report both base and all-in.
- The example lists three representative plans; a full run returns all 34 articles parsed from the five per-type pages.
