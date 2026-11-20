---
name: wikicfp-com-search-cfp-deadlines-ocdcpn
title: Search WikiCFP for CFP Deadlines and URLs
description: >-
  Search WikiCFP by topic or keyword to return matching calls-for-papers with
  their submission deadlines, event dates, locations, and canonical WikiCFP
  URLs; optionally drill into an event for its full deadline breakdown and
  external site.
website: wikicfp.com
category: research
tags:
  - research
  - academic
  - call-for-papers
  - conferences
  - deadlines
source: 'browserbase: agent-runtime 2026-07-25'
updated: '2026-07-25'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      Works identically (pages are server-rendered) but is slower and costlier;
      use only if a proxied fetch is ever blocked, which was not observed.
  - method: api
    rationale: >-
      No official JSON/REST API exists. The event-detail pages embed RDFa
      microdata (v:startDate) as the closest structured-data source.
verified: false
proxies: true
---
# Search WikiCFP for CFP Deadlines and URLs

## Purpose
Given a research topic or keyword, this skill returns the matching Calls-for-Papers (CFPs) listed on WikiCFP — each with its event acronym, full name, canonical WikiCFP event URL, event dates ("When"), location ("Where"), and submission deadline. It can also drill into a single event to return the full deadline breakdown (abstract registration, submission, notification, camera-ready) plus the external conference website. This is a **read-only** lookup. The optimal path is a plain HTTP GET against WikiCFP's server-rendered listing pages — no browser, no JavaScript, and no login are required.

## When to Use
- "What are the upcoming CFP deadlines for machine learning / NLP / robotics / <topic>?"
- "Find conferences about <topic> and their paper submission deadlines."
- "Give me the WikiCFP page and deadline for <conference acronym>."
- "List calls-for-papers closing soon in <field>, with links."
- Building a deadline tracker / digest that needs the event URL + submission date for many conferences.

## Workflow

WikiCFP has **no JSON/REST API**, but every listing page is fully server-rendered HTML that a proxied HTTP GET retrieves in one shot. Prefer fetch+parse over driving a browser — it is faster, cheaper, and returns the exact same data (verified: a browser run and a raw fetch produced byte-identical results).

### 1. Choose the right listing endpoint

- **Topic / category listing (recommended default)** — results ordered by deadline (soonest first):
  ```
  http://www.wikicfp.com/cfp/call?conference=<topic>&page=<N>
  ```
  `<topic>` may contain spaces or `%20` (e.g. `machine%20learning`). Pagination via `&page=1..last`.

- **Keyword search** — matches both categories and CFPs, and lets you scope by year:
  ```
  http://www.wikicfp.com/cfp/servlet/tool.search?q=<query>&year=<t|n|f|a>
  ```
  `year`: `t` = current year (2026), `n` = next year (2027), `f` = current-year-and-later (2026+), `a` = all years. This page renders a "Matched Categories" block (links back into `call?conference=`) followed by a "Matched Call For Papers" results table.

### 2. Fetch the HTML (residential proxy)
```bash
browse cloud fetch "http://www.wikicfp.com/cfp/call?conference=machine%20learning" --proxies
```
Returns `{ "statusCode": 200, "content": "<html>…" }`. The server is Apache/Tomcat and occasionally returns a transient `500` (especially the bare homepage) — just retry once.

### 3. Parse the results table
The results live in a `<table>` where **each CFP spans two `<tr>` rows** (rows alternate `bgcolor="#f6f6f6"` / `#e6e6e6`):
- **Row 1:** `<a href="/cfp/servlet/event.showcfp?eventid=NNNNN&copyownerid=MMM">ACRONYM</a>` (event link + acronym) and, in a `colspan="3"` cell, the full event name. A trailing `<img src="/cfp/images/new.gif">` marks newly-posted CFPs — strip it.
- **Row 2:** three cells — **When** (date range, or `N/A` for journals/rolling CFPs), **Where** (location, or `N/A`), **Deadline** (submission date).

Build the **canonical event URL** by keeping only `eventid`: `http://www.wikicfp.com/cfp/servlet/event.showcfp?eventid=NNNNN` (drop `copyownerid`). All `href`s are site-relative — prefix with `http://www.wikicfp.com`.

Total count and page count come from the footer: `Total of 6412 CFPs in 321 pages`, with `first | previous | Page N | next | last` links carrying the `&page=` param.

### 4. (Optional) Drill into one event for full deadlines
```bash
browse cloud fetch "http://www.wikicfp.com/cfp/servlet/event.showcfp?eventid=190474" --proxies
```
The detail page exposes machine-readable **RDFa microdata** — each deadline is `<span property="v:startDate" content="2026-02-08T00:00:00">Feb 8, 2026</span>` under labelled rows (`Abstract Registration Due`, `Submission Deadline`, `Notification Due`, `Final Version Due`). Prefer the ISO `content` attribute over the display text. The external conference site is in a `Link:` row (`<a href="https://kdd2026.kdd.org/" target="_newtab">`).

