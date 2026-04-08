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
license: MIT
compatibility: Requires bb CLI (@browserbasehq/cli) and BROWSERBASE_API_KEY env var
allowed-tools: Bash Agent
metadata:
  author: browserbase
  version: "0.3.0"
---

# Cold Outbound

Generate enriched lead lists with personalized outbound emails. Uses Browserbase Search API for discovery, a deep research pattern for enrichment, and LLM-powered email personalization.

**Required**: `BROWSERBASE_API_KEY` env var and `bb` CLI installed.

**First-run setup**: On the first run you'll be prompted to approve `bb fetch`, `bb search`, `cat`, `mkdir`, `sed`, etc. Select **"Yes, and don't ask again for: bb fetch:\*"** (or equivalent) for each to auto-approve for the session. To permanently approve, add these to your `~/.claude/settings.json` under `permissions.allow`:
```json
"Bash(bb:*)", "Bash(bunx:*)", "Bash(bun:*)", "Bash(node:*)",
"Bash(cat:*)", "Bash(mkdir:*)", "Bash(sed:*)", "Bash(head:*)", "Bash(tr:*)", "Bash(rm:*)"
```

**Path rules**: Always use the full literal path in all Bash commands — NOT `~` or `$HOME` (both trigger "shell expansion syntax" approval prompts). Resolve the home directory once and use it everywhere (e.g., `/Users/jay/skills/skills/cold-outbound/...`). When constructing subagent prompts, replace `{SKILL_DIR}` with the full literal path. When writing files (like profiles), use the Write tool with the full expanded path.

**CRITICAL — Tool restrictions (applies to main agent AND all subagents)**:
- All web searches: use `bb search`. NEVER use WebSearch.
- All page fetches: use `bb fetch --allow-redirects`. NEVER use WebFetch. `bb fetch` returns raw HTML — to extract text, pipe through: `sed 's/<script[^>]*>.*<\/script>//g; s/<style[^>]*>.*<\/style>//g; s/<[^>]*>//g' | tr -s ' \n'`. Has a 1MB response limit — for large or JS-heavy pages, use `bb browse` instead.
- All research output: subagents write **one markdown file per company** to `/tmp/cold_research/{company-slug}.md` using bash heredoc. NEVER use the Write tool or `python3 -c` — both trigger security prompts. See `references/example-research.md` for the file format.
- CSV compilation: use the bundled script `node {SKILL_DIR}/scripts/compile_csv.mjs /tmp/cold_research`. See `references/workflow.md` for details.
- URL deduplication: use `node {SKILL_DIR}/scripts/list_urls.mjs /tmp` after discovery.
- **Subagents must use ONLY the Bash tool. No other tools allowed.** This is non-negotiable — WebFetch, WebSearch, Write, Read, Glob, and Grep all trigger permission prompts that interrupt the user.
- **Main agent NEVER reads raw discovery JSON batch files.** Use `list_urls.mjs` for URL deduplication. For enrichment data, read the per-company markdown files directly.

**CRITICAL — Minimize permission prompts**:
- Subagents MUST batch ALL file writes into a SINGLE Bash call using chained heredocs (`cat << 'COMPANY_MD' > file1.md ... COMPANY_MD && cat << 'COMPANY_MD' > file2.md ...`). One Bash call = one permission prompt. Multiple Bash calls = multiple prompts that frustrate the user.
- Similarly, batch ALL searches and ALL fetches into single Bash calls where possible using `&&` chaining.
- The main agent should also batch operations: run all contact searches in one call, append all contact sections in one call, append all email drafts in one call.

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
- Search: `bb search "{vertical} companies landscape types"`
- Use the `AskUserQuestion` tool to ask clarifying questions as checkboxes — NOT as a text wall. Combine all questions into a single AskUserQuestion call with multiple questions. Example:
  - Question 1 (multiSelect: true): "Which segments?" with options like "E2E testing platforms", "Visual regression tools", "Cross-browser testing", "AI-powered testing"
  - Question 2: "Company stage?" with options like "Startups", "Mid-market", "Enterprise", "All"
  - Question 3: "How many leads / depth?" with options like "Quick (100+)", "Deep (25-50)", "Deeper (<25)"
- This is the ONLY user interaction after profile confirmation. Fold answers into ICP and sub-verticals, then execute Steps 3-7 silently.
- Do NOT save vertical targeting answers to the profile. These are per-run decisions held in memory only. The profile only stores company facts (product, customers, competitors, use cases).

