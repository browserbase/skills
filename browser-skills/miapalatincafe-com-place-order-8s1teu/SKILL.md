---
name: miapalatincafe-com-place-order-8s1teu
title: Mi Apá Latin Café Place Delivery Order
description: >-
  Build a Mi Apá Latin Café delivery cart on the Toast-Sites ordering page:
  switch to delivery, set address via Google Places typeahead, add 1–2 items
  (every item opens a modifier modal), fill guest checkout, and reach the
  on-page Payment section. Read-only — stops before Place Order. Documents
  Toast's phone-entry OTP trap and the host-mismatch 404.
website: miapalatincafe.com
category: food-delivery
tags:
  - restaurants
  - delivery
  - toast
  - checkout
  - read-only
  - gainesville
source: 'browserbase: agent-runtime 2026-05-22'
updated: '2026-05-22'
recommended_method: browser
alternative_methods:
  - method: browser
    rationale: >-
      Toast Sites ordering is purely browser-driven for guests. Toast publishes
      merchant-side and partner APIs (auth required) but no public guest
      ordering API; the customer frontend talks to ws-api.toasttab.com over an
      unstable internal contract, so attempting an HTTP shortcut is not worth it
      for a one-restaurant skill.
verified: true
proxies: true
---
# Mi Apá Latin Café — Place Delivery Order (Toast)

## Purpose

Build a delivery cart at Mi Apá Latin Café (Gainesville, FL — multi-location restaurant) on its Toast-Sites-powered ordering page, drop in 1–2 menu items with default modifiers, fill the guest checkout form (email, first name, last name, phone, delivery address), and arrive at the on-page Payment section. **Read-only — never click "Place Order".** Returns the cart contents, fee/tax/tip breakdown, observed payment methods, and the final total that would be charged.

## When to Use

- Pre-flighting a Mi Apá delivery order before a human takes over to enter card details (most common: a buyer-side assistant gathers a draft cart + total for user approval).
- Quoting current delivery fee + tax + tip line items for a specific cart at a specific delivery address.
- Verifying whether an address is in the delivery radius (the page shows "Confirm you're in delivery range" → after address entry, either the cart accepts it or surfaces an out-of-range error).
- Probing the live menu (prices, modifier groups, availability) from a logged-out, address-scoped delivery context — the menu and prices match what a paying customer would see.

## Workflow

The ordering UI is served by Toast Sites embedded on the restaurant's own domain (`miapalatincafe.com/order/...`), not on `toasttab.com`. There is **no public Toast ordering API for guests** — the published Toast APIs are merchant-side (auth required). Browser is the only path. Cloudflare is in front; `--verified --proxies` works reliably but a bare session likely works too (no aggressive anti-bot was observed in iter-1).

### 1. Stealth session

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$SID"
```

### 2. Pick a location and open the ordering page

Mi Apá has four Gainesville/Alachua-area locations, each with its own Toast slug. The brand's homepage lists them; the canonical slug for the SW 34th St flagship is below.

| Location | Address | Toast slug |
|---|---|---|
| **34th St (flagship)** | 114 SW 34th St, Gainesville, FL 32607 | `mi-apa-latin-cafe-34th` |
| Newberry Rd Suite B | 14209 W Newberry Rd, Suite B | `mi-apa-latin-cafe-14209-w-newberry-rd-suite-b` |
| Oaks Mall Kiosk | 6419 W Newberry Rd Ste G2 | `mi-apa-latin-cafe-mall-kiosk-6419-w-newberry-rd-ste-g2` |
| Alachua | 14829 NW 157th Pl, Alachua, FL 32615 | `mi-apa-latin-cafe-of-alachua` |

```bash
browse open "https://miapalatincafe.com/order/<slug>" --remote
browse wait load --remote
browse wait timeout 3000 --remote      # menu hydrates ~2s after load
```

**Do NOT** open `https://www.toasttab.com/order/<slug>` — that path is for Toast back-office and renders the Toast 404 "Sorry! This dish is no longer on the menu" page (with Home/Menus/Employees/Reports links). The customer-facing ordering URL is on `miapalatincafe.com`.

### 3. Switch to Delivery mode

