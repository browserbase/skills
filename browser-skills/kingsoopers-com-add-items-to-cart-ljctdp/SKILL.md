---
name: kingsoopers-com-add-items-to-cart-ljctdp
title: Add Grocery Items to King Soopers Cart
description: >-
  Resolve a free-text grocery list to specific King Soopers products (UPC,
  brand, size, price), ask follow-up questions for ambiguous items, then add the
  confirmed products to the signed-in user's cart for pickup or delivery.
website: kingsoopers.com
category: shopping
tags:
  - shopping
  - grocery
  - cart
  - kroger
  - king-soopers
  - add-to-cart
source: 'browserbase: agent-runtime 2026-06-07'
updated: '2026-06-07'
recommended_method: hybrid
alternative_methods:
  - method: fetch
    rationale: >-
      Residential-proxy fetch of /search returns full SSR HTML with products[]
      (upc, brand, description) embedded in window.__INITIAL state — the
      reliable read path for item resolution and disambiguation. Cannot write to
      the cart.
  - method: browser
    rationale: >-
      The cart is account-bound, so the add-to-cart write needs an authenticated
      stealth browser session. Headless sessions are Akamai-blocked for
      sustained interaction, so this path is required but not guaranteed in a
      headless/cloud environment.
  - method: api
    rationale: >-
      Official api.kroger.com requires OAuth client credentials not available
      here; the site's internal /cart/modify endpoint requires authenticated
      session cookies + CSRF. Not usable anonymously.
verified: true
proxies: true
---
# Add Grocery Items to King Soopers Cart

## Purpose
Given a free-text shopping list, this skill resolves each item to a concrete King Soopers product (UPC + brand + size + price), surfaces clarifying questions for anything ambiguous, and then adds the confirmed products to the signed-in user's cart. King Soopers is a Kroger-family banner, so the cart is **account-bound and write-only after sign-in** — there is no anonymous cart. Item *resolution* (search) is read-only and reliable; the *add-to-cart* step is a stateful, authenticated write. This skill is **hybrid**: use a residential-proxy HTTP fetch to find products and drive disambiguation, then an authenticated browser to perform the cart write.

## When to Use
- A user hands you a grocery list ("a gallon of 2% milk, a dozen large eggs, bananas, sourdough bread") and wants it added to their King Soopers cart for pickup or delivery.
- You need to map vague item names to specific purchasable products before adding them.
- You need to decide *which* product variant to add when a query returns many (fat %, size, brand, organic vs. conventional) and must ask the user before committing.
- You want to pre-build a cart the user will later review and check out themselves (this skill never checks out).

## Workflow

The optimal path splits the task into a read phase (fetch) and a write phase (authenticated browser). **Do not try to drive the whole flow with a headless browser** — kingsoopers.com sits behind Akamai Bot Manager and blocks sustained headless interaction (see Gotchas). The SSR HTML, however, is fully readable through the residential-proxy fetch path.

### Phase 1 — Resolve each list item (read-only, reliable)
For every item on the user's list:

1. Issue a residential-proxy fetch of the search page (URL-encode the query):
   ```bash
   browse cloud fetch "https://www.kingsoopers.com/search?query=2%25%20milk" --proxies
   ```
   This returns **HTTP 200 with the full server-rendered HTML** even though the live browser is blocked.
2. Parse the embedded `window.__INITIAL...` state JSON in the response body. The `products[]` array holds objects shaped like:
   ```json
   { "upc": "0001111050224", "brandName": "king soopers city market",
     "description": "king soopers® city market® 2% reduced fat milk gallon",
     "subCommodityCode": ["0200100012"], "relevanceScore": 0.878 }
   ```
   Capture `upc`, `brandName`, `description` for each candidate. (`price` is present but is store-specific and only populated once a store/modality is set — see Gotchas.)
3. Rank candidates by `relevanceScore` / `searchEngineRank` and the user's stated constraints (size, brand, organic, count).

### Phase 2 — Ask follow-up questions for ambiguity
A single query routinely returns many variants. Example: `query=milk` returns *vitamin D whole / 2% reduced fat / 1% lowfat* each in *gallon* and *half-gallon*. **Before adding anything, ask the user a concise disambiguation question for each unresolved item** instead of guessing. Trigger a question when any of these is true:
- The list item omits a dimension the products differ on: **size/volume, fat % or variety, brand, organic vs. conventional, count/pack**.
- No quantity was specified (ask "how many?").
- Top candidates have near-tied relevance scores.
- The query returns zero products (ask the user to rephrase or confirm the item).

Surface the top 2–4 candidates with brand, size, and price so the user can pick. Only items with exactly one sensible match (or an explicit user choice) proceed to Phase 3.

### Phase 3 — Add confirmed products to the cart (authenticated browser write)
This is the stateful write and **requires user-supplied King Soopers credentials**; the cart cannot be modified anonymously.

