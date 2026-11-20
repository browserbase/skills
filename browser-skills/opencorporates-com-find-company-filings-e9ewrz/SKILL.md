---
name: opencorporates-com-find-company-filings-e9ewrz
title: OpenCorporates Company & Filings Lookup
description: >-
  Search OpenCorporates for legal-entity records across jurisdictions and return
  matching companies plus their statutory-filings history (officers, addresses,
  previous names, branch flags, document URLs) as structured JSON. Read-only.
website: opencorporates.com
category: corporate-data
tags:
  - corporate-data
  - kyb
  - due-diligence
  - filings
  - officers
  - open-data
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      Not viable. The public web UI (/companies/*, /search, /officers, /filings)
      is gated by an hCaptcha-enforced HAProxy challenge that blocks both bare
      DC IPs and residential-proxy requests, AND robots.txt explicitly Disallows
      every path the fallback would touch. Verified 2026-05-18. The licensed API
      is the only sanctioned route.
verified: true
proxies: true
---
# OpenCorporates Company + Filings Lookup

## Purpose

Search OpenCorporates for legal-entity records across jurisdictions and return matching companies plus their statutory-filings history as structured JSON. For each company: name, company_number, jurisdiction, status (Active / Inactive / Dissolved), company_type, incorporation / dissolution dates, registered address, registered-agent details, industry codes, previous & alternative names, officers, branch / foreign-registration flag, the canonical OpenCorporates URL, and the filings timeline (date, filing_type, document URL when present). Read-only — never submits a "Claim this company" or "Suggest a correction" form.

## When to Use

- KYC / KYB / customer-onboarding entity verification.
- Vendor / third-party / supplier risk-management lookups.
- AML, anti-fraud, sanctions and due-diligence investigations.
- Corporate-network mapping (parent / subsidiary / UBO).
- Resolving a director / officer name to the companies they appear in.
- Pulling a company's full filings timeline (annual returns, share-capital changes, address changes, dissolution notices, etc.).
- Industry, jurisdiction or incorporation-date faceted search across OpenCorporates' ~250M+ entity dataset.

## Workflow

OpenCorporates publishes a stable, well-documented JSON/XML REST API at `api.opencorporates.com/v0.4/`. **The API is the only viable path** for this skill: the public web UI (`opencorporates.com/companies/*`, `/search`, `/officers`, `/filings`) is gated by an hCaptcha-enforced HAProxy challenge that blocks Browserbase Fetch from both bare DC IPs and `--proxies` (residential) sessions, AND `robots.txt` explicitly `Disallow`s every path the skill would scrape (`/search`, `/officers`, `/filings`, `/data`, `/events`, `/networks`, `/*?page=`, `/*&page=`). Verified 2026-05-18 — see Site-Specific Gotchas for the exact 401/captcha traces.

> ⚠️ **API access requires a paid plan or a public-benefit grant.** The historical "free no-auth tier" referenced in older docs **no longer exists** — every `v0.4` endpoint returns `401 Invalid Api Token` without an `api_token` query param. Current paid tiers (opencorporates.com/pricing): Essentials £2,250/yr (500 calls/mo · 200/day) · Starter £6,600/yr (2,500 calls/mo · 500/day) · Basic £12,000/yr (5,000 calls/mo · 1,000/day) · Enterprise bespoke. Journalism / NGO / academic projects can apply for free at-scale access via opencorporates.com/contact.

### 1. Prerequisites

- `OPENCORPORATES_API_TOKEN` env var with a valid API token. **Never** put it in the URL path or in logs; pass it as the `api_token` query param.
- Cache an in-process counter of daily / monthly calls or poll `GET /v0.4/account_status?api_token=…` between bursts (returns `usage.this_month`, `usage.this_day`, plan limits). The API returns **403 Forbidden** when you exceed your quota — NOT 429 — so a generic 429 retry-with-backoff loop will misbehave.

### 2. Decide which endpoint the user input maps to

| User-provided input | Endpoint |
|---|---|
| Full search URL (`opencorporates.com/companies?q=…&jurisdiction_code=…`) | Translate the query-string into `/v0.4/companies/search?` params. |
| Free-form company-name query | `/v0.4/companies/search?q=<urlenc>` |
| `{ company_number, jurisdiction_code }` direct lookup | `/v0.4/companies/{jurisdiction_code}/{company_number}` |
| Officer name | `/v0.4/officers/search?q=<urlenc>` |
| Registered-agent name | `/v0.4/companies/search?registered_agent_name=<urlenc>` (where supported) or fall back to `q=` + post-filter on `registered_agent_name` in the result records. |

### 3. Map the filter surface onto API params

| User-facing filter | API query param | Notes |
|---|---|---|
| Jurisdiction | `jurisdiction_code` | Term filter — comma-separated (AND) or pipe-separated (OR). Use the OC code: `us_de`, `us_ca`, `gb`, `gb_eaw`, `nl`, `de`, `ca`, `ca_on`, etc. (Not the ISO 3166-2.) |
| Country (multi-jurisdiction) | `country_code` | e.g. `us` returns hits from any `us_*` state. |
| Company status | `current_status` | Free-text — exact register-vocabulary string (`Active`, `Dissolved`, `In Liquidation`, …). Use `inactive=true|false` for the cross-jurisdiction binary mapping. |
| Company type | `company_type` | Free-text register vocabulary (`Limited Liability Company`, `Public Limited Company`, …). |
| Incorporation date range | `incorporation_date=YYYY-MM-DD:YYYY-MM-DD` | Date-range filter — open-ended either side: `:2020-01-01` (before) / `2020-01-01:` (after). |
| Dissolution date range | `dissolution_date=YYYY-MM-DD:YYYY-MM-DD` | Same syntax. |
| Updated since | `updated_at=YYYY-MM-DD:` | "Any associated data changed" semantic. |
| Branch filter | `branch=true|false` | `true` = restrict to branches; `false` = exclude branches. Omit param to include both. |
| Inactive filter | `inactive=true|false` | Same shape — replaces deprecated `exclude_inactive`. |
| Nonprofit filter | `nonprofit=true|false` | |
| Industry code | `industry_codes=<scheme>-<code>` | e.g. `industry_codes=sic_2007-6201`. Hierarchical — parent codes match all children. |
| Identifier (LEI, EIN, charity #) | `identifier_uids=<value>` | |
| Registered address fragment | `registered_address=52 London` | Treated like a name query — matches AND of tokens in the address. |
| Sort order | `order=score` for relevance · default is alphabetic · `order=incorporation_date` (asc) | |
| Pagination | `page=N&per_page=100` | Default `per_page=30`, max `per_page=100`. `page` is capped at **100** (i.e. ≤ 10,000 results reachable through pagination — use facets to narrow further). |
| Sparse mode | `sparse=true` | Drop embedded filings/officers/data summary on the company-detail call. Faster + smaller. |

### 4. Issue the request

```bash
curl -fsS --get "https://api.opencorporates.com/v0.4/companies/search" \
  --data-urlencode "q=$QUERY" \
  --data-urlencode "jurisdiction_code=$JURISDICTION" \
  --data-urlencode "inactive=false" \
  --data-urlencode "order=score" \
  --data-urlencode "per_page=100" \
  --data-urlencode "page=$PAGE" \
  --data-urlencode "api_token=$OPENCORPORATES_API_TOKEN"
```

For a direct-record lookup (`{number, jurisdiction}` input), also fetch the filings tab when the user asked for the timeline:

```bash
curl -fsS --get "https://api.opencorporates.com/v0.4/companies/$JUR/$NUM/filings" \
  --data-urlencode "page=$PAGE" \
  --data-urlencode "per_page=100" \
  --data-urlencode "api_token=$OPENCORPORATES_API_TOKEN"
```

The company-detail call (`/companies/{j}/{n}`) already embeds the **most recent** filings inline under `results.company.filings[]`; only walk `/filings?page=N` when the user explicitly asked for the full history (`total_count`/`total_pages` will tell you how many pages to fetch).

### 5. Normalise the response into the skill output schema

- For `companies/search`: walk `results.companies[].company` → emit one record per hit.
- For the direct lookup: emit one record built from `results.company`, with `filings` populated from either the embedded `results.company.filings[]` (recent only) or the full timeline you fetched in step 4.
- For `officers/search`: walk `results.officers[].officer` → for each one, optionally do a companion `/companies/{j}/{n}` call to enrich.
- Map status → bucket using the rule: `current_status` matches `/^(Active|In Good Standing|Live|Registered)$/i` → `"Active"`; matches `/dissolved|cancelled|struck off|terminated|liquidated/i` → `"Dissolved"`; else → `"Inactive"`. Preserve the raw register string in a `current_status_raw` field for downstream.
- Date fields are ISO `YYYY-MM-DD` or `null`.

### 6. Handle errors

| HTTP | Meaning | Action |
|---|---|---|
| `200` | Success | Parse JSON. |
| `401` | Invalid / missing `api_token` | Surface to caller — do NOT retry. |
| `403` | Quota exceeded (NOT rate-limit-per-second) | Surface as `quota_exceeded`. Check `/account_status` to confirm. |
| `404` | Company/officer not found in OC's index | Return `{ "results": [], "reason": "not_indexed" }`. The skill should NOT fall back to scraping the web UI — see gotchas. |
| `5xx` | Backend hiccup | Exponential backoff (max 3 retries, 1s/2s/4s). |

### 7. Browser fallback — DO NOT IMPLEMENT

There is no working browser-fallback for this skill. Both technically and contractually, scraping `opencorporates.com/companies` is foreclosed. The historical scraping pattern (parsing the search-results list and the company-detail JSON-LD `<script type="application/ld+json">` block) **does not work today**:

- The HAProxy edge serves a 1.5 kB `<title>HAProxy Challenge</title>` hCaptcha page on every `/companies/*`, `/officers/*`, `/filings/*` request, even with `--proxies` (residential) and `--verified`. Solving hCaptcha out-of-band is technically possible but is anti-bot circumvention and breaches OpenCorporates' Terms of Use.
- `robots.txt` (User-Agent: *) `Disallow`s every path the fallback would touch.

If your `OPENCORPORATES_API_TOKEN` is expired or your quota is exhausted, the correct behaviour is **fail fast** with `{ "success": false, "reason": "api_unavailable", "detail": "..." }` and let the orchestrator decide whether to renew the token / upgrade the plan / route to a different data provider. Do not attempt to scrape.

## Site-Specific Gotchas

- **No free no-auth tier any more (verified 2026-05-18).** Every `v0.4` endpoint — `/companies/search`, `/companies/{j}/{n}`, `/companies/{j}/{n}/filings`, `/companies/{j}/{n}/officers`, `/officers/search`, `/account_status`, `/jurisdictions` — returns `401 Invalid Api Token` without `api_token`. Earlier docs ("free tier ~500 req/mo, paid for commercial use") describe a defunct policy; the current self-serve floor is **Essentials at £2,250/yr**. Public-benefit (journalism / NGO / academic) projects can still get free access via the contact form.
- **Web UI is hCaptcha-walled.** `https://opencorporates.com/companies/<j>/<n>`, `/companies?q=…`, `/officers?q=…` return HTTP 200 but the body is the HAProxy `<title>HAProxy Challenge</title>` page with `data-sitekey=5ddae562-c25e-4910-85ae-e758f8841672`. Confirmed: both `browse cloud fetch <url>` and `browse cloud fetch <url> --proxies` blocked. The challenge sets a `solved_captcha` cookie via `POST /.well-known/haproxy/captcha_callback/hcaptcha`; once set, subsequent requests on the same TCP session pass. There is no first-party way to obtain that cookie programmatically.
- **`robots.txt` (User-Agent: *) `Disallow`s `/search`, `/officers`, `/filings`, `/data`, `/events`, `/networks`, `/users`, `/placeholders`, `/statements`, `/*?page=`, `/*&page=`, `/*/network.json`.** Even if the captcha were solved, scraping these paths violates the published robots policy. Honour it.
- **`/reconcile` and `/reconcile/<j>` return HTTP 403 directly** (not behind captcha; just refused). The OpenRefine reconciliation surface is gated to authenticated clients only.
- **403 = quota exceeded, NOT 429.** OpenCorporates re-uses HTTP 403 for "out of API calls". Do not lump it in with anti-bot 403s elsewhere — check `/account_status?api_token=…` to distinguish. Daily quota refreshes at midnight UTC; monthly quota refreshes at midnight UTC on the last day of the month.
- **`page` query param is capped at 100.** With `per_page=100` that's 10,000 records max per query. For broader pulls, narrow with `jurisdiction_code` / `incorporation_date` / `industry_codes` facets, or buy a Bulk Data subscription.
- **`per_page` default is 30**, max 100. The skill SHOULD pass `per_page=100` to halve round-trips.
- **Wildcard search: trailing `*` only.** `q=Barclays Bank*` matches `Barclays Bank PLC` but NOT `Barclays UK Bank`. Leading or middle wildcards are not supported.
- **Search normalises corporate suffixes.** `Corp` ↔ `Corporation`, `Ltd` ↔ `Limited`, `Inc.` ↔ `Incorporated`, etc. — `q=Stripe Inc` and `q=Stripe Incorporated` are equivalent. Stop-words (`the`, `of`) are dropped.
- **Previous names are searched too.** A hit for `q=Twitter` may return X Corp under its `previous_names[]` array — always inspect both `name` and `previous_names[*].company_name` when explaining a match.
- **`branch` field is tri-state.** `null` = not a branch (or register doesn't report it); `"F"` = foreign-registered (out-of-jurisdiction parent); `"L"` = local-branch / out-of-state office. Use `branch_status` for the human-readable string.
- **Jurisdiction codes are not ISO.** They're underscore-joined: US states are `us_de`, `us_ca`, `us_ny`; UK is `gb` (not `uk`); England-and-Wales is `gb_eaw`; Canadian provinces are `ca_on`, `ca_bc`. The full list is `GET /v0.4/jurisdictions?api_token=…`.
- **`identifier_uids` is the LEI / EIN / charity-number cross-walk.** Pass the raw identifier string (e.g. an LEI like `213800X1ULQENH7Q8284`) without scheme prefix.
- **`industry_codes` uid format = `{scheme}-{code}`.** Hierarchical schemes (NAICS, SIC, NACE) match children when you pass a parent code. The list of schemes is `GET /v0.4/industry_codes?api_token=…`.
- **`filings[].url` is often `null`.** OpenCorporates only carries the document URL for jurisdictions that publish them openly (UK Companies House, some US states); for everyone else only `filing_type` / `filing_code` / `date` / `description` are present.
- **Officer records may not have `appointment_date` / `resignation_date`.** Many jurisdictions only publish current officers without temporal scope — emit `null` for either field when absent, never invent a default.
- **`network.json` and the corporate-graph endpoints are disallowed by robots.txt AND require a higher plan.** The `/companies/{j}/{n}/network` API endpoint is fine to call (covered by the same quota), but the web `*/network.json` URL is robots-blocked.
- **Read-only:** the user-facing UI has a "Claim this company" button and a "Suggest a correction" link. The skill must never POST to either — they require login anyway, but the rule stands.
- **`api.opencorporates.com` (the API host) IS publicly resolvable and reachable** from the sandbox without proxies. Only the WWW host needs anti-bot bypass — the API host has no such gate.

## Expected Output

Four distinct outcome shapes:

### 1. Search hit list (free-form name query, officer / agent search, faceted search)

```json
{
  "success": true,
  "query": { "q": "Stripe", "jurisdiction_code": "us_de", "inactive": false, "order": "score", "page": 1, "per_page": 100 },
  "total_count": 14,
  "total_pages": 1,
  "page": 1,
  "results": [
    {
      "name": "STRIPE, INC.",
      "company_number": "4830511",
      "jurisdiction_code": "us_de",
      "jurisdiction": "Delaware (US)",
      "status": "Active",
      "current_status_raw": "Active",
      "company_type": "Corporation",
      "incorporation_date": "2010-04-19",
      "dissolution_date": null,
      "inactive": false,
      "branch": null,
      "branch_status": null,
      "registered_address_in_full": "251 LITTLE FALLS DRIVE, WILMINGTON, DE, 19808",
      "registered_address": {
        "street_address": "251 LITTLE FALLS DRIVE",
        "locality": "WILMINGTON",
        "region": "DE",
        "postal_code": "19808",
        "country": "United States"
      },
      "agent_name": "CORPORATION SERVICE COMPANY",
      "agent_address": "251 LITTLE FALLS DRIVE, WILMINGTON, DE 19808",
      "industry_codes": [
        { "code": "5223", "description": "Activities related to credit intermediation", "code_scheme_id": "us_naics_2017" }
      ],
      "identifiers": [
        { "identifier_system_code": "us_ein", "uid": "27-1665641" }
      ],
      "previous_names": [],
      "alternative_names": [],
      "officers": [
        { "name": "Patrick Collison", "position": "Director", "start_date": "2010-04-19", "end_date": null },
        { "name": "John Collison",    "position": "Director", "start_date": "2010-04-19", "end_date": null }
      ],
      "opencorporates_url": "https://opencorporates.com/companies/us_de/4830511",
      "registry_url": "https://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx",
      "filings_recent": [
        { "date": "2024-03-12", "filing_type": "Annual Franchise Tax Report", "filing_code": "AFTR", "title": "Annual Franchise Tax Report", "description": null, "opencorporates_url": "https://opencorporates.com/filings/123456789", "url": null }
      ]
    }
  ]
}
```

### 2. Direct-record lookup with full filings timeline

```json
{
  "success": true,
  "query": { "company_number": "00102498", "jurisdiction_code": "gb" },
  "company": {
    "name": "TESCO PLC",
    "company_number": "00102498",
    "jurisdiction_code": "gb",
    "jurisdiction": "United Kingdom",
    "status": "Active",
    "current_status_raw": "Active",
    "company_type": "Public Limited Company",
    "incorporation_date": "1947-11-27",
    "dissolution_date": null,
    "registered_address_in_full": "TESCO HOUSE, SHIRE PARK, KESTREL WAY, WELWYN GARDEN CITY, AL7 1GA",
    "branch": null,
    "previous_names": [
      { "company_name": "TESCO STORES (HOLDINGS) LIMITED", "type": "legal", "start_date": null, "end_date": "1983-04-15" }
    ],
    "officers": [ /* … */ ],
    "industry_codes": [ /* … */ ],
    "opencorporates_url": "https://opencorporates.com/companies/gb/00102498"
  },
  "filings": {
    "total_count": 676,
    "total_pages": 7,
    "items": [
      {
        "date": "2014-02-13",
        "filing_type": "Return of purchase of own shares",
        "filing_code": "SH03",
        "title": "Return of purchase of own shares",
        "description": "RETURN OF PURCHASE OF OWN SHARES",
        "opencorporates_url": "https://opencorporates.com/filings/199825350",
        "url": null
      }
    ]
  }
}
```

### 3. Officer search (resolved to companies)

```json
{
  "success": true,
  "query": { "q": "Patrick Collison" },
  "total_count": 23,
  "results": [
    {
      "officer_name": "PATRICK COLLISON",
      "position": "Director",
      "start_date": "2010-04-19",
      "end_date": null,
      "company": {
        "name": "STRIPE, INC.",
        "company_number": "4830511",
        "jurisdiction_code": "us_de",
        "opencorporates_url": "https://opencorporates.com/companies/us_de/4830511"
      },
      "opencorporates_url": "https://opencorporates.com/officers/123456"
    }
  ]
}
```

### 4. Failure modes

```json
// API token missing / invalid
{ "success": false, "reason": "api_unauthorised", "detail": "Invalid Api Token. Please check your OpenCorporates account.", "http_status": 401 }

// Quota exhausted
{ "success": false, "reason": "quota_exceeded", "detail": "Daily or monthly quota hit.", "http_status": 403, "account_status": { "this_day": 200, "limit_day": 200, "this_month": 487, "limit_month": 500 } }

// Direct lookup hit a jurisdiction/company-number that OpenCorporates does not index
{ "success": false, "reason": "not_indexed", "query": { "company_number": "99999999", "jurisdiction_code": "us_de" }, "http_status": 404 }

// Search returned zero hits
{ "success": true, "total_count": 0, "results": [], "query": { "q": "ThisDoesNotExist Z9Z9Z9" } }
```
