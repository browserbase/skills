---
name: software-nasa-gov-lookup-software-contract-54tcpr
title: NASA Software Catalog Lookup
description: >-
  Look up software in NASA's public Software Catalog by free-text keyword or by
  canonical case number, returning structured records with title, description,
  NASA field center, category, release type, version, dates, and download URL.
website: software.nasa.gov
category: research
tags:
  - nasa
  - software-catalog
  - research
  - open-source
  - government
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: api
alternative_methods:
  - method: url-param
    rationale: >-
      For exact-case-number lookup, GET
      https://software.nasa.gov/software/{case_number} returns a server-rendered
      detail page (200=exists, 404=not-found). Preferred over the search API for
      direct ID resolution because the search API does fuzzy prefix matching on
      case numbers.
  - method: browser
    rationale: >-
      Only when the JSON endpoint is unreachable. The public search page at
      /search/multi/{center}/software/9/{query} is server-side rendered for the
      first 9 hits but costs ~5× more than the API path and requires extra JS
      execution for pagination.
verified: false
proxies: false
---
# NASA Software Catalog Lookup

## Purpose

Look up software in NASA's public Software Catalog (`software.nasa.gov`) — either by free-text keyword (returning a ranked list of matching titles) or by canonical NASA case number (returning the full record for a single piece of software). For each hit, returns: case number, title, marketing/technical descriptions, NASA field center, category, release type, version, dates, and any external download URL. Read-only; never submits the "Request Software" form.

## When to Use

- "Find NASA software for X" — keyword search across the full agency catalog.
- "Get details on NASA software `LAR-18744-1`" — direct lookup by case number.
- Programmatic monitoring for newly released or revised NASA software.
- Cataloging / filtering by NASA field center (Ames, JPL, Goddard, Langley, etc.) or by software category (aeronautics, propulsion, data and image processing, etc.).
- Anywhere you would otherwise scrape the rendered HTML — the JSON API is faster, structurally richer (24 fields per record vs. 4 in the rendered card), and has no auth, cookies, or anti-bot.

## Workflow

The `software.nasa.gov` front-end is a thin client over a public Elasticsearch-backed JSON endpoint at `/searchapi/multi/{center}/software/{offset}/9/{query}`. No auth, no cookies, no rate-limit headers, no anti-bot Verified — plain HTTPS GET works from any IP. Page size is hard-coded to 9. Lead with the API path; the browser path is a fallback only.

### A. Search by keyword

1. **Get the total result count** (one HTML round-trip — the API itself does not return a count).
   ```
   GET https://software.nasa.gov/search/multi/{center}/software/9/{query}
   ```
   - `{center}` — one of: `aw` (agency-wide / all), `arc` (Ames), `dfrc` (Armstrong), `grc` (Glenn), `gsfc` (Goddard), `jpl` (JPL), `jsc` (Johnson), `ksc` (Kennedy), `larc` (Langley), `msfc` (Marshall), `ssc` (Stennis).
   - `{query}` — URL-encoded keyword(s). Spaces → `%20`. Hyphens allowed.

   Parse total from one of (both present in the HTML):
   - `<div class="searchCount">(\d+) Search Results for "..."</div>`
   - Inline JS literal `let total=<N>;`

2. **Fetch matching records via the JSON API**, paginating by `offset = 0, 9, 18, …` until the API returns `[]` or `offset ≥ total`.
   ```
   GET https://software.nasa.gov/searchapi/multi/{center}/software/{offset}/9/{query}
   ```
   Returns a JSON array of Elasticsearch hits:
   ```json
   [
     {
       "_index": "t2pd.software",
       "_id": "544057a42841f54dacba7027",
       "_score": 1,
       "_source": { /* full software record — see "Expected Output" */ }
     },
     ...
   ]
   ```
   The 24 fields in `_source` (e.g. `case_number`, `marketing_title`, `marketing_desc`, `tech_title`, `sw_desc`, `category`, `center`, `release_type`, `sw_version`, `sw_url`, `release_aisc_date`, `revision_date`) are the canonical record and are richer than the rendered card or the public detail page — you usually do not need step 3.

3. **(Optional) Fetch the public detail page** for a single hit if you need the rendered "Contact Us" email, the FAQ-formatted release-type explainer, or a visual screenshot:
   ```
   GET https://software.nasa.gov/software/{case_number}
   ```
   Returns server-rendered HTML; the `<h1>` is `{marketing_title}({case_number})` and labeled rows under "Software Details" carry Category, Reference Number, Release Type, and Operating System. **The detail page is strictly a subset of the JSON record — there is no information here the API does not already have.**

### B. Direct lookup by case number

If the user already knows the canonical case number (e.g. `LAR-18744-1`, `NPO-50498-1`, `GSC-15016-1`), do **not** use the search API — it does a fuzzy multi-field match on the case-number string and returns center-prefix-mates ranked above the exact match (e.g. searching `LAR-18744-1` returns `LAR-19278-1` as the top hit, not the exact match). Instead:

1. **Hit the detail URL directly**:
   ```
   GET https://software.nasa.gov/software/{case_number}
   ```
   - HTTP `200` with `<h1>...({case_number})</h1>` → exists. Parse `<h1>` and the "Software Details" rows for category, release type, etc.
   - HTTP `404` → unknown case number.

2. **(Optional) Backfill the rich JSON record** by extracting the marketing title from the `<h1>` and querying the search API with that title — the exact-title query lands the canonical record as hit #1 with all 24 `_source` fields.

### C. Autocomplete (optional)

For "did you mean" suggestions on a partial query (≥ 4 chars), call:
```
GET https://software.nasa.gov/searchsuggestions/{partial}
```
Returns `{"success": true, "data": ["trajectory", "trajectory optimization", ...]}` (up to 10 strings) or `[]` if no matches. Useful for query expansion before the main search call. Returns `[]` for queries shorter than 3-4 characters.

### Browser fallback

Use only when the JSON endpoint is unreachable (sanctions, network policy, or — extremely rare — the Drupal cache is misbehaving). The public search page `https://software.nasa.gov/search/multi/{center}/software/9/{query}` is fully server-side rendered for the first 9 hits (Drupal Views) — no JS execution required to read them. Extract:

- **Per-result `<div class="result">` block**, each containing:
  - Case number: `<a href="https://software.nasa.gov/software/([A-Z0-9\-]+)">` (also the anchor text)
  - Title: `<div class="title">([^<]+)</div>` (the `marketing_title`)
  - Description: `<div class="description">([^<]+)</div>` (the `marketing_desc`, truncated)
  - Release type: `<div class="category">([^<]+)</div>` (re-uses the `category` class but carries the `release_type` text — confusingly named)
- **Total count**: `<div class="searchCount">(\d+) Search Results` (also `let total=<N>;` in the in-page JS).
- **Pagination via browser** requires running the `viewMore` JS (`document.querySelector(".viewMore").click()` per +9 batch) — much more expensive than just hitting the JSON endpoint at the next offset. Skip the browser entirely once you have the count.

## Site-Specific Gotchas

