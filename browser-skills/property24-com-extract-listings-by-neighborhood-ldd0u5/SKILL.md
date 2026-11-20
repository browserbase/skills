---
name: property24-com-extract-listings-by-neighborhood-ldd0u5
title: Property24 Extract Listings by Neighborhood
description: >-
  Extract every for-sale or to-rent property listing in a South African suburb
  on property24.com — listing ID, price, bedrooms/bathrooms/parking, floor size,
  location, image, agent, and (optionally per-listing) full address, lat/lon,
  erf size, rates, levies, and amenity flags.
website: property24.com
category: real-estate
tags:
  - real-estate
  - property
  - listings
  - south-africa
  - scraping
  - json-ld
source: 'browserbase: agent-runtime 2026-05-22'
updated: '2026-05-22'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      Fallback only — used if HTTP fetch ever gets rate-limited or
      WAF-challenged. In current testing all listing-index and detail pages
      returned 200 OK from plain HTTPS GET (with or without residential
      proxies), so the browser path is strictly more expensive with no
      incremental data.
verified: false
proxies: false
---
# Property24 Extract Listings by Neighborhood

## Purpose

Given a Property24 neighborhood (suburb) URL or a `{slug, city, province, suburbId}` quadruple, return every property listing in that neighborhood with structured fields: listing ID, canonical URL, listing type (house / apartment / townhouse / etc.), price (ZAR), bedrooms, bathrooms, parking, floor size, location, listing image, listing date, agent / agency, and (when the per-listing detail page is fetched) full address, lat/lon, erf size, rates & taxes, levies, and amenity flags. Read-only — never submits search alerts, never contacts an agent, never books a viewing.

## When to Use

- Bulk extraction of every for-sale or to-rent listing in a suburb (e.g. "all houses for sale in Rivonia, Sandton").
- Periodic monitoring of new listings posted in a watched suburb.
- Downstream analytics: price-per-square-metre, median asking price by suburb, agent/agency market-share, days-on-market.
- Building a dataset of South African residential property by region — Property24 indexes ~20,750 suburbs nationwide.

## Workflow

Property24 is **server-rendered HTML with no anti-bot wall on listing pages**. The fastest, cheapest, most reliable extraction path is `browse cloud fetch` (or any plain HTTPS GET) against the canonical suburb URL — no JS execution, no headed browser, no captcha. Both `--proxies` and bare requests returned 200 OK in testing; residential proxies are not required. **Use the fetch path; the browser is a fallback only.**

### 1. Resolve the suburb URL

Property24 URLs follow a stable pattern:

```
https://www.property24.com/{searchType}/{suburb-slug}/{city-slug}/{province-slug}/{suburbId}
                                                                                      └── numeric, canonical
```

Where:
- `searchType` ∈ `for-sale` | `to-rent`
- `{suburb-slug}/{city-slug}/{province-slug}` is human-readable (`rivonia/sandton/gauteng`, `sea-point/cape-town/western-cape`)
- `{suburbId}` is a numeric ID — **this is the canonical key**. The site 301-redirects any URL with the wrong slug to the correct one as long as the numeric ID is right. Example: `/for-sale/anything/anywhere/anywhere/4251` → 301 → `/for-sale/rivonia/sandton/gauteng/4251`.

To discover the ID + slug for an arbitrary suburb name, GET `https://www.property24.com/sitemap/Suburbs?SearchType=ForSale` — a single XML file (~3.5 MB) listing all ~20,750 suburb URLs. Grep for the suburb name. Cache locally; the sitemap updates daily but suburb IDs are stable across years.

For a province-wide or city-wide search, use the lower-level URL: `/for-sale/{province-slug}/1` (province), `/for-sale/{city-slug}/{province-slug}/{cityId}` (city). The same parsing logic applies.

### 2. Fetch the listing-index page

```bash
browse cloud fetch "https://www.property24.com/for-sale/rivonia/sandton/gauteng/4251" --proxies
# Or without proxies — both return 200:
browse cloud fetch "https://www.property24.com/for-sale/rivonia/sandton/gauteng/4251"
```

Page size is ~220–260 KB of HTML. Each page contains up to ~22 listing tiles (mix of `p24_regularTile` and `p24_proTile` / boosted variants).

### 3. Parse listing tiles from the index page

Tiles are anchored on `<div class="...p24_tileContainer..." data-listing-number="{id}">`. Within each tile:

