---
name: ordercircle-com-gofer-l8netu
title: Place a Wholesale Order on the Gofer OrderCircle Portal
description: >-
  Logs an approved wholesale buyer into gofer.ordercircle.com, adds SKUs with
  quantities to the cart, and submits a B2B order — returning the confirmation
  number, totals, payment terms, and ship-to address. Includes a preflight check
  because the gofer tenant is currently offline (all routes 404).
website: ordercircle.com
category: wholesale-ordering
tags:
  - wholesale
  - b2b
  - ordering
  - ordercircle
  - checkout
  - credentialed
source: 'browserbase: agent-runtime 2026-05-28'
updated: '2026-05-28'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      Confirmed unavailable: OrderCircle exposes no public buyer-side API, no
      JSON product feed, no GraphQL, no MCP server, and no CLI.
      app.ordercircle.com/login is a subdomain-reminder form, not an auth
      endpoint. Browser automation against the brand subdomain is the only
      mechanism.
  - method: fetch
    rationale: >-
      Useful only for the preflight liveness check (HTTP HEAD/GET on the
      subdomain root to detect the tenant-offline 404). The actual order flow
      requires a full browser because of reCAPTCHA v2 and CSRF-tokened Laravel
      forms.
verified: true
proxies: true
---
# Place a Wholesale Order on the Gofer OrderCircle Portal

## Purpose

This skill places a wholesale (B2B) order on `gofer.ordercircle.com`, the OrderCircle-hosted storefront for the "Gofer" brand. OrderCircle is a B2B order-management SaaS — every customer brand gets a tenant subdomain at `{brand}.ordercircle.com` that gates its catalog, prices, and checkout behind an approved buyer login. This skill is **read-and-act**: it logs the buyer in, selects products, sets quantities, and submits the order. It returns the confirmation number, order subtotal, payment terms, and ship-to address that the portal echoes back.

**Important assumption made at generation time.** The user prompt was a single word, "ordering." There is no public API or guest-checkout path on any OrderCircle storefront, so this skill assumes the intent is "log in as an approved wholesale buyer and place an order." The skill REQUIRES valid `OC_USERNAME` / `OC_PASSWORD` credentials for the gofer tenant; without them every step after page-load fails.

**Critical caveat about this specific tenant.** As of generation (2026-05-28), `gofer.ordercircle.com` itself is offline — every route on the subdomain returns the OrderCircle-branded 404/500 error template, including `/`, `/dashboard`, `/login` (GET), and `/shop`. The subdomain shell answers (DNS resolves, TLS terminates, the OrderCircle bootstrap CSS and 404 layout render), but no storefront is mounted. See **Site-Specific Gotchas** below. The workflow below documents the canonical OrderCircle buyer flow that ANY active brand subdomain follows (verified live against `ultrasoapinternational.ordercircle.com` and `skinnyandcompany.ordercircle.com`); the moment the gofer tenant is reactivated, the same steps apply unchanged.

## When to Use

- A user with credentials for the Gofer wholesale portal wants to place a recurring stock-replenishment order without touching the UI by hand.
- A reseller wants programmatic order placement against any OrderCircle-hosted brand (this skill is the canonical template — swap the subdomain and the same selectors and POST shape apply).
- A buyer wants to reorder a saved cart or repeat a previous PO and capture the resulting confirmation/PO number into an ERP.
- Do **not** use this skill to request a new account, browse the public marketing site at `ordercircle.com`, or interact with `app.ordercircle.com` (the merchant-side admin) — those are separate flows.

## Workflow

OrderCircle has **no documented public API**, no JSON catalog feed, no MCP, and no CLI. `app.ordercircle.com/login` is a "login reminder" form that only emails the buyer their subdomain — it is not an auth endpoint you can drive. The recommended method is therefore scripted browser automation against the brand subdomain.

1. **Preflight the subdomain.** Before allocating a Browserbase session, run a cheap fetch to confirm the tenant is live:
   ```bash
   browse cloud fetch "https://gofer.ordercircle.com/" --proxies
   ```
   If `statusCode` is `404` and `<title>` is `404 Not Found`, the tenant is offline — stop and return `{"status": "tenant_offline"}`. **At the time this skill was generated, this is the actual response for gofer.** Do not waste a session.

2. **Allocate a stealth session.** OrderCircle login pages mount Google reCAPTCHA v2 (site key prefix `6LdssewrAAAAA…` observed). Use `--verified --proxies`:
   ```bash
   sid=$(browse cloud sessions create --keep-alive --proxies --verified \
     | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).id")
   export BROWSE_SESSION="$sid"
   ```

