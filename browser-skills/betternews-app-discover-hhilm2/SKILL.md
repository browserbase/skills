---
name: betternews-app-discover-hhilm2
title: Discover News on BetterNews
description: >-
  Find and list BetterNews articles via the public /api/news/find JSON endpoint,
  with optional keyword (q), topic, country, and source filters plus paging — no
  auth or browser required.
website: betternews.app
category: news
tags:
  - news
  - discovery
  - search
  - api
  - betternews
source: 'browserbase: agent-runtime 2026-06-07'
updated: '2026-06-07'
recommended_method: api
alternative_methods:
  - method: fetch
    rationale: >-
      The same GET /api/news/find endpoint can be hit with any plain HTTPS
      client; 'api' is preferred only because BetterNews ships documented REST
      endpoints (docs.betternews.app).
  - method: browser
    rationale: >-
      Driving the /discover SPA works as a fallback but is strictly slower and
      ultimately fires the identical /api/news/find request; the HTML pages also
      sit behind Cloudflare (use --proxies), whereas the API does not.
verified: false
proxies: false
---
# Discover News on BetterNews

## Purpose
Find and list current news articles from BetterNews (`betternews.app`), the community-driven news platform, optionally filtered by free-text keyword, topic, country, or source. This is a **read-only** discovery task. The recommended path is a single unauthenticated HTTP GET against the site's public JSON API (`/api/news/find`) — no browser, login, proxy, or anti-bot evasion is required. A browser fallback that drives the `/discover` UI is documented at the end but is strictly slower and hits the same endpoint.

## When to Use
- "Show me the latest news on BetterNews" / "what's on BetterNews right now."
- "Find BetterNews articles about Korea / a specific keyword."
- "Get BetterNews politics (or stocks, AI, sports…) headlines."
- "List news from a specific country (e.g. US, GB, JP) on BetterNews."
- "Find articles from a specific source (BBC, AP, CNBC…) on BetterNews."
- Any time you need a structured feed of headlines + source + topic + credibility, rather than reading the rendered SPA.

## Workflow

The optimal method is a direct API call — the BetterNews front end is a React SPA whose `/discover` page is powered entirely by `GET /api/news/find`. That endpoint returns clean JSON, requires no auth/cookies, and is **not** behind the Cloudflare challenge that fronts the HTML pages. Skip the browser entirely.

1. **(Optional) Resolve filter vocabularies.** Topic and source filters use human-readable names / numeric IDs that you can enumerate first:
   - `GET https://betternews.app/api/news/topics?hide_empty=true&as_object=true` → `{ data: { topics: [{id, name}] } }`. Valid topic names include: `AI, Business, Crime, Culture, Economy, Education, Entertainment, Environment, Health, Lifestyle, Politics, Racing, Science, Sports, Stocks, Tech, World`.
   - `GET https://betternews.app/api/news/countries?hide_empty=true` → `{ data: { countries: [{name, short}] } }` (ISO alpha-2 codes such as `US`, `GB`, `JP`, `KR`, `KP`).
   - `GET https://betternews.app/api/sources/list?hide_empty=true&full_data=true` → `{ data: [...] }` with `{id, name, credibility}` (e.g. `BBC`→6, `Associated Press`→12, `Cnbc`→50). ~35 sources.

2. **Call the discovery endpoint** with whatever filters apply:
   ```
   GET https://betternews.app/api/news/find?include_related=true
   GET https://betternews.app/api/news/find?q=korea
   GET https://betternews.app/api/news/find?topic=Stocks
   GET https://betternews.app/api/news/find?country=US
   GET https://betternews.app/api/news/find?source=6
   GET https://betternews.app/api/news/find?topic=AI&country=US&q=openai&page=2&take=5
   ```
   Send a normal browser-like `User-Agent`. No `Authorization` header is needed. A plain HTTPS GET works with or without a residential proxy (both return `200`).

3. **Read the JSON.** The body is `{ status: "OK", cached: <bool>, count: <int>, data: [ <article>, ... ] }`. Default page size is **15** articles, newest first. Iterate `data` and emit the fields you need (headline, subline, source name + credibility, topic, country, submitter, vote/view counts, timestamps).

4. **To page through results**, increment `page` (1-based; `page=2` returns the next 15). Use `take=N` to cap the number of items returned per call.

5. **To "continue reading" the original article**, use the `link` field on each item (`https://betternews.app/api/news/open?id=<id>`) — this 30x-redirects to the publisher's original URL. Do **not** treat it as a JSON endpoint.

### Query parameters (verified)
| Param | Meaning | Example | Notes |
|---|---|---|---|
| `q` | Full-text keyword search over headline/subline | `q=korea` | Filters; `search`/`query`/`keyword`/`title`/`term` are **ignored** — only `q` works |
| `topic` | Topic name (not ID) | `topic=Politics` | Must match a name from the topics list, case-sensitive |
| `country` | ISO alpha-2 country code | `country=US` | Use `country`, **not** `countryAlpha2` (the latter is ignored) |
| `source` | Numeric source ID | `source=12` | Use singular `source`; `sources=` is ignored |
| `page` | 1-based page number | `page=2` | 15 items per page |
| `take` | Max items to return | `take=3` | Caps result size |
| `include_related` | Attach `related_articles[]` | `include_related=true` | Adds up to a few related headlines per item |

