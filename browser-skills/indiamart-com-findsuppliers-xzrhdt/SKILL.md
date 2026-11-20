---
name: indiamart-com-findsuppliers-xzrhdt
title: IndiaMART Find Suppliers in a City
description: >-
  Search IndiaMART (dir.indiamart.com) for suppliers of a given product in a
  given Indian city, returning company name, product title, price, location,
  verification badges, rating, and storefront URL for each card on the search
  results page.
website: indiamart.com
category: b2b-marketplace
tags:
  - indiamart
  - b2b
  - suppliers
  - india
  - directory
  - procurement
source: 'browserbase: agent-runtime 2026-05-21'
updated: '2026-05-21'
recommended_method: browser
alternative_methods:
  - method: fetch
    rationale: >-
      No working HTTP-only path from outside India. dir.indiamart.com/search.mp
      302-redirects non-IN IPs to export.indiamart.com which returns 403. No
      public JSON/GraphQL endpoint discovered (autocomplete /suggest.php is
      404). Confirmed dead end 2026-05-21.
  - method: api
    rationale: >-
      IndiaMART exposes no documented public search API. Internal endpoints are
      gated by session cookies + IN-residential traffic. Do not waste turns
      probing GraphQL or REST candidates.
verified: true
proxies: true
---
# IndiaMART Find Suppliers in a City

## Purpose

Search IndiaMART (`dir.indiamart.com`) for suppliers/manufacturers of a given product in a given Indian city — returning each supplier card's company name, product title, price (or "Get Latest Price"), city/state, GST/verification badge, years on platform, response rate, rating + review count, and the canonical supplier-storefront URL. Read-only; never sends RFQs ("Get Best Price") or reveals phone numbers behind the contact-supplier flow.

For the canonical example used during skill development: `query="shredders"`, `city="Coimbatore"` → the GET URL is `https://dir.indiamart.com/search.mp?ss=shredders&cq=Coimbatore`.

## When to Use

- Sourcing a specific product (e.g. "shredders", "industrial pumps", "cotton bales") in a specific Indian city.
- Aggregating supplier listings for procurement / lead-gen / price-discovery workflows where IndiaMART is the dominant B2B directory in India.
- Building a city-scoped supplier shortlist before reaching out off-platform.

## Workflow

IndiaMART has **no public JSON / GraphQL endpoint**. Search lives on `dir.indiamart.com` as a server-rendered HTML page. The skill is browser-only, with one **mandatory infrastructure requirement**: the request must egress from an **Indian residential IP**. Any non-India IP (including the default Browserbase egress in `us-west-2` and `ap-southeast-1`) triggers a 302 redirect to `https://export.indiamart.com/search.php?ss=...`, which is the international-exporter site and returns **403 Forbidden** to browser traffic (see Site-Specific Gotchas → "Geo wall"). Cookie spoofing (`r=in`, `iploc=gcniso%3DIN…`) does **not** override the redirect — it's enforced at the edge based on the real source IP.

1. **Create a session with India geolocation.** The proxy must be a residential proxy with `country: IN` (Mumbai/Delhi/Bengaluru pop ok). Verified-stealth on; the front-page Akamai-like fingerprinting is light, but advancedStealth blocks soft challenges:
   ```bash
   curl -X POST https://api.browserbase.com/v1/sessions \
     -H "X-BB-API-Key: $BROWSERBASE_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"projectId":"<PID>","keepAlive":true,
          "proxies":[{"type":"browserbase","geolocation":{"country":"IN"}}],
          "browserSettings":{"advancedStealth":true},
          "region":"ap-southeast-1"}'
   ```
   **Confirm the egress IP** by opening `https://ipinfo.io/json` before navigating to IndiaMART — `country: "IN"` is the precondition. If the IP is anywhere else, abort: the rest of the flow will redirect to `export.indiamart.com` and return 403. On the Browserbase account used during this skill's development the `proxies` config was silently accepted but **not applied** (`proxyBytes: 0`, egress remained AWS `us-west-2`) — that's an account-tier symptom, not a config bug. Verify with `ipinfo.io` first; do not assume.

2. **Open the search URL directly** — do not fight the homepage form (autocomplete dropdown + JS validator). The form's `action` is `https://dir.indiamart.com/search.mp?` with input `name="ss"` and a hidden `prdsrc=1`. The canonical search URL is:
   ```
   https://dir.indiamart.com/search.mp?ss={query}&cq={city}
   ```
   - `ss` — product/service query (URL-encoded, spaces as `+`).
   - `cq` — city filter (capitalized, e.g. `Coimbatore`, `Mumbai`, `New+Delhi`). The "City Quotient" filter; the dir-search page also supports it as a left-sidebar facet but appending it to the URL skips a click.
   - Optional: `prdsrc=1` (product-search-flag; appears to be a passive analytics tag).
   - Optional: `mcatId={n}` — micro-category ID (numeric). Discoverable from the category breadcrumb on a result page.

