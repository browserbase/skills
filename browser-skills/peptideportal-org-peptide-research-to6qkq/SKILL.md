---
name: peptideportal-org-peptide-research-to6qkq
title: Peptide Portal Compound Research
description: >-
  Search peptideportal.org for a peptide by name, alias, CAS number, or
  mechanism keyword and return a structured profile aggregating vendor pricing
  range and COA-verified status, the canonical research brief with use-case
  evidence tables, related dosing-guide blog posts, and the curated bibliography
  of clinical papers with PubMed outbound links.
website: peptideportal.org
category: research
tags:
  - peptides
  - research
  - pharmacology
  - vendor-comparison
  - clinical-papers
  - read-only
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: browser
alternative_methods: []
verified: false
proxies: false
---
# Peptide Portal Compound Research

## Purpose

Given a peptide name (e.g. `BPC-157`, `tirzepatide`), an alias (`Body Protection Compound`), a CAS number (`137525-51-0`), or a use-case keyword that maps to Peptide Portal's category taxonomy (`GLP-1`, `GH secretagogue`, `tissue repair`), return a structured profile aggregating:

- **Vendor pricing** — the aggregated `$ / mg range` and vendor count (public), or the per-vendor catalog rows (auth-gated, see Gotchas).
- **Purity / COA signal** — the marketplace's `Verified` / `Unverified` COA flag and the vendor's third-party-testing percentage.
- **Research guide** — the deep-link `/peptides/{slug}` clinical brief (FDA status, evidence tables, comparison with similar compounds) and any `/blog/{slug}` topical guides that cite dosing data.
- **Clinical paper references** — the per-peptide bibliography at `/research/{slug}`, where each paper has a dedicated detail page `/research/{slug}/{uuid}` linking out to PubMed.

Read-only — never click `CREATE FREE ACCOUNT`, `Sign in`, or `GET ACCESS`. Never submit the newsletter form.

## When to Use

- Build a research dossier on one peptide before sourcing.
- Compare two peptides (e.g. `BPC-157 vs TB-500`) — fetch both and diff the structured outputs.
- Surface the canonical published evidence index for a peptide (citations, study designs, models, indications) without re-scraping PubMed yourself — Peptide Portal already curates it per compound.
- Find which peptides on the catalog match a use-case keyword (`GLP-1`, `growth hormone`, `tissue repair`, `cognitive`) and rank by COA-verified vendor count.

## Workflow

Peptide Portal is a public Vercel/Next.js site with **no anti-bot, no captcha, no Akamai gating** for read paths. `browse cloud sessions create` with default flags works fine; `--verified --proxies` is not required for this site. All read URLs return server-rendered HTML (`/api/*` is blocked by `robots.txt` and returns 404, so there is no public JSON API to short-circuit to — the recommended method is browser).

There are four URL surfaces. Use them in this order:

### 1. Resolve the query to a peptide slug

If the user gave a known name, alias, or CAS:

- **Direct slug guess** (fastest path — ~150ms): `https://peptideportal.org/peptides/{kebab-name}`. The catalog has 58+ slugs in the sitemap (`/sitemap.xml`). Examples: `bpc-157`, `tb-500`, `tirzepatide`, `semaglutide`, `cjc-1295`, `ipamorelin`, `ghk-cu`, `mots-c`, `ll-37`, `kpv`, `selank`, `semax`, `epitalon`. A 200 response means the slug is canonical; a 404 means try the global typeahead.

