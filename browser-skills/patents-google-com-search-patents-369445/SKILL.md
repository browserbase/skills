---
name: patents-google-com-search-patents-369445
title: Google Patents Search
description: >-
  Search Google Patents (~140M+ worldwide publications) by free-text query,
  assignee, inventor, country, status, language, or date range — returns
  publication number, title, priority/filing/grant/publication dates, inventor,
  assignee, snippet, PDF URL, and canonical landing-page URL for each match.
website: patents.google.com
category: research
tags:
  - patents
  - search
  - research
  - google
  - ip
  - api
source: 'browserbase: agent-runtime 2026-05-20'
updated: '2026-05-20'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      When the /xhr/query endpoint is unreachable or returns the Google
      'Sorry...' rate-limit interstitial without a residential-proxy fallback,
      drive https://patents.google.com/?q=... and harvest results from the
      rendered SPA. ~3 browser turns per query vs. one HTTP fetch — use only on
      API failure.
verified: true
proxies: true
---
# Google Patents Search

## Purpose

Search Google Patents (`patents.google.com`) — the public index of ~140M+ worldwide patent publications — and return matching patents with their publication number, title, priority/filing/grant/publication dates, inventor, assignee, language, snippet, and canonical landing-page + PDF URLs. Read-only; never authenticates, never submits forms, never opens Google Account.

## When to Use

- Free-text patent search ("quantum computing", "lithium battery").
- Filtered patent search by assignee, inventor, country, status (granted vs application), language, or date range.
- Boolean / phrase / CPC queries against the title, abstract, claims, or full document.
- Bulk patent discovery feeding downstream PDF download (the `pdf` field plus the `patentimages.storage.googleapis.com` prefix yields a stable direct link).
- Anywhere you'd otherwise scrape the Google Patents results page — the public XHR endpoint is faster, structured, and avoids JS-rendering overhead.

## Workflow

The Google Patents web UI is a thin client over an undocumented but stable public JSON endpoint at `https://patents.google.com/xhr/query` — no auth, no cookies, no CSRF token, no anti-bot challenge on the endpoint itself. The endpoint takes one parameter, `url=`, whose value is the **URL-encoded form of the entire query string** that would normally appear after `patents.google.com/?` (i.e. double-encoded relative to the outer URL). Lead with the API; the browser path is a slow fallback that pays a ~100× turn-cost premium because the search page is fully JS-rendered (`browse snapshot` returns no useful refs until after the SPA hydrates).

**Stealth note:** the Google Sorry interstitial ("your computer or network may be sending automated queries", HTTP 503) trips after ~5–10 sequential requests from the same datacenter IP. Always fetch through residential proxies (`browse cloud fetch ... --proxies`) — every call gets a fresh exit IP and the rate-limit never fires. A bare session (no proxies) works for a handful of one-off queries but is not safe for any sustained workload.

### 1. Build the inner query string

Construct the query exactly as you would type it into the URL bar of patents.google.com, then URL-encode the **entire** string and stuff it into `url=`.

Inner-query parameters (these go inside the `url=` value):

| Param | Purpose | Examples |
|---|---|---|
| `q` | Free-text query. Supports phrases (`"…"`), boolean (`AND`/`OR`), exclusion (`-term`), field prefixes (`TI=`/`AB=`/`CL=`/`TAC=`), CPC codes (`CPC=B60R22`), chemistry (`SSS=`/`SMARTS=`). Words are AND-ed by default with left associativity (so `safety OR seat belt` parses as `(safety OR seat) AND belt`). | `q=quantum+computing` |
| `assignee` | Filter by assignee (company / org). | `assignee=google` |
| `inventor` | Filter by inventor name. | `inventor=hinton` |
| `country` | Two-letter publication-office code. | `country=US`, `country=CN`, `country=EP` |
| `status` | `GRANT` or `APPLICATION`. | `status=GRANT` |
| `language` | Language of the publication. | `language=ENGLISH` |
| `before` / `after` | Date filter. Prefix the date with the date type: `publication:`, `priority:`, `filing:`, `grant:`. Format is `YYYYMMDD`. | `before=publication:20240101`, `after=priority:20100101` |
| `sort` | `new` (newest first) or `old` (oldest first). Omit for relevance (default). | `sort=new` |
| `num` | Results per page. Default 10, max 100. | `num=25` |
| `page` | 1-indexed page number. **Hard cap of 1000 results total** across all pages (`num × page ≤ 1000`); beyond that the API returns an empty result set even though `total_num_results` may report millions. | `page=2` |

