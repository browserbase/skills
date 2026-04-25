# Event-Prospecting Skill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a `event-prospecting` skill at `/Users/jay/skills/skills/event-prospecting/` that takes a conference speakers URL, extracts people, filters by ICP at the company level, deep-researches the fit-companies' people, and outputs a person-first HTML report.

**Architecture:** Thin wrapper around `company-research`. New code is the event-recon front-end (recon → platform-specific extract → group-by-company), the per-person enrichment back-end, and the HTML report extension. ICP scoring + deep company research is delegated to `company-research`'s existing pipeline by reusing `extract_page.mjs` and the Plan→Research→Synthesize subagent prompt pattern verbatim.

**Tech Stack:** Node.js (no transpile, ESM `.mjs`), Bash subagents via Claude Code Agent tool, Browserbase CLIs (`bb fetch`, `bb search`, `browse goto`, `browse eval`, `browse get markdown`), HTML/CSS/vanilla-JS for the report.

**Reference design:** `docs/plans/2026-04-25-event-prospecting-design.md` (already committed).

---

## Branch setup

This plan assumes the implementer:
1. Creates a new branch `event-prospecting` cut from `main`
2. Has `competitor-analysis` branch checked out somewhere or merged into main (so they can reference the latest patterns at `/Users/jay/skills/skills/competitor-analysis/`)
3. Has `company-research` already at `/Users/jay/skills/skills/company-research/` (it's on main)

If `competitor-analysis` isn't merged to main yet, do step 1 cutting from `competitor-analysis` instead — the design borrows from both, but compiles the report by extending company-research's compile script, so company-research is the strict dependency.

```bash
git checkout main
git pull
git checkout -b event-prospecting
mkdir -p skills/event-prospecting/{scripts,references,profiles}
```

---

## Phase A — Scaffolding + Recon

Goal at end of Phase A: `node scripts/recon.mjs https://stripesessions.com/speakers` prints a recon.json that correctly identifies "next-data" and locates the speaker JSON path inside `__NEXT_DATA__`.

### Task A1: Scaffold the skill directory

**Files:**
- Create: `skills/event-prospecting/scripts/package.json`
- Create: `skills/event-prospecting/profiles/example.json`
- Create: `skills/event-prospecting/.gitignore`

**Step 1: Create the directory layout**

```bash
mkdir -p skills/event-prospecting/{scripts,references,profiles}
```

**Step 2: Write package.json**

```json
{
  "name": "event-prospecting-scripts",
  "version": "0.1.0",
  "type": "module",
  "private": true
}
```

**Step 3: Copy the example profile from company-research** (same shape across GTM skills)

```bash
cp skills/company-research/profiles/example.json skills/event-prospecting/profiles/example.json
```

**Step 4: Write .gitignore**

```
node_modules/
*.log
.DS_Store
```

**Step 5: Commit**

```bash
git add skills/event-prospecting/
git commit -m "scaffold(event-prospecting): directory layout + example profile"
```

---

### Task A2: Copy reused scripts from company-research

These are deliberate copies (not symlinks) so the skill is self-contained — same approach competitor-analysis took. We accept a small DRY cost for shippability.

**Files:**
- Create: `skills/event-prospecting/scripts/extract_page.mjs` (copy from company-research)
- Create: `skills/event-prospecting/scripts/list_urls.mjs` (copy from company-research)

**Step 1: Copy both files**

```bash
cp skills/company-research/scripts/extract_page.mjs skills/event-prospecting/scripts/
cp skills/company-research/scripts/list_urls.mjs skills/event-prospecting/scripts/
```

**Step 2: Sanity-check they still run standalone**

```bash
node skills/event-prospecting/scripts/extract_page.mjs --help
node skills/event-prospecting/scripts/list_urls.mjs --help
```

Expected: both print usage and exit 0.

**Step 3: Commit**

```bash
git add skills/event-prospecting/scripts/extract_page.mjs skills/event-prospecting/scripts/list_urls.mjs
git commit -m "scaffold(event-prospecting): reuse extract_page + list_urls from company-research"
```

---

### Task A3: Write recon.mjs — Next.js detector (the proven path)

`recon.mjs` is the most important new script. It probes the event URL and writes `recon.json` describing the platform + extraction strategy. The first detector we ship is Next.js / `__NEXT_DATA__` because that's what we validated on Stripe Sessions.

**Files:**
- Create: `skills/event-prospecting/scripts/recon.mjs`

**Step 1: Write a fixture-driven test plan first**

Create `skills/event-prospecting/scripts/__fixtures__/stripe-snapshot.json`:

```json
{
  "title": "Stripe Sessions 2026 | Speakers",
  "hasNextData": true,
  "nextDataLen": 439761,
  "speakerArrayPaths": [
    ".props.pageProps.featuredSpeakers.speakers.items",
    ".props.pageProps.moreSpeakers.speakers.items"
  ],
  "totalSpeakers": 240
}
```

This fixture documents what Stripe Sessions looked like at design time. recon.json output for Stripe should match this.

**Step 2: Write recon.mjs**

```javascript
#!/usr/bin/env node
// recon.mjs — probe an event URL, identify the platform, persist a recon.json
// describing how to extract people. Output dir is the second arg or stdout.
//
// Usage: node recon.mjs <event-url> [output-dir]
//
// Detection priority:
//   1. Next.js __NEXT_DATA__ (custom Next sites — Stripe Sessions class)
//   2. Sessionize generator meta or sessionz.io script
//   3. Lu.ma og:site_name
//   4. Eventbrite og:site_name
//   5. JSON-LD Event block
//   6. Fall through to markdown-extraction strategy

import { execFileSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);
if (args.length < 1 || args.includes('--help')) {
  console.error(`Usage: node recon.mjs <event-url> [output-dir]`);
  process.exit(1);
}

const url = args[0];
const outDir = args[1];

function browse(...subargs) {
  return execFileSync('browse', subargs, {
    encoding: 'utf-8', maxBuffer: 8 * 1024 * 1024, timeout: 60000,
  });
}

function probe() {
  // Navigate + settle
  browse('goto', url);
  browse('wait', 'timeout', '2500');
  const titleRes = JSON.parse(browse('get', 'title'));
  const title = titleRes.title || '';

  // Probe in priority order via a single eval — cheaper than N calls.
  const probeJs = `(() => {
    const nd = document.getElementById('__NEXT_DATA__');
    const meta = document.querySelector('meta[name="generator"]');
    const og = document.querySelector('meta[property="og:site_name"]');
    const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map(s => { try { return JSON.parse(s.textContent); } catch { return null; }})
      .filter(Boolean);
    return {
      hasNextData: !!nd,
      nextDataLen: nd ? nd.textContent.length : 0,
      generator: meta ? meta.content : null,
      ogSite: og ? og.content : null,
      jsonLdEvents: jsonLd.filter(j => j['@type'] === 'Event').length,
      hostname: location.hostname
    };
  })()`;
  const evalRes = JSON.parse(browse('eval', probeJs));
  const r = evalRes.result || {};

  // Decide platform
  let platform = 'custom';
  let strategy = 'markdown';
  let nextDataPaths = null;

  if (r.hasNextData) {
    platform = 'next-data';
    strategy = 'next-data-eval';
    // Find arrays of speaker-like objects inside __NEXT_DATA__
    const findJs = `(() => {
      const data = JSON.parse(document.getElementById('__NEXT_DATA__').textContent);
      const out = [];
      function walk(o, path='') {
        if (Array.isArray(o)) {
          if (o.length > 3 && typeof o[0] === 'object' && o[0] !== null) {
            const keys = Object.keys(o[0]);
            const hasName = keys.some(k => /name/i.test(k));
            const hasLinkedIn = JSON.stringify(o[0]).match(/linkedin/i);
            if (hasName && hasLinkedIn) out.push({ path, len: o.length, keys: keys.slice(0,12) });
          }
          o.forEach((v,i) => walk(v, path+'['+i+']'));
        } else if (o && typeof o === 'object') {
          Object.keys(o).forEach(k => walk(o[k], path+'.'+k));
        }
      }
      walk(data);
      // Keep only top-level (non-nested) speaker arrays — drop talks[N].speakers
      return out.filter(x => !/\\.talks\\[\\d+\\]\\.speakers/.test(x.path)).slice(0, 5);
    })()`;
    const findRes = JSON.parse(browse('eval', findJs));
    nextDataPaths = (findRes.result || []).map(x => x.path);
  } else if (r.generator && /sessionize/i.test(r.generator)) {
    platform = 'sessionize';
    strategy = 'sessionize-api';
  } else if (r.hostname && /lu\\.ma/.test(r.hostname)) {
    platform = 'luma';
    strategy = 'json-ld';
  } else if (r.ogSite && /eventbrite/i.test(r.ogSite)) {
    platform = 'eventbrite';
    strategy = 'json-ld';
  } else if (r.jsonLdEvents > 0) {
    platform = 'json-ld';
    strategy = 'json-ld';
  }

  return {
    url,
    title,
    platform,
    strategy,
    nextDataPaths,
    signals: r,
    probedAt: new Date().toISOString(),
  };
}

const result = probe();

if (outDir) {
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, 'recon.json');
  writeFileSync(path, JSON.stringify(result, null, 2));
  console.error(`recon.json written → ${path}`);
}
console.log(JSON.stringify(result, null, 2));
```

**Step 3: Run against Stripe Sessions to verify**

```bash
node skills/event-prospecting/scripts/recon.mjs https://stripesessions.com/speakers
```

Expected output:
```json
{
  "url": "https://stripesessions.com/speakers",
  "title": "Stripe Sessions 2026 | Speakers",
  "platform": "next-data",
  "strategy": "next-data-eval",
  "nextDataPaths": [
    ".props.pageProps.featuredSpeakers.speakers.items",
    ".props.pageProps.moreSpeakers.speakers.items"
  ],
  ...
}
```

**Step 4: Commit**

```bash
git add skills/event-prospecting/scripts/recon.mjs skills/event-prospecting/scripts/__fixtures__/
git commit -m "feat(event-prospecting): recon.mjs detects Next.js + locates speaker arrays"
```

---

### Task A4: Add fallback platform detectors (markdown extraction)

The Next.js detector covers Stripe-class events. We need at least the markdown fallback to handle "unknown" sites without crashing. Sessionize / Lu.ma / Eventbrite branches are stubs that just set the strategy field — actual extractors come in Phase B.

**Files:**
- Modify: `skills/event-prospecting/scripts/recon.mjs` (markdown fallback already in code above; verify by testing on a non-Next site)

**Step 1: Test fallback on a non-Next site**

Find a small static event site and run recon. e.g. a personal-site events page. Expected: `platform: "custom"`, `strategy: "markdown"`. No crash.

**Step 2: Commit any tweaks**

If recon needed adjustments to handle the fallback gracefully, commit them.

```bash
git commit -am "fix(event-prospecting): recon falls through cleanly for unknown platforms"
```

---

## Phase B — Extraction + Group-by-company

Goal at end of Phase B: `node scripts/extract_event.mjs <output-dir>` reads `recon.json`, runs the platform-specific extractor, writes `people.jsonl`, and emits `seed_companies.txt` with deduped companies.

### Task B1: Write extract_event.mjs — Next.js extractor

The Next.js extractor reads `recon.json` and runs ONE `browse eval` to pull every speaker out of `__NEXT_DATA__` using the paths recon found. This is the path validated against Stripe.

**Files:**
- Create: `skills/event-prospecting/scripts/extract_event.mjs`

**Step 1: Write the extractor**

```javascript
#!/usr/bin/env node
// extract_event.mjs — read recon.json, dispatch to platform-specific extractor,
// write people.jsonl (one speaker per line) and seed_companies.txt.
//
// Usage: node extract_event.mjs <output-dir>

import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const outDir = process.argv[2];
if (!outDir) { console.error('Usage: extract_event.mjs <output-dir>'); process.exit(1); }

const recon = JSON.parse(readFileSync(join(outDir, 'recon.json'), 'utf-8'));

function browse(...subargs) {
  return execFileSync('browse', subargs, {
    encoding: 'utf-8', maxBuffer: 16 * 1024 * 1024, timeout: 60000,
  });
}

function slugify(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function extractFromNextData(paths) {
  // Build a JS expression that walks __NEXT_DATA__ for each path and unions the arrays.
  const js = `(() => {
    const data = JSON.parse(document.getElementById('__NEXT_DATA__').textContent);
    function get(obj, path) {
      // path like '.props.pageProps.foo[0].bar' — naive parser, sufficient
      const tokens = path.match(/\\.[a-zA-Z_$][\\w$]*|\\[\\d+\\]/g) || [];
      let cur = obj;
      for (const t of tokens) {
        if (!cur) return null;
        if (t.startsWith('.')) cur = cur[t.slice(1)];
        else cur = cur[parseInt(t.slice(1, -1), 10)];
      }
      return cur;
    }
    const all = [];
    ${JSON.stringify(paths)}.forEach(p => {
      const arr = get(data, p);
      if (Array.isArray(arr)) all.push(...arr);
    });
    return all.map(s => ({
      name: s.name || s.fullName || null,
      title: s.title || s.role || null,
      company: s.companyName || s.company || s.org || null,
      linkedin: s.linkedInProfile || s.linkedinUrl || s.linkedin || null,
      bio: s.bio || s.description || null,
    }));
  })()`;
  const res = JSON.parse(browse('goto', recon.url));
  browse('wait', 'timeout', '2000');
  const evalRes = JSON.parse(browse('eval', js));
  return evalRes.result || [];
}

function extractFromMarkdown() {
  browse('goto', recon.url);
  browse('wait', 'timeout', '2500');
  const md = JSON.parse(browse('get', 'markdown')).markdown || '';
  // Naive: find blocks of "#### {Name}\n\n{Role}\n\n{Company}\n\n[LinkedIn]({url})"
  // This is a fallback — coverage is best-effort.
  const blocks = md.split(/\\n#{2,4} /);
  const out = [];
  for (const b of blocks) {
    const lines = b.split(/\\n+/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;
    const name = lines[0];
    if (!/^[A-Z]/.test(name)) continue;
    const linkedinMatch = b.match(/linkedin\\.com\\/in\\/([\\w-]+)/i);
    out.push({
      name,
      title: lines[1] || null,
      company: lines[2] || null,
      linkedin: linkedinMatch ? `https://www.linkedin.com/in/${linkedinMatch[1]}/` : null,
    });
  }
  return out;
}

