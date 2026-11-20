---
name: meetup-com-search-events-8bdsvy
title: Meetup Event Search
description: >-
  Search Meetup for upcoming events by topic, location, and filters, returning
  each event (title, group, venue, time, RSVP count, price) plus region-wide
  totals and pagination cursors as structured JSON.
website: meetup.com
category: events
tags:
  - meetup
  - events
  - search
  - graphql
  - ssr
source: 'browserbase: agent-runtime 2026-06-04'
updated: '2026-06-04'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      Drive a Browserbase stealth+proxy session to open the same /find/ URL and
      read document.querySelector('#__NEXT_DATA__'). Same data, ~3x the cost of
      the Fetch path; use only if the Fetch API path is rate-limited.
  - method: api
    rationale: >-
      The site's own client calls the persisted-query GraphQL endpoint
      https://www.meetup.com/gql2 for pagination beyond the first page. It
      requires a sha256Hash persisted-query id + operationName that rotate per
      deploy and is behind robots Disallow: /gql*. Reachable for cursor
      pagination but the surface keeps shifting — derive the hash from a live
      page rather than hardcoding it.
verified: true
proxies: true
---
# Meetup Event Search

## Purpose

Search Meetup for upcoming events matching a topic and location (and any of Meetup's filter dimensions) and return the matching events as structured JSON, plus the region-wide total and a pagination cursor so the caller knows the returned slice is partial. Read-only — never RSVP, join, save, or sign in. The entire first page of results is server-rendered into the `/find/` page's HTML, so no scripted clicking, scrolling, or GraphQL reverse-engineering is needed for the common case.

## When to Use

- "Find AI events in San Francisco", "book clubs in Brooklyn", "climbing meetups near 94110".
- Filtered discovery: a topic category, a date window (today / this weekend / next week), in-person vs online, a distance radius, free vs paid, sort by date/distance.
- Monitoring a city + topic for new upcoming events on a schedule.
- A Meetup search URL (`https://www.meetup.com/find/?...`) you want decoded into structured data.

## Workflow

The optimal path is a single authenticated **HTTP GET of the `/find/` page through a residential proxy** — no browser session required. The page is a server-rendered Next.js app: the complete `eventSearch` GraphQL connection (results, total count, and pagination cursor) plus every normalized `Event` / `Group` object is embedded in a `<script id="__NEXT_DATA__">` JSON blob *before any JS runs*. Parse that blob and you have the data. (Meetup sits behind Cloudflare; a Browserbase residential proxy is required — a bare request from a datacenter IP risks a 403/challenge.)

1. **Build the search URL.** Base: `https://www.meetup.com/find/?source=EVENTS`. Append the filters the caller asked for (param names below; all are URL query params):

   | Dimension | Param | Value |
   |---|---|---|
   | Topic keywords | `keywords` | free text, e.g. `AI`, `book club` |
   | Location | `location` | slug form `us--ca--San Francisco` (URL-encoded); free text `San Francisco, CA` also geocodes server-side. For lat/lon use `lat=` + `lon=`. |
   | Category | `categoryId` | numeric taxonomy id (see Gotchas table) |
   | Date window | `dateRange` | `today`, `tomorrow`, `this_week`, `this_weekend`, `next_week`; or `customStartDate=` + `customEndDate=` (ISO) |
   | Format | `eventType` | `inPerson`, `online` (omit for both) |
   | Distance | `distance` | miles from center (e.g. `distance=10`) |
   | Event type | `eventType` (fee) | `paid` / free is implicit; price not filterable via URL |
   | Sort | `sortField` | `RELEVANCE` (default), `DATETIME` (date), `DISTANCE` |

2. **Fetch through a proxy.** `browse cloud fetch "<url>" --proxies` (Browserbase Fetch API — cheap, HTTP-only, no browser). Returns a JSON envelope; the page HTML is in `.content`. Note the CLI prints an `Update available:` banner to stdout — strip everything before the first `{` before `JSON.parse`.

3. **Extract `__NEXT_DATA__`.** Pull the JSON inside `<script id="__NEXT_DATA__" type="application/json">…</script>` and `JSON.parse` it.

4. **Read the Apollo store.** `props.pageProps.__APOLLO_STATE__` is a normalized cache:
   - `ROOT_QUERY` has a key beginning `eventSearch(...)` → `{ totalCount, pageInfo { hasNextPage, endCursor }, edges[] }`. `totalCount` is the region-wide total; `endCursor` (base64, e.g. `"MTI="` = "12") is the pagination cursor.
   - Each `edges[i].node.__ref` is a string like `"Event:314707414"`. Look that key up in `__APOLLO_STATE__` for the full event.
   - Each Event's `group.__ref` (`"Group:<id>"`) resolves to the hosting group's `name` + `urlname`.
   - `ROOT_QUERY` also carries `locationSearch({"query":"..."})` — the geocoded center (lat/lon/zip/timeZone/name) Meetup resolved the location text to. Use it to confirm the search landed in the right city.

5. **Map each Event** to output (field names as they appear in the Apollo `Event` object):
   - `id`, `title`, `dateTime` (start, ISO 8601 w/ tz), `description` (full body), `eventType` (`PHYSICAL` | `ONLINE` | `HYBRID`), `eventUrl` (canonical).
   - `venue` is **inline** on the Event: `{ name, address, city, state, country }` for in-person; for online events `venue` is null/empty and the platform link lives only on the event detail page.
   - `maxTickets` = capacity; `rsvps.totalCount` = RSVP count; `feeSettings === null` ⇒ free (a non-null `feeSettings` carries the price).
   - `featuredEventPhoto` / `displayPhoto` are `PhotoInfo:<id>` refs (resolve in the store for the image URL); `series` describes recurrence; `socialProofInsights.totalInterestedUsers` is the "interested" count.

6. **Emit JSON** in the Expected Output shape. Mark the slice partial whenever `pageInfo.hasNextPage` is true and surface `endCursor` so the caller can paginate.

### Pagination beyond page 1 (only if needed)

The SSR blob is page 1 (the first ~12 ranked events; the store often pre-hydrates up to ~30). For deeper pages the site's own client POSTs to the persisted-query GraphQL endpoint `https://www.meetup.com/gql2` with `{ operationName, variables: { cursor }, extensions: { persistedQuery: { sha256Hash } } }`. The hash + operation name rotate per front-end deploy and the endpoint is behind `robots: Disallow: /gql*`, so don't hardcode them — for most callers, re-fetching `/find/` with a larger result window or a tightened filter (category/date/distance) is simpler and more durable than chasing the GraphQL cursor.

### Browser fallback

If the Fetch API path is rate-limited, open the identical URL in a Browserbase stealth session (`--verified --proxies`) and read the same blob:

1. `browse open "<find-url>" --remote` (session created with `--verified --proxies`).
2. `browse get text script#__NEXT_DATA__` (NOT `browse snapshot` — the data is in a script tag, not the accessibility tree; snapshot returns nothing useful).
3. Parse `__NEXT_DATA__` exactly as in steps 4–5 above.

This is the same data at ~3× the cost. Verified working end-to-end (find page returned HTTP 200, full event set extracted) across two iterations.

## Site-Specific Gotchas

- **Cloudflare — proxy is mandatory, stealth helps.** Meetup fronts everything with Cloudflare. The `/find/` GET succeeds with a Browserbase residential proxy (`--proxies`); the browser fallback used `--verified --proxies`. A datacenter IP risks a `403` / "Just a moment" challenge. In a clean traced run only a single `.woff2` font request 403'd and one telemetry beacon 422'd — the find-page document itself returned **200**, so don't mistake noisy sub-resource failures for a block; check the status of the `/find/?...` document specifically.
- **`browse cloud fetch` stdout banner.** The CLI emits `Update available: 0.7.2 -> 0.8.2` before the JSON. Always slice from the first `{` (or use `--output <file>`) before parsing.
- **The data is in a `<script>` tag, not the DOM you'd click.** Use `get text/html script#__NEXT_DATA__`; `browse snapshot` returns no useful refs for results.
- **`endCursor` is base64.** `"MTI="` decodes to `"12"` — it's an opaque offset cursor, not the count. `totalCount` is the real region-wide total.
- **`__APOLLO_STATE__` contains more `Event:*` keys than the search returned.** A search for AI in SF yielded `totalCount: 30` but ~54 `Event:` objects in the store — the extras are sparse stubs (`id`, `dateTime`, `group` only) referenced by group cards / series, NOT search hits. **Only treat the refs inside the `eventSearch` connection's `edges[]` as results**; iterating every `Event:*` key pollutes the output with non-matching events.
- **Category taxonomy is a numeric enum** (pass via `categoryId=`). Confirmed from the live front-end bundle:

  | Category | id | Category | id |
  |---|---|---|---|
  | Technology | 546 | Music | 395 |
  | Career & Business | 405 | Health & Wellbeing | 511 |
  | Art & Culture | 521 | Sports & Fitness | 482 |
  | Science & Education | 436 | Social Activities | 652 |
  | Hobbies & Passions | 571 | Games | 535 |
  | Community & Environment | 604 | Identity & Language | 622 |
  | Movements & Politics | 642 | Religion & Spirituality | 593 |
  | Travel & Outdoor | 684 | Parents & Family | 673 |
  | Pets & Animals | 701 | Support & Coaching | 449 |
  | Dancing | 612 | Writing | 467 |

  Meetup's live taxonomy is finer-grained than the prompt's 15-bucket list (e.g. "Outdoors & Adventure" maps to **Travel & Outdoor** 684; "Arts & Culture" → **Art & Culture** 521). Verified `categoryId=546` returns Technology events.
- **Location resolution.** `location=` accepts both the slug form (`us--ca--San Francisco`) and free text (`San Francisco, CA`); both geocode server-side, and the resolved center appears under `ROOT_QUERY.locationSearch(...)`. With no location, results geolocate to the proxy/request IP — always pass an explicit `location` (or `lat`/`lon`) for deterministic output. "Online" searches still report a nominal city in the header but the `eventType=online` filter scopes the results.
- **No end time / duration / venue lat-lon in the SSR blob.** The `/find/` query selects `dateTime` (start) but not end time, duration, or venue coordinates. For those, plus online-platform links (Zoom/Meet) and rich group fields (member count, About, founded date), fetch the individual **event page** or **group page** (each has its own richer `__APOLLO_STATE__`). The search-page `Group` object is sparse: `name`, `urlname`, `timezone`, rating stats only.
- **`gql2` is a persisted-query endpoint behind robots.** Don't try to call it with a raw GraphQL query string — it expects an `extensions.persistedQuery.sha256Hash` that rotates per deploy. The SSR blob already contains page 1, so you rarely need it.
- **`robots.txt` disallows the search query params** (`keywords`, `location`, `distance`, `dateRange`, `categoryId`, `sortField`, …) and `/gql*`. This is read-only extraction of public listing data; throttle politely (≤1 req/s) and prefer the single SSR fetch over hammering the GraphQL cursor.

## Expected Output

```json
{
  "success": true,
  "query": { "topic": "AI", "location": "San Francisco, CA", "category_id": null, "sort": "RELEVANCE" },
  "resolved_center": { "city": "San Francisco", "state": "CA", "country": "us", "lat": 37.78, "lon": -122.42, "zip": "94101", "timezone": "US/Pacific" },
  "total_count": 30,
  "has_next_page": true,
  "end_cursor": "MTI=",
  "events": [
    {
      "id": "314707414",
      "title": "John Vervaeke - How Minds Find What Matters",
      "description": "For this session, we'll be reading John Vervaeke … relevance realization …",
      "start_time": "2026-06-03T18:00:00-07:00",
      "event_type": "PHYSICAL",
      "is_online": false,
      "venue": {
        "name": "The Fold",
        "address": "3359 26th St, San Francisco, CA 94110, USA",
        "city": "San Francisco", "state": "CA", "country": "us"
      },
      "rsvp_count": 50,
      "capacity": 50,
      "is_free": true,
      "price": null,
      "photo_url": null,
      "interested_count": 40,
      "is_recurring": true,
      "group": {
        "name": "San Francisco Philosophy Reading Group",
        "urlname": "sf-philosophy-reading-group",
        "url": "https://www.meetup.com/sf-philosophy-reading-group/",
        "rating": 4.81
      },
      "event_url": "https://www.meetup.com/sf-philosophy-reading-group/events/314707414/"
    }
  ],
  "error_reasoning": null
}
```

Online-event shape (in-person fields null, `event_type: "ONLINE"`; platform link is only on the event detail page):

```json
{
  "id": "313346768",
  "title": "Weekly AI Paper Discussion",
  "start_time": "2026-06-05T18:00:00-07:00",
  "event_type": "ONLINE",
  "is_online": true,
  "venue": null,
  "online_platform": null,
  "rsvp_count": 18,
  "capacity": null,
  "is_free": true,
  "group": { "name": "SF AI", "urlname": "sfbay-ai", "url": "https://www.meetup.com/sfbay-ai/" },
  "event_url": "https://www.meetup.com/sfbay-ai/events/313346768/"
}
```

Blocked / failure shape:

```json
{
  "success": false,
  "query": { "topic": "AI", "location": "San Francisco, CA" },
  "total_count": null,
  "events": [],
  "error_reasoning": "Cloudflare challenge / HTTP 403 on /find/ — retry with --verified --proxies, or the residential proxy IP is flagged."
}
```
