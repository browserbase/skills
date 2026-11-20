---
name: instacart-com-browse-add-items-guest-gf4i37
title: Instacart Search and Add to Cart (Guest)
description: >-
  Search Instacart for products and add them to the cart as a guest (no login).
  Routes around the un-closable email-capture modal that intercepts user-cursor
  clicks after the first add-to-cart action.
website: instacart.com
category: grocery
tags:
  - grocery
  - instacart
  - cart
  - guest-checkout
  - modal-dismissal
  - anti-bot
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: browser
alternative_methods:
  - method: browser
    rationale: >-
      Instacart exposes no public guest-cart API. The site is a JS-heavy React
      app behind an Akamai/PerimeterX-style edge. All add-to-cart state lives in
      the front-end session and is committed via XHR/GraphQL calls that are
      tightly coupled to fingerprinted cookies. A residential-proxy + verified
      Browserbase session is the only reliable surface.
  - method: api
    rationale: >-
      Not viable for guest carts — verified across iteration: there is no
      documented public endpoint, and the internal GraphQL/Stripe-fingerprinted
      XHRs require auth + cookies + bot-detection signatures that fail to
      reproduce out-of-band.
verified: true
proxies: true
---
# Instacart Search and Add to Cart (Guest)

## Purpose

Search Instacart.com for grocery items and add them to a guest cart (no Instacart account / no login). The skill returns the resulting cart contents — item names, sizes, per-item prices, and the cart subtotal — together with the storefront URL the items were added from. The skill is **read/write** (it mutates a session-scoped cart) but it never logs in, never submits payment, and never completes a checkout. The cart lives entirely in the Browserbase session cookies and is discarded when the session ends.

## When to Use

- An agent collecting a grocery list and pricing it in real time across local retailers without a user account.
- A meal-planner or recipe-cost assistant that needs `current_price × quantity` totals for a basket.
- Price-comparison flows that pre-build a hypothetical cart on Instacart and then hand the user a "Continue in Instacart" deep-link.
- Anywhere a guest, ephemeral, no-PII cart is the desired surface — checkout / address / payment / membership flows are out of scope and belong in separate skills.

## Workflow

> Mandatory session config: `browse cloud sessions create --keep-alive --proxies --verified`. A bare session is fingerprinted and the search results page renders an empty retailer list. `--proxies` (residential) is required to get realistic retailer coverage; `--verified` (advanced stealth) is required to avoid the page-load fingerprint probe escalating to a reCAPTCHA challenge (the page already includes invisible reCAPTCHA — `k=6LeN0vMZAAAAAIKVl68OAJQy3zl8mZ0ESbkeEk1m` — that activates on stealth failure).

### 1. Open a search surface

Three URL shapes work. Pick by intent:

| Intent | URL |
|---|---|
| Cross-retailer search across every nearby store | `https://www.instacart.com/store/s?k={query}` |
| Browse one retailer's storefront (deals, aisles) | `https://www.instacart.com/store/{retailer}/storefront` |
| Search within one retailer | `https://www.instacart.com/store/{retailer}/s?k={query}` |

`{retailer}` is the slug from the storefront URL (e.g. `safeway`, `costco`, `kroger`, `7-eleven`, `grocery-outlet`). The cross-retailer search auto-groups results into per-retailer carousels.

```bash
export BROWSE_SESSION="$sid"
browse open "https://www.instacart.com/store/s?k=milk" --remote
browse wait timeout 3500 --remote   # initial render is async; ~2.5–3s for the retailer carousels
```

The page-load process auto-renders without the auth modal — the modal does **not** appear until the first add-to-cart action.

### 2. First add — direct snapshot click is fine

The very first add-to-cart action (before the auth modal has ever appeared) works with the normal click pattern:

```bash
browse snapshot --remote
# Find a ref like:  [1-4947] button: Add 1 ct Lucerne Whole Milk
browse click "[1-4947]" --remote
browse wait timeout 2500 --remote
```

