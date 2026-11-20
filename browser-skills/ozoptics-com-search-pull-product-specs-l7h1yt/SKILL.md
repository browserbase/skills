---
name: ozoptics-com-search-pull-product-specs-l7h1yt
title: OZ Optics Product Search & Spec Lookup
description: >-
  Search ozoptics.com for fiber-optic products matching a description via the
  SiteSearch360 JSON API and return each product's name, links (product page +
  datasheet PDF), and where its full specifications live.
website: ozoptics.com
category: product-search
tags:
  - fiber-optics
  - search
  - sitesearch360
  - datasheets
  - products
source: 'browserbase: agent-runtime 2026-08-07'
updated: '2026-08-07'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      When the SiteSearch360 JSON API is unreachable, drive the site: type into
      #searchBox on the homepage, submit, and read the client-rendered results
      on searchresults.html via browse snapshot. Works with a bare session but
      costs far more than the direct JSON call.
  - method: fetch
    rationale: >-
      The API path is itself a plain unauthenticated HTTPS GET (permissive
      CORS), so any fetch/curl client works — no proxy, cookies, or key
      required.
verified: false
proxies: false
---
# OZ Optics Product Search & Spec Lookup

## Purpose

Search the OZ Optics website (ozoptics.com) for fiber-optic products matching a plain-English description and return, for each match, the product **name**, the **links** (product landing page and/or datasheet PDF), and a pointer to where the full **specifications** live. OZ Optics' on-site search is a thin client over the public **SiteSearch360** JSON API, so results (name + link + content-group + link-type) come back structured with no auth, cookies, or anti-bot stealth. Specifications themselves are **not** in the search index — they live in the linked `DTS####.pdf` datasheet PDFs, which this skill locates for you. Read-only; never submits quote/contact forms or shop checkout.

## When to Use

- Turning a fuzzy product description ("high-speed polarization controller", "980 nm PM coupler", "fiber collimator array") into a concrete list of OZ Optics products with canonical URLs.
- Harvesting datasheet PDF links (`DTS####.pdf`) so their spec tables can be extracted downstream.
- Bulk/repeated lookups where you'd otherwise scrape the rendered `searchresults.html` page — the API is ~100× cheaper and structurally reliable.
- Cross-referencing a product across the marketing site (`/products/*.html`), datasheets (`/ALLNEW_PDF/*.pdf`), and the online catalog (`shop.ozoptics.com`).

## Workflow

OZ Optics' search box (`#searchBox` on every page) is powered by **SiteSearch360 v9** with `siteId: 'www.ozoptics.com'`. The rendered results page (`https://www.ozoptics.com/searchresults.html?ss360Query={q}`) is fully client-rendered from a single JSON call. **Hit that JSON endpoint directly — no browser, no proxy, no stealth, no key.** Verified 200 OK via plain HTTP; response has permissive CORS (`Access-Control-Allow-Origin: *`).

1. **Query the SiteSearch360 API** (this is the whole search):
   ```
   GET https://api.sitesearch360.com/sites
       ?site=www.ozoptics.com
       &query={url-encoded description}
       &limit={max results, e.g. 50}
   ```
   Returns JSON:
   ```
   {
     "suggests": { "<Content Group>": [ {name, link, image, type, relevance, kvtable, images, dataPoints}, ... ], ... },
     "totalResults": 58,
     "totalResultsPerContentGroup": { "_": 58 },
     "queryCorrection": null,          // "did you mean" text, or null
     "originalQuery": "...",
     "relatedQueries": []
   }
   ```
   `suggests` is an **object keyed by content-group name** (not a flat array); iterate its keys. `limit` caps the total number of items returned across all groups (observed: `limit=2`→2 items, `limit=50`→50 of 171). Results within/across groups are ordered by descending `relevance`.

2. **Read each result**. Per-item fields you care about:
   - `name` — product / datasheet / page title (the "product name").
   - `link` — canonical absolute URL (the "specific link").
   - `type` — `"HTML"` (a web page) or `"PDF"` (a datasheet/app-note document).
   - `image` — thumbnail URL or `null`.
   - `kvtable` / `dataPoints` — **always empty for this site** (`<table></table>` / `[]`). SiteSearch360 is not configured to extract structured specs here, so do **not** expect spec values from the API — see step 4.

