---
name: thecartermuseumdistrict-com-explore-amenities-and-floor-690a8d98
title: Explore Amenities and Floor Plans — The Carter
description: >-
  Summarize The Carter's community and apartment amenities plus nearby Museum
  District neighborhood points of interest, and list every floor plan with beds,
  baths, square footage, starting price, deposit, and current availability.
website: thecartermuseumdistrict.com
category: real-estate
tags:
  - real-estate
  - apartments
  - floor-plans
  - amenities
  - rentcafe
  - houston
source: 'browserbase: agent-runtime 2026-06-03'
updated: '2026-06-03'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      Works as a fallback when the static fetch is blocked — use --verified
      --proxies (Cloudflare-fronted), then `browse get html body` once per page
      and parse offline. ~100x more expensive than fetch; per-element card reads
      exhaust an LLM agent's turn budget, so only the whole-DOM-dump-then-parse
      approach converges.
  - method: api
    rationale: >-
      No usable data API exists for this property — RentCafe pages are fully
      server-rendered and no RENTCafeAPI/XHR availability feed was found. Parse
      the embedded application/ld+json block plus the rendered floor-plan cards
      instead.
verified: true
proxies: true
---
# Explore Amenities and Floor Plans — The Carter (Museum District, Houston)

## Purpose

Return a structured summary of The Carter apartment building: (1) **community amenities** (building-wide), (2) **apartment amenities** (in-unit features), (3) **neighborhood amenities** (curated nearby dining / nightlife / recreation points of interest), and (4) the full **floor-plan catalog** — every plan with its bedrooms, bathrooms, square footage, "starting at" price, security deposit, and current availability status. Read-only; never submits applications, tour requests, or contact forms.

## When to Use

- A renter or research agent wants a one-shot overview of what the building and its location offer.
- You need a machine-readable floor-plan table (beds / baths / sqft / price / deposit / availability) for comparison, monitoring price changes, or feeding a rental-search aggregator.
- Anywhere you'd otherwise scrape the marketing site's HTML — the data is server-rendered, so a plain HTTP fetch is faster, cheaper, and more reliable than driving a browser.

## Workflow

The Carter runs on **RentCafe (Yardi)** and **server-renders the full page HTML on every request** — including a machine-readable `application/ld+json` block and all amenity / floor-plan content. There is **no client-side data API to call and no JS hydration required**. The optimal path is therefore a plain HTTP `GET` of three pages plus regex/JSON parsing — no headless browser, no clicking, no waiting on spinners. A residential proxy is recommended only because the site sits behind Cloudflare (see Gotchas); the content itself is fully present in the first HTML response (HTTP 200). Driving a real browser also works but costs ~100× more (the floor-plan page DOM is ~520 KB; an LLM browser agent that walks it card-by-card blows past a 30-turn budget without finishing — confirmed across two autobrowse iterations).

Fetch each page over a residential proxy (e.g. `browse cloud fetch <url> --proxies`). All three return HTTP 200; follow the `http→https` and apex→`www` 301 redirects.

1. **Floor plans** — `GET https://www.thecartermuseumdistrict.com/floorplans`
   - **Structural data (beds/baths/sqft) comes from JSON-LD.** The page contains exactly one `<script type="application/ld+json">` whose `@type` is `["LocalBusiness","ApartmentComplex"]`. Parse it; `accommodationFloorPlan[]` lists every plan as `{ name, numberOfBedrooms, numberOfFullBathrooms, floorSize.minValue }`. This is the authoritative source for dimensions (27 plans).
   - **Pricing / deposit / availability come from the rendered cards** (NOT in the JSON-LD). Split the HTML on `class="...fp-container..."` — there are 27 such cards. Strip tags from each card's first ~300 chars; the head reads like:
     `A1 1 Bed 1 Bath 723 Sq. Ft. Starting at $1,940 Deposit: $400 ...`
   - Per-card regex: `Starting at \$([\d,]+)` → starting price; `Deposit: \$([\d,]+)` → deposit.
   - **Availability rule:** a card showing `Starting at $X` (and a "View Availability" link) has units available now. A card showing **`Call for details`** (and a "Contact Us" link, no price) has **no current availability** — price is on request. These two states are mutually exclusive; key off the presence of a `Starting at $` price.