Two side effects occur:
1. The cart counter in the header increments (e.g. "View Cart. Items in cart: 1" → "Add $X to get $0 delivery fee 1").
2. The page navigates to `/store/{retailer}/storefront` AND the un-closable **"$0 delivery fee on your first 3 orders"** auth modal appears as a `<div role="dialog">` overlay. **Don't try to close it.** See gotchas — there is no close button and it cannot be dismissed by Escape, backdrop click, or any visible UI affordance.

### 3. Subsequent adds — use JS `.click()` to bypass the modal

After the modal first appears, **`browse click` (native mouse-event) is blocked by the dialog's overlay even when targeting buttons outside the modal**. The fix: dispatch the click event directly on the target button via `browse eval`. The underlying React handlers fire normally — the modal blocks the mouse but not the synthetic event.

```bash
# Add by aria-label — works whether the modal is visible or not.
browse eval '(() => {
  const b = document.querySelector("button[aria-label=\"Add 1 ct Lucerne Whole Milk\"]");
  if (!b) return "not-found";
  b.click();
  return "clicked";
})()' --remote
browse wait timeout 2000 --remote
```

Each `Add 1 ct {name}` aria-label is unique per product on the page. After the click succeeds the button morphs into `<button aria-label="Decrement quantity of {name}">` plus a `+` button labeled `Increment quantity of {name}` — that DOM change is the success signal.

To enumerate addable products from the live page (works even with the modal up — `document.querySelector` is not modal-blocked):

```bash
browse eval '(() => Array.from(document.querySelectorAll("button[aria-label^=\"Add 1 ct\"]")).slice(0,20).map(b => b.getAttribute("aria-label")))()' --remote
```

### 4. Reading the cart

The cart counter button lives in the header. Its text shifts based on state: `View Cart. Items in cart: 0` (empty) or `Add $X.XX to get $0 delivery fee N` (non-empty, where N is the item count). To open the cart drawer:

```bash
browse eval '(() => {
  const cart = Array.from(document.querySelectorAll("button"))
    .filter(b => /delivery fee|View Cart/i.test(b.textContent || ""))[0];
  cart?.click();
})()' --remote
browse wait timeout 2000 --remote
```

The drawer renders as another `<div role="dialog">` titled "Personal {Retailer} Cart, Shopping in {ZIP}", with each line item showing name, size, current price (and any strikethrough original), and per-line `+ / 1 ct / trash` controls. The drawer also surfaces:
- `Item subtotal` (with discounts already applied)
- `$X Min. to checkout` (typically $10 — guest carts under the minimum can still be assembled but not checked out)
- "Add $X to get $0 delivery fee" progress

Extract cart contents with the snippet below — it's resilient to the modal being layered on top of the drawer:

```bash
browse eval '(() => {
  const drawers = Array.from(document.querySelectorAll("[role=dialog]"))
    .filter(d => /Personal .* Cart/i.test(d.textContent || ""));
  if (drawers.length === 0) return { error: "cart-drawer-not-open" };
  const drawer = drawers[0];
  const items = Array.from(drawer.querySelectorAll("li, [class*=cart-item], [class*=CartItem]"))
    .map(li => (li.textContent || "").replace(/\s+/g, " ").trim())
    .filter(t => t.length > 5 && /\$/.test(t));
  const subtotalMatch = (drawer.textContent || "").match(/Item subtotal[^$]*\$([0-9.]+)/);
  return JSON.stringify({
    item_lines: items.slice(0, 50),
    subtotal: subtotalMatch ? "$" + subtotalMatch[1] : null
  });
})()' --remote
```

### 5. (Optional) Make the page snapshottable / browseable visually

For workflows that need `browse snapshot` to return a usable accessibility tree (e.g. for navigating aisles, browsing categories, or scrolling through search results visually), neutralize the modal **without dismissing it as the user would** — Instacart never lets you. Three DOM mutations are required together; doing only one or two leaves the page inert:

```bash
browse eval '(() => {
  // 1) Remove the auth dialog itself
  let removed = 0;
  document.querySelectorAll("[role=dialog]").forEach(d => {
    const t = d.textContent || "";
    if (t.includes("delivery fee on your first 3 orders") ||
        (t.includes("Or continue with") && t.includes("Continue"))) {
      d.remove();
      removed++;
    }
  });
  // 2) Remove the modal-open body class that re-applies overflow:hidden and pointer-events:none
  document.body.classList.remove("body--auth-modal-open");
  // 3) Clear aria-hidden on the app shell — Instacart sets aria-hidden="true" on
  //    div#js-app while the modal is open, which blanks the accessibility tree.
  document.getElementById("js-app")?.removeAttribute("aria-hidden");
  document.querySelectorAll("[aria-hidden=\"true\"]").forEach(el => {
    if (el.querySelectorAll("button, a, input").length > 3) el.removeAttribute("aria-hidden");
  });
  return removed;
})()' --remote
```

After this, `browse snapshot` returns the full tree and `browse click [ref]` works on visible buttons. **The auth-modal-dismissal effect is per page load — it must be re-applied after every navigation.** The modal re-mounts on every route change while the session remains unauthenticated.

For programmatic add-to-cart flows that don't need a clean snapshot, you can skip step 5 entirely and just JS-click everything.

### 6. Release the session

```bash
browse cloud sessions update "$sid" --status REQUEST_RELEASE
```

The guest cart is **not** persisted — closing the Browserbase session discards it. If the cart contents are the deliverable, extract them in step 4 before releasing.

## Site-Specific Gotchas

- **The "$0 delivery fee on your first 3 orders" modal has no Close affordance.** The DOM contains two `<button aria-label="Close">` elements inside the dialog, but both are rendered with `width:0; height:0` (verified via `getBoundingClientRect()` returning all-zeros and `offsetParent === null`). There is no visible X. Escape key does not dismiss. Clicking the modal backdrop does not dismiss. The only "exits" the modal offers are paths into authentication (email, Google, Phone, Log in). **Dismissal requires DOM mutation** (`d.remove()`); see step 5.

- **Snapshot returns empty unless aria-hidden is cleared.** When the modal is open, Instacart sets `aria-hidden="true"` on `<div id="js-app">`, which contains 60+ buttons. `browse snapshot` honors aria-hidden and returns a single empty StaticText. Symptom: snapshot looks like the page is blank even though the screenshot shows full content. Fix is in step 5 — `document.getElementById("js-app").removeAttribute("aria-hidden")` plus removing `body--auth-modal-open` class.

- **Native `browse click` is intercepted by the modal even on buttons outside the modal.** When the auth dialog is open, the modal's overlay sits above the page and absorbs cursor events. Symptom: `browse click [ref]` returns `{"clicked": true}` but the page state doesn't change (cart counter doesn't increment, drawer doesn't open). **Use `browse eval` with `button.click()` instead** — the synthetic event reaches the React handler directly and the modal's pointer-events shield is irrelevant. This is the single most important pattern in the skill.

- **First add is special.** The auth modal does not mount until the first successful add-to-cart. So the very first `Add 1 ct` click works fine with `browse click [ref]`. From the second add onward — whether on the same page or any subsequent page — assume the modal is up and use JS-click.

- **The cart counter button doubles as the cart drawer trigger.** It has two text variants: `View Cart. Items in cart: N` (empty/initial) and `Add $X.XX to get $0 delivery fee N` (with items). Selecting by aria-label or stable class is fragile — match by regex on `textContent` against `/delivery fee|View Cart/i`.

- **Cart drawer is a separate `<div role="dialog">`.** When opened with items in cart, there are now two dialogs in the DOM: the auth modal (centered) and the cart drawer (right-rail). Filter by text content (`/Personal .* Cart/i` for the cart drawer, `/delivery fee on your first 3 orders/` for the auth modal) — don't index by position.

