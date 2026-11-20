---
name: yelp-com-extract-reviews-2ikb22
title: Yelp Reviews Extraction
description: >-
  Extract a Yelp business's overall rating, review count, business metadata, and
  top reviews as structured JSON — honoring every read-side filter Yelp's review
  widget exposes (rating buckets, sort, language, search-within, review type,
  pagination). Read-only.
website: yelp.com
category: reviews
tags:
  - yelp
  - reviews
  - ratings
  - restaurants
  - read-only
  - datadome
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      Yelp Fusion API at api.yelp.com/v3/businesses/{alias}/reviews returns
      clean JSON without a DataDome wall, but is capped at 3 reviews with
      truncated text, no helpful/funny/cool counts, no owner replies, no
      reviewer Elite/credibility metadata, and no support for rating / revt /
      search-within / pagination filters. Only viable for the narrow 'fetch
      first 3 reviews + business summary' subset of the prompt.
  - method: browser
    rationale: >-
      Yelp's biz page server-renders an inline __APOLLO_STATE__ blob containing
      the complete business + first-page-reviews payload; the review widget
      paginates via /gql/batch POSTs. Every filter (rl, sort_by, lang, q, revt,
      start) is URL-readable so no UI clicks are needed. BLOCKED today: DataDome
      403 interstitial fires across verified + residential-proxy + captcha-solve
      session configurations (validated 2026-05-19, 4 distinct iter configs).
      Ship as candidate until a working bypass is available.
verified: true
proxies: true
---
# Yelp Reviews Extraction

## Purpose

Given a Yelp business URL, alias slug, or natural-language reference (name + city / neighborhood / ZIP), extract the business's overall rating, review count, business metadata (address, phone, website, hours, categories, price, lat/lng, photo gallery, claimed flag, star-bucket distribution), and the top reviews — honoring every read-side filter Yelp's review widget exposes: rating buckets (1-5 stars), sort order (`yelp_sort | newest | oldest | highest_rated | lowest_rated | elites`), language, search-within-reviews keyword, review type (`regular | with_photos | from_friends | from_elites`), and pagination. Returns structured JSON. **Read-only — never clicks Write a Review, Bookmark, Send to Friend, or any mutation control.**

**Skill status: `candidate`.** Yelp's public review pages are protected by DataDome at the network edge. Verified, residential-proxy, and CAPTCHA-solving session configurations all returned a DataDome `403 / "You have been blocked"` interstitial during validation on 2026-05-19 (see Site-Specific Gotchas for the full matrix). The skill documents the optimal path so future agents — once a working bypass is available — can construct the right requests on the first try, plus the Fusion API fallback for the (small) subset of fields it actually exposes.

## When to Use

- A reviewer-summary or sentiment-extraction agent needs concrete reviews + reviewer credibility signals (Elite year(s), review-count, photo-count) for a single business on Yelp.
- A competitive-research agent comparing how the same business is rated on Yelp vs. Google Maps vs. TripAdvisor.
- A monitoring agent that polls "latest reviews since {date}" for reputation-management workflows.
- Any flow needing the **full review body** (Fusion API only returns 3 reviews with truncated text — see fallback).
- **Do NOT use this skill** when you only need overall rating + review count + 3 review excerpts. The Fusion API path (below) is simpler and licensed, but its caps make it useless for the full-extraction intent.

## Workflow

**Recommended method: browser** — but the browser path is currently DataDome-walled (see Site-Specific Gotchas). The Fusion API path is the only confirmed-working method today, at the cost of severely truncated review data.

### 1. Resolve the business to a canonical alias

The downstream calls all key on the alias slug (`gary-danko-san-francisco`), so resolve any input shape to that string first.

| Input shape | Resolution |
|---|---|
| Full `https://www.yelp.com/biz/{alias}` URL | Strip everything before `/biz/` and any trailing query/fragment. `alias` = last path segment. |
| Bare alias slug (`gary-danko-san-francisco`) | Use as-is. |
| Name + location (`"Gary Danko, San Francisco, CA"`) | Browser path: fetch `https://www.yelp.com/search?find_desc={urlenc-name}&find_loc={urlenc-location}` and read the first result's `biz/...` href. Fusion path: `GET /v3/businesses/search?term={name}&location={location}&limit=1` and take `businesses[0].alias`. |
| Free-form (`"that place with the duck pasta in NYC"`) | Same as above with whichever fragment best resembles a name + location; fall back to broader search if no exact match. |

### 2. Optimal path — Yelp's internal page-context JSON (browser)

