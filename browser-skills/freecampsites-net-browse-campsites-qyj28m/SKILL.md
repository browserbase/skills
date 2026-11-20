---
name: freecampsites-net-browse-campsites-qyj28m
title: Browse Free Campsites Near a Location
description: >-
  Search freecampsites.net for the 20 nearest campsites / free dispersed camping
  spots around a place and return structured records (name, free/fee status,
  rating, review count, distance, coordinates, and detail URL).
website: freecampsites.net
category: travel
tags:
  - camping
  - travel
  - campsites
  - outdoors
  - search
  - geolocation
source: 'browserbase: agent-runtime 2026-06-04'
updated: '2026-06-04'
recommended_method: hybrid
alternative_methods:
  - method: browser
    rationale: >-
      Pure UI flow: fill the location box, pick the autocomplete suggestion,
      read the rendered results column. Slower and noisier than the in-page JSON
      call, but resilient if the endpoint shape changes.
  - method: api
    rationale: >-
      androidApp.php?location=<place> returns the same JSON, but only with an
      X-Requested-With XMLHttpRequest header from the site origin; a bare
      server-side GET (incl. browse cloud fetch --proxies) returns an empty
      body. A bare HTTP client that sets X-Requested-With + Referer may work but
      was not verifiable from the build sandbox.
verified: true
proxies: true
---
# Browse Free Campsites Near a Location

## Purpose

Return the list of campsites and dispersed/free camping spots that freecampsites.net knows about near a given place. For each result you get a structured record — name, listing type, free/fee status, average star rating, review/vote count, distance from the search center, latitude/longitude, the canonical detail-page URL, and a short excerpt. Read-only: this skill only searches and reads listings; it never logs in, adds a site, posts a review, or edits anything.

## When to Use

- "Find free / cheap campsites near {city or area}" or "what dispersed camping is around {place}".
- Building a list of nearby camping options (with coordinates and ratings) for a trip near a US location.
- Any time you'd otherwise scrape the freecampsites.net map UI — the underlying JSON endpoint returns the same data, already structured, in a single request.

## Workflow

freecampsites.net is a Leaflet + AngularJS single-page app on top of WordPress. Its map/search UI is a thin client over a **same-origin JSON endpoint**, so the fastest reliable path is *hybrid*: drive a real browser to the site's origin (so the request carries the right `Referer`, cookies, and an `XMLHttpRequest` header), then call the data endpoint directly from page context and parse JSON. This skips all DOM scraping. A pure server-side HTTP GET does **not** work (see Gotchas).

### Recommended path (hybrid: browser origin + in-page fetch)

1. Open a Browserbase session with stealth on and navigate to the origin:
   ```
   browse open https://freecampsites.net/ --remote
   browse wait timeout 3000 --remote
   ```
   Confirm it loaded: `browse get title` should return `freecampsites.net`. If you get `ERR_HTTP2_PROTOCOL_ERROR` / "This site can't be reached", retry the open (see Gotchas — it is intermittent).

2. Call the search endpoint from page context with `browse eval`. The `location` param is a free-form place string; the server geocodes it itself:
   ```js
   (async () => {
     const place = "Bend, Oregon";                       // <-- the location to search near
     const u = "/wp-content/themes/freecampsites/androidApp.php?location=" + encodeURIComponent(place);
     const r = await fetch(u, { headers: {
       "X-Requested-With": "XMLHttpRequest",
       "Accept": "application/json"
     }});
     const j = JSON.parse((await r.text()).trim());        // body has leading newlines — trim before parse
     return {
       location: place,
       search_center: { lat: Number(j.latitude), lon: Number(j.longitude) },
       result_count: j.resultList.length,
       campsites: j.resultList.map(s => ({
         id: s.id,
         name: s.name,
         type: s.type,                                     // "campsite"
         fee: s.type_specific && s.type_specific.fee,      // "Free", "Fee", ...
         rating: s.ratings_average,                        // numeric, e.g. 3.33
         review_votes: s.ratings_count,                    // integer
         distance_mi: s.distance,
         lat: s.latitude, lon: s.longitude,
         city: s.city, county: s.county, region: s.region, country: s.country,
         excerpt: s.excerpt,
         url: s.url                                        // canonical detail page
       }))
     };
   })()
   ```

3. Emit the returned object. That is the complete result for the location (the endpoint returns the **20 nearest** sites — see Gotchas).

### Browser fallback (pure UI — use only if the endpoint shape changes)

