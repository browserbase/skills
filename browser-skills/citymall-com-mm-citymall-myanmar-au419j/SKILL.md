---
name: citymall-com-mm-citymall-myanmar-au419j
title: City Mall Myanmar — Browse Categories Across Yangon & Mandalay
description: >-
  Walk the full citymall.com.mm category taxonomy (groceries, fresh produce,
  beverages, electronics, fashion, beauty, pet supplies, home appliances and
  more), set a delivery township so inventory is correctly scoped to Yangon or
  Mandalay, and extract structured product cards.
website: citymall.com.mm
category: ecommerce-marketplace
tags:
  - myanmar
  - grocery
  - retail
  - marketplace
  - ecommerce
  - yangon
  - mandalay
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      No public REST/JSON API. SAP Hybris OCC endpoints (/rest/v2/citymall/...,
      /occ/v2/citymall/...) redirect to //v2/... and return the HTML SPA
      fallback, not JSON, for anonymous clients. Don't waste time probing them.
  - method: url-param
    rationale: >-
      Township scope is set via the citymall-township cookie (T{N}), not a URL
      parameter. The cookie is the closest thing to a deep-link — set it before
      any category fetch.
verified: true
proxies: true
---
# City Mall Myanmar — Browse Categories Across Yangon & Mandalay

## Purpose

Browse and extract the product catalog of citymall.com.mm — Myanmar's online department store covering groceries, fresh produce, beverages, electronics, fashion, beauty, pet supplies, home appliances and more. The skill walks the category taxonomy, sets a delivery township (Yangon or Mandalay or anywhere else in Myanmar) so the inventory is correctly scoped, and pulls structured product cards (name, price in MMK Kyat, image URL, seller, product detail URL). Read-only — no cart, no checkout, no account.

## When to Use

- A user wants to enumerate everyday-retail categories available for delivery in Yangon or Mandalay.
- A user wants product listings, prices, or brand assortment for a leaf category (Rice, Mobile Phones, Pet Feeding, Beauty/Cosmetics, etc.) scoped to a specific township.
- A user wants to compare which products / sellers are deliverable to Yangon vs Mandalay vs other regions (the catalog narrows per township).
- A user wants to confirm whether a long-tail product category (electronics, fashion, automotive, books) is sold on citymall.com.mm.

## Workflow

1. **Force English** — navigate to `https://www.citymall.com.mm/citymall/en/`. The bare `https://www.citymall.com.mm/` 302-redirects to `/citymall/my/` (Burmese). Always use the explicit `/en/` path; the `EN` toggle in the header does not always switch the storefront if you arrived from `/my/`.

2. **Set delivery township BEFORE listing products** — without this, the catalog falls back to a partial nationwide view and products are silently filtered out at the basket. Two equivalent paths:

   a. **UI flow** — click "Enter Township" in the top header. A modal dialog opens with two dependent dropdowns: `CITY*` (15 Myanmar states/regions, including `Yangon` and `Mandalay`) and `TOWNSHIP*` (populated after the city is picked). Pick city → pick township → click **ADD** (first time) or **CHANGE** (when re-editing). The page reloads with the new scope.

   b. **Cookie shortcut** — set `citymall-township=T{N}` directly. Each township has a numeric `T#` ID assigned by the server after selection. Examples observed:
      - `T2` = Yangon - Bahan
      - `T77` = Mandalay - Chanmyathazi
      - The state itself uses letter codes (`YGNR` = Yangon, `MDY` = Mandalay) in the `CITY*` select element but is not separately cookied; the township code alone is sufficient for scoping.

      To enumerate all `T#` codes, walk the city → township combinations via the modal (the township `<select>` options have `value="T{N}"` attributes; capture them on the fly). There is no public endpoint that returns the full city→township→T-code mapping.

