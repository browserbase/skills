---
name: nycourts-gov-search-cases-so6v88
title: NY Courts eCourts Case Search
description: >-
  Search the NY State Unified Court System eCourts dockets (WebCivil
  Supreme/Local, WebCriminal, WebFamily) by index/docket number, party,
  attorney, or judge and return matching cases as structured JSON. Read-only.
website: nycourts.gov
category: legal
tags:
  - legal
  - court-records
  - dockets
  - new-york
  - hcaptcha
  - read-only
source: 'browserbase: agent-runtime 2026-06-04'
updated: '2026-06-04'
recommended_method: browser
alternative_methods:
  - method: browser
    rationale: >-
      The only viable surface. eCourts is server-rendered ASP.NET/Java WebForms
      with no JSON API or URL deep-link; every search submit is gated by a hard
      hCaptcha (sitekey 6c824b97-caeb-4a2a-9144-db4f1c9f86d0). Across 3
      iterations the Browserbase --verified solver attempted the challenge 175
      times and solved it 0 times, so the form-fill workflow is fully mapped but
      submit currently cannot be cleared.
  - method: api
    rationale: >-
      Confirmed unavailable — no JSON/API or query-param endpoint returns docket
      data; all paths route through the captcha-gated WebForm.
verified: true
proxies: true
---
# Search NY State Unified Court System (eCourts) Dockets

## Purpose

Search the New York State Unified Court System (UCS) eCourts docket surfaces —
WebCivil Supreme, WebCivil Local (NYC Civil / Housing / Town & Village),
WebCriminal, and WebFamily — and return matching cases as structured JSON.
Supports five input shapes (index number, party name, attorney name + filing
dates, criminal docket number, or a direct eCourts URL) and returns per-case
details: index/docket number, court, caption, case type, filing/disposition
dates, status, assigned judge, attorneys, parties, appearance/motion history,
NYSCEF case id + document-list URL, and the canonical case-detail URL.

**Read-only.** Never file a motion, pay a fee, or submit any NYSCEF form.

> **Status: candidate / blocked.** Every public eCourts search form submit is
> gated by a hard **hCaptcha** (sitekey `6c824b97-caeb-4a2a-9144-db4f1c9f86d0`).
> Across 3 converged autobrowse iterations (4 `started` / 175 `attempted` /
> **0 `solved`** solver events), Browserbase's `--verified` auto-solver engaged
> on every attempt but never cleared the challenge. The form-fill workflow below
> is fully mapped and verified working up to the submit step; passing the
> hCaptcha is the single unsolved blocker. See Site-Specific Gotchas.

## When to Use

- Look up a NY civil/criminal/family case by index or docket number.
- Find all cases for a party name (last + first or business) in a court/county.
- Find an attorney's cases within a filing-date range.
- Pull a case's caption, judge, attorneys, parties, NYSCEF id, and history.
- Any read-only NY court-docket lookup. Not for filing or paying.

## Workflow

There is **no public API, JSON endpoint, or URL-param deep-link** that returns
docket data — the eCourts surfaces are classic server-rendered ASP.NET/Java
WebForms, and every search submit is hCaptcha-gated (see Gotchas). The browser
flow below is the only path. Use a Browserbase **`--verified --proxies`** session
(stealth + residential proxy are mandatory — bare sessions draw Cloudflare
`cdn-cgi/challenge-platform` interstitials immediately).

### 1. Pick the surface from the input shape

| Input | Surface | Entry URL |
|---|---|---|
| Index number (`123456/2024`), Supreme civil | WebCivil Supreme — Index | `…/webcivil/FCASSearch?param=I` |
| Party / business name, Supreme civil | WebCivil Supreme — Party | `…/webcivil/FCASSearch?param=P` |
| Attorney name + filing dates, Supreme civil | WebCivil Supreme — Attorney | `…/webcivil/FCASSearch?param=A` |
| Justice/judge name | WebCivil Supreme — Justice | `…/webcivil/FCASSearch?param=J` |
| NYC Civil / Housing Part / Town & Village | WebCivil Local | `…/webcivilLocal/LCSearch?param={I\|P\|A}` |
| Criminal docket (`CR-12345-24NY`), defendant | WebCriminal | `…/webcrim_attorney/DefendantSearch` |
| Family | WebFamily | `…/fcasfamily/…` (302-gated; often access-restricted) |
| A direct `iapps.courts.state.ny.us` detail URL | use as-is | open directly |

