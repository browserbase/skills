---
name: huggingface-co-browse-latest-models-brgzzx
title: Hugging Face Latest Models
description: >-
  List the most recently created models on Hugging Face with full metadata (id,
  author, createdAt, tags, pipeline_tag, library, downloads, likes, gated flag,
  canonical URL). Filter by pipeline task, library, author/org, or free-text
  search. Read-only.
website: huggingface.co
category: ml-platforms
tags:
  - huggingface
  - models
  - ml
  - api
  - read-only
source: 'browserbase: agent-runtime 2026-05-20'
updated: '2026-05-20'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      Browser path at https://huggingface.co/models?sort=created works without
      any anti-bot stealth — but the listing is fully JS-rendered and costs ~50×
      the time/$ vs. a single HTTP call to /api/models. Use only if the JSON API
      is unreachable from your egress (no such block observed as of 2026-05-20).
  - method: cli
    rationale: >-
      The official Python client `from huggingface_hub import HfApi;
      HfApi().list_models(sort='createdAt', direction=-1, limit=50)` wraps this
      exact endpoint with typed results, retries, and auth. Skill consumers
      running in a Python-capable sandbox should prefer it for ergonomics.
verified: false
proxies: false
---
# Hugging Face — Browse Latest Models

## Purpose

Return the most recently created models on Hugging Face — for each model: `id` (owner/name), `author`, `createdAt`, `lastModified`, `downloads`, `likes`, `tags`, `pipeline_tag`, `library_name`, `gated` flag, and canonical model URL. Optionally narrow by pipeline task (e.g. `text-generation`, `text-to-image`), library (`transformers`, `diffusers`, `gguf`, ...), author/org, or a free-text search. Read-only — never creates, edits, or downloads model artifacts.

## When to Use

- "What are the newest models on Hugging Face right now?"
- Hourly / daily polling for newly-uploaded models matching a task or library.
- Watching a specific org (e.g. `meta-llama`, `google`, `stabilityai`) for new releases.
- Discovering new fine-tunes of a base model (combine with `search=<base>` or `filter=<task>`).
- Any flow that would otherwise scrape `huggingface.co/models?sort=created` — the JSON API is faster, cheaper, paginated cleanly, and returns richer per-model metadata.

## Workflow

Hugging Face exposes a fully public, unauthenticated JSON API at `https://huggingface.co/api/models`. No cookies, no anti-bot, no residential proxy required. Rate limit is **500 requests / 5-minute fixed window** on the `api` scope (advertised via `Ratelimit-Policy` and `Ratelimit` response headers). robots.txt is `Allow: /` for all user-agents. Lead with the API; the browser path works as a fallback but is ~50× slower because the listing page is fully JS-rendered.

1. **Fetch the most recent models** (default — no filters):
   ```
   GET https://huggingface.co/api/models?sort=createdAt&direction=-1&limit=50
   ```
   Returns a JSON array of model objects. `direction=-1` is descending (newest first); pair with `sort=createdAt` for upload time. `limit` is per-page; observed max is 1000 per request — paginate via the `Link` header for more.

2. **Optional query parameters** (combine freely):
   | Param | Effect | Example |
   |---|---|---|
   | `sort` | Sort field. Valid: `createdAt`, `lastModified`, `downloads`, `likes`, `trendingScore` | `sort=createdAt` |
   | `direction` | `-1` desc, `1` asc | `direction=-1` |
   | `limit` | Page size (≤ 1000) | `limit=50` |
   | `filter` | Pipeline tag filter — `text-generation`, `text-to-image`, `text-to-video`, `image-text-to-text`, `automatic-speech-recognition`, `feature-extraction`, `robotics`, `any-to-any`, etc. | `filter=text-generation` |
   | `library` | Library filter — `transformers`, `diffusers`, `gguf`, `mlx`, `sentence-transformers`, `transformers.js`, `pytorch`, `tf`, `jax`, `onnx`, `safetensors` | `library=diffusers` |
   | `author` | Restrict to one user/org namespace | `author=meta-llama` |
   | `search` | Free-text substring match on model id | `search=llama-3` |
   | `full` | If `true`, include `author`, `sha`, `gated`, `lastModified`, `siblings[]` (file manifest) | `full=true` |
   | `config` | If `true`, include `config.json` contents (architectures, model_type, tokenizer_config) inline | `config=true` |
   | `cardData` | If `true`, include `cardData` (model-card frontmatter: license, language, datasets, base_model) | `cardData=true` |

   Unrecognized params are silently dropped. Combine filters and `search` for narrow queries, e.g. `?filter=text-to-image&library=diffusers&search=flux&sort=createdAt&direction=-1`.

