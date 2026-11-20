---
name: cargurus-com-search-listings-3jv4hk
title: CarGurus Search Listings
description: >-
  Search CarGurus for vehicle listings across the full filter surface
  (make/model/trim, year/price/mileage range, condition, body, fuel, drivetrain,
  color, features, deal-rating, dealer rating, history, ZIP+radius) and return
  each listing's CarGurus IMV deal rating, dollar delta vs IMV, IMV midpoint,
  full vehicle/dealer detail, and canonical URL. Read-only.
website: cargurus.com
category: automotive
tags:
  - automotive
  - vehicle-listings
  - cargurus
  - imv-deal-rating
  - datadome
  - read-only
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: browser
alternative_methods:
  - method: browser
    rationale: >-
      CarGurus has no public API and IMV deal-rating data is proprietary and
      only computed in the rendered SRP loader. The modern /search route exposes
      the entire structured listing array
      (`window.__remixContext.state.loaderData['routes/($intl).search']`) as
      JSON inside the HTML and also at
      `/search?...&_data=routes/(%24intl).search` — but both require a warmed
      Browserbase session with --verified --proxies to clear DataDome. Direct
      curl/cloud-fetch returns DataDome 403.
  - method: url-param
    rationale: >-
      Every filter dimension in the UI maps 1:1 to a URL query parameter on
      /search (e.g. `makeModelTrimPaths=m7/d306`, `dealRatings=1,2`, `minPrice`,
      `maxPrice`, `srpVariation=NEW_CAR_SEARCH`). Hybrid path: build the URL
      deterministically, then drive the rendered page through the browser
      session to extract the loader JSON.
verified: true
proxies: true
---
# CarGurus Search Listings

## Purpose

Given a CarGurus search URL, a free-form `{condition} {make} {model} {location}` phrase, a make-only-near-ZIP query, or a direct VDP URL, return the active inventory as structured JSON — including each listing's **CarGurus IMV deal rating** (`GREAT_PRICE` / `GOOD_PRICE` / `FAIR_PRICE` / `POOR_PRICE` / `OVERPRICED` / `NA`), the **dollar delta vs IMV**, and the **IMV midpoint** (the headline differentiator). Covers new, used, and CPO inventory across every filter dimension the CarGurus filter rail exposes (40+ filter keys). Read-only — never click Contact Seller, Get Financing, Save, Sign In, or any mutation control.

## When to Use

- "Used Toyota RAV4 in Austin, TX" or any other natural-language `{condition} {make} {model} {location}` query.
- "Subaru near 94103" — make-only browse around a ZIP.
- A pasted CarGurus SRP URL like `https://www.cargurus.com/search?zip=78701&makeModelTrimPaths=m7/d306` — use as-is.
- A pasted VDP URL like `https://www.cargurus.com/details/{listingId}` — fetch single listing only.
- Bulk monitoring of deal-rating shifts (Great/Good only) on a saved filter set.
- Any flow that needs the CarGurus IMV deal-rating label + `priceData.differential` (dollars below IMV) per listing — this is the differentiator over Autotrader / Cars.com which don't expose deal scoring.

## Workflow

CarGurus has no public API and the IMV deal-rating data is proprietary and browser-only. **However**, the modern SRP at `/search` is a Remix app whose loader returns the entire structured result set (listings + filters + metadata) as JSON, both as `window.__remixContext.state.loaderData["routes/($intl).search"].search` inside the rendered HTML **and** via the Remix data-only route `/search?...&_data=routes/($intl).search`. Lead with scripted browsing through a Browserbase session with **`--verified --proxies` mandatory** (DataDome anti-bot is aggressive — bare sessions and many proxy IPs hit "Access is temporarily restricted" within seconds), then read the JSON directly. **Do not** parse the rendered card DOM — every field surfaced in the UI is already typed in the JSON, including deal rating, `priceData.differential`, IMV, distance, MPG, color, full feature list, dealer rating, etc.

### 1. Create a stealth + residential-proxy session

```bash
export BROWSERBASE_API_KEY="$BB_API_KEY"   # the CLI's expected name; BB_API_KEY is the host-injected source
SID=$(browse cloud sessions create --keep-alive --proxies --verified | jq -r .id)
export BROWSE_SESSION="$SID"
```

