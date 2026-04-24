# Company Research — Workflow Reference

## Discovery Batch JSON Schema

File: `/tmp/company_discovery_batch_{N}.json`

`bb search --output` writes a JSON object (NOT a flat array):

```json
{
  "requestId": "abc123",
  "query": "AI data extraction startups",
  "results": [
    { "url": "https://example.com", "title": "Example Corp", "author": null, "publishedDate": null },
    ...
  ]
}
```

The `list_urls.mjs` script handles both formats (flat array and `{ results: [...] }`).

## Company Research Markdown Format

File: `{OUTPUT_DIR}/{company-slug}.md`

Where `{OUTPUT_DIR}` is the per-run directory on the user's Desktop (e.g., `~/Desktop/acme_research_2026-04-23/`). The main agent sets this up in Step 0 and passes the full literal path to every subagent.

Each research subagent writes one markdown file per company. See `references/example-research.md` for the full template.

**YAML frontmatter fields** (used for report + CSV compilation):
- `company_name` (required)
- `website` (required)
- `product_description`
- `industry`
- `target_audience`
- `key_features` (pipe-separated: `feature1 | feature2 | feature3`)
- `icp_fit_score` (integer 1-10, required)
- `icp_fit_reasoning`
- `employee_estimate`
- `funding_info`
- `headquarters`

**Body sections**:
- `## Product` — what they do
- `## Research Findings` — evidence with confidence levels and sources

**CRITICAL**: Use consistent field names across all files. The `compile_report.mjs` script reads these fields.

## Extracting Page Content

Use `extract_page.mjs` for all homepage/product-page content extraction. It fetches via `bb fetch`, parses title + meta + visible body text, and falls back to `bb browse` automatically when the page is JS-rendered or too large for fetch:

```bash
node {SKILL_DIR}/scripts/extract_page.mjs "https://example.com" --max-chars 3000
```

Output is a structured block:
```
URL: https://example.com
FETCH_OK: true|false
FALLBACK_TO_BROWSE: true|false
TITLE: ...
META_DESCRIPTION: ...
OG_TITLE: ...
OG_DESCRIPTION: ...
HEADINGS: h1/h2/h3 joined by " | "
BODY_CHARS: N
BODY:
<cleaned visible text, max N chars>
```

**Why not a raw `bb fetch | sed` pipeline?** `bb fetch` returns a JSON envelope with the HTML embedded as an escaped string — a naive sed pipeline strips `<>` from the JSON wrapper too and destroys the content. It also strips `<meta>` tags, which on Framer/Next.js SPAs are often the only readable content. `extract_page.mjs` handles both correctly.

**When to use raw `bb fetch`**: Only for small structured files where you want the JSON envelope intact — e.g. `sitemap.xml`, `robots.txt`, `llms.txt`. For any HTML page you'd feed to a model, use `extract_page.mjs`.

## Verifying content is real (not hallucinated)

Before writing `product_description`, `industry`, or `target_audience` into a company file, confirm the claim is grounded in `extract_page.mjs` output. Quote or closely paraphrase from TITLE, META_DESCRIPTION, OG_DESCRIPTION, HEADINGS, or BODY.

If `extract_page.mjs` returns `FETCH_OK: false` AND `FALLBACK_TO_BROWSE: false` (or BODY_CHARS < 50), the homepage is inaccessible. Do not fabricate. Write:
- `product_description: Unknown — homepage content not accessible`
- `icp_fit_score: 3` (or lower)
- `icp_fit_reasoning: Insufficient evidence — homepage returned no readable content`

A classic failure mode this prevents: a Framer/Next.js landing page with no server-rendered copy, where the subagent pattern-matches visual cues ("design-forward", "Geist Mono", "Framer-built") onto the user's own ICP. Typography is not a product.

## Discovery Subagent Prompt Template

