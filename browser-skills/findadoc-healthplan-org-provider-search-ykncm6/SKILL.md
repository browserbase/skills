---
name: findadoc-healthplan-org-provider-search-ykncm6
title: The Health Plan Provider Search
description: >-
  Search The Health Plan's provider directory (findadoc.healthplan.org) for
  in-network doctors, hospitals, and facilities. Pick a member network
  (Commercial/MHT/Medicare/Self-Funded) via URL param, then filter by
  state-or-ZIP, network plan, and provider category (all/primary
  care/hospital/specialist). Read-only.
website: findadoc.healthplan.org
category: healthcare
tags:
  - healthcare
  - insurance
  - provider-directory
  - in-network
  - the-health-plan
  - asp-net-webforms
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: browser
alternative_methods:
  - method: browser
    rationale: >-
      The site is a classic ASP.NET WebForms app. All form state is in
      __VIEWSTATE + server session cookies — there is no public JSON/GraphQL
      endpoint, no deep-link search URL, and no way to express search criteria
      in the querystring beyond the network entry point
      (?network=commercial|MHT|medicare|SF). Pagination, sort, and page-size
      changes are postbacks against the same results.aspx URL. Browser scripting
      is the only path.
  - method: url-param
    rationale: >-
      Member-type / network selection IS a URL param (?network=...) — the ONLY
      part of search criteria that's URL-addressable. Use it to enter the form
      with the right Network Plan dropdown populated. Everything downstream of
      that (name, ZIP, state, category, specialty) requires browser interaction.
verified: true
proxies: true
---
# The Health Plan Provider Search

## Purpose

Search The Health Plan's provider directory (`findadoc.healthplan.org`) for in-network doctors, hospitals, and other facilities. Given a member network (Commercial / WV Mountain Health Trust / Medicare / Self-Funded), a sub-plan, a location (state or ZIP), and a provider category (all / primary care / hospital-or-facility / specialist), return a list of participating providers with name, address, phone, specialty, and provider type. Read-only — never nominates, joins, or enrolls.

## When to Use

- "Is {doctor name} in network for my Self-Funded Health Plan?"
- "Find an in-network cardiologist within 25 miles of {ZIP}."
- "List all in-network hospitals in {state} accepting {plan name}."
- "Is {hospital name} on the PEIA PPO network?"
- Any pre-visit benefits check against THP's directory before scheduling care in KY / MD / OH / PA / VA / WV.

## Workflow

The directory is a classic ASP.NET WebForms app (`search.aspx` → `results.aspx`). All form state lives in `__VIEWSTATE` + server session cookies — there is no public JSON API and search criteria are **not** representable in the URL beyond the network entry point. The skill is browser-driven end-to-end.

### 1. Pick the member-type entry URL

The "member type" + base network is set by the `network` querystring on `search.aspx`. **There is no member-type radio in the UI** — choose by URL:

| Prompt phrasing | URL |
|---|---|
| "Commercial Member" / HMO / PPO / PEIA | `https://findadoc.healthplan.org/search.aspx?network=commercial` |
| "WV Mountain Health Trust" / Medicaid / WVCHIP | `https://findadoc.healthplan.org/search.aspx?network=MHT` |
| "Medicare" / SecureCare / SecureChoice | `https://findadoc.healthplan.org/search.aspx?network=medicare` |
| "Self-Funded" / "The Health Plan" (as TPA option) | `https://findadoc.healthplan.org/search.aspx?network=SF` |

For the Self-Funded case, the prompt instruction "select The Health Plan" refers to choosing the THP logo on `https://www.healthplan.org/self-funded-network-providers` — that landing page also shows logos for PHCS, MultiPlan, FirstHealth, Cigna, HealthSmart, etc. (each of which is a *different* TPA network with its own external directory). Only the THP logo links to `findadoc.healthplan.org?network=SF`. If the user's TPA plan rides on any other logo, this skill does not apply — direct them to that network's lookup.

### 2. Start a session

Open the network entry URL in a fresh remote session. **Residential proxy + verified stealth is the safe default** — the site loads from cloud IPs without 4xx, but `--verified --proxies` is what was used in the verified path and incurs no cost penalty. Do not skip `--keep-alive` — the POST → results round-trip writes to server session state that won't persist across a hard reload.

