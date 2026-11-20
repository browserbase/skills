---
name: coinmarketcap-com-fetch-crypto-data-1bggc3
title: Fetch CoinMarketCap Crypto Data
description: >-
  Fetch live cryptocurrency prices, market caps, supply, percent-change windows,
  global market metrics, trending coins, and the latest crypto news from
  CoinMarketCap via its public no-auth JSON API.
website: coinmarketcap.com
category: finance
tags:
  - crypto
  - prices
  - market-data
  - news
  - coinmarketcap
  - api
source: 'browserbase: agent-runtime 2026-06-02'
updated: '2026-06-02'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      When the JSON API is unreachable, open coinmarketcap.com pages directly
      (no stealth needed) and extract from the JS-rendered DOM via `browse get
      markdown body`. ~100x more expensive and noisier than the API, so use only
      as a fallback.
verified: false
proxies: false
---
# Fetch CoinMarketCap Crypto Data

## Purpose

Retrieve live cryptocurrency market data from CoinMarketCap — coin/token prices, market caps, supply, percent-change windows (1h/24h/7d/30d/60d/90d/YTD/1y), global market metrics (total market cap, BTC/ETH dominance, DeFi/stablecoin/derivatives volumes), trending/most-searched coins, and the latest crypto news articles. Read-only; never logs in, trades, or writes. The CoinMarketCap web UI is a thin client over a **public, no-auth JSON API at `https://api.coinmarketcap.com`** (distinct from the key-gated commercial `pro-api.coinmarketcap.com`). Lead with that API; the rendered site is a costly fallback.

## When to Use

- Look up the current price, market cap, rank, supply, or recent performance of one or more coins/tokens.
- Pull the top-N coins by market cap (the homepage price table) in one request.
- Get a single coin's full profile (description, tags, links, statistics).
- Read global crypto market metrics (total market cap, 24h volume, BTC/ETH dominance, DeFi/stablecoin volume).
- Get trending / most-searched coins.
- Fetch the latest crypto news headlines, optionally filtered to a specific coin.

## Workflow

CoinMarketCap's website fetches everything from a **public JSON API at `https://api.coinmarketcap.com`** — **no API key, no cookies, no session, no anti-bot stealth, and no residential proxy required**. All endpoints below returned `200 OK` from a bare datacenter IP with no `--verified`/`--proxies`. **Do not use `pro-api.coinmarketcap.com`** unless you have a paid CMC API key — that is the separate commercial product and is key-gated. Lead with the API path; the browser flow at the bottom is a ~100× more expensive fallback because the price table is fully JS-rendered.

All endpoints accept a plain HTTP GET. No headers are required (no `Referer`, no `Origin`).

1. **Top coins (the homepage price table — prices, market cap, supply, % changes):**
   ```
   GET https://api.coinmarketcap.com/data-api/v3/cryptocurrency/listing
       ?start=1&limit=100&convert=USD
   ```
   Returns `data.cryptoCurrencyList[]`, each with `id`, `name`, `symbol`, `slug`, `cmcRank`, `circulatingSupply`, `totalSupply`, `maxSupply`, `tags[]`, and a `quotes[]` array (one entry per `convert` currency) holding `price`, `marketCap`, `volume24h`, and `percentChange1h/24h/7d/30d/60d/90d`, `ytdPriceChangePercentage`, `percentChange1y`, `dominance`, `turnover`. Paginate with `start` (1-based) and `limit` (observed working up to several hundred; keep ≤ 200/req to be safe).

2. **Resolve a ticker/name → CMC `id` or `slug`** (needed because the quote/detail endpoints reject `symbol`):
   ```
   GET https://api.coinmarketcap.com/data-api/v3/topsearch/rank
   ```
   Returns `data.cryptoTopSearchRanks[]` (trending/most-searched) with `id`, `name`, `symbol`, `slug` — useful for trending and as a cheap id lookup for popular coins. For arbitrary coins, the most reliable mapping is to scan the `listing` response (step 1) for the matching `symbol`/`name`, or use the human-readable slug directly (e.g. `bitcoin`, `ethereum`) which equals the URL path segment on `coinmarketcap.com/currencies/{slug}/`.

