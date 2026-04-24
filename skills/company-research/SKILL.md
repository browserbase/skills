---
name: company-research
description: |
  Company discovery and deep research skill. Researches a company's product and ICP,
  discovers target companies to sell to using Browserbase Search API, deeply researches
  each using a Plan→Research→Synthesize pattern, and scores ICP fit — compiled into
  a scored research report and CSV. Supports depth modes (quick/deep/deeper) for
  balancing scale vs intelligence.
  Use when the user wants to: (1) find companies to sell to, (2) research potential
  customers, (3) discover companies matching an ICP, (4) build a target company list,
  (5) do market research on prospects. Triggers: "find companies to sell to",
  "company research", "find prospects", "ICP research", "target companies",
  "who should we sell to", "market research", "lead research", "prospect list".
license: MIT
compatibility: Requires bb CLI (@browserbasehq/cli) and BROWSERBASE_API_KEY env var
allowed-tools: Bash Agent
metadata:
  author: browserbase
  version: "1.1.0"
---

# Company Research

Discover and deeply research companies to sell to. Uses Browserbase Search API for discovery and a Plan→Research→Synthesize pattern for deep enrichment — outputting a scored research report and CSV.

**Required**: `BROWSERBASE_API_KEY` env var and `bb` CLI installed.

**First-run setup**: On the first run you'll be prompted to approve `bb fetch`, `bb search`, `cat`, `mkdir`, `sed`, etc. Select **"Yes, and don't ask again for: bb fetch:\*"** (or equivalent) for each to auto-approve for the session. To permanently approve, add these to your `~/.claude/settings.json` under `permissions.allow`:
```json
"Bash(bb:*)", "Bash(bunx:*)", "Bash(bun:*)", "Bash(node:*)",
"Bash(cat:*)", "Bash(mkdir:*)", "Bash(sed:*)", "Bash(head:*)", "Bash(tr:*)", "Bash(rm:*)"
```

**Path rules**: Always use the full literal path in all Bash commands — NOT `~` or `$HOME` (both trigger "shell expansion syntax" approval prompts). Resolve the home directory once and use it everywhere. When constructing subagent prompts, replace `{SKILL_DIR}` with the full literal path.

**Output directory**: All research output goes to `~/Desktop/{company_slug}_research_{YYYY-MM-DD}/`. This directory contains one `.md` file per researched company plus a final `.csv`. The user gets both the scored spreadsheet and the full research files on their Desktop.

**CRITICAL — Tool restrictions (applies to main agent AND all subagents)**:
- All web searches: use `bb search`. NEVER use WebSearch.
- All page content extraction: use `node {SKILL_DIR}/scripts/extract_page.mjs "<url>"`. This script fetches via `bb fetch`, parses title + meta tags + visible body text, and automatically falls back to `bb browse` when the page is JS-rendered or over 1MB. NEVER hand-roll a `bb fetch | sed` pipeline — it silently strips meta tags and doesn't handle the JSON envelope. NEVER use WebFetch.
- All research output: subagents write **one markdown file per company** to `{OUTPUT_DIR}/{company-slug}.md` using bash heredoc. NEVER use the Write tool or `python3 -c`. See `references/example-research.md` for the file format.
- Report + CSV compilation: use `node {SKILL_DIR}/scripts/compile_report.mjs {OUTPUT_DIR} --open` — generates HTML report and CSV in one step, opens overview in browser.
- URL deduplication: use `node {SKILL_DIR}/scripts/list_urls.mjs /tmp` after discovery.
- **Subagents must use ONLY the Bash tool. No other tools allowed.**
- **Main agent NEVER reads raw discovery JSON batch files.** Use `list_urls.mjs` for dedup.

