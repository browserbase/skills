---
name: ebay-com-search-products-i9m1v2
title: eBay Search Products
description: >-
  Search eBay's consumer site for listings matching a keyword query (with
  category, condition, price, location, format, and sort filters) and return
  them as structured JSON. Supports the Sold + Completed cross-section for comp
  pricing. Read-only.
website: ebay.com
category: marketplace
tags:
  - marketplace
  - listings
  - search
  - ebay
  - akamai
  - comp-pricing
source: 'browserbase: agent-runtime 2026-05-16'
updated: '2026-05-16'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      eBay's official Browse API
      (api.ebay.com/buy/browse/v1/item_summary/search) is the cleanest data path
      but is gated behind the eBay Developer Program's production-app approval —
      most agents will not have a Bearer token. Lead with the API only when
      approved credentials are available.
  - method: browser
    rationale: >-
      Consumer SRP at /sch/i.html is the always-available surface. The new
      .s-card DOM renders mostly server-side with stable selectors. Mandatory:
      --verified --proxies, plus a retry-on-403 loop (~40-60% of fresh
      sessions get Akamai-blocked on first navigation).
verified: true
proxies: true
---
# eBay Search Products

## Purpose

Search eBay's consumer site for listings matching a keyword query (with optional category, condition, price, location, format, and sort filters) and return the matching results as structured JSON — title, item ID, condition, listing format, price, shipping, location, seller, watchers, sold/sold-date (in Sold mode), and canonical `/itm/{itemId}` URL per listing, plus the page-wide result count and active-filter chips. Also supports the **Sold/Completed** cross-section for comp pricing. **Read-only — never click Buy It Now, Place Bid, Make Offer, Add to Watchlist, Add to Cart, or Sign In.**

## When to Use

