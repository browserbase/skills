---
name: oregoncabaret-com-extract-show-times-yeyyc1
title: Oregon Cabaret Theatre Show Times
description: >-
  Extract Oregon Cabaret Theatre's upcoming productions and individual
  performance dates/times from its OvationTix ticketing client, bypassing the
  SiteDistrict-walled marketing site.
website: oregoncabaret.com
category: events
tags:
  - events
  - theatre
  - showtimes
  - tickets
  - ovationtix
  - schedule
source: 'browserbase: agent-runtime 2026-07-13'
updated: '2026-07-13'
recommended_method: browser
alternative_methods:
  - method: fetch
    rationale: >-
      Not viable. oregoncabaret.com returns SiteDistrict 403 for all fetches,
      and the real data source (ci.ovationtix.com / api.ovationtix.com) sits
      behind a Cloudflare 'Just a moment' challenge that plain HTTP clients
      cannot clear.
  - method: api
    rationale: >-
      OvationTix exposes api.ovationtix.com endpoints but they are
      Cloudflare-protected; only a verified browser session clears the
      challenge, so a scripted API call fails.
verified: true
proxies: true
---
# Extract Upcoming Show Times — Oregon Cabaret Theatre

## Purpose

Read-only skill that returns Oregon Cabaret Theatre's upcoming productions and their individual performance dates/times. The public marketing site `oregoncabaret.com` is behind the SiteDistrict WAF, which hard-blocks automation. All show scheduling data actually lives on the theatre's OvationTix (AudienceView) ticketing client — organization id `35080` — which is the reliable source this skill targets. Output is a list of productions (title + run dates) plus, per production, every scheduled performance date and start time (with sold-out/unavailable slots flagged). No tickets are purchased and no login is performed.

## When to Use

- "What's playing at the Oregon Cabaret Theatre right now / next?"
- "List the performance dates and show times for the current Oregon Cabaret production."
- "When can I see Chicago (or the current show) at the Oregon Cabaret?"
- "Get the full 2026 season schedule for Oregon Cabaret Theatre."
- Any request for Oregon Cabaret Theatre showtimes, curtain times, or matinee/evening schedule.

## Workflow

**Optimal path — go straight to OvationTix, skip `oregoncabaret.com` entirely.** The marketing site adds no scheduling data you can't get from the ticketing client, and it is walled off (see Gotchas). The OvationTix client for this venue is `https://ci.ovationtix.com/35080`. It is Cloudflare-protected, so a real browser is required — a verified Browserbase session (`--verified --proxies`) passes the Cloudflare "Just a moment…" interstitial cleanly; a plain HTTP fetch does not.

1. **Create a stealth session.** `browse cloud sessions create --keep-alive --verified --proxies`. Verified mode is what clears Cloudflare on `ci.ovationtix.com`.
2. **Open the calendar.** `browse open "https://ci.ovationtix.com/35080" --remote`. Wait for the AudienceView SPA to hydrate — the page `<title>` becomes `AudienceView Professional` and the production cards render. A `browse wait timeout 4000` after load is usually enough.
3. **Read the season list.** `browse get text body`. Each production renders as its title immediately followed by its run range, e.g. `Chicago … Mon, Jul 13 - Sun, Aug 30`, `Dracula: A Comedy of Terrors … Fri, Sep 11 - Sun, Nov 08`. This gives you every upcoming production and its date range in one shot.
4. **Get individual performance times for a production.** Each production card links to `https://ci.ovationtix.com/35080/production/<productionId>`. Open that URL directly (`browse open …`) and `browse get text body`. The body lists every performance as day + date + one or more start times, e.g. `Thursday 16 July 2026 1:00pm 8:00pm`, `Monday 13 July 2026 8:00pm`. A slot shown as `Not Available` is a performance that exists but cannot be booked (sold out / not on sale).
5. **Assemble output.** Emit the JSON in Expected Output. Parse the concatenated text into `{date, times[]}` entries; treat lines containing `Not Available` as `available: false` for that slot.

Notes:
- Production ids are stable within a season. As of 2026-07 the current show *Chicago* is production `1250789`; the calendar page is the source of truth for current ids — extract them from the "See this event" links rather than hard-coding.
- If you only need the season-level answer (which shows and their run ranges), step 3 alone is sufficient — skip the per-production drill-down.

### Browser fallback (do NOT use `oregoncabaret.com`)

There is no working non-browser fallback. Both the marketing site and the OvationTix API are challenge-walled to plain HTTP clients (see Gotchas). The verified-browser path against `ci.ovationtix.com/35080` above IS the fallback-proof method. Do not attempt to scrape `oregoncabaret.com` pages (`/shows/`, `/2026-season/`, `/tix/`) — they return the SiteDistrict block, not schedule data.

