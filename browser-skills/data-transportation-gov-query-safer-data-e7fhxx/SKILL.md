---
name: data-transportation-gov-query-safer-data-e7fhxx
title: Query and Extract SAFER Data
description: >-
  Extract the FMCSA SAFER (Safety and Fitness Electronic Records) Company
  Snapshot for a motor carrier by USDOT number, MC/MX number, or name —
  returning identity, operating authority, fleet size, inspection/out-of-service
  summary, crash totals, and safety rating. Read-only.
website: data.transportation.gov
category: transportation
tags:
  - fmcsa
  - safer
  - trucking
  - motor-carrier
  - safety
  - read-only
source: 'browserbase: agent-runtime 2026-06-08'
updated: '2026-06-08'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      A headless browser renders the same Company Snapshot tables (snapshot
      returns ~745 a11y refs) and is a reliable fallback, but it is
      ~unnecessary: the page is fully server-rendered static HTML, so a single
      JS-less HTTP GET returns identical data at a fraction of the cost.
  - method: api
    rationale: >-
      data.transportation.gov is a Socrata portal with a SODA API, but it hosts
      NO queryable SAFER dataset — every SAFER catalog entry is an external
      'href' link to safer.fmcsa.dot.gov. The Socrata catalog API is only useful
      for discovering those link entries, not for the data itself.
verified: false
proxies: false
---
# Query and Extract SAFER Data

## Purpose

Extract a motor carrier's **SAFER Company Snapshot** — the FMCSA Safety and Fitness Electronic Records summary — given a USDOT number, MC/MX docket number, or company name. Returns carrier identity (legal/DBA name, address, phone, DUNS), USDOT status, operating-authority status, MC/MX numbers, fleet size (power units, drivers), MCS-150 update date/mileage, operation classification & cargo carried, a 24-month US/Canada roadside inspection + out-of-service summary, 24-month crash totals (fatal/injury/tow), and the carrier's safety rating. **Read-only** — it only queries and reads; it never submits MCS-150 updates, orders fee-based Company Safety Profiles, or files DataQs challenges.

Important honesty note: `data.transportation.gov` is the requested anchor domain, but it does **not** host the SAFER data as a dataset. Every SAFER entry in its Socrata catalog is an external-link ("href") landing page that points at the live FMCSA SAFER system on `safer.fmcsa.dot.gov`. The actual query and extraction happen there.

## When to Use

- Look up a single carrier's safety/identity record by USDOT#, MC/MX#, or name (broker/shipper carrier vetting, freight onboarding, compliance checks).
- Pull the out-of-service inspection summary and crash counts for a carrier.
- Confirm a carrier's USDOT operating status (ACTIVE / INACTIVE / OUT-OF-SERVICE) and operating authority.
- Resolve a carrier name to its USDOT number when only the name is known.
- Anywhere you'd otherwise scrape the SAFER web UI — a single HTTP GET returns the full snapshot as static HTML.

## Workflow

The optimal path is a **single JS-less HTTP GET** against `safer.fmcsa.dot.gov/query.asp`. The Company Snapshot page is fully **server-rendered static HTML** — all data lives in HTML tables, so no browser, JavaScript execution, cookies, session state, or anti-bot stealth is required (verified: a bare `browse cloud fetch` with no `--proxies`/`--verified` returns the complete record; the "This page requires scripting to be enabled" banner is just a fallback message and does not gate the data). A residential proxy is **not** required.

1. **(Optional) Discover the SAFER entry points from data.transportation.gov.** The Socrata catalog API lists them:
   ```
   GET https://data.transportation.gov/api/catalog/v1?q=SAFER&domains=data.transportation.gov&search_context=data.transportation.gov&limit=40
   ```
   Each `results[].resource` has `type: "href"` and `backend: "not_a_dataset"`; the external target is in the view metadata (`GET https://data.transportation.gov/api/views/<id>.json` → `metadata.accessPoints["text/html"]`). Known targets:
   - `4kcp-cfmm` → `https://safer.fmcsa.dot.gov/CompanySnapshot.aspx` (Company Snapshot — the main data surface)
   - `ktzy-94pf` / `xean-25kh` → `https://safer.fmcsa.dot.gov/` (SAFER front page)
   - `rj9z-7m2d` → `https://safer.fmcsa.dot.gov/CSP_Order.asp` (fee-based Company Safety Profile order)
   - `7tvk-w6cf` → `https://li-public.fmcsa.dot.gov/...prc_oos_search` (Out-of-Service order search)
   - `cvr3-j8yp` / `ycdf-ukwt` → Cargo Tank Facility records

   You can skip this step entirely and go straight to step 2 — the query endpoint below is stable.

