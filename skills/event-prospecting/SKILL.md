---
name: event-prospecting
description: |
  Event prospecting skill. Takes a conference / event speakers URL,
  extracts the people, filters their companies against the user's
  ICP, then deep-researches only the speakers at ICP-fit companies.
  Outputs a person-first HTML report where each card answers "why
  should the AE talk to this person?" with all public links and a
  one-click DM opener.
  Use when the user wants to: (1) find leads at a specific
  conference, (2) prep for an event, (3) research event speakers,
  (4) build a target list from a sponsor/exhibitor page,
  (5) scrape conference speakers and rank by ICP fit.
  Triggers: "find leads at {event}", "research speakers at",
  "prospect this conference", "stripe sessions leads",
  "ai engineer summit prospects", "event prospecting",
  "scrape conference speakers", "who should I meet at".
license: MIT
compatibility: Requires bb CLI (@browserbasehq/cli) and BROWSERBASE_API_KEY env var. Also requires browse CLI (@browserbasehq/browse-cli) for JS-heavy pages.
allowed-tools: Bash Agent AskUserQuestion
metadata:
  author: browserbase
  version: "0.1.0"
---

# Event Prospecting

Take a conference URL → get a ranked list of people the AE should talk to, with a "why reach out" rationale per person.

**Required**: `BROWSERBASE_API_KEY` env var, `bb` CLI installed (`@browserbasehq/cli`), and `browse` CLI installed (`@browserbasehq/browse-cli`) for JS-heavy speaker pages (most modern event sites).

**Path rules**: Always use the full literal path in all Bash commands — NOT `~` or `$HOME` (both trigger "shell expansion syntax" approval prompts). Resolve the home directory once and use it everywhere. When constructing subagent prompts, replace `{SKILL_DIR}` with the full literal path (typically `/Users/jay/skills/skills/event-prospecting`).

**Output directory**: All event prospecting output goes to `~/Desktop/{event_slug}_prospects_{YYYY-MM-DD-HHMM}/`. Final deliverable is `index.html` (person-first card grid), with `companies.html` and `people.html` alternate views, plus `results.csv` for cold-outbound import.

**CRITICAL — Tool restrictions (applies to main agent AND all subagents)**:
- All web searches: use `bb search`. NEVER use WebSearch.
- All page content extraction: use `node {SKILL_DIR}/scripts/extract_page.mjs "<url>"`. This script fetches via `bb fetch`, parses title + meta tags + visible body text, and automatically falls back to `bb browse` when the page is JS-rendered or over 1MB. NEVER hand-roll a `bb fetch | sed` pipeline. NEVER use WebFetch.
- All research output: subagents write **one markdown file per company OR per person** to `{OUTPUT_DIR}/companies/{slug}.md` or `{OUTPUT_DIR}/people/{slug}.md` using bash heredoc. NEVER use the Write tool or `python3 -c`. See `references/example-research.md` for both file formats.
- Report compilation: use `node {SKILL_DIR}/scripts/compile_report.mjs {OUTPUT_DIR} --user-company {USER_SLUG} --open`.
- **Subagents must use ONLY the Bash tool. No other tools allowed.**
- **HARD TOOL-CALL CAPS**: ICP triage = 1 call/company; deep research = 5 calls/company; person enrichment = 4 calls/person. See `references/workflow.md` for enforcement detail.

**CRITICAL — Anti-hallucination rules (applies to main agent AND all subagents)**:
- NEVER infer `product_description`, `industry`, or a person's `role_reason` from a site's fonts, framework, design system, or typography. These are cosmetic and say nothing about what the company sells or what the person does.
- NEVER let the user's own ICP leak into a target's description. If you don't know what the target does, write `Unknown` — do not pattern-match them onto the ICP.
- `product_description` MUST quote or paraphrase a specific phrase from `extract_page.mjs` output. If none of TITLE/META/OG/HEADINGS/BODY yield a recognizable product statement, write `Unknown — homepage content not accessible` and cap `icp_fit_score` at 3.
- A person's `hook` MUST quote or paraphrase a specific finding from a `bb search` result (podcast title, blog headline, GitHub repo, talk abstract). If no public signal exists in the last 6 months, fall back to event-context (their talk title at this event).

