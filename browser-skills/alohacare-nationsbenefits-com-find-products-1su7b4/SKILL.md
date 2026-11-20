---
name: alohacare-nationsbenefits-com-find-products-1su7b4
title: Find Eligible OTC Products on AlohaCare Benefits Pro
description: >-
  Compile eligible/compatible OTC and grocery products on the AlohaCare
  NationsBenefits (Benefits Pro) member portal by trying varied search terms,
  categories, and brand names. Requires member login (Member ID + DOB + 2FA);
  the catalog has no guest/pre-login browse.
website: alohacare.nationsbenefits.com
category: health-benefits
tags:
  - otc-benefits
  - product-search
  - nationsbenefits
  - medicare
  - login-required
  - cloudflare
source: 'browserbase: agent-runtime 2026-06-23'
updated: '2026-06-23'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      Search is backed by an Azure Cognitive Search proxy (searchFields
      SearchGroup/SearchCategory/SearchProductType, suggestionsCount 50)
      reachable only from an authenticated portal session. There is no
      documented, unauthenticated product API — confirmed gated behind member
      login + 2FA.
  - method: fetch
    rationale: >-
      A residential-proxy GET of the homepage returns 200 and the embedded
      loginConfig JSON, but every catalog/search route returns the login app
      with isAuthenticated:false. No product data is fetchable without an
      authenticated session cookie.
verified: true
proxies: true
---
# Find Eligible OTC Products on AlohaCare Benefits Pro

## Purpose

This skill compiles a list of **compatible/eligible products** (over-the-counter
health & wellness items, plus grocery/food where the plan allows) available to an
AlohaCare member through the NationsBenefits "Benefits Pro" portal at
`alohacare.nationsbenefits.com`. The intended approach is to drive the
authenticated product catalog, run the global search with several varied terms,
walk the promoted categories, and filter by brand — collecting product name,
brand, category, price, and benefit eligibility into a structured list. It is a
**read-only** task: stop at search/listing results; never add to cart or check
out.

**Critical precondition:** the catalog is entirely gated behind member
authentication. As of testing (June 2026) there is **no guest/pre-login catalog,
search bar, or product listing of any kind**. Without valid member credentials
(Member ID + Date of Birth) and the ability to clear 2FA, this task cannot reach
a single product. Treat valid member credentials as a hard input requirement.

## When to Use

- A logged-in AlohaCare member wants to discover which OTC/grocery products their
  benefit dollars can buy, by exploring search terms, categories, and brands.
- You need to build a compatible-product shortlist (e.g. "all eligible vitamins",
  "first-aid items under brand X") before placing an order elsewhere.
- You are auditing what the AlohaCare Benefits Pro catalog exposes for a given
  member's benefit (OTC vs. grocery vs. combined).

Do **not** use this skill if you lack member credentials — there is no
unauthenticated path to product data (see Site-Specific Gotchas).

## Workflow

The recommended method is **browser** (authenticated). There is no usable API or
fetch shortcut: the search backend is an Azure Cognitive Search proxy that only
responds inside an authenticated portal session, and every catalog/search route
serves the login SPA with `isAuthenticated:false` until you sign in. Do not waste
time hunting for a public product endpoint — confirmed gated.

1. **Use a stealth session.** The site sits behind Cloudflare + Cloudflare
   Turnstile (WAF). Create the Browserbase session with `--verified --proxies`.
   A bare datacenter session intermittently passes but the homepage WAF returns
   `403` to unstealthed/HTTP-like clients (the pre-run probe got 403). Stealth +
   residential proxy is the reliable configuration.

2. **Open the portal:** `browse open https://alohacare.nationsbenefits.com/`.
   The landing page is the **Login** form (title becomes `Login: NationsBenefits`).
   Fields: **Member ID** (text) and **Date of Birth** (MM-DD-YYYY). The Member ID
   is the value printed on the member's **Health Plan ID card** — a 16-digit
   prepaid-card number or a username from another site will NOT work.

3. **Authenticate.** Fill Member ID + DOB and submit. The login template is
   `OTCInCommStandard2FA`, so a **two-factor step** follows: select a 2FA channel
   and enter the access code (delivered by the health plan via email, SMS, or a
   plan-provided access code). You must have access to that code; there is no way
   around it. An unregistered Member ID is bounced to a registration flow on
   `members.nationsbenefits.com` instead of logging in.

4. **Open the catalog / global search.** Once authenticated (`enableGlobalSearch:
   true`, `enableNewMarketplace: true`), use the global search box. The search is
   backed by Azure Cognitive Search over fields `SearchGroup`, `SearchCategory`,
   and `SearchProductType` (autosuggest returns up to 50 suggestions).

5. **Sweep with varied inputs to maximize coverage.** Because eligibility is
   plan-specific and the catalog is large, compile products by iterating:
   - **Search terms / synonyms:** e.g. `vitamins`, `multivitamin`, `tylenol`,
     `acetaminophen`, `pain relief`, `band aid`, `bandages`, `first aid`,
     `toothpaste`, `denture`, `blood pressure monitor`, `glucose`.
   - **Categories:** walk the promoted categories (testing showed `Food` and
     `Nuance™ Audio Glasses` promoted) plus the full category tree.
   - **Brands:** filter/search by brand name to surface brand-specific eligible
     SKUs.
   For each result, record name, brand, category, price, and the eligibility
   indicator the portal shows for the member's benefit.

