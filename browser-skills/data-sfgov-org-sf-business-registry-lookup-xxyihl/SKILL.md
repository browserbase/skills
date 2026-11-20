---
name: data-sfgov-org-sf-business-registry-lookup-xxyihl
title: SF Business Registry Lookup
description: >-
  Look up SF registered businesses by DBA or owner name on data.sfgov.org and
  return legal name, DBA, address, NAICS code, status, and registration date.
website: data.sfgov.org
category: government
tags:
  - government
  - open-data
  - business-registry
  - sf
  - socrata
  - datasf
source: 'browserbase: agent-runtime 2026-05-22'
updated: '2026-05-22'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      Loading the Socrata SODA JSON URL in a remote browser session and reading
      `body` text works as a fallback when direct HTTP egress is unavailable.
      The Data Lens grid UI itself is unreliable — the accessibility tree
      exceeds browse snapshot's buffer once the 50-row grid populates.
verified: false
proxies: false
---
# SF Business Registry Lookup

## Purpose

Look up registered businesses in the City and County of San Francisco's open dataset (Office of the Treasurer & Tax Collector's "Registered Business Locations" — Socrata dataset `g8m3-pdis`). Given a DBA (Doing Business As) name *or* an owner / ownership name, return matching businesses with: legal name (ownership), DBA, full address, NAICS code (+ description when present), active/closed status, and registration (DBA start) date. Read-only — never modifies any record.

## When to Use

- Verify whether a business is registered to operate in SF and what trade name it operates under.
- Resolve a storefront name (DBA) to the legal owning entity / individual.
- Bulk-resolve owner → business portfolio (all DBAs and locations owned by one ownership_name).
- Compliance / KYC pre-checks before contracting with an SF-located vendor.
- Anywhere you'd otherwise scrape the DataSF grid — the Socrata SODA JSON API is faster, cheaper, and structurally more reliable.

## Workflow

