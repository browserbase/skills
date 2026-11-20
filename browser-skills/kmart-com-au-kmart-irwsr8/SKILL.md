---
name: kmart-com-au-kmart-irwsr8
title: Kmart Australia Find Product and Add to Cart
description: >-
  Find a product on kmart.com.au by natural-language query, navigate to the
  product detail page, capture title/price/SKU/availability, and drive the
  read-only pre-checkout flow up to the bag (/checkout/bag). Never submits an
  order — stops at the bag review screen. Documents the Akamai bot wall that
  gates the actual addToCart GraphQL mutation for automated sessions.
website: kmart.com.au
category: shopping
tags:
  - shopping
  - ecommerce
  - kmart
  - akamai
  - read-only
  - australia
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      kmart.com.au has an internal GraphQL gateway at
      https://api.kmart.com.au/gateway/graphql with read operations
      (getProductAvailability, getMarketplaceOffers, getMyActiveCart) — but it's
      Akamai-locked and CORS-restricted. Reachable only from a warmed-up browser
      session, not from curl. Cart mutations (addToCart) are not dispatched at
      all from automated browser clicks across 2 iterations of CDP network
      tracing.
  - method: url-param
    rationale: >-
      Search has a clean URL shortcut: /search/?searchTerm={query}. Product
      detail pages follow /product/{slug}-{sku}/ where {sku} is the 8-digit
      Kmart keycode. No ?addToCart=X param exists — cart state lives only in the
      authenticated GraphQL session.
verified: true
proxies: true
---
# Kmart Australia — Find Product and Add to Cart (Read-Only Pre-Checkout)

## Purpose

Given a natural-language product query (e.g. "drink bottle", "water bottle", "kids backpack") on **kmart.com.au**, find a matching product, navigate to its detail page, capture price/title/SKU/availability, and attempt to drive the read-only pre-checkout flow up to the bag (`/checkout/bag`) page. Return structured JSON describing the resolved product and the realized cart state.

**Read-only — never click "Continue to Checkout", never enter payment details, never submit an order.** This skill stops at the bag/cart review screen by design. Booking an order is a separate skill that would require authenticated Kmart credentials and explicit user consent.

## When to Use

- "find a drink bottle under $20 on kmart.com.au and tell me the price"
- "what does Kmart sell for water bottles in Sydney, in stock for delivery"
- "show me the product page details for the {SKU} on Kmart"
- An agent comparison flow that needs Kmart product price/availability without booking
- Demonstrating the structure of Kmart's pre-checkout flow (search → product detail → bag) without actually purchasing

If the user actually wants to **buy** something, hand off to a human — Kmart's cart-add mutation is Akamai-gated for guest automated sessions (see Gotchas).

## Workflow

The recommended path is the public site driven through a verified Browserbase session with residential proxies. There is no public Kmart API for product search; the private GraphQL endpoint at `https://api.kmart.com.au/gateway/graphql` is reachable for **read** operations (`getProductAvailability`, `getMarketplaceOffers`, `getMyActiveCart`) from a warmed-up browser session, but cart **mutations** are blocked by Akamai for guest automated traffic (see Gotchas).