```
You are a company discovery subagent. Run search queries and save results.

TOOL RULES — CRITICAL, FOLLOW EXACTLY:
1. You may ONLY use the Bash tool. No exceptions.
2. Run ALL searches in a SINGLE Bash call using && chaining.
3. BANNED TOOLS: WebFetch, WebSearch, Write, Read, Glob, Grep — ALL BANNED.
   If you use ANY banned tool, the entire run fails. Use ONLY Bash.
4. NEVER use ~ or $HOME in paths — use full literal paths.

TASK:
Run ALL of the following searches in ONE Bash command:

bb search "{query1}" --num-results 25 --output /tmp/company_discovery_batch_{N1}.json && \
bb search "{query2}" --num-results 25 --output /tmp/company_discovery_batch_{N2}.json && \
bb search "{query3}" --num-results 25 --output /tmp/company_discovery_batch_{N3}.json && \
echo "Discovery complete"

After the command completes, report back ONLY the count of results found per batch.
Do NOT analyze, summarize, or return the actual results.
```

## Research Subagent Prompt Template

```
You are a company research subagent. For each company URL, research the company and score ICP fit.

CONTEXT:
- User's company: {user_company}
- User's product: {user_product}
- ICP description: {icp_description}
- Depth mode: {depth_mode}
- Output directory: {OUTPUT_DIR}   ← write research files HERE, as a full literal path

URLS TO PROCESS:
{url_list}

TOOL RULES — CRITICAL, FOLLOW EXACTLY:
1. You may ONLY use the Bash tool. No exceptions.
2. All searches: Bash → bb search "..." --num-results 10
3. All homepage/product-page content extraction:
   Bash → node {SKILL_DIR}/scripts/extract_page.mjs "URL" --max-chars 3000
   This returns structured TITLE / META_DESCRIPTION / OG_DESCRIPTION / HEADINGS / BODY and auto-falls back to bb browse for JS-rendered or >1MB pages.
   DO NOT hand-roll a `bb fetch | sed` pipeline — it silently strips meta tags and doesn't parse the JSON envelope. Use `bb fetch` raw only for sitemap.xml, robots.txt, llms.txt.
4. BATCH all file writes: Write ALL markdown files in a SINGLE Bash call using chained heredocs (one permission prompt, not one per file).
5. BANNED TOOLS: WebFetch, WebSearch, Write, Read, Glob, Grep — ALL BANNED.
   If you use ANY banned tool, the entire run fails. Use ONLY Bash.
6. NEVER use ~ or $HOME in paths — use full literal paths.

ANTI-HALLUCINATION RULES — CRITICAL:
- NEVER infer product_description, industry, or target_audience from fonts, framework (Framer/Next.js/React), design system, or visual style. Typography is not a product.
- NEVER let the sender's ICP leak into a target's description. If you don't know what the target does, write "Unknown" — do not pattern-match them onto the ICP.
- product_description MUST quote or closely paraphrase a phrase from extract_page.mjs output. If none of TITLE/META/OG/HEADINGS/BODY yield a recognizable product statement, write "Unknown — homepage content not accessible" and cap icp_fit_score at 3.

RESEARCH PATTERN (per company):

Phase A — Plan (skip in quick mode):
Decompose what you need to know into sub-questions based on ICP and enrichment fields.

Phase B — Research Loop:
For each sub-question (or just the homepage in quick mode):
1. Run bb search with relevant query
2. Pick 1-2 most relevant URLs from results
3. Extract page content: node {SKILL_DIR}/scripts/extract_page.mjs "URL" --max-chars 3000
   (auto-handles the JSON envelope, meta tags, and the bb browse fallback)
4. Smart page discovery: use `bb fetch --allow-redirects` on /sitemap.xml or /llms.txt to find relevant URLs — these are small XML/text files where the raw JSON envelope is fine. For the actual HTML pages you discover, use extract_page.mjs.
5. Extract findings: factual statements with source, confidence level
6. Accumulate findings, move to next sub-question
7. Respect step budget: quick=2-3 calls, deep=5-8, deeper=10-15

Phase C — Synthesize:
From accumulated findings:
1. Score ICP fit 1-10 (see rubric below)
2. Fill enrichment fields from findings
3. Reference specific findings in icp_fit_reasoning

ICP SCORING RUBRIC:
- 8-10: Strong match. Multiple high-confidence findings confirm fit.
- 5-7: Partial match. Some findings suggest relevance but key signals missing.
- 1-4: Weak match. Wrong segment or no apparent connection.

OUTPUT — write ALL company files in a SINGLE Bash call using chained heredocs directly to {OUTPUT_DIR}:

cat << 'COMPANY_MD' > {OUTPUT_DIR}/{slug1}.md
---
company_name: {name}
website: {url}
product_description: {description}
industry: {industry}
target_audience: {audience}
key_features: {feature1} | {feature2} | {feature3}
icp_fit_score: {score}
icp_fit_reasoning: {reasoning}
employee_estimate: {estimate}
funding_info: {funding}
headquarters: {location}
---

## Product
{product description paragraph}

## Research Findings
- **[{confidence}]** {finding} (source: {url})
COMPANY_MD
cat << 'COMPANY_MD' > {OUTPUT_DIR}/{slug2}.md
---
...
---
...
COMPANY_MD

Use 'COMPANY_MD' (quoted) as the heredoc delimiter to prevent shell variable expansion.

Report back ONLY: "Batch {batch_id}: {succeeded}/{total} researched, {findings_count} total findings."
Do NOT return raw data to the main conversation.
```

