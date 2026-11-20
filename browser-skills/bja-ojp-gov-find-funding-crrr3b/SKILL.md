---
name: bja-ojp-gov-find-funding-crrr3b
title: BJA Find Funding Opportunities
description: >-
  Enumerate U.S. DOJ Bureau of Justice Assistance funding opportunities
  (currently open or closed/expired) as structured JSON via the public
  funding-api JSON endpoint — title, opportunity ID, status, solicitation type,
  topics, deadlines, eligible applicants, and NOFO PDF URL — with client-side
  filtering on keyword, topic, applicant type, and date range.
website: bja.ojp.gov
category: government-grants
tags:
  - grants
  - doj
  - funding
  - government
  - read-only
  - drupal
  - json-api
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: api
alternative_methods:
  - method: url-param
    rationale: >-
      The HTML listing /funding/current?search=…&form_topic=…&funding_category=…
      honors Drupal Views filters server-side, but each card only carries title
      + 3 dates — you lose topic, tags, description, and applicant data versus
      the API. Use only when you want to avoid client-side filtering of the full
      catalog.
  - method: browser
    rationale: >-
      Full browser drive of the listing + detail pages works but is strictly
      slower and gives no extra fields beyond the JSON API and the URL-param
      HTML path. Reserve for screenshot/visual-verification flows only — no
      anti-bot or JS-render barriers were observed that would force this path.
verified: false
proxies: false
---
# BJA Find Funding Opportunities

## Purpose

Enumerate U.S. DOJ Bureau of Justice Assistance funding opportunities listed on `bja.ojp.gov` and return them as structured JSON. For each opportunity surface: title, opportunity ID (`O-BJA-YYYY-XXXXX`), status (open / closed), solicitation type (Competitive / Formula / Non-Competitive / etc.), primary topic + free-text tag list, posting date, closing date, Grants.gov deadline, JustGrants deadline, short description preview, eligible applicant types when parseable, detail-page URL on `bja.ojp.gov`, and the NOFO PDF URL on `ojp.gov`. Read-only — no application submitted.

## When to Use

- Daily / weekly polling for newly-posted BJA funding announcements.
- Topic-, keyword-, or applicant-type-scoped queries against the BJA catalog (e.g. "currently open drug-court opportunities for tribal governments").
- Bulk extraction of the BJA NOFO PDF index for a downstream PDF parser (which then resolves award_min / award_max / expected_number_of_awards / total_program_funding — those live only inside the PDF; see Site-Specific Gotchas).
- Comparing the open queue against past awards (`/funding/expired`) for trend analysis.

## Workflow

The BJA funding listing is a thin Drupal 10 view over a public JSON API at `https://bja.ojp.gov/funding-api/*`. No auth, no cookies, no anti-bot — verified during 2026-05-19 testing with bare `browse cloud fetch` (no stealth, no residential proxy). Lead with the JSON API; only fall back to the HTML cards when you need a filter dimension the API doesn't honor and you don't want to filter client-side. The browser is overkill — the entire skill can run in 2 HTTP requests.

### 1. Pick the right endpoint by status

| Requested status | Endpoint | Today's row count |
|---|---|---|
| `open` (currently accepting applications) | `GET https://bja.ojp.gov/funding-api/current_funding_data` | ~7 (2026-05-19) |
| `closed` (no longer accepting) | `GET https://bja.ojp.gov/funding-api/expired_funding_data` | 500 (server-side cap; see gotcha) |
| `forecasted` | **Not supported by BJA.** See gotchas — BJA does not publish a forecasted queue. The OJP-wide "anticipated" view does not include BJA-specific opportunities at a discoverable BJA URL. Return `{ "status": "forecasted", "items": [], "note": "BJA does not publish a forecasted/anticipated opportunity queue. /funding/expected, /funding/archive, /funding/forecasted, /funding/anticipated, /funding/upcoming all return 404. Closest substitute: subscribe to BJA's notification list or watch Grants.gov directly." }` and exit. |

Both supported endpoints return `200 OK` with `Content-Type: application/json` and an array of opportunity records. Filter query string parameters (`?search=`, `?form_topic=`, `?funding_category=`) are **silently ignored** by the API — see gotchas. Filter client-side after fetching.

### 2. Decode each record

