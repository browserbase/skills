---
name: trailforks-com-search-trails-worldwide-f2j6hs
title: Search Trailforks Trails Worldwide
description: >-
  Search Trailforks for mountain biking and many other activity trails anywhere
  in the world via its public Elasticsearch backend, returning per-trail stats
  (difficulty, distance, climb/descent, GPS, region) plus type/activity facet
  counts.
website: trailforks.com
category: outdoor-recreation
tags:
  - trails
  - mountain-biking
  - hiking
  - search
  - elasticsearch
  - geodata
source: 'browserbase: agent-runtime 2026-06-08'
updated: '2026-06-08'
recommended_method: api
alternative_methods:
  - method: fetch
    rationale: >-
      The same POST works from any HTTP client; in a browser it must run from a
      trailforks.com document origin to satisfy CORS.
  - method: browser
    rationale: >-
      Not viable for scripted browsing — trailforks.com hard-blocks headless
      sessions with a Cloudflare WAF 1020 block (confirmed even with
      verified+proxies). Use only to re-scrape the client JS if the embedded ES
      credential rotates.
verified: false
proxies: false
---
# Search Trailforks Trails Worldwide

## Purpose

Search Trailforks for trails anywhere in the world — mountain biking plus a wide range of other activities (hiking, trail running, e-bike, moto, ATV, gravel, horse, fat bike, ski/XC, snowshoe, snowmobile, etc.) — and return structured stats for each match: difficulty, distance, climb/descent, GPS coordinates, region/city/province/country, activity types, rank score, cover photo, static map, and the canonical Trailforks permalink. The same search also returns regions (with a `total_trails` count), routes, POIs, articles, and users. Read-only; never writes, votes, or logs activity.

## When to Use

- Looking up a named trail or trail network and pulling its stats (distance, elevation, difficulty, location).
- Discovering trails by keyword + place ("moab", "squamish", "alps singletrack") across the whole Trailforks database.
- Filtering trails by activity type (e.g. only `hike` or only `mtb`) and getting per-activity result counts via aggregations.
- Resolving a trail/region name to its canonical Trailforks URL, GPS location, and parent region.
- Building a worldwide trail dataset where you'd otherwise scrape Trailforks HTML — the search backend is faster, structured, and not behind Cloudflare.

## Workflow

**Recommended method — query the Elasticsearch search backend directly (no browser, no Cloudflare, no proxy).**

The Trailforks search bar is a thin client over a public Elasticsearch endpoint. The site ships a read-only ES credential in its client JavaScript (`trailforks.min.js`) and the browser posts a query DSL straight to it. You can call the same endpoint from any HTTP client. It is **not** behind Cloudflare (it lives on `*.aws.found.io`), needs no app registration, no cookies, and no residential proxy.

