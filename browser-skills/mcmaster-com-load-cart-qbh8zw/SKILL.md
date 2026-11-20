---
name: mcmaster-com-load-cart-qbh8zw
title: McMaster-Carr Load Cart
description: >-
  Load a McMaster-Carr cart (the "Order") with one or more parts by part number
  and quantity, returning each resolved line's description, availability,
  unit/pack price, line total, and the order's merchandise subtotal. Read-only —
  stops at the loaded cart, never logs in or places an order.
website: mcmaster.com
category: ecommerce
tags:
  - ecommerce
  - industrial-supply
  - cart
  - order
  - bulk-order
  - read-only
source: 'browserbase: agent-runtime 2026-06-02'
updated: '2026-06-02'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      McMaster-Carr publishes a Product Information / eCommerce API (linked in
      the site footer) that supports order submission, but it requires an
      approved business account plus a mutual-TLS client certificate issued by
      McMaster. It is not usable for ad-hoc or general agents, so the browser
      Paste-to-Order flow is the practical path.
verified: false
proxies: false
---
# McMaster-Carr Load Cart

## Purpose

Load a McMaster-Carr shopping cart — which McMaster calls the **"Order"** — with one or more parts identified by part number and quantity, then read back what got loaded: each line's product description, stock/availability, unit (or pack) price, extended line total, and the order-level **Merchandise** subtotal. This is **read-only with respect to your account**: it adds line items to the current (anonymous) order and stops there. It never logs in, never selects "Continue as Guest", and never submits/places the order.

## When to Use

- "Add part 91290A115 (qty 5) and 90128A179 (qty 10) to a McMaster cart and tell me the total."
- Bulk-loading a BOM / shopping list of McMaster part numbers to get current per-line and subtotal pricing.
- Validating that a list of part numbers still resolves to real, in-stock products before someone places the order.
- Any "build/load my McMaster order from this list of parts" request that stops short of checkout.

## Workflow

McMaster-Carr's cart is the **Order page at `https://www.mcmaster.com/orders/`** (the header link labeled **ORDER**). The cart is fully usable anonymously — **no login is required to load parts or to see pricing**; login (or "Continue as Guest") is only needed to actually *place* the order, which this skill does not do. **No anti-bot stealth is required**: a bare Browserbase session (no `--verified`, no `--proxies`) loads the page and resolves pricing identically to a stealth session. The site is JS-rendered but the accessibility snapshot is rich and reliable.

