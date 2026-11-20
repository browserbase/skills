---
name: policygenius-com-compare-insurance-g7sogh
title: Policygenius Insurance Comparison
description: >-
  Compare insurance carriers on Policygenius (life, auto, home, renters,
  disability) and return Policygenius rating, AM Best, J.D. Power, NAIC
  complaint index, pros/cons, Best-for tag, and last-reviewed date per carrier.
  Editorial-only; never enters the PII-gated quote funnel.
website: policygenius.com
category: insurance
tags:
  - insurance
  - comparison
  - carriers
  - ratings
  - read-only
source: 'browserbase: agent-runtime 2026-05-16'
updated: '2026-05-16'
recommended_method: hybrid
alternative_methods:
  - method: api
    rationale: >-
      Direct HTTPS GET of Policygenius editorial URLs returns clean static HTML
      with JSON-LD Product/Review and InsuranceAgency schema blocks. No session,
      no JS-rendering. Treat the URL templates in the Workflow as the API
      contract.
  - method: url-param
    rationale: >-
      Per-product / per-state / per-city best-of URLs are deterministic slug
      templates — given a product + region, the canonical URL is constructible
      without any discovery step.
  - method: browser
    rationale: >-
      Only required when browse cloud fetch hits its 1 MB body cap (homeowners review
      index) or when burst-fetch volume triggers Fastly soft-throttling. Never
      used to drive the quote funnel — that path is robots-disallowed and
      requires PII.
verified: false
proxies: false
---
# Policygenius Insurance Comparison

## Purpose

Given a product intent (life, auto, home, renters, disability), a free-form
policy description, a carrier name, or a Policygenius product URL — return the
matching Policygenius-reviewed carriers as structured JSON: name, logo,
canonical review URL, Policygenius rating (decimal stars), pros / cons, AM Best
financial-strength rating, J.D. Power score, NAIC complaint index, "Best for"
editorial tag, and last-reviewed date. Read-only — never click `Apply`,
`Continue`, `Get a quote`, or any funnel CTA, and never submit a real applicant
profile.

This skill returns Policygenius's **editorial** comparison data (carrier reviews
+ best-of rankings). It does **not** return live quote pricing — Policygenius's
quote funnel is gated behind a multi-step questionnaire that requires real PII
(SSN-region, date-of-birth, contact info) AND is explicitly robots-disallowed
(see Gotchas).

## When to Use

- Building a side-by-side carrier comparison for one insurance product
  ("compare term life carriers", "renters in Chicago", "long-term disability").
- Resolving a single carrier name to its Policygenius review record
  ("Lemonade renters", "Haven Life term", "Amica auto").
- Pulling editorial "Best for X" rankings (best for poor credit, best for young
  adults, best customer satisfaction, best bundling, …).
- Enriching a downstream pricing or quote-aggregation flow with Policygenius's
  rating + pros/cons context.

**Not for**: live premium quotes, binding policies, or any flow that requires
submitting applicant demographics. Those are out of scope by design — see
Gotchas.

## Workflow

The optimal path is **direct HTTP fetch of Policygenius's editorial pages** —
they are static, server-rendered HTML with JSON-LD `Product`/`Review` and
`InsuranceAgency` schema blocks for every reviewed carrier. No anti-bot, no
JavaScript-rendering required, no session needed. Use `browse cloud fetch <url>` (or any
plain HTTPS client) — a Browserbase **session** is only required for the
fallback path below.

### 1. Resolve the input to a product + (optional) carrier slug

| Input shape                                              | → Resolution                                                                  |
|----------------------------------------------------------|-------------------------------------------------------------------------------|
| Full `/{product}-insurance/reviews/{carrier}/` URL       | Skip to step 3 (carrier detail).                                              |
| Full `/{product}-insurance/best-…/` URL                  | Skip to step 4 (best-of list).                                                |
| Product intent ("term life", "homeowners", …)            | Map to one of the product slugs below.                                        |
| Free-form description                                    | Extract product + sub-product + state/city; map to product slug + best-of URL.|
| Carrier name ("Lemonade renters", "Haven Life term")     | Map to `/{product}-insurance/reviews/{kebab-case-name}/`. Confirm via step 2. |

**Product-slug table** (the `{product}` URL fragment):

