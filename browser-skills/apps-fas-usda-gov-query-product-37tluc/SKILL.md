---
name: apps-fas-usda-gov-query-product-37tluc
title: 'USDA FAS GATS — Query Trade by Product, Year, Destination & Data Value'
description: >-
  Run a Standard Query on the USDA FAS Global Agricultural Trade System (GATS)
  to retrieve U.S. agricultural trade figures for a chosen product, trade flow,
  destination partner, year range, and data-value type (Value or Quantity).
  Read-only.
website: apps.fas.usda.gov
category: trade-data
tags:
  - usda
  - fas
  - gats
  - agriculture
  - trade-data
  - aspnet
  - read-only
source: 'browserbase: agent-runtime 2026-06-03'
updated: '2026-06-03'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      GATS exposes an Open Data API (apps.fas.usda.gov/OpenData/api/gats/...)
      but every endpoint returns HTTP 403 'Bad API Key' without a registered
      api.data.gov / FAS Open Data key. With no key provisioned in this
      environment the API is unusable, so the browser Standard Query is the
      recommended path. If you hold a key, the API is faster and structurally
      cleaner than scraping the grid.
verified: true
proxies: true
---
# USDA FAS GATS — Query Trade by Product, Year, Destination & Data Value

## Purpose

Drive the USDA Foreign Agricultural Service **Global Agricultural Trade System
(GATS)** "Standard Query" to retrieve U.S. agricultural trade figures for a
chosen **product/commodity**, **trade flow** (exports / imports / re-exports), a
**destination partner** (country, region, or partner group), a **range of
years**, and a **data-value type** (dollar Value, Unit Value, or Quantity, plus
unit). Returns the resulting per-year data grid as structured JSON. **Read-only**
— it only retrieves and never submits any account/booking action.

## When to Use

- "What were U.S. soybean exports to China for 2021–2023?"
- Pulling a time series of trade Value or Quantity for one product × one
  destination across a year range.
- Comparing a commodity's trade to several partners/regions (the partner listbox
  is multi-select).
- Any flow where you'd otherwise hand-click the GATS Standard Query form. The
  GATS Open Data API would be cheaper, but it requires a registered API key
  (see Gotchas) — without one, this browser flow is the only path.

## Workflow

GATS is a stateful **ASP.NET WebForms** app (ViewState, postbacks, an
Infragistics grid). There is no usable anonymous JSON API (the Open Data API is
key-gated — see Gotchas), so drive the form directly. Use a **stealth +
residential-proxy** Browserbase session (`--verified --proxies`); the converged
run used both. Do **not** `browse snapshot` this page — it returns thousands of
useless xpath refs. Use the exact CSS name-selectors below. All form controls
share the prefix `ctl00$ContentPlaceHolder1$` (use `$` in the `name` attribute,
`_` in the `id`).

1. **Prime the session cookie.** Open the home page first:
   ```bash
   browse open "https://apps.fas.usda.gov/gats/default.aspx" --remote
   browse wait load --remote
   ```
   This sets the `detectscreen` session cookie. Skipping it makes the next
   navigation 302-redirect to `detectscreen.aspx?returnpage=default.aspx`.

2. **Open the Standard Query builder:**
   ```bash
   browse open "https://apps.fas.usda.gov/gats/ExpressQuery1.aspx" --remote
   browse wait load --remote
   ```

3. **Set the trade flow** (`ddlProductType`), then wait — it may postback:
   ```bash
   browse select "select[name='ctl00$ContentPlaceHolder1$ddlProductType']" "X" --remote
   browse wait timeout 1500 --remote
   ```
   Values: `X`=Exports, `C`=Imports - Consumption, `G`=Imports - General,
   `R`=Re-Exports.

4. **Select the product** in the `lb_Products` listbox (no postback). Default
   classification is BICO-HS10 aggregate groups; e.g. `0035AT`=Soybeans,
   `0015AT`=Wheat, `0020AT`=Corn, `0045AT`=Cotton:
   ```bash
   browse select "select[name='ctl00$ContentPlaceHolder1$lb_Products']" "0035AT" --remote
   ```

5. **Select the destination partner** in the `lb_Partners` listbox (no
   postback); e.g. `CH`=China, `CA`=Canada, `MX`=Mexico, `JA`=Japan,
   `R00`=World Total, `R40`=East Asia, `210`=China and Hong Kong:
   ```bash
   browse select "select[name='ctl00$ContentPlaceHolder1$lb_Partners']" "CH" --remote
   ```

6. **Pick the data-value type + unit.** This is the "type of data value":
   ```bash
   browse select "select[name='ctl00$ContentPlaceHolder1$ddlValueType']" "GVAL" --remote   # GVAL=Value, UVAL=Unit Value, ''=None
   browse select "select[name='ctl00$ContentPlaceHolder1$ddlValueUnit']" "M" --remote       # D=Dollars, T=Thousands, M=Millions, B=Billions
   ```
   For tonnage instead of dollars, set `ddlQuantityType` to `Q1` (Quantity) and
   `ddlQuantityUnit` (e.g. `FASN`=FAS Non Converted, `FASC`=FAS Converted). You
   may set both Value and Quantity to get two metric columns.

7. **Set the year range** (`ddlDateSeries` defaults to `Annual`; also
   `Monthly`, `Quarterly`, `TwoYear`). Years span ~2009→current:
   ```bash
   browse select "select[name='ctl00$ContentPlaceHolder1$ddlStartYear']" "2021" --remote
   browse select "select[name='ctl00$ContentPlaceHolder1$ddlEndYear']" "2023" --remote
   ```

8. **Retrieve the data:**
   ```bash
   browse click "input[name='ctl00$ContentPlaceHolder1$btnRetrieveData']" --remote
   browse wait load --remote
   browse wait timeout 3000 --remote        # the results UpdatePanel renders 1–3s after load
   ```

