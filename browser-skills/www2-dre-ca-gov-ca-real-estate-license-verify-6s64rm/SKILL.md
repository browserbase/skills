---
name: www2-dre-ca-gov-ca-real-estate-license-verify-6s64rm
title: California DRE Real Estate License Verification
description: >-
  Verify a California real estate license number against the CA Department of
  Real Estate public lookup and return licensee name, type
  (BROKER/SALESPERSON/CORPORATION), status, expiration, addresses, NMLS
  endorsement, affiliated entities, and any public disciplinary actions with
  hearing PDF links.
website: www2.dre.ca.gov
category: licensing-verification
tags:
  - real-estate
  - license-verification
  - california
  - dre
  - compliance
  - government
source: 'browserbase: agent-runtime 2026-05-23'
updated: '2026-05-23'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      Browser fallback works against the POST form (LICENSE_ID input) but is
      strictly slower — the GET endpoint accepts the License_id query parameter
      and returns the same rendered page.
  - method: api
    rationale: >-
      No public JSON API exists. The legacy classic-ASP endpoint at
      www2.dre.ca.gov is the canonical interface. A 'new' site at
      pplinfo2.dre.ca.gov is referenced in HTML comments but currently returns
      500.
verified: false
proxies: false
---
# California DRE Real Estate License Verification

## Purpose

Verify a California real estate license number against the California Department of Real Estate (DRE) public license lookup and return the licensee's structured record: name, license type (BROKER / SALESPERSON / CORPORATION), status, expiration date, issue date(s), main office address, mailing address, MLO/NMLS endorsement, affiliated entities, and any public disciplinary actions or comments (with links to hearing PDFs when present). Strictly read-only — the public lookup is unauthenticated.

## When to Use

- A consumer or compliance system wants to confirm that an agent / broker / corporation holds an active CA real estate license.
- A vendor onboarding flow needs to verify license #, expiration, and clean discipline status before allowing transactions.
- A title / escrow / lender workflow needs the MLO (NMLS) endorsement number associated with a CA broker.
- A due-diligence agent wants the full public record (former names, DBAs, affiliated corporations, disciplinary history with hearing PDFs).

## Workflow

**Optimal path: a single HTTP GET. No form submission needed.** The public form (`pplinfo.asp`) accepts the License ID directly as a query parameter, and the server returns the rendered license record on the same URL. Skip the POST form entirely.

1. **Construct the request URL.** California DRE license numbers are exactly 8 digits, zero-padded (e.g. `01258261`). Build:

   ```
   https://www2.dre.ca.gov/publicasp/pplinfo.asp?License_id=01258261
   ```

   The parameter name is **case-sensitive**: `License_id` (only the `L` is capitalized). `LICENSE_ID` works in the POST form but `License_id` is the canonical GET form used by the site's own outbound links.

2. **Fetch over plain HTTPS.** No headers, cookies, user-agent stealth, or session required. The endpoint is IIS / classic ASP, returns `Content-Type: text/html; charset=UTF-8`, and sets a session cookie you can ignore. Status is always `200` even for not-found (see Site-Specific Gotchas).

3. **Detect the response shape first** — the same URL serves two layouts:
   - **Found** → response body contains `<strong>License Type:</strong>`. Continue to step 4.
   - **Not found** → response body contains `No matching public record was found for License ID:`. Return `{ found: false, license_id, error: "..." }` and stop.

