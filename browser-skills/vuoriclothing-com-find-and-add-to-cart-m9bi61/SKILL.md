---
name: vuoriclothing-com-find-and-add-to-cart-m9bi61
title: Vuori Search Catalog & Add to Cart
description: >-
  Search the Vuori Clothing catalog for a product, open the product detail page,
  select the requested size and color, and add one unit to the bag. Read-only
  beyond the cart drawer — never proceeds to checkout.
website: vuoriclothing.com
category: shopping
tags:
  - shopping
  - ecommerce
  - shopify
  - algolia
  - vuori
  - cart
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      Not viable today. Vuori runs a headless Next.js storefront over Shopify;
      the standard customer endpoints (/cart.js, /products.json,
      /products/{handle}.js, /search/suggest.json) all return 404 at
      vuoriclothing.com. Search is Algolia-powered but the App ID and
      Search-Only Key are not surfaced in obvious places, so going direct to
      Algolia would require reverse-engineering the bundled Next.js chunks.
      Browser flow is faster and more reliable.
verified: true
proxies: true
---
# Vuori — Search Catalog, Find Item, Add to Cart in User's Size

## Purpose

Given a free-text product query (e.g. "Sunday Performance Jogger") plus a target size (and optional color), search the Vuori catalog, open the best-matching product detail page, select the requested size + color, and add one unit to the bag. Confirm via the "Added to Bag" drawer and return the line-item details (product name, color, size, price, variant ID, cart total).

**Read-only beyond the cart drawer.** Never click *View Bag & Checkout*, *Checkout*, *Continue to Payment*, or any address/payment fields. The skill terminates when the slide-over cart drawer shows the added line item.

## When to Use

- Pre-populating a Vuori cart for a user before they finalize checkout themselves.
- Verifying that a specific product + size + color combination is purchasable (in stock and adds cleanly to a guest bag).
- Bulk "stash for later" flows where an agent collects items across vendors and hands the cart URL to the user.
- Smoke-testing the storefront's add-to-cart path after a deploy or A/B change.

## Workflow

Vuori runs a headless Next.js storefront (hosted on Netlify) over a Shopify backend. **The standard Shopify customer endpoints (`/cart.js`, `/products.json`, `/products/{handle}.js`, `/search/suggest.json`) all return 404** at `vuoriclothing.com` — the storefront does not proxy them. Search is powered by Algolia (the `queryId=…&objectId=…` URL params on result links are Algolia tracking IDs, and the `objectId` value equals the Shopify variant ID), but the Algolia App ID + Search-Only Key are not exposed in any obvious place in the rendered HTML, and there is no documented public Algolia index name. **Browser-driven flow is the only reliable path today.**

Mid-difficulty anti-bot: the homepage opened cleanly on a `--verified --proxies` Browserbase session with no Akamai/Cloudflare interstitial observed. Default to stealth ON.

### 1. Open a stealth + residential-proxy session

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$SID"
```

`--proxies` is recommended (CDN appears to be Cloudflare-fronted Netlify; bare datacenter IPs were not tested as failing but residential is the safer default for any e-commerce SPA). `--verified` enables Chrome canary-style fingerprinting that Vuori's UI registers as a normal browser.

### 2. Go straight to the search results URL — skip the header search UI

The shortest path to results is **direct URL navigation**:

```bash
QUERY_ENC=$(node -pe "encodeURIComponent('Sunday Performance Jogger')")
browse open "https://vuoriclothing.com/search?q=$QUERY_ENC" --remote
browse wait load --remote
browse wait timeout 2500 --remote   # results hydrate after `load`
```

This bypasses the homepage email-capture popup (`dialog: POPUP Form` ref appears within 1–2s of homepage load) and the search-icon click dance entirely. The search page itself does **not** trigger the popup.

### 3. Read results from the snapshot's urlMap

Result cards are accessibility-tree links of the form:

```
link: <Product Name>, <Color>. Color: <Color>, <N> colors available. $<price>. Press Enter to show quick add sizes
```

…with `href` of `https://vuoriclothing.com/products/<handle>?queryId=<algolia-query-id>`. The header heading reads `<N> Results for "<query>"` — read that integer to validate the search returned any hits before clicking. If `0 Results`, branch to `not_found` (see Expected Output).