### Browser fallback
Only needed if fetch is blocked (not observed on this site). Drives identically:
```bash
browse open "http://www.wikicfp.com/cfp/call?conference=machine%20learning" --remote
browse wait timeout 1500 --remote
browse snapshot --remote      # accessibility tree; the same two-row-per-CFP table
browse get markdown body --remote
```
Stop at the listing/detail screen — never click "Add to My List", Register, or Login.

## Site-Specific Gotchas
- **No official API.** Fetch+parse of the HTML listing is the shortcut; do not waste time hunting for a JSON endpoint — there isn't one. RDFa on the detail page (`property="v:startDate"`) is the closest thing to structured data.
- **Homepage probe is unreliable, content endpoints are fine.** The pre-run probe of `https://wikicfp.com/` timed out; that's the slow Tomcat homepage, not anti-bot. The `/cfp/call`, `/cfp/servlet/tool.search`, and `/cfp/servlet/event.showcfp` endpoints all return clean `200`s. **No anti-bot, no captcha, no Akamai/Cloudflare** observed across fetches and two browser iterations.
- **Use `www.wikicfp.com`.** Both `wikicfp.com` and `www.wikicfp.com` serve, but detail-page share/RDFa URLs are emitted with the `www` host — normalize to it for consistency.
- **Two rows per CFP.** Parsing row-by-row without pairing them will split each conference's name from its dates. Pair on the alternating `bgcolor` or the `rowspan="2"` on the acronym/checkbox cells.
- **`N/A` When/Where is normal.** Journals and rolling/standing CFPs (e.g. `IJSPTM`, `IJCNC`) show `N/A` for When and Where but still carry a Deadline. Don't treat this as an error.
- **`call?conference=` is deadline-ordered; `tool.search` is relevance-ordered.** For "closing soon" use `call?conference=`. For scoping to a specific year use `tool.search` with the `year` param (`t`/`n`/`f`/`a`).
- **Deadlines get extended.** The listing always shows the *current* deadline; a value in the past (e.g. today's date) usually means the CFP is closing today or was recently extended.
- **Transient 500s.** Apache-Coyote occasionally 500s under load — retry once before declaring failure.
- **Legacy HTML.** Pages are HTML 4.01 / XHTML with deeply nested `<table>`s and almost no semantic classes on data cells — parse by table structure, not CSS selectors. Strip the `new.gif` image and stray whitespace/`&nbsp;` from acronym cells.
- **Robots meta.** Topic pages are `INDEX,NOFOLLOW`; the `tool.search` page is `NOINDEX,NOFOLLOW`. This is read-only public data; respect rate limits and keep request volume modest when paginating (321 pages for a broad topic).

## Expected Output

Search / listing result:
```json
{
  "success": true,
  "query": "machine learning",
  "endpoint": "http://www.wikicfp.com/cfp/call?conference=machine%20learning",
  "total_results": 6412,
  "total_pages": 321,
  "page": 1,
  "results": [
    {
      "acronym": "CSMLA 2026",
      "name": "IEEE 2026 International Conference on Computer Science, Machine Learning and Intelligent Agents-EI/Scopus",
      "url": "http://www.wikicfp.com/cfp/servlet/event.showcfp?eventid=189830",
      "when": "Aug 7, 2026 - Aug 9, 2026",
      "where": "Qujing, China",
      "deadline": "Jul 24, 2026"
    },
    {
      "acronym": "IJSPTM 2026",
      "name": "International Journal of Security, Privacy and Trust Management",
      "url": "http://www.wikicfp.com/cfp/servlet/event.showcfp?eventid=195010",
      "when": "N/A",
      "where": "N/A",
      "deadline": "Jul 25, 2026"
    }
  ],
  "error_reasoning": null
}
```

Single-event detail (from `event.showcfp?eventid=`):
```json
{
  "success": true,
  "acronym": "KDD 2026",
  "name": "32nd ACM SIGKDD Conference on Knowledge Discovery and Data Mining",
  "url": "http://www.wikicfp.com/cfp/servlet/event.showcfp?eventid=190474",
  "external_link": "https://kdd2026.kdd.org/",
  "when": "Aug 9, 2026 - Aug 13, 2026",
  "where": "Jeju, Korea",
  "deadlines": {
    "abstract_registration_due": "2026-02-01",
    "submission_deadline": "2026-02-08",
    "notification_due": "2026-05-16",
    "final_version_due": null
  },
  "categories": ["data mining", "machine learning", "knowledge discovery"],
  "error_reasoning": null
}
```

No matches:
```json
{
  "success": true,
  "query": "asdfqwerty",
  "total_results": 0,
  "results": [],
  "error_reasoning": null
}
```

Failure (e.g. repeated 5xx / network block):
```json
{
  "success": false,
  "query": "machine learning",
  "results": [],
  "error_reasoning": "WikiCFP returned HTTP 500 on 3 consecutive fetches of /cfp/call?conference=machine%20learning"
}
```