API rows have these keys (lowercase; types as observed 2026-05-19):

```jsonc
{
  "origin_site": "BJA",                                       // always "BJA"
  "title": "FY25 Byrne State Crisis Intervention Formula Program",
  "url": "https://bja.ojp.gov/funding/opportunities/o-bja-2025-172582",
  "field_closing_date": "2026-05-19T20:59:59",                // ISO-8601, local-Eastern as Z-naive
  "field_grants_gov_deadline": "2026-05-12T23:59:59",         // ISO-8601
  "field_app_justgrants_deadline": "2026-05-19T20:59:59",     // ISO-8601 (usually == closing_date)
  "code_body": "",                                            // always empty in observed runs
  "field_funding_type": "Formula",                            // Competitive | Competitive Discretionary | Formula | Continuation | Non-Competitive | Noncompetitive Discretionary
  "name": "Courts",                                           // primary topic (see topic taxonomy below)
  "tags": "Crisis response, Formula NOFOs, Crisis intervention, Violent crime, ...",  // comma-separated free-text tags
  "body": "Jmx0O3AmZ3Q7..."                                   // **base64-encoded HTML preview, truncated** — see gotcha
}
```

To produce the requested output shape:

- **`grant_name`** = `title`
- **`opportunity_id`** = uppercase the last URL segment: `o-bja-2025-172582` → `O-BJA-2025-172582`.
- **`status`** = derived from which endpoint you called (`current_funding_data` → `open`, `expired_funding_data` → `closed`).
- **`solicitation_type`** = `field_funding_type` (string enum above).
- **`primary_topic`** = `name`.
- **`topic_tags`** = `tags.split(", ")` (comma + space). Free-text — includes program names, controlled topics, and ad-hoc descriptors mixed together.
- **`close_date`** = `field_closing_date` (this is the final hard application deadline = JustGrants deadline).
- **`grants_gov_deadline`** = `field_grants_gov_deadline` (SF-424 pre-submission, typically 7 days before `close_date`).
- **`justgrants_deadline`** = `field_app_justgrants_deadline`.
- **`description_preview`** = decode and strip HTML from `body`:
  ```js
  let body = Buffer.from(item.body, "base64").toString("utf8");
  // Drupal double-encodes: &lt; → <, etc.
  body = body.replace(/&lt;/g,'<').replace(/&gt;/g,'>')
             .replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&nbsp;/g,' ');
  const description_preview = body.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  ```
  **The decoded body is truncated to roughly 700–1500 chars and ends in `...`.** For the full description, fetch the NOFO PDF (out of scope for this skill).
