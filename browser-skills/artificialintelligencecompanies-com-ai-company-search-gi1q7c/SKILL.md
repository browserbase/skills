---
name: artificialintelligencecompanies-com-ai-company-search-gi1q7c
title: Find AI Companies by Niche or Problem
description: >-
  Search artificialintelligencecompanies.com to find AI vendors and startups
  serving a given niche or addressing a given problem, returning name, canonical
  URL, and description per match via the site's public JSON API and JSON-LD
  category pages.
website: artificialintelligencecompanies.com
category: directory
tags:
  - ai-directory
  - vendor-discovery
  - market-map
  - api
  - json-ld
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: api
alternative_methods:
  - method: hybrid
    rationale: >-
      Use /api/search/?q= for keyword discovery (top-5 capped, truncated
      descriptions), then fetch /cat/<slug>/ HTML and parse the JSON-LD ItemList
      for the full untruncated company roster in that vertical.
  - method: mcp
    rationale: >-
      Site advertises /mcp-server/ in llms.txt and agent-manifest.json. Not
      validated in this iteration; recommended for MCP-aware hosts doing
      repeated discovery.
  - method: browser
    rationale: >-
      Only useful if the public API is fully blocked (no evidence of this). The
      HTML /search/?q= page lacks JSON-LD and is strictly worse than the API;
      /cat/<slug>/ HTML works but plain `browse cloud fetch` is sufficient — no
      headless browser needed.
verified: false
proxies: false
---
# Find AI Companies by Niche or Problem on artificialintelligencecompanies.com

## Purpose

Given a niche (e.g. "healthcare", "customer service", "legal") or a problem statement (e.g. "automate inbound phone calls", "label training data", "detect insurance fraud"), return matching AI companies and startups from the public directory at `artificialintelligencecompanies.com`. For each match, return the company name, canonical directory URL path, and a short description. Read-only; never mutates the directory.

> The site is explicitly agent-friendly: `robots.txt` allows `GPTBot`, `ClaudeBot`, `ChatGPT-User`, `PerplexityBot`; `/llms.txt` advertises the API; and `/.well-known/agent-manifest.json` enumerates capabilities. No API key is needed for read access.

> **Prompt assumption (placeholder template):** the source prompt referenced `{niche}` and `{problem}` as unfilled placeholders. This skill treats them as **two synonymous facets of the same input** — the caller supplies one free-text string that is either an industry/vertical niche or a problem-to-solve phrase. The skill routes the same query through the same endpoint either way; the directory's `/api/search/` does keyword matching across both category names and company descriptions.

## When to Use

- Mapping a vertical (healthcare AI, legal AI, computer vision, AI receptionists, training-data services) to a shortlist of vendors.
- Translating an unstructured pain point ("our reps are drowning in tickets" → AI customer service vendors; "we need someone to phone-screen leads" → AI receptionist vendors) into a candidate vendor list.
- Building a market-map / competitive-landscape dataset across one of the 12 directory categories.
- Anywhere you'd otherwise scrape an AI vendor list by hand — the JSON API is faster and cheaper than rendering the site, and `/cat/<slug>/` pages have richer JSON-LD than the API returns.

## Workflow

