---
name: kineticist-com-explore-pinball-content-w5vgkf
title: Explore Pinball Content on Kineticist
description: >-
  Search 1,700+ pinball machines, browse the daily Hype Index of upcoming-theme
  rumors, find venues to play, read news, build community lists, and create an
  account on Kineticist — using the site's first-party agent surfaces (OpenAPI,
  agent-card, llms.txt, per-route Markdown projections, CLI, MCP) before falling
  back to the browser.
website: kineticist.com
category: pinball
tags:
  - pinball
  - kineticist
  - hype-index
  - games-database
  - locations
  - openapi
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: hybrid
alternative_methods:
  - method: api
    rationale: >-
      REST /api/v1/games* is the fastest path for programmatic catalog reads and
      per-user writes; requires a free Bearer token from /settings. All write
      actions (logPlay, toggleOwnership, toggleWant, updateFunScore, etc.) ride
      POST /api/v1/me/actions.
  - method: url-param
    rationale: >-
      Appending .md to any /news, /games/pinball, /hype, /locations,
      /manufacturers, /people, /mods, or /promoters detail URL returns a
      1–3K-token Markdown projection with no auth. Best for read-only
      detail-page reads where you already have a slug.
  - method: mcp
    rationale: >-
      @kineticist/mcp-server exposes 11 tools (catalog reads + the same per-user
      write handlers as POST /api/v1/me/actions) over MCP 2025-03-26 stdio; the
      hosted variant is at https://www.kineticist.com/api/mcp.
  - method: cli
    rationale: >-
      @kineticist/cli wraps the REST API in 12 commands (npx @kineticist/cli
      pinball random | search | get | log-play | …). Reads KINETICIST_API_KEY
      from env.
  - method: browser
    rationale: >-
      Required for account creation (/signup, Google OAuth or email + ≥10-char
      password), list creation (/lists, no public API), and any feature whose UI
      lives on the site without a public-API counterpart. No anti-bot or proxy
      needed — bare cloud-IP fetches return 200 OK on all read routes.
verified: false
proxies: false
---
# Explore Pinball Content on Kineticist

## Purpose

Drive read- and write-side flows on Kineticist — the pinball industry's database, hype tracker, and editorial publication. This skill teaches agents to search the 1,700-machine catalog, browse the daily-updated Hype Index of upcoming-theme rumors, find venues to play, read news/editorial, build community lists, and create an account so the user can persist their own ratings, ownership, wishlist, and play log. Kineticist explicitly publishes an OpenAPI spec, an agent card, a `/llms.txt`, per-route Markdown projections, a CLI, and an MCP server — this is an agent-friendly host and the workflow leans on those surfaces before the browser.

## When to Use

- A user wants to search or look up a specific pinball machine (specs, design team, editions, fun score, OPDB cross-reference).
- A user wants to know what themes the pinball community is currently most hyped for ("which theme will Stern/Spooky/Jersey Jack make next?").
- A user wants to find arcades, barcades, or museums that have a particular machine on location.
- A user wants the latest pinball news, weekly recap (This Week in Pinball), or a specific editorial piece.
- A user wants to create a Kineticist account so they can rate machines, track ownership/plays/wishlist, leave reviews, or build curated lists.
- An agent backend wants programmatic, cacheable access to the game catalog without scraping HTML.

## Workflow

Kineticist is a Next.js site hosted on Vercel, returns `200 OK` to bare HTTP requests, and has **no anti-bot, captcha, or login wall on public pages** — but it deliberately splits surfaces by purpose. Use the right surface for each sub-task, not the browser for everything.

**Surface map (most efficient first):**

