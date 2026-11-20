---
name: news-ycombinator-com-get-stories-wyej87
title: Hacker News Get Stories
description: >-
  Fetch Hacker News stories from any list view (front, newest, ask, show, jobs,
  best, active, classic, by-domain, by-user, historical day) and optionally full
  comment trees, returning a unified JSON shape.
website: news.ycombinator.com
category: news
tags:
  - hacker-news
  - news
  - api
  - firebase
  - read-only
source: 'browserbase: agent-runtime 2026-05-16'
updated: '2026-05-16'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      Browser (cookieless browse cloud fetch — no JS, no Verified, no proxy) is the
      fallback for the handful of list views HN does NOT expose through
      Firebase: /from?site=<domain>, /favorites?id=<user>,
      /front?day=YYYY-MM-DD, /threads?id=<user>, /active, and /classic. Algolia
      HN Search (hn.algolia.com/api/v1) is the auxiliary API for full-text
      queries and one-shot nested comment trees.
verified: false
proxies: false
---
# Hacker News Get Stories — Browser Skill

## Purpose

Return Hacker News stories as structured JSON for any list view HN exposes (front page, newest, ask, show, jobs, best, active, classic, historical day, by-domain, by-user) and — on request — the full comment tree for any item. For each story emits: HN item ID, type (`story` / `ask` / `show` / `job` / `poll`), title, author (with profile URL), score, comment count, submission time (ISO 8601 + HN-style age), external URL + parsed domain, text body (Ask/Show/job posts), and the canonical `item?id=` discussion URL. Read-only; never votes, flags, favorites, hides, replies, or submits.

## When to Use

- Daily / hourly polling of the HN front page, /newest, or /best for monitoring or aggregation.
- Topic / domain monitoring (e.g. "every HN story linking `github.com/openai`").
- User-feed extraction — submissions or comment threads for a specific HN account.
- Historical front-page snapshots ("HN front page on 2024-05-12") via `/front?day=YYYY-MM-DD`.
- One-shot deep reads of a single item ID including the full comment tree.
- Anywhere you'd otherwise scrape HN HTML — the Firebase API is faster, smaller, and structurally exact.

## Workflow

Hacker News operates a fully-documented, no-auth, no-rate-limit JSON API at `https://hacker-news.firebaseio.com/v0/` (the same Firebase backend that powers the site). **The API is the default code path.** The browser fallback is only for the handful of list views HN does not expose through Firebase — namely `/from?site=<domain>`, `/favorites?id=<user>`, `/front?day=<date>`, `/classic`, `/active`, and the user `/threads` (comments-by-user) view. All of those are static HTML and respond fine to a plain `browse cloud fetch` (no Verified, no proxy, no session). **A residential proxy is not required for either path.**

### 1. Resolve the input to a route

