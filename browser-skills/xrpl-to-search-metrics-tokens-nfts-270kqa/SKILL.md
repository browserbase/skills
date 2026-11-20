---
name: xrpl-to-search-metrics-tokens-nfts-270kqa
title: 'Search XRP Ledger Tokens, NFTs, News, Charts & Metrics'
description: >-
  Search XRPL.to's universe of fungible tokens, NFT collections, individual
  NFTs, and accounts in one call, and pull live market metrics, OHLC chart data,
  news with AI sentiment, and platform-wide stats — all via the official public
  REST + WebSocket API.
website: xrpl.to
category: crypto
tags:
  - xrpl
  - xrp
  - crypto
  - defi
  - nft
  - market-data
  - tokens
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: api
alternative_methods:
  - method: mcp
    rationale: >-
      XRPL.to publishes a machine-readable agent-skills index at
      https://xrpl.to/.well-known/agent-skills/index.json (RFC 9727 +
      agentskills.io) — an MCP/agent runtime that auto-discovers SKILL.md from
      .well-known can wire the same API up declaratively.
  - method: browser
    rationale: >-
      Only as fallback if api.xrpl.to is down. The xrpl.to SPA is a thin
      React/Next.js client that calls the same /search and /tokens endpoints
      under the hood — scraping the rendered table is ~50× more expensive per
      query because the rows are hydrated client-side after the initial paint.
verified: false
proxies: false
---
# XRPL.to — Search XRP Ledger Tokens, NFTs, News, Charts & Metrics

## Purpose

Search XRPL.to's universe of on-ledger assets — fungible tokens, NFT collections + individual NFTs, accounts — and pull live market metrics, OHLC chart data, news with AI sentiment, and platform-wide stats. Returns structured JSON suitable for monitoring dashboards, screeners, alerts, and downstream analytics. Read-only; never submits transactions.

## When to Use

- Look up a token, NFT collection, or XRPL r-address by name/symbol/issuer in a single call (the homepage search box hits this same endpoint).
- Pull live token market metrics (price in XRP/USD, 24h volume, market cap, % change, holders, TVL, AMM presence) for screeners or dashboards.
- Fetch OHLC candles, sparklines, or holder-concentration charts for any token by `md5`/`slug`/`issuer_currency`.
- Stream XRP-ecosystem news with bullish/bearish/neutral sentiment classification and filter by source or query string.
- Browse NFT collections with floor price, 24h volume, listed count, and trader leaderboards.
- Read global XRPL DEX stats (total volume, unique traders, marketcap of all IOUs, XRP dominance) from `/stats`.

## Workflow

XRPL.to publishes a complete public REST + WebSocket API at `https://api.xrpl.to/v1` and even self-advertises it as an agent skill via `https://xrpl.to/.well-known/agent-skills/index.json` (RFC 9727 `Link: rel="api-catalog"` + `agentskills.io/rel/index`). **Always use the API directly — never scrape the SPA.** The website is a thin React/Next.js client over this API; `browse snapshot` on the SPA returns a generic table shell that does not contain the actual data rows (they are hydrated client-side), so browser scraping costs 50–100× more for a strictly worse result.

No auth is required for the read endpoints listed below — anonymous tier is **30 req/min, 333 req/day, 10K req/month**. For higher tiers add `X-Api-Key: <key>` (obtain at `https://xrpl.to/api`). No proxies, stealth, captcha, or cookies are required from any IP.

1. **Unified search — `POST https://api.xrpl.to/v1/search`** (the same call the global search box on every page makes):
   ```bash
   curl -s -X POST https://api.xrpl.to/v1/search \
        -H 'Content-Type: application/json' \
        -d '{"search":"sologenic","limit":20,"offset":0}'
   ```
   Body: `{"search": "<query>", "limit": <int, default 20>, "offset": <int, default 0>}`. The query string matches token name/symbol/issuer/slug, NFT collection name/slug, NFT NFTokenID, and XRPL r-addresses simultaneously. Response shape:
   ```jsonc
   {
     "success": true, "took": "104ms",
     "tokens":      [ /* matching fungible tokens — see token shape below */ ],
     "collections": [ /* matching NFT collections — see collection shape below */ ],
     "nfts":        [ /* matching individual NFTs */ ],
     "account":     { /* present iff the query is a valid r-address */ },
     "pagination":  { "offset": 0, "limit": 20, "total": 4, "hasMore": false }
   }
   ```