| Sub-task | Best surface | Why |
|---|---|---|
| Game catalog search, filters, programmatic reads | `GET /api/v1/games` (Bearer) | Structured JSON, sparse-field selection, pagination, fastest |
| Specific machine, venue, news article, hype theme, manufacturer, person, mod, promoter | `GET {canonical}.md` (no auth) | 1,000–3,000 tokens vs ~14,000 for the rendered HTML |
| Hype Index ranking + theme list | `GET /hype` (HTML) + per-slug `.md` | No API endpoint for the index itself; enumerate slugs from HTML hrefs |
| Locations / "where to play" listing | `GET /locations` (HTML) + per-slug `.md` | No API endpoint; sitemap-driven discovery |
| Streaming news / new-article notification | `GET /news/rss.xml` | Standard RSS; full item list with titles, links, dates |
| Slug discovery in bulk | `GET /sitemap.xml` → sub-sitemap per route type | Authoritative inventory: `sitemap/games.xml`, `sitemap/hype.xml`, `sitemap/locations.xml`, `sitemap/news.xml`, etc. |
| Account creation, list creation, rating UI | Browser at `/signup`, `/lists`, `/settings` | These are user-state surfaces; no public API endpoints exist for them |

### 1. Start every session with the agent-friendly discovery files (no auth)

```
GET https://www.kineticist.com/llms.txt                            # ~700-token site map
GET https://www.kineticist.com/.well-known/agent-card.json         # capability manifest + 18 skill IDs + supported routes
GET https://www.kineticist.com/openapi.json                        # full OpenAPI 3.1 spec for /api/v1
GET https://www.kineticist.com/sitemap.xml                         # index of per-route sub-sitemaps
```

The agent card declares two protocol bindings: `https://www.kineticist.com/api/v1` (HTTP+JSON) and `https://www.kineticist.com/api/mcp` (JSON-RPC, MCP 2025-03-26). The card's `contentNegotiation.markdown.perRoute.supportedRoutes` lists exactly which page patterns have per-route Markdown projections.

### 2. Read a specific machine, venue, news article, hype theme, manufacturer, person, mod, or promoter

Append `.md` to the canonical URL (no auth required, no Accept-header negotiation needed):

```
GET https://www.kineticist.com/games/pinball/beetlejuice-2025.md          → 200 text/markdown
GET https://www.kineticist.com/hype/the-muppets-pinball.md                → 200 text/markdown
GET https://www.kineticist.com/locations/austin-pinball-collective.md     → 200 text/markdown
GET https://www.kineticist.com/news/goonies-treasure.md                   → 200 text/markdown
GET https://www.kineticist.com/manufacturers/stern-pinball-inc.md         → 200 text/markdown
GET https://www.kineticist.com/people/{slug}.md
GET https://www.kineticist.com/mods/{slug}.md
GET https://www.kineticist.com/promoters/{slug}.md
```

Each projection includes the H1 title, manufacturer/production/design-team/editions metadata (for games), or analysis/cultural-footprint paragraphs (for hype themes), or arcade description + carried-machines summary (for locations). Token cost: 1,000–3,000 per page vs ~14,000 for the JS-rendered HTML.

**Index-level URLs do NOT have per-route projections.** `GET /hype.md`, `/games/pinball.md`, `/news.md`, `/locations.md` all return the fallback site overview (the same content as `/llms.txt`), not a page-specific projection. To get the actual content of an index page, fetch the HTML and parse hrefs for slug discovery (see step 3) or pull the sub-sitemap.

### 3. Discover slugs in bulk

Two ways, pick by use case:

- **Sub-sitemaps** (authoritative, complete): `GET https://www.kineticist.com/sitemap/{games|hype|locations|news|people|manufacturers}.xml`. Standard `<urlset><url><loc>…</loc></url></urlset>` format.
- **Index page HTML** (top results, ranked): `GET https://www.kineticist.com/hype` and regex-extract `href="(/hype/[a-z0-9-]+)"`. Same trick works for `/games/pinball`, `/locations`, `/news`, `/manufacturers`. Use this when you want the *ranked* or *featured* subset — e.g. the top-10 hype themes in their displayed order — not the full sitemap.

### 4. Programmatic game catalog queries — REST API (Bearer auth required)