3. **Wait for the result list to render**, then scrape supplier cards. Each card is a `<div>` (class names rotate but the structural pattern is stable):
   - **Company name + storefront URL** — main `<a>` tag in the card header. URL shape: `https://www.indiamart.com/{supplier-slug}/`.
   - **Product title** — `<h2>` or `<p class="producttitle">` inside the card body.
   - **Price** — `<p class="price">` containing either an absolute INR amount ("₹ 12,500 / Piece") or the literal string "Get Latest Price" (price hidden until RFQ). Treat "Get Latest Price" as a sentinel, not a real value.
   - **Location** — `<p class="newLocationUi">` or text node ending in `, {state}`. Format: `"{City}, {State}"`. Cross-check against the `cq=` filter — IndiaMART sometimes includes nearby-metro suppliers when the city has few exact-match listings.
   - **Verification + tenure** — look for the "TrustSEAL Verified" / "GST" / "{N} Years" pill stack near the company name. Capture as boolean flags + `years_on_platform: number`.
   - **Rating + reviews** — `<span class="bo">{rating}</span>` followed by `({review_count} Reviews)`.
   - **Response rate / time** — sometimes present, e.g. "84% Response Rate" / "Replies within 2 hours". Optional field.

4. **Paginate.** Result page typically renders ~20 cards. Pagination is via the bottom `<a>` links: `&start={offset}` where offset increments by ~20. Confirm `total_results` from the page header (e.g. "About 1,234 products available from 234 suppliers in Coimbatore").

5. **Stop at the listing screen.** Do **not** click "Get Best Price" (opens RFQ modal → submits a lead), do **not** click phone-reveal (triggers OTP), do **not** follow into the supplier storefront unless an explicit per-supplier deep-fetch is requested.

### Non-browser fallback (HTTP-only)

When residential-IN proxies are unavailable, **there is no working non-browser path**. Specifically:

- `browse cloud fetch https://dir.indiamart.com/search.mp?ss=shredders&cq=Coimbatore --proxies` returns **HTTP 302** to `https://export.indiamart.com/search.php?ss=shredders`, which returns **HTTP 403**. Confirmed during development (2026-05-21).
- The export site (`export.indiamart.com`) is for international buyers and is hard-blocked to non-authenticated traffic — even with `--verified --proxies`, the body is `"403 Forbidden"`.
- `dir.indiamart.com/{city}/` (e.g. `/coimbatore/`) **does** serve a 200 from non-IN IPs (city yellow-pages directory) — but it's a generic landing page, not a product-search results page, and does not contain shredder listings or any product-filter parameter.
- `dir.indiamart.com/impcat/shredders.html` is **404** — there's no national-category landing page for "shredders" under that path. The canonical category URL slug, if one exists, is not `shredders`.
- IndiaMART's autocomplete suggestion endpoint (`suggest.imimg.com/suggest.php`) is **404** — either deprecated or moved behind auth.

