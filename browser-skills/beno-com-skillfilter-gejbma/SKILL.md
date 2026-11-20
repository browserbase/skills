---
name: beno-com-skillfilter-gejbma
title: Filter Yachts by Size on Beno
description: >-
  Filter the Beno (beno.com) Dubai yacht catalog by yacht length (feet) using
  the Size range slider, then extract matching yachts with size, guests, cabins,
  price, and detail link.
website: beno.com
category: travel
tags:
  - yachts
  - filter
  - rental
  - dubai
  - search
  - size
source: 'browserbase: agent-runtime 2026-06-11'
updated: '2026-06-11'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      The listing endpoint
      apps-api.beno.com/v3/deals/products/yacht?sizes[]=<min>-<max> returns the
      data, but it 403s to any out-of-app request (an Angular HTTP interceptor
      injects a required auth header) and even in-page fetch fails. Not usable
      without the app context.
  - method: fetch
    rationale: >-
      The ?sizes=min,max URL deep-link looks like a fast path but is broken on
      direct navigation: the app re-serializes it with a comma (sizes[]=60,200)
      which the backend rejects with HTTP 500. Only the in-app slider produces
      the working dash form.
verified: false
proxies: true
---
# Filter Yachts by Size on Beno

## Purpose
Filter the Beno (beno.com) Dubai yacht-charter catalog by yacht size (length in feet) and return the matching yachts with their size, guest capacity, cabins, price, and detail-page link. Read-only: it constrains the listing and extracts results; it never books or pays.

## When to Use
- A user wants only yachts within a size range, e.g. "show me large yachts (60 ft and up)" or "yachts between 80 and 120 feet" on beno.com.
- A user wants the count and details of Beno yachts that meet a minimum/maximum length.
- As a first step before comparing or shortlisting yachts by capacity (guests scale roughly with length).

## Workflow

The reliable method is the on-page **Size slider** in the Filters panel. Beno is an Angular SSR app whose listing is populated by XHR to `apps-api.beno.com/v3/deals/products/yacht`. There is no usable API or URL shortcut: the listing API returns **403** to any out-of-app request (an HTTP interceptor injects an auth header), and the `?sizes=min,max` deep-link is **broken on direct navigation** (see Gotchas). Drive the slider.

1. **Navigate** to the plain listing — no query string:
   `browse open https://www.beno.com/yachts`, then `browse wait load` and `browse wait timeout 4000`. The page shows ~10 skeleton "Loading…" cards first, then real yacht cards appear once the XHR resolves.

2. **Open the Filters panel.** Click the element whose visible text is "Filters". It opens an Angular CDK overlay (`.cdk-overlay-container`) containing Sort By, Harbors, Bedrooms, Type, Brands, and **Size**. Reliable click via JS:
   ```js
   browse eval "(()=>{const e=[...document.querySelectorAll('button,a,[role=button],div')].filter(b=>/^Filters$/i.test((b.textContent||'').trim()));for(const x of e){const r=x.getBoundingClientRect();if(r.width>0){x.click();return 'ok';}}return 'no';})()"
   ```

3. **Set the Size range.** "Size" is a dual-handle range slider (feet) with two inputs inside the overlay:
   - `input[name="minValueInput"]` — min=20, max=200, default 20
   - `input[name="maxValueInput"]` — min=20, max=200, default 200

   The panel is long and `browse snapshot` truncates it, so do **not** try to drag handles by pixel coordinates. Set the value with the native setter + Angular `input`/`change` events, then click **Apply**. Example for "≥ 60 ft" (set the min handle to 60, leave max at 200):
   ```js
   browse eval "(()=>{const ov=document.querySelector('.cdk-overlay-container');const minI=ov.querySelector('input[name=minValueInput]');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(minI,'60');minI.dispatchEvent(new Event('input',{bubbles:true}));minI.dispatchEvent(new Event('change',{bubbles:true}));const a=[...ov.querySelectorAll('button,[role=button],div')].find(b=>/^Apply$/i.test((b.textContent||'').trim()));a&&a.click();return 'applied';})()"
   ```
   For a bounded range (e.g. 80–120 ft) set `maxValueInput` the same way before clicking Apply.

4. **Wait for refresh** (`browse wait timeout 5000`). The app fires `GET .../v3/deals/products/yacht?...&sizes[]=<min>-<max>&...` (dash-delimited, e.g. `sizes[]=60-200`) → 200 OK, and the listing re-renders. The browser URL updates to `https://www.beno.com/yachts?sizes=<min>,<max>` and a count badge ("1") appears on the Filters button.