- **`eligible_applicant_types`** = parse the `<ul>` block following `<strong>Eligible Applicants:</strong>` in the decoded `body`. The structure is two-level (top-level `Government Entities:` / `Nonprofits:` / `Other:` groupings, each containing leaf `<li>` items like `State governments`, `County governments`, `Native American Tribal governments (federally recognized)`). **This list is also truncated in many records** — the body cut-off can fall mid-`<ul>`. If you need a complete, verified applicant list, fall back to the NOFO PDF.
- **`detail_url`** = `url` (already canonical).
- **`nofo_pdf_url`** = derivable from the opportunity_id WITHOUT fetching the detail page:
  ```js
  const slug = item.url.split('/').pop();           // "o-bja-2025-172582"
  const pdfSlug = slug.replace(/^o-/, '');          // "bja-2025-172582"
  const nofo_pdf_url = `https://www.ojp.gov/funding/docs/${pdfSlug}.pdf`;
  ```
  Verified working pattern across all 7 currently-open opportunities (2026-05-19). The PDF is hosted on `www.ojp.gov`, not `bja.ojp.gov`. Older expired solicitations (FY2018 and earlier) often lack a NOFO PDF entirely — emit `null` and skip if the URL 404s.

### 3. Apply client-side filters

Because the API ignores filter params, do all filtering in your decode step:

| Filter dimension | Source | Implementation |
|---|---|---|
| **Keyword** | API `title` + decoded `body` text | `title.toLowerCase().includes(q) \|\| descriptionPreview.toLowerCase().includes(q) \|\| tags.toLowerCase().includes(q)` |
| **Status** | choice of endpoint | covered in step 1 |
| **Topic (controlled)** | API `name` and/or `tags` | exact-match against `name`, substring-match against `tags`. See observed taxonomy below. |
| **Eligible applicant type** | decoded `body` `<ul>` | match against the leaf strings extracted above. **Best-effort only** — body truncation makes this unreliable; surface a `"applicant_filter_confidence": "low"` flag when the body ends in `...` before the applicant list was fully enumerated. |
| **Close-after / close-before** | API `field_closing_date` | ISO date compare |
| **Award range (min / max USD)** | **NOT exposed on bja.ojp.gov** | Surface `null` for award fields and skip this filter, OR delegate to a downstream NOFO-PDF parser (out of scope per this skill's contract). |

**Observed topic taxonomy** (from the listing page's `<select name="form_topic">`, with Drupal taxonomy term IDs — useful only for the HTML fallback in step 4):

| term ID | label |
|---|---|
| 65276 | Corrections |
| 61066 | Courts |
| 71001 | Drugs |
| 61741 | Forensic sciences |
| 74921 | Hate crimes |
| 63146 | Law enforcement |
| 79401 | Mental health |
| 88921 | Tribal justice |
| 63326 | Violent crime |

This is **narrower than the prompt's claimed BJA vocabulary** ("Officer Safety", "Justice Information Sharing", "Victim Services", etc.) — those labels do not appear in the filter UI. Topic-tags like "Officer safety and wellness" do appear inside the free-text `tags` field, so use substring matching on `tags` for topics outside the controlled list above.

### 4. Browser / HTML fallback (only if you need server-side filtering)

Skip this unless the client-side filter pass in step 3 is unworkable (e.g. you only want a count, not the records, and want to avoid downloading the whole catalog). The HTML listing **does** honor filter params via Drupal Views — but each card only exposes title + 3 dates (no topic, no tags, no body, no eligible applicants), so this loses ~80% of the structured data the API gives you. Cards are at `<article class="listing-item listing-item--funding_opportunity">` with selector pattern:

```
/funding/current?search=<urlenc>&form_topic=<termID>&funding_category=<Competitive|Formula|...>&sort_by=field_closing_date_value&sort_order=ASC&page=<N>
```

Or for closed: `/funding/expired?…` (same param set). Pagination uses `?page=N` zero-indexed, 25 cards per page. Per-card extraction regex from the listing HTML:

- detail URL: `<a href="(/funding/opportunities/[a-z0-9-]+)">`
- title: `<span class="field field--name-title[^"]*">([^<]+)</span>` inside that anchor
- close date: inside `field--name-field-closing-date` block → `<time datetime="([^"]+)"`
- grants.gov deadline: same pattern inside `field--name-field-grants-gov-deadline`
- justgrants deadline: same pattern inside `field--name-field-app-justgrants-deadline`

To enrich beyond those four fields from the HTML path, you have to fetch each detail page (`bja.ojp.gov/funding/opportunities/{slug}`) — which **still** does not expose award amounts or full applicant lists; it adds only `Opportunity ID`, `Solicitation Status`, `Fiscal Year`, `Posting Date`, `Solicitation Type`, and the NOFO PDF download link. **The API gives you strictly more, faster.** Use the HTML path only as a tie-breaker when the API path is unavailable.

## Site-Specific Gotchas

