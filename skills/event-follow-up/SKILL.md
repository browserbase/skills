---
name: event-follow-up
description: |
  Event follow-up skill. Takes a CSV of attendees from a conference,
  enriches each person against the user's ICP, scores their sales
  readiness (HOT / WARM / NURTURE / COLD), and drafts a personalized
  follow-up email per person — replacing the generic "great meeting
  you" templates that get ignored.
  Use when the user wants to: (1) follow up after an event,
  (2) qualify post-event leads, (3) decide who to route to sales,
  (4) personalize follow-up emails at scale,
  (5) work a CSV of badge-scanned attendees.
  Triggers: "follow up after {event}", "post-event emails",
  "event follow-up", "conference attendee CSV", "follow up on leads",
  "qualify event attendees", "personalize follow-up emails",
  "stripe sessions follow-up", "post-conference outreach".
license: MIT
compatibility: Requires bb CLI (@browserbasehq/cli) and BROWSERBASE_API_KEY env var.
allowed-tools: Bash Agent AskUserQuestion
metadata:
  author: browserbase
  version: "0.1.0"
---

# Event Follow-Up

Take an attendee CSV → get a per-person follow-up email plus a sales-readiness flag (HOT / WARM / NURTURE / COLD), with a "why" rationale per person.

**Required**: `BROWSERBASE_API_KEY` env var, `bb` CLI installed (`@browserbasehq/cli`). Browse CLI is NOT required (this skill takes a CSV in, no event-page scraping).

**Path rules**: Always use the full literal path in all Bash commands — NOT `~` or `$HOME`. Resolve the home directory once and use it everywhere. When constructing subagent prompts, replace `{SKILL_DIR}` with the full literal path (typically `/Users/jay/skills/skills/event-follow-up`).

**Output directory**: All event follow-up output goes to `~/Desktop/{event_slug}_followup_{YYYY-MM-DD-HHMM}/`. Final deliverable is `index.html` (people grouped by sales-readiness, ranked HOT → COLD), with `people.html` and `companies.html` alternate views, plus `results.csv` (one row per person with the email body in a column for direct CRM import).

**CRITICAL — Tool restrictions (applies to main agent AND all subagents)**:
- All web searches: use `bb search`. NEVER use WebSearch.
- All page content extraction: use `node {SKILL_DIR}/scripts/extract_page.mjs "<url>"`. This script fetches via `bb fetch`, parses title + meta tags + visible body text, and automatically falls back to `bb browse` when JS-rendered. NEVER hand-roll a `bb fetch | sed` pipeline. NEVER use WebFetch.
- All research output: subagents write **one markdown file per company OR per person** to `{OUTPUT_DIR}/companies/{slug}.md` or `{OUTPUT_DIR}/people/{slug}.md` using bash heredoc. NEVER use the Write tool or `python3 -c`. See `references/example-research.md` for both file formats.
- Report compilation: use `node {SKILL_DIR}/scripts/compile_report.mjs {OUTPUT_DIR} --open`.
- **Subagents must use ONLY the Bash tool. No other tools allowed.**
- **HARD TOOL-CALL CAPS**: ICP triage = 1 call/company; deep research = 5 calls/company; person enrichment + email = 4 calls/person. See `references/workflow.md`.

**CRITICAL — Anti-hallucination rules (applies to main agent AND all subagents)**:
- NEVER infer `product_description`, `industry`, or a person's `role_reason` from a site's fonts, framework, design system, or typography.
- NEVER let the user's own ICP leak into a target's description. If you don't know what the target does, write `Unknown`.
- `product_description` MUST quote or paraphrase a phrase from `extract_page.mjs` output. Otherwise `Unknown — homepage content not accessible` and cap `icp_fit_score` at 3.
- A logo on a target's homepage does NOT establish a customer relationship. If `{TARGET}` shows `{USER_COMPANY}`'s logo in a "trusted by" section, the USER is the TARGET's customer — NOT the reverse. Only call a target an "existing customer" if its name appears in the user profile's `existing_customers` array.
- The personalized email MUST reference a specific finding from research (recent activity, hiring, product launch, talk topic). Generic "great to meet you" filler is the failure mode this skill exists to prevent.

**CRITICAL — Minimize permission prompts**:
- Subagents MUST batch ALL file writes into a SINGLE Bash call using chained heredocs.
- Batch ALL searches and ALL fetches into single Bash calls using `&&` chaining.

## Pipeline Overview

Follow these 11 steps in order. Do not skip steps or reorder.

