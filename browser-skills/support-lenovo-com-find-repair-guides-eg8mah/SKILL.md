---
name: support-lenovo-com-find-repair-guides-eg8mah
title: Lenovo Support Repair Guides & Parts Lookup
description: >-
  Resolve a Lenovo machine type, serial number, or product slug to its canonical
  pcsupport.lenovo.com product page, then return the Hardware Maintenance Manual
  (HMM) PDF, part numbers (FRU/CRU), driver downloads, BIOS/UEFI updates,
  diagnostic tools, warranty status, and self-repair guide. Read-only.
website: support.lenovo.com
category: support
tags:
  - lenovo
  - repair
  - hmm
  - drivers
  - warranty
  - thinkpad
  - support
source: 'browserbase: agent-runtime 2026-05-20'
updated: '2026-05-20'
recommended_method: hybrid
alternative_methods:
  - method: api
    rationale: >-
      The public REST API at supportapi.lenovo.com (Warranty, Catalog, Product,
      Content, Part, Accessory) requires a sales-issued ClientID header —
      verified inaccessible to agent-runtime. The undocumented
      /api/v4/mse/getproducts endpoint on pcsupport.lenovo.com is the one usable
      pure-JSON path: it resolves any identifier (machine type, serial, slug) to
      the canonical product slug in ~200ms without auth or proxy. Use it as step
      1 of the hybrid flow.
  - method: browser
    rationale: >-
      Drivers, parts BOM, and the HMM PDF link are JS-hydrated and the XHR
      endpoints behind them (deny-access from outside the page context).
      Pure-browser fallback works if the JSON resolver is unavailable — start at
      the pcsupport homepage and use the product search box — but the hybrid
      path is materially faster.
verified: true
proxies: true
---
# Lenovo Support — Find Repair Guides, Parts, Drivers & Warranty

## Purpose

Resolve a Lenovo product identifier (machine type like `21ML`/`20VE`, serial number like `PF2W2GLT`, or marketing name like "ThinkPad T14 Gen 5") to its canonical pcsupport.lenovo.com slug, then enumerate the artifacts a repair tech actually needs: **Hardware Maintenance Manual (HMM) PDF**, **part numbers (FRU/CRU)**, **driver downloads**, **BIOS/UEFI updates**, **diagnostic tools**, **warranty status**, and the **Self-Repair Guide** (ThinkPad/ThinkCentre/ThinkStation only). Read-only — never click "Order Part", "Start Repair", or warranty-claim CTAs.

## When to Use

- Repair-shop or IT-admin agent loading the HMM PDF for a specific machine before opening the chassis.
- Pulling the latest BIOS/UEFI for a fleet machine.
- Looking up a CRU/FRU part number from a serial.
- Triage workflows that need warranty status before authorizing repair.
- Resolving a vague user-supplied model ("my T14") to a concrete machine-type variant.

## Workflow

The agent uses a **hybrid path**: an undocumented JSON resolver gets you from any identifier to the canonical product slug in one HTTP call, then you browse the rendered sub-pages with stealth+proxy to scrape the actual artifacts. Pure-API harvesting of drivers/parts is **not available** — the public REST API at `supportapi.lenovo.com` requires a sales-issued ClientID (verified 2026-05-20: docs page returns 200 but every endpoint demands `ClientID:` header), and the in-browser XHR endpoints (`/api/v4/mse/getdocument`, `/api/v4/mse/getUserguide`, etc.) are 404 or `deny access` from outside the page context.

### 1. Resolve the identifier → canonical product slug (JSON, no auth)

```
GET https://pcsupport.lenovo.com/us/en/api/v4/mse/getproducts?productId={query}
```

`{query}` accepts:
- **Machine type** (4 chars, e.g. `21ML`, `20VE`) — returns `Type: "Product.MachineType"`.
- **Serial number** (8 chars, e.g. `PF2W2GLT`) — returns `Type: "Product.Serial"` plus the parent machine-type chain in `Id`.
- **Marketing name** (e.g. `ThinkPad+T14+Gen+5`) — **does NOT work**, returns `[]`. Use machine type or serial.

The response is a JSON array; each entry has:
- `Id` — slash-delimited slug (e.g. `LAPTOPS-AND-NETBOOKS/THINKPAD-T-SERIES-LAPTOPS/THINKPAD-T14-GEN-5-TYPE-21ML-21MM/21ML`). Lowercase this and append it to `https://pcsupport.lenovo.com/us/en/products/` to build the product home URL.
- `Name` — human-readable label.
- `Type` — `Product.MachineType`, `Product.SubSeries`, or `Product.Serial`.
- `Brand` — `TPG` (ThinkPad-Gov / commercial), `IDEA` (consumer), etc.

