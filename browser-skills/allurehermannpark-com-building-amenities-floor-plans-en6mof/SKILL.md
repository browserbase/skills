---
name: allurehermannpark-com-building-amenities-floor-plans-en6mof
title: Allure Hermann Park — Amenities & Floor Plans
description: >-
  Extract building amenities, apartment amenities, neighborhood amenities, and
  the full floor plan inventory (name, beds, baths, square feet, price range,
  availability date) from the Allure Hermann Park at Med Center marketing site.
website: allurehermannpark.com
category: real-estate
tags:
  - apartments
  - real-estate
  - rentcafe
  - yardi
  - houston
  - floor-plans
  - amenities
source: 'browserbase: agent-runtime 2026-05-29'
updated: '2026-05-29'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      No public/documented JSON endpoint surfaces the floor plan inventory; the
      site is server-rendered HTML on the RentCafe (Yardi) platform.
      Authenticated securecafe.com paths are not faster than parsing the public
      HTML.
  - method: fetch
    rationale: >-
      Direct HTTP fetch is blocked by Cloudflare's managed challenge (returns
      403 with cf-mitigated: challenge). Browser session with --verified solves
      the JS interstitial automatically.
verified: true
proxies: true
---
# Allure Hermann Park — Amenities & Floor Plans

## Purpose

Read-only extraction of building amenities, apartment amenities, neighborhood amenities, and the full floor plan inventory (name, bedrooms, bathrooms, square footage, starting/max monthly rent, and earliest move-in date) for the Allure Hermann Park at Med Center luxury apartment community at 5927 Almeda Road, Houston, TX 77004. Data is sourced from the public marketing site (RentCafe / Yardi platform). No login or form submission is required — every datum needed is rendered in static HTML on three pages: `/amenities`, `/floorplans`, and `/neighborhoodguide`.

## When to Use

- A user asks "what amenities does Allure Hermann Park offer?" or "what's in the neighborhood?"
- A user asks for the full unit catalog (floor plan names, sizes, prices, beds, baths, availability).
- A user asks "what's the cheapest / largest / available-now apartment at Allure Hermann Park?"
- A user wants to compare floor plans before scheduling a tour or applying.

## Workflow

