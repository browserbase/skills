---
name: architecturaldigest-com-extract-firm-details-zcw914
title: Extract AD PRO Directory Firm Details
description: >-
  Extract firm name, email, phone, website, address, social links, and category
  for design firms in the Architectural Digest AD PRO Directory by fetching
  pages and parsing their embedded JSON.
website: architecturaldigest.com
category: directory
tags:
  - directory
  - firms
  - contact-details
  - architecture
  - interior-design
  - lead-generation
source: 'browserbase: agent-runtime 2026-08-24'
updated: '2026-08-24'
recommended_method: fetch
alternative_methods:
  - method: api
    rationale: >-
      Each profile also embeds a JSON-LD LocalBusiness block (name, email,
      telephone, PostalAddress). It's a strict subset of the __PRELOADED_STATE__
      business object — useful as a cross-check but missing
      website/social/category detail.
  - method: browser
    rationale: >-
      Drive the page and run the embedded-JSON parser on `browse get html body`.
      Only needed if the JSON shape changes; avoid `browse snapshot` (900+ refs,
      slow) and attribute-selector href reads (return empty).
verified: false
proxies: false
---
# Extract AD PRO Directory Firm Details

## Purpose

Extract structured contact details for the design firms listed in the Architectural Digest **AD PRO Directory** — for each firm: name (and legal name), email, phone, website, full postal address, social links, and business category/profession. Read-only; nothing is submitted or modified. The directory is a public, server-rendered app: every listing and profile page embeds its full record as JSON in the HTML, so the fastest and most reliable method is to **fetch the HTML and parse the embedded JSON**, not to script clicks or scrape rendered text.

## When to Use

- Building or refreshing a dataset of AD-vetted architecture / interior-design / landscape firms with their public contact info.
- Looking up a single firm's email, phone, website, or address by name/slug.
- Filtering the directory by business category and/or U.S. state and exporting the matching firms.
- Any case where you'd otherwise scrape the rendered directory pages — the embedded JSON is exact and ~100× cheaper than DOM crawling.

## Workflow

The recommended method is **fetch + parse embedded JSON**. Both the listing pages and the individual firm profiles ship a `window.__PRELOADED_STATE__` blob (and profiles additionally carry a JSON-LD `LocalBusiness` block). No login, no cookies, no residential proxy, and no anti-bot stealth are required — a plain HTTP GET returns `200` with the full payload. Use `browse cloud fetch <url>` (or any HTTP client) to retrieve the HTML.

### Step 1 — Enumerate firms (listing pages)

```
GET https://www.architecturaldigest.com/adpro/directory/businesses?page=N
```

