---
name: archive-org-find-snapshot-e3fnxh
title: Wayback Machine Snapshot Search
description: >-
  Find Internet Archive Wayback Machine snapshots for a URL — single closest,
  date range, host/prefix enumeration, or full history — returning archived URL,
  capture timestamp, HTTP status, MIME type, SHA-1 digest, and WARC-record
  length. Read-only.
website: archive.org
category: archives
tags:
  - wayback
  - archive
  - snapshot
  - cdx
  - memento
  - read-only
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: api
alternative_methods:
  - method: api
    rationale: >-
      Two public unauthenticated JSON endpoints cover the full surface —
      Availability API at archive.org/wayback/available for single-closest
      lookups, and CDX API at web.archive.org/cdx/search/cdx for ranges,
      host/prefix enumeration, status/MIME filters, collapse, and pagination. No
      auth, cookies, or anti-bot Verified required.
  - method: browser
    rationale: >-
      Fallback only when CDX returns sustained 503s or when the caller needs an
      interactive evidence shot. Drive web.archive.org/web/<YYYY>*/<URL>
      (calendar view) or web.archive.org/web/<timestamp>/<URL> (direct 302 to
      closest). Bare Browserbase session — no --verified or --proxies needed;
      the site is bare-friendly.
verified: false
proxies: false
---
# Wayback Machine Snapshot Search

## Purpose

Given a URL (and optionally a date, date range, or match-type modifier), return one or more Internet Archive Wayback Machine captures with their archived URL, capture timestamp (raw `YYYYMMDDhhmmss` + ISO 8601), HTTP status, MIME type, content digest (SHA-1, base32), and capture length in bytes. Supports five input shapes — single-closest, range-bound enumeration, full history, host/prefix enumeration, and field-projected pagination — and four CDX match types (exact, prefix, host, domain). Read-only — never invokes Save Page Now, never submits the capture form, never clicks any mutation control.

## When to Use

- "Get the closest Wayback snapshot of `https://X` near date `Y`."
- "List every capture of `https://X` between `from` and `to`."
- "Enumerate all archived captures under `host/*` or `https://host/path/*`."
- Daily/weekly diffing of a URL against its historical archive (use `collapse=digest` to skip unchanged duplicates).
- Verifying that a URL was already archived before a stated date.
- Building a Memento timemap for citation in research / legal / journalistic contexts.

## Workflow

Two public, unauthenticated JSON endpoints from the Internet Archive cover this task end-to-end. **Both are direct HTTPS calls — no auth header, no cookies, no anti-bot Verified.** Lead with the API path; the browser fallback at the end is for the rare case where CDX is rate-limited and you need to drive the public calendar UI instead. Per-request hosts:

- `https://archive.org` — Availability API (single-closest lookup).
- `https://web.archive.org` — CDX search + direct snapshot serving + timemap.

### Path A — Single closest snapshot (Availability API)

Use when the caller gave **one** target URL and **one** target date (or no date — "give me the most recent"). One round-trip, ~150–400 ms, no rate-limit observed.

```
GET https://archive.org/wayback/available?url=<URL>&timestamp=<YYYYMMDDhhmmss>
```

`timestamp` is optional but **strongly recommended**: without it the API can return an empty `archived_snapshots: {}` for popular roots (verified: `?url=example.com` with no timestamp → empty; `?url=example.com&timestamp=20200115` → closest=2020-01-16). Pass `19960101` for "earliest" or today's `YYYYMMDD` for "most recent" if no caller date.

Response shape:

```json
{
  "url": "example.com",
  "timestamp": "20200115",
  "archived_snapshots": {
    "closest": {
      "status": "200",
      "available": true,
      "url": "http://web.archive.org/web/20200116000042/http://example.com/",
      "timestamp": "20200116000042"
    }
  }
}
```

Branches:
- `archived_snapshots.closest.available === true` → emit. Parse `timestamp` as `YYYYMMDDhhmmss` for the ISO 8601 form.
- `archived_snapshots === {}` → no capture exists at or near that timestamp. If the caller's date was pre-1996, retry with a later timestamp (the archive begins ~1996). If post-today, the API clamps to the latest capture, not an error.

