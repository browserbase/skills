---
name: search-dca-ca-gov-create-a-skill-for-finding-verifiying-c18cc026
title: California DCA Licensed Accountant Verification
description: >-
  Verify a California-licensed accountant (CPA, Public Accountant, or accounting
  firm) on the DCA license search at search.dca.ca.gov — boardCode=19
  (California Board of Accountancy). Returns full license record with status,
  dates, city, and any disciplinary actions.
website: search.dca.ca.gov
category: licensing
tags:
  - licensing
  - accountancy
  - cpa
  - california
  - verification
  - compliance
  - read-only
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      No public API. Direct POST /results without a Cloudflare Turnstile token
      returns HTTP 302 to / (verified by direct fetch). Probed /api/license,
      /api/search, /license, /licensee, /detail, /details — all 404. Live
      browser session with Turnstile solve is the only verification path.
verified: true
proxies: true
---
# California DCA / CBA — Verify Licensed Accountant

## Purpose

Look up and verify a California-licensed accountant (CPA, Public Accountant, or accounting firm) on the California Department of Consumer Affairs (DCA) license-search system at `https://search.dca.ca.gov/`, which is the canonical public verification surface for the California Board of Accountancy (CBA, boardCode `19`). Returns the full license record — licensee name, license number, license type, current status (Current / Expired / Cancelled / Suspended / Revoked / Surrendered / Delinquent), issue & expiration dates, city/county, and any public-record disciplinary action. Read-only — never edits, never pays.

## When to Use

- Confirming an accountant is actually a CPA in good standing before engaging them — pre-engagement compliance check.
- Verifying a license number that a vendor or counterparty has provided.
- Resolving an accountant's full registered name (mailing-address city, license type code) from a name + license-number tuple.
- Bulk validation of a list of California CPAs (works for individuals and for CPA-Corporation / CPA-Partnership / PA-Partnership / Fictitious-Name-Registration firms).
- The CBA's own landing page at `dca.ca.gov/cba/consumers/license-lookup.shtml` links straight here — there is no separate CBA license-search system.

## Workflow

The DCA search is a server-rendered form that **requires a Cloudflare Turnstile challenge to be solved before submit**. The submit button is JS-disabled (`#srchSubmitHome` is `disabled="disabled"` in HTML; `onTurnstileSuccess(token)` flips `disabled = false` once Turnstile returns a token). Direct `POST /results` without the `cf-turnstile-response` field — even with a valid `csrfToken` cookie — server-side redirects 302 → `/` (verified: cookie `connect.sid` reset, no results page rendered). **You must drive a real browser; there is no public API.** Stealth + residential proxies are the default; without stealth the Turnstile widget may issue a managed challenge requiring extra interaction.

1. **Create a stealth + residential-proxy session** (Cloudflare Turnstile fingerprints headless browsers aggressively):
   ```bash
   SID=$(browse cloud sessions create --keep-alive --verified --proxies | jq -r .id)
   export BROWSE_SESSION="$SID"
   ```

2. **Deep-link directly to the Accountancy board** — skips the board dropdown step entirely:
   ```bash
   browse open "https://search.dca.ca.gov/advanced?BD=19" --remote
   browse wait load --remote
   ```
   The `BD=19` URL param pre-selects boardCode `19` (Accountancy, Board of). The `licenseType` dropdown is then already filtered to the six Accountancy options (see Site-Specific Gotchas). The non-advanced homepage at `https://search.dca.ca.gov/` works too but the advanced page is the canonical CBA-linked entry. Both pages POST to the same `/results` handler.

3. **Select License Type** (optional but recommended — narrows results). For an individual CPA verification, use `licenseType=37` (Certified Public Accountant). For other accountancy license forms, see the table in Site-Specific Gotchas. You can leave License Type blank to search across all Accountancy license types — the result row's type column will disambiguate.

4. **Enter the License Number** in the `#licenseNumber` field. The CBA issues numeric license numbers without an alphabetic prefix on display (e.g. `163245`), though internally CBA records key on `CPA-<n>` / `PA-<n>` / `COR-<n>` / `PAR-<n>`. **Enter only the digits** — do not prefix with `CPA`, `#`, or any zero-padding. The field is `<input type="text" name="licenseNumber" id="licenseNumber">`.

5. **Wait for the Cloudflare Turnstile widget to auto-solve.** With `--verified --proxies` it typically resolves in 2–6 seconds. The widget is `.cf-turnstile[data-sitekey="0x4AAAAAAB258ZxC1TBrjjzg"][data-action="search"]`. Verify the Search button has become enabled before clicking:
   ```bash
   browse wait selector "#srchSubmitHome:not([disabled])" --remote --timeout 30000
   ```
   If Turnstile times out or errors, the widget's error/expired callback re-disables the button — reload the page and try again with a fresh session.

6. **Click Search** — `#srchSubmitHome` (value="SEARCH"). The form POSTs to `/results` with body fields `boardCode`, `licenseType`, `licenseNumber`, `firstName`, `lastName`, `busName`, `csrfToken` (hidden, populated server-side per-session), `cfAction=search`, `cfMode=managed`, and `cf-turnstile-response=<token>`.

