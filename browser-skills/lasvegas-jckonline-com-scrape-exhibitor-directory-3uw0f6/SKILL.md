---
name: lasvegas-jckonline-com-scrape-exhibitor-directory-3uw0f6
title: JCK Las Vegas Exhibitor Directory Scrape
description: >-
  Extract the full list of exhibitors from the JCK Las Vegas show directory
  (~1,700 companies) with name, contact information (phone, email, website,
  country), description, booth/stand reference, and product categories. Uses the
  public Algolia search API embedded in the directory page — two HTTPS POSTs
  cover the full roster.
website: lasvegas.jckonline.com
category: trade-shows
tags:
  - trade-shows
  - directory
  - exhibitors
  - jewelry
  - algolia
  - lead-list
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: api
alternative_methods:
  - method: api
    rationale: >-
      The directory's SPA hydrates from a public Algolia search index whose
      appId + search-only API key are embedded directly in the page HTML. Two
      POSTs with hitsPerPage=1000 cover the full ~1,700-exhibitor roster in
      ~1.7s end-to-end. No auth, no rate limit observed, no anti-bot, no Referer
      enforcement — the key works from any origin.
  - method: browser
    rationale: >-
      Useful only if the Algolia endpoint is ever locked down or rate-limited
      (not observed). Drive the SPA at /en-us/about/exhibitor-directory.html,
      wait for hydration, and either call the same Algolia endpoint from page
      context via browse eval+fetch, or extract limited fields (name, booth)
      from the rendered card DOM. ~100× the cost of the API path for the same
      data.
verified: true
proxies: true
---
# JCK Las Vegas Exhibitor Directory Scrape

## Purpose

Return the full list of companies exhibiting at the current JCK Las Vegas show (held annually at The Venetian Expo, late May / early June) — including company name, contact information (phone, email, website, country), product description / show objective, booth/stand reference, sponsored category, product categories, neighborhood/pavilion, and logo URL. Read-only — never registers, never submits the "Add to Plan" or any contact form.

The directory is rendered by a single-page app that queries Algolia directly from the browser using a public search-only API key embedded in the page HTML. **The recommended path is to call the same Algolia endpoint yourself in two HTTPS requests** (≈1.7s, $0 LLM cost, all 1,700+ exhibitors in one JSON payload). Browser scraping of the SPA is technically possible but ~100× the cost and unnecessary.

## When to Use

