---
name: christianpicks-com-search-christian-products-7xg4fk
title: Search ChristianPicks Directory
description: >-
  Search and filter the ChristianPicks directory of 500+ Christian apps,
  software, businesses, ministries, books, and media by query, category, pricing
  model, platform, or popularity; surface product details, vendor links, and
  comparison-ready recommendations.
website: christianpicks.com
category: directory
tags:
  - christian
  - directory
  - search
  - comparison
  - products
  - ministry
  - software
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: hybrid
alternative_methods:
  - method: api
    rationale: >-
      Public JSON endpoint /api/search/suggestions?q={query} returns 6 grouped
      result sections (products, businesses, categories, business_categories,
      trending_tags, popular_keywords) with no CSRF or auth. Preferred path for
      any free-text query. 30 req/min rate limit per IP.
  - method: url-param
    rationale: >-
      Category listings at /categories/{slug} accept GET params
      revenue_model[]=Free|Freemium|Premium, categories[]={sub-slug},
      sort=popular|newest|name, q={text}. Server re-renders HTML — parse
      /products/{slug} hrefs. Pairs naturally with the suggestions API.
  - method: browser
    rationale: >-
      Required only when the rich JS-rendered command-palette UI is needed
      (e.g., grouped-by-category live results), or to scrape
      pricing/platform/tags fields off /products/{slug} that aren't in JSON-LD.
      The internal /api/search?q= endpoint is confirmed CSRF-gated (403 on
      direct GET) — do not attempt direct.
verified: false
proxies: true
---
# Search ChristianPicks for Apps, Software, Businesses, Ministries, Books & Media

## Purpose

