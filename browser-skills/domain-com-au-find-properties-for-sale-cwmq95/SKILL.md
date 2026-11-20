---
name: domain-com-au-find-properties-for-sale-cwmq95
title: Domain.com.au Find Properties For Sale
description: >-
  Enumerate residential for-sale listings on Domain.com.au by discovering
  canonical listing URLs from the public sitemap and parsing the __NEXT_DATA__
  JSON embedded in each listing-detail page. Returns address,
  beds/baths/parking, sale method, agency, agents, lat/lon, features, and
  timestamps. Read-only.
website: domain.com.au
category: real-estate
tags:
  - real-estate
  - australia
  - listings
  - akamai
  - sitemap
source: 'browserbase: agent-runtime 2026-05-25'
updated: '2026-05-25'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      A stealth + residential-proxy Browserbase session can load the homepage
      and the first one or two listing-detail URLs, but the /sale/{suburb}/
      search/index pages are reliably Akamai-blocked (Access Denied) and the
      session gets fingerprinted as a bot after a handful of requests. Use only
      as a single-listing visual fallback; do not use to enumerate.
  - method: api
    rationale: >-
      Domain runs an OAuth-protected developer API at api.domain.com.au, but
      every public doc URL we hit redirected to a Next.js 404 and an
      unauthenticated POST to /v1/listings/residential/_search returns No
      Matching Route. If you have a registered OAuth client + token, swap to the
      API; the sitemap path documented here is the unauth route.
verified: true
proxies: true
---
# Domain.com.au — Find Properties for Sale

## Purpose

Enumerate residential and project properties currently listed for sale on Domain.com.au and return structured data per listing (address, suburb/state/postcode, property type, beds/baths/parking, sale method, agency + agent contacts, lat/lon, features, listed/modified timestamps, and the canonical listing URL). Read-only — never submits enquiries, never books inspections.

## When to Use

- "Show me what's for sale in Sydney NSW 2000" / "show me new for-sale listings posted today on Domain"
- Daily monitoring of new sale listings in one or more suburbs / postcodes / states.
- Bulk extraction of for-sale inventory for an analytics pipeline.
- Anywhere you'd be tempted to scrape `/sale/{suburb}/` HTML — that path is hard-blocked by Akamai (see Site-Specific Gotchas); the sitemap → per-listing detail-page route below is the actual working path.

## Workflow

Domain.com.au is hosted behind **Akamai Bot Manager Premier**. The HTML *search/index* pages at `/sale/{state}/`, `/sale/{suburb}-{state}-{postcode}/`, etc. are reliably blocked even from a stealth (`--verified`) + residential-proxy (`--proxies`) Browserbase session — both a direct `browse open` and a UI click-through from the homepage land on Akamai's `Access Denied` page. **Do not attempt to enumerate listings by browsing the search-results pages.** The recommended path is the sitemap → per-listing fetch flow below; it relies on Domain's own publicly-advertised `robots.txt`-listed sitemaps and the `__NEXT_DATA__` JSON embedded in each listing-detail HTML page.

### 1. Discover listing URLs from the public sitemap

The sitemap index is freely fetchable (no Akamai challenge on these XML endpoints):

```
GET https://www.domain.com.au/sitemap-listings-sale.xml
```

That returns a `<sitemapindex>` referencing 9 numbered chunks plus a "last 24 hours" chunk:

```
https://www.domain.com.au/sitemap-listings-sale-1.xml.gz          (~20 000 URLs each)
…
https://www.domain.com.au/sitemap-listings-sale-9.xml.gz
https://www.domain.com.au/sitemap-listings-sale-last24hours.xml.gz  (~1 300 URLs, new today)
```

Pick `last24hours.xml.gz` for the new-listings-today use case; iterate `1.xml.gz`..`9.xml.gz` for the full ≈180 k for-sale inventory.

```bash
# Fetch one chunk. browse cloud fetch returns the body base64-encoded —
# decode, then gunzip.
browse cloud fetch \
  "https://www.domain.com.au/sitemap-listings-sale-last24hours.xml.gz" \
  --proxies --output /tmp/chunk.b64
base64 -d /tmp/chunk.b64 > /tmp/chunk.gz
gunzip -c /tmp/chunk.gz | grep -oE 'https://www\.domain\.com\.au/[^<]+'
```

Each `<loc>` is a canonical listing URL of the form:

```
https://www.domain.com.au/{optional-street-prefix-}{suburb}-{state}-{postcode}-{listingId}
```

