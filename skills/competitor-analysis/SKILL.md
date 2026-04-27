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
  version: "0.2.0"
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

Follow these 8 steps in order. Do not skip or reorder.

1. **User Company Research** — Deeply understand the user's company, produce `precise_category` + `category_include_keywords` + `exclusion_list`
2. **Depth Mode + Seed Input** — Choose depth, accept optional seed competitor URLs
3. **Discovery (3 parallel waves)** — Wave A (alternatives), Wave B (precise category), Wave C (comparison-page graph via "X vs Y" title parsing)
4. **Gate** — `scripts/gate_candidates.mjs` bb-fetches each candidate's hero text and drops wrong-category URLs
5. **Confirm enrichment set with the user** — Present PASS / UNKNOWN / rejected-brand-matches via `AskUserQuestion`. User ticks the real ones, adds any the discovery missed. Skipping this step is wasteful because enrichment is expensive (25 subagents × depth budget) and the gate is imperfect (JS-heavy homepages, Cloudflare challenges, semantic-variant taglines)
6. **Deep Enrichment (5 subagents per competitor in deep/deeper modes)** — Marketing, Discussion, Social, News, Technical — each lane a separate subagent writing to `partials/`; then `merge_partials.mjs` consolidates. In deep/deeper modes, **Step 5d** adds a 6th Battle Card synthesis lane AFTER Step 5c fact-check completes — produces per-competitor Landmines / Objection Handlers / Talk Tracks grounded in cited evidence.
7. **Screenshots** — `capture_screenshots.mjs` via the `browse` CLI captures a 1280×800 homepage hero per competitor
8. **HTML Report** — Overview + per-competitor (with embedded hero screenshot + Battle Card card) + matrix + mentions views

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

This step sets the baseline for what "competitor" means AND produces the verified data the Step 5b matrix will use for the `userCompany` row.

**Rule**: The user's company gets the same 5-lane research depth as competitors. Do NOT fill `userCompany` in matrix.json from memory — it will ship false claims to the user's own team. On the Browserbase run 2026-04-23, skipping this step produced a matrix that claimed Browserbase had a "published uptime SLA" (there is no numeric public SLA — only a status page) and marked Stagehand's MIT-licensed OSS SDK as `open-source: false` (the repo is github.com/browserbase/stagehand, LICENSE confirmed MIT). Both errors would have surfaced in the "Where you're winning" card as fabricated moats.

Process:

1. Ask the user for their company name or URL.

2. **Check for an existing profile** at `{SKILL_DIR}/profiles/{company-slug}.json`. If it exists, load it and confirm with the user: "I have your profile from {researched_at}. Still accurate?" — if yes, skip to Step 2 BUT still run the partial-lane enrichment below so matrix synthesis has fresh feature evidence.
   The profile format is shared with `company-research` (same shape). If a user already has a profile saved under `company-research/profiles/`, you may copy it into this skill's profiles directory rather than re-researching.

3. **Run the full 5-lane enrichment on the user's company** — identical to the competitor pattern in Step 5. For each lane, spawn a Bash-only subagent that writes to `{OUTPUT_DIR}/partials/{user-slug}.{lane}.md`:
   - **marketing** — tagline, positioning, pricing tiers, features, integrations, open-source components (SDK repos + licenses), regions offered, compliance (SOC 2 / HIPAA / trust portal URL)
   - **technical** — CDP / Playwright / Puppeteer / Selenium driver support (with docs URLs), SDK languages, MCP server URL, stealth product name + tier, session replay + video recording specifics, published uptime SLA (actual %, not status page), third-party benchmarks
   - **discussion**, **social**, **news** — optional in quick mode, recommended in deep+
   See `references/research-patterns.md` → "Self-Research" for sub-questions. Each finding MUST cite a URL.

4. Run `merge_partials.mjs` on the user's partials too — produces `{OUTPUT_DIR}/{user-slug}.md`, the canonical source Step 5b reads from for `userCompany` flags.

5. Synthesize into a profile: Company, Product, Existing Customers, Competitors (seed list), Use Cases, **precise_category**, **category_include_keywords**, **exclusion_list**. Do NOT include ICP — this skill doesn't need it.
   - `precise_category`: one sentence describing the category. e.g., "cloud headless browser infrastructure for AI agents with CDP". Avoid vague words like "tools" / "platform".
   - `category_include_keywords`: 8-15 phrases a direct competitor's marketing would likely contain (hero or title). Include semantic variants.
   - `exclusion_list`: phrases that indicate a *different* category — used by the gate to reject false positives (e.g. `antidetect browser`, `scraping api`, `screenshot api`, `residential proxy`).
   See `references/research-patterns.md` → "Synthesis Output" for the exact format and Browserbase as a worked example.

