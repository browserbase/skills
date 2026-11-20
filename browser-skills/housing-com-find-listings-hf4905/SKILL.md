---
name: housing-com-find-listings-hf4905
title: Housing.com Find Listings
description: >-
  Search Housing.com for property listings in an Indian city (rent or buy),
  returning each listing's title, BHK, sqft, locality, price, furnishing,
  posted-by, verification badges, updated time, and canonical detail URL.
website: housing.com
category: real-estate
tags:
  - real-estate
  - india
  - rentals
  - listings
  - akamai
  - read-only
source: 'browserbase: agent-runtime 2026-05-21'
updated: '2026-05-21'
recommended_method: browser
alternative_methods:
  - method: fetch
    rationale: >-
      browse cloud fetch returns 406 Not Acceptable for every housing.com URL
      even with --proxies — Akamai blocks at TLS-fingerprint + JS-challenge
      layer. Don't use.
  - method: api
    rationale: >-
      GraphQL endpoint at mightyzeus-mum.housing.com/api/gql exposes metadata
      APIs (CITY_LIST_API, CHECK_PAGE_DATA, FETCH_FLAT_COUNT, GET_BULK_SERP_URL,
      TYPE_AHEAD_API) but no listings-search operation. SERP listings are
      server-rendered into the initial HTML and only reachable via a stealth
      browser session driven through the homepage typeahead flow.
verified: true
proxies: true
---
# Housing.com Find Listings

## Purpose

Given an Indian city (and optional intent: `rent` or `buy`, optional BHK / property-type / furnishing / owner-only filters), return a structured list of property listings from housing.com — listing ID, title, BHK count, sqft, locality, society/project, price (₹), furnishing, posted-by (Owner vs agent), verification badges, "X ago" updated time, and the canonical listing detail URL. Read-only — never clicks "Contact", "Post Property", or any form-submit action.

## When to Use

- Daily / weekly monitoring of new rental or resale listings in an Indian city.
- Bulk extraction of listings across BHK / locality / owner-vs-agent filters.
- Anywhere you need to compare price-per-sqft or new-listing velocity for an Indian metro on housing.com.

## Workflow

Housing.com is fronted by **Akamai Bot Manager**. The public HTML API path is blocked at the edge (`browse cloud fetch` returns 406 even with residential proxies; GraphQL endpoints under `mightyzeus-mum.housing.com/api/gql` are also gated). A **stealth + residential-proxy browser session** is mandatory, AND **direct navigation to deep SERP URLs is blocked even on warmed sessions** — Akamai issues a "Security Alert / Request Blocked" interstitial unless you arrive at the SERP through the homepage typeahead flow.

The only reliable working pattern: homepage → click intent tab (BUY / RENT) → click search textbox → type city → wait for typeahead dropdown → click the `CITY` listitem → click "Search" button (or press Enter). Listings are server-rendered into the DOM as anchors with structured slugs encoding BHK / sqft / property type / locality / listing ID, so DOM-only extraction (no network capture) is sufficient.

### 1. Stealth + residential-proxy session

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$SID"
```

Both `--verified` (stealth Chromium fingerprint) and `--proxies` are required. A bare session is served the Security Alert page on any housing.com URL.

### 2. Warm cookies on the homepage

```bash
browse open "https://housing.com/" --remote --session "$SID"
browse wait load --remote --session "$SID"
browse wait timeout 3000 --remote --session "$SID"
```

The `wait timeout 3000` after `wait load` is necessary — Akamai's `bm_sz` / `_abck` cookies and the `BUY/RENT/COMMERCIAL/PG/PLOTS` hero-nav refs settle ~1–2s after the load event.

### 3. Snapshot to discover refs (they change per page load)

```bash
browse snapshot --remote --session "$SID"
```

Find these four refs in the snapshot tree — they are inside the hero `navigation` element:
- `link: BUY`, `link: RENT`, `link: COMMERCIAL`, `link: PG/CO-LIVING`, `link: PLOTS` — five intent tabs. RENT is the default state of the search hero on the homepage.
- `textbox: Search for locality, landmark, project, or builder` — the city/locality input.
- `button: Search` — submits to the SERP.

The ref numbers shift per page load, so always re-snapshot before the click sequence.

### 4. Click intent → type city → select typeahead → submit

```bash
# Click intent tab (RENT in this example — use BUY for resale, etc.)
browse click @<RENT_REF> --remote --session "$SID"
browse wait timeout 1500 --remote --session "$SID"

