---
name: spinach-guide-create-vegan-itinerary-6ztwyn
title: Create Vegan Food Itinerary
description: >-
  Build a day-by-day vegan-food itinerary for a spinach.guide city by
  synthesizing Top Picks, signature-dish rankings, dietary-core lists, and
  meal-occasion buckets against user constraints (allergies, cravings, price
  band, vegan-only strictness, neighborhood anchors).
website: spinach.guide
category: travel
tags:
  - travel
  - food
  - vegan
  - itinerary
  - restaurants
  - planning
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: url-param
alternative_methods:
  - method: browser
    rationale: >-
      Fallback path via `browse open` + `browse get markdown body` on the same
      slugs. Identical data, ~10x cost premium over direct HTTPS fetch. Useful
      only if Cloudflare ever ratchets up; not needed today.
  - method: api
    rationale: >-
      Confirmed unavailable: /api/cities/{slug} returns 404, and no GraphQL/REST
      endpoint is exposed. The embedded Supabase client only handles
      photo-failure telemetry. The static Astro HTML is the API.
verified: false
proxies: false
---
# Create Vegan Food Itinerary

## Purpose

Build a day-by-day vegan-food itinerary for a city covered by spinach.guide by synthesizing the site's Top Picks (Essentials), signature-dish rankings, dietary-core lists, and meal-occasion buckets (breakfast / lunch & brunch / dinner / sweet treats / etc.) into a structured plan for an arbitrary number of days, weighted against user-supplied constraints — preferences, allergies, cravings, price band, vegan-only vs. omni-friendly, and any anchor neighborhoods from an existing travel itinerary. Read-only; never books, reserves, or contacts a venue.

## When to Use

- A user is traveling to one of the 158 ranked spinach.guide cities for N days and wants a meal-by-meal plan grounded in current rankings, not generic listicles.
- A user wants the plan filtered by hard constraints (gluten-free, nut allergy, soy-free) and soft preferences (Japanese cravings, $$ budget, walkable from Mission Bay, kid-friendly only).
- A user is staying in a specific neighborhood / has a fixed day-by-day location plan and wants meal stops bucketed closest to where they'll be each day.
- A user wants a "best of" weekend (2 days) vs. a deeper week-long (7 days) tour, and expects later days to dig past the obvious 15 essentials into hidden gems and dish-specific #1s.

## Workflow

The site is a static Astro build behind Cloudflare with **no anti-bot, no auth, no JS gating, and no JSON API** — every page renders the full dataset server-side. The fastest path is direct HTTPS GETs against predictable URL slugs and parsing the markdown-rendered body. `browse cloud fetch <url>` returns the full HTML in a single hop (~80–120ms); `browse open` + `browse get markdown body` is a cheaper second option that yields pre-cleaned markdown. No browser session, no proxy, no `--verified` is required — confirmed against 5+ cities on iter-1. (The site does block `Bytespider`, `CCBot`, and `meta-externalagent` in `robots.txt` but allows everything else; default user-agents work.)

There is **no `/api/cities/...` endpoint** (returns 404). Everything is in the rendered HTML. Treat each page slug as the API.

### URL atlas (the full vocabulary)

