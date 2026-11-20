---
name: substack-com-search-newsletters-4cecca
title: Substack Search Newsletters
description: >-
  Search Substack for newsletters / publications matching a topic, keyword,
  category, language, or author and return matching publications with
  subscriber-tier signals, multi-currency pricing, recent post samples, and
  canonical URLs as structured JSON. Read-only.
website: substack.com
category: publishing
tags:
  - substack
  - newsletters
  - publications
  - discovery
  - read-only
  - creator-economy
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      Substack's /search and /discover pages are React-rendered and hydrate from
      the same JSON endpoints — the API path is ~50× cheaper per page. Only fall
      back to the browser if the JSON endpoints ever start gating (we observed
      no anti-bot wall during iteration); then extract from <script
      id="__NEXT_DATA__"> in the rendered HTML.
verified: false
proxies: true
---
# Substack Search Newsletters

## Purpose

Search Substack for newsletters / publications matching a topic, keyword, category, language, or author and return the matching publications as structured JSON — including publication ID + subdomain, name, tagline, author(s) with profile handles, logo, **publicly surfaced subscriber-tier signals** (Substack hides exact paid-subscriber counts behind tiered badges), full multi-currency paid-plan pricing, free-tier availability, recent post samples, and the canonical publication URL. Read-only — never click Subscribe / Pledge / Get Started / Sign In.

## When to Use

- "Find me the top {category} newsletters on Substack."
- "Which Substack publications match the keyword `<query>`?"
- "Pull pricing, author, and recent posts for newsletter `<X>`."
- Bulk research / due-diligence / competitive landscape over Substack's discovery surface.
- Building a creator-prospecting list (best-seller tier filter, paid-tier filter, language filter).
- Resolving an author name or full publication URL to the canonical Substack record.

## Workflow

Substack's public discovery UI is a thin client over **three unauthenticated JSON endpoints on `substack.com`** plus a **per-publication `/api/v1/archive` endpoint on each publication's subdomain**. The optimal path is direct HTTP calls — no browser, no auth, no anti-bot Verified — only `--proxies` for the cloud fetch hop. Substack has **no observed anti-bot wall** on these endpoints; standard `browse cloud fetch --proxies` works on every call we made during iteration.

There is no documented sort parameter on the search endpoint (any `sort=` / `offset=` / `limit=` you supply is silently ignored — see the Gotchas section). For sort dimensions beyond Substack's default "relevance" you have to use the category leaderboard endpoint (`/api/v1/category/public/{id}/{tier}`) which has its own ranking, or sort the results client-side using the fields documented below.

### 1. Map the user's intent to one of three entry endpoints

| Intent | Endpoint |
|---|---|
| Free-form keyword / topic query, author name, or "matching `<X>`" | `GET https://substack.com/api/v1/publication/search?query=<URL-enc>&page=0` |
| Category browse (`Top in {Category}`, `Politics newsletters`, `Tech Substacks`) | `GET https://substack.com/api/v1/category/public/{categoryId}/{tier}?page=0` |
| Single publication detail (URL given, e.g. `https://<sub>.substack.com/`) | `GET https://<sub>.substack.com/api/v1/archive?sort=new&limit=10` plus the same `/publication/search?query=<sub>` to pull the publication record itself |

Choose by the most specific signal in the user input. If both a category AND a keyword are provided, run the search and then filter results client-side on `r.author_badge?.tier`, `r.rankingDetailOrderOfMagnitude`, `r.plans`, `r.language`, etc. (the search endpoint applies a category-aware ranking automatically when the query matches a category name).

### 2. Resolve `categoryId` for category browse

Call `GET https://substack.com/api/v1/categories` once and cache. Returns 32 entries: 31 top-level categories + one `podcast` pseudo-entry. Each has `id` (numeric), `name`, `slug`, `emoji`, `leaderboard_description`. The IDs you'll need most often:

| ID | Name | Slug |
|---:|---|---|
| 96 | Culture | `culture` |
| 4 | Technology | `technology` |
| 62 | Business | `business` |
| 153 | Finance | `finance` |
| 13645 | Food & Drink | `food` |
| 94 | Sports | `sports` |
| 76739 | U.S. Politics | `us-politics` |
| 76740 | World Politics | `world-politics` |
| 76741 | Health Politics | `health-politics` |
| 103 | News | `news` |
| 11 | Music | `music` |
| 134 | Science | `science` |
| 18 | History | `history` |
| 109 | Travel | `travel` |
| 118 | Crypto | `crypto` |
| 355 | Health & Wellness | `health` |
| 339 | Literature | `literature` |
| 284 | Fiction | `fiction` |
| 387 | Comics | `comics` |
| 61 | Design | `design` |
| 11414 | Climate & Environment | `climate` |
| 1796 | Parenting | `parenting` |
| 114 | Philosophy | `philosophy` |
| 223 | Faith & Spirituality | `faith` |
| 49715 | Fashion & Beauty | `fashionandbeauty` |
| 49692 | Humor | `humor` |
| 51282 | International | `international` |
| 34 | Education | `education` |
| 15417 | Art & Illustration | `art` |
| 76782 | Film & TV | `film-and-tv` |
| 76866 | Home & Garden | `home-garden` |

`{tier}` ∈ `all` (default ranking), `paid` (paid pubs only — `plans?.length > 0`), `free` (free-friendly ranking; paid pubs still appear). Pagination via `page=N` (0-indexed). 25 publications per page. Response shape: `{ publications: [...], more: bool, title: "Top in <Name>" }`.

### 3. Search

```
GET https://substack.com/api/v1/publication/search?query=<URL-enc>&page=0
```

Returns `{ results: [...18-20 pubs], more: bool }`. **Page size is fixed at 18-20** — `limit` is silently ignored. Pagination via `page=N` (0-indexed). The `language=<code>` param (`en`, `es`, `fr`, …) **boost-ranks** matches in that language to the top but does NOT strict-filter (English results bleed in lower; filter client-side on `r.language` if strictness matters). The endpoint accepts an empty `query=` parameter but then returns `{ results: [] }`.

### 4. Decode each publication record

Each `results[i]` (and each `publications[i]` from the category endpoint) is a ~141-field publication object. The fields you actually need:

| Output field | Source field | Notes |
|---|---|---|
| `publication_id` | `id` | numeric, stable |
| `subdomain` (slug) | `subdomain` | the `*.substack.com` prefix; the canonical key |
| `name` | `name` | display name |
| `tagline` | `hero_text` \|\| `copyright` | one-liner |
| `language` | `language` | ISO 639-1 code |
| `canonical_url` | `base_url` | full HTTPS; use this over `hostname` |
| `hostname` | `hostname` | may equal `<sub>.substack.com` or a custom domain |
| `custom_domain` | `custom_domain` | non-null when pub uses a custom domain (e.g. `www.understandingai.org`) |
| `logo_url` | `logo_url` (or `logo_url_wide`) | Substack CDN URL |
| `cover_photo_url` | `cover_photo_url` | nullable |
| `hero_image` | `hero_image` | nullable |
| `created_at` | `created_at` | ISO timestamp |
| `first_post_date` | `first_post_date` | ISO timestamp (use for "active since") |
| `type` | `type` | `newsletter` \| `podcast` \| etc. |
| `has_podcast` | `has_podcast`, `has_free_podcast`, `has_subscriber_only_podcast` | three booleans |
| `payments_state` | `payments_state` | `enabled` (accepts paid subs) \| `disabled` (free-only) |
| `is_paid` (derived) | `plans?.length > 0 && payments_state==="enabled"` | |
| `plans[]` | `plans` | array of Stripe-shaped plan objects; see step 5 |
| `bundles[]` | `bundles` | cross-publication bundles; usually empty |
| `primary_author.name` | `author_name` | |
| `primary_author.id` | `author_id` | numeric |
| `primary_author.handle` | `author_handle` | the `@handle` |
| `primary_author.profile_url` | `https://substack.com/@${author_handle}` | construct |
| `primary_author.bio` | `author_bio` | |
| `primary_author.photo_url` | `author_photo_url` | |
| `contributors[]` | `contributors` | additional bylines |
| `subscriber_signal.badge_tier` | `author_bestseller_tier` | numeric: `0` \| `100` \| `1000` \| `10000` \| `100000` |
| `subscriber_signal.badge_type` | `author_badge?.type` | `bestseller` \| `vip` \| `subscriber` \| `null` |
| `subscriber_signal.paid_label` | `rankingDetail` | e.g. `"Thousands of paid subscribers"` |
| `subscriber_signal.paid_om` | `rankingDetailOrderOfMagnitude` | matches `author_bestseller_tier` |
| `subscriber_signal.total_label` | `rankingDetailFreeIncluded` | e.g. `"Hundreds of thousands of subscribers"` |
| `subscriber_signal.total_om` | `rankingDetailFreeIncludedOrderOfMagnitude` | |
| `subscriber_signal.free_count_label` | `rankingDetailFreeSubscriberCount` | sometimes a precise integer string: `"Over 257,000 subscribers"` — parse with `/Over ([\d,]+) subscribers/` |

