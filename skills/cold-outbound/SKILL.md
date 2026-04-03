---
name: cold-outbound
description: |
  Cold outbound lead generation skill for SDR prospecting at scale. Researches a
  company's product and ICP, discovers target companies using Browserbase Search API,
  deeply researches each using a Plan→Research→Synthesize pattern, scores ICP fit,
  and generates personalized outbound emails — all compiled into a scored CSV.
  Supports depth modes (quick/deep/deeper) for balancing scale vs intelligence.
  Use when the user wants to: (1) generate outbound leads, (2) build a prospecting
  list, (3) find companies matching an ICP, (4) create personalized cold emails at
  scale, (5) do SDR research. Triggers: "outbound", "lead gen", "prospecting list",
  "ICP leads", "cold email", "find companies to sell to", "SDR", "build a lead list",
  "outbound campaign".
--- 

# Cold Outbound

Generate enriched lead lists with personalized outbound emails. Uses Browserbase Search API for discovery, a deep research pattern for enrichment, and LLM-powered email personalization.

**Required**: `BROWSERBASE_API_KEY` env var.

**Scripts location**: `~/.claude/skills/cold-outbound/scripts/`
On first run, install dependencies: `npm install --prefix ~/.claude/skills/cold-outbound/scripts`

**Path rules**: Always use the full literal path in all Bash commands — NOT `~` or `$HOME` (both trigger "shell expansion syntax" approval prompts). Resolve the home directory once and use it everywhere (e.g., `/Users/jay/.claude/skills/cold-outbound/...`). When constructing subagent prompts, replace `{SKILL_DIR}` with the full literal path. When writing files (like profiles), use the Write tool with the full expanded path.

**CRITICAL — Tool restrictions (applies to main agent AND all subagents)**:
- All web searches: use `bb_search.ts`. NEVER use WebSearch.
- All page fetches: use `bb_smart_fetch.ts`. NEVER use WebFetch.
- All file writes to /tmp/: use `write_batch.py` (pipe JSON into it). NEVER use the Write tool or `python3 -c` — both trigger security prompts.
- All CSV compilation: use `compile_csv.py`. NEVER write inline `python3 -c` to process, merge, or compile batch files — it triggers security prompts AND causes bugs (inconsistent key names across batches). The bundled scripts handle normalization.
- Do NOT write ad-hoc scripts to parse, merge, or deduplicate JSON batch files — the bundled scripts handle this.
- **Subagents must use ONLY the Bash tool. No other tools allowed.** This is non-negotiable — WebFetch, WebSearch, Write, Read, Glob, and Grep all trigger permission prompts that interrupt the user.
- **Main agent NEVER reads raw JSON batch files.** After enrichment subagents complete, go straight to `compile_csv.py`. For discovery URL lists, use `list_discovery_urls.py`.

## Pipeline Overview

Follow these 8 steps in order. Do not skip steps or reorder.

1. **Company Research** — Discover the user's product, ICP, and pitch angle
2. **Depth Mode Selection** — Choose research depth based on lead count
3. **Micro-Vertical Generation** — Expand ICP into diverse search queries
4. **Output Schema Design** — Define CSV columns with user input
5. **Batch Discovery** — Subagents search for target companies in parallel
6. **Deep Research & Enrichment** — Subagents research each company, score ICP fit (NO emails yet)
7. **Contact Discovery** — Find decision makers at high-fit companies
8. **Email Generation + CSV Compilation** — Write personalized emails with full context, compile final CSV

---

## Step 1: Deep Company Research + Vertical Scoping

This is the most important step. The quality of everything downstream depends on deeply understanding the user's company AND the specific vertical they want to target.

**If the user specifies a target vertical** (e.g., "sell to UI testing companies"), run a quick research on that vertical too:
- Search: `bb_search.ts --query "{vertical} companies landscape types"`
- Use the `AskUserQuestion` tool to ask clarifying questions as checkboxes — NOT as a text wall. Combine all questions into a single AskUserQuestion call with multiple questions. Example:
  - Question 1 (multiSelect: true): "Which segments?" with options like "E2E testing platforms", "Visual regression tools", "Cross-browser testing", "AI-powered testing"
  - Question 2: "Company stage?" with options like "Startups", "Mid-market", "Enterprise", "All"
  - Question 3: "How many leads / depth?" with options like "Quick (100+)", "Deep (25-50)", "Deeper (<25)"