- **Global Cmd+K typeahead** (fuzzy resolver — handles aliases, CAS, and vendor product names): on any page, click `button: Search peptides, vendors, or CAS numbers. Press Command K to open.` to open the dialog, then `fill` the `combobox` inside `dialog: Search` with the query. After ~1s the listbox under `dialog: Search` populates with up to three groups:

  | Group label | What it contains |
  |---|---|
  | `Peptides` | Catalog hits — peptide name + tagline + CAS. Click → `/peptides/{slug}`. |
  | `Products` | Per-vendor SKUs — name + `vendor · peptide · category`. Click → marketplace row. |
  | `Actions` | A `Search marketplace for "{q}"` fallback that navigates to `/marketplace?q={q}`. |

  The typeahead substring-matches against peptide name, tagline (which contains use-case-ish phrases like `"GLP-1 agonist"`, `"GH secretagogue"`, `"GIP / GLP-1 dual agonist"`), CAS, and vendor product names. It does **not** map free-form use-case phrases — `weight loss` returns zero hits; the technical keyword `glp` returns Survodutide, Semaglutide, Tirzepatide cleanly. Lead with the canonical mechanism keyword, not the consumer phrase.

If the user gave a use-case keyword and the typeahead returns nothing, fall through to step 4 (browse the marketplace listing by category column).

### 2. Pull the research brief — `/peptides/{slug}`

`browse open https://peptideportal.org/peptides/{slug} --remote` then `browse snapshot --remote`. This is the canonical clinical brief and contains, in this fixed order, every section you need for the "research guide" output:

| Section heading (h2) | Extract |
|---|---|
| `Quick answer` | One-paragraph plain-language summary. |
| `Key facts about {Name}` | Q&A table: `What is it? / Other names / Peptide class / Main mechanism / FDA status / Legal status / Banned in sports`. |
| `What is {name} used for?` | Use-case evidence table — columns `USE`, `EVIDENCE LEVEL`, `WHAT IS KNOWN`, `WHAT IS NOT KNOWN`. This is the canonical use-case → evidence-strength mapping. |
| `What does the research show?` | Narrative + sub-headings `Human evidence` and `Animal and laboratory evidence`. |
| `Evidence summary` | One-line evidence verdict. |
| `Is {name} FDA-approved? / legal? / banned in sports?` | Regulatory triad — single-paragraph answers. |
| `Safety and side effects` | Bulleted concern list. |
| `{Name} vs similar peptides` | Comparison table: `COMPOUND`, `CATEGORY`, `MAIN DIFFERENCE`. |
| `Sources` | Numbered list of references with outbound links to FDA, USADA, WADA, PubMed, OPSS, etc. **Use this for citations even when `/research/{slug}` is empty.** |
| `FAQ` | DisclosureTriangle accordions; expand only if needed. |

The detail page does **not** list per-vendor pricing inline. Vendor pricing lives on `/marketplace` and `/vendor/{slug}` (step 3).

### 3. Pull vendor pricing + purity — `/marketplace?q={name}`

`browse open https://peptideportal.org/marketplace?q={name} --remote` then `browse snapshot --remote`. The result is a one-row `table` with columns `PEPTIDE | CATEGORY | RESEARCH FOCUS | $ / MG RANGE | VENDORS | COA | EXPAND`. The single matching row exposes, **without authentication**:

- `$ / mg range` — aggregated min–max (e.g. `$5.00–$8.00` for BPC-157).
- `Vendors` — integer count of vendors carrying this peptide.
- `COA` — `Verified` (third-party tested across vendor mix) or `Unverified`.
- `Category` — short label (e.g. `Body Protective Compound`).
- `Research Focus` — taxonomy bucket (e.g. `Tissue Repair Research`).

**Per-vendor breakdown is auth-gated.** Clicking the `Expand` button on the row reveals a row whose only content is `View {Name} vendors — Create a free account to compare pricing across verified vendors — CREATE FREE ACCOUNT | Sign in`. Do not click. Report the aggregated row and stop; record `vendors_per_vendor_breakdown: "auth_required"` in the output schema.

For an **individual vendor's profile** (vendor score, catalog breadth %, third-party-testing %, established date, visible category bucket list — all public): `https://peptideportal.org/vendor/{vendor-slug}`. Vendor slugs are discoverable from `/vendors` (e.g. `peptide-crafters`, `peptidology`, `peptide-partners`, `orbitrex-peptides`, `skye-peptides`, `alchemy-peptides`, `nulife-peptides`, `risynth-bio`, `biotech-peptides`, `peptime`, `eternal-peptides`, `atomik-labz`, `kerisite-peptide`, `zlz-peptide`). Detail pricing and COA documents on vendor pages are also auth-gated — only the scorecard summary is public.

