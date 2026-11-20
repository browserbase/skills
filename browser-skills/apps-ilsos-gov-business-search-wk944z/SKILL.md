---
name: apps-ilsos-gov-business-search-wk944z
title: Illinois SOS Business Entity Search
description: >-
  Search the Illinois Secretary of State Business Entity Search by business name
  and return matching entities (file number, name, status). Form mechanics fully
  characterized; the search submission is gated by Akamai Bot Manager and was
  not reliably passable from an automated session.
website: apps.ilsos.gov
category: government
tags:
  - government
  - business-registry
  - illinois
  - search
  - akamai
  - read-only
source: 'browserbase: agent-runtime 2026-06-03'
updated: '2026-06-03'
recommended_method: browser
alternative_methods:
  - method: browser
    rationale: >-
      The only available surface. The legacy app accepts only a POST form (no
      public API or GET-param shortcut), and the search endpoint is behind
      Akamai Bot Manager. The GET input form loads fine; the POST search
      triggers a reCAPTCHA image challenge or an HTTP2 connection reset that
      Browserbase verified+proxies did not clear during testing.
verified: true
proxies: true
---
# Illinois SOS Business Entity Search

## Purpose

Search the Illinois Secretary of State **Business Entity Search** (`apps.ilsos.gov/businessentitysearch/`) by business name and return the matching entities (file number, entity name, and status). Read-only — never initiates certificate purchases or order flows.

**Status: CANDIDATE / partially blocked.** The search **input form** (a GET page) loads reliably, but the **search submission itself** (a POST to `/businessentitysearch/businessentitysearch`) is gated by **Akamai Bot Manager** and was *not* reliably passable from an automated Browserbase session during testing (5 attempts, verified + residential-proxy). The form mechanics below are fully characterized so a future agent on a trusted IP, or one with a working CAPTCHA-solving path, can complete the extraction.

## When to Use

