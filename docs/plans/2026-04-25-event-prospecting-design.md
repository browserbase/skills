# event-prospecting — design

**Status**: approved 2026-04-25
**Sibling skills**: company-research, cold-outbound, account-positioning, competitor-analysis, github-stargazers
**Path**: `/Users/jay/skills/skills/event-prospecting/`

## Purpose

Take a conference / event speakers URL, extract the people, filter their companies against the user's ICP, then deep-research only the people at ICP-fit companies. Output a person-first HTML report where each card answers "why should the AE talk to this person?" with all their public links and a one-click DM opener.

Architectural shape: a thin front-end (event recon + extract) and back-end (person enrichment + HTML) wrapped around the company-research backend. Most of the cost lives in company-research; this skill is glue + a different report.

## What problem this solves

GTM teams scrape conference speaker lists into spreadsheets manually or via Clay / Apify actors. The work that follows — figuring out *which* speakers actually matter for THIS sender, what the wedge is, and how to open the conversation — stays manual. This skill collapses that to one command per event.

Five gaps this targets (per find-skills research, 2026-04-25):
1. JS-rendered / Next.js speaker pages — most existing tools degrade
2. Sponsor → buying-committee mapping — tools dump company names but don't fan out
3. ICP scoring tied to *event context* (track / sponsor tier / talk topic) — generic ICP isn't enough
4. Multi-event recurrence — "this person spoke at 4 events I care about"
5. Open agent-native skill that chains scrape → enrich → score → CSV in one install

v0.1 hits #1, #3, #5. #2 and #4 are v0.2 candidates.

## Pipeline (10 steps)

| Step | What | Reuses |
|------|------|--------|
| 0 | Setup output dir `~/Desktop/{event_slug}_prospects_{YYYY-MM-DD-HHMM}/` | — |
| 1 | Load user profile from `profiles/{slug}.json`. Fail loudly if missing — point at company-research to build one. | company-research profile shape |
| 2 | **Recon** the event URL. Detect platform (Next.js `__NEXT_DATA__`, Sessionize public API, Lu.ma JSON-LD, Eventbrite JSON-LD, custom). Persist `recon.json`. | NEW |
| 3 | **Extract people** using platform-specific shortcut. For Next.js: 4 `browse` commands extract structured speaker JSON. Output `people.jsonl`. | NEW |
| 4 | Group by `.company` → unique seed company list (e.g. 240 people → 99 companies). | NEW (~5 LOC) |
| 5 | **ICP triage** — for each unique company, fetch homepage + score against user ICP (one tool call per company). | extract_page.mjs |
| 6 | **Filter** companies by `icp_fit_score >= --icp-threshold` (default 6). | NEW (~10 LOC) |
| 7 | **Deep research** the ICP-fit companies — full Plan→Research→Synthesize pattern, one subagent per company. Writes `companies/{slug}.md` with frontmatter scores. | company-research's `references/research-patterns.md` verbatim |
| 8 | **Enrich speakers** at ICP-fit companies only. Per person: LinkedIn snippet, recent activity (podcast / blog / talk / GitHub / X) for hook generation, harvest all public links. Writes `people/{slug}.md`. | NEW |
| 9 | Compile HTML report — person-first index, plus per-person + per-company drill-downs. Open in browser. Write `results.csv` for cold-outbound. | extends company-research's `compile_report.mjs` |

## Per-person card design

The primary deliverable. The index is a stack of these, ranked by ICP score.

```
┌────────────────────────────────────────────────┐
│  {Name}                              ICP {NN}  │
│  {Title} · {Company}                           │
│                                                │
│  🔗 {LinkedIn} {X} {GitHub} {Blog} {Podcast}   │  ← all public links found
│                                                │
│  ▸ Why the company: {1-line ICP-fit reason}    │  ← option B always visible
│  ▸ Why the person: {role / decision power}     │
│  ▸ Hook: {event-context first, fallback recent}│
│                                                │
│  [📋 Copy DM opener]  [🔬 Research deeper]    │  ← copy-to-clipboard buttons
└────────────────────────────────────────────────┘
```

