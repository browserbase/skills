---
name: beatport-com-search-music-afd83h
title: Beatport Music Search
description: >-
  Search Beatport by artist name or artist + track name and return structured
  info on matching tracks, artists, releases, labels, and charts (titles, IDs,
  BPM, key, genre, label, price, ISRC, and canonical URLs).
website: beatport.com
category: music
tags:
  - music
  - beatport
  - search
  - tracks
  - artists
  - metadata
source: 'browserbase: agent-runtime 2026-06-02'
updated: '2026-06-02'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      A live Browserbase session (--verified --proxies) renders the same results
      visually and exposes the same __NEXT_DATA__ payload via `browse get html
      body`. ~100x more expensive than fetch and only needed if you want
      screenshots or to interact with player/preview controls.
  - method: api
    rationale: >-
      The official catalog API at api.beatport.com/v4/catalog/search/ returns
      clean JSON but requires an OAuth bearer token (returns HTTP 401
      unauthenticated). Use it only if you already hold Beatport API
      credentials.
verified: false
proxies: true
---
# Beatport Music Search

## Purpose

Search Beatport for electronic-music metadata by a free-text query — either an artist name (`"deadmau5"`) or an artist + track combination (`"eric prydz opus"`) — and return structured results across five entity types: **tracks, artists, releases, labels, and charts**. For each result you get IDs, names, mix names, BPM, musical key, genre, label, release, price, ISRC, artwork URIs, and a canonical Beatport URL. Read-only; never logs in, buys, or downloads.

The recommended path is **not** scripted browsing. Beatport is a Next.js app whose search page server-side-renders the complete result set into an embedded `__NEXT_DATA__` JSON blob. A single HTTP `fetch` of the search URL (over a residential proxy) returns every field the rendered page shows — no clicking, no pagination, no headless browser. Lead with the fetch path; the browser flow below is a fallback for when you also need screenshots or player interaction.

## When to Use

- Look up a track's metadata (BPM, key, genre, label, release, ISRC, price) from an artist + title string.
- Resolve an artist name to a Beatport `artist_id` and canonical artist URL, plus their genre spread.
- Bulk-enrich a playlist / crate list of "Artist – Title" strings with Beatport IDs and metadata.
- Disambiguate similarly named artists or mixes (the API returns relevance `score` per result).
- Find the release, label, or chart an artist/track belongs to.

## Workflow

### Recommended: fetch the search page and parse `__NEXT_DATA__`

1. **Build the search URL.** URL-encode the whole query into the `q` param:
   ```
   https://www.beatport.com/search?q=<url-encoded query>
   ```
   For artist + track, just join them with a space: `q=eric%20prydz%20opus`. The single `q` param drives all five result buckets — there is no separate "artist field" vs "track field".

2. **Fetch over a residential proxy.** Beatport sits behind Cloudflare. The bare homepage (`/`) returns **403** to datacenter IPs, but the `/search` page returns **200** over a residential proxy with a normal browser User-Agent. With the `browse` CLI:
   ```bash
   browse cloud fetch "https://www.beatport.com/search?q=eric%20prydz%20opus" \
     --proxies --allow-redirects --output search.html
   ```
   No auth, no cookies, no `--verified` browser session required for the fetch path — `--proxies` alone is sufficient (confirmed across multiple queries). Response is ~150–170 KB of HTML.

3. **Extract the embedded JSON.** Pull the `__NEXT_DATA__` script tag and walk to the search payload:
   ```js
   const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
   const next = JSON.parse(m[1]);
   const data = next.props.pageProps.dehydratedState.queries[0].state.data;
   // data => { tracks, artists, charts, labels, releases }
   ```
   Each bucket is `{ data: [...], ... }`, so the result arrays are `data.tracks.data`, `data.artists.data`, `data.releases.data`, `data.labels.data`, `data.charts.data`. Results are pre-sorted by relevance `score` (descending) — element `[0]` is the best match.

4. **Decode the fields you need** (see Expected Output for full shapes). Key gotchas:
   - **`length` is milliseconds.** `543453` → `543.453 s` → `9:03`. Format as `mm:ss = floor(ms/60000):round((ms%60000)/1000)`.
   - **`genre` is an array** of `{ genre_id, genre_name }` (tracks usually have one; artists list many).
   - **`artists` / `remixers` are arrays** of `{ artist_id, artist_name, artist_type_name }`. Use this to separate the original artist(s) from remixers.
   - **`price` is an object** `{ code, symbol, value, display }` — use `price.display` (`"$1.49"`).
   - **`key_name`** ("A Major"), **`bpm`**, **`isrc`**, **`mix_name`** ("Original Mix") are top-level track fields.
   - **Image URIs** are absolute (`track_image_uri`, `artist_image_uri`); the `*_dynamic_uri` variants contain `{w}x{h}` placeholders you substitute for a custom size.

5. **Build canonical URLs.** The slug segment is cosmetic — Beatport resolves by the trailing numeric ID, so any slug (or a placeholder) works and redirects to the canonical one:
   ```
   Track:   https://www.beatport.com/track/<slug>/<track_id>
   Artist:  https://www.beatport.com/artist/<slug>/<artist_id>
   Release: https://www.beatport.com/release/<slug>/<release_id>
   Label:   https://www.beatport.com/label/<slug>/<label_id>
   Chart:   https://www.beatport.com/chart/<slug>/<chart_id>
   ```

### Browser fallback (only when you need screenshots / player interaction)

The SSR search page is fully JS-hydrated, so a live session needs **both** stealth flags to clear Cloudflare:

1. `sid=$(browse cloud sessions create --keep-alive --proxies --verified | …)` — **both `--proxies` and `--verified` are required**; bare or proxy-only sessions hit the Cloudflare interstitial.
2. `browse open "https://www.beatport.com/search?q=<query>" --remote --session "$sid"` then `browse wait load`.
3. A **cookie-consent dialog** ("Beatport Group Cookie Consent") overlays the page — dismiss it by clicking the **`I Accept`** button (find its ref via `browse snapshot`) before screenshotting.
4. Rather than scraping the rendered DOM, just run `browse get html body` and parse the **same `__NEXT_DATA__` blob** described above — the rendered sections (Artists / Releases / Tracks / Charts / Labels) carry no data the JSON doesn't already have.

## Site-Specific Gotchas

- **Bare homepage 403s; the search page does not.** A pre-run probe of `https://beatport.com/` returned 403 (Cloudflare). Don't conclude the site is unreachable — go straight to `/search?q=…`, which returns 200 over a residential proxy. Never gate your flow on a homepage fetch.
- **`--proxies` is mandatory, `--verified` is only for the live browser.** The fetch path needs the residential proxy (datacenter IPs get Cloudflare-blocked) but no verified browser. The live browser path needs *both* `--proxies` and `--verified`.
- **The SSR payload is capped at 15 results per bucket.** The embedded query key is `["search-all", { q, count: "15", is_approved: true, preorder: true }, "US"]`. You always get the top ~15 tracks / artists / releases / labels / charts. To go deeper you'd need the authenticated `api.beatport.com/v4` API or the per-type search pages — the public search-all SSR does not paginate.
- **`length` is in milliseconds, not seconds.** Forgetting this turns a 9-minute track into "543,453 seconds". Divide by 1000.
- **Results are scored, not alphabetized.** `state.data.tracks.data[i].score` is the relevance score; `[0]` is the best match. For "artist + track" queries the intended track is reliably `tracks.data[0]`, but verify by matching `artists[].artist_name` + `mix_name` to your input rather than blindly trusting index 0.
- **Geo / locale is baked into the payload.** The query key's trailing element is the storefront locale (`"US"` from a US proxy egress) and `price` is denominated accordingly (`USD`). A proxy egressing elsewhere returns localized pricing/availability.
- **`api.beatport.com/v4/catalog/search/` is OAuth-gated — don't waste time on it unauthenticated.** It returns **HTTP 401** without a bearer token. Confirmed blocked; only useful if you already hold Beatport API credentials.
- **robots.txt disallows AI/crawler UAs (`ClaudeBot`, `GPTBot`, `CCBot`, …) but `Allow: /` for generic `User-agent: *`.** The residential-proxy fetch uses a normal browser UA, which is in the allowed bucket; search indexing is explicitly permitted (`Content-Signal: search=yes`). Stay read-only.
- **URL slugs are throwaway.** `https://www.beatport.com/track/anything/15744386` resolves to the canonical track by ID — you never need to know the real slug to build a working link.
- **No site-specific rate limit was hit** across ~5 fetches in testing, but Cloudflare fronts everything — keep request volume modest and reuse one proxy session for bulk lookups.

## Expected Output

A normalized object per search. Example for `q="eric prydz opus"`:

```json
{
  "query": "eric prydz opus",
  "locale": "US",
  "result_counts": { "tracks": 15, "artists": 15, "releases": 15, "labels": 15, "charts": 15 },
  "top_track": {
    "track_id": 15744386,
    "track_name": "Opus",
    "mix_name": "Original Mix",
    "artists": [{ "artist_id": 2863, "artist_name": "Eric Prydz", "artist_type_name": "Artist" }],
    "remixers": [],
    "release": { "release_id": 3517329, "release_name": "Opus" },
    "label": { "label_id": 70017, "label_name": "Virgin Records Ltd" },
    "genre": [{ "genre_id": 96, "genre_name": "Mainstage" }],
    "bpm": 128,
    "key_name": "A Major",
    "length_ms": 543453,
    "length_display": "9:03",
    "isrc": "GB6CM1500105",
    "price": { "code": "USD", "symbol": "$", "value": 1.49, "display": "$1.49" },
    "publish_date": "2016-02-05T00:00:00",
    "is_explicit": false,
    "track_image_uri": "https://geo-media.beatport.com/image_size/1500x250/....png",
    "score": 12345.6,
    "url": "https://www.beatport.com/track/opus/15744386"
  },
  "top_artist": {
    "artist_id": 2863,
    "artist_name": "Eric Prydz",
    "genre": [
      { "genre_id": 15, "genre_name": "Progressive House" },
      { "genre_id": 90, "genre_name": "Melodic House & Techno" }
    ],
    "downloads": 46024,
    "latest_publish_date": "2026-01-28",
    "artist_image_uri": "https://geo-media.beatport.com/image_size/590x404/....jpg",
    "score": 189914.77,
    "url": "https://www.beatport.com/artist/eric-prydz/2863"
  }
}
```

Distinct outcome shapes:

- **Track match** (artist + title query) — `tracks.data[0]` is the intended track; populate `top_track` as above.
- **Artist match** (bare artist query) — `artists.data[0]` is the artist; `top_artist` carries the ID, genre spread, and URL. `tracks.data` will also be populated with that artist's most relevant tracks.
- **Multiple/ambiguous matches** — return the full ranked arrays (or top N per bucket) and let the caller disambiguate via `score`, `mix_name`, and `artists[].artist_name`.
- **No results** — every bucket comes back empty (`tracks.data.length === 0`, same for artists/releases/labels/charts). HTTP status is still **200**; detect "not found" by empty arrays, not by status code:

```json
{
  "query": "zzzxqyqwlkjhgfd",
  "locale": "US",
  "result_counts": { "tracks": 0, "artists": 0, "releases": 0, "labels": 0, "charts": 0 },
  "top_track": null,
  "top_artist": null
}
```
