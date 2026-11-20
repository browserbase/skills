---
name: images-nasa-gov-search-image-npltef
title: NASA Images Search
description: >-
  Search NASA's Image and Video Library for images, videos, or audio by
  free-text query, filters (center, keywords, photographer, year range,
  location, album), or known NASA asset ID, returning each match's metadata and
  direct URLs to every file rendition. Read-only.
website: images.nasa.gov
category: media
tags:
  - nasa
  - images
  - media
  - space
  - search
  - public-api
  - read-only
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      Only useful when the JSON API is unreachable or you specifically need a
      screenshot of the rendered SPA search page. The browser path is ~100x more
      expensive per query because the SPA at images.nasa.gov calls the same JSON
      API under the hood, while browse snapshot of /search?q=... returns 0
      listing refs (fully JS-hydrated cards).
verified: false
proxies: false
---
# NASA Images Search

## Purpose

Search NASA's Image and Video Library for media (images, videos, audio) matching a free-text query, filters (center, keywords, photographer, year range, location, album), or a known NASA asset ID, and return each match's title, description, NASA ID, date, capture center, media type, and direct URLs to every rendition (thumb/small/medium/large/original for images; mp4/mov/srt for videos). Read-only — never uploads, edits, or comments.

## When to Use

- Find photos / videos for a topic (e.g. "Apollo 11", "Mars Perseverance", "Hubble nebula") for use in articles, slide decks, or downstream image-analysis pipelines.
- Resolve a known `nasa_id` (e.g. `PIA23591`, `as11-40-5874`) to its full set of file renditions and EXIF metadata.
- Enumerate an entire NASA album (e.g. `Mars_2020_Perseverance`) page by page.
- Bulk-build image datasets filtered by capture center (JSC, JPL, KSC, GSFC, HQ, …), photographer, or year range.
- Anywhere you'd otherwise scrape `images.nasa.gov` — the public JSON API is faster, cheaper, fully unauthenticated, and structurally more reliable.

## Workflow

The NASA Image and Video Library web UI at `https://images.nasa.gov` is a thin React SPA over a fully public JSON API at `https://images-api.nasa.gov`. **No API key, no auth, no cookies, no `Referer` header, no User-Agent gating, no Verified, and no residential proxy.** A plain HTTPS GET from any IP works. Lead with the API; only fall back to the browser UI if you specifically need to capture an on-page screenshot of the search-results page itself. The browser path is ~100× more expensive for the same data because the SPA hydrates the same JSON endpoint behind a fully JS-rendered page (`browse snapshot` of `/search?q=...` returns 0 listing refs).

1. **Build the search URL**. Base path: `https://images-api.nasa.gov/search`. Compose any combination of these query params (at least one filter is required — see gotcha below):

   | Param | Meaning | Notes |
   |---|---|---|
   | `q` | Free-text query | Searches title + description + keywords. Space → `%20` or `+`. |
   | `media_type` | `image`, `video`, `audio`, or comma-separated list | e.g. `media_type=image,video`. Omit to search all types. |
   | `center` | NASA capture center | Three-letter code: `JSC`, `JPL`, `KSC`, `GSFC`, `HQ`, `MSFC`, `LRC`, `ARC`, `AFRC`, `SSC`, `GRC`. Case-sensitive uppercase. |
   | `keywords` | Comma-separated keyword list | Matches against `data[0].keywords`. |
   | `location` | Capture location | Free text, e.g. `Kennedy Space Center`. Matches against `data[0].location`. |
   | `photographer` | Primary photographer | e.g. `NASA/Bill Ingalls`. URL-encode the `/`. |
   | `secondary_creator` | Credit / agency | e.g. `NASA/JPL-Caltech`. |
   | `title` | Title-only substring | Narrower than `q`. |
   | `description` | Description substring | |
   | `description_508` | 508-compliant alt-text substring | |
   | `nasa_id` | Exact asset ID lookup | Single result. Equivalent to `/asset/{nasa_id}` for the metadata block only. |
   | `year_start`, `year_end` | Capture-year bounds | Inclusive, four-digit years (e.g. `year_start=2020&year_end=2023`). Filters against `date_created`. |
   | `page` | 1-based page number | Default `1`. |
   | `page_size` | Results per page | Default `100`. Server accepts up to several hundred; through `browse cloud fetch` the practical ceiling is ~600 because the 1 MB Fetch response cap kicks in around `page_size=700` (502 "response body exceeded 1MB"). Use 100 by default; raise only when you need fewer round-trips and have confirmed the response stays under 1 MB. |

