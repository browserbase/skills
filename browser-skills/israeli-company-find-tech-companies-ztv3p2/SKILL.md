---
name: israeli-company-find-tech-companies-ztv3p2
title: Find Israeli Tech Companies and Companies With Israeli Ties
description: >-
  Enumerate brand entries on israeli.company classified in the technology sector
  — Israeli-founded/owned firms and non-Israeli companies the site has
  documented as having ties to Israel — with optional per-brand verdict and
  metadata.
website: israeli.company
category: research
tags:
  - research
  - tech
  - directory
  - wordpress-api
  - israel
  - company-lookup
source: 'browserbase: agent-runtime 2026-05-20'
updated: '2026-05-20'
recommended_method: api
alternative_methods:
  - method: url-param
    rationale: >-
      Public archive pages like /technology/ and /health-tech-life-sciences/
      mirror the API tag lists 1:1 and are JS-free server-rendered pagination —
      good fallback for screenshotting or when the REST endpoint is blocked.
  - method: browser
    rationale: >-
      Only needed if both the REST API and archive HTML are blocked. The site
      has no GraphQL/search-backend; browsing pagination is the last resort and
      is strictly slower than the API.
verified: true
proxies: true
---
# Find Israeli Tech-Sector Companies and Companies With Israeli Ties

## Purpose

Enumerate brand entries on `israeli.company` that the site has classified as belonging to the technology sector — either Israeli-founded/owned companies, or non-Israeli companies the site has documented as having ties to Israel (Israeli subsidiaries, founders, investments, supply-chain links, public statements, etc.). The skill returns a list of `{title, slug, url, tag_ids}` for every matching brand, and (optionally) the per-brand metadata block parsed from each brand's HTML page: `verdict`, `multinational`, `founded`, `founders`, `parent_company`, `child_companies`, `headquarters`, `belongs_to`, `in_the_news`. Read-only — never POSTs, never logs in.

## When to Use

- A user asks "what tech companies on israeli.company are flagged as Israeli or having Israeli ties?"
- A user wants a filtered list by tech sub-sector — fintech, healthtech, cybersecurity, mobility, agritech, etc.
- A user needs counts of brands tagged with technology categories (e.g. "how many entries does israeli.company have under Health Tech & Life Sciences?").
- A user asks about a specific company (e.g. "is Microsoft an Israeli company per israeli.company?") and wants the site's structured verdict + details.
- An analyst wants to bulk-export the tech-sector brand catalog for downstream processing.

## Workflow

The site is a public WordPress install with `/wp-json/wp/v2/*` fully exposed, unauthenticated, no rate-limit observed, Cloudflare cached. **Use the WP REST API for listing/filtering — it is dramatically faster than scraping and returns clean JSON.** The HTML page is only needed when the user wants per-brand detail fields (verdict, founders, HQ, etc.), because the REST API returns empty `content`/`excerpt` for these posts.

### Step 1 — Resolve the tech-sector tag IDs

Tech sectors are stored as WordPress `post_tag` taxonomy terms. Either hardcode the canonical IDs below, or re-discover them with a search query (the IDs are stable but counts shift as new brands are added).

```
GET https://israeli.company/wp-json/wp/v2/tags?per_page=100&search=tech
```

Canonical tech-sector tag IDs as of 2025-10 (counts as of 2026-05):

| Tag ID | Slug | Name | Count |
|---|---|---|---|
| 4 | `technology` | Technology (general) | 490 |
| 6172 | `health-tech-life-sciences` | Health Tech & Life Sciences | 1,568 |
| 6170 | `industrial-technologies` | Industrial Technologies | 759 |
| 6171 | `agriculture-food-technologies` | Agriculture & Food Technologies | 625 |
| 6165 | `media-entertainment-technologies` | Media & Entertainment Technologies | 439 |
| 6169 | `fintech-insurtech` | Fintech & Insurtech | 392 |
| 6174 | `automotive-mobility-technologies` | Automotive & Mobility Technologies | 290 |
| 6176 | `energy-tech` | Energy Tech | 216 |
| 6173 | `education-knowledge-technologies` | Education & Knowledge Technologies | 149 |
| 6193 | `fintech` | Fintech (legacy) | 24 |
| 6168 | `cybersecurity` | Cybersecurity (resolve via slug — see below) | ~varies |
| 6259 | `information-technology` | Information Technology | 8 |
| 815 | `wearables-smart-tech` | Wearables smart tech | 5 |

