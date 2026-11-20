---
name: irs-gov-check-refund-status-89r6ko
title: IRS Federal Refund Status Check
description: >-
  Look up federal tax-refund status on the IRS "Where's My Refund?" tool from an
  SSN/ITIN, filing status, and exact whole-dollar refund amount; returns the
  current stage (Return Received / Refund Approved / Refund Sent), any surfaced
  date, and IRS message codes. Read-only; handles sensitive PII.
website: irs.gov
category: government
tags:
  - irs
  - taxes
  - refund
  - government
  - akamai
  - read-only
  - pii
source: 'browserbase: agent-runtime 2026-06-04'
updated: '2026-06-04'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      The SPA submits to POST
      https://sa.www4.irs.gov/api/taxpayers/accounts/wmr/1.0/refundSummary, but
      the call is NOT standalone-callable: it requires an X-IRS-Session-Id token
      minted client-side on page load plus the Akamai Bot Manager cookies
      (_abck/bm_sz) established by running the sensor JS. A cookieless POST is
      rejected. Use only by warming a stealth browser session first, then
      issuing the POST in-page.
verified: true
proxies: true
---
# IRS Federal Refund Status Check — Browser Skill

## Purpose

Given a taxpayer's SSN (or ITIN), filing status, and exact whole-dollar refund amount, look up federal refund status on the IRS "Where's My Refund?" (WMR) tool at `https://sa.www4.irs.gov/wmr/` and return the current stage (Return Received / Refund Approved / Refund Sent), the estimated or confirmed deposit/mail date when surfaced, any IRS message codes shown (Tax Topic 152 / 151 / 203, etc.), and the canonical status-page URL. **Read-only** — it only submits the lookup form and reads the result; it never changes anything. **This skill handles deeply sensitive PII (a live SSN).** Never log or persist the SSN, never echo it to stdout or any trace, and never accept it over an insecure channel.

## When to Use

- A taxpayer (or an authorized agent acting on their behalf, with their consent) wants the current processing stage of their federal refund.
- Polling for a refund's progression through the three WMR stages once per day (WMR data updates once daily, overnight — more frequent checks add nothing).
- Surfacing the IRS Tax Topic / message code attached to a return (e.g. Tax Topic 152 = normal processing, 151 = offset/appeal, 203 = refund reduced by a debt offset).

Do **not** use this for state refunds (each state has its own tool) or for amended-return status (that is a separate IRS tool, "Where's My Amended Return?", at a different URL).

## Workflow

The IRS WMR tool is a single-page app behind **Akamai Bot Manager** and an aggressive application-level rate limit. A Browserbase **stealth + residential-proxy** session is mandatory, and you get a very small number of attempts before the tool locks the SSN out for ~24 hours. Run **one** low-volume query per session and do not retry the same SSN.

There is an internal JSON endpoint (`POST /api/taxpayers/accounts/wmr/1.0/refundSummary`) but it is **not** independently callable — see the gotcha below. The reliable path is the browser form.

### 1. Create a stealth + proxy session

```bash
sid=$(browse cloud sessions create --keep-alive --verified --proxies \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s.match(/\{[\s\S]*\}/)[0]).id))")
export BROWSE_SESSION="$sid"
```

Both `--verified` and `--proxies` are required. (In two test runs, stealth + proxy passed the Akamai gate cleanly on every page load — the wall you actually hit is the IRS app-level attempt limit, not Akamai.)

### 2. Open the tool and snapshot

```bash
browse open "https://sa.www4.irs.gov/wmr/" --remote
browse wait load --remote
browse snapshot --remote
```

The landing page **is** the entry form (no intro/interstitial click needed). The accessibility tree exposes ~120 refs. The fields, in order:

1. **Social Security Number** — text input. Accepts `123-45-6789` or `123456789`; the field masks to `***-**-****` and offers a "Show SSN" toggle. (`browse fill <selector> <value>` mis-parses the dashed value as multiple args — instead `browse click` the field ref, then `browse type 123-45-6789`.)
2. **Tax Year** — radio group. Options are dynamic; observed `2025 (Latest Tax Year)`, `2024`, `2023`. Pick the year of the return being tracked.
3. **Filing Status** — radio group with exactly these five options: `Single`, `Married-Filing Joint Return`, `Married-Filing Separate Return`, `Head of Household`, `Qualifying Widow(er) / Surviving Spouse`.
4. **Refund Amount** — text input. Enter the **exact whole-dollar** amount from the return (no `$`, no commas, no cents). The on-page help stresses it must match exactly.

### 3. Fill and submit

```bash
browse click @<ssn-ref> --remote && browse type "123-45-6789" --remote   # use the real SSN
browse click @<taxyear-ref> --remote        # e.g. 2024
browse click @<filing-status-ref> --remote  # e.g. Single
browse click @<refund-amount-ref> --remote && browse type "1500" --remote
browse click @<submit-ref> --remote          # button labeled "Submit"
browse wait load --remote
browse snapshot --remote
```

Submission is an in-place XHR (`POST .../refundSummary`); **the URL stays `https://sa.www4.irs.gov/wmr/`** — do not wait for a navigation. The canonical results path surfaced in the breadcrumb is `https://sa.www4.irs.gov/wmr/refund_status`.

### 4. Branch on the result page

The result renders a "Refund Status Results" page. Read the heading + alert text and map it:

- **Status tracker present** (a 3-step progress bar: *Return Received → Refund Approved → Refund Sent*) → `outcome: "status_found"`. Read which stage is active, any "Refund Sent/Approved on `<date>`" or "expected by `<date>`" text, and any "Tax Topic NNN" / "Take Action" message. (HTTP 200 from `refundSummary`.)
- **"The information you entered doesn't match our records"** → `outcome: "validation_mismatch"`. The four inputs don't match an IRS record (wrong amount is the most common cause). (HTTP 401.)
- **"Maximum attempts exceeded — You have exceeded the number of maximum attempts. Please try again tomorrow."** → `outcome: "anti_bot_block"` (application rate-limit lockout, ~24h, keyed to the TIN). (HTTP 429.)
- **Akamai "Access Denied" / reference-number page, captcha, or the form never renders** → `outcome: "form_unreachable"` (true bot wall — rare with stealth+proxy). Soft-fail with a screenshot.

### 5. Screenshot and release

```bash
browse screenshot --remote --path result.png
browse cloud sessions update "$sid" --status REQUEST_RELEASE
```

**Never write the SSN into a filename, log line, or persisted artifact.**

## Site-Specific Gotchas