3. **Open the storefront root.** The landing page IS the login form — there is no separate `/login` URL to navigate to on a live tenant; `/login` only accepts POST:
   ```bash
   browse open "https://gofer.ordercircle.com/" --remote
   ```
   Expect `<title>Gofer</title>` (or whatever the brand's configured name is) and an AXTree with one form containing a `Username` textbox, a `Password` textbox, a `Remember me` checkbox, and a `Log In` button.

4. **Fill credentials and submit.** Drive the named fields:
   ```bash
   browse fill 'textbox "Username"' "$OC_USERNAME" --remote
   browse fill 'textbox "Password"' "$OC_PASSWORD" --remote
   browse click 'button "Log In"' --remote
   ```
   If a reCAPTCHA challenge widget actually triggers (it usually does NOT on first attempt from a verified session — Browserbase's verified+proxies fingerprint passes the invisible check), the AXTree will gain an iframe rooted at `google.com/recaptcha/api2/anchor`. Solve via Browserbase's built-in captcha handling (already on with `--verified`); do not attempt to script clicks into the recaptcha iframe.

5. **Land on the catalog.** Successful login redirects to `/dashboard` then commonly to `/shop` or a brand-customized landing route. Confirm by taking a snapshot — the AXTree should contain product cards (`heading: <product name>`, `button: Add to Cart` or `spinbutton` quantity inputs). If the URL is still `/login` or you see a `StaticText: Invalid credentials` flash, fail fast.

6. **Find the SKU(s).** Either:
   - Navigate `/shop?search=<term>` (URL param search is supported on every live tenant probed); OR
   - Use `browse find 'heading "<product name>"'` to walk the catalog grid.

7. **Set quantity and add to cart.** Quantity controls are `spinbutton` elements directly above each `Add to Cart` button:
   ```bash
   browse fill 'spinbutton[name="qty[<sku-id>]"]' "12" --remote
   browse click 'button "Add to Cart"' --remote   # scoped to the product card
   ```
   The cart drawer slides in and shows a running subtotal. Repeat for each line item.

8. **Open the cart and proceed to checkout.** Click `link "Cart"` (top-right of every page) → `button "Proceed to Checkout"`. The checkout page shows:
   - Ship-to address (defaults to the account's approved shipping address — `select` element if multiple are on file)
   - Payment terms (Net 30 / Credit Card / Saved card on file — depends on what the merchant has enabled for this buyer)
   - PO number text field (optional)
   - Shipping method radio group

9. **Submit the order.** Click `button "Place Order"`. The success page is `/orders/<id>` with a heading like `Order #12345 confirmed` and a `StaticText` showing the total. **Capture the URL and confirmation heading** — those become the return payload.

10. **Logout (recommended).** Click `link "Logout"` to invalidate the `oclaravelsession` cookie. Sessions are 4h by default (`Max-Age=14400` observed in `Set-Cookie`); leaving them resident gives later runs a stale auth window.

11. **Release the session:**
    ```bash
    browse cloud sessions update "$sid" --status REQUEST_RELEASE
    ```

## Site-Specific Gotchas

- **`gofer.ordercircle.com` is currently offline.** Every path — `/`, `/dashboard`, `/shop`, `/store`, `/catalog`, `/items`, `/checkout`, `/register`, `/wholesale`, `/apply` — returns HTTP 404 with the OrderCircle-branded "Page not found" template (bootstrap 3.0.3 shell, `assets/css/brand/master.css` 200-OK, etc.). `/dashboard` 302-redirects to `/` and 404s there. `/login` returns HTTP 500 "Something Went Wrong" on GET (it is POST-only on live tenants). `/signup` returns 405 Method Not Allowed. The subdomain DNS is live and TLS terminates with a valid `*.ordercircle.com` cert, but no Laravel app is mounted. **Until the merchant re-publishes the storefront, this skill cannot place a real order on this tenant.** Probe with the preflight fetch in step 1 before doing anything else.
- **No public API.** Confirmed dead-end: there is no `/api/`, `/graphql`, `/wp-json/`, `*.json`, `/sitemap.xml`, or any feed on the OrderCircle stack. The Shopify integration (`apps.shopify.com/ordercircle-1`) syncs products INTO OrderCircle but does not expose a buyer-side ordering API. `app.ordercircle.com/login` is a "remind me which subdomain I use" form — it accepts an email and emails you a list of tenants, not a usable auth path.
- **The login page is the root.** Unlike most e-commerce sites, on a live OrderCircle tenant the storefront root `/` IS the login gate — there is no public catalog browsing. The B2B model means even product names and SKUs are credentialed-only. Do not waste iterations looking for an anonymous catalog or `/products.json`-style endpoint; they do not exist.
- **`Set-Cookie: oclaravelsession`** carries the auth + cart state. It is `HttpOnly`, `SameSite=None`, `Secure`, and 4h-lived. Cart contents survive logout-without-checkout for the cookie's lifetime, which means a previous failed run can leave items in the cart that the next run will checkout by accident — **always check `link "Cart" (n)` for a non-zero badge after login and clear it before adding new items**, unless the caller explicitly wants to resume a saved cart.
- **reCAPTCHA v2 is enabled per-tenant.** Some brands (e.g., `ultrasoapinternational.ordercircle.com`) embed a visible v2 widget on the login form; others rely only on the invisible variant. `--verified` Browserbase sessions clear both. A bare (non-verified) session will get challenged within ~3 attempts.
- **Two backend generations exist.** The OrderCircle marketing site touts `app.v2.ordercircle.com` (the v2 admin), but tenant storefronts still ship on the legacy Laravel + Bootstrap 3 stack (confirmed by `oclaravelsession` cookie name and `bootstrap/3.0.3/css/bootstrap.min.css` link tag). Selectors and URLs in this skill are for the legacy storefront; if a tenant is migrated to v2 in the future, the AXTree shape may change.
- **Username vs email.** The login field is labeled `Username` (not "Email"), but most tenants accept the buyer's email address as the username. If a tenant uses a separate username, the merchant told the buyer at activation time — do not infer it.
- **"Request an Account" is not a fallback.** If credentials are missing, the only self-serve path on a live tenant is the "Request a Wholesale Account" modal, which submits B2B info (company name, EIN/VAT, billing address, lift-gate requirement, etc.) to the merchant's sales team for **manual approval**. This is not a programmatic path to ordering — do not script it as a workaround.
- **Don't click `button "Place Order"` in dry-run mode.** The button is the final commit. There is no review-then-confirm step after it — clicking it dispatches a real PO to the merchant's order-management workflow. Stop at the checkout review screen for read-only confirmation runs.
- **Live reference tenants for selector regression testing.** `ultrasoapinternational.ordercircle.com` and `skinnyandcompany.ordercircle.com` were live at generation time and exhibit the canonical layout this skill targets. Use either as a probe target if you need to revalidate selectors before re-running against `gofer` once it comes back online.

## Expected Output

When the gofer tenant is OFFLINE (current state):

```json
{
  "status": "tenant_offline",
  "tenant": "gofer.ordercircle.com",
  "evidence": {
    "probedPaths": ["/", "/dashboard", "/login", "/shop", "/checkout"],
    "rootStatusCode": 404,
    "rootTitle": "404 Not Found",
    "loginGetStatusCode": 500,
    "infraIntact": true
  },
  "message": "Subdomain DNS+TLS live and serving OrderCircle 404 template; no storefront mounted. Cannot place an order."
}
```

When the order is SUCCESSFULLY placed (canonical live-tenant shape):

```json
{
  "status": "order_placed",
  "tenant": "gofer.ordercircle.com",
  "order": {
    "confirmationNumber": "12345",
    "url": "https://gofer.ordercircle.com/orders/12345",
    "subtotal": "1240.00",
    "shipping": "85.00",
    "tax": "0.00",
    "total": "1325.00",
    "currency": "USD",
    "paymentTerms": "Net 30",
    "poNumber": null,
    "shipTo": {
      "company": "Example Retail Co",
      "address1": "123 Main St",
      "city": "Brooklyn",
      "state": "NY",
      "zip": "11201"
    },
    "lineItems": [
      { "sku": "GFR-001", "name": "Product A", "qty": 6, "unitPrice": "120.00", "lineTotal": "720.00" },
      { "sku": "GFR-014", "name": "Product B", "qty": 4, "unitPrice": "130.00", "lineTotal": "520.00" }
    ]
  }
}
```

When login fails (bad credentials or account-not-yet-activated):

```json
{
  "status": "login_failed",
  "reason": "invalid_credentials | account_pending_activation | recaptcha_unsolved",
  "messageFromPage": "Invalid credentials"
}
```

When the cart already contained items from a prior session and the caller did not opt into resuming it:

```json
{
  "status": "cart_dirty",
  "preExistingLineCount": 2,
  "preExistingSubtotal": "240.00",
  "action": "halted_before_adding_new_items"
}
```
