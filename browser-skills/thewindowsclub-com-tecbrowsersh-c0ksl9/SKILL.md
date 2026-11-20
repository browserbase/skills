---
name: thewindowsclub-com-tecbrowsersh-c0ksl9
title: The Windows Club Article Search
description: >-
  Search TheWindowsClub for articles by keyword (with optional category/tag
  scoping and date/relevance sort), returning each article's title, URL, publish
  date, excerpt, category and tag IDs.
website: thewindowsclub.com
category: news-blog
tags:
  - windows
  - tutorials
  - wordpress
  - search
  - tech-blog
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      When the WP REST API is rate-limited by Cloudflare (rare — responses are
      CDN-cached) or the wp-json route is disabled site-wide, fall back to
      fetching /?s={query} HTML and extracting article cards. ~10-30x slower per
      result and excerpts are truncated to the snippet shown in the card.
verified: false
proxies: true
---
# The Windows Club Article Search

## Purpose

Return a list of TheWindowsClub articles matching a keyword query — each with title, canonical URL, publish date (local + GMT), HTML excerpt, author id, category ids, and tag ids. Optionally scope the search to a category (broad bucket: Windows / General / Office / Downloads / Security) or a tag (any of 399 topical labels: Outlook, Excel, Chrome, Edge, Errors, Troubleshoot, Windows Updates, etc.). Read-only; never posts, comments, or interacts with login-gated routes.

## When to Use

- Daily / hourly monitoring of new TheWindowsClub posts on a Windows topic (BSOD, Windows Update errors, registry tweaks, Edge/Chrome issues, Office 365 problems).
- Hydrating known article IDs into full title/excerpt/link records for downstream summarisation.
- Bulk extraction of every article in a category or tag (e.g. all 715 Outlook-tagged posts, all 848 Security category posts) for offline indexing.
- Anywhere you would otherwise scrape TheWindowsClub HTML — the WP REST API is faster, returns structured fields, and is Cloudflare-cached.

## Workflow

TheWindowsClub is a standard WordPress site with its public REST API exposed at `https://www.thewindowsclub.com/wp-json/wp/v2/...` — no auth, no cookies, no anti-bot challenge, no `--verified` requirement. Cloudflare fronts the origin and caches responses (`Cf-Cache-Status: HIT` on repeat queries; `max-age=691200` ≈ 8 days). **Residential proxies are not required for the API** (`browse cloud fetch` with default egress returns 200 OK), but most browser-sandbox environments have outbound HTTP firewalled, so route every request through `browse cloud fetch` or a Browserbase session. Lead with the API path; the browser path costs ~10-30× more turns per result and truncates excerpts.

1. **Build the search URL**. The primary endpoint is `/wp-json/wp/v2/posts`. Keep the response small with `_fields=` and tune sort:
   ```
   GET https://www.thewindowsclub.com/wp-json/wp/v2/posts
       ?search={url-encoded query}
       &per_page={1..100}          # WP cap is 100; default is 10
       &page={N}                   # 1-indexed
       &orderby={date|relevance|modified|title|id}
       &order={desc|asc}            # default desc
       &categories={id}             # optional broad-bucket filter
       &tags={id}                   # optional topical-tag filter
       &_fields=id,date,date_gmt,modified,slug,link,title,excerpt,author,categories,tags
   ```
   Default sort is `orderby=date&order=desc` (newest first). `orderby=relevance` is **only** honoured when `search=` is also supplied and produces materially different (better-matched) results — e.g. `search=fix+windows+update` with default sort returns the latest "Windows Update" article (any topic); with `orderby=relevance` it returns "Fix Windows Update error 0x80070BC9" at rank 1.

2. **Read the response totals from headers, not the body** — WP returns the items array only:
   - `X-Wp-Total` — total matching posts (e.g. `728` for `search=fix blue screen`, `6979` for `search=outlook`).
   - `X-Wp-Totalpages` — total pages at the current `per_page` (e.g. `73` at `per_page=10`, `8` at `per_page=100`).
   - `Link: <...page=N+1>; rel="next", <...page=N-1>; rel="prev"` — RFC 5988 pagination links.

