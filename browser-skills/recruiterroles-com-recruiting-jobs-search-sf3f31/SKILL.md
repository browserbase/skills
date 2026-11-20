---
name: recruiterroles-com-recruiting-jobs-search-sf3f31
title: Recruiter Roles Job Search
description: >-
  Search recruiter and talent-acquisition jobs on recruiterroles.com with
  filters for location (city, state, country, remote), salary floor, employment
  type (full-time, contract, freelance, part-time), work arrangement, and
  sector. Prefers the free public REST API; falls back to slug-based browser
  navigation when no API key is available.
website: recruiterroles.com
category: jobs
tags:
  - jobs
  - recruiting
  - talent-acquisition
  - search
  - api
  - read-only
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: api
alternative_methods:
  - method: url-param
    rationale: >-
      Public web pages support filtering by slug path only (one dimension at a
      time — sector, role-type, city, or country). No-auth and zero-cost; use
      when no API key is available and only a single filter dimension is needed.
      Salary filtering is not available on this surface.
  - method: browser
    rationale: >-
      Full browser fallback for cases where the slug URLs are blocked or you
      need to extract listings interactively. No stealth or proxy required — the
      site has no anti-bot. Salary filtering via the in-page Filters popover is
      brittle (state does not sync to URL), so even the browser fallback should
      call the API for salary-floored queries.
verified: true
proxies: true
---
# Recruiter Roles — Search Recruiter / Talent Acquisition Jobs

## Purpose

