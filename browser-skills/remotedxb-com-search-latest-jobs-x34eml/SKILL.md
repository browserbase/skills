---
name: remotedxb-com-search-latest-jobs-x34eml
title: Search Latest Remote Jobs on Remote DXB
description: >-
  Retrieve the newest remote and hybrid job listings from remotedxb.com
  (UAE/Dubai) as structured, newest-first data via a single HTTP fetch of the
  embedded Inertia JSON; supports pagination and
  keyword/category/location/remote-status filters.
website: remotedxb.com
category: job-search
tags:
  - jobs
  - remote-work
  - uae
  - dubai
  - job-board
  - search
source: 'browserbase: agent-runtime 2026-06-20'
updated: '2026-06-20'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      A default (non-stealth, non-proxied) Browserbase remote session renders
      the same newest-first job cards server-side and works as a fallback if the
      raw HTML fetch is blocked; slower and costlier than fetch.
  - method: api
    rationale: >-
      No public REST/JSON API exists (the site is Laravel + Inertia, not
      WordPress). The same JSON is obtainable by sending an 'X-Inertia: true'
      request header, but the embedded <script id="app"> payload needs no custom
      headers, so fetch is preferred.
verified: false
proxies: false
---
# Search Latest Remote Jobs on Remote DXB

## Purpose
Retrieve the most recently posted remote and hybrid jobs from Remote DXB (`remotedxb.com`), a UAE/Dubai-focused remote job board. Returns a structured, newest-first list of listings with title, company, location, work model, commitment, posted date, category, salary range, tags, and the canonical job-detail URL. This is a **read-only** skill — it lists/searches jobs and never applies. The optimal path requires **no live browser**: a single HTTP GET returns the full server-rendered job feed as JSON, because the site is a Laravel + Inertia.js app that embeds its page data in the HTML.

## When to Use
- "Show me the latest / newest remote jobs in Dubai (or the UAE)."
- "What remote jobs were posted today on Remote DXB?"
- "Find completely-remote or hybrid roles in a category (engineering, marketing, sales, …)."
- "Search Remote DXB for jobs matching a keyword / location / tag."
- Building a feed or alert of fresh UAE remote/hybrid openings.

## Workflow

The recommended method is a plain **HTTP fetch** of the homepage — the latest jobs are sorted newest-first and embedded directly in the returned HTML as JSON. No proxies, no login, no headless browser.

1. **GET `https://www.remotedxb.com/`.**
   - Use the `www.` host: the apex `https://remotedxb.com/` 301-redirects to `www`.
   - Cloudflare fronts the site but serves content normally to the Browserbase Fetch API; `--proxies` is **not** required (verified). Example: `browse cloud fetch "https://www.remotedxb.com/"`.
2. **Extract the embedded Inertia payload.** In the returned HTML, find the script element
   `<script id="app" type="application/json"> … </script>` and JSON-parse its text content (the Inertia `data-page` object).
3. **Read `props.listings`** — a Laravel paginator:
   `{ current_page, last_page, per_page (10), total, from, to, data[], next_page_url }`.
   `props.listings.data` is already **sorted newest-first by `postedDate`** — that array *is* the latest jobs.
4. **Map each item** to your output shape (see Expected Output). Useful fields per listing: `id, title, companyName, companyLogo, location, primaryCountryCode, remoteStatus, remoteLabel, commitment, postedDate, category, categorySlug, salaryRange, tags, href, applyMethod, applyLink, applyEmail, excerpt, description` (description is HTML).
5. **For more than 10 results**, fetch `https://www.remotedxb.com/?page=2`, `?page=3`, … (follow `next_page_url`). Each page returns the next 10 in the same newest-first order.
6. **To filter** (all params combine), add query params whose names are the **camelCase plural** facet props with `[]`, using the slugs found in the homepage props (`props.categories`, `props.locations`, `props.remoteStatuses`, `props.tags`, etc.):
   - `?search=<text>` — free-text keyword
   - `?categories[]=engineering-architecture`
   - `?locations[]=dubai`
   - `?remoteStatuses[]=completely-remote` (or `hybrid`)
   - `?tags[]=ai`, `?experiences[]=<slug>`, `?commitments[]=<slug>`, `?salaryRanges[]=<slug>`
   - Echoed back under `props.filters`; unknown param names are silently ignored (full list returned, `filters: []`).

