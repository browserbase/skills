---
name: www2-dre-ca-gov-ca-real-estate-license-verify-yr5aua
title: California DRE Real Estate License Verification
description: >-
  Verify a California Department of Real Estate license number against the DRE
  public license lookup. Returns licensee name, type
  (salesperson/broker/corporation), status, expiration, mailing address,
  affiliated entities, and disciplinary-action history. Zod-validated.
  Read-only.
website: www2.dre.ca.gov
category: government
tags:
  - real-estate
  - license-verification
  - california
  - government
  - compliance
  - read-only
  - public-records
source: 'browserbase: agent-runtime 2026-05-26'
updated: '2026-05-26'
recommended_method: fetch
alternative_methods:
  - method: fetch
    rationale: >-
      The public license lookup serves the full record over plain HTTP GET at
      https://www2.dre.ca.gov/publicasp/pplinfo.asp?License_id={ID}. No
      authentication, cookies, anti-bot stealth, or proxies required — confirmed
      200 OK in ~200ms from sandbox IP across all variants (salesperson, broker,
      corporation, restricted, not-found).
  - method: browser
    rationale: >-
      Required only when the caller provides a name (not an ID) and needs to
      drive the form on pplinfo.asp. For ID-based lookups, the browser is
      strictly slower than the fetch path.
  - method: cli
    rationale: >-
      Equivalent to fetch — a single curl POST against the form endpoint
      (pplinfo.asp?start=1) with h_nextstep=SEARCH + LICENSEE_NAME / CITY_STATE
      / LICENSE_ID form fields. Same response shape as the GET deep-link.
verified: false
proxies: false
---
# California DRE Real Estate License Verification

## Purpose

Given an 8-digit California Department of Real Estate (DRE) license ID, return the licensee's name, license type (`SALESPERSON` | `BROKER` | `CORPORATION`), status, expiration date, mailing address, license-issued date, and any disciplinary-action comments. Read-only — never modifies any DRE record.

The skill targets the **public license lookup** at `www2.dre.ca.gov/publicasp/pplinfo.asp` — the same surface DRE links to from its "Verify a License" consumer page. No authentication, cookies, or anti-bot stealth is required.

## When to Use

- A consumer or compliance flow verifying that a CA real-estate licensee is currently licensed before transacting.
- A brokerage onboarding agents and confirming each rep's license status + responsible-broker affiliation.
- A title/escrow workflow validating the listing agent's license number against name on a purchase contract.
- Background-check / due-diligence pipelines pulling disciplinary-action records.

## Workflow

The public lookup serves the full record over plain HTTP GET — the form on `pplinfo.asp` is cosmetic. A single request retrieves the same HTML the form-POST flow produces.

### Recommended: Single HTTP GET deep-link

```bash
curl -s "https://www2.dre.ca.gov/publicasp/pplinfo.asp?License_id=01400000"
```

Or via `browse cloud fetch` (no `--proxies`, no `--verified` — the site has no anti-bot):

```bash
browse cloud fetch "https://www2.dre.ca.gov/publicasp/pplinfo.asp?License_id=${ID}"
```

The response is a ~5–10 KB HTML page (200 OK, `Content-Type: text/html`, `Server: Microsoft-IIS/10.0`, `X-Powered-By: ASP.NET`). The license-information table sits between the `License Type:` label and the `>>>> Public information request complete <<<<` sentinel.

1. **Build the URL.** `https://www2.dre.ca.gov/publicasp/pplinfo.asp?License_id={ID}` where `{ID}` is the license number. Param name is case-insensitive — `License_id`, `license_id`, `LICENSE_ID`, and the URL-encoded form `License%5Fid` all work. Zero-padding to 8 digits is conventional but not required (`1400000` and `01400000` both resolve; **more than 8 digits returns NOTFOUND**).

2. **Send a plain GET.** No headers required. Session cookies (`ASPSESSIONID*`) are issued but not validated for `License_id=` queries.

3. **Detect NOTFOUND.** If the response contains the substring `No matching public record was found for License ID:` → emit `{ "found": false, "license_id": "..." }`. The HTML returns the search form, not a 404 status; success/failure must be detected from the body.

