---
name: sam-gov-contract-opportunity-search-axgs2u
title: SAM.gov Contract Opportunity Search
description: >-
  Search active federal contract opportunities on SAM.gov by status, notice
  type, place of performance (state/ZIP/country), date range, NAICS, and
  set-aside. Returns title, notice ID, agency hierarchy, place of performance,
  response deadline (with time zone), notice type, and the canonical
  /opp/{id}/view URL.
website: sam.gov
category: government
tags:
  - sam-gov
  - government
  - procurement
  - contracts
  - rfp
  - read-only
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: api
alternative_methods:
  - method: api
    rationale: >-
      api.sam.gov/opportunities/v2/search is the only path that reliably accepts
      the place-of-performance state filter. Requires a free registered API key;
      bare/DEMO_KEY calls return HTTP 404. When the harness exposes a
      SAMGOV_API_KEY, this is the fast and clean path.
  - method: browser
    rationale: >-
      Fallback when no API key. Currently degraded — the UI state autocomplete
      depends on /api/prod/locationservices/v1/api/state which returns 500
      (verified 2026-05-19), and frontend URL params for place-of-performance
      state are silently ignored at SPA load. The browser path works for status
      + notice-type + date filters but cannot apply a state filter today.
      Re-test the locationservices endpoint at run start.
verified: true
proxies: true
---
# SAM.gov Contract Opportunity Search

## Purpose

Given filter criteria — status (active/inactive), notice type, place of performance (state, country, ZIP), date range, NAICS/PSC, set-aside, agency — return the matching active federal contract opportunities from sam.gov with title, solicitation/notice ID, agency hierarchy, place of performance, response deadline (date + local time + time zone), notice type, and a direct deep-link to the listing. Read-only — never submit a response, never "Follow" an opportunity, never click `Sign In`.

## When to Use

- Daily / weekly monitoring of new federal RFPs in a given state or set of states.
- Filtering active solicitations by notice type (Solicitation, Combined Synopsis/Solicitation, Presolicitation, Sources Sought).
- Bulk extraction of opportunities for a small-business pipeline or set-aside-specific scanning.
- Any task that says "find me X on SAM.gov" — listing search, not award/contract-data lookups.

## Workflow

There are **two reliable surfaces** with very different tradeoffs. Pick by whether you have a registered SAM.gov API key.

### Path A — Official `api.sam.gov` JSON API (recommended when an API key is configured)

This is the only path that reliably honors place-of-performance state filters and returns clean JSON for every field the task asks for. The key is free and self-service at <https://open.gsa.gov/api/get-opportunities-public-api/>; the host wires it up as `SAMGOV_API_KEY` if the agent runtime is configured for it.

1. **Compute the date window.** `postedFrom` and `postedTo` are **required**; format `MM/DD/YYYY`; the window is **capped at 365 days**. For "currently active" tasks, use `postedFrom = today − 365d`, `postedTo = today`. The active filter is applied separately via `active=Yes`.

2. **Build the request.** Path is the v2 search endpoint; all filters are query params. Repeat the `state=` param (or comma-separate codes) for multi-state. Notice-type filter uses single-letter `ptype` codes (see Gotchas).

   ```
   GET https://api.sam.gov/opportunities/v2/search
       ?api_key={KEY}
       &postedFrom=05/19/2025
       &postedTo=05/19/2026
       &state=NV&state=CA
       &active=Yes
       &ptype=o,k,p,r
       &limit=100
       &offset=0
   ```

   `limit` max is 1000; default 25. `offset` paginates. `totalRecords` in the response tells you when to stop.

