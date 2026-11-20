---
name: finance-naver-com-fetch-financial-data-hdip9e
title: Fetch Financial Data from Naver Finance
description: >-
  Pull token-efficient JSON (quote, OHLCV, market cap, PER/EPS/PBR, dividends,
  financial statements, index levels) for Korean-listed stocks from Naver
  Finance's undocumented public JSON APIs — no auth, cookies, stealth, or proxy
  required.
website: finance.naver.com
category: finance
tags:
  - finance
  - stocks
  - korea
  - kospi
  - json-api
  - read-only
  - market-data
source: 'browserbase: agent-runtime 2026-06-20'
updated: '2026-06-20'
recommended_method: api
alternative_methods:
  - method: fetch
    rationale: >-
      The endpoints are plain HTTPS GETs returning JSON — a bare curl/fetch (or
      `browse cloud fetch`) works identically to any HTTP client; no browser is
      needed.
  - method: browser
    rationale: >-
      Fallback only. Open m.stock.naver.com/domestic/stock/{code}/total in a
      non-stealth session and read rendered text if a JSON endpoint is ever
      rate-limited. Costs far more tokens than the JSON path.
verified: false
proxies: false
---
# Fetch Financial Data from Naver Finance

## Purpose

Pull structured financial data for any Korean-listed equity (KOSPI/KOSDAQ) — and Naver-tracked world stocks, indices, and crypto — from Naver Finance's **undocumented public JSON APIs** instead of scraping the JS-rendered HTML pages. Returns compact JSON (current quote, OHLCV, market cap, PER/EPS/PBR/BPS, dividend, 52-week range, annual/quarterly financial statements, price history) so an LLM can consume it with minimal tokens. **Read-only**; no auth, no cookies, no anti-bot stealth, and no residential proxy required.

## When to Use

- "What's the current price / market cap / PER of 삼성전자 (Samsung, 005930)?"
- Resolving a Korean company name to its 6-digit ticker code.
- Pulling daily OHLCV history for charting/backtesting.
- Reading a company's annual or quarterly income-statement rows (매출액/영업이익/순이익 etc.).
- Checking the live KOSPI / KOSDAQ index level.
- Any LLM-driven workflow that needs a terminal/CLI-style, low-token data pull from Naver Finance — prefer this over rendering `finance.naver.com` HTML, which is heavy and JS-gated.

## Workflow

Naver's web/mobile front-ends are thin clients over a public JSON API on the `m.stock.naver.com`, `polling.finance.naver.com`, and `ac.stock.naver.com` hosts. **No API key, cookie, session, stealth, or proxy is needed** — a plain HTTPS GET works (verified bare, with `browse cloud fetch` over the residential-proxy path, and via a non-stealth Browserbase session). Lead with these endpoints; only fall back to the browser if an endpoint is ever rate-limited.

All requests are plain GETs. From this CLI, use `browse cloud fetch "<url>"` (it returns a JSON envelope — the body is in the `.content` field as a JSON string you parse again). `curl`/`fetch` against the same URLs works identically.

### 1. Resolve a ticker from a company name (autocomplete)

```
GET https://m.stock.naver.com/front-api/search/autoComplete?query={URL-enc name}&target=stock,index,marketindicator,coin,ipo
```
Returns `result.items[]`, each with `code` (the 6-digit ticker for domestic stocks), `name`, `typeName` (코스피/코스닥), `reutersCode`, and `url` (`/domestic/stock/{code}/total`). Take `items[0].code` as the best match. The query may be Korean or English. (A legacy equivalent lives at `https://ac.stock.naver.com/ac?q={name}&target=stock,index,marketindicator,coin,ipo&st=111`.)

### 2. Realtime / latest quote (compact — fewest tokens)

```
GET https://polling.finance.naver.com/api/realtime/domestic/stock/{code}
```
Returns `datas[0]` with `closePrice` (current/last price), `compareToPreviousClosePrice` (change), `fluctuationsRatio` (% change), `openPrice`, `highPrice`, `lowPrice`, `accumulatedTradingVolume`, `accumulatedTradingValue`, `marketStatus` (OPEN/CLOSE), `localTradedAt` (ISO+09:00), and `overMarketPriceInfo` (pre/after-market). **Pass multiple codes comma-separated** (`.../stock/005930,000660,035720`) to batch several tickers in one round-trip. This is the cheapest endpoint for "just the price."

### 3. Rich snapshot (valuation metrics in one call)

```
GET https://m.stock.naver.com/api/stock/{code}/integration
```
Returns `totalInfos[]`, a flat array of `{code, key, value}` rows. Observed `code`s: `lastClosePrice` (전일), `openPrice`, `highPrice`, `lowPrice`, `accumulatedTradingVolume` (거래량), `accumulatedTradingValue` (대금), `marketValue` (시총), `foreignRate` (외인소진율), `highPriceOf52Weeks`/`lowPriceOf52Weeks` (52주 최고/최저), `per`, `eps`, `cnsPer`/`cnsEps` (추정/forward), `pbr`, `bps`, `dividendYieldRatio` (배당수익률), `dividend` (주당배당금). Also includes `industryCompareInfo`, `consensusInfo`, and `researches`. A lighter version is `/api/stock/{code}/basic` (price + exchange metadata only).

### 4. Financial statements

```
GET https://m.stock.naver.com/api/stock/{code}/finance/annual
GET https://m.stock.naver.com/api/stock/{code}/finance/quarter
```
Returns `financeInfo.trTitleList[]` (period columns, e.g. `{title:"2024.12.", key:"202412", isConsensus:"N"}`) and `financeInfo.rowList[]` where each row is `{title:"매출액", columns:{ "202412": {value:"3,008,709"}, ... }}`. Units are 억원 (hundred-million KRW). `isConsensus:"Y"` marks forecast columns.

