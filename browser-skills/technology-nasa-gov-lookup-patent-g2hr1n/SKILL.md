---
name: technology-nasa-gov-lookup-patent-g2hr1n
title: NASA Patent Catalog Lookup
description: >-
  Search and retrieve patents from NASA's Technology Transfer (T2) catalog by
  free-text query, category, NASA center, or reference ID — returning structured
  records with title, abstract, technology description, USPTO patent numbers,
  NASA case numbers, TRL, figures, and licensing-contact data.
website: technology.nasa.gov
category: government
tags:
  - nasa
  - patents
  - intellectual-property
  - tech-transfer
  - research
  - government
  - open-data
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      All page surfaces are server-rendered Drupal HTML with no anti-bot —
      usable as a fallback if the undocumented /searchosapicat JSON endpoint is
      ever disabled. The detail page /patent/{ID} is also the only reliable path
      for exact-ID lookup, since the JSON API does fuzzy matching on reference
      IDs.
  - method: url-param
    rationale: >-
      Direct deep-links work: /patent/{REFERENCE_ID} returns full HTML for a
      known ID, /patents/category/{slug} lists by category (HTML only, first 9).
      No auth, no session state.
verified: false
proxies: false
---
# NASA Patent Catalog Lookup

## Purpose

Look up patents in NASA's Technology Transfer (T2) Portal — the public catalog of NASA-owned patents available for licensing. Given a free-text query, a category, a NASA center, or a specific reference ID, return one or more patent records with title, subtitle, abstract, technology description, benefits, applications, NASA case numbers, granted USPTO patent number(s), originating NASA center, technology readiness level (TRL), figure captions, and image URLs. Read-only — the skill never initiates a license application or contact submission.

## When to Use

- "Find NASA patents about hall-effect thrusters / regolith 3D printing / cryogenic insulation."
- "List every JPL patent in the propulsion category."
- "Pull the full record for `MSC-TOPS-89`."
- Any catalog/discovery flow that needs structured NASA T2 patent data: tech-transfer scouting, prior-art surveys, commercialization research, federal-IP dashboards.
- Use the spinoff / software catalogs (`/search/multi/aw/spinoff/...`, `/search/multi/aw/software/...`) for the sibling endpoints if the user asks about NASA software releases or commercial spinoffs instead of patents.

## Workflow

`technology.nasa.gov` exposes an undocumented JSON endpoint behind the "View More" pagination button on `/patents/category/*`. It returns Elasticsearch-style hits with a fully-populated `_source` object — every field the public detail page renders is there, plus a few that aren't (e.g. raw `push_date` epoch-ms, `id`, internal `subcategory`). The site is on Drupal 10 behind CloudFront with no WAF, no bot challenge, and no rate-limit-on-bare-IPs we could detect; bare Browserbase Fetch returns 200 in ~0.5s per request. **A residential proxy and Verified flags are NOT required.** Lead with the API; only fall back to HTML scraping if the API ever 5xx's. The site is publicly licensed federal data — there is no auth, cookie, CSRF, or session state.

### 1. Free-text / topical search (the primary path)

```
GET https://technology.nasa.gov/searchosapicat/multi/{center}/patent/{category}/{page}/{page_size}/{query}
```

- `{center}` — `aw` (agencywide; default), `arc` Ames, `dfrc` Armstrong, `grc` Glenn, `gsfc` Goddard, `jpl` Jet Propulsion Lab, `jsc` Johnson, `ksc` Kennedy, `larc` Langley, `msfc` Marshall, `ssc` Stennis, `faa` Federal Aviation Administration (yes, FAA shares the catalog).
- `{category}` — either `all`, or one of the 15 known slugs: `aerospace`, `communications`, `electrical_and_electronics`, `environment`, `health_medicine_and_biotechnology`, `information_technology_and_software`, `instrumentation`, `manufacturing`, `materials_and_coatings`, `mechanical_and_fluid_systems`, `optics`, `power_generation_and_storage`, `propulsion`, `robotics_automation_and_control`, `sensors`.
- `{page}` — 1-based page number. Empty page beyond last returns `[]`.
- `{page_size}` — practical max is `~50`. Above that the response can exceed 1 MB and trip Browserbase Fetch's response cap (the upstream itself is happy with larger values; only the proxy hop fails). Use `9` to match the UI default, or `50` for batched scans, and paginate.
- `{query}` — URL-encoded free-text. Empty (trailing slash) returns the corpus.

