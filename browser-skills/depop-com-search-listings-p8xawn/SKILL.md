---
name: depop-com-search-listings-p8xawn
title: Depop Search Listings
description: >-
  Search Depop's peer-to-peer fashion marketplace by keyword, category, brand,
  size, condition, color, price, sort, gender, on-sale, and shop scope,
  returning structured per-listing JSON (id, title, price, images, brand, size,
  condition, seller, shipping, status, canonical URL) plus the page-wide total
  and active filter chips. Read-only.
website: depop.com
category: marketplace
tags:
  - marketplace
  - fashion
  - depop
  - listings
  - search
  - cloudflare
  - Verified
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: hybrid
alternative_methods:
  - method: browser
    rationale: >-
      A Browserbase session with --verified --proxies is required for any work
      beyond the first 24 SSR'd results — Cloudflare gates the underlying
      webapi.depop.com XHR, and infinite-scroll pagination must be triggered
      inside a real page context that carries __cf_bm + Turnstile.
  - method: url-param
    rationale: >-
      The first 24 results for any (keyword × filter) combo are embedded in the
      search page's SSR'd RSC Flight payload and can be pulled directly from the
      HTML returned by `browse cloud fetch --proxies` — no JS execution needed.
      Use this fast-path when the caller only needs page 1 and is willing to pay
      one extra round-trip per listing for title/description/seller/condition
      (via /products/{slug}/ JSON-LD).
  - method: api
    rationale: >-
      Direct calls to webapi.depop.com/api/v2/search/products/ are confirmed
      Cloudflare-blocked (403) from cookieless/residential-proxy requests —
      verified across plain curl and `browse cloud fetch --proxies`. The
      endpoint is real and is what the page uses for pagination, but cookieless
      access is not viable. Don't waste time on header-spoofing variants.
verified: true
proxies: true
---
# Depop Search Listings

## Purpose

Search Depop's peer-to-peer fashion marketplace and return the matching listings as structured JSON — listing id, title, price (with currency + sale flag), images, brand, size, condition, seller (username + rating + reviews + location), shipping origin/cost, status, canonical URL, like-count and listed-age — plus the page-wide `total_count` and the active filter chips. Supports keyword query, full filter URL, shop-scoped search, and listing-ID lookup. Read-only — never clicks Buy Now, Make Offer, Like, Follow, Message Seller, or Sign In.

## When to Use

- "Find me a Carhartt double knee in 32x32 under $50 on Depop."
- Bulk monitoring for new listings matching a watch query (combine `?sort=newest` + `cursor` pagination).
- Shop-scoped monitoring for a specific seller's new uploads (`/{username}/`).
- Bulk hydration of a list of known listing IDs (e.g. cross-reference an external watchlist).
- Anywhere you'd otherwise scrape Depop HTML — the SSR'd RSC Flight payload gives you the first 24 results as structured JSON with no DOM parsing.

## Workflow

Depop's www.depop.com search **server-renders the first 24 results** as a JSON object embedded inside an RSC (React Server Components) Flight payload in the page HTML. Pull it out of the HTML and you get structured listings without driving any JS — fast, cheap, and stable. The follow-on `webapi.depop.com/api/v2/search/products/` XHR (used by infinite scroll) is **Cloudflare-protected** and returns 403 to cookieless requests; you only get past page 1 if you either trigger the page's own scroll behavior inside a real browser session, or call that XHR from the page's own fetch context (which carries `__cf_bm` and the Cloudflare Turnstile token). Lead with the embedded-RSC path; reach for scroll-triggered pagination only when you need >24 results.

A **Browserbase session with `--verified --proxies` is mandatory** — both Depop's HTML edge AND the underlying API sit behind Cloudflare, and cookieless residential-proxy fetches succeed for the `/search/` page but the `webapi.depop.com` endpoint silently 403s without proper Turnstile state.

### 1. Build the search URL

Map the user's filter set onto these URL params (verified empirically — every param below was tested against the live searchFilters echo and the `total_count` delta):

