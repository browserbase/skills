---
name: ranking-empresas-eleconomista-es-search-company-data-64uxli
title: Search Spanish Company Data by Name
description: >-
  Given a company name, resolve it against the eleconomista company ranking
  directory and return its fiscal ID, activity, address, financials, and ranking
  positions — read-only.
website: ranking-empresas.eleconomista.es
category: business-data
tags:
  - company-data
  - spain
  - business-registry
  - financials
  - ranking
  - directory
source: 'browserbase: agent-runtime 2026-08-12'
updated: '2026-08-12'
recommended_method: fetch
alternative_methods:
  - method: api
    rationale: >-
      The predictive-search XML endpoint (XML_AJAX_BUSQUEDA_KEY) is an internal
      AJAX API, not a documented/stable contract, but it reliably resolves a
      name to canonical company slugs and is the recommended first step.
  - method: browser
    rationale: >-
      Full Browserbase browser flow works as a fallback, but result-list links
      do not navigate reliably on click and the detail data is already exposed
      via plain HTTP + JSON-LD, so scripted browsing is slower with no benefit.
verified: false
proxies: false
---
# Search Spanish Company Data by Name

## Purpose

Given a Spanish company name, this skill resolves it to a canonical company profile on `ranking-empresas.eleconomista.es` (the elEconomista / INFORMA D&B company-ranking directory) and returns structured data about that company: fiscal ID (NIF/CIF), legal name, activity/CNAE, registered address, phone, website, legal form, headline financials (sales, total assets, EBITDA, result, capital), and its national / provincial / sector ranking positions. It is strictly **read-only** — it only reads public directory pages, never submits forms or logs in.

## When to Use

- You have a company name (exact or partial) and need its fiscal ID, sector, or registered address.
- You need headline financials (annual sales / turnover, total assets) for a Spanish company from the INFORMA D&B dataset.
- You want a company's position in the national, provincial, or sectoral revenue ranking.
- You need to disambiguate between several similarly-named Spanish entities (e.g. all the `SANTANDER *` subsidiaries) before drilling into one.

## Workflow

The site exposes everything needed over plain HTTP with **no anti-bot protection** (homepage probe returned `200`, no CAPTCHA / WAF). The optimal path is two cheap fetches — do **not** script a browser.

### Step 1 — Resolve the name to a canonical company (predictive-search API)

`GET` the internal predictive-search endpoint with the raw name as `query`:

```
https://ranking-empresas.eleconomista.es/servlet/app/portal/EMP/prod/XML_AJAX_BUSQUEDA_KEY/?query={url-encoded name}
```

It returns an XML `<keywords>` document with up to ~10 `<keyword>` matches, each containing:

- `<nombreMostrar>` — display name (e.g. `INDITEX LOGISTICA SA`)
- `<nombreNorm>` — **normalized name used to build the detail-page URL** (e.g. `INDITEX LOGISTICA`)
- `<esEmpresa>` — `1` when the row is a company

Pick the best match. **Always use `<nombreNorm>` (not `<nombreMostrar>`) to build the URL** — the normalization is lossy and inconsistent (drops/keeps `SA`/`SL`/`SLU` unpredictably, strips accents and punctuation), so never hand-derive the slug from the display name.

If there are zero `<keyword>` elements, the name has no match → return `success: false`.

### Step 2 — Fetch the detail page and parse it

Build the detail URL from `<nombreNorm>` by replacing spaces with `-`, URL-encoding, and appending `.html` (relative to the site root):

```
https://ranking-empresas.eleconomista.es/{NOMBRE-NORM-WITH-DASHES}.html
# e.g. "INDITEX LOGISTICA" -> https://ranking-empresas.eleconomista.es/INDITEX-LOGISTICA.html
```

`GET` that page and extract data from **two** sources:

1. **JSON-LD** (`<script type="application/ld+json">`, `@type: LocalBusiness`) — cleanest source for `name`, `taxID` (the NIF/CIF), `isicV4` (CNAE code + label), `telephone`, `description` (objeto social), and structured `address` (streetAddress, addressLocality, addressRegion, postalCode) + `geo` lat/long.
2. **Rendered HTML body** — for fields not in JSON-LD: `Forma Jurídica` (legal form), `Capital Social`, `Página Web`, `Actividad`, latest-year `Ventas` (sales) and `Total Activo` (total assets), `Ebitda`, `Resultado`, number of employees, and the three ranking positions (`Ranking Nacional Posición`, `Ranking Provincial Posición … de {province}`, `Ranking Sectorial Posición … de {sector}`).

Money values render in Spanish format (`140.475.130 €` = 140,475,130). Strip `.` thousands separators and the `€` before casting to a number.

### Step 3 — Emit the JSON

Return the object shaped like the `## Expected Output` schema below, echoing the input `query`, the chosen company, and the other `<keyword>` display names as `candidates` so a caller can re-run against a different match if the auto-pick was wrong.

### Browser fallback (only if the fetch path is unavailable)

If you must drive a real browser (e.g. the internal endpoint changes):

1. `browse open https://ranking-empresas.eleconomista.es/ --remote` (bare session — no `--proxies`/`--verified` needed).
2. `browse fill "#search-nopred" "{name}"` then `browse press Enter`. This lands on a static results page `https://ranking-empresas.eleconomista.es/busqueda_rankings_{QUERY-NORM}.html` listing matching companies, each linking to a `…/{NAME}.html` detail page.
3. **Do not rely on clicking the result links** — in testing they did not navigate on click. Read the `href` of the desired result and `browse open` that URL directly.
4. On the detail page, `browse get text body` (or read the JSON-LD) and parse as in Step 2.

