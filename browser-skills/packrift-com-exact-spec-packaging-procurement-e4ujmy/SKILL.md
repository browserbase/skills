---
name: packrift-com-exact-spec-packaging-procurement-e4ujmy
title: Packrift Exact-Spec Packaging Procurement
description: >-
  Find exact-match Packrift packaging SKUs for a buyer requirement via the
  Packrift MCP, confirm live price and inventory, and return a measured cart or
  quote handoff without substituting nearby products as exact matches.
website: packrift.com
category: ecommerce-procurement
tags:
  - packaging
  - procurement
  - mcp
  - exact-match
  - shipping-supplies
  - cart-handoff
source: 'browserbase: agent-runtime 2026-06-03'
updated: '2026-06-03'
recommended_method: mcp
alternative_methods:
  - method: browser
    rationale: >-
      packrift.com renders product pages with live SKU, per-case/per-unit price,
      case count, and stock state at /products/{handle} (append ?ref=mcp for
      attribution). Usable as a read-only fallback to verify a SKU when the MCP
      is unreachable, but it does not enforce the AI_APPROVE exact-match gate,
      so it is strictly inferior for exact-spec procurement.
  - method: fetch
    rationale: >-
      The MCP is plain JSON-RPC over HTTPS POST; any HTTP client (not just an
      MCP SDK) can call it. Use this when no MCP client is available. A simple
      GET-only fetch tool cannot drive it because every tool call is a POST.
verified: true
proxies: true
---
# Packrift Exact-Spec Packaging Procurement

## Purpose

Find the exact Packrift packaging SKU(s) that satisfy a buyer's hard requirement (dimensions, material, color, adhesive/closure, printer compatibility, case/pack count, and/or a named SKU), confirm **live** unit price + line total and stock through the Packrift MCP server, and return a measured cart handoff URL or a bulk-quote handoff. This skill is read-only with respect to orders: it discovers, verifies, and hands off a cart/quote — it never places an order. Its defining rule is honesty about exactness: dimensions, material, color, adhesive, printer compatibility, case count, and SKU are treated as exact-match constraints, and a near miss is routed to a quote rather than presented as an exact match.

## When to Use

- A buyer gives a precise packaging spec ("10×5 white 2-mil poly bubble mailer, self-seal, case of 250") and you must return the exact Packrift SKU plus live price and stock.
- A buyer names a SKU directly ("reorder B829, 4 cases") and you need a confirmed cart or reorder handoff.
- A buyer has item dimensions and a use case but no SKU, and needs the smallest fitting box/mailer (fit recommendation, not an exact-spec match).
- A buyer wants a competitor/Uline-style spec cross-walked to a Packrift equivalent (alternative candidate, not an exact match).
- A buyer's exact spec (unusual color, adhesive, pack count, dimension) has no exact Packrift match and must be routed to a bulk quote rather than substituted.

## Workflow

The optimal path is the **Packrift MCP server** at `https://mcp.packrift.com/mcp`. It is plain JSON-RPC 2.0 over HTTP POST (Streamable HTTP transport), **stateless** (no `mcp-session-id` needed), unauthenticated, and returns live (never cached) price/inventory. Every product-bearing tool is `AI_APPROVE`-gated, so the server itself enforces the exact-match discipline. Do not scrape the storefront for this task — the MCP is faster, returns structured SKU/variant/price/stock plus ready-made attributed handoff URLs, and is the source of truth.

Handshake once, then call tools:

1. **`initialize`** — POST `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{...}}}` with header `Accept: application/json, text/event-stream`. Read the returned `instructions` field — it documents the intended tool sequence. (`tools/list` enumerates all 15 tools.)

2. **Locate candidate SKU(s)** with the tool that matches what the buyer gave you:
   - Named keyword/type, no dimensions → **`search_products`** `{query, limit}`. Returns `approved_sku`, `approved_variant_id`, `price_range`, `in_stock`, and a `match.match_type` of `keyword_or_exact_search`.
   - A specific SKU → skip discovery; go straight to step 4 with **`prepare_purchase_handoff`**.
   - Item dimensions + use case (`mailer|box|fragile|apparel|ecommerce`) → **`find_packaging_for_item`** `{item_length_in,item_width_in,item_depth_in,item_weight_lb,use_case}`. Returns up to 5 SKUs ranked by fit with `match.match_type: fit_recommendation`. **Fit ≠ exact spec** — only promote to exact match if the returned dimensions/material/etc. equal the buyer's constraints.
   - Competitor/Uline-style spec → **`compare_alternatives`** `{requested_spec, competitor_reference?}`. Returns `match.match_type: alternative_candidate`. These are **never** exact matches; present as alternatives requiring buyer confirmation.

3. **Verify the exact-match constraints** against the catalog truth with **`get_product`** `{handle}`. The `dimensions` block and the `metafields` array carry the per-attribute spec of record: `Material`/`strength_material`, `color`, `spec*_name`/`spec*_value` (Material, Dimensions, Color, Case Quantity, Recyclable), `item_length`/`item_width`/`item_height`, `qty_per_shipping_unit` (e.g. "250 PER CASE"), `shipping_uom` (CASE), and `ships_ups` (Y/N — the printer/carrier-compat analog). Compare each buyer constraint to these fields. If any of dimension, material, color, adhesive/closure, printer/carrier compat, or case count differs, this is **not** an exact match — go to step 6.

