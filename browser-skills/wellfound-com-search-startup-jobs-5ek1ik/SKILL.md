---
name: wellfound-com-search-startup-jobs-5ek1ik
title: Wellfound Startup Job Search
description: >-
  Search Wellfound (formerly AngelList Talent) for startup job postings —
  supporting the full filter surface (role, location, remote policy, experience
  level, job type, salary + equity ranges with currency, company size + stage,
  markets, skills, visa sponsorship, recency, sort, pagination) — and return
  structured JSON jobs with full company, recruiter, salary/equity, and
  description data. Read-only.
website: wellfound.com
category: jobs
tags:
  - jobs
  - startups
  - wellfound
  - angellist
  - datadome
  - graphql
source: 'browserbase: agent-runtime 2026-05-16'
updated: '2026-05-16'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      Wellfound has no public developer API — apitracker.io/a/wellfound confirms
      every developer-docs field is empty. The internal Apollo /graphql endpoint
      is callable only from inside a page-warmed browser context (CSRF +
      datadome + _wellfound cookies). Cookieless GraphQL POSTs return 401/403.
      Treat the page's __NEXT_DATA__ Apollo state as the API surface.
  - method: url-param
    rationale: >-
      SEO landing pages (/role/<role>, /role/l/<role>/<loc>, /location/<loc>,
      /company/<slug>/jobs) accept only ?page=N — they don't expose
      salary/equity/stage/size/skills filters. The dynamic /jobs filter app uses
      non-stable URL-param encoding (robots.txt confirms /*?role=*, /*?jobId=*,
      /*?jobSlug=* are all dynamic). URL-only construction is reliable for
      role+location queries; the full filter surface requires driving the UI.
verified: false
proxies: false
---
# Wellfound Startup Job Search

## Purpose

Given a Wellfound (formerly AngelList Talent) job-search intent — a free-form role+location, a full `/jobs?…` URL, a `/company/<slug>/jobs` URL, or a single job-slug URL — return matching startup job postings as structured JSON. For each posting: job id + canonical URL, title, company (name, slug, logoUrl, Wellfound URL, short pitch, stage, size, total funding when surfaced), location(s) and remote policy, posted timestamp, employment type, experience level, base salary range and equity range (with currency), required skills, full long-body description, recruiter / hiring-manager reference when surfaced, and the application URL (Wellfound's apply route or the company's ATS). Read-only — never clicks Apply, Save, Message Recruiter, Follow Company, or any mutation control.

## When to Use

- "Find me senior backend engineer roles at seed-to-Series-B AI startups in NYC with salary ≥ $180k and ≥ 0.25% equity."
- "What's hiring at OpenAI right now on Wellfound?" → `/company/openai/jobs`.
- "Open this job posting and tell me what stack they use" → direct job-slug URL, single-page extraction.
- Daily monitoring of newly-posted roles matching a saved filter set (role + location + stage + size).
- Bulk extraction of full Apollo-state job graphs for downstream salary/equity analytics on startup compensation — Wellfound is one of the few job boards that surfaces equity %.
- Anywhere you'd otherwise reach for the AngelList/Wellfound public API. It doesn't exist (`apitracker.io/a/wellfound` shows every developer-docs field empty); the data is only available through the Wellfound web app.

## Workflow

The Wellfound web app is a Next.js + Apollo GraphQL client. Every search/listing/company page ships a complete Apollo graph in `<script id="__NEXT_DATA__">` — that's the optimal extraction surface (no DOM scraping, no per-field selector brittleness). Two architectural facts dominate:

1. **Wellfound has no public API.** Partner-only B2B access exists for Wellfound Reach but is not callable from a generated session. The internal `/graphql` endpoint is reachable only through the live web app with a valid CSRF token, datadome cookie, and `_wellfound` session cookie — replaying it cookieless or out-of-context returns 403/401.
2. **DataDome anti-bot gates everything except the marketing landing page.** Verified during this skill's generation: `browse cloud fetch --proxies https://wellfound.com/` returned 200 OK with the static landing HTML; every job-search path (`/jobs`, `/jobs?role=…`, `/role/<role>`, `/role/l/<role>/<loc>`, `/location/<loc>`, `/company/<slug>`, `/company/<slug>/jobs`, `/sitemap.xml`) returned a 403 with `x-datadome: protected` and a captcha-delivery interstitial. The Browserbase Fetch API (no Verified fingerprint) cannot get past DataDome — a full `browse cloud browse` session with `--verified --proxies` is mandatory.

The result: lead with scripted browsing through Browserbase. If, mid-session, you observe an XHR/fetch to `/graphql` carrying a `JobSearchResults`-shaped operation that succeeds with the page-warmed cookies, capture the operation hash + variables and replay it within the same browser context for pagination — but never as a cookieless out-of-band request.

### 1. Open a Verified + residential-proxy session and seed the DataDome cookie

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies | jq -r '.id')
browse cloud browse --connect "$SID" open "https://wellfound.com/"
browse cloud browse --connect "$SID" wait load
browse cloud browse --connect "$SID" wait timeout 2500   # let DataDome's JS challenge finish
```

`--verified` AND `--proxies` are both required. A bare session or a `browse cloud fetch --proxies` (no Verified) returns DataDome's `403 + x-datadome: protected` HTML on every job route — verified across 9 URL probes during skill generation.

### 2. Inject a logged-in cookie context (strongly recommended)

Wellfound gates most of the high-value surface behind login:

- The `/jobs?…` filter app **redirects unauthenticated visitors to `/jobs/login`** for any non-trivial filter combination (anything beyond a bare role/location SEO landing page).
- **Salary and equity ranges are hidden** on most listings until you're signed in (the field renders as a "Sign in to see" CTA).
- The **full long-body description** is truncated to a snippet for guests.
- **Pagination beyond ~page 1** drops you into the login wall.

Use the `cookie-sync` skill (`/tmp/bb-skills/skills/cookie-sync/SKILL.md`) to import a logged-in `_wellfound` session cookie from a real authenticated browser into your Browserbase session. After cookie injection, hard-refresh `https://wellfound.com/jobs` and confirm the top-right nav shows the user avatar (not the "Sign in" button) before issuing any filtered search.

If no logged-in context is available, the skill degrades gracefully to **guest mode** — usable only for unauthenticated SEO landing pages (`/role/<role>`, `/role/l/<role>/<loc>`, `/location/<loc>`, `/company/<slug>`). Document `auth_state: "guest"` in the output so downstream consumers know salary/equity fields will be null.

### 3. Resolve the input to a canonical URL

| Input shape | Action |
|---|---|
| Full `https://wellfound.com/jobs?…` URL | Use as-is. |
| `/company/<slug>` or `/company/<slug>/jobs` URL | Use as-is — single-company extraction. |
| `/jobs/<id>-<slug>` single-job URL | Use as-is — single-page extraction (skip search). |
| Free-form role+location | First try the SEO landing path — it's lighter and renders without login. Slug the role (lowercase, hyphenated, must match one of Wellfound's ~50 curated role slugs — see Gotchas) and the location (city slug, e.g. `san-francisco`, `new-york`, `london`). Combine: `/role/l/<role>/<loc>`. If only a role is given: `/role/<role>`. If only a location: `/location/<loc>`. |
| Free-form intent with filters beyond role+location (salary, equity, stage, size, skills, market tags, visa, recently-active, sort, remote-policy, distributed-only) | Navigate `/jobs`, then drive the **filter UI** (step 4) — the SEO landing pages do not expose this surface. Requires login. |

Wellfound's SEO landing pages (`/role/…`, `/location/…`) accept only `?page=<N>` as a query param — they are not the dynamic filter app. The dynamic filter app lives at `/jobs?…` and is what you need for the full filter surface described in the task spec.

### 4. Drive the `/jobs` filter UI (logged-in path) — full filter surface

```bash
browse cloud browse --connect "$SID" open "https://wellfound.com/jobs"
browse cloud browse --connect "$SID" wait load
browse cloud browse --connect "$SID" wait timeout 3000
browse cloud browse --connect "$SID" snapshot
```

The filter rail lives on the right side of the page. Each control is a button that opens a popover/menu; you click options inside, then click outside to close. The filter surface (per Wellfound's own help docs, `help.wellfound.com/article/777`):

| Filter | UI control | Notes |
|---|---|---|
| **Role** | Multi-select dropdown ("Role") | ~50 curated roles. Free-text role title NOT supported in this control — for arbitrary role-text matching, use the **Keywords** filter. |
| **Location** | Multi-select dropdown ("Location") | Cities / metros / countries. Multi-select. Includes a special "Remote" entry. |
| **Remote policy** | Oval button inside the location field (defaults to "Worldwide") | Three values: `None` (on-site only), `Some` (remote OK + on-site), `Only remote`. |
| **HQ-from (companies based in)** | Required sub-control when remote ≠ None | "Show remote jobs of companies based in" — accepts countries/regions. Filters by company HQ, not your location. |
| **Distributed teams only** | Toggle in the remote popover | Limits results to companies self-identifying as primarily/entirely remote. |
| **Salary** | Min + Max number inputs, currency dropdown | Default behavior: jobs without listed salary are filtered out when min/max set. Toggle "Include jobs with no salary listed" to include unlisted. |
| **Equity** | Dual-handle range slider | % equity, 0 to ~5%+. Surfaces on most listings even when salary is hidden. |
| **Job type** | Multi-select checkboxes | full-time, contract, internship, cofounder. |
| **Experience level** | Multi-select checkboxes | intern, junior, mid, senior, principal/exec. (Map task input verbatim — Wellfound's UI labels are `Entry-Level`, `Mid-Level`, `Senior`, etc.) |
| **Investment stage** | Multi-select | bootstrapped, seed, series_a, series_b, series_c, series_d_plus, public, acquired. |
| **Company size** | Multi-select | Enum: `SIZE_1_10`, `SIZE_11_50`, `SIZE_51_200`, `SIZE_201_500`, `SIZE_501_1000`, `SIZE_1001_5000`, `SIZE_5000_PLUS`. |
| **Industries / markets** | Multi-select autocomplete | Wellfound's market tags (`AI`, `FinTech`, `B2B SaaS`, `Climate`, …). Free-typed values must autocomplete to a known tag. |
| **Tech stack / skills** | Multi-select autocomplete | Skill tags (`Python`, `React`, `Postgres`, …). Same autocomplete behavior. |
| **Visa sponsorship** | Checkbox ("Will sponsor visa") when surfaced | Not surfaced on all variants; check snapshot for presence. |
| **Recently active** | Dropdown ("Last active") | "Within last 24 hours", "Within last week", "Within last month". |
| **Keywords** | Free-text input | Runs across job listing + company text. Use this for free-text role titles not in the 50-role taxonomy. |
| **Sort order** | Dropdown ("Sort by") | `Relevance` (default), `Newest`. |

**For each filter the caller passes:**
1. `browse cloud browse --connect "$SID" snapshot` to find the trigger button's ref.
2. `click` the trigger → `wait timeout 800` for the popover.
3. For multi-select autocomplete (Role, Location, Industries, Skills): click the textbox ref, `type <value>`, `wait timeout 1000` for the autocomplete dropdown, `click` the matching `option:` ref. **Do not use `fill`** — `fill` synthesizes an Enter keypress that submits the filter before the autocomplete dropdown surfaces (same gotcha as OpenTable's typeahead).
4. For multi-select checkboxes: click each `checkbox: <label>` ref inside the popover.
5. For sliders (Equity): use `browse cloud browse drag <x1> <y1> <x2> <y2>` on the handle; values are approximate — snap to the nearest visible tick label.
6. Click outside the popover (e.g., click the page header) to close it.

After all filters are applied, **the URL updates with a serialized filter state** but the encoded form is not stable — do not try to construct `/jobs?role=…&location=…` URLs directly. Drive the UI and let the app build the URL. (Wellfound's `robots.txt` confirms the URL params are dynamic — `Disallow: /*?role=*`, `Disallow: /*?jobId=*`, `Disallow: /*?jobSlug=*` etc.)

### 5. Extract the Apollo graph (recommended — fast, structurally reliable)

After the results grid is rendered, extract `__NEXT_DATA__` in a single CDP call:

```bash
browse cloud browse --connect "$SID" eval \
  "JSON.stringify(JSON.parse(document.getElementById('__NEXT_DATA__').textContent).props.pageProps.apolloState.data)" \
  > /tmp/page1-graph.json
```

The graph is a flat key/value map. Iterate keys and pick out:

- **`StartupResult:<id>`** — one per matched company on the search page. Fields include `id`, `name`, `slug`, `logoUrl`, `highConcept` (company one-liner), `companySize` (`SIZE_*` enum), `badges` (e.g. `ACTIVELY_HIRING`), `highlightedJobListings` (an array of `JobListingSearchResult` refs).
- **`JobListingSearchResult:<id>`** — search-grid job entries. Fields: `id`, `title`, `slug`, `primaryRoleTitle`, `jobType` (`full_time` / `contract` / `internship` / `cofounder`), `remote` (bool), `locationNames` (`{type: "json", json: ["Bengaluru", ...]}` — note the nested wrapper), `liveStartAt` (epoch seconds, the posted timestamp), `compensation` (a short human-readable string like `$120k – $180k • 0.1% – 0.5%` — already pre-formatted; salary and equity ranges are baked into this string and must be regex-extracted), `descriptionSnippet` (short HTML excerpt — NOT the full body).
- **`Startup:<id>`** — full company profile (only present on `/company/<slug>` pages, not on `/jobs` search pages). Fields: `name`, `slug`, `logoUrl`, `highConcept`, `companySize`, `totalRaisedAmount`, `companyUrl`, `twitterUrl`, `linkedInUrl`, `productHuntUrl`, `jobPreamble`, plus the cursor-paginated `jobListingsConnection({...})` key (see step 7).
- **`seoLandingPageJobSearchResults:…`** — search meta. Read `pageCount` and `pageSize` to know how many pages to fetch.
- **`User:<id>`** / **`Recruiter:<id>`** — recruiter / hiring-manager refs, surfaced on full job pages when present.

**Unpack references.** Apollo serializes nested objects as `{type: "id", id: "<key>"}` pointers. Resolve them by looking up the key in the same `data` map. The canonical flattener is:

```js
function unpack(node, graph) {
  if (node && typeof node === 'object' && node.type === 'id' && node.id) {
    return unpack(graph[node.id], graph);
  }
  if (Array.isArray(node)) return node.map(v => unpack(v, graph));
  if (node && typeof node === 'object') {
    const out = {};
    for (const k of Object.keys(node)) out[k] = unpack(node[k], graph);
    return out;
  }
  return node;
}
```

### 6. Fetch full job-detail bodies

The `JobListingSearchResult` graph node only carries `descriptionSnippet`. To get the **full long-body description**, the visible skill tag list, the application URL (Wellfound's apply route vs. the company's external ATS), and the recruiter reference, you have to open the job's own page. The canonical URL is:

```
https://wellfound.com/jobs/<id>-<slug>
```

where `<id>` and `<slug>` come from the `JobListingSearchResult` node. Open each detail page in the same session (sequentially — Wellfound rate-limits parallel navigations on the same session), and extract `__NEXT_DATA__` again. The job-detail graph contains a `JobListing:<id>` node with the full `description` (HTML/Markdown body), `skills: [{id, name}]`, `applyUrl` or `atsSource`/`atsUrl`, and the `recruiter` ref.

Pace at ~1 detail page / 1.5s. If you need 50+ details, consider extracting only the IDs first and short-circuiting to a "summary only" output mode for clients that don't need full bodies.

### 7. Paginate

Two pagination modes coexist:

- **SEO landing pages** (`/role/<role>`, `/role/l/<role>/<loc>`, `/location/<loc>`): query-param pagination. Open `<base>?page=<N>` for N in `2..pageCount`. Read `pageCount` from `seoLandingPageJobSearchResults:*.pageCount`. Each page is its own `browse cloud browse open` (DataDome resets the JS challenge state; the cookie persists within the session).
- **`/jobs` filter app + `/company/<slug>/jobs`**: cursor pagination, no query-param form. The Apollo key is `jobListingsConnection({"after":"<cursor>","filters":{...},"first":20})`. The first page's cursor is `MA==` (base64 for `0`). Scroll the results grid to the bottom — Wellfound infinite-scrolls and the next `jobListingsConnection(…)` graph node appears in `__NEXT_DATA__` after each scroll-triggered fetch. To collect all pages:

  ```bash
  for i in $(seq 1 20); do
    browse cloud browse --connect "$SID" scroll 0 0 0 2000
    browse cloud browse --connect "$SID" wait timeout 1500
    browse cloud browse --connect "$SID" eval \
      "JSON.stringify(JSON.parse(document.getElementById('__NEXT_DATA__').textContent).props.pageProps.apolloState.data)" \
      > "/tmp/scroll-$i.json"
    # exit when the most-recent jobListingsConnection has no more `edges` beyond what you've already seen
  done
  ```

### 8. Single-job URL fast-path

If the input is a `/jobs/<id>-<slug>` URL or a `/company/<slug>/jobs/<id>-<slug>` URL, skip search entirely:

```bash
browse cloud browse --connect "$SID" open "$INPUT_URL"
browse cloud browse --connect "$SID" wait load
browse cloud browse --connect "$SID" wait timeout 2500
browse cloud browse --connect "$SID" eval \
  "JSON.stringify(JSON.parse(document.getElementById('__NEXT_DATA__').textContent).props.pageProps.apolloState.data)" \
  > /tmp/job.json
```

Parse the `JobListing:<id>` node + linked `Startup:<id>` node from the graph and emit a single-job result.

### 9. Release the session

```bash
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

## Site-Specific Gotchas

- **READ-ONLY.** Never click `Apply`, `Apply now`, `Save`, `Message recruiter`, `Follow company`, `Share`, or `Easy Apply` (Wellfound's one-click apply that POSTs immediately on click). Do not submit any form. Do not interact with the chat widget.
- **DataDome is mandatory blocker.** `browse cloud fetch` (with or without `--proxies`) returns 403 + `x-datadome: protected` on EVERY job-related route. Verified during skill generation: `/`, `/discover/blog`, `/landing-page-assets/*` work; `/jobs`, `/role/*`, `/location/*`, `/company/*`, `/sitemap.xml`, even `/jobs/123` all 403. A full `browse cloud browse` session with `--verified --proxies` is the only path that gets through. A bare browserbase session (no Verified, or no proxies) also fails — both flags are required, not one or the other.
- **Login wall blocks the high-value surface.** Without authentication: filter combinations beyond bare role+location redirect to `/jobs/login`; salary and equity fields render as "Sign in to see"; descriptions are truncated to a snippet; pagination beyond page 1 of the `/jobs` app drops to the login wall. Cookie-sync from a logged-in account is required for the full filter+detail surface. Without it the skill must report `auth_state: "guest"` and leave salary/equity as `null`.
- **NO public API — confirmed by `apitracker.io/a/wellfound`.** Every developer-docs field (API Reference, SDKs, OAuth playground, GraphQL playground, OpenAPI spec, pagination style, rate limits, status page) is empty. The internal `/graphql` endpoint is callable only from within a page-warmed browser context (CSRF + cookies). Do not attempt cookieless GraphQL POSTs — they return 401/403.
- **Apollo state in `__NEXT_DATA__` is the optimal extraction surface.** Path: `props.pageProps.apolloState.data`. Don't bother writing DOM selectors against the rendered job cards — they're React-managed, class names are content-hashed (`_card_a1b2c3`), and they re-render. Pull the JSON.
- **Apollo nodes are reference-linked.** Fields like `highlightedJobListings`, `recruiter`, `markets`, `skills`, `locationNames` all serialize as `{type: "id", id: "<key>"}` pointers (or arrays of them). Always look up against the same `data` map. The unpack-references function in step 5 of Workflow is canonical.
- **`compensation` field is pre-formatted, not structured.** `JobListingSearchResult.compensation` is a string like `"$120k – $180k • 0.1% – 0.5%"` or `"₹50,000 – ₹1L"` (Indian companies use INR formatting with `L`/`Cr` suffixes). To get structured `salary_min` / `salary_max` / `equity_min` / `equity_max` / `currency`, regex it: `/(?<cur>[\$₹€£])(?<smin>[\d.,]+[kKmMLCr]?)\s*[–-]\s*(?<cur2>[\$₹€£]?)(?<smax>[\d.,]+[kKmMLCr]?)/`. Multiply by `k`/`L`/`Cr` suffix multipliers (k=1e3, L=1e5, Cr=1e7). On the job-detail page (`JobListing:<id>` node), the structured `compensationStructured` field is sometimes present — prefer that when available.
- **`locationNames` is double-wrapped.** It's `{type: "json", json: ["Bengaluru", "Remote"]}` — the actual array is at `.json`, not at the top level. Easy to miss.
- **`liveStartAt` is epoch seconds, not ms.** Multiply by 1000 if you need a JS `Date`.
- **`companySize` is an enum, not a range.** Values: `SIZE_1_10`, `SIZE_11_50`, `SIZE_51_200`, `SIZE_201_500`, `SIZE_501_1000`, `SIZE_1001_5000`, `SIZE_5000_PLUS`. Map to human-readable in your output.
- **`jobType` enum** uses snake_case in the graph (`full_time`, `part_time`, `contract`, `internship`, `cofounder`) but the UI shows kebab-case ("full-time"). Match accordingly.
- **`badges` is a wrapped enum.** Top-level entries are `{type: "id", id: "Badge:ACTIVELY_HIRING"}` — unpack against `Badge:ACTIVELY_HIRING` in the same graph to get `{id, name, label, tooltip, avatarUrl}`. The most useful badge ID is `ACTIVELY_HIRING` (company is processing applications today).
- **The ~50 role slugs are a curated taxonomy.** Examples observed in third-party scrapers: `python-developer`, `software-engineer`, `front-end-developer`, `back-end-developer`, `full-stack-developer`, `data-scientist`, `data-engineer`, `devops-engineer`, `product-designer`, `ui-ux-designer`, `product-manager`, `marketing-manager`, `growth-marketer`, `sales-development-representative`, `account-executive`, `customer-success-manager`, `recruiter`, `operations-manager`, etc. A misspelled or out-of-taxonomy role slug returns a 404 on `/role/<role>` — don't fabricate slugs; if the caller's role doesn't normalize cleanly, fall back to the `/jobs` filter UI's Keywords field (free-text).
- **`/role/l/<role>/<loc>` order matters.** Role first, then location, with the literal `l/` separator. `/role/<role>/l/<loc>` is a 404.
- **SEO landing pages don't expose the full filter surface.** `/role/…` and `/location/…` paginate by `?page=N` only — no salary/equity/stage/size/skills filters. For the full surface you MUST drive the `/jobs` filter UI, which requires login.
- **`?page=N` SEO pagination tops out around 30-50 pages depending on role popularity.** Beyond `pageCount` the page renders an empty grid (no error). Always check `seoLandingPageJobSearchResults.pageCount` and stop at that value.
- **`fill` on autocomplete filters triggers premature submission.** Wellfound's filter typeaheads use a custom React combobox that listens for Enter to commit. `browse cloud browse fill <ref> <value>` synthesizes Enter and submits before the autocomplete dropdown renders. Use the click-then-type-then-click pattern (snapshot → click input → type → wait 1000 → click option). Same gotcha as OpenTable's location picker.
- **Equity slider is approximate.** `browse cloud browse drag` to set the equity range — there's no number input. Snap target to the nearest tick label in the snapshot. If the caller's equity bounds don't align to a tick, document `equity_range_approximate: true` in the output.
- **"Easy Apply" buttons are mutation triggers.** If a job card has a green "Easy Apply" pill, do NOT click it — it submits a one-click application using the logged-in user's saved profile and is irreversible. Only the company-external "Apply" links (which open the ATS in a new tab via `target="_blank"`) are safe to record as `applyUrl`. Even those should only be RECORDED, never CLICKED.
- **`/sitemap.xml` is DataDome-blocked.** Wellfound's robots.txt references it but `browse cloud fetch` and even cookieless browser navigation get 403. Don't depend on it for company enumeration.
- **`robots.txt` Disallows are advisory, not technical blocks** — they don't block fetches, they just signal "don't crawl". The actual technical block is DataDome. The Disallows are useful as documentation of which URL patterns are dynamic (`/*?role=*`, `/*?jobId=*`, `/*?jobSlug=*` — confirming these query params exist but not their syntax).
- **Cloudflare + DataDome layered.** `Server: cloudflare` + `x-datadome: protected` headers on every blocked response. Cloudflare adds `Cf-Ray` IDs to the response — useful for support tickets if the residential proxy gets flagged.
- **Single-job URL canonical form is `/jobs/<id>-<slug>`** (id is numeric, slug is the title in kebab-case). Some company pages link to `/company/<slug>/jobs/<id>-<slug>` — that's equivalent. Robots.txt's `Disallow: /*?jobId=*` / `Disallow: /*?jobSlug=*` suggests there's also an internal `?jobId=` deep-link form that opens jobs in a modal — those are inFrame variants and the canonical id-slug path is preferred.
- **Wellfound was AngelList Talent until 2022.** Old references and SDKs (`@angelist/talent-*`, `angel.co/api/2`) are dead — `angel.co/api/2/jobs` 404s. Don't reach for them.
- **International salary formatting.** USD listings use `$` + `k`/`M`. Indian listings use `₹` + `L` (lakh = 100,000) / `Cr` (crore = 10,000,000). EU listings use `€`. GB uses `£`. Always emit a `currency` field alongside numeric `salary_min` / `salary_max`.
- **Skill-generation environment limitation.** This SKILL.md was generated in a sandbox where outbound CDP to `connect.usw2.browserbase.com` is DNS-blocked, so live browser iteration against Wellfound could not be performed end-to-end. The browser-side workflow above is reconstructed from: (a) Wellfound's robots.txt and homepage HTML (fetched directly), (b) Wellfound's own help-center articles on the filter UI, (c) the publicly-documented Apollo graph shape from Scrapfly's 2026-04-10 tutorial, (d) `apitracker.io`'s confirmation that no public API exists, and (e) DataDome-block probes against 9 wellfound.com URL surfaces. A first agent USING this skill in a CDP-reachable environment should treat all selector/ref details (button labels, popover anatomy) as a starting hypothesis to verify with `browse cloud browse snapshot` on the first iteration and refine in place.

## Expected Output

Top-level result shape — same envelope for all input modes:

```json
{
  "success": true,
  "query": {
    "raw_input": "frontend engineer in NYC",
    "resolved_url": "https://wellfound.com/role/l/front-end-developer/new-york",
    "input_mode": "free-form" | "jobs-url" | "company-jobs-url" | "single-job-url",
    "filters": { /* see filter sub-shape below */ }
  },
  "auth_state": "authed" | "guest",
  "pagination": {
    "page_count": 12,
    "page_size": 20,
    "pages_fetched": [1, 2, 3],
    "total_results_estimate": 234,
    "more_available": true
  },
  "jobs": [ /* JobResult[] — see below */ ],
  "fetched_at_iso": "2026-05-16T18:30:00Z"
}
```

`filters` sub-shape (any field may be omitted):

```json
{
  "roles": ["front-end-developer"],
  "role_keywords_free_text": null,
  "locations": ["new-york", "remote"],
  "remote_policy": "some" | "only" | "none",
  "hq_locations": ["united-states", "canada"],
  "distributed_only": false,
  "salary_min": 150000,
  "salary_max": 220000,
  "include_no_salary": false,
  "currency": "USD",
  "equity_min_pct": 0.1,
  "equity_max_pct": 1.0,
  "job_types": ["full_time"],
  "experience_levels": ["senior"],
  "company_stages": ["seed", "series_a"],
  "company_sizes": ["SIZE_11_50", "SIZE_51_200"],
  "markets": ["AI", "FinTech"],
  "skills": ["React", "TypeScript"],
  "visa_sponsor": true,
  "recently_active_days": 7,
  "sort": "newest",
  "limit": 50
}
```

`JobResult` shape (one per posting):

```json
{
  "id": "2275832",
  "url": "https://wellfound.com/jobs/2275832-senior-frontend-engineer",
  "title": "Senior Frontend Engineer",
  "slug": "senior-frontend-engineer",
  "primary_role_title": "Frontend Engineer",
  "job_type": "full_time",
  "experience_level": "senior",
  "remote": true,
  "remote_policy": "remote_ok",
  "locations": ["New York", "Remote"],
  "posted_at_iso": "2026-04-22T14:30:25Z",
  "posted_at_epoch_seconds": 1745331025,
  "compensation_raw": "$150k – $220k • 0.1% – 0.5%",
  "salary_min": 150000,
  "salary_max": 220000,
  "currency": "USD",
  "equity_min_pct": 0.1,
  "equity_max_pct": 0.5,
  "compensation_visible": true,
  "role_pitch": "Build the next generation of our React-based dashboard.",
  "description_full": "## About the role\n\nWe're looking for ...",
  "skills": ["React", "TypeScript", "Next.js", "GraphQL"],
  "apply_url": "https://wellfound.com/jobs/2275832-senior-frontend-engineer/apply",
  "apply_external_url": "https://boards.greenhouse.io/example/jobs/12345",
  "ats_source": "greenhouse",
  "recruiter": {
    "id": "9382011",
    "name": "Jane Doe",
    "title": "Head of Talent",
    "profile_url": "https://wellfound.com/u/jane-doe",
    "avatar_url": "https://photos.wellfound.com/users/i/9382011-..."
  },
  "company": {
    "id": "6427941",
    "slug": "examplecorp",
    "name": "ExampleCorp",
    "logo_url": "https://photos.wellfound.com/startups/i/6427941-...medium_jpg.jpg",
    "wellfound_url": "https://wellfound.com/company/examplecorp",
    "high_concept": "The Stripe for climate finance",
    "company_size_enum": "SIZE_11_50",
    "company_size_label": "11–50 employees",
    "stage": "series_a",
    "total_raised_amount_usd": 13225000,
    "actively_hiring_badge": true,
    "company_url": "https://example.com",
    "linkedin_url": "https://www.linkedin.com/company/examplecorp",
    "twitter_url": "https://twitter.com/examplecorp",
    "markets": ["FinTech", "Climate"]
  }
}
```

Fields that are not visible to a guest session must be emitted as `null`, NOT omitted, so downstream callers can distinguish "not surfaced" from "didn't extract":

```json
{
  "salary_min": null, "salary_max": null,
  "equity_min_pct": null, "equity_max_pct": null,
  "compensation_visible": false,
  "description_full": null,
  "apply_external_url": null,
  "recruiter": null
}
```

Failure / degraded outcome shapes:

```json
// Anti-bot wall — DataDome blocked the session despite Verified+proxies
{ "success": false, "reason": "datadome_blocked", "url": "...", "http_status": 403, "datadome_cid": "..." }

// Login wall — request needed authed context but skill was running guest
{ "success": false, "reason": "login_required", "url": "https://wellfound.com/jobs/login?redirect=..." }

// Role / location slug doesn't exist in Wellfound's taxonomy
{ "success": false, "reason": "role_slug_not_found", "tried_slug": "rust-developer", "suggestion": "Use the /jobs filter UI's Keywords field for free-text role titles." }

// Single-job URL points to an expired posting
{ "success": false, "reason": "job_expired_or_removed", "url": "https://wellfound.com/jobs/2275832-..." }

// Company-jobs URL points to a company with no public profile
{ "success": false, "reason": "company_not_found", "slug": "nonexistent-company" }
```
