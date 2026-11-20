---
name: dos-fl-gov-automate-bank-workflows-3asnwn
title: Sunbiz Business Entity Lookup (FL DOS) for Bank KYC
description: >-
  Look up Florida business entity records on dos.fl.gov / search.sunbiz.org by
  entity name, FEI/EIN, or document number, and return the KYC fields a bank
  needs: legal name, filing type, status, FEI/EIN, date filed, principal/mailing
  address, registered agent, and officer/director roster. Read-only.
website: dos.fl.gov
category: government
tags:
  - kyc
  - banking
  - compliance
  - florida
  - sunbiz
  - corporate-records
  - read-only
source: 'browserbase: agent-runtime 2026-05-20'
updated: '2026-05-20'
recommended_method: url-param
alternative_methods:
  - method: url-param
    rationale: >-
      search.sunbiz.org exposes inquiryType=EntityName and inquiryType=FeiNumber
      as GET-able URL params returning a static parseable HTML table — no auth,
      no JS render, no anti-bot. Bare browse cloud fetch (no proxies) returns
      200.
  - method: browser
    rationale: >-
      Required only for the document-number direct lookup, which POSTs the
      ByDocumentNumber form and follows a 302 to the detail GET. Also the
      fallback when the GET endpoint 5xxs during FL-state-IT maintenance
      windows.
verified: false
proxies: false
---
# Sunbiz Business Entity Lookup (FL DOS) for Bank KYC

## Purpose

Given an entity name, document number, or FEI/EIN, return the structured KYC
record for a Florida-registered business: legal name, filing type, document
number, FEI/EIN, status, date filed, principal + mailing address, registered
agent, and the full list of officers/directors. Read-only — never clicks
"File Annual Report", "Reinstatement", or any state-changing button.

This is the canonical bank-automation entry point against the Florida
Department of State (dos.fl.gov / search.sunbiz.org), used during CIP /
business-account onboarding, beneficial-owner verification, KYC refresh,
and pre-loan due diligence on any FL-domiciled or FL-registered foreign
entity.

> **Interpretation note**: the source request was "automate restricted browser
> workflows within a bank" against `dos.fl.gov`. The canonical such workflow
> is the Sunbiz business-entity lookup, so that is what this skill implements.
> Other dos.fl.gov surfaces (UCC search, notary verification) are out of scope
> here — they live in sibling skills.

## When to Use

- **CIP / KYC onboarding**: verify a Florida business account applicant is
  registered, active, and matches the EIN on file.
- **Beneficial-ownership lookup**: read the officer/director list to cross-
  reference against the applicant's BOI / CDD attestation.
- **KYC refresh**: detect status changes (Active → INACT, INACT/MG, INACT/UA,
  NAME HS) since the last refresh window.
- **Pre-loan due diligence** on FL-domiciled borrowers — pulls registered-
  agent address (for service-of-process) and filing-date for entity-age proxy.
- **Document-number-keyed batch reverification** when you already have the
  12-character Sunbiz document number from a prior pull.

## Workflow

**search.sunbiz.org is GET-friendly.** The "search forms" are thin HTML wrappers
over GET endpoints that accept `inquiryType` + `searchTerm` query params and
return a static, parseable HTML table. No auth, no JS render, no anti-bot.
**A residential proxy is NOT required** — `browse cloud fetch <url>` (bare,
no `--proxies`) returns 200 on both the search-results and entity-detail URLs.
Lead with the GET path; the browser flow only matters as fallback when you
need to POST the `ByDocumentNumber` form for an unknown document number.

### Step 1 — Pick the inquiry type

| Want to look up by… | `inquiryType=` | URL pattern |
|---|---|---|
| Entity / corporate name | `EntityName` | `GET /Inquiry/CorporationSearch/SearchResults?inquiryType=EntityName&searchTerm=<URL-enc name>` |
| FEI / EIN | `FeiNumber` | `GET /Inquiry/CorporationSearch/SearchResults?inquiryType=FeiNumber&searchTerm=<9-digit or NN-NNNNNNN>` |
| Document number (12-char Sunbiz ID) | `DocumentNumber` | Browser POST only — see Step 1b |
| Officer or registered agent | `OfficerOrRegisteredAgent` | Same GET pattern, different `inquiryType` |
| Trademark name / owner | `Trademark` / `TrademarkOwner` | Same GET pattern |
| Address / ZIP | `Address` / `ZipCode` | Same GET pattern |

