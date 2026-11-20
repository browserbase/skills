---
name: french-property-com-find-listing-sujpf1
title: French-Property.com Find Listings
description: >-
  Search french-property.com for-sale listings by region, price, bedrooms,
  property type, habitable / land size, and keywords; return matching listings
  with title, reference, price, location, room counts, sizes, image, and URL.
website: french-property.com
category: real-estate
tags:
  - real-estate
  - france
  - listings
  - search
  - url-param
  - read-only
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: url-param
alternative_methods:
  - method: browser
    rationale: >-
      Only needed for visual verification. The /properties-for-sale page is
      fully server-rendered, so URL-param fetch through a residential proxy
      returns the same HTML with all Schema.org microdata inline — driving a
      Browserbase session costs ~30x more without adding any signal.
  - method: api
    rationale: >-
      No public JSON API. The search form posts only to the same
      /properties-for-sale GET endpoint that the URL-param path already targets.
verified: true
proxies: true
---
# French-Property.com Find Listings

## Purpose

Given a set of buyer characteristics (region, price range, bedroom count, property type, habitable / land size, free-text keywords, sort order), return the matching for-sale property listings on french-property.com — each with title, reference, price (EUR), region/department/commune, bedrooms/bathrooms, habitable + land sizes, listing URL, image URL, and description snippet. Read-only; never enquires, saves, or contacts vendors.

## When to Use

- Buyer agent searching for French real estate within a budget, region, and structural criteria.
- Monitoring new listings matching a saved profile (re-fetch + diff on `reference`).
- Bulk enumeration across regions, departments, or feature flags (e.g. swimming pool, outbuildings) — sale side of the site.
- Anywhere you'd otherwise scrape french-property.com search HTML — the URL-param surface is faster than UI-driving, and the rendered HTML already carries Schema.org microdata.

## Workflow

The french-property.com search page at `/properties-for-sale` is a fully server-rendered Laravel app behind Cloudflare that accepts every filter as a URL query parameter. **No login, no JS execution, no anti-bot challenge** with a residential proxy — `browse cloud fetch <url> --proxies` returns the same HTML the browser renders, with all listing data inlined as Schema.org microdata. There is no public JSON API. Lead with URL-param + HTML extraction; the browser path is only useful for visual verification.

1. **Construct the search URL** by appending filters to `https://www.french-property.com/properties-for-sale`:

   | Param | Type | Notes |
   |---|---|---|
   | `regions` | **English-kebab slug, single value** | Valid: `alsace, aquitaine, auvergne, brittany, centre-val-de-loire, champagne-ardenne, corsica, franche-comte, languedoc-roussillon, limousin, lorraine, midi-pyrenees, nord-pas-de-calais, normandy, occitanie, paris-ile-de-france, pays-de-la-loire, picardy, poitou-charentes, provence-alpes-cote-d-azur, rhone-alpes`. ⚠ See gotchas — French slugs silently no-op. |
   | `minimum_price`, `maximum_price` | int (EUR) | e.g. `200000` |
   | `minimum_bedrooms`, `maximum_bedrooms` | int | |
   | `minimum_floor_size`, `maximum_floor_size` | int (m²) | Habitable size, not land |
   | `minimum_land_size`, `maximum_land_size` | int | Pair with `land_size_unit=m` (m²) or `land_size_unit=ha` (hectares) |
   | `property_types_all` | **single value** | `house \| apartment \| business \| land`. Despite the trailing `_all`, this is NOT an array; the form only emits one value. |
   | `keywords_all` | URL-encoded text | Listings must contain ALL keywords. Spaces as `+` or `%20`. |
   | `keywords_any` | URL-encoded text | Listings matching ANY keyword. |
   | `reference` | string | Direct lookup by reference code (e.g. `IFPC46841`); returns `Results 1 - 1 of 1`. |
   | `exclude_agencies` | `1` | Private-vendor listings only (typically ~2% of inventory). |
   | `sort_by` | enum | `date` (default, most recent), `price`, `land_size`. |
   | `sort_direction` | enum | `asc`, `desc`. |
   | `start_page` | int ≥ 1 | Pagination cursor. 25 results per page. Page 1 omits the param or uses `start_page=1`. |
   | `currency` | enum | `EUR` (default), `GBP`, `USD`, `CAD`, `AUD`. Affects on-page display only — `<meta itemprop="price">` is always in the underlying currency (typically EUR). |

   Example for "Houses in Brittany, €200K–€400K, 3+ bedrooms, sorted by most recent":
   ```
   https://www.french-property.com/properties-for-sale?regions=brittany&minimum_price=200000&maximum_price=400000&minimum_bedrooms=3&property_types_all=house&sort_by=date&sort_direction=desc
   ```