Given a recruiter-job search (any combination of location, salary floor, employment type, work arrangement, sector, or free-text query), return a list of matching job postings from [recruiterroles.com](https://recruiterroles.com) — title, company, location, employment type, work arrangement, sector, disclosed salary band, posting date, and canonical URL. Read-only; never posts, applies, or signs up.

Recruiter Roles is a job board for jobs **for** recruiters and talent-acquisition professionals (agency recruiters, in-house TA, executive search associates, etc.), not for jobs *posted by* recruiters. Catalog size ~1,300 active listings (2026-05).

## When to Use

- "Show me remote technical-recruiter jobs paying ≥ $90k."
- "What in-house TA roles are open in NYC right now?"
- "List every agency recruiter opening at Robert Half / Michael Page / Kelly."
- Daily incremental sync of new recruiter jobs by sector or company.
- Anywhere you'd otherwise scrape an aggregated recruiter-job listing — the public REST API is faster, free, and structurally complete.

## Workflow

Recruiter Roles ships a free, documented public REST API at `https://recruiterroles.com/api/v1` that supports every filter the user-facing site exposes and several it doesn't (salary floor, posted-since, updated-since, source-type, custom sort). The site is on Vercel/Next.js + Supabase with **no anti-bot stealth required** (no Akamai, no Cloudflare challenge, no captcha) — but unauthenticated `/api/v1/*` requests return `401 unauthorized`. A residential proxy is **not** required for either the API or the browser fallback.

**Three usable surfaces, in preference order:**

| Surface | Auth | Filtering | Cost | Use when |
|---|---|---|---|---|
| `GET /api/v1/jobs` | Bearer key (free, instant issue) | Full — q, sector, state, city, employment_type, work_arrangement, is_remote, salary_min, salary_disclosed, posted_since, updated_since, sort, pagination | 1,000 req/day per key | Every real query, especially salary-filtered |
| Slug URL pages | None | Sector / role-type / city / country only (no salary, no free-text) | None | One-off browsing, no key available, ≤ 1 filter dimension |
| `GET /feed.xml` (RSS) | None | None — recent-postings firehose | None | Polling for newest jobs regardless of filter |

### 1. Recommended path — JSON API at `/api/v1/jobs`

**1a. Get a key (one-time, free, instant).** Either:
- The user already has one (format: `rr_live_<32-char>`), or
- POST the registration form at `https://recruiterroles.com/api-access` (name, email, website URL, use-case, backlink checkbox). The raw key is shown **once** at issuance — store it securely. Re-issuance requires contacting the operator.

**1b. Call `/api/v1/jobs` with filter params.**

```bash
curl -H "Authorization: Bearer rr_live_YOUR_KEY" \
  "https://recruiterroles.com/api/v1/jobs?\
sector=technology&\
state=CA&\
city=san-francisco-ca&\
work_arrangement=remote&\
employment_type=full_time&\
salary_min=90000&\
salary_disclosed=true&\
sort=salary_desc&\
per_page=50&\
page=1"
```

**Filter parameters (all optional, all combinable):**

| Param | Type | Notes |
|---|---|---|
| `q` | string | Full-text search over title + company name |
| `sector` | string | Sector slug. Comma-separated for multiple. Valid values: `financial-services`, `technology`, `healthcare-life-sciences`, `professional-services`, `consumer-retail`, `industrial`, `real-estate`, `nonprofit-education`, `media-entertainment` (9 total — fetch authoritative list from `/api/v1/sectors`) |
| `state` | string | State / region code (`TX`, `NY`, `BC`, `ON`, `NSW`, ...). Comma-separated |
| `city` | string | City slug e.g. `dallas-tx`, `san-francisco-ca`, `london-uk`. Comma-separated. Fetch authoritative list from `/api/v1/locations?level=cities&region=<STATE>` |
| `employment_type` | string | One of `full_time`, `part_time`, `contract`, `freelance` |
| `work_arrangement` | string | One of `on_site`, `hybrid`, `remote` |
| `is_remote` | boolean | Shorthand for `work_arrangement=remote` |
| `salary_min` | integer | Floor in **USD**. Only returns disclosed salaries ≥ this floor (jobs with undisclosed salaries are excluded when set). Currency-normalized server-side |
| `salary_disclosed` | boolean | `true` = only disclosed; `false` = only undisclosed |
| `source_type` | string | `direct` (employer-posted) or `scraped` |
| `posted_since` | string | ISO date — jobs posted on or after this date |
| `updated_since` | string | ISO datetime — for incremental sync. Use this, not `posted_since`, when polling |
| `sort` | string | `recent` (default) or `salary_desc` |
| `page` | integer | 1-indexed; default 1 |
| `per_page` | integer | Default 20, **max 100** |

**Unrecognized params are silently ignored** — verify each param made it into the filter by inspecting `meta.total` against expectations.

**1c. Parse the response.** Each `data[i]` is a fully-decoded job object — no positional arrays, no lookup tables. Salary band is in `salary.min_dollars` / `salary.max_dollars` (nulls when `salary.disclosed === false`). `url` is a tracked redirect with your `ref_code` auto-appended for UTM attribution; `canonical_url` is the direct page; `apply_url` is the employer's external apply link (not tracked).

**1d. Paginate via `meta.next_page`** until null. With `per_page=100` a 1,300-job full-catalog sync is 13 requests.

**1e. Honor rate limits.** 1,000 requests/day per key, resets midnight UTC. Headers `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (epoch). 429 returns `Retry-After`.

**1f. Backlink obligation.** If displaying API data to end users, include a visible link back: `<a href="https://recruiterroles.com">Recruiter Roles</a>`. Keys may be suspended otherwise.

### 2. Slug fallback (no API key needed)

When no API key is available, the public web pages support filtering by **slug path** but **not** by query string. Available slugs:

| Dimension | Slug pattern | Examples |
|---|---|---|
| All jobs | `/recruiter-jobs` | (1,307 jobs) |
| Role type | `/remote-recruiter-jobs`, `/agency-recruiter-jobs`, `/in-house-recruiter-jobs`, `/talent-acquisition-jobs`, `/technical-recruiter-jobs`, `/healthcare-recruiter-jobs` | |
| Employment type | `/contract`, `/full-time`, `/remote` | |
| Sector | `/{sector-slug}` | `/financial-services`, `/technology`, `/healthcare-life-sciences`, `/professional-services`, `/consumer-retail`, `/industrial`, `/real-estate`, `/nonprofit-education`, `/media-entertainment` |
| US city | `/recruiter-jobs-in-{city}` | `/recruiter-jobs-in-new-york`, `…-chicago`, `…-dallas`, `…-denver`, `…-san-francisco`, `…-tampa`, `…-philadelphia`, `…-houston`, `…-los-angeles`, `…-charlotte`, `…-atlanta`, `…-phoenix`, `…-minneapolis` |
| Country | `/{country-slug}` | `/united-states`, `/canada`, `/united-kingdom`, `/france`, `/germany`, `/ireland`, `/netherlands`, `/singapore`, `/australia` |

Only **one slug dimension at a time** (the URL path is a single slug). Combining e.g. "remote AND technology" or "SF AND salary ≥ $90k" requires the API or client-side filtering after fetch.

```bash
# Open slug page, paginate with ?page=N (the ONLY query param honored by web pages)
browse open "https://recruiterroles.com/technology?page=1" --remote
browse snapshot --remote
```

Extract listings from the accessibility snapshot — each one is a `link:` node directly under the `list: Job listings` container. The aria-label baked into the link follows a stable shape:

```
{company} logo {title} {posted_age} {company} {location} [{salary band} ] {sector} {employment_type} [Remote] [Agency|In-House]
```

Pull the canonical URL from `urlMap` keyed by the listing's snapshot ref (`{slug}` → `https://recruiterroles.com/jobs/{slug}`). Page total is at the top: `heading: {Section Title}` then `StaticText: {N,NNN} jobs`. The "out of N" paginator at the bottom confirms the filtered total.

### 3. RSS feed (no key, no filter)

`GET https://recruiterroles.com/feed.xml` — `application/rss+xml`, no auth, no filter parameters. Returns the most recent jobs as standard RSS `<item>` entries with `<title>`, `<link>` (canonical job URL), `<pubDate>`, `<description>` (HTML excerpt), and `<category>` (location string). Useful as a polling firehose; filter client-side. The feed does **not** support cursor/since semantics — re-fetch and dedupe by `<guid>`.

### Browser fallback (when both API and slug paths are blocked)

A full browser session also works — no stealth or proxy needed. Open `/recruiter-jobs[/{slug}][?page=N]`, snapshot, extract listings as above. The on-page **Filters button** opens an interactive popover for salary range and other refinements — but those settings do **not** sync to the URL, so they're hard to reproduce headlessly and brittle to UI changes. **Prefer the API for salary-filtered queries.**

```bash
sid=$(browse cloud sessions create --keep-alive | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION=$sid
browse open "https://recruiterroles.com/technology" --remote
browse snapshot --remote   # parse list: "Job listings" container
browse cloud sessions update "$sid" --status REQUEST_RELEASE
```

## Site-Specific Gotchas

- **`/api/v1/*` returns 401 without an `Authorization: Bearer rr_live_…` header**, even for the otherwise-public `/sectors`, `/locations`, `/stats` endpoints. The only no-key surfaces are `/feed.xml` and the rendered HTML slug pages.
- **`/recruiter-jobs?q=foo&city=bar` URL query params on the web page are silently ignored** (apart from `?page=N`). Typing into the search/location textboxes updates the URL with `?q=…&location=…` and pre-fills the input, but the displayed listings — and the "N jobs" total at top of the page — do **not** refilter on direct navigation to that URL or on Enter. Verified 2026-05-19: navigating fresh to `/recruiter-jobs?q=technical+recruiter` still showed "1,307 jobs" (the unfiltered total) with the unfiltered listing set. To filter the public web page, use **slug paths only** (or the API).
- **Public web pages support exactly one slug filter dimension at a time.** There is no URL grammar for compound web filters like "remote AND technology AND san-francisco". For compound filters, use the API.
- **Salary filtering is API-only on the public surfaces.** The web UI's "Filters" button opens a client-side popover (snapshot reveals no URL sync) — its state does not survive navigation and cannot be reproduced reliably from the URL layer. Use `salary_min` and `salary_disclosed` on `/api/v1/jobs`.
- **`salary_min` excludes undisclosed-salary jobs.** A large fraction of postings on the catalog do not disclose salary (`salary.disclosed: false`, both min/max null) — setting `salary_min` removes them entirely. To preserve them, omit `salary_min` and filter client-side, or call twice (with and without `salary_min`) and merge.
- **Salary currency is normalized to USD for the `salary_min` filter** but the response preserves the per-job `salary.currency`. Watch for non-USD bands in the output — e.g. one observed listing showed `SGD 45,000 / yr` rendered on a US-region job (Chicago, IL); that is the employer's declared currency, not a UI bug.
- **`employment_type` is API-only.** All slug-based "type" filters (`/contract`, `/full-time`, `/remote`) are actually a **work arrangement** mix: `/remote` returns jobs with `work_arrangement=remote`; `/contract` returns `employment_type=contract`; `/full-time` returns `employment_type=full_time`. They cannot be combined.
- **`work_arrangement=hybrid` returns 0 results in the current catalog** (`/api/v1/stats` confirmed `by_work_arrangement: { on_site: 606, hybrid: 0, remote: 105 }` on 2026-05-19). Don't treat hybrid as a fall-back for "remote-friendly" — it's an honest empty set. The same stats endpoint is the source of truth for what's currently bookable.
- **Two URL fields per job — pick the right one.** `url` is a tracked redirect (`/go/{slug}?ref=…`) that appends UTM params and registers a click. `canonical_url` is the direct `/jobs/{slug}` page. `apply_url` is the employer's external job-board URL (Workday, Paylocity, etc.) and is **not** tracked. Use `canonical_url` for display / linking, `url` only when you want to deliver real click attribution back to Recruiter Roles, and `apply_url` only as a downstream apply target.
- **Rate-limit is per-key per-UTC-day, not per-IP.** Sharing a key across services hits the 1,000/day ceiling collectively. Check `X-RateLimit-Remaining` per response; a 429 carries `Retry-After`.
- **Free key requires a backlink display.** If you render API data to end users, include a visible `<a href="https://recruiterroles.com">Recruiter Roles</a>`. Keys are suspended for hidden / cloaked backlinks (verified policy at `/api-docs`).
- **API is read-only (GET only).** Any other verb returns `405 method_not_allowed`. There is no agent-callable application endpoint — the `apply_url` external link is the only application surface.
- **Sector / city / state slugs are slugs, not display names.** `Healthcare & Life Sciences` is `healthcare-life-sciences`; `San Francisco, CA` is `san-francisco-ca`; `British Columbia` is `BC`. The authoritative enums are at `/api/v1/sectors`, `/api/v1/locations?level=countries|regions|cities`, and a key is required to query them.
- **`/feed.xml` has no since/cursor semantics.** Polling it re-streams the same recent items each call; dedupe by `<guid>` (which is the canonical job URL).
- **`/api/v1/` (with trailing slash) 308-redirects to `/api/v1` (without).** Some HTTP clients break on the redirect — strip the trailing slash up front.
- **No anti-bot, no captcha, no stealth needed.** A bare `bb cloud fetch <url>` / direct curl works for both API and slug pages from any IP. `--proxies` and `--verified` are *not* required and add latency.

## Expected Output

The skill's output shape mirrors `GET /api/v1/jobs` directly when the API path is used. When the slug-fallback path is used, populate the same shape from the scraped a11y snapshot — leaving `salary.*` null for undisclosed jobs and copying location text verbatim.

```json
{
  "query": {
    "q": null,
    "sector": "technology",
    "city": "san-francisco-ca",
    "state": "CA",
    "employment_type": "full_time",
    "work_arrangement": "remote",
    "salary_min": 90000,
    "salary_disclosed": true,
    "sort": "salary_desc"
  },
  "method": "api",
  "total_results": 4,
  "page": 1,
  "per_page": 50,
  "total_pages": 1,
  "jobs": [
    {
      "id": "809385c1-19e2-4cf1-9096-a06f96e897a2",
      "slug": "associate-technology-temporary-position-300-robert-half-canada-inc-f956ba",
      "title": "Associate (Technology) - Temporary Position",
      "company_name": "Robert Half",
      "company_logo_url": "https://assets.recruiterroles.com/company-logos/robert-half.webp",
      "location": {
        "city": "San Francisco",
        "state": "CA",
        "country": "US",
        "is_remote": true,
        "work_arrangement": "remote"
      },
      "employment_type": "full_time",
      "primary_sector": "Technology",
      "secondary_sectors": [],
      "salary": {
        "disclosed": true,
        "min_dollars": 95000,
        "max_dollars": 135000,
        "currency": "USD"
      },
      "description_excerpt": "As an Associate (Technology), you will be responsible for ...",
      "source_type": "scraped",
      "canonical_url": "https://recruiterroles.com/jobs/associate-technology-temporary-position-300-robert-half-canada-inc-f956ba",
      "apply_url": "https://roberthalf.wd1.myworkdayjobs.com/...",
      "url": "https://recruiterroles.com/go/associate-technology-...-f956ba?ref=YOUR_REF",
      "posted_at": "2026-05-17T18:01:26.048+00:00",
      "updated_at": "2026-05-18T20:20:07.859+00:00"
    }
  ]
}
```

Empty-results shape (valid; no filter is a hard error):

```json
{
  "query": { "...": "..." },
  "method": "api",
  "total_results": 0,
  "page": 1,
  "per_page": 50,
  "total_pages": 0,
  "jobs": []
}
```

Slug-fallback shape (no key available, scraped from `/recruiter-jobs-in-san-francisco` etc.):

```json
{
  "query": { "city": "san-francisco", "method_constraint": "slug-only" },
  "method": "slug_scrape",
  "total_results": 15,
  "page": 1,
  "jobs": [
    {
      "slug": "executive-search-senior-associate-financial-services-heidrick-struggles-inc-cb17b3",
      "title": "Executive Search Senior Associate, Financial Services",
      "company_name": "Heidrick & Struggles",
      "location": { "raw": "San Francisco, CA" },
      "employment_type": "full_time",
      "work_arrangement": null,
      "primary_sector": "Financial Services",
      "is_agency": true,
      "salary": { "disclosed": false, "min_dollars": null, "max_dollars": null, "currency": null },
      "posted_age": "16h ago",
      "canonical_url": "https://recruiterroles.com/jobs/executive-search-senior-associate-financial-services-heidrick-struggles-inc-cb17b3"
    }
  ]
}
```
