---
name: livescore-com-track-live-scores-txxdp5
title: LiveScore Live Soccer Score Tracker
description: >-
  Track every in-play soccer match on LiveScore via the public JSON API — for
  each live match return competition, home/away teams, current and half-time
  scores, elapsed minute, match phase, kickoff time, and canonical match URL.
  Browser fallback documented for the rare case the API misbehaves.
website: livescore.com
category: sports
tags:
  - sports
  - soccer
  - football
  - live-scores
  - read-only
  - json-api
source: 'browserbase: agent-runtime 2026-05-20'
updated: '2026-05-20'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      Browser fallback: open https://www.livescore.com/en/football/live/ in a
      Browserbase session and text-extract the rendered list. ~50x slower than
      the JSON API because the page is fully JS-rendered with no inline score
      data; use only if the API returns 4xx/5xx (not observed during testing).
verified: true
proxies: true
---
# LiveScore Live Soccer Score Tracker

## Purpose

Track currently-live soccer (football) matches on LiveScore.com — for every match in play right now, return competition, country, home and away teams (name + abbreviation + team ID), current score, half-time score, elapsed-minute string ("34'", "HT", "90+1'"), match phase (1st half / HT / 2nd half / FT / AP), scheduled kickoff time, and the canonical livescore.com match URL. Read-only — never opens or interacts with sportsbook / betting links.

## When to Use

- "What soccer games are live right now?" — pure live-only feed.
- Polling-driven score notifications (cache TTL is 10 s — fine for ≥ 15 s polls).
- Building a multi-match live dashboard (Europa League + domestic leagues + lower divisions surface together).
- As a higher-fidelity supplement to the on-screen UI when you also need per-match incidents (goals, cards, subs) via the per-event scoreboard/incidents endpoints.
- Filtering live results to a specific league, country, or team — the response is already grouped by `Stages[]` (competition).

## Workflow

LiveScore's web UI is a thin client over a public JSON API at `prod-cdn-mev-api.livescore.com`. The endpoint is unauthenticated, no cookies, no CSRF token, no signing, and serves CORS responses keyed to `https://www.livescore.com` — but the server does **not** enforce `Origin` or `Referer` (we verified 200 OK from `browse cloud fetch` with neither header). A residential proxy is **not** required. Lead with the API. The browser path works as a fallback but pays a ~50× cost premium because the live page is JS-rendered (the HTML body served by `/en/football/live/` contains no inline score data — the React app hydrates from the same API call after load).

### Recommended path — direct API

1. **List currently-live soccer matches**:
   ```
   GET https://prod-cdn-mev-api.livescore.com/v1/api/app/live/soccer/{tzOffsetHours}?countryCode={CC}&locale=en
   ```
   - `tzOffsetHours` — integer hour offset from UTC, e.g. `-7` (US Pacific), `0` (UTC), `5`, `+1`. Controls the "today" boundary used by the server when deciding which matches belong to the current calendar day for the caller. For a pure live feed (no boundary effect) any value works; pick the user's local offset for safety.
   - `countryCode` — ISO 3166-1 alpha-2 (e.g. `US`, `GB`, `DE`). Controls TV-channel `allowedCountries` filtering inside the `Media[]` array; does **not** filter which matches appear. Pass the user's country if you care about media broadcast hints, otherwise `US` is a safe default.
   - `locale` — language for team/league display strings (`en`, `es`, `de`, ...). Always include — omitting still returns `en` but the server occasionally returns `Snm`/`Cnm` blank without it.

   Returns:
   ```json
   { "Ts": 1779305661, "Stages": [ { /* competition */ "Events": [ /* matches */ ] } ] }
   ```
   `Ts` is the snapshot epoch in seconds. `Stages` is empty when no soccer match anywhere in the world is currently in play (rare — soccer is essentially 24/7 across the global fixture list; expect ≥ 1 stage during normal hours).