Public game data lives at `/api/v1/games*`. **All `/api/v1/*` endpoints require a Bearer token** — there are no public/unauthenticated API endpoints, not even `/api/v1/stats` or `/api/v1/games/random`. Tokens are minted at `https://www.kineticist.com/settings` after sign-in (step 7); the format is `ki_live_…`. All tiers (free / builder / partner) are free during early access; the tier just sets the per-second / per-minute / per-day ceiling (free = 10/60/1,000).

```
GET  /api/v1/games?q={text}&manufacturer={slug-or-name}&year_from=&year_to=
                  &in_production={true|false}&game_type={solid_state|ss|em}
                  &sort={-first_manufacture_year|average_fun_score|...}
                  &limit=&offset=&fields=name,slug,average_fun_score
GET  /api/v1/games/{idOrSlug}                        # Full GameDetail, editions included
GET  /api/v1/games/{idOrSlug}/credits                # Design team
GET  /api/v1/games/{idOrSlug}/tags                   # Tag taxonomy
GET  /api/v1/games/{idOrSlug}/trims                  # Editions (Pro/Premium/LE/CE) with pricing
GET  /api/v1/games/random                            # Random game (great for content gen)
GET  /api/v1/games/batch?ids=gm_xxx,gm_yyy           # Multi-fetch
GET  /api/v1/stats                                   # Database stats
GET  /api/v1/me/state?gameId={uuid}                  # The key-owner's per-game state
POST /api/v1/me/actions                              # Write actions for the key owner only
```

The `q` parameter is a fuzzy/natural-language search — "that stern game with dinosaurs" is documented as working. Sparse-field selection via `?fields=name,slug,average_fun_score` keeps responses tight.

`POST /api/v1/me/actions` is a single envelope endpoint that takes `{ handler, gameId, … }`. Handlers: `logPlay`, `updatePlayLog`, `deletePlayLog`, `toggleOwnership`, `toggleWant`, `updateOwnershipDetails`, `updateFunScore`, `undoLastPlay`, `deleteFunScore`. **All actions write only to the API-key owner's library — there is no admin-mutate-other-users surface.**

### 5. Hype Index — the "most hyped upcoming themes" flow

There is **no `/api/v1/hype` endpoint** — the agent card lists hype as a *skill* but it's served via the website. Pattern:

1. `GET https://www.kineticist.com/hype` (HTML). Top-of-page lists the current top themes with rank, name, hype score (0–100), and status (`rumored`, `wanted`, `produced`, `produced old`). Themes graduate out of the index when they ship as a real production game; the page has a "Show N graduated themes" toggle.
2. Regex-extract `href="(/hype/[a-z0-9-]+)"` to enumerate slugs in their displayed rank order.
3. For each theme of interest: `GET /hype/{slug}.md` returns 1–2K tokens of analysis covering franchise nostalgia signals, community mentions/votes, design possibilities, and (where applicable) rumor evidence from leaked code or industry teases.

### 6. Where to Play — locations flow

Same shape as hype: no API endpoint, use HTML + `.md`:

1. `GET https://www.kineticist.com/locations` (HTML) — featured/top locations.
2. `GET https://www.kineticist.com/sitemap/locations.xml` — full inventory (8,400+ venues).
3. `GET /locations/{slug}.md` — per-venue description with carried-machines summary. Location data is mirrored daily from **Pinball Map** (`pinballmap.com`) and may be augmented by user-submitted edits.

Note: location data lives behind the website only — there's no zip-code-radius API on Kineticist. For radius search, the upstream Pinball Map has its own public API (`pinballmap.com/api/v1/locations.json?by_lat_lon=…`), which Kineticist itself credits in the footer.

### 7. Account creation — browser-only (`/signup`)

Browser flow (read-only stops here unless the user explicitly authorizes account creation):

