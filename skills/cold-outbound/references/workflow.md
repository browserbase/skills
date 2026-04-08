# Cold Outbound — Workflow Reference

## Discovery Batch JSON Schema

File: `/tmp/cold_discovery_batch_{N}.json`

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

File: `/tmp/cold_research/{company-slug}.md`

Each enrichment subagent writes one markdown file per company. See `references/example-research.md` for the full template with all sections and field rules.

**YAML frontmatter fields** (used for CSV compilation):
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

**Body sections** (added progressively):
- `## Product` — added in Step 6 (enrichment)
- `## Research Findings` — added in Step 6 (enrichment)
- `## Contact` — added in Step 7 (contact discovery)
- `## Email Draft` — added in Step 8 (email generation)

**CRITICAL**: Use consistent field names across all files. The `compile_csv.mjs` script reads these fields.

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

Limit to ~3000 chars per page to keep subagent context manageable. Focus on extracting the company name, product description, customer names, and key features from the text.

## Discovery Subagent Prompt Template

```
You are a lead discovery subagent. Run search queries and save results.

TOOL RULES — CRITICAL, FOLLOW EXACTLY:
1. You may ONLY use the Bash tool. No exceptions.
2. Run ALL searches in a SINGLE Bash call using && chaining.
3. BANNED TOOLS: WebFetch, WebSearch, Write, Read, Glob, Grep — ALL BANNED.
   If you use ANY banned tool, the entire run fails. Use ONLY Bash.
4. NEVER use ~ or $HOME in paths — use full literal paths.

TASK:
Run ALL of the following searches in ONE Bash command:

bb search "{query1}" --num-results 25 --output /tmp/cold_discovery_batch_{N1}.json && \
bb search "{query2}" --num-results 25 --output /tmp/cold_discovery_batch_{N2}.json && \
bb search "{query3}" --num-results 25 --output /tmp/cold_discovery_batch_{N3}.json && \
echo "Discovery complete"

After the command completes, report back ONLY the count of results found per batch.
Do NOT analyze, summarize, or return the actual results.
```

## Research & Enrichment Subagent Prompt Template

```
You are a lead research & enrichment subagent. For each company URL, research the company using a 3-phase pattern and score ICP fit. Do NOT write emails — that happens later in Step 8 after contacts are found.

CONTEXT:
- Sender's company: {sender_company}
- Sender's product: {sender_product}
- ICP description: {icp_description}
- Pitch angle: {pitch_angle}
- Depth mode: {depth_mode}
- Output schema columns: {columns}

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
Follow the 3-phase deep research pattern from references/research-patterns.md.

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
4. Do NOT write emails — that happens in Step 8 after contacts are discovered

ICP SCORING RUBRIC:
- 8-10: Strong match. Multiple high-confidence findings confirm fit. Pitch angle directly addresses a visible need.
- 5-7: Partial match. Some findings suggest relevance but key signals missing or low-confidence.
- 1-4: Weak match. Findings indicate wrong segment or no apparent connection.

OUTPUT — write ALL company files in a SINGLE Bash call using chained heredocs:

mkdir -p /tmp/cold_research && cat << 'COMPANY_MD' > /tmp/cold_research/{slug1}.md
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
cat << 'COMPANY_MD' > /tmp/cold_research/{slug2}.md
---
...
---
...
COMPANY_MD

Use 'COMPANY_MD' (quoted) as the heredoc delimiter to prevent shell variable expansion.

Report back ONLY: "Batch {batch_id}: {succeeded}/{total} enriched, {findings_count} total findings."
Do NOT return raw data to the main conversation.
```

## Wave Management

### Key Principle: Maximize Parallelism, Minimize Prompts
Launch as many subagents as possible in a single message (up to ~6 Agent tool calls per message). Each subagent MUST batch all its Bash operations to minimize permission prompts — the user should only see 1-2 prompts per subagent, not one per file write.

### Discovery Phase
- Launch up to 6 discovery subagents in a single message (multiple Agent tool calls)
- Each subagent runs ALL its queries in a SINGLE Bash call using `&&` chaining
- After all discovery waves complete, run `node {SKILL_DIR}/scripts/list_urls.mjs /tmp` to get deduplicated URLs
- **Filter URLs**: Remove blog posts, news articles, directories, competitors, and existing customers. Keep only company homepages.

