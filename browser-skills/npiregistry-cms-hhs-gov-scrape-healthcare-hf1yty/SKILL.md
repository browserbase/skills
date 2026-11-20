---
name: npiregistry-cms-hhs-gov-scrape-healthcare-hf1yty
title: Scrape Healthcare Leads by Niche (NPI Registry)
description: >-
  Search the CMS NPPES NPI Registry by healthcare niche (taxonomy) and location
  to extract provider/organization leads: business name, owner (authorized
  official) name and title, phone, fax, address, specialty, license, and NPI.
  Note: the dataset contains no email addresses.
website: npiregistry.cms.hhs.gov
category: lead-generation
tags:
  - healthcare
  - lead-generation
  - npi
  - cms
  - providers
  - public-api
source: 'browserbase: agent-runtime 2026-07-22'
updated: '2026-07-22'
recommended_method: api
alternative_methods:
  - method: fetch
    rationale: >-
      The same public JSON API can be hit with any plain HTTP client (no auth,
      no anti-bot) — 'api' and 'fetch' are effectively identical here; use
      browse cloud fetch or curl.
  - method: browser
    rationale: >-
      The /search web form hits the same backend but is slower, subject to a
      per-hour UI query throttle, and hides the owner/authorized-official behind
      a per-record detail click. Use only if the API is unreachable.
  - method: cli
    rationale: >-
      For bulk harvesting, CMS publishes a downloadable full data-dissemination
      (DDS) file — preferred over API pagination for very large niches.
verified: false
proxies: false
---
# Scrape Healthcare Leads by Niche (NPPES NPI Registry)

## Purpose

Given a healthcare niche (specialty/taxonomy) plus optional location filters, return a list of provider/organization "lead" records from the CMS NPPES NPI Registry — the free, federal directory of every active National Provider Identifier. Each lead carries the business/provider name, the **business owner / authorized official** name + title (for organizations), phone, fax, practice + mailing addresses, specialty (taxonomy), license number, NPI, and enumeration/status metadata. Read-only; queries a public dataset, never writes.

**Honesty callout up front — there are NO email addresses in this dataset.** NPPES publishes only the fields CMS deems publicly relevant (name, specialty, practice address, phone/fax, and for organizations an authorized official). The only "endpoint" field that can hold a contact-like value is the `endpoints[]` array, and in practice it only ever contains Health Information Exchange technical endpoints (Carequality/Direct SOAP URLs), never marketing/contact emails — it is empty for the overwhelming majority of records. If you need emails, this source cannot supply them; it supplies phone numbers, owner names, and addresses instead.

## When to Use

- Building a healthcare lead list scoped to a niche + geography, e.g. "all Dermatology organizations in NY", "Acupuncturists in TX", "Massage Therapist businesses in CA".
- Enriching a known NPI or business name with owner (authorized official), phone, address, and specialty.
- Any time you'd otherwise scrape the NPPES web UI — the public JSON API returns the same data faster, cleaner, and without the per-hour UI query throttle.
- NOT suitable when the requirement is email addresses — the dataset has none (see Purpose).

## Workflow

The NPPES web UI at `/search` is a thin Angular client over a **public, keyless JSON API** at `https://npiregistry.cms.hhs.gov/api/?version=2.1`. There is no auth, no cookies, and no anti-bot protection (verified: bare `browse cloud fetch` returns HTTP 200 JSON, no proxy/stealth needed). Lead with the API; the browser form is a slower fallback that hits the same backend but is subject to a per-hour UI query limit.

1. **Map the niche → taxonomy.** The niche is the `taxonomy_description` parameter. It matches on the CMS taxonomy display strings (`Dermatology`, `Acupuncturist`, `Massage Therapist`, `Internal Medicine`, `Clinic/Center`, `Plastic Surgery`, `Nutritionist, Nutrition, Education`, etc.). Partial/close matching is on by default; a trailing `*` wildcard works (`Clinic/Center*`).

2. **Decide individual vs. organization.** `enumeration_type=NPI-1` = individual provider (person; **no owner field** — a person has no authorized official, only `sole_proprietor: YES/NO`). `enumeration_type=NPI-2` = organization (**has the owner/authorized-official block** — this is where "business owner" comes from). Omit the param to get both. For "business owner" leads, query `NPI-2`.

