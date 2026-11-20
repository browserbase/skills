---
name: adenineapartments-com-building-amenities-floor-plans-xkt9or
title: Adenine Apartments Amenities & Floor Plans
description: >-
  Extracts Adenine's community amenities, in-unit features, neighborhood
  highlights, and the full floor-plan catalog with per-unit pricing,
  availability, square footage, and bed/bath counts via the embedded SightMap
  JSON API plus the server-rendered marketing pages.
website: adenineapartments.com
category: real-estate
tags:
  - real-estate
  - apartments
  - floor-plans
  - amenities
  - pricing
  - sightmap
  - houston
source: 'browserbase: agent-runtime 2026-05-30'
updated: '2026-05-30'
recommended_method: hybrid
alternative_methods:
  - method: api
    rationale: >-
      SightMap JSON endpoint
      (https://sightmap.com/app/api/v1/05evex4mpqo/sightmaps/20130) returns the
      full floor-plan catalog plus live available units with price/sqft/move-in
      date — authoritative and the only reliable source for floor-plan data (it
      is NOT in the page's static HTML).
  - method: fetch
    rationale: >-
      Amenity and neighborhood text lists ARE server-rendered into /amenities/
      and /neighborhood/, so a plain HTTP GET (HTTP 200, no anti-bot) is
      sufficient for those sections.
  - method: browser
    rationale: >-
      Fallback only: /floorplans/ List View renders the same SightMap data after
      dismissing a pricing modal; slower and unnecessary when the API is
      reachable.
verified: false
proxies: false
---
# Adenine Apartments — Amenities & Floor Plans

## Purpose

Read-only skill that extracts, for the Adenine apartment community (1755 Wyndale St, Houston, TX 77030, Greystar-managed), a structured summary of (1) building/community amenities, (2) in-unit apartment features, (3) neighborhood highlights (nearby restaurants, shopping, recreation, walk/transit/bike scores), and (4) the full floor-plan catalog with per-unit pricing, availability, square footage, bedroom and bathroom counts. The authoritative floor-plan and live-availability data comes from the community's embedded **SightMap** JSON API; the amenity and neighborhood text lists are server-rendered into the Jonah Digital marketing pages and can be fetched directly. No login, form submission, or booking is required or performed.

## When to Use

- A user wants the list of community amenities and apartment features at Adenine.
- A user wants to know what's nearby (dining, shopping, parks, walk/transit scores).
- A user asks "what floor plans does Adenine offer?" / "what's available?" / "how much is a 1-bedroom / 2-bedroom / studio?"
- A user wants currently-available units with price, square footage, move-in date, beds/baths.
- An agent needs a normalized JSON snapshot of the property's offering for comparison shopping.

## Workflow

The fast, reliable path is the **SightMap JSON API** for floor plans + live availability, plus a direct **HTTP fetch** of the marketing pages for amenity/neighborhood text. Browsing the rendered page is unnecessary because floor-plan/availability content is injected client-side (it is *not* in the page's static HTML), but the amenity and neighborhood lists *are* in the static HTML.

### 1. Get floor plans + available units (SightMap API)

The SightMap embed identifiers are stable for this property:

- Embed hash: `dgow3y98v2m`
- Publisher key: `05evex4mpqo`
- SightMap id: `20130`

Fetch the single data endpoint (plain HTTP GET, no proxy/stealth needed):

```
https://sightmap.com/app/api/v1/05evex4mpqo/sightmaps/20130
```

It returns one JSON object under `data` containing, among others:

- `data.floor_plans[]` — the **full catalog** (17 plans). Each has `name`, `bedroom_count`, `bathroom_count`, `bedroom_label`, `bathroom_label`, `image_url`. **No sqft or price here** — those are per-unit.
- `data.units[]` — **only currently-available units** (each: `unit_number`, `floor_plan_id`, `display_area` / `area` (sqft), `display_price` = base rent, `total_display_price` = Total Monthly Leasing Price incl. mandatory fees, `display_available_on` / `available_on`, `floor_id`).
- `data.amenities[]` — SightMap map-marker amenities (`title`), e.g. Pool, Fitness Center, Club Room.
- `data.asset` — `{ id, name: "Adenine" }`; `data.currency_symbol`, `data.monthly_pricing_label`.

Join `units[].floor_plan_id` → `floor_plans[].id` to attach live price/sqft/availability to a plan. Plans with no matching unit are in the catalog but have no live price/sqft via this API (mark as "no current availability").

**To rediscover the IDs if they ever change:** fetch `https://adenineapartments.com/floorplans/`, read the attribute `data-jd-fp-embed-src="https://sightmap.com/embed/<hash>?enable_api=1"`, then fetch that embed URL and read `window.__APP_CONFIG__.sightmaps[0].href` — that string *is* the API endpoint above (publisher key + sightmap id embedded).

### 2. Get building amenities + apartment features

Fetch `https://adenineapartments.com/amenities/` (server-rendered, returns HTTP 200 with no anti-bot challenge). The full lists are present in the HTML even before any "Show All" toggle is clicked. Three groupings appear:

- **Your Apartment** (in-unit features) — items ending in `*` are "Only Available in Select Units".
- **Your Community** (shared/building amenities).
- **Asmartment Property Package / Services** (resident services).

### 3. Get neighborhood summary

Fetch `https://adenineapartments.com/neighborhood/`. Contains an intro paragraph plus three curated lists — **Restaurants**, **Shopping**, **Recreation** — and **Walk Score / Transit / Bike** ratings.

### Browser fallback

If the SightMap API is unreachable, drive a browser to `https://adenineapartments.com/floorplans/`:
1. Dismiss the "Introducing Total Monthly Leasing Price" modal (press `Escape`).
2. The default **List View** renders one card per available unit: floor-plan name (e.g. `A8`), unit number (`#419`), `1 bed 1 bath`, `945 sq. ft.`, `$1,904 /mo*` (total), `$1,809 Base Rent`, and "Available Jul 21".
3. The floor picker shows per-floor availability counts (e.g. "Floor 4 — 1 avail"). The map/embed pulls the same SightMap data. For amenities/neighborhood, navigate to `/amenities/` and `/neighborhood/`. No stealth/proxy required (recaptcha v3 is passive and did not block).

## Site-Specific Gotchas

- **Floor-plan & availability data is NOT in the static HTML of `/floorplans/`.** The page ships ~17 `fp-card` *templates* with `display:none` and hydrates them client-side from SightMap. A naive HTML scrape of `/floorplans/` yields zero pricing/sqft. Use the SightMap API (preferred) or a rendered browser.
- **`floor_plans[]` has no sqft or price; `units[]` does.** Square footage and pricing are properties of individual units, not the abstract plan. The plan catalog only carries name + bed/bath counts + a layout image.
- **`units[]` contains ONLY currently-available units.** At capture time exactly **1** unit was available (unit #419, plan A8, Floor 4). Do not treat the units array length as "number of floor plans" — the catalog has 17 plans. Availability fluctuates; re-fetch for current numbers.
- **Two prices per unit.** `display_price` is *base rent* ($1,809); `total_display_price` is the *Total Monthly Leasing Price* ($1,904) which bundles mandatory monthly fees (Community Amenity Fee, Smart Home Services, etc., enumerated in each unit's `static_expenses`). Report both and label them — the site leads with the total.
- **Select-unit features are flagged with `*`** on the amenities page (e.g. "Chef Islands *", "Exquisite Views *", "Kitchen Storage With Separate Pantry *"). The legend "*Only Available in Select Units" appears at the bottom.
- **Marketing-copy location inconsistency:** the `/floorplans/` intro says "Upper Kirby District" while the homepage, `/amenities/`, and `/neighborhood/` say "Texas Medical Center District." The address (77030) and the neighborhood page are accurate — it's in the Texas Medical Center / Hermann Park area, central Houston. Don't propagate the "Upper Kirby" claim as fact.
- **Greystar-managed property on a Jonah Digital website.** Legal/privacy/DMCA footer links resolve to greystar.com; the SightMap app's internal name is "Modera Flats - SightMap App" (vendor template artifact) — ignore it, the asset name is "Adenine".
- **No anti-bot wall observed.** Homepage probe reported `recaptcha:v3` (passive). Plain `browse cloud fetch` (no `--proxies`, no `--verified`) returns HTTP 200 for the marketing pages and the SightMap API. Don't waste a verified/proxied session on this site.
- The SightMap `units` sub-path (`.../sightmaps/20130/units`) does **not** exist as a separate endpoint — it 404s to an HTML page. Everything is in the single `/sightmaps/20130` payload.

## Expected Output

```json
{
  "property": {
    "name": "Adenine",
    "address": "1755 Wyndale St, Houston, TX 77030",
    "phone": "(346) 620-4497",
    "managed_by": "Greystar",
    "neighborhood": "Texas Medical Center District, central Houston, TX"
  },
  "amenities": {
    "apartment_features": [
      "Chef Islands*", "Choice of Studio, 1-Bedroom, or 2-Bedroom Floor Plans",
      "Designer-Inspired Paint", "Designer Tile Backsplash", "Exquisite Views*",
      "In-Home Washer & Dryer", "Kitchen Storage With Separate Pantry*",
      "Open-Concept Kitchen Featuring a Breakfast Bar", "Oversized Windows",
      "Spa-Like Bathroom with Large Soaking Tub", "Stainless Steel Appliance Package",
      "Under Cabinet Lighting"
    ],
    "community": [
      "24-hour Athletic Club with a Motion Cage Fitness Station", "Business Center",
      "Clubhouse with Coffee & Tea Bar", "Dining Deck", "Online Payments Available",
      "Open-Air Lounger Seating, HDTV, and Outdoor Kitchen", "Outdoor Grill",
      "Parking Garage", "Pet Friendly Apartments", "Amenity Area WiFi",
      "Resident Clubhouse", "Resort Style Pool"
    ],
    "services": [
      "Flexible Rent Payment Options", "Private Amenity Rentals",
      "Resident Package Solutions", "Door-to-Door Valet Trash Service",
      "Online Portal for Service Requests and Payments", "Business/Printer Stations",
      "Gourmet Coffee Machines", "Indoor/Outdoor Entertaining Areas",
      "Outdoor Kitchen Areas", "Pest Control Services",
      "General Common Area and Unit Trash Service"
    ],
    "select_unit_note": "Features marked * are only available in select units.",
    "sightmap_map_markers": ["Pool", "Fitness Center", "Business Center", "Club Room",
      "Outdoor Lounge", "Leasing Office", "Trash", "Mail Room", "Grills"]
  },
  "neighborhood": {
    "summary": "Located in the Texas Medical Center District near Hermann Park (445 acres), Rice Village, the Texas Medical Center, Rice University, University of Houston, and Texas Southern University. Accessible via Hwy 59, Loop 610, and Hwy 288.",
    "restaurants": ["The Pit Room", "Axelrad Beer Garden", "Agora", "Katz's", "The Rustic", "Brass Tacks"],
    "shopping": ["H-E-B", "Target", "Trader Joe's", "Whole Foods Market", "Marshalls & HomeGoods", "Central Market"],
    "recreation": ["Houston Zoo", "Japanese Garden", "Hermann Park", "Regal Edwards Greenway Grand Palace", "Toyota Center", "House of Blues Houston"],
    "scores": { "walk_score": 70, "transit": "80 (Excellent transit)", "bike": "Very Bikeable" }
  },
  "floor_plans": {
    "catalog_count": 17,
    "sqft_filter_range": "500 to 1,400 sq ft",
    "plans": [
      { "name": "S1", "bedrooms": 0, "bathrooms": 1, "label": "Studio 1 Bath" },
      { "name": "A1", "bedrooms": 1, "bathrooms": 1, "label": "1 Bed 1 Bath" },
      { "name": "A2", "bedrooms": 1, "bathrooms": 1, "label": "1 Bed 1 Bath" },
      { "name": "A3", "bedrooms": 1, "bathrooms": 1, "label": "1 Bed 1 Bath" },
      { "name": "A3a", "bedrooms": 1, "bathrooms": 1, "label": "1 Bed 1 Bath" },
      { "name": "A4", "bedrooms": 1, "bathrooms": 1, "label": "1 Bed 1 Bath" },
      { "name": "A5", "bedrooms": 1, "bathrooms": 1, "label": "1 Bed 1 Bath" },
      { "name": "A6", "bedrooms": 1, "bathrooms": 1, "label": "1 Bed 1 Bath" },
      { "name": "A7", "bedrooms": 1, "bathrooms": 1, "label": "1 Bed 1 Bath" },
      { "name": "A8", "bedrooms": 1, "bathrooms": 1, "label": "1 Bed 1 Bath" },
      { "name": "A9", "bedrooms": 1, "bathrooms": 1, "label": "1 Bed 1 Bath" },
      { "name": "A10", "bedrooms": 1, "bathrooms": 1, "label": "1 Bed 1 Bath" },
      { "name": "A11", "bedrooms": 1, "bathrooms": 1, "label": "1 Bed 1 Bath" },
      { "name": "B1", "bedrooms": 2, "bathrooms": 2, "label": "2 Bed 2 Bath" },
      { "name": "B2", "bedrooms": 2, "bathrooms": 2, "label": "2 Bed 2 Bath" },
      { "name": "B3", "bedrooms": 2, "bathrooms": 2, "label": "2 Bed 2 Bath" },
      { "name": "B4", "bedrooms": 2, "bathrooms": 2, "label": "2 Bed 2 Bath" }
    ],
    "available_units": [
      {
        "unit_number": "419",
        "floor_plan": "A8",
        "floor": 4,
        "bedrooms": 1,
        "bathrooms": 1,
        "sqft": 945,
        "base_rent": "$1,809.00",
        "total_monthly_leasing_price": "$1,904.00",
        "available_on": "2026-07-21"
      }
    ],
    "availability_note": "1 unit available across 6 floors at capture (Floor 4 only). Catalog has 17 plans; remaining plans had no available unit and therefore no live price/sqft. Availability changes — re-query the SightMap API for current data."
  }
}
```
