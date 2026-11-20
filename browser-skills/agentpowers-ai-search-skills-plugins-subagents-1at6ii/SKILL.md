---
name: agentpowers-ai-search-skills-plugins-subagents-1at6ii
title: AgentPowers Marketplace Search
description: >-
  Search the AgentPowers marketplace for skills, agents (subagents), and plugins
  by keyword, type, and category — returning slug, title, description, type,
  price, security status, install/download counts, rating, author, and source
  (native vs. external like ClawHub).
website: agentpowers.ai
category: marketplace
tags:
  - marketplace
  - search
  - skills
  - agents
  - subagents
  - ai-tools
  - mcp
source: 'browserbase: agent-runtime 2026-05-20'
updated: '2026-05-20'
recommended_method: api
alternative_methods:
  - method: mcp
    rationale: >-
      Remote MCP server at https://api.agentpowers.ai/mcp exposes the same
      search_marketplace tool — ideal when the caller is a claude.ai
      conversation and doesn't want to issue raw HTTP.
  - method: cli
    rationale: >-
      `ap search <query> [--type skill|agent] [--category C] [--limit N]` via
      `npx @agentpowers/cli` (or `pip install agentpowers`) — useful in shells,
      CI, or wrapping scripts.
  - method: browser
    rationale: >-
      Open https://agentpowers.ai/skills?q={query} (also /agents?q=…,
      /skills/{category}). Use only when the API and MCP paths are unreachable;
      the Vercel page renders the same data via the same backend, so a backend
      outage takes the browser path down too.
verified: true
proxies: false
---
# AgentPowers Marketplace Search

## Purpose

Search the AgentPowers marketplace for skills, agents (a.k.a. subagents), and plugins built for Claude Code, Cursor, Codex, Windsurf, Gemini CLI, GitHub Copilot, and other AI tooling. Returns a list of matching items — for each: slug, title, description, category, type (`skill` or `agent`), price (cents + currency), version, security status, install/download/view counts, average rating, author, and source (native AgentPowers vs. external e.g. ClawHub). Read-only — never purchases or installs.

## When to Use

- A developer or buying agent looking for an existing skill that already implements a task before writing one (e.g. "code review", "testing", "ontology", "github").
- Filtering the marketplace by type (`skill` vs `agent`/subagent), category (`development`, `marketing`, `productivity`, `design`, `sales`, `data`, `security`), or pricing.
- Comparing native AgentPowers listings alongside community-vetted external sources (ClawHub etc.) in one unified search response.
- Discovery flows inside another agent — e.g. a Claude Code session asking "which AgentPowers skill should I install to do X?".

## Workflow

AgentPowers exposes the same search surface through four channels — the public REST API at `https://api.agentpowers.ai/v1/search` is the fastest, no-auth, structured path and is the recommended primary. Three documented alternatives (remote MCP, local CLI `ap search`, and the browser UI at `/skills?q=`) all hit the same backend index; pick whichever fits the caller's context. **Important**: as of 2026-05-19, the backing Railway API host was returning a Railway-edge `X-Railway-Fallback: true` 404 for every path, and the Vercel front-end was correspondingly serving HTTP 500 on `/` and a "Marketplace temporarily unavailable" banner on `/skills` and `/skills?q=…`. Confirm liveness with a cheap probe (`GET /v1/categories` should return 200 JSON) before depending on the search response — see Site-Specific Gotchas.

### 1. Recommended: public REST API (no auth)

```
GET https://api.agentpowers.ai/v1/search
    ?q={query}                  // required, 1–200 chars
    &type={skill|agent}         // optional; omit for both
    &limit={1..100}             // default 20
    &offset={0..}               // default 0
```

Response is a `SectionedSearchResponse`:

```jsonc
{
  "agentpowers": {                // always present — AgentPowers native section
    "items": [ /* SkillSummary[] — see Expected Output */ ],
    "total":  <int>,
    "limit":  <int>,
    "offset": <int>
  },
  // External-source sections (e.g. "clawhub") may appear as additional top-level keys
  // — iterate `Object.keys(response)` rather than hardcoding section names.
}
```

`SkillSummary` always carries `slug`, `title`, `description`, `category`, `type` (`"skill"` or `"agent"`), `price_cents` (0 = free), `currency` (`"USD"`), `version`, `security_status`, `download_count`. Optional fields: `long_description`, `view_count`, `install_count`, `rating_average`, `rating_count`, `author` (object with `display_name`, `github_username`, `display_name_slug`, `avatar_url`, `verified`), and external-source extras (`source`, `source_url`, `source_installs`, `source_stars`).

To enumerate categories before scoping a search, hit `GET https://api.agentpowers.ai/v1/categories` (no params, no auth) — returns `{categories: [{category, name, description, icon, sample_keywords, count}], total_count}`.

