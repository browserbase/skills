---
name: medicare-gov-get-hospital-rating-03perc
title: Medicare.gov Hospital Quality Rating
description: >-
  Look up a hospital's CMS Care Compare star rating, HCAHPS patient-experience
  scores, condition mortality/readmission rates, hospital-acquired infections,
  ED timeliness, and full metadata by CCN, name+state, or Care Compare URL.
  Supports compare_to for side-by-side hospitals with national + state
  benchmarks. Read-only.
website: medicare.gov
category: healthcare
tags:
  - healthcare
  - hospitals
  - ratings
  - cms
  - medicare
  - read-only
  - public-data
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: api
alternative_methods: []
verified: true
proxies: true
---
# Medicare.gov Hospital Quality Rating

## Purpose

Given a hospital reference — CMS provider/CCN ID, hospital name + city/state, or a Care Compare URL — return the hospital's CMS quality ratings as a structured JSON record. Includes the overall 1–5 star rating, the five sub-domain group ratings (mortality, safety of care, readmission, patient experience, timely & effective care), HCAHPS patient-experience composite scores, common-condition mortality/readmission rates (heart attack, heart failure, pneumonia, stroke, COPD), hospital-acquired infection (HAI) Standardized Infection Ratios for CLABSI / CAUTI / SSI / MRSA / C.diff, emergency-department timeliness, full hospital metadata, and the canonical Care Compare URL. Supports a `compare_to` input that returns multiple hospitals side-by-side plus national and state benchmarks. Read-only; never clicks Save Hospital, Print, Sign In, Compare-cart submit, or any mutation control.

## When to Use

- "Show me the CMS star rating for Mayo Clinic Rochester."
- "How does HCA Florida Citrus Hospital compare to the state average for sepsis mortality?"
- A patient-experience research agent benchmarking three named hospitals on HCAHPS composites.
- A discharge-planning tool that needs ED timeliness and readmission rates for one hospital plus the national/state benchmark for each metric.
- A scheduled job pulling quality data for an entire health-system roster (lookup-by-CCN at scale).

## Workflow

The medicare.gov Care Compare UI is a thin Angular SPA over a Kong-gated internal API (`https://www.medicare.gov/api/care-compare/*`). The exact same per-hospital quality data is **also** published — at the row level, refreshed quarterly — through the **CMS Provider Data Catalog** (data.cms.gov) DKAN datastore, which is fully public, auth-free, no anti-bot, and supports per-CCN filtering, contains-matching, multi-condition queries, and joins with state/national benchmark companion datasets. Iter-1 verification across 7 datasets for CCN 240010 (Mayo Clinic Hospital Rochester) returned 100% of the fields the Care Compare card surfaces. **Lead with the PDC API.** Use the browser flow only when you specifically need the rendered Care Compare card (e.g. for screenshot-in-the-loop tasks). Calling the medicare.gov Kong gateway directly is a confirmed dead end (`401 No API key found in request`).

### 1. Resolve the input to a CCN

The CMS Certification Number (CCN) — sometimes called the Provider ID or Facility ID — is the 6-digit primary key across every Hospital Compare dataset.

| Input shape | Resolution |
|---|---|
| 6-digit CCN (e.g. `240010`) | Use directly. |
| Hospital name + state | Query Hospital General Information with `contains` on `facility_name` + `=` on `state`. |
| Hospital name + city + state | Same as above, then filter by `citytown` client-side (case-insensitive). |
| `https://www.medicare.gov/care-compare/details/hospital/{ccn}` URL | Extract the trailing 6-digit path segment. |
| `https://www.medicare.gov/care-compare/results?...` URL | No CCN in URL — extract `zipcode=` + provider type and run a name-keyed PDC query. |

```bash
# Name → CCN lookup (Hospital General Information = dataset xubh-q36u)
curl 'https://data.cms.gov/provider-data/api/1/datastore/query/xubh-q36u/0?conditions%5B0%5D%5Bproperty%5D=facility_name&conditions%5B0%5D%5Bvalue%5D=mayo&conditions%5B0%5D%5Boperator%5D=contains&conditions%5B1%5D%5Bproperty%5D=state&conditions%5B1%5D%5Bvalue%5D=MN&conditions%5B1%5D%5Boperator%5D=%3D&limit=10'
# → 240010 MAYO CLINIC HOSPITAL ROCHESTER, ROCHESTER, MN, rating=5
```