3. **Top-level category taxonomy** — the homepage mega-menu (button labelled `Categories`) renders 18 top-level cards. The site uses **two parallel URL schemes** that resolve to the same category:
   - **Modern (id-prefix)**: `https://www.citymall.com.mm/citymall/en/c/id{HHHHHH}` where each 3-digit group is one level of hierarchy. E.g. `id01001001` = Grocery (`id01`) → Basic Grocery (`id01001`) → Rice (`id01001001`).
   - **Legacy (slugged)**: `https://www.citymall.com.mm/citymall/en/Categories/{Top-Slug}/{Sub-Slug}/{Leaf-Slug}/c/id{HHHHHH}` — auto-generated from `c/id...` redirect, includes URL-encoded `%26` for `&`.

   Confirmed top-level categories and their `id` codes (you can hit any of these directly):

   | Name | `id` code | Notes |
   |---|---|---|
   | Basic Grocery | `id01001` | Rice, Oil, Cream & Milk, Sugar, Soup, Noodle, Condiments, Baking Needs… |
   | Beverage | `id01002` | Tea, Coffee, Milk, Ready Drink, Fruit Juice, Cordial, Water |
   | Dairy, Bakery & Frozen | `id02` | Fresh Milk, Yogurt, Cheese, Eggs, Bakery, Frozen Product |
   | Fresh | `id03` | Vegetable & Flowers, Fruit, Poultry, Meat, Seafood, Frozen Meat |
   | Home & Living Lifestyle | `id05` | Parent of Tech & Electronics, Pet Essentials, Cleaning, Automotive subtrees |
   | Pet Essentials | `id05010` | Pet Feeding, Apparel, Furniture, Health & Grooming, Toys, Litter Box |
   | **Tech & Electronics** | `id05011` | Living-Room/Laundry/Air/Kitchen Appliances, Mobile Phones, Computer, Camera, Wearable |
   | Cleaning | `id05012` | Tissue, Household Cleaner, Laundry, Air Freshener, Pest Control |
   | Automotive | `id07001` | Automotive Parts & Accessories |
   | **Fashion** | `id08` | Men, Women, Unisex, Children Fashion (1,018+ SKUs as of capture) |
   | Sports & Activities | `id08005` | Football, Basketball, Swimming, Hiking, Cycling, Martial Arts |
   | Beauty & Personal Care | `id10` | Facial, Cosmetics, Oral, Body, Hair, Nail Care |
   | Breakfast & Snacks | `id01004` | Jam, Cereals, Snacks, Chocolate, Biscuit |
   | Health & Wellness | `id11001` | OTC Medicine, Prescription, Vitamins, Traditional, Lifestyle |
   | Mom, Baby & Toys | `id12` | Baby Nutrition, Diapers, Bath, Pregnancy Nutrition, Toys |
   | Media, Books & Stationery | `id13` | Music, Movies, Books, Musical Instruments, Stationery |
   | Religious | `id14` | Religious items, Donation Accessories |
   | Seasonal | `id14001` | Holiday/festival campaigns |

   The legacy sitemap at `https://www.citymall.com.mm/citymall/my/sitemap.xml` lists older 4-digit numeric category codes (e.g. `c/1101` for Rice). Those still resolve via 301 to the new `id`-prefix codes but are no longer canonical — prefer the `id` form.

4. **List products in a leaf category** — navigate to the leaf URL (e.g. `https://www.citymall.com.mm/citymall/en/c/id01001001` for Rice). The DOM is server-rendered (SAP Hybris) so `browse get markdown body` returns the full product grid synchronously after `browse wait load`. Each product card is a sequence in the markdown:

   ```
   ![{name}]({thumb_image_url})
   [{name}](/citymall/en/Categories/.../p/{sku})
   {weight}
   {price} Ks
   Sold by {seller_short_code}
   ```

   The simplest extraction regex (Node):

   ```js
   const re = /!\[([^\]]+)\]\(([^)]+)\)\s*\n*\s*\[ ([^\]]+)\]\(([^)]+\/p\/[^)]+)\)[\s\S]{0,200}?([0-9,]+ Ks)[\s\S]{0,200}?Sold by ([A-Z][^\n]+)/g;
   ```

   Headers near the top contain `{N} Results Found` (the total count for this category × township). Filter facets visible in the sidebar: **Brands**, **Merchant**, **Sub-Merchant** (`City Baby Club`, `City Mart`, `Market Place`, `Neighborhood`, `Ocean`), **Delivery** (`Express`, `Same Day`, `Standard`), **Price Range**, **COD available** checkbox.

