---
name: luma-com-discover-1zqc5a
title: Discover Events and Parties on Luma
description: >-
  Find public events, meetups, and parties on Luma by city or interest category,
  returning name, URL, time, venue, hosts, and RSVP/ticket info via Luma's
  public unauthenticated JSON API.
website: luma.com
category: events
tags:
  - events
  - discovery
  - luma
  - meetups
  - parties
  - api
source: 'browserbase: agent-runtime 2026-06-06'
updated: '2026-06-06'
recommended_method: api
alternative_methods:
  - method: fetch
    rationale: >-
      Fetch https://luma.com/discover and parse the embedded __NEXT_DATA__ JSON
      to enumerate city/category slugs + coordinates, or to grab a featured
      city's ~12 events without any extra API call. Place sub-pages also SSR ~20
      events at initialData.data.events.
  - method: browser
    rationale: >-
      Fallback only if the JSON API is ever blocked. The rendered page shell is
      behind Cloudflare + Shape, so it needs --remote with --verified --proxies;
      the same event data is in __NEXT_DATA__ for place pages but category pages
      lazy-load from the API anyway.
verified: false
proxies: false
---
# Discover Events and Parties on Luma

## Purpose

Find public events, meetups, and parties on Luma (luma.com) by city or by interest category, returning a structured list of each event's name, canonical URL, start time, timezone, location/venue, hosts, hosting calendar, and ticket/RSVP info. Read-only — this skill only reads public discovery data; it never RSVPs, registers, buys tickets, or signs in.

Luma's web UI is a thin Next.js client over a **public, unauthenticated JSON API** at `api.luma.com`. The recommended path fetches that API directly — no browser, no login, no anti-bot stealth, no residential proxy. The browser flow is documented as a fallback only.

## When to Use

- Find upcoming events/parties in a specific city ("what's happening in San Francisco / NYC / London this week").
- Browse events by interest category (Tech, AI, Crypto, Food & Drink, Arts & Culture, Climate, Fitness, Wellness).
- Monitor a city or category for new events on a schedule.
- Bulk-collect event listings (name, time, venue, hosts, RSVP status) across multiple cities or categories.
- Anywhere you'd otherwise scrape Luma's rendered HTML — the JSON API is faster, cheaper, and structurally stable.

## Workflow

The optimal method is the **public JSON API** at `api.luma.com/discover/get-paginated-events`. It needs **no API key, no cookies, no auth header, and no special request headers** (the `x-luma-*` headers the web app sends are optional — server-to-server GETs return `200` without them). It also works **without a residential proxy** because results are geo-scoped by the `latitude`/`longitude` query params, *not* by your source IP. Lead with the API; only fall back to the browser if the API is ever blocked.

### Step 1 — (Optional) Discover available cities and categories

To enumerate the cities and categories Luma surfaces (with their slugs, coordinates, and event counts), fetch the discover landing page and parse the embedded Next.js data — this is server-rendered, so a plain HTTP GET works:

```
GET https://luma.com/discover
```

Extract the `<script id="__NEXT_DATA__">` JSON, then read `props.pageProps.initialData`:
- `categories[]` → each has `category.slug` (`tech`, `ai`, `crypto`, `food`, `arts`, `climate`, `fitness`, `wellness`), `api_id`, and `event_count`.
- `places[]` → each has `place.slug` (`sf`, `nyc`, `london`, `singapore`, `la`, `berlin`, `tokyo`, …), `place.coordinate.{latitude,longitude}`, and `event_count`.
- `featured_place.events[]` → ~12 fully-populated events for the viewer's nearest city (a quick zero-extra-call sample).

You can also skip this step entirely if you already know the slug you want (city slugs are the obvious abbreviations; the eight category slugs are listed above).

### Step 2 — Fetch the event list

```
GET https://api.luma.com/discover/get-paginated-events
    ?slug={slug}
    &pagination_limit={N}            # e.g. 20
    [&latitude={lat}&longitude={lon}]
    [&pagination_cursor={cursor}]    # for page 2+
```

