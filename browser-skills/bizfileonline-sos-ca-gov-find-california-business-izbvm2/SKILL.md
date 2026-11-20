---
name: bizfileonline-sos-ca-gov-find-california-business-izbvm2
title: Find a California Business (SOS bizfile)
description: >-
  Look up a registered California business entity (Corporation, LLC, LP,
  Nonprofit) by name or entity number in the Secretary of State bizfile Online
  registry and return its status, entity number, filing date, type,
  jurisdiction, and agent. Read-only; search is gated by Imperva Advanced Bot
  Protection.
website: bizfileonline.sos.ca.gov
category: government
tags:
  - government
  - california
  - business-registry
  - secretary-of-state
  - company-lookup
  - kyb
source: 'browserbase: agent-runtime 2026-06-01'
updated: '2026-06-01'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      The SPA's search is a single POST /api/Records/businesssearch (JSON body
      documented in the skill). It needs no bearer token, but depends on the
      in-session Imperva reese84 cookie, so it is only callable inside a browser
      session Imperva trusts — not as a standalone curl/fetch. From a
      Browserbase cloud browser the endpoint returned an empty-body HTTP 403 on
      every attempt.
  - method: fetch
    rationale: >-
      Plain HTTP fetch of the search endpoint is not viable: the request is
      rejected by Imperva ABP (403, empty body) without a valid
      challenged-browser session, and the dynamic results are not in the
      server-rendered HTML.
verified: true
proxies: true
---
# Find a California Business (SOS bizfile Online)

## Purpose

Look up a registered business entity (Corporation, LLC, LP, or Nonprofit) in the
California Secretary of State **bizfile Online** registry by name or entity
number, and return its public registration details: entity name, entity number,
status, initial filing/registration date, entity type, jurisdiction, and agent
for service of process. This is a **read-only** lookup against public records —
no login, filing, or payment is involved.

> ⚠️ **Reliability caveat (read first):** The search endpoint is gated by
> **Imperva Advanced Bot Protection (ABP)**. During testing, the static page and
> all metadata GET endpoints loaded fine, but the actual search request
> (`POST /api/Records/businesssearch`) returned an **empty-body HTTP 403 on every
> attempt** from a Browserbase cloud browser — across `--verified`,
> `--proxies`, `--verified --proxies`, and `--verified --proxies --solve-captchas`
> session configs, in fresh un-throttled sessions, via both the app's own XHR and
> a direct in-page `fetch`. Treat reliable automated search from a datacenter /
> headless-detected browser as **not currently achievable**. See Site-Specific
> Gotchas for the full picture and the exact API contract for environments that
> can pass ABP (a genuine residential browser session).

## When to Use

- A user asks whether a specific company is registered in California and wants its
  entity number, status (Active / Suspended / FTB Forfeited / Dissolved /
  Cancelled), or initial filing date.
- You need the agent for service of process or jurisdiction (e.g. Delaware vs.
  California) of a California-registered entity.
- You want to confirm a proposed business name is distinguishable / already taken.
- You are reading public corporate metadata to feed a downstream task (due
  diligence, KYB, name availability).

Do **not** use this for Limited Liability Partnerships (LLPs) or General
Partnerships (GPs) — those are not in this search index (see gotchas).

## Workflow

The realistic working path is the **browser UI** — the underlying JSON API
requires an in-session Imperva token and cannot be called standalone (see
gotchas). Lead with the browser, but know it is blocked by ABP from
bot-detected browsers.

1. **Open the search page**
   `https://bizfileonline.sos.ca.gov/search/business`
   It is a React SPA served behind Imperva. Wait ~8–12 s after navigation so the
   Imperva JS challenge runs and sets the `reese84` cookie (also mirrored into
   `localStorage.reese84`). Confirm the title is
   `Search | California Secretary of State`.

2. **Locate the search controls** via an accessibility snapshot:
   - textbox **"Search by name or file number"** (the only text input on the page)
   - button **"Execute search"** (magnifier icon, immediately to its right)
   - button **"Advanced"** (opens entity-type / status / filing-date-range filters)

