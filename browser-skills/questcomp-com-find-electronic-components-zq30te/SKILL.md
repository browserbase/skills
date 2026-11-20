---
name: questcomp-com-find-electronic-components-zq30te
title: Quest Components Part Lookup & Extraction
description: >-
  Look up electronic components on questcomp.com by manufacturer part number and
  extract live unit price, stock quantity, datasheet URL, and specs as
  machine-readable JSON. Uses the site's JSON autocomplete PageMethod for search
  and the static JSON-LD-bearing /part/ detail pages for extraction.
website: questcomp.com
category: electronics-distribution
tags:
  - electronics
  - components
  - distributor
  - part-search
  - datasheet
  - pricing
  - obsolete-parts
source: 'browserbase: agent-runtime 2026-08-07'
updated: '2026-08-07'
recommended_method: hybrid
alternative_methods:
  - method: api
    rationale: >-
      Search is a public JSON ASP.NET PageMethod
      (/baseform.aspx/searchpartsforautocomplete) that returns matching MPNs +
      in-stock flag + detail URL. Datasheet URLs resolve via
      /productcategorylisting.aspx/getdatasheeturl. Both are POST JSON, no auth.
  - method: fetch
    rationale: >-
      Each /part/{cat}/{mpn}/{id} detail page is fully server-rendered static
      HTML with a schema.org JSON-LD Product block (mpn, description, category,
      offers.lowPrice, priceCurrency, offerCount) — a plain anonymous HTTP GET
      extracts price/stock/specs with no JS or login.
  - method: browser
    rationale: >-
      Only needed to (a) capture the session-bound dsUser value for datasheet
      resolution, or (b) drive the /searchresults.aspx WebForm postback grid
      when you want the site's own sorting/pagination/CSV export rather than the
      raw autocomplete list.
verified: false
proxies: false
---
# Quest Components Part Lookup & Extraction

## Purpose

Look up electronic components on **questcomp.com** (Quest Components — a US independent stocking distributor of hard-to-find, obsolete, and allocated parts) by **manufacturer part number (MPN)** and return machine-readable JSON containing live unit price, stock quantity, datasheet URL, description/specs, and the canonical detail URL. This skill is **read-only** (no account, cart, quote, or purchase actions — it only *locates* those paths). Everything it extracts — price, stock, datasheet, specs — is **public and renders logged out**; no field is behind a login wall. Prices are USD (single US locale; no region switch).

## When to Use

- Resolving one or more exact MPNs (e.g. `SN74LS00N`, `LM358N`, `2N2222A`) to a Quest detail page with live pricing/stock.
- "Search" by a **partial part number** (e.g. `74LS00`, `LM358`) to enumerate the matching MPN family Quest stocks.
- Checking availability/pricing of **obsolete / allocated / hard-to-find** parts, including zero-stock parts that are quote-only.
- Programmatic BOM pricing where you already have vendor MPNs.

Do **not** use this skill for descriptive/parametric spec search ("10uF tantalum capacitor", "obsolete 74LS logic IC") — the main site cannot do that (see Gotchas). Route those to the CSE subdomain noted below.

## Workflow

Quest is an ASP.NET WebForms site. The cheapest, most reliable path is **not** to drive the search UI (its result grid is a `__doPostBack` UpdatePanel with no URL-addressable state). Instead use the site's own public JSON PageMethod for search, then fetch the server-rendered detail page and read its JSON-LD. All endpoints below are anonymous (no auth, no cookies required for reads) and **not** disallowed by robots.txt.

**Base host:** `https://www.questcomp.com` (the bare `questcomp.com` and `/search/...` both 301 — always use `www`). A bare Browserbase/HTTP session with a normal browser UA is sufficient; **no stealth, no residential proxy, no `--verified`** were required (site returned 200s to plain fetches; anti-bot probe: none detected).

### Step 1 — Search (part number → candidate MPNs + detail URLs)