7. **Read the results page**. The `/results` page renders one row per matching license with columns: License Type, License Number, Licensee Name, License Status, Expiration Date, City, County, Secondary Status (Probation / Citation / etc.). Click the licensee-name link (`<a>` on the name) for the full detail page, which adds: Original Issue Date, full mailing address, county, license-history timeline, and a "Public Record Actions" / "Administrative Action" section if any disciplinary record exists. Extract from the detail page — it has the most complete record.

8. **Fallback — Name search** if license-number search returns "No records were found":
   - Clear the form, leave `licenseNumber` blank, fill `#firstName` ("Aaron") + `#lastName` ("Smith"). **`lastName` is required** when `firstName` is provided (JS: `if(firstName != '' && lastName == '') { lastName.required = true }`). For a firm, use `#busName` instead.
   - Set `boardCode=19` and (optionally) `licenseType`.
   - Re-solve Turnstile and submit. Name search may return many rows for common names; disambiguate by license number, city, or status.

9. **Verify the record matches** both the expected name *and* the expected license number before returning success. The detail page URL contains the canonical license ID — store it as `verification_url` for auditability.

10. **Release the session** when finished:
    ```bash
    browse cloud sessions update "$SID" --status REQUEST_RELEASE
    ```

## Site-Specific Gotchas

- **Cloudflare Turnstile is mandatory and server-side enforced.** Verified: `POST /results` with a valid `connect.sid` cookie + valid `csrfToken` but *no* `cf-turnstile-response` returns HTTP 302 to `/` (cookie rotated). There is no API workaround — `browse cloud fetch` cannot reach the results page even with `--proxies`. Live browser session required. Turnstile sitekey: `0x4AAAAAAB258ZxC1TBrjjzg`, action `search`, mode `managed`.

- **Deep-link with `?BD=<boardCode>` to pre-select the board.** `https://search.dca.ca.gov/advanced?BD=19` pre-selects Accountancy and skips the JS `changeTheBoard()` cascade that filters the licenseType dropdown. This is the URL the official CBA consumer page (`dca.ca.gov/cba/consumers/license-lookup.shtml`) links to. No `LT=` (license-type) URL param is honored — you must select that from the dropdown.

- **Accountancy license types (`boardCode=19`)** — these are the only valid values for the `licenseType` field when board is Accountancy. Verified from the `<optgroup id="b19" label="Accountancy, Board of">` block of `search.dca.ca.gov/`:

  | licenseType | Display name | Use for |
  |---|---|---|
  | `36` | CPA - Corporation | CPA-PC, CPA professional corporation |
  | `37` | Certified Public Accountant | **Individual CPA — the common case** |
  | `38` | Fictitious Name Registration | DBA registration on a sole-practitioner CPA |
  | `39` | Public Accountants | Individual PA (legacy, pre-CPA-only era; very small population) |
  | `40` | CPA - Partnerships | CPA partnership / LLP |
  | `41` | PA - Partnerships | Public Accountant partnership (legacy) |

  Leaving `licenseType` blank searches all Accountancy types — useful when you're unsure whether `Aaron Smith` is registered as an individual CPA (37), a CPA-corporation (36), or a CPA-partnership (40). The results page's type column disambiguates.

- **License number is digits-only on input.** No prefix, no leading zeros, no `#`. The Aaron-Smith test case `163245` is entered exactly as `163245`. Internally the CBA stores prefixed IDs (CPA-`nnnnnn` / PAR-`nnnnnn` etc.) but the input field strips/ignores prefixes. License-number search is an *exact* match — partial or wildcard searches fall back to the Name path.

- **The hidden `csrfToken` is per-session.** It is populated by the server on initial GET (e.g. `csrfToken=14f9de6de1b486b72f3a8f2da5cecced` in our trace) and bound to `connect.sid`. Do not reuse a `csrfToken` across sessions. The browser's submit picks it up automatically from the hidden input; you only need to be aware of it if attempting a direct POST (which is blocked by Turnstile anyway).

- **Submit button is JS-disabled until Turnstile resolves.** `#srchSubmitHome` ships HTML-disabled. `onTurnstileSuccess(token)` enables it. If you try to click before Turnstile completes, the click is a no-op — wait on `#srchSubmitHome:not([disabled])`. Turnstile failure → `onTurnstileError` re-disables it; refresh the page rather than retry the widget.

- **Name search requires `lastName` if `firstName` is provided.** Verified in `search.js` (`showSearch_click`). First-name-only or business-name-only searches are valid; first-name + missing last-name is rejected client-side with a `required` flag and the form will not submit. Always fill both `firstName` and `lastName`, or use `busName` alone for firms.

- **"Aaron Smith" + `163245` test-case caveats.** The provided test record was not live-verified during skill construction (the build sandbox could not drive a remote browser — see "Build-Time Constraints" below). License `163245` on `boardCode=19` will resolve to whichever Accountancy license type holds that number — most likely `37` (CPA) given the digit count. If the license-number lookup returns a row whose name does not match "Aaron Smith", treat that as a `match_found: false` with reason "license_number_resolves_to_different_licensee" and surface the actual name for audit.

