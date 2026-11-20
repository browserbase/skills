---
name: data-sfgov-org-sf-business-registry-lookup-vzlhtr
title: SF Business Registry Lookup
description: >-
  Search the San Francisco Registered Business Locations dataset on
  data.sfgov.org by DBA or owner name and return legal entity, DBA, address,
  NAICS, status (active/closed/admin-closed), and registration date. API-first
  via the Socrata SoQL endpoint with Lookup-story browser fallback.
website: data.sfgov.org
category: government
tags:
  - government
  - open-data
  - business-registry
  - socrata
  - san-francisco
  - lookup
  - read-only
source: 'browserbase: agent-runtime 2026-05-23'
updated: '2026-05-23'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      Fallback to the Registered Business Lookup story
      (data.sfgov.org/stories/s/k6sk-2y6w) or the Data Lens grid
      (/g8m3-pdis/data_preview) — same data, ~50x slower, only useful if the
      SoQL API is unreachable or rate-limited. Stagehand CUA-style `act()`
      instructions drive the filter dropdowns reliably.
verified: true
proxies: true
---
# SF Business Registry Lookup — DataSF

## Purpose

Search the City and County of San Francisco's **Registered Business Locations** dataset on `data.sfgov.org` by DBA name OR owner/ownership name (substring match supported), and return the canonical record for each matching business location: legal/ownership name, DBA name, full address, NAICS code + description, status (active / closed / administratively closed), and registration date. The dataset has ~361,000 rows refreshed daily by the SF Treasurer-Tax Collector. Read-only — never edits or files updates.

## When to Use

- Looking up a specific SF business by storefront/brand name ("Blue Bottle Coffee", "Tartine") or by owner/parent entity ("Twitter Inc").
- Verifying whether a business is currently active, administratively closed, or has ceased operating at a given location.
- Bulk enrichment: given a list of SF business names, hydrate each with its registered legal entity, address, NAICS, and registration history.
- Cross-checking a Business Account Number (BAN / `certificate_number`) against the public registry.
- Replaces ad-hoc scraping of the Treasurer-Tax Collector site — this dataset is the authoritative source the city publishes.

## Workflow

### Recommended: Socrata SoQL JSON API

`data.sfgov.org` is a Socrata Open Data portal. The Registered Business Locations dataset (`g8m3-pdis`) is exposed as a fully open SoQL JSON endpoint — **no auth, no cookies, no anti-bot, no rate-limit ceremony**. A residential proxy is **not** required. Lead with the API; the browser path is fallback-only and pays a ~50× cost premium.

1. **Pick a query strategy** based on what the user gave you.

   | User input | SoQL clause |
   |---|---|
   | DBA name or owner — fuzzy / unknown which field | `$q=Blue+Bottle+Coffee` (global full-text — searches every text column) |
   | DBA exact or substring | `$where=upper(dba_name) like '%BLUE BOTTLE%'` |
   | Owner exact or substring | `$where=upper(ownership_name) like '%TWITTER%'` |
   | Business Account Number | `$where=certificate_number='1021127'` |
   | DBA OR owner combined | `$where=upper(dba_name) like '%X%' OR upper(ownership_name) like '%X%'` |
   | Active only | append `AND administratively_closed IS NULL AND location_end_date IS NULL` |
   | In SF only (excl. out-of-county mailing) | append `AND city='San Francisco'` |

   `$q` is preferred for "DBA or owner" intent because it matches across `dba_name`, `ownership_name`, `full_business_address`, `naic_code_description`, and every other text column in one shot — no need for `OR` chains.

2. **GET the JSON.**
   ```
   GET https://data.sfgov.org/resource/g8m3-pdis.json
       ?$q={query}
       &$select=uniqueid,certificate_number,ownership_name,dba_name,full_business_address,city,state,business_zip,naic_code,naic_code_description,naics_code_descriptions_list,dba_start_date,location_start_date,location_end_date,administratively_closed
       &$order=location_start_date DESC
       &$limit=25
   ```
   No headers required. Response is `application/json` — a top-level array. Empty result = `[]` (use this as the "not found" signal). Default page size is 1,000; max is 50,000 per request. Add `&$offset=N` for pagination.

3. **Derive status** for each row (the dataset does not store a single "status" column — you compute it):
   - `administratively_closed === "***Administratively Closed"` → **"administratively_closed"** (TTX flagged the business as 3+ years dormant / closed by another department).
   - else if `location_end_date` is set and ≤ today → **"closed"**.
   - else → **"active"**.

4. **Derive registration_date**:
   - `dba_start_date` — the date the *business* (DBA) was first registered with SF TTX. Stable across location moves.
   - `location_start_date` — the date this *specific physical location* was registered. Use this if the user is asking about the storefront, not the business.
   - Prefer `dba_start_date` as the canonical "registration date" unless the user explicitly asks about a location/store opening.

