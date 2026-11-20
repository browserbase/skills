---
name: plugandpay-com-account-management-ic4kjh
title: Plug&Pay Customer Portal Account Management
description: >-
  Reach the Plug&Pay Customer Portal
  (portal.plugandpay.com/login/{merchant-slug}) where a customer manages their
  account: view subscriptions, download invoices, edit billing details, change
  payment term, and cancel/resume a subscription. Documents the passwordless
  magic-link login gate. Read-only.
website: plugandpay.com
category: account-management
tags:
  - account-management
  - customer-portal
  - subscriptions
  - invoices
  - passwordless-login
  - read-only
  - cloudflare
source: 'browserbase: agent-runtime 2026-06-08'
updated: '2026-06-08'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      Supporting endpoints exist (GET api.plugandpay.com/portal/enabled/{slug},
      GET /v2/countries, POST portal.plugandpay.com/magic-link/{slug}) but none
      bypass login — the magic-link POST only emails a one-time login link, so
      an inbox is still required. Not a usable headless path.
verified: false
proxies: true
---
# Plug&Pay Customer Portal — Manage Your Account

## Purpose

Reach the Plug&Pay **Customer Portal** — the surface where a buyer/customer of a
Plug&Pay merchant manages their own account: view active subscriptions, download
invoices, edit billing and contact details, change their payment term, and
cancel or resume a subscription. The portal lives at
`https://portal.plugandpay.com/login/{merchant-slug}` and is gated by a
**passwordless magic-link login** (enter email → receive a one-time login link by
email → click it). This skill documents how to reach the portal, drive the login
gate, and recognise each outcome state. It is **read-only**: it does not complete
a login and does not modify, cancel, or resume anything.

> Note on scope: "account management" on Plug&Pay has two distinct surfaces. The
> end-customer **Customer Portal** (this skill) is the only one reachable without
> pre-provisioned merchant credentials. The separate *merchant admin dashboard*
> (Settings > Administration > Users / Customer Portal / Subscription) is behind a
> private merchant login that is not publicly reachable — see Site-Specific
> Gotchas.

## When to Use

- "Log me into my Plug&Pay customer portal to download an invoice."
- "Cancel / pause my subscription with {merchant} that runs on Plug&Pay."
- "Update the billing details on my Plug&Pay-managed subscription."
- An agent that needs to confirm the login mechanism (passwordless magic-link) or
  detect whether a given merchant slug has the Customer Portal enabled.
- Any flow that needs to reach the portal account screen, given the customer can
  supply the magic link / OTP that lands in their own inbox.

## Workflow

The Customer Portal is a JavaScript SPA fronted by Cloudflare. A **residential-proxy
browser session (`--proxies`)** is sufficient — Cloudflare's managed JS challenge
fires (`/cdn-cgi/challenge-platform/...`) but does not block. `--verified` was not
required in testing. There is no usable public API for login itself (the
`magic-link` endpoint only triggers an email; you still need the inbox), so the
recommended method is the browser.

1. **Start a proxied remote session and open the portal.** The merchant slug is
   required; Plug&Pay's own demo instance uses slug `plugandpay-3`.
   ```bash
   browse open "https://portal.plugandpay.com/login/{merchant-slug}" --remote
   browse wait timeout 2000   # SPA hydrates ~2s; raw HTML is nearly empty until then
   browse snapshot
   ```
2. **Confirm you're on the login gate.** Expect heading `Login met e-mailadres`
   (Dutch default; "Login with email address"), subtext
   `Op deze manier is zeker dat jij je aanmeldt, en niemand anders.`, a single
   `<input type="email">` (placeholder `info@plugandpay.nl`), a submit button
   `Link versturen` ("Send link"), and a NL/English language switcher. There is
   **no password field** — authentication is passwordless magic-link only.