4. **Parse the result table.** The licensee data is a single `<table>` with `<tr>` rows where the first `<td>` is a bolded label (e.g. `<strong>License Type:</strong>`) and the second `<td>` is the value. Strip the heavy `<FONT FACE="...">` wrappers — they're cosmetic noise from a 2010-era template. Map labels to fields:

   | Label in HTML | Field |
   |---|---|
   | `License Type:` | `license_type` — one of `BROKER`, `SALESPERSON`, `CORPORATION` |
   | `Name:` | `name` — `"Last, First Middle"` for persons; full entity name for corps |
   | `Mailing Address:` | `mailing_address` (multiline; join `<br/>` with `\n`) |
   | `License ID:` | `license_id` (8-digit string — preserve leading zeros) |
   | `Expiration Date:` | `expiration_date` — `MM/DD/YY` (2-digit year, see gotcha) |
   | `License Status:` | `status` — `LICENSED`, `LICENSE EXPIRED`, `LICENSE CANCELED`, `LICENSE SURRENDERED`, `LICENSE SUSPENDED`, `LICENSE REVOKED`, etc. See `/static/licstatus.htm` for the full enum |
   | `MLO License Endorsement:` | `mlo_nmls_id` — extract numeric NMLS ID; null if absent |
   | `Salesperson License Issued:` | `salesperson_issued_date` (broker / corp records may show prior salesperson date) |
   | `Broker License Issued:` | `broker_issued_date` (broker only) |
   | `Corporation License Issued:` | `corporation_issued_date` (corporation only) |
   | `Former Name(s):` | `former_names[]` or string `"NO FORMER NAMES"` |
   | `Main Office:` | `main_office_address` |
   | `DBA` | `dbas[]` — each entry has a name and an "ACTIVE AS OF .." or "ACTIVE FROM .. TO .." date range |
   | `Branches:` | `branches[]` or `"NO CURRENT BRANCHES"` |
   | `Affiliated Licensed Corporation(s):` | `affiliated_corporations[]` — broker only — `{license_id, name, officer_expiration_date, status?}` |
   | `Licensed Officer(s):` | `licensed_officers[]` — corporation only — `{role?, license_id, name, expiration_date, status?}` |
   | `Broker Associates:` / `Salespersons:` | `broker_associates[]` / `salespersons[]` — corporation only — `{license_id, name, expiration_date}` |
   | `Broker Associate for:` / `Former Broker Associate for:` | `broker_associate_for[]` / `former_broker_associate_for[]` — list of brokerages the person is currently / formerly affiliated with |
   | `Comment:` | `comments[]` — each row is a separate event; first row is either `NO DISCIPLINARY ACTION` or a dated discipline event. Look for `NO OTHER PUBLIC COMMENTS` as the terminator |
   | `Disciplinary or Formal Action Documents:` | `disciplinary_documents[]` — array of `{filename, url}` pointing to `/hearingfiles/*.pdf`. **Only appears when discipline exists.** |

5. **Return a Zod-validated object.** See `Expected Output` for the canonical shape. `disciplinary_documents` and `comments` fields where they exist are the primary signal of disciplinary history — the existence of any non-empty PDF entry, or any `comments[]` entry that doesn't equal `"NO DISCIPLINARY ACTION"` / `"NO OTHER PUBLIC COMMENTS"`, indicates discipline.

### Browser fallback

Use only if the fetch path returns 5xx or you cannot run an HTTPS client:

1. Navigate to `https://www2.dre.ca.gov/publicasp/pplinfo.asp`.
2. Find the form input with `name="LICENSE_ID"` (uppercase here — the POST form uses a different case than the GET param). Type the 8-digit license number.
3. Click the submit button (`<input type="submit" value="Find">`).
4. The form POSTs to `pplinfo.asp?start=1` with hidden field `h_nextstep=SEARCH`. Wait for the response — it's a full server-rendered page replace.
5. Parse the same table layout described above.

The form has three text inputs (`LICENSEE_NAME`, `CITY_STATE`, `LICENSE_ID`) — only `LICENSE_ID` is needed for license-number lookup. `LICENSEE_NAME` searches by name and returns a results list, which is a different workflow (not covered here).

## Site-Specific Gotchas

