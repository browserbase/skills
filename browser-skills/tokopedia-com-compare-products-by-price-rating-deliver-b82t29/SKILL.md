---
name: tokopedia-com-compare-products-by-price-rating-deliver-b82t29
title: 'Tokopedia Product Comparison by Price, Rating & Instant Delivery'
description: >-
  Search Tokopedia for a product query and return a price-ranked list with star
  rating, sold count, seller city, free-shipping flag, instant-courier
  eligibility (Tokopedia 'Instan' / 'Same Day' filter), and category breadcrumb.
  Also groups results by Tokopedia's category taxonomy. Read-only — never adds
  to cart.
website: tokopedia.com
category: marketplace
tags:
  - marketplace
  - ecommerce
  - tokopedia
  - indonesia
  - product-search
  - price-comparison
  - delivery
source: 'browserbase: agent-runtime 2026-05-21'
updated: '2026-05-21'
recommended_method: hybrid
alternative_methods:
  - method: browser
    rationale: >-
      URL-encoded filter params (q, ob, rt, shipping_child, pmin/pmax) do all
      server-side ranking and filtering — open the URL and harvest cards from
      the a11y snapshot. Simplest path; works without GraphQL access.
  - method: api
    rationale: >-
      SearchProductV5Query at https://gql.tokopedia.com/graphql is the
      underlying API and exposes category.breadcrumb (not visible in DOM cards).
      Must be called from page context (in-browser fetch) to inherit cookies and
      device-fingerprint headers — a bare curl with proxies returns
      truncated/empty products[].
  - method: fetch
    rationale: >-
      Confirmed NOT viable as a standalone path. `browse cloud fetch --proxies
      https://gql.tokopedia.com/graphql/SearchProductV5Query` returns truncated
      body even with all 10 captured headers because device-fingerprint cookies
      (bd-device-id, bd-web-id) are missing. The SSR'd HTML page is fetchable
      but contains zero product cards (they're hydrated client-side).
verified: true
proxies: true
---
# Tokopedia Product Comparison by Price, Rating & Instant Delivery

## Purpose

Given a product query and (optionally) a buyer delivery address, return a ranked list of Tokopedia listings with: lowest price first, star rating, sold count, seller name + seller city, free-shipping flag, instant-delivery eligibility (Tokopedia's "Instan" / "Same Day" courier filter), category breadcrumb, and product URL. Also emit a `categories` map grouping the products by Tokopedia's own taxonomy (e.g. `Makanan & Minuman / Kopi`, `Handphone & Tablet / iOS`). Read-only — never adds to cart, never checks out.

## When to Use

- Price-comparison shopping on Tokopedia where the user needs "cheapest with good rating that can ship to my address today".
- Filtering by Tokopedia's instant-delivery courier mesh (sellers within instant-courier radius of the buyer's address — implemented server-side via the `shipping_child=nearby,...` filter, not a per-card badge).
- Pulling a multi-category breakdown of search results for a broad keyword ("kopi" → coffee beans, instant coffee, coffee machines, etc.).
- Bulk price/rating extraction across hundreds of SKUs for monitoring or arbitrage.

## Workflow

The optimal path is a **hybrid** of URL-encoded filter params + DOM extraction, with an optional in-page GraphQL fetch for category breadcrumbs. The server does all heavy ranking/filtering via URL params — DO NOT re-rank client-side until the URL-filtered result set is exhausted. Stealth + residential proxy is recommended (`--verified --proxies`) — Tokopedia is Akamai-protected and bare sessions intermittently get challenged. Default buyer address is set from the request IP and exposed on the header as "Dikirim ke {city}" — without an authenticated session you cannot change it via URL alone (the address is a cookie + the `user_cityId`/`user_districtId` params are baked into the page at SSR time).

1. **Open a stealth session**:
   ```bash
   SID=$(browse cloud sessions create --keep-alive --verified --proxies \
     | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
   export BROWSE_SESSION="$SID"
   ```

2. **Build the filtered search URL.** Tokopedia exposes every filter as a URL param on `/search`:
   - `q=<URL-encoded query>` — required
   - `st=product` — search type (vs. `shop`)
   - `ob=<sort>` — sort order: `3` Harga Terendah (cheapest), `4` Harga Tertinggi (highest), `5` Ulasan (most-reviewed), `9` Terbaru (newest), `23` Paling Sesuai (most-relevant, default)
   - `rt=4,5` — rating filter, returns products rated 4★ and above (the value `4,5` is Tokopedia's encoding — both digits are the option key, not a range)
   - `shipping_child=nearby,7408193449930786576` — **Instan** (instant courier eligible to current buyer address)
   - `shipping_child=nearby,7408193863459800833,7408194434065663761` — **Same Day**
   - `pmin=<int>` / `pmax=<int>` — price floor / ceiling in Rupiah (no separator, e.g. `pmax=100000`)
   - `fcity=<city-id>` — filter by seller city (not buyer destination)
   - `shop_tier=2` — Mall only; `shop_tier=3` — Power Shop only
   - `condition=1` Baru (new); `condition=2` Bekas (used)
   - `cod=true` — Cash on Delivery only
   - `is_discount=true` — discounted products only

   Canonical "cheapest, well-rated, instant-eligible" URL:
   ```
   https://www.tokopedia.com/search?q=<query>&st=product&ob=3&rt=4,5&shipping_child=nearby,7408193449930786576
   ```

3. **Open + wait for hydrate**:
   ```bash
   browse open "$URL" --remote --session "$SID"
   sleep 3   # client-side React hydration; SSR includes the first 60 cards
   ```

4. **Extract the buyer address** (so the caller knows what destination the instant-delivery filter was scoped to):
   ```bash
   browse eval --remote --session "$SID" \
     "(() => document.querySelector('[data-testid=\"chosen-address\"]')?.innerText || null)()"
   # → "Dikirim ke\nJakarta Pusat"
   ```

5. **Harvest product cards from the snapshot.** `browse snapshot` returns the full a11y tree with every card's data in a stable order. Each card is an `[N-XXXX] link:` node whose `aria-label` concatenates: `product-image [discount%] [video sneakpeek] [Beli Lokal] <name> <price_text> [<original_price>] [Hemat s.d X% Pakai Bonus] [Bisa COD] rating <rating> <sold_count> terjual [shop badge] <shop_name> <shop_city> three dots`. The cleanest extraction is via the tree's per-card `StaticText` children, which are emitted in this order:
   - Product name (first text node after the image block)
   - Price text (`Rp[0-9.]+`) — first one is the current price, second (if present) is the original / crossed-out price
   - Optional "Hemat s.d X% Pakai Bonus" promo line
   - Rating value (decimal like `4.9`, `5.0`)
   - Sold count (`X terjual` — Indonesian quantity suffixes: bare integer, `100+`, `250+`, `500+`, `750+`, `1rb+` (1000+), `4rb+` (4000+))
   - Shop name (text)
   - Shop city (text, e.g. `Jakarta Pusat`, `Kab. Tangerang`, `Medan`, `Yogyakarta`)
   - The `link`'s href is the canonical product URL: `https://www.tokopedia.com/<shop-slug>/<product-slug>?extParam=ivf%3D...%26src%3Dsearch`

   The DOM does **not** explicitly list `GoSend / Same-day / Anteraja / SiCepat` couriers on the card — courier matching is done server-side by the `shipping_child` URL filter. All cards in the returned set are by-definition instant-eligible to the chosen buyer address.

6. **(Optional) Enrich with category breadcrumb via in-page GraphQL.** The category is **not** in the search-result DOM cards but **is** in the `SearchProductV5Query` GraphQL response. Call it from page context so the page's cookies + device-fingerprint headers are reused:
   ```bash
   browse eval --remote --session "$SID" "(async () => {
     const body = JSON.stringify([{
       operationName: 'SearchProductV5Query',
       variables: { params: 'device=desktop&l_name=sre&ob=3&page=1&q=<URLENC-QUERY>&rows=60&safe_search=false&source=search&st=product&start=0&shipping=&shipping_child=nearby,7408193449930786576&rt=4,5' },
       query: 'query SearchProductV5Query(\$params: String!) { searchProductV5(params: \$params) { header { totalData } data { totalDataText products { id name url price { text number original discountPercentage } shop { name city tier } category { name breadcrumb } rating freeShipping { url } labelGroups { position title } badge { title } } } } }'
     }]);
     const r = await fetch('https://gql.tokopedia.com/graphql/SearchProductV5Query', {
       method: 'POST',
       headers: { 'content-type': 'application/json', 'x-source': 'tokopedia-lite', 'x-tkpd-lite-service': 'zeus', 'x-device': 'desktop-0.0', 'x-version': '844d199' },
       body
     });
     return await r.json();
   })()"
   ```
   The response gives each product a `category.breadcrumb` like `makanan-minuman/minuman/kopi-bubuk` and `category.name` like `Makanan & Minuman`. The `labelGroups[].position` field also surfaces internal flags like `ri_product_credibility` (sold-count label), `final_price`, `oos` (out-of-stock), `freeship_extra`, and `bebas_ongkir`. The `freeShipping.url` field is non-empty when the product qualifies for "Bebas Ongkir" (free shipping).

7. **Paginate** (only if needed; first page returns up to 60 products). Add `&page=2`, `&page=3`, etc. to the URL — `totalData` in the GraphQL header tells you how many pages remain. Don't request more than ~5 pages without re-checking — Tokopedia degrades to fuzzy / related-keyword fallback after ~300 cards (see fallback gotcha below).

8. **Build the categorization map**. Group products by `category.breadcrumb` (or `category.name` if breadcrumb is empty for some items). The breadcrumb path encodes the full taxonomy (e.g. `makanan-minuman/minuman/kopi-bubuk` → top: `Makanan & Minuman`, sub: `Minuman`, leaf: `Kopi Bubuk`). For products missing a category in the GraphQL response, bucket as `Lainnya` ("Other").

9. **Rank within the result set**:
   - Primary sort: `price.number` ascending (already enforced by `ob=3`).
   - Secondary tiebreaker: parsed numeric `rating` descending.
   - Tertiary tiebreaker: parsed numeric sold-count descending (`1rb+` → 1000, `4rb+` → 4000, treat the `+` as "at least").
   - For "best price per category", group first then take the cheapest from each `categories[name][0]`.

10. **Release the session**:
    ```bash
    browse cloud sessions update "$SID" --status REQUEST_RELEASE
    ```

## Site-Specific Gotchas

- **READ-ONLY.** Never click the "+" / "Beli Langsung" / "Masukkan Keranjang" buttons. The "three dots" button on each card opens a wishlist/share menu — also avoid.
- **Stealth + residential proxy strongly recommended.** Tokopedia is Akamai-protected. A bare session loads the page intermittently but the `SearchProductV5Query` GraphQL call from a non-fingerprinted session returns truncated or empty `products[]`. `--verified --proxies` works reliably across 5 test queries (`kopi arabica`, `iphone`, `sepatu lari`, `batu mulia safir antik`, gibberish). No CAPTCHA was triggered in any iteration.
- **Buyer address is sticky to the session/IP, not the URL.** The "Dikirim ke {city}" header drives `user_cityId` + `user_districtId` baked into the SSR'd page (verified: `user_cityId=176&user_districtId=2274` = Jakarta Pusat for a US-West-2 + Indonesian residential proxy). The instant-delivery filter (`shipping_child=nearby,...`) is matched server-side against THIS address. To change destination, the user must (a) click `button: Dikirim ke {city}` in the header, (b) select a new district, (c) reload — the URL params alone do NOT change the destination. **Without a logged-in account, the address picker requires a multi-step interaction (province → city → district), which is fragile.** Document and accept the IP-default address as the result's effective scope.
- **`shipping_child` not `shipping`.** Both URL params exist; the working one for "Instan / Same Day" courier filter is `shipping_child=nearby,<id1>,<id2>...`. The `shipping=` param is server-internal and accepts a different format — ignore it.
- **Instant courier value IDs are stable enums** (verified 2026-05-21):
  - Instan: `shipping_child=nearby,7408193449930786576`
  - Same Day: `shipping_child=nearby,7408193863459800833,7408194434065663761`
  - These are NOT human-readable courier names (GoSend, Anteraja, SiCepat, JNE YES, Lalamove) — Tokopedia's "Instan" bucket maps to whichever of those couriers serves the buyer's district at request time. The cards do NOT show which specific courier — that is only revealed at checkout. To get courier names, you must click into a product detail page and inspect the shipping options block (out of scope for read-only comparison).
- **`rt=4,5` is the option key, not a range.** Tokopedia's rating filter has only one option: "Rating 4 ke atas" (4 stars and above). The value `4,5` is its internal key. There is no `rt=3` or `rt=5` option exposed in the filter panel.
- **No-results page does NOT exist for product search; fuzzy fallback kicks in.** Even a gibberish query like `xxxxnoresultsxxxx` returns 58 unrelated "recommended" products (no banner indicating fallback). To detect a true zero-match, check `header.totalData` from the GraphQL response — if it returns `0` but the page still shows products, those are fallback recommendations and should be flagged as `{ fallback: true }` in the output. The DOM message "Yah, barang yang kamu cari tidak ditemukan" (We couldn't find that item) appears only for malformed `st=` values, not for normal misses.
- **Sold-count display strings are bucketed, not exact.** Tokopedia rounds to `100+`, `250+`, `500+`, `750+`, `1rb+` (1000+), `2rb+`, `4rb+`, `10rb+`. The exact count is not exposed on the search page. The GraphQL response also returns the bucketed string in `labelGroups[].title` where `position == "ri_product_credibility"` — not a raw integer. Treat the `+` as "at least N".
- **Shop tier is an integer enum** in the GraphQL response: `tier: 1` = regular seller, `tier: 2` = Power Shop (verified buyer-rating gated), `tier: 3` = Power Merchant Pro. "Mall" sellers (Tokopedia Mall = official brand stores) carry a separate `badge.url` pointing at an SVG, and the badge `title` is the seller's city. Don't conflate `badge.title` (a city string) with the tier integer.
- **Price formatting**: `price.text` is the Indonesian-locale Rupiah string (`Rp1.250.000` — dots are thousands separators, NOT decimals). `price.number` is the integer in Rupiah (e.g. `1250000`). Always use `price.number` for arithmetic.
- **The page embeds Apollo state in a 500KB inline `<script>`** (`window.initialGlobalState`) — useful when the live GraphQL fetch fails. Look for keys matching `searchProductV5({"params":"..."})` to pull pre-rendered first-page data without an extra API call. But the embedded state is keyed by a long URL-encoded params string — re-querying is usually simpler.
- **The `extParam` URL-suffix on every product link** carries `keyword=`, `search_id=`, `src=search` for analytics. It's part of the canonical URL — strip it if you want a clean product URL for sharing.
- **Don't waste time on `/search/?…` (with trailing slash)** — it 302-redirects to `/search?…`. Use the no-slash form to save one network hop.
- **Direct API call from a bare proxy curl is blocked.** `browse cloud fetch --proxies` against `https://gql.tokopedia.com/graphql/SearchProductV5Query` with the captured headers returns truncated body (no `products[]`) because the device-fingerprint cookies are not present. The in-page `fetch()` call (from a browser session that has loaded `tokopedia.com` first) works reliably. **Never try to call the GraphQL endpoint standalone — always make the fetch from page context.**
- **Pagination cap ~5 pages.** Beyond page 5, `header.responseCode` flips to a soft-degraded mode and the result set bleeds into "kamu mungkin suka" (you might like) recommendations. `header.totalData` overstates the truly-matching count; trust `header.responseCode == 0` per page.

## Expected Output

```json
{
  "success": true,
  "query": "kopi arabica",
  "destination": "Jakarta Pusat",
  "filter": {
    "sort": "Harga Terendah (ob=3)",
    "min_rating": 4.0,
    "instant_delivery": true,
    "courier_filter": "shipping_child=nearby,7408193449930786576 (Instan)"
  },
  "total_results": 320,
  "products": [
    {
      "rank": 1,
      "id": "100755422337",
      "name": "Top Kopi Murni Arabica 165gr",
      "url": "https://www.tokopedia.com/betajaya/top-kopi-murni-arabica-165gr",
      "price": 22555,
      "price_display": "Rp22.555",
      "original_price": null,
      "discount_percent": 0,
      "rating": 5.0,
      "sold_count_display": "27 terjual",
      "sold_count_min": 27,
      "shop_name": "BETAJAYA_PO",
      "shop_city": "Kab. Ponorogo",
      "shop_tier": 1,
      "category": "Makanan & Minuman",
      "category_breadcrumb": "makanan-minuman/minuman/kopi-bubuk",
      "free_shipping": true,
      "instant_delivery_eligible": true,
      "courier_options_at_checkout": "resolved at checkout — not exposed on search card"
    },
    {
      "rank": 2,
      "name": "KOPI ARABIKA ACEH GAYO RED HONEY",
      "price": 23000,
      "price_display": "Rp23.000",
      "rating": 4.8,
      "sold_count_display": "70+ terjual",
      "sold_count_min": 70,
      "shop_name": "CERIA COFFEE ROASTERY",
      "shop_city": "Bandung",
      "shop_tier": 1,
      "category": "Makanan & Minuman",
      "category_breadcrumb": "makanan-minuman/minuman/kopi-biji",
      "free_shipping": true,
      "instant_delivery_eligible": true
    }
  ],
  "categories": {
    "makanan-minuman/minuman/kopi-bubuk": [
      { "name": "Top Kopi Murni Arabica 165gr", "price": 22555, "rating": 5.0 }
    ],
    "makanan-minuman/minuman/kopi-biji": [
      { "name": "KOPI ARABIKA ACEH GAYO RED HONEY", "price": 23000, "rating": 4.8 }
    ],
    "Lainnya": []
  },
  "fallback": false,
  "error_reasoning": null
}
```

For a fallback (gibberish / no real matches) result:

```json
{
  "success": true,
  "query": "xxxxnoresultsxxxx",
  "destination": "Jakarta Pusat",
  "total_results": 0,
  "products": [ ...58 fuzzy-fallback items... ],
  "fallback": true,
  "fallback_note": "Tokopedia returned 58 'recommended' products that do not actually match the query. header.totalData == 0.",
  "categories": { "Lainnya": [...] },
  "error_reasoning": null
}
```

For an anti-bot / Akamai block (rare with `--verified --proxies`):

```json
{
  "success": false,
  "query": "kopi arabica",
  "products": [],
  "error_reasoning": "Akamai 403 on /search; GraphQL also returned 403. Retry with a fresh stealth session."
}
```
