---
name: wikipedia-org-find-the-trending-world-news-for-today-hfqs9b
title: Wikipedia Trending World News
description: >-
  Return today's trending world news from Wikipedia — curated ITN headlines from
  the Main Page plus today's Current Events portal subpage bucketed by category
  (Business, Disasters, Politics, etc.). Read-only; uses the public MediaWiki
  API with no auth or anti-bot Verified.
website: wikipedia.org
category: news
tags:
  - news
  - wikipedia
  - trending
  - read-only
  - mediawiki-api
  - current-events
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      Browser fallback works (Main Page + dated portal subpage render cleanly
      with no anti-bot), but costs a Browserbase session and 2 page-loads vs.
      the API path's 2 raw HTTP calls. Use only if the MediaWiki API is
      unreachable — a multi-9s availability service.
  - method: api
    rationale: >-
      Pageviews API
      (https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/{Y}/{M}/{D})
      provides a complementary real-time-ish 'what readers are clicking' signal,
      lagged ~24h. Optional third API call.
verified: false
proxies: false
---
# Wikipedia Trending World News — Today

## Purpose

Return today's trending world news as Wikipedia frames it: a small set of editorially curated headlines (from `Template:In_the_news`, the same items shown on the Main Page "In the news" box) plus a fuller list of today's events organized by category (from the dated `Portal:Current_events` subpage). Output is a single JSON object keyed by `date`, `top_headlines`, `categories`, and source URLs. Read-only — never edits or posts anything.

## When to Use

- "What's trending in world news on Wikipedia today?"
- A morning-briefing agent that wants a calmer, more curated alternative to algorithmic news feeds (Wikipedia ITN updates a few times per day, vetted by ITN editors).
- A research agent that wants today's events bucketed by topic (`Business and economy`, `Disasters and accidents`, `Law and crime`, `Politics and elections`, `Armed conflicts and attacks`, `Sports`, etc.) — the portal subpage groups items that way.
- Cross-checking what a mainstream-media outlet is leading with vs. what Wikipedia's volunteer editors deem significant.

## Workflow

The recommended path is the **MediaWiki public API** — no auth, no cookies, no anti-bot Verified, no Browserbase session needed. Two HTTP requests to `https://en.wikipedia.org/w/api.php` are sufficient. Browser navigation is a fallback that costs a Browserbase session quota and gives the same data.

### 1. Compute today's date in Wikipedia's portal-subpage format

The portal subpage title is `Portal:Current_events/{YYYY}_{Month}_{D}`, where:

- `{YYYY}` is the 4-digit year.
- `{Month}` is the full English month name (`January`, `February`, …, `December`) — **not** zero-padded number.
- `{D}` is the day of month, **not zero-padded** (so `5`, `18`, `31` — `05` will 404).

Use UTC, not local time, to match Wikipedia's clock. Example for today (2026-05-18): `Portal:Current_events/2026_May_18`.

```bash
TODAY_PORTAL=$(date -u +'%Y_%B_%-d')   # → 2026_May_18
```

### 2. Fetch today's portal subpage as wikitext

Wikitext is much easier to parse than HTML (categories are wrapped in `'''bold'''` and bullets start with `*`). Use the MediaWiki `parse` action:

```
GET https://en.wikipedia.org/w/api.php
    ?action=parse
    &page=Portal:Current_events/{TODAY_PORTAL}
    &format=json
    &prop=wikitext
```

Through Browserbase Fetch:

```bash
export BROWSERBASE_API_KEY="$BB_API_KEY"
browse cloud fetch \
  "https://en.wikipedia.org/w/api.php?action=parse&page=Portal:Current_events/${TODAY_PORTAL}&format=json&prop=wikitext"
```

The response is a Browserbase envelope; the page wikitext is in `JSON.parse(envelope.content).parse.wikitext['*']`. The body shape is:

```
{{Current events|year=2026|month=05|day=18|content=
<!-- All news items below this line -->
'''Business and economy'''
*[[Australia–China relations]]
**[[Australia]]n treasurer [[Jim Chalmers]] orders … [https://hongkongfp.com/… (AFP via HKFP)]

'''Disasters and accidents'''
*At least 13 people are killed … [https://www.news18.com/… (CNN-News18)]
…
<!-- All news items above this line -->}}
```

### 3. Parse wikitext into `categories`