**Max `searchTerm` length is 45 characters** (enforced by the form's
`maxlength="45"` and silently truncated server-side).

### Step 2 — Fetch the result list (GET)

```
GET https://search.sunbiz.org/Inquiry/CorporationSearch/SearchResults
    ?inquiryType=EntityName
    &searchTerm=WALT+DISNEY+PARKS+AND+RESORTS
```

Returns 200 with an HTML `<table>` of up to 20 rows per page:

```
| Corporate Name                          | Document Number | Status   |
| WALT DISNEY PARKS AND RESORTS, LLC      | L99000007022    | NAME HS  |
| WALT DISNEY PARKS AND RESORTS, INC.     | P96000023068    | INACT/MG |
| WALT DISNEY PARKS AND RESORTS U.S., INC.| P97000071529    | Active   |
| ...                                     | ...             | ...      |
```

Each `<a href>` in column 1 is a deep link to the detail page carrying the
opaque `aggregateId`. Parse rows from the `<tbody>` block with the regex
`<tr>[\s\S]*?<\/tr>` and extract per-row:
- name: `>([^<]+)<\/a>` inside the first cell's anchor
- document_number: `class="medium-width">([A-Z0-9]+)<` (alphanumeric, never zero-padded)
- status: `class="small-width">([^<]+)<` (e.g. `Active`, `INACT`, `INACT/MG`, `NAME HS`)
- detail_url: the `href` of the anchor in the first cell

Sunbiz alphabetizes by an internal `searchNameOrder` (collapsed-uppercase,
no punctuation, no spaces). The result list contains the closest 20
alphabetical neighbours of your search term — **the first row is NOT
guaranteed to be your exact match**. Always verify by case-insensitive
canonical-name comparison after stripping punctuation/whitespace.

### Step 3 — Branch on what the table looks like

| Observation | Outcome |
|---|---|
| HTTP 302 → `Location: /Inquiry/CorporationSearch/ByName?noResults=True` | Zero matches anywhere alphabetically near the term (rare; only happens with truly unprecedented strings). `success: false, error_reasoning: "no_match"`. |
| Exactly one row whose canonical-collapsed name equals the canonical-collapsed query | Unambiguous match. Follow `detail_url`. |
| Multiple rows whose canonical-collapsed name equals the canonical-collapsed query | Ambiguous (e.g. several `WALT DISNEY WORLD CO.` filings). Return `success: false, error_reasoning: "ambiguous"`, with `candidates: [{name, document_number, status}]`. |
| No row's canonical name equals the canonical query, but the list rendered | "Near-miss" — the query is sandwiched alphabetically but no exact match exists. Treat as `no_match` and emit the top 5 candidates. |

### Step 4 — Fetch the entity detail page

```
GET https://search.sunbiz.org/Inquiry/CorporationSearch/SearchResultDetail
    ?inquirytype=EntityName
    &directionType=Initial
    &searchNameOrder=<from anchor>
    &aggregateId=<from anchor>
    &searchTerm=<URL-enc original term>
    &listNameOrder=<from anchor>
```

Returns the full detail HTML. Anchor the parse on these CSS markers
(all are stable across iters, observed in two cross-entity verification
runs against Disney parks + Bank of America N.A.):

