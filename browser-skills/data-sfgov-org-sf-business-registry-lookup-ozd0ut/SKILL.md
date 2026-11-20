---
name: data-sfgov-org-sf-business-registry-lookup-ozd0ut
title: SF Registered Business Registry Lookup
description: >-
  Search San Francisco's registered business registry (DataSF g8m3-pdis) by DBA
  name or owner via the public Socrata SODA API and return each location's
  legal/owner name, DBA, address, NAICS code, status, and registration date.
website: data.sfgov.org
category: government-data
tags:
  - government-data
  - san-francisco
  - business-registry
  - socrata
  - open-data
  - lookup
  - naics
source: 'browserbase: agent-runtime 2026-06-03'
updated: '2026-06-03'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      The DataSF data-grid UI (click the 'Data' tab, type into the grid search
      box) does full-text search equivalent to the API's $q. Use only when the
      SODA API is unreachable — it's heavy JS (46+ XHRs), slower, and snapshots
      can be flaky mid-render.
  - method: fetch
    rationale: >-
      The SODA endpoint is a plain HTTPS GET returning JSON; any HTTP client
      (curl/fetch) works identically to the recommended 'api' path with no auth
      or proxy.
verified: false
proxies: false
---
# SF Registered Business Registry Lookup

## Purpose

Look up businesses in San Francisco's official tax registry by **DBA name** or **owner/legal name** and return each matching location's registry record: legal/owner name, DBA, full address, NAICS code + description, status (active / closed / administratively closed), and registration (business start) date. Backed by the City & County of San Francisco "Registered Business Locations - San Francisco" open dataset (`g8m3-pdis`, ~362,000 rows, refreshed daily). **Read-only** — this only queries public open data; it never writes or registers anything.

## When to Use

- Verify whether a business is registered with the SF Treasurer & Tax Collector and whether it's currently active.
- Resolve a DBA / trade name to its registered legal owner (and vice-versa).
- Pull a business's NAICS classification, registered address(es), and registration date for due-diligence, enrichment, or compliance checks.
- Enumerate all locations of a multi-location business (each location is a separate row sharing one Business Account Number).
- Anywhere you'd otherwise scrape the DataSF data-grid UI — the SODA API is faster, cheaper, and structurally reliable.

## Workflow

data.sfgov.org is a **Socrata** open-data portal. The data-grid web UI is a thin, JS-heavy client over a public **SODA (Socrata Open Data API)** endpoint. Query the API directly — it needs **no auth, no API token/app-token, no cookies, no residential proxy, and no anti-bot stealth** (a bare GET returns `200`). The browser grid (documented as a fallback at the end) loads 46+ XHRs and is meaningfully slower for no benefit.

**Base endpoint:** `https://data.sfgov.org/resource/g8m3-pdis.json`