Multiple entries returned ⇒ pick the one matching `Type == "Product.MachineType"` for a clean machine-type query, or the entry whose `Serial` field equals the input for a serial query. Empty `[]` ⇒ unknown identifier; bail with `success: false, error_reasoning: "product not found"`.

This call works **without** `--verified` and **without** `--proxies` — it's served straight from the API tier and is not gated by Akamai for JSON `Accept`. ~200ms typical.

### 2. Open the product home page (browser, stealth+proxy required)

```
https://pcsupport.lenovo.com/us/en/products/{lowercased Id}
```

Example: `…/products/laptops-and-netbooks/thinkpad-t-series-laptops/thinkpad-t14-gen-5-type-21ml-21mm/21ml`

The HTML pages are Akamai-fronted (`_abck`, `bm_sz`, `ak_p` cookies in every response). A bare Browserbase session typically gets through but stealth is recommended:

```bash
sid=$(browse cloud sessions create --keep-alive --verified --proxies | …)
browse open "$URL" --remote --session "$sid"
browse wait timeout 3000 --remote --session "$sid"   # client-side hydration
browse snapshot --remote --session "$sid"
```

The product home page surfaces the four primary tab links (Drivers & Software, Diagnose & Fix, Guides & Manuals, Warranty & Service) — but you can navigate to each tab's URL directly (paths below).

### 3. Hardware Maintenance Manual (HMM) — the priority artifact

Navigate to:
```
…/products/{lowercased Id}/document-userguide/doc_userguide
```

The HMM PDF link is **not** at a guessable filename. It's published at `https://download.lenovo.com/pccbbs/{folder}_pdf/{combined-model-slug}_hmm_en.pdf` where:
- `{folder}` is `mobiles_pdf` for laptops/ThinkPad/IdeaPad, `thinkcentre_pdf` / `desktops_pdf` for desktops, `motherboards_pdf` for boards.
- `{combined-model-slug}` is **a multi-model combined slug** because Lenovo publishes one HMM per chassis-family. Verified 2026-05-20: T14 Gen 5 (21ML) HMM is at `…/mobiles_pdf/t14g5_t16g3_p14sg5_hmm_en.pdf` — covering T14 Gen 5 + T16 Gen 3 + P14s Gen 5 in one PDF.

**Don't guess the slug** — scrape it from the rendered page. After `wait timeout 3000`, the doc list resolves and the URL is in the page HTML (search `download\.lenovo\.com/pccbbs/[^"]+_hmm_en\.pdf` after `browse get html body`). The clickable list shows `href="#"` placeholders pre-hydration, so don't extract from anchors before the wait.

Example one-liner (after navigating to the doc_userguide page):
```bash
browse get html body --remote --session "$sid" \
  | grep -oE 'https?://download\.lenovo\.com/pccbbs/[^"]+_hmm_en\.pdf' \
  | head -1
```

### 4. Drivers, BIOS/UEFI, diagnostic tools

```
…/products/{lowercased Id}/downloads/driver-list
```

The page hydrates client-side and shows a category list (BIOS/UEFI, Chipset, Audio, Camera, Networking, Storage, …). Each category is collapsed; click the category row to expand and reveal individual driver rows (name, version, OS, severity, "Download" button). The flat XHR endpoint that backs this UI (`/api/v4/downloads/drivers`) returns `{"body":"","message":"deny access"}` to outside-page calls — there's no shortcut. Snapshot strategy:

```bash
browse open ".../downloads/driver-list" --remote --session "$sid"
browse wait timeout 3000 --remote --session "$sid"
browse snapshot --remote --session "$sid"          # category refs
browse click "@<bios-category-ref>" --remote --session "$sid"
browse wait timeout 2000 --remote --session "$sid"
browse snapshot --remote --session "$sid"          # individual drivers visible
```

The `Download` anchors are absolute URLs to `download.lenovo.com/pccbbs/{folder}/...exe` (Windows installers) or `.../...iso` for bootable BIOS update images.

**Diagnostic tools**: same page, look for the "Diagnostic Tools" category (when present) — typically `Lenovo Diagnostics — Bootable USB` ISO + `Lenovo Diagnostics — Windows`.

