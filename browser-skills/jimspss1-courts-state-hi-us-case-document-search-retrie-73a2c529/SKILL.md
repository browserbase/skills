---
name: jimspss1-courts-state-hi-us-case-document-search-retrie-73a2c529
title: 'Hawaii eCourt Kōkua Case, Schedule & Document Search'
description: >-
  Search Hawai`i State Judiciary (JIMS eCourt Kōkua) public court records by
  party name/agency/Party ID, license plate/VIN, case ID/citation/OTN/SID, or
  upcoming hearings, and retrieve the printable PDF report of a case, its
  schedule, or its documents.
website: jimspss1.courts.state.hi.us
category: legal
tags:
  - legal
  - court-records
  - case-search
  - hawaii
  - recaptcha
  - read-only
  - icefaces
source: 'browserbase: agent-runtime 2026-07-31'
updated: '2026-07-31'
recommended_method: browser
alternative_methods:
  - method: browser
    rationale: >-
      The portal is a stateful ICEfaces/JSF server-rendered app (X-Powered-By:
      JSF/2.0) gated by an invisible reCAPTCHA Enterprise on the disclaimer and
      on every search. There is no public JSON/REST/GraphQL API and deep links
      fail without an established jsessionid + view state, so a driven stealth
      browser session is the only reliable surface.
verified: true
proxies: true
---
# Hawaii eCourt Kōkua Case, Schedule & Document Search

## Purpose

Search Hawai`i State Judiciary public court records through the JIMS **eCourt Kōkua** portal (`jimspss1.courts.state.hi.us/eCourt/`) and pull the printable report for a case, its event schedule, or its documents. One universal skill covers all five search surfaces the portal exposes: (1) party search by person / business-agency name or Party ID, (2) vehicle search by license plate or VIN, (3) case search by Case ID / citation / OTN / SID / arrest number, (4) upcoming court hearings by Case ID or court/location, and (5) view / purchase document subscriptions. Read-only for search and report retrieval; the document-purchase flow is a paid transaction and should stop before payment unless explicitly asked. Returns structured case metadata plus the generated PDF report URL ("Printable Calendar View" / "Printable View").

## When to Use

