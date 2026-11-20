---
name: data-sfgov-org-sf-business-registry-lookup-xzbldj
title: SF Business Registry Lookup
description: >-
  Search the City and County of San Francisco's Registered Business Locations
  dataset by DBA name or owner/legal name and return each matching location with
  legal name, DBA, full address, NAICS code + description, derived status
  (active / closed / administratively-closed), and registration dates. Reads the
  DataSF Socrata Open Data API (g8m3-pdis); browser fallback via the official
  lookup story page is documented but ~50× slower and missing NAICS in the
  default grid.
website: data.sfgov.org
category: government
tags:
  - government
  - san-francisco
  - business-registry
  - socrata
  - kyc
  - naics
  - read-only
source: 'browserbase: agent-runtime 2026-05-26'
updated: '2026-05-26'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      Drive the DataSF lookup story page (data.sfgov.org/stories/s/k6sk-2y6w)
      when the SODA HTTP endpoint is blocked. Stagehand CUA or browse-cli can
      apply the DBA Name / Ownership Name filter (value-pick from list, not
      free-text contains) and extract the grid, but the default grid omits
      NAICS, mailing address, and the administratively-closed flag — those
      fields require either flipping to Summary Table View or falling back to
      the API.
  - method: fetch
    rationale: >-
      The SODA endpoint at /resource/g8m3-pdis.json is a plain unauthenticated
      GET — any HTTP client (curl, fetch, requests) works. App tokens
      (X-App-Token) are optional but recommended for >10 req/min to avoid
      Socrata throttling.
verified: true
proxies: true
---
# SF Business Registry Lookup

## Purpose

Look up registered businesses in San Francisco by **DBA (doing-business-as) name** or **owner / legal name**. Returns each matching location with: legal name (`ownership_name`), DBA name, full business address, NAICS code + description, current status (active / closed / administratively-closed), and registration dates (`dba_start_date`, `location_start_date`). Read-only; never writes to the registry. Data source is the City & County of San Francisco Treasurer & Tax Collector "Registered Business Locations" dataset (`g8m3-pdis`) hosted on DataSF (Socrata). Refreshes daily at ~04:15 PT.

## When to Use

- KYC / merchant verification: confirm a vendor or counterparty is registered with SF TTX before doing business.
- Due diligence on a DBA — surface the legal entity behind a storefront name.
- Reverse-lookup all locations operated by an owner / parent corporation.
- Enrichment of an address with business metadata (NAICS sector, neighborhood, supervisor district).
- Building local-search or commerce features that need a canonical SF business identity.
- Replacing brittle screen-scrapes of the DataSF UI in existing pipelines.

## Workflow

The dataset is published as a Socrata Open Data API (SODA) endpoint at `https://data.sfgov.org/resource/g8m3-pdis.json`. **There is no auth, no rate-limit headers, no anti-bot — a single GET returns clean structured JSON with every field in the schema.** A Stagehand CUA agent driving the DataSF web UI can do the same job but pays a ~50× turn-count premium (~12 tool calls to open page → click filter → type → select → apply → extract grid → vs 1 HTTP request) AND the default UI grid is missing NAICS, mailing address, and the "administratively closed" marker. Lead with the API. The browser fallback below is documented for completeness (or for environments where outbound HTTP to `data.sfgov.org` is blocked but `*.sfgov.org` browser sessions are allowed).

### 1. Build a SoQL `$where` clause

