---
name: upwork-com-optimize-proposal-success-rate-4tnak4
title: Upwork Proposal & Job-Fit Optimizer
description: >-
  Read-only Upwork freelancer assistant: discovers relevant public job postings
  (AI/ML/Python/data-science/NLP), scores each on skills-fit, budget, client
  quality, and competition (proposals/interviewing), shortlists low-competition
  high-relevance jobs, drafts tailored proposals, and recommends profile/keyword
  improvements. Does not log in, bid, or bookmark.
website: upwork.com
category: freelancing
tags:
  - freelancing
  - job-search
  - upwork
  - read-only
  - cloudflare
  - ai-ml
source: 'browserbase: agent-runtime 2026-06-10'
updated: '2026-06-10'
recommended_method: browser
alternative_methods:
  - method: fetch
    rationale: >-
      Plain HTTP fetch (even residential-proxy) returns Cloudflare 403 on every
      HTML page — only the CDN-cached robots.txt/sitemap survive. A stealth
      browser session that solves the Turnstile JS challenge is required.
  - method: api
    rationale: >-
      Upwork's internal/GraphQL APIs (/api*, visitor-gql-token) are
      robots-disallowed and require an authenticated session token. No usable
      public JSON job-search API; the SEO-indexed /freelance-jobs/ HTML pages
      are the only read-only surface.
verified: true
proxies: true
---
# Upwork Proposal & Job-Fit Optimizer

## Purpose

A **read-only** Upwork assistant for the discovery → evaluation → proposal-drafting half of a freelancer workflow. Given a skills profile (here: AI, ML, Python, Data Science, AI for Science, NLP), it crawls Upwork's **public, SEO-indexed job board** (`/freelance-jobs/<category>/`), extracts each posting's fit signals (budget, skills, duration, experience level, **competition** — proposals range / interviewing count / last-viewed, and **client quality** — total spent / hires / tenure / other open jobs), ranks jobs by a composite fit score, surfaces low-competition + high-relevance opportunities, drafts a tailored proposal per job, and recommends profile/keyword improvements from observed demand. It returns structured JSON plus proposal text.

**Scope boundary (honest):** this skill never logs in, never submits a proposal, never bookmarks/saves a job, and never edits the profile. Those actions, plus the authenticated `/nx/search/jobs/` feed with full filtering and the freelancer's *own* bid/contract dashboard, are behind Upwork login and are **not** covered (no credentials). Bid/application tracking and duplicate-avoidance are done **agent-side** using the stable numeric job id in each URL (`~02206...`).

## When to Use

- "Find me the best new ML/Python/NLP jobs on Upwork worth bidding on this week and rank them by fit."
- "Compare these 3–5 Upwork job posts side-by-side (budget, requirements, client history, competition)."
- "Which open AI jobs have low competition but high relevance to my skills?"
- "Draft a tailored proposal for this Upwork job: <url>."
- "What skills/keywords are trending in AI postings right now — how should I tune my profile title/overview?"
- "Flag recurring / long-term / contract-to-hire clients over one-off low-value gigs."

Do **not** use this skill to submit bids, save jobs to the Upwork account, or read the logged-in dashboard — it is discovery + analysis only.

## Workflow

The only reliable surface is the public job board rendered in a **stealth browser session**. There is no usable public JSON API (see Gotchas), so `recommended_method: browser`.