3. **Fire the query** with `browse cloud fetch`:
   ```
   GET https://npiregistry.cms.hhs.gov/api/?version=2.1
       &enumeration_type=NPI-2
       &taxonomy_description=Dermatology
       &state=NY
       &limit=200          # max 200 per page; default 10
       &skip=0             # pagination offset; max 1000
   ```
   Other useful filters: `city`, `postal_code`, `country_code` (default US), `organization_name`, `first_name`/`last_name` (individuals), `authorized_official_first_name`/`_last_name`, `number` (a specific NPI), `address_purpose=LOCATION|MAILING|PRIMARY`, `pretty=true`. Add `&use_first_name_alias=true` to widen individual name matching. Unrecognized params are ignored.

4. **Iterate niches.** Run the query once per niche (and per state/city if you want geographic slices). Each response is `{ "result_count": N, "results": [ ... ] }` — `result_count` caps at the page `limit`, not the true total. Paginate with `skip` in steps of your `limit` until a short page is returned. The API/UI hard-caps a single search at ~1200–2100 results total; if a niche exceeds that, subdivide by state/city/postal to stay under the cap.

5. **Extract each lead** from a `results[i]` object:
   - `number` → the 10-digit NPI.
   - `basic.organization_name` (NPI-2) or `basic.first_name`+`basic.last_name`+`basic.credential` (NPI-1) → the lead name.
   - **Owner (NPI-2 only):** `basic.authorized_official_first_name` + `_last_name` (+ `_middle_name`, `_credential`), `basic.authorized_official_title_or_position` (e.g. "Owner", "President", "CFO", "Office Manager"), `basic.authorized_official_telephone_number`.
   - `addresses[]` → each has `address_purpose` (`LOCATION` = practice, `MAILING`), `address_1/2`, `city`, `state`, `postal_code`, `telephone_number`, `fax_number`.
   - `taxonomies[]` → `desc` (the specialty), `primary` (bool), `license`, `state`, `code`.
   - `basic.status` (`A` = active), `basic.enumeration_date`, `basic.last_updated`, `basic.sole_proprietor` (NPI-1).
   - `endpoints[]` → almost always `[]`. If populated, it holds HIE/Direct technical endpoints (`endpointType: SOAP/DIRECT`, `endpoint: <url or Direct address>`), **not** a marketing email.

6. **Emit** one lead object per record with `email: null` (be explicit that no email exists — see Expected Output).

### Browser fallback (only if the API is unreachable)

1. `browse open https://npiregistry.cms.hhs.gov/search`.
2. Set the **NPI Type** `<select>` to Organization/Individual, type the niche into the **Taxonomy Description** textbox, pick a **State** from the `<select>`, optionally fill City/Postal Code.
3. Click the **Search** button. Results render as a table (`browse get markdown body`) with columns: NPI | Name | NPI Type | Primary Practice Address | Phone | Primary Taxonomy. **The table does NOT show the owner** — you must click each NPI link to reach the detail view (`/results` → detail), where the **Authorized Official Information** row shows `Name / Title / Phone`, plus full addresses, taxonomy, and an (almost always empty) **Health Information Exchange** section.
4. Note the per-hour UI query throttle (banner: "NPPES has limited the amount of NPI Registry queries that can be completed per hour"). The API path avoids the click-per-record cost and is strongly preferred.

## Site-Specific Gotchas