2. **Token list with metrics — `GET /tokens`** for screeners and ranked lists:
   ```
   GET https://api.xrpl.to/v1/tokens?limit=100&sort=volume&order=desc
   ```
   Params: `limit` (max 100), `offset`, `sort` (`volume|marketcap|change24h|change5m|trending|assessment`), `order` (`asc|desc`), `tag`, `filter` (text), `token_type` (`trustline|lp|mpt`), `show_new`, `show_slug`, `show_date`, `tags=yes`, `skip_metrics`, `lightweight` (~60 % smaller payload, drops descriptive fields), `filterNe` (negative text filter), `watchlist` (csv of token ids). Returns `{ tokens[], total, exch, H24, global, tokenCreation }` — the `exch` block gives XRP→USD/EUR/JPY/CNY for converting prices, `H24` carries DEX-wide 24h aggregates, `global` carries lifetime aggregates.

3. **Single token detail — `GET /token/{id}`** where `{id}` accepts five formats:
   - 32-char md5 hash (canonical): `0413ca7cfc258dfaf698c02fe304e607`
   - slug `issuer-currency`: `rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz-534F4C4F00000000000000000000000000000000`
   - `issuer_currencyHex` (underscore separator): same components separated by `_`
   - case-insensitive name lookup: `SOLO`
   - 48-char hex mptIssuanceID for multi-purpose tokens
   Add `?desc=yes` to include the long description.

4. **Charts — OHLC + sparklines + holder graphs**:
   - **`GET /ohlc/{id}?range=1D&interval=1h&vs_currency=XRP`** — candles. `range` ∈ `1D|5D|7D|1M|3M|1Y|5Y|ALL`; `interval` ∈ `1m|5m|15m|30m|1h|2h|4h|1d|1w`; `vs_currency` ∈ `XRP|USD|EUR|JPY|CNH`. Response `ohlc[]` is `[time_ms, open, high, low, close, volume]` arrays.
   - **`GET /sparkline/{id}?period=7d&vs_currency=XRP&lightweight=true&max_points=20`** — tiny series for inline charts.
   - **`GET /holders/info/{id}`**, **`GET /holders/graph/{id}?range=7D`**, **`GET /holders/list/{id}?limit=20`** — concentration percentiles, holder-count history, and paginated richlist with acquisition tracking.
   - **`GET /rsi?timeframe=24h&sort=rsi24h&limit=50`** — multi-timeframe RSI screener.

5. **NFTs**:
   - **`GET /nft/collections?sort=vol24h&order=desc&limit=50`** — ranked collection list (`sort` ∈ `vol24h|totalVol24h|volume|new|created|latest`).
   - **`GET /nft/collections/{slug}`** with `?includeNFTs=true&nftLimit=20` — collection detail.
   - **`GET /nft/collections/{slug}/nfts?sort=price-low&listed=true`** — items in collection (`sort` ∈ `activity|price-low|price-high|offer-low|offer-high|minted-latest|rarity-rare|volume-high|recent-sale|recent-listed`; `listed` ∈ `true|false|xrp|non-xrp`; `traits=type:value` csv for trait filtering).
   - **`GET /nft/{nftId}`** — single NFT by 64-char hex NFTokenID (returns `scam` + `scamType` fields, no separate scam lookup needed).
   - **`GET /nft/collections/{slug}/ohlc`**, **`/floor/history`**, **`/sparkline?period=7d`**, **`/traders`**, **`/orderbook`** — same chart suite as tokens.

6. **News with sentiment** — `GET /news?limit=20&offset=0&source=` returns `{ data: [{ title, normalizedTitle, summary, sentiment: "Bullish|Bearish|Neutral", sourceName, sourceUrl, pubDate }], sentiment: { 24h, 7d, 30d, all }, sources: [...], pagination }`. Use **`GET /news/search?q=ripple&limit=20`** for query-scoped news (same shape, plus a per-query sentiment summary).

7. **Real-time updates** — open a WebSocket to `wss://api.xrpl.to/ws/sync/` for the global multi-token ticker, or `wss://api.xrpl.to/ws/token/{md5}`, `wss://api.xrpl.to/ws/ohlc/{md5}?interval=1m&vs_currency=XRP`, `wss://api.xrpl.to/ws/orderbook?base=...&quote=...`, `wss://api.xrpl.to/ws/news`, etc. Heartbeat: send `{"type":"ping"}` → get `{"type":"pong","time":...}`. All sockets support `permessage-deflate`.

8. **Discovery** — when in doubt, fetch `https://api.xrpl.to/api/docs` (a single ~46 KB JSON blob enumerating every endpoint, params, response shape, and credit cost) or read the human docs at `https://xrpl.to/docs`.

### Browser fallback (only when API is down)

If `api.xrpl.to` is unreachable, the **same query string** can be passed through the website's global search box:

1. `browse open https://xrpl.to/ --remote`
2. `browse press --remote "/"` — focuses the top-bar search input (Ctrl+K also works).
3. `browse fill --remote 'role=searchbox' "<query>"` — modal renders tokens / NFTs / accounts in three sections.
4. `browse get markdown body` — the dropdown rows are in the rendered DOM, so this is parseable; the bare table on `/` is *not* (it's hydrated by JS after a `/tokens` API call which you can intercept via `browse network`).

Expect ~3–5 turns per query vs. 1 turn for the API path; the dropdown caps at ~5 results per category whereas the API exposes the full pagination cursor.

## Site-Specific Gotchas

- **Anonymous rate limit is 30 req/min — bursty clients get 429 fast.** Hit during this run: 4 sequential `POST /search` calls in under 2 seconds returned the first 2 with 200s and the next 2 with `HTTP 429`. There is no `Retry-After` header — wait ≥ 20 seconds before retrying or add an API key (`X-Api-Key`). Daily/monthly limits stack on top (333/day, 10K/month anonymous).
- **Token ID `name` lookup works on the API but NOT on the website route.** `GET https://api.xrpl.to/v1/token/SOLO` resolves to the canonical Sologenic record, but `https://xrpl.to/token/sologenic` returned a `404` page. When constructing user-facing links, always use the `issuer-currencyHex` slug from `token.slug` or build it from `token.issuer + "-" + token.currency`.
- **Currency codes ≤ 3 chars are ASCII; > 3 chars are 40-char zero-padded hex.** SOLO → `534F4C4F00000000000000000000000000000000`. Convert with `Buffer.from(name, "utf8").toString("hex").padEnd(40, "0").toUpperCase()`. The 32-char `md5` field is the canonical `md5(issuer + "_" + currency)` and is the preferred id for caching.
- **Don't try to scrape the homepage table.** `browse snapshot` of `https://xrpl.to/` returns the table headers (`#, NAME, PRICE, 5M, 1H, 24H, ...`) but the row contents are hydrated via the same `/tokens` API after the initial paint — there's no SSR data island. Hit the API directly.
- **Search field semantics:** the unified `POST /search` query is matched against token `name`, `currency` (decoded), `user` (issuer name), `issuer` r-address, `slug`, and `tags`. For NFTs it also matches `NFTokenID` exact-hex. For accounts it requires a syntactically valid `r-address` (the regex `^r[1-9A-HJ-NP-Za-km-z]{24,34}$`). A non-address string never returns an `account` field even if a user wallet happens to have that label.
- **`pagination.total` can be very large** — `/news` returned `total: 29152, totalPages: 14576` for `limit=2`. Always paginate, never assume a single response is exhaustive.
- **Some fields are computed lazily.** `tvl`, `AMM`, `creator`, and `social.*` on token records may be `null` for low-volume IOUs that haven't been touched by the indexer recently. Always null-check before chaining.
- **`vol24hxrp` is in XRP, not drops.** REST responses convert XRP amounts to floating-point XRP values (not the on-chain `drops` strings). Multiply by 1e6 if you need drops. WebSocket frames follow the same convention.
- **`POST /search`'s `limit` default is small (~20).** Set explicitly for paginated discovery; bumping past `100` is silently capped at 100.
- **Self-published agent-skills index is canonical.** `https://xrpl.to/.well-known/agent-skills/index.json` points to `https://xrpl.to/.well-known/agent-skills/xrpl-to-api/SKILL.md` — read that as the upstream source of truth and check its sha256 in the index to detect updates.
- **Cloudflare in front.** Origin is fronted by Cloudflare with `Cf-Cache-Status: DYNAMIC` for the API and aggressive `Cache-Control: public, max-age=86400` for static assets. No anti-bot challenges observed — direct `fetch()` from any IP returns 200 without JS, cookies, or TLS fingerprinting hurdles.
- **`/account/...` endpoints accept raw r-addresses; the unified `POST /search` only surfaces `account` for *valid* r-addresses but does not return the trustlines or tx history** — for those, follow up with `GET /account/balance/{r}`, `/account/trustlines/{r}`, `/account/nfts/{r}`, `/account/tx/{r}`.

## Expected Output

### 1. Unified search hit (token + collection + account combined)

```json
{
  "success": true,
  "took": "104ms",
  "tokens": [
    {
      "md5": "0413ca7cfc258dfaf698c02fe304e607",
      "name": "SOLO",
      "user": "Sologenic",
      "issuer": "rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz",
      "currency": "534F4C4F00000000000000000000000000000000",
      "slug": "rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz-534F4C4F00000000000000000000000000000000",
      "exch": 0.01527649,
      "usd": 0.0213,
      "vol24hxrp": 3339.92,
      "marketcap": 2368688.65,
      "pro24h": 0.807,
      "p24h": 0.81,
      "holders": 216460,
      "trustlines": 226000,
      "verified": 1,
      "tags": ["DeFi", "Tokenized Stocks"],
      "domain": "sologenic.com",
      "AMM": { "account": "rL...", "tradingFee": 500 },
      "tvl": 87420.0
    }
  ],
  "collections": [
    {
      "_id": "...",
      "slug": "xpunks",
      "name": "xPunks",
      "issuer": "rfUkZ3BVmgx5aD3Zo5bZk68hrUrhNth8y3",
      "items": 5000,
      "owners": 2156,
      "floor": 7,
      "floor24hAgo": 7,
      "floor7dPercent": 0,
      "marketcap": { "amount": 34937, "currency": "XRP", "issuer": "XRPL" },
      "listedCount": 380,
      "sales24h": 0,
      "totalSales": 1212,
      "origin": "xrpnft.com",
      "logoImage": "b4a2397a54cacd031179c118d8af4789",
      "tags": ["Memes", "FirstLedger"]
    }
  ],
  "nfts": [
    {
      "NFTokenID": "000817024409AFED2C9EC5604D4095464C0F0DC015198D2F75D87A79000003DD",
      "name": "xPunk #989",
      "owner": "rKvzFmPbtaxekUQBJjAa6VUzLSe13inAE1",
      "collection": "xpunks",
      "scam": false
    }
  ],
  "account": null,
  "pagination": { "offset": 0, "limit": 20, "total": 4, "hasMore": false }
}
```

### 2. Search by r-address — returns `account` block

```json
{
  "success": true,
  "tokens": [],
  "collections": [],
  "nfts": [],
  "account": {
    "account": "rDsbeomae4FXwgQTJp9Rs64Qg9vDiTCdBv",
    "balance": 28742536.35,
    "name": "Bitstamp Hot Wallet",
    "verified": true
  },
  "pagination": { "offset": 0, "limit": 20, "total": 1, "hasMore": false }
}
```

### 3. OHLC candle response (`GET /ohlc/{id}?range=1D&interval=1h`)

```json
{
  "res": "ok",
  "took": "47ms",
  "length": 25,
  "format": "[time_ms, open, high, low, close, volume]",
  "resolution": 60,
  "interval": "1h",
  "interval_seconds": 3600,
  "vs_currency": "XRP",
  "inverted": false,
  "ohlc": [
    [1779062400000, 0.015232, 0.015232, 0.015154, 0.015154, 222.91],
    [1779066000000, 0.015155, 0.015288, 0.015101, 0.015281, 1411.4 ],
    [1779148800000, 0.015277, 0.015277, 0.015276, 0.015276, 0.38 ]
  ]
}
```

### 4. News page (`GET /news?limit=2`)

```json
{
  "sentiment": {
    "24h":  { "Bullish": "67.9", "Bearish": "28.3", "Neutral": "3.8"  },
    "7d":   { "Bullish": "77.4", "Bearish": "13.5", "Neutral": "9.1"  },
    "30d":  { "Bullish": "79.5", "Bearish": "9.7",  "Neutral": "10.7" },
    "all":  { "Bullish": "70.4", "Bearish": "19.1", "Neutral": "10.6" }
  },
  "sources": [
    { "name": "TradingView", "count": 3964, "sentiment": { "Bullish": "78.0", "Bearish": "12.0", "Neutral": "10.0" } }
  ],
  "data": [
    {
      "_id": "6a0ba7c57690aa46eab46923",
      "title": "XRP Price Faces Key Test as ETF Inflows Hit 2026 High",
      "normalizedTitle": "XRP Price Faces Key Test as ETF Inflows Hit 2026 High",
      "sentiment": "Bullish",
      "sourceName": "The Coin Republic",
      "sourceUrl": "https://www.thecoinrepublic.com/2026/05/18/xrp-price-faces-key-test-as-etf-inflows-hit-2026-high/",
      "summary": "XRP Price Faces Key Test as ETF Inflows Hit 2026 High. The recent surge in XRP price...",
      "pubDate": "2026-05-18T23:30:00.000Z"
    }
  ],
  "pagination": { "offset": 0, "limit": 2, "total": 29152, "totalPages": 14576 },
  "responseTime": "1119ms"
}
```

### 5. Rate-limit (`HTTP 429`)

```json
{
  "success": false,
  "error": "Too Many Requests"
}
```
Returned without `Retry-After`; back off ≥ 20 seconds or attach `X-Api-Key`.
