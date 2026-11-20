---
name: brightspeed-com-check-fiber-availability-qr3tft
title: Brightspeed Fiber Availability Check
description: >-
  Check whether Brightspeed fiber/internet service is available at a U.S. street
  address and return offered plans. Read-only. The serviceability verdict is
  gated behind reCAPTCHA Enterprise, which blocks automated sessions today.
website: brightspeed.com
category: telecom
tags:
  - brightspeed
  - fiber
  - internet
  - availability
  - serviceability
  - recaptcha
  - read-only
source: 'browserbase: agent-runtime 2026-08-24'
updated: '2026-08-24'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      The widget calls JSON endpoints on api-pr.brightspeed.com
      (adq-api/v1/lookup for address resolution,
      digital/v1/addressservice/qualification for the verdict). The lookup call
      401s without the session handshake, and the qualification call is
      reCAPTCHA Enterprise-gated (HTTP 429 'Recaptcha assessment failed'), so a
      standalone API path is not viable.
verified: true
proxies: true
---
# Check Brightspeed Fiber Availability at an Address

## Purpose

Given a U.S. street address, determine whether Brightspeed internet service
(fiber or copper/DSL) is available there, and — for a serviceable address —
return the offered plans (name, speed, price). Read-only: the flow stops at the
serviceability verdict / plan cards and never enters checkout or submits any
personal information.

**Honest status (candidate):** the address-lookup half of the flow works
reliably, but the serviceability verdict itself is gated behind **Google
reCAPTCHA Enterprise (invisible, score-based)** on Brightspeed's qualification
API. Automated browser sessions — including Browserbase `--verified --proxies`
sessions — consistently receive an `HTTP 429 "Recaptcha assessment failed"`
from the qualification endpoint, which the site surfaces as a generic error
banner ("Something is not working properly…"). As of the last run (2026-08-24)
there is **no reliable automated path to the actual availability answer**. This
skill documents the full flow and API contract so a future agent (or a
human-assisted / high-reputation session that can clear the reCAPTCHA score) can
complete it, and so nobody re-discovers the wall.

## When to Use

- A user asks "is Brightspeed fiber available at <address>?"
- Pre-qualifying a lead / checking a serving footprint before an order flow.
- Bulk serviceability checks across a list of addresses (subject to the
  reCAPTCHA wall below — expect to be blocked without human-grade reputation).
- Do **not** use this to place an order — that's a separate, write flow.

## Workflow

Brightspeed's public site (`www.brightspeed.com`) is the only serviceability
surface. It is an Adobe Experience Manager SPA whose homepage hero contains the
address checker (the "global qualification" / `glq` widget). Under the hood the
widget calls a small set of JSON endpoints on `api-pr.brightspeed.com`; the
final qualification call is reCAPTCHA-gated (see Gotchas). A residential proxy
is **not** required for the site to load (the homepage probe shows no anti-bot),
but it also does **not** get you past the reCAPTCHA on the qualification call.

### Browser flow (the only surface)

1. **Session.** A default remote session loads the site fine. `--verified` and
   `--proxies` do **not** help with the qualification reCAPTCHA, but they also
   don't hurt; use them only if you also need general stealth.

2. **Open the homepage.**
   ```
   browse open https://www.brightspeed.com/ --remote
   browse wait timeout 3000
   ```

3. **Type the address into the hero checker.** The input is:
   ```
   input[placeholder='123 Main Street, Springfield, MO, 12345']
   ```
   ```
   browse fill "input[placeholder='123 Main Street, Springfield, MO, 12345']" "6031 Monroe Rd, Charlotte, NC 28212"
   browse wait timeout 2500
   ```
   Do **not** use `browse type` for the address — unquoted commas break arg
   parsing. Use `browse fill "<selector>" "<full address>"` (it does not press
   Enter, which is what you want).

4. **Select the resolved suggestion.** After ~1.5–2.5s an autocomplete
   `listbox` appears. `browse snapshot` and click the `option` whose text
   matches (the exact match is usually the first option and marked
   `[selected]`, but you still must click it to commit the address):
   ```
   browse snapshot
   browse click [X-Y]      # the matching "…CHARLOTTE, NC, 28202" option
   browse wait timeout 800
   ```
   This fires `GET api-pr.brightspeed.com/ams2-digital/restservices/adq-api/v1/lookup?address=<urlenc>`
   which returns candidate addresses (see contract below).

