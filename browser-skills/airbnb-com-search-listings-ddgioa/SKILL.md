---
name: airbnb-com-search-listings-ddgioa
title: Airbnb Search Listings
description: >-
  Search Airbnb for short-term rental listings in a given location and date
  window — supporting the full filter surface (dates, guests, price, place +
  property type, bedrooms / beds / baths, amenities, booking options,
  accessibility, host language, the top-of-page category rail, and map bounding
  box) — and return each matching property as structured JSON via the SSR
  StaysSearch GraphQL blob embedded in the page. Read-only.
website: airbnb.com
category: travel
tags:
  - travel
  - lodging
  - rentals
  - search
  - perimeterx
  - read-only
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      Airbnb has zero public API. The internal /api/v3/StaysSearch GraphQL
      operation uses rotating persisted-query hashes + device fingerprinting
      headers, so direct calls fail. The good news: the StaysSearch response is
      rendered inline as a ~380 KB JSON blob in <script
      id="data-deferred-state-0"> on every /s/{slug}/homes page, so the browser
      path is effectively an API call wearing a browser disguise.
  - method: url-param
    rationale: >-
      All filter parameters are URL-encodable on /s/{slug}/homes — dates,
      guests, price, room/property type, amenities[], category_tag,
      ne_lat/sw_lat bbox, items_offset pagination. The skill is URL-driven; the
      browser is only there to handle PerimeterX + render the SSR.
verified: true
proxies: true
---
# Airbnb Search Listings

## Purpose

Search Airbnb for short-term rental listings in a given location and date window — supporting the full filter surface that Airbnb's filter modal exposes (dates, guests, price, place + property type, bedrooms / beds / baths, amenities, booking options, accessibility, host language, and the top-of-page "category" rail) — and return each matching property as structured JSON: listing ID, title, listing-type label, host info, location + coordinate, bedroom/bed/bath counts, max guests, amenity highlights, primary + additional photo URLs, nightly + total-before-tax pricing, cleaning/service fees when surfaced, rating, review count, "Guest favorite" / Superhost / "Hot new listing" badges, Instant Book + free-cancellation flags, and the canonical `/rooms/{id}` URL. Also accepts a map bounding box (`ne_lat / ne_lng / sw_lat / sw_lng`) for "search this area" use cases and a list of specific listing IDs to look up directly via `/rooms/{id}`. **Read-only — never clicks Reserve, Request to Book, Save, Contact Host, or Sign In.**

## When to Use

- "Find me 2-bedroom apartments in Lisbon for July 10–17, $80–$400/night, with Wi-Fi + Kitchen + Dryer, Instant Book, free cancellation."
- Map-bounded sweeps: "Show me everything in this bounding box right now."
- Continuous monitoring: re-run a saved query against today's date window and diff.
- "Look up these specific listing IDs" — bulk metadata enrichment.
- Any flow that needs structured Airbnb search output and is willing to pay the cost of a Browserbase session.

## Workflow

Airbnb has **no public API**. There is no URL-only / `bb fetch` shortcut: the HTML returned by an un-authed fetch is a near-empty PerimeterX-gated shell, and the `/api/v3/StaysSearch` GraphQL endpoint is locked behind device fingerprinting + persisted-query hashes that rotate. **Lead with scripted browsing through a Browserbase session with `--verified --proxies`** — the page renders the StaysSearch GraphQL response inline as a 380 KB JSON blob inside `<script id="data-deferred-state-0">`, and parsing that blob is dramatically more reliable than DOM-scraping the listing cards.

### 1. Stealth + residential-proxy session

```bash
SID=$(browse cloud sessions create --keep-alive --proxies --verified \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$SID"
```

`--verified --proxies` is mandatory. A bare session (no stealth) gets PerimeterX-served HTML on most page loads. **Do not** `browse cdp` + `bb-capture` alongside the same session unless you carefully attach to the *same* CDP target your `browse open` lands on — bb-capture latches onto the initial about:blank tab by default and won't see the airbnb traffic.

### 2. Resolve input → canonical search URL

