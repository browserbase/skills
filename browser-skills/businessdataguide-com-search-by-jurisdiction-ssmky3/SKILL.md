---
name: businessdataguide-com-search-by-jurisdiction-ssmky3
title: businessdataguide — Search by Jurisdiction
description: >-
  Look up the official company registry and KYB workflow for any of 209
  jurisdictions on businessdataguide.com — registry name+URL, cost band (USD),
  English-UI, account/local-ID requirements, captcha+2FA friction, API
  availability, turnaround, and last-verified date. Direct URL fetch (no
  browsing required); soft-404 handling for unknown slugs.
website: businessdataguide.com
category: compliance
tags:
  - compliance
  - kyb
  - kyc
  - company-registry
  - aml
  - jurisdiction
  - agent-friendly
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: url-param
alternative_methods: []
verified: false
proxies: false
---
# businessdataguide — Search by Jurisdiction

## Purpose

Look up authoritative metadata about the official company registry and KYC/KYB workflow for a given country or jurisdiction on `businessdataguide.com` — registry name + URL, cost band (USD), English-UI availability, account / local-ID requirements, captcha + 2FA friction, official-API availability, turnaround time, last-verified date, and (where applicable) the API auth model + rate limits. Covers **209 jurisdictions**. Read-only; never submits forms or follows registry-outbound links beyond capturing the URL.

This skill does **not** search a target registry directly — it surfaces businessdataguide's editorial intelligence *about* registries so an agent can pick the right one. Use a separate skill if you need to actually run a name/number search on (e.g.) Companies House or ACRA Bizfile+.

## When to Use

- "Where do I look up a company registered in {country}? What's it cost, is it in English, is there an API?"
- Building a compliance / KYB / AML onboarding workflow and need a per-jurisdiction friction profile before integrating a vendor.
- Comparing registry-access conditions across 2–5 jurisdictions side-by-side (cost, API, UBO availability, captcha presence).
- Retrieving a structured KYB workflow checklist for a single country (markdown, RAG-ingestible).
- Discovering which of the 209 jurisdictions have a documented official REST/JSON API (only 5 as of 2026-05: UK, Greece, Japan, Singapore, Spain).

## Workflow