2. **Building amenities** — `GET https://www.thecartermuseumdistrict.com/amenities`
   - The page has two tabbed `<ul>` lists, **both fully present in the static HTML** (no click needed): **Community Amenities** (~16 `<li>`) and **Apartment Amenities / Features** (~20 `<li>`).
   - Strip carousel-label noise from each `<li>` — a trailing `"1 of 1"` / `"1 of 2 2 of 2"` is the image-gallery counter, not amenity text. A trailing `*` on an amenity name means **select units / waitlisted** (e.g. `Guest Suite*`, `Floor-to-Ceiling Windows*`).
   - The **Pet Policy** block is on this same page: max 2 pets, no weight restriction, $25/mo pet rent, $350 non-refundable pet fee + $350 refundable pet deposit (per pet).

3. **Neighborhood amenities** — `GET https://www.thecartermuseumdistrict.com/mapsanddirections`
   - This is the page the site's **"Neighborhood"** nav item points to (not `/neighborhood`, which 404s). It carries three POI `<ul>` lists under the headings **Food**, **Night Life**, and **Recreation** — each `<li>` is a named nearby establishment (RentCafe-curated). Use these as the "neighborhood amenities."
   - Property facts (address `4 Chelsea Blvd, Houston, TX 77006`, phone `(281) 501-3337`, 19-story building, beds 1–3, baths 1–3.5) are in the JSON-LD on every page.

4. **Emit JSON** matching the schema in **Expected Output** below.

### Browser fallback

If the static fetch is ever blocked and you must drive a real browser, use stealth (`--verified --proxies` — the site is Cloudflare-fronted). Navigate to each of the three URLs, `browse wait load`, then `browse get html body` **once per page** and parse the returned HTML with the same JSON-LD + `fp-container` logic above. **Do not** try to read cards one-by-one via per-element selectors (`browse get text #fp-container-<id>`) — that pattern exhausted a 30-turn agent budget without finishing in testing. One whole-DOM dump per page + offline parse is the only browser approach that converges.

## Site-Specific Gotchas

- **Cloudflare-fronted.** `https://www.thecartermuseumdistrict.com` is behind Cloudflare (`Cf-Ray` / `__cf_bm` cookie). Fetch over a residential proxy to avoid challenge pages. With `--proxies` all three pages returned HTTP 200 and the full content on the first request; no captcha or JS challenge was hit across testing. Content is NOT gated behind the cookie banner (OneTrust) — it's already in the HTML.
- **JSON-LD has no price or availability.** `accommodationFloorPlan[]` gives only name + beds + baths + sqft (`floorSize.minValue == maxValue`, single value per plan). For price/deposit/availability you MUST parse the rendered `fp-container` cards.
- **`Call for details` ≠ free / sold out — it means "no live unit, contact leasing."** 15 of 27 plans (most A9/A10, B7, and ALL townhomes TH1–TH4 and penthouses PH1–PH5) show "Call for details" with no price. Treat as `availability_status: "call_for_details"`, `starting_price: null`. Only 12 plans had a live "Starting at $" price at capture time. These flip frequently as inventory changes — re-fetch for current state.
- **Last floor-plan card bleeds into the page footer.** When splitting on `fp-container`, the final card's block extends to end-of-document (footer + inline JS that contains the literal string "View Availability" in a template). Determine availability from the card **head** (first ~300 chars) and key off the `Starting at $` price, not a whole-block search for "View Availability" — otherwise the last plan (PH5) is falsely marked available.
- **Amenity `<li>` length filter matters.** Two real apartment-feature items are long sentences (`Solar Window Shades & Blackout Shades in Each Bedroom`, `Views of Downtown, Galleria, & The Texas Medical Center *`). A `length < 60` filter silently drops them; use `< 90`. The full lists are 16 community + 20 apartment items.
- **Carousel labels pollute amenity text.** Each amenity `<li>` may end with `" 1 of 1"` or `" 1 of 2 2 of 2"` (gallery counters). Strip a trailing `(\s*\d+ of \d+)+` before recording.
- **No dedicated neighborhood/location/gallery routes.** `/neighborhood`, `/location`, and `/gallery` all 404. Neighborhood POIs live only on `/mapsanddirections`.
- **Trailing `*` on an amenity = "select units only."** Carried verbatim from the site; preserve it so downstream consumers know it's not building-wide.
- **Deposits scale by bedroom count, not by plan availability:** $400 (1-bed), $600 (2-bed), $900 (3-bed flat C1), $1,000 (townhomes & penthouses). Present even on `call_for_details` plans.
- **Don't waste time looking for a RentCafe JSON/availability API.** This property's pages are fully server-rendered; there was no `RENTCafeAPI.aspx`, `/api/...`, or XHR availability feed in the markup or network trace. The JSON-LD block + rendered cards are the source of truth.

