---
name: deltacomputer-com-find-product-pricing-246gp3
title: Delta Computer Product Pricing
description: >-
  Look up Delta Computer Products (deltacomputer.com) product prices in EUR —
  including simple-product list prices and bundle-server per-configuration
  prices (Barebone, CPU, RAM, GPU, storage, OS, support). Read-only; parses
  public Magento HTML, no quote-request submission.
website: deltacomputer.com
category: ecommerce
tags:
  - ecommerce
  - b2b
  - hardware
  - gpu-server
  - magento
  - pricing
  - eur
source: 'browserbase: agent-runtime 2026-05-21'
updated: '2026-05-21'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      Only needed if the calling environment cannot make outbound HTTP fetches.
      Functionally equivalent — the site is plain server-rendered Magento 2 with
      prices in `data-price-amount` attributes; a browser pays ~100× the cost of
      a static fetch and provides no additional data.
verified: false
proxies: true
---
# Delta Computer Product Pricing

## Purpose

Given a product query (model name, SKU, family, or category) on **deltacomputer.com** — a B2B Magento 2 storefront selling NVIDIA / AMD enterprise GPU servers, workstations, and networking gear — return the product's published price and, for configurable "bundle" products (rack servers), the option-level prices that drive each configuration (Barebone, CPU, RAM, GPU, storage, network, OS, support). All prices are listed publicly in EUR; no login is required. Read-only — never click "Zur Anfrage hinzufügen" / "Anfragen" (the German "Add to Request" / "Submit Quote" buttons). Output covers both **simple products** (single price) and **bundle products** (a "from"/`Ab` base price plus per-option price deltas and a server-rendered per-CPU total-price table).

## When to Use

- One-off pricing lookups: "What does the NVIDIA H200 NVL 141GB cost at Delta?"
- Bundle-configuration estimates: "Price a D12z-M1-ZT with an AMD EPYC 9354P and 8× H200 GPUs."
- Bulk price-list scraping across a category (e.g. all NVIDIA adapters under `/gpu-computing/nvidia/nvidia-adapter.html`).
- Competitive-pricing or BOM agents that need EUR list prices for enterprise GPU/server SKUs.
- Hardware-procurement workflows where the next step is to hand the human a quote-request link, not to purchase directly.

## Workflow

The optimal path is **direct HTTP fetch + HTML parsing**, not browser automation. The site is plain server-rendered Magento 2 with all pricing baked into the static HTML (`data-price-amount` attributes plus a `priceConfig` JSON blob); no JS hydration is required to read prices. Empirically every page tested returned HTTP 200 through `browse cloud fetch --proxies` on the first try with no Cloudflare challenge. Fetching is ~100× cheaper than launching a browser, and the configurator's per-CPU price table is server-rendered too — there is **nothing** a browser-driven flow gives you that fetch doesn't already expose. **Browser fallback is documented at the end and is only needed if your environment cannot make outbound HTTP fetches.**

### 1. Discover product URLs

Three discovery surfaces, in order of robots-friendliness:

1. **Sitemap** — `https://www.deltacomputer.com/media/sitemap.xml`. Robots-allowed, ~477 URLs, the canonical index. Every product detail page lives at the root (`/<slug>.html`, e.g. `/nvidia-h200-141gb.html`, `/d12z-m1-zt.html`); every category at a nested path (e.g. `/gpu-computing/nvidia/nvidia-adapter.html`, `/server/standardserver/amd-epyc-2-sockel.html`). Filter the sitemap by URL pattern to scope to products vs. categories vs. blog.
2. **Clean category pages** — e.g. `/server.html`, `/gpu-computing/nvidia.html`, `/interconnect/ethernet/ethernet-adapter.html`. Robots-allowed. Each lists products with `<a class="product-item-link" href="...">` and an adjacent `<span data-price-amount="...">` (see step 2).
3. **Site search** — `https://www.deltacomputer.com/catalogsearch/result/index/?q=<query>`. Works (200 OK with full results HTML including prices) but is **`Disallow`ed in `/robots.txt`** alongside `/catalog/category/view/` and any query-string URL. Use only when you cannot find the SKU via sitemap+clean-URL paths, and treat it as a polite-but-grey path; consider an `Accept-Language: de` header and modest rate limits if you scrape it. `?q=` is the only filter; results are HTML, not JSON.

