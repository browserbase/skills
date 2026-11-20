---
name: amazon-com-search-products-5170mf
title: Amazon Product Search
description: >-
  Search Amazon for products matching a query with the full filter surface
  (department, brand, rating, price, deals, condition, sort, pagination) and
  return structured JSON per result: ASIN, title, price, rating, badges, image,
  and canonical /dp/ URL.
website: amazon.com
category: ecommerce
tags:
  - amazon
  - ecommerce
  - product-search
  - shopping
  - scraping
source: 'browserbase: agent-runtime 2026-06-04'
updated: '2026-06-04'
recommended_method: browser
alternative_methods:
  - method: url-param
    rationale: >-
      All filter/sort/pagination state is encoded in the /s URL query string (k,
      s, page, rh=key:value fragments), so a caller can deep-link any filter
      combination directly — but the page itself is still anti-bot-walled and
      must be loaded through a stealthed browser, so this is an addressing
      convenience layered on top of the browser method, not a standalone HTTP
      route.
  - method: fetch
    rationale: >-
      Plain HTTP GET of /s (residential proxy, no JS) was NOT pursued to a
      reliable state: Amazon serves results client-rendered behind bot
      fingerprinting and frequently returns a 503 interstitial or Robot Check to
      non-browser clients. No unauthenticated product-listing JSON endpoint was
      found. Use the browser path.
verified: true
proxies: true
---
# Amazon Product Search

## Purpose

Search amazon.com for products matching a query, applying any of the filters Amazon's
search UI exposes (department, brand, customer-review rating, price range, deals,
condition, seller, delivery speed, sort order, pagination), and return the matching
results as structured JSON. For each product it returns ASIN, title, primary image +
thumbnails, current/list price + discount %, rating (stars + review count), Prime /
sponsored / badge flags, and the canonical `/dp/{ASIN}` URL, plus the region-wide
`totalResultCount` from the results header. **Read-only** — it never adds to cart,
buys, subscribes, or signs in.

## When to Use