| Field | Extractor (regex on the tile chunk) |
|---|---|
| `listing_id` | `data-listing-number="(\d+)"` |
| `url` | `<a href="(/(?:for-sale\|to-rent)/[^"]+)"` — prepend `https://www.property24.com`, strip the `?plId=…&plt=…&plsIds=…` tracking params |
| `title` | `<meta itemprop="name" content="([^"]+)"` (e.g. `"5 Bedroom House"`, `"Commercial Property"`) |
| `price` | `<div class="p24_price">\s*([^<]+)` — string `"R 1 421 900"`. Strip non-digits to get ZAR integer. Free-text variants: `"POA"` (price on application), `"Price on Request"` |
| `description` | `<div class="p24_description">([\s\S]*?)</div>` — strip inner tags; e.g. `"2 Bedroom Apartment in Rivonia"` |
| `location_label` | `<span class="p24_location">([^<]+)</span>` (the suburb tag inside the description) |
| `bedrooms` | `title="Bedrooms"[\s\S]*?<span>(\d+)</span>` |
| `bathrooms` | `title="Bathrooms"[\s\S]*?<span>(\d+)</span>` |
| `parking` | `title="Parking Spaces"[\s\S]*?<span>(\d+)</span>` |
| `floor_size` | `title="Floor Size"[\s\S]*?<span>([^<]+)</span>` — `"69 m²"` (HTML-encoded as `&#xB2;`) |
| `image` | `<img[^>]+src="(https://images\.prop24\.com/[^"]+)"` — append `/Crop600x400` size suffix variants |

To split a page into per-tile chunks: locate all match positions of the regex `<div class="[^"]*p24_tileContainer[^"]*"[^>]*data-listing-number="\d+"` and slice between consecutive matches. Tiles without listing prices use boosted/sponsored layouts — extract title + ID and skip price.

### 4. Paginate

The page footer contains the pagination block:

```html
<a href="https://www.property24.com/for-sale/rivonia/sandton/gauteng/4251/p2" data-pagenumber="2">2</a>
```

The maximum page number is the largest integer in `data-pagenumber="(\d+)"`. Construct subsequent URLs by appending `/p2`, `/p3`, etc. to the suburb base URL — **do not** add a query string. Page 1 has no `/p1` suffix (use the bare suburb URL).

```bash
# Rivonia has 12 pages × ~22 listings ≈ ~260 total
for p in $(seq 1 12); do
  url="https://www.property24.com/for-sale/rivonia/sandton/gauteng/4251"
  [ "$p" -gt 1 ] && url="$url/p$p"
  browse cloud fetch "$url"
  sleep 1   # be gentle — 1 req/sec is safe
done
```

Property24 does not publish an explicit total-results count in the HTML; derive `~total = (max_page × per_page)` where `per_page` ≈ 22 for the first 11 pages and the last page may be partial.

### 5. (Optional) Fetch per-listing detail pages for richer data

Each listing URL (`/{searchType}/{...}/{listing-id}`) returns a detail page with a single `<script type="application/ld+json">` block containing schema.org `RealEstateListing` JSON. The script tag has its `+` HTML-encoded — match `application/ld&#x2B;json`, not `application/ld+json`:

```javascript
const re = /<script type="application\/ld&#x2B;json">([\s\S]*?)<\/script>/g;
```

The JSON-LD provides:
- `datePosted` (ISO date)
- `about.@type` — `Apartment` / `House` / `Townhouse` / etc.
- `about.numberOfBedrooms`, `about.numberOfBathroomsTotal`
- `about.floorSize.value` + `unitCode` (`MTK` = m²)
- `about.address` — `streetAddress`, `addressLocality`, `addressRegion`, `addressCountry`
- `about.latitude`, `about.longitude`
- `about.petsAllowed`
- `offers.priceSpecification.price` + `priceCurrency` (ZAR)
- `offers.offeredBy.name` + `worksFor.name` + `worksFor.url` (agent + agency)
- `description`, `image`, `name`, `url`
- `breadcrumb.itemListElement` — full Province → City → Suburb → Listing path with each level's canonical URL

The detail page also has a Property Overview section accessible via regex:
```javascript
/<div class="col-6 p24_propertyOverviewKey">([^<]+)<\/div>\s*<div class="col-6 p24_propertyOverviewResult">\s*<div class="p24_info">([^<]+)<\/div>/g
```
Yielding key/value pairs: `Listing Number`, `Type of Property`, `Listing Date`, `Erf Size`, `Floor Size`, `Price per m²`, `Levies`, `No Transfer Duty`, `Rates and Taxes`, `Pets Allowed`, `Bedrooms`, `Bathrooms`, `Kitchens`, `Reception Rooms`, `Parking`, `Pool`, `Security`, `Special Feature`, `Internet Access`, etc. Order and presence vary by listing.

Detail-page fetches are optional — they roughly double extraction cost (1 fetch per listing instead of 1 per index page) but give substantially more depth. Decide based on the caller's needs.

