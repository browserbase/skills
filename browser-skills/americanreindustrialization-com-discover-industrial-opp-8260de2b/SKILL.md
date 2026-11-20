---
name: americanreindustrialization-com-discover-industrial-opp-8260de2b
title: American Reindustrialization — Discover Companies & Jobs
description: >-
  Discover companies, startups, suppliers, and job opportunities across American
  reindustrialization — manufacturing, energy, defense, aerospace, robotics,
  semiconductors, and industrial software — via the site's public JSON REST API
  at /api/* (companies, jobs, categories, tags).
website: americanreindustrialization.com
category: directory
tags:
  - reindustrialization
  - manufacturing
  - jobs
  - companies
  - directory
  - industrial
  - supply-chain
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      Fallback only — the site is a React SPA so any browser-driven step pays a
      hydration tax for data the JSON API already returns whole. Use scripted
      browsing only if /api/* ever starts 4xx-blocking; deep-link to
      /companies?category=&state=, /categories/{slug}, /tags/{slug},
      /jobs/c/{cat}, /companies/{slug}, /jobs/l/{slug}.
  - method: url-param
    rationale: >-
      Useful for human / agent browsing — front-end URLs
      /companies?category=&state=, /jobs?category=&tag=, /categories/{slug},
      /tags/{slug}, /jobs/c/{cat-slug} are deep-linkable, but ?company=,
      ?job_type=, ?work_mode=, ?location=, ?experience= do NOT filter (UI-state
      only).
verified: true
proxies: true
---
# American Reindustrialization — Discover Industrial Opportunities

## Purpose

Discover companies, startups, suppliers, and job opportunities shaping the American reindustrialization wave on `americanreindustrialization.com` — a curated public directory spanning manufacturing, defense & security, energy, technology, materials & metals, aerospace, autonomous systems, industrial automation, logistics, supply chain, AI, and industrial software. Returns structured records: companies (logo, tagline, descriptions, HQ city/state, sector, tags, employee range, funding stage, founded year, careers email, website, jobs count) and jobs (title, description, employer, location, work mode, employment type, experience level, posting date, salary when published, and the **external `apply_url`** pointing to the employer's own ATS — Lever / Greenhouse / Ashby). Read-only; never submits, applies, or POSTs.

## When to Use

- Bulk extraction of every company in a sector (e.g. "all U.S. fusion-energy companies", "all CNC machining suppliers", "all defense-tech startups in Texas").
- Job hunting / market mapping — "all senior roles in aerospace", "all on-site jobs in manufacturing posted in the last 30 days", "all open roles at Last Energy".
- Investor / corp-dev sourcing — enumerating early-stage reindustrialization companies by funding stage, sector, or geography.
- Building downstream tooling (newsletters, Slack feeds, dashboards) that watches the directory for new entries.
- Tag-based discovery (e.g. `made-in-usa`, `fusion-energy`, `evtol`, `cnc-machining`, `sheet-metal-fabrication`, `predictive-maintenance`).

## Workflow

The site is a Vite/React SPA, but its content is served by a clean public JSON REST API at `https://americanreindustrialization.com/api/*` — **no auth, no cookies, no anti-bot stealth, no rate-limit headers observed**. The API is the canonical path; scripted browsing is strictly the fallback (the SPA shell is empty `<div id="root"></div>` until JS hydrates, so every browser-driven step pays a render-tax for data the API hands back in milliseconds). Cloudflare fronts the site but does not challenge the API. A residential proxy is **not** required.

### 1. Pick the right list endpoint

| Question                                 | Endpoint                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| "Show me companies"                      | `GET /api/companies`                                                     |
| "Show me one company"                    | `GET /api/companies/{slug}`                                              |
| "Show me jobs"                           | `GET /api/jobs`                                                          |
| "Show me one job"                        | `GET /api/jobs/{title-slug}-{8charId}`                                   |
| "Enumerate every category"               | `GET /api/categories` (44 items, all-time) or `GET /api/jobs/categories` (15 items, only categories with ≥1 active job; each includes `jobs_count`) |
| "Enumerate every tag"                    | `GET /api/tags` (87 items, all-time) or `GET /api/jobs/tags` (29 items, with active jobs) |
| "Enumerate companies that have jobs"     | `GET /api/jobs/companies` — `[{id, name}]`, 20 items                     |
| "Autocomplete job titles"                | `GET /api/jobs/titles` — array of 403 distinct title strings             |

All list responses have the shape `{"data": [...], "total": N, "page": 1, "limit": 20, "totalPages": K}`. Detail endpoints return the bare object (no envelope). Enum endpoints (`/api/categories`, `/api/tags`, `/api/jobs/categories`, `/api/jobs/companies`, `/api/jobs/tags`, `/api/jobs/titles`) return a bare JSON array — no envelope, no pagination.

### 2. Filter `/api/companies`

Append as query string. Multiple filters combine with AND.

| Param          | Values                                            | Notes                                                                                                                                                                  |
| -------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page`         | integer ≥ 1                                       | Default 1.                                                                                                                                                             |
| `limit`        | integer (server caps at ~100)                     | Default 20. Use `limit=100` for fewer round-trips.                                                                                                                     |
| `category`     | category slug (e.g. `manufacturing`)              | Single-value. Categories live at `/api/categories`.                                                                                                                    |
| `state`        | two-letter US state (e.g. `CA`, `TX`)             | Matches `hq_state`. Param is `state`, **not** `hq_state`.                                                                                                              |
| `query`        | free-text                                         | Matches name / tagline / description. Param is `query`, **not** `q` or `search`.                                                                                       |
| `status`       | `published`                                       | **Critical**: the unfiltered total is 96, but only 68 are publicly published — the UI's `/companies` page filters to `status=published`. Add this for UI parity.       |

### 3. Filter `/api/jobs`

| Param              | Values                                                              | Notes                                                                                                                                |
| ------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `page` / `limit`   | as above                                                            | Total job pool was 501 at survey time.                                                                                               |
| `category`         | category slug (`manufacturing`, `aerospace`, `energy`, …)           | Single-value.                                                                                                                        |
| `tag`              | tag slug (`fusion-energy`, `made-in-usa`, `evtol`, …)               | Single-value.                                                                                                                        |
| `company_id`       | **UUID** (e.g. `a1ba45d1-3e7e-429c-8e13-3eb19eb4b3bc`)              | **Critical**: filter by company **ID only**, not slug or display name. Resolve the UUID first via `/api/companies/{slug}` → `.id` or `/api/jobs/companies`. |
| `job_type`         | `full-time` / `internship` / `part-time` / `contract`               | **kebab-case** — `full_time` returns 0.                                                                                              |
| `work_mode`        | `on-site` / `remote` / `hybrid`                                     | `on-site` is hyphenated.                                                                                                             |
| `experience_level` | `entry` / `mid` / `senior` / `lead`                                 | Param is `experience_level`, **not** `experience` or `level`.                                                                        |
| `query`            | free-text                                                           | Searches title + description.                                                                                                        |

### 4. Walk pagination

```text
GET /api/companies?status=published&limit=100&page=1   # → 68 results, totalPages=1
GET /api/jobs?limit=100&page=1                          # → 100/501
GET /api/jobs?limit=100&page=2                          # → next 100
…until page > totalPages
```

A `Referer` header is **not** required. No auth. Keep a courteous ≤ 2 req/s.

### 5. Read individual records

- `GET /api/companies/{slug}` returns the full company object — same field set as list items plus full `categories[]`, `tags[]`, `company_categories[]` (with `is_primary`), and `products_services` array.
- `GET /api/jobs/{title-slug}-{8charId}` returns the job with an embedded `company` object and the external `apply_url` (almost always an ATS URL like `https://jobs.lever.co/...`, `https://boards.greenhouse.io/...`, or `https://jobs.ashbyhq.com/...`).

The `slug` for a job is e.g. `radar-intern-632a1249` — title-kebab + hyphen + an 8-char hex id. Get the slug from the list response's `slug` field, or from `/companies/{slug}` pages on the front-end (`/jobs/l/{slug}` href).

### 6. Resolve image URLs verbatim

`logo_url` / `cover_image_url` are pre-built absolute URLs on the `img.americanreindustrialization.com` CDN, the legacy `americanreindustrialization.com/storage/...` path, the company's own domain, or `framerusercontent.com`. Use them as-is.

### Browser fallback

If the API ever returns 403/5xx (none observed during survey), drive the SPA directly:

1. `browse open https://americanreindustrialization.com/{path}` — wait ~2-3s for hydration; the bare HTML is empty until React mounts.
2. The following front-end URLs are deep-linkable and **do** honor URL params:
   - `/companies?category={slug}&state={XX}` — directory filter (note: front-end UI shows `status=published` data only).
   - `/categories/{slug}` — full company list for one category (single page, no pagination control).
   - `/tags/{slug}` — full company list for one tag.
   - `/jobs?category={slug}` — paginated job board, filtered by category.
   - `/jobs?tag={slug}` — paginated job board, filtered by tag.
   - `/jobs/c/{category-slug}` — single-page job list for one category (e.g. `/jobs/c/aerospace` → 99 listings; no pagination control).
   - `/jobs/l/{slug}` — single job detail; the green **Apply on Company Site** anchor's `href` is the same `apply_url` field.
   - `/companies/{slug}` — single company detail with sidebar **View All Jobs at {Company}** link.
3. `browse get markdown body` after each navigation; harvest data from the rendered text. The page-rendered text mirrors the API fields 1:1.
4. **Do not** attempt URL filters that the SPA reads only from in-page state — these are dead in the URL: `?company=<anything>`, `?job_type=`, `?work_mode=`, `?location=`, `?experience=`, `?min_salary=`, `?posted=`, `?position=`. They appear in the homepage's "X open roles" anchors (`/jobs?company=anatar`) but **do not filter the list** — they just navigate to the unfiltered job board. Use the API's `company_id` (UUID) instead.

## Site-Specific Gotchas

- **Public JSON API at `/api/*` is the canonical surface.** Do not scrape the React-rendered HTML when the API can answer in one request. There is no anti-bot challenge on the API; no auth, no cookies, no `Referer` requirement. Cloudflare sits in front (`Cf-Ray`, `Server: cloudflare`) but does not block direct fetches.
- **`/api/companies` total = 96 but `/companies` UI shows 68.** The unfiltered API includes drafts / unpublished records. Add `?status=published` (or `?published=true`) to match the public catalog. This is the single most common mistake — leaving it off yields ~30% phantom records with stale or null fields.
- **`/api/jobs?company={name}` and `?company_slug={slug}` are silently ignored** — they 200 with the unfiltered 501-job pool. Only **`company_id={uuid}`** filters. To find the UUID: `GET /api/companies/{slug}` → `.id`, or page through `/api/jobs/companies` (only 20 employers have active listings). Hardcoding company slugs in your filter logic will produce false-positive "all 501 jobs match this company" bugs.
- **Filter param names are non-obvious.** Companies use `state=` (not `hq_state=`) and `query=` (not `q=` or `search=`). Jobs use `experience_level=` (not `experience=` or `level=`) and `job_type=` in **kebab-case** (`full-time`; `full_time` returns zero). Unrecognized params are silently dropped — a 200 OK with `total=501` always means "your filter didn't apply", never "no matches".
- **`work_mode=on-site` is hyphenated.** Enum values for `work_mode`: `on-site` (492), `remote` (6), `hybrid` (3). For `experience_level`: `entry` (18), `mid` (458), `senior` (21), `lead` (~4). For `job_type`: `full-time` (484), `internship` (15), `part-time` (1), `contract` (1).
- **Front-end URL filters that DON'T work in the URL bar.** The `/jobs` filter sidebar (Company, Position, Job Type, Work Mode, Experience, Location, Minimum Salary, Posted, Tag) is **mostly UI-state only**. Only `?category=`, `?tag=`, and the search-bar `q=` propagate to URL. The other dropdowns mutate React state and do not produce shareable / scriptable URLs — even though the homepage's "X open roles" badges link to `/jobs?company=<slug>` URLs, those don't actually filter the displayed list. Always use the JSON API for non-category/tag job filtering.
- **`/categories/{slug}` and `/jobs/c/{cat-slug}` render full lists on a single page, no pagination.** `/companies` and `/jobs` (the global views) do paginate (20 per page front-end, configurable up to ~100 on the API).
- **`jobs_count` on company records is often `0`** because most companies in the directory don't post jobs through the platform — only ~20 employers have active listings. Use `/api/jobs/companies` to enumerate hiring employers cheaply rather than counting company-by-company.
- **`apply_url` points off-site.** Every job's apply flow exits to the employer's own ATS (Lever, Greenhouse, Ashby, etc.). The site does not collect applications — never POST anywhere on `americanreindustrialization.com` for job applications.
- **`/api/news` and `/api/blog` exist but currently return empty arrays (`[]`).** Don't rely on them for content discovery yet.
- **`/api/states` returns 404.** No public enum endpoint for U.S. states; use a hardcoded list of two-letter abbreviations when needed, or harvest the distinct `hq_state` values across `/api/companies`.
- **robots.txt is restrictive for AI crawlers** — Cloudflare-managed `Content-Signal: search=yes, ai-train=no` and explicit `Disallow: /` for `ClaudeBot`, `GPTBot`, `CCBot`, `Google-Extended`, `Bytespider`, `Applebot-Extended`, `Amazonbot`, `CloudflareBrowserRenderingCrawler`. Honor it for compliant operation. The API does not check User-Agent; observed requests succeed regardless, but the site has expressly reserved AI-training rights under the EU Article 4 opt-out signaled in the robots header.
- **Sitemap.xml is the cheap enumeration backstop.** `https://americanreindustrialization.com/sitemap.xml` (~170 KB) lists every `/companies/{slug}`, `/categories/{slug}`, `/tags/{slug}`, and `/jobs/c/{cat}` URL — but **does NOT list individual job-listing URLs** (`/jobs/l/...`) or tag-scoped job views (`/jobs/t/...`). For job enumeration, walk `/api/jobs` pagination instead.
- **No rate-limit headers were observed, but be courteous.** Cloudflare is in front; aggressive bursts will earn 429s. ≤ 2 req/s sustained, batched paginated calls (`limit=100`) is the polite path.

## Expected Output

### Shape A — paginated company list (`GET /api/companies?status=published&category=manufacturing&limit=100`)

```json
{
  "data": [
    {
      "id": "a1c19858-1eda-4bff-a0cb-d6f94ab9d3f7",
      "name": "Harmony AI (tryharmony.ai)",
      "slug": "harmony-ai",
      "tagline": "AI Automation for Manufacturing",
      "short_description": "Harmony AI provides an AI-native operating system that connects plant data...",
      "full_description": "Harmony AI is an AI-native operating system designed specifically for American manufacturing...",
      "website_url": "https://tryharmony.ai",
      "logo_url": "https://img.americanreindustrialization.com/company-assets/a1c19858-.../kt5XHThBvsz7....jpg",
      "hq_city": null,
      "hq_state": null,
      "hq_country": "United States",
      "founded_year": null,
      "employee_range": null,
      "funding_stage": null,
      "primary_sector": null,
      "is_us_based": true,
      "status": "published",
      "published_at": "2026-04-22T17:33:11.000000Z",
      "careers_email": null,
      "products_services": [],
      "jobs_count": 0,
      "categories": [
        { "id": "6e1ee891-...", "name": "Manufacturing", "slug": "manufacturing", "pivot": { "is_primary": 1 } }
      ],
      "tags": [
        { "id": "5923c8a5-...", "name": "AI & Machine Learning", "slug": "ai-machine-learning", "tag_type": "tech" }
      ]
    }
  ],
  "total": 36,
  "page": 1,
  "limit": 100,
  "totalPages": 1
}
```

### Shape B — paginated job list (`GET /api/jobs?category=aerospace&job_type=full-time&limit=100`)

```json
{
  "data": [
    {
      "id": "a1ba48c9-c18b-4bf4-9945-f82f1af481e5",
      "company_id": "a1ba45d1-3e7e-429c-8e13-3eb19eb4b3bc",
      "title": "Research Engineer, Aerosol & Liquid Dispersion Systems",
      "slug": "research-engineer-aerosol-liquid-dispersion-systems-9601c64b",
      "description": null,
      "job_type": "full-time",
      "work_mode": "on-site",
      "location_city": "El Segundo",
      "location_state": "CA",
      "location_country": "United States",
      "salary_min": null,
      "salary_max": null,
      "salary_currency": null,
      "salary_period": null,
      "experience_level": "mid",
      "apply_url": "https://jobs.lever.co/make-rain/...",
      "status": "published",
      "posted_at": "2026-05-08T04:31:23.000000Z",
      "expires_at": null,
      "is_auto_fetched": true,
      "company": {
        "id": "a1ba45d1-3e7e-429c-8e13-3eb19eb4b3bc",
        "name": "Rainmaker",
        "slug": "rainmaker",
        "logo_url": "https://img.americanreindustrialization.com/company-assets/.../dpyvw....jpg",
        "tagline": "Make rain. Make snow. Make..."
      }
    }
  ],
  "total": 73,
  "page": 1,
  "limit": 100,
  "totalPages": 1
}
```

### Shape C — single company (`GET /api/companies/relativity-space`)

```json
{
  "id": "...",
  "name": "Relativity Space",
  "slug": "relativity-space",
  "tagline": "...",
  "short_description": "...",
  "full_description": "...",
  "website_url": "https://www.relativityspace.com",
  "hq_city": "...",
  "hq_state": "...",
  "categories": [ { "name": "Aerospace", "slug": "aerospace", "pivot": { "is_primary": 1 } } ],
  "tags": [ { "name": "Space", "slug": "space" }, … ],
  "products_services": ["Terran R", "Stargate 3D printer", …],
  "jobs_count": 0,
  "careers_email": null
}
```

### Shape D — single job (`GET /api/jobs/radar-intern-632a1249`)

```json
{
  "id": "...",
  "company_id": "a1ba45d1-...",
  "title": "Radar Intern",
  "slug": "radar-intern-632a1249",
  "job_type": "internship",
  "work_mode": "on-site",
  "location_city": "Norman",
  "location_state": "OK",
  "experience_level": "entry",
  "apply_url": "https://jobs.lever.co/make-rain/58c47b24-5e07-4c40-84ca-046c040f5131",
  "posted_at": "2026-05-08T04:31:23.000000Z",
  "company": { "id": "...", "name": "Rainmaker", "slug": "rainmaker", "logo_url": "...", "tagline": "..." }
}
```

### Shape E — taxonomy enum (`GET /api/categories`, `GET /api/tags`, `GET /api/jobs/categories`)

```json
[
  {
    "id": "6e1ee891-4ade-4559-9ef4-56299c1c39aa",
    "name": "Manufacturing",
    "slug": "manufacturing",
    "description": "Companies involved in industrial manufacturing and production",
    "parent_id": null,
    "sort_order": 1,
    "image_url": null,
    "jobs_count": 253
  }
]
```

(Top-level array, no envelope, no pagination. `jobs_count` present only on `/api/jobs/categories` and `/api/jobs/tags`. `tag_type` present only on `/api/tags` and `/api/jobs/tags` — observed values include `tech`, `industry`, and others.)