- "Search Amazon for `<query>`" with or without filters, and return the result list.
- Price/availability monitoring across a filtered query (e.g. "wireless keyboards under
  $50, 4 stars & up, sorted cheapest first").
- Resolving a free-form query, a keyword+department, a full `amazon.com/s?...` URL, a
  category-browse intent ("Bestsellers in Coffee"), or a list of ASINs into structured
  product records.
- Anywhere you'd otherwise scrape Amazon search HTML — this documents the exact
  query-string filter encodings and a DOM extractor that survives Amazon's layout.

## Workflow

Amazon search results are client-rendered behind aggressive bot fingerprinting. There is
**no unauthenticated product-listing JSON endpoint** reachable from outside, and a plain
HTTP `GET /s` (even via residential proxy) typically returns a 503 interstitial or a
Robot Check. The reliable path is a **stealthed Browserbase session** that loads the real
`/s` page and a `browse eval` extractor — never `browse snapshot` (see Gotchas).

All filter/sort/pagination state lives in the `/s` URL query string, so you build one URL
and load it once.

1. **Create a remote session with stealth ON.** Amazon needs both:
   ```bash
   sid=$(browse cloud sessions create --keep-alive --verified --proxies | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')
   export BROWSE_SESSION="$sid"
   ```

2. **Build the search URL.** Base `https://www.amazon.com/s?k=<url+encoded+query>` (encode
   spaces as `+`). Then append:
   - `&s=<sort>` — `relevanceblender` (Featured, default), `price-asc-rank`,
     `price-desc-rank`, `review-rank` (Avg. Customer Review), `date-desc-rank` (Newest),
     `exact-aware-popularity-rank` (Best Sellers).
   - `&page=<N>` — pagination (default page returns ~16–48 cards).
   - `&rh=<comma-joined key:value filter fragments>` — see the encoding table in Gotchas.
   - For an **ASIN list**, skip search and open `https://www.amazon.com/dp/<ASIN>` per ASIN.
   - For a **full URL input**, use it as-is (optionally append more `rh` fragments).

3. **Open and wait for result cards:**
   ```bash
   browse open "<url>" --remote
   browse wait selector "div[data-component-type=s-search-result]" --remote
   ```
   If the selector times out, run `browse get text body --remote` and check for a Robot
   Check (see Gotchas). On a transient 503 ("Something went wrong"), `browse reload --remote`
   once and re-wait.

4. **Extract with `browse eval`** (NOT `browse snapshot`). Run the extractor below; it
   returns a JSON string in `.result`:
   ```bash
   browse eval "<EXTRACTOR_JS>" --remote
   ```
   Parse `.result` (it's a JSON string — `JSON.parse` it). It yields
   `{ totalResultCount, resultCount, results[] }`.

5. **Paginate / limit.** To return more than one page, re-open with `&page=2`, `&page=3`,
   … and concatenate `results[]`. `totalResultCount` tells the caller the returned slice
   is partial.

6. **Release the session:** `browse cloud sessions update "$sid" --status REQUEST_RELEASE`.

### The extractor (`browse eval` expression)

```js
(() => {
  const num = s => { if(!s) return null; const m=String(s).replace(/[^0-9.]/g,''); return m?parseFloat(m):null; };
  const intnum = s => { if(!s) return null; const m=String(s).replace(/[^0-9]/g,''); return m?parseInt(m,10):null; };
  const headerEl = document.querySelector('[data-component-type="s-result-info-bar"]') || document.querySelector('.s-breadcrumb');
  const headerTxt = headerEl ? headerEl.innerText.split('\n')[0] : '';
  const tm = headerTxt.match(/of\s+(over\s+)?([\d,]+)\s+results/i) || headerTxt.match(/([\d,]+)\s+results/i);
  const total = tm ? parseInt(tm[tm.length-1].replace(/,/g,''),10) : null;
  const cards = [...document.querySelectorAll('div[data-component-type="s-search-result"]')];
  const results = cards.map(c => {
    const asin = c.getAttribute('data-asin') || null;
    const h2 = c.querySelector('h2');
    const img = c.querySelector('img.s-image');
    const priceOff = c.querySelector('.a-price:not(.a-text-price) .a-offscreen');
    const listOff = c.querySelector('.a-price.a-text-price .a-offscreen') || c.querySelector('[data-a-strike="true"] .a-offscreen');
    const ratingEl = c.querySelector('.a-icon-alt');
    let reviewCount = null;
    for (const e of c.querySelectorAll('[aria-label]')) { const a=e.getAttribute('aria-label'); if(/^[\d,]+\s+ratings?$/i.test(a)){ reviewCount=intnum(a); break; } }
    const txt = c.innerText;
    const cur = num(priceOff?.textContent), list = num(listOff?.textContent);
    return {
      asin,
      title: h2 ? h2.innerText.trim() : null,
      imageUrl: img ? img.getAttribute('src') : null,
      thumbnails: img && img.getAttribute('srcset') ? [...new Set(img.getAttribute('srcset').split(',').map(s=>s.trim().split(' ')[0]))] : [],
      price: cur!=null ? {formatted:priceOff.textContent, raw:cur, currency:'USD'} : null,
      listPrice: list!=null ? {formatted:listOff.textContent, raw:list} : null,
      discountPercent: (cur!=null&&list!=null&&list>cur) ? Math.round((1-cur/list)*100) : null,
      rating: { stars: ratingEl ? num(ratingEl.textContent.split(' ')[0]) : null, reviewCount },
      primeEligible: !!c.querySelector('[data-cy="delivery-recipe"] .prime-brand-color, i.a-icon-prime'),
      sponsored: !!c.querySelector('.puis-sponsored-label-text, .s-sponsored-label-text, [aria-label="View Sponsored information"]'),
      badges: [/Amazon's Choice/i.test(txt)&&"Amazon's Choice", /Best Seller/i.test(txt)&&"Best Seller", /Climate Pledge Friendly/i.test(txt)&&"Climate Pledge Friendly"].filter(Boolean),
      url: asin ? ('https://www.amazon.com/dp/'+asin) : null
    };
  }).filter(r => r.asin);
  return JSON.stringify({ totalResultCount: total, resultCount: results.length, results });
})()
```

## Site-Specific Gotchas

- **Stealth is mandatory.** Sessions created with `--verified --proxies` loaded full
  results with no CAPTCHA across all test iterations. Do **not** start a bare session —
  expect an immediate Robot Check without stealth.
- **Never use `browse snapshot` on `/s` pages.** Amazon's accessibility tree exceeds the
  harness's 1 MB exec buffer, so `browse snapshot` exits non-zero. The only stderr you'll
  see is an unrelated `Update available: 0.x -> 0.y` notice from the `browse` CLI — that
  notice is **not** the real cause and is harmless; the real cause is the oversized output.
  Use `browse eval` for all extraction. (`browse get text/html` on the whole results
  container is also too large and returns inline script junk — scope any `get` to a single
  small element, or just use the extractor.)
- **First load may 503 — warm up via the homepage.** A transient "Sorry! Something went
  wrong!" page is common when the very first navigation of a fresh session is the `/s`
  search URL (no session cookies yet). The reliable fix: open `https://www.amazon.com/`
  first, wait ~1.5s, then open the search URL — this establishes cookies and avoids the
  503 (proven in the bundled `playwright.ts`). If a 503 still appears, `browse reload --remote`
  once and re-wait for the result-card selector.
- **`rh=` filter node IDs are NOT stable constants — read them from the live filter rail.**
  The "4 Stars & Up" link rendered `p_72:1248879011` on one query and `p_72:1248915011`
  on another, and both resolve to the same filter. The robust pattern: load a first,
  unfiltered results page, read the `href` of the desired filter's anchor in the left rail
  (`#s-refinements a[href*="rh="]`), copy its `rh=` fragment, then re-open the URL with that
  fragment appended. Only the **key names** and the `s=` / `k=` / `page=` tokens are stable.
- **Verified `rh` key names / encodings:**
  | Filter | `rh` fragment | Notes |
  |---|---|---|
  | Department / category | `n:<categoryNodeId>` | also addressable via `&i=<alias>` (e.g. `i=electronics`) |
  | Customer reviews (min stars) | `p_72:<id>` | id dynamic; read from rail (1/2/3/4-star surfaced) |
  | Price range | `p_36:<minCents>-<maxCents>` | **cents**, no decimals; open-ended `2500-` or `-5000`; preset buckets are just specific ranges |
  | Brand | `p_89:<BrandName>` or `p_123:<id>` | key varies by category; multi-select pipe-joined (`|`) |
  | Today's Deals | `p_n_deal_type:23566064011` | verified from rail |
  | Climate Pledge Friendly | `p_n_cpf_labels:<id>` | read from rail |
  | Free shipping / Prime delivery | `p_76:<id>` / `p_90:<id>` | category-dependent |
  | Seller | `p_6:<merchantId>`; Amazon-as-seller `&emi=ATVPDKIKX0DER` | merchant IDs dynamic |
  | Category-specific facets (color, size, connectivity, fit, …) | `p_n_g-<id>:<value>` | always read from the rendered rail |

  Combine multiple filters by comma-joining inside one `rh=`:
  `rh=n:172282,p_72:1248879011,p_36:2500-5000`.
- **`primeEligible` is best-effort on logged-out search.** Amazon rarely renders a
  definitive per-item Prime badge to a signed-out visitor; a `prime-signup-ingress` upsell
  appears on most cards and is NOT a reliable signal, so the extractor keys off the Prime
  brand-color logo inside the delivery recipe and may under-report. To *guarantee* Prime
  results, apply the Prime rail filter — then every returned item is Prime by construction.
- **`brand` is usually not surfaced** as separate text on modern result cards (it lives in
  the title); leave it `null` when absent rather than guessing.
- **Result cards per page vary** (~16 at a default desktop viewport, up to 48). Always read
  `totalResultCount` from the header so the caller knows the slice is partial; paginate
  with `&page=N`.
- **Non-US storefronts** (`.co.uk`, `.de`, …): the `rh` key names are the same but the
  numeric IDs, currency, and rail labels differ — always read filter encodings from that
  storefront's rendered rail, and read the currency from the price string.
- **Robot Check handling.** If `wait selector` times out and `browse get text body`
  contains "Enter the characters you see" / "Robot Check" / "we just need to make sure
  you're not a robot": do **NOT** attempt to solve it. Screenshot it and return
  `{ "success": false, "captchaEncountered": true, "error_reasoning": "<page text>" }`.
  Triggers observed: bare (non-stealth) sessions, datacenter IPs, and high request volume;
  `--verified --proxies` + fresh sessions avoided it entirely in testing.
- **Tooling note (for agents driving this via a CDP-attached/named session):** `browse eval`
  may report "No active page in session" unless you pass the explicit `-s <session>` flag.
  With a normal default `--remote` session this is not needed.

## Expected Output

Success (one page of a filtered query):

```json
{
  "success": true,
  "query": "wireless mechanical keyboard",
  "appliedFilters": { "minRating": 4, "priceRangeCents": null, "sort": "price-asc-rank" },
  "totalResultCount": 5000,
  "pageReturned": 1,
  "resultCount": 16,
  "results": [
    {
      "asin": "B0DXJQT19B",
      "title": "Anker USB C Hub, 7in1 Multi-Port USB Adapter ...",
      "brand": null,
      "imageUrl": "https://m.media-amazon.com/images/I/71Z9T0VgGyL._AC_UY218_.jpg",
      "thumbnails": [
        "https://m.media-amazon.com/images/I/71Z9T0VgGyL._AC_UY218_.jpg",
        "https://m.media-amazon.com/images/I/71Z9T0VgGyL._AC_UY327_FMwebp_QL65_.jpg"
      ],
      "price": { "formatted": "$19.99", "raw": 19.99, "currency": "USD" },
      "listPrice": { "formatted": "$25.99", "raw": 25.99 },
      "discountPercent": 23,
      "rating": { "stars": 4.6, "reviewCount": 3786 },
      "primeEligible": false,
      "sponsored": false,
      "badges": ["Amazon's Choice"],
      "url": "https://www.amazon.com/dp/B0DXJQT19B"
    }
  ],
  "captchaEncountered": false,
  "error_reasoning": null
}
```

Item with no sale / no reviews (nulls instead of omitted keys):

```json
{
  "asin": "B0CZ6S8PX5",
  "title": "One Handed Gaming Keyboard 35 Keys ...",
  "brand": null,
  "imageUrl": "https://m.media-amazon.com/images/I/61D7NI7tdRL._AC_UY218_.jpg",
  "thumbnails": [],
  "price": { "formatted": "$7.99", "raw": 7.99, "currency": "USD" },
  "listPrice": null,
  "discountPercent": null,
  "rating": { "stars": 5, "reviewCount": 1 },
  "primeEligible": false,
  "sponsored": false,
  "badges": [],
  "url": "https://www.amazon.com/dp/B0CZ6S8PX5"
}
```

Blocked by Robot Check (do not solve — ship this shape):

```json
{
  "success": false,
  "query": "wireless mechanical keyboard",
  "totalResultCount": null,
  "results": [],
  "captchaEncountered": true,
  "error_reasoning": "Robot Check — 'Enter the characters you see below. Sorry, we just need to make sure you're not a robot.'"
}
```