## Expected Output

```json
{
  "property": {
    "name": "The Carter",
    "address": "4 Chelsea Blvd, Houston, TX 77006",
    "postal_code": "77006",
    "phone": "(281) 501-3337",
    "stories": 19,
    "neighborhood": "Museum District",
    "pets_allowed": true,
    "price_range": { "min": 1940, "max": 3819 }
  },
  "building_amenities": {
    "community": [
      "Sophisticated Lobby with On-Site Concierge",
      "Clubroom Lounge with Fireplace",
      "Conference Room",
      "Resident Bar & Lounge",
      "19th Floor Sky Lounge with Game Room",
      "Guest Suite*",
      "Yoga & Spin Studio",
      "Strength & Cardio Fitness Center",
      "Outdoor Grilling & Dining Area",
      "Resort-Inspired Pool with Poolside Lounges",
      "Mail Room & Package Delivery Service",
      "Controlled-Access Parking Garage",
      "Rentable Private Garages*",
      "Electric Vehicle Charging Stations",
      "Outdoor Dog Park, Covered Pet Pad, & Pet Wash",
      "Flexible Rent Payments"
    ],
    "apartment": [
      "One-, Two-, and Three-Bedroom Floor Plans",
      "Townhomes and Penthouses Available",
      "Hardwood Flooring",
      "Built-In Sonos Sound Systems",
      "Floor-to-Ceiling Windows*",
      "10-Foot Ceilings & 8-Foot Doorways",
      "Dramatic Cove Lighting in Kitchens",
      "Granite Countertops & Backsplashes",
      "Stainless Steel Farmhouse Sinks",
      "Gas Stoves & Stainless Steel Appliances",
      "Built-In Wine Fridges*",
      "Built-In Custom Shelving & Desks *",
      "Solar Window Shades & Blackout Shades in Each Bedroom",
      "Spacious Walk-In Closets with Customizable Elfa Shelving",
      "Rainfall Shower with Bench *",
      "Urban Mud Rooms for Extra Storage *",
      "Washers & Dryers",
      "Balconies",
      "Views of Downtown, Galleria, & The Texas Medical Center *",
      "Outdoor Fireplaces in Townhomes"
    ]
  },
  "pet_policy": {
    "max_pets": 2,
    "max_weight": "no restrictions",
    "pet_rent_monthly": 25,
    "pet_fee_nonrefundable": 350,
    "pet_deposit_refundable": 350
  },
  "neighborhood_amenities": {
    "food": ["Bodegas Taco Shop", "Brennan's of Houston", "Empire Café", "Hugo's", "Katz's Deli & Bar", "Lucille's", "Mai's Restaurant", "Niko Niko's", "Tacos A Go Go", "The Breakfast Klub", "The Raven Grill"],
    "night_life": ["13 celsius", "JR's Bar & Grill", "La Colombe d'Or hotel", "Nouveau", "Numbers Night Club"],
    "recreation": ["Arid Garden", "Bird Island at Hermann Park", "Ervan Chew Dog Park", "Fleming Park", "Friendship Pavilion", "J.M. Stroud Rose Garden", "Japanese Garden", "Lamar Park", "Marvin Taylor Exercise Trail", "McGovern Centennial Gardens", "Mecom Fountain", "Midtown Park", "Pergola Walk", "Spark Park", "Woodland Garden"]
  },
  "floor_plans": [
    { "name": "A1",  "beds": 1, "baths": 1,   "sqft": 723,  "starting_price": 1940, "deposit": 400,  "available": true,  "availability_status": "available" },
    { "name": "A2",  "beds": 1, "baths": 1,   "sqft": 794,  "starting_price": null, "deposit": 400,  "available": false, "availability_status": "call_for_details" },
    { "name": "A3",  "beds": 1, "baths": 1,   "sqft": 794,  "starting_price": 1969, "deposit": 400,  "available": true,  "availability_status": "available" },
    { "name": "A4",  "beds": 1, "baths": 1,   "sqft": 817,  "starting_price": 2064, "deposit": 400,  "available": true,  "availability_status": "available" },
    { "name": "A5",  "beds": 1, "baths": 1,   "sqft": 832,  "starting_price": null, "deposit": 400,  "available": false, "availability_status": "call_for_details" },
    { "name": "A6",  "beds": 1, "baths": 1,   "sqft": 875,  "starting_price": 1957, "deposit": 400,  "available": true,  "availability_status": "available" },
    { "name": "A7",  "beds": 1, "baths": 1,   "sqft": 876,  "starting_price": 2237, "deposit": 400,  "available": true,  "availability_status": "available" },
    { "name": "A8",  "beds": 1, "baths": 1,   "sqft": 903,  "starting_price": null, "deposit": 400,  "available": false, "availability_status": "call_for_details" },
    { "name": "A9",  "beds": 1, "baths": 1.5, "sqft": 1039, "starting_price": null, "deposit": 400,  "available": false, "availability_status": "call_for_details" },
    { "name": "A10", "beds": 1, "baths": 1.5, "sqft": 1088, "starting_price": null, "deposit": 400,  "available": false, "availability_status": "call_for_details" },
    { "name": "B1",  "beds": 2, "baths": 2,   "sqft": 1179, "starting_price": 2691, "deposit": 600,  "available": true,  "availability_status": "available" },
    { "name": "B2",  "beds": 2, "baths": 2,   "sqft": 1297, "starting_price": 2919, "deposit": 600,  "available": true,  "availability_status": "available" },
    { "name": "B3",  "beds": 2, "baths": 2,   "sqft": 1304, "starting_price": 2979, "deposit": 600,  "available": true,  "availability_status": "available" },
    { "name": "B4",  "beds": 2, "baths": 2,   "sqft": 1311, "starting_price": 2799, "deposit": 600,  "available": true,  "availability_status": "available" },
    { "name": "B5",  "beds": 2, "baths": 2,   "sqft": 1390, "starting_price": 3019, "deposit": 600,  "available": true,  "availability_status": "available" },
    { "name": "B6",  "beds": 2, "baths": 2,   "sqft": 1496, "starting_price": 3281, "deposit": 600,  "available": true,  "availability_status": "available" },
    { "name": "B7",  "beds": 2, "baths": 2,   "sqft": 1499, "starting_price": null, "deposit": 600,  "available": false, "availability_status": "call_for_details" },
    { "name": "C1",  "beds": 3, "baths": 2,   "sqft": 1751, "starting_price": 3819, "deposit": 900,  "available": true,  "availability_status": "available" },
    { "name": "TH1", "beds": 2, "baths": 2.5, "sqft": 1691, "starting_price": null, "deposit": 1000, "available": false, "availability_status": "call_for_details" },
    { "name": "TH2", "beds": 2, "baths": 2.5, "sqft": 1744, "starting_price": null, "deposit": 1000, "available": false, "availability_status": "call_for_details" },
    { "name": "TH3", "beds": 2, "baths": 2.5, "sqft": 1760, "starting_price": null, "deposit": 1000, "available": false, "availability_status": "call_for_details" },
    { "name": "TH4", "beds": 2, "baths": 2.5, "sqft": 2373, "starting_price": null, "deposit": 1000, "available": false, "availability_status": "call_for_details" },
    { "name": "PH1", "beds": 2, "baths": 2.5, "sqft": 2361, "starting_price": null, "deposit": 1000, "available": false, "availability_status": "call_for_details" },
    { "name": "PH2", "beds": 2, "baths": 2.5, "sqft": 2367, "starting_price": null, "deposit": 1000, "available": false, "availability_status": "call_for_details" },
    { "name": "PH3", "beds": 2, "baths": 2.5, "sqft": 2625, "starting_price": null, "deposit": 1000, "available": false, "availability_status": "call_for_details" },
    { "name": "PH4", "beds": 2, "baths": 2.5, "sqft": 2700, "starting_price": null, "deposit": 1000, "available": false, "availability_status": "call_for_details" },
    { "name": "PH5", "beds": 3, "baths": 3.5, "sqft": 3329, "starting_price": null, "deposit": 1000, "available": false, "availability_status": "call_for_details" }
  ]
}
```

**Notes on the example values:** captured during testing on 2026-06-03. The amenity lists, plan names, dimensions, and deposits are stable site content; `starting_price` and `availability_status` are live inventory and will change — always re-fetch for current pricing. At capture time 12 of 27 plans were available with live pricing ($1,940–$3,819); the remaining 15 (incl. all townhomes and penthouses) were "call for details."