3. **Parse each `opportunitiesData[i]`.** Map to the requested output:

   | Output field | API path |
   |---|---|
   | Title | `title` |
   | Solicitation / Notice ID | `solicitationNumber` (human-facing) and `noticeId` (canonical, used in URL) |
   | Agency hierarchy | `fullParentPathName` (department › subtier › office, ` / `-separated) or `officeAddress`, `department`, `subTier`, `office` |
   | Place of Performance | `placeOfPerformance.city.name`, `placeOfPerformance.state.code`, `placeOfPerformance.state.name`, `placeOfPerformance.zip`, `placeOfPerformance.country.code` |
   | Response Deadline | `responseDeadLine` (ISO 8601, local-to-the-office time zone — `2026-05-29T18:00:00-04:00`) |
   | Notice Type | `type` (`Solicitation`, `Combined Synopsis/Solicitation`, `Presolicitation`, `Sources Sought`, `Special Notice`, `Award Notice`, `Justification`) |
   | Direct URL | `https://sam.gov/opp/{noticeId}/view` |
   | Active? | `active === "Yes"` |

4. **Verify "currently active" against today's date.** Even with `active=Yes`, an opp can have its `responseDeadLine` in the past if it was just modified. Always compare `responseDeadLine` to "now" in the deadline's own time zone (the offset is in the string).

5. **Deduplicate across multi-state queries.** When you OR two states, the same `noticeId` can come back twice if the opportunity's PoP spans both. Key by `noticeId`; concat the two state codes in the dedup'd row's `placeOfPerformance` field.

### Path B — Browser fallback (use only when no API key)

The browser path is **degraded today** — see the autocomplete gotcha below — but it's the only no-key option. Use a `--verified --proxies` Browserbase session; SAM.gov does not block on residential IPs but its frontend assets are slow to hydrate on cold-loaded incognito-shaped sessions and the `--verified` profile is markedly more reliable.

1. **Open the search SPA**:
   ```
   https://sam.gov/search/?index=opp&pageSize=100&page=1&sort=-modifiedDate&sfm[simpleSearch][keywordRadio]=ALL&sfm[status][is_active]=true
   ```
   The `sfm[status][is_active]=true` param **does** take effect at SPA load (default total ≈ 49,800 active opps as of 2026-05). The `pageSize=100` is the max; pagination via `page=N`.

2. **Apply the place-of-performance state filter through the UI** (URL params do **not** work — see gotcha). Expand the **Place of Performance** accordion, click into the **State / Territory** combobox (`combobox: State / Province` in the accessibility tree), type the state name (e.g. `Nevada`), and click the matching entry in the **State / Province results** listbox that appears below it. Repeat for additional states — the widget supports multi-select.

3. **Apply the notice-type filter through the UI.** Expand **Notice Type**, check the boxes for `Solicitation`, `Combined Synopsis/Solicitation`, `Presolicitation`, and `Sources Sought`. Leave `Award Notice`, `Justification`, `Special Notice` unchecked.

4. **Confirm "Active" is checked.** Under **Status**, the `Active` checkbox is **not** checked by default on a fresh page even though the URL `sfm[status][is_active]=true` makes the SPA behave as if it were. To be safe, expand **Status** and explicitly check `Active`.

5. **Read results from the rendered list.** Each result is a card with:
   - Title — `h3` link, `href = /workspace/contract/opp/{noticeId}/view` (canonical view URL is the shorter `/opp/{noticeId}/view`)
   - Notice ID — `Notice ID: {solicitationNumber}` text
   - Agency / Sub-tier / Office — three labeled blocks
   - Current Date Offers Due — `{Month DD, YYYY at HH:MM PM/AM TZ}`
   - Notice Type — `{Original|Updated} {Type}` (e.g. `Updated Solicitation`)
   - Updated Date / Published Date

   Place of performance is **not** on the search-result card. You must open each opp's detail page (`https://sam.gov/opp/{noticeId}/view`) and read `Classification › Place of Performance` (free-text, typically `{state code} {zip}` or `{city}, {state code} {zip}`).

6. **Paginate.** Cards show "Showing X – Y of Z results" and "page N of M" at the bottom. Use the `Next Page` button or rebuild the URL with `&page=N`.

