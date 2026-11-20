---
name: sec-gov-search-edgar-fulltext-dpk6r2
title: SEC EDGAR Full-Text Filing Search
description: >-
  Search the full document text of SEC EDGAR filings (10-K, 10-Q, 8-K, S-1, DEF
  14A, 13F, Forms 3/4/5, etc., since 2001) via the public efts.sec.gov JSON
  endpoint and return matching filings with accession number, filer, form type,
  dates, SIC, state of incorporation, matching exhibit filename, and
  document/index URLs.
website: sec.gov
category: finance
tags:
  - sec
  - edgar
  - filings
  - full-text-search
  - finance
  - regulatory
  - api
source: 'browserbase: agent-runtime 2026-06-04'
updated: '2026-06-04'
recommended_method: fetch
alternative_methods:
  - method: api
    rationale: >-
      The efts.sec.gov/LATEST/search-index endpoint IS a public JSON API —
      'fetch' and 'api' are the same path here. No auth, no cookies, no captcha;
      only a descriptive User-Agent header and a 10 req/s rate limit.
  - method: browser
    rationale: >-
      The human UI at sec.gov/edgar/search/ is a hash-routed React client over
      the same endpoint. Use only if the JSON endpoint is unreachable — it is
      strictly slower and returns identical data.
verified: false
proxies: false
---
# SEC EDGAR Full-Text Filing Search

## Purpose

Search the body text of SEC filings (10-K, 10-Q, 8-K, S-1, 424B, DEF 14A, SC 13D/G, 13F-HR, Forms 3/4/5, N-PX, etc., back to 2001) and return matching filings as structured JSON: accession number, filer name + CIK, form type, filing date, period of report, SIC + state of incorporation, the matching exhibit filename, and the canonical filing-index + direct-document URLs. Distinct from EDGAR's filing-*metadata* browse — this searches the full document text. Read-only.

EDGAR full-text search is backed by a **public JSON endpoint** (`https://efts.sec.gov/LATEST/search-index`) with no auth, no cookies, and no captcha. Lead with that endpoint; the human UI at `https://www.sec.gov/edgar/search/` is a thin React client over the same API and is only a fallback.

## When to Use

- Find every filing that mentions a phrase ("material weakness", "going concern", "force majeure", "climate risk disclosure") across all filers, optionally narrowed by form type, date range, filer, location, or SIC.
- Monitor new filings matching a query (e.g. all 8-Ks mentioning a topic in the last 30 days).
- Pull the matching exhibit URL so a downstream step can fetch the document and extract the surrounding context.
- Anywhere you'd otherwise scrape the EDGAR full-text search results page — the JSON API is faster, cheaper, and structurally reliable.

## Workflow

Hit the JSON endpoint directly with an HTTP GET. SEC's fair-access policy **requires a descriptive `User-Agent` header** that identifies the requester (`User-Agent: Sample Company contact@example.com`) — a missing or generic UA gets a 403. No auth, cookies, or proxy are needed. Rate-limit to **≤ 10 requests/second**.

1. **Build the request URL:**

   ```
   GET https://efts.sec.gov/LATEST/search-index
       ?q=<query>
       &forms=<f1,f2,...>
       &dateRange=custom&startdt=YYYY-MM-DD&enddt=YYYY-MM-DD
       &ciks=<0000320193,...>          # optional
       &entityName=<company name>       # optional
       &locationCodes=<CA,NY,...>       # optional
       &locationType=incorporated       # optional (default = located-in)
       &from=<offset>                   # optional, pagination
   Header: User-Agent: Sample Company contact@example.com
   ```

   **`q` syntax:**
   - Bare phrase → exact phrase match (`q="climate risk"` runs `match_phrase` on `doc_text`).
   - Wrap in escaped quotes for a literal exact phrase: `q=%22force majeure%22`.
   - Boolean operators are supported: `AND`, `OR`, `NOT`, and parentheses.

   **Filters:**
   - `forms` — comma-separated EDGAR root form codes (`10-K`, `10-Q`, `8-K`, `S-1`, `424B`, `DEF 14A`, `SC 13D`, `SC 13G`, `13F-HR`, `4`, `3`, `5`, `N-PX`). Filters on `root_forms`, so `10-K` also captures `10-K/A` amendments.
   - `dateRange=custom` + `startdt`/`enddt` (`YYYY-MM-DD`). The API applies the `file_date` range purely from `startdt`/`enddt`; named UI ranges (`last30d`, `last1y`, …) are just shortcuts the UI converts to explicit dates.
   - `ciks` — comma-separated, zero-padded 10-digit CIKs.
   - `entityName` — free-text company/person name (resolves against the entity index).
   - `locationCodes` — comma-separated 2-letter state/country codes; default semantics = principal-office *located-in*. Add `locationType=incorporated` to switch to *state of incorporation*. **Note the param is `locationCodes` (plural) — `locationCode` (singular) is silently ignored.**