### 5. Price history (OHLCV)

```
GET https://m.stock.naver.com/api/stock/{code}/price?pageSize={N}&page=1
```
Returns a JSON array of daily bars: `localTradedAt` (YYYY-MM-DD), `closePrice`, `compareToPreviousClosePrice`, `fluctuationsRatio`, `openPrice`, `highPrice`, `lowPrice`, `accumulatedTradingVolume`. Page through with `page`.

### 6. Market index (KOSPI / KOSDAQ)

```
GET https://polling.finance.naver.com/api/realtime/domestic/index/{KOSPI|KOSDAQ}
```
Same shape as the stock realtime endpoint (`closePrice` = index level).

### Browser fallback

If any JSON endpoint is ever rate-limited or returns an error page, open the mobile page in a non-stealth session and read the rendered values: `browse open "https://m.stock.naver.com/domestic/stock/{code}/total" --remote`, `browse wait load`, `browse wait timeout 2500`, then `browse get text body`. This costs far more tokens than the JSON path — use only as a last resort. (You can also `browse open` the JSON URLs directly and `browse get text body`, which is what an in-browser agent does.)

## Site-Specific Gotchas

- **Use the `m.stock.naver.com/api/...` host, NOT `api.stock.naver.com`.** Direct `https://api.stock.naver.com/stock/{code}/integration` returns `409 {"code":"StockConflict"}` (it expects internal auth/referer). The `m.stock.naver.com/api/stock/{code}/...` host serves the same data with no auth.
- **The search path is `front-api/search/autoComplete`, not `api/search/all`.** `https://m.stock.naver.com/api/search/all?...` returns a `404` HTML error page. Use `front-api/search/autoComplete` (or `ac.stock.naver.com/ac`).
- **All numeric values are formatted strings, not numbers.** Prices come as `"354,000"` (comma thousands separators). Strip commas before arithmetic. Some fields carry Korean unit suffixes: `백만` = million KRW (`accumulatedTradingValue`), `천주` = thousand shares, and market cap uses `조` (trillion) + `억` (hundred-million), e.g. `"2,069조 5,826억"`. Statement rows are in 억원 (hundred-million KRW).
- **Direction is encoded in `compareToPreviousPrice.code`:** `2` = 상승 (RISING / up), `5` = 하락 (FALLING / down); unchanged/limit codes exist too. `compareToPreviousClosePrice` is already signed for stocks but read `.code` for direction-safe logic.
- **`browse cloud fetch` double-wraps the body.** The envelope's `.content` is the response body as a *string*; `JSON.parse` it again to get the data object. `jq` is not installed in this sandbox — parse with `node -e`.
- **`pollingInterval` (≈70000ms) is just the front-end's suggested refresh cadence**, not a rate limit. There is no observed hard rate limit, but keep requests reasonable (≤ ~1/s sustained); no formal block was hit during testing.
- **Times are KST.** `localTradedAt` is ISO-8601 with `+09:00`. `marketStatus` is `OPEN`/`CLOSE`; outside trading hours `closePrice` is the last close and `overMarketPriceInfo` holds pre/after-market prints.
- **Tickers are 6 characters** (digits for common KOSPI/KOSDAQ stocks; some ETFs/ETNs include a letter, e.g. `0162Z0`). World stocks use a `reutersCode` like `AAPL.O` under `/worldstock/...` — this skill targets domestic equities.
- **All text is UTF-8 Korean.** URL-encode Korean query terms; expect Korean labels in `key` fields.
- **No anti-bot, no proxy, no stealth.** Pre-run probe of the homepage detected no anti-bot, and every endpoint above returned `200` over a bare connection. `verified` and `proxies` are both `false`.

## Expected Output

Compact quote + valuation snapshot (combining the realtime and integration endpoints):

```json
{
  "success": true,
  "ticker": "005930",
  "name": "삼성전자",
  "market": "코스피",
  "price": "354,000",
  "change": "-8,500",
  "change_pct": "-2.34",
  "direction": "FALLING",
  "open": "380,000",
  "high": "380,000",
  "low": "346,000",
  "prev_close": "362,500",
  "volume": "76,480,025",
  "market_cap": "2,069조 5,826억",
  "per": "28.61배",
  "eps": "12,372원",
  "pbr": "4.92배",
  "bps": "71,907원",
  "dividend_yield": "0.47%",
  "high_52w": "380,000",
  "low_52w": "57,600",
  "foreign_rate": "47.62%",
  "market_status": "CLOSE",
  "traded_at": "2026-06-19T15:30:00+09:00",
  "error_reasoning": null
}
```

Annual financial statements (`/finance/annual`):

```json
{
  "ticker": "005930",
  "period_type": "annual",
  "periods": [
    {"title": "2023.12.", "key": "202312", "is_forecast": false},
    {"title": "2024.12.", "key": "202412", "is_forecast": false},
    {"title": "2026.12.", "key": "202612", "is_forecast": true}
  ],
  "rows": [
    {"title": "매출액", "values": {"202312": "2,589,355", "202412": "3,008,709"}},
    {"title": "영업이익", "values": {"202312": "65,670", "202412": "327,260"}}
  ],
  "units": "억원"
}
```

Ticker resolution (autocomplete):

```json
{
  "query": "삼성전자",
  "matches": [
    {"code": "005930", "name": "삼성전자", "market": "코스피", "url": "/domestic/stock/005930/total"}
  ]
}
```

Failure (unknown ticker / endpoint error):

```json
{ "success": false, "error_reasoning": "No autoComplete match for query; or endpoint returned non-200." }
```
