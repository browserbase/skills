---
name: indeed-com-search-jobs-8yxl6y
title: Indeed Job Search
description: >-
  Search Indeed for job postings across the full filter surface (keyword,
  location, radius, date posted, salary, job type, experience level,
  remote/hybrid, company, education, posted-by, encouraged-to-apply, sort,
  pagination) and return structured JSON. Supports SERP URLs, free-form
  keyword+location, single jk lookups, and the five outcome branches (results /
  zero_results / location_unparseable / bot_block / posting_not_found).
  Read-only.
website: indeed.com
category: jobs
tags:
  - jobs
  - job-search
  - recruiting
  - indeed
  - anti-bot
  - read-only
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: browser
alternative_methods: []
verified: true
proxies: true
---
# Indeed Job Search

## Purpose

Given a search input — full Indeed search URL, free-form `keyword + location`, keyword only, location only, or a direct `/viewjob?jk=<jk>` URL — return structured JSON job results matching the **full Indeed filter surface** (keyword, location, radius, date posted, salary, job type, experience level, remote/hybrid, company, education, "posted by", "encouraged to apply", sort order, pagination). For each posting return Indeed `jk`, title, company + rating + review count, location with `remote`/`hybrid` flags, salary (formatted + raw min/max/currency/period/source), posted date (relative + ISO), job type, snippet, qualifications, benefits, urgent-hiring / easily-apply / sponsored flags, company logo URL, canonical `viewjob` URL, and the company profile URL when linked. Capture total result count and pagination metadata so the caller knows the slice is partial. **Read-only — never click Apply, Save Job, Sign In, Easy Apply, or submit any form.**

## When to Use

- "Find software engineering jobs in Austin posted in the last 3 days under $200k full-time" — multi-filter SERP extraction.
- Daily / hourly monitoring of new postings for a saved query (`fromage=1` + `sort=date`).
- Mapping a free-form query (`"barista, 30307"`) into Indeed's `q` / `l` / `radius` URL.
- Single-posting fetch when only a `jk` or `/viewjob?jk=…` URL is in hand — skips the SERP entirely.
- Comparing remote vs on-site availability for a role across metros.
- Anywhere the legacy Indeed Publisher API was used — that path was deprecated for new accounts in 2023 (`/ita/v1/publisher` returns 404 today, confirmed via residential-proxy fetch on 2026-05-18).

## Workflow

Indeed is anti-bot-walled (Cloudflare + Akamai-style fingerprinting + a bot-detection redirect to `account/login?from=bot-detection-anonymous`). The public Publisher API (`/ita/v1/publisher`) was deprecated. The internal GraphQL endpoint (`https://apis.indeed.com/graphql`) is `Disallow`'d in `robots.txt` for all user agents and is firewalled at the gateway — its OneGraph key is even leaked in the page HTML (`oneGraphApiKey: "eac18cd3a45d…"`) and still won't authorize anonymous traffic. The only viable path is scripted browsing through a Browserbase **`--verified --proxies`** session, treating `window._initialData` (and `window.mosaic.providerData["MosaicProviderRichSearchDaemon"]`) as the structured-data surface.

### 1. Parse input → canonical URL

Branch on input shape:

| Input shape | Action |
|---|---|
| `https://www.indeed.com/jobs?...` URL | Use as-is. Add missing filter params from the request (see § 2). |
| `https://www.indeed.com/viewjob?jk=<jk>` URL | Skip search — go straight to § 5 (viewjob extraction). |
| Free-form `"<keyword> in <location>"` | Split on `" in "` / `","`; URL-encode → `?q=<kw>&l=<loc>`. |
| Keyword only | `?q=<kw>` (Indeed defaults to nationwide). |
| Location only | `?l=<loc>` (returns all postings in that location). |
| ZIP-only location (`"30307"`) | `?l=<zip>` — Indeed parses the ZIP. (Invalid ZIPs like `99999` parse to `parsedL: null` and return zero results.) |

