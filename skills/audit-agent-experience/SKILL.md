---
name: audit-agent-experience
description: "Audit the developer experience of a product, SDK, docs site, or SKILL.md by dropping multiple Claude subagents at it with only a tiny task prompt and real tools (WebFetch, Bash, Write). Agents must discover the docs themselves, install deps, ask for credentials if needed, and attempt real execution. The skill captures each agent's trace — tool calls, retries, wall time, errors — and scores on Setup Friction, Speed, Efficiency, Error Recovery, and Doc Quality, then emits an HTML report with an A–F grade and concrete fixes. Use when the user asks to audit agent experience, test a skill, audit docs for agents, check if a SDK is agent-friendly, validate a SKILL.md, measure agent DX, or benchmark how painful onboarding is for an AI agent. Triggers: 'audit agent experience', 'test this skill', 'audit docs for agents', 'is my SDK agent-friendly', 'run a DX audit', 'agent experience test', 'test my docs', 'how do agents do with my product'."
license: MIT
metadata:
  author: jay
  version: "1.4.0"
allowed-tools: Read WebFetch Write Bash AskUserQuestion Agent
---

# Audit Agent Experience

Evaluate how well a product/SDK/docs surface works when an AI agent actually tries to onboard and do a realistic task — **starting from a short one-sentence prompt**, with nothing pasted in. The agent must find the docs, install what it needs, and attempt real work. That's the only honest test of agent DX.

The skill spawns multiple subagents in parallel, captures each one's tool-call trace, and scores the experience using the same dimensions as the Skill Test Arena dashboard: Setup Friction, Speed, Efficiency, Error Recovery, Doc Quality.

## Core principle

**Do not spoonfeed.** The subagent gets a tiny prompt like *"Get started with {product} and {do its primary thing}"*. It must discover the docs, choose the path, and hit real failures. A good doc survives this; a bad doc does not.

## Workflow

Execute these steps in order. Do not skip ahead.

### Step 1 — Identify the target and define the abstract goal

Resolve what the user is asking to audit. The target may arrive in one of three forms:

- **URL** — a docs site or product page (e.g., `https://docs.example.com`). This is the *seed* the subagents start from.
- **Repo / file path** — for SKILL.md audits or SDK repos.
- **Product name** — if the user is vague ("test my product"), ask via `AskUserQuestion` for the URL or repo.

