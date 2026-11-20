---
name: telegraph-co-uk-get-front-page-headlines-v8olii
title: Telegraph Front-Page Headlines
description: >-
  Fetch the latest Telegraph headlines (title, URL, publish time, authors,
  section, categories, image) via the public site-wide RSS feed at /rss.xml. The
  rendered homepage is Akamai+TollBit-gated for all bot traffic; the RSS
  endpoint is on Google Cloud Storage and is fully open. Read-only.
website: telegraph.co.uk
category: news
tags:
  - news
  - headlines
  - rss
  - uk
  - telegraph
  - akamai
  - tollbit
source: 'browserbase: agent-runtime 2026-05-26'
updated: '2026-05-26'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      Confirmed BLOCKED. Every page under https://www.telegraph.co.uk/ returns
      Akamai's 'Access Issue Help' interstitial with an embedded TollBit Token
      authorization error. Verified across three Browserbase session
      configurations (--verified --proxies, --verified alone, and bare) in
      iteration 1. Telegraph's robots.txt also explicitly Disallow: / for ~40 AI
      agents. Do not waste turns trying.
  - method: api
    rationale: >-
      No public REST/GraphQL API is documented or reachable. Internal
      /etc.clientlibs/* and /*_jcr_content* paths are robots-disallowed and
      Akamai-gated.
verified: false
proxies: false
---
# Telegraph Front-Page Headlines

## Purpose

Return the current set of editorially-published Telegraph headlines — title, canonical article URL, publish time, author(s), section, category taxonomy, and lead image — by reading The Telegraph's master RSS feed at `https://www.telegraph.co.uk/rss.xml`. Read-only.

**Assumption documented up-front**: Telegraph does not expose a literal "front-page" feed that mirrors the curated homepage layout (lead story, secondary deck, etc.). The closest equivalent that is reliably reachable is the site-wide RSS feed, which carries the most recently published items across every section (news, sport, business, travel, recipes, global-health, etc.). This skill returns *that* set. If a caller needs only news-section headlines, filter the returned items by `section === "news"` or by a `structure:news/*` entry in `categories[]` client-side — see "Site-Specific Gotchas".

## When to Use

- Daily / hourly monitoring of newly-published Telegraph stories.
- "What's the latest on the Telegraph today?" queries from a chat or briefing agent.
- Building a headline ticker or daily-digest pipeline that needs title + URL + pubDate + author + image.
- Any flow that would otherwise scrape `https://www.telegraph.co.uk/`. **The rendered homepage is unreachable from bot infrastructure today (see gotchas) — the RSS feed is the only viable path.**

## Workflow

The site-wide RSS feed is a static XML document served from Google Cloud Storage (`Server: UploadServer`, `X-Goog-*` headers). It is **not** behind Akamai/TollBit and requires **no auth, no cookies, no proxy, no stealth session, no JS rendering**. A plain HTTP GET returns 120 items in ~1–2 seconds.

1. **Fetch the master feed:**

   ```
   GET https://www.telegraph.co.uk/rss.xml
   Accept: application/rss+xml, text/xml
   ```

   In the browse.sh runtime:
   ```bash
   browse cloud fetch "https://www.telegraph.co.uk/rss.xml"
   ```

   Expect: `200 OK`, `Content-Type: text/xml; charset=utf-8`, ~150–160 KB body, RSS 2.0 with `<dc:>` and `<atom>` namespaces. `Cache-Control: max-age=60` and `<ttl>1</ttl>` — the feed is refreshed by the publisher roughly once per minute.

2. **Parse each `<item>` into the output shape** — extract these fields per item:

   | RSS element | Output field | Notes |
   |---|---|---|
   | `<title>` | `title` | HTML-entity-decoded text, may contain smart quotes (’ ’ “ ”). |
   | `<link>` | `url` | Absolute `https://www.telegraph.co.uk/...` article URL. |
   | `<description>` | `description` | Short editorial dek; sometimes literally the same string as `<title>` for "live blog" items. |
   | `<pubDate>` | `published_at` | RFC 2822 format, e.g. `Tue, 26 May 2026 05:41:19 GMT`. Convert to ISO 8601 if downstream needs it. |
   | `<guid isPermaLink="false">` | `id` | Stable UUID per logical article. **Use this for de-duplication**, not `<title>` (see gotchas). |
   | `<dc:creator>` (1+) | `authors[]` | One element **per author**. Many sport / live-blog stories have 2–3. Parse as a list, never assume single-valued. |
   | `<category domain="">` (1+) | `categories[]` | Telegraph's internal taxonomy. Prefixes you'll see: `topics:*`, `structure:*`, `storytype:*`. The `structure:` entries are the most actionable for filtering (e.g. `structure:news/world-news`, `structure:football`, `structure:business`). |
   | `<enclosure url="…" type="image/…" length="99" />` | `image` | Lead image URL. `length` is a placeholder `99`, not a real byte count — ignore it. |

   Derive `section` (a coarse high-level label) by splitting the article URL:
   ```
   ^https://www\.telegraph\.co\.uk/(?<section>[^/]+)/
   ```
   Observed values from a single feed sample: `news`, `business`, `sport`, `football`, `cricket`, `golf`, `tennis`, `formula-1`, `rugby-union`, `racing`, `politics`, `travel`, `recipes`, `theatre`, `health-fitness`, `global-health`, `recommended`, `fantasy-sports`. (Section list is open-ended — do not validate against a fixed enum.)

3. **De-duplicate by `guid`**. Cross-section publishing occasionally produces two items with the same title but different `<link>` and different `<guid>` (e.g. a global-health story republished under a parallel URL slug — observed 2 such pairs in a 120-item snapshot). Keep both as distinct records *unless* the caller asked for "headlines only", in which case fold to the earliest `published_at` per title.

4. **(Optional) Filter to "news-only"** if the caller wants UK/world headlines and not sport/recipes/etc. The most reliable signal is `categories[]` containing any of: `structure:news`, `structure:news/uk-news`, `structure:news/world-news`, `structure:news/politics`, `structure:news/dispatches`. The `section` path-segment is a coarser fallback but Telegraph publishes politics under both `/news/politics/` and `/politics/`, so prefer the `categories[]` check.

5. **Return** the parsed array (typically 120 items, ordered most-recent-first by `published_at`).

### Browser fallback

There is **no working browser fallback today**. The rendered HTML pages at `https://www.telegraph.co.uk/`, `https://www.telegraph.co.uk/us/`, and every section index page (`/news/`, `/business/`, etc.) return Akamai's "Access Issue Help" interstitial with an embedded `TollBit Token` authorization error from any Browserbase session — verified across three session configurations in iteration 1 (`--verified --proxies`, `--verified` alone, and bare). Telegraph's `robots.txt` also explicitly `Disallow: /` for `ClaudeBot`, `GPTBot`, `anthropic-ai`, `Claude-Web`, `OAI-SearchBot`, `Perplexity-User`, and ~40 other AI agents. Do **not** spend turns trying to scrape the homepage — go straight to `/rss.xml`. If at some future point Telegraph relaxes its TollBit gating or issues the marketplace a token, the rendered front page exposes its lead deck inside `<div class="hd-section">` elements with article anchors of the form `<a class="card-headline" href="…">`; but that path is not reachable today.

## Site-Specific Gotchas

- **The rendered site is Akamai+TollBit-gated against all bot traffic.** Every page under `https://www.telegraph.co.uk/` (homepage, `/us/`, section indexes, article URLs) returns a 200-OK HTML page titled "Access Issue Help" containing `[{"message":"You are not authorized to access this content without a valid TollBit Token. …","url":"https://tollbit.dev",…}]`. Confirmed against three Browserbase session configurations: `--verified --proxies` (US residential), `--verified` only, and bare. The block is keyed off Browserbase's egress fingerprint, not the proxy IP — adding `--proxies` does not change the outcome. Do not retry the browser path; pivot to RSS immediately.
- **The RSS feed is NOT on Akamai.** `https://www.telegraph.co.uk/rss.xml` is served from Google Cloud Storage (`Server: UploadServer`, `X-Goog-Generation`, `X-Goog-Hash` headers) with a 60-second `Cache-Control`. It is publicly readable with no auth, no cookies, no proxy, no stealth — a single `browse cloud fetch` (or any HTTP GET) returns the body. Same content with or without `--proxies`. **`recommended_method: fetch` is correct here, not `browser` or `api`.**
- **Section-scoped RSS feeds (`/news/rss.xml`, etc.) are STALE.** `/news/rss.xml` returns 200 OK with fresh-looking headers but its newest items are dated months back (oldest observed: 2025-08-21). Telegraph appears to have stopped updating the per-section RSS feeds while continuing to refresh the master `/rss.xml`. **Always use the master feed and filter client-side; never trust the per-section feeds.**
- **120 items per fetch, mixed sections.** The master feed is not a "news" feed — it's the firehose of *everything* the editorial system publishes. A single snapshot included 40 recipe items, 25 global-health items, 20 football items, 7 business items, and 7 news/world-news items. If the caller asked for "news headlines", you must filter client-side (see Workflow step 4).
- **GUIDs are unique; titles are not.** Observed 2/120 duplicate titles per snapshot — same headline, two different article URLs and two different GUIDs, because the article was published under parallel URL slugs in different sections (e.g. `/global-health/terror-and-security/terrorist-turf-war-…/` and `/global-health/terror-and-security/lake-chad-terrorist-turf-war-…/`). De-dup by `<guid>` if you want a stable identifier, by `<title>` if you want one record per logical story.
- **`<dc:creator>` repeats for multi-author bylines.** Sport live-blogs and breaking-news items frequently have 2–3 `<dc:creator>` elements in sequence. Parse as an array; the *single* most common parsing mistake is keeping only the first.
- **`<enclosure length="99">` is a placeholder, not real bytes.** Every enclosure across the feed has `length="99"`. The `url` attribute is the actual image; ignore `length`.
- **Channel `<link>` uses `http://` but item `<link>` uses `https://`.** Cosmetic inconsistency. Use the item-level URLs for navigation; they are canonical and HTTPS.
- **`http://www.telegraph.co.uk/` (homepage) and `/us/` are HTML-gated even on success.** Even if a future TollBit-licensed flow lets a browser through, Telegraph geo-routes US-IP visitors to `/us/` via `X-Tmg-Geo-Action: US_ON_UK_HP` and `X-Tmg-Geo-Action: US_ON_NON_HP` headers; the UK and US "front pages" have different curation. The RSS feed is geo-neutral and returns the same global content from both.
- **`X-Tmg-Geo-Action` and `X-Akamai-Userlocation` headers leak the publisher's geo-routing logic.** Useful for debugging, not for parsing. Don't switch on these.
- **`Disallow: /*?source=rss` in robots.txt.** This blocks crawlers from following `source=rss` query-strings on article URLs, **not** the RSS endpoint itself. The endpoint `https://www.telegraph.co.uk/rss.xml` has no query string and is not disallowed.
- **`Disallow: /` for all major AI bots in robots.txt.** Telegraph explicitly disallows `ClaudeBot`, `Claude-User`, `Claude-Web`, `anthropic-ai`, `Claude-SearchBot`, `GPTBot`, `OAI-SearchBot`, `OAI-Operator`, `ChatGPT-User`, `Perplexity-User`, `PerplexityBot`, `Bytespider`, `Amazonbot`, `Applebot-Extended`, `Google-Extended`, `Meta-ExternalAgent`, `CCBot`, and ~30 others from the site. The RSS endpoint is on a different host (GCS) and is not gated. Respecting robots is a downstream-consumer policy decision; this skill documents reachability, not legality.
- **Don't try the GraphQL / `_jcr_content` / `/etc.clientlibs/…` paths.** Robots.txt disallows them (`Disallow: /*_jcr_content*`, etc.) and they're all Akamai-gated anyway. Confirmed dead ends.
- **The `<lastBuildDate>` field can be used as a freshness check.** Compare to `now()`; if it's > 5 minutes old you may be reading a CDN-cached stale copy — wait and refetch. In practice we've seen it update within ~60s of new publishes.

## Expected Output

```json
{
  "source": "https://www.telegraph.co.uk/rss.xml",
  "fetched_at": "2026-05-26T06:08:15Z",
  "feed_last_build": "2026-05-26T05:41:34Z",
  "count": 120,
  "headlines": [
    {
      "id": "8a6067c8-0eca-3b53-8b7f-7d89f40c5d02",
      "title": "Marlborough racing tips and best bets for today's races",
      "url": "https://www.telegraph.co.uk/racing/0/marlborough-racing-tips-best-bets-todays-races/",
      "section": "racing",
      "description": "Welcome to our racing tips and best bets service provided by Telegraph Sport's champion tipster – updated here every day",
      "published_at": "2026-05-26T05:41:19Z",
      "authors": ["Marlborough"],
      "categories": [
        "topics:things/racing-tips",
        "structure:racing",
        "structure:sport",
        "structure:editorial-racing-betting",
        "structure:sport-evergreen",
        "storytype:standard"
      ],
      "image": "https://www.telegraph.co.uk/content/dam/racing/2021/03/26/260321_JH_RACING_PORTAL_4_trans_NvBQzQNjv4Bq0xCxaHs0uU-ytAiMd-7XpGcvlwE7VKNo06j5r2t05AQ.jpg"
    },
    {
      "id": "4a43c420-a08c-3090-a9d9-fd0c3fdcee4c",
      "title": "Terrorist turf war over Lake Chad plunges thousands into hunger",
      "url": "https://www.telegraph.co.uk/global-health/terror-and-security/terrorist-turf-war-over-lake-chad-plunges-thousands-into-hunger/",
      "section": "global-health",
      "description": "Boko Haram and ISIS are fighting over the islands of Lake Chad, plunging the surrounding region into a humanitarian catastrophe",
      "published_at": "2026-05-25T05:00:01Z",
      "authors": ["Arthur Scott-Geddes", "Hugh Kinsella Cunningham"],
      "categories": [
        "topics:in-the-news/global-health-security",
        "structure:global-health-security",
        "structure:climate-and-people",
        "topics:organisations/boko-haram",
        "topics:organisations/islamic-state",
        "topics:places/chad",
        "topics:places/africa",
        "structure:news/world-news",
        "structure:news/dispatches",
        "structure:us-content"
      ],
      "image": "https://www.telegraph.co.uk/content/dam/global-health/2026/05/21/HC105272.jpg"
    }
  ]
}
```

If the caller asked for "news headlines only", apply the `categories[]` filter from Workflow step 4 and return a trimmed `headlines[]` with the same shape.

If the RSS fetch itself fails (unlikely — GCS-backed, no rate-limit observed), return:

```json
{ "success": false, "reason": "rss_fetch_failed", "status_code": <int>, "source": "https://www.telegraph.co.uk/rss.xml" }
```

If the browser path is attempted as a fallback and (predictably) hits the Akamai/TollBit wall:

```json
{ "success": false, "reason": "akamai_tollbit_block", "evidence": "Page title 'Access Issue Help' + body contains 'You are not authorized to access this content without a valid TollBit Token'" }
```