Two scoping modes:

- **By city (place slug)** — e.g. `slug=sf`. A place slug self-geo-scopes; `latitude`/`longitude` are **not required** and are ignored if passed. This is the path for "events/parties in {city}".
- **By interest (category slug)** — e.g. `slug=tech`. A category slug **requires** `latitude` & `longitude` — without coordinates the API returns `{"entries": [], "has_more": false}` (empty, not an error). Use the target city's coordinates from Step 1's `places[]`, or any lat/lon you want to search around.

Response shape: `{ "entries": [...], "has_more": bool, "next_cursor": "<opaque-base64>" }`.

### Step 3 — Map each entry

Each element of `entries[]` wraps an `event` object plus enrichment fields. Pull:
- `event.name`, `event.start_at` (UTC ISO), `event.timezone` (display tz), `event.api_id`
- **Canonical event URL**: `https://luma.com/{event.url}` — `event.url` is the short slug (e.g. `weavehacks` → `https://luma.com/weavehacks`).
- `event.location_type` (`offline` | `online`), `event.geo_address_info.city_state` and `.full_address` (null/omitted for online events or when the host hides the address).
- `hosts[].name` (array), `calendar.name` (the hosting calendar/community).
- `ticket_info`: `{ is_free, price, is_sold_out, spots_remaining, is_near_capacity, require_approval }`.
- `guest_count` (registered attendees; often `0` for newly listed events).

### Step 4 — Paginate

If `has_more` is `true`, re-request the same URL adding `pagination_cursor={next_cursor}` from the previous response. Repeat until `has_more` is `false`. Keep the other params identical between pages.

### Step 5 — "Parties" / filtering

Luma has **no dedicated "parties" category** — its taxonomy is the eight categories above. Treat "find parties" as: pull a city's event list (Step 2, place slug) and filter `event.name` / `calendar.name` / `hosts` client-side for party/nightlife/social keywords, and/or pull the `food` category for a target city. There is **no working anonymous keyword-search endpoint** (see Gotchas). Document this assumption in your output.

### Browser fallback

Only if the API is unreachable. Anti-bot is heavier here (Cloudflare + Shape on the page shell — use `--remote` with `--verified --proxies`):

1. `browse open https://luma.com/{slug} --remote` (place slug → city event list; category slug → category page).
2. `browse wait timeout 3000` then `browse get html body` — the same event data is server-rendered into `<script id="__NEXT_DATA__">`. For a **place** page, events are embedded at `props.pageProps.initialData.data.events[]` (≈20 events). For a **category** page, events are **not** embedded (only `category` + `timeline_calendars`); the page lazy-loads them from the same `get-paginated-events` API, so prefer the API directly.
3. To see rendered cards, `browse mouse scroll 640 400 0 900` then `browse screenshot`. Do not click into events, RSVP, or subscribe — read-only.

## Site-Specific Gotchas