| Input shape | URL pattern |
|---|---|
| Free-form location ("Paris", "Joshua Tree, CA", "Williamsburg, Brooklyn") | `https://www.airbnb.com/s/{URL-encoded slug, en-dash separators}/homes?<filters>` e.g. `/s/Paris--France/homes`, `/s/Joshua-Tree--CA--United-States/homes`. Airbnb's slug parser is forgiving — `/s/{free-form}/homes` works; the canonical slug is rewritten server-side. |
| Full Airbnb URL passed in | Use as-is. Add/override filter query params as needed — Airbnb merges them. |
| Map bounding box only | `https://www.airbnb.com/s/homes?ne_lat=…&ne_lng=…&sw_lat=…&sw_lng=…&search_by_map=true` + dates / guests. |
| Listing ID list (skip search) | For each id N, GET `https://www.airbnb.com/rooms/{N}?check_in=YYYY-MM-DD&check_out=YYYY-MM-DD&adults=N`. The PDP renders `<script id="data-deferred-state-0">` containing **`StaysPdpSections`** (different schema from search — see "Direct-listing lookup" gotcha). |

**Always pass `/homes` at the end of the slug.** Plain `/s/{slug}` sometimes 301-redirects to `/`{city}/stays` which returns Airbnb's "Stay tuned · Error 503" maintenance page (confirmed reproducible 2026-05-19 on a Joshua Tree query). `/s/{slug}/homes` is the canonical, reliable form.

### 3. Filter parameter surface

All accepted URL params (`?key=value&key[]=value` snake_case in the URL → camelCase in the StaysSearch cache key). **Verified against the request echo at `niobeClientData[0][0]` (the cache key) during iters 1–2; unrecognized params are silently dropped.**

| URL param | Cache-key alias | Meaning |
|---|---|---|
| `checkin=YYYY-MM-DD`, `checkout=YYYY-MM-DD` | `checkin`, `checkout` | Date window. **Required for accurate pricing** — without dates Airbnb invents a 5-night window for display pricing only. |
| `flexible_trip_lengths[]=weekend\|week\|month` | `flexibleTripLengths` | Flexible-date mode. |
| `flexible_date_search_filter_type=0\|1\|2\|3` | `flexibleDateSearchFilterType` | 0=exact, 1=±1 day, 2=±3 days, 3=±7 days. |
| `month_search_*` (multiple) | — | Month-range search; see "Site-Specific Gotchas". |
| `adults=N`, `children=N`, `infants=N`, `pets=N` | same | Guest counts. `children` is age 2–12; `infants` is under 2. |
| `min_bedrooms=N`, `min_beds=N`, `min_bathrooms=N` | `minBedrooms`, `minBeds`, `minBathrooms` | Minimum counts (Any=0, 1, 2, ..., 8+). |
| `price_min=N`, `price_max=N` | `priceMin`, `priceMax` | Range in **storefront currency**. With "Display total before taxes" on (default for unauthed sessions), this is **total-price-per-night including fees**, not raw nightly rate. |
| `display_currency=USD\|EUR\|GBP\|…` | `displayCurrency` | Currency code. Honored — also re-formats `price`, `discountedPrice`, `originalPrice` strings. |
| `room_types[]=Entire%20home%2Fapt\|Private%20room\|Shared%20room\|Hotel%20room` | `roomTypes` | Place type. URL-encode the `/` as `%2F` and the space as `%20`. |
| `property_type_id[]=N` | `propertyTypeId` | Specific property type (House, Apartment, Cabin, Treehouse, Yurt, Boat, Castle, etc.). The enum is **undocumented** — discover IDs from the Filters modal in the UI (the form input `value` attributes carry them). |
| `amenities[]=N` | `amenities` | Numeric amenity enum. Undocumented but stable; common observed values include `4` (Wi-Fi), `8` (Kitchen). Discover any specific amenity ID by opening Filters → checking the box → reading the URL it produces. |
| `ib=true` | `ib` | Instant Book. |
| `fc=true` | `fc` | Free cancellation. |
| `self_check_in=true` | `selfCheckIn` | Self check-in. |
| `allows_pets=true` | `allowsPets` | Allows pets (booking option; orthogonal to `pets=N`). |
| `superhost=true` | `superhost` | Superhost-hosted only. |
| `l_disaster_ready=true` | `lDisasterReady` | "Luxe" (verified by name echo). |
| `accessibility_features[]=N` | `accessibilityFeatures` | Step-free entrance, shower chair, etc. — same undocumented enum pattern. |
| `host_languages[]={iso-2}` | `hostLanguages` | Two-letter language codes. |
| `category_tag=Tag:NNNN` | `categoryTag` | Top-of-page category rail. **Verified: `Tag:8536` = Amazing views**. The remaining tags are an undocumented enum — read `loggingContext` on the category-rail buttons in the DOM or scrape `https://www.airbnb.com/categories` (which lists all tags). |
| `ne_lat`, `ne_lng`, `sw_lat`, `sw_lng` | `neLat`, `neLng`, `swLat`, `swLng` | Map bounding box (decimal degrees). |
| `search_by_map=true` | `searchByMap` | Required alongside the bbox to switch result ordering to map mode. |
| `items_offset=N` | `itemsOffset` | Pagination cursor — `0, 18, 36, ...` in steps of 18. |
| `section_offset=0` | `sectionOffset` | Always `0` for the homes refinement. |
| `pagination_search=true` | — | Set when paginating; signals client transition (cosmetic). |
| `query=` | `query` | Free-form location string (alternative to the URL slug). |
| `refinement_paths[]=%2Fhomes` | `refinementPaths` | Pre-encoded `/homes`. |