**This skill is product-agnostic. Never assume what the user wants to audit.** Do not infer a target from environment signals (operator's email domain, git remote, repo name, recent files, memory, CLAUDE.md). Even if context strongly suggests a particular company, the user-facing question must NOT pre-fill or default to any specific product, URL, or company name. Ask open-endedly with neutral options only: e.g., "Paste a URL", "Paste a local path", "Type a product name". If the user did not name a target in their invocation, ask them — start fresh, no priors.

**Research lightly** *after* the user has named a target. 1 WebFetch max, enough to confirm: what is this product, and does it have a getting-started guide? You're identifying *that there is a flow to follow*, not extracting the steps. The whole point is to let the docs dictate the path.

**Define ONE abstract goal, not a step-by-step checklist.** The goal should be at the level of "complete the onboarding" or "make the product do its primary thing once" — NOT a list of specific actions.

Why: prescriptive checklists steer agents. If you tell them "navigate to example.com" but the docs' quickstart navigates to a different URL, the agent is torn between your instruction and the docs. That pollutes the test.

Examples of good abstract goals (the target product is supplied by the user — the examples below are illustrative only, not defaults):
- A search API → *"Complete the getting-started guide. Success = your code successfully calls the API and prints whatever the docs treat as a meaningful result."*
- A payments API → *"Complete the getting-started flow for making a test charge. Success = you have a charge ID or equivalent confirmation."*
- A browser-automation SDK → *"Complete the getting-started guide end-to-end. Success = you have code that runs a cloud browser session using whatever approach the docs recommend."*
- A SKILL.md → *"Follow the skill's instructions and produce a successful outcome for its advertised job."*

Examples of BAD goals (too prescriptive — don't do this):
- ~~"Navigate to https://example.com"~~ (steers — the docs may pick a different URL)
- ~~"Use Playwright"~~ (the docs may recommend Stagehand or Selenium)
- ~~"Print the page title"~~ (the docs may print session ID, response body, anything)

The subagent will self-report against the abstract goal: *did I complete the onboarding as the docs described?* (yes / no / partial). The concrete sub-outcomes the agent *actually achieved* live in their trace under `primary_outcome_achieved`, not in a pre-defined checklist.

If the target has no clear getting-started flow (rare — even a README is a flow), ask the user what "done" means before continuing.

### Step 2 — Gather audit config via AskUserQuestion

Use `AskUserQuestion` in a **single call with 4 questions**. Options: max 4 per question.

1. **Test depth** (single-select, header: `"Depth"`):
   - `5 agents (Recommended)` — balanced coverage
   - `3 agents` — quick sanity check
   - `10 agents` — thorough, higher cost

2. **Programming languages** (multiSelect, header: `"Languages"`): pick up to 4 — `Python`, `TypeScript`, `Go`, `Shell/Bash` (let user deselect).

3. **Personas** (multiSelect, header: `"Personas"`):
   - `Standard (Recommended)` — neutral baseline, no behavioral flavoring. Just "do the task." Best for unbiased measurement.
   - `Pragmatic` — just get it working, fastest path
   - `Thorough` — read the docs end-to-end before coding
   - `Skeptical` — verify claims the docs make

4. **Execution mode** (single-select, header: `"Exec mode"`):
   - `Allow Bash (Recommended)` — subagents can run `npm install`, `curl`, etc. on your machine. Most realistic.
   - `Draft-only` — subagents may fetch docs and write code but won't execute anything. Safer.

After the user answers, gather one more question about model choice:

5. **Model** (single-select, header: `"Model"`):
   - `Sonnet (Recommended)` — balanced cost/quality, default for most audits
   - `Opus` — strongest reasoning, highest cost; good for dense/ambiguous docs
   - `Haiku` — cheapest, fastest; good for checking if docs are agent-friendly to smaller models
   - `Mixed comparison` — split agents across Opus + Sonnet + Haiku so you can see how doc quality varies by model size. Useful for "are my docs robust even to weaker models?"

Pass the chosen model to each `Agent` invocation via the `model` parameter. If `Mixed`, distribute N agents roughly equally across the 3 models (round-robin by slot index) and record which model each agent used in the trace + report.

After the user answers, you have: `depth` (N), `languages[]`, `personas[]`, `exec_mode`, `model`.

**If `exec_mode = "Allow Bash"`**, follow up with a second AskUserQuestion asking about credentials:

- **Credentials** (single-select, header: `"Credentials"`):
  - `Auto-discover (Recommended)` — skill checks the user's env vars, common dotfiles, and credential managers; only prompts for paste if nothing found. Best for repeat use and for cases where another operator is running the audit.
  - `None — let agents block (friction test)` — agents hit the credential wall, counts as Setup Friction. Best for pure docs audits.
  - `Paste manually` — you paste keys directly; skill injects them. Use when you don't have keys stored locally yet.

If user picks `Auto-discover`, run **Step 2.5** below before continuing. If `Paste manually` (or auto-discover falls back), AskUserQuestion asks for the credential **values** — not the names. The skill then writes them to each workspace `.env` using **generic, product-agnostic names**:

- Primary credential → `API_KEY`
- Secondary (e.g. project/org ID) → `PROJECT_ID`
- Third (e.g. webhook secret) → `SECRET`

**Do NOT use product-specific names** like `BROWSERBASE_API_KEY`, `EXA_API_KEY`, `STRIPE_SECRET_KEY`. Those names steer the agent — they see `BROWSERBASE_API_KEY` in env and skip ever reading the docs to find out what env var the SDK actually expects. The generic name forces them to:

1. Read the docs to discover the product's actual env var name (e.g. `BROWSERBASE_API_KEY`).
2. Map the generic `API_KEY` value into whatever form the SDK requires — either re-export (`export BROWSERBASE_API_KEY=$API_KEY`) or pass inline in code (`new Browserbase({ apiKey: process.env.API_KEY })`).

If an agent fails to figure out the mapping, that's a doc quality signal — the docs weren't clear about credential naming.

### Step 2.5 — Credential auto-discovery (only if user picked `Auto-discover`)

Run a tiered lookup. **Stop at the first tier that produces a usable candidate.** Never print credential values to chat — only names and source paths. The user picks by name; the skill internally maps name → value → workspace `.env`.

**Derive the product slug** from the target URL/repo to bias toward relevant matches. e.g. `https://docs.browserbase.com` → slug `browserbase`. Use lowercase substring match (case-insensitive) when ranking candidates.

**Tier 1 — Already-exported env vars (free, zero side effects):**

```bash
printenv | grep -iE '^[A-Z][A-Z0-9_]*_(API_KEY|TOKEN|SECRET|KEY)=' | cut -d= -f1
```

This returns names only. If any names contain the product slug, those are top candidates.

**Tier 2 — Narrow dotfile scan (a hardcoded short list, NOT a recursive grep):**

```bash
grep -hE '^[[:space:]]*export[[:space:]]+[A-Z][A-Z0-9_]*_(API_KEY|TOKEN|SECRET|KEY)=' \
  ~/.zshrc ~/.bashrc ~/.bash_profile ~/.zprofile ~/.env ./.env ./.envrc 2>/dev/null \
  | sed -E 's/^[[:space:]]*export[[:space:]]+([A-Z0-9_]+)=.*/\1/' \
  | sort -u
```

Files allowed: `~/.zshrc`, `~/.bashrc`, `~/.bash_profile`, `~/.zprofile`, `~/.env`, `./.env`, `./.envrc`. **Do NOT expand this list. Do NOT recurse. Do NOT scan `~/Library`, `~/.config/`, `~/Documents`, etc.** This is the entire allowlist; anything else is out of scope and risks leaking unrelated secrets.

For each match, record `(NAME, source_path)`. Read the value lazily — only when the user has confirmed the choice — by re-grepping the specific source file for that exact name.

**Tier 3 — Credential manager (only if `op` or `security` is on PATH AND tiers 1–2 had no good match):**

- 1Password CLI: skip unless `op account list` exits 0 (i.e. user is signed in). Don't trigger an interactive auth flow inside the skill.
- macOS Keychain: `security find-generic-password -l "<expected-name>" -w` — try once with the most likely name (e.g. `BROWSERBASE_API_KEY`); silent failure means not stored.

If a credential manager produces hits, list them as candidates the same way as tiers 1–2.

**Tier 4 — Fallback to paste:** If all tiers above produced zero candidates, fall through to the manual paste flow described in Step 2.

**Presenting candidates to the user.** After tiers 1–3:

- **If exactly 1 candidate** and its name contains the product slug → use it silently. Log a one-line confirmation in chat: `Using BROWSERBASE_API_KEY from ~/.zshrc.` (Name + source only — never the value.)
- **If multiple candidates**, AskUserQuestion (single-select, header: `"Use which credential?"`) with up to 4 options:
  - One option per top candidate, formatted `<NAME> (from <source>)`
  - Plus a `Paste manually instead` escape hatch
  - If >3 candidates, show the top 3 by slug-relevance and add a `Show all` option that re-asks with the rest.
- **If no candidates** → fall through to Tier 4 (paste).

**Reading the value.** Once the user has confirmed a choice (or it was auto-selected), read the value:
- Tier 1: `printenv <NAME>` (capture stdout, do not echo).
- Tier 2: re-grep the specific source file for the exact `export <NAME>=` line and parse the RHS, stripping surrounding quotes.
- Tier 3: `op read "op://<vault>/<item>/<field>"` or `security find-generic-password -l <NAME> -w`.

Write the value into per-agent workspace `.env` files using the same generic names (`API_KEY`, `PROJECT_ID`, `SECRET`) as the paste flow — see Step 2. The discovery layer is upstream of injection; downstream behavior (generic names, agent must read docs to map them) is unchanged.

**Orchestrator-retained credentials.** After writing per-agent `.env` files, the orchestrator keeps the **original product-specific names → values** (e.g. `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID`) available to itself for downstream verification work in Steps 6 / 6.5 / 8 — for example, calling the product's API with `curl` to confirm that a session ID an agent reported actually resolves, or fetching session metadata to enrich the report. The orchestrator can read them with `printenv` (no need to store anywhere — the parent shell already has them since auto-discover sourced them from there).

This is asymmetric on purpose: the subagents see only generic `API_KEY` / `PROJECT_ID` / `SECRET` so the doc-quality test stays honest (they must read the docs to discover the real var name). The orchestrator is not being audited, so it can use the real names freely for verification.

**Privacy guarantees the skill must uphold:**
- Never write a credential value to chat output, the trace, the report, or any file outside the per-agent workspace `.env`.
- Never re-export the value into a **subagent's** workspace under a product-specific name. Subagents only see the generic names.
- Treat values as opaque strings — do not log length, prefix, or fingerprint.
- The HTML report records that auto-discovery happened (and which name was used) but never the value.

### Step 3 — Safety check

If `exec_mode = "Allow Bash"`, print a brief warning to chat before spawning: *"Agents may run real shell commands (npm install, curl, pip install, git clone) on this machine. Make sure you're in a directory you're okay with agents modifying. Continue in 5 seconds or Ctrl-C to abort."* — then continue.

Do not run `sleep` — just proceed after printing. The user reads the warning before the agents start working.

### Step 4 — Generate tiny prompts (no checklist)

For each of N variants, produce a `(persona, language, prompt)` tuple. The prompt is **one or two sentences**, stating the abstract goal + language. **No sub-checklist, no prescriptive steps.**

Template:

```
{persona_prefix} {product}'s getting-started guide using {language}. You've completed it when you've done whatever the guide treats as the primary successful outcome.
```

Examples (using `Acme` as a placeholder — substitute the user-supplied product name):
- Pragmatic × TypeScript → *"Get started with Acme using TypeScript (Node.js). Complete whatever the getting-started guide considers a successful first run."*
- Thorough × Python → *"Read Acme's getting-started guide and follow it end-to-end using Python. You're done when the guide's expected outcome is achieved."*
- Skeptical × Shell → *"Figure out how to complete Acme's getting-started flow using bash/curl. Note anything in the docs that seems wrong as you go."*

The subagent is NOT told what the success outcome is — they have to read the docs to figure that out. That's the point: if the docs are good, they'll convey it clearly. If the docs are bad, the agent won't know when they're done, which IS a finding.

Read `references/prompt-variants.md` for the persona prefix library. Cross-product personas × languages, truncate to N. If cells < N, repeat with slight wording variation on the prefix.

Never paste doc content into the prompt.

### Step 5 — Spawn N subagents in parallel

Read `references/subagent-brief.md` — the full brief each subagent receives. It tells them:
- You are a real developer doing a real task
- Use your real tools (`WebFetch`, `Bash` if allowed, `Write`)
- If you need credentials, ask the user via a clear stop-and-ask message (the skill captures this as friction)
- Return a structured trace at the end with tool calls, errors, timing estimates, completion status

For each variant, invoke the `Agent` tool (subagent_type: `general-purpose`). Pass `model: "opus" | "sonnet" | "haiku"` per the user's choice. For `Mixed`, rotate models across the N slots deterministically (agent 1 → opus, agent 2 → sonnet, agent 3 → haiku, agent 4 → opus, …) and record the assigned model in the per-agent report row.

All N calls in **one message** so they run in parallel.

The subagent's prompt = the brief + their tiny task. The brief passes through `exec_mode` so the subagent knows whether Bash is available.

**Wait for all N agents to return before continuing to Step 6.** When agents are run in the background, completion notifications arrive one at a time and it is easy to lose count. Maintain a simple in-memory tally of returned-vs-spawned and, when the last agent reports back, print one explicit milestone line to chat: *"All N agents returned — moving to trace parsing."* Do not start Step 6 until that line has been printed. If the user asks "are the agents still running?" mid-flight, answer with the current `<returned>/<spawned>` count from your tally, not from re-counting prior chat output.

**Verification of agent claims using orchestrator credentials.** Before scoring, if Step 2.5 retained product-specific credentials, the orchestrator may use them to spot-check claims that subagents made (e.g. confirming a session ID with `curl -H "X-BB-API-Key: $BROWSERBASE_API_KEY" https://api.browserbase.com/v1/sessions/<id>`). Treat any unresolved IDs as evidence the agent may have hallucinated. Never include the credential header in the report — only the verification result (resolved / not resolved).

### Step 6 — Parse structured traces AND keep the full prose

Each subagent returns two things in one response:
1. A fenced JSON trace at the end (structured self-report).
2. All the prose before it — reasoning, tool output, and what the agent actually did.

**Retain both.** Do not throw the prose away after extracting JSON. The prose is where you catch things the JSON self-report misses.

Extract JSON using: `/```json\s*(\{[\s\S]*?\})\s*```\s*$/`. Mark malformed/missing as `errored` with a `raw_tail`. If >50% errored, warn and offer retry.

Compute the top-line numbers from the JSON:
- **Onboarding success rate** = fraction of agents with `onboarding_status = "completed"`.
- **Docs-promise-match rate** = fraction of agents with `docs_promise_met = true`.

### Step 6.25 — Annotate URL provenance per-WebFetch (inline in trace)

**Subagents don't have search** — they guess URLs from training-data priors. Reports must show *per WebFetch call* where the URL came from, rendered as a small muted line directly under the tool input block in the trace. Do NOT put this at the top of the report as a general callout — it's only useful inline where the reader can correlate it to the specific call.

Classify each `WebFetch` URL into one of four provenance categories and render with the matching label + color:

- **`TRAINING PRIOR`** (violet) — URL is a guess from training data (product name + common doc-site conventions like `/introduction`, `/quickstart`, `/sdk/{lang}`). Typical for the first 1–2 WebFetch calls.
- **`FROM LLMS.TXT`** (blue) — URL appears in the output of a prior `llms.txt` fetch in the same trace.
- **`FROM PREV PAGE`** (green) — URL was listed in the output of a previous WebFetch or Bash tool call in the same trace.
- **`GUESS · 404`** (amber) — URL was guessed but 404'd — this is the most interesting category for doc-quality scoring (the URL *should* exist by convention but doesn't).

Classification heuristic:
1. If the same trace earlier contained a successful `llms.txt` WebFetch whose output mentioned this URL → `FROM LLMS.TXT`
2. Else if the same trace earlier contained any WebFetch/Bash output that mentioned this exact URL → `FROM PREV PAGE`
3. Else if the subsequent tool_result has `err: true` with 404 content → `GUESS · 404`
4. Else → `TRAINING PRIOR`

Score interpretation:
- **Lots of `TRAINING PRIOR` that succeed** = product is well-represented in training data (head start).
- **Lots of `GUESS · 404`** = URL taxonomy drifts from common conventions → real doc-discoverability finding.
- **`FROM LLMS.TXT` appearing often after `GUESS · 404`** = `llms.txt` is carrying the docs' discoverability. Credit it explicitly in the findings.

### Step 6.5 — Narrative cross-agent review (CRITICAL)

Before scoring, re-read the **full prose** from every agent. The JSON trace is the agent's self-report — an agent that hallucinated a wrong package name will also describe it correctly in its own trace. The truth lives in the tool output and the prose.

Scan for these patterns across the N transcripts:

1. **Convergent mistakes.** Did multiple agents try the same wrong thing? Wrong npm package name (e.g., `exa` vs `exa-js`), wrong endpoint, wrong env var, wrong import? If 3/3 agents used the wrong package, that's a **doc quality disaster** even if each "completed" the task. Agents don't invent identical wrong answers — shared training-data residue means the docs aren't overriding the model's wrong priors.

2. **Hallucinated artifacts.** Compare each agent's `primary_outcome_achieved` claim against what their tool output actually shows. If they claim "printed the title" but no title-fetching tool call appears in their Bash output, they're confabulating. Likely means the doc was unclear enough that the agent pattern-matched instead of reading.

3. **Inconsistent outcomes.** If 3 agents describe 3 different "successful" end-states, the docs don't clearly define success.

4. **Silent workarounds.** Did agents patch a bug (missing `await`, wrong env var name, undocumented required parameter) that a human copy-paster wouldn't have? Flag these — they're invisible DX taxes only captured in prose.

5. **Tool-output vs. narrative contradictions.** Sometimes an agent says "it worked" but the stderr from their Bash call says otherwise, and they failed to notice. Grep tool outputs in the prose for `error`, `404`, `401`, `deprecated`, `warning`.

Write a 3–5 sentence **Narrative Review** summary and include it prominently in the final report. This often surfaces the highest-value findings of the whole audit.

### Step 7 — Score the 5 Arena dimensions

Read `references/evaluation-rubric.md` for full criteria. Score 0–100 based on aggregated evidence.

**Onboarding success rate is the primary sanity check.** See `references/evaluation-rubric.md` § 0 for the exact cap tiers — at <50% completion, every dimension is capped at 55 regardless of other evidence.

- **Setup Friction (25%)** — credential prompts, auth retries, install errors. Goal items in the "setup" phase failing = big hit.
- **Speed (20%)** — total wall time, time-to-first-working-code.
- **Efficiency (20%)** — tool calls per passed goal item, wasted calls.
- **Error Recovery (15%)** — did errors block goal items, or did agents route around?
- **Doc Quality (20%)** — did docs supply what was needed to pass the checklist?

Weighted total → letter grade (90+ A, 75+ B, 60+ C, 45+ D, else F).

### Step 8 — Synthesise findings

Produce:

- **Executive summary** — 2–3 sentences. Lead with the grade and the single biggest friction.
- **What went well** — 3–5 bullets.
- **What didn't** — 3–5 bullets.
- **Common friction patterns** — anything hit by ≥2 agents (the high-signal fixes).
- **Session timeline** — aggregate phases across agents (Research, Setup, Execution, Validation) with rough times.
- **Tool call breakdown** — totals across all agents by tool type.
- **Recommended fixes** — prioritised, each citing the doc section or SDK method and a specific rewrite.

### Step 9 — Render the HTML report

Read `assets/report-template.html`. Fill placeholders:

`{{TITLE}}`, `{{TARGET_REF}}`, `{{META}}`, `{{GRADE_LETTER}}`, `{{GRADE_CLASS}}`, `{{OVERALL_SCORE}}`, `{{AGENT_COUNT}}`, `{{COMPLETED_COUNT}}`, `{{STUCK_COUNT}}`, `{{ERRORED_COUNT}}`, `{{NARRATIVE_REVIEW_SECTION}}` (see format below), `{{EXEC_SUMMARY}}`, `{{WENT_WELL_ITEMS}}`, `{{DIDNT_GO_WELL_ITEMS}}`, `{{TIMELINE_SECTION}}`, `{{TOOL_BREAKDOWN_SECTION}}`, `{{METRICS_GRID}}`, `{{PATTERNS_SECTION}}`, `{{FIXES_LIST}}`, `{{AGENT_RESULTS_TABLE}}` (at-a-glance summary table — see format below), `{{AGENT_TRACES_SECTION}}` (full collapsible per-agent trace cards — see format below).

**Section order in the rendered report** (the template enforces this — do not reorder):
1. Scorecard + agent-status stat grid
2. Narrative Review (`{{NARRATIVE_REVIEW_SECTION}}`)
3. Executive Summary
4. Recommended Fixes
5. What Agents Said (worked / didn't)
6. Common Friction Patterns (`{{PATTERNS_SECTION}}`)
7. Quantitative Metrics
8. Tool Call Breakdown
9. Session Timeline
10. Per-agent Runs (results table + traces)

Rationale: opinion before data. The reader needs the verdict (narrative + exec summary) and the actionable fix list before being asked to absorb metrics or timelines. Reference-y sections (timeline, tool breakdown) sit near the bottom for verification, not framing.

**`{{NARRATIVE_REVIEW_SECTION}}` format.** A `<div class="narrative-review">` containing a `<div class="label">Narrative Review</div>` and a `<div class="body">…</div>` with the 3–5 sentence cross-agent summary from Step 6.5. This is the highest-value finding of the audit — keep prose tight, lead with the strongest observation. If Step 6.5 produced no notable cross-agent finding, render the section with a one-line body: `No cross-agent patterns of note — agents converged on the docs' intended path with minor individual variation.` Do not omit the section.

The 5 dimension scores are still computed (they feed the overall weighted score and letter grade), but **do not render a per-dimension breakdown section** — it adds visual weight without giving the reader anything actionable beyond what the narrative review and recommended fixes already cover. Keep dimension scoring internal.

**`{{AGENT_RESULTS_TABLE}}` format.** A `<table class="agent-results-table">` rendered immediately above the per-agent cards. One row per agent with these columns (in order):

1. **#** — slot index (1-based), right-aligned, monospace.
2. **Persona × Language** — e.g. `Standard · TypeScript`. Use the values from the agent's JSON trace.
3. **Model** — render this column ONLY when `model = Mixed` (otherwise omit the column entirely; the single model is named in the header `{{META}}` line).
4. **Status** — a `<span class="status-pill {{status}}">` matching `onboarding_status` from the JSON (`completed`, `partial`, `stuck`, `blocked-on-credentials`). Map `errored` (parser-failed traces) to its own pill.
5. **Tool calls** — sum of `count` across the agent's `tool_calls[]` array. Right-aligned, monospace.
6. **Time** — `wall_time_estimate_sec` from the JSON, formatted as `92s` (or `2m 14s` if ≥120s). Right-aligned, monospace.

Rationale: the cards below are detailed but require expanding each one. The table gives a one-screen comparison so the reader can spot outliers (the agent that took 3× as long, the one that fired 2× the tool calls) before drilling in.

**`{{AGENT_TRACES_SECTION}}` format.** One `<details class="trace-card">` per agent. Each card's summary line MUST include the model used (e.g. `<span class="chip">opus</span>`) alongside persona/language chips. The card expands to show:

1. **Event log (from `detailed_trace`)** — rendered in **compact Arena-style**: monospace rows with color-coded bracketed labels, minimal chrome, no dots or timeline lines. Each row is one line of text; Input/Output blocks appear as indented `<pre>` blocks directly under their tool call (always visible, not click-to-expand — users want to scan the flow).

   The FIRST event in every log is the **prompt that was sent to that subagent**, rendered with the gold `[PROMPT]` label at timestamp `[setup]`. The full prompt is behind a small click-to-expand button (the only collapsible in the stream — prompts are long and users don't always need them).

   Visual structure:

   ```
   [setup]     [PROMPT]       Task prompt sent to subagent   [▸ Show full prompt]
   [+0ms]      [MILESTONE]    agent_started
   [+100ms]    [THOUGHT]      I'll start by discovering the docs.
   [+1.2s]     [TOOL_USE #1]   WebFetch
                 Input: { "url": "...", "prompt": "..." }
   [+3.4s]     [TOOL_RESULT #1]
                 Output: # Example Product ...
   [+4.5s]     [TOOL_USE #2]   Bash
                 Input: { "command": "npm install ...", "description": "..." }
   [+9.2s]     [TOOL_RESULT #2]
                 Output: added 12 packages ...
   [+12s]      [ERROR]         install · PEP 668 blocked · recovered
   [+45s]      [RESULT ✓]      Session created, task done.
   ```

   CSS conventions (compact monospace, light background):
   - Container: `.trace-timeline` — light gray background (`#fafaf9`), monospace font throughout, 0.78rem font-size, scrollable (max 640px)
   - Each row: no grid, just inline text. `[time]` (muted) + `[LABEL]` (colored, bold) + body content
   - Bracketed label color per type:
     - `[PROMPT]`: gold
     - `[MILESTONE]`: blue
     - `[THOUGHT]`: violet (body text also italic + muted)
     - `[TOOL USE]`: orange (`#ff6b35` or whatever brand accent the report uses)
     - `[TOOL RESULT]`: green (or red if errored)
     - `[ERROR]`: red (body also red)
     - `[RESULT ✓]`: green (body green, bold)
   - Tool-name: orange + semibold
   - Input/Output: visible inline as `.trace-io` blocks with colored left-border (orange for input, green for output, red for errors). `<pre>` block shows the **full** tool input as JSON — never abbreviate. For `WebFetch` specifically, that means showing *both* the `url` AND the `prompt` args — the `prompt` is what the agent asked the page's content to be distilled to, and it's critical signal for understanding agent intent. If the input is large, truncate the value (not the structure) with `…` inside the relevant string.
   - Prompt block is the exception — it's collapsed by default (prompts are long). Its summary IS visible as a small "▸ Show full prompt" button.
   - Never revert to dark background — clashes with rest of report.
   - No grid, no dots, no vertical line — keep it text-flow.

**The main agent keeps each subagent's prompt.** When spawning agents in Step 5, cache the full prompt text keyed by agent index so you can retrieve it for the report. Future-you (rendering) needs to look up what was sent to which agent.

2. **Agent's final prose summary** — kept as a secondary scrollable box below the event log (this is the self-report; the trace is the ground truth).
3. Tool calls summary grid (name, count, purpose) — quick reference
4. Evidence (session ID, stdout, etc)
5. Friction points
6. Errors (if any)
7. Positive moments

The event log is the star of the show — this is what gives users the same "I can see exactly what the agent did and thought" experience as the Arena trace view. The prose summary is a narrative recap but the trace is the primary record.

**Per-agent results table** must include a `Model` column when `model = Mixed`, so cross-model comparison is visible at a glance. When a single model was used, mention it once in the header `{{META}}` line instead.

HTML-escape all user-supplied strings. Doc quotes go in `<code>` or `<blockquote>`.

**All URLs must be clickable.** When the report references:
- Relative doc paths (e.g. `/quickstart`) → wrap as `<a class="doc-link" href="{TARGET_BASE_URL}{path}" target="_blank" rel="noopener"><code>{path}</code></a>` where `{TARGET_BASE_URL}` is the audit target's origin (e.g. `https://docs.example.com`)
- Session/resource IDs (e.g. `f0ec58cc`) → link to the full resource URL (e.g. `https://app.example.com/sessions/{full-id}`) with a `↗` suffix indicating external link
- Full URLs appearing in prose → already linkable, just ensure they're wrapped in `<a>` not just `<code>`

The CSS for these link classes:
```css
a.doc-link { text-decoration: none; color: inherit; }
a.doc-link:hover code { background: #fff4ef; border-color: var(--brand); color: var(--brand); }
a.session-link { color: #166534; text-decoration: none; }
a.session-link:hover { text-decoration: underline; }
```

Rationale: a 404 finding is useless if the user can't click to verify. A session ID is useless if the user can't click through to the recording. Every URL-like string in the report should be one click away from verification.

### Step 10 — Save and surface

Save to `./audit-agent-experience-<slug>-<timestamp>.html` (cwd). Slug = lowercase target basename with non-alphanumerics → `-`. Timestamp = `YYYYMMDD-HHMMSS`.

Print to chat:
- Grade, overall score, and the single biggest fix.
- Count summary: N agents, M completed, K stuck.
- The full file path.

Open via `Bash: open <path>` on macOS if `exec_mode` allowed it; otherwise just print the path.

### Step 11 — Clean up workspaces

If `exec_mode = "Allow Bash"` and you created per-agent subdirectories under `./dx-audit-tmp/` (or similar), delete that tree after the report is rendered:

```bash
rm -rf ./dx-audit-tmp/
```

Rationale: agents install node_modules, venvs, Go modules, etc. — often tens of MB per agent. Leaving them around pollutes the user's repo and wastes disk.

**Exception:** if a subagent's `onboarding_status` is `stuck`, or its trace was marked `errored` (JSON parse failed), leave that agent's subdir in place and note it in chat — the user may want to inspect the failing state. Delete only the completed / blocked-on-creds agents' dirs.

If `exec_mode = "Draft-only"`, no cleanup is needed (no files were written outside the report).

## Reference files

- **`references/evaluation-rubric.md`** — 5-dimension scoring rubric (Arena methodology).
- **`references/prompt-variants.md`** — Persona prefix library and core-task heuristics.
- **`references/subagent-brief.md`** — Verbatim brief + trace JSON schema.

## Assets

- **`assets/report-template.html`** — HTML template with placeholders, stamped into the final report.

## Constraints

- Never paste the target doc into the subagent's prompt — that's the whole point.
- `exec_mode = Draft-only` must disable Bash execution in the subagent brief.
- Never test a target the user didn't explicitly name.
- **Never pre-fill a product, URL, or company in any user-facing question.** Ignore environment signals (email domain, git remote, repo name, memory). Start fresh — the operator may be auditing anyone.
- If a subagent asks for credentials, **that counts as friction** in the score — don't "help" it by auto-providing. Let the agent hit the wall and record it.
- Never write to files outside cwd except the HTML report.