| Input shape | Path |
|---|---|
| Feed name `front`, `top`, `news` | Firebase `/v0/topstories.json` |
| `newest` / `new` | Firebase `/v0/newstories.json` |
| `ask` | Firebase `/v0/askstories.json` |
| `show` | Firebase `/v0/showstories.json` |
| `jobs` | Firebase `/v0/jobstories.json` |
| `best` | Firebase `/v0/beststories.json` |
| `active` / `classic` | **HTML only** — `https://news.ycombinator.com/{active,classic}` |
| `/from?site=<domain>` | **HTML only** — same URL |
| `submissions by <user>` | Firebase `/v0/user/<user>.json` → walk `submitted[]` and filter `type=="story"` (alt: HTML `/submitted?id=<user>` if a rendered list is preferred) |
| `threads by <user>` | **HTML only** — `/threads?id=<user>` (user's comments). The Firebase `submitted[]` mixes stories + comments but does not preserve thread context. |
| `favorites of <user>` | **HTML only** — `/favorites?id=<user>` |
| `/front?day=YYYY-MM-DD` | **HTML only** — same URL |
| Item ID `38123456` | Firebase `/v0/item/38123456.json` (+ Algolia `items/<id>` for nested tree, see step 4) |
| Full HN URL | Use as-is via `browse cloud fetch` (HTML fallback) |

### 2. Fetch the story-ID list (API path)

```bash
browse cloud fetch 'https://hacker-news.firebaseio.com/v0/topstories.json'
# returns JSON envelope; .content is a JSON-encoded array of up to 500 item IDs
# in HN-ranked order. Same shape for newstories/askstories/showstories/
# jobstories/beststories.
```

The `.content` field on the `browse cloud fetch` response envelope is the actual API body as a string — `JSON.parse(envelope.content)` to get the array.

For HTML-only feeds (`active`, `classic`, `/from?site=`, `/front?day=`, `/threads`, `/favorites`), see step 5.

### 3. Apply caller-supplied filters and limit, then fan out

- Slice the ID array to `limit` (default 30 — matches HN's page size; cap to ~500 since that's all Firebase returns per feed).
- For each ID, `browse cloud fetch https://hacker-news.firebaseio.com/v0/item/<id>.json`. These calls are independent — issue them concurrently (a sensible cap is ~20 in flight, but in practice no rate-limit has been observed).
- Decode each item into the unified story shape (step 7).
- Then apply post-fetch filters: `min_points` (`score >= N`), `min_comments` (`descendants >= N`), `domain` (parsed from `url`), and optional re-sort by `points` / `comments` / `recency`. HN's native order is already encoded in the array position — preserve it as the default.

### 4. Item shape — what to expect

```json
// "story" (external link)
{ "by": "alligatorplum", "descendants": 32, "id": 48155690,
  "kids": [48156153, 48155979, ...], "score": 102, "time": 1778891762,
  "title": "'No Way to Prevent This,' Says Only Package Manager Where This Regularly Happens",
  "type": "story", "url": "https://kevinpatel.xyz/posts/no-way-to-prevent-this/" }

// "story" with text (Ask HN / Show HN — no `url`, has `text`)
{ "by": "sochix", "descendants": 113, "id": 48145524, "kids": [...],
  "score": 128, "time": 1778829503,
  "text": "Is it possible? Do you know success cases w&#x2F;o spending 20+k...",
  "title": "Ask HN: How to be SOC2 Type 2 compliant as a solo-entreprenuer?",
  "type": "story" }

// "job" (no kids, no descendants, type:job)
{ "by": "joshwget", "id": 48151034, "score": 1, "time": 1778864475,
  "title": "Hightouch (YC S19) Is Hiring", "type": "job",
  "url": "https://hightouch.com/careers" }

// "poll" — same as story but adds `parts: [pollopt_id, ...]`
{ "by": "pg", "id": 126809, "kids": [...], "parts": [126810, 126811, 126812],
  "score": 47, "time": 1204403652, "title": "Poll: ...", "type": "poll" }

// "comment" — fetched while walking kids[]
{ "by": "tptacek", "id": 48150204, "kids": [...], "parent": 48145524,
  "text": "Don&#x27;t. You are exactly the wrong kind of firm...",
  "time": 1778860506, "type": "comment" }
```

Story-type discrimination for the output JSON:
- `type=="job"` → emit as `"story_type": "job"`.
- `type=="poll"` → `"poll"`.
- `type=="story"` AND title starts with `Ask HN:` (case-insensitive) → `"ask"`.
- `type=="story"` AND title starts with `Show HN:` → `"show"`.
- Else → `"story"`.

### 5. Browser fallback for HTML-only routes

`browse cloud fetch <hn-url>` is sufficient for every list view HN serves as static HTML — no Verified, no proxy, no session needed.

Each story row in the rendered HTML is a `<tr class="athing submission" id="<itemId>">`. The next sibling `<tr>` carries the subtext (score, user, age, comment count). Extract by regex:

```
<tr class="athing submission" id="(?<id>\d+)">         # item id (and ranks via <span class="rank">N.</span> immediately above)
.*? class="titleline">                                  # title cell
   <a href="(?<url>[^"]+)" ...>(?<title>[^<]+)</a>      # external URL + title (or item?id=N for Ask/Show)
   (?:<span class="sitebit comhead"> \(<a href="from\?site=...><span class="sitestr">(?<domain>[^<]+)</span></a>\))?
.*?<span class="score" id="score_\1">(?<score>\d+) points?</span>
   \s*by\s*<a href="user\?id=(?<by>[^"]+)" class="hnuser">[^<]+</a>
   \s*<span class="age" title="(?<iso_time>[^"\s]+)\s+(?<epoch>\d+)">
   <a href="item\?id=\1">(?<age_human>[^<]+)</a></span>
.*?<a href="item\?id=\1">(?<comments>\d+)(?:&nbsp;)?\s*comments?</a>
```

Notes specific to fallback rendering:
- The `age` span's `title` attribute is `"YYYY-MM-DDTHH:MM:SS <epoch_seconds>"` — both ISO and epoch in one place. Prefer this over re-parsing the human "16 minutes ago" text.
- Ask HN / Show HN / job posts emit `<a href="item?id=N">` instead of an external URL in the titleline; treat that as the "no external URL" case.
- Pagination: append `?p=N` (1-indexed, 30 stories per page). `/news?p=2` returns the next page cleanly. **Do not rely on the `morelink` href** — when fetched cookieless it does not appear in the HTML (`browse cloud fetch 'https://news.ycombinator.com/news'` returns the 30 stories but no morelink; ?p=N is the only reliable continuation).
- `/threads?id=<user>` rows are HTML *comment* rows, not story rows — different markup (`class="athing comtr"`, `<div class="commtext">`). Use this view when the caller wants user comment threads with parent-story context (the `parent` link in the subtext gives the parent comment or story).
- `/favorites?id=<user>` returns very small HTML (~3 KB) if the user has no public favorites — handle empty gracefully.

### 6. Comment tree (when `include comments` is requested, or input is an item ID)

Two viable paths:

**Path A — Firebase walk.** Recursively `browse cloud fetch /v0/item/<kid>.json` for each kid in `kids[]`, depth-first. Pros: authoritative, returns the same data the site uses. Cons: one HTTP call per comment, so a 500-comment story costs 500 calls.

**Path B — Algolia HN Search.** A single GET to `https://hn.algolia.com/api/v1/items/<id>` returns the entire item with the full nested comment tree under `.children[]` (each child has its own recursive `.children[]`). Pros: one call, ready-to-emit nested shape. Cons: ~1–2 minute indexing lag for very fresh items and comments; field names differ from Firebase (`author` vs `by`, `created_at_i` vs `time`, `points` vs `score`, `text` is the same).

**Recommendation:** prefer Algolia (Path B) for any story older than ~5 minutes; fall back to Firebase walk (Path A) when Algolia returns a 404 or a partial tree (`children: []` on a story whose Firebase `descendants > 0` is the signal that Algolia hasn't indexed it yet).

Either path: emit each comment with `{ id, parent_id, by, time, time_iso, depth, text, kids_count, dead, deleted }`. Track `depth` by recursion level (root story = 0, top-level comment = 1, etc.). On Firebase items, `dead: true` and `deleted: true` are explicit boolean fields when set; absent = false.

### 7. User view metadata

For `submissions by <user>` / `threads by <user>` / any user view, also fetch `https://hacker-news.firebaseio.com/v0/user/<user>.json` and emit:

```json
{ "id": "dang", "karma": 825234, "created": 1304277692,
  "created_iso": "2011-05-01T19:21:32Z",
  "about": "&quot;<i>Conflict is essential to human life...</i>&quot;",
  "submitted_count": 28491, "profile_url": "https://news.ycombinator.com/user?id=dang" }
```

`submitted` on the user object is the full array of every item (stories + comments) the user has ever posted, newest first — slice and filter by `type` to get just stories or just comments without the HTML view. HN does not separately count comments vs stories in the user record; if the caller wants counts, segment the `submitted[]` array by item type after fanning out.

### 8. Unified output shape

Whichever path produced the data, normalize to a single shape — see "Expected Output" below — so callers don't see API-vs-HTML differences.

## Site-Specific Gotchas

- **The Firebase API is the answer for almost everything.** No auth, no rate limit observed in practice, sub-100 ms responses, CORS-open. Don't reinvent it with HTML scraping unless the caller passes a URL only the HTML site renders (`/from?site=`, `/favorites`, `/front?day=`, `/threads`, `/active`, `/classic`).
- **The five `*stories.json` endpoints return at most 500 IDs.** That's all HN ranks. Don't ask for limit > 500 on a single feed; the caller wants pagination through historical data → switch them to Algolia HN Search with `tags=story&numericFilters=created_at_i>=...`.
- **`topstories.json` is *not* time-sorted.** It's HN's ranked order (an opaque score blend of recency, points, and decay). `newstories.json` is recency. If a caller asks for "newest", route to `newstories.json`, not a re-sort of `topstories.json`.
- **`text` and `about` are HTML, not Markdown.** Both fields carry entity-encoded HTML (`&#x27;`, `&#x2F;`, `&quot;`, `<p>`, `<i>`, `<a>`). Either pass through verbatim with a `text_format: "html"` flag, or decode entities + strip tags depending on caller preference. Don't double-decode — HN already entity-escapes once.
- **`time` is epoch seconds (UTC), not milliseconds.** Multiply by 1000 before `new Date(...)` in JS.
- **Story-type isn't fully encoded in `type`.** `type` is `story` for normal links AND for Ask/Show HN posts; the discriminator is the title prefix (`Ask HN:` / `Show HN:`). Jobs and polls have their own `type` values (`job`, `poll`). `pollopt` is the per-option child type referenced from `parts[]`.
- **Ask/Show HN items have `text` and no `url`.** Job items may have either; some YC-portfolio jobs link to a careers page (`url` set, `text` absent), some are inline write-ups (`text` set, `url` absent). Handle both.
- **`descendants` ≠ `kids.length`.** `kids` is *top-level* comment IDs only; `descendants` is the total comment count including all nested replies. Use `descendants` for "comment count".
- **Comment `parent` may be a comment OR a story.** Walk `parent` recursively until you hit an item whose `type != "comment"` to find the root story for any comment.
- **Dead / flagged / deleted handling.** `deleted: true` items have no `by`/`text`/`title` — they're tombstones. `dead: true` items are shadow-banned but readable (HN hides them in the default view). Emit both flags in the comment record and let the caller decide.
- **Updates endpoint is real but rarely needed.** `/v0/updates.json` returns the set of recently-changed items + profiles — useful for cache-invalidation polling, not for list fetching.
- **`maxitem.json` returns the highest item ID currently allocated.** Useful as a sentinel for "is this item ID plausible" range checks; not useful as a feed.
- **Algolia HN Search is the right escape hatch for full-text and historical queries.** Endpoints: `hn.algolia.com/api/v1/search?query=...`, `.../search_by_date?...`, `.../items/<id>`, `.../users/<username>`. Field names differ from Firebase (`author`/`points`/`num_comments`/`created_at_i` vs `by`/`score`/`descendants`/`time`). Indexing lag for very fresh items is ~1–2 min.
- **Algolia does NOT expose a domain filter.** Even though `hn.algolia.com` indexes URLs, the public `tags=` enum doesn't include "stories linking domain X". `/from?site=<domain>` remains HTML-only.
- **`/from?site=<domain>` HTML morelink is missing without a cookie.** When fetched anonymously, the "More" link at the bottom of HTML list pages is omitted from the markup. Paginate with `?p=N` (1-indexed, 30/page) — that works without any cookie or fnid token.
- **`/front?day=YYYY-MM-DD` only goes back so far.** HN serves daily front-page snapshots from late 2006 forward. Dates before 2007-02-19 (the HN-launch reference point) typically render an empty list.
- **`/active` and `/classic` are anti-recency-optimized feeds, not separate item universes.** Each row links to the same `item?id=N` as `/news`. Render them through the same shape — they're a re-sort, not a separate kind.
- **`/threads?id=<user>` returns comment rows, NOT story rows.** Different markup (`class="athing comtr"`), different parent structure. If a caller asks for "threads by pg" expecting stories, clarify or default to `/submitted?id=pg` (which is stories + comments mixed, filterable by reading `type`).
- **HN's profile data is sparse.** `/v0/user/<user>.json` returns `id`, `created`, `karma`, `about`, `submitted` — no email, no website (unless embedded in `about`), no flair, no comment-count or story-count breakdown. Compute counts client-side by fanning out over `submitted[]` if needed.
- **No-screenshot run note.** This skill was iterated with the Firebase API + `browse cloud fetch` HTML probes only; no live CDP screenshots were captured during generation (the sandbox network policy permits the Browserbase HTTP API but not `connect.*.browserbase.com` CDP endpoints). Every claim above was validated by HTTP fetch against `hacker-news.firebaseio.com`, `hn.algolia.com`, and `news.ycombinator.com` during the iteration. No anti-bot wall was observed on any path.
- **Read-only.** Never click upvote / downvote / flag / hide / favorite / reply / submit / login. The skill's surface is GETs and HTML reads.

## Expected Output

```json
{
  "view": "front",
  "source": "firebase-api",
  "fetched_at": "2026-05-16T02:13:00Z",
  "total_stories": 30,
  "stories": [
    {
      "id": 48155690,
      "story_type": "story",
      "title": "'No Way to Prevent This,' Says Only Package Manager Where This Regularly Happens",
      "by": "alligatorplum",
      "by_profile_url": "https://news.ycombinator.com/user?id=alligatorplum",
      "score": 102,
      "comments": 32,
      "time": 1778891762,
      "time_iso": "2026-05-15T16:36:02Z",
      "age_human": "5 hours ago",
      "url": "https://kevinpatel.xyz/posts/no-way-to-prevent-this/",
      "domain": "kevinpatel.xyz",
      "text": null,
      "text_format": null,
      "hn_url": "https://news.ycombinator.com/item?id=48155690"
    },
    {
      "id": 48145524,
      "story_type": "ask",
      "title": "Ask HN: How to be SOC2 Type 2 compliant as a solo-entreprenuer?",
      "by": "sochix",
      "by_profile_url": "https://news.ycombinator.com/user?id=sochix",
      "score": 128,
      "comments": 113,
      "time": 1778829503,
      "time_iso": "2026-05-14T23:18:23Z",
      "age_human": "1 day ago",
      "url": null,
      "domain": null,
      "text": "Is it possible? Do you know success cases w&#x2F;o spending 20+k $ on auditors?...",
      "text_format": "html",
      "hn_url": "https://news.ycombinator.com/item?id=48145524"
    }
  ]
}
```

Single item with full comment tree (Algolia or Firebase walk, normalized):

```json
{
  "view": "item",
  "source": "algolia-items",
  "fetched_at": "2026-05-16T02:13:00Z",
  "story": { /* same shape as a story row above */ },
  "comments": [
    {
      "id": 48150204,
      "parent_id": 48145524,
      "by": "tptacek",
      "time": 1778860506,
      "time_iso": "2026-05-15T07:55:06Z",
      "depth": 1,
      "text": "Don&#x27;t. You are exactly the wrong kind of firm...",
      "text_format": "html",
      "kids_count": 9,
      "dead": false,
      "deleted": false,
      "children": [
        { "id": 48151168, "parent_id": 48150204, "by": "...", "depth": 2, "...": "..." }
      ]
    }
  ]
}
```

User view (submissions / threads / favorites), with the user record alongside:

```json
{
  "view": "user-submissions",
  "source": "firebase-api",
  "fetched_at": "2026-05-16T02:13:00Z",
  "user": {
    "id": "dang",
    "karma": 825234,
    "created": 1304277692,
    "created_iso": "2011-05-01T19:21:32Z",
    "about": "&quot;<i>Conflict is essential to human life...</i>&quot;",
    "profile_url": "https://news.ycombinator.com/user?id=dang",
    "submitted_count": 28491
  },
  "stories": [ /* story rows in the shape above */ ]
}
```

HTML-only views (`from?site=`, `front?day=`, `active`, `classic`, `threads`, `favorites`) emit the same `stories` (or `comments` for `/threads`) array as the API path, with `source: "html-fallback"` for caller transparency.
