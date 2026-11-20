---
name: derekmeegan-com-meet-derek-n1xdkp
title: Derek Meegan — Find Latest Publications
description: >-
  Return Derek Meegan's most recently published articles (titles, dates, tags,
  and canonical Medium URLs) from the /writing index on derekmeegan.com.
  Read-only; single HTTPS GET, no browser or anti-bot stealth required.
website: derekmeegan.com
category: personal-site
tags:
  - personal-site
  - blog
  - writing
  - rss
  - medium
  - ssr
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: url-param
alternative_methods:
  - method: api
    rationale: >-
      Upstream Medium RSS feed at https://derekmeegan.medium.com/feed returns
      the same posts in structured XML with RFC 822 + ISO timestamps, full
      content:encoded, and stable guids. Strictly cleaner data than HTML
      scraping. Cross-domain to derekmeegan.medium.com — preferred when richer
      fields are needed.
  - method: browser
    rationale: >-
      Fallback only if outbound HTTPS fetch is unavailable. Bare Browserbase
      session (no --verified, no --proxies) loads /writing fine; extract via
      'browse get markdown body' which emits deterministic Markdown. Pays a
      ~3-5s premium over the raw GET for no data-quality gain.
verified: true
proxies: true
---
# Derek Meegan — Find Latest Publications

## Purpose

Return Derek Meegan's most recently published articles (titles, publication dates, tags, and canonical Medium URLs) as listed on his personal site's `/writing` index. The page is a curated reverse-chronological list mirroring his Medium feed. Read-only — never publishes, comments, or interacts with article bodies.

## When to Use

- "What has Derek Meegan written recently?" / "Show me his latest article."
- Periodic monitoring of new posts (daily/weekly cron) for a research feed or aggregator.
- Background-building before reaching out to Derek (interview prep, partnership outreach, fan note).
- Any flow that needs his publication list — single article or full back-catalog — without rendering article bodies.

## Workflow

The `/writing` page is a Next.js server-rendered HTML page with no anti-bot, no auth, no rate limiting observed, and no JavaScript required to extract the entries. Every visible article entry is present in the initial HTML response. **No browser session is needed for the recommended method** — a single HTTPS GET returns everything.

### 1. Fetch the writing index (recommended)

```
GET https://www.derekmeegan.com/writing
```

The bare-domain `https://derekmeegan.com/writing` returns a `308` to `www.derekmeegan.com/writing` — always hit the `www.` host directly to skip the redirect hop. No headers required (no `User-Agent` discrimination, no `Referer` check, no cookies). Returns `200 text/html` with `X-Vercel-Cache: HIT` — the response is CDN-edge cached, so ~1465s `Age` is normal and not a freshness problem (the upstream Medium feed publishes infrequently and the cache invalidates on rebuild).

### 2. Parse the article list

Each entry is encoded as a sequence of sibling DOM nodes inside the writing section. The deterministic shape is:

```
<a href="{medium_url}">{title}</a>
{tag_1}
{tag_2}
...
{tag_N}
{date_display}
```

The simplest reliable extractor is a regex over all `<a href="…">…</a>` anchors that point at `derekmeegan.medium.com/*`, then walk forward from each anchor collecting plain-text siblings until you reach the date (matched against `^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b`).

Alternative: drive a remote browser with `browse open … && browse get markdown body`, which emits a deterministic Markdown stream where each article is exactly: a Markdown link line, then N blank-line-separated tag lines, then a date line. This is what the Browser fallback below uses; it adds ~3-5s vs. the raw fetch but is more typo-tolerant of future HTML changes.

### 3. Normalize and return