7. **Dedupe by `noticeId`** (the UUID in the listing href) across pages and across state queries.

## Site-Specific Gotchas

- **`api.sam.gov` requires a registered key. No-auth = 404.** A bare `GET https://api.sam.gov/opportunities/v2/search` returns `HTTP 404` with empty body (Envoy short-circuits before the app sees the request). The `DEMO_KEY` used for some federal APIs is **not** accepted here — also 404. The skill is therefore only API-fast for agents whose harness exposes a real key.

- **Unauth `sam.gov/api/prod/sgs/v1/search/` ignores `sfm[...]` filter params.** Calling it directly (no auth) returns `totalElements: 5507525` regardless of which `sfm[status][is_active]`, `sfm[placeOfPerformanceLocation][state][0][code]`, or any other filter you pass. Verified across `placeOfPerformanceLocation`, `placeOfPerformance`, with and without `name` paired with `code` — none reduce the result count. **Do not waste time on this endpoint as a filter substitute.**

- **Frontend URL params for place-of-performance state are silently ignored at SPA load time.** Loading `https://sam.gov/search/?...&sfm[placeOfPerformanceLocation][state][0][code]=NV&sfm[placeOfPerformanceLocation][state][0][name]=Nevada` renders all 49,839 active opps, not the NV-only subset. The SPA only registers state filters that are applied through the UI tag-input (which writes to in-memory state, not the URL). `sfm[status][is_active]=true` is the **one** URL param that does apply at load.

- **State combobox autocomplete depends on `/api/prod/locationservices/v1/api/state` which currently returns HTTP 500.** Verified 2026-05-19. The State / Territory autocomplete list (`list: State / Province results` in the a11y tree) stays empty no matter what you type, because the SPA's debounced fetch to locationservices fails. While this is broken, the browser path **cannot apply a state filter at all** — the only no-key workaround is to enumerate every active opportunity (~50k, ~2,000 pages of 25) and fetch each detail page to read its `Place of Performance` field, which is impractical. Check the endpoint at the start of every run; when GSA restores it, the UI flow in step B-2 works as documented.

- **Two detail-page URL patterns.** `https://sam.gov/opp/{noticeId}/view` is the canonical user-facing URL and renders correctly. `https://sam.gov/workspace/contract/opp/{noticeId}/view` (the URL the search-card `<a>` points to) hits the backend Spring app and returns `Whitelabel Error Page` HTTP 500 from a clean session — it requires Workspace cookies. Always rewrite hrefs from `/workspace/contract/opp/.../view` to `/opp/.../view` before returning links.

- **Notice-type codes (single letter) for `ptype` API param**: `o`=Solicitation, `k`=Combined Synopsis/Solicitation, `p`=Presolicitation, `r`=Sources Sought, `s`=Special Notice, `a`=Award Notice, `j`=Justification, `g`=Sale of Surplus Property, `i`=Intent to Bundle. For the task as specified (`Solicitation, Combined Synopsis/Solicitation, Presolicitation, Sources Sought`, exclude `Awards, Justifications, Special Notices`), pass `ptype=o,k,p,r`.

- **Multi-state filter is OR, not AND.** Repeating `state=NV&state=CA` returns opportunities with a PoP in **either** state. The API does not support an "AND" semantic for PoP across multiple states (a single opp has one PoP record). The task as given asks for the union — that is what you get.

- **PoP geographic data on detail page is free-text and inconsistent.** Examples observed: `HI 96819`, `NV`, `Las Vegas, NV 89119`, `Multiple Locations`. Parse with a state-code regex (`\b(?:AL|AK|AZ|...|WY)\b`) rather than expecting a fixed schema. The API's `placeOfPerformance.state.code` is structured and reliable; the detail-page text is not.