5. **Open a product detail page** — append the `/p/{sku}` path. The SKU format is `cmhl_{10-digit}_{1}` for first-party (CMHL) items; third-party items use the seller's own SKU. SKU is URL-encoded in markdown as `cmhl%5F1000000000076%5F1`.

6. **Compare Yangon vs Mandalay** — set township to a Yangon township, hit a category, capture `Results Found` and product list. Then update township to a Mandalay township, refresh same URL. Observed differences:
   - **Result counts shrink** in Mandalay (Rice: 28 in Yangon-Bahan → 24 in Mandalay-Chanmyathazi).
   - **Prices are identical** for the same SKU.
   - **Top sellers narrow**: CMHL is universal; third-party sellers like `Yangon Development Company Lim` and many `Market Place` sub-merchants appear only for Yangon townships.

### Browser fallback

There is no public REST/JSON API. The endpoint paths `/rest/v2/citymall/...` and `/occ/v2/citymall/...` exist (SAP Hybris OCC) but all redirect to `//v2/...` (note double slash) and return HTML SPA fallbacks; direct JSON requests are not exposed to anonymous clients. The browser flow above IS the canonical path.

## Site-Specific Gotchas

- **Default language is Burmese.** `https://www.citymall.com.mm/` 302-redirects to `/citymall/my/`. Always navigate explicitly to `/citymall/en/` to get English; clicking the `EN` header toggle from a `/my/` page sometimes does not switch storefronts (it can land on `/citymall/my/` again with English-mixed text). The cookie `_citymallLanguageCookie=en` pins the choice once set.

- **Township is required for an accurate catalog.** Without `citymall-township` set, results show a nationwide superset; many items will appear available but get rejected at checkout because the seller does not ship to the unspecified location. Always set the township first.

- **The `T#` township codes are opaque server-issued IDs**, not derived from name or position. `T2` happens to be Bahan and `T77` happens to be Chanmyathazi, but there is no documented mapping — enumerate on the fly by walking the modal's CITY→TOWNSHIP `<select>` options and reading the `value=` attribute.

- **`robots.txt` is restrictive**: `Crawl-delay: 10`, `Request-rate: 1/10`, `Visit-time: 04:00-08:45 UTC` (i.e. ~10:30 AM – 3:15 PM Myanmar time, which is the off-peak window). It also explicitly blocks `/cart`, `/checkout`, `/my-account`. Honour the delay between category fetches if you are walking the full taxonomy — 10 seconds between successive `browse open` / `browse get markdown` calls. Stealth + residential proxy were used in the verified run and the site served all pages without challenge; reducing rate further is unnecessary.

- **Two URL schemes coexist**: legacy `/citymall/en/Categories/.../c/{4-or-6-digit-numeric}` (from `sitemap.xml`) and modern `/citymall/en/c/id{HHHHHH}` (from the live mega-menu). They 301-redirect into each other but the *modern* `id` form is the only one the SPA emits; prefer it.

- **`Tech & Electronics` has no top-level standalone URL** — in the mega-menu the parent link is `#` (JS-only expand). Its children (`id05011001` = Mobile Phones, `id05011002` = Computer, etc.) are reachable, and the synthetic parent URL `https://www.citymall.com.mm/citymall/en/c/id05011` DOES resolve and shows a 337-item rollup (under the legacy slug `Categories/Home-%26-Living-Lifestyle/Electronics`).

- **Citymall is a multi-seller marketplace**, not just a self-fulfilling grocer. `Sold by CMHL` = City Mart Holdings (first-party). Third-party sellers visible in extraction include `Yangon Development Company Lim`, `Belkin`, and dozens of "Market Place" sub-merchants. Sellers may have township restrictions independent of the catalog (i.e. a product card may render but `ADD TO CART` is disabled for some townships).

