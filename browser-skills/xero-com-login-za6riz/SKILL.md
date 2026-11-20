---
name: xero-com-login-za6riz
title: Xero Login
description: >-
  Authenticate a user session against Xero — either via OAuth 2.0 / OIDC
  (recommended, supported) or as a fallback by scripting the password form at
  login.xero.com/identity/user/login. Documents the canonical URL, form schema,
  anti-bot stack (Akamai + browsercheck + AspNetCore antiforgery), and all five
  branch outcomes (MFA, SSO, passkey, lockout, invalid credentials).
website: xero.com
category: accounting
tags:
  - accounting
  - auth
  - oauth
  - oidc
  - akamai
  - saas
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: api
alternative_methods: []
verified: true
proxies: true
---
# Xero Login

## Purpose

Authenticate a user session against Xero's accounting platform — either via the proper OAuth 2.0 / OIDC flow (recommended, supported, and TOS-compliant) or, as a fallback, by scripting the password form at `https://login.xero.com/identity/user/login`. This skill documents the login surface itself: canonical URL, form schema, anti-bot stack, branch outcomes (MFA, SSO, passkey, lockout, invalid creds), and the post-login redirect. It is the foundation skill that any other Xero in-app skill (`view-invoices`, `reconcile-transactions`, etc.) plugs into. Read-only with respect to the documentation contract — the skill never persists credentials and never modifies account state — but the act of logging in itself is the one Xero action this skill performs.

## When to Use

- You are building a Xero integration and need to know **which authentication path to take** (almost always: OAuth 2.0, not scripted login).
- An upstream skill needs an authenticated `go.xero.com` session and you need to script password login because OAuth isn't available (e.g. agent acting on behalf of itself with its own user account, internal staff tooling).
- You hit Akamai 403 / `_abck` / Access Denied on `login.xero.com` and need to know what cookies + session config you actually need.
- A login attempt produced an unexpected branch (locked, SSO redirect, passkey ceremony) and you need to identify which DOM hook to read.
- You're documenting the auth surface for a downstream agent that doesn't have access to Xero's developer docs.

## Workflow

The honest path for any third-party integration is **OAuth 2.0 / OIDC authorization-code with PKCE** against Xero's public identity server. Scripted password login violates Xero's third-party developer TOS, breaks on MFA-enabled accounts, breaks on SSO-bound accounts, breaks on passkey-bound accounts, and walks straight into Akamai Bot Manager. Lead with OAuth. Reserve scripted login for the narrow case where you have direct user credentials and no developer-app option.

### Recommended — OAuth 2.0 / OIDC

1. **Register an app** at `https://developer.xero.com/myapps/` to obtain `client_id` + `client_secret`. Choose "Web app" for confidential clients or "Mobile or desktop" for PKCE-only.

2. **Discover endpoints** from the public OIDC discovery doc (verified 2026-05-18, 200 OK, `application/json`, 1.3 KB):

   ```
   GET https://login.xero.com/identity/.well-known/openid-configuration
   ```

   Fields you'll use:

   | Field | Value |
   |---|---|
   | `issuer` | `https://identity.xero.com` |
   | `authorization_endpoint` | `https://login.xero.com/identity/connect/authorize` |
   | `token_endpoint` | `https://login.xero.com/identity/connect/token` |
   | `userinfo_endpoint` | `https://login.xero.com/identity/connect/userinfo` |
   | `end_session_endpoint` | `https://login.xero.com/identity/connect/endsession` |
   | `response_types_supported` | `code`, `token`, `id_token`, `code id_token`, `code token`, `code id_token token` |

3. **Redirect the user** to `authorization_endpoint` with `client_id`, `response_type=code`, `redirect_uri`, `scope=openid profile email offline_access <accounting.*>`, `state`, and (for PKCE) `code_challenge` + `code_challenge_method=S256`. The user logs in on their own device — Xero handles MFA, SSO, and passkey internally. Your app never sees the password.

