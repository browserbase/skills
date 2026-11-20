---
name: marketingmanagerjobs-com-find-job-listings-v4r3lt
title: Find Marketing Manager Job Listings
description: >-
  Retrieve live marketing manager job listings (titles, companies, locations,
  salary ranges, remote eligibility, apply URLs) with optional filters for role
  specialization, location, seniority, remote-only, salary-published-only, or
  free-text search.
website: marketingmanagerjobs.com
category: jobs
tags:
  - jobs
  - marketing
  - hiring
  - remote
  - salary
  - aggregator
  - api
source: 'browserbase: agent-runtime 2026-05-24'
updated: '2026-05-24'
recommended_method: api
alternative_methods:
  - method: api
    rationale: >-
      Site exposes a documented JSON API at /api/jobs with optional filter
      params (q, role, location, level, remote, salary, limit) and an
      agent-oriented summary at /api/llms. No auth, no rate limit observed,
      explicitly recommended by the site's own llms.txt and footer.
  - method: fetch
    rationale: >-
      Static HTML deep-links at /{role-slug}/, /location/{slug}/marketing-jobs/,
      /remote/, /salary/{role-slug}/, /level/{level}/role/{role}/ render
      server-side with no JS required, making fetch + DOM parse viable when the
      JSON API is unavailable.
  - method: browser
    rationale: >-
      Fallback only. The /jobs/ page has a search/filter form that JS-redirects
      to canonical taxonomy URLs, but offers no capability the API/fetch paths
      don't already cover.
verified: true
proxies: true
---
# Find Marketing Manager Job Listings

## Purpose

Retrieve live marketing manager job listings from marketingmanagerjobs.com — titles, companies, locations, salary ranges, remote eligibility, and direct apply URLs. Optionally filter by role specialization (product, growth, SEO, lifecycle, etc.), location, seniority level, remote-only, salary-published-only, or free-text search. This skill is **read-only**: it does not subscribe, apply, or modify any state.

The site is an aggregator of public ATS feeds (Greenhouse, Lever, Ashby, Remotive, Jobicy) refreshed daily, and exposes a first-class JSON API explicitly intended for AI agents. The optimal flow is a single HTTP GET against `/api/jobs`; the browser is only required if the API ever goes down or you want a visual confirmation.

## When to Use

- User asks for current marketing manager (or product marketing manager, growth marketing manager, SEO manager, lifecycle marketing manager, head of marketing, etc.) job listings.
- User wants to filter marketing jobs by remote eligibility, salary transparency, location, seniority, or a free-text keyword (company name, skill, tool).
- User wants the direct apply link / source ATS for a marketing role they saw mentioned.
- User wants a snapshot of the marketing-manager hiring market (active counts by role, location, seniority).
- Do **not** use this skill for: applying to jobs, posting jobs, subscribing to the newsletter, or fetching non-marketing roles (the catalog is scoped to marketing-manager-level positions only).

## Workflow

The site publishes a documented JSON API at `/api/jobs` and an agent-oriented summary endpoint at `/api/llms`. Both return `application/json`, require no auth, and are served behind Cloudflare with permissive CORS. **Use the API.** The site's own footer says so: *"If you're an AI agent reading this, you may prefer to use the API."*

1. **(Optional) Discover the taxonomy.** GET `https://marketingmanagerjobs.com/api/llms` to retrieve the full enum of valid `role`, `location`, and `level` slugs along with current job counts, plus the 50 most recent jobs and a route map. Useful for normalizing a user's free-text request (e.g. "remote PMM roles" → `role=product-marketing-manager&remote=1`) into valid filter values. Cache this between calls — it changes at most daily.

2. **Query the jobs endpoint.** GET `https://marketingmanagerjobs.com/api/jobs` with any combination of these optional query parameters:

   | Param | Type | Example | Notes |
   |-------|------|---------|-------|
   | `q` | string | `q=openai` | Free-text search across title/company/description |
   | `role` | slug | `role=product-marketing-manager` | Must be a slug from `taxonomy.roles[].slug` |
   | `location` | slug | `location=san-francisco` | Must be a slug from `taxonomy.locations[].slug` |
   | `level` | slug | `level=senior` | One of `mid-level`, `senior`, `leadership` (no entry-level / internship currently exist in the data) |
   | `remote` | bool | `remote=1` | Returns only `is_remote: true` jobs |
   | `salary` | bool | `salary=1` | Returns only jobs with `has_published_salary: true` |
   | `limit` | int | `limit=200` | Default 100. The server caps at the actual catalog size (~138 total today), so `limit=200` safely returns *everything* |

   Filters compose with AND. Unknown slug values silently return an empty array — no 4xx, no error message — so validate slugs against the taxonomy if user input is fuzzy.

