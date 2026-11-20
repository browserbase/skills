---
name: rutronik24-com-component-lookup-and-extract-kv0dpt
title: Rutronik24 Component Lookup & Extraction
description: >-
  Look up electronic components on rutronik24.com by exact MPN or keyword and
  return machine-readable JSON (MPN, manufacturer, public list price, currency,
  stock qty, datasheet, detail URL), parsing the embedded GA4 dataLayer rather
  than scraping the grid.
website: rutronik24.com
category: ecommerce-electronics
tags:
  - electronics
  - distributor
  - component-search
  - datasheet
  - pricing
  - read-only
  - rutronik
source: 'browserbase: agent-runtime 2026-08-07'
updated: '2026-08-07'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      Only needed to switch currency to EUR/GBP (session preference) or to
      render the JS/AJAX visible price (#occalc_ep). Requires a stealth
      --verified --proxies session; extraction is otherwise identical to the
      fetch path.
  - method: api
    rationale: >-
      No usable public JSON/GraphQL/SOAP API — /api/ and /soap/ are
      robots-disallowed and closed. The inline GA4 view_item_list/view_item
      dataLayer is the de-facto machine-readable feed.
verified: true
proxies: true
---
# Rutronik24 Component Lookup & Extraction

## Purpose
Find and extract electronic components from **rutronik24.com** — Rutronik's broadline EU distributor web shop — and return machine-readable JSON for an autonomous agent. Given an exact manufacturer part number (MPN) or a free-text keyword query, this skill returns each result's MPN, manufacturer, description, public list unit price, currency, stock quantity, datasheet URL, and detail URL. It is **read-only**: it locates the sign-in / quotation paths but never logs in, adds to cart, or requests a quote. The cheapest reliable path is a stateless HTTP fetch (through residential proxies) that parses the GA4 `dataLayer` JSON embedded in every results/detail page — no headless browser required.

## When to Use
- Resolve an exact MPN to its Rutronik detail page and pull price/stock/datasheet (e.g. `LM358`, `GRM188R71H104KA93D`).
- Run a keyword/parametric search (e.g. `100nF 0603 X7R capacitor`, `STM32 microcontroller`) and return the top ~20 hits plus the total result count.
- Programmatically decide whether a part is genuinely **not carried** vs the extraction merely broke, vs a field is **login-gated** (price on request / confirmed stock).
- Discover a part's manufacturer, Rutronik order number (`Rutronik No.`), package, MOQ, unit pack, and technical parameters.

## Workflow

**Recommended method — stateless HTTP fetch + dataLayer parse (through residential proxies).** The homepage and search endpoints return **403 to bare requests** (plain UA rejection), so every request must go through Browserbase residential proxies (`browse cloud fetch <url> --proxies --allow-redirects`) or an equivalent client sending a real browser User-Agent + `Referer`. No JavaScript execution is needed: the values you want are server-rendered into an inline GA4 `dataLayer.push(...)` block and schema.org microdata.

1. **Keyword search.** Request `https://www.rutronik24.com/search-result/qs:<URL-encoded query>` with `--allow-redirects`.
   - `/?m=oc&action=search&cmd=NewSearch&qs=<q>` and `/search/<q>` both 301 → the canonical `/search-result/qs:<q>` URL.
   - Query must be **≥ 4 characters**. Space separates terms; wildcards `*` and `?` are supported.
2. **Parse the embedded `view_item_list` dataLayer** from the returned HTML (regex or JSON slice), NOT the visible grid. It looks like:
   ```
   dataLayer.push({ event: 'view_item_list', status: 'not_logged_in',
     ecommerce: { currency: 'USD', items: [
       { item_id:'ICMCU15886', item_name:'XC8664FRIBEFXUMA1', item_brand:'INFINEON',
         item_category:'ICMCU', item_category2:'Digital ICs', item_category3:'Semiconductors',
         price:'4.23000', quantity:1000 }, ... ] } });
   ```
   Map: `item_name` → **mpn**, `item_brand` → **manufacturer**, `item_category2` → **description/category**, `item_id` → Rutronik order number, `price` → **unit_price** (`0.00000` means price hidden / on request → return `null`), `quantity` → **stock_qty**, `ecommerce.currency` → **currency**. Exactly **20 items per page** are emitted.
3. **Total count & pagination.** The total is in `search: ['<term>', '<count>']` near the bottom of the HTML (caps at `10000`). Page with `https://www.rutronik24.com/category-all/move:<N>/qs:<query>` (`move:2` = page 2, …). Sorting is driven by an `orderby` form field / column-header links, not a URL you can rely on.
4. **Currency / locale.** All eight regional domains (`.com`, `.de`, `.co.uk`, `.fr`, `.it`, `.ch`, `.es`, `.com.cn`) **default to USD**; currency is a *session preference*, not baked into the domain. A stateless fetch therefore returns **USD** — always read `ecommerce.currency` (and schema.org `[itemprop=priceCurrency]`) and report it, never assume EUR. To force EUR, use the browser fallback and set `select[name=currency]` → `EUR` (prices are net, **VAT-excluded** B2B list prices).
5. **Exact MPN lookup.** Request `https://www.rutronik24.com/search-result/qs:<MPN>`.
   - An exact match **302-redirects to the detail page** `https://www.rutronik24.com/product/<mfr-slug>/<mpn-slug>/<ordernumber>.html`.
   - A miss redirects to `?m=oc&action=nothingfound` (0 results). **Do not conclude "not found" yet** — see the trimming rule in Gotchas — retry with the base MPN (strip package/packaging suffix). Only after the trimmed query also returns 0 is it a genuine *not carried*.
6. **Detail page fields.** Parse the `view_item` dataLayer (same shape, single item) plus schema.org microdata: `[itemprop=price]`, `[itemprop=priceCurrency]`. Visible labels: `Supplier` = manufacturer, `Matchcode` = MPN, `Rutronik No.` = order number, `Unit Pack`, `MOQ`, `package`, `Packaging`, and a Parameter table (Vcc, Top, RoHS, ECCN, Customs Tariff, Country, Supplier Lead time). Datasheet = `a[href*=pdf]` (points to the manufacturer's CDN, e.g. rohm/infineon).
7. **Emit one JSON object per query** (schema in Expected Output). Set `checked` to the fetch timestamp. Empty results + an explanatory `note` is a **correct** answer, not an error.

### Browser fallback
Only needed to (a) render the JS/AJAX-populated visible price (`#occalc_ep` carries class `occalc_loading`) if you distrust the dataLayer, or (b) switch currency to EUR/GBP. Create a stealth session with **`--verified --proxies`** (`browse cloud sessions create --keep-alive --verified --proxies`), `browse open <url> --remote`, `browse wait timeout 3000`, then either read the same dataLayer via `browse get text body` or set `select[name=currency]=EUR` and re-read `#occalc_ep`. Everything else is identical to the fetch path.

## Site-Specific Gotchas
- **Bare requests get 403.** Homepage probe returns 403 to a default UA; you MUST use residential proxies (or a real browser UA + Referer). Retry order per the task: real UA+Referer → stealth (`--verified`) + proxies. Once proxied, the site returns clean 200s and sets a `PHPSESSID` cookie.
- **The stock quantity is exposed in the `dataLayer` even while logged out**, although the visible DOM shows `Stock Info: Please login` (`span.stock-status.stock-color-red title="Login"`). The `quantity` in `view_item_list` rows varies per part (e.g. 96, 540, 850) and reads as live availability; on a single-product `view_item` it tends to equal the default order quantity (unit pack / MOQ), so prefer the **list-view** `quantity` for true stock and treat detail-view `quantity` with suspicion. **Confirmed real-time stock and contract pricing remain genuinely login-gated** — report those as `null` with a reason, never infer.
- **Prices ARE public** (net list, VAT-excluded). `price: '0.00000'` (and a red/`Login` stock badge) means **price on request / hidden** → return `unit_price: null` with reason `price_on_request`. Non-zero = usable list price in `ecommerce.currency`.
- **Full MPNs frequently do not map to Rutronik's matchcodes.** The search is a substring/token match against an internal *matchcode* index and does **not** normalize package/packaging suffixes:
  - `LM358` → 10 hits (ROHM `LM358FVM-GTR` …) but `LM358DR` (TI order code) → **0**.
  - `GRM188` → 5357 hits, `MURATA 100nF 0603` → GRM188/GCM188 100nF family, but the full `GRM188R71H104KA93D` → **0**.
  - `STM32` → 3 junk hits, `STM32F103` / `STM32F103C8T6` → **0**. `STM32 microcontroller` → 2058 (the keyword `microcontroller` OR-matches MCUs from *other* brands like Infineon; ST STM32 parts are **not carried**).
  - **Rule:** on 0 results, retry with the trimmed base MPN before reporting not-found. All three required exact MPNs (`STM32F103C8T6`, `GRM188R71H104KA93D`, `LM358DR`) return a genuine 0 in their exact form; the family prefixes prove extraction is not broken.
- **Distinguishing real "not found" from broken extraction:** a real miss redirects to `?m=oc&action=nothingfound` AND the HTML contains `search: ['<term>', '0']` AND "0 Products found". If you instead see `item_id:` blocks but your selector returned empty, your DOM selector is wrong — fall back to parsing the dataLayer.
- **Results are a `<table>` grid, not a div-grid.** Rows are `tr` with cells classed `td-description`, `jqtt_price`, `jqtt_vpe`, `stock-row`, `oc_functions`. Selector-scraping the table is brittle; the dataLayer is the stable machine-readable source.
- **`robots.txt` disallows** `/api/`, `/soap/`, `/massquotation/`, `/download/`, `*.pdf`, and `?m=account|ep|pcn|mq|dl`. The public `/product/…` and `/search-result/…` pages are **not** disallowed. Datasheet PDFs are `Disallow`ed and are hosted off-site (manufacturer CDNs) anyway — return the URL, don't crawl it.
- **No usable public JSON/GraphQL API.** `/api/` is robots-blocked and there is no open search API; the embedded GA4 dataLayer is the de-facto machine-readable feed. `window.dataLayer` is **empty at runtime** (gated behind econda cookie consent) — you must parse the inline `<script>` from the HTML source, which is always present.
- **Login / quote paths (do not use):** `My Rutronik`, `Login`, and `Massquotation` all point to `https://www.rutronik24.com/register-login.html`. An anonymous agent sees identity, package/MOQ, list price, datasheet, and specs, but NOT confirmed stock or contract pricing.

## Expected Output
One JSON object per query. `unit_price`/`stock_qty`/etc. that are non-public are `null` with the reason recorded in `note`; empty `results` + a `note` is a correct answer.

```json
{
  "query": "STM32 microcontroller",
  "method": "fetch+datalayer",
  "source": "https://www.rutronik24.com/search-result/qs:STM32%20microcontroller",
  "results": [
    {
      "mpn": "XC8664FRIBEFXUMA1",
      "manufacturer": "INFINEON",
      "description": "Digital ICs (ICMCU)",
      "unit_price": 4.23,
      "currency": "USD",
      "stock_qty": 1000,
      "datasheet_url": null,
      "detail_url": "https://www.rutronik24.com/product/infineon/xc8664fribefxuma1/....html",
      "checked": "2026-08-07T18:40:00Z"
    },
    {
      "mpn": "C164CILMCAFXUMA1",
      "manufacturer": "INFINEON",
      "description": "Digital ICs (ICMCU)",
      "unit_price": null,
      "currency": "USD",
      "stock_qty": 850,
      "datasheet_url": null,
      "detail_url": null,
      "checked": "2026-08-07T18:40:00Z"
    }
  ],
  "note": "2058 total results (count from search:['STM32microcontroller','2058']); showing page 1 of 20/page; currency=USD (session default on .com; set currency=EUR for EUR). price 0.00000 -> null (price_on_request). stock_qty from view_item_list dataLayer; visible UI gates stock behind login. NOTE: no true ST STM32 parts carried — 'microcontroller' keyword matched other brands."
}
```

Exact match (redirect to detail page):
```json
{
  "query": "LM358",
  "method": "fetch+datalayer",
  "source": "https://www.rutronik24.com/product/rohm/lm358fvmgtr/19682456.html",
  "results": [
    {
      "mpn": "LM358FVM-GTR",
      "manufacturer": "ROHM",
      "description": "Ground Sense Operational Amplifier",
      "unit_price": 0.174,
      "currency": "USD",
      "stock_qty": null,
      "datasheet_url": "https://fscdn.rohm.com/en/products/databook/datasheet/ic/amp_linear/opamp/lm358f-e.pdf",
      "detail_url": "https://www.rutronik24.com/product/rohm/lm358fvmgtr/19682456.html",
      "checked": "2026-08-07T18:40:00Z"
    }
  ],
  "note": "Rutronik No. ICOP7795; Unit Pack/MOQ 3000; package MSOP8; lead time 15 weeks. stock_qty=null (confirmed stock login-gated; detail dataLayer quantity=3000 is the MOQ, not live stock). Prices net, VAT-excluded, USD session default -> switch currency to EUR for EUR list price (0.151 EUR)."
}
```

Genuine not-found (correct answer, not an error):
```json
{
  "query": "STM32F103C8T6",
  "method": "fetch+datalayer",
  "source": "https://www.rutronik24.com/search-result/qs:STM32F103C8T6",
  "results": [],
  "note": "0 results in exact form (redirect ?m=oc&action=nothingfound; search:['STM32F103C8T6','0']). Retried trimmed 'STM32F103' -> 0 and 'STM32' -> 3 unrelated items. Conclusion: STMicroelectronics STM32F103 not carried by Rutronik24. Not a broken extraction (identical parser returns results for 'LM358','GRM188')."
}
```
