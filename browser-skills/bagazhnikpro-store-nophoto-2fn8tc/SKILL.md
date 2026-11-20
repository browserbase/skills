---
name: bagazhnikpro-store-nophoto-2fn8tc
title: Bagazhnikpro Products Without a Photo
description: >-
  Crawl the bagazhnikpro.store catalog (hotengine CMS) and list every product
  whose listing card shows the 'Нет Изображения' placeholder instead of a real
  photo, exporting id, SKU, title, category and URL to an Excel workbook.
website: bagazhnikpro.store
category: ecommerce
tags:
  - ecommerce
  - catalog
  - data-quality
  - no-photo
  - scraping
  - hotengine
source: 'browserbase: agent-runtime 2026-06-08'
updated: '2026-06-08'
recommended_method: fetch
alternative_methods:
  - method: fetch
    rationale: >-
      Category pages server-render the full product grid as static HTML when the
      ?n=<page>&NUM_ONPAGE=<count> pagination params are present. No auth, no
      anti-bot, no proxy — plain HTTP fetch + HTML parsing is the cheapest and
      most reliable path. Detect no-photo via the
      img.hotengine-shop-products-list-img-empty class / no_image_ru.png src.
  - method: browser
    rationale: >-
      Fallback only. A bare (non-verified, non-proxied) browser session loads
      the same grid and you flag cards via
      document.querySelectorAll('div.hotengine-shop-product-list-block
      img.hotengine-shop-products-list-img-empty'). ~100x slower/costlier than
      fetch; needed only if server-side pagination rendering breaks.
verified: false
proxies: false
---
# Bagazhnikpro — Find Product Cards Without a Photo

## Purpose

Enumerate every product in the bagazhnikpro.store catalog whose listing card has **no product photo** (the card renders the grey "Нет Изображения" / `no_image_ru.png` placeholder instead of a real image) and export the result as an Excel workbook. For each no-photo product the skill returns its internal id, SKU (артикул), title, category, and canonical product URL. **Read-only** — it only reads public catalog pages; it never logs in, edits, or touches the cart.

## When to Use

- A merchandising / content audit: "which products are missing a photo so we can shoot/upload images?"
- Producing a hand-off spreadsheet (`.xlsx`) of incomplete product cards for a catalog manager.
- Any periodic data-quality check over the full bagazhnikpro.store catalog (~25.8k products across ~50 leaf categories).
- As a template for the sibling shops on the same engine (e.g. `autossport.store`), which share the identical "hotengine" CMS markup.

## Workflow

bagazhnikpro.store runs the **"hotengine" CMS** (LiteSpeed/CyberPanel). The optimal method is **pure HTTP fetch — no browser, no proxy, no stealth needed** (the homepage anti-bot probe reported *none detected*, and `ClaudeBot`/`GPTBot` are explicitly `Allow`ed in robots.txt). The one non-obvious trick: a bare category URL (`/ru/pers_shop/<cat>/`) returns a **JS-only skeleton** with zero products to a plain fetch — but appending the pagination query params **`?n=<page>&NUM_ONPAGE=<count>`** makes the server render the full product grid as static HTML. That single insight turns the whole task into deterministic HTML parsing.

1. **Collect the leaf category slugs.** Fetch the homepage `https://bagazhnikpro.store/ru/` (note: `https://bagazhnikpro.store/` 301-redirects to `/ru/`) and harvest every link matching `/ru/pers_shop/<slug>/`. ~68 such links exist, but many are *parent groupings* that render a subcategory list and **0 products** (e.g. `bagajniki`, `deflektori`, `kovriki`, `lampy`, `farkopi`) — that's fine, they simply yield no rows. The leaf categories (e.g. `poperechininareylingi`, `zashitakarteradvigatelya`, `organayzery`, `deflektorinaoknavetroviki`) are where products live.

2. **Page through each category server-side.** For each category slug, fetch:
   ```
   https://bagazhnikpro.store/ru/pers_shop/<slug>/?n=<N>&NUM_ONPAGE=96
   ```
   starting at `N=0` and incrementing until a page returns fewer than `NUM_ONPAGE` product blocks (or zero). Each page is ~430 KB at `NUM_ONPAGE=96`. **Do not crank `NUM_ONPAGE` arbitrarily high** to grab a whole big category in one shot — large categories (e.g. `bagajnikinakrishyavtomobilyavsbore` has 5,856 products, `deflektorinaoknavetroviki` 3,203, `porogi` 2,637) will blow past the fetch body-size limit. 96/page is a safe sweet spot.

3. **Parse product cards.** Each card is a `<div class="hotengine-shop-product-list-block" ...>` carrying:
   - `data-hotengine-marking-shop_catalog_page_id="<id>"` → product id
   - `data-hotengine-marking-shop_catalog_page_sku="<sku>"` → SKU / артикул
   - title in `.hotengine-shop-product-title > h4 > a` (also in the anchor `title=` attr)
   - the listing image `<img class="hotengine-shop-products-list-img" ...>`

4. **Detect "no photo" — the definitive signal.** A card **with** a photo has `<img class="hotengine-shop-products-list-img" src="/upload/shop_catalog/s9060/<id>/<id>_0.small_cachedx300.{webp|jpg}">`. A card **without** a photo has an extra class and a fixed placeholder src:
   ```html
   <img class="hotengine-shop-products-list-img hotengine-shop-products-list-img-empty"
        loading="lazy" src="/img/shop/no_image_ru.png" />
   ```
   So a product is "no photo" iff **either** its listing `<img>` carries the class `hotengine-shop-products-list-img-empty` **or** its `src` is `/img/shop/no_image_ru.png` (equivalently: the `src` does **not** start with `/upload/shop_catalog/`). The CSS selector `div.hotengine-shop-product-list-block img.hotengine-shop-products-list-img-empty` matches exactly the no-photo cards.

5. **Collect & de-duplicate** by product id (a product can appear under more than one category path), decode HTML entities in the title/SKU (`&quot;`, `&amp;`, `&nbsp;`, `&laquo;`/`&raquo;`), and build the canonical URL `https://bagazhnikpro.store/ru/pers_shop/<slug>/<id>.htm`.

6. **Write the Excel file.** Emit one row per no-photo product with columns `№ | ID товара | Артикул (SKU) | Название | Категория | Ссылка` to an `.xlsx` (e.g. via the `xlsx`/SheetJS library, or any spreadsheet writer). Over the full catalog this run produced **43 no-photo products out of 25,817** (≈0.17%).

### Browser fallback

If the `?n=&NUM_ONPAGE=` server-render ever stops working, drive a browser instead: `browse open "<category>?n=0&NUM_ONPAGE=48"`, `browse wait load`, then query the DOM directly — `document.querySelectorAll("div.hotengine-shop-product-list-block")` and flag any whose `img.hotengine-shop-products-list-img-empty` exists (or whose `img.src` ends in `no_image_ru.png`). A bare (non-verified, non-proxied) Browserbase session is sufficient; this site needs no stealth. This path is ~100× slower/costlier than fetch and only needed as a safety net.

## Site-Specific Gotchas

- **Bare category pages are empty to a fetch.** `GET /ru/pers_shop/<slug>/` (no query string) returns the page chrome with **0 product blocks** — the grid is hydrated client-side. You *must* add `?n=0&NUM_ONPAGE=<n>` to get server-rendered products. This is the single thing that traps naive scrapers.
- **`/` redirects to `/ru/`.** The root issues a `301` to `/ru/`. The shop is multilingual (`/ru/`, `/en/`, `/ua/`, `/pl/`); the placeholder filename is locale-specific — Russian uses `/img/shop/no_image_ru.png`. On other locales expect `no_image_<lang>.png`; match on the `-empty` class (locale-agnostic) rather than the exact filename if you crawl non-RU trees.
- **Two reliable no-photo signals, prefer the class.** `img.hotengine-shop-products-list-img-empty` (added only to placeholder images) is the most robust signal; `src="/img/shop/no_image_ru.png"` is the secondary one. Photo cards carry the class **without** the `-empty` suffix and a `/upload/shop_catalog/...` src. (Caution when regex-parsing: matching the literal `class="hotengine-shop-products-list-img"` with a closing quote will *miss* photo cards' true class only if you assume it's unique — the `-empty` cards have a *second* class token after a space.)
- **Parent vs. leaf categories.** Of ~68 `/ru/pers_shop/<slug>/` links, roughly a third are parent groupings that render a subcategory list and zero products. They're harmless (0 rows) but don't mistake "0 products" for "0 no-photo products" on those — you simply haven't reached the leaves.
- **De-dupe by id.** The same product id can surface in multiple category paths; key your result set on `data-hotengine-marking-shop_catalog_page_id` to avoid double-counting.
- **Watch the body-size cap on big categories.** `browse cloud fetch` (and the sitemap at `https://autossport.store/sitemap.xml.gz` referenced in robots.txt) will 502 with "response body exceeded the maximum allowed size" on very large responses. Keep `NUM_ONPAGE` ≤ ~96 and paginate.
- **No anti-bot, no proxy required.** Verified: plain `browse cloud fetch` (no `--proxies`, no `--verified`) returns full server-rendered product HTML; the autobrowse cross-check used a bare remote session. Don't waste time/money on stealth or residential proxies here.
- **Correlation, not a rule:** in this snapshot all 43 no-photo products were also "Нет в наличии" (out of stock), and their embedded schema.org JSON-LD showed `availability: OutOfStock`. Out-of-stock is *not* a substitute signal for "no photo" — always test the image, not the stock state.
- **`robots.txt` Crawl-delay: 1** — keep to ≤ 1 request/second to stay polite; the full catalog crawl is a few hundred fetches.

## Expected Output

An `.xlsx` workbook (sheet "Товары без фото") with one row per no-photo product. The underlying data shape:

```json
{
  "site": "bagazhnikpro.store",
  "scanned_products": 25817,
  "no_photo_count": 43,
  "detection_signal": "img.hotengine-shop-products-list-img-empty  /  src=/img/shop/no_image_ru.png",
  "no_photo_products": [
    {
      "id": "326370",
      "sku": "PSV 123323",
      "title": "Набор автомобилиста \"Аварийный\" (огнетушитель, знак, аптечка )",
      "category": "organayzery",
      "url": "https://bagazhnikpro.store/ru/pers_shop/organayzery/326370.htm"
    },
    {
      "id": "99322",
      "sku": "м.00230",
      "title": "Защита MOTODOR радиатора BMW 6 (e63) 2003-2007 куп",
      "category": "zashitakarteradvigatelya",
      "url": "https://bagazhnikpro.store/ru/pers_shop/zashitakarteradvigatelya/99322.htm"
    },
    {
      "id": "327185",
      "sku": "Rola 59504",
      "title": "Багажник-корзина ROLA на поперечены 121,9x95,2x10,2 см",
      "category": "korziniiplatformi",
      "url": "https://bagazhnikpro.store/ru/pers_shop/korziniiplatformi/327185.htm"
    }
  ]
}
```

Excel column layout (one row per product):

| № | ID товара | Артикул (SKU) | Название | Категория | Ссылка |
|---|-----------|---------------|----------|-----------|--------|
| 1 | 326370 | PSV 123323 | Набор автомобилиста "Аварийный" … | organayzery | https://bagazhnikpro.store/ru/pers_shop/organayzery/326370.htm |

If a run finds no missing photos in the scanned scope, return `no_photo_count: 0` with an empty `no_photo_products` array and still emit an (empty-bodied) workbook with the header row.
