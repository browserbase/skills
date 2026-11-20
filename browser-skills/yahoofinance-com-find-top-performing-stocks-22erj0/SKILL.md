---
name: yahoofinance-com-find-top-performing-stocks-22erj0
title: Find Top Performing Stocks
description: >-
  Return the N highest-performing single stocks on Yahoo Finance (Top/Day
  Gainers) ranked by percent change, with price, change, percent change, volume,
  market cap, and exchange. Read-only.
website: yahoofinance.com
category: finance
tags:
  - finance
  - stocks
  - gainers
  - screener
  - market-data
source: 'browserbase: agent-runtime 2026-05-31'
updated: '2026-05-31'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      If the JSON API is ever unreachable, open
      finance.yahoo.com/markets/stocks/gainers/ and read the rendered 'Top Stock
      Gainers Today' table. Returns identical data but pays a large cost/latency
      premium and the markdown body is mostly nav chrome, so the API is strongly
      preferred.
verified: false
proxies: false
---
# Find Top Performing Stocks (Yahoo Finance)

## Purpose

Return the N highest-performing individual stocks on Yahoo Finance — the "Top Gainers" list ranked by intraday percent change. For each stock it returns symbol, company name, last price, absolute change, percent change, volume, market cap, and exchange. Read-only; never trades, logs in, or mutates anything.

**Assumption made (no human to clarify):** "highest performing single stocks" is interpreted as Yahoo Finance's headline **Day Gainers** list — the equities with the largest positive percent change in the current/most-recent US session — which is exactly what the site surfaces at `/markets/stocks/gainers/`. This list applies Yahoo's built-in liquidity/size floors (see Gotchas), so it is the "top performers among real, tradeable large/mid-cap names," not the absolute highest-percent movers including micro-caps. If you want the unfiltered highest movers, see the alternate `scrIds` in Gotchas.

## When to Use

- "Give me the top 5 (or N) performing / gaining stocks today."
- Daily market-open or market-close monitoring of the biggest movers.
- Seeding a watchlist or downstream analysis with the day's leaders.
- Any flow that would otherwise scrape the Yahoo Finance "Top Gainers" table — the JSON API is faster, cheaper, and structurally stable.

## Workflow

Yahoo Finance's "Top Gainers" page is a thin client over a **public predefined-screener JSON API** that needs **no crumb, no auth, no cookies, and no residential proxy**. A plain GET returns ranked results. Lead with the API; the browser path is a ~100× more expensive fallback that returns the identical data.

### 1. Call the predefined screener (recommended)

```
GET https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved
    ?scrIds=day_gainers
    &count=5
    &formatted=false
```

- `scrIds=day_gainers` is the "Top Gainers" list (ranked by `regularMarketChangePercent` descending).
- `count=N` caps how many rows you get back (use the N the user asked for).
- `formatted=false` returns raw numeric values (`32.7582`). Omit it (or `formatted=true`) to get `{raw, fmt}` objects (`{"raw":32.7582,"fmt":"+32.76%"}`) if you want display strings.
- `query2.finance.yahoo.com` is an interchangeable mirror.

In this sandbox use `browse cloud fetch` (works without proxies):

```bash
browse cloud fetch "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=day_gainers&count=5&formatted=false"
```

The CLI wraps the response in an envelope `{ statusCode, headers, content }`; the actual JSON is the `content` string.

### 2. Parse the result

The payload is `finance.result[0]` with:
- `title` → `"Day Gainers"`
- `total` → full count of matching stocks (e.g. 173); `count` → how many were returned
- `quotes[]` → already sorted by `regularMarketChangePercent` descending

For each `quotes[i]` read:
- `symbol`, `shortName` (fallback `longName`)
- `regularMarketPrice`, `regularMarketChange`, `regularMarketChangePercent`
- `regularMarketVolume`, `marketCap`, `fullExchangeName`
- `quoteType` (will be `"EQUITY"` — predefined gainers are single stocks, not ETFs/funds), `marketState`

```bash
browse cloud fetch "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=day_gainers&count=5&formatted=false" > /tmp/g.json
node -e '
const fs=require("fs");
const d=JSON.parse(JSON.parse(fs.readFileSync("/tmp/g.json","utf8")).content).finance.result[0];
console.log(d.title, "of", d.total);
d.quotes.slice(0,5).forEach((q,i)=>console.log(`${i+1}. ${q.symbol} ${q.shortName} ${q.regularMarketChangePercent.toFixed(2)}% @ ${q.regularMarketPrice}`));
'
```

### 3. Emit the ranked list

Take the first N quotes (already in descending-percent order) and shape them into the Expected Output below. Done — no pagination needed for a top-N request.

### Browser fallback (only if the API is unreachable)

The API has no auth and no anti-bot, so the browser path should rarely be needed. If you must:

```bash
sid=$(browse cloud sessions create --keep-alive | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
browse open "https://finance.yahoo.com/markets/stocks/gainers/" --remote --session "$sid"
browse wait load --remote --session "$sid"
browse wait timeout 3500 --remote --session "$sid"   # table hydrates after load
browse screenshot --remote --session "$sid" --path gainers.png
browse cloud sessions update "$sid" --status REQUEST_RELEASE
```

The page renders the same "Top Stock Gainers Today" table (Symbol / Name / Price / Change / Change % / Volume). The bare `yahoofinance.com` domain 301-redirects to `finance.yahoo.com`. Prefer scraping the screenshot/structured table over `browse get markdown body` — the markdown body is mostly Yahoo nav chrome and sometimes leads with an "Oops, something went wrong" fragment even when the table is present. Validated 2026-05-31: the rendered table (DELL 420.91 / +103.86 / +32.76% / 38.022M) matched the API row exactly.

## Site-Specific Gotchas

- **`day_gainers` is filtered, not the raw top %.** The predefined screener applies Yahoo's built-in floors (US region, minimum price, minimum intraday market cap, minimum volume). So the #1 row may be a large-cap up 30%, while a micro-cap up 85% won't appear. For broader/unfiltered movers use a different `scrIds`: `small_cap_gainers` (verified: surfaced REPL +85.68% vs. day_gainers' top of +32.76%), or build a custom screener (see crumb gotcha). Pick the list that matches the user's intent and **state which list you used** in your answer.
- **Predefined screener (`/v1/finance/screener/predefined/saved`) needs NO crumb.** A plain GET returns 200 (verified with and without `--proxies`). It sets `A1/A3` cookies in the response but does not require any on the request.
- **Custom screeners DO need a crumb + cookie.** The unfiltered query endpoint `POST /v1/finance/screener?crumb=...` requires first fetching a session cookie from any Yahoo page, then `GET /v1/test/getcrumb` with that cookie. Only go down this path if a predefined `scrIds` doesn't fit; for "top N gainers" the predefined list is sufficient and crumb-free.
- **`formatted=false` vs default.** Default responses wrap every numeric in `{raw, fmt}`. Pass `formatted=false` for plain numbers, which is simpler to parse.
- **`count` caps the rows; `total` is the full match count.** `count=5` returns 5 quotes but `total` may read 173 — don't mistake `total` for "stocks up today."
- **Results are pre-sorted descending by percent change.** No client-side sort needed; `quotes[0]` is the top performer.
- **Market-closed = static, last-session values.** On weekends/holidays `marketState` is `CLOSED` and the percentages reflect the last trading session's close (the list is stable, not live). Re-fetching returns identical numbers until the next session.
- **All rows are `quoteType: "EQUITY"`** — the predefined gainers list is single stocks only, so it already satisfies "single stocks" (no ETFs/funds to filter out).
- **API host ≠ web host.** The data lives on `query1`/`query2.finance.yahoo.com`; the human page is `finance.yahoo.com`. The bare `yahoofinance.com` 301-redirects to `finance.yahoo.com`.
- **No anti-bot wall observed.** Pre-run probe reported no antibots; API fetched 200 both bare and with proxies; the gainers page loaded directly with no consent/captcha interstitial. `--verified`/`--proxies` were not required for any successful step.

## Expected Output

```json
{
  "source": "yahoo_finance",
  "list": "day_gainers",
  "list_title": "Day Gainers",
  "ranked_by": "regularMarketChangePercent_desc",
  "market_state": "CLOSED",
  "total_matching": 173,
  "as_of": "2026-05-31",
  "stocks": [
    {
      "rank": 1,
      "symbol": "DELL",
      "name": "Dell Technologies Inc.",
      "price": 420.91,
      "change": 103.86,
      "change_percent": 32.76,
      "volume": 38175314,
      "market_cap": 273409769472,
      "exchange": "NYSE",
      "quote_type": "EQUITY"
    },
    { "rank": 2, "symbol": "OKTA", "name": "Okta, Inc.", "price": 123.27, "change": 28.55, "change_percent": 30.14, "volume": 17181770, "market_cap": 21614956544, "exchange": "NasdaqGS", "quote_type": "EQUITY" },
    { "rank": 3, "symbol": "NTAP", "name": "NetApp, Inc.", "price": 174.29, "change": 31.89, "change_percent": 22.39, "volume": 15902415, "market_cap": 34519937024, "exchange": "NasdaqGS", "quote_type": "EQUITY" },
    { "rank": 4, "symbol": "TBBB", "name": "BBB Foods Inc.", "price": 37.82, "change": 5.09, "change_percent": 15.55, "volume": 6205247, "market_cap": 4457357312, "exchange": "NYSE", "quote_type": "EQUITY" },
    { "rank": 5, "symbol": "TEAM", "name": "Atlassian Corporation", "price": 107.61, "change": 14.32, "change_percent": 15.35, "volume": 13829691, "market_cap": 27307958272, "exchange": "NasdaqGS", "quote_type": "EQUITY" }
  ]
}
```

Note: the example values are a captured snapshot (US market CLOSED, 2026-05-31). Live values change each session, but the shape and the descending-percent ordering are stable.
