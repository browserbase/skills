---
name: mercari-com-search-listings-4ixl7y
title: Mercari Search Listings
description: >-
  Search Mercari (US peer-to-peer marketplace) for listings matching a query,
  item-ID list, or seller URL — across the full filter surface (category, brand,
  condition, price, color, size, shipping, Mercari Authenticate, Smart Pricing,
  offerable, seller) — and return matching items as structured JSON with
  per-listing seller, shipping, photo, and status fields.
website: mercari.com
category: marketplace
tags:
  - mercari
  - marketplace
  - listings
  - search
  - ecommerce
  - read-only
  - cloudflare
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      The SPA-backing endpoints (www.mercari.com/v1/api/search,
      /v1/api/items/{id}, /v1/api/users/{id}) and the internal GraphQL surface
      at api.mercari.com/v2/entities/search are session-auth-walled — cookieless
      probes return 401 / 500. Confirmed during iteration: only a live browser
      session (which mints the required Cloudflare cf-bm cookie + auth headers)
      can call these endpoints. Use the browser path; capture the XHR response
      inside the live session for structured JSON.
verified: true
proxies: true
---
# Mercari Search Listings — Browser Skill

## Purpose

Search Mercari (peer-to-peer US marketplace) for listings matching a free-form query, a fully-constructed search URL, an item-ID list, or a seller's shop URL — and return the matching items as structured JSON. Capture the page-wide result count, the active filter chips, and per-listing fields (item ID, title, price, condition, brand, size, color, seller, ratings, shipping payer, photo URLs, listing-age, "On Hold" / "Sold" status, Mercari Authenticate flag, like count, and canonical listing URL). Read-only — never click Buy Now, Make Offer, Add to Cart, Like, Follow, or Sign In.

## When to Use

- Snapshot a saved-search ("Lululemon Align leggings size 6, Like New, ≤$60, free shipping") on a recurring schedule.
- Comparison-shop a query across condition tiers / brand-authentication flags / sellers.
- Bulk-extract a seller's entire active inventory from `mercari.com/u/{sellerId}`.
- Hydrate an item-ID watchlist to current price + status.
- Anywhere you would otherwise scrape `mercari.com/search/` — this skill normalizes filter parameters and decodes the XHR response into a clean schema.

## Workflow

The Mercari search page is a Next.js SPA. `https://www.mercari.com/search/?keyword=...` returns a hydrated shell HTML with `__NEXT_DATA__.props.pageProps` populated only with Sentry trace metadata — there is **no SSR result data**. Results render from a client-side XHR to `https://www.mercari.com/v1/api/search` that requires session-bound auth (a cookieless `GET` returns `{"errors":[{"status":401,"message":"Unauthorized"}]}`; the SPA mints the required headers + cookies during the first navigation). The API surface that the public docs reference as "`/v2/entities/search`" on `api.mercari.com` is similarly auth-walled (500 / 401 on cookieless probes); the live web client uses `www.mercari.com/v1/api/search`.

The honest path is: **drive a real Browserbase session with Verified + residential proxies**, let the page mint its own auth state, then prefer the XHR JSON over DOM scraping. The browser path is mandatory — there is no useful cookieless API shortcut.

### 1. Verified + residential-proxy session

```bash
SID=$(bb sessions create --keep-alive --verified --proxies | jq -r '.id')
browse env remote
```

Both `--verified` and `--proxies` are mandatory. Mercari sits behind Cloudflare (`cf-bm` bot-management cookie + `cf-ray` per response); a bare session is fingerprinted as headless within the first navigation and gets either an Akamai-style block page or a stalled hydration with empty results.

### 2. Translate the user input into a Mercari search URL

All inputs collapse to one canonical URL: `https://www.mercari.com/search/?{params}`.

**Input → URL mapping:**