- **No emails, ever.** This is the single most important thing to know for a "find their emails" task. NPPES does not collect or publish provider email addresses. The `endpoints[]` array is the only email-shaped field and it (a) is empty in the vast majority of records and (b) when present holds HIE Direct/Carequality technical endpoints (secure health-messaging / SOAP URLs), not contactable marketing emails. Return `email: null` and set `email_available: false`. Substitute phone + owner name + mailing address as the contactable lead data.
- **"Business owner" ≈ Authorized Official, and only exists for NPI-2 (organizations).** Individuals (NPI-1) have no owner block. The official's `title_or_position` is free text set by the registrant — expect "Owner", "President", "Managing Director", "CFO", "Office Manager", "Billing Manager", etc. It is the legal/administrative contact, not guaranteed to be the equity owner.
- **Public, keyless, no anti-bot.** No `--verified`/`--proxies` needed. `browse cloud fetch` (or plain `browse open` + `get text body`) returns HTTP 200 JSON directly. Pre-run probe reported no antibots; confirmed across all test queries.
- **`result_count` is the page size, not the total.** It equals `min(limit, matches-on-this-page)`. Never treat it as the universe size — paginate with `skip`.
- **Pagination limits:** `limit` max 200, `skip` max 1000, so the API exposes at most ~1200 records per query (the web UI caps at ~2100). Subdivide by state → city → postal to enumerate a large niche fully.
- **Fuzzy matching is on by default.** Results include "similar and close" matches to your keywords. On the web form, check "Exact Matches only" to tighten; on the API, matching is inherently broad — filter client-side on `taxonomies[].desc` if you need strict niche membership. (Observed: a "Dermatology" search surfaces records whose *primary* taxonomy is "Point of Service" or "Massage Therapist" but who list Dermatology as a secondary taxonomy.)
- **`taxonomy_description` matches any taxonomy on the record, not just the primary one.** Check `taxonomies[].primary === true` if you only want providers whose main specialty is the niche.
- **Per-hour throttle on the UI (and shared backend).** Effective 6/25/2024 NPPES rate-limits queries per hour; bulk extraction is officially supposed to use the downloadable DDS/"full download" file (`cms.gov` data-dissemination). For large harvests, prefer the monthly full-file download over hammering the API.
- **Address fields are ALL-CAPS and unnormalized** (`address_1: "1091 SOUTHERN BLVD STE 210"`). Concatenate `address_1`, `address_2`, `city`, `state`, `postal_code` yourself; ZIPs are often 9-digit unhyphenated (`945234922`).
- **Phone numbers vary in formatting** — `addresses[].telephone_number` is usually hyphenated (`718-401-7000`) while `authorized_official_telephone_number` is often bare digits (`3476429802`). Normalize before use.
- **NPI issuance ≠ licensure.** CMS states plainly that having an NPI does not validate that the provider is licensed or credentialed. `taxonomies[].license` is self-reported and may be null.

## Expected Output

One object per query (per niche/geography slice), with a `leads` array. `email` is always `null` and `email_available` always `false` for this source.

```json
{
  "success": true,
  "niche": "Dermatology",
  "enumeration_type": "NPI-2",
  "filters": { "state": "NY", "city": null, "postal_code": null },
  "email_available": false,
  "returned": 10,
  "leads": [
    {
      "npi": "1154004133",
      "name": "1091 SOUTHERN BLVD DERMATOLOGY PLLC",
      "npi_type": "NPI-2 Organization",
      "owner_name": "WENDY SANCHEZ",
      "owner_title": "Office Manager",
      "owner_phone": "3476429802",
      "phone": "718-401-7000",
      "fax": "917-473-7878",
      "practice_address": "1091 SOUTHERN BLVD, BRONX, NY 10459-2417",
      "mailing_address": "4037 74TH ST, ELMHURST, NY 11373-5603",
      "primary_taxonomy": "Dermatology",
      "taxonomy_code": "207N00000X",
      "license": null,
      "status": "A",
      "enumeration_date": "2023-08-08",
      "email": null
    }
  ]
}
```

Individual (NPI-1) lead shape — no owner block, `sole_proprietor` instead:

```json
{
  "npi": "1588798367",
  "name": "J PAUL ABADIE",
  "npi_type": "NPI-1 Individual",
  "credential": "P.T., L. Ac.",
  "sole_proprietor": "YES",
  "phone": "409-996-8808",
  "fax": "800-820-2075",
  "practice_address": "6217 CENTRAL CITY BLVD, GALVESTON, TX 77551",
  "primary_taxonomy": "Physical Therapist",
  "other_taxonomies": ["Acupuncturist"],
  "license": "1075182",
  "email": null
}
```

No results for a niche/geography slice:

```json
{ "success": true, "niche": "Mohs Surgery", "filters": { "state": "WY" }, "email_available": false, "returned": 0, "leads": [] }
```
