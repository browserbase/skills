---
name: tpbennett-com-project-scraper-r1gikd
title: TP Bennett Recent Projects Scraper
description: >-
  Scrape tp bennett's recent architecture/interior-design projects with enriched
  detail — who is involved (named project lead + client) and what is being done
  (sector, status, location, size, narrative) — via the site's public Prismic
  Content API.
website: tpbennett.com
category: architecture
tags:
  - architecture
  - projects
  - prismic
  - cms-api
  - read-only
  - scraping
source: 'browserbase: agent-runtime 2026-08-13'
updated: '2026-08-13'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      If the Prismic Content API is ever unavailable, open
      https://www.tpbennett.com/work/ and each /work/<uid>/ detail page and read
      the rendered text. Works with a bare session but costs ~100x more since
      the pages are fully JS-rendered (requires wait load + wait timeout ~3000
      before extraction).
verified: false
proxies: false
---
# TP Bennett Recent Projects Scraper

## Purpose

Return tp bennett's recent architecture / interior-design projects, each enriched with **who is involved** (the named tp bennett project lead plus the client) and **what is being done** (sector, project stage/status, location, size, and a narrative summary). tpbennett.com is a Next.js site whose content is served from the **Prismic** headless CMS, which exposes an unauthenticated public JSON API. Prefer that API — it returns the identical content the site renders, structured, in one request, with no auth, cookies, proxies, or anti-bot stealth. Read-only; never writes.

## When to Use

- Monitoring tp bennett's latest completed and in-progress projects.
- Building a feed of the practice's work with structured metadata (client, sector, location, status) rather than scraping rendered HTML.
- Enriching a project list with the responsible tp bennett director/principal and a short description of the scheme.
- Any flow that would otherwise scrape `https://www.tpbennett.com/work/` — the Prismic API is faster, cheaper, and structurally reliable.

## Workflow

The site's content lives in the Prismic repository **`tp-bennett`**. Its public Content API v2 is at `https://tp-bennett.cdn.prismic.io/api/v2` — no auth, no cookies, no proxy, no stealth. Individual projects are documents of type **`work_item`**. Lead with the API; a browser fallback is documented at the end but costs ~100× more (the pages are fully JS-rendered).

1. **Get the master ref.** Refs rotate on every content publish, so fetch a fresh one each run:
   ```
   GET https://tp-bennett.cdn.prismic.io/api/v2
   ```
   Read `refs[]` and take the entry where `isMasterRef === true` (e.g. `anxqLBIAAC0AuWDa`).

2. **List recent projects** (ordered most-recent-first). URL-encode the query; brackets/quotes/spaces must be encoded:
   ```
   GET https://tp-bennett.cdn.prismic.io/api/v2/documents/search
       ?ref=<REF>
       &q=[[at(document.type,"work_item")]]
       &orderings=[document.first_publication_date desc]
       &pageSize=100
   ```
   Returns `total_results_size` (12 today, single page) and `results[]`. Use `document.last_publication_date desc` instead if you want "recently updated" rather than "recently added".

   Optionally, the site's own **curated** recent strip (what the `/work/` landing page shows) is the `project_group` document with `uid=work-recent`:
   ```
   &q=[[at(document.type,"project_group")]]
   ```
   Its `data.projects[]` is an ordered list of `work_item` content-relationships (currently `11-12-wellington-place`, `capital-group`, `dockside-canada-water`). The embedded copy only carries `name`/`title`/`type`/`colour`/`media` — fetch the full `work_item` (step 3) for the enrichment fields.

3. **Extract enrichment from each `work_item`** (`results[i].data`):
   - **Identity / "what":** `name` (project name), `title` (editorial headline), `type` (sector, e.g. `WORKPLACE`, `COMMERCIAL, RETROFIT`, `LIVING`), `media.url` (hero image).
   - **Structured facts:** the slice with `slice_type === "project_info"` → `primary.info[]` is an array of `{ heading, text }` rows. Observed headings: **Client, Location, Size, Status, Sector, Discipline**. Also `primary.content[]` (rich-text paragraphs — the project overview).
   - **"Who is involved":** `project_info.primary.quote_author` — a named tp bennett lead with role, e.g. `"Mark Davies, Director"` / `"Emma Green, Principal Director"`. Pair with the `Client` info row for the full "who". `quote_author` is **null on some projects** (e.g. masterplans) — treat as optional.
   - **Narrative / "what is being done":** slices with `slice_type === "header_paragraph"` → `primary.heading` + `primary.paragraph[]` (each project has 1–2). These describe the scheme ("A new base for the company's main trading operations…").
   - Flatten Prismic rich-text arrays by joining each block's `.text`.

4. **Build the canonical page URL** for each project: `https://www.tpbennett.com/work/<uid>/` (e.g. `https://www.tpbennett.com/work/bp-london/`).

5. **Emit** the project list (see Expected Output). One page of results covers the full set today; paginate via `&page=N` only if `total_pages > 1`.

### Browser fallback (only if the Prismic API is unavailable)

