---
name: zillow-com-extract-listings-zw43tv
title: Zillow Filtered Listing Extraction
description: >-
  Search Zillow for-sale listings with the full filter surface (property type,
  price, beds/baths, sqft, lot size, year built, days-on-market, amenities, HOA,
  monthly payment) by constructing a searchQueryState URL and parsing the
  embedded __NEXT_DATA__ JSON. Read-only.
website: zillow.com
category: real-estate
tags:
  - real-estate
  - listings
  - zillow
  - search
  - scraping
  - json-api
source: 'browserbase: agent-runtime 2026-06-04'
updated: '2026-06-04'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      Rendering the SRP in a real browser (even with --verified --proxies
      stealth) triggers the PerimeterX 'Press & Hold' captcha, and Zillow's SRP
      DOM is too large for reliable a11y snapshotting. Use only as a last
      resort; the data still lives in the page's __NEXT_DATA__ script if you can
      get past the wall.
  - method: api
    rationale: >-
      Zillow's internal GetSearchPageState.htm / async-create-search-page-state
      JSON endpoints exist but return 404/403 on plain GETs without internal
      x-caller-id/referer headers — confirmed not usable from outside. Parse
      __NEXT_DATA__ from the SRP HTML instead.
verified: false
proxies: true
---
# Zillow Filtered Listing Extraction

## Purpose

Search Zillow for for-sale properties matching an arbitrarily complex query and
return the active listings as structured JSON, plus the region-wide total and
pagination state. The skill supports Zillow's **full filter surface** (property
type, listing status, price, beds, baths, square footage, lot size, year built,
days on market, amenities, HOA fee, monthly payment) by constructing a
`searchQueryState` URL so filtering happens **server-side** — never fetch
unfiltered results and post-filter. It is strictly **read-only**: it reads the
search results page (SRP), never clicks Save, Tour, Contact agent, or any
mutation control.

## When to Use

- "Find condos OR townhouses in Austin, TX between $300k and $700k with 2+ beds."
- "List single-family homes in 30307 with a pool and a garage under $900k."
- "What lots/land of 1–10 acres are for sale near Boulder, CO?"
- "Show new-construction homes in the Mission, San Francisco."
- "Get foreclosures / pre-foreclosures / auctions in a ZIP."
- "Pull every for-sale listing matching this Zillow search URL and return the
  structured data (zpid, price, beds, baths, address, detail URL, photo, …)."
- Any time a caller hands you a location (city+state, ZIP, neighborhood,
  free-form region, or a full Zillow URL) plus a set of filters and wants the
  matching listings as data.

## Workflow

**Recommended method: `fetch` (HTTP only — no browser).** Zillow's SRP is a
Next.js page that embeds the *entire* search result set as JSON in a
`<script id="__NEXT_DATA__">` tag. `browse cloud fetch <url> --proxies` returns
HTTP 200 with that HTML; you parse the JSON out of it with a code/parse step. A
headless **browser** navigation to the same URL instead hits a PerimeterX
captcha (see Gotchas) — so do **not** drive the SRP with a browser.

> Residential proxies (`--proxies`) are **mandatory** — datacenter IPs get
> blocked. No login, cookies, or API key is required.

### Step 1 — Resolve the location to a Zillow region

Skip this step if the caller gave you a full Zillow search URL — reuse its
embedded `queryState` directly (Step 2 just augments `filterState`).

Otherwise fetch the resolver URL (works for city+state, ZIP, neighborhood, and
free-form regions — slugify spaces/commas to hyphens):

```
browse cloud fetch "https://www.zillow.com/homes/<QUERY>_rb/" --proxies
```
Examples of `<QUERY>`: `Austin-TX`, `30307`, `Capitol-Hill-Seattle-WA`,
`Boulder-CO`, `Mission-San-Francisco-CA`.

Parse `__NEXT_DATA__` (the JSON inside `<script id="__NEXT_DATA__">`) and read:
- `props.pageProps.searchPageState.queryState.regionSelection` → `[{regionId, regionType}]`
- `props.pageProps.searchPageState.queryState.mapBounds` → `{west,east,south,north}`

`regionType` codes observed: **2**=state, **4**=county, **6**=city, **7**=ZIP,
**8**=neighborhood. Keep BOTH `regionSelection` and `mapBounds` — pass them both
through to Step 2.

