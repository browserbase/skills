---
name: tmichot-mof-gov-il-extract-items-with-links-tmanm7
title: Extract Call-for-Proposals Items with Links
description: >-
  Extract all open call-for-proposals (grant opportunities) from the Israeli
  Government Support Portal — each item's call number, title, department/office,
  submission window, target population, and external detail/opportunity link —
  via the site's public JSON API.
website: tmichot.mof.gov.il
category: government
tags:
  - government
  - grants
  - tenders
  - listings
  - api
  - israel
source: 'browserbase: agent-runtime 2026-07-06'
updated: '2026-07-06'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      When the JSON API is unavailable, navigate /call-for-proposals/, wait for
      the React app to hydrate, scroll to the card grid, and harvest each card's
      title, department, dates, and the two link anchors. ~100x costlier than
      the API because the list is long and fully JS-rendered.
verified: false
proxies: false
---
# Extract Call-for-Proposals Items with Detail Links (Government Support Portal)

## Purpose

Return every "קול קורא" (call for proposals / grant opportunity) listed on the Israeli Government Support Portal (`tmichot.mof.gov.il`, אתר התמיכות הממשלתי), with each item's call number, title, description, issuing office/department, submission window, target population, status, and its link to the detailed/opportunity page. Read-only — this skill only reads the public listing; it never submits a support request (submission happens on a separate Merkava/gov.il portal). The portal is a React single-page app that is a thin client over a **public, unauthenticated JSON API**, so the recommended path calls that API directly rather than driving the browser.

## When to Use

- Enumerate all currently-open grant/support opportunities and their detail links (title, department, dates, external "view the call" URL).
- Monitor the open-calls list for new opportunities on a schedule.
- Pull the full historical archive of closed calls.
- Anywhere you would otherwise scrape the `/call-for-proposals/` page — the JSON API is faster, cheaper, and returns clean structured records with the link fields already parsed.

## Workflow

The SPA loads its data from a public JSON API at `https://tmichotapi.mof.gov.il/api` (base URL is hard-coded in the app bundle). No auth, cookies, login, or anti-bot stealth is required for the read endpoints — a plain server-side GET works, **no residential proxy or verified/stealth session needed** (validated bare). Lead with the API; the browser flow is a costlier fallback.

1. **Fetch the open calls list** (the "items on this page"):
   ```
   GET https://tmichotapi.mof.gov.il/api/callForProposals/callForProposals?status=0
   ```
   - `status=0` → **open** calls (currently ~126). `status=1` → **closed / full archive** (currently ~7093, ~4 MB).
   - The `status` param is **required** — omitting it returns `404`.
   - The response body is a **bare JSON array** of item objects (not wrapped in `{ content: … }` like the config endpoint below).

