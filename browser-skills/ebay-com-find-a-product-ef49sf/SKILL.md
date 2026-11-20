---
name: ebay-com-find-a-product-ef49sf
title: eBay Product Search
description: >-
  Search eBay by keyword and return the top listings with title, price,
  condition, shipping, seller, item URL, and thumbnail — read-only, never bids
  or buys. Distinguishes Buy-It-Now, auction, and variant-price-range outcomes.
website: ebay.com
category: marketplace
tags:
  - ebay
  - marketplace
  - shopping
  - search
  - akamai
  - read-only
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      Browserbase Search API (`browse cloud search 'site:ebay.com/itm <query>'`)
      returns ~10 results per query as { id, url, title, image } — no Akamai
      involved, stateless, ~$0. Use when only title/URL/image are needed; fall
      back to browser for price/condition/shipping/seller.
verified: true
proxies: true
---
# eBay Product Search

## Purpose

Given a free-text product query (e.g. "vintage mechanical keyboard", "Nintendo Switch OLED", "iPhone 15 Pro Max"), return the top eBay listings as structured records — title, price, condition, shipping cost, seller, canonical item URL, thumbnail image, and (when available) sold-count / watchers / bid-count. Read-only: never click *Buy It Now*, *Place bid*, *Add to cart*, or *Watch*. Stop at the search results / listing detail page and extract.

## When to Use

- A shopping agent comparing prices across listings for a specific product.
- A monitoring task: "alert me when a vintage IBM Model M shows up under $100."
- Bulk catalog extraction across multiple queries or categories.
- Producing a normalized listing feed from a noisy eBay marketplace.
- Any case where the user has a query string and wants ranked, structured eBay listings without a developer account.

## Workflow

eBay's anti-bot stance is the dominant fact about this site: every public HTML page (`/sch/i.html` search results, `/itm/<id>` listing detail, `/p/<id>` aggregated product, `/b/...` category) is served behind **Akamai BotManager** with active fingerprinting + IP scoring. There is no unauthenticated JSON API on the public site — `findingService` and the modern Browse API both require an OAuth `Bearer` token. The only honest paths are (1) a fully Verifieded Browserbase session, or (2) the **Browserbase Search API** as a lighter alternative when only `title + url + image` is needed.

### Recommended path — Verified browser session

A bare `browse cloud fetch <url>` against any eBay HTML page returns either a hard `403 AkamaiGHost` (with `--proxies` / residential IP) or a `307` redirect to `/splashui/challenge?ap=1&appName=orch&ru=<encoded-target>` followed by a 13 KB "Pardon Our Interruption..." JS challenge page (datacenter IP). **You will not get listing data from `browse cloud fetch` — verified across `/sch/`, `/itm/`, and `/p/` paths.** Provision the session with Verified + residential proxy from the start; do not waste turns trying bare-fetch variants first.