### Browser fallback (only if the HTML fetch is unavailable)
1. `browse open https://www.remotedxb.com/ --remote` — a **default** Browserbase session is sufficient; no `--verified`/`--proxies` needed (verified across two runs; no Cloudflare challenge).
2. `browse snapshot` — the 10 newest job cards are server-rendered and present immediately; no scroll or wait is required for the first page.
3. Read each card: title, company, location, work-model badge (Completely Remote / Hybrid), commitment (Full Time / Contract / Part Time), the "Today"/date label, and the `/job/<slug>--<id>` link.
4. For more results, navigate to `?page=2`, etc.

## Site-Specific Gotchas
- **It's Laravel + Inertia.js, not WordPress.** Detect via the `Vary: X-Inertia` response header. There is no `/wp-json` API. The "API" is simply the JSON embedded in every page's `<script id="app" type="application/json">` tag (and the same data is returned with an `X-Inertia: true` request header, but the embedded-script approach needs no custom headers).
- **Always use `www.`** — `remotedxb.com` → 301 → `www.remotedxb.com`. The Browserbase Fetch API does not follow redirects unless you pass `--allow-redirects`, so hit `www` directly.
- **Proxies are NOT required** despite the homepage being Cloudflare-fronted (pre-run probe hinted `likelyNeedsProxies: true`, but a bare fetch and a bare remote browser session both returned 200 with full content). The successful runs used no proxy and no verified/stealth session.
- **Newest-first is the default sort** on the homepage feed — no sort param needed for "latest jobs." Page 1 = the freshest listings.
- **Pagination is 10 per page** (`per_page: 10`, ~2,000+ total listings, ~200 pages). Use `?page=N` / `next_page_url`.
- **Filter param names are camelCase plural with `[]`** (`categories[]`, `locations[]`, `remoteStatuses[]`, `tags[]`, …). Bare `categories=` (no brackets) returns **HTTP 500**; `category[]` (singular) and `remote_status[]` (snake_case) are silently ignored and return the unfiltered list.
- **Job detail URL pattern is `/job/<slug>--<numericId>`** with a **double dash** before the id (e.g. `/job/medical-escort-a-r-t-ambulance-services-llc--195239`). It is NOT `/jobs/<id>` — `/jobs/<id>` does not resolve to a listing.
- **`location` may be a UAE emirate** (Dubai, Abu Dhabi, Sharjah, Umm Al Quwain, …) **or `GLOBAL`** for worldwide-remote roles.
- **`applyEmail` is often `mailto:` (empty)** when `applyMethod` is `link`; the real apply target is then `applyLink` (e.g. `https://www.remotedxb.com/apply/<code>`).
- Homepage props also carry the full facet vocabularies you can use to build filters: `props.categories` (id/name/slug/count), `props.locations`, `props.remoteStatuses`, `props.tags`, `props.experiences`, `props.commitments`, `props.salaryRanges`, `props.languages`.

## Expected Output

Latest-jobs feed (page 1, newest first):

```json
{
  "success": true,
  "source": "https://www.remotedxb.com/",
  "page": 1,
  "per_page": 10,
  "total": 2054,
  "jobs": [
    {
      "id": 9067,
      "title": "Medical Escort",
      "company": "A R T Ambulance Services L.L.C.",
      "location": "Dubai",
      "remote_status": "Completely Remote",
      "commitment": "Contract",
      "category": "Healthcare & Telemedicine",
      "salary_range": null,
      "tags": [],
      "posted_date": "2026-06-20T10:00:05+00:00",
      "url": "https://www.remotedxb.com/job/medical-escort-a-r-t-ambulance-services-llc--195239",
      "apply_link": "https://www.remotedxb.com/apply/NBY5A"
    },
    {
      "id": 9060,
      "title": "Print & Digital Sales, Marketing & Events Director",
      "company": "Reflex Media",
      "location": "GLOBAL",
      "remote_status": "Completely Remote",
      "commitment": "Full Time",
      "category": "Sales & Business Development",
      "posted_date": "2026-06-20T01:00:03+00:00",
      "url": "https://www.remotedxb.com/job/print-digital-sales-marketing-events-director-reflex-media--194500"
    }
  ],
  "error_reasoning": null
}
```

Filtered/empty result (e.g. a filter slug that matches nothing):

```json
{
  "success": true,
  "source": "https://www.remotedxb.com/?experiences[]=entry-level",
  "page": 1,
  "total": 0,
  "jobs": [],
  "error_reasoning": null
}
```

Failure (site unreachable / unexpected structure):

```json
{
  "success": false,
  "jobs": [],
  "error_reasoning": "Could not locate the <script id=\"app\"> Inertia payload in the response HTML."
}
```