| Field | HTML anchor / extraction |
|---|---|
| Filing type | First `<p>` inside `<div class="detailSection corporationName">` — e.g. `Florida Profit Corporation`, `Foreign Profit Corporation`, `Florida Limited Liability Co.`, `Florida Not For Profit Corporation`, `Foreign Limited Liability Co.` |
| Legal entity name | Second `<p>` inside the same div |
| Document number | `<label for="Detail_DocumentId">…</label><span>(.+?)</span>` |
| FEI/EIN | `<label for="Detail_FeiEinNumber">…</label><span>(.+?)</span>` (may be `NONE`) |
| Date filed | `<label for="Detail_FileDate">…</label><span>(MM/DD/YYYY)</span>` |
| State of incorporation | `<label for="Detail_EntityStateCountry">…</label><span>(.+?)</span>` |
| Status | `<label for="Detail_Status">…</label><span>(ACTIVE|INACT|…)</span>` |
| Last event | `<label for="Detail_LastEvent">…</label><span>(.+?)</span>` |
| Principal address | `<div class="detailSection">…<span>Principal Address</span><span>…<div>(addr lines joined by <br/>)</div>…<span>Changed: (date)</span>` |
| Mailing address | Same shape, label `Mailing Address` |
| Registered agent name | First `<span>` after `<span>Registered Agent Name & Address</span>` |
| Registered agent address | Second `<span>` after, inside nested `<div>`, lines joined by `<br/>` |
| Officers/Directors | After `<span>Officer/Director Detail</span><span><b>Name & Address</b></span>`, repeating pattern: `<span>Title&nbsp;(.+?)</span> ... (NAME, FIRST [MIDDLE]) <span><div>(addr lines)</div></span>` |
| Annual reports | After `<span>Annual Reports</span>`, a table mapping `Year | Filed Date`. Some entities (foreign newly-registered) have none — that's `null`, not `[]`. |

### Step 4b — Direct document-number lookup (browser POST required)

`inquiryType=DocumentNumber` on the `SearchResults` GET endpoint returns
**HTTP 500** (verified). The only document-number entry point is the form POST:

```
POST /Inquiry/CorporationSearch/ByDocumentNumber
Content-Type: application/x-www-form-urlencoded

SearchTerm=P97000071529&InquiryType=DocumentNumber&SearchNameOrder=
```

The server returns **302** redirecting to
`/Inquiry/CorporationSearch/SearchResultDetail?inquiryType=DocumentNumber&aggregateId=<...>&directionType=Initial&searchNameOrder=<...>&searchTerm=<docnum>`.

Drive via the browser:

```bash
browse open "https://search.sunbiz.org/Inquiry/CorporationSearch/ByDocumentNumber" --remote
# snapshot to discover refs; in observed runs: textbox @0-68, "Search Now" button @0-127
browse fill @<textbox-ref> "P97000071529" --remote
browse click @<button-ref> --remote
# wait a beat for the 302, then read browse get url to harvest aggregateId
```

Once you have the aggregateId from the redirect URL, **cache it** — every future
lookup of that document number is a single GET against `SearchResultDetail`.

### Step 5 — Verification + structured emit

- Cross-check `entity_name` (case-insensitive, punctuation-stripped) against the
  original query. If the detail page's name does not collapse-equal the query,
  flag as a status-history alias rather than a confirmed match (see
  `NAME HS` gotcha).
- For inactive entities, the detail page still renders all fields — emit them
  but set `kyc_pass: false` and reason `entity_inactive_<status_code>`.
- For `NAME HS` (Name History — old name of an entity that later renamed),
  the detail page shows the *current* legal name, not the queried name. The
  `Last Event` field will carry `NAME CHANGE` and the queried string is
  accessible via the `Name History` sub-link. Treat `NAME HS` as a soft hit —
  emit the canonical current name + `name_history_hit: true`.

### Browser fallback

When the GET endpoint becomes unreachable (search.sunbiz.org is fronted by
Cloudflare; the only outage observed in production is occasional `503 origin
unreachable` during midnight FL-state-IT maintenance windows ~12:00–02:00 ET
Sundays), fall back to the full browser flow:

```bash
sid=$(browse cloud sessions create --keep-alive | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s.match(/\{[\s\S]*\}/)[0]).id))")
export BROWSE_SESSION="$sid"
browse open "https://search.sunbiz.org/Inquiry/CorporationSearch/ByName" --remote
browse snapshot --remote                                 # discover refs
browse fill @<SearchTerm-ref> "WALT DISNEY PARKS"  --remote
browse press Enter --remote                              # submit
browse get markdown body --remote                        # parse same shape
```

No `--verified` and no `--proxies` are required — a bare session works.

## Site-Specific Gotchas

- **Cloudflare-fronted but NOT anti-bot.** `Server: cloudflare` + `cf-ray`
  headers on every response, but a bare GET (no UA gymnastics, no cookies)
  returns 200 with the full HTML body. `--verified` and `--proxies` are
  unnecessary. Verified across two cross-entity runs (Disney + Bank of America).