Pick the best handle by name match. Vuori's handles encode gender prefix (`womens-…`) and color suffix (`…-black`, `…-ink-heather`), e.g. `sunday-performance-jogger-black`, `womens-performance-jogger-black-heather`, `ponto-performance-jogger-charcoal-heather`. Men's joggers have no `mens-` prefix (asymmetric with `womens-`).

### 4. Open the product detail page directly

Strip the `?queryId=…` tracking param when persisting URLs; it's accepted but not required:

```bash
browse open "https://vuoriclothing.com/products/sunday-performance-jogger-black" --remote
browse wait load --remote
browse wait timeout 2500 --remote
```

### 5. Pick color (if multiple available), then size

PDP exposes one or more `radiogroup` controls. Common groupings:

- `radiogroup: Limited Edition Colors` — seasonal colorways.
- `radiogroup: Core Colors: <currently-selected>` — staple colorways. The default selection matches the handle's color suffix, so if the user asked for the same color as the URL, you do **not** need to re-click a color radio.
- `radiogroup: Size` — XXS / XS / S / M / L / XL / XXL. Each radio's accessible name follows one of two templates:
  - `Select Size <full-name>` (available) — e.g. `Select Size Medium`.
  - `<full-name>, sold out` (unavailable) — e.g. `Extra Extra Small, sold out`. **Do not click sold-out radios** — clicking does not error but leaves the add-to-bag button disabled.
- `radiogroup: Length: Regular` — appears on Sunday/Ponto Performance Jogger family. Defaults to Regular; click `Select Length Long` if user requests the long inseam variant.

To click size M:

```bash
browse snapshot --remote                       # locate the ref for "Select Size Medium"
browse click <medium-ref> --remote
browse wait timeout 1000 --remote
```

After a valid size is clicked, the radiogroup label flips from `Size` to `Size: M` and the primary CTA changes from `button: Select Size` to `button: Add to Bag`. Use that label flip as your "size is locked" verification before clicking add.

### 6. Click Add to Bag

```bash
browse click <add-to-bag-ref> --remote
browse wait timeout 3000 --remote              # cart drawer animates in over ~1.5s
```

The URL gains `?objectId=<variant-id>` after a successful add (e.g. `?objectId=22964263354426`). The 13–14-digit `objectId` is the Shopify variant ID — capture it for the output.

### 7. Verify the cart drawer

After the add, the snapshot includes:

- `heading: Added to Bag` (success signal — present iff the add actually fired).
- A line item with image, product name, price.
- `link: View Bag & Checkout` (DO NOT click — this terminates the read-only contract).
- The header `button: Bag, <N> items` counter increments by one.

Read price + product name from the drawer; emit the JSON in Expected Output below.

### 8. Release the session