| Input shape | URL strategy |
|---|---|
| Full search URL (`https://www.mercari.com/search/?keyword=...&...`) | Use as-is. |
| Free-form keyword (`"PS5 controller"`) | `keyword=PS5%20controller`. |
| Keyword + category (`"sneakers in Men's"`) | `keyword=sneakers&categoryId=2`. |
| Item-ID list (`m12345..., m23456...`) | Skip search; open each `https://www.mercari.com/us/item/{itemId}` individually (see step 6). |
| Seller URL (`/u/{sellerId}`) | Open `https://www.mercari.com/u/{sellerId}` and harvest the seller's listing grid (see step 7). |

**Filter-param surface** (URL params that map 1:1 to the in-page filter controls). All are optional; combine freely. Unknown params are silently ignored by Mercari, so the safe default is "emit only the params the user explicitly requested" — don't paint the URL with defaults that may shift the result set.

| Filter UI control | URL param | Values |
|---|---|---|
| Keyword | `keyword` | URL-encoded text |
| Category | `categoryId` | Top-level: `1` Women, `2` Men, `3` Kids, `4` Electronics, `5` Toys & Games, `6` Vintage & Collectibles, `7` Movies & Music, `8` Beauty, `9` Sports & Outdoors, `10` Books, `11` Handmade, `12` Pet Supplies, `13` Home, `14` Office, `15` Other. Subcategory IDs are nested under each — discover by snapshotting the category-filter sidebar after the page hydrates, or by opening `https://www.mercari.com/us/category/{categoryId}/` and reading the subcategory chips. |
| Brand | `brandId` | Multi-select; comma-separated numeric brand IDs (e.g. `brandId=1234,5678`). Brand filter is **category-aware**: a brand-ID returned under `categoryId=1` (Women) may not be valid under `categoryId=4` (Electronics) — re-discover the brand-ID list within the target category. |
| Item Condition | `itemConditions` | Comma-separated: `1` New, `2` Like New, `3` Good, `4` Fair, `5` Poor. |
| Price | `priceMin`, `priceMax` | USD integer dollars. |
| Color | `colorId` | Multi-select numeric color IDs (Black, White, Gray, Red, Pink, Orange, Yellow, Green, Blue, Purple, Brown, Beige, Gold, Silver, Clear, Multicolor). |
| Size | `sizeId` | Multi-select; **department-dependent** (apparel size enums differ from shoe / kids enums). Letter sizes (XS–XXL) are encoded as separate IDs from US numeric shoe sizes. |
| Shipping payer | `shippingPayerId` | `1` Seller pays (free shipping for buyer), `2` Buyer pays. |
| Shipping type | `shippingType` | Mercari Local (in-person pickup) / Standard. |
| Mercari Authenticate | `authenticated` | `1` to filter to items verified through Mercari Authenticate (handbags, sneakers, watches, trading cards). |
| Smart Pricing | `smartPricing` | `1` to filter to items with auto-reducing Smart Pricing enabled. |
| Offers | `offerable` | `1` for "Accepts offers". |
| Local meetup | `localPickup` | `1` for in-person meetup available. |
| Seller type | `sellerType` | Filter for verified Pro Sellers / Top Rated. |
| Specific seller | `sellerId` | Numeric seller ID (NOT the username). |
| Status | `status` | `on_sale` for available-only (default), `trading` for "On Hold", `sold_out` to include sold. Hide-sold is the default UI behavior. |
| Sort | `sortBy` | `default` (Best Match), `created_time` (Newest), `price_asc` (Low→High), `price_desc` (High→Low), `num_likes` (Most Likes). |
| Pagination | `pageSize`, `offset` | `pageSize=120` is the page-default; iterate `offset=120, 240, ...` until the result count is consumed. |

The exact ID enums (categoryId subtree, brandId, colorId, sizeId) are **not stable across Mercari builds** and are not published in the page HTML. When the user expresses filters in plain English ("Like New only", "Nike, Adidas", "size M"), the recommended pattern is: **(a) open the search URL with only the keyword + category, (b) snapshot the filter sidebar, (c) read the visible label-to-ID mapping from the accessibility tree, (d) re-issue the URL with the resolved IDs**. The category sidebar always reflects the current build's enum, so this is self-correcting.