### Research & Enrichment Phase
- Companies per subagent varies by depth:
  - `quick`: ~10 companies per subagent (light research per company)
  - `deep`: ~5 companies per subagent (moderate research per company)
  - `deeper`: ~2-3 companies per subagent (intensive research per company)
- Launch up to 6 subagents in a single message
- Each subagent writes ALL its markdown files in a SINGLE Bash call (chained heredocs)
- After ALL enrichment subagents complete, the main agent reads `/tmp/cold_research/*.md` frontmatter for the interim summary

### Sizing Formula
```
micro_verticals = ceil(requested_leads / 35)
discovery_subagents = micro_verticals
expected_urls = micro_verticals * 20  (avg yield ~20 per 25-result query after filtering)

quick:  enrichment_subagents = ceil(expected_urls / 10)
deep:   enrichment_subagents = ceil(expected_urls / 5)
deeper: enrichment_subagents = ceil(expected_urls / 3)

discovery_waves = ceil(discovery_subagents / 6)
enrichment_waves = ceil(enrichment_subagents / 6)
```

### Error Handling
- If a subagent fails, log the error and continue with remaining batches
- If >50% of subagents fail in a wave, pause and inform the user
- Never retry identical queries — adjust wording if a query returns poor results
- If `bb fetch --allow-redirects` fails (thin content, timeout, 1MB limit, redirect loop), try `bb browse` as fallback or skip and note in stats

## Contact Discovery Subagent Prompt Template

```
You are a contact discovery subagent. Find decision makers at target companies.

TOOL RULES — CRITICAL, FOLLOW EXACTLY:
1. You may ONLY use the Bash tool. No exceptions.
2. All searches: Bash → bb search "..." --num-results 10
3. BATCH all searches into ONE Bash call using && chaining.
4. BATCH all file appends into ONE Bash call using && chaining.
5. BANNED TOOLS: WebFetch, WebSearch, Write, Read, Glob, Grep — ALL BANNED.
   If you use ANY banned tool, the entire run fails. Use ONLY Bash.
6. NEVER use ~ or $HOME in paths — use full literal paths.

COMPANIES TO RESEARCH:
{company_list_with_websites}

SENDER CONTEXT:
- Sender's company: {sender_company}
- Sender's product: {sender_product}
- ICP description: {icp_description}

TARGET TITLES:
{target_titles}

RESEARCH PATTERN (per company):
1. Search: bb search "{company name} {title} LinkedIn" --num-results 10 for each target title
2. Search: bb search "{company name} team leadership engineering about" --num-results 10
3. If no results for specific titles, fall back to: bb search "{company name} founder CEO about us" --num-results 10
4. From results, extract: name, title, LinkedIn URL
5. Estimate email: first@companydomain.com (use the company's actual domain)

OUTPUT — append ALL contact sections in a SINGLE Bash call:

cat << 'CONTACT_MD' >> /tmp/cold_research/{slug1}.md

## Contact
- Name: {full name}
- Title: {actual title}
- Email: {first}@{domain}
- LinkedIn: {url or "—"}
CONTACT_MD
cat << 'CONTACT_MD' >> /tmp/cold_research/{slug2}.md

## Contact
- Name: {full name}
...
CONTACT_MD

If no contact found for a company, write "## Contact\n- No contact found".

Report back a summary table of contacts found per company.
```

## CSV Compilation

Use the bundled `compile_csv.mjs` script instead of writing one-off compilation code:

```bash
node {SKILL_DIR}/scripts/compile_csv.mjs /tmp/cold_research ~/Desktop/{company}_outbound_{date}.csv
```

The script:
- Reads all `.md` files from the research directory
- Parses YAML frontmatter for structured fields
- Extracts `## Contact` and `## Email Draft` sections from the body
- Deduplicates by normalized company name (keeps highest ICP score)
- Outputs CSV with priority columns first (company_name, website, icp_fit_score, etc.)
- Prints a JSON summary to stderr (total leads, score distribution, duplicates removed)