```bash
sid=$(browse cloud sessions create --keep-alive --proxies --verified \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$sid"
browse open "https://findadoc.healthplan.org/search.aspx?network=<commercial|MHT|medicare|SF>" --remote
```

### 3. Fill the form (Step 1: name and/or location)

Stable form-element IDs (ASP.NET — these don't change across snapshots):

| Field | DOM id | Notes |
|---|---|---|
| Last Name or Facility Name | `ctl00_Body_txtLName` | Text input, substring/prefix match against `LAST_NAME` and `FACILITY_NAME`. Case-insensitive. Optional, but Step 1 needs at least one of {name, zip, state} filled. |
| Zip Code | `ctl00_Body_txtZip` | 5-digit US ZIP. Mutually-exclusive with State (UI shows "- OR -"). |
| State | `ctl00_Body_ddlState` | **Only 6 valid values**: `KY`, `MD`, `OH`, `PA`, `VA`, `WV`. Other states are not in the dropdown. |
| City | `ctl00_Body_ddlCity` | Populated by an AJAX postback after State is chosen; defaults to `ALL`. |
| Distance | `ctl00_Body_ddlDist` | Miles radius from ZIP/city. Values: `5`, `10`, `15`, `20`, `25`, `50`, `100`. |

A snapshot-based ref approach via `browse fill <ref> "..."` and `browse select <ref> "<value>"` works, but ref IDs renumber on every postback. If you submit and get a validation error, re-snapshot and re-extract refs before retrying.

Note that snapshot refs in the accessibility tree do not include the literal IDs above — refs look like `[0-25]`. To find the right ref for a labelled input, walk the tree under the label's text (e.g. find the `textbox` ref that follows `Last Name or Facility Name`).

### 4. Set Network Plan (Step 2, `ctl00_Body_ddlPartIn`)

The Network Plan select is populated based on the `?network=` URL param:

| URL `network=` | Network Plan options (value → label) |
|---|---|
| `commercial` | `commercial`→Commercial (HMO), `PPO`→POS/PPO, `PEIA`→PEIA, `PEIA2023`→PEIA 2023, `PreferredPOS`→POS Preferred |
| `MHT` | `WV Medicaid` (only) |
| `medicare` | Medicare Advantage SecureCare, SecureCare SNP, SecureChoice, SecureCare Capitol Plan (HMO), SecureChoice Capitol Plan (PPO) |
| `SF` | `Self Funded` (only) |

The dropdown is single-select and is required.

### 5. Set provider category (Step 2, `ctl00_Body_Prov_Details` radio group)

| Radio value | Label | Required follow-up |
|---|---|---|
| `rbAll` | All — searches all providers, hospitals, facilities, specialists | None |
| `rbPCP` | Primary Care Practitioner — Physician | None |
| `rbNPPCP` | Non-Physician Primary Care Practitioner | None |
| `rbHosp` | Hospital or Facility | **Must also select `ctl00_Body_ddlType`** (facility type enum, see below) — leaving it on "Choose Type" fails validation |
| `rbSpec` | Specialist | **Must also select `ctl00_Body_ddlSpecialty`** — leaving it on "Choose Specialty" fails validation |

If the user is hunting "a hospital" or "any in-network doctor" without a narrowed specialty/type, `rbAll` is the right radio — it captures everything and bypasses the type-required check.

### 6. (Optional) Step 3 refinements

`ctl00_Body_ddlGender`, `ctl00_Body_ddlLang` (~90 language options), `ctl00_Body_ddlAccept` (Accepting New Patients), `ctl00_Body_ddlBoardCert` (board certification enum), `ctl00_Body_ddlAffiliation` (hospital affiliation), `ctl00_Body_ddlMedGrp`, `ctl00_Body_ddlAccreditingOrg` (AAAHC, JCAHO, etc.), `ctl00_Body_ddlFacilityTOS` (Type of Service, e.g. "Acute Inpatient Hospitals", "Mammography"). All optional; skip unless the user explicitly asked.

### 7. Submit and read results

Submit by clicking the Search button (`ctl00_Body_btnSubmit`, accessibility label `button: Search`). After ~1–3s the form POSTs and the browser lands on `https://findadoc.healthplan.org/results.aspx?sort=Name`.

Bump the page size to its maximum **before** scraping — there is no all-on-one-page option:

```bash
# Find the page-size select (label "Select page size") and choose "40"
browse select <pagesize-ref> "40" --remote
```

Each result row has 5 cells: **Name | Location (street \n CITY, STATE, ZIP) | Phone | Specialty | Type**. A single provider with multiple practice locations renders as one row per location — e.g. "GHULAM ABBAS MD" appears 4 times in WV-Self-Funded with different addresses. Treat `(name, address)` as the row key; group by `name` only if the consumer wants a deduplicated practitioner list.

The results footer reports `Showing <page#> of <pagesize> / <total>` (e.g. `Showing 1 of 40 / 12987`). Use the third number as the absolute result count.

### 8. Paginate

Click the next-page button in the footer (label `Show me <pagesize> providers per page` row, `button:` elements with no text — first/prev/next/last). The browser stays on `/results.aspx?sort=Name` across paginations; **the URL does not change with page number** — pagination is also POSTback-driven via ViewState. There is no `?page=N` deep-link.

For large result sets (e.g. WV / Self-Funded / All = 12,987), pagination across 325 pages at 40/page is impractical in a single agent run. Narrow the search instead by adding `txtZip` + `ddlDist`, picking a specific `rbSpec` specialty, or filtering on `ddlAcceptingNew`. The 12,987 figure surfaces almost any breadth issue — if you see a result count in the thousands, the user almost certainly under-specified.

### 9. (Optional) Detail page

Each Name cell is a link. Clicking it loads a provider-detail page (also POST-driven from `results.aspx`) with full address blocks, NPI when available, accepting-new-patients flag, hospital affiliations, and board certifications. Only navigate to detail pages when the user asked for fields beyond the 5-column results table.

### 10. Release the session

```bash
browse cloud sessions update "$sid" --status REQUEST_RELEASE
```

## Site-Specific Gotchas

- **Member type is URL-only, not a UI radio.** The four options (`commercial` / `MHT` / `medicare` / `SF`) are the `?network=` querystring on `search.aspx`. There is no on-page selector that switches between them — picking the wrong one returns a different (and wrong) Network Plan dropdown.
- **Only 6 states are in scope.** `ddlState` is `KY, MD, OH, PA, VA, WV`. Requests for other states cannot be served by this directory. If the user is hunting in a non-supported state via a Self-Funded plan, the answer is "not on the THP Self-Funded network — check the {PHCS/MultiPlan/FirstHealth/...} directory" via the logos on `https://www.healthplan.org/self-funded-network-providers`.
- **State and ZIP are mutually exclusive in the UI ("- OR -")** but the form accepts both. If both are provided, ZIP + Distance wins and State is ignored — verify with the "Your Search" sidebar on results.aspx, which echoes the criteria the server used.
- **Hospital-or-Facility radio requires a facility Type.** Clicking `rbHosp` without selecting from `ddlType` fails with red banner: `"In Step 2 you wanted to search for a specific Hospital or Facility but you did not pick a speciality from the list. Please select a type from the list and try again."` Same trap on `rbSpec` + `ddlSpecialty`. **Use `rbAll` if you want hospitals without a type filter** — `rbAll` returns every record where `Type` ∈ {Primary Care Physician, Specialist, Behavioral Health, Ancillary Services, Hospital, Facility, ...} and you can post-filter the results table client-side.
- **Page size caps at 40.** The `Show me <N> providers per page` dropdown only offers 10/20/30/40. There is no `?pagesize=` URL override. **This is the "results limit (unknown number)" mentioned in the canonical task prompt — it's a pagination cap, not a hard result cap. The full result set is always returned (`total` count in footer); only the per-page slice is capped.**
- **One row per practice location, not per practitioner.** GHULAM ABBAS MD with practices in Elkins, Fairmont, Morgantown, and Wheeling renders as 4 rows. Use `(name, address)` to dedupe if needed.
- **No deep-link search URL.** Search criteria are POST'd into ASP.NET ViewState; the destination `results.aspx?sort=Name` has the same URL for every search. You cannot bookmark or curl-replicate a search. Pagination, sort changes, and page-size changes are all postbacks against the same URL.
- **`results.aspx` is reachable directly via GET while the session has a prior search** — but the displayed results are whatever was last POST'd from `search.aspx` in that session. Don't rely on results.aspx alone; always POST from a fresh `search.aspx` to set criteria.
- **Refs in the accessibility snapshot renumber after every postback.** Any `browse click/fill/select` that triggers a postback (radio selection, state pick, search submit, pagination, page-size change) invalidates all refs. Re-snapshot before the next interaction.
- **No JSON / GraphQL / public API.** The HTML body has no JSON-LD or `__INITIAL_STATE__` blob — ASP.NET classic with server-rendered tables. The `https://findadoc.healthplan.org/Directories/Medicaid_Directory.pdf` and `Medicare_Directory_2026.pdf` PDFs (linked from the landing page) are bulk dumps if you need offline-printable directories; `https://healthplan.org/patient-access-api/` exists for FHIR-style patient-access flows but requires auth and is out of scope for an anonymous provider lookup.
- **No anti-bot wall observed.** Pages load fine from Browserbase cloud IPs with `--verified --proxies`. No Akamai/Cloudflare/captcha. No login wall for read-only search. Sessions do go idle — if a single session is held >15 minutes without activity, the driver daemon stops responding (`Driver daemon session ... is running but not responding`); recover with `browse stop --session <sid> --force` and create a fresh session.
- **External vision/dental are out-of-network for this directory.** The landing page redirects dental queries to SkyGen (commercial), Liberty Dental (Medicare), and Cape Fear Valley (some self-funded), and all vision queries to Superior Vision. Pharmacy lookups belong on Express Scripts (`https://www.express-scripts.com/`). If the user's query is dental/vision/pharmacy, this skill is not the right tool.

## Expected Output

```json
{
  "success": true,
  "criteria": {
    "network": "SF",
    "networkLabel": "Self Funded",
    "memberType": "Self-Funded Member (The Health Plan)",
    "state": "WV",
    "zip": null,
    "city": null,
    "distance_miles": null,
    "category": "rbAll",
    "name_query": "WHEELING HOSPITAL",
    "specialty": null,
    "facility_type": null
  },
  "total_results": 6,
  "page": 1,
  "page_size": 40,
  "providers": [
    {
      "name": "WHEELING HOSPITAL",
      "address_street": "1 MEDICAL PARK",
      "address_city": "WHEELING",
      "address_state": "WV",
      "address_zip": "26003",
      "phone": "304 243-3000",
      "specialty": "Hospitals",
      "type": "Hospital or Facility"
    }
  ]
}
```

Distinct outcome shapes:

```json
// Non-supported state (user asked about CA, NY, etc.)
{
  "success": false,
  "reason": "unsupported_state",
  "supported_states": ["KY", "MD", "OH", "PA", "VA", "WV"]
}

// Wrong-TPA (Self-Funded user whose plan rides on PHCS/MultiPlan/Cigna/etc.)
{
  "success": false,
  "reason": "wrong_tpa_network",
  "self_funded_landing": "https://www.healthplan.org/self-funded-network-providers",
  "note": "User's plan is not on The Health Plan's Self-Funded network. Direct them to their TPA's lookup tool linked on the landing page (PHCS, MultiPlan, FirstHealth, Cigna, HealthSmart, etc.)."
}

// Validation error caught and recovered (Hospital-or-Facility radio without type)
{
  "success": false,
  "reason": "validation_error",
  "message": "In Step 2 you wanted to search for a specific Hospital or Facility but you did not pick a speciality from the list. Please select a type from the list and try again.",
  "remediation": "Select a value from ctl00_Body_ddlType, or use rbAll radio to bypass."
}

// Zero results
{
  "success": true,
  "total_results": 0,
  "providers": []
}

// Over-broad query (warn the consumer)
{
  "success": true,
  "total_results": 12987,
  "warning": "Result set exceeds practical pagination (>1000). Refine with ZIP + Distance, a specific specialty, or accepting_new_patients filter.",
  "providers": [ /* page 1 only */ ]
}
```
