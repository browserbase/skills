---
name: finelysourced-com-filter-clean-label-products-7xpu9m
title: FinelySourced Clean-Label Product Filter
description: >-
  Filter FinelySourced.com's curated clean-label catalog (~140 products) across
  food, supplements, personal care, home, wellness, and apparel using
  lifestyle/ingredient tags (seed-oil free, organic, non-GMO, glyphosate-free,
  grass-fed, regenerative, etc.), categories, free-text search, and brand.
  Returns curated recommendations with title, brand, breadcrumb category, key
  features, certifications, tags, description, and outbound vendor link.
website: finelysourced.com
category: marketplace
tags:
  - clean-label
  - marketplace
  - directory
  - wellness
  - seed-oil-free
  - organic
  - read-only
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: hybrid
alternative_methods:
  - method: api
    rationale: >-
      /api/search/suggestions?q= returns a 3KB JSON with the seven top-level
      categories and live product counts in one call — ideal for catalog sizing.
      The same endpoint's products[] field is a fixed list of recent additions
      and ignores the q parameter, so it is NOT a search API.
  - method: url-param
    rationale: >-
      All filter dimensions are single-key URL routes (/categories/{slug},
      /tags/{Tag%20Name}, /brands/{slug}, /search?q=, /products?page=N) served
      as plain HTML behind Cloudflare with no auth, no JS-only rendering, and no
      anti-bot. browse cloud fetch is the cheapest, fastest path. Combine
      filters by client-side slug intersection — the server has no multi-key
      filter syntax.
  - method: browser
    rationale: >-
      Browser fallback works (the same URLs render identically in a real
      session) but pays a ~10–100× cost premium with no functional gain — the
      data is fully present in the static HTML response. Use a browser only for
      screenshots or if the Fetch path is ever blocked.
verified: false
proxies: false
---
# FinelySourced Clean-Label Product Filter

## Purpose

Given a clean-label intent — one or more lifestyle/ingredient filters (seed-oil free, organic, non-GMO, glyphosate-free, grass-fed, regenerative, paleo, keto, gluten-free, etc.), an optional category (food, supplements, personal care, home, wellness, apparel, fast food/restaurants), an optional free-text term, and an optional brand — return a curated list of matching products from FinelySourced.com with title, brand, breadcrumb category, key features / certification badges, tag list, description, and the vendor's outbound buy link. Read-only; never submits the "Suggest a product" form, the newsletter form, the Sign In/Up form, or any other write surface.

## When to Use

- "Find seed-oil-free + organic + grass-fed snacks I can actually buy."
- "Show clean-label deodorants / toothpastes / cookware that are non-toxic and aluminum-free."
- "Top-rated tallow products on a clean-label directory, with vendor links."
- "Intersect two or more dietary filters (e.g. paleo + keto + dairy-free) across the catalog."
- Surfacing the small (~140-product), human-curated FinelySourced catalog as discovery, not a price-comparison shop. (FinelySourced does not store retail prices — `Current Offers` are referral-code discounts only.)

## Workflow

FinelySourced.com is a small, public, curated directory (~140 products, ~58 sub-categories, hundreds of single-word tags, 9 brand pages). The web UI is plain server-rendered HTML behind Cloudflare with **no auth, no JS-only routes, no anti-bot**, so `browse cloud fetch` is the optimal path. A residential proxy is not required and stealth is not required. A browser is only needed for screenshots — not for any data extraction. Pagination is server-side via `?page=N`; multi-filter intersection is a client-side join because the site exposes **single-dimension URL filters only** (one category OR one tag OR one brand OR one free-text query per URL).

The flow has three layers — pick one or combine them client-side:

### 1. Resolve the filter intent into FinelySourced URL primitives

| User filter dimension | URL primitive | Example |
|---|---|---|
| Top-level category | `/categories/{slug}?page=N&sort=newest\|popular\|name` | `/categories/food-beverages?sort=popular` |
| Sub-category (e.g. oils-fats, deodorants) | Same `/categories/{slug}` route — 58 valid slugs | `/categories/deodorants` |
| Single ingredient/lifestyle tag | `/tags/{Tag%20Name}?page=N` — **Title Case, URL-encoded spaces, no kebab-case** | `/tags/Seed%20Oil%20Free`, `/tags/Non-Gmo`, `/tags/Grass%20Fed`, `/tags/Regenerative`, `/tags/Glyphosate-Free`, `/tags/Usda%20Organic` |
| Brand | `/brands/{slug}` — 9 known slugs (lineage-provisions, paleovalley-via-product, maple-hill, raw-farm-usa, white-oak-pastures, yonder-way-farm, alexandre-family-farm, chroma, cowboy-colostrum, greco-gum) | `/brands/lineage-provisions` |
| Free-text keyword | `/search?q={url-encoded}&sort=relevance\|name\|rating\|newest` | `/search?q=tallow&sort=rating` |
| Entire catalog | `/products?page=N` (~18 per page, 8 pages, ~140 products total) | `/products?page=3` |

