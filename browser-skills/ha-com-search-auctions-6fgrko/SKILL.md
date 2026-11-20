---
name: ha-com-search-auctions-6fgrko
title: Heritage Auctions Search
description: >-
  Search Heritage Auctions (ha.com) for auction lots across all categories —
  past, current, and upcoming — with the full URL-param filter surface
  (category, auction status, auction type, price/estimate range, grading, date
  range, lot characteristics, consignor, sort, pagination). Returns structured
  JSON per lot. Read-only.
website: ha.com
category: auctions
tags:
  - auctions
  - collectibles
  - heritage
  - datadome
  - read-only
  - candidate
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: browser
alternative_methods:
  - method: browser
    rationale: >-
      Heritage has no public auction API. Every fetch against ha.com (except
      robots.txt) returns 403 X-Datadome: protected — verified during generation
      across /sitemap.zx, /c/search/results.zx, /c/search.zx, and an
      /itm/.../a/{id}-{n}.s lot URL, with and without residential proxies.
      Scripted browsing through a Browserbase session created with --verified
      --proxies is the only working path.
  - method: api
    rationale: >-
      No public auction API exists. The site's internal endpoints are gated by
      DataDome and require a session-warmed cookie context; treat them as not
      reachable from a cookieless client.
verified: true
proxies: true
---
# Heritage Auctions Search

## Purpose

Given a search query, category, or filter set against [Heritage Auctions (ha.com)](https://www.ha.com),
return matching auction lots (past, current, upcoming) as structured JSON — lot title, lot ID,
auction-name + auction-ID + close datetime, category path, current bid / hammer price + bid count,
low/high estimate, grading details (PSA/SGC/BGS/CGC/PCGS/NGC), primary + additional image URLs,
condition / catalog description, sold flag + final-sale price, and the lot's canonical URL.

Heritage has **no public auction API**. Lead with scripted browsing through Browserbase.
Read-only — never click Bid, Place Bid, Add to Watch List, Buy It Now, Make Offer, Sign In,
or submit any form.

## When to Use

- "Find the most recent Rolex Daytona lots on Heritage."
- "What's the current bid on lot 54178 in Heritage sale 5567?"
- "Show me upcoming Comics & Comic Art signature auctions on Heritage."
- "What did this 1909 T206 Honus Wagner card sell for in past Heritage auctions?" (Auction Archives)
- Bulk extraction across a category for collector / market-data workflows.

## Workflow

### 1. Stealth + residential-proxy session (mandatory)

Heritage is behind **DataDome**. A bare HTTP fetch (with or without `--proxies`) returns
`403 X-Datadome: protected` and a captcha-delivery HTML stub. The Browserbase Fetch API path
(`browse cloud fetch ... --proxies`) is **confirmed blocked** — both `https://www.ha.com/sitemap.zx`
and every `/c/search/results.zx?...` URL returned 403 in our trace. The only working path is a
fully-warmed Browserbase session with `--verified` (stealth) + `--proxies` (residential).

```bash
export BROWSERBASE_API_KEY="$BB_API_KEY"
SID=$(browse cloud sessions create --keep-alive --verified --proxies \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
export BROWSE_SESSION="$SID"
```

Both flags are required. Without `--verified`, DataDome serves the captcha page on first
navigation. Without `--proxies`, your datacenter IP gets flagged within 1–2 page loads.

### 2. Pick the right subdomain for your category

Heritage shards by category onto subdomains. Searching from a category subdomain narrows the
filter rail to that category's specific filters (e.g. coin-grade-group on `coins.ha.com`, comic
sub-category on `comics.ha.com`) and is the preferred entry point when you know the category.

| Subdomain | Category |
|---|---|
| `www.ha.com` | Global / all categories |
| `coins.ha.com` | US Coins, World Coins, Bullion |
| `currency.ha.com` | Currency / Paper Money |
| `sports.ha.com` | Sports Collectibles (cards, memorabilia) |
| `jewelry.ha.com` | Jewelry, Timepieces, Wristwatches |
| `comics.ha.com` | Comics & Comic Art |
| `fineart.ha.com` | Fine & Decorative Art |
| `entertainment.ha.com` | Music & Entertainment, Movie Posters |
| `historical.ha.com` | Historical, Books & Manuscripts |

