---
name: hud-ac-uk-find-program-details-lpn0qn
title: Find University of Huddersfield Program Details
description: >-
  Retrieve details for University of Huddersfield academic programs — list every
  course or fetch one course's level, duration, start dates, delivery mode,
  entry requirements, fees, and modules — via the coursefinder's SearchStax/Solr
  JSON API, with a prerendered-page and browser fallback.
website: hud.ac.uk
category: education
tags:
  - education
  - university
  - courses
  - catalog
  - higher-education
  - search
source: 'browserbase: agent-runtime 2026-07-25'
updated: '2026-07-25'
recommended_method: api
alternative_methods:
  - method: fetch
    rationale: >-
      Individual course pages are prerendered HTML, so a plain GET on
      {course_url} returns fully-populated details (tuition fee, UCAS tariff,
      entry requirements, modules) with no JS execution.
  - method: browser
    rationale: >-
      Fallback when the client-side SearchStax token is unavailable/rotated and
      can't be re-scraped; drive the Vue coursefinder via deep-linked search
      URLs and extract with 'browse get text body'.
verified: false
proxies: false
---
# Find University of Huddersfield Program Details

## Purpose
Retrieve details for academic programs (courses) offered by the University of Huddersfield — either a full listing of every course or the details of a specific program. Returns per-course fields such as title, study level, academic year, duration, start dates, delivery mode/flags, the course URL, and (for a given course) the full overview, entry requirements, modules, careers, and tuition fee. This is a **read-only** skill. The fastest and most complete path is the site's own JSON search API (SearchStax/Solr `emselect`), which returns all 787 course records; individual course pages are prerendered HTML that can be fetched for the remaining structured fields (fee, UCAS tariff, module lists).

## When to Use
- "List every undergraduate/postgraduate course at Huddersfield" (optionally filter by year, level, or delivery mode).
- "Get the details for a named program" (e.g. *Computer Science BSc(Hons)*, 2026-27).
- Comparing courses by duration, start date, study level, or delivery flag (Distance Learning, Apprenticeship, Foundation Year, etc.).
- Building a dataset/export of the full Huddersfield course catalogue.
- Looking up entry requirements, tuition fees, or module lists for a specific course.

## Workflow

The University's coursefinder (`https://courses.hud.ac.uk/`) is a Vue SPA backed by a hosted SearchStax/Solr index. **Do not scrape the SPA to enumerate courses** — query the same JSON endpoint the app uses.

### Recommended method — SearchStax `emselect` JSON API

1. **Endpoint & auth.** The coursefinder ships its (client-side, non-secret) read token in the page source. Send it as a header — the token is **not** accepted as a query param.
   - URL: `https://searchcloud-1-eu-west-2.searchstax.com/29847/huddersfielddevelopment-4954/emselect`
   - Header: `Authorization: Token 0887c7290da5f22a63dfbac3af780f99103df2fc`
   - Method: `POST` (or `GET`) with `Content-Type: application/x-www-form-urlencoded`
   - If the token has rotated, re-scrape it: `GET https://courses.hud.ac.uk/` and read `config.searchAuth` from the inline `<script>` (also exposes `searchURL`, `suggesterURL`, `searchProfile: "Coursefinder"`).

2. **Restrict to courses.** The index holds ~9,900 mixed docs (web pages, PDFs, news). Filter to course records only:
   - `fq=sectionType_s:course` → 787 course documents.

3. **Query / paginate.** Standard Solr params apply:
   - List everything: `q=*:*&fq=sectionType_s:course&rows=100&start=0&wt=json` (page with `start`, `rows`).
   - Search by keyword: `q=computer science` (dismax over title/content).
   - Filter: add `fq=study_level_s:Undergraduate`, `fq=year_s:2026-27`, `fq=flags_list_ss:"Distance Learning"`.
   - Trim the payload with `fl=searchTitle_t,study_level_s,year_s,start_dates_s,duration_t,flags_list_ss,url,content`.
   - Facet for catalogue structure: `facet=true&facet.field=study_level_s&facet.field=year_s&facet.field=flags_list_ss`.

4. **Read the results.** Each doc in `response.docs` gives the summary fields plus a `content` field containing the full page text (overview, entry requirements, modules, careers). For most "program details" needs this single call is sufficient.

5. **Enrich a specific course (optional).** For clean structured fields not broken out in Solr (tuition fee, UCAS tariff points, per-year module lists), the course page itself is **prerendered HTML** — fetch it directly (no JS execution needed):
   - `GET {doc.url}` e.g. `https://courses.hud.ac.uk/2026-27/undergraduate/computer-science-bsc-hons/` returns fully-populated HTML with the fee (`£9,790`), UCAS tariff, A-Level/BTEC/T-Level entry criteria, and module lists.

### Browser fallback (when the API token is unavailable or has changed and you can't re-scrape it)

1. `browse open https://courses.hud.ac.uk/ --remote` (no stealth needed — see Gotchas).
2. Dismiss the CiviC "Your choice regarding cookies" banner (click **Accept** / **Agree**) — it overlays the `<h1>`, so ignore `h1` text for page identification.
3. Deep-link a search instead of typing: `https://courses.hud.ac.uk/?searchstax[query]=computer%20science&searchstax[model]=Coursefinder` (URL-encode the brackets).
4. Click the target course card to open its detail page (URL pattern `/{year}/{level}/{slug}/`).
5. Extract with `browse get text body` — **not** `browse snapshot`. Wait ~2s (`browse wait timeout 2000`) after navigation for the Vue app to hydrate before reading.