1. **Pick a search mode** and build a SoQL query:

   - **DBA name (substring, case-insensitive)** — the most common case:
     ```
     GET /resource/g8m3-pdis.json
        ?$where=upper(dba_name) like '%PHILZ COFFEE%'
        &$limit=200
     ```
   - **Owner / legal name (substring, case-insensitive)**:
     ```
     ?$where=upper(ownership_name) like '%STARBUCKS%'&$limit=200
     ```
   - **Free-text across all columns** (use when you don't know if the term is a DBA or owner): `?$q=Philz Coffee&$limit=200`. This is what the grid's search box does.
   - **Exact DBA match** (fast equality, *case-sensitive*): `?dba_name=Philz Coffee` as a simple query param.

   URL-encode the whole `$where` value. SoQL string literals use single quotes; escape an embedded apostrophe by doubling it (`O''Reilly`).

2. **Trim the payload with `$select`** (optional but recommended) to just the fields you need:
   ```
   &$select=certificate_number,ownership_name,dba_name,full_business_address,city,state,business_zip,naic_code,naic_code_description,dba_start_date,dba_end_date,location_end_date,administratively_closed
   ```
   A `$select` referencing a column that doesn't exist returns **HTTP 400** (a JSON error *object*, not an array) — use the exact `fieldName`s in Expected Output below.

3. **Filter to active records** (optional). A row is **active** when it has no end date and is not administratively closed:
   ```
   &$where=... AND dba_end_date IS NULL AND location_end_date IS NULL AND administratively_closed IS NULL
   ```

4. **Parse the JSON array.** Each element is one business *location*. Map fields:
   - `ownership_name` → registered owner / legal name
   - `dba_name` → DBA / trade name
   - `full_business_address` + `city` + `state` + `business_zip` → address
   - `naic_code` + `naic_code_description` → NAICS
   - `dba_start_date` → registration date (ISO `YYYY-MM-DDT00:00:00.000`; take the date part)
   - **status**: `administratively_closed` present → `administratively_closed`; else `dba_end_date` or `location_end_date` present → `closed`; else `active`

5. **Handle multiplicity.** A single business commonly returns many rows — one per location and per registration period — all sharing the same `certificate_number` (Business Account Number). De-duplicate on `certificate_number` if you want one row per business, or keep all rows to enumerate locations.

6. **Paginate** if `$limit` is hit: append `&$offset=N` (default page size is 1000). For exact counts, query `?$select=count(*)&$where=...`.

### Browser fallback

Only if the API is unreachable. Open `https://data.sfgov.org/Economy-and-Community/Registered-Business-Locations-San-Francisco/g8m3-pdis/about_data`, click the **"Data"** tab (the `/data` URL itself redirects to the About tab), wait for the grid to render, type the query into the grid's **Search** box (top-right) and press Enter. The grid does full-text matching (equivalent to `$q`) and shows a result count ("1 to 27 of 27"). Read values from the row cells. Note: the grid is heavy JS and accessibility snapshots can be flaky mid-render — wait for the row count to settle before extracting. Under the hood the grid calls the internal `https://data.sfgov.org/api/v3/views/g8m3-pdis/query.json` SoQL endpoint; the public `/resource/g8m3-pdis.json` path above is the stable equivalent.

## Site-Specific Gotchas

- **No proxy / no stealth needed.** The SODA API returned `200` from a bare (no-proxy) request. Don't waste a residential proxy or `--verified` session on it. An app token is optional and only raises rate limits.
- **`ownership_name` is the owner *and* the legal name.** This dataset has no separate "legal entity name" column distinct from the owner — `ownership_name` (e.g. "Philz Coffee Inc", "Greg Matt Inc") serves as both. `dba_name` is the trade name (e.g. "Philz Coffee", "Philz Coffee Truck").
- **Multiple rows per business is normal.** Each *location* is its own row; one business (one `certificate_number`) can have dozens of rows. "Philz Coffee" returns 27 rows across owners "Philz Coffee Inc" and "Greg Matt Inc" (a franchise/truck operator). De-dupe on `certificate_number` if you need one record per business.
- **Status is derived from three columns, not one.** `administratively_closed` holds the literal string `"***Administratively Closed"` (note the `***` prefix) for ~42,775 rows, or is absent/NULL for the ~319,170 others. Per the dataset docs, "Administratively Closed" means the business hasn't filed/communicated with the Tax Collector for 3 years (or was flagged closed by another City dept). Separately, `dba_end_date` marks the business as ended and `location_end_date` marks a *specific location* closed (the business may still be active elsewhere). There is no single boolean "active" field — compute it.
- **Don't filter `administratively_closed != 'Yes'`.** The value is never "Yes"; it's `"***Administratively Closed"` or NULL. Filter with `administratively_closed IS NULL` for active-only.
- **`$select` of a non-existent column 400s.** A generated query that selects `street_address` (wrong) instead of `full_business_address` (correct) returns an HTTP 400 JSON error object, which then fails `Array.isArray()`. Use the exact field names. Other easy-to-get-wrong names: registration date is `dba_start_date` (not `business_start_date`); ZIP is `business_zip` (not `source_zipcode`/`zip_code`).
- **`naic_code_description` can be empty** for some rows even when `naic_code` is present. Don't assume both are populated.
- **Exact-match `dba_name=` query param is case-sensitive**; SoQL `$where ... like` is not (when wrapped in `upper()`). Prefer the `upper(...) like '%...%'` form for user-supplied queries.
- **`$q` full-text matches across all columns**, so it can return owner-name hits when you intended a DBA search (and vice-versa). For precise DBA-only or owner-only results, use a column-scoped `$where`.
- **Dates are floating timestamps** returned as `YYYY-MM-DDT00:00:00.000` (no timezone). Split on `T` for the calendar date.
- **`/data` URL redirects to the About tab.** In the browser fallback you must click the "Data" tab to reach the grid; landing on `/data` shows the dataset description, not rows.
- **Dataset scope is broader than "San Francisco".** Despite the title, `full_business_address`/`city` can be outside SF (e.g. "Palo Alto", "Seattle") — these are SF-registered taxpayers whose physical/mailing location is elsewhere. Filter on `city` if you need SF-only locations.

## Expected Output

A list of matched business locations. Example for a DBA search `dba_name like '%PHILZ COFFEE%'`:

```json
{
  "query": { "mode": "dba_name", "term": "Philz Coffee" },
  "total_matches": 27,
  "results": [
    {
      "certificate_number": "0415140",
      "legal_name": "Philz Coffee Inc",
      "dba_name": "Philz Coffee",
      "address": "549 Castro St, San Francisco, CA 94114",
      "naics_code": "722515",
      "naics_description": "Limited-service restaurants",
      "status": "active",
      "registration_date": "2007-04-01"
    },
    {
      "certificate_number": "0484044",
      "legal_name": "Greg Matt Inc",
      "dba_name": "Philz Coffee Truck",
      "address": "500 Marina Blvd, San Francisco, CA 94123",
      "naics_code": "722330",
      "naics_description": "Mobile food services",
      "status": "active",
      "registration_date": "2013-10-18"
    }
  ]
}
```

A closed / administratively-closed location:

```json
{
  "certificate_number": "0123456",
  "legal_name": "Example Holdings LLC",
  "dba_name": "Old Corner Store",
  "address": "100 Market St, San Francisco, CA 94105",
  "naics_code": "445110",
  "naics_description": "Supermarkets and other grocery (except convenience) stores",
  "status": "administratively_closed",
  "registration_date": "2009-06-15",
  "dba_end_date": null,
  "location_end_date": "2018-03-07"
}
```

No matches:

```json
{
  "query": { "mode": "dba_name", "term": "Nonexistent Biz Xyz" },
  "total_matches": 0,
  "results": []
}
```