3. **Decode each post**. Every item in the JSON array has WordPress's standard shape; the fields you need:
   - `id` — stable WP post id (e.g. `107739`). Use for single-post hydration via `GET /wp-json/wp/v2/posts/{id}`.
   - `date` — local publish time (`"2026-05-05T03:29:00"`, no timezone suffix — the site's TZ is **IST**, UTC+05:30).
   - `date_gmt` — UTC publish time (`"2026-05-04T21:59:00"`). **Prefer this for sorting / "since" filters** — `date` is timezone-bare.
   - `modified` / `modified_gmt` — last edit timestamps (articles are routinely updated; `modified > date` is normal and not a republish).
   - `slug` — URL slug (`"logi-options-lets-you-control-and-personalize-logitech-devices"`).
   - `link` — canonical article URL (`"https://www.thewindowsclub.com/{slug}"`). **No date in path** — flat slug-only URL pattern.
   - `title.rendered` — HTML-entity-encoded title (`"This calendar can&#8217;t be shared..."`). Decode HTML entities before display.
   - `excerpt.rendered` — opening-paragraph HTML, wrapped in `<p>...</p>`, occasionally truncated mid-word followed by `[&hellip;]` or similar. Strip tags + decode entities for plain-text.
   - `author` — numeric WP user id. Hydrate via `GET /wp-json/wp/v2/users/{id}` if you need the display name.
   - `categories` — array of category ids. **TheWindowsClub uses only 5 top-level categories:** `569` Windows (11955 posts), `186` General (5520), `130` Office (2808), `8` Downloads (2750), `6` Security (848). Most posts have exactly one.
   - `tags` — array of tag ids. **399 tags total** — this is the meaningful topical taxonomy. Top tags: `11` Games, `14` Freeware, `73` Troubleshoot, `753` Errors, `424` Outlook, `435` Excel, `174` Chrome, `1176` Edge, `4` Features, `150` Windows Updates.

4. **Construct human-readable category/tag names** (optional, recommended for output). The full taxonomy fits in one request each:
   ```
   GET /wp-json/wp/v2/categories?per_page=100&_fields=id,name,slug,count
   GET /wp-json/wp/v2/tags?per_page=100&orderby=count&order=desc&_fields=id,name,slug,count
   ```
   Categories endpoint returns only 5 items total. Tags endpoint paginates (`X-Wp-Totalpages: 4` at `per_page=100`). Cache locally — the taxonomy changes rarely.

5. **Paginate**. Increment `page=` until you have enough results or reach `X-Wp-Totalpages`. WP returns HTTP `400` (`rest_post_invalid_page_number`) if you exceed total pages; stop one short.

6. **Sub-100 batches for unbounded crawls**. WP caps `per_page` at `100`. For large result sets (e.g. all 6,979 "outlook" matches), iterate `page=1..70` at `per_page=100`. Throttle to ~1 req/s — Cloudflare caches GETs so repeats are nearly free, but bursts on uncached queries can trip rate-limit middleware.

### Lightweight alternative — the search endpoint

`/wp-json/wp/v2/search` returns the same set with only `id`, `title`, `url`, `type`, `subtype` per item (~10× smaller payload). It also includes WP **pages** (subtype=page), not just posts — pass `subtype=post` to filter. Use when you only need title + link and don't care about date/excerpt:
```
GET /wp-json/wp/v2/search?search={q}&subtype=post&per_page=100&page={N}
```

### Browser fallback

If the JSON API ever returns a Cloudflare interstitial or `/wp-json/` is disabled, fall back to the site's built-in search at `https://www.thewindowsclub.com/?s={url-encoded query}`. The page is server-rendered (snapshot returns refs; no need to wait for JS). Article cards live under repeating blocks; for each block extract:

- **URL**: `<h2 class="entry-title"><a href="(https://www\.thewindowsclub\.com/[^"]+)"`
- **Title**: text content of the same `<a>` (HTML-entity decoded)
- **Date**: `<time[^>]+datetime="([^"]+)"` (ISO 8601, IST)
- **Excerpt**: `<div class="entry-summary">\s*<p>([^<]+)</p>` (truncated to ~30 words by the theme — shorter than the API's excerpt)
- **Author**: `<a rel="author"[^>]*>([^<]+)</a>`

Pagination at the bottom: `/page/{N}/?s={q}` — same `?s=` query carried forward. Capture a `browse get html body` per page and run the above regex set; do **not** use `browse snapshot` + `click` to enumerate (~3 turns per card vs. one fetch for the whole page). A Browserbase session with `--verified --proxies` is recommended for the browser path because Cloudflare's bot challenge can fire on bare egress.

## Site-Specific Gotchas

- **Cloudflare caches API GETs aggressively** (`max-age=691200` ≈ 8 days, `Cf-Cache-Status: HIT` on repeats). Identical queries return identical bytes — a freshly published article may not appear in `search=` results for several hours after publish if a popular query is sitting on a cached miss. For monitoring, use `orderby=date&search=` on each poll and de-dupe by `id` client-side; do not rely on `X-Wp-Total` changing in real-time.
- **`date` field is timezone-naive (IST = UTC+05:30)** — `"2026-05-05T03:29:00"` is IST, not UTC. For absolute timestamps, use `date_gmt` which is correctly suffixed (also lacks `Z` but is GMT by name). Same applies to `modified` vs `modified_gmt`.
- **Title and excerpt are HTML-encoded.** Smart quotes appear as `&#8217;`, ampersands as `&amp;`, etc. Always decode HTML entities before display. `excerpt.rendered` is wrapped in `<p>...</p>` — strip tags first.
- **Only 5 top-level categories — topical filtering lives in tags.** `categories=569` (Windows) covers ~12k posts and isn't a useful narrowing filter. Use `tags={tag-id}` (e.g. `tags=424` for Outlook → 283 results when combined with `search=error`) for meaningful scope. Fetch the full tag list once and cache locally.
- **`orderby=relevance` is silently ignored without `search=`** — you'll get date-desc results. Always pair `orderby=relevance` with a non-empty `search` query.
- **`search` does fuzzy multi-token AND-matching** — `search=fix+windows+update` matches posts containing all three tokens anywhere in title/content/excerpt. There is no quoted-phrase operator; `search="fix windows update"` is treated the same as the unquoted version. For exact-phrase matching, post-filter the JSON by `title.rendered.toLowerCase().includes(phrase)`.
- **`per_page` is hard-capped at 100.** Requesting `per_page=200` silently caps to 100 (no error). Total result count comes from headers (`X-Wp-Total`), not from counting items.
- **Page-overflow returns HTTP 400, not 200 with empty array.** Requesting `page=N+1` past `X-Wp-Totalpages` returns `{"code":"rest_post_invalid_page_number","data":{"status":400}}`. Check `X-Wp-Totalpages` and stop one short.
- **Excerpts are sometimes truncated mid-word** with `[&hellip;]` or `&#8230;`. They are **not** full article bodies — for full text, fetch `content.rendered` by omitting `_fields=` from the request (response will be 5-20× larger per post).
- **Article URL pattern is flat slug** — `https://www.thewindowsclub.com/{slug}`, no `/year/month/` prefix. Easy to construct from `slug` alone.
- **Modified timestamp ≠ republish.** Articles are routinely edited (typo fixes, link refreshes). `modified_gmt > date_gmt` by months or years is normal; do not interpret it as a fresh publish event.
- **`X-Robots-Tag: noindex` on the `/wp-json/` API responses** is meta-information about the API endpoint itself (not the underlying posts) — it tells search engines not to index the API URLs. Safe to ignore for scraping.
- **The site exposes a sitemap at `https://www.thewindowsclub.com/sitemap_index.xml`** (referenced in `/robots.txt`). For complete-archive enumeration (~25k posts), the sitemap is faster than paginating `wp/v2/posts` — but it has only URLs + lastmod, no titles/excerpts. Use for URL inventory; use the API for content.
- **Article-page `browse open` may report a `waitForMainLoadState` timeout** because of slow third-party ad/analytics scripts on the article body. The DOM is interactive long before `load` fires — the screenshot and HTML are valid even when the navigation call returns with a timeout error. For the API path this is irrelevant; for the browser fallback, use `browse get html body` rather than waiting for `load`.

## Expected Output

```json
{
  "query": "fix blue screen",
  "filters": {
    "categories": null,
    "tags": null,
    "orderby": "relevance",
    "order": "desc"
  },
  "total_results": 728,
  "total_pages": 8,
  "per_page": 100,
  "page": 1,
  "articles": [
    {
      "id": 107739,
      "title": "How to fix Blue Screen in Windows 11 or Windows 10",
      "slug": "blue-screen-death-windows-10",
      "url": "https://www.thewindowsclub.com/blue-screen-death-windows-10",
      "date_local": "2025-01-04T21:09:00",
      "date_gmt": "2025-01-04T15:39:00",
      "modified_gmt": "2026-01-12T10:22:00",
      "excerpt": "Windows 11/10 too has the Blue Screen of Death (BSOD) or Stop Error screen that appears when you are in the middle of something, upgrading the operating system...",
      "author_id": 136,
      "category_ids": [569],
      "category_names": ["Windows"],
      "tag_ids": [239],
      "tag_names": ["Blue Screen"]
    },
    {
      "id": 534689,
      "title": "Logi Options+ lets you control and personalize Logitech devices",
      "slug": "logi-options-lets-you-control-and-personalize-logitech-devices",
      "url": "https://www.thewindowsclub.com/logi-options-lets-you-control-and-personalize-logitech-devices",
      "date_local": "2026-05-05T03:29:00",
      "date_gmt": "2026-05-04T21:59:00",
      "modified_gmt": "2026-05-05T08:37:38",
      "excerpt": "Logitech devices are designed not just to work, but to work smarter, with added customization, comfort, and productivity-focused features...",
      "author_id": 136,
      "category_ids": [8],
      "category_names": ["Downloads"],
      "tag_ids": [14],
      "tag_names": ["Freeware"]
    }
  ]
}
```

Minimal-shape output when callers only need title + URL (using `/wp-json/wp/v2/search`):

```json
{
  "query": "fix blue screen",
  "total_results": 729,
  "articles": [
    {
      "id": 107739,
      "title": "How to fix Blue Screen in Windows 11 or Windows 10",
      "url": "https://www.thewindowsclub.com/blue-screen-death-windows-10",
      "type": "post"
    }
  ]
}
```

Empty-result shape (valid query, no matches):

```json
{
  "query": "completely-nonsense-query-xyz-zzz",
  "total_results": 0,
  "total_pages": 0,
  "articles": []
}
```

Page-overflow error shape (when caller paginates past `total_pages`):

```json
{
  "error": "rest_post_invalid_page_number",
  "status": 400,
  "message": "The page number requested is larger than the number of pages available."
}
```