`POST https://www.questcomp.com/baseform.aspx/searchpartsforautocomplete`
```
Content-Type: application/json; charset=utf-8
Body: {"pn":"<query>","searchByMyPn":"0"}
```
Response is an ASP.NET PageMethod envelope `{"d":"<xml-string>"}`. The inner string is a `<NewDataSet>` of `<Table>` rows, each with:
- `<MasterPartID>` — Quest's internal part id (last path segment of the detail URL).
- `<PartNumber>` — the MPN.
- `<IsStock>` — `Yes` / `No` (in-stock flag).
- `<Url>` — relative detail URL, e.g. `/part/4/sn74ls00n/382914397`.

Behavior (verified):
- **Case-insensitive substring match on the MPN string**, capped at **16 rows**. `74LS` → `74LS00, 74LS00A, 74LS00B1, ...`. An exact MPN comes back as the first row plus near-variants (`SN74LS00N`, `SN74LS00N-00`, `SN74LS00N-10`, ...).
- **A single-token match on a value that happens to appear inside part numbers works** (`10uF` returns 16 rows whose MPNs contain `10UF`), **but multi-word descriptive phrases return nothing** — spaces are treated literally and never match an MPN.
- **Empty result = exactly `{"d":""}` (32 bytes).** This is the authoritative "no such part number" signal — treat it as an empty result set with a note, not an error.

If you specifically want the site's own ranked grid with sorting/pagination/CSV export, drive the postback instead (see Browser fallback) — it returns the **same MPN set** as this API.

### Step 2 — Extract (detail page → price / stock / specs / datasheet)

Plain `GET https://www.questcomp.com/part/{cat}/{mpn}/{id}` (from `<Url>` above). Fully server-rendered static HTML — no JS, no login. Extract:

1. **JSON-LD** (`<script type="application/ld+json">`, the `"@type":"product"` block) — the clean machine-readable core:
   - `mpn`, `description` (Quest's spec string, e.g. `"DUAL OP-AMP, 9000uV OFFSET-MAX, 1.1MHz BAND WIDTH, PDIP8"`), `category`, `image`.
   - `offers.lowPrice` — **lowest unit price across all offers and quantity breaks** → use as `unit_price`.
   - `offers.priceCurrency` — `"USD"`.
   - `offers.offerCount` — number of distinct offers on the page.
2. **Total stock** — the `"<N> parts available"` string in the page body (e.g. `2,515 parts available`) → use as `stock_qty` (total in-stock across all offers). If absent, stock is 0.
3. **Per-offer grid** (only if you need per-manufacturer breakdown): the page aggregates **multiple manufacturer offers** (e.g. SN74LS00N = 26 offers: Motorola, Texas Instruments, ON Semiconductor…). Each offer row carries: manufacturer name, Part Status (`ACTIVE` / `TRANSFERRED` / `DISCONTINUED`), RoHS/REACH flags, available qty, ship date, qty-break prices, and Min Qty. Manufacturer values are in hidden inputs `value="Manufacturer;<name>"`. **Set the top-level `manufacturer` field to `null` (reason `"multiple_offers:<offerCount>"`) when `offerCount > 1`** — do not pick one and infer it is "the" manufacturer. When `offerCount == 1`, report that sole manufacturer.

### Step 3 — Datasheet URL (optional, session-bound)

Datasheet anchors on the detail page carry `data-dsid='<DatasheetID>;<ObjectID>'`. Resolve to a real PDF URL via:

`POST https://www.questcomp.com/productcategorylisting.aspx/getdatasheeturl`
```
Content-Type: application/json; charset=utf-8
Body: {"dsID":"<data-dsid value>","dsUser":"<hfDsUser value>"}
```
- `dsUser` is the value of the hidden input `id$=hfDsUser` **on the loaded detail page** — it is a session-bound token of the form `"0;<GUID>;<client-IP>"`. You must read it from the same page render; a stale/absent `dsUser` yields HTTP 500.
- Response `{"d":"<url>"}` is a direct PDF (Quest proxies IHS/Accuris datasheets, e.g. `https://4donline.ihs.com/images/VipMasterIC/.../MOTOS12583-1.pdf?hkey=...`).
- Because `dsUser` requires a live page context, datasheet resolution is the one step that benefits from a browser session (read `hfDsUser` + the `data-dsid`s via `browse eval`, then `fetch()` from the page origin). If you cannot resolve it, return `datasheet_url: null` with reason `"datasheet_requires_session_dsuser"`.

### Step 4 — Assemble output

Emit one JSON object per query in exactly this shape (any non-public/unavailable field = `null` with a reason flag; never infer):
```
{"query","method","source","results":[{"mpn","manufacturer","description","unit_price","currency","stock_qty","datasheet_url","detail_url","checked"}],"note"}
```
`checked` = ISO-8601 UTC timestamp of extraction. `source` = the exact endpoint/URL used. See Expected Output for every outcome shape.

### Browser fallback (site's own search grid)

Use only if you want Quest's ranked/sortable grid instead of the raw autocomplete list. The `?query=` URL param does **not** render results (the page shows "NO PART NUMBER CAPTURED" for any `?query=`, even an exact MPN) — you must perform the WebForm postback:
1. `browse open https://www.questcomp.com/`, set the header box: `document.querySelector("#searchBoxHeader").value = "<pn>"`.
2. Trigger the postback: `eval(document.querySelector("a[id$=searchButtonHeader]").getAttribute("href"))` (a `WebForm_DoPostBackWithOptions` targeting `/searchresults.aspx`), then `browse wait`.
3. Harvest `a[href*="/part/"]` hrefs from the rendered grid. Sorting is via postback links `lbPNSort` (Part #) and `lbQtySort` (Qty); pagination is 10/page via postback (`Results: 1 to 10 of N`, page links 1/2/3…); there is an **Email / Download (CSV)** export and a "hide products with tariff" toggle. The "Exact match" and "In Stock" checkboxes filter the set. None of this is URL-addressable — prefer the Step 1 API unless you specifically need the grid features.

## Site-Specific Gotchas

- **No parametric / descriptive search on the main site.** `searchresults.aspx` and the autocomplete API only match **part-number strings**. Descriptive queries like `"10uF tantalum capacitor"` or `"obsolete 74LS logic IC"` return "NO PART NUMBER CAPTURED" / empty `{"d":""}` — this is expected, not a bug. Quest delegates spec/parametric search to a **separate host: `questcomp.componentsearchengine.com`** (a CIE/Component Search Engine instance, title "Quest Components Component Search"; whitelisted in the main site's CSP `frame-src`/`connect-src`). Route parametric queries there; note it is a different platform with its own extraction shape (out of scope for this skill, which covers the questcomp.com host).
- **`?query=` in the URL is a decoy.** `GET /searchresults.aspx?query=SN74LS00N` returns HTTP 200 but the results grid is empty ("NO PART NUMBER CAPTURED"); the query only pre-fills the search box. Results exist only after the `__doPostBack`. Don't parse the GET response for results — you'll get a false "not found" (classic broken-extraction trap). Use the Step 1 JSON API instead.
- **Always use `www`.** `questcomp.com` → 301 → `www.questcomp.com`. `/search/<term>` → 301 → `/search/<lowercased-term>` (and is not the data path). ASP.NET backend (`X-Powered-By: ASP.NET`).
- **A single MPN detail page = many offers.** `offers.offerCount` in JSON-LD is often 20–60+ (different manufacturers / date codes / packaging). `lowPrice` is the min unit price across ALL of them and ALL qty breaks — it is not tied to one manufacturer. Report `manufacturer: null` (reason `"multiple_offers:<n>"`) unless `offerCount == 1`. Expand the offer grid only when a per-manufacturer breakdown is explicitly required.
- **`unit_price` has a Min Qty caveat.** Prices are quantity-break tiered (e.g. `6+ 0.9000 / 21+ 0.5400 / 94+ 0.4200`), and each offer has a **Min Qty** (often 6, 15, 25…). `lowPrice` may only be attainable at a high quantity. If a true unit-of-1 price matters, read the qty-break table on the detail page rather than trusting `lowPrice` as a 1-off price.
- **Zero-stock / quote-only parts are valid results, not errors.** A part that exists but has no priced/in-stock offer (e.g. `/part/4/sn74ls00n-00/382914398`) renders JSON-LD with `lowPrice: 0` and `offerCount: 0`, has no "parts available" total, and shows a **Request-for-Quote (RFQ) / Quote Cart** CTA instead of a price. Return `unit_price: null` (reason `"rfq_only_no_priced_offer"`), `stock_qty: 0`. The RFQ path is `#quickOrderDetails` / the Quote Cart — **locate only, never submit**.
- **Datasheet resolution is session-bound.** `getdatasheeturl` needs the page's `hfDsUser` token (`0;<GUID>;<IP>`); a wrong/missing `dsUser` → HTTP 500. The two-step `getdatasheetid(dsKeys)` path in `datasheet.js` returns empty for these `data-dsid`s — call `getdatasheeturl` directly with the raw `data-dsid` as `dsID`. Datasheets are hosted on `4donline.ihs.com` (IHS/Accuris), not on questcomp.com.
- **Login is a public read is NOT gated.** Price, stock, datasheet, and specs all render fully logged out (verified anonymously). Login is a header dropdown (`#login-dp`) posting to `/index.aspx/verifycredentials`; the account area `/account/` is robots-disallowed. An anonymous agent needs no sign-in for any read field — sign-in only unlocks quoting/ordering/"my part number" mapping, which is out of scope.
- **robots.txt** (`https://www.questcomp.com/robots.txt`) disallows `/account/`, `/shopping/`, `/media/`, `/promotions/`, `/questdetails.aspx`, `/inventoryitems.aspx`, `/mfgstable.aspx`, `/inventorylist.aspx` for all agents, and `Disallow: /` for `dotbot`. **The paths this skill uses — `/part/...`, `/searchresults.aspx`, `/baseform.aspx/searchpartsforautocomplete`, `/productcategorylisting.aspx/getdatasheeturl` — are NOT disallowed.** Do not touch `inventoryitems.aspx`/`inventorylist.aspx`/`questdetails.aspx` (disallowed and superseded by `/part/` anyway). A `Sitemap` index (`/sitemaps/sitemapindex.xml`, ~44 shards × 25k URLs) enumerates every `/part/` URL if you need bulk discovery. Yandex crawl-delay is 10s; keep requests polite (≤1 req/s).
- **"parts available" vs per-offer qty are different numbers.** The header "N parts available" is the total across all offers; the Quick-Order box shows the primary (lowest-price in-stock) offer's qty (e.g. 170), and each grid row has its own avail qty (151, 19, 20…). Use the header total for `stock_qty`.
- **Egress note for sandboxed replay:** these endpoints only respond from an allowed network path. In a locked-down sandbox, direct `curl` to questcomp.com fails (HTTP 000); issue the POSTs via `fetch()` inside a Browserbase page (`browse eval`) or via `browse cloud fetch` (GET-only, good for detail pages) so requests originate from the browser egress.

## Expected Output

**1. Exact lookup (in-stock, aggregated multi-offer part):**
```json
{
  "query": "SN74LS00N",
  "method": "api:searchpartsforautocomplete + fetch:/part detail JSON-LD",
  "source": "POST https://www.questcomp.com/baseform.aspx/searchpartsforautocomplete {\"pn\":\"SN74LS00N\"} -> GET https://www.questcomp.com/part/4/sn74ls00n/382914397",
  "results": [
    {
      "mpn": "SN74LS00N",
      "manufacturer": null,
      "description": "IC,LOGIC GATE,QUAD 2-INPUT NAND,LS-TTL,DIP,14PIN,PLASTIC",
      "unit_price": 0.2250,
      "currency": "USD",
      "stock_qty": 2515,
      "datasheet_url": "https://4donline.ihs.com/images/VipMasterIC/IC/MOTO/MOTOS12583/MOTOS12583-1.pdf?hkey=D9A213CC6FEE7D103EF6B88F2AEB20B8",
      "detail_url": "https://www.questcomp.com/part/4/sn74ls00n/382914397",
      "checked": "2026-08-07T18:48:00Z"
    }
  ],
  "note": "manufacturer=null: offerCount=27 (Motorola/Texas Instruments/ON Semiconductor...); unit_price is JSON-LD lowPrice (lowest across all offers & qty-breaks, Min Qty applies); stock_qty is total 'parts available'. Prices/stock/datasheet all public logged-out."
}
```

**2. Keyword search by partial part number (family enumeration):**
```json
{
  "query": "74LS00",
  "method": "api:searchpartsforautocomplete (substring match, cap 16)",
  "source": "POST https://www.questcomp.com/baseform.aspx/searchpartsforautocomplete {\"pn\":\"74LS00\"}",
  "results": [
    {"mpn": "74LS00N", "manufacturer": null, "description": null, "unit_price": null, "currency": "USD", "stock_qty": null, "datasheet_url": null, "detail_url": "https://www.questcomp.com/part/4/74ls00n/70681577", "checked": "2026-08-07T18:48:00Z"},
    {"mpn": "74LS00D", "manufacturer": null, "description": null, "unit_price": null, "currency": "USD", "stock_qty": null, "datasheet_url": null, "detail_url": "https://www.questcomp.com/part/4/74ls00d/433525312", "checked": "2026-08-07T18:48:00Z"}
  ],
  "note": "Autocomplete returns MPN + IsStock + detail URL only (up to 16 substring matches). Fields left null are not-yet-fetched (reason 'not_expanded'); GET each detail_url to populate price/stock/description/datasheet. Site has no parametric search — a descriptive phrase would return empty (see shape 4)."
}
```

**3. Edge case — part exists but zero-stock / quote-only / no priced offer:**
```json
{
  "query": "SN74LS00N-00",
  "method": "fetch:/part detail JSON-LD",
  "source": "GET https://www.questcomp.com/part/4/sn74ls00n-00/382914398",
  "results": [
    {
      "mpn": "SN74LS00N-00",
      "manufacturer": null,
      "description": null,
      "unit_price": null,
      "currency": "USD",
      "stock_qty": 0,
      "datasheet_url": null,
      "detail_url": "https://www.questcomp.com/part/4/sn74ls00n-00/382914398",
      "checked": "2026-08-07T18:52:00Z"
    }
  ],
  "note": "Valid part, not an error. JSON-LD offerCount=0, lowPrice=0 -> unit_price=null (reason 'rfq_only_no_priced_offer'), stock_qty=0. Page shows Request-for-Quote / Quote Cart CTA instead of a price; RFQ path located, not submitted (read-only). manufacturer=null (reason 'no_offer'). description=null (reason 'not_present_on_page')."
}
```

**4. Edge case — query matches nothing (correct empty answer):**
```json
{
  "query": "10uF tantalum capacitor",
  "method": "api:searchpartsforautocomplete",
  "source": "POST https://www.questcomp.com/baseform.aspx/searchpartsforautocomplete {\"pn\":\"10uF tantalum capacitor\"}",
  "results": [],
  "note": "Empty is a correct answer, not an error. Response was {\"d\":\"\"} (32 bytes). questcomp.com only matches PART-NUMBER strings; multi-word descriptive/parametric phrases never match (searchresults.aspx shows 'NO PART NUMBER CAPTURED'). For spec/parametric discovery, route to the separate host questcomp.componentsearchengine.com. A single MPN-substring token (e.g. '10uF') WOULD return up to 16 MPN matches; the full phrase does not."
}
```

**Field notes / reason flags (never infer a value):**
- `manufacturer: null` → `"multiple_offers:<n>"` (offerCount>1) or `"no_offer"` (offerCount=0).
- `unit_price: null` → `"rfq_only_no_priced_offer"` or `"not_expanded"` (search row not yet fetched).
- `stock_qty: 0` when no priced/in-stock offer; `null` → `"not_expanded"`.
- `datasheet_url: null` → `"datasheet_requires_session_dsuser"` or `"no_datasheet_on_page"`.
- `currency` is always `"USD"` (single US locale).
- A real "not found" is the 32-byte `{"d":""}` (or "NO PART NUMBER CAPTURED"); a **broken extraction** is parsing `?query=`'s GET HTML or the pre-postback grid and seeing zero `/part/` links — always confirm via the JSON API before declaring "not found".