let people = [];
if (recon.strategy === 'next-data-eval') {
  people = extractFromNextData(recon.nextDataPaths || []);
} else if (recon.strategy === 'markdown') {
  people = extractFromMarkdown();
} else {
  console.error(`Strategy ${recon.strategy} not implemented in v0.1; falling back to markdown.`);
  people = extractFromMarkdown();
}

// Add a slug
people = people.map(p => ({ ...p, slug: slugify(p.name) }));

// Write people.jsonl
const peopleFile = join(outDir, 'people.jsonl');
writeFileSync(peopleFile, people.map(p => JSON.stringify(p)).join('\\n') + '\\n');

// Roll up to unique companies
const companies = [...new Set(people.map(p => p.company).filter(Boolean))].sort();
writeFileSync(join(outDir, 'seed_companies.txt'), companies.join('\\n') + '\\n');

console.error(`Extracted ${people.length} people, ${companies.length} unique companies → ${outDir}`);
console.log(JSON.stringify({ peopleCount: people.length, companyCount: companies.length, peopleFile }, null, 2));
```

**Step 2: Test against Stripe Sessions**

```bash
mkdir -p /tmp/event_test
node skills/event-prospecting/scripts/recon.mjs https://stripesessions.com/speakers /tmp/event_test
node skills/event-prospecting/scripts/extract_event.mjs /tmp/event_test
```

Expected:
- `/tmp/event_test/people.jsonl` exists with ~240 lines
- `/tmp/event_test/seed_companies.txt` has ~99 companies
- First line of people.jsonl is Patrick Collison

**Step 3: Verify output shape**

```bash
head -3 /tmp/event_test/people.jsonl | node -e 'process.stdin.on("data",d=>d.toString().trim().split("\\n").forEach(l=>console.log(JSON.parse(l).name+" — "+JSON.parse(l).company)))'
wc -l /tmp/event_test/people.jsonl /tmp/event_test/seed_companies.txt
```

Expected: ~240 / ~99.

**Step 4: Commit**

```bash
git add skills/event-prospecting/scripts/extract_event.mjs
git commit -m "feat(event-prospecting): extract speakers from Next.js + markdown fallback"
```

---

### Task B2: Filter the user's own company + obvious noise from seed list

Drop the user's own employees (Stripe employees from a Stripe-hosted event) and event-staff entries. Keep the logic in the extractor so downstream steps see clean data.

**Files:**
- Modify: `skills/event-prospecting/scripts/extract_event.mjs`

**Step 1: Add filter logic**

After the `people = people.map(...)` line, insert:

```javascript
// Filter event-host employees and obvious noise. The host org domain is derived
// from the event URL — for stripesessions.com, that's stripe.
const hostOrg = (() => {
  try {
    const h = new URL(recon.url).hostname.replace(/^www\\./, '');
    // 'stripesessions.com' → 'stripe' (drop the 'sessions' suffix or take the first chunk)
    return h.split('.')[0].replace(/sessions?$/, '').replace(/conf$/, '');
  } catch { return null; }
})();

