---
name: farfetch-com-browse-listings-j1zpwy
title: Browse and Paginate Farfetch Listings
description: >-
  Paginate through a Farfetch category, brand, set, or search listing via the
  ?page=N URL parameter and extract each page's product cards (brand, name,
  price, sale price, discount, availability, URL) plus pagination state.
website: farfetch.com
category: ecommerce
tags:
  - ecommerce
  - fashion
  - listings
  - pagination
  - product-scraping
  - farfetch
source: 'browserbase: agent-runtime 2026-06-28'
updated: '2026-06-28'
recommended_method: browser
alternative_methods:
  - method: fetch
    rationale: >-
      Plain HTTP fetch of a listing URL returns 4xx/410 behind Akamai — not
      viable. Drive a real stealth browser instead.
  - method: api
    rationale: >-
      Farfetch's internal product API is gated by Akamai bot manager and
      undocumented; the rendered listing DOM already exposes all card +
      pagination data, so it isn't worth reverse-engineering.
verified: true
proxies: true
---
# Browse and Paginate Farfetch Listings

## Purpose
Read-only skill that walks a Farfetch category/listing page and paginates through the full result set, extracting the product cards on each page (brand, product name, price, sale price, discount, availability, product URL) plus the pagination state (current page, total pages, next-page URL). It does not add to cart, log in, or buy — it stops at the listing grid.

## When to Use
- Enumerating all products in a Farfetch category (e.g. women's shoes, men's bags, a brand page).
- Collecting product cards page-by-page for indexing, price monitoring, or assortment analysis.
- Determining how many pages / roughly how many items a category contains.
- Following pagination on any `…/items.aspx` listing, a `…/sets/….aspx` edit, a brand page, or a search results page.

## Workflow

The fast, reliable mechanism is **URL-parameter pagination** — Farfetch paginates entirely via `?page=N`, and deep-linking to any page works directly (verified for `?page=2` and `?page=443`). You never need to click "Next"; just navigate the URL and increment `page`. There is no need to reverse-engineer a private JSON API — the rendered listing page exposes everything, and the internal product API sits behind Akamai bot manager.

1. **Start a stealth remote session.** Farfetch is Akamai-protected. Create the Browserbase session with `--verified --proxies`. Listing pages render fine with stealth on.

2. **Open the listing page.**
   ```
   browse open "https://www.farfetch.com/shopping/women/shoes-1/items.aspx" --remote
   ```
   URL shape is `https://www.farfetch.com/shopping/{gender}/{category}/items.aspx`, where `{gender}` is `women` / `men` / `kids` and `{category}` is a slug like `shoes-1`, `bags-purses-1`, `clothing-1`, `trainers-1`. Brand and set pages (`/shopping/women/{brand}/{category}-1/items.aspx`, `/sets/{slug}.aspx`) paginate identically.

3. **Lazy-load the grid.** Product cards are NOT all present on first paint (~12–22 are). Trigger the lazy loader with **real keyboard scroll events** — press `End` (or `PageDown`) ~12–18 times with ~0.7s pauses between presses. After a full scroll, ~90 product cards are in the DOM.
   - **Important:** in-page `window.scrollBy()` / `scrollTo()` via `browse eval` does NOT trigger the loader — only genuine key/scroll events do.

4. **Read the pagination state.** The footer control reads `<current> of <total>` (e.g. `2 of 931`) with `Previous` / `Next` links. The `Next` href is `?page=<current+1>`. Use `<total>` as the loop bound.

5. **Extract the product cards.** Cards are anchors whose href matches `-item-<digits>.aspx`. Run a single `browse eval` that returns JSON to avoid burning turns:
   ```
   browse eval '(() => {
     const grid = [...document.querySelectorAll("a[href]")]
       .filter(a => /-item-\d+\.aspx/.test(a.getAttribute("href")||""));
     const seen = new Set(); const items = [];
     for (const a of grid) {
       const href = a.getAttribute("href");
       const id = (href.match(/-item-(\d+)/)||[])[1];
       if (!id || seen.has(id)) continue; seen.add(id);
       items.push({ id, url: new URL(href, location.origin).href,
                    lines: (a.innerText||"").split("\n").map(s=>s.trim()).filter(Boolean) });
     }
     const p = document.body.innerText.match(/(\d[\d,]*) of (\d[\d,]*)/) || [];
     return JSON.stringify({ current_page: p[1]||null, total_pages: p[2]||null,
                             count: items.length, items });
   })()'
   ```
   Each card's `lines` array is roughly `[badge?, brand, name, price, salePrice?, discount?, availability, "See all sizes"]` — e.g. `["NeroGiardini","80mm leather wedge sandals","$279","$210","-20%","Available","See all sizes"]`. Map fields best-effort: first token may be a badge (`New Season`, `Featured`); the `$…` tokens are price then sale price; a `-N%` token is the discount.

