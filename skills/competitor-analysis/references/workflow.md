# Competitor Analysis — Workflow Reference

## Discovery Batch JSON Schema

File: `/tmp/competitor_discovery_batch_{N}.json`

`bb search --output` writes a JSON object:

```json
{
  "requestId": "abc123",
  "query": "alternatives to acme",
  "results": [
    { "url": "https://example.com", "title": "Example Corp", "author": null, "publishedDate": null }
  ]
}
```

The `list_urls.mjs` script (run with `--prefix competitor`) deduplicates across batches.

## Competitor Research Markdown Format

File: `{OUTPUT_DIR}/{competitor-slug}.md` — see `references/example-research.md` for the full template.

**YAML frontmatter fields** (used by `compile_report.mjs`):
- `competitor_name` (required)
- `website` (required)
- `tagline`
- `positioning`
- `product_description`
- `target_customer`
- `pricing_model`
- `pricing_tiers` (pipe-separated: `Free | Pro $99 | Enterprise Contact`)
- `key_features` (pipe-separated)
- `integrations` (pipe-separated)
- `headquarters`
- `founded`
- `employee_estimate`
- `funding_info`
- `strategic_diff` (one-line for overview table; deeper mode only)

**Body sections** (in this order — `compile_report.mjs` parses by heading):
- `## Product`
- `## Pricing`
- `## Features`
- `## Positioning`
- `## Comparison vs {user_company}` (deeper only)
- `## Mentions`
- `## Benchmarks` (deeper only)
- `## Research Findings`

**Mentions line format** (parsed into the mentions feed):
```
- **[SourceType]** Title | Snippet (source: URL, YYYY-MM-DD)
```
`SourceType` ∈ `Benchmark | Comparison | News | Reddit | HN | LinkedIn | YouTube | Review | Podcast | X`. Date is optional but preferred.

## Extracting Text from HTML

`bb fetch --allow-redirects` returns raw HTML. To extract readable text in one pipe:

```bash
bb fetch --allow-redirects "https://rivalco.com/pricing" | sed 's/<script[^>]*>.*<\/script>//g; s/<style[^>]*>.*<\/style>//g; s/<[^>]*>//g; s/&amp;/\&/g; s/&lt;/</g; s/&gt;/>/g; s/&nbsp;/ /g; s/&#[0-9]*;//g' | tr -s ' \n' | head -c 3000
```

Limit to ~3000 chars per page to keep subagent context manageable. For JS-heavy pages (client-rendered pricing tables), use `bb browse` instead of `bb fetch`.

## Discovery Subagent Prompt Template

```
You are a competitor discovery subagent. Run search queries and save results.

TOOL RULES — CRITICAL, FOLLOW EXACTLY:
1. You may ONLY use the Bash tool. No exceptions.
2. Run ALL searches in a SINGLE Bash call using && chaining.
3. BANNED TOOLS: WebFetch, WebSearch, Write, Read, Glob, Grep — ALL BANNED.
4. NEVER use ~ or $HOME in paths — use full literal paths.

TASK:
Run ALL of the following searches in ONE Bash command:

bb search "{query1}" --num-results 25 --output /tmp/competitor_discovery_batch_{N1}.json && \
bb search "{query2}" --num-results 25 --output /tmp/competitor_discovery_batch_{N2}.json && \
bb search "{query3}" --num-results 25 --output /tmp/competitor_discovery_batch_{N3}.json && \
echo "Discovery complete"

After the command completes, report back ONLY the count of results per batch.
Do NOT analyze, summarize, or return the actual results.
```

### Discovery query patterns

Discovery uses **three parallel waves** (evaluated — all three are additive):

**Wave A — Generic alternatives** (broad net, lots of noise):
- `"alternatives to {user_company}"`
- `"{user_company} competitors"`

**Wave B — Precise category queries** (uses `precise_category` from self-research):
- `"{precise_category}"` verbatim
- `"{precise_category_2_3_keywords}"` — pick the 3 most distinctive tokens
- Compose with "API", "cloud", "for agents": `"cloud {primary_noun} for ai agents"`, `"{primary_noun} infrastructure API"`

