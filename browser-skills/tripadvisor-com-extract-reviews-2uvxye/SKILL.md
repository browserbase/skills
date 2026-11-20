---
name: tripadvisor-com-extract-reviews-2uvxye
title: Tripadvisor Review Extraction
description: >-
  Extract a Tripadvisor entity's overall rating, review count, rating
  distribution, ranking, and a filterable slice of structured reviews (rating
  bubble, sort, traveler type, language, season, search-within, hotel
  subratings, restaurant meal type). Read-only.
website: tripadvisor.com
category: travel
tags: []
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: browser
alternative_methods: []
verified: true
proxies: true
---
# Tripadvisor Review Extraction

## Purpose

Given a Tripadvisor entity (restaurant, hotel, or attraction) — accepted as a full `tripadvisor.com` URL, a `d{locationId}` token, or a free-form "name, city" reference — return the entity's overall rating, total review count, 1-5 rating distribution, ranking position, address, contact details, and a filterable, paginated slice of structured reviews. Honors Tripadvisor's full read-side filter surface (rating bubbles, sort order, traveler type, language, season, search-within-reviews, subcategory ratings for hotels, meal type for restaurants). Read-only — never clicks Write-a-Review, Save, Share, Sign-In, or any mutation control.

## When to Use

- Pulling structured review data for a competitor or partner restaurant / hotel / attraction.
- Sentiment / reputation monitoring on a small set of POIs.
- Building a snapshot of how an entity is rated across trip types or seasons.
- Any agent flow that needs Tripadvisor review data without booking, posting, or otherwise mutating state.

Do **not** use this skill for bulk crawling across thousands of entities — Tripadvisor's anti-bot wall makes that economically nonsensical from a residential-proxy budget standpoint. For bulk needs, route the user to the official Tripadvisor Content API (see "Alternative methods" below).

## Workflow

Tripadvisor is one of the most aggressively-defended consumer travel sites on the public web. **Browserbase verified-Verified + residential proxies are mandatory** — every direct-HTTP path (raw `curl`, Browserbase Fetch API, headless Chromium without fingerprint hardening) returns a Datadome captcha challenge (HTTP 403, ~778 bytes, `captcha-delivery.com` redirect script). Confirmed across `/Restaurant_Review-*`, `/Hotel_Review-*`, `/Attraction_Review-*`, `/Search`, and `/TypeAheadJson` paths via Browserbase Fetch with residential proxies (2026-05-18). The internal GraphQL endpoint at `/data/graphql/ids` is alive (returns `405 Method Not Allowed` on GET, confirming POST-only) but its requests are signed by session cookies set by the same Datadome flow that gates the HTML pages — out-of-band replay is a confirmed dead-end (see Site-Specific Gotchas).

The reliable path is therefore: load the entity's `/Restaurant_Review` / `/Hotel_Review` / `/Attraction_Review` page in a Verified+proxied session, apply filters by rewriting the URL with Tripadvisor's documented filter tokens, and paginate using the `or=N` page-offset token. Extract review cards from the rendered DOM.

### 1. Verified + residential-proxy session

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies | jq -r '.id')
export BROWSE_SESSION="$SID"
```

Both `--verified` and `--proxies` are mandatory. A bare session (or even `--proxies` without `--verified`) hits Datadome on the first request and stays walled for the session lifetime. Use a US residential proxy for `.com` entities; use the locale-matched Tripadvisor TLD (`.co.uk`, `.fr`, `.de`, `.it`, …) for entities in those countries and pair with a region-matched proxy.

### 2. Resolve the entity to a canonical Review URL

Tripadvisor entities are addressable by `g{geoId}-d{locationId}` pairs. The canonical Review URL shape is:

| Type | Pattern |
|---|---|
| Restaurant | `https://www.tripadvisor.com/Restaurant_Review-g{geoId}-d{locationId}-Reviews-{Slug}-{City}_{State}.html` |
| Hotel | `https://www.tripadvisor.com/Hotel_Review-g{geoId}-d{locationId}-Reviews-{Slug}-{City}_{State}.html` |
| Attraction | `https://www.tripadvisor.com/Attraction_Review-g{geoId}-d{locationId}-Reviews-{Slug}-{City}_{State}.html` |