const filterArgs = process.argv.slice(2);
const userCompanyArg = (() => {
  const i = filterArgs.indexOf('--user-company');
  return i !== -1 ? filterArgs[i + 1] : null;
})();

const dropList = new Set([
  hostOrg && hostOrg.toLowerCase(),
  userCompanyArg && userCompanyArg.toLowerCase(),
].filter(Boolean));

const filtered = people.filter(p => {
  if (!p.company) return true; // keep "unknown company" — synth assigns later
  return !dropList.has(p.company.toLowerCase());
});

console.error(`Filtered ${people.length - filtered.length} host-org / user-company employees`);
people = filtered;
```

**Step 2: Test on Stripe**

```bash
node skills/event-prospecting/scripts/extract_event.mjs /tmp/event_test --user-company browserbase
```

Expected: people.jsonl drops from ~240 to ~160 (Stripe employees removed).

**Step 3: Commit**

```bash
git commit -am "feat(event-prospecting): filter host-org + user-company employees from speaker list"
```

---

## Phase C — ICP triage + deep research (delegate to company-research)

Goal at end of Phase C: A single shell script orchestrates the company-research deep-research pattern over `seed_companies.txt`, producing `companies/{slug}.md` files with `icp_fit_score` in frontmatter.

### Task C1: Write SKILL.md skeleton with the 10-step pipeline

The SKILL.md is what Claude Code reads when invoking the skill. Write a complete frontmatter + 10-step pipeline first, even if some steps are stubs.

**Files:**
- Create: `skills/event-prospecting/SKILL.md`

**Step 1: Write frontmatter + intro**

Mirror competitor-analysis SKILL.md frontmatter exactly. Include trigger keywords for "conference", "event", "speakers", "attendees", "stripe sessions", "ai engineer summit".

```markdown
---
name: event-prospecting
description: |
  Event prospecting skill. Takes a conference / event speakers URL,
  extracts the people, filters their companies against the user's
  ICP, then deep-researches only the speakers at ICP-fit companies.
  Outputs a person-first HTML report where each card answers "why
  should the AE talk to this person?" with all public links and a
  one-click DM opener.
  Use when the user wants to: (1) find leads at a specific
  conference, (2) prep for an event, (3) research event speakers,
  (4) build a target list from a sponsor/exhibitor page,
  (5) scrape conference speakers and rank by ICP fit.
  Triggers: "find leads at {event}", "research speakers at",
  "prospect this conference", "stripe sessions leads",
  "ai engineer summit prospects", "event prospecting",
  "scrape conference speakers", "who should I meet at".