# Click textbox, type city name
browse click @<TEXTBOX_REF> --remote --session "$SID"
browse wait timeout 1000 --remote --session "$SID"
browse type "Bangalore" --remote --session "$SID"
browse wait timeout 2500 --remote --session "$SID"      # dropdown render is async
```

Re-snapshot. The dropdown is a `list` with `listitem` rows. **Pick the row whose category badge is `CITY` (not `LOCALITY`, `PROJECT`, `HOSPITAL`, `BUS STATION`, etc.)** — it's the first row that says `<CityName>, <StateName>`:

```
[listitem]
  [StaticText: Bangalore, Karnataka]
  [StaticText: CITY] [|] [StaticText: BENGALURU]
```

```bash
browse click @<CITY_LISTITEM_REF> --remote --session "$SID"
browse wait timeout 1200 --remote --session "$SID"

# Submit — re-snapshot first since the listitem click rebuilds the tree
browse snapshot --remote --session "$SID"
browse click @<SEARCH_BUTTON_REF> --remote --session "$SID"
# Or equivalently: browse press Enter --remote --session "$SID"

browse wait load --remote --session "$SID"
browse wait timeout 3500 --remote --session "$SID"
browse get url --remote --session "$SID"
browse get title --remote --session "$SID"
```

The SERP URL pattern after submit:
- **Rent**: `https://housing.com/rent/flats-for-rent-in-{city}-{state}-P{polygonId}` (e.g. Bangalore→Karnataka = `P38f9yfbk7p3m2h1f`; Pune→Maharashtra = `P2r4v3l939lxd541t`). The `P{polygonId}` token is the region lock — discovered per-city by housing.com's geocoder, **not stable** across cities, **not guessable** from the city name.
- **Buy**: `https://housing.com/in/buy/{city}/` (no polygon token in URL, but page rendering is still gated to a warm session).

Title format: `Flats for Rent in <City> | <N>+ Rental Flats in <City>` for rent; `Flats in <City> | <N>+ <City> Flats for Sale` for buy. Extract the `<N>` integer as `total_results`.

### 5. Extract listings from DOM

Listings are server-rendered as anchors with detail-page URLs that encode every field in the slug. **No network capture is needed.** Run inside a `browse eval` block:

```js
(() => {
  const url = window.location.href;
  const isRent = /\/rent\//.test(url);
  // Rent detail anchors:  /rent/{id}-{sqft}-sqft-{bhk}-(bhk|rk|r)-{type}-on-rent-in-{locality}-{city}
  // Buy  detail anchors:  /in/buy/resale/page/{id}-{bhk}-bhk-{type}-in-{locality}-for-rs-{priceRs}
  const selector = isRent
    ? 'a[href*="-sqft-"][href*="on-rent-in-"]'
    : 'a[href*="/in/buy/resale/page/"]';
  const anchors = Array.from(document.querySelectorAll(selector));
  const seen = new Set();
  const items = [];
  for (const a of anchors) {
    if (seen.has(a.href)) continue;
    seen.add(a.href);
    // Walk up to the card container (the nearest ancestor whose textContent contains ₹)
    let card = a;
    for (let i = 0; i < 10 && card; i++) {
      card = card.parentElement;
      if (card && /₹\s*[\d,.]+/.test(card.textContent)) break;
    }
    const text = card ? (card.innerText || card.textContent).replace(/\s+/g, ' ').trim() : '';
    const rentM = a.href.match(/\/rent\/(\d+)-(\d+)-sqft-(\d+(?:\.\d+)?)-(bhk|rk|r)-([a-z_]+)-on-rent-in-([a-z-]+)/i);
    const buyM  = a.href.match(/\/buy\/resale\/page\/(\d+)-(\d+(?:\.\d+)?)-(bhk|rk|r)-([a-z_]+)-in-([a-z-]+)-for-rs-(\d+)/i);
    const m = rentM || buyM;
    const priceTxt = (text.match(/₹\s*[\d,]+(?:\.\d+)?\s*(?:Cr|Crore|Lac|Lakh|L|K)?/) || [])[0];
    const sqftM   = text.match(/(\d+)\s*sq\.ft/);
    const furnM   = text.match(/(Fully furnished|Semi furnished|Unfurnished)/i);
    const updated = (text.match(/(\d+)\s*([dhwmy])\s*ago/) || [])[0];
    items.push({
      url: a.href,
      title: a.textContent.trim().slice(0, 200),
      id: m && m[1],
      bhk: m && parseFloat(rentM ? rentM[3] : buyM[2]),
      bhk_unit: m && (rentM ? rentM[4] : buyM[3]),       // 'bhk' | 'rk' | 'r'
      property_type: m && (rentM ? rentM[5] : buyM[4]),  // apartment | independent_house | independent_floor | villa | ...
      locality_slug: m && (rentM ? rentM[6] : buyM[5]),
      price_text: priceTxt || null,                      // rent: '₹30,000' / buy: '₹2.1 Cr'
      price_rs: buyM ? parseInt(buyM[6]) : null,         // exact integer rupees (buy only — encoded in URL)
      sqft: sqftM ? parseInt(sqftM[1]) : null,
      furnishing: furnM ? furnM[1] : null,               // rent only — buy listings don't surface this in card
      updated: updated || null,                          // '2w ago', '1d ago', '5h ago'
      verified: /Verified/.test(text),
      no_brokerage: /No Brokerage/.test(text),
      posted_by_owner: /\bOwner\b/.test(text) && !/Property Owner\?/.test(text),
    });
  }
  return items;
})()
```

Yields ~30 listings per page. Card-level text walking is needed because the anchor `textContent` only carries the title — price / sqft / furnishing / "Owner" / "Verified" badges live in sibling DOM nodes.

### 6. Pagination

The SERP carries `?page=N` links at the bottom. **Direct `browse open` to `?page=2` is BLOCKED** (returns Security Alert and burns the session — even on a warm session that just successfully rendered page 1). Pagination must be done via **in-page click** on the existing pagination anchor:

```bash
browse eval "(() => {
  const links = [...document.querySelectorAll('a[href*=\"page=2\"]')];
  if (!links.length) return null;
  const el = links[links.length - 1];   // bottom-of-page pagination, not in-list duplicates
  el.scrollIntoView();
  el.click();
  return el.href;
})()" --remote --session "$SID"
browse wait load --remote --session "$SID"
browse wait timeout 3000 --remote --session "$SID"
```

Verify with `browse get url` and `browse get title` — title still reads `Flats for Rent in <City> …`, URL ends `?page=N`. Verify with `Showing 31 - 60 of 23,799` text in the body for page 2.

### 7. Filters (optional, in-page click only)

The SERP renders filter anchors as static `<a>` links you can read off the DOM. **Same constraint as pagination: in-page click only, no direct `browse open`.**

| Filter category | URL slug pattern (rent SERP) | Codes |
|---|---|---|
| BHK | `/rent/{prefix}-flats-for-rent-in-{city}-{state}-C{N}P{polygonId}` | bitmask: `C1`=1RK, `C2`=1BHK, `C4`=2BHK, `C8`=3BHK; sum for combinations (e.g. `C6` = 1BHK+2BHK) |
| Listed by | `/rent/withoutbrokerage-flats-for-rent-in-{city}-{state}-D2P{polygonId}` | `D2` = Owner only (no broker) |
| Furnishing | `/rent/{prefix}-flats-for-rent-in-{city}-{state}-G{N}P{polygonId}` | `G1` = Fully, `G2` = Semi, `G4` = Unfurnished |
| Property type | `/rent/{prefix}-for-rent-in-{city}-{state}-M{N}P{polygonId}` | `M1` = Apartment, `M2` = Independent House, `M4` = Independent Floor |

