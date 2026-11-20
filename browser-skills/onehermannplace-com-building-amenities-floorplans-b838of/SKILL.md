---
name: onehermannplace-com-building-amenities-floorplans-b838of
title: One Hermann Place Amenities & Floor Plans
description: >-
  Summarize One Hermann Place's building and neighborhood amenities and list its
  floor plans with prices, availability, lease terms, beds, baths, and square
  footage.
website: onehermannplace.com
category: real-estate
tags:
  - real-estate
  - apartments
  - floor-plans
  - amenities
  - pricing
  - greystar
  - sightmap
source: 'browserbase: agent-runtime 2026-05-30'
updated: '2026-05-30'
recommended_method: hybrid
alternative_methods:
  - method: api
    rationale: >-
      Floor plans, units, live pricing, availability dates, lease terms and
      itemized fees come fully structured from the SightMap JSON API
      (sightmap.com/app/api/v1/{clientKey}/sightmaps/{id}) — the single best
      source for the floor-plan portion.
  - method: fetch
    rationale: >-
      Building amenities (/amenities/) and neighborhood amenities
      (/neighborhood/) are server-rendered static HTML; a plain HTTP GET + HTML
      parse returns the full lists with no JS execution.
  - method: browser
    rationale: >-
      Only needed as a fallback if the SightMap embed ID cannot be located in
      the page source; the /floorplans/ JonahWidget renders the same unit cards
      client-side.
verified: false
proxies: false
---
# One Hermann Place Amenities & Floor Plans

## Purpose

