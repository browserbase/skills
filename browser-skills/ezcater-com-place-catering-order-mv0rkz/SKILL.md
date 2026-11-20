---
name: ezcater-com-place-catering-order-mv0rkz
title: Place a Catering Delivery Order on ezCater
description: >-
  Build an ezCater catering delivery order end-to-end — search caterers near an
  address that can fulfill the date/time/lead-time, set delivery date/time and
  headcount, size packages/trays to the guest count, add items to cart, and
  proceed to checkout (which gates behind an authenticated account before event
  details, delivery instructions, and payment). Stops before payment.
website: ezcater.com
category: food-delivery
tags:
  - catering
  - food-delivery
  - ezcater
  - checkout
  - ordering
  - logistics
source: 'browserbase: agent-runtime 2026-06-25'
updated: '2026-06-25'
recommended_method: browser
alternative_methods:
  - method: fetch
    rationale: >-
      The caterer search step works via a URL deep-link
      (/catering/search/new?city=&state=&latitude=&longitude=&street=) that 301s
      to /catering/search/{uuid}, but it sits behind Cloudflare WAF and renders
      client-side, so it still needs a stealth browser. Date/time/headcount,
      cart, and checkout are JS-driven and not reproducible by plain fetch.
  - method: api
    rationale: >-
      No public/unauthenticated ezCater ordering API; checkout and order-status
      require an authenticated account session, so an API path was not viable.
verified: true
proxies: true
---
# Place a Catering Delivery Order on ezCater