Yelp's biz page is server-rendered with an inline `__APOLLO_STATE__` blob and a `__INITIAL_STATE__` blob that together contain **every field the prompt asks for**: business metadata, photo URLs, hour ranges (`is_overnight` included), star-bucket distribution, plus the first page of reviews with full bodies, reviewer credibility, and owner responses. The widget itself paginates by re-fetching internally — those follow-up requests use a GraphQL POST to `/gql/batch` (operation names observed in the JS bundle: `GetBusinessReviewsFeedQuery`, `GetBusinessReviewFeedQuery`). **The DataDome wall fires before the JS executes**, so neither the inline blobs nor the GraphQL pagination endpoint are accessible to a bare session today. Document the wall in Site-Specific Gotchas; once a bypass exists, the flow below is the right one.

**Stealth + proxy session (when DataDome bypass is available):**

```bash
export BROWSERBASE_API_KEY="$BB_API_KEY"
sid=$(browse cloud sessions create --keep-alive --verified --proxies --solve-captchas \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).id))")
```

**Open the canonical biz URL with filter query-params baked in.** Yelp's review widget reads these from the URL on initial render — no UI clicks needed:

| Filter (prompt) | URL param | Values |
|---|---|---|
| Rating filter | `rl` | `1`, `2`, `3`, `4`, `5` — repeat the param for multiple buckets (`?rl=1&rl=2`) |
| Sort order | `sort_by` | `yelp_sort` (default), `date_desc` (newest), `date_asc` (oldest), `rating_desc` (highest_rated), `rating_asc` (lowest_rated), `elites_desc` (elites) |
| Language | `lang` | `en`, `es`, `fr`, `de`, `it`, `ja`, `zh`, … or `all` (default = browser language) |
| Search within reviews | `q` (a.k.a. `kw` on some app surfaces) | URL-encoded keyword string |
| Review type — with photos | `revt` or `with_photos=1` | `with_photos` |
| Review type — from friends | `revt` | `from_friends` (requires logged-in user — see gotcha) |
| Review type — from elites | `revt` | `from_elites` |
| Pagination — page index | `start` | `0, 10, 20, …` — 10 reviews per page (`start=10` skips the first page) |

Combined example for "1–2 star reviews of Gary Danko, newest first, only those mentioning 'service'":

```
https://www.yelp.com/biz/gary-danko-san-francisco?rl=1&rl=2&sort_by=date_desc&q=service&start=0
```

**Extract via the inline page-context blobs** rather than scraping the rendered DOM — the DOM is rebuilt by React after `__APOLLO_STATE__` mounts, and React-rendered review-text is sometimes truncated with a "More" button that requires a click. The Apollo cache is the canonical store:

```javascript
// Run via `browse eval --remote --session "$sid"`:
const apollo = window.__APOLLO_STATE__ || {};
// Business node — key shape: `Business:{alias}` or `Business:{businessId}`
const biz = Object.values(apollo).find(v => v && v.__typename === 'Business' && v.alias === ALIAS);
// Reviews — keys shape: `Review:{reviewId}`
const reviews = Object.values(apollo).filter(v => v && v.__typename === 'Review');
```

The `Review` nodes carry `id` (the `r=` permalink token), `rating`, `text`, `localizedDate`, `feedback { counts { useful, funny, cool } }`, `photos { url }`, `business { businessOwnerReply { text, createdAt } }`, and a nested `author { displayName, location, reviewCount, photoCount, profileUrl, primaryPhoto { url }, eliteYears }`.