6. Present the profile + the user-company `.md` to the user for confirmation. Do not proceed until confirmed.

7. **Save the confirmed profile** to `{SKILL_DIR}/profiles/{company-slug}.json`.

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
1. Issue **3 parallel `bb search` Bash calls** (one per wave) in a SINGLE message — NOT subagents. Each Bash call chains its 2-4 queries with `&&`. See `references/workflow.md` → "Discovery — parallel Bash, not subagents" for the exact recipe. Subagents are too heavy for a workload of 6-12 `bb search` calls.
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

**Evaluated on Browserbase** with 12 mixed candidates: 7/7 real competitors passed, 4/4 wrong-category rejected, 1 known-hybrid edge case rejected.

## Step 4.5: Confirm enrichment set with the user

**This step is mandatory. Do NOT skip to enrichment just because the gate ran.**

Enrichment is expensive: 5 competitors × 5 lane-subagents = 25 subagents, ~10-15 minutes of wall clock, ~300 `bb` calls. Running it on the wrong set wastes all of that. The gate also has known blind spots:

- **JS-heavy homepages** (e.g. Tavily, Firecrawl) — `bb fetch` returns near-empty text, so keyword matching has nothing to match on → REJECT or UNKNOWN
- **Cloudflare challenge pages** (e.g. Perplexity) — title becomes "Just a moment..." → no category signal
- **Semantic variants** — "search foundation" / "retrieval backbone" don't lexically match a list centered on "search API"
- **Domain ambiguity** — `brave.com` (the browser) vs `api-dashboard.search.brave.com` (the actual API product) can confuse classification

The user almost always has domain knowledge the skill lacks. Ask them.

**Process** — the main agent:

1. Read `/tmp/competitor_gated.jsonl` and group rows:
   - **PASS bucket**: everything with status=PASS.
   - **UNKNOWN bucket**: status=UNKNOWN (fetch failed — always surface, these are the silent misses).
   - **Rejected-brand bucket**: top ~10 REJECT rows whose title mentions a well-known brand pattern (e.g. contains the token from a user-supplied seed list, or appears frequently in the Wave C "X vs Y" graph).

2. Present the buckets to the user, one table per bucket, with URL + title + reason (for rejects).

3. Use `AskUserQuestion` with a checkbox list of all candidates across the three buckets, plus a free-text "add more" field. The prompt should be explicit:
   > "Here are the gate's picks plus a few it was unsure about. Tick the ones that are real competitors in your space, and paste any URLs I missed (comma-separated). Enrichment will run on ONLY the ticked set."

4. Write the confirmed set to `/tmp/competitor_enrichment_set.txt` (one URL per line). This is the input for Step 5 — not `/tmp/competitor_passed.txt`.

**If the user doesn't respond** or explicitly says "just run it", fall back to `/tmp/competitor_passed.txt` as-is, but warn in chat that the run may waste budget on wrong-category hits.

**Exa test, 2026-04-24**: gate auto-passed 22 of 101 candidates but missed Tavily (generic title), Jina AI (semantic mismatch — "search foundation"), Firecrawl (JS-heavy fetch failure), and Perplexity (Cloudflare challenge). All four are real direct competitors. This step catches them.

## Step 5: Deep Enrichment

Two modes. See `references/workflow.md` for prompt templates and wave management. See `references/research-patterns.md` for the lane-by-lane methodology.

### Quick mode — single subagent per batch
- Input: `/tmp/competitor_enrichment_set.txt` (user-confirmed set from Step 4.5), ~8 competitors per subagent.
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
**Launch ALL competitor × lane subagents in a SINGLE Agent tool message.** For 10 competitors × 5 lanes = 50 parallel Agent calls in one message. Do NOT split into batches per competitor or per lane — wall clock collapses to the slowest single agent (~3-5 min). Splitting into 5 rounds of 10 cost 25 minutes of wall clock vs 5 minutes parallel on a real measured run; do not do it.

Each subagent writes a partial to `{OUTPUT_DIR}/partials/{slug}.{lane}.md`.

**Critical**: Pass the user's company name, product, and key features verbatim into every subagent prompt so the technical lane can do strategic diffing. Pass the full literal `{OUTPUT_DIR}` path to every subagent.

### Merge partials → canonical per-competitor file
After all subagents for all competitors complete:
```bash
node {SKILL_DIR}/scripts/merge_partials.mjs {OUTPUT_DIR}
```
Unions the 5 partials per competitor into one `{OUTPUT_DIR}/{slug}.md` — dedup'd Mentions (sorted by date desc), dedup'd Benchmarks, merged Findings, canonical frontmatter from the marketing lane.

### Synthesize the comparison matrix (write `matrix.json`)

