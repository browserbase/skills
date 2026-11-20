---
name: formula1-com-find-f1-schedule-jldxp4
title: F1 Race Weekend Schedule
description: >-
  Retrieve the full session schedule (every practice, qualifying, sprint and the
  race) with track-local start/end times for any Formula 1 Grand Prix on
  formula1.com.
website: formula1.com
category: sports
tags:
  - sports
  - formula-1
  - motorsport
  - schedule
  - racing
source: 'browserbase: agent-runtime 2026-06-28'
updated: '2026-06-28'
recommended_method: fetch
alternative_methods:
  - method: fetch
    rationale: >-
      The race page server-renders the full schedule as structured JSON
      (race.meetingSessions) plus a schema.org JSON-LD subEvent array. A single
      HTTP GET returns track-local times with timezone + gmtOffset — no scripted
      browsing, no timezone guesswork, no cookie wall.
  - method: browser
    rationale: >-
      Works but is strictly worse: a OneTrust cookie modal overlays the page,
      rendered times default to the viewer's 'My time' timezone (must toggle
      'Track time'), and the schedule lives in a non-window scroll container.
      Only use when you cannot run an HTTP fetch.
verified: false
proxies: false
---
# F1 Race Weekend Schedule

## Purpose

Retrieve the complete session schedule for a single Formula 1 Grand Prix from `formula1.com` — every Free Practice, Qualifying, Sprint Qualifying, Sprint and the Race — each with its date, start time, end time, timezone and GMT offset. This is a **read-only** lookup. The recommended path is a plain HTTP `fetch` of the canonical race page, which server-renders the full schedule as structured JSON; no scripted browsing is required.

## When to Use

- A user asks "what time is qualifying / the race / FP1 for the {country} Grand Prix?"
- A user wants the full weekend running order and timings for an upcoming or past race.
- You have an F1 news/article URL (e.g. `.../article/formula-1-lenovo-austrian-grand-prix-2026...`) and need to resolve it to the actual session timetable.
- You need machine-readable session times (with explicit timezone/offset) to build a calendar, countdown, or reminder.

## Workflow

The schedule is embedded twice in the server-rendered HTML of every race page. **Fetch the page once and parse the embedded JSON — do not drive a browser.**

The canonical race page URL is:

```
https://www.formula1.com/en/racing/{year}/{race-slug}
```

1. **Resolve the race slug.** Slugs are country/location based and not always obvious (e.g. Monza → `italy`, Imola → `emilia-romagna`, Abu Dhabi → `united-arab-emirates`, Las Vegas → `las-vegas`, Spielberg/Red Bull Ring → `austria`). To map a race name reliably, fetch the season index and read the `/en/racing/{year}/{slug}` links (each card carries the round number and country name):

   ```bash
   browse cloud fetch "https://www.formula1.com/en/racing/2026" \
     | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const h=(JSON.parse(s).content||"").replace(/\\"/g,String.fromCharCode(34));console.log([...new Set(h.match(/\/en\/racing\/2026\/[a-z0-9-]+/g))].join("\n"));})'
   ```

   If you were handed an article URL instead of a race name, that article page also links directly to its `/en/racing/{year}/{slug}` race page — fetch the article and extract the link.

2. **Fetch the race page** (works bare — HTTP 200, no proxies/verified needed, no anti-bot):

   ```bash
   browse cloud fetch "https://www.formula1.com/en/racing/2026/austria" > /tmp/race.json
   ```

3. **Parse the embedded `race.meetingSessions` array** — this is the preferred source because it gives **track-local** times directly plus an explicit `timezone` and `gmtOffset` (no UTC conversion needed):

   ```bash
   node -e '
   const fs=require("fs");
   const html=JSON.parse(fs.readFileSync("/tmp/race.json","utf8")).content
     .replace(/\\"/g,String.fromCharCode(34)).replace(/\\\\/g,String.fromCharCode(92));
   const i=html.indexOf("\"meetingSessions\":[");
   const start=html.indexOf("[",i); let d=0,end=-1;
   for(let k=start;k<html.length;k++){const c=html[k];if(c==="[")d++;else if(c==="]"){d--;if(!d){end=k;break;}}}
   const arr=JSON.parse(html.slice(start,end+1));
   for(const x of arr) console.log(x.shortName, x.description, x.startTime, x.gmtOffset, x.timezone, x.state);
   '
   ```

   Each item has: `session`, `shortName` (FP1/FP2/FP3/Sprint Q/Sprint/Qualifying/Race), `description`, `startTime`, `endTime` (both track-local, no offset suffix), `gmtOffset` (e.g. `+02:00`), `timezone` (IANA, e.g. `Europe/Vienna`), `state` (`upcoming`/`completed`), and `sessionType`. Compose an ISO-8601 instant by appending `gmtOffset` to `startTime`/`endTime`.

   Race-level metadata (also in the HTML) gives the official name and location: `meetingOfficialName`, `meetingName`, `meetingLocation`, `meetingCountryCode`, `meetingStartDate`.

4. **Return all sessions.** A conventional weekend has 5 (FP1, FP2, FP3, Qualifying, Race); a Sprint weekend has 5 with a different mix (FP1, Sprint Q, Sprint, Qualifying, Race — only one practice).

### Browser fallback

Only if you cannot run an HTTP fetch. Open `https://www.formula1.com/en/racing/{year}/{slug}` in a stealth-capable session, then:

1. Dismiss the **OneTrust cookie consent modal** — it renders inside an `iframe`, so a top-level `getElementById('onetrust-accept-btn-handler')` will **not** find it. Either click the button inside the iframe via a frame-aware click, or remove the overlay nodes (`[id*=onetrust]`, `[class*=ot-sdk]`, the consent `iframe`) before interacting.
2. Click the **"Track time"** toggle (top-right of the schedule block). By default the page shows **"My time"** — the *viewer's* timezone — so without toggling you'll capture the wrong times. The remote browser's clock is typically UTC, so "My time" shows times 2h off from track-local.
3. The schedule list sits in a scroll container ~`y=910px`; `window.scrollTo(0, 815)` brings it into the viewport for a clean screenshot/extraction.

Even in the browser, prefer reading the embedded JSON (`browse get text body` exposes the JSON-LD; the SSR HTML still contains `meetingSessions`) over scraping the rendered DOM rows.

## Site-Specific Gotchas

- **The race page only lists the main F1 sessions.** Supporting-series timings (F2, F3, Porsche Supercup) are **NOT** on the F1.com race page — the page merely links out to `fiaformula2.com` / `fiaformula3.com`. If a user explicitly needs support-race times, state that F1.com does not publish them and point to those external sites. Don't hunt for an F2/F3 session array in the payload — it isn't there.
- **Two embedded data sources, different timezones.** `race.meetingSessions` gives **track-local** `startTime`/`endTime` + `gmtOffset` + IANA `timezone`. The schema.org JSON-LD `subEvent[]` (under `@type:"SportsEvent"`) gives `startDate`/`endDate` in **UTC** (`...Z`) and needs converting. Prefer `meetingSessions` to avoid conversion bugs.
- **`sessionType` is mislabeled on Sprint weekends.** The field is offset by one: "Sprint Q" carries `sessionType:"Sprint Shootout"` and "Sprint" carries `sessionType:"Sprint Qualifying"`. Trust `shortName`/`description`, not `sessionType`.
- **"My time" vs "Track time" toggle** (browser path only). Rendered times default to the viewer's timezone. Confirmed: with a UTC browser, Practice 1 shows `04:30` under "My time" but the true track-local time is `13:30` (Europe/Vienna). The embedded JSON is always track-local — another reason to prefer fetch.
- **Slugs are not the GP common name.** Use the season index (`/en/racing/{year}`) to map a race to its slug; don't guess (Monza→`italy`, Imola→`emilia-romagna`, Abu Dhabi→`united-arab-emirates`, Barcelona→`barcelona-catalunya`). Pre-season tests appear as `pre-season-testing-1/-2`.
- **No anti-bot.** `browse cloud fetch` returns HTTP 200 on the homepage, season index, and race pages **without** `--proxies` or `--verified`. The site is a Next.js/CloudFront app (`s-maxage=60` edge cache). Stealth flags are unnecessary for this read-only task.
- **`state` reflects completion.** Past sessions show `state:"completed"`, future ones `state:"upcoming"` — useful for "what's next" queries.

## Expected Output

Conventional weekend (5 sessions). Times are track-local; `gmtOffset` appended to form an absolute instant:

```json
{
  "success": true,
  "race_name": "FORMULA 1 LENOVO AUSTRIAN GRAND PRIX 2026",
  "circuit_location": "Spielberg",
  "country_code": "AUT",
  "timezone": "Europe/Vienna",
  "gmt_offset": "+02:00",
  "sessions": [
    { "short_name": "FP1",        "description": "Practice 1",  "type": "Practice",   "start": "2026-06-26T13:30:00+02:00", "end": "2026-06-26T14:30:00+02:00", "state": "completed" },
    { "short_name": "FP2",        "description": "Practice 2",  "type": "Practice",   "start": "2026-06-26T17:00:00+02:00", "end": "2026-06-26T18:00:00+02:00", "state": "completed" },
    { "short_name": "FP3",        "description": "Practice 3",  "type": "Practice",   "start": "2026-06-27T12:30:00+02:00", "end": "2026-06-27T13:30:00+02:00", "state": "completed" },
    { "short_name": "Qualifying", "description": "Qualifying",  "type": "Qualifying", "start": "2026-06-27T16:00:00+02:00", "end": "2026-06-27T17:00:00+02:00", "state": "completed" },
    { "short_name": "Race",       "description": "Race",        "type": "Race",       "start": "2026-06-28T15:00:00+02:00", "end": null,                          "state": "completed" }
  ]
}
```

Sprint weekend (e.g. China, Miami) — same shape, different session set (single practice, plus Sprint Qualifying + Sprint):

```json
{
  "success": true,
  "race_name": "FORMULA 1 ... CHINESE GRAND PRIX 2026",
  "circuit_location": "Shanghai",
  "timezone": "Asia/Shanghai",
  "gmt_offset": "+08:00",
  "sessions": [
    { "short_name": "FP1",        "description": "Practice 1",        "type": "Practice",   "start": "2026-03-13T11:30:00+08:00", "end": "2026-03-13T12:30:00+08:00" },
    { "short_name": "Sprint Q",   "description": "Sprint Qualifying", "type": "Sprint",     "start": "2026-03-13T15:30:00+08:00", "end": "2026-03-13T16:14:00+08:00" },
    { "short_name": "Sprint",     "description": "Sprint",            "type": "Sprint",     "start": "2026-03-14T11:00:00+08:00", "end": "2026-03-14T12:00:00+08:00" },
    { "short_name": "Qualifying", "description": "Qualifying",        "type": "Qualifying", "start": "2026-03-14T15:00:00+08:00", "end": "2026-03-14T16:00:00+08:00" },
    { "short_name": "Race",       "description": "Race",              "type": "Race",       "start": "2026-03-15T15:00:00+08:00", "end": null }
  ]
}
```

Failure (slug not found / no schedule published yet):

```json
{
  "success": false,
  "race_name": null,
  "sessions": [],
  "error_reasoning": "No /en/racing/{year}/{slug} match for the requested race, or the page carries no race.meetingSessions array (schedule not yet published)."
}
```