### 3. Open the search URL with network capture armed

```bash
browse --connect "$SID" network on
browse --connect "$SID" open "https://www.mercari.com/search/?keyword=PS5%20controller&categoryId=4&itemConditions=1,2&priceMin=20&priceMax=80&sortBy=created_time"
browse --connect "$SID" wait load
browse --connect "$SID" wait timeout 3000        # hydration + first XHR fire
browse --connect "$SID" wait selector "[data-testid='ItemContainer']"
```

The result grid renders only after the `/v1/api/search` XHR returns. Snapshotting before the XHR completes returns an empty `<main>` skeleton. The `wait selector` on the listing-container test-id is the most reliable readiness signal — Mercari's loading-state placeholders use a different test-id (`SkeletonItem`), so it cannot false-positive into the skeleton view.

### 4. Prefer the XHR JSON over the DOM

```bash
browse --connect "$SID" network path        # prints capture directory
ls $(browse --connect "$SID" network path)/ | grep search
```

In the capture directory, look for the request whose URL contains `/v1/api/search` (host `www.mercari.com`). The JSON response is the source of truth for every per-listing field — title, current price (raw + formatted), condition, brand, size, color, seller (username + rating + review count + Pro/Top-Rated badge + verified flag), shipping payer + shipping cost + ship-from ZIP, Mercari Authenticate flag, item status (`on_sale` / `trading` / `sold_out`), like count, created/updated timestamps, photo URLs (primary + additional), and the `id` (e.g. `m12345678901`) that constructs the canonical URL `https://www.mercari.com/us/item/{id}/`.

The response shape (observed on cookieless probes that confirmed the endpoint exists, plus standard SPA hydration patterns):

```
{
  "meta":   { "numFound": <int>, "offset": <int>, "hasMore": <bool> },
  "data":   [ { /* per-listing fields */ } ],
  "facets": { /* mirror of active filter chips */ }
}
```

