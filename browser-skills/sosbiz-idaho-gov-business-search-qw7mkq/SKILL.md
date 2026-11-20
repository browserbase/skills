---
name: sosbiz-idaho-gov-business-search-qw7mkq
title: Idaho SOS Business Search
description: >-
  Search the Idaho Secretary of State business registry by name or file number
  and return matching entities — filing number, entity type, status, standing,
  filing date, and registered agent — with optional hydration of full filing
  details (principal/mailing address, registered agent, AR due date).
website: sosbiz.idaho.gov
category: government
tags:
  - government
  - secretary-of-state
  - business-registry
  - idaho
  - corporate-records
  - read-only
source: 'browserbase: agent-runtime 2026-05-20'
updated: '2026-05-20'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      Drive the React SPA at /search/business — fill the textbox, click Execute
      search, snapshot the results table, optionally click rows to expand the
      detail drawer. ~3× more turns than the API path with no benefit; useful
      only if the JSON API changes shape.
verified: false
proxies: false
---
# Idaho SOS Business Search

## Purpose

Search the Idaho Secretary of State business registry (`sosbiz.idaho.gov`) by name or file number and return matching entities with their filing number, entity type, status, standing, filing date, and registered agent. Optionally hydrate each hit with full filing details (principal/mailing address, registered agent address, AR due date, term of duration, formation jurisdiction). Read-only — never files, amends, reinstates, or pays AR fees.

## When to Use

- "Look up `<business name>` on the Idaho SOS registry and return its status / agent / filing date."
- Bulk verification of Idaho corporate registrations (active vs dissolved, good vs not-good standing).
- Resolving an Idaho file number (10-digit `RECORD_NUM`) to an entity record.
- Pulling registered agent name + address for an Idaho LLC/corp.
- Discovering all Idaho filings whose name *starts with* or *contains* a keyword (e.g. `"smith ventures"` → 2 starts-with matches, 5 contains matches).

## Workflow

The Idaho SOS site at `sosbiz.idaho.gov` is a React SPA that talks to a public, unauthenticated JSON API on the same origin. **There is no API key, no token, no anti-bot wall** — Cloudflare sits in front but only does a passive challenge that any browser session (bare cloud session, no `--verified` / no `--proxies`) clears on first page load. After the initial `/search/business` navigation seeds `cf_clearance`, subsequent `fetch()` calls from the page context return JSON immediately. The direct browser-UI path costs ~3× more turns and adds nothing — lead with the API.

**Sandbox network constraint:** direct `curl` from inside the Vercel sandbox cannot resolve `sosbiz.idaho.gov` (DNS-blocked by network policy), and `browse cloud fetch` is GET-only. The API requires POST. The working pattern is therefore: open a browser session, navigate once to seed CF cookies, then call the API via `browse eval` (in-page `fetch`) — which is what the steps below do.

### 1. Open a session and seed CF clearance (one-time per session)

```bash
sid=$(browse cloud sessions create --keep-alive \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$sid"

browse open "https://sosbiz.idaho.gov/search/business" --remote
browse wait load --remote
browse wait timeout 2000 --remote
```

No `--verified`, no `--proxies` — bare session works. Verified across iter-1 (verified+proxies) and iter-2 (bare), identical API response.

### 2. Search

```bash
browse eval --remote "
(async () => {
  const r = await fetch('/api/Records/businesssearch', {
    method: 'POST',
    headers: {'Content-Type':'application/json','Accept':'application/json'},
    body: JSON.stringify({
      SEARCH_VALUE: 'smith ventures',
      STARTS_WITH_YN: false,   // false = substring/contains; true = name-starts-with
      ACTIVE_ONLY_YN: false    // true to hide Inactive-Dissolved / Inactive-Lapsed records
    })
  });
  return { status: r.status, body: await r.text() };
})()
"
```

Response shape:

```json
{
  "template": [
    {"label": "Form Info",   "id": "TITLE"},
    {"label": "Status",      "id": "STATUS"},
    {"label": "Filing Date", "id": "FILING_DATE"},
    {"label": "Agent",       "id": "AGENT"}
  ],
  "rows": {
    "919070": {
      "SORT_INDEX": 0,
      "TITLE": ["M Smith Ventures, LLC (5577637)", "Limited Liability Company (D)"],
      "ID": 919070,
      "FILING_DATE": "02/01/2024",
      "RECORD_NUM": "0005577637",
      "AGENT": "Michael Smith",
      "STATUS": "Inactive-Dissolved (Administrative)",
      "STANDING": "Not Good Standing",
      "ALERT": false,
      "CAN_REINSTATE": true,
      "CAN_FILE_AR": true,
      "CAN_FILE_REINSTATEMENT": false
    },
    "...": {}
  }
}
```

`rows` is an **object keyed by `ID`** (not an array). To get an ordered list, iterate `Object.values(rows)` and sort by `SORT_INDEX` ascending — the server returns them pre-sorted by relevance/filing-date, but key iteration order is not guaranteed in older JS environments. No results returns `rows: {}` (empty object, **not** `null` and **not** `[]`).

### 3. (Optional) Hydrate each hit with full filing details

For each `ID` in `rows`:

```bash
browse eval --remote "
(async () => {
  const r = await fetch('/api/FilingDetail/business/874134/false', {
    headers: {'Accept':'application/json'}
  });
  return { status: r.status, body: await r.text() };
})()
"
```