Use the slug-based lookup when you need to pin a tag without trusting the cached ID: `GET /wp-json/wp/v2/tags?slug=technology` → returns the term with current `id` and `count`.

### Step 2 — Enumerate posts per tag

```
GET https://israeli.company/wp-json/wp/v2/posts?tags={tag_id}&per_page=100&page={N}&_fields=id,slug,title,link,tags,date
```

- `per_page` max is 100. `X-WP-Total` and `X-WP-TotalPages` response headers tell you how many pages remain.
- `_fields` is a comma-separated allow-list — use it to keep payloads small (the default response is ~4× larger and still has empty `content`).
- The `tags` query param accepts a CSV list (`tags=4,6172`) but the join is **OR (union)**, not AND. To find brands with multiple specific tags simultaneously, fetch each tag's list and compute the intersection client-side using the `id` field, or filter on the `tags` array returned per post.
- Titles follow a strict pattern: `"Is {Brand} an Israeli Company?"`. Strip the prefix/suffix to recover the brand name.
- The `categories` field on every post is `[1]` ("Brands") — informational only, do not filter on it.

To get a deduplicated **union of all tech-sector brands**, fetch every tag in step 1's table and union by `id`.

### Step 3 (optional) — Fetch per-brand detail from the HTML page

The REST API returns empty `content` / `excerpt` for these posts — Israeli-ties details live only in the rendered HTML body. Fetch the post's `link` URL and extract the structured block. The block sits inside `<main>` and uses a flat key/value layout you can regex out:

```
Israeli or Not: {Yes|No|Partially|...}
Multinational: {Yes|No}
Founded: {YYYY}
Founder(s): {Name, Name, ...}
Parent Company: {Brand|None}
Child Companies: {Brand, Brand, ...}
Location/ Headquarters: {City, Region, Country}
{Brand} belongs to: {Sector, Sub-sector, ...}
In the News: {short blurb}
```

The unverified-content disclaimer string `"The content on this page is not verified yet"` appears as an HTML comment for un-curated entries — surface this as a `verified: false` flag on the result if present.

### Step 4 — Return results

Aggregate Step 2 (and optional Step 3) into a single JSON list. If the user asked for a specific subsector, return only that tag's entries. If they asked broadly for "tech", return the union across all tags in Step 1's table.

### Browser fallback

If the WP REST API ever stops responding or you must screenshot the catalog UI, the human-readable archive pages mirror the API exactly:

- `https://israeli.company/technology/` — paginated archive for tag id 4
- `https://israeli.company/health-tech-life-sciences/` — tag id 6172
- `https://israeli.company/fintech-insurtech/` — tag id 6169
- `https://israeli.company/?s={query}&post_type=post` — site-wide full-text search

The archive pages render server-side with no JS gating; `browse open` + `browse get markdown body` works without `--verified` or `--proxies` in our testing. Each archive item is a card linking to `/is-{brand-slug}-an-israeli-company/`. The detail page renders the same key/value block described in Step 3.

## Site-Specific Gotchas