- Building a lead list of jewelry trade-show exhibitors for prospecting, partnerships, or competitive research.
- One-shot dump of every exhibitor with structured contact info for ingestion into CRM / spreadsheet.
- Filtering exhibitors by booth zone (Currents, Bridal, Natural Diamonds, Design Collective, Essentials & Tech, Fashion Bridge, etc.) or product category (Antique & Estate, Loose Diamonds, Gold Jewelry, ...).
- Diffing the exhibitor roster year over year (e.g. who's new in 2026 vs 2025).
- Reconciling booth assignments — the API returns the canonical `standReference` (booth number) for every exhibitor.

## Workflow

JCK's frontend is built on Reed Exposition's `rxweb-prd` platform (also used by sibling shows like JIS, Vision Expo, NRF Big Show). The exhibitor list is hydrated client-side from a public Algolia search index whose appId + search-only API key are embedded directly in the directory page's HTML. **No auth, no cookies, no anti-bot, no CORS lock** — the key works from any origin, including `about:blank`.

### 1. Discover the current year's index name + eventEditionId

Both identifiers rotate each show edition. Fetch the directory page and grep them out of the inlined JSON config:

```bash
HTML=$(curl -sSL https://lasvegas.jckonline.com/en-us/about/exhibitor-directory.html)

# Algolia credentials (these have been stable across editions — only confirm)
APP_ID=$(echo "$HTML"   | grep -oE 'appId[^"]*"[A-Z0-9]+"'             | grep -oE '"[A-Z0-9]+"$' | tr -d '"')   # XD0U5M6Y4R
API_KEY=$(echo "$HTML"  | grep -oE 'apiKey[^"]*"[a-f0-9]{32}"'         | grep -oE '"[a-f0-9]{32}"' | tr -d '"') # d5cd7d4ec26134ff4a34d736a7f9ad47

# Per-edition identifiers (change every year)
INDEX=$(echo "$HTML"    | grep -oE 'evt\\u002D[a-f0-9\\u002D-]+\\u002Dindex' | head -1 | sed 's/\\u002D/-/g')
EVENT_ID=$(echo "$HTML" | grep -oE 'eventEditionId\\x22:\\x22eve\\u002D[a-f0-9\\u002D-]+' | head -1 \
              | sed 's/.*eventEditionId\\x22:\\x22//; s/\\u002D/-/g')
```

For the 2026 edition (May 29 – June 1, 2026):

- `APP_ID = XD0U5M6Y4R`
- `API_KEY = d5cd7d4ec26134ff4a34d736a7f9ad47`
- `INDEX = evt-83d00818-46c9-40ea-98a1-866e9bdb82d6-index`
- `EVENT_ID = eve-1567689e-7c22-4403-b3ff-84e1d010e5cf`

If the discovery grep fails, fall back to opening the directory page in a remote `browse` session and reading `request.json` from `browse network` capture — every `/query` POST to `*-dsn.algolia.net` reveals the live values.

### 2. Page through Algolia (2 requests for ~1,700 exhibitors)

The Algolia free tier caps `hitsPerPage` at 1000, so two requests cover the full directory (1,704 exhibitors as of the 2026 edition).

```bash
ENDPOINT="https://${APP_ID,,}-dsn.algolia.net/1/indexes/${INDEX}/query"
QS="x-algolia-application-id=${APP_ID}&x-algolia-api-key=${API_KEY}&x-algolia-agent=Algolia%20for%20JavaScript%20(3.35.1)%3B%20Browser"

for PAGE in 0 1; do
  curl -sS -X POST "${ENDPOINT}?${QS}" \
    -H "content-type: application/x-www-form-urlencoded" \
    -H "Referer: https://lasvegas.jckonline.com/" \
    --data "$(jq -nc --arg p "$PAGE" --arg e "$EVENT_ID" '
      {params: "query=&page=\($p)&hitsPerPage=1000&filters=recordType%3Aexhibitor%20AND%20locale%3Aen-us%20AND%20eventEditionId%3A\($e)"}')" \
    > "page-${PAGE}.json"
done

jq -s 'map(.hits) | add' page-0.json page-1.json > exhibitors.json
echo "Got $(jq length exhibitors.json) exhibitors"
```

The `filters` clause is mandatory. The index is multi-tenant (it also holds `recordType:product`, `recordType:session`, other locales, and prior editions) — without all three filters you get a noisy mix.

### 3. Decode each hit

Each `hits[]` element is a fully-decoded JSON object — no positional arrays, no offset lookups (unlike Craigslist). Map directly to your output schema:

| Hit field | Meaning |
|---|---|
| `exhibitorName` / `companyName` | Same value on most records. Prefer `exhibitorName` for display, fall back to `companyName`. |
| `exhibitorDescription` | Free-form multi-paragraph description, may contain `\n`. ~93% populated. |
| `showObjective` | Short marketing blurb ("Stock up on best-selling styles!"). Distinct from description. |
| `phone` | Plain string, no normalization. ~90% populated. |
| `email` | Plain string. ~92% populated. |
| `website` | Full URL incl. scheme. ~84% populated. May have trailing slash or `?utm=…`. |
| `countryName` | Display-cased country ("United States", "India", "Hong Kong"). 100% populated. |
| `standReference` | Booth number ("53010", "L100"). 100% populated. |
| `exhibitorFilters` | Nested object: `Neighborhood/Pavilion` and `Product Categories` each contain `lvl0: ["<id>:<idx>:<label>"]`. Split on `:` and take the last `:`-delimited segment for human labels (e.g. `"793010:11: First Look" → "First Look"`). |
| `ppsAnswers` | Flat array of human-readable category strings ("First Look", "Gold Jewelry"). Easier to consume than `exhibitorFilters`. |
| `isNew` | `true` if this is the exhibitor's first JCK appearance this edition. |
| `logo` | Hosted image URL on `pub-mediabox-storage.rxweb-prd.com`. ~99% populated. |
| `coverImage` | Hero banner image. Often `null`. |
| `products[]` | Array of `{id, name, description, imageUrl, isNew, isInnovative, video?}`. Innermost product nodes carry video metadata when present. |
| `documents[]` | Array of catalog / spec PDFs (often empty). |
| `id` | Exhibitor's internal Algolia ID (`exh-…`). |
| `organisationGuid` | Parent company ID (`org-…`) — same exhibitor across editions keeps the same `organisationGuid`. **Use this for year-over-year diffing.** |
| `objectID` | Algolia row ID. Format: `<id>_<locale>` (e.g. `exh-c2de9854-…_en-us`). |
| `packageId` | Sponsorship tier (1 = standard, 2 = sponsored, 3 = featured/premier). Higher = more prominent placement on site. |
| `sortAlias` | Name used for alphabetical sorting (strips leading articles, lowercases). |

### 4. Construct the canonical detail page URL (optional)

If you want to link back to JCK's exhibitor detail page (e.g. for verification or downstream tooling), the URL pattern is:

```
https://lasvegas.jckonline.com/en-us/about/exhibitor-directory/exhibitor-details.{url-encoded company name}.{organisationGuid}.html
```

Example: `Shree Ramkrishna Exports Pvt Ltd` → `exhibitor-details.shree%20ramkrishna%20exports%20pvt%20ltd.org-f3166510-dc0a-463a-a3ba-0628294a12cf.html`. The slug segment is lowercase, URL-encoded; `organisationGuid` is taken straight from the Algolia hit. You **do not** need to scrape the detail page — every field rendered there is already in the Algolia hit.

### Browser fallback

Only useful if Algolia is rate-limiting you (no rate limit observed in practice — search-only public key, CDN-backed). To drive the SPA directly:

```bash
SID=$(browse cloud sessions create --keep-alive | jq -r .id)
export BROWSE_SESSION="$SID"
browse open "https://lasvegas.jckonline.com/en-us/about/exhibitor-directory.html" --remote --wait load
# Wait for the SPA to hydrate. The Algolia call fires ~1-2s after `load`.
sleep 3
# Either call Algolia from page context (same as recommended path, but routed through the page):
browse eval "fetch('https://xd0u5m6y4r-dsn.algolia.net/1/indexes/<INDEX>/query?x-algolia-application-id=<APP>&x-algolia-api-key=<KEY>', {method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body: JSON.stringify({params:'query=&page=0&hitsPerPage=1000&filters=...'})}).then(r=>r.json())" --remote
# Or scroll & extract from DOM (slower, lossier — names + booth only, no email/phone in card markup)
```

`browse snapshot` returns zero refs against the SPA shell — the Algolia hydration writes to a `<div id="exhibitor-directory">` mount point, but only after the initial render. The `browse network on` + reload + inspect `*-algolia.net/query` request bodies path is also how the index name and `eventEditionId` were originally discovered.

## Site-Specific Gotchas

- **The Algolia index name and `eventEditionId` rotate every show edition.** As of the 2026 edition: index `evt-83d00818-46c9-40ea-98a1-866e9bdb82d6-index`, eventEditionId `eve-1567689e-7c22-4403-b3ff-84e1d010e5cf`. **Do not hardcode these.** Re-discover them from the directory page HTML on each run (the `evt-` and `eve-` GUIDs are embedded in inlined JSON config strings with `-` for `-`).
- **The `appId` (`XD0U5M6Y4R`) and `apiKey` (`d5cd7d4ec26134ff4a34d736a7f9ad47`) are public, search-only credentials.** Embedded directly in the page's `algoliaConfig` block. There is no `protectedAppId` flow needed for read-only exhibitor data — `protectedAppId: 8CD2G7QY2D` exists in the same config block but is for authenticated exhibitor-portal operations, not the public directory.
- **The Algolia key works from any origin, including `about:blank`.** No Referer enforcement. Verified by calling from a fresh remote browser session navigated only to `about:blank`. So you can hit the endpoint from any HTTP client without spoofing a browser.
- **`hitsPerPage` caps at 1000.** Algolia rejects values >1000 with a 400. Two pages cover the full ~1,700-exhibitor roster as of 2026.
- **The `filters` clause is mandatory and non-trivial.** You need all three: `recordType:exhibitor`, `locale:en-us`, AND `eventEditionId:<eve-…>`. Drop any one and you get a mixed result set (products, sessions, prior years, etc.). Locale filtering is critical — the index also holds `locale:zh-cn`, `locale:fr-fr` translations for some exhibitors.
- **`recordType:product` is a separate hit type in the same index** — if you want SKUs/products as a denormalized stream rather than nested under `hits[].products[]`, switch the filter to `recordType:product` (no `hitsPerPage` accounting verified; the directory UI never queries this shape).
- **`exhibitorName` vs `companyName` can differ.** Some exhibitors use a display name distinct from the legal corporate name. Stick with `exhibitorName` for user-facing output and keep `companyName` as a sidecar.
- **`packageId` controls UI prominence — pages 0 of the directory pin sponsored exhibitors first.** When paginating by `hitsPerPage=100`, page 0 starts with `packageId=3` (premier) then `packageId=2` (sponsored) before reaching alphabetical `packageId=1`. With `hitsPerPage=1000` the pin still applies — first ~250 hits are sponsored / featured before the alphabetical run starts at "14k-18k Gold Earrings, Inc.". Sort client-side by `sortAlias` if you want pure alphabetical.
- **`exhibitorFilters.lvl0` items have an internal `<id>:<idx>:<label>` format.** Example: `"793010:11: First Look"`. The first segment is the Algolia facet-tree node ID (used by the SPA's refinementList query params); take the substring after the second `:` for the human label. `ppsAnswers[]` is the same data but already decoded — prefer it.
- **`exhibitorDescription` may contain markdown-style emoji + line breaks.** Treat the field as plain text with `\n`s; do not assume HTML.
- **Detail-page URL slugs are URL-encoded lowercase company names, NOT the `sortAlias`.** Spaces become `%20`, but punctuation like `,` and `&` is preserved literally in the URL (the AEM router accepts both). The `organisationGuid` (not `id`) is what locks the URL to a specific company across editions.
- **The directory page itself loads fine without `--verified --proxies`** — Cloudflare in front of `lasvegas.jckonline.com` accepts a default Browserbase session. But: the API path doesn't need a browser session at all, so this caveat only matters for the fallback flow.
- **No `pagination` parameter on the Algolia request — use the `page` field inside the `params` body.** Common Algolia client mistake: passing `page=N` as a top-level POST body field instead of inside `params=`. Algolia silently ignores it and returns page 0 every time.
- **Edition dates: 2026 = May 29 – June 1, The Venetian Expo, Las Vegas NV.** If you're filtering "current" vs "next" edition, this is the value embedded in the page's `showInfo.startDate` / `showInfo.endDate` config alongside the Algolia credentials.

## Expected Output

```json
{
  "site": "lasvegas.jckonline.com",
  "edition": {
    "name": "JCK Las Vegas 2026",
    "eventEditionId": "eve-1567689e-7c22-4403-b3ff-84e1d010e5cf",
    "startDate": "2026-05-29",
    "endDate": "2026-06-01",
    "venue": "The Venetian Expo | Las Vegas, NV"
  },
  "algolia": {
    "appId": "XD0U5M6Y4R",
    "apiKey": "d5cd7d4ec26134ff4a34d736a7f9ad47",
    "index": "evt-83d00818-46c9-40ea-98a1-866e9bdb82d6-index"
  },
  "total": 1704,
  "exhibitors": [
    {
      "id": "exh-c2de9854-ab7e-4e4b-b4ba-ff44e623df38",
      "organisationGuid": "org-dd1a72c5-b128-49e5-af8a-06299c82df01",
      "name": "14k-18k Gold Earrings, Inc.",
      "companyName": "14k-18k Gold Earrings, Inc.",
      "description": "We manufacture 14K & 18K gold earrings and body jewelry, supplying wholesalers and retailers with a variety of styles:\n\nEarrings: Spanish, Push Back, Korean, Huggies, Climbers, Telephones, Baby Styles\nPiercings: Helix, Earcuffs, Clickers, Rings, Belly, Industrial, Nose Rings\n\nVisit us to explore our latest collections and wholesale pricing!\n",
      "showObjective": "With 35+ years in the industry, we offer a wide selection of 14K & 18K gold earrings and body jewelry at competitive prices. Stock up on best-selling styles!",
      "contact": {
        "phone": "305-371-3200",
        "email": "14k18kgold@gmail.com",
        "website": "https://www.14k18kgold.com/",
        "country": "United States"
      },
      "booth": "53010",
      "categories": ["First Look", "Gold Jewelry"],
      "neighborhood": "First Look",
      "isNew": false,
      "packageId": 1,
      "logo": "https://pub-mediabox-storage.rxweb-prd.com/exhibitor/logo/exh-c2de9854-ab7e-4e4b-b4ba-ff44e623df38/50426b7a-323e-4371-a163-78bd4dc1a5cc.png",
      "coverImage": null,
      "productCount": 6,
      "documentCount": 0,
      "detailUrl": "https://lasvegas.jckonline.com/en-us/about/exhibitor-directory/exhibitor-details.14k-18k%20gold%20earrings%2C%20inc..org-dd1a72c5-b128-49e5-af8a-06299c82df01.html"
    }
  ]
}
```

Field-coverage observed across the full 1,704-exhibitor 2026 roster (use for downstream nullability assumptions):

| Field | Populated |
|---|---|
| `name` / `companyName` / `booth` / `country` / `recordType` | 100% |
| `logo` | 99.6% |
| `description` | 93.3% |
| `email` | 92.5% |
| `phone` | 90.4% |
| `website` | 84.3% |
| `coverImage` | <10% (often `null`) |
| `documents[]` non-empty | <5% |