4. **Extract fields.** All fields live in a `<table>` of `<tr valign="top"><td><strong>Label:</strong></td><td>Value</td></tr>` rows. Some labels are wrapped in `<A HREF>` (`License Status`, `Comment`, `{Type} License Issued`, `Former Responsible Broker`). Multi-line values use `<br/>` separators (e.g., address line 1 `<br/>` city/state/zip).

   Reliable regex per field (case-insensitive, dot-all):

   ```js
   const grab = (label) => {
     const re = new RegExp(
       `<strong>(?:<a[^>]*>)?${label}(?:</a>)?:</strong>[^]*?size=2>([^<]+)`,
       'i'
     );
     const m = html.match(re);
     return m ? m[1].trim() : null;
   };
   const licenseType  = grab('License Type');     // "SALESPERSON" | "BROKER" | "CORPORATION"
   const name         = grab('Name');
   const licenseId    = grab('License ID');
   const expiration   = grab('Expiration Date');  // "MM/DD/YY"
   const status       = grab('License Status');   // see status enum below
   const issuedDate   = grab('(?:Salesperson|Broker|Corporation) License Issued');
   const comment      = grab('Comment');          // "NO DISCIPLINARY ACTION" or text
   const mailingAddr  = grab('Mailing Address');  // "<line1><br/>CITY, ST ZIP"
   const formerNames  = grab('Former Name\\(s\\)');
   ```

5. **Type-specific extras.** Parse the type-specific blocks:
   - **SALESPERSON** → `Responsible Broker` row (linked License_id + brokerage name + address) and optional `Former Responsible Broker` rows.
   - **BROKER (individual)** → `Affiliated Licensed Corporation(s)` — one or more `<A HREF="pplinfo.asp?License_id=NNNNNNNN">NNNNNNNN</A>` links followed by the corporation name and expiration. Inactive officer affiliations carry an `OFFICER LICENSE EXPIRED AS OF MM/DD/YY` suffix.
   - **CORPORATION** → `Licensed Officer(s)` row containing `DESIGNATED OFFICER` and a linked License_id for the broker-officer.
   - All types → `Main Office`, `DBA`, `Branches` (corp/broker), `NO OTHER PUBLIC COMMENTS` sentinel.

6. **Detect disciplinary action.** Two independent signals:
   - **`Comment:` row** ≠ literal string `NO DISCIPLINARY ACTION` → disciplined. The cell text is a free-form history (e.g., `06/15/81 - DENIED W/RTR LIC ON T/C PER H-1660 SAC`). Multiple comment rows may follow.
   - **`License Status:` value contains `*** RESTRICTED ***`** (e.g., `EXPIRED *** RESTRICTED ***`) → restricted/disciplined.
   - Treat the licensee as having a disciplinary record if **either** signal fires. Pass the raw comment text(s) through.

7. **Stamp the as-of date.** The page prints `License information taken from records of the Department of Real Estate on M/D/YYYY H:MM:SS AM/PM` — capture this for output provenance.

8. **Validate with Zod.** A reference schema for the canonical output is in **Expected Output**. Apply at the boundary so downstream consumers get a stable shape regardless of which license-type variant came in.

### Browser fallback — name search

When the caller only has a name (no license ID), use a browser session against the form:

```bash
SID=$(browse cloud sessions create --keep-alive | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$SID"
browse open "https://www2.dre.ca.gov/publicasp/pplinfo.asp" --remote
browse wait load --remote
browse snapshot --remote   # textbox refs: LICENSEE_NAME, CITY_STATE, LICENSE_ID
# Use refs from the snapshot — typically [2-25] / [2-26] / [2-27] and Find button [2-341]
browse fill "@<NAME_REF>" "Last, First" --remote
browse click "@<FIND_BUTTON_REF>" --remote
browse wait load --remote
browse get markdown body --remote
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

The form is `<form method="post" name="entry_form" action="pplinfo.asp?start=1">` with three text inputs (`LICENSEE_NAME` 40 chars, `CITY_STATE` 30 chars, `LICENSE_ID` 8 chars) and a hidden `h_nextstep=SEARCH`. A name search returns a **results list** (multiple matches) — click each row to reach the same single-license detail page the GET deep-link returns, then apply the parsing logic from steps 4–8.

Alternative direct-POST (no browser):

```bash
curl -s -X POST "https://www2.dre.ca.gov/publicasp/pplinfo.asp?start=1" \
  --data-urlencode "h_nextstep=SEARCH" \
  --data-urlencode "LICENSEE_NAME=Last, First" \
  --data-urlencode "CITY_STATE=" \
  --data-urlencode "LICENSE_ID="