This skill collects three things about **One Hermann Place** (a Greystar luxury apartment community at 1699 Hermann Drive, Houston, TX 77004): (1) the building/community amenities, (2) the surrounding neighborhood amenities, and (3) the floor-plan catalog with per-unit prices, availability dates, lease terms, bedroom/bathroom counts, and square footage. It is **read-only** — it gathers and structures published marketing/availability data and never starts an application or lease. The fastest, most complete path mixes two plain HTTP GETs: a **SightMap JSON API** for floor plans / units / live pricing, and two **server-rendered HTML pages** for the amenity lists. No browser automation, proxies, or stealth are required (the site's only anti-bot is a passive reCAPTCHA v3, which does not gate these resources).

## When to Use

- A renter or relocation agent wants a one-shot summary of what One Hermann Place offers (in-unit features, community amenities, penthouse perks) plus what's nearby.
- You need the current list of **available units** with rent, total monthly leasing price, move-in date, lease term, beds, baths, and sq. ft.
- You need the full **floor-plan type catalog** (studio / 1–3 bedroom layouts and penthouses) regardless of current availability.
- You're building a comparison sheet across Greystar / SightMap-powered apartment sites (the same recipe generalizes — see Gotchas).

## Workflow

The recommended method is **hybrid**: SightMap JSON API for floor-plan/unit data, plain HTML fetch for amenities. All steps are HTTP GETs (use `browse cloud fetch <url>` or any HTTP client).

### Step 1 — Floor plans, units, pricing & availability (SightMap JSON API)

1. **Find the SightMap embed hash.** GET `https://onehermannplace.com/floorplans/`. The server-rendered HTML contains a reference to `https://sightmap.com/embed/{hashId}` (current value: **`rxwj9l7dp1e`**). Grep for `sightmap.com/embed/`.
2. **Resolve the API URL.** GET `https://sightmap.com/embed/{hashId}?enable_api=1&origin=https://onehermannplace.com`. The HTML defines `window.__APP_CONFIG__`; read `sightmaps[0].href`, which is the data endpoint:
   `https://sightmap.com/app/api/v1/{clientKey}/sightmaps/{sightmapId}`
   (current value: **`https://sightmap.com/app/api/v1/y8px0glzp19/sightmaps/27626`**).
3. **Fetch the data.** GET that href → a single ~290 KB JSON document `{ "data": { ... } }`. Key fields:
   - `data.floor_plans[]` — the plan catalog. Each entry has `id`, `name` (e.g. `A6.5`, `B10.1`, `S2.0`), `bedroom_count`, `bathroom_count`, `bedroom_label` (e.g. `"Studio"`, `"1 Bed"`), `filter_label`, `image_url`.
   - `data.units[]` — currently **available** units. Each has `unit_number`, `area` (sq. ft, integer), `floor_plan_id`, `floor_id`, `building`, `price` + `display_price` (base rent), `total_price` + `total_display_price` (Total Monthly Leasing Price = base + mandatory fees), `available_on` + `display_available_on`, `display_lease_term`, and `static_expenses[]` (fully itemized monthly / one-time / optional fees with `expense_amounts`).
   - `data.amenities[]` — a short list of amenity **photo galleries** (Pool, Club, Fitness, Yoga, Leasing, Sky Lounge). This is NOT the full amenity list — use Step 2 for that.
4. **Join** `units[].floor_plan_id` → `floor_plans[].id` to attach beds/baths/plan name to each available unit, and group `floor_plans[].name` by the prefix before the first `.` (e.g. `A6.0…A6.14` → base plan **A6**) to recover the ~39 user-facing plan types.

### Step 2 — Building / community amenities (server-rendered HTML)

GET `https://onehermannplace.com/amenities/` and parse the `<ul>` lists under the three headings. They come back fully rendered (no JS needed):
- **Apartment Features** (in-unit finishes/appliances)
- **Community Amenities** (building/shared spaces & services)
- **Penthouse Amenities** (top-floor exclusives)

Items marked with a trailing `*` are "available in select homes only" (footnote on the page).

### Step 3 — Neighborhood amenities (server-rendered HTML)

GET `https://onehermannplace.com/neighborhood/`. Below the Google map are categorized POI lists — **Restaurants, Coffee, Shopping, Recreation** — plus a **Walk Score®** block (Bike / Walk / Transit scores). All present in the static HTML.

### Browser fallback

If the SightMap embed hash can't be located (e.g. markup changes), drive the `/floorplans/` page in a browser: it renders the same unit cards client-side via the JonahWidget. Open the page, wait ~5 s for the widget to hydrate, then read the DOM/markdown. Each rendered card carries plan code, unit #, availability, beds/baths/sq.ft, Total Monthly Leasing Price, lease term, and base rent. A bare (non-stealth, no-proxy) remote session is sufficient. The amenities and neighborhood pages need no browser at all — plain fetch works.

## Site-Specific Gotchas

- **Use SightMap for pricing/availability, the website for marketing bed labels.** The two sources can disagree on bedroom count. Example: plan **S1** (628 sq. ft, unit #1119) is marketed as a **"Studio"** on the website's floor-plan widget, but the SightMap `floor_plans` entry `S1.1` reports `bedroom_count: 1` / `bedroom_label: "1 Bed"`. Treat S-series (`S1`, `S2`) as studios per the site, and cross-check `bedroom_label` rather than blindly trusting `bedroom_count`.
- **`floor_plans` is over-counted by pricing variants.** The API returns ~76 entries because each base plan can have multiple revenue-management variants (`A6.0` … `A6.14` is 15 variants of one layout). Collapse on the prefix before the first `.` (and strip a trailing `F`) to get the ~39 real layouts. There is also a placeholder plan named **`TEMP`** (`filter_label: "Coming Soon"`) — drop it.
- **`units[]` is only what's currently available** (10 units at capture time), not the full unit inventory. Sold-out plan types appear in `floor_plans` but have no entry in `units`, so they have no live price or sq. ft from this endpoint. For sq. ft of a sold-out layout, use the per-plan pages `https://onehermannplace.com/floorplans/{code}/` (e.g. `/floorplans/p2/`).
- **Two different "prices."** `price`/`display_price` is **base rent**; `total_price`/`total_display_price` is the **Total Monthly Leasing Price** (base rent + all mandatory monthly fees ≈ +$112.75/mo here, e.g. Community Amenity Fee $65, Trash $25, Boiler Mgmt $16.75, Pest $3, Gas Admin $3). The website's filter and cards display the *total*, so a unit shown as "$1,993.75" has a base rent of "$1,881.00". Report whichever the consumer asked for, but label it.
- **`area` is per-unit (integer sq. ft)**, lives on `units[]`, not on `floor_plans[]`. `display_area` is the pre-formatted string (`"544 sq. ft."`).
- **The `_fp-renderable` endpoint is a dead end for direct fetching.** `https://onehermannplace.com/floorplans/_fp-renderable/...` returns **302** without the dynamic per-page `instance` token, and even then yields HTML chunks, not JSON. Don't reverse-engineer it — go straight to SightMap (cleaner) or render the widget in a browser.
- **No stealth needed.** Homepage probe shows only `recaptcha:v3` (passive scoring). Plain `browse cloud fetch` (no `--verified`, no `--proxies`) returned 200 on all four resources (floorplans page, SightMap embed, SightMap API, amenities/neighborhood pages), and a bare remote browser session rendered the widget fine.
- **IDs are per-property, not hardcodeable across sites.** The hash `rxwj9l7dp1e`, clientKey `y8px0glzp19`, and sightmapId `27626` are specific to One Hermann Place. Always re-discover them via Steps 1–2. The recipe generalizes to any SightMap-powered (Engrain/RealPage) Greystar site.
- **Move-in date / pricing can shift.** SightMap prices are revenue-managed and refresh; availability counts change daily. Re-fetch for live numbers; the values in Expected Output are a 2026-05-30 snapshot.

## Expected Output

```json
{
  "property": {
    "name": "One Hermann Place",
    "address": "1699 Hermann Drive, Houston, TX 77004",
    "phone": "713-766-1260",
    "management": "Greystar",
    "sightmap": {
      "embed_hash": "rxwj9l7dp1e",
      "api_url": "https://sightmap.com/app/api/v1/y8px0glzp19/sightmaps/27626"
    }
  },
  "building_amenities": {
    "apartment_features": [
      "GE Premium Café stainless steel appliance package",
      "Quartz countertops",
      "Kitchen prep island with crystal pendants",
      "Built-in beverage cooler (select)",
      "Frameless glass shower (select)",
      "Spa soaking tub",
      "FSC-certified wide plank wood flooring",
      "Front loading GE full-size washer & dryer",
      "Nest thermostat with mobile control",
      "Walk-in closets",
      "8' & 10' ceilings on floors 2-6; 10'/13' on 1st & 7th floors"
    ],
    "community_amenities": [
      "Lobby Café with lounge seating",
      "Club Lounge with Starbucks coffee bar",
      "Executive conference room",
      "Sky Lounge with catering kitchen",
      "Concierge services",
      "Electric car-charging stations",
      "Direct access-garage parking (6-level, rooftop on level 6)",
      "24/7 emergency maintenance",
      "Wi-Fi throughout common areas",
      "Storage units & bicycle storage room",
      "6,000 SF dog park",
      "Complimentary Mercedes Benz shuttle to Med Center",
      "12,000 SF resort-style pool courtyard",
      "Summer kitchen with gas grills + raised fire pit"
    ],
    "penthouse_amenities": [
      "5 unique floor plans / finish packages",
      "10-foot ceilings",
      "Floor-to-ceiling glass walls",
      "GE Monogram appliances",
      "Kohler fixtures with rain shower heads",
      "Freestanding soaking tub",
      "Full-length & wraparound balconies (select)"
    ]
  },
  "neighborhood_amenities": {
    "restaurants": ["Lucille's", "Monarch", "Barnaby's Café", "Fadi's Eatery", "Local Foods", "Sixty Vines", "Coppa Osteria", "Navy Blue", "Island Grill", "Helen Greek Food & Wine"],
    "coffee": ["Java Lava Café", "Agnes", "Grinder's Coffee Bar", "Fellini Café", "Bitty & Beau's Coffee"],
    "shopping": ["Rice Village", "Banana Republic", "CB2", "DryBar", "Gap", "Sephora", "West Elm", "White House Black Market"],
    "recreation": ["Children's Museum", "Houston Zoo", "Miller Outdoor Theatre", "Houston Museum of Natural Science", "McGovern Centennial Gardens", "The Museum of Fine Arts, Houston"],
    "walk_score": { "bike": 72, "walk": 64, "transit": 61, "source": "https://www.walkscore.com/score/1699-hermann-dr-houston-tx-77004" }
  },
  "floor_plan_catalog": {
    "total_base_plans": 39,
    "notes": "Collapsed from ~76 SightMap pricing variants; excludes 'TEMP'/Coming Soon placeholder.",
    "by_type": {
      "studio_S": ["S1 (studio, marketed)", "S2 (studio)"],
      "one_bed_A": ["A1-A19 (1 bed, 1-2 bath)"],
      "two_bed_B": ["B1-B15 (2 bed, 2-2.5 bath)"],
      "penthouse_P": ["P1 (2bd/2.5ba)", "P2 (3bd/3ba)", "P3 (3bd/3ba)", "P4 (2bd/2.5ba)", "P5 (2bd/3ba)"]
    }
  },
  "available_units": [
    {
      "unit_number": "1114", "plan": "S2", "bedrooms": 0, "bathrooms": 1, "sqft": 544,
      "base_rent": 1881, "total_monthly_leasing_price": 1993.75,
      "available_on": "2026-06-02", "lease_term": "13 Months", "floor": 1, "building": "1"
    },
    {
      "unit_number": "1119", "plan": "S1", "bedrooms": 0, "bathrooms": 1, "sqft": 628,
      "base_rent": 2006, "total_monthly_leasing_price": 2118.75,
      "available_on": "2026-05-29", "lease_term": "13 Months", "floor": 1, "building": "1",
      "note": "Marketed as Studio on site; SightMap classifies as 1 Bed"
    },
    {
      "unit_number": "1134", "plan": "A6", "bedrooms": 1, "bathrooms": 1, "sqft": 912,
      "base_rent": 2318, "total_monthly_leasing_price": 2430.75,
      "available_on": "2026-06-02", "lease_term": "12 Months", "floor": 1, "building": "1"
    },
    {
      "unit_number": "1116", "plan": "A17", "bedrooms": 1, "bathrooms": 2, "sqft": 1189,
      "base_rent": 3006, "total_monthly_leasing_price": 3118.75,
      "available_on": "2026-06-30", "lease_term": "13 Months", "floor": 1, "building": "1"
    },
    {
      "unit_number": "1131", "plan": "B3", "bedrooms": 2, "bathrooms": 2, "sqft": 1279,
      "base_rent": 2861, "total_monthly_leasing_price": 2973.75,
      "available_on": "2026-05-29", "lease_term": "15 Months", "floor": 1, "building": "1"
    },
    {
      "unit_number": "7105", "plan": "P4", "bedrooms": 2, "bathrooms": 2.5, "sqft": 2034,
      "base_rent": 6661, "total_monthly_leasing_price": 6773.75,
      "available_on": "2026-07-27", "lease_term": "14 Months", "floor": 7, "building": "1",
      "note": "Penthouse"
    }
  ],
  "available_unit_count": 10,
  "pricing_note": "base_rent = base rent only; total_monthly_leasing_price = base + mandatory monthly fees (~+$112.75/mo). Prices revenue-managed and subject to change.",
  "captured_at": "2026-05-30"
}
```

Notes on shape:
- `available_units` above is abridged (6 of 10 shown). The full list at capture time also included **1127** (B1, 2bd/2ba, 1186 sq ft, $3,129.75 total, avail 2026-06-27), **2117** (B10, 2bd/2.5ba, 1471 sq ft, $3,945.75, avail 2026-08-09), **6120** (A14, 1bd/1.5ba, 1002 sq ft, $2,903.75, avail 2026-07-14), and **7126** (B14, 2bd/2.5ba, 1585 sq ft, $4,060.75, avail 2026-05-29).
- Each unit can be expanded with the itemized `static_expenses` (monthly/additional/optional fees) straight from the SightMap `units[].static_expenses` array if a full cost breakdown is needed.