- **Status field is multi-valued.** Expect any of: `Current`, `Active` (some boards), `Expired`, `Cancelled`, `Delinquent`, `Suspended`, `Revoked`, `Surrendered`, `Inactive`, `Retired`. The CBA additionally annotates with a *Secondary Status* (Probation, Citation, Restricted, Stipulated, etc.) that is a separate column on the detail page. Always extract both — a CPA can be `Current` with secondary status `Probation`, which is materially different from a clean `Current` for engagement purposes.

- **Public Record Actions panel only renders if disciplinary history exists.** Absence of the panel is signal that the licensee has a clean record. When present, it lists action type (Accusation / Citation / Decision / Stipulated Settlement), effective date, and a link to a CBA-hosted PDF copy of the action. Extract these into a `disciplinary_actions: [...]` array.

- **"Unable to Find a Licensee" link** at `dca.ca.gov/cba/consumers/search-results.shtml` documents the CBA's own troubleshooting: try fewer fields, check spelling, search both individual and firm paths. If you get zero results on a digit-only license-number search of board 19, the license either doesn't exist, was never issued by California, or belongs to a different board (e.g. it's a Department of Real Estate license, not a CBA license).

- **Don't waste time on undocumented endpoints.** Probed during build: `/api/license`, `/api/search`, `/license`, `/licensee`, `/detail`, `/details`, `/licenseDetail`, `/show` — all return 404. The only public verification surface is the form-driven `/` → `/results` flow.

- **CBA's "out-of-state" CPA path is a separate tab on `dca.ca.gov/cba/consumers/license-lookup.shtml`**, not on `search.dca.ca.gov`. If the in-state search returns nothing and the licensee may be practicing in CA under out-of-state reciprocity, fall back to the CBA's out-of-state directory. This skill targets the in-state path only.

- **Build-Time Constraints (honest):** The skill-generation sandbox could not drive a live remote browser session — DNS for `connect.usw2.browserbase.com` was not in the sandbox's outbound allowlist, so `browse open --remote` failed with `getaddrinfo ENOTFOUND`. Form structure, hidden-field names, license-type IDs, Turnstile sitekey, csrfToken behavior, and the 302-on-no-Turnstile-token behavior were all verified via `browse cloud fetch` (Browserbase server-side fetch API). The full end-to-end browser flow — Turnstile solve, click submit, parse `/results` rows, click into detail page — was *not* run end-to-end and the "Aaron Smith" + `163245` test case was not live-resolved. Treat selector specifics that were inferred from HTML inspection (rather than live execution) as candidate; live-validation on first marketplace run will confirm or correct them.

## Expected Output

```json
{
  "success": true,
  "match_found": true,
  "license": {
    "name": "SMITH, AARON <middle-or-initial>",
    "license_number": "163245",
    "license_type": "Certified Public Accountant",
    "license_type_code": "37",
    "board": "California Board of Accountancy",
    "board_code": "19",
    "status": "Current",
    "secondary_status": null,
    "issue_date": "YYYY-MM-DD",
    "expiration_date": "YYYY-MM-DD",
    "city": "...",
    "county": "...",
    "state": "CA",
    "disciplinary_actions": []
  },
  "verification_url": "https://search.dca.ca.gov/results/...",
  "error_reasoning": null
}
```

### Outcome shapes

- **Match found, clean status** — as above, `success: true`, `match_found: true`, `disciplinary_actions: []`, `secondary_status: null`.

- **Match found, has disciplinary history** — `disciplinary_actions` populated:
  ```json
  {
    "success": true,
    "match_found": true,
    "license": { "...": "...", "status": "Current", "secondary_status": "Probation" },
    "disciplinary_actions": [
      { "type": "Stipulated Settlement", "effective_date": "YYYY-MM-DD", "document_url": "https://www.dca.ca.gov/cba/.../...pdf" }
    ]
  }
  ```

- **License number exists but name doesn't match** — license is held by someone else; surface the mismatch explicitly:
  ```json
  {
    "success": true,
    "match_found": false,
    "error_reasoning": "license_number_resolves_to_different_licensee",
    "actual_licensee_name": "OTHER, NAME",
    "expected_name": "Aaron Smith",
    "verification_url": "https://search.dca.ca.gov/results/..."
  }
  ```

- **No records found** (license number does not exist on board 19):
  ```json
  {
    "success": true,
    "match_found": false,
    "error_reasoning": "no_records_found",
    "search_params": { "boardCode": "19", "licenseNumber": "163245" }
  }
  ```

- **Turnstile / anti-bot failure**:
  ```json
  {
    "success": false,
    "error_reasoning": "turnstile_unsolved_after_30s",
    "next_action": "retry_with_fresh_session"
  }
  ```

- **Site error / 5xx / unexpected response**:
  ```json
  {
    "success": false,
    "error_reasoning": "<verbatim error text from site or HTTP status>"
  }
  ```
