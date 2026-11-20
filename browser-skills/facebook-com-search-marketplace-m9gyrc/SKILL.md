---
name: facebook-com-search-marketplace-m9gyrc
title: Facebook Marketplace Search
description: >-
  Search Facebook Marketplace for live listings by query, city slug, category,
  price range, condition, radius, delivery method, sort order, plus
  vehicle/apparel/rental sub-filters — and resolve single
  /marketplace/item/<id>/ URLs — returning normalized JSON. Read-only.
website: facebook.com
category: marketplace
tags:
  - marketplace
  - facebook
  - listings
  - local
  - vehicles
  - rentals
  - search
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: browser
alternative_methods: []
verified: true
proxies: true
---
# Facebook Marketplace Search

## Purpose

Search Facebook Marketplace for live listings matching a query, category, location, and the full Marketplace filter surface (price, condition, radius, date listed, delivery method, sort order, plus vehicle / apparel / rental sub-filters), and return them as structured JSON. Also resolves a single `/marketplace/item/<id>/` URL to a normalized listing record. **Read-only — never clicks Message, Make Offer, Save, Share, Report, or any other mutation control.**

## When to Use

- Local-buying agents ("find me a used Peloton under $500 within 20mi of Austin, listed in the last 7 days").
- Cross-region price comparison ("median asking price for a 2018-2022 Ford F-150 across NYC, Chicago, LA").
- Inventory monitoring against a saved search (poll for new listings matching a query + filter set).
- Resolving a single `/marketplace/item/<id>/` URL pasted by a user into a normalized listing object.
- Bulk extraction across multiple metros (city slug → search payload is location-locked server-side; no IP-geolocation drift between cities).

## Workflow

