---
name: bissafety-ca-explore-full-site-cx1046
title: BIS Safety — Full-Site Navigation
description: >-
  Enumerate every public URL on bissafety.ca (marketing pages, blog posts,
  ~1,920 online safety courses) via the Yoast sitemap index plus the open
  WordPress REST API, returning a structured catalog with titles, slugs,
  taxonomies, and last-modified timestamps.
website: bissafety.ca
category: site-navigation
tags:
  - wordpress
  - sitemap
  - rest-api
  - site-crawl
  - ehs
  - elearning
  - catalog
source: 'browserbase: agent-runtime 2026-05-25'
updated: '2026-05-25'
recommended_method: api
alternative_methods:
  - method: fetch
    rationale: >-
      GET /sitemap_index.xml + its 4 child sitemaps yields all ~2,238 URLs
      without auth — fastest path when only URLs (not titles/taxonomies) are
      needed.
  - method: browser
    rationale: >-
      Only required when Elementor-rendered pages must be captured visually
      (their _elementor_data postmeta is not in REST content.rendered) or when
      the REST endpoint is blocked. The site's mega-menu surfaces only ~60 of
      ~2,238 URLs, so browser-driven crawl alone is incomplete.
verified: false
proxies: true
---
# BIS Safety — Full-Site Navigation

## Purpose

Systematically enumerate and traverse the entirety of `bissafety.ca` — every marketing page, blog post, and online safety course — and return a structured catalog of URLs (with titles, slugs, taxonomies, and last-modified timestamps) suitable for downstream indexing, link-validation, content-audit, or LLM-ingestion tasks. The site is a WordPress + Yoast SEO marketing/eLearning property; this skill is read-only and exercises the public REST + sitemap surfaces in preference to scripted browsing.

## When to Use

- Building a catalog of every BIS Safety course (~1,920 SKUs) for downstream search/comparison.
- Auditing the entire site for broken links, missing canonicals, or content gaps before a migration.
- Bulk-ingesting BIS Safety content (pages, blog posts, course descriptions) into a vector store or knowledge base.
- Generating a navigable site map for an agent that will later deep-link to specific course/page URLs.
- Verifying which URLs the site publicly indexes (e.g., before a robots.txt or noindex audit).
- Snapshotting the site structure on a recurring schedule for change-detection.

## Workflow

The site exposes its complete URL inventory through **two cheap, structured surfaces** — there is no reason to crawl HTML for navigation. Use the REST API + sitemap in tandem; reserve browser navigation for human-visible artifacts (screenshots, rendered hero copy with Elementor blocks, cookie-banner verification).

### 1. Enumerate URLs via Yoast sitemap index (one HTTP GET → all URLs)

```bash
curl -fsSL https://bissafety.ca/sitemap_index.xml
```

Returns a sitemapindex pointing to four child sitemaps. As of the last verified run:

| Child sitemap | Purpose | URL count |
| --- | --- | --- |
| `https://bissafety.ca/post-sitemap.xml` | Blog posts | ~220 |
| `https://bissafety.ca/page-sitemap.xml` | Marketing / product pages | ~98 |
| `https://bissafety.ca/courses-sitemap.xml` | Courses (part 1, max 1000 per Yoast) | 1000 |
| `https://bissafety.ca/courses-sitemap2.xml` | Courses (part 2) | ~913 |

Each child sitemap returns one `<url>` per page with `<loc>`, `<lastmod>`, and (for pages) inline `<image:image>` entries. Total enumerable inventory: **~2,238 URLs**.

Yoast emits sitemaps with `X-Robots-Tag: noindex, follow` — they're public but unindexed; you can still fetch them without auth or special headers.

### 2. Enrich each URL with structured metadata via the WordPress REST API

The `/wp-json/wp/v2/` namespace is fully open (no auth required). Custom post type `courses` is exposed at rest_base `courses`.