3. **Parse each result object**. Every item is a flat JSON object (named fields — not positional). Default-mode fields:
   - `id` — `"owner/name"` (e.g. `"meta-llama/Llama-3.2-1B"`) or a single-segment legacy id (`"bert-base-uncased"`). This is also `modelId` (duplicated).
   - `_id` — MongoDB ObjectId (12-byte hex). Its first 4 bytes encode the upload timestamp; this is what `cursor=` paginates against. Don't treat this as the model identifier — use `id`.
   - `createdAt` — ISO-8601 UTC timestamp of initial upload.
   - `tags[]` — string array. Includes raw labels (`"transformers"`, `"safetensors"`, `"qwen2"`), pipeline-tag duplicates (`"text-generation"`), language codes (`"en"`, `"fr"`), license tags (`"license:apache-2.0"`), `"base_model:<id>"`, `"endpoints_compatible"`, and a trailing `"region:us"` deployment-region tag.
   - `pipeline_tag` — canonical task (e.g. `"text-generation"`, `"text-to-image"`). **Absent when the uploader didn't tag the model** — many fresh uploads have no `pipeline_tag` until the README is committed. Don't assume it's always present.
   - `library_name` — canonical library (e.g. `"transformers"`, `"diffusers"`). Also frequently absent on bare uploads.
   - `downloads`, `likes` — integers; both `0` for fresh uploads (uploads are rate-counted with delay).
   - `private` — always `false` for results returned by this endpoint (private models are filtered server-side).

   With `full=true`, additionally: `author`, `gated` (`false` / `"manual"` / `"auto"`), `lastModified`, `sha` (repo commit SHA), `siblings[]` (array of `{rfilename}` entries — the file manifest).

4. **Construct the canonical model URL**:
   ```
   https://huggingface.co/{id}
   ```
   `id` is used verbatim, slashes included (`"meta-llama/Llama-Prompt-Guard-2-86M"` → `https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M`). No URL-encoding needed for the slash. The page exists for every model in the response.

5. **Paginate** (only if you need > `limit` results). The response includes a `Link` header:
   ```
   Link: <https://huggingface.co/api/models?sort=createdAt&direction=-1&limit=50&cursor=eyJfaWQiOnsiJGx0IjoiNmEwZTMxNDFmMjdlNGU0NGU5OTlhMjhhIn19>; rel="next"
   ```
   Parse the URL between `<` and `>` and follow it — the `cursor` is opaque (base64-encoded `{_id: {$lt: <ObjectId>}}` mongo predicate); do not decode/construct it yourself. There is no `prev` link. Stop when the `Link` header is absent or the response array is empty.

6. **Honor the rate limit**. Each response carries:
   ```
   Ratelimit-Policy: "fixed window";"api";q=500;w=300
   Ratelimit: "api";r=<remaining>;t=<seconds-to-window-reset>
   ```
   500 requests per 300-second fixed window. Stay well below it (e.g. ≤ 1 req/s sustained) and back off when `Ratelimit: r=...` drops below ~50. There is no documented per-IP block on overage — the server returns `429 Too Many Requests` and you wait `t` seconds.

### Browser fallback