4. **Exchange the code** at `token_endpoint` (`grant_type=authorization_code`) for `access_token` + `refresh_token` + `id_token`. Persist the refresh token; use it to mint new access tokens for the next 60 days without re-prompting the user.

5. **Use the access token** as `Authorization: Bearer …` against `https://api.xero.com/api.xro/2.0/…` for accounting endpoints, or against `userinfo_endpoint` to identify the user. Refresh proactively — access tokens last 30 minutes.

That's the entire flow. No browser automation. No Akamai. No MFA scripting. No TOS exposure.

### Browser fallback — scripted password login

Use this only when OAuth is genuinely unavailable. The session must be **verified + residential-proxy + capable of holding cookies across the GET/POST round-trip**. Akamai Bot Manager and a client-side `browsercheck.xero.com` fingerprint are both active.

1. **Open a remote session** with stealth and a residential proxy:

   ```bash
   sid=$(browse cloud sessions create --keep-alive --verified --proxies | jq -r .id)
   export BROWSE_SESSION="$sid"
   ```

   Without `--verified` and `--proxies` the GET returns 403 with an Akamai `Access Denied` page — verified 2026-05-18 from a sandbox IP not on Akamai's allowlist.

2. **Navigate to the canonical login URL** (the bare host 301-redirects here, so go direct):

   ```bash
   browse open "https://login.xero.com/identity/user/login" --remote
   browse wait load
   browse wait timeout 3000   # let browsercheck.xero.com flip PreCheckCompleted to "true"
   ```

3. **Check for pre-form branches** before typing anything. Snapshot the page and look for these refs:

   - `#xl-connected-passkey-use-password-instead-link` visible → a passkey ceremony is auto-firing. Click this button first; agent automation cannot satisfy WebAuthn.
   - `#xl-connected-sso-account-text` visible → the account is SSO-bound (enterprise tenant). Submit button text is "Log in with SSO" (per the `xl-strings` config block: `SSO_LOGIN_BUTTON_TEXT`). Submission will 302 to the corporate IdP; you can't proceed with username/password.
   - `#xl-locked-out` visible (no class `xui-u-hidden`) → previous failed-attempts ran the account into a 15-minute lockout. Stop and wait.

4. **Fill the form**:

   ```bash
   browse fill "ref:#xl-form-email" "<email>"
   browse fill "ref:#xl-form-password" "<password>"
   browse click "ref:#xl-form-submit"
   browse wait load
   ```

   Field IDs and automation IDs verified 2026-05-18:

   | DOM ID | `name` | `data-automationid` |
   |---|---|---|
   | `#xl-form-email` | `Username` | `Username--input` |
   | `#xl-form-password` | `Password` | `PassWord--input` |
   | `#xl-form-submit` | `button` (value `login`) | `LoginSubmit--button` |

   **Do not POST the form manually with curl unless you carry every cookie + hidden field.** The form requires:
   - `__RequestVerificationToken` (hidden input, must match the `.AspNetCore.Antiforgery.<id>` cookie set on the GET).
   - `PreCheckCompleted=true` (hidden input that JS flips after `browsercheck.xero.com` returns a passing fingerprint).
   - `_abck`, `bm_sz`, `ak_bmsc` cookies (Akamai).
   - `Device` cookie (5-year fingerprint).

5. **Detect the outcome** by reading the post-submission state:

   - Page URL changed to `https://identity.xero.com/account/two-step-authentication` (or similar `/account/...verify...`): success, MFA required. You need the user's TOTP — the agent cannot proceed without it.
   - Page URL changed to `https://go.xero.com/...`: success, trusted device, MFA skipped. You are logged in.
   - Page URL changed to `ReturnUrl` you supplied (e.g. an OAuth callback at `/identity/connect/authorize/callback?...`): success, deep-link delivered.
   - Page is still on `/identity/user/login`, `#xl-invalid-username-or-password` now visible: credentials wrong. Error text: "Your email or password is incorrect".
   - Page is still on `/identity/user/login`, `#xl-locked-out` now visible: account just got locked out. Error text: "Your account has been locked due to repeated failed login attempts. Please wait for 15 minutes before trying again."