### 4. Navigate + wait + parse the SSR blob

```bash
URL="https://www.airbnb.com/s/Paris--France/homes?checkin=2026-06-15&checkout=2026-06-20&adults=2&min_bedrooms=2&price_min=100&price_max=500&room_types%5B%5D=Entire%20home%2Fapt&amenities%5B%5D=4&ib=true&superhost=true"
browse open "$URL" --remote --session "$SID"
browse wait load --session "$SID"
browse wait timeout 3000 --session "$SID"     # niobe hydration + price-disclaimer dialog can stagger
```

The dismissable info dialog **"Now you'll see one price for your trip, all fees included"** sometimes fronts the page after dates land. It does **not** block SSR parsing — extraction below works regardless. If you need a clean screenshot, click its "Got it" button (`button: Got it` ref).

Extract the StaysSearch response in one `browse eval`:

```bash
browse eval --session "$SID" "(() => {
  const s = document.querySelector('#data-deferred-state-0');
  if (!s) return JSON.stringify({error: 'NO_SSR'});
  const data = JSON.parse(s.textContent);
  const v = data.niobeClientData[0][1];
  const r = v.data.presentation.staysSearch.results;
  return JSON.stringify({
    pageTitle: r.sectionConfiguration?.pageTitleSections?.sections?.[0]?.sectionData?.structuredTitle,
    pageDisplayText: r.sectionConfiguration?.pageTitleSections?.sections?.[0]?.sectionData?.pageDisplayText,
    paginationCursors: r.paginationInfo.pageCursors,
    results: r.searchResults
  });
})()"
```

### 5. Decode each `searchResults[i]`

Per-listing field map (every observed key path is **non-empty for typical listings** but defensively null-check — e.g. `propertyId` is null in our captures, the canonical ID is on `demandStayListing`):

