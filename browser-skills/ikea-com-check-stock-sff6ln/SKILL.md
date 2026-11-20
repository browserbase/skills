---
name: ikea-com-check-stock-sff6ln
title: IKEA Stock Check
description: >-
  Given an IKEA article number or product URL and a target market (US, GB, DE,
  …), return per-store stock state, units available, click-and-collect /
  home-delivery flags, last-checked timestamp, and discontinued / sold-out /
  online-only notices. Read-only.
website: ikea.com
category: retail
tags:
  - retail
  - inventory
  - stock-check
  - ikea
  - furniture
  - read-only
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: api
alternative_methods:
  - method: api
    rationale: >-
      The same JSON the in-page 'Pickup & delivery' modal renders from is served
      pre-hydrated by the public
      `lower-funnel-fragments/product-availability/?itemNo={n}&inline` endpoint
      — no auth, no cookies. `browse cloud fetch --proxies` is the cheapest
      reliable path (verified US/GB/DE, 200 OK with full per-store stock
      payload).
  - method: browser
    rationale: >-
      Use when the caller needs human-readable store names + addresses +
      distances rendered next to stock state (the fragment endpoint returns
      numeric `buCode`s only), or when `cma.ingka.com` is unreachable for
      header-authenticated store-roster resolution. Verified + residential proxy
      mandatory; never click Add-to-Cart / Sign-In / Reserve controls.
  - method: hybrid
    rationale: >-
      Production-grade: fetch availability JSON via the fragment endpoint
      (single HTTP call, ~50 KB), then resolve `buCode → {name, city, address,
      lat, lon}` once per market via a cached call to
      `cma.ingka.com/cma/stores/v1/{ru}/{lc}` with the publicly-embedded
      `X-Client-Id: GnJEuqjAnY3vEeZQvaoCudpJewgGq00D` header. Caching the store
      roster eliminates the per-request CMA call.
verified: false
proxies: true
---
# IKEA Stock Check

## Purpose

Given an IKEA article number (e.g. `505.220.40` or the URL-form `50522040`) or a full product URL, plus a target market (`us`/`gb`/`de`/`se`/...), return the product's per-store stock state at every IKEA store in that market, along with product name, product-type label, current price in the market's currency, online-sale availability, click-and-collect / home-delivery availability, last-checked timestamp, and any "discontinued" / "sold-out" / "only-sold-in-store" flags. Read-only; never adds to cart or shopping list and never signs in.

## When to Use

- "Is the BILLY bookcase (505.220.40) in stock at the IKEA Brooklyn store?"
- Pre-trip inventory check across every store in a market for a list of articles.
- Distinguishing "out of stock right now" from "discontinued" from "online-only" from "sold-out across this market".
- Comparing in-store stock vs. home-delivery availability for a planned purchase.
- Read-only stock auditing across a market.

## Workflow

The stock data agents have been told to scrape from the modal DOM is actually served pre-rendered, as a single JSON blob, by the public **product-availability fragment endpoint** — no auth, no cookies, no anti-bot session needed. The fragment is the same one the live product page hydrates from, so its data is identical to what the "Pickup & delivery" / "Check stock" modal shows. A Verified+proxy Browserbase fetch (or a residential-IP HTTP GET) is sufficient. The browser-driven flow is only needed when you want store-name resolution (see Site-Specific Gotchas) without paying for the separate Ingka CMA API call.

### 1. Normalize inputs

- **Article number**: strip dots from the user-facing form. `505.220.40` → `50522040`. Always pad to 8 digits (leading zero if needed). Combination articles ("SPR") use an `s` prefix in product-page URLs (`s89581509`) but the availability fragment wants the bare numeric `89581509`.
- **Product URL → article**: the article number is the trailing numeric component of the slug. `https://www.ikea.com/us/en/p/billy-bookcase-white-50522040/` → `50522040`.
- **Market** → `{ru}/{lc}` pair (two lowercase letters each, joined as path segments). Common: `us/en`, `gb/en`, `de/de`, `se/sv`, `fr/fr`, `it/it`, `es/es`, `nl/nl`, `pl/pl`, `ca/en` (also `ca/fr`), `au/en`, `jp/ja`. When in doubt, open `https://www.ikea.com/` (which serves a market picker) and read the canonical `ru`/`lc` pair from the redirect.