Response is a JSON array of `{_index, _id, _score, _source}` hits sorted by Elasticsearch relevance score (descending — not by date). The `_source` object on each hit is the full patent record:

| Field | Type | Notes |
|---|---|---|
| `client_record_id`, `reference_number` | string | TOPS ID (e.g. `LEW-TOPS-34`); these two fields are always identical |
| `title`, `subtitle` | string | |
| `category`, `subcategory` | string | `category` is lowercase slug; `subcategory` is free-text |
| `center` | string | NASA center code (`GRC`, `LaRC`, `MSC`, `JPL`, …) |
| `abstract`, `tech_desc`, `benefit`, `application` | string | Full prose body. May contain HTML entities (`&#039;`, `&amp;`). |
| `applications_all` | string | Aggregated applications text |
| `case_numbers` | array of `{case_number: "..."}` | Internal NASA case IDs (one patent can wrap multiple cases) |
| `patent_number` | string | Granted USPTO numbers, semicolon-separated, comma-formatted (e.g. `"7,624,566; 10,273,944"`). Empty string when only pending / case-only. |
| `trl` | string | Technology Readiness Level 1–9, sometimes a range |
| `img1`–`img4` | string (URL) | Public S3-backed image URLs; `https://technology.nasa.gov/t2media/tops/img/{ID}/...` 301s to `ntts-prod.s3.amazonaws.com/t2p/prod/...` |
| `fig1`–`fig4` | string | Captions for `img1`–`img4` |
| `publications` | string | Optional citations |
| `push_date` | string | Epoch **milliseconds** (e.g. `"1427958000000"`) — date added to portal |
| `cname`, `cemail`, `cphone` | string | Licensing contact (almost always `Agency Licensing Concierge` / `NHQ-DL-T2-Support@mail.nasa.gov`) |
| `license_fee`, `evaluation_fee`, `annual_royalty`, `license_term`, `evaluation_lic_term` | string | Almost always empty in the public feed; fees are negotiated, not listed |

### 2. Direct lookup by NASA reference ID

The JSON API does **fuzzy** matching on `client_record_id`, so passing `LEW-TOPS-34` returns the 9 most-relevant `LEW-TOPS-*` records — not the exact one. For a known reference ID, fetch the detail HTML directly:

```
GET https://technology.nasa.gov/patent/{REFERENCE_ID}
```

- `200` → detail page rendered. Parse server-side fields directly from the HTML (selectors below).
- `302 Location: /404` → ID does not exist. Return `success: false, reason: "not_found"`.

HTML extraction selectors (no JS execution required — Drupal renders server-side):

