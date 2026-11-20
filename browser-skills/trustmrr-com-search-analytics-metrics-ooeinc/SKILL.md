---
name: trustmrr-com-search-analytics-metrics-ooeinc
title: Search MRR & Revenue Metrics on TrustMRR
description: >-
  Search TrustMRR's database of payment-provider-verified startup revenue and
  return MRR, last-30-days revenue, total revenue, active subscriptions, growth
  %, profit margin, and rank — via the official REST API when authenticated, or
  SSR'd category/startup pages as an unauthenticated browser fallback.
website: trustmrr.com
category: analytics
tags:
  - analytics
  - saas
  - revenue
  - mrr
  - subscriptions
  - startups
  - api
source: 'browserbase: agent-runtime 2026-05-25'
updated: '2026-05-25'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      Required when no tmrr_ API key is available. SSR'd Next.js pages
      (/category/{slug}, /country/{iso2}, /startup/{slug}) inline MRR/revenue in
      the initial HTML — no JS execution needed for reads. No anti-bot observed.
  - method: fetch
    rationale: >-
      Same as browser route — every public page is SSR'd so a plain HTTPS GET
      returns the rendered markup. Use when you want lower overhead than a full
      browser session.
verified: true
proxies: true
---
# Search and Retrieve MRR & Revenue Metrics on TrustMRR

## Purpose