- **REST API `content` and `excerpt` are intentionally empty** for every brand post — the site stores the verdict/founders/HQ block as native HTML in the template, not as post body. Do not waste calls trying `_fields=content` and concluding the post is empty; fetch the `link` URL instead.
- **Multi-tag query is OR, not AND.** `?tags=4,6168` returns the union (anything tagged Technology *or* Cybersecurity). For an AND intersection, fetch each tag separately and intersect the `id` sets. WordPress does not expose `tags__and` over the public REST endpoint.
- **Only `category=1` (Brands) exists.** The single category covers all 9,963 brand posts — categories are not a useful filter. Tags (`post_tag` taxonomy) are the real classifier.
- **Tag IDs are stable but counts drift.** New brands get added monthly (last-mod dates in `sitemap_index.xml` show fresh activity through 2025-09). Re-resolve via `/wp-json/wp/v2/tags?slug=...` if you need today's count.
- **There are overlapping legacy/new tag pairs** — e.g. `fintech` (id 6193, 24 posts) and `fintech-insurtech` (id 6169, 392 posts), or `biotechnology` (id 49, 3 posts) vs `biotechnology-pharma` (id 40, 9 posts) vs `health-tech-life-sciences` (id 6172, 1568 posts). The newer six-thousand-range tags are the curated taxonomy; treat older low-id tags as historical/leftover and prefer the 6000-series when ambiguous.
- **Title pattern is rigid:** `"Is {Brand} an Israeli Company?"`. Strip with `/^Is (.+) an Israeli Company\?$/`. Special cases retained: `Run:AI`, `RAID: Shadow Legends`, `Microsoft Xbox`, `Microsoft Gaming` — the brand name may contain punctuation.
- **HTML titles are HTML-encoded** in the REST JSON — `Health Tech &amp; Life Sciences` (note `&amp;`). Decode entities before display.
- **`X-Robots-Tag: noindex`** is set on the `/wp-json/` responses. The endpoints work, but Google won't have them — don't expect Google site-search to cover the API surface.
- **Cloudflare in front of the site.** Heavy/parallel scraping might trigger `__cf_bm` challenge issuance; if you hit a 403 on `/wp-json/`, retry with `browse cloud fetch --proxies` (residential IP) rather than naked curl. No challenge was observed during ~20 sequential test calls without proxies.
- **No anti-bot wall observed** on either the REST API or the public archive HTML pages during four rounds of testing. Skill does not require `--verified` or `--proxies` for the recommended API path, but enabling them for HTML detail fetches is cheap insurance if you parallelize.
- **The site also exposes custom post types** (`movies`, `alternatives`, `public-figures` per the sitemap), but they're NOT registered in `/wp-json/wp/v2/types` and not reachable as `/wp-json/wp/v2/{type}`. They are NOT part of the brand tech-sector catalog — do not include them in tech-company results.
- **The `excerpt` and `In the News` fields can contain politically charged blurbs** (e.g. "Continues to fire employees for protesting against the company's complicity in the genocide" on the Microsoft entry). Surface them verbatim; do not editorialize. The skill returns whatever the site has on record.
- **"Israeli or Not"** can take values beyond Yes/No — observed values include `Yes`, `No`, `Partially`. Don't hardcode a boolean enum; preserve the string.
- **Pagination cap**: with `per_page=100`, the Health Tech & Life Sciences tag (1,568 posts) needs 16 page requests. The site happily serves them sequentially; budget ~20 calls per large tag.
- **There is no GraphQL endpoint and no Algolia/Elasticsearch backing search.** The only programmatic surface is `/wp-json/wp/v2/*`. The `?s=` URL-param search is WordPress core, not a separate API.

## Expected Output

### Shape A — Listing-only (Step 2 stops here)

```json
{
  "query": { "sector": "all-tech", "tag_ids": [4, 6172, 6170, 6171, 6165, 6169, 6174, 6176, 6173] },
  "total_unique_brands": 4928,
  "brands": [
    {
      "id": 33500,
      "brand": "TikTok",
      "slug": "is-tiktok-an-israeli-company",
      "url": "https://israeli.company/is-tiktok-an-israeli-company/",
      "tag_ids": [4, 6165],
      "tag_names": ["Technology", "Media & Entertainment Technologies"]
    },
    {
      "id": 1865,
      "brand": "Microsoft",
      "slug": "is-microsoft-an-israeli-company",
      "url": "https://israeli.company/is-microsoft-an-israeli-company/",
      "tag_ids": [807, 809, 943],
      "tag_names": ["Electronics", "Computers accessories", "Laptops desktops"]
    }
  ]
}
```

### Shape B — Listing + detail (Step 3 included)

```json
{
  "query": { "sector": "fintech-insurtech", "tag_id": 6169 },
  "total": 392,
  "brands": [
    {
      "id": 1865,
      "brand": "Microsoft",
      "url": "https://israeli.company/is-microsoft-an-israeli-company/",
      "details": {
        "verdict": "No",
        "multinational": "Yes",
        "founded": "1975",
        "founders": ["Bill Gates", "Paul Allen"],
        "parent_company": null,
        "child_companies": ["Windows", "Office", "Xbox", "Azure", "Surface"],
        "headquarters": "Redmond, Washington, USA",
        "belongs_to": ["Electronics", "Computers accessories", "Laptops desktops"],
        "in_the_news": "Continues to fire employees for protesting against the company's complicity in the genocide.",
        "verified": false
      }
    }
  ]
}
```

### Shape C — Single-brand lookup (user asked about one specific company)

```json
{
  "brand": "Microsoft",
  "found": true,
  "url": "https://israeli.company/is-microsoft-an-israeli-company/",
  "verdict": "No",
  "is_israeli": false,
  "has_israeli_ties_documented": true,
  "details": { "...same as Shape B.details..." }
}
```

### Shape D — Brand not in catalog

```json
{
  "brand": "ExampleCorp",
  "found": false,
  "searched": "https://israeli.company/wp-json/wp/v2/posts?search=ExampleCorp",
  "message": "No matching brand entry in the israeli.company catalog."
}
```