4. **Confirm live price + inventory.** Either call the two primitives, or let `prepare_purchase_handoff` do all of it:
   - **`get_pricing`** `{variant_ids:["<id-as-STRING>"], quantity}` → `unit_price`, `line_total`, `available_quantity`, `currency`. Variant IDs **must be strings**, never numbers.
   - **`check_inventory`** `{variant_ids:["<id-as-STRING>"]}` → `available`, `in_stock`. (`inventory_status` gives a richer, location-level view.)
   - Preferred shortcut: **`prepare_purchase_handoff`** `{sku, quantity, buyer_confirmed:false}` runs the AI_APPROVE gate + `get_product` + `get_pricing` + `check_inventory` in one call and returns `status:"live_confirmed_awaiting_buyer_confirmation"` with `live_confirmation.price_ok` / `inventory_ok` and `cart:null`.

5. **Hand off the cart** only after the buyer confirms the exact SKU and quantity:
   - **`prepare_purchase_handoff`** `{sku, quantity, buyer_confirmed:true}` → `status:"cart_handoff_ready"`, `cart.url` = measured `https://mcp.packrift.com/r/cart/{SKU}?...` landing (this is the **primary** buyer handoff), and `cart.final_cart_url` = Shopify cart permalink (destination evidence only). No order is created.
   - Equivalent direct call: **`create_cart_url`** `{sku, quantity, source_context:"exact_match"}`. Same shape; use after price/inventory are confirmed.
   - For procurement/repeat-buy instead of a cart: **`get_reorder_link`** `{sku}` → `reorder_url`, `product_url`, and `copy_procurement_spec` text.

6. **No exact match → route to a quote, never substitute.** Call **`explain_no_exact_match`** `{requested_spec, missing_or_mismatched_fields:[...], reason}` to get the substitute-prevention policy plus a tracked `quote_url`, or **`get_bulk_quote_link`** `{requested_spec, family?, sku?, quantity?}` for a direct bulk-quote URL. Present the quote handoff and explicitly tell the buyer which attribute(s) could not be matched. Do **not** relabel a `fit_recommendation` or `alternative_candidate` as an exact match.

Always preserve the `?ref=mcp` attribution on every URL you surface, and pass `mcp_source_context` / `mcp_install_target` on handoff calls when running inside a directory/agent host so the measured cart URL stays source-preserving.

### Browser fallback (read-only, inferior)

If the MCP is unreachable, you can verify a single known SKU on the storefront: open `https://packrift.com/products/{handle}?ref=mcp`. The page shows SKU, per-case and per-unit price, "SOLD IN CASE OF N", in-stock badge, and a quantity selector (see screenshot `01`). The Shopify cart permalink `https://packrift.com/cart/{variant_id}:{qty}` forwards to a prefilled checkout (screenshot `02`) — that is the cart-handoff destination, not an order. This path does **not** enforce the AI_APPROVE exact-match gate and gives you no structured match-type signal, so use it only to confirm, never to discover candidates for an exact-spec requirement.

## Site-Specific Gotchas

- **Transport:** the MCP is Streamable HTTP JSON-RPC. You must send `Accept: application/json, text/event-stream` on every POST or some clients get a 406. It is **stateless** — responses carry no `mcp-session-id`, so you can fire `tools/call` immediately after `initialize` (or even without it). No auth header is required.
- **No stealth/proxy needed for the MCP path.** The endpoint is a plain unauthenticated HTTPS API with no anti-bot. The `verified`/`proxies` flags on this skill reflect the session this run happened to use; a bare HTTP client reaches the MCP fine. Proxies/verified only matter for the browser fallback.
- **Variant IDs are strings, always.** `get_pricing`, `check_inventory`, and `get_shipping_estimate` reject numeric variant IDs — encode them as JSON strings, e.g. `["53441909588336"]`. The `sku` shortcut on `prepare_purchase_handoff`/`create_cart_url` avoids this entirely.
- **`match.match_type` is the exactness signal — read it every time.** `keyword_or_exact_search` / `exact_match` / `exact_sku_or_handle` may be exact; `fit_recommendation` (from `find_packaging_for_item`) is dimensional fit, not spec equality; `alternative_candidate` (from `compare_alternatives`) is explicitly a near-equivalent. Each result also carries `match.unsafe_substitute_blocked`. Never promote a fit/alternative result to "exact" without verifying every constraint in `get_product` metafields.
- **Cart handoff requires `buyer_confirmed:true`.** `prepare_purchase_handoff` returns `cart:null` until you re-call with `buyer_confirmed:true`; that is by design, not a failure. `create_cart_url` will build a URL directly, but the server expects you to have run `get_pricing` + `check_inventory` first.
- **The MCP "cart" never places an order.** `cart.url` is a measured `/r/cart/{SKU}` landing that records an `mcp_cart_landing` event then forwards to a Shopify checkout permalink (`final_cart_url`). Present `cart.url` as the handoff; treat `final_cart_url` as destination evidence only. Opening either just prefills a cart/checkout — it does not buy anything.
- **Case vs. each.** Most catalog items are sold by the case (`shipping_uom: "CASE"`, `qty_per_shipping_unit: "250 PER CASE"`). `quantity` in pricing/cart calls is the number of **cases/units of the listed pack**, not individual mailers. A `quantity:4` on a 250/case SKU is 4 cases = 1000 mailers, line total = 4 × case price.
- **Exact-match attributes live in metafields, not top-level.** `get_product.dimensions` only has length/width (depth often `null` for mailers). Color, material/mil, closure, case count, and carrier compat (`ships_ups`) come from the `metafields` array (`spec*` pairs, `color`, `strength_material`, `qty_per_shipping_unit`, `ships_ups`). There is also a `spec_json` metafield with a compact machine-readable summary.
- **Don't waste time looking for an "order"/"checkout submit" tool — there isn't one and shouldn't be used.** The skill's terminal state is a cart or quote handoff. Stop there.
- **No anti-bot wall encountered.** Across the full MCP flow (15 tools enumerated, ~11 exercised end-to-end) and storefront product/checkout pages, no captcha, 403, or login wall appeared.

