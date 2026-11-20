---
name: realestate-com-au-extract-property-data-f0o2u7
title: realestate.com.au Property Data Extraction
description: >-
  Extract structured property information from a realestate.com.au listing or
  address — location data (address + lat/lon), price range or sold price, key
  statistics (beds/baths/parking/land size/property type), agent + agency, and
  the full historical sale price timeline from the Property Pages address
  profile.
website: realestate.com.au
category: real-estate
tags:
  - real-estate
  - property
  - listings
  - australia
  - rea
  - kasada
source: 'browserbase: agent-runtime 2026-05-20'
updated: '2026-05-20'
recommended_method: browser
alternative_methods:
  - method: fetch
    rationale: >-
      Direct HTTP fetch returns 429 + Kasada PerimeterX cookies on every
      property URL tested. Browser path is the only reliable surface.
  - method: api
    rationale: >-
      REA's mobile/internal APIs (lexa.realestate.com.au,
      services.realestate.com.au) require signed tokens scoped to the mobile app
      and are not usable cookieless. No public GraphQL or REST endpoint is
      exposed.
verified: true
proxies: true
---
# realestate.com.au Property Data Extraction

## Purpose

Given a realestate.com.au property URL — or a street address that can be resolved to one — return structured property data including the full address, geographic coordinates, listing status, current price (or price range / sold price), key statistics (beds, baths, parking, land size, floor area, property type), the agent + agency, and the property's historical sale prices. Read-only — never submits enquiries, never starts a contact form, never signs in. The same skill handles for-sale, sold, and off-market addresses.

## When to Use

- Building a property research dataset (one-shot or scheduled) — e.g. compare current listings to historical sale prices in a suburb.
- Enriching a CRM or buyers' brief with REA-sourced beds/baths/land-size + agent contact.
- Computing capital-gain analytics from `historical_sales` for a single dwelling.
- Looking up a non-listed address to confirm beds/baths/land before contacting the owner ("off market" path).

## Workflow

The richest single page is the **Property Pages address profile** at `/property/{slug}/`. It carries the Property history (every recorded sale with date + price + agency), property features (beds/baths/parking/land-size/property-type), the lat/lon coordinates (embedded in the Google Static-Maps URL), and — when the address has an active listing — a deep-link to the `/property-{type}-...` listing detail page where agent contacts + current asking price + description live. The recommended flow is to land on Property Pages first, then conditionally fetch the listing page if a current price/agent is needed.

**A bare cloud session works** for the page-rendering surface; PerimeterX/Kasada returns 429 on direct HTTP fetches but does not challenge the headed browser path. Stealth (`--verified`) and residential proxies (`--proxies`) are **not strictly required** for the rendering path on the addresses tested, but keep them on by default — Kasada's bot-score tracker is opaque and some IP ranges hit a captcha interstitial. The fetch + GraphQL paths are confirmed blocked (see Gotchas).

### 1. Create a stealth session (proxies optional but safer)

```bash
sid=$(browse cloud sessions create --keep-alive --verified --proxies \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$sid"
```

### 2. Resolve to a Property Pages slug

You have one of three inputs:

**(a) A listing URL** like `https://www.realestate.com.au/property-house-vic-richmond-151242968`:
- Open the listing first. The breadcrumb (item 5) is the street address. Build the Property Pages slug from it: `{number}-{street-name}-{street-suffix-abbr}-{suburb-lower}-{state-lower}-{postcode}`. Street suffixes are abbreviated: Street→`st`, Road→`rd`, Avenue→`av`, Parade→`pde`, Terrace→`tce`, Court→`ct`, Drive→`dr`, Place→`pl`, Lane→`la`, Crescent→`cr`, Highway→`hwy`. For apartments/units, prefix `unit-{unitNumber}-`: `5/19 River Street` → `unit-5-19-river-st-richmond-vic-3121`.
- Or skip slug derivation entirely: the listing page itself carries address + beds/baths/parking/land-size/price/agent. Use Property Pages only when historical sales or lat/lon are required.

**(b) A sold URL** like `https://www.realestate.com.au/sold/property-apartment-vic-richmond-150805280`:
- Same shape as a listing URL but the price strip reads `$815,000 Sold on 02 May 2026`, and a `[Property history](https://www.realestate.com.au/property/{slug}/)` link is rendered just under the price — follow that link rather than rebuilding the slug.

**(c) A bare street address** (no URL):
- Construct `/property/{slug}/` directly using the same slugging rules above. If the slug is wrong, REA serves the closest match in a "Did you mean?" header — pivot to the proposed slug.

### 3. Open the Property Pages URL

```bash
browse open "https://www.realestate.com.au/property/6-stawell-st-richmond-vic-3121/" --remote
browse wait load --remote   # may time out at 30s — non-fatal, the page renders in parallel
browse wait timeout 4000 --remote
browse get markdown body --remote > /tmp/page.md
```