If you must operate from outside India and an IN-residential proxy is genuinely unobtainable, the skill has no path forward — terminate and report the geo-block, do not silently scrape `export.indiamart.com` (it's 403, and the path differs from `dir.` even when it does respond).

## Site-Specific Gotchas

- **Geo wall (IP-based 302 → 403)** — confirmed 2026-05-21. Any GET to `https://dir.indiamart.com/search.mp?ss=…` from a non-Indian source IP returns `302 Location: https://export.indiamart.com/search.php?ss={query}`, which serves a 1KB `403 Forbidden` page. This is enforced at the load balancer / edge layer, **not** by user-agent fingerprint and **not** by `r=` or `iploc` cookies. Tested cookie spoofing of `r=in` and `iploc=gcniso%3DIN%7C…` from a US (Oregon, AWS) egress IP — both ignored, redirect persists. The **only** reliable bypass is an actual Indian egress IP.
- **`proxyBytes: 0` is a tell** — if your Browserbase session was created with `proxies: [{type:"browserbase",geolocation:{country:"IN"}}]` but the egress IP from `ipinfo.io/json` is still in `us-west-2` (Oregon/Boardman, AWS), and the session GET shows `proxyBytes: 0`, the proxy was silently dropped. Browserbase accepts the JSON without 4xx but doesn't apply it on accounts/plans that don't include residential proxies. Verify egress geolocation explicitly before each run; do not trust the create-session response.
- **`export.indiamart.com` is not a fallback** — it's a separate property serving international exporters with a different navigation. The 403 returned to bots is not a soft challenge; there is no `cf-clearance`-style cookie to acquire. Don't waste turns trying.
- **City directory pages (`dir.indiamart.com/{city}/`) are accessible from any IP but useless for product search** — they're city yellow-pages aggregators (titled e.g. *"Coimbatore Yellow Pages - Directory of Companies"*) and list top categories by industry, not product-filtered supplier listings. They do confirm the city slug exists in IndiaMART's URL space (e.g. `coimbatore`, `mumbai`, `new-delhi`) — useful for sanity-checking the `cq=` value.
- **Cookie tells** — IndiaMART sets `r=g` (region=global) for non-Indian IPs and would set `r=in` for Indian IPs. The `iploc` cookie carries the server-resolved geolocation: `iploc=gcniso%3DUS%7Cgcnnm%3DUnited%20States%20Of%20America%7Cgctnm%3DBoardman%7C…` — useful as a debug sentinel to confirm what IP the server thinks you have, but **not** writable to spoof.
- **Search-form action is a redirect target** — the homepage form posts via GET to `https://dir.indiamart.com/search.mp?` with `ss={query}` and hidden `prdsrc=1`. Filling the form on `www.indiamart.com` and pressing Enter triggers the redirect. Bypass by GETting the full URL directly.
- **`www.indiamart.com/search.html` ≠ search results** — it's an "Advanced Search" landing page (title: *"Advanced Search - IndiaMART"*) with a search form. It's served 200 from any IP, has zero results content, and submits to the same geo-blocked `dir.indiamart.com/search.mp`.
- **Single-word vs. plural slugs** — `dir.indiamart.com/coimbatore/shredders.html` 301-redirects to `/impcat/shredders.html` (which is 404). `…/shredder.html` 301-redirects to `/impcat/shredder.html` (also 404). The city-product URL pattern only works when IndiaMART has pre-indexed a city-product pair as a landing page; for ad-hoc queries, use `search.mp?ss=…&cq=…` instead.
- **Result count is approximate** — the "About 1,234 products" header is a rounded count; the actual supplier count differs from product count, and pagination eventually trails off into less-relevant cross-category results around the 200-supplier mark.
- **Phone reveal + "Get Best Price" are write actions** — both fire backend events (`/services/contactsupplier`, `/services/postbl`) that count as a lead from the supplier's perspective and may trigger an SMS/call to the buyer. Read-only skill: stop at the listing card; do not click these CTAs.
- **Autocomplete suggest endpoint deprecated** — `https://suggest.imimg.com/suggest.php?text=…` returns 404. If you need to canonicalize a query (e.g. "shredder" vs. "shredding machine"), there is no live suggest API as of 2026-05; use the result page's "Did you mean…" hint instead.

## Expected Output

```json
{
  "query": "shredders",
  "city": "Coimbatore",
  "state": "Tamil Nadu",
  "url": "https://dir.indiamart.com/search.mp?ss=shredders&cq=Coimbatore",
  "total_products_approx": 1234,
  "suppliers_returned": 20,
  "suppliers": [
    {
      "company_name": "Acme Recycling Machines Pvt. Ltd.",
      "storefront_url": "https://www.indiamart.com/acme-recycling-machines/",
      "product_title": "Industrial Paper Shredder, Capacity: 100 kg/hr",
      "price_inr": 125000,
      "price_label": "₹ 1,25,000 / Piece",
      "price_hidden": false,
      "city": "Coimbatore",
      "state": "Tamil Nadu",
      "trustseal_verified": true,
      "gst_verified": true,
      "years_on_platform": 12,
      "rating": 4.3,
      "review_count": 87,
      "response_rate_pct": 84,
      "response_time_label": "Replies within 2 hours",
      "product_image_url": "https://5.imimg.com/data5/…/shredder-125x125.jpg",
      "mcat_id": 3942
    },
    {
      "company_name": "Coimbatore Shredding Solutions",
      "storefront_url": "https://www.indiamart.com/coimbatore-shredding-solutions/",
      "product_title": "Heavy Duty Plastic Shredder",
      "price_inr": null,
      "price_label": "Get Latest Price",
      "price_hidden": true,
      "city": "Coimbatore",
      "state": "Tamil Nadu",
      "trustseal_verified": false,
      "gst_verified": true,
      "years_on_platform": 4,
      "rating": null,
      "review_count": 0,
      "response_rate_pct": null,
      "response_time_label": null,
      "product_image_url": "https://5.imimg.com/data5/…/heavy-duty-shredder-125x125.jpg",
      "mcat_id": 3942
    }
  ]
}
```

**Outcome shapes**:

- **`ok`** — at least one supplier card rendered (shape above).
- **`no_results`** — page header reads *"No products found"* / *"Sorry, no matching results"*; `suppliers: []`, `total_products_approx: 0`. Try broadening (drop `cq=`, try synonyms — `shredder` / `shredding machine` / `paper shredder`).
- **`geo_blocked`** — final URL is `https://export.indiamart.com/search.php?ss=…` and body is `"403 Forbidden"`. Report `{ "error": "geo_blocked", "egress_country": "<ISO2>", "remediation": "use India residential proxy" }` and stop. This is the expected failure shape when the session is not on an Indian IP.
- **`rate_limited`** — `dir.indiamart.com` returns `429` (observed once during development on a stealth + non-IN-proxy session). Back off ≥ 60s before retrying; rotating the egress IP also clears it.