**Use `/api/search/suggestions?q=` to discover the seven top-level categories with live `product_count` in one ~3KB JSON call.** This is the only cheap catalog-size endpoint. The `q=` parameter is silently ignored — the products array is fixed (most-recently-added 8) and is **not** keyword-filtered, so it is NOT a search API. Treat it as a category-count + recents probe only.

```bash
curl -s 'https://finelysourced.com/api/search/suggestions?q=' \
  | jq '.categories[] | {slug, product_count}'
# → food-beverages:98  home-kitchen:10  personal-care:9
#   clothing-apparel:8  supplements-wellness:7  pantry-staples:3  fast-food-restaurants:2
```

### 2. Fetch the candidate product slug set

For each URL primitive selected in step 1, `browse cloud fetch` the HTML. Each listing page (`/categories/*`, `/tags/*`, `/brands/*`, `/search`, `/products`) renders product cards as `<a href="https://finelysourced.com/products/{slug}">…</a>`. Extract slugs and de-duplicate; ignore the `/products/suggest` entry (it's the "Suggest a product" CTA, not a real product).

```bash
browse cloud fetch "https://finelysourced.com/tags/Seed%20Oil%20Free" \
  | grep -oE 'href="https://finelysourced\.com/products/[a-z0-9-]+"' \
  | sort -u | grep -v 'products/suggest'
```

Category pages (`/categories/{slug}`) **do** embed a clean `ItemList` JSON-LD block at the page footer — parse it for `{position, name, url}` triples when present:

```bash
browse cloud fetch "https://finelysourced.com/categories/oils-fats" \
  | python3 -c "import sys,re,json; b=re.findall(r'<script type=\"application/ld\+json\">(.*?)</script>', sys.stdin.read(), re.DOTALL); d=json.loads(b[0]); print(json.dumps([g for g in d['@graph'] if g.get('@type')=='ItemList'], indent=2))"
```

Tag pages, brand pages, and `/search` pages do **not** include an `ItemList` block — fall back to anchor-href extraction for those.

**To combine multiple filters (e.g. "seed-oil free AND organic AND grass-fed in oils-fats"), fetch each filter's slug set separately and intersect them client-side.** The site has no multi-filter URL syntax — `?tag=`, `?tags[]=`, `?filter=`, `?cert=` are all silently dropped. Pick the smallest-cardinality dimension first (usually the rarest tag like `/tags/Glyphosate-Free` or `/tags/Regenerative%20Farming`) so you minimize per-product detail fetches in step 3.

### 3. Hydrate each candidate slug into a curated recommendation

For each unique slug in the intersected set, `browse cloud fetch` `/products/{slug}` and extract these fields from the rendered HTML — they are all stable selectors as of 2026-05-19:

| Field | Extraction pattern |
|---|---|
| `title` | `<h1 class="…">TITLE</h1>` |
| `description_short` | `<p class="lg:text-sm …">TEXT</p>` immediately after the `<h1>` (also available as the `<meta name="description">` content, truncated to ~200 chars) |
| `description_about` | The first `<p>` inside the `>About</h…>` block (richer, full sentences) |
| `breadcrumb_category` | Anchor text in `<nav>` breadcrumb — usually `Home › Products › {Top Cat} › {Sub Cat}` (the only place the product's actual category is in the page) |
| `brand` | `<a href="https://finelysourced.com/brands/{slug}">…</a>` near the H1 (may be absent if no dedicated brand page) |
| `brand_logo` | `<img …src="https://images.finelysourced.com/brands/logos/…">` next to title |
| `tags[]` | All `href="https://finelysourced.com/tags/{TagName}"` inside `id="tags-section"` — URL-decode the names |
| `key_features[]` | All `<span class="text-gray-700 text-sm">FEATURE</span>` inside the "Key Features" block (these are the green-checkmark bullets like "Glyphosate Free", "Rich in CLA", "Aluminum-Free") — **richer than the tag list, often includes ingredient-level callouts not surfaced as `/tags/*` links** |
| `certifications[]` | Plain-text labels inside the "Certifications & Badges" block (e.g. "Seed-Oil Free", "Glyphosate Free", "USDA Organic") — parse by stripping HTML tags inside that section |
| `current_offers[]` | The "Current Offers" block; usually a referral-code discount tied to the `FINELYSOURCED` code (e.g. `"10% off on orders over $99 for new customers"`). **Not a retail price** — FinelySourced does not store prices |
| `vendor_url` | `<a class="… Visit Website Button" href="HTTPS://…?utm_source=finelysourced.com&utm_medium=directory&utm_campaign=referral">` — the canonical outbound buy link |
| `finelysourced_url` | `https://finelysourced.com/products/{slug}` (the page itself, for citation back) |

Emit one record per surviving slug. Rank by a heuristic of the caller's choice — `popular` sort on the upstream category, `rating` sort on a search query, or match-count across the user's requested filter tags.

### Browser fallback (only needed if `browse cloud fetch` is blocked at some future point)

The same primitives work in a regular browser session — `browse open --remote --session "$sid"` each URL and snapshot/screenshot the rendered page. Category and tag pagination is wired to JavaScript that re-fetches the same URL and swaps the `#product-results` div in-place, so server-side rendering with `?page=N` query strings continues to work without JS execution. There is no infinite-scroll or login wall to defeat.

## Site-Specific Gotchas

- **No multi-dimensional URL filters.** `/categories/oils-fats?tag=Seed%20Oil%20Free`, `/tags/Organic?category=supplements-wellness`, `?certifications[]=organic`, `?filter=...` — all silently dropped. The server returns the unfiltered single-dimension page in every case. Client-side slug intersection is the only path. Verified 2026-05-19 against `oils-fats?tag=Seed Oil Free` → byte-identical to bare `oils-fats`.
- **`/api/search/suggestions?q=X` ignores `q` entirely.** Same 3324-byte response for `q=cookie`, `q=tallow`, `q=zzzzzz`, and `q=`. The `products[]` array is a fixed list of the 8 most-recently-added products; the `categories[]` array is the seven top-level categories with `product_count` totals. Useful for catalog sizing, useless for keyword search. Use `/search?q=…` (HTML) for real keyword search.
- **`/api/search?q=…` returns 403.** Confirmed blocked behind an auth check — don't bother probing it. Use the HTML `/search?q=…` route instead.
- **`/api/products` and `/api/categories` don't exist.** Both 404 to the SPA fallback HTML.
- **Tag URLs are Title Case with literal `%20`, not lowercase-kebab.** `/tags/Seed%20Oil%20Free` works; `/tags/seed-oil-free` returns the 404 SPA fallback. Discover the canonical name from `/tags` (the index page) — it's the anchor text exactly. Some tags use hyphens (e.g. `/tags/Non-Gmo`, `/tags/Gluten-Free`, `/tags/Glyphosate-Free`); others use `%20` (e.g. `/tags/Seed%20Oil%20Free`, `/tags/Grass%20Fed`, `/tags/Usda%20Organic`). When unsure, scrape `/tags` once and cache the map.
- **Pagination is `?page=N` and only renders when `count > 18`.** Sub-categories like `oils-fats` (7 products) or `supplements-wellness` (7) return a single un-paginated page; top-level `food-beverages` (98) paginates 1–6 at 18/page. Tag pages paginate at 12/page (verified on `/tags/Organic`). `/products` paginates at 18/page, pages 1–8. Always check the rendered pagination nav before assuming you've exhausted a list.
- **Sort options differ by route.** `/categories/{slug}` accepts `?sort=newest|popular|name` (default newest). `/search?q=…` accepts `?sort=relevance|name|rating|newest` (default relevance). Tag and brand pages have no sort UI and silently ignore the param — `/tags/Organic?sort=popular` is byte-identical to `/tags/Organic`.
- **No retail price field exists anywhere.** Product pages show only `Current Offers` — referral-code discount text tied to the `FINELYSOURCED` partner code (e.g. "10% off on orders over $99 for new customers"). The `$99` is the discount threshold, not the product price. If the caller asked for a price filter, document that the site can't satisfy it and either drop the filter or fall through to the vendor's `vendor_url` to fetch real price.
- **The `Brand` link on a product page does not always resolve.** Only 9 brand slugs render a real brand page (`alexandre-family-farm`, `chroma`, `cowboy-colostrum`, `greco-gum`, `lineage-provisions`, `maple-hill`, `raw-farm-usa`, `white-oak-pastures`, `yonder-way-farm`). Other brands (e.g. `/brands/paleovalley`) 404 even when the product is clearly a Paleovalley product — the brand directory is much smaller than the product directory. Treat brand pages as a discovery dimension, not a guaranteed reverse-lookup.
- **`/products/suggest` is the "Suggest a Product" CTA, not a product.** It appears in every category page and search result list as the trailing card. Always filter it from the candidate slug set.
- **External vendor links carry a `?utm_source=finelysourced.com&utm_medium=directory&utm_campaign=referral` suffix.** Some links also have a `?selling_plan=…` or `?FINELYSOURCED` discount-code query appended. Pass through verbatim — stripping the UTM may break vendor attribution.
- **Cloudflare is in front but does not gate.** All `browse cloud fetch` calls returned 200 from a bare (no-stealth, no-proxy) us-west-2 client; the `Set-Cookie: XSRF-TOKEN, finelysourced_session` is for the future POST forms (newsletter, suggest, login) and isn't required for GETs. Don't waste budget on `--proxies` / `--verified`.
- **Total catalog is ~140 products as of 2026-05-19.** This is a small, hand-curated directory; for popular filters (`/tags/Seed%20Oil%20Free` returned 8, `/tags/Organic` returned ~42 across 4 pages), exhaustive enumeration is cheap (≤ 10 page fetches). Don't paginate aggressively past the visible page count — pages beyond the last rendered link return 200 with zero products, not a 404.
- **Product detail pages occasionally include a `Promote your product` CTA labelled with a "Reach more customers" call to action.** This is an ad slot for vendors, not part of the product data. The block uses generic text like "Reach users exploring {tags}" — ignore it.

## Expected Output

```json
{
  "query": {
    "tags_required": ["Seed Oil Free", "Grass Fed", "Regenerative"],
    "categories": ["food-beverages"],
    "text": null,
    "brand": null,
    "sort": "popular"
  },
  "summary": {
    "catalog_total": 137,
    "catalog_by_category": {
      "food-beverages": 98,
      "home-kitchen": 10,
      "personal-care": 9,
      "clothing-apparel": 8,
      "supplements-wellness": 7,
      "pantry-staples": 3,
      "fast-food-restaurants": 2
    },
    "candidates_per_filter": {
      "tags/Seed%20Oil%20Free": 8,
      "tags/Grass%20Fed": 24,
      "tags/Regenerative": 11,
      "categories/food-beverages": 98
    },
    "intersection_count": 3
  },
  "recommendations": [
    {
      "slug": "100-grass-fed-beef-tallow",
      "title": "100% Grass-Fed Beef Tallow - Lineage Provisions",
      "brand": {
        "name": "Lineage Provisions",
        "slug": "lineage-provisions",
        "url": "https://finelysourced.com/brands/lineage-provisions"
      },
      "breadcrumb_category": ["Food & Beverages", "Oils & Fats"],
      "description_short": "Premium regenerative nose-to-tail beef tallow rendered with low temperatures in small batch tallow.",
      "description_about": "Lineage Provisions' 100% Grass-Fed Beef Tallow is one of the most delicious animal-based cooking fats on the planet, rich in CLA, fat soluble vitamins, and stearic acid. It is slowly rendered in small batches…",
      "tags": ["Grass Fed", "Beef Tallow", "Cooking Fat", "Regenerative", "Nose-To-Tail"],
      "key_features": ["Rich in CLA", "Fat Soluble Vitamins", "Stearic Acid", "Glyphosate Free", "Small Batch Kettle Rendered"],
      "certifications": ["Seed-Oil Free", "Glyphosate Free"],
      "current_offers": [
        {
          "code": "FINELYSOURCED",
          "label": "10% off on orders over $99 for new customers"
        }
      ],
      "vendor_url": "https://lineageprovisions.com/FINELYSOURCED?utm_source=finelysourced.com&utm_medium=directory&utm_campaign=referral",
      "finelysourced_url": "https://finelysourced.com/products/100-grass-fed-beef-tallow",
      "logo_url": "https://images.finelysourced.com/brands/logos/lineageprovisions-logo.jpg"
    }
  ],
  "notes": [
    "FinelySourced does not store retail prices; price filters cannot be honored client-side. Use vendor_url to fetch live price.",
    "Multi-filter intersection performed client-side because the site supports only single-dimension URL filters."
  ]
}
```

If no products survive the intersection, emit:

```json
{
  "query": { "...": "..." },
  "summary": { "candidates_per_filter": { "tags/Glyphosate-Free": 6, "tags/Vegan": 14 }, "intersection_count": 0 },
  "recommendations": [],
  "notes": ["No products in the FinelySourced catalog satisfy all requested filters simultaneously. The strictest filter was tags/Glyphosate-Free (6 candidates)."]
}
```