The SODA endpoint accepts standard [SoQL](https://dev.socrata.com/docs/queries/). Two common search shapes:

**Search by DBA name (substring, case-insensitive):**
```
$where=upper(dba_name) like upper('%philz%')
```

**Search by owner / legal name (substring, case-insensitive):**
```
$where=upper(ownership_name) like upper('%philz coffee inc%')
```

Combine with `AND` for active-only:
```
$where=upper(dba_name) like upper('%philz%') AND location_end_date IS NULL AND administratively_closed IS NULL
```

**Quote escaping**: SoQL string literals are single-quoted. Escape a literal single quote by **doubling it** — search `O'Brien` as `'%o''brien%'` (not backslash-escaped). Verified working.

### 2. Issue the request

```
GET https://data.sfgov.org/resource/g8m3-pdis.json
    ?$select=uniqueid,certificate_number,ttxid,ownership_name,dba_name,
             full_business_address,city,state,business_zip,
             mailing_address_1,mail_city,mail_state,mail_zipcode,
             naic_code,naic_code_description,naics_code_descriptions_list,
             dba_start_date,dba_end_date,location_start_date,location_end_date,
             administratively_closed,location,
             neighborhoods_analysis_boundaries,supervisor_district
    &$where=upper(dba_name) like upper('%philz%')
    &$order=location_start_date DESC
    &$limit=200
```

Default `$limit` is 1000, max is 50000 per request. For bulk, paginate with `$offset`. **App token is recommended but not required** — Socrata throttles unauth clients more aggressively under load. Pass via header `X-App-Token: <token>` or query param `$$app_token=<token>` if you have one. For one-off lookups (< ~10 req/min), no token is fine.

### 3. Determine status per row

The dataset has **no single "status" column** — derive it from three fields:

| `administratively_closed` | `location_end_date` | `dba_end_date` | → derived `status` |
|---|---|---|---|
| `null` (absent) | `null` | `null` | `active` |
| `null` | set (past) | any | `closed_at_location` |
| `null` | any | set (past) | `dba_ended` |
| `"***Administratively Closed"` | any | any | `administratively_closed` |

**Administratively closed** = TTX has not heard from the business in 3+ years OR another City dept reported closure. The dataset note says "this tool returns results for active and inactive businesses" — the consumer must filter.

### 4. Optional: dedupe & roll up

One certificate_number / `ownership_name` typically has **multiple rows** — one per (BAN, location_id) pair. The same DBA at the same address may also appear in multiple rows across renewals. If the consumer wants one entity per business, group by `certificate_number` and keep the most-recent `location_start_date` per `(certificate_number, full_business_address)`.

### 5. Validate with Zod (consumer-side schema, recommended)

```ts
import { z } from "zod";
export const SFBusinessRow = z.object({
  uniqueid: z.string(),
  certificate_number: z.string(),
  ttxid: z.string().optional(),
  ownership_name: z.string(),
  dba_name: z.string(),
  full_business_address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  business_zip: z.string().optional(),
  naic_code: z.string().optional(),                          // 6-digit NAICS, string
  naic_code_description: z.string().optional(),
  naics_code_descriptions_list: z.string().optional(),       // semicolon-separated when multi
  dba_start_date: z.string().datetime({ offset: false }).optional(),
  dba_end_date: z.string().datetime({ offset: false }).optional(),
  location_start_date: z.string().datetime({ offset: false }).optional(),
  location_end_date: z.string().datetime({ offset: false }).optional(),
  administratively_closed: z.literal("***Administratively Closed").optional(),
  location: z.object({                                       // Socrata Point geometry
    type: z.literal("Point"),
    coordinates: z.tuple([z.number(), z.number()]),          // [lon, lat]
  }).optional(),
  neighborhoods_analysis_boundaries: z.string().optional(),
  supervisor_district: z.string().optional(),
});
export const SFBusinessSearchResult = z.object({
  query: z.object({ dba_name: z.string().optional(), ownership_name: z.string().optional() }),
  total_matches: z.number().int().nonnegative(),
  results: z.array(SFBusinessRow),
});
```

Use `.partial()` or `.optional()` liberally — many fields are populated only after 2014 (see migration gotcha below).

### Browser fallback — Stagehand CUA / `browse` CLI flow

When the SODA endpoint is unreachable but the SF gov web UI is, drive the **Business Lookup story page** (the dataset's `/data` Explore tab is a heavier wrapper around the same grid widget):

1. Open `https://data.sfgov.org/stories/s/k6sk-2y6w` — the curated lookup UI. (Direct `/Economy-and-Community/Registered-Business-Locations-San-Francisco/g8m3-pdis/data` works too, but adds the dataset chrome.)
2. Wait for page load + ~4s settle — the AG-Grid table renders progressively and the filter sidebar appears.
3. Click `button: Filter: DBA Name - Select...` (or `Ownership Name`, `Street Address`, `Business Account Number` for the other indexed filters). A floating filter panel opens.
4. In the panel, type into `textbox: Search values`. **Do not press Enter** — pressing Enter in `browse fill` does not apply the filter on this widget; it just collapses the picker. Wait ~1s for the option list to filter.
5. Click the `checkbox: <Exact Value>` for each value you want. The filter is **value-pick from a list**, not free-text contains — there is no "contains" operator in the UI. To approximate a contains-search, multi-select every option that contains your substring after typing.
6. Click `button: Apply` at the bottom of the panel.
7. Wait for the result grid to repopulate. The pagination footer text "X to Y of Z" updates when the filter takes effect.
8. Extract the visible grid rows. The default grid columns are: **Ownership Name, DBA Name, Business Account Number, Location Id, Street Address, Location Start Date, Location End Date** — that's all. To get NAICS, mailing address, "Administratively Closed", or geometry, you must either (a) open the second "Summary Table View" tab on the same page (renders all columns but lazy-loads, often empty on first render — `wait timeout 5000`), or (b) fall back to the SODA endpoint for the remaining fields keyed by `uniqueid`.
9. Stagehand-style: a single `page.act("filter DBA Name to 'Philz Coffee' and extract all rows")` collapses steps 3–7 but still inherits the default-grid column limitation.

A Browserbase Stealth session (`--verified --proxies`) is **not required** for DataSF — the site has no anti-bot. A bare session works. Use stealth only if you observe a Tyler/Socrata WAF challenge under sustained load.

## Site-Specific Gotchas

- **`administratively_closed` is text, not boolean — despite the dataset metadata.** The Socrata `X-Soda2-Types` header reports `administratively_closed` as text (position 13 in the schema; the two `boolean` types in the header refer to `parking_tax` and `transient_occupancy_tax`). Its actual values are exactly the string `"***Administratively Closed"` or absent/null. Querying with `WHERE administratively_closed = true` or `= 'true'` returns 0 rows or a type-mismatch error. Use `IS NULL` (active) / `IS NOT NULL` (administratively closed). Distribution observed 2026-05-26: 42,776 closed, 318,733 not-marked-closed.
- **Status is derived, not stored.** There is no `status` column. Combine `administratively_closed`, `location_end_date`, and `dba_end_date` per the table in Workflow §3. Never return `status: "active"` based on `location_end_date IS NULL` alone — administratively-closed rows often have null end dates.
- **One business → many rows.** The dataset is **one row per (certificate × location × BAN-revision)**, not one row per business. Philz Coffee Inc has 5 rows for 4 distinct SF storefronts. Always dedupe by `certificate_number` + `full_business_address` if the consumer wants one row per real-world location, or by `certificate_number` alone for one row per legal entity.
- **2014 migration sets only `dba_start_date` / `location_start_date` for pre-2014 records.** When SF migrated TTX systems in 2014, only active accounts as of that date were carried forward. Many pre-2014 fields (NAICS, mailing, etc.) are blank for historical rows. Zod schemas must mark those fields `.optional()`.
- **DBA filter UI is value-pick, not free-text contains.** The story-page filter widget shows operator "is" and a checkbox list of distinct values. Typing in "Search values" filters the visible options — it does NOT perform a server-side contains query. To approximate substring search via the UI, multi-select every checkbox that matches. The SODA API has no such limitation (`like` works on the server).
- **Default grid hides NAICS + closure flag.** The Story page's primary grid shows only 7 columns. NAICS code, mailing address, administratively-closed status, and geometry are in the underlying dataset but not the default UI. Either flip to "Summary Table View" (slow, full-width) or fall back to the SODA API. Don't rely on the browser path alone to satisfy the NAICS requirement.
- **`naic_code` is a TEXT string of a 6-digit code; NAICS descriptions can be plural.** Some businesses report multiple NAICS classifications — `naic_code` holds the primary, and `naics_code_descriptions_list` carries the full set (semicolon-delimited). Sort on `naic_code` lexicographically, not numerically.
- **`location` is a Socrata Point geometry, `[lon, lat]` order (NOT `[lat, lon]`).** Standard GeoJSON Point. The dataset includes ~3% rows with no `location` (often PO Box mailing addresses or out-of-SF locations).
- **Out-of-SF records exist.** Despite the dataset title, many rows are for businesses that pay SF tax but operate in Alameda, San Mateo, etc. (e.g., the Philz Coffee Truck at 1821 San Antonio Ave, Alameda). Filter on `city = 'San Francisco'` if you want only-SF.
- **Date fields are floating-timestamps (`YYYY-MM-DDTHH:MM:SS.SSS`, no TZ offset).** Treat as local Pacific dates — don't `Date.parse()` and re-format in UTC or you'll get off-by-one issues for late-night records.
- **SoQL `like` is case-sensitive by default.** Always wrap both sides with `upper()` for case-insensitive substring search: `upper(dba_name) like upper('%query%')`. The dataset stores names in proper case (e.g., `Philz Coffee Inc`), so a raw lowercase `like '%philz%'` returns zero rows.
- **SoQL string literals escape single-quotes by doubling them.** `O'Brien` → `'%o''brien%'`. Backslash escapes are NOT supported.
- **No `$$app_token` required for one-off reads.** The endpoint works fully unauthenticated. Socrata throttles unauth clients harder under sustained load — pass `X-App-Token` for production workloads (free at https://data.sfgov.org/profile/app_tokens).
- **Pagination via `$offset`, max `$limit=50000` per request.** Total dataset size as of 2026-05-26: 361,509 rows. Use `$select=count(uniqueid)` + `$where=...` to size before iterating.
- **Daily refresh ~04:15 PT** (`data_loaded_at` field). Same-day registrations may not appear until next morning's load.
- **Don't bother with stealth/proxies on DataSF.** No anti-bot was observed across either the SODA endpoint or the story-page UI during 2026-05-26 testing. Bare sessions and direct `curl` both work.
- **Dataset ID `g8m3-pdis` is stable.** DataSF has rotated dataset IDs only twice in 10+ years of operation; both times the old ID 301-redirected for >12 months. The four-letter category prefix (`Economy-and-Community/`) is part of the URL but not the API path.

## Expected Output

Three outcome shapes — match-found, no-match, and (UI fallback only) NAICS-missing.

### Match found — SODA API path (preferred)

```json
{
  "query": { "dba_name": "Philz Coffee" },
  "total_matches": 5,
  "results": [
    {
      "uniqueid": "1293936-12-211-0415140",
      "certificate_number": "0415140",
      "ttxid": "1293936-12-211",
      "ownership_name": "Philz Coffee Inc",
      "dba_name": "Philz Coffee",
      "full_business_address": "191 Warriors Way Ste 100",
      "city": "San Francisco",
      "state": "CA",
      "business_zip": "94158",
      "naic_code": "722515",
      "naic_code_description": "Snack and Nonalcoholic Beverage Bars",
      "naics_code_descriptions_list": "Snack and Nonalcoholic Beverage Bars",
      "dba_start_date": "2007-04-01T00:00:00.000",
      "dba_end_date": null,
      "location_start_date": "2021-12-22T00:00:00.000",
      "location_end_date": null,
      "administratively_closed": null,
      "status": "active",
      "location": { "type": "Point", "coordinates": [-122.387, 37.770] },
      "neighborhoods_analysis_boundaries": "Mission Bay",
      "supervisor_district": "10"
    }
  ]
}
```

### No match

```json
{
  "query": { "dba_name": "Nonexistent Cafe XYZQ" },
  "total_matches": 0,
  "results": []
}
```

### Match found — browser-fallback path (NAICS unavailable from default grid)

```json
{
  "query": { "dba_name": "Philz Coffee" },
  "source": "browser_default_grid",
  "total_matches": 5,
  "results": [
    {
      "ownership_name": "Philz Coffee Inc",
      "dba_name": "Philz Coffee",
      "business_account_number": "0415140",
      "location_id": "1244266-01-201",
      "street_address": "425 Mission St 100",
      "location_start_date": "2020-01-27",
      "location_end_date": null,
      "status": "active",
      "naic_code": null,
      "naic_code_description": null
    }
  ],
  "notes": "NAICS, mailing address, and administratively_closed marker are not exposed in the default UI grid; fall through to SODA API for full field coverage."
}
```
