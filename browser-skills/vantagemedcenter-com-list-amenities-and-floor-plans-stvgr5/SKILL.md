---
name: vantagemedcenter-com-list-amenities-and-floor-plans-stvgr5
title: Vantage Med Center Amenities & Floor Plans
description: >-
  Summarize building and neighborhood amenities and list every floor plan at
  Vantage Med Center with prices, availability, beds, baths, square footage, and
  per-unit metadata.
website: vantagemedcenter.com
category: real-estate
tags:
  - real-estate
  - apartments
  - floor-plans
  - amenities
  - pricing
  - greystar
source: 'browserbase: agent-runtime 2026-05-30'
updated: '2026-05-30'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      The /floorplans/ index renders client-side via the Jonah Digital widget +
      an embedded SightMap; a browser is only needed if you want the interactive
      map/filter UI. All underlying data is already server-rendered into each
      floor-plan detail page, so a plain HTTP GET is faster and complete.
  - method: api
    rationale: >-
      No clean public JSON API was found. The Jonah widget
      (cdn.jonahdigital.com) and the SightMap embed
      (sightmap.com/embed/rkwno24zvd2) fetch data client-side, but the same data
      is already inlined as a JS object literal in each detail page's HTML, so
      scraping an API is unnecessary.
verified: false
proxies: false
---
# Vantage Med Center Amenities & Floor Plans

## Purpose

Produce a structured summary of **Vantage Med Center** (1911 Holcombe Blvd, Houston, TX 77030 — a 22‑story Greystar‑managed apartment tower) covering: (1) community amenities, (2) apartment/interior features, (3) neighborhood points of interest, and (4) the full floor‑plan catalog with live pricing, availability, bedrooms, bathrooms, square footage, and per‑unit metadata. This is a **read‑only** extraction task. All data is publicly served as plain HTML; nothing requires login, form submission, or clicking "Apply".

## When to Use

- A user wants a complete rundown of what the building and surrounding neighborhood offer.
- A user asks for current rent prices, availability, or unit counts for any/all floor plans.
- A user wants to filter floor plans by bedrooms, square footage, price, or move‑in date.
- A user wants per‑unit detail (apartment number, building, floor, available date, base rent vs. Total Monthly Leasing Price).

## Workflow

The site is built on the **Jonah Digital** marketing platform (property_id `12375`) with an embedded **SightMap** floor selector. The `/floorplans/` index page renders its unit grid client‑side, but **every floor‑plan detail page is fully server‑rendered** with a JavaScript object literal containing all pricing/availability/metadata. The fastest, most reliable path is therefore a sequence of plain HTTP GETs — **no proxies, no stealth, no JS execution required** (verified with a bare `browse cloud fetch`).

### Recommended method — HTTP fetch + HTML parse

1. **Amenities** — GET `https://vantagemedcenter.com/amenities/`. The page is static HTML; harvest the `<li>` items. There are two groups: **Community Amenities** (building‑wide) and **Apartment Features** (in‑unit). Items with a trailing `*` are availability‑limited (e.g. *select units*).

2. **Neighborhood** — GET `https://vantagemedcenter.com/neighborhood/`. Static HTML. Harvest `<li>` items grouped into Dining, Grocery, Parks & Recreation, and Fitness, plus a bikeability score string (e.g. `78 Very Bikeable`).

3. **Floor‑plan slug list** — GET `https://vantagemedcenter.com/floorplans/`. Even though the unit grid is JS‑rendered, the static HTML contains anchor links to every detail page. Extract them with the regex `/\/floorplans\/([a-z]\d+)\//gi` and de‑duplicate. As of capture there are **27 plans**: `a1`–`a13`, `b1`–`b8`, `c1`–`c6` (A = 1‑bed, B = 2‑bed, C = 3‑bed).