3. **Classify by content group / URL to find the product vs. its specs.** Groups are assigned dynamically per query; the ones observed on this site:
   | Content group | URL pattern | Meaning |
   |---|---|---|
   | `Products` | `/products/*.html` (HTML) | Product landing page — indexes the datasheet PDFs for that product family |
   | `Data Sheets` | `/ALLNEW_PDF/DTS####.pdf` (PDF) | **Authoritative spec document** for a specific product |
   | `Application Note` | `/ALLNEW_PDF/APN####.pdf` (PDF) | Application note |
   | `Online Catalog` | `shop.ozoptics.com/*` (HTML) | Buyable SKU on the e-commerce store |
   | `News Releases` | `/news/pr_###.html` (HTML) | Announcement (not a product page) |
   | `Videos` | `/video/video##.html` (HTML) | Demo video |
   | `Other` / `_` | mixed | Catch-all (questionnaires, `.asp` forms, misc pages) |

   To answer "products matching a description," prefer the `Products` and `Data Sheets` groups. `News Releases`, `Videos`, and `Online Catalog` are useful context but are not the primary product spec source.

4. **Pull the specs.** Full technical specifications are **only** in the datasheet PDFs, not in the search index:
   - If a match is already a `Data Sheets` result (`type: "PDF"`, `/ALLNEW_PDF/DTS####.pdf`), that URL **is** the spec document — fetch it and read its spec tables.
   - If a match is a `Products` page (`type: "HTML"`, `/products/*.html`), fetch that page: it renders a small table — *"NAME OF THE DATA SHEET (sorted alphabetically) | Revision Date | Operating Instructions/Manuals"* — whose datasheet titles link to the `DTS####.pdf` files. Collect those `.pdf` hrefs; those are the spec documents. (A `Products` page often lists several datasheets — one per product variant.)
   - Then fetch the chosen `DTS####.pdf` and extract the specification tables from the PDF to get numeric spec values (wavelength, insertion loss, PER, connector type, etc.).

5. **Emit** name + link + content_group + type + datasheet_links per match (see Expected Output).

### Browser fallback

Only needed if the JSON API is unreachable. The rendered flow works but costs far more:

1. `browse open https://www.ozoptics.com/ --remote` (a bare session is fine — no stealth/proxy).
2. `browse fill #searchBox "{query}" --press-enter` (or click `#SearchButton`). The page navigates to `https://www.ozoptics.com/searchresults.html?ss360Query={query}`.
3. `browse wait timeout 3000` — the SiteSearch360 widget renders results **client-side** into content-group tabs (e.g. *Products (10) | Data Sheets (10) | Videos (1) | News Releases (11) | Application Note (1) | Online Catalog (21) | Other (4)*) with a "We found N results" caption. The tab counts sum to `totalResults` and match the API exactly (verified: 58 for "polarization controller", 131 for "fiber collimator").
4. `browse snapshot` — result titles + hrefs appear in the accessibility tree / urlMap (use this, not `browse get text body`; see gotcha). Then open a `Products` page and `browse snapshot` again to read its datasheet-PDF table.

## Site-Specific Gotchas