1. Start a stealth Browserbase session (`--verified --proxies`) and open `https://www.kingsoopers.com/`.
2. Dismiss the "Improving Your Experience" consent modal if present.
3. **Set store + fulfillment modality.** The site geo-defaults a store from the (proxy) IP — confirm or change it via the "Pickup / Delivery" selector and the user's ZIP. Prices and availability are store-scoped.
4. **Sign in** with the user's account (top-right "Sign In"). Cart contents persist to the account.
5. For each confirmed UPC, open its product page (`https://www.kingsoopers.com/p/<slug>/<upc>` or re-search), click **Add to Cart**, and set the quantity. Internally the page POSTs to `/cart/modify`.
6. Read the cart (`/cart`) back and report what was added vs. what failed.

> ⚠️ Read-only boundary: add items and stop at the populated cart. **Never** proceed to `/checkout` or place an order (also `Disallow`-ed in robots.txt).

### Browser fallback note
There is no pure-browser fallback that bypasses Akamai in a headless/cloud environment — the document loads but the product/cart XHRs are blocked (you'll see "We're sorry, but there was a problem"). The fetch path in Phase 1 is the fallback for *reading*; the authenticated browser in Phase 3 is the only path for *writing*, and it depends on the session surviving Akamai (not guaranteed headless — see Gotchas).

## Site-Specific Gotchas
- **Akamai Bot Manager wall.** Headless/cloud browser sessions (tested with Browserbase `--verified --proxies`) render the first HTML document, then get blocked: subsequent navigations return an **"Access Denied" page served as HTTP 200** (body from `errors.edgesuite.net`, `Akamai-Grn`/`X-Akamai-Transformed` headers), not a 403. The SPA shell can also load while its client-side product XHRs are silently blocked, producing "We're sorry, but there was a problem." Don't treat a 200 as success — check the title/body for "Access Denied". This wall is why the add-to-cart write could not be fully verified during skill creation.
- **`browse cloud fetch --proxies` is NOT blocked.** The Browserbase Fetch API over residential proxies returns full SSR HTML (200) for `/`, `/search?query=...`, and `/robots.txt`. Use it for all product resolution. Plain `curl`/datacenter IPs will be blocked.
- **Product data lives in SSR state, not a clean JSON API.** Parse `window.__INITIAL...` from the search HTML for `products[]` (upc, brandName, description, subCommodityCode). A `query=eggs` page embedded ~88 product UPCs. There is no documented public search JSON endpoint reachable without auth; the official `api.kroger.com` requires OAuth client credentials you won't have.
- **Cart is account-bound; no guest cart.** `/cart`, `/cart/modify`, `/products/start-my-cart`, and `/cart/addAllToCartFromOrder/` all require an authenticated session + CSRF/session cookies. Without user credentials the add step cannot complete.
- **Store + modality gate prices and availability.** The site picks a default store from IP geolocation (a residential proxy defaulted to "Dell Range Cheyenne, 3702 Dell Range Blvd", WY). `price` fields are empty until a store/modality is chosen, and stock differs per store — always set the user's real ZIP/store first.
- **Built-in "Shopping Assistant" widget** appears bottom-right on search pages. It's a Kroger-native list/assistant feature; it may help bulk-add but still requires sign-in and is itself behind the same anti-bot layer.
- **robots.txt disallows** `/checkout*`, `/scheduling*`, `/clickstream*`, `/recipes/api/v1/*`, `/locations*`. Adding to cart is not disallowed, but **checkout is** — respect the read-only-up-to-cart boundary.
- **Disambiguation is core, not optional.** Grocery terms are inherently underspecified; the same query ("milk", "bread", "cheese") returns many valid variants. The correct behavior is to ask the user, not to pick the top relevance hit silently.

## Expected Output
```json
{
  "success": true,
  "store": { "name": "Dell Range Cheyenne", "address": "3702 Dell Range Blvd", "modality": "pickup" },
  "added": [
    { "query": "2% milk", "upc": "0001111050224",
      "description": "king soopers® city market® 2% reduced fat milk gallon",
      "brand": "king soopers city market", "quantity": 1, "status": "added" }
  ],
  "clarifications_needed": [
    { "query": "milk", "reason": "multiple variants",
      "candidates": [
        { "upc": "0001111050240", "description": "vitamin d whole milk gallon" },
        { "upc": "0001111050224", "description": "2% reduced fat milk gallon" },
        { "upc": "0001111050217", "description": "1% lowfat milk gallon" }
      ],
      "question": "Which milk would you like — whole, 2%, or 1%? And gallon or half-gallon?" }
  ],
  "not_found": [
    { "query": "fresh truffles", "reason": "no products returned for this query" }
  ],
  "requires_auth": false,
  "error_reasoning": null
}
```

Outcome shapes you may emit:
- **`requires_auth: true`** with `added: []` and `error_reasoning: "King Soopers cart requires a signed-in account; no credentials supplied."` — when item resolution succeeded but no login is available to perform the write.
- **`success: false`** with `error_reasoning: "Akamai Access Denied (HTTP 200 block) — headless browser could not sustain the session to add items."` — when the browser write phase is blocked.
- **`clarifications_needed`** non-empty — when the run paused to ask the user; `added` holds only unambiguous items resolved so far.
- **`not_found`** non-empty — queries that returned zero products.
