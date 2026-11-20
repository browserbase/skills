---
name: sameday-costco-com-create-cart-1gzg80
title: Costco Same-Day Build Cart From List
description: >-
  Given a grocery list, find the best-matching Costco Same-Day products and add
  them to the cart, biasing toward previously purchased items when a logged-in
  Buy It Again history is available. Stops at the cart; never checks out.
website: sameday.costco.com
category: grocery
tags:
  - grocery
  - costco
  - instacart
  - cart
  - shopping
  - same-day
source: 'browserbase: agent-runtime 2026-06-30'
updated: '2026-06-30'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      The Instacart backend powering search/cart is session-token-gated and not
      usable cookieless, so there is no reliable direct API path. Drive the
      rendered storefront instead.
verified: false
proxies: false
---
# Costco Same-Day — Build a Cart from a Grocery List

## Purpose

Given a list of grocery items, find the best-matching Costco Same-Day (Instacart-powered) product for each item and add it to the cart, biasing toward previously purchased products when a logged-in "Buy It Again" history is available. Returns, per item, the product chosen (name + price) and whether it came from purchase history, plus the running cart count. This skill is **write-to-cart but read-only past that** — it stops at the cart and never proceeds to checkout, payment, or order placement.

## When to Use

- "Add organic milk, large eggs, and bananas to my Costco Same-Day cart."
- Reorder/restock flows where a user wants their usual groceries queued for delivery.
- Converting a meal-plan or shopping-list into a ready-to-review Costco cart.
- Any flow that needs products selected and added — but **not** purchased.

## Workflow

The recommended method is **browser** driving the public storefront. Costco Same-Day is an Instacart white-label storefront; its internal product/cart APIs are session-token-gated and not usable cookieless, so the rendered storefront is the reliable surface. A **bare remote session is sufficient** — no residential proxy or stealth/verified browser was needed (homepage anti-bot probe: none detected; a plain `--remote` run completed the full add-to-cart flow cleanly).

**Two distinct capability tiers — know which one you're in:**
- **Guest (no credentials):** search + add-to-cart fully work. The previously-purchased bias is **NOT** available — the "Buy It Again" page is empty for guests. Fall back to relevance search for every item.
- **Logged in (Costco.com SSO):** the "Buy It Again" page is populated with order history, enabling the previously-purchased bias. Sign-in is delegated to Costco.com and requires real member credentials; an automated agent without them cannot complete it — treat it as an auth wall and proceed as a guest.

### Steps

1. **Open the entry page.** `browse open https://sameday.costco.com/ --remote`, then `browse snapshot`. The page offers two buttons: `Sign in via Costco.com` and `Browse as a guest`.
   - If you have valid Costco member credentials and need the purchase-history bias, click `Sign in via Costco.com` and complete the Costco.com SSO. Otherwise click **`Browse as a guest`**.
   - `browse wait load` (the transition takes ~10s).

2. **Land on the storefront.** You arrive at `https://sameday.costco.com/store/costco/storefront`. The delivery ZIP is auto-set from the session's IP (e.g. `97818`) and the cart starts at 0. The header shows a `View Cart. Items in cart: N` button — this N is your source of truth for confirming adds.

3. **Check previously-purchased (the bias step).** Navigate to `https://sameday.costco.com/store/costco/buy_it_again`.
   - **Logged in:** this lists products from the member's order history. For any grocery-list item that matches an item here, prefer that product (set `from_previously_purchased: true`).
   - **Guest:** the page shows "Reordering is a breeze / Items you order from this store will show up here" — i.e. empty. Record `previously_purchased_available: false` and fall back to search for every item.

4. **Search each item.** For each list entry, navigate directly to the search URL (no need to type in the box):
   ```
   https://sameday.costco.com/store/costco/s?k=<URL-encoded query>
   ```
   Then `browse wait timeout 3000` (results render 1–3s after load), then `browse snapshot`.

5. **Pick the best match.** Each result is a `group: Product` node containing:
   - a `heading` with the full product name,
   - a `StaticText: Current price: $X.XX`,
   - a sibling `button: Add 1 ct <product name>`.

   Choose the first result that genuinely matches the requested item. Prefer Kirkland Signature and the size/variant closest to the request (e.g. "organic milk" → an organic whole/2% milk multi-pack, not almond/soy unless asked). Costco sells in bulk multi-packs — there is rarely a single-unit option.

6. **Add to cart.** Click the item's `Add 1 ct ...` button. It morphs into Decrement/Increment controls, and the header `View Cart. Items in cart: N` increments by 1. `browse wait timeout 2000`, snapshot, and **verify N increased** before moving to the next item.