**Hook source priority** (run sequentially per person, stop at first hit):
1. Event-context: what they're doing AT this event (panel topic, talk title, sponsor tier)
2. Recent activity (last 6 months): podcast / talk / blog / GitHub / LinkedIn post
3. Company-context: signal from company's recent news (funding, product launch)

**Copy DM opener** — copies a 2-3 sentence opener that references the hook + names a Browserbase tie-in. Same data as the bullets, rewritten as prose. Ready to paste into LinkedIn / cold email.

**🔬 Research deeper** — copies a pre-tailored Claude Code prompt to clipboard:

> "Use event-prospecting to deepen the brief on {Name} ({Company}, {LinkedIn URL}). Source event: {Event Name}. Existing notes: {full path to .md}. Pull recent podcast appearances, GitHub activity, and any signals about {topic-from-hook}. Append findings to the same file."

User pastes into their CC session, the skill picks up the existing `.md` and extends it. No URL scheme, no local server, works in any browser, works after the run.

## Output structure

```
~/Desktop/stripesessions_prospects_2026-04-25-2030/
├── recon.json                       # platform detection + extraction strategy
├── people.jsonl                     # raw extract from event page (line-per-person)
├── seed_companies.txt               # unique companies fed to ICP triage
├── companies/                       # company-research output, verbatim shape
│   ├── openai.md                    # frontmatter has icp_fit_score
│   ├── bridge.md
│   └── ... (only ICP fits get full deep research; non-fits get a thin triage stub)
├── people/                          # only ICP-fit companies' speakers
│   ├── greg-brockman.md             # frontmatter has links + hook
│   └── ...
├── index.html                       # person-first ranked card grid
├── companies.html                   # ICP-ranked table, expandable to attendees
├── people.html                      # filterable speaker grid (alternate view)
└── results.csv                      # cold-outbound-ready
```

## Reuses from company-research

**Verbatim** (shell-call or import):
- `scripts/extract_page.mjs` — bb fetch + browse fallback + JSON envelope handling
- `scripts/list_urls.mjs` — URL dedup
- `scripts/compile_report.mjs` — extend with new renderers, don't fork
- `references/research-patterns.md` — Plan→Research→Synthesize pattern for company lane
- `references/example-research.md` — per-company .md format
- `profiles/{slug}.json` — user profile (interchangeable across all GTM skills)

**Extend**:
- `compile_report.mjs` — add `renderEventIndex()` (person cards), `renderPersonPage()`, `renderCompaniesWithAttendees()`. Existing functions untouched.

## New scripts (small)

- `scripts/recon.mjs` (~80 LOC) — platform detector. Probes in priority order: `__NEXT_DATA__`, Sessionize generator meta, Lu.ma og:site_name, Eventbrite, JSON-LD `Event`, fall through to markdown extraction.
- `scripts/extract_event.mjs` (~60 LOC) — reads `recon.json`, dispatches to platform-specific extractor, outputs `people.jsonl`.
- `scripts/enrich_person.mjs` (~100 LOC) — per-person: bb search "{name} {company} linkedin", harvest links, generate hook from event-context + recent activity. Run as a subagent batch.
- `references/event-platforms.md` — list of known platforms + extractor strategies (so future contributors can add platforms without touching core code).
- `references/workflow.md` — full workflow recipe, adapted from company-research.

## Defaults

| Flag | Default | Notes |
|------|---------|-------|
| `--icp-threshold` | `6` | Out of 10. Companies below this don't get deep research. |
| `--depth` | `deep` | quick = no person enrichment; deep = recon + ICP triage + deep research + person enrichment; deeper = + multi-source link harvest |
| `--user-company` | required | Slug; reads `profiles/{slug}.json` |
| Output dir | `~/Desktop/{event_slug}_prospects_{YYYY-MM-DD-HHMM}/` | Matches sibling skills |

## Cost model (Stripe Sessions example)