- **API host is `api.luma.com`, not `api.lu.ma`.** The legacy `api.lu.ma` host is live but returns `{"message":"Not found."}` for these discover paths — don't waste time on it.
- **Category slugs require coordinates; place slugs don't.** `slug=tech` with no `latitude`/`longitude` returns an **empty** `entries` array (HTTP 200, not an error) — easy to misread as "no events." Always pass `latitude`+`longitude` (from a city's `places[]` entry) for category slugs. Place slugs like `sf` self-scope.
- **Geo-scoping is by query param, not source IP.** A residential proxy is **not** required for the API. Confirmed: the same `slug=sf` query returns identical results with and without `--proxies`. The pre-run anti-bot probe (`likelyNeedsVerified/Proxies: true`) applies to the *rendered page shell* (Cloudflare + Shape), not to the JSON API.
- **No auth, no special headers needed.** The web app sends `x-luma-client-type`, `x-luma-timezone`, `x-luma-web-url`, `x-luma-client-version`, but the API returns `200` for plain server-to-server GETs without any of them. No cookie or bearer token required.
- **No anonymous keyword search.** `api.luma.com/search/get-results?query=...` returns **HTTP 401** (auth required) and `api.luma.com/discover/search` returns **404**. There is no public free-text search — discovery is slug-based (city or category) only. "Parties" must be filtered client-side from a city's list.
- **`event.url` is a bare slug, not a full URL.** Build the canonical link as `https://luma.com/{event.url}`. It is NOT the same as `event.api_id` (`evt-…`).
- **`next_cursor` is opaque** (base64-ish blob encoding the last item's sort value + id). Pass it back verbatim as `pagination_cursor`; don't try to decode or construct it.
- **`pagination_limit` caps page size.** Observed working values up to ~20–25. Use `has_more` + `next_cursor` to walk the full list rather than requesting a huge limit.
- **`start_at` is UTC ISO; render with `event.timezone`.** The card UI shows local time using the event's `timezone` field — convert accordingly.
- **Address can be null/hidden.** `geo_address_info` is absent for `location_type: "online"` events and when a host gates the exact address behind RSVP approval (`require_approval: true`). `city_state` is usually still present even when `full_address` is hidden.
- **`hosts[]` can contain duplicates** (the same person listed twice, once as organizer and once as co-host) — dedupe by name if it matters.
- **Discover landing data is SSR'd** at `props.pageProps.initialData` (cities + categories + a featured city's events), but **city/category sub-pages** push the event list to a client-side `get-paginated-events` call — so for anything beyond the discover home, hit the API, not the page HTML.

## Expected Output

A list of events for the requested city or category, with pagination state. Example (place slug `sf`, `pagination_limit=3`):

```json
{
  "slug": "sf",
  "scope": "place",
  "total_returned": 3,
  "has_more": true,
  "next_cursor": "eyJzdiI6IjIwMjYtMDYtMDYgMjA6MDA6MDArMDAiLCJmYiI6ImV2dC1zRFM5TUNKRkRFR1dsdWEifQ",
  "events": [
    {
      "api_id": "evt-QuGEMJl1hsIvImo",
      "name": "WeaveHacks 4: Multi-Agent Orchestration Hackathon with Weights & Biases",
      "url": "https://luma.com/weavehacks",
      "start_at": "2026-06-06T16:00:00.000Z",
      "timezone": "America/Los_Angeles",
      "location_type": "offline",
      "city": "San Francisco, CA",
      "venue": "400 Alabama St ste 202, San Francisco, CA 94110, USA",
      "hosts": ["Weights & Biases", "Alex Volkov", "Anna Shive"],
      "calendar": "Weights & Biases",
      "is_free": false,
      "price": null,
      "is_sold_out": false,
      "spots_remaining": 5,
      "guest_count": 0
    },
    {
      "api_id": "evt-0mdEDP4pw0YTS2M",
      "name": "Design Meetup x Reve Makeathon",
      "url": "https://luma.com/ldhaw009",
      "start_at": "2026-06-06T20:00:00.000Z",
      "timezone": "America/Los_Angeles",
      "location_type": "offline",
      "city": "Palo Alto, CA",
      "venue": null,
      "hosts": ["Ilyssa Yan", "Kyra Mo", "Chi Quach", "Reve"],
      "calendar": "Design Meetup",
      "is_free": false,
      "price": null,
      "is_sold_out": false,
      "spots_remaining": null,
      "guest_count": 75
    }
  ]
}
```

Category-scoped request (note required coordinates) and the empty-result shape to guard against:

```json
// GET .../get-paginated-events?slug=tech&latitude=37.7749&longitude=-122.4194&pagination_limit=20
// -> { "entries": [ ... ], "has_more": true, "next_cursor": "..." }

// GET .../get-paginated-events?slug=tech            (category slug, NO coords)
// -> { "entries": [], "has_more": false }           // empty, NOT an error — coords were missing
```