6. **De-duplicate and compile** the union of results across all terms/categories/
   brands into the output list. Stop at the results/listing view — do not add to
   cart or check out.

### Browser fallback / notes

There is no non-browser fallback that reaches products. The only thing reachable
without auth is the homepage HTML (and its embedded `loginConfig`/`appConfig`
JSON), Terms & Conditions, Privacy Policy, HIPAA, Non-Discrimination, and the
card-activation page — none contain catalog data. A logged-in member may also use
the portal's "Download/Email/Mail Catalog" feature (`allowDownloadCatalog`,
`otcCatalogCdnUrl: https://nationscdn.azureedge.net/otc-container/pdf/`) to get a
PDF catalog, but those PDF links are only surfaced post-login.

## Site-Specific Gotchas

- **No guest catalog — hard wall.** `alwaysViewCatalog` is `false` in the portal
  config. Every authenticated route (`/home`, `/search`, `/order`, `/dashboard`)
  redirects to the login page, and direct catalog guesses (`/catalog`, `/shop`,
  `/products`, `/otc`, `/browse`, `/product-catalog`) return 404. Both an
  independent recon pass and the autobrowse inner agent confirmed this — do not
  re-investigate; member auth is mandatory.
- **Login input is Member ID + DOB, then 2FA.** Template `OTCInCommStandard2FA`.
  The Member ID is from the Health Plan ID card (`InsuranceCarrierID: 331`,
  `healthPlanCode: ["H90"]`). A 16-digit Mastercard prepaid card number or a
  username from another NationsBenefits site does NOT grant access. 2FA cannot be
  bypassed without the plan-issued access code.
- **Cloudflare WAF + Turnstile.** `cloudFlare.isEnabled: true`,
  `SiteKey: 0x4AAAAAACEJ2z8MkPuL-Hqo`, served from
  `challenges.cloudflare.com/turnstile/v0/`. The homepage pre-run probe returned
  `403` (cloudflare, cloudflare-waf). Use `--verified --proxies`. A residential
  proxy HTTP GET (`browse cloud fetch ... --proxies`) does return 200 for the
  homepage HTML, but that only yields the login SPA, never product data.
- **Eligibility is benefit-specific.** The portal models multiple spending types
  (`combinedotc`, `combinedgrocery`, `GROCERY`, `OTC`) and uses FIS for eligibility
  (`allowCheckEligProducts: true`, `hideProductEligibility: true`). The same SKU
  may be eligible for one member's benefit and not another's — always read the
  eligibility shown for the logged-in member, don't assume catalog-wide eligibility.
- **Search backend.** Azure Cognitive Search; `searchFields:
  ["SearchGroup","SearchCategory","SearchProductType"]`, `suggestionsCount: 50`.
  Product images come from
  `https://nationscdn.azureedge.net/otc-container/Nations_Product_Images`.
- **Session timeout is short.** `sessionTimeout: 15` (minutes). Long catalog
  sweeps may require re-auth; batch your searches.
- **Multi-plan members.** A "Switch Benefit" control (top-right) toggles between a
  member's available benefits; the catalog/eligibility shown changes per selected
  benefit. Sweep each benefit if the member has more than one.
- **Promoted categories observed:** `Food` and `Nuance™ Audio Glasses`
  (`categoriesToPromot`). Nuance Audio frames link out to LensCrafters / Target
  Optical / Pearle Vision / For Eyes for prescription lenses.

## Expected Output

A JSON object compiling the eligible products found, with the search strategy used.

Successful (authenticated) shape:

```json
{
  "success": true,
  "catalog_accessible_without_login": false,
  "authenticated": true,
  "benefit_selected": "OTC",
  "search_terms_tried": ["vitamins", "tylenol", "band aid", "first aid", "toothpaste"],
  "categories_browsed": ["Food", "Health & Wellness", "First Aid"],
  "brands_filtered": ["Equate", "Tylenol"],
  "products": [
    {
      "name": "Acetaminophen Extra Strength 500mg, 100 ct",
      "brand": "Equate",
      "category": "Pain & Fever",
      "product_type": "OTC",
      "price": "3.98",
      "eligible": true,
      "image_url": "https://nationscdn.azureedge.net/otc-container/Nations_Product_Images/<sku>.jpg"
    }
  ],
  "error_reasoning": null
}
```

Blocked shape (no member credentials available — the outcome of this build, since
the catalog is fully gated):

```json
{
  "success": false,
  "catalog_accessible_without_login": false,
  "authenticated": false,
  "blocker": "member-login-required-with-2fa",
  "products": [],
  "search_terms_tried": [],
  "error_reasoning": "alohacare.nationsbenefits.com is fully gated behind member authentication. The landing page is a Login form requiring Member ID (from the Health Plan ID card) + Date of Birth, followed by 2FA (template OTCInCommStandard2FA). All authenticated routes redirect to login; direct catalog URLs (/catalog, /shop, /products, /otc, /browse) return 404. isAuthenticated:false for unauthenticated sessions. No guest/pre-login catalog, search bar, or product listing exists."
}
```