The site is **agent-first**: it advertises an [`agentskills.org` v0.2.0 manifest](https://www.businessdataguide.com/.well-known/agent-skills/index.json) plus `/llms.txt` + `/llms-full.txt` in HTTP `Link` headers, the sitemap is fully populated, every jurisdiction has a stable URL slug, and there is no anti-bot challenge (Cloudflare CDN, but plain `GET` requests succeed first-try with no captcha / JS challenge / rate-limit pushback observed). A residential proxy is **not** required. Lead with direct `GET` requests; the browser path is a fallback only when you need the rendered comparison-table HTML.

### 1. Pick the right surface for the question

| Question shape | URL to GET | Output |
|---|---|---|
| "Give me everything you know about {country}'s registry, as a workflow checklist." | `https://www.businessdataguide.com/tools/checklist/{slug}.md` | ~1 KB markdown, 6-step structured checklist (registry name, URL, operator, account/local-ID, cost band, payment methods, captcha/2FA, English UI, turnaround, last-verified date). **RAG-ingestible.** Preferred for single-country lookups. |
| "Give me the full editorial guide for {country}." | `https://www.businessdataguide.com/blog/jurisdictions/{slug}-company-search-guide` | ~300 KB HTML with chrome. Contains the same fields as the checklist plus narrative context, regulator history, document-type-to-use-case mapping, BO/UBO regime notes, and per-country supplier landscape. Extract the main `<article>` body or convert with `browse get markdown body`. |
| "Compare 2–5 jurisdictions side-by-side." | `https://www.businessdataguide.com/tools/compare-countries?countries={slug1},{slug2},...` | HTML page with a comparison table (Registry, English UI, Account Required, Local ID, Captcha/2FA, Price USD, API Available, Turnaround, Last Verified, Friction Score 0–100). Bookmarkable URL. Comma-separated slugs, max 5. Comma does **not** need URL-encoding but `%2C` also works. |
| "Which jurisdictions does the site cover?" | `https://www.businessdataguide.com/sitemap-0.xml` | 509 URLs; filter for `/blog/jurisdictions/{slug}-company-search-guide` to enumerate the 209 covered jurisdictions. |
| "Top-5 jurisdictions condensed, plus reference articles." | `https://www.businessdataguide.com/llms-full.txt` | Single ~13 KB markdown file. Contains expanded abstracts for Singapore, Malaysia, Hong Kong, UK, Indonesia + four reference articles (Global DD guide, AML monitoring, CDD for fund admins, EDD, UBO explainer) + API directory summaries + tools catalogue. SHA-256 published in the agent-skills manifest for integrity checks (`79d8797977d9478136c63e494c718c1e24aa391f9534d695f332f0b1d27c7d57` as of 2026-05-19). |
| "Suppliers (KYC platforms, AML vendors, data aggregators) covering {country}." | `https://www.businessdataguide.com/suppliers/{slug}` | HTML; per-jurisdiction supplier directory. 225 supplier pages total (209 country + 16 category-tag at `/suppliers/tag/{category}`). |
| "Official registry API specs (auth, rate limits, endpoint)." | `https://www.businessdataguide.com/api-directory/{slug}-registry-api` | HTML; **only 5 jurisdictions have a dedicated API page** as of 2026-05: `uk`, `greece`, `japan`, `singapore`, `spain`. For all others, the per-country guide notes API availability but no dedicated spec page exists. |
| "Agent-skills manifest entry point." | `https://www.businessdataguide.com/.well-known/agent-skills/index.json` | agentskills.org v0.2.0 JSON with three skills: `registry-lookup` (points to `/llms-full.txt`), `supplier-comparison`, `jurisdiction-guide`. |

### 2. Normalise the country name to a slug

Slug = `kebab-case-lowercase` of the country name with the following **gotchas** (confirmed against the sitemap on 2026-05-19):

- `uk` — **not** `united-kingdom` (the long form returns a soft-404; see Site-Specific Gotchas)
- `uae` — **not** `united-arab-emirates`
- `dr-congo` — Democratic Republic of the Congo (kept as `dr-congo`, **not** `democratic-republic-of-the-congo`)
- `congo` — Republic of the Congo (Brazzaville), a separate slug from `dr-congo`
- `united-states` — long form preferred (`usa` is **not** a valid blog slug, though the compare-tool may resolve it)
- `czech-republic`, `hong-kong`, `cayman-islands`, `north-korea`, `south-korea`, `costa-rica`, `cape-verde`, `puerto-rico`, `papua-new-guinea`, `sao-tome-and-principe`, `trinidad-and-tobago`, `antigua-and-barbuda`, `saint-kitts-and-nevis`, `saint-vincent-and-the-grenadines` — full names, all kebab-case
- `vatican` — **not** `vatican-city`
- `macau` — **not** `macau-sar`
- `bailiwick-of-guernsey`, `bailiwick-of-jersey`, `isle-of-man` — full forms
- For unfamiliar countries, **enumerate from the sitemap first** rather than guessing. Hitting a wrong slug returns HTTP 200 with the site homepage (see soft-404 gotcha) — confirm before relying on the response.

The dropdown order on `/tools/compare-countries` groups by region (ASEAN, Europe, North America, East Asia, South Asia, Latin America, Middle East & North Africa, Sub-Saharan Africa, Oceania) — useful for autocompletion UIs.

### 3. Fetch + parse

For the **single-country checklist** (recommended primary call):

```bash
SLUG=singapore
RESP=$(curl -fsS "https://www.businessdataguide.com/tools/checklist/${SLUG}.md")
# Soft-404 guard: real checklists are < 5 KB and start with "# {Country} Registry Workflow Checklist".
# Soft-404 returns the ~317 KB homepage HTML with title "businessdataguide, editorial intelligence for global compliance".
if [ "${#RESP}" -gt 5000 ] || ! printf '%s' "$RESP" | head -1 | grep -q 'Registry Workflow Checklist'; then
  echo "soft-404: slug '${SLUG}' not in catalog" >&2
  exit 1
fi
printf '%s' "$RESP"
```

For the **multi-country comparison**, fetch the rendered HTML and extract the comparison-table rows (the table appears under the `Comparing N countries` heading). With `browse`:

```bash
browse cloud fetch "https://www.businessdataguide.com/tools/compare-countries?countries=singapore,malaysia,uk,united-states" --proxies
# or render in a session and grab markdown:
browse open "https://www.businessdataguide.com/tools/compare-countries?countries=singapore,malaysia,uk,united-states" --remote
browse get markdown body --remote
```

### 4. (Browser fallback) Use the compare-countries form interactively

Only needed if you (a) cannot construct the URL directly or (b) need the friction-score driver breakdown that is rendered inside `<details>` blocks behind a "View drivers" disclosure button. Otherwise the URL-param path returns the same data without any browsing cost.

```bash
SID=$(browse cloud sessions create --keep-alive | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$SID"
browse open "https://www.businessdataguide.com/tools/compare-countries" --remote
# Three quick-pick buttons: "ASEAN top 5", "EU top 5", "EN-language registries top 5"
# Or add countries one at a time via the <select> labeled "Add a country (max 5)" then click "Add".
# The URL state updates to ?countries=slug1,slug2,... as you add — read it back with `browse get url --remote`.
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

A **bare** Browserbase session (no `--verified`, no `--proxies`) is sufficient — no anti-bot wall observed across 6 page loads + 12 direct fetches in 2026-05-19 testing.

## Site-Specific Gotchas

- **Soft-404 returns HTTP 200 with the homepage.** Hitting `/blog/jurisdictions/{bogus-slug}-company-search-guide`, `/tools/checklist/{bogus-slug}.md`, or `/suppliers/{bogus-slug}` returns `200 OK` with the **site homepage content** (~317 KB HTML, title `"businessdataguide, editorial intelligence for global compliance"`), **not** a real 404. Detection heuristics:
  - **Checklist URL**: real responses are < 5 KB and start with `# {Country} Registry Workflow Checklist`. A 317 KB body is a soft-404.
  - **Guide URL**: real responses have `<title>{Country} Company Search Guide 2026: How to Verify a {…} Business | businessdataguide</title>`. A title of `"businessdataguide, editorial intelligence for global compliance"` is a soft-404.
  - **Always validate the slug against the sitemap or the agent-skills manifest before treating the response as authoritative.**
- **Slug naming is canonical, not ISO-2 / ISO-3.** The blog/checklist slug for the United Kingdom is `uk` (not `united-kingdom`), for UAE is `uae` (not `united-arab-emirates`), and DRC is `dr-congo` (not `democratic-republic-of-the-congo`). The compare-tool URL appears to accept some long-form aliases (e.g. `united-kingdom` rendered correctly in 2026-05-19 testing), but blog + checklist URLs are strict — soft-404 on any mismatch. Authoritative source: enumerate `<loc>` entries in `/sitemap-0.xml` that match `/blog/jurisdictions/([^/]+)-company-search-guide`.
- **Compare-tool query param is `countries=`, comma-separated, max 5.** Format: `?countries=slug1,slug2,slug3` — bare commas work, `%2C` also works. Exceeding 5 silently drops the overflow (no error). Bookmarkable / shareable URL — preferred output format for "compare these N countries" requests.
- **No JSON-LD per-jurisdiction.** Only an `Organization` JSON-LD block is served on every page. There is no `Article` or per-country structured-data block on the guide pages. If you need machine-readable per-country data, use `/tools/checklist/{slug}.md` (markdown with deterministic structure) or extract from the comparison-table HTML.
- **`/llms-full.txt` covers only the top-5 jurisdictions + reference articles, not all 209.** It contains expanded abstracts for Singapore, Malaysia, Hong Kong, UK, and Indonesia (the buyer-demand top 5 per the publisher), plus four reference articles (Global DD, AML monitoring, CDD for fund admins, EDD, UBO explainer), plus API directory summaries, plus tools catalogue. For any other country, fetch the per-jurisdiction checklist or guide directly. The SHA-256 in the agent-skills manifest covers `/llms-full.txt` content for integrity verification.
- **API directory is incomplete by design.** Only 5 jurisdictions have a dedicated `/api-directory/{slug}-registry-api` page as of 2026-05: `uk`, `greece`, `japan`, `singapore`, `spain`. For the remaining 204 jurisdictions, the per-country guide page notes whether *any* official API exists, but there is no structured API-spec sub-page. If `api-directory/{slug}-registry-api` returns the soft-404 homepage, the corresponding registry either has no public REST API or none has been documented yet — fall back to the prose API-availability line in the main guide.
- **209 jurisdictions cataloged but only ~20 registries support real-time programmatic search.** The guide value is in the editorial scoring (cost, friction, English UI, account requirement, last-verified date), not in providing search itself. For jurisdictions with a working public API (UK Companies House, Greece GEMI, Japan NTA, Spain BORME, etc.), this skill ends at "here is the registry URL + auth model"; the actual company search is a separate per-registry skill.
- **No anti-bot, no rate limits observed.** Cloudflare CDN with `cf-cache-status: DYNAMIC`; first-party `Link` headers advertise the agent-skills manifest + `/llms.txt`. Plain `curl` (or `browse cloud fetch` without `--proxies`) succeeds with no captcha, no JS challenge, no 429s across 12+ fetches in a 5-minute window during 2026-05-19 testing. **Residential proxy is not required.** Still, keep ≤ 5 req/s sustained as common-courtesy.
- **`/llms.txt` advertises a `/.well-known/agent-skills/index.json` manifest** declaring three skills: `registry-lookup` (type `search`, URL → `/llms-full.txt`), `supplier-comparison` (type `comparison`), `jurisdiction-guide` (type `reference`). This is the closest thing to an official API contract. Treat the manifest as the source of truth for surfaced capabilities; if it's updated to point `registry-lookup` at a different URL or to add a 4th skill, prefer the manifest over hardcoded URLs.
- **Last-verified dates are per-country, not site-wide.** Each checklist + guide ends with a "Last verified: YYYY-MM-DD" timestamp. Surface this in your output so the calling agent can decide whether to re-confirm against the official registry — businessdataguide is explicit that it is editorial intelligence, not a primary source, and registry pricing/access rules change.
- **Friction Score is 0–100, lower is easier.** The compare-tool renders a `Friction Score` column (e.g. UK = 9 "Very easy", US = 9 "Very easy", Singapore = 23 "Manageable", Malaysia = 55 "Moderate friction"). Composed of 7 weighted dimensions (registry accessibility 20pt, account requirement 10pt, payment friction 10pt, language friction 10pt, API availability 15pt, UBO availability 15pt, document availability 10pt, supplier fallback 10pt = 100pt total). The breakdown is rendered inside a `<details>` "View drivers" disclosure — only visible after clicking the disclosure (or by extracting the `<details>` block from raw HTML).
- **Site is an editorial publication, not a registry or data redistributor.** Operator: TEH KIM GUAN consultancy, Malaysia. All pages disclaim: "businessdataguide is a publisher, not a registry, not a data redistributor, not a regulatory or legal advisor." Never treat this site as the *source* of company data — only as an index pointing to the official source.

## Expected Output

Five distinct outcome shapes:

### A) Single-country checklist (recommended primary output)

```json
{
  "success": true,
  "country": "Singapore",
  "slug": "singapore",
  "registry": {
    "name": "ACRA Bizfile+",
    "url": "https://www.bizfile.gov.sg",
    "operator": "Accounting and Corporate Regulatory Authority (ACRA)"
  },
  "access": {
    "account_required": "Optional",
    "local_id_required": false,
    "captcha_or_2fa": false,
    "english_ui": true
  },
  "cost": {
    "min_usd": 4.10,
    "max_usd": 12.30,
    "payment_methods": ["Credit card", "PayNow", "Singpass app"]
  },
  "turnaround": "Instant download",
  "last_verified": "2026-05-08",
  "source_url": "https://www.businessdataguide.com/tools/checklist/singapore.md",
  "full_guide_url": "https://www.businessdataguide.com/blog/jurisdictions/singapore-company-search-guide"
}
```

### B) Multi-country comparison

```json
{
  "success": true,
  "comparison_url": "https://www.businessdataguide.com/tools/compare-countries?countries=singapore,malaysia,uk,united-states",
  "countries": [
    {
      "country": "Singapore",
      "slug": "singapore",
      "registry": { "name": "ACRA Bizfile+", "url": "https://www.bizfile.gov.sg" },
      "english_ui": true,
      "account_required": "Optional",
      "local_id_required": false,
      "captcha_or_2fa": false,
      "price_usd_min": 4.10,
      "price_usd_max": 12.30,
      "api_available": true,
      "turnaround": "Instant download",
      "last_verified": "2026-05-08",
      "friction_score": 23,
      "friction_band": "Manageable"
    },
    {
      "country": "United Kingdom",
      "slug": "uk",
      "registry": { "name": "Companies House", "url": "https://find-and-update.company-information.service.gov.uk" },
      "english_ui": true,
      "account_required": "No",
      "local_id_required": false,
      "captcha_or_2fa": false,
      "price_usd_min": 0.00,
      "price_usd_max": 19.00,
      "api_available": true,
      "turnaround": "Instant download",
      "last_verified": "2026-05-06",
      "friction_score": 9,
      "friction_band": "Very easy"
    }
  ]
}
```

### C) Jurisdiction has a dedicated API spec page (1 of 5: uk / greece / japan / singapore / spain)

```json
{
  "success": true,
  "country": "United Kingdom",
  "slug": "uk",
  "api": {
    "name": "UK Companies House REST API",
    "url": "https://developer.company-information.service.gov.uk",
    "auth": "API key via HTTP Basic Auth (free)",
    "rate_limit": "600 requests / 5-minute window",
    "endpoints": ["company profiles", "officer appointments", "PSC/UBO", "filing history", "charges", "insolvency"],
    "response_format": "JSON (financial statements served as PDFs via separate document endpoint)",
    "notes": "429 with Retry-After header; no X-RateLimit-Remaining; for bulk use the monthly data product."
  },
  "spec_url": "https://www.businessdataguide.com/api-directory/uk-registry-api"
}
```

### D) Jurisdiction covered but has no public API documented

```json
{
  "success": true,
  "country": "Malaysia",
  "slug": "malaysia",
  "registry": { "name": "SSM MyData", "url": "https://mydata.ssm.com.my" },
  "api_available": false,
  "note": "No public REST API. Searches via web UI only (captcha-gated). Commercial aggregators (CTOS, RAM, CRIF) provide enriched data with licensing.",
  "guide_url": "https://www.businessdataguide.com/blog/jurisdictions/malaysia-company-search-guide"
}
```

### E) Slug not found in catalog (soft-404)

```json
{
  "success": false,
  "reason": "slug_not_in_catalog",
  "attempted_slug": "atlantis",
  "detection": "GET /tools/checklist/atlantis.md returned 200 with 317 KB homepage HTML instead of the ~1 KB checklist markdown.",
  "remediation": "Enumerate valid slugs from https://www.businessdataguide.com/sitemap-0.xml (filter for /blog/jurisdictions/<slug>-company-search-guide entries) and retry with the canonical slug. Note that UK→uk, UAE→uae, DRC→dr-congo, Vatican→vatican, Macau→macau."
}
```