- This is the ONLY user interaction after profile confirmation. Fold answers into ICP and sub-verticals, then execute Steps 3-7 silently.
- Do NOT save vertical targeting answers to the profile. These are per-run decisions held in memory only. The profile only stores company facts (product, customers, competitors, use cases).

If the user doesn't specify a vertical, derive sub-verticals from the company research. Still use AskUserQuestion for depth mode selection.

**Profiles directory**: `~/.claude/skills/cold-outbound/profiles/`
A blank template (`example.json`) ships with the skill. Completed profiles persist across sessions.

1. Ask the user for their company name or URL

2. **Check for an existing profile**:
   - List files in `~/.claude/skills/cold-outbound/profiles/` (ignore `example.json`)
   - If a matching profile exists → load it, present to user: "I have your profile from {researched_at}. Still accurate?" If yes → skip to Step 2. If changes needed → edit fields and re-save.
   - If no profile exists → proceed with deep research below. After confirmation, save to `profiles/{company-slug}.json` (copy structure from `example.json`).
   - To add a new company later, the user just says "outbound for {new company}" and a new profile is created.

3. **Run a full deep research on the user's company** using the Plan→Research→Synthesize pattern.
   See `references/research-patterns.md` for sub-question templates, research loop rules, and synthesis instructions.

   **Key research steps:**
   - Search: `bb_search.ts --query "{company name}" --num 10`
   - Fetch homepage: `bb_smart_fetch.ts --url "{company website}"`
   - **Discover site pages via sitemap** (do NOT hardcode paths like `/about` or `/customers`):
     1. `bb_smart_fetch.ts --url "{company website}/sitemap.xml" --raw` — primary source, has ALL pages
     2. Scan for URLs with keywords: `customer`, `case-stud`, `pricing`, `about`, `use-case`, `industry`, `solution`
     3. Optionally also fetch `/llms.txt --raw` for page descriptions (bonus context, often incomplete)
     4. Pick 3-5 most relevant URLs and fetch those (without `--raw`)
   - Search for external context and competitors
   - Accumulate findings with confidence levels

   **Synthesize into a profile** (about the COMPANY, not a specific vertical):
   Company, Product, Existing Customers, Competitors, Use Cases.
   Do NOT include ICP, pitch angle, or sub-verticals — those are per-run targeting decisions.

4. Present the profile to the user for confirmation. Ask: "Does this capture your company accurately?"

   The user may adjust any field. Do not proceed until confirmed.

5. **Save the confirmed profile** to `~/.claude/skills/cold-outbound/profiles/{company-slug}.json`:
   ```json
   {
     "company": "Browserbase",
     "website": "https://www.browserbase.com",
     "product": "Cloud browser infrastructure for AI agents...",
     "existing_customers": ["Firecrawl", "Ramp", "..."],
     "competitors": ["Browserless", "Apify", "..."],
     "use_cases": ["AI agent browser access", "web scraping", "E2E testing", "data extraction", "..."],
     "researched_at": "2026-03-17"
   }
   ```
   This profile persists across sessions. Next time the user runs the skill for the same company, it loads instantly.

If the user provides detailed company info directly, still run 2-3 searches to fill gaps (competitors, customer types, use cases) before confirming and saving.

## Step 2: Depth Mode Selection

Ask the user how many leads they want and recommend a depth mode:

| Mode | Research per company | Best for | Default when |
|------|---------------------|----------|--------------|
| `quick` | Homepage + 1-2 searches | 100+ leads, broad discovery | User asks for 100+ leads |
| `deep` | 2-3 sub-questions, 5-8 tool calls | 25-50 leads, quality enrichment | User asks for 25-100 leads |
| `deeper` | 4-5 sub-questions, 10-15 tool calls | 10-25 leads, full intelligence | User asks for <25 leads |

The user can override. Combine Step 1 profile confirmation and depth mode into a single prompt:
- Show the saved profile (or new research)
- Ask: "Still accurate? How many leads / what depth?"
- Once the user responds, go. No more questions. No status narration. Just execute Steps 3-7 silently and deliver results at the end.

