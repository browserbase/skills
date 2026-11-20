---
name: apartments-com-search-rentals-33icwz
title: Apartments.com Rental Search
description: >-
  Search Apartments.com for rental listings in a city (optionally filtered by
  price, bedrooms, or type) and return each property's name, address, rent
  range, bed range, phone, and listing URL plus the total result count.
  Read-only.
website: apartments.com
category: real-estate
tags:
  - real-estate
  - rentals
  - apartments
  - search
  - akamai
  - read-only
source: 'browserbase: agent-runtime 2026-06-04'
updated: '2026-06-04'
recommended_method: browser
alternative_methods:
  - method: fetch
    rationale: >-
      Confirmed NOT viable — direct HTTP GET of any search URL returns 403
      AkamaiGHost both with and without residential proxies. Akamai Bot Manager
      requires a JS-challenge-solving browser, so there is no API/fetch
      shortcut; a stealth (--verified) + residential-proxy (--proxies) browser
      session is the only working path.
verified: true
proxies: true
---
# Apartments.com Rental Search

## Purpose

Search Apartments.com for rental listings in a given location (city/state, optionally
filtered by price, bedrooms, or property type) and return the page of matching
properties — community name, full address, rent range, bedroom range, phone, and the
canonical listing URL — plus the site's reported total result count. Read-only: never
contacts a property, never submits a lead form.

## When to Use

- "Find rentals in {city} under ${price}/mo" / "2-bedroom apartments in {city}".
- Bulk monitoring of available rentals in a metro on a schedule.
- Feeding a downstream agent a structured list of candidate properties with links to
  drill into.
- Anywhere you'd otherwise scrape Apartments.com search HTML — the page embeds clean
  structured data (placard DOM + JSON-LD) that extracts in a single JS eval.

## Workflow

Apartments.com is browser-only. There is **no usable API or HTTP-fetch shortcut**: a
plain `GET` of any search URL — even through residential proxies — returns
`403 AkamaiGHost` because Akamai Bot Manager requires a real browser that solves its JS
challenge. You must drive a stealth + residential-proxy browser session. Deep-link the
search URL directly (no need to type into the search box), then extract listings with
one `browse eval` reading the result placards.

### 1. Create a stealth + residential-proxy session (MANDATORY)

```bash
browse cloud sessions create --keep-alive --verified --proxies
```

Both `--verified` AND `--proxies` are required. A bare or proxy-less session is denied
immediately. Even a fully-stealthed session is blocked intermittently — see Gotchas;
budget for fresh-session retries.

### 2. Build the search URL and navigate

URL grammar: `https://www.apartments.com/{city}-{state-abbr}/` plus optional filter path
segments. Examples:

| Intent | URL |
|---|---|
| All rentals in a city | `https://www.apartments.com/chicago-il/` |
| Max price $2,500 | `https://www.apartments.com/chicago-il/under-2500/` |
| Min price $3,000 | `https://www.apartments.com/new-york-ny/min-3000/` |
| 2 bedrooms | `https://www.apartments.com/chicago-il/2-bedrooms/` |
| 2 bedrooms + max price | `https://www.apartments.com/chicago-il/2-bedrooms-under-2500/` |
| Range + price | `https://www.apartments.com/chicago-il/1-to-2-bedrooms-under-2000/` |

```bash
browse open "https://www.apartments.com/chicago-il/under-2500/"
browse wait load
browse wait timeout 3000
browse get title    # expect "Apartments for Rent ... in Chicago IL | Apartments.com"
```

If `browse get title` returns **"Access Denied"**, the session got challenge-blocked.
`browse reload` and wait ~6s — it frequently renders on the 2nd try in the same session.
If it's still denied after 2 reloads, abandon that session and create a new one. Do NOT
loop reloading the same session many times (that wastes turns and never recovers).

Do **not** call `browse snapshot` — the page has thousands of nodes; the snapshot is
enormous and unnecessary.

### 3. Extract all placards with one `browse eval`

The search results are `article.placard` elements (~40 per page). Run this eval (it
returns a compact JSON string — proven across multiple runs):

```bash
browse eval "(() => {
  const out = { total_results: null, listings: [] };
  // total count lives in a results header, e.g. '9,533 Rentals Available' — NOT always the title
  const cnt = document.querySelector('.searchResults, .resultSummary, [class*=resultsCount]');
  const m = (cnt ? cnt.textContent : (document.title||'')).match(/([\\d,]+)\\s+Rentals/i)
         || (document.body.innerText||'').match(/([\\d,]+)\\s+Rentals/i);
  if (m) out.total_results = parseInt(m[1].replace(/,/g,''));
  for (const card of document.querySelectorAll('article.placard')) {
    const name = (card.querySelector('.js-placardTitle, .title')||{}).textContent;
    const address = (card.querySelector('.property-address')||{}).textContent;
    const link = card.querySelector('a.property-link');
    const url = link ? link.href.replace(/#.*$/,'').replace(/\\?.*$/,'') : null;
    const beds=[], prices=[];
    for (const box of card.querySelectorAll('.bedRentBox')) {
      const b=box.querySelector('.bedTextBox'), p=box.querySelector('.priceTextBox');
      if (b) beds.push(b.textContent.trim());
      if (p) prices.push(p.textContent.trim());
    }
    const nums = prices.map(p=>parseInt(p.replace(/[^\\d]/g,''))).filter(n=>n);
    let rent=null;
    if (nums.length===1) rent=prices[0];
    else if (nums.length>1) rent='$'+Math.min(...nums).toLocaleString()+' - $'+Math.max(...nums).toLocaleString();
    const bedRange = beds.length===1 ? beds[0] : (beds.length>1 ? beds[0]+' - '+beds[beds.length-1] : null);
    const phone = (card.querySelector('.phone-link span, a.phone-link')||{}).textContent;
    if (name||url) out.listings.push({
      name: name?name.trim():null, address: address?address.trim():null,
      url, rent, beds: bedRange, baths: null, phone: phone?phone.trim():null
    });
  }
  out.result_count_on_page = out.listings.length;
  return JSON.stringify(out);
})()"
```