- **Prices are listed in MMK Kyat** with format `{X,XXX} Ks` (comma-thousands, lowercase trailing `Ks` with a single space). Always parse with `\d{1,3}(?:,\d{3})* Ks` — no currency symbol prefix. Some bulk grocery items show weight on a separate line (`5.0 Kilo`, `400.0 Gram`) above the price.

- **Image URLs are CDN-hosted on Azure Blob Storage** under `https://cmhlprodblobstorage1.blob.core.windows.net/sys-master-cmhlprodblobstorage1/...`. The thumbnail variant ends with `_Default-WorkingFormat_110Wx110H`; strip that suffix to get the full-resolution master image.

- **Customer-service hours are 7:00 AM – 8:30 PM Myanmar time** (per footer). Site availability outside those hours is identical, but if a user wants to call the listed numbers (09-765424332 / 09-765439378 / 09-765439379) they should respect the window.

- **No public JSON API** — confirmed. The Hybris OCC endpoints (`/rest/v2/...`, `/occ/v2/...`) all redirect to `//v2/...` and return HTML, not JSON, for anonymous clients. Don't waste time probing them; use the markdown extraction off `browse get markdown body` instead.

- **The product URL contains a URL-encoded SKU** (`/p/cmhl%5F1000000000076%5F1` where `%5F` = `_`). When reconstructing product URLs, encode the SKU's underscores.

## Expected Output