**Wave C — Comparison-page graph** (highest-precision single wave):
- `"{user_company} vs"`
- For each seed competitor from the user's profile, also run `"{seed} vs"`
- After the searches, `scripts/extract_vs_names.mjs` parses `"X vs Y"` titles across all Wave C results to surface candidate names that don't appear as URLs.

**Evaluation result** (tested on Browserbase): Wave A returns ~10% real competitors (mostly AI-tool-listicle aggregators). Wave B returns ~35%. Wave C uniquely surfaces named brands via title parsing that neither A nor B finds. Use all three.

## Enrichment fan-out — 5 subagents PER competitor (deep/deeper modes)

For each gated-PASS competitor, launch **five parallel subagents**, one per lane. Each subagent writes a *partial* to `{OUTPUT_DIR}/partials/{slug}.{lane}.md`. After all subagents complete, `scripts/merge_partials.mjs` unions the partials into one canonical `{OUTPUT_DIR}/{slug}.md` per competitor (dedup mentions by URL, sort by date desc).

The 5 lanes:

| Lane | Slug | Scope |
|------|------|-------|
| **A. Marketing** | `marketing` | Owns canonical frontmatter. Pricing, features, positioning, integrations, customers, target, team, funding, HQ. Homepage + sitemap-driven page discovery. |
| **B. Discussion** | `discussion` | Reddit, HN, forums, dev.to, hashnode. Broader queries beyond `site:` restrictions — also `"{competitor}" discussion`, `"{competitor}" review 2026`, `"{competitor}" issues OR problems`. Writes Mentions bullets with dates. |
| **C. Social** | `social` | LinkedIn posts, YouTube videos, Twitter/X threads. Search snippets only — do NOT fetch (auth walls). |
| **D. News & Comparisons** | `news` | Comparison pages ("X vs Y"), TechCrunch / Verge / Forbes / VentureBeat / Businesswire, independent blog reviews, Substack. Every mention MUST include a date. |
| **E. Technical & Benchmarks** | `technical` | GitHub benchmark repos/PRs, performance blog posts, independent tests. Writes Benchmarks bullets AND Findings on technical specifics (CDP support, uptime, concurrency limits, SDKs). |

**Wave management for 5 competitors × 5 lanes = 25 subagents**: launch 5 subagents per competitor in ONE message (all 5 lanes parallel), sequentially per competitor across 5 messages. Or for ≤3 competitors, fit all 15 subagents in 3 messages.

**Merge step** (once all partials exist):
```bash
node {SKILL_DIR}/scripts/merge_partials.mjs {OUTPUT_DIR}
```
Produces one `{OUTPUT_DIR}/{slug}.md` per competitor with dedup'd Mentions (sorted date desc), Benchmarks, and Findings.

## Legacy: Single-subagent template (quick mode only)

In `quick` mode, keep a single subagent per batch of competitors (no fan-out — Lane 1 only, budget 2-3 calls each).