### 5. Parse `plans[]` for pricing

Each plan is a **Stripe Plan object** (literally — Substack passes Stripe's shape through). For each plan:

- `interval` ∈ `month` \| `year` (or `null` for founding-only)
- `amount` — integer in **cents** of base currency (divide by 100)
- `currency` — lowercase 3-letter code (almost always `usd`)
- `currency_options` — map of 13 currencies (`aud, brl, cad, chf, dkk, eur, gbp, mxn, nok, nzd, pln, sek, usd`) with `.unit_amount` (cents) for that currency. Use this for non-USD output without doing your own FX.
- `metadata.founding === "yes"` → founding-member tier (`plan.amount` is the minimum founding contribution).
- `nickname` — human label, e.g. `"$120 a month"`, `"$200 a year"`.

Emit `pricing.monthly_usd`, `pricing.annual_usd`, `pricing.founding_min_usd`, and `pricing.currencies[<cur>] = { monthly, annual, founding_min }` from these.

### 6. Attach recent post samples (one extra request per publication)

```
GET https://<subdomain>.substack.com/api/v1/archive?sort=new&limit=10
```

Returns a bare array (no envelope). Per-post fields: `id`, `title`, `slug`, `post_date` (ISO), `audience` (`everyone` \| `only_paid` \| `only_free`), `type` (`newsletter` \| `podcast` \| `thread`), `canonical_url` (authoritative — may be a custom-domain URL), `cover_image`, `reactions` (`{<emoji>: count}` map; for v1 just use `"❤"`), `reaction_count`, `comment_count`, `truncated_body_text` (first ~300 chars). Build `post_url = post.canonical_url ?? https://${subdomain}.substack.com/p/${slug}`.

Derive `last_post_date` from `posts[0].post_date`. Approximate `post_frequency` from the timestamp deltas of the most recent 5-10 posts.

### 7. Paginate

For search: increment `page=N` until `more === false`. For category leaderboard: same. There is no cursor — just a page counter.

### 8. Filter / sort client-side

All filters described in the task surface (subscriber tier, price range, recency, bestseller-only, language strictness, paid-only, free-only) must be applied **after fetch** because the API only exposes `page`, `language` (boost), and `{tier}` on the category endpoint. Sort dimensions other than Substack's default ("Most relevant") must be re-applied client-side over `author_bestseller_tier` (desc → "Most subscribers"), `first_post_date` (desc → "Newest"), or `posts[0].post_date` (desc → "Most recent post").

### Browser fallback

Only fall back to the browser when the API is somehow unreachable (we never saw this). The `/search/` and `/discover/category/<slug>` pages are React-rendered and yield **0 accessibility refs** on a fresh `browse snapshot` — you'd need `browse get html body` + regex extraction of `<script id="__NEXT_DATA__" type="application/json">…</script>` to recover what the API would have returned in one round-trip. Cost premium vs. API: ~50× per page (full HTML render + proxy bytes vs. a small JSON response).

```bash
sid=$(BROWSERBASE_API_KEY="$BB_API_KEY" browse cloud sessions create --keep-alive --proxies | jq -r '.id')
browse open "https://substack.com/search/<URL-enc-query>" --remote --session "$sid"
browse wait load --remote --session "$sid"
HTML=$(browse get html body --remote --session "$sid")
echo "$HTML" | grep -oP '<script id="__NEXT_DATA__"[^>]*>\K[^<]+' | head -1 \
  > /tmp/next-data.json
# Walk /tmp/next-data.json.props.pageProps for the same publication objects.
```

## Site-Specific Gotchas

- **No anti-bot wall observed.** Plain `browse cloud fetch --proxies` returns 200 on every search, category, and archive endpoint we hit during iteration. `--verified` (Verified) is overkill for the API path — only enable if you fall back to browser rendering. No CAPTCHA, no Akamai, no Cloudflare interstitial.
- **`limit`, `offset`, and `sort` are silently ignored on `/publication/search`.** Page size is fixed at ~18-20. Pagination is `page=N` (0-indexed) ONLY. We verified: `offset=18` and `offset=20` both return the same first-page results as `offset=0`; `sort=top|new|most_subscribers` all produce identical orderings. Substack ranks search by an internal relevance score and exposes no public sort. Any required sort must be applied client-side after pagination.
- **`/api/v1/publication/by-category` is 403 "Not authorized".** Don't waste time on it — `/api/v1/category/public/{id}/{tier}` is the public surface. `categoryId=` on the search endpoint is also a no-op.
- **`/api/v1/post/search?query=<X>` returns empty without auth.** The post-search surface requires a logged-in session even though the path is shaped like a public endpoint. For "find a Substack post matching X" you have to (a) search for publications then (b) walk each pub's `/api/v1/archive`. Don't promise post-text search from this skill — it's a publication-search skill.
- **`limit=` on the category leaderboard is also ignored.** Always 25/page. Pagination via `page=N`.
- **`language=<code>` boost-ranks, doesn't strict-filter.** Top results match the language; English bleeds in further down (we observed `language=fr` returning 16 `fr` + 4 `en` results). If strictness matters, filter on `r.language` client-side.
- **Empty `query=` returns `{ results: [] }`** — not a generic "trending" feed. There is no public "trending" API; the homepage's trending row is hydrated via internal endpoints that 404 cookielessly (`/api/v1/discovery/recommended`, `/api/v1/staff-picks`, `/api/v1/leaderboard/*` all 404). For "trending right now" use `/api/v1/category/public/{id}/all?page=0` — Substack's category leaderboards refresh frequently and approximate "what's hot right now in {Category}".
- **`is_on_substack` is a misleading field name.** It's `false` for most publications (`joinaidaily`, `understandingai`, etc.) even though they're clearly on the platform. Treat as an internal flag and **do not surface it**. Use `payments_state` and `custom_domain` for actual signals about a publication's posture.
- **`tier: 1 | 2` is also internal.** Likely a hosting/plan tier for the publisher (not the reader). Don't surface it.
- **Substack does not publicly expose exact paid-subscriber counts** — only tiered badges. The signal surface is `author_bestseller_tier` (numeric: `0 | 100 | 1000 | 10000 | 100000`) and `author_badge: { type, tier }`. The matching human strings live in `rankingDetail` (e.g. `"Thousands of paid subscribers"`). Always emit BOTH the numeric tier and the human label — agents downstream can format either way.
- **Free-subscriber count is sometimes precise.** `rankingDetailFreeSubscriberCount` may contain a string like `"Over 257,000 subscribers"`. Parse with `/Over ([\d,]+) subscribers/` for an integer when present; otherwise rely on `rankingDetailFreeIncludedOrderOfMagnitude`.
- **`author_badge.type === "vip"` and `"subscriber"` are NOT subscriber-count tiers.** `vip` is an author-status flag (Substack curation team); `subscriber` flags an author who is themselves a paying Substack subscriber. Only `type === "bestseller"` correlates with paid-subscriber tier. We saw distributions of `[bestseller: 5, vip: 1, subscriber: 1, none: 11]` in a 20-pub sample for `query=politics`.
- **`plans[]` is a literal Stripe array.** Each entry has 30+ Stripe-internal fields you don't need (`tiers_mode`, `transform_usage`, `aggregate_usage`, `billing_scheme`, `created` epoch, etc.). Project down to `{ interval, amount, currency, currency_options, metadata.founding, nickname }` before emitting.
- **Founding-member plans are flagged via `plan.metadata.founding === "yes"`** — NOT a separate API. They share the `plans[]` array with monthly/annual. The `metadata.minimum` field carries the minimum founding contribution in base-currency cents.
- **`canonical_url` on a post may live on a custom domain.** A publication with `custom_domain: "www.understandingai.org"` returns posts with `canonical_url: https://www.understandingai.org/p/<slug>`. Use that authoritatively; do not synthesize `https://<subdomain>.substack.com/p/<slug>` and assume it 200s (it usually does because Substack maintains the subdomain as a mirror, but the canonical is the custom domain).
- **Substack CDN URLs (`substackcdn.com/image/fetch/$s_...`) include a hash in the path** and are stable but long. Pass through unmodified.
- **`browse cloud fetch` returns binary bodies base64-encoded.** Affects font / image fetches but NOT JSON / HTML responses we use here. Worth knowing if you later add a thumbnail-extraction step.
- **The /about HTML page contains social links** (Twitter/X handle, sometimes Instagram). The API does not surface them. If `social_links` is required, do one extra `browse cloud fetch https://<sub>.substack.com/about` and regex `(twitter\.com|x\.com|instagram\.com|youtube\.com|threads\.net|bsky\.app)\/[A-Za-z0-9_]+`. Otherwise rely on `author_handle` → `https://substack.com/@${handle}` for the Substack profile URL.
- **Politics is split into three IDs** (76739 U.S. Politics, 76740 World Politics, 76741 Health Politics). If a user says "Politics newsletters", call all three category leaderboards and merge-by-`id`.
- **READ-ONLY.** Never call `POST /api/v1/free` (free subscribe), `POST /api/v1/subscriptions` (paid subscribe), or any `/api/v1/plege*` / `/api/v1/restack*` endpoint. The publication search and category endpoints are all `GET`; if you find yourself reaching for `POST`, you're outside this skill.
- **Per-publication endpoints require the publication's own subdomain** — `https://substack.com/api/v1/archive` 404s; `https://<sub>.substack.com/api/v1/archive` 200s. Likewise `/api/v1/posts`, `/api/v1/recommendations` (per-pub flavor).
- **`/api/v1/publication` on a publication's subdomain returns 403** even though `/api/v1/archive` and `/api/v1/posts` are public. Get the publication record via the search endpoint instead (query=`<subdomain>` exactly).

## Expected Output

```json
{
  "query": "AI",
  "intent": "keyword",
  "entry_endpoint": "/api/v1/publication/search",
  "page": 0,
  "page_size": 18,
  "more": true,
  "publications": [
    {
      "publication_id": 1840149,
      "subdomain": "understandingai",
      "name": "Understanding AI",
      "tagline": "AI explained for non-experts",
      "language": "en",
      "type": "newsletter",
      "canonical_url": "https://www.understandingai.org",
      "hostname": "www.understandingai.org",
      "custom_domain": "www.understandingai.org",
      "logo_url": "https://substackcdn.com/image/fetch/...",
      "cover_photo_url": null,
      "hero_image": null,
      "created_at": "2022-08-09T13:24:11.500Z",
      "first_post_date": "2022-08-15T12:00:09.831Z",
      "payments_state": "enabled",
      "has_podcast": true,
      "is_paid": true,
      "primary_author": {
        "id": 7331158,
        "name": "Timothy B. Lee",
        "handle": "binarybits",
        "profile_url": "https://substack.com/@binarybits",
        "bio": "Reporter covering AI.",
        "photo_url": "https://substackcdn.com/..."
      },
      "contributors": [],
      "subscriber_signal": {
        "badge_type": "bestseller",
        "badge_tier": 1000,
        "paid_label": "Thousands of paid subscribers",
        "paid_om": 1000,
        "total_label": "Hundreds of thousands of subscribers",
        "total_om": 100000,
        "free_count_label": "Over 257,000 subscribers",
        "free_count_approx": 257000
      },
      "pricing": {
        "monthly_usd": 8.75,
        "annual_usd": 79.00,
        "founding_min_usd": 160.00,
        "currency_base": "usd",
        "currencies": {
          "eur": { "monthly": 8.00, "annual": 70.00, "founding_min": 140.00 },
          "gbp": { "monthly": 7.00, "annual": 60.00, "founding_min": 125.00 }
        }
      },
      "recent_posts": [
        {
          "id": 197744455,
          "title": "Why it might not make sense for you to own a self-driving car",
          "slug": "why-it-might-not-make-sense-for-you",
          "post_date": "2026-05-14T19:36:17.364Z",
          "audience": "only_paid",
          "type": "newsletter",
          "post_url": "https://www.understandingai.org/p/why-it-might-not-make-sense-for-you",
          "cover_image": "https://substackcdn.com/...",
          "reaction_count": 118,
          "comment_count": 3,
          "truncated_body_text": "Last month I got to check out a self-driving car..."
        }
      ],
      "last_post_date": "2026-05-14T19:36:17.364Z",
      "post_frequency_per_month_approx": 9.2
    }
  ]
}
```

For a category-browse intent the envelope changes slightly — `entry_endpoint` becomes `/api/v1/category/public/{id}/{tier}`, `page_size` becomes `25`, and a `category` block is added:

```json
{
  "intent": "category",
  "entry_endpoint": "/api/v1/category/public/4/paid",
  "category": { "id": 4, "name": "Technology", "slug": "technology", "tier": "paid" },
  "page": 0,
  "page_size": 25,
  "more": true,
  "publications": [/* same shape as above */]
}
```

For single-publication detail (URL or author-name intent), `publications` contains exactly one entry and `intent` is `"publication"`.

When nothing matches:

```json
{
  "query": "<...>",
  "intent": "keyword",
  "page": 0,
  "page_size": 18,
  "more": false,
  "publications": []
}
```