5. **Extract results.** Each card is an `a[href*="/yachts/"]` whose text contains `"<n> Length"` (size in feet), `"<n> Guests"`, `"<n> Cabins"`, and a per-hour/day price. The yacht's name is the card heading (or the first slug segment of the href, e.g. `/yachts/santorini/e8Kb3W` → "Santorini"). Verify every returned card's Length is within the requested range. Page 1 returns up to 10 cards; the listing lazy-loads more pages (`row=10&page=N`) as you scroll — scroll to the bottom and re-read to collect the full filtered set.

## Site-Specific Gotchas
- **`?sizes=min,max` deep-link is broken on fresh load.** Navigating directly to `https://www.beno.com/yachts?sizes=60,200` makes the app re-serialize the value with a **comma** (`sizes[]=60,200`), which the backend rejects with **HTTP 500** — the listing hangs forever on "Loading…". Only the in-app slider + Apply produces the working **dash** form (`sizes[]=60-200`). Always start from the plain `/yachts` URL and use the slider; never hand-craft the `?sizes=` URL.
- **Listing API is not callable directly.** `GET https://apps-api.beno.com/v3/deals/products/yacht` returns `{"message":"Forbidden"}` (403) to `browse cloud fetch`/external `fetch`, and even an in-page `fetch()` fails — the Angular app adds a required auth header via an HTTP interceptor. Don't waste time scripting the API; drive the UI.
- **"Size" = length in feet.** The filter section is titled "Size"; the value shown on each card is labeled "Length". Slider bounds are 20–200 ft.
- **Cards load via XHR after hydration.** Expect ~10 "Loading…" skeletons for a couple of seconds on first paint and after each filter apply. Wait 4–5 s before extracting.
- **Slider can't be dragged reliably.** The CDK overlay is taller than the viewport and the accessibility snapshot truncates it. Set `minValueInput`/`maxValueInput` programmatically (native value setter + dispatched `input` and `change` events) instead of coordinate dragging.
- **Pagination.** Results are paged at 10/row; scroll to trigger `page=2,3,…` to get the complete filtered list before reporting a total.
- **Anti-bot:** none observed. Pages and the SSR HTML load over a residential proxy with no captcha/login wall; `--verified` was not needed. (`--proxies` was used; plain requests likely also work.)

## Expected Output

Success — minimum size applied (e.g. ≥ 60 ft):
```json
{
  "success": true,
  "filter_applied": "size >= 60 ft",
  "filter_mechanism": "dual range slider (input[name=minValueInput]/maxValueInput, 20-200 ft) -> Apply; app calls apps-api with sizes[]=60-200",
  "result_url": "https://www.beno.com/yachts?sizes=60,200",
  "result_count": 29,
  "yachts": [
    { "name": "Jude",      "size_ft": 74,  "guests": 27, "cabins": 3, "price": "9,250 AED", "href": "/yachts/jude/Zmo18r" },
    { "name": "Julia",     "size_ft": 64,  "guests": 21, "cabins": 3, "price": "1,950 AED", "href": "/yachts/julia/PkQ6mq" },
    { "name": "Santorini", "size_ft": 115, "guests": 80, "cabins": 5, "price": "8,750 AED", "href": "/yachts/santorini/e8Kb3W" },
    { "name": "Encore",    "size_ft": 131, "guests": 30, "cabins": 5, "price": null,        "href": "/yachts/encore/L8JQX3" }
  ],
  "error_reasoning": null
}
```

Bounded range (e.g. 80–120 ft) — same shape, `filter_applied: "size 80-120 ft"`, `result_url` ends `?sizes=80,120`, and every `size_ft` falls within the band.

No matches (range excludes all yachts):
```json
{
  "success": true,
  "filter_applied": "size >= 190 ft",
  "result_count": 0,
  "yachts": [],
  "error_reasoning": null
}
```

Failure (e.g. the broken deep-link was used and the listing hung):
```json
{
  "success": false,
  "filter_applied": "size >= 60 ft",
  "result_count": 0,
  "yachts": [],
  "error_reasoning": "Navigated directly to ?sizes=60,200; app sent sizes[]=60,200 (comma) -> apps-api 500; listing stuck on 'Loading...'. Use the in-app slider + Apply instead."
}
```