| Output field | Source path | Notes |
|---|---|---|
| `listing_id` | `item.demandStayListing.id` → base64-decode → strip `DemandStayListing:` prefix | The base64 of `DemandStayListing:939725100377294662` decodes to a numeric ID — that's the only ID you should ever use externally. |
| `url` | Compose: `https://www.airbnb.com/rooms/{listing_id}` | The slug isn't needed; bare `/rooms/{id}` 200-resolves. |
| `title` (e.g. "Apartment in 3rd Arrondissement") | `item.title` | Property type + neighborhood, in storefront language. |
| `name` / `display_name` | `item.subtitle` or `item.nameLocalized.localizedStringWithTranslationPreference` | Host-supplied listing name. |
| `bedrooms`, `beds`, `bathrooms` | `item.structuredContent.primaryLine[]` — iterate, match `type === 'BEDINFO'\|'BATHROOMINFO'` and parse `body` | Bodies are localized strings ("3 bedrooms", "4 beds", "2.5 baths", "1 sofa bed"). Studios surface as `"1 sofa bed"` with no bedroom row. |
| `max_guests` | Not in search payload — only on PDP | Either drop or fetch from `/rooms/{id}` when needed. |
| `lat`, `lng` | `item.demandStayListing.location.coordinate.{latitude,longitude}` | **Airbnb fuzzes coordinates by ~150 m radius for unbooked listings.** The values are stable across reloads but not the true address. |
| `nightly_price` (formatted) | `item.structuredDisplayPrice.primaryLine.price` (no discount) OR `.discountedPrice` (with discount) | Currency-formatted string ("$2,623"). |
| `nightly_price_original` (when discounted) | `item.structuredDisplayPrice.primaryLine.originalPrice` | Only present when `__typename === 'DiscountedDisplayPriceLine'`. |
| `price_qualifier` | `item.structuredDisplayPrice.primaryLine.qualifier` | "for 5 nights", "for 7 nights". |
| `price_a11y_label` | `item.structuredDisplayPrice.primaryLine.accessibilityLabel` | "$1,963 for 5 nights, originally $2,196" — useful for raw-number parsing. |
| `total_before_taxes` | `item.structuredDisplayPrice.explanationData.priceDetails[].items[]` → find `HighlightExplanationLineItem` with description "Price after discount" / "Total before taxes" | Raw breakdown also gives per-night × nights, cleaning fee, service fee, long-stay discount when present. |
| `currency_code` | Not in payload; inferred from `displayCurrency` URL param or the leading symbol in the price strings | Pass through. |
| `rating` | Parse `item.avgRatingLocalized` (e.g. `"4.85 (132)"`) → `4.85` | Or read `item.avgRatingA11yLabel` ("4.85 out of 5 average rating,  132 reviews") for cleaner regex. |
| `review_count` | Parse same source → `132` | New listings (zero reviews) have `avgRatingLocalized: null` and an "New" badge instead. |
| `badges[]` | `item.badges[].loggingContext.badgeType` enum + `.text` for display | Observed: `GUEST_FAVORITE` ("Guest favorite"), `TOP_TIER_FAVORITE` ("Top guest favorite"), `SUPERHOST` ("Superhost"), `NEW_LISTING` ("Hot new listing" / "New"). |
| `guest_favorite` (bool) | `badges.some(b => b.loggingContext.badgeType === 'GUEST_FAVORITE' \|\| === 'TOP_TIER_FAVORITE')` | |
| `superhost` (bool) | `badges.some(b => b.loggingContext.badgeType === 'SUPERHOST')` | |
| `instant_book` (bool) | Not directly surfaced as a field. If you set `ib=true` in the URL, all results are Instant Book by definition; otherwise the badge `INSTANT_BOOK` or absence-of-"Request to book" wording is the signal. Most reliable: re-emit the `ib` URL flag. |
| `free_cancellation` (bool) | `item.priceBreakdownMessages` + the rendered `"Free cancellation"` line in `subtitle`/`paymentMessages` | Easiest: set `fc=true` filter and trust all results are free-cancellable. |
| `photo_url_primary` | `item.contextualPictures[0].picture` | Medium-res JPEG/PNG; CDN at `a0.muscache.com`. |
| `photo_urls[]` | `item.contextualPictures[].picture` (or `xlPicture` for high-res) | 6 photos surface in search payload. The PDP carries more. |
| `payment_messages[]` | `item.paymentMessages` | "Pay $0 today", "Free cancellation", etc. — array of pre-formatted strings. |
| `host_name`, `host_avatar_url` | Not in search payload — only PDP | Fetch from `/rooms/{id}` for full host data. |

### 6. Result-count headers + pagination

- **List view total**: `presentation.staysSearch.results.sectionConfiguration.pageTitleSections.sections[0].sectionData.structuredTitle` — e.g. `"60 homes in Lisbon"`. **Fuzzed past ~270 to "Over 1,000 homes in Paris"** — that's a server-side cap, not a parse error.
- **Map view total**: same path but on a map-bounded search returns the **precise** count: `"167 homes within map area"` (verified). For sweeps > 270 listings, **subdivide the map bounding box** into quadrants and recurse.
- **Pagination**: `presentation.staysSearch.results.paginationInfo.pageCursors[]` is an array of base64 cursors, length capped at 15 (= 270 listings). Each cursor is `base64(JSON.stringify({section_offset:0, items_offset:N, version:1}))`. **You don't need to use the opaque cursor** — just append `&items_offset={N}&section_offset=0&pagination_search=true` for N ∈ {0, 18, 36, 54, ..., 252}. Re-navigate per page; results are deterministic across reloads within a TTL.

### 7. Map-bounded sweep