### 2. Alternative — remote MCP (in-conversation)

Add `https://api.agentpowers.ai/mcp` as a custom integration in claude.ai (Settings → Integrations → Add Custom Integration), then call the `search_marketplace` tool. The MCP server exposes 9 tools; relevant ones for this skill:

- `search_marketplace` — same params as the REST endpoint (`q`, `type`, `limit`, optional category).
- `get_categories` — list categories with live counts.
- `get_skill_details` — full detail for a single slug.

No OAuth needed for these read-only tools. Use this path when the caller is already a claude.ai conversation and doesn't want to make raw HTTP calls.

### 3. Alternative — local CLI (`ap search`)

```bash
npx @agentpowers/cli setup        # one-time, or: pip install agentpowers
ap search "code review"
ap search "testing" --limit 10
ap search "devops" --category development
ap search "agent"  --type agent
```

Returns a unified table sectioned by source. Useful when scripting from a shell or CI. No auth required for `ap search` (only for `install` / `publish`).

### 4. Browser fallback (`/skills?q=`)

When all of the above are unreachable but the Vercel front-end is up:

1. Open `https://agentpowers.ai/skills?q={URL-encoded query}`. The page title becomes `Search: "{query}" | AgentPowers` and the `<meta name="sentry-route-name" content="/skills">` confirms server-side rendering of the search route. The query param `q=` is read by the Astro Island that powers the results list.
2. The same page also supports `type=skill|agent` (also reachable at `/agents?q=…` for the agents-only view), category scoping (`/skills/{category}` — e.g. `/skills/development`), and the `All Pricing` / `All Categories` / `Most Downloads` filter buttons.
3. The header has a global combobox (`aria-label: Search skills and agents`) that drives the same search but renders an autocomplete dropdown over whatever page you are on.
4. To extract listings from a rendered results page, snapshot the page and read each result card — a working response renders `<article>`/result cards inside `main`; an unavailable state shows the heading `Marketplace temporarily unavailable` (with a "Refresh" link) under a Search icon. See Site-Specific Gotchas for how to disambiguate "0 results" from "API down".

## Site-Specific Gotchas

- **Outage signature observed 2026-05-19**: the Railway-hosted API (`api.agentpowers.ai`) was returning `X-Railway-Edge: railway/us-west2` + `X-Railway-Fallback: true` 404 HTML on every path (including `/`, `/v1/categories`, `/v1/search`, `/.well-known/api-catalog`, `/mcp`). The Vercel front-end (`agentpowers.ai`) returned HTTP 500 on `/`, and `/skills` / `/skills?q=…` / `/agents` rendered the page chrome with the heading "Marketplace temporarily unavailable" and the paragraph "Please try again in a moment." Both API and browser paths are down together when the Railway backend is unprovisioned — there is no separate fallback datastore. Probe with `GET https://api.agentpowers.ai/v1/categories` and treat a 4xx/5xx as "down across all surfaces"; retry with exponential backoff. **Do not assume** the browser will succeed when the API fails.
- **`api.agentpowers.ai` ships an internally-issued TLS cert that the Browserbase Fetch API flags by default** — pass `--allow-insecure-ssl` (or the SDK equivalent) when probing from `browse cloud fetch`. Browser navigation (`browse open --remote`) does not need this flag.
- **The combobox in the header does not navigate on Enter when the API is down** — typing into `[combobox: Search skills and agents]` shows the typed text but produces no autocomplete dropdown until results arrive. Use the URL form `/skills?q={query}` directly instead of the combobox; the URL param is the canonical entry point.
- **Search is sectioned by source, not flat**. The REST response always has an `agentpowers` key, plus zero or more external-source keys (e.g. `clawhub`). Iterate `Object.keys(response)` rather than only reading `response.items` — there is no top-level `items` array. The CLI surfaces the same shape ("Results are sectioned by source — AgentPowers native skills appear first, followed by external sources like ClawHub").
- **`type` is restricted to `skill` or `agent` (regex `^(skill|agent)$`)**. There is no "plugin" enum value despite the marketplace UI calling the Codex/Claude installers "plugins" — plugins (`/codex-plugin`, `/claude-extension`) are installation surfaces, not catalog item types. Search for plugins by name (e.g. `q=codex`) and read `type` per result.
- **"Subagent" is just the marketing word for `type=agent`** — agents are the AgentPowers term for a full agent package, distinguished in the API by `type:"agent"` and surfaced under `/agents` in the UI. There is no separate `subagent` filter.
- **The `pricing` and `sort` controls visible in the UI (`All Pricing`, `Most Downloads`) are not documented in `/v1/search`** — the OpenAPI lists only `q`, `type`, `limit`, `offset`. The Vercel front-end applies pricing/sort client-side after fetching from the same endpoint, so filtering by free vs. paid means inspecting `price_cents === 0` on each `SkillSummary` and sorting on `download_count`/`view_count` yourself.
- **External-source items (e.g. ClawHub) carry `source`, `source_url`, `source_installs`, `source_stars`** — surface these to the caller so they can disambiguate "AgentPowers native" from "external, security-scanned passthrough". External skills go through the same 9-layer security pipeline before listing, but the install path differs (sandboxed re-scan on install).
- **`price_cents` is an integer**; AgentPowers charges a 15% platform fee with a $5 minimum on paid skills. `price_cents=0` ⇒ free skill. `currency` has always been `USD` in observed responses.
- **The `/agents` listing endpoint returned "No agents found" on 2026-05-19** while `/skills` returned the outage banner — different SSR error handling paths, same root cause. "No agents found" does not always mean an empty catalog; treat it as ambiguous when paired with a failing `api.agentpowers.ai` probe.
- **`docs.agentpowers.ai/llms.txt`** is the canonical index of every API endpoint and guide. Fetch it once at session start if you need to discover endpoints you don't know; every endpoint also has a `.md` variant at the same URL (e.g. `…/search/search-marketplace.md`) that returns clean markdown + the embedded OpenAPI block. This is the cheapest way to refresh endpoint shapes without scraping HTML.
- **MCP-server installation surface** is `https://api.agentpowers.ai/mcp` (Streamable HTTP, primary) and `https://api.agentpowers.ai/mcp/sse` (legacy SSE). Both are also offline when the Railway host is down.
- **OAuth is not needed for search**. The `/v1/search`, `/v1/categories`, `/v1/skills/{slug}`, `/v1/agents/{slug}`, and equivalent MCP tools are all unauthenticated. Auth (Clerk JWT or OAuth-issued Bearer) is only required for write paths and personalized reads (`/v1/me`, `/v1/purchases`).
- **Rate limits** (per the published rate-limits guide): public endpoints are bucketed by IP. Use `limit=100&offset=N` to paginate rather than firing parallel queries; respect 429 `Retry-After` if returned.