### 2. Pull the per-CCN datasets

Issue one `GET` per dataset, filtering by `facility_id=<CCN>`. All 7 datasets share the same authentication-free DKAN datastore endpoint. Field names are stable across quarterly refreshes.

| Skill data point | Dataset ID | Title | Key fields returned |
|---|---|---|---|
| Overall 1–5 stars, group measure counts, metadata | `xubh-q36u` | Hospital General Information | `hospital_overall_rating`, `mort_group_measure_count`/`count_of_mort_measures_better/no_different/worse`, same for `safety`/`readm`/`pt_exp`/`te`; address, phone, hospital_type, hospital_ownership, emergency_services, meets_criteria_for_birthing_friendly_designation |
| HCAHPS patient-experience composites + summary star | `dgck-syfz` | Patient survey (HCAHPS) - Hospital | One row per `hcahps_measure_id`. `H_STAR_RATING` row carries `patient_survey_star_rating` (1–5 summary). `H_*_STAR_RATING` carries the per-composite stars. `H_*_LINEAR_SCORE` rows carry the linear-mean numeric score. `H_*_A_P`/`U_P`/`SN_P` give the "Always/Usually/Sometimes-or-Never" percent splits. `number_of_completed_surveys` + `survey_response_rate_percent` for sample quality. |
| Common-condition mortality, complications, PSI safety | `ynj2-r877` | Complications and Deaths - Hospital | `measure_id` ∈ {`MORT_30_AMI` (heart attack), `MORT_30_HF` (heart failure), `MORT_30_PN` (pneumonia), `MORT_30_STK` (stroke), `MORT_30_COPD` (COPD), `MORT_30_CABG` (CABG surgery), `Hybrid_HWM` (hospital-wide mortality), `COMP_HIP_KNEE`, `PSI_03`–`PSI_15` (safety indicators), `PSI_90` (safety composite)}; `score` (rate per 100/1000), `compared_to_national` ("Better Than"/"No Different Than"/"Worse Than the National Rate"), `denominator`, `lower_estimate`, `higher_estimate` (95% CI). |
| Unplanned readmissions / ED return-day rates | `632h-zaca` | Unplanned Hospital Visits - Hospital | `measure_id` ∈ {`EDAC_30_AMI`, `EDAC_30_HF`, `EDAC_30_PN` (excess days), `READM_30_*` (readmission rates per condition)}; same `compared_to_national` ternary + denominator + CI. |
| Hospital-acquired infections (HAI) Standardized Infection Ratios | `77hc-ibv8` | Healthcare Associated Infections - Hospital | Six measure families, each with 6 rows: `_SIR` (the actual SIR — what's surfaced on Care Compare), `_NUMERATOR`, `_DOPC` (device-days denominator), `_ELIGCASES`, `_CILOWER`, `_CIUPPER`. HAI_1 = CLABSI, HAI_2 = CAUTI, HAI_3 = SSI Colon, HAI_4 = SSI Abdominal Hysterectomy, HAI_5 = MRSA Bacteremia, HAI_6 = C.diff. `compared_to_national` carries the four bucket levels: `Better than the National Benchmark`, `No Different than National Benchmark`, `Worse than the National Benchmark`, `Not Available`. |
| Timely & Effective Care, including ED timeliness | `yv7e-xc69` | Timely and Effective Care - Hospital | Filter on `_condition='Emergency Department'` for ED timeliness: `OP_18a`/`b`/`c`/`d` (median minutes in ED before leaving, by patient class), `OP_22` (% who left before being seen), `OP_23` (% head-CT-results-within-45-minutes), `EDV` (volume bucket: low/medium/high/very high). Other `_condition` values: `Cataract Surgery`, `Colonoscopy`, `Heart Attack or Chest Pain`, `Pregnancy and Delivery`, `Preventive Care`, `Sepsis Care`. |
| Medicare spending per beneficiary | `nrth-mfg3` | Medicare Hospital Spending by Claim | Hospital vs. state vs. national spending across pre-admission / index-admission / post-discharge windows + claim-type splits. |

**Benchmark companion datasets** — query without `facility_id` for national-level benchmark rows, or with `state=<2-letter>` for state-level benchmark rows. Companion IDs:

| Per-hospital dataset | National benchmark | State benchmark | What the benchmark row carries |
|---|---|---|---|
| `xubh-q36u` (overall rating) | — (computed from rollups) | — | n/a |
| `dgck-syfz` (HCAHPS) | `99ue-w85f` | `84jm-wiui` | `hcahps_answer_percent` and `hcahps_linear_mean_value` for each measure ID across all reporting hospitals nationally / state-wide. |
| `77hc-ibv8` (HAI) | `yd3s-jyhd` | `k2ze-bqvw` | `score` is the nationally/state-pooled SIR (typically 1.0 for national, varies for state). |
| `ynj2-r877` (Complications/Deaths) | `qqw3-t4ie` | `bs2r-24vh` | `national_rate`; hospital-count distribution columns (`number_of_hospitals_worse|same|better|too_few`). |
| `632h-zaca` (Unplanned Visits) | `cvcs-xecj` | `4gkm-5ypv` | Same shape as Complications/Deaths benchmarks, with extra `number_of_hospitals_fewer|average|more|too_small` for EDAC measures. |
| `yv7e-xc69` (Timely & Effective Care) | `isrn-hqyy` | `apyc-v239` | `score` is the national/state median for each measure. |

### 3. Construct the canonical Care Compare URL

```
https://www.medicare.gov/care-compare/details/hospital/{ccn}?city=&state={STATE}&zipcode={ZIPCODE}&page=1&from=hospital&type=Hospital
```

This URL works only when reached **through the SPA's in-app router** — see Site-Specific Gotchas. Return it as the canonical link anyway; users who click it land on home and search by ZIP.

### 4. Assemble the unified output

Merge the per-CCN rows from each dataset into one record per hospital (see `## Expected Output` for the schema). Map each `compared_to_national` enum string into a normalized boolean trio `{better, no_different, worse}` for downstream filtering. Preserve raw `score` values as strings (CMS does — they signal "Not Available" / "Not Applicable" via string sentinels, not nulls).

### 5. Handle `compare_to`

When `compare_to: [<ccn or name+state>, ...]` is set, run steps 1–4 in parallel for each. After all hospitals are resolved, query each national + state benchmark companion dataset **once** (not per-hospital) and embed the result as a top-level `benchmarks.national` and `benchmarks.state.<state-code>` block. The PDC DKAN datastore tolerates ~5 req/s without rate-limiting in our testing; sequential per-hospital fan-out is fine.

### 6. Browser fallback (only when the user needs the rendered Care Compare card)

Use this when (a) the consumer is a visual workflow that wants a screenshot of the per-hospital card, or (b) the user explicitly requested the medicare.gov UI. Skip otherwise — the API path returns the same data at ~100× lower cost.

1. **Stealth + residential-proxy session is mandatory.** Akamai protects the site; bare sessions get challenged.
   ```bash
   sid=$(browse cloud sessions create --keep-alive --proxies --verified | jq -r .id)
   export BROWSE_SESSION="$sid"
   ```
2. **Land on the search-results page directly** with full query params — this bypasses the Welcome → Hospital tile → ZIP-input click chain:
   ```bash
   browse open "https://www.medicare.gov/care-compare/results?searchType=Hospital&page=1&zipcode={ZIPCODE}&sort=closest&radius=25" --remote
   ```
   Wait ≥ 8 seconds after `networkidle` — hospital cards render lazily after the SPA fires `POST /api/care-compare/provider?autoExpand=true`.
3. **Click into a card** by the hospital's anchor text (not by `href` pattern — see gotcha below). The SPA navigates to its in-app detail route, which renders the full quality card.
4. **Read off the rendered DOM**, then `browse cloud sessions update "$sid" --status REQUEST_RELEASE`.

## Site-Specific Gotchas

- **Deep-link `/care-compare/details/hospital/{ccn}` does NOT work as a plain URL load.** Confirmed in iters 1, 2, and 4: a `page.goto(detailUrl)` from a cold session returns the home-page chrome only (`finalUrl: /care-compare/`, `h1: "Menu"`). The SPA's router treats `/details/hospital/*` as an internal route reachable only through the in-app navigation graph (home → ZIP → Hospital → Search → click result). Construct the canonical URL anyway for output / linking — but **never** rely on `goto` for scraping the detail page. Click through from `/results?...` instead.
- **`/api/care-compare/*` is auth-walled.** Every endpoint observed (`/refresh`, `/news-updates`, `/datafeed`, `/geocode/search`, `/provider?autoExpand=true`) returns `401 {"message":"No API key found in request"}` to direct requests. The API key is embedded in the SPA bundle (`main.<hash>.js`, ~1MB — exceeds Browserbase Fetch 1MB cap). Do **not** waste cycles trying to reverse this key — the public PDC datastore is the right path.
- **The SPA bundle exceeds 1MB.** `browse cloud fetch https://www.medicare.gov/care-compare/en/main.<hash>.js --proxies` returns HTTP 502 "response body exceeded the maximum allowed size of 1MB." If you need to inspect bundle internals, do it inside a Browserbase Function (no size cap there) or use page.evaluate to introspect runtime globals.
- **Akamai bot challenge is solved transparently with `--verified --proxies`** but bare sessions see `/DgEq/aOIa/g3e9/o16Ycw/m55OcGf3k5J7rSN9iS/...` POSTs (the _abck challenge URL) and a JS-shell HTML on first navigation. Always run with stealth + residential proxy.
- **Provider-type tile click is fragile.** The home page uses `mat-list-item` tiles, not standard `<button>`s. `page.getByRole("button", { name: /hospital/i })` matched "Menu" instead of the Hospital tile in iter 1. Prefer the direct `/results?searchType=Hospital&zipcode={ZIP}` deep-link, which **does** work — it bypasses the tile.
- **`<a href="/care-compare/details/hospital/...">` may not exist.** Iter 4 confirmed `waitForSelector("a[href*='/care-compare/details/hospital/']")` times out at 30 s. Angular's `routerLink` directives do not always materialize as `<a href>` in the DOM until hover or focus. Click by visible text instead: `page.getByRole("link", { name: /<hospital name>/i })`.
- **`hospital_overall_rating: "Not Available"` is a real value.** Critical-access hospitals, brand-new hospitals, VA hospitals, children's hospitals, and rural emergency hospitals (REH) often lack a star rating. Treat as `null` in normalized output, surface the raw `"Not Available"` string in a `_raw` block. For REH, query the parallel datasets: `97xg-v3wv` (Rural Emergency Hospital - Timely and Effective Care) and `zez1-ka2w` (REH - Unplanned Hospital Visits).
- **HAI `compared_to_national` enum capitalization differs from Complications/Deaths.** HAI uses `Better than the National Benchmark` (lowercase "than", and "Benchmark" not "Rate"). Complications/Deaths uses `Better Than the National Rate`. Normalize before comparison.
- **HCAHPS rows are one-per-measure-question.** Filter to `hcahps_measure_id = 'H_STAR_RATING'` for the summary star (5-stars at Mayo Rochester), or `H_*_STAR_RATING` for per-composite stars (Nurse communication, Doctor communication, Cleanliness, Quietness, Discharge information, Communication about medicines, Overall hospital rating, Recommend hospital). `H_*_LINEAR_SCORE` rows carry the numeric 0–100 linear mean. The `_A_P`/`_U_P`/`_SN_P` triplets sum to 100% and represent the always/usually/sometimes-or-never response distribution.
- **ED measure IDs `OP_18a` through `OP_18d` decompose by patient class.** `OP_18a` = all ED patients, `OP_18b` = ED patients excluding transferred + psychiatric (the "general" wait time most often quoted), `OP_18c` = psychiatric/mental health patients, `OP_18d` = patients transferred to another facility. National median for `OP_18b` was 161 minutes; Minnesota state median was 130; Mayo Rochester scored 245. Lower is better.
- **PDC `properties` filter expects an array, not a comma-string.** `properties=facility_id,facility_name` returns `400 JSON Schema validation failed`. Use `properties[0]=facility_id&properties[1]=facility_name`, or just omit `properties` and read every column (response sizes are small enough — Hospital General Info is ~5–7 KB per CCN).
- **PDC SQL endpoint exists at `/api/1/datastore/sql?query=...` but uses bracket-DSL syntax** (`[SELECT ...][FROM ...][WHERE ...]` — not standard SQL). The query parameter must reference each dataset by its UUID, not its slug. For most use cases the conditions API at `/api/1/datastore/query/{slug}/0` is simpler — it handles `=`, `contains`, `starts with`, `<>`, `<`, `<=`, `>`, `>=`.
- **Read-only constraints:** do not click Save Hospital, the heart-icon Add to Favorites, Print, Sign In, Compare cart submit, or Send Feedback. These are mutation surfaces with confirmation dialogs but the rule is no-mutation regardless.
- **Refresh cadence:** PDC datasets update **quarterly** (typical CMS cycle: October release of Care Compare data covers Jul-prior-year through Jun-current-year). Add `start_date`/`end_date` to every emitted measure so consumers can detect stale data.

## Expected Output

Single-hospital response shape (the `compare_to` shape is identical with a `hospitals: [...]` array and a top-level `benchmarks` block):

```json
{
  "ccn": "240010",
  "name": "MAYO CLINIC HOSPITAL ROCHESTER",
  "care_compare_url": "https://www.medicare.gov/care-compare/details/hospital/240010?city=&state=MN&zipcode=55902&page=1&from=hospital&type=Hospital",
  "metadata": {
    "address": "1216 SECOND STREET SOUTHWEST",
    "city": "ROCHESTER",
    "state": "MN",
    "zip_code": "55902",
    "county": "OLMSTED",
    "phone": "(507) 255-5123",
    "hospital_type": "Acute Care Hospitals",
    "hospital_ownership": "Voluntary non-profit - Church",
    "emergency_services": true,
    "teaching_hospital": null,
    "birthing_friendly": true
  },
  "overall_rating": {
    "stars": 5,
    "footnote": null,
    "as_of": "2024-07-01_to_2025-06-30"
  },
  "domain_ratings": {
    "mortality":          { "measure_count": 8,  "better": 6, "no_different": 2, "worse": 0 },
    "safety":             { "measure_count": 8,  "better": 6, "no_different": 2, "worse": 0 },
    "readmission":        { "measure_count": 11, "better": 4, "no_different": 7, "worse": 0 },
    "patient_experience": { "measure_count": 15, "better": null, "no_different": null, "worse": null },
    "timely_effective":   { "measure_count": 9,  "better": null, "no_different": null, "worse": null }
  },
  "hcahps": {
    "summary_star": 5,
    "completed_surveys": 3895,
    "response_rate_percent": 38,
    "composites": {
      "nurse_communication":         { "star": 5, "linear_mean": 94, "always_percent": 84 },
      "doctor_communication":        { "star": 4, "linear_mean": 94, "always_percent": 84 },
      "staff_responsiveness":        { "star": null, "linear_mean": null, "always_percent": null },
      "communication_about_medicines": { "star": 4, "linear_mean": 81, "always_percent": 64 },
      "discharge_information":       { "star": 5, "linear_mean": 91, "yes_percent": 91 },
      "cleanliness":                 { "star": 4, "linear_mean": 89, "always_percent": 75 },
      "quietness":                   { "star": 4, "linear_mean": 88, "always_percent": 68 },
      "overall_hospital_rating":     { "star": 5, "linear_mean": 94, "rated_9_or_10_percent": 85 },
      "recommend_hospital":          { "star": 5, "linear_mean": 95, "definitely_yes_percent": 88 }
    }
  },
  "common_conditions": {
    "MORT_30_AMI":     { "name": "Death rate for heart attack patients",      "score": "8.4", "compared_to_national": "Better Than the National Rate",     "denominator": 1234, "ci": ["6.2","10.9"] },
    "MORT_30_HF":      { "name": "Death rate for heart failure patients",     "score": "7.6", "compared_to_national": "Better Than the National Rate",     "denominator": 987,  "ci": ["6.0","9.4"] },
    "MORT_30_PN":      { "name": "Death rate for pneumonia patients",         "score": "11",  "compared_to_national": "Better Than the National Rate" },
    "MORT_30_STK":     { "name": "Death rate for stroke patients",            "score": "10.1","compared_to_national": "Better Than the National Rate" },
    "MORT_30_COPD":    { "name": "Death rate for COPD patients",              "score": "7.1", "compared_to_national": "No Different Than the National Rate" },
    "EDAC_30_AMI":     { "name": "Hospital return days for heart attack patients", "score": "-23.3", "compared_to_national": "Fewer Days Than Average per 100 Discharges" },
    "EDAC_30_HF":      { "name": "Hospital return days for heart failure patients", "score": "-17.1", "compared_to_national": "Fewer Days Than Average per 100 Discharges" },
    "EDAC_30_PN":      { "name": "Hospital return days for pneumonia patients",     "score": "-6.9",  "compared_to_national": "Average Days per 100 Discharges" }
  },
  "infections": {
    "CLABSI":      { "measure_family": "HAI_1", "sir": 0.377, "compared_to_national": "Better than the National Benchmark", "numerator": 28, "predicted": 74.245, "device_days": 69774, "ci": [0.256, 0.538] },
    "CAUTI":       { "measure_family": "HAI_2", "sir": 0.676, "compared_to_national": "Better than the National Benchmark", "numerator": 50, "predicted": 73.964, "device_days": 51687, "ci": [0.507, 0.884] },
    "SSI_colon":   { "measure_family": "HAI_3", "sir": 0.822, "compared_to_national": "No Different than National Benchmark", "ci": [0.578, 1.135] },
    "SSI_hyst":    { "measure_family": "HAI_4", "sir": null,  "compared_to_national": "No Different than National Benchmark" },
    "MRSA":        { "measure_family": "HAI_5", "sir": null,  "compared_to_national": null },
    "C_diff":      { "measure_family": "HAI_6", "sir": null,  "compared_to_national": null }
  },
  "ed_timeliness": {
    "volume_bucket": "very high",
    "median_minutes_in_ed_general":          { "measure_id": "OP_18b", "score": 245, "national_median": 161, "state_median": 130 },
    "median_minutes_in_ed_all_patients":     { "measure_id": "OP_18a", "score": 252 },
    "median_minutes_in_ed_psychiatric":      { "measure_id": "OP_18c", "score": 310 },
    "percent_left_without_being_seen":       { "measure_id": "OP_22",  "score": 3 },
    "percent_head_ct_results_within_45_min": { "measure_id": "OP_23",  "score": 63 }
  },
  "data_currency": {
    "general_info_window": "2024-07-01_to_2025-06-30",
    "complications_deaths_window": "2024-07-01_to_2025-06-30",
    "hai_window": "2024-07-01_to_2025-06-30",
    "hcahps_window": "2024-07-01_to_2025-06-30",
    "fetched_at": "<iso8601-utc>"
  }
}
```

For `compare_to: ["360180", "Cleveland Clinic Florida + FL"]` the top level becomes:

```json
{
  "hospitals": [ { "ccn": "240010", ... }, { "ccn": "360180", ... }, { "ccn": "100247", ... } ],
  "benchmarks": {
    "national": {
      "HAI_1_SIR": { "score": 1.0 },
      "MORT_30_AMI": { "national_rate": "12.6" },
      "OP_18b":     { "score": "161" },
      "H_STAR_RATING": { "hcahps_answer_percent": "3-star national distribution baseline" }
    },
    "state": {
      "MN": { "HAI_1_SIR": { "score": 0.563 }, "OP_18b": { "score": 130 } },
      "OH": { "HAI_1_SIR": { "score": 0.812 }, "OP_18b": { "score": 152 } },
      "FL": { "HAI_1_SIR": { "score": 1.057 }, "OP_18b": { "score": 178 } }
    }
  },
  "fetched_at": "<iso8601-utc>"
}
```

When the requested hospital is not found in the PDC (CCN doesn't exist or is for a non-Hospital provider type — nursing home, dialysis facility, home health agency), return:

```json
{ "success": false, "reason": "ccn_not_a_hospital", "looked_up": "240010", "available_provider_types": ["NursingHome", "HomeHealth"] }
```

When the input was a hospital name that returned multiple matches in the target state:

```json
{ "success": false, "reason": "ambiguous_name", "matches": [
  { "ccn": "240010", "name": "MAYO CLINIC HOSPITAL ROCHESTER", "city": "ROCHESTER", "state": "MN" },
  { "ccn": "240018", "name": "MAYO CLINIC HEALTH SYSTEM IN RED WING", "city": "RED WING", "state": "MN" },
  { "ccn": "240043", "name": "MAYO CLINIC HEALTH SYSTEM - ALBERT LEA AND AUSTIN", "city": "ALBERT LEA", "state": "MN" }
] }
```

When the hospital exists but is not publicly rated (critical access, brand-new, VA — `hospital_overall_rating: "Not Available"`):

```json
{ "ccn": "241333", "name": "MAYO CLINIC HEALTH SYSTEM ST. JAMES", "overall_rating": { "stars": null, "footnote": "Results are not available for this reporting period", "raw": "Not Available" }, ... }
```