- 50 firms per page. Pages are `1..33` today; **`totalResults` is 1616** (read it, don't hardcode). A page number past the last returns an empty list (zero `/adpro/directory/profile/` links) — that's your stop condition.
- Parse the embedded state (see "extracting embedded JSON" below) and read `transformed.searchResultsList`:
  - `.totalResults` → total firm count.
  - `.items[]` → each item has `businessInfo.name`, `businessInfo.address {city, state}`, `businessInfo.category {name, slug}`, `businessInfo.profession {name, slug}`, `dangerousDek` (short blurb), and `url` (the profile path).
- **The listing does NOT include email/phone/website** — only name, city/state, and category. To get contact details you must open each firm's profile (Step 2).
- Profile URLs also appear as raw hrefs matching `/adpro/directory/profile/{slug}` if you prefer a regex over JSON parsing.

**Optional filters** (append to the businesses URL; they AND-combine, and stack with `page`):
- `category={slug}` — top-level business type, e.g. `architecture` (→208), `interior-design-decor`, `landscape`.
- `state={slug}` — U.S. state, e.g. `california` (→355), `new-york`.
- Example: `?category=architecture&state=california&page=1` → 48 firms.
- Note: profession-level slugs (e.g. `residential-architect`) are **not** accepted by the `category` param and there is no confirmed `profession=` URL param — profession narrowing is UI-only. Filter client-side on `businessInfo.profession.slug` instead.

### Step 2 — Get full firm details (profile pages)

```
GET https://www.architecturaldigest.com/adpro/directory/profile/{slug}
```

Two embedded JSON sources — **prefer #1**:

1. `window.__PRELOADED_STATE__.transformed.business`:
   - `name`, `legalName`
   - `contactPoint.email`, `contactPoint.telephone`, `contactPoint.url` (the firm's own website)
   - `address` → `{street, streetExtended, city, state, postalCode, country}`
   - `socialMedia[]` → `[{network, handle}]` (handle is usually a full URL)
   - `categoryTaxonomies` / `categories.edges[].node.hierarchy` → business type + profession
   - `description` / `knowsAbout` → prose bio (founder/principal names live here — see gotcha)
2. JSON-LD: `<script type="application/ld+json">` containing `"@type":"LocalBusiness"` — has `name`, `email`, `telephone`, and a `PostalAddress`. This is a strict subset of #1; use it as a fallback/cross-check.

### Step 3 — Extracting the embedded JSON

Find `__PRELOADED_STATE__`, take the first `{` after it, brace-match to the closing `}`, and `JSON.parse`. Minimal Node:

```js
const i = html.indexOf("__PRELOADED_STATE__");
let start = html.indexOf("{", i), depth = 0, end = -1;
for (let k = start; k < html.length; k++) {
  const c = html[k];
  if (c === "{") depth++;
  else if (c === "}" && --depth === 0) { end = k + 1; break; }
}
const state = JSON.parse(html.slice(start, end));
const biz = state.transformed.business;            // profile page
// const list = state.transformed.searchResultsList; // listing page
```

### Step 4 — Emit output

Return one firm object per profile (see Expected Output). To dump the whole directory: iterate `page=1..N` from Step 1 to collect all `{slug}`s, then fetch each profile in Step 2. Be polite — keep to roughly ≤1 req/s; there is no hard rate limit observed but it's a Condé Nast property.

### Browser fallback

Only needed if the embedded JSON shape changes. Drive the page and read text, but **do not use `browse snapshot`** on these pages (see gotchas). Instead:
1. `browse open "https://www.architecturaldigest.com/adpro/directory/profile/{slug}" --remote`
2. `browse wait load` then `browse get html body` and run the Step 3 parser on the returned HTML.
3. If you must read rendered text, the firm name, address, phone, website, and email all render in the header block directly under the firm name; social icons follow. Avoid `browse get value`/`browse get text` with attribute selectors to pull hrefs — they return empty for these anchors (confirmed gotcha).

## Site-Specific Gotchas

- **No "contact person" field exists.** The directory stores firm-level contact only (a single `contactPoint` email/phone/website). Founder/principal names appear **only** inside the prose `description`/`knowsAbout` (e.g. "founded by Stephen Alesch and Robin Standefer"). Set `contact_person: null` unless you deliberately name-extract from the bio — **do not fabricate a name**.
- **Emails are often personal, not branded.** Observed `adrianaelga@gmail.com` for Roman and Williams vs. `richard@mcalpinehouse.com` for McAlpine. Whatever the firm submitted is what's stored; don't "correct" it to match the domain.
- **The listing page carries no contact info.** `searchResultsList.items[]` has name/city/state/category only. Budget one profile fetch per firm for email/phone/website.
- **`www` host + trailing normalization:** `architecturaldigest.com/...` 301-redirects to `www.architecturaldigest.com/...`; and `/adpro` 301s to `/adpro/directory`. Request the `www` host directly to skip a hop.
- **`browse snapshot` is a trap on these pages.** The accessibility tree is huge (900–1000 refs) and slow, and the `browse` CLI prints an `Update available: 0.7.2 -> 0.9.6` banner to stderr that surfaces as a spurious "error" in tool wrappers. Parse the embedded JSON via `browse cloud fetch` or `browse get html body` instead — this is the single biggest efficiency win.
- **CSS-selector href extraction doesn't work here.** `browse get value [href*="instagram"]` / `browse get text` on the contact anchors return empty strings; the URLs live in `contactPoint.url` and `socialMedia[].handle` in the embedded JSON, so read them there.
- **Filter param scope:** `category=` accepts only top-level business-type slugs (`architecture`, `interior-design-decor`, `landscape`, …), not profession slugs. `state=` accepts state name slugs. Both AND-combine and stack with `page`. There is no working `profession=` URL param — filter professions client-side.
- **`geo.lat`/`geo.lng` are frequently `0,0`** — treat coordinates as unreliable; the postal `address` object is authoritative for location.
- **No anti-bot / no auth / no proxy.** Plain HTTP GET returns `200` with full payload (confirmed with and without residential proxies). Don't waste a `--verified`/`--proxies` session on this site.

## Expected Output

Per-firm record (from a profile page):

```json
{
  "success": true,
  "firm": {
    "name": "Roman and Williams",
    "legal_name": "Roman and Williams",
    "contact_person": null,
    "email": "adrianaelga@gmail.com",
    "phone": "+(1) 305 498 1649",
    "website": "https://www.romanandwilliams.com/",
    "address": {
      "street": "296 Canal Street",
      "street_extended": "",
      "city": "New York",
      "state": "New York",
      "postal_code": "10013",
      "country": "United States"
    },
    "social_media": [
      { "network": "Instagram", "handle": "https://www.instagram.com/@roman_and_williams" }
    ],
    "category": "Interior Design + Decor",
    "profession": null,
    "profile_url": "https://www.architecturaldigest.com/adpro/directory/profile/roman-and-williams"
  },
  "error_reasoning": null
}
```

Whole-directory / batch shape:

```json
{
  "success": true,
  "total_firms": 1616,
  "filters": { "category": null, "state": null },
  "firms": [
    {
      "name": "Ike Baker Velten",
      "email": "...",
      "phone": "...",
      "website": "...",
      "address": { "city": "Oakland", "state": "California" },
      "category": "Architecture",
      "profession": "Residential Architect",
      "profile_url": "https://www.architecturaldigest.com/adpro/directory/profile/ike-baker-velten"
    }
  ],
  "error_reasoning": null
}
```

Failure shape:

```json
{
  "success": false,
  "firm": null,
  "error_reasoning": "Profile slug not found — /adpro/directory/profile/{slug} returned no __PRELOADED_STATE__.transformed.business."
}
```