5. **Shape the output** per the Expected Output schema below — one row per matching business location (a single business may appear N times across N addresses, each row a `(ownership_name, dba_name, full_business_address)` tuple). Validate with the Zod schema before returning.

### Browser fallback

Use only if the API is unreachable. Two browser UIs exist; pick by intent.

**A. Registered Business Lookup story (recommended for human-driven lookups)** — the canonical UI promoted on the dataset's About tab as "Business Account Number lookup tool":
```
https://data.sfgov.org/stories/s/Registered-Business-Lookup/k6sk-2y6w
```
- Four primary filter dropdowns at the top: **Ownership Name**, **DBA Name**, **Street Address**, **Business Account Number**. A "More" button reveals additional filters (NAICS, dates, etc.).
- Each dropdown is a **discrete-value picker**: click the dropdown → type a substring into "Search values" → check the matching distinct values → click "Apply". Multi-select within a column is OR; across columns is AND.
- The default operator is `is` (exact value match). Click the `is ⌄` chevron to switch to `contains` / `starts with` / etc. — needed for fuzzy lookups.
- Results render in the grid below the filters (Ownership Name, DBA Name, BAN, Location Id, Street Address, Location Start Date, Location End Date). Scroll horizontally for more columns, or click the "Columns" tab on the right to add NAICS/dates.
- **Filter state does NOT serialize to the URL** — you cannot share a pre-filtered link. To programmatically reach a filtered state, drive the UI each time.

**B. Data Lens grid** — for free-text search across all columns:
```
https://data.sfgov.org/Economy-and-Community/Registered-Business-Locations-San-Francisco/g8m3-pdis/data_preview
```
- Top-right search box filters across all columns (equivalent to API `$q`).
- Pure data grid — no map, no story chrome.
- Note: `/g8m3-pdis/data` 301-redirects to `/about_data`. Use `/data_preview` to land directly on the grid.

In both browser paths, extract the same fields listed under "Expected Output" by reading the grid cells. The Stagehand CUA flow (`page.act("filter DBA Name to contain 'Blue Bottle'")` → `page.extract({…})`) is the cleanest implementation; see `script.stagehand.ts` in this skill bundle.

## Site-Specific Gotchas

- **`administratively_closed` is a TEXT field, not a boolean** — despite the API metadata header `X-Soda2-Types` declaring it `"boolean"`. The two observed values are `"***Administratively Closed"` (42,776 rows) and SQL NULL (318,619 rows). `WHERE administratively_closed = TRUE` throws `query.soql.type-mismatch` ("Type mismatch for op$=, is boolean"). **Always compare against the literal string** `'***Administratively Closed'`, or use `IS NULL` / `IS NOT NULL`. This is the single biggest trap in the dataset's schema.
- **Three NAICS-related columns, all carrying overlapping data** — `naic_code` (raw code, can be a 6-digit code like `722515` *or* a range like `2300-2399` for "Multiple"), `naic_code_description` (a single description, often the literal `"Multiple"` when the business has more than one NAICS), and `naics_code_descriptions_list` (semicolon-separated list of all matching descriptions). For human display, prefer `naics_code_descriptions_list`; for machine joins, prefer `naic_code`. Don't assume `naic_code` is always 6 digits.
- **Dataset includes businesses with addresses OUTSIDE San Francisco** — businesses registered with SF TTX often have out-of-county or out-of-state physical addresses (corporate HQ, warehouses, etc.). The dataset is "businesses that pay SF taxes", not "businesses located in SF". If the caller wants only SF storefronts, filter by `city='San Francisco'` AND `state='CA'`. Don't conflate `business_zip` starting with `941` with "in SF" — many SF businesses use mailing-only zips for actual locations elsewhere.
- **"DBA" can legitimately be the same as the legal name** — when `ownership_name === dba_name` (very common for sole proprietors and small LLCs), the business is filing under its registered legal name without an alternate DBA. Don't treat this as missing data.
- **One business → many rows** — each row is a `(business, location)` tuple. A multi-location business (Blue Bottle Coffee, Starbucks, etc.) appears N times — once per registered address. The `certificate_number` (BAN) is the join key for "same business". The `uniqueid` is per-location and uses the format `{ttxid}-{certificate_number}`.
- **Date fields are floating timestamps with time always `T00:00:00.000`** — parse the date portion only. `dba_start_date` is the business-registration date (stable across location changes); `location_start_date` is when *this specific address* was registered. Either may be null. `dba_end_date` and `location_end_date` mark closures.
- **Status semantics — closed by date vs administratively closed**: 233K rows have a `location_end_date`, but only 42K have `administratively_closed='***Administratively Closed'`. A row with a past `location_end_date` AND no admin-closed flag means the business *voluntarily* closed that location (filed a closure form). With the admin-closed flag, TTX shuttered them after 3+ years of silence. Treat these as semantically distinct.
- **2014 system-migration cutoff**: only businesses active in 2014 were carried over from the legacy system, so the dataset has near-zero records for businesses that closed before 2014. Treat dataset absence as "not registered after 2014" rather than "never existed".
- **2018 cleanup created a ~40K-row spike of admin closures** — many rows show `administratively_closed='***Administratively Closed'` with `location_end_date='2018-06-30'`. This is the TTX 2018 mass-cleanup of dormant accounts, not a real-world closure event. Don't infer that "thousands of businesses closed on 2018-06-30".
- **`$q` global full-text DOES use stemming / partial matches** — `$q=Blue+Bottle` matches `Blue Bottle Coffee`, `Blue Bottle Coffee Inc`, `Blue Bottle Coffee LLC`, `Blue Bottle Ferry Building`. To force exact phrase, wrap in double quotes: `$q="Blue Bottle Coffee"`. Quoted-phrase `$q` does NOT match across word boundaries — useful for disambiguation.
- **Browser Lookup story filters don't push to URL** — the four-dropdown UI on `/stories/s/k6sk-2y6w` keeps filter state in-memory; the URL is the same whether 0 or 5 filters are applied. Don't try to construct a pre-filtered link; drive the UI each time.
- **Dataset URL has TWO paths for the grid** — `/g8m3-pdis/data` redirects to `/g8m3-pdis/about_data` (the metadata/About tab), and the actual grid lives at `/g8m3-pdis/data_preview`. The "Data" tab on the About page also navigates to `/data_preview`. If you direct-link to `/data` expecting the grid, you'll land on About and need an extra click — point to `/data_preview` instead.
- **Dataset metadata says `is_self_service: Yes` and the Socrata Open Data Commons license applies** — you can hit the API unauthenticated as much as Socrata's shared-tenant rate limit allows. App tokens (`X-App-Token`) are optional and only matter if you want a higher per-app throughput cap.
- **Out-of-band shortcut — the BAN lookup tool** — the dataset About tab links to a `Business Account Number lookup tool` (`stories/s/k6sk-2y6w`). This is the same Lookup story as path A above, just rebranded for taxpayers looking up their own BAN. Don't be misled into thinking it's a separate endpoint.