Parse the returned `result` string into your output object. The eval yields ~40 clean
listings per page (run-004: 40/40 with name, address, url, rent, beds, phone populated).

### 4. Emit output

Set `total_results` and `result_count_on_page` from the eval. **Do not paste all ~40
listings verbatim into a single LLM turn** — that exceeds the per-turn output token
budget. The eval's `result` is the source of truth; surface a representative slice (e.g.
first 12) inline and note that `result_count_on_page` reflects the full page.

### Cross-check / alternative field source — JSON-LD

The page also embeds `<script type="application/ld+json">` whose `@graph` has one node
per listing where `mainEntity['@type'] === 'ApartmentComplex'`, carrying `name`, the
canonical URL in `@id` (strip the `#apartmentcomplex` fragment), a full `PostalAddress`,
`geo` lat/lon, `amenityFeature[]`, and an `offers` `AggregateOffer` with
`lowPrice`/`highPrice`. Use it to obtain exact coordinates, postal code, or amenities, or
to cross-check rent. It does **not** contain beds/baths — that's why the placard DOM
above is the primary path.

## Site-Specific Gotchas

- **No API / HTTP-fetch path — confirmed blocked.** Direct `GET` of search URLs returns
  `403 AkamaiGHost` even with residential proxies (verified: `browse cloud fetch` both
  with and without `--proxies` → 403). Don't waste time hunting for a JSON endpoint; you
  must use a full stealth browser.
- **`--verified --proxies` are both mandatory.** A bare remote session is denied on the
  search page. Set both flags at session-create time.
- **Akamai "Access Denied" is frequent and only partly recoverable.** Even a correctly
  stealthed session is intermittently served an Akamai block page (`<title>Access
  Denied</title>`, body referencing `errors.edgesuite.net`). Behavior observed during
  testing: sometimes the first navigation is blocked but a single `browse reload`
  recovers it in the same session (run-002); other times *every* fresh session is blocked
  for a sustained stretch (4+ consecutive fresh sessions denied during one window).
  **Treat success as probabilistic**: retry with a fresh `--verified --proxies` session,
  up to ~3–4 attempts, with a `reload` fallback per session. The block rate appears to
  climb after repeated hits from the same proxy pool, so space requests out.
- **Total count is NOT reliably in `<title>`.** Some renders title the page "Apartments
  for Rent under $2,500 in Chicago IL | Apartments.com" (no number); others include
  "9,522 Rentals". Read the on-page results header ("N Rentals Available") and fall back
  to `body.innerText` matching `/([\d,]+)\s+Rentals/`.
- **`baths` is not on the summary cards.** Placards expose bed ranges + per-bed pricing
  but not bathroom counts; `baths` will be null. Bathrooms only appear on the individual
  property detail page (`url`), which this skill does not open.
- **Don't dump page text.** `browse get text body` / `#placardContainer` return ~300KB
  and blow the inner agent's max output tokens (truncated run-001 and run-003). Always
  extract with the targeted `browse eval` above.
- **Don't use `browse snapshot`** on the results page — thousands of a11y nodes; not
  needed and expensive.
- **`a.property-link` href carries tracking fragments/queries.** Strip `#…` and `?…` to
  get the canonical `https://www.apartments.com/{slug}-{city}-{state}/{id}/` URL.
- **Listing inventory drifts.** Total result count changed between runs minutes apart
  (9,522 → 9,533) — expected; it's live availability, not an extraction error.

## Expected Output

```json
{
  "success": true,
  "location": "Chicago, IL",
  "filters": { "max_price": 2500 },
  "total_results": 9533,
  "result_count_on_page": 40,
  "listings": [
    {
      "name": "Presidential Towers",
      "address": "555 W Madison St, Chicago, IL 60661",
      "url": "https://www.apartments.com/presidential-towers-chicago-il/dsd9v8j/",
      "rent": "$1,641 - $1,993",
      "beds": "Studio - 1 Bed",
      "baths": null,
      "phone": "(708) 725-1991"
    },
    {
      "name": "4901 S Drexel",
      "address": "4901 S Drexel Blvd, Chicago, IL 60615",
      "url": "https://www.apartments.com/4901-s-drexel-chicago-il/xveplbn/",
      "rent": "$1,030 - $1,800",
      "beds": "Studio - 1 Bed",
      "baths": null,
      "phone": "(855) 589-9093"
    }
  ],
  "error_reasoning": null
}
```

Blocked outcome (Akamai wall, after exhausting fresh-session retries):

```json
{
  "success": false,
  "location": "Chicago, IL",
  "filters": { "max_price": 2500 },
  "total_results": null,
  "result_count_on_page": 0,
  "listings": [],
  "error_reasoning": "Akamai 'Access Denied' on every attempt across 4 fresh --verified --proxies sessions; proxy pool IP reputation appears flagged for this window."
}
```