1. **Open three pages in sequence** with a remote browser session (`--verified --proxies` required — the site sits behind Cloudflare's managed challenge; see Gotchas). For each, capture `browse get markdown body --remote` and parse:
   - `https://www.allurehermannpark.com/amenities` → "Community Amenities" `<ul>` and "Apartment Amenities" `<ul>` (each item is a `*` bullet ending in `Featured amenity`). Also captures pet policy ($350 non-refundable fee + $25/month per pet, weight/breed restrictions).
   - `https://www.allurehermannpark.com/floorplans` → repeated section block per plan. Each block contains:
     - `## <name> - <bed-spec>` heading (e.g. `## Adams - 1 Bedroom 1 Bath`, `## Penthouse 08`)
     - Three bullets: `* N Bed[s]`, `* N[.5] Bath[s]`, `* N[,NNN] Sq. Ft.`
     - Price line: either `Starting at $X,XXX.00` / `$X,XXX.00 to- $Y,YYY.00 / month` (when leasable) **or** `Call for details` (when unavailable / waitlist).
     - Availability line: `Available On: <M/D/YYYY>` or `Available On: Available Now` (only present when the plan has live pricing).
     - "Apply Now" deep-link `/floorplans/<slug>` (presence ≈ leasable; absence + "Get Notified" CTA ≈ waitlist).
   - `https://www.allurehermannpark.com/neighborhoodguide` → "Location Highlights", "Top Employers Near Allure Hermann Park", "Area Attractions Near Allure Hermann Park", and FAQ sections. Hand-curated by the property.
2. **Normalize each floor plan** into a record: `{ name, bedrooms, bathrooms, sqft, starting_price, max_price, available_on, status, image_url, apply_url }`. Status is `available` if a price range + `Available On` line is present, otherwise `waitlist`.
3. **Combine amenities** from the `/amenities` page (on-site features) with the `/neighborhoodguide` page (off-site, walking/driving-distance landmarks) for a complete "building + neighborhood" amenities summary.
4. **Return the structured JSON** described in `## Expected Output`. Do not attempt to click "Apply Now" or "Get Notified" — those are interactive CTAs that lead to lead-capture forms.

**No API shortcut available.** The site is a RentCafe-templated marketing page; floor plan data is server-rendered HTML, not exposed via a documented JSON endpoint. The unauthenticated `securecafe.com` leasing portal requires session cookies and is not faster than just reading the public HTML. Browser remains the recommended method.

## Site-Specific Gotchas

- **Cloudflare managed challenge.** The probe in `HOST_OPERATOR_CONTEXT` reported `antibots: none detected`, but a bare `browse cloud fetch https://www.allurehermannpark.com/` returns HTTP 403 with `cf-mitigated: challenge` and the "Just a moment..." interstitial. The challenge is JS-only and is silently solved by a remote Browserbase session with `--verified --proxies`. **Always create sessions with both flags** — without `--verified` the JS challenge will stall, without `--proxies` the request may be rate-limited.
- **Apex domain 301-redirects to `www`.** `https://allurehermannpark.com/` returns `301 → http://www.allurehermannpark.com`. Navigate to the `www.` host directly to avoid a wasted hop.
- **Two price-display patterns on the floor plan page.**
  - Available units: `$1,772.00 to- $2,356.00 / month` plus `Available On: 7/29/2026` (or `Available On: Available Now`) plus an `Apply Now` button linking to `/floorplans/<slug>`.
  - Unavailable units: only `Call for details` text and a `Get Notified` modal trigger (no price, no date, no Apply link). These are valid floor plans, just not currently leasable — keep them in the inventory marked `status: "waitlist"`.
- **Two render passes on the same page.** `/floorplans` lists each plan twice in the DOM — once in a top "card grid" (heading `## <name>`, single `Starting at $X` price) and once below in a detail block (same heading repeated, full `$X to- $Y / month` range plus availability date). The detail block is the authoritative source for the price range and move-in date; the card grid is the source for the `Starting at` baseline. Both blocks share the same plan names; de-duplicate by `name`.
- **Penthouse 09-2 and Penthouse 10-2 are 4BR/4.5BA two-story units** (the `-2` suffix denotes the second floor), not duplicates of Penthouse 09 / 10. They have separate `_01` and `_02` floor plan images and are 2,599 and 3,055 sqft respectively.
- **"Picasso - I Bedroom 1.5 Baths" has a typo** (`I` instead of `1`) in the page title — treat it as 1 Bedroom.
- **Bath counts come in halves.** Possible values observed: 1, 1.5, 2, 2.5, 4.5 (penthouses). Always parse as `Number`, not `Integer`.
- **Square footage uses comma thousands separator** (`1,209 Sq. Ft.`). Strip commas before parsing.
- **Availability dates use US `M/D/YYYY` format**, not ISO. `Available Now` is a sentinel string, not a date.
- **Neighborhood amenities are property-curated**, not derived from a Google Places query. The list reflects only what the property advertises: Hermann Park (445 acres), Houston Zoo, Texas Medical Center, Rice University, Museum District (19 museums), Miller Outdoor Theatre, Houston Museum of Natural Science, McGovern Centennial Gardens, Hermann Park Japanese Garden, Children's Museum Houston, Museum of Fine Arts Houston, Hermann Park Golf Course, and major TMC employers. Distance/minute estimates are not provided on the site.
- **Pet policy is on `/amenities`, not on a separate page.** $350 non-refundable fee per animal, $25/month per animal, weight & breed restrictions apply.
- **The leasing phone is +1 832-304-7754 (local) or +1 855-962-4484 (toll-free).** Office hours Mon–Fri 9 AM–6 PM, Sat 10 AM–5 PM, closed Sun.
- **The site is operated by WRH Realty Services on the RentCafe (Yardi) platform.** Other WRH properties use identical page structure, so the same parser will work cross-property.

## Expected Output

```json
{
  "property": {
    "name": "Allure Hermann Park at Med Center",
    "address": "5927 Almeda Road, Houston, TX 77004",
    "operator": "WRH Realty Services",
    "platform": "RentCafe / Yardi",
    "phone_local": "+1 832-304-7754",
    "phone_toll_free": "+1 855-962-4484",
    "office_hours": {
      "mon_fri": "9:00 AM – 6:00 PM",
      "sat": "10:00 AM – 5:00 PM",
      "sun": "Closed"
    },
    "high_rise_floors": 29,
    "pet_policy": {
      "allowed": true,
      "non_refundable_fee_usd": 350,
      "monthly_rent_usd": 25,
      "restrictions": "weight and breed restrictions apply"
    }
  },
  "community_amenities": [
    "Stunning Infinity Pool with Private Cabanas",
    "6,000 sq. ft. Fitness Center with Professional Boxing Gym",
    "Resident Social Lounge with Fully-Equipped Catering Kitchen",
    "Media Lounge with Large-Screen HDTV",
    "Sky Lounge with Billiards and Ping-Pong Tables",
    "Recreation Deck with Firepits",
    "Outdoor Dining and Grilling Areas",
    "Wi-Fi Business Center and Conference Rooms",
    "His/Her Saunas, Steam Rooms, and Furnished Locker Rooms",
    "24/7 Concierge Services",
    "Complimentary Valet Services (residents)",
    "Complimentary Shuttle Service to Texas Medical Center",
    "Controlled-Access Parking Garage",
    "Controlled / Gated Access",
    "Covered Parking",
    "Elevators",
    "Bike Racks",
    "Animal-Friendly Community (pet park + on-site grooming/wash station)",
    "Walking distance to Hermann Park Golf Course, Houston Zoo, Med Center, Museum District"
  ],
  "apartment_amenities": [
    "Spacious 1- and 2-bedroom floor plans",
    "2- and 4-bedroom penthouse homes available",
    "Floor-to-ceiling windows with panoramic city views",
    "Soaring 10'–13' ceilings",
    "Fully equipped kitchens with stainless steel appliances and breakfast bars",
    "Custom contemporary kitchen cabinets with designer backsplash",
    "Expansive kitchen island",
    "Spa-inspired bathrooms with private stand-up showers and soaking tubs",
    "Luxury vinyl tile flooring and ceramic tile",
    "Plush carpet in the bedrooms",
    "Oversized walk-in closets",
    "Full-size washer and dryer in every home",
    "Patio / balcony",
    "300–1,200 sq. ft. private terraces with views of Hermann Park and the Medical Center"
  ],
  "neighborhood_amenities": {
    "highlights": {
      "tmc_proximity": "Adjacent to Texas Medical Center hospitals and research institutions",
      "hermann_park": "445-acre urban park with gardens, trails, lakes",
      "museum_district": "19 museums minutes away",
      "rice_university": "Directly bordering Hermann Park"
    },
    "top_employers_nearby": [
      "MD Anderson Cancer Center",
      "Houston Methodist",
      "Memorial Hermann Health System",
      "Baylor College of Medicine",
      "Texas Children's Hospital",
      "Rice University",
      "Michael E. DeBakey VA Medical Center",
      "UTHealth Houston",
      "Harris Health System",
      "Houston Museum of Natural Science"
    ],
    "attractions": [
      "Hermann Park (445 acres)",
      "Houston Zoo (inside Hermann Park)",
      "Miller Outdoor Theatre",
      "Houston Museum of Natural Science",
      "McGovern Centennial Gardens",
      "Hermann Park Japanese Garden",
      "Houston Museum District",
      "Children's Museum Houston",
      "Museum of Fine Arts, Houston",
      "Hermann Park Golf Course (18-hole public)"
    ],
    "nearby_neighborhoods": [
      "Texas Medical Center",
      "Museum District",
      "Midtown",
      "Montrose",
      "Downtown Houston",
      "Rice Village",
      "Upper Kirby",
      "River Oaks"
    ]
  },
  "floor_plans": [
    { "name": "Adams",       "bedrooms": 1, "bathrooms": 1,   "sqft": 672,   "starting_price_usd": 1772, "max_price_usd": 2356, "available_on": "2026-07-29", "status": "available" },
    { "name": "Blake",       "bedrooms": 1, "bathrooms": 1,   "sqft": 690,   "starting_price_usd": 1832, "max_price_usd": 2787, "available_on": "2026-07-14", "status": "available" },
    { "name": "Degas",       "bedrooms": 1, "bathrooms": 1,   "sqft": 748,   "starting_price_usd": 1972, "max_price_usd": 3029, "available_on": "2026-06-04", "status": "available" },
    { "name": "Botticelli",  "bedrooms": 1, "bathrooms": 1.5, "sqft": 757,   "starting_price_usd": 1912, "max_price_usd": 2846, "available_on": "2026-07-24", "status": "available" },
    { "name": "Matisse",     "bedrooms": 1, "bathrooms": 1.5, "sqft": 761,   "starting_price_usd": 1872, "max_price_usd": 3412, "available_on": "2026-07-11", "status": "available" },
    { "name": "Chihuly",     "bedrooms": 1, "bathrooms": 1,   "sqft": 757,   "starting_price_usd": 1918, "max_price_usd": 3122, "available_on": "2026-07-27", "status": "available" },
    { "name": "Donatello",   "bedrooms": 1, "bathrooms": 1.5, "sqft": 761,   "starting_price_usd": 2168, "max_price_usd": 3145, "available_on": "Available Now", "status": "available" },
    { "name": "Dali",        "bedrooms": 1, "bathrooms": 1,   "sqft": 791,   "starting_price_usd": 1962, "max_price_usd": 2996, "available_on": "2026-07-04", "status": "available" },
    { "name": "Michelangelo","bedrooms": 1, "bathrooms": 1.5, "sqft": 800,   "starting_price_usd": null, "max_price_usd": null, "available_on": null,         "status": "waitlist"  },
    { "name": "da Vinci",    "bedrooms": 1, "bathrooms": 1,   "sqft": 800,   "starting_price_usd": 2172, "max_price_usd": 3233, "available_on": "2026-07-29", "status": "available" },
    { "name": "Monet",       "bedrooms": 1, "bathrooms": 1,   "sqft": 846,   "starting_price_usd": 2208, "max_price_usd": 3566, "available_on": "2026-07-16", "status": "available" },
    { "name": "Picasso",     "bedrooms": 1, "bathrooms": 1.5, "sqft": 850,   "starting_price_usd": 2122, "max_price_usd": 2525, "available_on": "2026-06-14", "status": "available" },
    { "name": "van Gogh",    "bedrooms": 2, "bathrooms": 2.5, "sqft": 1209,  "starting_price_usd": 2890, "max_price_usd": 4668, "available_on": "2026-08-14", "status": "available" },
    { "name": "Raphael",     "bedrooms": 2, "bathrooms": 2,   "sqft": 1221,  "starting_price_usd": 2836, "max_price_usd": 4326, "available_on": "2026-07-19", "status": "available" },
    { "name": "Rembrandt",   "bedrooms": 2, "bathrooms": 2,   "sqft": 1184,  "starting_price_usd": null, "max_price_usd": null, "available_on": null,         "status": "waitlist"  },
    { "name": "Rousseau",    "bedrooms": 2, "bathrooms": 2.5, "sqft": 1284,  "starting_price_usd": null, "max_price_usd": null, "available_on": null,         "status": "waitlist"  },
    { "name": "Renoir",      "bedrooms": 2, "bathrooms": 2,   "sqft": 1262,  "starting_price_usd": null, "max_price_usd": null, "available_on": null,         "status": "waitlist"  },
    { "name": "Rockwell",    "bedrooms": 2, "bathrooms": 2,   "sqft": 1469,  "starting_price_usd": 3196, "max_price_usd": 4876, "available_on": "2026-07-24", "status": "available" },
    { "name": "Warhol",      "bedrooms": 2, "bathrooms": 2.5, "sqft": 1674,  "starting_price_usd": 3570, "max_price_usd": 5179, "available_on": "Available Now", "status": "available" },
    { "name": "Penthouse 01","bedrooms": 2, "bathrooms": 2.5, "sqft": 1984,  "starting_price_usd": null, "max_price_usd": null, "available_on": null,         "status": "waitlist"  },
    { "name": "Penthouse 02","bedrooms": 2, "bathrooms": 2.5, "sqft": 1909,  "starting_price_usd": null, "max_price_usd": null, "available_on": null,         "status": "waitlist"  },
    { "name": "Penthouse 03","bedrooms": 2, "bathrooms": 2.5, "sqft": 1787,  "starting_price_usd": null, "max_price_usd": null, "available_on": null,         "status": "waitlist"  },
    { "name": "Penthouse 04","bedrooms": 2, "bathrooms": 2.5, "sqft": 1708,  "starting_price_usd": null, "max_price_usd": null, "available_on": null,         "status": "waitlist"  },
    { "name": "Penthouse 05","bedrooms": 2, "bathrooms": 2.5, "sqft": 1502,  "starting_price_usd": null, "max_price_usd": null, "available_on": null,         "status": "waitlist"  },
    { "name": "Penthouse 06","bedrooms": 2, "bathrooms": 2.5, "sqft": 1532,  "starting_price_usd": null, "max_price_usd": null, "available_on": null,         "status": "waitlist"  },
    { "name": "Penthouse 07","bedrooms": 2, "bathrooms": 2.5, "sqft": 1859,  "starting_price_usd": null, "max_price_usd": null, "available_on": null,         "status": "waitlist"  },
    { "name": "Penthouse 08","bedrooms": 2, "bathrooms": 2.5, "sqft": 1836,  "starting_price_usd": 3900, "max_price_usd": 6299, "available_on": "Available Now", "status": "available" },
    { "name": "Penthouse 09","bedrooms": 2, "bathrooms": 2.5, "sqft": 1674,  "starting_price_usd": null, "max_price_usd": null, "available_on": null,         "status": "waitlist"  },
    { "name": "Penthouse 09-2","bedrooms": 4, "bathrooms": 4.5, "sqft": 3055,"starting_price_usd": null, "max_price_usd": null, "available_on": null,         "status": "waitlist"  },
    { "name": "Penthouse 10","bedrooms": 2, "bathrooms": 2,   "sqft": 1469,  "starting_price_usd": 4165, "max_price_usd": 6728, "available_on": "2026-06-14", "status": "available" },
    { "name": "Penthouse 10-2","bedrooms": 4, "bathrooms": 4.5, "sqft": 2599,"starting_price_usd": null, "max_price_usd": null, "available_on": null,         "status": "waitlist"  }
  ],
  "summary": {
    "total_floor_plans": 32,
    "available_now_or_soon": 14,
    "waitlist_call_for_details": 18,
    "bedroom_distribution": { "1": 12, "2": 18, "4": 2 },
    "sqft_range": { "min": 672, "max": 3055 },
    "available_price_range_usd": { "min_starting": 1772, "max_starting": 4165, "min_max": 2356, "max_max": 6728 }
  },
  "source_pages": [
    "https://www.allurehermannpark.com/amenities",
    "https://www.allurehermannpark.com/floorplans",
    "https://www.allurehermannpark.com/neighborhoodguide"
  ],
  "retrieved_at": "2026-05-29T22:08:00Z"
}
```
