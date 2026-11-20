---
name: calcareers-ca-gov-search-california-state-jobs-dgl84s
title: Search California State Jobs
description: >-
  Search the CalCareers ASP.NET portal by keyword and location, apply filters
  (department, classification, telework, salary range, etc.), and extract
  structured listings with title, department, Job Control Number, salary range,
  location, filing deadline, and canonical detail URL. Read-only.
website: calcareers.ca.gov
category: jobs
tags:
  - jobs
  - government
  - california
  - asp-net
  - calcareers
  - read-only
source: 'browserbase: agent-runtime 2026-05-20'
updated: '2026-05-20'
recommended_method: browser
alternative_methods:
  - method: browser
    rationale: >-
      CalCareers is an ASP.NET WebForms portal with DevExpress ASPx controls. No
      public JSON/REST search API exists (only an unrelated /api/glossary
      endpoint). AdvancedJobSearch.aspx ignores GET query params and
      JobSearchResults.aspx carries no URL search state — criteria live in the
      server-side ASP.NET session. Form submission with DevExpress client-API
      field setting is the only reliable path.
verified: true
proxies: true
---
# Search California State Jobs

## Purpose

Search the California state government jobs portal (calcareers.ca.gov) by keyword and location, apply filters (department, job categories, classification, telework, posting age, work type, schedule, salary range, application method), and return structured listings — each with title, working title, department, job control number (JC#), salary range, location/county, work type/schedule, telework status, publish date, filing deadline, and canonical detail URL. Read-only — never clicks "Apply" / never starts an application flow.

## When to Use

- A user asks "what California state jobs are open for {role} in {county}?"
- Daily monitoring of newly posted state jobs by keyword/department/classification.
- Bulk extraction of openings for a department (e.g., "all Caltrans openings closing in the next 30 days").
- Looking up a specific job by its Job Control number (the portal calls this JC# — it is the canonical posting ID).
- Surveying salary ranges for a classification series across departments.

## Workflow

CalCareers is an **ASP.NET WebForms portal with DevExpress ASPx controls** — there is no public JSON/REST search API (only an unrelated `/api/glossary/getglossaryitembytext` endpoint), no GET-query-string search shortcut on `AdvancedJobSearch.aspx`, and the results page (`JobSearchResults.aspx`) has **no query params** — search state lives in the server-side ASP.NET session keyed by `ASP.NET_SessionId`. The recommended path is therefore the browser flow: open the form, set fields via the DevExpress client API, submit, then DOM-scrape result cards. Anti-bot is light (Azure Front Door + Application Gateway, no Akamai/captcha); `--verified --proxies` is **not strictly required** but recommended for stability.

### 1. Open the Advanced Job Search form

```
https://calcareers.ca.gov/CalHRPublic/Search/AdvancedJobSearch.aspx
```

The page is a standard ASP.NET WebForm (`<form id="form1" method="post" action="./AdvancedJobSearch.aspx">`) carrying `__VIEWSTATE`, `__VIEWSTATEGENERATOR`, `__EVENTVALIDATION`, and `__EVENTTARGET` hidden fields. Wait `load`, then `wait timeout 1500` — the Classification combobox loads its values via a follow-up AJAX callback.

### 2. Set search fields via the DevExpress client API

The page exposes each ASPx control as a global JS object named after the input's `id`. Use the `.SetText(label)` method, which resolves a human-readable label to its internal numeric ID and writes both visible text + the hidden `_VI` value:

```js
// Keyword (plain text input)
document.getElementById('cphMainContent_txtKeyword').value = 'Engineer';

// Job Control Number direct lookup (skip everything else if known)
document.getElementById('cphMainContent_txtJobControlId').value = '518581';

// Location (DevExpress ASPxComboBox)
window.cphMainContent_ddlLocation.SetText('Sacramento County');
// .GetValue() now returns 418 (internal numeric ID)

// Other combos:
window.cphMainContent_ddlDepartment.SetText('Department of Transportation');
window.cphMainContent_ddlJobCategories.SetText('Information Technology');
window.cphMainContent_ddlClassification.SetText('STAFF SERVICES ANALYST');
window.cphMainContent_ddlTelework.SetText('Hybrid');
window.cphMainContent_ddlPostedIn.SetText('Last 7 Days');
window.cphMainContent_ddlWorkType.SetText('Permanent');
window.cphMainContent_ddlWorkSchedlue.SetText('Fulltime');   // NB: site typo — "Schedlue"
window.cphMainContent_ddlSalaryRange.SetText('$5,000 - $7,499');
window.cphMainContent_ddlApplicationMethod.SetText('Electronic');
```

All combos accept the **exact** label string shown in their dropdown — passing an unrecognized string leaves `.GetValue()` null and the filter is silently ignored. Verify each set: `loc.GetValue() !== null && loc.GetText() === 'Sacramento County'`.

### 3. Submit the form

```js
document.getElementById('cphMainContent_btnSearch').click();
```

Wait for navigation to `https://calcareers.ca.gov/CalHRPublic/Search/JobSearchResults.aspx` (note: **no query string** — the URL hash may carry `#kw=...&loc=...` for browser back-button state, but server state lives in the ASP.NET session). Wait `load`, then `wait timeout 1500` for the results grid to render.

### 4. (Recommended) Raise page size to 100 before extracting

The default page size is 10. Setting it to 100 collapses most searches into a single page:

```js
const sel = document.getElementById('cphMainContent_ddlRowCount');
sel.value = '100';
sel.dispatchEvent(new Event('change', {bubbles: true}));
```

A full postback follows (~2–3 s). Sort order can be changed identically with `#cphMainContent_ddlSortBy` (values: `Relevance DESC`, `PublishDate DESC`, `PublishDate ASC`, `Department ASC`, `Department DESC`, `Classification ASC`, `Classification DESC`, `FilingDeadline DESC`, `FilingDeadline ASC`, `Salary ASC`, `Salary DESC`).

### 5. Extract structured listings from the DOM

Every result card contains a title `<a href=".../JobPosting.aspx?JobControlId={N}">` plus a labelled-row block (`Working Title:`, `Job Control:`, `Salary Range:`, `Work Type/Schedule:`, `Department:`, `Location:`, `Telework:`, `Publish Date:`, `Filing Deadline:`). Each card has **two** anchors with the same `JobControlId` (title link + "View Job Posting" link) — dedupe by JCID:

```js
const seen = new Set();
const listings = [];
document.querySelectorAll('a[href*="JobControlId="]').forEach(a => {
  const m = a.href.match(/JobControlId=(\d+)/);
  if (!m || seen.has(m[1])) return;
  seen.add(m[1]);
  // walk up to the card div that contains "Job Control:"
  let card = a.closest('div');
  while (card && !card.textContent.includes('Job Control:')) card = card.parentElement;
  if (!card) return;
  const txt = card.innerText;
  const ext = label => {
    const re = new RegExp('^\\s*' + label + ':?\\s*$\\n\\s*(.+?)$', 'm');
    return txt.match(re)?.[1].trim() || null;
  };
  listings.push({
    job_control_number: m[1],
    title: a.textContent.trim(),
    working_title: ext('Working Title'),
    salary_range: ext('Salary Range'),
    work_type_schedule: ext('Work Type/Schedule'),
    department: ext('Department'),
    location: ext('Location'),
    telework: ext('Telework'),
    publish_date: ext('Publish Date'),
    filing_deadline: ext('Filing Deadline'),
    detail_url: `https://www.calcareers.ca.gov/CalHrPublic/Jobs/JobPosting.aspx?JobControlId=${m[1]}`,
  });
});
```

Also read total count from page text: `/(\d+)\s*job\(s\) found/i`.

### 6. Paginate (only if total > page size)

Pager renders as anchors `1 2 3 … 10 … >>` with `href="javascript:__doPostBack('ctl00$cphMainContent$ucRepeaterPager$rptPager$ctlNN$btnPagerItem','')"`. **`ctlNN` is a zero-padded index into the visible pager strip, NOT the page number** — `ctl00` is the first visible page (page 1 when on early pages; could be page 11 if you've scrolled), `ctl10` is the `…` jump-by-10 link, `ctl11` is `>>`. Don't compute the index from page number; instead match the anchor's visible text:

```js
const link = [...document.querySelectorAll('a[href*="rptPager"]')]
  .find(a => a.textContent.trim() === String(targetPage));