### Path B — Range / host / prefix enumeration (CDX API)

Use when the caller gave a date range, a wildcard host (`host/*`), a prefix (`host/path/*`), or needs more than the single closest capture. One round-trip per page; pagination via `resumeKey` (recommended) or `page`/`pageSize` (be careful — see gotcha).

```
GET https://web.archive.org/cdx/search/cdx
    ?url=<URL>
    &matchType=<exact|prefix|host|domain>
    &from=<YYYYMMDDhhmmss>
    &to=<YYYYMMDDhhmmss>
    &filter=<field>:<value>          (repeatable; prefix `!` to negate)
    &collapse=<field[:N]>             (timestamp:8 = daily; digest = unchanged-dedupe)
    &limit=<N>
    &fl=<comma-separated field list>
    &output=json
    &showResumeKey=true
```

Default JSON response is an **array of arrays**, with the **first row being the column header** — skip row 0 when emitting captures:

```json
[
  ["urlkey","timestamp","original","mimetype","statuscode","digest","length"],
  ["com,example)/","20210101000012","http://example.com/","text/html","200","JI6OR3QR4CI526JD6TMMNZNV4QPMPQCH","1228"],
  ["com,example)/","20210101002220","http://example.com/","warc/revisit","-","JI6OR3QR4CI526JD6TMMNZNV4QPMPQCH","586"],
  [],
  ["eJxLzs_VyassycxNLdbUVzAyMDIwMARCAyNLIwMAgYQHoA"]
]
```

Per-row decoding:
- `urlkey` — reverse-SURT canonical key (`com,example)/path?query`). Use for client-side grouping; not user-facing.
- `timestamp` — `YYYYMMDDhhmmss`. ISO 8601 form: insert separators (`2021-01-01T00:00:12Z`, UTC).
- `original` — the original (non-archived) URL as captured.
- `mimetype` — `text/html`, `image/png`, `application/pdf`, `warc/revisit` (dedup-pointer, no payload), `unk` (unknown — often 3xx redirects).
- `statuscode` — HTTP status the crawler saw (`"200"`, `"301"`, `"404"`, `"-"` for revisit).
- `digest` — SHA-1 of the captured payload, base32-encoded (32-char string). Two captures with the same digest have identical content.
- `length` — bytes of the WARC record (not the original response body — original size is in the `X-Archive-Orig-Content-Length` header when you fetch the snapshot).

Construct the archived URL: `https://web.archive.org/web/<timestamp>/<original>`.

**Pagination.** If `showResumeKey=true` is passed, when results exceed `limit` the response ends with an empty row `[]` followed by a one-element row containing the **base64 resume key**. Send that key back as `resumeKey=<...>` (plus the same query params) for the next page. Stop when the resume-key row is absent.

```json
// continuation
GET .../cdx/search/cdx?...&limit=N&showResumeKey=true&resumeKey=eJxLzs_VyassycxN...
```

`page`/`pageSize` is the other pagination mode (CDX paged mode) — use `&showNumPages=true` to discover the total page count, then iterate `page=0..N-1`. **`pageSize` is in *blocks*, not rows** — the default of 5 blocks can easily exceed the 1 MB Browserbase-Fetch response limit on popular URLs (observed: `pageSize=2` on nytimes.com exact returned >1 MB). Prefer `resumeKey` for safety.

### Path B' — CDX field projection + status filtering

Examples covering the knobs requested by the spec:

```bash
# Exclude 4xx/5xx — only successful captures
&filter=statuscode:200

# Negate — exclude successful, return only error/revisit captures
&filter=!statuscode:200

# MIME limit to HTML only
&filter=mimetype:text/html

# Daily collapse (one capture per calendar day)
&collapse=timestamp:8

# Content-change collapse (skip unchanged duplicates)
&collapse=digest

# Project a subset of columns
&fl=timestamp,original,statuscode,digest,length

# Closest-in-CDX (alternative to Availability API)
&closest=20200115&sort=closest&limit=1
```