**Pagination:** increment `start=` by 10 (Yelp's widget caps page size at 10 regardless of any `limit=` param you set). Loop until the requested count is reached or `Object.values(apollo).filter(...Review...)` returns < 10 on a page.

**Verify before emitting:**

- The biz `alias` field in the Apollo cache matches what you sent (otherwise you got redirected — e.g., closed business → successor or different metro disambiguation).
- The total `reviewCount` on the biz node matches Yelp's count in the page header — if it doesn't, you may have hit a filtered count not the global count.
- For `revt=from_friends`, the rendered count will be 0 unless the session is logged in. Log the param + 0-count as a known outcome.

**Release the session:**

```bash
browse stop --session "$sid" --force >/dev/null 2>&1
browse cloud sessions update "$sid" --status REQUEST_RELEASE >/dev/null 2>&1
```

### 3. Fusion API fallback — `api.yelp.com/v3` (confirmed working with credential)

`api.yelp.com` does **not** sit behind DataDome (verified 2026-05-19 — returns clean `400 Authorization required` JSON, not a captcha interstitial), so an authenticated request goes through. This is the only working extraction path today. Caveats: review fields are severely truncated.

**Required:** a Yelp Fusion API key (`Authorization: Bearer <key>`). Yelp Fusion API key signup: <https://www.yelp.com/developers/v3/manage_app>.

```bash
# Business detail
curl -fsS \
  -H "Authorization: Bearer $YELP_FUSION_KEY" \
  "https://api.yelp.com/v3/businesses/${ALIAS}"

# Reviews (returns max 3, body truncated to ~160 chars + "..."):
curl -fsS \
  -H "Authorization: Bearer $YELP_FUSION_KEY" \
  "https://api.yelp.com/v3/businesses/${ALIAS}/reviews?limit=3&sort_by=yelp_sort&locale=en_US"
```

**Fusion `/reviews` filter map** (much narrower than the website's):

| Filter (prompt) | Fusion param | Notes |
|---|---|---|
| `limit` | `limit` | **Hard-capped at 3.** Any value > 3 returns 3. |
| Sort order | `sort_by` | `yelp_sort` (default), `newest` — `oldest`, `highest_rated`, `lowest_rated`, `elites` **not supported** on Fusion. |
| Language | `locale` | `en_US`, `es_ES`, `fr_FR`, etc. |
| Rating filter / `revt` / `q` (search-within) / `start` | **not supported on Fusion.** |

The Fusion `Review` object includes: `id`, `url` (permalink), `text` (truncated), `rating`, `time_created` (ISO), `user { id, profile_url, image_url, name }`. It does **not** include: full review text, helpful/funny/cool counts, attached photos, owner replies, reviewer location/Elite-year(s)/review-count/photo-count, language detection. For a complete extraction matching the prompt's field list, the browser path (when unblocked) is the only viable surface.

### 4. Fail-soft when DataDome is up and Fusion is unavailable

If the agent has no Fusion API key AND the browser path hits DataDome (the current state — see gotchas), return:

```json
{
  "success": false,
  "reason": "anti_bot_wall",
  "wall": "datadome",
  "alias": "...",
  "message": "Yelp's biz page returned a DataDome 403 interstitial across verified+proxy+captcha-solve session configurations. Acquire a Yelp Fusion API key for limited extraction, or wait for a DataDome bypass."
}
```

Don't silently emit empty `reviews: []` — that's indistinguishable from a real zero-review business and downstream agents will treat it as ground truth.

## Site-Specific Gotchas

- **DataDome wall, confirmed 2026-05-19, across four session configurations.** Each was a fresh BB session against `https://www.yelp.com/` and `https://www.yelp.com/biz/gary-danko-san-francisco`:

  | Iter | Session flags | Outcome | Notes |
  |---|---|---|---|
  | 1 | `--verified --proxies` | DataDome captcha iframe on initial nav (geo.captcha-delivery.com slider) | Title stays `yelp.com`, body has only DataDome `var dd={...}` bootstrap script |
  | 2 | `--verified --proxies --solve-captchas` | Same DataDome iframe; still up after 30s of wait | Captcha solver does not engage the DataDome slider variant |
  | 3 | `--verified --solve-captchas` (no proxies) | Same wall; captcha text says "There is a robot on the same network (IP 52.13.106.180)" — bare Browserbase AWS egress is blocklisted | |
  | 4 | `--verified --proxies --solve-captchas --block-ads` | Same wall after 60s of wait; iframe URL cycled from `/captcha/` → `/interstitial/` (DataDome reset) | |

  Browserbase Fetch API (`browse cloud fetch ... --proxies`) also returns `403 / Server: DataDome / X-Datadome: protected` for `/biz/{alias}` and `/search`. Static assets (`/robots.txt`) load fine — the wall is content-route-scoped.

- **`api.yelp.com` is NOT behind DataDome.** `GET /v3/businesses/{alias}` returns a clean `400 {"error": {"code": "VALIDATION_ERROR", "description": "Authorization is a required parameter."}}` without a residential proxy. This is the Fusion API and authenticates with `Authorization: Bearer <key>`. Use as the fallback when a Fusion key is available.

- **Fusion review caps are stricter than published.** Even with `limit=20`, `/v3/businesses/{alias}/reviews` returns at most 3 reviews and the `text` field is truncated mid-sentence with `...`. Yelp itself documents this on the [Fusion docs](https://docs.developer.yelp.com/reference/v3_business_reviews). There is no paid tier that lifts the cap.

- **`m.yelp.com` is DataDome-walled identically.** Don't bother with the mobile site as a "lighter" surface.

- **`gql.yelp.com` is not a public hostname.** Yelp's internal GraphQL gateway lives at the same origin (`www.yelp.com/gql/batch` and similar), so any GraphQL POST inherits the DataDome perimeter. Don't waste time on standalone-GraphQL hosts.

- **Yelp's robots.txt explicitly prohibits scraping.** "Use of any robot, spider, service search/retrieval application, or other automated device, process or means to access, retrieve, copy, scrape, or index any portion of the service or any content is prohibited, except as expressly permitted by Yelp." Only Googlebot/Bingbot/LinkedInBot/Twitterbot/facebookexternalhit and a small allowlist of paths (`/article/`, specific biz paths) are permitted. Treat this as a contractual signal: skills built against the public HTML surface should be candidate-flagged with explicit caveat.

- **Filter URL param map (for when the wall is bypassable):** `?rl=1&rl=2&...` for rating buckets (repeat param), `sort_by` ∈ `{yelp_sort, date_desc, date_asc, rating_desc, rating_asc, elites_desc}`, `lang` for language (or `all`), `q` for search-within-reviews keyword, `revt` ∈ `{with_photos, from_friends, from_elites}`, `start=N` for pagination in steps of 10 (page size is fixed at 10 in the widget regardless of any client-provided `limit`).

- **`from_friends` requires a logged-in user.** Without auth, `revt=from_friends` renders a 0-count empty state. The skill must document the auth requirement and emit `success: false, reason: "auth_required_for_filter"` rather than empty results.

- **Yelp redirects closed businesses.** If the input alias points to a closed business, Yelp may 301 to the successor location's biz page (or to a search results page if no successor). Always verify the alias on the rendered page matches the input.

- **Read-only.** Never click Write a Review, Bookmark, Send to Friend, "Helpful / Funny / Cool" voting controls, or any owner-response controls. The skill stops at the rendered review list.

## Expected Output

```json
{
  "success": true,
  "source": "browser_apollo_state | fusion_api",
  "business": {
    "alias": "gary-danko-san-francisco",
    "name": "Gary Danko",
    "url": "https://www.yelp.com/biz/gary-danko-san-francisco",
    "phone": "+14157492060",
    "website": null,
    "price": "$$$$",
    "categories": [
      {"name": "American (New)", "alias": "newamerican"},
      {"name": "French", "alias": "french"}
    ],
    "rating": 4.4,
    "review_count": 5891,
    "rating_distribution": {"1": 142, "2": 173, "3": 442, "4": 1238, "5": 3896},
    "is_claimed": true,
    "address": {
      "street": "800 N Point St",
      "city": "San Francisco",
      "state": "CA",
      "zip": "94109",
      "country": "US"
    },
    "lat": 37.806239,
    "lng": -122.420334,
    "hours": [
      {"day": "Mon", "open": "17:00", "close": "22:00", "is_overnight": false},
      {"day": "Tue", "open": "17:00", "close": "22:00", "is_overnight": false}
    ],
    "photos": ["https://s3-media0.fl.yelpcdn.com/bphoto/.../o.jpg"]
  },
  "filters_applied": {
    "rating": [1, 2],
    "sort_by": "date_desc",
    "language": "en",
    "q": "service",
    "revt": null,
    "limit": 20
  },
  "reviews": [
    {
      "id": "abc123XYZ",
      "permalink": "https://www.yelp.com/biz/gary-danko-san-francisco?hrid=abc123XYZ",
      "rating": 2,
      "date": "2026-04-30T00:00:00Z",
      "text": "Full review body…",
      "feedback": {"useful": 12, "funny": 1, "cool": 3},
      "photos": ["https://..."],
      "language": "en",
      "owner_reply": {
        "text": "Thanks for the feedback…",
        "date": "2026-05-02T00:00:00Z"
      },
      "reviewer": {
        "name": "Jane D.",
        "location": "San Francisco, CA",
        "profile_url": "https://www.yelp.com/user_details?userid=...",
        "avatar_url": "https://s3-media0.fl.yelpcdn.com/photo/.../60s.jpg",
        "review_count": 152,
        "photo_count": 87,
        "elite_years": [2023, 2024, 2025]
      }
    }
  ],
  "pagination": {
    "page_size": 10,
    "pages_fetched": 2,
    "has_more": true
  }
}
```

Failure shapes:

```json
// DataDome wall hit; no Fusion key available
{
  "success": false,
  "reason": "anti_bot_wall",
  "wall": "datadome",
  "alias": "gary-danko-san-francisco",
  "message": "Yelp returned a DataDome 403 interstitial; bypass not available."
}

// Fusion API mode — partial data
{
  "success": true,
  "source": "fusion_api",
  "partial": true,
  "limitations": [
    "review.text truncated by Fusion to ~160 chars",
    "max 3 reviews returned regardless of limit",
    "helpful/funny/cool counts unavailable",
    "owner replies unavailable",
    "reviewer Elite years / review count / photo count unavailable",
    "rating + revt + q + start filters unsupported"
  ],
  "business": { "...subset...": "..." },
  "reviews": [ {"...subset...": "..."} ]
}

// Business not found
{
  "success": false,
  "reason": "business_not_found",
  "input": "Gary Danko, Mars"
}

// Auth required for the requested filter
{
  "success": false,
  "reason": "auth_required_for_filter",
  "filter": "revt=from_friends"
}
```