Important: `browse wait load` frequently times out at 30s because REA keeps an analytics socket open after DOM-ready. The error is non-fatal — the page IS fully rendered; just follow with a 4s timeout-wait then snapshot.

### 4. Extract fields from the rendered markdown

The markdown body is structured and predictable. Use these anchors:

| Field | Where in the markdown |
|---|---|
| `address` | The `# {Street}{Suburb, STATE postcode}` h1 just below the breadcrumb (note: no space between street and suburb — split on the suburb name). |
| `bedrooms / bathrooms / parking` | A 3-element list directly under the address. Order is **beds, baths, parking**. |
| `listing_status` | The line above the h1 reads `For sale`, `Sold`, or `Off market`. |
| `property_type` | The line after the stats group: `House`, `Apartment`, `Unit`, `Townhouse`, `Land`, `Townhouse`. |
| `price_display` | The next line. For for-sale: literal display string like `$1,200,000 - $1,300,000`, `Contact Agent`, `Expressions of Interest`, `$1.7m-$1.9m`, etc. For sold: omitted on Property Pages — read from the `## Property history` section below. |
| `property_features` (land_size, floor_area, year_built) | `## Property features` section. Land size as `Land size: 268 m²`, floor area as `Floor area: 100 m²` (or `-` when missing), year built when known. |
| `historical_sales` | `## Property history` section. Each entry is: a year header, the literal word `Sold` or `Listed for sale`, a `#### ${price}` heading, then `Sold {date} by {agency}` line. When there's no history, the section reads `No history available`. |
| `lat / lon` | Extract from the static-map embed URL via regex `markers=icon[^&]*%7C(-?[0-9.]+)%2C(-?[0-9.]+)` on the raw markdown OR the page HTML. Also reproduced in the "Local area map of Richmond" Google Static-Maps embed — same coordinates. Precision: 8 decimals. |
| `listing_url` | When status = `For sale`: the `[View listing](https://www.realestate.com.au/property-{type}-...)` link. Absent on off-market and sold-history-only pages. |

