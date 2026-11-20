---
name: monocle-com-copenhagen-monocle-search-blusxu
title: Monocle Editorial Search
description: >-
  Search monocle.com's editorial archive by free-text query (e.g. a city name
  like Copenhagen), with optional topic and format filters. Returns title,
  canonical URL, author, publication date, topic + tags, excerpt, and
  featured-image URL for each matching article. Read-only.
website: monocle.com
category: media
tags:
  - media
  - editorial
  - search
  - wordpress
  - rss
  - monocle
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: api
alternative_methods:
  - method: api
    rationale: >-
      Per-query RSS feed at /feed/?s={q}&search_format=post returns 10 items per
      page with title, link, dc:creator (author), pubDate, multiple <category>
      tags, excerpt, and full content:encoded — richer than the HTML
      article-cards (which lack author bylines). No auth, no anti-bot, plain
      HTTP fetch. 404 on past-end page is a clean termination signal.
  - method: browser
    rationale: >-
      HTML search page at /?s={q}&search_format=post is needed when you want the
      total-results count or featured-image URLs (both absent from RSS). Also
      works without stealth or proxies. Use as a complement to RSS rather than a
      replacement.
  - method: api
    rationale: >-
      Don't probe the WP REST API — every /wp-json/wp/v2/* route returns 404
      rest_no_route despite the site advertising it via the Link header.
      Confirmed disabled at the WordPress level.
verified: false
proxies: false
---
# Monocle Editorial Search

## Purpose

Search the Monocle editorial archive (`monocle.com`) for articles matching a query — title, canonical URL, author byline, publication date, primary topic, category tags, excerpt, and (optionally) full article body. Optionally filter by topic (Affairs, Design, Travel, ...) and exclude non-editorial formats (radio episodes, city guides, events, partnered content). Read-only — never logs in, never modifies state. Copenhagen is the canonical example query; the skill generalises to any city, place, person, or keyword Monocle has written about.

## When to Use

- "What has Monocle written about Copenhagen?" / "Find Monocle's design coverage of Tokyo." / "List recent Monocle articles tagged urbanism."
- Building a research dossier of Monocle's editorial coverage of a city or topic.
- Periodic monitoring of new Monocle editorials on a watch-term (combine with `pubDate` from RSS to detect new items since last poll).
- Bulk extraction across many query terms — RSS path is cheap (~150KB per page, 10 items, plain HTTP fetch, no auth, no anti-bot).

## Workflow

Monocle is a public WordPress site (Automattic VIP — `X-Hacker` header) with ElasticPress-backed search (`X-Elasticpress-Query: true` on responses). **The official WP REST API is disabled** (`/wp-json/wp/v2/posts?search=...` → 404 `rest_no_route`, despite the `Link: <https://monocle.com/wp-json/>; rel="https://api.w.org/"` header advertising it). However, **the per-query RSS feed is enabled and returns richer data than the HTML search page** — most notably it includes the `<dc:creator>` author byline and `<content:encoded>` full-body HTML, both of which are *absent* from the HTML article-card markup. Lead with the RSS path; HTML browse is a fallback when you also need featured-image URLs or the total result count.

There is **no anti-bot wall**: bare `browse cloud fetch` (no `--proxies`, no `--verified`) returns 200 OK from both the HTML and RSS endpoints. Cookie consent is JS-only and never blocks the underlying HTML/XML body.

### Recommended: RSS feed (per-query)

1. **Build the query URL**. Two interchangeable shapes both work:
   - Query string: `https://monocle.com/feed/?s={URL-enc query}&search_format=post[&search_topic={slug}][&paged={N}]`
   - Path style: `https://monocle.com/search/{URL-enc query}/feed/?search_format=post[&search_topic={slug}][&paged={N}]`

   - `s` (or path segment): the search term.
   - `search_format=post`: **the editorial filter** — restricts to WordPress posts (i.e. magazine articles), excluding `event`, `travel_guide`, `radio_episode`, `partnered_content`. Omit this param to return all formats.
   - `search_topic={slug}`: optional single-topic facet (e.g. `design`, `affairs`, `urbanism`, `travel-and-restaurants`). See the topic-slug list in "Site-Specific Gotchas".
   - `paged=N`: 1-indexed page. Each page returns 10 `<item>` blocks. Walking past the last page returns **`HTTP 404`** — a clean termination signal.

2. **Fetch**:
   ```bash
   browse cloud fetch "https://monocle.com/feed/?s=copenhagen&search_format=post&paged=1"
   ```
   No `--proxies`, no session, no cookies needed. Response is `application/rss+xml; charset=UTF-8`, ~120-150 KB per page for 10 items including full bodies.

