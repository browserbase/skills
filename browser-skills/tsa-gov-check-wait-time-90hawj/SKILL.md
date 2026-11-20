---
name: tsa-gov-check-wait-time-90hawj
title: TSA Check Wait Time
description: >-
  Return current and historical TSA security-line wait times for a US airport.
  TSA's public web wait-time tool has been deprecated since 2023; this skill
  documents the dead-end and routes callers to the MyTSA mobile app or
  third-party trackers.
website: tsa.gov
category: travel
tags:
  - travel
  - airport
  - tsa
  - wait-times
  - deprecated-tool
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      No public TSA API exists for wait times. The legacy MyTSA web service
      endpoint `apps.tsa.dhs.gov/MyTSAWebService/GetTSOWaitTimes.ashx` returns
      HTTP 302 to `http://www.tsa.gov` — confirmed dead 2026-05-18.
  - method: url-param
    rationale: >-
      No URL-param deep-link exists. The canonical URL
      `https://www.tsa.gov/travel/security-screening/times` and all variants
      (`/wait-times`, `/checkpoint-wait-times`, etc.) return HTTP 404 with TSA's
      standard Page-Not-Found template.
  - method: browser
    rationale: >-
      Browser is the recommended method only in the sense that 'open the URL and
      verify the 404 / 302 to confirm the deprecation is still in effect' is the
      most defensible path. There is no live page to scrape. The skill returns a
      structured `tsa_web_tool_deprecated` outcome with pointers to (a) the
      MyTSA iOS/Android app (not browseable) and (b) third-party trackers like
      flyindex.org / tsatracker.com (not TSA-published).
verified: false
proxies: false
---
# TSA Check Wait Time

## Purpose

Given a US airport (IATA code or name) and optionally a checkpoint / terminal and a day-of-week + hour-of-day window, return the current and historical TSA security-line wait times. **TSA does not currently publish this data on the public web.** This skill documents that gap, the dead-ends future agents should not re-walk, and the only viable fallback paths (MyTSA mobile app — not browseable — and third-party scrapers / crowd-sourced trackers). Read-only.

## When to Use

- A user asks "how busy is SFO Terminal 3 on a Friday at 6am?" or "what's the current wait at ATL checkpoint A?"
- A travel-planning agent wants to recommend an arrival-time buffer for a specific airport + day-of-week + hour.
- Any flow that *would* call a TSA wait-time API if one existed — so the agent fails fast with a clear "deprecated, here are the alternatives" answer instead of looping on 404s.

## Workflow

**Bottom line up front: there is no public TSA web endpoint that returns current or historical per-airport per-checkpoint wait times as of 2026-05-18.** The legacy MyTSA web tool was retired (`apps.tsa.dhs.gov/mytsa/wait_times_home.aspx` has 302-redirected to `https://www.tsa.gov/mobile` since at least Nov 2023, verified via Wayback Machine capture `20231116141524`). The path implied by the user prompt — `https://www.tsa.gov/travel/security-screening/times` — returns HTTP 404 with TSA's standard "Page Not Found" Drupal template. Same for every plausible variant (`/wait-times`, `/security-screening/wait-times`, `/security-screening/checkpoint-wait-times`).

Given that constraint, the workflow is:

1. **Recognize the dead end fast.** If asked for TSA wait times, **do not** issue browser requests to `tsa.gov` looking for a wait-times widget — none exists. Issuing them just produces 404s and wastes tokens. Skip directly to step 2.

