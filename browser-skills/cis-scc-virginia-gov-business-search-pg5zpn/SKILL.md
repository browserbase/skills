---
name: cis-scc-virginia-gov-business-search-pg5zpn
title: Virginia SCC Business Entity Search
description: >-
  Search the Virginia State Corporation Commission Clerk's Information System
  (CIS) business-entity registry by name and return matching entities (name, SCC
  ID, type, status). The site's entity search is gated by an invisible reCAPTCHA
  v3 that scores automated browsers 0, so live extraction is currently blocked;
  the skill documents the full working navigation path and the wall.
website: cis.scc.virginia.gov
category: government
tags:
  - government
  - business-registry
  - virginia
  - scc
  - recaptcha
  - read-only
source: 'browserbase: agent-runtime 2026-06-03'
updated: '2026-06-03'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      No public JSON/REST API or query-string deep-link exists; entity search is
      a stateful ASP.NET POST to /EntitySearch/Index whose execution is gated
      server-side by reCAPTCHA v3. Confirmed dead end: a token-less direct
      $.submitForm POST is bounced to the home page.
  - method: browser
    rationale: >-
      The public form is the only surface. Cookie consent + form fields + submit
      mechanics are fully mapped, but submission is blocked by reCAPTCHA v3
      which scores automated sessions 0.0 regardless of proxy/fingerprint, so
      results cannot currently be retrieved.
verified: true
proxies: true
---
# Virginia SCC Business Entity Search

## Purpose

Search the Virginia State Corporation Commission Clerk's Information System
(CIS) business-entity registry by entity name (e.g. "smith ventures") and
return the matching entities — name, SCC entity ID, type, status, formation
date, and jurisdiction. Read-only; this skill never files, pays, or signs in.

**Status: candidate / blocked.** The full navigation path (cookie consent →
search form → field mapping → submit mechanics) is mapped and documented below,
but the search itself is gated by an invisible **reCAPTCHA v3 (enterprise,
action `submit`)** that scores automated browser sessions **0.0** every time.
The server validates the score server-side and refuses to run the query, so an
automated agent **cannot currently retrieve live results** from this site. The
sections below give the exact working flow up to the wall plus everything
learned about the wall, so a future agent (or one with a reCAPTCHA-solving
capability / score-passing fingerprint) doesn't have to re-discover it.

## When to Use

- Looking up a Virginia-registered business (LLC, corporation, LP, etc.) by
  name to get its SCC entity ID, status (Active/Terminated), and type.
- Verifying whether a business name is registered/available in Virginia.
- Any flow that would otherwise scrape `cis.scc.virginia.gov/EntitySearch`.

**Before relying on this skill, read the Site-Specific Gotchas — as of
2026-06-03 the reCAPTCHA v3 gate blocks all automated extraction.** Use it as a
navigation map, not a guaranteed data source. For bulk needs, prefer the SCC's
official bulk-data offering (see gotchas) over this gated UI.

## Workflow

`recommended_method: browser`. There is **no public JSON/REST API** and no
URL-deep-link that bypasses the search form — the entity search is a single
`POST /EntitySearch/Index` whose execution is gated server-side by a reCAPTCHA
v3 score. A residential-proxy + verified (stealth) Browserbase session is the
only viable surface, and even that is currently blocked at the reCAPTCHA gate.

Recommended session: `browse cloud sessions create --keep-alive --verified --proxies`.
(Session fingerprint/proxy choice does **not** change the outcome — see gotchas
— but `--verified --proxies` is the most likely config to ever pass if Google's
scoring changes.)

1. **Open the site and clear the cookie wall.** `browse open https://cis.scc.virginia.gov/`.
   Every first request 302-redirects to `/Cookie/CookieConsent`. A modal
   "Cookie Consent" dialog renders with **Accept** / **Reject** buttons. Click
   **Accept** (accessibility-tree button labeled `Accept`; it is the button
   whose text matches `/accept/i`). This sets the ASP.NET session cookie needed
   for everything downstream. Skipping it leaves you bouncing to
   `/Account/Login`.

2. **Go to the entity search page.** Navigate directly to
   `https://cis.scc.virginia.gov/EntitySearch/Index`. The page titled
   "BUSINESS ENTITY SEARCH" renders the form. (Do **not** use the quick search
   box on the home page — submitting from there redirects to `/Account/Login`.)