### 1. Create a stealth session (mandatory)

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$SID"
```

Both `--verified` and `--proxies` are **required**. The Upwork homepage and every `/freelance-jobs/` page sit behind **Cloudflare + Cloudflare WAF**; a bare session (or any plain `fetch`/`curl`, even via residential proxy) gets a `403` / "Just a moment…" Turnstile interstitial it can't clear.

### 2. Open a relevant category page and clear the challenge

Map the skills profile to Upwork's public category slugs (verified live):

| Skill | Public URL |
|---|---|
| Machine Learning | `/freelance-jobs/machine-learning/` |
| Python | `/freelance-jobs/python/` |
| Data Science | `/freelance-jobs/data-science/` |
| NLP | `/freelance-jobs/natural-language-processing/` |
| Artificial Intelligence | `/freelance-jobs/artificial-intelligence/` |
| Deep Learning | `/freelance-jobs/deep-learning/` |
| Generative AI | `/freelance-jobs/generative-ai/` |
| Computer Vision | `/freelance-jobs/computer-vision/` |
| PyTorch | `/freelance-jobs/pytorch/` |

```bash
browse open "https://www.upwork.com/freelance-jobs/machine-learning/" --remote --session "$SID"
# Cloudflare shows "Just a moment..." first. The verified session auto-solves
# the Turnstile in ~8-15s. Poll, do NOT snapshot immediately.
sleep 12
browse snapshot --remote --session "$SID"   # title becomes "... Freelance Jobs: Work Remote & Earn Online"
```

### 3. Extract the listing cards

Use `browse get markdown body` and parse each card. Every card on the category page carries: **title**, **apply URL** (`/freelance-jobs/apply/<slug>_~<jobid>/`), **hourly|fixed-price**, **posted/renewed date**, **hours/week** (`Less than 30` / `30+`), **duration** (`1 to 3 months` … `More than 6 months`), **experience level** (`Entry`/`Intermediate`/`Expert`), a **description excerpt**, and **skill tags**. Fixed-price cards also show the **budget** (e.g. `$500`). Each category page exposes ~10–20 of the most recent postings.

### 4. Open a job detail page for the deep fit signals

The detail page (`/freelance-jobs/apply/<slug>_~<jobid>/`) is publicly viewable **without login** and is where the competition + client-quality gold lives:

```bash
browse open "https://www.upwork.com/freelance-jobs/apply/Senior-Computer-Vision-Engineer-Geospatial_~022063892630502327996/" --remote --session "$SID"
sleep 5
browse get markdown body --remote --session "$SID"
```

Extract:
- **Budget**: hourly range (`$30.00 - $45.00 Hourly`) or fixed amount; duration; experience level; project type (`Ongoing`, `Contract-to-hire`).
- **Skills and Expertise** → "Mandatory skills" list.
- **Activity on this job** → `Proposals:` (a coarse bucket, e.g. `Less than 5`, `5 to 10`, `10 to 15`, `20 to 50`), `Last viewed by client`, `Interviewing: N`, `Invites sent`, `Unanswered invites`. **This is the competition / success-probability signal.**
- **About the client** → `Member since`, country, `$X total spent`, `N hires, M active`, total hours, and **"Other open jobs by this Client (N)"** — the recurring / long-term-client signal.

### 5. Score, rank, shortlist

Compute a composite **fit score** per job. Reference heuristic (tune to taste):

- **Skills match (0–0.4)** — overlap of mandatory skills + tags with the profile (AI, ML, Python, data science, AI for Science, NLP).
- **Competition / success probability (0–0.25)** — invert the proposals bucket (`Less than 5` ≫ `20 to 50`); penalize jobs already `Interviewing` several candidates.
- **Client quality (0–0.2)** — payment-verified, high total spend, many prior hires, multiple open jobs (recurring client).
- **Budget & engagement (0–0.15)** — hourly range / fixed budget vs. target rate; weight `30+ hrs/week`, `6+ months`, and `Contract-to-hire` higher (long-term value over one-off gigs).

Sort descending; flag **low-proposal + high-skills-match** rows as "high-conversion." De-duplicate against previously seen `~<jobid>`s (agent-side memory).

### 6. Draft proposals & profile recommendations

For each shortlisted job, draft a proposal that (a) opens with the client's stated outcome, (b) cites one concrete, *relevant* past result, (c) maps explicitly to the job's mandatory skills, (d) is concise. Aggregate the mandatory-skill frequency across all crawled postings to produce **keyword-trend** recommendations for the profile title/overview/skills.

### 7. Release the session

```bash
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

## Site-Specific Gotchas

