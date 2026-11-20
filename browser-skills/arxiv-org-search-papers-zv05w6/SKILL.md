---
name: arxiv-org-search-papers-zv05w6
title: arXiv Search Papers
description: >-
  Search arXiv for preprints by free-form query, field operators
  (ti/au/abs/cat/jr/co/rn), category, date range, or arXiv ID, and return
  structured paper records (title, authors, abstract, primary + cross-listed
  categories, submitted/updated dates, version, comments, journal_ref, DOI,
  PDF/abs URLs) plus total result count. Read-only.
website: arxiv.org
category: research
tags:
  - arxiv
  - research
  - papers
  - academic
  - atom-api
  - read-only
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      The Atom API does not support field-search for DOI, ORCID, ACM
      classification, or MSC classification, and has no API equivalent of the
      'Cross-listed only' toggle. For those four cases, fall through to
      https://arxiv.org/search/?searchtype=doi|orcid_id (or /search/advanced for
      ACM/MSC), parse the rendered HTML for arXiv IDs, then re-fetch the IDs via
      id_list= for full structured metadata.
verified: false
proxies: false
---
# arXiv Search Papers

## Purpose

Search arXiv for preprints matching a query — full-text, by-field, by-category, by-date-range, or by arXiv ID — and return structured paper records (title, authors, abstract, primary + cross-listed categories, submission + update dates, version, comments, journal reference, DOI, PDF/abs/HTML URLs) plus the region-wide total result count. Read-only — no submission interface, no login, no moderation actions.

## When to Use

- Literature review / daily monitoring of a category (`cat:cs.LG` newest first).
- Resolve a known arXiv ID (`2401.12345`, `hep-th/9711200`) to a full metadata record.
- Find all papers by an author (`au:LeCun`) or matching a title fragment (`ti:"diffusion models"`).
- Paginate a large result set (any combination of filters; `<opensearch:totalResults>` tells you the universe size).
- Filter by submission window (`submittedDate:[YYYYMMDDHHMM TO YYYYMMDDHHMM]`) or last-updated window (`lastUpdatedDate:...`).
- Look up papers by report number (`rn:CERN-PH-TH`), journal reference (`jr:"Phys.Rev.Lett"`), or comments-field text (`co:"NeurIPS 2024"`).
- Anywhere you'd otherwise scrape `https://arxiv.org/search/?...` — the Atom API is faster, structurally cleaner, and the documented public interface.

## Workflow

arXiv ships a stable, public, fully documented Atom XML API at `https://export.arxiv.org/api/query`. **The API is the recommended path** — no auth, no anti-bot, no JS rendering, no cookies, no proxies, no stealth session. Every advanced-search-UI dimension except DOI/ORCID/ACM/MSC field-search and the "Cross-listed only" toggle maps directly to one or more URL query params; those four exceptions need the HTML fallback (see the bottom of this section).

The browser fallback is genuinely a fallback — the search results page IS server-rendered HTML, but each results card holds ~5× less information than the Atom entry (no abstract body, no comment, no DOI tag, no version number). Lead with the API.

### 1. Map the request to the API query

Build a URL of shape:

```
https://export.arxiv.org/api/query
    ?search_query=<expr>
    &id_list=<csv-of-ids>
    &start=<N>
    &max_results=<N>
    &sortBy=<relevance|submittedDate|lastUpdatedDate>
    &sortOrder=<ascending|descending>
```

`search_query` and `id_list` are mutually exclusive in spirit — set whichever the request needs and leave the other empty (the server tolerates both being passed).

**Field prefixes inside `search_query`** (combine with `+AND+`, `+OR+`, `+ANDNOT+`; group with `%28...%29`):

| UI label | API prefix | Example |
|---|---|---|
| All fields | `all:` | `all:transformer` |
| Title | `ti:` | `ti:%22attention+is+all+you+need%22` |
| Author | `au:` | `au:vaswani` |
| Abstract | `abs:` | `abs:diffusion` |
| Comments | `co:` | `co:%22NeurIPS+2024%22` |
| Journal reference | `jr:` | `jr:%22Phys.Rev.Lett%22` |
| Report number | `rn:` | `rn:CERN-PH-TH` |
| Subject category | `cat:` | `cat:cs.LG` |
| arXiv identifier | `id:` | `id:1706.03762` *(prefer `id_list=` instead — see step 2)* |