3. **Set the match logic (optional).** The "Select One" dropdown is
   `#BEFilingSearch_ddlSearchLogic` with values: `2` = Starts With (default),
   `3` = Exact Match, `7` = Contains. For a broad name search like
   "smith ventures", `7` (Contains) is the most inclusive; the default
   `2` (Starts With) matches names beginning with the term.

4. **Enter the entity name.** Fill `#BusinessSearch_Index_txtBusinessName` with
   the search term (e.g. `smith ventures`). The form has one input per search
   mode (Entity Name, Entity ID `#BusinessSearch_Index_txtBusinessID`, Filing
   Number, Principal Name, Registered Agent Name, Designee). Use exactly one.

5. **Submit.** Click `#btnSearch` (an `<input type="button" value="Search">`).
   Its jQuery click handler builds a `BusinessSearch` JSON object, then runs the
   reCAPTCHA gate (see step 6). **It is not a normal form submit** — pressing
   Enter or submitting the `<form>` directly does not trigger the real flow.

6. **The reCAPTCHA gate (the blocker).** On click the handler does:
   `grecaptcha.ready(() => grecaptcha.execute("6LdtxWcrAAAAAKvoAZZD9KSKaBAP4hxDtSyeI6rz", {action:'submit'}).then(token => $.ajax POST /GoogleCaptchaHelper/VerifyReCaptcha {recaptchaToken: token}))`.
   - If the AJAX response is `{success:true, score:<n>}` it calls
     `$.submitForm('/EntitySearch/Index', BusinessSearch)` which POSTs the
     search and renders the results grid.
   - If `{success:false}` it shows a SweetAlert popup **"Please try again. You
     may be a bot!"** and aborts — **no results**.
   On automated sessions `VerifyReCaptcha` always returns `{"success":false,"score":0}`,
   so step 7 is never reached.

7. **Extract results (only reachable if reCAPTCHA passes).** A successful search
   POST returns the results page with a results table/grid. Each row carries the
   entity name (a link to the entity detail page), SCC entity ID, entity type,
   and status. Iterate the rows, read each cell, and follow the entity-name link
   if formation date / jurisdiction are needed (not all columns are on the grid).
   Emit the JSON in Expected Output. **This step could not be validated because
   of the reCAPTCHA wall; the grid's exact column ids are unconfirmed.**

### If the wall ever lifts

The cheapest way to test whether automated search is possible *without* burning
an LLM agent loop is to measure the score directly in page context after
loading `/EntitySearch/Index`:

```js
grecaptcha.ready(() => grecaptcha
  .execute("6LdtxWcrAAAAAKvoAZZD9KSKaBAP4hxDtSyeI6rz", {action:'submit'})
  .then(t => fetch('/GoogleCaptchaHelper/VerifyReCaptcha',
    {method:'POST',
     headers:{'Content-Type':'application/x-www-form-urlencoded','X-Requested-With':'XMLHttpRequest'},
     body:'recaptchaToken='+encodeURIComponent(t)})
    .then(r=>r.text()).then(console.log)));
// Currently logs: {"success":false,"score":0}
```

If that ever returns `success:true`, proceed with step 5's normal `#btnSearch`
click and the results grid will render.

## Site-Specific Gotchas

- **reCAPTCHA v3 enterprise is a hard wall (confirmed 2026-06-03).** Site key
  `6LdtxWcrAAAAAKvoAZZD9KSKaBAP4hxDtSyeI6rz`, action `submit`, verified
  server-side at `POST /GoogleCaptchaHelper/VerifyReCaptcha`. Every automated
  Browserbase session scores **exactly 0.0**. Tested four configurations — all
  scored 0: `--verified --proxies`, `--verified` only (datacenter IP), a bare
  session, and a "warmed" session (click into the field, type slowly, scroll,
  dispatch mousemoves, 12 s dwell before `grecaptcha.execute`). Proxy/IP and
  fingerprint do **not** move the score; reCAPTCHA is detecting the CDP-driven
  Chrome itself. Without a passing score the search POST is refused.
