---
name: secure-professionals-vermont-gov-verify-license-5bjiug
title: Verify a Vermont Professional License
description: >-
  Look up a Vermont Office of Professional Regulation (OPR) professional license
  by number on the public Find-a-Professional portal and return the licensee's
  name, profession, status, and key dates.
website: secure.professionals.vermont.gov
category: government
tags:
  - government
  - license-verification
  - vermont
  - opr
  - professional-licensing
  - pega
source: 'browserbase: agent-runtime 2026-06-03'
updated: '2026-06-03'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      No usable public API. The portal is a Pega Platform app whose
      /prweb/PRServletCustom endpoints require a live session plus per-request
      pzTransactionId/AJAXTrackID tokens minted during harness boot, and the
      whole origin sits behind Imperva. Confirmed not independently callable —
      drive the UI.
verified: true
proxies: true
---
# Verify a Vermont Professional License

## Purpose

Look up and verify a professional license issued by the Vermont Office of Professional
Regulation (OPR) on the public "Find a Professional" guest portal, and return the
license-holder's identity, profession/license type, current status (Active / Expired /
Lapsed / etc.), and key dates. Read-only — this skill only searches and reads the public
license record; it never edits, applies, renews, or pays.

## When to Use

- A user gives you a Vermont license number (format `NNN.NNNNNNN`, e.g. `075.0045018`) and
  asks for the license status, the licensee's name, profession, or expiration date.
- You need to confirm whether a Vermont-licensed professional (nurse, nursing assistant,
  cosmetologist, real-estate agent, and the many other OPR-regulated professions) holds a
  current, active license.
- You need the issue/effective/expiration dates or the licensee's city/town for a Vermont
  OPR license.
- Not for Vermont Board of Medical Practice physicians (those live on healthvermont.org) and
  not for disciplinary/complaint history (a separate "Complaints, Conduct & Discipline" page).

## Workflow

This is a server-rendered **Pega Platform** guest portal ("NGLP") fronted by **Imperva /
Incapsula** anti-bot. There is **no usable public API** — the only path is the browser UI, and
the session is gated by per-request Pega tokens. Drive it with a stealth browser session
(`--verified --proxies`).

1. **Start a stealth session** and navigate to the entry point:
   `https://secure.professionals.vermont.gov/prweb/app/default/`
   The server mints a per-session token into the URL (`/app/default/<TOKEN>*/!STANDARD`). The
   token is single-use — **always enter via `/prweb/app/default/`; never reuse a tokenized URL.**
   Wait ~3s for the Pega harness to render client-side.
2. **Open the lookup**: snapshot the page and click **"FIND A PROFESSIONAL"**. This loads the
   licensee-lookup form (the "LICENSEE LOOKUP" tab is active by default).
3. **Enter the license number — with REAL keystrokes.** Click the **License Number** field
   (placeholder `123.1234567`), then *type* the full value `075.0045018` character-by-character
   (`browse type`, **not** `browse fill`). See Gotcha #1 — this is the single most important
   step. Leave First/Last/Business Name blank and leave Profession on "SELECT PROFESSION".
4. **Commit the value**: press **Tab**. This blurs the field, firing Pega's onchange AJAX
   (`...eventSrcSection=...NGLPLicenseLookupInput`), which writes the value into Pega's
   clipboard and enables the **DISPLAY RESULTS** button.
5. **Submit**: wait ~2s, re-snapshot, then click **DISPLAY RESULTS**. Wait ~3s (a "Please wait"
   progress bar shows during the lookup).
6. **Verify the search actually used your value**: read the body text and confirm the header
   says **"Displaying 1 results for 075.0045018"** (the license number must appear after
   "for"). A results grid shows License #, Profession Type, Status, First/Last Name, City.
7. **(Optional) Open full detail**: click the row's **DETAILS** button to open a modal with the
   licensee's address, profession, first-issuance/effective/expiration dates, and case history.
