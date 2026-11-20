---
name: www2-dre-ca-gov-ca-real-estate-license-verify-n7tjq2
title: California DRE Real Estate License Verification
description: >-
  Verify any California real estate license number against the DRE public
  lookup. Returns licensee name, license type
  (Salesperson/Broker/Officer/Corporation), status, expiration date, mailing
  address, responsible broker (where applicable), and disciplinary action
  history. Zod-validated. Read-only.
website: www2.dre.ca.gov
category: government
tags:
  - government
  - licensing
  - real-estate
  - california
  - verification
  - read-only
source: 'browserbase: agent-runtime 2026-05-26'
updated: '2026-05-26'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      Only useful when HTTP is unavailable. The page renders without JavaScript,
      has no anti-bot, no rate limit, no cookies — but `browse click` on the
      form's Find button reliably tears down the CDP socket mid-navigation, so
      even the browser path should construct the deep-link URL
      (`?License_id=XXXXXXXX`) and load it directly rather than driving the
      form.
  - method: api
    rationale: >-
      DRE publishes no official JSON API. The classic-ASP endpoint is HTML-only
      — `recommended_method: fetch` reflects that the optimal path is a plain
      HTTP GET, not a JSON API call.
verified: false
proxies: false
---
# California DRE Real Estate License Verification

## Purpose

Given an 8-digit California Department of Real Estate (DRE) license number,
fetch the public licensee record from
`https://www2.dre.ca.gov/publicasp/pplinfo.asp` and return a Zod-validated
JSON object containing the licensee name, license type, status, expiration
date, mailing address, responsible broker (where applicable), and any
disciplinary action history (comments + linked PDF document filenames).
Read-only; never mutates state.

## When to Use

- "Is California real estate license `01974439` still valid?"
- Pre-funding / pre-listing due-diligence on an agent or broker.
- Bulk verification of a list of licensees (one HTTP call per ID, ~1 s each).
- Confirming a broker's disciplinary history before signing a representation
  agreement.
- Cross-referencing a Salesperson against their `Responsible Broker` or
  cross-referencing a Corporation against its `Licensed Officer(s)` and
  affiliated Salespersons.

## Workflow

DRE's public-lookup endpoint is a vanilla classic-ASP page (Microsoft IIS
10.0) served over plain HTTPS. **No anti-bot, no rate-limiting cookies, no
JavaScript required to render the detail page, no proxies needed.** Crucially,
the detail page has a stable **deep-link URL** — you do not need to fill the
form. Lead with `fetch`; the browser flow exists only as a fallback for the
small subset of agents that cannot make HTTP calls.

### 1. Deep-link fetch (recommended)

```bash
curl -s "https://www2.dre.ca.gov/publicasp/pplinfo.asp?License_id=01974439"
```

Returns a small (~4–8 KB) HTML detail page when the ID exists, or the
~18 KB empty-form page when it does not.

Equivalent forms (all 200-OK, all return the same body):

| Variant | URL / body | Notes |
|---|---|---|
| Direct GET (preferred) | `GET ?License_id=01974439` | One round-trip. |
| Form POST | `POST ?start=1` with `h_nextstep=SEARCH&LICENSE_ID=01974439` | Same response; useful only when you also want to drive name/city search. |
| Unpadded GET | `GET ?License_id=1974439` | ASP coerces `1974439`→`01974439`. Don't rely on this — always send the canonical 8-digit zero-padded form. |

Inside the Browserbase environment:

```bash
browse cloud fetch "https://www2.dre.ca.gov/publicasp/pplinfo.asp?License_id=01974439"
```

(`browse cloud fetch` supports GET only; for the POST variant, use a remote
session and an in-page `fetch()` call — see Browser Fallback.)

### 2. Detect success vs. not-found

| Marker | Meaning |
|---|---|
| Response contains literal `License Type:` | Detail page — proceed to parse. |
| No `License Type:` and size ≈ 18,000 bytes | License ID is invalid / not found. The server silently re-renders the empty form (no error message, no 4xx). |

Do **not** rely on HTTP status — both shapes are 200 OK.

