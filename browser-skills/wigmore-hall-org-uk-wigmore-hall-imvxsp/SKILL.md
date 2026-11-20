---
name: wigmore-hall-org-uk-wigmore-hall-imvxsp
title: Wigmore Hall Concert Search
description: >-
  Search Wigmore Hall (London) concerts by composer, performer, or work —
  returns title, date/time, programme summary, price band, and canonical concert
  URL via the venue's public unauthenticated JSON API.
website: wigmore-hall.org.uk
category: music
tags:
  - concerts
  - classical-music
  - chamber-music
  - london
  - wigmore-hall
  - api
  - read-only
source: 'browserbase: agent-runtime 2026-05-25'
updated: '2026-05-25'
recommended_method: api
alternative_methods:
  - method: fetch
    rationale: >-
      The /api/v1/search endpoint is public, requires no auth or cookies,
      returns 200 from a bare HTTP client without proxies — `browse cloud fetch`
      (no flags) is the cheapest path.
  - method: browser
    rationale: >-
      Only useful as fallback if the API namespace is unreachable. The
      /search?term=… page is a React SPA that calls the exact same endpoint, so
      browsing adds latency without buying anything. For full per-concert
      programme detail (specific work titles and opus numbers), navigate the SSR
      concert page at /whats-on/{YYYYMMDDhhmm} — that data is not exposed via
      JSON.
verified: false
proxies: false
---
# Wigmore Hall — Search Concerts by Composer / Artist / Work

## Purpose

Return Wigmore Hall (London) concerts whose title, performer line-up, or programme contains a given search term — composer surname (e.g. `Beethoven`), performer name (e.g. `Igor Levit`), work title (e.g. `Goldberg Variations`), or work catalogue number (e.g. `BWV1004`, `Op. 109`). Each hit carries the performance title, ISO date/time, programme blurb (composers joined with commas — e.g. "Brahms, Bach, Beethoven and more"), ticket-price summary, canonical concert URL, and Tessitura booking ID. Read-only — never books, reserves, or holds a slot.

## When to Use

- "Which upcoming Wigmore concerts feature Schubert?"
- "Is there a Goldberg Variations recital at Wigmore in the next 12 months?"
- Aggregator pulling weekly listings of Beethoven / Schubert / Bach concerts for a music-magazine newsletter.
- Discovering whether a specific performer (e.g. `Yunchan Lim`, `Lise Davidsen`) has any forthcoming Wigmore dates.
- Historical look-up across the archive (e.g. "how many Mahler concerts did Wigmore host between 2020 and 2024?").

## Workflow

Wigmore Hall publishes a clean, **unauthenticated, anti-bot-free JSON API** that powers the public `/search?term=…` page. The API endpoint is `GET https://www.wigmore-hall.org.uk/api/v1/search?term={QUERY}` — single-segment search across performance titles, performer line-ups, programme subtitles, and per-work composer/title/opus metadata. Use it directly with `browse cloud fetch` (no `--proxies`, no `--verified`, no cookies, no session warmup). The browser path is a fallback only — the `/search` page is a React SPA that issues the same request, so going through Chrome adds latency without buying anything.

### 1. Build the request URL

```
GET https://www.wigmore-hall.org.uk/api/v1/search
    ?term={url-encoded-query}            # required — full-text match
    [&page={1-indexed page}]              # default 1; page size is fixed at 12
    [&startDate=YYYY-MM-DDTHH:mm:ss.000Z] # default today (forthcoming only)
    [&endDate=YYYY-MM-DDTHH:mm:ss.000Z]   # default unbounded (all future)
Accept: application/json
```

No `Referer`, `Origin`, `Cookie`, or `User-Agent` requirements — verified with `browse cloud fetch` (no proxies) returning 200 in ~250ms.

### 2. Choose the date window

