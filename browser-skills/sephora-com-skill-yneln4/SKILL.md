---
name: sephora-com-skill-yneln4
title: Create a Sephora Account
description: >-
  Reach, fill, and submit Sephora's modal Beauty Insider registration form on a
  stealth session without tripping Akamai Bot Manager or Google reCAPTCHA.
website: sephora.com
category: account-management
tags:
  - account
  - registration
  - sign-up
  - sephora
  - akamai
  - recaptcha
  - beauty-insider
source: 'browserbase: agent-runtime 2026-07-17'
updated: '2026-07-17'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      No public/unauthenticated registration API. Internal endpoints are
      Akamai-gated and the final submit requires a Google reCAPTCHA v2 token
      minted in-page — there is no captcha-less bypass.
verified: true
proxies: true
---
# Create a Sephora Account (Beauty Insider)

## Purpose

Drive Sephora's account-creation flow — the "Beauty Insider" registration — from the
public site, filling the modal registration form (name, email, password, birthday) and
submitting it **without tripping Sephora's anti-bot defenses**. This is a write flow: a
successful submit creates a Beauty Insider account. The skill's focus is reaching,
filling, and submitting the registration form on a session that Akamai Bot Manager and
Google reCAPTCHA will accept, and correctly reporting the outcome (submitted, blocked,
or validation error). It does not verify the confirmation email.

## When to Use

- "Sign me up for a Sephora / Beauty Insider account."
- Any onboarding flow that needs a Sephora account before shopping, saving Loves, or
  redeeming rewards.
- Testing whether an automated session can pass Sephora's registration anti-bot gate.

Not for: signing into an existing account (that is the "Sign In" branch of the same
modal), or completing a purchase.

## Workflow

Account creation on Sephora is **browser-only**. There is no public/unauthenticated API
or deep-link for registration — `POST`ing to internal endpoints is Akamai-gated, and the
final submit requires a valid Google reCAPTCHA token minted in-page. The optimal path is
the site's own modal on a stealth session.

1. **Create a stealth session.** Sephora fronts everything with Akamai Bot Manager, so
   use a remote Browserbase session with stealth ON:
   ```bash
   sid=$(browse cloud sessions create --keep-alive --verified --proxies \
     | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
   export BROWSE_SESSION="$sid"
   ```
   Both `--verified` and `--proxies` matter: a bare session risks an Akamai "Access
   Denied" HTML page and/or a low reCAPTCHA reputation score that forces an interactive
   image challenge.

2. **Open the homepage** (there is **no** standalone registration URL — see Gotchas):
   ```bash
   browse open "https://www.sephora.com/" --remote --session "$sid" --timeout 60000
   browse wait timeout 2500 --remote --session "$sid"
   ```
   Verify `browse get title` contains "Sephora" (not "Access Denied").

3. **Open the account flyout.** `browse snapshot`, then click the top-right header button
   labeled **"Sign In or Join for FREE Shipping"**. A flyout appears with two buttons:
   **"Sign In"** and **"Create Account"**.

4. **Click "Create Account".** A dialog titled **"Create Account"** opens with a single
   **Email Address** field and a **Continue** button (progressive disclosure — the rest
   of the form is hidden until email is entered).

5. **Enter email, click Continue.**
   ```bash
   browse fill "<email-ref>" "test.beautyinsider+<ts>@example.com" --remote --session "$sid"
   browse click "<continue-ref>" --remote --session "$sid"
   browse wait timeout 3000 --remote --session "$sid"
   ```
   The dialog expands to the full **"Create An Account"** form.

6. **Fill the full form.** `browse snapshot` first (refs change when the form expands):
   - **First Name**, **Last Name** — text inputs.
   - **Password** — text input; **must be 6 to 12 characters** (e.g. `Test1234`).
   - **Birthday** — two `select` elements: **Month** (`January`..`December`) and **Day**
     (`1`..`31`). There is **no year** field. Use `browse select <ref> <value>`.
   - **ZIP/Postal Code** — optional text input.
   - **Phone Number**, "Sign me up for Sephora marketing text alerts", and "Keep me
     signed in" are all optional — leave unchecked.

