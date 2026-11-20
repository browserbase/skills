---
name: docs-scoutos-com-lookup-scout-docs-ee1wgb
title: Scout Platform Documentation Lookup
description: >-
  Given a free-text query about a Scout platform feature, concept, integration,
  or API/SDK reference, locate the relevant page on docs.scoutos.com and return
  structured JSON with title, breadcrumb, headings, prose, code blocks, tables,
  On-This-Page anchors, last-updated, canonical URL, and related pages.
website: docs.scoutos.com
category: documentation
tags:
  - documentation
  - nextra
  - scout
  - knowledge-base
  - read-only
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: api
alternative_methods:
  - method: api
    rationale: >-
      docs.scoutos.com is a Nextra v4 SSR site with no anti-bot. browse cloud
      fetch (no proxy, no stealth) returns the full prose, headings, anchors,
      tables, code blocks, sidebar, and prev/next pager in the initial HTML
      response. Parse SSR HTML and emit structured JSON — no browser session
      needed for the read-only lookup case.
  - method: browser
    rationale: >-
      Use a full browser session (no stealth required) when the caller wants a
      visual screenshot alongside the structured JSON, or when they prefer
      browse get markdown body to do the HTML-to-Markdown conversion in one
      step. ~5–10× more expensive than the HTTP path per page.
  - method: url-param
    rationale: >-
      For the SEPARATE API/SDK reference subdomain ref.scoutos.com (Fern-hosted,
      not Nextra), append .md to any page URL to get text/markdown source, or
      fetch /{section}/llms.txt for a section index. Use this when the query is
      about a specific HTTP endpoint or SDK call. Not applicable to
      docs.scoutos.com (no .md or llms.txt surface there).
  - method: mcp
    rationale: >-
      ref.scoutos.com (API/SDK reference only) exposes an MCP server at
      https://ref.scoutos.com/_mcp/server for Claude Code / Cursor integration.
      Not available for docs.scoutos.com product docs.
verified: false
proxies: false
---
# Scout Platform Documentation Lookup

## Purpose

Given a free-text query about a Scout platform feature, concept, integration, or API/SDK reference, locate the relevant page(s) on `docs.scoutos.com` (the Nextra v4 product docs) and return a structured JSON record containing the page title, breadcrumb path, section headings with anchors, prose excerpts that answer the query, fenced code blocks, table contents, "On This Page" anchor links, last-updated timestamp, canonical URL, and related/sibling page links from the sidebar. Read-only — never authenticates, posts, or follows external write actions.

## When to Use

- A user or downstream agent asks "How does X work in Scout?" — e.g. *"agent delegation"*, *"Jinja templates in workflows"*, *"HubSpot integration setup"*, *"Collections semantic retrieval"*, *"Workflow environments"*.
- Quoting authoritative platform docs back into a chat or RAG pipeline that needs structured snippets, not screenshots.
- Building a Scout-docs index for an offline search/embedding pipeline (the sitemap exposes all 52 pages with consistent `lastmod` timestamps).
- Disambiguating where a concept is described when it spans two sections (e.g. "scheduling" lives under `/agents/scheduling/`, while "running workflows on a schedule" lives under `/workflows/running-workflows/`).
- Cross-checking the `docs.scoutos.com` prose against the **separate** API/SDK reference at `ref.scoutos.com` when the query is about a specific HTTP endpoint or SDK call — see Gotchas for the split.

## Workflow

