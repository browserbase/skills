---
name: mcdonalds-order-online-order-for-pickup-il0zeo
title: McDonald's Order for Pickup
description: >-
  Build a McDonald's pickup order on mcdonalds.order.online (DoorDash
  Storefront): switch to Pickup fulfillment, pick a store by address, add menu
  items, and stop at the checkout review page for user-authorized submission.
  Read-only by default — never clicks Place Order.
website: mcdonalds.order.online
category: food-ordering
tags:
  - food
  - pickup
  - mcdonalds
  - doordash-storefront
  - cloudflare-turnstile
  - read-only
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      Not viable. The storefront's `/graphql` endpoint is Cloudflare-walled —
      GET returns 403 (Attention Required), and POST requires the `__cf_bm` +
      session cookie that only a real, JS-executing browser warm-up produces.
      The internal
      `consumer-client-api-gateway-api-lb.service.prod.ddsd./graphql` endpoint
      referenced in the SSR config is a private service-mesh address, not
      reachable from the public internet. Don't waste iterations on a cookieless
      API path.
  - method: url-param
    rationale: >-
      Partial — the storefront accepts equivalent URL shapes (`/store/{id}`,
      `/store/mcdonalds-{id}`, `/business/-5579/store/{id}`) for direct store
      navigation, and locale prefixes (`/en-CA`, `/en-GB`, `/en-AU`, `/en-NZ`,
      `/es`, `/fr-CA`) for regional catalogs. But there's no URL-level shortcut
      for picking the Pickup fulfillment mode or for pre-filling a cart — those
      still require live DOM interaction.
verified: true
proxies: true
---
# McDonald's Order for Pickup (mcdonalds.order.online)

## Purpose

Build a pickup order on McDonald's DoorDash-powered storefront at `mcdonalds.order.online`: find a nearby McDonald's, switch fulfillment from Delivery to Pickup, add items to cart, and reach the checkout review page. **Read-only by default** — stop at the checkout review screen and surface the prepared order for human confirmation. Submitting an order is a separate, authorization-gated step.

This is a McDonald's-branded white-label of DoorDash Storefront (the same Next.js app that powers `*.order.online` for thousands of merchants). The same patterns apply — but McDonald's has Cloudflare Turnstile bot protection turned up, so cookieless API shortcuts are dead ends.

## When to Use

- "Order me a Big Mac meal for pickup at the nearest McDonald's, I'll confirm before you submit."
- An agent building a McDonald's pickup cart for the user to review and submit themselves.
- Comparing pickup wait-time ETAs across nearby McDonald's locations before deciding which to order from.
- Pre-staging a cart so a returning user with a saved payment method just hits "Place order".
- **Not** for: comparing McDonald's *menu prices* across stores at scale (use `mcdonalds.com/restaurant-locator` or the McDonald's app API instead — much cheaper signal); browsing the McDonald's app's MyMcDonald's rewards (this site doesn't surface them); placing a delivery order (use `order-delivery` or DoorDash Marketplace).

## Workflow

The only viable path is a browser session — the `/graphql` endpoint is Cloudflare-walled (see Gotchas). Below is the verified browser flow.

### 1. Create a Verified + residential-proxy session

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies | jq -r '.id')
export BROWSE_SESSION="$SID"
```

Both `--verified` (Verified browsers) and `--proxies` (residential IP) are mandatory. A bare session gets a Cloudflare 403 challenge page on the first navigation, or on any `/graphql` POST during cart/menu interactions.

### 2. Open the brand landing page

```bash
browse open "https://mcdonalds.order.online/" --remote --session "$SID"
browse wait load --remote --session "$SID"
browse wait timeout 2500 --remote --session "$SID"   # let Turnstile resolve
```

The bare `https://mcdonalds.order.online/` returns `302 Location: /business/-5579` — McDonald's brand ID on DoorDash is the negative integer `-5579`. After the redirect, the page renders with `data-testid="BusinessLandingPageV3"` and shows a single input with `placeholder="Delivery address"` plus a Delivery/Pickup segmented control near the page header.

For country-specific catalogs use the explicit locale prefix: `/en-US/business/-5579`, `/en-CA/business/-5579`, `/en-GB/business/-5579`, `/en-AU/business/-5579`, `/en-NZ/business/-5579`, `/es/business/-5579`, `/es-US/business/-5579`, `/fr/business/-5579`, `/fr-CA/business/-5579`. Default (no prefix) is US English.

### 3. Flip the Delivery/Pickup toggle to **Pickup** — BEFORE entering an address

Default fulfillment on every cold session is Delivery. The toggle lives in the header/hero region of the page; on smaller viewports it's inside the address modal that opens when the input is focused.

```bash
browse snapshot --remote --session "$SID"
# In the snapshot, find the ref for the "Pickup" tab/toggle (usually a `tab` or `radio` role).
browse click @<pickup-ref> --remote --session "$SID"
browse wait timeout 1000 --remote --session "$SID"
```