```bash
URL="https://www.airbnb.com/s/homes?checkin=2026-06-15&checkout=2026-06-20&adults=2&ne_lat=48.875&ne_lng=2.36&sw_lat=48.85&sw_lng=2.32&search_by_map=true"
browse open "$URL" --remote --session "$SID"
```

`mapResults.staysInViewport[]` (separate from `searchResults`) carries the viewport-scoped subset; on Paris this returned all 167 matches in a single payload. **When total > 270, subdivide the box** — Airbnb caps the list at 270 globally, not per call, so a finer-grained bbox still yields up to 270 fresh listings.

### 8. Release the session

```bash
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

## Site-Specific Gotchas

- **READ-ONLY.** Never click Reserve, Request to Book, the heart/Save icon, Contact Host, or Sign In. The skill stops at the search result page.
- **Stealth + residential proxy is mandatory.** Default to `browse cloud sessions create --keep-alive --proxies --verified` for every iter. A bare session gets a PerimeterX-served HTML shell with no `#data-deferred-state-0` script. **No CAPTCHA was triggered in 2 iters across 6 navigations** with verified+proxies on (Paris, Lisbon, Joshua Tree, Tokyo) — but PerimeterX is unpredictable; if a CAPTCHA or 403 appears, snapshot it, ship the run as `candidate`, and retry with a fresh session.
- **GraphQL `/api/v3/StaysSearch` is a trap.** It uses persisted-query hashes that rotate and requires device fingerprinting headers. Don't try to call it directly. The SSR `<script id="data-deferred-state-0">` is the *same* response, served inline. Parse that.
- **`#data-deferred-state-0` is **not** stable across non-search pages.** On `/rooms/{id}` (PDP) the same script id contains a `StaysPdpSections` payload with a totally different shape (`v.data.presentation.stayProductDetailPage.sections.sections[]`). When supporting the listing-ID-list input shape, write a **separate** decoder for the PDP — do not assume the search decoder works.
- **Use `/s/{slug}/homes`, not `/s/{slug}` or `/{city}/stays`.** Plain `/s/{slug}?category_tag=…` or city-level `/joshua-tree-ca/stays` returns a "Stay tuned · Error 503" maintenance page (reproduced 2026-05-19). The `/homes` refinement suffix is the canonical, reliable form.
- **Result count is capped + fuzzed at 270 / 15 pages.** "Over 1,000 homes in Paris" is the cap-fuzzing label; the actual pagination cursors max out at `items_offset=252`. For larger sweeps, do **map-bbox subdivision** — the map endpoint reports a precise total ("167 homes within map area") and you can quadtree-split when a sub-box exceeds 270.
- **`niobeClientData` is an array of `[cacheKey, value]` tuples** — always start at `data.niobeClientData[0][1].data.presentation.staysSearch.results`. The cacheKey at `[0][0]` is the literal string `"StaysSearch:" + JSON.stringify({...rawParams sorted alphabetically})` and echoes every filter Airbnb honored (camelCased). **Reading the echo is the only reliable way to confirm a filter was accepted** — unknown params are silently dropped without any error.
- **Coordinates are fuzzed by ~150 m.** `demandStayListing.location.coordinate.{latitude,longitude}` resolves to a "general area" pin, not the address. Do not pin maps tighter than that radius. The fuzz disappears once a guest has a confirmed booking — irrelevant to read-only search.
- **`propertyId` is `null` in search payloads.** Don't use it. The canonical listing ID lives at `demandStayListing.id` (base64) — decode with `atob()` and strip `DemandStayListing:`.
- **Two price-line shapes.** `structuredDisplayPrice.primaryLine.__typename` is either `DiscountedDisplayPriceLine` (carries `originalPrice + discountedPrice`) or `QualifiedDisplayPriceLine` (carries `price`). Switch on `__typename` — accessing `.price` on a discounted line is `undefined`.
- **`price_min/price_max` are total-fee-inclusive when the price-disclaimer dialog is "on"**, which it is by default. The `"Now you'll see one price for your trip, all fees included"` dialog reflects that. There's no public toggle to revert to pre-fee pricing — emit a `"pricing_mode": "total_before_taxes"` field on the output so the consumer knows.
- **`amenities[]`, `property_type_id[]`, `accessibility_features[]`, `category_tag` are undocumented enums.** Discover any value by clicking the corresponding control in the Filters modal once and reading the `?amenities[]=N` it appends to the URL. Hardcode a small lookup table per skill consumer rather than guessing.
- **Don't use `browse cdp` + `bb-capture` on the same session as `browse open --remote`** unless you carefully share the CDP target. Iter-1 attached browser-trace to the initial about:blank tab, missed the airbnb activity entirely (12 events captured total), and produced no useful network log. The SSR blob makes browser-trace unnecessary for this skill — skip it.
- **`flexible_trip_lengths[]` and `month_search_*` are accepted but untested** — same `rawParams` echo pattern applies, so the echo at `niobeClientData[0][0]` is the test. Emit them through and verify.
- **Dialog interception.** A `dialog: Now you'll see one price for your trip, all fees included.` overlay sometimes fronts the page after the first nav. It blocks interaction (clicks) but **does not block `document.querySelector('#data-deferred-state-0')`** — SSR extraction works regardless. Dismiss it via `click [ref of "Got it" button]` only if you need a clean screenshot.
- **Direct-listing lookup**: `/rooms/{N}` accepts `check_in / check_out / adults / children / infants / pets` URL params (verbose names, not the search-page short forms) and renders a `StaysPdpSections` SSR blob with a fundamentally different schema — different skill territory, but the URL shape is documented here for completeness.