0. **Setup** — output dir + clean slate
1. **Event context** — ask the user to paste a description or URL of the event
2. **Promo codes** — ask the user (AskUserQuestion) whether to include a discount code, and for which buckets
3. **Load profile** — read `profiles/{user_slug}.json`
4. **Parse CSV** — normalize headers, write `people.jsonl` + `seed_companies.txt`
5. **Group by company** — verify the seed companies count
6. **ICP triage** — fast company-level scoring (1 call/company)
7. **Filter** — companies with `icp_fit_score >= --icp-threshold`
8. **Deep research** — full Plan→Research→Synthesize on ICP fits
9. **Enrich attendees + draft email** — at ICP-fit companies only (combined Person Enrichment + Email subagent pass)
10. **Compile report** — HTML + CSV, open in browser

The user invokes the skill with a CSV path like `/event-follow-up /Users/jay/Downloads/stripe-attendees.csv`. Parse `CSV_PATH` from that invocation message. Defaults: `DEPTH=deep`, `ICP_THRESHOLD=6`. The `USER_SLUG` (ICP profile) is auto-resolved in Step 3 — there is no built-in default profile. Do NOT ask the user to confirm the path.

---

## Step 0: Setup Output Directory

Derive the output directory from the CSV filename, or from an `--event-name` flag if provided. Do NOT hardcode any event name.

```bash
EVENT_SLUG=$(node -e 'const p = require("path").basename(process.argv[1]).replace(/\.csv$/i,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,""); console.log(p)' "$CSV_PATH")
TIMESTAMP=$(date +%Y-%m-%d-%H%M)
OUTPUT_DIR=/Users/jay/Desktop/${EVENT_SLUG}_followup_${TIMESTAMP}
mkdir -p "$OUTPUT_DIR/companies" "$OUTPUT_DIR/people"
cp "$CSV_PATH" "$OUTPUT_DIR/input.csv"
```

Use the full literal home path — never `~` or `$HOME`. Pass `{OUTPUT_DIR}` as the full literal path to all subagent prompts.

## Step 1: Capture Event Context

Ask the user **in plain chat** for the event description (do NOT use AskUserQuestion). Without this, emails default to generic "we met at the event" framing — the exact failure mode this skill exists to prevent.

Print this verbatim and wait for the user's reply:

```
What event is this follow-up for? Paste either:
  - a 1-3 sentence description (theme, audience, your goal there), OR
  - a URL to the event page (I'll extract the description automatically)
```

Parse the user's reply:
- Plain text → save verbatim as `{OUTPUT_DIR}/event_context.md`
- URL (matches `^https?://`) → run `node {SKILL_DIR}/scripts/extract_page.mjs "<url>" --max-chars 2000`, save the title + first 1500 chars of body to `{OUTPUT_DIR}/event_context.md`

```bash
# Example for the URL branch:
node {SKILL_DIR}/scripts/extract_page.mjs "$EVENT_URL" --max-chars 2000 > {OUTPUT_DIR}/event_context.md
```

The event context becomes part of every email-drafting subagent prompt as `{EVENT_CONTEXT}`.

## Step 2: Promo Codes (optional)

Ask via `AskUserQuestion` whether to include a discount/promo code in the drafted emails:

```
AskUserQuestion(questions: [
  {
    question: "Include a promo/discount code in the follow-up emails?",
    header: "Promo code",
    multiSelect: false,
    options: [
      { label: "No promo codes", description: "Default — no discount in emails" },
      { label: "Yes — HOT only", description: "Add to the highest-intent bucket only" },
      { label: "Yes — HOT and WARM", description: "Top two buckets" },
      { label: "Yes — all enriched", description: "HOT + WARM + NURTURE (skip COLD)" }
    ]
  }
])
```

If the user picks any "Yes" option, follow up in plain chat:

```
Paste the promo code + offer details in one line, e.g.:
  SESSIONS25 — 25% off first 3 months
```

Save to `{OUTPUT_DIR}/promo.json`:

```bash
cat << 'PROMO_JSON' > {OUTPUT_DIR}/promo.json
{
  "code": "SESSIONS25",
  "description": "25% off first 3 months",
  "applies_to": ["HOT", "WARM"]
}
PROMO_JSON
```

If "No promo codes", write `{"code": null, "description": null, "applies_to": []}`. The email-drafting subagent reads this file and weaves the code in only for buckets listed in `applies_to`.

## Step 3: Load User Profile