**CRITICAL — Minimize permission prompts**:
- Subagents MUST batch ALL file writes into a SINGLE Bash call using chained heredocs. One Bash call = one permission prompt.
- Batch ALL searches and ALL fetches into single Bash calls using `&&` chaining.

## Pipeline Overview

Follow these 10 steps in order. Do not skip steps or reorder.

0. **Setup** — output dir + clean slate
1. **Load profile** — read `profiles/{user_slug}.json`
2. **Recon** — detect event platform
3. **Extract people** — `people.jsonl`
4. **Group by company** — `seed_companies.txt`
5. **ICP triage** — fast company-level scoring (1 call/company)
6. **Filter** — companies with `icp_fit_score >= --icp-threshold`
7. **Deep research** — full Plan→Research→Synthesize on ICP fits
8. **Enrich speakers** — at ICP-fit companies only
9. **Compile report** — HTML + CSV, open in browser

---

## Step 0: Setup Output Directory

Before starting, create the output directory on the user's Desktop. Filename pattern matches sibling skills:

```bash
EVENT_SLUG=stripesessions   # derive from URL hostname (e.g. stripesessions.com → stripesessions)
TIMESTAMP=$(date +%Y-%m-%d-%H%M)
OUTPUT_DIR=/Users/jay/Desktop/${EVENT_SLUG}_prospects_${TIMESTAMP}
mkdir -p "$OUTPUT_DIR/companies" "$OUTPUT_DIR/people"
```

Use the full literal home path — never `~` or `$HOME`. Pass `{OUTPUT_DIR}` as the full literal path to all subagent prompts.

## Step 1: Load User Profile

The profile defines the ICP that ICP triage and deep research score against. Load from `{SKILL_DIR}/profiles/{user_slug}.json` (interchangeable across all GTM skills — same shape as company-research).

```bash
USER_SLUG=browserbase   # from --user-company flag
test -f {SKILL_DIR}/profiles/${USER_SLUG}.json || {
  echo "Profile not found: profiles/${USER_SLUG}.json"
  echo "Build one first via the company-research skill (Step 1)."
  exit 1
}
cat {SKILL_DIR}/profiles/${USER_SLUG}.json
```

If the profile is missing, **fail loudly** and point the user at company-research to build one.

The profile yields: `user_company`, `user_product`, `icp_description`. These get embedded verbatim in every subagent prompt downstream.

## Step 2: Recon

Detect the event platform and extraction strategy. One command:

```bash
node {SKILL_DIR}/scripts/recon.mjs {EVENT_URL} {OUTPUT_DIR}
```

Writes `{OUTPUT_DIR}/recon.json` with `platform`, `strategy`, and (for Next.js) `nextDataPaths`. See `references/event-platforms.md` for the platform catalog and detection priority.

Expected outcomes:
- Stripe Sessions class (Next.js): `platform: "next-data"`, 1-3 paths
- Sessionize: `platform: "sessionize"`
- Lu.ma / Eventbrite: `platform: "luma" | "eventbrite"`
- Anything else: `platform: "custom"`, `strategy: "markdown"` (best-effort fallback)

## Step 3: Extract People

```bash
node {SKILL_DIR}/scripts/extract_event.mjs {OUTPUT_DIR} --user-company {USER_SLUG}
```

Reads `recon.json`, dispatches to the platform-specific extractor, writes `people.jsonl` (one speaker per line) and `seed_companies.txt` (deduped companies).

The `--user-company` flag also drops the host-org's own employees (a Stripe-hosted event drops Stripe employees) and the user's own employees from the speaker list — those aren't prospects.

Sanity-check the output:
```bash
wc -l {OUTPUT_DIR}/people.jsonl {OUTPUT_DIR}/seed_companies.txt
head -3 {OUTPUT_DIR}/people.jsonl
```

If `people.jsonl` is empty or under ~10 lines, recon picked the wrong platform — see `references/event-platforms.md` and re-run with adjusted strategy.

