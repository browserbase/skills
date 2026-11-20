---
name: skillsfuture-gobusiness-gov-sg-search-competitor-traini-16f40b6d
title: Search Competitor Training Providers (SkillsFuture Course Directory)
description: >-
  Search the SkillsFuture for Business Course Directory for SSG-funded training
  providers and their courses, returning a per-provider research list with
  course themes, funding schemes (SFEC / Industry-Supported), pre/post-subsidy
  pricing, ratings, format, and course-detail URLs.
website: skillsfuture.gobusiness.gov.sg
category: market-research
tags:
  - skillsfuture
  - training
  - course-directory
  - competitor-research
  - singapore
  - ssg
  - grant-funding
source: 'browserbase: agent-runtime 2026-06-09'
updated: '2026-06-09'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      Drive a (bare, non-stealth) session to discover exact filter-facet URL
      values (click checkbox, read window.location.href) or when you prefer the
      rendered DOM over parsing the RSC Flight payload. Slower and pricier than
      fetch.
  - method: api
    rationale: >-
      No public JSON API exists — the upstream SSG data API is called
      server-side only; the client just receives an opaque Next.js RSC
      navigation stream. Don't waste time hunting for /api endpoints.
verified: false
proxies: false
---
# Search Competitor Training Providers in the SkillsFuture Course Directory

## Purpose

Search the SkillsFuture for Business Course Directory (`skillsfuture.gobusiness.gov.sg/course-directory/search`) for training providers and the SSG-supported courses they run, returning a structured, per-provider research list: course themes/titles, funding schemes (SFEC / Industry-Supported / Absentee Payroll), indicative pre- and post-subsidy pricing, ratings, course format/duration, and the course-detail URL. Read-only — never registers, logs in, or submits anything. Every course in this directory is SkillsFuture Singapore (SSG)-supported and eligible for SFEC + Absentee Payroll funding, which makes it the authoritative source for mapping grant-funded training competitors targeting Singapore SMEs.

## When to Use

- Building a competitor / market-mapping list of training providers in a capability area (e.g. digital marketing, digital transformation, data analytics, sustainability/ESG) for Singapore SMEs.
- Pulling every SSG-funded course a named provider runs, with funding tags and subsidised pricing.
- Filtering the directory to grant-relevant cohorts (e.g. `keywords=Digital Economy`, or the `SkillsFuture Enterprise Credit (SFEC)` facet) and aggregating by provider.
- Anywhere you'd otherwise hand-scrape the directory — the search results are server-rendered into the page HTML, so a plain HTTP fetch returns the full structured dataset without driving a browser.

## Workflow

The page is a Next.js (App Router) app, **but the search results are server-side-rendered** into the initial HTML as a React Server Component (RSC) "Flight" payload (`self.__next_f.push([...])` script chunks). That payload carries every field the cards display — provider, title, rating, funding tags, fees at each subsidy tier, course runs, and the course-detail link. **Lead with a plain HTTP GET of a deep-link URL and parse that payload.** No login, cookies, JS execution, residential proxy, or stealth required (confirmed: a bare `browse cloud fetch` of the deep-link returns HTTP 200 with all 10/25/50/100 cards plus the total result count). The browser path (below) is a fallback, mainly useful for discovering exact filter-facet values.

1. **Build the deep-link URL.** Search and paging are entirely URL-driven — you do **not** need to type into the search box:
   ```
   https://skillsfuture.gobusiness.gov.sg/course-directory/search
       ?search_query=digital+marketing      # spaces as '+' (or %20)
       &page_size=100                        # 10 | 25 | 50 | 100  (100 = fewest round-trips)
       &page=0                               # ZERO-indexed
       &sort_by=relevance                    # see Gotchas for other values
       &keywords=Digital+Economy             # optional facet; exact display string, '+'-encoded
   ```

2. **Fetch it.** `browse cloud fetch "<url>"` (add `--proxies` only if you ever see a regional block — not needed today). Read `content` (the HTML, ~580 KB for page_size=10).

3. **Read the total result count.** It is rendered as the `"children":["87"," ",{...,"children":"results"}]` node near the top of the payload — match `\"children\":\["(\d+)\"," "` to get the integer (`87` for `digital marketing` + `Digital Economy`). Use it to decide how many pages to fetch: `ceil(total / page_size)`, incrementing `page` from `0`.