4. **Per‑floor‑plan data** — For each slug, GET `https://vantagemedcenter.com/floorplans/{slug}/`. The HTML contains an inlined JS object (HTML‑entity‑encoded — replace `&quot;` → `"`, `&#039;` → `'`, `&amp;` → `&` before parsing). Pull these fields:
   - Plan level: `title`, `bedrooms`, `bathrooms`, `square_feet`, `max_square_feet`, `rent_min`, `rent_max`, and `price_entity` (which holds `termDisplay`, `priceDisplay` = Total Monthly Leasing Price range, `priceDisplayNoFees` = base‑rent range, `available_date_min/max` as unix seconds).
   - Unit level: a `units` array; each entry has `apartment_number`, `building` / `building_display`, `availability_count`, `square_feet`, `price` (e.g. `$2,201`), `price_display` (e.g. `$2,201 /mo*`), `price_itemized` (base rent + estimated fees breakdown), `available_date` (unix seconds) and `available_display` (e.g. `Available Now`, `Available Aug 03`).
   A plan with no bookable units has an empty `units` array / zero availability — report it as "Contact for availability" rather than inventing a price.

5. **Assemble** the four sections into the output schema below. Prices and availability change frequently, so timestamp the result.

### Browser fallback

If you need the interactive experience (the SightMap floor map, live filter-by-price/move‑in‑date, or to confirm rendered numbers), drive a browser:

1. Open `https://vantagemedcenter.com/floorplans/`. A "Pet Policy / 4 weeks free" promo modal and a OneTrust cookie banner appear first — dismiss them.
2. The default view is the **Map** tab with a price slider already applied, so most plans show "Outside price filter range" and are hidden. Click the **Floorplans** / **List View** tab and **Clear** all filters to see every unit.
3. Read the rendered unit cards (`browse get markdown body` captures them: name, availability date, beds/baths/sq.ft., Total Monthly Leasing Price, base rent).
4. For amenities/neighborhood just open `/amenities/` and `/neighborhood/` — they are static and need no interaction.

A standard (non‑stealth, no‑proxy) Browserbase session is sufficient; the homepage carries reCAPTCHA v3 (passive) but it does not gate content navigation.

## Site-Specific Gotchas