| Want | `startDate` | `endDate` |
|---|---|---|
| **Forthcoming only** (default) | _omit_ (server defaults to today) | _omit_ |
| **Forthcoming + archived** (full catalogue) | `1900-01-01T00:00:00.000Z` | _omit_ |
| **Archived only** | `1900-01-01T00:00:00.000Z` | today (YYYY-MM-DD) |
| **Specific window** | window start (ISO Zulu) | window end (ISO Zulu) |

Empirical totals (term=`Mozart`, captured 2026-05-25): forthcoming = 40, all-time = 838, archived alone = 798. Verified by toggling `startDate`.

### 3. Issue the request

```bash
curl -sS "https://www.wigmore-hall.org.uk/api/v1/search?term=Schubert" \
  | jq '{ total: .totalItems, pages: .totalPages, first: .items[0].node | {title, url, date, subtitleText} }'
```

…or via the cloud fetch path that mirrors the marketplace agent runtime:

```bash
browse cloud fetch "https://www.wigmore-hall.org.uk/api/v1/search?term=Schubert"
```

Response is a single JSON object: `{ "items": [...], "totalItems": N, "totalPages": ceil(N/12) }`. Page size is hard-coded to 12 server-side — `pageSize`, `perPage`, and `limit` are silently ignored.

### 4. Decode each `items[i].node`

Each node has `__typename: "Performance"` and these fields you'll actually use:

- `title` — performer line-up as one string ("Asmik Grigorian soprano; Lukas Geniušas piano").
- `titleOverrideText` — same but with HTML `<sub>` tags wrapping the instrument labels; strip if you want plain text.
- `subtitleText` — programme summary: composer surnames joined with commas plus "and more" if truncated ("Bach, Beethoven, Haydn, Mozart and Schubert"). Treat this as the **composer-set summary**, NOT a full work list.
- `url` — canonical concert path `/whats-on/{YYYYMMDDhhmm}`. Prefix with `https://www.wigmore-hall.org.uk` for the absolute URL.
- `date` — ISO 8601 with London offset (e.g. `2026-06-04T19:30:00+01:00`).
- `groupDate` — `YYYY-MM-DD` (no time) for date-grouped UIs.
- `tessituraId` — the box-office system's integer ID (string-encoded, e.g. `"61088"`). Useful only if you also call Tessitura.
- `pricesText` — HTML-encoded price summary with `<br/><sub>+£4 booking fee per transaction</sub>` suffix; strip tags or pass through as-is.
- `id` — opaque base64 relay node ID (e.g. `UGVyZm9ybWFuY2U6Mjc2Njc=`); decodes to `Performance:{number}` but the number is not the same as `tessituraId` — don't try to derive one from the other.
- `isPriorityBooking` — boolean, true when the concert is currently in a Friends/Members priority-booking window.
- `listingImage` / `listingImageAspect` — image URL bundles (multiple breakpoints); use `listingImage.src` (400px-wide).

### 5. Paginate

`totalPages = ceil(totalItems / 12)`. Fetch `?term=…&page=2`, `…&page=3`, … until `page > totalPages` (which still returns 200 with `"items": []`). One request per page; ~250ms each from the sandbox. No throttling observed at 5 req/s sustained.

### 6. Resolve full programme (optional, per-concert)

The search endpoint only exposes a composer-set blurb. If you need the **actual list of works** (e.g. "Piano Sonata No. 30 in E Op. 109") or the **per-work composer attribution**, follow `url` to the SSR concert page `https://www.wigmore-hall.org.uk/whats-on/{YYYYMMDDhhmm}` and extract from the rendered HTML (look for the `#### Programme` heading; each composer line is `[Composer Name](/artists/{slug})` followed by indented work entries). Pages are server-rendered, no JS needed — `browse cloud fetch` returns the full markup. Don't try `/api/v1/performances/{id}` — it 404s (no per-concert JSON endpoint exists).

### Browser fallback