If the user doesn't specify a vertical, derive sub-verticals from the company research. Still use AskUserQuestion for depth mode selection.

**Profiles directory**: `{SKILL_DIR}/profiles/`
A blank template (`example.json`) ships with the skill. Completed profiles persist across sessions.

1. Ask the user for their company name or URL

2. **Check for an existing profile**:
   - List files in `{SKILL_DIR}/profiles/` (ignore `example.json`)
   - If a matching profile exists → load it, present to user: "I have your profile from {researched_at}. Still accurate?" If yes → skip to Step 2. If changes needed → edit fields and re-save.
   - If no profile exists → proceed with deep research below. After confirmation, save to `profiles/{company-slug}.json` (copy structure from `example.json`).

3. **Run a full deep research on the user's company** using the Plan→Research→Synthesize pattern.
   See `references/research-patterns.md` for sub-question templates, research loop rules, and synthesis instructions.

   **Key research steps:**
   - Search: `bb search "{company name}" --num-results 10`
   - Fetch homepage: `bb fetch --allow-redirects "{company website}"`
   - **Discover site pages via sitemap** (do NOT hardcode paths like `/about` or `/customers`):
     1. `bb fetch --allow-redirects "{company website}/sitemap.xml"` — primary source, has ALL pages
     2. Scan for URLs with keywords: `customer`, `case-stud`, `pricing`, `about`, `use-case`, `industry`, `solution`
     3. Optionally also fetch `bb fetch --allow-redirects "{company website}/llms.txt"` for page descriptions
     4. Pick 3-5 most relevant URLs and fetch those
   - Search for external context and competitors
   - Accumulate findings with confidence levels

   **Synthesize into a profile** (about the COMPANY, not a specific vertical):
   Company, Product, Existing Customers, Competitors, Use Cases.
   Do NOT include ICP, pitch angle, or sub-verticals — those are per-run targeting decisions.

4. Present the profile to the user for confirmation. Do not proceed until confirmed.

5. **Save the confirmed profile** to `{SKILL_DIR}/profiles/{company-slug}.json`:
   ```json
   {
     "company": "Browserbase",
     "website": "https://www.browserbase.com",
     "product": "Cloud browser infrastructure for AI agents...",
     "existing_customers": ["Firecrawl", "Ramp", "..."],
     "competitors": ["Browserless", "Apify", "..."],
     "use_cases": ["AI agent browser access", "web scraping", "..."],
     "researched_at": "2026-03-17"
   }
   ```

## Step 2: Depth Mode Selection

Ask the user how many leads they want and recommend a depth mode:

| Mode | Research per company | Best for | Default when |
|------|---------------------|----------|--------------|
| `quick` | Homepage + 1-2 searches | 100+ leads, broad discovery | User asks for 100+ leads |
| `deep` | 2-3 sub-questions, 5-8 tool calls | 25-50 leads, quality enrichment | User asks for 25-100 leads |
| `deeper` | 4-5 sub-questions, 10-15 tool calls | 10-25 leads, full intelligence | User asks for <25 leads |

Combine Step 1 profile confirmation and depth mode into a single prompt. Once the user responds, execute Steps 3-8 silently — no more questions, no status narration.

## Step 3: Micro-Vertical Generation

**Formula**: `ceil(requested_leads / 35)` micro-verticals needed. Over-discover by ~2-3x because filtering typically drops 50-70%.

Generate search queries with these patterns:
- Industry + company stage + geography ("fintech startups series A Bay Area")
- Technology stack + use case ("companies using Selenium for web scraping")
- Competitor adjacency ("alternatives to {known company in ICP}")
- Buyer persona + pain point ("engineering teams struggling with browser automation")

Each query: 4-8 descriptive keywords, non-overlapping. Proceed immediately — do not ask the user to approve queries.

## Step 4: Output Schema Design (auto)

Use default columns plus enrichment fields that make sense for the ICP:

| Column | Description |
|--------|-------------|
| `company_name` | Company name (5 words max) |
| `website` | Homepage URL |
| `product_description` | What they do (12 words max) |
| `icp_fit_score` | 1-10 integer |
| `icp_fit_reasoning` | Why this score (20 words max) |
| `personalized_email` | Ready-to-send email draft |

Always include `industry` and `key_features`. Add `employee_estimate`, `funding_info`, `target_audience` when relevant. Do not ask the user — use sensible defaults.