### 3. Parse the detail table

Every field is a `<tr>` of two `<td>` cells: a labeled `<strong>` on the
left and the value (in a nested `<FONT FACE="Arial,Helvetica" size=2>`)
on the right. Markup hasn't changed since the page's 2010 footer line.
Stable single-pass regex per field (HTML, not text):

```text
licensee_name      /<strong>Name:<\/strong>[\s\S]*?size=2>([^<]+)/
license_type       /<strong>License Type:<\/strong>[\s\S]*?size=2>([^<]+)/
license_id         /<strong>License ID:<\/strong>[\s\S]*?size=2>([^<]+)/
mailing_address    /<strong>Mailing Address:<\/strong>[\s\S]*?size=2>([\s\S]*?)<\/font>/   (multi-line; join <br/> with ", ")
expiration_date    /<strong>Expiration Date:<\/strong>[\s\S]*?size=2>([^<]+)/   (MM/DD/YY)
license_status     /<strong>(?:<A[^>]*>)?License Status(?:<\/A>)?:<\/strong>[\s\S]*?size=2>([^<]+)/
issued_date        /<strong>(?:<A[^>]*>)?(?:Salesperson|Broker|Corporation|Officer) License Issued(?:<\/A>)?:<\/strong>[\s\S]*?size=2>([^<]+)/
```

For the Comment / Disciplinary section, capture every `<tr>` whose left
`<td>` `<strong>` is empty (sub-rows) starting from the `Comment:` row
until the trailing sentinel `>>>> Public information request complete <<<<`.
Then walk forward to capture `Disciplinary or Formal Action Documents:`
links — each `H#####FR_YYMMDD_*.pdf` filename is a separate document.

### 4. Validate with Zod

```ts
const License = z.object({
  success: z.literal(true),
  license_id: z.string().regex(/^\d{8}$/),
  licensee_name: z.string(),
  license_type: z.enum(["SALESPERSON", "BROKER", "OFFICER", "CORPORATION"]),
  license_status: z.enum([
    "LICENSED", "EXPIRED", "REVOKED", "SUSPENDED",
    "SURRENDERED", "CANCELED", "DELINQUENT"
  ]).optional(),                                   // omitted on OFFICER rows
  expiration_date: z.string().regex(/^\d{2}\/\d{2}\/\d{2}$/).optional(),
  issued_date:    z.string().regex(/^\d{2}\/\d{2}\/\d{2}$/).optional(),
  mailing_address: z.string(),
  address_unreliable: z.boolean().default(false),  // see Gotchas
  former_names: z.array(z.string()).default([]),
  responsible_broker: z.object({
    license_id: z.string(), name: z.string(), address: z.string()
  }).nullable().optional(),                        // SALESPERSON-only
  affiliated_corporations: z.array(z.object({
    license_id: z.string(), name: z.string(), status: z.string()
  })).default([]),                                 // BROKER / OFFICER
  licensed_officers: z.array(z.object({
    license_id: z.string(), name: z.string(),
    expiration_date: z.string(), role: z.string().optional()
  })).default([]),                                 // CORPORATION
  affiliated_salespersons_count: z.number().optional(), // CORPORATION
  dbas: z.array(z.object({ name: z.string(), period: z.string() })).default([]),
  branches: z.array(z.string()).default([]),
  disciplinary_actions: z.array(z.string()).default([]),
  disciplinary_documents: z.array(z.string()).default([]),
});
const NotFound = z.object({
  success: z.literal(false),
  license_id: z.string(),
  error_reasoning: z.literal("License ID not found in DRE database"),
});
export const Result = z.union([License, NotFound]);
```

### Browser Fallback

Only if HTTP isn't an option (sandbox blocks outbound fetch, etc.):

```bash
sid=$(browse cloud sessions create --keep-alive | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$sid"
browse open "https://www2.dre.ca.gov/publicasp/pplinfo.asp?License_id=01974439" --remote
browse get html body --remote   # then apply regex above
browse cloud sessions update "$sid" --status REQUEST_RELEASE
```

