---
name: shopee-com-compare-products-instant-delivery-mnolqb
title: Shopee Compare Products with Instant Delivery
description: >-
  Search a Shopee country site for products matching a query, filter to items
  eligible for instant / same-day courier delivery to a buyer postcode, then
  rank by price and rating and group the results by Shopee category.
website: shopee.com
category: marketplace
tags:
  - shopee
  - marketplace
  - ecommerce
  - instant-delivery
  - ratings
  - southeast-asia
source: 'browserbase: agent-runtime 2026-05-21'
updated: '2026-05-21'
recommended_method: api
alternative_methods:
  - method: api
    rationale: >-
      The Shopee Open Platform partner API
      (open.shopee.com/api/v2/product/search_item + logistics.get_channel_list +
      product.get_item_extra_info + product.get_category) returns search
      results, instant-courier eligibility, ratings, and category breadcrumbs in
      clean JSON — the only legitimate path that bypasses Shopee's buyer-facing
      anti-bot wall. Requires partner registration + signed requests.
  - method: fetch
    rationale: >-
      Third-party data-API providers (Apify meavisaai/shopee-crawler, Noxapi,
      TMAPI, RapidAPI Shopee actors) wrap the internal /api/v4/* endpoints and
      have solved the anti-bot problem at their layer. Cheaper to integrate than
      partner-API onboarding but may violate Shopee TOS.
  - method: browser
    rationale: >-
      Not currently viable. Verified 2026-05-21: every page load on shopee.sg /
      .ph / .com.my / .co.id / .tw / .com.br / .com.mx — homepage, /search,
      category, product detail, and /api/v4/* — redirects to
      /verify/traffic/error?type=4 (error code 90309999) even with Browserbase
      --verified --proxies on a fresh residential IP. Listed only as documented
      dead-end.
verified: true
proxies: true
---
# Shopee — Compare Products with Instant-Delivery Filter

## Purpose

Given a buyer location (country + postcode / lat-lon) and a product query (keyword, optional category, optional max-distance for "instant" couriers like Shopee Express Now), return a ranked list of candidate items annotated with: price, instant-delivery eligibility, courier service name(s), seller location, distance hint, aggregate star rating, rating count, and Shopee category path. Items are grouped by category so a comparison agent can pick a winner per category or one overall best-value pick. Read-only — never adds to cart, never starts checkout, never tracks an order.

## When to Use

- "Find the cheapest USB-C cable on Shopee SG that ships same-day to my postcode and has at least a 4.5★ rating."
- "Compare instant-delivery diapers across categories (Baby > Diapering > Disposable Diapers; Baby > Diapering > Diaper Accessories) and return the best-rated, lowest-priced option per sub-category."
- Cross-seller price-vs-rating sweeps inside one Shopee country site, restricted to listings that the buyer's address can actually receive within a few hours (Shopee Express Now / Pickup, Now / Pandamart-bundled / GrabExpress-bundled).
- Anywhere the buyer cares **both** about price-rank **and** about *whether the item can land at the door today*.

## Workflow

Shopee aggressively blocks unauthenticated browser sessions. Every page load from a headless Chromium (even with Browserbase `--verified --proxies`) is intercepted by Shopee's traffic-verification layer and returns the **"Page Unavailable / Looks like you're not logged in yet"** wall (`/verify/traffic/error?type=4`, internal error code `90309999`). This wall fires on the homepage, search pages, category pages, product-detail pages, and the internal `/api/v4/*` JSON endpoints — across all country variants (verified SG, PH, MY, ID, TW, BR, MX on 2026-05-21). See **Site-Specific Gotchas** for the exhaustive negative results.

The **only durable paths** for an automated agent are:

### Path A — Shopee Open Platform partner API (recommended, but gated)

If your app is registered with Shopee's Open Platform (https://open.shopee.com/) and has buyer-side or affiliate-side scopes, use:

1. **Pick the correct country host.** Shopee's partner endpoints route per region:
   - `partner.shopeemobile.com` — production, all regions.
   - `partner.test-stable.shopeemobile.com` — sandbox.
   - Path is `/api/v2/product/search_item` (third-party affiliate-style) or the merchant-facing equivalent depending on scope.
2. **Sign the request** with HMAC-SHA256(`partner_id` + `path` + `timestamp` + `access_token` + `shop_id`, `partner_key`). Token lifetime is 4 hours; refresh via `/api/v2/auth/access_token/get`.
3. **Call `product.search_item`** with: `keyword`, `item_status=NORMAL`, `page_size` (≤ 100), `offset`, `region_code` (e.g. `SG`, `PH`).
4. **Filter for instant-delivery eligibility** by joining the result item_ids against `logistics.get_channel_list` — channels whose `logistics_capability` includes `INSTANT` or `SAME_DAY` are the eligibility set. Geographic radius is enforced by Shopee server-side once you supply `buyer_address.postcode`.
5. **Fetch ratings** with `product.get_item_extra_info` for `liked_count`, `rating_star`, `rating_count`, `cmt_count`.
6. **Bucket by category** using `category_id` → resolve display name via `product.get_category` (returns the full breadcrumb).

This is the only path that returns data legally and reliably. If the calling app does not hold partner credentials, fall back to **Path B**.

### Path B — Third-party data-API providers

Several commercial scrapers maintain working Shopee endpoints behind the anti-bot wall: Apify's `meavisaai/shopee-crawler`, Noxapi `shopee/search-items-by-keyword`, TMAPI `shopee/search/search-items-by-keyword`, RapidAPI's Shopee actors. Each returns JSON shaped roughly:

```
{
  items: [{
    itemid, shopid, name, price, price_min, price_max,
    item_rating: { rating_star, rating_count: [tier1,...,tier5] },
    shop_location, locations,
    shipping_options: { instant: bool, same_day: bool },
    categories: [{ catid, display_name, no_sub: bool }]
  }, ...]
}
```

These providers solved the anti-bot themselves; you pay them rather than building it. **Cost vs. legality trade-off** — these providers may violate Shopee TOS; the official partner API does not. Pick based on your risk tolerance.

### Path C — Browser fallback (NOT viable as of 2026-05-21, kept for completeness)

If you must attempt scripted browsing, the URL shape that *would* work if the wall were down is:

1. **Open the country host first**, never `shopee.com` (it's a country selector). Pick from: `shopee.sg`, `shopee.ph`, `shopee.com.my`, `shopee.co.id`, `shopee.tw`, `shopee.com.br`, `shopee.com.mx`, `shopee.co.th`, `shopee.vn`, `shopee.com.ar`.
2. **Construct the search URL** with the documented filter params:

   ```
   https://{host}/search?keyword={q}
       &locations={comma-separated location IDs from /api/v4/search/search_filter_config}
       &shipping={ logistic-channel-IDs that include INSTANT and SAME_DAY }
       &category={catid}
       &sortBy={relevancy|ctime|sales|price|price_desc}
       &rating_filter={4|5}
   ```

   The `shipping=` param's allowed values are country-specific because each country has a distinct courier ecosystem (SPX Instant in SG; Pandamart + GrabExpress in PH; SPX Same-Day in ID; etc.). The full enum is at `/api/v4/search/search_filter_config?keyword=...` — **but that endpoint is also behind the anti-bot wall**, so even discovering the enum requires Path A or B first.

3. **Read product cards** from the rendered grid — each card exposes `data-sqe="link"` anchors with the canonical product URL pattern `/{slug}-i.{shopid}.{itemid}`. Read the price, star rating, sold count, and shop location from the card. The "Instant" badge is rendered as a green pill on cards eligible for same-day courier.
4. **Drill into product detail** for the seller's exact location, full rating breakdown (1★…5★ buckets), and the delivery widget that resolves the buyer postcode to courier ETAs. The delivery widget is **the only place** that shows live courier names + ETAs — the search-card "Instant" pill is just an eligibility flag.

In our 2026-05-21 attempt, every step of Path C 100% redirected to the "Page Unavailable" wall. Do not rely on Path C unless you can sign in with a real buyer account whose cookies survive the wall — and even then, Shopee may IP-rate-limit or device-fingerprint-flag the session within a few page loads.

## Site-Specific Gotchas

- **`shopee.com` is a country selector — there are no products on it.** The bare domain lists 12 country-specific Shopee sites (SG, PH, AR, TH, TW, MY, MX, LA, ID, VN, KH, BR). Always navigate to the country host (`shopee.sg`, `shopee.ph`, etc.) for actual product browsing.
- **Anti-bot wall is comprehensive.** All page-level and `/api/v4/*` requests from a Browserbase session (with `--verified --proxies`) are intercepted by `/verify/traffic/error?type=4` and the JSON error code `90309999` ("`is_login`: false, `action_type`: 2"). Verified 2026-05-21 across SG/PH/MY/ID/TW/BR/MX on two independent sessions, hitting `/`, `/search?keyword=...`, `/{Category}-cat.{id}`, `/{slug}-i.{shopid}.{itemid}`, and `/api/v4/pages/get_homepage_category_list`. Stealth + residential proxy does **not** bypass it. **Do not waste turns retrying the same wall with the same stealth profile.**
- **`robots.txt` is reachable; `sitemap.xml` is intercepted by the SPA router.** Direct fetch of `https://shopee.{tld}/robots.txt` returns 200 with the actual robots policy. Fetch of `https://shopee.{tld}/sitemap.xml` returns the React app shell (HTML), not XML — Shopee's SPA catches any unknown path and serves the same client bundle. Don't try to enumerate categories or items from the sitemap.
- **robots.txt disallows many useful pages** for general crawlers: `/search/?` (note: trailing slash), `/search?shop=`, `*-cat.*?category=`, `/find_similar_products/`, `/top_products`, `/from_same_shop/`, `/you_may_also_like/`. The `/search?keyword=` path (no trailing slash) is technically allowed for Googlebot — but for `User-Agent: *` only with `Crawl-delay: 1`. Honor it if you reach that surface.
- **Country site → courier ecosystem is 1:1.** "Instant delivery" means different couriers per country:
  - SG: Shopee Express (SPX) Instant, Pickupp, NinjaVan SameDay.
  - PH: Shopee Xpress Instant, Lalamove, GrabExpress, Pandamart.
  - MY: Shopee Express Instant, J&T Same-Day, GrabExpress.
  - ID: SPX Instant, GoSend Instant, Grab Instant.
  - TH: Shopee Xpress SameDay, GrabExpress, LineMan, Robinhood.
  - TW: Shopee Express Same-Day, Pelicargo Now.
  Do not assume the SG courier list applies in PH or MY. Re-derive the `shipping=` filter enum per country from `/api/v4/search/search_filter_config?keyword=...&from_page=search&page_type=search` (behind the anti-bot wall — Path A/B only).
- **Geographic radius is server-resolved, not client-filtered.** Shopee does not expose a "distance ≤ N km" URL param. Eligibility is resolved server-side from the buyer's saved address → courier service area. Without a buyer postcode, every search returns the country-wide listing, and the "Instant" pill is an eligibility-elsewhere flag, not "near you". For honest radius matching, the caller MUST supply `buyer_postcode` (or `buyer_lat/buyer_lon` if the partner-API scope allows it), and your skill must thread it through to the back-end.
- **Item rating is in two places.** Search cards show `item_rating.rating_star` (a float, 0–5, with hidden decimals) and `historical_sold` (integer count of orders). Product-detail pages additionally show the per-star breakdown (`rating_count: [1★, 2★, 3★, 4★, 5★]`) and `cmt_count` (review count, distinct from sold count). For "analyze the rating" — pull both star average AND review count; a 5.0 with 2 reviews is a weaker signal than 4.8 with 4,000 reviews. Some skills also compute a Wilson-score lower bound; do that client-side if the agent needs a rank-stable score.
- **Category IDs are stable per country, not cross-country.** `cat.11013247` (Mobile & Gadgets on SG) is a different category in PH. Always resolve category names within the country host the user is shopping on. The full taxonomy is at `/api/v4/pages/get_category_tree` (per host, behind anti-bot wall).
- **Price fields are integer micros.** Shopee's API returns `price` as `price * 100000` (5-decimal micro-currency). Display value = `price / 100000`. For variant products, `price_min` and `price_max` bound the range. Cards display `price_min` (or the active flash-sale price); use both bounds when comparing identical SKUs across sellers.
- **`historical_sold` is lifetime, `sold` is recent (typically 1 month).** Don't confuse them when ranking by popularity.
- **The official Open Platform docs (`open.shopee.com`) are public** — that surface is **not** behind the buyer anti-bot wall. Use it to look up endpoint contracts (path, query params, response shape) without burning Browserbase turns on it. Direct `browse cloud fetch` works for those docs (verified 2026-05-21).
- **Confirmed dead-end paths — do not retry:**
  - `shopee.{tld}/` (homepage) — wall.
  - `shopee.{tld}/search?keyword=...` — wall.
  - `shopee.{tld}/{Category}-cat.{catid}` — wall.
  - `shopee.{tld}/{slug}-i.{shopid}.{itemid}` (product detail) — wall.
  - `shopee.{tld}/api/v4/search/search_items?...` — wall (`error: 90309999`).
  - `shopee.{tld}/api/v4/pages/get_homepage_category_list` — wall (`error: 90309999`).
  - All of the above tried with `--verified --proxies` and a fresh residential IP on two distinct sessions.

## Expected Output

```json
{
  "country": "SG",
  "host": "shopee.sg",
  "query": "usb-c cable",
  "buyer_postcode": "238859",
  "instant_filter": {
    "max_eta_hours": 6,
    "couriers_eligible": ["SPX Instant", "Pickupp Same-Day"]
  },
  "categories": [
    {
      "category_id": 11013580,
      "category_path": ["Mobile & Gadgets", "Mobile Accessories", "Cables, Chargers & Converters"],
      "items": [
        {
          "itemid": 12345678901,
          "shopid": 234567890,
          "url": "https://shopee.sg/Anker-PowerLine-III-USB-C-to-USB-C-Cable-i.234567890.12345678901",
          "name": "Anker PowerLine III USB-C to USB-C Cable 0.9m",
          "price_min_sgd": 12.90,
          "price_max_sgd": 12.90,
          "price_original_sgd": 19.90,
          "flash_sale": true,
          "rating_star": 4.87,
          "rating_count_total": 4231,
          "rating_breakdown": { "1": 41, "2": 18, "3": 67, "4": 318, "5": 3787 },
          "historical_sold": 28940,
          "sold_recent": 482,
          "shop_location": "Singapore",
          "shop_distance_km": 4.2,
          "instant_delivery": {
            "eligible": true,
            "couriers": ["SPX Instant"],
            "eta_min_hours": 2,
            "eta_max_hours": 5,
            "shipping_fee_sgd": 3.99
          },
          "is_official_shop": true,
          "is_preferred_shop": true
        }
      ]
    }
  ],
  "best_overall": {
    "itemid": 12345678901,
    "reason": "Lowest price-per-star among instant-eligible items in the top category."
  },
  "source": "shopee-open-platform-v2",
  "fetched_at": "2026-05-21T14:58:00Z"
}
```

### Outcome shapes

```json
// 1. Success — items returned, instant-eligible subset non-empty.
{ "success": true, "categories": [...], "best_overall": {...} }

// 2. Success — no items match the instant filter in the buyer's radius.
{ "success": true, "categories": [], "reason": "no_instant_eligible_in_radius",
  "fallback_suggestion": "expand radius or drop instant filter" }

// 3. Anti-bot wall (Path C attempted, blocked).
{ "success": false, "reason": "antibot_wall",
  "wall_url": "https://shopee.sg/verify/traffic/error?type=4",
  "error_code": 90309999,
  "next_step": "use Path A (Open Platform partner API) or Path B (third-party data API)" }

// 4. Country not served by Shopee.
{ "success": false, "reason": "country_unsupported",
  "supported_countries": ["SG","PH","MY","ID","TH","TW","VN","BR","MX","AR","LA","KH"] }

// 5. Query ambiguous — multiple plausible categories with no clear primary.
{ "success": false, "reason": "ambiguous_query",
  "category_candidates": [
    { "category_id": 11013580, "name": "Cables & Converters", "item_count": 12483 },
    { "category_id": 11013247, "name": "Mobile & Gadgets > Accessories", "item_count": 84412 }
  ],
  "next_step": "ask user to disambiguate or pass category_id explicitly" }
```

**Assumptions encoded in this skill** (since the user prompt did not specify): "instant delivery" means a courier ETA of ≤ 6 hours from order placement to buyer's postcode; "area radius" defaults to whatever radius the courier ecosystem natively serves from that postcode (Shopee does not expose a tunable km radius); "best price" is the lowest `price_min` among items meeting the instant + rating filter; "rating analysis" includes both `rating_star` and `rating_count` (a high star with few reviews is flagged as low-confidence); "products categorization" returns a list grouped by Shopee's first-level + leaf-level category breadcrumbs from `get_category`.