### 5. Parts (FRU/CRU)

```
…/products/{lowercased Id}/parts/PARTS_BOM_LOOKUP
```

Renders a BOM table: part description, FRU number, CRU type (Self / Optional / N — "non-CRU, FRU only"), price (where available). The page is also JS-rendered — `wait timeout 3000` then snapshot.

### 6. Self-Repair Guide (ThinkPad / ThinkCentre / ThinkStation only)

A separate site, **not** under the product slug:
```
https://support.lenovo.com/us/en/selfrepair/sr{NNNNNN}-{kebab-product-name}-self-repair-guide
```

The numeric `sr{NNNNNN}` ID has no derivation rule — it's not the machine type, not the GUID, not the slug hash. **Discover it via search**, not guessing: either (a) Browserbase Search (`browse cloud search "lenovo {model} self-repair guide"`) — first hit is reliably the canonical SR URL — or (b) the "Repair & Service" tab on the product home page links into it.

Verified 2026-05-20: T14 Gen 5 → `sr500045-thinkpad-t14-gen-5-21ml-21mm-self-repair-guide` (covers all four sibling machine types `21ML, 21MM, 21MC, 21MD`).

Self-Repair Guides are interactive HTML walkthroughs with embedded videos and step-by-step procedures — substantially friendlier than the HMM PDF for non-technicians.

### 7. Warranty status

```
https://pcsupport.lenovo.com/us/en/warrantylookup
```
(redirects to `…/warranty-lookup#/`)

The form requires a **serial number** — machine type alone returns nothing. The lookup is a single text input + Submit button. After submit:
- `wait timeout 4000`
- The result panel shows: status badge (`Active` / `Expired`), warranty type (e.g. `Premium Care`), start date, end date, country of purchase, model description.

If the request only supplied a machine type (no serial), return `warranty: null, warranty_note: "serial required"`. The pcsupport.lenovo.com warranty lookup is **rate-limited** if hammered — keep ≤ 1 req/sec sustained.

### 8. Service bulletins

Service bulletins (a.k.a. "Solutions" / "Tip" articles) live at:
```
…/products/{lowercased Id}/solutions/documentation
```

Filter the list by category badge: "Tip" articles include known-issue advisories and bulletin-style notes. There is no separate "service bulletin" feed — Lenovo merges them with how-tos in the Solutions section.

## Site-Specific Gotchas