2. **Query the Company Snapshot.** Pick the search mode that matches your input:

   - **By USDOT number** (deterministic, preferred — one carrier, direct result):
     ```
     GET https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=<USDOT#>
     ```
   - **By MC/MX docket number** (resolves to the carrier's USDOT snapshot — pass the numeric part only, no "MC-" prefix):
     ```
     GET https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=MC_MX&query_string=<docket#>
     ```
   - **By name** (returns a multi-result list — see step 3):
     ```
     GET https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=NAME&query_string=<name>
     ```

3. **Handle the NAME-search redirect.** A NAME query returns `302 → keywordx.asp?searchstring=*<NAME>*&SEARCHTYPE=` (note the wildcard `*` wrapping). Fetch that URL; it returns a "Select Company" page listing candidate carriers. Each candidate is an `<a href="query.asp?...&query_param=USDOT&query_string=<USDOT#>...">CARRIER/DBA NAME</a>` row paired with a `LOCATION` cell (City, ST). Pick the intended carrier (disambiguate by location) and follow its `query.asp` USDOT link to land on the snapshot. If you can't disambiguate, return the candidate list rather than guessing.

4. **Detect "not found".** A USDOT/MC query for a non-existent record returns `HTTP 200` with a short page containing **"RECORD NOT FOUND"** / "No records matching ... were found in the SAFER database." Branch to the not-found output shape.

5. **Parse the snapshot tables.** From the returned HTML extract the fields below. Reliable text anchors (label cells end in `:`):
   - **USDOT INFORMATION**: `Entity Type:`, `USDOT Status:`, `Out of Service Date:`, `USDOT Number:`, `MCS-150 Form Date:`, `MCS-150 Mileage (Year):`
   - **OPERATING AUTHORITY**: `Operating Authority Status:`, `MC/MX/FF Number(s):`
   - **COMPANY INFORMATION**: `Legal Name:`, `DBA Name:`, `Physical Address:`, `Phone:`, `Mailing Address:`, `DUNS Number:`, `Power Units:`, `Drivers:`
   - **Operation Classification / Carrier Operation / Cargo Carried**: each checkbox row marked `X` indicates a selected category.
   - **Inspections (US, 24 months)**: a table with rows `Inspections`, `Out of Service`, `Out of Service %`, `Nat'l Average %` across columns `Vehicle | Driver | Hazmat | IEP`, plus `Total Inspections:` and `Total IEP Inspections:`.
   - **Crashes (US, 24 months)**: row `Crashes:` across columns `Fatal | Injury | Tow | Total`.
   - **Canada Inspections/Crashes**: same shape under the Canada section (often all zeros for US-only carriers).
   - **Safety Rating**: `Rating`, `Rating Date`, `Review Date` (e.g. "Satisfactory", "08/03/1999", "02/17/2026"). Many carriers show no rating ("None"/"Not Rated").
   - The page also states the data currency: "The information below reflects the content of the FMCSA management information systems as of MM/DD/YYYY."

### Browser fallback

If the HTTP path is ever blocked or the HTML layout changes, drive a browser to the same `query.asp` URL — no stealth needed:
```bash
sid=$(browse cloud sessions create --keep-alive | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
browse open "https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=21800" --remote --session "$sid"
browse wait load --remote --session "$sid"
browse snapshot --remote --session "$sid"      # ~745 a11y refs; same data as the raw HTML
browse cloud sessions update "$sid" --status REQUEST_RELEASE
```
This costs ~$0.09 / 4 turns and returns identical values — use it only as a fallback; the GET is strictly cheaper.

## Site-Specific Gotchas

- **data.transportation.gov hosts NO SAFER dataset.** Every SAFER catalog entry is `type: "href"` / `backend: "not_a_dataset"` — an external link to `safer.fmcsa.dot.gov`. Do **not** try `GET https://data.transportation.gov/resource/<id>.json` (SODA) for SAFER data; there is none. The Socrata catalog API is only useful to *discover* the external link targets.
- **The "requires scripting" banner is a red herring.** Despite the page printing "This page requires scripting to be enabled," the actual Company Snapshot tables are server-rendered static HTML present in the raw response. A JS-less `browse cloud fetch` returns the full record. Don't reach for a JS-rendering browser unless the raw fetch fails.
- **No anti-bot, no proxy, no auth.** Verified against the host pre-run probe (none detected) and direct fetches: plain GETs succeed with no cookies, stealth, or residential proxy. Keep `verified: false` / `proxies: false`.
- **NAME search 302-redirects with wildcard wrapping.** `query_param=NAME` redirects to `keywordx.asp?searchstring=*<NAME>*&SEARCHTYPE=` — the `*…*` wildcard is added automatically. The result is a *list* (often hundreds of rows for common surnames), not a single snapshot. Always disambiguate by the `LOCATION` (City, ST) column before following a row's USDOT link.
- **MC/MX queries take the numeric docket only.** Pass `query_string=115495`, not `MC-115495`. The snapshot resolves to and displays the carrier's USDOT number.
- **"Record Not Found" is HTTP 200, not 404.** Detect the literal "RECORD NOT FOUND" / "No records matching" text; don't rely on status code.
- **`http://` vs `https://`.** The catalog stores the legacy `http://safer.fmcsa.dot.gov/...` scheme; the site serves fine over `https://` — prefer `https`.
- **Data currency lags.** SAFER reflects the monthly MIS snapshot; the page states its "as of" date. Inspection/crash counts are rolling 24-month windows. National-average OOS rates carry their own "as of" date (e.g. 05/15/2026).
- **Total ≠ sum of parts.** The page explicitly warns total inspections may be less than vehicle+driver+hazmat (an inspection can span multiple types). Don't recompute totals from the columns.
- **Fee/auth-walled surfaces (do not attempt for free extraction):** the Company Safety Profile (`CSP_Order.asp`) is a paid order, and Licensing & Insurance details are often shown as "Currently Unavailable" on the snapshot. SMS (Safety Measurement System) results live on a separate FMCSA site (csa.fmcsa.dot.gov), not in the snapshot.

## Expected Output

Carrier found (USDOT/MC query, or a resolved NAME pick):
```json
{
  "success": true,
  "query": { "param": "USDOT", "value": "21800" },
  "data_as_of": "06/07/2026",
  "usdot_number": "21800",
  "legal_name": "UNITED PARCEL SERVICE INC",
  "dba_name": "UPS",
  "entity_type": "CARRIER",
  "usdot_status": "ACTIVE",
  "out_of_service_date": null,
  "operating_authority_status": "AUTHORIZED FOR Property",
  "mc_mx_numbers": ["MC-115495", "MC-116200"],
  "physical_address": "55 GLENLAKE PARKWAY NE, ATLANTA, GA 30328",
  "phone": "(404) 828-2525",
  "duns_number": "17-568-9926",
  "power_units": 112321,
  "drivers": 128806,
  "mcs_150_form_date": "02/16/2026",
  "mcs_150_mileage": "3,221,711,602 (2025)",
  "us_inspections": {
    "total": 18882,
    "vehicle": { "inspections": 11814, "out_of_service": 1461, "oos_pct": 12.4 },
    "driver":  { "inspections": 18595, "out_of_service": 163,  "oos_pct": 0.9 },
    "hazmat":  { "inspections": 258,   "out_of_service": 4,    "oos_pct": 1.6 }
  },
  "us_crashes": { "fatal": 47, "injury": 802, "tow": 1413, "total": 2262 },
  "canada_inspections": { "total": 5, "vehicle_oos": 0, "driver_oos": 0 },
  "canada_crashes": { "fatal": 0, "injury": 0, "tow": 0, "total": 0 },
  "safety_rating": "Satisfactory",
  "safety_rating_date": "08/03/1999",
  "safety_review_date": "02/17/2026",
  "error_reasoning": null
}
```

Record not found:
```json
{
  "success": false,
  "query": { "param": "USDOT", "value": "999999999" },
  "error_reasoning": "RECORD NOT FOUND — No records matching USDOT Number = 999999999 were found in the SAFER database."
}
```

Ambiguous NAME search (multiple candidates — return the list, do not guess):
```json
{
  "success": false,
  "query": { "param": "NAME", "value": "SCHNEIDER" },
  "error_reasoning": "ambiguous_name",
  "candidates": [
    { "name": "AL J SCHNEIDER COMPANY", "location": "MILWAUKEE, WI", "usdot_number": "123907" },
    { "name": "A- SCHNEIDER CONSTRUCTION LLC", "location": "CADOTT, WI", "usdot_number": "1261876" }
  ]
}
```
