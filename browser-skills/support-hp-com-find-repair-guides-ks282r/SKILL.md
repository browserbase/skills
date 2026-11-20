---
name: support-hp-com-find-repair-guides-ks282r
title: 'HP Support Repair Guides, Drivers & Manuals Lookup'
description: >-
  Resolve any HP product (consumer or business — Pavilion/Envy/Spectre/OMEN,
  ProBook/EliteBook/ZBook) by model/product-number/serial via HP's typeahead,
  then fetch the Maintenance and Service Guide PDF (with spare part numbers),
  all PDF manuals, current drivers + BIOS/firmware with CVE-level release notes,
  how-to videos, and diagnostic-tool pointers. Read-only; warranty status
  excluded because reCAPTCHA-gated.
website: support.hp.com
category: support
tags:
  - hp
  - support
  - drivers
  - bios
  - manuals
  - repair
  - read-only
source: 'browserbase: agent-runtime 2026-05-20'
updated: '2026-05-20'
recommended_method: api
alternative_methods:
  - method: api
    rationale: >-
      HP's support SPA at support.hp.com is a thin client over public,
      unauthenticated JSON endpoints at /typeahead and /wcc-services/*. No auth,
      no anti-bot wall, no captcha on the read paths. Lead with the API; one
      round trip per data class (typeahead → category → manuals/drivers/videos).
  - method: browser
    rationale: >-
      Fallback when API rate-limits or breaks. The Angular shell renders nothing
      useful to a snapshot until ~3 s post-load; even in fallback mode the right
      move is `browse eval` page-context fetch against the same wcc-services
      endpoints, not clicking through the OS-picker UI.
verified: true
proxies: true
---
# HP Support — Find Repair Guides, Drivers, BIOS, Manuals & Diagnostics

## Purpose

Given a product model (e.g. "HP ProBook 450 G10"), product number (e.g. "71H58AV"), or product family ("HP Pavilion 15"), return everything HP's official support site has on that product: the **Maintenance and Service Guide** PDF (the canonical hardware-replacement document — disassembly steps + spare part numbers), the **User Guide** + other manuals, **drivers / BIOS / system-firmware** with download URLs and CVE-level release notes, **how-to videos** (Brightcove-hosted), security advisories, and pointers into the warranty-check / diagnostic-tools flows. Read-only — never submits the warranty form, never starts a download, never books service. Works for both consumer (Pavilion / Envy / Spectre / OMEN) and business (ProBook / EliteBook / ZBook) lines because they all run on the same `wcc-services` backend.

## When to Use

- "What spare-part number does HP list for the bottom cover of an HP ProBook 450 G10?" — points the user to the Maintenance and Service Guide PDF.
- "Latest BIOS for my EliteBook 840 G10 and what CVEs does it fix?" — `softwareTypes[name=BIOS-System Firmware]` carries `version`, `fileUrl`, and a `fixesAndEnhancements` field with CVE IDs.
- "Show me HP-published hardware replacement / how-to videos for this product" — `kaasVideos` endpoint returns Brightcove URLs.
- "List every PDF manual HP publishes for this laptop" — `getManuals` endpoint, one round trip.
- "Pre-flight a support-ticket conversation: tell me model, productLineCode, productNumberOid, BIOS version, and which manuals exist" — three GET/POST calls, no scraping.
- Bulk inventory enrichment: drivers/BIOS staleness audits across a fleet of HP devices.

## Workflow

The HP support site is an Angular SPA (`<app-root>`) over a public, **unauthenticated, no-anti-bot** JSON API at `https://support.hp.com/wcc-services/*` plus the cross-origin search endpoint at `https://support.hp.com/typeahead`. Every read endpoint that powers the support pages can be hit directly with `fetch` — no cookies, no CSRF token, no captcha (for the read paths; the warranty-check write path is reCAPTCHA-gated and excluded from this skill, see Gotchas). Lead with the API path; the browser path is a 100×-cost fallback that adds nothing because the same JSON ends up in the response anyway.

The API expects two contextual params: `cc` (country, e.g. `us`) and `lc` (language, e.g. `en`). Pass them on every call; mismatched `cc`/`lc` returns thinner (or empty) data instead of an error.

### 1. Resolve the product to an OID via `/typeahead`

```
GET https://support.hp.com/typeahead
    ?q=<urlenc product name | product number | series>
    &resultLimit=10
    &store=tmsstore
    &languageCode=en
    &filters=class:(pm_series_value^1.1 OR pm_name_value OR pm_number_value) AND (hiddenproduct:no OR (!_exists_:hiddenproduct))
    &printFields=tmspmseriesvalue,tmspmnamevalue,tmspmnumbervalue,class,productid,seofriendlyname,activewebsupportflag,navigationpath,childnodes
```

Returns `{matches: [{name, productId, pmSeriesOid, seoFriendlyName, pmClass, activeWebSupportFlag, childnodes, ...}], totalCount}`.

- **`pmClass`** discriminates the match type:
  - `pm_series_value` — top-level series (e.g. "HP ProBook 450 15.6 inch G10 Notebook PC"). **Use this for all subsequent calls** — `productId` here is the `seriesOid` everything else keys off.
  - `pm_name_value` — model variant within a series (e.g. "HP ProBook 450 ... (71H58AV)"). Has `pmSeriesOid` pointing back to the series.
  - `pm_number_value` — bare product number ("71H58AV") — has its own `productId` but no `seriesOid`. Treat as a hint and re-run the typeahead with the matched series name if you need driver/manual data.
- **Pick the highest `matchScore` with `pmClass=pm_series_value`** for downstream calls. If the user gave a product number (e.g. `71H58AV`), the `pm_name_value` row's `pmSeriesOid` is the series OID you want.
- `printFields` accepts a partial set; if you omit a field name you'll get back items missing that field (the iter-1 trace observed empty-field rows when too few `printFields` were declared — always include `name`, `productId`, `seoFriendlyName`, `pmClass` at minimum).

### 2. Get the category roster for that series

```
POST https://support.hp.com/wcc-services/pdp/category?type=all
Content-Type: application/json

{"seriesOid": "<oid>", "modelOid": null, "isMobile": false, "cc": "us", "lc": "en", "productAttributes": []}
```

Returns `data.categories[]` — each entry is one of the eight support sections with a `tmsId`, `seoName`, `label`, `docCount`, and (where applicable) `manuals` count + `softwareAvailability: true`. Verified categories observed across both consumer (Pavilion 15-cc700) and business (ProBook 450 G10) products:

| seoName | label | What's behind it |
|---|---|---|
| `setup-user-guides` | Setup & User Guides | Use `getManuals` (step 3) for PDFs; use `category-details` for in-page docs/videos |
| `troubleshooting` | Troubleshooting | Use `category-details` |
| `product-specs` | Product Specifications | Use `category-details` |
| `warranty-repair` | Warranty & Repair | Use `category-details` |
| `account-registration` | Account & Registration | Use `category-details` |
| `drivers` | Software & Drivers | Use `swd-v2/driverDetails` (step 4) |
| `tools-dignostics` | Tools & Diagnostics | Use `category-details`. Note the typo: `dignostics`, not `diagnostics`. |
| `security-viruses` | Security & Viruses | Use `category-details`; also see `pdp/securityalerts/...` |

### 3. Fetch PDF manuals (incl. the Maintenance and Service Guide)

```
GET https://support.hp.com/wcc-services/pdp/manuals/getManuals
    ?productID=<oid>
    &countryCode=us
    &languageCode=en
    &browserLangCode=en
```

Returns `data.manuals[]` of `{value, languageCode, fileBytes, id, url, contentType, localizedContentType, contentTypeId}`.

- **`contentType=="Service and Maintenance"`** is the **Maintenance and Service Guide** — the canonical hardware-replacement PDF. It contains: removal/replacement procedures (HDD, SSD, RAM, battery, palmrest, keyboard, display, system board, fan, speaker), HP **spare part numbers** for every component, and exploded-view diagrams. This is the answer to "what part number do I order to replace X?" — point users at this PDF.
- Other useful `contentType`s: `Use and Maintain` (User Guide, regulatory & safety, BIOS Setup Admin Guide), `White Paper`, `Customer Advisory`, `Security Bulletin`.
- `url` is a direct PDF link on `kaas.hpcloud.hp.com/pdf-public/`. No auth, no referrer required to fetch.
- Verified across consumer (Pavilion 15-cc700 → 7 manuals incl. "HP Pavilion 15 Laptop PC - Maintenance and Service Guide", 15.89 MB) and business (ProBook 450 G10 → 8 manuals incl. "Maintenance and Service Guide", 14.06 MB).

### 4. Fetch drivers / BIOS / system firmware

Two-call dance — first get the OS list, then post a driverDetails request scoped to one OS version.

```
GET https://support.hp.com/wcc-services/swd-v2/osVersionData?cc=us&lc=en&productOid=<oid>
```

Returns `data.osAvailablePlatformsAnsOS.osPlatforms[]` — each is one OS family (Windows) with `osVersions[]` (Windows 11 24H2, Windows 11 23H2, Windows 10 22H2, etc.). Each version has an opaque `id` (referred to as `osTMSId` / `platformId` in the next call). **Do not hardcode these IDs** — they're stable per release but new ones (e.g. Windows 11 25H2) appear; always re-read from `osVersionData`.

```
POST https://support.hp.com/wcc-services/swd-v2/driverDetails
Content-Type: application/json

{
  "productLineCode": "6U",     // from /wcc-services/profile/devices/warranty/specs (see step 5) or hardcode-by-family
  "lc": "en",
  "cc": "us",
  "osTMSId": "<id from osVersionData>",
  "osName": "Windows",
  "productNumberOid": <productNumberOid>,   // a child node OID; see below
  "productSeriesOid": <seriesOid>,
  "platformId": "<same as osTMSId>"
}
```

Returns `data.softwareTypes[]` — each is one software category with `accordionName` (e.g. `BIOS-System Firmware`, `Driver-Network`, `Driver-Graphics`, `Driver-Audio`, `Driver-Chipset`, `Diagnostic`, `Firmware`, `Software-Security`) and `softwareDriversList[]`. Each driver entry has:

- `latestVersionDriver` — `title`, `version`, `versionUpdatedDateString`, `fileSize`, `fileUrl` (direct softpaq download from `ftp.hp.com`), `severityFlag` (`routine`, `recommended`, `critical`), `releaseDateString`, `softwareItemId`
- `latestVersionDriver.detailInformation` — `description` (HTML), `installationInstruction` (HTML), `fixesAndEnhancements` (HTML — **contains CVE IDs for security updates** like `CVE-2025-20080`), `releaseDate`
- `latestVersionDriver.productSoftwareFileList[]` — file URL + `checkSum` (MD5)
- `previousVersionOfDriversList[]` — older versions with the same shape

**Resolving `productLineCode` and `productNumberOid`** from a `seriesOid`: the cheapest way is `POST /wcc-services/profile/devices/warranty/specs?cache=true` with body `{"cc":"us","lc":"en","utcOffset":"M0700","devices":[{"seriesOid":null,"modelOid":<seriesOid>,"serialNumber":null,"displayProductNumber":null,"countryOfPurchase":"us"}],"skipSyncCall":false,"captchaToken":""}`. The `devices[0].productSpecs.data` block carries `productLineCode`, `productNumberOid`, `productSeriesOid`, `productPlatform`, `productType`, `prodCategory` — and `warranty: null` (warranty itself requires a serial + reCAPTCHA, see Gotchas). **This call works without a serial number** — passing only `modelOid` returns the spec block. The non-serial path is the right way to bootstrap downstream calls.

### 5. Hardware-replacement / how-to videos

```
GET https://support.hp.com/wcc-services/swd-v2/kaasVideos/us-en/<oid>
```

Returns a numbered-keys object (`{"0":..., "1":..., ...}` not a top-level array) of `{bcId, title, description, store: "Videos", contentUpdateDate, streamingService: {videourl, name: "Brightcove", videoid}, thumbNail: ["...|w|h|yes", ...]}`. The videos cover OS-level tasks (recovery, restore points, Windows updates) — **not necessarily product-specific tear-downs**. For tear-down videos check the embedded video links inside the Maintenance and Service Guide PDF, or the `category-details` results for `setup-user-guides` (which mixes documents and videos by section).

### 6. Per-section docs/videos (troubleshooting, specs, etc.)

```
POST https://support.hp.com/wcc-services/pdp/category-details
Content-Type: application/json

{"tmsId": "<from /pdp/category>", "cc": "us", "lc": "en", "seriesOid": "<oid>", "modelOid": ""}
```

Returns `data.categoryList[]` — one entry per subsection within the category, each with `subCatName` (includes `(N)` count suffix), `tmsID`, `subCatType`, and `collectionData[]` of documents/videos. Document items have `documentID` (e.g. `ish_7299764-7299808-16`, navigable as `/{cc}-{lc}/document/{documentID}`), `title`, `description`, `contentType` (`How To`, `Customer Advisory`, etc.), `store: "Product Documents"`. Video items have `bcId` + `streamingService.videourl`.

### 7. Security advisories (CVE-level)

```
GET https://support.hp.com/wcc-services/pdp/securityalerts/us-en/<oid>
```

Use this when the user asks about active security advisories for the product (separate from the BIOS `fixesAndEnhancements` CVE list which is per-driver-release).

### 8. Warranty status — **excluded from automation**

The warranty form at `/{cc}-{lc}/check-warranty` requires a serial number AND a reCAPTCHA solve. The backing endpoint is `POST /wcc-services/profile/devices/warranty/specs` and accepts a `captchaToken` field — without a valid token it returns the spec block but `warranty: null`. **Do not attempt to bypass the reCAPTCHA**; instead, return the warranty page URL (`https://support.hp.com/{cc}-{lc}/check-warranty`) and the resolved product info, and let the caller hand the user off.

### 9. Diagnostic tools

The `/{cc}-{lc}/topic/diagnostics` URL redirects to `/{cc}-{lc}/help/computer`, which is a curated landing page (not product-scoped) with links to **HP PC Hardware Diagnostics (UEFI / Windows)**, **HP Support Assistant**, **HP Cloud Recovery**, **HP Print and Scan Doctor**. It's static; just include it as a link in the output. Per-product diagnostic *softpaqs* (e.g. UEFI diagnostics installer) appear in `swd-v2/driverDetails` under `accordionName: "Diagnostic"` — surface those as part of the drivers result.

### Browser fallback

If the wcc-services API ever rate-limits or breaks (didn't observe in iter-1 — proxies were not required, the API has no anti-bot wall and returns 200 over an unverified session), fall back to navigating these URLs and harvesting the same JSON from the SPA's network tab:

- `/{cc}-{lc}/product/details/{seoFriendlyName}/{oid}` — product hub
- `/{cc}-{lc}/drivers/{seoFriendlyName}/model/{oid}` — drivers page (Angular renders progressively; OS picker triggers `swd-v2/driverDetails`)
- `/{cc}-{lc}/product/setup-user-guides/{seoFriendlyName}/{oid}` — manuals + setup
- `/{cc}-{lc}/product/troubleshooting/{seoFriendlyName}/{oid}` — troubleshooting docs

The Angular shell renders nothing useful for `browse snapshot` until the API calls complete (~3 s post-`load`), so even in the fallback you should `wait timeout 3000` then read the same JSON via `browse eval` page-context fetch rather than clicking through the OS picker UI (the OS-picker buttons require eval-driven clicks anyway because the dropdown's aria attributes don't expose `option` roles cleanly to a snapshot — observed in iter-1).

## Site-Specific Gotchas

- **`/typeahead` lives at the bare origin, not under `/wcc-services/`.** It's `https://support.hp.com/typeahead?...` — the only API endpoint that doesn't follow the `/wcc-services/` prefix. The `Referer` header is not enforced; no other headers required.
- **`pmClass` discriminates result tier and you must filter for it.** A typeahead query like "71H58AV" returns BOTH a `pm_name_value` row (the model variant carrying a `pmSeriesOid`) AND a `pm_number_value` row (the bare product-number record with no series link). The `pm_number_value` row is a dead-end for downstream API calls — use the `pmSeriesOid` from the `pm_name_value` row, or re-query with the resolved product *name* to get a `pm_series_value` row.
- **`printFields` is a strict allow-list.** Omit a field and it's silently dropped from the response — you'll get items with `name: undefined`. Always include `name`, `productId`, `seoFriendlyName`, `pmClass` minimum. Adding more is free.
- **`tools-dignostics` is misspelled in the API.** The category `seoName` is `tools-dignostics` (missing the second `a`). Don't auto-correct it; the API will 404 the corrected spelling.
- **OS version IDs are opaque, long, and per-release.** They're 38–48 character numeric strings (e.g. `11071710142261487401158135515468128090636` is Windows 11 24H2 64-bit). Always read them fresh from `osVersionData`. Caching is fine within a session; never bake them into the skill.
- **`driverDetails` requires `productLineCode` + `productNumberOid`, not just `productSeriesOid`.** Without them the response is empty. Bootstrap them via `profile/devices/warranty/specs` with only `modelOid` set (no serial needed) — the spec block carries everything. `productLineCode` is a 1-2 char family code (`6U` for ProBook 450 G10, varies by family).
- **Warranty data requires reCAPTCHA + serial.** `profile/devices/warranty/specs` with no `serialNumber` returns `warranty: null` — that's not an error, it's by design. Don't try to bypass; emit the warranty-check page URL and stop.
- **Warranty page itself has reCAPTCHA at `/check-warranty`.** Visible iframe at iter-1 confirmed. The skill's flow exits at "user takes the URL" — never attempt to solve.
- **No anti-bot wall on read endpoints.** A bare Browserbase session (no `--verified`, no `--proxies`) reaches `/typeahead` and `/wcc-services/*` over a US IP without 4xx. The verified-stealth proxy session in the iter-1 trace returned 200s on every call. **Use a plain session** unless an out-of-band block surfaces; the proxy adds latency for no benefit. (`/check-warranty` would still wall on reCAPTCHA — that's a UI-layer block, unrelated to network anti-bot.)
- **`kaasVideos` returns a numbered-keys object, not an array.** Top-level shape is `{"0": {...}, "1": {...}, ...}`. Iterate with `Object.values()`.
- **Direct softpaq URLs work without auth.** `https://ftp.hp.com/pub/softpaq/sp{N0}-{N1}/sp{ID}.exe` is publicly served. Don't try to "log in" or set referrers; the link from `driverDetails` works as-is.
- **Service guide PDF URL is on `kaas.hpcloud.hp.com`** — not `ftp.hp.com`. Different CDN, also unauthenticated. Both are stable.
- **`detailInformation.fixesAndEnhancements` is HTML with embedded `<!DOCTYPE>` blocks.** Each release-note section is wrapped in its own DTD prologue + `<html><body>...</body></html>` — to extract clean text you have to strip multiple HTML wrappers, not just one. Plain text contains the CVE list.
- **The Angular shell hides API responses behind a 1-3 s render delay.** If you go the browser-fallback route, `wait load` followed by `wait timeout 3000` is the minimum; the snapshot returned at `load` time is empty (just `<app-root></app-root>`).
- **Country/locale drift.** `/{cc}-{lc}/...` URLs follow the same routing for non-US (e.g. `gb-en`, `de-de`, `fr-fr`). The bare `/` redirects to a country based on the request IP — always specify `{cc}-{lc}` explicitly. Manuals and driver content vary by `cc`/`lc`; the same `oid` returns different `manuals[]` localized for the locale you pass.
- **`activeWebSupportFlag: "no"` means the product is end-of-life on the support site.** Drivers and manuals may still be served, but the data is frozen. Surface this flag to callers — "results may be outdated."
- **The OS picker UI (`button: Select your Operating System version`) is not a real `<select>`** — it's a list of stacked `<button>` elements. `browse click @<ref>` on the visible-text option works only after first clicking the parent dropdown button. From `browse eval`, `Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Windows 11 version 24H2 (64-bit)').click()` is reliable. Submit then needs a second eval-driven click. (API path skips this entirely.)

## Expected Output

```json
{
  "query": "HP ProBook 450 G10",
  "matchedProduct": {
    "name": "HP ProBook 450 15.6 inch G10 Notebook PC",
    "seriesOid": 2101593792,
    "seoFriendlyName": "hp-probook-450-15.6-inch-g10-notebook-pc",
    "productLineCode": "6U",
    "productNumberOid": 2101593828,
    "productPlatform": "Roc15",
    "productType": "Laptops and Hybrids",
    "audience": "Commercial",
    "activeWebSupport": true,
    "pageUrls": {
      "productHub": "https://support.hp.com/us-en/product/details/hp-probook-450-15.6-inch-g10-notebook-pc/2101593792",
      "drivers": "https://support.hp.com/us-en/drivers/hp-probook-450-15.6-inch-g10-notebook-pc/model/2101593792",
      "setupUserGuides": "https://support.hp.com/us-en/product/setup-user-guides/hp-probook-450-15.6-inch-g10-notebook-pc/2101593792",
      "warrantyCheck": "https://support.hp.com/us-en/check-warranty",
      "diagnostics": "https://support.hp.com/us-en/help/computer"
    }
  },
  "manuals": [
    {
      "title": "Maintenance and Service Guide",
      "contentType": "Service and Maintenance",
      "language": "EN",
      "size": "14.06 MB",
      "url": "https://kaas.hpcloud.hp.com/pdf-public/pdf_7742024_en-US-1.pdf",
      "note": "Canonical repair guide: disassembly procedures + HP spare part numbers."
    },
    {
      "title": "User Guide",
      "contentType": "Use and Maintain",
      "language": "EN",
      "size": "8.56 MB",
      "url": "https://kaas.hpcloud.hp.com/pdf-public/pdf_6908214_en-US-1.pdf"
    }
  ],
  "drivers": {
    "os": "Windows 11 version 24H2 (64-bit)",
    "osTMSId": "11071710142261487401158135515468128090636",
    "categories": [
      {
        "name": "BIOS-System Firmware",
        "items": [
          {
            "title": "HP BIOS and System Firmware (V72)",
            "version": "01.11.00 Rev.A",
            "releaseDate": "2026-01-16",
            "severity": "routine",
            "fileSize": "24.3 MB",
            "fileUrl": "https://ftp.hp.com/pub/softpaq/sp168501-169000/sp168775.exe",
            "checksum": "69440D4FBE27427711F28B9FC735460F",
            "fixes": ["CVE-2025-20080", "CVE-2025-27707", "CVE-2025-31648", "CVE-2025-32008"]
          }
        ]
      },
      { "name": "Driver-Network", "items": [/* ... */] },
      { "name": "Driver-Graphics", "items": [/* ... */] },
      { "name": "Driver-Audio", "items": [/* ... */] },
      { "name": "Driver-Chipset", "items": [/* ... */] },
      { "name": "Diagnostic", "items": [/* per-product UEFI diagnostic softpaqs */] },
      { "name": "Firmware", "items": [/* ... */] }
    ]
  },
  "videos": [
    {
      "bcId": "REFIDNS36333818",
      "title": "Resetting Windows 11 When Your HP Computer Does Not Boot",
      "videoUrl": "https://players.brightcove.net/1160438706001/BO7dPiDZK_default/index.html?videoId=ref:REFIDNS36333818"
    }
  ],
  "diagnosticTools": {
    "page": "https://support.hp.com/us-en/help/computer",
    "tools": [
      "HP PC Hardware Diagnostics (UEFI)",
      "HP PC Hardware Diagnostics (Windows)",
      "HP Support Assistant",
      "HP Cloud Recovery",
      "HP Print and Scan Doctor"
    ],
    "note": "Per-product UEFI diagnostic softpaqs are also available under drivers.categories[name='Diagnostic']."
  },
  "warranty": {
    "status": "not_checked",
    "reason": "warranty_check_requires_recaptcha",
    "instruction": "Visit https://support.hp.com/us-en/check-warranty and enter the device serial number. The skill does not solve reCAPTCHA."
  }
}
```

Edge-case shapes:

```json
// Ambiguous / multiple-series match
{
  "query": "HP Pavilion 15",
  "matchedProduct": null,
  "ambiguous": true,
  "candidates": [
    { "name": "HP Pavilion 15-cc700 Laptop PC", "seriesOid": 17053501, "seoFriendlyName": "hp-pavilion-15-cc700-laptop-pc" },
    { "name": "HP Pavilion 15-bc000 Notebook PC series (Touch)", "seriesOid": 10862168 },
    { "name": "HP Pavilion 15-cu1000 Laptop PC", "seriesOid": 23238469 }
  ]
}

// Product not found
{
  "query": "HP Frobnicator 9000",
  "matchedProduct": null,
  "ambiguous": false,
  "candidates": []
}

// End-of-life product (still has data, but flag stale)
{
  "query": "HP Pavilion dv2000",
  "matchedProduct": { "...": "...", "activeWebSupport": false },
  "manuals": [/* ... */],
  "drivers": { "os": null, "categories": [] },
  "warning": "activeWebSupportFlag=no — content may be archived / unmaintained."
}
```