3. **Parse each `<item>`**:
   - `<title>` — article title (HTML-entity decode required: e.g. `&#8217;` → `'`).
   - `<link>` — canonical article URL (`https://monocle.com/{topic}/{slug}/`).
   - `<dc:creator>` — author byline (CDATA-wrapped; RSS-only, not in HTML cards).
   - `<pubDate>` — RFC-2822 timestamp (e.g. `Fri, 20 Jun 2025 18:29:50 +0000`).
   - `<category>` (repeated 1-N times) — primary topic comes first, followed by tag slugs. First category is the same value rendered as the topic badge in the HTML.
   - `<description>` — CDATA-wrapped HTML excerpt (1-2 sentences). Strip the trailing `The post <a>...</a> appeared first on...` boilerplate.
   - `<content:encoded>` — CDATA-wrapped full article body HTML. Use only if you need the body; otherwise skip — it's ~10-15 KB per item.

4. **Paginate** until `HTTP 404` is returned by `paged=N`. Result count is not exposed in RSS — if you need the total up-front, hit the HTML page once (step below) and parse the count selector before walking RSS.

### Browser fallback: HTML search page

Use when you need featured-image URLs (not in RSS) or the up-front total-results count, or when the RSS feed is unreachable.

1. **Build the URL** (same param surface as RSS, no `/feed/` segment):
   ```
   https://monocle.com/?s={URL-enc query}&search_format=post[&search_topic={slug}][&paged={N}]
   ```
   Or path style: `https://monocle.com/search/{query}[/page/{N}/][?search_format=post]`.

2. **Fetch** with `browse cloud fetch <url>` — no stealth needed. Or drive interactively with `browse open <url>` if you want screenshots/snapshots for debugging.

3. **Parse the HTML**:
   - **Total count**: `<div class="o-search-results__actions"> <p>{N} stories about "{query}"</p>` → regex `(\d+)\s+stories about\s+["“]([^"”]+)["”]`.
   - **Each result card**: `<article id="{POST_ID}" class="c-article-card ...">`. The `id` attribute is the stable WordPress post ID — use it for deduping.
   - **Within each card**:
     - Category badge: `span.c-article-card__category a` — `href` is the topic URL, text is the topic name.
     - Title + URL: `h3.c-article-card__title a` — `href` is the canonical article URL, text is the title.
     - Excerpt: `p.c-article-card__description`.
     - Meta items: `ul.c-article-card__meta li` — each `<li>` may begin with an inline SVG decoration; **strip inner tags before reading text** (e.g. `Issue #185`, `3 min read`). Naive `<li>([^<]+)</li>` regex skips Issue-# items because of the leading SVG.
     - Featured image: `figure.c-article-card__image img` — `src` and `srcset` (1x / 2x).
   - **Pagination**: nav block with class `posts-pagination`; next page is `https://monocle.com/search/{query}/page/{N+1}/` (preserves any `?search_format` / `?search_topic` query params).

## Site-Specific Gotchas

