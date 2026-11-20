---
name: whois-auda-org-au-domain-whois-lookup-bcdtfm
title: auDA .au Domain WHOIS Lookup
description: >-
  Look up an .au domain on the auDA WHOIS service (whois.auda.org.au) to read
  registrant/business name, registrar name, and eligibility (ABN/ACN) details.
  Read-only. Access is gated by a two-stage reCAPTCHA Enterprise that reliably
  steps automated sessions up to an unsolvable image challenge.
website: whois.auda.org.au
category: domains
tags:
  - whois
  - domains
  - au
  - registrar
  - recaptcha
  - lookup
source: 'browserbase: agent-runtime 2026-08-18'
updated: '2026-08-18'
recommended_method: browser
alternative_methods:
  - method: cli
    rationale: >-
      Port-43 WHOIS (whois -h whois.auda.org.au) is heavily rate-limited and,
      since auDA's 2018 privacy changes, redacts registrant name/email for most
      licences; not reachable from this sandbox (DNS/egress locked to the browse
      tooling). Not a reliable substitute for the fields requested.
  - method: api
    rationale: >-
      No public RDAP/JSON API for .au. IANA RDAP bootstrap has no .au entry;
      rdap.auda.org.au and rdap.audns.net.au return 500 and
      rdap.identitydigital.services returns 404. Confirmed dead ends.
verified: true
proxies: true
---
# auDA .au Domain WHOIS Lookup

## Purpose

Query the official auDA WHOIS service at `https://whois.auda.org.au/` for a single `.au`
domain name and read back the licence-holder record — registrant/business name, the
registrant's contact/eligibility details (ABN/ACN eligibility number), and the sponsoring
registrar. This is a **read-only** lookup: type a domain, submit, read the result table.

**Honest status — anti-bot wall.** The form is gated by a two-stage reCAPTCHA Enterprise.
Automated sessions (tested across multiple fresh Browserbase sessions with `--verified`
stealth **and** residential `--proxies`) consistently score too low on the invisible first
stage, which makes the server step up to a **visible reCAPTCHA checkbox that then triggers
an image challenge** ("select all squares with taxis / a fire hydrant / …"). That image
challenge cannot be solved programmatically within scope, so the WHOIS result table could
not be reached during testing. Everything below documents the exact mechanics, the point of
failure, and the confirmed dead ends so a future agent does not have to re-derive them.
Note also that auDA's own WHOIS Policy explicitly prohibits automated/bulk collection and
aggregation of this data.

## When to Use

- You need the sponsoring registrar, licence status, or registrant/eligibility details for a
  single, specific `.au` domain (e.g. `example.com.au`, `example.org.au`, `example.id.au`).
- You are confirming whether an `.au` domain is licensed and who holds it.
- **Do not** use this for bulk/aggregate collection across many domains — it is explicitly
  forbidden by the auDA WHOIS Policy and is exactly what the reCAPTCHA step-up defends against.
- If you need registrant **email**, temper expectations: auDA redacts registrant contact
  email from public WHOIS for most licences (see gotchas).

## Workflow

There is no non-browser shortcut (see Site-Specific Gotchas — RDAP and port-43 are dead
ends), so the browser is the recommended and only method. Drive a remote Browserbase session
with stealth + residential proxy; those raise the invisible reCAPTCHA score but, in testing,
were still not enough to avoid the image challenge.

1. **Create a stealth session.** `browse cloud sessions create --keep-alive --verified --proxies`.
   Anything less (bare/datacenter) scores strictly worse and steps up immediately.
2. **Open the form.** `browse open "https://whois.auda.org.au/" --remote --session "$sid"`.
   The page is a small ASP.NET Core form: text input `#Query` (name `Query`), hidden
   `QueryType=Domain`, hidden `CaptchaToken`, hidden `CaptchaType=Score`, and an ASP.NET
   `__RequestVerificationToken` anti-forgery field (paired with the `.AspNetCore.Antiforgery.*`
   cookie).
3. **Wait for reCAPTCHA to register (~12 s).** The invisible reCAPTCHA Enterprise client
   (site key `6LeFBB4qAAAAABtvDSu4J3cLuukJ_pH9KJOuEoRY`, action `QUERY`) needs ~10-12 s after
   load before `grecaptcha.enterprise.execute(...)` will return a token. Clicking earlier
   submits an **empty** `CaptchaToken`; the client-side `validateForm` then blocks the submit
   and shows the (normally hidden) `#rfvCaptcha` "Please select the verification checkbox."
   span — this is *not* a server response, just a race.
4. **Enter the domain and submit.** `browse fill "#Query" "<domain>.com.au"`, then click the
   "Look It Up" button (`#btnSubmit`). The page's own click handler runs
   `grecaptcha.enterprise.execute` and programmatically submits the form (POST to `/`). A
   genuine mouse-driven click (optionally preceded by mouse movement) yields the best v3 score.