license: MIT
compatibility: Requires bb CLI (@browserbasehq/cli) and BROWSERBASE_API_KEY env var. Also requires browse CLI (@browserbasehq/browse-cli) for JS-heavy pages.
allowed-tools: Bash Agent AskUserQuestion
metadata:
  author: browserbase
  version: "0.1.0"
---

# Event Prospecting

Take a conference URL → get a ranked list of people the AE should talk to, with a "why reach out" rationale per person.

(rest of SKILL.md follows in subsequent tasks)
```

**Step 2: Add the 10-step pipeline section** (per the design doc)

Adapt the structure from competitor-analysis SKILL.md. Each step states:
- What it does
- Tool calls allowed
- Outputs

**Step 3: Commit**

```bash
git add skills/event-prospecting/SKILL.md
git commit -m "feat(event-prospecting): SKILL.md skeleton + frontmatter + 10-step pipeline"
```

---

### Task C2: Add the ICP triage subagent prompt

ICP triage is one tool call per company. We dispatch ~10 subagents each handling ~10 companies, batched in a single Agent fan-out.

**Files:**
- Create: `skills/event-prospecting/references/research-patterns.md`

**Step 1: Reference company-research's research-patterns.md**

The Plan→Research→Synthesize pattern is identical. Don't duplicate; reference and add the event-specific deltas.

```markdown
# Event-Prospecting — Research Patterns

