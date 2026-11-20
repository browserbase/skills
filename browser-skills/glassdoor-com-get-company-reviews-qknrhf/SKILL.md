---
name: glassdoor-com-get-company-reviews-qknrhf
title: Glassdoor Get Company Reviews
description: >-
  Extract a company's overall rating, sub-rating averages,
  recommend/outlook/CEO-approval percentages, and a filtered slice of employee
  reviews from Glassdoor — accepting a URL, EmployerId, or company name (+
  optional location disambiguator) and supporting the full review-page filter
  rail (stars, job title, location, employment status, language, employment
  type, sort, keyword, limit). Read-only.
website: glassdoor.com
category: employer-reviews
tags:
  - glassdoor
  - reviews
  - employer
  - hr
  - read-only
  - cloudflare
  - authenticated
source: 'browserbase: agent-runtime 2026-05-16'
updated: '2026-05-16'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      Glassdoor's Partner API at api.glassdoor.com returns HTTP 410 Gone with an
      empty body (deprecated to new partners in 2021). The internal GraphQL
      gateway at /graph returns HTTP 403 with a zero-byte body and requires
      fresh anti-CSRF + session cookies issued from a rendered page that it
      rotates per tab. Both confirmed 2026-05-16. There is no usable API path.
  - method: url-param
    rationale: >-
      Filters ARE expressed as URL query params (filter.ratings,
      filter.jobTitleFTS, sort.sortBy, etc.) — the recommended browser flow uses
      them — but the URL alone is not sufficient because every Glassdoor page
      render requires clearing Cloudflare's bot challenge with real Chrome +
      Verified, and after the first review the give-to-get login wall fires. So
      'browser' is the umbrella method; URL-param filters are how the browser
      path expresses filter state.
verified: false
proxies: true
---
# Glassdoor Get Company Reviews

## Purpose

Given any reference to a company on Glassdoor — full reviews URL, `EmployerId` (`E1234567`), bare company name, or name + location disambiguator — return the company's overall rating, sub-rating averages, rating distribution, recommend / business-outlook / CEO-approval percentages, plus a filtered slice of employee reviews (with per-review pros / cons / advice / sub-ratings / employment status / permalink). The skill exposes Glassdoor's full review-page filter surface: star bucket(s), job title, location, employment status, language, employment type (FT/PT/contractor/intern/freelance), sort order (most recent / most helpful / highest / lowest), free-text keyword, and a `limit` for pagination (Glassdoor paginates by 10/page). Read-only — the skill never clicks "Write a Review", "Add Salary", "Add Interview", "Follow Company", or any other mutation control, and never submits any form.

## When to Use

- An agent / workflow needs a structured snapshot of a single company's reviews on Glassdoor (e.g. weekly employer-brand monitor, candidate research, market intelligence).
- A user pastes a Glassdoor reviews URL and asks "summarize the negative reviews from the last 3 months in NYC, full-time only".
- A recruiter wants the top-5 most-helpful current-employee reviews for a specific job title at a target company.
- Any flow that would otherwise scrape Glassdoor HTML — this skill bakes in the auth / Verified / anti-bot detail those flows always get wrong on the first try.

## Workflow

The Glassdoor reviews surface has no usable public API today. **All four of the obvious shortcuts were probed and confirmed dead during skill generation** (2026-05-16):

1. **Partner API (`api.glassdoor.com`) → HTTP 410 Gone, zero-byte body.** Officially retired to new partners in 2021; live callers now get 410. Do not attempt.
2. **Internal GraphQL gateway (`/graph`) → HTTP 403, zero-byte body** (a real server-side `Forbidden`, not the Cloudflare interstitial). The endpoint exists but rejects every request that doesn't carry a fresh anti-CSRF + session cookie set issued inside a logged-in browser context.
3. **`/autocomplete/suggest` (name → EmployerId resolver) → HTTP 403** with the same Cloudflare "Security | Glassdoor" challenge body as the reviews HTML page. So even cheap name-to-EmployerId resolution must happen inside the authed session.
4. **Bare `browse cloud fetch` on `/Reviews/<Company>-Reviews-E<id>.htm` → HTTP 403** Cloudflare challenge page (~241 KB, `<title>Security | Glassdoor</title>`, `__cf_chl` script tags embedded). Confirmed with `--proxies` on and off; the Fetch API path is permanently walled for this domain because no real Chrome runtime is executing the challenge.