- **WP REST API is disabled despite advertising itself.** Every `/wp-json/wp/v2/*` route returns `{"code":"rest_no_route","status":404}`, even though the response headers include `X-WP-Total`, `X-WP-TotalPages`, `Access-Control-Allow-Headers: X-WP-Nonce`, and a `Link` header pointing to `/wp-json/`. Don't waste cycles probing alternate REST routes — the site has stripped them at the WordPress level. Use the RSS feed instead.
- **`search_topic[]` array notation is silently ignored.** `?s=copenhagen&search_topic[]=design&search_topic[]=culture` returns the unfiltered set (171 results), not the union (the design-only subset is 49). Only single-value `search_topic=<slug>` filtering works through the URL layer. To collect across multiple topics, issue separate requests per topic and dedupe by post ID (`<article id="..."`).
- **The Apply-Filters button in the UI drops the search query.** Clicking the FILTER button on a search-results page, selecting a format, and pressing APPLY FILTERS navigates to `https://monocle.com/?search_format=post` — the `s={query}` param is **discarded**. Always build URLs directly with both params rather than relying on the in-page filter UI.
- **"Editorials" = `search_format=post`.** Monocle's UI calls them "Article" but the underlying WP post-type slug is `post`. The other four format slugs (`event`, `travel_guide`, `radio_episode`, `partnered_content`) are not editorial content and should be excluded for an editorials-only query. Omitting `search_format` returns the union of all five.
- **Author bylines are in RSS only.** The HTML article-card markup (`.c-article-card`) has no author element. If you need the byline, you must hit the RSS feed (or click through to the individual article page).
- **Featured image URLs are in HTML only.** The RSS feed has no `<media:content>` or `<enclosure>` elements. If you need thumbnails, scrape `figure.c-article-card__image img` from the HTML page.
- **Per-page size is fixed at 10.** Both HTML pagination (`/page/N/`) and RSS pagination (`?paged=N`) return 10 items per page. There is no per-page override (`per_page=`, `posts_per_page=`, etc.).
- **Pagination past the last page returns `HTTP 404`** for RSS and a rendered "no results" HTML page for the search route. Use 404 (RSS) or the absence of `.c-article-card` blocks (HTML) as the loop-termination signal.
- **Issue-# meta items contain a leading inline SVG.** Inside `ul.c-article-card__meta`, items like `<li><svg>...</svg> Issue #185 </li>` will be missed by a `<li>([^<]+)</li>` regex. Either parse as DOM and read `textContent`, or use a regex that strips inner `<svg>…</svg>` first. Read-time items (`3 min read`) have no leading SVG and parse cleanly.
- **HTML entities in titles.** RSS-feed titles are entity-encoded (`Copenhagen&#8217;s` for `Copenhagen's`). Decode before emitting.
- **`description` carries boilerplate.** The RSS `<description>` ends with `<p>The post <a>...</a> appeared first on <a href="https://monocle.com">Monocle</a>.</p>` — strip this paragraph for a clean excerpt.
- **`content:encoded` is large.** Each item's full-body HTML is ~10-15 KB. If you only need title + URL + date, parse only the elements you need rather than the full item. For bulk runs, prefer reading the RSS feed once and persisting parsed items rather than re-fetching.
- **Format slugs** (`search_format`): `post` (Article — editorial), `event`, `travel_guide` (City Guide), `radio_episode`, `partnered_content`.
- **Topic slugs** (`search_topic`, observed from the filter modal's `data-value` attributes): `affairs, architecture, art, arts, aviation, books, business, craft, culture, defence, design, diplomacy, economics, economy, education, entertaining, entertainment, entrepreneurialism, environment, fashion, film, food-drink, furniture, government, health, hospitality, industry, konfekt, manufacturing, media, monocle-films, monocle-radio, music, photography, politics, product-design, property, recipe, residences, retail, shoots, society, soft-power, sport, technology, the-faster-lane, the-monocle-concierge, the-monocle-minute, the-weekend-opener, transport, travel-and-restaurants, urbanism, wine`. (The label shown in the filter UI is the title-cased slug with hyphens replaced by spaces.)
- **`?s=` vs `/search/{query}` are equivalent.** Both forms hit the same handler and produce identical results. Path-style URLs are slightly cleaner for direct linking; query-style is easier to build programmatically.
- **No geo-redirect, no IP scoping, no rate-limit observed in test.** Run from anywhere; keep ≤ 1 req/s sustained as a courtesy.

## Expected Output

```json
{
  "query": "copenhagen",
  "format": "post",
  "topic": null,
  "total_results": 171,
  "page": 1,
  "items": [
    {
      "post_id": 195123,
      "title": "Why Copenhagen's 3 Days of Design leaves such a lasting impression",
      "url": "https://monocle.com/design/3-days-of-design-copenhagen-comment/",
      "author": "Kate Lucey",
      "published_at": "2025-06-20T18:29:50Z",
      "primary_topic": "Design",
      "categories": ["Design", "3 days of design", "design fairs"],
      "excerpt": "Designers from Tokyo to Porto headed to Copenhagen to rethink what a design fair can be, with thoughtful collaborations and intimate, idea-led showcases.",
      "issue": null,
      "read_time_minutes": null,
      "image_url": "https://monocle.com/wp-content/uploads/2025/06/EIS_20250617_1313_CROP.jpg?w=745"
    },
    {
      "post_id": 189311,
      "title": "Copenhagen's latest park demonstrates the virtues of having no kids on the block",
      "url": "https://monocle.com/affairs/urbanism/copenhagens-adult-only-opera-park/",
      "author": "Carlota Rebelo",
      "published_at": "2025-06-15T09:00:00Z",
      "primary_topic": "Urbanism",
      "categories": ["Urbanism", "parks", "denmark"],
      "excerpt": "Inside the sanctuary of Opera Park, a child-free green space designed strictly for grown-ups.",
      "issue": "185",
      "read_time_minutes": 3,
      "image_url": "https://monocle.com/wp-content/uploads/2025/06/Monocle_Skip_Final_LargerBG_thumb.jpg?w=745"
    }
  ],
  "next_page": "https://monocle.com/feed/?s=copenhagen&search_format=post&paged=2"
}
```

Outcome shapes:

```json
// No results for the query
{ "query": "asdfqwerzxcv", "format": "post", "total_results": 0, "items": [] }

// Past last page (RSS 404)
{ "query": "copenhagen", "format": "post", "page": 99, "items": [], "end_of_results": true }

// Topic filter applied
{ "query": "copenhagen", "format": "post", "topic": "design", "total_results": 49, "items": [...] }

// All formats (omit search_format)
{ "query": "copenhagen", "format": null, "total_results": 352, "items": [...] }
```

Notes on the JSON above: `issue` and `read_time_minutes` come from the HTML `ul.c-article-card__meta` block and are `null` on items not tied to a print issue (e.g. web-only comment pieces — `id=195123` above is one). `image_url` is HTML-only; pure-RSS callers will see `image_url: null`. `author` is RSS-only; pure-HTML callers will see `author: null`. For a complete record, run the RSS feed and HTML page once each and merge on `post_id` (the `<article id>` attribute on HTML matches the WP post ID; RSS items don't expose the ID directly — match by canonical URL slug).