link.click();   // triggers __doPostBack, full server roundtrip ~1–3s
```

Re-extract listings after each `wait timeout 2500`.

### 7. (Optional) Get the detail page for a single JCID

Canonical detail URL is:

```
https://www.calcareers.ca.gov/CalHrPublic/Jobs/JobPosting.aspx?JobControlId={N}
```

The detail page has H2 sections: `Job Description and Duties`, `Working Conditions`, `Minimum Requirements`, `Additional Documents`, `Position Details`, `Department Information`, `Special Requirements`, `Application Instructions`. A printer-friendly variant exists at `https://calcareers.ca.gov/CalHrPublic/Jobs/JobPostingPrint.aspx?jcid={N}` — the same content, simpler markup, often easier to scrape for description text.

## Site-Specific Gotchas

- **No JSON/REST search API.** Only `/api/glossary/getglossaryitembytext?glossaryterm=...` exists, and it is a help-tooltip lookup unrelated to job search. Don't waste time on `dapi/` or `/api/jobs` — verified absent. ASP.NET ViewState is mandatory.
- **GET query params on the search forms are ignored.** `AdvancedJobSearch.aspx?keyword=engineer&location=Sacramento` returns the empty form — search criteria are accepted only via POST. `JobSearchResults.aspx?keyword=…` likewise returns the default empty page.
- **`JobSearchResults.aspx` has no query string at all.** Search state lives in the ASP.NET session (keyed by `ASP.NET_SessionId` cookie). The URL hash (`#kw=engineer&loc=Sacramento`) is cosmetic — written for browser back/forward only; deleting it does not change results, and setting it does not pre-populate filters on a fresh session.
- **DevExpress combobox typo: `ddlWorkSchedlue`** (not `ddlWorkSchedule`). The ID is misspelled site-wide; programmatic access must use the typo'd name.
- **`Use Exact Phrase Match` defaults to ON** on the results page. Multi-word queries (`Senior Engineer`) match the exact phrase. Uncheck `#cphMainContent_chkExactPhraseMatch` (or click the visible "Use Exact Phrase Match" checkbox) to broaden — e.g., `Senior Engineer` then matches `Senior Transportation Electrical Engineer`.
- **Classification dropdown is lazy-loaded.** On first form render, the Classification combobox shows a "Loading…" spinner while a server-side AJAX callback populates its option list. `wait timeout 1500` after `load` before calling `.SetText('…')` on it; otherwise `.SetText()` succeeds visually but stores no internal `_VI` value and the filter is dropped on submit.
- **`SetText()` is the right API; `SetValue(n)` requires the internal numeric ID** (e.g., Sacramento County = 418, Department of Transportation has its own ID). The numeric IDs are not documented and shift across deploys — always go through `SetText('label')` and verify `.GetValue() !== null` to confirm the label resolved.
- **Detail URL uses the `www.` subdomain and Pascal-case query key.** Use `https://www.calcareers.ca.gov/CalHrPublic/Jobs/JobPosting.aspx?JobControlId={N}` — the host renders both `www.` and apex variants, but the in-page anchors are written with `www.`, so match that for stable canonical URLs. The printer-friendly variant is `https://calcareers.ca.gov/CalHrPublic/Jobs/JobPostingPrint.aspx?jcid={N}` (note lower-case `jcid` query key).
- **Pager `ctlNN` indices are positional, not page numbers.** After clicking page 11+, `ctl00` becomes page 11 (or thereabouts — the strip slides). Always match pager anchors by their visible text (`'2'`, `'3'`, `'…'`, `'>>'`), never by the `ctlNN` suffix.
- **Filing Deadline can be `Until Filled`** instead of a `M/D/YYYY` date. Emit it as a raw string and let downstream code branch on the literal.
- **Salary Range format is inconsistent.** Most postings show monthly ranges (`$9713.00 - $12151.00`), but Stationary Engineer / hourly classifications show mixed hourly+monthly (`$38.63 - $8477.00` — the first number is hourly, second is monthly per the pay-scale grid). Don't try to compute an "annualized" figure from the card text; treat `salary_range` as an opaque string.
- **`Location` values are mostly California counties** ("Sacramento County", "Los Angeles County"). Fully-remote positions show `Location: United States` paired with `Telework: Telework`. Some federal-style locations exist ("Out of State") — capture verbatim.
- **`Shall Also Consider Classes:` appears on ~10–20% of cards** as a trailing block after the labelled rows. It lists alternative job classifications the same posting can also fill. Capture as a `also_consider_classes: [...]` array when present.
- **Each card has 2 anchors with the same `JobControlId`** (title + "View Job Posting"). Dedupe by JCID — failing to dedupe will inflate your result count by 2×.
- **Pagination is __doPostBack only.** A direct GET to `JobSearchResults.aspx` (no session) renders the default empty grid with no results — the pager links only work in-session after a real form submission.
- **Page-size and sort selects also trigger __doPostBack.** Changing them via `select.value = 'X'; dispatchEvent('change')` is correct; `wait timeout 2500` for the postback round-trip before reading.
- **No results case:** body contains `"No jobs found matching your search criteria."` and 0 anchors with `JobControlId=`. Total-count text is absent.
- **Maintenance windows are common.** The homepage and search pages occasionally show a yellow `System Maintenance` banner with a specific date/window. The site is usually still functional during these — but pageloads can hang or 502. Retry once.
- **Anti-bot is light** (Azure Front Door + Application Gateway, no captcha/Akamai). `--verified --proxies` works but a bare cloud session also works in spot-checks. Use stealth for stability, not because it's blocking-required.
- **Sister portals exist for some departments** (e.g., `doi-jobs.dca.ca.gov`, the Department of Insurance). Same ASP.NET template, same workflow, different scope. The same selectors apply.