| Intent              | Product slug             | Reviews coverage          |
|---------------------|--------------------------|---------------------------|
| Term / Whole / UL / No-medical Life | `life-insurance`         | Full (~30 carriers)       |
| Auto / Car          | `auto-insurance`         | Full (~30 carriers)       |
| Homeowners / Condo  | `homeowners-insurance`   | Full (~30 carriers)       |
| Renters             | `renters-insurance`      | Full (~10 carriers)       |
| Long-term Disability| `disability-insurance`   | Limited (6 carriers)      |
| Pet (dog/cat)       | `pet-insurance`          | **None** — see Gotchas    |
| Health              | `health-insurance`       | **None** — see Gotchas    |
| Travel              | `travel-insurance`       | **None** — see Gotchas    |

### 2. Enumerate carriers for a product

Two equivalent discovery surfaces; prefer (a) for the simple list, (b) for a
ranked list with editorial "Best for X" tags:

**(a) Carrier review index** — every reviewed carrier slug for that product:

```
GET https://www.policygenius.com/{product}/reviews/
```

Carrier slugs appear as `href="/{product}/reviews/{slug}/"`. Extract with:

```
/{product}/reviews/([a-z0-9][a-z0-9-]+)/
```

Drop the synthetic slug `methodology` and any `{a}-vs-{b}` head-to-head slugs.

> ⚠️ The homeowners review index is >1 MB and **exceeds `browse cloud fetch`'s 1 MB body
> cap** (server returns: `502 The response body exceeded the maximum allowed
> size of 1MB. Use a browser session to handle large responses.`). Two
> workarounds: (i) enumerate via the sitemap at
> `https://www.policygenius.com/sitemap-0.xml` (~3 k URLs, 385 KB — fits) and
> filter for the `/{product}/reviews/{slug}/` shape; or (ii) drive a real
> Browserbase session for that one page. The auto / life / renters / disability
> indexes fit under the cap and need no workaround.

**(b) National best-of page** — ranked list + per-carrier "Best for X" callout:

| Product               | Canonical national best-of URL                                                |
|-----------------------|-------------------------------------------------------------------------------|
| Auto                  | `/auto-insurance/best-car-insurance-companies/`                               |
| Life (umbrella)       | `/life-insurance/best-life-insurance-companies/`                              |
| Life (term)           | `/life-insurance/best-term-life-insurance-companies/`                         |
| Life (whole)          | `/life-insurance/best-whole-life-insurance-companies/`                        |
| Life (no-med-exam)    | `/life-insurance/no-medical-exam-life-insurance/`                             |
| Homeowners            | `/homeowners-insurance/best-homeowners-insurance-companies/`                  |
| Disability (LTD)      | `/disability-insurance/best-disability-insurance-companies/`                  |
| Renters (national)    | Not published. Use the renters review index (step 2a) + city pages (step 2c).|

Each best-of page embeds **multiple `<script type="application/ld+json">`
blocks**: one `Article` wrapper plus one `InsuranceAgency` per ranked carrier
(name, logo URL, canonical review URL). Editorial "Best for X" tags live in
sibling `<h2>`/`<h3>` headings of the shape:

```
<h2>1. Best overall coverage: Openly</h2>
<h2>2. Best for homeowners with poor credit: Travelers</h2>
```

Match with: `^(\d+)\.\s*Best\s+([^:]+):\s*(.+)$` to split rank, category,
carrier.

**(c) Region best-of** — state or city scoped:

| Product       | Pattern                                                          |
|---------------|------------------------------------------------------------------|
| Auto state    | `/auto-insurance/best-car-insurance-in-{state-name-lower}/`      |
| Auto city     | `/auto-insurance/best-car-insurance-in-{city-fl}/` (Naples FL, …)|
| Homeowners    | `/homeowners-insurance/{state-name-lower}/best-companies/`       |
| Renters city  | `/renters-insurance/best-renters-insurance-in-{city-lower}/`     |

State / city slugs are `lower-kebab-case`; some auto-city slugs append the
state abbreviation (`naples-fl`, `aurora-co`). Cross-check existence against
the sitemap before fetching. **A 404 returns a 41,008-byte branded
not-found page, not an HTTP 404 status from Policygenius's CDN** — but the
`browse cloud fetch` response **does** carry the correct upstream 404 statusCode. Check
`statusCode === 200` before parsing.

### 3. Pull a single carrier's detail page

```
GET https://www.policygenius.com/{product}/reviews/{carrier-slug}/
```

Each page has **exactly one** `<script type="application/ld+json">` block —
parse it as JSON and pull from the top-level / `@graph[0]` object:

| Field                       | JSON-LD path                                              |
|-----------------------------|-----------------------------------------------------------|
| Carrier full name           | `name` (strip the trailing " – Policygenius" suffix)      |
| Policygenius rating         | `review.reviewRating.ratingValue` (decimal, 1–5)          |
| Best-rating denominator     | `review.reviewRating.bestRating` (always `"5"`)           |
| Pros                        | `review.positiveNotes.itemListElement[].name`             |
| Cons                        | `review.negativeNotes.itemListElement[].name`             |
| Last-reviewed date          | `review.dateModified` (ISO `YYYY-MM-DD`)                  |
| First-published date        | `review.datePublished`                                    |
| Review author               | `review.author.name`                                      |
| Canonical review URL        | `url`                                                     |
| Description blurb           | `description`                                             |

Logo URLs live in the `InsuranceAgency` schema blocks on the parent **best-of**
page, not on the carrier's own review page. To get a logo: hit the matching
best-of page and look up the carrier's `image.url` (always a
`https://images.ctfassets.net/3uw9cov4u60w/...` Contentful URL — that prefix is
a stable identifier of "Policygenius-CMS-hosted logo").

**Body-prose extraction** — the following fields are **not** in JSON-LD and must
be regex-pulled from the rendered prose. Treat all as best-effort; surface
`null` when absent:

| Field                       | Regex (case-insensitive, first match)                                                    |
|-----------------------------|------------------------------------------------------------------------------------------|
| AM Best rating              | `AM Best[^.]*?\b(A\+\+?|A\+?|A-|B\+\+?|B\+?|B-|C\+\+?|C\+?|C-)\b`                         |
| J.D. Power score (0–1000)   | `J\.?D\.? Power[^.]*?\b([5-9][0-9]{2})\b`                                                |
| NAIC complaint index        | `(?:NAIC\|complaint index)[^.]*?\b([0-9]+\.[0-9]{1,2})\b`                                |
| Money-back / free-look      | `(?:money-back\|free[ -]look)[^.]*?\b(\d{1,3})\s*(?:day\|days)\b`                         |
| Application time            | `application[^.]*?\b(\d{1,3})\s*(?:minute\|minutes\|hour\|hours\|day\|days)\b`           |
| Medical exam required       | Presence of "no medical exam" → `false`; "requires a medical exam" → `true`; else `null`.|

### 4. Editorial "Best for X" extraction (when serving a ranked comparison)

On a best-of page, walk DOM-order through `h2`/`h3` headings matching
`/^\d+\.\s*Best\s+([^:]+):\s*(.+?)$/`. The carrier name in the heading is the
`InsuranceAgency.name` (without the `~~~Insurance~~~` suffix some agencies
carry) — fuzzy-match to the JSON-LD blocks on the same page to resolve the
canonical review URL + logo.

### 5. Affiliate CTAs — capture, do not follow

Anchors with link text matching `/^(Apply|Continue|Get (a )?quote|Compare
quotes|See rates|Start saving)/i` are Policygenius's underwriter-affiliate
funnel entry points. Their `href` values point either at `/life-insurance/start`,
`/auto-insurance/quotes/`, `/homeowners-insurance/quotes/`,
`/life-insurance/quotes/`, or at an external partner domain.

**Emit them as `apply_url` on the carrier record with `apply_url_is_affiliate:
true`, but do NOT follow the redirect** — the destination is the funnel form
that this skill is forbidden from submitting, and the link is robots-disallowed
(see Gotchas).

### 6. Compose the response

Merge the per-carrier records pulled in step 3 with the editorial best-of tags
from step 4 and the logos / canonical-review-URLs from the `InsuranceAgency`
blocks. Sort by `Policygenius_rating` descending unless the caller requested
otherwise.

### Browser fallback (only when the static-HTML path fails)

The static path fails only in two known cases: (a) the homeowners review index
exceeds the 1 MB Fetch-API body cap, and (b) one or more individual carrier
pages temporarily serve from a cold edge cache and return partial HTML. Both
recover with a real Browserbase session:

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies | python3 -c \
  "import json,sys; print(json.load(sys.stdin)['id'])")
browse --connect "$SID" open "https://www.policygenius.com/{product}/reviews/" --wait load
browse --connect "$SID" get html body > /tmp/page.html
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

`--verified` and `--proxies` are recommended (not required) — bare
sessions worked in our probes but Policygenius is fronted by Fastly + Varnish
and starts soft-throttling at ~10 req/min from a single IP. Use Verified + proxy
when you expect to fetch >20 pages in a burst, or when a bare fetch starts
returning truncated bodies. **Never** drive the browser into a quote funnel,
even with the most permissive session — see Gotchas.

## Site-Specific Gotchas

