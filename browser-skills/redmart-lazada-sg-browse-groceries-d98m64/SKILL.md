---
name: redmart-lazada-sg-browse-groceries-d98m64
title: RedMart Browse Groceries
description: >-
  Browse and search RedMart (Lazada Singapore's grocery arm) for products by
  query or category, returning name, pack size, price, original price, unit
  price, promo badge, rating, review count, image, and product URL. Read-only —
  never adds to cart or checks out.
website: redmart.lazada.sg
category: groceries
tags:
  - groceries
  - lazada
  - singapore
  - redmart
  - shopping
  - akamai
  - read-only
source: 'browserbase: agent-runtime 2026-05-24'
updated: '2026-05-24'
recommended_method: browser
alternative_methods:
  - method: fetch
    rationale: >-
      browse cloud fetch returns only the JS bootstrap shell (~66 KB, zero
      product tiles). The catalog page hydrates RedmartProductTile-* markup via
      a deferred render script that requires a real headless browser, so a plain
      HTTP GET cannot replace the browser path.
  - method: api
    rationale: >-
      No public Lazada/RedMart product-search JSON API was discoverable. The
      page's inline window.LZD / iLogger state does not contain product arrays,
      and observed XHRs do not include the search result set. Don't waste time
      on mtop / acs-m.lazada.sg.
verified: true
proxies: true
---
# RedMart Browse Groceries

## Purpose

Browse and search the RedMart online grocery section of Lazada Singapore for a query and/or category, returning a structured list of grocery products with name, package weight/volume, current price (SGD), original/strikethrough price, unit price (per L, per kg, etc.), star rating, review count, in-stock state, product image, canonical product URL, and any "Multiple Promo" / promo badge. Read-only — never adds to cart, never checks out, never logs in.

## When to Use

- "What's the cheapest milk on RedMart?" / "Show me UHT milk under $2 per litre."
- Daily price-tracking of a specific SKU or category (e.g. eggs, rice, instant noodles).
- Building a comparison shopping list across RedMart and competitors (FairPrice, Sheng Siong) — pull the RedMart side here.
- Discovering current promotions / "Multiple Promo" tagged items in a category.
- Any time you'd otherwise navigate the RedMart UI to read product info but never to purchase.

## Workflow

RedMart's search and category pages are **server-side rendered on the `redmart.lazada.sg` subdomain** — all 40 product tiles per page are in the initial HTML of `browse get html body`. There is no public JSON API; the in-page React state (`window.__INITIAL_STATE__`, `window.pageData`, `window.LZD`) does **not** contain product arrays. The cheap-fetch path (`browse cloud fetch`) returns only the JS shell (no `RedmartProductTile-*` tiles), because the products are injected by a script that runs after page-load — so a headless render is required. Drive the browser, extract from the rendered HTML.

A stealth + residential-proxy session is **mandatory** — a bare cloud session gets redirected to an Akamai `_____tmd_____/punish` page on the first navigation that crosses to `www.lazada.sg` (which the global Lazada search box does). See gotcha #1.

1. **Create a verified + proxied Browserbase session.**

   ```bash
   SID=$(browse cloud sessions create --keep-alive --verified --proxies \
     | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const m=s.match(/\{[\s\S]*\}/);process.stdout.write(JSON.parse(m[0]).id)})")
   export BROWSE_SESSION="$SID"
   ```

   `--verified` enables stealth UA / TLS fingerprint matching; `--proxies` routes through a SG-eligible residential IP. Both required. (`browse` 0.7.x prints an "Update available" preamble that breaks naive `JSON.parse` — the regex above extracts the first balanced `{...}` block from stdout.)

2. **Navigate to the RedMart-scoped search URL.** This is the load-bearing URL pattern:

   ```
   https://redmart.lazada.sg/catalog/?q={URL-encoded query}&m=redmart
   ```

   **Use the `redmart.lazada.sg` subdomain, NOT `www.lazada.sg`.** The same query at `https://www.lazada.sg/catalog/?q=milk&m=redmart` immediately redirects to a `_____tmd_____/punish?x5secdata=...` Akamai challenge page even with `--verified --proxies`; the `redmart.` subdomain returns the search results page directly. (Gotcha #1.)

   Optional sort parameter: `&sort=priceasc` (price low→high), `&sort=pricedesc`, `&sort=popularity`. Optional pagination: `&page=N` (1-indexed; page count is 40 results per page, but pages overlap heavily — gotcha #5).

   ```bash
   browse open "https://redmart.lazada.sg/catalog/?q=milk&m=redmart&sort=priceasc" --remote
   browse wait load --remote
   browse wait timeout 4000 --remote   # tile hydration ~2–3s after load fires
   ```

3. **For category browsing instead of search**, navigate to the category slug directly. Observed category URLs (each works with `?m=redmart` and the same `&sort=...` / `&page=N` params):

   | Category | URL slug |
   |---|---|
   | Fresh produce | `redmart.lazada.sg/shop-groceries-fresh-produce/` |
   | Dairy, chilled & eggs | `www.lazada.sg/shop-dairy-chilled-&-eggs/` (lives on `www.` — works) |
   | Food staples / cooking essentials | `redmart.lazada.sg/shop-Groceries-FoodStaplesCookingEssentials/` |
   | Frozen | `redmart.lazada.sg/shop-groceries-frozen/` |
   | Beverages | `redmart.lazada.sg/beverages/` |
   | Meat & seafood | `redmart.lazada.sg/meat-and-seafood/` |
   | Wines, beers & spirits | `redmart.lazada.sg/wines-beers-spirits/` |
   | Health & beauty | `redmart.lazada.sg/shop-health-beauty/` |
   | Household supplies | `redmart.lazada.sg/shop-household-supplies/` |
   | Pet supplies | `redmart.lazada.sg/shop-pet-supplies/` |
   | Mother & baby | `redmart.lazada.sg/mother-baby/` |
   | Snacks & confectionery | `www.lazada.sg/shop-snacks-&-confectionery/?m=redmart` |
   | Kitchenware & tableware | `www.lazada.sg/shop-kitchenware-&-tableware/?m=redmart` |

   The exact set is harvested from the homepage left-nav (`https://redmart.lazada.sg/`). Some categories sit under `www.lazada.sg` rather than `redmart.lazada.sg` — those still serve product tiles correctly (the Akamai punish trigger is specifically on `www.lazada.sg/catalog/?q=...`, not on `www.lazada.sg/shop-*`). When in doubt, prefer the `redmart.lazada.sg` host.

4. **Extract product tiles from the rendered HTML.** Get the body HTML (returned JSON-escaped — note the `\"` in regex):

   ```bash
   browse get html body --remote > page.html
   ```

   Then parse with a regex over `RedmartProductTile-*` classes:

   ```python
   import re, json
   with open("page.html") as f:
       html = f.read()

   total = int(re.search(r"([0-9,]+) items", html).group(1).replace(",",""))

   # Each product tile is one <div class="RedmartProductTile-container">…</div>
   card_re = re.compile(
       r'<a class=\\"RedmartProductTile-link\\" href=\\"([^"\\]+)\\".*?'
       r'<img src=\\"([^"\\]+)\\".*?'
       r'(?:<span><span>([^<]+)</span></span>)?'                       # promo badge text e.g. "Multiple Promo"
       r'.*?class=\\"RedmartProductTile-price\\">([^<]+)</div>'         # current price "$2.75"
       r'(?:.*?class=\\"RedmartProductTile-originalPrice\\">([^<]+)</span>)?'  # strikethrough
       r'.*?class=\\"RedmartProductTile-title\\">([^<]+)</div>'         # product name
       r'.*?class=\\"RedmartProductTile-weight\\">([^<]+)</div>'        # pack size e.g. "1 L", "500 g", "24 × 200 ml"
       r'(?:.*?class=\\"ProductTileReview-score\\">([^<]+)</span>'      # rating
       r'.*?class=\\"ProductTileReview-text\\">\(([0-9]+)\)</span>)?'   # review count
       r'(?:.*?class=\\"ProductTileReview-unitPrice\\">([^<]+)</div>)?',# unit price "$2.75/L"
       re.DOTALL,
   )

   for href, img, badge, price, orig, title, weight, rating, reviews, unit_price in card_re.findall(html):
       qs = dict(kv.split("=",1) for kv in href.split("?",1)[1].split("&amp;") if "=" in kv)
       yield {
           "name": title,
           "pack_size": weight,
           "price_sgd": float(price.lstrip("$")),
           "original_price_sgd": float(orig.lstrip("$")) if orig else None,
           "unit_price": unit_price,                       # e.g. "$2.75/L"
           "promo_badge": badge,                           # e.g. "Multiple Promo"
           "rating": float(rating) if rating else None,
           "review_count": int(reviews) if reviews else 0,
           "image_url": img,
           "product_url": ("https:" + href.split("?",1)[0]) if href.startswith("//") else href.split("?",1)[0],
           "in_stock": qs.get("stock") == "1",
       }
   ```

   Each results page renders exactly **40** tiles inside `<div class="ProductGridModern-container desktop" data-spm="list">`. The total result count appears as `"X items"` in the header (e.g. `"4107 items"` for query `milk`).

5. **Paginate (carefully).** Append `&page=2`, `&page=3`, … Pagination is server-side honoured (active page is marked by `ant-pagination-item-N ant-pagination-item-active`), but consecutive pages have **heavy SKU overlap** — gotcha #5. Dedupe by SKU id `pdp-i{itemId}-s{skuId}.html` from `product_url`, and stop when no new SKUs surface for two consecutive pages.

6. **Release the session.**

   ```bash
   browse cloud sessions update "$SID" --status REQUEST_RELEASE
   ```

## Site-Specific Gotchas

- **`www.lazada.sg/catalog/?q=...` triggers Akamai punish; `redmart.lazada.sg/catalog/?q=...` does not.** Same `&m=redmart` query, same session, same proxies — only the subdomain matters. The global Lazada header search box at `redmart.lazada.sg/` submits to `www.lazada.sg/catalog/`, so **do not** use the in-page searchbox to drive search; construct the `redmart.lazada.sg/catalog/?q=...` URL directly. Verified: a `--verified --proxies` session hitting `https://www.lazada.sg/catalog/?q=milk&m=redmart` lands on `https://www.lazada.sg//catalog//_____tmd_____/punish?x5secdata=...` with empty title. The same session loads `https://redmart.lazada.sg/catalog/?q=milk&m=redmart` to the full product grid in <3s.
- **Stealth + residential proxy is mandatory.** `browse cloud sessions create --verified --proxies`. A bare session may pass the homepage but fails on search/category navigation.
- **`browse cloud fetch` returns an empty JS shell.** The catalog page is a server-side React/Vue render — `RedmartProductTile-*` markup is injected by a deferred script after page-load. A plain HTTP GET (even with `--proxies`) returns the ~66 KB bootstrap shell with 0 product tiles. The browser path is required. There is no public Lazada/RedMart search API discoverable from the page (no `mtop`/`acs-m.lazada.sg` JSON XHR carries the result set in the observed traffic; product data is hydrated from inline HTML, not fetched).
- **The in-page searchbox is a trap.** `[searchbox: Search in RedMart]` + `[button: SEARCH]` submit to `https://www.lazada.sg/catalog/?q=...` — i.e. the punish-triggering URL. Pressing Enter in the box also no-ops (the form action runs but the navigation is intercepted/dropped). Always build the URL yourself with `redmart.lazada.sg/catalog/?q=...&m=redmart`.
- **Search pagination has ~80% SKU overlap between consecutive pages.** Verified for `q=milk`: page 1 and page 2 share 32 of 40 SKUs. Lazada's grid re-displays "boosted" / sponsored / top-seller tiles on every page, so naïve scraping of pages 1–N grossly over-counts. Dedupe by `pdp-i{itemId}-s{skuId}` and stop on plateau. The advertised total ("4107 items" for `milk`) is the catalog count — you will only realistically retrieve a few hundred unique SKUs even at page 102.
- **Unit price (`/L`, `/kg`, `/100g`) is only shown for ~25–30 % of tiles.** Don't treat absence as failure; the field is genuinely absent in the HTML for the rest. When needed, compute it client-side from `RedmartProductTile-weight` × `RedmartProductTile-price`.
- **Pack-size string varies wildly.** `"1 L"`, `"500 g"`, `"24 × 200 ml"`, `"12 × 1 L"`, `"1 Per Pack"`, `"76 g"`. Treat it as opaque text; only parse if downstream needs structured grams/ml.
- **Product detail URLs live on `www.lazada.sg`, not `redmart.`.** Tile hrefs all point to `//www.lazada.sg/products/pdp-i{itemId}-s{skuId}.html?…`. These direct-navigation URLs are NOT punish-protected — verified that `browse open` on a tile URL renders the PDP normally. Only the `www.lazada.sg/catalog/?q=…` search endpoint is blocked.
- **Locale cookie is `hng=SG|en-SG|SGD|702`.** Set automatically on first navigation. No need to set it manually.
- **Currency is SGD throughout.** All prices are S$. The page rendering uses `$` rather than `S$` or `SGD` — adjust display if your output needs a currency symbol.
- **`browse cloud sessions create` and other CLI verbs print "Update available: 0.7.2 -> 0.8.0" preamble to stdout** before the JSON body. `node -e "JSON.parse(stdin)"` fails on it — extract with `s.match(/\{[\s\S]*\}/)` first. (CLI version pinned in this sandbox is 0.7.2.)
- **`autobrowse evaluate.mjs` requires `ANTHROPIC_API_KEY` explicitly set** and does not honour `ANTHROPIC_AUTH_TOKEN`. In environments where only the auth-token + base-URL are wired (Vercel AI Gateway pattern), the autobrowse inner-agent loop is not usable — drive `browse` directly instead.
- **No country/region gate observed on `redmart.lazada.sg/` with a SG-region residential proxy.** The country picker has not been seen even on first visit; verified in iter-1 with no cookies set.
- **`html body` output from `browse get html body` is JSON-escaped** (the response is `{"html": "…"}` and the inner string has `\"` in place of `"`). Account for this when writing regexes — match `\\"` not `"`.

## Expected Output

```json
{
  "success": true,
  "query": "milk",
  "category": null,
  "sort": "priceasc",
  "page": 1,
  "page_size": 40,
  "total_results": 4107,
  "products": [
    {
      "name": "Want want Flavoured Milk 245ML",
      "pack_size": "245 ml",
      "price_sgd": 1.21,
      "original_price_sgd": null,
      "unit_price": null,
      "promo_badge": null,
      "rating": null,
      "review_count": 0,
      "image_url": "https://sg-test-11.slatic.net/p/abc123.jpg",
      "product_url": "https://www.lazada.sg/products/pdp-i301102812-s527098840.html",
      "item_id": "301102812",
      "sku_id": "527098840",
      "in_stock": true
    },
    {
      "name": "Meiji Fresh Milk 2L",
      "pack_size": "2 L",
      "price_sgd": 6.45,
      "original_price_sgd": 6.97,
      "unit_price": "$3.23/L",
      "promo_badge": "Multiple Promo",
      "rating": 4.92,
      "review_count": 35028,
      "image_url": "https://sg-test-11.slatic.net/p/5e3a9e19730f4604f7d9ca0d1f7c2df2.jpg",
      "product_url": "https://www.lazada.sg/products/pdp-i301102812-s527098840.html",
      "item_id": "301102812",
      "sku_id": "527098840",
      "in_stock": true
    }
  ],
  "method_used": "browser",
  "api_endpoint_observed": null,
  "error_reasoning": null
}
```

Distinct outcome shapes:

```json
// Empty / no results
{ "success": true, "query": "xyzzzzzz", "total_results": 0, "products": [], "method_used": "browser" }

// Anti-bot wall hit (caller used www.lazada.sg/catalog/?q=…)
{ "success": false, "reason": "akamai_punish_page",
  "url_after": "https://www.lazada.sg//catalog//_____tmd_____/punish?x5secdata=…",
  "remediation": "Switch host to redmart.lazada.sg/catalog/?q=…" }

// Session not stealthy enough (rare on redmart.* — common if --verified or --proxies omitted)
{ "success": false, "reason": "session_blocked",
  "remediation": "Recreate session with --verified --proxies" }

// Category browse (no query)
{ "success": true, "query": null, "category": "shop-groceries-fresh-produce",
  "sort": "popularity", "total_results": 1088, "products": [ … ] }
```