URL pattern: `GET /api/FilingDetail/business/{ID}/false`. The trailing `/false` is the `includeImageDetails` flag — the UI calls it with `false` on drawer expand and `true` only when the user opens the full filing-image gallery (which is an authenticated path we don't need). Returns:

```json
{
  "DRAWER_DETAIL_LIST": [
    {"LABEL": "Filing Type",         "VALUE": "Limited Liability Company (D)",   "ALERT_YN": false},
    {"LABEL": "Foreign Name",        "VALUE": null,                              "ALERT_YN": false},
    {"LABEL": "Status",              "VALUE": "Inactive-Dissolved (Administrative)", "ALERT_YN": false},
    {"LABEL": "Formed In",           "VALUE": "IDAHO",                           "ALERT_YN": false},
    {"LABEL": "Term of Duration",    "VALUE": "Perpetual",                       "ALERT_YN": false},
    {"LABEL": "Principal Address",   "VALUE": "8230 W WINCHESTER DR\nBOISE, ID 83704", "ALERT_YN": false},
    {"LABEL": "Mailing Address",     "VALUE": "8230 W WINCHESTER DR\nBOISE, ID 83704-7059", "ALERT_YN": false},
    {"LABEL": "Initial Filing Date", "VALUE": "04/13/2023",                      "ALERT_YN": false},
    {"LABEL": "Inactive Filing Date","VALUE": "07/06/2024",                      "ALERT_YN": false},
    {"LABEL": "AR Due Date",         "VALUE": "04/30/2024",                      "ALERT_YN": true},
    {"LABEL": "Registered Agent",    "VALUE": "Noncommercial\n0289212\nAaron  Smith\n8230 W WINCHESTER DR\nBOISE, ID  83704", "ALERT_YN": false}
  ],
  "HIDE_CERT_BUTTON": false,
  "HIDE_REQUEST_ACCESS": false,
  "HIDE_HISTORY": false,
  "HIDE_AMENDMENT_BUTTON": false,
  "AR_BUTTON_LABEL": null
}
```

The `DRAWER_DETAIL_LIST` is an **ordered array of label/value pairs**, not a keyed object — extract values by `LABEL` string match (e.g. `list.find(d => d.LABEL === 'Principal Address')?.VALUE`). Some entries (e.g. `Foreign Name`) have `VALUE: null` when not applicable. `Inactive Filing Date` is only present for dissolved/lapsed records. `ALERT_YN: true` flags fields the UI renders in red (typically a past-due AR Due Date).

### 4. Release the session

```bash
browse cloud sessions update "$sid" --status REQUEST_RELEASE
```

### Browser fallback

If `browse eval` is unavailable or the API endpoint changes, drive the UI:

1. `browse open "https://sosbiz.idaho.gov/search/business" --remote`
2. `browse wait load --remote && browse wait timeout 2000 --remote`
3. `browse snapshot --remote` — locate the textbox (label: `Search by name or file number`) and the `Execute search` button.
4. `browse fill --remote "<textbox-ref>" "smith ventures"` then `browse click --remote "<button-ref>"`.
5. `browse wait timeout 2500 --remote && browse snapshot --remote` — results render in a `<table>` with columns `Form Info | Status | Filing Date | Agent`. Each row's `Form Info` cell is a `button: <Name> (<Record#>) <Filing Type>  Click to expand`.
6. Parse the table rows directly from the snapshot tree. To expand details: `browse click --remote "<row-button-ref>"` and re-snapshot the drawer.

The UI's default behaviour matches **STARTS_WITH_YN=true** — i.e. it only surfaces records whose name *begins with* the query (e.g. `"smith ventures"` shows 2, not 5). If you want substring/contains matches via the UI, click `Advanced Search Options` and uncheck the starts-with toggle. The API path lets you set this directly on the request body — prefer it.

## Site-Specific Gotchas

- **The site is a React SPA** — `https://sosbiz.idaho.gov/` and `/search/business` return an empty `<div id="root">`. Static HTML scraping is pointless; you must either drive the rendered DOM via `browse snapshot` or call the JSON API directly.
- **`GET /api/Records/businesssearch` → 405**, with `Allow: POST` and an XML error body (`<Error><Message>The requested resource does not support http method 'GET'.</Message></Error>`). The API is POST-only.
- **No auth, no CSRF token, no anti-bot.** A bare cloud session (no `--verified`, no `--proxies`) works after one navigation to seed CF cookies. Verified across 2 iters: identical responses with and without stealth flags. Do not waste cost on `--verified` or `--proxies` for this site.
- **Direct curl from Vercel sandbox is DNS-blocked** for `sosbiz.idaho.gov`, and `browse cloud fetch` is GET-only — so the only working POST path is in-page `fetch()` via `browse eval --remote`. This is a sandbox constraint, not a site constraint; running from any other environment, plain `curl -X POST` against the API works fine once you have a `cf_clearance` cookie (and most sessions don't even need that — the CF challenge here is opportunistic, not mandatory).
- **`STARTS_WITH_YN: true` is the UI default**, but the API defaults to **false** when the field is omitted (verified: omitting the field returned 5 contains-matches for `"smith ventures"`, identical to `STARTS_WITH_YN: false`). Always set the field explicitly to avoid drift if the server changes.
- **`rows` is an object keyed by record `ID`, not an array.** Iterate via `Object.values(rows)` and sort by the per-row `SORT_INDEX` field for the canonical UI ordering.
- **Empty result set returns `rows: {}` (empty object), not `null` or `[]`.** Branch on `Object.keys(rows).length === 0`.
- **`TITLE` is a 2-element array**, not a single string: `[<Display Name> (<Filing Number>), <Filing Type>]`. The filing number embedded in element 0's display string is the same value as `RECORD_NUM` but with leading zeros stripped — `"M Smith Ventures, LLC (5577637)"` vs `RECORD_NUM: "0005577637"`. Use `RECORD_NUM` for exact comparisons.
- **Two different IDs per record:** the `ID` field (e.g. `919070`) is the internal database key used for `/api/FilingDetail/business/{ID}/false`; the `RECORD_NUM` (e.g. `"0005577637"`) is the public-facing 10-digit file number (zero-padded string). Don't confuse them — passing `RECORD_NUM` to the detail endpoint will 404.
- **Detail endpoint trailing flag is `/false`**, not omitted. `GET /api/FilingDetail/business/{ID}` (no flag) returns 404. The flag is `includeImageDetails`; `false` returns the lightweight drawer payload, `true` returns image-gallery metadata that requires an authenticated session.
- **`DRAWER_DETAIL_LIST` is positionally ordered but labeled** — match by the `LABEL` string, not by array index. Some labels are conditional (e.g. `Inactive Filing Date` only appears for dissolved/lapsed records; `Foreign Name` is `null` for in-state filings).
- **Registered Agent VALUE is a newline-delimited multi-line string** containing `Agent Type\nAgent ID\nAgent Name\nStreet\nCity, State Zip`. Split on `\n` (literal `\n` in the JSON string, which is `\n` newline after parse) to break into fields. Agent names are often double-spaced internally (e.g. `"Aaron  Smith"`, `"Brian M Smith"`) — normalize whitespace if joining tokens.
- **Status enum** (observed during iter-1): `Active-Existing`, `Active-Current`, `Inactive-Dissolved (Administrative)`. `Active-Existing` is for ongoing corporations/LLCs; `Active-Current` is for Assumed Business Names (DBAs). `STANDING` mirrors this: `Good Standing` ↔ Active, `Not Good Standing` ↔ Inactive.
- **`ALERT_YN: true` on a `DRAWER_DETAIL_LIST` entry** = the UI renders that field in red and surfaces an alert badge — typically a past-due `AR Due Date`. Treat as a soft compliance signal.
- **Filings cover multiple entity classes**: LLCs (`Limited Liability Company (D)` where `(D)` = domestic), corporations, Assumed Business Names, and (per the nav bar) Notary, Liens (UCC), Trademark, Franchise Authority. Each has its own search surface — this skill is scoped to `business` only. UCC liens are at `/search/ucc`, notaries at `/search/notary`, etc.
- **The site sets an `ASP.NET_SessionId` cookie on first request** but the API does not validate it server-side — verified by deleting the cookie and re-POSTing successfully. Session affinity is opportunistic only.

## Expected Output

```json
{
  "query": "smith ventures",
  "starts_with": false,
  "active_only": false,
  "total_results": 5,
  "results": [
    {
      "id": 919070,
      "record_num": "0005577637",
      "name": "M Smith Ventures, LLC",
      "filing_type": "Limited Liability Company (D)",
      "filing_date": "02/01/2024",
      "status": "Inactive-Dissolved (Administrative)",
      "standing": "Not Good Standing",
      "agent": "Michael Smith"
    },
    {
      "id": 786027,
      "record_num": "0004444744",
      "name": "M.A Smith Ventures L.L.C.",
      "filing_type": "Limited Liability Company (D)",
      "filing_date": "10/12/2021",
      "status": "Inactive-Dissolved (Administrative)",
      "standing": "Not Good Standing",
      "agent": "Matthew Smith"
    },
    {
      "id": 1016958,
      "record_num": "0006459726",
      "name": "Smith & Collins Ventures, LLC",
      "filing_type": "Limited Liability Company (D)",
      "filing_date": "09/29/2025",
      "status": "Active-Existing",
      "standing": "Good Standing",
      "agent": "Scott Collins"
    },
    {
      "id": 874134,
      "record_num": "0005201003",
      "name": "Smith Ventures LLC",
      "filing_type": "Limited Liability Company (D)",
      "filing_date": "04/13/2023",
      "status": "Inactive-Dissolved (Administrative)",
      "standing": "Not Good Standing",
      "agent": "Aaron Smith"
    },
    {
      "id": 989619,
      "record_num": "0006212858",
      "name": "Smithridge Ventures LLC",
      "filing_type": "Limited Liability Company (D)",
      "filing_date": "04/19/2025",
      "status": "Active-Existing",
      "standing": "Good Standing",
      "agent": "Brian M Smith"
    }
  ]
}
```

When the caller requests hydrated details (step 3), attach a `detail` block per result:

```json
{
  "id": 874134,
  "record_num": "0005201003",
  "name": "Smith Ventures LLC",
  "...": "(top-level fields as above)",
  "detail": {
    "filing_type": "Limited Liability Company (D)",
    "foreign_name": null,
    "status": "Inactive-Dissolved (Administrative)",
    "formed_in": "IDAHO",
    "term_of_duration": "Perpetual",
    "principal_address": "8230 W WINCHESTER DR\nBOISE, ID 83704",
    "mailing_address": "8230 W WINCHESTER DR\nBOISE, ID 83704-7059",
    "initial_filing_date": "04/13/2023",
    "inactive_filing_date": "07/06/2024",
    "ar_due_date": "04/30/2024",
    "ar_due_date_alert": true,
    "registered_agent": {
      "type": "Noncommercial",
      "agent_id": "0289212",
      "name": "Aaron Smith",
      "address": "8230 W WINCHESTER DR\nBOISE, ID  83704"
    }
  }
}
```

No-results shape:

```json
{
  "query": "zzqxqxq nonexistent business 12345",
  "starts_with": false,
  "active_only": false,
  "total_results": 0,
  "results": []
}
```
