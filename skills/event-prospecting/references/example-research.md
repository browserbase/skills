# Example Research Files

Event-prospecting writes TWO kinds of markdown files:

1. **Company files** — one per company in `seed_companies.txt`, written to `{OUTPUT_DIR}/companies/{slug}.md`. Comes in two flavors: triage stubs (Step 5) and deep-research files (Step 7).
2. **Person files** — one per speaker at an ICP-fit company, written to `{OUTPUT_DIR}/people/{slug}.md`. Created in Step 8.

The YAML frontmatter contains structured fields for report compilation. The body contains human-readable research.

`{OUTPUT_DIR}` is the per-run Desktop directory set up by the main agent in Step 0 (e.g., `/Users/jay/Desktop/stripesessions_prospects_2026-04-25-2030/`).

---

## Company File — Triage Stub (Step 5 output)

Every company in `seed_companies.txt` gets one of these. It captures a 1-call, ICP-only assessment.

```markdown
---
company_name: OpenAI
website: https://openai.com
product_description: AI lab building safe AGI; ChatGPT, GPT API, ChatGPT Agent
icp_fit_score: 9
icp_fit_reasoning: AI agents at scale need cloud browser infrastructure; ChatGPT Agent shipped Mar 2026
triage_only: true
event_context: Stripe Sessions 2026 — featured speaker on AI track
---

## Triage Notes
Homepage: "ChatGPT, GPT API, and ChatGPT Agent — AI tools and APIs for everyone."
Score 9 because ChatGPT Agent ships browser-using AI agents at consumer scale — the canonical fit for browser infrastructure.
```

**Required fields**: `company_name`, `website`, `icp_fit_score`, `icp_fit_reasoning`, `triage_only: true`.

---

## Company File — Deep Research (Step 7 output)

When a company's `icp_fit_score >= --icp-threshold`, Step 7's deep research overwrites the triage stub with this richer version. `triage_only` flips to `false`.

```markdown
---
company_name: OpenAI
website: https://openai.com
product_description: Foundational AI lab; products span ChatGPT (consumer chat), GPT API (developer access), and ChatGPT Agent (browser-using autonomous agent)
industry: AI / Foundation Models
target_audience: Consumers, developers, enterprise — multi-segment
key_features: ChatGPT Agent | GPT-5 API | Sora video | enterprise data residency
icp_fit_score: 9
icp_fit_reasoning: ChatGPT Agent (Mar 2026) is a browser-using agent at consumer scale — directly addresses the "agents need a browser" wedge. Plus enterprise customers ship internal agents on top of GPT API.
employee_estimate: 3000+
funding_info: $11.3B raised; reported $300B valuation 2026
headquarters: San Francisco, CA
triage_only: false
event_context: Stripe Sessions 2026 — Greg Brockman featured speaker, Agents track
event_relevance: Three OpenAI speakers across the Agents and Infra tracks; ChatGPT Agent demo expected at the event
---

## Product
Foundational AI lab. Three product surfaces: ChatGPT (consumer/team chat), GPT API (developer platform), ChatGPT Agent (autonomous browsing agent that completes multi-step tasks). Recently shipped Sora 2 for video.

## Research Findings
- **[high]** ChatGPT Agent launched Mar 2026 — autonomous web-browsing agent that books, shops, and researches on user's behalf (source: openai.com/index/chatgpt-agent)
- **[high]** Stripe Sessions 2026 keynote includes Greg Brockman on the Agents track (source: stripesessions.com/speakers)
- **[medium]** Hiring across "Agent Reliability" team — 12 open roles for browser-automation engineers (source: openai.com/careers, search 2026-04)
- **[medium]** Reported partnership exploration with infrastructure providers for agent runtime (source: The Information, 2026-03)

## Event Relevance
Three speakers at Stripe Sessions across Agents and Infra tracks. ChatGPT Agent is the canonical use-case for browser-infrastructure-as-a-product. Pitch angle: durability + scale guarantees the in-house Browserbase-equivalent can't easily match.
```

**Additional fields vs the stub**: `industry`, `target_audience`, `key_features` (pipe-separated), `employee_estimate`, `funding_info`, `headquarters`, `event_relevance`.

**Body sections**: `## Product`, `## Research Findings`, `## Event Relevance`.

---

## Person File (Step 8 output)

Only created for speakers at ICP-fit companies (those whose company file has `triage_only: false` after Step 7).

