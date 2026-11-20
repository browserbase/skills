---
name: azgfd-com-azgfd-hunting-intel-extraction-3h15t2
title: AZGFD Hunting Intel Extraction
description: >-
  Extract current Arizona Game and Fish Department hunting intel — regulation
  PDFs by species, next/last draw deadlines, draw results, CWD status,
  commission meeting agendas, Mexican gray wolf population counts, habitat
  closures, and pending Article 3/4/10 rule changes. Read-only.
website: azgfd.com
category: hunting-and-wildlife
tags:
  - hunting
  - wildlife
  - regulations
  - arizona
  - azgfd
  - cloudflare
  - read-only
source: 'browserbase: agent-runtime 2026-05-29'
updated: '2026-05-29'
recommended_method: browser
alternative_methods:
  - method: fetch
    rationale: >-
      Once a PDF URL is known, the
      azgfd-portal-wordpress-pantheon.s3.us-west-2.amazonaws.com bucket is plain
      AWS S3 with no Cloudflare and serves PDFs to a bare HTTP fetch. Use
      'browse cloud fetch <pdf-url> --proxies' for known-URL refresh. The HTML
      pages on www.azgfd.com and draw.azgfd.com sit behind a Cloudflare managed
      challenge — fetch-only is not viable there.
  - method: api
    rationale: >-
      AZGFD does not publish a public REST/GraphQL API for hunting intel. A
      WordPress search endpoint exists at /wp-json/wp/v2/search but is
      rate-limited and unreliable; Browserbase Search (browse cloud search
      'site:azgfd.com …') is the practical substitute for discovery.
verified: true
proxies: true
---
# AZGFD Hunting Intel Extraction

## Purpose

Pull a structured snapshot of *current* hunting intelligence from the Arizona Game and Fish Department (AZGFD) — season regulations PDFs by species, the next/last draw deadlines and most recent draw results, Chronic Wasting Disease (CWD) detection status, the next and most-recent commission meeting (with agenda PDF), predator management updates (Mexican gray wolf population count, mountain lion), habitat / road / access closures, and any pending or just-effected rule changes (Article 3 / Article 4 / Article 10).

The skill is **read-only**: it discovers and reads canonical pages, regulation PDFs, news releases, and commission agendas. It must never apply for a draw, purchase a license, or submit harvest reports.

## When to Use

- A hunter-facing agent answering "what's open right now in Arizona?" or "what's the next big-game draw deadline?"
- A regulatory intelligence agent monitoring Arizona's pending rule packages (Article 3/4/10), Article amendments effective dates, and Governor's Regulatory Review Council (GRRC) status.
- A wildlife / conservation news agent tracking Mexican wolf annual population counts and Q1–Q4 wolf incident updates.
- A road / access agent surfacing fire-related, breeding-season, or hatchery closures that affect hunters.
- Periodic refresh of an "AZGFD dashboard" tile in a wider hunting-state catalog.

Do **not** use this for: shopping for a guide, individual draw-odds lookup by hunt code (use a separate `draw.azgfd.com` lookup skill), license purchase, harvest reporting, or pulling the *full text* of regulation PDFs (this skill returns the PDF URL + publish date; downstream consumers parse the PDF body).

## Workflow

The AZGFD site is **Cloudflare-protected** with a managed challenge that fires on bare HTTP fetches. Every endpoint below — `www.azgfd.com`, `draw.azgfd.com`, the `azgfd-portal-wordpress-pantheon.s3.us-west-2.amazonaws.com` PDF host (this one is open, no CF) — must be reached either from a stealthed Browserbase session, or, for the AWS S3 PDF host, with a plain HTTP fetch.

There is no public REST/GraphQL API. AZGFD does ship a sitemap (`https://www.azgfd.com/sitemap_index.xml`), which is useful for URL discovery, but the structured intel itself lives in HTML news posts and on a handful of canonical pages.