Use only if the JSON API is unreachable from your egress (it shouldn't be — no anti-bot, no geo restrictions observed).

```
https://huggingface.co/models?sort=created&pipeline_tag=<task>&library=<lib>&search=<q>&p=<page>
```

- `sort=created` (note: the **browser URL** uses `created`, the **API** uses `createdAt` — these are not interchangeable across surfaces).
- `p=N` paginates (0-indexed, 30 results per page).
- The listing is fully JS-rendered; `browse get markdown body` parses cleanly. Each card text is `<id> [task • params •] Updated <relative-time> ago` followed by the canonical URL in the surrounding anchor `<a href="/{id}">`. `browse snapshot` returns workable refs for clicking through to a model page, but for bulk extraction prefer markdown parsing.

## Site-Specific Gotchas

- **`sort=createdAt` vs `sort=created`**: the **API endpoint** uses `createdAt` (camelCase). The **browser URL** uses `created` (no suffix). They are not aliased — passing `sort=created` to `/api/models` is silently ignored and the API falls back to its default sort (which is *not* createdAt — it's `lastModified` desc, so you'll get stale results that look "recent" but aren't). Always use `sort=createdAt&direction=-1` on the API.
- **`createdAt` ≠ `lastModified`**: `createdAt` is when the repo was first pushed. `lastModified` is the most recent commit (README edit, weight reupload, etc.). For "newest models" use `createdAt`. For "recently updated models" use `lastModified`. The two diverge by hours/days for active repos.
- **`pipeline_tag` and `library_name` are often absent on fresh uploads.** Many models surface in `sort=createdAt&direction=-1` with no README and no auto-detected pipeline. Treat both as optional fields and key off `tags[]` if you must classify.
- **`_id` is not the model identifier — `id` is.** The `_id` field is the internal MongoDB ObjectId; it changes if the repo is recreated. The user-facing identifier is `id` (also exposed as `modelId`). Use `id` for canonical URLs and downstream `/api/models/{id}` lookups.
- **No `total_count` is returned.** Unlike Craigslist's `totalResultCount`, the HF models endpoint doesn't include a total. The total models count (~2.9M as of 2026-05) is only available from the browser listing page header text. If you need a count, scrape it from `https://huggingface.co/models` and parse the number under the `# Models` h1.
- **Cursor pagination is opaque and one-way**. The `Link: rel="next"` header carries a base64'd mongo predicate. There is no `rel="prev"` — you can only walk forward. If you need to resume from a known model, supply `cursor=<base64 of {"_id":{"$lt":"<the model's _id>"}}>` — the predicate is straightforward to construct *if* you have a prior `_id`, but the safer pattern is to walk from the start and stop when `createdAt < <cutoff>`.
- **`limit` ceiling is 1000.** Passing `limit=10000` clamps silently to 1000.
- **Gated and private models**. `private: true` repos are never returned by this endpoint regardless of auth. `gated: "manual"` / `"auto"` repos *are* returned (visible in the listing) but their model page may require accepting terms before download — the listing itself is public. Surface `gated` to callers when `full=true` so they know to expect a terms-gate on click-through.
- **Adult / NSFW models surface in `sort=createdAt`.** The default firehose includes user-uploaded LoRAs and image models with explicit names/content. Callers that render results to end users should filter on `tags[]` for `"not-for-all-audiences"` / `"nsfw"` or apply name-based filtering — this is not auto-redacted by the API.
- **`tags[]` is a multi-namespace bag**, not normalized. Same value can appear as a raw label and as a namespaced tag (e.g. `"text-generation"` and `"pipeline_tag:text-generation"` rarely both appear, but `"safetensors"` may appear both as a raw tag and as `"library:safetensors"`-equivalent). Don't expect uniqueness or a stable schema across categories.
- **Rate-limit policy header is the source of truth.** The 500-per-5-minute number above is observed on the `api` scope as of 2026-05-20. Read `Ratelimit-Policy` on each response in case HF changes it — don't hardcode the window.
- **No residential proxy required, no stealth required.** `browse cloud fetch <url>` (the bare HTTP path) works fine — no need to spin up a stealth session unless you're also doing browser interactions in the same flow. This is a cost win: a single `fetch` call costs ~$0 vs. ~$0.01–0.05 for a full session.
- **`huggingface_hub` Python SDK is the official client** (`from huggingface_hub import HfApi; HfApi().list_models(sort="createdAt", direction=-1, limit=50)`). It wraps this exact endpoint with auth/retry/typing. Skill consumers who can run Python should prefer it for ergonomic typed results; agents driving from a sandbox without Python should use the raw HTTP path above.

## Expected Output

```json
{
  "query": {
    "sort": "createdAt",
    "direction": -1,
    "limit": 50,
    "filter": "text-generation",
    "library": null,
    "author": null,
    "search": null
  },
  "count": 50,
  "next_cursor_url": "https://huggingface.co/api/models?sort=createdAt&direction=-1&limit=50&filter=text-generation&cursor=eyJfaWQiOnsiJGx0IjoiNmEwZTJlZmM2Mjc4ZDhiMmU2MjNlMTk0In19",
  "models": [
    {
      "id": "sstoica12/UAS_qwen7b_medmcqa_100_alpaca_400_proximity_0_8_diversity_0_19999999999999996",
      "author": "sstoica12",
      "created_at": "2026-05-20T22:00:28.000Z",
      "last_modified": "2026-05-20T22:03:07.000Z",
      "pipeline_tag": "text-generation",
      "library_name": "transformers",
      "tags": [
        "transformers",
        "safetensors",
        "qwen2",
        "text-generation",
        "conversational",
        "arxiv:1910.09700",
        "text-generation-inference",
        "endpoints_compatible",
        "region:us"
      ],
      "downloads": 0,
      "likes": 0,
      "gated": false,
      "private": false,
      "sha": "1993fd1a13a3aebc3cfb2db24c7c8f32f79b52ed",
      "url": "https://huggingface.co/sstoica12/UAS_qwen7b_medmcqa_100_alpaca_400_proximity_0_8_diversity_0_19999999999999996"
    },
    {
      "id": "longtermrisk/Olmo-3-7B-Instruct-replaydistillsftjob-306b1e549725-replay_distillation-a0.3-b0.1-s3407",
      "author": "longtermrisk",
      "created_at": "2026-05-20T22:10:38.000Z",
      "last_modified": "2026-05-20T22:10:44.000Z",
      "pipeline_tag": null,
      "library_name": "transformers",
      "tags": ["transformers", "safetensors", "arxiv:1910.09700", "endpoints_compatible", "region:us"],
      "downloads": 0,
      "likes": 0,
      "gated": false,
      "private": false,
      "url": "https://huggingface.co/longtermrisk/Olmo-3-7B-Instruct-replaydistillsftjob-306b1e549725-replay_distillation-a0.3-b0.1-s3407"
    }
  ]
}
```

Three shapes the caller should be prepared for:

```json
// 1. Normal — array of model objects, plus next cursor URL.
{ "count": 50, "next_cursor_url": "...", "models": [...] }

// 2. End of pagination — empty array, no Link header.
{ "count": 0, "next_cursor_url": null, "models": [] }

// 3. Rate-limited — server returns 429, no JSON body, with Retry-After / Ratelimit headers indicating wait time.
{ "error": "rate_limited", "retry_after_seconds": 187, "ratelimit_remaining": 0 }
```