- **"Total Monthly Leasing Price" ≠ base rent.** The headline `price` / `priceDisplay` (e.g. `$2,201 /mo*`) bundles base rent + all mandatory monthly fees. The true base rent is in `priceDisplayNoFees` / the `price_itemized` "Base Rent" line (e.g. `$2,063`). Always label which one you report.
- **Detail pages are the source of truth, not the index.** The `/floorplans/` grid is rendered by the Jonah widget and is filtered by a default price range, so scraping it yields partial results. Hit the individual `/floorplans/{slug}/` pages instead — each one inlines complete, live data server‑side.
- **HTML‑entity encoding.** The inline JSON uses `&quot;` etc. Decode before `JSON.parse` or regex extraction.
- **Dates are unix epoch seconds.** `available_date`, `available_date_min/max` are integers; convert (×1000) for human dates. Use `available_display` for the pre‑formatted string.
- **`*` suffix on amenities = limited availability** (e.g. `Quartz Countertops *`, `Rooftop Terraces *`, `Tiled Designer Backsplash *` apply to select units only).
- **Floor‑level availability counts** are shown on the index map (e.g. "Floor 8 — 0 avail"); these are per‑floor, not per‑floor‑plan. Don't conflate them with a plan's `availability_count`.
- **No public JSON API.** Don't waste time probing for one — the Jonah widget and SightMap (`sightmap.com/embed/rkwno24zvd2?enable_api=1`) fetch client‑side, but the data is already inlined in the detail‑page HTML. The fetch path above is the shortcut.
- **Proxies/stealth not required.** A bare `browse cloud fetch` (no `--proxies`, no `--verified`) returns HTTP 200 with full content. The homepage sets a `JonahLead` PHPSESSID cookie and runs reCAPTCHA v3, but neither blocks content GETs.
- **Greystar management.** Footer legal links (privacy, renters' rights) point to greystar.com — useful context but not part of the building's own amenities.
- Numbers below are a **snapshot captured 2026‑05‑30**; re‑fetch for current pricing/availability.

## Expected Output

```json
{
  "property": {
    "name": "Vantage Med Center",
    "address": "1911 Holcombe Blvd, Houston, TX 77030",
    "phone": "(346) 910-9573",
    "managed_by": "Greystar",
    "description": "22-story residential tower with 1, 2 & 3 bedroom apartments and penthouses near the Texas Medical Center."
  },
  "amenities": {
    "community": [
      "24/7 Package Lockers", "Bicycle Storage", "Business Center", "Clubhouse",
      "Conference Room", "Cyber Library", "Demonstration Kitchen", "Dog Washing Stations",
      "EV Charging Stations", "Firepits", "Game Room", "Hush Pods",
      "Hydrotherapy Massage Room", "Outdoor Luxury Gym", "Parking Garage", "Picnic Area",
      "Renovated Luxury Gym w/ Yoga and Spin Cycle Room", "Spacious Dog Run",
      "VIP Garage Parking Available"
    ],
    "apartment_features": [
      "22 Story Residential Tower", "Designer Paint Colors", "Electronic Keyless Entry Locks",
      "Exquisite Downtown Views", "In-Wall USB Connections", "Penthouses Available",
      "Quartz Countertops *", "Rooftop Terraces *", "Single Basin Undermount Sink",
      "Tiled Designer Backsplash *", "Upgraded Interiors", "Upgraded Lighting Package",
      "Wood-Style Flooring"
    ]
  },
  "neighborhood": {
    "dining": ["Jollibee", "Sixty Vines", "The Pit Room", "Axelrad Beer Garden", "Trill Burgers", "The Breakfast Klub"],
    "grocery": ["H-E-B", "Kroger", "Fiesta Mart #18", "Target", "Trader Joe's", "Whole Foods Market"],
    "parks_recreation": ["Hermann Park", "Houston Zoo", "Miller Outdoor Theatre", "Japanese Garden"],
    "fitness": ["24 Hour Fitness", "Life Time"],
    "bikeability": "78 Very Bikeable"
  },
  "floor_plans": [
    {
      "name": "A1",
      "url": "https://vantagemedcenter.com/floorplans/a1/",
      "bedrooms": 1,
      "bathrooms": 1,
      "square_feet": 616,
      "lease_term_display": "13 months",
      "total_monthly_leasing_price_range": "$2,171 - $2,201 /mo*",
      "base_rent_range": "$2,063 - $2,093",
      "availability_count": 2,
      "available_display": "Available Now",
      "units": [
        {
          "apartment_number": "1313",
          "building": "Building 1",
          "square_feet": 616,
          "total_monthly_leasing_price": "$2,201",
          "available_display": "Available Now",
          "available_date": "2025-09-17"
        }
      ]
    },
    {
      "name": "B1",
      "url": "https://vantagemedcenter.com/floorplans/b1/",
      "bedrooms": 2,
      "bathrooms": 2,
      "square_feet": 1134,
      "total_monthly_leasing_price_range": "$3,454 - $3,484 /mo*",
      "availability_count": 3,
      "units": [
        { "apartment_number": "1615", "total_monthly_leasing_price": "$3,469" },
        { "apartment_number": "1515", "total_monthly_leasing_price": "$3,454" },
        { "apartment_number": "1715", "total_monthly_leasing_price": "$3,484" }
      ]
    },
    {
      "name": "C1",
      "url": "https://vantagemedcenter.com/floorplans/c1/",
      "bedrooms": 3,
      "bathrooms": 2,
      "square_feet": 1499,
      "total_monthly_leasing_price_range": "$4,484 - $4,669 /mo*",
      "availability_count": 2,
      "units": [
        { "apartment_number": "2211", "total_monthly_leasing_price": "$4,669" },
        { "apartment_number": "1419", "total_monthly_leasing_price": "$4,484" }
      ]
    }
  ],
  "_notes": "27 floor plans total: A1-A13 (1-bed), B1-B8 (2-bed), C1-C6 (3-bed). Plans with an empty units array should be reported as 'Contact for availability'. Prices are Total Monthly Leasing Price (incl. mandatory fees); base rent is lower. Captured 2026-05-30; re-fetch for current data."
}
```

Distinct outcome shapes to handle:
- **Available plan** — non‑empty `units`, concrete prices and `available_display` (`Available Now` or a future date).
- **No current availability** — empty `units` / `availability_count` 0; emit `"availability": "Contact for availability"` with no fabricated price.
- **Amenities/neighborhood only** — if the user only asks for amenities, return the `amenities` + `neighborhood` objects and omit `floor_plans`.