### 1. Start a stealthed remote session

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$SID"
```

Both `--verified` and `--proxies` are required — a bare session is fronted by Cloudflare's "Just a moment…" challenge HTML.

### 2. Walk the canonical pages (single session — they're all behind the same CF cookie once warm)

For each page below: `browse open <url> --remote`, then `browse wait timeout 6000 --remote` (the CF challenge resolves in 4–7s on first hit), then `browse get markdown body --remote` and parse:

| Intel category | Canonical URL | What to extract |
|---|---|---|
| Regulation PDFs (by species/season) | `https://www.azgfd.com/hunting/regulations/` | Year-stamped PDF URLs on `azgfd-portal-wordpress-pantheon.s3.us-west-2.amazonaws.com`. The hash directory in the URL is the upload timestamp (e.g. `…/2026/05/04081122/…` = uploaded 2026-05-04 at 08:11:22). |
| Current draw deadline + portal | `https://draw.azgfd.com/` | Countdown banner + the explicit deadline ("The 2026 Fall Draw deadline is 6/2/2026 11:59:59 PM MST."). |
| Commission meetings list | `https://www.azgfd.com/about-arizona-game-fish/commission-public-information/about-the-commission/commission-agendas/` | One row per meeting, year-bucketed. Each row links to a per-meeting agenda PDF. Most-recent past meeting = first row whose date ≤ today; next meeting = first row whose date > today. |
| Commission meeting minutes / videos | `https://www.azgfd.com/about-arizona-game-fish/commission-public-information/about-the-commission/commission-meeting-minutes/` | Year-bucketed; each row links audio MP3 + YouTube video. **Use this page for "what did they vote on" — watch the linked YouTube video, since PDF minutes are usually not posted (only audio).** |
| CWD status | `https://www.azgfd.com/wildlife-conservation/wildlife-diseases-2/chronic-wasting-disease-what-hunters-should-know/` | First paragraph states current detection status ("CWD has not been detected in Arizona's deer or elk"). The latest Annual CWD Report PDF is linked here ("FY 2024 Chronic Wasting Disease Report" or newer). |
| Mexican wolf management | `https://www.azgfd.com/wildlife-conservation/conservation-and-endangered-species-programs/mexican-wolf-management/` | Program landing page; links to Q1–Q4 updates and the annual population count. |
| Mountain lion | `https://www.azgfd.com/species/mountain-lion/` (species page) and `https://www.azgfd.com/wildlife-conservation/living-with-wildlife/living-with-mountain-lions/` (living-with page) | Status text + harvest reporting reference. |

### 3. Pull the latest news posts for emergency closures, pending rules, predator updates

AZGFD's WordPress front page paginates as `/<YYYY>/<MM>/<DD>/<slug>/`. Use **Browserbase Search** (`browse cloud search "site:azgfd.com 2026 <topic>"`) to enumerate recent posts — this is much cheaper than crawling the news index. Run these queries in parallel:

```bash
browse cloud search "site:azgfd.com 2026 wolf population"          &
browse cloud search "site:azgfd.com 2026 draw results"             &
browse cloud search "site:azgfd.com 2026 amendment proposed rule"  &
browse cloud search "site:azgfd.com 2026 closure fire restriction" &
browse cloud search "site:azgfd.com 2026 commission meeting"       &
wait
```

For each top result, open with the stealthed session and pull `browse get markdown body`. Trim to the article body by slicing from the `# <Title>` line through the next `### Subscribe` heading. The publish date is in the first line of body content as `Month DD, YYYY` and matches the URL slug.

### 4. Map to species-season status

The "open / closed / upcoming" status for the seven species in the prompt is computed from the regulations PDFs, **not** from any HTML page — AZGFD does not publish a per-species "open/closed today" tile. Cite the PDF URL + the season-window quoted from the PDF's table (e.g., "Bull elk archery: 2026-09-11 through 2026-09-24") and let the consumer compute open/closed against today's date. Mapping:

| Species | Primary regulation PDF |
|---|---|
| Deer (fall) | 2026-27 Arizona Hunting Regulations |
| Elk | 2026 Pronghorn and Elk Regulations |
| Turkey (fall) | 2026-27 Arizona Hunting Regulations |
| Turkey (spring) | 2026 Spring Regulations |
| Bear (fall) | 2026-27 Arizona Hunting Regulations |
| Bear (spring) | 2026 Spring Regulations |
| Javelina (fall) | 2026-27 Arizona Hunting Regulations |
| Javelina (spring) | 2026 Spring Regulations |
| Mountain lion | 2026-27 Arizona Hunting Regulations |
| Bighorn sheep / bison (fall) | 2026-27 Arizona Hunting Regulations |
| Sandhill crane | 2026-27 Arizona Hunting Regulations |
| Dove / band-tailed pigeon | 2026-27 Arizona Dove and Band-tailed Pigeon Regulations |
| Waterfowl / snipe | 2026-27 Arizona Waterfowl and Snipe Regulations |
| Trapping | 2026-27 Trapping Regulations |
| Reptiles / amphibians | 2026-2030 Reptile and Amphibian Regulations |

