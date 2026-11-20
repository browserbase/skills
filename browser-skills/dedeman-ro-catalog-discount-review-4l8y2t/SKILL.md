---
name: dedeman-ro-catalog-discount-review-4l8y2t
title: Dedeman Catalog and Discount Review
description: >-
  Enumerate the full Dedeman.ro product catalog via XML sitemap and identify
  products currently marked Super Preț (on discount) per category or search
  query, returning SKU, canonical URL, title, regular price, discounted price,
  and savings.
website: dedeman.ro
category: ecommerce
tags:
  - ecommerce
  - diy
  - home-improvement
  - romania
  - magento
  - catalog
  - discounts
source: 'browserbase: agent-runtime 2026-05-27'
updated: '2026-05-27'
recommended_method: hybrid
alternative_methods:
  - method: fetch
    rationale: >-
      The sitemap index (sitemap.xml, ~3 KB) is fetchable via browse cloud fetch
      and gives the full per-product URL list once you walk into each
      sitemap-productsN.xml. The per-file sitemaps are over the cheap-fetch size
      cap (~46 MB rendered) so they require a browser session — hence hybrid not
      pure fetch.
  - method: browser
    rationale: >-
      Discount detection requires the rendered listing grid (?order=discount
      sort puts Super Preț products first; data-price-amount attributes carry
      old/new prices). The /xapiv2 internal API returns 403 Acces restrictionat
      so there is no JSON shortcut for prices.
  - method: api
    rationale: >-
      Confirmed blocked. /xapiv2 and /api/ paths (referenced in robots.txt)
      return a static Acces restrictionat 403 page even with stealth +
      residential proxy — they're locked to the official mobile app. Do not
      waste time probing them.
verified: true
proxies: true
---
# Dedeman Catalog and Discount Review

## Purpose

Enumerate the full Dedeman.ro product catalog and identify which products are currently on discount (carry a "Super Preț" tag). Returns: (1) a list of canonical product URLs and SKUs across the whole store, and (2) per-category lists of discounted products with regular price, discounted price, and computed savings. Read-only — never adds to cart, never checks out.

## When to Use

- "Give me everything Dedeman sells in category X, and which of those are reduced right now."
- Daily monitoring of new "Super Preț" promotions (homepage + per-category).
- Bulk catalog snapshots for price-tracking dashboards.
- Pre-research before a customer asks "is there a sale on garden chairs?"

## Workflow

Dedeman.ro runs on Magento 2. There is **no public JSON API** (`/xapiv2` and `/api/` return `403 Acces restrictionat`). The optimal pattern is **hybrid**:

- **Catalog enumeration** → fetch the public XML sitemaps. Cheap, no JS, no auth, no proxy — but each file is ~46 MB rendered, which is over `browse cloud fetch`'s ~1 MB cap, so route the sitemap fetch through a `browse open` browser session and read `<loc>` tags from the rendered DOM.
- **Discount detection** → there is no `?promo=1` filter, but the listing-page sort dropdown exposes `?order=discount` (label: "Oferte speciale"), which puts every product carrying a `class="special-price"` block at the top of the result set. Paginate until the per-page Super-Preț count drops below the page size; that's the end of the discounted tier.

### 1. Open a Browserbase session

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$SID"
```

`--verified --proxies` is recommended (Romanian eCommerce, US IPs occasionally hit a cookie/region prompt or a Fastly cache miss path). The site is **not** Akamai-protected at the page level and most pages render cleanly without stealth, but the API endpoint is restricted, and large sitemaps fail without a real browser.

### 2. Enumerate the full catalog from the sitemap

```bash
# Get the sitemap index (small, ~3 KB — browse cloud fetch is fine)
browse cloud fetch "https://www.dedeman.ro/media/sitemap/sitemap.xml" --proxies
```

The index lists ~25 child sitemaps:
- `sitemap-categories0.xml` — category landing URLs (`/ro/<slug>/c/<id>`)
- `sitemap-products0.xml` … `sitemap-products24.xml` — ~7,000-8,000 product URLs each, ~200k products total
- `sitemap-cms0.xml` — informational pages

Each `sitemap-productsN.xml` is too large for `browse cloud fetch` (returns `502 The response body exceeded the maximum allowed size`). Use the browser session:

```bash
browse open "https://www.dedeman.ro/media/sitemap/sitemap-products0.xml" --remote
browse get html body --remote > /tmp/sp0.json
node -e "
  const j = JSON.parse(require('fs').readFileSync('/tmp/sp0.json','utf8').slice(require('fs').readFileSync('/tmp/sp0.json','utf8').indexOf('{')));
  const urls = j.html.match(/<loc>([^<]+)<\\/loc>/g).map(s => s.slice(5, -6));
  console.log(urls.length, 'URLs');