## Step 3: Micro-Vertical Generation

Expand the confirmed ICP into search queries. Use the sub-verticals from the company profile to guide query generation.

**Formula**: `ceil(requested_leads / 35)` micro-verticals needed. Over-discover by ~2-3x because filtering (competitors, existing customers, poor fits) typically drops 50-70% of discovered companies.

Generate search queries with these patterns:
- Industry + company stage + geography ("fintech startups series A Bay Area")
- Technology stack + use case ("companies using Selenium for web scraping")
- Competitor adjacency ("alternatives to {known company in ICP}")
- Buyer persona + pain point ("engineering teams struggling with browser automation")

Each query: 4-8 descriptive keywords, non-overlapping with other queries. Proceed immediately — do not ask the user to approve queries.

## Step 4: Output Schema Design (auto)

Use default columns plus enrichment fields that make sense for the ICP. Do not ask the user to pick columns — use sensible defaults:

| Column | Description |
|--------|-------------|
| `company_name` | Company name (5 words max) |
| `website` | Homepage URL |
| `product_description` | What they do (12 words max) |
| `icp_fit_score` | 1-10 integer |
| `icp_fit_reasoning` | Why this score, referencing specific findings (20 words max) |
| `personalized_email` | Ready-to-send email draft |

Auto-select enrichment fields based on ICP context. Always include `industry` and `key_features`. Add `employee_estimate`, `funding_info`, `target_audience` when relevant. Do not ask the user to pick — just use sensible defaults and proceed.

## Step 5: Batch Discovery

Launch subagents to run search queries in parallel. See `references/workflow.md` for subagent prompt templates, batch JSON schemas, and wave management rules.

**Process**:
1. Launch ALL discovery subagents at once (up to ~6 per single message, using multiple Agent tool calls in one message for parallelism)
2. Each subagent runs one query using ONLY Bash:
   ```bash
   npx tsx ~/.claude/skills/cold-outbound/scripts/bb_search.ts --query "{query}" --num 25 --output /tmp/cold_discovery_batch_{N}.json
   ```
3. Subagents report back counts only — no raw data in main context
4. If more than 6 subagents needed, launch next wave of ~6 after current wave completes
5. After all waves complete, run `list_discovery_urls.py` to get deduplicated URLs:
   ```bash
   python3 ~/.claude/skills/cold-outbound/scripts/list_discovery_urls.py /tmp
   ```
6. Use the output (one URL per line) to build the enrichment assignment list — do NOT read or parse batch JSON files yourself

## Step 6: Deep Research & Enrichment

This is the core intelligence step. Each company is researched using a **Plan → Research → Synthesize** pattern, adapted from deep research methodology.

Launch subagents to research companies in parallel. See `references/workflow.md` for the enrichment subagent prompt template. See `references/research-patterns.md` for the full research methodology: sub-question templates, finding format, research loop rules, and synthesis instructions.

**Important**: Enrichment subagents do NOT write emails. They only research, score ICP fit, and fill enrichment fields. Emails are written later in Step 8 after contacts are found.

**Process**:
1. Use the URL list from `list_discovery_urls.py` output (Step 5) — do NOT read batch JSON files yourself
2. Split URLs into groups per subagent (size depends on depth mode — see `references/workflow.md`)
3. Launch ALL enrichment subagents at once (up to ~6 per single message, using multiple Agent tool calls in one message for parallelism)
4. Each subagent uses ONLY Bash — for each company:

   **Phase A — Plan** (skip in quick mode):
   Decompose what needs to be known into 2-5 sub-questions based on ICP and enrichment fields.

   **Phase B — Research Loop**:
   For each sub-question, search and fetch relevant pages, extract findings with confidence levels. Accumulate findings, respecting the step budget for the current depth mode.

   **Phase C — Synthesize**:
   From all accumulated findings: score ICP fit 1-10 with evidence-based reasoning, fill all enrichment fields. Do NOT write emails yet — that happens in Step 8.

5. Subagents write results to `/tmp/cold_enrichment_batch_{N}.json` using `write_batch.py` (NEVER `python3 -c` or the Write tool)
6. Subagents report back counts only — findings count + success rate
7. After ALL enrichment subagents complete, proceed to Step 7