The deep-research pattern is identical to company-research's Plan→Research→Synthesize. See `/Users/jay/skills/skills/company-research/references/research-patterns.md` for the canonical pattern.

This file documents the *deltas* for event-prospecting:

## ICP Triage (Step 5 — fast pass)

For each company in `seed_companies.txt`, run ONE tool call to fetch the homepage + extract a 1-line product description, then score against ICP. Output goes to `companies/{slug}.md` with frontmatter:

\`\`\`yaml
company_name: OpenAI
website: https://openai.com
product_description: "AI lab building safe AGI for everyone"
icp_fit_score: 9
icp_fit_reasoning: "AI agents need cloud browser infrastructure at scale; ChatGPT Agent shipped Mar 2026"
triage_only: true   # NOT yet deep-researched
\`\`\`

Companies with `icp_fit_score < {threshold}` stay as triage stubs. Companies above the threshold get the full deep-research treatment in Step 7.

## Deep Research (Step 7 — full pass)

Identical to company-research Step 6. The ICP-fit companies (typically 20-40% of the seed list) get the full Plan→Research→Synthesize treatment with sub-questions tailored to the event context (e.g. "What is OpenAI doing with browser automation that's relevant to Stripe Sessions' agent track?").

## Person Enrichment (Step 8 — speakers at ICP fits only)

Per person:
- `bb search "{name} {company} linkedin"` — verify role + harvest LinkedIn URL
- `bb search "{name} podcast OR talk OR blog"` — last 6 months for hooks
- `bb search "{name} github"` — open-source signal
- `bb search "{name} site:x.com OR site:twitter.com"` — recent posts

Generate a 3-bullet "why reach out" + DM opener per person. Output to `people/{slug}.md`.
```

**Step 2: Commit**

```bash
git add skills/event-prospecting/references/research-patterns.md
git commit -m "docs(event-prospecting): ICP triage + deep research patterns"
```

---

### Task C3: Add the example-research.md template (per-company .md format)

**Files:**
- Create: `skills/event-prospecting/references/example-research.md`

**Step 1: Adapt company-research's example, add the `triage_only` and event-context fields**

Copy `/Users/jay/skills/skills/company-research/references/example-research.md` and add a per-event section showing what the `event_context` frontmatter field contains.

**Step 2: Commit**

```bash
git add skills/event-prospecting/references/example-research.md
git commit -m "docs(event-prospecting): example .md format for company + person files"
```

---

### Task C4: Add the workflow.md (subagent prompts)

This is the big one — the workflow.md is what subagents read. Adapt competitor-analysis's workflow.md format.

**Files:**
- Create: `skills/event-prospecting/references/workflow.md`

**Step 1: Write the table of contents + intro**

```markdown
# Event-Prospecting Workflow

## Contents
- [Discovery](#discovery) — recon + extract
- [ICP Triage](#icp-triage) — fast company-level scoring
- [Deep Research](#deep-research) — full Plan→Research→Synthesize on ICP fits
- [Person Enrichment](#person-enrichment) — speakers at ICP-fit companies
- [Compilation](#compilation) — HTML report
```

**Step 2: Write the ICP Triage subagent prompt block**

Hard-cap at 1 tool call per company. Subagents must:
- Run `node {SKILL_DIR}/scripts/extract_page.mjs "{company_url}"` ONLY
- Score 0-10 against the user's ICP
- Write `companies/{slug}.md` via heredoc
- Stop after one call; never deep-research at this stage

**Step 3: Write the Deep Research subagent prompt block**

Full company-research pattern. Hard-cap at 5 tool calls per company.

**Step 4: Write the Person Enrichment subagent prompt block**