2. **Decode each Stage** (one per competition appearing in the live feed):
   - `Sid` — stage id.
   - `Snm` — display name of the *stage* (e.g. `"Eliteserien"`, `"Final"`, `"Serie B: Promotion: Play-off"`). For tournaments mid-flight, `Snm` may be the round name (`"Final"`, `"Semi-finals"`); the league/cup display name is `Cnm` + `CompN`.
   - `Cnm` / `Csnm` — country display name (e.g. `"Norway"`, `"Saudi Arabia"`, `"Europa League"` for UEFA competitions where `Cnm` doubles as the competition).
   - `Ccd` — country slug used in URLs (`"saudi-arabia"`, `"norway"`, `"europa-league"`, `"north-macedonia"` → note URL uses `"macedonia"` for this one, see gotchas).
   - `Scd` — stage slug used in URLs (`"eliteserien"`, `"premier-league"`, `"saudi-professional-league"`).
   - `CompId` / `CompN` / `CompUrlName` — globally-stable competition id, full competition name, and competition URL slug. Prefer these over `Sid`/`Snm` when grouping/de-duplicating across iterations.
   - `badgeUrl`, `firstColor` — branding hints. Badge full URL: `https://lsm-static-prod.livescore.com/medium/{badgeUrl}`.

3. **Decode each Event** (one per live match):
   - `Eid` — event id (use this for the per-match scoreboard/incidents calls in step 4).
   - `T1[0]` / `T2[0]` — home and away team. Fields: `ID` (team id), `Nm` (display name), `Abr` (3-letter abbrev), `Img` (badge path — full URL: `https://lsm-static-prod.livescore.com/medium/{Img}`), `Fc`/`Sc` (primary/secondary hex color, no `#`).
   - `Tr1` / `Tr2` — current score (string-encoded integers — `"1"`, `"3"`; cast before use).
   - `Trh1` / `Trh2` — half-time score (snapshot when match was at HT; equals `Tr1`/`Tr2` during 1st half).
   - `Tr1OR` / `Tr2OR` — score at end of regulation (90 min). Diverges from `Tr1`/`Tr2` only for matches with extra time / penalties.
   - `Eps` — elapsed period string. `"34'"` mid-half, `"HT"` at half-time, `"90+1'"` injury time, `"FT"` full-time, `"AP"` after penalties. Use this directly for human display.
   - `Esid` — event status id (integer enum, see "Site-Specific Gotchas"). For the `/live/` endpoint expect only `2`/`3`/`10`/`13` (any in-play state). Matches that finish during the response's cache TTL may briefly appear with `Esid=6` (FT).
   - `Epr` — phase: `0` upcoming, `1` in-play, `2` finished. The `/live/` endpoint generally only returns `Epr=1`.
   - `Esd` — scheduled start packed as decimal `YYYYMMDDHHMMSS` in UTC (e.g. `20260520120000` = 2026-05-20 12:00:00 UTC). Parse with a regex split or `String.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/)`.
   - `Etm.ATm` — actual kickoff timestamp in **milliseconds** (epoch). Use this for "match has been running for X minutes" calculations; do not rely on `Eps` for sub-minute precision.
   - `Etm.RTm` — running-time-since-kickoff in milliseconds (server's count, includes added time but not the HT break).
   - `seriesInfo` — present on two-legged ties (e.g. Champions League knockout, Serie B promotion play-offs). Fields: `totalLegs`, `currentLeg`, `aggScoreTeam1`, `aggScoreTeam2`. Surface this when present — agents that only look at `Tr1`/`Tr2` will misreport aggregate context.
   - `Shck` (boolean) — "score has changed since last snapshot" flag. Useful for polling diffs.
   - `Media` — broadcast hints. Sub-keys are provider IDs (`"112"` = TV channels, `"29"` = audio commentary, `"33"` = liveactions widget). Each item has `allowedCountries` / `deniedCountries`.

4. **Per-match deeper detail** (optional, when surfacing one specific match):
   ```
   GET https://prod-cdn-public-api.livescore.com/v1/api/app/scoreboard/soccer/{Eid}?locale=en
   GET https://prod-cdn-public-api.livescore.com/v1/api/app/incidents/soccer/{Eid}?locale=en
   ```
   `scoreboard` returns a single Event object with the same shape as step 3, plus `Venue`, `LuUT` (last-updated timestamp), `Eact` (active-state flags), and `Incs-s` (summarized incidents — goals only). `incidents` returns the full event timeline keyed by team number: `Incs: { "1": [...home incidents...], "2": [...away incidents...] }`. Each incident has `Min` (minute), `Pn` (player display name), `Pnt` (player URL slug), `Aid` (player id), `IT` (incident type, see Gotchas), `Sor` (sort order).

5. **Construct the canonical match URL** when surfacing a result:
   ```
   https://www.livescore.com/en/football/{Ccd}/{Scd}/{slug(T1.Nm)}-vs-{slug(T2.Nm)}/{Eid}/
   ```
   Where `slug(x)` is `x.toLowerCase().replace(/[^a-z0-9]+/g, '-')` (verified against captured URLs — e.g. `Freiburg` → `freiburg`, `Aston Villa` → `aston-villa`, `Al Khaleej` → `al-khaleej`). The `{Eid}/{trailing slash}` is mandatory — omitting either segment 404s.

### Browser fallback

If the API returns 4xx/5xx (we observed no anti-bot blocking during ~5 minutes of testing, but as a contingency):

```bash
sid=$(browse cloud sessions create --keep-alive --proxies --verified \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$sid"

browse open "https://www.livescore.com/en/football/live/" --remote
browse wait load --remote
browse get text --remote
```

The page is fully JS-rendered. `browse snapshot` returns refs but the live-match list is in a virtual-scroller — `browse get text` is the simplest extraction. The DOM exposes per-match elements with class names like `Eh`/`bb`/`db` (auto-generated, may shift between deploys); the text-flow order matches the API's stage → events grouping. Don't waste turns trying to find a stable CSS selector — fall back to regex-splitting the text by stage name. Cost: ~10-30s for the full page render plus extraction parsing, vs. ~0.5s for the API.

## Site-Specific Gotchas

- **`Esid` enum** — integer event-status code. Observed values from production data: `1` = Not Started (NS), `2` = 1st Half (in-play), `3` = 2nd Half (in-play), `6` = Full Time (FT), `10` = Half Time (HT), `13` = After Penalties (AP). The `/live/` endpoint only returns `Esid ∈ {2, 3, 10, 13}` (plus occasionally `6` for matches that finished within the last cache TTL window). Other values likely exist for extra time, postponements, abandonments — not directly observed.
- **`Epr` ≠ `Esid`** — `Epr` is a coarser 3-value phase (`0` upcoming / `1` live / `2` finished). Use `Epr` when you only need live/finished classification; use `Esid` for the specific period.
- **`Tr*` fields are strings, not numbers** — `"Tr1":"1"`, `"Tr2":"3"`. Cast with `parseInt` or `Number()` before arithmetic. Free / 0-0 matches use `"0"`, not the empty string.
- **`Esd` is packed decimal in UTC, not ISO 8601** — `20260520120000` means 2026-05-20T12:00:00Z. Parsing this as a plain integer or naive `Date` constructor (which interprets as local time) silently shifts kickoff times by the local offset. Use an explicit regex parse to `Date.UTC()`.
- **`Etm.ATm` is milliseconds, `Ts` is seconds.** The top-level snapshot timestamp `Ts` is in **seconds**, but inside each event `Etm.ATm` (actual kickoff) and `Etm.RTm` (running time) are in **milliseconds**. Mixing the units in a "match age" calculation produces wildly wrong numbers — always reconcile (`Ts * 1000 - Etm.ATm`).
- **Country-slug ≠ country-name slug for two countries.** `Cnm="North Macedonia"` has `Ccd="macedonia"` (no "north-" prefix in the URL slug). `Cnm="Bosnia and Herzegovina"` typically resolves to `Ccd="bosnia-herzegovina"`. Don't rederive the URL slug from the display name — always pull `Ccd` and `Scd` directly from the API response.
- **`Cnm` doubles as competition for UEFA tournaments.** For Champions League / Europa League / Conference League, `Cnm` is the competition name (`"Europa League"`) and `Snm` is the round (`"Final"`, `"Quarter-finals"`). For domestic leagues, `Cnm` is the country (`"Saudi Arabia"`, `"Italy"`) and `Snm`/`CompN` is the league. If you need a uniform "competition name" field, prefer `CompN` (always set when defined; falls back to `Snm` for non-UEFA cup ties without a `CompN`).
- **Detail URL pattern is `/en/football/{Ccd}/{Scd}/{slug}/{Eid}/`, NOT `/en/football/{Scd}/{slug}/{Eid}/`.** The country segment is mandatory between sport and league. We verified that omitting it (`/en/football/europa-league/freiburg-vs-aston-villa/1746767/`) returns a 404; the correct URL puts the UEFA "country" in: `/en/football/europe/europa-league/freiburg-vs-aston-villa/1746767/`. The trailing slash is also mandatory.
- **Cache TTL = 10 s** (`Cache-Control: max-age=10, public`). Polling faster than every ~10 s wastes calls — the CDN returns the same `X-Cache-Status: HIT` body until TTL expires. Hits are also cached per `(path, tzOffset, countryCode, locale)` tuple — varying `tzOffset` busts the cache uselessly.
- **`/live/soccer/0` and `/live/soccer/-7` return the same matches.** The timezone offset only affects the *date-grouping* boundary, not the live filter. Vary it only when calling the per-day endpoint (`/date/soccer/YYYYMMDD/{tz}`).
- **`Snm` may be the value `"Final"` literally** — not "finished", but "the Final round" (e.g. `Sid=25365 Snm="Final" Cnm="Europa League"` is the actual UEL Final fixture). Don't mistake this for a finished-match flag. Use `Esid` / `Epr` / `Eps` for match status.
- **Two-legged tie aggregate score is in `seriesInfo`, NOT `Tr1`/`Tr2`.** `Tr1`/`Tr2` is always the score of the *current leg only*. Surfacing "Catanzaro 3-1 on aggregate" requires checking `seriesInfo.aggScoreTeam1`/`aggScoreTeam2`. Absent for single-leg matches.
- **`browse get text` on the live page returns a "Your browser is out of date" warning string in the markup** even when the browser is current. It's a noscript-fallback sentence that the React app does not visibly render. Ignore lines matching `/browser is.*out of date/` when text-parsing the fallback.
- **The legacy domain `livescores.com` (with trailing `s`) is referenced in the noscript fallback** for older browsers — it is a separate, much sparser product and **does not** serve the JSON API. Do not redirect there.
- **No `--proxies` or `--verified` needed for the JSON API.** Verified via `browse cloud fetch` (default proxy-less path) returning `statusCode: 200` with full payload, no captcha, no Akamai. The browser fallback may benefit from `--verified` on aggressive polling, but for one-shot reads a bare session is fine.
- **Field `Pids` maps provider IDs to that provider's match ID.** Useful for cross-referencing — e.g. `Pids["8"]` is the LiveScore canonical id (= `Eid`), `Pids["112"]` is the SBTE/sportsbook ID, `Pids["33"]` is the Stats Perform/Opta ID. Most agents only need `Eid`.

## Expected Output

The API returns the full `Stages → Events` tree. The recommended downstream shape (one flat record per live match) is:

```json
{
  "snapshot_ts": 1779305661,
  "matches": [
    {
      "event_id": "1746767",
      "competition": {
        "name": "Europa League",
        "round": "Final",
        "country": "Europa League",
        "country_slug": "europa-league",
        "stage_slug": "final",
        "competition_id": "36",
        "badge_url": "https://lsm-static-prod.livescore.com/medium/europa-league-2024.png"
      },
      "home": { "id": "365",  "name": "Freiburg",    "abbr": "SCF", "badge_url": "https://lsm-static-prod.livescore.com/medium/enet/8358.png" },
      "away": { "id": "3863", "name": "Aston Villa", "abbr": "AVL", "badge_url": "https://lsm-static-prod.livescore.com/medium/teambadge/aston-villa-2024.png" },
      "score":            { "home": 0, "away": 0 },
      "half_time_score":  { "home": 0, "away": 0 },
      "regulation_score": { "home": 0, "away": 0 },
      "aggregate_score":  null,
      "period_label": "34'",
      "period_status": "2nd_half",
      "esid": 2,
      "epr": 1,
      "kickoff_utc": "2026-05-20T12:00:00Z",
      "kickoff_ms": 1779305616262,
      "running_time_ms": 1980000,
      "match_url": "https://www.livescore.com/en/football/europa-league/europa-league/freiburg-vs-aston-villa/1746767/",
      "score_changed_since_last_snapshot": false
    },
    {
      "event_id": "1776155",
      "competition": {
        "name": "Serie B",
        "round": "Promotion Play-offs - Semi-finals",
        "country": "Italy",
        "country_slug": "italy",
        "stage_slug": "serie-b-promotion-play-off",
        "competition_id": "110"
      },
      "home": { "id": "11873", "name": "Palermo",   "abbr": "PAL" },
      "away": { "id": "4073",  "name": "Catanzaro", "abbr": "CAT" },
      "score":            { "home": 1, "away": 0 },
      "half_time_score":  { "home": 1, "away": 0 },
      "regulation_score": { "home": 1, "away": 0 },
      "aggregate_score":  { "home": 1, "away": 3, "current_leg": 2, "total_legs": 2 },
      "period_label": "69'",
      "period_status": "2nd_half",
      "esid": 3,
      "epr": 1,
      "kickoff_utc": "2026-05-20T11:00:00Z",
      "match_url": "https://www.livescore.com/en/football/italy/serie-b-promotion-play-off/palermo-vs-catanzaro/1776155/"
    },
    {
      "event_id": "1777644",
      "competition": { "name": "Serie C", "round": "Promotion Play-offs - 4th Round", "country": "Italy", "country_slug": "italy", "stage_slug": "serie-c-promotion-play-off" },
      "home": { "id": "4042", "name": "Catania", "abbr": "CAT" },
      "away": { "id": "4283", "name": "Lecco",   "abbr": "LEC" },
      "score":            { "home": 2, "away": 2 },
      "half_time_score":  { "home": 2, "away": 2 },
      "aggregate_score":  { "home": 2, "away": 2, "current_leg": 2, "total_legs": 2 },
      "period_label": "HT",
      "period_status": "half_time",
      "esid": 10,
      "epr": 1
    }
  ]
}
```

`period_status` mapping (derive from `esid`):

| `esid` | `period_status` | Description                  |
|--------|-----------------|------------------------------|
| 1      | `not_started`   | Pre-match (only on `/date/`) |
| 2      | `first_half`    | In-play, 1st half            |
| 3      | `second_half`   | In-play, 2nd half            |
| 6      | `full_time`     | Finished after 90 min        |
| 10     | `half_time`     | In the HT break              |
| 13     | `after_penalties` | Finished via shootout      |

If `Stages[]` is empty (no live matches anywhere in the world — extremely rare for soccer, but plausible during the early-morning UTC lull):

```json
{ "snapshot_ts": 1779305661, "matches": [] }
```
