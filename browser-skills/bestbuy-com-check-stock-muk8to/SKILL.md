---
name: bestbuy-com-check-stock-muk8to
title: Best Buy Stock & Pickup Availability
description: >-
  Given a Best Buy SKU or product URL (and optional ZIP), return current price,
  online Ship-to-Home availability with ETA, pickup availability at nearby
  stores within radius, plus product title/brand/model/limit notice. Read-only —
  never adds to cart or reserves.
website: bestbuy.com
category: retail
tags:
  - retail
  - stock
  - pickup
  - akamai
  - graphql
  - read-only
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: browser
alternative_methods: []
verified: true
proxies: true
---
# Best Buy Check Stock

## Purpose

Given a Best Buy SKU (numeric product ID, e.g. `6418599`) or a product URL — and optionally a ZIP code or store ID — return the product's current availability across fulfillment channels: online Ship-to-Home (with ETA), Pickup at nearby stores (per-store availability within `radius_miles` of the ZIP, with per-store ready-time), and the product's metadata (title, brand, model, current price, member-pricing tier, any "Limit X per customer" notice). Read-only — never click Add to Cart, Pick up at Store, Sign In, Add Protection, or any purchase / reservation control.

## When to Use

- A user asks "is this in stock at my local Best Buy / for shipping to my ZIP?"
- Price-monitoring / availability-watch flows over a list of SKUs.
- Cross-retailer stock comparison (Amazon + Best Buy + Target).
- Verifying a deal is still bookable before notifying the user.
- Use the sibling skill `bestbuy.com/search-products` to resolve a query to a list of SKUs first; this skill only takes a known SKU/URL.

## Workflow

Best Buy's PDP is a Next.js App Router page guarded by **Akamai Bot Manager** (`_abck` + `bm_*` cookie set). The entire fulfillment data shape (price, online + pickup + delivery availability, button state) is **embedded in the SSR HTML** as Apollo Client cache events under `window[Symbol.for("ApolloSSRDataTransport")]` — you do **not** need to wait for React to hydrate. Lead with a stealth+residential-proxy browser session, navigate once, then parse the static HTML.

Best Buy's developer API does not expose live store-level stock. The `bestbuy.com/gateway/graphql` endpoint is the canonical source the site itself uses (operation: `FulfillmentOptionHook_FulfillmentDynamicQuery`). Direct cookieless POSTs from a fresh IP are likely Akamai-blocked — treat the GraphQL endpoint as a *candidate fast-path* (see Browser fallback at end), not the recommended route.

### 1. Stealth + residential-proxy session — mandatory

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies | jq -r .id)
export BROWSE_SESSION="$SID"
```

A bare session (no `--verified`, no `--proxies`) gets Akamai 403 / Access-Denied HTML on the first navigation. Both flags are required.

### 2. Set the user's ZIP **before** navigation

Without a user ZIP, Best Buy's SSR populates fulfillment data using the request-IP geolocation, falling back to **ZIP `55423` / store `7` (Richfield, MN — Best Buy HQ)** when geo is ambiguous. To get the data scoped to the user's ZIP, set the `locDestZip` cookie on the session **before** opening the PDP:

```bash
browse open "https://www.bestbuy.com/" --remote
# Use Set-Cookie / Network.setCookies via the CDP layer, or use the location-picker UI:
# Click "Update location" in the header → input ZIP → Submit. Wait load. Then proceed.
```

The cookie that drives fulfillment context is `locDestZip` (the ZIP). `locStoreId` is the resolved primary store. Both auto-populate after a successful zip-picker submission. Verify by reading `document.cookie` after the picker dismisses.

### 3. Navigate to the canonical PDP URL

Two URL schemes exist; both work but only one is canonical post-2024:

| Scheme | Example | Behavior |
|---|---|---|
| **Legacy** | `https://www.bestbuy.com/site/{sku}.p?skuId={sku}` | 301-redirects to canonical |
| **Canonical (current)** | `https://www.bestbuy.com/product/{slug}/{bsin}` | Direct PDP — preferred |