### 2. Fetch the endpoint

```bash
INNER='q=quantum+computing&num=25&page=1&sort=new'
URL_ENC=$(node -e "console.log(encodeURIComponent(process.argv[1]))" "$INNER")
browse cloud fetch "https://patents.google.com/xhr/query?url=${URL_ENC}&exp=" --proxies
```

The `&exp=` trailing parameter is required and always empty. The response wraps a JSON envelope around the page payload; parse `.content` as JSON to get the real result object.

### 3. Parse the result envelope

The inner JSON has shape:

```jsonc
{
  "results": {
    "total_num_results": 127800,   // total hits matching the query
    "total_num_pages": 100,        // pages available (capped — see step 1)
    "many_results": false,
    "num_page": 0,                 // 0-indexed page number of THIS response
    "cluster": [                   // exactly one cluster for ungrouped searches;
      {                            // empty result[] when zero hits
        "result": [ { "id": "...", "rank": 0, "patent": { ... } }, ... ]
      }
    ],
    "summary": "...",
    "landscape": { ... }
  }
}
```

For each item in `cluster[0].result`, the `patent` sub-object carries the fields you actually want: `title`, `publication_number`, `priority_date`, `filing_date`, `grant_date` (may be absent for applications), `publication_date`, `inventor`, `assignee`, `language`, `snippet`, and `pdf` (a relative path).

**Strip HTML highlighting tags** — `title` and `snippet` contain `<b>…</b>` around query-term matches and HTML entities (`&hellip;`, `&#34;`). A simple `replace(/<[^>]*>/g, '')` plus entity decode produces clean text.

### 4. Construct canonical URLs

- **Landing page:** `https://patents.google.com/patent/{publication_number}/en` (the `/en` suffix forces the English-translated view for non-English publications).
- **PDF:** `https://patentimages.storage.googleapis.com/{patent.pdf}` (the `pdf` field is the relative path, e.g. `85/df/92/f5ac6f65349817/JP7446622B2.pdf`). Empty `pdf` field means no PDF is hosted (occasionally true for very recent applications).

### 5. Paginate

Increment `page=` until `num_page >= total_num_pages - 1`. Because Google caps accessible results at 1000, choose `num=100` if you need depth (10 pages max) and `num=10` if you only need the relevance-top results.

### Browser fallback

If the XHR endpoint is unreachable (extended outage, regional block — not observed in our trace) drive the search UI:

```bash
sid=$(browse cloud sessions create --keep-alive --proxies --verified | grep -o '"id": "[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
browse open "https://patents.google.com/?q=quantum+computing&num=25" --remote --session "$sid"
browse get markdown body --remote --session "$sid"
```

Parse the rendered markdown for the result blocks (titles are h2 links, the publication number appears immediately under the title with a link to `patentimages.storage.googleapis.com/.../{pubnum}.pdf`). This costs ~3 browser turns per query vs. one HTTP fetch, so only fall back if the API actually fails.

## Site-Specific Gotchas