5. **Read the outcome of the POST.** The POST returns 200 and re-renders the same page:
   - **Score passed → results render inline** below the form (the table with registrant /
     registrar / eligibility fields). Extract from there. *(Not observed in testing — see
     status note.)*
   - **Score too low → step-up.** The returned page swaps the invisible widget for a
     **visible checkbox** reCAPTCHA rendered into `#dvCaptcha` (a *different* site key
     `6Ld3MSMqAAAAAIU_qrBNaNvuLzZf5EaSDwhEdJYA`, action `WhoisWebQuery`). The query text is
     preserved in `#Query`. There is no visible error text (the `#rfvCaptcha` span stays
     `display:none`).
6. **If stepped up: the checkbox → image-challenge wall.** Clicking the "I'm not a robot"
   checkbox (inside the `#dvCaptcha` iframe, ~304×78 px) opens a reCAPTCHA image challenge
   ("select all squares with …"). **Stop here** — do not attempt to solve it. Report the
   blocked outcome (see Expected Output). This was the terminal state on every attempt.

## Site-Specific Gotchas

- **Two different reCAPTCHA keys / two stages.** Stage 1 (GET homepage) = invisible
  score-based, key `6LeFBB4q…`, action `QUERY`, `CaptchaType=Score`. Stage 2 (low-score
  step-up, injected into the POST-back page) = visible checkbox v2-style, key `6Ld3MSMq…`,
  action `WhoisWebQuery`. Don't confuse them.
- **The `~12 s` reCAPTCHA warm-up is real.** Before it registers,
  `grecaptcha.enterprise.execute` throws `Invalid site key or not loaded in api.js`. This is
  timing, not a wrong key. Wait, then it returns a ~2.4–2.6 KB token.
- **Generating the token via `browse eval` scores ~0 (instant step-up).** A token minted with
  no user interaction is treated as a bot. Even a genuine `browse click` on `#btnSubmit`
  (which is what a real user does) was **still** stepped up to the checkbox on every tested
  session. So the invisible stage is effectively closed to automation here even with
  `--verified --proxies`.
- **Clicking the step-up checkbox does NOT auto-pass — it opens an image challenge.** In
  testing it asked for "taxis" and "a fire hydrant". Solving image challenges is out of scope;
  treat this as the wall.
- **"Please select the verification checkbox" (`#rfvCaptcha`) is usually a client-side race,
  not a server rejection.** It's `display:none` by default and only shown by `validateForm`
  when `CaptchaToken` is empty at submit time. A low-score *server* rejection instead returns
  a clean form (query preserved, `#dvCaptcha` now holding a checkbox iframe), with no visible
  error.
- **No JSON/RDAP API — confirmed dead ends.** `.au` is **absent** from the IANA RDAP bootstrap
  (`data.iana.org/rdap/dns.json`). Direct RDAP probes: `https://rdap.auda.org.au/domain/…`
  → 500, `https://rdap.audns.net.au/domain/…` → 500,
  `https://rdap.identitydigital.services/rdap/domain/…` → 404. Do not waste time on RDAP.
- **Port-43 WHOIS is not a substitute.** `whois -h whois.auda.org.au <domain>` is heavily
  rate-limited and, since auDA's 2018 privacy changes, redacts registrant name/email for most
  licences; it was also unreachable from the sandbox (DNS/egress is locked to the `browse`
  tooling). Registrar name is the field most likely to survive on port 43.
- **Registrant email is very likely unavailable even on success.** auDA redacts registrant
  contact email from public WHOIS for most licences. Expect `registrar_name`, registrant
  (org) `business_name` for commercial licences, and an eligibility/`abn` number to be the
  realistically obtainable fields; treat `email` as usually redacted/`null`.
- **Policy caveat.** auDA's WHOIS Policy forbids aggregating/compiling WHOIS data and
  high-volume automated querying. Keep to single, purpose-limited lookups.

## Expected Output

Two outcome shapes. The **blocked** shape is what was actually produced in testing; the
**success** shape is the intended result contract if the invisible reCAPTCHA score passes
(rare for automated sessions) and the result table renders.

Blocked (observed — reCAPTCHA image-challenge wall):

```json
{
  "success": false,
  "domain": "telstra.com.au",
  "business_name": null,
  "email": null,
  "registrar_name": null,
  "abn": null,
  "blocked_by": "recaptcha-image-challenge",
  "error_reasoning": "Invisible reCAPTCHA Enterprise (action QUERY) scored too low; the server stepped up to a visible checkbox (action WhoisWebQuery) which opened an image challenge ('select all squares with …'). The WHOIS result table was not reachable."
}
```

Success (intended contract — not reached in testing; `email` typically redacted by auDA):

```json
{
  "success": true,
  "domain": "example.com.au",
  "business_name": "Example Pty Ltd",
  "email": null,
  "registrar_name": "Example Registrar Pty Ltd",
  "abn": "12345678901",
  "eligibility_type": "Company",
  "status": ["serverRenew Prohibited", "serverDelete Prohibited"],
  "last_modified": "2024-01-01T00:00:00Z",
  "blocked_by": null,
  "error_reasoning": null
}
```

Domain not licensed / not found (intended contract):

```json
{
  "success": true,
  "domain": "no-such-domain.com.au",
  "found": false,
  "business_name": null,
  "email": null,
  "registrar_name": null,
  "abn": null,
  "blocked_by": null,
  "error_reasoning": "No current licence found for the queried domain."
}
```
