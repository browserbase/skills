---
name: coupa-com-companyregistry-y0chx9
title: Coupa Supplier Portal Company Registry Signup
description: >-
  Drive the Coupa Supplier Portal self-service signup form at
  supplier.coupahost.com/sessions/new?page=signup to register a new company into
  Coupa's supplier registry. Fills legal name, contact, country, tax ID, and
  acceptances; stops at ready-to-submit in dry-run mode, submits + reports
  email-verification state in live mode.
website: coupa.com
category: procurement
tags:
  - procurement
  - supplier-onboarding
  - registration
  - b2b
  - coupa
  - form-fill
source: 'browserbase: agent-runtime 2026-05-20'
updated: '2026-05-20'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      No public REST/GraphQL API exists for self-service supplier registration.
      The form#signup_form declares method=get/action=/sessions/new?page=signup
      but the actual submit is a React-handled fetch to an internal
      CSRF/Pendo-cookie-gated endpoint that rejects replayed requests. Coupa's
      per-tenant <buyer>.coupahost.com APIs are for authenticated buyer
      transactions, not new-supplier creation. Browser is the only working
      surface.
verified: false
proxies: false
---
# Coupa Supplier Portal — Company Registry Signup

## Purpose

Automate the company-registry / supplier-registration flow on Coupa. Given a company's identity (legal business name, primary contact, country, tax ID) the skill drives the public Coupa Supplier Portal (CSP) self-service signup form at `https://supplier.coupahost.com/sessions/new?page=signup` — the single canonical entry point that creates a company record in Coupa's 9.5M-supplier registry and makes the company discoverable to Coupa buyers worldwide.

The skill drives the browser end-to-end up to (and optionally including) the final "Create an account" submit. Submission triggers a confirmation email to the supplied address; account activation requires the human/agent to click the verification link. **Account creation is a real write — only submit when the caller has provided real, consented company details and has access to the email inbox to complete verification.** When operating in dry-run mode, stop at the "ready to submit" state (every field filled, both checkboxes ticked) and emit the form state without clicking submit.

## When to Use

- Onboarding a new supplier company onto Coupa's marketplace so buyers can find them via Coupa Discovery / Discoverable Profile.
- Bulk-creating CSP accounts for many subsidiaries of a parent company.
- A scripted RPA flow that needs to register a company in response to a buyer invitation email (the buyer-invited path lands on the same `/sessions/new?page=signup` page with `?email=…` prefilled).
- Pre-validating a company's fields against Coupa's form constraints (name length, special-char restrictions, country/tax-ID format) before a human attempts manual signup.

This skill is **not** for:
- Logging into an existing CSP account → use `sessions/new` (no `page=signup` query) instead.
- Filling out a buyer-specific Supplier Information Management (SIM) questionnaire — that lives behind the buyer's Coupa tenant at `<buyer>.coupahost.com`, not on the public portal, and requires a CSP login first.
- Setting up a Discoverable Profile *after* registration — that's a downstream skill that requires CSP authentication.

## Workflow

There is **no public REST API** for self-service supplier registration. The CSP form `<form id="signup_form">` declares `method="get"` and `action="/sessions/new?page=signup"` but the actual submit is a React-driven AJAX call to an internal endpoint that requires the rendered page's anti-CSRF / Pendo / session-token cookies. Direct API replay is not viable; the browser flow is the optimal and only honest path. Coupa's internal `compass.coupa.com` documentation and the public Coupa Suppliers site both funnel new registrants exclusively through this form.

### 1. Bare cloud session is sufficient — no stealth, no proxies needed

Verified across two iterations (one with `--verified --proxies`, one bare): the CSP signup page returns 200 OK, fully renders the React form, and shows no reCAPTCHA, no Akamai/Cloudflare challenge, and no IP-geo gating. Save the budget; use a plain session.

```bash
SID=$(browse cloud sessions create --keep-alive | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$SID"
```

### 2. Navigate to the signup form

```bash
browse open "https://supplier.coupahost.com/sessions/new?page=signup" --remote
browse wait load --remote
browse wait timeout 3000 --remote      # React Session component hydrates ~2s after `load`
```

The page title should be `Coupa Supplier Portal`. The form heading reads `Create an account` / `Grow your Business on Coupa with a Free Account`. If the heading instead reads `Login` you landed on `/sessions/new` without the `?page=signup` query — re-open with the query string.

### 3. Fill the form fields

Use CSS-selector `browse fill` for the text/password inputs. **Target by `id` for stable inputs and by `name` for the two checkboxes** (their IDs carry a random numeric suffix that changes per render — observed `noTaxIdCheck_6` in iter 1 and `noTaxIdCheck_31` in iter 2).

