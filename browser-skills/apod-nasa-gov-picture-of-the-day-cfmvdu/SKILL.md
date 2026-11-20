---
name: apod-nasa-gov-picture-of-the-day-cfmvdu
title: NASA Astronomy Picture of the Day
description: >-
  Fetch NASA's Astronomy Picture of the Day (APOD) — today's curated image or
  video plus title, explanation, copyright, and HD image URL. Supports any date
  back to 1995-06-16.
website: apod.nasa.gov
category: media
tags:
  - nasa
  - astronomy
  - apod
  - image-of-the-day
  - public-api
  - read-only
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      The public archive page at apod.nasa.gov/apod/astropix.html (and per-day
      apYYMMDD.html) renders the same content as hand-authored HTML. Use only
      when api.nasa.gov is unreachable or DEMO_KEY quota is exhausted and no
      personal key is available — the HTML layout is irregular and per-field
      extraction is brittle compared to the JSON API.
verified: false
proxies: false
---
# NASA Astronomy Picture of the Day

## Purpose

Fetch the latest NASA Astronomy Picture of the Day (APOD) — the daily image (or video) curated by NASA, along with its title, explanation, publication date, copyright credit, and direct image URLs (standard + HD). Read-only: hits NASA's public API or, as fallback, scrapes the public APOD archive page. Never authenticates as a user and never modifies state.

## When to Use

- "What's NASA's picture of the day?" / "Show me today's APOD."
- A daily digest, ambient display, lock screen, or chat-bot daily-image card.
- Building a backfill of historical APODs (the same API supports a `date=YYYY-MM-DD` parameter to retrieve any day from 1995-06-16 onward).
- Any flow that needs the picture-of-the-day's image binary, HD URL, or its written explanation.

## Workflow

The APOD service exposes a documented, free, no-anti-bot JSON API at `https://api.nasa.gov/planetary/apod`. **Use it directly — do not drive a browser for this task.** A single HTTPS GET returns everything you need; the browser path is a strict superset of work that produces strictly less structured output, and the page itself (`apod.nasa.gov/apod/astropix.html`) is hand-edited 1990s-era HTML with no JSON-LD or microdata — every field would have to be regex-scraped from interleaved `<p>` tags.

### 1. Get an API key (one-time)

`DEMO_KEY` works without registration for ad-hoc testing (rate-limited: ~30 req/hr/IP, 50 req/day/IP). For anything production, sign up for a free personal key at <https://api.nasa.gov/> — instant email delivery, 1,000 req/hr default quota, no payment.

Store as `NASA_API_KEY`. If unset, fall back to `DEMO_KEY`.

### 2. Single API call

```bash
curl -fsS "https://api.nasa.gov/planetary/apod?api_key=${NASA_API_KEY:-DEMO_KEY}"
```

Optional query params:

| Param | Type | Default | Notes |
|---|---|---|---|
| `date` | `YYYY-MM-DD` | today (US/Eastern) | Earliest valid value: `1995-06-16`. |
| `start_date` / `end_date` | `YYYY-MM-DD` | — | Returns a JSON array. `end_date` defaults to today when `start_date` is given alone. Mutually exclusive with `date`. |
| `count` | int 1–100 | — | Returns that many random APODs. Mutually exclusive with `date` / `start_date`. |
| `thumbs` | `true` / `false` | `false` | When `media_type === "video"`, include a `thumbnail_url`. Strongly recommended — videos have no `url` you can display as an image. |
| `hd` | `true` / `false` | `false` | Legacy/no-op on the modern v1 endpoint — `hdurl` is now returned unconditionally for images. Safe to omit. |

Recommended default invocation:

```bash
curl -fsS "https://api.nasa.gov/planetary/apod?api_key=${NASA_API_KEY:-DEMO_KEY}&thumbs=true"
```

### 3. Parse the response

Top-level keys you can rely on:

- `date` — `"YYYY-MM-DD"`, always present.
- `title` — string, always present.
- `explanation` — multi-paragraph string, always present. Plain text (no HTML). Often 1–4 sentences but can exceed 2 KB.
- `media_type` — `"image"` or `"video"`. **Branch on this.**
- `url` — for images, a JPEG/PNG on `apod.nasa.gov/apod/image/YYYYMM/...`; for videos, typically a YouTube/Vimeo `embed/` URL (not a raw video file).
- `hdurl` — present for most (not all) images. High-resolution variant of `url`. Absent for `media_type: "video"` and rare image entries.
- `thumbnail_url` — present **only** when `media_type: "video"` and the request included `thumbs=true`. Use this to render a still preview of a video APOD.
- `copyright` — present only when the APOD has a non-public-domain credit; many NASA/public-domain entries omit this field entirely. **Do not assume it exists.**
- `service_version` — currently `"v1"`. Stable since 2017.

### 4. Download the image bytes (optional)

If your downstream needs the binary (not just the URL), do a second `curl` against `hdurl` (preferred) or `url`. These are served from `apod.nasa.gov` directly — no auth, no referer required, no rate limit beyond NASA's general fair-use ceiling. `Cache-Control: public, max-age=604800` is honored; once-per-day fetchers don't need their own cache.

```bash
img_url=$(echo "$response" | jq -r '.hdurl // .url')
curl -fsS -o apod.jpg "$img_url"
```

### Browser fallback

Only if `api.nasa.gov` is unreachable from your environment (e.g., outbound network whitelist blocks `api.nasa.gov` but allows `apod.nasa.gov`) or you've burned through the DEMO_KEY quota and can't acquire a key:

1. `browse open https://apod.nasa.gov/apod/astropix.html` — this is *today's* APOD, not a redirect. Archive day pages live at `https://apod.nasa.gov/apod/apYYMMDD.html` (note: two-digit year — `ap260518.html` for 2026-05-18).
2. `browse get markdown body` — extract the rendered text. The page layout is:
   - `<h1>` (or sometimes `<b>`) — title
   - `<img src="image/YYYYMM/{name}.jpg">` directly under the title (or `<iframe>` for videos)
   - `<a href="image/YYYYMM/{name}_orig.jpg">` wrapping the `<img>` — this is the HD link
   - `<b>Explanation:</b>` followed by the explanation paragraph(s) until the next `<p>` containing `<b>Tomorrow's picture:</b>`
   - `<center>` block at the bottom contains the date and `Copyright:` line if any
3. Resolve relative image URLs against `https://apod.nasa.gov/apod/`.

The HTML is hand-authored and frequently irregular (mixed `<b>`/`<h1>` headings, inconsistent paragraph wrapping, occasional inline JavaScript countdown scripts). Expect to do per-day error handling. **This is why the API path is non-negotiably preferred.**

## Site-Specific Gotchas