```

(The form-POST returns the same HTML the browser does; the only reason to use a browser is when you need to click into a result row from the list.)

## Site-Specific Gotchas

- **The form is cosmetic for ID lookups.** `pplinfo.asp?License_id={ID}` (GET) returns the same detail page that the form's POST flow produces — no session cookie, no CSRF, no Referer required. Don't drive the form unless you need name search.
- **Plain HTTP, no anti-bot.** The site is classic IIS/ASP. Bare `curl` works; **do NOT use `--proxies --verified`** — it just adds latency. Verified with direct `browse cloud fetch` from sandbox IP, 200 OK in ~200ms per request.
- **`License_id` param name is case-insensitive.** `License_id`, `license_id`, `LICENSE_ID`, and `License%5Fid` (URL-encoded underscore — seen in DRE's own internal links) all resolve. Prefer `License_id` for consistency with DRE's published URLs.
- **Leading zeros optional, but >8 digits = NOTFOUND.** `1400000` and `01400000` both resolve to the same record. `000001400000` (12 digits) returns NOTFOUND. Normalize input by stripping non-digits then accepting 1–8 digit values.
- **NOTFOUND is 200 OK, not 404.** Detect failure from the body string `No matching public record was found for License ID:`, not from HTTP status. The not-found response also re-renders the search form above the message.
- **`License Status` enum is rich.** Observed values: `LICENSED`, `LICENSED NBA` (broker with No Broker Affiliation — i.e., not currently sponsoring salespersons), `EXPIRED`, `EXPIRED *** RESTRICTED ***`, `WITHHELD DENIED`, plus less-common combos (`*** RESTRICTED ***` may appear with other prefixes). Treat anything containing `*** RESTRICTED ***` as a disciplinary signal; treat `LICENSED` (with or without `NBA`) as currently valid.
- **`Expiration Date` is not always a date.** For records under temporary licenses it can be a sentence like `Temporary License issued through 01/04/96`. Schema must accept a free-form string here, not just `MM/DD/YY`.
- **Disciplinary signal lives in two places.** The `Comment:` row carries the disciplinary history text (free-form, multi-line), and the `License Status` may also include `*** RESTRICTED ***`. Either-or — confirm with both. The literal sentinel for "no discipline" is exactly the string `NO DISCIPLINARY ACTION`; anything else in the Comment field is real discipline content.
- **Type-specific row sets differ.** SALESPERSON has `Responsible Broker` (linked License_id of the brokerage). BROKER has `Affiliated Licensed Corporation(s)` (zero or more linked License_ids; expired ones tagged `OFFICER LICENSE EXPIRED AS OF MM/DD/YY`). CORPORATION has `Licensed Officer(s)` with a `DESIGNATED OFFICER` linked License_id. Don't assume all rows exist on every record.
- **Multi-value cells use `<br/>`.** Mailing-address and former-DBA cells concatenate lines with `<br/>` and no comma — `109 BAYSIDE PL<br/>CORONA DEL MAR, CA 92625`. Split on `<br/>` and re-assemble for normalization.
- **License Issued row is type-prefixed and "Unofficial" for old records.** Field is labelled `Salesperson License Issued`, `Broker License Issued`, or `Corporation License Issued`. For pre-1980-ish issuances, value carries the suffix `(Unofficial -- taken from secondary records)`. Strip the suffix or surface it as a confidence flag.
- **Page footer "Public information request complete" sentinel.** The literal string `>>>> Public information request complete <<<<` always terminates a successful response. Useful as a parsing fence and as a signal that the page rendered fully.
- **As-of timestamp is in the page body.** `License information taken from records of the Department of Real Estate on M/D/YYYY H:MM:SS AM/PM` — capture for provenance. DRE notes it does not include pending licensing changes.
- **There is a separate site at `pplinfo2.dre.ca.gov`.** The current `pplinfo.asp` HTML has a commented-out `<meta http-equiv="refresh">` pointing at `https://pplinfo2.dre.ca.gov/`. It's not active today (2026-05-26) — the comment confirms it was disabled. If DRE re-enables the redirect, the new site's URL pattern may differ; check for a redirect before assuming this skill still works.
- **No formal rate limit observed**, but keep requests ≤ 2 req/s — this is a state government IIS box. The ASP session cookie issued on each request is not validated for `License_id=` lookups but holding requests to a polite rate is courteous.
- **Disciplinary-action documents are not on this page.** The DRE main site links to PDFs under `/Licensees/DisciplinaryActions.html`, but those are not cross-referenced from the per-license detail page. The `Comment:` field summarizes discipline; full case documents must be fetched separately if needed.
- **Address-lookup is a different surface.** The form links to `https://secure.dre.ca.gov/addresslookup` for searching by office address — distinct skill, not covered here.