`docs.scoutos.com` is a fully **server-rendered Nextra v4 site on Vercel** with **no anti-bot protection** beyond ordinary egress filtering — direct `curl` from a generic cloud IP can be blocked (we saw `code=000` from the sandbox's bare IP), but `browse cloud fetch` succeeds **without** `--proxies` or `--verified` because Browserbase's default egress is allow-listed. Every doc page's full prose, headings, anchors, tables, code blocks, sidebar nav, and footer pager are present in the **initial SSR HTML response** — JavaScript hydration is decorative, not load-bearing. No `/api/search`, no Pagefind, no FlexSearch JSON index, no `/llms.txt`, no `/robots.txt`, and the "Edit this page" GitHub link points to `github.com/scoutos/docs` which is **private** (returns 404 via GitHub API), so a raw-`.mdx`-from-GitHub shortcut does not exist for this domain. The optimal flow is therefore: load the sitemap once to enumerate the corpus, fuzzy-map the query to a slug, HTTP-fetch that URL, parse the SSR HTML, and emit structured JSON. Spinning up a full browser session is **not necessary** for the read-only lookup case — reserve that path for when you also need a visual screenshot or want `browse get markdown body` to do the HTML-to-Markdown conversion for you.

1. **Bootstrap the URL inventory from the sitemap.** Cache once per session.

   ```
   GET https://docs.scoutos.com/sitemap.xml
   ```

   Returns 52 `<url><loc>...</loc><lastmod>YYYY-MM-DDTHH:MM:SS.sssZ</lastmod>...</url>` entries spanning every published doc page. All entries currently share the same `lastmod` (set at site build time), so `lastmod` is **not** a per-page freshness signal — read the `Last updated on …` string from the page body instead. The complete published surface (path → human label, derived from sidebar nav on the homepage):

   | Section | Pages (path under `/…/`) |
   |---|---|
   | Getting Started | `/getting-started/what-is-scout/`, `/quick-start/`, `/core-concepts/` |
   | Agents | `/agents/overview/`, `/getting-started/`, `/copilot/`, `/observability/`, `/code-execution/`, `/async-interactions/`, `/scheduling/`, `/planning/`, `/delegation/`, `/agent-blocks/`, `/agent-versioning/`, `/templates/` |
   | Collections & Tables | `/collections/overview/`, `/creating-collections/`, `/sources/`, `/notion/`, `/google-sheets/`, `/web-scraping/`, `/querying-data/` |
   | Drive | `/drive/overview/`, `/sharing/`, `/api-reference/` |
   | Skills | `/skills/overview/`, `/available-skills/`, `/creating-skills/` |
   | Workflows | `/workflows/overview/`, `/creating-workflows/`, `/templates/`, `/blocks/`, `/logic-state/`, `/jinja-templates/`, `/running-workflows/`, `/console/`, `/history/`, `/environments/`, `/logs/` |
   | Integrations | `/integrations/overview/`, `/crm/`, `/salesforce/`, `/hubspot/`, `/email-calendar/`, `/slack/`, `/notion/`, `/drive-m365/` |
   | MCP | `/mcp/` |
   | Settings | `/settings/api-keys/` |
   | Misc | `/about/`, `/changelog/`, `/` (Introduction) |

2. **Map the query to a slug.** The slug is the part after `/{section}/` in the URL (e.g. `delegation`, `jinja-templates`, `hubspot`, `querying-data`). Heuristic order:
   - Exact case-insensitive substring match on the slug list above (e.g. `"jinja templates"` → `workflows/jinja-templates`).
   - Token-overlap against the slug + section name (e.g. `"semantic retrieval in Collections"` → `collections/querying-data`, since "querying" + "Collections" co-occur).
   - For multi-section topics, prefer the more specific section (e.g. `"agent scheduling"` → `agents/scheduling`, not `workflows/`).
   - When ambiguous, fetch the section's overview page (`/{section}/overview/`) and read its **Quick Links / Next Steps** lists — these enumerate sibling-page intent in plain English.

3. **Fetch the page over HTTP.** `--proxies` and `--verified` are **not** required.

   ```bash
   browse cloud fetch "https://docs.scoutos.com/{section}/{slug}/" \
     | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).content" \
     > page.html
   ```

   Always include the **trailing slash** — bare paths return `308 Redirecting` (the Vercel rewriter requires it). Expect `200 OK`, `Content-Type: text/html; charset=utf-8`, ~150–250 KB SSR payload.

4. **Parse the SSR HTML.** Everything you need is in the initial response.
   - **Page title** — `<title>{Title} – Scout Docs</title>`. Strip the ` – Scout Docs` suffix.
   - **Breadcrumb** — derive from the URL path itself: `["Scout Docs", "{Section humanized}", "{Page title}"]`. The Nextra layout does **not** render a visible breadcrumb above the H1, so URL-based derivation is the canonical source.
   - **Section headings + anchors** — every heading is rendered as `<h2 id="kebab-id">Heading text<a href="#kebab-id">…</a></h2>` (same shape for `h3`, `h4`). Regex `/<h([2-6]) id="([^"]+)"[^>]*>([^<]+)/g` recovers `{level, anchor, text}` for each.
   - **"On This Page" anchor list** — emitted in two surfaces: (a) the right-rail `<aside>` nav (visible in the screenshot), and (b) duplicated as `* [Heading text](#kebab-id)` lines in the body when the page is extracted as markdown. Either source is fine; deduping by `id` gives the canonical list.
   - **Prose excerpts** — for each heading, take the text content between it and the next heading at the same-or-shallower level. Strip tags but preserve paragraph and list-item boundaries.
   - **Code blocks** — emitted as `<pre><div class="x:..."><code><span ...>{code}</span></code></div></pre>`. **Critical: `<pre>` carries no `data-language` / `class="language-X"` attribute** — Scout's docs do not tag code-block languages in the rendered output. Emit `language: null` (or a best-effort heuristic) per block; do **not** invent a language. Some "code blocks" in the rendered markdown collapse to inline backticks (single-line snippets) — re-fence them as triple-backtick blocks when serializing.
   - **Tables** — rendered as standard `<table><thead>…</thead><tbody>…</tbody></table>`. Extracting cells row-by-row produces clean markdown table rows. Example: the homepage's "Core Building Blocks" table maps `Agents | Execute tasks across tools…`.
   - **Last-updated timestamp** — text pattern `Last updated on<!-- --> <!-- -->{Month D, YYYY}` near the page footer. Regex `/Last updated on[\s\S]*?>([A-Z][a-z]+ \d{1,2}, \d{4})</`. **No machine-parseable `<time datetime="…">` is exposed** — emit the human string, optionally normalized to ISO.
   - **Canonical URL** — Scout pages do **not** ship `<link rel="canonical">`. Use the request URL (with trailing slash) as the canonical.
   - **Description** — `<meta name="description" content="…">` is **site-wide**, not per-page (every page returns *"Scout Documentation - Build AI-powered applications and workflows"*). Don't surface it as the page description; use the first paragraph after the H1 instead.

5. **Recover related/sibling page links from the bottom-of-page pager and the sidebar.** Nextra renders two related-page surfaces:
   - **Prev/Next pager** at the very bottom of every page: two anchors with title attributes, e.g. `[Logic and State](/workflows/logic-state/ "Logic and State")[Running Workflows](/workflows/running-workflows/ "Running Workflows")`. The order matches the sidebar order within the current section, so the *previous* link is the section sibling immediately above and *next* is the one immediately below.
   - **Sidebar (full nav)** — present on every page; the same sidebar appears on every page in the corpus and lists every section + every page slug. Grouping all hrefs by `{section}` gives you the full sibling set for the current page's section.

   The **prev/next pager** is what most callers want as "related pages" because it reflects intentional curation; the **sidebar siblings** are useful when the caller is exploring a whole section.

6. **Cross-check against `ref.scoutos.com` if the query is API/SDK-specific.** The product docs at `docs.scoutos.com` describe concepts; the API endpoint and SDK call references live on a **separate, Fern-hosted subdomain** `ref.scoutos.com`, linked from the top-right "APIs & SDKs" header. `ref.scoutos.com` is **AI-agent-friendly by design** and exposes:
   - `https://ref.scoutos.com/llms.txt` (root index, 10 KB)
   - `https://ref.scoutos.com/{section}/llms.txt` (section-level index, e.g. `/api-sdk/llms.txt`)
   - Append `.md` to any page URL to get `Content-Type: text/markdown` source — e.g. `https://ref.scoutos.com/api-sdk/endpoints/workflows/list.md` → 20 KB of clean Markdown with the full endpoint spec.
   - `https://ref.scoutos.com/_mcp/server` — a Fern-hosted MCP server for Claude Code / Cursor.

   Use those shortcuts when the query asks "what's the request shape for the workflow-run endpoint?" or similar — they're roughly 10× cheaper than browsing the page UI. `/llms-full.txt` at the root currently returns `500 Internal Server Error` (corpus too large to render); use **section-level** `/api-sdk/llms.txt` instead.

### Browser fallback

When the HTTP path is unavailable, or the caller specifically wants a visual screenshot alongside the structured JSON, use a full browser session — no stealth flags are needed for `docs.scoutos.com`:

```bash
sid=$(browse cloud sessions create --keep-alive | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$sid"
browse open "https://docs.scoutos.com/{section}/{slug}/" --remote
browse screenshot --remote --path /tmp/scout-{slug}.png      # optional, for caller
browse get markdown body --remote                            # returns clean markdown
browse cloud sessions update "$sid" --status REQUEST_RELEASE
```

`browse get markdown body` returns the entire page (including sidebar nav, "On This Page" duplicate, and footer pager) as one Markdown string under `{ "markdown": "..." }`. Locate the first `\n# ` to skip the leading nav block; everything after that and before the `Built with ❤️ by Scout OS` footer is the article body. Code blocks come through as **single-backtick fenced regions without language tags** (same limitation as the HTTP path).

## Site-Specific Gotchas

- **Bare `curl` from a generic cloud IP fails (`code=000`, zero bytes), but `browse cloud fetch` with **no flags** succeeds.** No residential proxy and no Browserbase verified-session flag is needed. Adding `--proxies --verified` is harmless but wastes ~$0.05 / page in proxy minutes; **leave both off** for docs lookups.
- **Trailing slash is mandatory.** `/agents/delegation` 308-redirects to `/agents/delegation/`. Always construct URLs with the trailing slash; the redirect chain adds a wasted round-trip.
- **No `<link rel="canonical">` element.** Don't try to harvest a canonical URL from the page — Scout does not emit one. Use the request URL as canonical.
- **Per-page `<meta name="description">` does NOT exist** — every page returns the site-wide default `"Scout Documentation - Build AI-powered applications and workflows"`. To answer "summarize this page", use the first paragraph after the H1 instead.
- **Code blocks have NO language tag.** `<pre>` elements lack `data-language`, `class="language-X"`, and any Shiki/highlight.js markers. The MDX source (if you could see it) presumably uses unlabeled triple-backtick fences. Caller should infer language from content (heuristics: starts with `{` → JSON, contains `{{ }}` or `{% %}` → Jinja, `def ` / `import ` → Python, etc.) or emit `language: null` honestly.
- **`Last updated on {date}` is plain text, not a `<time datetime="…">` element.** Pattern: `Last updated on<!-- --> <!-- -->{Month D, YYYY}<` near footer. No timezone, no ISO format — Nextra renders the build-time `mtime` of the underlying MDX. Sitemap `<lastmod>` is **also not** per-page (all 52 URLs share the same site-build timestamp), so for true per-page freshness rely on the in-body string.
- **The "Edit this page" GitHub link is a dead end.** It points to `github.com/scoutos/docs/blob/main/content/{slug}.mdx` but `api.github.com/repos/scoutos/docs` returns 404 (repo is private or doesn't exist publicly). Don't waste cycles trying to fetch raw `.mdx` from GitHub for `docs.scoutos.com`.
- **No search API.** `docs.scoutos.com/api/search/` returns 404, `/api/search` 308-redirects to the 404, and there's no Pagefind / FlexSearch / nextra-data JSON chunk. The page-search modal in the rendered UI is purely client-side over an in-bundle index that is **not** exposed as a fetchable artifact. Query→page mapping must be done with the sitemap-table heuristic in step 2.
- **No `/llms.txt`, no `/robots.txt` on `docs.scoutos.com`.** Both return 404 (with full Nextra error page HTML — ~30 KB). The **sibling** subdomain `ref.scoutos.com` does ship `/llms.txt` (200 OK, 10 KB), but its content covers the API/SDK reference only — not the product docs.
- **`ref.scoutos.com/llms-full.txt` returns 500 Internal Server Error.** Use section-level `/{section}/llms.txt` (e.g. `/api-sdk/llms.txt`) instead. This is a Fern hosting issue, not a transient — observed consistently.
- **`_next/data/{buildHash}/{path}.json` returns the full HTML, not RSC JSON.** Nextra v4 on App Router doesn't expose Pages-Router-style `_next/data` JSON payloads; the route exists but serves the same HTML body. Don't bother — fetch the canonical URL directly.
- **Sidebar nav and "On This Page" anchor list appear twice in the markdown extracted by `browse get markdown body`** — once before the H1 (left-rail sidebar) and once after the article body (right-rail "On This Page" duplicate, plus prev/next pager). Skip everything up to the first `\n# ` to get just article content. The duplication is consistent across every page, so the dedup rule is stable.
- **Site is on Vercel with `X-Vercel-Cache: HIT` and aggressive caching** — `Age` headers up to 421,385s (~5 days) observed. Content can be ~5 days stale even when the underlying MDX has changed. Trust the in-body `Last updated on …` string over the HTTP `Age` header for freshness.
- **Read-only is enforced by site design** — there is no auth, no forms, no comment system, no edit-in-browser UI. The "Question? Give us feedback" link opens an external GitHub issue form, and the "Edit this page" link goes to the private repo. Both are external-redirect dead ends; the agent should never click them.

## Expected Output

One structured record per resolved page. Multi-page queries (e.g. "everything about workflows") should emit an array.

```json
{
  "query": "agent delegation",
  "resolved_url": "https://docs.scoutos.com/agents/delegation/",
  "canonical_url": "https://docs.scoutos.com/agents/delegation/",
  "page_title": "Agent Delegation",
  "breadcrumb": ["Scout Docs", "Agents", "Agent Delegation"],
  "first_paragraph": "Build sophisticated multi-agent systems where specialized agents collaborate to accomplish complex tasks.",
  "last_updated": "May 14, 2026",
  "last_updated_iso": "2026-05-14",
  "on_this_page": [
    {"text": "What is Agent Delegation?", "anchor": "#what-is-agent-delegation", "level": 2},
    {"text": "Why Delegate?",             "anchor": "#why-delegate",             "level": 2},
    {"text": "How Delegation Works",      "anchor": "#how-delegation-works",     "level": 2},
    {"text": "Common Delegation Patterns","anchor": "#common-delegation-patterns","level": 2},
    {"text": "Specialized Agents Perform Better","anchor": "#specialized-agents-perform-better","level": 3}
  ],
  "sections": [
    {
      "heading": "What is Agent Delegation?",
      "anchor": "#what-is-agent-delegation",
      "level": 2,
      "prose": "Agent delegation allows one agent to delegate tasks to other specialized agents. Instead of building one agent that does everything, you can build a team of focused specialists that work together.",
      "list_items": [
        "Specialization: Each agent excels at a specific type of task",
        "Quality control: Multiple agents review and validate outputs",
        "Complex workflows: Agents coordinate multi-step processes",
        "Expertise layering: Combine research, analysis and writing agents"
      ]
    }
  ],
  "code_blocks": [
    {
      "language": null,
      "code": "User: \"Research Acme Corp and prepare for my sales call tomorrow\"\n\nMain Agent:\n├─ Delegates to Research Agent: \"Research Acme Corp...\"\n│  └─ Returns: Company profile, news summary, org chart\n...",
      "near_heading": "Example Flow",
      "language_inferred": "text"
    }
  ],
  "tables": [],
  "related_pages": {
    "previous": {"title": "Planning Tools",  "url": "https://docs.scoutos.com/agents/planning/"},
    "next":     {"title": "Agent Blocks",    "url": "https://docs.scoutos.com/agents/agent-blocks/"},
    "section_siblings": [
      {"title": "Overview",          "url": "https://docs.scoutos.com/agents/overview/"},
      {"title": "Getting Started",   "url": "https://docs.scoutos.com/agents/getting-started/"},
      {"title": "Copilot",           "url": "https://docs.scoutos.com/agents/copilot/"},
      {"title": "Observability",     "url": "https://docs.scoutos.com/agents/observability/"},
      {"title": "Code Execution",    "url": "https://docs.scoutos.com/agents/code-execution/"},
      {"title": "Async Interactions","url": "https://docs.scoutos.com/agents/async-interactions/"},
      {"title": "Scheduling",        "url": "https://docs.scoutos.com/agents/scheduling/"},
      {"title": "Planning Tools",    "url": "https://docs.scoutos.com/agents/planning/"},
      {"title": "Agent Blocks",      "url": "https://docs.scoutos.com/agents/agent-blocks/"},
      {"title": "Agent Versioning",  "url": "https://docs.scoutos.com/agents/agent-versioning/"},
      {"title": "Agent Templates",   "url": "https://docs.scoutos.com/agents/templates/"}
    ]
  },
  "section": "agents",
  "fetched_via": "browse cloud fetch (no proxy, no stealth)",
  "fetch_status": 200,
  "fetch_bytes": 234432
}
```

When the query is ambiguous (multiple plausible pages) or has no good match, return a disambiguation envelope:

```json
{
  "query": "scheduling",
  "ambiguous": true,
  "candidates": [
    {"url": "https://docs.scoutos.com/agents/scheduling/",          "section": "agents",    "match_reason": "exact-slug"},
    {"url": "https://docs.scoutos.com/workflows/running-workflows/","section": "workflows", "match_reason": "running on a schedule mentioned in page body"}
  ]
}
```

When the topic clearly belongs to the API/SDK reference (e.g. *"POST /v2/workflows request schema"*), defer to the Fern subdomain rather than forcing a `docs.scoutos.com` match:

```json
{
  "query": "list workflows endpoint",
  "deferred_to": "ref.scoutos.com",
  "resolved_url": "https://ref.scoutos.com/api-sdk/endpoints/workflows/list",
  "markdown_source_url": "https://ref.scoutos.com/api-sdk/endpoints/workflows/list.md",
  "mcp_server": "https://ref.scoutos.com/_mcp/server"
}
```