Parse the price-range display string with `^\$([\d,]+)\s*-\s*\$([\d,]+)$` for `price_low`/`price_high`; treat `Contact Agent`, `Expressions of Interest`, `Auction`, `$XXXm` shorthand, and single-number displays as `price_display` only (don't fabricate a range).

### 5. If a current asking price + agent contact is required, also open the listing page

When Property Pages shows a `View listing` link, follow it to grab:

- `price_display` and `indicative_price` — listing pages often show "Contact Agent" as the headline plus an `Indicative price: $X,XXX,XXX - $Y,YYY,YYY` sub-line (regulated in VIC by the Statement of Information).
- `agent`, `agency`, `agent_phone` (truncated — REA masks the last 3 digits unless you click "Call", which we don't do).
- Full prose `description` and AI-generated `property_highlights` (3 bullets).
- `inspection_times`, `auction_time` when present.

For sold listings (`/sold/property-...`), the same template renders but the price strip becomes `${sale_price} Sold on {date}`.

### 6. Geocoding fallback

If the static-map regex doesn't match (rare, but possible when REA serves a placeholder map), open the listing page — the "Map" embed there carries the same `markers=icon%7C{lat}%2C{lon}` pattern. As a last resort, the address itself plus the postcode is enough to geocode externally; REA never publishes lat/lon as numeric DOM attributes — it's only embedded in the static-map URL.

### 7. Release the session

```bash
browse cloud sessions update "$sid" --status REQUEST_RELEASE
```

## Site-Specific Gotchas

- **Direct HTTP fetch is blocked.** `browse cloud fetch <listing-url> --proxies` returns **429 + Kasada PerimeterX cookies** (`x-kpsdk-ct`, `KP_UIDz`). The full browser path is the only reliable surface. Don't waste cycles trying to bypass Kasada via raw HTTP, persisted GraphQL queries, or REST endpoints under `lexa.realestate.com.au` / `services.realestate.com.au` — they're whitelisted to the mobile app's signed tokens.
- **`browse wait load` times out at 30s on most listing/property pages.** REA keeps a long-lived analytics WebSocket open, so the `load` event never fires. The error is non-fatal — `wait timeout 4000` after the `open` is enough; DOM is ready before `wait load` would fire anyway.
- **A bare session works but margins are thin.** Both `--verified --proxies` and a bare session rendered the same listing/property pages on test runs. However, Kasada is on the perimeter, so traffic spikes / repeated IDs from the same IP push you into a captcha interstitial. Default to `--verified --proxies` for production; only drop stealth flags if cost matters and the call rate is low (< 10/hr).
- **Listing URL structure has TWO formats.** `/property-{type}-{state}-{suburb}-{id}` is the for-sale path; `/sold/property-{type}-{state}-{suburb}-{id}` is the sold path. Same template but the "Property history" link only appears on the sold variant. The for-sale variant requires a separate Property Pages lookup for historical sales.
- **Lat/lon is never published as DOM data — only as Google Static-Maps URL query params.** Pattern: `markers=icon%3A...%7C{lat}%2C{lon}` (URL-encoded `|` and `,`). Regex `%7C(-?[0-9.]+)%2C(-?[0-9.]+)`. Present on Property Pages and the listing's "Map" embed; absent on off-market pages where the dwelling has no street-view coverage.
- **`window.__INITIAL_STATE__` / `__NEXT_DATA__` / `__APOLLO_STATE__` are NOT present.** REA's frontend is a custom "Argonaut" SPA with no hydration blob exposed on `window`. Don't try to `browse eval` for one — extract from the rendered markdown/HTML instead.
- **No `application/ld+json` structured data.** REA omits schema.org RealEstateListing markup. You cannot shortcut extraction via JSON-LD parsing. Markdown scraping is the path.
- **Address rendering quirk — h1 has no space between street and suburb.** The h1 reads literally `6 Stawell StreetRichmond, VIC 3121` — split on the suburb token or the comma, not on whitespace.
- **Apartment / unit slug prefix.** `5/19 River Street` becomes `unit-5-19-river-st-...` on the Property Pages route — not `5-19-river-st`. Without the `unit-` prefix REA serves the wrong dwelling (the houseside #5 instead of the unit-5 inside #19).
- **Off-market pages show estimated value but it's gated behind sign-in.** `## Property value` renders `realEstimate™ $X,XXX,XXX Sign in to unlock`. Don't try to log in (read-only rule); record `realEstimate` as `gated: true` and skip the numeric value.
- **`No history available` is a valid outcome.** Some addresses have never traded since REA started tracking sales. Emit `historical_sales: []` rather than failing.
- **Sold-listing detail pages link back to Property Pages via `[Property history](/property/{slug}/)`** — follow that link to get the slug rather than rebuilding it; REA's own slug computation is authoritative (handles unit prefixes, street-suffix edge cases like "The Boulevard" → `the-boulevard`).
- **Page-view counter ("429 page views") and Property ID are visible at the bottom of for-sale listings** — useful as stable IDs for deduping but not required for extraction.
- **Agent phone numbers are masked** to the first 7 digits + `...` (e.g. `0411863...`) unless the user clicks "Call". Don't click. Emit the masked string as `agent_phone_masked`.
- **"Indicative price" is mandatory in VIC** under the Statement of Information regulations — when the headline says "Contact Agent" or "Auction", look for the `Indicative price: $X - $Y` sub-line; that's the seller's stated range and is what most agents and buyers anchor to.

## Expected Output

```json
{
  "success": true,
  "listing_url": "https://www.realestate.com.au/property-house-vic-richmond-151242968",
  "property_url": "https://www.realestate.com.au/property/6-stawell-st-richmond-vic-3121/",
  "property_id": 151242968,
  "address": "6 Stawell Street, Richmond, VIC 3121",
  "suburb": "Richmond",
  "state": "VIC",
  "postcode": "3121",
  "lat": -37.82050022,
  "lon": 145.01036193,
  "property_type": "House",
  "listing_status": "for_sale",
  "price_display": "Contact Agent",
  "indicative_price_display": "$2,200,000 - $2,400,000",
  "price_low": 2200000,
  "price_high": 2400000,
  "bedrooms": 3,
  "bathrooms": 2,
  "parking": 0,
  "land_size": "268 m²",
  "floor_area": null,
  "year_built": null,
  "agent": "Elliot Gill",
  "agent_phone_masked": "0411863...",
  "agency": "Jellis Craig - Richmond",
  "agency_url": "https://www.realestate.com.au/agency/jellis-craig-richmond-XFGDKV",
  "auction_at": "2026-06-13T11:00:00+10:00",
  "historical_sales": [
    { "year": 2018, "date": "2018-06-14", "price": 1330000, "agency": "BigginScott - Richmond" },
    { "year": 2012, "date": "2012-10-12", "price": 820000, "agency": "Belle Property - Richmond" }
  ],
  "error_reasoning": null
}
```

Distinct outcome shapes:

```json
// Sold listing (post-settlement)
{
  "success": true, "listing_status": "sold", "sale_price": 815000, "sale_date": "2026-05-02",
  "price_display": "$815,000", "indicative_price_display": null, "historical_sales": [ ... ],
  "address": "5/19 River Street, Richmond, VIC 3121", "property_type": "Apartment", ...
}

// Off-market address (Property Pages, no active listing)
{
  "success": true, "listing_status": "off_market", "price_display": null, "listing_url": null,
  "realestimate_gated": true, "rental_estimate_weekly": 1285,
  "historical_sales": [],   // or populated if past sales exist
  ...
}

// No history available
{ "success": true, "historical_sales": [], "history_note": "No history available", ... }

// Slug not found / address typo
{ "success": false, "error_reasoning": "address_not_found", "did_you_mean": "6a-stawell-st-richmond-vic-3121" }

// Kasada captcha interstitial (rare with stealth on)
{ "success": false, "error_reasoning": "kasada_captcha_wall", "advice": "Re-run with --verified --proxies; rotate session." }
```