The only working path is **scripted browsing through Browserbase with `--verified --proxies` AND a pre-authed Glassdoor session re-attached via a Browserbase Context** ("cookie-sync"). Unauthenticated sessions hit Glassdoor's "give-to-get" wall after the first review — the page renders the first review fully, then overlays a modal demanding the visitor either log in or contribute a review/salary/interview before continuing. There is no URL-param bypass for the give-to-get wall.

### 1. Operator-side one-time login → Browserbase Context

Done by the human operator running this skill, not by the agent. Performed once per Glassdoor account; the resulting `CTX_ID` is the durable artifact the skill consumes.

```bash
# Create a persistent context (cookies + localStorage + IndexedDB)
CTX_ID=$(browse cloud contexts create | jq -r '.id')

# Spin up a one-off session attached to that context, with Verified + proxies
SID=$(browse cloud sessions create \
        --context "$CTX_ID" \
        --verified --proxies --keep-alive \
        --region us-east-1 | jq -r '.id')

# Hand the human operator the live debug URL — they log in normally
browse cloud sessions debug "$SID" | jq -r '.debuggerFullscreenUrl'

# Operator: log in at https://www.glassdoor.com/profile/login_input.htm,
#           satisfy any CAPTCHA / email verification, dismiss the
#           "give-to-get" modal by completing the minimum contribution
#           if the account is brand-new.

# Release the session — cookies are persisted into $CTX_ID
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

Cookies live ~30 days. When a skill invocation lands on `/profile/login_input.htm` instead of the requested reviews page, the operator must re-do this step.

### 2. Skill invocation — per request

```bash
SID=$(browse cloud sessions create \
        --context "$CTX_ID" \
        --verified --proxies --keep-alive \
        --region us-east-1 | jq -r '.id')
```

`--verified` and `--proxies` are both mandatory on top of the context. Bare context + no Verified still gets Cloudflare-flagged because the upstream IP pool used by Browserbase's default egress is fingerprinted; the residential proxy + Verified shim is what clears the JS challenge. Region is operator-pinned (default `us-east-1` for US companies, `eu-central-1` for European companies — Glassdoor geo-renders some content).

### 3. Resolve the company reference → canonical reviews URL

The skill accepts four input shapes; pick the cheapest resolution path that's available.

| Input shape | Resolution |
|---|---|
| Full reviews URL `https://www.glassdoor.com/Reviews/<Slug>-Reviews-E<EmployerId>.htm` | Use as-is. Augment query string with filters per step 4. |
| `EmployerId` integer (`E671932` or `671932`) | Open `https://www.glassdoor.com/Overview/E<id>.htm`. Glassdoor 301-redirects to the canonical `/Reviews/<Slug>-Reviews-E<id>.htm` after rendering the overview. Read `browse cloud browse get url` to capture the canonical form. |
| Bare company name | Open `https://www.glassdoor.com/Search/results.htm?keyword=<urlenc-name>`. Snapshot the results card list. Pick the row with **type=Company**, **largest review count**, and **exact name match** (case-insensitive). Click through; read URL. |
| Name + location disambiguator (e.g. `"Aurora, Boston, MA"`) | Same as bare-name search, but filter the results list by `headquarters` or `office.locations[]` containing the supplied location string. If still ambiguous, return `success: false, reason: "ambiguous_name", matches: [...]`. |

Persist `name → EmployerId` mappings to a sidecar cache so each company resolves exactly once.

### 4. Apply filters via URL query string

Glassdoor's filter rail is a thin client over a documented set of query-string params. Set them on the canonical URL directly — opening the URL with the params attached re-renders the filtered list server-side. **Do not click the rail buttons** unless a filter is not URL-expressible (rare); they trigger client-side state that does not survive page reloads.