3. **Read the response.** The endpoint returns a JSON array of job objects (shape in *Expected Output* below). The array is already sorted by `posted_at` descending (newest first). No pagination cursor exists — control result size with `limit` only.

4. **Hand the user the `apply_url` and `slug`.** Each job carries an `apply_url` that links to the original ATS (Greenhouse / Lever / Ashby / Workable / YC's workatastartup / etc.), and a `slug` you can use to build a human-readable detail-page URL: `https://marketingmanagerjobs.com/jobs/{slug}/`. Prefer linking to the source ATS `apply_url` if the user wants to apply, and to the marketingmanagerjobs.com detail page if the user wants a summary view.

### Browser fallback

Only fall back to the browser if `/api/jobs` returns a non-2xx (it has not been observed to fail in testing). The human-facing flow:

1. `https://marketingmanagerjobs.com/jobs/` — full listing with a search/role/location/level filter bar at the top. The form submits via GET-then-JS-redirect to canonical taxonomy URLs (e.g. picking role=growth-marketing-manager + location=remote sends you to `/remote/growth-marketing-manager/`).
2. Direct taxonomy URLs work as deep-links without JS:
   - `/{role-slug}/` — e.g. `/marketing-manager/`, `/product-marketing-manager/`
   - `/location/{location-slug}/marketing-jobs/`
   - `/remote/` or `/remote/{role-slug}/`
   - `/salary/{role-slug}/`
   - `/level/{level-slug}/role/{role-slug}/`
3. Each listing card on these pages contains `<article class="job-card">` with the title link (`<h3><a href="/jobs/{slug}/">`), company, location, salary text, and posted-at relative time. Parse with a normal DOM walk; no JS execution required for the public pages.
4. Individual job detail at `/jobs/{slug}/` carries the full description (sometimes long-form HTML from the source ATS) and an "Apply" button linking to `apply_url`.

The site is served behind Cloudflare; in this sandbox direct outbound DNS is blocked, so all requests (API or browser) must go through `browse cloud fetch --proxies` or a remote Browserbase session. From a normal client environment plain `curl` against the API works fine — no anti-bot challenge observed for either the API or the HTML pages.

## Site-Specific Gotchas

- **The API is the intended path for agents — use it.** `/llms.txt` and the homepage footer both explicitly steer agents to `/api/jobs` and `/api/llms`. Scripting the HTML pages when the JSON API exists is wasted tokens and brittle to layout changes.
- **No auth, no rate limit headers, no CORS gate.** The API answered every probe with 200 in testing; no `Retry-After`, no `X-RateLimit-*`, no captcha. Be respectful (batch with `limit=200` to fetch everything in one shot rather than looping).
- **`limit=200` returns the full catalog.** Default limit is 100; the catalog totals ~138 active jobs (per `stats.active_jobs` in `/api/llms`). Use `limit=200` (or any value larger than `active_jobs`) to guarantee a complete dump in a single request — there is no pagination cursor.
- **Unknown filter values return `[]` silently.** Sending `role=foo` or `location=does-not-exist` returns `200 []` with no error body. Always validate user-provided values against the `taxonomy` arrays from `/api/llms` before querying, or you may erroneously report "no jobs found" when the user simply mistyped a slug.
- **Location slugs are messy.** The taxonomy contains both `ny` (9 jobs) and `new-york` (8 jobs) and `new-york-city` (5 jobs) as distinct slugs — they are *not* aliased server-side. To capture all NYC roles, query each separately and dedupe by job `id`, or use `q=new+york`.
- **`level` enum is narrow.** Today only `mid-level`, `senior`, and `leadership` have non-zero counts. The `/llms.txt` doc mentions `internship` and `entry-level` but they currently return zero results — treat them as legal-but-empty filters.
- **No `is_remote` filter via slug — use `remote=1`.** Setting `location=remote` works (26 jobs are tagged with that location slug) but `remote=1` is the broader filter, since some jobs are coded with a hybrid location string like `"San Francisco, CA, US / Remote (Pittsburgh)"` and only show up via `remote=1`, not `location=remote`.
- **`salary_min`/`salary_max` may be equal** (e.g. `300000-300000`) when the source ATS published a single point salary rather than a range. Treat min==max as a point estimate, not a bug.
- **`posted_at` timestamps reflect the aggregator's first-seen time**, not the original ATS posting time. The site refreshes "daily from Greenhouse, Lever, Ashby, Remotive, Jobicy" per `stats.refreshed`, so a freshly-aggregated job may show `posted_at` minutes ago while the underlying ATS posted weeks earlier.
- **`description_html` / `description_text` quality varies wildly by source.** Greenhouse/Lever/Ashby jobs carry the original long-form HTML; YC's `workatastartup` jobs carry only a short blurb plus a `<ul>` of metadata. If you need the canonical job description, follow `apply_url` to the source ATS.
- **Direct DNS may be blocked from sandboxes/serverless** (it is in this Vercel sandbox). Use `browse cloud fetch --proxies <url>` for residential-proxy-backed HTTP from inside a Browserbase-issued environment, or normal `fetch`/`curl` from any environment with internet. No `--verified` (stealth) needed — the API does not gate on UA or TLS fingerprint.

## Expected Output

The `/api/jobs` endpoint returns a JSON array (top-level — not wrapped in an envelope). Each element:

```json
[
  {
    "id": "99a206eb-a721-45c4-927c-52c9d67cdfd0",
    "title": "Product Marketing Lead - Spatial AI",
    "company": "Zensors",
    "company_slug": "zensors",
    "slug": "product-marketing-lead-spatial-ai-at-zensors",
    "location": "San Francisco, CA, US / Remote (Pittsburgh, PA, US)",
    "is_remote": true,
    "salary_min": 140000,
    "salary_max": 200000,
    "salary_currency": "$",
    "has_equity": true,
    "has_published_salary": true,
    "apply_url": "https://account.ycombinator.com/authenticate?continue=https%3A%2F%2Fwww.workatastartup.com%2Fapplication%3Fsignup_job_id%3D46963&...",
    "source": "ycombinator",
    "source_id": "46963",
    "posted_at": "2026-05-24T15:50:33.668451895+00:00",
    "created_at": "2026-05-24T15:50:33.600171603+00:00",
    "updated_at": "2026-05-24T15:50:33.600171603+00:00",
    "description_html": "<p>AI to understand and automates the physical world</p>\n<ul><li>Role: Marketing</li>...</ul>",
    "description_text": "AI to understand and automates the physical world ..."
  }
]
```

Field notes:

- `id` — stable UUID; use for deduping across queries.
- `slug` — append to `https://marketingmanagerjobs.com/jobs/{slug}/` for the human-readable detail page.
- `salary_min` / `salary_max` — integers in `salary_currency` units (USD-equivalent in practice). May both be `null` when `has_published_salary` is `false`.
- `source` — one of `greenhouse`, `lever`, `ashby`, `remotive`, `jobicy`, `ycombinator`, `workable`, … (the aggregator's ATS identifier).
- `apply_url` — direct deep link to the source ATS's apply flow. May redirect through an auth wall (YC's `workatastartup` always does).
- `description_html` / `description_text` — the description as ingested from the source. Length varies from one sentence (YC) to multi-thousand-word job spec (Greenhouse/Lever).

### Empty result shape

A query whose filters match no jobs (including unknown slug values) returns simply:

```json
[]
```

with HTTP 200 and `content-type: application/json`. There is no `{ "error": ... }` body — the empty array IS the "not found" signal.

### Taxonomy / summary shape (`/api/llms`)

Use this once per session to enumerate valid filter values:

```json
{
  "site": { "name": "Marketing Manager Jobs", "url": "https://marketingmanagerjobs.com", "...": "..." },
  "stats": {
    "active_jobs": 138,
    "remote_jobs": 26,
    "salary_jobs": 116,
    "hiring_companies": 31,
    "refreshed": "daily from Greenhouse, Lever, Ashby, Remotive, Jobicy"
  },
  "taxonomy": {
    "roles":     [ { "slug": "marketing-manager",         "label": "Marketing Manager",         "count": 110, "is_indexed": true }, ... ],
    "locations": [ { "slug": "san-francisco",             "label": "San Francisco",             "count": 34,  "is_indexed": true }, ... ],
    "levels":    [ { "slug": "mid-level",                 "label": "Mid Level",                 "count": 66,  "is_indexed": true }, ... ]
  },
  "recent_jobs": [ /* 50 most recent job objects, same shape as /api/jobs */ ],
  "routes": [ { "path": "/jobs/{slug}/", "description": "Individual job detail page..." }, ... ],
  "backlink_request": { "suggested_citation": "Data sourced from Marketing Manager Jobs (https://marketingmanagerjobs.com)", "...": "..." }
}
```