2. **Issue the GET**:
   ```bash
   browse cloud fetch \
     "https://images-api.nasa.gov/search?q=apollo%2011&media_type=image&page_size=100"
   ```
   Response is JSON. The top-level shape is the NASA Collection+JSON envelope:
   ```json
   {
     "collection": {
       "version": "1.1",
       "href": "<echoed request URL>",
       "items": [ /* see step 3 */ ],
       "metadata": { "total_hits": 5881 },
       "links": [ { "rel": "next", "prompt": "Next", "href": "<next page URL>" } ]
     }
   }
   ```
   Read `collection.metadata.total_hits` for the result count and `collection.links[?rel==next].href` to drive pagination (see step 5).

3. **Decode each item**. `collection.items[]` is the result array. Each element has exactly three keys:
   - **`href`** — URL to the per-asset manifest (`https://images-assets.nasa.gov/{type}/{nasa_id}/collection.json`). This is the same payload `/asset/{nasa_id}` returns and lists *every* file rendition (originals + thumbnails + metadata.json + captions.srt).
   - **`data`** — single-element array; `data[0]` is the metadata object:
     ```json
     {
       "nasa_id": "PIA23591",
       "title": "Seeing the Mars 2020 Rover Off",
       "description": "On Feb. 11, 2020, ...",
       "description_508": "On Feb. 11, 2020, ...",   // alt-text variant, may be missing
       "media_type": "image",                          // or "video" / "audio"
       "center": "JPL",
       "date_created": "2020-02-12T00:00:00Z",
       "keywords": ["Mars 2020 Rover"],                // may be missing
       "album": ["Mars_2020_Perseverance"],            // may be missing
       "location": "Kennedy Space Center",             // may be missing
       "photographer": "NASA/Aubrey Gemignani",        // may be missing
       "secondary_creator": "NASA/JPL-Caltech"         // may be missing
     }
     ```
     **Only `nasa_id`, `title`, `media_type`, `center`, `date_created` are guaranteed present.** Everything else is optional — guard with `data[0].get(key, default)`.
   - **`links`** — array of file-rendition URLs **previewable on the search-results card**. For `media_type=image` items this is the full image set (`thumb`, `small`, `medium`, `large`, `orig`); for `media_type=video` items this contains only **thumbnail JPEGs + a `.srt` captions link** — to enumerate the actual `.mp4` / `.mov` video files you must call `/asset/{nasa_id}` (step 4). Each link looks like:
     ```json
     {
       "href": "https://images-assets.nasa.gov/image/PIA23591/PIA23591~medium.jpg",
       "rel": "alternate",      // or "preview" (thumb), "canonical" (orig), "captions" (.srt)
       "render": "image",        // null for captions
       "width": 1280,
       "height": 916,
       "size": 112000
     }
     ```
     The rendition suffix follows the pattern `{nasa_id}~{thumb|small|medium|large|orig}.{jpg|tif|png}`. The `~orig` file may be `.jpg`, `.png`, `.tif`, or `.tiff` depending on what was uploaded — read the `href`, don't assume `.jpg`.

4. **(Optional) Resolve full asset manifest for video files or EXIF metadata**:
   ```bash
   browse cloud fetch "https://images-api.nasa.gov/asset/PIA23591"
   ```
   Returns the same envelope but `items[]` is now one entry per *file* (all renditions + a `metadata.json` entry). Use this to:
   - Get the original-resolution video file URL (`.mp4` / `.mov`) for `media_type=video` items.
   - Get the path to the full EXIF + AVAIL metadata JSON (the entry whose `href` ends in `/metadata.json`).
   - Get the captions `.srt` URL.

   Companion lookup endpoints:
   - `https://images-api.nasa.gov/metadata/{nasa_id}` — returns `{"location": "<S3 URL>"}` redirector. Fetch the `location` URL to get the full EXIF block (camera make/model, dimensions, all `AVAIL:*` fields).
   - `https://images-api.nasa.gov/captions/{nasa_id}` — same redirector pattern, points to the `.srt` file for videos.
   - `https://images-api.nasa.gov/album/{album_name}` — returns the same `collection` envelope filtered to one album. Album names are **internal collection IDs** like `Mars_2020_Perseverance` or `KSC_50th_Anniversary`, not human-readable slugs — discover them by first running a search and reading `items[].data[0].album[]`.

5. **Paginate** when `total_hits > page_size`. Two equivalent paths:
   - Follow the server-provided next URL: `collection.links[?rel==next].href` (already includes the incremented `page`).
   - Or increment `page` yourself: `&page=2&page_size=100`. Pages are 1-indexed.

   When the response no longer contains a `links[].rel == "next"` entry you've reached the last page. Stop at `page * page_size >= total_hits` as a safety bound.

6. **Build the public web URL for a result** (for citing back to a user-facing page):
   ```
   https://images.nasa.gov/details/{nasa_id}
   ```
   This is the SPA detail page. The API returns no direct field for it — just construct from `nasa_id`. The URL renders for any valid NASA ID.