Search and filter the [ChristianPicks](https://christianpicks.com) directory — a curated
catalog of 500+ Christian products, software, tools, businesses, ministries, books, and
media — by free-text query, category, sub-category, pricing model, popularity, or tag.
Returns product/business summaries (title, slug, logo, verified flag, favorite count) and,
on product detail pages, the full record (description, pricing model, platforms, tags,
categories, vendor website with `utm_source=christianpicks.com`). Read-only.

## When to Use

- A user asks for "the best Christian Bible app", "free Christian finance software",
  "Christian-owned coffee roasters", "open-source church management tools", etc.
- A user wants to compare two or more Christian products on the same dimension
  (pricing model, platform, popularity).
- A user wants to discover what categories of Christian software/businesses exist
  (Software and Apps, Digital Content, Education, Events, Music, Products, Support).
- A user wants the official website of a known Christian product/ministry and you have
  only its name — the directory's outbound link is canonical and tracked.
- A user wants trending tags or popular keywords across the Christian-tech ecosystem.

Do **not** use for general Bible-verse lookup, theological Q&A, or sermon search — those
have purpose-built sites. ChristianPicks indexes *tools and businesses*, not content.

## Workflow

ChristianPicks exposes one undocumented public JSON endpoint and one set of facet-aware
GET URL params on its category listings. Prefer those over scripted browsing — they're
~5× faster, return structured JSON or parseable HTML, and need no session.

### 1. Fast multi-facet suggestion lookup (preferred for any text query)

```
GET https://christianpicks.com/api/search/suggestions?q={query}
Accept: application/json
```

Returns a single JSON envelope with **six** keyed result groups (top-6 / top-12 hits per
group, server-ranked):

| Key                   | Contents                                                                 |
| --------------------- | ------------------------------------------------------------------------ |
| `products`            | up to 6 matching products `{title, slug, logo, favorite_count, is_verified}` |
| `businesses`          | up to 6 matching Christian-owned businesses (same shape)                 |
| `categories`          | up to 7 product categories `{name, slug, description, product_count}`    |
| `business_categories` | up to 8 business categories `{name, slug, description, business_count}`  |
| `trending_tags`       | up to 12 tags `{name, slug, product_count}`                              |
| `popular_keywords`    | up to 16 plain strings ("Bible Study", "Worship", "Prayer", …)           |

No CSRF, no cookies, no auth. Works from any HTTP client. Empty `q` returns the editorial
default set (handy as a "what's hot" panel). Rate limit: **30 req/min per IP** (the response
echoes `X-Ratelimit-Limit` and `X-Ratelimit-Remaining` headers — respect them).

Construct deep links from the slugs:

| Result group           | URL                                                             |
| ---------------------- | --------------------------------------------------------------- |
| `products[].slug`      | `https://christianpicks.com/products/{slug}`                    |
| `businesses[].slug`    | `https://christianpicks.com/christian-owned/{slug}` *(verify per record — some businesses route under `/products/{slug}`)* |
| `categories[].slug`    | `https://christianpicks.com/categories/{slug}`                  |
| `business_categories[].slug` | `https://christianpicks.com/christian-owned/category/{slug}` |
| `trending_tags[].slug` | `https://christianpicks.com/tags/{slug}`                        |

### 2. Faceted browse — pricing model + sort

Category listing pages accept GET query parameters; the server re-renders the page with
the filter applied. No JS execution required, plain HTML out.

```
GET https://christianpicks.com/categories/{category-slug}
    ?revenue_model[]=Free            # repeat for multi-select
    &revenue_model[]=Freemium
    &revenue_model[]=Premium         # accepted values: Free | Freemium | Premium
    &categories[]={sub-category-slug} # e.g. open-source-bible-apps
    &sort=popular                    # popular | newest | name (A–Z)
    &q={text}                        # in-category text filter
```

Parse the rendered HTML by extracting `/products/{slug}` hrefs to enumerate result cards.
Note the site uses URL-encoded `%5B%5D` in real navigation (`revenue_model%5B%5D=Free`);
both forms work.

### 3. Product detail extraction

```
GET https://christianpicks.com/products/{slug}
```

Each product page embeds two parseable layers:

- **JSON-LD `Product` schema** in a `<script type="application/ld+json">` block —
  yields `name`, `description`, `brand.name`, `url`, `image`. Easiest structured grab.
- **Rendered DOM sections** for the fields JSON-LD doesn't expose:
  - `<h3>Pricing</h3>` → `<p>` with comma-separated tier list ("Freemium, Paid, One-time",
    "Free, Open Source", etc.)
  - `<h3>Platforms</h3>` → list (iOS, Android, Web, Desktop, Faith-Based, …)
  - `<h3>Categories</h3>` and `<h3>Tags</h3>` → category/tag chips
  - "Visit Website" anchor → outbound URL with `?utm_source=christianpicks.com` appended.
    Strip that param if you need the canonical vendor URL.
  - `is_verified` badge on title (matches the API's `is_verified` boolean).

### 4. Comparison & recommendation

To compare N products on the same axis:
1. Hit `/api/search/suggestions?q=` once per candidate name to confirm slugs.
2. Fetch each `/products/{slug}` in parallel.
3. Extract `description`, pricing, platforms, tags, verified-flag, favorite_count.
4. Rank by `favorite_count` (community signal) and/or pricing-tier match.

### Browser fallback (only if the above fails)

If you specifically need the rich JS-rendered full-text **results page** (not the
6-per-group suggestions dropdown), the only viable path is a real browser session:

1. Navigate to `https://christianpicks.com/` (a remote Browserbase session with `--proxies`
   is fine — site is Cloudflare-fronted but the public pages are bare-friendly).
2. Click the search affordance ("Search products, businesses…") in the navbar **or**
   press the `⌘K` / `Ctrl+K` shortcut to open the command palette.
3. Type the query into the palette `<input>` (accessibility role: `textbox`, placeholder
   "Search products, businesses…"). Results render inline grouped by Product Categories
   and SOFTWARE / DIGITAL CONTENT / etc.
4. Click a result to navigate to its detail page; scrape as in step 3 above.

**Do not navigate to `https://christianpicks.com/api/search?q={query}` as a top-level
URL.** That endpoint is only callable as an XHR from the loaded SPA with a valid
CSRF cookie + Origin header — direct navigation (and direct curl) returns 403 Forbidden
with the rendered "403 / Forbidden" error page. See Site-Specific Gotchas.

## Site-Specific Gotchas

- **`/api/search/suggestions` is the JSON-out endpoint; `/api/search` is not.** The
  endpoint named `/api/search?q=` looks like a JSON API in the URL space but is actually
  the SPA's internal partial-HTML fetcher and returns **403 Forbidden** on direct GET
  (no Origin header / wrong CSRF). The truly public JSON sits at
  `/api/search/suggestions`. Don't waste cycles trying to coerce `/api/search` —
  it's confirmed CSRF-gated.
- **30 req/min rate limit** on `/api/search/suggestions` per IP. The response headers
  `X-Ratelimit-Limit` and `X-Ratelimit-Remaining` decrement on every call. On exhaustion
  expect 429. Cache aggressively if doing fan-out comparison queries.
- **`revenue_model` values are exactly `Free`, `Freemium`, `Premium`** — three options.
  The site's own product cards display richer labels like "Paid", "One-time",
  "Subscription", "Open Source" in their Pricing text block, but those are not
  filterable values — they're free-form display strings. Filtering by "Paid" via
  `revenue_model[]=Paid` will return empty.
- **`categories[]` sub-filter values are slugs of the *child* categories** of the parent
  category page you're on. On `/categories/bible-apps` the valid `categories[]` slugs
  are `paid-bible-apps`, `freemium-bible-apps`, `free-bible-apps`, `open-source-bible-apps`.
  You can't pass arbitrary top-level slugs.
- **Outbound vendor links are tracked.** Every "Visit Website" button appends
  `?utm_source=christianpicks.com` (and sometimes `&utm_medium=...`). Strip these
  params when reporting the canonical vendor URL to a user, unless you specifically
  want to honor the directory's referral attribution.
- **Cloudflare proxy + Laravel session cookies (`XSRF-TOKEN`, `christianpicks_session`)
  are set on every response** but are only required for the CSRF-gated `/api/search`
  endpoint, the suggestion API, and category browsing both work cookieless. Don't add
  cookie handling unless you've actually been blocked.
- **`/products/suggest` is not a product — it's the "Suggest a product" form.** Any
  regex like `/products/([a-z0-9-]+)` will harvest it as a false positive. Filter it
  out before treating slugs as a result set.
- **`/search?q=...` (no `/api/` prefix) returns 404.** The Schema.org `SearchAction`
  in the homepage JSON-LD advertises `https://christianpicks.com/search?q={search_term_string}`
  as the search target — it's misleading. Use the palette (browser) or the suggestions
  API (HTTP) instead.
- **Businesses vs. products are separate indexes.** Christian-owned businesses live under
  `/christian-owned/...` with their own category tree (`/christian-owned/category/{slug}`)
  and their own count field (`business_count`). A search for "coffee" surfaces both
  product listings and business listings — distinguish them by which key they came
  from in the suggestions response.
- **Sort defaults to `newest`.** If the user wants community-validated picks, append
  `&sort=popular` explicitly. `name` is alphabetical A→Z.

## Expected Output

### Shape 1 — suggestions (preferred fast path)

```json
{
  "query": "worship",
  "source": "api/search/suggestions",
  "products": [
    {
      "title": "WorshipTools",
      "slug": "worshiptools",
      "url": "https://christianpicks.com/products/worshiptools",
      "logo": "https://images.christianpicks.com/logos/...png",
      "favorite_count": 4,
      "is_verified": true
    }
  ],
  "businesses": [
    {
      "title": "Mt. Athos Performance",
      "slug": "mt-athos-performance",
      "url": "https://christianpicks.com/christian-owned/mt-athos-performance",
      "logo": "https://images.christianpicks.com/logos/...png",
      "favorite_count": 0,
      "is_verified": false
    }
  ],
  "categories": [
    {
      "name": "Software and Apps",
      "slug": "software-and-apps",
      "url": "https://christianpicks.com/categories/software-and-apps",
      "description": "Essential desktop, web, and mobile applications for Bible study, prayer, worship, and church administration.",
      "product_count": 186
    }
  ],
  "business_categories": [
    {
      "name": "Media & Podcasting Services",
      "slug": "media-podcasting-services",
      "url": "https://christianpicks.com/christian-owned/category/media-podcasting-services",
      "description": "Media & Podcasting Services",
      "business_count": 5
    }
  ],
  "trending_tags": [
    { "name": "Worship", "slug": "worship", "url": "https://christianpicks.com/tags/worship", "product_count": 38 }
  ],
  "popular_keywords": ["Bible Study", "Worship", "Prayer", "Discipleship"],
  "rate_limit": { "limit": 30, "remaining": 28 }
}
```

### Shape 2 — faceted category browse (pricing + sort)

```json
{
  "category": { "name": "Bible Apps", "slug": "bible-apps", "url": "https://christianpicks.com/categories/bible-apps" },
  "filters_applied": {
    "revenue_model": ["Free", "Freemium"],
    "sort": "popular"
  },
  "results": [
    {
      "title": "YouVersion Bible",
      "slug": "youversion-bible",
      "url": "https://christianpicks.com/products/youversion-bible"
    },
    {
      "title": "NET Bible",
      "slug": "net-bible",
      "url": "https://christianpicks.com/products/net-bible"
    }
  ],
  "result_count": 8
}
```

### Shape 3 — product detail (deep dive / comparison)

```json
{
  "title": "Accordance Bible Software",
  "slug": "accordance-bible-software",
  "url": "https://christianpicks.com/products/accordance-bible-software",
  "description": "Accordance Bible Software is a leading platform for Bible study, offering a comprehensive suite of tools to facilitate deep scriptural insight...",
  "brand": "Independent",
  "image": "https://images.christianpicks.com/logos/1749519610-logo-...webp",
  "pricing_model_filter": "Premium",
  "pricing_display": "Freemium, Paid, One-time",
  "platforms": ["Web", "Desktop", "iOS", "Android"],
  "categories": ["Bible Study Software", "Software and Apps"],
  "tags": ["bible", "study", "software"],
  "vendor_url_canonical": "https://www.accordancebible.com",
  "vendor_url_tracked": "https://www.accordancebible.com?utm_source=christianpicks.com",
  "is_verified": false,
  "favorite_count": null
}
```

### Shape 4 — comparison response (composed by the agent from N detail shapes)

```json
{
  "query": "best free Christian Bible app for iOS",
  "ranked": [
    {
      "rank": 1,
      "title": "YouVersion Bible",
      "url": "https://christianpicks.com/products/youversion-bible",
      "vendor_url_canonical": "https://www.youversion.com",
      "pricing_display": "Free",
      "platforms": ["iOS", "Android", "Web"],
      "favorite_count": 12,
      "is_verified": true,
      "why": "Free across all platforms, highest community favorites, verified listing."
    },
    {
      "rank": 2,
      "title": "NET Bible",
      "url": "https://christianpicks.com/products/net-bible",
      "vendor_url_canonical": "https://netbible.com",
      "pricing_display": "Free",
      "platforms": ["Web", "iOS"],
      "favorite_count": 3,
      "is_verified": false,
      "why": "Free, ships translation notes; lower community signal than YouVersion."
    }
  ]
}
```

### Shape 5 — no-hits

```json
{
  "query": "byzantine icon embroidery kits",
  "source": "api/search/suggestions",
  "products": [],
  "businesses": [],
  "categories": [],
  "business_categories": [],
  "trending_tags": [],
  "popular_keywords": ["Bible Study", "Worship", "Prayer"]
}
```

Note: even on zero hits, `popular_keywords` still returns the editorial defaults — treat
them as suggestions, not as positive matches. Decide "no result" based on `products`,
`businesses`, `categories`, `business_categories` and `trending_tags` all being empty.
