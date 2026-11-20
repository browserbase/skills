---
name: healthcare-gov-compare-plans-ruai96
title: HealthCare.gov Compare ACA Plans
description: >-
  Given a US ZIP, household composition, and income, return ACA marketplace
  plans from healthcare.gov with full premium and cost-sharing details. Handles
  the full filter surface (metal tier, CSR variant, plan type, issuer, HSA,
  premium/deductible/OOP ranges, drug + provider lookup) and short-circuits to a
  redirect_to_state_exchange status for the 20+ SBM states.
website: healthcare.gov
category: healthcare
tags:
  - healthcare
  - aca
  - marketplace
  - insurance
  - subsidy
  - cms
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: api
alternative_methods:
  - method: api
    rationale: >-
      The healthcare.gov see-plans SPA is backed by a public, unauthenticated
      JSON API at marketplace-int.api.healthcare.gov/api/v1 (the Akamai-fronted
      host the production tool uses; the documented
      marketplace.api.healthcare.gov host requires an apikey query param). GET
      endpoints for counties/states/drugs/providers and POST endpoints for
      plans/search and households/eligibility/estimates cover the full filter
      and quote surface. ~30x cheaper than scripted browsing.
  - method: browser
    rationale: >-
      Fallback only — if the API endpoints stop responding. Requires Browserbase
      --verified + --proxies (Akamai-protected). Walks the 4-step household form
      (ZIP, year, household composition, income), reaches the plan grid at
      /see-plans/#/plan/results, and reads the Redux store at
      window.store.getState().plans rather than DOM-scraping cards.
verified: false
proxies: true
---
# HealthCare.gov Compare ACA Marketplace Plans

## Purpose

Given a US ZIP code, household composition (ages, tobacco use, expected income), and plan year, return the ACA marketplace health plans available to that household with full premium and cost-sharing details as structured JSON. Surface the full filter surface (metal tier, CSR variant, plan type, issuer, HSA-eligible, premium / deductible / OOP-max ranges, dental, national network, drug + provider lookup), the household's estimated APTC and CSR eligibility, and pagination. When the resolved state runs its own marketplace (SBM), return `redirected_to_state_exchange` with the destination URL instead of attempting to scrape the state's own site. Read-only — never starts an application.

## When to Use

- "What ACA plans are available for a household at ZIP 78701, income $48k, two adults age 34 and 36 non-smoker, for plan year 2026?"
- Premium-tax-credit (APTC) and Cost-Sharing-Reduction (CSR Silver-73 / 87 / 94) eligibility estimation.
- Filtering plans by metal tier, issuer, HSA eligibility, deductible/OOP/premium ranges, doctor/drug coverage.
- Programmatic comparison shopping for individual / family marketplace plans across counties.
- **Not for**: actual enrollment, SEP applications, Medicaid/CHIP applications, SHOP (small-business) employer enrollment, off-exchange plans.

## Workflow

The healthcare.gov "See Plans & Prices" tool (`/see-plans/`) is a React SPA that calls a **public, unauthenticated JSON API** at `https://marketplace-int.api.healthcare.gov/api/v1`. The API key requirement applies only to the developer-facing host `marketplace.api.healthcare.gov` (the documented `developer.cms.gov/marketplace-api/` surface); the `marketplace-int.*` host fronted by Akamai is the one the public web tool uses and accepts any request that carries `Origin: https://www.healthcare.gov` (or no Origin at all, in our testing). **Always lead with the API path** — scripted browsing of the SPA costs ~30× more turns, walks a 4-step household form, and provides no information the API doesn't already return.

Required session: `browse cloud sessions create --proxies`. `--verified` (Verified browsers) is **not** needed for the API path. The browser fallback below requires both `--verified` and `--proxies` because the SPA's pages are Akamai-protected.

### 1. Resolve location & route around state-based marketplaces

`GET /api/v1/counties/by/zip/{zip}?year={year}` → `{ counties: [{ zipcode, name, fips, state }] }`. A single ZIP can map to multiple counties (this is rare but real for ZIPs that straddle county boundaries — present the user with the disambiguation in `counties[]` and require them to pick `fips`).

Then `GET /api/v1/states/{stateAbbrev}?year={year}` → `{ marketplace_model: "FFM" | "SBM", hix_name, hix_url, ... }`.

