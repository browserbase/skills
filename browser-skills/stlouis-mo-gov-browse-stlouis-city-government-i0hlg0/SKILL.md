---
name: stlouis-mo-gov-browse-stlouis-city-government-i0hlg0
title: Browse St. Louis City Government Toolkit
description: >-
  Toolkit for retrieving up-to-date official City of St. Louis government
  information — Board of Aldermen legislation (board bills, resolutions,
  ordinances), aldermanic committees and members, board meetings and agendas,
  departments and contacts, services, permits, public notices, news, public
  records, and ward/address-related pages — all read-only via deterministic
  stlouis-mo.gov URL templates and RSS feeds.
website: stlouis-mo.gov
category: government
tags:
  - government
  - civic
  - legislation
  - board-of-aldermen
  - saint-louis
  - read-only
  - rss
source: 'browserbase: agent-runtime 2026-05-28'
updated: '2026-05-28'
recommended_method: fetch
alternative_methods:
  - method: fetch
    rationale: >-
      Every public page is server-rendered HTML on a ColdFusion + CommonSpot CMS
      with stable query-string deep links and no anti-bot. `browse cloud fetch`
      (or curl) returns full HTML in <500ms with no proxies, stealth, or auth —
      verified across ~25 scouted endpoints on 2026-05-28.
  - method: browser
    rationale: >-
      Only required for the 'Find Your Alderman by Address' AJAX widget on the
      aldermen roster page. All other 13 sub-skills work via plain HTTP fetch.
  - method: api
    rationale: >-
      No official JSON API on stlouis-mo.gov itself, but six RSS 2.0 feeds
      (news, board bills, resolutions, calendar, jobs, RFPs) on FeedBurner are
      first-class structured-data surfaces and should be preferred over scraping
      listing pages when polling for changes.
verified: false
proxies: false
---
# Browse St. Louis City Government Toolkit

## Purpose

Toolkit for retrieving up-to-date official City of St. Louis government information — legislation (board bills, resolutions, ordinances), Board of Aldermen members and committees, meetings/agendas, departments and contacts, services, permits, news/press releases, public notices, ward and address-lookup data — directly from `stlouis-mo.gov` and its official off-platform calendar portal. Every sub-skill is read-only: it returns structured JSON with `source_url`, page title, dates, department, and document links. No form submission, no account login, no payment, no PII workflows.

Hermes Agent (or any caller) gets a single bundle of 14 named sub-workflows below, each with deterministic URL templates that work via `browse cloud fetch` (cheap HTTP) or `curl` — no JS rendering, no proxies, no stealth required on this site.

## When to Use

- Ward office staff needing the latest version of a board bill, resolution, ordinance, or committee assignment.
- Looking up who an alderperson is, their committees, sponsored bills, voting record, or contact info.
- Finding next/upcoming Board of Aldermen meetings, committee meetings, and agenda packets.
- Locating department or office contact pages (phone, address, contact form).
- Resolving a service / permit / license to its canonical Service-Catalog page on the City site.
- Pulling press releases, news, and recent announcements from departmental news feeds.
- Triaging a public notice or public meeting on the City calendar.
- Extracting structured fields from any City page (title, published date, last-updated date, department, body, document attachments).
- Producing a short, faithful summary of any City page, including a "stale / PDF-only / archived" warning when appropriate.

## Workflow

The City of St. Louis website is a **CommonSpot CMS-driven ColdFusion site** (`*.cfm`) with stable, query-string-driven deep links. All public pages are server-rendered HTML, anonymously cacheable, and return clean status codes — no Akamai/Cloudflare anti-bot, no JavaScript-only renders, no auth required. **Prefer plain `browse cloud fetch <url>` (or `curl`) over scripted browsing.** Use a Browserbase session only when you need to render the `Find Your Alderman` address-lookup widget (the only AJAX surface observed in scouting). For all other workflows the static URL templates below return everything an agent needs.

### Universal helpers (used by all sub-skills)

- **HTTP cost model**: bare `fetch` returns 200 with full HTML in ~150–400 ms. No proxies/stealth needed (verified by scouting iter on 2026-05-28 — see Site-Specific Gotchas).
- **Text extraction recipe** (Node.js, ~5 lines):
  ```js
  const text = html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ").trim();
  ```
- **OpenGraph metadata** is on every page. Extract published / modified timestamps from these meta tags rather than trusting heuristics:
  - `<meta property="og:article:published_time" content="2026-05-14:10:05">`
  - `<meta property="og:article:modified_time" content="...">`
  - `<meta property="og:url" content="...">` — canonical URL.
  - `<meta property="og:title">` and `<meta name="Description">`.
- **Department breadcrumb**: every City page has a `<nav aria-label="breadcrumbs">` whose links walk `Government / Departments and Agencies / {Dept} / {SubDept} / {Page}` — use this for the `department` field.
- **PDF link pattern**: official document attachments live under `/government/city-laws/upload/legislative/...` (ordinances and board bills), under departmental `/news/...` paths, or as absolute URLs to off-site portals (e.g., `stlouismo.portal.civicclerk.com` for aldermanic meeting agendas — see Site-Specific Gotchas).
- **Encode `&` as `%26` and spaces as `+` or `%20`** when constructing query strings (the URLs use both interchangeably).

---

### 1. `search-city-site` — site-wide search

**Purpose**: Free-text search across the entire `stlouis-mo.gov` site (news, services, departments, informational pages).

**Inputs**: `q` (free-text string).

**Best URL**: `https://www.stlouis-mo.gov/searchresults.cfm?q={url-encoded-query}`

