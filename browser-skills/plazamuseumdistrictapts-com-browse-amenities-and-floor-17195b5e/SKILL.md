---
name: plazamuseumdistrictapts-com-browse-amenities-and-floor-17195b5e
title: Plaza Museum District Amenities & Floor Plans
description: >-
  Extract The Plaza Museum District (1615 Hermann Dr, Houston TX) building &
  neighborhood amenities plus the full floor-plan catalog — layout types,
  bed/bath/sqft, starting and per-unit rent, lease terms, move-in dates, and
  live availability. Read-only.
website: plazamuseumdistrictapts.com
category: real-estate
tags:
  - real-estate
  - apartments
  - floor-plans
  - amenities
  - read-only
  - jonah-digital
source: 'browserbase: agent-runtime 2026-05-30'
updated: '2026-05-30'
recommended_method: hybrid
alternative_methods:
  - method: fetch
    rationale: >-
      The /amenities/ and /neighborhood/ pages are fully server-rendered static
      HTML — a single `browse cloud fetch <url> --proxies` returns the complete
      amenity bullet lists and neighborhood POIs with zero JS. Use fetch for
      these two halves.
  - method: browser
    rationale: >-
      The /floorplans/ catalog is rendered client-side by the Jonah Digital
      floor-plan widget, which pulls live pricing/availability from a
      session-bound AJAX endpoint (_fp-renderable). That endpoint 302-redirects
      without the page's PHPSESSID cookie + per-session instance hash + XHR
      headers, so it is NOT replayable out-of-band. A rendered browser session
      is required for floor-plan pricing & availability.
  - method: browser
    rationale: >-
      The home address, embedded JSON-LD accommodationFloorPlan list (all 12
      layout names + detail URLs), and the dynamically-injected phone number are
      all present in the rendered DOM, giving the full 12-layout roster even
      though only currently-available layouts show pricing.
verified: false
proxies: true
---
# Plaza Museum District — Amenities & Floor Plans

## Purpose

Extract a complete, read-only summary of **The Plaza Museum District** apartments (1615 Hermann Dr, Houston, TX 77004) — a Berkshire-managed, Jonah-Digital-built marketing site. Returns three things:

1. **Building (community + in-apartment) amenities** — the full feature lists.
2. **Neighborhood amenities** — nearby restaurants, coffee, shopping, recreation, plus the Walk Score.
3. **Floor plans** — the full 12-layout catalog (A1–A6l, D1–D6) with bed/bath/square-feet metadata, starting/per-unit base rent, lease terms, move-in dates, and live availability.

The optimal path is **hybrid**: the `/amenities/` and `/neighborhood/` pages are static server-rendered HTML you can grab with a single proxied `fetch`, while the `/floorplans/` page is a client-side widget whose live pricing/availability requires a rendered browser session. Nothing here is a purchase or booking flow — never submit the tour/apply forms.

## When to Use

- "What amenities does The Plaza Museum District offer (in-unit and community)?"
- "What's near the building — restaurants, shopping, walkability?"
- "List Plaza Museum District floor plans with prices, square footage, and what's available."
- A rental-aggregator or relocation agent collecting current availability + starting rents for one property.

## Workflow

### Part A — Amenities & neighborhood (cheap `fetch`, no browser)

Both pages are fully server-rendered. One HTTP round-trip each (use `--proxies`; a bare fetch also returns 200 but proxies is the verified-working config):

```bash
browse cloud fetch "https://plazamuseumdistrictapts.com/amenities/"    --proxies   # static HTML
browse cloud fetch "https://plazamuseumdistrictapts.com/neighborhood/" --proxies   # static HTML
```

- **Amenities** live under two headings: **"Your Apartment"** (in-unit features) and **"Your Community"** (building/community features). Items flagged with a trailing `*` are "Available in select units." There is a "Show All" toggle in the DOM, but all items are already present in the static HTML — no expansion click needed.
- **Neighborhood** lists POIs grouped into four tabs — **Restaurants, Coffee, Shopping, Recreation** — plus a **Walk Score** ("71 — Very Walkable"). All four groups are present in the static HTML regardless of which tab is visually active.

Strip tags and read the bullet text. (Both pages also share a `/p/pet-friendly/` pet policy block: up to 2 pets, $400 fee/pet, $35/mo rent/pet, breed restrictions.)

### Part B — Floor plans (browser render required)

The `/floorplans/` page boots the Jonah Digital floor-plan widget (`/fp-assets/js/app.js`). Cards are injected client-side from a **session-bound** AJAX endpoint, so you must render the page in a real browser.