Search the [TrustMRR](https://trustmrr.com) database of ~7,000+ startups with payment-provider-verified revenue (Stripe, LemonSqueezy, Polar, RevenueCat, DodoPayment, Paddle, Superwall, Creem) and return structured subscription-analytics data: MRR, last-30-days revenue, all-time total revenue, active subscriptions, customer count, growth %, profit margin, asking price, and TrustMRR rank. Read-only. Two interchangeable routes exist — a documented public REST API (preferred when an API key is available) and SSR'd HTML pages that work unauthenticated.

## When to Use

- "Find SaaS startups doing $1k–$5k MRR ranked by growth"
- "What's ShipFast's verified MRR and customer count?"
- "List the top 10 startups for sale under $50k with revenue multiple < 3x"
- "How many active subscriptions does Stan have?"
- "Find startups by founder @marclou and show their revenue"
- "Show me the highest-MRR fintech startups on TrustMRR"
- Any time a user asks for verified subscription-revenue benchmarks across indie / bootstrapped SaaS — TrustMRR's distinguishing feature is that revenue is read directly from payment providers, not self-reported.

## Workflow

The site exposes the same data through **two routes**. Pick based on whether you have a `tmrr_` API key.

### Route A — Public REST API (preferred when authenticated)

1. **Obtain a key.** A `tmrr_`-prefixed Bearer token is required. Keys are issued from `https://trustmrr.com/dashboard-dev` after the operator signs in. Without a key, every `/api/v1/*` request returns `401 {"error":"Missing or invalid API key. Pass it as: Authorization: Bearer tmrr_..."}`. If the user has not provided one, skip to Route B.

2. **List with filters** (`GET /api/v1/startups`):
   ```bash
   curl -s "https://trustmrr.com/api/v1/startups?category=saas&minMrr=100000&sort=mrr-desc&limit=50" \
     -H "Authorization: Bearer tmrr_your_key"
   ```
   Supported query params (all optional unless noted):
   - `page` (int, default 1), `limit` (int, default 10, **max 50**)
   - `sort` — one of `revenue-desc` (default), `revenue-asc`, `price-desc`, `price-asc`, `multiple-asc`, `multiple-desc`, `growth-desc`, `growth-asc`, `listed-desc`, `listed-asc`, `best-deal`
   - `onSale` — `"true"` / `"false"` (string, not boolean)
   - `category` — one of `ai`, `saas`, `developer-tools`, `fintech`, `marketing`, `ecommerce`, `productivity`, `design-tools`, `no-code`, `analytics`, `crypto-web3`, `education`, `health-fitness`, `social-media`, `content-creation`, `sales`, `customer-support`, `recruiting`, `real-estate`, `travel`, `legal`, `security`, `iot-hardware`, `green-tech`, `entertainment`, `games`, `community`, `news-magazines`, `utilities`, `marketplace`, `mobile-apps`
   - `xHandle` — founder's X handle without `@`
   - `minRevenue` / `maxRevenue` — last-30-day revenue **in USD cents** (10000 = $100)
   - `minMrr` / `maxMrr` — MRR **in USD cents**
   - `minGrowth` / `maxGrowth` — **decimal**, not percent (0.1 = 10% growth)
   - `minPrice` / `maxPrice` — asking price **in USD cents**

3. **Paginate** via the returned `meta.hasMore` until `false`, incrementing `page`. `meta.total` gives the full result-set size up front.

4. **Get full detail** for a single startup (`GET /api/v1/startups/{slug}`) — adds `xFollowerCount`, `isMerchantOfRecord`, `techStack[]`, `cofounders[]`, and the un-truncated `description`. The `slug` is the value returned by the list endpoint.

5. **Rate limit** is **20 requests per minute per key**. Read `X-RateLimit-Remaining` / `X-RateLimit-Reset` from response headers — back off when remaining hits 0. Error codes: `400` bad params, `401` no/bad key, `404` slug not found, `429` rate-limited, `500` upstream.

6. **Unit conversion.** Every monetary field in the response is **USD cents** — divide by 100 before displaying. `growth30d` is *percent already* (e.g. `24` = 24%), but the *query parameter* `minGrowth`/`maxGrowth` is a decimal — easy to flip; double-check.

### Route B — Browser fallback (no API key needed)

All pages are server-side-rendered by Next.js; revenue/MRR/total numbers are inlined into the initial HTML, so a single `browse get markdown body` per URL is enough. No login, no captcha, no rate-limit signal observed.

1. **Find candidate startups.** Pick the most specific entry point:
   - `https://trustmrr.com/category/{category-slug}` — pre-filtered list with MRR/Revenue/Total visible inline. Categories use the same slugs as the API (e.g. `/category/saas`, `/category/fintech`).
   - `https://trustmrr.com/country/{iso2}` — by country (e.g. `/country/us`).
   - `https://trustmrr.com/tech/{slug}` — by tech stack (e.g. `/tech/stripe`).
   - `https://trustmrr.com/acquire` — the for-sale marketplace.
   - `https://trustmrr.com/recent` — recently added.
   - `https://trustmrr.com/` — top-100 by revenue.
   - `https://trustmrr.com/search` — full-filter UI (see step 2).
   - `https://trustmrr.com/stats` — site-wide aggregates (revenue distribution, top categories, follower-vs-revenue scatter, etc.) when the user wants market-level signal rather than a per-startup lookup.

2. **`/search` requires JS interaction.** URL params on `/search` (e.g. `?category=saas&minMrr=100000`) do **not** pre-apply filters server-side — the page always loads with all 7,064 startups, then the React app reads its own state. To filter through the browser you must `browse click` the filter controls and `browse fill` the MRR/Revenue/Growth ranges after the page hydrates. **Prefer `/category/{slug}` and `/country/{iso2}` deep-links** when they cover the query — those filter at the route level.

3. **Read the listing card.** Each `/startup/{slug}` link on a list page already carries the headline metrics inline: `Revenue (30d)$X MRR$Y Total$Z`. For top-level lists this is often enough.

4. **Visit the detail page** at `https://trustmrr.com/startup/{slug}` for the full breakdown — all-time revenue, MRR, active-subscriptions count, founded date, founder, category, country, tech stack, payment provider, and a time-series revenue chart. The `<title>` tag exposes the headline revenue (e.g. `Stan - $2,844,652 last 30 days | TrustMRR`).

5. **Watch for the staleness banner.** If a startup's payment-provider key has expired, the detail page shows `**{Provider} API key expired.** Data last updated {date}.` — surface that warning verbatim in your output; the numbers are still accurate as-of that date but not current.

## Site-Specific Gotchas

- **Monetary fields are in USD cents in the API.** `revenue.mrr: 180000` means $1,800/mo MRR, not $180k. Always divide by 100 before formatting. The browser pages already format with `$` and `k`/`M` suffixes (e.g. `MRR$3.6M`), so don't re-divide there.
- **`growth30d` is asymmetric across the API surface.** As a response field it's a percent (`24` = 24%). As a query parameter (`minGrowth` / `maxGrowth`) it's a decimal (`0.24` = 24%). Conversion error here will silently return zero results.
- **`/search?category=...&minMrr=...` URL params are decorative, not server-applied.** The page always SSRs with 7,064 startups; filters are React state. If you must use `/search` in a browser, click into the filter UI after hydration; otherwise use `/category/{slug}` URLs which DO pre-filter.
- **`/category/saas` shows only startups explicitly tagged `saas` (≈30), not "everything SaaS-like".** AI / fintech / dev-tools / marketing all live in sibling categories with their own pages. To search across many categories, use the API with no `category` param + a generous `limit=50` and paginate.
- **Rate limit is 20 req/min per API key**, low enough that listing all 7,064 startups at `limit=50` (≈142 pages) takes ~7 minutes wall-clock minimum. Stream + parallelize across multiple keys if you have them; otherwise budget time.
- **Many high-revenue listings are anonymized as "Hidden Business", "Stealth Company", "Unnamed Company"** — particularly in the for-sale flow. The MRR/revenue numbers are still real, but you cannot resolve them to a public website. Surface this in your output rather than fabricating a name.
- **`MRR$0` on a startup card does not mean the startup has no recurring revenue.** It means TrustMRR's MRR detector hasn't classified the startup's subscription stream yet, or all revenue is one-time. Cross-reference `revenue.last30Days` and `revenue.total` before concluding "no MRR business".
- **Stale-data banner.** When a founder's Stripe / LemonSqueezy / etc. API key has been revoked, the detail page renders `**{Provider} API key expired.** Data last updated {date}.` and stops updating. The API response itself does not flag this explicitly — if a startup's revenue looks suspiciously frozen vs. its `foundedDate`, scrape the corresponding `/startup/{slug}` HTML to check for the banner.
- **No public unauthenticated API.** Every `/api/v1/*` request without a `tmrr_` Bearer returns 401. Don't waste retries probing for an anonymous endpoint — fall back to the SSR'd browser path immediately. Confirmed `401` on `/api/v1/startups` from a clean residential proxy.
- **Assumed interpretation.** The prompt "search and retrieve MRR and revenue metrics / find and display subscription analytics data" was interpreted as "given a query (founder handle, category, MRR range, country, or named startup), return the standard MRR + revenue + subscription bundle for matching startups". If the operator actually wanted *their own* business's analytics dashboard, that lives behind login at `/dashboard` and is out of scope for this skill.
- **Site infra.** Hosted on Vercel (Next.js, SSR + ISR). No anti-bot (no Akamai, no Cloudflare challenge, no captcha) observed during 4 distinct GETs from a residential-proxy session. `robots.txt` is `Allow: /` for every UA. Sitemaps at `/sitemap-0.xml` through `/sitemap-2.xml` enumerate every startup slug.

## Expected Output

Two distinct shapes — pick based on the user's intent.

### Shape 1 — Search results list

Use for "find startups matching X". Mirrors the API's `data[]` envelope.

```json
{
  "query": {
    "category": "saas",
    "minMrr_usd": 1000,
    "sort": "mrr-desc",
    "source": "api"
  },
  "total_matching": 142,
  "returned": 10,
  "page": 1,
  "has_more": true,
  "results": [
    {
      "name": "ShipFast",
      "slug": "shipfast",
      "url": "https://trustmrr.com/startup/shipfast",
      "website": "https://shipfa.st",
      "category": "saas",
      "country": "TH",
      "founded": "2023-09-01",
      "payment_provider": "stripe",
      "target_audience": "b2b",
      "revenue": {
        "last_30_days_usd": 42500.00,
        "mrr_usd": 1800.00,
        "total_usd": 980000.00
      },
      "customers": 7800,
      "active_subscriptions": 320,
      "growth_30d_pct": 12,
      "mrr_growth_30d_pct": 8.5,
      "profit_margin_30d_pct": 92,
      "rank": 42,
      "on_sale": true,
      "asking_price_usd": 500000.00,
      "multiple": 0.98,
      "x_handle": "shipaborad"
    }
  ]
}
```

### Shape 2 — Single startup detail

Use for "what's {startup}'s MRR / revenue / subscription count".

```json
{
  "query": { "slug": "stan", "source": "browser" },
  "found": true,
  "startup": {
    "name": "Stan",
    "slug": "stan",
    "url": "https://trustmrr.com/startup/stan",
    "website": "https://stan.store",
    "description": "Stan enables people to make living and work for themselves.",
    "category": "content-creation",
    "country": "US",
    "founded": "2023-04-01",
    "payment_provider": "stripe",
    "revenue": {
      "last_30_days_usd": 2844652,
      "mrr_usd": 3569654,
      "total_usd": 76627685
    },
    "active_subscriptions": 101590,
    "rank": 3,
    "founder": { "name": "Vitalii Dodonov", "x_handle": "vitddnv", "x_followers": 73 },
    "tech_stack": ["stripe"],
    "data_staleness_warning": "Stripe API key expired. Data last updated Apr 20, 2026."
  }
}
```

### Shape 3 — Not found

```json
{ "query": { "slug": "does-not-exist", "source": "api" }, "found": false, "error": "404 — slug not in TrustMRR database" }
```

### Shape 4 — No API key + browser blocked

Effectively never observed (no anti-bot on this site), but document the contract anyway:

```json
{ "query": { ... }, "found": false, "error": "API key absent and SSR fetch failed", "fallback_attempted": ["api", "browser"] }
```
