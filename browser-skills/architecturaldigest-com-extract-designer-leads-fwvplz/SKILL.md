---
name: architecturaldigest-com-extract-designer-leads-fwvplz
title: Extract AD PRO Interior Designer Leads
description: >-
  Extract contact leads for interior designers listed in the Architectural
  Digest AD PRO Directory — firm name, contact person (when named), email,
  phone, and website — by paginating the Interior Design & Decor category and
  parsing each server-rendered profile page.
website: architecturaldigest.com
category: lead-generation
tags:
  - leads
  - interior-design
  - directory
  - contacts
  - architectural-digest
  - scraping
source: 'browserbase: agent-runtime 2026-08-18'
updated: '2026-08-18'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      A headless browser session can drive the same pages and works, but it is
      slower and more expensive, and `browse snapshot` frequently errors on
      these heavy Condé Nast Verso pages (use `browse get markdown body`/`html`
      instead). Prefer plain HTTP fetch since every field is present in the
      initial server-rendered HTML.
  - method: api
    rationale: >-
      No usable internal JSON/GraphQL API exists — the directory and profile
      data are fully server-side rendered; the only XHR/fetch traffic observed
      was third-party analytics and ad pixels. Do not hunt for a data API.
verified: false
proxies: false
---
# Extract AD PRO Interior Designer Leads

## Purpose

Extract contact "leads" for interior designers listed in the **AD PRO Directory** on architecturaldigest.com. For each business this returns: firm name, contact person name (when named), email, phone, and website. It is a **read-only** scraping task — no login, no forms submitted, no state changed. Every field lives in the initial server-rendered HTML, so the recommended method is plain HTTP `fetch` (no browser, no proxies, no anti-bot handling required).

## When to Use

- You need a list of interior-design firms from the AD PRO Directory with their public contact details (email, phone, website).
- You want to build a lead/outreach list scoped to a directory category (e.g. Interior Design & Decor, or by extension Architecture, Builders & Contractors, Outdoor & Garden Design).
- You need firm-level contact info for a specific AD PRO profile slug you already have.
- You do **not** need this if you want editorial article content — this skill targets the business directory only.

## Workflow

**Recommended method: HTTP fetch of server-rendered HTML.** The listing and profile pages return complete HTML on a plain GET (HTTP 200, no cookies, no JS execution, no proxy needed). There is no JSON/GraphQL API to call — all data is in the HTML.

1. **Fetch the category listing, page 1.**
   `GET https://www.architecturaldigest.com/adpro/directory/businesses?category=interior-design-decor`
   Read the results header to get the total count, e.g. `1 - 50 of 1,241 Results`. Results are **50 per page**, so `total_pages = ceil(total / 50)` (≈25 pages for interior design).

2. **Paginate.** Append `&page=N` (1-based) to walk every page:
   `.../businesses?category=interior-design-decor&page=2`, `&page=3`, … up to `total_pages`.

3. **Collect profile links from each page.** Each business card links to a profile path matching `/adpro/directory/profile/{slug}`. Extract the unique slugs (expect ~50 per page). The firm name also appears next to each card, but the authoritative fields come from the profile page in the next step.

4. **Fetch each profile page and parse the header contact block.**
   `GET https://www.architecturaldigest.com/adpro/directory/profile/{slug}` and extract:
   - **firm_name** — the page `<title>`, formatted `"{Firm} | Architectural Digest"` (strip the ` | Architectural Digest` suffix).
   - **website** — the `href` of the anchor with class/attr `HeaderAddressWebUrl` (an external URL). May be absent → `null`.
   - **email** — the `mailto:` target of the anchor with class/attr `HeaderAddressEmail`.
   - **phone** — the `tel:` target of the anchor with class/attr `HeaderAddressPhone`. Stored literally as `+(1) 312 644 9270` (with parentheses and spaces) — normalize downstream if you need E.164.
   - **person_name** — **not a structured field.** Derive best-effort from the About/description prose ("principal designer X", "founder X", "led by X") and/or the email local-part (`steve@…`, `liz@…`). Set `null` when no individual is named (many firms use `info@…`).
   - Optional extras also present: `HeaderAddressInstagram`, and address parts `HeaderAddressStreet/City/State/PostalCode/Country`.

5. **Assemble one lead object per profile** and emit the array (see Expected Output). Throttle politely — a full category sweep is ~25 listing fetches + ~1,241 profile fetches.

### Browser fallback

If you must drive a browser (e.g. the fetch path is unavailable in your runtime), it works but is slower/costlier:

1. Open the category URL in a **remote** session. Wait for load.
2. **Do not use `browse snapshot`** — it intermittently errors (`Error: error taking snapshot: -3`) on these heavy Verso pages. Use `browse get markdown body` or `browse get html body` for both the listing (to harvest `/adpro/directory/profile/{slug}` links) and each profile (to read the contact block).
3. A cookie-consent overlay (Fides, `id="fides-overlay"`) prepends "Manage your consent preferences…" text to the extracted markdown — ignore that preamble; the real data (phone/email/website/firm) is below it. You do **not** need to dismiss the overlay to read the DOM.
4. Reuse the single open session — repeatedly issuing `browse open --remote` triggers `Session "default" is already running` and wastes turns.

## Site-Specific Gotchas

- **No data API — do not look for one.** The directory and profile data are fully server-side rendered. The only XHR/fetch traffic on these pages is third-party analytics/ad pixels (reddit, twitter/x, bing, doubleclick, pinterest). Parse the HTML.
- **No anti-bot / no auth.** Homepage probe reported no antibots. Both proxied and **bare** (no proxy, no `--verified`) fetches returned HTTP 200 with full content. Residential proxies are **not** required. No AD PRO login is needed to read directory profiles.
- **Category slug is `interior-design-decor`.** The directory mixes disciplines; without the filter you get all 1,616 businesses. Other observed category slugs: `architecture`, `builders-and-contractors`, `outdoor-garden-design`. Filter via `?category=interior-design-decor`.
- **Pagination is `&page=N`, 50 results/page.** It combines with the category filter: `?category=interior-design-decor&page=2`. Interior Design & Decor had **1,241 results** (~25 pages) as of Aug 2026; counts drift over time, so always read the live `N of M Results` header rather than hardcoding.
- **Profile URL shape.** Cards link to `/adpro/directory/profile/{slug}`. A bare `/profile/{slug}` path also appears in metadata but the canonical, fetchable page is under `/adpro/directory/profile/{slug}`.
- **`person_name` is unreliable/optional.** It is not a first-class field — it only appears in prose. Firms frequently list a generic `info@` mailbox and name no individual; return `null` rather than guessing.
- **Phone formatting is quirky.** The `tel:` value is stored as `+(1) 864 250 0021` (literal parentheses). Keep the raw value and normalize separately if needed.
- **`<title>` suffix.** Firm name comes as `"{Firm} | Architectural Digest"` — strip the suffix. There is also a generic `<title id="…">Architectural Digest</title>` node elsewhere in the doc; take the first, descriptive `<title>`.
- **Browser snapshot is flaky here.** `browse snapshot` returned `-3` errors on these pages; prefer text/markdown/HTML extraction. (Documented in the browser fallback above.)
- **Scale/politeness.** A full interior-design sweep is ~1,266 requests. Add delays/concurrency limits; the data is stable enough to cache profile HTML.

## Expected Output

A JSON object with pagination metadata and an array of lead objects. `website` and `person_name` are nullable.

```json
{
  "success": true,
  "source": "AD PRO Directory",
  "category": "interior-design-decor",
  "total_results": 1241,
  "results_per_page": 50,
  "pages_fetched": 1,
  "leads": [
    {
      "firm_name": "Kadlec Architecture + Design",
      "person_name": "Steve Kadlec",
      "email": "steve@kadlecdesign.com",
      "phone": "+(1) 312 644 9270",
      "website": "https://www.kadlecdesign.com",
      "profile_url": "https://www.architecturaldigest.com/adpro/directory/profile/kadlec-architecture-design"
    },
    {
      "firm_name": "Liz Caan & Co.",
      "person_name": "Liz Caan",
      "email": "liz@lizcaan.com",
      "phone": "+(1) 617 244 0424",
      "website": "http://www.lizcaan.com",
      "profile_url": "https://www.architecturaldigest.com/adpro/directory/profile/liz-caan-co"
    },
    {
      "firm_name": "Panageries",
      "person_name": null,
      "email": "info@panageries.com",
      "phone": "+(1) 864 250 0021",
      "website": "https://panageries.com/",
      "profile_url": "https://www.architecturaldigest.com/adpro/directory/profile/panageries"
    }
  ],
  "error_reasoning": null
}
```

Per-lead schema:

```json
{
  "firm_name": "string        // from <title>, ' | Architectural Digest' stripped",
  "person_name": "string|null // best-effort from prose/email local-part; null if none named",
  "email": "string|null       // mailto: from HeaderAddressEmail",
  "phone": "string|null       // tel: from HeaderAddressPhone; literal e.g. '+(1) 312 644 9270'",
  "website": "string|null     // href from HeaderAddressWebUrl; null if not listed",
  "profile_url": "string      // canonical /adpro/directory/profile/{slug} URL"
}
```

On failure (e.g. an unexpected block or a category with zero results), return `success: false` with `leads: []` and a populated `error_reasoning`.