7. **Submit.** `browse snapshot` again, find **"Join Now"**, click it, then
   `browse wait timeout 5000` and `browse snapshot` + `browse screenshot`. Branch on the
   result (see Expected Output):
   - Dialog stays open with the form + a "Sephora uses Google ReCaptcha…" notice and no
     inline error → reCAPTCHA v2 scored the submit invisibly; this is the normal
     un-blocked outcome. On a real (non-`@example.com`) email this proceeds to account
     creation / email confirmation.
   - Inline error text near a field → validation failure (fix the field, resubmit).
   - Akamai "Access Denied" page → session was not stealthy enough; recreate with
     `--verified --proxies`.
   - A reCAPTCHA image-challenge iframe → low reputation score; retry on a fresh
     verified + residential-proxy session.

8. **Release the session** when done:
   ```bash
   browse cloud sessions update "$sid" --status REQUEST_RELEASE
   ```

## Site-Specific Gotchas

- **No standalone registration URL.** `/registration`, `/registration/signIn`, and
  `/account` all redirect to `/error/404`. Registration is a modal launched only from the
  homepage header "Sign In or Join" button — don't waste time deep-linking.
- **Two-step progressive form.** The first modal shows only an Email field + Continue.
  The name/password/birthday fields do not exist in the DOM until you submit the email
  step, so snapshot again after clicking Continue.
- **Akamai Bot Manager fronts the whole site.** The homepage 301 probe may report "no
  antibot", but that only reflects the redirect. The rendered SPA and the registration
  submit are protected — run `--verified --proxies`. In testing, a verified +
  residential-proxy session loaded the homepage and full registration flow with **no**
  Access-Denied page.
- **Google reCAPTCHA v2 gates the submit.** `window.grecaptcha` is defined and the page
  loads `google.com/recaptcha/api.js?onload=onloadcallback&render=explicit` +
  `gstatic.com/recaptcha/releases/.../recaptcha__en.js` (invisible v2 badge). No
  interactive challenge appeared on a verified+proxied session, but a low-reputation
  session can be forced into an image challenge. There is no captcha-less API bypass.
- **Password constraint is unusually tight: 6 to 12 characters.** Long/strong passwords
  are rejected. Keep it within the range.
- **Birthday is Month + Day only** (no year) — used for a yearly free birthday gift.
- **Refs shift twice:** once when the email step expands into the full form, and again
  after filling inputs. Re-run `browse snapshot` before every click/select on the form.
- **Write action.** A successful "Join Now" with a real, deliverable email creates a live
  account and sends a confirmation email. Use a disposable `@example.com` address when
  testing so no usable account is created; `@example.com` submits without an inline error
  but is not a verifiable inbox.
- **US/Canada only.** The form footer states you must be a U.S. or Canada resident;
  Sephora localizes by IP, so the residential proxy region should be US/CA.

## Expected Output

```json
{
  "success": true,
  "reached_form": true,
  "submitted": true,
  "antibot": "akamai + google-recaptcha-v2-invisible",
  "blocked": false,
  "outcome": "form_submitted_no_interactive_challenge",
  "fields": {
    "email": "test.beautyinsider+<ts>@example.com",
    "first_name": "Ava",
    "last_name": "Martin",
    "password_len": 8,
    "birthday_month": "June",
    "birthday_day": "15",
    "zip": "10001"
  },
  "error_reasoning": null
}
```

Other outcome shapes:

```json
// Hard-blocked by Akamai (session not stealthy enough)
{ "success": false, "reached_form": false, "blocked": true,
  "outcome": "akamai_access_denied", "error_reasoning": "Access Denied page on navigation" }

// reCAPTCHA forced an interactive challenge (low reputation score)
{ "success": false, "reached_form": true, "submitted": true, "blocked": true,
  "outcome": "recaptcha_image_challenge", "error_reasoning": "reCAPTCHA iframe challenge presented on submit" }

// Field validation failure
{ "success": false, "reached_form": true, "submitted": false, "blocked": false,
  "outcome": "validation_error", "error_reasoning": "Password must be 6 to 12 characters" }
```