| Endpoint | What it returns | Pagination | Total |
| --- | --- | --- | --- |
| `GET /wp-json/wp/v2/pages?per_page=100&_fields=id,slug,link,title,date,modified` | Marketing pages | 1 page | ~98 |
| `GET /wp-json/wp/v2/posts?per_page=100&_fields=id,slug,link,title,date,modified,categories,tags` | Blog posts | 3 pages | ~220 |
| `GET /wp-json/wp/v2/courses?per_page=100&_fields=id,slug,link,title,date,modified,course-category` | Online safety courses (CPT) | 20 pages | ~1,920 |
| `GET /wp-json/wp/v2/course-category?per_page=100&_fields=id,slug,name,count` | Course taxonomy enum | 1 page | 8 |
| `GET /wp-json/wp/v2/categories?per_page=100` | Blog post taxonomy | 1 page | — |
| `GET /wp-json/wp/v2/types` | Post-type registry (discovery) | 1 page | — |

Always use `_fields=` to whittle the payload — the default response contains `content.rendered` (full HTML body, ~10–50 KB per item) and `yoast_head` (a meta-tag dump), which inflate transfer 10× and are rarely needed for navigation tasks.

Pagination contract: pass `page=N&per_page=100`. Response headers `X-WP-Total` and `X-WP-TotalPages` give the totals. Loop until `page > X-WP-TotalPages`.

The eight course categories (slugs are stable, agent can hardcode for filtering): `awareness` (700), `driver` (287), `electrical` (51), `equipment` (330), `products` (6), `safety` (1373), `soft-skills` (377), `virtual-reality-vr` (6). Counts overlap — a course can belong to multiple categories.

Recommended traversal sequence:
1. `GET /sitemap_index.xml` → list 4 child sitemap URLs.
2. Fetch each child sitemap in parallel → extract `<loc>` + `<lastmod>` per URL (regex `<loc>([^<]+)</loc>` works; full XML parse not required).
3. Bucket URLs by path prefix: `/courses/` → courses CPT, `/blog/` or `/{slug}/` matching a post → posts, all others → pages.
4. For each bucket, page through the matching `/wp-json/wp/v2/{rest_base}` endpoint with `per_page=100` + `_fields=` to enrich the URL list with `id`, `title.rendered`, `modified`, taxonomy IDs.
5. (Optional) Resolve `course-category` IDs against `/wp-json/wp/v2/course-category` once and inline names.

### 3. Optional: per-URL deep content fetch

If the task needs the rendered prose (e.g., for LLM ingestion):
- Prefer `/wp-json/wp/v2/{rest_base}/{id}?_fields=content,excerpt,title,slug,link` — clean HTML, no template chrome.
- Fall back to fetching the URL directly and stripping with `browse get markdown body`. The site serves a Cookie-banner overlay (Complianz/cmplz plugin) on first HTML render — it does **not** block the underlying DOM, so markdown extraction works without dismissing the banner.

### Browser fallback

If REST is ever disabled, blocked behind the Cloudflare bot check, or you need to verify visually-rendered Elementor content the REST API doesn't expose (some pages use Elementor's `_elementor_data` postmeta which is not in `content.rendered`):

1. `browse cloud sessions create --keep-alive --proxies` (residential proxies recommended — the site is on Cloudflare + Kinsta + Nitro CDN; verified browser fingerprint is **not** required).
2. `browse open https://bissafety.ca` — the homepage's mega-menu exposes every product page in a single render. Site footer + `/all-courses/` listing covers the resource hubs.
3. Dismiss the cookie banner only if it overlays a critical hit target — markdown/snapshot extraction works without it.
4. Crawl by following anchor `href`s, deduplicating by canonical URL. The same-origin filter `https://bissafety.ca/` keeps the crawl bounded; explicitly drop `cdn-ilegmfm.nitrocdn.com` (the Nitro asset CDN — images and JS bundles, not HTML).

## Site-Specific Gotchas