- Look up all Hawai`i cases tied to a person, business, or government agency by name or Party ID.
- Find cases attached to a vehicle by license plate (+ state) or VIN.
- Pull a specific case's details, charges/violations, disposition, event schedule, and docket by Case ID, citation number, OTN, SID, arrest number, application number, or TCT number.
- Check a case's upcoming court hearing dates/times/rooms, or list hearings by court and location.
- Retrieve the print-ready PDF report of a case or its calendar/schedule.
- Look up or purchase electronic copies of court documents (Purchase ID lookup, or new purchase via JEFS).

## Workflow

This portal is a stateful **ICEfaces/JSF** application: every navigation and search is an AJAX partial page update that keeps the same `*.iface` URL and mutates page content in place. There is **no public JSON/REST API and deep links do not work** — a fresh URL hit lands on the disclaimer or an `error.iface` page because view state and the `jsessionid` cookie are required. `recommended_method` is therefore **browser**, and every page-driving step must re-`snapshot` after an action (refs invalidate on each DOM swap) and judge success by page **content**, not by URL.

### 1. Start a stealth remote session

A bare/local browser gets permanently stuck on the disclaimer because the Accept button runs an **invisible reCAPTCHA Enterprise** challenge. Use a Browserbase remote session with stealth + residential proxy:

```bash
sid=$(browse cloud sessions create --keep-alive --verified --proxies \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$sid"
```

### 2. Accept the disclaimer

```bash
browse open "https://jimspss1.courts.state.hi.us/eCourt/" --remote   # → ECCDisclaimer.iface
browse snapshot --remote                                             # find "Press to Accept" button
browse click "@<accept-ref>" --remote
browse wait timeout 12000 --remote                                   # invisible reCAPTCHA resolves (~10-14s)
browse snapshot --remote                                             # confirm Home menu appeared
```

Success = the content changes to the **Home** menu listing the five tabs: *Party Search, Vehicle Search, Case Search, Upcoming Court Hearings Search, View / Purchase Documents*. The URL stays on `ECCDisclaimer.iface` — that is normal (AJAX update).

### 3. Pick the tab for the user's request

Click the top-nav link (all render as content swaps under the same session):

| User intent | Tab | Sub-tabs | Key required fields |
|---|---|---|---|
| Name / agency / Party ID | **Party Search** | Name · Person · Company Name · Party ID | Last Name*, First Name* (Person); Party ID (Party ID search) |
| License plate / VIN | **Vehicle Search** | License Plate · VIN | License Plate* + State; or VIN* |
| Case ID / citation / OTN / SID | **Case Search** | (Case) · Filing Date | one of Case ID/Citation, Application #, Arrest #, TCT #, OTN, SID |
| Upcoming hearings | **Upcoming Court Hearings Search** | Case ID · Court/Location | Case ID*; or Court + Location |
| View / buy documents | **View / Purchase Documents** | — | Purchase ID + Email (view); or purchase form → JEFS |

Optional narrowing on most forms: **Case Type** dropdown (full enum, e.g. `TI - Traffic Infraction`, `PC - Circuit Court Criminal`, `CV - Circuit Court Civil`, `DV - Divorce`, `SC - Small Claim`, …), **Beginning/Ending Case Filing Date**, and on Name Search the **Phonetic** and **Partial** search checkboxes.

### 4. Fill and submit

```bash
browse fill "@<lastNameRef>" "Smith" --remote
browse fill "@<firstNameRef>" "John" --remote
browse click "@<searchButtonRef>" --remote          # "Press to Search"
browse wait timeout 12000 --remote                  # each search form has its OWN invisible reCAPTCHA
browse snapshot --remote
```

### 5. Read results / open a case

Results render as a table: **Party Name · Case · Case Type · Filing Date · Next Event · Party Type · Party ID**, with a header like `198 case(s) found, displaying 20 case(s), from 1 to 20. Page 1 / 10` (20 rows/page — paginate for more). Each row exposes two links:
- **Case ID** (e.g. `1DTI-26-805268`) → opens **Case Details**.
- **Party ID** (e.g. `@1790616`) → lists every case for that party.

Click the Case ID. Case Details render under the Case Search tab with: **Case Description** (Case ID, caption e.g. `State v. John C Smith -NON JURY-`, Type, Status, Filing Date, Court, Location, Balance Due, CDL/CMV/HAZ, Citation/Arrest, Alleged Speed), a **Violations** table (Violation · Disposition · Sentence), a **Case Event Schedule** table (Event · Date · Time · Room · Location · Judge · Chambers), and the **Docket** list.

### 6. Pull the printable report (PDF)

On the Case Details view click **"Printable Calendar View"** (on a results list it is labeled **"Printable View"**). Both are `<a target="_blank">` links whose `href` is a server-generated PDF:

```
https://jimspss1.courts.state.hi.us/eCourt/icefaces/resource/<base64-token>/report.pdf
```

Extract the `href` (`browse get html body` → grep `report.pdf`) and/or `browse open` it **in the same session** to render/download. The token is session-scoped and expires with the session — do not cache it across sessions.

## Site-Specific Gotchas

- **Stealth is mandatory.** A non-stealth (local or bare remote) session is permanently blocked at the disclaimer: the Accept button's `executeCaptcha()` never yields a valid token and the page never advances. `--verified --proxies` remote sessions pass reliably. Verified across runs — the host pre-run probe reported "no anti-bot" on the bare homepage, but that homepage is only a 5-second meta-refresh redirect to `/eCourt`; the real gate is the reCAPTCHA on `ECCDisclaimer.iface`.
- **Invisible reCAPTCHA Enterprise on every submit.** The disclaimer *and* every search "Press to Search" button run an invisible challenge (site key `6LcbZEkUAAAAAHMdU1qVQGmPdOI2g_70k1TJHK7v`). Always `browse wait timeout ~12000` after clicking Accept/Search, then re-snapshot; if the old form is still showing, wait another 5-8s before concluding failure. The reCAPTCHA badge often shows *"This site is exceeding reCAPTCHA Enterprise free quota"* — it still fails-open for stealth sessions, so ignore that banner.
- **Never judge navigation by URL.** This is ICEfaces — Accept, tab clicks, searches, and case drill-downs are all AJAX partial updates that keep the same `*.iface` URL (e.g. Case Details stays on `CaseSearch.iface`). Judge state by page content / titles only.
- **Re-snapshot after every action.** Refs (`[5-33]` style) are regenerated on each DOM swap; a ref from a previous snapshot will error ("Unknown ref … have 0 refs") on a fresh session or after any update.
- **No deep-linking / no API.** Hitting a form URL directly (e.g. `.../CaseSearch.iface`) without the established session lands on the disclaimer or `error.iface`. There is no JSON endpoint; the site is a JSF/ICEfaces server-rendered app (`X-Powered-By: JSF/2.0`, `ice.push`/`icefaces` resources). Don't waste time probing for a REST/GraphQL shortcut — confirmed none.
- **Session cookies matter.** `jsessionid` (path `/eCourt`), `ice.push.browser`, and a `LOADBALANCER` cookie pin you to one backend node; losing them mid-flow drops view state. Keep everything inside one `--keep-alive` session.
- **Printable report is a session-scoped PDF.** The `report.pdf` under `/eCourt/icefaces/resource/<token>/` only resolves within the same authenticated session; the `<token>` (base64, e.g. `MTI1NDk5MTQzNg==`) changes per generation. Fetch it in-session; a cross-session curl will fail.
- **Required fields.** Name Search requires Last Name **and** First Name (both `*`). License Plate Search requires License Plate. Case ID hearing search requires a Case ID. Missing a required field re-renders the form with a validation message instead of results.
- **Result cap / pagination.** Broad queries return many pages (20 rows/page; e.g. "Smith, John" = 198 cases / 10 pages). Add Case Type or a filing-date range to narrow; paginate with the Next/page controls for the full set.
- **Confidential/sealed cases are omitted.** Sealed cases, confidential-by-law events, and some pleadings never appear online (per the disclaimer and the hearings-tab note). A "not found" can mean confidential, not nonexistent.
- **Document purchase is paid & non-refundable.** The View/Purchase Documents "New Documents" flow charges statutory fees + a 2.6% Hawai`i Information Consortium processing fee, and purchased docs are viewable only ~2 days. Registration/subscription happens in the separate **JEFS** system (external link). Stop before payment unless explicitly instructed. "Purchased Documents" lets you re-view a prior purchase via Purchase ID + email.

## Expected Output

Party / vehicle / case search that resolves to one or more cases, with the printable report URL:

```json
{
  "success": true,
  "search_type": "party_name",
  "query": { "last_name": "Smith", "first_name": "John" },
  "result_count": 198,
  "page": "1 / 10",
  "results": [
    {
      "party_name": "Smith Jr, John C",
      "case_id": "1DTI-26-805268",
      "caption": "State v. John C Smith",
      "case_type": "TI - Traffic Infraction",
      "filing_date": "2026-06-20",
      "party_type": "Defendant",
      "party_id": "@1790616"
    }
  ],
  "case_detail": {
    "case_id": "1DTI-26-805268",
    "caption": "State v. John C Smith -NON JURY-",
    "case_type": "TI - Traffic Infraction",
    "status": "ACTIVE - Active Case",
    "filing_date": "2026-06-20",
    "court": "FIRST CIRCUIT",
    "location": "WAI`ANAE DIVISION",
    "balance_due": "$0.00",
    "violations": [ { "violation": "…", "disposition": "…", "sentence": "…" } ],
    "event_schedule": [ { "event": "…", "date": "…", "time": "…", "room": "…", "location": "…", "judge": "…" } ],
    "docket": [ { "docket_no": "1", "date": "2026-06-20", "docket": "Notice of …", "party": "…" } ]
  },
  "printable_report_pdf_url": "https://jimspss1.courts.state.hi.us/eCourt/icefaces/resource/MTI1NDk5MTQzNg==/report.pdf",
  "error_reasoning": null
}
```

Upcoming-hearings lookup by Case ID:

```json
{
  "success": true,
  "search_type": "upcoming_hearings",
  "query": { "case_id": "1DTI-26-805268" },
  "hearings": [
    { "event": "Chambers Review", "date": "2027-09-24", "time": "8:00 AM", "room": "…", "location": "…", "judge": "…" }
  ],
  "printable_report_pdf_url": "https://jimspss1.courts.state.hi.us/eCourt/icefaces/resource/<token>/report.pdf",
  "error_reasoning": null
}
```

Document-subscription view (read-only, pre-payment):

```json
{
  "success": true,
  "search_type": "documents",
  "mode": "view_purchased",
  "query": { "purchase_id": "…", "email": "…" },
  "documents": [ { "title": "…", "available_until": "2026-08-02", "download_url": "…" } ],
  "note": "New purchases route through JEFS; fees are statutory + 2.6% processing, non-refundable, ~2-day access.",
  "error_reasoning": null
}
```

No-match / blocked outcomes:

```json
{ "success": false, "search_type": "case_id", "query": { "case_id": "9XYZ-99-9999999" }, "result_count": 0, "error_reasoning": "No cases found matching the criteria (note: sealed/confidential cases are never shown online)." }
```
```json
{ "success": false, "error_reasoning": "Stuck on ECCDisclaimer.iface — invisible reCAPTCHA did not clear. Retry with a --verified --proxies remote session and wait 12s+ after clicking Accept." }
```
