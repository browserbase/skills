---
name: opensource-iflytek-com-projects-ba5gb8
title: Browse iFLYTEK Open Source Projects
description: >-
  Extract iFLYTEK's open source project catalog (name, homepage, category,
  description, languages, tags, GitHub stars/forks, license, repo URL) plus
  aggregate ecosystem stats from opensource.iflytek.com/projects.
website: opensource.iflytek.com
category: developer-tools
tags:
  - open-source
  - catalog
  - iflytek
  - github
  - ai-agents
  - directory
source: 'browserbase: agent-runtime 2026-06-23'
updated: '2026-06-23'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      Works reliably on a bare remote session, but is slower and ~$2/run versus
      a single static GET; only worth it if you must avoid HTML parsing.
  - method: api
    rationale: >-
      No catalog API exists — the site is a static Astro build on Vercel with
      all project data baked into the /projects HTML. A plain GET is the API.
verified: false
proxies: false
---
# Browse iFLYTEK Open Source Projects

## Purpose
Extract the full catalog of open source projects published on iFLYTEK's open source portal (科大讯飞开源, `opensource.iflytek.com/projects`). For each project it returns the name, homepage, category (with slug), bilingual description, programming languages, visible topic tags, GitHub stars/forks, license, and GitHub repo URL — plus the site's aggregate stats (total projects, total stars, total forks). This is a **read-only** catalog browse; nothing is submitted or mutated.

## When to Use
- A user asks "what open source projects does iFLYTEK / 科大讯飞 publish?" or wants the iFLYTEK open source catalog.
- You need a structured list of iFLYTEK repos (Astron Agent, Astron RPA, SkillHub, etc.) with stars/forks/languages/license.
- You want to filter iFLYTEK projects by category (e.g. `agent-skills`, `agentic-workflow`) or by programming language.
- You need the headline open source stats (project count, total GitHub stars, total forks) for the iFLYTEK ecosystem.

## Workflow

The site is a **static Astro build served from Vercel** — every project card is fully server-rendered into the HTML, with **no SPA hydration step and no JSON/XHR catalog API**. The optimal path is a single HTTP GET; do not drive a browser unless HTML parsing is undesirable.

1. **Fetch the page (recommended).** `GET https://opensource.iflytek.com/projects` over a plain residential/HTTP path (e.g. `browse cloud fetch https://opensource.iflytek.com/projects`). A bare request returns HTTP 200 — no stealth, no proxy, no auth required. The response body (~97 KB) contains all 7 projects.
2. **Parse the aggregate stats** from the header: total projects, GitHub Stars (e.g. `18.5k`), Forks (e.g. `2.2k`).
3. **Iterate each `<div class="project-card">`.** Useful anchors per card:
   - `data-category="<slug>"` and `data-languages="Go,Java,..."` are attributes on the `.project-card` div itself — the most reliable way to read category + languages.
   - Name + homepage: `<h3><a href="<homepage>" target="_blank">Name</a></h3>`.
   - Category label: `<span data-lang-zh="智能体工作流 (agentic-workflow)" data-lang-en="agentic-workflow">`.
   - Description: a `<span data-lang-zh="…中文…" data-lang-en="…English…">` — **bilingual text is in attributes**, so you can return English without toggling the UI language.
   - GitHub stats footer: stars = anchor to `…/<repo>/stargazers`, forks = anchor to `…/<repo>/network/members`, license text (e.g. `Apache-2.0`), and the repo `GitHub` link (`https://github.com/...`).
4. **Return** the aggregate stats plus the array of projects (expect 7). See Expected Output.

### Browser fallback
Only if you must avoid HTML parsing:
1. `browse open https://opensource.iflytek.com/projects --remote` (bare session; no `--verified`/`--proxies` needed).
2. `browse get text body` or `browse snapshot` — all cards are present immediately; no scroll or wait is required (the page renders ~342 a11y refs up front).
3. Extract the same fields per card. Note the tag-truncation limitation below.

## Site-Specific Gotchas
- **Topic tags are truncated to ~4 + a `+N` badge, and the hidden tags are NOT in the page at all.** They are removed server-side (not CSS-hidden), so neither `fetch` nor a browser can recover them from `/projects`. The browser eval run wasted several turns probing for a `data-all-tags` attribute that does not exist. To get a project's complete topic list, visit its GitHub repo instead. Return only the visible tags plus the `+N` count.
- **Bilingual content lives in `data-lang-zh` / `data-lang-en` attributes.** The default visible text is Chinese (`<html lang="zh">`). Do not click the "EN" toggle to get English — just read the `data-lang-en` attribute. (The EN toggle is JS-driven and may not flip reliably in a headless click.)
- **There are no per-project detail pages.** The card title links to the project's external **homepage** (e.g. `https://astron.ai`), not an internal route. Clicking it navigates away from the catalog. All catalog data is on `/projects` itself.
- **No catalog API and no SPA.** Don't hunt for an XHR/GraphQL endpoint — the data is baked into static HTML. A plain GET is the API.
- **Category/language filter buttons filter client-side only** (`button.category-btn[data-category]`, `[data-language]`). They don't change the URL or fetch new data; ignore them for full extraction and just read every `.project-card`.
- **Counts are display-formatted strings**, e.g. stars `8.6k`, aggregate `18.5k`. The exact integers are only on GitHub; treat these as the abbreviated values the site shows.
- **No anti-bot.** Pre-run probe reported none, and a bare session confirmed HTTP 200. `verified`/`proxies` are unnecessary; the converged run used neither.
- Sibling pages: `/landscape` is a CNCF-style panorama of the same projects; `/blog`, `/events`, `/adopters`, `/contribute` are unrelated to the project catalog.