5. **Click "Check Availability".**
   ```
   browse click [X-Y]      # button: Check Availability
   browse wait timeout 6000
   ```
   This fires `POST api-pr.brightspeed.com/digital/v1/addressservice/qualification`.

6. **Read the outcome.** Snapshot / screenshot the page and branch:
   - **Plan cards render** (plan name + speed + price) → serviceable →
     `status: "available"` (fiber if it advertises fiber speeds/symmetrical
     upload; else `available_non_fiber`).
   - **"…not available / not in your area" messaging** → `status: "not_available"`.
   - **Generic red banner "Something is not working properly. Please contact
     support at (833) 692-7773…"** → the qualification call was **blocked by
     reCAPTCHA** (HTTP 429). Emit `status: "blocked"`. **This is the outcome
     automated sessions hit today.** Do not report it as "not available" — the
     verdict is genuinely unknown.
   - **Autocomplete never resolves the address** → `status: "address_not_found"`.

   The URL stays `https://www.brightspeed.com/` throughout — the widget renders
   results in place; do not treat the unchanged URL as failure.

### Reading the true outcome without guessing (network / telemetry signals)

Because the visible banner is ambiguous, confirm the outcome from the network:

- Inject a `fetch`/`XMLHttpRequest` interceptor via `browse eval` **before**
  step 5, then read the captured `POST …/addressservice/qualification` response.
  A body of
  `{"fault":{"faultstring":"Recaptca violation. Recaptcha assessment failed."…}}`
  with status 429 = `blocked`. A 200 body carries the real verdict + offers.
- The page also emits Google Analytics `collect` beacons whose params encode the
  outcome, e.g. `ep.page_type=NC_NOT_QUALIFIED`, `up.main_scenario=api error`,
  `up.sub_scenario=address qual api…`, `ep.state_code=NC`,
  `ep.fiber_voice_eligible=false`. `main_scenario=api error` corresponds to the
  reCAPTCHA block, not a genuine "not qualified".

### Under-the-hood API contract (for reference / a future non-blocked path)

All on `https://api-pr.brightspeed.com`, all JSON. The browser obtains session
ids automatically; calling these standalone requires reproducing that handshake
**and** a valid reCAPTCHA token, so they are not a usable shortcut today.

- `GET  /shop/v1/amsId`  → `{"id":"…"}` (session id; also `POST /digital/v1/digitalId` → `{"id":"…"}`).
- `GET  /ams2-digital/restservices/adq-api/v1/lookup?address=<urlenc full address>`
  → `{"responseData":{"addresses":[{"fullAddress","addressId","street_line","city","state","zipcode","source"}…]}}`.
  The exact/verified match often has `source:"S"` with an empty `addressId`;
  other candidates have `source:"A"` with a numeric `addressId`. **Returns 401
  if called without the session context** — it is not a public open endpoint.
- `POST /digital/v1/addressservice/qualification` with body:
  ```json
  {"baseline":{"transactionId":"<uuid>","channel":"dotcom","partnerId":"","salesCode":"","agentId":"","siteId":"","wirecenter":"","partnerOrderId":"","intent":""},
   "addressLine1":"6031 MONROE RD CHARLOTTE, NC, 28212","addressId":"","latitude":"","longitude":"",
   "customerType":"Residential","timestamp":<epoch_ms>,"affiliateProgram":false}
  ```
  On a legitimate high-reputation session this returns the serviceability
  verdict + offers. On automated sessions it returns **HTTP 429 reCAPTCHA
  violation** — the wall.

## Site-Specific Gotchas

