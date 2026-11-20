---
name: docs-stagehand-dev-docs-vs-code-auditor-kkiqtm
title: Stagehand Docs vs Code Auditor
description: >-
  Crawl docs.stagehand.dev via its Mintlify llms-full.txt export, resolve the
  linked GitHub source repo (browserbase/stagehand) pinned to a commit SHA, and
  use Cerebras (Qwen3-Coder-480B) to flag drift in function signatures,
  flag/option names, types, and example code. Emits a JSON report with docs URL
  + source file/line citations. Read-only.
website: docs.stagehand.dev
category: developer-tools
tags:
  - docs-audit
  - drift-detection
  - stagehand
  - cerebras
  - mintlify
  - github
  - fetch-only
source: 'browserbase: agent-runtime 2026-05-20'
updated: '2026-05-20'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      Only required when a target docs site has both /llms.txt and
      /llms-full.txt disabled. ~100x cost premium because every page has to be
      rendered + markdown-extracted individually, and syntax-highlighted code
      blocks lose fidelity through snapshot extraction.
  - method: api
    rationale: >-
      GitHub api.github.com is used minimally — one call for repo metadata + one
      recursive tree call. Source file content is pulled from
      raw.githubusercontent.com (no rate limit). Cerebras' OpenAI-compatible
      chat-completions API is the comparison layer.
verified: false
proxies: false
---
# Stagehand Docs vs Code Auditor

## Purpose

Audit a published documentation site against its GitHub source repository and emit a structured drift report: function signatures, flag/option names, type definitions, and example code blocks in docs that no longer match what's actually exported from the code. Default target is [docs.stagehand.dev](https://docs.stagehand.dev) (Mintlify-hosted) paired with [`browserbase/stagehand`](https://github.com/browserbase/stagehand) on GitHub, but the workflow generalises to any Mintlify-style docs site whose owner publishes both `llms.txt` and a discoverable repo link. Comparison runs on Cerebras for fast inference (Qwen3-Coder-480B at ~2000 tok/s). Each finding is cited with the docs page URL + heading and the source file path + line range. Read-only — never opens issues, files PRs, or edits docs.

## When to Use

- Pre-release docs sweep before tagging a new SDK version: catch examples that still call the v2 constructor or reference a removed `serverCache` flag.
- Continuous nightly drift monitor: scheduled run that posts a Slack/Linear summary of newly drifted pages.
- Triage of a "docs are wrong" bug report: reproduce + locate the exact source-of-truth that contradicts a docs claim.
- One-shot audit of any docs site (not just Stagehand) whose owner ships an `llms.txt`/`llms-full.txt` and links to a public GitHub repo.

## Workflow

Stagehand's docs are served by Mintlify and expose two LLM-friendly endpoints that make a browser session unnecessary for 99% of this task: `llms.txt` (sitemap with one bullet per page) and `llms-full.txt` (all 100+ pages concatenated into a single 660 KB markdown file, one fetch). The repo is public TypeScript on GitHub with no auth required for read access. Cerebras' OpenAI-compatible API at `api.cerebras.ai/v1/chat/completions` handles the comparison. The entire pipeline is **three HTTP integrations**, no browser, and a converged audit run costs roughly $0.05–$0.30 in Cerebras tokens depending on how many drift candidates exist. Lead with the fetch path; the browser fallback below is only needed if a target docs site has llms.txt disabled.

### 1. Discover the docs-to-LLM-export endpoint

Send a single HEAD/GET against the docs root and read the `X-Llms-Txt` response header (Mintlify sets it explicitly) and/or the `Link: <…>; rel="llms-txt"` Link header.

```bash
browse cloud fetch "https://docs.stagehand.dev/" \
  | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).headers['X-Llms-Txt']"
# → /llms.txt
```

If neither header is present, try `/llms.txt` and `/llms-full.txt` directly — Mintlify exposes both on every doc site by default. A 404 on both is the trigger for the browser fallback.

### 2. Pull the entire docs corpus in one fetch

```bash
browse cloud fetch "https://docs.stagehand.dev/llms-full.txt" \
  | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).content" \
  > /tmp/audit/llms-full.md
# ~660 KB, ~21,000 lines, one HTTP request, no auth, no rate limit
```

Split into per-page chunks. Each page is delimited by a top-level `# {title}` header followed immediately by `Source: <canonical-docs-url>`. For Stainless-generated API pages there's also a second source-of-truth line:

```
# Perform an action
Source: https://docs.stagehand.dev/v3/api-reference/python/perform-an-action

https://app.stainless.com/api/spec/documented/stagehand/openapi.documented.yml post /v1/sessions/{id}/act
…
```

Regex for chunking: `^# (.+?)\nSource: (\S+)\n` (multiline). Per-page metadata to capture: title, canonical URL, optional OpenAPI ref, content body. Stagehand's `llms-full.txt` produces 137 chunks at the time of writing — track the count to detect future doc additions.

Per-page raw markdown is also accessible directly at `<docs-url>.md` (e.g. `https://docs.stagehand.dev/v3/references/act.md`) — use this for spot-checks or when re-auditing a single page after a fix. Mintlify prepends a 3-line "Documentation Index" boilerplate (`> ## Documentation Index ...`) and a `<V3Banner />` MDX import; strip both before comparison or Cerebras will flag them as spurious drift.

### 3. Discover the linked GitHub repo

The repo URL is embedded in `llms.txt`'s `## Optional` section as `[GitHub](https://github.com/{owner}/{repo})`. Parse it with `grep -oE 'github\.com/[^/]+/[^/)]+' /tmp/audit/llms-full.md | head -1` (the same URL also appears in the home-page navigation if `Optional` is missing). For docs.stagehand.dev this resolves to `browserbase/stagehand`.

Pin the audit to a specific commit so reruns are reproducible:

```bash
REPO=browserbase/stagehand
SHA=$(browse cloud fetch "https://api.github.com/repos/$REPO" \
  | node -pe "JSON.parse(JSON.parse(require('fs').readFileSync(0,'utf8')).content).default_branch")
# or pin to a release tag: …/releases/latest → .tag_name
```

### 4. Map the docs IA to source-of-truth files

Stagehand's docs URLs follow a stable hierarchy that maps cleanly to repo paths. Bake this mapping in as a config table; it covers ~95% of pages and changes rarely:

| Docs URL pattern | Source of truth | Notes |
|---|---|---|
| `/v3/references/{method}.md` (act, agent, extract, observe, deeplocator) | `packages/core/lib/v3/types/public/methods.ts` + `options.ts` | Public TS interfaces — canonical signatures |
| `/v3/references/page.md`, `context.md`, `locator.md`, `response.md`, `stagehand.md` | `packages/core/lib/v3/types/public/{page,context,locator,api,index}.ts` | Class/object public surface |
| `/v3/basics/{topic}.md` (act, agent, evals, extract, observe) | Same as `references/*` for signatures + `packages/core/examples/*.ts` for example blocks | Examples should match the canonical example files verbatim or near-verbatim |
| `/v3/api-reference/{lang}/{action}.md` (go/java/python/ruby × 8 endpoints) | `https://app.stainless.com/api/spec/documented/stagehand/openapi.documented.yml` | **Not** the GitHub repo — Stainless OpenAPI YAML is the upstream |
| `/v3/sdk/{go,java,python,ruby}.md` | Separate repos (`browserbase/stagehand-{lang}` if present) or Stainless-generated artifacts; check each SDK page's "GitHub" CTA | Not in the main TS monorepo |
| `/v3/configuration/{topic}.md` | `packages/core/lib/v3/types/public/options.ts` + relevant config files | Browser, models, logging, observability |
| `/v3/integrations/{name}/*.md` | `packages/core/examples/integrations/{name}.ts` when present | Often hand-written; lower drift risk |
| `/v3/migrations/{python,v2}.md` | Hand-written; no machine source of truth | Audit only for stale code blocks |

Enumerate the repo tree once per run via `https://api.github.com/repos/{owner}/{repo}/git/trees/{sha}?recursive=1` (anon, 1 request, returns full file list — current Stagehand tree is 1,229 entries non-truncated, 189 of which sit under `packages/core/lib/`). Use the response to validate every config-table path still exists.

### 5. Fetch source files via the raw CDN

```bash
RAW="https://raw.githubusercontent.com/$REPO/$SHA"
browse cloud fetch "$RAW/packages/core/lib/v3/types/public/methods.ts" > /tmp/audit/methods.ts.json
browse cloud fetch "$RAW/packages/core/lib/v3/types/public/options.ts" > /tmp/audit/options.ts.json
# …
```