### 2. Parse a list / category / search page

Each product card emits both a machine-readable numeric price and a formatted display string. Anchor on `data-price-amount`:

```html
<a class="product-item-link" href="https://www.deltacomputer.com/nvidia-h200-141gb.html">NVIDIA H200 NVL 141GB</a>
…
<span class="price-label">Ab</span>            <!-- only on bundle "from" prices -->
<span data-price-amount="26662.17" class="price-wrapper">
  <span class="price">26.662,17 €</span>
</span>
```

- **`data-price-amount`** — the canonical numeric EUR price (English `.` decimal). Always parse this, not the formatted string.
- **`<span class="price">`** — display value in German locale (`.` thousands, `,` decimal). Useful only for tax-suffix detection (next bullet).
- **`<span class="price-label">Ab</span>`** present → this card is a **bundle product**; the price shown is the minimum-config "from" price, and the canonical detail page (step 3) is required to see option deltas.
- Pagination toolbar: `class="toolbar-amount"` ("Artikel 1-12 von N"); page links under `class="items pages-items"`. Robots disallows `?product_list_limit=` / `?product_list_order=` overrides — paginate naturally.

### 3. Fetch the product detail page

Pattern: `GET https://www.deltacomputer.com/<slug>.html` (no auth, no special headers required; the residential `--proxies` flag is optional but harmless). Two product shapes to detect:

#### 3a. Simple product (single price)

Indicator: **no** `bundle-option-id="..."` attributes in the body; **no** "Konfigurator" / "Preisskalierung" sections. The price block looks like:

```html
<span class="price-wrapper" data-price-amount="26662.17">
  <span class="price">26.662,17 €</span>
</span>
<span class="price-tax">(zzgl. MwSt.)</span>     <!-- "excl. VAT" -->
```

Extract `data-price-amount` → done. The form (`<form action=".../checkout/cart/add/">`) submits to "Zur Anfrage hinzufügen" ("Add to Request"); do **not** post to it — this is a quote workflow, not a checkout.

#### 3b. Bundle product (configurable server)

Indicator: one or more `<div data-bundle-option-id="<oid>">` blocks in the body and a `priceConfig` JSON block embedded in a `<script type="text/x-magento-init">`. The detail page exposes three layers of pricing:

1. **"Ab" / from-price** (top of page, base config):
   ```
   data-price-amount="14616.03"   →   "Ab 14.616,03 € (inkl. MwSt.)"
   ```
   This is the cheapest valid configuration (lowest-priced choice in every bundle slot). German UI labels it "Ab" ("From"). Use this as the floor.

2. **Bundle-option structure** — each `<div data-bundle-option-id="<oid>">` is one configurable slot. The slot title (`<div class="bundle-option-top">`) names what it configures, e.g. `Barebone`, `CPU`, `RAM`, `Memory`, `GPU`, `Storage / SSD / NVMe`, `Network`, `Betriebssystem` (OS), `Support`. Inside each slot, each selectable item is a `<input name="bundle_option[<oid>]" value="<selection_id>">` paired with `<span class="product-name">…</span>`. Per-selection prices are emitted as JSON blobs adjacent to the inputs:
   ```
   "prices":{"oldPrice":{"amount":"2410.6"},"basePrice":{"amount":"2410.6"},…}
   "priceType":"0"      // 0 = fixed price (use as-is); 1 = percentage adjustment (rare here)
   ```
   `oldPrice.amount` is the per-option list price (ex-VAT, EUR). Configuration total = `priceConfig.basePrice.amount` + Σ chosen-option deltas — but you almost never need to compute this yourself, see the next layer.