### 1. Create a stealth + residential-proxy session

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id));")
CONNECT_URL=$(browse cloud sessions get "$SID" \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).connectUrl));")
export BROWSE_SESSION="kmart"
browse open "https://www.kmart.com.au/" --cdp "$CONNECT_URL" --session "$BROWSE_SESSION"
```

Both `--verified` and `--proxies` are mandatory. A bare session is Akamai-blocked on the **first** product detail page load. Even verified + proxies sessions get flagged within ~5-8 page transitions (see Gotchas).

### 2. Land on the homepage first

```bash
browse open "https://www.kmart.com.au/" --session kmart
```

Do **not** deep-link directly to a product detail URL on a cold session — that triggers Akamai's "no session warmup" heuristic and returns `Access Denied` (Akamai edgesuite.net error page) on the first request. The homepage seeds the Akamai cookie (`_abck`) and JS challenge state.

### 3. Search

```bash
browse open "https://www.kmart.com.au/search/?searchTerm=drink%20bottle" --session kmart
browse wait timeout 4000 --session kmart   # search results render after a delay
browse get markdown body --session kmart
```

Product detail URLs follow the pattern `/product/{kebab-slug-with-words}-{8-digit-sku}/`. Extract them from the markdown via regex `\(/product/[a-z0-9-]+/[?][^)]+\)`.

### 4. Navigate to the chosen product detail page

```bash
browse open "https://www.kmart.com.au/product/940ml-bow-dual-function-drink-bottle-43693399/" --session kmart
browse wait timeout 4000 --session kmart
```

Capture title via `browse get title`, scrape the rendered price/SKU via `browse get markdown body` or `browse snapshot`. The SKU appears in the page as `SKU : P_43693399` and is also embedded in the URL (last 8-digit number).

### 5. Inspect the "Add to bag" button state

```bash
browse eval "const b=[...document.querySelectorAll('button')].find(x=>/^Add to bag$/i.test(x.textContent.trim())); JSON.stringify({ found: !!b, disabled: b?.disabled, hasGreyClass: b?.className.includes('disabled') })" --session kmart
```

The button is `disabled` for products that are out-of-stock for delivery to the default postcode (Sydney 2000). The button visually renders as light-grey background instead of the active dark-blue. Skip these products and try another from the search results.

### 6. Attempt Add to bag (best-effort — see Gotchas)

```bash
# Snapshot first to refresh refs after JS settle
browse snapshot --session kmart > /tmp/snap.txt
REF=$(grep -oE '\[[0-9]+-[0-9]+\] button: Add to bag' /tmp/snap.txt | head -1 | grep -oE '\[[0-9]+-[0-9]+\]')
browse click "$REF" --session kmart
browse wait timeout 4000 --session kmart
```

Then read the bag:

```bash
browse open "https://www.kmart.com.au/checkout/bag" --session kmart
browse wait timeout 5000 --session kmart
browse screenshot --session kmart --path /tmp/bag.png
```

**Expect this to fail.** The cart mutation does not fire for automated sessions (see Gotchas). Capture the realized state — either an empty bag (`"No items currently in your bag"`) or an Akamai Access Denied — and report it honestly in the JSON output.

### 7. Stop at the bag page — do not proceed to checkout submission

The "Continue to Checkout" button on `/checkout/bag` takes the user to address, payment, and order confirmation. **This skill is read-only.** Do not click checkout buttons, do not enter payment info, do not submit an order. The terminal screen for this skill is `/checkout/bag` with the bag's current contents visible.

## Site-Specific Gotchas

- **Akamai bot detection is severe.** kmart.com.au uses Akamai Bot Manager with both the static `_abck` cookie challenge and dynamic beacons (POSTs to obfuscated `/ZchU2Z/w/t/...` paths). Symptoms observed across 2 iterations:
  - First product detail page on a cold session → `Access Denied` reference `#18.xxxxx.edgesuite.net`. Always warm up on `/` first.
  - After ~5-8 successful page transitions, the same session begins returning Access Denied on subsequent product detail pages even though the homepage and search still work.
  - After attempting an "Add to bag" click, `/checkout/bag` immediately returns Access Denied on a fraction of sessions.