`raw.githubusercontent.com` has no anonymous rate limit (vs `api.github.com`'s 60 req/hr cap) and returns files unrendered. Always carry a commit SHA in the URL — `main` will silently drift between fetches. Save each file with its `path` + `content` so downstream citations get real line numbers (split on `\n` and 1-index).

For OpenAPI-backed pages, fetch the YAML once and parse it:

```bash
browse cloud fetch "https://app.stainless.com/api/spec/documented/stagehand/openapi.documented.yml" > /tmp/audit/openapi.yml.json
# Compare each docs page's payload schema against the matching paths.<method>.<endpoint>.requestBody / responses block.
```

### 6. Run drift comparison on Cerebras

Cerebras' OpenAI-compatible Chat Completions API at `https://api.cerebras.ai/v1/chat/completions` is the fast/cheap inference layer. Set `CEREBRAS_API_KEY` and use `qwen-3-coder-480b` (best on TS/Python signature matching) or `llama-3.3-70b` (cheaper, still works for flag-name drift). Both stream at >1500 tokens/sec.

```bash
curl -s https://api.cerebras.ai/v1/chat/completions \
  -H "Authorization: Bearer $CEREBRAS_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$(node -e '
    const fs = require("fs");
    const docsChunk = fs.readFileSync("/tmp/audit/chunks/references-act.md","utf8");
    const srcMethods = fs.readFileSync("/tmp/audit/methods.ts","utf8");
    const srcOptions = fs.readFileSync("/tmp/audit/options.ts","utf8");
    console.log(JSON.stringify({
      model: "qwen-3-coder-480b",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are a documentation drift auditor. You will be given (a) a docs page describing a TypeScript API and (b) the canonical source files. Identify ONLY drift: signatures, flag/option names, types, or example code in the docs that no longer match the source. Ignore prose-level paraphrases. Return strict JSON: { findings: [{ severity, kind, doc_url, doc_anchor, doc_excerpt, source_file, source_line_start, source_line_end, source_excerpt, explanation, suggested_fix }] }. If no drift, return { findings: [] }." },
        { role: "user", content: `<docs-page>\n${docsChunk}\n</docs-page>\n<source file="packages/core/lib/v3/types/public/methods.ts">\n${srcMethods}\n</source>\n<source file="packages/core/lib/v3/types/public/options.ts">\n${srcOptions}\n</source>` }
      ]
    }));
  ')"
```

Per-page request shape: one system prompt fixing the JSON contract, one user message containing the docs chunk plus all relevant source files (methods + options + the matching example, ~30–50 KB total per call). At Cerebras pricing (~$0.60/$2.00 per million input/output tokens for Qwen3-Coder), a full Stagehand audit of ~80 auditable pages costs $0.05–$0.30. Run pages in parallel — Cerebras handles 30+ concurrent connections without throttling, so wall-clock for the whole audit is typically <60s.

**Findings contract** — pin the model to this exact JSON schema and reject responses that don't parse. `kind` ∈ `{signature, flag-name, type, example, removed-symbol, added-symbol, deprecated}`; `severity` ∈ `{high, medium, low}`. The `source_line_start`/`source_line_end` fields are the value of citations — without them the report isn't actionable.

### 7. Emit the report

Aggregate per-page findings into a top-level JSON document (see Expected Output) and a derived Markdown rendering. Cite every finding with: docs URL + heading slug, source file + line range, and the exact pre/post snippet. Group by severity, then by docs section. Include a header block with the audit run's commit SHA, docs `llms-full.txt` byte length, and Cerebras model + temperature used so the run is reproducible.

### Browser fallback (only if `llms.txt` and `llms-full.txt` both return 404)

Some docs sites disable Mintlify's LLM endpoints. The slow path:

1. `browse cloud sessions create --keep-alive` (no `--verified`, no `--proxies` — Mintlify/Vercel docs are bare-friendly).
2. `browse open <docs-root> --remote`, then enumerate the left-nav links via `browse snapshot` → `browse eval "document.querySelectorAll('nav a[href^=\\"/\\"]').length"`.
3. For each unique path, navigate and `browse get markdown body`. Strip site chrome (nav, footer, "Was this helpful?" widget) via simple selector-based filtering.
4. Resume from step 3 of the fetch path (discover GitHub link from any "Edit on GitHub" CTA or footer).

Cost premium: ~100× the fetch path (one full browser render per page vs one batched fetch), and the snapshot/markdown extraction is lossy on syntax-highlighted code blocks — examples may lose backtick fencing. Use only as a last resort.

## Site-Specific Gotchas

- **Mintlify exposes `llms.txt` + `llms-full.txt` by default.** Both are emitted on every Mintlify site (confirmed via the `X-Llms-Txt: /llms.txt` response header and `Link: </llms.txt>; rel="llms-txt", </llms-full.txt>; rel="llms-full-txt"`). For docs.stagehand.dev specifically, `llms-full.txt` returns 200 with `Content-Type: text/plain; charset=utf-8`, 660,106 bytes, 21,091 lines, 137 page chunks. **Always prefer this to crawling.**
- **Per-page `.md` raw export.** Every Mintlify page has a sibling `.md` URL — `/v3/references/act` ⇄ `/v3/references/act.md`. The `.md` version is raw MDX (still contains `<V3Banner />`, `<Tabs>`, `<Card>`, `<CardGroup>` components) — they're not stripped, just delivered unrendered. Treat MDX components as comments for drift purposes.
- **Boilerplate header on every per-page `.md` fetch.** Mintlify prepends `> ## Documentation Index\n> Fetch the complete documentation index at: https://docs.stagehand.dev/llms.txt\n> Use this file to discover all available pages before exploring further.\n\n` to every `.md` response. Strip the first 3 blockquoted lines + the following blank line before comparison.
- **`llms-full.txt` does NOT contain this boilerplate** — it's the cleaner choice for bulk audits. The boilerplate appears only on individual `.md` fetches.
- **Stainless-generated API pages have two source-of-truth signals.** Pages under `/v3/api-reference/{lang}/...` are auto-generated from a Stainless OpenAPI YAML; the page body contains a literal source line of the form `https://app.stainless.com/api/spec/documented/stagehand/openapi.documented.yml {method} {path}`. For drift on these pages, audit against the YAML, **not** against the GitHub TypeScript source — the TS source is itself generated downstream of the YAML and won't catch upstream YAML/docs drift.
- **Multi-language repos live elsewhere.** The `browserbase/stagehand` repo is TypeScript-only (the `packages/` monorepo has `cli` + `core`, no `sdk-{go,java,python,ruby}` directories). Go/Java/Python/Ruby SDK auditing requires resolving each `/v3/sdk/{lang}.md` page's "GitHub" CTA to its own repo. As of 2026-05-20 these are Stainless-generated and may live under `browserbase/stagehand-{lang}` or be private — handle the resolve-fail gracefully and emit a "source repo not discoverable" warning rather than dropping those pages silently.
- **`api.github.com` has a 60-request anonymous rate limit** (per `X-Ratelimit-Limit: 60`). Use it only for repo metadata + the single recursive tree call. Pull source files from `raw.githubusercontent.com` instead — anonymous, unrate-limited, CDN-cached, and significantly faster.
- **Always pin to a commit SHA, never `main`.** Reruns against `main` produce diff churn from intervening commits and make findings non-reproducible. Resolve `main` → SHA once per run and substitute into all raw URLs. Stagehand pushes to `main` multiple times per day.
- **Tree `truncated: true` flag.** For repos > ~7,000 entries, the GitHub `git/trees/...?recursive=1` response sets `truncated: true` and silently drops files. Stagehand's tree is currently 1,229 entries (not truncated) but check this every run — when truncated, page through subtrees individually.
- **Docs version-prefix migrations.** Stagehand docs use `/v3/...` paths; legacy `/v2/...` and bare-path pages also exist for back-compat. Audit only the version that matches the repo's current major (read `version` from `packages/core/package.json` — currently `"3.4.0"`, so audit `/v3/...`). Auditing v2 docs against v3 source produces a tidal wave of false positives.
- **Cerebras hard caps at 32K-64K input tokens depending on model.** Pages with very long example sections (e.g. the migration guides) plus full source files can exceed this. Chunk the source by relevant exported symbol or split the audit into two calls (signatures-only, examples-only) when the prompt + context tops 60K tokens.
- **Cerebras free tier is rate-limited; paid tier needs an explicit org**. If `CEREBRAS_API_KEY` returns 401/429, drop back to Groq (`api.groq.com/openai/v1`, similar OpenAI-compatible surface, slower but supports Llama and Qwen-coder variants) — the request shape is identical, only the base URL and model IDs differ.
- **Read-only.** This skill never opens GitHub issues, files PRs, edits docs, or POSTs to any Mintlify admin endpoint. Drift remediation is a downstream human/agent task.

## Expected Output

```json
{
  "audit_run": {
    "docs_site": "docs.stagehand.dev",
    "docs_corpus": {
      "url": "https://docs.stagehand.dev/llms-full.txt",
      "fetched_at": "2026-05-20T23:21:13Z",
      "byte_length": 660106,
      "page_count": 137
    },
    "source_repo": {
      "owner": "browserbase",
      "repo": "stagehand",
      "default_branch": "main",
      "pinned_sha": "8c2f1a3e4d5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d",
      "sdk_version": "3.4.0"
    },
    "openapi_spec": "https://app.stainless.com/api/spec/documented/stagehand/openapi.documented.yml",
    "comparison": {
      "provider": "cerebras",
      "model": "qwen-3-coder-480b",
      "temperature": 0,
      "concurrent_pages": 16,
      "wall_clock_seconds": 54.2,
      "estimated_cost_usd": 0.18
    }
  },
  "summary": {
    "pages_audited": 132,
    "pages_skipped": 5,
    "pages_with_drift": 7,
    "findings_by_severity": { "high": 2, "medium": 5, "low": 4 },
    "findings_by_kind": {
      "signature": 1,
      "flag-name": 3,
      "type": 1,
      "example": 4,
      "removed-symbol": 2,
      "added-symbol": 0,
      "deprecated": 0
    }
  },
  "findings": [
    {
      "severity": "high",
      "kind": "flag-name",
      "doc_url": "https://docs.stagehand.dev/v3/references/act",
      "doc_anchor": "actoptions-interface",
      "doc_excerpt": "interface ActOptions {\n  model?: ModelConfiguration;\n  variables?: Record<string, VariableValue>;\n  timeout?: number;\n  page?: PlaywrightPage | PuppeteerPage | PatchrightPage | Page;\n  serverCache?: boolean;\n}",
      "source_file": "packages/core/lib/v3/types/public/options.ts",
      "source_line_start": 142,
      "source_line_end": 151,
      "source_excerpt": "export interface ActOptions {\n  model?: ModelConfiguration;\n  variables?: Record<string, VariableValue>;\n  timeoutMs?: number;\n  page?: PlaywrightPage | PuppeteerPage | PatchrightPage | Page;\n  cache?: boolean;\n}",
      "explanation": "Docs reference `timeout` and `serverCache`; source renamed them to `timeoutMs` and `cache` in commit 8c2f1a3.",
      "suggested_fix": "Rename `timeout` → `timeoutMs` and `serverCache` → `cache` in the ActOptions block at /v3/references/act.md."
    },
    {
      "severity": "medium",
      "kind": "example",
      "doc_url": "https://docs.stagehand.dev/v3/basics/extract",
      "doc_anchor": "schema-example",
      "doc_excerpt": "const result = await stagehand.extract({ instruction: '...', schema: z.object({...}) })",
      "source_file": "packages/core/examples/v3-example.ts",
      "source_line_start": 24,
      "source_line_end": 28,
      "source_excerpt": "const result = await stagehand.extract({\n  instruction: '...',\n  schema: z.object({...}),\n  modelName: 'anthropic/claude-sonnet-4-6'\n})",
      "explanation": "Docs example omits the `modelName` field which is now required in the canonical example.",
      "suggested_fix": "Add `modelName` parameter to extract example, matching v3-example.ts:24-28."
    }
  ],
  "skipped_pages": [
    {
      "doc_url": "https://docs.stagehand.dev/v3/sdk/ruby",
      "reason": "source_repo_unresolved",
      "detail": "Ruby SDK GitHub CTA points to https://github.com/browserbase/stagehand-ruby which returns 404 (private or not yet published)."
    }
  ]
}
```

Branch shapes the report can take:

```json
// No drift — clean run
{ "audit_run": { ... }, "summary": { "pages_audited": 132, "pages_with_drift": 0, ... }, "findings": [] }

// Docs site has no llms.txt and no /llms-full.txt — browser-fallback path used
{ "audit_run": { "docs_corpus": { "url": "browser-snapshot://...", "fetched_at": "...", "byte_length": null, "page_count": 84, "method": "browser-fallback" }, ... }, ... }

// GitHub repo link not discoverable in docs — partial run
{ "audit_run": { "source_repo": null, ... }, "summary": { "pages_audited": 0, "pages_with_drift": 0, "fatal": "no_source_repo_discovered" }, "findings": [] }
```