**Do NOT** use `browse click` on the form's `Find` submit button — see Site-Specific Gotchas: it tears down the CDP socket mid-navigation.

## Site-Specific Gotchas

- **The form `submit()` tears down the CDP connection.** Calling `browse click @<find-button-ref>` (or `document.entry_form.submit()` via `browse eval`) on this page reliably kills the CDP socket with `socket-close code=1006`, leaving the session in a wedged state that requires `browse stop --force` + reopen. The deep-link `GET ?License_id=...` avoids this entirely. If you must POST, do it via in-page `fetch()` (which does not navigate) rather than the form's native submit.
- **Not-found returns 200 OK + the empty form page (~18 KB), not 4xx.** Detect by absence of `License Type:` in the body. Status code alone is not a signal.
- **OFFICER rows omit `License Status` and `Expiration Date` at the top level.** Their status is encoded in the `Affiliated Licensed Corporation(s)` sub-row (e.g. `OFFICER LICENSE EXPIRED AS OF 11/03/09`). Don't error if those top-level fields are missing on a `License Type: OFFICER` record.
- **Disciplinary action lives in two places, not one.** Clean records show `NO DISCIPLINARY ACTION` followed by `NO OTHER PUBLIC COMMENTS` under the `Comment:` row. Records with active discipline replace the first line with date-stamped entries (e.g. `12/03/25 - REVOKED PER H-03611-FR`) and add a `Disciplinary or Formal Action Documents:` block of PDF filenames (`H03611FR_251203_P.pdf`). The PDFs are served from `https://www2.dre.ca.gov/publicasp/disciplinary/<filename>.pdf` — but the lookup page only exposes the bare filenames, so you must construct the URL yourself. Confirmed `2026-05-26`: filenames in our trace resolve at that path.
- **Pursuant to Business & Professions Code §10083.2(c), some disciplinary information may have been removed from the public record.** The header disclaimer states discipline info may still be available on written request. The skill cannot surface what isn't in the response — when reporting "no disciplinary action," note that this reflects only the public record.
- **`(Above address is marked unreliable in DRE database)` is a parenthetical note** that appears under the mailing address for some licensees (e.g. license `01974439`). It is sibling text, not part of the address — strip it and surface as a separate boolean (`address_unreliable: true`).
- **Date format is two-digit year (`MM/DD/YY`).** Pre-2000 issue dates exist (license `00600964` issued long before 2000), so naïve `20YY` expansion can be wrong — but DRE displays only the 2-digit form. Keep the raw `MM/DD/YY` string and let the caller decide on century resolution; do not auto-expand.
- **License IDs are zero-padded 8-digit strings.** The endpoint silently coerces shorter numerics (`?License_id=1974439` works for `01974439`), but always send the canonical zero-padded form — some downstream parsers compare strings, not integers.
- **Corporation records can be very large (~75 KB+)** when the entity has many DBAs, branches, and officers. Plan for streaming or chunked parsing. The Salespersons list is *not* inlined — it shows only a count and a `RETRIEVE SALESPERSON LIST` button that POSTs to a separate endpoint. If you need the full salesperson roster for a corp, that is a follow-up call (out of scope for this skill).
- **Search-by-name (`POST h_nextstep=SEARCH&LICENSEE_NAME=Smith&CITY_STATE=&LICENSE_ID=`) returns a large flat list (~2 MB for common surnames like Smith).** Each item is `<a href="pplinfo.asp?License_id=XXXXXXXX">XXXXXXXX</a></td> <td> {Name} </td><td>{Type}</td><td>{City}</td>` — useful as a discovery step when the caller has only the licensee's name. There is no pagination; the response is one giant `<table>`.
- **There is a "new" lookup at `https://pplinfo2.dre.ca.gov/`** (referenced in a commented-out `<meta refresh>` in the page head). At time of writing (2026-05-26) the redirect is disabled and `pplinfo2.dre.ca.gov` is **not** a stable alternative — stick with `www2.dre.ca.gov/publicasp/pplinfo.asp`.
- **The `<head>` of the response varies by code path.** The detail-page success response has a minimal `<head>` (no CSS stylesheet imports, no navigation chrome); the form / not-found response has the full ~14 KB site chrome. This is the cheapest size-based heuristic: detail < 10 KB, not-found ≈ 18 KB.
- **No `Cache-Control` on detail pages** (`Cache-Control: private`). Each request hits the IIS app server. Empirical throughput from us-west-2 to DRE is ~1 req/s sustained without any signs of throttling, but be polite — this is a single-server government site.

