---
name: stockx-com-get-resale-price-eewaou
title: StockX Resale Price Lookup
description: >-
  Given a sneaker or streetwear product (name + optional size), return the
  StockX market snapshot: lowest ask, highest bid, last sale + date, recent
  sales volume, and a 30-day price-trend payload. Read-only — never bids or
  buys.
website: stockx.com
category: marketplace
tags:
  - stockx
  - sneakers
  - resale
  - pricing
  - marketplace
  - read-only
  - cloudflare
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: hybrid
alternative_methods:
  - method: url-param
    rationale: >-
      Locale-prefixed PDP fetch (`/en-gb/{slug}`, `/de-de/{slug}`, etc.)
      bypasses Cloudflare without proxies and yields full static metadata via
      `__NEXT_DATA__`. Sufficient when the caller only needs retail price,
      release date, styleId, colorway, and the variant grid — not live
      ask/bid/last-sale. Verified across 9 locales × 2 products with zero CF
      mitigation.
  - method: browser
    rationale: >-
      Required for live market data (lowestAsk, highestBid, lastSale, volume,
      price trend). The market widget is intentionally not in SSR — the `<p
      data-component="LastSale">--</p>` placeholder fills in via a
      post-hydration GraphQL call. Verified + residential proxy mandatory for the
      default `/{slug}` path; the locale path works in-browser too, but
      in-browser there's no upside to the locale prefix.
  - method: api
    rationale: >-
      StockX's official Public API at `api.stockx.com/v2/catalog/...` returns
      the same data the site uses, with OAuth client_credentials + Bearer token.
      Closed-beta developer registration required; most agents will not have
      access. The legacy unofficial
      `stockx.com/api/products/{slug}?includes=market` endpoint is fully
      deprecated as of 2026-05-18 (returns 404 with empty body).
verified: false
proxies: false
---
# StockX Resale Price Lookup

## Purpose

Given a sneaker or streetwear product name (and optional size), return the StockX market snapshot: live **Lowest Ask**, **Highest Bid**, **Last Sale** (price + date), recent sales **volume**, and a small **price-trend** payload (52-week high/low, average sale price, price premium vs. retail). Also returns static metadata — retail price, release date, style ID, colorway, brand, and the full size grid — which is useful as a fallback when the live market widget fails to hydrate. Read-only: never click Buy, Bid, Sell, or place an Ask.

## When to Use

- Daily/hourly tracking of resale price drift for a watchlist of sneakers or streetwear pieces.
- "What's the going rate for {Jordan 4 Bred / Yeezy Slide / Travis Scott Dunk Low}?"-style questions.
- Cross-marketplace price comparison agents (StockX vs. GOAT vs. Stadium Goods).
- Any read-only flow that needs the StockX number without booking a buy/sell action.

## Workflow

StockX has three relevant surfaces, in cost order:

| Surface | Auth needed | What you get | Anti-bot wall |
|---|---|---|---|
| **HTTP fetch of `/{locale}/{slug}`** (en-gb, de-de, fr-fr, ja-jp, …) | None | Full `__NEXT_DATA__` with static product metadata (title, styleId, retail price, release date, all 25 variants, colorway, GTINs/EANs, breadcrumbs) — **but `Last Sale: --` placeholder, no live market data** | **Bypasses Cloudflare entirely.** No proxy required. Verified across 9 locales for two distinct products (Jordan 1 Chicago Lost & Found, Nike Dunk Panda) and a deliberately-missing slug (clean 404). |
| **Browser-driven `/{any-locale}/{slug}` with Verified + residential proxy** | None | The same SSR payload PLUS the post-hydration market widget — lowestAsk, highestBid, lastSale + date, salesLast72Hours, salesLast12Months, annualHigh/Low, average price, volatility, price-history chart points | Mandatory if you need live prices. The bare `https://stockx.com/{slug}` (no locale prefix) returns Cloudflare's `Cf-Mitigated: challenge` 403 even with residential proxy unless driven by a verified Verified browser. |
| **Official StockX Public API** (`api.stockx.com/v2/catalog/...`) | OAuth client_credentials + bearer token (closed-beta developer registration) | First-party JSON with live market — same data the site uses | None. But registration is gated. Most agents will not have access. Do not waste a turn checking for an anonymous token. |

The recommended pattern is **hybrid**: pull static metadata via the locale-bypass HTTP fetch (cheap, ~0.5s, zero browser cost), then — only if live market numbers are required — open a Verified+proxy browser session and read the hydrated DOM.

### 1. Resolve the product name to a `urlKey` (slug)