`--verified --proxies` is non-negotiable. The legacy `/Cars/inventorylisting/viewDetailsFilterViewInventoryListing.action?...` URL trips DataDome even with stealth+proxy. The modern `/search?...` route passes cleanly on the first hit.

### 2. Build the SRP URL

Base path: `https://www.cargurus.com/search?...`

Key URL parameters (full surface — every dimension the filter rail exposes maps to a URL param):

| Filter | URL key | Values / format |
|---|---|---|
| ZIP | `zip` | 5-digit string (e.g. `78701`). Overrides the IP-based default. Without `zip`, the session geolocates by the proxy's IP. |
| Radius (mi) | `distance` | `10`, `25`, `50`, `75`, `100`, `150`, `200`, `500`, `NATIONWIDE` |
| Sort | `sortType` + `sortDirection` | `BEST_MATCH`/ASC, `DEAL_SCORE`/ASC, `PRICE`/ASC or DESC, `MILEAGE`/ASC or DESC, `PROXIMITY`/ASC, `NEWEST_CAR_YEAR`/ASC or DESC, `AGE_IN_DAYS`/ASC (newest listings) or DESC (oldest) |
| Make / Model | `makeModelTrimPaths` | URL-encoded path: `m{makeId}` for make-only, `m{makeId}/d{modelId}` for model, `m{makeId}/d{modelId}/t{trimId}` for trim. Multi-select via repeated param. Slash must be `%2F`-encoded. Example: `m7%2Fd306` = Toyota RAV4. |
| New / Used / CPO | `srpVariation` + `newUsed` | **NEW**: append `srpVariation=NEW_CAR_SEARCH` (sets `newUsed=[1]` server-side). **USED**: omit `srpVariation` and default page; or `newUsed=2`. **CPO**: `newUsed=8` (mfr-certified) or `newUsed=9` (third-party); `newUsed=3` is a legacy shortcut that maps to `[8,9]`. Multi-select with comma. |
| Body style | `bodyTypeGroupIds` | Integer ID (e.g. `7` = SUV/Crossover). Multi-select with comma. |
| Drivetrain | `wheelSystems` | `FWD`, `RWD`, `AWD`, `FOUR_WD` |
| Transmission | `transmissionTypes` | `A` (automatic), `M` (manual), `CVT`, `DCT` |
| Fuel type | `fuelTypes` | `GASOLINE`, `DIESEL`, `HYBRID`, `BIODIESEL`, `ELECTRIC`, `FLEX_FUEL`, `HYDROGEN` (and `PHEV` via `IS_EV_OR_PHEV`) |
| Exterior color | `colors` | Normalized: `BLACK`, `WHITE`, `SILVER`, `GRAY`, `RED`, `BLUE`, `GREEN`, `YELLOW`, `ORANGE`, `BROWN`, `GOLD`, `PURPLE`, `OFF_WHITE`, `OTHER` |
| Interior color | `interiorColors` | Same normalized set as `colors` |
| Price (USD) | `minPrice`, `maxPrice` | Integer dollars |
| Mileage | `minMileage`, `maxMileage` | Integer miles |
| Year | `startYear`, `endYear` | Four-digit year |
| Engine | `enginePaths` | Hierarchical (e.g. cylinder/displacement); inspect `filters.ENGINE_HIERARCHY.filters` for valid values per make |
| Doors | `doors` | `2`, `3`, `4`, `5` |
| Seats | `numberOfSeats` | `2`, `4`, `5`, `6`, `7`, `8`, `9` |
| Features | `installedOptionIds` | Integer IDs from `filters.VEHICLE_OPTION.filters` (Apple CarPlay, Android Auto, Adaptive Cruise, Blind Spot, Heated Seats, Sunroof, 3rd-row, Navigation, Tow Package, Backup Camera, Parking Sensors, Premium Audio, etc.). Multi-select with comma. |
| Deal rating | `dealRatings` | `1` Great, `2` Good, `5` Fair, `7` High, `8` Overpriced, `4` No Analysis, `6` Uncertain. Multi-select with comma. To request only Great+Good, use `dealRatings=1,2`. |
| Days on market | `minDaysOnMarket`, `maxDaysOnMarket` | Integer days |
| Dealer rating | `averageDealerRatings` | Integer 1-5 (minimum stars) |
| Seller type | `sellerHierarchyTypes` | `FRANCHISE_DEALER`, `INDEPENDENT_DEALER`, `PRIVATE_SELLER` |
| Vehicle history | `vehicleHistoryOptions` | e.g. `CLEAN_TITLE`, `NO_ACCIDENTS`, `PERSONAL_USE`, `NO_FRAME_DAMAGE`. Single-owner has its own boolean `hideMultipleOwners=true`. |
| Single owner | `hideMultipleOwners` | `true` to enforce single-owner |
| Hide accidents | `maxAccidents` | `0` to hide reported accidents |
| Hide frame damage | `hideFrameDamaged` | `true` |
| Hide salvage | `hideSalvage` | `true` |
| Hide lemon | `hideLemon` | `true` |
| Hide theft | `hideTheft` | `true` |
| Hide fleet | `hideFleet` | `true` |
| Online financing | `hasFinancing` | `true` |
| Digital deal | `digitalDealOnly` | `true` |
| Buy-online type | `buyOnlineTypes` | `HOME_DELIVERY`, `VIRTUAL_APPOINTMENT`, etc. |
| Recent price drops | `priceDropsOnly` | `true` |
| Safety rating (NHTSA) | `safetyRatings` | `3`, `4`, `5` (overall stars) |
| Hide-without-photos | `hideWithoutPhotos` | `true` |
| EV battery range | `minEvBatteryRange`, `maxEvBatteryRange` | Integer miles |
| Pagination | `page` | 1-indexed. `pageNumber=N` is silently ignored — must be `page=N`. |