The page defaults to **Pickup** at the location. Snapshot and click `button: Switch to Delivery`. After clicking, the right-side status panel changes from "Pickup at 114 SW 34th Street" / "ASAP – Pickup in 11–16 min" to "Confirm you're in delivery range" / "ASAP – Estimated in 45–50 min".

```bash
browse snapshot --remote                            # find ref of "button: Switch to Delivery"
browse click <delivery-ref> --remote
```

### 4. Set delivery address

Click `button: Confirm you're in delivery range Set delivery address`. A modal opens with one textbox `Enter your delivery address` and a "Sign in" upsell ("Want faster checkout?") — ignore the upsell.

```bash
browse click <confirm-range-ref> --remote
browse click <address-textbox-ref> --remote
browse type "4000 SW 20th Ave, Gainesville" --remote
# Wait for Google Places autocomplete dropdown (~1-2s)
browse wait timeout 2000 --remote
browse snapshot --remote
# Click the first `option: <full address>, USA` from the autocomplete listbox
browse click <first-option-ref> --remote
```

A second modal "Confirm address" then opens with the resolved address, optional "Additional details" (apt/suite) and "Delivery instructions" (e.g. "Ring doorbell"), and **Cancel / Confirm** buttons. Click `button: Confirm`. The main page now shows "Delivery to 4000 SW 20th Ave" in the status panel.

If the address is outside the delivery radius, the second modal surfaces an "outside delivery range" error in place of the Confirm button — capture the message and emit `success: false, reason: "outside_delivery_radius"`.

### 5. Add 1–2 menu items

Featured items at the top of the menu currently include Iced Coffee ($3.50+), Café con Leche ($2.50+), Miami sandwich ($13.50). The menu is organized into MENU / CATERING tabs and several scrollable sections; you may need to scroll or use the in-page Search to find a specific item.

For each item:

1. Click the item card (`link: <Item Name>` or its Add-to-Cart button — both open the same modifier modal).
2. A modal `dialog: <Item Name>` opens with "Customize your item" — modifier groups (e.g. "Mayo Mods", "Starters Mod"), an optional "Special Instructions" text area, and a Quantity stepper defaulting to 1. **All items open this modal, even simple ones like Chicken Empanada — there is no quick-add.**
3. To accept defaults, ignore all modifier groups (most are "Select up to 1" optional) and click `button: Add to Cart $X.XX` at the bottom of the modal.
4. After clicking, the modal becomes an upsell panel `1 Item(s) added to your cart` with `button: View cart` and a "People also ordered" carousel. The carousel's `+` buttons **do not quick-add** — they open the same modifier modal for the suggested item.

```bash
browse click <item-link-ref> --remote
browse wait timeout 1500 --remote
browse snapshot --remote
browse click <"Add to Cart $X.XX"-ref> --remote
browse wait timeout 1500 --remote
```

### 6. Open cart and proceed to checkout

From the post-add upsell, click `button: View cart` to open the cart drawer (`dialog: Your delivery order`). The drawer shows each line item with quantity controls, then **Subtotal**, **Delivery** (fee), **Tax**, and a `link: Checkout $XX.XX`.

```bash
browse click <view-cart-ref> --remote
browse wait timeout 1000 --remote
browse click <"Checkout $XX.XX"-ref> --remote        # navigates to /checkout
browse wait load --remote
browse wait timeout 3000 --remote
```

### 7. Fill the checkout form — ORDER MATTERS

The `/checkout` page is **single-page**: Contact, Delivery details (auto from step 4), Order details (collapsed cart), Add a driver tip (default 20%, pre-selected), Stay in touch checkboxes, Discounts (Promo Code / Gift Card), Subtotal/Delivery/Tax/Driver tip/Total, and a **Place Order** button at the bottom. The Payment iframe (card fields) is rendered between the tip and the Stay-in-touch section.

The Contact section has four fields: `Email`, `First name`, `Last name`, `Phone number` (with US flag combobox prefix `+1`).

```bash
browse fill <email-ref>      "test+order@example.com" --remote
browse fill <first-name-ref> "Test"                   --remote
browse fill <last-name-ref>  "User"                   --remote
# Fill phone LAST and use `fill` (not `type`) — see OTP gotcha below
browse fill <phone-ref>      "3525550123"             --remote
```