2. **Pick a fallback path based on intent.** TSA's wait-time data only lives in two places today:

   | Caller intent | Best surface | Browseable? |
   |---|---|---|
   | "What's the historical pattern at SFO T3 on Fri 6am?" (the user's example) | **MyTSA iOS/Android app** — retains the "Check how busy the airport is likely to be on your specific day and time of travel based on historical data" feature per `https://www.tsa.gov/mobile` | **No** — native app only, no public REST/JSON endpoint, no web mirror |
   | "What's the live wait at ATL right now?" | **Third-party crowdsourced trackers** (`tsatracker.com`, `flyindex.org/airports/{iata}/tsa-wait-times/`, `flightcheck.live/tsa-wait-times`). These re-derive wait times from a mix of user reports, airline data, and historical TSA throughput stats. **They are NOT TSA-published** | Yes — each has its own SKILL surface; a future agent should produce per-site skills (e.g. `tsatracker.com/check-wait-time`) rather than treating them as a TSA proxy |
   | "How many people did TSA screen yesterday nationwide?" | `https://www.tsa.gov/travel/passenger-volumes` — daily total nationwide checkpoint count, table with two columns: `Date`, `Numbers` (e.g. `5/17/2026 → 2,887,942`). Updated Mon–Fri by 9am ET | Yes (200, plain HTML table) — but it answers a *different* question than the prompt |

3. **Return a `not_supported` outcome with the explanation.** The honest contract is to fail with structured information so the calling agent can route the user appropriately rather than hallucinate numbers.

### If the caller insists on a TSA-published answer

Direct them to `https://www.tsa.gov/mobile` and the MyTSA App on iTunes (`itunes.apple.com/us/app/mytsa/id380200364`) or Google Play (`play.google.com/store/apps/details?id=gov.dhs.tsa.mytsa`). Then return `{ "success": false, "reason": "tsa_web_tool_deprecated", "fallback": "mytsa_mobile_app" }`.

### If the caller will accept third-party data

The two highest-coverage third-party endpoints (live as of 2026-05-18, returned by Browserbase Search) are:

- `https://flyindex.org/airports/{iata-lowercase}/tsa-wait-times/` — per-airport page with both current estimate and historical hourly heatmap. Covers all major US airports (`atl`, `dfw`, `den`, `ord`, `lax`, `jfk`, `sfo`, `sea`, `clt`, `mia`, `phx`, `iah`, `bos`, `ewr`, `lga`, `dca`, `mco`, …). Each page is fully server-rendered HTML — extractable via `browse cloud fetch` without Verified. Anti-bot: none observed.
- `https://tsatracker.com/airports/{iata-lowercase}-tsa-wait-times` — same shape, slightly different historical-window UI.

Build a separate per-domain skill for whichever third-party you choose; **do not put third-party scraping under `tsa.gov/` in the catalog** — the data is not TSA's.

## Site-Specific Gotchas

- **The canonical URL in the user prompt 404s.** `https://www.tsa.gov/travel/security-screening/times` returns HTTP 404 with `<title>Page Not Found | Transportation Security Administration</title>`. Confirmed 2026-05-18 via `browse cloud fetch`. This is not a transient block — TSA's CMS does not have a node at that path.
- **Every other plausible TSA wait-time URL is also dead.** Tested 2026-05-18: `/wait-times` (404), `/travel/security-screening/wait-times` (404), `/travel/security-screening/checkpoint-wait-times` (404), `apps.tsa.dhs.gov/mytsa/wait_times_home.aspx` (302 → `/mobile`), `apps.tsa.dhs.gov/mytsa/airport_details.aspx?ap=ATL` (302 → `/mobile`), `apps.tsa.dhs.gov/MyTSAWebService/GetTSOWaitTimes.ashx?ap=ATL&output=json` (302 → `http://www.tsa.gov`). Don't waste turns probing more variants — TSA actively redirects the entire legacy app surface to a static "use the mobile app" landing.
- **The deprecation is old.** Wayback Machine capture `20231116141524` already shows the same 302 → `/mobile` redirect, so the web tool has been gone for >2 years. There is no realistic chance it returns; treat the dead end as permanent.
- **MyTSA mobile app is not browseable.** The `/mobile` page only advertises the native iOS/Android download. The app's airport-busy data is fetched over a proprietary internal endpoint that is not documented and is gated by mobile-app cert pinning + user-agent checks — out of scope for a browser-driving agent.
- **`/travel/passenger-volumes` is NOT a substitute.** It returns one row per *day* with a single nationwide total (column header `Numbers`, e.g. `2,887,942`). No airport, no checkpoint, no hour, no wait-time minutes. If a caller asks for SFO Friday 6am, this dataset cannot answer.
- **Third-party trackers (`tsatracker.com`, `flyindex.org`, `flightcheck.live`) are NOT TSA-published.** They derive estimates from user reports, airline data, and historical TSA throughput stats. Their numbers may correlate with reality but should never be labeled "TSA reported wait time" — call them "third-party estimate, source: {site}". Build a per-domain skill if you want this data; do not silently substitute for TSA.
- **The DHS-owned `https://www.dhs.gov/check-wait-times` page** (a top search result for "TSA wait times") is a hub page that links to CBP border-crossing wait times and airport-arrival CBP processing — **not TSA security checkpoint** waits. Do not confuse these; they are different agencies and different datasets.
- **The TSA news/blog tag `https://www.tsa.gov/blog/tags/wait-times`** returns press releases ("TSA prepared for busy travel season"), not data. Skip it.
- **Sandbox connectivity caveat for the generator agent.** Outbound DNS to `connect.*.browserbase.com` is blocked from the Vercel Sandbox environment used to build skills, so live-browser verification (`browse open --remote`) of any TSA-owned page is not possible from that sandbox; only `browse cloud fetch` (which hits `api.browserbase.com`) works. This did not affect verification for this skill because all candidate URLs were 404/302 at the HTTP layer — no JS-rendered SPA element to wait for. Future regeneration attempts should use the same `browse cloud fetch` probe pattern before assuming a live tool exists.

## Expected Output

Three distinct outcome shapes. The first is what this skill produces today. The other two are forward-looking — if TSA restores the tool, or if the caller opts into third-party data and the agent has access to a separate per-domain skill.

### Outcome 1 — `not_supported` (current default)

```json
{
  "success": false,
  "reason": "tsa_web_tool_deprecated",
  "details": {
    "requested_url": "https://www.tsa.gov/travel/security-screening/times",
    "requested_url_status": 404,
    "legacy_url": "https://apps.tsa.dhs.gov/mytsa/wait_times_home.aspx",
    "legacy_url_status": 302,
    "legacy_url_redirects_to": "https://www.tsa.gov/mobile",
    "deprecated_since_at_least": "2023-11-16",
    "verified_at": "2026-05-18"
  },
  "tsa_published_alternatives": [
    {
      "name": "MyTSA mobile app",
      "surface": "iOS / Android native app",
      "data_available": "historical hourly busy-ness per airport (the user's exact question), live checkpoint info per airport",
      "browseable": false,
      "ios_url": "https://itunes.apple.com/us/app/mytsa/id380200364?mt=8",
      "android_url": "https://play.google.com/store/apps/details?id=gov.dhs.tsa.mytsa&hl=en"
    },
    {
      "name": "TSA checkpoint travel numbers",
      "surface": "https://www.tsa.gov/travel/passenger-volumes",
      "data_available": "daily nationwide aggregate screening count only — no airport, no hour, no wait minutes",
      "browseable": true,
      "answers_user_question": false
    }
  ],
  "third_party_alternatives": [
    { "site": "flyindex.org", "url_template": "https://flyindex.org/airports/{iata}/tsa-wait-times/", "data": "current + historical hourly", "tsa_published": false },
    { "site": "tsatracker.com", "url_template": "https://tsatracker.com/airports/{iata}-tsa-wait-times", "data": "current + historical hourly", "tsa_published": false },
    { "site": "flightcheck.live", "url_template": "https://flightcheck.live/tsa-wait-times", "data": "current + historical hourly", "tsa_published": false }
  ]
}
```

### Outcome 2 — `success` (if TSA restores the tool — speculative schema)

```json
{
  "success": true,
  "airport": { "iata": "SFO", "name": "San Francisco International" },
  "checkpoint": { "terminal": "Terminal 3", "name": "T3 Main Checkpoint", "lane_type": "standard" },
  "current": { "wait_minutes": 12, "as_of": "2026-05-18T18:34:00Z" },
  "historical": {
    "window": { "day_of_week": "Friday", "hour_local": 6 },
    "samples": 52,
    "wait_minutes": { "min": 3, "median": 14, "max": 41, "p90": 28 },
    "source_period": "2025-05-01 → 2026-05-01"
  },
  "source": "tsa.gov"
}
```

### Outcome 3 — `success_third_party` (if caller opts into third-party data and a per-site skill is invoked)

```json
{
  "success": true,
  "airport": { "iata": "SFO" },
  "checkpoint": { "terminal": "Terminal 3" },
  "current": { "wait_minutes": 12, "as_of": "2026-05-18T18:34:00Z" },
  "historical": {
    "window": { "day_of_week": "Friday", "hour_local": 6 },
    "wait_minutes": { "min": 3, "median": 14, "max": 41 }
  },
  "source": "flyindex.org",
  "tsa_published": false,
  "disclaimer": "Third-party crowdsourced estimate, not TSA-published"
}
```