## Site-Specific Gotchas

- **No anti-bot.** A bare Browserbase/`fetch` session works; `--proxies`/`--verified` are unnecessary. The successful run used neither.
- **The detail-page slug comes from `<nombreNorm>`, not the display name.** Normalization is lossy and *not* a simple uppercase+dash of the display name: `SANTANDER INSURANCE SL.` → `SANTANDER INSURANCE` (suffix dropped) but `SANTANDER GLOBAL TECHNOLOGY AND OPERATIONS SLU` keeps `SLU`. Accents are stripped (`ESPAÑA` → `ESPANA`). Always take the slug from the search API's `<nombreNorm>`, replace spaces with `-`, then URL-encode and append `.html`.
- **Predictive endpoint only returns matches for queries longer than 3 characters** (the client waits until `length > 3` and debounces ~500 ms). Very short queries may return an empty `<keywords>` even for real companies — pass the fullest name fragment you have.
- **Empty result shape:** a no-match query still returns `HTTP 200` with a `<keywords>` element containing `<textoBuscadoOriginal>`/`<textoBuscadoNormalizadoURL>` but **zero `<keyword>` children**. Treat "no `<keyword>`" as not-found, not as an error.
- **JSON-LD is the reliable NIF/CIF source.** The visible HTML obfuscates the fiscal ID (there is a `nif-encode="…"` attribute rather than plain text); read `taxID` from the JSON-LD `LocalBusiness` block instead of scraping it from the body.
- **Financials are latest-available-year and Spanish-formatted.** The page shows values like `Total Activo 2025 136.214.685 €`; the year label varies by company and data vintage. Strip `.` and `€`; capture the year alongside the figure if the caller needs it.
- **Data provenance:** figures come from INFORMA D&B S.A.U. The page pushes an "Informe Ampliado" (extended report) behind an eInforma registration — ignore those CTAs; all fields this skill returns are on the free public page.
- **A static results-page fast-path also exists:** `https://ranking-empresas.eleconomista.es/busqueda_rankings_{QUERY-NORM}.html` renders the full match list server-side (useful if you prefer HTML scraping over the XML API), where `{QUERY-NORM}` is the `textoBuscadoNormalizadoURL` value the API returns.
- **`browse snapshot` noise:** the CLI in the sandbox prints an "Update available" banner to stdout that can corrupt snapshot/accessibility-tree parsing. Prefer `browse get text body` / `browse get markdown body` (or the JSON-LD) over `browse snapshot` for extraction on this site.
- **Ambiguity is common.** Names like `Santander`, `Inditex`, `Iberdrola` return many subsidiaries. Return the full candidate list and pick the top match (usually the parent / highest-ranked entity) unless the caller specifies otherwise; the assumption made here is "first `esEmpresa=1` match" as the default.

## Expected Output

Successful resolution:

```json
{
  "success": true,
  "query": "Inditex",
  "company": {
    "name": "Inditex Logistica Sa",
    "tax_id": "A70268669",
    "activity": "Depósito y almacenamiento",
    "cnae": "5210",
    "legal_form": "Sociedad anónima unipersonal",
    "objeto_social": "Almacenamiento en general. Transporte y distribución de mercancías.",
    "address": "Avenida Deputacion, S/N",
    "locality": "Arteixo",
    "region": "Coruña",
    "postal_code": "15142",
    "geo": { "lat": 43.3166768, "lng": -8.5014506 },
    "phone": "981185400",
    "website": "www.inditex.com",
    "capital_social_eur": 100000,
    "sales_eur": 140475130,
    "total_assets_eur": 136214685,
    "ebitda_eur": 62497880,
    "result_eur": 33284252,
    "financials_year": 2025,
    "ranking_national": 2092,
    "ranking_provincial": { "position": 62, "province": "Coruña" },
    "ranking_sector": { "position": 11, "sector": "Depósito y almacenamiento" },
    "detail_url": "https://ranking-empresas.eleconomista.es/INDITEX-LOGISTICA.html"
  },
  "candidates": ["INDITEX LOGISTICA SA"],
  "error_reasoning": null
}
```

Ambiguous name (several matches — first is auto-picked, rest returned for the caller):

```json
{
  "success": true,
  "query": "Santander",
  "company": { "name": "Santander Global Technology And Operations Slu", "detail_url": "https://ranking-empresas.eleconomista.es/SANTANDER-GLOBAL-TECHNOLOGY-AND-OPERATIONS-SLU.html", "tax_id": "..." },
  "candidates": [
    "SANTANDER GLOBAL TECHNOLOGY AND OPERATIONS SLU",
    "SANTANDER INSURANCE SL.",
    "SANTANDER BACK-OFFICES GLOBALES MAYORISTAS SA",
    "SANTANDER MEDIACION OPERADOR DE BANCA SEGUROS VINCULADO SA",
    "SANTANDER FACILITY MANAGEMENT ESPAÑA SL."
  ],
  "error_reasoning": null
}
```

No match:

```json
{
  "success": false,
  "query": "zzznotarealcompany",
  "company": null,
  "candidates": [],
  "error_reasoning": "Predictive-search endpoint returned a <keywords> document with no <keyword> matches for this name."
}
```