### Path C — Browser fallback (only when CDX is rate-limited or 503'ing)

When `https://web.archive.org/cdx/search/cdx` returns 503 Service Unavailable on consecutive retries (observed sporadically, ~1 in 10 calls — see gotcha) **and** an interactive evidence shot is needed, drive a Browserbase session against the public calendar view. The session does **not** need Verified or residential proxies — `web.archive.org` is bare-friendly.

```bash
SID=$(browse cloud sessions create --keep-alive | jq -r .id)
export BROWSE_SESSION="$SID"

# Calendar view (year heatmap + all captures for that day)
browse open --remote "https://web.archive.org/web/<YYYY>*/<URL>"
browse wait load --remote
browse snapshot --remote     # accessibility tree of calendar tiles
# Each calendar-tile ref carries an aria-label like "20 captures, January 15, 2020"

# Direct nearest-capture redirect — issues a 302 to the actual nearest /web/<exact-ts>/<URL>
browse open --remote "https://web.archive.org/web/<YYYYMMDDhhmmss>/<URL>"
browse get url --remote      # canonical /web/<exact-ts>/<URL>
browse screenshot --remote --path snap.png

browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

Do **not** click "Save Page Now", "Donate", "Sign In", or the URL-submission form. The browser path is read-only enumeration of existing captures.

## Site-Specific Gotchas

- **`matchType=host`, `matchType=prefix`, and `matchType=domain` are auth-gated for popular URLs.** Verified 2026-05-18: `matchType=exact` on `nytimes.com` succeeds; `matchType=host` / `matchType=prefix` on the same domain returns **403 Forbidden** with body `"This type of CDX query requires authorization."` — including narrow time windows. The 403 is keyed on the URL+matchType pair, not the result-set size. Bulk modes are permitted on low-traffic/obscure URLs (verified: `matchType=domain&url=example.com` returns 200) but unreliable on anything popular. If you must enumerate a popular host, fall back to **`matchType=exact` per known path** or paginate via a date-window sweep on `exact`. There is no documented way to authenticate this endpoint as a third party today — Internet Archive accounts do not unlock it.
- **Sporadic 503 Service Unavailable on `web.archive.org/cdx/search/cdx`.** Observed ~1 in 10 calls in clean-room tests. Retry with 2–5 s backoff up to 3 times before giving up; the error is transient (the same query succeeds on the next attempt). The Availability API at `archive.org/wayback/available` is much more reliable — prefer it when only the closest capture is needed.
- **Default CDX output is space-separated text, not JSON.** Always pass `&output=json` unless you want to parse `urlkey TIMESTAMP ORIG MIME STATUS DIGEST LENGTH` lines yourself.
- **The first JSON row is the column header.** Skip row 0 when emitting captures. The columns reflect what `fl=` selected (default = `urlkey,timestamp,original,mimetype,statuscode,digest,length`).
- **`showResumeKey=true` adds two trailing rows on pagination, not one.** When more results are available, the response ends with an empty `[]` row, then a single-element row containing the base64 resume key. Both rows are present together; absence of these trailing rows means you've reached the last page.
- **`offset` and `filename` are private fields.** You can request them via `fl=...,offset,filename` but the values return `null` (verified). The WARC offset / WARC filename are not surfaced to public CDX clients today — don't promise them in your output schema unless the caller has back-channel access to IA's WARC storage.
- **`pageSize` is in blocks, not rows.** The default `pageSize=5` (and even `pageSize=2`) can blow past Browserbase's 1 MB fetch limit on popular URLs (observed: `pageSize=2&url=nytimes.com&matchType=exact` returns `502 The response body exceeded the maximum allowed size of 1MB`). Use `resumeKey` pagination instead for safety, or always set explicit `limit=<N>` (e.g. `limit=1000`) and ignore `pageSize`.
- **`archived_snapshots: {}` is the no-archive signal.** Availability API returns `200 OK` with an empty `archived_snapshots` object when (a) the URL has never been archived, or (b) the requested timestamp is pre-1996 (before the archive began). This is a valid empty result, not an error. Distinguish from network errors before retrying.
- **Future timestamps clamp to the latest capture.** A `timestamp=20300101` query for an archived URL returns the *most recent* capture, not an error. Useful as a "give me the latest" shorthand.
- **Availability API needs a timestamp for popular roots.** Verified 2026-05-18: `?url=example.com` with no timestamp returns `archived_snapshots: {}`, but `?url=example.com&timestamp=20200115` returns a closest capture. When no caller date is given, pass today's date (`date -u +%Y%m%d`) to mean "most recent" rather than omitting the param.
- **URL canonicalization is non-obvious.** The CDX `urlkey` is **reverse-SURT** (`com,example)/path?key=value`) — host segments reversed, comma-separated, lowercased. Don't try to parse it back to a URL — always use the `original` field for caller-facing output. The `original` column preserves the schema (`http://` vs `https://`), trailing slash, port, and user-info as captured.
- **`warc/revisit` rows are deduplication pointers, not payloads.** `mimetype: warc/revisit` + `statuscode: -` means the crawler observed the URL but didn't re-store the payload (same content as a prior capture, identified by matching `digest`). Fetching the snapshot URL still works — IA transparently redirects to the original payload — but if you're computing storage stats or unique-content counts, dedupe by `digest` and ignore the revisit rows. Use `&filter=!mimetype:warc/revisit` to exclude them at the source.
- **`statuscode: "-"` on non-revisit rows usually means an unknown/non-HTTP capture.** Pair with `mimetype: unk` for 301 chains or non-HTTP protocols. The caller-facing `status` field should be `null` (not `"-"`) when surfaced.
- **`length` is the WARC record byte count, not the original response body size.** The original Content-Length is in the `X-Archive-Orig-Content-Length` response header when you actually fetch `https://web.archive.org/web/<ts>/<url>`. For "how big was the page" semantics, prefer the orig header; for "how much storage does the archive use", `length` is correct.
- **Direct snapshot URLs 302-redirect to the closest match.** A request to `https://web.archive.org/web/20200115000000/https://example.com/` returns `302 Location: /web/20200115000202/http://example.com/` (the nearest capture). This is a cheaper single-closest path than the Availability API for an already-known URL — read the `Location` header and you have the canonical archived URL in one round-trip. Note the scheme normalization (the redirect may flip `https://` → `http://` to match the original capture).
- **Memento headers on a snapshot fetch surface the original-server metadata.** `Memento-Datetime`, `X-Archive-Orig-Server`, `X-Archive-Orig-Content-Length`, `X-Archive-Orig-Content-Type`, and a multi-rel `Link` header (`rel="original"`, `rel="timegate"`, `rel="timemap"`, `rel="prev memento"`, `rel="next memento"`) are all present on `https://web.archive.org/web/<ts>/<url>` HEAD/GET. Useful when surfacing the "what server originally served this" trail to a caller.
- **Timemap `link` format is unbounded.** `https://web.archive.org/web/timemap/link/<URL>` returns every capture as a `Link:` header chain — easily multi-MB on popular URLs, and the `from`/`to` query params **do not appear to filter** the timemap output (verified: `?from=20200101&to=20200107` returned empty `Cg==`). Don't use timemap when you can use CDX directly with a date range — it's both bigger and less filterable.
- **Robots-and-takedown removals are silent.** Some URLs are excluded from the Wayback display per robots.txt or takedown request and will return `archived_snapshots: {}` (Availability) or zero rows (CDX) even though IA holds captures. This is expected; there is no signal to distinguish "never archived" from "archived but suppressed".
- **Browser fallback does not need Verified or residential proxies.** `web.archive.org` serves bare Chromium sessions without anti-bot challenges. Do not waste credits on `--verified --proxies` for this site.
- **READ-ONLY discipline.** Never click "Save Page Now" (URL `web.archive.org/save/...` — issues a fresh capture, which is a mutation). Never click "Donate" or "Sign In". Never submit the URL-submission form on the homepage. The skill enumerates existing captures only.