## Expected Output

Zod-validated shape (TypeScript reference):

```ts
import { z } from 'zod';

const AffiliatedEntity = z.object({
  license_id: z.string(),
  name: z.string(),
  expiration_date: z.string().nullable(),
  active: z.boolean(),                      // false if marked "OFFICER LICENSE EXPIRED AS OF ..."
  expired_as_of: z.string().nullable(),     // present when active === false
});

const DRELicenseRecord = z.discriminatedUnion('found', [
  z.object({
    found: z.literal(false),
    license_id: z.string(),                 // echoed back from the input
    as_of: z.string(),                      // server-side "License information taken from records ... on M/D/YYYY ..." capture
  }),
  z.object({
    found: z.literal(true),
    license_id: z.string(),                 // canonical 8-digit form
    license_type: z.enum(['SALESPERSON', 'BROKER', 'CORPORATION']),
    name: z.string(),
    mailing_address: z.string(),            // raw multi-line concatenated
    expiration_date: z.string(),            // "MM/DD/YY" or free-form sentence for temporary licenses
    license_status: z.string(),             // e.g. "LICENSED", "LICENSED NBA", "EXPIRED", "EXPIRED *** RESTRICTED ***", "WITHHELD DENIED"
    issued_date: z.string().nullable(),     // "MM/DD/YY"; may carry "(Unofficial -- taken from secondary records)" suffix
    issued_date_unofficial: z.boolean(),
    former_names: z.array(z.string()),      // [] if "NO FORMER NAMES"
    main_office: z.string().nullable(),     // present for BROKER/CORPORATION
    dbas: z.array(z.string()),              // [] if "NO CURRENT DBAS"
    branches: z.array(z.string()),          // [] if "NO CURRENT BRANCHES"
    // Type-specific blocks:
    responsible_broker: AffiliatedEntity.nullable(),       // SALESPERSON only
    former_responsible_brokers: z.array(AffiliatedEntity), // SALESPERSON only
    affiliated_corporations: z.array(AffiliatedEntity),    // BROKER only
    licensed_officers: z.array(AffiliatedEntity),          // CORPORATION only
    // Discipline:
    has_disciplinary_action: z.boolean(),   // status contains "*** RESTRICTED ***" OR comment != "NO DISCIPLINARY ACTION"
    is_restricted: z.boolean(),             // status contains "*** RESTRICTED ***"
    disciplinary_comments: z.array(z.string()), // [] if "NO DISCIPLINARY ACTION"
    other_public_comments: z.array(z.string()), // entries between "Comment:" block and the sentinel
    as_of: z.string(),                      // server-side timestamp from page body
  }),
]);
```

### Example: active SALESPERSON (no discipline)

```json
{
  "found": true,
  "license_id": "01400000",
  "license_type": "SALESPERSON",
  "name": "Cohen, Matthew Jacob",
  "mailing_address": "3232 QUANDT ROAD, LAFAYETTE, CA 94549",
  "expiration_date": "08/02/28",
  "license_status": "LICENSED",
  "issued_date": "11/08/03",
  "issued_date_unofficial": false,
  "former_names": ["Cohen, Matthew Jacob"],
  "main_office": null,
  "dbas": [],
  "branches": [],
  "responsible_broker": {
    "license_id": "01999173",
    "name": "Synesis Advisors, Inc.",
    "expiration_date": null,
    "active": true,
    "expired_as_of": null
  },
  "former_responsible_brokers": [
    {
      "license_id": "01999173",
      "name": "Synesis Advisors, Inc. (08/03/2020–02/05/2024)",
      "expiration_date": null,
      "active": false,
      "expired_as_of": null
    }
  ],
  "affiliated_corporations": [],
  "licensed_officers": [],
  "has_disciplinary_action": false,
  "is_restricted": false,
  "disciplinary_comments": [],
  "other_public_comments": [],
  "as_of": "5/26/2026 9:49:04 AM"
}
```