| Phase | Tool calls | Wall clock |
|-------|-----------|-----------|
| Recon + extract | 4 | 6s |
| ICP triage on 99 companies | 99 | ~3 min (parallel) |
| Deep research on ~30 ICP fits | ~150 | ~8 min (parallel) |
| Enrich ~50 speakers at fits | ~100 | ~4 min (parallel) |
| Compile HTML | 0 | 1s |
| **Total** | **~350** | **~15 min** |

vs. naive enrich-everyone design: ~600 calls and similar wall clock with thinner per-row output. Company-first cuts cost ~45% AND produces richer rationale because the company is fully understood by the time we look at the person.

## Out of scope for v0.1

- **event-follow-up** — sibling skill for post-event workflow (photos / notes / RSVP exports → CRM-ready follow-ups). Different inputs, different urgency, different output. Ships separately.
- **Sponsor → buying-committee fan-out** — sponsors paid (strong signal) but don't always send their decision-makers as speakers. v0.2.
- **Multi-event recurrence** — "this person spoke at 4 events I care about". v0.2.
- **Live local-server "research deeper" trigger** — clipboard for v0.1.
- **CRM integration** — read existing customers / drop matches.
- **Pricing normalization, SWOT, Porter's** — different skill.

## Risks

- **Platform drift**: event sites redesign every year. Mitigation: recon + platform-specific shortcuts are 30 LOC each, easy to update.
- **LinkedIn auth wall**: snippets only via bb search, never deep-fetch. Same rule as competitor-analysis.
- **ICP threshold tuning**: 6/10 is a guess. Will need calibration on real runs.
- **Hook quality**: depends on whether person has public signal in last 6 months. For obscure speakers, hook falls back to event-context, which is always at least one bullet.

## Test plan

- **Stripe Sessions** (https://stripesessions.com/speakers) — Next.js / `__NEXT_DATA__`. 240 speakers, 99 companies, expect ~30 ICP fits for Browserbase.
- **AI Engineer Summit** — different platform (custom or Sessionize), validates platform detection.
- **A small Lu.ma event** — JSON-LD path validation.
- **Unknown CMS** — fall-through to markdown extraction.

## Architecture diagram

```
┌──────────────────────────┐
│ INPUT: speakers URL      │
│ + user profile slug      │
└─────────────┬────────────┘
              ▼
┌──────────────────────────┐
│ NEW: recon.mjs           │
│ NEW: extract_event.mjs   │
│ → people.jsonl           │
└─────────────┬────────────┘
              ▼
┌──────────────────────────┐
│ Group by company         │
│ → seed_companies.txt     │
└─────────────┬────────────┘
              ▼
┌──────────────────────────┐
│ REUSE: extract_page.mjs  │
│ + ICP triage             │
│ → companies/*.md         │
└─────────────┬────────────┘
              ▼
┌──────────────────────────┐
│ Filter score >= 6        │
└─────────────┬────────────┘
              ▼
┌──────────────────────────┐
│ REUSE: research-patterns │
│ Deep research subagents  │
│ (only on ICP fits)       │
└─────────────┬────────────┘
              ▼
┌──────────────────────────┐
│ NEW: enrich_person.mjs   │
│ Speakers at ICP fits     │
│ → people/*.md            │
└─────────────┬────────────┘
              ▼
┌──────────────────────────┐
│ EXTEND: compile_report   │
│ → index.html (person-1st)│
│ → results.csv            │
└──────────────────────────┘
```

## Approved 2026-04-25

Lock-ins from brainstorming dialog:
- Person-first primary view (not company-first); index is a stack of person cards
- Hook source: event-context first, fallback to recent activity (deep mode)
- 3-bullet "why" + one-click DM opener + clipboard "research deeper" button
- All public links surfaced (LinkedIn, X, GitHub, blog, podcast)
- Two skills, not one: event-prospecting (pre-event) and event-follow-up (post-event, ships later)
- Company-first ICP filter before person enrichment (cost + quality win)
- Deterministic extraction primary; no Stagehand fallback in v0.1

Next: hand off to writing-plans for the implementation plan.