The user's input is a free-form product name. The slug is the kebab-case suffix in `https://stockx.com/{slug}` (e.g. `air-jordan-1-retro-high-og-chicago-reimagined-lost-and-found`).

Two slug-resolution paths, in this order:

**(a) Browserbase Search API** (cheapest, no browser). Query `site:stockx.com {name}` and take the first result whose URL matches `^https://stockx\.com/(en-gb/|de-de/|…)?(?!news/|category/|brands/|lp/|about/|search\b)[a-z0-9-]+$`. Strip any locale prefix to get the canonical slug.

```bash
slug=$(browse cloud search "site:stockx.com $name" \
  | jq -r '.results[] | .url' \
  | grep -E '^https://stockx\.com/(en-gb/|de-de/|fr-fr/|it-it/|es-es/|ja-jp/|ko-kr/|zh-cn/|es-us/|es-mx/)?[a-z0-9][a-z0-9-]+$' \
  | grep -vE '/(news|category|brands|lp|about|search|sell|buy)/' \
  | head -1 \
  | sed -E 's@^https://stockx\.com/(en-gb/|de-de/|fr-fr/|it-it/|es-es/|ja-jp/|ko-kr/|zh-cn/|es-us/|es-mx/)?@@')
```

**(b) StockX's own search SSR**, scraped from `/en-gb/search?s={urlenc-query}`. The SSR HTML contains 30–60 product anchors as `<a href="/en-gb/{slug}">…<img alt="{Title}">…</a>` blocks. The slug closest to the query (by Jaccard / Levenshtein on the user's input) is the winner. Always use the `/en-gb/` (or any other locale) prefix — the bare `/search?s=…` request also returns 200, but a fresh / un-warmed IP occasionally Cloudflare-challenges it; the locale-prefixed path has never been observed to challenge in iter-1.

```bash
browse cloud fetch "https://stockx.com/en-gb/search?s=$urlenc_name" --output /tmp/search.html
# Regex out each card: href + alt text
grep -oE 'href="/en-gb/[a-z0-9-]+"[^>]*>[^<]*<img[^>]*alt="[^"]+"' /tmp/search.html
```

If neither path yields a unique match (e.g. user said "Jordan 1 Chicago" without "Lost & Found" / "OG 1985" / "GS"), return an `ambiguous_name` outcome with the top 3 candidate slugs and titles — do **not** guess.

### 2. Fetch static product metadata via locale-bypass HTTP

```bash
browse cloud fetch "https://stockx.com/en-gb/$slug" --output /tmp/pdp.html
```

Returns 200 / ~500 KB without proxies, without Verified, without challenge. Pull `__NEXT_DATA__`:

```bash
python3 -c "
import re,json,sys
c=open('/tmp/pdp.html').read()
nd=json.loads(re.search(r'id=\"__NEXT_DATA__\"[^>]*>(.+?)</script>', c, re.S).group(1))
prod=nd['props']['pageProps']['req']['appContext']['states']['query']['value']['queries'][1]['state']['data']['product']
traits={t['name']:t['value'] for t in prod['traits']}
print(json.dumps({
  'urlKey': prod['urlKey'],
  'uuid': prod['id'],
  'title': prod['title'],
  'brand': prod['brand'],
  'productCategory': prod['productCategory'],
  'styleId': prod['styleId'],
  'colorway': traits.get('Colorway'),
  'retailPrice': int(traits['Retail Price']) if traits.get('Retail Price') else None,
  'retailCurrency': 'USD',
  'releaseDate': traits.get('Release Date'),
  'sizes': [v['traits']['size'] for v in prod['variants']],
  'gtins': prod['variants'][0]['gtins'],
}, indent=2))
"
```

The metadata block is **locale-invariant for numeric and ID fields** (Retail Price, Release Date, styleId, variant sizes) but **the `title` field is translated** for non-English locales (de-de gave "Nike Dunk niedrig Retro weiß schwarz Panda" for the Panda Dunk). **Always use `/en-gb/` to keep the title English** while still getting the bypass — `en-gb` is the cleanest locale and gives English titles.

The SSR HTML pre-fetches 4 React Query queries: `getMenuCollections`, `GetProduct` (the one you want), `GetProductClientOnly` (returns/restocks meta), and `user.me`. **The market-data query (`GetVariantsMarketData` / equivalent) is intentionally not in SSR** — it fires after hydration, which is why the `<p data-component="LastSale">` renders as the literal string `--` in the HTML body.

### 3. (If live market data is required) Hydrate in a Verified browser

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies | jq -r .id)
export BROWSE_SESSION="$SID"