- **The qualification API is reCAPTCHA Enterprise–gated (the hard wall).**
  `POST /digital/v1/addressservice/qualification` returns
  `HTTP 429 {"fault":{"faultstring":"Recaptca violation. Recaptcha assessment
  failed.","detail":{"errorcode":"policies.recaptcha.RecaptchaViolation"}}}`
  for automated sessions. This is an **invisible, score-based** reCAPTCHA — there
  is no checkbox/image challenge to solve, so Browserbase `--verified` (which
  solves *visible* challenges) does not raise the score. Reproduced on 2
  independent fresh sessions (Odessa MO 64076 and Charlotte NC 28212) plus one
  autobrowse run — 3/3 blocked. **Confirmed: `--verified --proxies` does not
  defeat it.** Don't burn iterations retrying the same session shape.
- **The generic error banner ≠ "not available".** "Something is not working
  properly. Please contact support at (833) 692-7773 or use live chat." is what
  the SPA shows whenever the qualification call fails — which, for automation, is
  essentially always (the reCAPTCHA 429). Reporting it as "not serviceable"
  would be wrong; the correct label is `blocked` / unknown.
- **Residential proxy is NOT the issue.** The homepage anti-bot probe is clean
  and the site + lookup + amsId + digitalId calls all succeed without special
  stealth. Only the reCAPTCHA score on the qualification step blocks you. Adding
  proxies did not change the 429.
- **Address autocomplete is USPS/Smarty-style and picky.** "100 W Main St,
  Waverly, MO 64096" did not resolve (returned Odessa/Richmond/Lone Jack
  instead) — Waverly's address wasn't in the DB. Always drive off the returned
  `option` list, not the raw typed text. The top option is auto-`[selected]` but
  you must still click it to commit.
- **`browse type` breaks on the address.** Commas in the address are parsed as
  extra CLI args (`Error: Unexpected arguments: N,`). Use `browse fill`.
- **Result renders in place; URL never changes** from `https://www.brightspeed.com/`.
  Don't poll for a navigation — wait ~5–6s after clicking Check Availability and
  read the DOM / intercepted XHR.
- **`/shop/` 404s** and `buy.brightspeed.com` 500s — there is no alternate
  address-checker URL that bypasses the homepage widget; they all funnel to the
  same reCAPTCHA-gated qualification API.
- **Confirm outcome from the network, not just pixels.** The intercepted
  qualification response and the GA `collect` beacon (`ep.page_type`,
  `up.main_scenario`) are the reliable signals; the visible banner is ambiguous.
- **Read-only.** Stop at the verdict / plan cards. Never proceed to order,
  checkout, or enter personal data.

## Expected Output

`status` is one of `available`, `available_non_fiber`, `not_available`,
`address_not_found`, `blocked`.

```json
// OBSERVED under automation today — reCAPTCHA wall on the qualification API.
{
  "success": false,
  "address_checked": "6031 Monroe Rd, Charlotte, NC 28212",
  "serviceable": null,
  "service_type": null,
  "status": "blocked",
  "plans": [],
  "serviceability_api": "https://api-pr.brightspeed.com/digital/v1/addressservice/qualification",
  "error_reasoning": "Qualification API returned HTTP 429 'Recaptcha assessment failed' (reCAPTCHA Enterprise, invisible/score-based). Site showed the generic 'Something is not working properly' banner. Verdict unknown — not the same as 'not available'."
}
```

```json
// Shape a NON-blocked (human / high-reputation) session would return when serviceable.
{
  "success": true,
  "address_checked": "<resolved full address>",
  "serviceable": true,
  "service_type": "fiber",
  "status": "available",
  "plans": [
    { "name": "Fiber 500", "download_mbps": 500, "upload_mbps": 500, "price_usd": 49.00 }
  ],
  "serviceability_api": "https://api-pr.brightspeed.com/digital/v1/addressservice/qualification",
  "error_reasoning": null
}
```

```json
// Address the autocomplete could not resolve.
{
  "success": false,
  "address_checked": "100 W Main St, Waverly, MO 64096",
  "serviceable": null,
  "service_type": null,
  "status": "address_not_found",
  "plans": [],
  "serviceability_api": "https://api-pr.brightspeed.com/ams2-digital/restservices/adq-api/v1/lookup",
  "error_reasoning": "No matching address in Brightspeed's autocomplete; nearest suggestions were in other cities."
}
```
