---
name: claimit-ca-gov-claim-money-x9z0wr
title: California Unclaimed Property Search
description: >-
  Search California's Claim It (claimit.ca.gov) unclaimed-property database by
  last/business name (plus optional first name, city, zip, or property ID) to
  see if a person or business is owed money, returning each record's holder,
  amount, property type, and online-claimability. Read-only; stops before filing
  a claim.
website: claimit.ca.gov
category: government
tags:
  - california
  - unclaimed-property
  - government
  - search
  - money
  - claimit
source: 'browserbase: agent-runtime 2026-06-19'
updated: '2026-06-19'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      An internal JSON API exists at /SWS/properties, but it is not viable
      standalone: naive GET calls return 400 swsError, the real request rides
      Angular's fetch backend bound at app bootstrap (un-hookable post-load and
      non-replayable), and the file-claim path is Cloudflare Turnstile-gated.
      Driving the rendered UI is the only reliable method.
verified: false
proxies: false
---
# California Unclaimed Property Search

## Purpose

Search the California State Controller's Office "Claim It California" database (`claimit.ca.gov`) to find out whether a person or business is owed unclaimed money/property held by the State, and return the matching records with holder, location, dollar amount, NAUPA property type, and whether each record is claimable online. This skill is **read-only**: it performs the free name search and reads the results table only. It deliberately stops before filing a claim — the claim-filing wizard demands an SSN/ID and other personal identifiers and is gated by a Cloudflare Turnstile challenge, neither of which should be automated.

## When to Use

- Checking if a given individual or business name has unclaimed property in California ("is the State holding money for me?").
- Enumerating all property records tied to a name, with amounts, holders, and property IDs.
- Determining whether a found property can be claimed online now vs. must be recovered by contacting the holding business before a deadline.
- Bulk/periodic monitoring of a name across the California unclaimed-property roll.

## Workflow