Base host for all of the above: `https://iapps.courts.state.ny.us`.
The hub page `…/webcivil/ecourtsMain` links every surface.

### 2. Fill the search form (WebCivil Supreme — verified working)

All four WebCivil Supreme search types (`param=I/P/A/J`) and WebCivil Local
render the **same shared `FCASSearch` form** (`<form id="search_form"
method="post" action="FCASSearch">`); JS shows/hides fields per `hWhichPage`.
Field reference (verified):

- `#txtIndex` — index number (Index search).
- `#txtPlaintiffLname` — **the party-name box for ALL roles** (despite the
  "Plaintiff" id). Put the last name / business name here.
- `#txtAttorneyLname` — attorney/firm name (Attorney search).
- `#txtJudgeLname` — justice name (Justice search).
- `rdRepresents` radios — role: `Plaintiff` (= Plaintiff/Petitioner),
  `Defendant` (= Defendant/Respondent), `OtherRoles`, `AllRoles`.
- `#cboCourt` — county/court **multi-select** (Ctrl-click for multiple). Labels
  read like `"New York Supreme Court"`, `"Kings Supreme Court"`,
  `"Nassau Supreme Court"`, etc. — one option per county. **Required** for
  party/attorney searches.
- `#cboYearOfFiling` — year dropdown (Index/Attorney scoping).
- `rbStatus` radios — `open` (Active/Restored) or `all`.
- `rbFutureCases` radios — `Y`/`N` (return only cases with future appearances).
- `#cboSort` — sort order (`Year Filed/Index Number`, etc.).
- `rbOutputFormat` radios — `HTML` (keep this — it's scrapeable) or `PDF`.

Exact verified sequence (party search):
1. `browse open …/webcivil/FCASSearch?param=P`
2. `browse snapshot` once.
3. `browse fill #txtPlaintiffLname "<name>"`.
4. Click the desired `rdRepresents` role radio.
5. Click the county option in `#cboCourt` from the snapshot. **`browse select
   #cboCourt "New York Supreme Court"` fails** ("could not find element") —
   click the option ref instead.
6. Click the `rbStatus` radio (`all` for both active + disposed).
7. Leave `rbOutputFormat` = HTML.
8. Click `#btnFindCase` ("Find Case(s)").

### 3. Clear the hCaptcha (the blocker)

Clicking **Find Case(s)** posts to `FCASSearch` and lands on an hCaptcha
"Verify you are human / Terms of Use" interstitial. The submit button itself
carries the widget (`class="… h-captcha"`, `data-callback="onSubmit"`).

- The Browserbase `--verified` solver engages automatically (console logs
  `browserbase-solving-started`, `browserbase-captcha-event status:started`).
- **Do not manually solve.** Clicking the checkbox more than once, opening the
  "Retrieve accessibility cookie" menu, or interacting with the image challenge
  cancels the auto-solver and traps you on a "drag the missing piece" puzzle.
- Best-known pattern: click the checkbox **exactly once**, then poll passively
  (`browse wait timeout 15000` + `browse get title`, up to ~90s) without
  touching anything. **In testing this still did not clear** — treat a >90s
  stall as the wall and emit `success: false, reason: "captcha_unsolved"`.

### 4. Extract results (post-captcha — design target)

Once past the captcha the results page is a paginated HTML table. Prefer
`browse get text body` / `browse get markdown body` over per-row clicks. Per row:
index number, caption (parties), court/county, and the case-detail link
(`…/webcivil/FCASCaseInfo?…`). Open one detail page and extract court+county+
part, nature of action / case type, filing date, disposition date, status,
assigned judge, attorneys (name/firm/role/bar #), parties (name/role/rep),
most-recent + full appearance/motion history (detail tab), NYSCEF case id +
its document-list URL (`…/nyscef/…`), and the canonical detail URL.

### 5. Release the session

`browse cloud sessions update "$sid" --status REQUEST_RELEASE`.

## Site-Specific Gotchas

- **hCaptcha gates every search submit — system-wide.** Sitekey
  `6c824b97-caeb-4a2a-9144-db4f1c9f86d0` is identical across WebCivil Supreme
  (`FCASSearch`), WebCivil Local (`LCSearch`), and WebCriminal
  (`DefendantSearch`). There is no captcha-free search surface. The Browserbase
  `--verified` solver attempted it 175 times across 3 iterations and solved it
  **0 times** — it is a hard/enterprise hCaptcha variant the solver cannot
  currently clear. Don't burn turns waiting >90s; report the wall.
- **Manual captcha interaction makes it worse.** Clicking the checkbox repeatedly
  or opening the accessibility-cookie menu cancels the in-flight auto-solver and
  drops you onto a visual "drag the missing piece" challenge that is even harder.
  At most one checkbox click, then hands off.
- **Stealth + residential proxy mandatory.** The whole `iapps.courts.state.ny.us`
  host sits behind Cloudflare (`cdn-cgi/challenge-platform`) plus per-path
  `__cf_bm`/`TS*` cookies. Bare sessions get challenged before the form even
  loads. Always `--verified --proxies`.
- **`#txtPlaintiffLname` is the universal party-name field** for every role —
  the id is misleading. The `rdRepresents` radio, not the field, sets the role.
- **`browse select #cboCourt …` does not work** — the county multi-select must
  be driven by clicking the option ref from a snapshot.
- **Selecting a county is effectively required** for party/attorney searches;
  an unscoped statewide search is very slow and may time out.
- **Shared form across search types.** `param=I/P/A/J` all return the same
  `FCASSearch` form HTML; the active fields are toggled client-side by the
  hidden `hWhichPage` value. Set the right `param` in the URL so the correct
  fields are visible.
- **WebFamily / Housing Part are access-restricted.** `…/fcasfamily/fcasMain`
  302-redirects; many Family and Housing records are not public. When a surface
  returns an access-restriction notice, surface that message
  (`access_restricted: true`) rather than fabricating data.
- **Output format matters.** Choose HTML, not PDF — the HTML results table is
  scrapeable; PDF output returns a binary you'd have to parse.
- **No API / no deep-link.** Confirmed: there is no JSON endpoint and no
  query-param URL that returns docket data without going through the captcha-
  gated WebForm. Don't waste time hunting for one.
- **eFiling lives on a separate surface.** NYSCEF (`…/nyscef/…`) and Surrogate's
  Court (`websurrogates.nycourts.gov`) are distinct apps; case-detail pages link
  out to the NYSCEF document list when a matter is e-filed.

## Expected Output

```json
{
  "success": true,
  "query": {
    "court_type": "Supreme Civil",
    "search_type": "party_name",
    "party_last_name": "Smith",
    "role": "Defendant",
    "county": "New York",
    "status": "all"
  },
  "result_count": 50,
  "cases": [
    {
      "index_number": "150123/2024",
      "docket_number": null,
      "caption": "JOHN DOE v. JANE SMITH",
      "court": "Supreme Court, New York County",
      "case_detail_url": "https://iapps.courts.state.ny.us/webcivil/FCASCaseInfo?index=..."
    }
  ],
  "case_detail_sample": {
    "index_number": "150123/2024",
    "court": "Supreme Court",
    "county": "New York",
    "part": "IAS Part 12",
    "case_type": "Tort - Other Negligence",
    "filing_date": "2024-01-15",
    "disposition_date": null,
    "status": "Active",
    "assigned_judge": "Hon. Jane Roe",
    "attorneys": [
      { "name": "Smith & Assoc.", "firm": "Smith & Assoc. LLP", "role": "Plaintiff", "bar_number": "1234567" }
    ],
    "parties": [
      { "name": "JANE SMITH", "role": "Defendant", "representation": "Pro Se" }
    ],
    "most_recent_event": { "type": "motion", "date": "2024-05-02", "description": "Motion to dismiss" },
    "history": [
      { "type": "appearance", "date": "2024-03-01", "description": "Preliminary conference" }
    ],
    "nyscef_case_id": "123456",
    "nyscef_doclist_url": "https://iapps.courts.state.ny.us/nyscef/CaseSearch?...",
    "canonical_detail_url": "https://iapps.courts.state.ny.us/webcivil/FCASCaseInfo?index=..."
  },
  "access_restricted": false,
  "error_reasoning": null
}
```

Other outcome shapes:

```json
// hCaptcha could not be cleared (the current real-world blocker)
{ "success": false, "reason": "captcha_unsolved",
  "error_reasoning": "WebCivil FCASSearch submit gated by hCaptcha sitekey 6c824b97-caeb-4a2a-9144-db4f1c9f86d0; Browserbase --verified solver attempted but did not clear within 90s." }

// Court restricts public access (Family / Housing)
{ "success": true, "access_restricted": true,
  "error_reasoning": "This court's records are not available to the public through eCourts." }

// No matching cases
{ "success": true, "result_count": 0, "cases": [], "case_detail_sample": null }
```