## Expected Output

### Outcome 1 — Active Corporation (LICENSED)

```json
{
  "success": true,
  "license_id": "01527365",
  "licensee_name": "Compass California III, Inc.",
  "license_type": "CORPORATION",
  "license_status": "LICENSED",
  "expiration_date": "02/25/30",
  "issued_date": "02/26/18",
  "mailing_address": "9454 WILSHIRE BLVD #100, BEVERLY HILLS, CA 90212",
  "address_unreliable": false,
  "former_names": [],
  "licensed_officers": [
    { "license_id": "00625769", "name": "Mehringer, Kathy", "expiration_date": "02/25/30", "role": "DESIGNATED OFFICER" },
    { "license_id": "01396547", "name": "Kraemer, Samuel H", "expiration_date": "11/04/29" }
  ],
  "dbas": [
    { "name": "Beach Homes", "period": "ACTIVE AS OF 11/07/2019" },
    { "name": "Coastal Collective Real Estate", "period": "ACTIVE AS OF 06/30/2023" }
  ],
  "branches": [],
  "affiliated_salespersons_count": 1037,
  "disciplinary_actions": [],
  "disciplinary_documents": []
}
```

### Outcome 2 — Revoked Broker with disciplinary action

```json
{
  "success": true,
  "license_id": "01974439",
  "licensee_name": "Cooper, Demetrius Elijah",
  "license_type": "BROKER",
  "license_status": "REVOKED",
  "expiration_date": "11/14/25",
  "issued_date": "11/15/21",
  "mailing_address": "1527 19TH STREET, SUITE 330, BAKERSFIELD, CA 93301",
  "address_unreliable": true,
  "former_names": [],
  "affiliated_corporations": [
    { "license_id": "02165333", "name": "Astronant Inc.", "status": "OFFICER LICENSE REVOKED AS OF 12/03/25" }
  ],
  "disciplinary_actions": [
    "05/21/25 - H-03611 FR",
    "12/03/25 - REVOKED PER H-03611-FR"
  ],
  "disciplinary_documents": [
    "H03611FR_250521_P.pdf",
    "H03611FR_251203_P.pdf"
  ]
}
```

### Outcome 3 — Expired Salesperson (clean record, no responsible broker)

```json
{
  "success": true,
  "license_id": "01780940",
  "licensee_name": "Smith, Apryl Carthan",
  "license_type": "SALESPERSON",
  "license_status": "EXPIRED",
  "expiration_date": "11/07/10",
  "issued_date": "11/08/06",
  "mailing_address": "29223 STARFALL WAY, SAUGUS, CA 91390",
  "address_unreliable": false,
  "former_names": [],
  "responsible_broker": null,
  "disciplinary_actions": [],
  "disciplinary_documents": []
}
```

### Outcome 4 — Active Salesperson with current responsible broker

```json
{
  "success": true,
  "license_id": "01335841",
  "licensee_name": "Haley, Gregory James",
  "license_type": "SALESPERSON",
  "license_status": "LICENSED",
  "expiration_date": "04/13/30",
  "issued_date": "08/07/02",
  "mailing_address": "2249 E POWERS AVE, FRESNO, CA 93720",
  "address_unreliable": false,
  "former_names": [],
  "responsible_broker": {
    "license_id": "02137475",
    "name": "Universal Realty Services, Inc.",
    "address": "1520 SHAW AVE, CLOVIS, CA 93611"
  },
  "disciplinary_actions": [],
  "disciplinary_documents": []
}
```

### Outcome 5 — License ID not found

```json
{
  "success": false,
  "license_id": "99999999",
  "error_reasoning": "License ID not found in DRE database"
}
```