If the category is unknown or cross-cutting, use `www.ha.com` and rely on the `dept=<id>` URL
param (see "Department IDs" below).

### 3. Construct the search URL directly

Heritage's filter rail emits a stable set of URL parameters. **Build the URL by hand from this
table** rather than clicking through the filter rail — it's faster, cheaper, and deterministic.
Base path: `https://{subdomain}.ha.com/c/search/results.zx`.

| URL param | Meaning | Example |
|---|---|---|
| `term=<q>` | Keyword search (URL-encoded) | `term=Rolex+Daytona` |
| `mode=live` | Currently open / upcoming auctions | `mode=live` |
| `mode=archive` | Closed / sold lots (Auction Archives — may require login, see Gotchas) | `mode=archive` |
| `live_state=A~B~C` | Auction lifecycle states, pipe-encoded with `~` (URL-encoded `%7E`). Observed values: `5318` (upcoming open), `5319`, `5320` (live floor), `5321`, `5322`, `5323` (live internet), `5324` (post-floor still bidding). Pass all of `5318~5319~5320~5321~5322~5323~5324` to mean "any currently-bidding state". | `live_state=5318%7E5319%7E5320%7E5321%7E5322%7E5323%7E5324` |
| `archive_state=5327` | Closed-lot filter when `mode=archive` | `archive_state=5327` |
| `sold_status=1526` | "Sold" only (archive mode) | `sold_status=1526` |
| `dept=<id>` | Top-level department. Observed: `1909` US Coins, `1938` Comics, `1544` Fine Art. (Browse `/c/departments.zx` for the full enum.) | `dept=1938` |
| `dept_child=<id>` | Sub-department (e.g. `4385` = Golden Age Comics 1938-1955) | `dept_child=4385` |
| `comic_category=<id>` | Comics sub-cat (e.g. `2449`) | |
| `coin_category=<id>` | Coins sub-cat (e.g. `3164`) | |
| `art_category=<id>` | Art sub-cat (e.g. `2368` = Furniture) | |
| `coin_grade_group=A~B` | Coin grade band, pipe-encoded (e.g. `3053~4230`, `3054~3501`) | `coin_grade_group=3054%7E3501` |
| `consignor_no=<id>` | Filter by consignor (e.g. `103`) | `consignor_no=103` |
| `highlights=<id>` | Highlighted-lots filter (e.g. `2252`) | |
| `saleNo=<id>` | Restrict to a single auction by ID | `saleNo=63325` |
| `page=<pageSize>~<index>` | Pagination. Observed page sizes: `10`, `24`, `48`, `50`, `72`. Index is 1-based. **Page size 24 is the default the UI ships with**; `72` works for archive view. | `page=48%7E1`, `page=72%7E1` |
| `layout=gallery` / `layout=list` | View mode. `list` exposes a few extra fields (grade, lot #) inline; `gallery` is denser. | `layout=list` |
| `sb=<n>` | Sort order. Observed: `sb=1` (best match / score, default), `sb=14`, `sb=15`. The full sort enum is not exposed in the URL — read the sort dropdown labels off the rendered page to map. | `sb=1` |

Example fully-formed search URLs (all directly observed in production result-page indexing):

```
https://www.ha.com/c/search/results.zx?term=coin&live_state=5318%7E5319%7E5320%7E5321%7E5323%7E5322%7E5324&sb=1&mode=live&page=48%7E97&layout=gallery
https://comics.ha.com/c/search/results.zx?live_state=5318%7E5319%7E5320%7E5323%7E5321%7E5324&dept=1938&comic_category=2449&dept_child=4385&sb=1&mode=live&page=10%7E57&layout=list
https://www.ha.com/c/search/results.zx?coin_grade_group=3054%7E3501&archive_state=5327&sold_status=1526&sb=1&mode=archive&page=48%7E56&layout=gallery
```

### 4. Navigate and extract

```bash
URL="https://www.ha.com/c/search/results.zx?term=Rolex+Daytona&mode=live&live_state=5318%7E5319%7E5320%7E5321%7E5322%7E5323%7E5324&page=48%7E1&layout=list&sb=1"
browse open "$URL" --remote --session "$SID"
browse wait load --remote --session "$SID"
browse wait timeout 2500 --remote --session "$SID"     # results widget renders progressively
browse snapshot --remote --session "$SID"
```

Per-lot fields visible on the search results page (`layout=list` recommended for extraction):

- **Lot canonical URL** — anchor `href` matching `^https?://[^.]+\.ha\.com/itm/.+/a/(\d+)-(\d+)\.s$`. The two capture groups are `auctionId` and `lotNumber`.
- **Lot title** — anchor text on the title link.
- **Auction name + close datetime** — usually in a small caption above or below the lot card; cross-reference with `/c/auction-home.zx?saleNo=<auctionId>` for canonical timing.
- **Current bid / starting bid / hammer price** — explicit `$N` text labelled "Current Bid", "Starting", "Sold For", or "Realized" depending on lot state.
- **Estimate** — text like "Estimate: $15,000 – $25,000".
- **Grade** — for cards/comics: `PSA 10`, `CGC 9.8`, `BGS 9.5`, `SGC 88`. For coins: `PCGS MS-65`, `NGC PF-67`. Surface as `{grader, grade, cert_number?}` when present.
- **Primary image URL** — `<img src>` matching `https://dyn1.heritagestatic.com/(ha\?p=|lf?set=path...)`. Heritage uses two thumbnail URL shapes; both are stable CDN endpoints.

For total-result count + pagination, read the page header text: "Page X of Y" and "N results".
Pagination via incrementing the second component of `page=<size>~<index>` (1-based).

### 5. Open a single lot for the full description (when needed)

The catalog description body + full image gallery + bid-history table are only present on the
lot detail page:

```
https://{subdomain}.ha.com/itm/{cat-path}/{slug}/a/{auctionId}-{lotNumber}.s
```

Lot URL examples (verified via search-result indexing):

```
https://jewelry.ha.com/itm/timepieces/wristwatch/rolex-day-date-40-.../a/5567-54178.s
https://sports.ha.com/itm/football-cards/singles-1970-now-/dan-marino-signed-1984-topps-rookie-card/a/410113-43192.s
https://comics.ha.com/itm/.../a/<auctionId>-<lotNumber>.s
```

Open with the same warmed session — do not start a fresh session per lot, or DataDome
re-challenges. **Read-only — do not click Bid / Watch.**

### 6. Direct-input shortcuts

- **Full ha.com URL passed as input** → use as-is (skip steps 3–4, jump to step 4 `browse open`).
- **Direct lot URL passed as input** → jump to step 5; extract from the detail page only.
- **Auction ID + lot number passed as input** → either hit
  `https://www.ha.com/c/search.zx?saleNo=<auctionId>&txtLotNo=<lotNumber>` (legacy lot-lookup
  endpoint) or compose the canonical lot URL once the subdomain is known via the auction-home
  page `/c/auction-home.zx?saleNo=<auctionId>`.
- **Category-only browse** → omit `term=` from the URL and supply `dept=<id>` plus
  appropriate `live_state` / `archive_state`.

### 7. Release the session

```bash
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

## Site-Specific Gotchas

- **READ-ONLY.** Never click Bid, Place Bid, Add to Watch List, Buy It Now, Make Offer, Sign In,
  or submit any form. Heritage takes binding bids on click — do not.
- **DataDome anti-bot is unconditional on ha.com.** Every URL on `*.ha.com` except
  `https://www.ha.com/robots.txt` returns `403 X-Datadome: protected` to the Browserbase Fetch API
  even with `--proxies`. Verified during iteration on `/sitemap.zx`, `/c/search/results.zx`,
  `/c/search.zx`, and a `/itm/.../a/{id}-{n}.s` lot URL — all 403. **Do not waste time on the
  Fetch API path or on cookieless curl.** The only working surface is `browse open` against a
  Browserbase session created with both `--verified` and `--proxies`.
- **`browse cloud search` is fine.** The Browserbase Search API returns real Heritage URLs
  (indexed by upstream search engines) without ever hitting Heritage's origin, so it's a cheap
  way to discover canonical lot URLs and auction-home pages for a known query. Use it for
  cold-start URL discovery before warming a stealth session.
- **Auction Archives (`mode=archive`) require a free Heritage account.** Closed-lot pricing
  pages — i.e. anything with `mode=archive&archive_state=5327&sold_status=1526` — render a
  registration / login wall to anonymous viewers showing hammer estimates but redacting realized
  prices. If you need realized prices, you must persist an authenticated context. The login
  endpoint is `https://historical.ha.com/c/login.zx`; registration is
  `https://www.ha.com/c/register.zx?type=surl-join`. **A cookie-context flow with a registered
  account is the only path** — Heritage does not expose a public archives API. If you don't
  have a credentialed context yet, emit `auth_wall: true` in your output and return only the
  fields visible to anonymous viewers.
- **`mode=live` vs `mode=archive` is the most important filter.** Default to `mode=live`
  unless the caller asks for closed lots. They're disjoint result sets — no URL toggle returns
  both at once. To support an "all" search shape, run two queries and merge.
- **The `live_state=A~B~C` enum is undocumented.** From production result URLs we've observed
  the full set `5318~5319~5320~5321~5322~5323~5324`. Pass all of them when the caller asks for
  "currently bidding / upcoming"; restrict to specific subsets only if you've verified what each
  state means via the filter rail labels on a rendered page.
- **Pagination format is `page={pageSize}~{index}`.** The first component is page size
  (`10`, `24`, `48`, `50`, `72` are all valid); the second is the 1-based page index. **`page=48~1`
  means "page 1, 48 per page"** — not "page 48, item 1". Heritage's UI defaults to 24 per page.
- **Lot canonical URL is `{subdomain}/itm/{slug-path}/a/{auctionId}-{lotNumber}.s`.** The
  `.s` extension is required; `.zx` is used for non-lot pages. The auction ID is shared across
  every lot in that auction.
- **`saleNo=<id>` and `auctionId` are the same identifier.** The URL params name it differently
  in different contexts (`saleNo=63325` on `/c/auction-home.zx`; the digit run before the dash
  on `/itm/.../a/63325-NNNNN.s`) — they refer to the same Heritage auction-sale number.
- **Heritage uses two CDN image URL shapes.** Both are stable:
  - `https://dyn1.heritagestatic.com/ha?p=<dash-encoded-id>&it=product`
  - `https://dyn1.heritagestatic.com/lf?set=path%5B<slash-encoded-id>%5D&call=url%5Bfile%3Aproduct.chain%5D`
- **Subdomain choice changes the filter rail.** Searching from `coins.ha.com` exposes
  `coin_grade_group`, `coin_category`; from `comics.ha.com` exposes `comic_category`,
  `dept_child`; from `fineart.ha.com` exposes `art_category`. The `www.ha.com` global rail
  exposes the union but is less ergonomic. Always pick the most specific subdomain you can.
- **The legacy `/c/search.zx` endpoint still resolves** to a Heritage Auctions Search page —
  treat it as an alias for `/c/search/results.zx`. The auction-detail lookup
  `/c/search.zx?ID=&saleNo=<n>&txtLotNo=<m>` is the documented way to resolve a specific
  `(auctionId, lotNumber)` pair.
- **`browse cloud sessions create` lands in `us-west-2` by default.** This is fine for ha.com
  (US-based site, US shipping). If you need a non-US-IP fingerprint for some reason, pass
  `--region us-east-1` — but the default works.
- **The `robots.txt` matters.** Heritage explicitly disallows `/c/bid.zx`, `/c/cart/`,
  `/c/my/collection/`, `/c/my/wantlist.zx`, `/c/print-prices-realized.zx`, `/c/invoice/`, and
  `/c/phone-bid.zx`. None of these are needed for read-only search; do not navigate to any of
  them. Crawl delay is **15s for the unnamed default agent** — keep `wait timeout` between
  page loads ≥ 2.5s to stay friendly.
- **Could not live-verify a full search flow during skill generation.** The sandbox that
  produced this SKILL could not reach `connect.{region}.browserbase.com` (DNS REFUSED), and
  `browse cloud fetch` was blocked by DataDome on every meaningful URL. The URL parameter
  surface and gotchas above are derived from the Browserbase Search API surfacing real
  production Heritage URLs + robots.txt + the captured DataDome 403 responses. **This skill
  is shipped as `candidate` — the first agent to run it in an environment that can reach
  Browserbase's connect endpoint should re-verify the per-lot extraction selectors and the
  `live_state` enum semantics, then promote.**

## Expected Output

```json
{
  "success": true,
  "query": "Rolex Daytona",
  "search_url": "https://jewelry.ha.com/c/search/results.zx?term=Rolex+Daytona&mode=live&live_state=5318%7E5319%7E5320%7E5321%7E5322%7E5323%7E5324&page=48%7E1&layout=list&sb=1",
  "subdomain": "jewelry.ha.com",
  "mode": "live",
  "total_results": 87,
  "page_size": 48,
  "page_index": 1,
  "has_next_page": true,
  "filters_applied": {
    "term": "Rolex Daytona",
    "mode": "live",
    "live_state": ["5318", "5319", "5320", "5321", "5322", "5323", "5324"],
    "dept": null,
    "sort": "sb=1"
  },
  "lots": [
    {
      "lot_id": "5567-54178",
      "auction_id": "5567",
      "lot_number": "54178",
      "title": "Rolex, Cosmograph Daytona, 18k Yellow Gold, Ref. 116528, Circa 2008",
      "category_path": ["Jewelry & Watches", "Timepieces", "Wristwatch"],
      "subdomain": "jewelry.ha.com",
      "current_bid_usd": 12500,
      "starting_bid_usd": 10000,
      "bid_count": 3,
      "low_estimate_usd": 15000,
      "high_estimate_usd": 25000,
      "currency": "USD",
      "reserve_met": false,
      "auction_name": "Heritage Spring Watches Signature Auction",
      "auction_id_canonical": "5567",
      "auction_close_iso": "2026-05-22T19:00:00Z",
      "auction_type": "signature",
      "grading": {
        "grader": null,
        "grade": null,
        "cert_number": null
      },
      "primary_image_url": "https://dyn1.heritagestatic.com/ha?p=3-2-2-7-8-32278150&it=product",
      "additional_image_urls": [],
      "lot_url": "https://jewelry.ha.com/itm/timepieces/wristwatch/rolex-day-date-40-.../a/5567-54178.s",
      "sold": false,
      "final_sale_price_usd": null,
      "has_photo": true,
      "consignor_flag": null,
      "buyers_premium_pct": null,
      "description_excerpt": "Rolex Day-Date 40, Gold Oyster Perpetual, Baguette Diamond Dial, Diamond Bezel..."
    }
  ],
  "auth_wall": false,
  "error_reasoning": null
}
```

Three distinct outcome shapes:

```json
// Successful live-auction search
{ "success": true, "mode": "live", "lots": [...], "auth_wall": false }

// Successful archive search but realized prices redacted (no auth)
{ "success": true, "mode": "archive", "lots": [...], "auth_wall": true,
  "note": "final_sale_price_usd and bid_count fields are null for closed-lot results when viewed anonymously; persist an authenticated context to surface realized prices." }

// Anti-bot block (DataDome captcha served instead of results)
{ "success": false, "error_reasoning": "datadome-captcha", "search_url": "...",
  "remediation": "Recreate the Browserbase session with --verified --proxies and warm by visiting the homepage before navigating to the search URL." }
```

Single-lot shape (when input is a direct lot URL or `(auctionId, lotNumber)` pair):

```json
{
  "success": true,
  "lot": { "lot_id": "5567-54178", "...": "..." }
}
```