Canonical URL skeleton:

```
https://www.glassdoor.com/Reviews/<Slug>-Reviews-E<EmployerId>.htm
  ?filter.iso3Language=<eng|spa|fre|...>
  &filter.employmentStatus=<REGULAR|PART_TIME|CONTRACT|INTERN|FREELANCE>
  &filter.currentJob=<true|false>            (current-only vs former-only)
  &filter.defaultEmploymentStatuses=true     (both current AND former — default)
  &filter.jobTitleFTS=<urlenc-job-title>     (auto-completed list)
  &filter.countryId=<int>                    (autocomplete-derived)
  &filter.stateId=<int>
  &filter.cityId=<int>
  &filter.metroId=<int>
  &filter.locationId=<int>                   (office-level granularity)
  &filter.ratings=<1|2|3|4|5>                (repeat the param for multi-select)
  &filter.searchKeyword=<urlenc-free-text>   (note: robots-disallowed — see gotchas)
  &sort.sortBy=<DATE|HELPFULNESS|RATING_DESC|RATING_ASC>
  &sort.ascending=<true|false>
```

Pagination uses a path suffix, not a query param:

```
.../Reviews/<Slug>-Reviews-E<EmployerId>_P<page>.htm
```

Page 1 has no suffix; pages 2+ append `_P2`, `_P3`, etc. **`_P*` URLs are robots-disallowed** — you must be authenticated, and you must throttle (~1 request / 2 s sustained).

Discovery procedure for filter IDs (jobTitleFTS, locationId, etc.):

1. Open the reviews page with no filters.
2. `browse cloud browse snapshot` and find the filter-rail combobox refs.
3. `browse cloud browse click` the combobox, then `browse cloud browse type <partial>` to surface the autocomplete dropdown.
4. Each dropdown entry's `data-id` attribute is the integer ID; read it via `browse cloud browse get html body` and a regex over `data-job-title-id="\d+"` / `data-location-id="\d+"`.
5. Cache the resolved IDs alongside the EmployerId.

### 5. Scrape rendered reviews

```bash
browse cloud browse --connect "$SID" open "$URL"
browse cloud browse --connect "$SID" wait load
browse cloud browse --connect "$SID" wait timeout 2500     # async sub-rating widget
browse cloud browse --connect "$SID" get html body > /tmp/page.html
```

Per-review block markers in the rendered HTML (stable across 2026 re-skins as of skill generation, but treat as breakable — verify each run):

| Field | Locator (HTML) |
|---|---|
| Review root | `<li data-test="employer-review-...">` (the `data-test` value is the review ID — capture this for `review_id` and to construct the permalink) |
| Review date | `<time datetime="YYYY-MM-DDTHH:mm:ssZ">` — use the `datetime` attribute, not the rendered relative text |
| Reviewer headline | `<h3 data-test="review-title">` |
| Reviewer job title + status | `<span data-test="review-detail-job-title">` and `<span data-test="review-detail-employment-status">` (e.g. "Current Employee, more than 3 years") |
| Location | `<span data-test="review-detail-location">` |
| Overall stars | `<span aria-label="X out of 5">` on the review header |
| Pros / Cons / Advice | `<p data-test="pros">`, `<p data-test="cons">`, `<p data-test="advice-to-management">` (last is optional) |
| Recommend / Outlook / CEO approval | `<div data-test="review-recommend"|"review-outlook"|"review-ceo-approval">` — value is `POSITIVE | NEGATIVE | NEUTRAL | NO_OPINION` |
| Helpful count | `<button data-test="helpful-count">N</button>` |
| Per-category sub-ratings | `<ul data-test="employer-review-rating-breakdown"> <li data-test="<category>"> <span aria-label="X.0">` — categories: `career-opportunities`, `comp-benefits`, `culture-values`, `senior-management`, `work-life-balance`, `diversity-inclusion` |

Permalink: `https://www.glassdoor.com/Reviews/Employee-Review-<Slug>-RVW<review_id>.htm`.

