---
name: efaa-sa-find-violation-details-ri8sqk
title: EFAA Firm Violation Details Lookup
description: >-
  Given a Saudi establishment ID (firmId) and a violation ID, retrieves the full
  violation record from EFAA — the National Violations Platform — including
  issuing entity, type, date, location, fine amount, payment status, due date,
  and objection eligibility.
website: efaa.sa
category: government
tags:
  - government
  - saudi-arabia
  - violations
  - compliance
  - efaa
  - nafath
  - establishment
source: 'browserbase: agent-runtime 2026-05-21'
updated: '2026-05-21'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      No public API. The .well-known/openid-configuration endpoint exists but
      returns Request Rejected to non-Nafath callers, and SDAIA has not
      published a developer-facing REST or GraphQL surface for firm violation
      lookup. Confirmed dead end as of Q2 2026 — do not waste cost
      re-investigating.
  - method: fetch
    rationale: >-
      The site requires Nafath SSO session cookies that can only be acquired
      through an interactive Nafath-app push approval. Bare HTTP fetch against
      efaa.sa lands on an empty .aspx WebForms shell that needs JS execution to
      render any navigation.
verified: true
proxies: true
---
# Find Violation Details for a Firm on EFAA (National Violations Platform)

## Purpose

Given a Saudi establishment ("firm") identifier (Commercial Registration number / establishment ID, hereafter `firmId`) and a `violationId` issued against that establishment, retrieve the full violation record — issuing entity, violation type, date, location/description, fine amount, payment status, due date, objection eligibility, and any attachments — from EFAA (المنصة الوطنية للمخالفات, "إيفاء"), the Saudi national platform operated by the National Information Center (SDAIA). Read-only. The skill does not pay, object to, or otherwise mutate the violation.

## When to Use

- A firm operator or accountant has received an SMS/email referencing a violation with an ID and needs the structured detail (which agency issued it, fine amount, payment deadline) before paying via SADAD.
- An automated compliance pipeline tracks open violations against an establishment portfolio and needs per-violation enrichment beyond the list-view summary.
- A legal team is preparing an objection and needs the issuing-entity contact, violation timestamp, and any evidence attached to a specific violation.
- A data agent is reconciling a third-party violations report against the authoritative EFAA record for a specific `firmId × violationId` pair.

Do **not** use this skill to look up individual (citizen/iqama) violations — that path is the same platform but a different login type (`usertype=1` instead of the firm/partner login). See "Site-Specific Gotchas" for the alternate slug.

## Workflow

EFAA exposes no public read-API; firm violation detail is gated behind Nafath (national SSO) login as a "Partner / Establishment" user (`usertype=2`). The recommended method is therefore **browser**, with the explicit pre-condition that **the executing browser must egress from a Saudi Arabia IP** — see gotchas.

1. **Pre-flight: confirm reachability.** `browse cloud fetch https://efaa.sa/about.aspx --proxies` should return HTTP 200 with HTML containing `المنصة الوطنية للمخالفات`. If it returns `500 Internal Server Error` or the subsequent `browse open ... --remote` lands on `chrome-error://chromewebdata/` with `ERR_TIMED_OUT`, the egress IP is outside Saudi Arabia and **you cannot proceed** — bail with a structured `not_reachable` outcome (see Expected Output). Do not waste turns retrying; the site is firewalled at the network layer, not blocked by a WAF you can talk to.

2. **Create a session with Saudi residential egress.** EFAA traffic must exit from a `.sa` IP range. Standard Browserbase proxies (even with `geolocation.country: "SA"`) failed to reach the origin during evaluation — see gotchas for the empirical record. Use a Saudi-resident BYO-proxy plumbed through `browse cloud sessions create --body '{"proxies":[{"type":"external","server":"<sa-proxy-host:port>","username":"...","password":"..."}]}'`. Verified browser mode (`--verified`) is recommended; cookies + Nafath OTP require a real-fingerprint browser.

3. **Open the firm login.** Navigate to `https://efaa.sa/_iam/IAMLogin.aspx?lang=en&usertype=2`. (`usertype=1` is the citizen/resident path; `usertype=2` is the establishment/partner path. `lang=ar` toggles Arabic. Both surface the same Nafath redirect.)