2. **Read each item's fields**. Every array element looks like:
   ```json
   {
     "status": "ACTV",
     "callNumber": "000000018651",
     "startExpiration": "10/26/2025 12:00 AM",
     "endExpiration": "12/31/2026 12:00 AM",
     "officeCode": "2200",
     "officeIcon": null,
     "targetPopulationCode": "SM",
     "linkToCallView": "www.dat.gov.il",
     "linkToCall": null,
     "callTitle": "רבני ישוב נורמטיבי 2026",
     "callDescription": "רבני ישוב נורמטיבי 2026",
     "departmentName": "משאבי אנוש במועצות הדתיות",
     "activityCode": "98",
     "activitySupportType": " ",
     "essenceCode": "01",
     "isFromCms": false
   }
   ```
   - **Detail / opportunity link** = `linkToCallView` — the external ministry page for the call (e.g. `https://pob.education.gov.il/kolotkorim/kolkore/?id=6147`, `https://www.gov.il/he/pages/court-support-23`). Only a subset of open items populate it (~37 of 126 observed); the rest have `null` (their full detail is the card's own title + description + department + dates). `linkToCall` was `null` for every item observed. Some `linkToCallView` values are **scheme-less** (e.g. `"www.dat.gov.il"`) — prepend `https://` before using.
   - **Display call number** = `callNumber` with leading zeros stripped (`"000000018651"` → `18651`), which is how the number appears on the card.
   - **Submission window** = `startExpiration` → `endExpiration`, in US format `M/D/YYYY h:mm AM/PM` (Israel local time).

3. **Decode the office / target-population / activity codes** (optional) with the page-config endpoint:
   ```
   GET https://tmichotapi.mof.gov.il/api/callForProposals
   ```
   Returns `{ seoData, content, components }`. `content.filterByOfficeOptions[]` maps `officeCode` → `officeName`, `content.filterByTargetPopulationOptions[]`, `content.filterByOfficeActivityOptions[]`, and `content.filterByRequestTypeOptions[]` provide the other code tables. `content.faq[].answer` fields are base64-encoded HTML.

4. **Filter locally, not via query params.** All filtering on the site (by office, activity, target population, request type, and free-text search) is done **client-side** — passing `officeCode=…` or `searchText=…` to the list endpoint is silently ignored and still returns the full set. To filter, fetch the whole `status=0` (or `status=1`) array once and filter in your own code using the decoded fields.

### Browser fallback

If the API is ever unavailable, drive the SPA:
1. Open `https://tmichot.mof.gov.il/call-for-proposals/` and wait ~5–6 s for the React app to hydrate (`browse snapshot` returns nothing before hydration).
2. Scroll down past the hero and the "חיפוש קולות קוראים לפי קטגוריות" filter block to reach the card grid under the "N קולות קוראים נמצאו" heading.
3. Each card renders: department (מחלקה), target audience (קהל יעד), submission dates (מועד ההגשה), a days-remaining pill, and two links — "הגשת בקשת תמיכה במרכב\"ה" (submit via the external Merkava portal) and "קישור לצפייה בקול קורא" (the `linkToCallView` detail link). Harvest anchors + text per card. This costs roughly ~100× the API path because the list is long and fully JS-rendered.

## Site-Specific Gotchas

- **`status` query param is mandatory** on `…/callForProposals/callForProposals` — no `status` → `404`. Use `status=0` for open, `status=1` for the full/closed archive.
- **Response is a bare JSON array**, unlike the sibling config endpoint `/api/callForProposals` which wraps data in `{ seoData, content, components }`. Don't expect a `content` wrapper on the list.
- **All filtering is client-side.** `officeCode`, `searchText`, and other filter params on the list endpoint are ignored server-side (verified: `?status=0&officeCode=2200` and `?status=0&searchText=חינוך` both still returned all 126 items). Fetch the full array and filter locally.
- **`linkToCallView` is the only detail link and is often `null`** (~37/126 open items populate it). It points to **external ministry sites**, not to a page on `tmichot.mof.gov.il` — there is no internal per-item detail URL; the SPA expands cards in place. Some values omit the URL scheme (`"www.dat.gov.il"`) — normalize to `https://`.
- **`callNumber` is zero-padded** to 12 digits; the on-screen number is the value with leading zeros removed.
- **Dates are US-format** (`M/D/YYYY h:mm AM/PM`) in Israel local time, e.g. `12/31/2026 12:00 AM`.
- **Content is Hebrew / RTL.** Titles, descriptions, department and office names are Hebrew strings; ensure UTF-8 handling.
- **CORS is locked to the front-end origin** (`Access-Control-Allow-Origin: https://tmichotapi.mof.gov.il` / `https://tmichot.mof.gov.il`). This only affects in-browser cross-origin `fetch` from another domain — a server-side/CLI GET is unaffected.
- **No anti-bot on the read endpoints.** The homepage sets `TS…` (BIG-IP) cookies and the `/call-for-proposals/` page loads a reCAPTCHA badge, but the reCAPTCHA only guards the "alerts/bell" registration feature (`specificCallForProposalsRegister`), not the listing. The list API returned `200` bare (no proxy, no verified session) in testing.
- **`status` field on each item** (`ACTV` / `INAC`) is per-record and distinct from the `status=0/1` list filter; the closed archive (`status=1`) contains a mix of `ACTV`/`INAC` historical records.
- Don't waste time probing `/api/getResult`, `/api/callForProposals/getResult`, `/api/callforproposals/search|list|results`, or `/api/callForProposals/callForProposal?code=…` — all confirmed `404`. The only working list path is `/api/callForProposals/callForProposals?status={0|1}`.

## Expected Output

A JSON object with the total count and one record per call. `detailLink` is the normalized `linkToCallView` (or `null`).

```json
{
  "success": true,
  "status": "open",
  "count": 126,
  "items": [
    {
      "callNumber": "18651",
      "callNumberRaw": "000000018651",
      "title": "רבני ישוב נורמטיבי 2026",
      "description": "רבני ישוב נורמטיבי 2026",
      "department": "משאבי אנוש במועצות הדתיות",
      "officeCode": "2200",
      "targetPopulationCode": "SM",
      "submissionStart": "10/26/2025 12:00 AM",
      "submissionEnd": "12/31/2026 12:00 AM",
      "recordStatus": "ACTV",
      "detailLink": "https://www.dat.gov.il"
    },
    {
      "callNumber": "19489",
      "callNumberRaw": "000000019489",
      "title": "חלוקת כספי תמיכות בגין צרוך ספורטיבי מיוחד",
      "description": "חלוקת כספי תמיכות בגין צרוך ספורטיבי מיוחד",
      "department": "אגף (תמיכות ומתקנים)",
      "officeCode": "...",
      "targetPopulationCode": "...",
      "submissionStart": "05/20/2026 12:00 AM",
      "submissionEnd": "07/06/2026 12:00 AM",
      "recordStatus": "ACTV",
      "detailLink": "https://www.gov.il/he/pages/sports_facility_program"
    },
    {
      "callNumber": "19420",
      "callNumberRaw": "000000019420",
      "title": "הגדלת משרות רבני ערים",
      "department": "משאבי אנוש במועצות הדתיות",
      "submissionStart": "04/20/2026 12:00 AM",
      "submissionEnd": "12/31/2026 12:00 AM",
      "recordStatus": "ACTV",
      "detailLink": null
    }
  ]
}
```

Failure shape (e.g. endpoint unreachable or `status` param omitted):

```json
{ "success": false, "count": 0, "items": [], "error_reasoning": "404 from list endpoint — 'status' query param is required (use status=0 for open, status=1 for archive)." }
```