```
You are a competitor enrichment subagent. For each competitor URL, run the 4-lane research
pattern and write a single markdown file per competitor.

CONTEXT:
- User's company: {user_company}
- User's product: {user_product}
- User's key features: {user_key_features}
- Depth mode: {depth_mode}   (quick | deep | deeper)
- Output directory: {OUTPUT_DIR}   ← write files HERE, as a full literal path

COMPETITOR URLS TO PROCESS:
{url_list}

TOOL RULES — CRITICAL, FOLLOW EXACTLY:
1. You may ONLY use the Bash tool. No exceptions.
2. All searches: Bash → bb search "..." --num-results 10
3. All page fetches: Bash → bb fetch --allow-redirects "..."
   bb fetch returns RAW HTML. To extract text, pipe through:
   sed 's/<script[^>]*>.*<\/script>//g; s/<style[^>]*>.*<\/style>//g; s/<[^>]*>//g' | tr -s ' \n' | head -c 3000
   If a page returns thin content or "enable JavaScript", use bb browse instead.
4. BATCH all file writes: Write ALL markdown files in a SINGLE Bash call using chained heredocs.
5. BANNED TOOLS: WebFetch, WebSearch, Write, Read, Glob, Grep — ALL BANNED.
6. NEVER use ~ or $HOME in paths — use full literal paths.

RESEARCH PATTERN (per competitor — lanes are depth-gated):

LANE 1 — Marketing Surface (always run):
  a. Fetch competitor homepage
  b. Discover via sitemap: /sitemap.xml — find /pricing, /features, /integrations, /customers
  c. Fetch 2-4 most relevant pages
  d. Extract: tagline, positioning, product_description, target_customer,
     pricing_model, pricing_tiers, key_features, integrations

LANE 2 — External Signal (deep + deeper):
  Run these searches:
    bb search "{competitor} vs"
    bb search "{competitor} alternatives review"
    bb search "site:reddit.com {competitor}"
    bb search "site:news.ycombinator.com {competitor}"
    bb search "site:linkedin.com/posts {competitor}"
    bb search "site:youtube.com {competitor}"
    bb search "{competitor} G2 OR Capterra"
    bb search "{competitor} launch OR funding 2025 OR 2026"

  For each search result, classify source type from URL:
    reddit.com → Reddit
    news.ycombinator.com → HN
    linkedin.com → LinkedIn
    youtube.com/youtu.be → YouTube
    twitter.com/x.com → X (or Twitter — either works)
    dev.to → DevTo
    hashnode.dev, hashnode.com → Hashnode
    *.substack.com → Substack
    spotify.com/episode, transistor.fm, simplecast.com → Podcast
    g2.com/capterra.com/trustradius.com → Review
    url or title contains "vs" → Comparison
    techcrunch/theverge/venturebeat/forbes/businesswire/wired/fortune → News
    other blog domain → Blog

  Record each as a Mentions line with title + one-line snippet + URL + **date**. Always include
  the date when available. `bb search` returns `publishedDate` in the JSON result — prefer it.
  If absent, parse the year from title/URL (e.g. "2026" or `/2025/11/` in a news URL).
  For LinkedIn and YouTube — use search snippet only, do NOT fetch the page.

LANE 3 — Public Benchmarks (deeper only):
  Run these searches:
    bb search "{competitor} benchmark"
    bb search "site:github.com {competitor} benchmark"
    bb search "{category} benchmark {competitor}"

  Record each hit in ## Benchmarks with: title, source, URL, one-line key finding.
  Also append to ## Mentions with type Benchmark.

LANE 4 — Strategic Diff vs {user_company} (deeper only):
  Using Lane 1-3 findings + the user's company profile, write:
  ## Comparison vs {user_company}
  - Overlaps: ...
  - Gaps: ...
  - Where they win: ...
  - Where you win: ...
  Also fill the `strategic_diff` frontmatter field with a one-line summary.

BUDGETS (respect strictly):
  quick:  2-3 tool calls per competitor (homepage + 1-2 pages)
  deep:   5-8 tool calls per competitor (Lane 1 + Lane 2)
  deeper: 10-15 tool calls per competitor (all 4 lanes)

OUTPUT — write ALL competitor files in a SINGLE Bash call using chained heredocs directly to {OUTPUT_DIR}:

cat << 'COMPETITOR_MD' > {OUTPUT_DIR}/{slug1}.md
---
competitor_name: {name}
website: {url}
tagline: {tagline}
positioning: {positioning}
product_description: {description}
target_customer: {audience}
pricing_model: {model}
pricing_tiers: {tier1} | {tier2} | {tier3}
key_features: {f1} | {f2} | {f3}
integrations: {i1} | {i2}
headquarters: {hq}
founded: {year}
employee_estimate: {estimate}
funding_info: {funding}
strategic_diff: {one line — deeper only}
---

## Product
{paragraph}

## Pricing
{bullets per tier}

## Features
{bullets}

## Positioning
{paragraph}

## Comparison vs {user_company}    ← deeper only
- Overlaps: ...
- Gaps: ...
- Where they win: ...
- Where you win: ...

## Mentions
- **[SourceType]** Title | Snippet (source: URL, YYYY-MM-DD)

## Benchmarks                       ← deeper only
- Title | Source | URL | Key finding

## Research Findings
- **[confidence]** Fact (source: URL)
COMPETITOR_MD
cat << 'COMPETITOR_MD' > {OUTPUT_DIR}/{slug2}.md
...
COMPETITOR_MD

Use 'COMPETITOR_MD' (quoted) as the heredoc delimiter to prevent shell variable expansion.

Report back ONLY: "Batch {batch_id}: {succeeded}/{total} competitors researched, {mentions_count} mentions, {benchmarks_count} benchmarks."
Do NOT return raw data to the main conversation.
```