## Step 5: Batch Discovery

Launch subagents to run search queries in parallel. See `references/workflow.md` for subagent prompt templates and wave management rules.

**Process**:
1. **Clean up prior run**: `rm -rf /tmp/cold_discovery_batch_*.json /tmp/cold_research`
2. Launch ALL discovery subagents at once (up to ~6 per single message). Each subagent runs its queries in a SINGLE Bash call:
   ```bash
   bb search "{query}" --num-results 25 --output /tmp/cold_discovery_batch_{N}.json
   ```
3. Subagents report back counts only
4. After all waves complete, deduplicate:
   ```bash
   node {SKILL_DIR}/scripts/list_urls.mjs /tmp
   ```
5. **Filter the URL list**: Remove URLs that are clearly NOT company homepages:
   - Blog posts, news articles (globenewswire.com, techcrunch.com, etc.)
   - Directories/aggregators (tracxn.com, crunchbase.com, g2.com)
   - The sender's own competitors (from the company profile)
   - The sender's existing customers (from the company profile)
   Keep only URLs that look like company homepages (e.g., `https://acme.com`, `https://www.acme.io`)

## Step 6: Deep Research & Enrichment

Launch subagents to research companies in parallel. See `references/workflow.md` for the enrichment subagent prompt template. See `references/research-patterns.md` for the full research methodology.

**Important**: Enrichment subagents do NOT write emails. Emails come in Step 8 after contacts are found.

**Process**:
1. `mkdir -p /tmp/cold_research`
2. Split filtered URLs into groups per subagent (quick: ~10, deep: ~5, deeper: ~2-3)
3. Launch ALL enrichment subagents at once (up to ~6 per message)
4. Each subagent uses ONLY Bash — for each company:

   **Phase A — Plan** (skip in quick mode):
   Decompose into 2-5 sub-questions based on ICP and enrichment fields.

   **Phase B — Research Loop**:
   Search and fetch pages, extract findings. Respect step budget (quick: 2-3, deep: 5-8, deeper: 10-15).

   **Phase C — Synthesize**:
   Score ICP fit 1-10, fill enrichment fields. Do NOT write emails yet.

5. Subagents write ALL markdown files in a SINGLE Bash call using chained heredocs (one prompt, not one per file)
6. After ALL subagents complete, proceed to Step 7

**Critical**: Include the confirmed ICP description and pitch angle verbatim in every subagent prompt.

## Step 7: Contact Discovery

See `references/workflow.md` for the contact discovery subagent prompt template.

**Process**:
1. Read the markdown files in `/tmp/cold_research/` — scan YAML frontmatter for `icp_fit_score` values
2. Show a quick interim summary (lead count, score distribution, top 10 by ICP score)
3. Filter for companies with icp_fit_score >= 8
4. **Pick 3-5 target titles** based on the sender's product:
   - Dev tools → Head of DevRel, VP Engineering
   - Security → CISO, VP Engineering
   - Infrastructure → CTO, VP Engineering, Head of Platform
   - Early-stage startups → Founder, CEO, CTO
   - Marketing tools → VP Marketing, Head of Growth
5. Launch contact discovery subagents. Each subagent:
   - Runs ALL contact searches in a SINGLE Bash call
   - Appends ALL `## Contact` sections in a SINGLE Bash call
   - Falls back to `bb search "{company name} founder CEO about us"` if title-specific search returns nothing
6. Present a contact table, then proceed to Step 8.

## Step 8: Email Generation + CSV Compilation

See `references/email-templates.md` for email structure, personalization signals, and anti-patterns.

**Process**:
1. Launch email generation subagents. Each subagent:
   - Writes ALL emails for its batch of companies
   - Appends ALL `## Email Draft` sections in a SINGLE Bash call using chained heredocs
2. **Compile final CSV**:
   ```bash
   node {SKILL_DIR}/scripts/compile_csv.mjs /tmp/cold_research ~/Desktop/{company}_outbound_{date}.csv
   ```
3. Present final results:

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

4. Show the **top 10 leads** in a table
5. Show 3-5 sample personalized emails

**Note**: Email addresses are estimated using common patterns (first@company.com). Recommend verifying through Apollo.io, Hunter.io, or LinkedIn Sales Navigator before sending.

Offer to filter the CSV, regenerate emails for specific companies, or search for additional contacts at lower-scored companies.
