# Cold Outbound — Workflow Reference

## Discovery Batch JSON Schema

File: `/tmp/cold_discovery_batch_{N}.json`

```json
[
  { "url": "https://example.com", "title": "Example Corp", "author": null, "publishedDate": null },
  ...
]
```

Output of `bb_search.ts --output`. Array of search results. Each subagent produces one file.

## Enrichment Batch JSON Schema

File: `/tmp/cold_enrichment_batch_{N}.json`

**CRITICAL: Use these exact field names.** Inconsistent keys across batches (e.g., `company` vs `company_name`) break compile_csv.py.

```json
[
  {
    "company_name": "Acme Inc",
    "website": "https://acme.com",
    "product_description": "AI-powered inventory management for e-commerce brands",
    "industry": "E-commerce / SaaS",
    "target_audience": "Mid-market e-commerce brands",
    "key_features": ["demand forecasting", "automated reordering", "multi-warehouse sync"],
    "icp_fit_score": 8,
    "icp_fit_reasoning": "Series A e-commerce SaaS, uses Selenium for scraping, expanding to EU — strong fit",
    "employee_estimate": "50-100",
    "funding_info": "Series A, $12M",
    "headquarters": "San Francisco, CA"
  }
]
```

## Discovery Subagent Prompt Template

```
You are a lead discovery subagent. Run search queries and save results.

TOOL RULES — CRITICAL, FOLLOW EXACTLY:
1. You may ONLY use the Bash tool. No exceptions.
2. All searches: Bash → npx tsx {SKILL_DIR}/scripts/bb_search.ts ...
3. BANNED TOOLS (these trigger permission prompts that break the flow):
   - WebFetch — BANNED
   - WebSearch — BANNED
   - Write — BANNED
   - Read — BANNED (for URLs; use bb_smart_fetch.ts)
   - Glob, Grep — BANNED
   If you use ANY banned tool, the entire run fails. Use ONLY Bash.
4. NEVER use ~ or $HOME in paths — they trigger "shell expansion" approval prompts. Use the full literal path provided in {SKILL_DIR}.

TASK:
Run the following search queries using bb_search.ts and save results directly via --output:

{for each query}
npx tsx {SKILL_DIR}/scripts/bb_search.ts --query "{query}" --num 25 --output /tmp/cold_discovery_batch_{batch_id}.json
{end for}

After each search completes, report back ONLY the count of results found.
Do NOT analyze, summarize, or return the actual results.

Example response: "Batch 1: 23 results. Batch 2: 25 results. Batch 3: 18 results."
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
2. All searches: Bash → npx tsx {SKILL_DIR}/scripts/bb_search.ts --query "..." --num 10
3. All fetches: Bash → npx tsx {SKILL_DIR}/scripts/bb_smart_fetch.ts --url "..."
4. All file writes: Bash → pipe JSON into {SKILL_DIR}/scripts/write_batch.py (NEVER python3 -c)
5. BANNED TOOLS (these trigger permission prompts that break the flow):
   - WebFetch — BANNED
   - WebSearch — BANNED
   - Write — BANNED (use Bash to write files)
   - Read — BANNED (for URLs; use bb_smart_fetch.ts)
   - Glob, Grep — BANNED
   If you use ANY banned tool, the entire run fails. Use ONLY Bash.
6. NEVER use ~ or $HOME in paths — they trigger "shell expansion" approval prompts. Use the full literal path provided in {SKILL_DIR}.

RESEARCH PATTERN (per company):
Follow the 3-phase deep research pattern from references/research-patterns.md.

Phase A — Plan (skip in quick mode):
Decompose what you need to know into sub-questions based on ICP and enrichment fields.

Phase B — Research Loop:
For each sub-question (or just the homepage in quick mode):
1. Run bb_search.ts with relevant query
2. Pick 1-2 most relevant URLs from results
3. Run bb_smart_fetch.ts on selected URLs
4. Smart page discovery: if you need deeper info on a company, try fetching their /llms.txt or /sitemap.xml first to find pages like customer stories, case studies, solutions pages — don't guess paths
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

OUTPUT — use the bundled write_batch.py script. NEVER use python3 -c or inline Python.
Inline Python triggers "shell metacharacters" and "consecutive quote characters" security prompts.

Use this exact pattern to write results:

echo '{json_data}' | python3 {SKILL_DIR}/scripts/write_batch.py /tmp/cold_enrichment_batch_{batch_id}.json

Where {json_data} is a valid JSON string with your results. Example:

echo '[{"company_name":"Acme","website":"https://acme.com","icp_fit_score":8,"icp_fit_reasoning":"Strong fit"}]' | python3 {SKILL_DIR}/scripts/write_batch.py /tmp/cold_enrichment_batch_{batch_id}.json

For larger payloads, write JSON to a temp file first, then pipe:

echo '[...]' > /tmp/cold_batch_{batch_id}_raw.json
python3 {SKILL_DIR}/scripts/write_batch.py /tmp/cold_enrichment_batch_{batch_id}.json < /tmp/cold_batch_{batch_id}_raw.json

CRITICAL: Do NOT use python3 -c "..." — it ALWAYS triggers security prompts. Use write_batch.py instead.

Report back ONLY: "Batch {batch_id}: {succeeded}/{total} enriched, {findings_count} total findings."
Do NOT return raw data to the main conversation.
```

