---
name: dmv-ca-gov-check-if-a-vehicle-is-registered-zgg414
title: California Vehicle Registration Status Check
description: >-
  Look up the current California DMV registration status, expiration date, fees
  owed, and holds for a CA license plate plus one secondary identifier (last 5
  of VIN, owner's last name, or company name). Read-only — never advances into
  renewal payment.
website: dmv.ca.gov
category: government
tags:
  - government
  - dmv
  - vehicle
  - registration
  - california
  - read-only
  - aws-waf
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      No public JSON/GraphQL API for registration status exists on dmv.ca.gov.
      The `/wasapp/ipp2/initRegInfoInquiry.do` endpoint sometimes cited online
      returns 404. Only the server-rendered Struts form at
      `/wasapp/rsrc/vrapplication.do` works.
verified: true
proxies: true
---
# California Vehicle Registration Status Check

## Purpose

Given a California license plate plus one secondary identifier (last 5 of the VIN, the registered owner's last name, or the company/lessor name), return the vehicle's current California DMV registration status, expiration date, fees owed, and any holds. Read-only — the skill stops at the results page; it never advances into the renewal-payment flow.

The lookup is the CA DMV's free public "Vehicle Registration Status" service, a server-rendered Java/Struts (`.do`) flow gated by AWS WAF + CloudFront. It works without an account and is the only first-party way to verify CA registration status without making a Public Records Request.

## When to Use

- A driver/owner agent verifying whether their plate is currently registered before a road trip or smog check.
- A fleet/lessor agent reconciling registration status across multiple CA plates.
- A used-car-buying agent confirming a seller's claim that the registration is "current" before exchanging money.
- Any agent that needs "registered? yes/no + expiration date" for one CA plate without paying for a commercial VIN service.

Do **not** use this skill for:
- Out-of-state plates (CA-only).
- Title status, lienholder info, or registered-owner identity disclosure — those require a formal Vehicle Record Request (different skill, fees apply, requires a justified purpose under CA Vehicle Code).
- Driver's-license status — separate DMV tool.

## Workflow

The flow is a three-step server-rendered form. There is **no public JSON API** for registration status — confirmed by surveying the dmv.ca.gov surface. Everything goes through `wasapp/rsrc/vrapplication.do`. Use a remote Browserbase session with `--proxies --verified` because the WAF is sensitive to datacenter IPs and missing browser fingerprints.

### 1. Open a Verified + residential-proxy session

```bash
SID=$(browse cloud sessions create --keep-alive --proxies --verified | jq -r .id)
export BROWSE_SESSION="$SID"
```

A bare session (no `--proxies`) regularly trips the AWS WAF banner ("Your request has been blocked...") on the first POST. The `--verified` flag (Verified browsers) is what passes the fingerprint check during form submission. Both are required — do not omit either.

### 2. Navigate directly to step 1 (license-plate form)

```bash
browse open --remote "https://www.dmv.ca.gov/wasapp/rsrc/vrapplication.do"
browse wait load --remote
browse snapshot --remote
```

Skip the marketing portal page (`/portal/vehicle-registration/vehicle-registration-status/`) — its only useful link is `/wasapp/rsrc/vrapplication.do`, so going direct saves one navigation and one cookie round-trip.

The form has a single visible input:

| Field | Selector | Constraint |
|---|---|---|
| License plate | `input#licensePlateNumber` (name `licensePlateNumber`) | maxlength 8, pattern `[a-zA-Z0-9]*`, no spaces / special chars |

Fill it and submit:

```bash
browse fill --remote "input#licensePlateNumber" "8ABC123"
browse click --remote 'button[value="Continue"]'   # name="method" value="Continue"
browse wait load --remote
```

The form POSTs to itself (`action="/wasapp/rsrc/vrapplication.do"`, method=`post`) with `method=Continue` and `licensePlateNumber=<value>`. The backend issues a 302 to step 2.

### 3. Step 2 — secondary identifier

Step 2 asks for **one of**:

- Last 5 digits of the VIN (or HIN for vessels)
- Registered owner's last name (private ownership)
- Company / lessor name (leased or company-owned)

Pick whichever the user supplied. The form is a radio-group + single text input. Snapshot and use refs:

```bash
browse snapshot --remote                                  # find the radio for the chosen identifier
browse click  --remote '@<radio-ref>'                    # select identifier type
browse fill   --remote 'input[type="text"]' "12345"      # the secondary value
browse click  --remote 'button[value="Continue"]'
browse wait load --remote
```

If the user gives "last 5 of VIN", strip dashes/spaces and uppercase. The DMV accepts only alphanumerics here.

### 4. Step 3 — extract status

The results page is keyed off plate + identifier match. Read the page text:

```bash
browse get markdown body --remote
browse screenshot --remote --path screenshots/04-results.png
```

Map the visible content to the output schema in §Expected Output. Don't click "Renew Registration" / "Pay Now" / any forward CTA — read-only.

### 5. Release the session

```bash
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

## Site-Specific Gotchas

- **No public JSON/GraphQL API exists.** Surveyed `dmv.ca.gov` and `wasapp/*` paths — every registration-status route is server-rendered Struts. Confirmed `wasapp/ipp2/initRegInfoInquiry.do` (a sometimes-cited "alt" endpoint) returns **404** as of the build date. Don't waste time looking for a faster surface; the only path is the form flow.
- **The form is two pages, not one.** Step 1 takes only the license plate (`input#licensePlateNumber`, maxlength 8). Step 2 asks for one secondary identifier. New agents commonly stub a one-shot POST with both fields — that returns the step-1 page again because the secondary input doesn't exist in the step-1 form bean.
- **Submit-button selector.** The Continue button is `button[name="method"][value="Continue"]` — the **button** is the form's only `name="method"` element, and its value is what drives Struts dispatch. Targeting `button[type="submit"]` works too but is less specific.
- **CloudFront / WAF behavior.** The pages are fronted by CloudFront with `x-frame-options: SAMEORIGIN` and an active AWS WAF rule (`AWSALB`, `AWSALBCORS`, `PD_STATEFUL_*`, `TS01dc4fc6` cookies are issued on every visit and must be preserved across the multi-step flow). Browserbase's session model handles this automatically; if you're rolling your own HTTP client you must keep the cookie jar.
- **No CAPTCHA observed on step 1.** The form has no visible CAPTCHA on initial load. Aggressive POST repetition (>~5 within a minute from the same fingerprint) trips a WAF block page with "Your request has been blocked..." — back off and let the residential proxy rotate.
- **`autocomplete="off"` everywhere.** The form sets autocomplete off; if you `browse fill` and the input still appears empty on snapshot, the page may be using a non-standard CA-DMV input wrapper. Use `browse press Tab` after fill to force the blur event before clicking Continue.
- **Plate format.** California plates are 1–7 chars (modern: 7 alphanumeric, older: shorter). Max 8 is just the input maxlength. **Strip dashes, spaces, and any special chars** before filling. Kid-plate symbols (heart, star, hand, plus) are not enterable here — the DMV portal warns "For Kids Plates, please leave out any symbols."
- **Step-2 invalid-secondary path.** If the plate exists but the secondary identifier doesn't match, the result page renders a generic "We could not locate a record matching the information provided" — this is `not_found` from the user's perspective, but it is *not* proof the plate is unregistered (could be a typo in the secondary). Surface this distinction in the output.
- **Cross-jurisdiction.** Non-CA plates always render `not_found`. There is no way to look up registration status for a non-CA vehicle on dmv.ca.gov. For non-CA plates, the agent should refuse and recommend the relevant state's DMV.
- **Don't follow the "Renew" CTA.** The success page includes a "Renew Registration Now" link that goes to `/wasapp/vrir/start.do` (the renewal flow). Read-only skill — stop at the status page.
- **Spanish locale.** `dmv.ca.gov/portal/es/vehicle-registration/vehicle-registration-status/` exists, but the actual `/wasapp/rsrc/vrapplication.do` form is English-only. Localization happens only on the portal page, not the underlying app.

## Expected Output

Return a JSON object with one of the following shapes.

### Success — current registration

```json
{
  "success": true,
  "license_plate": "8ABC123",
  "registration_status": "current",
  "expiration_date": "2026-08-31",
  "fees_due_usd": 0,
  "holds": [],
  "raw_status_text": "Your vehicle registration is current. Expires: 08/31/2026.",
  "renewal_available": false,
  "source_url": "https://www.dmv.ca.gov/wasapp/rsrc/vrapplication.do"
}
```

### Success — expired or pending renewal

```json
{
  "success": true,
  "license_plate": "8ABC123",
  "registration_status": "expired",
  "expiration_date": "2025-04-30",
  "fees_due_usd": 312.00,
  "holds": [
    {"type": "smog_certification_required", "detail": "Smog certification is required to renew."}
  ],
  "raw_status_text": "Your registration expired on 04/30/2025. Renewal fees: $312.00. Smog certification required.",
  "renewal_available": true,
  "source_url": "https://www.dmv.ca.gov/wasapp/rsrc/vrapplication.do"
}
```

### Not found — plate / secondary mismatch

```json
{
  "success": true,
  "license_plate": "8ABC123",
  "registration_status": "not_found",
  "expiration_date": null,
  "fees_due_usd": null,
  "holds": [],
  "raw_status_text": "We could not locate a record matching the information provided.",
  "renewal_available": false,
  "source_url": "https://www.dmv.ca.gov/wasapp/rsrc/vrapplication.do",
  "note": "Plate may exist but the secondary identifier (VIN-last-5 / last-name / company-name) didn't match. Re-prompt the user."
}
```

### Site-blocked / WAF wall

```json
{
  "success": false,
  "error_reasoning": "waf_blocked",
  "raw_status_text": "Your request has been blocked. ... Request ID: <hex>",
  "source_url": "https://www.dmv.ca.gov/wasapp/rsrc/vrapplication.do",
  "remediation": "Rotate the residential proxy and retry once after 60s. Confirm `--verified` Verified browsers is enabled."
}
```

### Tool offline / maintenance

```json
{
  "success": false,
  "error_reasoning": "service_unavailable",
  "raw_status_text": "<verbatim DMV maintenance banner>",
  "source_url": "https://www.dmv.ca.gov/wasapp/rsrc/vrapplication.do"
}
```

### Out-of-state plate (user error)

```json
{
  "success": false,
  "error_reasoning": "non_ca_plate",
  "raw_status_text": null,
  "remediation": "This skill only checks California plates. For other states use that state's DMV registration lookup."
}
```