## Site-Specific Gotchas
- **Anti-bot: none.** `hud.ac.uk` and `courses.hud.ac.uk` returned no bot protection across the whole run. A **bare** Browserbase session (no `--verified`, no `--proxies`) works; the successful runs used neither. The SearchStax endpoint is a third-party host with no bot protection either.
- **Auth is header-only.** `emselect` returns `401 {"message":"Unauthorized"}` with no token *and* when the token is passed as a `?token=` query param. It only accepts `Authorization: Token <searchAuth>`. `browse cloud fetch` cannot send custom headers, so run the API call from an HTTP client that can (curl/python/node), or from inside the page context via `browse eval` (same-origin, CORS is open to `courses.hud.ac.uk`).
- **The Solr collection is named `huddersfielddevelopment-4954`** — this is genuinely what the production coursefinder queries; don't assume it's a staging index you shouldn't use. That said, a small number of not-yet-launched records (e.g. some Clearing-only courses) contain placeholder text like `testtesttest` / `Content` / `a good job 3sgdsdg` in their `content` field. Treat obviously templated content as incomplete rather than real.
- **Always filter `fq=sectionType_s:course`.** Without it you get news, PDFs, and general web pages. Facet values on `type_s` are file types (web page/pdf/docx), not course levels.
- **Duplicate records per academic year.** Most courses appear once per year (`year_s` = `2026-27` and `2027-28`), so a course like *Computer Science MSc* shows up twice with different URLs. Dedupe on title or filter `fq=year_s:<year>` if you want one row per course. Totals: 787 records = 387 (2026-27) + 394 (2027-28) + a few Clearing/other.
- **`study_level_s` casing.** Real values are `Undergraduate` (422) and `Postgraduate` (365). Lowercase `undergraduate`/`postgraduate` buckets exist in facets but are empty — match the capitalised forms.
- **Delivery modes live in `flags_list_ss`** (multi-valued): `On-Campus`, `Distance Learning`, `Short Course`, `Top-Up`, `Apprenticeship`, `Foundation Year`, `Teacher Training`, `Blended Learning`, `Research Degree`.
- **Course detail pages are prerendered**, so `browse cloud fetch {course_url}` returns the full content (fee/UCAS/entry text) without needing to render JS — but the *coursefinder home/search* results are client-rendered and must be reached via the API or a hydrated browser.
- **In the browser, prefer `browse get text body` over `browse snapshot`.** During testing `browse snapshot` intermittently failed (returned a CLI "update available" notice instead of the tree); text extraction was reliable. Wait ~2s for Vue hydration first.
- **Cookie banner overrides `<h1>`.** Until dismissed, `document.querySelector('h1')` returns "Your choice regarding cookies on this site" — use the URL or page title to confirm you're on the right course, not the h1.
- There is also an AWS API Gateway (`https://8dg66giahj.execute-api.eu-west-2.amazonaws.com/ProdStage/`) referenced only as a hidden honeypot link in the DOM — **do not call it**; it is bait for scrapers, not a data source.

## Expected Output

Listing shape (from the `emselect` API, one object per course record):

```json
{
  "total_courses": 787,
  "query": { "q": "*:*", "fq": ["sectionType_s:course", "year_s:2026-27"] },
  "courses": [
    {
      "title": "Computer Science BSc(Hons)",
      "study_level": "Undergraduate",
      "year": "2026-27",
      "duration": "3 years full-time 4 years inc. placement year",
      "start_dates": "21 September 2026",
      "delivery_flags": ["On-Campus"],
      "url": "https://courses.hud.ac.uk/2026-27/undergraduate/computer-science-bsc-hons/"
    },
    {
      "title": "Computer Science MSc",
      "study_level": "Postgraduate",
      "year": "2026-27",
      "duration": "1 year full-time",
      "start_dates": "Multiple start dates",
      "delivery_flags": ["On-Campus"],
      "url": "https://courses.hud.ac.uk/2026-27/postgraduate/computer-science-msc/"
    }
  ],
  "facets": {
    "study_level_s": { "Undergraduate": 422, "Postgraduate": 365 },
    "year_s": { "2027-28": 394, "2026-27": 387 },
    "flags_list_ss": {
      "On-Campus": 698, "Distance Learning": 89, "Short Course": 81,
      "Top-Up": 53, "Apprenticeship": 48, "Foundation Year": 38,
      "Teacher Training": 24, "Blended Learning": 20, "Research Degree": 6
    }
  }
}
```

Single-program detail shape (API summary fields + fields enriched from the prerendered course page):

```json
{
  "success": true,
  "title": "Computer Science BSc(Hons)",
  "study_level": "Undergraduate",
  "year": "2026-27",
  "duration": "3 years full-time 4 years inc. placement year",
  "start_dates": "21 September 2026",
  "delivery_flags": ["On-Campus"],
  "tuition_fee": "£9,790",
  "typical_entry_requirements": "BBB-BBC at A Level. DMM in BTEC Level 3 Extended Diploma. 120-112 UCAS tariff points from a combination of Level 3 qualifications. Merit at T Level. GCSE English at grade 4+ and Maths at grade 5+.",
  "url": "https://courses.hud.ac.uk/2026-27/undergraduate/computer-science-bsc-hons/",
  "error_reasoning": null
}
```

Not-found shape (no course matches the query):

```json
{
  "success": false,
  "total_courses": 0,
  "courses": [],
  "error_reasoning": "No course records matched q='<term>' with fq=sectionType_s:course."
}
```