- `marketplace_model === "FFM"` → continue to step 2.
- `marketplace_model === "SBM"` → return `{ status: "redirected_to_state_exchange", redirect_url: <hix_url>, redirect_name: <hix_name> }` and stop. Do NOT try to scrape the state's own marketplace — that's a different skill per exchange.

**As of plan-year 2026, 20 states + DC are SBM and redirect out**: CA (Covered California), NY (NY State of Health), WA (Washington HealthPlanFinder), CO (Connect for Health Colorado), MA (Massachusetts Health Connector), CT (Access Health CT), MD (Maryland Health Connection), NJ (Get Covered NJ), PA (Pennie), ID (Your Health Idaho), MN (MNSure), NV (Nevada Health Link), RI (HealthSourceRI), VT (Vermont Health Connect), DC (DC Health Link), KY (Kynect), ME (CoverME.gov), NM (BeWellNM), VA (Virginia's Insurance Marketplace), **GA (Georgia Access — migrated for plan-year 2025; commonly missed in older skill specs)**. All remaining states are FFM and served by healthcare.gov. **Always re-fetch `/states/{abbrev}` instead of hard-coding the list — Georgia was the most recent migration and others will follow.**

### 2. (Optional) Estimate APTC + CSR before plan-search

`POST /api/v1/households/eligibility/estimates`:

```json
{
  "household": {
    "income": 48000,
    "people": [
      { "age": 34, "aptc_eligible": true, "gender": "Female", "uses_tobacco": false, "relationship": "Self", "is_pregnant": false }
    ],
    "has_married_couple": false,
    "unemployment_received": "None"
  },
  "place": { "countyfips": "48453", "state": "TX", "zipcode": "78701" },
  "year": 2026
}
```

Response: `{ estimates: [{ aptc: 323.5, csr: "<csr-code>", is_medicaid_chip: false, hardship_exemption: false, ... }] }`. `estimates[]` is keyed per-applicant (in entry order). `aptc` is monthly subsidy in USD. `csr` is one of:

| `csr` value | Skill output (`csr_tier`) | Trigger |
|---|---|---|
| `"Exchange variant (no CSR)"` | `null` | Income ≥ 250% FPL, or non-Silver pick |
| `"73% AV Level Silver Plan CSR"` | `"Silver 73"` | 200 – 250% FPL, Silver only |
| `"87% AV Level Silver Plan CSR"` | `"Silver 87"` | 150 – 200% FPL, Silver only |
| `"94% AV Level Silver Plan CSR"` | `"Silver 94"` | 100 – 150% FPL, Silver only |
| `"Zero Cost Sharing Plan Variation"` | `"AIAN Zero"` | American Indian / Alaska Native < 300% FPL |
| `"Limited Cost Sharing Plan Variation"` | `"AIAN Limited"` | American Indian / Alaska Native any income |

`is_medicaid_chip: true` means the applicant is likely **Medicaid- or CHIP-eligible** — they should apply through their state Medicaid agency, NOT enroll on healthcare.gov. Surface this as a top-level `medicaid_chip_eligible: true` flag in the quote so downstream agents don't return junk plans for someone who'd qualify for free coverage.

### 3. Search plans

`POST /api/v1/plans/search`:

```json
{
  "household": {
    "income": 48000,
    "people": [
      { "age": 34, "aptc_eligible": true, "gender": "Female", "uses_tobacco": false, "has_mec": false, "relationship": "Self" }
    ],
    "has_married_couple": false,
    "unemployment_received": "None"
  },
  "market": "Individual",
  "place": { "countyfips": "48453", "state": "TX", "zipcode": "78701" },
  "year": 2026,
  "filter": {
    "division": "Health",
    "premium_range":    { "min": 0,   "max": 500 },
    "deductible_range": { "min": 0,   "max": 3000 },
    "disease_mgmt_programs": [],
    "hsa": true,
    "issuer": ["73066"],
    "drugs": [ { "rxcui": "617318" } ],
    "providers": [ { "npi": "1184185886" } ],
    "metal_levels": ["Silver", "Gold"],
    "metal_design_types": [
      { "metal_level": "Silver", "design_types": ["DESIGN1","DESIGN2","DESIGN3","DESIGN4","DESIGN5","NOT_APPLICABLE"] }
    ],
    "types": ["HMO", "PPO"]
  },
  "limit": 25,
  "offset": 0,
  "order": "asc",
  "suppressed_plan_ids": [],
  "sort": "premium",
  "aptc_override": null
}
```

Field semantics:

- **`market`** — `"Individual"` (everything this skill covers) or `"SHOP"` (small-business; different rules — not in scope).
- **`filter.division`** — `"Health"` for medical plans, `"Dental"` for standalone dental.
- **`filter.metal_levels`** — accepts `["Bronze","Silver","Gold","Platinum","Catastrophic"]`. **Note: there is no `"Expanded Bronze"` level in the API** — the marketplace's "Expanded Bronze" label is a UI rollup that maps to plans with `metal_level: "Bronze"` carrying a specific `design_type`. Pass `"Bronze"` alone to get both standard and expanded-bronze plans.
- **`filter.metal_design_types`** — controls the on-/off-exchange "standard" plan rollup. The five `DESIGN1`..`DESIGN5` are CMS standard-plan blueprints; `NOT_APPLICABLE` is the non-standard variant. Include all six to match the UI's default of "show all designs."
- **`filter.types`** — accepts `["EPO","HMO","Indemnity","POS","PPO"]`.
- **`filter.issuer`** — array of issuer IDs (the 5-digit `id` returned in `plan.issuer.id`, not the issuer's display name). To enumerate available issuers for a county, run an initial unfiltered `/plans/search` and read `facet_groups[name=issuer]`.
- **`filter.hsa`** — `true` shows HSA-eligible HDHPs only.
- **`filter.premium_range` / `filter.deductible_range`** — both have `min`/`max` keys (USD). Omit the key entirely to skip the bound; **do not** send `null`.
- **`filter.drugs[]`** — each entry is `{ rxcui: "<id>" }`. Look up `rxcui` via `GET /drugs/autocomplete?q=<name>&year=<yyyy>` or `GET /drugs/search?q=<name>&year=<yyyy>`. When the drug filter is set, every returned plan carries a `drug_coverage` block with the plan-specific tier + cost-share.
- **`filter.providers[]`** — each entry is `{ npi: "<10-digit-npi>" }`. Look up `npi` via `GET /providers/autocomplete?q=<name>&zipcode=<zip>&year=<yyyy>`. Provider-coverage data is plan-specific and not surfaced by every issuer.
- **`sort`** — `"premium"` (after-subsidy monthly premium ascending, the SPA's default), `"deductible"` (combined medical+drug deductible ascending), or `"oopcost"` (out-of-pocket-max ascending).
- **`order`** — `"asc"` is the only value the SPA uses; `"desc"` is accepted but un-validated.
- **`limit` / `offset`** — the SPA's default page size is `10`. The API accepts up to **100 per page**; iterate `offset += limit` to paginate. `total` in the response gives the unfiltered count.
- **`suppressed_plan_ids`** — array of HIOS IDs to exclude. Use when you want to dedupe across issuer crosswalks.
- **`aptc_override`** — `null` means use the API's computed APTC. Set to a number to pin a specific monthly subsidy (used internally when a household has run the eligibility flow once and wants to lock the APTC across paginated calls; recommend leaving `null` and re-running step 2 if income changes).

### 4. Normalize the response

`response.plans[]` items carry (key fields):

| Field | Meaning |
|---|---|
| `id` | HIOS plan ID, 14-char e.g. `73066TX1234567-01` |
| `name` | Plan marketing name |
| `issuer` | `{ id, name, ... }` — `id` is the issuer key for the filter |
| `metal_level` | `"Bronze"` \| `"Silver"` \| `"Gold"` \| `"Platinum"` \| `"Catastrophic"` |
| `type` | `"EPO"` \| `"HMO"` \| `"Indemnity"` \| `"POS"` \| `"PPO"` |
| `premium` | Base monthly premium before subsidy (USD) |
| `premium_w_credit` | Monthly premium after APTC (USD). `0` is valid — happens with high APTC at 100–150% FPL with Bronze. |
| `aptc` | APTC applied to this plan (USD/month) |
| `deductibles[]` | `{ type, amount, family_cost, csr }`. `type` is one of `"Medical EHB Deductible"`, `"Drug EHB Deductible"`, `"Combined Medical and Drug EHB Deductible"`. `family_cost` is one of `"Individual"`, `"Family"`, `"Family Per Person"`. |
| `moops[]` | Maximum Out-Of-Pocket structure, same shape as `deductibles[]` |
| `benefits[]` | `{ name, covered, copay_options: [{ copay_amount, coinsurance_rate, copay_inn_tier1, coinsurance_inn_tier1, ... }], explanation }`. Filter `benefits` by `name` to extract `Primary Care Visit`, `Specialist Visit`, `Urgent Care`, `Emergency Room`, `Generic Drugs`, `Preferred Brand Drugs`, `Non-Preferred Brand Drugs`, `Specialty Drugs`, `Inpatient Hospital`, `Laboratory Outpatient and Professional Services`, `X-rays and Diagnostic Imaging`. |
| `hsa_eligible` | bool |
| `network` | `{ id, name }` |
| `brochure_url` | Summary-of-Benefits-and-Coverage (SBC) PDF |
| `formulary_url` | Drug formulary PDF/HTML |
| `provider_directory_url` | Provider-network directory URL |
| `service_area_id`, `effective_date`, `expiration_date` | Plan-year window |

**Canonical plan-detail page URL** (constructed client-side from the HIOS id):

```
https://www.healthcare.gov/see-plans/#/plan/results/{HIOS_ID}/details
```

This is a hash-route — the path stays fixed and the SPA reads `HIOS_ID` from the fragment. Linkable but JavaScript-required.

`response.facet_groups[]` carries the live filter counts for the current household + place + year (e.g. `{ name: "metalLevels", facets: [{ value: "Silver", count: 42 }, ...] }`). Use this to populate filter UI rather than guessing. `response.total` gives the un-paginated count.

### 5. Drug / provider in-network sub-skill

`drug_coverage` + `provider_coverage` come back **only when the corresponding filter is set**. To answer a standalone "does Plan X cover atorvastatin?" question, issue `POST /plans/search` with `filter.drugs: [{ rxcui }]` *and* `suppressed_plan_ids` of all other plan IDs you don't care about (or just set `limit: 1` after filtering down to that issuer with `filter.issuer`).

### Browser fallback

Use the browser path only if the API endpoints above ever stop responding (none did across 2026-05 testing). Verified + residential proxy is mandatory:

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies | jq -r .id)
export BROWSE_SESSION="$SID"
browse open "https://www.healthcare.gov/see-plans/" --remote
browse wait load && browse wait timeout 4000
browse snapshot
# Walk: ZIP step → year step → household-size step → per-member age/sex/tobacco step → income step → plan grid
# Plan grid: #/plan/results — read plan cards, capture "Plan Details" hrefs (#/plan/results/<HIOS>/details)
# Filter side-rail: metal_levels checkboxes, types checkboxes, hsa toggle, premium/deductible sliders, issuer multiselect
# Sort dropdown lives at the top-right of the grid: "Lowest premium" / "Lowest deductible" / "Lowest total yearly cost"
```

The SPA writes its plan-state into `window.__INITIAL_STATE__`-equivalent via Redux dev-tools-compatible store; reading `window.store.getState().plans` via `browse eval` is far cheaper than DOM-scraping each card, but only works because the SPA bundle doesn't tree-shake the store off `window` in production builds. **Confirm with `browse eval "typeof window.store"` first** — if the bundle ever switches, fall back to plan-card scraping.

## Site-Specific Gotchas

- **`marketplace-int.api.healthcare.gov` vs `marketplace.api.healthcare.gov`**: the `-int` host fronted by Akamai is the one the production see-plans SPA uses and is reachable with no API key. The non-`-int` host (developer.cms.gov-documented) requires an `?apikey=<key>` query param obtained from the CMS developer portal. Both serve the same data; prefer `-int` for zero-friction access. If `-int` is ever 403'd as anti-bot, fall back to the keyed `marketplace.api.healthcare.gov` host.
- **Georgia is now a State-Based Marketplace** (Georgia Access, launched for plan-year 2025). Older skill specs and many third-party SBM lists omit it — always re-fetch `/api/v1/states/{abbrev}` instead of hard-coding the SBM list. Future-year migrations are announced annually.
- **"Expanded Bronze" is a UI label, not an API metal level.** The API knows `Bronze`, `Silver`, `Gold`, `Platinum`, `Catastrophic`. Expanded-Bronze plans come back as `metal_level: "Bronze"` with HSA-style design. Don't try to filter by `"Expanded Bronze"` — you'll get an empty result set.
- **CSR is plan-design-bundled, not a separate plan.** Silver plans appear once in the result set; the API returns a `csr` field reflecting the variant the *household qualifies for*. Households at < 250% FPL who pick a non-Silver plan forfeit CSR (the API still returns CSR-eligible flag in `estimates[]`). Surface a `loses_csr_with_non_silver: true` warning when the household is CSR-eligible AND the requested filter excludes Silver.
- **`premium_w_credit: 0` is valid.** Some plans (typically Bronze at 100–150% FPL) cost $0/month after APTC. Don't treat 0 as missing data.
- **Catastrophic plans are age-gated.** They're returned only when at least one applicant is under 30 *or* qualifies for a hardship exemption. The API enforces this silently — Catastrophic just doesn't appear in `plans[]` for a 35-year-old, even with `filter.metal_levels: ["Catastrophic"]`.
- **`design_types` controls "standard plan" rollup.** CMS pre-defined 5 standard plan blueprints (`DESIGN1`..`DESIGN5`) for plan-year 2026; issuers can offer those or non-standard variants (`NOT_APPLICABLE`). The see-plans UI hides non-standard by default in some states. If you're missing plans you expect to see, include `"NOT_APPLICABLE"` in the design_types array — the SPA's default does.
- **`aptc_eligible: true` per-person is the trigger for subsidy math.** Set it `true` for every household member applying for coverage, `false` for tax-dependents not in this coverage (e.g. a spouse on Medicare). Setting it `true` for a person who is on Medicaid will inflate the APTC artificially — use `is_medicaid_chip` from step 2's response to detect and exclude them.
- **`uses_tobacco`** affects the per-person rate. The API applies the federal max 50% tobacco surcharge by default; states that ban it (CA — moot, SBM; NY — moot, SBM; NJ — moot, SBM; VT — moot, SBM; DC — moot, SBM; MA — moot, SBM) handle this through their own exchanges. All current FFM states allow the surcharge.
- **Page size 10 is the SPA default, 100 is the API max.** The user prompt asked for 25; the API will happily return that. The SPA paginates by 10 only because of UI layout, not API rate-limits.
- **`countyfips` is mandatory.** ZIP alone is not enough — for ZIPs that span counties (a few thousand nationwide) the API will 400 with "no county set" until you pass a 5-digit `countyfips`. Always resolve via `/counties/by/zip/{zip}` first and force the caller to choose if there's more than one.
- **`income` is annual household MAGI in whole USD.** Don't send monthly. Negative income (`-1`) is the API's sentinel for "unknown/skip APTC math" — match that when the user declines to share income.
- **Don't hit `POST /plans/qq`.** The "quick quote" endpoint (`/plans/qq`) is for the SPA's pre-household-form anonymous-quote shortcut — it returns a stripped plan list without full benefits. The full `/plans/search` is what you want for everything except a "show a single number" landing page.
- **Plan-detail GET works without auth too.** `GET /api/v1/plans/{hios_id}?year={year}` returns the same plan object as inside `/plans/search.plans[]`, useful for refreshing a single plan without re-running the full search.
- **No `network_breadth` field on the FFM marketplace API.** The "Network Breadth" label ("Standard", "Basic", "National") shown on some state-exchange sites does NOT come back from healthcare.gov's API. Surface `network.name` instead and document the absence.
- **National-network detection.** There's no `national_network: bool` field. To detect multi-state networks, inspect `plan.issuer.name` for known national carriers (Aetna CVS Health, Cigna, UnitedHealthcare, Anthem BCBS) AND look at `plan.network.name` for substrings like `"National"`, `"PPO Nationwide"`, `"National POS"`. False positives are common — recommend treating it as a heuristic, not a filter.
- **Dental coverage**: standalone dental plans live in `division: "Dental"`. Bundled-dental medical plans have `benefits` entries like `"Routine Dental Services (Adult)"`. Use the `benefits` array to detect bundled dental; switch `division` to `"Dental"` for standalone-dental search.
- **READ-ONLY.** Never POST to `/enrollment`, `/applications`, or any path under `/marketplace/` — those start a real application. The skill only ever touches `/api/v1/{counties,states,plans,drugs,providers,households/eligibility/estimates}`.

## Expected Output

Three distinct outcome shapes:

```jsonc
// FFM state, plans returned
{
  "success": true,
  "status": "ok",
  "quote": {
    "zip": "78701",
    "countyfips": "48453",
    "state": "TX",
    "marketplace_model": "FFM",
    "coverage_year": 2026,
    "effective_date": "2026-01-01",
    "household_size": 1,
    "estimated_aptc_monthly": 323.50,
    "csr_tier": null,                       // "Silver 73"|"Silver 87"|"Silver 94"|"AIAN Zero"|"AIAN Limited"|null
    "medicaid_chip_eligible": false,
    "loses_csr_with_non_silver_filter": false
  },
  "filters_applied": {
    "metal_levels": ["Silver", "Gold"],
    "types": ["HMO", "PPO"],
    "issuer": [],
    "hsa": false,
    "premium_range": { "min": 0, "max": null },
    "deductible_range": { "min": 0, "max": null },
    "oop_max_range":    { "min": 0, "max": null },
    "drugs": [], "providers": [], "dental_included": null, "national_network": null
  },
  "facet_counts": {
    "metalLevels": { "Bronze": 18, "Silver": 22, "Gold": 11, "Platinum": 3, "Catastrophic": 0 },
    "types":       { "HMO": 26, "PPO": 8, "EPO": 12, "POS": 6, "Indemnity": 2 },
    "issuer":      { "73066": 14, "67784": 18, "...": 22 },
    "hsa":         { "true": 11, "false": 43 }
  },
  "sort": "premium",
  "pagination": { "limit": 25, "offset": 0, "total": 54 },
  "plans": [
    {
      "hios_id": "73066TX1234567-01",
      "name": "Blue Advantage Silver HMO 005",
      "issuer": { "id": "73066", "name": "Blue Cross and Blue Shield of Texas" },
      "metal_tier": "Silver",
      "csr_variant": null,
      "plan_type": "HMO",
      "monthly_premium_before_subsidy": 412.50,
      "monthly_premium_after_subsidy": 89.00,
      "estimated_aptc_applied": 323.50,
      "deductible_combined_individual": 4500,
      "deductible_medical_individual": null,
      "deductible_drug_individual": null,
      "deductible_combined_family": 9000,
      "out_of_pocket_max_individual": 8200,
      "out_of_pocket_max_family": 16400,
      "copay_primary_care": "$30",
      "copay_specialist": "$60",
      "copay_urgent_care": "$75",
      "copay_er": "$500",
      "copay_generic_drug": "$10",
      "copay_preferred_brand_drug": "$45",
      "copay_hospital_stay": "20% coinsurance after deductible",
      "plan_year_start": "2026-01-01",
      "plan_year_end": "2026-12-31",
      "hsa_eligible": false,
      "network_name": "Blue Advantage HMO",
      "summary_of_benefits_url": "https://www.bcbstx.com/.../sbc.pdf",
      "formulary_url": "https://www.bcbstx.com/.../formulary",
      "provider_directory_url": "https://www.bcbstx.com/find-a-doctor",
      "plan_detail_url": "https://www.healthcare.gov/see-plans/#/plan/results/73066TX1234567-01/details"
    }
    // ...up to `limit` more
  ]
}

// State-based marketplace — redirect out
{
  "success": true,
  "status": "redirected_to_state_exchange",
  "quote": {
    "zip": "94110", "countyfips": "06075", "state": "CA",
    "marketplace_model": "SBM", "coverage_year": 2026
  },
  "redirect_url": "https://www.coveredca.com/",
  "redirect_name": "Covered California",
  "plans": []
}

// Failure (no county for ZIP, invalid year, etc.)
{ "success": false, "error": "ZIP 99999 not recognized in CMS county database for plan year 2026" }
```
