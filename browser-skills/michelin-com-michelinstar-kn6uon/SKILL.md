---
name: michelin-com-michelinstar-kn6uon
title: Michelin Star Restaurant Finder + Reservation Check
description: >-
  Find a Michelin-starred restaurant in a given city on guide.michelin.com and
  detect whether it has a reservation widget — Resy, Tock, SevenRooms,
  OpenTable, or TheFork — returning the partner identity and click-out / iframe
  URL. Read-only; stops at the booking surface.
website: michelin.com
category: restaurants
tags:
  - restaurants
  - michelin
  - reservations
  - dining
  - read-only
  - fine-dining
source: 'browserbase: agent-runtime 2026-05-22'
updated: '2026-05-22'
recommended_method: fetch
alternative_methods:
  - method: fetch
    rationale: >-
      guide.michelin.com is fully server-rendered and ships the booking-widget
      HTML (partner identity, click-out URL, iframe src) in the initial
      response. No auth, no JS, no anti-bot at the page level — browse cloud
      fetch returns 200 with the canonical HTML on the first hit.
  - method: browser
    rationale: >-
      Only required for two narrow cases: (a) capturing the SevenRooms iframe
      src that's JS-injected under #sr-res-root after the Book button is
      clicked, and (b) screenshotting the live TheFork iframe booking calendar.
      For pure widget detection + partner extraction, the browser path is ~100×
      slower and adds nothing.
verified: false
proxies: false
---
# Michelin Guide — Find a Starred Restaurant & Check Reservation Availability

## Purpose

Given a city, find a Michelin-starred restaurant (1 / 2 / 3-star) on
`guide.michelin.com`, open its detail page, and detect whether the restaurant
exposes a reservation widget — and which booking partner powers it
(Resy, Tock, SevenRooms, OpenTable, or TheFork). Returns the restaurant's
identity (name, stars, cuisine, address, restaurant ID) plus the reservation
surface (partner, widget type, click-out URL or embedded iframe src).

**Read-only — stops at the booking surface.** This skill detects and surfaces
the reservation widget; it never picks a time slot, fills the booking form,
or submits a reservation. If the prompt asks to "make a reservation," return
the widget URL plus the JSON envelope below and let a human or a dedicated
booking skill complete the transaction. Michelin Guide's widget is always a
click-out or an embed of a third-party booking system (Resy / Tock /
SevenRooms / TheFork / OpenTable); the actual booking flow happens on the
partner's domain, which has its own anti-bot (DataDome on TheFork; Akamai on
OpenTable) and is out of scope here.

## When to Use

- "Find a Michelin-starred restaurant in {city} and tell me if I can reserve."
- A planning agent scoring starred restaurants by reservability before
  surfacing recommendations.
- Routing to the correct booking partner — e.g., the user has a Resy account
  and only wants restaurants where Resy is the booking system.
- Auditing a city's starred-restaurant booking-partner mix
  (e.g., "what fraction of NYC 1-star restaurants are Resy vs. Tock?").
- Distinguishing "starred" from "Bib Gourmand" / "Selected" / "Plate" — the
  Michelin Guide's listing pages mix these distinctions if you don't filter
  the URL slug.

## Workflow

`guide.michelin.com` is fully server-rendered. Every listing page, every
restaurant detail page, and the reservation-widget HTML block all ship in the
initial HTML response — no JavaScript needed to read partner, restaurant ID,
or click-out URL. Lead with `browse cloud fetch`; the browser path exists only
to (a) interact with an embedded TheFork iframe or (b) trigger a SevenRooms
JS-rendered widget. **Neither `--proxies` nor `--verified` are required for
the Michelin Guide HTML surface itself.**

### 1. Resolve the city URL

The canonical pattern is:

```
https://guide.michelin.com/en/{country}/{region}/{city}/restaurants[/{distinction}]
```