**Discovering make / model / trim / engine / feature IDs at runtime.** Hit the SRP once with no filters and read `loaderData["routes/($intl).search"].search.filters`. Every filter object exposes its `filterCriteriaKey` (the URL param name) and a `filters[]` array of `{name, label, value, count, isPopular, availableCount}`. For cascading filters (`MAKE_MODEL` → `MODEL` → `TRIM`), the parent's `filters[]` carries nested `filters[]` for the child level. Don't hardcode IDs — they change as CarGurus adds models. Persist a per-make cache after first discovery if hitting the same make repeatedly.

### 3. Navigate and extract the loader JSON

```bash
URL="https://www.cargurus.com/search?zip=78701&makeModelTrimPaths=m7%2Fd306&dealRatings=1,2&sortType=DEAL_SCORE&sortDirection=ASC"
browse open "$URL" --remote --session "$SID"
browse wait load --remote --session "$SID"
browse wait timeout 2500 --remote --session "$SID"   # IMV badges render after `load`
```

Two equivalent ways to get the JSON:

**A. Read the embedded loader state (preferred — one HTTP round-trip, single-page nav):**

```bash
browse eval "JSON.stringify(window.__remixContext.state.loaderData['routes/(\$intl).search'])" \
  --remote --session "$SID"
```

**B. Hit the Remix data-only route (preferred when paginating — skips HTML render):**

```bash
browse eval "fetch('https://www.cargurus.com/search?zip=78701&makeModelTrimPaths=m7/d306&_data=routes/(%24intl).search', {headers: {'accept': 'application/json'}}).then(r => r.json()).then(j => JSON.stringify(j))" \
  --remote --session "$SID"
```

The `_data=routes/($intl).search` route (note the literal `($intl)` segment — `$intl` URL-encoded to `%24intl`) returns the same shape as the embedded state but as a clean JSON response. It must be invoked from a warmed Browserbase session — direct cookieless `curl` or `browse cloud fetch` returns DataDome 403.

### 4. Decode the listing tiles

`data.search.tiles` is an array of `{type, data}` objects. Listings have `type` starting with `LISTING_` — `LISTING_USED_PRIORITY`, `LISTING_USED_FEATURED`, `LISTING_USED_STANDARD`, `LISTING_NEW_*`, `LISTING_CPO_*`. Non-listing tiles include `MERCH_DEALERSHIP_MODE`, `MERCH_SMC`, etc. — skip them. Filter with:

```js
const listings = data.search.tiles
  .filter(t => t.type && t.type.startsWith('LISTING'))
  .map(t => t.data);
```

Key fields per listing:

- `id` — integer listing ID. VDP URL = `https://www.cargurus.com/details/{id}`.
- `vin` — 17-char VIN (always present on modern listings; older private-seller listings may omit).
- `condition` — `NEW` / `USED` / `CPO`. `isCpo`, `isNew` booleans for convenience. `cpoTier` (1-9 integer) when CPO.
- `dealRating` — `GREAT_PRICE` / `GOOD_PRICE` / `FAIR_PRICE` / `POOR_PRICE` / `OVERPRICED` / `NA` / `OUTLIER`. **This is the headline IMV signal.**
- `dealScore` — float; CarGurus' internal best-deal ranking score. Used by `sortType=DEAL_SCORE`.
- `priceData.current` — listing price (numeric, USD).
- `priceData.totalPrice` — current price + dealer fees.
- `priceData.expected` — **IMV midpoint** (the model-level expected price).
- `priceData.differential` — **dollars BELOW IMV** (positive = listed below IMV = better deal). For `GREAT_PRICE`/`GOOD_PRICE`, this is positive; for `POOR_PRICE`/`OVERPRICED`, negative.
- `priceData.localizedPrice`, `localizedTotalPrice`, `localizedDifferential` — pre-formatted strings (`"$34,991"`, `"$1,001"`).
- `priceData.msrp` — manufacturer's suggested retail price (when known).
- `imvPrice` — same as `priceData.expected`, duplicated at the top level.
- `daysOnMarket`, `distance` (miles, float).
- `exteriorColorData.{name, localized, normalized}`, `interiorColorData.*` — normalized values map to the `colors`/`interiorColors` URL filter.
- `mileageData.{value, unit}`, `localizedMileage`.
- `localizedTransmission`, `localizedDrivetrain`, `localizedEngineName`, `localizedDoors`.
- `fuelData.{cityEconomy, highwayEconomy, combinedEconomy, localizedCombinedEconomy, localizedType, unit}`. EV-specific data is in `evBatteryData`.
- `pictureData.{url, height, width}` — primary photo. Note: only the primary is in SRP; full gallery requires hitting the VDP loader (step 7).
- `ontologyData.{makeId, makeName, modelId, modelName, carYear, trimName, bodyTypeGroupId, bodyTypeName, entityId}`.
- `listingTitle` — pre-formatted `"{year} {make} {model} {trim}"`.
- `safetyRating` — NHTSA overall, as a string `"1"`-`"5"` or `"Not Rated"`.
- `sellerData.{serviceProviderName, city, displayLocation, region, postalCode, sellerId, isFranchiseDealer, franchiseMake, salesStatus, logoUrl, localizedPhoneNumber, googleStaticMapUrl}`. The dealer's CarGurus rating is **not** on the listing record — it must be sourced from `loaderData[...].search.dealerRatings` (when present) or `data.dealerReviewSummary` on the VDP loader.
- `vehicleFeatures` — array of human-readable feature strings (`"Sunroof/Moonroof"`, `"Adaptive Cruise Control"`, `"Apple CarPlay"`, etc.).
- `stockNumber`, `listingSource`, `buyingOption` (`CONVERT`, `PICKUP_ONLY`, etc.), `howToShop`.

### 5. Pagination

`data.search.pageNumber` / `pageCount` / `totalListings` give the pagination state. To fetch page N, append `&page=N` to the SRP URL (default page size is 24 listing tiles; ad/merch tiles are interleaved so 22-23 listing tiles is typical per page). Hit each page via the `_data=...` route to skip the HTML cost on subsequent pages.

```bash
for p in 1 2 3; do
  browse eval "fetch('https://www.cargurus.com/search?zip=78701&makeModelTrimPaths=m7/d306&page=${p}&_data=routes/(%24intl).search', {headers: {'accept': 'application/json'}}).then(r => r.json()).then(j => JSON.stringify(j.search.tiles.filter(t => t.type && t.type.startsWith('LISTING')).map(t => t.data.id)))" \
    --remote --session "$SID"
done
```

Critical: `pageNumber=N` (the older legacy param name) is silently ignored. Use `page=N`.

### 6. Distinguish search vs VDP input

- If input is a **VDP URL** (`/details/{id}`), open it directly and read `loaderData["routes/($intl).details.$listingId"].data` instead — keys are `{listing, seller, cpoAuthority}`. The `listing` object has the same priceData/dealRating shape plus full `pictures[]` gallery, full `options[]`, `vehicleHistory.{accidents, owners, fleet, lemon}`, `webLinks`, `description`, etc. Wrap the single listing in the same output shape with `total: 1`.
- If input is a **free-form phrase**, parse it into `{condition?, make, model?, location/zip}`, look up `makeId` / `modelId` via the unfiltered SRP filters tree (step 2 discovery), build the URL, and proceed from step 3.