4. **Extract each course object.** Each card is an RSC component (`$L63`) whose fields appear in order in the payload. The values are JSON-escaped (`\"`). Per course you get:
   - `subtitle` → **training provider name** (e.g. `@ASK TRAINING PTE. LTD.`)
   - `title` → course title
   - `isIndustrySupported` → boolean (sector-body endorsement)
   - `rating` (number or `$undefined`) + `ratingDetail` (review count, e.g. `"2,256"`)
   - `tags` → array, e.g. `["Digital Economy","SkillsFuture Enterprise Credit (SFEC)"]` (funding/economy facets)
   - `courseDuration`, `modeOfTraining`, `language`, `courseHours`, `courseRuns[]` (each with start/end dates, intake size, learning style, registration window)
   - `label`/`labelDataValue` → `"Full course fee"` / `"S$300.00"` (full pre-subsidy fee, **exclusive of GST**)
   - `secondLabel`/`secondLabelDataValue` → `"After subsidy"` / `"From S$90.00"` (after baseline SSG subsidy)
   - `supportingDataLabel`/`supportingDataValue` → `"After SFEC"` / `"From S$9.00"` (after SFEC tops up 90% of nett)
   - `linkUrl` → `/course-directory/courses/{TGS-id}` (canonical course-detail URL)

   A robust regex anchor is `\"isIndustrySupported\":(true|false),\"subtitle\":\"...\",\"title\":\"...\"`, then scan the next ~3.5 KB of the payload for the fee/`linkUrl`/`tags` fields belonging to that card.

5. **Aggregate by provider.** Group courses by `subtitle`. Per provider record: course count, sample course titles (themes), the union of funding `tags`, the full-fee and after-subsidy price range, and whether any course is `isIndustrySupported`. This is the competitor row a commercial/product team consumes.

6. **(Optional) enrich from the course-detail page.** GET `https://skillsfuture.gobusiness.gov.sg/course-directory/courses/{TGS-id}` (also SSR; `browse cloud fetch` or `browse get markdown body`). Adds: provider website URL, the recognising industry body (e.g. "recognized and supported by Singapore Computer Society (SCS)"), EIS supporting period, contact person (name / phone / email), full course overview, learning outcomes, and entry requirements.

7. **(Optional) enumerate the full provider universe.** The left-panel **Training Provider** facet lists every provider in the directory alphabetically (~440 entities, also in the SSR payload). Read it to build a complete provider roster, then drill in per provider with `search_query` empty + the provider checkbox.

### Browser fallback

Use only when you need to discover exact filter-facet values, or if the RSC payload format changes. Drive a real session (a bare session is fine — no stealth needed):

1. `browse open "<deep-link url>" --remote` then `browse wait timeout 4000` (results render client-side after hydration).
2. `browse get markdown body` — each result renders as a markdown link containing provider, title, rating, funding tag, duration, full fee, and "After subsidy" price; the `/course-directory/courses/TGS-…` href is the course id.
3. To learn a filter's exact URL value: `browse snapshot`, click the facet's checkbox by ref, `browse wait timeout 1500`, then read `browse eval "window.location.href"` — the applied value is appended to the query string (e.g. clicking *Digital Economy* appends `&keywords=Digital+Economy`).

## Site-Specific Gotchas

- **No public JSON API.** The upstream SSG data API is called server-side only; the client never sees clean JSON. The closest thing to an API is the **RSC Flight payload embedded in the SSR HTML** — parse that. Don't hunt for an `/api/...` XHR; there isn't one (the only client fetches are Next.js RSC navigations with an opaque `RSC: 1` body, GA/analytics, and the VICA chatbot).
- **`page` is zero-indexed.** `page=0` is the first page. Off-by-one here silently skips the first cohort of results.
- **`search_query` uses `+` (or `%20`) for spaces; the param name matters.** `search_query=digital+marketing` works (550 results); guessing `q=` / `searchValue=` is **ignored** and returns the full unfiltered directory (20,936 results) — a silent failure that looks like success. Always sanity-check the total count against the keyword.
- **The `/course-directory/search/{keyword}` PATH 404s.** Search is a query-string, not a path segment. `…/search/digital%20marketing` returns "Page not found".
- **`keywords` facet takes the exact display string.** Valid values (each `+`-encoded): `Care Economy`, `Digital Economy`, `Green Economy`, `SkillsFuture Enterprise Credit (SFEC)`, `Critical Core Skills`. These are the SSG "economy/credit" facets — `Digital Economy` is the right cut for MarTech / digital-transformation competitor mapping.
- **`areas_of_training` is a real param but is NOT free-text.** The param name is confirmed (`areas_of_training=` returns `0 results` when the value doesn't match the site's internal taxonomy, vs. unknown params which are ignored and return everything). The Area-of-Training options render via a virtualised list that does **not** reliably appear in the a11y snapshot, so don't guess the value — apply the checkbox in the browser fallback and copy the exact value the URL receives. Area labels include "Advertising, Sales & Marketing", "Information and Communications", "Marine & Port Services", "Transportation and Storage", "Wholesale and Retail Trade" (relevant ICP sectors).
- **`sort_by=relevance` is confirmed.** Other UI sort options (Price low→high / high→low, Most Viewed, Ratings high→low / low→high, Alphabetical A–Z / Z–A) map to other `sort_by` values — capture the exact token via the browser fallback (read the URL after picking the dropdown) rather than guessing.
- **Fees are exclusive of GST and the "After subsidy" / "After SFEC" figures are "From" floors** (best-case, depends on employee profile — SME vs non-SME, SC/PR/LTVP+, age). Treat post-subsidy prices as indicative minimums, not quotes. SMEs get up to 90% baseline subsidy; SFEC defrays a further 90% of the nett.
- **`isIndustrySupported` ≠ a funding scheme.** It means a sector body (e.g. Singapore Computer Society) endorses the course; funding eligibility is conveyed by the `tags` (SFEC) and the universal SSG-support of every directory course. A card can be `isIndustrySupported:false` yet still SFEC-funded.
- **`rating` can be `$undefined`** in the payload (rendered as "No rating") — handle the non-numeric sentinel when parsing.
- **Result count is capped per search, not per provider.** A keyword search returns courses; one provider can own many cards. Aggregate client-side. To get the *complete* provider list independent of any keyword, read the Training Provider facet (≈440 entities) rather than paginating a search.
- **No anti-bot wall observed.** Pre-run probe reported no anti-bots; both the bare HTTP fetch and a non-stealth browser session returned full content. CloudFront fronts the site but did not challenge. `--verified`/`--proxies` are unnecessary.
- **Scheduled maintenance banner.** The site shows a maintenance notice; certain SkillsFuture-for-Business services can be briefly unavailable per the published schedule — retry rather than treating a transient failure as a block.