- **The "Add to bag" click does NOT trigger an add-to-cart GraphQL mutation for automated browser sessions.** Confirmed across two iterations + full CDP network trace: the only GraphQL operations observed after the click are read queries (`getMyActiveCart`, `getProductAvailability`, `getMarketplaceOffers`, `getRecommendedAvailableProducts`, `getRealTimeRecommendations`, `getPostcodeSuggestions`, `GetTrendingProductRecommendation`). No `addToCart`/`addItemToCart`/`createCart` mutation is dispatched. The button's React onClick handler either runs an Akamai-gated guard or expects a session token the automated browser does not carry. Both CDP `Input.dispatchMouseEvent` clicks (via `browse click [ref]`) and JS `.click()` (via `browse eval`) produce the same result: button state changes visually but no mutation fires and the bag remains empty.
- **The disabled "Add to bag" state is not just a visual style.** Some products (notably small / low-margin items like the `1L Grey Drink Bottle with Handle (P_43677986)`) ship the button in a permanently `disabled` state for delivery to the default postcode. The button still claims to be a `<button>` element, but clicking it is a no-op even for a human. Confirm `b.disabled === false` via `browse eval` before clicking — if `true`, pick a different product.
- **GraphQL endpoint is `POST https://api.kmart.com.au/gateway/graphql`.** All page state is hydrated from this endpoint. The schema includes (at least): `getMyActiveCart`, `getProductAvailability(input: {country, postcode, products: [{keycode, quantity, isNationalInventory, isClickAndCollectOnly}]})`, `getMarketplaceOffers(productSkus, postcode, countryCode, price)`, `getPostcodeSuggestions(query, country)`, `getRecommendedAvailableProducts`, `getRealTimeRecommendations`, `GetTrendingProductRecommendation`. Direct CORS-OPTIONS preflight + POST works from the warmed browser context for read queries; **do NOT attempt to call this endpoint with raw `curl`** — it requires a valid Akamai-issued bearer + cookie pair that only a real browser session has.
- **Default postcode is Sydney 2000** and gets baked into the GraphQL `getProductAvailability` call by the page hydration. The header has a "Deliver to Sydney 2000" button that opens a postcode picker, but for a read-only flow you usually don't need to change it. If the user wants availability for a specific postcode, change it via the picker before the product detail load.
- **Product URL pattern is `/product/{kebab-slug}-{8-digit-sku}/`.** SKU also appears on the page as `SKU : P_43693399` (the `P_` prefix is purely a label). The 8-digit number alone is what GraphQL operations use as `keycode` or `productSkus[]`.
- **Search URL is `/search/?searchTerm={url-encoded-query}`.** Returns an HTML page that hydrates products client-side via Constructor.io (see `ac.cnstrc.com` requests). The HTML response *itself* contains the product cards once hydrated; wait at least 4s after navigation before scraping markdown. The page is **not** SSR'd with products — a synchronous fetch will see only the search-suggestion sidebar (other related searches), not the actual results.
- **No public Kmart product search API exists.** Constructor.io serves the autocomplete + search backend (`ac.cnstrc.com/recommendations/v1/...`) with key `key_GZTqlLr41FS2p7AY` (public, visible in DevTools) — calling it directly will return some result shape but reproducing exact storefront behavior (price, availability, fulfillment) requires the GraphQL gateway which is Akamai-locked.
- **"Continue to Checkout" submission is read-only-forbidden by this skill.** Even if a future agent solves the cart-add mutation, do not proceed past `/checkout/bag` without explicit human approval — Kmart's terms forbid automated purchasing and the read-only-rule of this skill matches that constraint.
- **Don't waste time on these dead ends:**
  - Calling `api.kmart.com.au/gateway/graphql` with `curl` (Akamai + CORS).
  - Trying to deep-link to a product without homepage warmup (Access Denied).
  - Repeatedly retrying Add to bag on the same session after one failure (session gets escalated to Access Denied across the whole domain).
  - Looking for a `?addToCart=SKU` URL param trick — none exists; the cart state lives entirely in the authenticated GraphQL session.

## Expected Output

The skill returns one of the following JSON shapes. Always include the `realized_cart_state` so the caller knows whether the read-only attempt completed.

### Success — product found + page reachable + button enabled (cart-add still likely blocked)

```json
{
  "success": true,
  "query": "drink bottle",
  "product": {
    "title": "940ml Bow Dual Function Drink Bottle",
    "sku": "43693399",
    "price_aud": 14,
    "url": "https://www.kmart.com.au/product/940ml-bow-dual-function-drink-bottle-43693399/",
    "in_stock_for_delivery": true,
    "postcode": "2000",
    "fulfillment_options": ["Delivery", "Click & Collect", "In-Store"]
  },
  "add_to_bag_attempted": true,
  "realized_cart_state": "empty",
  "notes": "Add to bag click registered but no addToCart GraphQL mutation observed; bag remained empty (Akamai bot gate). Read-only flow terminated at /checkout/bag."
}
```

### Success — product found, but Add to bag is disabled (out of stock for delivery)

```json
{
  "success": true,
  "query": "drink bottle",
  "product": {
    "title": "1L Grey Drink Bottle with Handle",
    "sku": "43677986",
    "price_aud": 3,
    "url": "https://www.kmart.com.au/product/1l-grey-drink-bottle-with-handle-43677986/",
    "in_stock_for_delivery": false,
    "postcode": "2000",
    "fulfillment_options": ["Delivery", "Click & Collect", "In-Store"]
  },
  "add_to_bag_attempted": false,
  "realized_cart_state": "n/a — button disabled",
  "notes": "Product page loaded but Add to bag button is in disabled state for postcode 2000. Try a different product or change postcode."
}
```

### Failure — Akamai access denied during the flow

```json
{
  "success": false,
  "query": "drink bottle",
  "reason": "akamai_access_denied",
  "blocked_at_url": "https://www.kmart.com.au/checkout/bag",
  "akamai_reference": "#18.4d18d017.1779202972.11a8f55e",
  "notes": "Session was flagged by Akamai bot detection. Retry with a fresh --verified --proxies session and warm up on / before any product navigation."
}
```

### Failure — no products matched the search query

```json
{
  "success": false,
  "query": "obscure-nonexistent-thing-12345",
  "reason": "no_search_results",
  "search_url": "https://www.kmart.com.au/search/?searchTerm=obscure-nonexistent-thing-12345",
  "notes": "Search returned only related-query suggestions, no product cards. Try a broader query."
}
```