## Expected Output

The skill emits one of several shapes depending on the input form. All timestamps are returned in both `raw` (`YYYYMMDDhhmmss`) and `iso` (`YYYY-MM-DDTHH:MM:SSZ`) forms.

### Shape 1 — Single closest snapshot (Availability API path, or `closest=` mode)

```json
{
  "mode": "closest",
  "input": { "url": "https://example.com", "target": "2020-01-15" },
  "snapshot": {
    "original_url": "http://example.com/",
    "archived_url": "http://web.archive.org/web/20200116000042/http://example.com/",
    "timestamp": { "raw": "20200116000042", "iso": "2020-01-16T00:00:42Z" },
    "status": 200,
    "mimetype": null,
    "digest": null,
    "length_bytes": null,
    "warc_offset": null,
    "warc_filename": null
  },
  "found": true
}
```

`mimetype` / `digest` / `length_bytes` are `null` on the Availability path (the API only returns status + url + timestamp + available); fill them by following up with a CDX `matchType=exact&from=<ts>&to=<ts>&limit=1` lookup if the caller wants full metadata.

### Shape 2 — Range enumeration (CDX path, exact match)

```json
{
  "mode": "range",
  "input": {
    "url": "https://www.nytimes.com/",
    "from": "20200101000000",
    "to": "20200131000000",
    "filters": { "statuscode": "200", "mimetype": "text/html" },
    "collapse": "timestamp:8"
  },
  "total_returned": 10,
  "has_more": true,
  "resume_key": "eJxLzs_VyassycxN...",
  "snapshots": [
    {
      "original_url": "https://www.nytimes.com/",
      "archived_url": "https://web.archive.org/web/20200101000601/https://www.nytimes.com/",
      "timestamp": { "raw": "20200101000601", "iso": "2020-01-01T00:06:01Z" },
      "status": 200,
      "mimetype": "text/html",
      "digest": "C4BXLJBV22KOGSIEV3G45STZAILX3FQB",
      "length_bytes": 109748,
      "warc_offset": null,
      "warc_filename": null
    }
  ]
}
```