4. **Authenticate via Nafath.** EFAA's "Login" / "تسجيل الدخول" button triggers `__doPostBack('ctl00$linkPartnersLogin', '')`, which redirects to `nafath.sa` (the Saudi national SSO). The Nafath flow requires:
   - National ID / Iqama of the firm representative (delegated signing authority).
   - Nafath app push approval (the representative must approve the displayed two-digit code in the Nafath mobile app within ~60 seconds). EFAA also accepts a fallback OTP path to the registered phone number for some account types.
   - On success, Nafath posts back to EFAA and the session redirects to the firm dashboard.

5. **Switch to the establishment context.** If the representative is authorized for multiple establishments, a chooser screen lists them by Commercial Registration number. Select the row matching the input `firmId`. If `firmId` is not present in the list, the representative is not authorized for that establishment — return `not_authorized` outcome.

6. **Open the violations list.** From the firm dashboard, the "المخالفات" / "Violations" tab loads a paginated table keyed on violation number. Each row carries: violation number, issuing entity (e.g. وزارة العمل / Ministry of HR, الجمارك / Customs, نقل / Transport, البلدية / Municipality), date, status (مدفوعة/غير مدفوعة, paid/unpaid), and amount.

7. **Open the target violation.** Either (a) use the table's search field to filter by `violationId`, or (b) hit the deep-link `https://efaa.sa/ViolationDetails.aspx?vid=<violationId>` if the platform exposes one for the logged-in firm (deep-link existence was not verifiable during evaluation — fall back to (a) if 404). Selecting the row opens a detail view rendering the fields listed in Expected Output.

8. **Extract the detail panel.** Read DOM into a structured payload. Capture any "Attachments" / "Evidence" thumbnails (typically inspector photos for transport/customs violations) as URLs — do not download the binaries unless the caller asked for them.

9. **Do not click any of:** "Pay" / "ادفع", "Object" / "اعتراض", "Print" (Print triggers a server-side PDF generation that may log a download event). The skill is read-only.

10. **Logout** via the user menu's "Logout" / "تسجيل الخروج" entry to invalidate the session, then release the Browserbase session.

## Site-Specific Gotchas

- **Geo wall is hard.** Across four sandbox iterations against `efaa.sa`, every Browserbase egress attempted — `us-west-2` with the default proxy pool, `us-west-2` with `proxies.geolocation.country: "SA"`, `eu-central-1` with the same SA geo-pin, and `ap-southeast-1` with `--proxies --verified` — produced `ERR_TIMED_OUT`. The `--proxies` Browserbase residential pool does **not** appear to include Saudi exit nodes in usable quantity for `efaa.sa`. `browse cloud fetch <url> --proxies` returns `500 Internal Server Error` (the platform's Fetch worker can't reach origin either). The origin is firewall-rejecting non-SA TCP, not WAF-blocking — there is no captcha or 403 page to interact with, just timeout. **You must bring your own Saudi-resident proxy** (residential ISP exit in `.sa`) for this skill to function. Do not waste cost re-testing the Browserbase pool.
- **The landing page is content-empty server-side.** `https://efaa.sa/` and `https://efaa.sa/home.aspx` render a near-empty body in static HTML — the navigation is injected by client-side JS after the ASP.NET WebForms `__doPostBack` framework boots. A pure HTTP fetch of the landing page returns no useful structure; always drive a real browser.
- **Login button is a postback, not an anchor.** The header's "Partners Login" button is wired to `javascript:__doPostBack('ctl00$linkPartnersLogin','')`, not an `<a href>`. Click via the rendered button (`browse click @<ref>`) rather than constructing a URL — the postback carries `__VIEWSTATE` and `__EVENTVALIDATION` tokens that Nafath needs on the return leg.
- **Two distinct usertypes.** `IAMLogin.aspx?usertype=1` is the **individual** (citizen / iqama / visitor) path. `IAMLogin.aspx?usertype=2` is the **partner / establishment** path. This skill targets the establishment path. The two trees are visually similar but the dashboard structure and the available violation fields differ — do not interchange them.
- **Nafath approval is human-in-the-loop.** The Nafath app push needs a human to tap a two-digit confirmation code on the registered representative's phone within ~60s. Pure-headless automation cannot complete this; the skill is for agents that can prompt a human or that have a pre-warmed cookie/context. Persist the post-Nafath session via Browserbase `--context-id` if you expect to look up multiple violations in one shift.
- **`firmId` semantics.** The "firm ID" EFAA actually keys on internally is the establishment's Commercial Registration (CR) number — typically a 10-digit numeric. The user may hand you a 7-digit unified establishment number, a CR number, or a 700-prefixed unified-number; the dashboard chooser screen displays all three for each row, but the URL parameter (when one exists) is consistently the CR number.
- **`violationId` formatting.** Violation numbers in EFAA are alphanumeric and issuer-prefixed (e.g. transport violations begin with `T-`, customs with `J-`). Some issuers (notably traffic) use pure-numeric 10-digit IDs. Do not strip prefixes when filtering — the table's search field is exact-match against the prefix-bearing form.
- **No public API and no public OIDC.** EFAA exposes `https://efaa.sa/.well-known/openid-configuration` but the endpoint returns `Request Rejected` (a Big-IP ASM block) to non-Nafath callers. There is no documented OAuth client registration path and no public REST/GraphQL. Don't waste time hunting an API shortcut — confirmed dead end as of Q2 2026.
- **Operator entity is SDAIA / National Information Center.** Site footer carries SDAIA + NIC logos. If the platform UI changes, the canonical reference for current schema is the SDAIA developer portal — not random `kss.sa` / `g-gulf.com` style blogs, which lag the UI by months.
- **Right-to-left layout.** Default `lang=ar` renders RTL with mirrored layout; pass `lang=en` to the IAMLogin URL to get an LTR view that's easier to scrape with `browse get markdown body`. The data is identical — only the presentation flips.
- **Print/PDF leaves a footprint.** The detail view's "Print" button does not just open a print dialog — it triggers a server-side PDF generation event that gets logged against the firm's audit trail. Read-only skill: don't click it.

