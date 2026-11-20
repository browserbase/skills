---
name: wander-com-search-and-extract-listings-d6fgrc
title: Wander Search & Extract Listings
description: >-
  Discover Wander vacation-rental listings (via sitemap/locations) and extract a
  property's complete metadata plus the full image/video gallery from its detail
  page using server-rendered JSON-LD and the RSC medias arrays — read-only, no
  auth, no anti-bot.
website: wander.com
category: vacation-rentals
tags:
  - vacation-rentals
  - listings
  - travel
  - scraping
  - read-only
  - json-ld
source: 'browserbase: agent-runtime 2026-06-08'
updated: '2026-06-08'
recommended_method: fetch
alternative_methods:
  - method: fetch
    rationale: >-
      Plain HTTP GET of /property/{slug} (JSON-LD + RSC medias gallery) and
      /property/{slug}.md (pricing, 90-day availability, local recs), with
      /sitemap.xml or /locations for discovery. No JS, no auth, no anti-bot;
      Wander invites agents and publishes /llms.txt + per-property markdown.
      Honor the 1 req/s rate limit.
  - method: browser
    rationale: >-
      Fallback only. A bare (non-stealth, no-proxy) session works; open the
      detail page, read JSON-LD from <head>, and open the photo gallery modal to
      harvest image refs. Slower and the modal's photo counter double-counts
      across room-section tabs, so the HTML/RSC parse is strictly preferred.
verified: false
proxies: false
---
# Wander Search & Extract Listings

## Purpose

Discover vacation-rental listings across wander.com and extract the **complete metadata and full image gallery** from any listing's detail page. Returns structured property data — name, slug, geo-coordinates, address, bedroom/bathroom/occupancy counts, bed configuration, amenities, check-in/out times, nightly-rate range, 90-day daily pricing & availability, local recommendations — plus the entire media gallery (every room photo, hero shot, floor plan, and video, with all resolution variants). Read-only; never books, never submits payment. Wander explicitly welcomes AI agents (`robots.txt` sets `Content-Signal: ai-train=yes, search=yes, ai-input=yes` and ships an `/llms.txt` plus per-property markdown mirrors), so the optimal path is plain HTTP fetch — no browser, no JavaScript execution, no authentication, and no anti-bot stealth required.

## When to Use

- Building a catalog/index of every Wander property (3,397 property URLs are enumerable from the sitemap).
- Extracting one listing's full detail record — all metadata + the complete photo/video gallery — for ingestion, comparison, or display.
- Monitoring pricing and 90-day availability for specific properties.
- Filtering/browsing listings by category (Beachfront, Mountain, Urban, Desert, Wine, Ski).
- Anywhere you'd otherwise script a browser against Wander — the HTTP/markdown surfaces are faster, cheaper, and structurally stable.

## Workflow

Wander's web UI is a Next.js (App Router) app, but it server-renders a complete schema.org `VacationRental` JSON-LD block and embeds the full property data (including the entire media gallery) inside the RSC flight payload of the detail-page HTML. It also publishes an LLM-friendly markdown mirror for every property. **The recommended method is HTTP fetch** of these surfaces — no browser is needed for either search or full extraction. Honor the published rate limit of **1 request/second** (`/llms.txt`).

### Step 1 — Discover listings (pick a search surface)

- **Full enumeration (best for "all listings"):** fetch `https://www.wander.com/sitemap.xml` (~6,011 `<loc>` entries; filter for `/property/` → ~3,397 listing URLs). The slug is the last path segment, e.g. `wander-june-lake`.
- **Browse + category filter:** fetch `https://www.wander.com/locations` — server-rendered with ~3,281 `/property/{slug}` links and the six categories (Beachfront, Mountain, Urban, Desert, Wine, Ski). Also lists destinations/travel guides.
- **Query search (destination / dates / guests):** the search form on `/` and `/locations` ("Where? / When? / Who?") drives the same `/locations` result set client-side; for programmatic use, enumerate from the sitemap and filter on the extracted metadata (geo, category, bedrooms, availability) rather than driving the form.

Dedupe slugs; each maps to `https://www.wander.com/property/{slug}`.

### Step 2 — Fetch the detail page HTML

```
GET https://www.wander.com/property/{slug}
```
A live property returns `200` with a ~700 KB HTML document. (Some legacy/renamed slugs return `308` — follow the redirect or skip; see gotchas.)

### Step 3 — Extract structured metadata from the JSON-LD block

Parse the single `<script type="application/ld+json">…</script>` block (`@type: VacationRental`). It is the authoritative metadata source and is present on every live property page:

- `identifier` → slug, `name`, `url`, `description`
- `latitude`, `longitude`, `address` (`streetAddress`, `addressLocality`, `addressRegion`, `postalCode`, `addressCountry`)
- `checkinTime`, `checkoutTime`
- `containsPlace.numberOfBedrooms`, `.numberOfBathroomsTotal`, `.occupancy.value` (sleeps), `.floorSize.value` (sq ft), `.numberOfRooms`
- `containsPlace.bed[]` → `[{typeOfBed, numberOfBeds}]`
- `containsPlace.amenityFeature[]` → list of `{name, value}` (e.g. `wifi:true`, `hotTub:true`, `petsAllowed:false`, `parkingType:"Free"`, `poolType:"Outdoor"`)
- `image[]` → **10 representative images only** (a subset of the full gallery — do NOT treat this as the complete gallery)

### Step 4 — Extract the FULL media gallery from the RSC payload

The complete gallery is embedded in the detail HTML's RSC flight data, split into one `"medias":[ … ]` array **per room/section** (Showcase, Exterior, Kitchen, each Bedroom, etc.). To get every image/video:

1. Unescape the flight data: replace the literal two-character sequence `\"` with `"` across the HTML.
2. Find every occurrence of `"medias":[`, bracket-match each array to its closing `]`, and `JSON.parse` each.
3. **Union all arrays and dedupe by `assetId`** — this is the complete gallery. (Nearby/"similar" property cards on the page do NOT contribute `medias` arrays, so the union is scoped to the current listing. Validate by confirming the JSON-LD `image[]` asset IDs are a subset of your union — they always are.)

Each media object contains:
- `assetId`, `id`, `type` (`ROOM`, `HERO`, `FLOOR_PLAN`, `HERO_ANIMATED_VIDEO`, `HOME_TOUR_VIDEO`, `HOME_SNEAK_PEEK_VIDEO`), `order`, `width`, `height`
- Resolution URLs (webp + png): `fullResUrl` (`/{assetId}/fullres.webp`), `highResUrl` (`2440`), `mediumResUrl` (`1200`), `lowResUrl` (`640`), `lowestResUrl` (`320`)

Sort by `order`; pick `fullResUrl` (or `highResUrl`) for the canonical image URL. Filter `type` to `ROOM`/`HERO`/`FLOOR_PLAN` for still photos, or keep the video types separately. Typical galleries hold ~60–150 unique media.

### Step 5 — Enrich with the markdown mirror (pricing, availability, local recs)

```
GET https://www.wander.com/property/{slug}.md
```
A compact (~14 KB) markdown document adding fields not in the JSON-LD:
- **Nightly rate range** (USD, before taxes/fees), **Next Available** date, **Available Days** count
- **Daily Pricing (next 90 days)** — one line per date: `Jun 8, 2026: $822 (Available)` / `(Not Available)`
- **Local recommendations** — Dining, Activities & Attractions, Local Services (curated blurbs)
- **Additional Information** notices (shipping, occupancy, hot-tub, pets, smoking) and Guest Services
- **Property ID** (the internal CMS id, e.g. `cm7j97um9067tl0x1ychp5t5u`) and **Hero Image** URL

### Step 6 — Merge and emit

Combine the JSON-LD metadata, the deduped media gallery, and the markdown pricing/availability/recs into one record (see Expected Output).

### Browser fallback (only if HTTP is blocked — not observed)

If the fetch surfaces ever break, drive a browser (a bare, non-stealth session is sufficient — no `--verified`/`--proxies` needed):
1. `browse open https://www.wander.com/property/{slug} --remote`, `browse wait load`, `browse wait timeout 2500`.
2. `browse get text head` to read the JSON-LD, then click the photo grid to open the gallery modal and `browse snapshot` to harvest image refs from the `urlMap`. Note the modal repeats images across section tabs (the "X photos" counter, e.g. "115", double-counts; unique is ~59–64) — dedupe by asset ID. The HTML/RSC parse in Steps 3–4 is strictly better and avoids this.

## Site-Specific Gotchas