Fields per entry:
- `title` — anchor text (raw, includes punctuation and unicode like "Cliché").
- `url` — the `href` value verbatim. Always points to `derekmeegan.medium.com/*?source=rss-1104c6a8208d------2`. The `?source=…` query string is a Medium attribution token mirrored from the upstream RSS feed; **leave it intact** if you'll click through to the article (Medium uses it for analytics), or strip it for display.
- `tags` — array of lowercase, hyphen-joined topic tokens as authored on Medium. Preserve typos verbatim (the corpus today contains `crytpocurrencies` — sic — as a real tag value; do NOT correct).
- `date_display` — the human string as rendered ("Nov 7th, 2025"). Parse with a tolerant parser (regex `^(?<mon>\w{3})\s+(?<day>\d+)(st|nd|rd|th),\s+(?<year>\d{4})$`) to get ISO. **Beware**: the display string omits time-of-day; if you need precise timestamps, fall back to the Medium RSS feed (see "Better timestamps" below).

The list is already sorted by publication date descending. The first parsed entry is the latest publication. Today's latest is "Not Capitalism, Not Communism, but a Secret Third Thing" (Nov 7th, 2025) — anything later than that means new content has dropped.

### Better timestamps & full content (alternative path)

The on-site list is a mirror of Derek's Medium RSS feed (the `?source=rss-…` query string in every URL is the giveaway). If you need precise `pubDate`, `dc:creator`, `content:encoded` (full article HTML), `guid`, or you want a more parser-friendly format, hit the upstream feed directly:

```
GET https://derekmeegan.medium.com/feed
```

Returns `text/xml; charset=UTF-8`, ~125 KB, RSS 2.0 with `<item>` per post containing `<title>`, `<link>`, `<guid>`, multiple `<category>`, `<pubDate>` (RFC 822 with seconds and timezone), `<atom:updated>` (ISO 8601), and `<content:encoded>` (full HTML body). Same ordering, same set of posts, structurally cleaner. This is on `derekmeegan.medium.com` (a Medium-hosted subdomain), not `derekmeegan.com` — flag the cross-domain hop if your runtime cares.

### Browser fallback

Only if a sandboxed runtime can't make outbound HTTPS at all (rare). Standard Browserbase session, no stealth needed:

```bash
sid=$(browse cloud sessions create --keep-alive | jq -r .id)
browse open "https://www.derekmeegan.com/writing" --remote --session "$sid"
browse get markdown body --remote --session "$sid"   # parse as described above
browse cloud sessions update "$sid" --status REQUEST_RELEASE
```

`--proxies` and `--verified` are unnecessary — the site has no anti-bot. Confirmed during iter-1: a bare session with no stealth returned the same `200 HIT` response as `browse cloud fetch`.

## Site-Specific Gotchas

- **`derekmeegan.com` → `www.derekmeegan.com` 308 redirect** on every path. Always request the `www.` host directly to skip the hop.
- **No on-domain feed or JSON endpoint exists.** Confirmed `404` for all of `/feed`, `/feed.xml`, `/rss`, `/rss.xml`, `/atom.xml`, `/writing/rss`, `/writing.rss`, `/writing.json`, `/api/posts`, `/api/writing`, `/api/articles`. Don't waste recon time probing for more — the only structured source is the upstream Medium RSS at `derekmeegan.medium.com/feed`.
- **The article body is NOT on derekmeegan.com.** Each title anchors directly to `derekmeegan.medium.com/{slug}-{hash}?source=rss-…` — there are no in-domain article pages like `/writing/{slug}`. If a downstream task needs article *contents*, it must hop to Medium (which has its own anti-bot — paywall interstitials, "open in app" overlays) or read `<content:encoded>` from the RSS feed (much easier, no anti-bot).
- **Tags carry author typos verbatim.** The corpus today contains `crytpocurrencies` (sic, on the Bitcoin Thanksgiving post). Don't auto-correct on extraction; if you need normalized topics, do that downstream.
- **No pagination, no filtering, no "load more".** The `/writing` page is a single static list (10 entries today, will grow). If the list ever exceeds a screen the page just gets longer — there's no `?page=2`, `?after=`, or infinite scroll to deal with.
- **Date strings are display-only.** "Nov 7th, 2025" has no time-of-day, no timezone, no ISO form. For precise ordering across same-day posts (rare on this site), use the RSS feed's `<pubDate>` / `<atom:updated>`.
- **CDN caching is aggressive but safe.** `X-Vercel-Cache: HIT` with multi-day `Age` headers is normal — Vercel invalidates on the next deploy/rebuild of the site, and the upstream Medium feed publishes infrequently enough that this hasn't been observed to lag reality. If you absolutely need real-time freshness, hit the Medium RSS — it's served by Medium with a much shorter TTL.
- **No anti-bot, no rate limits observed.** No User-Agent gating, no Cloudflare/Akamai challenge, no captcha. `browse cloud fetch` with a default residential proxy and no stealth returned full content on first try. Do not waste budget on `--verified` or `--proxies` for this domain.