- Each `'''Category Name'''` line opens a new category bucket.
- Lines starting with `*` (single asterisk) are first-level bullets — either standalone events or topic-header bullets (a wiki-link with no sentence).
- Lines starting with `**` (two asterisks) are sub-bullets that describe the parent topic. **Fold sub-bullets into their parent** when the parent is just a wiki-link header (no terminal punctuation, < ~80 chars): emit one combined string `"{Parent topic}: {Sub-bullet text}"`. If the parent bullet is already a full sentence, emit it as-is and treat sub-bullets as siblings.
- Strip wiki markup before emitting:
  - `[[Page|Display]]` → `Display`
  - `[[Page]]` → `Page`
  - `'''bold'''` → `bold` (strip the triple-quotes; ITN sometimes bolds key phrases)
  - `''italic''` → `italic`
  - `[https://url (Source name)]` → `(Source name)` (keep the parenthesized source citation; drop the URL)
  - `[https://url text]` → `text`
- Ignore lines starting with `<!--`, `{{`, `}}`, or blank — those are template wrappers.

### 4. Fetch the curated `Template:In_the_news` headlines

ITN sits on the Main Page and is what most readers think of as "Wikipedia's trending news." It's a separately-edited template with 3–5 curated headlines from the last several days (not necessarily today). Same API:

```
GET https://en.wikipedia.org/w/api.php
    ?action=parse
    &page=Template:In_the_news
    &format=json
    &prop=text          # ← use rendered HTML here, not wikitext
```

Use rendered HTML for ITN (not wikitext): the template includes `{{In the news/footer | currentevents = … | recentdeaths = … }}` blocks that are messy to parse from raw markup but cleanly separated in the rendered output. The lead headlines are the top-level `<ul><li>…</li></ul>` items appearing **before** the `<h2 id="…ongoing">` / `<h2 id="…recent_deaths">` sub-headers; the "ongoing" and "recent deaths" lists come after.