- **No anti-bot, no auth, no proxy needed.** Pre-run probe and direct testing both confirmed: bare `GET` (no residential proxy, no stealth) returns `200` with the full SSR payload for both `/property/{slug}` and `.md`. The successful runs used **neither** `--verified` nor `--proxies`. Wander actively invites agents (`Content-Signal: ai-train=yes, search=yes, ai-input=yes`).
- **Respect the published rate limit: 1 request/second** (`/llms.txt`). Contact is `ai@wander.com`.
- **`wander.com` → `www.wander.com` (308).** Always use the `www.` host to avoid an extra redirect hop.
- **JSON-LD `image[]` is only 10 representative images — NOT the full gallery.** The complete gallery (often 60–150 media) lives only in the `"medias"` arrays of the RSC payload. Using `image[]` alone silently undercounts photos ~6–15×.
- **The gallery is split across many `medias` arrays (one per room/section), not a single array.** Taking only the first/largest array undercounts (e.g. Wander June Lake's first array has 8, but the union of all 16 section arrays is 64). Always union + dedupe by `assetId`.
- **RSC flight data is backslash-escaped.** Inside `self.__next_f.push(...)`, quotes appear as the literal `\"`. Unescape (`\"` → `"`) before regex/JSON parsing the `medias` objects.
- **The naïve "image has a 2440.webp variant" heuristic is unreliable** for gallery membership: only the few hero images are preloaded at 2440 (Wander June Lake had 59 with a 2440 variant, but Wander Tulum had only 4). Use the `medias` arrays, not resolution-tier guessing.
- **The browser gallery's photo counter double-counts.** The modal shows a "Showcase" tab plus per-room tabs that repeat the same images; the displayed total (e.g. "115") is larger than the ~59–64 unique assets. Dedupe by asset ID.
- **Some property slugs `308`-redirect or are stale.** The example slugs in `/llms.txt` are illustrative and can drift — `wander-big-sur-cliffs` currently `308`-redirects. Trust the sitemap/`/locations` for live slugs; follow redirects or skip on non-200.
- **`property_id` (markdown) ≠ `assetId`/`identifier`.** The markdown "Property ID" is an internal CMS id (`cm…`); the JSON-LD `identifier` is the URL slug; `assetId` values are per-image. Keep them distinct.
- **`.md` daily pricing reflects rates even on unavailable dates.** Each day line carries a price plus an `(Available)`/`(Not Available)` flag — a price does not imply bookability; read the flag.
- **Image asset URLs are unauthenticated and hotlinkable** on `assets.wander.com` (`/{assetId}/{fullres|2440|1200|640|320}.{webp|png}`). No signing/expiry observed.
- **`sitemap.xml` and `.md`/HTML sometimes return empty over a flaky proxy hop;** a direct (non-proxied) fetch is reliable and faster here since there's no anti-bot to evade.

## Expected Output

A single merged record per listing. `media[]` is the full deduped gallery; `images[]` is the convenience list of still-photo URLs.

```json
{
  "success": true,
  "search": {
    "surface": "sitemap.xml",
    "total_property_urls": 3397,
    "categories": ["Beachfront", "Mountain", "Urban", "Desert", "Wine", "Ski"],
    "sample_slugs": ["wander-june-lake", "wander-tulum-jungle-allure", "wander-gulf-shores"]
  },
  "listing": {
    "slug": "wander-june-lake",
    "name": "Wander June Lake",
    "url": "https://www.wander.com/property/wander-june-lake",
    "property_id": "cm7j97um9067tl0x1ychp5t5u",
    "description": "Escape to Wander June Lake, where modern luxury meets nature's breathtaking beauty…",
    "latitude": 37.764228,
    "longitude": -119.103513,
    "address": {
      "streetAddress": "19 Willow Ave June Lake",
      "addressLocality": "June Lake",
      "addressRegion": "California",
      "postalCode": "93529",
      "addressCountry": "US"
    },
    "bedrooms": 3,
    "bathrooms": 2.5,
    "sleeps": 6,
    "square_feet": 1519,
    "beds": [{ "type": "King", "count": 2 }, { "type": "Twin", "count": 4 }],
    "amenities": {
      "wifi": true, "hotTub": true, "fireplace": true, "ac": true, "balcony": true,
      "washerDryer": true, "outdoorGrill": true, "instantBookable": true,
      "selfCheckinCheckout": true, "smokingAllowed": false, "petsAllowed": false,
      "parkingType": "Free", "internetType": "Free"
    },
    "checkin_time": "16:00:00",
    "checkout_time": "10:00:00",
    "nightly_rate_range_usd": [822.15, 1583.4],
    "next_available": "2026-06-09",
    "available_days_next_90": 58,
    "daily_pricing": [
      { "date": "2026-06-08", "price_usd": 822, "available": true },
      { "date": "2026-06-14", "price_usd": 822, "available": false }
    ],
    "local_recommendations": {
      "dining": ["Silver Lake Resort Cafe", "Balanced Rock Grill & Cantina"],
      "activities": ["Oh Ridge Campground", "Rush Creek Trailhead"],
      "services": ["Silver Lake Resort"]
    },
    "media_count": 64,
    "media_types": { "ROOM": 56, "HERO": 3, "FLOOR_PLAN": 2, "HOME_TOUR_VIDEO": 1, "HERO_ANIMATED_VIDEO": 1, "HOME_SNEAK_PEEK_VIDEO": 1 },
    "media": [
      {
        "assetId": "576411499854040933",
        "type": "ROOM",
        "order": 0,
        "width": 3264,
        "height": 2448,
        "fullResUrl": "https://assets.wander.com/576411499854040933/fullres.webp",
        "highResUrl": "https://assets.wander.com/576411499854040933/2440.webp"
      }
    ],
    "images": [
      "https://assets.wander.com/576411499854040933/fullres.webp",
      "https://assets.wander.com/576411630200424914/fullres.webp"
    ],
    "image_count": 61
  },
  "error_reasoning": null
}
```

Failure shape (e.g. stale/redirected slug):

```json
{ "success": false, "slug": "wander-big-sur-cliffs", "http_status": 308, "error_reasoning": "Slug 308-redirected (renamed/removed); resolve a live slug from sitemap.xml or /locations." }
```
