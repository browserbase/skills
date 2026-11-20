---
name: wellydiecast-com-find-diecast-model-2atm9j
title: Welly Diecast — Find a Diecast for a Vehicle
description: >-
  Search Welly Die Casting Factory's manufacturer catalog by vehicle keyword,
  brand, or scale and return matching diecast models with Item No., model name,
  scale, photo URL, and shareable canonical URL. Read-only manufacturer
  reference — no prices or stock.
website: wellydiecast.com
category: shopping
tags:
  - diecast
  - collectibles
  - catalog
  - welly
  - hobby
  - models
source: 'browserbase: agent-runtime 2026-05-22'
updated: '2026-05-22'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      Use a Browserbase session only as a fallback if Cloudflare ever starts
      challenging plain fetches. Not observed in 2026-05-22 testing — `browse
      cloud fetch` returned 200 OK with full result HTML across keyword search,
      brand filter, scale+brand filter, no-results, and pagination, and the AJAX
      detail/spec endpoints work via in-page fetch. The browser path costs ~100×
      more turns and adds no information.
  - method: api
    rationale: >-
      There is no documented JSON API. The two AJAX endpoints
      (`product_detail.php`, `product_spec.php`) return HTML fragments, not JSON
      — parse with regex like the result tile.
verified: true
proxies: true
---
# Welly Diecast — Find a Diecast Model for a Vehicle

## Purpose

Given a user's vehicle (year, make, model — or any subset), search Welly Die Casting Factory's product catalog at `wellydiecast.com` and return matching diecast models with their item number, model name, scale, photo URL, and shareable canonical URL. Read-only; the site has no cart, no checkout, no auth — it is the manufacturer's reference catalog, not a store.

## When to Use

- A collector wants to know if Welly produces a diecast of their car (e.g. *"do they make a 1969 Mustang?"*).
- An agent assembling shopping lists across diecast manufacturers — Welly is the catalog of record for Item Numbers like `12516`, `22485NS`, `43696S3` that resellers (eBay, Amazon, hobby shops) list under.
- Cross-referencing a user-supplied Item No. (printed on the box) to the canonical product record (name, scale, photo).
- Bulk enumeration of all diecast models in a given scale (e.g. *"all 1:18 Fords"*).

## Workflow

`wellydiecast.com` is a server-rendered PHP catalog behind Cloudflare with **no anti-bot, no auth, no cookies, no JS rendering required for the result list**. A plain HTTP GET with a generic User-Agent returns the full result HTML (verified 2026-05-22: `browse cloud fetch` returns 200 OK with all `<div class="col" pid="…">` blocks intact, no Cloudflare challenge). The site uses jQuery + AJAX *only* to inflate the product-detail panel inline; the underlying detail/spec endpoints are also plain POST forms. **Prefer `fetch` over scripted browsing — the browser path costs ~100× more turns and adds no information.**

### 1. Parse the vehicle into search axes

From the user's vehicle, pick the most-specific axis available, in this priority order:

| User input | Search axis | URL shape |
|---|---|---|
| Specific model name (e.g. "Mustang", "Skyline GT-R", "F-150") | `keyword` | `/product.php?keyword=<urlenc>&mode=search` |
| Item No. from a box (e.g. "12516", "22485NS") | `keyword` | `/product.php?keyword=<itemno>&mode=search` |
| Brand only (e.g. "any Ford", "any Porsche") | `brand` | `/product.php?brand=<BRAND>` |
| Brand + scale (e.g. "1:18 Fords") | `brand` + `sid` + `cid=1` | `/product.php?cid=1&sid=<N>&brand=<BRAND>` |
| Year + make + model (most specific) | `keyword` with model name only — year filtering happens client-side on `<div class="name">` | `/product.php?keyword=<model>&mode=search` |

**Recommendation: lead with `keyword`**. The keyword field does a substring match against both the product name and the item number, so `keyword=Mustang` returns every Mustang regardless of year or scale; `keyword=12516` returns the single product with that item number. `brand=` works but the brand enum is messy (see Gotchas) and many models from the same make are not consistently tagged.

### 2. Issue the search

```bash
URL="https://www.wellydiecast.com/product.php?keyword=$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))' "$VEHICLE_QUERY")&mode=search"
browse cloud fetch "$URL" --output /tmp/results.html
```

For multi-page results (`<a class="next">` is present and not `.nolink`), iterate `&page=N` (starts at 1, ~20 results per page):

```bash
for N in 1 2 3 4 5; do
  browse cloud fetch "${URL}&page=${N}" --output "/tmp/results.p${N}.html"
  grep -q 'class="next nolink"' "/tmp/results.p${N}.html" && break
done
```

### 3. Parse result blocks with a regex per `<div class="col" pid="…">`

Each catalog tile is one `<div class="col" pid="N">…</div>` containing:

| Field | Selector |
|---|---|
| `pid` (Welly's internal product ID) | `<div class="col" pid="(\d+)">` |
| Photo URL | `<table class="photo"><tr><td><img src="(upload/product/middle/[^"]+)">` → prefix with `https://www.wellydiecast.com/` |
| Model name | `<div class="name">([^<]+)</div>` |
| Item number (the SKU printed on the box) | `<div class="item_no">([^<]+)</div>` |
| Scale (free-text) | `<div class="scale">([^<]+)</div>` |
| Shareable canonical URL | `https://www.wellydiecast.com/share.php?pid={pid}` |

Empty-slot tiles `<div class="col empty"></div>` exist to pad rows of 4 — skip them.

**Zero-results sentinel**: when the search has no matches, the body of `.product_list_container` contains `<div class="text">No record found.</div>` and no `pid="…"` blocks. Return `{ "matches": [], "no_results": true }`.

### 4. (Optional) Enrich each match with the detail-panel data

The result tile gives you everything most users need (name, item no., scale, photo). For high-resolution photo and a confirmed "Category" string, POST to the AJAX endpoints used by the inline detail panel:

```bash
# High-res photo + brand logo
curl -s -X POST -d "pid=$PID" -H "Content-Type: application/x-www-form-urlencoded" \
  https://www.wellydiecast.com/product_detail.php
# Item No., Category (scale group), Model — same data, more reliably formatted
curl -s -X POST -d "pid=$PID" -H "Content-Type: application/x-www-form-urlencoded" \
  https://www.wellydiecast.com/product_spec.php
```

(In the browse.sh sandbox, `curl` may not have outbound DNS — substitute `browse eval` with `fetch('/product_detail.php', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:'pid='+pid })` from within an open page on `wellydiecast.com`. Verified 2026-05-22 in iter-1: both endpoints return 200 with the documented HTML fragments.)

### Browser fallback

If `browse cloud fetch` ever returns a Cloudflare challenge page (not observed in 2026-05-22 testing across 6 result pages and 2 AJAX endpoints), fall back to:

```bash
sid=$(browse cloud sessions create --keep-alive --proxies --verified | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
browse open "https://www.wellydiecast.com/product.php?keyword=Mustang&mode=search" --remote -s "$sid"
browse wait load --remote -s "$sid"
HTML=$(browse get html body --remote -s "$sid")
# parse $HTML with the same regexes as step 3
browse cloud sessions update "$sid" --status REQUEST_RELEASE
```

Do **not** rely on `browse snapshot` for parsing — the accessibility tree collapses the catalog tiles into long flat StaticText runs and drops the `pid` attribute. Use `browse get html` and the regex set above.

## Site-Specific Gotchas

- **Welly is a manufacturer, not a store.** Product pages have no price, no stock status, no buy button. The skill returns *model identifiers* (`item_no`, `name`, `scale`, `pid`) — the consumer of this skill then takes those into eBay/Amazon/hobby-shop searches to actually buy one. Don't fabricate prices or availability; they do not exist on this site.
- **The `brand=` enum is dirty.** The same make appears under multiple variants because of historical data-entry drift. Observed duplicates in `/product.php` brand list (2026-05-22): `PORSCHE` ↔ `Porche` (typo), `FIAT` ↔ `FAIT+` (typo) ↔ `+Fiat`, `CHEVROLET` ↔ `+CHEVROLET`, `KAWASAKI` ↔ `Kawasak`, `MINI` ↔ `MINI+COOPER` ↔ `Mini+Cooper1`, `Aston Martin` ↔ (no UPPERCASE variant), `Mazda` (mixed-case only). When the user supplies a brand, the safer query is `keyword=<BRAND>` not `brand=<BRAND>` — `keyword` substring-matches against the model-name string which contains "FORD MUSTANG", "NISSAN SILVIA" etc, capturing all variants in one shot.
- **`brand=` is case-sensitive.** `brand=NISSAN` returns results; `brand=nissan` returns zero. Map user input to the catalog's UPPERCASE canonical form (or fall back to `keyword`, see above).
- **Scale is free-text in the result tile.** Strings observed: `1:18 Scales`, `1:24-27 SCALE` (note: `27` not `1:27` — inconsistent with the menu's `1:24-1:27 Scales`), `1:32 Scales`, `1:34-1:39 Scales`, `1:43-1:49 Scales`, `1:60-1:64 Scales`, `1:87 Scales`, `1:10 Motos`, `1:18 Motos`. Match loosely with a regex like `1:(\d+)(?:-1?:?(\d+))?` rather than equality.
- **Categories (`cid`) and scales (`sid`) are stable enums:**
  - `cid=1` = SCALE MODEL (the diecast-collector catalog)
  - `cid=2` = TOYS (BELOW… playsets, novelty)
  - Under `cid=1`: `sid=1→1:18`, `sid=2→1:24-1:27`, `sid=3→1:18 Motos`, `sid=4→1:32`, `sid=5→1:34-1:39`, `sid=6→1:43-1:49`, `sid=7→1:60-1:64`, `sid=8→1:87`, `sid=18→1:10 Motos`.
- **Pagination is `&page=N`, 1-indexed, ~20 per page.** Detect end-of-results by `<a class="next nolink"></a>` (the `nolink` class on the next-page anchor means there is no next page). The first page does not need `&page=1` but accepts it.
- **No canonical "product detail page" exists.** Welly's catalog UI expands the detail inline via AJAX (`product.init()` JS). The user-facing canonical shareable URL is `https://www.wellydiecast.com/product.php?keyword=<itemno>&mode=search#pid=<pid>` (which auto-opens the detail panel on load) or `https://www.wellydiecast.com/share.php?pid=<pid>` (their generated short URL — verified via the QR-code generator in `product_spec.php`). The hash-fragment URL is friendlier for humans; the share URL is what their own QR encodes.
- **`#pid=N` only works on a result page that includes that `pid`.** Linking to `product.php?keyword=Mustang&mode=search#pid=80` opens the detail panel because pid 80 is in the Mustang result set. Linking to `product.php#pid=80` (no search) opens the catalog index without the panel. Always link a detail through its own search context.
- **Item numbers have alphanumeric suffixes that matter.** `12519H`, `12519C`, `22485NS`, `22485S`, `43696S3` — the trailing letters denote body style or variant (`H`=hardtop, `C`=convertible, `NS`=non-stock, `S3`=series 3 etc.). Don't strip them; they distinguish otherwise-identical-named models.
- **Photo URLs need the host prefix.** Result HTML carries `src="upload/product/middle/2017-01-12/690237635467.jpg"` (relative). Prefix `https://www.wellydiecast.com/` to make them absolute. The `middle/` segment is the medium-resolution catalog tile; `large/` is the detail-panel high-res; `tn/` is the new-items thumbnail.
- **Cloudflare passes a generic UA.** No `--proxies` or `--verified` needed for `browse cloud fetch`. The site sets a `PHPSESSID` cookie but never validates it — discard it. The Cloudflare beacon (`cdn-cgi/challenge-platform/scripts/jsd/main.js`) is loaded but not interactively enforced on our requests.
- **`product.php` with no params lists *all* brand filter links in the left nav.** That page is a useful one-shot to harvest the full brand enum if needed — but expect ~85 entries including the duplicates listed above.

## Expected Output

Three distinct outcome shapes:

```json
// Matches found
{
  "query": { "vehicle": "1969 Ford Mustang", "axis": "keyword", "url": "https://www.wellydiecast.com/product.php?keyword=Mustang&mode=search" },
  "no_results": false,
  "total_pages_scanned": 2,
  "matches": [
    {
      "pid": 80,
      "item_no": "12516",
      "name": "1969 FORD MUSTANG",
      "scale": "1:18 Scales",
      "photo_url": "https://www.wellydiecast.com/upload/product/middle/2017-01-12/224922330185.jpg",
      "share_url": "https://www.wellydiecast.com/share.php?pid=80",
      "detail_link": "https://www.wellydiecast.com/product.php?keyword=12516&mode=search#pid=80"
    },
    {
      "pid": 76,
      "item_no": "12519H",
      "name": "1964-1/2 FORD MUSTANG COUPE",
      "scale": "1:18 Scales",
      "photo_url": "https://www.wellydiecast.com/upload/product/middle/2017-01-12/671176041761.jpg",
      "share_url": "https://www.wellydiecast.com/share.php?pid=76",
      "detail_link": "https://www.wellydiecast.com/product.php?keyword=12519H&mode=search#pid=76"
    }
  ]
}
```

```json
// No results
{
  "query": { "vehicle": "Toyota Prius", "axis": "keyword", "url": "https://www.wellydiecast.com/product.php?keyword=Prius&mode=search" },
  "no_results": true,
  "matches": [],
  "suggestion": "Welly's catalog does not include this model. Try a broader query (e.g. brand only) or check that the year/trim is correct."
}
```

```json
// Ambiguous brand — multiple enum variants for the same make
{
  "query": { "vehicle": "any Porsche", "axis": "brand", "url": "https://www.wellydiecast.com/product.php?brand=PORSCHE" },
  "no_results": false,
  "brand_variants_detected": ["PORSCHE", "Porche"],
  "note": "Brand enum contains duplicate variants; combined results across all variants returned below.",
  "matches": [
    { "pid": 1234, "item_no": "24081", "name": "PORSCHE 911 CARRERA S", "scale": "1:24-27 SCALE", "photo_url": "https://www.wellydiecast.com/upload/product/middle/…", "share_url": "https://www.wellydiecast.com/share.php?pid=1234", "detail_link": "https://www.wellydiecast.com/product.php?keyword=24081&mode=search#pid=1234" }
  ]
}
```