## Wave Management

### Key Principle: Maximize Parallelism, Minimize Prompts
Launch as many subagents as possible in a single message (up to ~6 per message). Each subagent MUST batch all its Bash operations.

### Discovery Phase
- Launch up to 6 discovery subagents in a single message, split by wave (A/B/C — see "Discovery query patterns" above)
- Each subagent runs ALL its queries in ONE Bash call with `&&` chaining
- After all waves complete, run the following in sequence:
  ```bash
  # 1. Dedup URLs from all batches
  node {SKILL_DIR}/scripts/list_urls.mjs /tmp --prefix competitor > /tmp/competitor_urls.txt

  # 2. Extract candidate names from "X vs Y" titles (Wave C output)
  node {SKILL_DIR}/scripts/extract_vs_names.mjs /tmp --prefix competitor \
    --seed "{user_company},{seed1},{seed2},{seed3}" \
    > /tmp/competitor_vs_names.jsonl
  ```
- **Filter URLs**: Remove blog posts, news articles, AI-tool directories (seektool.ai, respan.ai, agentsindex.ai, toolradar.com, aitoolsatlas.ai, aidirectory.com, vibecodedthis.com, aichief.com, openalternative.co, cbinsights.com, saasworthy.com, softwareworld.com), review aggregators (g2.com, capterra.com, trustradius.com), databases (crunchbase.com, tracxn.com), and the user's own domain. Keep only candidate company homepages.
- For names from `extract_vs_names.mjs` that didn't resolve to a domain, optionally run `bb search "{name}" --num-results 3` to resolve the top domain; skip if ambiguous.
- **Merge**: filtered-URL list ∪ resolved `vs_names` domains ∪ user-provided seed URLs. Dedup by hostname into `/tmp/competitor_candidates.txt`.

### User-confirm phase (between gate and enrichment — mandatory)

After the gate writes `/tmp/competitor_gated.jsonl`, the main agent MUST ask the user to confirm the enrichment set before launching subagents. Enrichment is 25 subagents × depth budget per competitor — too expensive to run on guesses.

Present three buckets to the user:
1. **PASS** — status=PASS rows with title
2. **UNKNOWN** — status=UNKNOWN (fetch failed; always a silent miss risk — JS-heavy homepages, Cloudflare challenges)
3. **Rejected-brand matches** — top ~10 REJECT rows whose title contains a seed token or that showed up repeatedly in the Wave C "X vs Y" graph

Then `AskUserQuestion` with a checkbox list + free-text "add more". Write the confirmed set to `/tmp/competitor_enrichment_set.txt` (one URL per line). That file — not `/tmp/competitor_passed.txt` — is the input to the enrichment subagents.

Known gate blind spots to surface aggressively:
- JS-heavy landing pages return near-empty hero text → gate's keyword matcher has nothing to bite on
- Cloudflare challenge titles ("Just a moment...") → obvious false negative
- "Search foundation" / "retrieval backbone" / "agent runtime" — semantic variants of the category don't lexically match
- Apex domain vs product subdomain (e.g. `brave.com` the browser vs `api-dashboard.search.brave.com` the actual API product)

### Gate Phase (between discovery and enrichment)

Drop wrong-category candidates BEFORE enrichment burns tool calls on them.

```bash
cat /tmp/competitor_candidates.txt \
  | node {SKILL_DIR}/scripts/gate_candidates.mjs \
      --include "{category_include_keywords_csv}" \
      --exclude "{exclusion_list_csv}" \
      --concurrency 6 \
  > /tmp/competitor_gated.jsonl

# Extract PASS-only URLs for enrichment
grep '"status":"PASS"' /tmp/competitor_gated.jsonl \
  | node -e 'require("fs").readFileSync(0,"utf-8").split("\n").filter(Boolean).forEach(l => { try { console.log(JSON.parse(l).url); } catch {} })' \
  > /tmp/competitor_passed.txt
```