- **Double URL-encoding is required.** The `url=` parameter wraps an already-encoded query string. If you single-encode (treating `url=q=quantum computing` as one flat query string) the endpoint silently returns the global-relevance landing page with `total_num_results` from an empty query. Always: build the inner query string first, then `encodeURIComponent` the whole thing and assign to `url=`.
- **`&exp=` is mandatory.** Omitting the empty `exp` parameter returns a 400 in some response paths. Always include `&exp=` (no value).
- **1000-result hard ceiling.** Google reports `total_num_results: 127800` but `total_num_pages` × `num` never exceeds 1000. To enumerate beyond the top-1000, narrow the query (date slices, CPC codes, assignee filters) and re-page each slice. Identical-page requests beyond the ceiling return an empty `cluster[0].result` with the same `total_num_results` — there is no error, just silence.
- **Rate-limit interstitial is HTML, not JSON.** After ~5–10 rapid sequential requests from a single datacenter IP, the endpoint returns a 503 with an HTML body titled "Sorry..." ("your computer or network may be sending automated queries"). Parse defensively — check `Content-Type` or check that the first byte is `{`. Use `--proxies` (residential rotation) and the rate-limit never fires across hundreds of queries.
- **Inventor / assignee names are not Latin-script-normalized.** A patent originally filed in Japan returns its inventor and assignee in Japanese characters (e.g. `プーリ，シュルティ`, `イェール ユニバーシティー`); the Chinese-language equivalents appear in Simplified Chinese (`王鑫`, `北京百度网讯科技有限公司`). The `/en` landing page exposes the English transliteration but the XHR API does not. If you need a Latin form, you must fetch the landing page.
- **HTML in `title` and `snippet` fields.** Search-term matches are wrapped in `<b>…</b>` and the snippet ends in `&hellip;`. Decode entities and strip tags before display.
- **`grant_date` is sometimes missing.** Applications that have not been granted have only `priority_date`, `filing_date`, and `publication_date`. Treat `grant_date` as optional.
- **`pdf` field can be empty string.** Most patents have a PDF; very recent applications, withdrawn entries, and some non-US jurisdictions don't. Test for empty string, not `null`.
- **Default operator quirk.** `q=safety OR seat belt` is parsed as `(safety OR seat) AND belt`, not `safety OR (seat belt)`. Use explicit parens or phrase quotes (`"seat belt"`) to disambiguate.
- **`num=` ignored above 100.** Setting `num=500` returns 100 results and shifts the cap accordingly. Do not assume larger pages give you more depth.
- **Don't bother with GraphQL discovery.** Network inspection shows no GraphQL surface — the XHR endpoint is the entire API. Don't waste turns hunting `/graphql` or `/api/v1/`; they don't exist.

## Expected Output

JSON envelope for a normal search (10 results / page, default sort):

```jsonc
{
  "query": "quantum computing",
  "total_num_results": 127800,
  "total_num_pages": 100,
  "num_page": 0,
  "results": [
    {
      "title": "Quantum information processing using asymmetric error channels",
      "publication_number": "JP7446622B2",
      "priority_date": "2018-06-29",
      "filing_date": "2019-06-28",
      "grant_date": "2024-03-11",
      "publication_date": "2024-03-11",
      "inventor": "プーリ，シュルティ",
      "assignee": "イェール ユニバーシティー",
      "language": "en",
      "snippet": "For example, it is known that certain computational problems can be solved more efficiently using quantum computing rather than traditional classical computing...",
      "pdf_url": "https://patentimages.storage.googleapis.com/85/df/92/f5ac6f65349817/JP7446622B2.pdf",
      "canonical_url": "https://patents.google.com/patent/JP7446622B2/en"
    },
    {
      "title": "Quantum computing service with local edge devices supporting multiple quantum computing technologies",
      "publication_number": "US11650869B2",
      "priority_date": "2019-11-27",
      "filing_date": "2019-11-27",
      "grant_date": "2023-05-16",
      "publication_date": "2023-05-16",
      "inventor": "Jeffrey Paul Heckey",
      "assignee": "Amazon Technologies, Inc.",
      "language": "en",
      "snippet": "a photon based quantum computer. 6. The system of claim 1, wherein the one or more computing devices that implement the quantum computing service are configured to...",
      "pdf_url": "https://patentimages.storage.googleapis.com/28/a0/9d/323bb84148dd61/US11650869.pdf",
      "canonical_url": "https://patents.google.com/patent/US11650869B2/en"
    }
  ]
}
```

Zero-results envelope:

```jsonc
{
  "query": "xyzqzx99asdfblahNoMatchPossible",
  "total_num_results": 0,
  "total_num_pages": 0,
  "num_page": 0,
  "results": []
}
```

Rate-limited (interstitial) sentinel — agent should retry with `--proxies` or back off:

```jsonc
{
  "query": "lithium battery",
  "error": "rate_limited",
  "http_status": 503,
  "message": "Google 'Sorry...' interstitial returned. Retry through residential proxy or wait ~30s."
}
```