## Step 4: Group by Company

`extract_event.mjs` emits `seed_companies.txt` already (one company per line, deduped, sorted). This step is informational — verify the count looks reasonable before fanning out:

```bash
wc -l {OUTPUT_DIR}/seed_companies.txt
```

Expected: roughly 0.4-0.6× the speaker count (most events have ~2 speakers per company on average, some companies send 5+, many send 1).

## Step 5: ICP Triage

**Fast pass — one tool call per company, no deep research.** Score every company in `seed_companies.txt` against the user's ICP and write a thin triage stub to `companies/{slug}.md`. Companies with `icp_fit_score >= --icp-threshold` (default 6) advance to Step 7's deep research; the rest stay as triage stubs.

**Dispatch pattern**: split `seed_companies.txt` into batches of ~10 and fan out N subagents in a SINGLE Agent batch (multiple Agent tool calls in one message). Each subagent runs the prompt from `references/workflow.md` → "ICP Triage" section. Hard cap: **1 tool call per company** (just `extract_page.mjs` on the homepage), enforced via the `# bb call N/1` comment pattern.

```bash
# Build batch files: each batch line is "name|website" so subagents have homepage URLs
# (seed_companies.txt only has names; we need URLs from people.jsonl)
node -e '
const fs = require("fs");
const people = fs.readFileSync("{OUTPUT_DIR}/people.jsonl", "utf-8").split("\n").filter(Boolean).map(JSON.parse);
const seed = fs.readFileSync("{OUTPUT_DIR}/seed_companies.txt", "utf-8").split("\n").filter(Boolean);
const url = {};
for (const p of people) if (p.company && !url[p.company]) url[p.company] = p.companyUrl || p.website || "";
const lines = seed.map(c => `${c}|${url[c] || ""}`);
fs.writeFileSync("{OUTPUT_DIR}/_seed_with_urls.txt", lines.join("\n") + "\n");
'

# Split into ~10-company batches
split -l 10 {OUTPUT_DIR}/_seed_with_urls.txt {OUTPUT_DIR}/_batch_triage_

# Count batches → number of subagents to dispatch (cap at 6 per message; second wave for the rest)
ls {OUTPUT_DIR}/_batch_triage_* | wc -l
```

Then in a single message, dispatch one Agent call per batch (up to 6 in parallel; subsequent waves after the first returns). Each Agent gets the prompt from `references/workflow.md` → "ICP Triage" with these substitutions before sending:
- `{SKILL_DIR}` → full literal skill path (e.g. `/Users/jay/skills/skills/event-prospecting`)
- `{OUTPUT_DIR}` → full literal output path
- `{USER_COMPANY}`, `{USER_PRODUCT}`, `{ICP_DESCRIPTION}` → from the loaded profile
- `{EVENT_NAME}` → `recon.json` `.title`
- `{COMPANY_LIST}` → contents of the batch file (e.g. `cat {OUTPUT_DIR}/_batch_triage_aa`)
- `{TOTAL}` → number of lines in this batch (substitute into `# bb call N/{TOTAL}`)

**Agent dispatch (skeleton, repeat per batch in one message)**:

```
Agent(
  description: "ICP triage batch aa",
  prompt: <ICP Triage prompt from workflow.md with all placeholders substituted>,
  subagent_type: "general-purpose"
)
Agent(
  description: "ICP triage batch ab",
  prompt: <same prompt template, COMPANY_LIST swapped to batch ab>,
  subagent_type: "general-purpose"
)
... up to 6 per message
```

After all subagents return, verify every company in `seed_companies.txt` has a corresponding `companies/{slug}.md`:

```bash
ls {OUTPUT_DIR}/companies/*.md | wc -l
# Should equal `wc -l {OUTPUT_DIR}/seed_companies.txt`
```

Clean up the batch files: `rm {OUTPUT_DIR}/_batch_triage_*`.

## Step 6: Filter by ICP Threshold

