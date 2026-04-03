# Cold Outbound — Deep Research Patterns

## Overview

This reference defines two research contexts:
1. **Self-Research** (Step 1) — Deep research on the user's own company to build a strong ICP foundation
2. **Target Research** (Step 6) — Research each discovered company using Plan→Research→Synthesize

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
1. Fetch `bb_smart_fetch.ts --url "{company website}/sitemap.xml" --raw` — primary source, has ALL pages
2. Scan sitemap URLs for keywords: `customer`, `case-stud`, `pricing`, `about`, `use-case`, `blog`, `docs`, `industry`, `solution`
3. Optionally fetch `bb_smart_fetch.ts --url "{company website}/llms.txt" --raw` for page descriptions
4. Pick the 3-5 most relevant URLs from the sitemap and fetch those (without `--raw`)
5. Sitemap is the source of truth. llms.txt is bonus context but often incomplete.
6. The `--raw` flag outputs plain text instead of structured JSON — essential for reading sitemap.xml and llms.txt

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

## Target Company Research (Step 6)

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
