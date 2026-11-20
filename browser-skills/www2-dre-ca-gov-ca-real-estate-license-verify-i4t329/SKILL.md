---
name: www2-dre-ca-gov-ca-real-estate-license-verify-i4t329
title: California DRE License Verification
description: >-
  Verify a California real estate license by license ID or licensee/company
  name. Returns license type, status, expiration, MLO endorsement (NMLS ID),
  broker affiliation, branches/DBAs, and disciplinary-comment block.
  Distinguishes found, multi-match, and not-found outcomes for both ID and name
  lookups.
website: www2.dre.ca.gov
category: government
tags:
  - california
  - real-estate
  - license-verification
  - government
  - regulatory
  - dre
  - nmls
source: 'browserbase: agent-runtime 2026-05-22'
updated: '2026-05-22'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      Fallback only — the legacy ASP form is fully scriptable via browse
      fill/click, but it pays a multi-round-trip cost premium over a single HTTP
      request. Use only if direct *.ca.gov egress is firewalled.
verified: false
proxies: false
---
# California DRE License Verification

## Purpose

Given a California Department of Real Estate (DRE) license ID (8 digits, zero-padded) — or a licensee/company name — return the public license record: license type, name, mailing address, license status, expiration date, original issue date(s), MLO (NMLS) endorsement if any, broker affiliation, branches/DBAs (for brokers), and the public disciplinary-comment block. Read-only — never submits complaints or modifies state. Assumed interpretation: the caller wants to **verify** a license (is it real, what's its status), not enumerate the entire CA licensee roster.

## When to Use

- Confirm a self-identified California real estate agent or broker is actually licensed before signing a listing agreement, offer, or referral fee.
- Cross-check a licensee's NMLS / MLO endorsement before sending mortgage-related business.
- Bulk-validate a list of California licensees against the canonical DRE roster.
- Look up a licensee by name when the consumer only knows "the Smith from Coldwell Banker in Van Nuys" — and disambiguate among the multi-match list.

## Workflow

The DRE public-license-info site (`www2.dre.ca.gov/PublicASP/pplinfo.asp`) is a stateless classic-ASP form. It has **no anti-bot**, no cookies/session state, no CSRF tokens, no rate-limit headers, no auth, and no JavaScript dependency — the HTML response contains all the data inline. **Lead with plain HTTP, fall back to scripted browsing only if your network egress is somehow blocked from `*.ca.gov`.**

### 1. License-ID lookup (fastest path — GET deep-link)

When you have an 8-digit license ID, hit the detail page directly:

```
GET https://www2.dre.ca.gov/PublicASP/pplinfo.asp?License_id={ID}
```

- `{ID}` is the 8-digit zero-padded license number (e.g. `01244122`, `00142888`, `02058710`). Strip any non-digit characters from caller input, then left-zero-pad to 8.
- No headers required. No `Referer`. No proxies. No User-Agent gating observed.
- Response is HTML; status is always `200` — the not-found case is signalled in the body, **not** by an HTTP error code (see Gotchas).

Verified on 2026-05-22 via bare `browse cloud fetch` (no `--proxies`, no `--verified`, no browser session): single round-trip, ~6.5KB response, full data inline.

### 2. Name / company lookup (POST search)

When you have a person or company name instead of an ID:

```
POST https://www2.dre.ca.gov/PublicASP/pplinfo.asp?start=1
Content-Type: application/x-www-form-urlencoded

h_nextstep=SEARCH&LICENSEE_NAME={Last%2C+First}&CITY_STATE={optional+city}&LICENSE_ID=
```

- `LICENSEE_NAME` format is `Last, First` (comma + space, URL-encoded as `%2C+`). For company / DBA / corporation lookups, supply the whole company name in the same field (e.g. `Coldwell+Banker`). The DRE site does not have a separate "company" field.
- `CITY_STATE` is optional — when present, restricts results to licensees whose **mailing-address city** matches. Note: this is mailing address, **not** main-office or branch-office city (see Gotchas).
- `LICENSE_ID` must be present-but-empty when doing a name search; the field name is mandatory in the body.
- `h_nextstep=SEARCH` is required — it's the form's hidden state token.

If exactly one record matches, the response is the full detail page (same shape as step 1). If many match, the response is a multi-row table.

### 3. Parse the detail-page response

The detail page uses a fixed `<strong>{Label}:</strong>` + `<td>{VALUE}</td>` pattern (legacy ASP with `<FONT FACE="Arial,Helvetica">` wrappers around every cell). Extract by regex `<strong>([^<]+):</strong>[\s\S]*?<td[^>]*>(?:<FONT[^>]*>)?([^<]+(?:<br/>[^<]+)*)` (or use cheerio for cleaner parsing). The full set of labels observed across all license types:

| Field | Always present? | Notes |
|---|---|---|
| `License Type` | yes | `SALESPERSON`, `BROKER`, `BROKER/OFFICER`, `OFFICER`, `CORPORATION`, `DBA` |
| `Name` | yes | `Last, First [Middle/Suffix]` for persons; company name for corps/DBAs |
| `Mailing Address` | yes | Multi-line, `<br/>`-joined; may be `< NO ADDRESS INFORMATION >` |
| `License ID` | yes | Echoes the 8-digit ID |
| `Expiration Date` | yes | `MM/DD/YY` (2-digit year) |
| `License Status` | yes | `LICENSED`, `EXPIRED`, `REVOKED`, `SUSPENDED`, plus rarer states — see `https://www2.dre.ca.gov/static/licstatus.htm` |
| `MLO License Endorsement` | only if MLO-endorsed | Body contains `NMLS ID: {nmlsId}` plus a link to `nmlsconsumeraccess.org/entitydetails.aspx/individual/{nmlsId}` — use this for cross-verification of mortgage-licensed agents |
| `Salesperson License Issued` | persons only | `MM/DD/YY`. May carry the suffix `(Unofficial -- taken from secondary records)` when the issue predates DRE's primary digital records |
| `Broker License Issued` | brokers only | `MM/DD/YY` |
| `Former Name(s)` | yes | `NO FORMER NAMES` when none |
| `Responsible Broker` | salespersons only | `NO CURRENT RESPONSIBLE BROKER` when an unaffiliated/lapsed salesperson |
| `Main Office` | brokers only | Multi-line address |
| `DBA` | brokers only | `NO CURRENT DBAS` or a list — entries can be flagged `(Canceled DBA Name)` |
| `Branches` | brokers only | `NO CURRENT BRANCHES` or a list |
| `Affiliated Licensed Corporation(s)` | brokers/officers only | List of `{corpLicenseId}` (linked) + Officer Expiration Date + corp Name |
| `Comment` | yes | `NO DISCIPLINARY ACTION` is the all-clear value. **Anything else here is the disciplinary-history flag — surface it prominently.** |

Termination marker: the body ends with `>>>> Public information request complete <<<<`. Treat its presence as your "the response is a complete detail page (not the search form, not a multi-result table)" sentinel.

### 4. Parse the multi-match list response

When step 2 returns a list, the response contains the literal string `{X} to {Y} of {N} matches` and a `<table … id="nonsortabletable">` with one `<tr>` per licensee. Columns (in document order):

1. `License ID` — wrapped in `<a href="pplinfo.asp?License_id={ID}">` — these are the deep-links you'd feed back into step 1 to get full detail.
2. `Name` — `Last, First [Middle/Suffix]`; may be a company name; may carry a trailing `<i>(Canceled DBA Name)</i>` flag.
3. `License Type` — same enum as the detail page.
4. `Mailing Address City` — bare city, may be `< NO ADDRESS INFORMATION >`.
5. `Mortgage Loan Originator` — cell contains `YES` if MLO-endorsed, empty `&nbsp;` otherwise.

For verification purposes you almost always want to follow up with step 1 on each candidate to get full detail (status, expiration, NMLS ID).

### 5. Detect the not-found cases

- License-ID GET that misses: body contains `No matching public record was found for License ID: {ID}` — note the literal ID is echoed back into the message, so you can confirm the server interpreted your input correctly.
- Name POST that misses: body contains `No matching public record was found for Licensee: {NAME-UPPERCASED}` — note the server uppercases the echoed name.

Both still return HTTP `200`. **Do not trust status codes — always grep the body for one of the three terminator phrases**: `Public information request complete`, `matches` (with the digit-prefix), or `No matching public record was found`.

### Browser fallback

If for some reason direct HTTP is unreachable (corporate egress firewall blocking `*.ca.gov`, IP-level block we haven't observed in testing, etc.):

```bash
sid=$(browse cloud sessions create --keep-alive | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$sid"
browse open "https://www2.dre.ca.gov/PublicASP/pplinfo.asp" --remote
browse wait load --remote
# Fill ONE of LICENSEE_NAME or LICENSE_ID — leave the other blank.
browse fill 'input[name="LICENSE_ID"]' --remote -- "{8-digit-id}"
# OR for name search:
# browse fill 'input[name="LICENSEE_NAME"]' --remote -- "Last, First"
browse click 'input[type=submit][value=Find]' --remote
browse wait load --remote
browse get markdown body --remote
browse cloud sessions update "$sid" --status REQUEST_RELEASE
```

**`--verified` and `--proxies` are not needed** — confirmed via bare `browse cloud fetch` returning 200 with full data. Adding them is pure cost overhead. If the fallback is itself blocked, retry once with `--proxies` to rule out an IP-block.

## Site-Specific Gotchas

- **License ID must be 8 digits, zero-padded**. `1244122` won't match; `01244122` will. Strip non-digits then `String(id).padStart(8, '0')`.
- **No HTTP error codes for "not found"**. The server returns `200 OK` regardless of outcome. The body's terminator phrase is the only reliable success/failure signal — see step 5. Naïve `response.ok` checks will misclassify every not-found case as success.
- **Name search is `Last, First` — comma is mandatory.** `Smith John` returns a different (often empty) result set than `Smith, John`. The form's own help link at `/static/NameHelp.htm` documents this. Companies and corporations are searched in the same field with no comma.
- **Echoed name is uppercased**. The not-found-by-name message uppercases the input (e.g. `ZXQWERTY, BOBNONEXISTENT`). Use case-insensitive matching if echoing back to a user.
- **`CITY_STATE` filter matches mailing-address city, not office city.** The form's own footer warns: "The 'Mailing Address City' may differ from the licensee's main office and/or branch office city." A broker headquartered in San Francisco may list a Palo Alto mailing address and be missed by `CITY_STATE=San+Francisco`. For office-city lookups, use the separate Address Lookup tool at `https://secure.dre.ca.gov/addresslookup`.
- **Single-result auto-redirect**. A name search that matches exactly one record returns the detail page (not a one-row table). Don't assume the search endpoint always returns a list — detect by presence of `Public information request complete`.
- **`pplinfo2.dre.ca.gov` is NOT live**. The HTML contains a commented-out `<meta refresh>` to `https://pplinfo2.dre.ca.gov/`, suggesting a planned modernization. As of 2026-05-22 the host returns `ERR_TUNNEL_CONNECTION_FAILED` — DNS resolves but no listener responds. Confirmed dead. Don't waste time probing it; `www2.dre.ca.gov/PublicASP/pplinfo.asp` is the only working surface.
- **Expiration date is 2-digit year (`MM/DD/YY`)**. License `01000000`'s `12/02/96` is 1996, but `01244122`'s `10/27/28` is 2028. Apply the standard pivot (`YY ≤ 50 → 20YY`, else `19YY`) when computing absolute dates — and double-check status, since EXPIRED + `XX/XX/96` is unambiguous but LICENSED + `XX/XX/28` is the active-2028 case.
- **`Comment: NO DISCIPLINARY ACTION` is the clean-record baseline.** Any other Comment-cell content is the disciplinary signal — disbarments, restrictions, decisions. Don't suppress this field or future agents using this skill will miss the headline reason consumers query DRE in the first place. Linked statute documents (when present) are public PDFs.
- **MLO endorsement is a separate identity (NMLS).** The DRE license verifies CA-state real-estate licensure; the embedded NMLS ID verifies mortgage-loan-originator endorsement and must be cross-checked at `nmlsconsumeraccess.org/entitydetails.aspx/individual/{nmlsId}` for federally-regulated mortgage activity. The DRE detail page itself doesn't expose NMLS status — only the ID.
- **`(Canceled DBA Name)` flag in name-search results**. Multi-match rows for company-name searches may carry a trailing `<i>(Canceled DBA Name)</i>` marker on the Name column. These are historical entries and the underlying license is no longer doing business under that name. Surface the flag to the caller if echoing search results.
- **The hidden `h_nextstep=SEARCH` form field is required**. Posting without it returns the empty form, not a search response. Treat it as a static incantation.
- **Form encoding sensitivity**: `LICENSEE_NAME` containing literal commas must be encoded as `%2C` or `,`; spaces as `+` or `%20`. The server is lenient about either choice but consistent within a single request.

## Expected Output

The skill returns one of five outcome shapes. Each is a single JSON object — never an array — with `success` + `outcome` discriminator fields. All concrete examples below are real responses captured from `www2.dre.ca.gov` on 2026-05-22.

### Outcome 1 — single record found (license-ID lookup, salesperson/expired)

```json
{
  "success": true,
  "outcome": "found",
  "license": {
    "license_id": "01000000",
    "license_type": "SALESPERSON",
    "name": "Diuguid, Norma Jean",
    "mailing_address": "8978 EABY RD BOX 110\nPHELAN, CA 92371",
    "expiration_date": "12/02/96",
    "license_status": "EXPIRED",
    "salesperson_license_issued": "09/06/88",
    "salesperson_license_issued_note": "Unofficial -- taken from secondary records",
    "broker_license_issued": null,
    "former_names": "NO FORMER NAMES",
    "responsible_broker": "NO CURRENT RESPONSIBLE BROKER",
    "mlo_nmls_id": null,
    "main_office": null,
    "dbas": null,
    "branches": null,
    "affiliated_corporations": null,
    "comment": "NO DISCIPLINARY ACTION",
    "other_public_comments": null,
    "retrieved_at": "5/22/2026 1:26:29 PM"
  }
}
```

### Outcome 2 — single record found (broker, active, MLO-endorsed)

```json
{
  "success": true,
  "outcome": "found",
  "license": {
    "license_id": "01244122",
    "license_type": "BROKER",
    "name": "Smith, John Ray Jr",
    "mailing_address": "77564 COUNTRY CLUB DRIVE #202\nPALM DESERT, CA 92211",
    "expiration_date": "10/27/28",
    "license_status": "LICENSED",
    "salesperson_license_issued": "11/03/98",
    "salesperson_license_issued_note": "Unofficial -- taken from secondary records",
    "broker_license_issued": "10/28/08",
    "former_names": "NO FORMER NAMES",
    "responsible_broker": null,
    "mlo_nmls_id": "862197",
    "mlo_nmls_url": "http://www.nmlsconsumeraccess.org/entitydetails.aspx/individual/862197",
    "main_office": "77564 COUNTRY CLUB DRIVE #202\nPALM DESERT, CA 92211",
    "dbas": "NO CURRENT DBAS",
    "branches": "NO CURRENT BRANCHES",
    "affiliated_corporations": [
      { "license_id": "01955975", "name": "Power 1 Properties, Inc.", "officer_expiration_date": "06/24/30" },
      { "license_id": "02251833", "name": "Power 1 Real Estate Services Inc.", "officer_expiration_date": "11/21/28" }
    ],
    "comment": "NO DISCIPLINARY ACTION",
    "other_public_comments": null,
    "retrieved_at": "5/22/2026 1:28:31 PM"
  }
}
```

### Outcome 3 — multi-match (name search returns a list)

```json
{
  "success": true,
  "outcome": "multi_match",
  "total_matches": 105,
  "returned": 105,
  "candidates": [
    { "license_id": "01310197", "name": "Smith, John", "license_type": "Salesperson", "mailing_city": "VAN NUYS", "mlo": false },
    { "license_id": "02033850", "name": "Smith, John", "license_type": "Salesperson", "mailing_city": "VICTORVILLE", "mlo": false },
    { "license_id": "00142888", "name": "Smith, John Alexander Gordon", "license_type": "Broker/Officer", "mailing_city": "SACRAMENTO", "mlo": false },
    { "license_id": "01244122", "name": "Smith, John Ray Jr", "license_type": "Broker/Officer", "mailing_city": "PALM DESERT", "mlo": true }
  ],
  "next_step": "Follow up with Outcome-1/2 detail lookup on the user-selected candidate by GETing pplinfo.asp?License_id={license_id}"
}
```

### Outcome 4 — license ID not found

```json
{
  "success": false,
  "outcome": "not_found",
  "lookup_kind": "license_id",
  "echoed_input": "99999999",
  "message": "No matching public record was found for License ID: 99999999."
}
```

### Outcome 5 — name not found

```json
{
  "success": false,
  "outcome": "not_found",
  "lookup_kind": "name",
  "echoed_input": "ZXQWERTY, BOBNONEXISTENT",
  "message": "No matching public record was found for Licensee: ZXQWERTY, BOBNONEXISTENT"
}
```