## Wave Management

### Key Principle: Maximize Parallelism
Launch as many subagents as possible in a single message (up to ~6 Agent tool calls per message). This matches the Exa skill pattern and minimizes total wall-clock time. Do NOT run subagents sequentially when they can run in parallel.

### Discovery Phase
- Launch up to 6 discovery subagents in a single message (multiple Agent tool calls)
- Each subagent runs 1 search query (or up to 3 if queries are small)
- If more than 6 subagents needed, launch the next wave of ~6 after the current wave completes
- BB Search rate limit: 120 req/min — with 6 concurrent subagents each making 1 call, pacing is safe
- After all discovery waves complete, run `list_discovery_urls.py` to get deduplicated URLs — do NOT read batch JSON files directly

### Research & Enrichment Phase
- Companies per subagent varies by depth:
  - `quick`: ~10 companies per subagent (light research per company)
  - `deep`: ~5 companies per subagent (moderate research per company)
  - `deeper`: ~2-3 companies per subagent (intensive research per company)
- Launch up to 6 subagents in a single message (multiple Agent tool calls)
- If more than 6 subagents needed, launch the next wave of ~6 after the current wave completes
- Browser fallbacks take 10-30s each — expect slower subagents when sites are JS-heavy
- After ALL enrichment subagents complete, run `compile_csv.py` directly — do NOT read or merge batch files yourself

### Sizing Formula
```
micro_verticals = ceil(requested_leads / 35)
discovery_subagents = micro_verticals
expected_urls = micro_verticals * 20  (avg yield ~20 per 25-result query after filtering)

# Enrichment sizing depends on depth:
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
- If bb_smart_fetch.ts fails on a URL, skip it and note in the stats

## Contact Discovery Subagent Prompt Template

```
You are a contact discovery subagent. Find decision makers at target companies.

TOOL RULES — CRITICAL, FOLLOW EXACTLY:
1. You may ONLY use the Bash tool. No exceptions.
2. All searches: Bash → npx tsx {SKILL_DIR}/scripts/bb_search.ts --query "..." --num 10
3. BANNED TOOLS (these trigger permission prompts that break the flow):
   - WebFetch, WebSearch, Write, Read, Glob, Grep — ALL BANNED
   If you use ANY banned tool, the entire run fails. Use ONLY Bash.
4. NEVER use ~ or $HOME in paths — they trigger "shell expansion" approval prompts. Use the full literal path provided in {SKILL_DIR}.

COMPANIES TO RESEARCH:
{company_list_with_websites}

SENDER CONTEXT:
- Sender's company: {sender_company}
- Sender's product: {sender_product}
- ICP description: {icp_description}

TARGET TITLES — choose the most relevant buyer personas based on the sender's product and ICP:
{target_titles}

Examples of how to pick titles:
- Selling dev tools/docs → Head of DevRel, Developer Advocate, VP Engineering
- Selling security → CISO, Head of Security, VP Engineering
- Selling infrastructure → CTO, VP Engineering, Head of Platform
- Selling to early-stage startups → Founder, CEO, CTO (small teams = founders decide)
- Selling marketing/GTM tools → VP Marketing, Head of Growth, CMO
- Selling data tools → Head of Data, VP Engineering, CTO

The main agent should pick 3-5 relevant titles based on the sender's product and ICP, and pass them in {target_titles}.

RESEARCH PATTERN (per company):
1. Search: "{company name} {title} LinkedIn" for each target title
2. Search: "{company name} team leadership engineering about"
3. From results, extract: name, title, LinkedIn URL
4. Estimate email: first@companydomain.com (use the company's actual domain)

OUTPUT:
Report back a table for each company:
- company_name
- contact_name (full name)
- contact_title (their actual title, not your search query)
- estimated_email (first@domain.com pattern)
- linkedin_url (if found, otherwise "—")

If no contact found for a company, report "No contact found" and move on.
Do NOT return raw search results — only the extracted contact info.
```