6. **Advance to the next page.** Navigate directly to the incremented URL — do **not** click Next:
   ```
   browse open "https://www.farfetch.com/shopping/women/shoes-1/items.aspx?page=2" --remote
   ```
   Repeat steps 3–5. Continue while `current_page < total_pages`, or until you've collected the desired number of items.

7. **Emit the aggregated JSON** (see Expected Output). Stop at the listing grid — never proceed to a product detail purchase flow.

## Site-Specific Gotchas
- **Pagination is `?page=N` only.** Deep-links to arbitrary pages work (`?page=443` → title `Page 443 | …`). No cursor/token. Page 1 omits the param; the canonical URL for page 1 has no `?page`.
- **Lazy load needs real scroll events.** `browse get markdown body` and `browse snapshot` without scrolling only see ~12–22 of ~90 items. Scroll with keyboard `End`/`PageDown`; `window.scrollBy()` in `eval` is ignored by the loader.
- **Recommendations carousel contaminates anchor counts.** A "Recommendations" / "You may also like" carousel at the page bottom adds ~12–18 extra `-item-…aspx` anchors that are NOT part of the listing grid. The main grid is the first ~90 unique IDs (they appear before the carousel in DOM order); slice/cap to the grid to exclude them. The carousel also injects its own `N of 12` pagination labels — match the FIRST `\d+ of \d+` (e.g. `2 of 931`) for the real listing pagination, not the carousel's `1 of 12`.
- **Per-page size ≈ 90 products.** `931 pages × ~90 ≈ 84k` items for women's shoes — consistent with the displayed total.
- **Akamai bot manager is active.** The homepage probe shows "no antibot" (it 301-redirects), but `…/items.aspx` paths sit behind Akamai (`X-Akamai-Transformed`, `ak_p` server-timing). Run remote with `--verified --proxies`; pages loaded reliably with stealth on. A bare HTTP `fetch` of a listing URL returns 4xx/410 — don't bother fetching; drive a real browser.
- **Don't waste time hunting for a public API.** The listing data is fully present in the rendered DOM; the internal product API is Akamai-gated. URL-param pagination + DOM extraction is the supported path.
- **Page titles aid verification:** page 1 is `Designer shoes for women | FARFETCH`; page N is `Page N | Designer shoes for women | FARFETCH`.
- **Turn budget when driving with an agent:** do not press `End` one key per turn in a long loop and then snapshot repeatedly — that exhausts a limited turn budget before extraction. Batch ~6 presses, then extract everything in ONE `eval` call. (Two autobrowse runs hit the 30-turn cap by over-scrolling before extracting.)

## Expected Output
A JSON object per page (or an aggregated array across pages):

```json
{
  "success": true,
  "listing_url": "https://www.farfetch.com/shopping/women/shoes-1/items.aspx",
  "current_page": 2,
  "total_pages": 931,
  "next_page_url": "https://www.farfetch.com/shopping/women/shoes-1/items.aspx?page=3",
  "items_per_page": 90,
  "items": [
    {
      "id": "34126022",
      "brand": "Saint Laurent",
      "name": "Babylone strappy sandals",
      "price": "$1,178",
      "sale_price": null,
      "discount": null,
      "badge": null,
      "availability": "Available",
      "url": "https://www.farfetch.com/shopping/women/saint-laurent-babylone-strappy-sandals-item-34126022.aspx"
    },
    {
      "id": "34089662",
      "brand": "NeroGiardini",
      "name": "80mm leather wedge sandals",
      "price": "$279",
      "sale_price": "$210",
      "discount": "-20%",
      "badge": null,
      "availability": "Available",
      "url": "https://www.farfetch.com/shopping/women/nerogiardini-80mm-leather-wedge-sandals-item-34089662.aspx"
    }
  ]
}
```

On the last page, `current_page === total_pages` and `next_page_url` is `null`.

Failure shape (e.g. blocked by anti-bot or an invalid category):

```json
{
  "success": false,
  "listing_url": "https://www.farfetch.com/shopping/women/shoes-1/items.aspx",
  "current_page": null,
  "total_pages": null,
  "items": [],
  "error_reasoning": "Akamai challenge / 4xx returned for listing page — retry with --verified --proxies."
}
```