- `{listingId}` is a 10-digit integer (e.g. `2020775678`); same id as Domain's internal listingId.
- `{state}` is one of `nsw|vic|qld|wa|sa|tas|act|nt`.
- `{suburb}` is the kebab-cased suburb name.
- `{postcode}` is the 4-digit Australian postcode.

**Suburb / state / postcode filtering is a pure substring match on the URL** — no need to fetch each page to filter. Example: Sydney CBD listings → `grep -- '-sydney-nsw-2000-'`. NSW only → `grep -E '-nsw-[0-9]{4}-[0-9]+$'`.

### 2. Fetch each listing's detail page and extract `__NEXT_DATA__`

Each listing-detail HTML contains a `<script id="__NEXT_DATA__" type="application/json">…</script>` block (Next.js SSR payload). The data you need lives at `props.pageProps.componentProps`:

```bash
browse cloud fetch \
  "https://www.domain.com.au/roseville-nsw-2069-2020775497" \
  --proxies --output /tmp/listing.html
node -e "
const s=require('fs').readFileSync('/tmp/listing.html','utf8');
const m=s.match(/<script id=\"__NEXT_DATA__\" type=\"application\/json\">([\s\S]*?)<\/script>/);
if(!m){ console.error('akamai-blocked (size='+s.length+')'); process.exit(1); }
const cp=JSON.parse(m[1]).props.pageProps.componentProps;
console.log(JSON.stringify({
  listingId: cp.listingId,
  url: cp.listingUrl,
  address: cp.address,
  street: cp.street, streetNumber: cp.streetNumber, unitNumber: cp.unitNumber,
  suburb: cp.suburb, state: cp.stateAbbreviation, postcode: cp.postcode,
  propertyType: cp.propertyType,
  beds: cp.beds,
  baths:   (cp.listingSummary||{}).baths,
  parking: (cp.listingSummary||{}).parking,
  saleMethod: (cp.listingSummary||{}).method,     // privateTreaty | auction | …
  mode:       (cp.listingSummary||{}).mode,        // 'buy'
  status:     (cp.listingSummary||{}).status,      // newDevelopment | …
  headline: cp.headline,
  title:    (cp.listingSummary||{}).title,         // displayed price/inspection text
  selfPrice: (((cp.listingsMap||{})[cp.listingId]||{}).listingModel||{}).price,
  agencyName: cp.agencyName,
  agents: ((cp.priceGuide||{}).agents||[]).map(a=>({name:a.name,phone:a.phone,email:a.email})),
  estimatedPrice: (cp.priceGuide||{}).estimatedPrice,
  lat: (cp.map||{}).latitude, lon: (cp.map||{}).longitude,
  features: cp.features,
  isArchived: cp.isArchived,
  createdOn: cp.createdOn, modifiedOn: cp.modifiedOn
},null,2));"
```

A 200-OK response is ≈500 KB of HTML. An Akamai-blocked response is **either** a 2 592-byte body that opens with `<!DOCTYPE html><html lang="en"><body><script type="text/javascript" src="/f_EAs/…"` (the Akamai BMP JS challenge page — no `__NEXT_DATA__`), **or** a 403 with a 5 89-byte `<TITLE>Access Denied</TITLE>` body. Treat both as "blocked; retry after backoff" — do **not** ship as a real result.

### 3. Throttle and retry

Even with `--proxies`, individual listing fetches will start returning Akamai challenges (200 + ~2.5 KB body) and hard 403 / Access-Denied bodies after a handful of rapid requests from the same source. Empirically: ≥10–30 s between fetches is the right sustained pace; bursts of 2–3 quick fetches before throttling are usually tolerated. On a challenge or 403, back off for 30–60 s and retry. The `last24hours` chunk has ≈1 300 URLs/day, so a 15 s sustained cadence (~96 fetches/day budgeted at 15 s = ~5.5 h) is feasible for a full pass.

For a one-shot "show me listings in Sydney NSW 2000": grep the sitemap chunks for `-sydney-nsw-2000-`, take the first 10–20, fetch each with a 15 s sleep between, and you'll have a clean structured result set.

### Browser fallback