3. **Server-rendered CPU price-scale table** — every bundle product page also renders a `<table id="bundle-cpu-price-scale-table">` titled **"Preisskalierung nach CPU"** with one row per available CPU option. Each row is:
   ```html
   <tr data-bundle-selection-id="2781983">
     <td><span class="product-name">AMD EPYC 9354P</span></td>
     <td>32</td>      <!-- cores --> <td>3,25 GHz</td>  <!-- base clock -->
     …
     <td class="price">17.693,71 €</td>     <!-- total bundle price with this CPU,
                                                 other slots at defaults -->
   </tr>
   ```
   This is the **easiest way** to enumerate "price by CPU choice" — no client-side math required. The displayed value is the full configured total (base + that CPU's delta + default choices for every other slot). To price a non-default RAM/GPU combination, add the deltas from step 3b layer 2 to the table's per-row total.

4. **`priceConfig` JSON** (for completeness; embedded in a `<script type="text/x-magento-init"> { "*": { "Magento_Catalog/product/view/provider": { "data": { … } } } }` block):
   ```json
   "priceConfig": {
     "productId": 5761,
     "priceFormat": { "pattern": "%s €", "decimalSymbol": ",", "groupSymbol": ".", "precision": 2 },
     "prices": {
       "basePrice":  { "amount": 14616.03, "adjustments": [] },
       "finalPrice": { "amount": 14616.03, "adjustments": [] },
       "oldPrice":   { "amount": 2410.6,   "adjustments": [] }   // <-- base barebone, not the bundle
     },
     "calculationAlgorithm": "TOTAL_BASE_CALCULATION",
     "tierPrices": []
   }
   ```
   The configurator's JS reads this plus the per-selection prices, recomputes the total client-side, and updates the on-page "Konfiguriert" display. You can replicate that calculation if you need a price for an arbitrary multi-slot combination, but for the common case ("price scaled by CPU") prefer the table in step 3 because it's already computed.

### 4. Construct the result

For a simple product:
```json
{ "url": "...", "name": "...", "price_eur": 26662.17,
  "currency": "EUR", "tax_basis": "excl",
  "product_type": "simple" }
```

For a bundle product, include `from_price_eur` plus a `configurations[]` array — at minimum every row of the CPU price-scale table, optionally enriched with per-selection deltas from the other slots. See Expected Output below for the full schema.

### 5. Browser fallback (only if HTTP fetch is unavailable)

```bash
# A bare session is sufficient; --proxies is harmless but the site has no anti-bot.
# Do NOT pass --verified — no captchas on any path tested.
sid=$(browse cloud sessions create --keep-alive --proxies | …)
export BROWSE_SESSION="$sid"

browse open "https://www.deltacomputer.com/<slug>.html" --remote
browse get markdown body --remote                    # full text incl. prices
# Or, to extract the CPU price table directly from the rendered DOM:
browse snapshot --remote | grep "AMD EPYC\\|Intel Xeon\\|NVIDIA"
```

`browse get markdown body` returns the full rendered page; the "Preisskalierung nach CPU" table comes through in markdown form, and product cards on category pages render as `Name … Ab N.NNN,NN €`. **Cost note:** a category fetch via browser is ~50–100× the cost of a static HTTP fetch and yields the same data — only do this if your sandbox cannot reach `https://www.deltacomputer.com` directly. Always release the session (`browse cloud sessions update "$sid" --status REQUEST_RELEASE`) when done.

## Site-Specific Gotchas

- **Magento "Anfragen" quote workflow, not e-commerce checkout.** All products show a "Zur Anfrage hinzufügen" ("Add to Request") button instead of "Add to Cart" — Delta is a B2B reseller that quotes per order. Pricing is still public on every product page; you do **not** need to log in or submit a quote request to read prices. The `<form action=".../checkout/cart/add/">` POST endpoint exists but submitting it would add to a quote request basket — **never** post to it from a read-only skill.
- **EUR, German number format.** Display values are `1.234,56 €` (thousands `.`, decimal `,`); the machine-readable `data-price-amount` attribute is always English-formatted (`1234.56`). Parse `data-price-amount`, not the visible span.
- **Tax basis differs by product type.** Simple-product detail pages show `(zzgl. MwSt.)` = **excl. VAT**, while bundle-product "Ab" prices on the same site show `(inkl. MwSt.)` = **incl. VAT** in the headline. The `data-price-amount` number itself is the ex-VAT base in both cases (German VAT 19%); the tax suffix label sits in a nearby `<span class="price-tax">` or label text — read it explicitly when reporting prices. Don't assume one over the other.
- **`Ab` prefix = "from" / minimum configuration.** When you see `<span class="price-label">Ab</span>` next to a price on a list/category/detail page, the product is a bundle and the price shown is the cheapest valid build. Without that label, the number is the absolute price.
- **`data-price-amount` is the only field to trust across both layers.** The `oldPrice.amount` inside per-bundle-selection JSON is the **per-option** list price, not the configured total. The `priceConfig.basePrice.amount` is the base "Ab" price. Don't conflate them.
- **CPU price-scale table is your friend.** `<table id="bundle-cpu-price-scale-table">` (heading "Preisskalierung nach CPU") is rendered server-side on every bundle product page with the **fully-configured** total for each CPU option (other slots at defaults). Use this instead of trying to reconstruct totals from per-option JSON unless you need a non-default RAM/GPU/Storage combination.
- **robots.txt explicitly names ClaudeBot.** The robots.txt has separate rules for `ClaudeBot`, `Claude-Web`, `anthropic-ai`, and `*` — they're identical and **disallow** `/catalogsearch/`, `/catalog/category/view/`, `/catalog/product/view/`, `/customer/`, `/checkout/`, anything containing `?` (so `?product_list_limit=`, `?product_list_order=`, `?product_list_dir=`, `?SID=`, etc.), `/requestform/`, `/tag/`, `/review/`, and most static-asset PHP/conf paths. Clean SEO URLs (`/<slug>.html`, `/<cat>/<sub>.html`) and `/media/sitemap.xml` are **allowed** and are the right discovery path. Functionally `/catalogsearch/result/index/?q=` still serves 200 OK with prices, but it's robots-disallowed — prefer sitemap/clean-URL navigation.
- **Sitemap is the canonical product index.** `https://www.deltacomputer.com/media/sitemap.xml` lists all 477 URLs (products, categories, blog). It's not chunked — one flat XML file, ~300 KB.
- **No anti-bot, no proxy required.** Across every URL tested (home, product detail, category, search, sitemap, robots), `browse cloud fetch` returned 200 OK with no Cloudflare challenge, no rate-limit headers, and no captcha — even on bare (non-proxied) calls. `--proxies` adds resilience but is not required. Do **not** waste budget on `--verified` (anti-captcha) — confirmed not needed.
- **No JSON-LD or Open Graph price data.** No `application/ld+json`, no `og:product:price:amount`, no `<meta itemprop="price">`. Don't waste time searching for structured-data shortcuts — `data-price-amount` *is* the structured-data shortcut.
- **Currency is EUR-only.** No localized $/£/¥ — Delta is a German reseller. Output `currency: "EUR"` unconditionally.
- **German UI labels you'll encounter:** `Ab` (From / starting at), `Konfiguriert` (Configured / configured price), `Preisskalierung nach CPU` (Price scaling by CPU), `Zum Konfigurator` (To the configurator), `Anfragen` / `Zur Anfrage hinzufügen` (Request / Add to request), `Suchergebnisse für` (Search results for), `Artikel N von M` (item N of M), `Kategorie` (Category), `Sortieren nach` (Sort by), `inkl. MwSt.` (incl. VAT), `zzgl. MwSt.` (excl. VAT).
- **Bundle option titles are localized.** Slot names on bundle products are German — `Arbeitsspeicher` (memory/RAM), `Festplatte` / `SSD` / `NVMe`, `Netzwerk` (network), `Betriebssystem` (OS), `Support` — but `Barebone`, `CPU`, and `GPU` are English-loaned terms. Don't hard-code English slot names when grouping options.
- **`partslistcreator` is a separate configurator UI.** `/partslistcreator/product/partslistmultiplier` exists (and is explicitly Allow-listed for ClaudeBot in robots.txt) but it's a different price-quoting flow with its own UX. For canonical published list prices, the product detail page is sufficient; ignore the partslistcreator unless you specifically need a multi-product configurator-generated quote.
- **Session/PHPSESSID cookies.** The site sets a `PHPSESSID` cookie with `HttpOnly; Secure; SameSite=Lax` on every response. You do **not** need to persist it across requests for read-only price scraping — each fetch can start fresh. Carrying the cookie is harmless but unnecessary.
- **Cookie banner overlay on browser fallback.** A purple "Um Ihnen die Funktionen unseres Online-Shops uneingeschränkt anbieten zu können setzen wir Cookies ein" banner overlays the bottom of every page in a Browserbase session until dismissed. Click `button: "Ok"` (or `[aria-label="Ok"]`) once at session start if you're scrolling to capture price tables — otherwise the bottom 60px of every screenshot is the banner. The static HTML fetch path has no such overlay.

## Expected Output

The skill returns one of two shapes — `simple` or `bundle` — distinguished by whether the detail page has any `data-bundle-option-id` attributes.

### Simple product

```json
{
  "url": "https://www.deltacomputer.com/nvidia-h200-141gb.html",
  "sku": "nvidia-h200-141gb",
  "name": "NVIDIA H200 NVL 141GB",
  "product_type": "simple",
  "price_eur": 26662.17,
  "price_display": "26.662,17 €",
  "tax_basis": "excl",
  "currency": "EUR",
  "category_path": ["GPU Computing", "NVIDIA", "NVIDIA Adapter"],
  "in_stock": true,
  "fetched_at": "2026-05-21T22:43:00Z"
}
```

### Bundle product

```json
{
  "url": "https://www.deltacomputer.com/d12z-m1-zt.html",
  "sku": "d12z-m1-zt",
  "name": "D12z-M1-ZT",
  "model_designation": "D12z-M1-ZT-36-B-192GB-1,9TB-1G",
  "product_type": "bundle",
  "from_price_eur": 14616.03,
  "from_price_display": "14.616,03 €",
  "tax_basis": "incl",
  "currency": "EUR",
  "category_path": ["Server", "Standardserver", "AMD EPYC (1-Sockel)"],
  "bundle_options": [
    {
      "option_id": "72115",
      "title": "Barebone",
      "required": true,
      "selections": [
        { "selection_id": "2782228", "name": "Gigabyte R163-Z35-AAH1", "price_eur": 2410.60, "is_default": true }
      ]
    },
    {
      "option_id": "72116",
      "title": "CPU",
      "required": true,
      "selections": [
        { "selection_id": "2781978", "name": "AMD EPYC 9015",  "cores": 8,   "base_clock_ghz": 3.60, "tdp_watt": 125, "configured_total_eur": 15797.77 },
        { "selection_id": "2781983", "name": "AMD EPYC 9354P", "cores": 32,  "base_clock_ghz": 3.25, "tdp_watt": 280, "configured_total_eur": 17693.71 },
        { "selection_id": "2781993", "name": "AMD EPYC 9654P", "cores": 96,  "base_clock_ghz": 2.40, "tdp_watt": 360, "configured_total_eur": 21210.02 }
      ]
    },
    {
      "option_id": "72117",
      "title": "Arbeitsspeicher",
      "selections": [
        { "selection_id": "...", "name": "192GB DDR5-4800",  "price_eur": 1880.40, "is_default": true },
        { "selection_id": "...", "name": "384GB DDR5-4800",  "price_eur": 3615.39 }
      ]
    }
    /* …additional slots: GPU, NVMe, Netzwerk, Betriebssystem, Support… */
  ],
  "fetched_at": "2026-05-21T22:43:30Z"
}
```

Key invariants in the bundle shape:

- `from_price_eur` always equals `priceConfig.basePrice.amount` for the product, which matches the headline `data-price-amount` and the cheapest-CPU row of the CPU price-scale table.
- For the CPU option slot specifically, every selection includes `configured_total_eur` (read directly from `<td class="price">` in `bundle-cpu-price-scale-table`). For other slots, `price_eur` is the per-option delta from the bundle base (read from the per-selection `oldPrice.amount` JSON blob).
- `bundle_options[]` is ordered as rendered on the page (top → bottom: typically Barebone → CPU → RAM → Storage → GPU → Network → OS → Support).

### Failure / edge shapes

```json
{ "url": "...", "error": "not_found",      "http_status": 404 }
{ "url": "...", "error": "ambiguous_query", "candidates": ["nvidia-h200-141gb", "nvidia-h200-141gb-edu-startup", "nvidia-dgx-h200-1128gb"] }
{ "url": "...", "error": "price_missing",   "note": "Page rendered but no data-price-amount found — product is likely listed but not yet priced; user must submit a quote request." }
```

`ambiguous_query` is the common outcome for vague queries like `"h200"` which match 14 products across the catalog (NVIDIA H200 adapter variants, DGX H200, and seven D-series servers that include H200 GPUs). Return the full candidate list and let the caller disambiguate.