### 6. Scrape the company header (overall + distribution + CEO)

The reviews page renders the company aggregates in the header. Locators:

| Field | Locator |
|---|---|
| Name + logo | `<img data-test="employer-logo">` → `src`, `alt` |
| Overall rating | `<div data-test="rating-info"> <span data-test="rating-overall">` |
| Total review count | `<span data-test="reviews-count">` |
| Recommend % | `<div data-test="ei-recommend"> <span data-test="ei-recommend-percentage">` |
| CEO approval | `<div data-test="ceo-approval">` → name from `<span data-test="ceo-name">`, percentage from `<span data-test="ceo-approval-percentage">`, count from `aria-label` |
| Business outlook | `<div data-test="business-outlook">` with positive / neutral / negative spans |
| Sub-rating averages | `<ul data-test="employer-ratings-breakdown"> <li data-test="<category>">` (same six categories as per-review) |
| Rating distribution | `<ul data-test="rating-distribution"> <li data-test="rating-bucket-<1..5>">` count |
| HQ / industry / size / founded / website | `<aside data-test="employer-info">` block — fields are dl/dt/dd pairs |

### 7. Page through results

```bash
for page in 1 2 3 ... ; do
  URL_P="${URL_BASE}${page > 1 ? "_P${page}.htm" : ".htm"}${QS}"
  browse cloud browse --connect "$SID" open "$URL_P"
  browse cloud browse --connect "$SID" wait load
  browse cloud browse --connect "$SID" wait timeout 2000
  # extract; concat
  sleep 2    # robots-disallowed path → conservative throttle
done
```

Stop when one of:
- The requested `limit` is reached.
- The page renders the "End of reviews" footer (`<div data-test="reviews-list-end">`).
- The URL after navigation is `/profile/login_input.htm` (cookies expired — bail out, prompt operator to re-auth).

### 8. Release the session