| Page | URL pattern | What's on it |
|---|---|---|
| City overview | `/cities/{city-slug}/` | Intro paragraph (signature cuisine, summary stats), Top 15 Essentials, signature-dish sections (e.g. Best Ramen, Best Donut), Fully Vegan, Omni Standouts, all meal-occasion sections in collapsed form, by-dish rankings, by-cuisine rankings, FAQ |
| Top 15 must-go | `/cities/{city-slug}/essentials/` | Full ranked list with at-a-glance metadata, today's hours, sort + filter chips |
| Fully-vegan kitchens | `/cities/{city-slug}/fully-vegan/` | Plant-based-only places (no swaps / asking) |
| Omni standouts | `/cities/{city-slug}/omni-standouts/` | Mainstream places where vegan side is treated seriously |
| Breakfast | `/cities/{city-slug}/breakfast-spots/` | Open before 10, coffee-forward |
| Lunch & brunch | `/cities/{city-slug}/lunch-brunch/` | Weekday fuel, weekend stretches |
| Dinner | `/cities/{city-slug}/dinner-destinations/` | "The reason you planned the trip" |
| Worth the occasion | `/cities/{city-slug}/worth-the-occasion/` | Date night / birthday / celebration |
| Hidden gems | `/cities/{city-slug}/hidden-gems/` | Smaller rooms, shorter menus, less-discovered |
| Sweet treats | `/cities/{city-slug}/sweet-treats/` | Desserts, ice cream, bakeries |
| Family-friendly | `/cities/{city-slug}/family-friendly/` | Kid-appropriate |
| Group night out | `/cities/{city-slug}/group-night-out/` | Group-size-friendly |
| Work-friendly | `/cities/{city-slug}/work-friendly/` | Laptop / wifi / lingering |
| Dish ranking in city | `/best/{dish-slug}/{city-slug}/` | All venues in city ranked for that dish |
| Dish ranking global | `/best/{dish-slug}/` | Top cities for that dish |
| Individual venue | `/venues/{venue-slug}/` | Address, hours, popular tips, must-try dishes, "praised for" attributes, photos, Google Maps directions link with lat/lon, external ratings |
| City index | `/cities/` | All 158 covered cities |
| Sitemap | `/sitemap-0.xml` | Every URL on the site — authoritative source for valid city/category combos |

**Not every city has every category.** Smaller cities (e.g. Wellington, York) typically lack `work-friendly`, `hidden-gems`, or `worth-the-occasion`. Probe the sitemap or read the "On this page" nav of the city overview to confirm which sections exist before fetching. Hitting a missing category returns a 404 HTML page (custom Spinach 404, not an error envelope).

### Steps

1. **Resolve the city slug.** Lowercase, hyphenated, no diacritics: `san-francisco`, `new-york-city`, `ho-chi-minh-city`, `los-angeles`. If the user gives a city name, slugify it; if uncertain, `GET /sitemap-0.xml` and grep for `/cities/{candidate}/` — the sitemap is the source of truth.