### Shape 3 — Host or prefix enumeration (only viable on low-traffic URLs — see gotcha on the 403 auth gate)

```json
{
  "mode": "host",
  "input": { "url": "example.com/*", "matchType": "host" },
  "total_returned": 5,
  "has_more": false,
  "resume_key": null,
  "snapshots": [
    {
      "original_url": "http://example.com/",
      "archived_url": "https://web.archive.org/web/20210101000012/http://example.com/",
      "timestamp": { "raw": "20210101000012", "iso": "2021-01-01T00:00:12Z" },
      "status": 200,
      "mimetype": "text/html",
      "digest": "JI6OR3QR4CI526JD6TMMNZNV4QPMPQCH",
      "length_bytes": 1228,
      "warc_offset": null,
      "warc_filename": null
    }
  ]
}
```

### Shape 4 — No archive found

```json
{
  "mode": "closest",
  "input": { "url": "https://this-domain-never-existed.example", "target": "2020-01-15" },
  "found": false,
  "reason": "no_capture_at_or_near_timestamp"
}
```

`reason` values:
- `no_capture_at_or_near_timestamp` — `archived_snapshots: {}` from Availability, or zero CDX rows.
- `pre_archive_window` — timestamp before 1996.
- `possibly_suppressed` — emit when caller has external evidence the URL existed at the time but CDX returns empty (cannot be confirmed from API alone; treat as same as no-capture).

### Shape 5 — Auth-gated bulk match (graceful failure)

```json
{
  "mode": "host",
  "input": { "url": "nytimes.com/*", "matchType": "host" },
  "found": false,
  "reason": "auth_gated_match_type",
  "http_status": 403,
  "message": "CDX bulk match types (host, prefix, domain) are auth-gated for popular URLs. Fall back to matchType=exact for a single known path, or sweep date windows."
}
```
