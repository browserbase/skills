---
name: chanel-com-browse-all-products-cq9sq4
title: Chanel Browse All Products
description: >-
  Enumerate every product on chanel.com via the public per-locale sitemap.xml —
  returns product ID, category, slug, canonical URL, and last-modified date for
  all ~3,400 US SKUs across Fashion, Fine Jewelry, Watches, Eyewear, Fragrance,
  Makeup, and Skincare.
website: chanel.com
category: luxury-retail
tags:
  - chanel
  - luxury
  - products
  - catalog
  - sitemap
  - read-only
  - akamai
source: 'browserbase: agent-runtime 2026-05-24'
updated: '2026-05-24'
recommended_method: fetch
alternative_methods: []
verified: false
proxies: false
---
# Chanel Browse All Products

## Purpose

Return the complete catalog of products listed on chanel.com — one row per product with category, product ID, descriptive slug, canonical URL, and last-modified date. Single-locale (`/us/`) is the default; the same shape generalizes to any of the 70+ country sitemaps. Read-only; never adds-to-bag, signs in, or POSTs.

## When to Use

- Building a Chanel product index for downstream search/diff/monitoring (new arrivals, discontinued SKUs).
- Counting or auditing inventory breadth across Fashion / Fine Jewelry / Watches / Eyewear / Fragrance / Makeup / Skincare.
- Comparing per-locale availability (e.g. which products on `/fr/` are not on `/us/`).
- Anywhere you'd otherwise scrape Chanel's category-listing pages — those are Akamai-blocked from bare HTTP fetch, and the sitemap is a free, complete, robots.txt-blessed shortcut (≈3,400 US products in one ~1.3 MB XML payload).

## Workflow

Chanel publishes a **complete per-locale product sitemap** at `https://www.chanel.com/{locale}/sitemap.xml`. It is explicitly whitelisted in `robots.txt` (`Allow: /sitemap.xml`, `Sitemap: https://www.chanel.com/sitemap.xml`), contains every product detail URL on that locale's storefront with a stable URL pattern carrying both the category and the product ID, and is reachable via plain HTTP — no stealth session, residential proxy, or `--verified` flag required. Lead with this path. Browsing category-listing pages or scraping product detail pages is a confirmed dead end: every `/{locale}/...` HTML response is Akamai-served and returns 403 to `browse cloud fetch` (with or without `--proxies`); a stealth + proxies + `--verified` `browse cloud sessions create` browser can render the top-level category landing (e.g. `/us/fragrance/`) but gets Akamai-flagged within 1–2 navigations of a product detail page (`/{locale}/.../p/<id>/<slug>/`).

1. **Fetch the master sitemap index** (lists per-locale sitemaps — one entry per country/language combo, ≈70+ entries):
   ```bash
   browse cloud fetch "https://www.chanel.com/sitemap.xml"
   ```
   The response is `<sitemapindex>` with `<sitemap><loc>https://www.chanel.com/{locale}/sitemap.xml</loc>` children. Pick the locale(s) you care about. Common locales: `us`, `gb`, `fr`, `de`, `jp`, `ca-en`, `ca-fr`, `au`, `hk-en`, `hk-zh`. Mainland China lives on a separate host: `https://www.chanel.cn/cn/sitemap.xml`.

2. **Fetch the locale sitemap**:
   ```bash
   browse cloud fetch "https://www.chanel.com/us/sitemap.xml"
   ```
   Plain text/XML, no headers needed, no rate-limit observed during testing. The US payload is ~1.3 MB / ~6,500 `<url>` entries (≈3,400 products + ≈3,100 editorial/category-index pages).