### 7. Release session

```bash
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

## Site-Specific Gotchas

- **`--verified --proxies` is mandatory.** A bare or stealth-only session loads the homepage but the SRP and any deep filter URL trips DataDome ("Access is temporarily restricted. We detected unusual activity from your device or network. ID: ..."). Verified browser + residential proxy lets the modern `/search` route through; the older datacenter proxy regions still get blocked on some IP rotations.
- **Use `/search?...` — NOT `/Cars/inventorylisting/viewDetailsFilterViewInventoryListing.action?...`.** The legacy `.action` URL is the historical CarGurus SRP and is now aggressively DataDome-gated even with verified+proxy. The modern Remix-based `/search` page passes cleanly and exposes identical filters via the URL-param map documented in step 2.
- **Pagination param is `page=N`, NOT `pageNumber=N`.** `pageNumber=2` is silently accepted by the URL but ignored by the loader (`appliedFilterCriteria.pageNumber` remains `1`). `page=2` works. This is the #1 way to think you're harvesting pages 1-N when you're actually fetching page 1 N times.
- **The Remix data route exists and is the cheap path: `/search?...&_data=routes/(%24intl).search`.** Same query params as the HTML route, returns just the JSON loader payload. Must be called from a warmed Browserbase session — direct curl returns DataDome 403. Pagination via this route is ~5× cheaper than re-rendering the HTML SRP per page.
- **`window.__remixContext.state.loaderData["routes/($intl).search"]` carries the full structured result set already** — listings (in `search.tiles`), filter definitions with their URL-key mapping (`search.filters[K].filterCriteriaKey`), pagination (`search.pageNumber`, `pageCount`, `totalListings`), applied criteria (`search.appliedFilterCriteria`), sort options (top-level `sortOptions`). Don't parse the DOM cards — every UI field is already typed in the JSON.
- **Deal-rating enum is `GREAT_PRICE` / `GOOD_PRICE` / `FAIR_PRICE` / `POOR_PRICE` / `OVERPRICED` / `NA` / `OUTLIER`.** The UI labels them "Great Deal / Good Deal / Fair Deal / High Price / Overpriced / No Price Analysis / Uncertain". Don't confuse `POOR_PRICE` ("High Price") with `OVERPRICED` — they're distinct CarGurus tiers. Filter URL values are integers: `1, 2, 5, 7, 8, 4, 6` respectively (mapping is in `filters.DEAL_RATING.filters[]`).
- **`priceData.differential` sign convention.** Positive = listed BELOW IMV (good for the buyer); negative = listed ABOVE IMV. The localized string `localizedDifferential` is unsigned — read the numeric `differential` for the sign.
- **`priceData.expected` IS the IMV midpoint.** Same value as the top-level `imvPrice` field on each listing — they're duplicated for convenience. Prefer `priceData.expected`.
- **The `entityId` in `appliedFilterCriteria` is derived, not user-supplied.** When you pass `makeModelTrimPaths=m7/d306`, the server sets `entityId: "d306"` (the deepest segment). When you pass make-only `makeModelTrimPaths=m7`, `entityId: "m7"`. Don't set `entityId` yourself — it gets overwritten.
- **Condition encoding is non-obvious.** New = `1` (only applied via `srpVariation=NEW_CAR_SEARCH`), Used = `2`, Manufacturer Certified = `8`, Third-Party Certified = `9`. The CPO toggle is `newUsed=3` (a server-side alias that maps to `[8,9]`). Just `newUsed=1` without `srpVariation=NEW_CAR_SEARCH` is silently dropped — the New-cars mode is a separate SRP variation, not a plain filter value.
- **Make/model IDs are stable and cacheable.** From iter-1 capture (2026-05-19): Toyota=`m7`, Ford=`m2`, Chevrolet=`m1`, Honda=`m6`, Nissan=`m12`, Tesla=`m112`, RAM=`m191`, Genesis=`m203`, Polestar=`m260`, Rivian=`m243`, Lucid=`m274`, VinFast=`m279`. Toyota models: RAV4=`d306`, RAV4 Hybrid=`d2318`, Camry=`d292`, Corolla=`d295`, Tacoma=`d311`, Tundra=`d313`, 4Runner=`d290`, Highlander=`d298`, Sienna=`d308`, Corolla Cross=`d3154`. **Do NOT assume an ID is a specific vehicle without confirming via the filters tree** — `d2169` looks RAV4-shaped but is actually Ford Victoria; the make-prefix (`m7/d306` vs `m2/d2169`) is what disambiguates. Always discover via `filters.MAKE_MODEL.filters[make].filters[model]` on an unfiltered SRP fetch.
- **`makeModelTrimPaths` slash must be `%2F`-encoded.** `makeModelTrimPaths=m7/d306` works in a browser URL bar (the browser encodes it) but if you build the URL programmatically you need `m7%2Fd306` or it gets reinterpreted as a path segment by some intermediate proxies.
- **ZIP geolocation defaults to proxy IP.** With Browserbase residential proxy, the default zip lands on the proxy's region (e.g. `Boardman, OR` for a us-west-2 IP). Always pass `zip=<target>` explicitly — without it, every search secretly geo-scopes to the proxy region.
- **`/Cars/l-Used-{Make}-{Model}-d{modelId}` is a SECONDARY entry that ignores the URL slug.** The model slug (`Toyota-RAV4`) is decoration only — the trailing `d{modelId}` is what selects the vehicle. `/Cars/l-Used-Toyota-RAV4-d2169` returns FORD VICTORIA listings because `d2169` is Ford Victoria, not RAV4. Prefer `/search?makeModelTrimPaths=m{makeId}/d{modelId}` which validates both make and model.
- **VDP URLs without `{listingId}` 404.** `/Cars/l-Used-Toyota-RAV4` (no `-d306`) returns "Page Not Found". The model ID is required.
- **Sponsored tiles are mixed into `search.tiles`.** Tile types `LISTING_USED_PRIORITY` and `LISTING_USED_FEATURED` are dealer-paid placements; `LISTING_USED_STANDARD` is organic. Filter by `data.inclusionType === "DEFAULT"` to drop sponsored, or `data.debugInfo` contains `Paid Dealer: true` for paid sponsorships. Same in CPO and NEW: `LISTING_CPO_FEATURED`, `LISTING_NEW_FEATURED` etc. exist.
- **Dealer CarGurus star rating is NOT on the listing record.** `sellerData` has `serviceProviderName`/`city`/`isFranchiseDealer` but no rating. Either (a) keep dealer ratings out of the per-listing output and surface them as a separate dealer-rating join (hit the VDP loader and read `dealerReviewSummary.{averageRating, reviewCount}`), or (b) use the `averageDealerRatings=<N>` URL filter to constrain results to dealers meeting a minimum and accept that the per-listing record won't carry the exact rating.
- **`shopByTypes: ["NEAR_BY"]` vs `["MIX"]`.** When `isDeliveryEnabled=true` (default), the SRP shows both local pickup-only and nationwide-delivery listings — `shopByTypes: "MIX"`. To restrict to local-pickup-only, the URL toggle is `isDeliveryEnabled=false`. Note: the in-page UI calls this "Include delivery listings?" — and unchecking it adds a different "Only show listings in {state}?" toggle that maps to a separate `restrictToState` param.
- **`buyingOption: "CONVERT"` vs `"PICK_UP_ONLY"`.** Listings marked `CONVERT` support digital retailing (home delivery, online financing); `PICK_UP_ONLY` is dealer-lot only.
- **`localizedDifferential` is unsigned; `differential` is signed.** Don't display localizedDifferential alone — it's `"$1,001"` for both `+$1,001 below IMV` and `-$1,001 above IMV`. Pair it with `dealRating` for direction.
- **Read-only — never click any of: Save this listing, Get Financing, Contact Seller, Check Availability, Sign In, Schedule Test Drive, Submit Offer, "Search now" promo bar.** These are mutation / lead-gen controls.
- **`browse cloud sessions create --advanced-stealth` is NOT a valid flag for browse v0.7.2** — use `--verified --proxies`. `--advanced-stealth` shows up in older Browserbase docs but the unified `browse` CLI uses `--verified`.
- **DataDome ID surfaces on every blocked page.** When you see `"Access is temporarily restricted ... ID: <uuid>"`, the page IP is on DataDome's bot blacklist for that region. Releasing and re-creating the session usually rotates to a different proxy IP and unblocks. If two consecutive creates land on the same blocked range, fall back to the homepage warmup pattern: `browse open https://www.cargurus.com/` first, `wait timeout 2000`, *then* open the `/search?...` URL — the DataDome challenge clears more reliably with a homepage referer.