Verify the toggle is now in the selected state before continuing. If you skip this and enter an address with Delivery still active, the result list will contain delivery-eligible stores (the union is usually similar but not identical) and the fulfillment carries through to checkout.

### 4. Enter an address and pick the first suggestion

```bash
browse click @<address-input-ref> --remote --session "$SID"
browse type "<street, city, state>" --remote --session "$SID"
browse wait timeout 1500 --remote --session "$SID"
browse snapshot --remote --session "$SID"
browse click @<first-suggestion-ref> --remote --session "$SID"
browse wait load --remote --session "$SID"
```

The placeholder text reads "Delivery address" even when Pickup is selected — **trust the toggle, not the label**. The dropdown is a Google Places autocomplete; do not press Enter (that submits a raw string and shows an error). Click a suggestion or use Down Arrow + Enter.

### 5. Pick a store from the result list

Each store card renders with the address, distance, hours, open/closed state, and a pickup ETA range ("Ready in 8-13 min"). Cards link to one of three equivalent URL shapes:

- `/store/{storeId}` — shortest, recommended
- `/store/mcdonalds-{storeId}`
- `/business/-5579/store/{storeId}`

All three resolve to the same menu page. Store IDs are positive integers (e.g. `687040`). Click the card for the store you want.

### 6. Browse the menu and add items

The menu page renders categories as horizontally-scrolling sections: Breakfast, Burgers, McNuggets & Meals, Chicken Sandwiches, Sides, Beverages, McCafé, Happy Meals, Desserts, etc. Categories shown vary by store (regional menu).

```bash
browse snapshot --remote --session "$SID"
browse click @<item-ref> --remote --session "$SID"
# Item-detail modal opens (LAYER-MANAGER-MODAL). Customize size/options.
browse click @<add-to-order-ref> --remote --session "$SID"
```

Each "Add to order" fires a `/graphql` mutation that updates the cart on the server. The header cart badge increments. Wait ~500ms between adds to let the optimistic update settle.

### 7. Re-verify Pickup is still selected before opening the cart

Several user actions reset fulfillment to Delivery silently:
- Navigating from one store to a different store
- Re-entering an address from inside a store page
- Closing and reopening the address modal

After your last "Add to order" but before opening the cart, scroll to the header and confirm the fulfillment indicator still says Pickup.

### 8. Open the cart sheet and capture review state

```bash
browse click @<cart-icon-ref> --remote --session "$SID"
browse wait timeout 1500 --remote --session "$SID"
browse snapshot --remote --session "$SID"
```

The cart is a right-side sheet with `data-testid="LAYER-MANAGER-SHEET"`. It contains:
- Header: "Pickup at {store address}" + scheduled time ("ASAP" by default)
- Line items with name, qty, customization summary, unit price
- Subtotal, fees (usually $0 for pickup), taxes
- "Go to checkout" CTA

**Capture this state now.** Note that the URL stays at `/store/{id}` while the sheet is open — the cart is not a separate route.

### 9. Advance to checkout review and STOP

```bash
browse click @<go-to-checkout-ref> --remote --session "$SID"
browse wait load --remote --session "$SID"
```

URL becomes `https://mcdonalds.order.online/checkout`. The review page shows the same line items + totals from the cart, the pickup store address, the pickup time, a payment-method selector, and a prominent **"Place order"** button.

**DO NOT click "Place order"** unless the user has explicitly authorized submission *and* a payment instrument is already on file. The button submits an immediate, non-refundable charge.

Emit the captured order shape (see Expected Output below) and release the session:

```bash
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

## Site-Specific Gotchas

- **Cloudflare Turnstile is active on every page.** Testids `turnstile/overlay`, `turnstile/banner`, `turnstile/widget` are present in the SSR HTML. `--verified --proxies` is mandatory; a bare session gets the Cloudflare interstitial. The widget can briefly cover the page on first load — `wait timeout 2500` after `wait load` is required before snapshotting.
- **`/graphql` is unreachable from outside a browser session — confirmed dead.** `GET https://mcdonalds.order.online/graphql` returns Cloudflare 403 (Attention Required) even with `--proxies`. POST requires the `__cf_bm` cookie + a session cookie that only a real, JS-executing browser warm-up produces. Don't waste iterations trying to skip the browser. Internally the storefront talks to `consumer-client-api-gateway-api-lb.service.prod.ddsd.` via `clientApiUri:"/graphql"` and `serverApiUri:"http://consumer-client-api-gateway-api-lb.service.prod.ddsd./graphql"`, but those are private endpoints — they are not reachable from the public internet.
- **Brand ID is `-5579` (negative).** McDonald's lives at `/business/-5579`. Negative-integer IDs are DoorDash's convention for brand groups (positive integers are individual stores). `/business/5579` and `/business/mcdonalds` both 404.
- **Default fulfillment is Delivery on every cold session.** The Pickup/Delivery toggle MUST be flipped explicitly, even when the user task says "order for pickup". Verify the toggle state in the header BEFORE adding any items — switching after items are in the cart works but is slower and sometimes drops items if the cart is mid-mutation.
- **Address input placeholder reads "Delivery address" even in Pickup mode.** The label is hard-coded; only the result list changes. Trust the toggle state, not the placeholder.
- **Fulfillment can silently reset to Delivery during navigation.** After every store-to-store nav, address re-entry, or address-modal close+reopen, re-verify the toggle. The header indicator is the source of truth.
- **Store URLs have three equivalent shapes.** `/store/{id}`, `/store/mcdonalds-{id}`, and `/business/-5579/store/{id}` all resolve to the same menu page. Prefer `/store/{id}`.
- **Store pages are >1MB of HTML.** The `browse cloud fetch` API caps response bodies at 1MB — store/menu pages cannot be inspected via Fetch. Use a real browser session.
- **Locale prefix routes to the regional catalog.** `/en-CA/business/-5579` returns Canadian stores, `/en-GB/business/-5579` returns UK stores, `/en-AU/`/`/en-NZ/` for ANZ. If the user's task is country-specific (e.g. "McSpicy in India" — wrong site, but checking GB works), use the explicit prefix; otherwise default (no prefix) gives US English.
- **`order.online/store/mcdonalds-{id}` is a DIFFERENT product.** That's the DoorDash Marketplace surface — a guest-checkout flow on DoorDash's main consumer app, not Storefront. It requires/encourages a DoorDash account, has different cart state, charges DoorDash service fees, and isn't a McDonald's-branded checkout. Don't mix the two; if the user asked for the McDonald's pickup flow, stay on `mcdonalds.order.online`.
- **The cart is a side-sheet, not a separate URL.** `data-testid="LAYER-MANAGER-SHEET"`. The URL stays at `/store/{id}` while the cart is open. The checkout review (`/checkout`) IS a separate URL.
- **Item availability varies per store.** Regional menus differ — the Big Mac is everywhere, but a Chicken Big Mac, Spicy McCrispy, McRib, or seasonal item may be absent. If the user requested an item that's not in the store's category list, surface the `item_unavailable_at_store` outcome (see Expected Output) rather than substituting silently.
- **READ-ONLY by default.** The boundary is the "Place order" button on `/checkout`. Stop there. A submitted order is an immediate, non-refundable transaction.

## Expected Output

Four distinct outcome shapes. Each captures the state at the boundary the skill stopped at.

```json
// 1. Cart prepared, review page reached, awaiting user authorization to submit
{
  "success": true,
  "store": {
    "id": "687040",
    "name": "McDonald's 10555 Parallel Parkway",
    "address": "10555 Parallel Pkwy, Kansas City, KS 66109",
    "url": "https://mcdonalds.order.online/store/687040"
  },
  "fulfillment": {
    "type": "pickup",
    "eta_minutes": 8,
    "eta_window": "Ready in 8-13 min",
    "scheduled_time": "ASAP"
  },
  "items": [
    {
      "name": "Big Mac Meal",
      "qty": 1,
      "options": ["Medium", "Coke", "Medium Fries"],
      "unit_price_cents": 1099,
      "line_total_cents": 1099
    },
    {
      "name": "10 pc McNuggets",
      "qty": 1,
      "options": ["Sweet & Sour sauce"],
      "unit_price_cents": 599,
      "line_total_cents": 599
    }
  ],
  "totals": {
    "subtotal_cents": 1698,
    "fees_cents": 0,
    "tax_cents": 153,
    "total_cents": 1851,
    "currency": "USD"
  },
  "checkout_url": "https://mcdonalds.order.online/checkout",
  "stopped_at": "checkout_review",
  "next_action_required": "user_authorize_submission"
}

// 2. No pickup-eligible stores near the supplied address
{
  "success": false,
  "reason": "no_pickup_stores",
  "address_used": "1600 Pennsylvania Ave NW, Washington, DC",
  "search_radius_miles": 5
}

// 3. Item the user asked for is not on the selected store's menu
{
  "success": false,
  "reason": "item_unavailable_at_store",
  "store_id": "687040",
  "requested_items": ["Chicken Big Mac"],
  "unavailable_items": ["Chicken Big Mac"],
  "available_alternatives": ["Big Mac", "McCrispy", "McDouble"]
}

// 4. Cloudflare/Turnstile wall hit and not solved within timeout
{
  "success": false,
  "reason": "anti_bot_wall",
  "detail": "cloudflare_turnstile_unsolved",
  "remediation": "Re-run with `browse cloud sessions create --verified --proxies` on a fresh session. A warm/reused session that has previously navigated the storefront in the past ~30min is more likely to pass."
}
```