- **The API ignores filter query strings.** `?search=…`, `?form_topic=…`, `?funding_category=…` are accepted (200 OK) but the response is unchanged — verified by appending `?search=crisis&form_topic=61066` and still getting all 7 current items back. The HTML listing path (`/funding/current?search=…`) does honor these. The form's `action="/funding-api/current_funding_data"` is misleading — clicking submit on the rendered form actually reloads the HTML view with the params, not the JSON endpoint.
- **`forecasted` status does not exist on BJA.** Verified 2026-05-19: `/funding/forecasted`, `/funding/anticipated`, `/funding/upcoming`, `/funding/expected`, `/funding/archive` all return 404. `/funding-api/forecasted_funding_data`, `/funding-api/anticipated_funding_data`, `/funding-api/upcoming_funding_data` all return `200 OK` but with a zero-length body (Drupal's behavior for non-existent REST views). BJA only publishes "currently available" (`/funding/current`) and "past" (`/funding/expired`). Do not invent a forecasted result set; return an empty array with the note in step 1.
- **`/funding/expected` and `/funding/archive` from the prompt's input spec are wrong.** They return 404. The correct paths are `/funding/current` and `/funding/expired`. The prompt's "Past Funding" sidebar link confirms this: it points to `/funding/expired`.
- **The `body` field is base64-encoded AND HTML-entity-double-encoded AND truncated.** Decoding chain: `Buffer.from(body, 'base64').toString('utf8')` → `&lt;` → `<`, `&gt;` → `>`, `&amp;` → `&`, `&quot;` → `"`, `&nbsp;` → ` ` → strip remaining tags. Truncation cuts at ~700–1500 chars decoded and ends with literal `...`. **Eligible-applicants lists are often cut off mid-`<ul>`** — confidence on applicant-type filtering is low for any record whose body ends in `...`. The full description lives only in the NOFO PDF.
- **NOFO PDF URL is derivable, not surfaced.** The API does not include a `pdf_url` field. Construct: take the URL slug (`o-bja-2025-172582`), strip the leading `o-` (→ `bja-2025-172582`), and prefix with `https://www.ojp.gov/funding/docs/` and suffix with `.pdf`. The detail page also includes a `class="usa-button usa-button--big"` Download anchor pointing at the same URL — fetch the detail page only if you want to verify the PDF exists before emitting the URL.
- **Older (FY2018 and earlier) opportunities often lack a NOFO PDF.** The detail page for `bja-2018-13620` has no `field-opportunity-document` block — older records were imported from a legacy system that only carries title/status/dates/opportunity_id. Treat `nofo_pdf_url` as nullable.
- **`expired_funding_data` is capped at 500 rows.** The HTML view `/funding/expired` paginates over 49 pages × 25 cards = ~1225 historical records, but the JSON endpoint returns at most 500 (most-recent-first ordering). For deeper historical extraction, fall back to HTML pagination — `/funding/expired?page=0..48&sort_by=field_closing_date_value&sort_order=DESC`.
- **Award amounts, expected number of awards, and total program funding are NOT exposed on `bja.ojp.gov` at all.** Not in the API, not on the listing card, not on the detail page. They live exclusively inside the NOFO PDF body text (typically under headings like "Eligibility" → "Award Information" → "Award Amount" / "Number of Awards" / "Total Amount Available"). Any filter on `award_min` / `award_max` requires a NOFO PDF parser — explicitly out of scope per this skill's contract. Emit those fields as `null` and pass the PDF URL through.
- **`field_closing_date` is Eastern time but serialized as Z-naive.** Format is `YYYY-MM-DDTHH:MM:SS` with no timezone suffix — the underlying value is Eastern (EST/EDT) as shown on the detail page ("8:59 pm Eastern"). The detail page's `<time datetime="...Z">` ISO attribute renders as Zulu but the displayed "Closing Date" reflects the local Eastern day. When comparing against a user-supplied `close_after` / `close_before`, treat the API value as `America/New_York`.
- **`name` (primary topic) is sometimes a default, not a true classification.** All 7 currently-open opportunities (2026-05-19) returned `"name": "Courts"` regardless of subject matter — including the "FY25 Rural Law Enforcement Violent Crime Reduction Initiative" which is clearly law-enforcement-primary, not courts. The `tags` field is far more reliable for topic classification — it carries 3–13 ordered facets per opportunity covering program name + topic areas + crime types. **Filter on `tags` (case-insensitive substring), not `name`, for any topic search.**
- **Topic taxonomy mismatch with prompt.** The prompt lists "Officer Safety and Wellness", "Substance Use", "Justice Information Sharing", "Victim Services", "Tribal" — but the listing page's `form_topic` `<select>` only exposes 9 controlled terms: Corrections, Courts, Drugs, Forensic sciences, Hate crimes, Law enforcement, Mental health, Tribal justice, Violent crime. The prompt's broader vocabulary appears to be BJA's editorial Program Areas (visible on `/program/{slug}` pages) rather than the funding-listing filter taxonomy. For prompts that reference an out-of-controlled-list topic, substring-match against `tags` instead of `name`.
- **`Solicitation Status` on the detail page is one of: `Open`, `Closed`, `Forecasted` (theoretically) — but in practice you'll only see `Open` and `Closed`.** No record observed during 2026-05-19 testing exposed a `Forecasted` solicitation status on its detail page.
- **No anti-bot, no auth, no rate-limit-evidence.** Site is fronted by Cloudflare + Drupal 10 + Varnish, but every endpoint above returned 200 OK from a bare `browse cloud fetch` with no proxies, no stealth, and no cookies. 8 sequential requests during testing produced no 429 / 403 / captcha. Still, keep ≤ 1 req/s sustained as a courtesy — the API is uncached (`X-Drupal-Dynamic-Cache: UNCACHEABLE`).
- **Field name surprise: `code_body` is always empty.** Don't try to parse it. The real description preview is in `body` (base64).
- **`origin_site` is hardcoded `"BJA"` in the BJA mini-site's API.** Other OJP bureaus (NIJ, OJJDP, OVC, COPS) likely host their own parallel `*.ojp.gov/funding-api/current_funding_data` endpoints with `origin_site` differing; this skill is scoped to BJA only.

## Expected Output

```jsonc
{
  "source": "https://bja.ojp.gov/funding-api/current_funding_data",
  "fetched_at": "2026-05-19T18:53:23Z",
  "status_filter": "open",
  "total_results": 7,
  "filters_applied": {
    "keyword": null,
    "topic": null,
    "eligible_applicant_type": null,
    "close_after": null,
    "close_before": null,
    "award_min": null,
    "award_max": null
  },
  "items": [
    {
      "grant_name": "FY25 Byrne State Crisis Intervention Formula Program",
      "opportunity_id": "O-BJA-2025-172582",
      "status": "open",
      "solicitation_type": "Formula",
      "primary_topic": "Courts",
      "topic_tags": [
        "Crisis response", "Formula NOFOs", "Crisis intervention",
        "Violent crime", "Law enforcement", "Violence prevention",
        "Crime prevention", "Mental health", "Drugs", "Substance abuse",
        "Courts", "Gun violence", "Byrne State Crisis Intervention Program (SCIP)"
      ],
      "posting_date": null,
      "close_date": "2026-05-19T20:59:59",
      "close_date_timezone": "America/New_York",
      "grants_gov_deadline": "2026-05-12T23:59:59",
      "justgrants_deadline": "2026-05-19T20:59:59",
      "description_preview": "This funding opportunity will provide funding for the creation or enhancement of state crisis intervention court proceedings and related programs or initiatives, including extreme risk protection order programs, as well as mental health courts, drug courts, and veterans treatment courts. Eligible Applicants: Government Entities: State governments See the Notice of Funding Opportunity for additional opportunity details and directions on how to apply. ...",
      "description_truncated": true,
      "eligible_applicant_types": ["State governments"],
      "eligible_applicant_confidence": "high",
      "award_min": null,
      "award_max": null,
      "expected_number_of_awards": null,
      "total_program_funding": null,
      "detail_url": "https://bja.ojp.gov/funding/opportunities/o-bja-2025-172582",
      "nofo_pdf_url": "https://www.ojp.gov/funding/docs/bja-2025-172582.pdf"
    }
    // ... 6 more
  ]
}
```

For a forecasted-status request:

```json
{
  "source": "https://bja.ojp.gov/funding/current",
  "fetched_at": "2026-05-19T18:53:23Z",
  "status_filter": "forecasted",
  "total_results": 0,
  "items": [],
  "note": "BJA does not publish a forecasted/anticipated funding queue. /funding/forecasted, /funding/anticipated, /funding/upcoming, /funding/expected, /funding/archive all return 404. /funding-api/forecasted_funding_data returns 200 OK with an empty body. Closest substitute: monitor Grants.gov directly or subscribe to BJA's notification list."
}
```

For a closed-status request (uses the expired endpoint, capped at 500 most-recent):

```json
{
  "source": "https://bja.ojp.gov/funding-api/expired_funding_data",
  "fetched_at": "2026-05-19T18:53:23Z",
  "status_filter": "closed",
  "total_results": 500,
  "total_results_truncated": true,
  "truncation_note": "API returns at most 500 most-recent expired records. For older records, paginate /funding/expired?page=0..48 (25/page, ~1225 total).",
  "items": [ /* same shape as above, with status: "closed" */ ]
}
```
