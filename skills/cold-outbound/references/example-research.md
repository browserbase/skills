# Example Company Research File

Each enrichment subagent writes one markdown file per company to `/tmp/cold_research/{company-slug}.md`. The YAML frontmatter contains structured fields for CSV compilation. The body contains human-readable research, contacts, and email drafts.

## Template

```markdown
---
company_name: Acme Inc
website: https://acme.com
product_description: AI-powered inventory management for e-commerce brands
industry: E-commerce / SaaS
target_audience: Mid-market e-commerce brands
key_features: demand forecasting | automated reordering | multi-warehouse sync
icp_fit_score: 8
icp_fit_reasoning: Series A e-commerce SaaS, uses Selenium for scraping, expanding to EU — strong fit for browser infrastructure
employee_estimate: 50-100
funding_info: Series A, $12M
headquarters: San Francisco, CA
---

## Product
AI-powered inventory management for e-commerce brands. Helps DTC brands
automate reordering and sync across multiple warehouses.

## Research Findings
- **[high]** Checkout optimization for Shopify stores, serving mid-market DTC brands with $5M-$50M revenue (source: acme.com/about)
- **[high]** Series A, $12M raised in Q3 2025 from Sequoia (source: TechCrunch)
- **[medium]** Recently hired 3 data engineers, expanding platform team (source: LinkedIn job posts)
- **[medium]** Uses Selenium for web scraping in their data pipeline (source: careers page)

## Contact
- Name: Jane Smith
- Title: VP Engineering
- Email: jane@acme.com
- LinkedIn: https://linkedin.com/in/janesmith

## Email Draft
Subject: Acme's Shopify data pipeline — scaling scraping?

Hi Jane,

Saw Acme just closed a Series A — congrats. The push into multi-warehouse
sync for DTC brands is a big surface area, especially with the EU expansion.

Teams scaling web scraping for inventory and pricing data often hit a wall
with Selenium — blocked requests, CAPTCHA walls, and proxy management eat
engineering cycles. We handle the browser infrastructure so your team can
focus on the analytics layer.

Would a 15-min call make sense to see if this fits where Acme is headed?

Best,
Alex
```

## Field Rules

- **YAML frontmatter**: All structured fields go here. These are extracted for CSV compilation.
- **`key_features`**: Pipe-separated (`|`) list in YAML, not a JSON array.
- **`icp_fit_score`**: Integer 1-10.
- **`icp_fit_reasoning`**: One line, references specific findings.
- **Body sections**: `## Product`, `## Research Findings`, `## Contact`, `## Email Draft`.
- **Findings format**: `- **[confidence]** fact (source: url or description)`
- **Contact section**: Added during Step 7 (contact discovery). Omit if not yet discovered.
- **Email Draft section**: Added during Step 8 (email generation). Omit during Step 6.
- **Filename**: `/tmp/cold_research/{company-slug}.md` where slug is lowercase, hyphenated (e.g., `acme-inc.md`).
- **Deduplication**: One file per company. If a subagent encounters a company that already has a file, it should overwrite with richer data.

## Writing via Bash Heredoc

Subagents write these files using bash heredoc to avoid security prompts:

```bash
mkdir -p /tmp/cold_research
cat << 'COMPANY_MD' > /tmp/cold_research/acme-inc.md
---
company_name: Acme Inc
website: https://acme.com
...
---

## Product
...

## Research Findings
...
COMPANY_MD
```

Use `'COMPANY_MD'` (quoted) as the delimiter to prevent shell variable expansion inside the content.
