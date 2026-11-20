---
name: cse-lk-scrape-all-data-hsepra
title: Colombo Stock Exchange — Scrape All Market Data
description: >-
  Bulk-scrape every public dataset on cse.lk — listed entities, live stock
  prices, ASPI/S&P SL20/20 sector indices, market & trade summaries, per-company
  fundamentals (market cap, beta, 52-week range, ISIN, directors), corporate
  disclosures, financial reports, CSE circulars, and debt-market trades — via
  the undocumented but stable /api/* JSON backend. Read-only.
website: cse.lk
category: finance
tags:
  - finance
  - stock-market
  - sri-lanka
  - scraping
  - json-api
  - read-only
source: 'browserbase: agent-runtime 2026-05-21'
updated: '2026-05-21'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      Use Browserbase (no stealth/proxy needed) only for pages that lack a JSON
      API mirror — CSE Daily/Weekly/Monthly/Quarterly PDF listings under
      /publications/*, and to harvest filter-form POST bodies for endpoints
      whose exact param names aren't pinned (e.g. /api/smd companies+categories
      filter shape).
verified: true
proxies: true
---
# Colombo Stock Exchange — Scrape All Market Data

## Purpose

Bulk-scrape everything the Colombo Stock Exchange (CSE) publishes on **cse.lk** — the master list of listed entities, every live & previous-close stock price, market indices (ASPI / S&P SL20 / 20 GICS sector indices), per-company fundamentals (market cap, beta, 52-week range, ISIN, board, directors), trade summaries, detailed trades, debt-market trades, daily / annual trading statistics, "top gainers / most active volumes / contributors to ASPI" lists, and the full corporate-announcement / financial-report / CSE-circular document feed (with PDF links on `cdn.cse.lk`). Read-only — never places orders or interacts with `mycds.cds.lk`.

Assumption: "scrape all" is interpreted as "produce a single agent run that touches every public data surface and emits a structured snapshot for that moment in time", not "incrementally crawl forever". A consumer that wants live updates should re-run on a schedule.

## When to Use

- Building a one-shot Sri Lankan equities dataset (companies + last prices + sector classification + fundamentals).
- Daily / intraday market-state snapshots: ASPI value, sector-index movement, market turnover, top-mover lists, today's disclosures.
- Disclosure / announcement / financial-report archival — every PDF lives at predictable `https://cdn.cse.lk/...` URLs returned in the API responses.
- Anywhere you would have screen-scraped the rendered HTML — **don't**. The Next.js front-end is a thin client over an undocumented but stable JSON API at `https://www.cse.lk/api/*`.

## Workflow

`cse.lk` is a Next.js front-end over a Spring-style JSON backend mounted at `/api/*`. **Every dataset the UI renders is reachable by a single `POST` (occasionally `GET`) to one of those endpoints with no auth, no API key, no session cookie, and no anti-bot wall.** CORS is wide-open (`Access-Control-Allow-Origin: *` effectively — they return `Access-Control-Allow-Credentials: true` with `Access-Control-Allow-Methods: GET, POST, OPTIONS`), so the endpoints are equally callable from a server-side HTTP client or from a browser page already on `cse.lk`. Use the API for everything; fall back to browser-driven scraping only when an endpoint isn't discovered yet (e.g. a brand-new page added to the site).

### 1. Discover the active security universe

```
POST https://www.cse.lk/api/allSecurityCode
```
→ flat JSON array, every active and inactive symbol:
```json
[{"id":2065,"name":"ACCESS ENGINEERING PLC","symbol":"AEL.N0000","active":1}, ...]
```
`id` is the *security row id* (used in `/api/companyInfoSummery` and `/api/security_trading_statistics`). `symbol` follows the pattern `<TICKER>.<ISSUE_TYPE><NNNN>` — `.N0000` is the common voting share, `.X0000` non-voting, `.R0000` rights, `.D0000` debentures.

For the alternate "internal security id" (used by `/api/smd`, ~289 entries, only main listed entities — not separate issue-types):
```
GET https://www.cse.lk/api/cntSecurity
```
→ `{"status":"OK","statusCode":200,"content":[{"securityId":1141,"name":"ACCESS ENGINEERING PLC","symbol":"AEL","boardId":0,"deleted":0}, ...]}`. `securityId` here is a *different* numeric space than `id` in `allSecurityCode`; do not interchange them. Use `securityId` only when posting to `/api/smd`.

### 2. Live market state (ASPI, S&P SL20, sector indices, top movers)

```
POST /api/marketStatus      → {"status":"Market Closed"} or "Market Open"
POST /api/marketSummery     → {"id":..,"tradeVolume":2.16e9,"shareVolume":76625496,"tradeDate":1779355223096,"trades":25855}
POST /api/aspiData          → {"value":21833.77,"highValue":22069.11,"lowValue":21780.72,"change":44.72,"percentage":0.205,"sectorId":1,"timestamp":...}
POST /api/snpData           → S&P SL20 same shape (sectorId=40)
POST /api/aspi              → {"reqASPIIndices":[ {securityId, symbol, name, price, turnover, sharevolume, tradevolume, change, changePercentage, lastTradedTime}, ... ]}  — every constituent stock of ASPI
POST /api/spsl              → S&P SL20 constituents, shape mirrors /api/aspi (`reqSNPIndices`)
POST /api/topGainers        → top 10 gainers today: {id, securityId, symbol, price, change, changePercentage, tradeDate}
POST /api/mostActiveVolumes → top by share volume today: {securityId, symbol, tradeVolume, shareVolume, turnover, percentageShareVolume}
POST /api/getContributors      → daily breadth: {"reqPositiveCount":134,"reqNegativeCount":83}
POST /api/getContributorsChart → biggest movers of ASPI: [{symbol,name,contribution,lastTradedTime}, ...]
POST /api/marketIndices     → all 20 GICS sector indices with today's index value, change, and turnover (`indexCodeSp` like SPCSEEIP is the S&P/CSE sector code)
POST /api/allSectors        → same shape as /api/marketIndices (slight superset)
GET  /api/listAllSectors    → sector master: {"content":[{"id":223,"name":"Energy","symbol":"EGY","indexCode":"1010","indexCodeSp":"SPCSEEIP"}, ...]}
GET  /api/52WeekSectors?sectorId=1   → 52-week high/low for ASPI (sectorId=1) or any sector index
GET  /api/sectorHighLow?sectorId=1   → today's high/low for the sector index
POST /api/returnAspiSnp     → year-to-date / total return numbers for ASPI + S&P SL20
POST /api/chartData         → time-series for the homepage chart (intraday tick data)
POST /api/GICSSectorSummery → per-GICS-sector summary: priceIndex, turnoverValue, turnoverVolume, PER, PBV, DY, companies traded
```
All POST endpoints accept an empty body. `marketStatus` returns `"Market Closed"` outside `09:30–14:30 IST (UTC+5:30, Mon–Fri)`; price / turnover figures during a closed window are the previous close.

### 3. Today's full trade snapshot (all 280+ symbols, single call)

```
POST /api/tradeSummary       → {"reqTradeSummery":[ {id, name, symbol, logoUrl, quantity, percentageChange, change, price, previousClose, high, low, ...}, ... ]}
POST /api/detailedTrades     → {"reqDetailTrades":[ {id, name, symbol, price, qty, trades, change, changePercentage, logoUrl}, ... ]} — multiple rows per symbol (one per trade-price bucket)
POST /api/dailyMarketSummery → recent daily aggregates: [[{tradeDate, marketTurnover, marketTrades, equityTurnover, equityDomesticPurchase, equityDomesticSales, equityForeignPurchase, equityForeignSales, listedCompanyNumber, ...}, ...]]
POST /api/default_board      → "default board" listing — symbols on the Main Board with current price, turnover, volumes (`{reqDefaultBoards:[...]}` )
POST /api/debtTrades         → debt-market today's traded debentures: {reqDebtTrade:[{symbol, issuer, issueDate, maturityDate, couponRate, parValue, yield, price, quantity, ...}, ...]}
POST /api/getAllIssuers      → debt master: every distinct debt issuer abbreviation + internal id
```
`logoUrl` is a relative path; full URL is `https://cdn.cse.lk/cmt/{logoUrl}`.

### 4. Per-company deep dive

```
POST /api/companyInfoSummery?symbol={SYMBOL}   → all fundamentals: { reqSymbolInfo:{ symbol, name, isin, issueDate, quantityIssued, parValue, lastTradedPrice, previousClose, marketCap, marketCapPercentage, foreignHoldings, foreignPercentage, wtdHiPrice/wtdLowPrice (week-to-date), mtdHiPrice/mtdLowPrice (month-to-date), ytdHiPrice/ytdLowPrice (year-to-date), p12HiPrice/p12LowPrice (past 12-month), allHiPrice/allLowPrice (all-time), tdyShareVolume, tdyTradeVolume, tdyTurnover, hiTrade, lowTrade, closingPrice, change, changePercentage, ... }, reqSymbolBetaInfo:{ securityId, triASIBetaValue, betaValueSPSL, triASIBetaPeriod, quarter }, reqLogo:{ id, path, secId }, reqTagsLogo }
POST /api/companyProfile?symbol={SYMBOL}        → directors, company info, articles-of-association PDF, board PDFs:  { infoCompanyDirector:[{directorId, firstName, lastName, description}], reqArticlePDF:[{id, title, body, securityId, addedDate, path}], ... }
POST /api/companyInfoVideo?symbol={SYMBOL}      → press articles + videos: { reqCompanyArticleInfo:[{id, heading, attachment: "https://cdn.cse.lk/pdf/company-articles/...pdf"}, ...] }
```
`SYMBOL` must be the full `.N0000`-style symbol (e.g. `AEL.N0000`, *not* `AEL`).

### 5. Disclosures, financial reports, CSE circulars (the "Documents" feed)

```
POST /api/approvedAnnouncement     → {"approvedAnnouncements":[{id, createdDate, dateOfAnnouncement, announcementId, announcementCategory ("CASH DIVIDEND" | "DEALINGS BY DIRECTORS" | ...), company, type, symbol, recordDate, allotment, ...}, ...]} — chronological corporate-disclosure feed (this is the homepage "CORPORATE DISCLOSURES" table)
POST /api/getFinancialAnnouncement → {"reqFinancialAnnouncemnets":[{id, path: "cmt/upload_report_file/...pdf", manualDate, uploadedDate, fileText (description), ...}, ...]} — quarterly / annual financial reports
POST /api/circularAnnouncement     → {"reqCircularAnnouncement":[{id, path, manualDate, uploadedDate, fileText}, ...]} — CSE circulars / SEC directives / amendments to rules
GET  /api/smd/categories           → full enum of announcement category strings ("ANNUAL FINANCIAL REPORT", "APPOINTMENT OF DIRECTORS", "CASH DIVIDEND", "DEBENTURE ISSUE", "RIGHTS ISSUE", ...) — useful as a filter dictionary
POST /api/smd                      → filtered announcement search; **needs JSON body with BOTH `companies` AND `categories` arrays populated** (see "Site-Specific Gotchas" — exact field names were not pinned in this run; the validator returns `Company error`/`Category error` until both are supplied). For an unfiltered "all today" feed, use `approvedAnnouncement` instead.
GET  /api/notifications            → site-wide notifications (market halts, etc.): {"content":[{id, title, body}]}
GET  /api/educationalVideos        → educational-video master list (homepage carousel)
```
**Every `path` field is a relative path on `cdn.cse.lk`.** Full PDF URL = `https://cdn.cse.lk/{path}`.

### 6. Historical / archive data

```
POST /api/security_trading_statistics  → annual / historical trading stats per security. Requires both a `symbol` *and* a `year` query parameter; without year the endpoint returns 400. Used by the "Annual Trading Statistics" page (defaults year=2022 in current UI — pass `?year=2025` etc.). Exact param shape was not pinned in this run; try `?symbol=AEL.N0000&year=2025`.
```

Other historical surfaces (CSE Daily, Weekly, Monthly, Quarterly publications) are PDF files at `/publications/cse-daily`, `/publications/cse-weekly`, etc. The page renders a download list — open the page in the browser fallback and harvest the PDF anchors. There is no JSON-API mirror.

### 7. Loop — practical scrape sequence

```bash
# 1. seed: universe
curl -sX POST https://www.cse.lk/api/allSecurityCode > universe.json
curl -sX POST https://www.cse.lk/api/cntSecurity     > internal-secids.json
curl -sX POST https://www.cse.lk/api/listAllSectors  > sectors.json

# 2. market state
for ep in marketStatus marketSummery aspiData snpData aspi spsl topGainers mostActiveVolumes \
          marketIndices allSectors getContributors getContributorsChart returnAspiSnp \
          GICSSectorSummery dailyMarketSummery tradeSummary detailedTrades default_board; do
  curl -sX POST "https://www.cse.lk/api/$ep" -o "snapshots/$ep.json"
done

# 3. per-company (parallelize, ~3 req/s to be polite)
node -e 'JSON.parse(fs.readFileSync("universe.json")).filter(s=>s.active===1).map(s=>s.symbol)' \
  | xargs -P 8 -I {} curl -sX POST "https://www.cse.lk/api/companyInfoSummery?symbol={}" -o "company/{}.json"

# 4. documents
curl -sX POST https://www.cse.lk/api/approvedAnnouncement     > announcements.json
curl -sX POST https://www.cse.lk/api/getFinancialAnnouncement > financials.json
curl -sX POST https://www.cse.lk/api/circularAnnouncement     > circulars.json

# 5. resolve PDFs:  ${item.path} → https://cdn.cse.lk/${item.path}
```
Whole snapshot for ~290 listed entities completes in ~2-3 minutes at 8 parallel reqs/sec.

### Browser fallback

Use only when a new page surfaces an endpoint you haven't pinned, or when you need a rendered table the API doesn't mirror (CSE Daily/Weekly/Monthly/Quarterly PDFs on `/publications/*`). The site is fully Browserbase-compatible — no Akamai, no captcha, no rate-limit observed in 6 page loads + 60+ API probes during this skill's authoring. A **non-verified, non-proxied** Browserbase session works (this skill was authored with `--verified --proxies` for safety, but the same probes succeed without either flag on the API path).

```bash
SID=$(browse cloud sessions create --keep-alive | node -e "...id extraction...")
browse open "https://www.cse.lk/publications/cse-daily" --remote --session "$SID"
browse wait timeout 3500 --remote --session "$SID"
browse get markdown body --remote --session "$SID"
```
Then harvest `https://cdn.cse.lk/...pdf` anchors out of the markdown.

To enumerate API URLs hit by a new page (useful when an unknown report page is added to the nav):
```js
performance.getEntriesByType('resource')
  .filter(r => r.name.includes('/api/'))
  .map(r => r.name.replace('https://www.cse.lk',''))
```
This is how the endpoint inventory in this SKILL was built.

## Site-Specific Gotchas

- **`POST` is required on nearly every `/api/*` endpoint that returns dataset bodies.** `GET` returns `405 Method Not Allowed` (with an `Allow: POST` header) for ~80% of endpoints. The five `GET`-only endpoints observed: `/api/allSecurityCode`, `/api/cntSecurity`, `/api/lastUpdateTime`, `/api/previousUpdateTime`, `/api/notifications`, `/api/educationalVideos`, `/api/listAllSectors`, `/api/smd/categories`. Everything else: POST. A body is *not* required — empty `POST` is fine and returns the full payload.
- **Two distinct `securityId` spaces.** `/api/allSecurityCode`'s `id` is *not* the same number as `/api/cntSecurity`'s `securityId`. Example: `AEL.N0000` is `id=2065` in `allSecurityCode` but `securityId=1141` in `cntSecurity`, and `1141` is the value embedded in `reqSymbolBetaInfo.securityId` and used by `/api/smd`. Always look up the symbol → numeric mapping from the response you're going to consume; never reuse across endpoints.
- **Symbol format matters for company endpoints.** `companyInfoSummery`, `companyProfile`, and `companyInfoVideo` require the full `.N0000`-style symbol. Just `AEL` returns 400 / empty body. The shorter form is only used inside `cntSecurity` and `getAllIssuers`.
- **CDN paths are relative.** Every `path`, `logoUrl`, `attachment` value in the JSON responses is *relative*. Full URL = `https://cdn.cse.lk/{path}`. Logos additionally need the `cmt/` prefix: `https://cdn.cse.lk/cmt/{logoUrl}`.
- **Timestamps are JS milliseconds.** All `tradeDate`, `lastTradedTime`, `manualDate`, `uploadedDate`, `createdDate` fields are `Date.now()`-style millisecond epochs in IST (Asia/Colombo, UTC+5:30). `dateOfAnnouncement` is the human-readable string ("21 May 2026"). `uploadedDate` on PDFs is *also* sometimes a human string ("21 May 2026 04:35:14 PM") — check the type before parsing.
- **Numbers are sometimes scientific notation in the wire JSON.** Bodies contain values like `2.159282104E9`, `7.49E10`, `1.0369407E7`. Standard `JSON.parse` handles these fine — but if you regex-extract numbers you'll get `2.159282104` and silently lose 9 orders of magnitude. Parse, don't regex.
- **`/api/smd` has a fussy validator** — both `companies` and `categories` must be present and non-empty, and the exact required field names couldn't be pinned in this run (only validation errors `{"field":"Company error","code":"one or more company should select"}` / `Category error` returned for `companies`, `companyId`, `companyIds`, `selectedCompanies`). For the unfiltered "all today's announcements" use case, `approvedAnnouncement` is the correct endpoint; `smd` is only needed when filtering by `(company × category × date range)` like the announcements page UI does. To pin the exact field names, open `/announcements` in a stealth session, click **Get Data**, and read the POST body from `chrome-devtools-protocol` / `performance.getEntriesByType('navigation')` — the live UI's request body is the ground truth.
- **Geo-redirect to legacy on direct visit to deep paths.** Visiting `/pages/trade-summary/trade-summary.component.html` (the *old* Angular site URL) loads — Next.js 404s back to a generic homepage shell. The current paths are `/equity/trade-summary`, `/equity/detailed-trades`, `/equity/gics-industry-group-summary`, etc., as enumerated in the homepage Market dropdown. Don't trust stale links from web archives or old SEO copies.
- **Search-only / filter pages don't render data server-side.** `/announcements`, `/equity/annual-trading-statistics`, `/company-profile?symbol=...` and other filter-driven pages *do* render their initial-state data server-side (Next.js SSR), so `browse get markdown body` is sufficient for the default view. But the **filtered** views (with non-default date ranges / categories / years) are XHR-driven — the page calls `/api/smd` or `/api/security_trading_statistics` and re-renders client-side. If you need a filtered view, hit the API directly.
- **No `/api/news` endpoint despite UI references.** `POST /api/news` returns 404. News and press releases are at `/news-events/press-releases` (HTML page, no JSON mirror). Educational videos *do* have a JSON endpoint (`GET /api/educationalVideos`) but only return references — the actual video URLs are YouTube links that need to be harvested from the page.
- **Returns may be `0` / `null` outside market hours.** During `Market Closed` state, `tdyShareVolume`, `tdyTradeVolume`, etc. on a freshly-opened market day are 0 until the first auction print. `previousClose` and `closingPrice` are the most reliable "last known price" fields for end-of-day reporting.
- **CORS allows everything.** Headers returned: `Access-Control-Allow-Methods: GET, POST, OPTIONS`, `Access-Control-Allow-Headers: Authorization, Content-Type, *`, `Access-Control-Allow-Credentials: true`. The endpoints are callable from any browser context after a one-time OPTIONS preflight, and from any server-side HTTP client unconditionally. **No session cookie or `Referer` header is required.** (Different from the legacy Angular `/cmt/api/v1/*` surface which did require a Referer.)
- **Oracle BMC LB cookie.** `Set-Cookie: X-Oracle-BMC-LBS-Route=...; Domain=cse.lk` — sticky-session cookie issued by Oracle Cloud's BMC load balancer. Not required for API access, but if you're maintaining a persistent client, keep it to avoid bouncing across LB pods.
- **`X-Robots-Tag: noindex, nofollow, noarchive, nosnippet`** is returned on the HTML pages — CSE explicitly de-indexes itself from search engines. No statement about API scraping is made; the API is undocumented but unprotected. Be polite (≤ 8 parallel reqs/s) and identify yourself in `User-Agent`.

## Expected Output

A single JSON snapshot with the following top-level shape:

```json
{
  "captured_at_iso": "2026-05-21T16:20:23+05:30",
  "market_status": "Market Closed",
  "indices": {
    "aspi":   { "value": 21833.77, "change": 44.72, "percentage": 0.205, "high": 22069.11, "low": 21780.72, "ytd_return": -0.0349, "ytd_total_return": -0.0108 },
    "snpsl20":{ "value":  6038.71, "change":  4.71, "percentage": 0.08,  "high":  6107.04, "low":  6034.00, "ytd_return": -0.0193, "ytd_total_return":  0.0116 },
    "sectors":[ { "name":"Energy", "symbol":"EGY", "indexCodeSp":"SPCSEEIP", "indexValue":3038.57, "change":53.29, "percentage":1.785, "sectorTradeToday":277, ... } ]
  },
  "market_summary": { "trades": 25855, "tradeVolume": 2159282104, "shareVolume": 76625496, "tradeDate": 1779355223096 },
  "top_movers": {
    "gainers":         [ { "symbol":"ASPH.N0000", "price":0.6,  "change":0.1, "changePercentage":20.0, "tradeDate":1779354306000 }, ... ],
    "most_active_vol": [ { "symbol":"JXG.N0000",  "shareVolume":6120586, "turnover":79568698.4, "tradeVolume":661 }, ... ],
    "aspi_contributors":[{ "symbol":"MELS.N0000", "name":"MELSTACORP PLC", "contribution":10.6 }, ... ]
  },
  "securities": [
    {
      "symbol": "AEL.N0000",
      "name":   "ACCESS ENGINEERING PLC",
      "isin":   "LK0409N00009",
      "id_allSecurityCode": 2065,
      "id_cntSecurity":     1141,
      "active": 1,
      "logo": "https://cdn.cse.lk/cmt/upload_logo/1141_1601609745.jpeg",
      "issueDate": "27/MAR/2012",
      "quantityIssued": 1000000000,
      "parValue": 1.0,
      "lastTradedPrice": 74.9,
      "previousClose":   74.8,
      "change":           0.1,
      "changePercentage": 0.134,
      "high":             75.9,
      "low":              74.5,
      "marketCap":        74900000000,
      "marketCapPercentage": 0.945,
      "tdyShareVolume":   292313,
      "tdyTradeVolume":   139,
      "tdyTurnover":      21921456,
      "wtdHi": 78.5, "wtdLow": 74.7,
      "mtdHi": 79.5, "mtdLow": 74.7,
      "ytdHi": 80.5, "ytdLow": 63.5,
      "p12Hi": 80.5, "p12Low": 37.8,
      "allHi": 80.5, "allLow":  8.3,
      "beta_aspi": 1.29, "beta_snpsl20": 0.92,
      "sector": "Capital Goods"
    }
  ],
  "documents": {
    "corporate_disclosures": [
      { "date_epoch_ms": 1779371592000, "date_str": "21 May 2026", "company":"LANKA CERAMIC PLC", "category":"CASH DIVIDEND",
        "announcement_id": 37062 }
    ],
    "financial_reports": [
      { "uploaded_str": "21 May 2026 04:35:14 PM", "description":"Interim Financial Statements for the Quarter ended 31st March 2026",
        "pdf_url": "https://cdn.cse.lk/cmt/upload_report_file/602_1779361514530.03.2026.pdf" }
    ],
    "cse_circulars": [
      { "uploaded_str": "20 May 2026 03:56:45 PM", "title":"AMENDMENTS TO THE RULES OF CSE CLEAR (PVT) LTD",
        "pdf_url": "https://cdn.cse.lk/upload_report_file/TC5o5Y0iQ78uTOTS_20May2026102645GMT_1779272805100.pdf" }
    ]
  },
  "debt": {
    "issuers": [ { "issuer": "AAF", "id": 1207359 } ],
    "trades":  [ { "symbol":"AAF-BD-20/08/26-C2487", "issuer":"AAF", "issueDate":"20210820", "maturityDate":"20260820",
                   "couponRate":"12.1800", "parValue":1.0, "yield":0.0, "price":0.0, "quantity":0 } ]
  }
}
```

Per-component partial shapes (call each `/api/*` endpoint described in **Workflow** for its raw body; aggregate as above). When a field is missing in the raw response (e.g. `marketCapPercentage` is `null` on a brand-new listing), omit it rather than emitting `null` — downstream consumers parse the JSON with strict schemas.