2. **Parse the response** (Elasticsearch-shaped JSON):
   - `hits.total.value` — total result count, **capped at 10000** (check `hits.total.relation`: `eq` = exact, `gte` = at least). The returned slice is partial whenever this exceeds what you fetched.
   - `hits.hits[]` — up to **100 hits per request** (the page size is server-fixed at 100; the *UI* shows 10, but the raw API returns 100). Each hit:
     - `_id` = `"{accession}:{filename}"` — split on `:` to get the accession number and the matching exhibit filename.
     - `_source.adsh` — accession number (e.g. `0000815097-24-000011`).
     - `_source.ciks[]`, `_source.display_names[]` — arrays (co-registrants produce multiple); `display_names` look like `"CARNIVAL CORP  (CCL)  (CIK 0000815097)"` — take the substring before `  (` for the clean filer name.
     - `_source.form`, `_source.file_date`, `_source.period_ending`, `_source.sics[]`, `_source.inc_states[]`, `_source.biz_states[]`, `_source.biz_locations[]`, `_source.items[]` (8-K item codes).
   - `aggregations` — facet bucket counts (`form_filter`, `entity_filter`, `sic_filter`, `biz_states_filter`, top 30 each) for building a faceted summary without extra requests.

3. **Construct the URLs** (not returned by the API — derive them):
   - `cikInt = parseInt(_source.ciks[0])` (strip leading zeros) → `815097`
   - `accNoDash = _source.adsh.replace(/-/g, "")` → `000081509724000011`
   - `filename` = part after `:` in `_id`
   - **Direct document URL:** `https://www.sec.gov/Archives/edgar/data/{cikInt}/{accNoDash}/{filename}`
   - **Filing index URL:** `https://www.sec.gov/Archives/edgar/data/{cikInt}/{accNoDash}/{adsh}-index.htm`

4. **Snippet (if the caller needs the matching excerpt):** the API does **not** return it (see gotcha). Fetch the direct document URL with the same `User-Agent` and locate the query terms in the document text yourself, wrapping them in your own highlight markers.

5. **Paginate** if `hits.total.value` exceeds 100: re-request with `from=100`, `from=200`, … up to **`from=9900`** (the 10000-result Elasticsearch window cap). Beyond that, narrow the query (tighter date range / form filter) instead.

### Browser fallback

Only if the JSON endpoint is unreachable. The human UI is a hash-routed React app:

```
https://www.sec.gov/edgar/search/#/q=%22climate%20risk%22&forms=10-K&dateRange=custom&startdt=2024-01-01&enddt=2024-03-31
```

`browse open` the hash URL, `browse wait timeout 3000` (results render after an XHR to the same `efts.sec.gov` endpoint), dismiss the occasional "We'd welcome your feedback" survey modal (click **No thanks**), then read the results table. This is strictly slower and yields the same data as the API — prefer the API.

## Site-Specific Gotchas

