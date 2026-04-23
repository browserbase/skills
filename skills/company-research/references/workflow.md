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

## Extracting Text from HTML

`bb fetch --allow-redirects` returns raw HTML. To extract readable text in a subagent Bash call, use:

```bash
# Fetch and extract text in one pipeline
bb fetch --allow-redirects "https://example.com" | sed 's/<script[^>]*>.*<\/script>//g; s/<style[^>]*>.*<\/style>//g; s/<[^>]*>//g; s/&amp;/\&/g; s/&lt;/</g; s/&gt;/>/g; s/&nbsp;/ /g; s/&#[0-9]*;//g' | tr -s ' \n' | head -c 3000
```

Or save to file first and then extract:
```bash
bb fetch --allow-redirects "https://example.com" --output /tmp/fetch_example.html && sed 's/<script[^>]*>.*<\/script>//g; s/<style[^>]*>.*<\/style>//g; s/<[^>]*>//g' /tmp/fetch_example.html | tr -s ' \n' | head -c 3000
```

Limit to ~3000 chars per page to keep subagent context manageable.

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
3. All page fetches: Bash → bb fetch --allow-redirects "..."
   bb fetch returns RAW HTML. To extract text, pipe through:
   sed 's/<script[^>]*>.*<\/script>//g; s/<style[^>]*>.*<\/style>//g; s/<[^>]*>//g' | tr -s ' \n' | head -c 3000
   If a page returns thin content or "enable JavaScript", use bb browse instead.
4. BATCH all file writes: Write ALL markdown files in a SINGLE Bash call using chained heredocs (one permission prompt, not one per file).
5. BANNED TOOLS: WebFetch, WebSearch, Write, Read, Glob, Grep — ALL BANNED.
   If you use ANY banned tool, the entire run fails. Use ONLY Bash.
6. NEVER use ~ or $HOME in paths — use full literal paths.

RESEARCH PATTERN (per company):

Phase A — Plan (skip in quick mode):
Decompose what you need to know into sub-questions based on ICP and enrichment fields.

Phase B — Research Loop:
For each sub-question (or just the homepage in quick mode):
1. Run bb search with relevant query
2. Pick 1-2 most relevant URLs from results
3. Run bb fetch --allow-redirects on selected URLs, pipe through sed to extract text
4. Smart page discovery: try /llms.txt or /sitemap.xml to find relevant pages — don't guess paths
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
- If `bb fetch --allow-redirects` fails, try `bb browse` as fallback or skip

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
