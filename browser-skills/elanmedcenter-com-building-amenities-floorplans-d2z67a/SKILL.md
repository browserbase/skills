---
name: elanmedcenter-com-building-amenities-floorplans-d2z67a
title: 'Elan Med Center Amenities, Neighborhood & Floorplan Availability'
description: >-
  Summarize in-unit and community amenities, neighborhood POIs
  (Dine/Play/Shop/Hospitals/Banks/Schools + Walk Score), and the full list of
  available floorplans at elanmedcenter.com — friendly name, bedrooms,
  bathrooms, square footage, floor, base rent, and earliest move-in date — by
  hitting the SightMap embed API in a single JSON GET.
website: elanmedcenter.com
category: real-estate
tags:
  - real-estate
  - apartments
  - greystar
  - sightmap
  - floorplans
  - amenities
  - houston
source: 'browserbase: agent-runtime 2026-05-29'
updated: '2026-05-29'
recommended_method: api
alternative_methods:
  - method: api
    rationale: >-
      SightMap (Greystar's floorplan/availability vendor) exposes an
      unauthenticated JSON endpoint at
      https://sightmap.com/app/api/v1/{data_hash}/sightmaps/{sightmap_id} that
      returns every floor plan, every available unit (with
      bed/bath/sqft/price/lease_term/available_on), the amenity tiles, the
      mandatory-fee breakdown, and the property metadata. One GET replaces
      dozens of page navigations.
  - method: fetch
    rationale: >-
      Used in steps 2-3 of the workflow to grab /amenities/ and /neighborhood/
      HTML pages — needed for the site-authored amenity bullet lists and
      neighborhood POI tab content that aren't in the SightMap payload.
      Residential proxies recommended (the homepage probe shows reCAPTCHA v3,
      but it's only enforced on form submits, not GETs).
  - method: browser
    rationale: >-
      Fallback only if SightMap rotates its hash or shape. The public
      /floorplans/ page applies a default price filter ($1,700–$3,000) that
      hides most units behind floor-tab clicks, and unit detail pages live at
      /floorplans/unit-<32-hex-id>/ — 17 page loads vs 1 JSON GET.
verified: false
proxies: true
---
# Elan Med Center — Building Amenities, Neighborhood & Floorplan Availability

## Purpose

Read-only skill for elanmedcenter.com (Greystar-managed luxury apartment building at 7010 Staffordshire, Houston, TX 77030, in the Texas Medical Center). Returns three things in one shot: (1) the in-building/community amenity list, (2) the neighborhood feature set with named points of interest by category plus the Walk Score panel, and (3) every available unit with its floorplan code, friendly name, bedrooms/bathrooms, square footage, floor, price (base rent + total monthly leasing price), and earliest move-in date. The fastest path is the **SightMap embed API** — a single JSON GET returns 100% of the floorplan/unit data the site renders, plus the canonical amenity titles. The HTML pages at `/amenities/` and `/neighborhood/` are still needed for narrative copy + the neighborhood POI/Walk Score sections (those don't live in the SightMap payload).

## When to Use

- A prospective renter asks "What apartments are available at Elan Med Center, what do they cost, and what amenities does the building have?"
- A market-research agent wants a snapshot of pricing + availability per floorplan template (Ava, Bella, Coco, Devon, Elan, Fae, Gia, Hope, Ivy) to compare against peer Greystar properties.
- A relocation assistant needs the neighborhood feature breakdown (Dine / Play / Shop / Hospitals / Banks / Schools) + Walk Score to assess the location.
- Any "summarize this apartment listing site" task targeting a Greystar/SightMap-backed property — the same API pattern works across the Greystar portfolio (just discover the per-property `sightmap_id`).

## Workflow

This skill has a **three-source fetch** pattern. Step 1 is the high-leverage call; steps 2 and 3 are static HTML fetches for the narrative bits.

### 1. Discover the SightMap hash + sightmap_id (one-time per property)

The SightMap embed iframe sits on the floorplans page:

```bash
browse cloud fetch https://elanmedcenter.com/floorplans/ --proxies
# In the HTML, find: src="https://sightmap.com/embed/rxwjj4m0w1e?enable_api=1..."
```

Then fetch the embed page to read the `window.__APP_CONFIG__` blob:

```bash
browse cloud fetch "https://sightmap.com/embed/rxwjj4m0w1e?enable_api=1" --proxies
# The HTML contains:
#   window.__APP_CONFIG__ = {"sightmaps":[{"href":"https://sightmap.com/app/api/v1/rkwn5yxzwd2/sightmaps/86053"}]...}
# Capture the href — that's the data endpoint.
```

For Elan Med Center as of 2026-05-29 the values are:
- Embed hash: `rxwjj4m0w1e`
- Data endpoint hash: `rkwn5yxzwd2`
- SightMap ID: `86053`
- Asset ID: `28446`

These may rotate if Greystar republishes the SightMap, so re-discover rather than hard-coding.

### 2. Pull the full floorplan + unit + amenity payload from SightMap

```bash
browse cloud fetch \
  "https://sightmap.com/app/api/v1/rkwn5yxzwd2/sightmaps/86053" \
  --proxies
```

Response is JSON with `data.floor_plans` (10 entries: 9 published templates + a `TEMP / Coming Soon` placeholder you should filter out), `data.units` (only currently-available units; 17 as of 2026-05-29), and `data.amenities` (9 community amenity tiles with titles, short descriptions, and SightMap-hosted image URLs).

**Floor-plan code → friendly name mapping** (the SightMap `filter_label` uses internal codes like `A1`; the public site uses the alphabetical friendly names — apply this mapping yourself, the API does not provide it):

| Code | Friendly | Beds | Baths | Sq Ft |
|------|----------|------|-------|-------|
| A1   | Ava      | 1    | 1     | 597   |
| A2   | Bella    | 1    | 1     | 661   |
| A3   | Coco     | 1    | 1     | (no avail unit to read area from API — pull from /floorplans/ HTML if needed) |
| A4   | Devon    | 1    | 1     | 732   |
| A5   | Elan     | 1    | 1     | (no avail) |
| A6   | Fae      | 1    | 1     | (no avail) |
| B1   | Gia      | 2    | 2     | (no avail) |
| B2   | Hope     | 2    | 2     | (no avail) |
| B3   | Ivy      | 2    | 2     | 1262  |

The `floor_plans[].name` field is a JSON-encoded string in newer SightMap responses (e.g. `"name": "{\"name\":\"A1\",\"provider_id\":\"3360168\"}"`) — `JSON.parse` it to extract the actual code. The cleaner field is `filter_label`.

For each `units[]` entry, the fields you care about are:
- `unit_number` — e.g. `"224"`
- `floor_plan_id` — join back to `floor_plans[]` to get bedroom/bathroom counts
- `area` — square footage (integer)
- `building` — building number (always `"1"` here, single-building property)
- `floor_id` — internal floor ID (116022 = Floor 2, 116023 = 3, 116024 = 4, 116025 = 5, 116026 = 6; Floor 1 has zero units)
- `price` — **base rent** at the displayed lease term (integer dollars)
- `display_price` — pre-formatted base rent string (`"$1,689.00"`)
- `display_lease_term` — e.g. `"13 Months"`
- `available_on` — ISO date (`"2026-07-28"`)
- `display_available_on` — pre-formatted (`"Available Jul 28"`)

**Pricing nuance**: the public floorplans page shows a "Total Monthly Leasing Price" range (e.g. `$1,766.50 - $1,773.50 /mo*`) that is **higher than** the SightMap `price` because the site adds mandatory monthly fees (Community Amenity Fee $25, HOA $1, Pest Control $3, plus prorated misc — `~$77/mo` total). Those fees are in `data.units[*].static_expenses[]` and `display_expenses[]` if you need the breakdown. SightMap's `price` ≈ "base rent" line on the unit page.

### 3. Fetch narrative amenity copy + the neighborhood page

The SightMap amenity titles are short labels (e.g. `"Fitness"`, `"Pool"`). The richer site-authored amenity list — the "Your Home" (in-unit) + "Community" bullet lists — lives only in the HTML at `/amenities/`:

```bash
browse cloud fetch https://elanmedcenter.com/amenities/ --proxies
```

Parse the two `<div data-amenity-content>` lists under the `Your Home` and `Community` headings.

For neighborhood, fetch `/neighborhood/` and parse the six tabbed POI lists (`Dine`, `Play`, `Shop`, `Hospitals`, `Banks`, `Schools`) plus the Walk Score / Transit / Bike score block:

```bash
browse cloud fetch https://elanmedcenter.com/neighborhood/ --proxies
```

Both pages return 200 with residential proxies; reCAPTCHA v3 is present site-wide but is only enforced on form submissions, not on read-only navigation/fetch.

### Browser fallback

If the SightMap API ever changes shape or auth-walls, scrape the public listing pages:

1. `browse open https://elanmedcenter.com/floorplans/ --remote` — the page lists units, but **by default only displays units within an automatically-set price filter range** (currently `$1,700–$3,000` — both endpoints are roughly the cheapest and the most expensive base-rent values, so when the spread is wide most units render as "Outside price filter range" and only ~2 cards appear above the fold). Clear the price filter by clicking the **Clear** link next to the price slider, then iterate the **Floor 1…Floor 6** tabs to load every floor's units. Click each unit card to land on `/floorplans/unit-<32-hex-id>/` and read `1 bed`, `2 bath`, sqft, `$xxxx.xx - $yyyy.yy /mo*`, `XX months`, `$xxxx Base Rent`, `Available <Mon DD>` from the detail. Take ~12-step actions to get all 17 units this way — the SightMap API is dramatically faster.
2. `browse open https://elanmedcenter.com/amenities/ --remote` then `browse get markdown body` — the two amenity bullet lists render cleanly in the markdown export.
3. `browse open https://elanmedcenter.com/neighborhood/ --remote` then `browse get markdown body` — the POI tabs and Walk Score panel are server-rendered, but the page also embeds 50+ Google Maps tile `<img>` tags that will bloat your markdown by 100+ KB if you don't strip them with `lines.filter(l => !l.startsWith('!['))`.

## Site-Specific Gotchas

- **SightMap is the cheat code.** `https://sightmap.com/app/api/v1/{data_hash}/sightmaps/{sightmap_id}` is unauthenticated, returns 200 from residential proxies, and contains every unit, every floor plan, every published amenity, every fee, and the full disclaimer text. There is no need to drive a headless browser unless the embed iframe goes away.
- **The data-hash and the embed-hash are DIFFERENT.** Embed URL uses `rxwjj4m0w1e`; the API uses `rkwn5yxzwd2`. Don't substitute one for the other — only the data hash from `window.__APP_CONFIG__.sightmaps[0].href` works against the API.
- **Floor-plan name field is double-encoded.** `floor_plans[].name` is `"{\"name\":\"A1\",\"provider_id\":\"3360168\"}"` — `JSON.parse()` it. Use `filter_label` if you want a string out of the box.
- **Friendly names (Ava, Bella, …) are NOT in the SightMap payload.** They live in the HTML floorplans page's `<select>` dropdown and on each `/floorplans/unit-<hash>/` detail page. Either hardcode the A1=Ava ... B3=Ivy mapping (the alphabetical pattern is stable) or scrape one unit page per code to confirm.
- **`floor_plans[]` contains a placeholder `TEMP / Coming Soon` (bedroom_count=0).** Filter it out before reporting.
- **Public website "Total Monthly Leasing Price" ≠ SightMap `price`.** The public site adds ~$29/mo in mandatory fees (Community Amenity Fee $25, HOA $1, Pest Control $3) to the base rent and renders a range to account for security-deposit variance. SightMap returns the base rent only. If the user asks for "the price you'd see on the website," compute `unit.price + 29` (approximate, varies by month) or follow the `display_expenses[]` array for an exact total.
- **Floor-1 has zero available units, by design.** The ground floor is leasing/amenity space — don't report it as missing data.
- **9 floorplan templates, but typically only 3-4 have available units.** As of 2026-05-29, Ava (A1), Bella (A2), Devon (A4), and Ivy (B3) had units; Coco/Elan/Fae/Gia/Hope had zero. Reporting "no availability" is the correct answer for those templates, not "missing from data."
- **The `display_available_on` strings drop the year.** Use `available_on` (ISO `YYYY-MM-DD`) for any date math.
- **reCAPTCHA v3 is loaded site-wide** (form-protection, not nav-blocking). Residential proxies + no headless flag is enough — no stealth/`--verified` needed for read-only fetches.
- **Don't waste cycles on Greystar's parent-level "API."** There is no public `greystar.com` REST endpoint that lists individual properties' units. SightMap is the source.
- **The neighborhood page's POI links are `href="#"` — purely visual tab labels.** Don't follow them. Just parse the list items inside each tab pane.
- **Map tiles will destroy your markdown extraction.** `/neighborhood/` server-renders ~50 Google Maps `<img>` tags inline; strip image lines (`lines.filter(l => !l.startsWith('!['))`) before further processing or you'll burn context on base64-style tile param blobs.
- **The Walk Score panel is text, not an embed.** `"65 Good Transit"`, `"82 Very Bikeable"` are static strings in the HTML — no third-party WalkScore API call is necessary for the building.

## Expected Output

```json
{
  "property": {
    "name": "Elan Med Center",
    "address": "7010 Staffordshire, Houston, TX 77030",
    "phone": "833-284-1890",
    "operator": "Greystar",
    "asset_id": "28446"
  },
  "amenities": {
    "in_unit": [
      "Wood Floors",
      "Spacious Open Floor Plans",
      "10- to 14-Foot Ceilings",
      "LEED Certified Building",
      "Large Walk-In Closets",
      "Washer/Dryer",
      "Whirlpool Stainless Steel Appliances",
      "Built-In Microwaves",
      "Kitchen Island/Bar (select units)",
      "Quartz Countertops",
      "Storage Closets",
      "Garden Tubs and/or Stand-Up Showers",
      "Climate Controlled Storages Available",
      "Built-In Organizer Systems in Bedroom Closets",
      "Single-Basin Undermount Sinks",
      "Espresso Cabinets with Glass Fronts",
      "Attached Parking Garage",
      "Picturesque Views of Downtown (select units)",
      "Controlled Access Community"
    ],
    "community": [
      "Conference Room",
      "Dog Park with Wash Station",
      "Onsite Marketplace",
      "Brevvie Box",
      "Bike Trail Coming Soon",
      "AT&T Fiber Internet",
      "Cyber Café",
      "Cold Brew Coffee",
      "Business Center",
      "Fitness Center with Pilates/Yoga Room",
      "Outdoor Kitchen and Grills",
      "Outdoor Social Areas with Lushly Landscaped Courtyards",
      "Study Rooms",
      "Clubhouse and Lounge Area",
      "Game Room with Shuffleboard, Billiards, etc",
      "Pool For Laps and Lounging",
      "EV Universal Charging Stations & Tesla",
      "Outdoor Terrace",
      "Covered Mail Room Area",
      "Dry Cleaning Lockers",
      "Reserved Parking Available"
    ],
    "pet_policy": {
      "deposit_usd": 300,
      "fee_nonrefundable_usd": 300,
      "monthly_rent_usd": 25,
      "weight_limit_lb": 200,
      "pet_limit": 2,
      "restrictions": "no aggressive breeds"
    }
  },
  "neighborhood": {
    "tagline": "In the Heart of the Texas Medical Center",
    "walk_score": { "transit": 65, "bike": 82 },
    "dine": ["Piada Italian Street Food", "McCormick & Schmick's Seafood & Steaks", "Black Walnut Cafe", "Maggiano's Little Italy", "Brenner's on the Bayou", "Buon Appetito Restaurant", "Prima Pasta", "Hungry's", "Cycole Anaya's Mexican Kitchen", "Fajitas A Go Go", "Shake Shack", "Torchy's Tacos", "Benjy's", "Goode Company BBQ"],
    "play": ["Houston Zoo", "Edwards Greenway Grand Palace 24 & RPX", "Hermann Park Golf Course", "Houston Grand Opera", "Wortham Giant Screen Theatre", "Broadway at the Hobby Center", "Miller Outdoor Theatre", "Museum of Fine Arts", "Axelrad Beer Garden", "Goode Company Armadillo Palace", "Houston Museum of Natural Science", "Bar 5015", "Under the Volcano", "The Address"],
    "shop": ["The Shops At Memorial Heights", "Uptown Plaza", "River Oaks Shopping Center", "Rice Village", "Merchants Park Shopping Center", "Pavilion on Post Oak", "Whole Foods Market", "Uptown Park", "Heights Plaza", "The Galleria", "Highland Village", "Post Oak Shopping Center", "H-E-B", "Kroger"],
    "hospitals": ["Texas Children's Hospital", "St. Joseph Medical Center", "Ben Taub Hospital", "MD Anderson Cancer Center", "Houston Methodist Hospital", "Texas Medical Center", "CHI St. Luke's Health – Baylor St. Luke's Medical Center", "Baylor College of Medicine", "Memorial Hermann", "VA Hospital"],
    "banks": ["CommunityBank of Texas", "Integrity Bank", "Woodforest National Bank", "Wells Fargo Bank", "Chase Bank", "JP Morgan Bank Offices", "IBC Bank", "Frost Bank"],
    "schools": ["Depelchin-Elkins Campus", "Memorial Elementary School", "University of Houston", "River Oaks Elementary School", "Texas Southern University", "Lamar High School", "Baylor College of Medicine", "Prairie View A&M University: College of Nursing", "University Of Texas Health And Science", "Texas Women's University", "Roberts Elementary", "Rice University"]
  },
  "floorplans": [
    {
      "code": "A1",
      "name": "Ava",
      "bedrooms": 1,
      "bathrooms": 1,
      "square_feet": 597,
      "available_unit_count": 4,
      "min_base_rent_usd": 1689,
      "max_base_rent_usd": 1749,
      "units": [
        { "unit_number": "224", "building": "1", "floor": 2, "base_rent_usd": 1689, "total_monthly_low_usd": 1766.50, "total_monthly_high_usd": 1773.50, "lease_term_months": 13, "available_on": "2026-07-28" },
        { "unit_number": "320", "building": "1", "floor": 3, "base_rent_usd": 1689, "lease_term_months": 13, "available_on": "2026-07-28" },
        { "unit_number": "417", "building": "1", "floor": 4, "base_rent_usd": 1709, "lease_term_months": 12, "available_on": "2026-08-02" },
        { "unit_number": "444", "building": "1", "floor": 4, "base_rent_usd": 1749, "lease_term_months": 12, "available_on": "2026-08-06" }
      ]
    },
    {
      "code": "A2",
      "name": "Bella",
      "bedrooms": 1,
      "bathrooms": 1,
      "square_feet": 661,
      "available_unit_count": 7,
      "min_base_rent_usd": 1776,
      "max_base_rent_usd": 1914,
      "units": [
        { "unit_number": "340", "floor": 3, "base_rent_usd": 1854, "available_on": "2026-06-29" },
        { "unit_number": "435", "floor": 4, "base_rent_usd": 1839, "available_on": "2026-07-30" },
        { "unit_number": "437", "floor": 4, "base_rent_usd": 1839, "available_on": "2026-05-29" },
        { "unit_number": "440", "floor": 4, "base_rent_usd": 1874, "available_on": "2026-08-14" },
        { "unit_number": "536", "floor": 5, "base_rent_usd": 1776, "available_on": "2026-05-29" },
        { "unit_number": "538", "floor": 5, "base_rent_usd": 1776, "available_on": "2026-05-29" },
        { "unit_number": "623", "floor": 6, "base_rent_usd": 1914, "available_on": "2026-07-20" }
      ]
    },
    { "code": "A3", "name": "Coco", "bedrooms": 1, "bathrooms": 1, "available_unit_count": 0, "units": [] },
    {
      "code": "A4",
      "name": "Devon",
      "bedrooms": 1,
      "bathrooms": 1,
      "square_feet": 732,
      "available_unit_count": 4,
      "min_base_rent_usd": 1779,
      "max_base_rent_usd": 1819,
      "units": [
        { "unit_number": "404", "floor": 4, "base_rent_usd": 1819, "available_on": "2026-07-28" },
        { "unit_number": "415", "floor": 4, "base_rent_usd": 1779, "available_on": "2026-08-03" },
        { "unit_number": "607", "floor": 6, "base_rent_usd": 1819, "available_on": "2026-07-13" },
        { "unit_number": "615", "floor": 6, "base_rent_usd": 1819, "available_on": "2026-07-22" }
      ]
    },
    { "code": "A5", "name": "Elan", "bedrooms": 1, "bathrooms": 1, "available_unit_count": 0, "units": [] },
    { "code": "A6", "name": "Fae",  "bedrooms": 1, "bathrooms": 1, "available_unit_count": 0, "units": [] },
    { "code": "B1", "name": "Gia",  "bedrooms": 2, "bathrooms": 2, "available_unit_count": 0, "units": [] },
    { "code": "B2", "name": "Hope", "bedrooms": 2, "bathrooms": 2, "available_unit_count": 0, "units": [] },
    {
      "code": "B3",
      "name": "Ivy",
      "bedrooms": 2,
      "bathrooms": 2,
      "square_feet": 1262,
      "available_unit_count": 2,
      "min_base_rent_usd": 2756,
      "max_base_rent_usd": 2836,
      "units": [
        { "unit_number": "230", "floor": 2, "base_rent_usd": 2756, "available_on": "2026-08-07" },
        { "unit_number": "502", "floor": 5, "base_rent_usd": 2836, "available_on": "2026-08-06" }
      ]
    }
  ],
  "totals": {
    "total_available_units": 17,
    "floors_with_inventory": [2, 3, 4, 5, 6],
    "price_range_usd": { "min_base_rent": 1689, "max_base_rent": 2836 }
  },
  "data_sources": {
    "sightmap_api": "https://sightmap.com/app/api/v1/{data_hash}/sightmaps/{sightmap_id}",
    "amenities_html": "https://elanmedcenter.com/amenities/",
    "neighborhood_html": "https://elanmedcenter.com/neighborhood/",
    "fetched_at": "2026-05-29T22:09:05Z"
  }
}
```

When the SightMap API rotates and you can't recover the JSON path, the **degraded shape** is:

```json
{
  "property": { "name": "Elan Med Center", "address": "..." },
  "amenities": { "in_unit": [...], "community": [...], "pet_policy": {...} },
  "neighborhood": { "walk_score": {...}, "dine": [...], "..." : [...] },
  "floorplans": [
    { "code": "A1", "name": "Ava", "bedrooms": 1, "bathrooms": 1, "square_feet": 597,
      "available_unit_count": null, "units": [],
      "note": "SightMap data hash rotated; unit-level pricing not retrieved. Re-run after rediscovering window.__APP_CONFIG__.sightmaps[0].href on the embed page." }
  ],
  "totals": { "total_available_units": null }
}
```