Hard-cap at 4 tool calls per person:
1. `bb search "{name} {company} linkedin"` (always)
2. `bb search "{name} podcast OR talk OR blog 2026"` (deep+)
3. `bb search "{name} github"` (deeper)
4. `bb search "{name} site:x.com"` (deeper)

Each subagent handles ~5 people in batched tool calls.

**Step 5: Commit**

```bash
git add skills/event-prospecting/references/workflow.md
git commit -m "docs(event-prospecting): subagent workflow + tool-call caps"
```

---

### Task C5: Write the orchestrator commands in SKILL.md

The SKILL.md needs concrete commands for the main agent to dispatch subagent fan-outs. Match the structure in competitor-analysis SKILL.md.

**Files:**
- Modify: `skills/event-prospecting/SKILL.md`

**Step 1: For each of the 10 steps, add the explicit command pattern**

Each step block should look like:

````markdown
## Step 5: ICP Triage

Dispatch one Agent batch — N subagents, each handling ~10 companies — with the prompt template at `references/workflow.md` → "ICP Triage" section.

Read `seed_companies.txt`, split into N batches, and fan out:

```bash
# Pseudo-shell — actual fan-out is via the Agent tool in a single message
for batch in $(split_into_batches seed_companies.txt 10); do
  Agent(prompt: "ICP triage these 10 companies: $batch...")
done
```

After all subagents complete, verify all `companies/*.md` files exist.
````

**Step 2: Add the Step 9 compile command**

```bash
node {SKILL_DIR}/scripts/compile_report.mjs {OUTPUT_DIR} --user-company {USER_SLUG} --open
```

**Step 3: Commit**

```bash
git commit -am "feat(event-prospecting): SKILL.md orchestrator commands per step"
```

---

## Phase D — Person enrichment + HTML report

Goal at end of Phase D: `node scripts/compile_report.mjs <output-dir> --user-company browserbase --open` produces a working `index.html` with person cards + clipboard buttons.

### Task D1: Write enrich_person.mjs (helper for the subagent)

The actual person enrichment runs as subagents (Bash-only) using prompts from workflow.md. But there's a small helper script that batches the search + parses results.

**Files:**
- Create: `skills/event-prospecting/scripts/enrich_person.mjs`

**Step 1: Write the helper**

```javascript
#!/usr/bin/env node
// enrich_person.mjs — given a person record, run a sequence of bb searches and
// emit a structured enrichment record. Used by the per-person subagent.
//
// Usage: enrich_person.mjs --name "Greg Brockman" --company "OpenAI" --linkedin "https://..." --depth deep

import { execFileSync } from 'child_process';

function flag(name, def) {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : def;
}

const name = flag('--name');
const company = flag('--company', '');
const linkedinIn = flag('--linkedin', '');
const depth = flag('--depth', 'deep');

if (!name) { console.error('--name required'); process.exit(1); }

function bbSearch(query, n = 5) {
  const out = execFileSync('bb', ['search', query, '--num-results', String(n)], {
    encoding: 'utf-8', maxBuffer: 4 * 1024 * 1024, timeout: 20000,
  });
  return JSON.parse(out);
}

function harvestLinks(results) {
  const links = { linkedin: linkedinIn || null, x: null, github: null, blog: null, podcast: null };
  for (const r of results) {
    const u = r.url || '';
    if (!links.linkedin && /linkedin\\.com\\/in\\//.test(u)) links.linkedin = u;
    if (!links.x && /(x|twitter)\\.com/.test(u)) links.x = u;
    if (!links.github && /github\\.com/.test(u)) links.github = u;
    if (!links.podcast && /(spotify|podcast|simplecast|transistor)/.test(u)) links.podcast = u;
    if (!links.blog && /(medium|substack|hashnode|dev\\.to|\\.blog)/.test(u)) links.blog = u;
  }
  return links;
}

const out = { name, company, linkedin: linkedinIn, hooks: [], links: {} };

// Lane 1 — LinkedIn verify (always)
const r1 = bbSearch(`${name} ${company} linkedin`);
out.links = harvestLinks(r1.results || []);

// Lane 2 — Recent activity (deep+)
if (depth === 'deep' || depth === 'deeper') {
  const r2 = bbSearch(`"${name}" podcast OR talk OR blog 2026`);
  out.recentActivity = (r2.results || []).slice(0, 3).map(r => ({ title: r.title, url: r.url }));
}

// Lane 3 — GitHub + X (deeper)
if (depth === 'deeper') {
  const r3 = bbSearch(`"${name}" github`);
  const r4 = bbSearch(`"${name}" site:x.com OR site:twitter.com`);
  out.links = { ...out.links, ...harvestLinks([...(r3.results || []), ...(r4.results || [])]) };
}

console.log(JSON.stringify(out, null, 2));
```

**Step 2: Test on a known person**

```bash
node skills/event-prospecting/scripts/enrich_person.mjs --name "Patrick Collison" --company "Stripe" --depth deep
```

Expected: JSON with linkedin URL, recent activity bullets.

**Step 3: Commit**

```bash
git add skills/event-prospecting/scripts/enrich_person.mjs
git commit -m "feat(event-prospecting): enrich_person.mjs harvests links + recent activity"
```