### 4. Pull the bibliography — `/research/{slug}` and `/research/{slug}/{uuid}`

`browse cloud fetch https://peptideportal.org/research/{slug} --proxies` works fine here (no JS needed — the bibliography list is server-rendered). Each paper is a card link with text shaped like:

```
{Author} {Year} — {Title}
{Citations} {Journal} · {Year} {Study type} {Model} {Topic} Source {Tag}
```

…where `{Study type}` is one of `Preclinical | Pilot | Review | Animal RCT | Systematic Review | Case Report | Safety`, `{Model}` is `Cell | Animal | Rat | Human | In Vitro | Various`, and the `href` is `/research/{slug}/{uuid}` (UUID v4). Hit the per-paper UUID page for: outbound PubMed/DOI link (under heading `External Links`), full structured details (`Study Design`, `Indication`, `Intervention`, `Species`, `Risk of Bias Assessment`, `Tags`), citation count, evidence-quality grade, and last-verified date.

Not every peptide has a `/research/{slug}` index — peptides without curated evidence return 200 with an empty list, not a 404. Fall back to the `Sources` list at the bottom of `/peptides/{slug}` (step 2) which is always populated and links directly to FDA / PubMed / USADA / WADA / OPSS / journal pages.

### 5. Pull dosing-protocol guides — `/blog/{slug}`

Peptide Portal **deliberately does not publish prescriptive dosing on `/peptides/{slug}` for unapproved compounds** — for BPC-157, TB-500, etc., the detail page repeatedly says "human dosing is not established." Cited dosing data lives on long-form guides under `/blog`, where the doses are quoted from specific clinical studies (e.g. the CJC-1295 + Ipamorelin guide cites "30 or 60 μg/kg" and "0.03 mg/kg twice daily" with study references).

Discover blog guides matching the peptide via the sitemap (`/sitemap.xml` lists all 35 blog slugs) or via a substring filter on slug names (`bpc-157`, `tb-500`, `cjc-1295`, `ipamorelin`, `glp1`, `peptides-for-hair-growth`, etc.). Fetch via `browse cloud fetch https://peptideportal.org/blog/{slug}` — these are SSR HTML, no JS rendering required.

### 6. Release the session

```bash
browse cloud sessions update "$BROWSE_SESSION" --status REQUEST_RELEASE
```

## Site-Specific Gotchas