The URL-slug prefix (e.g. `1bhk-flats`, `withoutbrokerage-flats`, `furnished-flats`, `apartments`) is rewritten by the page when filters apply. Multiple filter codes can stack (e.g. `C2D2P38f9yfbk7p3m2h1f` = 1BHK + owner-only). For the agent harvesting the listings, the safest approach is to read these filter `href`s off the DOM after the initial SERP render and click them in-page; do not try to construct them yourself and then `browse open` — that will trip Akamai.

### 8. Release session

```bash
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

## Site-Specific Gotchas

- **READ-ONLY.** Never click "Contact", "Post Property FREE", "Login", "+ Add" (saved searches), or any form-submit element. Stay on the SERP / listing detail pages.
- **Akamai Bot Manager.** Without `--verified --proxies`, every URL returns `Security Alert / Request Blocked` (block reference ID + real client IP printed on the interstitial). `--verified` is the critical flag; `--proxies` provides an additional residential IP layer that further reduces the rate of stale-fingerprint blocks.
- **Direct deep-URL navigation is blocked even on warm sessions.** Confirmed across multiple runs: `browse open https://housing.com/rent/flats-for-rent-in-bangalore-karnataka-P38f9yfbk7p3m2h1f` on a cold OR warm session → `Security Alert`. Same for `/in/buy/flats-for-sale-in-bangalore-karnataka-...`, `/in/buy/mumbai/?page=2`, and `/rent/.../P...?page=2`. **Always navigate via homepage → typeahead → search-button click for the first SERP, then in-page anchor clicks for filters and pagination.**
- **`browse cloud fetch` returns 406 Not Acceptable** for every housing.com URL — proxies don't help. The `Edge-Cache-Tag` header shows Akamai recognizes the request as bot-class and refuses on the basis of TLS fingerprint + missing JS challenge cookies. **Don't waste time on the fetch path.**
- **GraphQL `mightyzeus-mum.housing.com/api/gql?apiName=…` exists but has no listings endpoint.** Discovered names from a real SERP load: `CITY_LIST_API`, `CITY_URLS_LIST`, `CHECK_PAGE_DATA`, `FETCH_FLAT_COUNT`, `GET_BULK_SERP_URL`, `SEO_API`, `TYPE_AHEAD_API`, `GET_MEGA_MENU`, `GET_FOOTER_HOMEPAGE`, `GET_EDGE_ORDER_TYPES`, `HOME_FETCH_DYNAMIC_CARDS`. None return individual listings — the SERP renders listings server-side and embeds them into the initial HTML. Don't try GraphQL.
- **Akamai poisons the session on a bad request.** A single failed direct nav (e.g. `browse open …?page=2`) typically returns the session to the Security Alert state, and even `browse back` to the previously-good URL stays on Security Alert. **If the session goes Security Alert, release it and start a new one — re-warming the same session usually doesn't recover.**
- **Listings are server-rendered into the initial HTML.** `window.__INITIAL_STATE__` contains `cookies / shell / seo / meta / appState / favorites / feed / ...` keys but **no `serpListings` or `properties` array** — the listings live only in the DOM. Pure DOM extraction via the snippet in step 5 is the canonical path.
- **`document.title` carries the total count.** Format: `Flats for Rent in <City> | <N>+ Rental Flats in <City>` (rent) or `Flats in <City> | <N>+ <City> Flats for Sale` (buy). Parse the `<N>+` integer; this is the most reliable total — the in-card `Showing X - Y of Z` text exists but renders ~1s after `wait load` and `Z` is comma-formatted (`23,799`).
- **Polygon IDs (`P…`) are per-city, opaque, and not in any sitemap.** Bangalore-Karnataka = `P38f9yfbk7p3m2h1f`, Pune-Maharashtra = `P2r4v3l939lxd541t`. Discover them by completing the typeahead+search flow once per city and persisting the resulting SERP URL to a local cache; they're stable across days.
- **Bangalore is named "Bengaluru" on the SERP** (and in listing slugs like `Bengaluru`). The typeahead accepts either; the dropdown row reads `Bangalore, Karnataka` with the secondary badge `CITY | BENGALURU`.
- **Listing detail slug encodes BHK as `bhk` / `rk` / `r`.** `1-bhk`, `1-rk` (1-room kitchen — studio-equivalent), `1-r` (1-room with no kitchen — bedsit). The `r` and `rk` units count as 1 BHK for arithmetic but are distinct property classes on housing.com.
- **Rent prices are per-month in ₹** (no `/month` suffix in the slug or card text — implied). Buy prices in the slug are in **absolute rupees** (e.g. `for-rs-21000000` = ₹2.1 Cr); the card-text formatted price uses Lakh/Crore. Always prefer `price_rs` from the buy slug for arithmetic.
- **`Showing 31 - 60 of N` confirms 30 listings per SERP page** (Bangalore returned 28-34 anchors per page including some duplicate gallery / video preview overlays — dedupe by `href`). Total pages = `ceil(N / 30)`.
- **"Continue last search" can hijack the homepage.** If the user has a saved search cookie (visible after one prior SERP visit), the homepage `BUY` tab pre-fills `Bangalore` and the textbox click skips the empty state. The typeahead flow still works, but the dropdown opens immediately when you click the textbox. Re-snapshot before clicking listitems — the refs are different from a virgin session.
- **The `+ Add` button next to the city name on a SERP** opens a multi-city add-city flyout — **don't click it** during read-only extraction.
- **Cold sessions don't trip immediately on the homepage** — `https://housing.com/` itself loads cleanly with no Security Alert. The blocking happens on the *next* deep URL navigation if it didn't originate from a UI interaction.