2. **Fetch the page** through a residential proxy (the site is Cloudflare-fronted; bare requests sometimes get challenged but proxy fetches consistently return 200):
   ```bash
   browse cloud fetch "$url" --proxies
   ```
   Response envelope contains the rendered HTML under `.content`. No `--verified` / advanced-stealth needed — the search route does not run an Akamai/Datadome-class challenge in 2026-05 testing.

3. **Read the total count** from the rendered text — single regex hit:
   ```
   /Results (\d+) - (\d+) of (\d+)/
   ```
   The third capture group is the total match count across all pages. Total pages = `ceil(total / 25)`.

4. **Detect the no-results case** *before* trying to parse listings: the page renders the literal string `No properties found - try expanding your search:` followed by a property-alert sign-up form. Emit `total_matches: 0, listings: []` in that branch — don't error.

5. **Extract each listing**. Split the HTML on `<li class="property_listing  standard ">` (note the double-space — that's the production class string, see gotchas). Within each block, the data is all in inline Schema.org microdata, no JS required:

   | Field | Selector / regex |
   |---|---|
   | `url` (relative) | `<meta itemprop="url" content="(/sale-property/\d+-[A-Z0-9]+)"/>` → prefix with `https://www.french-property.com` |
   | `reference` | `<span itemprop="productID">Ref: ([A-Z0-9]+)</span>` |
   | `title` | first `<h3 itemprop="name">…<a [^>]*>([^<]+)</a></h3>` (often truncated with `…`; for the full title, GET the detail page) |
   | `price_eur` | `<meta itemprop="price" content="(\d+)"/>` (string of digits, parse to int; `0` or missing = "Price on request") |
   | `currency` | `<meta itemprop="priceCurrency" content="([A-Z]{3})"/>` (almost always `EUR`) |
   | `region` | `<span class="region">Region: <strong>([^<]+)</strong>` |
   | `department` | `<span class="department">Department: <strong>([^<]+)</strong>` — e.g. `Ille-et-Vilaine (35)` |
   | `commune` | `<span class="commune">\s*Location:\s*<strong>([^<]+)</strong>` — e.g. `Rennes, 35000` |
   | `bedrooms` | `class="info-beds">.*?<strong>\s*(\d+)` |
   | `bathrooms` | `class="info-bath">.*?<strong>(\d+)` (may be absent for studios / land) |
   | `habitable_size_m2` | `class="info-habitable">.*?<strong>.*?(\d+(?:\.\d+)?)\s*m²` (may be absent for land) |
   | `land_size` | `class="info-land">.*?<strong>.*?(\d+(?:\.\d+)?)\s*(ha\|m²)` — value + unit |
   | `image_url` | first `<meta itemprop="contentUrl" content="([^"]+\?height=500&amp;width=750)"/>` within the listing block (full-resolution) |
   | `description` | `<div class="description" itemprop="description">\s*<p>([\s\S]*?)</p>` — strip whitespace, decode HTML entities |

6. **Paginate** if more pages exist (total > 25): re-issue the same URL with `&start_page=2`, `&start_page=3`, … up to `ceil(total/25)`. The page title gets a `- page N` suffix you can use as a sanity check. Sustained throughput at 1 req/s through one proxy IP has been smooth in testing.

7. **Sanity-check region scope** before emitting. After parsing, every listing's `region` field should equal the requested region's display name (e.g. `regions=brittany` → `Brittany`; `regions=provence-alpes-cote-d-azur` → `Provence-Alpes-Côte d'Azur`). If you see mixed regions, the slug was wrong and the site fell back to all-France — see gotchas.

### Browser fallback

Only needed if the URL-param + HTML extraction path is somehow blocked (not observed in testing). Drive a session in the standard way:

```bash
sid=$(browse cloud sessions create --keep-alive --proxies | node -pe \
  "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
browse open "$url" --remote --session "$sid"
browse get html body --remote --session "$sid" > page.html      # same HTML the fetch path returns
browse screenshot --remote --session "$sid" --path screenshot.png
browse cloud sessions update "$sid" --status REQUEST_RELEASE
```

`browse snapshot` is not useful here — the listings render server-side, but the accessibility-tree refs add no information beyond the microdata you already have in HTML. Skip the snapshot step.

## Site-Specific Gotchas

- **`regions=` requires the ENGLISH kebab-case slug, NOT the French slug used in `/regions/<slug>/` URLs.** Verified failures (silent no-op, falls back to all-France with title "Property for sale in France"): `bretagne, bourgogne, provence_alpes_cote_dazur, haute_normandie, basse_normandie, paris, ile-de-france, loire-valley`. Verified successes: the 21 English slugs listed in the workflow table. The trap is silent: the URL still loads `200 OK` with no error indicator — only the `<title>` and per-listing `region` strings reveal that no region filter was applied. **Always verify** by checking the response `<title>` contains the expected English region name *before* trusting the result set.
- **`provence-alpes-cote-d-azur` uses `d-azur` with a hyphen, not `dazur` or `d%27azur`.** Both alternatives fall back to all-France. Confirmed working slug: `provence-alpes-cote-d-azur`.
- **`departments=NN` does NOT filter via URL params in 2026-05 testing.** Adding `departments=35` (Ille-et-Vilaine, Brittany) to a `regions=brittany` query returns the identical 333 results as `regions=brittany` alone. Bracket-syntax `departments[]=35` returns a 500 "Sorry, we are having temporary issues with our system" error page. The departments multi-select on the search form is driven by client-side JS that mutates a hidden field and submits a different payload shape — **the URL-param surface only honors `regions=`, not `departments=`**. To scope below region, post-filter the extracted `department` field client-side (it's always present as `<span class="department">…<strong>NAME (NN)</strong>`).
- **`property_types_all` is single-value despite the `_all` suffix.** The form's `<select>` emits one `house|apartment|business|land`. Passing multiple values (`property_types_all=house,apartment` or `property_types_all[]=house&property_types_all[]=apartment`) is silently dropped — the response shows all types. To search across types, fetch each type separately and union client-side.
- **The CSS class string is `property_listing  standard ` with a double space and trailing space.** That's the production literal in the rendered HTML. If you use a CSS selector framework, match by class containment (`property_listing standard`), not exact string equality. The four observed listing variants are `property_listing  featured `, `property_listing  standard `, `property_listing advertise`, `property_listing standard text-center`. The first two are real listings; `advertise` is a sponsored card with NO microdata (no `meta itemprop="price"`, no reference) — skip it. `standard text-center` is an empty-state placeholder shown when a page has fewer than 25 results — also skip it.
- **Titles in the listing card are truncated with `…`** (e.g. `Just a Few Minutes from Rennes, in a Preserved and Perfectly Peaceful Setting, this Elegant Character Property Exudes Ch…`). For the full title, fetch the detail page at the `meta itemprop="url"` link. The truncation length appears to be ~155 characters.
- **`bathrooms`, `habitable_size_m2`, `land_size` are optional fields** — apartments often lack `land_size`; studios may lack `bathrooms`; land plots lack both `bedrooms` and `habitable_size_m2`. Always guard the regex with a presence check; don't emit `null` as `0`.
- **`info-land` carries the unit inline** (`2.6 ha`, `1200 m²`). Don't assume hectares. Parse both number and unit; convert client-side if you need a normalized field. The land filter's `land_size_unit` URL param accepts `m` or `ha`; mismatched units (e.g. `minimum_land_size=1` with `land_size_unit=m`) return effectively-all results, so always pair them.
- **`page_size` URL param is silently ignored.** The form has `name="page_size"` and 25 is fixed. Don't try to fetch 100 per page.
- **`<meta itemprop="price">` is the source of truth, not the `<h4>€780,000</h4>` rendered text.** The displayed h4 changes with `currency=GBP|USD|...`; the meta always emits the underlying EUR integer. Some listings have `price=0` or omit the meta entirely — those render as "Price on request" / blank — emit `price_eur: null` for these, not `0`.
- **Featured listings appear on EVERY page** of paginated results (paid placement). They have the same `reference`/url, so deduplicate by `reference` when collecting across pages, or you'll over-count.
- **`Results A - B of C` regex match** can find multiple hits if the page has alternate-language `<link hreflang>` versions in the head with translated text. Use the FIRST match or scope the regex to the `<div id="results">` container.
- **Cloudflare Cache-Status is `DYNAMIC`, never `HIT`.** Search responses are not cached at the edge — count on ~1–3s per page-fetch through proxy. There is no rate-limit response observed at 1 req/s sustained, but adding any explicit rate-limit avoids social risk.
- **`exclude_agencies=1` only narrows by ~2%** (333 → 326 in Brittany 2026-05 sample) — most listings are agency-listed. Use it only when private-vendor-only is a hard requirement.
- **The `sort` URL param does NOT work; you need the split `sort_by` + `sort_direction` pair.** The form's `<select name="sort">` emits the full `/properties-for-sale?sort_by=…&sort_direction=…` URL as its value, which is what gets navigated to. Passing `sort=date` alone is silently ignored.
- **Rentals are a different surface.** `/properties-for-sale` is sale-only. For rentals, the endpoint is `/properties-to-rent` with a POST-only form (`/properties-to-rent/submit-search`) and a completely different param namespace (`price_min` / `price_max` / `bedrooms_min` / `bedrooms_max` / `locations[]` / `attributes[]`). This skill targets sale listings; rentals require a separate skill.
- **`burgundy` (English-kebab) appears to NOT be a valid `regions=` slug** — testing returned an empty title repeatedly. The corresponding metropolitan region (Bourgogne) was merged into Bourgogne-Franche-Comté in 2016, but neither `burgundy` nor `bourgogne-franche-comte` works. If a user requests Burgundy, either search the underlying Côte-d'Or / Saône-et-Loire / Nièvre / Yonne departments by `regions=france` with client-side department filtering, OR fall back to the directory at `/regions/bourgogne/` (which links to listings via per-department deep URLs).

## Expected Output

```json
{
  "success": true,
  "search_params": {
    "regions": "brittany",
    "minimum_price": 200000,
    "maximum_price": 400000,
    "minimum_bedrooms": 3,
    "property_types_all": "house",
    "sort_by": "date",
    "sort_direction": "desc"
  },
  "url": "https://www.french-property.com/properties-for-sale?regions=brittany&minimum_price=200000&maximum_price=400000&minimum_bedrooms=3&property_types_all=house&sort_by=date&sort_direction=desc",
  "total_matches": 61,
  "page": 1,
  "page_size": 25,
  "total_pages": 3,
  "listings": [
    {
      "reference": "IFPC46841",
      "url": "https://www.french-property.com/sale-property/1-IFPC46841",
      "title": "Just a Few Minutes from Rennes, in a Preserved and Perfectly Peaceful Setting, this Elegant Character Property Exudes Ch…",
      "price_eur": 780000,
      "currency": "EUR",
      "region": "Brittany",
      "department": "Ille-et-Vilaine (35)",
      "commune": "Rennes, 35000",
      "bedrooms": 5,
      "bathrooms": 3,
      "habitable_size_m2": 260,
      "land_size_value": 2.6,
      "land_size_unit": "ha",
      "image_url": "https://cdn4.french-property.com/private-vendors/IFPC46841/21285379-6923-4488-8aa3-b07b385bd621.jpg?height=500&width=750",
      "description": "5 bed country estate for sale in Rennes. Renovated property with swimming pool – 260 m² – 2.5 hectares – 10 min from Rennes on the Rennes/St Malo road…"
    }
  ]
}
```

### No-results shape

```json
{
  "success": true,
  "search_params": { "regions": "brittany", "minimum_price": 50000000 },
  "url": "https://www.french-property.com/properties-for-sale?regions=brittany&minimum_price=50000000",
  "total_matches": 0,
  "page": 1,
  "total_pages": 0,
  "listings": [],
  "no_results_message": "No properties found - try expanding your search:"
}
```

### Single-reference lookup shape

```json
{
  "success": true,
  "search_params": { "reference": "IFPC46841" },
  "url": "https://www.french-property.com/properties-for-sale?reference=IFPC46841",
  "total_matches": 1,
  "page": 1,
  "total_pages": 1,
  "listings": [ { "reference": "IFPC46841", "...": "..." } ]
}
```

### Invalid-region fallback (defensive)

If the response `<title>` contains "Property for sale in France" but the request specified `regions=<X>`, the slug was invalid and the site silently fell back to all-France. Emit:

```json
{
  "success": false,
  "reason": "invalid_region_slug",
  "requested_region": "bretagne",
  "hint": "Use the English kebab-case slug. Valid: alsace, aquitaine, ... See SKILL.md workflow table.",
  "search_params": { "regions": "bretagne" }
}
```