## Expected Output

```json
{
  "query": {
    "keyword": "Engineer",
    "location": "Sacramento County",
    "department": null,
    "exact_phrase_match": true,
    "sort_by": "Relevance DESC",
    "page_size": 100
  },
  "total_results": 54,
  "page": 1,
  "total_pages": 1,
  "listings": [
    {
      "job_control_number": "518581",
      "title": "ASSOCIATE SAFETY ENGINEER (AMUSEMENT RIDES)",
      "working_title": "Associate Safety Engineer (Amusement Rides)",
      "salary_range": "$9713.00 - $12151.00",
      "work_type_schedule": "Permanent Fulltime",
      "department": "Department of Industrial Relations",
      "location": "Sacramento County",
      "telework": "In Office",
      "publish_date": "5/15/2026",
      "filing_deadline": "6/15/2026",
      "also_consider_classes": [],
      "detail_url": "https://www.calcareers.ca.gov/CalHrPublic/Jobs/JobPosting.aspx?JobControlId=518581"
    },
    {
      "job_control_number": "518160",
      "title": "SENIOR ENGINEERING GEOLOGIST",
      "working_title": "SENIOR ENGINEERING GEOLOGIST",
      "salary_range": "$11437.00 - $14315.00",
      "work_type_schedule": "Permanent Fulltime",
      "department": "Department of Transportation",
      "location": "Sacramento County",
      "telework": "Hybrid",
      "publish_date": "5/12/2026",
      "filing_deadline": "5/27/2026",
      "also_consider_classes": ["SENIOR TRANSPORTATION ELECTRICAL ENGINEER (SUPERVISOR)"],
      "detail_url": "https://www.calcareers.ca.gov/CalHrPublic/Jobs/JobPosting.aspx?JobControlId=518160"
    },
    {
      "job_control_number": "518459",
      "title": "STATIONARY ENGINEER (CORRECTIONAL FACILITY)",
      "working_title": "STATIONARY ENGINEER, CF",
      "salary_range": "$38.63 - $8477.00",
      "work_type_schedule": "Limited Term Fulltime",
      "department": "California State Prison, Los Angeles County",
      "location": "Los Angeles County",
      "telework": "In Office",
      "publish_date": "5/14/2026",
      "filing_deadline": "Until Filled",
      "also_consider_classes": ["STATIONARY ENGINEER"],
      "detail_url": "https://www.calcareers.ca.gov/CalHrPublic/Jobs/JobPosting.aspx?JobControlId=518459"
    }
  ]
}
```

No-results shape:

```json
{
  "query": { "keyword": "unicornquantumxyz123", "exact_phrase_match": true },
  "total_results": 0,
  "page": 1,
  "total_pages": 0,
  "listings": [],
  "message": "No jobs found matching your search criteria."
}
```

Single-job lookup by JC# (uses `txtJobControlId` field — bypasses keyword/filter matching):

```json
{
  "query": { "job_control_number": "518581" },
  "total_results": 1,
  "listings": [ { "job_control_number": "518581", "title": "ASSOCIATE SAFETY ENGINEER (AMUSEMENT RIDES)", "...": "..." } ]
}
```