- **Search is 100% SiteSearch360 — hit the API, skip the browser.** Endpoint `https://api.sitesearch360.com/sites?site=www.ozoptics.com&query=…`. No API key, no cookies, no `Referer`, no anti-bot. The pre-run probe correctly reported *no anti-bots*; both converged iterations ran a **bare** Browserbase session (no `--verified`, no `--proxies`) and the raw JSON fetch needs neither.
- **`suggests` is an object keyed by group name, not a list.** Iterate `Object.keys(suggests)`; each value is the result array for that group. Don't assume a flat array.
- **Specs are never in the API response.** `kvtable` is always `"<table></table>"` and `dataPoints` is always `[]` for this site. Get spec values from the `DTS####.pdf` datasheet (linked directly as `Data Sheets` results, or listed on the `Products` landing page). Don't waste time trying to coax structured specs out of the search JSON.
- **Do NOT use `includeContentGroups=Products` (or similar group-filter params) — they zero out the result set.** Observed: adding `includeContentGroups=Products` returned `totalResults: 0`. Filter by group **client-side** on the `suggests` keys instead.
- **`totalResultsPerContentGroup` often collapses to `{"_": N}`** even when `suggests` splits results into named groups — treat `_` as "all/ungrouped total," and rely on `totalResults` for the real count and on the `suggests` keys for the actual grouping.
- **Query tokenization is literal — over-specific queries return 0.** `"980nm isolator"` returned 0 results; `"variable attenuator"` → 119, `"fiber collimator"` → 131. Drop wavelengths/part-numbers and search the product family term, then filter results client-side. Check the `queryCorrection` field for a "did you mean" suggestion when a query underperforms.
- **`Products` landing pages are datasheet indexes, not spec sheets.** e.g. `/products/high-speed-polarization-controller-scrambler.html` renders only a table of datasheet names + revision dates linking to `DTS0174.pdf` / `DTS0179.pdf`. Follow those PDF links for the actual specs.
- **Product-page URLs are unpredictable — don't guess them.** Guessing `/products/variable_attenuators.html` returned a 404 page (served as HTTP 200 with a "404 | OZ Optics" body). Always take the exact `link` from the API rather than constructing `/products/<slug>.html`.
- **www vs. non-www:** canonical host is `www.ozoptics.com` and the SiteSearch360 `siteId` is `www.ozoptics.com`. `ozoptics.com` serves the same content but always pass `site=www.ozoptics.com` to the API.
- **Browser: `browse get text body` returns the inline `ss360Config` script, not clean results.** The homepage/results page embed the SiteSearch360 config as inline JS, which dominates `get text body`. In the browser fallback use `browse snapshot` (a11y tree + urlMap) to read rendered result titles and hrefs.
- **Online Catalog links leave the marketing site.** `Online Catalog` results point at `shop.ozoptics.com` (separate e-commerce app). Fine as a "buy it here" link, but specs there differ in layout from the `DTS` datasheets.

## Expected Output

Primary shape — one entry per matching result, grouped fields flattened:

```json
{
  "success": true,
  "query": "polarization controller",
  "total_results": 58,
  "results": [
    {
      "name": "High-Speed Polarization Controller-Scrambler",
      "link": "https://www.ozoptics.com/products/high-speed-polarization-controller-scrambler.html",
      "content_group": "Products",
      "type": "HTML",
      "datasheet_links": [
        "https://www.ozoptics.com/ALLNEW_PDF/DTS0174.pdf",
        "https://www.ozoptics.com/ALLNEW_PDF/DTS0179.pdf"
      ],
      "specs_location": "See linked DTS PDFs for full specifications"
    },
    {
      "name": "DTS0157 - Fused Fiber Collimator",
      "link": "https://www.ozoptics.com/ALLNEW_PDF/DTS0157.pdf",
      "content_group": "Data Sheets",
      "type": "PDF",
      "datasheet_links": ["https://www.ozoptics.com/ALLNEW_PDF/DTS0157.pdf"],
      "specs_location": "This PDF is the datasheet; extract spec tables from it"
    },
    {
      "name": "Electrically Driven Polarization Controllers",
      "link": "https://shop.ozoptics.com/electrically-driven-polarization-controllers",
      "content_group": "Online Catalog",
      "type": "HTML",
      "datasheet_links": [],
      "specs_location": "Online store product page"
    }
  ],
  "error_reasoning": null
}
```

Zero-results / query-correction shape (e.g. an over-specific query like `"980nm isolator"`):

```json
{
  "success": true,
  "query": "980nm isolator",
  "total_results": 0,
  "results": [],
  "query_correction": null,
  "error_reasoning": "No matches. Query too specific — retry with the product family term (e.g. 'isolator') and filter client-side."
}
```

Raw per-item shape as returned by the SiteSearch360 API (for reference):

```json
{
  "name": "DTS0092 - Polarization Maintaining Fused Fiber Couplers/Splitters",
  "image": "https://images.sitesearch360.com/file/sitesearch360/...150.jpg",
  "link": "https://www.ozoptics.com/ALLNEW_PDF/DTS0092.pdf",
  "type": "PDF",
  "relevance": 100135.45,
  "kvtable": "<table></table>",
  "images": [],
  "dataPoints": []
}
```