The single robust way to load parts via automation is the **"Paste part numbers and quantities"** box, *not* the line-by-line Part number / Quantity input fields (those do not reliably trigger McMaster's price lookup under synthetic input — see Gotchas).

1. **Open a plain session and navigate to the order page.**
   ```bash
   sid=$(browse cloud sessions create --keep-alive | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
   export BROWSE_SESSION="$sid"
   browse open "https://www.mcmaster.com/orders/" --remote
   browse wait load --remote
   ```
   Confirm the title is `Current Order | McMaster-Carr`.

2. **Open the bulk-paste box.** Snapshot the page and click the button labeled **`Paste part numbers and quantities`**.
   ```bash
   browse snapshot --remote     # find the "Paste part numbers and quantities" button ref
   browse click "@<ref>" --remote
   browse wait timeout 1200 --remote
   ```

3. **Fill the paste textarea with one part per line, then click `ADD`.** Re-snapshot to get the textarea ref (label `Paste part numbers and quantities`) and the `ADD` button ref.
   ```bash
   browse fill "@<textarea-ref>" "91290A115 5
   90128A179 10" --remote
   browse click "@<add-button-ref>" --remote
   browse wait timeout 3000 --remote
   ```
   Accepted line formats (shown in the box's own placeholder — any may be mixed):
   - `PARTNUMBER<space>QTY`   → e.g. `3313N116  2`
   - `PARTNUMBER,QTY`         → e.g. `65985K502,5`
   - `<free-text> PARTNUMBER QTY <unit>` → e.g. `Hex nut 95462A029 1 pack`

4. **Read back the loaded order.** Snapshot again. Each loaded line renders, in order, as:
   - an availability banner above the line: **`Ships today`** (in stock) or **`Delivers in 1-3 weeks`** (non-stock / made-to-order),
   - the product name + spec (e.g. `Black-Oxide Alloy Steel Socket Head Screw` / `M3 x 0.5 mm Thread Size, 10 mm Long`),
   - the part number, the quantity, the unit/pack descriptor (e.g. `Packs of 100 each`),
   - the unit price (`$13.23` / `Pack`) and the extended line total (`$66.15`),
   - a `delete line` button.

   The right rail's **Order Summary → Merchandise** cell holds the subtotal (e.g. `$202.15`). Note the **ORDER** header link gains a numeric badge equal to the line count.

5. **Emit the structured result and stop.** Do not log in, do not click `Continue as Guest`, do not press `Send`/`Save for later`/`Print`. Release the session:
   ```bash
   browse cloud sessions update "$sid" --status REQUEST_RELEASE
   ```

## Site-Specific Gotchas

- **"Cart" is called "Order."** The cart lives at `https://www.mcmaster.com/orders/` and the header link is `ORDER` (with `ORDER HISTORY` next to it). There is no "cart" wording anywhere on the page.
- **No login and no stealth needed.** Pricing renders for anonymous users. Verified with both a stealth (`--verified --proxies`) session and a bare session — pricing was byte-identical (`91290A115` → `$13.23/Pack` in both). The pre-run anti-bot probe reported none detected, consistent with what we saw. Don't waste budget on stealth flags.
- **Use the Paste box, NOT the line-by-line inputs.** Typing a part number + quantity directly into the per-line `Part number` / `Quantity` textboxes (via `browse fill` or `browse type`+`Enter`) leaves the text in the field but does **not** trigger McMaster's product lookup — the line never resolves to a product and the Merchandise subtotal stays unchanged. Verified twice (with `Tab` and with `Enter`). The `Paste part numbers and quantities` box is the only input path that reliably commits and prices lines under automation. The "Build order line by line" toggle just switches back to those flaky inputs.
- **`browse fill` accepts multi-line strings** for the paste textarea — pass an actual newline-separated string (each part on its own line). The box parses each line independently and is tolerant of mixed formats (space-delimited, comma-delimited, and free-text-with-embedded-part-number all work in one paste).
- **Non-stock / "Delivers in 1-3 weeks" lines may show `--` for price.** A part can resolve to a valid product (description + spec render) yet show `--` for both unit price and line total, contributing `$0` to the Merchandise subtotal — observed for `94639A102` (Off-White Nylon Unthreaded Spacer), which carried a `Delivers in 1-3 weeks` / `Need this sooner?` banner instead of `Ships today`. Treat a line with a resolved description but `--` price as a distinct, valid outcome (`priced: false`), not a failure. The subtotal only reflects priced lines.
- **Quantity unit is per-pack for pack items.** Many McMaster parts sell in packs (`Packs of 100 each`); the quantity you load is the *number of packs*, and the line total = `quantity × pack price`, not × each-price. Report the unit descriptor alongside the quantity so the number isn't misread as "each".
- **Read-only boundary.** Stop at the loaded order. The right rail shows `Log in to place an order`, `Create login`, and `Continue as Guest` — none of these should be clicked. The top toolbar's `Send`, `Save for later`, `Delete`, and `Print` are also out of scope.
- **The order is session/cookie-scoped.** A freshly created Browserbase session starts with an empty order; loaded lines persist within that session but a brand-new session is empty. There is no "saved cart" to load anonymously — "load cart" here means *populate* the order, not restore a prior one.
- **A genuine McMaster API exists but is gated.** The footer `API` link points to McMaster's Product Information / eCommerce API, which requires an approved business account and a mutual-TLS client certificate. It is not usable for ad-hoc agents — the browser Paste flow is the practical path.

## Expected Output

```json
{
  "cart_url": "https://www.mcmaster.com/orders/",
  "logged_in": false,
  "line_count": 2,
  "lines": [
    {
      "line": 1,
      "part_number": "91290A115",
      "description": "Black-Oxide Alloy Steel Socket Head Screw M3 x 0.5 mm Thread Size, 10 mm Long",
      "availability": "Ships today",
      "quantity": 5,
      "unit": "Packs of 100 each",
      "unit_price": "$13.23",
      "unit_price_basis": "Pack",
      "line_total": "$66.15",
      "priced": true
    },
    {
      "line": 2,
      "part_number": "90128A179",
      "description": "Zinc-Plated Alloy Steel Socket Head Screw M2 x 0.4 mm Thread, 8 mm Long",
      "availability": "Ships today",
      "quantity": 10,
      "unit": "Packs of 100 each",
      "unit_price": "$13.60",
      "unit_price_basis": "Pack",
      "line_total": "$136.00",
      "priced": true
    }
  ],
  "merchandise_subtotal": "$202.15",
  "note": "Applicable shipping and tax will be added."
}
```

Distinct outcome shapes:

```json
// A non-stock line that resolves but shows no price (does not add to subtotal)
{
  "line": 1,
  "part_number": "94639A102",
  "description": "Off-White Nylon Unthreaded Spacer 1/4\" OD, 3/16\" Long",
  "availability": "Delivers in 1-3 weeks",
  "quantity": 3,
  "unit": "Packs",
  "unit_price": "--",
  "line_total": "--",
  "priced": false
}
```

```json
// Mixed order: subtotal reflects only the priced lines
{
  "line_count": 2,
  "lines": [ /* one priced "Ships today" line + one "--" non-stock line */ ],
  "merchandise_subtotal": "$66.15"
}
```