- **Time zones are per-office, not UTC.** `responseDeadLine` in the API is local-with-offset (`2026-05-29T18:00:00-04:00`). The browser card shows `EDT/EST/HST/PDT/PT/CT` etc. Use the offset (API) or the abbreviation (browser) to do correct "is it still active right now" comparisons — a 06:00 PM EDT deadline is 03:00 PM PDT, which matters for west-coast extraction tasks.

- **`active=Yes` is the API's filter; the search SPA uses `sfm[status][is_active]=true`.** Both mean "response date is in the future and the notice is not cancelled". Even so, always re-verify `responseDeadLine > now` per the gotcha above — the data refresh delay (currently active alert: "Contract Award Data Processing Delay") can leave stale entries marked active.

- **Stealth profile**: `browse cloud sessions create --verified --proxies` is the right default. SAM.gov does not have aggressive anti-bot (no Akamai/Cloudflare challenges observed), but the SPA's bundle and accessibility tree hydrate slowly on un-verified sessions — `--verified` cuts cold-load time noticeably. A bare session works for the API path but is flaky for the UI.

## Expected Output

Return one row per **distinct** `noticeId`, sorted by `responseDeadLine` ascending. Markdown-table shape (matches the task spec):

```
| Deadline | State | Title | Agency | Notice ID | Link |
|---|---|---|---|---|---|
| 2026-05-22 19:00 UTC (03:00 PM EDT) | NV | J061--Building 15 UPS replacement | VA › 244-NETWORK CONTRACT OFFICE 4 | 36C24426Q0248 | https://sam.gov/opp/70a6aca10b414ae28906aefa4c5043cb/view |
| 2026-06-03 20:00 UTC (01:00 PM PDT) | CA | WAPA SNR- KY1A Bushing Replacement Trinity | DOE › WESTERN-SIERRA NEVADA REGION | 89503326QWA000388 | https://sam.gov/opp/dfdb29178cf24c81837d55608232c63c/view |
```

Underlying per-row JSON (what to materialize internally before formatting the table):

```json
{
  "noticeId": "dfdb29178cf24c81837d55608232c63c",
  "solicitationNumber": "89503326QWA000388",
  "title": "WAPA SNR- KY1A Bushing Replacement Trinity",
  "noticeType": "Solicitation",
  "active": true,
  "agency": {
    "department": "ENERGY, DEPARTMENT OF",
    "subTier": "ENERGY, DEPARTMENT OF",
    "office": "WESTERN-SIERRA NEVADA REGION"
  },
  "placeOfPerformance": {
    "city": "Folsom",
    "stateCode": "CA",
    "stateName": "California",
    "zip": "95630",
    "countryCode": "USA"
  },
  "responseDeadLine": "2026-06-03T13:00:00-07:00",
  "responseDeadLineTZ": "America/Los_Angeles",
  "url": "https://sam.gov/opp/dfdb29178cf24c81837d55608232c63c/view"
}
```

Outcome shapes the skill should distinguish (so the calling agent can branch cleanly):

- **`success`** — one or more matching active opportunities returned. Use the shape above.
- **`empty`** — filters validly applied, zero matches: `{ "success": true, "count": 0, "rows": [] }`. Common for narrow combinations (e.g. NV + Sources Sought + past-week posted).
- **`no_api_key`** — `api.sam.gov` returned 404 with empty body. Fall through to the browser path.
- **`browser_filter_blocked`** — locationservices state-autocomplete returning 5xx and no API key. Return `{ "success": false, "reason": "state_filter_unavailable", "detail": "sam.gov locationservices /api/prod/locationservices/v1/api/state returning HTTP 500; cannot apply place-of-performance state filter through the UI. Retry when GSA restores the endpoint or supply a SAM.gov API key for the api.sam.gov path." }` — do not attempt to enumerate all 49k active opps.
- **`stale_active`** — opportunity flagged `active=Yes` but `responseDeadLine < now`. Drop from results; log count in `meta.filteredStale`.
