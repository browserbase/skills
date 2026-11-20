---
name: zerodha-com-find-indian-stocks-06b5lz
title: Find Indian Stocks on Zerodha Markets
description: >-
  Search Zerodha Markets for Indian stocks by company name or ticker and return
  matching NSE/BSE-listed companies with symbol, exchange, and canonical
  stock-page URL.
website: zerodha.com
category: finance
tags:
  - finance
  - stocks
  - india
  - nse
  - bse
  - zerodha
  - search
source: 'browserbase: agent-runtime 2026-06-03'
updated: '2026-06-03'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      Driving the search box (#search) on /markets/stocks/ returns the same
      results via the rendered #search_results dropdown — use only if the JSON
      endpoint is unavailable. Slower but equivalent.
  - method: api
    rationale: >-
      The /markets/stocks/search/ endpoint behaves like a JSON API, but it is an
      undocumented internal endpoint (Tijori-powered), not a contracted public
      API — treat field availability defensively.
verified: false
proxies: false
---
# Find Indian Stocks on Zerodha Markets

## Purpose

Look up Indian stocks (and related instruments) listed on the NSE/BSE by searching for a company name or ticker on Zerodha Markets, and return the matching listed entities with their trading symbol and exchange. This skill is **read-only** — no login, no orders. The fastest reliable path is the JSON search endpoint that the page itself calls (`/markets/stocks/search/?q=<query>`), which returns a clean, structured list of matches; scripted browsing is only a fallback.

## When to Use

- A user wants to find an Indian stock by company name or partial ticker (e.g. "find Reliance stocks", "what's the NSE symbol for Tata Motors?").
- You need to resolve a company name to its **trading symbol + exchange** (NSE/BSE) before doing anything else (charting, quoting, deeper research).
- You need to enumerate the family of listed entities under a brand (e.g. all "Reliance"/"Tata"/"HDFC" companies).
- You need the canonical Zerodha Markets stock-page URL for a company.

Not for: placing orders, portfolio access, or live tick-by-tick quotes (live price is rendered client-side — see Gotchas).

## Workflow

**Recommended method — call the JSON search endpoint directly (`fetch`).** The search box on `https://zerodha.com/markets/stocks/` is powered by `search.js`, which issues a single GET to a JSON endpoint. Hit it directly instead of driving the UI.

1. Issue a GET request:
   ```
   GET https://zerodha.com/markets/stocks/search/?q=<url-encoded-query>
   Example: https://zerodha.com/markets/stocks/search/?q=reliance
   ```
   No authentication, cookies, or special headers are required. Residential proxies are **not** needed — the endpoint returns `200 application/json` directly.

2. Parse the JSON. The response has five arrays:
   ```json
   { "companies": [...], "brands": [...], "index": [...], "ETFs": [...], "MFs": [...] }
   ```
   For "find Indian stocks", the `companies` array is the primary result. Each row:
   ```json
   { "display_name": "Reliance Industries", "slug": "reliance-industries-limited",
     "symbol": "RELIANCE", "exchange": "NSE", "category": "brands" }
   ```

3. Map each match to its canonical Zerodha Markets page URL (pattern derived from `search.js`):
   - Stock → `https://zerodha.com/markets/stocks/{exchange}/{symbol}/` (e.g. `/markets/stocks/NSE/RELIANCE/`)
   - ETF → `https://zerodha.com/markets/etf/{exchange}/{symbol}/`
   - Mutual fund → `https://zerodha.com/markets/mutual-fund/{symbol}/`
   - Index → `https://zerodha.com/markets/indices/{display_name}`

4. Return the matches (display name, symbol, exchange, slug, and the constructed URL). If all arrays are empty, return an empty result set with `count: 0` — that is a valid "no matches" outcome, not an error.

### Browser fallback

If the JSON endpoint is ever unavailable, drive the page UI:

1. `browse open https://zerodha.com/markets/stocks/ --remote`
2. `browse wait load`
3. Type the query into the search input: selector `#search` (placeholder "Search Stocks or Brands...").
4. `browse wait timeout 2000` — results animate into `#search_results`.
5. Read the rendered rows (each links to `/markets/stocks/{exchange}/{symbol}/`). Filter tabs ("All" / "Companies") sit above the results.

This returns the same data the JSON endpoint provides, just slower.

## Site-Specific Gotchas

- **The search API is NOT Cloudflare-gated.** The pre-run probe flags `cloudflare` + `cloudflare-waf` on the `zerodha.com` *root* homepage, but the `/markets/stocks/` subsite and its `/markets/stocks/search/` JSON endpoint return `200` cleanly **with or without** residential proxies/verified stealth. Don't waste a residential-proxy budget on this endpoint.
- **Empty result is HTTP 200, not 404.** A no-match query (e.g. `?q=zzzqxqx`) returns `{"companies":[], "brands":[], "index":[], "ETFs":[], "MFs":[]}` with status 200. Treat empty arrays as "no matches", never as an error.
- **`exchange` is per-row and can be NSE or BSE.** Don't assume NSE for every result; read the field. Build the stock-page URL from the row's own `exchange`+`symbol`.
- **Brand vs. ticker noise.** Searching a brand term (e.g. `reliance`) returns the whole family of related listed companies (RELIANCE, RPOWER, RELINFRA, RIIL, RCOM, …), not just the flagship. The flagship usually carries `"category": "brands"`. Filter on `display_name`/`symbol` if the user wanted one specific company.
- **`category` field is sparse.** Most rows have `"category": ""`; only marquee/brand entries get `"brands"`. Don't rely on it for filtering — use `symbol`/`display_name`.
- **Live price is client-side.** The individual stock detail page (`/markets/stocks/NSE/RELIANCE/`) renders the current price, % change, and intraday range via JavaScript/websocket — the static HTML shows `--` placeholders. Market cap appears server-side, but a **live quote requires a real browser render**, not a static fetch. This skill is about *finding* stocks (resolving name→symbol→exchange); for a live quote, open the detail page in a browser.
- **Single-token queries work** (e.g. `?q=hd` returns HDFCBANK, HDFCLIFE, …) — no minimum length enforced in testing.
- **"Powered by Tijori"** — the data/UI is supplied by Tijori Finance; the response shape is stable JSON but is not a publicly documented/contracted API, so treat field availability defensively.

## Expected Output

Matches found:
```json
{
  "success": true,
  "query": "reliance",
  "count": 8,
  "results": [
    { "display_name": "Reliance Industries", "symbol": "RELIANCE", "exchange": "NSE", "slug": "reliance-industries-limited", "url": "https://zerodha.com/markets/stocks/NSE/RELIANCE/" },
    { "display_name": "Reliance Power", "symbol": "RPOWER", "exchange": "NSE", "slug": "reliance-power-limited", "url": "https://zerodha.com/markets/stocks/NSE/RPOWER/" },
    { "display_name": "Reliance Infra", "symbol": "RELINFRA", "exchange": "NSE", "slug": "reliance-infrastructure-limited", "url": "https://zerodha.com/markets/stocks/NSE/RELINFRA/" }
  ],
  "error_reasoning": null
}
```

No matches (still a success):
```json
{
  "success": true,
  "query": "zzzqxqx",
  "count": 0,
  "results": [],
  "error_reasoning": null
}
```

Endpoint/page error (rare):
```json
{
  "success": false,
  "query": "reliance",
  "count": 0,
  "results": [],
  "error_reasoning": "Search endpoint returned non-200 / non-JSON response."
}
```
