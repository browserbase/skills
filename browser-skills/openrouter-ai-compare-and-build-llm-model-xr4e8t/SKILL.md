---
name: openrouter-ai-compare-and-build-llm-model-xr4e8t
title: 'OpenRouter: Compare LLMs and Build with the Best'
description: >-
  Search and compare OpenRouter's 350+ LLMs by cost, speed
  (throughput/latency/uptime), context length, modalities, and use-case
  category; pick the best fit; then build with it via OpenAI-compatible chat
  completions. API-first — no scraping, no auth for reads.
website: openrouter.ai
category: ai-models
tags:
  - llm
  - openrouter
  - model-selection
  - openai-compatible
  - read-only
  - api
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      When you want a human-readable comparison view (e.g. embedded in a chat
      agent that can render screenshots), the public /models page accepts
      deep-link URL params for sort + filter
      (order=pricing-low-to-high|throughput-high-to-low|latency-low-to-high|context-high-to-low|newest,
      plus supported_parameters=, input_modalities=, category=). The page is
      unauthenticated and renders without anti-bot challenges, but it loses the
      structured numeric fields the API exposes.
  - method: url-param
    rationale: >-
      If you need a deep link a user can click — e.g. 'cheapest vision+tool-use
      models' — construct
      https://openrouter.ai/models?fmt=table&order=pricing-low-to-high&input_modalities=image&supported_parameters=tools.
      Confirmed working as deep links; the URL state is the source of truth for
      sort/filter.
verified: true
proxies: true
---
# OpenRouter: Compare LLMs and Build with the Best

## Purpose

Given a project requirement — typical inputs are some combination of (a) budget per million tokens, (b) speed/latency target, (c) required input/output modalities (text/image/audio/file/video), (d) required `supported_parameters` (e.g. `tools`, `structured_outputs`, `reasoning`), (e) minimum context length, (f) use-case category (programming, roleplay, finance, legal, marketing, health, academia, translation, technology, SEO) — return a ranked shortlist of OpenRouter models with full cost/speed/uptime data, name a recommended pick with rationale, and emit a ready-to-run code snippet that calls the chosen model through OpenRouter's OpenAI-compatible `/api/v1/chat/completions` endpoint. Read-only with respect to the catalog; the "build" step issues a real (billable) inference call only when the caller supplies their own `OPENROUTER_API_KEY`.

## When to Use

- A developer asks "what's the cheapest model that supports tool calling and vision?"
- A latency-sensitive product (autocomplete, voice agent) needs the fastest model meeting a quality bar.
- An agent picking a sub-model dynamically per task class — long-context summarization vs. cheap classification.
- Cost-optimization sweeps across an existing OpenRouter integration ("what's the next-cheapest model that still passes our evals?").
- Anywhere you'd otherwise scrape the `/models` page or read screenshots of the leaderboard — the JSON API has every field the UI surfaces, plus per-provider throughput and uptime that the UI buries.

## Workflow

OpenRouter exposes a public JSON catalog at `https://openrouter.ai/api/v1/models` and per-provider stats at `https://openrouter.ai/api/v1/models/{model_id}/endpoints`. **Both reads are unauthenticated** — no API key, no cookies, no anti-bot stealth, no proxy required. The `/api/v1/chat/completions` build endpoint is OpenAI-compatible and uses a Bearer key from `https://openrouter.ai/settings/keys`. Lead with the API path; the browser path works as a fallback and exists chiefly to surface the use-case category leaderboards that don't have a clean JSON equivalent.

### 1. Pull the model catalog

```
GET https://openrouter.ai/api/v1/models
Accept: application/json
```

Returns `{ "data": [Model, ...] }` with ~350 models. Response is ~450 KB gzipped JSON, no pagination. Each `Model` has:

| Field | Notes |
|---|---|
| `id` | Slug used in chat-completion `model` field — e.g. `anthropic/claude-sonnet-4`, `openai/gpt-5-nano`, `deepseek/deepseek-v4-flash`. Free tiers append `:free` (e.g. `minimax/minimax-m2.5:free`). |
| `canonical_slug` | Internal versioned slug. Don't pass to `/chat/completions` — use `id`. |
| `name` | Human display name. |
| `description` | Long-form. Often embeds use-case category rankings as inline text like `"Translation (#27)Finance (#19)"` — useful regex signal for category filtering. |
| `context_length` | Max prompt+completion tokens. |
| `architecture.input_modalities` | Subset of `text, image, file, audio, video`. |
| `architecture.output_modalities` | Subset of `text, image, audio`. |
| `architecture.tokenizer` | `Claude`, `GPT`, `Llama`, `Mistral`, `Other`, etc. — relevant only for offline token counting. |
| `pricing.prompt` | **USD per token** (not per 1M — see gotcha below). |
| `pricing.completion` | USD per token. |
| `pricing.web_search`, `pricing.input_cache_read`, `pricing.input_cache_write` | Add-on rates; `web_search` is per call, caches are per token. Often missing for non-Anthropic/OpenAI models — treat absence as "not supported". |
| `top_provider.context_length` | Effective context after provider-side truncation. May be lower than the model's nominal `context_length`. |
| `top_provider.max_completion_tokens` | Max output tokens. |
| `top_provider.is_moderated` | Provider applies a moderation layer. |
| `supported_parameters` | Array — see "Filtering by capability" below for the canonical enum. |
| `default_parameters` | Provider-recommended defaults (`temperature`, `top_p`, etc.). |
| `supported_voices` | TTS voices for audio-output models; `null` for text-only. |
| `knowledge_cutoff` | ISO date or `null`. |
| `expiration_date` | When a model variant will be removed. Filter out non-null past dates. |
| `links` | `{ deeplink, ... }` to docs and provider pages. |

**Filtering by capability** — `supported_parameters` is the most useful filter axis. Observed enum across the live catalog:

```
frequency_penalty, include_reasoning, logit_bias, logprobs, max_completion_tokens,
max_tokens, min_p, parallel_tool_calls, presence_penalty, reasoning, reasoning_effort,
repetition_penalty, response_format, seed, stop, structured_outputs, temperature,
tool_choice, tools, top_a, top_k, top_logprobs, top_p, verbosity, web_search_options
```

The `/api/v1/models?supported_parameters=tools` query param is accepted by the server and narrows the catalog server-side — but `input_modalities=image`, `category=programming`, and `order=...` are **page-only** params (no JSON filtering); apply those client-side after fetching the full list.

### 2. (Optional) Pull per-provider endpoint stats — the speed signal

The catalog has prices but no speed data. For a candidate `id`, fetch:

```
GET https://openrouter.ai/api/v1/models/{id}/endpoints
```

Returns `{ "data": { "id": ..., "endpoints": [Endpoint, ...] } }`. Each `Endpoint` is one provider's serving of the model. Speed/health fields:

| Field | Meaning |
|---|---|
| `provider_name` / `tag` | e.g. `Anthropic` / `anthropic`, `Google` / `google-vertex/global`. The `tag` is what `provider` routing accepts in chat-completions. |
| `pricing.*` | Per-provider price (can differ from catalog top-line; the catalog shows `top_provider`'s price). |
| `context_length` / `max_completion_tokens` | Per-provider — Bedrock often capped at 200K where Anthropic-direct exposes 1M. |
| `throughput_last_30m` | Tokens/sec rolling avg. **Often `null`** if the endpoint hasn't been hit in 30m. |
| `latency_last_30m` | First-token latency, seconds. **Often `null`** for low-traffic endpoints. |
| `uptime_last_30m` / `uptime_last_5m` / `uptime_last_1d` | Percent. The `uptime_last_1d` is the most reliable health signal — `<95` for a day means actively unstable. |
| `status` | `0` = healthy, `-5` (observed) = degraded/unavailable. Filter to `status === 0`. |
| `quantization` | e.g. `unknown`, `fp8`, `int4`. Affects quality. |
| `supports_implicit_caching` | Anthropic-style 90% input-token discount for cache hits. |

**Note on `null` speed fields.** Throughput and latency are rolling 30-minute aggregates; low-volume models (most of the 350-model catalog) will show `null` for one or both. Don't filter `null`-out as "broken" — fall back to `uptime_last_1d` and provider reputation. When speed *is* present, it's authoritative.

### 3. Rank and pick

A practical ranking function for "cheapest acceptable" looks like:

```js
const score = (m) => {
  if (m.architecture.input_modalities.indexOf(requiredModality) < 0) return Infinity;
  if (requiredParams.some(p => m.supported_parameters.indexOf(p) < 0)) return Infinity;
  if (m.context_length < minContext) return Infinity;
  return parseFloat(m.pricing.prompt) + parseFloat(m.pricing.completion);
};
```

For "fastest acceptable", fetch `/endpoints` for each candidate and rank by `-throughput_last_30m` (descending), tie-break by `latency_last_30m` ascending, then by price ascending. For a "balanced" pick — weighted geometric mean of normalized (1/price), throughput, and `uptime_last_1d`.

When in doubt, present 3 candidates ranked by the user's stated priority and let them pick.

### 4. Use-case category lookup

The catalog doesn't expose a clean `category` field per model, but two signals are available:

- **Inline in `description`**: most ranked models embed strings like `"Programming (#3)Roleplay (#12)"` near the top of `description`. Parse with `/\b(Programming|Roleplay|Marketing|Finance|Legal|Health|Academia|Translation|Technology|SEO)\s*\(#(\d+)\)/g`.
- **Browser fallback**: `https://openrouter.ai/rankings` has the human-curated leaderboards. The `category` URL param on `/models` (`?category=programming`) filters the *page* but is not honored by `/api/v1/models`.

If the user asks "which model is best for X" where X is a use case, **start with the inline-description signal**; fall back to the rankings page only if you need beyond-top-10 data.

### 5. Build — call the chosen model

OpenRouter exposes an OpenAI-compatible chat endpoint:

```
POST https://openrouter.ai/api/v1/chat/completions
Authorization: Bearer $OPENROUTER_API_KEY
Content-Type: application/json
HTTP-Referer: <your-site-url>      # optional, helps with usage analytics
X-Title: <your-app-name>           # optional, surfaces in /apps leaderboard

{
  "model": "<id from step 1, e.g. anthropic/claude-sonnet-4>",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "tools": [ ... ],                  // if you filtered by supported_parameters=tools
  "temperature": 0.7,
  "max_tokens": 2048,
  "provider": { "order": ["anthropic", "google-vertex/global"] }  // optional routing
}
```

Three idiomatic SDK forms — all return identical OpenAI-shaped responses:

```python
# Python — OpenAI SDK pointed at OpenRouter
from openai import OpenAI
client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ["OPENROUTER_API_KEY"],
)
resp = client.chat.completions.create(
    model="anthropic/claude-sonnet-4",
    messages=[{"role": "user", "content": "Hello"}],
    extra_headers={"HTTP-Referer": "https://myapp.com", "X-Title": "MyApp"},
)
```

```js
// Node — fetch
const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://myapp.com",
    "X-Title": "MyApp",
  },
  body: JSON.stringify({
    model: "anthropic/claude-sonnet-4",
    messages: [{ role: "user", content: "Hello" }],
  }),
});
const data = await r.json();
```

```bash
# curl
curl https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"anthropic/claude-sonnet-4","messages":[{"role":"user","content":"Hello"}]}'
```

**Do not actually issue the chat-completion call unless the user explicitly asks you to and supplies their own key.** The catalog/endpoint reads are free; chat completions bill against the key holder's balance. Emit the snippet ready-to-run; let the user execute.

### Browser fallback

If the JSON API is unreachable (it never has been in practice — `cloudflare` edge, `Cache-Control: private, no-store`, no rate limit on read paths) or you need a screenshot for a human reviewer:

```
https://openrouter.ai/models?fmt=table
    &order=<pricing-low-to-high|throughput-high-to-low|latency-low-to-high|context-high-to-low|newest>
    &supported_parameters=<comma-separated, e.g. tools,structured_outputs>
    &input_modalities=<comma-separated, e.g. image,file>
    &category=<programming|roleplay|finance|legal|marketing|health|academia|translation|technology|seo>
```

All URL params are preserved on navigation — the page is a thin client over the same `/api/v1/models` JSON with client-side sort/filter. No login wall, no Cloudflare challenge, no proxy needed; a bare `browse open` works. `fmt=table` is denser than `fmt=cards`. Wait `~3s` after `load` before snapshotting — the model list lazy-renders.

The model detail page `https://openrouter.ai/{org}/{model-name}` (e.g. `/anthropic/claude-sonnet-4`) is the human view of the `/api/v1/models/{id}/endpoints` data — provider pricing table, throughput chart, uptime sparkline. Capture as a screenshot when a user wants a visual comparison.

## Site-Specific Gotchas

- **`pricing.prompt` and `pricing.completion` are per *token*, not per 1M tokens.** The web UI displays the per-1M figure (e.g. "$3 /M input tokens" for Claude Sonnet 4); the API returns `"0.000003"`. Multiply by `1_000_000` for the per-1M display value. Free-tier `:free` models have `pricing.prompt === "0"` and `pricing.completion === "0"` — 28 of them in the live catalog as of 2026-05-19.
- **Use `id`, not `canonical_slug`, in chat-completion `model` field.** `canonical_slug` is the dated internal version (`anthropic/claude-4.7-opus-fast-20260512`) and is not accepted by the routing layer.
- **Free models (`:free` suffix) are heavily rate-limited and route to community endpoints.** Throughput/latency are best-effort and frequently `null`. Useful for evaluation but not production unless paired with a paid fallback in `provider.order`.
- **`/api/v1/models?supported_parameters=tools` is the only server-side filter that works.** `input_modalities=`, `category=`, `order=` are accepted by the `/models` *page* (URL state, client-side filter) but **not** by `/api/v1/models` — passing them returns the full catalog. Apply those filters client-side after fetching.
- **`/rankings/{category}` sub-paths 404-redirect.** `https://openrouter.ai/rankings/finance` redirects back to `/rankings` (no per-category page). The category breakdown lives in dropdowns on the `/rankings` page itself and as inline ranks inside each model's `description` field — parse from there.
- **`/api/v1/credits` and most non-`/models` paths require a session cookie or Bearer token.** Don't probe them anonymously expecting JSON — you'll get `{"error":{"message":"No cookie auth credentials found","code":401}}`. The two open read paths are `/api/v1/models` and `/api/v1/models/{id}/endpoints`.
- **`throughput_last_30m` and `latency_last_30m` are frequently `null`.** Low-traffic models (anything outside the top-30 by usage) won't have a recent rolling window. **`null` ≠ slow**; it means "no data". Fall back to `uptime_last_1d` for health and treat speed as unknown when both throughput fields are null on every endpoint.
- **Per-provider context/max-output vary.** Same model `id`, different `endpoints[i].context_length` — Anthropic-direct typically exposes the maximum (1M for Sonnet 4); Bedrock often caps at 200K. If the user needs the full context window, route explicitly via `provider.order: ["anthropic"]`.
- **`top_provider` is the *default* route, not necessarily the cheapest or fastest.** OpenRouter's load balancer picks among healthy endpoints; the price/speed of an actual call depends on which provider got the request. For deterministic cost, pin a provider via the `provider.order` field on the chat-completion call.
- **`status === -5` indicates a degraded/unavailable endpoint.** Observed for Bedrock Sonnet 4 (`eu-west-1`, uptime ~44% over 1d). Always filter `endpoints` to `status === 0` before computing aggregate speed/cost.
- **`web_search`, `input_cache_read`, `input_cache_write` are often missing in `pricing`.** Treat absence as "feature not supported" — don't substitute `0`.
- **Use-case categories are not first-class API fields.** They're embedded as inline rank strings in each model's `description` (`"Programming (#3)Marketing (#5)..."`) and as page-only UI on `/rankings`. The known category enum from page traversal: `Programming, Roleplay, Marketing, Finance, Legal, Health, Academia, Translation, Technology, SEO`. Use the description regex for ranking; the `/models?category=` URL is a UI filter only.
- **`HTTP-Referer` and `X-Title` headers are optional but recommended.** They surface your app in `/apps` leaderboards and help OpenRouter route to better providers for your traffic profile. They do not affect billing.
- **No anti-bot, no Cloudflare challenge on read paths.** A residential proxy is unnecessary for `/api/v1/models`, `/api/v1/models/{id}/endpoints`, or the `/models` HTML page. We probed with a bare `browse cloud fetch` (no proxy, no stealth) and got 200 OK with `Server: cloudflare` and `Cache-Control: private, no-store`. The metadata's `verified: true / proxies: true` flags reflect the screenshot-capture session config, not a requirement.

## Expected Output

The skill should return a JSON object with the ranked shortlist, the recommended pick, and a build snippet. Three illustrative shapes:

```json
// Shape 1 — cheap+tools+vision request
{
  "success": true,
  "criteria": {
    "modalities": ["image", "text"],
    "supported_parameters": ["tools"],
    "min_context": 100000,
    "rank_by": "cost"
  },
  "shortlist": [
    {
      "id": "google/gemma-3-12b-it",
      "name": "Google: Gemma 3 12B",
      "prompt_price_per_1m": 0.04,
      "completion_price_per_1m": 0.13,
      "context_length": 131072,
      "input_modalities": ["text", "image"],
      "supported_parameters": ["tools", "structured_outputs", "..."],
      "top_provider_uptime_1d": 99.8,
      "throughput_last_30m_tps": null
    },
    {
      "id": "amazon/nova-lite-v1",
      "name": "Amazon: Nova Lite 1.0",
      "prompt_price_per_1m": 0.06,
      "completion_price_per_1m": 0.24,
      "context_length": 307200,
      "input_modalities": ["text", "image", "video"],
      "supported_parameters": ["tools", "..."],
      "top_provider_uptime_1d": 99.95,
      "throughput_last_30m_tps": 142.3
    }
  ],
  "recommendation": {
    "id": "amazon/nova-lite-v1",
    "rationale": "Cheapest model meeting all criteria with non-null throughput data and 99.95% 1-day uptime; Gemma 3 12B is fractionally cheaper but has no live throughput signal."
  },
  "build_snippet": {
    "language": "python",
    "code": "from openai import OpenAI\nclient = OpenAI(base_url='https://openrouter.ai/api/v1', api_key=os.environ['OPENROUTER_API_KEY'])\nresp = client.chat.completions.create(model='amazon/nova-lite-v1', messages=[...], tools=[...])\n"
  }
}

// Shape 2 — speed-first request with provider pinning
{
  "success": true,
  "criteria": { "rank_by": "throughput", "use_case": "programming" },
  "shortlist": [
    {
      "id": "anthropic/claude-opus-4.7-fast",
      "name": "Anthropic: Claude Opus 4.7 (Fast)",
      "prompt_price_per_1m": 30,
      "completion_price_per_1m": 150,
      "endpoints": [
        { "provider_name": "Anthropic", "tag": "anthropic", "throughput_tps": 142, "latency_s": 0.7, "uptime_1d": 100 }
      ]
    }
  ],
  "recommendation": {
    "id": "anthropic/claude-opus-4.7-fast",
    "provider_pin": "anthropic",
    "rationale": "Fast-mode variant explicitly priced for high throughput; single-provider routing avoids fallback variance."
  },
  "build_snippet": { "language": "curl", "code": "curl https://openrouter.ai/api/v1/chat/completions -H 'Authorization: Bearer $OPENROUTER_API_KEY' -d '{\"model\":\"anthropic/claude-opus-4.7-fast\",\"provider\":{\"order\":[\"anthropic\"]},\"messages\":[...]}'" }
}

// Shape 3 — no model meets criteria
{
  "success": false,
  "reason": "no_model_matches_criteria",
  "criteria": { "modalities": ["audio"], "supported_parameters": ["tools"], "max_prompt_price_per_1m": 0.10 },
  "closest_matches": [
    {
      "id": "...",
      "name": "...",
      "violation": "prompt_price_per_1m=0.50 exceeds 0.10 budget"
    }
  ],
  "suggestion": "Relax max_prompt_price_per_1m to 0.50 or drop the tools requirement (no audio-input model currently both supports tool calling and prices below $0.10/M input)."
}
```