## Expected Output

```json
{
  "success": true,
  "stats": { "projects": 7, "stars": "18.5k", "forks": "2.2k" },
  "projects": [
    {
      "name": "Astron Agent",
      "homepage": "https://astron.ai",
      "category": "agentic-workflow",
      "description": "Enterprise-grade, commercial-friendly agentic workflow platform for building next-generation SuperAgents. Provides core orchestration and MCP capabilities.",
      "languages": ["Java", "TypeScript", "Python"],
      "visible_tags": ["agent", "agentic-ai", "workflow", "llm"],
      "hidden_tag_count": 3,
      "stars": "8.6k",
      "forks": "854",
      "license": "Apache-2.0",
      "github": "https://github.com/iflytek/astron-agent"
    },
    {
      "name": "Astron RPA",
      "homepage": "http://www.iflyrpa.com",
      "category": "agentic-automation",
      "description": "Agent-oriented RPA suite with out-of-the-box automation tools, built for individuals and enterprises.",
      "languages": ["Java", "Python"],
      "visible_tags": ["rpa", "automation", "agent", "ai"],
      "hidden_tag_count": 5,
      "stars": "5.2k",
      "forks": "581",
      "license": "Apache-2.0",
      "github": "https://github.com/iflytek/astron-rpa"
    },
    {
      "name": "SkillHub",
      "homepage": "https://skill.xfyun.cn",
      "category": "agent-skills",
      "description": "Private agent-skill management platform. Supports RBAC-based skill-package publishing and version management.",
      "languages": ["Java", "TypeScript"],
      "visible_tags": ["skill-registry", "agent-framework", "rbac", "enterprise-ai"],
      "hidden_tag_count": 1,
      "stars": "3.6k",
      "forks": "526",
      "license": "Apache-2.0",
      "github": "https://github.com/iflytek/skillhub"
    },
    {
      "name": "AstronClaw Tutorial",
      "homepage": "https://astronclaw-tutorial.space/",
      "category": "tutorial",
      "description": "Complete tutorial for AstronClaw (cloud AI) and Loomy (desktop AI).",
      "languages": ["JavaScript"],
      "visible_tags": ["tutorial", "ai-agent", "astronclaw", "workflow"],
      "hidden_tag_count": 0,
      "stars": "411",
      "forks": "43",
      "license": "Apache-2.0",
      "github": "https://github.com/iflytek/astronclaw-tutorial"
    },
    {
      "name": "HarnessClaw",
      "homepage": "https://github.com/harnessclaw/harnessclaw",
      "category": "agent-management",
      "description": "Electron-based desktop application for seamlessly managing, chatting with, and operating AI agents and skills.",
      "languages": ["TypeScript"],
      "visible_tags": ["electron-app", "desktop-app", "agent", "ai-agents"],
      "hidden_tag_count": 2,
      "stars": "319",
      "forks": "83",
      "license": "Apache-2.0",
      "github": "https://github.com/harnessclaw/harnessclaw"
    },
    {
      "name": "HarnessClaw Engine",
      "homepage": "https://github.com/harnessclaw/harnessclaw-engine",
      "category": "agent-engine",
      "description": "LLM programming assistant engine built with Go, supporting WebSocket, multi-turn dialogues, tool calling, and permissions.",
      "languages": ["Go"],
      "visible_tags": ["llm", "agent", "golang", "websocket"],
      "hidden_tag_count": 3,
      "stars": "266",
      "forks": "91",
      "license": "Apache-2.0",
      "github": "https://github.com/harnessclaw/harnessclaw-engine"
    },
    {
      "name": "iFly Skills",
      "homepage": "https://github.com/iflytek/iFly-Skills",
      "category": "agent-skills",
      "description": "Official collection of iFLYTEK skills for speech, OCR, translation, and multimodal AI capabilities.",
      "languages": ["Python"],
      "visible_tags": [],
      "hidden_tag_count": 0,
      "stars": null,
      "forks": null,
      "license": "Apache-2.0",
      "github": "https://github.com/iflytek/iFly-Skills"
    }
  ],
  "error_reasoning": null
}
```

Notes on the shape:
- `stats.*` and per-project `stars`/`forks` are the site's **abbreviated display strings** (`"18.5k"`, `"8.6k"`, `"854"`); they are not exact integers.
- `visible_tags` holds only the tags rendered on the card; `hidden_tag_count` is the integer from the `+N` badge (0 when there is no badge). The hidden tag names are not available from this page.
- `description` is the English (`data-lang-en`) text; substitute `data-lang-zh` if Chinese is requested.
- On failure (page unreachable, structure changed): `{ "success": false, "stats": null, "projects": [], "error_reasoning": "<what went wrong>" }`.