```bash
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

## Site-Specific Gotchas

- **Headless storefront — no Shopify customer endpoints.** `/cart.js`, `/products.json`, `/products/{handle}.js`, `/search/suggest.json` all return 404 with Next.js / Netlify error pages. Don't waste time probing — the SPA is the only surface. Confirmed 2026-05-19 against the proxied edge.
- **Algolia powers search but credentials are not exposed.** The `?queryId=<id>` and `?objectId=<variant>` URL params on result links and post-add URLs are Algolia analytics tracking IDs. The Algolia App ID and Search-Only Key aren't trivially extractable from the rendered HTML (would require digging through the bundled Next.js chunks). Don't pursue a direct Algolia API call — go through the `/search?q=` URL.
- **Don't click `View Bag & Checkout`.** It's the read-only boundary. The cart drawer (`heading: Added to Bag`) is the terminal success state.
- **Homepage popup dialog (`POPUP Form` — email-capture for 20% off) appears 1–2s after homepage load** and intercepts pointer events on the page. Skip it by either (a) navigating directly to `/search?q=…` (which does not trigger the popup) — preferred — or (b) `browse press Escape` after homepage load before any clicks. The popup has a `Close dialog` button at ref `dialog > button: Close dialog`.
- **Size radio accessible names differ between available and sold-out states.** Available: `Select Size Medium`. Sold out: `Medium, sold out`. **Match on the exact string before clicking** — clicking a sold-out radio appears to succeed (`{ "clicked": true }`) but the size doesn't lock and the CTA stays at `Select Size`.
- **The CTA-label flip is the size-locked signal.** Watch the primary button: `button: Select Size` → `button: Add to Bag` indicates the size selection registered. If it doesn't flip after `wait timeout 1000`, the selected size is either sold out or in a length/color combo that doesn't exist (e.g. selecting Length: Long on a color that only ships Regular).
- **Men's products have no `mens-` URL prefix; women's have `womens-`.** Asymmetric handle convention — handle `sunday-performance-jogger-black` is the men's, `womens-performance-jogger-black-heather` is the women's. The PDP title text contains the explicit gender (e.g. "Men's Sunday Performance Jogger").
- **`?objectId=<variant>` URL param after add-to-bag is the Shopify variant ID** (13–14 digit numeric). Useful as a stable handle to the exact size/color SKU; persist it in the output.
- **Same product can appear as multiple inseam SKUs.** `sunday-performance-jogger-black` (regular 28") is a different handle from `sunday-performance-jogger-30-black` (30"); the regular handle also has a `radiogroup: Length` with Regular + Long. Pick deliberately if the user specified an inseam.
- **`queryId` URL param on search-result links is optional.** Strip it from canonical product URLs you persist — the PDP renders identically without it.
- **Sold-out XXS observed on the men's Sunday Performance Jogger Black at the time of capture (2026-05-19).** Stock fluctuates; treat any size's availability as a runtime check, never as static metadata.
- **No-results page is unambiguous.** Header reads `0 Results for "<query>"` and message reads `We couldn't find any items that match your Search`. Branch directly to `not_found` — don't try synonyms or fall back to the homepage carousels (the page does suggest popular items but those are unrelated to the query).
- **Country picker defaults to US.** If the user's billing/shipping country isn't US, switching it via `button: Country Picker. Currently selected: US` may change available SKUs, prices, and currency — but the skill never reached a checkout boundary where that mattered in testing. Document it and move on.

## Expected Output

Successful add (terminal state — cart drawer shows item):

```json
{
  "success": true,
  "query": "Sunday Performance Jogger",
  "product_name": "Sunday Performance Jogger",
  "product_handle": "sunday-performance-jogger-black",
  "product_url": "https://vuoriclothing.com/products/sunday-performance-jogger-black",
  "gender": "men",
  "color_selected": "Black",
  "size_selected": "M",
  "length_selected": "Regular",
  "variant_id": "22964263354426",
  "price": "$110",
  "cart_count": 1,
  "added_to_bag_confirmed": true,
  "evidence": "Snapshot heading 'Added to Bag' present; URL gained ?objectId=22964263354426"
}
```

Requested size sold out (selected color/length has no stock for the requested size):

```json
{
  "success": false,
  "reason": "size_sold_out",
  "query": "Sunday Performance Jogger",
  "product_handle": "sunday-performance-jogger-black",
  "size_requested": "XXS",
  "sold_out_label_observed": "Extra Extra Small, sold out",
  "available_sizes": ["XS", "S", "M", "L", "XL", "XXL"]
}
```

No matching product in catalog:

```json
{
  "success": false,
  "reason": "not_found",
  "query": "zzzzzznotaproduct",
  "results_count": 0,
  "evidence": "Header '0 Results for \"zzzzzznotaproduct\"'; body 'We couldn't find any items that match your Search'"
}
```

Ambiguous query — multiple product families match (e.g. "Performance Jogger" returns men's + women's + Ponto + Sunday variants):

```json
{
  "success": false,
  "reason": "ambiguous_query",
  "query": "Performance Jogger",
  "results_count": 149,
  "top_candidates": [
    {
      "handle": "womens-performance-jogger-black-heather",
      "name": "Performance Jogger",
      "color": "Black Heather",
      "price": "$110",
      "url": "https://vuoriclothing.com/products/womens-performance-jogger-black-heather"
    },
    {
      "handle": "sunday-performance-jogger-black",
      "name": "Sunday Performance Jogger",
      "color": "Black",
      "price": "$110",
      "url": "https://vuoriclothing.com/products/sunday-performance-jogger-black"
    }
  ],
  "hint": "Narrow the query (e.g. include 'Sunday' or 'Ponto' family prefix and the gender hint)."
}
```