The site exposes a documented read-only REST API plus an MCP server, both linked from `/llms.txt`. **Lead with the JSON API for keyword queries**, and supplement with the `/cat/<slug>/` HTML pages when you need full (non-truncated) descriptions or a complete category roster. A browser is only needed for the HTML category pages — and even those can be fetched as plain HTML via `browse cloud fetch <url> --proxies`; no JavaScript renders the company list (it's server-rendered with JSON-LD embedded).

1. **Pick the input shape.** Keyword search (one query string covering the niche or problem) is the common case. If the caller already knows the directory's taxonomy slug (e.g. `healthcare-ai`), prefer the category page directly — it returns more data.

2. **Keyword search (primary path)** — when input is a niche/problem string:
   ```
   GET https://artificialintelligencecompanies.com/api/search/?q={query}
   ```
   - `q` is required, URL-encode multi-word queries (`q=customer%20service`).
   - Returns `{"companies": [{name, url, description}, ...], "categories": [{name, url, description}, ...]}`.
   - **Hard-capped at 5 companies + matching categories** regardless of how popular the term is. A `limit` query param is silently accepted but ignored — see Gotchas.
   - Descriptions are **truncated to ~100 chars with a `...` suffix**. Use step 4 to fetch the full text.
   - Returns HTTP 200 with empty arrays (`{"companies": [], "categories": []}`) for no-hit queries; also returns 200 with empty arrays for 1-character `q` despite the OpenAPI declaring `minLength: 2` — treat empty-arrays as no-match.
   - Any matching `categories[*].url` (path like `/cat/healthcare-ai/`) is your hook into step 3 for the full vertical roster.

3. **Category-roster search (best for full coverage of a vertical)** — when input is a vertical/niche and you want the entire roster of vendors in that category:
   ```
   GET https://artificialintelligencecompanies.com/cat/{slug}/
   ```
   - Parse `<script type="application/ld+json">` blocks; there are 3 per page. The third is `@type: ItemList` with each item as an `Organization` containing `name`, `url`, and a **full untruncated description**. The first is a `CollectionPage` with `numberOfItems` (use as a count of expected rows).
   - Use this whenever the search API truncates a description you need, or when 5 results aren't enough.
   - **Stable 12-category enum** (as of 2026-05-19, verified via `/api/categories/?format=json`):
     `ai-automation-agencies`, `ai-consulting`, `ai-customer-service`, `ai-image-generators`, `ai-platforms`, `ai-receptionist`, `computer-vision`, `foundation-model-providers`, `healthcare-ai`, `legal-ai`, `machine-learning-platforms`, `training-data`.
   - To map a free-text vertical to a slug without keyword-searching first, hit `GET /api/categories/?format=json` (returns `{success, total, categories: [{id, slug, name, description}, ...]}`).

4. **Hydrate full descriptions** — when a search-API hit gave you a truncated description and the company belongs to a category, the company will also appear in that category page's JSON-LD `ItemList` with the full text. Cross-reference by `name`. (Direct individual-company JSON is **not available** — see Gotchas: `/api/companies/{id}/` is 500, and `/co/<slug>/` HTML is 500.)

5. **Combine and dedupe.** If your input is both a niche and a problem (e.g. "AI receptionist for plumbing companies"), run both phrasings through `/api/search/?q=` and union by `name`. Then for each company whose category you can identify (via the `categories[]` array in the same response), pull the full description from the corresponding `/cat/<slug>/` JSON-LD.

### Alternative: MCP server

`/llms.txt` advertises `http://artificialintelligencecompanies.com/mcp-server/` as a downloadable MCP server. If you have an MCP-aware host (Claude Desktop, Cursor, etc.) and are doing repeated discovery queries, install it. Not exercised in this skill's iteration — `recommended_method` stays `api` because the raw HTTPS calls are zero-setup and equally effective for one-shot lookups.

### Browser fallback

Only useful when the JSON API is fully blocked (no evidence this has ever happened — no auth, no anti-bot, served via Cloudflare with permissive `robots.txt`):

1. `browse open https://artificialintelligencecompanies.com/search/?q={query}` — the HTML search results page. Server-rendered, no JS required. Note: this page does **not** carry JSON-LD; you'd be parsing rendered HTML, which is strictly worse than the API.
2. `browse open https://artificialintelligencecompanies.com/cat/{slug}/` — the category page. Server-rendered with rich JSON-LD as described in step 3.

`browse cloud fetch <url> --proxies` is sufficient for both pages — no headless browser is required. Stealth/verified flags are **not** needed for any path on this site.

## Site-Specific Gotchas

- **`/api/companies/` is broken site-wide**: the OpenAPI-documented `GET /api/companies/?search=&category=&country=&status=` returns **HTTP 500** for every parameter combination tested on 2026-05-19 (no params, `?search=healthcare`, `?category=healthcare-ai`, `?limit=3`, with and without `format=json`). The browsable HTML form at the same path also renders the Django "Add Category Api" form rather than a list. **Do not waste turns on this endpoint** — use `/api/search/?q=` for keyword search and `/cat/<slug>/` JSON-LD for category rosters.
- **`/api/companies/{id}/` (detail by id) is broken**: returns HTTP 500 for `id=1` (and presumably all ids). The OpenAPI spec advertises it; the implementation is unavailable as of 2026-05-19.
- **Every `/co/<slug>/` company detail HTML page returns 500**: verified across `openai`, `anthropic`, `abridge`, `databricks`, `zendesk`, `goodcall` — 5 different company slugs spanning the alphabet. The site lists 208+ companies in its hero, but none of the canonical company-profile URLs render. **The only place to read a full company description today is the `/cat/<slug>/` page's JSON-LD `ItemList`** (step 3) or the truncated search response.
- **`/api/search/` is hard-capped at 5 company results**: `?limit=N` is silently accepted but ignored — no matter what value you pass, you get at most 5 `companies[]` entries plus matching categories. Treat the search endpoint as a "top hits" lookup, not a paginated list. For broad coverage, walk the relevant category pages instead.
- **`/api/search/` descriptions are truncated to ~100 chars with `...` suffix**: full untruncated descriptions only live in the JSON-LD on `/cat/<slug>/` pages. Cross-reference by `name`.
- **`/api/categories/` requires `?format=json`**: without it the endpoint serves the Django REST framework browsable HTML form ("Add Category Api"), not JSON. The OpenAPI spec doesn't mention this. Always append `&format=json` (or send `Accept: application/json` if you control headers). The `/api/search/` endpoint does **not** need `format=json` — it defaults to JSON.
- **`minLength: 2` on the search `q` param is not enforced**: `?q=x` returns HTTP 200 with empty arrays rather than HTTP 400. Don't rely on the spec — validate input on your side if length matters.
- **`url` fields in API responses are relative paths**, not absolute URLs (e.g. `"url": "/co/anthropic/"`, `"url": "/cat/healthcare-ai/"`). Prefix with `https://artificialintelligencecompanies.com` before display. Also note the canonical URLs in `/llms.txt`, `sitemap.xml`, and JSON-LD use `http://` (not `https://`) — the site redirects `http://` → `https://` cleanly, but normalize on `https://` for cross-system consistency.
- **`/cat/<slug>/` pages have 3 JSON-LD blocks**: `CollectionPage` (metadata + `numberOfItems`), `BreadcrumbList` (navigation), and `ItemList` (the actual roster). Parse the third one — match on `"@type": "ItemList"`, not on position, since order is not contractual.
- **Stable 12-category taxonomy** as of 2026-05-19 (`/api/categories/?format=json` `total: 12`). New categories may be added — re-enumerate before assuming the list is current.
- **No auth, no anti-bot, no stealth required**: Cloudflare-fronted, served from edge cache. `--proxies` and `--verified` flags on Browserbase sessions are unnecessary. The site explicitly opts in to AI crawler traffic (see `robots.txt`).
- **MCP server URL advertised but not exercised here**: `/mcp-server/` is listed in `/llms.txt` and `/.well-known/agent-manifest.json` but was not validated as part of this skill's iteration. If you are an MCP-aware client, fetching `/mcp-server/` should give you tool definitions equivalent to the three working HTTP endpoints.

## Expected Output

### Shape A — keyword search returned matches

```json
{
  "query": "customer service",
  "method": "api",
  "endpoint": "/api/search/?q=customer%20service",
  "matched_categories": [
    {
      "name": "AI Customer Service",
      "slug": "ai-customer-service",
      "url": "https://artificialintelligencecompanies.com/cat/ai-customer-service/"
    }
  ],
  "companies": [
    {
      "name": "IBM Watson",
      "url": "https://artificialintelligencecompanies.com/co/ibm-watson/",
      "description": "IBM Watson is IBM's enterprise AI platform providing machine learning, natural language processing, ...",
      "description_truncated": true
    },
    {
      "name": "Zendesk",
      "url": "https://artificialintelligencecompanies.com/co/zendesk/",
      "description": "Zendesk is a customer service and employee service software provider headquartered in San Francisco,...",
      "description_truncated": true
    },
    {
      "name": "Intercom",
      "url": "https://artificialintelligencecompanies.com/co/intercom/",
      "description": "Intercom is a customer service software provider headquartered in San Francisco with roots in Dublin...",
      "description_truncated": true
    },
    {
      "name": "Uniphore",
      "url": "https://artificialintelligencecompanies.com/co/uniphore/",
      "description": "Uniphore is a leading enterprise conversational AI company specializing in voice and vision AI solutions...",
      "description_truncated": true
    },
    {
      "name": "Goodcall",
      "url": "https://artificialintelligencecompanies.com/co/goodcall/",
      "description": "Goodcall provides agentic voice AI for inbound phone operations, including lead capture, appointment...",
      "description_truncated": true
    }
  ],
  "result_count": 5,
  "result_capped_at_5": true
}
```

### Shape B — category-roster hydration (full descriptions via JSON-LD)

```json
{
  "query": "healthcare",
  "method": "api+html",
  "category": {
    "slug": "healthcare-ai",
    "name": "Healthcare AI",
    "url": "https://artificialintelligencecompanies.com/cat/healthcare-ai/",
    "number_of_items": 8
  },
  "companies": [
    {
      "name": "Abridge",
      "url": "https://artificialintelligencecompanies.com/co/abridge/",
      "description": "Abridge uses generative AI to automatically capture and summarize doctor-patient conversations into structured clinical notes. The company became a unicorn in 2025 with 30% market share in the ambient scribing category, which generated $600M in 2025 (+2.4x YoY). Abridge serves major healthcare systems including Johns Hopkins Medicine, Kaiser Permanente, Mayo Clinic, and Duke Health, with reported outcomes including 78% reduction in cognitive load and 86% of clinicians reporting less after-hours work. Best in KLAS 2025 - Ambient AI Market Leader.",
      "description_truncated": false,
      "source": "json-ld:ItemList"
    }
  ]
}
```

### Shape C — no matches

```json
{
  "query": "quantum-cryogenics-as-a-service",
  "method": "api",
  "endpoint": "/api/search/?q=quantum-cryogenics-as-a-service",
  "matched_categories": [],
  "companies": [],
  "result_count": 0,
  "result_capped_at_5": false
}
```

### Shape D — taxonomy enumeration (used as a precursor to Shape B)

```json
{
  "method": "api",
  "endpoint": "/api/categories/?format=json",
  "total": 12,
  "categories": [
    { "id": 2,  "slug": "ai-automation-agencies",     "name": "AI Automation Agencies" },
    { "id": 10, "slug": "ai-consulting",              "name": "AI Consulting" },
    { "id": 61, "slug": "ai-customer-service",        "name": "AI Customer Service" },
    { "id": 64, "slug": "ai-image-generators",        "name": "AI Image Generators" },
    { "id": 67, "slug": "ai-platforms",               "name": "AI Platforms" },
    { "id": 68, "slug": "ai-receptionist",            "name": "AI Receptionist" },
    { "id": 63, "slug": "computer-vision",            "name": "Computer Vision" },
    { "id": 59, "slug": "foundation-model-providers", "name": "Foundation Model Providers" },
    { "id": 65, "slug": "healthcare-ai",              "name": "Healthcare AI" },
    { "id": 66, "slug": "legal-ai",                   "name": "Legal AI" },
    { "id": 62, "slug": "machine-learning-platforms", "name": "Machine Learning Platforms" },
    { "id": 1,  "slug": "training-data",              "name": "Training Data" }
  ]
}
```
