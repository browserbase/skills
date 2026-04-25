# Event-Prospecting Workflow

Subagent prompt templates and tool-call governance for every fan-out step in the pipeline. The main agent in `SKILL.md` dispatches Agent batches that load these prompts; each subagent must obey the HARD TOOL-CALL CAPS below or the run is invalidated.

## Contents
- [Discovery](#discovery) — recon + extract (NOT fanned out; main agent runs these directly)
- [ICP Triage](#icp-triage) — fast company-level scoring (1 call/company hard cap)
- [Deep Research](#deep-research) — full Plan→Research→Synthesize on ICP fits (5 calls/company hard cap)
- [Person Enrichment](#person-enrichment) — speakers at ICP-fit companies (4 calls/person hard cap)
- [Compilation](#compilation) — HTML + CSV via `compile_report.mjs`
- [Wave Management](#wave-management) — sizing, parallelism, error handling

---

## Discovery

Recon + extract are deterministic single-process scripts run by the main agent. NOT fanned out. See SKILL.md Steps 2-4 for the orchestrator commands. This section exists only to document the artifacts the downstream subagents consume:

- `{OUTPUT_DIR}/recon.json` — platform + extraction strategy (read by `extract_event.mjs`)
- `{OUTPUT_DIR}/people.jsonl` — one JSON-encoded speaker per line (read by Step 8 batching)
- `{OUTPUT_DIR}/seed_companies.txt` — deduped, sorted company names (read by Step 5 batching)

---

## ICP Triage

**HARD TOOL-CALL CAP: 1 tool call per company.** The only allowed call is `extract_page.mjs` on the company homepage. NO follow-up searches, NO sitemap discovery, NO secondary fetches. If the homepage returns thin content, write `Unknown` and cap the score at 3 — that is the correct behavior, not a failure.

**ENFORCEMENT** — at the start of every Bash call, prepend a comment like `# bb call N/1` so the cap is visible in tool output. If a subagent emits more than `K` calls for a batch of `K` companies, the main agent's compile step will detect the over-budget run from the call log and flag it.

**Subagent prompt template** — substitute the curly-brace placeholders before dispatching:

```
You are an ICP triage subagent for the event-prospecting skill. For each company in your batch, run ONE tool call to fetch the homepage, then score it against the user's ICP and write a triage stub to {OUTPUT_DIR}/companies/{slug}.md.

CONTEXT:
- User's company: {USER_COMPANY}
- User's product: {USER_PRODUCT}
- ICP description: {ICP_DESCRIPTION}
- Event name: {EVENT_NAME}
- Output directory: {OUTPUT_DIR}    ← write company files HERE, full literal path

COMPANIES TO TRIAGE (one per line — `name|guessed_homepage|slug`):
{COMPANY_LIST}

The guessed_homepage is a heuristic (`https://{lowercased company name without spaces}.com`). For most companies it's correct. For a few it 404s — that's expected and the fallback is documented in rule 3 below.

The slug is the canonical filename to write to: `{OUTPUT_DIR}/companies/{slug}.md`. Use it verbatim — do not re-slugify the name yourself or you'll create duplicate files.

TOOL RULES — CRITICAL, FOLLOW EXACTLY:
1. You may ONLY use the Bash tool. No exceptions.
2. The ONLY allowed extraction call is:
     node {SKILL_DIR}/scripts/extract_page.mjs "<homepage_url>" --max-chars 2000
3. HARD TOOL-CALL CAP: ONE call per company. If a homepage returns FETCH_OK: false with empty BODY (e.g. the guessed URL 404s), write product_description: "Unknown — homepage content not accessible" and cap icp_fit_score at 3. DO NOT attempt a second call to "save" the company.
4. ENFORCEMENT — at the start of EVERY Bash call, prepend a comment like `# bb call N/{TOTAL}` where N counts up and TOTAL is the number of companies in your batch. Example for a 10-company batch:
     # bb call 1/10
     node {SKILL_DIR}/scripts/extract_page.mjs "https://openai.com" --max-chars 2000
5. BANNED TOOLS: WebFetch, WebSearch, Write, Read, Glob, Grep — ALL BANNED. Use ONLY Bash.
6. NEVER use ~ or $HOME — full literal paths only.

ANTI-HALLUCINATION RULES:
- NEVER infer product_description from fonts, framework, or design system. Typography is not a product.
- NEVER let the user's ICP leak into the target's description. If you don't know what the target does, write "Unknown".
- product_description MUST quote or closely paraphrase a phrase from extract_page.mjs output (TITLE / META_DESCRIPTION / OG_DESCRIPTION / HEADINGS / BODY). If none yield a recognizable product statement, write "Unknown — homepage content not accessible" and cap icp_fit_score at 3.

ICP SCORING RUBRIC (event-aware):
- 8-10: Strong match. Homepage clearly states a product/audience that aligns with {ICP_DESCRIPTION}. Bonus if their event presence (talk topic, sponsor tier) suggests they're working in the user's wedge.
- 5-7: Partial match. Adjacent industry, OR clear product but unclear pain-point alignment.
- 1-4: Weak match. Wrong segment, or homepage too thin to assess (cap at 3 if Unknown).

OUTPUT — write ALL company files in a SINGLE Bash call using chained heredocs:

# bb call 1/{TOTAL}
node {SKILL_DIR}/scripts/extract_page.mjs "{url1}" --max-chars 2000 && \
# bb call 2/{TOTAL}
node {SKILL_DIR}/scripts/extract_page.mjs "{url2}" --max-chars 2000 && \
... && \
cat << 'COMPANY_MD' > {OUTPUT_DIR}/companies/{slug1}.md
---
company_name: {name1}
website: {url1}
product_description: {description1}
icp_fit_score: {score1}
icp_fit_reasoning: {reasoning1}
triage_only: true
event_context: {EVENT_NAME} — {how they show up at the event, e.g. "speaker on Agents track"}
---

## Triage Notes
{1-2 sentences citing the homepage phrase that drove the score}
COMPANY_MD
cat << 'COMPANY_MD' > {OUTPUT_DIR}/companies/{slug2}.md
---
...
---

...
COMPANY_MD

Use 'COMPANY_MD' (quoted) as the heredoc delimiter to prevent shell variable expansion.

Report back ONLY: "ICP triage batch: {scored}/{total} companies, score distribution: high={N} mid={N} low={N}".
Do NOT return raw homepage content or per-company reasoning to the main conversation.
```

---

## Deep Research

**HARD TOOL-CALL CAP: 5 tool calls per company.** Budget breakdown:
- 1 call: `extract_page.mjs` on the homepage
- 2-3 calls: `bb search` for sub-questions (Priority 1 + selected Priority 2)
- 1-2 calls: `extract_page.mjs` on the most relevant search results (case study / blog / careers)

**ENFORCEMENT** — at the start of every Bash call, prepend `# bb call N/{TOTAL}` where TOTAL is `5 × batch_size`. A 5-company batch caps at 25 total tool calls. The main agent's compile step monitors this from the call log.

**Subagent prompt template**:

```
You are a deep-research subagent for the event-prospecting skill. For each ICP-fit company in your batch, follow the Plan→Research→Synthesize pattern from references/research-patterns.md and OVERWRITE the existing triage stub at {OUTPUT_DIR}/companies/{slug}.md with the deep-research version.

CONTEXT:
- User's company: {USER_COMPANY}
- User's product: {USER_PRODUCT}
- ICP description: {ICP_DESCRIPTION}
- Event name: {EVENT_NAME}
- Event context: {EVENT_CONTEXT}   ← e.g. "AI track / Agents / Infra"
- Output directory: {OUTPUT_DIR}

COMPANIES TO RESEARCH (one per line, slug|website format):
{COMPANY_LIST}

TOOL RULES — CRITICAL:
1. You may ONLY use the Bash tool. No exceptions.
2. All searches:  bb search "..." --num-results 10
3. All page extractions:  node {SKILL_DIR}/scripts/extract_page.mjs "URL" --max-chars 3000
   (handles JSON envelope, meta tags, JS-render fallback to bb browse)
   DO NOT hand-roll a `bb fetch | sed` pipeline. Use raw `bb fetch` only for sitemap.xml / llms.txt.
4. HARD TOOL-CALL CAP: 5 calls per company. Budget:
     1× extract_page on homepage
     2-3× bb search on sub-questions
     1-2× extract_page on the best search result
   DO NOT exceed 5 calls per company. If you've burned the budget, synthesize from what you have.
5. ENFORCEMENT — at the start of EVERY Bash call, prepend a comment like `# bb call N/5 (company: {slug})`. Reset N to 1 for each company in the batch.
6. BATCH all writes: write ALL deep-research files in a SINGLE Bash call using chained heredocs.
7. BANNED TOOLS: WebFetch, WebSearch, Write, Read, Glob, Grep — ALL BANNED.
8. NEVER use ~ or $HOME — full literal paths.

ANTI-HALLUCINATION RULES (same as research-patterns.md):
- Typography is not a product.
- No ICP leakage — if homepage is thin and search yields nothing, write "Unknown" and cap score at 3.
- product_description MUST quote/paraphrase a phrase from extract_page.mjs output or a search result.

RESEARCH PATTERN per company (deep mode):

Phase A — Plan:
Decompose into 2-3 sub-questions. Always include "What does {company} do?" (Priority 1). Add 1-2 from Priority 2 chosen for event-context relevance. EXAMPLE for an Agents-track company:
  - "What does {company} sell and who are their customers?"
  - "What is {company} doing with browser automation or AI agents that's relevant to {EVENT_NAME}'s {EVENT_CONTEXT}?"
  - "Has {company} raised funding, launched products, or expanded recently?"

Phase B — Research Loop:
1. # bb call 1/5 — extract_page on homepage
2. # bb call 2/5 — bb search for Priority 1 sub-question
3. # bb call 3/5 — bb search for event-context sub-question
4. # bb call 4/5 — extract_page on the most relevant search result
5. # bb call 5/5 — (optional) one more search OR fetch if budget remains
Accumulate findings: factual statement + source URL + confidence level (high/medium/low).

Phase C — Synthesize:
1. Score ICP fit 1-10 using the rubric (high-confidence findings + event relevance lift the score; thin evidence caps at 3).
2. Fill enrichment fields: product_description, industry, target_audience, key_features, employee_estimate, funding_info, headquarters.
3. Write event_relevance: how the company shows up at the event (speaker count, track, sponsor tier, demo).
4. Reference specific findings in icp_fit_reasoning.

OUTPUT — overwrite the triage stub. ALL files in a SINGLE Bash call:

cat << 'COMPANY_MD' > {OUTPUT_DIR}/companies/{slug}.md
---
company_name: {name}
website: {url}
product_description: {description}
industry: {industry}
target_audience: {audience}
key_features: {feature1} | {feature2} | {feature3}
icp_fit_score: {score}
icp_fit_reasoning: {reasoning, references findings}
employee_estimate: {estimate}
funding_info: {funding}
headquarters: {location}
triage_only: false
event_context: {EVENT_NAME} — {how they show up}
event_relevance: {speaker count, track, demo expectations}
---

## Product
{2-3 sentences specific, sourced}

## Research Findings
- **[{confidence}]** {fact} (source: {url})
- ...

## Event Relevance
{how this company connects to {EVENT_NAME}; pitch angle for AE conversation at the event}
COMPANY_MD

Report back ONLY: "Deep research batch: {researched}/{total} companies, {findings_count} total findings, avg ICP score {N.N}".
```

---

## Person Enrichment

**HARD TOOL-CALL CAP: 4 tool calls per person.** Lanes:
1. `bb search "{name} {company} linkedin"` — always (deep + deeper)
2. `bb search "{name} podcast OR talk OR blog 2026"` — deep + deeper
3. `bb search "{name} github"` — deeper only
4. `bb search "{name} site:x.com OR site:twitter.com"` — deeper only

Deep mode: lanes 1-2 (max 2 calls/person). Deeper mode: lanes 1-4 (max 4 calls/person).

**ENFORCEMENT** — every Bash call prepends `# bb call N/{LANES} (person: {slug})`, where LANES is 2 (deep) or 4 (deeper). Reset N to 1 for each person.

**Subagent prompt template**:

```
You are a person-enrichment subagent for the event-prospecting skill. For each person in your batch, run 2-4 bb searches to harvest LinkedIn + recent activity + GitHub + X presence, generate a hook + DM opener, and write {OUTPUT_DIR}/people/{slug}.md.

CONTEXT:
- User's company: {USER_COMPANY}
- User's product: {USER_PRODUCT}
- ICP description: {ICP_DESCRIPTION}
- Event name: {EVENT_NAME}
- Depth mode: {DEPTH}    ← `deep` (2 lanes) or `deeper` (4 lanes)
- Output directory: {OUTPUT_DIR}

PEOPLE TO ENRICH (one JSON record per line):
{PEOPLE_BATCH}

Each record has fields:
  { "name": "...", "title": "...", "company": "...", "linkedin": "...", "slug": "...", "bio": "..." }

TOOL RULES — CRITICAL:
1. You may ONLY use the Bash tool. No exceptions.
2. All searches:  bb search "..." --num-results 5
3. HARD TOOL-CALL CAP per person:
     deep mode:    2 calls (lanes 1 + 2)
     deeper mode:  4 calls (lanes 1 + 2 + 3 + 4)
   DO NOT exceed the cap. If a lane fails (no useful result), DO NOT compensate by running a fifth call.
4. ENFORCEMENT — at the start of EVERY Bash call, prepend a comment like `# bb call N/{LANES} (person: {slug})`. Reset N to 1 for each person in the batch.
5. BATCH all writes: write ALL people files in a SINGLE Bash call using chained heredocs.
6. BANNED TOOLS: WebFetch, WebSearch, Write, Read, Glob, Grep — ALL BANNED.
7. NEVER use ~ or $HOME — full literal paths.

ANTI-HALLUCINATION RULES:
- A person's `hook` MUST quote or paraphrase a SPECIFIC finding from a bb search result. NEVER infer from "they look senior" or "their company is AI-y".
- If lanes 2-4 yield no public signal in the last 6 months, fall back to event-context (their talk title from the bio field). Event-context is always available and beats a fabricated hook.
- The DM opener MUST reference the hook verbatim. If the hook is event-context, name the talk title. Do NOT name a podcast or blog post the person didn't actually appear in.

LANE PROMPTS (run only the lanes for your DEPTH):

Lane 1 (always):
  # bb call 1/{LANES} (person: {slug})
  bb search "\"{name}\" \"{company}\" linkedin" --num-results 5
  → harvest LinkedIn URL + verify current title

Lane 2 (deep + deeper):
  # bb call 2/{LANES} (person: {slug})
  bb search "\"{name}\" podcast OR talk OR blog 2026" --num-results 5
  → harvest most-recent activity. If a podcast/blog/talk URL appears, that's a candidate hook.

Lane 3 (deeper only):
  # bb call 3/{LANES} (person: {slug})
  bb search "\"{name}\" github" --num-results 5
  → harvest github.com/{handle} URL if present

Lane 4 (deeper only):
  # bb call 4/{LANES} (person: {slug})
  bb search "\"{name}\" site:x.com OR site:twitter.com" --num-results 5
  → harvest x.com/{handle} URL + most recent post topic if shown

HOOK SOURCE PRIORITY (run sequentially, stop at first hit):
1. Recent activity (lane 2): podcast title / blog headline / talk title from the last 6 months. THIS IS THE BEST HOOK — concrete, dated, public.
2. Event-context: their talk title or panel topic at {EVENT_NAME} (extracted from the bio field passed in the JSON record). ALWAYS available, even when external search yields nothing.
3. Company-context: pull from {OUTPUT_DIR}/companies/{company_slug}.md `event_relevance` line (read via `awk` from the existing file; this is allowed because the file is local, not a tool call).

DM OPENER FORMAT:
2-3 sentences:
  - sentence 1: reference the hook explicitly
  - sentence 2: 1-line wedge tie-in to {USER_PRODUCT}
  - sentence 3: soft CTA ("worth a 15-min walkthrough?", "open to a quick chat?", etc.)
NEVER salesy. NEVER reference Browserbase by name unless the user's profile says to. Use the user's wedge framing from {USER_PRODUCT}.

OUTPUT — write ALL people files in a SINGLE Bash call using chained heredocs:

cat << 'PERSON_MD' > {OUTPUT_DIR}/people/{slug}.md
---
name: {full name}
slug: {slug}
company: {company}
company_slug: {company_slug}
title: {title}
links:
  linkedin: {url or null}
  x: {url or null}
  github: {url or null}
  blog: {url or null}
  podcast: {url or null}
hook: {1 sentence, sourced}
dm_opener: |
  {sentence 1: hook reference}
  {sentence 2: wedge tie-in}
  {sentence 3: soft CTA}
role_reason: {why this person matters at the company}
event_name: {EVENT_NAME}
event_context: {their role at the event — talk title, panel topic, sponsor employee, etc.}
icp_fit_score: {inherited from companies/{company_slug}.md}
icp_fit_reasoning: {inherited}
enriched_at: {ISO timestamp}
---

## Why reach out
- **Why the company**: {1 line, references companies/{company_slug}.md}
- **Why the person**: {role_reason restated as 1 line}
- **Hook**: {hook, with source URL inline}

## Public links
{bullet list of every harvested link, one per line}

## Recent activity
- **[{confidence}]** {finding} (source: {url})
- ...
PERSON_MD

Report back ONLY: "Person enrichment batch: {enriched}/{total} people, {hook_count_event} event-context hooks + {hook_count_recent} recent-activity hooks".
```

---

## Compilation

After all subagents complete, the main agent runs the compile step ONCE. NOT fanned out. From SKILL.md Step 9:

```bash
node {SKILL_DIR}/scripts/compile_report.mjs {OUTPUT_DIR} --user-company {USER_SLUG} --open
```

The compile script:
1. Reads every `companies/*.md` and `people/*.md`
2. Joins people to their company files (via `company_slug` frontmatter)
3. Sorts people by inherited `icp_fit_score` desc
4. Renders:
   - `index.html` — person-first card grid (the primary deliverable)
   - `people.html` — filterable speaker grid (alternate view, with chips for company / role bucket / ICP band)
   - `companies.html` — ICP-ranked company table with attendees expandable per row
   - `results.csv` — flat one-row-per-person spreadsheet for cold-outbound import
5. Opens `index.html` in the default browser (`--open` flag)

The compile step does NOT mutate any `.md` files. All HTML is generated fresh from the markdown sources every run, so re-running compile after a manual edit to a `.md` file regenerates the report.

---

## Wave Management

### Key Principle: Maximize Parallelism, Minimize Prompts

Launch as many subagents as possible in a single Agent fan-out (up to ~6 Agent calls per message). Each subagent MUST batch all its Bash operations into a single call to minimize permission prompts. One subagent batch = one Bash call = one permission prompt.

### Sizing Formula

```
seed_companies = wc -l seed_companies.txt
icp_fits      = wc -l icp_fits.txt    (typically 20-40% of seed)
people_to_enrich = wc -l _people_to_enrich.jsonl  (typically 1.5-2.5× icp_fits)

triage_subagents  = ceil(seed_companies / 10)        # 10 companies/subagent, 1 call each
deep_subagents    = ceil(icp_fits / 5)               # 5 companies/subagent, 5 calls each
person_subagents  = ceil(people_to_enrich / 5)       # 5 people/subagent, 2-4 calls each
```

For Stripe Sessions (99 seed → ~30 ICP fits → ~50 people):
- Triage: 10 subagents × 10 calls = 100 calls (matches the cost model: 99 calls)
- Deep research: 6 subagents × 25 calls = 150 calls
- Person enrichment: 10 subagents × ~10 calls = 100 calls
- Total: ~350 tool calls, matches the design doc cost model.

### Wave Cadence

Dispatch all subagents for a given step in **a single Agent fan-out message** (up to 6 per message; if more needed, run a second wave after the first completes). Do NOT serialize subagents that can run in parallel.

### Error Handling

- If a single subagent fails, log the error and continue. The compile step ignores missing files gracefully.
- If >50% of subagents in a wave fail, pause and surface to the user before continuing.
- If `extract_page.mjs` returns FETCH_OK: false with empty BODY, the triage subagent should write `product_description: Unknown — homepage content not accessible` and cap score at 3 (NOT skip the company — the file must exist for compile to render the row).
- The HARD TOOL-CALL CAP is non-negotiable. If a subagent exceeds its budget, the run is invalidated for that batch (compile step warns; user can re-dispatch).