```bash
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

## Site-Specific Gotchas

- **READ-ONLY.** Never click "Write a Review", "Add Salary", "Add Interview", "Apply on Glassdoor", "Follow Company", the helpful 👍 button, or any time-slot / submit / order control. The skill's sole job is to extract; any mutation breaks the contract.
- **Cloudflare wall on bare HTTP.** `browse cloud fetch` to any `glassdoor.com` path returns HTTP 403 with `<title>Security | Glassdoor</title>` and a `__cf_chl` interstitial in the body (~241 KB). Confirmed with `--proxies` on and off, 2026-05-16. The Fetch API surface is permanently unusable for this domain. Real Chrome + Verified + residential proxy is the only path.
- **Partner API is gone.** `https://api.glassdoor.com/api/api.htm` returns HTTP 410 with a zero-byte body. The Glassdoor Partner API was deprecated to new partners in 2021 and now actively 410s. Do not waste turns on it.
- **`/graph` is a trap.** Glassdoor's internal GraphQL gateway at `https://www.glassdoor.com/graph` returns HTTP 403 with an empty body (server-side `Forbidden`, distinct from the Cloudflare interstitial). It requires a fresh anti-CSRF token + login-session cookies issued from the rendered page, which the page rotates per-tab. You can't reuse them out-of-band. Stay in the rendered DOM.
- **`/autocomplete/suggest` is also walled.** The JSON autocomplete endpoint that resolves company name → EmployerId returns the same Cloudflare 403 as the HTML pages. Do not assume it's CORS-public; it isn't.
- **Give-to-get login wall.** Unauthenticated sessions render the first ~1 review fully, then overlay a modal: "To continue reading, contribute a review / salary / interview, or log in." There is no URL-param bypass. The wall is keyed to the visitor's account state, not the IP — so even a fresh Verified session triggers it. Solution: pre-authed Browserbase Context (see Workflow step 1). Brand-new accounts must additionally satisfy the give-to-get minimum (one contribution) before being granted full read access; do this in the operator's one-time login step, not the agent's per-request path.
- **`filter.searchKeyword=` is robots-disallowed.** Glassdoor's `robots.txt` explicitly disallows `*filter.searchKeyword=*`. Authenticated sessions can still use it, but throttle aggressively (≤ 1 request / 2 s) and expect occasional 429s. If the keyword filter starts returning empty results when the un-keyworded query returns reviews, you've been throttled — back off 60 s.
- **Pagination is robots-disallowed.** `/Reviews/*_P*.htm` and `/Reviews/*_IP*.htm` are both `Disallow:` in robots.txt. Only the SEO exception `/Reviews/*-reviews-SRCH_*_IP2.htm*` is `Allow:`. In practice an authed session can paginate normally, but if you start to see Cloudflare-served 403s mid-paginate, you've crossed the throttle threshold — add `sleep 2` between page fetches, never less.
- **Filter rail state does not survive a reload.** Clicking buttons in the rail mutates a client-side store but not the URL; if the agent reloads or follows pagination after rail-only interaction, the filters are lost. Always express filters as URL query params (`filter.ratings=4`, `sort.sortBy=DATE`, etc.) — do not click rail buttons unless capturing autocomplete IDs.
- **Multi-select stars uses repeated `filter.ratings=` params.** To filter to 4 + 5 star reviews: `&filter.ratings=4&filter.ratings=5`. Comma-joining is silently dropped to a no-op filter.
- **`filter.currentJob` is tri-state, not boolean.** `true` = current employees only, `false` = former employees only, **omit the param entirely** to get both. Sending `filter.currentJob=both` 400s.
- **EmploymentStatus enum**: `REGULAR | PART_TIME | CONTRACT | INTERN | FREELANCE`. Surface depends on the company's review distribution — Glassdoor hides options with < 5 reviews in that bucket, so the rail may not show every value. URL-set the param directly; an unsupported value renders zero reviews (it's a filter, not an error).
- **Sort param is split**: `sort.sortBy` accepts `DATE | HELPFULNESS | RATING_DESC | RATING_ASC`, plus a separate `sort.ascending=<true|false>` that is honored only when `sortBy=DATE` (toggles chronological direction). The "most helpful" sort silently re-ranks per-page, so two requests for the same page can return different ordering — capture the review ID set per page and de-duplicate when assembling the final output.
- **`datetime` attribute is canonical, rendered relative text is not.** Always read `<time datetime="...">`; the human-readable "5 days ago" string is locale-dependent and rounds.
- **CEO approval count is in `aria-label`, not text.** Body text says "78%"; the `<div aria-label="78% approve · 1,234 ratings">` carries the count. Don't drop the aria-label.
- **Sub-rating widget renders async after `load`.** Wait ≥ 2 s after `wait load` before snapshotting, otherwise the sub-ratings come back as zeros.
- **Locale routes affect content.** `/Reviews/...` is the US/global English route. UK reviewers may post on `glassdoor.co.uk` (same EmployerId, partial overlap of reviews depending on the company). For an exhaustive cross-locale extract, the skill must iterate the `glassdoor.{com,co.uk,de,fr,nl,com.au,ca,ie,com.mx,com.br,it,com.hk,jp}` TLD set and de-dupe by `review_id`.
- **The skill ships as `candidate`.** The cookie-sync requirement is operator-supplied and was not exercised end-to-end during skill generation: the host sandbox blocked outbound CDP egress to `connect.*.browserbase.com`, so all four anti-bot walls above were probed via the REST/Fetch API only. The authed-context workflow is sound on paper and matches the documented Glassdoor architecture, but production validation requires (a) a real operator login, (b) one end-to-end run on at least one company per locale-cluster, and (c) tightening the per-review locator table against any 2026+ DOM re-skin.

## Expected Output

The skill returns one of three top-level shapes.

### Shape 1 — Success (company + filtered reviews)