- **The published REST API at `supportapi.lenovo.com` is gated.** The docs page (`/Documentation/Index.html`) advertises Warranty, Catalog, Product, Content, Part, Accessory endpoints — but every call requires a `ClientID:` header obtained via "your account manager or sales representative." For agent-runtime use, this is unreachable. Don't waste budget probing it.
- **`mse/getproducts` is the unsung hero.** Smart resolver — accepts machine type (4-char), serial number (8-char), and full slug; returns the canonical `Id` slash-path you need to build every other URL. Marketing names ("ThinkPad T14") return empty. The endpoint works without proxy/stealth (no Akamai gate on `Accept: application/json`).
- **Other `mse/*` endpoints look promising but are 404 or `deny access`** from outside the rendered page context. Verified 2026-05-20: `getdocument`, `getUserguide`, `getProductsBySerialId`, `downloads/drivers`, `contents/list`, `contents/getContentsByProductId`, `upgradableComponents/products/{...}` all fail. The browser is required to render the JS app before these XHRs are accepted.
- **Akamai stealth wall is mild.** A `--verified --proxies` session passes uniformly. A bare session (no flags) **also** generally passes for `pcsupport.lenovo.com` page renders, but inconsistently — recommend `--verified --proxies` for reliability. The `download.lenovo.com` PDF/EXE host is **not** Akamai-gated; direct curl works.
- **HMM PDFs are combined across sibling models.** A single PDF covers all chassis-mates. T14 Gen 5 + T16 Gen 3 + P14s Gen 5 share `t14g5_t16g3_p14sg5_hmm_en.pdf`. Don't try to derive the slug from the machine type — scrape it from the `document-userguide/doc_userguide` page after `wait timeout 3000`.
- **`document-userguide` page anchors are `href="#"` pre-hydration.** The actual PDF URLs land in a JS `urlMap` object that resolves on the click handler. After waiting 3s, the URLs **are** in the page HTML (just not in the anchor `href` — they're in script-tag JSON). Use a regex on `browse get html body`, not `browse snapshot` ref enumeration.
- **HMM PDFs are large** (often 30-100 MB). `browse cloud fetch --proxies` will return a 502 "response body exceeded the maximum allowed size" — verify availability via HEAD or browser navigation, don't try to download through the proxy fetch.
- **Driver-list page is fully client-rendered.** The categories list shows after `wait timeout 3000`; individual drivers only appear after expanding a category (`browse click @<category>` → wait → snapshot). The XHR endpoint that backs this is gated to in-page calls only.
- **Self-Repair Guide IDs (`srNNNNNN`) are unguessable.** No deterministic mapping from machine type to SR ID. Use Browserbase Search as a discovery shortcut — `"lenovo {model} self-repair guide"` reliably surfaces the canonical URL as result #1.
- **Warranty lookup needs the serial.** Machine type alone is insufficient. Note this in the output JSON instead of fabricating data.
- **`mse/getproducts` Brand codes**: `TPG` = ThinkPad/Think commercial, `IDEA` = consumer (IdeaPad/Yoga/Legion), `LEN`/`LCFC`/etc. = OEM/legacy. Useful for routing — Self-Repair Guides only exist for `TPG`.
- **Locale**: paths under `/us/en/` work for any machine type globally; non-US users are served the same artifacts. The `X-Country` header (referenced in the eSupport WebAPI docs) only matters for the gated REST API. For the public web UI just use `/us/en/`.

## Expected Output

```json
{
  "success": true,
  "query": "21ML",
  "product": {
    "machine_type": "21ML",
    "name": "T14 Gen 5 (Type 21ML, 21MM) Laptops (ThinkPad)",
    "brand": "TPG",
    "slug": "LAPTOPS-AND-NETBOOKS/THINKPAD-T-SERIES-LAPTOPS/THINKPAD-T14-GEN-5-TYPE-21ML-21MM/21ML",
    "support_url": "https://pcsupport.lenovo.com/us/en/products/laptops-and-netbooks/thinkpad-t-series-laptops/thinkpad-t14-gen-5-type-21ml-21mm/21ml"
  },
  "hmm": {
    "title": "ThinkPad T14 Gen 5 / T16 Gen 3 / P14s Gen 5 Hardware Maintenance Manual",
    "pdf_url": "https://download.lenovo.com/pccbbs/mobiles_pdf/t14g5_t16g3_p14sg5_hmm_en.pdf"
  },
  "self_repair_guide_url": "https://support.lenovo.com/us/en/selfrepair/sr500045-thinkpad-t14-gen-5-21ml-21mm-self-repair-guide",
  "downloads": [
    {
      "name": "BIOS Update Utility (Bootable CD)",
      "category": "BIOS/UEFI",
      "version": "1.34",
      "os": "Bootable",
      "severity": "Recommended",
      "url": "https://download.lenovo.com/pccbbs/mobiles/n3sur05w.iso"
    },
    {
      "name": "Intel Wi-Fi Driver",
      "category": "Networking: Wireless LAN",
      "version": "23.30.1",
      "os": "Windows 11 (64-bit)",
      "severity": "Recommended",
      "url": "https://download.lenovo.com/pccbbs/mobiles/..."
    }
  ],
  "parts_url": "https://pcsupport.lenovo.com/us/en/products/laptops-and-netbooks/thinkpad-t-series-laptops/thinkpad-t14-gen-5-type-21ml-21mm/21ml/parts/PARTS_BOM_LOOKUP",
  "service_bulletins_url": "https://pcsupport.lenovo.com/us/en/products/laptops-and-netbooks/thinkpad-t-series-laptops/thinkpad-t14-gen-5-type-21ml-21mm/21ml/solutions/documentation",
  "diagnostic_tools_url": "https://pcsupport.lenovo.com/us/en/products/laptops-and-netbooks/thinkpad-t-series-laptops/thinkpad-t14-gen-5-type-21ml-21mm/21ml/downloads/driver-list",
  "warranty": null,
  "warranty_note": "serial required",
  "error_reasoning": null
}
```

When called with a serial number, populate `warranty`:

```json
{
  "warranty": {
    "status": "Active",
    "type": "Premium Care",
    "start_date": "2024-08-12",
    "end_date": "2027-08-11",
    "country_of_purchase": "United States",
    "model_description": "ThinkPad T14 Gen 5"
  }
}
```

When the identifier is unknown:

```json
{
  "success": false,
  "query": "ZZZZ",
  "error_reasoning": "product not found for query \"ZZZZ\" — mse/getproducts returned []"
}
```