```json
{
  "domain": "citymall.com.mm",
  "scope": {
    "city": "Yangon",
    "township": "Bahan",
    "township_id": "T2",
    "language": "en"
  },
  "top_level_categories": [
    { "name": "Basic Grocery", "id_code": "id01001", "url": "https://www.citymall.com.mm/citymall/en/c/id01001" },
    { "name": "Beverage", "id_code": "id01002", "url": "https://www.citymall.com.mm/citymall/en/c/id01002" },
    { "name": "Dairy, Bakery & Frozen", "id_code": "id02", "url": "https://www.citymall.com.mm/citymall/en/c/id02" },
    { "name": "Fresh", "id_code": "id03", "url": "https://www.citymall.com.mm/citymall/en/c/id03" },
    { "name": "Home & Living Lifestyle", "id_code": "id05", "url": "https://www.citymall.com.mm/citymall/en/c/id05" },
    { "name": "Pet Essentials", "id_code": "id05010", "url": "https://www.citymall.com.mm/citymall/en/c/id05010" },
    { "name": "Tech & Electronics", "id_code": "id05011", "url": "https://www.citymall.com.mm/citymall/en/c/id05011" },
    { "name": "Cleaning", "id_code": "id05012", "url": "https://www.citymall.com.mm/citymall/en/c/id05012" },
    { "name": "Automotive", "id_code": "id07001", "url": "https://www.citymall.com.mm/citymall/en/c/id07001" },
    { "name": "Fashion", "id_code": "id08", "url": "https://www.citymall.com.mm/citymall/en/c/id08" },
    { "name": "Sports & Activities", "id_code": "id08005", "url": "https://www.citymall.com.mm/citymall/en/c/id08005" },
    { "name": "Beauty & Personal Care", "id_code": "id10", "url": "https://www.citymall.com.mm/citymall/en/c/id10" },
    { "name": "Breakfast & Snacks", "id_code": "id01004", "url": "https://www.citymall.com.mm/citymall/en/c/id01004" },
    { "name": "Health & Wellness", "id_code": "id11001", "url": "https://www.citymall.com.mm/citymall/en/c/id11001" },
    { "name": "Mom, Baby & Toys", "id_code": "id12", "url": "https://www.citymall.com.mm/citymall/en/c/id12" },
    { "name": "Media, Books & Stationery", "id_code": "id13", "url": "https://www.citymall.com.mm/citymall/en/c/id13" },
    { "name": "Religious", "id_code": "id14", "url": "https://www.citymall.com.mm/citymall/en/c/id14" },
    { "name": "Seasonal", "id_code": "id14001", "url": "https://www.citymall.com.mm/citymall/en/c/id14001" }
  ],
  "leaf_category_example": {
    "name": "Rice",
    "id_code": "id01001001",
    "url": "https://www.citymall.com.mm/citymall/en/c/id01001001",
    "results_found": 28,
    "filters_available": ["Brands", "Merchant", "Sub-Merchant", "Delivery", "Price Range", "COD available"]
  },
  "sample_products": [
    {
      "name": "Nursery Paw San Hmwe Rice 5KG",
      "weight": "5.0 Kilo",
      "price_mmk": 18000,
      "price_text": "18,000 Ks",
      "sold_by": "CMHL",
      "thumb_image_url": "https://cmhlprodblobstorage1.blob.core.windows.net/sys-master-cmhlprodblobstorage1/h1d/hda/8979317653534/cmhl_1000000000076_1_hero.jpg_Default-WorkingFormat_110Wx110H",
      "product_url": "https://www.citymall.com.mm/citymall/en/Categories/Grocery/Basic-Grocery/Rice/Paw-San-Hmwe-Rice/Nursery-Paw-San-Hmwe-Rice-5KG/p/cmhl%5F1000000000076%5F1",
      "sku": "cmhl_1000000000076_1"
    },
    {
      "name": "Belkin HDMI Cable Silver Plate 2M Black F3Y020bt2M",
      "category": "Tech & Electronics",
      "price_mmk": 45000,
      "price_text": "45,000 Ks",
      "sold_by": "Belkin",
      "product_url": "https://www.citymall.com.mm/citymall/en/Categories/Home-%26-Living-Lifestyle/Electronics/.../p/..."
    },
    {
      "name": "Chacca's Pet Haven Chicken Bone Meal Powder",
      "category": "Pet Essentials",
      "price_mmk": 15000,
      "sold_by": "Market Place sub-merchant"
    }
  ],
  "yangon_vs_mandalay_comparison": {
    "category_tested": "Rice (id01001001)",
    "yangon_bahan": { "township_id": "T2", "results_found": 28 },
    "mandalay_chanmyathazi": { "township_id": "T77", "results_found": 24 },
    "price_delta": "none — identical prices for shared SKUs",
    "catalog_overlap": "Mandalay is a strict subset of the Yangon catalog for Rice; Yangon-only sellers (Market Place, Neighborhood, Ocean sub-merchants) drop out"
  },
  "coverage_confirmation": {
    "fresh_produce": "present — Fresh (id03) covers Vegetable & Flowers, Fruit, Poultry, Meat, Seafood, Frozen",
    "beverages": "present — Beverage (id01002): Tea, Coffee, Ready Drink, Fruit Juice, Water",
    "electronics": "present — Tech & Electronics (id05011), 337 items in Mandalay-Chanmyathazi, includes Mobile Phones, Tablets, Computer Components, Camera, Wearable",
    "fashion": "present — Fashion (id08), 1,018+ items covering Men/Women/Unisex/Children",
    "beauty": "present — Beauty & Personal Care (id10): Facial, Cosmetics, Oral, Body, Hair, Nail",
    "pet_supplies": "present — Pet Essentials (id05010), 180 items: Pet Feeding, Apparel, Furniture, Toys, Litter",
    "home_appliances": "present — under Tech & Electronics → Living Room / Laundry / Air & Cooling / Kitchen Appliances",
    "books_media": "present — Media, Books & Stationery (id13)"
  },
  "session_cookies_relevant": {
    "citymall-township": "T{N} — set after township modal submit; SCOPES INVENTORY",
    "_citymallLanguageCookie": "en | my — pins storefront language"
  }
}
```

For a category where all sub-merchants withdraw delivery to the chosen township the page renders successfully but `Results Found` reads `0 Results Found` and the product grid is empty — emit `{ "results_found": 0, "sample_products": [] }` rather than treating it as an error.