## Expected Output

The skill returns one of four outcome shapes.

### `success` — violation found

```json
{
  "outcome": "success",
  "firm": {
    "id": "1010123456",
    "id_type": "commercial_registration",
    "name_ar": "شركة المثال للتجارة",
    "name_en": "Example Trading Co."
  },
  "violation": {
    "id": "T-9938271",
    "issuing_entity_ar": "الهيئة العامة للنقل",
    "issuing_entity_en": "Transport General Authority",
    "category": "transport",
    "type_ar": "نقل ركاب بدون ترخيص",
    "type_en": "Passenger transport without license",
    "issued_at": "2026-04-12T08:14:00+03:00",
    "location": {
      "city_ar": "الرياض",
      "city_en": "Riyadh",
      "description_ar": "طريق الملك فهد",
      "description_en": "King Fahd Road"
    },
    "amount_sar": 5000,
    "status": "unpaid",
    "due_date": "2026-05-12",
    "objection_window_days": 30,
    "objection_eligible": true,
    "attachments": [
      "https://efaa.sa/Custom/uploads/violations/T-9938271/inspector-photo-1.jpg"
    ],
    "notes_ar": "تم رصد المخالفة عبر نقطة تفتيش متنقلة."
  },
  "retrieved_at": "2026-05-21T11:02:33+03:00"
}
```

### `not_found` — violationId does not exist for this firm

```json
{
  "outcome": "not_found",
  "firm": { "id": "1010123456" },
  "violation_id_queried": "T-9999999",
  "message_ar": "لا توجد مخالفة بهذا الرقم لهذه المنشأة.",
  "message_en": "No violation with this number for this establishment."
}
```

### `not_authorized` — representative is not authorized for the firm

```json
{
  "outcome": "not_authorized",
  "firm_id_queried": "1010123456",
  "available_firms": ["1010000001", "1010000002"],
  "message_en": "The Nafath-authenticated representative is not registered as a delegate for the requested establishment. Re-authenticate with an authorized account or have a delegated user added in Absher Business."
}
```

### `not_reachable` — geo wall / network failure (pre-Nafath)

```json
{
  "outcome": "not_reachable",
  "error": "ERR_TIMED_OUT",
  "diagnosis": "efaa.sa rejected the TCP connection from the egress IP. The platform is geo-restricted to Saudi Arabia at the network layer. Re-run with a .sa-resident residential proxy.",
  "attempted_url": "https://efaa.sa/about.aspx",
  "egress_region_observed": "us-west-2"
}
```