A simple extraction: grab the first 5 `<li>…</li>` matches from the response, strip HTML tags, html-unescape — these are the curated headlines. Skip the inner `<ul>` sub-lists inside `recentdeaths`/`currentevents` blocks (they're shorter strings without a terminal period, easy to filter out by length+content).

### 5. Optional: pageviews "what's trending" signal

If "trending" should include *what readers are clicking on* (not just what editors curated), add a third call to the Wikimedia pageviews API:

```
GET https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/{YYYY}/{MM}/{DD}
```

This returns the top 1000 most-viewed pages on English Wikipedia for the given day. Filter out housekeeping pages (`Main_Page`, `Special:Search`, `Wikipedia:*`) and you get a real-time view of which articles are surging — often a leading indicator that an event is breaking before ITN editors curate it. Returns within a few hours' lag from real-time. Same `browse cloud fetch` path; no auth.

### 6. Assemble output

Merge into a single JSON object — see the **Expected Output** section. Cite source URLs for each surface so downstream agents can deep-link a user to the Wikipedia page.

### Browser fallback

If the MediaWiki API is unreachable (very rare — Wikipedia's API has multi-9s uptime and serves billions of requests/day), fall back to navigating the rendered pages directly:

```bash
sid=$(browse cloud sessions create --keep-alive | jq -r .id)
export BROWSE_SESSION="$sid"

# Main Page (ITN box is in the right column under "In the news")
browse open "https://en.wikipedia.org/wiki/Main_Page" --remote
browse wait load --remote
browse get markdown body --remote | sed -n '/^## In the news/,/^## On this day/p'

# Today's portal subpage
TODAY_PORTAL=$(date -u +'%Y_%B_%-d')
browse open "https://en.wikipedia.org/wiki/Portal:Current_events/${TODAY_PORTAL}" --remote
browse wait load --remote
browse get markdown body --remote

browse cloud sessions update "$sid" --status REQUEST_RELEASE
```

`browse get markdown body` returns a clean markdown rendering with the category headings as `###` and the bullets as `-` — easier to parse than HTML but slower and costlier than the API path (one session + 2 page loads vs. 2 raw HTTP calls).

No Verified or proxies are required for either path. Wikipedia explicitly welcomes bots that follow the [API etiquette guidelines](https://www.mediawiki.org/wiki/API:Etiquette) — set a descriptive `User-Agent` if making many requests, and keep concurrency low.

## Site-Specific Gotchas

- **The portal subpage day-of-month is not zero-padded.** `Portal:Current_events/2026_May_5` exists; `Portal:Current_events/2026_May_05` returns a "page does not exist" stub. Use `date -u +'%-d'` (GNU) or `date -u +'%e' | tr -d ' '` (BSD), **not** `%d`. The month name is the full English name (`May`, not `5` or `05` or `MAY`).
- **Use UTC, not local time.** The portal page rolls over at 00:00 UTC. A request made at 23:30 UTC for "today" in a positive-offset timezone will hit the right page; the same request from an agent that uses local time may try a future-dated page that doesn't exist yet (or worse, hit yesterday's stale page after UTC midnight).
- **Future-dated portal subpages return a 200 OK with empty content (no error).** The MediaWiki parse API returns a valid JSON envelope with `parse.wikitext['*']` containing only the `{{Current events|year=…|month=…|day=…|content=}}` wrapper and no bullets. Detect this by counting bullets — if zero events parsed AND the date is `> now_utc`, the page hasn't been written yet (try yesterday's). If zero events AND date is `<= now_utc` early in the UTC morning, the page may not have its first edit yet — try the previous day.
- **ITN bullets are typically 1–3 days old, not "today."** `Template:In_the_news` is editorially curated, not auto-rolling. The headlines you read at any given moment are usually from items posted across the previous 24–72 hours; some stay up longer. Don't claim ITN bullets are "today's news" — frame them as "Wikipedia's currently-featured headlines." Use the portal subpage when you specifically need today's events.
- **ITN includes "Ongoing" and "Recent deaths" sub-lists which are not headlines.** The rendered template has 3 sections — lead headlines, then an `Ongoing` block (Iran war, Russo-Ukrainian war, Sudanese civil war — long-running stories), then a `Recent deaths` block (6 names, no description). The lead headlines are the top-level `<li>`s before any `<h2>`. The "ongoing" entries are 1–3 words each (no terminal period) and the recent-deaths entries are just names — they're easy to filter by length + the absence of a sentence-ending period, or by detecting the `<h2 id="…ongoing">` separator and only keeping `<li>`s before it.
- **Sub-bullet structure is inconsistent across categories.** Some categories use the `*topic-link\n**sub-bullet-detail` pattern (Politics, Business commonly); other categories put the full sentence on the `*` line with no `**` sub-bullets (Disasters, Law). A parser that only emits `*` lines drops the actual content for Politics-style entries; a parser that only emits `**` lines drops the content for Disasters-style entries. Walk the wikitext top-down, hold the most recent `*` line in a "pending topic" buffer, and flush as `"{topic}: {sub}"` whenever a `**` arrives; flush the `*` standalone when the next `*`, `'''`, or end-of-content hits without a `**` in between.
- **Source citations are in square-bracket external-link syntax, not native wiki templates.** Each bullet ends with `[https://example.com/article (Source Name)]` or `[https://example.com/article Source Name]`. To preserve attribution, regex-extract `\[https?://\S+\s+(?:\(([^)]+)\)|([^\]]+))\]` and keep the parenthesized name or trailing text as the `source` field. To preserve the original URL, capture the full bracketed group before stripping.
- **Wikitext is much easier than rendered HTML for the portal page.** The rendered HTML embeds `<style>` blocks, a navbar with edit/history/watch links, ARIA region wrappers, and `class="current-events-content-heading"` divs that don't always appear as expected (today's portal omitted them entirely — the categories were only in `'''bold'''` wikitext). Always pull `prop=wikitext` for the portal subpage. For ITN, the opposite is true — pull `prop=text` (rendered HTML) because wikitext has nested templates (`{{In the news/footer}}`) that are simpler to read after expansion.
- **No anti-bot at all on api.wikipedia.org.** No CAPTCHAs, no rate-limit blocks at reasonable volumes, no User-Agent sniffing that rejects requests (though [the API etiquette page](https://www.mediawiki.org/wiki/API:Etiquette) asks you to set a descriptive UA). Browserbase `--proxies` or `--verified` flags are not needed — bare HTTP from any IP works. The skill was developed and verified with no Verified, no proxies, and a single bare `browse cloud fetch` call per surface.
- **The pageviews API has a ~24-hour lag**, sometimes more. `wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/{Y}/{M}/{D}` for *today* often returns a 404 ("data not available") until the daily roll-up is processed (typically late the next day UTC). For a real-time-ish trending signal, request yesterday's date — or use the per-hour endpoint `…/per-article/en.wikipedia/all-access/all-agents/{article}/hourly/…` for a specific article. Don't depend on pageviews for "what broke in the last hour."
- **`Portal:Current_events` (unsuffixed) shows the last ~7 days, not today.** That redirect lands on a transclusion of the last week's subpages all stacked together. Don't parse it for "today's events" — you'll mix in yesterday and the day before. Always use the dated subpage `Portal:Current_events/{Year}_{Month}_{Day}`.
- **`User-Agent` should be descriptive.** Wikimedia explicitly requests it ([policy](https://meta.wikimedia.org/wiki/User-Agent_policy)) and will throttle or eventually block anonymous `python-requests/2.x` or empty UAs. `browse cloud fetch` sets a Browserbase UA by default which is acceptable; if you raw-`curl`, include something like `MyAgent/1.0 (https://example.com; bot@example.com)`.

## Expected Output

A single JSON object. The `top_headlines` array is `Template:In_the_news` lead bullets (curated, 0–5 items, frequently 1–3 days old). The `categories` object is today's portal subpage events, bucketed by editor-assigned category. Optional `trending_pageviews` is the day's most-viewed articles (lagged 24h). `as_of_utc` reflects the date used to address the portal subpage, not request time.

```json
{
  "as_of_utc": "2026-05-18",
  "sources": {
    "portal_subpage": "https://en.wikipedia.org/wiki/Portal:Current_events/2026_May_18",
    "in_the_news_template": "https://en.wikipedia.org/wiki/Template:In_the_news",
    "pageviews_api": "https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/2026/05/18"
  },
  "top_headlines": [
    {
      "text": "Bulgaria, represented by Dara with the song \"Bangaranga\", wins the Eurovision Song Contest.",
      "source": "Template:In_the_news",
      "note": "curated by ITN editors; may be 1–3 days old"
    },
    {
      "text": "The World Health Organization declares the Ebola epidemic in the Democratic Republic of the Congo and Uganda a public health emergency of international concern.",
      "source": "Template:In_the_news"
    },
    {
      "text": "Niuean prime minister Dalton Tagelagi is re-elected for a third term.",
      "source": "Template:In_the_news"
    },
    {
      "text": "The Philippine Senate goes into lockdown after the attempted arrest of senator Ronald dela Rosa.",
      "source": "Template:In_the_news"
    }
  ],
  "categories": {
    "Business and economy": [
      {
        "topic": "Australia–China relations",
        "text": "Australian treasurer Jim Chalmers orders several China-linked shareholders to divest their stakes in Northern Minerals under foreign investment laws aimed at protecting the country's rare earths sector.",
        "source_name": "AFP via HKFP",
        "source_url": "https://hongkongfp.com/2026/05/18/australia-orders-china-linked-investors-to-sell-stakes-in-rare-earths-firm/"
      }
    ],
    "Disasters and accidents": [
      {
        "text": "At least 13 people are killed and more than 20 others are injured, most seriously, when a tempo carrying wedding guests collides with a container truck on the Mumbai-Ahmedabad Highway in Palghar district, Maharashtra, India.",
        "source_name": "CNN-News18",
        "source_url": "https://www.news18.com/india/13-killed-dozens-injured-in-tempo-truck-crash-on-mumbai-ahmedabad-highway-ws-l-10098391.html"
      }
    ],
    "Law and crime": [
      {
        "text": "Four people are killed and eight others are injured in two spree shootings, including one inside a restaurant, in Mersin, Mediterranean region, Turkey. A widespread manhunt is underway to catch the suspect.",
        "source_name": "Insider Paper",
        "source_url": "https://insiderpaper.com/4-dead-8-hurt-as-gunman-opens-fire-in-southern-turkey-reports/"
      }
    ],
    "Politics and elections": [
      {
        "topic": "Second impeachment of Sara Duterte",
        "text": "The Philippine senate resumes the impeachment process against Vice President Sara Duterte following last week's lockdown.",
        "source_name": "Reuters",
        "source_url": "https://www.reuters.com/world/asia-pacific/philippines-convene-court-vp-impeachment-amid-political-turmoil-2026-05-18/"
      }
    ]
  },
  "trending_pageviews": [
    { "article": "Eurovision_Song_Contest_2026", "views": 1842301, "rank": 1 },
    { "article": "Dara_(Bulgarian_singer)",      "views":  612408, "rank": 2 }
  ]
}
```

Categories that appear in the portal but have no items today should be omitted (or emitted as empty arrays — both are acceptable, agents using this skill should treat absence as "no events in that category today"). The canonical category labels used by ITN editors are: `Armed conflicts and attacks`, `Arts and culture`, `Business and economy`, `Disasters and accidents`, `Health and environment`, `International relations`, `Law and crime`, `Politics and elections`, `Science and technology`, and `Sports` — though not all appear every day. Always read category names from the wikitext rather than hardcoding the list.

Edge cases the consumer should be ready for:

- Empty `top_headlines` (rare — ITN almost always has at least one bullet, but it can lag during slow news cycles).
- Empty `categories` (the portal subpage exists with zero events — happens early UTC morning before the first edit lands; retry against `today - 1 day` if you need non-empty data).
- Missing `trending_pageviews` (the pageviews endpoint 404s on today's date until the daily roll-up is processed — degrade gracefully, return only `top_headlines` + `categories`).
- Wikitext that includes unexpected templates (e.g., `{{Wikinews|…}}` or `{{cite news|…}}`) inline within a bullet — strip with the same `\{\{[^}]*\}\}` regex you use for the outer `{{Current events|…|content=…}}` wrapper, or accept that the rendered text may contain template-syntax fragments and emit them anyway.