The `bsin` is a 10-character alphanumeric ID (e.g. `JJ8ZHP82P6`). If you only have the SKU, hit the legacy URL with `--allow-redirects` and capture the `Location` header to learn the canonical URL — but **note the redirect-leak gotcha** (see below: an unknown/inactive SKU may redirect to a totally unrelated product).

```bash
browse open "https://www.bestbuy.com/site/${SKU}.p?skuId=${SKU}" --remote
browse wait load
browse wait timeout 1500   # Apollo SSR events finish streaming after `load`
```

### 4. Extract product metadata from JSON-LD

Read the static HTML and pull `<script id="product-schema" type="application/ld+json">`:

```bash
HTML=$(browse get html body --remote)
echo "$HTML" | node -e "
  let h=''; process.stdin.on('data',d=>h+=d).on('end',()=>{
    const m=h.match(/<script id=\"product-schema\" type=\"application\\/ld\\+json\">([\\s\\S]*?)<\\/script>/);
    if (m) console.log(JSON.stringify(JSON.parse(m[1]), null, 2));
  });"
```

You get a structured `Product` object with `name`, `sku`, `model`, `brand.name`, `color`, `url`, `image`, `aggregateRating { ratingValue, reviewCount }`, `additionalProperty[]` (full spec sheet), and `offers[]`. **Caveat:** for `dotComDisplayStatus: "inactive"` products (discontinued online), `offers[]` is empty or contains only a Refurbished/Open-Box offer — the active "new" price lives in the Apollo cache (step 5).

### 5. Extract price + fulfillment from the Apollo SSR cache

The richest signal is in **inline `<script>` tags that hydrate Apollo's cache** via `window[Symbol.for("ApolloSSRDataTransport")] ??= []).push(...)`. Each push contains a stream of `{type: "started" | "next" | "completed", options/value, id}` events. The relevant events are the `type: "next"` payloads whose `value.data.productBySkuId` is populated. Specifically look for:

| Source query | Fields to extract |
|---|---|
| `InactiveProductHeader_Init` / `PDP_ProductSkuIdComposite_Init` | `productBySkuId.{brand, skuId, name.short, manufacturer.modelNumber, primaryImage.piscesHref, dotComDisplayStatus, bsin, upc}` |
| `FulfillmentOptionHook_FulfillmentDynamicQuery` | `productBySkuId.price.customerPrice`, `productBySkuId.fulfillmentOptions.{buttonStates[], shippingDetails[], deliveryDetails[], ispuDetails[]}` |

A robust extractor regexes for `"productBySkuId":\{[\s\S]*?\}\}` and `"fulfillmentOptions":\{[\s\S]*?\}` after stripping JS quoting, then `JSON.parse` on the surrounding object. The hydration stream lives inside large inline script tags; don't try to parse it as standalone JSON — find the inner object literals.

### 6. Map the data to the output schema

- **Online (Ship-to-Home) state** — derive from `fulfillmentOptions.buttonStates[].buttonState`:
  - `ADD_TO_CART` / `BUY_NOW` → `"In Stock"`
  - `SOLD_OUT` → `"Sold Out"`
  - `COMING_SOON` → `"Coming Soon"` (read `releaseDateDisplayValue` for the date)
  - `NOT_AVAILABLE` → `"Currently Unavailable"`
  - `CHECK_STORES` → online not available, pickup may be — fall through to step 6 pickup logic
- **Ship-to-Home ETA** — from `shippingDetails[].shippingAvailability[].customerLOSGroup` you get `displayDateType`, `minLineItemMaxDate`, `maxLineItemMaxDate`, `name` (e.g. "Standard"). The user-facing "Get it by Wed, May 20" string is rendered server-side and also surfaces in the SSR HTML — search for `"shippingDisplayDateType"` and adjacent date-text fragments. `shippingEligible: false` ⇒ no Ship-to-Home.
- **Pickup stores** — from `ispuDetails[].nearbyLocations[]`. Each entry has `availability.{maxDate, minPickupInHours, pickupEligible, quantity, fulfillmentType}` and `store.{storeId, displayName, address, city, state, zip, distance}`. Map:
  - `pickupEligible: true && minPickupInHours <= 24` → `"Available Today"` with `ready_time = "Ready in ${minPickupInHours} hour(s)"`
  - `pickupEligible: true && minPickupInHours > 24` → `"Available Tomorrow"` (or use `maxDate`) with `ready_time = "Ready ${maxDate}"`
  - `pickupEligible: false` → `"Not Available"`