### Example: active BROKER with multiple affiliated corporations

```json
{
  "found": true,
  "license_id": "00372156",
  "license_type": "BROKER",
  "name": "Moss, Jay Lawrence",
  "mailing_address": "109 BAYSIDE PL, CORONA DEL MAR, CA 92625",
  "expiration_date": "02/15/28",
  "license_status": "LICENSED",
  "issued_date": "08/31/73",
  "issued_date_unofficial": true,
  "former_names": [],
  "main_office": "109 BAYSIDE PL, CORONA DEL MAR, CA 92625",
  "dbas": ["Development Dimensions (ACTIVE FROM 11/03/1975 TO 04/30/1993)"],
  "branches": [],
  "responsible_broker": null,
  "former_responsible_brokers": [],
  "affiliated_corporations": [
    { "license_id": "01527203", "name": "Real Estate Dimensions, Inc.", "expiration_date": "12/01/27", "active": true,  "expired_as_of": null },
    { "license_id": "00242327", "name": "KB HOME Sales-Southern California Inc", "expiration_date": "02/02/91", "active": false, "expired_as_of": "02/03/91" },
    { "license_id": "00746787", "name": "Housing Dimensions Inc", "expiration_date": "08/14/87", "active": false, "expired_as_of": "08/15/87" }
  ],
  "licensed_officers": [],
  "has_disciplinary_action": false,
  "is_restricted": false,
  "disciplinary_comments": [],
  "other_public_comments": [],
  "as_of": "5/26/2026 9:46:13 AM"
}
```

### Example: CORPORATION with designated officer

```json
{
  "found": true,
  "license_id": "01527203",
  "license_type": "CORPORATION",
  "name": "Real Estate Dimensions, Inc.",
  "mailing_address": "109 BAYSIDE PL, CORONA DEL MAR, CA 92625",
  "expiration_date": "12/01/27",
  "license_status": "LICENSED",
  "issued_date": "12/02/15",
  "issued_date_unofficial": false,
  "former_names": [],
  "main_office": "109 BAYSIDE PL, CORONA DEL MAR, CA 92625",
  "dbas": [],
  "branches": [],
  "responsible_broker": null,
  "former_responsible_brokers": [],
  "affiliated_corporations": [],
  "licensed_officers": [
    {
      "license_id": "00372156",
      "name": "Moss, Jay Lawrence (DESIGNATED OFFICER)",
      "expiration_date": "12/01/27",
      "active": true,
      "expired_as_of": null
    }
  ],
  "has_disciplinary_action": false,
  "is_restricted": false,
  "disciplinary_comments": [],
  "other_public_comments": [],
  "as_of": "5/26/2026 9:45:55 AM"
}
```

### Example: restricted / disciplined SALESPERSON

```json
{
  "found": true,
  "license_id": "00800000",
  "license_type": "SALESPERSON",
  "name": "Hasek, Donna Marie",
  "mailing_address": "ONE MANDARIN, IRVINE, CA 92714",
  "expiration_date": "05/28/96",
  "license_status": "EXPIRED *** RESTRICTED ***",
  "issued_date": "06/15/81",
  "issued_date_unofficial": true,
  "former_names": [],
  "main_office": null,
  "dbas": [],
  "branches": [],
  "responsible_broker": null,
  "former_responsible_brokers": [],
  "affiliated_corporations": [],
  "licensed_officers": [],
  "has_disciplinary_action": true,
  "is_restricted": true,
  "disciplinary_comments": ["06/15/81 - DENIED W/RTR LIC ON T/C PER H-1660 SAC"],
  "other_public_comments": [],
  "as_of": "5/26/2026 9:48:17 AM"
}
```

### Example: not found

```json
{
  "found": false,
  "license_id": "02000000",
  "as_of": "5/26/2026 9:48:00 AM"
}
```