### Browser fallback

Use only when the JSON API is unreachable (extremely rare — no documented downtime in our trace, no rate-limit at 10 req/s) or when you specifically need a screenshot of the rendered search page:

1. Create a bare Browserbase session — no Verified, no proxies required. `images.nasa.gov` serves anonymous traffic without any anti-bot challenge.
   ```bash
   SID=$(browse cloud sessions create --keep-alive | jq -r '.id')
   ```
2. Navigate to `https://images.nasa.gov/search?q={query}&media_type=image` (the SPA's search URL accepts the same param shape).
3. Wait ~3 seconds for hydration, then `browse get html body` or `browse snapshot`.
4. **The page hits `https://images-api.nasa.gov/search?...` under the hood** — capture the XHR via `browser-trace` and parse the same JSON shape from step 3 above, or fall back to regex-scraping the rendered cards (`data-asset-id="<nasa_id>"` plus `.image-asset__image img[src]` for the thumbnail). Always prefer the captured XHR over the rendered cards — the cards render only the visible page.
5. Release: `browse cloud sessions update "$SID" --status REQUEST_RELEASE`.

## Site-Specific Gotchas

- **At least one search parameter is required.** Bare `GET /search` returns `400 {"reason": "Expected 'q' text search parameter or other keywords."}`. `media_type=image` alone counts ("228,163 image hits"); `q=` alone counts; any filter combination counts. Do not emit a bare `/search` request even as a probe.
- **`page_size` server limit vs. transport limit.** The API server itself accepts at least `page_size=600`. Through `browse cloud fetch`, requests with `page_size >= 700` (≈ 1 MB JSON) return `502 "response body exceeded the maximum allowed size of 1MB"` — that's the Fetch proxy, not NASA. Stick to `page_size=100` for general use; if you raise it, cap at 500 to stay safely under the Fetch limit, or switch to a browser session whose XHR isn't proxy-capped.
- **Most metadata fields are optional.** Only `nasa_id`, `title`, `media_type`, `center`, `date_created` are guaranteed. `keywords`, `album`, `location`, `photographer`, `secondary_creator`, `description`, `description_508` are all sometimes-absent. Always `.get(key)` with a default.
- **Video search results don't include the actual video file URLs.** For `media_type=video` items, `items[].links[]` contains only thumbnail JPEGs (`~thumb`, `~small`, `~medium`, `~large`) plus a `.srt` captions link. To get the `.mp4` / `.mov` original, you **must** call `/asset/{nasa_id}` in a follow-up request. Images, by contrast, ship all five renditions directly in the search response.
- **Original-image file extensions vary.** `{nasa_id}~orig` may be `.jpg`, `.png`, `.tif`, or `.tiff` (verified: `PIA23591~orig.jpg`, `NHQ201907190146~orig.tif`). Read the `href` from `links[].rel == "canonical"`; don't construct the URL from the nasa_id + assume `.jpg`.
- **Some `nasa_id` values contain literal spaces.** Video asset IDs like `NDTV000908_Apollo_Digest_Series_Spacecraft for Apollo` have unencoded spaces in their `href` URLs as returned by the API. When following these URLs, URL-encode the space (`%20`) or your HTTP client will reject the request.
- **`center` is case-sensitive uppercase.** `center=jpl` returns 0 hits; `center=JPL` returns thousands. The canonical codes are the three- or four-letter NASA center abbreviations (`JPL`, `JSC`, `KSC`, `GSFC`, `HQ`, `MSFC`, `LRC`, `ARC`, `AFRC`, `SSC`, `GRC`).
- **`media_type` accepts comma-separated lists.** `media_type=image,video` returns mixed results in the same response — branch downstream on `data[0].media_type` per item. There is no `media_type=all` toggle; omitting the param entirely is the "all types" search.
- **`year_start` / `year_end` filter against `date_created`, not upload date.** Some assets have a `date_created` decades before they were uploaded (e.g. Apollo-era photos uploaded in 2007). Filtering `year_start=2020` excludes them even if NASA published them in 2020.
- **Album names are internal collection IDs, not slugs.** `/album/apollo11` returns `404 {"reason": "No assets found for album=\"apollo11\" page=1"}`. The right name is something like `Apollo_11_50th_Anniversary` or `KSC_50th_Anniversary`. Discover the exact string by running a `/search?q=apollo+11&page_size=5` first and reading `items[].data[0].album[]`.
- **`/metadata/{nasa_id}` is a two-hop endpoint.** It returns `{"location": "<S3 URL>"}` — the actual EXIF block lives at that S3 URL (an `images-assets.nasa.gov/.../metadata.json`). Same pattern for `/captions/{nasa_id}` (returns `.srt` URL). Fetch the `location` to get the actual payload. There is no direct-content variant.
- **404 error bodies are JSON, not HTML.** `/asset/<bad-id>` → `{"reason": "No AssetDB records for nasaid=..."}`. `/album/<bad-name>` → `{"reason": "No assets found for album=\"...\" page=1"}`. Parse `reason` for human-readable failure messages.
- **No auth, no rate-limit observed, no anti-bot.** 10-request bursts from the same IP all returned 200 in our trace. NASA does not publish a documented rate-limit for this API; stay under ~10 req/s as a self-imposed politeness ceiling. No `Referer`, `User-Agent`, or cookies are checked.
- **`href` URLs may use `http://` (not `https://`).** Several response fields — notably the `/asset/{nasa_id}` item hrefs — return `http://images-assets.nasa.gov/...`. The same URLs work over HTTPS; upgrade the scheme client-side if you care about TLS.
- **Search SPA at `images.nasa.gov/search?...` returns 0 snapshot refs.** It's a JS-hydrated React app — `browse snapshot` after `wait load` shows the chrome but no per-result refs. Don't try to click cards; use the underlying API or capture the XHR.

## Expected Output

```json
{
  "query": "apollo 11",
  "filters": {
    "media_type": "image",
    "year_start": null,
    "year_end": null,
    "center": null,
    "page": 1,
    "page_size": 100
  },
  "total_hits": 5881,
  "page": 1,
  "page_size": 100,
  "next_page_url": "https://images-api.nasa.gov/search?q=apollo+11&media_type=image&page_size=100&page=2",
  "results": [
    {
      "nasa_id": "jsc2007e034221",
      "title": "Apollo 11 spacecraft pre-launch",
      "description": "Personnel atop the 402-ft. Mobile Service Structure look back at the Apollo 11 spacecraft as the tower is moved away during a Countdown Demonstration Test. Photo filed 11 July 1969.",
      "media_type": "image",
      "center": "JSC",
      "date_created": "1969-07-11T00:00:00Z",
      "keywords": ["Apollo", "Apollo 11", "Launch"],
      "album": ["KSC_50th_Anniversary"],
      "location": null,
      "photographer": null,
      "secondary_creator": null,
      "asset_manifest_url": "https://images-assets.nasa.gov/image/jsc2007e034221/collection.json",
      "details_url": "https://images.nasa.gov/details/jsc2007e034221",
      "renditions": {
        "thumb":  { "url": "https://images-assets.nasa.gov/image/jsc2007e034221/jsc2007e034221~thumb.jpg",  "width": 487,  "height": 640,  "size_bytes": 60000 },
        "small":  { "url": "https://images-assets.nasa.gov/image/jsc2007e034221/jsc2007e034221~small.jpg",  "width": 487,  "height": 640,  "size_bytes": 60000 },
        "medium": { "url": "https://images-assets.nasa.gov/image/jsc2007e034221/jsc2007e034221~medium.jpg", "width": 975,  "height": 1280, "size_bytes": 176000 },
        "large":  { "url": "https://images-assets.nasa.gov/image/jsc2007e034221/jsc2007e034221~large.jpg",  "width": 1463, "height": 1920, "size_bytes": 332000 },
        "orig":   { "url": "https://images-assets.nasa.gov/image/jsc2007e034221/jsc2007e034221~orig.jpg",   "width": 2341, "height": 3072, "size_bytes": 1402000 }
      }
    }
  ]
}
```

Video result variant (`media_type=video`) — note `renditions` contains only thumbnails + captions; fetch `asset_manifest_url` to enumerate the `.mp4`/`.mov` files:

```json
{
  "nasa_id": "NDTV000908_Apollo_Digest_Series_Spacecraft for Apollo",
  "title": "Apollo Digest Series — Spacecraft for Apollo",
  "media_type": "video",
  "center": "HQ",
  "date_created": "1967-01-01T00:00:00Z",
  "asset_manifest_url": "https://images-assets.nasa.gov/video/NDTV000908_Apollo_Digest_Series_Spacecraft%20for%20Apollo/collection.json",
  "renditions": {
    "thumb":    { "url": "https://images-assets.nasa.gov/video/.../...~thumb.jpg" },
    "captions": { "url": "https://images-assets.nasa.gov/video/.../....srt", "rel": "captions" }
  },
  "note": "Video file URLs (.mp4/.mov) require a follow-up GET to asset_manifest_url."
}
```

Not-found variant (when resolving a specific `nasa_id` via `/asset/{nasa_id}` or `/album/{album_name}`):

```json
{
  "success": false,
  "reason": "asset_not_found",
  "nasa_id": "THIS_DOES_NOT_EXIST_zzz",
  "api_message": "No AssetDB records for nasaid=THIS_DOES_NOT_EXIST_zzz"
}
```