| Field | Selector | Type | Notes |
|---|---|---|---|
| Business Name | `#business_name` | text | Legal business name (or legal personal name for sole proprietors) |
| Email | `#email` | text | Verification link will be mailed here — must be reachable |
| First Name | `#firstName` | text | **No `! ? * & < >` or other special chars** — form validates client-side |
| Last Name | `#lastName` | text | Same special-char restriction |
| Password | `#password` | password | ≥ 8 chars, must contain at least one letter and one digit |
| Confirm Password | `#confirm_password` | password | Must equal Password exactly |
| Country/Region | `#scu-id-1` (native `<select>`) | select | See country-code procedure below |
| Tax Registration | `#taxId` | text | Conditional — required unless `noTaxIdCheck` is ticked. Placeholder shows expected mask (e.g. `##########` for US 10-digit EIN) |
| No Tax ID checkbox | `input[name=noTaxIdCheck]` | checkbox | Tick this when no government tax ID is available |
| Privacy / Terms | `input[name=terms_and_privacy]` | checkbox | **Always required** — submit is blocked without it |

```bash
browse fill "#business_name" "Acme Robotics LLC" --remote
browse fill "#email" "ops@acmerobotics.example" --remote
browse fill "#firstName" "Jane" --remote
browse fill "#lastName" "Doe" --remote
browse fill "#password" "S0m3PassW0rd!" --remote
browse fill "#confirm_password" "S0m3PassW0rd!" --remote
```

### 4. Select Country/Region — read codes from `option.getAttribute('label')`

The Country control is a Coupa "SCU" custom widget over a native `<select id="scu-id-1">`. **The `<option>` text content is empty.** The visible country name lives in the `label` attribute, and the value is Coupa's internal numeric country ID. Don't rely on `option.text`.

Resolve a country code via `browse eval`:

```bash
COUNTRY="United States"
CODE=$(browse eval --remote "(() => { const sel = document.getElementById('scu-id-1'); const o = Array.from(sel.options).find(o => o.getAttribute('label') === '$COUNTRY'); return o ? o.value : ''; })()" \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).result))")
```

Then set + dispatch `change` so the React widget syncs and the Tax Registration mask updates:

```bash
browse eval --remote "(() => { const sel = document.getElementById('scu-id-1'); sel.value = '$CODE'; sel.dispatchEvent(new Event('change', {bubbles:true})); return sel.value; })()"
browse wait timeout 1500 --remote      # let the Tax mask + dependent UI re-render
```

Verified internal IDs (sampled from the 248-option list — not exhaustive, look up at runtime):

| Country | Internal ID |
|---|---|
| United States | 223 |
| United Kingdom | 82 |
| Canada | 39 |
| Germany | 79 |
| France | 73 |
| Italy | 105 |
| Spain | 193 |
| Japan | 108 |
| India | 99 |
| Brazil | 31 |

### 5. Fill Tax Registration (or tick "I do not have a Tax ID")

If a Tax ID is available, fill `#taxId` using the country-specific format shown by the placeholder after step 4. If not, tick the no-tax-ID checkbox — the field becomes optional:

```bash
# Path A — with Tax ID
browse fill "#taxId" "123456789" --remote      # US EIN example

# Path B — no Tax ID
browse eval --remote "document.querySelector('input[name=noTaxIdCheck]').click()"
```

### 6. Accept Privacy Policy + Terms of Use

```bash
browse eval --remote "document.querySelector('input[name=terms_and_privacy]').click()"
```

### 7. Verify form state, screenshot, then (only if authorized) submit

```bash
browse screenshot --remote --path /tmp/coupa-ready-to-submit.png
# Dry-run mode: STOP here and emit { status: "ready_to_submit", fields: {...} }

# Authorized live mode only:
browse click "button[type=submit]" --remote      # the "Create an account" button
browse wait load --remote
browse wait timeout 3000 --remote
browse get url --remote
```

After a successful submit the user lands on a "Please check your email" / email-confirmation interstitial. Account activation completes when the user clicks the link in the confirmation email — that final step is out-of-band and not automatable from this skill.

### 8. Release the session