- **The API never returns the matching text snippet.** The server-side query hard-codes `_source: { exclude: ["doc_text"] }` and configures no highlighter, so there is no `highlight` field and no excerpt in any response — only filing metadata + the matching exhibit filename (in `_id`). To get the actual matched text you must fetch the document URL and search it client-side. Passing your own `&_source=...` param does **not** override this — it is ignored.
- **A descriptive `User-Agent` is mandatory.** SEC's fair-access policy rejects empty/default UAs with `403`. Use `User-Agent: Your Company you@example.com`. (`browse cloud fetch` and a real browser session send an acceptable UA automatically; a bare `fetch`/`requests`/`curl` with no UA gets blocked.)
- **Transient `{"message": "Internal server error"}` (HTTP 500).** Observed intermittently on otherwise-valid requests (hit during testing and during an autobrowse iteration). It clears on an immediate retry of the identical URL — build in **one retry** before treating a 500 as fatal.
- **Page size is 100, not 10.** The UI paginates by 10, but the raw endpoint returns up to 100 hits per call with no size param. Don't assume 10.
- **Total count caps at 10000** with `relation: "gte"`. You cannot page past `from=9900`; narrow the query to see more.
- **`locationCodes` is plural.** `locationCode` (singular) is silently dropped (returns unfiltered results). Default = located-in; `locationType=incorporated` switches to state of incorporation.
- **Arrays for co-registrants.** `ciks`, `display_names`, `biz_states`, `sics`, `biz_locations` are arrays — a single filing can list multiple filers (e.g. Carnival Corp + Carnival plc). Use index `[0]` for the primary filer unless you need all.
- **`display_names` needs parsing.** Format is `"NAME  (TICKER)  (CIK 0000123456)"` (double-spaced). Split on `  (` for the clean name; the trailing `(CIK …)` already gives you the zero-padded CIK if you'd rather regex it out than read `ciks[]`.
- **`forms` matches root form types.** `forms=10-K` also returns `10-K/A` amendments; `forms=4` returns Form 4 ownership filings. There is no exact-form-string filter — filter `_source.form` client-side if you need to exclude amendments.
- **No SIC *query* param.** SIC appears only as an aggregation facet (`sic_filter`) and in each hit's `_source.sics[]`. To filter by SIC, filter the returned hits client-side on `_source.sics`.
- **Coverage starts 2001.** Full-text indexing does not cover filings before 2001; older filings won't appear regardless of date range.
- **No anti-bot.** No Akamai, captcha, login, or proxy requirement observed — a bare (non-stealth, non-proxy) request succeeds. Don't waste a residential proxy on this.

## Expected Output

```json
{
  "success": true,
  "query": "\"climate risk\"",
  "forms": ["10-K"],
  "date_range": { "start": "2024-01-01", "end": "2024-03-31" },
  "total_results": 281,
  "total_relation": "eq",
  "returned": 100,
  "from": 0,
  "facets": {
    "by_form": [{ "form": "10-K", "count": 281 }],
    "by_state": [{ "state": "NY", "count": 51 }, { "state": "CA", "count": 31 }],
    "by_sic": [{ "sic": "6022", "count": 57 }]
  },
  "results": [
    {
      "accession_number": "0000815097-24-000011",
      "filer_name": "CARNIVAL CORP",
      "filer_cik": "0000815097",
      "all_filers": ["CARNIVAL CORP  (CCL)  (CIK 0000815097)", "CARNIVAL PLC  (CUK, CUKPF)  (CIK 0001125259)"],
      "form_type": "10-K",
      "filing_date": "2024-01-26",
      "period_of_report": "2023-11-30",
      "sic": "4400",
      "state_of_incorporation": "DE",
      "business_state": "FL",
      "matching_file": "ccl-20231130.htm",
      "document_url": "https://www.sec.gov/Archives/edgar/data/815097/000081509724000011/ccl-20231130.htm",
      "filing_index_url": "https://www.sec.gov/Archives/edgar/data/815097/000081509724000011/0000815097-24-000011-index.htm",
      "snippet": null
    }
  ]
}
```

`snippet` is `null` from the API alone; populate it only if a follow-up document fetch was performed (see Workflow step 4).

**No results:**

```json
{ "success": true, "query": "\"asdfqwerzxcv nonexistent phrase\"", "total_results": 0, "returned": 0, "results": [] }
```

**Transient upstream error (after the one retry also fails):**

```json
{ "success": false, "error_reasoning": "EDGAR returned HTTP 500 {\"message\":\"Internal server error\"} on two consecutive attempts" }
```