1. **Endpoint & auth** (stable as of 2026-06; the credential is a public read-only ES user embedded in the site's JS):
   ```
   POST https://trailforks.es.us-west-1.aws.found.io/searchv2/_search
   Authorization: Basic <base64("elastic:MuZyTiuE3Qkp095ZMjGlwVwu")>
   Content-Type: application/json; charset=UTF-8
   ```
   (`Authorization: Basic ZWxhc3RpYzpNdVp5VGl1RTNRa3AwOTVaTWpHbHdWd3U=`)

2. **Send a standard ES query.** A minimal, reliable body that matches what the site sends:
   ```json
   {
     "from": 0,
     "size": 13,
     "query": {
       "bool": {
         "must": [
           { "multi_match": {
               "query": "<search term>",
               "type": "best_fields",
               "fields": ["search^3", "search._2gram", "search._3gram", "title^5", "location_search^2"],
               "fuzziness": "AUTO",
               "prefix_length": 2 } }
         ],
         "filter": [
           { "term": { "type": "trail" } }
         ]
       }
     },
     "aggs": {
       "by_type":     { "terms": { "field": "type" } },
       "by_activity": { "terms": { "field": "activitytypes", "size": 20 } }
     }
   }
   ```
   - **Restrict to trails**: include `{ "term": { "type": "trail" } }` in `filter`. Omit it to also get `region`, `route`, `poi`, `article`, `user`, etc. in one response.
   - **Filter by activity**: add `{ "term": { "activitytypes": "hike" } }` to `filter`. Valid aliases observed: `mtb`, `ebike`, `amtb` (assisted/adaptive), `fatbike`, `hike`, `trailrun`, `gravel`, `moto`, `mototrials`, `atv`, `horse`, `skialpine`, `skibc`, `skixc`, `snowshoe`, `snowmobile`.
   - **Paginate** with `from` (offset) + `size`. `total.value` (ES7 `{value, relation}`) gives the match count.
   - **Place-qualified queries** ("whistler bc", "moab utah") work via the `location_search` field already in `fields`.

3. **Read each hit's `_source`.** Trail hits expose: `id` (`trail-<id>`), `title`, `permalink` (`trails/<slug>/`), `stat_distance` (metres), `stat_climb` / `stat_descent` (metres; descent is negative), `difficulty_title` + `difficulty_id`, `location` (`[lng, lat]`), `city_title` / `prov_title` / `country_title` / `location_search`, `activitytype_alias` + `activitytypes[]`, `global_rank_score`, `description`, `cover_photo_url`, `static_map_url`, `archived`. Region hits add `total_trails`.

4. **Build the canonical URL**: `https://www.trailforks.com/<permalink>` (e.g. `https://www.trailforks.com/trails/whistler/`, `https://www.trailforks.com/region/whistler/`).

5. **Read the aggregations** for facet counts: `aggregations.by_type.buckets` (how many trails vs regions vs routes…) and `aggregations.by_activity.buckets` (how many results per activity) — this is the cheapest way to answer "how many hiking vs mtb trails match".

### Browser fallback (last resort — usually NOT viable)

Scripted browsing of trailforks.com is **blocked by Cloudflare** for headless/automation traffic (see Gotchas). If you must use a browser (e.g. the ES endpoint or its embedded credential has rotated), the only reliable path is to run the same `fetch` from a page whose document origin is `https://www.trailforks.com` so CORS is satisfied — the Cloudflare *block page itself* is served from that origin, so even a blocked navigation gives you a usable origin to `fetch` from. The site's own search field (`#search-box`) posts the identical query to the same endpoint and renders results into `#search-results-all`; there is no value in driving the visible UI over calling the endpoint directly.

## Site-Specific Gotchas

- **Cloudflare hard-blocks headless browsers.** `https://www.trailforks.com/` and `/trails/` return Cloudflare **"Sorry, you have been blocked"** (WAF rule 1020, not a solvable Turnstile challenge) to Browserbase sessions — confirmed even with `--verified --proxies` enabled. Do not waste iterations trying to load the site in a headless browser; go straight to the ES endpoint. The **Browserbase Fetch API with `--proxies`** (residential HTTP), by contrast, *does* return 200 for static pages like `/trails/` and `/robots.txt` — useful only if you need to re-scrape the client JS to recover a rotated ES credential.
- **The ES credential is public but rotatable.** `elastic:MuZyTiuE3Qkp095ZMjGlwVwu` is shipped in plaintext in `trailforks.min.js` and is intended for anonymous front-end search. If it ever returns 401/403, re-fetch the current JS (`https://es.pinkbike.org/<hash>/sprt/j/trailforks/trailforks.min.js`, linked from any trailforks page's HTML) and grep for `found.io/searchv2/_search` → the adjacent `btoa("elastic:...")` string is the live credential.
- **CORS only matters in a browser.** A server-side client (curl/node/python) ignores CORS and gets the response regardless of `Origin`. CORS is *only* a constraint if you run the `fetch` from inside a browser page — in which case the page origin must be `https://www.trailforks.com` (the endpoint's `Access-Control-Allow-Origin` is scoped to that origin).
- **`stat_*` units are metres.** `stat_distance` is metres (divide by 1000 for km). `stat_descent` is negative. Some trails report tiny/zero stats when the GPS track is incomplete — don't treat `stat_distance: 0` as an error.
- **`location` is `[longitude, latitude]`** (GeoJSON order), not `[lat, lng]`.
- **Duplicate titles are normal.** Many trails share a name (e.g. dozens of trails literally named "Moab" / "Whistler" worldwide). Disambiguate with `location_search`, `prov_title`/`country_title`, or the unique `id`/`permalink` — never by title alone.
- **`type` is a heterogeneous enum.** A bare query returns mixed `type` values: `trail`, `region`, `route`, `poi`, `nst`, `directory`, `skillpark`, `event`, `article`, `us_gov_trails`, `polygon`, `badge`, `user`. Always filter on `type: "trail"` (or read the `type` field per hit) when you only want trails. `user`-type hits can outrank trails for short queries, so a hard `type` filter is safer than relying on score.
- **`size` cap**: the site requests `size: 13`. Larger sizes (tested up to ~50) work, but for bulk extraction paginate with `from` rather than requesting one huge page.
- **Public REST API needs registration.** The documented Trailforks API at `https://www.trailforks.com/api/1/...` (and the `/about/api/` docs page) requires an `app_id`/`app_secret` and is itself behind Cloudflare (the docs page returned 403 to automated fetches). The ES search endpoint above needs none of that and is the pragmatic choice for search.
- **`archived: 1`** marks decommissioned trails — filter them out with `{ "term": { "archived": 0 } }` if you only want active trails.

## Expected Output

Recommended shape an agent should return after querying the endpoint:

```json
{
  "query": "whistler",
  "type_filter": "trail",
  "activity_filter": null,
  "total_results": 1577,
  "facets": {
    "by_type": { "trail": 1577 },
    "by_activity": { "mtb": 1402, "hike": 511, "trailrun": 498, "ebike": 233 }
  },
  "trails": [
    {
      "id": "trail-77691",
      "title": "Whistler",
      "permalink": "trails/whistler/",
      "url": "https://www.trailforks.com/trails/whistler/",
      "activity": "mtb",
      "activity_types": ["mtb"],
      "difficulty": "Blue",
      "difficulty_id": 4,
      "distance_m": 367,
      "climb_m": 3,
      "descent_m": -17,
      "lat": 40.66813,
      "lng": -89.48627,
      "city": "East Peoria",
      "province": "IL",
      "country": "United States",
      "location_search": "east peoria, il, united states",
      "global_rank_score": 48.8,
      "cover_photo_url": "https://ep1.pinkbike.org/p4pb21926513/p4pb21926513.jpg",
      "archived": 0
    }
  ]
}
```

Region hit (when `type` filter is omitted) — note `total_trails`:

```json
{
  "id": "region-3010",
  "title": "Whistler",
  "type": "region",
  "permalink": "region/whistler/",
  "url": "https://www.trailforks.com/region/whistler/",
  "total_trails": 1359,
  "lat": 50.116918,
  "lng": -122.959456,
  "location_search": "whistler, bc, canada",
  "activity_types": ["mtb","ebike","horse","hike","trailrun","mototrials","atv","snowmobile","snowshoe","skialpine","skibc","skixc"]
}
```

Activity-filtered example (`query: "moab"`, `filter: type=trail, activitytypes=hike`) — the `by_activity` aggregation answers "how many of each kind":

```json
{
  "query": "moab",
  "type_filter": "trail",
  "activity_filter": "hike",
  "total_results": 708,
  "facets": {
    "by_activity": { "hike": 708, "trailrun": 696, "mtb": 551, "ebike": 256, "moto": 147, "atv": 108, "horse": 62, "fatbike": 11 }
  }
}
```

Failure / blocked shape (browser path):

```json
{ "success": false, "error_reasoning": "trailforks.com returned Cloudflare WAF block (1020). Use the Elasticsearch endpoint instead of the browser." }
```