- **The quote funnel is robots-disallowed AND requires real PII — never enter
  it.** Policygenius's `/robots.txt` explicitly `Disallow`s every quote /
  application / estimation path:
  `/life-insurance/quotes/`, `/life-insurance/application`,
  `/life-insurance/estimation`, `/life-insurance/comparison`,
  `/life-insurance/start`, `/homeowners-insurance/quotes/`,
  `/auto-insurance/quotes/`, `/wills/create/`, plus all `*/exit-survey/*` and
  `*/health/` subpaths. The funnel pages themselves are full SPAs that require
  date-of-birth, SSN-region, ZIP, vehicle VIN (auto), or home address (home)
  before yielding any pricing — none of which this skill is permitted to submit.
  If a caller asks for "live quotes", return a stub:
  `{ "success": false, "reason": "quote_funnel_requires_pii_and_is_robots_disallowed" }`.

- **`browse cloud fetch` has a 1 MB body cap.** The homeowners review index
  (`/homeowners-insurance/reviews/`) returned the literal upstream string
  `502 The response body exceeded the maximum allowed size of 1MB. Use a
  browser session to handle large responses.` Workaround: enumerate carrier
  slugs from `https://www.policygenius.com/sitemap-0.xml` (385 KB, fits)
  instead, or fall through to a Browserbase session for that one page. Auto,
  life, renters, and disability indexes all fit under the cap.

- **Pet, health, and travel insurance have no carrier-review pages.**
  `/pet-insurance/`, `/health-insurance/`, and `/travel-insurance/` are
  editorial article landing pages with **zero** `InsuranceAgency` schema blocks
  and no `/reviews/{slug}/` subpaths in the sitemap. Pet insurance is delegated
  to MarketWatch's pet guide (link in the page body); Policygenius does not
  underwrite or compare pet/health/travel carriers directly. The skill must
  return `{ "success": false, "reason": "product_not_covered", "product":
  "pet|health|travel" }` for these three verticals — do NOT attempt to scrape
  the body prose into a fake carrier list.

- **Carrier review pages have exactly one JSON-LD block; best-of pages have
  10–15.** A best-of page contains: one `Article` (the wrapper), zero or one
  `FAQPage`, one or more `ImageObject`, and one `InsuranceAgency` per ranked
  carrier. Parse every block — discard parse failures silently — and pick out
  the InsuranceAgency entries.

- **JSON-LD `InsuranceAgency.name` sometimes has trailing whitespace** (`"Openly
  "`, `"Nationwide "`, `"Amica "`). Always `.trim()` before matching against
  the "Best for X: Carrier" heading text.

- **`<title>` is the source-of-truth for the page's editorial title, but it is
  appended with `" – Policygenius"`** (en-dash + space). Strip the suffix
  before emitting. The JSON-LD `name` field has the same suffix.

- **AM Best / J.D. Power / NAIC values are in body prose, not in JSON-LD.** The
  regexes in the Workflow table get the values right ~90 % of the time but will
  occasionally match the wrong number (e.g. an AM Best `A++` from a sentence
  about a *parent* company rather than the reviewed carrier). For
  high-accuracy use cases, emit the matched substring's context window (±60
  chars) as a `_provenance` field so downstream callers can sanity-check.

- **`/{product}/{state}/best-companies/` is the homeowners state-best-of
  pattern; auto uses `/auto-insurance/best-car-insurance-in-{state}/` instead.**
  Two different conventions in the same site. Renters uses city-not-state
  slugs (`/renters-insurance/best-renters-insurance-in-{city}/`). When in
  doubt, query the sitemap.

- **A 404 from Policygenius returns a 41,008-byte branded "page not found"
  page**, not a small error blob. The HTTP statusCode is correctly 404 in the
  `browse cloud fetch` response envelope — check `statusCode === 200` before parsing,
  don't rely on body length.

- **Sub-product life URLs are mostly distinct pages, but `no-medical-exam`
  lives at `/life-insurance/no-medical-exam-life-insurance/`** — not at
  `/life-insurance/best-no-medical-exam-life-insurance-companies/` (404). The
  product table in the Workflow lists the canonical URLs.

- **"Apply" / "Continue" / "Get a quote" anchors are affiliate URLs.** Capture
  the `href` but never `GET` or `browse open` them — both because (a) the
  destination is a robots-disallowed funnel and (b) following affiliate links
  artificially inflates Policygenius's referral metrics. Emit them with
  `apply_url_is_affiliate: true` so downstream consumers can choose whether to
  surface them.