## Expected Output

```json
{
  "success": true,
  "city": "Bengaluru",
  "intent": "rent",
  "serp_url": "https://housing.com/rent/flats-for-rent-in-bangalore-karnataka-P38f9yfbk7p3m2h1f",
  "polygon_id": "P38f9yfbk7p3m2h1f",
  "total_results": 21561,
  "page": 1,
  "listings_per_page": 30,
  "listings": [
    {
      "id": "19064977",
      "title": "1 BHK Flat for rent in ITI Employees Housing Colony, Dooravani Nagar",
      "bhk": 1,
      "bhk_unit": "bhk",
      "property_type": "apartment",
      "locality_slug": "dooravani-nagar-bengaluru",
      "price_text": "₹25,000",
      "price_rs": null,
      "sqft": 1000,
      "furnishing": "Semi furnished",
      "updated": "2w ago",
      "verified": true,
      "no_brokerage": false,
      "posted_by_owner": false,
      "url": "https://housing.com/rent/19064977-1000-sqft-1-bhk-apartment-on-rent-in-dooravani-nagar-bengaluru"
    }
  ]
}
```

For a buy SERP, `intent: "buy"`, `serp_url` ends `/in/buy/{city}/`, `polygon_id` is `null` (buy URLs don't carry it), and each listing has `price_rs` populated from the URL slug (`for-rs-21000000` → `21000000`) plus a `price_text` like `"₹2.1 Cr"` from the card:

```json
{
  "id": "19915286",
  "title": "2 BHK Flat in Chandivali, Powai",
  "bhk": 2,
  "property_type": "apartment",
  "locality_slug": "powai",
  "price_text": "₹2.1 Cr",
  "price_rs": 21000000,
  "sqft": 1050,
  "url": "https://housing.com/in/buy/resale/page/19915286-2-bhk-apartment-in-powai-for-rs-21000000"
}
```

Failure modes:

```json
// Session blocked by Akamai (cold session OR direct deep-URL nav OR session got poisoned)
{ "success": false, "reason": "akamai_blocked", "block_reference_id": "0.ccd02e17.1779372652.dfeb8700", "real_client_ip": "52.41.230.44" }

// Typeahead returned no CITY-tier match for the input string
{ "success": false, "reason": "city_not_found", "input": "Atlantis" }

// SERP rendered but zero listings (rare — usually means a hyper-narrow filter combo)
{ "success": true, "city": "Bengaluru", "intent": "rent", "total_results": 0, "listings": [] }
```