| Field | Selector / regex |
|---|---|
| Title | `<h1 class="page-title">([^<]+)</h1>` |
| Reference number | `<span class="reference_number">([^<]+)` (also `(MSC-TOPS-89)` inline in the title block) |
| Category | first `<div class="category">([^<]+)</div>` |
| Subtitle | `<span class="subtitle">([^<]+)` |
| Abstract / Overview | `<div class="abstract body-text">(.*?)</div>` |
| Technology description | `<div class="tech_desc body-text">(.*?)</div>` |
| Benefits | `<div class="benefits">.*?<ul class="dashed">(.*?)</ul>` then split `<li>(.*?)</li>` |
| Applications | `<div class="applications">.*?<ul class="dashed">(.*?)</ul>` then split `<li>(.*?)</li>` |
| Case Number(s) | `<span class="case_number">([^<]+)</span>` (one `<span>` per case, repeated) |
| USPTO patent number(s) | `<span class="patent_number"><a href="...uspto.gov...">([^<]+)</a>` (one `<a>` per patent) |
| USPTO Pub Search URL | the `href` of the same `<a>` — points at `ppubs.uspto.gov/pubwebapp/external.html?q=(<num>).pn.&db=...` |
| Image URLs | `<img class="img1" src="(https://technology.nasa.gov/t2media/tops/img/{ID}/[^"]+)"` (also `img2`, `img3`, `img4`) |
| Tags | `<span class="tagLabel"><a href="/tags/([^"]+)"` (URL-decoded) |
| PDF download | `<a class="pdf-download" href="(/t2media/tops/pdf/{ID}.pdf)"` |

### 3. List by category (no query, no center)

```
GET https://technology.nasa.gov/searchosapicat/multi/aw/patent/{category}/{page}/9/
```

Same response shape. Use empty query (trailing slash with nothing after the page-size). Paginate until the array length is less than `{page_size}` — there is no `totalCount` field in the response, only the page itself.

### 4. List by NASA center (no query, all categories)

```
GET https://technology.nasa.gov/searchosapicat/multi/{center}/patent/all/{page}/9/
```

### 5. Lookup by USPTO patent number

**Not directly supported by the API.** The `patent_number` field stores formatted strings like `"7,624,566; 10,273,944"` and is not tokenized for digit-only search. Searches like `/searchosapicat/.../7624566` return low-score fuzzy garbage (none of the hits actually have that USPTO number on page 1). Searches with comma-formatted values like `7%2C624%2C566` return the literal empty object `{}`.

Three workable patterns:

1. **Scan and filter client-side.** Page through `/searchosapicat/multi/aw/patent/all/{page}/50/` and match `_source.patent_number` for the target USPTO number as a substring (after stripping commas and whitespace). The full catalog is on the order of a few thousand records — at 50/page that is ~80 round-trips.
2. **Pre-build an index from the agency feed** if the agent is going to do many USPTO-number lookups. Cache `{usptoNumber → referenceNumber}` from a one-time full crawl.
3. **Use the USPTO public bulk-data API directly** (`ppubs.uspto.gov`) — the T2 portal links out to it anyway via the `<a href="https://ppubs.uspto.gov/...">` on each detail page.

### Browser fallback

Use only if the JSON API ever returns 5xx (it did not during testing). All page-rendered surfaces are server-side HTML — no JS execution required:

- Search page: `https://technology.nasa.gov/search/multi/{center}/patent/9/{URL-encoded query}`. Response is HTML with `<div class="result">` blocks. Inside each: `<div class="category">...</div>`, `<div class="title">...</div>`, `<div class="description">...</div>`, and `<a href="/patent/{REFERENCE_ID}">Read more</a>`. The 5th URL segment (`9`) is a slot-id placeholder — does NOT control page size or page number, and changing it returns the same 12 results. There is no HTML pagination on the search page.
- Category browse: `https://technology.nasa.gov/patents/category/{category}/{center}/{page}/` — same `<div class="result">` structure, with real `/{page}/` pagination via the URL.
- Detail page: `https://technology.nasa.gov/patent/{REFERENCE_ID}` — same selectors as step 2.

The browser fallback adds no value over the JSON API for any of the discovery paths; it only exists to keep the skill resilient if NASA disables the undocumented `/searchosapicat/` endpoint without notice.

## Site-Specific Gotchas