**🚨 Phone-entry OTP trap (must-read gotcha):** as soon as the phone field receives a complete 10-digit US number (or whatever Toast considers complete), Toast pops a blocking dialog **"Confirm it's you. Enter the code sent to (XXX) XXX-XXXX to securely log in or sign up."** with six OTP input boxes, "Resend code", and "Change number". The dialog **also clears the email / first name / last name fields** that were previously filled.

The dialog has a `button: Checkout as guest` at the bottom (below an "or" separator). Click it to dismiss the OTP, then **re-fill email / first / last** (phone retains its value). **Do NOT re-type the phone after dismissing** — Toast remembers it and won't re-prompt, but typing it again will re-trigger the OTP.

```bash
# After phone fill, OTP dialog appears:
browse snapshot --remote
browse click <"Checkout as guest"-ref> --remote
browse wait timeout 1500 --remote
# Re-fill the three fields the OTP dialog wiped:
browse fill <email-ref>      "test+order@example.com" --remote
browse fill <first-name-ref> "Test"                   --remote
browse fill <last-name-ref>  "User"                   --remote
```

### 8. Reach the Payment step (do NOT submit)

Scroll down. Verify the Payment section header is visible with the accepted-card-logo strip (Visa / Amex / Discover / Diners / Mastercard) and a radio-selected `Card` option above an iframe-rendered card form: **Card number \***, **Expiration date \***, **Security code \***, **Zip code \*** (the iframe lives in a separate accessibility-tree frame — in a snapshot these refs use a frame prefix like `[9-X]` rather than the main `[2-X]`).

Capture the totals just above the **Place Order** button: Subtotal, Delivery, Tax, Driver tip, **Total**.

**🛑 STOP. Do NOT click `button: Place Order`. Do NOT type into the card iframe.**

### 9. Release the session