### Browser fallback (only if HTTP fetch ever gets blocked)

If `browse cloud fetch` starts returning 403 / WAF challenges (not observed in current testing, but document the path):

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$SID"
browse open "https://www.property24.com/for-sale/rivonia/sandton/gauteng/4251" --remote
browse wait load --remote
browse wait timeout 2000 --remote
HTML=$(browse get html body --remote)
# Apply the same regexes from step 3 to $HTML.
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

`browse snapshot` is not useful for listing extraction here — the listing grid is rendered into nested `<div>` containers without semantic roles, so the accessibility tree is sparse. Use `browse get html body` and regex/HTML parse it.

## Site-Specific Gotchas

- **No anti-bot on listing pages.** Tested with and without `--proxies`; both returned HTTP 200. `--verified` (stealth) is not required. The robots.txt explicitly allows `/for-sale/`, `/to-rent/`, and all suburb / city / province listing pages. **Don't waste credits on `--verified --proxies` unless a 4xx forces you to.**
- **Numeric `suburbId` is canonical; slug is decorative.** Any URL with the right numeric ID at the end and a wrong slug (`/for-sale/anything/anywhere/anywhere/4251`) 301-redirects to the canonical slug. This is robust if you have ID-only references (e.g. from a DB) and don't want to maintain a slug mapping.
- **Pagination uses `/pN` *path suffix*, not query string.** `?page=2` is silently ignored — the page returns page-1 results. Always construct `/{suburb-url}/p2`, `/p3`, etc. Page 1 has no suffix.
- **No total-results count is exposed.** The listing HTML never says `"264 properties for sale"`. Derive it from `max(data-pagenumber)` × per-page (~22). If the caller requires an exact count, fetch the last page and count its tiles, then `(max_page - 1) × 22 + last_page_tile_count`.
- **`<meta itemprop="name">` is not unique per tile.** Some tiles contain a second `<meta itemprop="name">` for the listing agency inside an `Organization` itemscope. Anchor extraction on the FIRST `<meta itemprop="name">` after the tile start, not the last.
- **Two listing-tile layouts coexist on the same page**: `p24_regularTile` (image-on-left, info-on-right) and boosted variants (`p24_proTile`, `p24_boostedTile`). All carry `data-listing-number`, but boosted tiles sometimes omit the `<div class="p24_price">` block (the price is rendered inside a different sub-tree). Tolerate missing price; never reject a tile because price is absent.
- **Price values are space-separated, not comma-separated**: `"R 1 421 900"`, not `"R 1,421,900"`. Strip all non-digits to get the ZAR integer. Special non-numeric values: `"POA"` (Price On Application), `"On Request"`. Treat as `null` numeric + preserve string.
- **Floor size unit is `"m²"` rendered as HTML entity `&#xB2;`.** Decode entity → `²` before storing. JSON-LD reports the same value as `unitCode: "MTK"` (UN/ECE Recommendation 20 — square metre).
- **`{plId, plt, plsIds}` tracking query params on tile URLs.** Always strip — the canonical detail URL is everything before `?`. Two URLs differing only in tracking params are the same listing.
- **JSON-LD `<script>` tag uses `application/ld&#x2B;json` (HTML-encoded `+`).** A naïve regex looking for `application/ld+json` (literal `+`) finds zero blocks. Match `ld&#x2B;json` or use an HTML parser that unescapes attribute values.
- **`/Autocomplete`, `/api/autocomplete`, `/results/GroupedListings`, and `/mapSearch/*` endpoints are 404 or disallowed by robots.txt.** Don't waste time on internal JSON APIs — the public site delivers full data via plain HTML. The sitemap is the supported discovery mechanism.
- **`www.craigslist`-style geo-redirect on bare domain.** `https://www.property24.com/` returns the global homepage (no IP geolocation rewrite). Direct URLs to province / city / suburb pages always honour the slug+ID.
- **Sitemap is the authoritative suburb-name → URL index.** `/sitemap/Suburbs?SearchType=ForSale` lists every suburb URL for sale; the `ToRent` variant lists rentals. Many suburbs appear in both. For finer enumeration there are also per-category variants (`?PropertyCategory=House&SearchType=ForSale` etc.) which let you scope the master list to a single property type — useful when you only care about, say, houses vs. apartments.
- **Rate limit posture is informal.** Property24 does not return `Retry-After` or 429 in fetched traffic; sustained > 5 req/s eventually trips an HTTP 503. Stay ≤ 1 req/s and you're safe across multi-thousand listing crawls.
- **Sandton ≠ Sandton city.** "Sandton" the *city* has its own URL (`/for-sale/sandton/gauteng/109`), distinct from suburbs *within* Sandton like `Rivonia` (`/for-sale/rivonia/sandton/gauteng/4251`). The numeric IDs are independent — `109` is the city, `4251` is the suburb. When the caller says "Sandton", clarify which level they mean (or default to the city-level URL and offer to drill into individual suburbs from the breadcrumb).
- **`addressLocality` in JSON-LD = suburb name, not city.** South-African convention: a Rivonia listing has `addressLocality: "Rivonia"`, `addressRegion: "Gauteng"` — Sandton (the parent city) is captured only in the `breadcrumb.itemListElement` chain, not in the postal address.