- **The "obvious" search-API URL is a trap.** The view-more JS embedded in the search page advertises `/searchapi/software/{query}/software/{page}/9/` — that endpoint **always returns `[]`** for every query, every offset, every center (confirmed across multiple iterations 2026-05-18). The actually-working endpoint is **`/searchapi/multi/{center}/software/{offset}/9/{query}`** — note the segment order: `{offset}/9/{query}` is correct, **not** `{offset}/{query}` (the trailing `/9/` is the page size and **must** be present — without it the query parameter is silently ignored and you get the unfiltered agency-wide pager). This was the highest-cost discovery during scaffolding; the URL inside the page's JS is stale.
- **Query parameter is silently dropped if path shape is wrong.** Any malformed variant of the path (missing `/9/`, wrong segment order, using `aw` in the query slot, etc.) returns the **unfiltered top-9 of the catalog** with HTTP 200 — there is no error signal. Always verify by submitting a query you know is unique (e.g. `TPSSizer`) and confirming the response shape matches expectations (hit count should be small for unique terms).
- **No total-count in the JSON.** The API only returns the slice of 9; the total is published in the rendered HTML page (`class="searchCount"` and inline `let total=<N>;`). Either fetch the HTML once at offset=0 to grab the count, or paginate blindly until you get `[]`.
- **Page size is hard-coded to 9.** The `/9/` in the path is the size and is not overridable — `/10/`, `/100/`, etc. all return `{}` (empty object, not an array) or `[]`. Plan pagination in increments of 9.
- **Empty / very-short queries silently return browse-all-9.** `q=""`, `q=" "`, `q="x"` all return 9 results sorted by the catalog's default order (ARC entries first), **not** an error. Validate the query is ≥ 2 characters before issuing the request and treat short-query responses as "browse" rather than "search-result".
- **Direct case-number lookup via the search API is unreliable.** Querying `case_number` strings does a fuzzy match on the prefix and ranks center-prefix-mates above the exact case (e.g. `LAR-18744-1` returns `LAR-19278-1` as hit #1). For exact-id lookup, fetch `https://software.nasa.gov/software/{case_number}` directly (HTTP 200 = exists, 404 = unknown).
- **The `category` field on result cards is actually `release_type`.** In the rendered HTML (`<div class="category">`) the value is the release-type enum (`Open Source`, `General Public Release`, `U.S. Release Only`, `U.S. and Foreign Release`, `U.S. Government Purpose Release`), **not** the technical category. The actual technical category lives in `_source.category` (lowercase) / `_source.sw_category` (title-case display). Don't conflate them.
- **Field-center enum is closed.** Valid `{center}` values: `aw, arc, dfrc, grc, gsfc, jpl, jsc, ksc, larc, msfc, ssc`. Unknown values return `[]`. JPL's `_source.center` is `JPL` even though its case-numbers are `NPO-*` (legacy Jet Propulsion lab "Naval Propellant Office" prefix), not `JPL-*`. Don't try to infer center from case-number prefix.
- **Category-browse pages are not server-rendered.** `https://software.nasa.gov/software/category/{slug}/{center}/{page}/` returns an empty results div — these pages depend on JS to fetch and render their hits. **There is no public JSON endpoint for category-browse** (only the keyword `/searchapi/multi/.../{query}` endpoint, which does not accept a category filter). If you need category-scoped results, either: (a) call the keyword API with the category slug as the query (e.g. `q=propulsion`) — produces approximate results, or (b) call the keyword API for every term you care about and filter client-side on `_source.category`.
- **Latency / rate-limiting.** Median response ~1.6-1.8s per API call from a US-West vantage point. No rate-limit headers and no formal block observed at 3 req/s; keep ≤ 2 req/s sustained to be polite.
- **CDN cache is aggressive.** `X-Drupal-Cache: HIT` on most responses; `Cache-Control: must-revalidate, no-cache, private` is ignored by the CloudFront layer in practice. Newly-added software entries may take up to a few minutes to appear. The `revision_date` field in `_source` is the canonical "last modified" timestamp.
- **`sw_url` is sparsely populated.** Open-source codes typically have a non-empty `sw_url` pointing to a GitHub/SourceForge/lab page; export-controlled codes (`U.S. Release Only`, `U.S. Government Purpose Release`) leave it blank and require the "Request Software" form (which this skill does not exercise).
- **`sw_version_date: "1970-01-01T08:00:00.000Z"` is a sentinel for "no version date".** Treat as null. (The 8:00 offset is PST epoch-zero — a Drupal default.)
- **Browser session not always reachable.** Driving `software.nasa.gov` through a Browserbase remote session requires resolving `connect.{region}.browserbase.com` (WSS/CDP endpoint), which is firewalled in some agent runtime environments — only `api.browserbase.com` (REST gateway, used by `browse cloud fetch`/`browse cloud search`) is reachable. This is fine for this skill since the JSON API path needs only HTTPS GETs — but it means automated screenshots may not be available depending on your sandbox.

## Expected Output

### A. Keyword-search response shape

One object per matching software. Pull the entire `_source` block — there are no positional arrays or decode tables to worry about; every field is named.

```json
{
  "query": "trajectory",
  "center": "aw",
  "total": 53,
  "results": [
    {
      "case_number": "LAR-18744-1",
      "marketing_title": "Low Fidelity Space Systems Analysis Tools-Heliocentric Trajectory Tool",
      "marketing_desc": "This tool is produced is take advantage of pre-existing resources of known lambert trajectory solutions to various bodies, NEA's and more. ...",
      "tech_title": "Low Fidelity Space Systems Analysis Tools-Heliocentric Trajectory Tool",
      "sw_desc": "Full technical description (often longer than marketing_desc)...",
      "category": "design and integration tools",
      "sw_category": "Design and Integration Tools",
      "center": "LARC",
      "release_type": "U.S. Release Only",
      "sw_version": "1.0",
      "sw_version_date": "1970-01-01T08:00:00.000Z",
      "release_aisc_date": "2016-07-14T07:00:00.000Z",
      "revision_date": "2016-07-14T07:00:00.000Z",
      "sw_url": "",
      "sw_operating_system": "",
      "reference_number": "LAR-18744-1",
      "client_record_id": "LAR-18744-1",
      "id": "software_release_LAR-18744-1",
      "aisc_keyword": "",
      "catalog_note": "",
      "more_sw_info": "",
      "search": "(deduplicated full-text blob)",
      "title": "Low Fidelity Space Systems Analysis Tools-Heliocentric Trajectory Tool",
      "detail_url": "https://software.nasa.gov/software/LAR-18744-1"
    }
  ],
  "next_offset": 9
}
```

### B. Direct case-number lookup response shape

```json
{
  "case_number": "LAR-18744-1",
  "found": true,
  "title": "Low Fidelity Space Systems Analysis Tools-Heliocentric Trajectory Tool",
  "category": "Design and Integration Tools",
  "release_type": "U.S. Release Only",
  "operating_system": null,
  "detail_url": "https://software.nasa.gov/software/LAR-18744-1",
  "description": "Overview text from the rendered detail page...",
  "contact_email": "hq-dl-t2-ops-center@mail.nasa.gov"
}
```

### C. Not-found shape (case-number direct lookup)

```json
{
  "case_number": "ZZZ-99999-1",
  "found": false,
  "detail_url": "https://software.nasa.gov/software/ZZZ-99999-1",
  "http_status": 404
}
```

### D. Empty-search shape (keyword)

```json
{
  "query": "nonexistentxyz",
  "center": "aw",
  "total": 0,
  "results": [],
  "next_offset": null
}
```

### E. Autocomplete-only shape (when partial query is too short to search)

```json
{
  "partial": "traj",
  "suggestions": [
    "trajectory",
    "trajectory optimization",
    "trajectories",
    "trajectory model",
    "trajectory estimation"
  ]
}
```
