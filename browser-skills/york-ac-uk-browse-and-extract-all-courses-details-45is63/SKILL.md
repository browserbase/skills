---
name: york-ac-uk-browse-and-extract-all-courses-details-45is63
title: University of York — Extract Full Course Catalogue & Program Details
description: >-
  Enumerate every University of York course and extract full program details
  (duration, intakes, fees, curriculum modules, entry requirements, English
  language and admission-test requirements, scholarships, careers and rankings)
  as JSON.
website: york.ac.uk
category: education
tags:
  - education
  - university
  - courses
  - admissions
  - scraping
  - catalogue
source: 'browserbase: agent-runtime 2026-07-25'
updated: '2026-07-25'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      A remote Browserbase session with `browse snapshot` extracts a full
      program page in one turn (~$0.16, 5 turns). Use it only if HTTP fetch is
      throttled or you need to render a JS-gated widget — every field verified
      in this skill is present in the server-rendered HTML, so browsing is the
      slower backup.
  - method: api
    rationale: >-
      Each program page embeds a schema.org `Course` JSON-LD block, but it only
      carries name/description/provider — not fees, modules or entry
      requirements. Useful to confirm the canonical program name, not a
      substitute for HTML parsing.
verified: false
proxies: false
---
# University of York — Extract Full Course Catalogue & Program Details

## Purpose

Read-only skill that enumerates every course the University of York offers (undergraduate, postgraduate‑taught and postgraduate‑research) and extracts the complete detail set for each program into JSON: program name and award, all duration options, intakes/start dates, tuition fees (home + international), curriculum modules (mandatory core + optional), entry requirements (main + per‑country), English‑language test requirements with minimum sectional scores and waiver conditions, admission‑test (GRE/GMAT/SAT) requirements, scholarships/funding, career outcomes and rankings. Every field is present in the **server‑rendered HTML**, so the recommended path is a plain HTTP fetch of each page — no browser, stealth or proxy required. The site is Cloudflare‑fronted but presents **no bot challenge**; bare fetches return `200`.

## When to Use

- Building or refreshing a full University of York course dataset for a comparison/aggregator tool.
- Answering "what does York offer in X, how long is it, what does it cost, what modules, what are the entry/English requirements?" for one or many programs.
- Pulling per‑country entry and English‑language requirements (with waivers) that are linked from — but not printed on — the program page.
- You need structured-but-text-tolerant output (values may stay as free text; no need to normalise fees/scores).

## Workflow

Recommended method: **HTTP fetch** (`browse cloud fetch <url>` — proxies optional, confirmed not required). The three catalogue index pages list every program URL; each program page is fully server‑rendered, so one GET per page yields all on‑page fields, and a handful of shared "global" pages cover the per‑country / waiver / scholarship detail.

### 1. Enumerate the catalogue (get every course URL)

Fetch the three index pages and scrape the `href`s that match `/courses/`:

- Undergraduate: `https://www.york.ac.uk/study/undergraduate/courses/all/` (~280 links)
- Postgraduate taught: `https://www.york.ac.uk/study/postgraduate/courses/all?mode=taught` (~200 links)
- Postgraduate research: `https://www.york.ac.uk/study/postgraduate/courses/all?mode=research`

Program URL patterns (note the path differs by level — see Gotchas):
- UG: `https://www.york.ac.uk/study/undergraduate/courses/{award-slug}/` (e.g. `bsc-computer-science`)
- PG taught: `https://www.york.ac.uk/study/postgraduate-taught/courses/{award-slug}/` (e.g. `msc-advanced-computer-science`)

Deduplicate; drop non‑program links (`.../all`, `.../header-*`, aggregator landing pages like `.../ai-llm/`, and `apply?course=` links).

### 2. Fetch each program page and extract the on‑page fields

`browse cloud fetch "<program-url>"` returns the full HTML. Strip tags to text (or parse the DOM) and pull:

- **Program name & award** — page `<h1>` / the JSON‑LD `Course.name`; award is the leading token (BSc/BA/BEng/MEng/MSc/MA/LLM/MRes/PGDip…).
- **Duration** — the `Length` field (e.g. `1 year full-time`, `3 years full-time`). Capture **all** variants: part‑time options and sibling "with a year in industry / year abroad / with a placement" course pages are listed as **related courses** (each is its own URL with its own duration) — follow and record them as additional duration options.
- **Intake / start date** — `Start date` (e.g. `September 2026`). Most taught programs are a single September intake. Application **deadlines** are usually not on the program page — see the linked apply pages (Gotchas).
- **Application code** — the `apply?course=CODE` link (e.g. `DPMCOMSCOM1`).
- **Tuition fees** — the fees table: `UK (home)` vs `International and EU`, by study mode (`Full-time (1 year)` / part‑time). UG fees are quoted **per year**; taught‑masters as a total for the program.
- **Credits / fee‑per‑credit** — York quotes a **flat** annual/total fee. Taught masters are 180 UK **CATS** credits (module credits appear in the module list); there is **no published per‑credit fee** — record credits if shown, mark fee‑per‑credit `not applicable`.
- **Entry requirements (main)** — UG: `Typical offer` + A‑level text (e.g. `AAA including Mathematics`) and `UCAS code` / `Institution code`. PG: the class‑of‑degree text (e.g. `2:2 or equivalent in Computer Science or a relevant discipline`).
- **English language** — the IELTS/TOEFL/PTE/Duolingo/Cambridge/Oxford ELLT/LanguageCert/Trinity table, each with its minimum overall + per‑component score. Note the "requirements vary by academic department" caveat.
- **Curriculum** — under `Course content` (`#course-content`): **Core modules** = mandatory, **Option modules** = optional. Capture both lists.
- **Scholarships / funding, careers, department, contacts** — funding links (`/study/postgraduate-taught/funding/…`, Chevening, alumni discount, Master's loan), the `Careers`/`Your career` section text, and admissions contact.

### 3. Enrich from the shared "global" pages (detail not on the program page)

- **Per‑country entry + English requirements & waivers** — `https://www.york.ac.uk/study/international/your-country/{country}/` (107 countries; index at `.../your-country/`). Gives the country‑specific degree equivalence and English waiver conditions. These are **generally not linked from the program page** — map by country slug yourself.
- **Global English‑language requirements & waivers** — PG: `https://www.york.ac.uk/study/postgraduate-taught/apply/international/english/`. Lists accepted tests and the blanket **waiver** rules (majority‑English‑speaking country per UKVI, or a prior degree taught in the UK/Ireland/approved country).
- **Home vs international fee status** — `https://www.york.ac.uk/study/postgraduate-taught/fees/status/`.
- **Application deadlines** — the `apply` sub‑pages linked from `Next steps` (deadlines are typically rolling; York taught programs commonly close when full rather than on a fixed date).

### 4. Emit JSON

One object per program, matching **Expected Output**. Text‑based values are fine; leave a field `null` / `"not stated"` when the site doesn't publish it (common for GRE/GMAT/SAT and per‑course rankings — see Gotchas).

### Browser fallback

If HTTP fetch is ever throttled, drive a remote session instead — this was validated end‑to‑end (2 consecutive runs, identical output, ~$0.16 / 5 turns each):

```bash
sid=$(browse cloud sessions create --keep-alive | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const i=s.indexOf('{');process.stdout.write(JSON.parse(s.slice(i)).id)})")
browse open "https://www.york.ac.uk/study/postgraduate-taught/courses/msc-advanced-computer-science/" --remote --session "$sid"
browse snapshot            # single snapshot exposes every field above (≈700 refs)
browse get markdown body   # or grab clean text
browse cloud sessions update "$sid" --status REQUEST_RELEASE
```

No `--verified` / `--proxies` needed. A single `browse snapshot` on the program page contains the entire detail set — you do not need to click or scroll to read fees, English requirements or modules.

## Site-Specific Gotchas

- **PG path mismatch is the #1 trap.** Program pages live under `/study/postgraduate-taught/courses/{slug}/`, but the catalogue and apply widgets frequently emit `/study/postgraduate/courses/{slug}` — that path **404s or redirects**. `msc-computer-science` gives 404; the real page is `msc-advanced-computer-science`. Always take program URLs from the `?mode=taught` index and prefer the `postgraduate-taught` host path.
- **Duration options are spread across sibling course pages, not one page.** "with a year in industry / year abroad / placement" and part‑time are separate program URLs. To capture *all* duration options for a subject you must follow the related‑course links, each carrying its own `Length` and fee line.
- **No per‑credit fees.** York publishes flat annual (UG) or total (PGT) tuition. Modules carry UK **CATS** credits (masters = 180) but there is no fee‑per‑credit — don't fabricate one; mark `not applicable`.
- **GRE / GMAT / SAT: generally not required.** UK taught masters at York do not ask for GRE/GMAT, and SAT is not used for UK admissions. Pages simply omit them — record `"not required / not stated"` rather than leaving the reader guessing.
- **English waivers live off‑page.** The blanket waiver logic (majority‑English‑speaking country per UKVI, or a degree previously taught in English in an approved country) is on the global English page and the per‑country pages — **not** the program page. English score requirements can also "vary by academic department", so the program page table is authoritative for that specific course.
- **Per‑country entry pages are often unlinked from the program.** Discover them by slug at `/study/international/your-country/{country}/` (index lists all 107); don't rely on a link from the course.
- **Intakes/deadlines are thin on the page.** Expect a single `September` start and *no* explicit deadline on most program pages — deadlines are rolling / "apply before it fills". Look under `Next steps → Apply` for the authoritative apply route.
- **Rankings are institution‑level, not per‑course.** Program pages only carry the site‑wide "Russell Group" mention; numeric rankings (subject/global) are on York's separate rankings/about pages, not the course page. Populate `ranking` from there or mark `"not on course page"`.
- **JSON‑LD is minimal.** Each page has one `schema.org/Course` block, but it only holds `name`, `description`, `provider` — fees, modules and requirements are HTML‑only. Use JSON‑LD just to confirm the canonical name.
- **Anti‑bot: none.** Cloudflare fronts the site (`Cf-Ray`, `cf-cache-status` headers) but there is no JS challenge or captcha; bare `browse cloud fetch` (no proxies, no `--verified`) returns `200` with fully rendered HTML. Content is server‑side rendered — a browser is unnecessary.

## Expected Output

One JSON object per program. Values may remain free text.

```json
{
  "success": true,
  "level": "postgraduate-taught",
  "program_name": "MSc Advanced Computer Science",
  "award": "MSc",
  "department": "Department of Computer Science",
  "url": "https://www.york.ac.uk/study/postgraduate-taught/courses/msc-advanced-computer-science/",
  "application_code": "DPMCOMSCOM1",
  "apply_url": "https://www.york.ac.uk/study/postgraduate/courses/apply?course=DPMCOMSCOM1",

  "duration_options": ["1 year full-time"],
  "intakes": [
    { "start": "September 2026", "application_deadline": "rolling / not stated on course page" }
  ],

  "tuition_fee": {
    "study_mode": "Full-time (1 year)",
    "uk_home": "£13,900",
    "international": "£32,900",
    "basis": "total for the programme"
  },
  "credits": { "total": "180 CATS (typical for taught masters)", "fee_per_credit": "not applicable" },

  "curriculum": {
    "core_mandatory": ["Research Methods in Computer Science"],
    "option_optional": [
      "Autonomous Robots", "Quantum Computing", "Network Security",
      "Cryptography Theory and Applications", "Cloud Based Data Analysis", "..."
    ]
  },

  "entry_requirements": {
    "main": "2:2 or equivalent in Computer Science or a relevant discipline; strong background in programming, maths, software engineering and basic algorithms. Equivalent international qualifications accepted.",
    "per_country_source": "https://www.york.ac.uk/study/international/your-country/{country}/"
  },

  "english_language": {
    "tests": [
      { "test": "IELTS (Academic and Indicator)", "score": "6.5, minimum 6.0 in each component" },
      { "test": "TOEFL iBT", "score": "87, minimum 21 in each component" },
      { "test": "PTE Academic", "score": "61, minimum 55 in each component" },
      { "test": "Duolingo", "score": "120, minimum 105 in all other components" },
      { "test": "Cambridge CEFR", "score": "B2 First: 176, with 169 in each component" }
    ],
    "waivers": "Waived for nationals of majority English-speaking countries (UKVI list) or applicants with a prior degree taught in the UK/Ireland/approved country. Full rules: https://www.york.ac.uk/study/postgraduate-taught/apply/international/english/",
    "note": "English requirements can vary by academic department; the course-page table is authoritative for this program."
  },

  "admission_tests": { "gre": "not required", "gmat": "not required", "sat": "not applicable (UK)" },

  "scholarships_funding": [
    "https://www.york.ac.uk/study/postgraduate-taught/funding/uk/",
    "https://www.york.ac.uk/study/postgraduate-taught/funding/international/",
    "https://www.york.ac.uk/study/postgraduate-taught/funding/international/chevening-scholarship/",
    "https://www.gov.uk/masters-loan"
  ],
  "careers": "Section text on graduate destinations / employability (verbatim from the Careers tab).",
  "ranking": "Institution-level only on site (Russell Group). Numeric subject/global rankings not on course page — see York rankings page.",

  "error_reasoning": null
}
```

Undergraduate pages follow the same shape with a few different fields: `ucas_code` + `institution_code`, `entry_requirements.main` as a `Typical offer` (e.g. `"AAA including Mathematics"`), `tuition_fee.basis: "per year"`, and `duration_options` that include placement/abroad variants (e.g. `["3 years full-time", "4 years full-time (with a year in industry)"]`).

On failure:

```json
{ "success": false, "url": "…", "error_reasoning": "404 — used /study/postgraduate/courses/ path instead of /study/postgraduate-taught/courses/" }
```