6. **Persist the session cookies** if downstream skills need them. The post-login `.AspNetCore.Identity.*` and `Xero.*` cookies are scoped to `*.xero.com` and required by `go.xero.com`. Keep the same Browserbase session ID across skill invocations rather than re-logging in — restart cost (Akamai + browsercheck) is non-trivial.

7. **Release the session** when done if you don't need it kept warm:

   ```bash
   browse cloud sessions update "$sid" --status REQUEST_RELEASE
   ```

## Site-Specific Gotchas

- **OAuth 2.0 is the right answer.** Xero's developer terms explicitly disallow scripting end-user password login for third-party integrations. Every other gotcha below is a consequence of doing this the hard way.
- **`https://login.xero.com/` 301-redirects to `/identity/user/login`.** Don't waste a network hop — go direct.
- **Akamai Bot Manager is active on every response.** Cookies set on the first GET: `_abck` (1-year), `bm_sz` (4-hour), `ak_bmsc` (2-hour, HttpOnly). Without a residential IP + stealth session, the GET returns 403 with the Akamai `Access Denied` page. Verified 2026-05-18 — `browse cloud fetch --proxies` from the route's sandbox IP succeeded with 200 OK.
- **`PreCheckCompleted` hidden field is a client-side gate.** Its initial value is `"false"`. The login JS bundle (`https://edge.xero.com/identity/login/login.<hash>.js`) calls `browsercheck.xero.com` to perform a TLS/canvas/font fingerprint, then flips the field to `"true"`. The server rejects POSTs with `PreCheckCompleted=false`. Real browser session: the flip happens within ~1 second after page load. Headless/curl scripted POSTs need to wait for this — `browse wait timeout 3000` after `wait load` is the safe pattern. Curling the form directly with no JS execution will not work.
- **`__RequestVerificationToken` is bound to the session cookie.** It's an ASP.NET Core antiforgery token. The hidden form input value MUST match the `.AspNetCore.Antiforgery.<id>` cookie that was set on the GET. Re-fetching the form invalidates the prior pair. Don't reuse a token across attempts.
- **`Device` cookie has a 5-year max-age** and identifies returning devices. After a successful first login + MFA-on-this-device-trust, future logins from the same Device cookie skip the MFA prompt. Burning the cookie (new Browserbase session) re-triggers MFA every time.
- **The form has four pre-form / pre-submit branch states** baked into the HTML, all initially `class="xui-u-hidden"`:
  - `#xl-connected-passkey-use-password-instead-link` — passkey ceremony fired; click it to fall back to password.
  - `#xl-connected-sso-account-text` ("Your account is connected to an SSO provider") — submission goes to a corporate IdP; you can't use username/password.
  - `#xl-invalid-username-or-password` ("Your email or password is incorrect") — last submit failed validation.
  - `#xl-locked-out` ("Your account has been locked due to repeated failed login attempts. Please wait for 15 minutes before trying again.") — 15-minute cooldown.
  Always snapshot and check these before deciding the form is "just a password form".