9. **Extract the results grid** by its exact id — note the **double underscore**
   after `UltraWebTab1`:
   ```bash
   browse get text "#ctl00_ContentPlaceHolder1_UltraWebTab1__ctl1_grdExpressQuery_GridView1" --remote
   ```
   **Parse by table cells, not by the text blob.** The grid's `innerText`
   concatenates cells with no separators (e.g.
   `1China1Soybeans14,11617,91715,057-16`). Walk `tr → th,td`:
   - The header rows give the year columns (`2021 2022 2023`) and the metric
     label (`Value` per year).
   - A data row carries a partner label, a product label (each may appear
     duplicated due to rowspans — dedupe), and a run of numeric cells. The
     **trailing `N_years + 1` numeric cells** are the per-year values followed by
     one Period/Period % Change column — take the year cells, drop the last.
   - Strip commas → integers. Skip the `Grand Total` row (or capture it
     separately).
   - The data-source note (`Data Source : U.S. Census Bureau Trade Data`) and
     product-group note live in the body text below the grid, not in the grid.

   Export buttons (`Create CSV File`, `Other Formats`, `Printer Friendly`,
   `Calculation Formulas`, `Change Base Year`) exist if you prefer a file export
   over scraping the grid.

## Site-Specific Gotchas

- **Open Data API is key-gated — don't bother without a key.** `GET
  https://apps.fas.usda.gov/OpenData/api/gats/commodities` (and every other
  `/OpenData/api/gats/*` endpoint) returns **HTTP 403 `Bad API Key`** with no
  key. `apps.fas.usda.gov/opendataweb/` 302-redirects to the
  `opendatawebv2/#/home` SPA, and the bare `/api/gats/*` path is 404. You must
  register for an api.data.gov / FAS Open Data key to use the API. With no key
  provisioned, the browser Standard Query is the only working path.
- **Must visit `default.aspx` first.** Direct navigation to `ExpressQuery1.aspx`
  in a cold session 302-redirects to `detectscreen.aspx`. Loading the home page
  sets the `detectscreen` cookie; afterwards direct nav to `ExpressQuery1.aspx`
  works within the same session.
- **Never `browse snapshot`.** The accessibility tree returns thousands of xpath
  refs and burns turns/tokens. Use the CSS name-selectors above directly.
- **Selector quirks.** Control `name` attributes use `$` (`ctl00$ContentPlaceHolder1$ddlStartYear`);
  the matching `id` uses `_`. The results grid id has a **double underscore**:
  `ctl00_ContentPlaceHolder1_UltraWebTab1__ctl1_grdExpressQuery_GridView1`.
  Guessing `uwlbStandardSelections...` fails — that was a dead end.
- **Only the trade-flow / product-group dropdowns postback.** Changing
  `ddlProductType` (or `ddlProductGroup`, which re-keys the product list) fires a
  full postback — wait ~1.5s after. Selecting inside the `lb_Products` /
  `lb_Partners` listboxes does **not** postback.
- **`Retrieve Data` is a full-page postback**, not a partial XHR — the page
  reloads at the same URL with the grid appended. Wait for `load` then a ~3s
  fixed timeout before reading the grid.
- **Grid `innerText` has no cell separators.** `14,11617,91715,057` is three
  values (`14,116`, `17,917`, `15,057`) glued together — regex on the text blob
  is unreliable. Parse `td` cells. Values use comma thousand separators; strip
  them.
- **Partner/product labels duplicate in cells** due to rowspan rendering
  (`China China ... Soybeans Soybeans ...`). Dedupe before taking
  `[partner, product]`.
- **Product classification matters.** `ddlProductGroup` selects the coding
  system: `BICO-HS10` (default), `BICO-HS6`, `FAS`, `FATUS`, `HS2/HS4/HS6/HS10`
  (raw Harmonized), `WTO`, `OFood`, `PFood`, `SSG`. The product codes in
  `lb_Products` change with the group; codes here (e.g. `0035AT`) are BICO-HS10
  aggregates. To query a raw HS code, switch the group first.
- **`ddlDataSource`** offers `FASUSTR` (FAS U.S. Trade, default), `USCUSTD`
  (U.S. Customs Districts), `USSTATS` (U.S. States) — the latter two change the
  partner/geography dimension.
- **Output options** before retrieving: `ddlInclude` (All / Top N),
  `ddlOrderBy` (Code / Description / Rank), `ddlInDetail` (Summary / Partner /
  Product), `ddlCalculation` (Period % Change, Average, Subtotals, …). The
  default `Period/Period % Change` adds the trailing calc column seen in the
  grid.
- **A feedback/survey widget** (Foresee/`fba` form fields, `question_*`) is
  injected into the page DOM — ignore those inputs; they are not part of the
  query form.

## Expected Output

Successful query (China soybean exports, Value in millions, 2021–2023):

```json
{
  "success": true,
  "data_source": "U.S. Census Bureau Trade Data",
  "trade_flow": "Exports",
  "product": "Soybeans",
  "partner": "China",
  "value_type": "Value",
  "unit": "Millions of dollars",
  "period": "January - December",
  "rows": [
    { "partner": "China", "product": "Soybeans",
      "values": { "2021": 14116, "2022": 17917, "2023": 15057 } }
  ],
  "error_reasoning": null
}
```

Multi-partner / multi-product queries return one object per data row in `rows`
(plus a separate Grand Total row you may include or drop). If the grid yields no
rows (e.g. an invalid product/partner/year combination with no trade), emit:

```json
{ "success": false, "rows": [], "error_reasoning": "No data returned for the selected product/partner/year combination." }
```