Filters combine with **AND** (`?topic=AI&country=US` returns only US AI stories).

### Browser fallback
Only needed if the JSON API is ever changed/blocked. Confirmed working flow:
1. `browse open https://betternews.app/discover --remote` (use `--proxies`; the HTML pages sit behind Cloudflare). Wait for the feed to render.
2. `browse snapshot` — the controls are: a search textbox labeled **"Enter search query"**, `<select>` dropdowns for **Topics**, **country** ("Select a country") and **Sorting By**, plus **Search** and **Reset** buttons.
3. Fill the search box (`browse fill <ref> <keyword>`), optionally pick a topic/country, click **Search**, wait ~2s, re-`snapshot`, and read the article cards. (Under the hood this fires the same `GET /api/news/find?q=…&include_related=true` request — observed in the network trace.)

## Site-Specific Gotchas
- **Use the API, not the SPA.** `betternews.app/` and `/discover` are an empty React shell (`<div id="root">`) rendered client-side; a plain HTML fetch returns no content. The data lives at `/api/news/find`.
- **The JSON API is NOT Cloudflare-gated.** The pre-run probe flagged Cloudflare + "likely needs proxies" for the *homepage*, but `/api/news/*` and `/api/sources/*` return `200` over a bare HTTPS GET with no proxy and no verified session. Don't waste a stealth/verified browser session on this task.
- **Param names are picky.** Only `q` (search), `topic`, `country`, `source`, `page`, `take`, `include_related` actually filter. Plausible-looking aliases — `search`, `query`, `keyword`, `title`, `term`, `countryAlpha2`, `sources`, `limit`, `per_page`, `pageSize`, `offset`, `skip`, `cursor` — are silently accepted and **ignored** (you get the unfiltered default feed back, which looks like success but isn't). Always sanity-check that the returned `topic`/`countryAlpha2` values match what you asked for.
- **`topic` takes the name, `source` takes the numeric ID.** Mixing these up returns the unfiltered feed. Resolve IDs from `/api/sources/list` first.
- **`find?id=<n>` does not fetch a single article** — the `id` param is ignored and you get the full feed. To isolate one story, filter the feed client-side by the `id` field, or follow its `link` (`/api/news/open?id=<n>`) which redirects off-site.
- **`count` is usually `0`.** The top-level `count` field in the response is not the result length — use `data.length` (capped at 15 per page).
- **Pagination is `page`/`take`, not `limit`/`offset`.** `limit`, `per_page`, `offset`, `skip`, `cursor` are all ignored; only `page` (1-based) and `take` change the result set.
- **`cached` flips between calls.** Responses are edge-cached (`cf-cache-status: DYNAMIC`, `cached: true|false`); content is identical, so it's not a reliability concern.
- This demo dataset's articles are largely submitted by the bot user **Nova** (`/user/iamabot`); `submitter.display_name` will frequently be "Nova".

## Expected Output

A successful discovery returns the parsed feed. Example for `GET /api/news/find?q=korea`:

```json
{
  "status": "OK",
  "cached": false,
  "count": 0,
  "query": "korea",
  "page": 1,
  "data": [
    {
      "id": 1839,
      "headline": "South Korean stock market experiences high volatility",
      "subline": "Markets in Seoul swung sharply amid global uncertainty...",
      "topic": "Stocks",
      "countryAlpha2": "KR",
      "source": { "id": 50, "name": "Cnbc", "credibility": 7 },
      "submitter": { "display_name": "Nova", "username": "iamabot" },
      "thought": "Neutral framing of the volatility and its drivers.",
      "link": "https://betternews.app/api/news/open?id=1839",
      "image": null,
      "votes": 1,
      "shares": 0,
      "impressions": 2,
      "_count": { "Views": 1, "Comments": 1, "Notes": 0 },
      "created_at": "2026-06-07T15:00:20.879Z",
      "updated_at": "2026-06-07T15:21:39.987Z",
      "related_articles": [
        { "id": 132, "headline": "Trump and Putin Agree to Start Ukraine Peace Talks",
          "source": { "name": "BBC", "credibility": 7 }, "_count": { "Views": 16 } }
      ]
    }
  ]
}
```

Outcome shapes:
- **Results found** — `status: "OK"`, `data` is a non-empty array (≤15 per page). Newest first.
- **No matches** — `status: "OK"`, `data: []` (e.g. a keyword/topic/country combo with nothing to show).
- **Filter vocabulary** (topics/countries/sources endpoints) — `{ status: "OK", data: { topics | countries: [...] } }` or `{ status: "OK", data: [ {id,name,credibility} ] }` for sources.

If you must report failure (e.g. the endpoint shape changed), return `{ "success": false, "error_reasoning": "<what broke>" }`.