3. **Quote for a specific coin (price + all % changes), by `slug` or `id`:**
   ```
   GET https://api.coinmarketcap.com/data-api/v3/cryptocurrency/quote/latest
       ?slug=ethereum&convert=USD
   ```
   (or `?id=1027`). Returns `data[]` with `quotes[]` containing `price`, `marketCap`, `volume24h`, and the full `percentChange*` set. **`symbol=` is rejected** with `"value" must contain at least one of [id, slug]` — always pass `slug` or `id`.

4. **Lite detail (fast single-coin snapshot):**
   ```
   GET https://api.coinmarketcap.com/data-api/v3/cryptocurrency/detail/lite?slug=ethereum
   ```
   Returns `data.statistics` (`price`, `priceChangePercentage24h`, `marketCap`, `circulatingSupply`, `totalSupply`, `rank`) plus `watchCount` and `volume`. Cheapest call for "what's X worth right now."

5. **Full coin profile (description, links, metadata):**
   ```
   GET https://api.coinmarketcap.com/data-api/v3/cryptocurrency/detail?id=1&range=1D
   ```
   (or `?slug=bitcoin`). Returns a rich `data` object including a markdown `description`, `category`, `tags`, and statistics. `range` accepts `1D`, `7D`, `1M`, `1Y`, `ALL` for the chart window.

6. **Global market metrics:**
   ```
   GET https://api.coinmarketcap.com/data-api/v3/global-metrics/quotes/latest?convert=USD
   ```
   Returns `data` with `btcDominance`, `ethDominance`, `activeCryptoCurrencies`, `totalCryptoCurrencies`, `activeExchanges`, `defiVolume24h`, `defiMarketCap`, `stablecoinVolume24h`, `stablecoinMarketCap`, `derivativesVolume24h`, and a `quotes[]` block with `totalMarketCap` / `totalVolume24H`.

7. **Latest news:**
   ```
   GET https://api.coinmarketcap.com/content/v3/news?coins=1&page=1&size=20
   ```
   Returns `data[]` of articles; each has `slug`, `cover`, `assets[]` (tagged coins, with `coinId`), and a `meta` object with `title`, `subtitle`, `sourceName`, `sourceUrl`, `releasedAt`/`createdAt`/`updatedAt`. Omit `coins` for the general feed, or pass a CMC coin `id` to filter to news mentioning that coin. (`coins` takes a numeric id, not a symbol.)

### Browser fallback

Only if the API is unreachable. Open the page directly (no stealth needed — homepage returned `200` with full price table from a bare session):
- Price table: `https://coinmarketcap.com/`
- Single coin: `https://coinmarketcap.com/currencies/{slug}/` (e.g. `/currencies/bitcoin/`)
- Trending: `https://coinmarketcap.com/trending-cryptocurrencies/`

The page is fully JS-rendered, so wait ~3s after navigation, then use `browse get markdown body` to extract the rendered table/values. Expect ~100× the cost of the API call and noisier output — prefer the API.

## Site-Specific Gotchas