1. Open `https://www.kineticist.com/signup`.
2. Two paths offered: **Continue with Google** (OAuth) or **email + password**. Password requirement is "At least 10 characters" — there's a live `Verifying…` async indicator next to it.
3. Display name is optional. Email is required. Submit triggers a verification step.
4. After sign-in, navigate to `https://www.kineticist.com/settings` (auto-redirects `/settings → /login?redirectTo=/settings` when unauthed) to mint an API key. Documented quickstart is `curl -H "Authorization: Bearer ki_live_YOUR_KEY" https://www.kineticist.com/api/v1/games/random`.

**Do not submit the signup form on behalf of a user without explicit authorization** — account creation is a write action with real legal/identity implications. Stop at the form being filled and confirm with the user.

### 8. Lists — browser-only (`/lists`)

`https://www.kineticist.com/lists` is the community-curated-collection surface. Tabs: All / Games / Locations / Hype, with Recent / Most Liked / IFPA sort. The "Create a List" CTA requires an authenticated session — there's no `POST /api/v1/lists` endpoint in the OpenAPI spec. To create a list:

1. Sign in (step 7).
2. Navigate to `/lists`, click **Create a List**.
3. Pick list type (game / location / hype), add a name, description, and items.

Read access to lists is public via the website; programmatic list-create is not currently exposed.

### 9. Alternative agent interfaces (CLI + MCP)

Kineticist publishes two first-party agent interfaces that wrap the same `/api/v1` surface — use them when the host runtime already supports MCP or shell tools:

- **`@kineticist/cli`** (12 commands): `npx @kineticist/cli pinball random`, `pinball search <query>`, `pinball get <slug>`, plus the eight `me/actions` write handlers. Reads `KINETICIST_API_KEY` from env.
- **`@kineticist/mcp-server`** (11 tools): standard MCP stdio server. Tool IDs: `search_pinball_games`, `get_game_details`, `get_random_game`, `get_pinball_stats`, `get_game_credits`, `kineticist_log_play`, `kineticist_toggle_ownership`, `kineticist_toggle_want`, `kineticist_set_fun_score`, `kineticist_undo_last_play`, `kineticist_get_my_state` (plus auxiliary delete/update tools surfaced via the agent card's full 18-skill list). Boots from `npx @kineticist/mcp-server` with `KINETICIST_API_KEY` in env. Connect via the agent card's `https://www.kineticist.com/api/mcp` JSON-RPC interface for the hosted variant.

### Browser fallback

When the API is rate-limited, the `.md` projection is missing for an obscure route, or the user is on `/lists` / `/signup`, drive the browser at `https://www.kineticist.com/{path}`. The site uses Next.js with hydrated client components; `browse open` followed by `browse get markdown body` is generally enough — accessibility refs work because the page isn't behind a JS-render wall like Craigslist. No stealth or residential proxy needed (`200 OK` from bare cloud IPs in all five iterations of testing).

## Site-Specific Gotchas

- **No public/unauthenticated API endpoints.** Even `/api/v1/stats`, `/api/v1/games/random`, and `/api/v1/games` (list) return `401 missing_api_key` with the (charming) hint *"Insert coin to continue."* The "free tier" is free in *price*, not in *auth* — you still need a `ki_live_…` Bearer token from `/settings`. Don't waste turns trying to find a public endpoint.
- **Index-page `.md` projections fall back to the site overview, not page content.** `GET /hype.md`, `/games/pinball.md`, `/news.md`, `/locations.md` all return the same `/llms.txt` content. Per-route projections **only** exist for the eight detail patterns enumerated in the agent card: `/news/[slug]`, `/games/pinball/[slug]`, `/hype/[slug]`, `/locations/[slug]`, `/manufacturers/[slug]`, `/people/[slug]`, `/mods/[slug]`, `/promoters/[slug]`. For index-page content (rankings, featured items in display order) you must fetch HTML and parse hrefs, or pull the sub-sitemap.
- **Manufacturer slugs are not always the obvious form.** The agent card's example references `stern-pinball` but the live slug is `stern-pinball-inc`. Always discover via the catalog/sitemap rather than constructing slugs from manufacturer names. Confirmed: `/manufacturers/stern-pinball.md → 404`, `/manufacturers/stern-pinball-inc.md → 200`.
- **The bare `kineticist.com` host 308-redirects to `www.kineticist.com`** (Vercel default). Always use the `www.` host on direct fetches to avoid the extra redirect.
- **Game IDs are prefixed UUIDs** (`gm_` + UUID), not raw UUIDs. `idOrSlug` path params accept either the prefixed ID, the slug, or an OPDB ID — pick whichever your context has. Don't strip the `gm_` prefix.
- **`q` is a fuzzy/natural-language search**, not a strict substring match. The OpenAPI param description literally suggests "that stern game with dinosaurs" works. Bias prompts toward natural phrasing rather than exact-token search.
- **Sort defaults to `-first_manufacture_year`** (newest first). To get top-rated, pass `sort=-average_fun_score`; to alphabetize, `sort=name`. Sparse `fields=name,slug,average_fun_score` keeps payloads small for ranking workloads.
- **Hype Index has no API endpoint and no JSON shape**, only the `/hype` HTML page and per-theme `.md` projections. The H1 of each theme on the index page carries the rank (`#1`), theme name, score (`/100`), and status badge (`rumored` / `wanted` / `produced`). When a theme ships as a real production game it **graduates out** of the active rankings — toggle "Show N graduated themes" to see the history.
- **Location radius search is NOT a Kineticist endpoint.** The data comes from Pinball Map (`pinballmap.com`) and Kineticist re-renders it. For "near me" zip-radius queries, hit `pinballmap.com/api/v1/locations.json` directly (separate public API). Kineticist's `/locations/{slug}.md` is for known venues you already have a slug for.
- **`/api/v1/me/*` writes scope to the API-key owner only.** There is no admin-mutate-other-users surface. `POST /api/v1/me/actions` is a single envelope endpoint with a `handler` enum; the required other fields (e.g. `gameId`, `score`, `wantType`) vary per handler.
- **Account creation has minimum-10-character password** with live async verification. Google OAuth is the lower-friction path when allowed by user policy.
- **Rate limits are advertised in response headers** — `X-RateLimit-Tier`, `X-RateLimit-Remaining-Day`, `X-RateLimit-Remaining-Minute`, `X-RateLimit-Reset`. Daily window resets at midnight UTC. Email `colin@kineticist.com` for a higher ceiling if the free 1,000/day isn't enough.
- **Newsletter is on a subdomain.** "This Week in Pinball" archive is at `twip.kineticist.com`, not `/news/twip`. The `/news/rss.xml` feed under the apex covers all editorial news (including TWiP entries).
- **No anti-bot, captcha, or login wall on read paths.** A residential proxy is NOT required. Five iterations of cloud-IP fetches returned `200 OK` across `/`, `/llms.txt`, `/openapi.json`, `/sitemap.xml`, `/hype`, `/games/pinball`, `/locations`, `/news`, `/lists`, `/signup`, and all `.md` projections tested.

## Expected Output

The skill is a router across surfaces — output shape depends on which sub-task fired. Below are the five distinct outcomes a calling agent should be ready to receive.

### Outcome 1 — Game search (REST, JSON)

```json
{
  "outcome": "game_search",
  "method": "api",
  "endpoint": "GET /api/v1/games",
  "query": { "q": "godzilla", "manufacturer": "stern", "limit": 5, "sort": "-average_fun_score" },
  "object": "list",
  "data": [
    {
      "id": "gm_8f3c1d…",
      "name": "Godzilla (Premium)",
      "slug": "godzilla-premium",
      "first_manufacture_year": 2021,
      "in_production": true,
      "average_fun_score": 92.4,
      "ratings_count": 1184,
      "featured_image": "https://media.kineticist.com/…png",
      "manufacturer": { "id": "mfr_…", "name": "Stern Pinball Inc.", "slug": "stern-pinball-inc" },
      "editions_count": 3
    }
  ],
  "pagination": { "total": 4, "limit": 5, "offset": 0, "has_more": false },
  "rate_limit": { "tier": "free", "remaining_day": 997, "remaining_minute": 59 }
}
```

### Outcome 2 — Detail page via `.md` projection (markdown, no auth)

```json
{
  "outcome": "detail_md",
  "method": "url-param",
  "url": "https://www.kineticist.com/hype/the-muppets-pinball.md",
  "content_type": "text/markdown; charset=utf-8",
  "title": "The Muppets",
  "tokens_estimate": 1800,
  "markdown": "# The Muppets\n\nThe Muppets pinball machine is a theme that has generated significant interest…"
}
```

### Outcome 3 — Hype Index ranked top-N (HTML scrape + per-slug enrichment)

```json
{
  "outcome": "hype_top_n",
  "method": "hybrid",
  "fetched_at": "2026-05-19T00:14:32Z",
  "active_themes_total": 300,
  "graduated_themes_total": 36,
  "top": [
    { "rank": 1,  "name": "The Muppets",                              "slug": "the-muppets-pinball",                          "score": 89, "status": "rumored" },
    { "rank": 2,  "name": "Dungeon Crawler Carl",                     "slug": "dungeon-crawler-carl-pinball",                 "score": 79, "status": "rumored" },
    { "rank": 3,  "name": "He-Man and the Masters of the Universe",   "slug": "he-man-and-the-masters-of-the-universe-pinball","score": 67, "status": "wanted"  },
    { "rank": 4,  "name": "The Goonies",                              "slug": "the-goonies-pinball",                          "score": 78 },
    { "rank": 5,  "name": "Big Trouble in Little China",              "slug": "big-trouble-in-little-china-pinball",          "score": 92 },
    { "rank": 6,  "name": "Sonic the Hedgehog",                       "slug": "sonic-the-hedgehog-pinball",                   "score": 85 },
    { "rank": 7,  "name": "Fallout",                                  "slug": "fallout-pinball",                              "score": 86 },
    { "rank": 8,  "name": "G.I. Joe",                                 "slug": "gi-joe-pinball",                               "score": 80 },
    { "rank": 9,  "name": "Gremlins",                                 "slug": "gremlins-pinball",                             "score": 84 },
    { "rank": 10, "name": "Ghostbusters",                             "slug": "ghostbusters-pinball",                         "score": 83 }
  ]
}
```

### Outcome 4 — Locations near a venue (HTML + `.md` enrichment, or upstream Pinball Map for radius)

```json
{
  "outcome": "locations",
  "method": "url-param",
  "data_source": "kineticist (mirrored daily from pinballmap.com)",
  "results": [
    {
      "slug": "austin-pinball-collective",
      "name": "Austin Pinball Collective",
      "url": "https://www.kineticist.com/locations/austin-pinball-collective",
      "summary_md": "A dedicated pinball arcade on Clayton Lane in Austin…"
    }
  ],
  "note": "For zip-code-radius queries, hit pinballmap.com/api/v1/locations.json?by_lat_lon=… — Kineticist does not expose radius search."
}
```

### Outcome 5 — Account-creation / list-creation request (browser only, user-confirm required)

```json
{
  "outcome": "user_action_required",
  "method": "browser",
  "action": "create_account",
  "url": "https://www.kineticist.com/signup",
  "form_state": {
    "email": "<user-supplied>",
    "password": "<user-supplied — minimum 10 characters>",
    "display_name": "<optional>"
  },
  "alternative": "Continue with Google (OAuth) at /signup",
  "post_signup": "Mint API key at /settings → use Bearer ki_live_… against /api/v1/* for programmatic access",
  "status": "form_filled_pending_user_confirmation"
}
```