### Step 2 — Build the `searchQueryState` with your filters

```jsonc
{
  "isMapVisible": false,
  "isListVisible": true,
  "mapBounds": { /* from Step 1 */ },
  "regionSelection": [ /* from Step 1 */ ],
  "filterState": { /* mapped filters — see schema below */ },
  "pagination": { "currentPage": 1 }
}
```

**`filterState` schema (LONG-key form — verified working).** Use these keys, NOT
the deprecated short aliases (`con`, `mp`, `lau`, …) from Zillow's old
querystring format. Range filters are `{min,max}` (use `null` for an open end);
boolean/amenity filters are `{value:bool}`; choice filters are `{value:"…"}`.

| Dimension | filterState key(s) | Shape / notes |
|---|---|---|
| Property type (multi-select) | `isSingleFamily`, `isCondo`, `isTownhouse`, `isMultiFamily`, `isApartment`, `isManufactured`, `isLotLand` | `{value:bool}`. Set the chosen types **true** and the rest **false**. Zillow auto-couples condo+apartment via `isApartmentOrCondo` (it appears in the echoed state — don't set it yourself). |
| Listing status (for-sale, default) | `isForSaleByAgent`, `isForSaleByOwner` (FSBO), `isNewConstruction`, `isForSaleForeclosure`, `isAuction`, `isComingSoon` | `{value:bool}`, all default **true**. To restrict to one status, set it true and the others false. |
| Other statuses | `isPreMarketForeclosure`, `isPreMarketPreForeclosure`, `isPendingListingsSelected` (pending), `isAcceptingBackupOffersSelected`, `isRecentlySold` (sold), `isOpenHousesOnly` | `{value:bool}` |
| Price (USD) | `price` | `{min,max}` |
| Beds | `beds` | `{min,max}`. Exact N → `{min:N,max:N}` |
| Baths (full+half) | `baths` | `{min,max}`. Accepts halves, e.g. `{min:1.5}` |
| Interior sqft | `sqft` | `{min,max}` |
| Lot size | `lotSize` | `{min,max,units:"sqft"\|"acres"}`. Values are in the chosen unit. (1 acre = 43,560 sqft.) |
| Year built | `built` | `{min,max}` |
| Days on market | `doz` | `{value:"1"\|"7"\|"14"\|"30"\|"90"\|"6m"\|"12m"\|"24m"\|"36m"\|"any"}` |
| HOA fee (max monthly) | `hoa` + `includeHomesWithNoHoaData` | `hoa:{min,max}`, `includeHomesWithNoHoaData:{value:bool}` |
| Monthly payment (max) | `monthlyPayment` + cost inputs | `monthlyPayment:{min,max}`; tune the estimate with `monthlyCostDownPayment`, `monthlyCostLoanTerm`, `monthlyCostInterestRate`, `monthlyCostCreditScore` |
| Single story | `singleStory` | `{value:true}` |
| Garage | `hasGarage` (or `parkingSpots:{min}`) | `{value:true}` |
| Pool | `hasPool` | `{value:true}` |
| A/C | `hasAirConditioning` | `{value:true}` |
| Basement | `hasBasement` / `isBasementFinished` / `isBasementUnfinished` | `{value:true}` |
| Waterfront | `isWaterfront` | `{value:true}` |
| Accessible | `hasDisabledAccess` | `{value:true}` |
| 55+ community | `ageRestricted55Plus` | `{value:true}` |
| Keywords (free text) | `keywords` | `{value:"..."}` — best-effort match against listing text |
| Sort | `sortSelection` | `{value:"globalrelevanceex"}` (default). Others: `days`, `pricea` (low→high), `pricedd` (high→low), `lot`, `size`, `beds`. |

> **In-unit laundry has no for-sale filter on Zillow** — `onlyRentalInUnitLaundry`
> is a *rental-only* filter and is ignored for for-sale searches. If a caller
> asks for it, return matching listings and note it can't be filtered server-side.

### Step 3 — Fetch the filtered SRP and parse

URL-encode the `searchQueryState` JSON and fetch:

```
browse cloud fetch "https://www.zillow.com/homes/<QUERY>_rb/?searchQueryState=<URL-ENCODED-JSON>" --proxies
```

Parse `__NEXT_DATA__` and read:
- `props.pageProps.searchPageState.cat1.searchResults.listResults` → matching listings (≈41 per page)
- `props.pageProps.searchPageState.categoryTotals.cat1.totalResultCount` → region-wide total
- `props.pageProps.searchPageState.queryState.filterState` → the filters **the server actually applied** (echoed back; confirm your filters survived — Zillow silently drops malformed keys)

### Step 4 — Map each `listResult` → output

Read fields from the row `r` and `r.hdpData.homeInfo`:

| Output field | Source |
|---|---|
| `zpid` | `r.zpid` |
| `price` / `unformattedPrice` | `r.price` (formatted) / `r.unformattedPrice` |
| `beds`, `baths` | `r.beds`, `r.baths` (baths includes halves, e.g. `2.5`) |
| `livingAreaSqft` | `r.area` (or `homeInfo.livingArea`) |
| `lotSize` | `{value: homeInfo.lotAreaValue, unit: homeInfo.lotAreaUnit}` (unit is per-listing: `acres` or `sqft`) |
| `address` | `r.addressStreet` / `r.addressCity` / `r.addressState` / `r.addressZipcode` |
| `propertyType` | `homeInfo.homeType` (e.g. `SINGLE_FAMILY`, `CONDO`, `TOWNHOUSE`, `LOT`) |
| `listingStatus` | `r.statusType` (`FOR_SALE`, `PENDING`, `SOLD`, …) + `r.statusText` |
| `daysOnZillow` | `homeInfo.daysOnZillow` |
| `zestimate` | `r.zestimate` (present on only ~10% of SRP rows; else `null`) |
| `taxAssessedValue` | `homeInfo.taxAssessedValue` (when present) |
| `hoaFee`, `monthlyPayment` | **Not in SRP rows → `null`.** The filters still apply server-side, but the per-listing HOA/payment values live only on the detail page. |
| `primaryPhoto` | `r.imgSrc` |
| `detailUrl` | `r.detailUrl` (canonical `.../homedetails/.../<zpid>_zpid/`) |

### Step 5 — Pagination

Each page returns ≈41 `listResults`. Estimate `totalPages ≈ ceil(totalResultCount / 41)`.
To page, set `pagination.currentPage = N` (N≥2) in the `searchQueryState` and
re-fetch Step 3. **Zillow hard-caps the SRP at ~20 pages (~820 listings)**
regardless of how large `totalResultCount` is — when `totalResultCount` exceeds
what you can page through, report the returned set as a partial slice (narrow the
filters or split the region to capture the rest).

### Browser fallback (last resort — usually blocked)

If you must use a browser: `browse open "<filtered URL>" --remote` with a
`--verified --proxies` stealth session. Expect the PerimeterX "Press & Hold"
captcha (see Gotchas). If you get past it, the same `__NEXT_DATA__` JSON is in
the page — `browse get text "script#__NEXT_DATA__"` may truncate, and
`browse snapshot` fails on the huge DOM, so the fetch path above is strongly
preferred.

## Site-Specific Gotchas

- **`--proxies` (residential) is mandatory.** Without it the fetch returns a
  PerimeterX `px-captcha` page instead of listing data.
- **The browser-rendering path is captcha-walled.** A real headless navigation
  to the SRP hits PerimeterX's "Press & Hold" challenge **even with
  `--verified --proxies`** (confirmed during testing — see screenshot). The
  lightweight `browse cloud fetch --proxies` HTTP path is *not* challenged, which
  is exactly why `recommended_method` is `fetch`, not `browser`.
- **Don't use the JSON endpoints.** `https://www.zillow.com/search/GetSearchPageState.htm?searchQueryState=…`
  and `async-create-search-page-state` return **404/403** on plain GETs (they
  need internal `x-caller-id`/referer headers). Confirmed dead end — parse
  `__NEXT_DATA__` from the SRP HTML instead. Don't waste time on them.
- **Use LONG filter keys** (`isCondo`, `monthlyPayment`, `hasPool`). The short
  legacy aliases (`con`, `mp`, `lau`) belong to a deprecated querystring format
  and are ignored by the current Next.js searchQueryState.
- **Always read back `queryState.filterState` from the response.** Zillow
  silently drops malformed/unknown filter keys, so confirm your filters were
  actually applied (the `totalResultCount` should drop versus unfiltered).
- **`isApartmentOrCondo` is auto-managed.** Setting `isCondo`/`isApartment`
  causes Zillow to also echo `isApartmentOrCondo` — don't fight it.
- **`browse get text "script#__NEXT_DATA__"` truncates** large payloads, and
  `browse snapshot` fails on the SRP's 3,600+ a11y nodes — neither is a viable
  extraction path. Fetch the HTML and parse it as a string.
- **The inner browse-only agent is a poor fit for this task.** It can only run
  `browse` subcommands (no shell/parser), so it can't cleanly extract listings
  from the 1.4 MB SRP payload — extraction needs a real code/parse step. The
  HTTP fast path itself is fully verified; build it with a parser, not a
  click-through agent.
- **Per-listing `lotAreaUnit` varies** (`acres` for larger lots, `sqft` for
  smaller) — always read the unit alongside the value, don't assume.
- **HOA fee and monthly payment are filterable but not echoed per-listing** on
  the SRP; report them as `null` unless you also load each detail page.
- **`_rb` resolver slug** accepts almost any location text; `Mission-San-Francisco-CA`
  and `30307` both resolve. If a slug resolves to the wrong region, fall back to
  the bare `https://www.zillow.com/homes/_rb/?searchQueryState=…` form and rely
  on `regionSelection`/`mapBounds` from a prior resolve.

## Expected Output

```json
{
  "success": true,
  "query": {
    "location": "Austin, TX",
    "regionSelection": [{ "regionId": 10221, "regionType": 6 }],
    "appliedFilterState": {
      "isCondo": { "value": true },
      "isTownhouse": { "value": true },
      "price": { "min": 300000, "max": 700000 },
      "beds": { "min": 2, "max": null },
      "baths": { "min": 2, "max": null }
    }
  },
  "totalResultCount": 590,
  "returnedCount": 41,
  "currentPage": 1,
  "totalPages": 15,
  "resultsArePartial": true,
  "listings": [
    {
      "zpid": "29377187",
      "price": "$595,500",
      "unformattedPrice": 595500,
      "beds": 3,
      "baths": 3,
      "livingAreaSqft": 2259,
      "lotSize": { "value": 6046.128, "unit": "sqft" },
      "address": {
        "street": "13109 Sinton Ln",
        "city": "Austin",
        "state": "TX",
        "zip": "78729"
      },
      "propertyType": "CONDO",
      "listingStatus": "FOR_SALE",
      "statusText": "Active",
      "daysOnZillow": 7,
      "zestimate": null,
      "taxAssessedValue": 440680,
      "hoaFee": null,
      "monthlyPayment": null,
      "primaryPhoto": "https://photos.zillowstatic.com/fp/433057efa69a13194bca68f2417e6465-p_e.jpg",
      "detailUrl": "https://www.zillow.com/homedetails/13109-Sinton-Ln-Austin-TX-78729/29377187_zpid/"
    }
  ]
}
```

Listing with a Zestimate present (≈10% of SRP rows) and a lot measured in acres:

```json
{
  "zpid": "29371835",
  "price": "$899,000",
  "unformattedPrice": 899000,
  "beds": 4,
  "baths": 2,
  "livingAreaSqft": 1837,
  "lotSize": { "value": 0.254, "unit": "acres" },
  "address": { "street": "11809 Charing Cross Rd", "city": "Austin", "state": "TX", "zip": "78759" },
  "propertyType": "SINGLE_FAMILY",
  "listingStatus": "FOR_SALE",
  "statusText": "Active",
  "daysOnZillow": 5,
  "zestimate": 872100,
  "hoaFee": null,
  "monthlyPayment": null,
  "primaryPhoto": "https://photos.zillowstatic.com/fp/…-p_e.jpg",
  "detailUrl": "https://www.zillow.com/homedetails/…/29371835_zpid/"
}
```

Blocked / anti-bot outcome (browser path, or fetch without proxies):

```json
{
  "success": false,
  "error_reasoning": "PerimeterX 'Press & Hold' captcha returned instead of listing data. Retry with browse cloud fetch + --proxies (residential); do not use a rendered browser session.",
  "totalResultCount": null,
  "listings": []
}
```