3. **Request the magic link** (only when a real customer email + inbox is
   available). Fill the email and submit:
   ```bash
   browse fill 'input[type="email"]' "<customer-email>"
   browse click "<submit-button-ref>"   # the "Link versturen" button
   browse wait timeout 3000
   browse get text body
   ```
   - On an **accepted email**, the screen swaps to heading `E-mail verzonden`
     ("Email sent") with body
     `In je mail heb je als je e-mailadres klopte een loginlink ontvangen.
     Controleer ook je spam.` ("If your email address was correct you've received
     a login link in your mail. Also check your spam.") and a resend link
     `Niets ontvangen? Probeer het opnieuw.` ("Nothing received? Try again.").
   - On an **unknown / non-customer email**, the underlying
     `POST /magic-link/{slug}` returns **HTTP 422** and the form stays as-is.
4. **Complete login out-of-band.** The customer opens the magic link emailed to
   them. An agent cannot proceed past this gate without inbox access — stop here
   and hand the link/OTP step to the user.
5. **After login (capabilities reference, requires the magic link).** The portal
   lists active subscriptions and exposes, depending on what the merchant enabled
   under their *Customer Portal* settings: download invoices, edit billing/contact
   details, change payment term (e.g. monthly → annual via the per-subscription
   screen), and cancel/resume a subscription (via the **Actions** button →
   *Cancel* / *Resume*). Plug&Pay Lite/Premium merchants may have only a subset
   enabled (full portal is a Plug&Pay Ultimate feature; partial on Premium via the
   Huddle link).

**Read-only rule:** do not click *Cancel*, *Resume*, or save edited billing
details. Stop at the account/subscription overview.

## Site-Specific Gotchas

- **Passwordless only — no password field.** Login is an emailed magic link
  ("Link versturen" / send link). An agent cannot self-serve past the gate without
  access to the target inbox. Don't hunt for a password form; there isn't one.
- **`--proxies` is sufficient; `--verified` not needed.** Confirmed over two runs:
  a residential-proxy session passes Cloudflare's managed JS challenge
  (`/cdn-cgi/challenge-platform/...` + `/cdn-cgi/rum`). A bare (no-proxy) session
  was not validated — the pre-run probe flagged proxies as likely-needed, so keep
  `--proxies` on.
- **Merchant slug is mandatory in the URL.** The portal is multi-tenant:
  `https://portal.plugandpay.com/login/{merchant-slug}`. Without the slug you can't
  reach a specific merchant's portal. `plugandpay-3` is Plug&Pay's own demo slug
  and is a reliable probe target.
- **`portal.plugandpay.nl` 301-redirects to `portal.plugandpay.com`.** Use the
  `.com` host directly to skip the redirect hop.
- **Default language is Dutch (NL).** Headings/labels are Dutch out of the box
  (`Login met e-mailadres`, `Link versturen`, `E-mail verzonden`). An English
  toggle exists in the footer language switcher. Match on the Dutch strings unless
  you've switched the locale.
- **Email validation is server-side and leaks membership.** `POST /magic-link/{slug}`
  returns **422** for an email that is not a customer of that merchant, but the UI
  also shows a privacy-preserving "if your email was correct…" confirmation. Treat
  a 422 as "email not recognised for this merchant," and the `E-mail verzonden`
  screen as "request accepted."
- **Useful supporting endpoints (not a login bypass):**
  `GET https://api.plugandpay.com/portal/enabled/{slug}` → 200 indicates the portal
  is active for that merchant; `GET https://api.plugandpay.com/v2/countries` → 200
  feeds the billing-address country dropdown. Neither lets you skip the magic link.
- **The page is a hydrate-on-load SPA.** Raw HTML is essentially empty — always
  `browse wait timeout 2000` (or wait for the email input) before snapshotting.
- **`browse get text <selector>` rejects comma-separated selectors** (e.g.
  `form, .login-form`) with an "Unexpected arguments" error. Query one selector at
  a time, or use `browse get text body` / `browse get html body`.
- **Merchant admin dashboard is out of scope / not publicly reachable.** Account
  actions documented in Plug&Pay's help center as *Settings > Administration*
  (adding users, the merchant's own subscription, enabling the Customer Portal)
  live in a private merchant app, not at any guessable `app.`/`my.`/`dashboard.`
  subdomain (`app.plugandpay.com`, `my.plugandpay.com`, `app.plugandpay.nl`,
  `dashboard.plugandpay.com` all return 404). Don't waste time probing for it; the
  customer-facing portal above is the reachable surface.

## Expected Output

Three distinct outcome shapes:

```json
// 1. Login gate reached (default success — read-only stop point)
{
  "success": true,
  "portal_url": "https://portal.plugandpay.com/login/plugandpay-3",
  "merchant_slug": "plugandpay-3",
  "login_method": "email-magic-link",
  "has_password_field": false,
  "email_field_present": true,
  "submit_label": "Link versturen",
  "page_heading": "Login met e-mailadres",
  "ui_language": "nl",
  "branding": "Plug&Pay",
  "blocked": false,
  "error_reasoning": null
}
```

```json
// 2. Magic-link requested for an accepted email ("E-mail verzonden" screen)
{
  "success": true,
  "merchant_slug": "plugandpay-3",
  "magic_link_requested": true,
  "confirmation_heading": "E-mail verzonden",
  "confirmation_body": "In je mail heb je als je e-mailadres klopte een loginlink ontvangen. Controleer ook je spam.",
  "resend_link_text": "Niets ontvangen? Probeer het opnieuw.",
  "next_step": "customer opens the emailed magic link to finish login (out-of-band; not automatable without inbox access)"
}
```

```json
// 3. Email not recognised for this merchant (HTTP 422)
{
  "success": false,
  "merchant_slug": "plugandpay-3",
  "magic_link_requested": false,
  "reason": "email_not_a_customer",
  "http_status": 422,
  "error_reasoning": "POST /magic-link/{slug} returned 422 — the submitted email is not a customer of this merchant; the login form stays visible."
}
```

```json
// 4. Blocked (not observed in testing, but the contract for an anti-bot wall)
{
  "success": false,
  "blocked": true,
  "error_reasoning": "Cloudflare challenge/interstitial did not clear — retry with a residential-proxy session (--proxies)."
}
```