**Critical**: Include the confirmed ICP description and pitch angle verbatim in every subagent prompt for consistent scoring.

## Step 7: Contact Discovery

Automatically find decision makers at high-fit companies. See `references/workflow.md` for the contact discovery subagent prompt template.

**Process**:
1. Run `compile_csv.py` with `--no-cleanup` to deduplicate enrichment results (keeps batch files for Step 8):
   ```bash
   cd ~/Desktop && python3 ~/.claude/skills/cold-outbound/scripts/compile_csv.py /tmp "{company_name}" "{YYYY-MM-DD}" --no-cleanup
   ```
2. Show a quick interim summary (lead count, score distribution, top 10 by ICP score) so the user sees progress
3. Filter for companies with icp_fit_score >= 8
4. **Pick 3-5 target titles** based on the sender's product and who the buyer would be:
   - Selling dev tools/docs → Head of DevRel, Developer Advocate, VP Engineering
   - Selling security → CISO, Head of Security, VP Engineering
   - Selling infrastructure → CTO, VP Engineering, Head of Platform
   - Selling to early-stage startups → Founder, CEO, CTO (small teams = founders decide)
   - Selling marketing/GTM tools → VP Marketing, Head of Growth, CMO
5. Group companies into batches of ~6
6. Launch contact discovery subagents in parallel (up to ~6 per message). Each subagent uses ONLY Bash:
   - Search: `bb_search.ts --query "{company name} {target title} LinkedIn"` for each relevant title
   - Search: `bb_search.ts --query "{company name} team leadership"`
   - Extract names, titles, LinkedIn URLs from search results
   - Estimate email using `first@company.com` pattern
   - See `references/workflow.md` for the contact discovery subagent prompt template
7. After all contact subagents complete, present a **full contact table**:

```
| Company (Score) | Contact | Title | Email (estimated) | LinkedIn |
|-----------------|---------|-------|--------------------|----------|
| Baseten (9) | Philip Kiely | Head of DevRel | philip@baseten.co | link |
| ... | ... | ... | ... | ... |
```

Then proceed immediately to Step 8.

## Step 8: Email Generation + CSV Compilation

Now that we have company research, ICP scores, AND contact info — write emails once with the full picture. See `references/email-templates.md` for email structure, personalization signals, examples, and anti-patterns.

**Process**:
1. Launch email generation subagents in parallel (up to ~6 per message). Each subagent uses ONLY Bash. For each company, the subagent has:
   - All enrichment data (product, industry, ICP score, findings)
   - Contact info (name, title) if found
   - Sender's company profile and pitch angle
2. Each email should:
   - Address the contact by first name ("Hi Philip,") — or "Hi team," if no contact found
   - Reference the contact's role where relevant ("As Head of DevRel, you know...")
   - Use the richest research findings for personalization (not generic)
   - Follow the rules in `references/email-templates.md`
3. Subagents write updated results (with emails + contact columns) to `/tmp/cold_final_batch_{N}.json`
4. Re-run `compile_csv.py` to produce the final CSV with all columns:
   ```bash
   cd ~/Desktop && python3 ~/.claude/skills/cold-outbound/scripts/compile_csv.py /tmp "{company_name}" "{YYYY-MM-DD}"
   ```
5. Present the final results:

```
## Outbound Lead List Complete

- **Total leads**: {count}
- **With contacts found**: {count}
- **Depth mode**: {mode}
- **Score distribution**:
  - High fit (8-10): {count}
  - Medium fit (5-7): {count}
  - Low fit (1-4): {count}
- **Output file**: ~/Desktop/{filename}
```

6. Show the **top 10 leads** with contacts in a table:

```
| Company | Score | Contact | Title | Product | Fit Reasoning |
|---------|-------|---------|-------|---------|---------------|
| Baseten | 9 | Philip Kiely | Head of DevRel | ML inference platform | $150M Series D, docs need... |
```

7. Show 3-5 sample personalized emails so the user can see the quality

**Note**: Email addresses are estimated using common patterns (first@company.com). Recommend verifying through Apollo.io, Hunter.io, or LinkedIn Sales Navigator before sending.

Offer to filter the CSV, regenerate emails for specific companies, or search for additional contacts at lower-scored companies.