**CRITICAL — Anti-hallucination rules (applies to main agent AND all subagents)**:
- NEVER infer `product_description`, `industry`, or `target_audience` from a site's fonts, framework (Framer/Next.js/React), design system, or typography. These are cosmetic and say nothing about what the company sells.
- NEVER let the user's own ICP leak into a target's description. If you don't know what the target does, write `Unknown` — do not pattern-match them onto the ICP.
- `product_description` MUST quote or paraphrase a specific phrase from `extract_page.mjs` output (TITLE, META_DESCRIPTION, OG_DESCRIPTION, HEADINGS, or BODY). If none of those fields yield a recognizable product statement, write `Unknown — homepage content not accessible`.
- If `product_description` is `Unknown`, cap `icp_fit_score` at 3 and set `icp_fit_reasoning` to `Insufficient evidence — homepage returned no readable content`.

**CRITICAL — Minimize permission prompts**:
- Subagents MUST batch ALL file writes into a SINGLE Bash call using chained heredocs. One Bash call = one permission prompt.
- Batch ALL searches and ALL fetches into single Bash calls using `&&` chaining.

## Pipeline Overview

Follow these 5 steps in order. Do not skip steps or reorder.

1. **Company Research** — Deeply understand the user's company, product, and who they sell to
2. **Depth Mode Selection** — Choose research depth based on how many targets they want
3. **Discovery** — Find target companies using diverse search queries
4. **Deep Research & Scoring** — Research each company, score ICP fit
5. **Report & CSV** — Present findings, compile scored CSV

---

## Step 0: Setup Output Directory

Before starting, create the output directory on the user's Desktop:

```bash
OUTPUT_DIR=~/Desktop/{company_slug}_research_{YYYY-MM-DD}
mkdir -p "$OUTPUT_DIR"
```

Replace `{company_slug}` with the user's company name (lowercase, hyphenated) and `{YYYY-MM-DD}` with today's date. Pass `{OUTPUT_DIR}` (as a full literal path, not with `~`) to all subagent prompts so they write research files there.

Also clean up discovery batch files from prior runs:
```bash
rm -f /tmp/company_discovery_batch_*.json
```

## Step 1: Deep Company Research

This is the most important step. The quality of everything downstream depends on deeply understanding the user's company.

1. Ask the user for their company name or URL

2. **Check for an existing profile**:
   - List files in `{SKILL_DIR}/profiles/` (ignore `example.json`)
   - If a matching profile exists → load it, present to user: "I have your profile from {researched_at}. Still accurate?" If yes → skip to Step 2.
   - If no profile exists → proceed with deep research below.

3. **Run a full deep research on the user's company** using the Plan→Research→Synthesize pattern.
   See `references/research-patterns.md` for sub-question templates and research methodology.

   **Key research steps:**
   - Search: `bb search "{company name}" --num-results 10`
   - Fetch homepage: `node {SKILL_DIR}/scripts/extract_page.mjs "{company website}"`
   - **Discover site pages via sitemap** (do NOT hardcode paths like `/about` or `/customers`):
     1. `bb fetch --allow-redirects "{company website}/sitemap.xml"` — sitemap is small, raw `bb fetch` is fine
     2. Scan for URLs with keywords: `customer`, `case-stud`, `pricing`, `about`, `use-case`, `industry`, `solution`
     3. Optionally also fetch `/llms.txt` for page descriptions
     4. Pick 3-5 most relevant URLs and extract with `extract_page.mjs` (NOT raw `bb fetch`)
   - Search for external context and competitors
   - Accumulate findings with confidence levels

   **Synthesize into a profile**:
   Company, Product, Existing Customers, Competitors, Use Cases.
   Do NOT include ICP or sub-verticals — those are per-run decisions.

4. Present the profile to the user for confirmation. Do not proceed until confirmed.

5. **Save the confirmed profile** to `{SKILL_DIR}/profiles/{company-slug}.json`

6. **Ask clarifying questions** using `AskUserQuestion` with checkboxes:
   - "Which segments are you targeting?" with options derived from the company research
   - "Company stage?" — Startups, Mid-market, Enterprise, All
   - "How many companies / depth?" — Quick (~100), Deep (~50), Deeper (~25)
   - This is the ONLY user interaction. After this, execute silently until results are ready.

## Step 2: Depth Mode Selection