- **Price + member tier** — `productBySkuId.price.customerPrice` is the price for the current `planPaidMemberType` (default `"NULL"` = logged-out / non-member). To get member-tier pricing (My Best Buy Plus / Total), re-execute the same query with `planPaidMemberType: "PLUS_NEW"` or `"TOTAL"` — these are typically only visible to members, but the SSR may render member-only prices in adjacent `priceCondition` blocks.
- **"Limit X per customer"** — search the rendered HTML for `Limit\s+\d+\s+per\s+customer`. This is a presentational string near the price block; it does not live in the GraphQL response.

### 7. (Optional) Filter by `radius_miles`

The default `inStorePickup.searchNearby: true` returns the closest ~10 stores. Best Buy's default radius is **25 miles**. To enforce a custom `radius_miles`, post-filter the returned `nearbyLocations[]` by `.store.distance` (the field is miles as a `number`). To force a wider search, the only verified way is via the live "Find a store" UI — there's no `searchRadius` field on `ProductFulfillmentInput.inStorePickup` exposed publicly. Document the cap in your output.

### 8. Release the session

```bash
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

### Browser fallback / candidate API path

If a future agent wants to skip step 3's page render entirely, the GraphQL endpoint can in principle be hit directly:

```
POST https://www.bestbuy.com/gateway/graphql
Content-Type: application/json
Origin: https://www.bestbuy.com
Referer: https://www.bestbuy.com/product/{slug}/{bsin}
Cookie: locDestZip={zip}; locStoreId={storeId}; _abck=...; bm_sz=...
```

Body (`operationName: FulfillmentOptionHook_FulfillmentDynamicQuery`, query text as observed in the SSR HTML's Apollo `started` events). **This was not end-to-end verified in skill construction** — direct cookieless POSTs from an untrusted IP are very likely Akamai-blocked (the `_abck` / `bm_sz` cookies are sensor-checked). The safe pattern is: navigate the PDP once in a stealth+proxies browser, harvest the Akamai cookies from the session, then re-issue the GraphQL POST from page context using `fetch()` with `credentials: "include"`. Treat the GraphQL path as a 2x-faster optimization, not the primary path.

## Site-Specific Gotchas

- **READ-ONLY.** Do not click Add to Cart, Pick up at Store, Sign In, Add Protection, "Add Open-Box to Cart", or any reservation control. Capturing data is fine; transitioning state is not.
- **Akamai Bot Manager.** Stealth (`--verified`) + residential proxies (`--proxies`) are mandatory. A bare session gets a 403 + Akamai's Access-Denied HTML or an interstitial. Cookies returned: `_abck`, `bm_ss`, `bm_s`, `bm_so`, `bm_sz`, `akacd_PR_www_bestbuy_com`, `bby_cbc_lb` — the `_abck` is the canonical Bot-Manager session token.
- **URL-migration redirect-leak gotcha.** Best Buy migrated PDP URLs from `/site/{sku}.p?skuId={sku}` to `/product/{slug}/{bsin}`. The legacy URL still 301-redirects, but **an unknown / deactivated SKU may redirect to a completely unrelated product** instead of 404. Example observed during skill construction: legacy URL for SKU `6418599` returned 301 → MacBook Air M1 (which matches), but the redirect mechanism doesn't always preserve mapping. **Always verify the redirected URL's `bsin` matches the SKU's expected canonical path** by reading `productBySkuId.skuId` from the SSR HTML and comparing against the input SKU. If they mismatch, the SKU likely doesn't exist anymore — return `success: false, reason: "sku_not_found"`.
- **`dotComDisplayStatus: "inactive"` is a distinct outcome.** When a product is no longer sold online (only refurb / open-box), `dotComDisplayStatus == "inactive"`, `buttonStates[0].buttonState == "NOT_AVAILABLE"`, `shippingAvailability[0].shippingEligible == false`, `ispuAvailability[0].pickupEligible == false`, and `JSON-LD offers[]` is empty (or contains only refurbished). This is NOT an error — return `online.availability: "Currently Unavailable"` with the refurb offer (if any) under a `refurbished_offer` field.
- **Default ZIP is Richfield, MN (`55423`), default store is `7`.** Without a `locDestZip` cookie, the SSR renders fulfillment context against Best Buy's HQ ZIP. The PDP HTML will say "Get it by … to 55423" — silently emitting this to a user in California is a bug. Always verify `shippingDetails[].destinationZipCode` matches the user's input ZIP before emitting, and re-fetch with the right cookie if not.
- **Data is in the SSR HTML — do not wait for React.** The Apollo SSR transport events stream all `productBySkuId` and `fulfillmentOptions` payloads inline during initial HTML render. `browse wait timeout 1500` after `load` is sufficient; React hydration is irrelevant. Don't try `browse snapshot` to find fulfillment text — the rendered React tree's text content is the same data you already have in `window[Symbol.for("ApolloSSRDataTransport")]` events, but harder to parse.
- **`buttonState` is the canonical availability signal**, not visible button text. Observed enum values during construction: `NOT_AVAILABLE`, `ADD_TO_CART`, `BUY_NOW`, `SOLD_OUT`, `COMING_SOON`, `CHECK_STORES`. Map to user-facing strings yourself; don't trust scraped button labels (they're A/B-test-controlled).
- **Pickup data depends on `inStorePickup.storeId` AND `searchNearby: true`.** The GraphQL `fulfillmentInput.inStorePickup` requires a `storeId` even when you want a nearby-search result — pass `7` (HQ store) or any valid store ID; with `searchNearby: true` Best Buy returns the actually-nearby stores based on `destinationZipCode`. Don't try to omit `storeId`.
- **`radius_miles` is not a publicly-exposed filter.** `ProductFulfillmentInput.inStorePickup` has no `searchRadius` field. The default ~25-mile radius is server-controlled. Post-filter `nearbyLocations[]` by `store.distance` (a `number` in miles) to honor a custom radius.
- **PDP HTML for active products may exceed 1MB.** The Browserbase Fetch API caps response bodies at 1MB. Inactive/discontinued PDPs (~900KB) fit; active PDPs (with full review prerender) may not. Always use a live browser session for active products — `browse get html body` reads from the rendered DOM, no size cap.
- **Best Buy Developer API does not expose store-level stock.** The `https://api.bestbuy.com/v1/products(...)` endpoint requires an API key and only returns catalog metadata + online availability. There is **no** documented endpoint for per-store pickup quantity. `/gateway/graphql` is the only source.
- **`POST /gateway/graphql` from cookieless IP is candidate-only, untested in skill construction.** The construction environment couldn't validate direct POST behavior (sandbox DNS policy blocked outbound to bestbuy.com and to Browserbase's CDP connect server). The skill assumes — but does not prove — that the GraphQL endpoint is Akamai-protected in the same way as the page. Future agents should re-verify before relying on the API fast-path.
- **GraphQL operation: `FulfillmentOptionHook_FulfillmentDynamicQuery`.** Variables: `skuId: String!`, `fulfillmentInput: ProductFulfillmentInput!`, `productPriceInput: ProductItemPriceInput!`, `openBoxCondition: Int`. The full query text (with all fragments) is embedded in the SSR HTML as an Apollo `started` event — copy it from there rather than hand-writing it. Operation names and shapes were stable across two PDP fetches during construction; if Best Buy renames them, the SSR HTML always has the current shape.
- **Member-tier pricing is logged-in-only.** `customerPrice` reflects `planPaidMemberType: "NULL"` (logged-out) by default. To surface My Best Buy Plus / Total prices, the page context needs an authenticated session — which violates read-only. Emit `member_pricing.my_best_buy_plus = null, my_best_buy_total = null` unless an authenticated session is explicitly in scope (out of scope for this skill).
- **`AAAA…` base64 surprise from `browse cloud fetch --output`.** When the response is binary (images, gzip), the Fetch API returns `{content, encoding: "base64"}` — `--output` writes the raw envelope, not the decoded bytes. To save the actual binary, parse the JSON and `Buffer.from(content, "base64")` yourself. Affects the "fetch the hero image for thumbnail" path; not relevant for HTML extraction.