**Selectors / parsing**: Result list is in `<main>`. Each result is a heading link followed by snippet text and a "Category | Department" footer (e.g., `Informational Pages | Recovery Office`, `News and Announcements | Office of the Mayor`, `Meeting Materials | Office of the Mayor`).

**Fallback**: If `/searchresults.cfm` ever 404s, append the same `?q=` to the ordinance search at `/government/city-laws/ordinances/search.cfm` (legislation-only) — that endpoint is independent. **Do not** try `/search.cfm` (it returns the "Inactive Content" placeholder).

**Output schema**:
```json
{
  "query": "tornado recovery",
  "source_url": "https://www.stlouis-mo.gov/searchresults.cfm?q=tornado+recovery",
  "results": [
    {
      "title": "STL Recovers - 2025 Tornado Recovery",
      "snippet": "Response and recovery resources for the May 2025 City of St. Louis tornado.",
      "url": "https://www.stlouis-mo.gov/government/recovery/tornado-2025/index.cfm",
      "category": "Feature",
      "department": null,
      "date": null
    }
  ]
}
```

**Example call**: `browse cloud fetch "https://www.stlouis-mo.gov/searchresults.cfm?q=short-term+rental"`.

---

### 2. `find-board-bill` — single board bill

**Purpose**: Return full record for a board bill — title, summary, session, sponsors, co-sponsors, latest activity, full legislative history, and the resulting ordinance number (if passed).

**Inputs**: One of (a) the **internal `BBId`** integer (preferred when known), or (b) the **human `bb_number` + `session`** pair (e.g. `95`, `2025-2026`).

**Best URL** (when `BBId` known):
`https://www.stlouis-mo.gov/government/city-laws/board-bills/boardbill.cfm?bbDetail=true&BBId={BBId}`

**Resolving `bb_number` + `session` → `BBId`** (the human number alone is *not* a stable URL parameter — confirmed in scouting; `?bbNum=1&session=2025-2026` redirects to the session-index page, not a single bill). Fetch the session index and scan for the matching row:
1. `GET https://www.stlouis-mo.gov/government/city-laws/board-bills/index.cfm?Session={YYYY-YYYY}` (omit `?Session=...` for current session — defaults to it).
2. Find the row `<a href="boardbill.cfm?bbDetail=true&BBId={N}">BB {bb_number}</a>` matching your `bb_number`.
3. Use that `BBId` for the detail fetch.

**Fields to extract** from the detail page (consistent across all observed bills):
- H1: `Board Bill {N} -- {Title}` (title is everything after ` -- `).
- "Summary" paragraph.
- "Overview" block (free-form key/value pairs separated by newlines):
  - `Session: 2025-2026`
  - `Board Bill Number: 95`
  - `Introduced: MM/DD/YYYY` (or `Effective: MM/DD/YYYY` once passed)
  - `Primary Sponsors: {comma-separated names}`
  - `Latest Activity: {label}` (e.g., `Committee Hearing`, `Engrossment`)
  - `Co-Sponsors: {comma-separated names}`
- "Legislative History" table — dated activity rows: First Reading, Referred to a Committee, Committee Hearing, Second Reading, Perfection, Engrossment, Third Reading, Delivered to Mayor, Mayor Returns Bill, Delivered to Register, Register Returns Notice with Ordinance Number.
- Bill-text PDF link: `<a href="...{.pdf}">Bill text was introduced</a>` — preserve full URL (these are under `/government/city-laws/upload/legislative/boardbills/introduced/`).
- "Topics" — list of subject tags.