## Purpose
Drive an ezCater catering **delivery** order end-to-end: given a delivery address, date, time, and guest count, search for caterers that can fulfill the slot (respecting each caterer's lead-time/minimum-notice and order-minimum rules), set the delivery date/time and headcount, browse a caterer's menu and size packages/trays to the guest count, add items to the cart with their required options, and proceed toward checkout. The entire cart (address, date/time, headcount, items) is built **anonymously**, but the checkout page itself — event details, delivery instructions (floor/suite/contact), tip, payment, and post-order status — is gated behind an authenticated ezCater account. This skill also covers searching caterers near an address, checking whether a specific date/time slot is available, and the order-status lifecycle (Submitted → Accepted by Restaurant). It is read-only up to the payment step (never submits payment).

## When to Use
- "Find caterers that can deliver to {address} on {date} at {time} for {N} guests."
- "Is {caterer} / are any caterers available for delivery on {date} at {time}?"
- "Build a catering order for {N} people from {caterer} and take it to checkout (but stop before paying)."
- "Size a boxed-lunch / tray order to {N} guests and confirm it clears the order minimum."
- "What's the status of my ezCater order — has the restaurant accepted it yet?"

## Workflow

ezCater is a JavaScript-heavy Next.js app fronted by **Cloudflare WAF**. Use a remote browser session with **stealth + residential proxies on** (`browse cloud sessions create --verified --proxies --keep-alive`). The homepage loads directly, but the search route throws a Cloudflare "Just a moment…" interstitial that a verified session clears in ~5 s — always poll the page title/URL after navigating before acting.

There is a useful **URL deep-link** for steps 1–2 that skips homepage interaction; the rest of the flow is necessarily browser-driven.

### Step 1 — Search caterers near a delivery address
Navigate directly to the search route with address query params:
```
https://www.ezcater.com/catering/search/new?city={City}&state={ST}&latitude={lat}&longitude={lng}&street={Street+Address}
```
This 301-redirects to a canonical `https://www.ezcater.com/catering/search/{searchUuid}?...` results page (the `{searchUuid}` is the order/fulfillment id that threads through the rest of the flow). Wait for the title to become `"{City}, {ST} Caterers - Order Online from ezCater"`.

> The proxy's IP geolocates a default address if you omit params (often `Portland, OR` on the usw2 proxy, `Boston, MA` on the homepage). **Always pass explicit `latitude`/`longitude`/`city`/`state`/`street`** to control the delivery location — these override IP geolocation. `latitude`/`longitude` drive distance and which caterers appear.

Results are caterer cards with name, rating, review count, distance, and delivery fee. The header has three filter buttons: the **address** button, the **date/time** button (initially "Anytime"), and **"Event details"** (headcount).

### Step 2 — Set the delivery date and time
Click the date/time button ("Anytime"). A calendar (past days are disabled — earliest selectable is today) plus 15-minute time slots from 10:00 AM appears, with the note *"To ensure on-time delivery and setup, your order may arrive earlier."* Pick a date button, pick a time button, then click **"Update results"**. The button label updates to e.g. "Tue Jun 30th" and the URL gains `&orderId={searchUuid}`.

**Availability / lead-time semantics:** after setting a date/time, the results list re-filters to only caterers that can fulfill that slot — caterers whose minimum-notice/lead-time or operating hours don't allow it are **dropped from the list**. So "is this slot available for {caterer}?" = "does {caterer} still appear in the results after the date/time is applied?" Past dates and same-day-too-soon times are non-selectable in the picker.

### Step 3 — Set the headcount (Event details)
Click **"Event details"**, fill **"Number of attendees"** (and optional **"Event name"**), click **"Update results"**.

### Step 4 — Open a caterer's menu
Click a caterer card, or deep-link to:
```
https://www.ezcater.com/catering/{caterer-slug}/{YYYY-MM-DD}?fulfillmentDetailId={searchUuid}
```
The menu page shows the delivery summary (address / `Tue 6/30, 12:00 PM` / headcount, each with Edit/Change), the **order minimum** ("Minimum order $50.00 — $50 food & beverage delivery minimum"), the **delivery fee** ("$30.00 & up"), and menu categories. Items are either **per-person** (boxed lunches priced "$16.98 / person") or **trays/group items labeled "Serves N"** (e.g. Serves 10, Serves 12). Some menus show an "Order by {cutoff}" deadline (the caterer's lead-time cutoff for that date).

### Step 5 — Size packages to the guest count
- **Per-person items** (boxed lunches): quantity = guest count (25 guests → 25 boxes).
- **"Serves N" trays/group items**: quantity = `ceil(guests / N)` (25 guests, Serves 10 → 3 trays).
Mix categories (entrée + sides + drinks) as needed, and ensure the running subtotal clears the **food-&-beverage minimum** (delivery fee does **not** count toward it).

### Step 6 — Add items to the cart (the quantity widget is the tricky part)
Click an item to open its configuration **dialog**. It contains: required modifier radiogroups (e.g. "Select bread", "Select chips" — each defaults to "Most Popular"), optional add-ons, a **"Select quantity" combobox**, an "Add special instructions" field, and an **"Add to Cart $price /person"** button.

> **CRITICAL — the quantity selector is a Radix UI combobox `<button role="combobox">`, NOT a native `<select>`.** `browse select` returns `selected: []` and `browse get value` returns `""`; ref-clicking it can dismiss the dialog. Drive it by **keyboard**:
> 1. Focus the dialog's combobox button (`document.querySelector('[role=dialog] button[role=combobox]').focus()` via `browse eval`, or click it precisely).
> 2. Press **Space** (or ArrowDown) to open — this renders ~61 `[role=option]` items in a portal.
> 3. **Typeahead the number**: `browse type "25"` jumps to "25 boxes", then `browse press Enter`.
> 4. Confirm the trigger text now reads "25 boxes", then click **"Add to Cart"** (or **"Update Item"** when editing an existing cart line).

Simple items (chips, bottled drinks, single cookies) have direct **"Add {item} to cart"** buttons that add quantity 1 with no dialog.

### Step 7 — Review the cart and verify the minimum
The right-rail cart lists each line (qty + name + price + size), an editable **Tableware** line ($0.00 — plates/napkins/utensils), subtotal, delivery fee, and **Order total**. If below the minimum it shows **"$50.00 minimum for delivery"** and the **Checkout** button won't proceed. Below the total: *"After checkout, you can make changes until {cutoff}."* Add or up-size items until the food-&-beverage subtotal clears the minimum.

### Step 8 — Proceed to checkout (stops at the auth wall)
Click **"Checkout"**. If not signed in, ezCater **redirects to** `https://www.ezcater.com/create_account?redirect_url=%2Fcheckout%2F{orderId}`.

> **Confirmed: there is no guest checkout.** Event details, **delivery instructions (floor / suite / dock / on-site contact)**, tip, and **payment** all live on the `/checkout/{orderId}` page, which requires an authenticated account. To continue you must **Sign in** or **Sign up** (First name, Last name, Email, Password [min 8 chars, upper+lower+number+special], Phone). With a valid logged-in session, the redirect lands on `/checkout/{orderId}`, where you fill event details + delivery instructions and stop **before** clicking the final pay/place-order button.

### Step 9 — Read order status after placing
Once an order is placed (post-payment, in the authenticated Orders area / confirmation page), ezCater's lifecycle is: **Submitted** (order sent to the caterer, you can still edit until the change cutoff) → **Accepted by Restaurant** (the caterer confirmed). Surface whichever status the order page shows; "Submitted" means awaiting caterer acceptance.

## Site-Specific Gotchas
- **Cloudflare WAF is mandatory-stealth.** The homepage 301s and loads, but `/catering/search/...` shows a "Just a moment…" interstitial. A `--verified --proxies` session clears it in ~5 s — poll `browse get title`/`get url` until the title changes before interacting. A bare remote session (no `--verified/--proxies`) will stall on the challenge.
- **The quantity selector is a Radix combobox, not a `<select>`.** `browse select`/`browse get value` silently fail (`selected: []`, value `""`). There are **zero `<select>` elements** on the item dialog. Open it with **keyboard** (focus button → Space) and pick via **typeahead + Enter**. This is the single biggest automation trap on the site.
- **Ref-clicking the open combobox can close the whole item dialog** (stale-ref coordinate lands on the backdrop). Prefer `browse eval` `.focus()` + keyboard over ref-clicks for the quantity widget; use ref/JS clicks for normal buttons (Add to Cart, Update Item, Checkout).
- **Address comes from proxy IP geolocation unless you pass explicit params.** Default seen: `Portland, OR` (usw2 proxy). Always pass `latitude`/`longitude`/`city`/`state`/`street` in the search URL — they override IP and drive distance + which caterers appear.
- **The `{searchUuid}` is the spine of the order.** It appears as the search-page path segment, as `orderId=` after applying date/time, and as `fulfillmentDetailId=` on menu URLs. Reuse the same id to keep address/date/time/headcount context across pages.
- **Menu URL embeds the date**: `/catering/{slug}/{YYYY-MM-DD}?fulfillmentDetailId={searchUuid}`. Changing the date changes the path segment.
- **Order minimum vs delivery fee.** The "$50 minimum" is **food & beverage only**; the delivery fee ($30 here) does **not** count toward it. The Checkout button is gated until the food/bev subtotal clears the minimum.
- **Availability = presence in results.** There's no per-caterer "sold out" badge for delivery; a caterer that can't meet the chosen date/time/lead-time is simply **omitted** from the filtered results. The date picker disables impossible dates (all past days; earliest = today).
- **Required modifiers default to "Most Popular."** Boxed lunches force bread + chips selections — they pre-select "Most Popular (…)" so you can add to cart without choosing, but the radiogroups must exist/validate. Note dietary needs in special instructions.
- **Don't waste time looking for guest checkout — confirmed it does not exist.** Checkout always redirects unauthenticated users to `/create_account?redirect_url=/checkout/{orderId}`. The cart-building half is anonymous; the checkout half (event details, delivery floor/suite, payment, status) requires login.
- **Tableware is added free by default** ($0.00, plates/napkins/utensils) and is editable from the cart.

## Expected Output
Emit a JSON object describing the stage reached. Representative shapes:

Caterer search / availability check:
```json
{
  "stage": "search_results",
  "delivery_address": "1000 SW Broadway, Portland, OR 97205",
  "date": "2026-06-30",
  "time": "12:00 PM",
  "guests": 25,
  "search_uuid": "3922bf0b-651e-495e-b98a-ce618bab1505",
  "available_caterers": [
    {"name": "Cheryl's on 12th", "rating": 4.9, "reviews": 669, "distance_mi": 0.6, "delivery_fee": "$35", "fulfills_slot": true},
    {"name": "Potbelly Sandwich Shop", "rating": 4.8, "reviews": 158, "distance_mi": 0.3, "delivery_fee": "$30", "fulfills_slot": true}
  ]
}
```

Cart built, ready for (gated) checkout:
```json
{
  "stage": "cart_ready",
  "caterer": "Potbelly Sandwich Shop",
  "menu_url": "https://www.ezcater.com/catering/potbelly-sandwich-shop-portland-sw-th-ave/2026-06-30?fulfillmentDetailId=3922bf0b-651e-495e-b98a-ce618bab1505",
  "order_minimum": "$50.00 food & beverage",
  "line_items": [
    {"item": "Turkey Breast & Swiss Boxed Lunch", "type": "per_person", "unit_price": 16.98, "quantity": 25, "options": {"bread": "Most Popular (White)", "chips": "Most Popular (Assorted)"}}
  ],
  "tableware": "included ($0.00)",
  "subtotal": 424.50,
  "delivery_fee": 30.00,
  "order_total": 466.95,
  "meets_minimum": true
}
```

Checkout reached an auth wall (anonymous session):
```json
{
  "stage": "auth_required",
  "reason": "Checkout requires a signed-in ezCater account; no guest checkout.",
  "redirect_url": "https://www.ezcater.com/create_account?redirect_url=%2Fcheckout%2F5f2fb536-3abe-4e1e-a5cc-475b4a83a942",
  "order_id": "5f2fb536-3abe-4e1e-a5cc-475b4a83a942",
  "completed_before_payment": false
}
```

Order status read (authenticated):
```json
{
  "stage": "order_status",
  "order_id": "5f2fb536-3abe-4e1e-a5cc-475b4a83a942",
  "status": "Submitted",
  "status_detail": "Order sent to caterer; awaiting acceptance. Editable until the change cutoff.",
  "accepted_by_restaurant": false
}
```