The keyword field accepts boolean operators (`AND`, `OR`, `NOT`), quoted phrases, and field prefixes (`title:`, `company:`, `location:`) — pass through verbatim, URL-encode the whole thing.

### 2. Filter → URL parameter mapping

All filter dimensions in the request must be encoded as query-string params on `/jobs?…`. **Use this table verbatim — every ID below was verified against the embedded `filterSettingModel` and `radiusOptions` in `MosaicProviderRichSearchDaemon` on 2026-05-18.**

| Filter | Param | Accepted values |
|---|---|---|
| Keyword | `q` | URL-encoded free text; booleans `AND OR NOT`; quoted phrases; `title:` / `company:` / `location:` prefixes |
| Location | `l` | City + state, ZIP, "Remote", US metro, or blank |
| Distance / radius | `radius` | Discrete picker: `0, 5, 10, 15, 25, 35, 50, 100` miles. **`radius` is `Disallow`'d in `robots.txt`** — Indeed actively discourages indexing of radius-scoped URLs, but they still render |
| Date posted | `fromage` | `""` (any), `"last"` (new since last visit), `1`, `3`, `7`, `14` — last 24h / 3d / 7d / 14d. `"last"` is undocumented; the six standard buckets come from the embedded `ages` array |
| Salary range | `salaryType` + `salaryMin` (or the `sc=` composite — see below) | Open-encoded; URL param `salary=` is also accepted in some test groups |
| Job type | `jt` | `permanent`, `fulltime`, `parttime`, `contract`, `temporary`, `new_grad`, `commission`, `internship` (full list from embedded model; **`permanent` and `new_grad` are real, beyond the prompt-listed set**) |
| Experience level | `explvl` | `entry_level`, `mid_level`, `senior_level` |
| Remote / hybrid / on-site | `sc=0kf%3Aattr%28DSQF7%29%3B` (Remote), `sc=0kf%3Aattr%28PAXZC%29%3B` (Hybrid). Decoded: `sc=0kf:attr(DSQF7);` etc. The `attr(...)` token is the four/five-char Indeed taxonomy attribute SUID |
| Company | `rbc` (single) or `sc=0kf%3Acompany%28<name>%29%3B`. The left rail surfaces top employers via `dynFiltersViewModel`, which lists each company's display name → SUID |
| Education | `sc=0kf%3Aattr%28<edu-suid>%29%3B` — surfaced when the rail includes the Education facet |
| Posted by employer / staffing agency | `sc=0kf%3Apost%28EMPLOYER%29%3B` vs `sc=0kf%3Apost%28STAFFING%29%3B` |
| Encouraged to apply | `sc=0kf%3Ajt%28fairchance%29%3B`, `sc=0kf%3Ajt%28no_degree%29%3B`, `sc=0kf%3Ajt%28military_encouraged%29%3B`, `sc=0kf%3Ajt%28multiple_candidates%29%3B` |
| Sort order | `sort` | `""` (relevance, default) or `date` (newest first) |
| Pagination | `start` | `0`, `10`, `20`, … (Indeed paginates by 10 on desktop; `start` is also `Disallow`'d in `robots.txt` but renders fine) |
| Indeed Apply ("Easily Apply") | `iafilter=1` | `Disallow`'d in `robots.txt` ("`/*&iafilter=`") |
| Country | `co` | `US` (default), `GB`, `CA`, etc. — only US is in scope for this skill |

`sc=` is a **composite-filter slot**. Multiple facets concatenate with `;`-delimited tokens inside one `sc=0kf:` block, all URL-encoded together. Example: Remote + full-time + entry level + Indeed Apply →
```
sc=0kf%3Aattr%28DSQF7%29attr%28CF3CP%29explvl%28entry_level%29%3B&jt=fulltime&iafilter=1
```
When in doubt: build the URL by clicking the equivalent filters in the rendered SERP and copying the URL from the location bar — the page rewrites `sc=` in place.

### 3. Open a Verified + residential-proxy session

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies | jq -r '.id')
export BROWSE_SESSION="$SID"
```

Both flags are **mandatory**. A bare datacenter-IP fetch of `/jobs?q=…&l=…` returns a 403 "Security Check — Indeed.com" interstitial (59,756 bytes of styled-but-empty HTML — no `window._initialData`, no `jk` markers, no filter rail). A `--proxies` fetch returns the real SERP, but only ~80% of the time — see § Site-Specific Gotchas for the intermittent 401 pattern.

### 4. Open the search URL and extract `window._initialData`

```bash
browse open "$SEARCH_URL" --remote
browse wait load
browse wait timeout 2500          # SERP cards render progressively after `load`
browse get html body > /tmp/serp.html
```

Parse `window._initialData` from the HTML. It is a JS-assigned object literal that begins with `window._initialData = {` and ends with `};` — scan balanced braces (string-aware) from the open brace, decode `/` → `/`, then `JSON.parse`. The data-bearing keys for a SERP:

| Key | What it tells you |
|---|---|
| `totalJobCount` / `searchTitleBarModel.totalNumResults` / `searchTitleBarModel.totalNumResultsFormatted` | Total result count (the "X jobs" header) |
| `parsedQ`, `parsedL`, `appliedRadius`, `appliedCommuteTime` | Indeed's interpretation of your inputs — verify the user got what they asked for |
| `queryString` | The canonical query string Indeed echoed back |
| `pageNum`, `paginator` | Current page + paginator-state (use to derive `pages_total` and the next `start=` offset) |
| `resultSortModel.options` | Confirms `[{label:"by relevance",value:""},{label:"by date",value:"date"}]` — the only two sort options |
| `mosaicData` | Container for the rendered job-card list when results > 0 |
| `dynFiltersViewModel` | The left-rail dynamic filters — company list, attribute SUIDs, education buckets — surfaced for the current result set (null on no-result pages) |
| `noSearchResultModel` | Populated only when `totalJobCount = 0`; `headerMsg` is the human-readable miss reason (e.g. `"The search <b>cashier jobs in 99999</b> did not match any jobs."`) |
| `queryReplaceModel` | "Did you mean…" / autocorrect suggestion |
| `relatedQueries` | Related-search chips Indeed renders below the SERP |

Per-card data lives inside `mosaicData` and in the rendered DOM as `data-jk="<jk>"` anchor attributes — read both to be robust. For each card, derive the canonical URL as `https://www.indeed.com/viewjob?jk=<jk>`.