1. **Create a proxied session** (no `--verified` needed — verified across this run):
   ```bash
   sid=$(browse cloud sessions create --keep-alive --proxies | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s.replace(/^[\s\S]*?\{/,'{')).id))")
   export BROWSE_SESSION="$sid"
   ```
2. **Open and wait** (`wait load` may time out on this site's long-tail trackers — that's harmless; the content is already painted. Use a fixed timeout instead):
   ```bash
   browse open "https://plazamuseumdistrictapts.com/floorplans/" --session "$sid"
   browse wait timeout 5000 --session "$sid"
   ```
3. **Read both views.** The widget has two tabs: **`Map`** (default — sightmap + a "List View" of every currently-available *unit*) and **`Floorplans`** (a grid of *layout types* with starting rent). Snapshot to get refs, then click the **Floorplans** tab to also surface the per-layout starting-rent cards:
   ```bash
   browse snapshot --session "$sid"            # find the "Floorplans" tab ref
   browse click @<floorplans-tab-ref> --session "$sid"
   browse wait timeout 3500 --session "$sid"
   browse get text body --session "$sid"       # now contains BOTH the unit list and the layout grid
   ```
4. **Parse** the rendered text:
   - **Layout cards** (Floorplans tab): `<PlanCode>` + `N bed N bath NNN sq. ft.` + `Base Rent $X,XXX` + optional `Only N left!` scarcity badge.
   - **Unit cards** (Map tab "List View"): `<PlanCode>` + `#<unit>` + `Available <Mon DD>` + `N bed N bath NNN sq. ft.` + `Base Rent $X,XXX` + `NN months` lease term.
5. **Get the full 12-layout roster** from the embedded JSON-LD. The rendered DOM contains a schema.org `ApartmentComplex` block whose `accommodationFloorPlan` array lists **all 12 layout names with `/floorplans/{slug}/` detail URLs**, even ones with no current availability:
   ```bash
   browse eval "JSON.stringify([...document.querySelectorAll('script[type=\"application/ld+json\"]')].map(s=>s.textContent))" --session "$sid"
   ```
   1-bedroom A-types: `A1, A2, A3, A4l, A5, A6l` · 2-bedroom D-types: `D1, D2, D3, D4, D5, D6`.
6. **Release**:
   ```bash
   browse cloud sessions update "$sid" --status REQUEST_RELEASE
   ```

## Site-Specific Gotchas

- **READ-ONLY.** Stop at the floor-plan / availability screen. Never submit the "Schedule a Tour", "Find Your Home", or "Apply Now" (securecafe.com online leasing) forms. The site uses **reCAPTCHA v3** — a passive, hidden-badge token that only matters on form submit; it does **not** block page loads or floor-plan rendering. No CAPTCHA challenge, no Akamai, no login wall was hit anywhere (0 × 4xx across the run).
- **`fetch` works for amenities/neighborhood but NOT floor plans.** `/amenities/` and `/neighborhood/` are static and fully fetchable. `/floorplans/` returns only an empty widget shell on a plain fetch.
- **The floor-plan data endpoint is session-bound — do not try to replay it.** The widget calls `GET /floorplans/_fp-renderable/params:instance=<hash>&action=render&type=listing-chunks/?forcecache=1`. The `<hash>` (e.g. `20f4d721…`) is minted per session and tied to the `PHPSESSID` cookie; calling the endpoint (any variant, with/without proxies) without that live session + XHR headers **302-redirects to `/floorplans/`** with an empty body. Confirmed across multiple out-of-band attempts. Render the page instead.
- **"twelve distinct layouts" but only ~7 show pricing.** The widget only renders layout/unit cards for floor plans that currently have available units. At capture time the **Floorplans** tab showed 7 layout types (A1, A2, A3, A5, D1, D2, D6); the other 5 layouts (A4l, A6l, D3, D4, D5) appear only in the JSON-LD roster + have `/floorplans/{slug}/` detail pages, with **no live price/availability**. To report bed/bath/sqft for an unavailable layout, open its detail page; expect it to lack a current rent.
- **The embedded JSON-LD per-unit numeric fields are a BROKEN scaffold — do not trust them.** Every `accommodationFloorPlan` *unit* entry repeats `numberOfBedrooms:1, numberOfBathroomsTotal:1, floorSize.value:686` regardless of the real layout (the D2 1175-sqft 2BR unit is mislabeled as 1BR/686). **The rendered card text ("2 bed 2 bath 1175 sq. ft.") is authoritative**; the JSON-LD is reliable only for the 12 layout *names* and detail URLs.
- **"Outside price filter range" badge is noise.** Every unit in the Map-tab List View was tagged "Outside price filter range" even when its base rent ($1,629–$2,288) sits inside the default filter window ($1,600–$2,600). The widget's default price slider compares against a different (likely market/effective) price field, so this badge does **not** mean the unit is excluded. Ignore it; report the unit.
- **Sightmap floor-level "avail" counts don't reconcile with the unit list.** The Map tab's floor selector showed Floor 1 = 7, Floor 2 = 3, Floor 3 = 5, Floors 4–6 = 0 avail (sum 15), while "List View" said **7 available** and listed 7 units. Treat the per-unit List View as the authoritative availability count; the floor-selector tallies (Engrain/sightmap embed, asset_id 28411) are supplementary and can diverge.
- **`browse wait load` times out (~30s) on this site** because of long-lived third-party trackers (MeetElise/EliseAI chat, CallRail, GTM). The content paints well before that. Use `browse wait timeout <ms>` (4–5s) instead of relying on the load event.
- **Browserbase + browser-trace ordering.** When attaching `browser-trace`'s `bb-capture.mjs`, it spawns a `browse daemon` already bound to the session in CDP mode. Drive subsequent commands with just `--session "$sid"` (the daemon holds the target) — adding `--remote` triggers `"already running in cdp mode"` errors.
- **Dynamic phone number.** The footer/header phone is swapped by a `GET /get-dni-phone-number/?format=dash` call (CallRail DNI), so you may see `(713) 597-7732` in the rendered DOM vs `(713) 874-1311` in the raw HTML. Both reach the property.
- **Data is live & changes.** Prices, lease terms, move-in dates, and which layouts are available are pulled fresh each load — re-render for current values rather than caching.