```bash
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

## Site-Specific Gotchas

- **No anti-bot wall on the signup page.** Verified across two consecutive iters: bare cloud session (no `--verified`, no `--proxies`) loads the form, renders all fields, and shows no reCAPTCHA / Akamai / Cloudflare challenge. Don't burn the proxy budget here.
- **Checkbox IDs are render-volatile.** The "I do not have a Tax ID" checkbox had `id=noTaxIdCheck_6` in one render and `noTaxIdCheck_31` in another; "I accept Terms" was `terms_and_privacy_5` in one render. **Always target by `name` attribute**, never by full ID.
- **Country `<option>` text is empty — labels are in the `label` attribute.** The visible UI text is rendered by a separate SCU custom-select layer over the native `<select id="scu-id-1">`. JavaScript reading `option.text` will return `""`; use `option.getAttribute('label')` to look up countries by name. The 249 options (one blank placeholder + 248 countries) use opaque numeric internal IDs (e.g. US=223, not "US"/"USA"/"840").
- **The form is React-rendered.** `<div data-react-component="Session" ...>` hydrates asynchronously. Always `browse wait load && browse wait timeout 3000` (or longer) before the first `fill`/`eval`, or the input may be replaced mid-keystroke and silently dropped.
- **`form#signup_form` has `method="get" action="/sessions/new?page=signup"` — that's a red herring.** The real submit is a React-handled fetch to a CSRF/Pendo-cookie-gated internal endpoint that won't accept replayed requests. Direct API automation is not viable; the browser flow is the only working path.
- **First/Last name reject `! ? * & < >`.** The form's helper text states this explicitly; submission fails client-side with these chars present. If a real legal name contains these (rare), strip them.
- **Password rules: ≥ 8 characters with at least one letter and at least one digit.** No symbol requirement, but high entropy is recommended.
- **Country must be selected before Tax Registration validates.** The Tax mask + "do I have a tax ID" branch are computed from the chosen country — set country first, then fill Tax ID (or tick `noTaxIdCheck`).
- **`?email=…` prefilling exists for buyer-invited registrants.** When a Coupa buyer invites a supplier, the email link lands on `/sessions/new?page=signup&email=<urlenc>` with the Email field prefilled and locked. The rest of the flow is identical. The skill does not need a separate branch — just don't overwrite a pre-filled email.
- **No public REST/GraphQL API for self-service registration.** Verified by inspection of the form `action` + multiple iterations. Coupa's API ecosystem (the per-tenant `<buyer>.coupahost.com/api/...`) is for authenticated transactions inside a buyer's Coupa instance, not for creating a brand-new supplier company. Don't waste time looking for `POST /api/suppliers` or `/api/registrations` — they don't exist on the public surface.
- **READ / DRY-RUN posture is the safe default.** Submitting the form creates a real account in Coupa's production registry and dispatches a real verification email. Only submit when the caller has provided real, consented company data and owns the inbox.
- **`supplier.coupa.com` (no `host`) is marketing/info pages; `supplier.coupahost.com` is the actual application.** The marketing site's "Get Started Now" / "Get Verified Now" CTAs all redirect to `supplier.coupahost.com/sessions/new?page=signup`, so navigating to either works — but skip the marketing-site hop and go straight to `supplier.coupahost.com` to save a navigation.
- **Many locale variants are offered in the footer** (50+ locales including `en-GB`, `de`, `fr`, `ja`, `zh-CN`, `ar`, etc.). The field `name` attributes (`business_name`, `email`, `firstName`, …) stay identical in every locale — only the visible labels change. Selector strategy is locale-independent.
- **Login form has a "Continue" two-step pattern.** If you accidentally land on `/sessions/new` (no signup query), the page shows an Email field with a `Continue` button that reveals the Password field on next render. That's the login flow, not registration — back out to `?page=signup`.

## Expected Output

The skill should emit one of these JSON shapes after each invocation.

```json
// Dry-run mode — every field filled, ready to submit, but NOT submitted
{
  "success": true,
  "status": "ready_to_submit",
  "submitted": false,
  "url": "https://supplier.coupahost.com/sessions/new?page=signup",
  "form_state": {
    "business_name": "Acme Robotics LLC",
    "email": "ops@acmerobotics.example",
    "firstName": "Jane",
    "lastName": "Doe",
    "country": { "name": "United States", "coupa_id": "223" },
    "taxId": "123456789",
    "noTaxIdCheck": false,
    "terms_and_privacy": true
  }
}
```

```json
// Live mode — submit succeeded, awaiting email verification
{
  "success": true,
  "status": "awaiting_email_verification",
  "submitted": true,
  "verification_email_to": "ops@acmerobotics.example",
  "landing_url": "https://supplier.coupahost.com/...",
  "next_step": "User must click the link in the verification email to activate the account."
}
```

```json
// Client-side validation rejected the input
{
  "success": false,
  "reason": "validation_error",
  "field_errors": {
    "firstName": "Cannot contain special characters or symbols",
    "password": "Use at least 8 characters and include a number and a letter"
  }
}
```

```json
// Email already registered on Coupa
{
  "success": false,
  "reason": "email_already_registered",
  "email": "ops@acmerobotics.example",
  "hint": "Use the existing CSP account at https://supplier.coupahost.com/sessions/new (login flow)."
}
```

```json
// Page never finished rendering (rare — usually a flake, retry)
{
  "success": false,
  "reason": "form_did_not_render",
  "title": "<page title observed>",
  "url": "<final URL>"
}
```