## Expected Output

```json
{
  "fetched_at": "2026-05-19T15:23:00Z",
  "source_url": "https://www.derekmeegan.com/writing",
  "count": 10,
  "latest": {
    "title": "Not Capitalism, Not Communism, but a Secret Third Thing",
    "url": "https://derekmeegan.medium.com/not-capitalism-not-communism-but-a-secret-third-thing-c9a99f7e1bbb",
    "tags": ["ai", "artificial-intelligence", "economics", "technology", "politics"],
    "date_display": "Nov 7th, 2025",
    "date_iso": "2025-11-07"
  },
  "entries": [
    {
      "title": "Not Capitalism, Not Communism, but a Secret Third Thing",
      "url": "https://derekmeegan.medium.com/not-capitalism-not-communism-but-a-secret-third-thing-c9a99f7e1bbb",
      "tags": ["ai", "artificial-intelligence", "economics", "technology", "politics"],
      "date_display": "Nov 7th, 2025",
      "date_iso": "2025-11-07"
    },
    {
      "title": "AI-Powered SEO Tools Are Changing the Way We Optimize Search",
      "url": "https://derekmeegan.medium.com/ai-powered-seo-tools-are-changing-the-way-we-optimize-search-55e36a12ef4a",
      "tags": ["ai", "keyword-research-tool", "keywords", "keyword-research", "seo"],
      "date_display": "Dec 16th, 2024",
      "date_iso": "2024-12-16"
    },
    {
      "title": "How to Explain Bitcoin to Your Family This Thanksgiving (Again)",
      "url": "https://derekmeegan.medium.com/how-to-explain-bitcoin-to-your-family-this-thanksgiving-again-da8223c7c1b4",
      "tags": ["crytpocurrencies", "blockchain", "bitcoin", "ethereum", "thanksgiving"],
      "date_display": "Nov 27th, 2024",
      "date_iso": "2024-11-27"
    }
  ]
}
```

When the upstream Medium RSS path is used instead, the per-entry shape gains `pub_date_rfc822` (e.g. `"Fri, 07 Nov 2025 18:47:20 GMT"`), `updated_iso` (ISO 8601 with milliseconds), `guid` (e.g. `"https://medium.com/p/c9a99f7e1bbb"`), and optionally `content_html` (full article body):

```json
{
  "title": "Not Capitalism, Not Communism, but a Secret Third Thing",
  "url": "https://derekmeegan.medium.com/not-capitalism-not-communism-but-a-secret-third-thing-c9a99f7e1bbb",
  "guid": "https://medium.com/p/c9a99f7e1bbb",
  "tags": ["ai", "artificial-intelligence", "economics", "technology", "politics"],
  "pub_date_rfc822": "Fri, 07 Nov 2025 18:47:20 GMT",
  "updated_iso": "2025-11-07T18:57:15.958Z",
  "author": "Derek Meegan",
  "content_html": "<figure>…</figure><h3>A spectre is haunting America…</h3>…"
}
```

If the requester only asked for "the latest publication" (singular), return just the `latest` object. If they asked for "the latest N" or "all publications", return `entries` truncated/full as appropriate.