A stealth Browserbase session (`--verified --proxies`, region `ap-southeast-1` for best results) can open the **homepage** (`https://www.domain.com.au/`) and an individual listing-detail URL **once or twice from a fresh session** before Akamai escalates to `Access Denied`. The accessibility-tree snapshot of the loaded listing-detail page contains the same address/beds/baths/agent info, but per-session this path doesn't scale past a handful of URLs and the `__NEXT_DATA__` route (above) is strictly better. Never rely on the browser to enumerate the `/sale/{suburb}/` index pages — those are blocked at first nav from every session we tried (`--verified --proxies` in both `us-west-2` and `ap-southeast-1`, with and without `--solve-captchas`).

## Site-Specific Gotchas

- **`/sale/{state}/`, `/sale/{suburb}-{state}-{postcode}/`, `/sale/{location}/{type}/`, `/sale/{location}/{type}/{N}-bedrooms/` index pages are hard-blocked by Akamai** for both browser-driven sessions and `browse cloud fetch --proxies`. Browser nav lands on a JS-less `Access Denied` page (title literally `"Access Denied"`, ref `18.*.*.*`). Fetch returns either the same `Access Denied` 403 or a 2 592-byte Akamai BMP JS challenge that needs a real browser to solve — the homepage already loaded those cookies but the protection layer on `/sale/` is independent.
- **Sitemaps are not blocked.** `https://www.domain.com.au/sitemap-listings-sale.xml` (index) and the `…-{1..9}.xml.gz` + `…-last24hours.xml.gz` chunks return cleanly via `browse cloud fetch --proxies`. They're listed in `robots.txt`, so this is the officially-blessed enumeration path.
- **`browse cloud fetch` returns body bytes base64-encoded for binary content** — `.xml.gz` sitemap chunks come back as `H4sIAAAAAAAA…` (base64-of-gzip). `base64 -d input.b64 > out.gz && gunzip -c out.gz` to read them. For HTML the body comes through as UTF-8 directly via `--output`.
- **Listing URLs are NOT under `/sale/`** — they're at the bare-domain root: `https://www.domain.com.au/{optional-street-}{suburb}-{state}-{postcode}-{listingId}`. The `street` prefix is optional and present only when the address is publicly displayed (some new-development listings show only suburb-level location).
- **The `__NEXT_DATA__` JSON is the entire SSR payload** — about 500 KB for a typical apartment listing. Parse it with `JSON.parse()` and read `props.pageProps.componentProps`. Useful sub-keys: `listingId`, `address`, `suburb`, `stateAbbreviation`, `postcode`, `propertyType`, `beds`, `listingSummary.{baths,parking,method,mode,status,title}`, `agencyName`, `priceGuide.{agents[],estimatedPrice}`, `map.{latitude,longitude}`, `features[]`, `headline`, `isArchived`, `createdOn`, `modifiedOn`, `listingsMap[id].listingModel.price` (the displayed price text for the listing).
- **Price is not always a number.** Domain's `componentProps.priceGuide.estimatedPrice` is frequently `{from:null,to:null}` because the agent has set the listing to "display suburb only" (`componentProps.displayType === 'suburbOnly'`) or "contact agent". The actually-displayed text (e.g. `"Auction - Contact Agent"`, `"Private Sale: $2,600,000 - $2,700,000"`, `"CONTACT AGENT"`) lives at `componentProps.listingsMap[listingId].listingModel.price`. Always emit both: the raw display text and the parsed numeric range (or `null`).
- **`saleMethod` values observed:** `privateTreaty`, `auction`. `mode` is always `buy` for for-sale listings; if `mode === 'rent'` you're on a rental listing — drop it.
- **`isArchived: true` listings are still in the sitemap for a short window.** Skip them unless the caller specifically asked for off-market history. The `last24hours.xml.gz` chunk occasionally contains a just-archived listing whose detail page still renders.
- **Rate-limit pattern.** Akamai BMP doesn't return `429`; instead, blocked requests come back as one of: (a) 200 + ~2 592-byte JS-challenge body (no `__NEXT_DATA__`), (b) 403 + ~589-byte `<TITLE>Access Denied</TITLE>` body. Detect by `size < 5000 || !html.includes('__NEXT_DATA__')` and retry with backoff ≥ 30 s. ≥ 15 s sustained spacing between detail-page fetches works in practice.
- **Don't waste time on the "Domain Group API" link.** `https://developer.domain.com.au/` is a real OAuth-protected developer portal (api.domain.com.au + Bearer token), but every documentation URL we hit returned a `Refresh: 0;url=…` redirect followed by a Next.js 404 page (`<title>Page Not Found | Domain Developer Portal</title>`). Naive POST to `api.domain.com.au/v1/listings/residential/_search` returns `{"title":"Not Found","detail":"No Matching Route"}`. Without a registered OAuth client + access token, the API path is **not** open; the sitemap + detail-page route documented above is the unauth path. If you have an OAuth token, swap this skill for a direct API call.
- **GraphQL endpoint exists but is unverified.** `props.pageProps.componentProps.graphqlApi` is exposed in the detail-page `__NEXT_DATA__` but we did not confirm it accepts cookieless POSTs from outside the page context. Treat as "don't waste time" until verified, and use the sitemap route.
- **Region matters for fetching speed, not for unblocking.** A Browserbase session in `ap-southeast-1` (Singapore — closest to AU) and one in `us-west-2` were both equally blocked on `/sale/*` pages and equally tolerated on listing-detail and sitemap fetches. Pick `ap-southeast-1` for marginally lower latency; it is not a workaround for the index-page block.
- **`--solve-captchas` does not help.** The block we see is Akamai BMP behavioural-fingerprint denial, not a Google reCAPTCHA challenge. Adding `--solve-captchas` to the session create call leaves the `Access Denied` outcome unchanged.
- **READ-ONLY skill.** Never click "Enquire", "Apply", "Book Inspection", "Make Offer", or any agent-contact submit button — those start a workflow that emails the agent.