"
```

Canonical product URL shape: `https://www.dedeman.ro/ro/<kebab-title>/p/<sku>` — the trailing 6- to 7-digit SKU after `/p/` is the stable Magento product ID.

### 3. List discounted products in a category

Category URL shape: `https://www.dedeman.ro/ro/<slug>/c/<categoryId>` (e.g. `/ro/scaune/c/94`, `/ro/gradina/c/17`). To get only the discounted tier, sort by `order=discount` and bump the page size:

```bash
browse open "https://www.dedeman.ro/ro/scaune/c/94?order=discount&per_page=96&page=1" --remote
browse get html body --remote > /tmp/page.json
```

`per_page` accepts `24 | 36 | 48 | 60 | 72 | 96` — use **96** to cut paginations by ~25%. The dropdown's underlying sort options are visible in the page HTML as `order=availability` (default), `order=price-asc`, `order=price-desc`, `order=date`, `order=discount`.

### 4. Parse the product grid

Each grid card is a `<div class="product-item-info" id="product-item-info_<internalId>">` block. Inside:

- **Canonical URL + SKU**: `<a class="product-item-link" href="https://www.dedeman.ro/ro/<slug>/p/<sku>">` (the same anchor wraps the title text).
- **Title**: text content of the `.product-item-link` anchor.
- **Old price (when discounted)**: `<span class="old-price">` ⊃ `<span data-price-amount="<float>" data-price-type="oldPrice">`.
- **Discounted price**: `<span class="special-price">` ⊃ `<span class="price-label">Super Preț</span>` + `<span data-price-amount="<float>" data-price-type="finalPrice">`.
- **Regular price (non-discount)**: a single `<span class="price-container price-final_price tax weee">` with `data-price-type="finalPrice"` and no `old-price`/`special-price` siblings.

A product is on discount **iff** the card contains both `class="old-price"` and `class="special-price"` (equivalently: contains the string "Super Preț"). There is **only one** discount label across the whole site — `Super Preț`. No other badge variants exist.

```js
const re = /<div class="product-item-info" id="product-item-info_(\d+)"[\s\S]*?<\/li>/g;
let m, products = [];
while ((m = re.exec(html))) {
  const block = m[0];
  const url = (block.match(/href="(https:\/\/www\.dedeman\.ro\/ro\/[^"]+\/p\/\d+)"/) || [])[1];
  if (!url) continue;
  const sku = url.match(/\/p\/(\d+)/)[1];
  const title = (block.match(/class="product-item-link"[^>]*>([^<]+)</) || [])[1];
  const oldPrice    = parseFloat((block.match(/old-price[\s\S]*?data-price-amount="([\d.]+)"/) || [])[1] || 'NaN');
  const finalPrice  = parseFloat((block.match(/special-price[\s\S]*?data-price-amount="([\d.]+)"/) || [])[1] || 'NaN');
  const onDiscount  = block.includes('Super Preț');
  products.push({ sku, url, title, on_discount: onDiscount,
                  regular_price: isNaN(oldPrice) ? null : oldPrice,
                  discounted_price: isNaN(finalPrice) ? null : finalPrice });
}
```

### 5. Paginate until the Super-Preț tier ends

`order=discount` is a **sort, not a filter** — discounted products are at the top, non-discounted continue afterwards. Count Super-Preț occurrences per page; when that count drops below `per_page`, that's the boundary page (discounted tier ends mid-page). When the count is 0, you're past the discount tier.

```bash
# pseudocode
N=1
while true:
  open page N
  super_count = count "Super Preț" in html
  if super_count == 0: break  # discounts exhausted
  if super_count < per_page:   # boundary page — capture only the first super_count cards
    capture and break
  N += 1
```