3. **Enter the query.** Fill the textbox with the company name (e.g. `Tesla`) or
   the entity number **with the leading "C" removed** (e.g. `0806592` not
   `C0806592`). The search is a "keyword" / contains match and returns up to the
   **500 closest matches**.
   - Set the value with a snapshot ref fill, e.g. `browse fill "[<ref>]" "Tesla"`,
     **not** an unquoted CLI value — names containing commas/periods (e.g.
     `Tesla, Inc.`) break shell argument parsing (`Unexpected argument: Inc`).
     Always quote the full value. A ref fill correctly drives React state (the
     "Please provide valid search criteria" hint clears once the value registers).

4. **Submit.** Click the "Execute search" button (or press Enter in the textbox).
   This fires `POST /api/Records/businesssearch` (see contract in gotchas).

5. **Read the results.** On success the SPA renders a results table; click a row
   to open the right-hand **detail drawer** with the entity's full record
   (number, status, dates, jurisdiction, agent). Extract the best-matching active
   entity into the Expected Output shape.

6. **If the results never appear** (table stays empty, or a transient *"An error
   has occurred. Please try your search again"* toast shows): the search XHR was
   blocked by Imperva ABP (HTTP 403). This is the expected failure mode from a
   bot-detected browser — there is no client-side retry that fixes it. Report
   `success: false` with `error_reasoning` describing the ABP block.

### Underlying JSON API (for environments that pass ABP)

If your browser session is *not* flagged by Imperva (a real residential Chrome
profile, or a Browserbase session that has somehow cleared ABP), the SPA's own
mechanism is a single POST you can replay **within the same session** (it relies
on the session's `reese84` Imperva cookie — it is **not** callable from a bare
curl/fetch outside a challenged browser):

```
POST https://bizfileonline.sos.ca.gov/api/Records/businesssearch
Content-Type: application/json
(cookies: reese84, incap_ses_* from the loaded page)

{
  "SEARCH_VALUE": "Tesla",          // query: name, or entity # without leading "C"
  "SEARCH_FILTER_TYPE_ID": "0",      // 0 = keyword/contains (default)
  "SEARCH_TYPE_ID": "1",             // entity-class selector (1 = default set)
  "FILING_TYPE_ID": "",              // entity-type filter (empty = all); from Advanced
  "STATUS_ID": "",                   // status filter (empty = all); from Advanced
  "FILING_DATE": { "start": null, "end": null },  // initial-filing date range
  "CORPORATION_BANKRUPTCY_YN": false,
  "CORPORATION_LEGAL_PROCEEDINGS_YN": false,
  "OFFICER_OBJECT": { "FIRST_NAME": "", "MIDDLE_NAME": "", "LAST_NAME": "" },
  "NUMBER_OF_FEMALE_DIRECTORS": "99",
  "NUMBER_OF_UNDERREPRESENTED_DIRECTORS": "99",
  "COMPENSATION_FROM": "", "COMPENSATION_TO": "",
  "SHARES_YN": false, "OPTIONS_YN": false, "BANKRUPTCY_YN": false,
  "FRAUD_YN": false, "LOANS_YN": false, "AUDITOR_NAME": ""
}
```

The advanced fields (`OFFICER_OBJECT`, director counts, compensation, shares,
etc.) belong to the **Publicly Traded Disclosure** search and can be left at the
defaults above for an ordinary name lookup.

## Site-Specific Gotchas

- **Imperva ABP blocks the search POST — confirmed, not a transient.** The 403 is
  served with `x-cdn: Imperva`, `x-iinfo: ... NNNN`, ASP.NET headers, and a
  **zero-length body** — the classic ABP "silent block" signature. It reproduced
  on every one of 4+ fresh sessions and all stealth combinations
  (`--verified`, `--proxies`, both, plus `--solve-captchas`). There is **no
  visible CAPTCHA** to solve, so `--solve-captchas` does nothing here. Don't
  waste iterations toggling stealth flags — the block is keyed on the browser's
  TLS/behavioral fingerprint, not on cookies or proxies.
- **The block is endpoint-specific.** The HTML page, `/ixt-...` Imperva sensor,
  and the metadata GETs (`/api/Auth`, `/api/AppSetting/*`, `/api/GroupItems/COUNTRY`,
  `/api/search/description/business`) all return **200** in the same session. Only
  the sensitive `POST /api/Records/businesssearch` is 403'd. Hammering it quickly
  escalates the session to a broader block (subsequent GETs started returning 500).
- **403 comes from behind Imperva, styled as ASP.NET.** Don't be fooled by the
  `Server: Microsoft-IIS/10.0` / `x-aspnet-version` headers into thinking it's an
  application auth error you can fix with a token — the empty body + `x-iinfo`
  marker is ABP. A genuine missing-auth would be 401 with a body.
- **No anonymous bearer token exists.** `/api/Auth` returns `false` for guests,
  there is no token in `localStorage`/`sessionStorage` (only `reese84` +
  `OKTA_CONFIG`), and the app legitimately sends `Authorization: undefined` for
  anonymous search. So the API is *meant* to work without auth — it's purely the
  ABP layer that rejects automated clients. Don't go hunting for an Okta token;
  the Okta config is only for the logged-in filing flow.
- **The API is not replayable standalone.** Because it depends on the in-session
  `reese84` Imperva cookie (and that cookie is bound to the challenged browser's
  fingerprint), you cannot lift the request into a separate `curl`/`fetch`. It
  only ever works *inside* a browser session that Imperva trusts.
- **Entity-number searches: drop the leading "C".** The UI tip says search by
  number with the "C" removed (e.g. `0806592`, not `C0806592`).
- **Quote the search value.** Company names contain commas and periods
  (`Tesla, Inc.`). Passing them unquoted to the `browse` CLI throws
  `Unexpected argument: Inc`. Always wrap in double quotes, and prefer a snapshot
  ref fill over a selector fill.
- **Results cap at 500 closest matches.** Use the Advanced panel (entity type /
  status / initial-filing-date range, "Begins with" filter) to narrow broad
  queries; there's an option to view more than the 500 default.
- **Out of scope:** LLPs and GPs are **not** in this search. For those, the site
  directs users to a paper Business Entity Records Order Form.
- **Results render in a portal/drawer.** A successful result set populates a table
  and a right-hand detail drawer (React portals) — re-snapshot after the search
  resolves rather than reading the pre-search accessibility tree.

## Expected Output

Normalized shape the skill should return. **Note:** because the search POST was
blocked by Imperva ABP in every test, a live 200 response was never captured —
the field values below are **illustrative** of the record shape the UI exposes,
not observed data.

```json
{
  "success": true,
  "query": "Tesla",
  "result_count": 1,
  "results": [
    {
      "entity_name": "TESLA, INC.",
      "entity_number": "C0806592",
      "status": "Active",
      "entity_type": "Corporation",
      "registration_date": "2003-07-01",
      "jurisdiction": "DELAWARE",
      "agent": "C T CORPORATION SYSTEM"
    }
  ],
  "error_reasoning": null
}
```

Anti-bot block (the outcome actually observed during testing — the search XHR
returns HTTP 403 with an empty body and no results render):

```json
{
  "success": false,
  "query": "Tesla",
  "result_count": 0,
  "results": [],
  "error_reasoning": "Search blocked by Imperva Advanced Bot Protection: POST /api/Records/businesssearch returned HTTP 403 with an empty body (x-cdn: Imperva, x-iinfo NNNN). Reproduced across verified/proxies/solve-captchas session configs. The page HTML and metadata GET endpoints load, but the search request is rejected for bot-detected browsers."
}
```

No matches found (expected shape when ABP is passed but the query has no hits):

```json
{
  "success": true,
  "query": "Zzz No Such Entity Llc",
  "result_count": 0,
  "results": [],
  "error_reasoning": null
}
```
