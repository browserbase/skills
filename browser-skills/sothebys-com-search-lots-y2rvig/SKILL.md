---
name: sothebys-com-search-lots-y2rvig
title: Sotheby's Search Lots
description: >-
  Search Sotheby's auction catalog (upcoming, live, and past) across the full
  filter surface — department, sale type, sale status, estimate range, artist,
  year, medium, location, lot characteristics — and return structured lot + sale
  JSON. Handles direct sale URLs and direct lot URLs. Read-only.
website: sothebys.com
category: auctions
tags: []
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: api
alternative_methods:
  - method: api
    rationale: >-
      Sotheby's catalog is backed by a public Algolia index (app KAR1UEUPJD,
      indices prod_lots and prod_product_items) reachable with a search-only key
      harvested from any /en/buy/* page's __NEXT_DATA__. Lot detail enrichment
      (description, provenance, literature, images, sold state) is available via
      the federated GraphQL gateway at clientapi.prod.sothelabs.com/graphql — no
      auth, no anti-bot. The browser path renders the same data ~100× slower.
  - method: browser
    rationale: >-
      Fallback only. Browserbase session with --verified + --proxies drives the
      JS-rendered grid when the API path is unreachable. No anti-bot wall
      observed in iteration; the cost premium is the only reason this isn't the
      recommended path.
verified: true
proxies: true
---
# Sotheby's Search Lots

## Purpose

Search Sotheby's auction catalog — upcoming, live, and past — across the full filter surface their public site exposes (category/department, sale type, sale status, estimate range, artist/maker, year, medium, region, lot characteristics, sort order, pagination) and return matching lots as structured JSON, plus the parent sale's metadata. Also handles direct sale-URL and direct lot-URL inputs (skipping search). Read-only — never bids, watches, or signs in.

## When to Use

- Catalog-wide artist / brand monitoring ("any Basquiat coming up at Sotheby's", "every Rolex Daytona in the watches calendar").
- Department or location browse ("all upcoming Wine sales in Hong Kong", "Modern Evening sales in NY this season").
- A user-supplied search URL or sale URL — pipe straight through to lot extraction.
- A user-supplied lot URL — fetch the single lot and skip search entirely.
- Bulk pull of a sale's full lot list for analysis (price-band coverage, consignor patterns, etc.).
- Cross-sale comparison of past hammer results for a creator (subject to result-hiding gotcha below).

## Workflow

Sotheby's catalog is a Next.js front end backed by **Algolia** (search/listing) plus a **federated GraphQL gateway** (lot detail, live bid state, image renditions). Both are reachable without authentication. The Algolia search-only API key rotates per page-load — harvest it from any catalog page's `__NEXT_DATA__` script tag and reuse for ~3.8 hours. The browser path is significantly slower (the search/buy pages are 100% client-rendered, so `snapshot`-based extraction is one DOM round-trip per lot) and the API path returns the same data the rendered page would. Lead with API.

**Endpoints in this skill**:
- Algolia search: `https://KAR1UEUPJD-dsn.algolia.net/1/indexes/{indexName}` (GET or POST)
- GraphQL gateway: `https://clientapi.prod.sothelabs.com/graphql` (GET with `query=` + `variables=`, or POST JSON; no auth)
- Canonical web pages: `https://www.sothebys.com{slug}` — `slug` field on each Algolia hit is the lot detail path

### 1. Harvest a search-only Algolia key

The key is embedded in every Sotheby's catalog page under `<script id="__NEXT_DATA__">`. Two surfaces give two different scopes:

| Page | Page type | `pageProps.algoliaSearchKey` scope | Use for |
|---|---|---|---|
| `/en/buy/auction/{year}/{sale-slug}` | `/AuctionDetailPageNext` | Locked to that sale's `auctionId` via embedded filter | Single-sale lot list |
| `/en/buy/fashion/handbag`, `/en/buy/luxury/jewelry`, any `/en/buy/{category}/{subcat}` browse page | `/BrowsePage` | Catalog-wide (no `auctionId` lock) | Cross-sale search |

For most user intents (artist search, department browse, location filter, past-results) **use the broad key from a browse page** (`/en/buy/fashion/handbag` is a reliable harvest source). For a user-supplied sale URL, harvest from that page directly.

```bash
# Harvest the broad key
HTML=$(browse cloud fetch "https://www.sothebys.com/en/buy/fashion/handbag" --proxies --allow-redirects | jq -r .content)
KEY=$(echo "$HTML" | python3 -c "
import sys, re, json
m = re.search(r'<script[^>]*id=\"__NEXT_DATA__\"[^>]*>(.+?)</script>', sys.stdin.read(), re.DOTALL)
print(json.loads(m.group(1))['props']['pageProps']['algoliaSearchKey'])
")
# Constant for the foreseeable future:
APP_ID=KAR1UEUPJD
```

The key is base64-encoded; when decoded it carries `validUntil=<epoch>` (~3.8h from issuance) plus a `restrictIndices` list plus a hard-coded `filters` prefix (e.g. `NOT state:Created AND NOT isHidden:true ...`). Don't try to forge or modify it — Algolia signs the inner payload. Just harvest and pass through.

### 2. Map user filter inputs to Algolia params

Hit `prod_lots` for auction lots (947k records across history + upcoming), `prod_product_items` for the Buy-Now / Marketplace surface. The prompt's filter surface maps as:

| User filter | Algolia mechanism | Example |
|---|---|---|
| Free-text query | `query=<urlenc>` | `query=basquiat` |
| Department (one or many) | `facetFilters=[["departments:Contemporary Art","departments:Modern Art"]]` (inner array is OR) | see below |
| Object type / medium | `facetFilters=[["objectTypes:Painting"]]` | |
| Sale type (Live vs Online/Timed) | `facetFilters=[["auctionType:Live"]]` or `auctionType:Timed` | |
| Sale status — **upcoming** | `facetFilters=[["auctionState:PUBLISHED"]]` | |
| Sale status — **currently biddable** | `facetFilters=[["auctionState:OPENED","auctionState:CLOSING"]]` | |
| Sale status — **past results** | `facetFilters=[["auctionState:LIVE","auctionState:CLOSED"]]` (see state-semantics gotcha) | |
| Specific sale | `facetFilters=[["auctionId:<uuid>"]]` or `["auctionName:<exact>"]` | |
| Sale location | `facetFilters=[["auctionLocation:New York","auctionLocation:London"]]` | |
| Estimate range (low/high) | `numericFilters=["lowEstimate>=100000","highEstimate<=5000000"]` | |
| Year / vintage | `numericFilters=["Year>=1960","Year<=1990"]` or `Wine.Vintage`, `Spirit.Vintage` | |
| Artist / maker / brand | `facetFilters=[["creators:Jean-Michel Basquiat"]]` (exact match against curated taxonomy) | |
| Withdrawn yes/no | `facetFilters=[["withdrawn:false"]]` (recommend always) | |
| Collection / single-owner sale | `facetFilters=[["collection:A Legacy of Beauty: The Collection of Sydell Miller"]]` | |
| Sort: estimate low→high | hit replica index `prod_lots_lowEstimate_asc` (and `_desc`, `_price_asc`, etc.) — discover replica names from `renderingContent.facetOrdering` or the page's `__NEXT_DATA__.props.pageProps.indexName` for the active sort | |
| Pagination | `hitsPerPage=<1-100>&page=<0..nbPages-1>` | |

**Example** — Contemporary or Modern Art, upcoming, $100k–$5M, page 0:

```bash
APP_ID=KAR1UEUPJD
FF=$(python3 -c '
import urllib.parse, json
print(urllib.parse.quote(json.dumps([
    ["departments:Contemporary Art","departments:Modern Art"],
    ["auctionState:PUBLISHED"],
    ["withdrawn:false"]
])))')
NF=$(python3 -c '
import urllib.parse, json
print(urllib.parse.quote(json.dumps(["lowEstimate>=100000","highEstimate<=5000000"])))')
URL_KEY=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$KEY")
URL="https://${APP_ID}-dsn.algolia.net/1/indexes/prod_lots?query=&hitsPerPage=48&page=0&facetFilters=$FF&numericFilters=$NF&x-algolia-application-id=$APP_ID&x-algolia-api-key=$URL_KEY"
browse cloud fetch "$URL" --proxies
```

For the **marketplace** surface (Buy Now / Bid Now / Private Sale), swap index to `prod_product_items` and use these facets instead: `waysToBuy` (`buyNow|bid|private`), `salesChannel`, `categories.lvl0`, `categories.lvl1`, `Handbag Type`, `Brand`, etc. (Algolia returns the full facet menu via `facets=["*"]`.) The harvested broad key works against both indices.

### 3. Decode each Algolia hit (`prod_lots`)

Each hit on `prod_lots` is a flat JSON object. The fields you need:

| Output field | Algolia field | Notes |
|---|---|---|
| `lot_id` | `objectID` | UUID |
| `lot_number` | `lotDisplayNumber` (string) or `lotNr` (int) | Use `lotDisplayNumber` for display — handles `"1A"`, `"R1"`, etc. |
| `title` | `title` (also `titleLocalized.{lang}` for i18n) | |
| `artist_or_maker` | `creatorsDisplayTitle` (already pre-formatted) or `creators[]` | `creators` is the OR-facetable curated artist taxonomy |
| `category` / `department` | `departments[]` | First element is primary |
| `medium` / `object_type` | `objectTypes[]` (e.g. `Painting`, `Watch`, `Wine`) | Always includes `"All"` as a wildcard entry |
| `currency` | `currency` | ISO 4217 (`USD`, `GBP`, `EUR`, `HKD`, `CHF`) |
| `low_estimate` / `high_estimate` | `lowEstimate`, `highEstimate` (integer in `currency` units) | If `estimateUponRequest: true`, both may be missing — surface `"Estimate upon request"` |
| `current_bid_or_hammer` | `price` (integer, often **null** — see gotcha) | Hammer prices are not in the search index; query GraphQL for sold/visible state |
| `withdrawn` | `withdrawn` (bool) | |
| `lot_state` | `lotState` (`Published`, `Opened`, `Closed`, `ReOpenable`, `ConfirmSaleResult`) | |
| `sale_id` | `auctionId` | UUID |
| `sale_name` | `auctionName` | |
| `sale_location` | `auctionLocation` | `New York`, `London`, `Paris`, `Hong Kong`, `Geneva`, `Milan`, `Cologne`, `Singapore`, `Zurich`, `Riyadh`, `Shanghai Auction`, `Dubai`, `Abu Dhabi` |
| `sale_type` | `auctionType` (`Live` or `Timed`) | `Live` = live auctioneer-driven; `Timed` = online timed auction |
| `sale_status` | `auctionState` | `PUBLISHED` / `OPENED` / `CLOSING` / `LIVE` / `CLOSED` — see state-semantics gotcha |
| `sale_date` | `auctionDate` (ISO 8601, e.g. `2026-05-19T23:00Z`) | |
| `collection` / `consignor` | `collection` | E.g. `"The Mo Ostin Collection"` |
| `lot_url` | `"https://www.sothebys.com" + slug` | `slug` is the relative path |
| `consignment_external_id` | `consignmentPropertyExternalId` | E.g. `"9FV75"` — appears in image filenames |
| `signed` / `dated` / `period` / `region` / `materials` / etc. | Top-level dynamic attribute keys: `Signed`, `Year Circa`, `Period - Specific`, `Region`, `Materials`, `Country`, `Carat`, `Diamond.Carat`, `Movement Number`, etc. | Per-department schemas; check `facets_stats` for numeric attrs |

Discover the full per-department attribute set on demand:
```
GET .../1/indexes/prod_lots?query=&hitsPerPage=0&facets=%5B%22*%22%5D&facetFilters=%5B%5B%22departments%3AWatches%22%5D%5D
```
Returns `facets` (every distinct value with hit-count) and `facets_stats` (min/max/avg/sum for every numeric attribute scoped to that department).

### 4. Enrich a lot with description / provenance / images via GraphQL

The Algolia hit does **not** include the catalogue description, dimensions, signature line, provenance, exhibition history, literature, full image renditions, condition-report disclaimers, or the realized hammer/premium price. Those live on the lot detail page's Apollo cache, served by the GraphQL gateway. Query:

```graphql
query GetLot($lotId: String!) {
  lotV2(lotId: $lotId, countryOfOrigin: "US", language: ENGLISH) {
    ... on LotV2 {
      lotId
      title
      subtitle
      description           # HTML with medium/dimensions/signature/date block
      provenance            # HTML, <br>-separated
      literature            # HTML
      exhibition            # HTML
      creatorsDisplayTitle
      estimateV2 {
        ... on LowHighEstimateV2 {
          lowEstimate { amount currency }
          highEstimate { amount currency }
        }
      }
      lotNumber {
        __typename
        ... on VisibleLotNumber { lotDisplayNumber }
      }
      withdrawnState { state }       # NotAffected | Withdrawn | Passed | ...
      bidState {
        __typename
        closingTime
        sold {
          __typename                  # ResultHidden when price is suppressed
          ... on ResultVisible { __typename }  # query specific fields when surfaced
        }
      }
      media(imageSizes: [Large, Medium, Small, ExtraLarge, ExtraExtraLarge]) {
        images {
          title
          renditions { width height url imageSize }
        }
      }
    }
  }
}
```

Send via GET:
```
https://clientapi.prod.sothelabs.com/graphql?query=<urlenc-query>&variables=<urlenc-{"lotId":"..."}>
```

Or POST `application/json` with `{query, variables}`. Both work, no auth, no cookies.

`media.images[i].renditions[j].url` is a Brightspot CDN URL with size variants (`Small` ~385px, `Medium` ~800px, `Large` ~1024px, `ExtraLarge` ~2048px). Pick `Large` for typical use; pick `ExtraExtraLarge` only when zoom matters.

### 5. Branch on input shape

- **Direct lot URL** (`/en/buy/auction/.../lot.<n>` or `/en/buy/auction/{year}/{sale}/{lot-slug}`) → fetch the page, pull `lotId` + `auctionId` from `__NEXT_DATA__.query`, GraphQL `lotV2` for the full record. Skip Algolia entirely.
- **Direct sale URL** (`/en/buy/auction/{year}/{sale-slug}`) → harvest the **sale-scoped** Algolia key from that page, then page through `prod_lots` (filter is pre-applied). `algoliaJson` in `pageProps` is the *first* page of results — reuse rather than re-fetching it.
- **Search URL with query params** → forward query params; harvest a broad key from `/en/buy/fashion/handbag` for the actual search.
- **Department / keyword input** → broad key + facetFilters as in step 2.

### 6. Sale-level metadata

To return sale-level fields (sale title, type, location, opening/closing datetimes, total-lot count, sale department, canonical URL) without a separate query, every Algolia lot hit carries `auctionId`, `auctionName`, `auctionLocation`, `auctionType`, `auctionState`, `auctionDate`, `departments[]`. To get **total lot count** for a sale, run a same-query Algolia call with `hitsPerPage=0&facetFilters=[["auctionId:<uuid>"]]` and read `nbHits`. Sale canonical URL: extract from any lot's `slug` field by trimming the last path segment (the slug for `pair-of-carcasse-chenets` lives under `/en/buy/auction/2026/modern-evening-auction/`, so the sale URL is `https://www.sothebys.com/en/buy/auction/2026/modern-evening-auction`).

### Browser fallback

When the Algolia or GraphQL endpoints are unreachable (rare — no known anti-bot today, no auth requirements observed), drive the rendered catalog page through Browserbase with stealth:

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies | jq -r '.id')
browse open "https://www.sothebys.com/en/buy/auction/2026/modern-evening-auction" --remote --session "$SID"
browse get markdown body --remote --session "$SID"     # extract lot grid as markdown
# Per-lot URLs are anchors of the form /en/buy/auction/{year}/{sale-slug}/{lot-slug}.
# Note: each click-into-lot costs ~3 turns; prefer the API path.
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

The browser path is ~100× slower than the API path on a 48-lot page (one HTTP round-trip vs. one page render + per-lot expansion).

## Site-Specific Gotchas

- **`auctionState` has 5 values with non-obvious semantics**. From a 947k-lot index sample: `PUBLISHED` (8k) = upcoming, lots not yet open for bidding. `OPENED` (77k) = currently biddable (Timed or Live in their open window). `CLOSING` (15k) = timed auction in its final-hour wind-down. `LIVE` (317k) = lots from completed live-auctioneer sales (past results). `CLOSED` (521k) = lots from completed timed auctions / older live sales (past results). **For "upcoming," filter `PUBLISHED`. For "currently biddable now," filter `OPENED OR CLOSING`. For "past results," filter `LIVE OR CLOSED`.** Do **not** assume `LIVE` means "live right now" — it does not. When in doubt, cross-check against `auctionDate` vs current epoch.
- **Hammer prices are not in the Algolia search index** (`price` is null on virtually every CLOSED lot — 520k samples). For each past lot whose hammer the user wants, query `lotV2(lotId).bidState.sold` over GraphQL. The result is a union: `ResultHidden` means Sotheby's has not authorized publication (very common — many lots default to hidden, especially modern/contemporary) and there is **no public surface** for that price short of a Sotheby's account; `ResultVisible` carries the realized hammer + buyer's premium. **If many lots in a result set return `ResultHidden`, surface that to the user honestly — don't guess or infer from estimate.** This is the "registration wall" the task description hints at; account-walled price-history is a confirmed limitation, not a workaround opportunity.
- **Test / QA / staging records leak into the production Algolia index**. Names containing `"TEST"`, `"(COPY)"`, `"QA "`, `"IT Test"`, `"Test Sale"`, `"Clerk Test"`, `"TEST (ignore)"`, `"MH 05162023 (Test)"`, etc. are real records that satisfy `NOT isTestRecord:1 AND NOT state:Created` because Sotheby's flags don't always cover them. **Add a client-side regex filter for `auctionName` matching `/\b(TEST|COPY|QA|Clerk Test|10\.24 TEST|MH 0\d)\b/i`** and drop those hits. The base count is reduced by ~5-15% after this filter (e.g., 333 → ~300 on the Contemporary Art upcoming sample).
- **Algolia search key rotates per page-load with `validUntil` ≈ now + 3.8 hours**. Harvested keys are stable for that window; if you're caching, expire at `validUntil` and re-harvest. The application ID `KAR1UEUPJD` and the index name `prod_lots` (also `prod_product_items` for marketplace) are stable.
- **The key from a sale-detail page is locked to that `auctionId`** by an embedded filter (e.g. `... AND auctionId:c11be70d-... AND ...`). Catalog-wide searches will silently return only that auction's lots. Use a key harvested from a `/BrowsePage` page (e.g., `/en/buy/fashion/handbag`) for cross-sale work.
- **Facet OR vs AND**: Algolia `facetFilters=[[A,B],[C]]` is `(A OR B) AND C`. Multiple departments / locations / types go in the *inner* array; cross-dimension AND goes in the *outer* array. Getting this inverted is the most common silent-failure mode.
- **`objectTypes` always includes the sentinel `"All"`** alongside the real type (`"Painting"`, `"Watch"`, etc.). When filtering, use the real type — don't include `"All"` in the filter.
- **GraphQL introspection is disabled** (Cosmo Router). You cannot `__type` or `__schema` the gateway. Field discovery is via observing `__NEXT_DATA__.props.pageProps.apolloCache` on a real page — that cache holds the exact subset the front end uses. Use those typenames and fragments verbatim.
- **GraphQL is federated and the same field name can have different return types on sibling types**. Specifically: `LotV2.slug` is an `AuctionSlug`-bearing object (`{auctionSlug{name year} lotSlug}`); `Auction.slug` is a `String!` scalar (was an `AuctionSlug` object on `AuctionCard` in older cache). Adding a subselection on the wrong one returns the misleading error `Field "slug" must not have a selection since type "String!" has no subfields.` even though *another* `slug` field in the same query requires one. Easiest fix: omit `auction.slug` from queries — `auction.slug` is just `name + "/" + year` if you need it; the lot's own `slug` plus the auction's `title` is enough.
- **`/bsp-api/*` is disallowed in robots.txt** and the one observed endpoint (`/bsp-api/lot/details?itemId=<uuid>`) returns an HTML widget page, not JSON. Don't waste time on `bsp-api` as a data source.
- **`/en/results` is the legacy AEM (Adobe Experience Manager) past-results page**, *not* Next.js — it has no `__NEXT_DATA__` and no embedded Algolia key. Don't harvest from `/en/results`; harvest from a `/en/buy/*` browse page instead.
- **`/en/auctions`, `/en/auctions/upcoming`, `/en/buy/auction`, `/en/buy/now` all return 404** (despite serving full HTML). Don't use them as entry points. Valid catalog entry points: `/en/calendar`, `/en/results`, `/en/buy/{cat}/{subcat}` (e.g., `/en/buy/fashion/handbag`, `/en/buy/luxury/jewelry`), and specific sale URLs `/en/buy/auction/{year}/{sale-slug}`.
- **Many high-value live auctions carry both an English and a Chinese description block** concatenated in the `description` HTML. The split is a literal `---...---` divider line. Parse and keep only the English portion when emitting `lot_description`, or expose both as `description_en` + `description_zh`.
- **`HiddenLotNumber` vs `VisibleLotNumber`**: For Premium / private-treaty lots, `lotNumber.__typename === "HiddenLotNumber"` and there's no `lotDisplayNumber`. Don't error — surface as `lot_number: null` and add a `premium: true` flag.
- **Lot images are CDN-side cropped + resized** via Brightspot URL params (`/dims4/default/.../crop/.../resize/.../...`). The URL embeds the crop spec — don't try to template it. Pick a rendition by `imageSize` and pass through.
- **Read-only enforcement**: skip every "Register to Bid", "Place Bid", "Buy Now", "Make Offer", "Watch Lot", "Sign In", "Subscribe" control on the rendered pages. None of those have any analog on the API path; the API path is read-only by construction.

## Expected Output

```json
{
  "input": {
    "query": "basquiat",
    "department": "Contemporary Art",
    "sale_status": "past",
    "min_estimate_usd": 1000000,
    "page": 0,
    "hits_per_page": 48
  },
  "total_results": 131,
  "page": 0,
  "total_pages": 3,
  "lots": [
    {
      "lot_id": "475ab55a-95dd-4ede-b86a-79cf6bfb5493",
      "lot_number": "4",
      "title": "Moon View",
      "subtitle": null,
      "artist_or_maker": "Jean-Michel Basquiat",
      "artist_dates": "1960 - 1988",
      "categories": ["Contemporary Art"],
      "object_types": ["Painting"],
      "currency": "USD",
      "low_estimate": 7000000,
      "high_estimate": 10000000,
      "estimate_upon_request": false,
      "current_bid_or_hammer": null,
      "sold": null,
      "sold_with_premium": null,
      "buyers_premium_pct": null,
      "result_status": "ResultHidden",
      "withdrawn": false,
      "withdrawn_state": "NotAffected",
      "lot_state": "Closed",
      "description": "<p>signed, titled and dated <em>1984</em> (on the reverse)</p><p>acrylic, colored Xerox paper collage and oilstick on canvas</p><p>66 by 60 ¼ in. 167.6 by 153 cm.</p>",
      "provenance": "Larry Gagosian Gallery, New York<br/>The Broad Art Foundation (acquired from the above in 1984)<br/>...",
      "literature": "Galerie Enrico Navarra, et al., <em>Jean-Michel Basquiat</em>, ...",
      "exhibition": "Arizona, Phoenix Art Museum, <em>American Art of the 1980s</em>, 1986, no. 2, n.p.; ...",
      "condition_report_available": true,
      "collection": "The Mo Ostin Collection",
      "primary_image_url": "https://sothebys-md.brightspotcdn.com/dims4/default/.../resize/1024x1111!/quality/90/?url=...n11332-b43vx-t1-01a-new.jpg",
      "additional_image_urls": [],
      "lot_url": "https://www.sothebys.com/en/buy/auction/2023/the-mo-ostin-collection-evening-auction/moon-view-2",
      "sale": {
        "sale_id": "8bbd4ef4-f194-462b-b8c2-66ba86a9558e",
        "sale_title": "The Mo Ostin Collection Evening Auction",
        "sale_type": "Live",
        "sale_status": "CLOSED",
        "sale_location": "New York",
        "sale_date": "2023-05-16T22:00Z",
        "sale_departments": ["Contemporary Art"],
        "sale_url": "https://www.sothebys.com/en/buy/auction/2023/the-mo-ostin-collection-evening-auction"
      }
    }
  ]
}
```

Variant shapes by sale status:

```json
// Upcoming (PUBLISHED) — current_bid_or_hammer is the starting bid or null
{ "current_bid_or_hammer": 5000000, "sold": null, "result_status": null, "sale": {"sale_status": "PUBLISHED"} }

// Currently biddable (OPENED / CLOSING) — current_bid_or_hammer is latest bid via GraphQL bidState.latestBid
{ "current_bid_or_hammer": 6200000, "sold": null, "result_status": null, "sale": {"sale_status": "OPENED"} }

// Past with visible result
{ "current_bid_or_hammer": 8500000, "sold": true, "sold_with_premium": 10125000, "result_status": "ResultVisible", "sale": {"sale_status": "CLOSED"} }

// Past with hidden result (registration wall)
{ "current_bid_or_hammer": null, "sold": null, "result_status": "ResultHidden", "sale": {"sale_status": "CLOSED"} }

// Withdrawn
{ "withdrawn": true, "withdrawn_state": "Withdrawn", "current_bid_or_hammer": null }

// Direct lot URL input — single-object response (no `lots[]` envelope)
{ "lot_id": "...", "title": "...", "sale": {...}, ... }

// Sale URL input — `lots[]` for the sale plus `sale` envelope
{ "sale": {...}, "total_results": 45, "lots": [...] }
```
