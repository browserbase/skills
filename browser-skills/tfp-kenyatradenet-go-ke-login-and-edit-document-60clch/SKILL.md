---
name: tfp-kenyatradenet-go-ke-login-and-edit-document-60clch
title: Login to Kenya TradeNet and Work on a Document
description: >-
  Authenticate to the Kenya National Electronic Single Window System
  (TradeNet/TFBSEW) and open a trade document (declaration, manifest, permit
  application, or draft) to edit. Requires a registered KenTrade account; no
  public login exists.
website: tfp.kenyatradenet.go.ke
category: government-trade
tags:
  - kenya
  - tradenet
  - single-window
  - customs
  - login
  - trade-documents
source: 'browserbase: agent-runtime 2026-06-05'
updated: '2026-06-05'
recommended_method: browser
alternative_methods:
  - method: fetch
    rationale: >-
      The login itself is a Spring Security form POST to
      /TFBSEW/j_spring_security_check_normal_form; you can GET signin.cl for the
      JSESSIONID + _csrf token then POST credentials to verify auth. Useful only
      for credential checks — the post-login document workspace is a
      SmartClient/SmartGWT RPC app that must be browser-driven.
verified: false
proxies: true
---
# Login to Kenya TradeNet (TFBSEW) and Work on a Document

## Purpose

Authenticate to the Kenya National Electronic Single Window System (TradeNet, internally branded **TFBSEW**, vendor CrimsonLogic) at `tfp.kenyatradenet.go.ke` and open a trade "document" — a customs declaration, manifest, permit/license application, or saved draft — so it can be reviewed or edited. This is a **stateful, write-capable** workflow once authenticated, but it is **gated behind a registered KenTrade account**: there are no public, demo, or anonymous credentials. Without a valid, active account the flow stops at the login form and you can confirm the auth wall but cannot reach any document workspace. This skill documents the exact login flow, the page/endpoint structure, and the post-login document area as far as it can be reached.

## When to Use

- A user has **their own valid KenTrade/TradeNet trader, clearing-agent, or PGA credentials** and wants to log in and open/edit a trade document.
- You need to drive the TFBSEW login form programmatically (fill username/password, submit, detect success vs. error).
- You need to confirm whether a given account can authenticate, or to surface the exact server-side login error (`invalid/suspended user`, locked account, etc.).
- You need to locate where declarations / manifests / permit applications / drafts live after login.

Do **not** use this skill if you have no credentials — the system cannot be entered. Registration is a separate, manually-approved process at `https://registration.kentrade.go.ke/` (and KenTrade training application at `kentrade.go.ke`); accounts are not self-service-instant.

## Workflow

Recommended method is **browser**. The login form is a standard Spring Security form POST, but everything after login is a **SmartClient / SmartGWT (Isomorphic ISC) single-page RPC application** that only renders and operates under a real browser — it is not practical to drive document editing via raw HTTP. Drive the whole flow in one browser session so the `JSESSIONID` cookie and authenticated SmartClient state are preserved.

1. **Navigate directly to the real login form** (skip the marketing landing page):
   `https://tfp.kenyatradenet.go.ke/TFBSEW/cusLogin/signin.cl`
   The root `https://tfp.kenyatradenet.go.ke/` only meta-refreshes to `/TFBSEW/cusLogin/login.cl`, which is a public marketing page; its on-page "Login" button calls `launchApplication()` → `window.open('/TFBSEW/cusLogin/signin.cl')`. Going straight to `signin.cl` saves a hop.
2. **Wait for render (~2s).** The page ships with an anti-clickjacking guard that keeps `<body>` `display:none` until JavaScript confirms `self == top`. Snapshot/interact only after JS has run, or the form will appear empty.
3. **Fill credentials:** `#j_username` (username) and `#j_password` (password). Both are `maxlength=30`. A hidden `#_csrf` token (per-session UUID) and hidden `#pTfpSrcLinkInfo` are already populated in the served form — do not clear them.
4. **Submit:** click `#tfpLoginBtn` (the green "Login" button; `onclick="setWinNameLS()"`). The form POSTs to `/TFBSEW/j_spring_security_check_normal_form`.
5. **Detect the outcome:**
   - **Failure** → server 302-redirects back to `…/signin.cl?login_error=1` and renders a red banner, e.g. *"User is invalid or suspended. Please contact administrator ."* Same shape for unknown user, wrong password, or suspended/locked account.
   - **Success** → redirect into the authenticated TFBSEW dashboard (a SmartClient app shell). Wait for the ISC modules (`Core`, `Foundation`, `Forms`, `Grids`, `DataBinding`, …) to finish loading before reading the UI.
6. **Open a document (post-login, requires valid creds — not reachable in this environment):** in the dashboard, use the left/top navigation to reach the document list (declarations / manifests / applications / drafts), open the target record, and make edits in the SmartClient forms. **Read-only rule applies: do not submit, lodge, pay for, or finally-submit any declaration.** Stop at the editable form / draft-open state.