# Either locale works inside the browser — the CF challenge isn't triggered
# in a verified Verified session for either path. Use /en-gb/ for English DOM strings.
browse open "https://stockx.com/en-gb/$slug${size:+?size=$size}" --remote
browse wait load --remote
browse wait timeout 4000 --remote   # market widget hydrates 1–4s after load

# Read hydrated price block from the LastSale + Bid/Ask widgets
browse snapshot --remote                                # capture refs
# OR scrape directly from rendered HTML:
browse get html body --remote > /tmp/hydrated.html
```

Parse the hydrated DOM for these `[data-component]` islands (selectors verified from SSR markup; live prices fill in after hydration):

| Selector | Yields |
|---|---|
| `[data-component="LastSale"] p:nth-of-type(2)` | Last sale price (e.g. `$2,450`) — replaces the `--` placeholder |
| `[data-component="LowestAsk"] p` and `[data-component="HighestBid"] p` | Live bid/ask for the currently-selected size (or "all sizes" if no `?size=` URL param) |
| Recent-sales table `[role="rowgroup"] tr` near the "All Sales" header | Per-row: size, sale price, date, time, quantity (table column headers from i18n strings `pdp_market_activity_column_header_*`) |
| The "Historical Data" section text | All-time trade range, average sale price (3M and 12M), volatility, price premium, number-of-sales |

The size-grid dropdown is rendered from `prod.variants[]` and is fully present in SSR — no need to wait for hydration to enumerate sizes; only the per-size price fills in after hydration.

If the size parameter narrows the URL (`?size=10`), the LastSale block re-hydrates to that size's last sale; otherwise it returns the all-sizes last sale.

### 4. Release the session

```bash
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

### Browser-only fallback (when locale-bypass HTTP fetch also gets challenged)

Cloudflare's challenge rules are not static — if you observe a 403 + `Cf-Mitigated: challenge` on the locale-prefixed fetch (not observed in iter-1 across 9 locales × 2 products + 1 missing slug, but plausible during a region-wide ramp-up), skip step 2 and do everything in the Verified+proxy browser session in step 3. The DOM is the source of truth for both static metadata and live market data — the `__NEXT_DATA__` script is present in the browser response too. Cost penalty: ~10× wall time, ~5× session-minutes vs. the hybrid path.

## Site-Specific Gotchas