3. **Parse the XML** and filter to product URLs. Product URLs are exactly the entries containing `/p/`:
   ```
   https://www.chanel.com/{locale}/{category}/p/{productId}/{slug}/
   ```
   - `category` — one of seven slugs on `/us/`: `fashion`, `makeup`, `fragrance`, `fine-jewelry`, `eyewear`, `skincare`, `watches`. On non-English locales the category segment is localized (FR: `mode/parfums/joaillerie/maquillage/lunettes/soins/horlogerie`; DE: `mode/parfum/schmuck/make-up/brillen/hautpflege/uhren`). The `/p/` segment itself is **stable across all locales** — filtering on `/p/` is the safe locale-independent rule.
   - `productId` — Chanel's internal SKU. Numeric for cosmetics/fragrance/skincare/watches (e.g. `113620`, `H10331`), alphanumeric for fashion/eyewear/jewelry (e.g. `P80816V71953U1174`, `A71729X02570L246700PUNI`, `J11659`). The same `productId` is reused across locales — it's the join key for cross-locale comparison.
   - `slug` — kebab-case descriptive name (`coco-noir-eau-de-parfum-spray`, `extrait-de-camelia-earrings`). Locale-dependent (it's the localized display name).

   Each `<url>` also carries `<lastmod>` (ISO date, useful for new-arrival diffs — almost all products share the most-recent crawl date, but a handful carry older `lastmod`s like `2026-03-07` which correspond to runway/podium look pages) and `<changefreq>daily</changefreq>` `<priority>0.6</priority>` (uniform across all product entries; not useful signal).

4. **Emit the canonical record** (see Expected Output). The sitemap is the ground-truth enumeration — do not attempt to enrich each row with a product detail page fetch; those return 403 (see Gotchas). If price/description/imagery is needed, treat that as a separate downstream skill that operates per-SKU through whatever browser-stealth path can be sustained, not as part of this enumeration.

5. **(Optional) Repeat for other locales**. Product IDs join cleanly across locales; the category enum localizes (use the `/p/` filter, then bucket by the locale's category slugs).

### Browser fallback

Not viable for this task. Confirmed during testing: a `browse cloud sessions create --keep-alive --proxies --verified` session can open `/us/` top-level category landing pages (e.g. `/us/fragrance/`) but returns Akamai's HTML "Access Denied" (Reference #18.*, served by edgesuite.net) on every product detail URL and on most `/c/.../page-N/` listing URLs within one or two navigations. There is no known scriptable workaround — and even if there were, scraping the visible `<a href>` listings would only re-derive what the sitemap already publishes. If you find yourself reaching for a browser session for this task, you have skipped step 1.

## Site-Specific Gotchas

- **`browse cloud fetch` is 403 on every HTML page, with or without `--proxies`.** Akamai bot management challenges any cookieless `Mozilla/...` request to `/us/fashion/...`, `/us/fragrance/.../c/...`, `/us/.../p/.../`, etc. The sitemap.xml endpoints (`/sitemap.xml`, `/{locale}/sitemap.xml`) are explicitly excluded from this challenge — they return 200 with a fresh `bm_*` cookie set and the XML payload in `content`. Don't try to "warm up" cookies via a HEAD request; it doesn't help on HTML.
- **Even a verified + proxied browser session gets flagged within ~2 navigations of a product detail page.** Iter-1 reproduction: session opened `/us/fragrance/` OK → tried `/us/fragrance/p/113620/coco-noir-eau-de-parfum-spray/` → Akamai 403 → from that point onward, all subsequent navigations including the previously-working landing pages return "Access Denied". Releasing and creating a fresh session restores landing-page access but a single product-detail navigation re-flags it. **Do not try to enrich the sitemap rows by browsing each `/p/.../` URL** — you'll spend hundreds of sessions and discover nothing the sitemap didn't already give you.
- **`robots.txt` explicitly blocks several scraping shortcuts**: `Disallow: /us/*?*` (no query strings on /us/), `Disallow: */api/*`, `Disallow: */search/*`, `Disallow: /*?q=*`. The sitemap path is the only blessed enumeration.
- **The master sitemap index is `https://www.chanel.com/sitemap.xml`**, NOT a single flat sitemap. It contains one `<sitemap>` entry per locale (≈70+). To enumerate "all products globally" you must walk all per-locale sitemaps.
- **Mainland China is on a separate host.** `<loc>https://www.chanel.cn/cn/sitemap.xml</loc>` (note `.cn` TLD, not `.com`). All other locales live under `chanel.com`.
- **Category segment localizes, `/p/` does not.** The reliable filter is `url.includes('/p/')`. Bucketing by category requires consulting a per-locale enum: US `[fashion, makeup, fragrance, fine-jewelry, eyewear, skincare, watches]`, GB `[fashion, makeup, fragrance, fine-jewellery, eyewear, skincare, watches]` (note `fine-jewellery`), FR `[mode, maquillage, parfums, joaillerie, lunettes, soins, horlogerie]`, DE `[mode, make-up, parfum, schmuck, brillen, hautpflege, uhren]`, JP `[fashion, makeup, fragrance, fine-jewelry, eyewear, skincare, watches]` (English category segments retained on JP site).
- **Product IDs are globally stable across locales.** `113620` is coco-noir-eau-de-parfum-spray on `/us/`, `/gb/`, `/fr/`, `/de/`, `/jp/`. Use the ID as the join key, not the slug (slugs localize).
- **Product ID formats are heterogeneous within categories.** Fashion uses long alphanumeric SKUs (`P80816V71953U1174`, `ABG801B23049U6312`); jewelry uses `J`+digits (`J11659`, `J3413`); watches use `H`+digits (`H10331`); eyewear uses `A`+long suffix (`A71729X02570L246700PUNI`); fragrance/makeup/skincare use 6-digit numeric (`113620`, `171214`, `141960`). Do not assume numeric IDs.
- **A small number of product URLs are runway/look pages, not buyable SKUs.** `/us/fashion/p/26K-PODIUM-033/look-33/` is a Spring/Summer collection look, not a single item. They carry older `lastmod`s (`2026-03-07` in the US sitemap vs. `2026-05-21` for live SKUs). Filter on `lastmod` or on the `PODIUM`-substring SKU prefix if you want buyable SKUs only.
- **Per-locale product counts (verified 2026-05-24)**: US 3,398 · GB 3,502 · FR 3,554 · DE 3,556 · JP 3,196. Totals fluctuate daily — the sitemap is regenerated nightly (consistent `lastmod: 2026-05-21` on virtually every entry the day it was crawled).
- **No price, no stock, no imagery in the sitemap.** Only `loc`, `lastmod`, `changefreq`, `priority` per `<url>`. If you need price/stock you need a different (not-yet-figured-out) Chanel surface — the API is also `Disallow`d.
- **Haute couture is NOT in `/p/` URLs.** `/us/haute-couture/` is a top-level editorial section without per-look product URLs. The 3,398 US count reflects ready-to-wear ("fashion"), beauty, and accessories only.

## Expected Output

```json
{
  "locale": "us",
  "fetched_at": "2026-05-24T17:35:12Z",
  "sitemap_url": "https://www.chanel.com/us/sitemap.xml",
  "category_counts": {
    "fashion": 1640,
    "makeup": 770,
    "fragrance": 305,
    "fine-jewelry": 284,
    "eyewear": 188,
    "skincare": 115,
    "watches": 96
  },
  "total_products": 3398,
  "products": [
    {
      "product_id": "113620",
      "category": "fragrance",
      "slug": "coco-noir-eau-de-parfum-spray",
      "url": "https://www.chanel.com/us/fragrance/p/113620/coco-noir-eau-de-parfum-spray/",
      "last_modified": "2026-05-21"
    },
    {
      "product_id": "J11659",
      "category": "fine-jewelry",
      "slug": "extrait-de-camelia-earrings",
      "url": "https://www.chanel.com/us/fine-jewelry/p/J11659/extrait-de-camelia-earrings/",
      "last_modified": "2026-05-21"
    },
    {
      "product_id": "P80816V71953U1174",
      "category": "fashion",
      "slug": "pants-embroidered-silk-canvas",
      "url": "https://www.chanel.com/us/fashion/p/P80816V71953U1174/pants-embroidered-silk-canvas/",
      "last_modified": "2026-05-21"
    },
    {
      "product_id": "H10331",
      "category": "watches",
      "slug": "premiere-iconic-chain-necklace-watch",
      "url": "https://www.chanel.com/us/watches/p/H10331/premiere-iconic-chain-necklace-watch/",
      "last_modified": "2026-05-21"
    },
    {
      "product_id": "A71729X02570L246700PUNI",
      "category": "eyewear",
      "slug": "shield-sunglasses-silver",
      "url": "https://www.chanel.com/us/eyewear/p/A71729X02570L246700PUNI/shield-sunglasses-silver/",
      "last_modified": "2026-05-21"
    }
  ]
}
```

For "all products across all locales", emit one object per locale (as above) inside a wrapping `{ "by_locale": { "us": {...}, "gb": {...}, ... } }`; join across locales on `product_id` if a unified catalog is required.