### 5. Release the session

```bash
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

### Optional fast path for PDFs only (skip Cloudflare entirely)

The regulation PDF host `azgfd-portal-wordpress-pantheon.s3.us-west-2.amazonaws.com` is a plain AWS S3 bucket with no CF in front. Once you have a PDF URL (discovered via step 2 above, or carried over from a prior run), `browse cloud fetch <pdf-url> --proxies` (or even bare `curl`) works — no stealthed browser needed. This is the cheapest path when the goal is to *re-fetch* a known PDF rather than discover a new one.

## Site-Specific Gotchas

- **Cloudflare managed challenge.** Bare `browse cloud fetch https://azgfd.com/` returns HTTP 403 with the `cf-mitigated: challenge` header. `--verified --proxies` on a Browserbase session passes the challenge automatically but takes 4–7 seconds on the first hit per session; subsequent navigations in the same session are cookie-bound and fast (`__cf_bm` cookie). Budget the warm-up cost into the first page load.
- **`get markdown body` returns the full page including the Google Translate language picker** — a ~5KB tail of every language name in every language. Slice from `# <Page Title>` to `### Subscribe to our Newsletter` to get the actual article body.
- **`commission-meeting-agendas/` (with the `s`) is a 404 trap.** The canonical URL is `commission-agendas/` (no `meeting-`). The site exposes the shortcut `https://www.azgfd.com/commagenda` which redirects to the right slug — prefer the shortcut when hand-coding.
- **`/commission` and `/commagenda` shortcuts.** Several news posts reference `www.azgfd.gov/commission` and `www.azgfd.gov/commagenda` (note `.gov`, not `.com`). These redirect to the `.com` canonical pages; following them works, but cache the resolved `.com` URL in your output for stability.
- **Most-recent commission action is in the YouTube video, not in a PDF.** The minutes page lists `[video][audio]` links per meeting but rarely a PDF transcript. To know what the commission *voted on*, transcribe the linked YouTube video or read the next-cycle agenda which references the prior meeting's motions. Workshop meetings (Nov 6–7 retreats, May 12–13 Sipe WLA workshops) *do* get a PDF.
- **Two parallel CWD URLs exist.** `https://www.azgfd.com/wildlife/wildlife-diseases/cwd/` 404s sometimes; the live canonical is `https://www.azgfd.com/wildlife-conservation/wildlife-diseases-2/chronic-wasting-disease-what-hunters-should-know/`. The `wildlife-diseases-2` segment (with the `-2`) is correct — it's not a typo or staging artifact.
- **CWD status as of 2026-05-29:** Arizona reports "CWD has not been detected in Arizona's deer or elk" on the canonical CWD page. The latest published surveillance report is the FY 2024 Annual CWD Report (uploaded 2024-07-08) and the Final 2024-2025 Annual CWD Report (uploaded 2025-07-02 to the S3 host). If you discover a *positive* detection news post, surface it under `closures_and_restrictions` with the post URL and date — do not silently flip the status field.
- **PDF upload date is encoded in the S3 URL path.** Pattern: `…/<YYYY>/<MM>/<DDHHMMSS>/<filename>.pdf`. E.g. `2026/05/04081122` = 2026-05-04 08:11:22 UTC. This is more reliable than the PDF's own metadata because the page surrounding the link may not be re-dated when the PDF is re-uploaded.
- **`draw.azgfd.com` is a separate app on a separate hostname.** It has its own CF posture but the same `--verified --proxies` stealth passes. Do NOT navigate past the cookies banner — clicking "Enter the Draw" starts an application. Reading the homepage countdown is sufficient.
- **The `accounts.azgfd.com` portal is the only place individual draw results appear** ("A customer's AZGFD portal account is the only source for finding out draw results and viewing bonus points" — from the 2026 elk/pronghorn draw release). This skill cannot retrieve per-applicant draw results; it can only confirm that aggregate draw results have been released by linking the news post.
- **Tag mail dates are written in news posts, not in any structured field.** E.g. "AZGFD expects to mail hunt permit-tags to customers by April 1" appeared in the 2026-02-23 release. Surface as `tag_mail_date` if present in the most recent draw-results post.
- **Article 3 vs Article 4 vs Article 10.** Article 3 = taking wildlife (live trapping, possession). Article 4 = live wildlife (pets/captive wildlife, falconry, desert tortoise). Article 10 = OHV. Pending rule packages are filed under each article separately. As of 2026-05-29: Article 4 amendments effective 2026-02-26; Article 10 amendment process began 2025-10-03. Always cite the specific article when surfacing a "pending regulation" finding.
- **`live-azgfd-main.pantheonsite.io` and `dev-azgfd-main.pantheonsite.io` URLs appear in some inline links.** These are Pantheon staging hostnames that the WordPress editor sometimes embeds; they resolve but are not stable. Rewrite to `www.azgfd.com` paths when storing.
- **Site search box returns the WordPress search REST endpoint** — flaky and rate-limited. Use Browserbase Search (`browse cloud search "site:azgfd.com …"`) instead; it indexes the same content far more reliably.