**Subagents write `key_features` and `integrations` as prose**, not as pipe-separated atomic feature labels. So a naive `|`-split axis becomes one-blob-per-competitor with no overlap — the rendered matrix shows a useless diagonal.

The main agent fixes this by synthesizing a **shared taxonomy** across competitors and writing `{OUTPUT_DIR}/matrix.json`. `compile_report.mjs` auto-detects this file and renders the matrix from it instead of from the pipe split.

**Process** — main agent:
1. Read ALL `{slug}.md` files, INCLUDING the user's company file `{user-slug}.md` produced in Step 1. The user is competitor #0 for matrix purposes — treat with identical rigor.
2. Produce a canonical list of 12-20 *atomic* features — each must be a yes/no proposition a competitor either has or doesn't (e.g. "MCP server", "SOC 2", "Site crawler", "Reranker"). Avoid sentence-length features. Avoid features only one competitor has.
3. Produce a canonical list of 10-20 integrations (frameworks, marketplaces, SDK languages).
4. For each company INCLUDING THE USER, map each taxonomy entry to `true` / `false` based on the enrichment data in their `.md` file. **Every flag must be traceable to a Research Findings bullet with a cited URL.** If the user's file says "Stagehand MIT-licensed (github.com/browserbase/stagehand)", the Open-source feature is `true` with that URL as the source. If not mentioned, leave `false`.
5. Write the result to `{OUTPUT_DIR}/matrix.json` in this shape:
   ```json
   {
     "category": "AI search APIs",
     "features": [{ "name": "Web Search API", "description": "..." }, ...],
     "integrations": [{ "name": "LangChain" }, ...],
     "userCompany": {
       "name": "Exa",
       "winningSummary": "Exa's moats are its first-party neural index and the integrated Research API — no one else in the set ships a semantic/embeddings-native retrieval primitive alongside a multi-step agentic research endpoint. It's also the only provider with a crawler product bundled in, and ties with SerpAPI on breadth of SDK language coverage.",
       "losingSummary": "Exa trails competitors on operational transparency — SerpAPI, Serper, and Tavily all publish hourly throughput SLAs, and Exa lacks a dedicated news endpoint that SerpAPI, Serper, and You.com all ship. Image/visual search is also missing vs 4 of 5 competitors.",
       "features": { "Web Search API": true, "Site crawler": true, ... },
       "integrations": { "LangChain": true, ... }
     },
     "competitors": {
       "tavily": {
         "features": { "Web Search API": true, "Site crawler": true, ... },
         "integrations": { "LangChain": true, "Databricks Marketplace": true, ... }
       },
       "serpapi": { "features": {...}, "integrations": {...} }
     }
   }
   ```

   **`userCompany` is required**. The overview page renders two cards — "Where {user} is winning" and "Where {user} is losing". Populate `userCompany.features` and `userCompany.integrations` from the self-research profile (Step 1). Without this field those two cards don't render.

   **`userCompany.winningSummary` / `losingSummary` are strongly preferred** (analyst-style prose, 2-4 sentences each). When present, the cards render as paragraphs instead of bulleted lists — reads like a briefing, not a spreadsheet. Write these AFTER the fact-check step below so prose is grounded in verified cells, not raw inference. If absent, the cards fall back to a bulleted list of winning/losing items with who-else-has-it.

If this step is skipped, the matrix view falls back to the raw pipe-split axis (useless for atomic comparison) and the strategic summary doesn't render. Do not skip.

### Fact-check the matrix — spot-check the high-stakes cells (default)

**Do not trust the taxonomy pass alone for high-stakes cells.** It is LLM inference from prose and will hallucinate moats. Observed during Browserbase run 2026-04-23: matrix.json claimed SOC 2 was unique to Browserbase; verification showed Hyperbrowser, Kernel, and Anchor Browser all have SOC 2 Type II.

But verifying every cell is the opposite mistake. A 7-company × 33-axis matrix has 231 cells. The Apr 2026 Browserbase run got stuck at 111+ tool calls in fact-check before interrupt — the subagent kept going on table-stakes cells (Playwright support, CDP, Python SDK) that are universal in the category.

**Default = spot-check, not full sweep.** Only verify cells that meaningfully change the strategic narrative.

Launch a single fact-check subagent (Bash-only) with **a hard 25-call budget** that targets ONLY these high-stakes axes:

1. **Every `userCompany.features` and `userCompany.integrations` cell** (the user's own moats — these go straight into "Where you're winning" prose). Typical: 17 + 16 = 33 cells, but most are obvious (your own product). Focus on:
   - Anything claimed as a *moat* in `winningSummary`
   - Anything claimed as a *gap* in `losingSummary`
   - Compliance (SOC 2, HIPAA, ISO 27001, GDPR)
   - Open-source license claims (MIT / Apache 2.0 / AGPL — observed wrong on Steel)
   - Published uptime SLA (status page ≠ SLA)

2. **Across competitors, only the cells that drive the win/loss summary**:
   - For each "Winning" claim, verify the user has it AND verify the competitors don't.
   - For each "Losing" claim, verify the named competitors do have it.
   - Compliance + license + SLA across all competitors (high-trust, frequently wrong).

3. **Do NOT verify**:
   - Universal table-stakes (Playwright, Puppeteer, CDP, Python SDK) — every cloud browser has these.
   - `false` cells with no claim being made (no moat lost or won).
   - Integration cells unless they appear in the win/loss summary.

```
You are a matrix spot-check subagent. Budget: 25 bb calls TOTAL across all cells.
Stop and return what you have when you hit the budget — partial fact-check is
better than blocking the rest of the pipeline.

TOOL RULES: Bash ONLY. bb search + bb fetch. Count your calls; stop at 25.

PRIORITY ORDER (highest-stakes first — work down until budget):
1. Every cell that appears in userCompany.winningSummary or losingSummary
2. Compliance cells (SOC 2, HIPAA, ISO 27001) for user + every competitor
3. Open-source / self-hostable + license cells across all competitors
4. Pricing tier numbers ($X/mo, /hr) for user + competitors named in summaries
5. Funding / employee_estimate fields (only if cited in summaries)

Skip:
- Universal cells (Playwright, Puppeteer, CDP, Python SDK, etc.)
- `false` cells where no claim is being made
- Integration matrix cells unless they appear in summaries

For each cell verified:
- If `true` — find one source URL (docs, trust portal, GitHub LICENSE, etc).
- If `false` — one targeted bb search. Flip ONLY on first-party evidence.

Output: matrix.json with `sources: { "Feature": "https://..." }` on the
verified cells (other cells stay as-is). Cells-changed log to
{OUTPUT_DIR}/matrix_fact_check.md with each flip + URL + quoted evidence.
Report back: "spot-check: N cells verified, M flipped, B/25 budget used".
```

**Full-sweep mode (opt-in, slower)**: if the user explicitly says "full fact check" or for a high-stakes deliverable (board deck, press release), set the budget to 80 calls and verify every non-universal cell. Default is spot-check.

After the subagent completes, re-read matrix.json, recompile, and surface `matrix_fact_check.md` delta to the user. The summary is much more trustworthy with spot-check than without — and ships in 3-5 minutes instead of stalling the pipeline.

### Step 5d: Battle Card synthesis (deep/deeper only, after Step 5c)

**Depends on fact-checked matrix.json from Step 5c.** This is a sales-enablement lane. For each competitor, launch a Bash-only synthesis subagent (no new `bb` calls) that reads all 5 existing partials + the user's merged `.md` + fact-checked `matrix.json`, and produces per-competitor Landmines / Objection Handlers / Talk Tracks grounded in cited evidence.

Prompt template: `references/battle-card-subagent.md` (substitute `{COMPETITOR_SLUG}` / `{COMPETITOR_NAME}` / `{USER_COMPANY_NAME}` / `{USER_WINNING_SUMMARY}` per competitor). Format spec: `references/battle-card.md`.

Output: `{OUTPUT_DIR}/partials/{slug}.battle.md` with a `## Battle Card` section. `merge_partials.mjs` unions this into the consolidated `{slug}.md`. `compile_report.mjs` renders it as a brand-accented card on the per-competitor HTML page.

**Why this lane is synthesis-only** — battle cards must be grounded in facts that already survived Step 5c. Letting the subagent do fresh `bb` searches would reintroduce the hallucinated-moat problem the fact-check step exists to prevent. The subagent's adversarial self-check explicitly rejects claims not traceable to an input partial bullet or a `sources`-backed matrix cell.

Parallelism: 1 subagent per competitor, all in one Agent-tool message (synthesis is fast, ~3-5 Bash calls per subagent). Skip this step in `quick` mode — there isn't enough research depth to ground the cards credibly.

## Step 6: Screenshots

Capture a homepage hero screenshot per competitor:
```bash
node {SKILL_DIR}/scripts/capture_screenshots.mjs {OUTPUT_DIR} --env remote
```

Uses the `browse` CLI — a separate package from `bb` (`npm install -g @browserbasehq/browse-cli`). Connects to a Browserbase remote session by default. Writes one PNG per competitor to `{OUTPUT_DIR}/screenshots/{slug}-hero.png`. The compile step in Step 7 auto-embeds the hero on each per-competitor HTML page.

Cost: ~10-20s per competitor. ~60s for 5 competitors.

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