- **Outbound DNS in this sandbox is locked to `browse cloud fetch`** — direct
  `curl https://search.sunbiz.org/...` from the agent's shell returns
  `Could not resolve host`. Use `browse cloud fetch` (it routes via the
  Browserbase Fetch API) or drive a `--remote` browser session.
- **Zero-match returns a redirect, not an empty table.** HTTP 302 with
  `Location: /Inquiry/CorporationSearch/ByName?noResults=True`. The
  redirected page is just the empty search form again. Read the 302 directly
  (don't `--allow-redirects`) to detect no-match cheaply.
- **The result list is alphabetical neighbours, not relevance-ranked.** Sunbiz
  collapses your query into a canonical `searchNameOrder` (uppercase,
  whitespace + punctuation stripped) and returns the 20 entities lexically
  >= that ordering. The first row may not be your match. Always verify by
  canonical-name compare; treat "no row equals canonical query" as
  `no_match` even when the table renders.
- **`maxlength=45` on SearchTerm.** Longer queries are silently truncated
  server-side. Pre-trim at the agent layer and warn when truncation happens
  — a truncated "WALT DISNEY PARKS AND RESORTS U.S., INCORPORATED" loses the
  ", INCORPORATED" suffix and yields a different alphabetical neighbourhood.
- **`inquiryType=DocumentNumber` on the SearchResults GET endpoint returns 500.**
  Document-number lookup MUST go through the `ByDocumentNumber` form POST,
  which 302-redirects to the SearchResultDetail GET with the aggregateId
  populated. Cache that aggregateId for future direct GETs.
- **Status code vocabulary** (not in any public docs — derived from observed runs):
  - `Active` — in good standing
  - `INACT` — administratively dissolved or voluntarily withdrawn
  - `INACT/MG` — inactive, merged
  - `INACT/UA` — inactive, no annual report (admin dissolution)
  - `NAME HS` — Name History; this row's name is a former name of an entity
    whose current name lives at a different document number (follow
    `NameHistory` sub-link, or re-query by `aggregateId`'s current name)
- **`aggregateId` encodes filing type prefix.** Observed prefixes — useful
  for sanity-checking before you parse:
  - `domp-` Domestic Profit Corporation
  - `forp-` Foreign Profit Corporation
  - `flal-` Florida LLC
  - `forl-` Foreign LLC
  - `domnp-` Domestic Not-For-Profit
  - `fornp-` Foreign Not-For-Profit
  - `trade-` Trademark filing
  - `reject-` rejected filing (still indexed)
  Plus the actual document number embedded mid-string. An `aggregateId`
  starting with `trade-` should never be emitted as an entity record — it's
  a trademark, not a company.
- **FEI/EIN is optional.** Older filings (pre-1990s) and some foreign filings
  show `NONE` for FEI/EIN. Emit as `null`, not the string "NONE".
- **Date format is US `MM/DD/YYYY`.** Normalize to ISO `YYYY-MM-DD` at the agent
  boundary if your downstream consumer expects ISO.
- **Officer/Director block has no per-row HTML delimiter.** Officers are
  separated only by `<span>Title&nbsp;...</span>` markers — there's no
  enclosing `<li>` or `<div class="officer">`. Parse by iterating Title
  span occurrences and treating the text + address block after each as
  belonging to that title. The pattern is: `Title <title-string> <newlines>
  <NAME-LAST, NAME-FIRST [INITIAL]> <span><div>addr lines</div></span>`.
- **Officer names use `LAST, FIRST MIDDLE` format with arbitrary trailing
  whitespace.** Trim and split-on-comma, preserve middle-name spacing.
- **Read-only.** Do not click "File Annual Report", "Reinstatement", "Resign
  as Registered Agent", or "Amendment" buttons. These exist on the detail
  page footer for some logged-in views and on the linked
  `dos.myflorida.com/sunbiz/manage-business/` flows — they are state-changing
  filings that cost the entity money. The bank-side automation must never
  reach those.
- **Annual reports list is paginated implicitly.** Only the most-recent ~5
  annual reports render inline on the detail page. The full history lives
  behind the `Events` sub-link (`/EventHistory?aggregateId=...&entityId=...`).
  If your bank workflow needs the full annual-report timeline (e.g., entity-
  age verification), follow `Events`; otherwise the inline list is sufficient
  for KYC refresh.
- **CORP-MERGER edge case.** When `Last Event = CORPORATE MERGER`, the
  surviving entity is named in `Event Effective Date` proximity but is NOT
  linked from the current detail page — you have to re-query the survivor's
  name. Flag merged entities as `kyc_pass: false, reason: "entity_merged"`
  unless your downstream KYC policy explicitly accepts a merged-into-active
  status.
- **No documented rate limit, but be polite.** Sustained > 2 req/s starts
  drawing 503s. Keep batch lookups at <= 1 req/s with jitter.

## Expected Output

Five outcome shapes, distinguished by `success` + `error_reasoning`:

```json
// 1. Active entity, unambiguous match (the happy path)
{
  "success": true,
  "query": "WALT DISNEY PARKS AND RESORTS U.S., INC.",
  "match_type": "exact",
  "entity_name": "WALT DISNEY PARKS AND RESORTS U.S., INC.",
  "document_number": "P97000071529",
  "fei_ein_number": "95-2412883",
  "filing_type": "Florida Profit Corporation",
  "status": "ACTIVE",
  "date_filed": "1997-08-18",
  "state": "FL",
  "last_event": "CORPORATE MERGER",
  "last_event_filed": "2012-03-28",
  "last_event_effective": "2012-04-01",
  "principal_address": "1375 Buena Vista Drive, 4th Floor North, Lake Buena Vista, FL 32830",
  "principal_address_changed": "2025-03-03",
  "mailing_address": "500 S. Buena Vista Street, Burbank, CA 91521",
  "mailing_address_changed": "2024-04-09",
  "registered_agent": {
    "name": "CORPORATION SERVICE COMPANY",
    "address": "1201 HAYS STREET, TALLAHASSEE, FL 32301-2525",
    "name_changed": "2021-10-05",
    "address_changed": "2021-10-05"
  },
  "officers": [
    { "title": "Asst. Secretary", "name": "SOLOMON, AARON H", "address": "1170 CELEBRATION BLVD, CELEBRATION, FL 34747" },
    { "title": "Director, Senior Vice President", "name": "HOPKINS, ANDREW M", "address": "1200 GRAND CENTRAL AVE, GLENDALE, CA 91201" }
  ],
  "annual_reports": [
    { "year": 2025, "filed": "2025-04-14" }
  ],
  "aggregate_id": "domp-p97000071529-393a1a82-2b24-499a-b4ce-e1513f652e8b",
  "detail_url": "https://search.sunbiz.org/Inquiry/CorporationSearch/SearchResultDetail?inquirytype=EntityName&aggregateId=domp-p97000071529-393a1a82-2b24-499a-b4ce-e1513f652e8b&...",
  "kyc_pass": true,
  "error_reasoning": null
}

// 2. Inactive entity — fields populated, kyc_pass=false
{
  "success": true,
  "query": "WALT DISNEY PARKS AND RESORTS, INC.",
  "match_type": "exact",
  "entity_name": "WALT DISNEY PARKS AND RESORTS, INC.",
  "document_number": "P96000023068",
  "status": "INACT/MG",
  "kyc_pass": false,
  "kyc_fail_reason": "entity_inactive_merged",
  "error_reasoning": null
}

// 3. Ambiguous — multiple top-tier matches
{
  "success": false,
  "query": "WALT DISNEY WORLD CO.",
  "error_reasoning": "ambiguous",
  "candidates": [
    { "name": "WALT DISNEY WORLD CO.", "document_number": "820111",       "status": "INACT/MG" },
    { "name": "WALT DISNEY WORLD CO.", "document_number": "P97000071529", "status": "NAME HS" }
  ]
}

// 4. No match anywhere alphabetically near the query — 302 to ?noResults=True
{
  "success": false,
  "query": "ZZZZZZNEVEREXISTSXYZ",
  "error_reasoning": "no_match",
  "candidates": []
}

// 5. Sunbiz search backend unreachable (503 from CF or origin)
{
  "success": false,
  "query": "...",
  "error_reasoning": "search_unavailable",
  "http_status": 503
}
```