- **Two different API hosts — use the right one.** `api.coinmarketcap.com` (the website's backend, paths under `/data-api/v3/...` and `/content/v3/...`) is **public and key-free**. `pro-api.coinmarketcap.com` is the separate commercial product and requires an `X-CMC_PRO_API_KEY` header — don't confuse them.
- **No auth, no proxy, no stealth needed.** Every endpoint returned `200` from a bare datacenter IP with no headers. The 2026-06-02 anti-bot probe reported "none detected," confirmed in testing. `--verified`/`--proxies` are unnecessary.
- **`quote/latest` and `detail` reject `symbol`.** They require `id` or `slug` (error: `"value" must contain at least one of [id, slug]`). Resolve a ticker to a slug/id first (step 2), or just use the lowercase slug (often equals the coin name, e.g. `bitcoin`, `ethereum`, `solana`).
- **`convert` currency-name field is inconsistent across endpoints.** In `listing` and `quote/latest?convert=EUR` the per-quote `name` is the string `"EUR"`/`"USD"`. But `quote/latest?convert=USD` sometimes labels the quote `"name":"2781"` — `2781` is CMC's internal currency id for USD. Don't key off `name`; trust the `price` field and the `convert` you requested.
- **Numbers come back as ultra-high-precision decimal strings/numbers.** `marketCap` and `price` can have 20+ digits (e.g. `marketCap: 14149685.17433656064643257546400000000000`). Round/parse defensively; treat as decimal, not native float, if precision matters.
- **`selfReportedCirculatingSupply` vs `circulatingSupply`.** Some tokens report their own supply (often inflated); the `selfReported*` fields are project-supplied and may differ wildly from CMC's verified `circulatingSupply`/`totalSupply`. Prefer the non-self-reported fields for valuations.
- **News `coins` filter is a numeric CMC id, not a symbol.** `?coins=1` = Bitcoin. The `assets[]` in each article also use `coinId` (numeric).
- **`content/v3/news/aggregated` is flaky.** It intermittently returns `error_code:"500" "The system is busy"`. Use `content/v3/news` instead.
- **`/data-api/v3/cryptocurrency/search` does not exist** (returns a 404 HTML page). For lookup use `topsearch/rank` or scan `listing`.
- **`robots.txt` disallows `/headlines/*`, `/community/*/...`, `/dexscan/*`** for the rendered site, but the JSON API endpoints above are not listed there and are what the site itself calls. Keep request rate modest (≤ a few req/s) to avoid CloudFront throttling.
- **Data freshness.** `lastUpdated` timestamps update roughly once per minute; prices are near-real-time but not tick-level.

## Expected Output

Top-coins listing (step 1):
```json
{
  "convert": "USD",
  "coins": [
    {
      "id": 1,
      "name": "Bitcoin",
      "symbol": "BTC",
      "slug": "bitcoin",
      "cmc_rank": 1,
      "price": 68008.354355674140,
      "market_cap": 1362740523242.30,
      "volume_24h": 46899326789.99,
      "circulating_supply": 20037840.0,
      "max_supply": 21000000.0,
      "percent_change_1h": -1.19,
      "percent_change_24h": -4.66,
      "percent_change_7d": -11.60,
      "last_updated": "2026-06-02T14:58:00.000Z"
    }
  ]
}
```

Single-coin lite detail (step 4):
```json
{
  "id": 1027,
  "name": "Ethereum",
  "symbol": "ETH",
  "slug": "ethereum",
  "price": 1937.7813994588,
  "price_change_percentage_24h": -1.2636,
  "market_cap": 233861416438.24,
  "circulating_supply": 120685138.43,
  "total_supply": 120685138.43,
  "rank": 2,
  "watch_count": 4012473,
  "volume": 18505169003.30
}
```

Global metrics (step 6):
```json
{
  "btc_dominance": 58.05,
  "eth_dominance": 9.96,
  "active_cryptocurrencies": 8267,
  "total_cryptocurrencies": 37621,
  "active_exchanges": 947,
  "total_market_cap": 2351085688273.32,
  "total_volume_24h": 110448447597.09,
  "defi_market_cap": 69937669472.81,
  "stablecoin_market_cap": 289756032634.40
}
```

Latest news (step 7):
```json
{
  "articles": [
    {
      "title": "Capital B's Ambitious Bitcoin Agenda Stirs Global Markets",
      "subtitle": "The Bitcoin strategy of France's publicly traded firm, Capital B...",
      "slug": "capital-bs-ambitious-bitcoin-agenda-stirs-global-markets",
      "source_name": "BH NEWS",
      "source_url": "https://coinmarketcap.com/community/articles/6a1eeec61ba4ca25cde17a17",
      "cover": "https://en.bitcoinhaber.net/wp-content/uploads/2026/06/bitcoin-14-6a1eede1de220.webp",
      "released_at": "2026-06-02T14:51:12.000Z",
      "coins": [{ "coinId": 1, "name": "Bitcoin" }]
    }
  ]
}
```