## Expected Output

```json
{
  "input": {
    "type": "search",
    "rawUrl": "https://www.cargurus.com/search?zip=78701&makeModelTrimPaths=m7/d306&dealRatings=1,2",
    "parsedFilters": {
      "zip": "78701",
      "distance": 50,
      "makeModelTrimPaths": ["m7/d306"],
      "dealRatings": ["GREAT_PRICE", "GOOD_PRICE"]
    }
  },
  "total": 237,
  "pageNumber": 1,
  "pageCount": 10,
  "appliedFilterCriteria": {
    "zip": "78701",
    "geoLocation": {"lat": 30.2672, "lon": -97.7423},
    "sortType": "DEAL_SCORE",
    "sortDirection": "ASC",
    "distance": 50,
    "makeModelTrimPaths": ["m7/d306"],
    "newUsed": [2, 8, 9]
  },
  "listings": [
    {
      "listingId": 448262888,
      "vin": "2T3C1RFV3RW314283",
      "stockNumber": "RW314283",
      "title": "2024 Toyota RAV4 XLE Premium FWD",
      "year": 2024,
      "make": "Toyota",
      "model": "RAV4",
      "trim": "XLE Premium FWD",
      "bodyType": "SUV / Crossover",
      "condition": "CPO",
      "isNew": false,
      "isCpo": true,
      "cpoTier": 8,
      "dealRating": "GOOD_PRICE",
      "dealRatingLabel": "Good Deal",
      "dealScore": 1.7100415,
      "price": {
        "current": 34991,
        "totalPrice": 35141,
        "msrp": null,
        "differential": 1001,
        "imvMidpoint": 35992,
        "currency": "USD",
        "localizedPrice": "$34,991",
        "localizedTotalPrice": "$35,141",
        "localizedDifferential": "$1,001"
      },
      "mileage": {"value": 8983, "unit": "MILES", "localized": "8,983"},
      "exteriorColor": {"name": "Blueprint", "normalized": "BLUE"},
      "interiorColor": {"name": "Ash", "normalized": "UNKNOWN"},
      "transmission": "8-Speed Automatic",
      "drivetrain": "Front-Wheel Drive",
      "engine": "2.5L I4",
      "doors": 4,
      "fuelEconomy": {"city": 27, "highway": 35, "combined": 30.6, "unit": "MPG", "fuelType": "Gasoline"},
      "evBatteryData": {},
      "safetyRating": "5",
      "daysOnMarket": 2,
      "distance": 19.66,
      "primaryPhoto": "https://static.cargurus.com/images/forsale/2026/05/16/05/06/2024_toyota_rav4-pic-6825659055108426229-1024x768.jpeg",
      "additionalPhotos": [],
      "features": ["Sunroof/Moonroof", "XLE Package", "Adaptive Cruise Control", "Alloy Wheels", "Bluetooth", "Backup Camera", "Blind Spot Monitoring"],
      "vehicleHistory": {"singleOwner": null, "noAccidents": null, "personalUse": null, "cleanTitle": null, "noFrameDamage": null},
      "dealer": {
        "name": "Toyota of Cedar Park",
        "sellerId": 1413002,
        "city": "Leander",
        "region": "TX",
        "postalCode": "78641",
        "displayLocation": "Leander, TX",
        "isFranchiseDealer": true,
        "franchiseMake": "Toyota",
        "phone": "(737) 371-9607",
        "logoUrl": "https://static.cargurus.com/images/site/2025/01/10/12/25/toyota_of_cedar_park-pic-7041458852690285288-200x200.jpeg",
        "rating": null,
        "reviewCount": null
      },
      "sponsored": false,
      "inclusionType": "DEFAULT",
      "buyingOption": "CONVERT",
      "listingUrl": "https://www.cargurus.com/details/448262888"
    }
  ]
}
```

For a direct VDP URL input, the same shape is returned with `total: 1` and `listings: [{...full record with additionalPhotos[] populated from the VDP loader's data.listing.pictures[] array...}]`. Listings without a price-analysis (`dealRating: "NA"`) have `price.differential: null` and `price.imvMidpoint: null` — these are typically out-of-market vintage or rare vehicles where CarGurus has insufficient comps. `vehicleHistory` fields are `null` on the SRP record and only populated when the VDP loader is hit (`data.listing.vehicleHistory.*` carries the booleans).
