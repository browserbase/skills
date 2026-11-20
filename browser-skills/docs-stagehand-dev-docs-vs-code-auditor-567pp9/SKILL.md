---
name: docs-stagehand-dev-docs-vs-code-auditor-567pp9
title: Docs-vs-Code Drift Auditor
description: >-
  Crawl a docs site (default docs.stagehand.dev), discover its linked GitHub
  repo, and flag drift between documented signatures/flags/examples and the
  actual source — citing both doc and code by file and line. Uses Cerebras Cloud
  (Qwen3-Coder-480B / Llama-3.3-70B) for fast structured diffing.
website: docs.stagehand.dev
category: developer-tools
tags:
  - docs
  - audit
  - github
  - cerebras
  - mintlify
  - stagehand
  - drift
source: 'browserbase: agent-runtime 2026-05-21'
updated: '2026-05-21'
recommended_method: hybrid
alternative_methods:
  - method: api
    rationale: >-
      Pure-API path is preferred when the docs site is Mintlify-hosted:
      /llms.txt enumerates pages, /{path}.md returns the rendered markdown,
      raw.githubusercontent.com returns source files with stable line offsets,
      and Cerebras Cloud does the LLM diffing — no headless browser required.
  - method: browser
    rationale: >-
      Fallback only — required when the docs site is not Mintlify (no /llms.txt,
      no .md page twins) and the repo link must be discovered from rendered HTML
      navbar/footer anchors.
verified: true
proxies: true
---
# Docs-vs-Code Drift Auditor (Stagehand)

## Purpose

Audit a documentation site against its linked source repository and emit a drift report — flag signatures, options/flags, code examples, and error/return-type descriptions in the docs that disagree with what's actually in the source. Defaults to `docs.stagehand.dev` ↔ `github.com/browserbase/stagehand`, but the workflow generalises to any Mintlify-hosted docs site whose `llms.txt` lists a GitHub repo. Read-only on both surfaces — never edits a doc page, opens a PR, or modifies the repo. Cerebras Cloud (OpenAI-compatible, ~2000 tok/s on Llama-3.3-70B / Qwen3-Coder-480B) is used for fast structured diffing because the doc↔code prompts are short, high-volume, and embarrassingly parallel.

## When to Use

- Pre-release sanity check: "Does the v3 docs still match `main` after this week's PRs?"
- Bug-triage forensics: a user reports an option that doesn't exist — is the option real, or did the docs lie?
- Doc-quality dashboards: weekly cron emitting a `drift_count_by_page` time series.
- Migration / SDK-rev planning: which docs pages need rewrites when a public type changes?
- Any other Mintlify docs site that exposes `/llms.txt` and links a public GitHub repo — Resend, Mintlify itself, Trigger.dev, Cal.com, Stainless-generated docs, etc.

## Workflow

Mintlify auto-publishes a machine-readable inventory of every doc page at `https://{docs-site}/llms.txt` (and a single concatenated body at `/llms-full.txt`), and serves a `.md`-suffixed view of every page (`/v3/references/act.md`) with the rendered Markdown. The GitHub repo is listed under the `## Optional` section of `llms.txt`. **Do not crawl the rendered HTML site** — every page has a `.md` twin that costs ~3× fewer bytes and parses cleanly. The optimal pipeline is API + raw-file + Cerebras LLM diffing; the headless browser is only required as a fallback for non-Mintlify sites or when `llms.txt` is missing.

### 1. Discover docs inventory + linked repo

```bash
curl -s https://docs.stagehand.dev/llms.txt > inventory.txt
# Parse: bulleted Markdown list of `- [Title](url.md): description`.
# Repo URL lives in the trailing `## Optional` section (line begins with `- [GitHub](`).
REPO_URL=$(grep -oE 'https://github.com/[^)]+' inventory.txt | grep -v releases | head -1)
# → https://github.com/browserbase/stagehand
OWNER=$(echo "$REPO_URL" | cut -d/ -f4)
REPO=$(echo  "$REPO_URL" | cut -d/ -f5)
```

If `llms.txt` 404s: fall back to crawling the docs site for an outbound `github.com/<owner>/<repo>` anchor (typically in the navbar / footer). Mintlify-hosted sites also expose the repo via `https://{docs-site}/_mintlify/api/config` on some deployments — check before defaulting to a full crawl.

### 2. Enumerate target doc pages

Filter the `llms.txt` inventory to the surface you actually care about. For Stagehand the high-signal sections are:

- `/v3/references/*.md` — the canonical API reference (10 pages, ~150 KB total)
- `/v3/sdk/*.md` — per-language SDK overviews
- `/v3/api-reference/{go,python,ruby,java}/*.md` — Stainless-generated, sourced from `openapi.documented.yml` (see step 5 — these are audited differently)
- `/v3/configuration/*.md`, `/v3/basics/*.md`, `/v3/best-practices/*.md` — narrative docs containing inline code samples

```bash
node -e "
  const lines = require('fs').readFileSync('inventory.txt','utf8').split('\n');
  const re = /- \[(.+?)\]\((https?:[^)]+\.md)\)/;
  for (const l of lines) {
    const m = l.match(re);
    if (m && m[2].includes('/v3/references/')) console.log(m[2]);
  }
" > targets.txt
```

### 3. Fetch each doc as `.md`

```bash
mkdir -p doc-md
while read -r url; do
  slug=$(echo "$url" | sed 's|.*/||;s|\.md$||')
  curl -s "$url" > "doc-md/$slug.md"
done < targets.txt
```

Two parallel sources of the same content are available — pick **one** for each audit run, don't mix:
- **Rendered**: `https://docs.stagehand.dev/v3/references/act.md` (Mintlify's auto-generated MD twin).
- **Raw source**: `https://raw.githubusercontent.com/browserbase/stagehand/main/packages/docs/v3/references/act.mdx` (the MDX before Mintlify's MD transform). The raw MDX gives **stable line numbers** for citation; the rendered MD has clean prose but no line numbers tied to anything checked into the repo.

For drift reports with file/line citations, **fetch the raw MDX from GitHub**. The audit becomes "docs MDX in `packages/docs/v3/...` vs. code TS in `packages/core/lib/v3/...`" — a pure intra-repo diff.

### 4. Resolve docs page → code source file(s)

For Stagehand the mapping is mechanical:

| Docs MDX | Primary code source of truth | Implementation handler |
|---|---|---|
| `packages/docs/v3/references/stagehand.mdx` | `packages/core/lib/v3/types/public/options.ts` (`V3Options`) | `packages/core/lib/v3/v3.ts` |
| `packages/docs/v3/references/act.mdx` | `packages/core/lib/v3/types/public/options.ts` (`ActOptions`, `Action`, `VariableValue`, `ModelConfiguration`) | `packages/core/lib/v3/handlers/actHandler.ts` |
| `packages/docs/v3/references/agent.mdx` | `packages/core/lib/v3/types/public/agent.ts` | `packages/core/lib/v3/agent/` |
| `packages/docs/v3/references/extract.mdx` | `packages/core/lib/v3/types/public/options.ts` (`ExtractOptions`) | `packages/core/lib/v3/handlers/extractHandler.ts` |
| `packages/docs/v3/references/observe.mdx` | `packages/core/lib/v3/types/public/options.ts` (`ObserveOptions`) | `packages/core/lib/v3/handlers/observeHandler.ts` |
| `packages/docs/v3/references/page.mdx` | `packages/core/lib/v3/types/public/page.ts` | `packages/core/lib/v3/understudy/` |
| `packages/docs/v3/references/locator.mdx`, `deeplocator.mdx` | `packages/core/lib/v3/types/public/locator.ts` | `packages/core/lib/v3/understudy/` |
| `packages/docs/v3/references/response.mdx` | `packages/core/lib/v3/types/public/api.ts` | n/a |
| `packages/docs/v3/references/context.mdx` | `packages/core/lib/v3/types/public/context.ts` | n/a |
| `/v3/api-reference/{lang}/*.md` (any language) | OpenAPI spec at `https://app.stainless.com/api/spec/documented/stagehand/openapi.documented.yml` | Stainless-generated; not human-authored |

For a **generic** Mintlify site where the mapping isn't pre-known, do one of:
- Look for `import` / `export` symbol names in the doc's TypeScript fences (e.g. `interface ActOptions`, `class Stagehand`), then resolve via `curl -s 'https://api.github.com/search/code?q=interface+ActOptions+repo:OWNER/REPO'` — **requires a `GITHUB_TOKEN`**, unauthenticated code-search returns `401`.
- For a monorepo, list the repo tree (`/repos/OWNER/REPO/git/trees/main?recursive=1`) and `grep` for the symbol name to derive the file path locally.

### 5. Fetch the corresponding source file(s)

```bash
RAW=https://raw.githubusercontent.com/$OWNER/$REPO/main
mkdir -p src
curl -s "$RAW/packages/core/lib/v3/types/public/options.ts"  > src/options.ts
curl -s "$RAW/packages/core/lib/v3/handlers/actHandler.ts"   > src/actHandler.ts
# …repeat per row in step-4 table.
```

`raw.githubusercontent.com` returns the file with **stable line offsets** — no rate-limit on small repos, no `Authorization` header needed. Capture `git rev-parse` of `main` once at the start of the audit (`/repos/OWNER/REPO/branches/main` → `commit.sha`) and pin every URL to that SHA so the audit is reproducible: `https://raw.githubusercontent.com/$OWNER/$REPO/$SHA/...`. Mixing `main` and a pinned SHA across the same run will produce phantom drift on the next race-conditioned push.

### 6. Diff with Cerebras

Cerebras Cloud is OpenAI-compatible — drop-in `openai` SDK works. Set `CEREBRAS_API_KEY` in the environment. The endpoint is `https://api.cerebras.ai/v1/chat/completions`. Recommended models for this task:

- `qwen-3-coder-480b` — best signal-to-noise on TypeScript interface drift, ~1500 tok/s.
- `llama-3.3-70b` — cheaper, faster (~2200 tok/s), good enough for narrative-prose drift.

Pair each `(doc_snippet, code_snippet)` and ask for **structured JSON output** with `response_format: { type: "json_schema", ... }`. Cerebras enforces the schema server-side. One call per `(doc_section × code_symbol)` pair — keep prompts ≤ 8K tokens by chunking; full files past that size hurt accuracy.

```bash
cat <<'PROMPT' > prompt.txt
You are auditing a public SDK reference doc against its TypeScript source.

DOC (MDX, lines 1-N):
{{doc_mdx_with_line_numbers}}

CODE (TypeScript, lines 1-N):
{{code_ts_with_line_numbers}}

Identify every drift between the doc and the code. Categories:
  - signature: parameter list, types, return type, optional/required mismatch
  - flag:      option/field documented but absent in code, or vice-versa
  - example:   code sample in doc would not compile against current types
  - naming:    parameter name in doc differs from code
  - error:     thrown error class documented but not present (or missing)

For each drift, return:
  { category, severity: low|med|high, doc_path, doc_line_start, doc_line_end,
    code_path, code_line_start, code_line_end, summary, evidence_doc, evidence_code }
PROMPT

curl -s https://api.cerebras.ai/v1/chat/completions \
  -H "Authorization: Bearer $CEREBRAS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen-3-coder-480b",
    "messages": [{"role":"user","content":"…filled prompt…"}],
    "response_format": {"type":"json_schema","json_schema":{"name":"drift","schema":{
      "type":"object","properties":{"drifts":{"type":"array","items":{
        "type":"object","required":["category","severity","doc_path","doc_line_start",
          "code_path","code_line_start","summary"],"properties":{
          "category":{"type":"string","enum":["signature","flag","example","naming","error"]},
          "severity":{"type":"string","enum":["low","med","high"]},
          "doc_path":{"type":"string"},"doc_line_start":{"type":"integer"},
          "doc_line_end":{"type":"integer"},"code_path":{"type":"string"},
          "code_line_start":{"type":"integer"},"code_line_end":{"type":"integer"},
          "summary":{"type":"string"},"evidence_doc":{"type":"string"},
          "evidence_code":{"type":"string"}}}}}}}},
    "temperature": 0
  }'
```

For per-language API-reference pages (`/v3/api-reference/{go,python,ruby,java}/*.md`), audit against the OpenAPI YAML instead of the TypeScript core. Fetch `https://app.stainless.com/api/spec/documented/stagehand/openapi.documented.yml` once, slice the relevant operation, and feed `(doc_md, openapi_operation_yaml)` to Cerebras with a parallel prompt that maps the same drift categories onto OpenAPI fields (`parameters`, `requestBody`, `responses`, `tags`).

### 7. Aggregate + cite

Concatenate the per-page `drifts[]` arrays, group by `severity`, and emit the report shape in **Expected Output**. Every drift entry **must** carry both a `doc_path:line` and `code_path:line` citation — that's the contract. Cite the GitHub blob URL with `#L<start>-L<end>` for human-clickable evidence (`https://github.com/$OWNER/$REPO/blob/$SHA/packages/.../act.mdx#L42-L58`).

### Browser fallback

If the target docs site is **not** Mintlify-hosted (no `/llms.txt`, no `.md` page twins), fall back to scripted browsing — but only after confirming the absence:

```bash
sid=$(browse cloud sessions create --keep-alive --verified --proxies \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$sid"
browse open "https://{docs-site}/" --remote
browse get markdown body --remote                 # rendered prose only
browse snapshot --remote                          # for outbound github.com anchor refs
browse cloud sessions update "$sid" --status REQUEST_RELEASE
```

`browse get markdown body` returns enough text to enumerate the sitemap (each page's nav links + headings) and pull inline code fences, but it loses MDX directive structure (`<ParamField>`, `<ResponseField>`, `<Expandable>`). Stick to `.md` twins whenever they exist — `curl https://{docs-site}/{path}.md` is ~100× cheaper and structurally cleaner.

## Site-Specific Gotchas

- **Mintlify exposes `llms.txt` + `llms-full.txt` + `.md` page twins on every deployment.** This is the cheat code for any docs-vs-code audit. Look for `X-Llms-Txt: /llms.txt` and `Link: ...rel="llms-txt"` in the response headers of the root URL to confirm a site is Mintlify-hosted before falling back to browser crawling. As of 2026-05-21, `docs.stagehand.dev`, `mintlify.com/docs`, `resend.com/docs`, `trigger.dev/docs`, and `mastra.ai/docs` all expose this surface; non-Mintlify docs (e.g. Docusaurus, MkDocs, Nextra) generally do not.
- **`llms.txt` lists the GitHub repo under `## Optional`, not at the top.** Stagehand's entry is `- [GitHub](https://github.com/browserbase/stagehand)`. There's also `- [Changelog](https://github.com/browserbase/stagehand/releases)` on the same line set — when grepping for the repo URL, exclude `/releases`, `/issues`, `/pulls`, `/discussions`.
- **Rendered `.md` vs. raw `.mdx` are not byte-equivalent.** Mintlify's MD transform strips frontmatter, evaluates some MDX directives (`<Tabs>`, `<Tab>`, `<ResponseField>`) into nested headings, and drops imports (`export const V3Banner = () => null;`). The rendered `.md` is human-prose-equivalent; the raw `.mdx` is *line-equivalent to the repo*. **Use raw MDX for citations** — line numbers from the `.md` view do not back-reference cleanly to anything in `packages/docs/`.
- **GitHub unauthenticated rate limit = 60 req/hr per IP.** A full Stagehand audit needs ~10 docs MDX files + ~12 TS files + 1 tree listing ≈ 24 requests. You can fit ~2 unauthenticated audits per hour. **Set `GITHUB_TOKEN`** (5000 req/hr) for any serious workflow — pass it as `Authorization: Bearer $GITHUB_TOKEN` to both `api.github.com` and `raw.githubusercontent.com`. The same token also unlocks `/search/code` (returns 401 unauthenticated), which is mandatory if you can't pre-derive the docs→code mapping.
- **`api.github.com/repos/.../contents/<path>` 404s when `<path>` is wrong by even one segment.** `contents/types` returned 404; the actual path is `contents/packages/core/lib/v3/types`. Always start from the repo root listing and walk down — don't guess.
- **Stagehand is a pnpm monorepo.** Code lives under `packages/core/lib/v3/`, *not* `src/`, `lib/`, or `types/` at the root. Most TypeScript SDKs published as `@org/pkg` have a flatter layout; do not hard-code `src/` as the entry. Look at `package.json#workspaces` or `pnpm-workspace.yaml` first.
- **`/v3/api-reference/*` pages are Stainless-generated and exist 4× per concept** (Go, Java, Python, Ruby) — same operation, different language flavour. Auditing them against `packages/core/lib/v3/` is wrong; the source of truth is `openapi.documented.yml`. Generated SDK packages live under `https://github.com/browserbase/stagehand-{go,java,python,ruby}` (separate repos) and are themselves Stainless-emitted from the same YAML — auditing them is largely tautological.
- **Pin to a commit SHA, not `main`.** Between `step 1` (inventory fetch) and `step 5` (raw file fetch), `main` can move. Capture the head SHA at audit start and use it in every `raw.githubusercontent.com` URL. Without pinning, you get phantom drift entries on the next push that don't reproduce.
- **Cerebras structured-output JSON schema is enforced server-side.** Returns `400` (not silent truncation) if the model's first attempted JSON doesn't match. Keep schemas shallow — nested `oneOf` / `anyOf` lowers the success rate noticeably on `llama-3.3-70b`; `qwen-3-coder-480b` handles them better but is slower.
- **Cerebras context window is 65K tokens on most models, 131K on `gpt-oss-120b`.** A full Stagehand `agent.mdx` (27 KB ≈ 9K tokens) + `agent.ts` (~25 KB ≈ 8K tokens) = ~17K tokens — comfortable. `page.mdx` (31 KB) + `page.ts` will hit ~25K tokens and start losing recall in the back half. Chunk by `### {section}` heading in the MDX and pair each chunk with the matching `interface` / `class` block from the TS.
- **MDX example blocks (`<Tab title="Basic Usage">`) commonly drift from current types.** This is the highest-signal category in practice — code examples don't have a CI typecheck pinning them to the source, so they go stale fastest. Always include `<Tabs>` / `<Tab>` contents in the doc snippet sent to Cerebras.
- **Don't conflate "missing from docs" with "missing from code".** Stagehand's `V3Options` interface has ~30 fields (`apiKey`, `projectId`, `keepAlive`, `enableCaching`, `verbose`, `localBrowserLaunchOptions`, etc.); the `stagehand.mdx` reference may intentionally hide internal/experimental ones (`sessionId` is documented as "Optional external session identifier" but commented "fall back to instance id", which suggests it's quasi-public). Direction of drift matters — flag both, but tag `severity: low` when the field is internal or marked `@internal` / `@deprecated` in TSDoc.

## Expected Output

```json
{
  "audit": {
    "docs_site": "docs.stagehand.dev",
    "docs_inventory_url": "https://docs.stagehand.dev/llms.txt",
    "repo": "browserbase/stagehand",
    "commit_sha": "765861c04c46851663919277f330d27a87bae823",
    "audited_at": "2026-05-21T17:15:00Z",
    "pages_audited": 10,
    "code_files_referenced": 14,
    "diffing_model": "qwen-3-coder-480b",
    "total_cerebras_tokens": 184320,
    "wall_clock_seconds": 47
  },
  "summary": {
    "drift_count": 7,
    "by_severity": { "high": 1, "med": 3, "low": 3 },
    "by_category": { "signature": 2, "flag": 2, "example": 2, "naming": 1, "error": 0 }
  },
  "drifts": [
    {
      "category": "signature",
      "severity": "high",
      "doc_path": "packages/docs/v3/references/act.mdx",
      "doc_line_start": 24,
      "doc_line_end": 28,
      "code_path": "packages/core/lib/v3/types/public/options.ts",
      "code_line_start": 142,
      "code_line_end": 148,
      "summary": "Docs show `act(instruction: string, options: ActOptions)` returning `Promise<ActResult>`, but the source declares `Promise<ActResult | undefined>` (introduced in 3.4.0).",
      "evidence_doc": "await stagehand.act(instruction: string, options: ActOptions): Promise<ActResult>",
      "evidence_code": "act(instruction: string, options?: ActOptions): Promise<ActResult | undefined>;",
      "doc_url":  "https://github.com/browserbase/stagehand/blob/765861c.../packages/docs/v3/references/act.mdx#L24-L28",
      "code_url": "https://github.com/browserbase/stagehand/blob/765861c.../packages/core/lib/v3/types/public/options.ts#L142-L148"
    },
    {
      "category": "flag",
      "severity": "med",
      "doc_path": "packages/docs/v3/references/act.mdx",
      "doc_line_start": 119,
      "doc_line_end": 119,
      "code_path": "packages/core/lib/v3/types/public/options.ts",
      "code_line_start": 178,
      "code_line_end": 192,
      "summary": "Docs document `ActOptions.serverCache: boolean` but the field is named `cache` in the source (alias removed in 3.3.0).",
      "evidence_doc": "<ParamField path=\"serverCache\" type=\"boolean\" optional>",
      "evidence_code": "cache?: boolean; // Override the instance-level serverCache setting."
    },
    {
      "category": "example",
      "severity": "med",
      "doc_path": "packages/docs/v3/references/act.mdx",
      "doc_line_start": 247,
      "doc_line_end": 256,
      "code_path": "packages/core/lib/v3/types/public/options.ts",
      "code_line_start": 92,
      "code_line_end": 96,
      "summary": "Example uses `{ env: \"BROWSERBASE\" }` constructor shape but no longer constructs `Stagehand` directly — v3 requires `await Stagehand.init({ env })`.",
      "evidence_doc": "const stagehand = new Stagehand({ env: \"BROWSERBASE\" });\\nawait stagehand.init();",
      "evidence_code": "static async init(options: V3Options): Promise<Stagehand>"
    }
  ]
}
```

A run that finds **zero drift** still emits the envelope above with `drifts: []` and `summary.drift_count: 0` — absence-of-drift is a useful signal for CI gating. If the workflow could not complete (e.g. `llms.txt` 404 and the browser fallback also failed to find a repo link), emit:

```json
{
  "audit": { "docs_site": "...", "audited_at": "..." },
  "error": {
    "stage": "discovery | enumeration | source_resolution | diffing",
    "reason": "human-readable failure description",
    "evidence": "first ~500 chars of the offending response, or the URL that 4xx'd"
  }
}
```
