---
name: hiveround-com-search-investment-projects-opszir
title: Search Hiveround Investment Projects
description: >-
  Discover live startup raises to invest in on Hiveround, filterable by keyword,
  stage, and max raise size, and return structured project details via the
  Hiveround MCP server.
website: hiveround.com
category: fintech
tags:
  - investing
  - startups
  - fundraising
  - mcp
  - marketplace
  - venture-capital
source: 'browserbase: agent-runtime 2026-06-04'
updated: '2026-06-04'
recommended_method: mcp
alternative_methods:
  - method: fetch
    rationale: >-
      Plain GET https://hiveround.com/api/ecp/projects?q=&stage=&max= returns
      structured application/ecp+json (no POST/JS). GET /projects with Accept:
      text/markdown returns a clean markdown list. Best when you can't speak
      MCP/JSON-RPC.
  - method: browser
    rationale: >-
      Navigate /projects, fill the search box, pick a stage, click Filter.
      Slowest and least structured; only needed if all HTTP paths are
      unavailable.
verified: false
proxies: true
---
# Search Hiveround Investment Projects

## Purpose

Discover live startup raises an investor could put money into on [Hiveround](https://hiveround.com), optionally filtered by free-text keyword, funding stage, and maximum raise size, and return each match as structured data (slug, name, stage, sector, raise amount, one-liner, listing URL). This is a **read-only** discovery task — it lists/searches public raises and does not request intros, watch projects, or move money. Hiveround is an agent-native marketplace: it ships an MCP server, an ECP JSON API, and markdown representations specifically so agents can read raises without scraping HTML.

## When to Use

- "Find new projects to invest in on Hiveround" / "What's raising right now?"
- "Show me prototype-stage AI startups raising under $500k."
- "Search Hiveround for fintech raises" or "list the newest live raises."
- Building an investor pipeline: enumerate candidates before doing diligence (`get_project` returns the full pitch.md per slug).
- Any time you need the structured raise feed rather than a human-readable page.

## Workflow

The fastest, most reliable path is the **Hiveround MCP server** — the site explicitly tells agents to use it instead of crawling (`/llms.txt`). All read tools are anonymous (no API key).

### Recommended: MCP server (`POST /api/mcp`, JSON-RPC 2.0)

1. **Optionally confirm tools** with `tools/list`. The read tools are:
   - `list_projects` — newest open raises (args: `limit`≤25, optional `stage`). No query needed.
   - `search_projects` — keyword search across name, one-liner, description, sector (args: **`query` required**, optional `stage`, `max_raise_usd`, `limit`≤25).
   - `get_project` — full listing by `slug`, including the founder's GitHub handle and the entire pitch markdown in `description`.
2. **Call the tool.** To search prototype-stage projects matching "AI":
   ```bash
   curl -X POST https://hiveround.com/api/mcp \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_projects","arguments":{"query":"AI","stage":"prototype","limit":10}}}'
   ```
   For an unfiltered feed, swap in `{"name":"list_projects","arguments":{"limit":10}}`.
3. **Parse the response.** The JSON-RPC envelope's `result.content[0].text` is itself a JSON string — parse it to get `{ "projects": [ … ] }`. Each project has the fields in Expected Output below.
4. **(Optional) drill in** with `get_project` per `slug` to pull the full pitch markdown for diligence.

`stage` is one of `idea | prototype | mvp | launched | revenue`. `max_raise_usd` is a number in USD.

### Alternative: ECP JSON / markdown over plain GET (no POST, no JS)

If you can't make a JSON-RPC POST, the same data is content-negotiable over GET — works through a simple HTTP fetcher and residential proxy:

- **Structured JSON:** `GET https://hiveround.com/api/ecp/projects?q=AI&stage=prototype&max=500000` → `application/ecp+json` with a `Collection` whose `items[]` are full `Project` objects (same fields as MCP plus the pitch `description`).
- **Markdown list:** `GET https://hiveround.com/projects?q=AI&stage=prototype` with header `Accept: text/markdown` → a clean markdown digest of matching raises with listing links.
- `GET https://hiveround.com/llms.txt` is a hand-maintained summary of the marketplace + every live raise's one-liner — good for a quick overview, and `llms-full.txt` inlines the full corpus.

### Browser fallback

Only needed if both HTTP paths are blocked. The human page mirrors the same query params, so you rarely need to script the form:

1. `browse open https://hiveround.com/projects` (or jump straight to `https://hiveround.com/projects?q=AI&stage=prototype&max=` — the query params drive the results directly).
2. If using the form: `browse fill input[name="q"] "AI"`, `browse select select[name="stage"] prototype`, then click the **filter** button.
3. `browse wait load`, then `browse snapshot` / `browse get text body` to read the result cards. The result count renders as "N LIVE".
4. There is a **"VIEW AS JSON"** link on the page — following it lands you back on the ECP JSON above, so prefer that over scraping cards.

Note: `browse open` issues a GET, so it **cannot** call the MCP endpoint (which needs a POST). To exercise MCP from inside a browser session, use `browse eval` with an async `fetch('/api/mcp', { method: 'POST', … })`.

## Site-Specific Gotchas

- **Agent-native by design.** The homepage `Link` header and `/.well-known/api-catalog` advertise: MCP (`/api/mcp`), ECP (`/.well-known/ecp`, `/ecp.json`), an agent-skills index (`/.well-known/agent-skills/index.json`), an MCP server card (`/.well-known/mcp/server-card.json`), and `/llms.txt`. Start from `/llms.txt` if you're unsure of the interface — it names the MCP tools directly.
- **MCP needs the streaming Accept header.** The transport is `streamable-http`; include `Accept: application/json, text/event-stream` or the POST may be rejected.
- **`result.content[0].text` is double-encoded.** MCP tool results wrap the payload as a JSON string inside the JSON-RPC envelope — parse twice.
- **`search_projects` requires `query`.** Calling it without `query` errors; use `list_projects` when you want everything.
- **Read vs. write auth.** `list_projects`, `search_projects`, `get_project` are anonymous. `request_intro`, `watch_project`, `update_watch`, `list_watches`, and the intro-thread tools require a Bearer API key (`hr_sk_*`) generated at https://hiveround.com/mcp. This skill only uses the anonymous read tools.
- **`limit` caps at 25** for `list_projects`/`search_projects`. There were only ~5 live raises total at capture time, so paging rarely matters, but the ECP GET endpoint also exposes `page`/`page_size` for larger catalogs.
- **Keyword search is broad.** `search_projects`/`q=` matches across name, one-liner, *description*, and sector — so "AI" returned 4 of 5 raises (including ones whose sector isn't literally "AI") because the term appears in their pitch bodies. Don't assume a hit means the sector field equals your query.
- **`sector` and `founder.*` can be null.** Anonymous founders return `founder.handle/display_name/github_url = null`; some listings have `sector = null`. Don't treat these as errors.
- **Cloudflare fronts the site but does not block agents.** `robots.txt` allows `/projects` and sets `Content-Signal: ai-train=yes, search=yes, ai-input=yes` for every named AI agent (incl. ClaudeBot/Claude-User). `robots.txt` *disallows* `/api/`, but `/api/mcp` and `/api/ecp/*` are the documented, advertised agent interfaces — that Disallow targets crawlers, not the intended programmatic clients. No captcha, login wall, or 4xx anti-bot pattern was observed across two traced iterations; a residential proxy (`--proxies`) was sufficient and `--verified` was **not** required.
- **No POST from `browse open`.** Confirmed during iteration 1 — the inner agent tried `browse open /api/mcp` and only got the server card (a GET). Use `curl`/`fetch`/`browse eval` for the actual JSON-RPC call.

## Expected Output

`search_projects` / `list_projects` (after unwrapping `result.content[0].text`):

```json
{
  "projects": [
    {
      "slug": "seminara",
      "name": "Seminara",
      "one_liner": "Seminara is an AI-hosted session platform for education-led sales and onboarding through real-time voice interaction and orchestration.",
      "stage": "prototype",
      "sector": "Enterprise SaaS",
      "raise_amount_usd": 150000,
      "raise_instrument": "Open to discussion",
      "monthly_revenue_usd": null,
      "url": "https://seminara.online/",
      "logo_url": "https://.../project-logos/.../...png",
      "founder": { "handle": null, "display_name": null, "github_url": null },
      "posted_at": "2026-05-10T20:45:08.865415+00:00",
      "listing_url": "https://hiveround.com/projects/seminara"
    }
  ]
}
```

A convenient task-level shape to emit to a caller:

```json
{
  "success": true,
  "method": "mcp",
  "query": "AI",
  "stage": "prototype",
  "max_raise_usd": null,
  "count": 4,
  "projects": [
    { "slug": "seminara", "name": "Seminara", "stage": "prototype", "sector": "Enterprise SaaS", "raise_amount_usd": 150000, "one_liner": "Seminara is an AI-hosted session platform…", "listing_url": "https://hiveround.com/projects/seminara" },
    { "slug": "elastova", "name": "Elastova", "stage": "prototype", "sector": "AI & Agents", "raise_amount_usd": 250000, "one_liner": "AI recovery agent for loose skin after major weight loss.", "listing_url": "https://hiveround.com/projects/elastova" },
    { "slug": "watta", "name": "watta", "stage": "prototype", "sector": null, "raise_amount_usd": 250000, "one_liner": "ai workout tracker for rowers…", "listing_url": "https://hiveround.com/projects/watta" },
    { "slug": "arispay-executive-summary", "name": "ArisPay", "stage": "prototype", "sector": "Fintech", "raise_amount_usd": 2000000, "one_liner": "The settlement layer for agentic commerce.", "listing_url": "https://hiveround.com/projects/arispay-executive-summary" }
  ],
  "error_reasoning": null
}
```

`get_project` adds a `description` field containing the full pitch markdown. On no matches, return `count: 0` with an empty `projects` array (not an error). On failure, `success: false` with `error_reasoning` populated from the response.