7. **Confirm and emit.** After all items, read the final cart count and confirm it equals the number of items successfully added. Emit the JSON in Expected Output. **Stop here — do not open the cart's checkout flow.**

## Site-Specific Gotchas

- **WRITE-TO-CART, NOT CHECKOUT.** Add items and stop. Never click through to checkout, payment, scheduling, or "Place order."
- **Previously-purchased bias requires login.** The "Buy It Again" page (`/store/costco/buy_it_again`) is the only previously-purchased surface, and it is **empty for guests**. Without Costco.com credentials the bias is impossible — be honest in the output (`previously_purchased_available: false`) rather than pretending. This is the core limitation of the task for an unauthenticated agent.
- **Sign-in is delegated to Costco.com.** The "Sign in via Costco.com" button leaves the Instacart storefront for Costco's own SSO. There is no in-storefront login form; an agent without real member credentials cannot pass it — treat as an auth wall, not a bug.
- **Storefront/Buy-It-Again URLs 302-redirect to `/?next=...` until context is set.** Hitting `/store/costco/storefront` or `/store/costco/buy_it_again` cold (fresh session, no guest/login choice made) bounces you to the landing page. Always click "Browse as a guest" (or sign in) first **in the same session**, then navigate.
- **Delivery ZIP is IP-geolocated.** The storefront picks a delivery ZIP from the session's outbound IP (`97818` on a bare US session). Product availability and prices are ZIP-specific. If you need a specific delivery area, set it via the `Delivery <ZIP>` button in the header before searching; otherwise document the ZIP you actually got (it's in the header and in the output).
- **No proxy/stealth needed.** A bare `--remote` session completed the entire flow; no Akamai block, captcha, or login wall on the storefront/search/add surfaces. `--verified`/`--proxies` are unnecessary (and only change which ZIP you geolocate to).
- **Search is URL-driven — skip the typeahead.** `https://sameday.costco.com/store/costco/s?k=<q>` renders results directly; you don't need to interact with the search textbox. Wait ~3s after navigation before snapshotting (results render progressively).
- **Snapshots are large (500–700 a11y refs).** Filter for `Add 1 ct`, `Current price`, and `Items in cart` rather than reading the whole tree.
- **`Add` button vs. product button.** Each product card has TWO buttons: the product tile itself (opens the detail page) and the separate `Add 1 ct <name>` button. Click the **`Add`** button to add to cart without leaving the results page.
- **Internal APIs are session-gated.** The Instacart backend that powers search/cart is not usable cookieless (requires session bundle tokens). Don't waste time trying to hit a JSON endpoint directly — drive the rendered storefront.
- **Bulk-only sizing.** Costco results are warehouse multi-packs (e.g. "Kirkland Signature Eggs, Large, 5 dozen-count"). Match on product identity, not pack size, when the list item is generic ("eggs").

## Expected Output

```json
{
  "success": true,
  "store": "costco-same-day",
  "delivery_zip": "97818",
  "logged_in": false,
  "previously_purchased_available": false,
  "previously_purchased_note": "Buy It Again is empty for guests; requires Costco.com login",
  "items_added": [
    {
      "query": "organic milk",
      "product_name": "Kirkland Signature Organic A2 Whole Milk, Half Gallon, 3-count",
      "price": "$16.33",
      "from_previously_purchased": false
    },
    {
      "query": "large eggs",
      "product_name": "Kirkland Signature Eggs, Large, 5 dozen-count",
      "price": "$13.61",
      "from_previously_purchased": false
    },
    {
      "query": "bananas",
      "product_name": "Bananas, 3 lbs",
      "price": "$2.26",
      "from_previously_purchased": false
    }
  ],
  "cart_count": 3,
  "error_reasoning": null
}
```

Variant outcomes:

```json
// An item had no usable match — product fields null, continue with the rest
{
  "query": "saffron threads",
  "product_name": null,
  "price": null,
  "from_previously_purchased": false,
  "note": "no relevant Costco result"
}
```

```json
// Logged in: previously-purchased bias applied for matching items
{
  "logged_in": true,
  "previously_purchased_available": true,
  "items_added": [
    { "query": "milk", "product_name": "Kirkland Signature Organic Whole Milk, 8 fl oz, 18-count", "price": "$17.58", "from_previously_purchased": true }
  ]
}
```

```json
// Auth wall hit (sign-in required but no credentials) — proceed as guest, not a hard failure
{
  "success": true,
  "logged_in": false,
  "previously_purchased_available": false,
  "previously_purchased_note": "Sign in via Costco.com requires member credentials; ran as guest",
  "cart_count": 3
}
```