### Browser fallback / login-only HTTP shortcut

If you only need to *authenticate* (not edit), the Spring Security endpoint can be driven over HTTP: `GET /TFBSEW/cusLogin/signin.cl` to obtain a `JSESSIONID` cookie and scrape the fresh hidden `_csrf` value, then `POST /TFBSEW/j_spring_security_check_normal_form` with `j_username`, `j_password`, `_csrf`, and `pTfpSrcLinkInfo`. A `302` to the dashboard = success; a `302` to `signin.cl?login_error=1` = failure. This is only useful for credential checks — the document workspace itself still requires the browser-rendered SmartClient app.

## Site-Specific Gotchas

- **No public/demo credentials — this is the hard wall.** Confirmed across two independent runs: placeholder creds return *"User is invalid or suspended. Please contact administrator ."* and `signin.cl?login_error=1`. Accounts are registration-gated and manually approved at `registration.kentrade.go.ke`. Don't burn iterations hunting for a guest login; there isn't one.
- **Two different "login" pages — don't confuse them.** `/TFBSEW/cusLogin/login.cl` is the *public marketing* page and contains a **dead client-side stub** `function Login(){ if(username=="swuser") window.location="index.html"; else alert("Invalid username password"); }`. That `swuser` check is decorative leftover JS and is **not** the real authentication — ignore it. The real form is `/TFBSEW/cusLogin/signin.cl`, which POSTs to Spring Security.
- **CSRF is mandatory and per-session.** The served `signin.cl` embeds `<input type="hidden" name="_csrf" value="<uuid>">`. For an HTTP-based login you must GET the form first to capture both the `_csrf` value and the `JSESSIONID` cookie; a POST without them fails.
- **Always use HTTPS.** `http://…/signin.cl` 302-redirects to the `https://` version (with `X-Frame-Options: SAMEORIGIN`, `X-XSS-Protection`, `X-Content-Type-Options: nosniff`). Start on `https://` to avoid the extra round-trip.
- **Anti-clickjacking hides the body.** A `#antiClickjack` style sets `body{display:none}` until JS verifies the page is top-level (`top.location = self.location` otherwise). Wait ~2s for render; the form cannot be embedded in an iframe.
- **The fetched HTML may arrive base64-wrapped via the proxy fetch path** — decode before parsing for selectors. The live rendered DOM exposes stable IDs `#j_username`, `#j_password`, `#tfpLoginBtn`.
- **Post-login is SmartClient/SmartGWT (Isomorphic `isc.FileLoader`, dir `../tfbsew/sc/`).** Document grids and forms are RPC-driven and only function in a real browser — do not try to scrape or edit documents over plain HTTP.
- **Anti-bot:** none detected (Apache `2.4.43`, no Akamai/Cloudflare/captcha). The captured run used residential `--proxies` and **no** `--verified` and reached the form fine; stealth is not required for the public/login surface. Build seen: `V2.1.210923 | Build Version:V.1.174 | Build Date:02.03.2026`.
- **Forgot Password** posts to `/TFBSEW/cusLogin/authService/forgotPassword` (separate `#forgotPasswordForm`) — useful only for the credential-recovery branch, not for login.
- **Could not validate the document-editing steps** in this environment because no valid account was available. Steps 6 and the "success" output shape below are derived from the page/endpoint structure, not from a completed logged-in run — treat them as the expected shape, verify against the live dashboard when you have credentials.

## Expected Output

Emit a JSON object describing how far the flow got and the outcome.

**Invalid / suspended / unknown credentials (observed):**
```json
{
  "success": false,
  "reached_login_form": true,
  "login_result": "invalid_credentials",
  "auth_message": "User is invalid or suspended. Please contact administrator .",
  "redirect_url": "https://tfp.kenyatradenet.go.ke/TFBSEW/cusLogin/signin.cl?login_error=1",
  "document_workspace_reached": false,
  "document": null,
  "error_reasoning": "Credentials are not a registered/active KenTrade TradeNet account; login POST to j_spring_security_check_normal_form was rejected."
}
```

**No credentials available (registration-gated wall):**
```json
{
  "success": false,
  "reached_login_form": true,
  "login_result": "registration_required",
  "auth_message": null,
  "document_workspace_reached": false,
  "document": null,
  "error_reasoning": "No public/demo login exists. A valid account must be obtained via registration.kentrade.go.ke before any document can be opened."
}
```

**Successful login and document opened (expected shape — verify with real credentials):**
```json
{
  "success": true,
  "reached_login_form": true,
  "login_result": "dashboard",
  "auth_message": null,
  "document_workspace_reached": true,
  "document": {
    "type": "declaration | manifest | permit_application | draft",
    "reference": "<document/declaration reference number>",
    "status": "<draft | pending | etc.>",
    "editable": true
  },
  "error_reasoning": null
}
```