- **SSO submit button label changes.** The inline JSON config block `<script id="xl-strings">` defines `LOGIN_BUTTON_TEXT: "Log in"` and `SSO_LOGIN_BUTTON_TEXT: "Log in with SSO"`. When the account is SSO-bound, the button text swaps. Detecting the swap is a reliable secondary signal that you're on the SSO branch.
- **MFA URL is on `identity.xero.com`, not `login.xero.com`.** After a successful password POST, MFA-required accounts get 302'd to `https://identity.xero.com/account/...` (the `Xero-Origin-Id: UserProfile.Web` host, confirmed by the parallel `forgot-password` probe). The agent cannot script TOTP without a generator.
- **Passkey is becoming the default for new Xero accounts.** As of mid-2026, Xero is pushing passkey enrollment hard. Discoverable WebAuthn credentials fire an automatic ceremony before the password field is even focused. The "Use password instead" button (`#xl-connected-passkey-use-password-instead-link`) is the escape hatch. Click it within the first 2 seconds of page load or the modal/ceremony may steal focus.
- **Don't waste time on curl-only POSTs.** Confirmed: hitting `POST /identity/user/login` directly with curl + the cookie jar from a prior GET still fails because the JS hasn't run to flip `PreCheckCompleted`. The form is browser-only by design.
- **Don't waste time on direct `/connect/authorize` GETs without a registered client.** Confirmed: `GET /identity/connect/authorize?client_id=NONEXISTENT_TEST&...` 302s to `/identity/error?errorId=…` (a base64 error blob). You must register an app first.
- **Forgot-password is a sibling surface** at `https://identity.xero.com/account/forgot-password`, served by a different ASP.NET app (`Xero-Origin-Id: UserProfile.Web`). It accepts a single `Email` field + its own `__RequestVerificationToken`. Don't conflate it with the login surface.
- **`ReturnUrl` is the deep-link mechanism.** Set the hidden `ReturnUrl` field before submitting to land directly on a target page post-MFA. Max length 8192 chars. Common shape: `ReturnUrl=/identity/connect/authorize/callback?client_id=…` for OAuth flows that bounced through the login page.
- **`X-Frame-Options: DENY`.** You can't iframe the login page. Don't try.
- **CSP nonce is per-render.** The page's CSP `script-src 'nonce-<base64>'` value is regenerated on every GET. You don't need to forge it for browser automation (the real script tags carry the matching nonce), but it does mean you can't reuse a saved HTML dump as a "template".
- **Network policy note (this generator's sandbox specifically).** The Vercel sandbox that produced this skill cannot resolve `connect.*.browserbase.com`, so it could not drive a live browser session — all surface evidence in this skill came from `browse cloud fetch` (HTTP path through `api.browserbase.com`) plus the public OIDC discovery doc. The screenshots are schematic renderings of the verified fetch evidence, not live captures. Skills run from a network-unrestricted host should use the standard `browse open --remote` flow to verify the form behaves as documented before relying on this skill in production.

## Expected Output

The skill itself doesn't produce a structured JSON output — it produces an authenticated session (or a recommendation to use OAuth instead). Three shapes any wrapper around this skill should emit:

**1. OAuth recommendation (the common case):**

```json
{
  "status": "use_oauth",
  "discovery": {
    "issuer": "https://identity.xero.com",
    "authorization_endpoint": "https://login.xero.com/identity/connect/authorize",
    "token_endpoint": "https://login.xero.com/identity/connect/token",
    "userinfo_endpoint": "https://login.xero.com/identity/connect/userinfo",
    "end_session_endpoint": "https://login.xero.com/identity/connect/endsession"
  },
  "developer_portal": "https://developer.xero.com/myapps/",
  "reason": "Scripted password login is disallowed by Xero TOS and breaks on MFA/SSO/passkey accounts."
}
```

**2. Scripted login success (when the fallback flow completes):**

```json
{
  "status": "authenticated",
  "method": "password_form",
  "landed_url": "https://go.xero.com/Dashboard/",
  "session_id": "<browserbase-session-id>",
  "mfa_required": false,
  "device_cookie_set": true,
  "next_step": "Reuse this session_id for downstream skills (e.g. view-invoices). Do not re-login."
}
```

**3. Scripted login blocked (when the fallback hits a branch the agent can't resolve):**

```json
{
  "status": "blocked",
  "reason": "mfa_required" | "sso_redirect" | "passkey_required" | "account_locked" | "invalid_credentials" | "akamai_403",
  "detail": "Page URL after submit: https://identity.xero.com/account/two-step-authentication",
  "dom_signal": "#xl-locked-out visible",
  "recoverable": false,
  "retry_after_seconds": 900
}
```