## Expected Output

A list of structured listing records. Each record covers one for-sale property:

```json
{
  "query": { "suburb": "Roseville", "state": "nsw", "postcode": "2069" },
  "source": "sitemap-listings-sale-last24hours.xml.gz",
  "totalDiscovered": 6,
  "listings": [
    {
      "listingId": 2020775497,
      "url": "https://www.domain.com.au/roseville-nsw-2069-2020775497",
      "address": "Roseville NSW 2069",
      "street": null,
      "streetNumber": null,
      "unitNumber": "",
      "suburb": "Roseville",
      "state": "nsw",
      "postcode": "2069",
      "propertyType": "New Apartments / Off the Plan",
      "beds": 3,
      "baths": 2,
      "parking": 2,
      "saleMethod": "privateTreaty",
      "mode": "buy",
      "status": "newDevelopment",
      "headline": "3 Bedrooms + Study Luxury Apartment with Fireplace & Modern Elegance",
      "displayPriceText": "Contact Agent to Book Inspection",
      "estimatedPrice": { "from": null, "to": null },
      "agencyName": "Shah & Patel Properties",
      "agents": [
        { "name": "Sales Team",  "phone": "0422 215 261", "email": null },
        { "name": "Ankit Shah",  "phone": "0430 049 797", "email": null }
      ],
      "lat": -33.7842176,
      "lon": 151.1894277,
      "features": ["Balcony", "Courtyard", "Fully Fenced", "Outdoor Entertainment Area",
                   "Remote Garage", "Secure Parking", "Alarm System",
                   "Broadband Internet Available", "Built-in Wardrobes"],
      "isArchived": false,
      "createdOn":  "2026-04-20T16:27:32.017",
      "modifiedOn": "2026-05-24T14:41:58.323"
    }
  ]
}
```

Distinct outcome shapes the caller should handle:

```json
// (a) Success — fetched listing detail pages parsed cleanly.
{ "success": true, "totalDiscovered": 6, "listings": [...] }

// (b) Partial — sitemap discovery worked; some detail-page fetches were
// Akamai-blocked after retry. Emit what you have plus the unresolved URLs.
{ "success": true, "totalDiscovered": 12, "listings": [/* 9 records */],
  "blocked": [
    "https://www.domain.com.au/level-12-303-castlereagh-street-sydney-nsw-2000-2013554678",
    "https://www.domain.com.au/10-nicolle-walk-sydney-nsw-2000-2013543098"
  ],
  "blocked_reason": "akamai_challenge" }

// (c) Filter returned zero matching URLs in the sitemap — not an error;
// just no for-sale listings matched the caller's suburb/postcode filter
// in the chosen chunk.
{ "success": true, "totalDiscovered": 0, "listings": [],
  "note": "no listings matched -sydney-nsw-2000- in last24hours chunk" }

// (d) Hard failure — sitemap fetch itself returned Akamai challenge or
// non-XML. The whole pipeline is wedged; the caller should retry after
// backoff or fall back to the OAuth API path.
{ "success": false, "reason": "sitemap_unreachable",
  "details": "sitemap-listings-sale-last24hours.xml.gz returned 2592-byte Akamai challenge" }
```