## Expected Output

Two output shapes — pick based on whether the caller requested detail-page enrichment.

### Shape A — Index-only (fast path, 1 fetch per ~22 listings)

```json
{
  "suburb": {
    "id": 4251,
    "slug": "rivonia",
    "city": "sandton",
    "province": "gauteng",
    "url": "https://www.property24.com/for-sale/rivonia/sandton/gauteng/4251",
    "search_type": "for-sale"
  },
  "pagination": {
    "pages_fetched": 12,
    "max_page": 12,
    "approx_total_listings": 264
  },
  "listings": [
    {
      "listing_id": "116346248",
      "url": "https://www.property24.com/for-sale/rivonia/sandton/gauteng/4251/116346248",
      "title": "2 Bedroom Apartment",
      "price_text": "R 1 421 900",
      "price_zar": 1421900,
      "price_currency": "ZAR",
      "description": "2 Bedroom Apartment in Rivonia",
      "location_label": "Rivonia",
      "bedrooms": 2,
      "bathrooms": 1,
      "parking": 2,
      "floor_size_m2": 69,
      "image": "https://images.prop24.com/365575101"
    }
  ]
}
```

### Shape B — Index + detail enrichment (slow path, +1 fetch per listing)

```json
{
  "suburb": { "id": 4251, "slug": "rivonia", "city": "sandton", "province": "gauteng", "search_type": "for-sale" },
  "listings": [
    {
      "listing_id": "116346248",
      "url": "https://www.property24.com/for-sale/rivonia/sandton/gauteng/4251/116346248",
      "title": "2 Bedroom Apartment / flat for sale in Rivonia",
      "price_zar": 1421900,
      "price_currency": "ZAR",
      "type_of_property": "Apartment",
      "bedrooms": 2,
      "bathrooms": 1,
      "kitchens": 1,
      "reception_rooms": 1,
      "parking": 2,
      "floor_size_m2": 69,
      "erf_size_m2": 69,
      "price_per_m2_zar": 20607,
      "levies_zar": 2024,
      "rates_and_taxes_zar": 1054,
      "no_transfer_duty": true,
      "pets_allowed": true,
      "pool": true,
      "security": ["24 Hour Access", "Guard House", "Guard"],
      "internet_access": "Fibre",
      "listing_date": "2025-08-21",
      "address": {
        "street": "125 The Atrium, 9 De La Rey Road",
        "suburb": "Rivonia",
        "city": "Sandton",
        "province": "Gauteng",
        "country": "South Africa"
      },
      "latitude": -26.059682,
      "longitude": 28.05854,
      "agency": {
        "name": "Renprop Residential",
        "url": "https://www.property24.com/estate-agents/renprop-residential/24355",
        "logo": "https://images.prop24.com/365574966/Fit450x225"
      },
      "agent": {
        "name": "Julia Mpofu",
        "url": "https://www.property24.com/estate-agents/renprop-residential/julia-mpofu/433322"
      },
      "image": "https://images.prop24.com/363468997",
      "description": "Modern 2 Bed 1 Bath Apartment - Investor Package Available",
      "breadcrumb": [
        { "name": "Property for Sale", "url": "https://www.property24.com/" },
        { "name": "Gauteng",            "url": "https://www.property24.com/for-sale/gauteng/1" },
        { "name": "Sandton",            "url": "https://www.property24.com/for-sale/sandton/gauteng/109" },
        { "name": "Rivonia",            "url": "https://www.property24.com/for-sale/rivonia/sandton/gauteng/4251" }
      ]
    }
  ]
}
```

### Edge-case shapes

```json
// Suburb URL resolves but has no current listings (small / rural suburb)
{ "suburb": {...}, "pagination": { "max_page": 1, "approx_total_listings": 0 }, "listings": [] }

// Caller passed an invalid suburbId — site 404s
{ "success": false, "reason": "suburb_not_found", "url_attempted": "https://www.property24.com/for-sale/xyz/abc/abc/999999" }

// Listing tile present but priced "On Application"
{ "listing_id": "...", "price_text": "POA", "price_zar": null, "price_currency": "ZAR", ... }
```