The site is an Angular single-page app backed by a JSON API at `https://claimit.ca.gov/SWS/properties`. **The API is not usable standalone** (see Gotchas — naive calls return `400 swsError`, the real call rides Angular's fetch backend bound at bootstrap, and the file-claim path is Turnstile-gated), so the recommended and only reliable method is driving the browser. The search itself does **not** require residential proxies or a verified/stealth session — a plain remote browser session reaches it cleanly.

1. **Open the homepage**: `browse open https://claimit.ca.gov/ --remote`. Wait for load. The hero section contains an inline search form.

2. **Snapshot to get live element refs**: `browse snapshot`. The homepage form exposes:
   - `textbox: Last or Business Name` (required)
   - `textbox: First Name (Optional)`
   - `button: SEARCH`

   **Re-snapshot before every interaction.** Refs are Angular-generated and change on each render; they go stale immediately after any search re-renders the page.

3. **Fill and submit**: `browse fill @<last-name-ref> "Nguyen"` (optionally the first-name field), then `browse click @<search-button-ref>`. The app performs a full document navigation to `https://claimit.ca.gov/app/claim-search`.

4. **Wait for results**: `browse wait timeout 4000` (the results table is rendered after the `/SWS/properties` round-trip; there is no instant DOM).

5. **Read the count and rows**: `browse get text body`. Look for `Your search returned N unclaimed properties.` Then extract the results table. Columns, in order: **Select an Action, Name, Co-Owner, Holder Name, Address, City, State, Zip, Amount, Property ID, Property Indicator**. Each row's "Select an Action" cell is either a `CLAIM` + `SHARE` button pair (claimable) or an `INFO` badge (not yet claimable).

6. **Refine if needed** (advanced form): the `/app/claim-search` page itself has a fuller form with extra filters — `City`, `Zip Code`, and `Property ID` in addition to Last/First name. Use these to narrow results, especially because the result set is **hard-capped at 1000** (e.g. "Garcia"/"Smith" both return exactly 1000). A `Property ID` alone is sufficient to look up a single record (leave the name blank).

7. **Paginate** if reading beyond the first page: a `Display:` selector offers 20/40/80 results per page, and a pager exposes up to 50 pages. Change page size first to minimize page turns.

8. **STOP.** Do not click `Continue To File Claim`. That begins the claims wizard which requires personal identifiers and triggers a Cloudflare Turnstile checkbox ("Please check the box below to continue"). Filing is out of scope for this read-only skill.

## Site-Specific Gotchas

- **Result set is capped at 1000.** Common names return exactly `1000` and the count does not reflect the true total. Always narrow with `City` / `Zip Code` on the `/app/claim-search` advanced form when you need completeness.
- **Element refs are volatile.** It is an Angular SPA; every search re-renders the results page and invalidates prior snapshot refs. Re-run `browse snapshot` and re-resolve `Last or Business Name` / `SEARCH` refs before each new search. Reusing a stale ref silently no-ops (the page keeps showing the previous result set) — a frequent failure mode.
- **Home → results is a real navigation, not just a route change.** Submitting from the homepage navigates the document to `/app/claim-search` and wipes any injected page state.
- **Two distinct row outcomes:**
  - *Claimable* — row has `CLAIM` and `SHARE` buttons, a concrete `Amount` (e.g. `$67.24`), and a NAUPA `Property Indicator` (e.g. `CREDIT BAL - ACCTS RECEIVABLE`, `ESCROW ACCOUNTS`, `ACCOUNTS PAYABLE`, `REFUNDS DUE`, `UNREDEEMED GIFT CERTIFICATE`). This is "owed and claimable online."
  - *Not yet claimable* — no CLAIM button; the action cell shows an `INFO` badge reading `Property is being transferred to the State Controller's Office.` or `Property not yet received by the State. Contact the business before MM/DD/YYYY.` `Amount` for these is often masked as `UNDER $100`. These must be recovered by contacting the holder business before the listed deadline, not via this site.
- **`Amount` is sometimes masked.** The SCO does not disclose the exact value of in-process/transferring property; expect literal `UNDER $100` strings alongside exact-dollar values. Treat `Amount` as a string, not a number.
- **No exact `claimable` flag in the API text** — derive it from presence of the CLAIM button / absence of an "INFO ... transferred/not yet received" indicator in the action cell.
- **Zero-result shape:** `Your search returned 0 unclaimed properties.` plus a table reading `No properties to display.`
- **The JSON API is a dead end for standalone use.** Endpoints `https://claimit.ca.gov/SWS/properties` and `/SWS/app/properties` exist, but: a naive `GET /SWS/properties?lastName=...` returns `{"status":500,...,"swsError":"swsError"}` with HTTP 400; the real request is issued by Angular's HttpClient fetch backend, which captures the native `fetch` reference at app bootstrap, so a `fetch`/`XMLHttpRequest` hook injected after page load never sees it and cannot be replayed. Don't waste time trying to script the API directly — drive the UI.
- **Anti-bot is on the *filing* path, not search.** The search completed on a bare remote session (no `--proxies`, no `--verified`). The homepage embeds Cloudflare Turnstile (sitekey `0x4AAAAAABagPdNG6AfwmwOU`) and ThreatMetrix device fingerprinting (`*.online-metrix.net`), but these gate `Continue To File Claim`, not the property search. If a future change adds friction to search, escalate to `--proxies`/`--verified`.
- **Site served via CloudFront/S3** with a strict CSP; the SPA shell is tiny (`<sws-root>`) and all content is client-rendered, so `browse cloud fetch` of the bare URL returns only the bootstrap HTML — you must render with a real browser to see any property data.

## Expected Output

Results found (mixed claimable / not-yet-claimable):

```json
{
  "success": true,
  "search": { "last_name": "Nguyen", "first_name": null, "city": null, "zip": null },
  "total_results": 1000,
  "result_count_capped": true,
  "properties": [
    {
      "name": "NGUYEN NGUYEN",
      "co_owner": null,
      "holder_name": "SYNCHRONY BANK",
      "address": "1533 SILVER RANCH LN",
      "city": "SAN JOSE",
      "state": "CA",
      "zip": "95138",
      "amount": "$3.13",
      "property_id": "991877514",
      "property_indicator": "CREDIT BAL - ACCTS RECEIVABLE",
      "claimable": true
    },
    {
      "name": "NGUYEN NGUYEN",
      "co_owner": null,
      "holder_name": "GOOGLE PAYMENT CORPORATION",
      "address": "UNKNOWN",
      "city": "LOS ANGELES",
      "state": "CA",
      "zip": "90045",
      "amount": "UNDER $100",
      "property_id": "1063677417",
      "property_indicator": null,
      "claimable": false,
      "status_note": "Property is being transferred to the State Controller's Office."
    }
  ],
  "error_reasoning": null
}
```

No results:

```json
{
  "success": true,
  "search": { "last_name": "Zxqwvkjpfbmlq", "first_name": null },
  "total_results": 0,
  "properties": [],
  "error_reasoning": null
}
```

Blocked / failed:

```json
{
  "success": false,
  "search": { "last_name": "Smith", "first_name": "John" },
  "total_results": null,
  "properties": [],
  "error_reasoning": "Results table did not render after submit / Cloudflare challenge appeared."
}
```