```markdown
---
name: Greg Brockman
slug: greg-brockman
company: OpenAI
company_slug: openai
title: President & Co-founder
links:
  linkedin: https://www.linkedin.com/in/thegdb/
  x: https://x.com/gdb
  github: https://github.com/gdb
  blog: null
  podcast: https://lexfridman.com/greg-brockman/
hook: Recent Lex Fridman conversation on agent reliability — direct fit for the browser-infrastructure durability story
dm_opener: |
  Hey Greg — caught your Lex conversation on agent reliability and the
  "agents are bottlenecked on the browser" framing landed hard. We run
  the cloud-browser layer that ChatGPT Agent's competitors are shipping
  on. Worth a 15-min walkthrough before Sessions?
role_reason: Co-founder, sets infrastructure direction across product surfaces
event_name: Stripe Sessions 2026
event_context: Panelist, Agents track ("From demo to dependable: making agents reliable")
icp_fit_score: 9
icp_fit_reasoning: AI agents at scale need cloud browser infrastructure; ChatGPT Agent shipped Mar 2026
enriched_at: 2026-04-25T20:30:00Z
---

## Why reach out
- **Why the company**: ChatGPT Agent is the canonical browser-infra customer — see `companies/openai.md`
- **Why the person**: Co-founder; sets infra direction; specifically called out agent reliability on Lex (Mar 2026)
- **Hook**: Lex Fridman conversation on agent reliability (45 min, dropped 2026-03-12)

## Public links
- LinkedIn: https://www.linkedin.com/in/thegdb/
- X: https://x.com/gdb
- GitHub: https://github.com/gdb (OpenAI / personal)
- Podcast: https://lexfridman.com/greg-brockman/

## Recent activity
- **[high]** Lex Fridman podcast episode on agent reliability, Mar 2026 (source: lexfridman.com/greg-brockman)
- **[medium]** GitHub activity: contributed to openai/chatgpt-agent-evals (source: github.com/gdb)
- **[medium]** X thread on "the bottleneck for agents is the browser, not the model" — Apr 2026 (source: x.com/gdb)
```

**Required fields**: `name`, `slug`, `company`, `links` (object), `hook`, `dm_opener`, `role_reason`, `event_name`, `event_context`, `icp_fit_score`.

**Body sections**: `## Why reach out` (3 bullets that mirror the card), `## Public links`, `## Recent activity` (findings list with confidence levels).

---

## Field Rules

### Company files

- `key_features`: pipe-separated (`|`) list, NOT a JSON array
- `icp_fit_score`: integer 1-10
- `icp_fit_reasoning`: one line, references specific findings
- `triage_only`: boolean (`true` for stubs, `false` after deep research)
- `event_context`: how this company shows up at the event (sponsor tier, speaker count, track topics)
- Filename: `{OUTPUT_DIR}/companies/{slug}.md` where slug is lowercase, hyphenated

### Person files

- `links`: YAML object with keys `linkedin`, `x`, `github`, `blog`, `podcast`. Use `null` when not found, not empty string.
- `hook`: one sentence, sourced from a specific finding (event-context, recent activity, or company-context). Never inferred from memory.
- `dm_opener`: 2-3 sentences, multi-line YAML string with `|` pipe. References the hook, names a wedge tie-in, ends with a soft CTA.
- `icp_fit_score` is INHERITED from the corresponding `companies/{company_slug}.md` — keeps cards rankable in the index.
- Filename: `{OUTPUT_DIR}/people/{slug}.md` where slug is the lowercased + hyphenated person name (e.g. `greg-brockman.md`).

### Both

- One file per entity. If a subagent encounters a duplicate, OVERWRITE with richer data (e.g. Step 7 overwrites Step 5's triage stub for the same company).

---

## Writing via Bash Heredoc

Subagents write these files using bash heredoc to avoid security prompts. Use the full literal `{OUTPUT_DIR}` path — no `~` or `$HOME`:

```bash
cat << 'PERSON_MD' > /Users/jay/Desktop/stripesessions_prospects_2026-04-25-2030/people/greg-brockman.md
---
name: Greg Brockman
slug: greg-brockman
...
---

## Why reach out
...
PERSON_MD
```

Use `'PERSON_MD'` (quoted) as the delimiter to prevent shell variable expansion. Use `'COMPANY_MD'` for company files.

**IMPORTANT**: Write ALL files in a SINGLE Bash call using chained heredocs to minimize permission prompts. One subagent batch (~5 people) = one Bash invocation = one permission prompt.

```bash
cat << 'PERSON_MD' > {OUTPUT_DIR}/people/greg-brockman.md
---
...
---
PERSON_MD
cat << 'PERSON_MD' > {OUTPUT_DIR}/people/sam-altman.md
---
...
---
PERSON_MD
```

Chained heredocs in one bash call. The subagent reports back ONLY a count, never raw content.