Read each `companies/*.md` frontmatter, keep those with `icp_fit_score >= 6` (or whatever `--icp-threshold` is). Write the surviving company slugs to `{OUTPUT_DIR}/icp_fits.txt`:

```bash
THRESHOLD=6   # from --icp-threshold flag
for f in {OUTPUT_DIR}/companies/*.md; do
  score=$(awk '/^icp_fit_score:/{print $2; exit}' "$f")
  if [ -n "$score" ] && [ "$score" -ge "$THRESHOLD" ]; then
    basename "$f" .md
  fi
done > {OUTPUT_DIR}/icp_fits.txt

wc -l {OUTPUT_DIR}/icp_fits.txt
```

Expected: 20-40% of `seed_companies.txt`. If the survival rate is < 10%, the threshold may be too high or the ICP description too narrow — surface a warning to the user.

## Step 7: Deep Research

Full Plan→Research→Synthesize on ICP-fit companies only. Hard cap: **5 tool calls per company** (homepage extract + 2-3 sub-question searches + 1-2 supplementary fetches). Subagents OVERWRITE the existing `companies/{slug}.md` triage stub with the richer deep-research version (frontmatter `triage_only: false`).

**Dispatch pattern**: split `icp_fits.txt` into batches of ~5 (deep mode default) and fan out one Agent per batch in a SINGLE message (up to 6 Agents per message). Each Agent gets the prompt from `references/workflow.md` → "Deep Research" with these substitutions:
- `{SKILL_DIR}`, `{OUTPUT_DIR}`, `{USER_COMPANY}`, `{USER_PRODUCT}`, `{ICP_DESCRIPTION}`
- `{EVENT_NAME}` (from `recon.json` `.title`), `{EVENT_CONTEXT}` (track / topic, manually inferred from the event homepage)
- `{COMPANY_LIST}` → contents of the batch file (each line `slug|website`)

```bash
# Build {company-slug|website} pairs by reading frontmatter from each triage stub
while read slug; do
  website=$(awk '/^website:/{print $2; exit}' {OUTPUT_DIR}/companies/${slug}.md)
  echo "${slug}|${website}"
done < {OUTPUT_DIR}/icp_fits.txt > {OUTPUT_DIR}/_deep_targets.txt

# Split into ~5-company batches (deep mode)
split -l 5 {OUTPUT_DIR}/_deep_targets.txt {OUTPUT_DIR}/_batch_deep_
ls {OUTPUT_DIR}/_batch_deep_* | wc -l
```

**Agent dispatch (skeleton, repeat per batch in one message)**:

```
Agent(
  description: "Deep research batch aa",
  prompt: <Deep Research prompt from workflow.md with all placeholders substituted; COMPANY_LIST = cat _batch_deep_aa>,
  subagent_type: "general-purpose"
)
Agent(
  description: "Deep research batch ab",
  prompt: <same template, COMPANY_LIST = cat _batch_deep_ab>,
  subagent_type: "general-purpose"
)
... up to 6 per message; second wave after the first returns
```

After all subagents return, verify the deep-research files exist and have `triage_only: false`:

```bash
grep -l "triage_only: false" {OUTPUT_DIR}/companies/*.md | wc -l
# Should equal wc -l icp_fits.txt
```

## Step 8: Enrich Speakers (at ICP fits only)

Per person at an ICP-fit company: harvest LinkedIn URL, recent activity (podcast / blog / talk / GitHub / X), and write `people/{slug}.md`. Hard cap: **4 tool calls per person**, three lanes:

1. `bb search "{name} {company} linkedin"` (always)
2. `bb search "{name} podcast OR talk OR blog 2026"` (deep+)
3. `bb search "{name} github"` (deeper)
4. `bb search "{name} site:x.com OR site:twitter.com"` (deeper)

Quick mode: skip Step 8 entirely. Deep mode: lanes 1-2. Deeper mode: lanes 1-4.

**Dispatch pattern**: filter `people.jsonl` to keep only people whose `.company` is in `icp_fits.txt`, batch the result into groups of ~5 people per subagent, fan out in a single Agent batch.