## Expected Output

A structured, per-provider research list aggregated from the parsed course cards.

```json
{
  "source": "skillsfuture.gobusiness.gov.sg/course-directory/search",
  "query": {
    "search_query": "digital marketing",
    "keywords": "Digital Economy",
    "sort_by": "relevance",
    "page_size": 100,
    "page": 0
  },
  "total_results": 87,
  "providers": [
    {
      "provider": "@ASK TRAINING PTE. LTD.",
      "course_count_on_page": 2,
      "industry_supported": false,
      "course_themes": [
        "WSQ Digital Marketing Essentials - (Classroom and Async e-learning)",
        "WSQ Digital Marketing Analytics (Google Analytics)"
      ],
      "funding_schemes": ["SkillsFuture Enterprise Credit (SFEC)", "SSG baseline subsidy", "Absentee Payroll"],
      "facets": ["Digital Economy"],
      "full_fee_sgd_range": ["S$300.00", "S$900.00"],
      "after_subsidy_from_sgd_range": ["From S$90.00", "From S$270.00"],
      "rating": 4.5,
      "sample_course_url": "https://skillsfuture.gobusiness.gov.sg/course-directory/courses/TGS-2023020687"
    },
    {
      "provider": "NTUC LEARNINGHUB PTE. LTD.",
      "course_count_on_page": 1,
      "industry_supported": false,
      "course_themes": ["Empowering Digital Marketers with Essential AI Tools (SF)"],
      "funding_schemes": ["SkillsFuture Enterprise Credit (SFEC)", "SSG baseline subsidy", "Absentee Payroll"],
      "facets": ["Digital Economy"],
      "full_fee_sgd_range": ["S$1,800.00"],
      "after_subsidy_from_sgd_range": ["From S$540.00"],
      "rating": 5.0,
      "sample_course_url": "https://skillsfuture.gobusiness.gov.sg/course-directory/courses/TGS-2024046411"
    }
  ]
}
```

Per-course shape (before aggregation), exactly as extracted from the RSC payload:

```json
{
  "provider": "SKILLS DEVELOPMENT ACADEMY PTE. LTD.",
  "title": "Introduction to Digital Marketing",
  "course_id": "TGS-2021010044",
  "url": "https://skillsfuture.gobusiness.gov.sg/course-directory/courses/TGS-2021010044",
  "is_industry_supported": false,
  "rating": 5.0,
  "rating_count": "3,686",
  "tags": ["Digital Economy", "SkillsFuture Enterprise Credit (SFEC)"],
  "duration": "2 - 3 Days",
  "course_hours": 16,
  "mode_of_training": ["Part Time"],
  "language": ["English"],
  "full_course_fee": "S$800.00",
  "after_subsidy_from": "From S$240.00",
  "after_sfec_from": "From S$24.00"
}
```

Notes:
- `funding_schemes` is inferred: every directory course is SSG-supported (baseline subsidy + Absentee Payroll + SFEC-eligible); the SFEC `tag` confirms SFEC, and any explicit economy/credit facet is surfaced under `facets`.
- `rating` may be absent (`$undefined` → "No rating"); `after_*` figures are best-case "From" floors, GST-exclusive.
```