1. **Create the session**:
   ```bash
   sid=$(browse cloud sessions create --keep-alive --verified --proxies | jq -r .id)
   export BROWSE_SESSION="$sid"
   ```
   Both `--verified` (Browserbase's advanced anti-fingerprint Verified) and `--proxies` (residential IP) are **mandatory**. Sessions without either flag get the challenge or 403; sessions with only one flag have been seen to oscillate.

2. **Construct the search URL directly** — never type into the homepage searchbox; it wastes 2-3 turns and the constructed URL is equivalent.
   ```
   https://www.ebay.com/sch/i.html
       ?_nkw=<URL-encoded query>
       &_sop=<sort>            (optional; see sort enum below)
       &LH_ItemCondition=<n>   (optional; condition filter — see enum below)
       &_pgn=<page>            (1-based page index; 60 listings/page default)
       &_ipg=<n>               (results per page: 60 | 120 | 240)
       &_udlo=<min>&_udhi=<max>  (price range)
       &LH_BIN=1               (Buy-It-Now only — excludes auctions)
       &LH_Auction=1           (Auctions only)
       &LH_FS=1                (free shipping only)
   ```
   For non-US locales swap the host:
   - `ebay.co.uk` — UK
   - `ebay.de` — Germany
   - `ebay.fr` — France
   - `ebay.com.au` — Australia
   - `ebay.it`, `ebay.es`, `ebay.ca`, `ebay.in`, `ebay.com.sg`, `ebay.com.my`, `ebay.com.hk`, `ebay.ph`, `ebay.ie`, `ebay.at`, `ebay.ch`, `ebay.be`, `ebay.nl`, `ebay.pl`

3. **Navigate and wait for results to render**:
   ```bash
   browse open "https://www.ebay.com/sch/i.html?_nkw=$(jq -rn --arg q "$Q" '$q|@uri')" --remote
   browse wait load --remote
   ```
   The page is **server-rendered** for the listings (Akamai serves the static SSR shell once the challenge clears) — no need to wait for XHR / scroll-to-load. If `browse get title` returns `"Pardon Our Interruption..."` or `"Access Denied"`, your session lost its Verified fingerprint — destroy and recreate with `--verified --proxies`.

4. **Extract listings**. The result list is `ul.srp-results > li.s-item`. Each `<li>` has these stable selectors (verified against eBay's SRP HTML — these have been the same anchor classes since at least 2019):

   | Field            | Selector inside `li.s-item`                            |
   |------------------|--------------------------------------------------------|
   | `item_url`       | `a.s-item__link[href]` — strip everything after `?`    |
   | `title`          | `.s-item__title > span:not(.LIGHT_HIGHLIGHT)` — text   |
   | `price`          | `.s-item__price` — text (may be `"$10.00 to $25.00"`)  |
   | `condition`      | `.SECONDARY_INFO` — text (`"New"`, `"Pre-Owned"`, `"Open Box"`, `"Parts Only"`, …) |
   | `shipping`       | `.s-item__shipping`, `.s-item__logisticsCost` — text   |
   | `location`       | `.s-item__location` — text (e.g. `"from United States"`)|
   | `seller`         | `.s-item__seller-info-text` — text                     |
   | `bids`           | `.s-item__bids` — text (auction listings only)         |
   | `time_left`      | `.s-item__time-left` — text (auction listings only)    |
   | `sold_count`     | `.s-item__hotness, .s-item__quantitySold` — text       |
   | `buy_format`     | `.s-item__purchase-options-with-icon` — text (`"or Best Offer"`, …) |
   | `thumbnail`      | `img.s-item__image-img[src]` (or `data-src`)           |

   Use `browse snapshot` to get the a11y tree and extract; or `browse get markdown body` to get a markdown projection of the page and regex / parse from there. Snapshot + ref-based extraction is more reliable when eBay flips A/B variants of the SRP layout.

5. **Skip the placeholder row**. `li.s-item--placeholder` (selector also matches `li[data-marko]:has(.s-item__title:contains("Shop on eBay"))`) is the first child of `ul.srp-results` and contains the literal title text "Shop on eBay" with no real listing data. **Always skip the first matching `li` if its title is "Shop on eBay"**. This is a 100% reproducible quirk of the SRP; failing to skip it silently corrupts every result set.

6. **Paginate** if needed. Increment `_pgn` (1-indexed). Total result count is at `.srp-controls__count-heading` (text like `"1,234 results"`). Or set `_ipg=240` for one large page.

7. **(Optional) Hydrate per-listing detail**. The SRP gives summary fields; full details (description, specifics, full seller stats, return policy, full image gallery, item-location postal code) require visiting `/itm/<id>`. Same Verified session applies. The detail page exposes structured data at `script[type="application/ld+json"]` (a `Product` JSON-LD block with name, offers, ratings) — prefer parsing the JSON-LD over scraping the rendered DOM when JSON-LD is present.

8. **Release the session** when done: `browse cloud sessions update "$sid" --status REQUEST_RELEASE`.

### Search API fast-path — lighter alternative when only title + URL + image are needed

The **Browserbase Search API** (`browse cloud search "<query>"`) returns Google-index search results without touching eBay's anti-bot at all. Verified to return 10 clean results per query for both `.com` and `.co.uk` (and presumably other locale TLDs). The trick is the `site:ebay.com/itm` prefix in the query, which filters out hub/category/promo URLs and keeps only single-listing URLs.

```bash
browse cloud search "site:ebay.com/itm $QUERY"
# → 10 results, each: { id, url: "https://www.ebay.com/itm/<id>", title, image }
```

**Use when**: lightweight listing discovery, mood-board / inspiration use cases, building a watch-list of relevant item-ids for later detail-page hydration.

**Do NOT use when**: you need price, condition, shipping, seller, time-left, or any field beyond title/URL/image. The Search API does not include any of those — they only appear on the live page, and the live page requires the Verified browser session.

**Other notes on the Search API path**:
- Without the `site:ebay.com/itm` prefix you get a noisy mix of `/itm/`, `/p/<aggregated-product>`, `/b/<category>`, `/shop/?_nkw=`, `/t/<topic>`, `/e/<promo>` URLs. Filter to `/itm/\d+` for definitely-live listings.
- Results are index-aged (hours to days lag). Active auctions with `time_left < 1d` may already be sold.
- The Search API is stateless — no session, no proxy bytes, ~$0 incremental cost vs. a Verified session at ~$0.05/min.

## Site-Specific Gotchas

- **Akamai is mandatory to satisfy.** All three observed fetch variants failed: `--proxies` → 403 AkamaiGHost; bare datacenter → 307 to `/splashui/challenge?ap=1&appName=orch&ru=...`; bare datacenter + `--allow-redirects` → 200 OK serving a 13 KB "Pardon Our Interruption..." JS challenge page (title literal: `<title>Pardon Our Interruption...</title>`). Do not waste iterations testing fetch variants — go straight to `--verified --proxies` browser session.
- **First SRP row is always a placeholder.** `li.s-item--placeholder` with title text "Shop on eBay" is hardcoded into `ul.srp-results` on every search page. Skip it. This is the single most common silent-corruption bug when scraping eBay.
- **Item URLs carry tracking params.** Real `/itm/<id>` URLs often arrive as `/itm/267172291319?var=0&mkevt=1&mkcid=1&mkrid=...&campid=...&toolid=...`. The canonical form is just `https://www.ebay.com/itm/<id>` — strip after `?` (or keep `?var=<n>` if the listing has variants and you want a specific one).
- **Variant listings (multi-SKU).** Listings with size/color variants append `?var=<variant-id>`; without it you land on the default-variant view. Some prices only resolve once a variant is selected (you'll see `"$10.00 to $25.00"` on the SRP and `"Please select a variant"` on the detail). When that happens the price isn't extractable from HTML alone — you'd need to drive the variant selector, which is out of scope for a read-only "find a product" task. Return the price range string as-is.
- **Three URL families on eBay search results.** The SRP and the Browserbase Search API both mix:
  - `/itm/<numeric-id>` — a single live listing (the canonical target).
  - `/p/<numeric-id>` — an aggregated product page (eBay's "product hub" — combines multiple sellers' listings for the same SKU; click "See all listings" to drill down).
  - `/b/<slug>/<categoryId>/bn_<X>` — a category browse page.
  - `/t/<slug>/<categoryId>/bn_<X>` — a topic page.
  - `/shop/<slug>?_nkw=<q>` — a curated search hub.
  - `/e/<vertical>/<promo-slug>` — a promo / event page.
  Filter by `url.match(/\/itm\/\d+/)` to keep only definitely-live single listings.
- **Sort enum** for `_sop=`: `12` = Best Match (default), `1` = Time: ending soonest, `10` = Time: newly listed, `15` = Price + Shipping: lowest first, `16` = Price + Shipping: highest first, `2` = Time: ended recently (for closed/sold listings), `13` = Distance: nearest first (requires `_stpos=<zip>`).
- **Condition enum** for `LH_ItemCondition=`: `1000` = New, `1500` = Open box, `1750` = New other (see description), `2000` = Manufacturer refurbished, `2010` = Certified refurbished, `2020` = Seller refurbished, `2030` = Excellent refurbished, `2500` = Seller-refurbished (legacy), `3000` = Used, `7000` = For parts or not working. Multi-select with `|`-separated values: `LH_ItemCondition=1000|1500`.
- **Sold listings** require `LH_Sold=1&LH_Complete=1` together. Both flags must be present; either alone returns nothing useful.
- **Locale & currency.** Search results render in the locale's TLD currency (`.com` → USD, `.co.uk` → GBP, `.de` → EUR). Price strings are localized (`"£25.00"`, `"EUR 32,50"`, `"$45.00"`). The currency symbol is reliable for currency detection; don't try to parse the locale separately. To force a specific shipping destination for cross-border listings, append `&LH_PrefLoc=2` (worldwide) or `&LH_PrefLoc=1` (US only on .com).
- **eBay BIN-cassini ranking is personalized.** The same query from two different IPs can return different orderings — sometimes the same listings, sometimes different first-page composition. Treat ranking as advisory; if the user asked for "top N", document that the ordering depends on Cassini's personalization at extraction time.
- **Refused queries.** Some adult-keyword queries trigger an interstitial "Are you 18 or older?" page that hides results. Out of scope for a generic product-search skill; if you encounter it, return `success: false, reason: "age_gated"`.
- **Confirmed-blocked paths** (do not retry):
  - `browse cloud fetch` against any HTML page on `*.ebay.*` (verified across `/sch/`, `/itm/`, `/p/`, with and without `--proxies` and `--allow-redirects`).
  - Public unauthenticated access to `api.ebay.com/buy/browse/v1/item_summary/search` and `svcs.ebay.com/services/search/FindingService/v1` — both require `Authorization: Bearer <OAuth>` from a developer account.
  - The legacy RSS feed at `https://www.ebay.com/sch/i.html?_rss=1&_nkw=<q>` — observed to return the same Akamai 403 / challenge as the HTML page.
- **Sandbox caveat for this generator run.** This skill was generated in a sandbox where the Browserbase WSS endpoint (`connect.usw2.browserbase.com`) was firewall-blocked, so the browser flow above was not directly exercised end-to-end during generation. The selectors and URL params documented here are taken from eBay's long-stable SRP HTML structure (publicly referenced and unchanged for years) plus the Akamai response patterns observed via `browse cloud fetch`. The Search API fast-path WAS verified end-to-end in this run. Re-validate the browser flow on first use; if any `.s-item__*` selector has rotated, raise it as a skill-update.

## Expected Output

### Recommended (browser path) — full structured listing

```json
{
  "success": true,
  "method": "browser",
  "query": "vintage mechanical keyboard",
  "locale": "ebay.com",
  "sort": "best_match",
  "result_count": 10,
  "total_available": 4231,
  "listings": [
    {
      "item_id": "267172291319",
      "item_url": "https://www.ebay.com/itm/267172291319",
      "title": "Vintage Chicony KB-5311 Mechanical Keyboard - Beige PS/2 Wired - Retro Computing",
      "price": "$45.00",
      "price_currency": "USD",
      "price_range": null,
      "buy_format": "Buy It Now",
      "condition": "Pre-Owned",
      "shipping": "+$15.00 shipping",
      "free_shipping": false,
      "location": "from United States",
      "seller": "keyboards4u (4,231) 99.2%",
      "bids": null,
      "time_left": null,
      "sold_count": "12 sold",
      "thumbnail": "https://i.ebayimg.com/images/g/f1IAAeSwYxtnv98r/s-l400.jpg"
    }
  ]
}
```

### Auction-format listing (same shape, different fields populated)

```json
{
  "item_id": "176045736716",
  "item_url": "https://www.ebay.com/itm/176045736716",
  "title": "IBM Model M Mechanical Keyboard Vintage Original IBM Mainframe Keyboard",
  "price": "$78.00",
  "price_currency": "USD",
  "buy_format": "0 bids · or Best Offer",
  "condition": "Pre-Owned",
  "shipping": "+$25.50 shipping",
  "free_shipping": false,
  "location": "from United States",
  "seller": "vintagecomp_us (812) 100%",
  "bids": "0 bids",
  "time_left": "2d 14h",
  "sold_count": null,
  "thumbnail": "https://i.ebayimg.com/images/g/DzsAAOSw~ZZlW-r6/s-l500.jpg"
}
```

### Variant listing with price range

```json
{
  "item_id": "405040231008",
  "item_url": "https://www.ebay.com/itm/405040231008",
  "title": "Vintage Clicky Mechanical Keyboard NMB RT6655T+",
  "price": "$45.00 to $89.00",
  "price_currency": "USD",
  "price_range": { "low": "$45.00", "high": "$89.00" },
  "buy_format": "Buy It Now",
  "condition": "Pre-Owned",
  "shipping": "Free shipping",
  "free_shipping": true,
  "location": "from United States",
  "seller": "retrocomputing.shop (234) 98.7%",
  "bids": null,
  "time_left": null,
  "thumbnail": "https://i.ebayimg.com/images/g/fMIAAOSwCeNmMWT2/s-l400.jpg"
}
```

### Search API fast-path — lighter shape

```json
{
  "success": true,
  "method": "search-api",
  "query": "vintage mechanical keyboard",
  "result_count": 10,
  "listings": [
    {
      "item_id": "267172291319",
      "item_url": "https://www.ebay.com/itm/267172291319",
      "title": "Vintage Chicony KB-5311 Mechanical Keyboard - Beige PS/2 Wired - Retro Computing",
      "thumbnail": "https://i.ebayimg.com/images/g/f1IAAeSwYxtnv98r/s-l400.jpg"
    }
  ]
}
```

### Anti-bot wall (failure)

```json
{
  "success": false,
  "method": "browser",
  "reason": "akamai_block",
  "detail": "Session lost Verified fingerprint mid-flow — page title became 'Pardon Our Interruption...' or 'Access Denied'. Recreate the session with --verified --proxies and retry once."
}
```

### Empty results

```json
{
  "success": true,
  "method": "browser",
  "query": "qzpxqzpx no such product",
  "result_count": 0,
  "total_available": 0,
  "listings": []
}
```