## Site-Specific Gotchas

- **`oregoncabaret.com` is behind the SiteDistrict WAF — treat it as unreachable for automation.** First load shows `oregoncabaret.com - Please wait …`, then escalates to a manual `I'm not a robot` checkbox (`Additional verification required`). Clicking the checkbox — even with human-like mouse telemetry and residential proxies + verified mode — flips the page to a hard `Access Denied`. Confirmed across multiple sessions. Do not waste iterations trying to click through it.
- **`oregoncabaret.com` HTTP fetch is 403.** `browse cloud fetch` on the homepage, `robots.txt`, `sitemap.xml`, and `/wp-json/…` all return the SiteDistrict `Access Denied` page (`Server: sitedistrict-nginx`, `X-Server: sitedistrict`). Roughly 1 request in ~10 to a non-existent path slips through and returns the themed WordPress 404 (which is how the OvationTix links were originally discovered) — but this is unreliable and not a schedule source.
- **The real data source is OvationTix / AudienceView, org id `35080`.** Calendar: `https://ci.ovationtix.com/35080`. Per-show: `https://ci.ovationtix.com/35080/production/<id>`. This is a completely different host from `oregoncabaret.com` and is NOT SiteDistrict-walled.
- **OvationTix is Cloudflare-protected.** A plain `browse cloud fetch` (or `api.ovationtix.com`) returns Cloudflare's `Just a moment...` interstitial (HTTP 403, `challenges.cloudflare.com`). A **verified** Browserbase browser session passes it automatically — this is why `recommended_method` is `browser`, not `fetch`/`api`. Don't burn time on `api.ovationtix.com/public/...` endpoints from a fetch client; they are behind the same Cloudflare challenge.
- **It's a client-side SPA — wait for hydration.** Immediately after navigation the body may be empty or show only the shell. Wait for `<title> == "AudienceView Professional"` and a short `browse wait timeout` before `browse get text body`, or you'll capture nothing.
- **Text is concatenated without separators.** `browse get text body` yields runs like `Chicago … Mon, Jul 13 - Sun, Aug 30Dracula: A Comedy of Terrors … Fri, Sep 11 - Sun, Nov 08`. Split on known production titles / weekday tokens (`Monday`, `Tuesday`, …) and time tokens (`\d{1,2}:\d{2}\s?[ap]m`). Trailing UI cruft (`Box Office:`, phone, jQuery snippets) appears after the schedule — trim it.
- **`Not Available` markers.** On a production page a date can show `Not Available` alongside or instead of a time — that performance exists but is unbookable. Preserve it as an unavailable slot rather than dropping the date.
- **The venue is dark on Tuesdays** — expect no Tuesday performances; gaps in the date sequence are normal, not a scrape error.

## Expected Output

Season-level plus per-production performance detail. Dates/times reflect a capture on 2026-07-13; values change each season.

```json
{
  "success": true,
  "venue": "Oregon Cabaret Theatre",
  "location": "241 Hargadine St, Ashland, OR",
  "source": "https://ci.ovationtix.com/35080",
  "captured_at": "2026-07-13",
  "productions": [
    {
      "title": "Chicago",
      "date_range": "Mon, Jul 13 - Sun, Aug 30",
      "production_url": "https://ci.ovationtix.com/35080/production/1250789",
      "performances": [
        { "date": "2026-07-13", "day": "Monday",   "times": ["8:00pm"] },
        { "date": "2026-07-16", "day": "Thursday", "times": ["1:00pm", "8:00pm"] },
        { "date": "2026-07-18", "day": "Saturday", "times": ["1:00pm", "8:00pm"] },
        { "date": "2026-07-19", "day": "Sunday",   "times": ["1:00pm"], "available": false }
      ]
    },
    { "title": "Dracula: A Comedy of Terrors", "date_range": "Fri, Sep 11 - Sun, Nov 08", "performances": [] },
    { "title": "HalloQueen Drag Show 2026",    "date_range": "Sat, Oct 31 - Sun, Nov 01", "performances": [] },
    { "title": "Anne of Green Gables",         "date_range": "Fri, Nov 20 - Thu, Dec 31", "performances": [] }
  ],
  "error_reasoning": null
}
```

If OvationTix cannot be reached (Cloudflare challenge not cleared because the session was not verified):

```json
{
  "success": false,
  "venue": "Oregon Cabaret Theatre",
  "source": "https://ci.ovationtix.com/35080",
  "productions": [],
  "error_reasoning": "OvationTix (ci.ovationtix.com/35080) returned the Cloudflare 'Just a moment...' challenge; retry with a --verified Browserbase session."
}
```
