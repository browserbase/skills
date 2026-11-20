---
name: bbc-co-uk-news-homepage-sqnkv0
title: BBC News Homepage Top Stories
description: >-
  Return the current set of top stories from the BBC News homepage — title,
  summary, canonical article URL, publication timestamp, section, and thumbnail
  — via the public RSS feed at feeds.bbci.co.uk/news/rss.xml. Read-only.
website: bbc.co.uk
category: news
tags:
  - news
  - bbc
  - rss
  - headlines
  - read-only
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      When the RSS endpoint is unreachable (rare — feeds.bbci.co.uk has been
      stable for ~20 years) or you need elements that aren't in the feed
      (live-blog placement, embedded video, BBC InDepth rail), fall back to
      opening https://www.bbc.com/news in a bare browser session and parsing
      card anchors from the rendered markdown body. No stealth or proxies
      required.
verified: false
proxies: false
---
# BBC News Homepage Top Stories

## Purpose

Return the current set of top stories from the BBC News homepage — title, summary, canonical article URL, publication timestamp, section, and thumbnail — as a flat list. Read-only; never posts, comments, or signs in.

## When to Use

- "What is on the BBC News front page right now?"
- Periodic / scheduled polling of the BBC's editorial front page (digest emails, dashboards, push alerts).
- Bulk ingestion of BBC top stories into a downstream search / archive / analytics pipeline.
- Any flow that would otherwise scrape `bbc.co.uk/news` or `bbc.com/news` HTML — the public RSS feed is orders of magnitude faster, returns the same editorial set, and is explicitly permitted by BBC's terms of use for metadata and RSS reuse.

## Workflow

The BBC publishes the homepage editorial set as a public RSS 2.0 feed at `https://feeds.bbci.co.uk/news/rss.xml`. The feed is served by BBC's Belfrage edge with `Cache-Control: public, max-age=2-5s` and a self-declared `<ttl>15</ttl>` (minutes) — near-realtime. **No auth, no cookies, no anti-bot stealth, no residential proxy.** A plain HTTPS GET from a Vercel sandbox IP returns the same payload as a `--proxies` fetch (verified during iteration). Lead with the feed; the browser path is a true fallback that costs ~30× more and yields the same editorial set.

1. **Fetch the front-page feed**:
   ```
   GET https://feeds.bbci.co.uk/news/rss.xml
   Accept: application/rss+xml, text/xml
   ```
   Returns `text/xml; charset=utf-8`, gzip-encoded, ~5 KB compressed. The `<channel>` block has `<title>BBC News</title>`, `<description>BBC News - News Front Page</description>`, `<lastBuildDate>`, `<ttl>15</ttl>`, and ~30 `<item>` children. **There is no JSON variant — the feed is XML-only.**

2. **Parse each `<item>` block**:
   - `<title>` — CDATA-wrapped article headline.
   - `<description>` — CDATA-wrapped one-line summary (the dek shown on cards).
   - `<link>` — canonical article URL on `bbc.com` (note: feed origin is `bbci.co.uk` but article links land on `bbc.com`). Always carries `?at_medium=RSS&at_campaign=rss` — strip these to canonicalize.
   - `<guid isPermaLink="false">` — `{article-url}#{slot}` where `{slot}` is the editorial position (0, 1, 3, 5, 7…) the BBC currently has the item pinned to on the front page. Use only the URL part for dedup; the `#slot` suffix changes between fetches.
   - `<pubDate>` — RFC 822 timestamp (e.g. `Tue, 19 May 2026 11:30:55 GMT`).
   - `<media:thumbnail width="240" height="135" url="..."/>` — low-res preview at `ichef.bbci.co.uk/ace/standard/240/...`. For a higher-res image, swap `/240/` for `/480/` or `/1024/` in the URL.