2. **Fetch the city overview** (`/cities/{slug}/`). This single page is enough for a 1–2 day itinerary and gives you the full set of available category slugs for that city (read the "On this page" nav links to know what exists). Extract:
   - Intro paragraph (city's signature cuisine angle — e.g. "San Francisco leans Japanese ramen on signatures with 18 venues serving it")
   - Top 15 Essentials list (each card: rank, venue-slug, name, ★ rating, A–E grade, $ price band, distance-from-centre, cuisine description, one-line tip, dish rank badge if applicable e.g. `#1 FOR RAMEN IN SAN FRANCISCO`)
   - Signature dish sections (e.g. Best Ramen — top 4 venues per dish)
   - Fully Vegan / Omni Standouts (top 4 of each)
   - Each meal-occasion section's top 4

3. **Fetch deeper category lists for longer itineraries.** For 3+ days, also `GET` the explicit `/breakfast-spots/`, `/lunch-brunch/`, `/dinner-destinations/`, `/sweet-treats/` pages — they return up to ~8 venues each with full at-a-glance metadata, today's hours, and the same one-line tips. For 5+ days, add `/hidden-gems/` and any signature dish sub-rankings (`/best/{dish}/{city}/`) the user is craving.

4. **Optional venue-detail enrichment.** If the user asks for hours, address, lat/lon, or must-try dishes per stop, `GET /venues/{venue-slug}/` for each shortlisted venue. The page exposes:
   - Spinach rating breakdown (food / service / atmosphere)
   - Vegan friendliness grade (A–E) — `A` = clearly labeled, knowledgeable staff, abundant options; `E` = one sad salad
   - Full weekly hours
   - Address + Google Maps directions URL with embedded `destination={lat},{lon}` — parse this to get coordinates for distance/cluster math
   - "Popular tips" (5 bullets of crowd wisdom)
   - "Must-try" dishes with popularity counts (e.g. `breaded oyster mushrooms — popular (×15)`)
   - "Praised for" attribute tags (cozy atmosphere ×19, friendly service ×14)
   - Tags: `Date Night`, `Dinner`, `Drinks`, `Small Groups`, `Special Occasion`, `Outdoor Seating`, etc.
   - External Google Maps rating (sanity-check)

5. **Apply user constraints.** Run the candidate venue pool through the constraint stack in this order (each is a filter or a re-rank, not a hard cut unless the user marks it strict):

   | Constraint type | Field on the venue card | Filter rule |
   |---|---|---|
   | Hard allergies (gluten, nut, soy) | "Must-try" dishes + cuisine description | Drop venues whose only highlighted dishes contradict the allergy (e.g. drop dedicated bakeries for gluten-free; drop tofu-heavy spots for soy allergy). When the venue page has no contradicting signal, keep but flag. |
   | Vegan-only strict | "Fully plant-based" badge or `/fully-vegan/` membership | Drop venues not in fully-vegan list. |
   | Price band | `$`, `$$`, `$$$`, `$$$$` | Drop venues outside the band. |
   | Cuisine cravings | Cuisine string + dish rank badges | Re-rank: boost venues with a `#1 FOR {craving}` badge to top of their slot. |
   | Neighborhood / day-anchor | `distance from centre` (km) on cards; lat/lon on venue page | When the user supplies an anchor (e.g. "we're in Mission Bay on day 2"), prefer venues with distance bands compatible with the anchor or geocode each candidate via the venue-page Maps URL and pick by haversine ≤ 2km from anchor. |
   | Family / date-night / group | Venue-page tag chips (`Date Night`, `Special Occasion`, etc.) | Match the night's intent to the tag. |
   | A–E grade floor | VFI grade letter on card | Drop below user's floor (default keep A–C, drop D/E unless they have a #1 dish rank). |

6. **Slot venues into the itinerary skeleton.** Per day, fill four slots in this priority order, drawing from the filtered pool without repeating venues. Stop earlier if user requested fewer meals/day.

   ```
   Day N:
     Breakfast        ← /breakfast-spots/ pool, weighted by today's hours
     Lunch            ← /lunch-brunch/ ∪ /essentials/ (lunch-open) ∪ signature-dish #1s
     Coffee / Sweet   ← /sweet-treats/ (only if user opts in)
     Dinner           ← /dinner-destinations/ ∪ /worth-the-occasion/ (for "special" night) ∪ /essentials/ (dinner-open)
   ```

   **Diversification rule**: don't put two venues with the same dish-rank category on the same day (e.g. two ramen spots), and try to vary cuisine across the trip. Days 1–2 should weight toward Top 15 Essentials; days 3+ rotate in hidden gems, dish-#1s, and worth-the-occasion picks. End on a `Worth the Occasion` dinner if the trip is 3+ days.

7. **Emit the itinerary as structured JSON** (see Expected Output) with rationale strings citing the source page slug for each pick, so the user/agent can verify the recommendation against spinach.guide.

### Browser fallback

When direct fetch fails (e.g. Cloudflare temporary block, transient 5xx) — none observed in testing, but the path is:

```bash
sid=$(browse cloud sessions create --keep-alive | node -pe "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
browse open "https://spinach.guide/cities/{slug}/" --remote --session "$sid"
browse get markdown body --remote --session "$sid"   # cleaner than HTML for synthesis
```

No `--proxies` or `--verified` needed; the site does not interrogate sessions.

## Site-Specific Gotchas

- **No JSON API**: `/api/cities/...` and any obvious REST shape return a custom 404 page. The Astro build emits the full dataset into rendered HTML/markdown — that *is* the API. Do not waste turns probing for `/api/*`, `/graphql`, or Supabase endpoints (the embedded Supabase client is only used client-side for photo-failure telemetry; it does not serve venue data).
- **The site is Cloudflare-fronted but does not challenge bots**: `bb fetch` (no proxies, no `--verified`) returns 200s consistently. `robots.txt` allows `User-agent: *` except `Bytespider`, `CCBot`, `meta-externalagent`. Keep request rate ≤ 1–2 req/s out of courtesy; no rate-limit observed below that.
- **Category slug coverage is non-uniform across cities**: Larger cities (SF, NYC, London, Berlin, LA) have all 11 sub-category pages; smaller cities (Wellington, York, Zurich) typically expose only 6–8 (commonly miss `work-friendly`, `hidden-gems`, and sometimes `worth-the-occasion`). Always read the "On this page" nav on `/cities/{slug}/` before fetching sub-paths, or grep the sitemap. Hitting a missing category returns a custom 404 HTML page (not a JSON error).
- **Slug variants for multi-word cities**: `new-york-city` (not `new-york`), `los-angeles`, `san-francisco`, `ho-chi-minh-city`, `tel-aviv`. When in doubt, fetch `/sitemap-0.xml` (one file, ~250KB) and substring-match.
- **Distance is from the city centre, not from the user**: Every card shows `X km from centre` — this is centroid-relative, not user-relative. For neighborhood-anchored itineraries, you must geocode the user's anchor and the venue's lat/lon (from the venue page's `https://www.google.com/maps/dir/?api=1&destination={lat},{lon}` URL) and compute haversine yourself.
- **Vegan Friendliness Index (VFI) grade ≠ Spinach rating**: A venue can be `★ 5.0` (outstanding food) and `D` graded (limited vegan options) — the 5-star rating reflects the food's actual quality, the A–E grade reflects vegan-friendliness (options count, protein sources, menu clarity, staff knowledge). For a vegan-only audience, treat the grade as the primary filter and the star rating as the tie-breaker.
- **"Fully plant-based" badge is the strict-vegan signal**: When a venue card shows this badge or appears in `/cities/{slug}/fully-vegan/`, the kitchen has no animal products. Omni-standout venues require asking and may carry cross-contamination risk; flag these when the user has a strict-vegan stance.
- **Dish-rank badges (`#1 FOR RAMEN IN SAN FRANCISCO`) only appear on cards in cities where that dish has ≥ a handful of contenders.** If a user craves a dish not surfaced in the city's signature sections, check `/best/{dish}/{city}/` directly — the per-dish page exists even when it didn't make the city's signature shortlist.
- **Today's hours on category-list pages reflect the page's CDN cache time, not real-time.** They're refreshed daily ("last refreshed today" banner); for time-of-day-sensitive plans (Sunday brunch, late-night dinner), open the venue page for the full weekly schedule rather than trusting the list card.
- **Venue slugs are stable but contain numeric suffixes** (e.g. `aiso-124450`, `the-butterfly-joint-2421`). Don't try to construct them — always lift them from anchor `href`s on the city/category page.
- **Photos lazy-fail through a failover chain**: The page embeds `data-fallbacks="..."` per `<img>` and reports broken photos back to Supabase. This is a UI concern only — has no impact on data extraction.
- **`/best/{dish}/` (city-omitted) is a cross-city dish ranking**, not a global venue list — useful only when the user wants to compare cities for a specific dish, not for itinerary building within one city.
- **159 cities ≠ 158 cities**: The homepage advertises 158 cities; the actual sitemap count drifts daily as cities are added. The "All N cities" link in the homepage is the live count. Don't hardcode.

## Expected Output

Emit one JSON object with the shape below. The `rationale` strings cite the spinach.guide page each pick was sourced from so the user/agent can audit.

```json
{
  "city": "san-francisco",
  "city_display": "San Francisco",
  "days": 3,
  "user_constraints": {
    "strict_vegan": true,
    "allergies": ["gluten"],
    "cravings": ["ramen", "ice_cream"],
    "price_band_max": "$$$",
    "vfi_floor": "B",
    "day_anchors": [
      { "day": 1, "neighborhood": "Mission", "lat": 37.7599, "lon": -122.4148 },
      { "day": 2, "neighborhood": "Marina", "lat": 37.8030, "lon": -122.4378 },
      { "day": 3, "neighborhood": "Downtown", "lat": 37.7879, "lon": -122.4075 }
    ],
    "meals_per_day": ["breakfast", "lunch", "dinner"],
    "end_on_special_occasion": true
  },
  "itinerary": [
    {
      "day": 1,
      "anchor": "Mission",
      "meals": [
        {
          "slot": "breakfast",
          "venue": "judahlicious",
          "venue_url": "https://spinach.guide/venues/judahlicious-2080/",
          "name": "Judahlicious",
          "cuisine": "Vegan Cafe, Burritos & Bowls",
          "rating": 5.0,
          "vfi_grade": "A",
          "price": "$$",
          "fully_vegan": true,
          "distance_from_centre_km": null,
          "today_hours": "8 AM-3 PM",
          "must_try": ["Nekked Burrito"],
          "rationale": "From /cities/san-francisco/breakfast-spots/: fully-plant-based cafe, rating 5.0 A, matches strict_vegan + gluten-friendly burrito-bowl menu."
        },
        {
          "slot": "lunch",
          "venue": "menya-kanemaru-golden-ramen",
          "venue_url": "https://spinach.guide/venues/menya-kanemaru-golden-ramen-2363/",
          "name": "Menya Kanemaru Golden Ramen",
          "cuisine": "Japanese Ramen, Vegan Curry",
          "rating": 5.0,
          "vfi_grade": "A",
          "price": "$$",
          "dish_rank": { "dish": "ramen", "rank": 3, "scope": "san-francisco" },
          "rationale": "From /cities/san-francisco/essentials/ + /best/ramen/san-francisco/: matches user craving 'ramen', #3 in city, A-grade, within Mission anchor radius."
        },
        {
          "slot": "dinner",
          "venue": "aiso",
          "venue_url": "https://spinach.guide/venues/aiso-124450/",
          "name": "Aíso",
          "cuisine": "Vegan Tapas, Oyster Skewers",
          "rating": 5.0,
          "vfi_grade": "A",
          "price": "$$$",
          "fully_vegan": true,
          "tags": ["Date Night", "Dinner", "Drinks", "Small Groups", "Special Occasion"],
          "rationale": "From /cities/san-francisco/dinner-destinations/ + /cities/san-francisco/fully-vegan/: #5 in essentials, #1 for breaded oyster mushrooms, address 4068 18th St (Mission-adjacent)."
        }
      ]
    },
    {
      "day": 2,
      "anchor": "Marina",
      "meals": [
        {
          "slot": "breakfast",
          "venue": "the-butterfly-joint",
          "venue_url": "https://spinach.guide/venues/the-butterfly-joint-2421/",
          "name": "The Butterfly Joint",
          "cuisine": "Coffee Shop, Vegan Donuts",
          "rating": 5.0,
          "vfi_grade": "A",
          "price": "$$",
          "dish_rank": { "dish": "donut", "rank": 2, "scope": "san-francisco" },
          "rationale": "From /cities/san-francisco/breakfast-spots/: #1 in essentials, but 7.3km from centre — flag distance from Marina anchor (~7km) as a stretch; consider Whack Donuts as a closer swap."
        },
        {
          "slot": "lunch",
          "venue": "torraku-ramen-lombard",
          "venue_url": "https://spinach.guide/venues/torraku-ramen-lombard-2525/",
          "name": "Torraku Ramen - Lombard",
          "cuisine": "Japanese Ramen, Vegan Miso",
          "rating": 5.0,
          "vfi_grade": "B",
          "price": "$$",
          "dish_rank": { "dish": "ramen", "rank": 1, "scope": "san-francisco" },
          "rationale": "From /cities/san-francisco/essentials/: #1 ramen in city, Lombard is in Marina/Russian Hill — best anchor fit on day 2."
        },
        {
          "slot": "dinner",
          "venue": "destapas",
          "venue_url": "https://spinach.guide/venues/destapas-2320/",
          "name": "Destapas",
          "cuisine": "Spanish Restaurant, Vegan Paella",
          "rating": 5.0,
          "vfi_grade": "A",
          "price": "$$",
          "rationale": "From /cities/san-francisco/dinner-destinations/: vegan paella standout, varies cuisine from day 1 (Japanese)."
        }
      ]
    },
    {
      "day": 3,
      "anchor": "Downtown",
      "meals": [
        {
          "slot": "breakfast",
          "venue": "salt-straw",
          "venue_url": "https://spinach.guide/venues/salt-straw-2162/",
          "name": "Salt & Straw",
          "cuisine": "Ice Cream, Vegan Flavors",
          "rating": 5.0,
          "vfi_grade": "B",
          "price": "$$$",
          "dish_rank": { "dish": "ice_cream", "rank": 1, "scope": "san-francisco" },
          "rationale": "From /cities/san-francisco/essentials/ + user craving 'ice_cream': #1 ice cream in city, 0.5km from centre = walkable from Downtown anchor. Slotted as 'sweet/coffee' rather than savory breakfast."
        },
        {
          "slot": "lunch",
          "venue": "imperial-garden",
          "venue_url": "https://spinach.guide/venues/imperial-garden-2420/",
          "name": "Imperial Garden",
          "cuisine": "Chinese Dim Sum, Vegan Menu",
          "rating": 5.0,
          "vfi_grade": "B",
          "price": "$$",
          "dish_rank": { "dish": "dumplings", "rank": 2, "scope": "san-francisco" },
          "rationale": "From /cities/san-francisco/essentials/: #2 dumplings, third distinct cuisine in the trip (Chinese)."
        },
        {
          "slot": "dinner",
          "venue": "pena-pachamama",
          "venue_url": "https://spinach.guide/venues/pena-pachamama-2084/",
          "name": "Peña Pachamama",
          "cuisine": "Vegan Latin Restaurant, Raw & Cooked",
          "rating": 5.0,
          "vfi_grade": "A",
          "price": "$$$",
          "fully_vegan": true,
          "tags": ["Special Occasion"],
          "rationale": "From /cities/san-francisco/worth-the-occasion/ + /cities/san-francisco/dinner-destinations/: live Latin music on weekend nights, fully plant-based, end-on-special-occasion satisfied."
        }
      ]
    }
  ],
  "sources_consulted": [
    "https://spinach.guide/cities/san-francisco/",
    "https://spinach.guide/cities/san-francisco/essentials/",
    "https://spinach.guide/cities/san-francisco/breakfast-spots/",
    "https://spinach.guide/cities/san-francisco/lunch-brunch/",
    "https://spinach.guide/cities/san-francisco/dinner-destinations/",
    "https://spinach.guide/cities/san-francisco/worth-the-occasion/",
    "https://spinach.guide/cities/san-francisco/fully-vegan/",
    "https://spinach.guide/best/ramen/san-francisco/"
  ],
  "warnings": [
    "Day 2 breakfast (The Butterfly Joint) is ~7km from the Marina anchor — consider Whack Donuts (3.4km from centre) as a closer swap.",
    "VFI floor 'B' kept Torraku Ramen (B) in; if user tightens to 'A' floor, replace with Menya Kanemaru Golden Ramen (already on day 1)."
  ],
  "data_freshness": "spinach.guide cards are refreshed daily; this itinerary built from pages fetched on 2026-05-19."
}
```

### Outcome shapes

| Shape | When | Required fields |
|---|---|---|
| `itinerary` | City exists and at least 1 day of viable venues survive constraints | `city`, `days`, `itinerary[]`, `sources_consulted[]` |
| `city_not_found` | Slugified city has no `/cities/{slug}/` (404 from sitemap probe) | `{ "error": "city_not_found", "input_city": "...", "suggested": ["..."] }` (suggest top 5 sitemap matches by string similarity) |
| `partial_itinerary` | Constraints (e.g. strict-vegan + nut-allergy + $) leave fewer viable venues than `days × meals_per_day` | Same as `itinerary` plus `unfilled_slots[]` and `relaxation_suggestions[]` (e.g. "lift VFI floor from A to B to gain 4 venues") |
| `category_missing` | User requested a meal slot mapping to a non-existent category page for that city (e.g. `work-friendly` in Wellington) | Same as `itinerary` plus `category_fallbacks` noting which slot used the city overview as a substitute pool |