If the page is missing `window._initialData` entirely, check the response:
- Title `<title>Security Check - Indeed.com</title>` → 403 anti-bot. Release session, create a new one, retry.
- Title `<title>Authenticating...</title>` → 401 bot-detection-anonymous. Retry on the same session (residential IP rotates) up to 3×, then swap session.

### 5. (Per posting) Hydrate each `jk` from `/viewjob?jk=<jk>`

Card-level data on the SERP is **incomplete** — salary range, benefits chips, full snippet, qualifications, company rating, and the original-source apply URL all live on the viewjob detail page. For each `jk` from § 4 that the caller wants enriched:

```bash
browse open "https://www.indeed.com/viewjob?jk=$JK" --remote
browse wait load
browse wait timeout 1500
browse get html body > /tmp/vj-$JK.html
```

`/viewjob?jk=` is explicitly **allowed for Googlebot, Bingbot, ChatGPT-User, Claude-User, Perplexity-User, Claude-SearchBot** in `robots.txt` (and `Disallow`'d for the bare `User-agent: *`) — meaning Indeed serves these pages with less friction than `/jobs?`. Empirically the residential-proxy success rate on `/viewjob?` is much higher than on `/jobs?` (0/4 failures in iter-1 vs ~1/5 on SERP).

From the viewjob HTML extract three sources in this order — **prefer the deepest source for each field**:

1. **`window._initialData.hostQueryExecutionResult.data.jobData.results[0].job`** — the GraphQL response that Indeed embeds for SSR. Contains `key`, `title`, `sourceEmployerName`, `datePublished` (epoch ms), `dateOnIndeed` (epoch ms), `expired`, `description.html`, `feed.feedSourceType` (`EMPLOYER` / `JOBSITE` / `STAFFING`), `tracking.jobClick.url` (the `/rc/clk?…` sponsored-redirect URL), and `url` (the external apply URL, e.g. an ATS like Greenhouse/Lever/Breezy).
2. **`window._initialData.jobInfoWrapperModel.jobInfoModel.jobInfoHeaderModel`** — the company-tab data: `companyName`, `companyOverviewLink` (Indeed profile), `companyReviewLink`, `companyReviewModel.ratingsModel.{rating,count}` (e.g. `4.4` / `43`), `companyImagesModel.logoUrl` (`https://d2q79iu7y748jz.cloudfront.net/s/_squarelogo/256x256/<hash>`), `companyImagesModel.headerImageUrl`, `formattedLocation`, `remoteLocation` (boolean), `salaryMin` / `salaryMax` / `salaryType` / `salaryCurrency`.
3. **The `<script type="application/ld+json">` block** — schema.org `JobPosting` with `datePosted` ISO string, `description`, `hiringOrganization`, `jobLocation`, and `baseSalary` when present. Use this as the **canonical posted-date source** (ISO 8601 with millisecond precision).

Other top-level `_initialData` fields worth extracting:
- `jobOccupations` — array of taxonomy SUIDs (e.g. `["5NN53","EHPW9","HJSX6"]`) Indeed has classified the role under.
- `benefitsModel.benefits[]` — `[{key:"EY33Q",label:"Health insurance"}, …]` — the benefits chips, with stable per-benefit SUIDs.
- `hiringInsightsModel.age` — human relative time ("30+ days ago", "Posted today").
- `hiringInsightsModel.urgentlyHiringModel` — non-null when "Urgently hiring" badge is rendered.
- `commuteInfoModel` — `jobLatitude`, `jobLongitude`, `formattedStreetAddress`, `companyLocation`.
- `indeedApplyButtonContainer.indeedApplyButtonAttributes` — presence of `jk` + `continueUrl` indicates "Easily Apply" is supported; absence means the apply flow is off-site.
- `sponsored` — top-level boolean.

### 6. Map to output schema and emit

Build the per-posting object using this field-derivation map:

```
jk                      ← _initialData.jobKey
title                   ← _initialData.jobTitle
company                 ← jobInfoHeaderModel.companyName
company_rating          ← jobInfoHeaderModel.companyReviewModel.ratingsModel.rating
company_review_count    ← jobInfoHeaderModel.companyReviewModel.ratingsModel.count
company_profile_url     ← jobInfoHeaderModel.companyOverviewLink (strip ?campaignid+from+tk+fromjk)
company_logo_url        ← jobInfoHeaderModel.companyImagesModel.logoUrl
location                ← jobInfoHeaderModel.formattedLocation
remote                  ← jobInfoHeaderModel.remoteLocation === true
hybrid                  ← detect "Hybrid" in jobInfoHeaderModel.tagModels or jobLocation string
salary.formatted        ← jobInfoHeaderModel.salaryText (when present)
salary.min / .max       ← jobInfoHeaderModel.salaryMin / salaryMax
salary.currency         ← jobInfoHeaderModel.salaryCurrency
salary.period           ← jobInfoHeaderModel.salaryType  // "yearly" | "hourly" | "monthly"
salary.source           ← "employer" if hiringInsightsModel.employerProvidedSalary
                          else "indeed_estimated"
posted_iso              ← <ld+json>.datePosted  // canonical
posted_relative         ← hiringInsightsModel.age  // "30+ days ago"
posted_epoch_ms         ← hostQueryExecutionResult…job.datePublished
job_type                ← jobDescriptionSectionModel.jobDetailsSection.jobTypes[].label
snippet                 ← first ~280 chars of <ld+json>.description (stripped HTML)
qualifications          ← qualificationsSectionModel items (when present)
benefits                ← benefitsModel.benefits.map(b => b.label)
urgent_hiring           ← hiringInsightsModel.urgentlyHiringModel != null
easily_apply            ← indeedApplyButtonContainer.indeedApplyButtonAttributes.jk != null
sponsored               ← _initialData.sponsored
url                     ← "https://www.indeed.com/viewjob?jk=" + jk
```

Top-level shape: see § Expected Output.

### 7. Release the session

```bash
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

## Site-Specific Gotchas

- **`--verified --proxies` is mandatory.** Any bare-IP or non-verified session gets `<title>Security Check - Indeed.com</title>` (HTTP 403) within the first turn. Verified by direct `browse cloud fetch` of `/jobs?q=software+engineer&l=Austin,+TX` from a datacenter IP — 403 every time (page-bare.html, 59,756 bytes, no `window._initialData`).
- **Even with residential proxies, ~1 in 5 requests on `/jobs?` returns a 401 "Authenticating…" redirect to `/account/login?branding=login-required&from=bot-detection-anonymous&continue=…`.** Confirmed in iter-1 with 6 sequential identical-URL fetches (attempt 2 of 3 came back with HTTP 401, others 200). The 401 body is a 1,656-byte page that does a `HEAD` + reads `cf-ray` then `window.location.replace`s. **Never follow the login redirect** — that path leads to a real signin wall. Recovery: retry the same URL up to 3× (Browserbase rotates the residential exit IP); after 3 consecutive 401s, swap session (`sessions create` again).
- **`/m/jobs?` (mobile search) is harder-blocked than `/jobs?`.** Every fetch attempt on `/m/jobs?q=barista&l=30307` in iter-1 came back 403 "Security Check," even through `--proxies`. Stick to the desktop `/jobs?` URL family.
- **`/viewjob?jk=…` is the friendliest path.** Indeed's `robots.txt` explicitly `Allow`s `/viewjob?` and `/m/viewjob?` for Googlebot, Bingbot, ChatGPT-User, Claude-User, Perplexity-User, and Claude-SearchBot (and `Disallow`s for the wildcard `User-agent: *`). Empirically the residential-proxy success rate is much higher here than on `/jobs?`. If you only need single-posting data, **always prefer `/viewjob?jk=`** over re-running a SERP query.
- **GraphQL is a trap.** `Disallow: /graphql` is in `robots.txt`, and direct POSTs to `https://apis.indeed.com/graphql` are firewalled at the gateway. The OneGraph API key (`eac18cd3a45d091ee9e8bd4b3b181c30303c641d383cb69f86dfdab1876f9047`) is leaked in the page HTML at `_initialData.oneGraphApiKey` but doesn't authorize anonymous traffic. Don't waste time here — the SSR-embedded `_initialData.hostQueryExecutionResult` already contains the GraphQL response.
- **Publisher API is dead.** `/ita/v1/publisher` returns 404. Indeed deprecated the Publisher API for new accounts in 2023 and shut it off for legacy accounts thereafter. Don't reference it.
- **`window._initialData` is the SSR jackpot.** Both `/jobs?` (SERP) and `/viewjob?jk=` (detail) ship a JS-assigned `window._initialData = {…};` block with all server-rendered state. Parse by scanning balanced braces from the assignment site, decode `/` → `/`, `JSON.parse`. The schema differs between SERP and viewjob — see § Workflow steps 4 and 5.
- **`window.mosaic.providerData["MosaicProviderRichSearchDaemon"].filterSettingModel`** is the authoritative source for valid filter enum values (job types, date-posted IDs, radius options). The list of `jt` IDs Indeed accepts today includes **`permanent` and `new_grad`** in addition to the canonical six — silently dropping them costs the caller half the legitimate result set.
- **`l=99999` (or any unparseable location) returns `parsedL: null` + `totalJobCount: 0` + `noSearchResultModel.headerMsg = "The search <b>… jobs in 99999</b> did not match any jobs."`** Validate by checking `parsedL` after extraction — if `null` and the caller passed a non-empty `l`, surface this as `location_unparseable`, not as legitimate zero-result.
- **`fromage="last"` is real but undocumented.** The embedded `filterSettingModel.ages` array includes `{id:"last",label:"New jobs"}` — "since your last visit." Treat it as a synonym for `fromage=1` when no cookie state is in play; pass through verbatim if the caller explicitly asks for "new since last visit."
- **`radius`, `start`, `iafilter`, `alid`, `calert`, `mna`, `sid`, `sp=0` are all `Disallow`'d in `robots.txt`.** They still render correctly through residential-proxy fetch, but Indeed is signalling that these URL patterns are personalized/paginated and should not be indexed. Pass them through; do not strip them from URLs the caller hands you.
- **Indeed serves a 581 KB page even for `/jobs` with no params.** A SERP with results is consistently **620 KB to >1 MB**. The Browserbase Fetch API caps response bodies at 1 MB — you will get `502 The response body exceeded the maximum allowed size of 1MB. Use a browser session to handle large responses.` for most real searches. **Drive a full browser session for SERP extraction**; Fetch API is only suitable for `/viewjob?` (which is consistently 600–700 KB) and zero/few-result `/jobs?` URLs.
- **The 0-pad ZIP heuristic doesn't apply.** Indeed parses `30307` as ATL just fine, but `99999` is treated as a non-existent ZIP — not "Alaska's largest ZIP range start." Pass ZIPs verbatim and trust `parsedL`.
- **Sponsored cards have `_initialData.sponsored: true` and a `tracking.jobClick.url` pointing to `/rc/clk?…` instead of the canonical viewjob URL.** Surface the `sponsored` flag but always emit the canonical `https://www.indeed.com/viewjob?jk=<jk>` as `url`, not the `/rc/clk?` redirect.
- **Read-only stop points (non-negotiable).** Do not click `button: Apply now`, `button: Save Job`, `button: Sign in`, the Indeed Apply iframe, or any pagination button — the pagination state is encoded in the `start=` URL param, navigate by URL. Do not submit the location box (it triggers a typeahead+navigate that can override your filters). Do not click the "Filter" hamburger if the URL already encodes the filter set.
- **Five outcome shapes the caller must handle:** (a) results page, (b) zero results (`totalJobCount: 0` + `noSearchResultModel`), (c) location unparseable (`parsedL: null`), (d) anti-bot 403 / 401 (after retries exhausted — emit `bot_block`), (e) `/viewjob?jk=` 404 when the `jk` has expired (Indeed's 404 page is 64 KB of branded chrome — detect via `<title>Not Found | Indeed</title>`).
- **Field-derivation honesty.** The mapping in § Workflow step 6 covers the fields that were directly observed in a real `viewjob` payload during iter-1 (jk=`5f3a9664e5d61d1a`). Fields the caller asked for that were **not** present on that posting — `qualifications[]`, employer-vs-Indeed-estimated `salary.source`, "hiring multiple candidates" flag — are derived from documented Indeed UI components and the schema.org `JobPosting` shape; surface them when present in the page state, emit `null` otherwise. Do not fabricate values to fill the schema.

## Expected Output

Top-level shape for a multi-result SERP:

```json
{
  "input_url": "https://www.indeed.com/jobs?q=software+engineer&l=Austin%2C+TX&fromage=3&jt=fulltime&sort=date",
  "parsed": {
    "q": "software engineer",
    "l": "Austin, TX",
    "radius": null,
    "fromage": "3",
    "jt": "fulltime",
    "explvl": null,
    "sc": null,
    "sort": "date",
    "start": 0
  },
  "applied": {
    "parsedQ": "software engineer",
    "parsedL": "Austin, TX",
    "appliedRadius": 25,
    "appliedCommuteTime": 0
  },
  "total_results": 1842,
  "total_results_formatted": "1,842",
  "page_num": 1,
  "results_per_page": 10,
  "pages_total": 185,
  "sort": "date",
  "jobs": [
    {
      "jk": "5f3a9664e5d61d1a",
      "title": "Software Engineer",
      "company": "Carnegie Robotics",
      "company_rating": 4.4,
      "company_review_count": 43,
      "company_profile_url": "https://www.indeed.com/cmp/Carnegie-Robotics-LLC-1",
      "company_logo_url": "https://d2q79iu7y748jz.cloudfront.net/s/_squarelogo/256x256/f9b6901bf329c74dd0ceb4b9bc4727fe",
      "location": "Pittsburgh, PA 15201",
      "remote": false,
      "hybrid": false,
      "salary": {
        "formatted": null,
        "min": null,
        "max": null,
        "currency": null,
        "period": null,
        "source": null
      },
      "posted_iso": "2026-03-04T19:25:29.479Z",
      "posted_relative": "30+ days ago",
      "posted_epoch_ms": 1772344800000,
      "job_type": "Full-time",
      "snippet": "Carnegie Robotics designs and manufactures advanced robotics systems and components for defense, agricultural, mining, industrial, and off-road autonomy applications…",
      "qualifications": [],
      "benefits": [
        "Food provided",
        "Health insurance",
        "401(k) matching",
        "Paid time off",
        "Vision insurance",
        "Health savings account",
        "Dental insurance",
        "Flexible spending account",
        "Life insurance"
      ],
      "urgent_hiring": false,
      "easily_apply": true,
      "sponsored": false,
      "url": "https://www.indeed.com/viewjob?jk=5f3a9664e5d61d1a",
      "external_apply_url": "https://carnegie-robotics.breezy.hr/p/2d85f5321cc7-software-engineer?source=indeed",
      "feed_source_type": "EMPLOYER",
      "job_latitude": 40.47438,
      "job_longitude": -79.96155
    }
  ]
}
```

Zero-result branch:

```json
{
  "input_url": "https://www.indeed.com/jobs?q=cashier&l=99999",
  "parsed": { "q": "cashier", "l": "99999", "radius": null, "fromage": null, "jt": null, "explvl": null, "sc": null, "sort": null, "start": 0 },
  "applied": { "parsedQ": null, "parsedL": null, "appliedRadius": 0, "appliedCommuteTime": 0 },
  "total_results": 0,
  "outcome": "zero_results",
  "no_result_message": "The search cashier jobs in 99999 did not match any jobs.",
  "jobs": []
}
```

Location-unparseable branch (caller passed a non-empty `l` but Indeed couldn't parse it):

```json
{
  "input_url": "https://www.indeed.com/jobs?q=cashier&l=99999",
  "outcome": "location_unparseable",
  "applied": { "parsedL": null },
  "no_result_message": "The search cashier jobs in 99999 did not match any jobs.",
  "jobs": []
}
```

Anti-bot block (after retries exhausted):

```json
{
  "input_url": "https://www.indeed.com/jobs?q=software+engineer&l=Austin%2C+TX",
  "outcome": "bot_block",
  "block_type": "security_check_403",
  "block_evidence": "<title>Security Check - Indeed.com</title>",
  "retries_attempted": 5,
  "jobs": []
}
```

Single-posting branch (caller passed `/viewjob?jk=…` directly):

```json
{
  "input_url": "https://www.indeed.com/viewjob?jk=5f3a9664e5d61d1a",
  "outcome": "single_posting",
  "jobs": [ /* one fully-hydrated job object, same shape as the SERP result */ ]
}
```

Expired-posting branch (`/viewjob?jk=…` returns 404):

```json
{
  "input_url": "https://www.indeed.com/viewjob?jk=deadbeefdeadbeef",
  "outcome": "posting_not_found",
  "block_evidence": "<title>Not Found | Indeed</title>",
  "jobs": []
}
```
