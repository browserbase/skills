<!-- Plan→Research→Synthesize pattern adapted from company-research v1.1.0 (2026-04-25). -->
<!-- Source: /Users/jay/skills/skills/company-research/references/research-patterns.md -->
<!-- Keep in sync if the canonical pattern there changes meaningfully. -->

# Event-Prospecting — Research Patterns

## Contents
- [Plan→Research→Synthesize](#planresearchsynthesize) — canonical pattern (verbatim from company-research)
- [Self-Research (User's Company)](#self-research-users-company) — done by company-research, consumed here as a profile
- [Target Company Research](#target-company-research) — sub-question templates
- [Finding Format](#finding-format) — schema for accumulated facts
- [Research Loop Rules](#research-loop-rules) — how to stop hallucinating
- [Depth Mode Behavior](#depth-mode-behavior) — quick / deep / deeper
- [Synthesis Instructions](#synthesis-instructions) — turn findings into frontmatter
- [ICP Triage (Step 5 — fast pass)](#icp-triage-step-5--fast-pass) — event-specific
- [Deep Research (Step 7 — full pass)](#deep-research-step-7--full-pass) — event-specific
- [Person Enrichment (Step 8 — speakers at ICP fits only)](#person-enrichment-step-8--speakers-at-icp-fits-only) — event-specific

---

## Plan→Research→Synthesize

This reference defines two research contexts:
1. **Self-Research** — Deep research on the user's own company to build a strong ICP foundation. (For event-prospecting, this is done once by `company-research` and persisted in `profiles/{slug}.json`. Event-prospecting reads the profile at Step 1.)
2. **Target Research** — Research each ICP-fit company using Plan→Research→Synthesize.

Both use the same 3-phase pattern but with different sub-questions and goals.

## Self-Research (User's Company)

This is the most important research in the pipeline. Every downstream decision depends on it.

### Sub-Questions
- "What does {company} sell and what specific problem does it solve?"
- "Who are {company}'s existing customers? What industries, company sizes, and use cases?"
- "Who are {company}'s competitors and what differentiates them?"
- "What pricing model does {company} use and who is the typical buyer persona?"
- "What use cases and pain points does {company}'s marketing emphasize?"

### Page Discovery
Discover site pages dynamically — do NOT hardcode paths like `/about` or `/customers`:
1. Fetch `bb fetch --allow-redirects "{company website}/sitemap.xml"` — primary source, has ALL pages
2. Scan sitemap URLs for keywords: `customer`, `case-stud`, `pricing`, `about`, `use-case`, `blog`, `docs`, `industry`, `solution`
3. Optionally fetch `bb fetch --allow-redirects "{company website}/llms.txt"` for page descriptions
4. Pick the 3-5 most relevant URLs from the sitemap and fetch those
5. Sitemap is the source of truth. llms.txt is bonus context but often incomplete.

### External Research
- Search: `"{company} customers use cases reviews"`
- Search: `"{company} alternatives competitors vs"`
- Fetch 1-2 of the most informative third-party results (G2, blog posts, comparisons)

### Synthesis Output
From all findings, produce a company profile:
- **Company**: name
- **Product**: what they sell, how it works, key capabilities (2-3 sentences, specific)
- **Existing Customers**: named customers or customer types found
- **Competitors**: who they compete with, key differentiators
- **Use Cases**: broad list of use cases the product serves (NOT tied to one vertical)

Do NOT include ICP, pitch angle, or sub-verticals in the profile. Those are per-run targeting decisions made in Step 2 after the profile is confirmed. The profile is a general-purpose company fact sheet that works regardless of which vertical you target next.

### Why This Matters
A thin profile produces generic search queries, weak lead scoring, and cookie-cutter emails. A rich profile with specific customers, competitors, and use cases produces targeted queries, accurate scoring, and emails that reference real pain points.

---

## Target Company Research

### Sub-Question Templates

Generate sub-questions from these categories based on the ICP and enrichment fields requested. Not every category applies to every company — pick the most relevant.

### Priority 1 (Always ask)
- **Product/Market**: "What does {company} sell and who are their customers?"
- **ICP Fit**: "How does {company}'s product/market relate to {sender's ICP description}?"

### Priority 2 (Ask in deep/deeper)
- **Tech Stack**: "What technologies, frameworks, or infrastructure does {company} use?"
- **Growth Signals**: "Has {company} raised funding, launched products, or expanded recently?"
- **Pain Points**: "What challenges might {company} face that {sender's product} addresses?"

### Priority 3 (Ask in deeper only)
- **Decision Makers**: "Who leads engineering, product, or growth at {company}?"
- **Competitive Landscape**: "Who are {company}'s competitors and how are they differentiated?"
- **Customers/Case Studies**: "Who are {company}'s notable customers and what results do they highlight?"

### Search Query Patterns

For each sub-question, generate 2-3 search query variations:

```
# Product/Market
"{company name} what they do"
"{company name} product features customers"

# Tech Stack
"{company name} tech stack engineering blog"
"{company name} careers software engineer" (job posts reveal stack)

# Growth Signals
"{company name} funding round 2025 2026"
"{company name} launch announcement"
"{company name} hiring"

# Pain Points
"{company name} challenges {relevant domain}"
"{company name} {problem sender solves}"

# Decision Makers
"{company name} VP engineering CTO LinkedIn"
"{company name} head of growth product"
```

## Finding Format

Each finding is a self-contained factual statement tied to a source:

```json
{
  "subQuestion": "What does Acme sell and who are their customers?",
  "fact": "Acme provides checkout optimization for Shopify stores, serving mid-market DTC brands with $5M-$50M revenue",
  "sourceUrl": "https://acme.com/about",
  "sourceTitle": "About Acme - Checkout Optimization",
  "confidence": "high"
}
```

**Confidence levels**:
- `high`: Directly stated on the company's own website or official press
- `medium`: Inferred from job postings, third-party articles, or indirect signals
- `low`: Speculative based on industry/category, or from outdated sources

## Research Loop Rules

1. **Process sub-questions by priority** — Priority 1 first, then 2, then 3
2. **3-5 findings per sub-question, then move on** — Don't exhaust a topic
3. **Use parallel tool calls** — Search multiple queries simultaneously when possible
4. **Rephrase, don't retry** — If a search returns poor results, try different keywords
5. **Fetch selectively** — Don't fetch every URL from search results. Pick the 1-2 most relevant based on title and URL
6. **Stop at step limit** — Respect the depth mode's step budget per company
7. **Homepage first** — Always fetch the company's homepage before branching to other pages
8. **Deduplicate findings** — Don't record the same fact twice from different sources

### Logo / customer-relationship direction (CRITICAL)

A logo on a company's homepage carries no implicit direction. Do NOT infer a buyer/seller relationship from logo placement alone — the direction is the opposite of what you'd guess in many cases.

- If `{TARGET}`'s homepage shows **`{USER_COMPANY}`'s logo** in a "trusted by" / "customers" / "loved by" / "powering" section, then **the user is the target's customer**, not the other way around. (Example: Browserbase's logo on Clerk's homepage means Browserbase uses Clerk for auth — Clerk is NOT a Browserbase customer.)
- If `{USER_COMPANY}`'s homepage shows the target's logo in a "customers" section, then the target is the user's customer.
- If neither homepage carries the other's logo, do NOT claim any customer relationship.
- Search results that say "X uses Y" or "X integrates Y" are stronger evidence than logos. Quote the source phrase.
- When unsure of direction, write the relationship neutrally: "Browserbase and Clerk both serve dev-tools/agent ICP — possible co-marketing fit" — NOT "Clerk is a Browserbase customer".

The user's profile (`profiles/{slug}.json`) lists `existing_customers`. **Only treat a target as an existing customer if its name appears in that array.** Logos and assumptions don't qualify.

## Depth Mode Behavior

### Quick Mode (100+ leads)
- **Skip Phase A** — No sub-question decomposition
- **Phase B**: Fetch the company homepage. Run 1-2 supplementary searches if homepage data is thin.
- **Phase C**: Extract available data, score ICP, write email from what's available
- **Budget**: 2-3 total tool calls per company
- **Trade-off**: Fast and cheap, but emails may be less personalized

### Deep Mode (25-50 leads)
- **Phase A**: Decompose into 2-3 sub-questions (Priority 1 + selected Priority 2)
- **Phase B**: For each sub-question, run 2-3 searches + fetch 1-2 URLs. Target 3-5 findings per sub-question.
- **Phase C**: Synthesize from all findings. ICP reasoning references specific evidence. Email uses the most specific/compelling finding.
- **Budget**: 5-8 total tool calls per company
- **Trade-off**: Good balance of depth and scale

### Deeper Mode (10-25 leads)
- **Phase A**: Decompose into 4-5 sub-questions (Priority 1 + 2 + selected Priority 3)
- **Phase B**: Research exhaustively. Fetch multiple pages per company (homepage, about, blog, careers, product pages). Target 3-5 findings per sub-question.
- **Phase C**: Synthesize with cited evidence. ICP reasoning is detailed. Email references multiple specific signals.
- **Budget**: 10-15 total tool calls per company
- **Trade-off**: High quality intelligence, but slow and expensive

## Synthesis Instructions

After the research loop completes for a company, synthesize findings into the output record:

### ICP Scoring
Score 1-10 using ALL accumulated findings as evidence:
- **8-10**: Strong match. Multiple high-confidence findings confirm right industry, company stage, and clear pain point alignment. The pitch angle directly addresses a visible need supported by evidence.
- **5-7**: Partial match. Some findings suggest relevance but key signals are missing or low-confidence. Adjacent industry or unclear pain point.
- **1-4**: Weak match. Findings indicate wrong segment, too large/small, or no apparent connection to sender's product.

Write `icp_fit_reasoning` referencing specific findings: "Series A fintech (from Crunchbase), uses Selenium for scraping (from job posting), expanding to EU market (from blog) — strong fit for browser infrastructure."

### Email Personalization
Use the **richest, most specific** findings for email context:
- Opening: Use the most concrete finding (a specific product feature, a recent launch, a job posting)
- Bridge: Connect a finding about their challenges/stack to the sender's pitch angle
- If only low-confidence findings exist, keep the email shorter and more general — don't fabricate specificity

### Enrichment Fields
Map findings to enrichment fields:
- `product_description` → from Product/Market findings
- `industry` → inferred from Product/Market
- `employee_estimate` → from LinkedIn search or careers page findings
- `funding_info` → from Growth Signals findings
- `headquarters` → from company homepage or about page
- `target_audience` → from Product/Market findings
- `key_features` → from product page findings

If a field has no supporting findings, leave it empty rather than guessing.

### Anti-Hallucination Rules

Apply these at synthesis time. They exist because the failure mode — especially on Framer/Next.js landing pages with little server-rendered copy — is for the subagent to pattern-match visual cues onto the sender's ICP and fabricate a plausible-sounding description:

1. **Typography is not a product.** Never infer `product_description`, `industry`, or `target_audience` from fonts, design system, framework choice (Framer, Next.js, React), or site polish. "Framer-built" and "uses Geist Mono" are observations about tooling, not signals of what the company sells.
2. **No ICP leakage.** If the homepage is thin and external search turns up nothing, do NOT default the target's description toward the sender's ICP. Manufacturing AI ≠ browser automation just because both use AI.
3. **Quote, don't paraphrase from memory.** `product_description` must quote or closely paraphrase a specific phrase from `extract_page.mjs` output (TITLE / META_DESCRIPTION / OG_DESCRIPTION / HEADINGS / BODY) or from an external search result. If no such phrase exists, write `Unknown — homepage content not accessible`.
4. **Cap scores on thin evidence.** If `product_description` is `Unknown`, set `icp_fit_score` ≤ 3 and `icp_fit_reasoning: Insufficient evidence — homepage returned no readable content`. Do not justify a higher score on inferred signals alone.

---

## ICP Triage (Step 5 — fast pass)

For each company in `seed_companies.txt`, run ONE tool call to fetch the homepage + extract a 1-line product description, then score against the ICP. Output goes to `companies/{slug}.md` with frontmatter:

```yaml
company_name: OpenAI
website: https://openai.com
product_description: "AI lab building safe AGI for everyone"
icp_fit_score: 9
icp_fit_reasoning: "AI agents need cloud browser infrastructure at scale; ChatGPT Agent shipped Mar 2026"
triage_only: true   # NOT yet deep-researched
event_context: "Stripe Sessions 2026 — featured speaker on AI track"
```

Companies with `icp_fit_score < {threshold}` (default 6) stay as triage stubs and never get deep-researched. Companies above the threshold advance to Step 7.

**Hard cap: 1 tool call per company.** The only allowed call is `node {SKILL_DIR}/scripts/extract_page.mjs "{company_homepage}"`. Anti-hallucination rule applies in full: if the homepage is JS-rendered and `extract_page.mjs` returns empty BODY, write `product_description: Unknown — homepage content not accessible` and cap the score at 3. Do NOT do a second search to "save" the company — the budget is one call.

The triage subagent batches its 10 `extract_page.mjs` calls and 10 heredoc writes into a SINGLE Bash invocation using `&&` chaining and pipe-separated heredocs. One Bash call = one permission prompt.

## Deep Research (Step 7 — full pass)

Identical to company-research's target research. The ICP-fit companies (typically 20-40% of the seed list) get the full Plan→Research→Synthesize treatment with sub-questions tailored to the event context.

**Hard cap: 5 tool calls per company.** Budget breakdown for deep mode:
- 1 call: `extract_page.mjs` on the homepage (re-extract; the triage version was scraped down to a 1-liner)
- 2-3 calls: `bb search` for sub-questions from Priority 1 + 2 (product, tech stack, growth signals)
- 1-2 calls: `extract_page.mjs` on the most relevant search results (case study, blog post, careers page)

Event-context tweaks the sub-questions. Instead of generic "What does {company} do?", the subagent asks "What is {company} doing with browser automation that's relevant to **Stripe Sessions' agent track**?" — the event name and any track/topic info from `recon.json` is woven into Priority 2 sub-questions.

The deep-research subagent OVERWRITES the triage stub with the richer file (frontmatter `triage_only: false`). The compile step looks at `triage_only` to decide rendering.

## Person Enrichment (Step 8 — speakers at ICP fits only)

Per person at an ICP-fit company:
- `bb search "{name} {company} linkedin"` — verify role + harvest LinkedIn URL (always)
- `bb search "{name} podcast OR talk OR blog 2026"` — last 6 months for hooks (deep+)
- `bb search "{name} github"` — open-source signal (deeper)
- `bb search "{name} site:x.com OR site:twitter.com"` — recent posts (deeper)

**Hard cap: 4 tool calls per person.** Deep mode runs lanes 1-2 (max 2 calls). Deeper mode runs lanes 1-4 (max 4 calls). Quick mode skips Step 8 entirely.

Each person yields a `people/{slug}.md` with frontmatter:

```yaml
name: Greg Brockman
slug: greg-brockman
company: OpenAI
title: President & Co-founder
links:
  linkedin: https://www.linkedin.com/in/thegdb/
  x: https://x.com/gdb
  github: https://github.com/gdb
  blog: null
  podcast: https://lexfridman.com/greg-brockman/
hook: "Recent Lex Fridman interview on agent reliability — direct fit for browser-infra durability story"
dm_opener: "Hey Greg — saw your Lex Fridman convo on agent reliability..."
role_reason: "Co-founder, sets infra direction"
event_name: "Stripe Sessions 2026"
event_context: "Panelist on Agents track"
icp_fit_score: 9   # inherited from companies/openai.md
```

The `dm_opener` is 2-3 sentences, references the `hook`, names a Browserbase-style tie-in (or whatever the user's product wedge is from the profile), and ends with a soft CTA. It's what the AE pastes into LinkedIn. Generated from accumulated findings — never from memory or visual inference.

The `hook` source priority (run sequentially, stop at first hit):
1. **Event-context**: their talk title or panel topic at this event (always available, lowest-effort, often best for cold opener)
2. **Recent activity** (last 6 months): podcast / talk / blog / GitHub / LinkedIn post — surfaced by lanes 2-4
3. **Company-context**: signal from their company's recent news (funding, product launch) — pulled from the `companies/{slug}.md` deep-research file

If lane 1 succeeds, the subagent can skip lanes 2-4 in deep mode. In deeper mode, run all four lanes regardless to give the report richer link pills.