---

### Task D2: Extend compile_report.mjs — copy from company-research, add person renderers

Don't fork. Start by copying the company-research compile_report.mjs as a base, then add a `renderPersonCard()` and a person-first index renderer.

**Files:**
- Create: `skills/event-prospecting/scripts/compile_report.mjs` (copy + extend)
- Create: `skills/event-prospecting/references/report-template.html` (copy + extend)

**Step 1: Copy the base files**

```bash
cp skills/company-research/scripts/compile_report.mjs skills/event-prospecting/scripts/
cp skills/company-research/references/report-template.html skills/event-prospecting/references/ 2>/dev/null || true
```

If company-research doesn't have a separate report-template.html, lift CSS from competitor-analysis's `references/report-template.html`.

**Step 2: Add a `renderPersonCard()` function**

```javascript
function renderPersonCard(person, company) {
  const links = person.links || {};
  const linkPills = ['linkedin', 'x', 'github', 'blog', 'podcast']
    .filter(k => links[k])
    .map(k => `<a class="link-pill link-${k}" href="${escapeHtml(links[k])}" target="_blank">${k.toUpperCase()}</a>`)
    .join(' ');

  return `<div class="person-card" data-slug="${escapeHtml(person.slug)}">
    <div class="card-header">
      <h3>${escapeHtml(person.name)}</h3>
      <span class="icp-badge icp-${company.icp_fit_score >= 8 ? 'high' : company.icp_fit_score >= 6 ? 'mid' : 'low'}">ICP ${company.icp_fit_score || '?'}</span>
    </div>
    <div class="card-meta">${escapeHtml(person.title || '')} · ${escapeHtml(person.company || '')}</div>
    <div class="card-links">${linkPills}</div>
    <ul class="card-why">
      <li><strong>Why the company:</strong> ${escapeHtml(company.icp_fit_reasoning || '—')}</li>
      <li><strong>Why the person:</strong> ${escapeHtml(person.role_reason || '—')}</li>
      <li><strong>Hook:</strong> ${escapeHtml(person.hook || '—')}</li>
    </ul>
    <div class="card-actions">
      <button class="btn-copy" data-clipboard="${escapeHtml(person.dm_opener || '')}">📋 Copy DM opener</button>
      <button class="btn-research" data-clipboard="${escapeHtml(buildResearchPrompt(person, company))}">🔬 Research deeper</button>
    </div>
  </div>`;
}

function buildResearchPrompt(person, company) {
  return `Use event-prospecting to deepen the brief on ${person.name} (${person.company}, ${person.linkedin || ''}). Source event: ${person.event_name || ''}. Existing notes: ${person.md_path}. Pull recent podcast appearances, GitHub activity, and any signals about ${company.icp_fit_reasoning || 'the company'}. Append findings to the same file.`;
}
```

**Step 3: Add the index renderer that uses person cards**

The new index.html should rank people by company ICP score, render N cards in a responsive grid.

**Step 4: Add the clipboard JS**

At the bottom of the rendered HTML:

```html
<script>
document.addEventListener('click', e => {
  const btn = e.target.closest('button[data-clipboard]');
  if (!btn) return;
  navigator.clipboard.writeText(btn.dataset.clipboard);
  const orig = btn.textContent;
  btn.textContent = '✓ Copied';
  setTimeout(() => btn.textContent = orig, 1200);
});
</script>
```

**Step 5: Commit**

```bash
git add skills/event-prospecting/scripts/compile_report.mjs skills/event-prospecting/references/report-template.html
git commit -m "feat(event-prospecting): person-card HTML report + clipboard buttons"
```

---

### Task D3: Add the people.html and companies.html alternate views

Same data, two more renderings.

**Files:**
- Modify: `skills/event-prospecting/scripts/compile_report.mjs`

**Step 1: Add `renderPeopleGrid()` and `renderCompaniesTable()`**

people.html: filterable grid with chips for company, role-bucket, ICP band.
companies.html: ICP-ranked company table with attendees expandable per row.

**Step 2: Test with a fixture**

Create a tiny fixture dir with 3 companies + 5 people .md files. Run compile. Expect 3 HTML files written, no crashes.

**Step 3: Commit**

```bash
git commit -am "feat(event-prospecting): people.html + companies.html alternate views"
```

---

## Phase E — End-to-end validation

Goal at end of Phase E: `event-prospecting https://stripesessions.com/speakers --user-company browserbase --depth deep` runs the full pipeline against Stripe Sessions and opens a working report.

### Task E1: Wire profiles/browserbase.json (or copy from existing GTM skill)

**Files:**
- Create: `skills/event-prospecting/profiles/browserbase.json`

**Step 1: Copy from a sibling skill if one exists**

```bash
cp /Users/jay/.agents/skills/account-positioning/profiles/browserbase.json skills/event-prospecting/profiles/ 2>/dev/null || \
  cp skills/company-research/profiles/example.json skills/event-prospecting/profiles/browserbase.json
```

**Step 2: Edit if needed to match company-research's profile shape**

**Step 3: Commit**