- **The endpoint always returns HTTP 200**, even for not-found. Discriminate on body content (`No matching public record was found for License ID:`), not status code.
- **`License_id` (query param) vs `LICENSE_ID` (form field)** — the GET URL uses mixed-case `License_id`; the POST form uses uppercase `LICENSE_ID`. Both work but the canonical GET style is what the site's own internal links use (e.g. `<A HREF="/publicasp/pplinfo.asp?License_id=01769292">`).
- **License IDs are 8-digit zero-padded strings**, not integers. `01258261` ≠ `1258261`. The form input has `maxlength="8"`. Preserve leading zeros.
- **Expiration / issue dates use 2-digit years** (`05/19/28`). Disambiguate yourself — anything `<25` is generally 21st century and `>=80` 20th century, but mixing in the page is unavoidable. Don't try to "fix" them — store the raw string.
- **The HTML is from a 2010-era classic ASP template.** Every cell is wrapped in nested `<FONT FACE="Arial,Helvetica" size=2>…</FONT>` tags with frequently missing close tags. Use a tolerant HTML parser (cheerio, parse5, BeautifulSoup, etc.) — regex extraction is fragile. Strip nested font/br noise during normalization.
- **The "new" lookup site `pplinfo2.dre.ca.gov`** appears in search results (e.g. `https://pplinfo2.dre.ca.gov/PPLInfo/PplInfoStart?LicenseID=…`) and an HTML comment in the legacy page references a redirect to it (`<!-- Redirect to new PPL INFO  <meta http-equiv="refresh"...> -->`) — but the redirect is **commented out** and the new endpoint **returns 500 Internal Server Error** as of 2026-05. **Stick with `www2.dre.ca.gov/publicasp/pplinfo.asp`.** If the new site comes back online, the URL param name there is `LicenseID` (different casing again).
- **Disciplinary action documents** only render when discipline exists. Absence of the `Disciplinary or Formal Action Documents:` row is not an error — it means clean record. Cross-check with the `Comment:` section: `NO DISCIPLINARY ACTION` confirms clean.
- **The `Comment:` section is unstructured prose**, dated by line. Example: `04/23/21 - H-41938 LA` (case filed), `03/08/22 - REVOKED-RIGHT TO RESTRICTED LICENSE PER H-41938 LA`, `09/17/24 - PETITION FOR REINSTATMENT OF BROKER LICENSE GRANTED PER H-41938 LA`. Treat each row as a free-text event keyed by the leading `MM/DD/YY` token, plus a final literal row `NO OTHER PUBLIC COMMENTS`.
- **License Status string values are not normalized to title case** — the page returns `LICENSED ` (with trailing space) or `LICENSE EXPIRED` etc. Trim before comparing. Reference `https://www2.dre.ca.gov/static/licstatus.htm` for the canonical enum if you need to map to a known set.
- **The CORPORATION shape is structurally different from BROKER/SALESPERSON.** Corporations have `Licensed Officer(s):` (designated + non-designated), `Broker Associates:`, and `Salespersons:` rows that brokers/salespeople do not. The Zod schema in `output_schema.ts` treats all three as a discriminated union on `license_type`.
- **No anti-bot, no captcha, no rate-limit observed during testing.** Direct fetch is safe. Don't waste budget on `--verified` or `--proxies` — confirmed unnecessary.
- **Server cookies (`ASPSESSIONIDxxx`) are sent on every response.** You can ignore them entirely for single-license lookups; they're only relevant for the multi-step search-by-name flow.
- **A salesperson license that has been disciplined or has many affiliations can return a very large HTML body** (one test license returned ~400 KB). Make sure your fetch buffer / streaming can handle it.

## Expected Output

The canonical shape is a discriminated union on `license_type`. Validated by the `OutputSchema` exported from `output_schema.ts`.

### Outcome 1: Not found

```json
{
  "found": false,
  "license_id": "99999999",
  "error": "No matching public record was found for License ID: 99999999."
}
```

### Outcome 2: BROKER (clean)