Used only when the API namespace is unreachable (unobserved in any of 2026-05-25 testing). Navigate to `https://www.wigmore-hall.org.uk/search?term={QUERY}` in a bare (no `--verified`, no `--proxies`) cloud session, `browse wait timeout 3000` after `load` (the listing widget hydrates ~1–2 s after `DOMContentLoaded`), then `browse get markdown body`. The page renders results in chronological calendar groupings (`### {Weekday DD Mon YYYY}` headings). For archived results, click the `ARCHIVED EVENTS ({N})` tab. **Don't** click `BOOK NOW`, `Book now`, or any per-concert price button — those redirect to the Tessitura booking flow. Read-only is the rule.

## Site-Specific Gotchas

- **`q=` alone returns zero results.** Earlier iterations of the search page used `?q={query}` — the server now requires `?term={query}`. URLs with only `q=` (no `term=`) return `{"items":[],"totalItems":0,"totalPages":0}` from the API and a blank-result page from the SPA. **Always send `term=`**, not `q=`. Sending both `q=` and `term=` is harmless — server only reads `term=`.
- **Default `startDate` is today (server-side, not the URL).** Hitting `/api/v1/search?term=Mozart` with no date params silently scopes the result set to forthcoming events only — even though the URL contains no date parameter. To get archived events you MUST pass `startDate=1900-01-01T00:00:00.000Z` (or any sufficiently-old ISO Zulu timestamp). Discovered when the same query returned 40 vs. 838 items depending on whether `startDate` was set.
- **Tab-switch on the `/search` page doesn't change the API call.** The five tabs (`FORTHCOMING EVENTS`, `ARCHIVED EVENTS`, `WATCH`, `SERIES`, `PAGES`) and their counts are computed client-side from a single super-set response — switching tabs in the UI doesn't trigger a new request. The API endpoint always returns `__typename: "Performance"` nodes; the Watch / Series / Pages tabs come from a different SSR path and are out of scope for this concert-search skill.
- **`contentTypes=Watch|Series|Page` returns HTTP 500.** Don't try to filter content types via the API; the server's GraphQL resolver throws on those values. `contentTypes=` (empty) is the only value the server accepts; non-empty PascalCase values 500. The other quasi-filter params (`watchPageOnly`, `learningPageOnly`, `forthcomingPerformancesOnly`) are silently accepted but have NO observable effect on the result set (verified by comparing totals across all four variants — all returned 40 for `term=Mozart`).
- **Page size is fixed at 12, server-side.** `pageSize`, `perPage`, `limit`, and `count` are all silently ignored — every page returns 12 items max. For large result sets (e.g. `Op. 109` returns 64 across 6 pages including archive) you'll need to paginate.
- **`startDate` overrides IP-geolocation? No — there's no geo gating on this endpoint at all.** Same response regardless of source IP. No `--proxies` needed.
- **`subtitleText` is a teaser, not the full programme.** It's truncated to leading composers + "and more" (e.g. `BACH, BEETHOVEN, HAYDN, MOZART AND SCHUBERT` for a 5-composer concert; longer programmes get e.g. `BEETHOVEN, CHOPIN, GEORGE XIAOYUAN FU, MESSIAEN AND R SCHUMANN`). Don't parse it as a complete composer list. For full programmes, fetch the concert detail page (step 6).
- **Search hits include performers AND composers AND work titles AND opus numbers.** It's a single unified full-text index. `term=Levit` (4 hits) finds concerts where Igor Levit performs; `term=Beethoven` (50+ hits) finds concerts that include any Beethoven work; `term=Goldberg%20Variations` finds the four specific concerts featuring that work. No way to disambiguate composer-vs-performer in the query (e.g. for `term=Mahler` you'll get both performer "Gustav Mahler — not applicable" and composer programmes). When the user supplies a name that is BOTH a composer and a performer (rare but possible with surnames like `Mendelssohn`), inspect each result's `subtitleText` (composers appear there) vs `title` (performers appear there) to classify.
- **Diacritics matter and must be URL-encoded.** `term=Erlk%C3%B6nig` returns 4 hits; `term=Erlkonig` (no umlaut) returns 0. The index does not fold diacritics. Similarly Schubert → `Schubert`, Dvořák → `Dvo%C5%99%C3%A1k`. When the user types ASCII-only, fall back to a substring (e.g. `term=Erlk` matches), but you'll get false positives.
- **`url` is `/whats-on/{YYYYMMDDhhmm}`, not `/concerts/{id}`.** The URL slug is derived from the concert start time (Europe/London, 24h). Two concerts on the same day are differentiated by their hour (e.g. `/whats-on/202605251300` lunchtime + `/whats-on/202605251930` evening). Use the `url` field verbatim — don't try to construct it from `tessituraId` or `id`.
- **`tessituraId` ≠ `id`.** The base64 `id` field (e.g. `UGVyZm9ybWFuY2U6Mjc2Njc=` → `Performance:27667`) is the GraphQL Relay node ID; `tessituraId` (e.g. `"61088"`) is the box-office system ID. Different number spaces — don't map one to the other.
- **No per-concert API endpoint.** `/api/v1/performances/{id}` and `/api/v1/performances/{tessituraId}` both 404. To get full programme detail, you must scrape the SSR `/whats-on/{slug}` HTML.
- **Booking-flow URLs end in `/booking/{tessituraId}`** (e.g. `/booking/61095`). Do not request these — they redirect into the Tessitura booking funnel and may set session/cart state. The search results include them in the "BOOK NOW" anchors; ignore them.
- **The `/artists/{slug}` SSR pages are a viable alternative for exact-composer / exact-performer lookups.** Wigmore canonicalises every composer and performer to `/artists/{slugified-name}` (e.g. `/artists/ludwig-van-beethoven`, `/artists/igor-levit`). The page is server-rendered and lists concerts grouped by date with tabs labelled `Events (N) | Archived Events (N) | Listen (N) | Watch (N)` — the Events count matches the search-API forthcoming total for that name. Useful when you have the canonical slug and want to skip a possibly-ambiguous full-text query. The page only ships the first ~12 entries in the initial SSR; further entries load via JS scrolling — not currently exposed as a JSON endpoint, so paginate via the search API instead.
- **Cache TTL is 120 s** (`Cache-Control: max-age=120, must-revalidate, public`). Same query within 2 minutes will return a cached response — fine for repeat reads, but if you're poll-monitoring for new on-sale dates, expect ≤2-minute staleness.