- **Video days are common (~10–15% of entries).** Always branch on `media_type`. If your downstream assumes an image URL and you blindly use `url` on a video day, you'll hand a downstream renderer a YouTube `embed/` URL. Always request `thumbs=true` and prefer `thumbnail_url` for video days when a still is needed.
- **`copyright` is optional.** Public-domain NASA imagery omits the field entirely. Don't write `response.copyright.strip()` — check existence first. When present, the string often has leading/trailing whitespace and may contain newlines mid-string (e.g. `"\nRobert Gendler\n"`).
- **Date semantics are US/Eastern.** The "today" APOD rolls over at midnight Eastern Time, not UTC. Around 04:00–05:00 UTC, "today" can be different depending on which clock you're on. If you need a stable daily artifact, query with an explicit `date=YYYY-MM-DD` computed in `America/New_York`.
- **Earliest valid date is `1995-06-16`.** Earlier dates return HTTP 400 `{ "code": 400, "msg": "Date must be between Jun 16, 1995 and ..." }`. Don't blindly do "today minus N days" backfills past that floor.
- **Rate limits are per-IP, not per-key, for `DEMO_KEY`.** Two scripts on the same host sharing `DEMO_KEY` share its budget. The remaining quota is in response headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`. When exhausted you get HTTP 429 with body `{ "error": { "code": "OVER_RATE_LIMIT", ... } }`.
- **HTTP 400 on a future date.** Submitting `date=` in the future returns 400, not 404. Validate client-side.
- **Sporadic HTTP 500 with body `"Error: APOD has not yet been published for ..."`.** NASA occasionally publishes the daily entry late (a few hours past Eastern midnight). Retry after 30 minutes; do not treat as a permanent error.
- **`hdurl` is not guaranteed.** Some image days return only `url`. Always `hdurl // url` in jq / `response.get("hdurl") or response["url"]` in Python.
- **The image is hosted on `apod.nasa.gov`, not `api.nasa.gov`.** If your network policy whitelists API hosts only, you must add `apod.nasa.gov` to download bytes.
- **No CORS-friendly endpoint.** `api.nasa.gov` sets `Access-Control-Allow-Origin: *`, but `apod.nasa.gov` (the image host) does not — browser-side `fetch()` for the image bytes will be opaque. Server-side proxy or use the API JSON only.
- **Don't expect a stable "permalink" beyond the archive URL.** `https://apod.nasa.gov/apod/apYYMMDD.html` is the canonical permalink. The `url` / `hdurl` paths under `/apod/image/YYYYMM/` are stable but the filename is editorially chosen and is not derivable from the date.
- **Sandbox validation caveat (this generation run):** the agent runtime did not have outbound DNS to `api.nasa.gov` and could not fire a live request during authoring. Schema, query-param, and gotcha details above are drawn from the public NASA Open API docs and the API's long-stable v1 contract; field-name and rate-limit specifics should be re-verified against the live endpoint on first use if absolute precision matters.

## Expected Output

The skill returns one normalized object per call. Two shapes — image-day and video-day:

**Image day (most common):**

```json
{
  "success": true,
  "date": "2026-05-18",
  "title": "M16: Pillars of Creation in Infrared",
  "media_type": "image",
  "url": "https://apod.nasa.gov/apod/image/2605/M16_JWST_960.jpg",
  "hdurl": "https://apod.nasa.gov/apod/image/2605/M16_JWST_4096.jpg",
  "thumbnail_url": null,
  "explanation": "What's happening in the Eagle Nebula? ...",
  "copyright": "NASA, ESA, CSA, STScI",
  "permalink": "https://apod.nasa.gov/apod/ap260518.html",
  "service_version": "v1"
}
```

**Video day:**

```json
{
  "success": true,
  "date": "2026-05-12",
  "title": "A Flight Over Pluto",
  "media_type": "video",
  "url": "https://www.youtube.com/embed/HEgEjnYHFzo?rel=0",
  "hdurl": null,
  "thumbnail_url": "https://img.youtube.com/vi/HEgEjnYHFzo/0.jpg",
  "explanation": "What would it look like to fly over Pluto? ...",
  "copyright": null,
  "permalink": "https://apod.nasa.gov/apod/ap260512.html",
  "service_version": "v1"
}
```

**Error shapes:**

```json
{ "success": false, "reason": "rate_limited", "http_status": 429, "retry_after_seconds": 3600 }
{ "success": false, "reason": "not_yet_published", "http_status": 500, "retry_after_seconds": 1800 }
{ "success": false, "reason": "date_out_of_range", "http_status": 400, "earliest_date": "1995-06-16" }
{ "success": false, "reason": "invalid_api_key", "http_status": 403 }
```

`permalink` is synthesized client-side as `https://apod.nasa.gov/apod/ap{YY}{MM}{DD}.html` from `date`. The API itself does not return this field.