- **Cloudflare + WAF on everything.** Pre-run probe of `https://upwork.com/` returned `403` with `cloudflare, cloudflare-waf`. A `--verified --proxies` browser session is mandatory; it auto-solves the Turnstile in ~8–15s. **Don't snapshot before the title changes** away from "Just a moment…" — poll/`sleep` first.
- **No usable public API / fetch path.** `browse cloud fetch` (even `--proxies`) returns `403` on every HTML page; only the CDN-edge-cached `robots.txt` came back `200`. `robots.txt` **disallows** `/api*`, `/nx/`, `/*/jobs/search*`, `/jobs/`, and `/freelancers/public/api/`, and the visitor GraphQL token endpoint is disallowed too. **Don't waste time hunting for a JSON jobs API — confirmed blocked.**
- **Use `/freelance-jobs/<category>/` — the robots-allowed canonical surface.** The authenticated-style `/nx/search/jobs/?q=...` feed *does* render ~25 results unauthenticated, BUT it lives under the robots-`Disallow: /nx/` path and its full filtering/sorting/apply actions require login. Prefer the SEO category pages for read-only discovery.
- **Detail pages expose competition + client data WITHOUT login.** `Activity on this job` (proposals range, interviewing count, invites, last-viewed) and `About the client` (spend, hires, tenure, other open jobs) are all on the public apply page. This is the core fit-scoring fuel — you do not need credentials for it.
- **Proposals count is a bucket, not a number.** Upwork shows ranges (`Less than 5`, `5 to 10`, `10 to 15`, `20 to 50`). Treat it as ordinal. The tooltip notes it excludes withdrawn/declined/archived proposals.
- **Category pages show only the recent slice.** Each page surfaces ~10–20 newest postings, no deep pagination on the public surface. For exhaustive/filtered search (rate, client-hires, payment-verified, sort) you need the logged-in `/nx/search/jobs/` feed — out of scope here.
- **Job id is the stable key.** The trailing `~02206...` in the apply URL is the durable identifier; use it for de-duplication and bid tracking. Slugs can be truncated/renamed.
- **Login-gated, NOT covered (no credentials):** submitting/withdrawing proposals, saving/bookmarking jobs, the freelancer's own active-bids/contracts dashboard, and editing the profile. This skill *recommends* profile changes and *drafts* proposals but cannot apply them.
- **READ-ONLY.** Never click "Apply now" / "Submit a proposal" / "Save job" — those start authenticated write flows.
- **LLM-driven extraction has a cost.** A representative autobrowse pass (category page + 3 detail pages, fit-scored) cost ~$2.35 and 17 turns. Visiting every detail page for a large category is expensive — visit detail pages only for the shortlist after a cheap category-level pre-rank.
- **Anti-bot status is honest in metadata:** the converged successful run used `--verified --proxies` (`verified: true`, `proxies: true`).

## Expected Output

### A. Ranked job shortlist (primary)

```json
{
  "success": true,
  "category": "machine-learning",
  "profile_skills": ["AI", "ML", "Python", "Data Science", "AI for Science", "NLP"],
  "jobs": [
    {
      "title": "Senior Computer Vision Engineer (Geospatial AI)",
      "url": "https://www.upwork.com/freelance-jobs/apply/Senior-Computer-Vision-Engineer-Geospatial_~022063892630502327996/",
      "job_id": "~022063892630502327996",
      "type": "hourly",
      "budget": "$30.00 - $45.00 / hr",
      "posted": "2 days ago",
      "duration": "6+ months",
      "project_type": "Contract-to-hire, Ongoing",
      "hours_per_week": "30+ hrs/week",
      "experience_level": "Expert",
      "mandatory_skills": ["Python", "PyTorch", "DINOv2", "LightGlue", "LoFTR", "InfoNCE", "FAISS"],
      "proposals_range": "10 to 15",
      "interviewing": 4,
      "last_viewed_by_client": "yesterday",
      "client": {
        "member_since": "Mar 30, 2021",
        "location": "Poland",
        "total_spent": "$106K",
        "hires": 6,
        "active_hires": 5,
        "other_open_jobs": 5
      },
      "fit_score": 0.82,
      "high_conversion": false,
      "rationale": "Strong skills overlap (Python/PyTorch/CV); high-spend repeat client w/ 5 open jobs (long-term value); but 10-15 proposals + 4 interviewing = elevated competition."
    }
  ],
  "keyword_trends": ["Python", "PyTorch", "RAG", "LLM", "Computer Vision", "OpenAI", "FAISS"],
  "error_reasoning": null
}
```

### B. Per-job proposal draft + profile recommendations

```json
{
  "success": true,
  "job_id": "~022063892630502327996",
  "proposal_draft": "Hi — you need a CV/geospatial-AI engineer to ship a production cross-view localization + image-retrieval pipeline. I've built DINOv2/CLIP-based retrieval with LightGlue/LoFTR matching and FAISS indexing for large tile DBs... [tailored body]",
  "profile_recommendations": {
    "title": "Senior AI/ML Engineer — Computer Vision, RAG & Python",
    "overview_keywords": ["PyTorch", "RAG", "LLM", "FAISS", "computer vision", "geospatial AI"],
    "skills_to_add": ["DINOv2", "LangChain", "Vector Databases"],
    "rationale": "These terms appeared across the highest-fit recent postings; aligning the profile improves search-match SEO and proposal targeting."
  }
}
```

### C. Blocked / failure shape

```json
{
  "success": false,
  "error_reasoning": "Cloudflare Turnstile did not clear within 30s on a verified+proxied session; page title stayed 'Just a moment...'. Retry with a fresh --verified --proxies session.",
  "jobs": []
}
```