## Expected Output

Successful search:

```json
{
  "query": "github",
  "type": null,
  "sections": {
    "agentpowers": {
      "total": 14,
      "limit": 20,
      "offset": 0,
      "items": [
        {
          "slug": "github-pr-reviewer",
          "title": "GitHub PR Reviewer",
          "description": "Automated PR review skill for Claude Code.",
          "long_description": null,
          "category": "development",
          "type": "skill",
          "price_cents": 0,
          "currency": "USD",
          "version": "1.2.0",
          "security_status": "passed",
          "download_count": 1245,
          "view_count": 3801,
          "install_count": 1102,
          "rating_average": 4.6,
          "rating_count": 23,
          "author": {
            "display_name": "Jane Doe",
            "github_username": "janedoe",
            "display_name_slug": "jane-doe",
            "avatar_url": "https://...",
            "verified": true
          },
          "source": null,
          "source_url": null,
          "source_installs": null,
          "source_stars": null
        }
      ]
    },
    "clawhub": {
      "total": 3,
      "limit": 20,
      "offset": 0,
      "items": [
        {
          "slug": "github-issue-triage",
          "title": "GitHub Issue Triage",
          "description": "...",
          "category": "development",
          "type": "skill",
          "price_cents": 0,
          "currency": "USD",
          "version": "0.3.1",
          "security_status": "passed",
          "download_count": 88,
          "source": "clawhub",
          "source_url": "https://clawhub.ai/skills/github-issue-triage",
          "source_installs": 412,
          "source_stars": 17
        }
      ]
    }
  }
}
```

Empty result (query matched zero items, marketplace healthy):

```json
{
  "query": "asdfqwerty-no-match",
  "type": "agent",
  "sections": {
    "agentpowers": { "total": 0, "limit": 20, "offset": 0, "items": [] }
  }
}
```

Marketplace outage (probe returned non-2xx OR browser shows the unavailable banner):

```json
{
  "success": false,
  "reason": "marketplace_unavailable",
  "probe": {
    "endpoint": "https://api.agentpowers.ai/v1/categories",
    "status": 404,
    "railway_fallback": true
  },
  "ui_banner": "Marketplace temporarily unavailable"
}
```

Validation error (e.g. `q` empty or `type` not in `{skill,agent}`) — the REST endpoint returns HTTP 422 with a FastAPI-style body:

```json
{ "detail": [ { "loc": ["query","type"], "msg": "string does not match regex ^(skill|agent)$", "type": "value_error" } ] }
```