## Expected Output

Three distinct outcome shapes — emit the one that matches what the search returned.

```json
// Hit — one or more matching concerts
{
  "success": true,
  "query": "Schubert",
  "scope": "forthcoming",
  "total_results": 47,
  "concerts": [
    {
      "title": "Yunchan Lim piano",
      "subtitle": "Schubert and Skryabin",
      "date_iso": "2026-05-29T13:00:00+01:00",
      "date_local": "Fri 29 May 2026 — 1.00pm",
      "url": "https://www.wigmore-hall.org.uk/whats-on/202605291300",
      "tessitura_id": "61075",
      "node_id": "UGVyZm9ybWFuY2U6Mjc2NjA=",
      "prices_text": "£60 £53 £43 £33 £18",
      "is_priority_booking": false,
      "image_url": "https://admin.wigmore-hall.org.uk/images/XlN2nz5b1fOA2qOr-TsWvpsmvMY=/5972/width-400/..."
    }
  ]
}

// No hits
{
  "success": true,
  "query": "ASCIIComposerWhoDoesntExist",
  "scope": "forthcoming",
  "total_results": 0,
  "concerts": []
}

// Likely-misspelled / diacritic miss (heuristic)
{
  "success": false,
  "reason": "no_results_possible_diacritic_mismatch",
  "query": "Erlkonig",
  "hint": "Retry with diacritics URL-encoded — e.g. Erlk%C3%B6nig (Erlkönig). The search index does not fold diacritics.",
  "concerts": []
}
```