- **The `searchosapicat` endpoint is undocumented.** It is invoked client-side from the "View More" button JavaScript on `/patents/category/*` and is not mentioned in NASA's published API docs (there are none for this portal). It could disappear without notice. If it 404s or starts returning HTML instead of JSON, fall back to scraping the server-rendered `<div class="result">` blocks on `/search/multi/...` and `/patents/category/...`.
- **`page_size` is bounded by the Browserbase Fetch 1 MB cap, not by NASA.** Upstream returns large pages happily, but `browse cloud fetch` truncates with `502 The response body exceeded the maximum allowed size of 1MB` once a single page exceeds ~1 MB. Empirically: `page_size=50` is safe for any single category; `page_size=99` works for narrow categories (e.g. `propulsion` has 15 records total) but fails for `all`. When in doubt, use `page_size=9` and paginate.
- **Direct ID search via the API does fuzzy match, not exact lookup.** `/searchosapicat/.../9/LEW-TOPS-34` returns 9 high-scoring `LEW-TOPS-*` records but `LEW-TOPS-34` itself is not guaranteed to be on the first page. For exact-ID lookup, always use the HTML detail page `/patent/{ID}` — it 200s on a hit and 302s to `/404` on a miss.
- **USPTO-number search is broken.** Numbers like `7624566` (digits only) and `7%2C624%2C566` (URL-encoded with commas) both produce useless results. The `patent_number` field is stored as a single formatted string with commas and semicolons, and is not tokenized for digit lookup. Treat the API as a topic/keyword/reference-number search engine only.
- **Default sort is relevance, not date.** `_score` (Elasticsearch BM25-ish) is the descending sort key. To get newest-first, sort the page client-side by `_source.push_date` (which is **epoch milliseconds**, not seconds — divide by 1000 if comparing against `Date.now()` in seconds).
- **`reference_number` vs `case_number` vs `patent_number` are three different things.**
  - `reference_number` (a.k.a. `client_record_id`): the NASA T2 "TOPS" ID — e.g. `LEW-TOPS-34`, `MSC-TOPS-89`, `TOP2-321`. This is the URL slug on `/patent/{ID}`.
  - `case_numbers[].case_number`: internal NASA tracking IDs — e.g. `LEW-19121-1`, `MSC-26347-1`. One patent may wrap several cases. Not usable as URL slugs.
  - `patent_number`: the **granted USPTO patent number(s)** — semicolon-separated, comma-formatted, often empty for patent-pending entries. Each value links to `ppubs.uspto.gov/pubwebapp/external.html?q=({num}).pn.&db=USPAT,USOCR,US-PGPUB`.
- **`/patent/{BOGUS_ID}` returns `302 Location: /404`, not `404 Not Found`.** Configure the HTTP client to follow at most 1 redirect, then check for `final.url === ".../404"` or `final.status === 200` — relying on the original `302` status alone is enough if you don't follow it.
- **`robots.txt` disallows `/search/`** but does not mention `/searchosapicat/` or `/patents/category/`. Respect a polite rate of ≤ 1 req/s. The site does not appear to enforce a hard rate limit (no challenges or 429s observed across ~30 fetches in the testing window), but be courteous.
- **Image URLs require following a redirect.** All `img*` / `fig*` URLs in the response point to `https://technology.nasa.gov/t2media/tops/img/{ID}/...` which 301s to `https://ntts-prod.s3.amazonaws.com/t2p/prod/t2media/tops/img/{ID}/...`. If you need the binary, fetch the redirect target. Most agents only need the URL, not the bytes.
- **Body text may contain HTML entities and curly-quote characters.** Sample observed: `NASA&#039;s` (apostrophe), `&amp;` (ampersand), `’` (U+2019), `–` (en-dash). HTML-decode before display or downstream NLP.
- **Center codes in `_source.center` are mixed-case and don't always match the URL center code.** URL uses `jpl`, `grc`, `larc`, `msfc`, …; the field uses `JPL`, `GRC`, `LaRC`, `MSFC`, …. Also the TOPS-ID prefix maps differently: `LEW-` is GRC, `MFS-` is MSFC, `MSC-` is JSC, `LAR-` is LaRC, `NPO-` is JPL, `DRC-` is DFRC, `KSC-` is KSC, `GSC-` is GSFC, and `TOP2-` is a multi-center / agencywide marker. Don't assume the prefix in the reference number tells you the URL center scope to use.
- **The corpus also contains non-TOPS reference IDs** (e.g. `US11847923B2` — appears to be a directly-imported USPTO ID, not assigned a NASA TOPS number). These follow the same record shape and the same `/patent/{ID}` URL pattern. Do not regex-filter to `^[A-Z]+-TOPS-` — you'll silently drop ~1–2 % of the catalog.
- **`/patents/category/{cat}/{center}/{page}/`'s server-rendered HTML only contains the first 9 results regardless of `{page}` value.** Pagination is implemented client-side via the JS "View More" button — that JS is what actually hits the `searchosapicat` endpoint. Don't bother changing `{page}` in the URL; either scrape the first 9 from the HTML or (better) call the API directly.

