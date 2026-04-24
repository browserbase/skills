# Example Competitor Research File

Each enrichment subagent writes one markdown file per competitor to `{OUTPUT_DIR}/{competitor-slug}.md`, where `{OUTPUT_DIR}` is the per-run Desktop directory set up by the main agent in Step 0 (e.g., `~/Desktop/acme_competitors_2026-04-23/`). The YAML frontmatter contains structured fields for report/matrix compilation. The body contains per-section research plus aggregated mentions and benchmarks.

## Template

```markdown
---
competitor_name: Rival Co
website: https://rivalco.com
tagline: The fastest way to ship browser agents
positioning: Developer-first headless browser API
product_description: Cloud-hosted headless browser infrastructure for AI agents and scrapers
target_customer: AI engineers, scraping teams, SaaS companies
pricing_model: Usage-based + seat tiers
pricing_tiers: Free (100 min) | Pro $99/mo | Scale $499/mo | Enterprise Contact
key_features: stealth proxy | session replay | CAPTCHA solving | CDP protocol | Playwright driver
integrations: Playwright | Puppeteer | Stagehand | LangChain
headquarters: San Francisco, CA
founded: 2023
employee_estimate: 11-50
funding_info: Seed, $5M (2024)
strategic_diff: Similar infra; weaker in stealth, but cheaper entry tier
---

## Product
Cloud-hosted headless browser infrastructure. Exposes CDP-compatible sessions with
built-in stealth, proxies, and CAPTCHA solving. Positioned at AI agents and scraping teams.

## Pricing
- Free: 100 browser minutes/month, 1 concurrent session
- Pro ($99/mo): 10K minutes, 5 concurrent, basic proxies
- Scale ($499/mo): 100K minutes, 50 concurrent, residential proxies, session replay
- Enterprise: custom pricing, SSO, dedicated support

## Features
- Stealth mode with fingerprint rotation
- Residential proxy pool (180+ countries)
- Auto-CAPTCHA solving
- Session replay / video recording
- CDP-compatible WebSocket API
- Playwright, Puppeteer, Selenium drivers

## Positioning
Marketing emphasizes "AI-native" and developer-first DX. Landing page hero:
"Give your agents a browser." Targets solo devs through mid-market AI teams.

## Comparison vs {user_company}
- **Overlaps**: Headless browser cloud, CDP API, Playwright driver, proxy support
- **Gaps**: No session inspector UI, no Stagehand-equivalent high-level library, weaker stealth benchmarks
- **Where they win**: Lower entry price ($99 vs $199), simpler pricing tiers
- **Where you win**: Stronger stealth (per public benchmarks), better observability, larger integration ecosystem

## Mentions
- **[Benchmark]** computesdk/benchmarks PR #92 — Rival Co 73% pass rate on stealth tests (source: https://github.com/computesdk/benchmarks/pull/92, 2026-03-14)
- **[Comparison]** Browserbase vs Rival Co — side-by-side review (source: https://example.com/browserbase-vs-rivalco, 2026-02-01)
- **[Reddit]** r/webscraping thread: "Moved from Rival Co to X after CAPTCHA issues" — 24 upvotes (source: https://reddit.com/r/webscraping/comments/abc123)
- **[HN]** "Show HN: Rival Co raises seed to build..." — 112 points, 48 comments (source: https://news.ycombinator.com/item?id=12345)
- **[LinkedIn]** CEO post on product launch — 412 reactions (source: https://linkedin.com/posts/rivalco-launch)
- **[YouTube]** "Rival Co vs Browserbase" review by Dev YouTuber — 8.2K views (source: https://youtube.com/watch?v=xyz)
- **[News]** TechCrunch coverage of seed round (source: https://techcrunch.com/2024/11/rival-co-seed)
- **[Review]** G2 4.3/5 (31 reviews), main complaint: flaky sessions (source: https://g2.com/products/rival-co)

## Benchmarks
- **computesdk/benchmarks PR #92** — Rival Co 73% pass rate on stealth, 4th of 7 tested (https://github.com/computesdk/benchmarks/pull/92)
- **headless-bench blog** — Rival Co 1.8s cold start, 2nd fastest (https://example.com/headless-bench-2026)

## Research Findings
- **[high]** Usage-based pricing starts at $99/mo for 10K minutes (source: rivalco.com/pricing)
- **[high]** Series seed, $5M raised Nov 2024 (source: TechCrunch)
- **[medium]** CEO LinkedIn emphasizes AI-agent use cases (source: linkedin.com/in/rivalco-ceo)
- **[low]** Possibly a team under 20 based on careers page (source: rivalco.com/careers)
```

## Field Rules

- **YAML frontmatter**: All structured fields go here. Extracted for matrix + CSV compilation.
- **`pricing_tiers`**: Pipe-separated (`|`) with tier name + short price. `compile_report.mjs` parses on `|` for the matrix view.
- **`key_features`**, **`integrations`**: Pipe-separated lists.
- **`strategic_diff`**: One-line summary (shown in overview table).
- **Body sections**: `## Product`, `## Pricing`, `## Features`, `## Positioning`, `## Comparison vs {user_company}`, `## Mentions`, `## Benchmarks`, `## Research Findings`.
- **Mentions format**: `- **[SourceType]** title | snippet (source: url, date)` — `SourceType` is one of `Benchmark`, `Comparison`, `News`, `Reddit`, `HN`, `LinkedIn`, `YouTube`, `Review`, `Podcast`, `X`.
- **Findings format**: `- **[confidence]** fact (source: url)` — `confidence` is `high`, `medium`, or `low`.
- **Filename**: `{OUTPUT_DIR}/{competitor-slug}.md` where slug is lowercase, hyphenated.

## Writing via Bash Heredoc

Subagents write these files using bash heredoc to avoid security prompts. Use the full literal `{OUTPUT_DIR}` path — no `~` or `$HOME`:

```bash
cat << 'COMPETITOR_MD' > {OUTPUT_DIR}/rival-co.md
---
competitor_name: Rival Co
website: https://rivalco.com
...
---

## Product
...

## Pricing
...

## Mentions
- **[Benchmark]** ...
COMPETITOR_MD
```

Use `'COMPETITOR_MD'` (quoted) as the delimiter to prevent shell variable expansion.

**IMPORTANT**: Write ALL competitor files in a SINGLE Bash call using chained heredocs to minimize permission prompts.
