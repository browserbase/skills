---
name: clirank-dev-find-agent-ready-apis-c9ocm0
title: Find Agent-Ready APIs on CLIRank
description: >-
  Given a software-project need, return a ranked list of agent-ready
  API/SDK/CLI/MCP options from CLIRank with one opinionated top pick,
  runner-ups, per-option fit/fail rationale, CLIRank citations, and a concrete
  next-step integration recommendation. Read-only — does not submit reviews
  unless explicitly requested with real integration evidence.
website: clirank.dev
category: developer-tools
tags:
  - api-discovery
  - api-selection
  - agent-readiness
  - sdk
  - cli
  - mcp
  - directory
source: 'browserbase: agent-runtime 2026-05-21'
updated: '2026-05-21'
recommended_method: api
alternative_methods:
  - method: mcp
    rationale: >-
      If the calling agent has the CLIRank MCP server installed (`npx -y
      clirank-mcp-server@latest` or hosted at https://clirank-mcp.fly.dev/mcp),
      use the typed MCP tools (`discover_apis`, `recommend`, `get_api_docs`,
      `get_api_details`, `compare_apis`, `get_reviews`). They wrap the same JSON
      endpoints in tool-call form.
  - method: browser
    rationale: >-
      The rendered HTML at clirank.dev/tasks/{slug}, /score/{slug},
      /apis/{cat}/{slug} is a fallback if the JSON API is unreachable. Pages are
      server-rendered Next.js with no JS-only content — `browse get markdown
      body` works without stealth or proxies, but is strictly slower and lossier
      than the JSON.
verified: false
proxies: false
---
# Find Agent-Ready APIs on CLIRank

## Purpose

Given a software-project need (e.g. "send transactional email from Node", "manage secrets in CI", "accept subscriptions with webhooks"), return a **ranked list of agent-ready API, SDK, CLI, or MCP options from CLIRank** with a single opinionated top pick, runner-ups, per-option fit/fail rationale, relevant CLIRank URLs, and a concrete next-step integration recommendation (SDK install, required env vars, first endpoint to call). Read-only: this skill **queries** CLIRank's public JSON surface, it does not submit reviews unless the calling user explicitly asks and provides evidence from a real integration attempt.

## When to Use

- A user asks you to pick an API/SDK/CLI/MCP server for a concrete task (email, payments, secrets, auth, image generation, Slack posting, market data, LLM, push notifications, OCR, etc.).
- You're about to recommend a third-party provider from model memory — CLIRank's runtime data is fresher and grounded in real agent-friendliness scoring.
- A user asks to compare 2+ providers on headless setup, env-var auth, free tier, CLI/MCP support, docs quality, or rate limits.
- A user asks to replace a stale or failing integration with a more agent-friendly option.
- A user wants a recommendation **with citations** (CLIRank URLs they can verify).

Do **not** use this skill as a substitute for actually testing the selected provider. CLIRank narrows candidates; live verification is still the user's job.

## Workflow

CLIRank exposes a clean public JSON API at `https://clirank.dev/api/*` that returns scored, decision-shaped results in a single round-trip. **No auth, no cookies, no anti-bot stealth, no proxies — just `GET` the JSON.** Default read rate limit is 60 req/min per IP. Lead with the API path; the rendered HTML at `clirank.dev/tasks/*`, `/score/*`, `/apis/<cat>/<slug>` exists as a browser fallback but is strictly slower and lossier than the JSON.

If your agent runtime has the **CLIRank MCP server** installed (`npx -y clirank-mcp-server@latest`, or hosted at `https://clirank-mcp.fly.dev/mcp`), prefer the MCP tools — they wrap the same endpoints with typed tool schemas: `discover_apis`, `recommend`, `get_api_docs`, `get_api_details`, `compare_apis`, `get_reviews`, `submit_review`. The rest of the workflow below maps 1:1 to those tools.

### 1. Translate the user's need into a task query

Extract the **task** (what the project must do), **runtime** (Node, Python, Go, shell, serverless, CI, browser), **constraints** (budget, free tier, no OAuth, webhooks, compliance, data residency, headless/CI), and **integration posture** (prototype, production default, enterprise).

Write the query in **task language, not vendor language**:

- ✅ `send transactional emails from a Node app`
- ✅ `accept payments for subscriptions with webhooks`
- ✅ `store secrets for AI agents in CI`
- ❌ `Resend` / `Stripe` — vendor lookup is for **after** candidates emerge, via `/api/apis/{slug}` or `/api/docs?slug={slug}`.

If you need the canonical capability vocabulary CLIRank ranks against, hit `GET /api/discover?capabilities=true` once — it returns the full enum of capability tags (`"send transactional email"`, `"process payments"`, `"upsert vectors"`, ...). Use those phrasings verbatim in `q=` for higher `relevanceScore`.

### 2. Exploratory discovery — `/api/discover`

```
GET https://clirank.dev/api/discover?q={URL-encoded task}&limit=5
```

Response shape:

```jsonc
{
  "query": "send transactional emails",
  "requestId": "disc-...",
  "feedback": { "positive": "/api/feedback?...rating=positive", "negative": "..." },
  "nextStep": {
    "recommendationUrl": "/api/recommend?task=...",
    "hint": "If you need one opinionated answer instead of a ranked list, call recommendationUrl next."
  },
  "count": 5,
  "results": [
    {
      "name": "Resend API",
      "slug": "resend-api",
      "category": "Communication",
      "subcategory": "Email",
      "description": "...",
      "url": "https://resend.com",
      "pricing": "freemium",
      "npmPackage": "resend",
      "cliRelevanceScore": 9,
      "qualityScore": 9,
      "relevanceScore": 74.01,
      "matchSource": "capabilities",
      "reviewMentions": 3,
      "capabilities": ["send transactional email", "manage domains", "track email delivery"],
      "agentDocs": { "hasQuickstart": true, "endpointCount": 0, "avgConfidence": 0 },
      "decisionData": {
        "costAt10k": 20, "costAt50k": 20, "costAt100k": 35,
        "timeToFirstRequest": 5, "linesOfCode": 10,
        "freeRequestsPerMonth": 3000, "requiresCreditCard": false,
        "bestFor": ["Developer experience - cleanest API, TypeScript-first", ...]
      },
      "detailUrl": "https://clirank.dev/apis/communication/resend-api"
    }
    /* ... */
  ]
}
```

**Decision rules for filtering `/api/discover` results**:

- **`relevanceScore` ≥ ~60** = strong match; trust the ranking. **30–50** = soft fallback (no real match found, CLIRank returned the closest categories anyway); be sceptical and consider re-querying with capability-vocabulary phrasing from `?capabilities=true`. CLIRank **always returns `limit` results** — there is no "no results" state, so you must inspect scores yourself.
- **`matchSource: "capabilities"`** is the strongest signal — the query phrase matched an indexed capability tag. `"keywords"` / `"description"` matches are weaker.
- **`cliRelevanceScore` (0–10)** = the 8-signal agent-readiness rubric score (SDK, env-var auth, headless, CLI, JSON, curl docs, rate limits, machine-readable pricing). **For agent/CI/headless use, prefer ≥ 8.**
- **`qualityScore` (0–10)** = npm/GitHub/issue-close/release signals. Both scores can be `null` if the API hasn't been scored yet.

### 3. Opinionated one-best — `/api/recommend`

```
GET https://clirank.dev/api/recommend?task={task}&volume={N}&priority={simplicity|cost|quality}&budget={N}&limit=5
```

`task` is required (alias: `q`). `volume`, `priority`, and `budget` are optional but heavily influence the ranking. Response carries a single primary `recommendation` (rich: quickstart code, score breakdowns, pricing tiers, env-var name), a `runnerUp`, and an ASCII `comparison` table for the top 5. **This is the canonical endpoint for "give me the one API I should use" questions.**

```jsonc
{
  "task": "send transactional email",
  "volume": 10000, "budget": null, "priority": "simplicity",
  "recommendation": {
    "name": "Resend API", "slug": "resend-api", "score": 81.5,
    "reasoning": ["10 lines of code, 5 min setup", "Excellent documentation and SDK quality", "No credit card needed to start"],
    "monthlyCost": 20,
    "bestFor": [...], "notGreatFor": [...],
    "setup": { "timeToFirstRequest": 5, "linesOfCode": 10, "requiresDomainVerification": true, "requiresCreditCard": false },
    "pricing": { "freeRequestsPerMonth": 3000, "costAt10k": 20, "costAt50k": 20, "costAt100k": 35, "tiers": [...] },
    "features": { "supportsInbound": false, "hasTemplateEngine": true, "webhookSupport": true },
    "quickstart": { "language": "typescript", "code": "import { Resend } from \"resend\";\n..." },
    "cliBreakdown": { "hasOfficialSdk": true, "envVarAuth": true, "headlessCompatible": true, "hasCli": false, "jsonResponse": true, ... },
    "qualityBreakdown": { "npmWeeklyDownloads": 3943331, "githubStars": 16351, "daysSinceLastRelease": 6, "issueCloseRatio": 0.89, ... },
    "lastVerified": "2026-04-04",
    "detailUrl": "https://clirank.dev/apis/communication/resend-api"
  },
  "runnerUp": { "name": "SendGrid API", "slug": "sendgrid-api", "score": 68.3, ... },
  "comparison": "API          | Cost/mo | Setup time | Lines of code | Included free usage | Score\n...",
  "meta": {
    "apisEvaluated": 5,
    "categoriesWithDecisionData": ["Payments & Commerce", "Communication", "Authentication & Identity", "Secrets Management"]
  }
}
```

Set `priority` based on user signals:

| User said… | Use `priority=` |
|---|---|
| "easiest to set up", "prototype", "no friction" | `simplicity` |
| "cheapest", "lowest monthly cost at $VOLUME" | `cost` |
| "production-grade", "battle-tested", "best SDK" | `quality` |

`volume` is requests/messages/transactions per month — drives the `monthlyCost` projection. `budget` is monthly USD; results above it are demoted.

### 4. Per-API detail — `/api/apis/{slug}`

For the top 1–3 slugs from steps 2/3, fetch the rich detail record. This is what backs the marketplace card with `cliScoreBreakdown.fields[]` (the per-signal 11-point rubric — which signal earned what), pricing tiers, `agentDocs.pointers` (verified vs. inferred docs URLs), `bestFor` / `notGreatFor`, and the canonical CLIRank detail page link.

```
GET https://clirank.dev/api/apis/{slug}
```

Surface `cliScoreBreakdown.fields[]` in your final recommendation — it lets the user see exactly **which** agent-readiness signal each candidate earned or missed (e.g. "✓ Env var auth, ✓ Headless, ✗ No CLI tool"). This is what makes the recommendation defensible.

### 5. Quickstart docs — `/api/docs?slug={slug}`

Returns agent-friendly setup data: SDK install command, import statement, init line, required env-var names, auth method, base URL.

```jsonc
{
  "api": { "name": "Resend API", "slug": "resend-api", ... },
  "quickstart": {
    "baseUrl": "https://api.resend.com",
    "auth": { "method": "bearer_token", "header": "Authorization: Bearer {key}", "envVar": "RESEND_API_KEY" },
    "sdk": { "install": "npm install resend", "import": "import { Resend } from \"resend\"", "init": "const resend = new Resend(process.env.RESEND_API_KEY)" },
    "requiredEnvVars": ["RESEND_API_KEY"],
    "confidence": 0.3,
    "contributionCount": 0
  },
  "endpoints": [],
  "totalEndpoints": 0
}
```

Treat `confidence` as a trustworthiness signal — values < 0.5 mean the quickstart is auto-generated from CLIRank metadata and **has not been verified against the vendor's live docs**. Include a `confidence` flag in your output and tell the user to confirm against the vendor's official docs before production use. Unknown slugs return HTTP 404 with `{"error": "Unknown API slug: ..."}` — don't propagate that as a "no quickstart" recommendation; re-query `/api/apis` to confirm the slug exists.

### 6. (Optional) Prior integration evidence — `/api/reviews`

```
GET https://clirank.dev/api/reviews?target_type=api&slug={slug}
```

Reviews come from three sources, tagged via `reviewerType`:
- `agent` / `ai` — from coding agents that completed real integrations (highest signal — they include `integrationReport.authWorked`, `workedHeadless`, `timeToFirstRequest`, `sdkUsed`, `strengths[]`, `challenges[]`).
- `human` — from developers; rich prose review.
- `aggregated` — community-sentiment summaries computed from GitHub/Reddit/Stack Overflow; useful as a tiebreaker but not as primary evidence.

Cite at least one review per top recommendation when reviews exist (`reviewMentions > 0` in the discover result indicates presence).

### 7. Synthesize the recommendation

Return a structured response with: the top pick, 1–2 runner-ups, per-option fit/fail rationale tied to the user's stated constraints, the relevant CLIRank URLs, and a concrete first-step integration recommendation (SDK install + env var + first endpoint). See **Expected Output** below for the canonical shape.

**Important:** never claim live verification you didn't perform. If the user wants a live test, recommend installing the SDK, setting the env var, and making the smallest possible real request — but say so explicitly rather than implying you tested.

### 8. Read-only by default — do **not** submit reviews

CLIRank accepts `POST /api/reviews` for evidence-backed integration reviews. **This skill must not POST anything** unless the user **explicitly** asks for a review submission AND provides genuine integration evidence (the SDK was installed, an env var was set, a real request was made, and they describe the outcome). Fabricated reviews poison the directory. When in doubt, skip the POST.

### Browser fallback

If `clirank.dev/api/*` is ever unreachable (rare — Fly.io hosted, no anti-bot), the rendered HTML surface is a fine fallback. Pages are server-rendered Next.js with no JS-only content — `browse get markdown body` on any of the following extracts the same data the JSON returns:

- `https://clirank.dev/` — directory home with category index.
- `https://clirank.dev/tasks/{task-slug}` — curated task pages (e.g. `transactional-email-api-for-agents`, `payments-api-for-ai-agents`, `secrets-management-api-for-ai-agents`, `llm-api-for-coding-agents`, `image-generation-api-for-agents`, `slack-channel-posting-api-for-agents`, `github-issue-pr-api-for-agents`, `stock-market-data-api-for-agents`, full list in `https://clirank.dev/llms.txt`).
- `https://clirank.dev/score/{api-slug}` — per-API score page with the same `cliScoreBreakdown` rubric in human-readable form.
- `https://clirank.dev/apis/{category-slug}/{api-slug}` — canonical API detail page; the `detailUrl` in every API record points here. Include this in the structured output as the citation URL.

No stealth, no proxies, no waits needed — a plain `browse open` + `browse get markdown body` is sufficient. But again, this is the slow path; the JSON API is faster, leaner, and structurally exposes fields (per-signal rubric, decision data, quickstart code) that the rendered HTML embeds in less convenient form.

## Site-Specific Gotchas

- **`/api/discover` never returns zero results — it falls back to soft matches.** Even nonsense queries (`q=zxqwerty-does-not-exist`) return `limit` items with `relevanceScore` in the 30s–40s (sourced via category fallback). Always inspect `relevanceScore` and `matchSource` yourself; treat anything < 50–55 as "no real match" and recommend the user refine the query (use a capability tag from `?capabilities=true`).
- **`decisionData` is only populated for four categories today.** `categoriesWithDecisionData` in the `/api/recommend` meta envelope currently lists `Payments & Commerce`, `Communication`, `Authentication & Identity`, `Secrets Management`. For tasks in other categories (LLMs, image gen, vector DBs, secrets, push, OCR, etc.), `/api/recommend` still returns a winner but with sparse `monthlyCost`, empty `quickstart`, null `cliBreakdown`/`qualityBreakdown` fields. Don't crash on missing fields — surface "decision data not yet available for this category; recommendation is based on score only" in your output.
- **`cliRelevanceScore` and `qualityScore` can be `null`.** Some directory entries (especially newer additions) have not been scored. Treat null as "unknown" not "zero" — and demote those candidates only if the user explicitly asked for agent-readiness as a hard constraint.
- **`agentDocs.confidence` < 0.5 means auto-generated, unverified docs.** The `/api/docs?slug=...` quickstart is best-effort metadata until owner-submitted or human-verified. Always include the `confidence` value in your output and direct the user to the vendor's official docs URL (`api.url` in the discover response or `quickstart.officialDocsUrl` in `/api/docs`) for production setup.
- **`/api/docs?slug=foo` 404s with `{"error":"Unknown API slug: foo"}`** when the slug isn't in the directory. Use `/api/apis?q={search-text}` first to resolve the canonical slug before hitting docs.
- **Slug format**: kebab-case, often suffixed with `-api` (`stripe-api`, `resend-api`, `sendgrid-api`) but not always (`amazon-ses`, `doppler`, `infisical`, `novu`, `bridge-api`). Get the exact slug from `/api/discover` or `/api/apis` response — don't synthesize.
- **`/api/apis` text filter is `q=`, not `search=`.** Unknown query params are silently ignored — `?search=stripe` returns the unfiltered top of the directory rather than an error. Use `?q={text}` for keyword search and `?category={slug}` for category filter. `limit` defaults to 20 (cap higher if you need a wider view). Category slugs are returned in the `categories[]` block of every `/api/apis` response — use that as the enum source.
- **Pricing field `pricing` is a coarse enum** (`free`, `freemium`, `paid`, `pay-per-use`, `transaction-based`) — not a price. For real numbers, read `decisionData.costAt10k`/`costAt50k`/`costAt100k` from `/api/discover` results or the `pricing.tiers[]` block from `/api/recommend` / `/api/apis/{slug}`.
- **`reviewerType: "aggregated"` is community sentiment, not a real integration attempt.** Useful as colour, but cite reviews with `reviewerType: "agent"`, `"ai"`, or `"human"` for actual evidence-backed integration reports. The `integrationReport` block (with `authWorked`, `workedHeadless`, `timeToFirstRequest`, `sdkUsed`, `strengths[]`, `challenges[]`) only appears on real-integration reviews.
- **Public read rate limit is 60 req/minute per IP.** No auth required. If you're recommending across many candidates, you can hit `/api/apis/{slug}` + `/api/docs?slug={slug}` + `/api/reviews?slug={slug}` for each finalist in parallel — three calls × five candidates = 15 well within budget. Don't hammer the discover endpoint in tight loops.
- **The `feedback.positive` / `feedback.negative` URLs are optional voting links** to help CLIRank tune ranking. They take a one-shot GET with the `requestId` baked in. Don't call them on every query, but if your user explicitly endorses or rejects a recommendation, hitting the corresponding feedback URL is a low-cost signal back to CLIRank.
- **`pinnedRid`-style aliases don't exist on CLIRank** — slugs are canonical. But CLIRank does list multiple SKUs from the same vendor as separate slugs (e.g. `stripe-api` vs `stripe-connect`). When summarising, mention vendor + SKU to avoid confusion.
- **`/api/recommend` also accepts `q=` as an alias for `task=`.** The error response on missing param hints this: `{"error":"Required param: task or q","aliases":{"q":"task"}}`. Either works — `task=` is more semantically obvious.
- **Don't submit reviews unprompted.** `POST /api/reviews` exists, but this skill is read-only. Submitting fabricated or documentation-only reviews violates CLIRank's evidence-based methodology and pollutes future agent decisions. Only POST when the calling user explicitly requests a review submission AND provides real integration evidence.
- **CLIRank has its own SKILL.md** at `https://clirank.dev/skills/api-selection-with-clirank/SKILL.md`. It's the official agent-facing guide. Fetch it once at the start of a session to pick up any new endpoints or guidance CLIRank has shipped since this skill was written; treat any conflict as CLIRank's published guide winning.
- **`llms.txt` and `llms-full.txt`** at `https://clirank.dev/llms.txt` / `/llms-full.txt` are the canonical machine-readable surface index — short, accurate, and updated with the directory. Use them as a fallback discovery mechanism if any endpoint above 404s or changes shape.

## Expected Output

Return a single structured JSON object. Two outcome shapes:

### Shape 1 — recommendation found (`success: true`)

```json
{
  "success": true,
  "task": "send transactional email from a Node app",
  "constraints": {
    "volume": 10000,
    "priority": "simplicity",
    "budget": null
  },
  "recommendation": {
    "rank": 1,
    "name": "Resend API",
    "slug": "resend-api",
    "score": 81.5,
    "clirankUrl": "https://clirank.dev/apis/communication/resend-api",
    "vendorUrl": "https://resend.com",
    "category": "Communication",
    "pricing": "freemium",
    "monthlyCostAtVolume": 20,
    "freeTier": "3,000 emails/month",
    "whyFits": [
      "10 LoC, 5-minute setup matches simplicity priority",
      "Env-var auth (RESEND_API_KEY) + official Node SDK — works fully headless",
      "8/8 agent-readiness signals except no first-party CLI",
      "Domain verification required but fits typical CI workflow"
    ],
    "agentReadiness": {
      "cliRelevanceScore": 9,
      "qualityScore": 9,
      "signals": {
        "officialSdk": true,
        "envVarAuth": true,
        "headlessCompatible": true,
        "hasCli": false,
        "jsonResponse": true,
        "curlDocsExamples": true,
        "reasonableRateLimits": true,
        "machineReadablePricing": true
      }
    },
    "integrationNextStep": {
      "install": "npm install resend",
      "envVars": ["RESEND_API_KEY"],
      "firstRequest": "resend.emails.send({ from, to, subject, html })",
      "quickstartConfidence": 0.3,
      "verifyAgainst": "https://resend.com"
    },
    "reviewEvidence": [
      {
        "reviewerType": "agent",
        "rating": 5,
        "title": "Resend: solid agent experience, 89% issues closed",
        "workedHeadless": true,
        "timeToFirstRequest": 0
      }
    ]
  },
  "runnerUps": [
    {
      "rank": 2,
      "name": "SendGrid API",
      "slug": "sendgrid-api",
      "score": 68.3,
      "clirankUrl": "https://clirank.dev/apis/communication/sendgrid-api",
      "monthlyCostAtVolume": 19.95,
      "whyFits": ["Mature ecosystem, broad integrations", "Same env-var auth + headless story"],
      "whyNotPicked": ["12 LoC vs Resend's 10, ~15min setup vs 5min", "No free tier (0/mo) vs Resend's 3,000/mo"]
    },
    {
      "rank": 3,
      "name": "Amazon SES",
      "slug": "amazon-ses",
      "score": 56.4,
      "clirankUrl": "https://clirank.dev/apis/communication/amazon-ses",
      "monthlyCostAtVolume": 1,
      "whyFits": ["Cheapest by ~20× at scale", "Native AWS-ecosystem integration"],
      "whyNotPicked": ["Credit card required up front", "16 LoC, ~30min IAM/SES setup misses simplicity priority"]
    }
  ],
  "comparisonTable": "API          | Cost/mo | Setup | LoC | Free   | Score\n-------------+---------+-------+-----+--------+------\nResend API   | $20.00  |  5min | 10  | 3K/mo  | 81.5\nSendGrid     | $19.95  | 15min | 12  | None   | 68.3\nPostmark     | $15.00  | 10min | 10  | 100/mo | 68.0\nMailgun      | $35.00  | 15min | 13  | 3K/mo  | 61.7\nAmazon SES   |  $1.00  | 30min | 16  | 3K/mo  | 56.4",
  "sources": {
    "discoverUrl": "https://clirank.dev/api/discover?q=send+transactional+emails&limit=5",
    "recommendUrl": "https://clirank.dev/api/recommend?task=send+transactional+email&volume=10000&priority=simplicity",
    "detailUrl": "https://clirank.dev/api/apis/resend-api",
    "docsUrl": "https://clirank.dev/api/docs?slug=resend-api",
    "reviewsUrl": "https://clirank.dev/api/reviews?target_type=api&slug=resend-api",
    "lastVerified": "2026-04-04"
  },
  "caveats": [
    "Decision data covers Payments, Communication, Auth, and Secrets categories. For other categories, the recommendation is score-based only.",
    "Quickstart confidence is 0.3 (auto-generated) — verify against https://resend.com before production use.",
    "Live integration NOT performed by this skill — install SDK, configure env vars, and make a test request to confirm."
  ]
}
```

### Shape 2 — soft match / underspecified task (`success: false`)

When `/api/discover` returns only soft matches (all `relevanceScore` < ~55) or `/api/recommend` returns a winner outside the user's stated category, surface the ambiguity rather than guessing.

```json
{
  "success": false,
  "reason": "no_strong_match",
  "task": "do the thing with the stuff",
  "topSoftMatches": [
    {
      "name": "Bridge API",
      "slug": "bridge-api",
      "relevanceScore": 42.6,
      "matchSource": "capabilities",
      "clirankUrl": "https://clirank.dev/apis/payments-and-commerce/bridge-api"
    }
  ],
  "suggestion": "Re-query with a capability-vocabulary phrase. Browse https://clirank.dev/api/discover?capabilities=true for the canonical tag list (e.g. 'send transactional email', 'process payments', 'upsert vectors').",
  "sources": {
    "discoverUrl": "https://clirank.dev/api/discover?q=do+the+thing+with+the+stuff&limit=5",
    "capabilityIndex": "https://clirank.dev/api/discover?capabilities=true"
  }
}
```

### Shape 3 — category not yet scored (`success: true, partial: true`)

When `/api/recommend` returns a winner but the category isn't in `meta.categoriesWithDecisionData`, return the recommendation **without fabricating** missing `monthlyCost` / `setup` / `cliBreakdown` fields. Flag the partial state.

```json
{
  "success": true,
  "partial": true,
  "task": "generate images from prompts",
  "recommendation": {
    "rank": 1,
    "name": "OpenAI API",
    "slug": "openai-api",
    "score": 10,
    "clirankUrl": "https://clirank.dev/apis/ai-and-machine-learning/openai-api",
    "whyFits": ["cliRelevanceScore 9/10, qualityScore 10/10", "Official SDK + env-var auth, headless-compatible"],
    "missingData": ["monthlyCostAtVolume", "timeToFirstRequest", "linesOfCode", "quickstart code"]
  },
  "caveats": [
    "Decision data not yet available for AI & Machine Learning. Recommendation is based on agent-readiness rubric score only — verify pricing and setup against https://platform.openai.com before integrating."
  ],
  "sources": {
    "recommendUrl": "https://clirank.dev/api/recommend?task=generate+images+from+prompts",
    "detailUrl": "https://clirank.dev/api/apis/openai-api"
  }
}
```