| Param | Values | Notes |
|---|---|---|
| `q` | free text | URL-encode spaces as `+` or `%20`. Both work. |
| `gender` | `male` \| `female` | Department. Maps to Womenswear / Menswear. |
| `isKids` | `true` \| `false` | Kids' department flag (independent of gender). |
| `brands` | `<id>,<id>` | **Numeric** brand IDs (CSV). Get IDs by fetching `/brands/{slug}/` and reading `brand_id` off the SSR'd products. Observed: Carhartt = 1673. |
| `sizes` | `US-M,US-L,UK-12,EU-40,AU-8` | Region-prefixed (`US-` \| `UK-` \| `EU-` \| `AU-`). One Size / Custom are not prefixed. |
| `colours` | `black,white,red,...` | Lowercase color names, CSV. UK spelling. |
| `conditions` | `brand_new`, `used_like_new`, `used_good`, `used_fair` | CSV. |
| `priceMin` / `priceMax` | int | In storefront currency (USD/GBP/EUR/AUD depending on country). |
| `isDiscounted` | `true` | On-sale-only filter. |
| `sort` | `relevance` (default), `newest`, `priceAscending`, `priceDescending`, `popularity` | |

**Category / subcategory** lives on the **path**, not as a query param: `https://www.depop.com/category/{gender}/{group}/{type}/` where `{gender}` is `womens`/`mens`/`kids`, `{group}` is `tops|jeans|dresses|skirts|pants|shorts|outerwear|activewear|shoes|bags|accessories|jewelry|hats|lingerie|vintage`, and `{type}` is the leaf (e.g. `t-shirts`, `crop-tops`, `tank-tops`, `hoodies`). The category page accepts the same `q=...` and filter params on top. Use this path-based form whenever the user supplies a category — the URL `?productTypes=tops` and `?groups=tops` are accepted but return 0 results (the canonical enum values for those params aren't exposed publicly).

**Brand pages**: `/brands/{brand-slug}/` (e.g. `/brands/nike/`). Accepts the same filter params.
**Shop pages**: `/{username}/` (e.g. `/evergreenvintage/`). Returns that seller's listings; the JSON-LD on this page also yields the seller's `aggregateRating.ratingValue` (stars) and `ratingCount` (review count).

**Style / Source filters (Y2K, Vintage, Cottagecore, Coquette, Preppy, Boho, Goth, Skater, etc. — and Sustainably Sourced / Handmade / Vintage) have NO URL param.** The site implements them as hashtag-keyword search. Pass `%23y2k` (or `#y2k`) inside the `q=` value: `https://www.depop.com/search/?q=%23y2k+tee`. Same for `%23vintage`, `%23handmade`, `%23sustainable`, `%23cottagecore`, etc.

**Region / currency**: Depop responds in the country of the request IP. To force a specific storefront, prefix the path with `/us/`, `/uk/`, `/au/`, `/eu/`, `/de/`, `/fr/`, or `/it/` — `https://www.depop.com/us/search/?q=...`. The page already does this rewrite (see `X-Middleware-Rewrite` response header).

### 2. Create the Browserbase session and load the page

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies --timeout 600 | jq -r '.id')
export BROWSE_SESSION="$SID"
browse open "$URL" --remote --wait load
browse get url --remote                            # sanity check (Depop may rewrite to a /{locale}/ prefix)
```

`--verified` (Verified) is required for Cloudflare; `--proxies` (residential) is required to avoid the IP-based geo-redirect to a non-target storefront. A bare cloud session gets challenged.

### 3. Extract the embedded RSC product payload from the HTML

The page bundles its hydration data as a sequence of `self.__next_f.push([1, "<chunk>"])` calls. The chunk containing the search results has the shape `..."data":{"meta":{"result_count":24,"cursor":"...","has_more":true,"total_count":N},"products":[{...},{...},...]}...` — pull it out with a regex + a balanced-brace scan:

```js
// Inside browse eval, or post-process browse get html body:
const html = document.documentElement.outerHTML;
const matches = [...html.matchAll(/self\.__next_f\.push\(\[1,"(.+?)"\]\)/gs)];
for (const m of matches) {
  const decoded = JSON.parse('"' + m[1] + '"');           // un-escape the JS string
  const i = decoded.indexOf('"data":{"meta":{"result_count":');
  if (i < 0) continue;
  // balanced-brace scan starting at the '{' after "data":
  const start = decoded.indexOf('{', i + 7);
  let depth = 0, end = start;
  for (let j = start; j < decoded.length; j++) {
    if (decoded[j] === '{') depth++;
    else if (decoded[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
  }
  const obj = JSON.parse(decoded.slice(start, end + 1));
  // obj.meta = { result_count, cursor, has_more, total_count }
  // obj.products = [{ id, slug, status, pricing, pictures, ... }, ...]
}
```

The same scan works on the raw HTML returned by `browse cloud fetch --proxies` — you don't strictly need to be inside the live browser for the **first 24 results**.

### 4. Decode each `obj.products[i]`

The per-listing object shape (see `screenshots/03-listing-schema.png` for a one-glance reference):

| Field on listing | Where in `products[i]` |
|---|---|
| `id` (numeric) | `id` |
| `url` | `` `https://www.depop.com/products/${slug}/` `` |
| `status` | `status` — one of `"ONSALE"`, `"SOLD"`, `"RESERVED"` |
| `price.raw` | `pricing.original_price.price_breakdown.price.amount` (string, e.g. `"70.00"`) |
| `price.currency` | `pricing.currency_name` (`"USD"`, `"GBP"`, `"EUR"`, `"AUD"`) |
| `price.formatted` | reconstruct from above |
| `original_price` + `discount_percent` | when `pricing.is_reduced === true`, the discounted price is in `pricing.discounted_price.price_breakdown.price.amount` and `original_price` is the un-reduced; compute `(1 - discounted/original) * 100`. When `is_reduced === false`, original_price = current price and discount_percent = null. |
| `shipping.cost` / `shipping.free` | `pricing.original_price.price_breakdown.shipping.amount === "0.00"` → free; else the amount + currency. `pricing.national_shipping_cost.type` distinguishes `"DepopShipping"` (in-app, also known as "Depop Payments") vs. `"USPS"` (seller-arranged). |
| `shipping.origin_country` | `country` (2-letter ISO; this is the seller's listed origin). |
| `images[]` | `pictures` is an array of (up to 4) objects, each keyed by render size: `{"150": "...", "210": "...", "320": "...", "480": "...", "640": "...", "960": "...", "1280": "..."}`. Use the `1280` key for full-resolution; use `320` for grid thumbnails. |
| `primary_image` | `preview["1280"]` (also equal to `pictures[0]["1280"]`). |
| `has_video` | `has_video` (boolean) |
| `sizes` | `sizes` array of display strings (e.g. `["M"]`, `["32\""]`, `["One Size"]`) |
| `variant_set_id` | `variant_set_id` (numeric — region key) |
| `variants` | `variants` map of `{ "<variantId>": <stock-qty> }` |
| `brand` | `brand_name` (display) + `brand_id` (numeric, for next-query filtering) |
| `like_count` | `like_count` |
| `seller.username` | **Parse from `slug`**: `slug.split('-')[0]` is the seller's @handle. The slug format is `{username}-{kebab-title}-{4hex}`. Verify against the OG description on `/products/{slug}/` which contains `"Sold by @{username}"`. |

**Not in the SSR feed** — for these, fetch the product detail page `https://www.depop.com/products/{slug}/` (also via `browse cloud fetch --proxies`) and parse the JSON-LD `<script type="application/ld+json">` block:

```js
{
  "@type": "Product",
  "name": "Vintage Carhartt double-knee carpenter pants ...",  // title
  "description": "...#workwear #skater #utility",              // full description + hashtag style tags
  "image": ["...", "...", "...", "..."],                       // primary + extras
  "brand": { "@type": "Brand", "name": "Carhartt" },
  "offers": {
    "priceCurrency": "USD",
    "price": "59.50",
    "availability": "https://schema.org/InStock",              // or OutOfStock → Sold
    "itemCondition": "https://schema.org/UsedCondition"        // or NewCondition
  }
}
```

The detail page's OG description (`<meta property="og:description">`) is the canonical title + the description + `" - Sold by @{username}"` — useful as a `description_snippet`. The numeric `productId` is exposed at `<meta name="twitter:app:url:iphone" content="depop://product/{id}">`.

**Seller rating + reviews + location** — fetch the user shop page `https://www.depop.com/{username}/` and parse JSON-LD:

```js
{
  "@type": "Organization",
  "name": "Emma",
  "description": "🌟 located in the PNW🌲 no cancellations!",
  "aggregateRating": {
    "ratingValue": "5",     // 0–5 stars (string, decimal)
    "ratingCount": 1778     // review count
  }
}
```

Location is **not structured** — it's free-form text inside `description` (e.g. "🌟 located in the PNW🌲", "New York, NY", "London"). Best-effort regex extraction is the only option. The "Top Seller" / "Verified" badge state isn't in the JSON-LD either; you have to read it off the page DOM (or skip if absent — Depop doesn't expose a stable structured field).

### 5. Page-wide metadata

`obj.meta` has everything you need for the wrapper:

```js
{
  result_count: 24,        // # in this batch
  cursor: "MnwyNHwxNzc5MTI0Mzc4",   // opaque, base64-ish — pass to the XHR for page 2
  has_more: true,
  total_count: 23073       // page-wide match count (display this as "23,073 results")
}
```

The **active filter chips** live in a sibling RSC chunk with `"searchFilters":{"brands":["1673"],"isDiscounted":true,"priceMin":10,"priceMax":50,...}` — pull the same way (regex for `"searchFilters":` then balanced-brace scan). Fields with value `"$undefined"` are inactive.

### 6. Pagination (only if you need >24 results)

URL pagination on `/search/?...` is silently ignored — `?cursor=`, `?offset=`, `?page=`, `?from=` all return the same first 24 (verified). To get the next batch you must either:

**(a) Scroll the page inside the live browser session** (preferred — uses the page's own fetch context with Cloudflare cookies):

```bash
browse eval --remote "window.scrollTo({top: document.body.scrollHeight, behavior: 'instant'})"
browse press --remote End                    # keyboard fallback
# wait for the next batch to render
browse eval --remote --wait-for "document.querySelectorAll('[data-testid^=\"product-card-\"]').length > 24"
# re-extract __next_f / __next_data — successive batches are appended as new push() calls
```

**(b) Hit the `webapi.depop.com` XHR from page context** (use the page's own `fetch` so it picks up `__cf_bm` and Turnstile cookies):

```bash
browse eval --remote '
  const r = await fetch(
    "https://webapi.depop.com/api/v2/search/products/?what=carhartt+double+knee&cursor=" +
    encodeURIComponent("MnwyNHwxNzc5MTI0Mzc4") +
    "&country=us&currency=USD",
    { credentials: "include", headers: { "Accept": "application/json" } }
  );
  return { status: r.status, body: await r.json() };
'
```

Replay this for each successive cursor (the response includes the next `meta.cursor`) until `meta.has_more === false`. Throttle to ≤ 1 req/s — Depop's Cloudflare WAF rate-limits aggressive clients.

### 7. Release the session

```bash
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

## Site-Specific Gotchas

- **`webapi.depop.com/api/v2/*` is Cloudflare-walled to cookieless requests.** Plain `curl`, `wget`, and Browserbase's `cloud fetch --proxies` all return **403 Access Denied** even with a residential IP. The endpoint exists and is the underlying source of truth for the JSON feed, but it requires `__cf_bm` + Turnstile state from a real browser session. The `cloud fetch` path **does** work for `www.depop.com/search/...` (returns SSR HTML with embedded products), `www.depop.com/products/{slug}/` (HTML + JSON-LD), and `www.depop.com/{username}/` (HTML + JSON-LD). Cookieless API access is **confirmed blocked** — don't waste time trying header-spoofing variants.

- **URL pagination on `/search/?...` is silently ignored.** `cursor`, `offset`, `page`, `from` all return the same first 24 results (verified with all four). Pagination must go through the XHR (step 6) inside a real browser session.

- **The Style filter (Y2K, Vintage, Streetwear, Cottagecore, Coquette, Preppy, Boho, Goth, Skater, E-girl/E-boy, etc.) has no URL param.** `?styles=y2k`, `?tags=y2k`, `?style=y2k`, `?subcategory=y2k` are all silently ignored (verified — `total_count` unchanged). The same applies to the "Source" filter (`?sources=vintage`, `?sources=sustainable`, `?sources=handmade` are also ignored). Depop's "Style" UI is implemented as a hashtag-keyword search: pass `%23y2k`, `%23vintage`, `%23cottagecore`, etc. inside the `q=` value. Note that this is keyword matching against the listing description and is less precise than a true facet filter — sellers must have actually included the hashtag in their listing copy.

- **The Shipping filter (`shippingId=*`) is also URL-ignored.** `shippingId=domestic`, `shippingId=free`, `shippingId=international`, `shippingId=2` all return unchanged result sets. Use `pricing.original_price.price_breakdown.shipping.amount === "0.00"` to identify free-shipping items client-side, and `pricing.national_shipping_cost.type === "DepopShipping"` for in-app (Depop Payments) shipping. International-shipping flag isn't exposed in the search feed at all — only on the detail page.

- **`productTypes` and `groups` URL params accept arbitrary strings but return 0 results.** `?productTypes=tops`, `?productTypes=t_shirt`, `?productTypes=128`, `?groups=womens`, `?groups=tops` — all return `total_count: 0` even though they appear in the `searchFilters` echo. The canonical enum values for these params are **not exposed** publicly. Use the **path-based** category form instead (`/category/{gender}/{group}/{type}/`) — the page itself navigates to that form when you click a category in the UI, and that path correctly sets `groups`, `gender`, and `isKids` in the search state. Verified: `/category/womens/tops/` returns `searchFilters: {groups: "tops", gender: "female", isKids: false}` with the right results.

- **Brand IDs are numeric and undocumented.** The `?brands=` param wants the integer `brand_id` (not the slug). To resolve a slug → ID, fetch `/brands/{slug}/` and read the `brand_id` field off the SSR'd `products[0]`. Examples: Carhartt = 1673. Cache the slug → id map locally.

- **Seller username is not in the search feed object.** The slug encodes it as the first hyphen-separated segment: `ev2rgreenvintage-vintage-carhartt-double-knee-carpenter-pants-4737` → username `ev2rgreenvintage`, then a kebab-cased title, then a 4-hex tail (the canonical id suffix). Verify against `og:description` on `/products/{slug}/` which contains `" - Sold by @{username}"` — these two should agree. (Caveat: some shop slugs contain hyphens, in which case the segment-split heuristic mis-splits — the OG-description check is the authoritative source.)

- **Seller location is unstructured.** The shop page JSON-LD (`/{username}/`) returns only `aggregateRating.ratingValue` (stars) and `ratingCount` (reviews). City/country lives in the free-form `description` (e.g. `"🌟 located in the PNW🌲"`, `"London, UK"`, `"NYC 📍"`). There is no structured location field on the public web surface — best-effort regex is the only option.

- **"Top Seller" / "Verified" badges aren't in the JSON-LD.** Read them off the shop page DOM (look for the badge node next to the username header). When absent from the DOM, treat as `false` — Depop doesn't expose a structured boolean.

- **Currency follows the request IP, not the URL.** Even though `pricing.currency_name` is returned per-listing, the page itself serves prices in the country-derived storefront. To pin to USD, route through `/us/...` (or `/uk/`, `/au/`, `/eu/`, `/de/`, `/fr/`, `/it/`). The `X-Middleware-Rewrite` response header confirms the active locale.

- **Listed-age ("3 days ago") is not in the SSR feed** — it's rendered client-side from a `date_created` field on the detail-page payload. Fetch `/products/{slug}/` to get an absolute timestamp.

- **`status` field decoding**: `"ONSALE"` means active and purchasable. `"SOLD"` means transacted. `"RESERVED"` means the buyer has tapped Buy and the listing is locked for ~10 minutes pending payment — these come back to `ONSALE` if the buyer abandons. Treat `RESERVED` as transiently unavailable.

- **Search returns `result_count: 24` per page but the first SSR batch only embeds the first 10 of those 24 in the RSC payload.** Listings 11–24 of the first page are streamed in via a follow-up RSC chunk during hydration. If you only see 10 in your extracted object, look for additional `__next_f` chunks that contain `"products":[{...` and merge — or trigger the scroll/XHR (step 6) once.

- **Read-only.** Don't click Buy Now, Make Offer, Like, Follow, Message Seller, or Sign In. The skill answers "what's on Depop" — never transacts.

## Expected Output

```json
{
  "success": true,
  "query": "carhartt double knee",
  "url": "https://www.depop.com/search/?q=carhartt+double+knee",
  "currency": "USD",
  "locale": "us",
  "total_results": 23073,
  "result_count": 24,
  "active_filters": {
    "brands": ["1673"],
    "priceMin": 10,
    "priceMax": 50,
    "conditions": ["used_good", "used_like_new"],
    "isDiscounted": false,
    "sort": "newest"
  },
  "next_cursor": "MnwyNHwxNzc5MTI0Mzc4",
  "has_more": true,
  "listings": [
    {
      "id": 755615128,
      "url": "https://www.depop.com/products/ev2rgreenvintage-vintage-carhartt-double-knee-carpenter-pants-4737/",
      "title": "Vintage Carhartt double-knee carpenter pants",
      "description_snippet": "Men's 34x32 — paint stains and distressing. #workwear #skater #utility",
      "status": "ONSALE",
      "price": { "amount": "70.00", "currency": "USD", "formatted": "$70.00" },
      "original_price": null,
      "discount_percent": null,
      "is_on_sale": false,
      "primary_image": "https://media-photos.depop.com/b1/3542021/3800558334_eb6b6d697db34f4780e800b747a56217/P0.jpg",
      "extra_images": [
        "https://media-photos.depop.com/b1/3542021/3800558337_dda379e5d88041649340608381b8beff/P0.jpg",
        "https://media-photos.depop.com/b1/3542021/3800558341_0ee2bc07345247deb59afc0bbb56a9a5/P0.jpg",
        "https://media-photos.depop.com/b1/3542021/3800558339_f08094f0e60041878cea799483f35491/P0.jpg"
      ],
      "has_video": false,
      "brand": "Carhartt",
      "brand_id": 1673,
      "size": "32\"",
      "condition": "Used – good",
      "color": null,
      "style_tags": ["workwear", "skater", "utility"],
      "seller": {
        "username": "evergreenvintage",
        "rating": 5.0,
        "review_count": 1778,
        "location_text": "🌟 located in the PNW🌲 no cancellations!",
        "top_seller": null,
        "verified": null
      },
      "like_count": 9,
      "listed": null,
      "shipping": {
        "origin_country": "US",
        "type": "DepopShipping",
        "domestic_cost": { "amount": "0.00", "currency": "USD" },
        "international_offered": null
      },
      "make_offer": null
    }
  ]
}
```

**Outcome variants** the caller should handle:

```json
// No matches
{ "success": true, "total_results": 0, "listings": [], "active_filters": { ... } }

// Geo-blocked / wrong-locale (Depop served a different storefront than requested)
{ "success": false, "reason": "wrong_locale", "served_locale": "uk", "requested_locale": "us" }

// Cloudflare-challenged (Turnstile failed)
{ "success": false, "reason": "cloudflare_challenge", "challenge_url": "..." }

// Brand slug not found
{ "success": false, "reason": "brand_not_found", "slug": "..." }

// Shop / username not found
{ "success": false, "reason": "shop_not_found", "username": "..." }
```

Fields populated as `null` indicate "not available in the search feed; resolve via per-listing detail-page fetch if required" — the caller decides whether the extra fetch is worth the latency budget.
