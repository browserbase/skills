---
name: discogs-com-get-marketplace-price-8xouh1
title: Discogs Marketplace Price Lookup
description: >-
  Given a Discogs release/master URL, ID, or free-form release reference, return
  live Marketplace listings (per-listing price, media + sleeve condition, seller
  info, shipping, comments) plus full release-level metadata. Hybrid: public
  Database API for metadata + aggregate stats; Verified browser session for
  per-listing rows. Read-only.
website: discogs.com
category: music
tags:
  - music
  - vinyl
  - marketplace
  - discogs
  - pricing
  - read-only
  - hybrid
source: 'browserbase: agent-runtime 2026-05-15'
updated: '2026-05-15'
recommended_method: hybrid
alternative_methods:
  - method: api
    rationale: >-
      Discogs public Database API at api.discogs.com is fully open (no auth, 25
      req/min) for release metadata, master metadata, marketplace aggregate
      stats (num_for_sale + lowest_price with curr_abbr override), database
      search, and per-listing detail by listing_id. No Cloudflare challenge on
      the API host. This handles ~80% of the task — everything except
      per-listing rows for a release.
  - method: browser
    rationale: >-
      Required for the per-listing table at
      www.discogs.com/sell/release/<release_id> (and /sell/list?master_id=).
      Cloudflare bot-management challenges every fetch (Cf-Mitigated: challenge,
      HTTP 403) — even browse cloud fetch --proxies. Only --verified + --proxies
      Browserbase session clears it. The public API exposes no equivalent
      endpoint for per-release listing enumeration (the legacy unauthenticated
      /users/{seller}/inventory?release_id silently returns 0 items unless the
      caller owns the inventory).
verified: false
proxies: true
---
# Discogs Marketplace Price Lookup

## Purpose

Given a Discogs release URL, master URL, release/master ID, or free-form release reference, return live Discogs Marketplace listings for that release — per-listing price, media + sleeve condition (Goldmine grades), seller info, shipping, and listing notes — plus the release-level metadata (artists, labels, catalog number, pressing year/country, format, genres, styles, tracklist, community Have/Want counts, average rating, primary cover image). Hybrid path: the **public Discogs Database API** delivers all release metadata + aggregate marketplace stats (num_for_sale, lowest_price) with no auth, but **per-listing rows are browser-only** — the marketplace HTML is Cloudflare-challenged and not exposed in the public API. Read-only — never click Buy It Now, Add to Cart, Make Offer, Add to Wantlist, Sign In, or submit any form.

## When to Use

- Tracking the current floor / median / spread of marketplace listings for a specific pressing.
- Comparing pressings under a master release (e.g. cheapest UK 1973 first-press vs cheapest reissue).
- Surfacing listings filtered by media/sleeve condition, ships-from country, price range, seller rating.
- Resolving a free-form release reference ("Pink Floyd Dark Side of the Moon original UK pressing") to a Discogs release ID before any marketplace lookup.
- Building a wantlist-monitor that polls listings against price/condition/region thresholds.

## Workflow

The optimal path is **hybrid**: hit the public Discogs Database API for everything it exposes (release metadata, master metadata, aggregate marketplace stats, free-text search → release ID resolution) at ~25 req/min unauthenticated, with **zero anti-bot friction**. Then — and only then — open a Browserbase **Verified + proxies** session to scrape per-listing rows from `/sell/release/<release_id>`, which is Cloudflare-protected and HTML-only.

### 1. Resolve input → release_id (and master_id if applicable)

Three input shapes. Pick the branch:

**a. Full release URL** (`https://www.discogs.com/release/249504-Rick-Astley-Never-Gonna-Give-You-Up` or just `.../release/249504`):
Extract the integer after `/release/`. That's the `release_id`. Skip to step 2.