- **Use the sitemap, not the homepage navigation.** The header mega-menu surfaces ~60 product/resource URLs, but the site has **~2,238** total URLs. Skipping the sitemap and following anchors will undercount courses by ~97%.
- **Two course sitemaps, not one.** Yoast splits sitemaps at 1,000 URLs — both `courses-sitemap.xml` and `courses-sitemap2.xml` must be fetched. The sitemap_index lists both; do not stop at the first.
- **Old `/sitemap.xml` 301-redirects to `/sitemap_index.xml`** via Yoast SEO's redirect manager (`X-Redirect-By: Yoast SEO`). Either URL works, but follow the redirect (`curl -L` / `--proxies` `browse cloud fetch` both honor it).
- **WP REST API is fully open** — no nonce, no key, no rate limit observed under residential-proxy traffic at ≤5 req/s. CORS is permissive (`Access-Control-Allow-Origin` not restricted), so the agent does not need to spoof Origin headers.
- **`per_page` max is 100.** Asking for more (e.g., `per_page=500`) returns a 400 `rest_invalid_param`. Use `page=N` to paginate.
- **Always pass `_fields=`.** Default REST payload includes the full rendered HTML body, `yoast_head` (~5 KB of meta tags per item), and `_links` (~2 KB HAL). Whittling to `id,slug,link,title,date,modified,course-category` cuts 1,920-course enumeration from ~80 MB to ~3 MB.
- **Course CPT taxonomy field is `course-category` (hyphen, not underscore).** The REST `_fields` selector and the filter parameter both use the hyphenated form: `?course-category=42` to filter by term ID, or `?course-category=safety` does **not** work — you must resolve the slug to an ID first via `/wp-json/wp/v2/course-category?slug=safety`.
- **Slug collisions across post types.** Several pages have `slug=lp` under different parents (`/company-spotlights/lp/`, `/ai-in-the-workplace/lp/`). Always key on `link` (full URL) or `id`, not `slug`, when deduping.
- **`__cf_bm` cookie** is set by Cloudflare on every response. Reusing a session that holds it materially speeds up subsequent fetches (drops latency from ~600 ms to ~120 ms by skipping bot-check); `browse cloud fetch` and `browse cloud sessions` both persist cookies automatically.
- **Nitro CDN cache (`X-Nitro-Cache: HIT`)** front-runs Kinsta. Pages refreshed minutes ago may still serve a stale `<lastmod>` in the sitemap until the Nitro purge fires — for monotonically fresh data, prefer the REST API's `modified` field over the sitemap's `<lastmod>`.
- **Cookie-consent banner (Complianz / `cmplz`) overlays the page** on the first HTML render but does not block underlying DOM access. `browse get markdown body` and `browse snapshot` both see through it. There is no need to click "Accept" to extract content.
- **No GraphQL endpoint.** `/graphql` returns 404 — do not waste cycles on WPGraphQL-style queries.
- **Image CDN domain is different.** All assets serve from `cdn-ilegmfm.nitrocdn.com` (Nitro Pack). If you build a media inventory, dedupe by the original `bissafety.ca/wp-content/uploads/...` path that the CDN URL wraps.
- **Author archives, search, and feeds are disallowed in `robots.txt`** (`/author/`, `/search/`, `/feed/`, `/?s=`) — respect that boundary; they're explicitly excluded from "the entire site" surface for this skill.
- **Some Elementor pages embed content via `_elementor_data` postmeta** which the REST API does **not** include in `content.rendered`. Twelve to twenty pages (notably product landing pages built in Elementor Pro) will look near-empty via REST; for those, the browser fallback's `browse get markdown body` is the source of truth.
- **`/wp-json/wp/v2/users` returns `401 rest_user_cannot_view`** for unauthenticated callers (good — author enumeration is blocked). Don't try to map post authors without credentials.
- **Recurring slug pattern `*-course-subscription` and `*-sitemap*.xml`** are the canonical anchor points for the subscription bundles and the sitemap surface, respectively. Useful for regex-bucketing.

## Expected Output

A JSON document with one top-level `urls` array plus per-bucket counts and a discovery manifest. The shape an agent SHOULD produce:

```json
{
  "domain": "bissafety.ca",
  "discovered_at": "2026-05-25T23:13:00Z",
  "source": "sitemap_index+wp_rest_api",
  "counts": {
    "pages": 98,
    "posts": 220,
    "courses": 1920,
    "total": 2238
  },
  "course_categories": [
    { "slug": "safety",            "name": "Safety",             "count": 1373 },
    { "slug": "awareness",         "name": "Awareness",          "count": 700  },
    { "slug": "soft-skills",       "name": "Soft Skills",        "count": 377  },
    { "slug": "equipment",         "name": "Equipment",          "count": 330  },
    { "slug": "driver",            "name": "Driver",             "count": 287  },
    { "slug": "electrical",        "name": "Electrical",         "count": 51   },
    { "slug": "products",          "name": "Products",           "count": 6    },
    { "slug": "virtual-reality-vr","name": "Virtual Reality (VR)","count": 6   }
  ],
  "urls": [
    {
      "type": "page",
      "id": 62038,
      "slug": "homepage",
      "link": "https://bissafety.ca/",
      "title": "EHS Software & Safety Management Platform | BIS Software",
      "modified": "2026-05-15T14:46:37Z"
    },
    {
      "type": "post",
      "id": 63921,
      "slug": "safety-spotlight-building-real-safety-culture-erin-heimbecker",
      "link": "https://bissafety.ca/safety-spotlight-building-real-safety-culture-erin-heimbecker/",
      "title": "Saskatchewan Association for Safe Workplaces in Health (SASWH) – From the Field to the Floor: Building Real Safety Culture with Erin Heimbecker",
      "modified": "2026-05-06T12:50:19Z",
      "categories": [12, 47]
    },
    {
      "type": "course",
      "id": 64104,
      "slug": "active-shooter-active-threat-organizational-preparedness-recovery",
      "link": "https://bissafety.ca/courses/active-shooter-active-threat-organizational-preparedness-recovery/",
      "title": "Active Shooter/Active Threat: Organizational Preparedness & Recovery",
      "modified": "2026-05-21T08:07:24Z",
      "course-category": ["safety", "awareness"]
    }
  ]
}
```

If the task asks for navigation in a tree shape (mega-menu top-level sections) rather than a flat URL list, the alternative shape:

```json
{
  "domain": "bissafety.ca",
  "discovered_at": "2026-05-25T23:13:00Z",
  "navigation": {
    "software": {
      "ehs_platform": [
        { "title": "Health and Safety Software", "link": "https://bissafety.ca/health-and-safety-software/" },
        { "title": "Safety Management System (SMS)", "link": "https://bissafety.ca/safety-management-system-sms/" },
        { "title": "Learning Management System (LMS)", "link": "https://bissafety.ca/learning-management-system-lms/" }
      ],
      "safety_training": [
        { "title": "Online Orientation Software", "link": "https://bissafety.ca/online-orientation-software/" },
        { "title": "Virtual Proctoring",           "link": "https://bissafety.ca/virtual-proctoring/" }
      ],
      "industry": [
        { "title": "Transportation", "link": "https://bissafety.ca/ehs-software-for-the-transportation-industry/" },
        { "title": "Energy",         "link": "https://bissafety.ca/ehs-software-for-the-energy-industry/" },
        { "title": "Construction",   "link": "https://bissafety.ca/construction-industry-ehs-software/" }
      ]
    },
    "courses": { "all_courses_landing": "https://bissafety.ca/all-courses/", "subscriptions": "https://bissafety.ca/course-subscription-plans/", "total": 1920 },
    "resources": {
      "blog": "https://bissafety.ca/blog/",
      "podcasts": "https://bissafety.ca/safety-spotlight-podcasts/",
      "events": "https://bissafety.ca/events/",
      "magazine": "https://bissafety.ca/safetynet-magazine/",
      "company_spotlights": "https://bissafety.ca/company-spotlights/"
    },
    "company": {
      "about": "https://bissafety.ca/about-us/",
      "careers": "https://bissafety.ca/careers/",
      "testimonials": "https://bissafety.ca/testimonial/",
      "faq": "https://bissafety.ca/frequently-asked-questions/",
      "contact": "https://bissafety.ca/contact-us/",
      "demo": "https://bissafety.ca/request-a-demo/",
      "legal_trust_centre": "https://bissafety.ca/legal-trust-centre/"
    }
  }
}
```

If the REST API is unreachable and only the sitemap was harvested, return the sitemap shape (still a valid full-site enumeration, just lacking taxonomy/title enrichment):

```json
{
  "domain": "bissafety.ca",
  "discovered_at": "2026-05-25T23:13:00Z",
  "source": "sitemap_only",
  "counts": { "pages": 98, "posts": 220, "courses": 1913, "total": 2231 },
  "urls": [
    { "type": "page",   "link": "https://bissafety.ca/",                          "lastmod": "2026-05-15T14:46:37Z" },
    { "type": "post",   "link": "https://bissafety.ca/transportation-safety-week/", "lastmod": "2026-05-22T23:35:45Z" },
    { "type": "course", "link": "https://bissafety.ca/courses/whmis-2025/",       "lastmod": "2026-05-21T08:07:24Z" }
  ]
}
```