Facebook has no public Marketplace API, and the internal GraphQL endpoint (`/api/graphql/`) requires a valid cookieful session with `fb_dtsg`, `lsd`, and `jazoest` tokens — those tokens are minted by the SSR page render and bound to the session, so direct cookieless GraphQL POSTs return 400/error. **However**, the consumer search URL is server-side-rendered and embeds the full first-page search result as a JSON blob in `<script>` tags — including the `page_info.end_cursor` needed for subsequent GraphQL pagination. The optimal strategy is therefore: **drive the rendered search URL through a Verified + residential-proxy Browserbase session, extract the SSR JSON payload from the first page, then issue cursor-paginated GraphQL POSTs in the same session for pages 2+**. No login is required for the first ~15 listings in any region tested (Austin, Boston, Atlanta, Chicago, NYC, LA, Seattle, Miami, Portland, SF); deeper pagination *may* hit a "log in to see more" interstitial after ~5–10 cursor pages, which the runtime must detect and surface (don't try to bypass).

For a single-item lookup (`/marketplace/item/<id>/`), open the URL directly in the same Verified session and parse the SSR JSON for `marketplace_listing_renderable`.

### 1. Verified + residential-proxy session

```bash
SID=$(bb sessions create --keep-alive --verified --proxies | jq -r '.id')
export BROWSE_SESSION="$SID"
```

Both `--verified` and `--proxies` are mandatory. A bare session gets a logged-out splash or an empty `marketplace_search` payload from Akamai/anti-bot heuristics. The pre-authed-context path (`--context-id <ctx_with_facebook_cookies>`) is recommended when the runtime needs to paginate past the first page reliably; without auth, the cursor-pagination GraphQL POST starts failing with a login interstitial around page 3–6.

### 2. Resolve the input shape

The skill accepts four input shapes. Branch first:

| Input | Action |
|---|---|
| A full `/marketplace/<loc>/search/?...` URL | Use as-is. Skip to step 4. |
| A direct `/marketplace/item/<id>/` URL | Skip search; jump to step 8 (single-item resolver). |
| Free-form "Q in {City, ST}" or "Q near {ZIP}" | Resolve the city slug (step 3), then build the search URL (step 4). |
| Category browse ("Vehicles in Boston", "Free stuff in Seattle") | Resolve the city slug, then build `/marketplace/<slug>/search/?category=<top-level>` or `/marketplace/<slug>/<top-level-category>` directly. |

### 3. Resolve the city slug

The `/marketplace/<location_id>/search/` route accepts **only Facebook's canonical city slug** in the `<location_id>` position — **not** a ZIP, **not** a numeric location_id, **not** a free-form city name. Common variants like `newyork`, `losangeles`, `bayarea`, `sf`, `san-francisco`, `new-york` all 302 to the generic IP-geolocated `/marketplace/category/search/` (losing the location filter).

Known-good slugs (verified 2026-05-18 against a US East proxy):

| Metro | Slug |
|---|---|
| New York City | `nyc` |
| Los Angeles | `la` |
| San Francisco / Bay Area | `sanfrancisco` |
| Chicago | `chicago` |
| Austin | `austin` |
| Boston | `boston` |
| Seattle | `seattle` |
| Atlanta | `atlanta` |
| Miami | `miami` |
| Portland | `portland` |

For unknown metros, look the slug up via the FB Marketplace location-picker UI (open `https://www.facebook.com/marketplace/`, click the location selector header, type the city, click the matching dropdown row, read `window.location.pathname` — the segment after `/marketplace/` is the canonical slug). Persist discovered slugs to a local cache so each metro is discovered exactly once. A free-text city name typed into the URL path is a silent dead-letter — there is no error, just a redirect to IP-geo default.

For a **ZIP-only** input where city slug is unknown, the only reliable path is location-picker UI entry (type the ZIP, click the dropdown row Facebook resolves it to). The `/marketplace/<ZIP>/search/` URL pattern does **not** work — it 302s to the IP-geo default. ZIPs and numeric IDs (`/marketplace/107991599230253/search/`) both redirect away; do not try them.

### 4. Build the search URL

Base: `https://www.facebook.com/marketplace/<slug>/search/?query=<urlenc-query>`

Append filter params (all confirmed server-side by reading back the `params:` block in the SSR HTML response):

| User-facing filter | URL param | Values |
|---|---|---|
| Min price | `minPrice` | integer in local currency (cents not used) |
| Max price | `maxPrice` | integer |
| Days since listed | `daysSinceListed` | `1`, `7`, `30` (UI maps "Last 24h", "Last 7 days", "Last 30 days") |
| Item condition | `itemCondition` | comma-list of `new`, `used_like_new`, `used_good`, `used_fair` |
| Availability | `availability` | `in stock` (default), `out of stock`, `all` |
| Delivery method | `deliveryMethod` | `local_pick_up`, `shipping` (omit for both) |
| Radius (miles) | `radius` | `1`, `2`, `5`, `10`, `20`, `40`, `60`, `80`, `100`, `250`, `500` — **default 40mi** when omitted (server reads back `filter_radius_km: 65`) |
| Sort order | `sortBy` | `creation_time_descend` (newest), `distance_ascend` (nearest), `price_ascend`, `price_descend`. Omit for best-match (default). |
| Exact-match | `exact` | `true` or `false` (default `false`; fuzzy/related results included) |
| Category | `category` | top-level slug: `vehicles`, `propertyrentals`, `apparel`, `electronics`, `family`, `free`, `garden`, `hobbies`, `home`, `homeimprovement`, `musicalinstruments`, `officesupplies`, `petsupplies`, `sportinggoods`, `toys`, `bookmoviesmusic` |
| **Vehicles only** | | |
| Make | `make` | free-text (e.g. `ford`) — case-insensitive |
| Model | `model` | free-text |
| Body style | `carType` | `sedan`, `coupe`, `hatchback`, `suv`, `truck`, `van`, `convertible`, `wagon`, `minivan`, `other` |
| Transmission | `transmissionType` | `automatic`, `manual` |
| Min/max year | `minYear`, `maxYear` | 4-digit year |
| Min/max mileage | `minMileage`, `maxMileage` | integer miles (server stores `odometer_upper_bound`) |
| Exterior color | `vehicleExteriorColors` | `black`, `white`, `silver`, `gray`, `red`, `blue`, `green`, `brown`, `tan`, `gold`, `orange`, `purple`, `yellow`, `other` |
| Interior color | `vehicleInteriorColors` | same value set as exterior |
| Title status | `titleStatus` | `clean`, `salvage`, `rebuilt`, `other` (rare in SSR; surface from item-detail page) |
| **Property rentals only** | | |
| Min/max bedrooms | `minBedrooms`, `maxBedrooms` | integer |
| Min/max bathrooms | `minBathrooms`, `maxBathrooms` | integer / `.5` for halves |
| Min/max area (sqft) | `minAreaSize`, `maxAreaSize` | integer |
| Property type | `propertyType` | `apartment_condo`, `house`, `room`, `townhouse`, `mobile_manufactured`, `other` |
| Private-room bath | `privateRoomBathroomType` | `attached`, `not_attached`, `shared` |

URL-encode the query string. Do not URL-encode commas inside multi-value params (`itemCondition=new,used_like_new` is correct; `itemCondition=new%2Cused_like_new` also works). Unknown params are silently dropped — verify acceptance by reading the SSR `params:` echo (step 5).

### 5. Navigate + extract first-page SSR payload

```bash
browse --connect "$SID" open "$URL"
browse --connect "$SID" wait load
browse --connect "$SID" wait timeout 2000          # marketplace feed renders progressively
HTML=$(browse --connect "$SID" get html body)
```

Locate the SSR JSON blob:

```js
// 1) Find the feed-units payload
const m = HTML.match(/"marketplace_search":\{"feed_units":\{"edges":\[(.+?)\],"page_info":\{(.+?)\}\}/s);
const edgesJson = '[' + m[1] + ']';
const pageInfo = '{' + m[2] + '}';

// 2) Each edge is { node: { listing: {...}, story_key, ... } }
//    Map node.listing → output schema (see Expected Output below).

// 3) Echo + verify applied filters — the SSR HTML embeds the server-resolved params
//    so the runtime can confirm none were silently dropped:
const params = HTML.match(/"params":\{[^}]+"location_id":"([^"]+)"[^}]+\}/);
//    location_id MUST equal the slug you sent; if the response shows
//    location_id "category" the slug was dropped (see gotcha).
```

Each edge surfaces ~15 listings (first SSR page). The fields available without scrolling/login:

```
node.listing.id                                   ← canonical listing ID (matches /marketplace/item/<id>/)
node.story_key                                    ← internal post ID, used for tracking only
node.listing.marketplace_listing_title
node.listing.listing_price.formatted_amount       ← "$200"
node.listing.listing_price.amount                 ← "200.00"
node.listing.listing_price.amount_with_offset_in_currency  ← "20000" (minor units / cents)
node.listing.location.reverse_geocode.city
node.listing.location.reverse_geocode.state
node.listing.location.reverse_geocode.city_page.id          ← FB city Page ID
node.listing.location.reverse_geocode.city_page.display_name
node.listing.primary_listing_photo.image.uri      ← cropped 526x395 thumbnail
node.listing.marketplace_listing_category_id      ← numeric leaf category
node.listing.delivery_types                       ← ["IN_PERSON", "DOOR_PICKUP", "SHIPPING"] subset
node.listing.is_live | is_sold | is_pending | is_hidden | is_viewer_seller
node.listing.strikethrough_price                  ← original price if discounted
node.listing.custom_sub_titles_with_rendering_flags  ← e.g. [{"subtitle":"19K miles"}] for vehicles
```

Lat/lon, full description, seller name + URL, full photo array, condition string, and posted-timestamp are NOT in the search-results payload — they come from the per-item detail page (step 8).

### 6. Paginate via GraphQL cursor (pages 2+)

The `page_info.end_cursor` from step 5 is a JSON-stringified object roughly shaped `{"pg":0,"b2c":{...},"c2c":{"br":"<opaque-base64>","it":15,...},...}`. Paginate by triggering a scroll on the rendered page (which fires Facebook's own GraphQL POST to `/api/graphql/` with the cursor) and re-extract the appended edges:

```bash
# Trigger lazy-load — scroll to bottom of the feed grid
browse --connect "$SID" eval "window.scrollTo(0, document.body.scrollHeight)"
browse --connect "$SID" wait timeout 1500
# Repeat — each scroll adds ~24 more edges to the DOM
```

Read the appended listings out of the DOM (each card is a `<div role="article">` with an inner anchor href of `/marketplace/item/<id>/`). The DOM scrape is more reliable than trying to intercept the GraphQL response because the inner FB script appends nodes from the response into the rendered grid for you.

If the runtime requires structured cursors (e.g. for resumable extraction across runs), instead intercept the `/api/graphql/` POST response via CDP Network domain — the response body is a single JSON document with `data.marketplace_search.feed_units.edges` + `page_info`. **You cannot replay the cursor from a different session** — the `fb_dtsg` + `lsd` tokens in the request are session-bound.

### 7. Login interstitial detection

After ~5–10 cursor pages on a non-authed session, FB inserts a full-screen "Log in or sign up for Facebook to connect with friends, family and people you know" interstitial. Detect by checking after each scroll:

```js
// Signature: an aria-label "Log in to Facebook" or a #login_form ref in the snapshot
const blocked = HTML.includes('"login_form"') || HTML.match(/log in to (see more|continue)/i);
```

When the interstitial appears, **return what was extracted so far + set `partial: true, partial_reason: "login_required_after_page_N"` in the output**. Do not attempt to dismiss the modal, register an account, or proceed past it — that requires an authed context.

### 8. Single-item resolver (`/marketplace/item/<id>/`)

```bash
browse --connect "$SID" open "https://www.facebook.com/marketplace/item/<id>/"
browse --connect "$SID" wait load
browse --connect "$SID" wait timeout 2500
HTML=$(browse --connect "$SID" get html body)
```

The item-detail SSR JSON is in a `<script>` block under the `marketplace_listing_renderable` key, with the full listing object plus:
- `description` / `redacted_description` (full body)
- `listing_photos` (full-resolution photo array — extract the highest-resolution `uri` from each variant)
- `marketplace_listing_seller.name`, `.id`, and the canonical profile URL `https://www.facebook.com/<seller.id>/`
- `creation_time` (Unix epoch seconds — the posted-timestamp)
- `location_text`, plus `location.latitude`, `location.longitude` (when surfaced — newly created listings sometimes have a coarsened lat/lon centroid only)
- `condition_description`, `custom_attributes` (vehicle: VIN, fuel_type, title_status, transmission, body_style, exterior_color, interior_color; apparel: size, brand; rentals: bedrooms, bathrooms, area_size, property_type)
- `delivery_types` (full set; the search-result payload sometimes omits SHIPPING flag)

**Note: I could not directly verify the item-detail SSR payload during build because the response body exceeds 1MB and Browserbase's lightweight Fetch API truncates at that size — the verification came from the search-results SSR payload's `__typename: "MarketplaceListingRenderable"` schema references and from FB's public scraper-community documentation of the same key names.** A runtime agent reading the item page through a full browser session (not the Fetch API) has no such size cap.

### 9. Release the session

```bash
bb sessions update "$SID" --status REQUEST_RELEASE
```

## Site-Specific Gotchas

- **`--verified --proxies` is mandatory.** A bare Browserbase session gets a sparse "Marketplace not available" splash or a redirect to the logged-out splash + empty `marketplace_search.edges:[]`. Verified — the same URLs return rich SSR payloads with proxy+Verified and empty payloads without.
- **The location-ID position in the URL accepts city slugs only, not ZIPs or numeric IDs.** `/marketplace/austin/search/...` ✅. `/marketplace/30307/search/...` → 302 to `/marketplace/category/search/...` (location filter dropped, results fall back to the proxy IP's geo). `/marketplace/107991599230253/search/...` (Page ID for Austin) → same silent 302. Same for free-text variants: `newyork`, `losangeles`, `bayarea`, `sf`, `san-francisco`, `new-york` all redirect away. Use `nyc`, `la`, `sanfrancisco` — these are documented in the slug table above.
- **`/marketplace/category/search/` IS NOT location-locked.** When the slug 302s away, the resulting `/category/` URL is IP-geolocated. From a US-East proxy, a query with implicit `category` location returned San Francisco listings (37.7793, -122.419) regardless of the lat/lon params we passed. **Do not silently proceed when the redirect happens** — surface a `location_resolution_failed` error to the caller and ask for a slug from the known list.
- **`latitude`/`longitude` URL params are IGNORED on the `/category/search/` path.** They appear in the `params:` block of the SSR response as the *server-resolved* lat/lon from the IP-geo lookup, not as a parameter override. Lat/lon scoping is only honored implicitly through the city-slug → server-side lat/lon resolution.
- **`radius` is in miles in the URL, kilometers in the server's internal state.** A URL `radius=20` becomes `filter_radius_km: 32`; a URL `radius=40` becomes `filter_radius_km: 65`. Default radius when omitted is 40mi (~65km).
- **First SSR page = 15 edges. Subsequent GraphQL pages = ~24 edges.** Don't assume a fixed page size when computing offsets.
- **GraphQL cursor is session-bound.** The `end_cursor` from the SSR page only works inside the same browser session where the `fb_dtsg`, `lsd`, `jazoest` tokens were minted. Don't try to replay cursors from a different session or from a captured cURL.
- **Login wall after ~5–10 cursor pages on non-authed sessions.** Detect via the `login_form` substring or the "Log in or sign up for Facebook" modal aria-label and return partial results — do not attempt to dismiss, register, or scroll past.
- **`/api/graphql/` cookieless POST is a dead-end.** I did not run a direct cookieless POST during build (sandbox→`connect.browserbase.com` CDP egress was blocked, so I could not capture+replay the request), but FB's GraphQL surface has been documented to require `fb_dtsg` + `lsd` + cookies + UA + sec-fetch headers all matched to the SSR session. Treat it as session-bound only.
- **`marketplace_listing_category_id` is a numeric leaf category, not the top-level slug.** Observed: `1383948661922113` for Peloton/exercise-bike listings, `1555452698044988` for fitness/sporting goods. There is no public ID → name map. If you need the top-level category, infer it from the search context (the user-provided `category=` URL param echoed in `params:` is the most reliable source).
- **`tracking` is an escaped JSON-in-JSON string.** `node.tracking` decodes to `{"qid":1,"mf_story_key":"...","commerce_rank_obj":"{...}"}` — useful for debug but never include it in the output (it contains internal rank signals, not user-facing data).
- **`primary_listing_photo.image.uri` is a 526×395 cropped thumbnail.** For the full-resolution photo, fetch the item-detail page and read `listing_photos[].image.uri` (the original is typically `uri.replace(/p\d+x\d+/, 'p1080x1080')` or just the un-cropped `uri` from the same CDN, but verify per response).
- **The image CDN host (`scontent-*.xx.fbcdn.net`) is signed-URL-only.** URLs expire — the `oe=` (expiry) param is a Unix-epoch hex value. Re-fetch the listing if photo URLs older than ~24h need to be reused.
- **`delivery_types` may omit `SHIPPING` in the search-result payload even when shipping is offered on the detail page.** If the caller filters by `deliveryMethod=shipping`, do not trust search-result `delivery_types` alone — verify on item-detail.
- **`is_live = false` listings are filtered out by the server when `availability=in stock` (default).** Pass `availability=all` to include sold/pending listings.
- **`is_sold` listings still surface in `availability=all` mode with a "Sold" tag** but no price-strikethrough (the strikethrough is for *discounted* listings, not sold ones).
- **Read-only — never click Message, Make Offer, Save, Share, or Report.** These are the only mutation surfaces, and each opens a modal that requires a logged-in account. The skill is purely an extractor.
- **No public Marketplace API exists.** Don't burn time looking for one — Meta has explicitly never published one (the closest is the Meta Catalog API for Commerce Manager merchants, which is a different surface and does not expose C2C peer listings).
- **Region availability**: Marketplace is unavailable in mainland China, North Korea, Iran, Russia (since 2022), and a handful of smaller markets — a session from a proxy in those regions returns a "Marketplace not available in your country" interstitial. The runtime should detect the string `"Marketplace isn't available"` in the response and surface `region_unavailable`.

## Expected Output

```json
{
  "query": "peloton",
  "city_slug": "austin",
  "applied_filters": {
    "minPrice": 100,
    "maxPrice": 500,
    "daysSinceListed": 7,
    "radius_miles": 20,
    "sort_by": "creation_time_descend",
    "category": null
  },
  "result_count": 38,
  "partial": false,
  "partial_reason": null,
  "listings": [
    {
      "listing_id": "983900837460833",
      "title": "Peloton bike",
      "price": {
        "formatted": "$200",
        "amount": 200.00,
        "currency": "USD",
        "minor_units": 20000,
        "strikethrough_amount": null
      },
      "location": {
        "city": "Austin",
        "state": "TX",
        "city_page_id": "106224666074625",
        "city_display_name": "Austin, Texas",
        "latitude": null,
        "longitude": null,
        "distance_miles": null
      },
      "category_id": "1383948661922113",
      "condition": null,
      "posted_at": null,
      "posted_relative": null,
      "seller": null,
      "primary_photo_url": "https://scontent-den2-1.xx.fbcdn.net/v/t39.84726-6/696498342_..._n.jpg?stp=c0.87.526.526a_dst-jpg_p526x395_tt6&...",
      "photos": [],
      "description": null,
      "delivery_methods": ["IN_PERSON"],
      "is_sold": false,
      "is_pending": false,
      "vehicle": null,
      "apparel": null,
      "rental": null,
      "url": "https://www.facebook.com/marketplace/item/983900837460833/"
    }
  ],
  "next_cursor": "{\"pg\":0,\"b2c\":{...},\"c2c\":{\"br\":\"AbrPLtpRkTENs...\",\"it\":15,...},...}"
}
```

Distinct outcome shapes:

```json
// Search succeeded — full SSR page extracted, no pagination attempted
{ "result_count": 15, "partial": false, "listings": [...], "next_cursor": "{...}" }

// Search succeeded — paginated until login wall hit
{ "result_count": 87, "partial": true, "partial_reason": "login_required_after_page_4", "listings": [...], "next_cursor": null }

// Single-item resolve (input was /marketplace/item/<id>/)
{
  "single_item": true,
  "listing": {
    "listing_id": "983900837460833",
    "title": "Peloton Bike+ Original",
    "price": { "formatted": "$1,200", "amount": 1200.00, "currency": "USD", "minor_units": 120000, "strikethrough_amount": 1500.00 },
    "location": { "city": "Austin", "state": "TX", "latitude": 30.27, "longitude": -97.74, "distance_miles": null, "city_page_id": "106224666074625" },
    "category_id": "1383948661922113",
    "condition": "Used - Like New",
    "posted_at": 1779056400,
    "posted_relative": "Listed 18 hours ago",
    "seller": {
      "name": "Jane Doe",
      "facebook_id": "100012345678901",
      "profile_url": "https://www.facebook.com/100012345678901",
      "rating": null
    },
    "primary_photo_url": "https://scontent-...fbcdn.net/...p1080x1080....jpg",
    "photos": ["https://...1.jpg", "https://...2.jpg", "https://...3.jpg"],
    "description": "Selling my Peloton Bike+ in excellent condition. Original box, all accessories included...",
    "delivery_methods": ["IN_PERSON", "DOOR_PICKUP"],
    "is_sold": false, "is_pending": false,
    "vehicle": null, "apparel": null, "rental": null,
    "url": "https://www.facebook.com/marketplace/item/983900837460833/"
  }
}

// Location slug failed to resolve — search would have IP-geolocated, refuse instead
{ "error": "location_resolution_failed", "reason": "Slug 'sf' redirected to /marketplace/category/search/ — use 'sanfrancisco' instead.", "suggested_slugs": ["sanfrancisco", "nyc", "la", "chicago", "austin", "boston", "seattle", "atlanta", "miami", "portland"] }

// Marketplace unavailable from the proxy's region
{ "error": "region_unavailable", "reason": "Marketplace is not available in this country.", "proxy_country": "RU" }

// Login wall hit on page 1 (rare — usually fires page 3+)
{ "error": "login_required_on_first_page", "reason": "Facebook served a logged-out splash instead of the marketplace feed. Use --context-id with a pre-authed Facebook session." }

// Vehicle search — vehicle sub-fields populated
{
  "listings": [
    {
      "listing_id": "...",
      "title": "2018 Ford F-150 · Lariat Pickup 4D 6 1/2 ft",
      "price": { "formatted": "$32,500", "amount": 32500.00, "currency": "USD", "minor_units": 3250000 },
      "vehicle": {
        "year": 2018, "make": "Ford", "model": "F-150",
        "trim": "Lariat",
        "body_style": "truck",
        "transmission": null,
        "exterior_color": null,
        "interior_color": null,
        "fuel_type": null,
        "title_status": null,
        "mileage": 84000
      }
    }
  ]
}

// Rental search — rental sub-fields populated
{
  "listings": [
    {
      "listing_id": "...",
      "title": "2 BR 1 BA · Apartment for Rent",
      "price": { "formatted": "$2,400/mo", "amount": 2400.00, "currency": "USD", "minor_units": 240000 },
      "rental": {
        "bedrooms": 2,
        "bathrooms": 1,
        "area_size_sqft": 850,
        "property_type": "apartment_condo",
        "private_room_bathroom_type": null,
        "is_furnished": false
      }
    }
  ]
}
```