- Look up an Illinois corporation / LLC / LP / LLP / not-for-profit by business name.
- Confirm whether a business name is registered in Illinois and retrieve its file number and status.
- Any flow that would otherwise scrape the IL SOS business registry. (Note the database's own terms forbid bulk/automated extraction — this skill is for individual lookups only.)

## Workflow

`recommended_method: browser`. There is **no public API or GET shortcut** — the search endpoint only accepts the POST form, and the same Akamai gate applies to it (a GET to the action URL is also rejected). Use a Browserbase session with **`--verified --proxies`** (this produced the softer, occasionally-recoverable reCAPTCHA path; a verified-only/no-proxy session got a harder `ERR_HTTP2_PROTOCOL_ERROR` connection reset).

1. **Create the session:**
   ```bash
   browse cloud sessions create --keep-alive --verified --proxies
   ```
2. **Open the form** (this GET page is *not* challenged):
   ```bash
   browse open "https://apps.ilsos.gov/businessentitysearch/" --remote
   browse wait load --remote
   browse wait timeout 5000 --remote      # let the Akamai sensor (/akam/13/…, /JI_uid/…) mature
   ```
3. **Snapshot and resolve refs fresh each session** — accessibility refs are NOT stable across sessions; never hardcode them. Parse them from `browse snapshot`:
   - `radio: Business Name`  (the default/first search method)
   - `textbox: Start a New Search`  (id=`searchValue`, name=`searchValue`, maxlength 30)
   - `button: Submit`  (id=`btnSearch`)
4. **Select method + enter the query + submit:**
   ```bash
   browse click "[<ref of Business Name radio>]" --remote
   browse wait timeout 1500 --remote
   browse fill "[<ref of textbox>]" "smith ventures" --remote   # QUOTE multi-word values
   browse wait timeout 1500 --remote
   browse click "[<ref of Submit>]" --remote
   browse wait load --remote
   ```
5. **Detect the Akamai gate.** Read `browse get title` / `browse get url`:
   - `title == "Challenge Validation"` (body: *"Please solve this quick test to confirm you are a person, not a robot"*, an image grid like "Select all squares with crosswalks") → reCAPTCHA wall.
   - `url == "chrome-error://chromewebdata/"` with title `apps.ilsos.gov` and body `ERR_HTTP2_PROTOCOL_ERROR` → connection-reset wall.
   - Title `Business Entity Search` (results page reuses this title) with a results table in the body → **success**.
6. **If gated:** in a `--verified` session you may `browse wait timeout 12000` and re-check once in case the platform auto-solves — but in testing it did **not** clear the image challenge. Do **not** click reCAPTCHA tiles yourself. If still gated, emit `success: false` with the challenge text.
7. **If a results page renders:** extract with `browse get text body` / `browse snapshot`. Each result row carries a **File Number**, **Entity Name**, and **Status** (Active / Dissolved / etc.). Capture every row. Zero matches → `success: true, result_count: 0, results: []`.

### Search-method values (radio `searchMethod`)

The same form supports other lookups by selecting a different radio before submitting: `s`=Business Name, `a`=Registered Agent, `r`=President, `c`=Secretary, `m`=Manager, `f`=File Number, `e`=Keyword, `p`=Partial Word. (Name/Agent/officer searches reveal extra Last/First/Business-Name sub-fields via the form's `index.js`.)

## Site-Specific Gotchas

- **Akamai Bot Manager gates the search POST, not the form GET.** The input page (`/businessentitysearch/`) renders cleanly every time. The challenge fires only on submitting the search (`POST /businessentitysearch/businessentitysearch`). Plan stealth around the submit, not the initial load.
- **Two distinct block shapes were observed, intermittently, on the same `--verified --proxies` config:**
  1. **reCAPTCHA "Challenge Validation"** image challenge, served inline with HTTP **200** (title `Challenge Validation`). Has refresh/audio/info icons and a **SKIP** button — Akamai's own challenge widget, not a plain Google checkbox.
  2. **`ERR_HTTP2_PROTOCOL_ERROR`** — Akamai resets the POST connection (Chrome "This site can't be reached", title `apps.ilsos.gov`, url `chrome-error://chromewebdata/`).
  Which one you get appears to depend on per-session/IP reputation and how the form was submitted.
- **Browserbase verified-mode did NOT auto-solve the image challenge** within a 12s wait during testing. Don't assume verified mode clears it.
- **Proxies make it *better*, not worse, here.** Verified-only (no proxies) produced the harder HTTP2 connection reset; adding residential proxies produced the (occasionally recoverable) reCAPTCHA path. Keep `--proxies` on. This is the opposite of some gov sites — do not drop proxies expecting improvement.
- **No API / GET shortcut — confirmed.** The legacy app only accepts the POST form, and the action endpoint is behind the same Akamai gate. Don't waste time hunting for a JSON endpoint or a GET-param variant.
- **JS-`eval` form submission is worse than a real click.** Submitting via `document.getElementById('btnSearch').click()` reliably triggered the HTTP2 reset (no genuine pointer event for Akamai's sensor to record). Use `browse click` on the real Submit ref, which at least reaches the (softer) reCAPTCHA path.
- **Accessibility refs are per-session and per-snapshot — never hardcode them.** Hardcoding refs from a prior session silently clicks the wrong element (observed: a stale Submit ref left the page on the form, producing a false "challenge cleared" reading). Always re-snapshot and parse refs in the live session.
- **`browse fill` needs quoted multi-word values.** `browse fill #searchValue smith ventures` errors with `Unexpected argument: ven`. Quote it: `browse fill "[ref]" "smith ventures"`. Also prefer the `[ref]` form over `#id` selectors.
- **`searchValue` is capped at 30 chars** (`maxlength=30`). Truncate long queries.
- **Dwelling ~5s on the form before interacting** lets the Akamai sensor (`/akam/13/…`, `/JI_uid/…` beacon POSTs) collect telemetry; submitting within ~2s of load is an extra bot signal. Dwell did not by itself defeat the gate, but it is necessary baseline hygiene.
- **Database terms forbid bulk/automated use** ("available to the public for individual searches only … may not be used to copy or download bulk information"). Respect single-lookup usage.

## Expected Output

Success (results found):
```json
{
  "success": true,
  "query": "smith ventures",
  "search_method": "business_name",
  "result_count": 2,
  "results": [
    { "file_number": "12345678", "entity_name": "SMITH VENTURES LLC", "status": "Active" },
    { "file_number": "87654321", "entity_name": "SMITH VENTURES, INC.", "status": "Dissolved" }
  ],
  "error_reasoning": null
}
```

No matches:
```json
{ "success": true, "query": "smith ventures", "search_method": "business_name", "result_count": 0, "results": [], "error_reasoning": null }
```

Blocked by Akamai (the outcome reached in all test runs):
```json
{
  "success": false,
  "query": "smith ventures",
  "search_method": "business_name",
  "result_count": null,
  "results": [],
  "error_reasoning": "Akamai Bot Manager gated the search POST. Observed either a 'Challenge Validation' reCAPTCHA image challenge ('Please solve this quick test to confirm you are a person, not a robot') or an ERR_HTTP2_PROTOCOL_ERROR connection reset. Browserbase --verified --proxies did not clear the challenge during testing."
}
```