- **READ-ONLY + PII discipline.** The tool only reads status, but the input is a live SSN. Do not log/persist it, do not put it in screenshot filenames or trace fields, and refuse to run if the SSN would traverse an insecure channel. The form itself carries a federal-use warning ("Unauthorized use violates Federal law … 18 U.S.C. 1030, 26 U.S.C 7213A/7431").
- **Aggressive per-TIN lockout.** After a small number of attempts the tool returns **"Maximum attempts exceeded … try again tomorrow"** (HTTP 429) and blocks that SSN for ~24h. The lockout tracks the **TIN, not the IP** — observed across two sessions on rotating residential proxies. **Run exactly one query per SSN per session; never retry a mismatch.** A wrong refund amount burns an attempt.
- **Akamai Bot Manager is present but passable.** Page load fetches `/akam/13/...`, `/akam/13/pixel_...`, and an obfuscated sensor path (e.g. `/pHwQrI/qu/...`). With `--verified --proxies` both test runs loaded the form with zero Akamai 403s. A **bare (non-stealth) session is not advised** — treat stealth+proxy as mandatory.
- **The internal API is NOT a standalone shortcut.** The SPA POSTs to `https://sa.www4.irs.gov/api/taxpayers/accounts/wmr/1.0/refundSummary` with body `{"tin":"<9 digits, no dashes>","taxYear":"2024","filingStatus":"SINGLE","refundAmount":"1500"}` and required headers `X-IRS-Session-Id: <token>`, `X-IRS-System-Id: WMR-UI`, `Cache: no-store`, `credentials: same-origin`. The `X-IRS-Session-Id` is minted client-side on page load and the request also depends on the Akamai `_abck`/`bm_sz` cookies — a cookieless/headless POST is rejected. Don't waste time trying to call it directly; if you want to avoid the form UI, warm a stealth browser session first and issue the POST from page context. `filingStatus` enum values: `SINGLE`, `MARRIED_FILING_JOINTLY`, `MARRIED_FILING_SEPARATELY`, `HEAD_OF_HOUSEHOLD`, `QUALIFYING_WIDOW` (UI labels map to these; verify against the live radio refs).
- **Response → status-code map** (from `refundSummary`): **200** = match, returns the status tracker JSON; **401** = "doesn't match our records" (validation mismatch); **429** = "maximum attempts exceeded" lockout. The SPA renders all three on the same `/wmr/` URL.
- **No navigation on submit.** It's an in-place XHR; `browse get url` returns `https://sa.www4.irs.gov/wmr/` before and after. Don't `wait` for a URL change — `wait load` + `snapshot` and read the alert text.
- **`browse fill` breaks on dashed SSNs.** `browse fill <sel> 123-45-6789` is parsed as extra CLI args and errors. Click the field ref, then `browse type`.
- **Tax-year options are dynamic.** The radio list shifts as filing seasons roll (saw `2024/2023` and later `2025 (Latest Tax Year)/2024/2023`). Read the live refs rather than hardcoding a year ref.
- **Refund amount must be exact whole dollars.** No `$`, commas, or cents. A near-miss counts as a mismatch and burns a lockout attempt.
- **WMR data refreshes once daily (overnight).** Polling more than once a day yields no new info; respect that to avoid the lockout.
- **A true `status_found` (200) result could not be demonstrated in testing** because that requires a real, matching SSN + refund amount, which must never be used for testing. The success-path shape below is documented from the tool's known three-stage tracker; treat it as the target shape, not an observed capture. This is why the skill ships as `candidate`.

## Expected Output

```json
// status_found — a real, matching lookup (HTTP 200). Stage is one of the three; date/codes appear when surfaced.
{
  "success": true,
  "stage": "Refund Approved",
  "refund_date": "2026-03-12",
  "message_codes": ["Tax Topic 152"],
  "status_url": "https://sa.www4.irs.gov/wmr/refund_status",
  "outcome": "status_found",
  "error_reasoning": null
}

// validation_mismatch — inputs don't match IRS records (HTTP 401). Expected for any non-matching SSN/amount.
{
  "success": false,
  "stage": null,
  "refund_date": null,
  "message_codes": [],
  "status_url": "https://sa.www4.irs.gov/wmr/",
  "outcome": "validation_mismatch",
  "error_reasoning": "The information you entered doesn't match our records. Please double-check your information and try again."
}

// anti_bot_block — IRS application rate-limit lockout (HTTP 429), keyed to the TIN, ~24h.
{
  "success": false,
  "stage": null,
  "refund_date": null,
  "message_codes": [],
  "status_url": "https://sa.www4.irs.gov/wmr/",
  "outcome": "anti_bot_block",
  "error_reasoning": "Maximum attempts exceeded. You have exceeded the number of maximum attempts. Please try again tomorrow."
}

// form_unreachable — Akamai Access-Denied / captcha / form never rendered (rare with stealth+proxy).
{
  "success": false,
  "stage": null,
  "refund_date": null,
  "message_codes": [],
  "status_url": "https://sa.www4.irs.gov/wmr/",
  "outcome": "form_unreachable",
  "error_reasoning": "Akamai bot wall: Access Denied (reference #...) before the form rendered."
}
```