```json
{
  "found": true,
  "license_id": "01258261",
  "license_type": "BROKER",
  "name": "Householder, Ron E",
  "status": "LICENSED",
  "expiration_date": "05/19/28",
  "mailing_address": "13001 SEAL BEACH BLVD #210\nSEAL BEACH, CA  90740",
  "main_office_address": "13001 SEAL BEACH BLVD STE 210\nSEAL BEACH, CA  90740-2754",
  "salesperson_issued_date": "06/10/99",
  "broker_issued_date": "05/20/00",
  "mlo_nmls_id": "302207",
  "former_names": [],
  "dbas": [
    { "name": "1st Realty Financial", "status": "ACTIVE AS OF 05/14/2012" },
    { "name": "Opendoor", "status": "ACTIVE AS OF 01/04/2019" }
  ],
  "branches": [],
  "affiliated_corporations": [
    { "license_id": "01769292", "name": "Endeavor Mortgage Group Inc", "officer_expiration_date": "08/22/26" }
  ],
  "former_broker_associate_for": [
    { "license_id": "01821150", "name": "Weaver, Samuel John", "from": "05/04/2023", "to": "10/03/2023" }
  ],
  "comments": ["NO DISCIPLINARY ACTION", "NO OTHER PUBLIC COMMENTS"],
  "disciplinary_documents": [],
  "has_discipline": false
}
```

### Outcome 3: BROKER with disciplinary history

```json
{
  "found": true,
  "license_id": "01874798",
  "license_type": "BROKER",
  "name": "Kung, Ivy Hsiang Ju",
  "status": "LICENSED",
  "expiration_date": "02/02/29",
  "mlo_nmls_id": "395881",
  "comments": [
    "04/23/21 - H-41938 LA",
    "03/08/22 - REVOKED-RIGHT TO RESTRICTED LICENSE  PER H-41938 LA",
    "09/17/24 - PETITION FOR REINSTATMENT OF BROKER LICENSE   GRANTED PER H- 41938 LA",
    "11/21/24 - PETITION FOR REINSTATMENT OF MLO ENDORSEMENT  GRANTED PER H- 41938 LA",
    "02/03/25 - H-41938 LA  RELEASED",
    "NO OTHER PUBLIC COMMENTS"
  ],
  "disciplinary_documents": [
    { "filename": "H41938LA_210423_P.pdf", "url": "https://www2.dre.ca.gov/hearingfiles/H41938LA_210423_P.pdf" },
    { "filename": "H41938LA_220308_P.pdf", "url": "https://www2.dre.ca.gov/hearingfiles/H41938LA_220308_P.pdf" },
    { "filename": "H41938LA_240917_P.pdf", "url": "https://www2.dre.ca.gov/hearingfiles/H41938LA_240917_P.pdf" },
    { "filename": "H41938LA_241121_P.pdf", "url": "https://www2.dre.ca.gov/hearingfiles/H41938LA_241121_P.pdf" }
  ],
  "has_discipline": true
}
```

### Outcome 4: CORPORATION

```json
{
  "found": true,
  "license_id": "01769292",
  "license_type": "CORPORATION",
  "name": "Endeavor Mortgage Group Inc",
  "status": "LICENSED",
  "expiration_date": "08/22/26",
  "corporation_issued_date": "08/23/06",
  "mlo_nmls_id": "355050",
  "licensed_officers": [
    { "role": "DESIGNATED OFFICER", "license_id": "01258261", "name": "Householder, Ron E", "expiration_date": "08/22/26" },
    { "license_id": "01471454", "name": "Wright, Christopher David", "expiration_date": "08/22/10", "status": "OFFICER LICENSE EXPIRED AS OF 08/23/10" }
  ],
  "broker_associates": [
    { "license_id": "01022584", "name": "Sweeney, Edward Michael", "expiration_date": "06/19/2029" }
  ],
  "salespersons": [
    { "license_id": "01894880", "name": "Ainslie, Brian Edward", "expiration_date": "05/12/2027" }
  ],
  "comments": ["NO DISCIPLINARY ACTION", "NO OTHER PUBLIC COMMENTS"],
  "disciplinary_documents": [],
  "has_discipline": false
}
```

Assumptions (documented per spec):
- "Disciplinary actions" includes both unstructured `Comment:` rows AND linked PDFs under `Disciplinary or Formal Action Documents:` — both are surfaced. `has_discipline` is true iff either a non-trivial comment OR any PDF exists.
- "Status" returned to caller is the raw `License Status:` cell value, trimmed. Caller can map to a normalized enum if needed.
- Salesperson lookups follow the same BROKER schema minus the broker/officer-specific fields — represented as `license_type: "SALESPERSON"` in the discriminated union.
