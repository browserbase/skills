# Example Research Files

## Contents
- [Company File — Triage Stub (Step 6 output)](#company-file--triage-stub-step-6-output)
- [Company File — Deep Research (Step 8 output)](#company-file--deep-research-step-8-output)
- [Person File (Step 9 output)](#person-file-step-9-output) — the combined enrichment + email-drafting output
- [Field Rules](#field-rules)
- [Writing via Bash Heredoc](#writing-via-bash-heredoc) — how subagents emit files

Event-follow-up writes TWO kinds of markdown files:

1. **Company files** — one per company in `seed_companies.txt`, written to `{OUTPUT_DIR}/companies/{slug}.md`. Comes in two flavors: triage stubs (Step 6) and deep-research files (Step 8).
2. **Person files** — one per attendee at an ICP-fit company, written to `{OUTPUT_DIR}/people/{slug}.md`. Created in Step 9 (combined enrichment + email-drafting pass).

The YAML frontmatter contains structured fields for report compilation. The body contains human-readable research.

`{OUTPUT_DIR}` is the per-run Desktop directory set up by the main agent in Step 0 (e.g., `/Users/jay/Desktop/{event_slug}_followup_2026-04-26-1930/`).

---

## Company File — Triage Stub (Step 6 output)

Every company in `seed_companies.txt` gets one of these. Captures a 1-call, ICP-only assessment.

```markdown
---
company_name: OpenAI
website: https://openai.com
product_description: AI lab building safe AGI; ChatGPT, GPT API, ChatGPT Agent
icp_fit_score: 9
icp_fit_reasoning: AI agents at scale need cloud browser infrastructure; ChatGPT Agent shipped Mar 2026
triage_only: true
---

## Triage Notes
Homepage: "ChatGPT, GPT API, and ChatGPT Agent — AI tools and APIs for everyone."
Score 9 because ChatGPT Agent ships browser-using AI agents at consumer scale — the canonical fit for browser infrastructure.
```

**Required fields**: `company_name`, `website`, `icp_fit_score`, `icp_fit_reasoning`, `triage_only: true`.

---

## Company File — Deep Research (Step 8 output)

When a company's `icp_fit_score >= --icp-threshold`, Step 8's deep research overwrites the triage stub with this richer version. `triage_only` flips to `false`.

```markdown
---
company_name: OpenAI
website: https://openai.com
product_description: Foundational AI lab; products span ChatGPT, GPT API, and ChatGPT Agent (browser-using autonomous agent)
industry: AI / Foundation Models
target_audience: Consumers, developers, enterprise
key_features: ChatGPT Agent | GPT-5 API | Sora video | enterprise data residency
icp_fit_score: 9
icp_fit_reasoning: ChatGPT Agent (Mar 2026) is a browser-using agent at consumer scale — directly addresses the "agents need a browser" wedge.
employee_estimate: 3000+
funding_info: $11.3B raised; reported $300B valuation 2026
headquarters: San Francisco, CA
triage_only: false
---

## Product
Foundational AI lab. Three product surfaces: ChatGPT (consumer/team chat), GPT API (developer platform), ChatGPT Agent (autonomous browsing agent).

## Research Findings
- **[high]** ChatGPT Agent launched Mar 2026 — autonomous web-browsing agent (source: openai.com/index/chatgpt-agent)
- **[medium]** Hiring across "Agent Reliability" team — 12 open roles for browser-automation engineers (source: openai.com/careers, search 2026-04)
```

**Body sections**: `## Product`, `## Research Findings`. The deep-research file may also include `## Event Relevance` if the team had context from the event.

---

## Person File (Step 9 output)

Created for each enriched attendee. Combines person research + sales-readiness scoring + drafted follow-up email in one file.

```markdown
---
name: Greg Brockman
slug: greg-brockman
email: greg@openai.com
company: OpenAI
company_slug: openai
title: Cofounder and President
links:
  linkedin: https://www.linkedin.com/in/thegdb/
  x: https://x.com/gdb
  github: https://github.com/gdb
  blog: null
  podcast: https://lexfridman.com/greg-brockman/
sales_readiness: HOT
sales_readiness_reason: Cofounder/President at OpenAI (canonical ICP) AND publicly discussed agent reliability (the user's wedge) on Lex Fridman in March 2026 — strong buying signal in the last 90 days.
hook: Lex Fridman conversation on agent reliability (45 min, dropped 2026-03-12)
email_subject: ChatGPT Agent + browser infra at Sessions
email_body: |
  Greg — caught your Sessions panel on agent reliability and the "agents are
  bottlenecked on the browser" framing was exactly the conversation we keep
  having with teams shipping CUA-style products. Browserbase runs the
  cloud-browser layer that several ChatGPT-Agent-competitor products are
  built on — managed Chrome, stealth, captcha-solving, session recording.
  Worth a 20-min walkthrough this week before you scope your next quarter?
  Happy to send the durability deck ahead of time.
email_cta: book demo
role_reason: Cofounder; sets infrastructure direction across all OpenAI product surfaces, including the agent runtime story.
icp_fit_score: 9
icp_fit_reasoning: ChatGPT Agent is the canonical browser-infra customer — see companies/openai.md
enriched_at: 2026-04-26T19:30:00Z
---

## Why reach out
- **Why the person**: Cofounder; sets infra direction; specifically called out agent reliability on Lex (Mar 2026)
- **Hook**: Lex Fridman conversation on agent reliability (45 min, dropped 2026-03-12)

## Public links
- LinkedIn: https://www.linkedin.com/in/thegdb/
- X: https://x.com/gdb
- GitHub: https://github.com/gdb
- Podcast: https://lexfridman.com/greg-brockman/

## Recent activity
- **[high]** Lex Fridman podcast episode on agent reliability, Mar 2026 (source: lexfridman.com/greg-brockman)
- **[medium]** X thread on "the bottleneck for agents is the browser, not the model" — Apr 2026 (source: x.com/gdb)
```

**Required frontmatter fields**: `name`, `slug`, `email`, `company`, `links` (object), `sales_readiness`, `sales_readiness_reason`, `email_subject`, `email_body`, `email_cta`.

**Body sections**: `## Why reach out`, `## Public links`, `## Recent activity` (findings list with confidence levels).

For COLD attendees, set `email_subject: ""` and `email_body: ""` — the report still emits the file so the user knows they were considered, but no email is drafted.

---

## Field Rules

### Company files

- `key_features`: pipe-separated (`|`) list, NOT a JSON array
- `icp_fit_score`: integer 1-10
- `icp_fit_reasoning`: one line, references specific findings
- `triage_only`: boolean (`true` for stubs, `false` after deep research)
- Filename: `{OUTPUT_DIR}/companies/{slug}.md` where slug is lowercase, hyphenated

### Person files

- `links`: YAML object with keys `linkedin`, `x`, `github`, `blog`, `podcast`. Use `null` when not found, not empty string.
- `sales_readiness`: one of `HOT | WARM | NURTURE | COLD` — see `references/email-patterns.md` for the rubric
- `email_body`: 4-6 sentences, multi-line YAML pipe scalar (`email_body: |` then indented). Every email MUST quote or paraphrase a specific finding (recent activity, team note, event context). NEVER fabricate.
- `email_subject`: 5-9 words, specific not generic. NOT "Following up on Sessions".
- `icp_fit_score` is INHERITED from the corresponding `companies/{company_slug}.md`
- Filename: `{OUTPUT_DIR}/people/{slug}.md` where slug is the lowercased + hyphenated person name

### Both

- One file per entity. If a subagent encounters a duplicate, OVERWRITE with richer data.

---

## Writing via Bash Heredoc

Subagents write these files using bash heredoc to avoid security prompts. Use the full literal `{OUTPUT_DIR}` path — no `~` or `$HOME`:

```bash
cat << 'PERSON_MD' > /Users/jay/Desktop/{event_slug}_followup_2026-04-26-1930/people/greg-brockman.md
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

**IMPORTANT**: Write ALL files in a SINGLE Bash call using chained heredocs to minimize permission prompts. One subagent batch (~5 attendees) = one Bash invocation = one permission prompt.

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