- **Some reviewed carriers are no longer accepting applications** (e.g. Haven
  Life as of 2024-01-03 per its review's `dateModified`). The carrier review
  still loads, with positive/negative notes intact, but there is no "Apply"
  CTA. Surface this as `accepting_applications: false` when the page title or
  H1 contains the phrase "no longer accepting applications".

- **`review.dateModified` is the editorial-review date, not the rating-as-of
  date.** Some carrier reviews go 12+ months between `dateModified` updates
  while their AM Best / J.D. Power values change quarterly. Treat the JSON-LD
  rating as "Policygenius's view at last editorial review" — flag stale records
  (`dateModified > 18 months ago`) in the response.

- **Logo URLs are Contentful-hosted** with a stable prefix
  (`https://images.ctfassets.net/3uw9cov4u60w/...`). The path component
  contains a Contentful asset ID + filename — both URL-safe to embed in
  downstream JSON, no signed-URL expiry to worry about.

## Expected Output

Five distinct outcome shapes. All return `success: true` except the two stub
shapes (`product_not_covered`, `quote_funnel_requires_pii_and_is_robots_disallowed`).

### (a) Ranked carrier list — best-of view

```json
{
  "success": true,
  "product": "homeowners-insurance",
  "source_url": "https://www.policygenius.com/homeowners-insurance/best-homeowners-insurance-companies/",
  "carriers": [
    {
      "rank": 1,
      "best_for_tag": "overall coverage",
      "name": "Openly",
      "carrier_slug": "openly",
      "logo_url": "https://images.ctfassets.net/3uw9cov4u60w/4YeN9dkRRN27awXKeKL4xT/...",
      "review_url": "https://www.policygenius.com/homeowners-insurance/reviews/openly/",
      "policygenius_rating": 4.6,
      "policygenius_rating_max": 5,
      "am_best_rating": "A",
      "jd_power_score": null,
      "naic_complaint_index": 0.42,
      "pros": ["Generous coverage limits", "..."],
      "cons": ["Only available in 21 states", "..."],
      "last_reviewed": "2024-05-31",
      "apply_url": "/homeowners-insurance/quotes/?carrier=openly",
      "apply_url_is_affiliate": true,
      "accepting_applications": true
    }
  ]
}
```

### (b) Single carrier detail

```json
{
  "success": true,
  "product": "renters-insurance",
  "carrier": {
    "name": "Lemonade",
    "carrier_slug": "lemonade",
    "review_url": "https://www.policygenius.com/renters-insurance/reviews/lemonade/",
    "policygenius_rating": 4.4,
    "policygenius_rating_max": 5,
    "am_best_rating": null,
    "jd_power_score": null,
    "naic_complaint_index": null,
    "pros": ["Fast app-based claims", "..."],
    "cons": ["Only available in 28 states + DC"],
    "review_author": "Jessica Olivo",
    "last_reviewed": "2023-11-20",
    "first_published": "2020-04-08",
    "apply_url": "https://www.lemonade.com/...",
    "apply_url_is_affiliate": true,
    "accepting_applications": true,
    "description": "Tech-friendly fast coverage..."
  }
}
```

### (c) "Best for X" picks

```json
{
  "success": true,
  "product": "homeowners-insurance",
  "best_for_picks": [
    { "rank": 1, "category": "overall coverage", "carrier_slug": "openly", "carrier_name": "Openly" },
    { "rank": 2, "category": "overall for customer satisfaction", "carrier_slug": "amica", "carrier_name": "Amica" },
    { "rank": 3, "category": "homeowners with poor credit", "carrier_slug": "travelers", "carrier_name": "Travelers" },
    { "rank": 4, "category": "option if you've had a lapse in coverage", "carrier_slug": "stillwater", "carrier_name": "Stillwater" },
    { "rank": 5, "category": "homes with a history of claims", "carrier_slug": "foremost", "carrier_name": "Foremost" }
  ]
}
```

### (d) Product not covered

```json
{
  "success": false,
  "reason": "product_not_covered",
  "product": "pet-insurance",
  "note": "Policygenius does not maintain carrier reviews for pet, health, or travel insurance. Pet comparison is delegated to MarketWatch's guide; health insurance is not sold direct."
}
```

### (e) Live quote requested

```json
{
  "success": false,
  "reason": "quote_funnel_requires_pii_and_is_robots_disallowed",
  "note": "Live premium quotes require submitting date-of-birth, ZIP, and (for auto/home) vehicle/property identifiers through Policygenius's funnel at /{product}/quotes/. That path is disallowed by robots.txt AND requires PII this skill is not permitted to submit. Use the editorial carrier-review data above as decision input, then refer the user to https://www.policygenius.com/ to complete the funnel manually."
}
```
