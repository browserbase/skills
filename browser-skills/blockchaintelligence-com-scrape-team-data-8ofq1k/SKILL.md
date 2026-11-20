---
name: blockchaintelligence-com-scrape-team-data-8ofq1k
title: Scrape Blockchain Intelligence Team Data
description: >-
  Collect every team member from blockchaintelligence.com (BIPA) — name, role,
  profile URL, photo, and full bio — via the WordPress REST API roster page plus
  per-member profile-page fetch. Read-only.
website: blockchaintelligence.com
category: data-extraction
tags:
  - web-scraping
  - team
  - wordpress
  - rest-api
  - data-extraction
source: 'browserbase: agent-runtime 2026-06-15'
updated: '2026-06-15'
recommended_method: hybrid
alternative_methods:
  - method: api
    rationale: >-
      The full team roster (name, role, photo, profile URL) is available in a
      single WP REST call: GET /wp-json/wp/v2/pages?slug=meet-our-team — its
      content.rendered HTML holds every member block. No per-member fetch needed
      if bios aren't required.
  - method: fetch
    rationale: >-
      Per-member bios are NOT in the REST API (the 'team' CPT is not
      REST-registered — /wp-json/wp/v2/team returns 404). Each bio is parsed
      from a plain GET of the /team/{slug}/ profile HTML (.team-content
      paragraphs or og:description).
  - method: browser
    rationale: >-
      A scripted browser works but is unnecessary — every page is static
      server-rendered HTML reachable over plain HTTP. Use only if Cloudflare
      ever begins challenging the HTTP path.
verified: false
proxies: false
---
# Scrape Blockchain Intelligence Team Data

## Purpose
Collect the complete team/staff roster of the Blockchain Intelligence Professionals Association (BIPA, `blockchaintelligence.com`) and return one structured record per member: full name, role/job title, profile URL, photo URL, and full biography. This is a **read-only** extraction. The site is a WordPress install, so the fast path is its REST API for the roster plus a single plain-HTTP GET per member for the bio — no scripted browsing required.

## When to Use
- "Scrape / collect the team (or staff, leadership, members) of blockchaintelligence.com."
- Building a contact/people dataset for BIPA (names, titles, bios, headshots).
- Monitoring the team page for added/removed members or role changes.
- Any task needing the canonical list of certified specialists / chairman listed under `/meet-our-team/`.

## Workflow

The optimal method is **HTTP, not browser automation**. Every relevant page is static, server-rendered HTML behind Cloudflare that serves `200` to plain GETs (no JS challenge, no proxy needed for these paths). Use `browse cloud fetch <url>` (or any HTTP client) — do not script a browser unless the HTTP path starts returning challenges.

1. **Get the roster in one call (WP REST API).** The "Meet our team" page is WordPress page id `9769`. Fetch its rendered content:
   ```
   GET https://blockchaintelligence.com/wp-json/wp/v2/pages?slug=meet-our-team
   ```
   Parse the JSON, take `result[0].content.rendered`. It contains one `<div class="team-block …">` per member. From each block extract:
   - **profile_url** — `href="https://blockchaintelligence.com/team/{slug}/"`
   - **photo_url** — the `<img src="…wp-content/uploads/….jpg">`
   - **name** — text of `<div class="team-name"><a …>NAME</a></div>`
   - **role** — text of `<div class="team-job">ROLE</div>`

   As of the last run this yields **7 members**: Bogdan VACUSTA (Chairman), Aurel HUSTEA, Vasile LUPU, Diana PATRUT, Alina Gabriela POPESCU, Catalin VREME, Claudiu ZBIRCEA.

2. **Enrich each member with their bio (per-member GET).** Bios are NOT in the REST API (see Gotchas). For each `profile_url` from step 1:
   ```
   GET https://blockchaintelligence.com/team/{slug}/
   ```
   From the returned HTML extract:
   - **name** — `<div class="team-name …">NAME</div>` (confirms the roster value)
   - **role** — `<div class="team-job">ROLE</div>`
   - **bio** — concatenate the `<p>…</p>` paragraphs inside `<div class="team-content …">`. If that selector misses, fall back to the `<meta property="og:description">` value (a truncated one-paragraph summary).
   - **photo** — `<meta property="og:image">` (same image as the roster).

3. **Decode HTML entities** in every text field: `&amp;`→`&`, `&#8217;`→`'`, `&#8211;`→`–`, `&#039;`→`'`, `&nbsp;`→space, then strip residual tags and collapse whitespace.

4. **Emit JSON** — one object per member plus a top-level count and the roster endpoint used (see Expected Output).