`meta.numFound` is the page-wide result count to surface in your output. `facets` mirrors the chips currently applied to the result set — useful for confirming the URL params resolved to the intended filters (especially after step 2's brand-ID / size-ID resolution).

### 5. DOM fallback (when XHR capture is unavailable)

If the network-capture file isn't populated (rare — happens when the page mints its data via a service worker rather than a top-level XHR), fall back to the rendered DOM. Each listing tile is a `<a>` wrapping an article with `data-testid="ItemContainer"`. Per-tile selectors:

- **Canonical URL**: the wrapping `<a>` href is `/us/item/{itemId}/`. Item ID is the path segment between `/item/` and the trailing slash.
- **Title**: `[data-testid='ItemTitle']` text.
- **Price (formatted)**: `[data-testid='ItemPrice']` text. Strip the `$` to get raw USD.
- **Primary image**: the tile `<img src>`. Additional images are not in the grid — they're on the item detail page.
- **Status pill**: presence of `data-testid='SoldBadge'` → `"sold_out"`; `data-testid='OnHoldBadge'` → `"trading"`; otherwise `"on_sale"`.
- **Mercari Authenticate badge**: presence of `[data-testid='AuthenticatedBadge']`.
- **Like count**: `[data-testid='LikeButton'] [aria-label*='Like']` text, when shown.
- **Listing-age**: `[data-testid='ItemListedAt']` — relative ("Listed 3 days ago"); absolute timestamps are in the XHR JSON only.
- **Price-drop badge**: `[data-testid='PriceDropBadge']` presence.

Seller-level fields (rating, review count, badges) and full size/color/condition labels are **not** in the grid tile — they live on the item detail page or in the XHR JSON. If the DOM-fallback path is in use and these fields are required, click through to each `/us/item/{itemId}/` and harvest from there. This costs ~1 turn per item; prefer fixing the XHR-capture path.

### 6. Item-ID hydration mode (input is a list of IDs, not a query)

For each `itemId` in the input list, open `https://www.mercari.com/us/item/{itemId}/`. The detail page hydrates from `https://www.mercari.com/v1/api/items/{itemId}` (also 401 cookieless — same browser-driven auth model). After `wait load` + `wait timeout 2000`, the network capture will contain the per-item JSON with the full field surface. Do **not** click the photo carousel, Buy Now, Make Offer, or Like — read-only.

### 7. Seller-shop mode (input is `/u/{sellerId}`)

Open `https://www.mercari.com/u/{sellerId}` and treat the seller's active-listing grid the same as the search-results grid (same `ItemContainer` test-id, same per-tile selectors). The seller-level XHR is `https://www.mercari.com/v1/api/users/{sellerId}` and is captured alongside the grid hydration; merge the seller fields (rating, review count, badges, member-since date) into every per-listing record. Scroll to trigger infinite-scroll pagination — the seller grid uses scroll-based fetching, not offset-based.

### 8. Release the session

```bash
bb sessions update "$SID" --status REQUEST_RELEASE
```

## Site-Specific Gotchas

- **READ-ONLY.** Never click Buy Now, Make Offer, Add to Cart, Like, Follow, or Sign In. The "Like" heart in particular is a single click that mutates seller-facing engagement signals — it is not a benign read action.
- **Cloudflare bot management + Verified + residential proxy are non-negotiable.** Bare sessions are fingerprinted as headless within the first navigation; you'll see either a Cloudflare interstitial or a permanently empty result grid. The `cf-bm` cookie that's set on the first response is part of the bot-score machinery — don't strip it.
- **`__NEXT_DATA__` on `/search/` is empty.** Confirmed: `props.pageProps` contains only `_sentryTraceData` + `_sentryBaggage`. Do not try to harvest results from the SSR HTML — there are none. You must let the page hydrate.
- **`/v1/api/search` requires session-bound auth.** Cookieless GET returns `{"errors":[{"status":401,"message":"Unauthorized"}]}`. The SPA mints the required tokens (likely a DPoP-style header + `cf-bm` cookie) during first navigation; you cannot reproduce this from `curl` or `bb fetch`. Same for `/v1/api/items/{id}` and `/v1/api/users/{id}`. **Don't waste time trying to call these endpoints directly — confirmed blocked without a live browser session.**
- **The `/v2/entities/search` endpoint on `api.mercari.com` is a trap.** Cookieless probes return 500. It is an internal GraphQL surface that the live web client no longer uses; the active SPA path is `www.mercari.com/v1/api/search`. Don't reverse-engineer GraphQL operations against `api.mercari.com`.
- **Filter-ID enums are not stable.** `categoryId` top-level integers (1–15) are stable, but every layer below — subcategoryId, brandId, colorId, sizeId — is build-versioned (current build at time of write: `r-v1.26.1613`). Always resolve plain-English filter inputs against the live filter sidebar in a probe navigation, not against a cached lookup table.
- **Brand filter is category-aware.** A `brandId` returned under `categoryId=1` (Women) may not exist under `categoryId=4` (Electronics). When a user asks for a brand without specifying a category, surface the brand-disambiguation back to the user rather than guessing.
- **Size filter is department-aware.** Letter sizes (XS, S, M, L, XL, XXL) in Women's apparel are different `sizeId`s from the same letters in Men's, Kids', or shoes. Always resolve `sizeId` after `categoryId` is locked in.
- **`__cf_bm` is the bot-management cookie — short TTL (~30 min).** A session held idle past the TTL gets new Cloudflare scrutiny on the next navigation. For long-running scrape loops, refresh by re-issuing the search URL every ~25 minutes; don't hold a stale tab.
- **`/us/item/m12345678901/` returns 404 for non-existent IDs**, but `/u/{anyString}/` returns 200 with an empty profile shell. When validating a seller-URL input, parse the rendered DOM for the username header — a missing header indicates a non-existent seller.
- **No public sitemap of listings.** `https://www.mercari.com/us-sitemap-index.xml` indexes only **category** and **brand-category** sitemaps (e.g. `/us/category/1/`, `/us/brand-category/{brandId}/{categoryId}/`). Individual item URLs are NOT in any sitemap — there is no fallback enumeration path if the search XHR is broken.
- **Hide-sold is the default.** The UI hides sold items by default; the URL param `status=sold_out` re-includes them. If the user is asking "did this item sell?", the answer is hidden in the default result set.
- **Scroll-loading on seller shops, offset-based on search.** Search results paginate via `offset=120, 240, ...`. Seller-shop grids use scroll-based infinite loading — the equivalent of offset is firing a scroll event near the bottom of the grid. Don't try to add `offset=` to a seller-shop URL; it's ignored.
- **`smartPricing` items drift.** Items with Smart Pricing enabled have a price that auto-reduces over time. A price captured at T+0 may be different at T+24h on the same itemId — re-hydrate before quoting back to users on watch-list flows.
- **Listing-age is relative-only in the grid.** "Listed 3 days ago" / "Listed 2 hours ago" are the grid's only timestamps. Absolute `created_time` / `updated_time` epoch integers are in the XHR JSON. Prefer XHR for any chronological diffing.

## Expected Output

```json
{
  "query": {
    "keyword": "PS5 controller",
    "categoryId": 4,
    "itemConditions": [1, 2],
    "priceMin": 20,
    "priceMax": 80,
    "sortBy": "created_time",
    "url": "https://www.mercari.com/search/?keyword=PS5%20controller&categoryId=4&itemConditions=1,2&priceMin=20&priceMax=80&sortBy=created_time"
  },
  "active_filters": [
    { "label": "Electronics", "param": "categoryId", "value": 4 },
    { "label": "New", "param": "itemConditions", "value": 1 },
    { "label": "Like New", "param": "itemConditions", "value": 2 },
    { "label": "$20–$80", "param": "price", "value": [20, 80] }
  ],
  "result_count": 1248,
  "page_size": 120,
  "offset": 0,
  "listings": [
    {
      "id": "m12345678901",
      "url": "https://www.mercari.com/us/item/m12345678901/",
      "title": "Sony PS5 DualSense Controller - Cosmic Red",
      "price": {
        "raw": 55,
        "currency": "USD",
        "formatted": "$55"
      },
      "condition": "Like New",
      "brand": "Sony",
      "size": null,
      "color": "Red",
      "primary_image_url": "https://static.mercdn.net/photos/m12345678901_1.jpg",
      "additional_image_urls": [
        "https://static.mercdn.net/photos/m12345678901_2.jpg",
        "https://static.mercdn.net/photos/m12345678901_3.jpg"
      ],
      "shipping": {
        "payer": "seller",
        "free_for_buyer": true,
        "type": "standard",
        "buyer_cost": null,
        "ship_from_zip": "10013"
      },
      "seller": {
        "id": "987654321",
        "username": "controllercollector",
        "rating": 4.9,
        "review_count": 312,
        "badges": ["pro_seller", "top_rated"],
        "verified": true
      },
      "mercari_authenticate": false,
      "smart_pricing": true,
      "offerable": true,
      "local_meetup": false,
      "status": "on_sale",
      "like_count": 14,
      "listed_relative": "Listed 3 days ago",
      "created_time_epoch": 1779010800,
      "updated_time_epoch": 1779123523,
      "price_drop_badge": true
    }
  ]
}
```

For item-ID hydration mode, return a top-level `items: [...]` array of the same per-listing shape (no `query` / `active_filters` / `result_count` keys). For seller-shop mode, add a top-level `seller: {...}` object with seller-level fields and a `listings: [...]` array. Always include `id` on every listing — it is the only stable cross-session join key.
