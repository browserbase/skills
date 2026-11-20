---
name: funda-nl-find-property-by-address-dsciyv
title: Find Funda Property by Address & Status
description: >-
  Resolve a Dutch address to its funda.nl listing and return the current status
  (for sale / sold / under offer / for rent / rented) plus type, asking price,
  and core listing facts, using the Browserbase Search + Fetch APIs with no
  scripted browsing.
website: funda.nl
category: real-estate
tags:
  - real-estate
  - funda
  - property
  - address-lookup
  - listing-status
  - netherlands
source: 'browserbase: agent-runtime 2026-06-09'
updated: '2026-06-09'
recommended_method: hybrid
alternative_methods:
  - method: fetch
    rationale: >-
      Once you already hold the detail URL, a single `browse cloud fetch <url>
      --proxies` returns the fully server-rendered page (JSON-LD + Status field)
      — no search step needed.
  - method: browser
    rationale: >-
      Fallback when the Search API can't resolve the address or Fetch is
      unavailable: `browse open <detail_url> --remote` then read a single
      `browse snapshot` (page is SSR; status, price, type all present). Still
      needs Search-API resolution for the URL, since the numeric listing id
      can't be constructed from an address.
  - method: api
    rationale: >-
      Funda's own search controls are not viable: the homepage autocomplete is
      location-only and flaky, the `free_text` query param does not filter, and
      the geo-suggestion Elasticsearch endpoint is CORS-locked to the page
      origin. Confirmed dead ends.
verified: false
proxies: true
---
# Find a Funda Property by Address and Get Its Status

## Purpose

Given a Dutch property address (street + house number, ideally with postcode and
city), locate its listing on funda.nl and return the current listing status
(for sale / sold / under offer / for rent / rented) together with core listing
facts: canonical address, property type, asking price (or rent), and the
listing URL. Read-only — never contacts an agent, places a bid, or saves a
favourite.

## When to Use

- Checking whether a specific address is currently listed on Funda and, if so,
  whether it is still available, sold, under offer, or rented.
- Monitoring the status of a known address over time (e.g. "is Singel 109-F
  still for sale?").
- Enriching an address with Funda's canonical listing data (type, asking price,
  time on market, sale date) before a deeper workflow.
- Anywhere you'd otherwise scrape the Funda search UI — the address→listing
  resolution + HTTP fetch path below is faster, cheaper, and dodges Funda's
  Akamai bot wall and its flaky location-only search box.

## Workflow

The optimal path uses **two Browserbase cloud HTTP APIs and zero scripted
browsing**. Funda detail pages are fully server-rendered (status, address,
price, and a JSON-LD block are all in the initial HTML), so once you have the
listing URL a single proxied fetch yields everything. The only non-trivial part
is resolving an address to its listing URL — Funda's own search box can't do it
reliably (see Gotchas), so use the Browserbase Search API instead.

1. **Resolve the address to a Funda detail URL** with the Search API:
   ```bash
   browse cloud search "{street} {number} {postcode} {city} funda"
   ```
   In the JSON `results[]`, take the first entry whose `url` host is
   `www.funda.nl` and whose path starts with `/detail/`. The result `title`
   already encodes the status, in the form
   `"{Type} {verb}: {street} {postcode} {city} | Funda"` where `verb` is one of
   `te koop` (for sale), `verkocht` (sold), `te huur` (for rent),
   `verhuurd` (rented). **Verify** the result's street + house number + city
   match the queried address before trusting it — for some addresses the exact
   house number is not the top hit and a neighbouring number is returned
   instead (treat a mismatch as ambiguous / not found).

2. **Fetch the detail page** through a residential proxy (Funda is behind
   Akamai Bot Manager — a bare fetch can be challenged; `--proxies` passes):
   ```bash
   browse cloud fetch "{detail_url}" --proxies
   ```
   Read `statusCode` from the envelope. `200` → parse it; `404`
   (`"Deze pagina kunnen we niet vinden"`) → the listing has been de-listed,
   report `status: "not_found"`.

3. **Extract the data** from the returned `content` HTML:
   - **Status** (authoritative): the `Status` row in the features list
     (Kenmerken → Overdracht). Rendered as `Status</dt>...<dd>{value}</dd>`.
     Values: `Beschikbaar` (available / for sale), `Verkocht` (sold),
     `Verkocht onder voorbehoud` (sold subject to conditions),
     `Onder bod` (under offer); rentals use `Beschikbaar` / `Verhuurd`.
   - **Address, type, price** from the JSON-LD block
     (`<script type="application/ld+json">`, the first one is the property):
     `name` = street + number, `@type` = `["{PropertyType}", "Product"]`
     (type is element 0, e.g. `Appartement`, `Huis`),
     `offers.price` = asking price in EUR, `address.{streetAddress,
     addressLocality, addressRegion}`. Postcode is in the `<title>` /
     `description` (not in the JSON-LD address).
   - **Sold-only extras** (when status is `Verkocht*`): the features list also
     carries `Aangeboden sinds` (listed since), `Verkoopdatum` (sale date) and
     `Looptijd` (time on market).

4. **Return** the assembled JSON (see Expected Output). The page `<title>` verb
   and, for sold listings, the `/verkocht/` URL segment both corroborate the
   `Status` field — cross-check them.

### Browser fallback