### 2. Fetch the availability fragment

```bash
URL="https://www.ikea.com/${RU}/${LC}/lower-funnel-fragments/product-availability/?itemNo=${ITEMNO}&inline"

browse cloud fetch "$URL" --proxies --allow-redirects --output avail.html
```

`browse cloud fetch --proxies` is the cheapest reliable path (HTTP-only, no WebSocket — works even from network-restricted sandboxes). Plain `curl` from a residential IP also works; from a datacenter IP IKEA sometimes serves the "Hej! Welcome to IKEA Global" landing page (a soft 500) instead of the fragment — see Site-Specific Gotchas.

### 3. Parse the embedded JSON

The HTML response contains exactly one `<script>` tag (no `type=` attribute) whose body is a JSON object with four top-level keys: `product`, `availabilityResponse`, `t` (localized strings), `config` (per-market API client keys).

```python
import re, json
data = open("avail.html").read()
payload = re.search(r"<script[^>]*>(.+?)</script>", data, re.S).group(1)
j = json.loads(payload)
product = j["product"]
av      = j["availabilityResponse"]["availability"]   # may be {} if not sold in this market
config  = j["config"]                                  # apiCountry, cmaApiClientKey, ciaApiClientKey, gmak, ...
```

### 4. Map to the output schema

- **Product**: `product.itemNo` (numeric), `product.visibleItemNo` (dotted), `product.name`, `product.typeName` (lowercased "bookcase", "sofa", "Bücherregal"…), `product.currencyCode`, `product.price` (number, market currency).
- **Global flags**: `av.isOnlineSellable`, `av.isOnlySoldInStore`, `av.isSoldOut` (sold out across the market), `av.isSoldOutOnline`, `av.isCurrentlyNotSoldOnline`, `av.isDiscontinued`, `av.maxQuantity`.
- **Last-checked timestamp**: `av.lastCheckedDateTime.{formattedDate, formattedTime}` — formatted in the market's locale; the underlying epoch is not exposed.
- **Per-store** (`av.stores` is a `{buCode: storeRecord}` dict, ~30–100 entries per market):
  - `storeId` — IKEA `buCode` (3- or 4-digit string). This is **all you get for store identity from this endpoint** — no name, city, address, lat/lon. See Site-Specific Gotchas for resolution paths.
  - `stockStatus` — one of `HIGH_IN_STOCK` (≈ "In stock"), `MEDIUM_IN_STOCK`, `LOW_IN_STOCK` (≈ "Low in stock"), `OUT_OF_STOCK`. **`stockStatus` is omitted entirely** on stores outside cash-and-carry / home-delivery range for this product (interpret as "n/a — not stocked at this store"); fall back to `isOutOfStock` + range flags.
  - `quantity` — numeric units available. Surfaced in US, sometimes in CA. **Often omitted in GB/DE/EU markets** even when `stockStatus=HIGH_IN_STOCK` — emit `null` rather than `0`.
  - `isAvailableForCashCarry`, `isAvailableForClickCollect` — can the user actually buy this here right now.
  - `isInCashCarryRange`, `isInClickCollectRange`, `isInHomeDeliveryRange` — store-to-shopper geographic eligibility (based on caller's IP/cookie; see geo gotcha).
  - `isClickCollectEnabled` — store offers click-and-collect at all.
  - `isEligibleForStockNotification` — show the "notify me" CTA.
  - `isOutOfStock` — boolean. Use this in preference to `stockStatus === "OUT_OF_STOCK"` because it's set on every store, including ones missing `stockStatus`.
- **Per-store sales location** (`av.salesLocations[buCode]` is an array of `{itemNo, itemType, location: {aisle, bin}, locationType: AISLE_AND_BIN | FULL_SERVE | …, division: SELF_SERVE | FULL_SERVE | MARKETPLACE, floor}`) — surface as the in-store pickup hint. Empty for stores that don't stock the article.
- **Home delivery** (`av.homeDelivery`) — `{isAvailable, isInRange, stockStatus, isLimitedDelivery, isEligibleForStockNotification, isOutOfStock}`. Market-wide DC stock; aggregates all the per-store warehouse signals.
- **Click & collect** (`av.clickCollect`) — `{isAvailable, isInRange, isEnabled}`. Market-wide service availability.

### 5. Resolve store names → `{name, city, address, lat, lon, distance_km}`

The availability fragment intentionally returns numeric `buCode`s only — store-name resolution is a separate concern. Pick **one** of the following depending on how much store metadata the caller needs:

- **A. Recommended — Ingka CMA API call.** The per-page `config.cmaApiBaseUrl = "https://cma.ingka.com/cma"` and `config.cmaApiClientKey = "GnJEuqjAnY3vEeZQvaoCudpJewgGq00D"` (publicly embedded; not a secret) drive an `X-Client-Id`-authenticated GET against `https://cma.ingka.com/cma/stores/v1/{ru}/{lc}` (path varies — read the bundle `product-availability.route-*.js` for the current path; the `cma.ingka.com/cma/stores/*` base returned 403 from `browse cloud fetch` because that tool can't set the `X-Client-Id` header). Use a real HTTP client from the live agent code path:
  ```bash
  curl -sH "X-Client-Id: GnJEuqjAnY3vEeZQvaoCudpJewgGq00D" \
       -H "Origin: https://www.ikea.com" \
       -H "Referer: https://www.ikea.com/${RU}/${LC}/" \
       "https://cma.ingka.com/cma/stores/v1/${RU}/${LC}"
  ```
  Cache the result per market for 24h — store rosters change rarely.

- **B. Hardcoded lookup table.** IKEA `buCode`s are globally stable (`379` is always Brooklyn, `103` Elizabeth NJ, `207` Burbank, `152` Schaumburg, `560` East Palo Alto, `374` Manhattan, …). For low-cardinality markets a static map is the lowest-latency option.

- **C. Browser fallback** — see below.

### 6. Decide stock_state per store

Compose the user-facing `stock_state` from the underlying fields:

```
if av.isDiscontinued                            → "Discontinued"           (skill-level notice, not per-store)
elif av.isOnlySoldInStore and not isAvailableForCashCarry → "Sold online only"  *(misnomer in UI; means item is not orderable online — the converse of "online only")*
elif av.isCurrentlyNotSoldOnline and not isAvailableForCashCarry → "Sold in store only"
elif store.isOutOfStock                         → "Out of stock"
elif store.stockStatus == "LOW_IN_STOCK"        → "Low in stock"
elif store.stockStatus in ("MEDIUM_IN_STOCK","HIGH_IN_STOCK") → "In stock"
elif store.stockStatus is missing               → "Not stocked at this store"   (out of cash-carry range / not in assortment)
```

The `next_restock_date` field the prompt requests is **not present** on this endpoint — IKEA does not expose ETA timestamps publicly, only a "Restocking soon" boolean inferable from `isEligibleForStockNotification && isOutOfStock`. Emit `next_restock_date: null` and surface a `restocking_soon: true/false` companion flag.

### 7. Filter by store name / postal code (if requested)

- **Store name**: post-filter the resolved-name list (step 5) on a case-insensitive substring match.
- **Postal code with distance**: pass `--proxies` from the closest possible region, OR resolve the postal code to lat/lon via the publicly-keyed Google Geocoding API (the per-page `config` exposes `gmak`, IKEA's Maps key — first-party use only; if reusing, do so within IKEA's TOS), then compute haversine distance against each resolved store's lat/lon. The product-availability fragment does **not** itself accept a `postalCode=`/`zip=` parameter (we tested — the response is unchanged); per-shopper distance requires a separate geocode step.

### Browser fallback

When `cma.ingka.com` is unreachable, the caller can't set custom headers, or the agent needs to verify visually:

1. Create a Verified+proxy Browserbase session:
   ```bash
   SID=$(browse cloud sessions create --keep-alive --proxies --verified | jq -r .id)
   export BROWSE_SESSION="$SID"
   ```
2. Open the product page (read-only):
   ```bash
   browse open "https://www.ikea.com/${RU}/${LC}/p/-${ITEMNO}/" --remote
   browse wait load
   browse wait timeout 2500
   ```
   The trailing `-${ITEMNO}/` works as a slug-less redirect target in most markets; if it 404s, fall back to a real slug from `browse cloud search "ikea ${VISIBLE_ITEMNO} site:ikea.com/${RU}/${LC}"`.
3. Snapshot the page; click the "Check stock" or "Pickup & delivery" button (refs change per market and per locale).
4. Snapshot the opened **store list modal**. The modal's DOM tree contains each store's full name + city + distance label as plain accessibility-tree text. Read with `browse snapshot` and parse.
5. Cross-reference: the modal renders the same `availabilityResponse.availability.stores` map you'd have fetched in step 2 — you can read it directly from `window.__FIKA_DATA__` (or whatever the current hydration global is) via `browse eval`, avoiding a re-parse.
6. Release the session: `browse cloud sessions update "$SID" --status REQUEST_RELEASE`.

**Do not** click any time-slot / "Add to cart" / "Add to shopping list" / "Sign in" / "Reserve" / "Book delivery" controls. The skill is read-only.

## Site-Specific Gotchas

- **Article number normalization is mandatory.** The fragment endpoint accepts only the dotless 8-digit numeric form (`50522040`). Passing the dotted form (`505.220.40`) returns a 500 + the "Hej! Welcome to IKEA Global" landing page. Combination (`SPR`/`s`-prefixed) articles must be passed without the `s` prefix.
- **Wrong-market article numbers return a 500 "Hej! Welcome to IKEA Global" page (9 KB), not a 404.** Verified: `?itemNo=50333997` against `us/en` returned 500 + Hej page (article doesn't exist in US catalog), same against `gb/en` returned 500 + Hej page. Detect this by `statusCode==500` OR by the absence of a parseable `<script>` JSON payload — both are reliable. Do not retry on 500; switch markets or correct the article number.
- **Cross-market article visibility is inconsistent.** Article `50522040` (US BILLY) returned 70 stores on `de/de` but with empty `availability` records (all flags `false`, no `stockStatus`, no `quantity`) because BILLY-in-the-US-SKU is not stocked in Germany. The German catalog uses different article numbers for the same product family. Always confirm `product.currencyCode` matches the requested market — a mismatch (or `price: 0`) signals "article exists globally but isn't carried locally".
- **`browse cloud fetch --proxies` is the right tool** — datacenter IPs occasionally get the Hej landing page, but Browserbase's residential proxy pool reliably gets the fragment. Tested 200 OK on `us/en`, `gb/en`, `de/de` in a single sandbox run.
- **No custom-header support from `browse cloud fetch`.** That's why direct calls to `cma.ingka.com/cma/...` (which need `X-Client-Id`) returned 403 in our investigation. Use the availability fragment for stock data (cookieless) and reserve direct CMA calls for store-roster resolution from a regular HTTP client. We did **not** validate the exact CMA stores endpoint path from inside this sandbox — confirm against the live `product-availability.route-*.js` bundle in `https://www.ikea.com/global/assets/dwf/lower-funnel-fragments/` before deploying caller-side CMA code.
- **Geographic range flags are baked into the response based on the caller's IP/cookie**, not on a query param. We tested `?itemNo=...&zipCode=10001` and `?itemNo=...&postalCode=10001` — neither changed the response. To get NYC-relative `isInClickCollectRange` flags you need a NYC-region residential proxy (Browserbase `--proxies` defaults to a US-wide pool, which yields `isInClickCollectRange: true` for most US stores). If you need precise distance/range data, request it via the cookie `IKEA_USER_GEOLOCATION` or run the browser-driven fallback with `Use current location → enter ZIP` typed into the picker.
- **`stockStatus` is missing on out-of-assortment stores.** A store record without a `stockStatus` field is **not** the same as `OUT_OF_STOCK`; it means the article isn't part of that store's assortment at all. Surface it as a distinct outcome ("Not stocked at this store") rather than collapsing to `OUT_OF_STOCK`.
- **`quantity` is market-dependent.** Surfaced numerically in US (verified: ranges 5–526 units per store on BILLY). Often omitted in GB and DE even when `stockStatus = HIGH_IN_STOCK`. Treat missing `quantity` as `null`, not `0`.
- **`isSoldOut` is market-wide, `isOutOfStock` is per-store.** Don't conflate them. A product with `av.isSoldOut: true` is unavailable everywhere in the market; with `av.isSoldOut: false` but every per-store record `isOutOfStock: true`, you have a "in catalog, currently 0 units everywhere" state worth surfacing distinctly.
- **`isOnlySoldInStore` ≠ "Sold online only".** Confusingly named: `isOnlySoldInStore: true` means the article is only available for cash-and-carry (no online ordering). The UI's "Sold online only" badge corresponds to `isCurrentlyNotSoldOnline: false && isOnlySoldInStore: false && every store isAvailableForCashCarry: false` — i.e., the article is sold but only via online delivery. Map carefully or you'll invert the meaning.
- **`next_restock_date` does not exist on this endpoint.** IKEA only exposes `isEligibleForStockNotification: true` (the "notify me when restocked" CTA condition) plus, in markets with the "Restocking soon" badge, a translated string baked into the `t` (translations) block — never an actual date. Emit `next_restock_date: null` and a separate `restocking_soon: boolean`.
- **`lastCheckedDateTime` is locale-formatted, not ISO.** `{"formattedDate": "05/18/2026", "formattedTime": "5:10 pm"}` in US, `{"formattedDate": "18.05.2026", "formattedTime": "19:10"}` in DE. Parse against `config.dateFormat.customStockCheckDateFormat` / `customStockCheckTimeFormat` rather than guessing. The underlying UTC timestamp is not exposed.
- **`config` block carries useful per-market client IDs.** Worth caching: `apiCountry`, `apiLanguage`, `cmaApiBaseUrl`, `cmaApiClientKey`, `ciaApiBaseUrl`, `ciaApiClientKey`, `sellingRangeClientKey`, `stockNotificationApiClientId`, plus the page-global `gmak` (Google Maps key) and `ipacak` (IKEA Personalization Auth key) on `window.ikea.nav`. These rotate occasionally — re-derive per call rather than hardcoding across runs.
- **Direct Ingka APIs need auth.** `api.salesitem.ingka.com/cia/availabilities/{ru}/{lc}?itemNos=...` → 401 without `X-Client-Id`. `cma.ingka.com/cma/...` → 403 without origin headers. These are not viable from `browse cloud fetch`; use them only from a real HTTP client with the headers above.
- **Browser-fallback session must use `--proxies --verified`.** Without Verified, IKEA's bot detection surfaces a soft block on the product page after ~2 navigations from the same session. With both flags enabled we did not observe any block during testing of the un-driven cloud-fetch path; the driven browser path has not been fully validated from this sandbox (see Validation gotcha below).
- **Validation gotcha — this skill spec was authored without driving a live remote browser.** The Vercel sandbox running the generator could resolve `api.browserbase.com` but DNS to `connect.usw2.browserbase.com` (WebSocket driver host) was REFUSED, blocking `browse open --remote`, autobrowse `--env remote`, and `browser-trace` capture. The primary path (`lower-funnel-fragments/product-availability` fetched via `browse cloud fetch --proxies`) was validated end-to-end on US/GB/DE and is rock-solid. The browser-driven fallback (selectors, modal-XHR capture, postal-code geolocation override) is documented from a careful read of the JS bundle + production HTML but **not** confirmed via live drive. Validate the modal selectors and `__FIKA_DATA__` shape in a real session before depending on the fallback path.
- **No screenshots accompany this skill** for the reason above (no live browser session was available to the generator). The next agent should re-run the iteration loop from a sandbox with full Browserbase WebSocket access if visual evidence is required.

## Expected Output

Five distinct outcome shapes.

### A. In-catalog, in-stock at one or more stores

```json
{
  "success": true,
  "article": {
    "item_no": "50522040",
    "visible_item_no": "505.220.40",
    "name": "BILLY",
    "type_name": "bookcase",
    "currency": "USD",
    "price": 49,
    "url": "https://www.ikea.com/us/en/p/billy-bookcase-white-50522040/"
  },
  "market": "us",
  "global_flags": {
    "is_online_sellable": true,
    "is_only_sold_in_store": false,
    "is_currently_not_sold_online": false,
    "is_sold_out": false,
    "is_sold_out_online": false,
    "is_discontinued": false,
    "max_quantity": 99
  },
  "home_delivery": {
    "is_available": true,
    "is_in_range": true,
    "stock_status": "HIGH_IN_STOCK",
    "is_limited_delivery": false
  },
  "click_and_collect": { "is_available": true, "is_in_range": true, "is_enabled": true },
  "last_checked": { "date": "05/18/2026", "time": "5:10 pm", "tz": "market-local" },
  "stores": [
    {
      "store_id": "379",
      "store_name": "Brooklyn",
      "city": "Brooklyn, NY",
      "address": "1 Beard St, Brooklyn, NY 11231",
      "distance_miles": 4.2,
      "stock_state": "In stock",
      "stock_status_raw": "HIGH_IN_STOCK",
      "units_available": 33,
      "click_and_collect_available": true,
      "home_delivery_available": true,
      "restocking_soon": false,
      "next_restock_date": null,
      "sales_location": { "aisle": "01", "bin": "75", "division": "SELF_SERVE" }
    },
    {
      "store_id": "715",
      "store_name": "Memphis",
      "city": "Cordova, TN",
      "stock_state": "Out of stock",
      "stock_status_raw": "OUT_OF_STOCK",
      "units_available": 0,
      "click_and_collect_available": false,
      "home_delivery_available": true,
      "restocking_soon": true,
      "next_restock_date": null
    }
  ]
}
```

### B. Article not in the market's catalog (cross-market mismatch)

```json
{
  "success": false,
  "reason": "article_not_in_market_catalog",
  "article": { "item_no": "50522040", "visible_item_no": "505.220.40" },
  "market": "de",
  "evidence": "fragment returned 200 with product=BILLY currencyCode=null price=0 stores=70 all-flags-false"
}
```

### C. Article doesn't exist (no slug anywhere on IKEA)

```json
{
  "success": false,
  "reason": "article_not_found",
  "article": { "item_no": "50333997" },
  "market": "us",
  "evidence": "fragment endpoint returned HTTP 500 with the 'Hej! Welcome to IKEA Global' landing page (~9 KB, no <script> JSON)"
}
```

### D. Discontinued (in catalog, never coming back)

```json
{
  "success": true,
  "article": { "item_no": "...", "visible_item_no": "...", "name": "...", "type_name": "..." },
  "market": "...",
  "global_flags": { "is_discontinued": true, "is_sold_out": true, "is_online_sellable": false, "...": "..." },
  "notice": "Discontinued",
  "stores": []
}
```

### E. Sold out market-wide (in catalog, temporarily zero everywhere)

```json
{
  "success": true,
  "article": { "...": "..." },
  "global_flags": { "is_sold_out": true, "is_sold_out_online": true, "is_discontinued": false, "...": "..." },
  "home_delivery": { "is_available": false, "stock_status": "OUT_OF_STOCK", "is_eligible_for_stock_notification": true },
  "click_and_collect": { "is_available": false },
  "notice": "Sold out — restocking notification available",
  "stores": [
    { "store_id": "...", "stock_state": "Out of stock", "stock_status_raw": "OUT_OF_STOCK", "units_available": 0, "restocking_soon": true }
  ]
}
```