## Expected Output

Return a compact record. Shapes by outcome:

**1. Exact match confirmed + cart handoff ready** (recommended terminal state):
```json
{
  "outcome": "exact_match_cart_ready",
  "sku": "B829",
  "variant_id": "53441909588336",
  "title": "10x5 Bubble Lined Poly Mailers 2 Mil White - 250 Case Pack",
  "matched_constraints": {
    "dimensions_in": "10 x 5",
    "material": "2 Mil Polyethylene / 3/16\" Bubble Lining",
    "color": "White",
    "closure": "Self-Seal / Peel and Seal",
    "case_count": "250 per case",
    "ships_ups": "Y"
  },
  "match_type": "keyword_or_exact_search",
  "live": { "unit_price": 58.27, "currency": "USD", "quantity": 4, "line_total": 233.08, "available_quantity": 500, "in_stock": true },
  "cart_handoff": {
    "primary_url": "https://mcp.packrift.com/r/cart/B829?ref=mcp&qty=4&utm_source=chatgpt-mcp&...",
    "final_cart_url": "https://packrift.com/cart/53441909588336:4?ref=mcp&...",
    "no_order_created": true
  }
}
```

**2. Exact SKU, procurement/reorder handoff** (repeat-buy path):
```json
{
  "outcome": "reorder_handoff",
  "sku": "B829",
  "title": "10x5 Bubble Lined Poly Mailers 2 Mil White - 250 Case Pack",
  "live": { "unit_price": 58.27, "currency": "USD", "in_stock": true, "available_quantity": 500 },
  "reorder_url": "https://packrift.com/pages/reorder-packaging-by-sku?...&sku=B829#sku-B829",
  "copy_procurement_spec": "SKU B829: 10x5 Bubble Lined Poly Mailers 2 Mil White - 250 Case Pack. Product URL: https://packrift.com/products/10x5-bubble-lined-poly-mailers-2-mil-white-250-case-pack"
}
```

**3. Fit recommendation (dimensions given, NOT an exact spec match):**
```json
{
  "outcome": "fit_recommendation",
  "request": { "item_in": "8 x 6 x 4", "weight_lb": 1.5, "use_case": "box" },
  "candidates": [
    { "sku": "864", "title": "8x6x4 ECT-32 Kraft Corrugated Boxes - Bundle of 25", "price": 10.17, "match_type": "fit_recommendation", "confidence": 0.99, "in_stock": true }
  ],
  "note": "Ranked by fit, not exact-spec equality. Confirm material/color/strength against buyer constraints before calling any of these an exact match."
}
```

**4. No exact match → quote handoff (substitute prevention):**
```json
{
  "outcome": "no_exact_match",
  "requested_spec": "12x15 neon green poly mailer, 3 mil, permanent adhesive, case of 1000",
  "missing_or_mismatched_fields": ["color", "pack_count"],
  "quote_url": "https://packrift.com/pages/bulk-quote?spec=12x15+neon+green+poly+mailer...&family=mailers&ref=mcp&...",
  "safe_next_action": "Request a quote or ask which attribute can vary. Do not present a nearby SKU as an exact substitute.",
  "unsafe_action_blocked": "Do not call a different dimension, material, color, closure, adhesive, printer type, strength, pack count, or SKU an exact match."
}
```

**5. Competitor/alternative cross-walk (alternative, not exact):**
```json
{
  "outcome": "alternative_candidate",
  "requested_spec": "9x6 kraft self-seal bubble mailer, case of 250",
  "competitor_reference": "Uline",
  "best_candidate": { "sku": "B853SS", "title": "10x6 Kraft #0 Self-Seal Bubble Mailers - Tamper-Evident Protection, 250/Case", "match_type": "alternative_candidate" },
  "note": "Dimensions differ (10x6 vs requested 9x6) — present as an alternative requiring buyer confirmation, never as an exact match. Confirm live price/inventory before offering as buyable."
}
```