| Mode | Research per company | Best for |
|------|---------------------|----------|
| `quick` | Homepage + 1-2 searches | ~100 companies, broad scan |
| `deep` | 2-3 sub-questions, 5-8 tool calls | ~50 companies, solid research |
| `deeper` | 4-5 sub-questions, 10-15 tool calls | ~25 companies, full intelligence |

## Step 3: Discovery

**Formula**: `ceil(requested_companies / 35)` search queries needed. Over-discover by ~2-3x because filtering typically drops 50-70%.

Generate search queries with these patterns:
- Industry + company stage + geography ("fintech startups series A Bay Area")
- Technology stack + use case ("companies using Selenium for web scraping")
- Competitor adjacency ("alternatives to {known company in ICP}")
- Buyer persona + pain point ("engineering teams struggling with browser automation")

**Process**:
1. Launch ALL discovery subagents at once (up to ~6 per message). Each runs its queries in a SINGLE Bash call:
   ```bash
   bb search "{query}" --num-results 25 --output /tmp/company_discovery_batch_{N}.json
   ```
2. After all waves complete, deduplicate: `node {SKILL_DIR}/scripts/list_urls.mjs /tmp`
3. **Filter the URL list** — remove:
   - Blog posts, news articles (globenewswire.com, techcrunch.com, etc.)
   - Directories/aggregators (tracxn.com, crunchbase.com, g2.com)
   - The user's own competitors and existing customers (from profile)
   Keep only company homepages.

See `references/workflow.md` for subagent prompt templates and wave management.

## Step 4: Deep Research & Scoring

Launch subagents to research companies in parallel. See `references/workflow.md` for the enrichment subagent prompt template. See `references/research-patterns.md` for the full research methodology.

**Process**:
1. Split filtered URLs into groups per subagent (quick: ~10, deep: ~5, deeper: ~2-3)
2. Launch ALL enrichment subagents at once (up to ~6 per message)
3. Each subagent uses ONLY Bash — for each company:

   **Phase A — Plan** (skip in quick mode):
   Decompose into 2-5 sub-questions based on ICP and enrichment fields.

   **Phase B — Research Loop**:
   Search and fetch pages, extract findings. Respect step budget (quick: 2-3, deep: 5-8, deeper: 10-15).

   **Phase C — Synthesize**:
   Score ICP fit 1-10 with evidence. Fill enrichment fields from findings.

4. Subagents write ALL markdown files in a SINGLE Bash call using chained heredocs to `{OUTPUT_DIR}/`
5. After ALL subagents complete, proceed to Step 5

**Critical**: Include the confirmed ICP description verbatim in every subagent prompt. Pass the full literal `{OUTPUT_DIR}` path to every subagent.

## Step 5: Report & CSV

1. **Generate HTML report + CSV** (opens overview in browser automatically):
   ```bash
   node {SKILL_DIR}/scripts/compile_report.mjs {OUTPUT_DIR} --open
   ```
   This generates:
   - `{OUTPUT_DIR}/index.html` — overview page with scored table (opens in browser)
   - `{OUTPUT_DIR}/companies/*.html` — individual company pages (linked from overview)
   - `{OUTPUT_DIR}/results.csv` — scored spreadsheet for import into sheets/CRM

2. **Present a summary in chat** too:

```
## Company Research Complete

- **Total companies researched**: {count}
- **Depth mode**: {mode}
- **Score distribution**:
  - Strong fit (8-10): {count}
  - Partial fit (5-7): {count}
  - Weak fit (1-4): {count}
- **Report opened in browser**: ~/Desktop/{company_slug}_research_{date}/index.html
```

3. Show the **top companies** sorted by ICP score in a table:

```
| Company | Score | Product | Industry | Fit Reasoning |
|---------|-------|---------|----------|---------------|
| Acme | 9 | AI inventory management | E-commerce SaaS | Series A, uses Selenium, expanding to EU |
```

4. For the top 3-5 companies, show a brief research summary — key findings, why they're a good fit, and what specific angle to approach them with.

Offer to dig deeper into specific companies, adjust scoring criteria, or re-run discovery with different queries.