**Phrase quoting**: wrap multi-word terms in URL-encoded double quotes (`%22two+words%22`). Without quotes, terms are treated as separate tokens with implicit `AND`.

**Wildcards** (per arXiv API docs): `?` matches a single character, `*` matches zero+ characters. Place wildcards on the right of a token; left-anchored wildcards are not supported.

**Multi-category** (UI's category multi-select): `cat:cs.LG+OR+cat:cs.AI`. For a multi-cat AND date-range query: `%28cat:cs.LG+OR+cat:cs.AI%29+AND+submittedDate:%5B202401010000+TO+202401312359%5D`.

**Date range**:
- `submittedDate:[YYYYMMDDHHMM+TO+YYYYMMDDHHMM]` — submission date of v1
- `lastUpdatedDate:[YYYYMMDDHHMM+TO+YYYYMMDDHHMM]` — last version's update date
- **URL-encode the brackets as `%5B` and `%5D`** — leaving them bare returns `400 body/url must match format "uri"` from the Browserbase Fetch wrapper.

**Specific year** (UI's "Specific year" field) → date range over Jan 1 – Dec 31:
`submittedDate:%5BYYYY01010000+TO+YYYY12312359%5D`.

**Sort** (UI dropdown):

| UI label | API params |
|---|---|
| Relevance | `sortBy=relevance` (default; omit) |
| Announcement date (newest first) | `sortBy=submittedDate&sortOrder=descending` *(announcement ≈ submission for v1; see gotcha)* |
| Announcement date (oldest first) | `sortBy=submittedDate&sortOrder=ascending` |
| Submission date (newest first) | `sortBy=submittedDate&sortOrder=descending` |
| Submission date (oldest first) | `sortBy=submittedDate&sortOrder=ascending` |
| Last updated (newest first) | `sortBy=lastUpdatedDate&sortOrder=descending` |

**Pagination**: `max_results=<N>&start=<offset>`. UI presets {25, 50, 100, 200} all valid. arXiv server cap is `max_results=2000`, but the **Browserbase Fetch wrapper enforces a 1MB body limit, which corresponds to ~200 entries per page** in practice — request `max_results=500` and Fetch returns `502 The response body exceeded the maximum allowed size of 1MB`. Stay ≤ 200 per page through `browse cloud fetch`, or use a direct HTTPS client (real `curl` outside the sandbox, or a `browse open --remote` session for the XML) if you genuinely need larger pages. Paginate by incrementing `start` by `max_results`.

### 2. Resolve specific paper(s) by arXiv ID

For lookups of one or more known IDs, use `id_list=<csv>` and leave `search_query` empty:

```
https://export.arxiv.org/api/query?id_list=1706.03762,hep-th/9711200,2401.12345
```

- New-style IDs: `YYMM.NNNNN` (5 digits since 2015) or `YYMM.NNNN` (4 digits before).
- Old-style IDs: `archive/YYMMNNN` with NO subcategory dot — `hep-th/9711200`, `cs/0605041`. The dot-style `cs.CL/0605041` returns 0 results.
- To pin to a specific version, append `vN`: `id_list=1706.03762v1` returns v1's metadata (submission date + abstract as of v1) instead of the latest. The default response always returns the latest version's metadata.

### 3. Fetch and parse the Atom XML

```bash
export BROWSERBASE_API_KEY="$BB_API_KEY"
browse cloud fetch "$URL" --allow-redirects --output /tmp/results.xml
```

**`--allow-redirects` is mandatory** — `http://export.arxiv.org/api/query` 301-redirects to `https://`, and without `--allow-redirects` the Fetch call returns `statusCode: 301, sizeBytes: 0` (empty body, no error).

Parse the Atom envelope:

- `feed/opensearch:totalResults` — universe-wide count for this query (the "Showing 1-25 of X results" number from the UI).
- `feed/opensearch:itemsPerPage` — echoes `max_results`.
- `feed/opensearch:startIndex` — echoes `start`.

Per `<entry>`:

| Atom path | Field |
|---|---|
| `entry/id` | `http://arxiv.org/abs/{ID}v{N}` — strip `vN` for canonical id, keep `N` as `version` |
| `entry/title` | Title (trim; may contain embedded newlines from XML formatting) |
| `entry/summary` | Abstract (trim; usually has leading whitespace) |
| `entry/published` | v1 submission date (ISO 8601) |
| `entry/updated` | Last-version update date (ISO 8601) |
| `entry/author/name` | Author name (ordered list — preserve order) |
| `entry/author/arxiv:affiliation` | Author affiliation when surfaced (rarely present) |
| `entry/arxiv:primary_category[@term]` | Primary category, e.g. `cs.LG` |
| `entry/category[@term]` | All cross-listed categories (multiple `<category>` tags; first usually duplicates primary) |
| `entry/arxiv:comment` | Free-text comments — page count, conference acceptance, code links (sparse) |
| `entry/arxiv:journal_ref` | Journal reference when published (sparse) |
| `entry/arxiv:doi` | DOI when set (sparse) |
| `entry/arxiv:msc_class` | MSC classification (sparse, math-heavy papers) |
| `entry/arxiv:acm_class` | ACM classification (sparse, older CS papers) |
| `entry/arxiv:report_no` | Report number (sparse, lab-affiliated papers) |
| `entry/link[@rel="alternate"]/@href` | Abstract page URL (`https://arxiv.org/abs/{ID}v{N}`) |
| `entry/link[@rel="related" and @type="application/pdf"]/@href` | PDF URL (`https://arxiv.org/pdf/{ID}v{N}`) |
| `entry/link[@rel="related" and @title="doi"]/@href` | DOI resolver URL (present iff `arxiv:doi` is) |

The author-search URL (UI surfaces per-author hyperlinks) is constructed client-side: `https://arxiv.org/a/{lastname}_{firstinitial}_1.html` is unreliable — prefer `https://arxiv.org/search/?searchtype=author&query=<URL-enc-name>`.

### 4. Throttle

arXiv's API best-practices doc requests **≤ 1 request per 3 seconds** sustained. The server doesn't enforce a hard rate limit but will throttle aggressive clients. For bulk dumps of thousands of papers, prefer the OAI-PMH endpoint at `https://export.arxiv.org/oai2` (out of scope for this skill but documented at <https://info.arxiv.org/help/oa/index.html>).

### Browser fallback — only for the four API-blind dimensions

The Atom API genuinely doesn't support these four advanced-search dimensions:

| Dimension | HTML fallback |
|---|---|
| **DOI** (search by DOI) | `https://arxiv.org/search/?searchtype=doi&query=<URL-enc-DOI>` |
| **ORCID** (search by author ORCID) | `https://arxiv.org/a/<orcid-id>` (author landing) or `https://arxiv.org/search/?searchtype=orcid_id&query=<orcid>` |
| **ACM classification** field-search | `https://arxiv.org/search/advanced` → set "Field" to ACM class |
| **MSC classification** field-search | `https://arxiv.org/search/advanced` → set "Field" to MSC class |
| **"Cross-listed only" toggle** | Hit the API, then client-side filter to entries where `arxiv:primary_category != target_cat AND <category term="target_cat"> is present` |

For these, fetch the HTML search page:

```bash
browse cloud fetch "https://arxiv.org/search/?searchtype=doi&query=10.1103/PhysRevD.77.096009&start=0" \
  --allow-redirects --output /tmp/html-search.html
```

Parse results from each `<li class="arxiv-result">` block:
- arXiv ID: `<a href="https://arxiv.org/abs/{ID}">arXiv:{ID}</a>`
- Title: `<p class="title is-5 mathjax">...</p>` (trim whitespace)
- Authors: `<p class="authors"><a href="/search/?searchtype=author&query=...">Name</a>...</p>`
- Abstract: `<p class="abstract mathjax">` — short and long modes; click "More" replaces; the `<span class="abstract-full">` tag holds the long form
- Submitted date: `<p class="is-size-7"><span class="has-text-black-bis">Submitted</span> {date}` and similarly for "originally announced"
- Subjects: `<span class="primary-subject">...</span>` and trailing secondary `<span>`s

Total count: `<h1 class="title is-clearfix">Showing 1–25 of X results...</h1>`.

Once you have the IDs from the HTML, **re-fetch them via `id_list=` on the API** to get the full structured metadata — the HTML is field-poorer than Atom.

## Site-Specific Gotchas

- **`http://...` redirects to `https://...`; `--allow-redirects` is mandatory** when calling via `browse cloud fetch`. Bare `browse cloud fetch http://export.arxiv.org/api/query?...` returns `statusCode: 301, sizeBytes: 0` with no error message. Switch to `https://export.arxiv.org/...` directly to avoid the redirect entirely.
- **Browserbase Fetch caps response bodies at ~1 MB.** `max_results=200` returns ~430 KB and works; `max_results=500` returns `502 The response body exceeded the maximum allowed size of 1MB. Use a browser session to handle large responses.` Practical page size through `cloud fetch` is **≤ 200 entries**. arXiv's server-side cap is 2000.
- **`max_results=10` is the silent default** when omitted. Even with `id_list=` requesting >10 IDs, the server returns only the first 10 unless `max_results` is set higher.
- **URL-encode date-range brackets.** `submittedDate:[202401010000 TO 202401312359]` with literal `[` and `]` fails with `400 body/url must match format "uri"`. Use `%5B` and `%5D`.
- **Old-style IDs use `archive/YYMMNNN` without the subcategory dot.** `hep-th/9711200` works (returns Maldacena's AdS/CFT paper); `cs.CL/0605041` returns `totalResults=0` — use `cs/0605041` for that vintage of paper.
- **`<id>` always includes the version suffix** (e.g. `http://arxiv.org/abs/1706.03762v7`). The canonical "current" id without version is the substring before `v`. If a request asks for the canonical id, strip the trailing `vN`.
- **`<entry>` defaults to the latest version's metadata.** `id_list=1706.03762` returns v7's `<updated>` (2023) and v7's abstract. To get v1 specifically, pass `id_list=1706.03762v1`. This is the "Include older versions" UI toggle's API equivalent — you query each version explicitly.
- **`<arxiv:doi>`, `<arxiv:journal_ref>`, `<arxiv:comment>`, `<arxiv:msc_class>`, `<arxiv:acm_class>`, `<arxiv:report_no>` are all optional.** They appear only when the author set them; most modern ML preprints have none of them, while published physics papers usually carry `doi` + `journal_ref` + `comment`. Never assume presence.
- **Title and summary text often have leading whitespace and embedded newlines** from the XML pretty-printer. Always trim and collapse internal whitespace before emitting.
- **`/list/<cat>/<YYMM>` HTML URL format changed.** The legacy `https://arxiv.org/list/cs.LG/2401` returns 404. The current format is `https://arxiv.org/list/cs.LG/2024-01` (full-year + month with hyphen). Normalize legacy `YYMM` to `YYYY-MM` before fetching. Equivalent API query: `cat:cs.LG+AND+submittedDate:%5B202401010000+TO+202401312359%5D`.
- **DOI, ORCID, ACM, MSC are returned but NOT queryable in the API.** The Atom feed surfaces `<arxiv:doi>` and `<arxiv:acm_class>` etc. when present in metadata, but `search_query=doi:...` and `search_query=msc_class:...` are not valid field prefixes. Use the HTML advanced-search fallback documented above for these four cases.
- **"Cross-listed only" toggle has no direct API equivalent.** Issue the regular `cat:X` query, then client-side keep only entries where `arxiv:primary_category != X` and `<category term="X">` is present.
- **arXiv's "announcement date" ≈ submission date for new papers, but differs for cross-lists and replacements.** The API only exposes `submittedDate` (v1) and `lastUpdatedDate` (latest version). True announcement date (the UI's "Announcement date" sort) is not separately retrievable; treat `sortBy=submittedDate&sortOrder=descending` as the closest analog and accept ~0–2 day drift.
- **Throttle to ≤ 1 req / 3 s.** Documented best practice. No hard 429s observed in this skill's validation but expect them under sustained higher load. For bulk dumps, use the OAI-PMH bulk endpoint instead.
- **`co:` (comments) search is full-text but heuristic.** A search for `co:"NeurIPS 2024"` returns 2,254 hits — including papers that mention "NeurIPS 2024" in the comments field for any reason (rejected, accepted, submitted to). It's NOT a curated acceptance index.

## Expected Output

```json
{
  "query": {
    "search_query": "ti:transformer AND au:vaswani",
    "id_list": null,
    "sortBy": "relevance",
    "sortOrder": "descending",
    "start": 0,
    "max_results": 25
  },
  "total_results": 5,
  "items_per_page": 25,
  "start_index": 0,
  "papers": [
    {
      "arxiv_id": "1706.03762",
      "version": 7,
      "canonical_id_with_version": "1706.03762v7",
      "title": "Attention Is All You Need",
      "authors": [
        { "name": "Ashish Vaswani", "affiliation": null,
          "author_search_url": "https://arxiv.org/search/?searchtype=author&query=Ashish+Vaswani" },
        { "name": "Noam Shazeer", "affiliation": null, "author_search_url": "..." }
      ],
      "abstract": "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks...",
      "submitted_date": "2017-06-12T17:57:34Z",
      "updated_date": "2023-08-02T00:41:18Z",
      "primary_category": "cs.CL",
      "categories": ["cs.CL", "cs.LG"],
      "is_cross_listed_in": ["cs.LG"],
      "comment": "15 pages, 5 figures",
      "journal_ref": null,
      "doi": null,
      "doi_url": null,
      "msc_class": null,
      "acm_class": null,
      "report_no": null,
      "abs_url": "https://arxiv.org/abs/1706.03762v7",
      "pdf_url": "https://arxiv.org/pdf/1706.03762v7",
      "html_url": "https://arxiv.org/html/1706.03762v7"
    },
    {
      "arxiv_id": "hep-th/9711200",
      "version": 3,
      "canonical_id_with_version": "hep-th/9711200v3",
      "title": "The Large N Limit of Superconformal Field Theories and Supergravity",
      "authors": [{ "name": "Juan M. Maldacena", "affiliation": null, "author_search_url": "..." }],
      "abstract": "We show that the large $N$ limit of certain conformal field theories...",
      "submitted_date": "1997-11-27T23:53:13Z",
      "updated_date": "1998-01-22T15:42:41Z",
      "primary_category": "hep-th",
      "categories": ["hep-th"],
      "is_cross_listed_in": [],
      "comment": "20 pages, harvmac, v2: section on AdS_2 corrected, references added, v3: More references and a sign in eqns 2.8 and 2.9 corrected",
      "journal_ref": "Adv.Theor.Math.Phys.2:231-252,1998",
      "doi": "10.1023/A:1026654312961",
      "doi_url": "https://doi.org/10.1023/A:1026654312961",
      "msc_class": null,
      "acm_class": null,
      "report_no": null,
      "abs_url": "https://arxiv.org/abs/hep-th/9711200v3",
      "pdf_url": "https://arxiv.org/pdf/hep-th/9711200v3",
      "html_url": "https://arxiv.org/html/hep-th/9711200v3"
    }
  ]
}
```

For an ID-list query that finds nothing (e.g. malformed old-style id):

```json
{
  "query": { "id_list": "cs.CL/0605041" },
  "total_results": 0,
  "papers": [],
  "warning": "Old-style arXiv IDs use 'archive/YYMMNNN' without subcategory dot — try 'cs/0605041' instead."
}
```

For a DOI/ORCID/MSC/ACM query (falls through to HTML fallback):

```json
{
  "query": { "searchtype": "doi", "query": "10.1103/PhysRevD.77.096009" },
  "source": "html-fallback",
  "total_results": 1,
  "papers": [
    {
      "arxiv_id": "0710.5491",
      "title": "Effects of the Regularization on the Restoration of Chiral and Axial Symmetries",
      "submitted_date": "2007-10-29",
      "primary_category": "hep-ph",
      "abs_url": "https://arxiv.org/abs/0710.5491",
      "note": "Re-fetch via id_list=0710.5491 for full structured metadata."
    }
  ]
}
```