Concrete example (category `c/94` "Scaune", 2,104 total products, `per_page=72`): pages 1-4 each carry 72/72 Super-Preț cards, page 5 carries 17/72, page 6+ carry 0 → ~305 discounted products total (~14.5% of the category). With `per_page=96`, pages 1-3 carry 96/96, page 4 is the boundary.

### 6. Optional: catalog flyers and the homepage carousel

- **`https://catalog.dedeman.ro/oferte-catalog/`** is a separate subdomain hosting Dedeman's printed flyer/catalog (e.g. `catalog-mai-2026`, `catalog-iunie-2025`) as flipbook-style HTML — useful when you want only the editorially curated headline promotions instead of every Super-Preț tag.
- **Homepage `## Oferte de sezon` carousel** (`https://www.dedeman.ro/ro`) — a 14-product curated rotation with the same `special-price` / `old-price` markup, parseable with the same regex as step 4. Cheap quick-look at "what's promoted right now."

### 7. Search-page variant

The same `order=discount` works on full-text search: `https://www.dedeman.ro/ro/catalogsearch/result/v2?q=<term>&order=discount&per_page=96` returns the same grid markup and discount sorting. Useful for "what's on sale that matches <keyword>" without category-walking.

## Site-Specific Gotchas

- **`/xapiv2` and `/api/` are blocked** with `403 Acces restrictionat` ("Access restricted") — these are real internal endpoints (referenced in `robots.txt`) but they're locked to the official mobile app. Do not waste time probing them; they return a static "Acces restrictionat" HTML page even with stealth + residential proxy.
- **`/ro/oferte` returns 404** — there is **no single "all discounts" landing page**. The discount surface is per-category (or per-search) via `?order=discount`, plus the homepage carousel + `catalog.dedeman.ro` flyers.
- **Discount is a sort, not a filter.** `?order=discount` puts all Super-Preț products first, then non-discounted follow. Don't naively scrape all pages — count `Super Preț` tags per page and stop when the count drops below `per_page`.
- **Only one discount label exists: `Super Preț`.** There is no "Top Preț", "Reducere", "Lichidare", or rotating-promo label. If a card has `<span class="price-label">Super Preț</span>` it's on sale; otherwise it isn't.
- **Detect a discount via markup, not text.** The reliable signal is the *presence* of both `class="old-price"` and `class="special-price"` in the same `product-item-info_<id>` block — the textual label "Super Preț" can be hidden by CSS in some carousel variants but the markup is always present.
- **`data-price-amount` is the source of truth for prices.** The visible price text uses thousand-separator dots and Romanian decimal commas in some places; the `data-price-amount` attribute is always a plain JS-parseable float (`"879.00"`, `"2499.01"`). Use it instead of regex on the displayed string.
- **`per_page=96` is the maximum.** Allowed values: `24 | 36 | 48 | 60 | 72 | 96`. Default is `72`. Asking for anything else silently falls back to `72`. Always pass `per_page=96` to minimize pagination requests.
- **Sitemap files are over `browse cloud fetch`'s body-size limit.** Each `sitemap-productsN.xml` renders to ~46 MB of DOM and returns `502 The response body exceeded the maximum allowed size` from the cheap-fetch path. Use `browse open` + `browse get html body --remote` on the sitemap URL — the browser handles the XML and exposes `<loc>` tags as regular text nodes you can regex.
- **Direct `curl` from the sandbox is network-blocked.** Outbound fetches must route through `browse cloud fetch` (size-limited) or a Browserbase session.
- **Category landing pages vs. leaf categories.** Top-level pages like `/ro/gradina/c/17` show a subcategory navigation hub (no product grid). Leaf categories like `/ro/scaune/c/94` are the ones with the product grid + `?order=discount` sort. The full leaf-category list lives in `sitemap-categories0.xml` — walk it and try `?order=discount&page=1`; if the response has `product-item-info_` matches, it's a leaf.
- **Pagination caps.** Category total counts are visible in the `(NNNN produse)` breadcrumb-area text. Use that + your chosen `per_page` to bound the loop, but you generally do not need to walk past the discount tier — stop on the first page with `Super Preț` count == 0.
- **Total category count is the *whole* category, not the discounted subset.** "2104 produse" on `/ro/scaune/c/94?order=discount` is the full chair catalog, not the discount count. The site does not publish a per-category discount count anywhere — you derive it from the pagination walk in step 5.
- **Homepage carousel duplicates entries**: the `Oferte de sezon` carousel renders the same 14 products three times in sequence (Magento's carousel HTML clones items to enable infinite scroll). Dedupe by SKU when extracting from the homepage.
- **No price localization / store-level toggles affect the listing prices.** The "Verifică disponibilitatea în magazin" widget only filters availability, not price — the `data-price-amount` value is the national list price.
- **US-IP cookie banner.** First-visit from a non-RO IP shows a cookie banner that overlays the page. `browse get markdown body` will include its text but the grid below is still in the DOM and parseable from `browse get html body`. The banner does not block scraping.

## Expected Output

The skill produces two JSON shapes (one per sub-task).

**1. Full catalog enumeration:**

```json
{
  "total_products": 198421,
  "sitemaps_walked": 25,
  "categories_total": 1832,
  "sample_products": [
    {
      "sku": "5006949",
      "url": "https://www.dedeman.ro/ro/placa-gips-carton-tip-f-protectie-foc-rigips-rf-12-5-x-1200-x-2000-mm/p/5006949"
    },
    {
      "sku": "1012083",
      "url": "https://www.dedeman.ro/ro/stergator-parbriz-auto-vivauto-flat-flexibil-18-inch-45-cm-1-bucata/p/1012083"
    }
  ]
}
```

**2. Discount review for one category:**

```json
{
  "category": {
    "id": "94",
    "slug": "scaune",
    "url": "https://www.dedeman.ro/ro/scaune/c/94",
    "total_products": 2104
  },
  "discounted_count": 305,
  "discount_share": 0.145,
  "discounted_products": [
    {
      "sku": "8052204",
      "title": "Scaun birou directorial cu suport lombar si tetiera Grandio Mob LA-829AH, mesh, negru",
      "url": "https://www.dedeman.ro/ro/scaun-birou-directorial-cu-suport-lombar-si-tetiera-grandio-mob-la-829ah-mesh-negru/p/8052204",
      "regular_price": 879.00,
      "discounted_price": 549.00,
      "currency": "RON",
      "unit": "bucată",
      "savings_abs": 330.00,
      "savings_pct": 0.376,
      "label": "Super Preț"
    },
    {
      "sku": "8065739",
      "title": "Scaun gaming cu perna lombara si perna cervicala Bellem, rotativ, imitatie piele, negru + portocaliu",
      "url": "https://www.dedeman.ro/ro/scaun-gaming-cu-perna-lombara-si-perna-cervicala-bellem-rotativ-imitatie-piele-negru-portocaliu/p/8065739",
      "regular_price": 899.00,
      "discounted_price": 649.00,
      "currency": "RON",
      "unit": "bucată",
      "savings_abs": 250.00,
      "savings_pct": 0.278,
      "label": "Super Preț"
    }
  ]
}
```

**3. Discount-search variant (`/catalogsearch/result/v2?q=...&order=discount`):**

```json
{
  "query": "lampa",
  "total_results": 802,
  "discounted_count": 71,
  "discounted_products": [ /* same shape as above */ ]
}
```

**4. Quick "headline promotions" output (homepage carousel only):**

```json
{
  "source": "homepage_carousel",
  "section": "Oferte de sezon",
  "products": [
    {
      "sku": "7028126",
      "title": "Pergola metalica pentru gradina, arcada trandafiri cataratori / suport flori, 140 x 35 x 250 cm",
      "regular_price": 199.90,
      "discounted_price": 181.90,
      "url": "https://www.dedeman.ro/ro/pergola-metalica-pentru-gradina-arcada-trandafiri-cataratori/-suport-flori-140-x-35-x-250-cm/p/7028126"
    }
  ]
}
```

All prices are in Romanian Lei (RON). The `unit` field is what the site shows after the slash (`/bucată`, `/set`, `/m²`, `/saco`, etc.) — extract it from the `<span class="price-wrapper price-sale-unit">/<unit></span>` element in the same price-box.