## Expected Output

A single JSON object, with these distinct outcome shapes:

```json
// Active product, online + pickup data populated for user's ZIP
{
  "success": true,
  "sku": "6418599",
  "bsin": "JJ8ZHP82P6",
  "title": "Sony - WH-1000XM5 Wireless Noise-Canceling Over-the-Ear Headphones - Black",
  "brand": "Sony",
  "model": "WH1000XM5/B",
  "upc": "027242923386",
  "url": "https://www.bestbuy.com/product/{slug}/{bsin}",
  "primary_image_url": "https://pisces.bbystatic.com/image2/BestBuy_US/images/products/6418/6418599_sd.jpg",
  "price": { "current": 399.99, "currency": "USD" },
  "member_pricing": { "my_best_buy_plus": null, "my_best_buy_total": null },
  "limit_per_customer": null,
  "online": {
    "availability": "In Stock",
    "button_state": "ADD_TO_CART",
    "ship_to_home_eta": "Get it by Wed, May 20",
    "destination_zip": "94103",
    "shipping_eligible": true
  },
  "pickup": {
    "zip": "94103",
    "radius_miles": 25,
    "stores": [
      {
        "store_id": "186",
        "store_name": "Harrison Street",
        "address": "1717 Harrison St, San Francisco, CA 94103",
        "distance_miles": 0.6,
        "availability": "Available Today",
        "min_pickup_in_hours": 1,
        "max_date": "2026-05-18",
        "quantity": 5,
        "ready_time": "Ready in 1 hour"
      }
    ]
  }
}

// Inactive / discontinued product (only refurb available)
{
  "success": true,
  "sku": "6418599",
  "bsin": "JJ8ZHP82P6",
  "title": "MacBook Air 13.3\" Laptop - Apple M1 chip - 8GB Memory - 256GB SSD - Gold",
  "brand": "Apple",
  "model": "MGND3LL/A",
  "dot_com_display_status": "inactive",
  "online": { "availability": "Currently Unavailable", "button_state": "NOT_AVAILABLE", "shipping_eligible": false },
  "pickup": { "zip": "55423", "radius_miles": 25, "stores": [] },
  "refurbished_offer": {
    "price": 364.99,
    "sku": "6489687",
    "condition": "Refurbished",
    "currency": "USD"
  }
}

// SKU redirected to an unrelated product (legacy-URL mismatch)
{ "success": false, "reason": "sku_not_found", "input_sku": "9999999", "redirected_to_sku": "6418599" }

// Akamai 403 / bot-detection wall on first navigation
{ "success": false, "reason": "akamai_blocked", "status_code": 403, "url": "https://www.bestbuy.com/product/..." }

// Sold out for the user's ZIP (online out, all nearby stores out)
{
  "success": true,
  "sku": "...",
  "online": { "availability": "Sold Out", "button_state": "SOLD_OUT", "shipping_eligible": false },
  "pickup": { "zip": "94103", "radius_miles": 25, "stores": [/* all with availability: "Not Available" */] }
}

// Coming Soon (pre-order)
{
  "success": true,
  "sku": "...",
  "online": {
    "availability": "Coming Soon",
    "button_state": "COMING_SOON",
    "release_date": "2026-06-15",
    "ship_to_home_eta": "Get it by Mon, Jun 15",
    "shipping_eligible": true
  },
  "pickup": { "zip": "...", "stores": [] }
}
```
