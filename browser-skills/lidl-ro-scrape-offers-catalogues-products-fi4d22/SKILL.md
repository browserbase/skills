---
name: lidl-ro-scrape-offers-catalogues-products-fi4d22
title: 'Lidl Romania Offers, Catalogues & Products Scrape'
description: >-
  Pull Lidl Romania's complete data surface: every active
  weekly/regional/special catalogue (with page imagery, OCR keywords, PDF
  download URLs, validity dates) plus the full permanent product assortment
  (~2,500 SKUs with daily-refreshed prices). All via unauthenticated public APIs
  — no browser, no stealth.
website: lidl.ro
category: retail
tags:
  - retail
  - grocery
  - catalogues
  - offers
  - pricing
  - lidl
  - romania
source: 'browserbase: agent-runtime 2026-05-24'
updated: '2026-05-24'
recommended_method: api
alternative_methods:
  - method: fetch
    rationale: >-
      The same three endpoints (Schwarz Group's /v4/overview and /v4/flyer JSON,
      plus Lidl's XLSB pricelist) work equally well via any HTTP client —
      `curl`, `wget`, or `browse cloud fetch`. No CORS or referer guard.
  - method: browser
    rationale: >-
      Only useful as a fallback if the JSON API is ever blocked (not observed in
      testing). The browser path loses the per-page keyWords/altText metadata,
      which only exists in the API response, so the JSON path is strictly
      richer.
verified: true
proxies: true
---
# Scrape Lidl Romania Offers, Catalogues, and Products

## Purpose

Return the full set of currently-active Lidl Romania weekly offers (catalogues / leaflets) and the permanent in-store product assortment with prices. Three orthogonal data surfaces — all reachable via unauthenticated JSON / file endpoints, no browser, no stealth, no cookies:

1. **Offers / catalogues listing** — every active flyer (national + per-store regional supplements) with metadata, validity dates, thumbnails, page count, and PDF URLs.
2. **Catalogue detail** — for any single flyer: full page imagery (web + high-res), per-page OCR `keyWords`, per-page `altText`, external product hotspot links, validity windows, downloadable PDF.
3. **Permanent product assortment with daily prices** — the entire ~2,500-SKU in-store assortment (food, household, cosmetics, etc.) as a freely-downloadable XLSB file refreshed Monday–Friday.

Read-only — no login, no `Lidl Plus` account, no store selection.

## When to Use

- Daily / weekly catalogue monitoring — detect new flyers, expiring offers, regional supplements.
- Price tracking across the permanent assortment (`Pret vanzare` column refreshed Mon–Fri).
- Building a Lidl-RO product database (~2,500 items × ~33 categories).
- Pulling page imagery / PDFs for downstream OCR or layout analysis.
- Any task that says "what's on offer at Lidl Romania this week" — the catalogues are the only authoritative source (Lidl Romania has no e-commerce site; printed catalogues + the daily pricelist are the only product data surface).

## Workflow

Lidl-RO's catalogue platform is run by Schwarz Group on `endpoints.leaflets.schwarz` — a public, CORS-open (`Access-Control-Allow-Origin: *`) JSON API behind a Myracloud CDN. The XLSB pricelist sits on Lidl's own CDN. **All three endpoints are reachable with plain HTTP from any IP — no auth, no proxies, no stealth required.** Lead with the API path; the catalogue viewer UI on `lidl.ro/l/ro/cataloage/...` is a thin React client over the same `v4/flyer` endpoint, so browser scraping is strictly wasteful.

### 1. List all currently-active catalogues

```
GET https://endpoints.leaflets.schwarz/v4/overview?client_locale=lidl/ro-RO
```

Returns `categories[].subcategories[].flyers[]`. Observed subcategories on 2026-05-24:

| Subcategory | Typical flyer count | Examples |
|---|---|---|
| `Cataloage săptămânale` | 3–4 | "Catalogul săptămânal de luni 18.05 până duminică 24.05" |
| `Oferte speciale` | 4–6 | Per-store / regional supplements ("Oferte speciale Breaza") |
| `Cataloage speciale` | 1–3 | "Catalogul de vinuri", "Universul categoriilor de produse Lidl" |
| `Lidl Plus` | 1 | "Broșura Lidl Plus" |

Per-flyer fields you'll want:

```json
{
  "id": "019e15ca-3d0f-7d03-b9da-35c55ce34018",
  "name": "Catalogul săptămânal",
  "title": "de luni, 18.05 până duminică, 24.05",
  "startDate": "2026-05-13",
  "endDate": "2026-05-24",
  "offerStartDate": "2026-05-18",
  "offerEndDate": "2026-05-24",
  "status": "current",
  "discoverable": true,
  "pdfUrl": "https://object.storage.eu01.onstackit.cloud/leaflets/pdfs/{id}/{slug}-00.pdf",
  "hiResPdfUrl": "...",
  "fileSize": 65022562,
  "thumbnailUrl": "https://imgproxy.leaflets.schwarz/.../...jpg",
  "flyerUrlAbsolute": "https://www.lidl.ro/l/ro/cataloage/{slug}/ar/{regionCode}",
  "flyerJson": "https://endpoints.leaflets.schwarz/v4/flyer?version=4&flyer_identifier={slug}&client=lidl",
  "regions": [{"type":"store","code":576}]
}
```

The `flyerJson` field is the canonical detail-endpoint URL for step 2 (note: it omits `region_id`/`region_code`; you can either trust the slug or rebuild the URL yourself with explicit region params).

### 2. Fetch a single catalogue's full content

```
GET https://endpoints.leaflets.schwarz/v4/flyer
    ?flyer_identifier={slug}
    &region_id={regionCode}      # 0 for national catalogues
    &region_code={regionCode}    # mirrors region_id
```

The `{slug}` is the kebab-case path component of `flyerUrlAbsolute` (e.g. `catalogul-saptamanal-de-luni-18-05-pana-duminica-24-05`). National catalogues use `region_id=0&region_code=0`; per-store supplements use the `regions[0].code` from step 1 (e.g. 576 = Breaza). Response shape (top-level → `flyer`):

```json
{
  "flyer": {
    "id": "<uuid>",
    "name": "Catalogul săptămânal",
    "title": "de luni, 18.05 până duminică, 24.05",
    "locale": "ro-RO",
    "countryCode": "RO",
    "category": "Cataloage și reviste săptămânale",
    "subcategory": "Cataloage săptămânale",
    "startDate": "2026-05-13",
    "endDate": "2026-05-24",
    "offerStartDate": "2026-05-18",
    "offerEndDate": "2026-05-24",
    "status": "current",
    "isActive": true,
    "pdfUrl": "...",            // ~65 MB hi-res PDF
    "hiResPdfUrl": "...",       // same value in observed payloads
    "fileSize": 65022562,
    "pages": [                  // 86 pages for a typical weekly catalogue
      {
        "id": "<uuid>",
        "number": 1,
        "width": 1415, "height": 2400,
        "type": "STANDARD",
        "pageType": "page",
        "image":     "https://imgproxy.leaflets.schwarz/.../...jpg",   // 1200px JPEG
        "zoom":      "https://imgproxy.leaflets.schwarz/.../...jpg",   // 2400px JPEG
        "thumbnail": "https://imgproxy.leaflets.schwarz/.../...jpg",   // 400px JPEG
        "altText": "Oferte speciale Lidl: fructe, legume, ulei, carne, ...",
        "keyWords": "Roșii Cherry Ciorchine 2996 Lei 2799 -30% 1499 ...",  // OCR text
        "links": []             // see below — usually empty on RO
      }
    ],
    "products": [],             // ALWAYS EMPTY on Lidl-RO (see Gotchas)
    "relatedFlyers": [...]      // sibling catalogues (alternate weeks, related books)
  }
}
```

**Where the per-product data hides**: `flyer.products[]` is **always empty** for Lidl Romania — Lidl-RO does not annotate page hotspots with structured product records the way some other Lidl markets do. Per-product info must be derived from:

- `page.keyWords` — space-tokenized OCR text. Contains product names, prices (e.g. `2996` = 29.96 RON, `2799` = 27.99 RON), percent discounts (`-30%`), and weight/size annotations. Treat as bag-of-words; do not assume order.
- `page.altText` — short human-readable description of what the page depicts.
- `page.links[]` — external URLs (typically partner/landing pages, e.g. UEFA / Heineken redirects). Almost never present (2 of 86 pages in the May-18 weekly catalogue).
- The hi-res PDF (`hiResPdfUrl`) — if you need per-item structure, run OCR over the PDF; pages are independently OCR-able JPEGs at `page.zoom`.

### 3. Pull the full permanent product list (~2,500 SKUs, daily refresh)

```
GET https://www.lidl.ro/explore/assets/webPriceData/ro/preturiZilniceLidl.xlsb
```

Returns an ~85 KB XLSB workbook (single sheet, name `EPEL`). Columns (Romanian):

| Column | English | Example |
|---|---|---|
| `Denumire comerciala` | Product name | `Capsune caserola 500g` |
| `Gramaj` | Pack size | `500g`, `1kg`, `per kg`, `4buc` |
| `Categorie` | Category | `Legume si Fructe` |
| `Pret vanzare` | Sale price (RON) | `12.49` |

Parse with any XLSB library (e.g. SheetJS / `xlsx` in Node, `openpyxl`+`xlrd` won't work — XLSB is binary; use `pyxlsb` for Python). 33 distinct categories observed on 2026-05-24:

```
Baby, Bauturi, Branzeturi, Cafea, Carne si peste, Ceai, Cereale, Congelate,
Conserve, Cosmetice, Detergenti, Dulciuri si snackuri, Hartie igienica si servetele,
Hrana pentru animale, Inghetata, Ingrediente pentru copt, Ketchup mustar sosuri,
Lactate, Legume si Fructe, Mezeluri, Miere dulceturi si alte creme,
Mirodenii si condimente, Oua, Paine si patiserie, Paste fainoase, Proaspete,
Produse de baza, Produse pentru curatenie, Supe si baze pentru supe,
Suplimente alimentare, Tigari si tigarete, Ulei unt margarina, Uz casnic
```

Row count observed: **2,534 products** (3,000 rows with trailing blanks). The page at `https://www.lidl.ro/c/preturile-la-zi/s10019622` says "every day, Monday through Friday we provide the price list of all products in the permanent assortment" — treat refresh cadence as **business-daily** and re-pull each weekday morning if you're tracking deltas.

### 4. (Optional) Composite snapshot

For a full one-shot scrape:

1. Hit `/v4/overview` → enumerate flyer slugs.
2. For each flyer with `discoverable: true`, hit `/v4/flyer?flyer_identifier={slug}&region_id={code}&region_code={code}` and store the response.
3. Hit `/preturiZilniceLidl.xlsb` and parse → `products[]` table.
4. Emit a unified JSON envelope (schema in `## Expected Output`).

Total wall time: under 10 seconds for ~12 catalogues + the pricelist. Total bandwidth (excluding PDFs and page imagery): ~2 MB.

### Browser fallback

Only needed if the JSON API or XLSB file ever return 4xx — none was observed in 2026-05-24 testing. The browser path:

1. Open `https://www.lidl.ro/c/cataloage-online/s10019911` — lists all catalogues as anchor tags with `href="https://www.lidl.ro/l/ro/cataloage/{slug}/ar/{region}"`. Extract these anchors with `browse get html body` and a regex over `href="https://www\.lidl\.ro/l/ro/cataloage/([^/]+)/ar/(\d+)"`.
2. For each catalogue, open the leaflet viewer URL. The HTML embeds image refs on `imgproxy.leaflets.schwarz` directly, but the per-page `keyWords` / `altText` / link metadata is only available through the `v4/flyer` JSON the React app fetches. There is **no equivalent in the rendered DOM** — falling back to the browser loses these fields, so the JSON API is strictly preferred.
3. For the pricelist, open `https://www.lidl.ro/c/preturile-la-zi/s10019622` and follow the "Descarcă fișierul" anchor — same URL as step 3 above.

No stealth or residential proxy is required for either path. A bare Browserbase session works.

## Site-Specific Gotchas

- **Lidl Romania has no e-commerce site.** `/c/alimente-bauturi/`, `/c/sortiment-principal/`, etc. are **content/navigation pages**, not product catalogs. Do not waste turns scraping them for products — the only structured product data on the entire domain is the XLSB pricelist (permanent assortment) plus the catalogue OCR `keyWords` (promotional offers).
- **`flyer.products[]` is always empty on Lidl-RO** — verified across the weekly catalogue (86 pages, 0 products), the related-flyers list (6 siblings), and the next-week catalogue. Some other Lidl markets (e.g. .de, .es) populate this array with tagged page hotspots; Lidl-RO does not. Plan around OCR / PDF analysis for per-item promotional pricing, not a clean JSON product list.
- **The leaflet API requires no auth, no cookies, no `Referer` header, no proxy.** `Access-Control-Allow-Origin: *` is set. A plain `curl` from any IP works. **Don't waste a Browserbase session on this** unless the fallback path triggers.
- **Slugs encode dates** but are not date-parameterized — you cannot construct future-week URLs by date arithmetic. Always discover slugs via the `/v4/overview` endpoint, then call `/v4/flyer?flyer_identifier={slug}`.
- **Regional supplements need the right `region_code`**. The "Oferte speciale Breaza" flyer in the overview has `regions[0].code = 576`; calling `/v4/flyer?...&region_id=0&region_code=0` against that slug returns a "Requested Flyer not found" response. Use the `regions[].code` from the overview verbatim.
- **`pdfUrl` and `hiResPdfUrl` are usually identical** on Lidl-RO weekly catalogues (both ~65 MB). They may diverge on smaller promo catalogues. Either is safe to fetch; PDFs live on `object.storage.eu01.onstackit.cloud/leaflets/pdfs/{flyer-uuid}/...pdf` (Schwarz's STACKIT object storage — no auth required, public read).
- **`imgproxy.leaflets.schwarz` URLs are base64-encoded.** The path segment after `g:no/` decodes (base64) to `s3://leaflets/images/{flyer-uuid}/page-NN_{hash}.png`. Treat the URLs as opaque blobs — do not try to reconstruct them; copy them out of the API response.
- **`keyWords` is OCR output, not a clean field**. Prices appear as digit sequences with the decimal stripped (`2996` = 29.96 RON, `1499` = 14.99 RON, `-30%` is a discount badge). Sizes (`05`, `600`, `46%`) are likewise context-dependent. Anything beyond simple keyword search will need a parser tuned to OCR conventions.
- **`discoverable: false` flyers exist** — they're returned by `/v4/overview` (so the overview is exhaustive) but the `flyerUrlAbsolute` is not surfaced in the catalogues-hub HTML. Don't filter them out unless your task explicitly only wants "publicly-promoted" catalogues.
- **XLSB ≠ XLSX.** The pricelist is `.xlsb` (binary Excel) not `.xlsx` (XML Excel). Python's `openpyxl` cannot read it — use `pyxlsb` or `pandas.read_excel(..., engine='pyxlsb')`. Node SheetJS reads both.
- **Pricelist has trailing blank rows.** `xlsx`'s `sheet_to_json` returns 3,000 rows but only ~2,534 are populated; filter on a non-empty `Denumire comerciala`.
- **Pricelist refresh cadence is business-daily (Mon–Fri).** Page copy explicitly says "În fiecare zi, de luni până vineri îți punem la dispoziție lista de prețuri" — do not expect weekend updates.
- **Cookie consent dialog (OneTrust) loads on first page view** of any `lidl.ro` page in a browser. It does NOT block the underlying network — API calls succeed before consent. Only the browser fallback path needs the `REFUZAȚI`/`ACCEPTAȚI` button click; for the JSON / XLSB direct-fetch path, ignore it.
- **No GraphQL trap to investigate.** Unlike e.g. OpenTable, Lidl-RO's data layer is plain REST JSON; the `endpoints.leaflets.schwarz/v4/*` surface is the only relevant API and is undocumented but fully open.
- **Catalogue UUID `flyer.id` is stable across requests** but slugs may change (a "Catalogul săptămânal" for 2026-W21 vs 2026-W22 has the same name/title structure but different slugs and UUIDs). Persist `id` when caching, not slug.

## Expected Output

```json
{
  "fetched_at": "2026-05-24T17:40:00Z",
  "catalogues": [
    {
      "id": "019e15ca-3d0f-7d03-b9da-35c55ce34018",
      "slug": "catalogul-saptamanal-de-luni-18-05-pana-duminica-24-05",
      "name": "Catalogul săptămânal",
      "title": "de luni, 18.05 până duminică, 24.05",
      "category": "Cataloage și reviste săptămânale",
      "subcategory": "Cataloage săptămânale",
      "start_date": "2026-05-13",
      "end_date": "2026-05-24",
      "offer_start_date": "2026-05-18",
      "offer_end_date": "2026-05-24",
      "status": "current",
      "region_code": 0,
      "page_count": 86,
      "pdf_url": "https://object.storage.eu01.onstackit.cloud/leaflets/pdfs/019e15ca-3d0f-7d03-b9da-35c55ce34018/Catalogul-saptamanal-de-luni-18-05-pana-duminica-24-05-00.pdf",
      "thumbnail_url": "https://imgproxy.leaflets.schwarz/auS0yK8CaVdMCldZk0OaEJAfubt3vOoQGsDw2EckCmQ/rs:fit:400:400:1/g:no/czM6Ly9sZWFmbGV0cy9pbWFnZXMv...jpg",
      "viewer_url": "https://www.lidl.ro/l/ro/cataloage/catalogul-saptamanal-de-luni-18-05-pana-duminica-24-05/ar/0",
      "pages": [
        {
          "number": 1,
          "image_url": "https://imgproxy.leaflets.schwarz/.../...jpg",
          "zoom_url":  "https://imgproxy.leaflets.schwarz/.../...jpg",
          "alt_text": "Oferte speciale Lidl: fructe, legume, ulei, carne, cafea, bere și articole de uz casnic.",
          "key_words": "Roșii Cherry Ciorchine 2996 Lei 2799 3999 Plus -30% 1499 ...",
          "links": []
        }
      ]
    }
  ],
  "products": [
    {
      "name": "Capsune caserola 500g",
      "size": "500g",
      "category": "Legume si Fructe",
      "price_ron": 12.49,
      "price_currency": "RON"
    },
    {
      "name": "Capsune ladita 1kg",
      "size": "1kg",
      "category": "Legume si Fructe",
      "price_ron": 39.99,
      "price_currency": "RON"
    }
  ],
  "products_count": 2534,
  "products_source": "https://www.lidl.ro/explore/assets/webPriceData/ro/preturiZilniceLidl.xlsb",
  "products_refresh_cadence": "business-daily (Mon-Fri)"
}
```

Empty / error shapes:

```json
// No active catalogues (e.g. between weekly releases — unlikely)
{ "fetched_at": "...", "catalogues": [], "products": [...], "products_count": 2534 }

// Pricelist temporarily unavailable (e.g. weekend or rebuild window)
{ "fetched_at": "...", "catalogues": [...], "products": [], "products_count": 0, "products_error": "XLSB fetch returned 5xx — retry next business day" }
```