1. `browse open https://freecampsites.net/ --remote`, then `browse snapshot`.
2. Click the "Enter a Location" search box and fill it. Use `browse fill <ref> "Bend, Oregon"` with the value **quoted** — do not use `browse type Bend, Oregon` (the unquoted comma is parsed as a second argument: `Error: Unexpected argument: Ore`).
3. `browse snapshot`, then click the matching autocomplete suggestion (e.g. `Bend, Oregon, United States`). The suggestions come from `suggest.php` (a Photon geocoder).
4. `browse wait timeout 3000`, then `browse snapshot`. The results column on the right populates (~620–660 accessibility refs). Read each listing's name, star rating, distance, and review count from the rendered cards. The per-site detail link is `https://freecampsites.net/#!<id>&query=sitedetails` (or the clean permalink `s.url`).

## Site-Specific Gotchas

- **The data endpoint requires a same-origin XHR context.** `GET /wp-content/themes/freecampsites/androidApp.php?location=<place>` returns the full result set **only** when sent with the `X-Requested-With: XMLHttpRequest` header from the freecampsites.net origin (correct `Referer`/cookies). A bare server-side fetch — including `browse cloud fetch` with `--proxies` — returns an empty body (just ~20 newline characters, HTTP 200). That is why this skill is hybrid, not pure-API. (A bare HTTP client that sets `X-Requested-With` + `Referer` *might* work, but this was not verifiable from the build sandbox — treat it as unconfirmed.)
- **`location` is the only param you need.** The server geocodes the free-form `location` string on its own. The `coordinates=` and `advancedSearch={}` params that the UI also sends are optional and had **no effect** on results in testing (passing `coordinates=38.57,-109.55` vs the place name returned identical output). Do not waste time trying to drive the search by raw lat/lon through `coordinates=`.
- **Don't use `?region=`.** An older code path / `?region=<lat,lon>` returns an empty body. Use `?location=<place name>`.
- **Results are capped at the 20 nearest sites.** The response always returned exactly 20 items; no paging/limit parameter was found. To cover a wider area, issue multiple searches at different `location` anchors and de-duplicate by `id`.
- **Ratings are already structured — don't parse the HTML.** Each item has `ratings_average` (float) and `ratings_count` (vote count) as clean fields. The `rating` and `table_row` fields are pre-rendered HTML (star `<img>` tags); ignore them.
- **Fee/free status lives in `type_specific.fee`** ("Free", "Fee", etc.), not at the top level.
- **Response body has leading whitespace.** The JSON is preceded by ~20 newlines and served as `Content-Type: text/html`. Always `.trim()` before `JSON.parse`.
- **Intermittent `ERR_HTTP2_PROTOCOL_ERROR`.** Through Browserbase, freecampsites.net periodically fails to load (Chrome "This site can't be reached", `ERR_HTTP2_PROTOCOL_ERROR` or `ERR_FAILED`) — both on page navigation and on the in-page XHR — especially under repeated/rapid access from one IP. Early in a session it was rock-solid (the search succeeded across multiple sessions); it degraded later. Mitigation: retry the `browse open` (and the fetch) a couple of times; a fresh session usually recovers. `--verified --proxies` was used for all successful runs.
- **Autocomplete vs. data call are different endpoints.** `suggest.php?q=<text>&limit=5&bb=<viewport-bbox>` is the Photon geocoder used for the search-box dropdown. You do **not** need it for the data call — `androidApp.php?location=` geocodes by itself.
- **reCAPTCHA exists but is irrelevant here.** It only gates add-a-site / login / review posting (`outbound`, `wdpajax-*` forms). Searching and reading listings never triggers it.
- **`robots.txt` disallows `/outbound`, `*query=routeSearch*`, and `_escaped_fragment_` crawl URLs** — none of which the search-by-location flow touches.

## Expected Output

```json
{
  "location": "Bend, Oregon",
  "search_center": { "lat": 44.0582, "lon": -121.315 },
  "result_count": 20,
  "campsites": [
    {
      "id": 178001,
      "name": "Deschutes Dispersed site",
      "type": "campsite",
      "fee": "Free",
      "rating": 3.33,
      "review_votes": 18,
      "distance_mi": 4,
      "lat": 44.06489,
      "lon": -121.41173,
      "city": "Bend",
      "county": "Deschutes County",
      "region": "Oregon",
      "country": "United States",
      "excerpt": "A dispersed site about a quarter mile off the main Forest road just within the Forest boundary. Close to biking trails. Accessible to most vehicles.",
      "url": "https://freecampsites.net/deschutes-dispersed-site/"
    }
  ]
}
```

Failure / empty shapes:

```json
{ "location": "Nowhere, Atlantis", "search_center": null, "result_count": 0, "campsites": [] }
```

```json
{ "error": "site_unreachable", "detail": "ERR_HTTP2_PROTOCOL_ERROR on freecampsites.net — retry the session/open." }
```
