---
name: nursys-com-nurse-license-verify-s1yy4f
title: Nursys QuickConfirm Nurse License Verification
description: >-
  Bulk-verify nurse licenses on Nursys QuickConfirm: navigate the terms/search
  flow, fill the by-name/license/NCSBN-ID form, and extract licensee name,
  license number, state board, type (RN/PN/APRN), status, and expiration as a
  Zod-validatable array. Read-only. Search submission is currently gated by an
  unsolved reCAPTCHA v2 image challenge.
website: nursys.com
category: licensing-verification
tags:
  - healthcare
  - nursing
  - license-verification
  - credentialing
  - recaptcha
  - incapsula
  - read-only
source: 'browserbase: agent-runtime 2026-06-04'
updated: '2026-06-04'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      No token-free API exists. The QuickConfirm form posts back to
      LQCSearch.aspx with an ASP.NET viewstate AND a mandatory
      g-recaptcha-response token; without solving reCAPTCHA the server rejects
      the request, so there is no HTTP shortcut to bypass the captcha.
verified: true
proxies: true
---
# Nursys QuickConfirm Nurse License Verification

## Purpose

Bulk-verify nurse licenses through the Nursys **QuickConfirm License Verification**
service (`nursys.com/LQC`), the NCSBN primary-source-equivalent database covering
RN, LPN/VN, and (for some boards) APRN licenses across participating U.S. state
boards of nursing. For each query (name+state+type, license number, or NCSBN ID)
it returns the licensee's name, license number, state/board, license type, status,
and expiration date as a Zod-validatable array. **Read-only** — never enroll a
nurse in e-Notify, pay, or file a Missing Record Inquiry.

**Important status (verified 2026-06-04):** the QuickConfirm search form is gated
by **reCAPTCHA v2 that consistently escalates to an image challenge**, which the
Browserbase verified-session solver did **not** clear across manual testing and
two autobrowse iterations. The full navigation/form flow up to submission is
reliable and fully documented below, but **the actual search submission is blocked
today**. Treat this as a candidate skill: it tells a future agent exactly how far
it can get and where the wall is, so no one re-discovers it.

## When to Use

- Credentialing / HR workflows verifying one or more nurse licenses against the
  official state board source (Nursys is primary-source-equivalent for
  participating boards).
- Bulk verification of a roster: iterate the same form per nurse and aggregate
  records into one array.
- Confirming license status/expiration for endorsement or employment.
- **Do not** reach for this when you need a token-free HTTP API — there is none;
  the form requires a `g-recaptcha-response` token (see Gotchas).

## Workflow

This is a browser-only task. There is no public API: the QuickConfirm endpoint
posts back to `LQCSearch.aspx` with an ASP.NET viewstate **and a reCAPTCHA token**,
so the captcha cannot be bypassed at the HTTP layer. A `--verified --proxies`
Browserbase session is mandatory (Imperva/Incapsula + reCAPTCHA).

1. **Create a stealth session** — `--verified --proxies` are both required.
   ```bash
   sid=$(browse cloud sessions create --keep-alive --verified --proxies | node -e "...id")
   ```

2. **Open the search page** — `browse open https://www.nursys.com/LQC/LQCSearch.aspx`.
   It 302-redirects to `/LQC/LQCTerms.aspx`. You **cannot deep-link past the terms
   page** — the search form is only reachable after accepting terms in the same
   session.

3. **Clear the Incapsula interstitial if present.** The first load often renders
   an Incapsula *"additional security check is required"* page (snapshot shows
   ~38 refs and an `iframe` to `_Incapsula_Resource`). `browse reload`, then
   `browse wait timeout 6000`, then snapshot again — the JS challenge clears on the
   second load for verified+proxied sessions.

4. **Dismiss the cookie banner** — click **"Accept All"**. (An e-Notify promo
   modal may also appear; dismiss with **"No Thanks"**.)

5. **Accept terms** — click the **"I agree"** FCRA-compliance link. Then
   `browse wait load`; landing on `LQCSearch.aspx` can take up to ~20s.

6. **Fill the search form.** Three tabs: **Search by Name** (default),
   **Search by License Number**, **Search by NCSBN ID**. ASP.NET field IDs follow
   the `ctl00_MainContent_*` pattern (confirmed: `tbLastName`, `ddlLicenseType`).
   On the Name tab:
   - Last name → `browse fill #ctl00_MainContent_tbLastName "SMITH"` (partial names accepted)
   - First name → `#ctl00_MainContent_tbFirstName` (optional)
   - License type → `browse select` the License-type dropdown to one of:
     `PN`, `RN`, `APRN-CNP`, `APRN-CRNA`, `APRN-CNS`, `APRN-CNM`
   - State → `browse select` the State dropdown. **Use `browse select <ref> <VALUE>`,
     not `click`** — clicking the option ref does not commit on these custom selects.
     Options are board-scoped, e.g. `CALIFORNIA-RN`, `CALIFORNIA-VN`,
     `LOUISIANA-PN`, `LOUISIANA-RN`, `WEST VIRGINIA-PN`, `WEST VIRGINIA-RN`, plus
     plain state names for single-board states.

