---
name: saizeriya-com-sg-query-menu-data-qw4uqo
title: Saizeriya SG Menu Data API
description: >-
  Pull Saizeriya Singapore's current menu (Grand, Lunch, Kids) and 44-outlet
  directory as structured data via deterministic static-URL GETs — the site
  exposes no JSON API, but its three versioned PDF endpoints plus /menu/ HTML
  index function as one.
website: saizeriya.com.sg
category: restaurants
tags:
  - restaurants
  - menu
  - saizeriya
  - singapore
  - pdf
  - static-site
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      Only useful when the HTTP transport blocks PDF downloads or response size
      is capped — open /menu/ in a Chromium session and use in-page fetch() to
      pull the 8.84 MB Grand Menu PDF. For data extraction, browsing offers
      nothing the GET path doesn't, and Chromium's PDF viewer renders into a
      canvas/embed yielding no a11y refs.
  - method: hybrid
    rationale: >-
      When pulling the Grand Menu through a transport with a small body cap
      (e.g. Browserbase Fetch API's 1 MB ceiling): use bare GETs for the index +
      Lunch + Kids PDFs, and either HTTP Range requests or in-browser fetch()
      exfiltration for the Grand Menu.
verified: true
proxies: true
---
# Saizeriya Singapore Menu Data — Use the Website Like an API

## Purpose

Pull Saizeriya Singapore's current menu (Grand, Lunch, Kids) and outlet directory as structured data, without scripted browsing. The site is a thin static-HTML shell whose only machine-readable surface is three versioned PDF files plus one static restaurant-search page — the optimal "API" is a `GET` against deterministic URLs whose filenames the HTML index publishes. Read-only.

## When to Use

- Daily / weekly snapshots of the Saizeriya SG menu to detect new items, price changes, or seasonal swaps.
- Bulk extraction of the 44 outlet directory (name, address, phone) for store-locator features.
- Anywhere you'd otherwise scrape `saizeriya.com.sg` HTML — there is no JS-rendered data path, so cheap HTTP `GET`s beat any browser-driven approach.

## Workflow

The site is a flat, static Apache site. **There is no JSON / GraphQL / XHR endpoint** — every probe to `/api/*`, `/sitemap.xml`, `/robots.txt`, `/menu.json`, `/data/menu.json` returns 404 (verified 2026-05-19). The "API" is two GETs:

1. **GET `/menu/`** — HTML index that surfaces the *current* three PDF filenames in `<a href="/pdf/...pdf">` tags. Filenames are versioned by date (see Site-Specific Gotchas) so they rotate when the menu refreshes; always parse the HTML index first rather than hard-coding filenames.
2. **GET `/pdf/{filename}.pdf`** — the canonical machine-readable menu. Three variants link from `/menu/`:
   - **Grand Menu** — `/pdf/GrandMenu{YYYYMM}S_single.pdf` (current: `GrandMenu202603S_single.pdf`, 8.84 MB, last-modified 2026-03-23).
   - **Lunch Menu** — `/pdf/lunch_{YYYYMM}.pdf` (current: `lunch_202511.pdf`, ~1.0 MB raw / ~750 KB decoded).
   - **Kids Menu** — `/pdf/kids{YYYYMM}S.pdf` (current: `kids202603S.pdf`, ~480 KB raw / ~360 KB decoded).

A residential proxy is **not** required — bare HTTPS `GET`s return 200 OK on every endpoint. The site has no anti-bot, no cookies, no auth, no rate-limit headers. Browser-driven scraping pays a ~50× cost premium and surfaces zero data the static fetch doesn't.

### Step-by-step (API path)

1. **Discover current PDF filenames** — `GET https://www.saizeriya.com.sg/menu/`, parse `<a href="/pdf/(...)\.pdf">` to get the three current filenames. The `<h3>` next to each anchor tags it `GRAND MENU` / `LUNCH MENU` / `KIDS MENU`. The HTML response is small (~11 KB), text/html, no JS rendering required.

2. **Fetch each PDF**:
   ```
   GET https://www.saizeriya.com.sg/pdf/{filename}.pdf
   ```
   Response is `application/pdf` with `Accept-Ranges: bytes` and `Last-Modified` (e.g. `Mon, 23 Mar 2026 04:14:02 GMT` for the Grand Menu). Use `If-Modified-Since: {Last-Modified}` for cheap freshness polling — the menu refreshes on a multi-month cadence (2025-11 lunch, 2026-03 grand+kids).

   **The Grand Menu PDF is 8.84 MB.** Two practical retrieval paths if your fetch transport caps response size (e.g. Browserbase Fetch API's 1 MB cap returns `502 The response body exceeded the maximum allowed size of 1MB`):
   - **HTTP Range** — send `Range: bytes=0-1048575`, then iterate `Range: bytes={n}-{n+1048575}` and concatenate. Server returns `206 Partial Content` with `Content-Range`. Verified 2026-05-19 via in-browser `fetch()` against the live PDF.
   - **In-browser `fetch()`** — open *any* same-origin page (`/menu/` works), run `await fetch('/pdf/GrandMenu202603S_single.pdf').then(r => r.arrayBuffer())`, then exfiltrate the bytes (e.g. base64 over CDP or a data: URL). Bypasses the transport cap because the response is consumed inside the browser process.

3. **Extract text from each PDF**. Recommended: Node + `pdf-parse` (`new PDFParse({ data: buf }).getText()`); Python + `pypdf` / `pdfplumber` works equally well. Each PDF is single-page with menu items in English + Simplified Chinese plus prices in the form `S$X.XX nett`. Sample (Kids Menu):
   ```
   Chicken Wing 5pcs  S$4.90 nett  鸡翅5只
   Double Potato      S$3.90 nett  双份薯角
   Corn Cream Soup    S$2.90 nett  玉米奶油浓汤
   Kid's Meal         S$5.90 nett  儿童套餐
   Italian Pudding    S$3.90 nett  意式奶冻
   Oreo Cheese Cake   S$3.90 nett  奥利奥芝士蛋糕
   Free Flow Drink for Kids (Age 4-12)  S$1.50 nett per pax
   ```
   Item structure repeats: `{English Name}  S${price} nett  {Chinese Name}`. The header line (date stamp like `2026.03`) and footer disclaimer (`Presentation of food may differ...`) are predictable boilerplate — strip them before parsing.

4. **(Optional) Outlet directory** — `GET https://www.saizeriya.com.sg/search/` returns ~60 KB of static HTML with 44 outlets. Each outlet is a `<div class="bubbleInfo">` containing:
   ```html
   <div class="popup_m pop2-{slug}"><h6>{Outlet Name}</h6></div>
   <div class="popup pop1-{slug}"><p>
     <span class="header01">{Outlet Name}</span><br>
     Address:<br>
     {Street address}, Singapore {postal code}</br>
     Tel: {phone}<br>
     Fax: {phone}<br>
   </p></div>
   ```
   Outlets are grouped by region anchor (`#central`, `#east`, `#north`, `#northEast`, `#west`). A short slug (`lcsc`, `csm`, `nex`, etc.) appears in both `pop1-*` and `pop2-*` class names — usable as a stable outlet ID.

### Browser fallback

Only useful when (a) your transport blocks PDF downloads entirely or (b) you specifically need the rendered visual layout. Open `https://www.saizeriya.com.sg/menu/` in any Chromium session, snapshot the three PDF anchor refs, click into each one. The browser's built-in PDF viewer renders the menu inline. There is no benefit over `GET` + `pdf-parse` for data extraction — the Chromium PDF viewer is non-introspectable from the snapshot tree (PDF.js renders into a `<canvas>`/embed that yields no a11y refs), so you cannot extract menu text from the browser DOM. Use the browser **only** to download the bytes (via in-page `fetch()`) when your HTTP transport has a body-size cap.

## Site-Specific Gotchas

- **Filenames are date-stamped and rotate** — the current pattern is `{type}{YYYYMM}[S]_[suffix].pdf`. Observed today: Grand `GrandMenu202603S_single.pdf` (2026-03), Lunch `lunch_202511.pdf` (2025-11), Kids `kids202603S.pdf` (2026-03). The `S` suffix appears on Grand + Kids but not Lunch — assume it's a Singapore-region tag, not a guaranteed pattern. **Always parse `/menu/` HTML for the current filenames; never hard-code.** Hard-coded URLs will silently 404 the next time the marketing team refreshes the menu.
- **Grand Menu exceeds 1 MB** (currently 8.84 MB). Transports with a small response cap (notably the Browserbase Fetch API, capped at 1 MB and returning `502 The response body exceeded the maximum allowed size of 1MB`) cannot pull it in one shot. Apache serves `Accept-Ranges: bytes` so use `Range:` requests, or pull the bytes inside a browser session via in-page `fetch()`. Lunch and Kids PDFs fit under 1 MB and can use any transport.
- **No sitemap, no robots.txt, no JSON endpoints.** Confirmed 404 on `/robots.txt`, `/sitemap.xml`, `/sitemap_index.xml`, `/api/menu`, `/menu.json`, `/data/menu.json` (2026-05-19). Do not waste turns probing for a JSON API — it does not exist.
- **No anti-bot / no auth.** Plain HTTPS `GET` returns 200 OK on every endpoint. `--proxies` / `--verified` flags on the Browserbase session are unnecessary cost for this site; bare fetch is fine.
- **`html` declares `lang="ja"` despite serving English** — the site was forked from Saizeriya Japan and the `lang` attribute was never updated. Don't rely on `lang` to detect locale; trust the `.sg` domain instead.
- **Multiple GA/GTM tags** — pages embed three Google Analytics IDs (`UA-65535147-1`, `UA-134913146-1`, `UA-140695686-1`) but no data of interest. They do not gate content and can be ignored.
- **Currency / GST** — every menu page footer states *"All prices are nett (inclusive of GST, No service charge)"* and the homepage repeats `GST Inclusive & No service charge`. Treat all extracted prices as final consumer-paid SGD; no separate tax math needed.
- **Operating hours are global, not per-outlet.** Footer states `11:00 am – 10:00 pm (Last Order 09:30 pm)`. Individual outlets may close earlier (esp. CNY) — confirm with the outlet via the `Tel:` in the `/search/` block before relying on these hours.
- **PDFs are flat single pages.** Each of the three is `pages=1` per `pdf-parse`. Don't paginate — iterate items via regex on the extracted text (`S\$\d+\.\d{2}\s*nett` is a reliable price anchor).
- **Chinese translations are co-located.** Items in the PDF text stream alternate English line → price line → Chinese line. When the layout uses centered/spaced glyphs (e.g. `KID'S ME	 	NU`), tabs and stray whitespace appear mid-word — normalize with `s/\s+/ /g` before keyword matching.
- **Apache `Content-Security-Policy: upgrade-insecure-requests`** is the only security header; no HSTS, no CORS preflight. Cross-origin `fetch()` from `https://www.saizeriya.com.sg/` is unrestricted *to its own origin*, which is what the in-browser large-PDF retrieval trick relies on.

## Expected Output

```json
{
  "fetched_at": "2026-05-19T00:15:08Z",
  "menu_index": {
    "source_url": "https://www.saizeriya.com.sg/menu/",
    "grand_menu_url": "https://www.saizeriya.com.sg/pdf/GrandMenu202603S_single.pdf",
    "lunch_menu_url": "https://www.saizeriya.com.sg/pdf/lunch_202511.pdf",
    "kids_menu_url":  "https://www.saizeriya.com.sg/pdf/kids202603S.pdf",
    "grand_menu_version": "2026.03",
    "lunch_menu_version": "2025.12",
    "kids_menu_version":  "2026.03",
    "grand_menu_last_modified": "2026-03-23T04:14:02Z",
    "grand_menu_size_bytes": 8843067
  },
  "items": [
    {
      "menu": "kids",
      "name_en": "Chicken Wing 5pcs",
      "name_zh": "鸡翅5只",
      "price_sgd": 4.90,
      "price_nett": true,
      "notes": null
    },
    {
      "menu": "kids",
      "name_en": "Free Flow Drink for Kids",
      "name_zh": null,
      "price_sgd": 1.50,
      "price_nett": true,
      "notes": "Age 4-12 years old only; per pax"
    },
    {
      "menu": "lunch",
      "name_en": "Teriyaki Chicken Lunch",
      "name_zh": "照烧酱鸡排套餐",
      "price_sgd": 9.00,
      "price_nett": true,
      "notes": "Mon-Fri 11:00am-5:00pm, excl. PH; includes free-flow hot & cold beverage"
    }
  ],
  "outlets": [
    {
      "id": "lcsc",
      "name": "Liang Court SC",
      "region": "central",
      "address": "177 River Valley Road, #02-22 Liang Court Shopping Centre, Singapore 179030",
      "tel": "6970 2588",
      "fax": "6970 2589"
    },
    {
      "id": "csm",
      "name": "City Square Mall",
      "region": "central",
      "address": "180 Kitchener Road, #B2-55/56 City Square Mall, Singapore 208539",
      "tel": null,
      "fax": null
    }
  ],
  "outlet_count": 44,
  "hours_global": "11:00 am – 10:00 pm (Last Order 09:30 pm)",
  "currency": "SGD",
  "tax_note": "All prices nett (inclusive of GST, no service charge)"
}
```