## Expected Output

Three outcome shapes covering the input shapes the skill accepts.

### List/area search success (the canonical case)

```json
{
  "success": true,
  "query": { "location": "Paris, France", "checkin": "2026-06-15", "checkout": "2026-06-20", "adults": 2, "filters_applied": { "min_bedrooms": 2, "price_min": 100, "price_max": 500, "ib": true } },
  "pricing_mode": "total_before_taxes",
  "currency_code": "USD",
  "page_total_label": "Over 1,000 homes in Paris",
  "page_total_precise": null,
  "page": 1,
  "page_count_cap": 15,
  "items_per_page": 18,
  "next_items_offset": 18,
  "listings": [
    {
      "listing_id": "939725100377294662",
      "url": "https://www.airbnb.com/rooms/939725100377294662",
      "title": "Apartment in 3rd Arrondissement",
      "name": "Charming apartment - 1BR/4P -AC- Marais/Vosges",
      "bedrooms": 1,
      "beds": 2,
      "bathrooms": 1,
      "lat": 48.8637,
      "lng": 2.3631,
      "coordinate_is_fuzzed": true,
      "nightly_price": "$1,963",
      "nightly_price_original": "$2,196",
      "price_qualifier": "for 5 nights",
      "price_a11y_label": "$1,963 for 5 nights, originally $2,196",
      "total_before_taxes": 1962.74,
      "price_breakdown": [
        { "description": "5 nights x $439.05", "amount": 2195.25 },
        { "description": "Long stay discount", "amount": -232.51 }
      ],
      "currency_code": "USD",
      "rating": 4.85,
      "review_count": 132,
      "badges": ["Guest favorite"],
      "guest_favorite": true,
      "superhost": false,
      "instant_book": null,
      "free_cancellation": false,
      "is_new_listing": false,
      "photo_url_primary": "https://a0.muscache.com/im/pictures/prohost-api/Hosting-939725100377294662/original/50b66afe-bb54-41ff-a7bb-aeb603e3c6ff.jpeg",
      "photo_urls": ["https://a0.muscache.com/im/pictures/...", "..."],
      "payment_messages": []
    }
  ]
}
```

### Map-bounded search success (precise total)

```json
{
  "success": true,
  "query": { "ne_lat": 48.875, "ne_lng": 2.36, "sw_lat": 48.85, "sw_lng": 2.32, "search_by_map": true, "checkin": "2026-06-15", "checkout": "2026-06-20", "adults": 2 },
  "page_total_label": "167 homes within map area",
  "page_total_precise": 167,
  "listings": [ /* same per-listing schema */ ]
}
```

### Anti-bot wall (PerimeterX or 503)

```json
{
  "success": false,
  "reason": "anti_bot_block",
  "http_status": 503,
  "page_title": "Stay tuned · Error 503",
  "screenshot": "screenshots/03-503-redirect.png",
  "retry_recommended": true,
  "retry_strategy": "fresh --verified --proxies session; use /s/{slug}/homes URL form, not /s/{slug} or /{city}/stays"
}
```