7. **Solve the reCAPTCHA (current blocker).** Click the "I'm not a robot" checkbox
   **once**, then `browse wait timeout 20000` to let the verified-session solver
   work; snapshot. If a checkbox-only pass occurs, click **Search** and proceed to
   step 8. If an image challenge appears, click **"Get a new challenge"** at most
   twice (waiting ~15s each) — **never hand-click challenge tiles** (it does not
   converge and burns the entire turn budget; run-001 hit max_turns doing exactly
   that). If still unsolved, emit the `blocked_by: "recaptcha"` output and stop.

8. **Submit and extract** (only reachable if the captcha passes). Click **Search**,
   `browse wait load`, snapshot the results list. Each result row exposes licensee
   name, license number, state/board, license type, status, and expiration. Push
   every row into the `records` array. For a bulk batch, return to the form and
   repeat per query, aggregating all records.

9. **Release the session** — `browse cloud sessions update "$sid" --status REQUEST_RELEASE`.

## Site-Specific Gotchas

- **reCAPTCHA v2 is the hard wall (confirmed unsolved).** After checking
  "I'm not a robot" the site escalates to an image challenge ("select all images
  with crosswalks / bicycles / a bus" — varies per attempt). Browserbase's
  verified solver did not clear it within ~90s in manual testing, nor across two
  autobrowse runs; "Get a new challenge" re-rolls but stays an image challenge.
  **Do not hand-click challenge tiles** — it never converges. There is no
  token-free path: the form requires a valid `g-recaptcha-response`.
- **Imperva/Incapsula on top of reCAPTCHA.** The CDN is Imperva (`X-Cdn: Imperva`).
  A plain `browse cloud fetch`/curl of `/LQC/LQCTerms.aspx` returns an Incapsula
  *"Request unsuccessful. Incapsula incident ID …"* block. The interstitial also
  appears on the first browser load even with `--verified --proxies`; reload once
  to clear it (step 3).
- **Terms gate is mandatory and session-scoped.** `LQCSearch.aspx` 302-redirects
  to `LQCTerms.aspx` until "I agree" is clicked in the same session. You cannot
  navigate straight to the form.
- **Dropdowns need `select`, not `click`.** Clicking an option ref leaves the
  select on "Select"; `browse select <ref> <VALUE>` commits it.
- **State options are board-of-nursing scoped, not just states.** Several states
  split RN vs PN/VN boards: `CALIFORNIA-RN` / `CALIFORNIA-VN`,
  `LOUISIANA-PN` / `LOUISIANA-RN`, `WEST VIRGINIA-PN` / `WEST VIRGINIA-RN`. Pick the
  one matching the license type. Only **participating** boards are searchable;
  non-participating boards must be contacted directly.
- **License-type vocabulary.** The form uses `PN` (Practical/Vocational Nurse, aka
  LPN/LVN/VN), `RN`, and APRN sub-types `APRN-CNP`, `APRN-CRNA`, `APRN-CNS`,
  `APRN-CNM`. Map the requested "LPN" → `PN`, "APRN" → the specific sub-type.
- **NCSBN ID** is the public globally-unique nurse identifier; "Search by NCSBN ID"
  and "Search by License Number" are more precise than name search (which warns
  "for a more accurate search, select Search by License Number or NCSBN ID").
- **Scheduled downtime.** A banner observed 2026-06-04 noted Nursys + e-Notify API
  unavailable Fri 2026-06-05 19:00 → Sat 2026-06-06 13:00 Central for maintenance.
- **Records predating 1985** may not be in Nursys; missing records are handled via
  a Missing Record Inquiry form (do not submit it — read-only skill).

## Expected Output

A Zod-validatable object wrapping an array of licensee records. Distinct outcome
shapes:

```json
// Blocked by reCAPTCHA — the observed outcome today
{
  "success": false,
  "blocked_by": "recaptcha",
  "records": [],
  "error_reasoning": "Search form reached and filled (e.g. SMITH / RN / TEXAS), but reCAPTCHA v2 image challenge could not be solved; the verified-session solver did not clear it after waiting and re-rolling the challenge."
}
```

```json
// Successful extraction (shape the results list yields once the captcha passes)
{
  "success": true,
  "blocked_by": null,
  "records": [
    {
      "licensee_name": "SMITH, JANE A",
      "license_number": "123456",
      "state": "TEXAS",
      "license_type": "RN",
      "status": "Active",
      "expiration_date": "2027-04-30"
    }
  ],
  "error_reasoning": null
}
```

```json
// No matches for a query row
{ "success": true, "blocked_by": null, "records": [], "error_reasoning": "No records found for SMITH / RN / TEXAS." }
```

```json
// Too many matches — refine required
{ "success": true, "blocked_by": null, "records": [], "error_reasoning": "Too many results; refine with first name or use Search by License Number / NCSBN ID." }
```

Suggested Zod schema:

```ts
const Record = z.object({
  licensee_name: z.string(),
  license_number: z.string(),
  state: z.string(),
  license_type: z.enum(["RN","PN","APRN-CNP","APRN-CRNA","APRN-CNS","APRN-CNM"]),
  status: z.string(),
  expiration_date: z.string(),  // ISO date if parseable, else as displayed
});
const Result = z.object({
  success: z.boolean(),
  blocked_by: z.enum(["recaptcha","incapsula"]).nullable(),
  records: z.array(Record),
  error_reasoning: z.string().nullable(),
});
```