- "Find listings for `<query>`" — keyword search across the whole site or scoped to a category.
- Comp-pricing research — "what did `<query>` recently sell for on eBay?" (Sold + Completed mode).
- Auction monitoring — "what auctions for `<query>` end in the next hour?" (`LH_Auction=1&_sop=1`).
- Inventory checks for resellers — "any new Top Rated Plus listings of `<query>` posted in the last day?" (`_sop=10&LH_TopRatedPlus=1`).
- Batch item-ID lookup — when given a list of itemIds, hit `/itm/{itemId}` directly (browser fallback below).
- Anywhere you'd otherwise want eBay's official **Browse API** but lack production-app approval (it's partner-gated — see Gotchas).

## Workflow

eBay's **Browse API** (`api.ebay.com/buy/browse/v1/item_summary/search`) is the cleanest data path but is gated behind the eBay Developer Program's production-approval workflow — most agents will not have a Bearer token. The pragmatic, always-available surface is the consumer SRP at `https://www.ebay.com/sch/i.html`, which renders mostly as server-rendered HTML in the new `.s-card` layout. **Lead with browser scraping. Mention the Browse API only if your environment has approved credentials.**

eBay is fronted by Akamai. **A bare HTTP fetch is unusable** — `browse cloud fetch` (no proxy) is redirected to `/splashui/challenge` (Akamai JS interstitial), and `browse cloud fetch --proxies` returns `403 Access Denied` from `errors.edgesuite.net`. You need a real Chrome session with **`--verified --proxies`**. Even with both flags, 40–60% of fresh Browserbase sessions land on the static `Access Denied` page on first navigation — **plan for retries on 403** (see Gotchas).

### 1. Build the search URL

Always assemble URL parameters explicitly rather than relying on the page UI. The parameter surface (verified during this skill's development against the live site):

| Parameter | Meaning |
|---|---|
| `_nkw=<query>` | Keyword query (URL-encoded; `+` for spaces). The only required field. |
| `_sacat=<id>` | Category leaf id (e.g. `183454` = CCG Individual Cards, `9355` = Cell Phones & Smartphones). Maps to eBay's nested taxonomy. |
| `LH_ItemCondition=<code>` | `1000`=New, `1500`=New other, `1750`=New with defects, `2000`=Manufacturer refurbished, `2010`=Certified refurbished, `2020`=Excellent refurb, `2030`=Very Good refurb, `2500`=Seller refurbished, `3000`=Used, `4000`=Very Good (books/media), `5000`=Good, `6000`=Acceptable, `7000`=For parts or not working. Comma-separate for unions (e.g. `1000\|1500`). |
| `LH_BIN=1` | Buy It Now only |
| `LH_Auction=1` | Auction only |
| `LH_BO=1` | Best Offer enabled |
| `LH_FS=1` | Free shipping |
| `LH_Sold=1&LH_Complete=1` | **Sold + Completed** — comp-pricing mode. Always pair both. |
| `LH_PrefLoc=<n>` | `1`=US Only, `2`=North America, `3`=Worldwide, `4`=Europe, `5`=Asia. |
| `LH_TopRatedPlus=1` | Top Rated Plus sellers only |
| `LH_TitleDesc=1` | Search title + description (slower, broader recall) |
| `_udlo=<n>` / `_udhi=<n>` | Price min / max (storefront currency, integer dollars) |
| `_stpos=<ZIP>&_dmd=<mi>` | Within X miles of ZIP/postal code. Without `_stpos`, eBay infers shipping ZIP from the proxy IP — your displayed delivery costs will depend on it. |
| `_sasl=<seller>` | Specific seller username (paired with `&_saslop=1` for "include only this seller"). |
| `_ipg=<n>` | Items per page: `60`, `120`, or `240`. |
| `_pgn=<n>` | Page number (1-indexed). |
| `_sop=<n>` | Sort: `12` Best Match (default), `1` Ending soonest, `10` Newly listed, `2` Price lowest, `3` Price highest, `15` Price+Shipping lowest, `16` Price+Shipping highest, `7` Distance: nearest. |

Example URLs (all verified to render listings during skill development):
- Keyword + size aspect: `https://www.ebay.com/sch/i.html?_nkw=vintage+Levi+501+size+32&_ipg=60`
- Sold/comp mode: `https://www.ebay.com/sch/i.html?_nkw=iphone+12&LH_Sold=1&LH_Complete=1&_ipg=60`
- Category leaf + condition: `https://www.ebay.com/sch/i.html?_nkw=Charizard&_sacat=183454&LH_ItemCondition=3000&_sop=15&_ipg=60`

If the input is **already a full SRP URL**, use it as-is; if augmenting, parse and merge query params.

### 2. Open in a Verified + proxy Browserbase session, retry on 403

```bash
# Mandatory flags. Without Verified+proxies you hit /splashui/challenge instantly.
SID=$(browse cloud sessions create --keep-alive --verified --proxies | jq -r .id)

for attempt in 1 2 3 4; do
  browse cloud browse --connect "$SID" open "$URL"
  browse cloud browse --connect "$SID" wait load
  browse cloud browse --connect "$SID" wait timeout 2500
  TITLE=$(browse cloud browse --connect "$SID" get title)
  if [[ "$TITLE" != *"Access Denied"* && "$TITLE" != *"Pardon Our Interruption"* ]]; then
    break
  fi
  # Release this session, spin a fresh one — eBay's Akamai blocks ~40-60% of
  # Browserbase residential IPs on first connect. The cheapest path forward
  # is a new session, not solving the challenge.
  browse cloud sessions update "$SID" --status REQUEST_RELEASE
  SID=$(browse cloud sessions create --keep-alive --verified --proxies | jq -r .id)
done
```

A clean SRP page-title looks like `Vintage Levi 501 Size 32 for sale | eBay`. A blocked one is exactly `Access Denied` (Akamai static error from `errors.edgesuite.net`) or `Pardon Our Interruption...` (the `/splashui/challenge` JS interstitial).

### 3. Extract listings from the `.s-card` DOM

eBay migrated the SRP to a new `.s-card` markup. The legacy `.s-item__*` selectors **do not match anymore** on the live site (`hasSItem: false`, `hasSCard: true` confirmed across multiple iterations). Use `page.evaluate` (or your harness's equivalent) with this selector set:

| Target | Selector |
|---|---|
| Card container | `li.s-card` (or `.s-card`) |
| Internal listing-tracking ID (NOT the public itemId) | `li.s-card[data-listingid]` |
| Canonical URL | `a.s-card__link[href*="/itm/"]` |
| Public itemId | regex on `href`: `/\/itm\/(?:[^\/]+\/)?(\d{8,})/` |
| Title | `.s-card__title` |
| Subtitle (condition + key item-specifics) | `.s-card__subtitle` |
| Price (formatted) | `.s-card__price` |
| Image | `.s-card__image img` |
| Attribute rows (one row per fact) | `.s-card__attribute-row`, `.s-card__footer--row` |
| Page-wide result count | `h1.srp-controls__count-heading` (e.g. `776 results for vintage Levi 501 size 32`, `18,000+ results for iphone 12`) |
| Applied-filter chips | `.srp-applied-filter, .srp-applied-filters__item` |
| Category breadcrumbs (left rail) | `ul.x-categories__list li` (top entry is `All`; the highlighted leaf is the current scope) |
| Popular filters (above results) | `.x-refine__main__list a` |

**Per card, attribute rows are a flat list of short strings** like:

```
[
  "$92.92$109.32",                    // price node (sale + strikethrough concatenated, no separator)
  "or Best Offer",                    // buy-format row
  "+$27.11 delivery",                 // shipping row
  "Located in Canada",                // location row
  "12 watchers",                      // watcher count
  "5% off with coupon. Max $5 off",   // coupon row
  "buybackboss 99.6% positive (34.3K)", // seller row (Sold-mode only — username + feedback% + score)
  "View similar active items",        // eBay-injected nav (skip)
  "Sell one like this",               // eBay-injected nav (skip)
  "S⁣4⁣p⁣o⁣n⁣s⁣o⁣r⁣e⁣d..." // sponsored marker (last row, obfuscated — see Gotchas)
]
```

Classify each row by regex:

| Field | Regex |
|---|---|
| `priceText` | `/^\$[\d,]/` (strip the strikethrough overlap; see Gotchas) |
| `buyFormat` | `/buy it now\|or best offer\|best offer accepted\|auction/i` |
| `bidCount` | `/^(\d+)\s+bids?\b/i` |
| `shipping` | `/^\+\$\|^free delivery\|^free shipping\|delivery$\|shipping$/i` |
| `location` | `/^located in /i` (capture rest as country/region) |
| `returnsAccepted` | `/^free returns$/i` (boolean) |
| `watchers` | `/^(\d+)\s+watchers?\b/i` |
| `soldCount` | `/^(\d+)\s+sold\b/i` |
| `coupon` | `/coupon\|% off/i` |
| `seller` | `/^(\S+)\s+(\d+(?:\.\d+)?)%\s+positive\s+\(([^)]+)\)/i` — captures username + feedback% + score (e.g. `34.3K` → `34300`) |
| `sponsored` | last row, after stripping U+2063 separators; test `/sponsored/i` (see Gotchas) |
| Skip | `/^view similar active items$\|^sell one like this$/i` |

### 4. Build the JSON per listing

```jsonc
{
  "itemId": "227321194210",                     // from /itm/{id} in URL
  "url": "https://www.ebay.com/itm/227321194210",
  "title": "Levi's 501 Men's Jeans Vintage 90s Size 32x33...",
  "condition": "Pre-Owned",                     // first segment of .s-card__subtitle before " · "
  "itemSpecifics": ["Size 32"],                 // remaining " · "-separated segments
  "price": { "text": "$80.00", "value": 80.00, "currency": "USD" },
  "wasPrice": null,                             // strikethrough portion if the price node is $X$Y
  "listingFormat": "BuyItNow",                  // BuyItNow | Auction | BuyItNow+BestOffer | BestOfferAccepted | Auction+BuyItNow
  "bidCount": null,                             // integer; null for fixed-price
  "timeLeft": null,                             // ISO 8601 datetime if extractable from per-item detail; null for fixed-price
  "shipping": { "text": "+$8.29 delivery", "value": 8.29, "free": false },
  "location": { "text": "Located in United States", "country": "United States" },
  "totalWithShipping": 88.29,                   // priced + shipping when both numeric
  "imageUrl": "https://i.ebayimg.com/images/g/.../s-l500.webp",
  "seller": null,                               // {"username":"buybackboss","feedbackPct":99.6,"feedbackScore":34300}; surfaces on most Sold-mode + some active cards
  "topRatedPlus": false,                        // not surfaced in card markup — confirm via `LH_TopRatedPlus=1` query if needed
  "returnsAccepted": false,                     // true when "Free returns" row present
  "authenticityGuarantee": false,               // appears as a row in supported categories (sneakers, watches, handbags, trading cards >$250)
  "watchers": null,                             // from "X watchers" row
  "soldCount": null,                            // from "X sold" row
  "categoryBreadcrumbs": [],                    // page-wide; read from .x-categories__list once per page
  "sponsored": false                            // see U+2063 gotcha
}
```

### 5. Capture page-wide context once

```jsonc
{
  "resultCountText": "776 results for vintage Levi 501 size 32",  // or "18,000+ results..." with comma+plus suffix
  "resultCount": 776,                                            // parse leading integer; preserve "approx" flag if "+" suffix
  "appliedFilters": [{ "label": "Size: Regular 32", "removable": true }],
  "breadcrumbs": ["All", "Clothing, Shoes & Accessories", "Men", "Men's Clothing", "Jeans"],
  "shippingToZip": "37918",                     // from .b-header__row text; reflects proxy IP. Override with &_stpos=<ZIP>.
  "sortOrder": "Best Match",                    // current value of the sort dropdown
  "pageNumber": 1,
  "itemsPerPage": 60
}
```

### 6. Sold-listings mode (comp pricing)

URL: `&LH_Sold=1&LH_Complete=1`. Always pair both flags — `LH_Sold=1` alone is silently rewritten by eBay to the active-listings view.

In Sold mode, the same `.s-card` selectors apply. Distinguishing fields (verified empirically with `_nkw=iphone+12&LH_Sold=1&LH_Complete=1`):

- **Bid count** in the attribute rows is the FINAL bid count: `41 bids`.
- **"Best offer accepted"** in the buy-format row marks an OBO sale (vs `or Best Offer` on active listings).
- **Seller row surfaces here** (active SRP often omits it): `buybackboss 99.6% positive (34.3K)` — username + feedback% + score (`34.3K` → `34300`, `1.4M` → `1400000`).
- **The "2 filters applied" pill** appears in the controls bar — confirms Sold+Completed are both active.
- **Sold date / sold-price are the same `.s-card__price`** — the listing already closed at this number. Treat `priceText` as `soldPrice`, surface `soldDate` only if you can extract it from a per-card caption row (one of the `.s-card__caption--signal` / `.s-card__footer-caption` slots — not consistently populated; see Honest Gap below).

### Browser fallback (when given an itemId list, not a query)

For input shape "list of itemIds", skip the SRP and hit each item's detail page:

```
https://www.ebay.com/itm/{itemId}
```

The same `--verified --proxies` session is required (same Akamai). On the detail page, extract:
- Title: `h1.x-item-title__mainTitle span.ux-textspans`
- Price: `.x-price-primary .ux-textspans` (parse currency + amount)
- Bids / time-left (auctions): `.x-bid-count .ux-textspans`, `.ux-timer__time .ux-textspans`
- Condition: `.x-item-condition-text .ux-textspans`
- Seller info: `.x-sellercard-atf__info__about-seller a` (username), `.x-sellercard-atf__data-item-block` (feedback)
- Shipping: `.ux-labels-values--shipping`
- Item specifics: `.ux-layout-section-evo__item--table-view dl` (definition list)
- Image gallery: `.ux-image-carousel-item img`
- Canonical URL: from `<link rel="canonical">`

## Site-Specific Gotchas

- **READ-ONLY.** Never click `Buy It Now`, `Place bid`, `Make offer`, `Add to Watchlist`, `Add to cart`, or `Sign in`. Stop at the rendered SRP / item-detail. Output is structured JSON only.
- **Akamai is the entire gate.** A bare `browse cloud fetch` is redirected to `https://www.ebay.com/splashui/challenge?ap=1&appName=orch&ru=...` (the JS interstitial that bare HTTP cannot pass). `browse cloud fetch --proxies --allow-redirects` returns a hard `403 Access Denied` from `errors.edgesuite.net`. **You need `browse cloud browse` with `--verified --proxies` against a real Chrome.** Headed/headless does not matter; the JS-fingerprint check does.
- **Even with Verified + proxies, ~40–60% of fresh Browserbase sessions get blocked on first navigation** — Akamai pre-tags certain residential-proxy IP ranges. The page either renders an `Access Denied` HTML (title literally `Access Denied`, `Reference #<id>.<id>.<id>.<id>`, link to `errors.edgesuite.net`) or shows `Pardon Our Interruption...` (splash UI). **Treat 403 as "rotate to a new session and retry", up to 3–4 attempts. Empirically 2–3 rotations reach a clean IP.** Do not try to solve the splash UI; cycling sessions is cheaper and faster.
- **Don't waste time on the eBay Browse API without approved credentials.** `https://api.ebay.com/buy/browse/v1/item_summary/search` requires a production-app OAuth Bearer issued through eBay's Developer Program, which gates production access behind a partner-approval review (typically multiple weeks). Sandbox tokens point at a different host and return only test inventory. **Without approved credentials, browser scraping is the only path.** If the agent has credentials, lead with the API.
- **Mobile site (`m.ebay.com`) and the RSS feed (`&_rss=1`) are also Akamai-gated** — both returned 403 with proxies during testing. Don't bother bouncing through them.
- **The SRP uses the new `.s-card` markup, not legacy `.s-item__*`.** Verified across 4+ iterations: `hasSCard: true, hasSItem: false`. Selectors like `.s-item__title`, `.s-item__price`, `.s-item__seller-info-text` do not match on the live site. The new class set is `.s-card__title`, `.s-card__subtitle`, `.s-card__price`, `.s-card__attribute-row`, `.s-card__footer--row`.
- **The first `.s-card` is always a "Shop on eBay" placeholder card** with `title="Shop on eBay"`, fake `price="$20.00"`, fake `href="https://ebay.com/itm/123456?..."` and `&hash=item123546`. **Filter it out** by `itemId === "123456"`, `title === "Shop on eBay"`, or the absence of `data-listingid` on the `<li>`.
- **The "Sponsored" marker is obfuscated with U+2063 (INVISIBLE SEPARATOR) and decoy letters to defeat scrapers.** The DOM string is e.g. `S⁣4⁣p⁣o⁣n⁣s⁣o⁣ ⁣Y⁣ ⁣r⁣e⁣d⁣...` — visually reads "Sponsored" but a naive `text.includes("Sponsored")` returns `false`. **Normalize before testing:** `text.replace(/[⁠-⁤​-‍﻿]/g, '').replace(/\s+/g, '')` then `.toLowerCase().includes("sponsored")`. The marker always appears in the last attribute row, after seller info.
- **Price node concatenates sale + strikethrough with no separator** — a price like "$92.92" with strikethrough original "$109.32" renders in the DOM as the single string `"$92.92$109.32"`. Parse with `/^(\$[\d,.]+)(\$[\d,.]+)?$/` and treat capture 2 as `wasPrice`.
- **Price ranges for multi-variant listings**: `"$0.99 to $3.00"` — capture as `priceMin` / `priceMax`.
- **Subtitle is condition + key item-specifics, joined by " · "**: `"Pre-Owned · Size 32"`, `"Pre-Owned · Apple iPhone 12 · 128 GB · Unlocked"`, `"Brand New"`. Split on ` · ` and take `[0]` as the condition; the rest is per-listing item-specifics (size, model, capacity, etc.).
- **Result count uses "X,XXX+ results" suffix for counts above 10,000**: `"18,000+ results for iphone 12"` (note the `+`). Parse the leading integer; surface a `countIsApproximate: true` flag when `+` is present.
- **Shipping ZIP is set by proxy IP unless overridden.** During testing the displayed ZIP was `37918` (Tennessee) — eBay's "Shipping to <ZIP>" header. The displayed delivery costs (`+$7.38 delivery`) are calculated against this ZIP. Override with `&_stpos=<ZIP>`; useful when the caller needs delivery cost from a specific origin.
- **`LH_Sold=1` alone is silently rewritten to the active-listings view.** Always pair with `LH_Complete=1`. The "2 filters applied" pill on the controls bar is your confirmation; the result count text does NOT contain the word "sold".
- **Time-left and auction-end datetimes do not render in the SRP card** for sold listings; for active auctions the row reads e.g. `"2d 4h"` (display-only). To get the precise ISO end-time, navigate to the item-detail page and read `.ux-timer__time` plus the `<meta itemprop="endDate">` if present.
- **Seller info is missing from most active-mode cards** — it surfaces reliably on Sold-mode cards (`buybackboss 99.6% positive (34.3K)`), and inconsistently on active cards. When `LH_TopRatedPlus=1` filter is applied, the seller-info row reliably surfaces with a "Top Rated Plus" badge before the username.
- **`data-listingid` ≠ `itemId`.** The `data-listingid="2500219655424533"` attribute on `<li>` is an internal listing-tracking ID (used for impression analytics), NOT the public `itemId` you'd use in `/itm/{id}`. **Always parse the itemId from the `/itm/(\d{8,})` portion of the anchor href.**
- **"Authenticity Guarantee" badge** appears as an attribute row only in supported categories (sneakers `_sacat=15709`, watches `_sacat=14324`, handbags `_sacat=169291`, trading cards >$250). Detect by the literal phrase `"Authenticity Guarantee"` in the rows.
- **Pagination via `_pgn` is reliable up to ~10,000 results** (`_ipg=240 × _pgn=42`). Beyond that, eBay caps and silently re-renders page 1. For exhaustive enumeration, narrow the query (price band or date filter) instead.
- **`_ipg` only accepts `60`, `120`, `240`** — any other integer is silently coerced to 60.
- **The category breadcrumbs in the left rail include a long tail of "related-but-not-selected" leaves**, not just the active path. The selected leaf has `aria-current="page"` or a `selected` class on its `<li>`. Don't naïvely emit the whole list as the active breadcrumbs.
- **`Cookie consent` modal** sometimes appears on the first page-load and obstructs the lower half of the SRP. eBay does not block scraping if it's not dismissed, but if your DOM extraction misses listings on iter 1 and `hasSCard: false`, dismiss it via `.gdpr-banner__close` and re-snapshot.
- **Honest gap: sold-date per card.** During this skill's iteration I did not isolate a stable selector for the per-card "Sold on <date>" caption — the value did not surface in `.s-card__attribute-row` or `.s-card__footer--row` rows for any of the iphone-12 sold cards I inspected. The per-item detail page (`/itm/{id}`) exposes a `Sold on <date>` element under `.x-item-sold-history`; that's the reliable fallback when callers require sold dates. A future agent should add `.s-card__caption`, `.s-card__caption--signal`, and `.s-card__signal` to the row-extraction set and re-test.

## Expected Output

Active-listings shape (recommended_method = browser):

```json
{
  "success": true,
  "mode": "active",
  "query": "vintage Levi 501 size 32",
  "sourceUrl": "https://www.ebay.com/sch/i.html?_nkw=vintage+Levi+501+size+32&_ipg=60",
  "resultCount": 776,
  "resultCountIsApproximate": false,
  "appliedFilters": [{"label": "Size: Regular 32", "removable": true}],
  "breadcrumbs": ["All", "Clothing, Shoes & Accessories", "Men", "Men's Clothing", "Jeans"],
  "shippingToZip": "37918",
  "pageNumber": 1,
  "itemsPerPage": 60,
  "listings": [
    {
      "itemId": "227321194210",
      "url": "https://www.ebay.com/itm/227321194210",
      "title": "Levi's 501 Men's Jeans Vintage 90s Size 32x33 Straight Denim USA Button Fly 1992",
      "condition": "Pre-Owned",
      "itemSpecifics": ["Size 32"],
      "price": {"text": "$80.00", "value": 80.00, "currency": "USD"},
      "wasPrice": null,
      "listingFormat": "BuyItNow",
      "bidCount": null,
      "timeLeft": null,
      "shipping": {"text": "+$8.29 delivery", "value": 8.29, "free": false},
      "location": {"text": "Located in United States", "country": "United States"},
      "totalWithShipping": 88.29,
      "imageUrl": "https://i.ebayimg.com/images/g/TGIAAeSwI3Zp8YG1/s-l500.webp",
      "seller": null,
      "returnsAccepted": false,
      "watchers": null,
      "sponsored": false
    },
    {
      "itemId": "177819394878",
      "url": "https://www.ebay.com/itm/177819394878",
      "title": "Vintage Levis 501 Button Fly Blue Dark Denim Jeans USA",
      "condition": "Pre-Owned",
      "itemSpecifics": [],
      "price": {"text": "$92.92", "value": 92.92, "currency": "USD"},
      "wasPrice": {"text": "$109.32", "value": 109.32},
      "listingFormat": "BuyItNow+BestOffer",
      "shipping": {"text": "+$27.11 delivery", "value": 27.11, "free": false},
      "location": {"text": "Located in Canada", "country": "Canada"},
      "totalWithShipping": 120.03,
      "watchers": 12,
      "sponsored": false
    }
  ]
}
```

Sold/comp-pricing shape:

```json
{
  "success": true,
  "mode": "sold",
  "query": "iphone 12",
  "sourceUrl": "https://www.ebay.com/sch/i.html?_nkw=iphone+12&LH_Sold=1&LH_Complete=1&_ipg=60",
  "resultCount": 18000,
  "resultCountIsApproximate": true,
  "listings": [
    {
      "itemId": "287328455070",
      "url": "https://www.ebay.com/itm/287328455070",
      "title": "Apple iPhone 12 - 128GB - Unlocked (Read Description)",
      "condition": "Pre-Owned",
      "itemSpecifics": ["Apple iPhone 12", "128 GB", "Unlocked"],
      "soldPrice": {"text": "$141.00", "value": 141.00, "currency": "USD"},
      "soldDate": null,
      "listingFormat": "Auction",
      "finalBidCount": 41,
      "shipping": {"text": "Free delivery", "value": 0, "free": true},
      "location": {"text": "Located in United States", "country": "United States"},
      "returnsAccepted": true,
      "seller": {"username": "buybackboss", "feedbackPct": 99.6, "feedbackScore": 34300}
    },
    {
      "itemId": "236760653445",
      "title": "Apple iPhone 12 Pro Max Pacific Blue 512GB A2412...",
      "condition": "Pre-Owned",
      "itemSpecifics": ["Apple iPhone 12 Pro Max", "512 GB"],
      "soldPrice": {"text": "$360.00", "value": 360.00, "currency": "USD"},
      "listingFormat": "BestOfferAccepted",
      "finalBidCount": null,
      "shipping": {"text": "+$10.01 delivery", "value": 10.01, "free": false},
      "seller": {"username": "jaci_547", "feedbackPct": 100.0, "feedbackScore": 6}
    }
  ]
}
```

Hard-block shape (all retries exhausted on Akamai):

```json
{
  "success": false,
  "reason": "akamai_blocked",
  "attempts": 4,
  "lastTitle": "Access Denied",
  "lastReference": "18.e5422d17.1778889070.d9dbe7e",
  "advice": "Rotate to a new Browserbase session (residential IP). If 4+ rotations all 403, the proxy pool may be temporarily IP-tainted; wait 5–10 minutes and retry."
}
```

Empty-result shape (valid query, zero matches):

```json
{
  "success": true,
  "mode": "active",
  "query": "...",
  "resultCount": 0,
  "listings": [],
  "didYouMean": null,
  "spellingSuggestion": null
}
```