## Expected Output

### Per-patent record (canonical shape, returned by both API and HTML paths)

```json
{
  "reference_number": "MSC-TOPS-89",
  "title": "'Diamond Maker' Technology Simulates Subsurface Geology in Laboratories",
  "subtitle": "Allows researchers ability to speciate natural elements while investigating geologic processes",
  "category": "materials_and_coatings",
  "subcategory": "",
  "center": "MSC",
  "case_numbers": ["MSC-26347-1"],
  "patent_numbers": ["11,506,620"],
  "uspto_search_urls": [
    "https://ppubs.uspto.gov/pubwebapp/external.html?q=(11506620).pn.&db=USPAT,USOCR,US-PGPUB"
  ],
  "trl": "6",
  "abstract": "Innovators at NASA Johnson Space Center have developed a novel, double capsule control system…",
  "tech_desc": "Given the significant impact of fO2 on material properties, it is important to perform studies…",
  "benefits": [
    "Improves simulation of more extreme planetary interiors by yielding higher temperature (1600+C) and pressure values (20+GPa).",
    "Allows fO2 to be specified across wider ranges of values relevant to experimental samples."
  ],
  "applications": [
    "High pressure, high temperature geological studies",
    "Materials science and engineering"
  ],
  "tags": ["oxygen fugacity", "fO2", "astromaterial", "high pressure"],
  "images": [
    {"url": "https://technology.nasa.gov/t2media/tops/img/MSC-TOPS-89/mars_interior_2.jpg", "caption": ""}
  ],
  "pdf_url": "https://technology.nasa.gov/t2media/tops/pdf/MSC-TOPS-89.pdf",
  "detail_url": "https://technology.nasa.gov/patent/MSC-TOPS-89",
  "push_date_epoch_ms": 1640332800000,
  "contact": {
    "name": "Agency Licensing Concierge",
    "email": "NHQ-DL-T2-Support@mail.nasa.gov",
    "phone": ""
  }
}
```

### Search response (multiple records)

```json
{
  "query": "hall thruster",
  "center": "aw",
  "category": "propulsion",
  "page": 1,
  "page_size": 9,
  "results": [
    { "reference_number": "LEW-TOPS-34", "score": 17.43, "title": "Hall Effect Thruster Technologies", "...": "..." },
    { "reference_number": "LEW-TOPS-158", "score": 17.36, "title": "High Propellant Throughput Small Spacecraft Electric Propulsion Thruster", "...": "..." }
  ],
  "has_more": false
}
```

`has_more` is `true` whenever `results.length === page_size` (paginate); `false` whenever fewer items came back than requested. The API does not return a total count.

### Direct-ID lookup, not found

```json
{
  "success": false,
  "reason": "not_found",
  "reference_number_queried": "BOGUS-ID-123"
}
```

### USPTO-number lookup, asked but unsupported

```json
{
  "success": false,
  "reason": "uspto_number_search_unsupported",
  "hint": "Use ppubs.uspto.gov directly, or scan /searchosapicat with page_size=50 and filter _source.patent_number client-side."
}
```