**Fallback strategy**: If `BBId` resolution fails (e.g., bill number doesn't exist in the requested session), return `{ "success": false, "reason": "bb_not_found", "session": "...", "bb_number": ... }` and surface the session-index URL so the caller can hand it to a human. **Do not guess `BBId` values** — they are non-monotonic across sessions.

**Output schema**:
```json
{
  "success": true,
  "source_url": "https://www.stlouis-mo.gov/government/city-laws/board-bills/boardbill.cfm?bbDetail=true&BBId=16856",
  "bb_id": 16856,
  "bb_number": 1,
  "session": "2026-2027",
  "title": "City Annual Budget FY2027",
  "summary": "The proposed bill makes an appropriation for payment of...",
  "introduced_date": "2026-05-01",
  "effective_date": null,
  "primary_sponsors": ["President Megan E. Green"],
  "co_sponsors": ["Rasheen Aldridge"],
  "latest_activity": "Committee Hearing",
  "ordinance_number": null,
  "bill_text_pdf": "https://www.stlouis-mo.gov/government/city-laws/upload/legislative/boardbills/introduced/...pdf",
  "topics": [],
  "legislative_history": [
    { "date": "2026-05-01", "event": "First Reading", "detail": "Bill text was introduced" },
    { "date": "2026-05-01", "event": "Referred to a Committee", "detail": "Budget and Public Employees Committee" }
  ]
}
```

---

### 3. `search-legislation` — list/filter legislation

**Purpose**: Browse board bills, resolutions, or ordinances in a given session, optionally filtered by sponsor.

**Inputs**: `kind` (`"board-bills" | "resolutions" | "ordinances"`), `session` (e.g. `2025-2026`), optional `sponsor_name`.

**Best URL**:
- Board bills: `https://www.stlouis-mo.gov/government/city-laws/board-bills/index.cfm?Session={YYYY-YYYY}`
- Resolutions: `https://www.stlouis-mo.gov/government/city-laws/resolutions/index.cfm?Session={YYYY-YYYY}`
- Ordinances by topic: `https://www.stlouis-mo.gov/government/city-laws/ordinances/topic.cfm`
- Ordinances by alderman: `https://www.stlouis-mo.gov/government/city-laws/ordinances/alderman.cfm`
- Board bill votes (by-bill): `https://www.stlouis-mo.gov/government/city-laws/board-bills/votes/board-bill.cfm?Session={YYYY-YYYY}`
- Board bill votes (by-alderman): `https://www.stlouis-mo.gov/government/city-laws/board-bills/votes/alderman.cfm?Session={YYYY-YYYY}`

**Selectors**: The board-bill and resolution session indexes render a single HTML table with columns `BB#`, `Title`, `Sponsor`, `Ordinance` (4th column is empty until the bill is enacted). Extract by scanning `<a href="boardbill.cfm?bbDetail=true&BBId=...">BB {N}</a>` or `<a href="resolution.cfm?RSDetail=true&RSId=...">R {N}</a>`.

**Fallback**: For sponsor-filtered or topic-filtered searches, use either the by-alderman/by-topic ordinance pages above (which list every passed ordinance grouped by sponsor or topic) or filter client-side over the session-index table.

**Output schema**:
```json
{
  "kind": "board-bills",
  "session": "2026-2027",
  "source_url": "...",
  "count": 32,
  "items": [
    { "id": 16856, "number": 1, "title": "City Annual Budget FY2027",
      "sponsor": "President Megan E. Green", "ordinance_number": null,
      "url": "https://www.stlouis-mo.gov/government/city-laws/board-bills/boardbill.cfm?bbDetail=true&BBId=16856" }
  ]
}
```

---

### 4. `find-ordinance` — single ordinance by number

**Purpose**: Return full record for an ordinance passed by the Board of Aldermen.

**Inputs**: Ordinance number (5-digit integer, e.g. `72058`).

**Best URL**: `https://www.stlouis-mo.gov/government/city-laws/ordinances/ordinance.cfm?ord={ord}` — **the ordinance number itself IS the stable URL key.** Verified 2026-05-28.

**Search alias**: To go from a description/topic to an ordinance number, hit `https://www.stlouis-mo.gov/government/city-laws/ordinances/search.cfm?q={query}` — returns a list of matching ordinances with their `?ord=` URLs (e.g., querying `tornado` returns ordinances 72058, 72007, 72113, 72009).

**Fields to extract** (same field set as `find-board-bill`, plus):
- Official ordinance PDF: `https://www.stlouis-mo.gov/government/city-laws/upload/legislative//Ordinances/BOAPdf/{ord}.pdf` — this is the official record. **Preserve and surface this URL.**
- "Effective: MM/DD/YYYY" — the date the mayor signed the bill / ordinance took effect.
- Cross-reference: the ordinance page contains the originating board bill's `Board Bill Number` (use it as a backreference into `find-board-bill`).

**Fallback strategy**: If `?ord={ord}` returns the `Page Not Found (404)` body, the ordinance number is invalid or pre-2005 (the digital index begins with the 2005-2006 session — older ordinances are scanned-PDF-only on a separate `/government/city-laws/upload/...` archive). Surface that as `{ "success": false, "reason": "ordinance_not_indexed", "ord": ... }`.

**Output schema**:
```json
{
  "success": true,
  "source_url": "https://www.stlouis-mo.gov/government/city-laws/ordinances/ordinance.cfm?ord=72058",
  "ordinance_number": 72058,
  "title": "Tornado Relief and Recovery Fund",
  "summary": "This Board Bill recommended by the Board of Estimate and Apportionment, appropriating ...",
  "session": "2025-2026",
  "originating_bb_number": 95,
  "primary_sponsors": ["Shameem Clark Hubbard"],
  "co_sponsors": ["Matt Devoti", "Alisha Sonnier", "Michael Browning", "Laura Keys", "Rasheen Aldridge", "President Megan E Green"],
  "effective_date": "2025-11-14",
  "official_pdf_url": "https://www.stlouis-mo.gov/government/city-laws/upload/legislative//Ordinances/BOAPdf/72058.pdf",
  "topics": ["Annual Budget and Operating Plan", "Homelessness", "Housing Financial Programs", "Immunizations and Public Health"],
  "legislative_history": [ /* same shape as board bill */ ]
}
```

---

### 5. `find-board-meeting` — Board of Aldermen / committee meetings & agendas

**Purpose**: Locate upcoming and past Board of Aldermen meetings, full-Board meetings, and committee hearings, with date/time/location/agenda links.

**Inputs**: One of (a) date or date range; (b) committee name; (c) Event_ID.

**Best URLs**:
- All public meetings (current + future): `https://www.stlouis-mo.gov/events/all-public-meetings.cfm`
- All public meetings for a month: `https://www.stlouis-mo.gov/events/all-public-meetings.cfm?Calendar_Year={YYYY}&Calendar_Month={M}`
- Aldermen-only calendar: `https://www.stlouis-mo.gov/government/departments/aldermen/events/index.cfm`
- Full-board agendas archive: `https://www.stlouis-mo.gov/government/departments/aldermen/aldermanic-legislative-session.cfm`
- Single event: `https://www.stlouis-mo.gov/events/eventdetails.cfm?Event_ID={N}`
- RSS feed of all calendar events: `http://feeds.feedburner.com/CityOfStLouis-Calendar`

**Selectors**: On the listing pages, each meeting is a heading link with format `<a href="/events/eventdetails.cfm?Event_ID=N">{Title}</a>` followed by date (e.g. `May 28, 2026`) and time block. On the detail page, extract `Type`, `Admission`, `Description`, `Join Zoom Meeting` link, and any "Link to Meeting Materials" URL.

**PDF / agenda handling — Important**: **Most Board of Aldermen and committee meeting agendas, packets, and minutes are NOT on `stlouis-mo.gov`.** They live on a CivicClerk portal:
- `https://stlouismo.portal.civicclerk.com/` — public agendas, packets, minutes.
Every Aldermanic Committee Meeting detail page contains "Link to Meeting Materials … `https://stlouismo.portal.civicclerk.com/`". Hermes should treat that as the authoritative agenda source and link directly to it; the City site is a routing layer.

**Fallback strategy**: If the CivicClerk portal is unreachable or hasn't published yet, the event detail page (`eventdetails.cfm?Event_ID=N`) usually shows the meeting description, location, and Zoom dial-in — that's the minimum viable answer. Note in the output `agenda_status: "not_yet_published"` if the CivicClerk link returns no documents.

**Output schema**:
```json
{
  "events": [
    {
      "event_id": 53610,
      "title": "Health and Human Development Committee",
      "type": "Aldermanic Committee Meeting",
      "committee": "Health and Human Development",
      "starts_at": "2026-05-28T09:00:00-05:00",
      "ends_at": "2026-05-28T10:00:00-05:00",
      "location": "Zoom Webinar",
      "agenda_portal_url": "https://stlouismo.portal.civicclerk.com/",
      "zoom_url": "https://stlouis-mo-gov.zoom.us/j/85639680188",
      "description": "...",
      "source_url": "https://www.stlouis-mo.gov/events/eventdetails.cfm?Event_ID=53610",
      "agenda_status": "linked_external"
    }
  ]
}
```

---

### 6. `find-committee` — aldermanic committee detail

**Purpose**: Return committee description, chair/members, referred board bills with outcomes, and upcoming meetings.

**Inputs**: `committee_name` OR `comId` (integer).

**Best URL**: `https://www.stlouis-mo.gov/government/departments/aldermen/committees/committee.cfm?comId={comId}`

**Known `comId`s** (from index scrape 2026-05-28):
| comId | Committee |
|---|---|
| 22 | Public Infrastructure and Utilities |
| 23 | Budget and Public Employees |
| 24 | Legislation and Rules |
| 26 | Housing, Urban Development and Zoning |
| 27 | Public Safety |
| 35 | Transportation and Commerce |
| 36 | Health and Human Development |
| 37 | Personnel and Administration |
| 43 | Poet Laureate Task Force |
| 45 | Committee of the Whole |
| 46 | Public Safety Prop S Subcommittee |

If you only have the name, fetch the committees index (`https://www.stlouis-mo.gov/government/departments/aldermen/committees/index.cfm`) and match by `committee.cfm?comId=N` href text.

**Fields**: name, scope description ("The X Committee shall consider all matters pertaining to..."), members (chair + vice-chair + members), referred-bills table (BB#, date, action, outcome), upcoming meetings.

**Output schema**:
```json
{
  "comId": 23,
  "name": "Budget and Public Employees",
  "source_url": "https://www.stlouis-mo.gov/government/departments/aldermen/committees/committee.cfm?comId=23",
  "description": "...",
  "members": [
    { "name": "Rasheen Aldridge", "role": "Chair", "ward": null },
    { "name": "Michael Browning", "role": "Vice-Chair", "ward": null }
  ],
  "upcoming_meetings": [],
  "referred_bills": [
    { "bb_number": 26, "date": "2026-05-21", "action": "Committee Assignment", "outcome": null },
    { "bb_number": 24, "date": "2026-05-27", "action": "Committee Hearing", "outcome": "Passed out of committee (Do Pass)" }
  ]
}
```

---

### 7. `find-alderperson` — single alderperson profile

**Purpose**: Return contact info, ward, committees, sponsored bills/resolutions, voting record, and biography for an alderperson.

**Inputs**: Alderperson name OR ward number (1–14) OR profile `id`. Optionally `session` (defaults to current).

**Best URLs**:
- Profile by internal `id`: `https://www.stlouis-mo.gov/government/departments/aldermen/representation/profile.cfm?id={alderman_id}`
- Roster (resolve name/ward → id): `https://www.stlouis-mo.gov/government/departments/aldermen/representation/index.cfm` (current session) or append `?Session={YYYY-YYYY}` for historical.

**Resolving name/ward to `id`**: Fetch the roster index and scan rows. Each row gives `Name`, `Ward NN`, phone, and `<a href="profile.cfm?id=N">Contact and Profile</a>`. The `id` is non-monotonic and tied to a specific alderperson across sessions.

**Known current-session (2026-2027) `id`s from scouting**:
| Ward | Alderperson | id |
|---|---|---|
| 01 | Anne Schweitzer | 1543 |
| 02 | Thomas Oldenburg | 1516 |
| 03 | Shane Cohn | 1324 |
| 04 | Bret Narayan | 1532 |
| 05 | Matt Devoti | 1566 |
| 06 | Daniela Velazquez | 1560 |
| 07 | Alisha Sonnier | 1561 |
| 08 | Jami Cox Antwi | 1567 |
| 09 | Michael Browning | 1558 |
| 10 | Shameem Clark Hubbard | 1533 |

(Wards 11–14 omitted from inline table — fetch the roster for full resolution.) Do not hard-code; always confirm via roster when the session might have changed.

**Profile fields**:
- Name, ward, session, phone, email (`{lastname}{firstinitial}@stlouis-mo.gov` pattern but **read it from the page** — don't construct), fax, City Hall room/address, social media.
- Committee memberships with role (Chair / Vice-Chair / Member).
- Sponsored board bills (count, list) and sponsored resolutions (count, list).
- Voting record: aye/no/total per session.
- Biography paragraph.

**Find-your-alderperson-by-address**: The roster index contains a "Your Alderman" widget with a `Street Address or Parcel` input. The widget is **AJAX-rendered**; from a static fetch you only see the placeholder `Processing, please wait...`. To resolve an address → ward → alderperson, the recommended path is the City's Geo St Louis tool or the parcel lookup at `https://www.stlouis-mo.gov/data/property.cfm` — both expose ward numbers as a returned field. From a Browserbase session, you *can* drive the widget by typing into the input and waiting for the dropdown, but this is the only sub-skill that benefits from scripted browsing rather than fetch.

**Output schema**:
```json
{
  "id": 1543,
  "name": "Anne Schweitzer",
  "ward": 1,
  "session": "2026-2027",
  "source_url": "https://www.stlouis-mo.gov/government/departments/aldermen/representation/profile.cfm?id=1543",
  "title": "Alderwoman",
  "contact": {
    "email": "schweitzera@stlouis-mo.gov",
    "phone": "(314) 622-3287",
    "fax": "(314) 622-4273",
    "address": "City Hall, Room 230, 1200 Market Street, St. Louis, MO 63103"
  },
  "committees": [
    { "name": "Committee of the Whole", "role": "Member" },
    { "name": "Housing, Urban Development and Zoning", "role": "Member" },
    { "name": "Public Infrastructure and Utilities", "role": "Vice-Chair" },
    { "name": "Special Committee on Reducing Red Tape", "role": "Chair" }
  ],
  "sponsored": {
    "board_bills": [{"bb_number": 8, "title": "Collector of Revenue Pay Bill", "role": "Primary Sponsor"}],
    "resolutions": [{"resolution_number": 33, "title": "Winland Food", "role": "Primary"}]
  },
  "voting_record": { "board_bills": {"aye_pct": 100, "total": 1}, "resolutions": {"aye_pct": 100, "total": 3} },
  "biography": "Anne Schweitzer was born and raised in South St. Louis City..."
}
```

---

### 8. `find-department` — City department / office page

**Purpose**: Return department overview, contact info, services link list, news feed link, and subsection menu for any City department.

**Inputs**: Department name (free-text), or known slug.

**Best URLs**:
- Departments directory: `https://www.stlouis-mo.gov/government/departments/index.cfm`
- Single department: `https://www.stlouis-mo.gov/government/departments/{slug}/index.cfm` — slugs are stable (e.g., `mayor`, `aldermen`, `assessor`, `comptroller`, `circuit-attorney`, `counselor`, `personnel`, `budget`, `civil-rights-enforcement`, `health/animal-care-control`, `public-safety/building/permits`, `public-safety/emergency-management`, `street/refuse`, `sldc/economic-development`, ...). Slugs are nested: many real departments live under `health/...`, `public-safety/...`, `sldc/...`, `recorder/...`.

**Resolving free-text → slug**: Fetch the directory index and match the visible department title against your input. The directory currently lists ~80 entries A–Z, each with a single anchor of form `<a href="/government/departments/{full-slug}/index.cfm">{title}</a>`.

**Fields**: department title, mission paragraph, primary phone, "More contact info" block (full address, hours), "Get Started" link list, "Trending Pages" links, subsection menu, news section (latest 3–5 items with date), procurement section.

**Output schema**:
```json
{
  "name": "Building Division Permits Section",
  "slug": "public-safety/building/permits",
  "source_url": "https://www.stlouis-mo.gov/government/departments/public-safety/building/permits/index.cfm",
  "parent": "Building Division",
  "mission": "Obtain demolition, electrical, plumbing, mechanical, tent and/or housing conservation/HCD (residential occupancy) permits.",
  "contact": {
    "phone": "(314) 622-3313",
    "email": null,
    "address": null,
    "hours": null
  },
  "primary_links": [
    {"label": "Apply For A Building Permit", "url": "..."},
    {"label": "Apply for an Occupancy Permit", "url": "..."}
  ],
  "section_menu": [...],
  "recent_news": []
}
```

---

### 9. `find-city-service` — service catalog item

**Purpose**: Resolve a free-text "I need to do X" query to a canonical Service-Catalog page (one page per service).

**Inputs**: Free-text query (e.g. "register to vote", "get a marriage license", "report a pothole").

**Best URLs**:
- All services by topic: `https://www.stlouis-mo.gov/services/topic.cfm?id={N}&name={slug}` — topic IDs known from homepage: `77 business-and-industry`, `15 community`, `52 education-and-training`, `24 employment-jobs-and-careers`, `46 environment`, `17 government`, `72 health`, `102 housing`, `28 law-safety-and-justice`, `43 leisure-and-culture`, `19 transportation-infrastructure-and-utilities`, `160 urban-development-and-planning`, `217 fees-and-payment-information`.
- All services by audience: `https://www.stlouis-mo.gov/services/audience.cfm?id={N}&name={slug}` — `424 businesses`, `425 residents`, `426 veterans`, `427 youths-and-teens`, `428 disabled`, `429 over-sixty`, `430 homeless`, `431 visitors`.
- Service-catalog search: site-wide search (`searchresults.cfm?q=...`) and the URL paths under `/services/*.cfm` returned in those results.
- Citizens' Service Bureau (general "report a problem"): `https://www.stlouis-mo.gov/government/departments/public-safety/neighborhood-stabilization-office/citizens-service-bureau/`.

**Resolution recipe**:
1. Try site-wide search `searchresults.cfm?q={user_query}`; collect results whose URL starts with `/services/` or whose category is `Information & Service Listings`.
2. Cross-reference the audience and topic indexes if no obvious match.
3. For each candidate, surface the official URL plus a one-line description from the snippet — **never invent a URL** for a service that didn't show in the catalog.

**Output schema**:
```json
{
  "query": "renew business license",
  "source_url": "https://www.stlouis-mo.gov/searchresults.cfm?q=renew+business+license",
  "matches": [
    {
      "title": "Renew Business License and Pay License and Tax Fees",
      "url": "https://www.stlouis-mo.gov/government/departments/license/business-license-info/renew-business-license.cfm",
      "department": "License Collector",
      "snippet": "..."
    }
  ]
}
```

---

### 10. `find-permit-or-license` — permits and licensing pages

**Purpose**: Locate the canonical "how to get / how to renew" page for a permit or license type.

**Inputs**: Permit/license type (free-text, e.g. `building`, `occupancy`, `short-term rental`, `business`, `liquor`).

**Best URLs (known direct paths)**:
- Building permits hub: `https://www.stlouis-mo.gov/government/departments/public-safety/building/permits/index.cfm`
- Apply for building permit: `https://www.stlouis-mo.gov/government/departments/public-safety/building/permits/apply.cfm` (verify per latest hub link)
- Occupancy permits: linked from the hub.
- Short-Term Rental permits: linked from the hub.
- Business license info: `https://www.stlouis-mo.gov/government/departments/license/business-license-info/index.cfm`
- Business license search: `https://www.stlouis-mo.gov/government/departments/license/business-license-search.cfm`
- Driver's license: `https://www.stlouis-mo.gov/services/motor-vehicles/driver-licensing.cfm`

**Resolution**: For an unknown permit type, run `search-city-site` with the query `"{permit_type} permit"` or `"{license_type} license"` and filter results whose URL contains `/license/`, `/permits/`, or `/building/`. Return the canonical landing page plus its primary department contact.

**Output schema**:
```json
{
  "query": "short-term rental permit",
  "type_resolved": "short-term-rental",
  "landing_url": "https://www.stlouis-mo.gov/government/departments/public-safety/building/permits/short-term-rental.cfm",
  "department": "Building Division Permits Section",
  "department_phone": "(314) 622-3313",
  "apply_url": null,
  "renew_url": null,
  "fee_url": null,
  "notes": "Confirm latest fee schedule on the landing page; some permits require a separate occupancy inspection."
}
```

---

### 11. `find-public-notice` — public notices, hearings, RFPs

**Purpose**: Surface public notices — conditional-use hearings, RFP/RFI announcements, City emergency declarations, sunshine-law publications.

**Inputs**: Date range OR notice type OR free-text.

**Best URLs**:
- Public meetings (calendar): `https://www.stlouis-mo.gov/events/all-public-meetings.cfm`
- All events (incl. community): `https://www.stlouis-mo.gov/events/all-events.cfm`
- RFP/RFI/RFQ RSS feed: `http://feeds.feedburner.com/stlouis-mo/wfpS` (returns `text/xml`)
- Sunshine-law / public records request portal: linked from `https://www.stlouis-mo.gov/government/about/access-government-information.cfm` ("Sunshine Law Requests" tile).
- Site-wide search filtered to notices: `searchresults.cfm?q={query}+notice`.

**Fallback**: For department-specific notices (e.g. zoning, health), check the department's news index: `https://www.stlouis-mo.gov/government/departments/{slug}/news/index.cfm` — this is the same `.cfm` template every department uses.

**Output schema**:
```json
{
  "query": "RFP",
  "source_url": "http://feeds.feedburner.com/stlouis-mo/wfpS",
  "notices": [
    {
      "title": "RFP Selection Committee Meeting - GTC Armed Security Services",
      "url": "https://www.stlouis-mo.gov/events/eventdetails.cfm?Event_ID=53636",
      "type": "RFP / Selection committee",
      "published": "2026-05-22",
      "department": null
    }
  ]
}
```

---

### 12. `find-city-document` — official PDFs, plans, reports

**Purpose**: Locate official documents — ordinance PDFs, board bill PDFs, plans/reports (e.g., "Tornado Recovery Priorities and Progress Report"), procurement docs.

**Inputs**: Free-text title or document type.

**Best URLs**:
- Ordinance PDFs: `https://www.stlouis-mo.gov/government/city-laws/upload/legislative//Ordinances/BOAPdf/{ord}.pdf` (note the double slash — preserved verbatim from the site; confirmed served).
- Board-bill PDFs (introduced): `https://www.stlouis-mo.gov/government/city-laws/upload/legislative/boardbills/introduced/{filename}.pdf`. Filenames are not predictable — always extract from the board bill's detail page (`find-board-bill`).
- Plans and Reports: surface via site-wide search; results with category `Plans and Reports | {Department}` indicate an official-record page that links to the PDF.
- Open data: `https://www.stlouis-mo.gov/data/property.cfm` and the Open Data catalog linked from `https://www.stlouis-mo.gov/government/about/access-government-information.cfm`.

**PDF handling rule**: Hermes should always **prefer the HTML wrapper page** (the `.cfm` page that links to the PDF) as the source citation, because the wrapper carries the published date, department, and topic tags as structured metadata. Surface the PDF as `official_pdf_url` alongside the wrapper URL. The City explicitly publishes most legislation in both wrapper-HTML and PDF — the PDF is the legal record, the HTML is the discoverable surface.

**Output schema**:
```json
{
  "query": "tornado recovery progress report",
  "source_url": "https://www.stlouis-mo.gov/searchresults.cfm?q=tornado+recovery+progress+report",
  "documents": [
    {
      "title": "Tornado Recovery Priorities and Progress Report April 2026",
      "wrapper_url": "https://www.stlouis-mo.gov/government/recovery/tornado-2025/...cfm",
      "pdf_url": null,
      "department": "Recovery Office",
      "category": "Plans and Reports",
      "published": null
    }
  ]
}
```

---

### 13. `extract-city-page` — structured extraction from any stlouis-mo.gov page

**Purpose**: Given any City URL, return a normalized structured object (title, breadcrumb-department, dates, body text, document links, contact block) that downstream code can reason about.

**Inputs**: `url`.

**Recipe**:
1. `GET {url}` via `browse cloud fetch` or `curl` (no proxies/stealth needed).
2. Parse OpenGraph meta tags (`og:title`, `og:url`, `og:article:published_time`, `og:article:modified_time`, `og:type`).
3. Parse breadcrumb `<nav aria-label="breadcrumbs">` for department/section path.
4. Parse `<main>` body — strip nav, footer, alert, "Help Us Improve" feedback widget, social-media block. Apply the text-extraction recipe in "Universal helpers" above.
5. Extract all `<a href="*.pdf">` links from `<main>` as `documents`.
6. Extract any `tel:` / `mailto:` links + visible address blocks as `contact_block`.

**Output schema**:
```json
{
  "source_url": "...",
  "canonical_url": "...",
  "title": "...",
  "description": "...",
  "department_path": ["Government", "Departments and Agencies", "Mayor", "News"],
  "department": "Office of the Mayor",
  "page_type": "press_release",            // press_release | informational | event | service | legislation | profile | landing
  "published_at": "2026-05-14T10:05:00",
  "updated_at": "2026-05-14T10:05:00",
  "body_text": "...",
  "body_word_count": 612,
  "documents": [ { "label": "Press release PDF", "url": "...pdf" } ],
  "contact_block": { "phone": "(314) 622-4800", "email": null, "address": "1200 Market Street, St. Louis, MO 63103" },
  "freshness": { "is_stale": false, "stale_reason": null }
}
```

**Freshness rule**: Set `is_stale: true` and a `stale_reason` when (a) `updated_at` is missing AND `published_at` is missing (the page is undated — common on long-lived informational pages); (b) `updated_at` is more than 18 months ago for press releases or notices; (c) the page is a 404 / `Inactive Content` body (the CommonSpot "this page is in the process of being created" placeholder — recognizable by the literal string "Inactive Content"); (d) the page is PDF-only (a `.cfm` page whose only meaningful content is a link to a PDF).

---

### 14. `summarize-city-page` — faithful summary of a City page

**Purpose**: Given a City URL, produce a 3–8 sentence summary plus a structured caveats list ("stale", "PDF-only", "official-record-is-the-PDF", "archived", "subject-to-change-on-meeting-date", etc.).

**Recipe**: First run `extract-city-page`. Then, if `body_word_count < 100`, return `{ summary: "Page has insufficient content to summarize", caveats: [...] }`. Otherwise, summarize the `body_text` in **3–8 sentences** using these rules:
- Lead with the page's purpose (one sentence) — derived from the title and first paragraph.
- Add 1–3 sentences of concrete fact (deadlines, dollar amounts, contact details, dates, ordinance numbers).
- End with one sentence on next-action (e.g., "Apply at …", "Contact … at (314) …", "Meeting scheduled for … via Zoom").
- Never invent specifics. If a number/date isn't in `body_text`, don't include it.
- For press releases, preserve direct quotes (under 25 words each) verbatim and attribute them.

**Caveats to emit** (any that apply):
- `"published_date_missing"` — page has no `og:article:published_time`.
- `"last_updated_more_than_18_months"` — `updated_at` is older than 18 months.
- `"pdf_is_official_record"` — page is a wrapper around an ordinance/board-bill PDF; cite the PDF, not the HTML.
- `"agenda_on_external_portal"` — meeting agenda lives on `stlouismo.portal.civicclerk.com`.
- `"page_is_inactive"` — CommonSpot "Inactive Content" body detected.
- `"data_is_session-bound"` — the page describes legislative-session-scoped data (e.g., committee roster for session `2026-2027`); flag when current_year ≠ session boundaries.
- `"subject_to_change"` — for upcoming meetings whose start time is in the future.

**Output schema**:
```json
{
  "source_url": "...",
  "summary": "3–8 sentence prose summary.",
  "caveats": ["pdf_is_official_record", "data_is_session-bound"],
  "key_facts": [
    {"label": "Effective Date", "value": "2025-11-14"},
    {"label": "Appropriated Amount", "value": "$9,350,000"}
  ],
  "source_metadata": { /* the full extract-city-page output for traceability */ }
}
```

## Site-Specific Gotchas

- **No anti-bot, no auth, no proxies needed.** Scouting iter on 2026-05-28 issued ~25 anonymous `browse cloud fetch` requests against homepage, BoA, ordinance search, ordinance detail, board bill index, board bill detail, alderman roster, alderman profile, departments index, services index, news-media, search-results, calendar, public-meetings, RSS feeds — every call returned `200` in <500 ms with full HTML. No 403/429/captcha observed. **Do not** burn cost on stealth/`--verified --proxies` sessions for this site; `browse cloud fetch` and `curl` are correct.
- **`/search.cfm` is a dead endpoint** — returns the CommonSpot "Inactive Content" placeholder ("This page is in the process of being created or has temporarily been inactivated"). The actual site-wide search form posts to **`/searchresults.cfm?q=...`**. Confirmed via the `<form action>` attribute on the homepage banner search.
- **`BBId` and `RSId` are non-monotonic internal database IDs.** You cannot construct a board-bill or resolution detail URL from just the bill number — you must look it up from the session index first. Verified: `boardbill.cfm?bbNum=1&session=2026-2027` does NOT resolve to a single bill (it falls through to the session-list page); the working form is `boardbill.cfm?bbDetail=true&BBId={internal_id}`.
- **Ordinances DO use the human number as URL key**: `ordinance.cfm?ord={5-digit-ordinance-number}` works directly. Don't confuse this with board bills.
- **The legislative-history "Effective" date is the mayor-signed date**, not the introduction date. For passed bills, the `Effective:` field in the Overview block equals the date of the `Mayor Returns Bill … approved` activity.
- **Most Aldermanic meeting agendas/packets/minutes are on `stlouismo.portal.civicclerk.com`, not stlouis-mo.gov.** The City event detail page (`/events/eventdetails.cfm?Event_ID=N`) carries the meeting title, time, and Zoom link only — the agenda itself is a click away on the CivicClerk portal. Always surface the CivicClerk URL when present.
- **Ordinance PDF URL has a literal double slash** — `…/upload/legislative//Ordinances/BOAPdf/{ord}.pdf`. Don't "normalize" it away; the server depends on the exact path.
- **Legislative history fields are session-bound.** Sponsor lists, committee memberships, and roster are tied to the legislative session string (e.g., `2026-2027`). When the calling code's intent is "currently-serving alderperson," confirm the session is current; for historical questions, pass `?Session={YYYY-YYYY}`.
- **News and events use a per-page filter UI** that is JS-driven; the underlying `cfm` endpoints accept some URL params (`?Page=N`, `?StartDate=...&EndDate=...`, `?topic=...`) but **ignore unknown params silently** rather than returning 4xx. Always verify the result set after applying a filter — don't assume the filter worked. The most reliable filtering is via the RSS feeds (below) or by client-side filtering the unfiltered listing.
- **RSS feeds are first-class.** Hermes should subscribe to these for monitoring rather than scraping pages:
  - All News: `http://feeds.feedburner.com/CityOfStLouis-News`
  - Board Bills (introduced): `http://feeds.feedburner.com/CityOfSaintLouisBoardBills`
  - Resolutions: `https://feeds.feedburner.com/stlouis-mo/fkfsomhwha1`
  - Calendar (all events): `http://feeds.feedburner.com/CityOfStLouis-Calendar`
  - Jobs: `http://feeds.feedburner.com/CityOfStLouis-Jobs`
  - Active RFPs/RFQs/RFIs: `http://feeds.feedburner.com/stlouis-mo/wfpS`
  - All return `Content-Type: text/xml`; parse with any RSS 2.0 parser. (`feedburner.com` is operated by Google; an outage there briefly blinds RSS — fall back to scraping the listing pages.)
- **Resolutions before 2015-2016 may not be indexed** — the digital index for board bills begins with the **2005-2006 session**; vote data begins with **2015-2016**. Older legislation is available only as scanned PDFs from a separate archive path (cite under "archived" in the response).
- **The "Find Your Alderman by Address" widget is the only AJAX-only surface.** A static fetch of the roster index returns only the placeholder "Processing, please wait..." for that widget. To resolve address → ward → alderperson programmatically, use the parcel lookup at `https://www.stlouis-mo.gov/data/property.cfm` (which returns ward as a structured field) instead of the widget. If you must use the widget, drive it with a Browserbase session: `click @<address-input>`, `type "<address>"`, `wait timeout 2000`, parse dropdown.
- **Translation banner is a Google Translate widget — ignore it.** Every page footer contains a 200+ item language `<select>` dropdown and a long list of language anchor texts. Strip it before summarization (the text-extraction recipe drops it because the `<select>` content sits in the footer, not `<main>`).
- **`CommonSpot Build 10.9.0.564` is the generator** — exposed in `<meta name="Generator">` on every page. The CMS is ColdFusion + CommonSpot 10.9, last build 2022-12-23. Useful as a sanity check for "is this really an official City page" (every public stlouis-mo.gov page surfaces this; off-site portals like `stlouismo.portal.civicclerk.com` do not).
- **DO NOT submit forms.** All 14 sub-skills above are read-only (HTTP GET only). Hermes must not POST to `/services/search.cfm`, the feedback form, the address widget, or any payment/account/contact form. The City site exposes feedback forms on every page — do not interact.
- **`og:article:published_time` format is non-standard** — observed `2026-05-14:10:05` (colon between date and time, no timezone). Parse leniently. Most pages publish in America/Chicago.

## Expected Output

Each sub-skill returns a JSON object matching the schema documented in its sub-section above. Every output object SHOULD include these top-level fields when applicable:

- `source_url` — the URL that was fetched (absolute, normalized).
- `success` — boolean; `false` when the lookup failed with a typed `reason`.
- `freshness` — `{ is_stale: bool, stale_reason: string|null }` for any page-extracted content.
- `caveats` — array of string codes from the documented enum (see `summarize-city-page` for the canonical list).

Five canonical outcome shapes across the toolkit:

```json
// 1. Successful structured extraction (most common)
{ "success": true, "source_url": "...", /* sub-skill-specific fields */, "freshness": {"is_stale": false, "stale_reason": null} }

// 2. List/search result
{ "success": true, "source_url": "...", "results": [ /* items */ ], "count": 7 }

// 3. Not found
{ "success": false, "source_url": "...", "reason": "bb_not_found" | "ordinance_not_indexed" | "no_results", "query": "..." }

// 4. Page is inactive / placeholder
{ "success": false, "source_url": "...", "reason": "page_inactive", "page_owner_email": "durnellb@stlouis-mo.gov" }

// 5. Page is stale / PDF-only / external-portal-only
{ "success": true, "source_url": "...", "freshness": {"is_stale": true, "stale_reason": "pdf_is_official_record" | "agenda_on_external_portal" | "last_updated_more_than_18_months" | "published_date_missing"}, /* whatever fields could be extracted */ }
```