- **IP-based ZIP geolocation, no URL override.** The page picks a ZIP based on the request IP (in our trace, `97818` Heppner OR from a Browserbase residential proxy in the Pacific NW). Appending `?zip_code=10001` to the URL does **not** override — the page silently ignores the param and continues using the IP-derived ZIP. To change the address you must either (a) click the ZIP button in the header and use the picker UI, or (b) choose a Browserbase proxy region whose egress IP geolocates to the target metro. The retailer set returned by the search is gated on the active ZIP, so this matters: a 97818 search for "milk" surfaces Safeway / Grocery Outlet / CHEF'STORE / 7-Eleven and excludes urban chains like Whole Foods / Target.

- **Clicking "Add" on a cross-retailer search result navigates to that retailer's storefront.** `/store/s?k=milk` shows item carousels grouped by retailer. Clicking `[1-XXXX] Add 1 ct Lucerne Whole Milk` from the Safeway carousel does two things atomically: adds to cart AND `pushState`'s to `/store/safeway/storefront`. The cross-retailer search is not a place you stay — it's a routing surface.

- **In-store search canonicalizes URL form.** `https://www.instacart.com/store/{retailer}/search/{query}` returns 404 ("Page not found"). The correct form is `https://www.instacart.com/store/{retailer}/s?k={query}` — note the `s` (singular) and the `?k=` query param.

- **No public guest-cart API.** Internal mutations go through Stripe-fingerprinted XHRs (Stripe `m-outer-*.html` is injected on every page) and Akamai/PerimeterX-checked GraphQL endpoints. Out-of-band reproduction of the cart-mutation calls fails — the cookies and `__shared_params__` are bound to the Browserbase session. The browser surface is the only reliable path; treat any "scrape the JSON API" suggestion as a dead end.

- **Invisible reCAPTCHA is present on every page.** Site key `6LeN0vMZAAAAAIKVl68OAJQy3zl8mZ0ESbkeEk1m`. It does not challenge in a verified+proxies session, but a bare-session run was observed to escalate. If your run starts failing with "session not interactive" or repeated XHR 403s, the captcha bframe has likely activated — restart with stealth on.

- **Cart minimum is $10 to advance to checkout.** Sub-$10 guest carts are valid (the drawer renders correctly, items can be added/removed) but the "Complete your cart" CTA is greyed. This skill stops at the assembled-cart stage; the minimum constraint matters only if downstream steps want to proceed to checkout.

## Expected Output

```json
{
  "success": true,
  "retailer": "Safeway",
  "zip": "97818",
  "storefront_url": "https://www.instacart.com/store/safeway/storefront",
  "items": [
    {
      "name": "Lucerne Whole Milk",
      "size": "128 fl oz",
      "quantity": 1,
      "unit_price_usd": 3.99
    },
    {
      "name": "Signature SELECT Pie, Blackberry, Lightly Glazed",
      "size": "4 oz",
      "quantity": 1,
      "unit_price_usd": 0.58,
      "original_price_usd": 2.30,
      "deal": "75% off"
    },
    {
      "name": "Signature SELECT Pie, Lemon, Lightly Glazed",
      "size": "4 oz",
      "quantity": 1,
      "unit_price_usd": 0.58,
      "original_price_usd": 2.30,
      "deal": "75% off"
    },
    {
      "name": "Oven Joy White Enriched Bread",
      "size": "20 oz",
      "quantity": 1,
      "unit_price_usd": 2.14
    }
  ],
  "subtotal_usd": 5.15,
  "subtotal_original_usd": 8.59,
  "checkout_minimum_usd": 10.00,
  "checkout_ready": false,
  "ready_delta_usd": 4.85
}
```

Alternative outcome shapes:

```json
// Guest-cart construction was successful but ZIP didn't yield the requested retailer
{ "success": true, "retailer": "Safeway", "fallback_from_requested": "Whole Foods", "items": [...] }

// Modal-dismissal mutation triggered but item add still failed (rare — usually means
// a captcha challenge surfaced; recommend restart with fresh verified+proxies session)
{ "success": false, "reason": "add_to_cart_silent_failure", "attempts": 3, "cart_count_after": 0 }

// No retailer available for the IP-derived ZIP
{ "success": false, "reason": "no_retailers_for_zip", "zip": "97818", "query": "specialty-vegan-cheese" }
```