**Keyword sources**:
- `--include` ← profile's `category_include_keywords` (comma-joined).
- `--exclude` ← profile's `exclusion_list`.

**Gate logic** (position-aware): REJECT if exclude term in `<title>`; PASS if include term in `<title>`; for hybrid titles with both (e.g. "Browser Automation & Web Scraping API"), tiebreak by first 200 chars of hero text; otherwise fall through to hero-wide check. Conservative by default.

**Review the output** — the main agent SHOULD spot-check both lists and MAY manually re-include a REJECT if it recognizes a known direct competitor whose own marketing is category-ambiguous.

**Evaluation on Browserbase** (12 candidates): 7/7 real competitors PASSED; 4/4 wrong-category (antidetect, scraping API, screenshot API, local AI browser) REJECTED. One split-identity edge (Browserless) rejected — acceptable.

### Enrichment Phase
Two modes:

- **`quick` mode** — single subagent per batch of competitors. Lane A (marketing) only. ~8 competitors per subagent, 2-3 tool calls each. Writes directly to `{OUTPUT_DIR}/{slug}.md`.
- **`deep` / `deeper` modes** — 5-subagent fan-out PER competitor. Each subagent owns ONE lane (marketing / discussion / social / news / technical). Writes to `{OUTPUT_DIR}/partials/{slug}.{lane}.md`. Budget: 5-8 calls per subagent (deep), 10-15 (deeper). After all lanes complete, run `scripts/merge_partials.mjs` to consolidate.
- Launch the 5 lane-subagents for a competitor in ONE Agent tool message (5 parallel Agent calls). Across multiple competitors, batch into 3-5 messages depending on count.

### Screenshots Phase (after merge, before compile)

Capture homepage hero + full-page pricing screenshots for each competitor:
```bash
node {SKILL_DIR}/scripts/capture_screenshots.mjs {OUTPUT_DIR} --env remote --concurrency 1
```
Requires the `browse` CLI (`npm install -g @browserbasehq/browse-cli`). `--env remote` uses a Browserbase session. Writes PNGs to `{OUTPUT_DIR}/screenshots/{slug}-hero.png` and `{slug}-pricing.png`. `compile_report.mjs` auto-embeds them in per-competitor HTML pages when present.

Cost: ~15-20s per competitor (serial). Total for 5 competitors ≈ 90s.

### Sizing Formula
```
search_queries = ceil(requested_competitors / 20)   # discovery is narrower than lead gen
discovery_subagents = ceil(search_queries / 3)
expected_urls = search_queries * 15

quick:   research_subagents = ceil(expected_urls / 8)
deep:    research_subagents = ceil(expected_urls / 4)
deeper:  research_subagents = ceil(expected_urls / 2)
```

### Error Handling
- If a subagent fails, log and continue with remaining batches
- If >50% of subagents fail in a wave, pause and inform the user
- If `bb fetch --allow-redirects` fails, try `bb browse` as fallback or skip that page

## Report Compilation

After all enrichment subagents complete, compile all HTML views in one command:

```bash
node {SKILL_DIR}/scripts/compile_report.mjs {OUTPUT_DIR} --user-company "{user_company}" --open
```

The script:
- Reads all `.md` files in `{OUTPUT_DIR}`
- Parses YAML frontmatter + body sections
- Deduplicates by normalized competitor name
- Generates `{OUTPUT_DIR}/index.html` — overview table (name, tagline, pricing, key features, strategic diff)
- Generates `{OUTPUT_DIR}/competitors/{slug}.html` — per-competitor deep dive
- Generates `{OUTPUT_DIR}/matrix.html` — side-by-side feature/pricing grid across competitors
- Generates `{OUTPUT_DIR}/mentions.html` — chronological feed with source-type pills + client-side filter
- Generates `{OUTPUT_DIR}/results.csv` — flat spreadsheet
- Opens `index.html` in the default browser (`--open` flag)
- Prints a JSON summary to stderr