## Expected Output

```json
{
  "success": true,
  "property": {
    "name": "The Plaza Museum District",
    "address": "1615 Hermann Dr, Houston, TX 77004",
    "phone": "(713) 874-1311",
    "managedBy": "Berkshire",
    "petPolicy": "Up to 2 pets/apartment, no weight limit. Pet fee $400/pet, pet rent $35/pet/mo. Breed restrictions apply; service animals exempt."
  },
  "amenities": {
    "apartment": [
      "Modern One & Two Bedroom Apartments", "Scenic Views Of Hermann Park", "9Ft Ceilings",
      "Expansive Windows", "Hardwood-Inspired Flooring*", "Chef-Inspired Kitchen with Custom Cabinets",
      "Stainless Steel Appliance Package", "Breakfast Bar", "Granite Countertops", "Kitchen Pantry",
      "Dining Space or Home Office", "Ceiling Fans In Living Room & Bedroom", "Office Space*",
      "Carpeted Floors", "Spa Bathroom with Garden Soaking Bathtub", "Dual Vanities*",
      "Spacious Closets", "In Home Washer & Dryer", "Private Balconies and Patios",
      "Intrusion Alarm Available", "Central Air/Heating", "Pet Friendly Community"
    ],
    "community": [
      "Resort Inspired Pool with Water Features", "Poolside Cabana with Outdoor Kitchen",
      "Tanning Ledge", "Soothing Spa/Hot Tub", "24/7 State-Of-The-Art Fitness Center",
      "Free Weight Station", "Resident Lounge & Business Center", "Package Lockers",
      "Free Wi-Fi In Common Areas", "Valet Trash Pick Up and Recycling Program",
      "Pet Friendly Community", "Elevator Access", "Gated Access", "Parking Garage",
      "Assigned Parking Available", "On-Site Maintenance", "24/7 Emergency Maintenance",
      "In the Heart of the Houston Medical District", "Public Parks Nearby",
      "Walking Distance To Houston Museum District", "Access To Public Transportation",
      "Easy Access To Freeways"
    ],
    "note": "Items marked * are available in select units only."
  },
  "neighborhood": {
    "walkScore": 71,
    "walkScoreLabel": "Very Walkable",
    "restaurants": ["MF Sushi", "Fadi's Mediterranean Eatery", "Dak & Bop", "Fia's Pizzeria", "Granger's Restaurant & Bar", "Lien's Viet Kitchen"],
    "coffee": ["Pinewood Cafe", "Shipley Do-Nuts", "Barnaby's Cafe", "Mo' Brunch + Brews", "Kin Café", "Koko Cafe"],
    "shopping": ["Ross Dress for Less", "Almeda Center", "Target", "Hawthorne Square", "H-E-B", "Southmore Market"],
    "recreation": ["Grace and Grit Fitness", "Outdoor Workouts", "Museum of Fine Arts", "Rice Cinema", "Children's Museum Outdoor Park", "Memorial Hermann Centennial Park"]
  },
  "floorPlans": {
    "totalLayouts": 12,
    "allLayoutCodes": ["A1","A2","A3","A4l","A5","A6l","D1","D2","D3","D4","D5","D6"],
    "availableLayouts": [
      { "code": "A1", "beds": 1, "baths": 1, "sqft": 686,  "startingRent": 1629, "scarcity": null,        "detailUrl": "https://plazamuseumdistrictapts.com/floorplans/a1/" },
      { "code": "A2", "beds": 1, "baths": 1, "sqft": 752,  "startingRent": 1817, "scarcity": null,        "detailUrl": "https://plazamuseumdistrictapts.com/floorplans/a2/" },
      { "code": "A3", "beds": 1, "baths": 1, "sqft": 886,  "startingRent": 2072, "scarcity": "Only 2 left!", "detailUrl": "https://plazamuseumdistrictapts.com/floorplans/a3/" },
      { "code": "A5", "beds": 1, "baths": 1, "sqft": 947,  "startingRent": 2167, "scarcity": "Only 2 left!", "detailUrl": "https://plazamuseumdistrictapts.com/floorplans/a5/" },
      { "code": "D1", "beds": 2, "baths": 2, "sqft": 1139, "startingRent": 2302, "scarcity": "Only 1 left!", "detailUrl": "https://plazamuseumdistrictapts.com/floorplans/d1/" },
      { "code": "D2", "beds": 2, "baths": 2, "sqft": 1175, "startingRent": 2288, "scarcity": "Only 1 left!", "detailUrl": "https://plazamuseumdistrictapts.com/floorplans/d2/" },
      { "code": "D6", "beds": 2, "baths": 2, "sqft": 1292, "startingRent": 2584, "scarcity": "Only 1 left!", "detailUrl": "https://plazamuseumdistrictapts.com/floorplans/d6/" }
    ],
    "unavailableLayouts": ["A4l","A6l","D3","D4","D5"],
    "availableUnits": [
      { "unit": "#2105", "plan": "A1", "beds": 1, "baths": 1, "sqft": 686,  "baseRent": 1685, "leaseTermMonths": 14, "availableFrom": "Jun 05" },
      { "unit": "#2104", "plan": "A1", "beds": 1, "baths": 1, "sqft": 686,  "baseRent": 1649, "leaseTermMonths": 14, "availableFrom": "Jun 25" },
      { "unit": "#1120", "plan": "A1", "beds": 1, "baths": 1, "sqft": 686,  "baseRent": 1629, "leaseTermMonths": 13, "availableFrom": "Jul 09" },
      { "unit": "#1138", "plan": "A1", "beds": 1, "baths": 1, "sqft": 686,  "baseRent": 1840, "leaseTermMonths": 13, "availableFrom": "Jul 24" },
      { "unit": "#1112", "plan": "D2", "beds": 2, "baths": 2, "sqft": 1175, "baseRent": 2288, "leaseTermMonths": 15, "availableFrom": "Jul 24" },
      { "unit": "#1132", "plan": "A3", "beds": 1, "baths": 1, "sqft": 886,  "baseRent": 2118, "leaseTermMonths": 12, "availableFrom": "Aug 10" },
      { "unit": "#1107", "plan": "A3", "beds": 1, "baths": 1, "sqft": 886,  "baseRent": 2072, "leaseTermMonths": 13, "availableFrom": "Aug 21" }
    ],
    "totalAvailableUnits": 7,
    "disclaimer": "Floor plans are artist's rendering; dimensions approximate. Base rent is monthly; additional fees may apply (utilities, package, trash, water, amenities). Prices & availability subject to change.",
    "capturedAt": "2026-05-30"
  }
}
```

Notes for the consuming agent:
- `beds`/`baths`/`sqft` on `availableUnits` come from the **rendered card text**, NOT the JSON-LD (which is bugged — see gotchas).
- `startingRent` on a layout is the lowest base rent across its available units; per-unit rent varies (see `availableUnits[].baseRent`).
- `unavailableLayouts` have detail pages but no live pricing at capture time; fetch `detailUrl` (e.g. `/floorplans/d3/`) for their static bed/bath/sqft if needed.
- All rent values are USD/month base rent; lease terms in months.