```bash
# Filter people.jsonl to ICP-fit companies only
node -e '
const fs = require("fs");
const fits = new Set(fs.readFileSync("{OUTPUT_DIR}/icp_fits.txt", "utf-8").split("\n").filter(Boolean));
// Map slug → original company name via the triage stub frontmatter
const slug2name = {};
for (const slug of fits) {
  const md = fs.readFileSync(`{OUTPUT_DIR}/companies/${slug}.md`, "utf-8");
  const m = md.match(/^company_name:\s*(.+)$/m);
  if (m) slug2name[slug] = m[1].trim();
}
const wantNames = new Set(Object.values(slug2name).map(s => s.toLowerCase()));
const lines = fs.readFileSync("{OUTPUT_DIR}/people.jsonl", "utf-8").split("\n").filter(Boolean);
const keep = lines.filter(l => {
  const p = JSON.parse(l);
  return p.company && wantNames.has(p.company.toLowerCase());
});
fs.writeFileSync("{OUTPUT_DIR}/_people_to_enrich.jsonl", keep.join("\n") + "\n");
console.error(`Enriching ${keep.length} of ${lines.length} speakers`);
'

# Split into ~5-person batches
split -l 5 {OUTPUT_DIR}/_people_to_enrich.jsonl {OUTPUT_DIR}/_batch_people_
```

Then in a single message, dispatch one Agent call per batch (up to 6 per message) with the prompt from `references/workflow.md` → "Person Enrichment". Each subagent's prompt should include:
- `{SKILL_DIR}`, `{OUTPUT_DIR}`, `{DEPTH}` (`deep` | `deeper`)
- `{USER_COMPANY}`, `{USER_PRODUCT}`, `{ICP_DESCRIPTION}`
- `{EVENT_NAME}` (from `recon.json` `.title`)
- `{LANES}` → `2` for deep mode, `4` for deeper mode (substituted into `# bb call N/{LANES}`)
- `{PEOPLE_BATCH}` → contents of `_batch_people_aa` (each line a JSON record from `people.jsonl`)

**Agent dispatch (skeleton, repeat per batch in one message)**:

```
Agent(
  description: "Person enrichment batch aa",
  prompt: <Person Enrichment prompt from workflow.md with all placeholders substituted; PEOPLE_BATCH = cat _batch_people_aa>,
  subagent_type: "general-purpose"
)
Agent(
  description: "Person enrichment batch ab",
  prompt: <same template, PEOPLE_BATCH = cat _batch_people_ab>,
  subagent_type: "general-purpose"
)
... up to 6 per message
```

After all subagents return, verify the people files exist:

```bash
ls {OUTPUT_DIR}/people/*.md | wc -l
# Should equal wc -l _people_to_enrich.jsonl
```

## Step 9: Compile Report

Generate the person-first HTML index, alternate views, and CSV in one command:

```bash
node {SKILL_DIR}/scripts/compile_report.mjs {OUTPUT_DIR} --user-company {USER_SLUG} --open
```

This generates:
- `{OUTPUT_DIR}/index.html` — person-first ranked card grid (opens in browser)
- `{OUTPUT_DIR}/people.html` — filterable speaker grid (alternate view)
- `{OUTPUT_DIR}/companies.html` — ICP-ranked company table with attendees
- `{OUTPUT_DIR}/results.csv` — cold-outbound-ready spreadsheet

Then present a summary in chat:

```
## Event Prospecting Complete — {Event Name}

- **Total speakers extracted**: {count}
- **Unique companies**: {count}
- **ICP fits (score ≥ {threshold})**: {count}
- **Speakers enriched**: {count}
- **Score distribution** (companies):
  - Strong fit (8-10): {count}
  - Partial fit (5-7): {count}
  - Weak fit (1-4): {count}
- **Report opened in browser**: {OUTPUT_DIR}/index.html
```

Show the **top 5 people cards** as a markdown table sorted by company ICP score, then offer to:
- Dig deeper into a specific person (uses the 🔬 Research deeper button → CC prompt)
- Adjust `--icp-threshold` and re-run Steps 6-9
- Export the CSV to a CRM