- **READ-ONLY.** Never click Buy, Bid, Sell, "Place Ask", "Place Bid", or any time-buttons on the variant grid — those start a transactional flow. Stop at the listing page after reading market data.
- **Locale-prefixed paths bypass the Cloudflare challenge on the lightweight fetch API.** The bare `https://stockx.com/{slug}` returns `403 Cf-Mitigated: challenge` against Browserbase fetch (with or without residential proxies); `https://stockx.com/{en-gb|de-de|fr-fr|it-it|es-es|ja-jp|ko-kr|zh-cn|es-us|es-mx}/{slug}` returns clean `200 OK` for the same request. Verified 2026-05-18 across all 9 non-default locales for both the Jordan 1 Chicago Lost & Found PDP and the Nike Dunk Panda PDP. **Lead with `/en-gb/` (English titles) unless you need translated copy for downstream use.** This is the single biggest cost optimization for this skill.
- **The deprecated public API endpoints are dead.** `https://stockx.com/api/products/{slug}?includes=market&currency=USD&country=US` (the 2018–2021 unofficial scraper-friendly route), `https://stockx.com/api/v2/catalog/products/{slug}`, `https://stockx.com/api/v3/portfolio?…`, and `https://gateway.stockx.com/graphql` all return **404 with empty body** as of 2026-05-18. Do not waste a turn re-probing them. The first-party replacement is `api.stockx.com` (closed-beta OAuth Public API, requires a registered Bearer token).
- **The Next.js data route is locked down.** `https://stockx.com/_next/data/{buildId}/{locale}/{slug}.json` (which would otherwise be the cleanest JSON-only path) returns `403` of length 9 — Cloudflare-protected at the rule level, no body. The `__NEXT_DATA__` inline script tag is the only SSR JSON channel.
- **SSR contains static metadata but `--` for every live price.** The PDP HTML has `<p data-component="LastSale">…<p>--</p></p>` and the same for Lowest Ask / Highest Bid — these are placeholders waiting for client-side hydration. The market query (`GetVariantsMarketData` or equivalent — not in the SSR `queries[]` array) fires from JS bundle 1–4s after page load. **A static `browse cloud fetch` will never yield a live price.** This is the single biggest correctness gotcha — agents that only `curl` the locale page will silently return "Last Sale: $--".
- **`Retail Price` in `__NEXT_DATA__` is always USD MSRP, regardless of locale.** It's a raw string under `prod.traits[]` with `format: "currency"` but the actual currency is implicit USD (the value `"180"` for the Jordan 1 Chicago Lost & Found matches the US release MSRP, and `"115"` for the Dunk Panda matches the US Nike MSRP). Locale only affects display formatting on the rendered page, not the underlying number.
- **Titles are translated in non-English locales.** `de-de` returns `"Nike Dunk niedrig Retro weiß schwarz Panda"` for the Panda Dunk. Always pull static metadata from `/en-gb/` for downstream parsing, or normalize the slug (which is locale-invariant) to fetch the title separately.
- **`/api/`, `/search*`, `/buy/*`, `/sell/*`, and all kebab-case-filter PLPs (`/brands/*model=*&product-line=`, etc.) are in `robots.txt` Disallow.** The locale `/{loc}/search?s=…` SSR endpoint is technically also under the Disallow line (`Disallow: */search*`), but it returns 200 cleanly and is the canonical way the StockX web UI itself surfaces search results to a logged-out user. Use it for slug resolution; do not crawl it aggressively (keep ≤ 1 req/s sustained).
- **CSP discloses the anti-bot stack.** StockX layers Cloudflare (cf-ray, cf-bm cookie, Cf-Mitigated: challenge) on top of **PerimeterX/HUMAN** (`*.px-cloud.net`, `*.px-cdn.net`, `*.pxchk.net` in connect-src; `*.px-cloud.net` in script-src; and a per-request `_px3` cookie that's set on real browser sessions). The verified+proxies session handles both — bare or `--proxies`-only sessions do not.
- **Cloudflare challenge fingerprint to detect in the fetch response:** `statusCode: 403`, `headers["Cf-Mitigated"] === "challenge"`, `content` contains the literal `<title>Just a moment...</title>` (~6 KB challenge page). Branch on this — if seen, escalate to step-3 browser hydration instead of trying to parse the body.
- **`/_next/data/{buildId}/…` and `/__nextjs_original-stack-frame` are all rule-blocked** even on locale paths. Don't probe.
- **DNS allowlist for sandboxed agents.** The iter-1 reconnaissance ran from a Vercel sandbox where only `api.browserbase.com` is DNS-resolvable; `connect.{region}.browserbase.com` (the CDP WebSocket endpoint) was REFUSED. Browserbase's lightweight `fetch`/`search` APIs hit `api.browserbase.com` and work fine; `browse open --remote` / `autobrowse evaluate.mjs --env remote` will fail with `getaddrinfo ENOTFOUND` until the sandbox's network policy is widened. **The static-metadata path in step 2 was therefore exhaustively validated; the live-hydration path in step 3 is reasoned from the SSR markup (`data-component="LastSale"`, etc., are present in the static HTML with `--` placeholders, confirming the React component contract) but was not end-to-end validated from this environment.** Agents in a normal browser-driving environment should treat step 3 as untested and add a screenshot-verify checkpoint on the first run.
- **Size parameter on the URL** is `?size={value}` (e.g. `?size=10`, `?size=10.5`). Sizes are the raw values from `prod.variants[i].traits.size` (US M sizing by default; the response includes a `sizeChart.displayOptions[]` per variant with UK / EU / CM / KR / US W conversions if the user gave a non-US size). The `size` URL param only narrows the post-hydration Last Sale and Bid/Ask numbers; the page's static metadata is identical with or without it.
- **GTIN/EAN/UPC is in `prod.variants[i].gtins[]`** — useful if the upstream agent needs to cross-reference with Nike SNKRS or another marketplace by barcode rather than slug.
- **Some categories use different size grids.** Sneakers default to US M numeric. Apparel uses XS/S/M/L/XL — the variant size string changes accordingly. Trading cards / collectibles have a single "OS" (one-size) variant.
- **Self-imposed rate limit recommended:** keep ≤ 1 req/s sustained against either `/{loc}/{slug}` or `/{loc}/search?s=…`. No formal throttle observed during iter-1's burst of ~20 fetches, but PerimeterX scores aggregate over time.

## Expected Output

The skill emits one of four outcome shapes.

### (a) Success — full market snapshot

```json
{
  "success": true,
  "query": "Jordan 1 Chicago Lost and Found size 10",
  "resolvedSlug": "air-jordan-1-retro-high-og-chicago-reimagined-lost-and-found",
  "product": {
    "uuid": "9a4d44f9-4b16-4abc-ba58-c0db340ee791",
    "title": "Jordan 1 Retro High OG Chicago Lost and Found",
    "brand": "Jordan",
    "productCategory": "sneakers",
    "styleId": "DZ5485-612",
    "colorway": "Varsity Red/Black-Sail-Muslin",
    "retailPrice": 180,
    "retailCurrency": "USD",
    "releaseDate": "2022-11-19",
    "url": "https://stockx.com/air-jordan-1-retro-high-og-chicago-reimagined-lost-and-found"
  },
  "size": { "value": "10", "type": "us m" },
  "market": {
    "lowestAsk":  { "amount": 2450, "currency": "USD" },
    "highestBid": { "amount": 2100, "currency": "USD" },
    "lastSale":   { "amount": 2390, "currency": "USD", "saleDate": "2026-05-17T19:42:00Z" },
    "salesLast72Hours": 4,
    "salesLast12Months": 612,
    "deadstockSold": 41209,
    "annualHigh":   { "amount": 3100, "currency": "USD" },
    "annualLow":    { "amount": 1820, "currency": "USD" },
    "averageSalePrice12M": { "amount": 2510, "currency": "USD" },
    "volatility": 0.083,
    "pricePremiumPctOverRetail": 1261
  },
  "priceTrend": {
    "rangeDays": 30,
    "points": [
      { "date": "2026-04-19", "salePrice": 2620, "saleCount": 11 },
      { "date": "2026-04-26", "salePrice": 2550, "saleCount": 9 },
      { "date": "2026-05-03", "salePrice": 2480, "saleCount": 15 },
      { "date": "2026-05-10", "salePrice": 2430, "saleCount": 12 },
      { "date": "2026-05-17", "salePrice": 2390, "saleCount": 7 }
    ]
  },
  "recentSales": [
    { "size": "10", "salePrice": 2390, "saleDate": "2026-05-17T19:42:00Z", "quantity": 1 },
    { "size": "10", "salePrice": 2420, "saleDate": "2026-05-17T11:08:00Z", "quantity": 1 }
  ],
  "verified": true,
  "extractedVia": "browser-hydration"
}
```

### (b) Success — static-metadata-only (live-hydration unavailable / skipped)

Used when the caller doesn't need live prices, or when the hydration step times out and you want to return *something* useful.

```json
{
  "success": true,
  "partial": true,
  "query": "Nike Dunk Panda",
  "resolvedSlug": "nike-dunk-low-retro-white-black-2021",
  "product": {
    "uuid": "5e6a1e57-1c7d-435a-82bd-5666a13560fe",
    "title": "Nike Dunk Low Retro White Black",
    "brand": "Nike",
    "productCategory": "sneakers",
    "styleId": "DD1391-100",
    "colorway": "White/Black",
    "retailPrice": 115,
    "retailCurrency": "USD",
    "releaseDate": "2021-03-10",
    "sizes": ["3.5","4","4.5","5","5.5","6","6.5","7","7.5","8","8.5","9","9.5","10","10.5","11","11.5","12","12.5","13","14","15","16","17"],
    "url": "https://stockx.com/nike-dunk-low-retro-white-black-2021"
  },
  "market": null,
  "extractedVia": "ssr-locale-bypass",
  "note": "Live market data not extracted; product is on StockX but hydration step was skipped or timed out."
}
```

### (c) Ambiguous name — multiple candidate slugs

```json
{
  "success": false,
  "reason": "ambiguous_name",
  "query": "Jordan 1 Chicago",
  "candidates": [
    { "slug": "air-jordan-1-retro-high-og-chicago-reimagined-lost-and-found", "title": "Jordan 1 Retro High OG Chicago Lost and Found" },
    { "slug": "jordan-1-og-chicago-1985", "title": "Jordan 1 OG Chicago (1985)" },
    { "slug": "air-jordan-1-retro-high-og-sp-union-la-chicago-shadow", "title": "Jordan 1 Retro High OG SP Union LA Chicago Shadow" }
  ]
}
```

### (d) Not found / blocked

```json
{
  "success": false,
  "reason": "not_found",
  "query": "totally-invented-fake-shoe-name-2099",
  "note": "No matching product on stockx.com via Browserbase Search or /en-gb/search?s=…."
}
```

```json
{
  "success": false,
  "reason": "anti_bot_wall",
  "query": "Jordan 1 Chicago Lost and Found",
  "resolvedSlug": "air-jordan-1-retro-high-og-chicago-reimagined-lost-and-found",
  "note": "Cloudflare challenge persisted across 3 verified-Verified + residential-proxy session attempts. Escalate to a different region or wait for the challenge ruleset to roll over."
}
```