## Expected Output

Returned as a single JSON object keyed by intel category. Field-level honesty: any field whose source page returned a Cloudflare wall, a 404, or didn't surface the requested data must be `null` with the cause noted in `error_reasoning`.

```json
{
  "success": true,
  "fetched_at": "2026-05-29",
  "regulations": {
    "2026-27_arizona_hunting": {
      "url": "https://azgfd-portal-wordpress-pantheon.s3.us-west-2.amazonaws.com/wp-content/uploads/2026/05/04081122/2026-27-Arizona-Hunting-Regulations.pdf",
      "uploaded": "2026-05-04",
      "covers": ["deer", "fall_turkey", "fall_javelina", "bighorn_sheep", "fall_bison", "fall_bear", "mountain_lion", "sandhill_crane"]
    },
    "2026_pronghorn_elk": {
      "url": "https://azgfd-portal-wordpress-pantheon.s3.us-west-2.amazonaws.com/wp-content/uploads/2025/12/23143704/2026-Pronghorn-and-Elk-Regulations_251223.pdf",
      "uploaded": "2025-12-23",
      "covers": ["pronghorn", "elk"]
    },
    "2026_spring": {
      "url": "https://azgfd-portal-wordpress-pantheon.s3.us-west-2.amazonaws.com/wp-content/uploads/2025/09/05122248/2026-Spring-Regulations_250908.pdf",
      "uploaded": "2025-09-08",
      "covers": ["spring_turkey", "spring_javelina", "spring_bison", "spring_bear", "raptor_capture"]
    },
    "2026-27_dove_pigeon": {
      "url": "https://azgfd-portal-wordpress-pantheon.s3.us-west-2.amazonaws.com/wp-content/uploads/2026/05/04082836/2026-27-Dove-and-Pigeon-Regulations.pdf",
      "uploaded": "2026-05-04"
    },
    "2026-27_waterfowl_snipe": {
      "url": "https://azgfd-portal-wordpress-pantheon.s3.us-west-2.amazonaws.com/wp-content/uploads/2026/05/04082841/2026-27-Waterfowl-and-Snipe-Regulations_web.pdf",
      "uploaded": "2026-05-04"
    },
    "2026-27_trapping": {
      "url": "https://azgfd-portal-wordpress-pantheon.s3.us-west-2.amazonaws.com/wp-content/uploads/2026/05/04082322/2026-27-Trapping-Regulations.pdf",
      "uploaded": "2026-05-04"
    },
    "2026-2030_reptile_amphibian": {
      "url": "https://azgfd-portal-wordpress-pantheon.s3.us-west-2.amazonaws.com/wp-content/uploads/2026/04/13163158/2026-2030-Reptile-and-Amphibian-Regulations_260413.pdf",
      "uploaded": "2026-04-13"
    }
  },
  "draw": {
    "next_deadline": {
      "hunt_cycle": "2026 Fall (deer, turkey, javelina, bighorn sheep, bison, sandhill crane)",
      "deadline_local": "2026-06-02T23:59:00-07:00",
      "source_url": "https://draw.azgfd.com/",
      "announcement_url": "https://www.azgfd.com/2026/05/12/apply-now-for-the-fall-draw/",
      "announcement_date": "2026-05-12"
    },
    "most_recent_results": {
      "hunt_cycle": "2026 pronghorn and elk",
      "announcement_url": "https://www.azgfd.com/2026/02/23/elk-pronghorn-draw-results-available/",
      "announcement_date": "2026-02-23",
      "results_portal": "https://accounts.azgfd.com/",
      "tag_mail_date": "2026-04-01",
      "etag_opt_in_deadline": "2026-02-17",
      "leftover_tags_url": "https://www.azgfd.com/2026/03/09/leftover-permit-tags-remain-for-2026-elk-hunts/"
    },
    "spring_2026_results": {
      "announcement_url": "https://www.azgfd.com/2025/10/24/2026-spring-hunt-draw-results-available/",
      "announcement_date": "2025-10-24",
      "leftover_tags_url": "https://www.azgfd.com/2025/10/27/leftover-permit-tags-remain-for-2026-spring-hunts/"
    }
  },
  "cwd": {
    "detection_status": "Not detected in Arizona's deer or elk as of 2026-05-29",
    "status_source_url": "https://www.azgfd.com/wildlife-conservation/wildlife-diseases-2/chronic-wasting-disease-what-hunters-should-know/",
    "latest_annual_report": {
      "url": "https://azgfd-portal-wordpress-pantheon.s3.us-west-2.amazonaws.com/wp-content/uploads/2025/07/02143059/Final-2024-2025_Annual-CWD-Report.pdf",
      "uploaded": "2025-07-02"
    },
    "response_plan": {
      "url": "https://azgfd-portal-wordpress-pantheon.s3.us-west-2.amazonaws.com/wp-content/uploads/2023/06/23143039/2023CWDResponsePlan.pdf",
      "uploaded": "2023-06-23"
    },
    "workshops_news_url": "https://www.azgfd.com/2025/07/25/register-now-for-cwd-workshops-statewide-3/"
  },
  "commission": {
    "next_meeting": null,
    "most_recent_meeting": {
      "date": "2026-05-08",
      "agenda_url": "https://azgfd-portal-wordpress-pantheon.s3.us-west-2.amazonaws.com/wp-content/uploads/2026/04/27155312/May-8-2026-Commission-Agenda.pdf",
      "video_url": "https://www.youtube.com/watch?v=Z8yb7TmCz1M",
      "audio_url": "https://dev-azgfd-main.pantheonsite.io/wp-content/uploads/2026/05/May-2026-AUDIO-Commisison-Meeting_WEB.mp3"
    },
    "most_recent_workshop": {
      "date_range": "2026-05-12 / 2026-05-13",
      "minutes_pdf": "https://azgfd-portal-wordpress-pantheon.s3.us-west-2.amazonaws.com/wp-content/uploads/2026/05/20085315/260518-Commission-Workshop-Minutes-Sipe-WLA.pdf",
      "location_hint": "Sipe WLA"
    },
    "agendas_index_url": "https://www.azgfd.com/about-arizona-game-fish/commission-public-information/about-the-commission/commission-agendas/",
    "minutes_index_url": "https://www.azgfd.com/about-arizona-game-fish/commission-public-information/about-the-commission/commission-meeting-minutes/",
    "shortcut_urls": ["https://www.azgfd.com/commagenda", "https://www.azgfd.gov/commission"],
    "recent_meetings_2026": [
      {"date": "2026-05-08", "agenda_url": "https://azgfd-portal-wordpress-pantheon.s3.us-west-2.amazonaws.com/wp-content/uploads/2026/04/27155312/May-8-2026-Commission-Agenda.pdf"},
      {"date": "2026-04-10", "agenda_url": "https://azgfd-portal-wordpress-pantheon.s3.us-west-2.amazonaws.com/wp-content/uploads/2026/04/08154223/April-10-2026-Commission-Agenda-Updated.pdf"},
      {"date": "2026-03-13", "agenda_url": "https://azgfd-portal-wordpress-pantheon.s3.us-west-2.amazonaws.com/wp-content/uploads/2026/03/02110351/March-13-2026-Commission-Agenda.pdf", "location": "Sierra Vista Fire Department Station #3"},
      {"date": "2026-02-06", "agenda_url": "https://azgfd-portal-wordpress-pantheon.s3.us-west-2.amazonaws.com/wp-content/uploads/2026/02/04102946/February-6-2026-Commission-Agenda-Revised.pdf"},
      {"date": "2026-01-16", "agenda_url": "https://azgfd-portal-wordpress-pantheon.s3.us-west-2.amazonaws.com/wp-content/uploads/2026/01/06163134/January-16-2026-Commission-Agenda.pdf"}
    ]
  },
  "predator_management": {
    "mexican_gray_wolf": {
      "minimum_population_end_of_2025": 319,
      "minimum_population_end_of_2024": 286,
      "trend": "increase for more than a decade",
      "as_of_announcement_date": "2026-02-25",
      "announcement_url": "https://www.azgfd.com/2026/02/25/mexican-wolf-population-count-complete/",
      "program_landing_url": "https://www.azgfd.com/wildlife-conservation/conservation-and-endangered-species-programs/mexican-wolf-management/",
      "most_recent_quarterly_update_url": "https://www.azgfd.com/2025/10/23/mexican-wolf-q3-2025-update-july-august-september/",
      "fostering_status_url": "https://www.azgfd.com/2025/06/02/mexican-wolf-fostering-efforts-complete-for-2025/"
    },
    "mountain_lion": {
      "species_page": "https://www.azgfd.com/species/mountain-lion/",
      "living_with_page": "https://www.azgfd.com/wildlife-conservation/living-with-wildlife/living-with-mountain-lions/",
      "harvest_reporting_url": "https://www.azgfd.com/hunting/hunt-draw-and-licenses/harvest-reporting/harvest-reporting-tracking/"
    }
  },
  "closures_and_restrictions": [
    {
      "title": "Check forest road closures before Kaibab deer hunt",
      "url": "https://www.azgfd.com/2025/08/18/check-road-closures-before-kaibab-archery-deer-hunt/",
      "date": "2025-08-18",
      "summary": "Pre-hunt advisory pointing to Kaibab National Forest road closures for the archery deer hunt; defers to USFS for the live closure list."
    },
    {
      "title": "Closures benefit eagles during breeding season",
      "url": "https://www.azgfd.com/2025/12/02/closures-benefit-eagles-during-breeding-season-2/",
      "date": "2025-12-02",
      "summary": "Seasonal bald eagle breeding area closures — affect access (boating/hiking) but not hunt unit boundaries."
    },
    {
      "title": "Pilot project to protect fish begins at Canyon Lake",
      "url": "https://www.azgfd.com/2026/02/26/pilot-project-to-protect-fish-begins-at-canyon-lake/",
      "date": "2026-02-26",
      "summary": "Canyon Lake access restriction tied to a fisheries pilot — not hunt-relevant but surfaces on closure searches."
    }
  ],
  "pending_or_recent_regulation_changes": [
    {
      "title": "Amended Article 4 (Live Wildlife) rules now in effect",
      "url": "https://www.azgfd.com/2026/02/26/amended-article-4-rules-now-in-effect/",
      "date_effective": "2026-02-26",
      "approval_path": "Approved by AZGFD Commission Sept 2025; subsequently by GRRC",
      "summary": "R12-4-406, R12-4-407 (one desert tortoise/person, max four/household, males/females housed separately), R12-4-421 (Wildlife Service License), R12-4-422 (sport falconry), R12-4-430 (cervid records). Laws and Rules Book updated Feb 2026 edition.",
      "laws_and_rules_book_pdf": "https://azgfd-portal-wordpress-pantheon.s3.us-west-2.amazonaws.com/wp-content/uploads/2026/02/09154801/26-0209-Laws-and-Rules-Book.pdf"
    },
    {
      "title": "AZGFD begins process to amend Article 10 (OHV) rules",
      "url": "https://www.azgfd.com/2025/10/03/azgfd-begins-process-to-amend-article-10-rules/",
      "date": "2025-10-03",
      "summary": "Five-year review triggered amendment process for Article 10. Public comment cycle and GRRC review pending."
    },
    {
      "title": "Proposed hunt recommendations ready for review (2026 pronghorn, elk, pop-management; 2026-27 Copper State Draws)",
      "url": "https://www.azgfd.com/2025/11/20/proposed-hunt-recommendations-ready-for-review-7/",
      "date": "2025-11-20",
      "comment_email": "AZHuntGuidelines@azgfd.gov",
      "presented_to_commission": "2025-12-05",
      "summary": "Annual hunt-structure recommendations published for public review. Hunt guidelines process: https://www.azgfd.com/hunting/regulations/hunt-guidelines-process/"
    }
  ],
  "error_reasoning": null
}
```

If the next commission meeting is unknown (the agendas page lists past meetings only and the next-meeting press release has not yet been published), set `commission.next_meeting` to `null` and add a note in `error_reasoning` rather than guessing the next date. Commission meets monthly except August / October / November (workshop only), so the *implicit* next meeting after a May 8 regular meeting is typically the following month — but always confirm against a fresh fetch of the agendas page.