The profile defines the ICP that ICP triage and deep research score against. Load from `{SKILL_DIR}/profiles/{user_slug}.json` (interchangeable across all GTM skills — same shape as company-research). `example.json` is a template, not a real profile — never use it.

**DO NOT look outside `{SKILL_DIR}/profiles/`** for profiles — never reach into other skills' directories.

**Resolution order**:
1. If the user invoked with `--user-company <slug>`, use that slug.
2. Else, list `profiles/*.json` excluding `example.json`. If exactly one profile exists, use it. If multiple, ask the user (plain chat) which one.
3. If zero profiles exist, **fail loudly** and instruct the user to create one (copy `profiles/example.json` to `profiles/<your_slug>.json`, or run the company-research skill).

```bash
PROFILES=$(ls {SKILL_DIR}/profiles/*.json 2>/dev/null | xargs -n1 basename | sed 's/\.json$//' | grep -v '^example$')
COUNT=$(echo "$PROFILES" | grep -c .)

if [ -z "$USER_SLUG" ]; then
  if [ "$COUNT" -eq 0 ]; then
    echo "No profiles found. Copy profiles/example.json to profiles/<your_slug>.json and fill it in."; exit 1
  elif [ "$COUNT" -eq 1 ]; then
    USER_SLUG=$PROFILES
  else
    echo "Multiple profiles found:"; echo "$PROFILES" | sed 's/^/  - /'
    echo "Re-invoke with --user-company <slug> to pick one."; exit 1
  fi
fi
cat {SKILL_DIR}/profiles/${USER_SLUG}.json
```

The profile yields: `company`, `product`, `icp_description`, `existing_customers`. These get embedded verbatim in every subagent prompt downstream.

## Step 4: Parse CSV

Normalize the input CSV into `people.jsonl` and `seed_companies.txt`. The parser auto-detects column headers across common event-platform schemas — see `references/csv-schemas.md` for the column mapping.

```bash
node {SKILL_DIR}/scripts/parse_csv.mjs {OUTPUT_DIR}/input.csv {OUTPUT_DIR} --user-company {USER_SLUG}
```

Writes:
- `{OUTPUT_DIR}/people.jsonl` — one JSON record per attendee (`name`, `email`, `company`, `title`, `slug`, plus any extra event-context columns)
- `{OUTPUT_DIR}/seed_companies.txt` — deduped, sorted company names
- `{OUTPUT_DIR}/parse_stats.json` — counts and detected column mapping

The `--user-company` flag drops attendees from the user's own org (your own SDRs aren't prospects).

Sanity-check:
```bash
wc -l {OUTPUT_DIR}/people.jsonl {OUTPUT_DIR}/seed_companies.txt
head -3 {OUTPUT_DIR}/people.jsonl
cat {OUTPUT_DIR}/parse_stats.json
```

If the column mapping looks wrong (e.g., `company` mapped to a "Country" column), surface the detected mapping to the user and offer to re-run with explicit `--col-name=...`, `--col-email=...`, `--col-company=...`, `--col-title=...` flags. See `references/csv-schemas.md` → "Override Mapping".

## Step 5: Group by Company

`parse_csv.mjs` already deduped the companies. This step is informational:

```bash
wc -l {OUTPUT_DIR}/seed_companies.txt
```

Expected: roughly 0.6-0.9× the attendee count for badge-scanned events.

## Step 6: ICP Triage

**Fast pass — one tool call per company, no deep research.** Score every company in `seed_companies.txt` against the user's ICP and write a thin triage stub to `companies/{slug}.md`. Companies with `icp_fit_score >= --icp-threshold` (default 6) advance to Step 8's deep research.

**Dispatch pattern**: split `seed_companies.txt` into batches of ~10 and fan out N subagents in a SINGLE Agent batch. Each subagent runs the prompt from `references/workflow.md` → "ICP Triage" section. Hard cap: **1 tool call per company**.

```bash
node -e '
const fs = require("fs");
const slugify = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const seed = fs.readFileSync("{OUTPUT_DIR}/seed_companies.txt", "utf-8").split("\n").filter(Boolean);
const lines = seed.map(c => {
  const slug = slugify(c);
  const guessedHost = c.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${c}|https://${guessedHost}.com|${slug}`;
});
fs.writeFileSync("{OUTPUT_DIR}/_seed_with_urls.txt", lines.join("\n") + "\n");
'