## Wave Management

### Key Principle: Maximize Parallelism, Minimize Prompts
Launch as many subagents as possible in a single message (up to ~6 Agent tool calls per message). Each subagent MUST batch all its Bash operations to minimize permission prompts.

### Discovery Phase
- Launch up to 6 discovery subagents in a single message
- Each subagent runs ALL its queries in a SINGLE Bash call using `&&` chaining
- After all waves complete, run `node {SKILL_DIR}/scripts/list_urls.mjs /tmp`
- **Filter URLs**: Remove blog posts, news articles, directories, competitors, and existing customers. Keep only company homepages.

### Research Phase
- Companies per subagent varies by depth:
  - `quick`: ~10 companies per subagent
  - `deep`: ~5 companies per subagent
  - `deeper`: ~2-3 companies per subagent
- Each subagent writes ALL its markdown files in a SINGLE Bash call (chained heredocs) directly to `{OUTPUT_DIR}`

### Sizing Formula
```
search_queries = ceil(requested_companies / 35)
discovery_subagents = search_queries
expected_urls = search_queries * 20

quick:  research_subagents = ceil(expected_urls / 10)
deep:   research_subagents = ceil(expected_urls / 5)
deeper: research_subagents = ceil(expected_urls / 3)
```

### Error Handling
- If a subagent fails, log the error and continue with remaining batches
- If >50% of subagents fail in a wave, pause and inform the user
- `extract_page.mjs` already handles the bb fetch → bb browse fallback internally. If it still returns FETCH_OK: false with empty BODY, skip the company and mark product_description as Unknown (do not guess).

## Report + CSV Compilation

After all research subagents complete, compile the HTML report and CSV in one command:

```bash
node {SKILL_DIR}/scripts/compile_report.mjs {OUTPUT_DIR} --open
```

The script:
- Reads all `.md` files in `{OUTPUT_DIR}`
- Parses YAML frontmatter + body sections
- Deduplicates by normalized company name (keeps highest ICP score)
- Generates `{OUTPUT_DIR}/index.html` — scored overview page
- Generates `{OUTPUT_DIR}/companies/{slug}.html` — one page per company
- Generates `{OUTPUT_DIR}/results.csv` — spreadsheet for sheets/CRM
- Opens `index.html` in the default browser (`--open` flag)
- Prints a JSON summary to stderr