**b. Full master URL** (`.../master/96559-...`):
Extract `master_id`, then call:
```
GET https://api.discogs.com/masters/<master_id>
```
The response includes `main_release` (the canonical release ID Discogs treats as the master's primary pressing) plus `genres`, `styles`, `year` (original release year), `lowest_price` and `num_for_sale` *aggregated across all releases under the master*. If the user wants "any pressing of this master", use `main_release` as the `release_id`. If the user wants a specific pressing (e.g. "original UK 1973 pressing"), use `/masters/<master_id>/versions?format=Vinyl&country=UK&released=1973&per_page=50` to enumerate pressings and pick by matching the user's constraints.

**c. Free-form text** (`"Pink Floyd Dark Side of the Moon original UK pressing"`):
```
GET https://api.discogs.com/database/search
    ?q=<urlenc-text>
    &type=master            # use 'master' for "any pressing of this album"; 'release' for a specific pressing
    &format=Vinyl|CD|Cassette
    &per_page=10
```
Returns `results[]` with `id`, `title`, `year`, `country`, `format[]`, `label[]`, `master_id`. Pick the top result; if `results.length > 1` and the top two have similar `community.have` counts, return `reason: "ambiguous_reference"` with a `matches: []` list rather than guessing. Otherwise resolve to either a `release_id` (`type=release`) or `master_id` (`type=master`, then dereference to `main_release` per (b)).

### 2. Fetch release-level metadata (Database API, no auth)

```
GET https://api.discogs.com/releases/<release_id>
```

Returns the full record this skill emits as the release-context payload — `id`, `title`, `artists[]` (with `id`, `resource_url`, `name`), `labels[]` (with `name`, `catno`, `id`), `formats[]` (with `name`, `qty`, `descriptions[]` — e.g. `["7\"", "45 RPM", "Single", "Stereo"]`), `country`, `year`, `released` / `released_formatted`, `genres[]`, `styles[]`, `tracklist[]` (each `{ position, type_, title, duration }`), `identifiers[]` (barcodes, matrix runouts, label codes, price codes — with `type` + `value` + `description`), `images[]` (with `type: primary|secondary`, `uri`, `width`, `height`), `videos[]`, `community.have`, `community.want`, `community.rating.average`, `community.rating.count`, `master_id`, `master_url`, **`num_for_sale`**, **`lowest_price`** (single number in caller's default currency, USD if not overridden), and `uri` (canonical release URL).

For aggregate marketplace stats with a specific currency:
```
GET https://api.discogs.com/marketplace/stats/<release_id>?curr_abbr=USD|EUR|GBP|JPY|...
```
Returns `{ num_for_sale, lowest_price: { value, currency }, blocked_from_sale }`. **Use `curr_abbr` (with underscore) on the API — NOT `currabbr`**, which is the marketplace HTML query param. If `blocked_from_sale: true`, the release cannot legally be sold on Discogs in the caller's region — short-circuit and emit `reason: "blocked_from_sale"`.

### 3. Open Browserbase Verified + proxies session

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies | jq -r '.id')
```

Both `--verified` and `--proxies` are **mandatory**. A bare session (or `browse cloud fetch --proxies` from outside a session) hits Cloudflare's bot-management challenge on every `www.discogs.com/sell/*` URL — confirmed `Cf-Mitigated: challenge`, HTTP 403, with the "Just a moment..." JS-challenge HTML — across `--proxies` only, no proxies, and `--proxies --allow-redirects`. The public Database API at `api.discogs.com` is exempt from this; the consumer marketplace pages at `www.discogs.com` are not.

### 4. Construct the marketplace URL with filters

The marketplace listing table lives at:
```
https://www.discogs.com/sell/release/<release_id>?<filters>
```

**Filter query params** (combine freely; unrecognized params are silently dropped):

| Param | Values | Notes |
|---|---|---|
| `format` | `Vinyl`, `CD`, `Cassette`, `8-Track`, `Reel-to-Reel`, `Box Set`, `All Media` | Top-level media type. |
| `format_desc` | `LP`, `7"`, `10"`, `12"`, `EP`, `Album`, `Single`, `45 RPM`, `33 ⅓ RPM`, `180g`, `Reissue`, `Remastered`, `Compilation`, ... | Subformat / format descriptor — multi-select (`format_desc=LP&format_desc=Album`). |
| `condition` | `Mint%20(M)`, `Near%20Mint%20(NM%20or%20M-)`, `Very%20Good%20Plus%20(VG%2B)`, `Very%20Good%20(VG)`, `Good%20Plus%20(G%2B)`, `Good%20(G)`, `Fair%20(F)`, `Poor%20(P)` | Media (record) condition — Goldmine grades. URL-encode the parentheses. |
| `sleeve_condition` | same Goldmine ladder | Sleeve / jacket condition. Multi-select. CD listings often omit sleeve grade — gracefully accept null. |
| `price_min`, `price_max` | integer (in `currabbr` currency) | Inclusive range. |
| `currabbr` | `USD`, `EUR`, `GBP`, `JPY`, `AUD`, `CAD`, `CHF`, `SEK`, `NZD`, `MXN`, `BRL`, `ZAR` (and more) | Display currency. **Note: marketplace HTML uses `currabbr` (no underscore); Database API at `/marketplace/stats` uses `curr_abbr` (with underscore). They are different params on different surfaces.** |
| `ships_from` | Country name, URL-encoded (`United%20States`, `United%20Kingdom`, `Germany`, ...) | Seller's country. |
| `country` | Country of original pressing, URL-encoded | Filters by release-level country (the pressing's manufactured country), not seller. |
| `year` | `YYYY` or `YYYY%2DYYYY` (range) | Pressing year. |
| `label` | label id (integer) | Multi-select. |
| `seller_rating` | `99`, `98`, `95` (interpreted as min % positive) | Min seller feedback %. Combine with `seller_feedback_min=N` for min review count. |
| `sort` | `price%2Casc` (default), `listed%2Cdesc`, `condition%2Cdesc`, `seller_location%2Casc`, `artist%2Casc` | Comma is `%2C`. `price` sort is "Lowest Price + Shipping". |
| `limit` | `25` (default), `50`, `100`, `250` | Listings per page. `250` is the documented hard cap. |
| `page` | integer ≥ 1 | Pagination cursor. The page header shows `Showing X – Y of Z`. |

**Example:**
```
https://www.discogs.com/sell/release/249504?format=Vinyl&format_desc=7%22&condition=Near%20Mint%20(NM%20or%20M-)&sleeve_condition=Near%20Mint%20(NM%20or%20M-)&price_min=5&price_max=50&ships_from=United%20Kingdom&currabbr=USD&sort=price%2Casc&limit=100
```

For a **master-level lookup** (any pressing under a master, not just one release), use:
```
https://www.discogs.com/sell/list?master_id=<master_id>&<same filters>
```
`/sell/list` accepts the same filter surface and additionally `master_id` or `release_id` as the scoping param.

### 5. Open, wait, snapshot

```bash
browse --connect "$SID" open "<url-from-step-4>"
browse --connect "$SID" wait load
browse --connect "$SID" wait timeout 2500     # listing table lazy-hydrates ~1.5–2s post-load
browse --connect "$SID" get html body         # full marketplace listing markup
```

The listing rows live under `table.mpitems > tbody > tr.shortcut_navigable`. Each row carries:

- `data-release-id` on the row (matches the `release_id` you queried).
- **Listing ID** in the linked listing-detail anchor: `td.item_description > a.item_description_title[href="/sell/item/<listing_id>"]`. Parse `<listing_id>` from the href.
- **Format details** in the same `td.item_description`: `<p class="item_condition">` precedes media + sleeve grades; `<p class="hide_mobile">` shows the format descriptors (`Vinyl, LP, Album, 180 gram, Reissue, Remastered`).
- **Media condition**: text inside the first `span.condition-label-desktop`'s sibling — or the `data-tooltip` attribute. Goldmine grade strings like `"Near Mint (NM or M-)"`, `"Very Good Plus (VG+)"`, etc.
- **Sleeve condition**: same pattern, second condition span. May be `"No Cover"` or missing for CDs.
- **Comments from seller**: free text under `<p class="item_condition_text">` — vinyl buyers rely heavily on this. Preserve newlines.
- **Listed price (raw)**: `td.item_price > span.price` — text content with currency symbol (e.g. `"€14.95"`).
- **Listed price (numeric)**: parse the digits from the same node; `data-pricevalue` attribute on the parent `<span>` often holds the raw decimal.
- **Buyer-currency conversion**: shown as `"about $16.12"` in `span.converted_price` when `currabbr` differs from the listing's native currency.
- **Shipping cost**: `<span class="item_shipping">` — text like `"+€5.00 shipping from Germany"` or `"+$3.50 shipping to United States"` (when `ships_to` is geo-detected). Parse numeric + currency separately. **Shipping is geo-dependent on the viewing IP** — Browserbase's residential proxy region determines what shipping line is rendered. Document this in the response.
- **Seller info**: `td.seller_info > strong.seller_block_id > a[href="/seller/<username>"]` for username + profile URL; nearby `<span class="seller_rating">` for `% positive`; `<span class="seller_info_block_rating_number">` for total feedback count; country in `<span class="seller_info_block_location">` or the next sibling.
- **Listed date**: present in `<time>` tag if surfaced; otherwise absent on the search-results view (open the listing detail to retrieve).
- **Payment methods / "Comments from seller" block**: only on the listing detail page (`/sell/item/<listing_id>`), not in the table view.

For full per-listing detail (payment methods, exact listed date, complete seller-notes block), drill into each listing detail page in a second pass:
```bash
browse --connect "$SID" open "https://www.discogs.com/sell/item/<listing_id>?ev=rb"
browse --connect "$SID" get html body
```
The `?ev=rb` (event: rest-of-browse) suffix matches what Discogs's own client sends — harmless if omitted.

### 6. Pagination

The pagination footer renders `Pagination_pageList` with `<a rel="next">`. Extract pages either by counting from `Showing 1 – 25 of <total>` or by reading the `?page=N` href off the next-button. Hard cap is whatever Discogs returns (e.g. 105 listings @ `limit=25` = 5 pages). Increment `page=` while honoring `limit=` from step 4.

### 7. Release the session

```bash
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

### Browser fallback when input is master-only

If the user gave only a master reference and wants "any pressing", short-circuit:
1. `GET /masters/<master_id>` → `main_release` and `num_for_sale` aggregated.
2. `GET /marketplace/stats/<main_release>?curr_abbr=<currency>` for the floor price.
3. If they want the full listing table, scrape `/sell/list?master_id=<X>` (browser path) — this aggregates listings across every release under the master, sorted by lowest price + shipping by default.

## Site-Specific Gotchas

- **READ-ONLY.** Never click `Add to Cart`, `Buy It Now`, `Make Offer`, `Add to Wantlist`, `Sign In`, `Register`, or any form submit. The marketplace skill returns prices/conditions; purchasing is a different skill (and would require an authenticated user account).
- **Cloudflare bot-management on `www.discogs.com/sell/*`.** Confirmed `Cf-Mitigated: challenge` + HTTP 403 + `__cf_bm` set-cookie + "Just a moment..." HTML across (a) bare `browse cloud fetch`, (b) `browse cloud fetch --proxies`, and (c) `browse cloud fetch --proxies --allow-redirects`. **Only a real browser session with `--verified --proxies` clears the challenge.** Don't waste time trying to scrape `www.discogs.com/sell/*` with `browse cloud fetch` — go straight to a Verified session.
- **`api.discogs.com` is fully open — no auth needed for read endpoints.** `browse cloud fetch https://api.discogs.com/releases/<id>` returns 200 JSON immediately, no CF challenge. The API and the consumer site have completely different anti-bot postures; lead with the API for everything it exposes.
- **Two different "currency" param names.** Marketplace HTML pages use `?currabbr=USD` (no underscore). The Database API endpoint `/marketplace/stats/<release_id>` uses `?curr_abbr=USD` (with underscore). Mixing them up silently no-ops; the response will be in the API's default currency (USD).
- **Public API rate-limit is 25 req/min, unauthenticated.** Visible in `X-Discogs-Ratelimit: 25` and `X-Discogs-Ratelimit-Remaining`. Authenticated (OAuth or PAT) callers get 60 req/min. For multi-page marketplace scraping the browser session is the bottleneck anyway, not the API.
- **`/marketplace/listings/{listing_id}` works unauthenticated and returns full per-listing detail** when the listing still exists (404 with `"It may have been deleted."` if removed). This is the *one* per-listing endpoint that doesn't require OAuth — useful if you have a listing ID from the HTML table and want clean JSON instead of HTML-parsing the detail page.
- **`/marketplace/price_suggestions/{release_id}` requires authentication (returns 401 unauthenticated).** Don't rely on it for unauthenticated callers. The unauthenticated alternative is `/marketplace/stats/<id>` (floor + count only) — median and percentile suggested prices are paywalled behind OAuth.
- **`/users/{username}/inventory?release_id={X}` is publicly readable but returns 0 items unless you are the inventory owner.** Confirmed across multiple known active sellers (`jpc`, `musicstack`, `yarbo`, `memory`) — every call returned `items: 0` unauthenticated. Despite docs implying public visibility, the unauthenticated response is *only* the caller's own inventory (empty for an anonymous caller). Don't try to enumerate per-release listings via this endpoint without OAuth — it silently returns nothing.
- **Master vs release confusion.** A "master" is a logical album (Pink Floyd – Dark Side of the Moon, master_id 10362); a "release" is one specific pressing (1973 UK gatefold, release_id 1873013). Free-text searches default to `type=release` and return individual pressings; the user likely wants `type=master` first, then `main_release` for the canonical pressing or `/masters/<id>/versions` to enumerate. Marketplace listings are pressing-specific (`/sell/release/<release_id>`) but can be aggregated across a master (`/sell/list?master_id=<X>`).
- **Goldmine grade encoding in URLs.** The `condition` and `sleeve_condition` query params take the **full Goldmine grade string** with parentheses and abbreviation: `Mint (M)`, `Near Mint (NM or M-)`, `Very Good Plus (VG+)`, `Very Good (VG)`, `Good Plus (G+)`, `Good (G)`, `Fair (F)`, `Poor (P)`. URL-encode `(`, `)`, `+`, and space. Common mistake: passing just `NM` or `VG+` (no parens, no abbreviation expansion) — Discogs silently ignores and returns unfiltered.
- **CDs and digital formats omit sleeve grades.** Don't fail if `sleeve_condition` is `"No Cover"`, `"Generic"`, or missing on non-vinyl listings.
- **Shipping cost depends on viewing IP (proxy region).** The shipping line `"+$3.50 shipping to United States"` reflects what Discogs computed for the proxy's IP-geo'd country. If the user wants shipping cost to a specific country, set the Browserbase session region to a region near that country, or scrape the shipping table on the listing detail page (some sellers publish per-country shipping tables in `<table class="shipping_block">`).
- **`blocked_from_sale: true`** on `/marketplace/stats` means the release is legally blocked from Discogs sale (e.g. recent label takedowns, regional restrictions). The marketplace HTML page will render but show 0 listings — short-circuit before scraping.
- **The format/`formats[]` block on a release is descriptive, not filterable verbatim.** `release.formats[].descriptions` may contain values like `["Vinyl", "12\"", "33 ⅓ RPM", "Album", "Reissue", "Remastered", "180 gram"]` — for the marketplace filter, the `format_desc` param accepts these as multi-select, but exact-match is required (case-sensitive in the URL). When constructing filters from a free-text query, normalize: "180g" → `180 gram`, "12 inch" → `12"`, etc.
- **`Lowest Price + Shipping` is the default sort.** Discogs computes total-to-buyer (price + shipping to viewing IP) for ranking. Without overriding `sort=`, the first page is the cheapest *delivered* offers, which is what most callers want.
- **Listing detail pages allow `?ev=rb`.** Append `?ev=rb` to mimic the Discogs JS client's referral query and avoid certain logged-out gating; not strictly required but reduces 302-redirect churn.
- **Don't request `limit > 250`.** Discogs caps the per-page result count at 250; values above that silently fall back to 250 (or sometimes return an empty page).
- **`api.discogs.com` requires no `User-Agent` for read endpoints** when called via `browse cloud fetch`. Discogs's docs technically demand a custom UA, but Browserbase's Fetch API supplies a default UA that Discogs accepts. If hitting the API outside Browserbase, set a `User-Agent: YourApp/1.0 +https://yourapp.example` header to avoid intermittent 403s from Discogs's UA filter.

## Expected Output

Top-level shape — one of three outcome variants:

```json
// 1. SUCCESS — listings returned
{
  "success": true,
  "release": {
    "release_id": 249504,
    "master_id": 96559,
    "title": "Never Gonna Give You Up",
    "artists": [
      { "name": "Rick Astley", "id": 72872, "url": "https://www.discogs.com/artist/72872" }
    ],
    "labels": [
      { "name": "RCA", "catno": "PB 41447", "id": 895 }
    ],
    "format": { "name": "Vinyl", "qty": 1, "descriptions": ["7\"", "45 RPM", "Single", "Stereo"] },
    "country": "UK",
    "released": "1987-07-00",
    "released_formatted": "Jul 1987",
    "year": 1987,
    "genres": ["Electronic", "Pop"],
    "styles": ["Euro-Disco"],
    "tracklist": [
      { "position": "A", "title": "Never Gonna Give You Up", "duration": "3:32" },
      { "position": "B", "title": "Never Gonna Give You Up (Instrumental)", "duration": "3:30" }
    ],
    "identifiers": [
      { "type": "Barcode", "value": "5012394144777" },
      { "type": "Matrix / Runout", "value": "PB 41447 A2 UTOPIA MS", "description": "A side runout, variant 1" }
    ],
    "community": { "have": 4028, "want": 579, "rating_average": 3.83, "rating_count": 229 },
    "marketplace_stats": {
      "num_for_sale": 105,
      "lowest_price": { "value": 0.68, "currency": "USD" }
    },
    "primary_image_url": "https://i.discogs.com/...jpeg",
    "additional_images": ["https://i.discogs.com/...jpeg", "..."],
    "discogs_url": "https://www.discogs.com/release/249504-Rick-Astley-Never-Gonna-Give-You-Up"
  },
  "filters_applied": {
    "format": "Vinyl",
    "format_desc": ["7\""],
    "condition": ["Near Mint (NM or M-)", "Very Good Plus (VG+)"],
    "sleeve_condition": ["Near Mint (NM or M-)"],
    "price_min": null,
    "price_max": null,
    "currabbr": "USD",
    "ships_from": null,
    "country_of_release": null,
    "year": null,
    "label": null,
    "seller_rating_min_pct": 99,
    "seller_feedback_min": null,
    "sort": "price,asc",
    "limit": 100,
    "page": 1
  },
  "listings_total": 47,
  "listings_returned": 25,
  "listings": [
    {
      "listing_id": 2520253500,
      "listing_url": "https://www.discogs.com/sell/item/2520253500",
      "release_id": 249504,
      "format_details": ["Vinyl", "7\"", "45 RPM", "Single", "Stereo"],
      "media_condition": "Near Mint (NM or M-)",
      "sleeve_condition": "Very Good Plus (VG+)",
      "comments_from_seller": "Plays beautifully. Light marks on B-side. Original PWL inner.",
      "price": { "value": 4.50, "currency": "GBP" },
      "price_converted": { "value": 5.71, "currency": "USD" },
      "shipping": { "value": 6.00, "currency": "GBP", "from_country": "United Kingdom", "to_country": "United States" },
      "seller": {
        "username": "vinyl_dreams_uk",
        "profile_url": "https://www.discogs.com/seller/vinyl_dreams_uk",
        "country": "United Kingdom",
        "feedback_count": 8412,
        "positive_pct": 99.7
      },
      "listed_date": null,
      "payment_methods": null
    }
  ],
  "pagination": { "page": 1, "pages": 2, "per_page": 25, "total": 47, "next_url": "...?page=2" }
}

// 2. RESOLVED-AMBIGUOUS — free-text resolved to multiple candidate releases / masters
{
  "success": false,
  "reason": "ambiguous_reference",
  "query": "Pink Floyd Dark Side of the Moon original UK pressing",
  "matches": [
    { "type": "master", "id": 10362, "title": "Pink Floyd - The Dark Side Of The Moon", "year": 1973, "have": 412034 },
    { "type": "release", "id": 1873013, "title": "Pink Floyd - The Dark Side Of The Moon", "year": 1973, "country": "UK", "label": "Harvest", "catno": "SHVL 804", "have": 21043 }
  ]
}

// 3. NO LISTINGS / BLOCKED / NOT-FOUND
{
  "success": false,
  "reason": "blocked_from_sale" | "no_listings_match_filters" | "release_not_found" | "cloudflare_challenge_unsolved",
  "release": { "release_id": 249504, ... },     // present if release exists
  "filters_applied": { ... },                    // present if release exists
  "listings_total": 0,
  "listings": []
}
```

The `reason` discriminator in variant 3:
- `release_not_found` — API returned 404 on `/releases/<id>` or `/masters/<id>`, OR free-text search returned 0 results.
- `blocked_from_sale` — `/marketplace/stats` returned `blocked_from_sale: true`. No listings exist legally.
- `no_listings_match_filters` — release exists, marketplace page rendered, but filter combination returned 0 rows.
- `cloudflare_challenge_unsolved` — Browserbase session failed to clear the CF challenge even with `--verified --proxies`. Rare but possible; retry with a fresh session in a different region.