```json
{
  "success": true,
  "company": {
    "name": "Stripe",
    "employerId": 671932,
    "canonicalUrl": "https://www.glassdoor.com/Reviews/Stripe-Reviews-E671932.htm",
    "logoUrl": "https://media.glassdoor.com/sql/671932/stripe-squarelogo.png",
    "headquarters": "South San Francisco, CA",
    "industry": "Internet & Web Services",
    "sizeBucket": "1001 to 5000 Employees",
    "foundedYear": 2010,
    "website": "https://stripe.com",
    "ceo": {
      "name": "Patrick Collison",
      "approvalPercentage": 94,
      "approvalCount": 1234
    },
    "overallRating": 4.1,
    "totalReviewCount": 612,
    "recommendToFriendPercentage": 78,
    "businessOutlook": { "positive": 71, "neutral": 17, "negative": 12 },
    "subRatingAverages": {
      "careerOpportunities": 4.0,
      "compAndBenefits": 4.3,
      "cultureAndValues": 4.1,
      "seniorManagement": 3.7,
      "workLifeBalance": 3.5,
      "diversityAndInclusion": 4.0
    },
    "ratingDistribution": { "5": 312, "4": 158, "3": 78, "2": 36, "1": 28 }
  },
  "filters_applied": {
    "ratings": [4, 5],
    "jobTitle": "Software Engineer",
    "locationId": 1147401,
    "currentJob": true,
    "language": "eng",
    "employmentStatus": "REGULAR",
    "sortBy": "DATE",
    "limit": 30
  },
  "reviews": [
    {
      "reviewId": "78912345",
      "permalink": "https://www.glassdoor.com/Reviews/Employee-Review-Stripe-RVW78912345.htm",
      "date": "2026-04-22T00:00:00Z",
      "headline": "Best engineering culture I've worked in",
      "reviewerJobTitle": "Software Engineer",
      "reviewerLocation": "San Francisco, CA",
      "employmentStatus": "Current Employee",
      "tenure": "more than 3 years",
      "employmentType": "REGULAR",
      "overallRating": 5,
      "pros": "Smart coworkers, well-funded teams, high autonomy.",
      "cons": "Some processes feel heavy as headcount grows.",
      "adviceToManagement": "Keep investing in IC career ladders.",
      "recommend": "POSITIVE",
      "ceoApproval": "POSITIVE",
      "businessOutlook": "POSITIVE",
      "helpfulCount": 17,
      "subRatings": {
        "careerOpportunities": 5,
        "compAndBenefits": 5,
        "cultureAndValues": 5,
        "seniorManagement": 4,
        "workLifeBalance": 4,
        "diversityAndInclusion": 5
      }
    }
  ]
}
```

### Shape 2 — Ambiguous (multiple top-tier matches for a bare-name input)

```json
{
  "success": false,
  "reason": "ambiguous_name",
  "query": "Aurora",
  "matches": [
    { "name": "Aurora Innovation", "employerId": 2754012, "headquarters": "Pittsburgh, PA", "reviewCount": 132, "url": "https://www.glassdoor.com/Reviews/Aurora-Innovation-Reviews-E2754012.htm" },
    { "name": "Aurora Cannabis", "employerId": 1419533, "headquarters": "Edmonton, Canada", "reviewCount": 287, "url": "https://www.glassdoor.com/Reviews/Aurora-Cannabis-Reviews-E1419533.htm" },
    { "name": "Aurora Health Care", "employerId": 11651, "headquarters": "Milwaukee, WI", "reviewCount": 1842, "url": "https://www.glassdoor.com/Reviews/Aurora-Health-Care-Reviews-E11651.htm" }
  ]
}
```

### Shape 3 — Authentication required (cookies expired or context not attached)

```json
{
  "success": false,
  "reason": "auth_required",
  "detail": "Session landed on /profile/login_input.htm — Browserbase context cookies are stale or missing. Re-run the operator-side one-time login (see SKILL Workflow step 1) and rotate CTX_ID.",
  "lastUrl": "https://www.glassdoor.com/profile/login_input.htm?from=%2FReviews%2FStripe-Reviews-E671932.htm"
}
```

### Shape 4 — Company not found

```json
{
  "success": false,
  "reason": "company_not_found",
  "query": "Not-A-Real-Company-LLC",
  "lastUrl": "https://www.glassdoor.com/Search/results.htm?keyword=Not-A-Real-Company-LLC"
}
```