The DataSF portal is a thin Socrata Data Lens viewer over a public, unauthenticated SODA 2.0 JSON API at `https://data.sfgov.org/resource/g8m3-pdis.json`. **No auth, no cookies, no rate-limit token, no anti-bot stealth, no residential proxies required.** Lead with the API; the in-grid browser UI is only useful for visual sanity-checking and is markedly slower (the Data Lens accessibility tree balloons past `browse snapshot`'s buffer once 50+ rows are populated — verified in iter-1, turns 8–19 all returned snapshot errors after the grid populated, even though the grid itself rendered correctly).

### 1. Build the SoQL `$where` clause

The dataset's column names (case-sensitive, snake_case) — confirmed against the live `X-Soda2-Fields` response header:

| Column | Type | Notes |
|---|---|---|
| `ownership_name` | text | Legal owner — individual or entity. Search by **owner**. |
| `dba_name` | text | Trade name. Search by **DBA**. |
| `full_business_address` | text | Street + unit (e.g. `60 Spear St 700`). |
| `city`, `state`, `business_zip` | text | Mailing locality of the *physical* location (not always SF). |
| `naic_code` | text | 6-digit NAICS as text. **Sparse — 211,240 / 361,395 rows populated (58%).** |
| `naic_code_description` | text | Human label. **Very sparse — 88,227 / 361,395 rows (24%).** Missing on most pre-2024 records. |
| `naics_code_descriptions_list` | text | Same as above; identical coverage. |
| `lic`, `lic_code_description`, `lic_code_descriptions_list` | text | SF business-tax license sub-codes — useful but not requested by this skill. |
| `dba_start_date` | floating_timestamp | **Registration date** for the DBA. |
| `dba_end_date` | floating_timestamp | DBA-level end date — null on active. |
| `location_start_date` | floating_timestamp | Date this location was registered. |
| `location_end_date` | floating_timestamp | Per-location end date — **null on active locations**; canonical "is this still operating?" signal. |
| `administratively_closed` | boolean | True only when the registration was force-closed by TTX. Most closures use `location_end_date` instead. |
| `location` | point | GeoJSON `{type: "Point", coordinates: [lon, lat]}`. |

**Case-insensitive substring match** is the right primitive for both DBA and owner — names in the dataset are not normalized (e.g. `Starbucks Coffee #593` vs. `Starbucks Coffee#79950`).

```text
upper(dba_name) like '%STARBUCKS%'        -- DBA search
upper(ownership_name) like '%CHEN%'       -- owner search (substring — see substring-bleed gotcha)
location_end_date IS NULL                 -- active-only filter
```

### 2. Build the URL

```
GET https://data.sfgov.org/resource/g8m3-pdis.json
    ?$where=<URL-encoded SoQL>
    &$select=<comma-separated columns>
    &$limit=<N>
    &$order=dba_start_date DESC
```

Always `$select` an explicit column list — the default returns ~38 fields (most empty for any given row) and is wasteful. The 6 fields needed by this skill:

```
$select=ownership_name,dba_name,full_business_address,city,state,business_zip,naic_code,naic_code_description,dba_start_date,location_end_date,administratively_closed
```

Always `$limit` — the dataset has 361,395 rows. A bare query without `$limit` defaults to 1,000 which is excessive for a lookup; cap at 5–25.

Always `$order` — without it, Socrata returns rows in unspecified physical order, which differs between requests against the same query. Use `$order=dba_start_date DESC` for "most-recent first" or `$order=:id` for a stable but arbitrary order.

**Concrete example — DBA "STARBUCKS", active only, 5 most-recently registered:**

```
https://data.sfgov.org/resource/g8m3-pdis.json
  ?$where=upper(dba_name)%20like%20%27%25STARBUCKS%25%27%20AND%20location_end_date%20IS%20NULL
  &$select=ownership_name,dba_name,full_business_address,city,state,business_zip,naic_code,naic_code_description,dba_start_date,location_end_date,administratively_closed
  &$order=dba_start_date%20DESC
  &$limit=5
```

### 3. Issue the request

```bash
browse cloud fetch "<url>"     # zero-cost evidence fetch — preferred
# or any plain HTTP client; no auth headers required.
```

Response is a JSON array. Inspect the response headers if needed:
- `X-Soda2-Fields` — authoritative column list (use this to confirm field names against API changes).
- `X-Soda2-Truth-Last-Modified` — when the dataset's underlying truth was last refreshed (typically daily ~04:00 UTC).
- `X-Soda2-Data-Out-Of-Date: false` — sanity check; if ever `true`, you're being served a stale cached view.

### 4. Shape the result

For each returned row, project into the skill's output schema:

```text
legal_name        ← ownership_name
dba               ← dba_name
address           ← `${full_business_address}, ${city}, ${state} ${business_zip}` (trim if any part null)
naics_code        ← naic_code              (null-passthrough)
naics_description ← naic_code_description  (null-passthrough — 76% null!)
status            ← administratively_closed === true ? "administratively_closed"
                    : location_end_date == null ? "active"
                    : "closed"
registration_date ← dba_start_date.slice(0, 10)   (ISO YYYY-MM-DD)
```

The result MUST validate against the Zod `OutputSchema` shipped alongside this SKILL (`output_schema.ts`).

### 5. Pagination (only if `count(*)` for the query > 5,000)

```
GET ...&$offset=<N>&$limit=5000
```

Socrata caps `$limit` at 50,000 per request. Subsequent pages use plain integer `$offset`. There is no cursor / `Link`-header pagination.

### Browser fallback

If for any reason the SODA API path is unavailable (extraordinarily rare — confirmed reachable without proxy/stealth in iter-1):

1. `browse cloud sessions create --keep-alive` (bare session — no `--verified`, no `--proxies` needed).
2. `browse open https://data.sfgov.org/resource/g8m3-pdis.json?<query> --remote --session $sid` — the JSON viewer page renders the same JSON the API returns. `browse get text body --remote --session $sid` then extracts it. This is what iter-1 fell back to after the Data Lens grid wouldn't snapshot — it worked.
3. **Do not attempt to drive the Data Lens grid UI** (`/Economy-and-Community/Registered-Business-Locations-San-Francisco/g8m3-pdis/data`). The grid renders, but `browse snapshot` repeatedly errored once the 50-row grid populated (iter-1 turns 8, 9, 11, 16, 19 — all snapshot calls after the grid appeared returned empty/error output). The `Search` box at the top right *is* a substring search across all visible columns, but the snapshot brittleness makes click-extract loops unreliable.

## Site-Specific Gotchas

- **No anti-bot, no auth, no rate-limit observed.** A bare session reaches the API and the HTML grid without 403/CAPTCHA. Do **not** enable `--verified` or `--proxies` — they add latency and cost for zero benefit.
- **`naic_code_description` is 76 % null** (88,227 / 361,395 rows populated). Treat it as optional. Most pre-2024 registrations have only the numeric `naic_code`. If a downstream consumer needs the human label and the dataset doesn't have it, resolve `naic_code` against a public NAICS table out-of-band — don't filter `naic_code_description IS NOT NULL` to "improve quality", you'll drop 76% of records.
- **`naic_code` itself is only 58 % populated** (211,240 / 361,395 rows). Self-reported business categorization is patchy across the historical registry.
- **Substring bleed on owner search:** `upper(ownership_name) like '%CHEN%'` matches `Shauchenka` (because "CHEN" is mid-word in "Shau**chen**ka"). For surname-style owner lookups, wrap with spaces (`like '% CHEN %'`) or use a tighter prefix (`like 'CHEN %'`), or post-filter on the client side. SoQL has no `\b` word-boundary primitive.
- **`administratively_closed` ≠ "closed".** It's true only for force-closures (rare). The canonical "is this location currently operating?" signal is `location_end_date IS NULL`. The `dba_end_date` column is *not* a reliable closure signal — many active locations have a `dba_end_date` matching their DBA renewal cycle.
- **`location_start_date` vs. `dba_start_date`:** `dba_start_date` is when the DBA was first registered city-wide; `location_start_date` is when *this specific physical location* under that DBA was registered. Use `dba_start_date` for "when was this business registered" (matches the user's mental model); use `location_start_date` if you need per-storefront chronology.
- **Multiple rows per business.** A single legal owner can have many `(dba_name, full_business_address)` tuples — e.g. Starbucks Corporation has 30+ active SF locations, each its own row with its own `ttxid`. There is no "head row" per business; query results should be returned as a list, not collapsed.
- **City / state on rows is the location's address, not always SF.** Many SF-registered businesses have a `city` of `South San Francisco`, `Fallbrook`, `Seattle` (mailing address), etc. If you want to constrain to physically-in-SF storefronts, add `AND upper(city) = 'SAN FRANCISCO'` to the `$where`.
- **`/data` URL redirects to `/about_data` on the Data Lens viewer.** Clicking the "Data" tab from the about page does load the grid (verified — see `screenshots/04-data-grid-rendered.png`), but the redirect chain makes URL-direct navigation to the grid unreliable. Use the API.
- **`browse snapshot` truncation on populated grid.** Once the Data Lens grid populates 50 rows × ~30 columns of cells, the accessibility tree balloons and `browse snapshot` returns empty/error output in this sandbox (iter-1 turns 8, 9, 11, 16, 19). The grid is *visible* in screenshots but not extractable via snapshot refs. Stick to the JSON API.
- **`/resource/g8m3-pdis.json` requires URL-encoded `$where`.** Single quotes around string literals (`'%STARBUCKS%'`) must be `%27...%27`-encoded when passing through `browse cloud fetch` / `browse open` — bare `'` characters get mangled by shell parsing. Spaces in SoQL operators (`like`, `IS NULL`, `AND`) must be `%20`-encoded.
- **Don't bother with the SF.gov "Business search" tool** (`https://www.sfgov.org/opendatabase/business-search`) — it's a Drupal wrapper around the same dataset and adds latency.
- **App token (`$$app_token`) not required for this volume.** Socrata throttles aggressive unauthenticated clients to ~1,000 req/hour. For lookup-style use (1–N queries per task) you do not need an app token. If integrating into a high-volume product, register one at `https://data.sfgov.org/profile/edit/developer_settings` and pass `&$$app_token=<token>`.

## Expected Output

```json
{
  "success": true,
  "query": {
    "field": "dba_name",
    "value": "STARBUCKS",
    "active_only": true
  },
  "result_count": 5,
  "data_as_of": "2026-05-22T00:00:00.000",
  "results": [
    {
      "legal_name": "Starbucks Corporation",
      "dba": "Starbucks Coffee #593",
      "address": "60 Spear St 700, San Francisco, CA 94105",
      "naics_code": "722515",
      "naics_description": null,
      "status": "active",
      "registration_date": "1992-03-03"
    },
    {
      "legal_name": "Starbucks Corporation",
      "dba": "Starbucks Coffee#79950",
      "address": "90 Charter Oak Ave, San Francisco, CA 94124",
      "naics_code": "722515",
      "naics_description": null,
      "status": "active",
      "registration_date": "1992-03-03"
    }
  ]
}
```

**Outcome variants:**

- **No matches.** `success: true`, `result_count: 0`, `results: []`. This is a valid outcome (e.g. searching for a business that is not registered in SF) — not an error.
- **Owner search.** `query.field: "ownership_name"` instead of `"dba_name"`. Same results shape; expect a wider variance in `dba` values per row when one owner has multiple storefronts.
- **Status branches:**
  - `"active"` — `location_end_date IS NULL` and `administratively_closed === false`.
  - `"closed"` — `location_end_date IS NOT NULL` (registration ended normally).
  - `"administratively_closed"` — `administratively_closed === true` (rare, force-closure).
- **Sparse NAICS.** ~76 % of returned rows will have `naics_description: null`; ~42 % will have `naics_code: null`. Both are expected, not errors.
- **API hard error** (column typo, malformed SoQL, network failure). `success: false`, `error_reasoning: "<Socrata error message>"`, `results: []`. The Socrata error body is structurally `{"message": "...", "code": "query.soql.no-such-column", ...}` — extract `.message` for `error_reasoning`.

```json
{
  "success": false,
  "query": { "field": "dba_name", "value": "STARBUCKS", "active_only": true },
  "result_count": 0,
  "data_as_of": null,
  "results": [],
  "error_reasoning": "Query coordinator error: query.soql.no-such-column; No such column: naics_code (suggested: 'naic_code')"
}
```