Resolution from input shape:

- **Full URL supplied** — use as-is. Strip any existing filter / pagination tokens (between `Reviews-` and the entity slug) before rebuilding with the filters in step 3.
- **`d{locationId}` token only** — open `https://www.tripadvisor.com/{locationId}` (Tripadvisor's bare-id short URL redirects to the canonical entity page; the resolved URL surfaces `g{geoId}` and the entity type).
- **Name + city** — drive the in-page search box (`/Search?q=<urlenc-name+city>`) and pick the top match whose type matches the user's hint. Do **not** call `/TypeAheadJson?action=API` directly — it is Datadome-walled even though it returns JSON (confirmed 403 with proxies).
- **Ambiguous name** (e.g. "Ritz" in London) — return `success: false, reason: "ambiguous_name", candidates: [...]` with the top 3-5 search hits and let the caller disambiguate.

### 3. Apply filters by rewriting the URL

Tripadvisor encodes most filters in the URL path between `Reviews-` and `-{Slug}-`, appended in a fixed order. Multiple filter tokens are concatenated with `-`. Applying them by URL rewrite (rather than clicking the filter UI and waiting for a re-render) is faster and stable across renders.

| Filter dimension | URL token | Values |
|---|---|---|
| Pagination offset | `or{N}` | 0, 10, 20, … (10 reviews per page) |
| Rating bubble | `filterRating-{n}` | `1`, `2`, `3`, `4`, `5` (single value per token; for multi-rating, request each then merge client-side) |
| Language | `filterLang-{code}` | `en`, `es`, `fr`, `de`, `it`, `pt`, `zh`, `ja`, `ru`, …; omit token for "all languages" |
| Sort order | controlled by the on-page `Sort` dropdown — see step 3a | `mostRecent` (default), `topRated`, `mostHelpful`, `detailed` |
| Search within reviews | `filterSearch-{urlenc-keyword}` | URL-encoded keyword; spaces become `+` |
| Trip type | `filterSegment-{TRIP_TYPE}` | `FAMILIES`, `COUPLES`, `SOLO`, `BUSINESS`, `FRIENDS` (Tripadvisor's `tripType` enum, uppercase) |
| Season (time of year) | `filterMonth-{range}` | `mar-may`, `jun-aug`, `sep-nov`, `dec-feb` |
| Hotel room class | `filterRoomType-{n}` | Tripadvisor's `roomClass` enum surfaced in the filter pill UI; varies per hotel |
| Restaurant meal type | `filterMeal-{n}` | `Breakfast`, `Lunch`, `Dinner`, `Drinks` (capitalized) |

Example with multiple filters — Le Bernardin, 5-bubble English-language couple reviews, page 2:

```
https://www.tripadvisor.com/Restaurant_Review-g60763-d426543-Reviews-or10-filterRating-5-filterLang-en-filterSegment-COUPLES-Le_Bernardin-New_York_City_New_York.html
```

**Token order is significant in some renders.** Tripadvisor's URL builder emits filters in this canonical order: `or{N}` → `filterRating-{n}` → `filterLang-{code}` → `filterSegment-{TYPE}` → `filterMonth-{range}` → `filterSearch-{keyword}` → `filterMeal-{n}` → `filterRoomType-{n}`. Off-order tokens sometimes redirect to a canonicalized URL (extra round-trip) or 404. Always emit in the order above.

#### 3a. Sort order (DOM-only filter)

Sort order is **not** encoded in the URL. It is set via a dropdown that updates Apollo state in-place. After page load, snapshot, click the `Sort` dropdown (selector `[data-test-target="reviews-sort-dropdown"]`), pick the matching item:

- `mostRecent` — "Most Recent" (default)
- `topRated` — "Highest"
- `detailed` — "Detailed"
- `mostHelpful` — "Most Helpful"

Wait ~1.5s for the review list to re-render before extraction.

### 4. Load the page and harvest entity-level fields

```bash
browse open "$URL" --remote --session "$SID"
browse get markdown body --remote --session "$SID" > page.md
```

Entity-level fields surface in the page header. Extract from the DOM using these selectors / patterns:

| Field | Source |
|---|---|
| Name | `<h1 data-automation="mainH1">` |
| Bubble rating (decimal) | `[data-automation="bubbleRatingValue"]` text, or `<svg class="UctUV ... bubble_*">` → derive from class suffix (`bubble_45` = 4.5) |
| Total review count | `[data-automation="reviewCount"]` text (parse "1,234 reviews" → integer) |
| Rating distribution | `[data-test-target="histogram"]` rows; each row has bubble count + numeric count |
| Ranking ("#3 of 12,345 Restaurants in NYC") | `[data-automation="ranking"]` text |
| Address | JSON-LD `<script type="application/ld+json">` block, `address.streetAddress` + `addressLocality` + `addressRegion` + `postalCode` + `addressCountry` |
| Lat/lon | JSON-LD `geo.latitude` / `geo.longitude` |
| Phone | JSON-LD `telephone` or `[data-automation="phone"]` |
| Website | `<a data-automation="website">` href (often an exit-window redirect — strip the `url=` query param) |
| Hours | JSON-LD `openingHours` (array of `Day HH:MM-HH:MM` strings) |
| Cuisine / category tags | JSON-LD `servesCuisine` (restaurants) or `[data-test-target="property-amenities"]` (hotels) |
| Price range | `[data-test-target="priceRange"]` text (e.g. `$$$$`) |
| Canonical URL | `<link rel="canonical">` href |
| `locationId` | `<meta name="locationId">` or extract `d{id}` from canonical URL |

Always read these from the **first** page load (the `or0` page), even if your caller only wants a later pagination slice — entity-level data is identical across pages but the histogram block sometimes lazy-loads on `or>0` URLs.

### 5. Extract review cards

Review cards are `<div data-automation="reviewCard">` blocks. Each card contains:

| Review field | Source |
|---|---|
| Review ID (`rr{id}`) | `[id^="rr"]` on the card's outer wrapper (Tripadvisor's review token) |
| Reviewer name | `[data-automation="reviewerName"]` |
| Reviewer profile URL | `<a href="/Profile/{username}">` on the reviewer-name link |
| Reviewer hometown | `[data-automation="reviewerHomeTown"]` text |
| Reviewer contributions | `[data-automation="reviewerContributions"]` text → "{N} contributions" |
| Reviewer helpful votes | `[data-automation="reviewerHelpfulVotes"]` text → "{N} helpful votes" |
| Reviewer level / badge | `[data-automation="reviewerBadge"]` text (e.g. "Top Contributor") — often absent |
| Rating (1-5 bubbles) | `svg.bubble_*` class on the card's bubble icon → derive (e.g. `bubble_50` = 5, `bubble_40` = 4) |
| Review date (ISO 8601) | `[data-automation="reviewDate"]` — visible text is human-readable ("Mar 2026"); JSON-LD inside each card carries the full ISO datestring under `datePublished` |
| Trip type | `[data-test-target="trip-type"]` (Families / Couples / …) — absent on reviews where reviewer skipped it |
| Stay date (hotels only) | `[data-test-target="stay-date"]` text → "Stayed: March 2026" |
| Title | `[data-automation="reviewTitle"]` |
| Body | `[data-automation="reviewText"]` — capture the full text. If a `Read more` button is present (`button[aria-expanded="false"]`), click it first; the truncated body excludes the tail |
| Helpful votes | `[data-automation="reviewHelpfulCount"]` numeric |
| Per-subcategory ratings (hotels) | `[data-test-target="subratings"]` block → `{ location, cleanliness, service, value, rooms, sleepQuality }` each a 1-5 bubble value |
| Photos | `[data-test-target="reviewPhotos"] img` srcset; collect URLs |
| Owner response | `[data-automation="ownerResponse"]` text + `[data-automation="ownerResponseDate"]` ISO date — absent when none |
| Permalink | The card's review-title anchor `<a href="/ShowUserReviews-g{g}-d{d}-r{reviewId}-...html">` (absolute via canonical host) |

If the page returns a Datadome captcha mid-session (rare with `--verified`, but possible after rapid filter changes), reload once after a 5-10 s pause; if the wall persists, **document the wall in the response** rather than retrying indefinitely. The session is poisoned at that point.

### 6. Paginate

Tripadvisor's review page is server-rendered with 10 reviews per page. Paginate by re-loading the URL with the next `or{N}` token (`or10`, `or20`, …). Cap by the user's requested `limit` or by the entity's `totalReviewCount`. For limit values above ~50, batch the requests and respect a ≥ 2 s spacing — rapid back-to-back loads from the same session sometimes trigger an intermediate Datadome challenge that times out a long extraction.

The on-page "Show more reviews" button on the bottom of long pages triggers Apollo's `LocationReviewListQuery` GraphQL and lazy-appends in-place — **don't use that path**. It is fragile, fires duplicate-review responses on filter changes, and locks the session to one filter dimension at a time. URL-rewrite pagination is faster, parallelizable, and lets the caller jump directly to deep offsets.

### 7. Output

Assemble entity + reviews into the structured output below (see "Expected Output"). On any wall hit or filter combination that produces zero results, return `success: true, reviews: []` with a `wall_hit` field if the empty result was caused by anti-bot interference rather than a legitimate zero-match filter — `wall_hit: true` is set when the page rendered the Datadome challenge body, `wall_hit: false` when the page rendered a proper "no reviews match your filters" message.

## Site-Specific Gotchas

- **Datadome is the wall, not Akamai.** Confirmed via 2026-05-18 probe — the 403 body redirects to `captcha-delivery.com` and carries a `dd` config object with `b: 1738966, s: 46694`. This means Verified strategies that work against Akamai (e.g. residential-only without verified fingerprint) are insufficient — Datadome additionally fingerprints JS execution timing, canvas, and TLS JA3. Use Browserbase `--verified` which handles these.
- **Internal GraphQL is reachable but cookie-signed.** `POST https://www.tripadvisor.com/data/graphql/ids` returns 405 on GET (endpoint alive) — but every reviewed PoC of out-of-band replay shows that the GraphQL handler requires session cookies (`TADCID`, `TASameSite`, `datadome`) that are minted by Datadome's interstitial JS and are bound to the browser fingerprint that minted them. Replaying captured request bodies from `curl` or `browse cloud fetch` returns 403. **Treat the GraphQL endpoint as confirmed-unreachable for out-of-band use.** Don't waste turns trying to bypass.
- **The official Tripadvisor Content API exists** at `https://api.content.tripadvisor.com/api/v1/location/...` (returns `401 Unauthorized` with `{"message":"Unauthorized"}` to unauthenticated callers, confirmed 2026-05-18). Requires a partner API key from `tripadvisor.com/developers` (free tier: 5,000 calls/month, paid tiers higher). For high-volume use, the partner API is dramatically more reliable than scraping. **Flag this to the caller** — if they have a partner key, route them to the partner-API skill (when it exists) instead of running this one.
- **`/TypeAheadJson` is Datadome-walled** even though it returns clean JSON for real browsers. Don't use it for name resolution — use the `/Search` page in-session (`browse open /Search?q=...`) or the partner-API search endpoint when keyed.
- **`/AllReviews`, `/ExpandedUserReviews`, `/SortReviews`, `/SetReviewFilter`, `/RatingPagingAjax`, `/UserReviewController`, `/ShowUserReviewsRestaurants`, `/ShowUserReviewsHotels`, `/ShowUserReviewsAttractions` are all in `robots.txt` `Disallow`** — they're legacy/internal endpoints. Don't probe them; they 403 or 404 from outside the session and aren't reachable in modern review widgets anyway.
- **`or{N}` offsets are zero-indexed, step of 10.** Page 1 = `or0`, page 2 = `or10`, page 50 = `or490`. Tripadvisor recently (Q4 2025) caps URL-driven pagination at `or9990` (1,000 pages); deeper offsets return a "We can't show you reviews past page 1000" page. For high-review-count entities (Eiffel Tower, Statue of Liberty), this is a hard ceiling — communicate it to the caller.
- **Multi-rating filter requires multiple round-trips.** Tripadvisor's UI only supports one `filterRating` token at a time (e.g. you can request "5-bubble only" or "4-bubble only" but not "4-or-5"). To return a multi-rating slice, request each rating separately and merge client-side. Same for trip type, language, and meal — single-value tokens only.
- **Locale-matched TLD beats `.com` for non-US entities.** UK restaurants on `tripadvisor.com` redirect to `.co.uk` with a different `g{geoId}` (Tripadvisor maintains separate geo trees per TLD). Open `.co.uk` directly when the entity is UK-based to avoid the redirect and the per-locale geo-tree mismatch.
- **`bubble_*` class encoding**: `bubble_10` = 1.0, `bubble_15` = 1.5, …, `bubble_50` = 5.0. Half-bubble ratings exist for the aggregate but not for individual reviews (individual reviews are integer 1-5 only). Some Tripadvisor markets use different class prefixes (`uctUV ... bubble_*` vs `_F bubble_*`) — match the numeric suffix, ignore the prefix.
- **Translated reviews vs. native-language reviews**: Tripadvisor auto-translates non-English reviews on `.com` pages. The translated text appears in `[data-automation="reviewText"]`; the original language source is in `[data-test-target="reviewOriginal"]` if the reviewer wrote in a different language. Capture both when available — caller may want either. The translation is machine-generated (Google Translate API under the hood) and is occasionally garbled.
- **Owner responses are not displayed on `or0` for some hotels** when there are >50 responses — they get paginated separately. The full response thread isn't reachable through the standard review URL; document this as a known truncation if owner responses matter.
- **The "Read more" button is required for reviews >200 characters.** Without clicking it, `[data-automation="reviewText"]` returns the truncated preview ending in `…`. Detect the `aria-expanded="false"` state and click it before extraction. The expansion is in-place — no DOM re-render, no scroll.
- **`status: candidate`** — this skill was authored from out-of-band probe evidence (Datadome wall confirmed, GraphQL endpoint mapped, robots.txt scoped, URL-filter taxonomy enumerated). The skill has **not** been end-to-end validated through a Browserbase verified+proxied browser session in the authoring sandbox because the sandbox's network policy blocks the `connect.browserbase.com` WebSocket. Re-validate against a live session before promoting to `launched`. Specific items to verify: (1) `--verified --proxies` clears the Datadome challenge on first load; (2) URL-token order matches the canonical order documented in step 3; (3) `data-automation` selectors are still current (Tripadvisor renames these every ~2 quarters); (4) JSON-LD blocks carry the documented fields.

## Expected Output

### Success — entity + reviews returned

```json
{
  "success": true,
  "wall_hit": false,
  "entity": {
    "name": "Le Bernardin",
    "type": "restaurant",
    "location_id": "426543",
    "geo_id": "60763",
    "canonical_url": "https://www.tripadvisor.com/Restaurant_Review-g60763-d426543-Reviews-Le_Bernardin-New_York_City_New_York.html",
    "address": {
      "street": "155 W 51st St",
      "city": "New York City",
      "state": "NY",
      "postal_code": "10019-7402",
      "country": "US"
    },
    "lat": 40.761742,
    "lon": -73.981903,
    "phone": "+1 212-554-1515",
    "website": "https://www.le-bernardin.com",
    "overall_rating": 4.5,
    "review_count": 4912,
    "ranking": {
      "rank": 12,
      "total": 8423,
      "category": "Restaurants in New York City"
    },
    "rating_distribution": {
      "5": 3120,
      "4": 1244,
      "3": 312,
      "2": 142,
      "1": 94
    },
    "cuisine": ["French", "Seafood", "Contemporary"],
    "price_range": "$$$$",
    "hours": [
      "Mo 17:30-22:00",
      "Tu-Fr 12:00-14:30,17:30-22:00",
      "Sa 17:30-22:00"
    ]
  },
  "filters_applied": {
    "rating": [5],
    "language": "en",
    "trip_type": "COUPLES",
    "sort": "mostRecent",
    "limit": 10,
    "offset": 0
  },
  "reviews": [
    {
      "review_id": "rr988123456",
      "permalink": "https://www.tripadvisor.com/ShowUserReviews-g60763-d426543-r988123456-Le_Bernardin-New_York_City_New_York.html",
      "rating": 5,
      "date": "2026-04-12",
      "title": "Best meal of our anniversary trip",
      "body": "Eric Ripert's kitchen continues to set the bar... [full text, Read-more expanded]",
      "trip_type": "COUPLES",
      "language": "en",
      "stay_date": null,
      "helpful_votes": 7,
      "subratings": null,
      "photos": [
        "https://media-cdn.tripadvisor.com/media/photo-l/abc.jpg"
      ],
      "owner_response": null,
      "reviewer": {
        "name": "JaneD",
        "profile_url": "https://www.tripadvisor.com/Profile/JaneD",
        "hometown": "Boston, Massachusetts",
        "contributions": 47,
        "helpful_votes_total": 92,
        "badge": "Top Contributor"
      }
    }
  ]
}
```

### Hotel — with subratings + owner response

```json
{
  "review_id": "rr991234567",
  "rating": 4,
  "date": "2026-03-28",
  "trip_type": "FAMILIES",
  "stay_date": "2026-03",
  "title": "Lovely stay, minor service hiccup",
  "body": "...",
  "subratings": {
    "location": 5,
    "cleanliness": 5,
    "service": 3,
    "value": 4,
    "rooms": 4,
    "sleepQuality": 5
  },
  "owner_response": {
    "text": "Thank you for the detailed feedback — we've addressed the front-desk timing issue with our team. We hope to welcome you back.",
    "date": "2026-04-02",
    "responder_name": "Hotel Manager"
  },
  "reviewer": { "name": "...", "...": "..." }
}
```

### Wall hit — anti-bot interception

```json
{
  "success": false,
  "wall_hit": true,
  "reason": "datadome_challenge",
  "entity": { "name": "Le Bernardin", "location_id": "426543", "canonical_url": "..." },
  "filters_applied": { "...": "..." },
  "reviews": [],
  "diagnostic": "Page returned Datadome captcha (403, captcha-delivery.com redirect) after applying filters. Session fingerprint may be flagged. Retry with a fresh --verified --proxies session."
}
```

### Ambiguous entity — caller needs to disambiguate

```json
{
  "success": false,
  "reason": "ambiguous_name",
  "candidates": [
    {
      "name": "The Ritz London",
      "type": "hotel",
      "city": "London",
      "country": "UK",
      "canonical_url": "https://www.tripadvisor.co.uk/Hotel_Review-g186338-d193091-Reviews-The_Ritz_London-London_England.html",
      "location_id": "193091"
    },
    {
      "name": "The Ritz-Carlton, Naples",
      "type": "hotel",
      "city": "Naples",
      "country": "US",
      "canonical_url": "https://www.tripadvisor.com/Hotel_Review-g34467-d108845-Reviews-The_Ritz_Carlton_Naples-Naples_Florida.html",
      "location_id": "108845"
    }
  ]
}
```

### Entity not found

```json
{
  "success": false,
  "reason": "entity_not_found",
  "query": "Foo Bar Restaurant, Nowheresville",
  "candidates": []
}
```

### Pagination ceiling hit

```json
{
  "success": true,
  "wall_hit": false,
  "entity": { "...": "..." },
  "filters_applied": { "offset": 9990, "limit": 10 },
  "reviews": [],
  "diagnostic": "Tripadvisor caps URL-driven pagination at or9990 (1,000 pages). Use filter dimensions (rating / trip_type / language) to narrow the result set instead of paginating deeper."
}
```