8. **Extract** the fields into the JSON shape in Expected Output.

## Site-Specific Gotchas

- **Type, never fill.** Pega's text-input control copies the field into its server-side
  clipboard only on real keyboard `input`+blur events. `browse fill` (which sets `.value`
  directly) makes the value *visible* and even enables the button, but Pega searches an **empty
  string** — you get **"Displaying 0 results for "** (note the blank after "for"). Use
  `browse click <field>` → `browse type 075.0045018` → `browse press Tab`. Confirmed: in early
  iterations `fill`+Tab returned 0 results; switching to `type`+Tab returned the record.
- **DISPLAY RESULTS starts disabled.** Its enable expression is
  `disableWhen = this['.LicenseLookupVal']!='true'`; the flag flips only after a field's
  onchange (the Tab blur) commits a value. Visual "enabled" appearance is not proof — always
  verify via the "Displaying N results for <number>" header that the value was actually searched.
- **License number format is exact: `NNN.NNNNNNN`** (3 digits, a dot, 7 digits — the placeholder
  is `123.1234567`). The leading segment is a profession/board code (e.g. `075` = Licensed
  Nursing Assistant). Type the full value in the single License Number field; do **not** split it.
- **Imperva blocks are intermittent and proxy-IP-reputation based.** The same
  `--verified --proxies` config that succeeds on one session can return an Imperva interstitial
  ("**Access denied — Error 15 — This request was blocked by our security service**", with your
  IP / Proxy IP / Incident ID) on the next. If you hit it: rotate to a fresh session (new proxy
  IP) and retry. Attaching automation via a pre-created keep-alive session + CDP connect URL was
  more reliable than a plain remote-open in testing. Never run without stealth.
- **Refs ([X-Y]) are unstable.** Every Pega AJAX round-trip (field commit, search, detail open)
  re-renders the harness and renumbers accessibility refs. Re-`snapshot` before every click;
  never reuse a ref captured before an AJAX call.
- **No public API.** All `/prweb/PRServletCustom/...` endpoints require a live Pega session +
  `pzTransactionId`/`AJAXTrackID` tokens issued during the harness boot; they are not
  independently callable. Don't waste time looking for a JSON lookup endpoint — drive the UI.
- **Scope caveats shown on the form:** "Not all discipline is linked to the licensee lookup
  results" — disciplinary history lives on a separate Complaints/Conduct & Discipline page.
- **Other entry points** exist (`PROFESSION ROSTER DOWNLOAD` tab; name-based search via
  First/Last/Business Name fields) but the license-number lookup is the most precise.

## Expected Output

Successful single-record match (the canonical case — example license `075.0045018`):

```json
{
  "success": true,
  "license_number": "075.0045018",
  "licensee_name": "Adam Johnson",
  "license_type": "Licensed Nursing Assistant",
  "status": "Expired",
  "issue_date": "April 01, 2009",
  "effective_date": "April 01, 2009",
  "expiration_date": "November 30, 2010",
  "additional_fields": {
    "profession": "Nursing",
    "first_name": "Adam",
    "last_name": "Johnson",
    "address_line_1": "CSC - Box A026",
    "city": "Castleton",
    "state": "Vermont",
    "country": "United States",
    "zip_code": "05735",
    "case_history": "No cases"
  },
  "error_reasoning": null
}
```

No record found (valid format, but the search header reads "Displaying 0 results for <number>"):

```json
{
  "success": false,
  "license_number": "099.9999999",
  "error_reasoning": "Displaying 0 results for 099.9999999 — no matching license on file."
}
```

Blocked by anti-bot (Imperva interstitial before the form/results render):

```json
{
  "success": false,
  "license_number": "075.0045018",
  "error_reasoning": "Imperva 'Access denied / Error 15' interstitial — request blocked by security service (proxy IP reputation). Retry with a fresh stealth session / rotated proxy IP."
}
```