### Browser fallback
Only if the HTTP path is ever Cloudflare-challenged:
1. `browse open https://blockchaintelligence.com/meet-our-team/ --remote` (add `--proxies` if challenged).
2. `browse wait load`, then dismiss the "We value your privacy" cookie banner (click **Accept All**) if it overlaps content.
3. `browse get markdown body` or `browse get text body` to pull the roster, then open each `/team/{slug}/` for bios. Same `.team-name` / `.team-job` / `.team-content` structure renders in the DOM.

## Site-Specific Gotchas
- **WordPress site (LiteSpeed + Cloudflare).** Response headers advertise `Link: <…/wp-json/>; rel="https://api.w.org/"` and `X-Tec-Api-Root` — confirming the REST API is live and open (no auth required for reads).
- **The `team` post type is NOT REST-registered.** `GET /wp-json/wp/v2/team` returns `404 rest_no_route`, and `team` does not appear in `/wp-json/wp/v2/types`. Don't waste time hunting for a `/wp/v2/team` collection — it doesn't exist. The roster only lives inside the Elementor-built `meet-our-team` *page* content, and bios only on the `/team/{slug}/` HTML pages.
- **Roster is rendered by the GavickPro "gva-teams" Elementor widget.** Member blocks use stable classes: `.team-block`, `.team-image`, `.team-name`, `.team-job`. Each member link appears **twice** per block (image link + name link) — de-duplicate by slug.
- **Proxies / verified NOT required for the data path.** The homepage shows a Cloudflare + hCaptcha posture (pre-run probe flagged `likelyNeedsProxies: true` for `/`), but the WP REST API endpoint and every `/team/{slug}/` and `/meet-our-team/` page returned `200` over a plain `browse cloud fetch` with **no** `--proxies` and **no** `--verified`. Only add proxies if you later get a Cloudflare interstitial.
- **Sitemaps don't help enumerate the team.** `/sitemap.xml` (Google Sitemap Generator) splits into `post-sitemap.xml` / `page-sitemap.xml` / `sitemap-misc.xml` — there is no dedicated team sitemap, and `/wp-sitemap.xml` returns an empty urlset. `/sitemap_index.xml` 404s. Use the roster page, not the sitemap, as the source of truth for the member list.
- **Cookie consent banner** ("We value your privacy") overlays the lower-right of pages in a real browser. It does not affect HTTP fetches; only matters for the browser fallback / screenshots.
- **Detail pages are heavy (~130 KB HTML)** because of the full Elementor theme; the `.team-content` bio block is a small slice. Parse, don't render.
- **Member count is small and can change** (7 at last capture). Always re-derive the count from the roster rather than hardcoding.

## Expected Output
```json
{
  "source": "blockchaintelligence.com",
  "roster_endpoint": "https://blockchaintelligence.com/wp-json/wp/v2/pages?slug=meet-our-team",
  "team_count": 7,
  "team": [
    {
      "name": "Bogdan VACUSTA",
      "role": "Chairman",
      "slug": "bogdan-vacusta",
      "profile_url": "https://blockchaintelligence.com/team/bogdan-vacusta/",
      "photo_url": "https://blockchaintelligence.com/wp-content/uploads/bogdan2.jpg",
      "bio": "Bogdan has over 20 years' experience in intelligence, compliance, audit & investigations and now serves as a strategy consultant on crypto-assets for the National Bank of Romania.\n\nAn Accredited Counter Fraud Specialist, Accredited Counter Fraud Manager, Certified DLT & Blockchain Manager, Certified Crypto-Assets Investigator & Compliance Specialist, Certified OSINT Practitioner …"
    },
    {
      "name": "Aurel HUSTEA",
      "role": "Crypto-Assets Investigator & Compliance Specialist",
      "slug": "aurel-hustea",
      "profile_url": "https://blockchaintelligence.com/team/aurel-hustea/",
      "photo_url": "https://blockchaintelligence.com/wp-content/uploads/aurel2.jpg",
      "bio": "…"
    }
  ]
}
```

Per-member schema:
```json
{
  "name": "string — full name as displayed (surname is usually UPPERCASE)",
  "role": "string — job title from .team-job",
  "slug": "string — URL slug under /team/",
  "profile_url": "string — absolute /team/{slug}/ URL",
  "photo_url": "string — absolute wp-content/uploads image URL",
  "bio": "string — paragraphs from .team-content joined by \\n\\n; falls back to og:description (truncated) if the block is absent"
}
```

Empty / failure shape (roster endpoint unreachable or returns no blocks):
```json
{ "source": "blockchaintelligence.com", "team_count": 0, "team": [], "error_reasoning": "roster page returned <status> or no .team-block elements found" }
```