1. `browse open https://www.tpbennett.com/work/ --remote`
2. `browse wait load` then `browse wait timeout 3000` — the grid is client-rendered and populates 1–3s after load.
3. Collect each project link (`/work/<uid>/`), then for each: `browse open` the detail page, `wait load` + `wait timeout 3000`, and `browse get text body`. The rendered detail page carries the same fields (client, location, size, status, discipline, the named lead, and the overview copy). A bare (no proxy / no stealth) session is sufficient.

## Site-Specific Gotchas

- **The whole site is a Prismic-backed Next.js app.** Repo id `tp-bennett` is discoverable from the homepage's inline Prismic script + `images.prismic.io`/`static.cdn.prismic.io` in the CSP. The API needs **no auth, no cookies, no proxies, no `--verified`** — a plain HTTP GET returns 200.
- **The ref expires.** `refs[0].ref` changes on every content publish. Always fetch `/api/v2` first and use the current master ref; a stale ref returns an error. Don't hardcode it.
- **Projects are `work_item`, not `work`.** The `work` document type is the single `/work/` **index page** (a bag of layout slices), not the project list. Querying `document.type == "work"` returns 1 doc with no projects.
- **`project_group` `work-recent` is the site's curated "recent" set** (3 projects, hand-ordered). Querying all `work_item` ordered by `first_publication_date desc` gives the fuller recency-ordered list (12). Pick whichever "recent" you mean; this skill returns the full list and flags the curated subset.
- **"Who is involved" comes from within the project, not a team join.** There is a `project_team_member` type (16 leadership/people docs), but its `related_articles` field does not reliably link members to specific projects (empty document links). Per-project attribution is `project_info.quote_author` (named tp bennett lead) + the `Client` info row. Don't waste time trying to join `project_team_member` → `work_item`.
- **`quote_author` can be null** (e.g. masterplan/placemaking projects like `al-jabal-al-aali`, `33-canada-square`). Emit `lead: null` rather than failing.
- **`info[]` headings are data, not a fixed schema.** Read them dynamically (`Client`, `Location`, `Size`, `Status`, `Sector`, `Discipline` are what's observed today) — don't assume positional order.
- **`type` (sector) is free-text and sometimes compound** — e.g. `"COMMERCIAL, RETROFIT"`, `"PLACEMAKING, LIFESTYLE"`. Casing is inconsistent (`WORKPLACE` vs `Workplace` vs `Commercial`). Normalize if you need canonical sectors.
- **Prismic image URLs have a doubled query string** (`...?auto=format,compress?auto=compress,format`). It's harmless and served correctly — pass through as-is.
- **`tpbennett.com` 308-redirects to `www.tpbennett.com`**; the API host `tp-bennett.cdn.prismic.io` does not redirect.
- **Pre-run anti-bot probe: none detected**, and the successful API run required neither proxies nor a verified/stealth session. Only reach for the browser fallback (which does need `wait load` + `wait timeout 3000` on the JS-rendered grid) if the Prismic API is ever down.
- **Browser extraction is ~100× the cost** of the API for identical data — the autobrowse inner agent, given only the task description, independently chose the Prismic API over scraping.

## Expected Output

```json
{
  "success": true,
  "source": "prismic-api",
  "repository": "tp-bennett",
  "ref": "anxqLBIAAC0AuWDa",
  "count": 12,
  "curated_recent_uids": ["11-12-wellington-place", "capital-group", "dockside-canada-water"],
  "projects": [
    {
      "uid": "bp-london",
      "name": "BP London",
      "title": "Rethinking workplace inclusion",
      "sector": "WORKPLACE",
      "client": "BP",
      "location": "London, UK",
      "size": "253,000 sq ft",
      "status": "Complete",
      "discipline": "Interior Design",
      "lead": "Mark Davies, Director",
      "summary": "A new base for the company's main trading operations, spanning eight floors of the Cargo building in Canary Wharf; a fit-out designed around inclusivity and varied working styles.",
      "hero_image": "https://images.prismic.io/tp-bennett/aiBBSAeQX7-eWqnL_bp-hero-1-.jpg?auto=format,compress",
      "url": "https://www.tpbennett.com/work/bp-london/",
      "first_publication_date": "2026-06-03T15:05:06+0000",
      "last_publication_date": "2026-06-26T09:00:00+0000"
    },
    {
      "uid": "al-jabal-al-aali",
      "name": "Al Jabal Al Aali",
      "title": null,
      "sector": "PLACEMAKING, LIFESTYLE",
      "client": "Ministry of Housing and Urban Planning",
      "location": "Jabal Al Akdar, Oman",
      "size": null,
      "status": "Detailed Masterplan",
      "discipline": null,
      "lead": null,
      "summary": "...",
      "hero_image": "https://images.prismic.io/tp-bennett/...jpg",
      "url": "https://www.tpbennett.com/work/al-jabal-al-aali/",
      "first_publication_date": "2026-06-03T...",
      "last_publication_date": "2026-06-...T..."
    }
  ]
}
```

Failure shape (e.g. Prismic API unreachable and browser fallback also blocked):

```json
{ "success": false, "source": "prismic-api", "error_reasoning": "Could not fetch master ref from https://tp-bennett.cdn.prismic.io/api/v2 (HTTP 5xx)." }
```