- `{country}` — ISO 3166-1 alpha-2 lowercase (`us`, `gb`, `fr`, `jp`, `it`,
  `de`, `es`, `hk`, `sg`, `kr`, ...). **The country segment is mandatory on
  listing URLs.** Omitting it renders "Unfortunately there are no selected
  restaurants in the area you've searched for" plus a random fallback carousel.
- `{region}` — kebab-case state / region. US uses `new-york-state`,
  `california`, `illinois`, etc. France uses `ile-de-france`, `provence-alpes-cote-d-azur`.
- `{city}` — kebab-case city slug.
- `{distinction}` — optional star-tier filter. Allowed values:
  - `3-stars-michelin` — exactly three stars
  - `2-stars-michelin` — exactly two stars
  - `1-star-michelin` — exactly one star
  - `bib-gourmand` — NOT a star (Michelin's good-value distinction)
  - `the-plate-michelin` — NOT a star (Michelin's basic recommendation tier)
  - (omit) — every distinction tier mixed together

For known cities, build the URL directly:

| City | Listing URL prefix |
|---|---|
| New York | `https://guide.michelin.com/en/us/new-york-state/new-york/restaurants` |
| San Francisco | `https://guide.michelin.com/en/us/california/san-francisco/restaurants` |
| Chicago | `https://guide.michelin.com/en/us/illinois/chicago/restaurants` |
| Los Angeles | `https://guide.michelin.com/en/us/california/los-angeles/restaurants` |
| Paris | `https://guide.michelin.com/en/fr/ile-de-france/paris/restaurants` |
| London | `https://guide.michelin.com/en/gb/greater-london/london/restaurants` |
| Tokyo | `https://guide.michelin.com/en/jp/tokyo-region/tokyo/restaurants` |
| Hong Kong | `https://guide.michelin.com/en/hk/hong-kong-region/hong-kong/restaurants` |

For unknown cities, **resolve via the `?q=` 302**:

```bash
# Use --include-headers to read Location; do NOT auto-follow
browse cloud fetch "https://guide.michelin.com/en/restaurants?q=<URL-encoded-city>" \
  --include-headers > /tmp/lookup.json
# Read .headers.Location from the JSON — this is the canonical city URL
node -e 'console.log(JSON.parse(require("fs").readFileSync("/tmp/lookup.json","utf8")).headers.Location)'
```

If the response is a `302` with a `Location` header, that header is the
canonical city URL (e.g. `https://guide.michelin.com/en/us/california/san-francisco/restaurants`).
Append `/1-star-michelin` (or another distinction) to filter.

If the response is `200` (no redirect) and the body header contains
"Unfortunately there are no selected restaurants in the area you've searched
for," the Michelin Guide does not cover this city. Emit
`{ "success": false, "reason": "city_not_covered" }`.

### 2. Fetch the star-filtered list

```bash
browse cloud fetch \
  "https://guide.michelin.com/en/{country}/{region}/{city}/restaurants/1-star-michelin" \
  > /tmp/list.json
```

The response body is the rendered HTML. Parse restaurant cards:

- Detail-page URLs: `href="/en/{region}/{city}/restaurant/{slug}"` —
  **note the detail URL omits the country prefix** (`/en/new-york-state/new-york/restaurant/le-coucou`,
  NOT `/en/us/new-york-state/...`). That is a Michelin quirk; copy the slug
  verbatim from the listing-page anchor.
- Star tier per card: `data-distinction="ONE_STAR" | "TWO_STARS" | "THREE_STARS"`.
  **Filter to these three values only.** Restaurants in the carousel
  ("Discover the nearest restaurants" section near the bottom) include cards
  with `data-distinction="BIB_GOURMAND"` and others — those are fallback
  recommendations, not city-matched starred restaurants. Drop them.
- Restaurant name: inside the card, `<h3>` or `<h2>` with the linked text.
- Cuisine + price tier: a sibling block showing `$$$$ · French`.

Pick the first card whose `data-distinction` is `ONE_STAR | TWO_STARS | THREE_STARS`
(or filter further by user preference — e.g., cuisine).

### 3. Fetch the detail page

```bash
browse cloud fetch \
  "https://guide.michelin.com/en/{region}/{city}/restaurant/{slug}" \
  > /tmp/detail.json
```

Country code is **absent** in the canonical detail URL.

### 4. Detect the reservation widget

In the HTML body, search for the block:

```html
<div class="restaurant-details__booking--deliver-wrapper">  <!-- click-out kind -->
  ...
</div>
<!-- OR -->
<div class="restaurant-details__booking--reserve">  <!-- iframe kind -->
  ...
</div>
```

If neither container is present, the restaurant has **no reservation widget**
on Michelin Guide — emit `reservation.available = false`. Look for a phone
number, mailto link, or external website link in the detail-info block
(`<div class="data-sheet__block">`) as the contact-channel fallback.

If a container is present, find the element with class `js-restaurant-book-btn`
inside it. It will be one of three shapes:

| Element | Partner | Booking surface |
|---|---|---|
| `<a class="js-restaurant-book-btn" href="..." target="_blank">Book</a>` | Resy, Tock, OpenTable (varies) | Click-out URL in `href` |
| `<button id="sr-res-root" class="js-restaurant-book-btn">Book</button>` | SevenRooms | JS-rendered widget — no static URL; the SevenRooms SDK injects an iframe when the button is clicked |
| `<iframe class="js-restaurant-booking" src="https://module.thefork.com/{locale}/module/{partner_id}-{partner_hash}/{restaurant_id}-{restaurant_hash}">` | TheFork | Inline iframe; the booking flow happens inside it |

Both the anchor and the iframe carry these attributes — always parse them:

- `data-dtm-partner` — partner identifier (`resy`, `Tock`, `sevenrooms`,
  `thefork`, `opentable`). **Case is inconsistent** — `Tock` is capitalized
  in the wild, others are lowercase. Lowercase before comparing.
- `data-restaurant-booking` — partner display name (`Resy`, `Tock`,
  `SevenRooms`, `TheFork`, `OpenTable`).
- `data-restaurant-id` — Michelin's internal restaurant ID (numeric string,
  e.g. `510102`).
- `data-restaurant-name` — display name.
- `data-restaurant-distinction` — `1 star`, `2 star`, `3 star`,
  `bib gourmand`, `the plate`.
- `data-cooking-type` — numeric cuisine ID.

### 5. Emit the result envelope

Build the JSON in "Expected Output" below. **Stop here.** Do not click `Book`,
do not load the iframe in a session, do not navigate to the partner URL.

### Browser fallback (only when fetch is insufficient)

Use a browser session in these two cases only:

1. **SevenRooms widget** — the `Book` button is JS-rendered. To capture the
   actual SevenRooms widget URL or screenshot the booking form, open a
   session, navigate to the detail page, click `[ref] button: Book`, and wait
   for the SevenRooms iframe to mount. The widget's iframe gets injected
   under `#sr-res-root`; read its `src` with
   `browse eval "document.querySelector('#sr-res-root iframe').src"`. The
   `--verified --proxies` flags are NOT required on the Michelin side, but
   the SevenRooms iframe itself is its own surface — read-only there too.

2. **Inspecting the live TheFork iframe** — the iframe src
   (`https://module.thefork.com/en_GB/module/...-.../...-...`) loads in
   a session but renders behind a DataDome device-check iframe. Treat the
   iframe src as the canonical booking-widget URL and stop; do NOT interact
   with the iframe contents.

```bash
SID=$(browse cloud sessions create --keep-alive | node -e \
  "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$SID"
browse open "https://guide.michelin.com/en/{region}/{city}/restaurant/{slug}" --remote
browse wait load --remote && browse wait timeout 3000 --remote
browse snapshot --remote  # then inspect the Reserve a table section
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

For pure widget-detection and partner extraction, the browser path is ~100×
slower than fetch and adds no information — skip it.

## Site-Specific Gotchas

- **READ-ONLY.** Never click `Book`, never pick a time slot, never submit a
  booking form. This skill stops at the widget. If a downstream skill needs
  to actually reserve, hand off the widget URL + partner identifier.
- **The country-code prefix is mandatory on listing URLs but absent on detail
  URLs.** Listing: `/en/us/new-york-state/new-york/restaurants/1-star-michelin`.
  Detail: `/en/new-york-state/new-york/restaurant/le-coucou`. Mixing these up
  is the single most common failure mode. The Michelin canonical anchors on
  listing-page cards already omit the country code — just copy them.
- **Omitting the country segment silently fails.** `/en/new-york-state/new-york/restaurants/1-star-michelin`
  returns HTTP 200 with title `"new-york 1 Star MICHELIN Restaurants"` —
  looks valid — but the body contains "Unfortunately there are no selected
  restaurants in the area you've searched for" and a random fallback carousel
  of Mexican Bib Gourmand restaurants from Yucatán. Always verify against
  the breadcrumb: a valid page's breadcrumb is `[USA → New York State → New
  York Restaurants]`; the broken URL renders only `[new-york-state → new-york]`.
- **"Bib Gourmand" and "Selected / Plate" are NOT Michelin Stars.** Confirm
  via the URL slug (`/1-star-michelin`, `/2-stars-michelin`,
  `/3-stars-michelin`) AND each card's `data-distinction="ONE_STAR | TWO_STARS | THREE_STARS"`.
  An unfiltered listing URL (`/restaurants` without distinction suffix)
  returns the full mix.
- **The "nearest restaurants" carousel pollutes star-tier listings.** Every
  city/star listing page includes a `## Discover the nearest restaurants`
  carousel at the bottom with cards from elsewhere (often Mexico / Yucatán
  from a US-West sandbox IP). Those cards carry their own
  `data-distinction="BIB_GOURMAND"` etc. — they are not city-matched. Stop
  parsing cards once you hit the breadcrumb-or-footer `<section>` boundary,
  or filter to cards whose href starts with `/en/{region}/{city}/restaurant/`.
- **City discovery returns a 302, not a 200.** `/en/restaurants?q=<city>` ⇒
  HTTP 302 with `Location: https://guide.michelin.com/en/{country}/{region}/{city}/restaurants`.
  `browse cloud fetch` does NOT auto-follow — read the `headers.Location`
  field from the JSON envelope. (Bare unknown cities like an obscure town
  may not redirect at all; handle the 200 case as `city_not_covered`.)
- **Five known booking partners with three different DOM shapes.**
  - `<a class="js-restaurant-book-btn" href="<click-out-URL>" target="_blank">` —
    Resy (`href="https://resy.com/cities/{city-slug}/venues/{venue}?aff_id=0VKMelA"`),
    Tock (`href="https://www.exploretock.com/{venue}?utm_source=michelin"`),
    OpenTable. The `aff_id=0VKMelA` query param is Michelin's Resy affiliate
    code — pass it through; don't strip it.
  - `<button id="sr-res-root" class="js-restaurant-book-btn" data-dtm-partner="sevenrooms">` —
    SevenRooms. **There is no static href.** The button mounts a SevenRooms
    iframe widget inline only after click. Detection-only flows can stop here;
    flows that need the actual booking-form URL must use the browser fallback.
  - `<iframe class="js-restaurant-booking" src="https://module.thefork.com/...">` —
    TheFork. Inline iframe; the `src` IS the booking-widget URL.
- **`data-dtm-partner` case is inconsistent.** Observed: `resy` (lowercase),
  `Tock` (capitalized), `sevenrooms` (lowercase), `thefork` (lowercase).
  Lowercase before matching.
- **TheFork iframe has DataDome bot protection.** The iframe loads a
  `DataDome Device Check` sub-frame before the booking calendar renders. To
  interact with the booking calendar (not recommended for this skill), you'd
  need stealth + residential proxy on the iframe's origin (`thefork.com`),
  NOT on `guide.michelin.com`.
- **The detail-page description is sometimes paywalled.** A `Poool - Module
  d'accès au contenu bloqué` iframe overlays the editor's review with
  "Discover the entire MICHELIN Guide in one account / Create a free account."
  The structured data (name, address, cuisine, stars, booking widget,
  cooking-type ID) is all readable above the paywall — no login required for
  this skill.
- **Server-rendered HTML — no JS / no anti-bot at the page level.**
  `browse cloud fetch` (no `--proxies`, no `--verified`) returns the full
  HTML including the booking-widget block. CloudFront fronts the site but
  serves a 200 with the canonical HTML on the first hit. If a future request
  starts returning a CAPTCHA or 403, add `--proxies` — but as of this
  skill's authoring this is not required.
- **The Michelin search URL (`?q=`) handles natural-language city names well
  but not restaurant names.** `?q=le%20coucou` redirects to the broader
  `/en/restaurants` page, not the Le Coucou detail page. Use it only for
  city resolution, not restaurant lookup. For restaurant lookup, use the
  star-filtered list + name match.
- **Cuisine filter exists but lives at a separate slug, not a query param.**
  `/en/restaurants/french`, `/en/restaurants/japanese`, etc. are
  cross-geography cuisine filters and cannot be composed with city/distinction
  filters in the URL — the only composable filters are city + distinction.
  To filter starred restaurants in a city by cuisine, fetch the full city
  + star tier and post-filter on the parsed `cuisine` field per card.

## Expected Output

Five outcome shapes:

```json
// 1. Found starred restaurant + click-out widget (Resy / Tock / OpenTable)
{
  "success": true,
  "city": "New York",
  "restaurant": {
    "name": "Le Coucou",
    "stars": 1,
    "cuisine": "French",
    "price_tier": "$$$$",
    "address": "11 Howard Hotel, 138 Lafayette St., New York, NY, 10013, USA",
    "michelin_url": "https://guide.michelin.com/en/new-york-state/new-york/restaurant/le-coucou",
    "michelin_restaurant_id": "510102"
  },
  "reservation": {
    "available": true,
    "partner": "Resy",
    "partner_key": "resy",
    "widget_type": "click_out",
    "booking_url": "https://resy.com/cities/new-york-ny/venues/le-coucou?aff_id=0VKMelA"
  }
}

// 2. Found starred restaurant + TheFork iframe widget (Europe-typical)
{
  "success": true,
  "city": "Paris",
  "restaurant": { "name": "Auguste", "stars": 1, "cuisine": "Modern Cuisine", "michelin_url": "...", "michelin_restaurant_id": "..." },
  "reservation": {
    "available": true,
    "partner": "TheFork",
    "partner_key": "thefork",
    "widget_type": "iframe",
    "booking_url": "https://module.thefork.com/en_GB/module/26201-71faf/51207-c0b",
    "notes": "Inline iframe on the Michelin detail page. DataDome anti-bot guards the iframe's own origin."
  }
}

// 3. Found starred restaurant + SevenRooms JS-rendered widget
{
  "success": true,
  "city": "New York",
  "restaurant": { "name": "Gramercy Tavern", "stars": 1, ... },
  "reservation": {
    "available": true,
    "partner": "SevenRooms",
    "partner_key": "sevenrooms",
    "widget_type": "js_widget",
    "booking_url": null,
    "notes": "SevenRooms widget mounts an iframe under #sr-res-root after the Book button is clicked. No static URL; a browser session is required to surface the iframe src."
  }
}

// 4. Found starred restaurant but NO reservation widget on Michelin
{
  "success": true,
  "city": "Paris",
  "restaurant": { "name": "Arpège", "stars": 3, ... },
  "reservation": {
    "available": false,
    "partner": null,
    "partner_key": null,
    "widget_type": null,
    "booking_url": null,
    "notes": "Michelin Guide does not surface a booking partner for this restaurant. Check the detail-info block for phone/website fallback."
  }
}

// 5. City not covered by the Michelin Guide
{
  "success": false,
  "reason": "city_not_covered",
  "city": "Boise",
  "notes": "Michelin Guide does not publish a selection for this city. The /?q= search did not redirect to a city listing URL."
}
```