3. **Classify each item by URL path**:
   - `/news/articles/{id}` → standard news article (most items).
   - `/sport/{category}/articles/{id}` → sport story (cross-promoted into the front-page feed; `{category}` ∈ `football, tennis, boxing, cricket, rugby-union, …`).
   - `/sounds/play/{programmeId}` → BBC Sounds audio item (radio clip / podcast). No article body, just audio.
   - `/news/{id}` (numeric) → legacy / standing item — most notably the permanent "BBC News app" promo (id `10628994`, pubDate frozen at 2025-04-30). Filter out if you want only fresh editorial.

4. **Dedupe by canonical URL** (strip `?at_medium=RSS&at_campaign=rss` and any `#slot` suffix on the guid). The feed routinely lists the same story twice with different headlines at different editorial slots — e.g. *"Big game scorer Stewart and Curtis make Scotland World Cup squad"* (#0) and *"Stewart, Curtis and Gordon, 43, in Scotland World Cup squad"* (#7) both point at `/sport/football/articles/c4g94rpvx73o`. Keep the earliest-slot version (lowest `#N` in guid) or whichever wording you prefer.

5. **Sort if needed**. The feed order is **editorial** (BBC's chosen front-page order), not chronological. Sort by `pubDate` descending if you want a "latest" timeline; preserve feed order if you want "what BBC has at the top of the page".

6. **Optional — section feeds**. Every section has its own RSS at the same shape. Verified 200 OK during iteration: `world`, `uk`, `business`, `politics`, `health`, `education`, `entertainment_and_arts`, `technology`. The legacy `sci_tech` slug now 404s — use `technology` instead.
   ```
   https://feeds.bbci.co.uk/news/{section}/rss.xml
   ```
   The `?edition=int` query param selects the international edition view (also 200 OK).

### Browser fallback

When the RSS endpoint is unreachable (rare — `feeds.bbci.co.uk` has been stable for ~20 years) or you need elements that aren't in the feed (live-blog placement, embedded video, "BBC InDepth" rail), drive a browser session against the rendered homepage:

```bash
sid=$(browse cloud sessions create --keep-alive \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$sid"
browse open "https://www.bbc.com/news" --remote
browse wait load --remote
browse wait timeout 1500 --remote   # progressive hydration of card rails
browse get markdown body --remote > /tmp/bbc.md
```

The markdown body has each top story as a contiguous block:
```
[![<image alt>](https://ichef.bbci.co.uk/news/480/...)](/news/articles/{id})
[<Title><Description><relative-time> ago<Section>](/news/articles/{id})
```
Parse by splitting on link blocks where the href matches `^/(news|sport)/(articles|world|business|.*)/articles/[a-z0-9]+$` and the visible link text begins with a capital letter. Snapshot (`browse snapshot`) is well-populated for the homepage (unlike, e.g., Craigslist's search page) — `link` refs for every story card surface — but the markdown extract is faster.

Stealth flags are not required. The bare session reaches the page; no Akamai or PerimeterX challenge fires.

## Site-Specific Gotchas

- **`bbc.co.uk/news` 302-redirects to `bbc.com/news` from non-UK IPs.** Verified during iteration from a Vercel US-region sandbox: `browse open https://www.bbc.co.uk/news` lands on `https://www.bbc.com/news`. The RSS feed origin (`feeds.bbci.co.uk`) does not redirect — it serves identical content from any region. If you need the UK-edition site rendering specifically, use a UK residential proxy via `--proxies` and a stealth session; otherwise, the international (`.com`) rendering is identical for top stories.
- **Feed `<link>` URLs always carry `?at_medium=RSS&at_campaign=rss` tracking params.** Strip them before dedup, persistence, or sharing — otherwise the same article appears under two URLs when you cross-reference against on-site visits.
- **The feed mixes content types.** ~30 items per response = a mix of `/news/articles/`, `/sport/{cat}/articles/`, and `/sounds/play/`. If your downstream wants pure text-news only, filter on URL path.
- **One permanent "BBC News app" promo item.** `pubDate` is frozen at `Wed, 30 Apr 2025 14:04:28 GMT` and `link` is `/news/10628994`. It's the only legacy-numeric-id item in the feed — easy to detect with `^/news/\d+$`.
- **Duplicates with different headlines.** Same article URL appears twice with different `<title>` and different `#N` slot suffix in `<guid>`. The `#N` numbers track the BBC's homepage editorial rail position (Top Stories rail = #0, Sport rail = #5/#7, etc.). Dedupe by canonical URL.
- **`<guid>` is NOT a permalink** — `isPermaLink="false"` is explicit. It's `{article-url}#{slot}`, where `{slot}` changes between fetches.
- **Thumbnails are 240×135 default.** Higher-res variants exist by URL-path substitution: `/ace/standard/240/` → `/ace/standard/480/` or `/ace/standard/1024/`. The `cpsprodpb` path segment is the BBC CPS image production bucket; do not modify it.
- **Feed cache TTL is short.** `Cache-Control: max-age=2-5s` and `<ttl>15</ttl>` minutes. For polling, 30-60 seconds is sensible; sub-5s polling will mostly hit the same cached document.
- **No proxies, no stealth, no auth required.** Confirmed across plain HTTPS fetch and `--proxies` fetch (both return 200 with identical bodies from a US Vercel sandbox). `feeds.bbci.co.uk/robots.txt` does not disallow `/news/rss.xml` — the BBC's terms of use explicitly permit metadata and RSS reuse (cite the URL in the feed `<copyright>` element if needed).
- **Legacy section name `sci_tech` is dead.** `https://feeds.bbci.co.uk/news/sci_tech/rss.xml` returns 404. Use `/news/technology/rss.xml` (sci/tech content now flows through Technology + Health).
- **`pubDate` is RFC 822 in GMT.** No timezone variation; convert to ISO 8601 if your schema demands it (e.g. `2026-05-19T11:30:55Z`).

## Expected Output

```json
{
  "source": "BBC News - News Front Page",
  "feed_url": "https://feeds.bbci.co.uk/news/rss.xml",
  "last_build_date": "2026-05-19T13:48:45Z",
  "stories": [
    {
      "title": "Married at First Sight UK rape allegations serious, says government",
      "summary": "A BBC Panorama investigation revealed allegations that two women had been raped during filming.",
      "url": "https://www.bbc.com/news/articles/c62xv7n4xwdo",
      "article_id": "c62xv7n4xwdo",
      "section": "news",
      "published_at": "2026-05-19T11:30:55Z",
      "editorial_slot": 0,
      "thumbnail": {
        "url": "https://ichef.bbci.co.uk/ace/standard/240/cpsprodpb/113e/live/1244ba40-5327-11f1-b682-cf91850925ea.jpg",
        "width": 240,
        "height": 135
      }
    },
    {
      "title": "Ebola outbreak may be spreading faster than first thought, WHO doctor warns",
      "summary": "Hundreds of cases are suspected in central Africa but experts fear the actual number may be much higher.",
      "url": "https://www.bbc.com/news/articles/ceqp11gn1l8o",
      "article_id": "ceqp11gn1l8o",
      "section": "news",
      "published_at": "2026-05-19T12:24:07Z",
      "editorial_slot": 0,
      "thumbnail": {
        "url": "https://ichef.bbci.co.uk/ace/standard/240/cpsprodpb/ff64/live/547a9890-536c-11f1-89a3-d1f559421220.jpg",
        "width": 240,
        "height": 135
      }
    },
    {
      "title": "'Big game scorer' Stewart and Curtis make Scotland World Cup squad",
      "summary": "Ross Stewart and Findlay Curtis are named in Scotland's World Cup squad but there is no place for Lennon Miller.",
      "url": "https://www.bbc.com/sport/football/articles/c4g94rpvx73o",
      "article_id": "c4g94rpvx73o",
      "section": "sport/football",
      "published_at": "2026-05-19T10:03:02Z",
      "editorial_slot": 0,
      "thumbnail": {
        "url": "https://ichef.bbci.co.uk/ace/standard/240/cpsprodpb/434f/live/bc3d9850-536d-11f1-89a3-d1f559421220.png",
        "width": 240,
        "height": 135
      }
    }
  ]
}
```