## Expected Output

```json
{
  "success": true,
  "query": "Blue Bottle Coffee",
  "query_field": "any",
  "match_count": 6,
  "results": [
    {
      "uniqueid": "1266629-01-211-1021127",
      "certificate_number": "1021127",
      "ownership_name": "Blue Bottle Coffee Inc",
      "dba_name": "Blue Bottle Coffee Inc",
      "address": {
        "street": "1385 4th St",
        "city": "San Francisco",
        "state": "CA",
        "zip": "94158"
      },
      "naics": {
        "code": "722515",
        "description": "Snack and Nonalcoholic Beverage Bars"
      },
      "status": "active",
      "registration_date": "2015-11-20",
      "location_start_date": "2021-01-06",
      "location_end_date": null
    },
    {
      "uniqueid": "1397185-08-251-1173416",
      "certificate_number": "1173416",
      "ownership_name": "All-Cal Demolition",
      "dba_name": "Blue Bottle Coffee",
      "address": {
        "street": "2453 Fillmore St",
        "city": "San Francisco",
        "state": "CA",
        "zip": "94115"
      },
      "naics": {
        "code": "2300-2399",
        "description": "Construction"
      },
      "status": "active",
      "registration_date": "2025-08-01",
      "location_start_date": "2025-08-01",
      "location_end_date": null
    }
  ]
}
```

Distinct outcome shapes:

```json
// 1. Match found — one or more rows (most common)
{ "success": true, "query": "...", "match_count": 6, "results": [ ... ] }

// 2. No match — empty array from the API, surfaced as match_count=0
{ "success": true, "query": "Xyzzy Nonexistent Inc", "match_count": 0, "results": [] }

// 3. Closed location (status derived)
{
  "uniqueid": "...",
  "ownership_name": "Twitter Inc",
  "dba_name": "Twitter Inc",
  "status": "closed",
  "location_end_date": "2025-03-31",
  "registration_date": "2007-04-15",
  "...": "..."
}

// 4. Administratively closed (TTX flagged after dormancy)
{
  "uniqueid": "...",
  "ownership_name": "Roberts Vernon J",
  "dba_name": "Roberts Vernon J",
  "status": "administratively_closed",
  "location_end_date": "2018-06-30",
  "registration_date": "...",
  "...": "..."
}

// 5. API or browser path failed — populated on hard failure only
{ "success": false, "error_reasoning": "Socrata API returned 503 after 3 retries; browser fallback also failed: ..." }
```