```bash
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

## Site-Specific Gotchas

- **READ-ONLY.** Never click `Place Order`. Never enter card data into the Adyen-style iframe (`textbox: Card number *`, etc., in a child frame).
- **Wrong host = Toast 404.** `https://www.toasttab.com/order/mi-apa-latin-cafe-34th` renders a Toast back-office 404 page ("Sorry! This dish is no longer on the menu" with Home/Menus/Employees/Reports buttons). The customer-facing ordering URL lives on the brand domain: `https://miapalatincafe.com/order/<slug>`. The slugs are the same, only the host differs.
- **🚨 Phone-entry pops an SMS OTP modal AND wipes other Contact fields.** When the phone-number field receives a 10-digit US number, Toast immediately pops a `dialog: Confirm it's you` for SMS OTP, and the modal-open side-effect clears the `Email`, `First name`, `Last name` text inputs. Escape: click `button: Checkout as guest` at the bottom of the dialog (below an "or" divider), then re-fill the three wiped fields. The phone field retains its value across the dismiss. **Fill phone LAST** so the wipe only costs you the OTP-dismiss roundtrip, not all four field re-fills.
- **No quick-add — every item opens a modifier modal.** Even items with zero required modifiers (Chicken Empanada, French Fries) open `dialog: <Item Name>` with a "Customize your item" panel and "Add to Cart $X.XX" button. The `+` icons in the "People also ordered" upsell are NOT shortcuts — they open the same modal. Plan on at least 2 clicks (open + add) per cart item.
- **Default service mode is Pickup**, not Delivery. You must click `button: Switch to Delivery` before the address-entry button appears. Pickup default also exposes a different ETA ("Pickup in 11–16 min" vs "Estimated in 45–50 min" for delivery).
- **Delivery address is set in TWO modals**, not one: (1) "Delivery address" with the Google Places typeahead; (2) "Confirm address" with optional apt# / delivery instructions and a Cancel/Confirm pair. The second modal can also surface the out-of-radius error.
- **Google Places typeahead requires a wait.** After typing the address, snapshot too fast and `[2-X] option: ...` rows aren't in the tree yet. `browse wait timeout 2000` between `type` and `snapshot` is reliable.
- **Service-fee math (verified iter-1, 4000 SW 20th Ave delivery):** $17.00 subtotal → +$5.99 delivery fee, +$1.28 tax (~7.5%), +$3.66 default driver tip (20% of subtotal, pre-selected radio). Total = $27.93. Tip presets: 25% / 20% / 18% / 15% / Custom; 20% is pre-selected and applied even if you never touch it.
- **Delivery partner is Uber** (per Toast disclosure footer: "By placing this order for delivery, you authorize Toast to share your delivery information with our delivery partner Uber"). This is opaque on the menu page — the partner only appears at checkout.
- **Card-only payment.** Only `radio: Card` is offered in the Payment section — **no Apple Pay, no Google Pay, no PayPal** observed at this restaurant. The accepted-card strip shows Visa, Amex, Discover, Diners, Mastercard. The card form is iframed (Toast's payments.toasttab.com), so its fields live in a separate frame in the accessibility tree (e.g. `[9-3] textbox: Card number *`).
- **`browse fill` vs `browse type` on phone.** Both end up triggering OTP, but `fill` is preferred for all four Contact fields because it clears existing text first, which is needed when re-filling after the OTP-dismiss wipes everything. **Do not pass `--press-enter`** to phone fill — Enter would submit the OTP empty-string and wedge the dialog.
- **No catering / kiosk path here.** The page has a top tab `button: CATERING` that swaps the menu to catering-only items (large-format trays, "48 HR NOTICE" disclaimers). For an ASAP delivery skill, stay on the default `button: MENU` tab.
- **Cloudflare in front, but bare-session-friendly.** Iter-1 ran with `--verified --proxies`; no captcha or 403 was encountered. The `__cf_bm` cookie is set on first load. A bare session would likely work, but the converged flow above uses both flags as a defensive default.
- **No documented public guest-ordering API.** Toast publishes merchant APIs (auth required) and an integrator partner API. The customer flow goes through Toast's frontend GraphQL+REST on `ws-api.toasttab.com`, but no stable contract is exposed for unauthenticated callers, so don't try to short-circuit to the API.

## Expected Output

Single primary outcome shape (successful arrival at the Payment step):

```json
{
  "success": true,
  "location_slug": "mi-apa-latin-cafe-34th",
  "location_name": "Mi Apá Latin Café Gainesville",
  "location_address": "114 SW 34th Street, Gainesville, FL 32607",
  "service_mode": "delivery",
  "delivery_address": "4000 SW 20th Ave, Gainesville, FL 32607",
  "delivery_radius_ok": true,
  "estimated_eta_minutes": "45-50",
  "delivery_partner": "uber",
  "cart_items": [
    { "name": "Miami",            "qty": 1, "unit_price": "$13.50", "modifiers": [] },
    { "name": "Chicken Empanada", "qty": 1, "unit_price": "$3.50",  "modifiers": [] }
  ],
  "subtotal": "$17.00",
  "delivery_fee": "$5.99",
  "tax": "$1.28",
  "driver_tip": { "selected_preset": "20%", "amount": "$3.66" },
  "total": "$27.93",
  "checkout_form_fields_observed": ["email", "first_name", "last_name", "phone_number"],
  "payment_methods_offered": ["card"],
  "accepted_card_brands": ["visa", "amex", "discover", "diners", "mastercard"],
  "payment_step_reached": true,
  "stopped_before": "Place Order button",
  "error_reasoning": null
}
```

Failure / partial shapes:

```jsonc
// Address out of delivery radius (second modal shows an error in place of Confirm)
{
  "success": false,
  "reason": "outside_delivery_radius",
  "delivery_address": "<input address>",
  "error_message": "<exact text from Confirm address modal>"
}

// Restaurant closed for online ordering at this time
{
  "success": false,
  "reason": "online_ordering_closed",
  "location_slug": "...",
  "error_message": "<banner text e.g. 'We are not accepting online orders right now'>"
}

// Wrong host used (Toast back-office 404)
{
  "success": false,
  "reason": "wrong_host",
  "error_message": "Sorry! This dish is no longer on the menu.",
  "fix": "Use https://miapalatincafe.com/order/<slug>, not https://www.toasttab.com/order/<slug>"
}
```