- **Auth wall on per-vendor pricing.** The marketplace shows aggregated `$ / mg range` + vendor count + COA-verified flag publicly, but clicking `Expand` on any row reveals only a `CREATE FREE ACCOUNT / Sign in` paywall. Per-vendor SKU pricing, COA documents, and detailed vendor catalogs require an account. Report the aggregated public data and set a flag like `per_vendor_pricing_visible: false` in the output.
- **Unauthenticated marketplace home is heavily curated.** `/marketplace` (no `q=`) returns only **13 products** even though `/sitemap.xml` lists 58+ peptide slugs. The 13 are the most-trafficked GLP-1s, tissue-repair, and GH peptides. To verify a specific peptide is in the marketplace, hit `/marketplace?q={name}` directly — it works for the full catalog (not just the 13 featured rows) provided the peptide has any vendor coverage.
- **Cmd+K typeahead substring-matches name, tagline, CAS, and product names — but not free-form use cases.** `glp` works (returns Survodutide, Semaglutide, Tirzepatide via the `"GLP-1 agonist"` and `"GLP-1/glucagon dual agonist"` taglines). `weight loss` returns zero peptide hits — only the `Search marketplace for "weight loss"` action fallback. Translate consumer phrases to mechanism keywords before submitting: `weight loss` → `glp`, `obesity` → `glp`, `muscle gain` → `igf` / `ghrh`, `healing` → `bpc` / `tb-500`, `cognitive` → `selank` / `semax`.
- **`/peptides` page-local searchbox is name-only.** The `searchbox: Search peptide guides by peptide name` on the `/peptides` index filters cards by **substring of peptide name only** — does not match aliases, CAS, taglines, or categories. Use the global Cmd+K dialog for anything beyond name.
- **`/peptides/{slug}` detail page has no inline vendor pricing.** Two `link: Vendors` anchors on the page navigate to the global `/vendors` page, not a per-peptide vendor block. Always pair `/peptides/{slug}` (research) with `/marketplace?q={name}` (pricing) — they are separate surfaces.
- **Dosing is intentionally absent from `/peptides/{slug}` for unapproved compounds.** Don't bother grepping the detail page for `mg/kg` — the page will say "human dosing is unclear." Cited doses live in `/blog/{slug}` guides instead, and only for compounds where clinical studies exist (CJC-1295 + Ipamorelin, semaglutide/tirzepatide titration, etc.). For unapproved peptides, the honest output is `dosing_protocol: "no_human_protocol_published"`.
- **`/research/{slug}` exists for every peptide but is sometimes empty.** A 200 response with an empty card list means "no curated papers" — not "peptide not found." Treat empty as a normal outcome and fall back to the `Sources` block on `/peptides/{slug}` (which is always populated with regulatory links + at least one PubMed reference for in-scope peptides).
- **Paper detail UUIDs are stable but per-peptide-namespaced.** The same paper would have different UUIDs if it appeared under two peptides' research pages. Do not reuse a UUID across peptides; always re-derive from the parent `/research/{slug}` index.
- **External paper links are PubMed-only on `/research/{slug}/{uuid}`.** The detail page exposes a single outbound `link: PubMed` under heading `External Links`. No DOIs, no direct journal URLs. If the user needs a DOI, scrape PubMed by ID after this skill returns.
- **`/api/*` is robots-disallowed and returns the SPA shell at 404.** There is no JSON shortcut for any of these surfaces — the recommended method is unambiguously `browser`. `browse cloud fetch` (HTTP-only path) works for `/peptides/{slug}`, `/research/{slug}`, `/research/{slug}/{uuid}`, `/vendor/{slug}`, `/blog/{slug}`, `/sitemap.xml`, and `/marketplace?q={name}` (these are SSR HTML) — use it instead of a full browser session when you just need to read text. The pages that require an active browser are the global Cmd+K dialog and the marketplace filter sidebar (their popups are JS-driven).
- **The "Compare verified vendors in one place" modal layers over `/marketplace`.** It is a paywall promo that does not dismiss without auth — but the underlying table is rendered behind it and `browse snapshot` traverses through. Don't waste turns trying to close it; snapshot still surfaces the row data.
- **No CAS-number sanitization needed.** CAS is exposed as a plain string with hyphens (`137525-51-0`) — Cmd+K matches it with or without spaces.
- **Sitemap is your fastest enumeration tool.** `https://peptideportal.org/sitemap.xml` lists every peptide slug, vendor slug, blog post, and research index, all under `<loc>` tags. Parse it once at the start of a bulk job instead of crawling.

## Expected Output

A successful run returns one structured object per peptide. Three outcome shapes:

```json
// 1. Full hit — peptide is in the catalog, marketplace, AND research index
{
  "success": true,
  "query": "BPC-157",
  "slug": "bpc-157",
  "name": "BPC-157",
  "aliases": ["Body Protection Compound-157", "PL 14736", "stable gastric pentadecapeptide BPC 157"],
  "cas": "137525-51-0",
  "category": "Body Protective Compound",
  "research_focus": "Tissue Repair Research",
  "fda_status": "not_approved",
  "legal_status": "research_use_only",
  "banned_in_sports": true,
  "research_brief_url": "https://peptideportal.org/peptides/bpc-157",
  "use_cases": [
    {"use": "Tendon healing", "evidence_level": "Preclinical", "known": "Animal and cell studies suggest effects on tendon fibroblast migration, survival, and healing pathways.", "not_known": "Whether it reliably improves tendon healing in humans is not established."},
    {"use": "Gut protection", "evidence_level": "Preclinical", "known": "Studied in gastrointestinal lesion and gastric integrity models.", "not_known": "Human benefit is unclear."}
  ],
  "vendor_pricing": {
    "marketplace_url": "https://peptideportal.org/marketplace?q=BPC-157",
    "price_per_mg_range_usd": {"min": 5.00, "max": 8.00},
    "vendor_count": 4,
    "coa_status": "Verified",
    "per_vendor_pricing_visible": false,
    "per_vendor_pricing_gate": "auth_required"
  },
  "dosing_protocol": "no_human_protocol_published",
  "related_guides": [
    {"title": "BPC-157 vs TB-500 Recovery Comparison", "url": "https://peptideportal.org/blog/bpc-157-vs-tb-500-recovery-comparison"},
    {"title": "FDA PCAC Meeting July 2026 — BPC-157, TB-500", "url": "https://peptideportal.org/blog/fda-pcac-meeting-july-2026-bpc-157-tb-500"}
  ],
  "clinical_papers": {
    "research_index_url": "https://peptideportal.org/research/bpc-157",
    "total_papers": 14,
    "papers": [
      {
        "title": "Chang 2011 — BPC-157 Promotes Tendon Fibroblast Outgrowth and Migration",
        "detail_url": "https://peptideportal.org/research/bpc-157/82802990-98f4-4ce2-b6d3-75702b44ded4",
        "pubmed_url": "https://pubmed.ncbi.nlm.nih.gov/21030672",
        "journal": "Journal of Applied Physiology",
        "year": 2011,
        "citations": 202,
        "study_type": "Preclinical",
        "model": "Cell",
        "indication": "Tendon healing mechanisms"
      }
    ]
  },
  "regulatory_sources": [
    {"title": "FDA: Certain Bulk Drug Substances for Use in Compounding May Present Significant Safety Risks", "url": "https://www.fda.gov/drugs/human-drug-compounding/certain-bulk-drug-substances-use-compounding-may-present-significant-safety-risks"},
    {"title": "USADA: BPC-157, A Prohibited Peptide", "url": "https://www.usada.org/..."},
    {"title": "WADA: 2022 Prohibited List Now in Force", "url": "https://www.wada-ama.org/..."}
  ]
}

// 2. Catalog hit, no marketplace coverage — peptide exists on /peptides/{slug} but not in /marketplace
{
  "success": true,
  "query": "epitalon",
  "slug": "epitalon",
  "name": "Epitalon",
  "research_brief_url": "https://peptideportal.org/peptides/epitalon",
  "vendor_pricing": {
    "marketplace_url": "https://peptideportal.org/marketplace?q=Epitalon",
    "price_per_mg_range_usd": null,
    "vendor_count": 0,
    "coa_status": null,
    "per_vendor_pricing_visible": false,
    "per_vendor_pricing_gate": "no_vendor_coverage"
  },
  "dosing_protocol": "no_human_protocol_published",
  "clinical_papers": {
    "research_index_url": "https://peptideportal.org/research/epitalon",
    "total_papers": 0,
    "papers": []
  }
}

// 3. Not found — query did not resolve to any catalog slug or typeahead hit
{
  "success": false,
  "reason": "peptide_not_found",
  "query": "made-up-peptide-xyz",
  "tried": [
    "https://peptideportal.org/peptides/made-up-peptide-xyz (404)",
    "global Cmd+K typeahead (0 Peptides group results)"
  ],
  "suggestion": "Try a canonical alias, CAS number, or mechanism keyword (e.g., 'GLP-1', 'GH secretagogue', 'tissue repair'). The full catalog of ~58 slugs is at https://peptideportal.org/sitemap.xml."
}
```