```bash
git add skills/event-prospecting/profiles/browserbase.json
git commit -m "chore(event-prospecting): browserbase profile for testing"
```

---

### Task E2: Dry-run end-to-end against Stripe Sessions

This is the big test. Walk the full pipeline manually.

**Step 1: Set up output dir**

```bash
OUT=/tmp/sf_e2e_$(date +%s)
mkdir -p $OUT
```

**Step 2: Run recon + extract**

```bash
node skills/event-prospecting/scripts/recon.mjs https://stripesessions.com/speakers $OUT
node skills/event-prospecting/scripts/extract_event.mjs $OUT --user-company browserbase
```

Expected:
- recon.json: platform=next-data, 2 paths
- people.jsonl: ~160 lines (after host filter)
- seed_companies.txt: ~99 lines

**Step 3: Spot-check ICP triage on 3 companies manually**

```bash
node skills/event-prospecting/scripts/extract_page.mjs https://openai.com
node skills/event-prospecting/scripts/extract_page.mjs https://bridge.xyz
node skills/event-prospecting/scripts/extract_page.mjs https://anthropic.com
```

Expect each to return clean title + meta + body. If any returns 502 / >1MB, recon needs to handle it.

**Step 4: Spot-check person enrichment on 3 people**

```bash
node skills/event-prospecting/scripts/enrich_person.mjs --name "Greg Brockman" --company "OpenAI" --depth deep
node skills/event-prospecting/scripts/enrich_person.mjs --name "Zach Abrams" --company "Bridge" --depth deep
node skills/event-prospecting/scripts/enrich_person.mjs --name "Patrick Collison" --company "Stripe" --depth deep
```

Expect: each returns links + 1-3 recent activity items.

**Step 5: Manually create 3 companies/*.md and 3 people/*.md to test compile**

Use the templates from references/example-research.md. Then:

```bash
node skills/event-prospecting/scripts/compile_report.mjs $OUT --user-company browserbase --open
```

Expect: index.html opens with 3 person cards, 3 link pills each, copy buttons work.

**Step 6: Document any bugs, fix, commit each fix**

Issues that might surface:
- recon.json path traversal regex breaks on edge cases
- markdown extraction has stray entries
- LinkedIn URL not picked up if profile has trailing slash variation
- ICP score parsing fails if subagent writes a string instead of int

Commit each fix as its own commit.

---

### Task E3: Run the full skill via Agent fan-out (final smoke test)

**Step 1: Invoke the skill as a real Claude Code user would**

In a new Claude Code session:

```
Use event-prospecting to find leads at https://stripesessions.com/speakers for browserbase.
```

Expected wall-clock: ~15 min. Expected output: `~/Desktop/stripesessions_prospects_2026-04-25-XXXX/` with index.html opened in browser.

**Step 2: Audit the output**

- 30+ ICP-fit companies with deep research
- 50+ enriched people cards
- All link pills clickable
- Copy DM opener button works
- 🔬 Research deeper button copies a sane prompt

**Step 3: Capture any drift, commit fixes**

Subagents will drift from the expected format. Mirror competitor-analysis's pattern: normalize at compile time rather than rejecting subagent output.

**Step 4: Final commit**

```bash
git commit -am "feat(event-prospecting): v0.1 validated end-to-end on Stripe Sessions"
```

---

### Task E4: PR + merge

**Step 1: Push branch + open PR**

```bash
git push -u origin event-prospecting
gh pr create --title "feat: event-prospecting skill v0.1" --body "$(cat docs/plans/2026-04-25-event-prospecting-design.md | head -40)"
```

**Step 2: Merge after self-review**

---

## Out-of-band notes

- **Skill registration**: After merge, ensure the symlink at `~/.claude/skills/event-prospecting/` points at the new path so it's globally callable. competitor-analysis used the same pattern.
- **Cursor Bugbot review** will likely catch issues — fix in a follow-up PR like the four findings on competitor-analysis (matrix.html user-leak, undefined CSS vars, spawnSync concurrency, loose startsWith).
- **Sibling event-follow-up skill**: explicitly v0.2-or-later. Don't scope-creep into post-event handling.
- **Tool-call caps**: copy the HARD CAP block from competitor-analysis workflow.md verbatim. Three lanes × 4 calls each = 12 calls per person max. The pipeline budgets time on this.

---

## Acceptance criteria

| | |
|---|---|
| ✅ `node scripts/recon.mjs https://stripesessions.com/speakers` | Detects `next-data`, lists 2 speaker paths |
| ✅ `node scripts/extract_event.mjs $OUT` | Writes ~160 people, ~99 companies after host filter |
| ✅ Full pipeline wall-clock | ≤ 18 min on Stripe Sessions |
| ✅ `index.html` | Renders with person cards, all link pills clickable |
| ✅ Copy DM opener button | Copies sensible 2-3 sentence opener |
| ✅ 🔬 Research deeper button | Copies a CC prompt that includes name, company, LinkedIn, .md path |
| ✅ Skill loadable via Claude Code | `Use event-prospecting to ...` triggers correctly |
| ✅ Cost vs naive design | ~45% cheaper (350 calls vs 600) |