split -l 10 {OUTPUT_DIR}/_seed_with_urls.txt {OUTPUT_DIR}/_batch_triage_
ls {OUTPUT_DIR}/_batch_triage_* | wc -l
```

Then in a single message, dispatch one Agent call per batch (up to 6 in parallel). Each Agent gets the prompt from `references/workflow.md` → "ICP Triage" with placeholders substituted (`{SKILL_DIR}`, `{OUTPUT_DIR}`, `{USER_COMPANY}`, `{USER_PRODUCT}`, `{ICP_DESCRIPTION}`, `{COMPANY_LIST}`, `{TOTAL}`).

After all subagents return:
```bash
ls {OUTPUT_DIR}/companies/*.md | wc -l   # should equal wc -l seed_companies.txt
rm {OUTPUT_DIR}/_batch_triage_*
```

## Step 7: Filter by ICP Threshold

```bash
THRESHOLD=6   # from --icp-threshold flag
for f in {OUTPUT_DIR}/companies/*.md; do
  score=$(awk '/^icp_fit_score:/{print $2; exit}' "$f")
  if [ -n "$score" ] && [ "$(echo "$score" | cut -d. -f1)" -ge "$THRESHOLD" ]; then
    basename "$f" .md
  fi
done > {OUTPUT_DIR}/icp_fits.txt

wc -l {OUTPUT_DIR}/icp_fits.txt
```

Expected: 20-40% of `seed_companies.txt`. If < 10%, surface a warning.

## Step 8: Deep Research

Full Plan→Research→Synthesize on ICP-fit companies only. Hard cap: **5 tool calls per company**. Subagents OVERWRITE the existing triage stub.

```bash
while read slug; do
  website=$(awk '/^website:/{print $2; exit}' {OUTPUT_DIR}/companies/${slug}.md)
  echo "${slug}|${website}"
done < {OUTPUT_DIR}/icp_fits.txt > {OUTPUT_DIR}/_deep_targets.txt

split -l 5 {OUTPUT_DIR}/_deep_targets.txt {OUTPUT_DIR}/_batch_deep_
ls {OUTPUT_DIR}/_batch_deep_* | wc -l
```

Dispatch one Agent per batch in a single message with the prompt from `references/workflow.md` → "Deep Research". After all return:

```bash
grep -l "triage_only: false" {OUTPUT_DIR}/companies/*.md | wc -l   # should equal wc -l icp_fits.txt
```

## Step 9: Enrich Attendees + Draft Email (combined)

Per attendee at an ICP-fit company: harvest LinkedIn URL, recent activity (podcast / blog / talk / GitHub / X), score sales-readiness, draft personalized email — all in one subagent pass. Hard cap: **4 tool calls per person**, four lanes:

1. `bb search "{name} {company} linkedin"` (always)
2. `bb search "{name} podcast OR talk OR blog 2026"` (deep+)
3. `bb search "{name} github"` (deeper)
4. `bb search "{name} site:x.com OR site:twitter.com"` (deeper)

Quick mode: skip Step 9 (everyone scored COLD). Deep mode: lanes 1-2. Deeper mode: lanes 1-4.

### Step 9a — Ask the user: scope of enrichment

Before dispatching, compute the two candidate counts:

```bash
TOTAL=$(wc -l < {OUTPUT_DIR}/people.jsonl)
ICP_FITS=$(node -e '
const fs = require("fs");
const fits = new Set(fs.readFileSync("{OUTPUT_DIR}/icp_fits.txt", "utf-8").split("\n").filter(Boolean));
const slug2name = {};
for (const slug of fits) {
  const md = fs.readFileSync(`{OUTPUT_DIR}/companies/${slug}.md`, "utf-8");
  const m = md.match(/^company_name:\s*(.+)$/m);
  if (m) slug2name[slug] = m[1].trim();
}
const want = new Set(Object.values(slug2name).map(s => s.toLowerCase()));
const ppl = fs.readFileSync("{OUTPUT_DIR}/people.jsonl","utf-8").split("\n").filter(Boolean).map(JSON.parse);
console.log(ppl.filter(p => p.company && want.has(p.company.toLowerCase())).length);
')
LANES=2   # 2 (deep) or 4 (deeper)
```

Then ask via `AskUserQuestion`:

```
AskUserQuestion(questions: [
  {
    question: "Enrich which attendees?",
    header: "Enrichment scope",
    multiSelect: false,
    options: [
      { label: "ICP fits only", description: "${ICP_FITS} attendees, ~$((ICP_FITS * LANES)) calls (recommended)" },
      { label: "All attendees", description: "${TOTAL} attendees, ~$((TOTAL * LANES)) calls" }
    ]
  }
])
```

If "All attendees" and `TOTAL × LANES > 600`, print a warning and ask once more.

### Step 9b — Filter and batch

```bash
if [ "$ENRICH_SCOPE" = "all" ]; then
  cp {OUTPUT_DIR}/people.jsonl {OUTPUT_DIR}/_people_to_enrich.jsonl
else
  node -e '
const fs = require("fs");
const fits = new Set(fs.readFileSync("{OUTPUT_DIR}/icp_fits.txt", "utf-8").split("\n").filter(Boolean));
const slug2name = {};
for (const slug of fits) {
  const md = fs.readFileSync(`{OUTPUT_DIR}/companies/${slug}.md`, "utf-8");
  const m = md.match(/^company_name:\s*(.+)$/m);
  if (m) slug2name[slug] = m[1].trim();
}
const wantNames = new Set(Object.values(slug2name).map(s => s.toLowerCase()));
const lines = fs.readFileSync("{OUTPUT_DIR}/people.jsonl", "utf-8").split("\n").filter(Boolean);
const keep = lines.filter(l => { const p = JSON.parse(l); return p.company && wantNames.has(p.company.toLowerCase()); });
fs.writeFileSync("{OUTPUT_DIR}/_people_to_enrich.jsonl", keep.join("\n") + "\n");
console.error(`Enriching ${keep.length} of ${lines.length} attendees`);
'
fi

split -l 5 {OUTPUT_DIR}/_people_to_enrich.jsonl {OUTPUT_DIR}/_batch_people_
```

Dispatch one Agent per batch in a single message with the prompt from `references/workflow.md` → "Person Enrichment + Email". The prompt template handles BOTH enrichment AND the personalized email + sales-readiness scoring in one combined pass — substitute `{EVENT_CONTEXT}` (from `event_context.md`) and `{PROMO}` (from `promo.json`) at dispatch time so emails reference the actual event and weave in the discount code where it applies.

### Step 9c — Verify scoring + email distribution

After all enrichment subagents return, sanity-check the output. Each `people/{slug}.md` should now contain in its frontmatter:
- `sales_readiness`: `HOT | WARM | NURTURE | COLD`
- `email_subject`: short subject line
- `email_body`: 4-6 sentence personalized follow-up (multi-line YAML pipe scalar)
- `email_cta`: the call-to-action verb (book demo / share resource / stay in touch / no follow-up)

Sanity check the distribution:

```bash
for level in HOT WARM NURTURE COLD; do
  count=$(grep -l "sales_readiness: $level" {OUTPUT_DIR}/people/*.md 2>/dev/null | wc -l | tr -d ' ')
  echo "$level: $count"
done
```

If 100% HOT or 100% COLD, the scoring prompt is miscalibrated — see `references/email-patterns.md` → "Calibrating Sales-Readiness".

## Step 10: Compile Report

```bash
node {SKILL_DIR}/scripts/compile_report.mjs {OUTPUT_DIR} --open
```

Generates:
- `{OUTPUT_DIR}/index.html` — attendees grouped by sales-readiness (HOT → WARM → NURTURE → COLD), each card with subject + email body + Copy buttons
- `{OUTPUT_DIR}/people.html` — filterable attendee list (alternate view, with chips for sales-readiness, role, company)
- `{OUTPUT_DIR}/companies.html` — ICP-ranked company table with attendees
- `{OUTPUT_DIR}/results.csv` — one row per person with `email_subject`, `email_body`, `sales_readiness` columns for direct CRM import

Then present a summary in chat:

```
## Event Follow-Up Complete — {Event Name}

- **Total attendees parsed**: {count}
- **Unique companies**: {count}
- **ICP fits (score ≥ {threshold})**: {count}
- **Attendees enriched**: {count}
- **Sales-readiness distribution**:
  - 🔥 HOT (book a meeting): {count}
  - 🌡️  WARM (qualify in nurture): {count}
  - 🌱 NURTURE (educational content): {count}
  - ❄️ COLD (skip / generic newsletter): {count}
- **Report opened in browser**: {OUTPUT_DIR}/index.html
```

Show the **top 5 HOT attendees** as a markdown table sorted by company ICP score, then offer to:
- Adjust `--icp-threshold` and re-run Steps 7-10
- Export the CSV to a CRM
- Re-draft a specific person's email with a different angle (re-enrich just that person)