- **A score-0 (failed) real submit redirects to a 403, not a friendly error.**
  When `#btnSearch` runs the genuine flow with a score-0 token, the server-side
  block on the `POST /EntitySearch/Index` form submission responds with a
  redirect to `https://www.scc.virginia.gov/web-policy/`, which renders
  **"Server Error / 403 - Forbidden: Access is denied."** (See screenshot 3.)
  Don't mistake this 403 page for the search being down — it is the bot block.
- **Bypassing the client gate doesn't help — the server enforces it too.**
  Calling `$.submitForm('/EntitySearch/Index', BusinessSearch)` directly in page
  context (skipping the reCAPTCHA AJAX) does not return results; the token-less
  POST is bounced back to the home page (`/`). The reCAPTCHA requirement is
  enforced on the server, not just in JavaScript. Don't waste time crafting a
  raw POST — confirmed dead end.
- **No JSON/REST API and no deep-link.** The entity search is a stateful ASP.NET
  MVC POST to `/EntitySearch/Index`; there is no query-string-driven results URL
  and no documented public API. (An internal `/UCCOnlineSearch/GetCrtificateDate`
  endpoint is unrelated to entity name search.) For bulk/programmatic needs, use
  the SCC's official **bulk data / data products** program rather than this UI —
  it is the sanctioned path and avoids the reCAPTCHA entirely.
- **Cookie consent is mandatory and stateful.** First load 302s to
  `/Cookie/CookieConsent?sessionExpired=False`. You must click **Accept** (sets
  the session cookie) before `/EntitySearch/Index` will render; otherwise you
  get redirected to `/Account/Login`.
- **Home-page quick search ≠ the real search.** The Entity Name box on the
  landing page (`#EntityName`) submits to a path that redirects to
  `/Account/Login`. Always use `/EntitySearch/Index` and
  `#BusinessSearch_Index_txtBusinessName`.
- **`#btnSearch` is an `input[type=button]`, not a submit.** Triggering the
  search requires its jQuery click handler (which runs the reCAPTCHA flow).
  Pressing Enter in the name field or submitting the `<form>` does not start the
  real search. The form's anti-forgery field `__RequestVerificationToken` is
  present and included in the submit payload.
- **Match-logic enum:** `#BEFilingSearch_ddlSearchLogic` → `2`=Starts With,
  `3`=Exact Match, `7`=Contains. The radio group `#BusinessSearch_Index_rdStartsWith`
  is the legacy equivalent; the dropdown is authoritative on the current page.
- **Sign-in is not required to search** (search is a public/anonymous function),
  so don't get sidetracked into the `/Account/Login` flow — it's a symptom of a
  missing session cookie or using the wrong (home-page) search box.

## Expected Output

The intended output shape once the reCAPTCHA wall is cleared. In the current
blocked state the skill returns the `blocked` shape.

```json
// Intended success shape (NOT achievable today — reCAPTCHA blocked)
{
  "success": true,
  "query": "smith ventures",
  "match_logic": "contains",
  "result_count": 12,
  "results": [
    {
      "entity_name": "SMITH VENTURES LLC",
      "entity_id": "S1234567",
      "entity_type": "Limited Liability Company",
      "status": "Active",
      "formation_date": "01/15/2010",
      "jurisdiction": "VIRGINIA",
      "detail_url": "https://cis.scc.virginia.gov/EntitySearch/BusinessInformation?businessId=..."
    }
  ],
  "error_reasoning": null
}
```

```json
// Zero matches (intended)
{ "success": true, "query": "smith ventures", "result_count": 0, "results": [], "error_reasoning": null }
```

```json
// Actual current outcome from an automated session
{
  "success": false,
  "query": "smith ventures",
  "result_count": 0,
  "results": [],
  "error_reasoning": "Blocked by reCAPTCHA v3 (action 'submit', sitekey 6LdtxWcrAAAAAKvoAZZD9KSKaBAP4hxDtSyeI6rz). /GoogleCaptchaHelper/VerifyReCaptcha returns {success:false, score:0} for automated browsers; the search POST is refused and redirects to www.scc.virginia.gov/web-policy/ (403 Forbidden). Tested verified+proxies, verified-only, bare, and warmed sessions — all scored 0."
}
```
