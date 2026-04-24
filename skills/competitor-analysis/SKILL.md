---
name: competitor-analysis
description: |
  Competitor research and intelligence skill. Takes a user's company (with optional
  seed competitor URLs), auto-discovers additional competitors via Browserbase Search API,
  deeply researches each using a 4-lane pattern (marketing surface, external signal,
  public benchmarks, strategic diff vs the user's company), and compiles the results
  into an HTML report with four views: overview, per-competitor deep dive, side-by-side
  feature/pricing matrix, and a chronological mentions feed (benchmarks, comparison
  pages, news, Reddit, HN, LinkedIn posts, YouTube videos, reviews).
  Use when the user wants to: (1) analyze competitors, (2) build a competitive matrix,
  (3) extract competitor pricing / features, (4) find comparison pages and online
  mentions of competitors, (5) surface public benchmarks. Triggers: "competitor analysis",
  "analyze competitors", "competitive intel", "competitor research", "competitor pricing",
  "feature comparison", "price comparison", "find comparisons", "who's comparing us",
  "competitor mentions", "competitor benchmarks".
license: MIT
compatibility: Requires bb CLI (@browserbasehq/cli) and BROWSERBASE_API_KEY env var
allowed-tools: Bash Agent AskUserQuestion
metadata:
  author: browserbase
  version: "0.1.0"
---

# Competitor Analysis

Analyze a user's competitors. Uses Browserbase Search API for discovery and a 4-lane Plan→Research→Synthesize pattern for enrichment — outputting an HTML report with overview, per-competitor deep dives, a side-by-side feature/pricing matrix, and a chronological mentions feed.

**Required**: `BROWSERBASE_API_KEY` env var and `bb` CLI installed.

**First-run setup**: On the first run you'll be prompted to approve `bb fetch`, `bb search`, `cat`, `mkdir`, `sed`, etc. Select **"Yes, and don't ask again for: bb fetch:\*"** (or equivalent) for each. To permanently approve, add these to your `~/.claude/settings.json` under `permissions.allow`:
```json
"Bash(bb:*)", "Bash(bunx:*)", "Bash(bun:*)", "Bash(node:*)",
"Bash(cat:*)", "Bash(mkdir:*)", "Bash(sed:*)", "Bash(head:*)", "Bash(tr:*)", "Bash(rm:*)"
```

**Path rules**: Always use full literal paths in Bash — NOT `~` or `$HOME`. Resolve the home directory once and use it everywhere. When building subagent prompts, replace `{SKILL_DIR}` with the full literal path.

**Output directory**: All output goes to `~/Desktop/{company_slug}_competitors_{YYYY-MM-DD}/`. This directory contains one `.md` file per competitor plus the generated HTML views and CSV.

**CRITICAL — Tool restrictions (applies to main agent AND all subagents)**:
- All web searches: use `bb search`. NEVER WebSearch.
- All page fetches: use `bb fetch --allow-redirects`. NEVER WebFetch. Pipe through `sed ... | tr -s ' \n'` to extract text. 1 MB response limit — fall back to `bb browse` for JS-heavy pages.
- All research output: subagents write **one markdown file per competitor** to `{OUTPUT_DIR}/{competitor-slug}.md` using bash heredoc. NEVER use the Write tool or `python3 -c`. See `references/example-research.md` for the file format.
- Report compilation: use `node {SKILL_DIR}/scripts/compile_report.mjs {OUTPUT_DIR} --user-company "{user_company}" --open` — generates `index.html`, `competitors/*.html`, `matrix.html`, `mentions.html`, `results.csv` in one step and opens overview.
- URL deduplication: `node {SKILL_DIR}/scripts/list_urls.mjs /tmp --prefix competitor`.
- **Subagents must use ONLY the Bash tool.**
- **Main agent NEVER reads raw discovery JSON batch files.**

**CRITICAL — Minimize permission prompts**:
- Subagents MUST batch ALL file writes into a SINGLE Bash call using chained heredocs.
- Batch ALL searches and ALL fetches into single Bash calls via `&&` chaining.

## Pipeline Overview

Follow these 7 steps in order. Do not skip or reorder.

1. **User Company Research** — Deeply understand the user's company, produce `precise_category` + `category_include_keywords` + `exclusion_list`
2. **Depth Mode + Seed Input** — Choose depth, accept optional seed competitor URLs
3. **Discovery (3 parallel waves)** — Wave A (alternatives), Wave B (precise category), Wave C (comparison-page graph via "X vs Y" title parsing)
4. **Gate** — `scripts/gate_candidates.mjs` bb-fetches each candidate's hero text and drops wrong-category URLs
5. **Deep Enrichment (5 subagents per competitor in deep/deeper modes)** — Marketing, Discussion, Social, News, Technical — each lane a separate subagent writing to `partials/`; then `merge_partials.mjs` consolidates
6. **Screenshots** — `capture_screenshots.mjs` via the `browse` CLI captures homepage hero + full-page pricing for each competitor
7. **HTML Report** — Overview + per-competitor (with embedded screenshots) + matrix + mentions views

---

## Step 0: Setup Output Directory

```bash
OUTPUT_DIR=~/Desktop/{company_slug}_competitors_{YYYY-MM-DD}
mkdir -p "$OUTPUT_DIR"
```

Replace `{company_slug}` with the user's company name (lowercase, hyphenated) and `{YYYY-MM-DD}` with today's date. Pass `{OUTPUT_DIR}` as a full literal path to every subagent.

Clean up discovery batch files from prior runs:
```bash
rm -f /tmp/competitor_discovery_batch_*.json
```

## Step 1: User Company Research

This step sets the baseline for what "competitor" means.

1. Ask the user for their company name or URL.

2. **Check for an existing profile** at `{SKILL_DIR}/profiles/{company-slug}.json`. If it exists, load it and confirm with the user: "I have your profile from {researched_at}. Still accurate?" — if yes, skip to Step 2.
   The profile format is shared with `company-research` (same shape). If a user already has a profile saved under `company-research/profiles/`, you may copy it into this skill's profiles directory rather than re-researching.

3. **No profile exists** → run the self-research flow. See `references/research-patterns.md` → "Self-Research" for sub-questions and page-discovery rules.

4. Synthesize into a profile: Company, Product, Existing Customers, Competitors (seed list), Use Cases, **precise_category**, **category_include_keywords**, **exclusion_list**. Do NOT include ICP — this skill doesn't need it.
   - `precise_category`: one sentence describing the category. e.g., "cloud headless browser infrastructure for AI agents with CDP". Avoid vague words like "tools" / "platform".
   - `category_include_keywords`: 8-15 phrases a direct competitor's marketing would likely contain (hero or title). Include semantic variants.
   - `exclusion_list`: phrases that indicate a *different* category — used by the gate to reject false positives (e.g. `antidetect browser`, `scraping api`, `screenshot api`, `residential proxy`).
   See `references/research-patterns.md` → "Synthesis Output" for the exact format and Browserbase as a worked example.

5. Present the profile to the user. Do not proceed until confirmed.

6. **Save the confirmed profile** to `{SKILL_DIR}/profiles/{company-slug}.json`.

## Step 2: Depth Mode + Seed Input

Ask clarifying questions via `AskUserQuestion` with checkboxes:
- **Known competitors?** Text area for URLs/names (optional — discovery will find more).
- **Depth mode?**
  - `quick` — marketing surface only, many competitors, ~2-3 tool calls each
  - `deep` — + external signal (mentions, reviews, news), ~5-8 tool calls each
  - `deeper` — + public benchmarks + strategic diff vs user's company, ~10-15 tool calls each
- **Target count?** Rough number of competitors to research (e.g., 10 / 20 / 50).

This is the ONLY user interaction. After this, execute silently until the report is ready.

| Mode | Research per competitor | Best for |
|------|--------------------------|----------|
| `quick` | Lane 1 only (homepage + pricing) | Scanning ~30-50 competitors fast |
| `deep` | Lanes 1+2 | ~15-25 competitors with external signal |
| `deeper` | All 4 lanes (+ benchmarks + strategic diff) | ~5-15 competitors with full intel |

## Step 3: Discovery (3 parallel waves)

**Formula**: `ceil(target_count / 20)` queries per wave. Over-discover ~3x because the gate drops ~40-60%.

Evaluation on Browserbase shows all three waves are additive — skip any and you lose real competitors:

**Wave A — Generic alternatives** (broad; heavy aggregator noise, filtered out later)
- `"alternatives to {user_company}"`
- `"{user_company} competitors"`

**Wave B — Precise category** (uses `precise_category` from the profile)
- `"{precise_category}"` verbatim
- 2-3 queries composed from the most distinctive tokens (e.g. `"cloud browser for ai agents"`, `"browser infrastructure API"`)

**Wave C — Comparison-page graph** (highest precision)
- `"{user_company} vs"`
- `"{seed1} vs"`, `"{seed2} vs"`, `"{seed3} vs"` (seeds from the profile's `competitors` list)
- After the searches, run `scripts/extract_vs_names.mjs` to parse `"X vs Y"` patterns from result titles — this uniquely surfaces competitors that don't appear as URL hits.

**Process**:
1. Launch discovery subagents in a single message (up to ~6), split across the three waves. Each subagent runs its queries in ONE Bash call:
   ```bash
   bb search "{query}" --num-results 25 --output /tmp/competitor_discovery_batch_{N}.json
   ```
2. After all waves complete:
   ```bash
   node {SKILL_DIR}/scripts/list_urls.mjs /tmp --prefix competitor > /tmp/competitor_urls.txt
   node {SKILL_DIR}/scripts/extract_vs_names.mjs /tmp --prefix competitor \
     --seed "{user_company},{seed1},{seed2},{seed3}" \
     > /tmp/competitor_vs_names.jsonl
   ```
3. **Filter** `/tmp/competitor_urls.txt` — remove blog posts, news, AI-tool directories (seektool.ai, respan.ai, agentsindex.ai, toolradar.com, aitoolsatlas.ai, vibecodedthis.com, etc.), review aggregators (g2.com, capterra.com), databases (crunchbase.com, tracxn.com), user's own domain. See `references/workflow.md` for the full noise-domain list.
4. For `vs_names` entries that have a resolved `domain`, add them. For unresolved names, optionally run `bb search "{name}" --num-results 3` and pick the top root domain.
5. Merge with user-provided seed URLs. Dedup by hostname → `/tmp/competitor_candidates.txt`.

## Step 4: Gate (category-fit filter)

Drop candidates whose marketing identifies them as a *different* category before enrichment burns tool calls on them.

```bash
cat /tmp/competitor_candidates.txt \
  | node {SKILL_DIR}/scripts/gate_candidates.mjs \
      --include "{profile.category_include_keywords joined with commas}" \
      --exclude "{profile.exclusion_list joined with commas}" \
      --concurrency 6 \
  > /tmp/competitor_gated.jsonl

grep '"status":"PASS"' /tmp/competitor_gated.jsonl \
  | node -e 'require("fs").readFileSync(0,"utf-8").split("\n").filter(Boolean).forEach(l => { try { console.log(JSON.parse(l).url); } catch {} })' \
  > /tmp/competitor_passed.txt
```

The gate fetches each candidate's homepage via `bb fetch --allow-redirects`, extracts the first 800 chars of visible text, and classifies position-aware: exclude in `<title>` → REJECT; include in `<title>` → PASS; hybrid title → hero200 tiebreak; otherwise fall through.

**Review the PASS/REJECT split** in `/tmp/competitor_gated.jsonl`. Spot-check for miscategorizations. If a known direct competitor was REJECTED because their marketing straddles categories (e.g. browser + scraping), manually add their URL to `/tmp/competitor_passed.txt`.

**Evaluated on Browserbase** with 12 mixed candidates: 7/7 real competitors passed, 4/4 wrong-category rejected, 1 known-hybrid edge case rejected.

## Step 5: Deep Enrichment

Two modes. See `references/workflow.md` for prompt templates and wave management. See `references/research-patterns.md` for the lane-by-lane methodology.

### Quick mode — single subagent per batch
- Input: `/tmp/competitor_passed.txt` (gate survivors), ~8 competitors per subagent.
- One subagent runs Lane A only (marketing surface). 2-3 tool calls each.
- Writes directly to `{OUTPUT_DIR}/{slug}.md`.

### Deep / Deeper mode — 5 subagents PER competitor (parallel lane fan-out)
For each competitor, launch 5 parallel subagents, one per lane:
- **A. Marketing** (`marketing`): pricing, features, positioning, integrations, customers, team, funding, HQ. Owns canonical frontmatter.
- **B. Discussion** (`discussion`): Reddit, HN, forums, Dev.to, Hashnode. Broad queries beyond `site:` — also `"{competitor}" review 2026`, `"{competitor}" issues OR problems`, `"{competitor}" discussion`.
- **C. Social** (`social`): LinkedIn posts, YouTube videos, Twitter/X. Snippets only — do NOT fetch.
- **D. News & Comparisons** (`news`): TechCrunch, Verge, VentureBeat, Forbes, Businesswire, Substack, blog reviews. Every mention needs a date.
- **E. Technical & Benchmarks** (`technical`): GitHub benchmark repos/PRs, performance posts. Writes Benchmarks + technical Findings.

Budget per lane: deep = 5-8 tool calls, deeper = 10-15.
Launch all 5 lane-subagents for ONE competitor in a single Agent tool call set (5 parallel). Across 5 competitors = 5 messages.

Each subagent writes a partial to `{OUTPUT_DIR}/partials/{slug}.{lane}.md`.

**Critical**: Pass the user's company name, product, and key features verbatim into every subagent prompt so the technical lane can do strategic diffing. Pass the full literal `{OUTPUT_DIR}` path to every subagent.

### Merge partials → canonical per-competitor file
After all subagents for all competitors complete:
```bash
node {SKILL_DIR}/scripts/merge_partials.mjs {OUTPUT_DIR}
```
Unions the 5 partials per competitor into one `{OUTPUT_DIR}/{slug}.md` — dedup'd Mentions (sorted by date desc), dedup'd Benchmarks, merged Findings, canonical frontmatter from the marketing lane.

## Step 6: Screenshots

Capture homepage hero + full-page pricing screenshots for each competitor:
```bash
node {SKILL_DIR}/scripts/capture_screenshots.mjs {OUTPUT_DIR} --env remote
```

Uses the `browse` CLI (`npm install -g @browserbasehq/browse-cli`) against a Browserbase remote session. Writes PNGs to `{OUTPUT_DIR}/screenshots/{slug}-{hero,pricing}.png`. The compile step in Step 7 auto-embeds them on each per-competitor HTML page.

Cost: ~15-20s per competitor. ~90s for 5 competitors.

## Step 7: HTML Report

1. **Generate all views + CSV** (opens overview in browser):
   ```bash
   node {SKILL_DIR}/scripts/compile_report.mjs {OUTPUT_DIR} --user-company "{user_company}" --open
   ```
   Produces:
   - `{OUTPUT_DIR}/index.html` — overview: competitor table with tagline, pricing summary, key features, strategic diff
   - `{OUTPUT_DIR}/competitors/{slug}.html` — per-competitor deep dive (all sections)
   - `{OUTPUT_DIR}/matrix.html` — side-by-side feature/pricing matrix
   - `{OUTPUT_DIR}/mentions.html` — chronological feed with source-type pills + client-side filter
   - `{OUTPUT_DIR}/results.csv` — flat spreadsheet

2. **Present a chat summary**:

```
## Competitor Analysis Complete

- **Competitors researched**: {count}
- **Depth mode**: {mode}
- **Mentions collected**: {total mentions} across {source types count} source types
- **Public benchmarks found**: {count}
- **Opened in browser**: ~/Desktop/{company_slug}_competitors_{date}/index.html
```

3. Show the **overview table** in chat:

```
| Competitor | Positioning | Pricing | Key Features | Strategic Diff |
|------------|-------------|---------|--------------|----------------|
| Rival Co | AI-native headless browser | $99/mo entry | stealth, proxies, CAPTCHA | Similar infra; cheaper entry |
```

4. Call out the top 3-5 most interesting findings — e.g., "3 competitors have public benchmarks; Rival Co is cheapest; Foo Inc launched a session-replay feature 2 weeks ago." Offer to dig deeper into any specific competitor or re-run with different depth.