If the Search API can't resolve the address or the Fetch API is unavailable,
drive a remote (stealth) browser session and open the detail URL directly
(`browse open "{detail_url}" --remote`). The page is server-rendered, so a
single `browse snapshot` (≈470 refs) contains the status, price, type and full
features list — no clicks needed. Read the `Status` value from the snapshot.
**Do not** use `browse get text body` (it returns the consent-banner CSS/JS, not
content) — use `browse snapshot` or `browse get markdown body`. Accept the
cookie dialog ("Alles accepteren") if it blocks the view. This was validated
end-to-end (7 turns, correct extraction). Note that constructing a detail URL
from scratch is impossible without the listing's numeric id, so the browser
fallback still depends on Search-API resolution for the URL.

## Site-Specific Gotchas

- **Akamai Bot Manager**: Funda sets `ak_bmsc` / `bm_s` / `bm_ss` cookies and an
  `X-Akamai-Transformed` header. The Browserbase Fetch API **with `--proxies`**
  returns clean 200s for both search and detail pages; assume a bare
  (no-proxy) fetch may be challenged. The probe of the bare homepage reported
  "no antibots", but that only reflects the `301` root redirect — the app
  pages are Akamai-protected.
- **The homepage search box is location-only and unreliable for addresses.**
  The combobox placeholder is "Zoek op plaats, buurt of postcode"; it resolves
  cities / streets / postcodes / neighbourhoods, **not full house numbers**.
  Typing `Singel 109`, `Singel Amsterdam`, or even a bare postcode `1012 VG`
  returned "We kunnen deze locatie niet vinden" in automated sessions. Also,
  `browse fill` sets the value without firing the per-keystroke events the React
  combobox listens to, so no suggestion request fires — you must use real
  keystrokes (`browse type`). Even then suggestions frequently failed to render.
  Don't build the skill on this control.
- **`free_text` query param does not filter.** `https://www.funda.nl/zoeken/koop?free_text=...`
  is reflected in the page's JSON-LD but the SSR result set stays the full
  ~95,768-listing default regardless of the value (confirmed across three
  distinct queries incl. a nonsense string). Confirmed dead end — don't use it
  for address lookup.
- **Geo-suggestion API is CORS-locked.** The combobox calls
  `POST https://listing-search-wonen.funda.nl/geo-wonen-alias-prod/_search/template`
  with body `{"id":"searchbox_20250621","params":{"value":"...","area_types":[...]}}`.
  It is an Elasticsearch stored-template endpoint scoped to the page origin —
  a cross-origin `fetch()` from an injected script fails with "Failed to fetch".
  Don't waste time trying to call it directly; and even if reached it returns
  *areas*, not individual listings.
- **Sold listings move under `/detail/koop/verkocht/{city}/...`** (an extra
  `/verkocht/` path segment) and return 200 with `Status: Verkocht`. But some
  older sold/withdrawn listings are fully de-listed and return HTTP 404 — handle
  404 as `not_found`, not as an error.
- **Search-API resolution is good but not perfect.** Exact, well-known addresses
  (e.g. `Singel 109-F Amsterdam`) resolve to the right detail URL as the top
  hit; for some addresses the precise house number is absent and a neighbouring
  number is returned. Always verify street + number + city against the result
  title/JSON-LD; on mismatch, report `ambiguous`/`not_found` rather than the
  wrong listing.
- **JSON-LD `@type` is an array** like `["Appartement","Product"]` — the human
  property type is element `[0]`. The JSON-LD `address` omits the postcode;
  read the postcode from the `<title>` (`"...: {street} {postcode} {city} |
  Funda"`).
- **Prices are k.k.** ("kosten koper" — buyer pays transfer costs) for `koop`;
  rentals (`/detail/huur/...`) show a per-month figure. `offers.price` is the
  numeric value without the `k.k.` suffix.

## Expected Output

```json
{
  "success": true,
  "query_address": "Singel 109-F, 1012 VG Amsterdam",
  "matched": true,
  "address": "Singel 109-F",
  "postcode": "1012 VG",
  "city": "Amsterdam",
  "region": "Noord-Holland",
  "property_type": "Appartement",
  "offering_type": "koop",
  "price_eur": 1125000,
  "status": "Beschikbaar",
  "status_label_en": "available / for sale",
  "listed_since": null,
  "sale_date": null,
  "time_on_market": null,
  "listing_url": "https://www.funda.nl/detail/koop/amsterdam/appartement-singel-109-f/43703804/",
  "error_reasoning": null
}
```

Sold listing:

```json
{
  "success": true,
  "query_address": "Van Oldenbarneveldtstraat 89-5, 1052 JX Amsterdam",
  "matched": true,
  "address": "Van Oldenbarneveldtstraat 89-5",
  "postcode": "1052 JX",
  "city": "Amsterdam",
  "region": "Noord-Holland",
  "property_type": "Appartement",
  "offering_type": "koop",
  "price_eur": 425000,
  "status": "Verkocht",
  "status_label_en": "sold",
  "listed_since": "14 juni 2025",
  "sale_date": "15 juli 2025",
  "time_on_market": "4 weken",
  "listing_url": "https://www.funda.nl/detail/koop/verkocht/amsterdam/appartement-van-oldenbarneveldtstraat-89-5/89417959/",
  "error_reasoning": null
}
```

Not found / de-listed (HTTP 404, or no Funda `/detail/` result matching the
queried address):

```json
{
  "success": false,
  "query_address": "Some Street 999, 9999 ZZ Nowhere",
  "matched": false,
  "status": "not_found",
  "listing_url": null,
  "error_reasoning": "No funda.nl /detail/ listing matched the address (search returned only neighbouring numbers / the detail page returned HTTP 404 — listing de-listed)."
}
```
