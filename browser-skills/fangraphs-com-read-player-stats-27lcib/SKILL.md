---
name: fangraphs-com-read-player-stats-27lcib
title: FanGraphs Read Player Stats
description: >-
  Look up a baseball player on FanGraphs by name (or ID) and return per-season +
  career stats — standard counting plus sabermetric (wRC+, WAR, FIP, xFIP, K%,
  BB%, ISO, wOBA, xwOBA). Works for batters, pitchers, and two-way players.
  Read-only.
website: fangraphs.com
category: sports
tags:
  - baseball
  - sabermetrics
  - stats
  - fangraphs
  - mlb
  - read-only
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      When the JSON API is unavailable, the SSR'd
      /players/{slug}/{id}/stats/{batting|pitching} page has the standard-stats
      table inline. Costs ~25× the API path because the SSR'd HTML is ~1 MB and
      `browse get text body` flattens all stat tabs into one delimiter-free
      string — must use `browse get html body` and parse the <table> DOM.
  - method: hybrid
    rationale: >-
      Use `browse cloud search 'fangraphs {name}'` (Browserbase Search API) to
      resolve a name to (slug, playerid, position), then call the JSON API.
      FanGraphs has no public name-search JSON endpoint; this hybrid is the
      cheapest reliable name→stats path.
verified: false
proxies: true
---
# FanGraphs Read Player Stats

## Purpose

Given a baseball player's name (or a FanGraphs player ID), return their full FanGraphs statline — standard counting stats plus the full FanGraphs sabermetric block (wRC+, WAR, FIP, xFIP, K%, BB%, ISO, wOBA, xwOBA, etc.) — broken out per MLB regular season and as a career total. Works for batters, pitchers, and two-way players (Ohtani). Read-only — never edits, never submits forms.

## When to Use

- "Pull Aaron Judge's career stats from FanGraphs."
- A scouting / fantasy / podcast prep workflow that needs FanGraphs-flavored stats (specifically wRC+ / FIP / WAR, which Baseball-Reference and ESPN compute differently).
- Bulk extraction for a roster (loop over names, hit one API call per player).
- Anywhere you'd otherwise scrape `https://www.fangraphs.com/players/{slug}/{id}/stats/{batting|pitching}` HTML — the JSON API is faster, smaller, structurally exact, and avoids the multi-MB SSR'd Next.js page.

## Workflow

FanGraphs' public Next.js player page is a thin client over a JSON API at `https://www.fangraphs.com/api/players/stats?playerid={id}&position={pos}` — no auth, no cookies, no anti-bot, served behind Cloudflare with a `public, s-maxage=3600` cache. One call returns the full `playerInfo`, `teamInfo`, `data` (per-season + career + projection rows), `fielding`, and `fsr` blocks. **Lead with the API.** The browser path also works (the SSR'd HTML contains the rendered tables inline) but pays a ~25× cost premium because a single `browse get text body` on `/stats/batting` returns ~360 KB of tab-flattened text with all stat numbers smushed together without column delimiters — deterministic parsing requires HTML scraping or DOM eval, not text extraction.

1. **Resolve `(playerid, position)` from the player's name.** FanGraphs has no public name→ID lookup API (the in-page autocomplete uses an internal endpoint not exposed via clean GET). Use `browse cloud search` (Browserbase Search API) — it returns the canonical FanGraphs URL with both fields embedded in the path + query string:

   ```bash
   browse cloud search "fangraphs aaron judge"
   # → results[0].url = "https://www.fangraphs.com/players/aaron-judge/15640/dashboard?position=OF"
   ```

   Parse the URL with the regex `fangraphs\.com/players/([^/]+)/(\d+)/?[^?]*\??(.*)` → slug, playerid, query-string. The `position=` query param is included on most result URLs; if absent, infer from the result `title` ("…Stats - Pitching…" → `P`, "…Stats - Batting…" or no qualifier → use `OF` as a safe default for hitters). For two-way players (Ohtani, playerid 19755), the search will surface both `position=DH` (or `OF`) and `position=pitcher` URLs — pick the one matching the user's intent or fetch both.

2. **Fetch the stats JSON**:

   ```
   GET https://www.fangraphs.com/api/players/stats?playerid={id}&position={pos}
   ```

   `playerid` is required. `position` is also required — omitting it returns 404; supplying a wrong value returns 200 with an empty `data: []`. Valid values include `OF`, `1B`, `2B`, `3B`, `SS`, `C`, `DH`, `P` (and `pitcher` is also accepted by some endpoints). The response is ~150–200 KB JSON; safe to `browse cloud fetch` without the proxy flag. Cloudflare `s-maxage=3600` means a cold-miss costs ~80 ms upstream, cache hits ~17 ms.

3. **Decode `playerInfo`**. Top-level dict with 45 fields. The ones you usually want:
   - `firstLastName` — display name
   - `PlayerId` — numeric FanGraphs ID (also `UPId` as string)
   - `MLBAMId` — for cross-referencing with MLB Stats API / Baseball Savant
   - `Position`, `Bats`, `Throws`, `HeightDisplay` (e.g. `"6'7\""`), `Weight`, `BirthDate`, `Debut`, `Age`, `College`
   - `BaseballLevel` — JSON string of levels with data (e.g. `'["proj","minor","mlb"]'`)
   - `minSeason`, `maxSeason` — career span
   - `urlHeadshot`, `UPURL` — assets / canonical URL

4. **Decode `data[]`**. Array of per-row stat lines. Each row carries a `sortType` that tells you what kind of row it is. **This is the critical decode step** — without it you'll mix postseason / projections / league-average rows into the player's actual MLB regular season output:

   | `sortType` | Meaning | Filter to use |
   |---|---|---|
   | `0` | MLB regular season for that year | `AbbLevel=='MLB' && sortType==0` |
   | `900` | MLB postseason for that year | skip unless explicitly requested |
   | `1000` | League average for the year (`ateam='Average'`) | skip |
   | `-1`, `-2` | Career totals (`Season='Total'`, `aseason=0`) | use for the career line |
   | `-49` | Combined MiLB year (`AbbLevel='MiLB'`) | skip unless minors requested |
   | `-50`/`-51`/`-52`/`-53` | AAA / AA / A+ / A breakdown | skip unless minors requested |
   | `-103` … `-200` | Projection systems (`AbbLevel='PROJ'`: Steamer, ZiPS, ATC, THE BAT, OOPSY, FGDC) | skip for actuals |
   | `1100` … `1113` | Rest-of-season projections (`AbbLevel='ROS'`) | skip for actuals |

   **Career-to-date row**: filter on `Season=='Total'` AND `AbbLevel=='MLB'` AND `aseason==0`. Confirm there's exactly one such row before using it.

5. **`Season` field is sometimes wrapped in HTML**. The Season cell for MLB regular-season rows can come through as `"<a href=\"http://www.fangraphs.com/leaders.aspx?...\">2024</a>"`. Strip with the regex `>([^<]+)<` or fall back to `aseason` (an integer that's always the clean year). Same caveat applies to `Team` — prefer `ateam` (e.g. `"Yankees"`) or `AbbName` (e.g. `"NYY"`) which are always plain strings.

6. **Pick batter vs pitcher columns based on what's in the row**, not on `playerInfo.Position`. A two-way player like Ohtani returns 9 batter rows when called with `position=DH` and 7 pitcher rows when called with `position=P` — `playerInfo.Position` is always `"DH"` for him regardless of which set you fetched. Probe `'IP' in row && 'ERA' in row` for pitcher, `'PA' in row && 'AVG' in row` for batter.

   **Batter columns of interest**: `G, PA, AB, H, 1B, 2B, 3B, HR, R, RBI, BB, IBB, SO, HBP, SB, CS, AVG, OBP, SLG, OPS, ISO, BABIP, BB%, K%, wOBA, xwOBA, wRC+, BsR, Off, Def, WAR`. Rate stats (`BB%`, `K%`, `LD%`, etc.) come back as decimal fractions (e.g. `0.186` → multiply by 100 for the display "18.6%").

   **Pitcher columns of interest**: `W, L, G, GS, IP, SO, BB, H, HR, ER, ERA, FIP, xFIP, WHIP, K/9, BB/9, HR/9, K%, BB%, K-BB%, LOB%, BABIP, GB%, FB%, HR/FB, ERA-, FIP-, WAR`. `IP` is reported as a decimal (e.g. `117.1` = 117⅓ innings — the `.1` and `.2` decimals are baseball-conventional thirds, NOT real decimals; do not arithmetic on them as floats).

7. **Construct the canonical browser URL** (for citation / linkback): `https://www.fangraphs.com/players/{slug}/{playerid}/stats/{batting|pitching}` where `slug` is from step 1. The `/stats` leaf without `/batting` or `/pitching` returns a 308 redirect to `/stats/batting`; `/players/{slug}/{id}` (no `/stats`) returns 404.

### Browser fallback

When the API is for some reason unreachable, navigate directly with a remote Browserbase session:

```bash
sid=$(browse cloud sessions create --keep-alive --proxies | jq -r .id)  # jq not available; use node parse
browse open --remote --session "$sid" "https://www.fangraphs.com/players/{slug}/{id}/stats/batting"
browse wait load --remote --session "$sid"
browse wait timeout 3000 --remote --session "$sid"   # tables render progressively
browse get html body --remote --session "$sid"        # use HTML, NOT text — text is unparseable (see gotcha)
```

Then parse the `<table>` with id `LeaderBoard1_dg1_ctl00` (Standard tab) — its `<tbody><tr>` rows mirror the API's `data[]` array. Note this path costs ~30× the API path in turns and wall time; only use when verifying API output or when the API is rate-limited (no verified rate-limit observed in this study).

## Site-Specific Gotchas

- **Two required query params on the stats API.** `playerid` AND `position` must both be present, else 404. Omitting `position` returns `{"Message":"No HTTP resource was found..."}` (ASP.NET catch-all) — *not* a 400. A wrong position value returns 200 OK with `data: []` and the player's true position visible in `playerInfo.Position` — branch on row count, not just status.
- **`/api/players/search/...` is NOT the search API.** It returns 404. There is no clean public name→ID JSON endpoint on FanGraphs; the in-page header autocomplete is an internal route that did not respond to standard probe patterns (`/api/autocomplete`, `/api/quicksearch`, `/api/menu/menu-bar/search`, `/api/players/list`, `/_next/data/{buildId}/search.json` — all 404 or generic ASP.NET error HTML). **Use `browse cloud search "fangraphs {name}"` (Browserbase Search API) instead** — it returns the canonical FanGraphs URL with playerid + position already in the path. Verified for "Aaron Judge", "Gerrit Cole", "Shohei Ohtani".
- **`data[]` is a mixed bag** — MLB regular season, MLB postseason, league average, minor leagues (broken down by AAA/AA/A+/A), combined MiLB, several pre-season projection systems, and rest-of-season projections all live in one array. **You MUST filter by `sortType` AND `AbbLevel`**. Naïvely iterating `data[]` will give you a player line that includes their A-ball 2014 season, last year's postseason, and a Steamer projection for next year.
- **`Season` and `Team` cells are sometimes raw HTML strings** wrapping `<a href="...">{year}</a>`. The HTML tag IS in the JSON value, not stripped server-side. Strip with `>([^<]+)<` or use the sidecar fields `aseason` (integer year) and `ateam` / `AbbName` (plain string team name).
- **The career-totals row's `Season` is `"Total"`** (also wrapped in HTML — `"<a href=\"...\">Total</a>"`), `aseason=0`, `sortType=-1` (or sometimes `-2`). It carries `AbbLevel='MLB'` so it survives the MLB filter. Be explicit: keep the row when `aseason==0 && AbbLevel=='MLB'` or when `Season strip-to-text == 'Total'`.
- **Rate stats are decimals, not percentages.** `BB%`, `K%`, `LD%`, `GB%`, `Z-Swing%`, etc. are returned as `0.186` not `18.6`. Multiply by 100 for display. AVG/OBP/SLG/wOBA are already in the 3-decimal-place baseball convention (e.g. `0.322`).
- **`IP` (innings pitched) uses the dot-thirds convention**: `117.1` means 117⅓ IP, `117.2` means 117⅔. Do NOT do float arithmetic on `IP` — converting to outs first (`floor(IP)*3 + round((IP-floor(IP))*10)` outs) is the correct way to aggregate.
- **The position query param is a "view filter," not a position assignment.** Calling Ohtani (declared `Position='DH'`) with `position=P` returns his pitching career (7 rows); with `position=DH` / `OF` / anything else returns his batting career (9 rows). For two-way players, you may want to fetch both and combine.
- **The legacy `/legacy/players.aspx?lastname=X` page returns 200 with the site chrome but no embedded search results** (the lastname filter appears non-functional in 2026; the page is just the navigation skeleton). Do not rely on it for name→ID resolution.
- **Player page URL shape strictness**: `/players/{slug}/{id}/stats` → 308 to `/stats/batting`. `/players/{slug}/{id}` (no `/stats`) → 404. `/players/{slug}/{id}/stats/batting` and `.../stats/pitching` are the only stable read paths. The slug must match what FanGraphs canonicalizes (`aaron-judge`, not `ajudge`); when in doubt the slug from `browse cloud search` is the source of truth.
- **No anti-bot, no auth, no rate limit observed.** Bare `curl` returns 200 over HTTPS; no Akamai/PerimeterX/captcha. The API responds in <100 ms cold-miss, <20 ms cached. **Residential proxy is not required**; the browser flag set in this skill's session config uses `--proxies` defensively but the API path bypasses session creation entirely.
- **`browse get text body` returns ~360 KB of flattened, unparseable text.** All of the page's tab content (Standard, Advanced, Statcast, Bat Tracking, Plate Discipline, Pitch Values, Fielding, Splits, Value, etc.) is concatenated into one stream with no column delimiters between numbers. E.g. a row appears as `2024NYYMLB32158704581221441018.9%24.3%.379.367.322.458.701.476.481220-0.596.0-9.611.3` — there is no deterministic way to tell where `G` ends and `PA` begins from text alone. If you must scrape the page, use `browse get html body` and parse the `<table>` structure. **The API is the only sane path.**

## Expected Output

Two shapes, distinguished by the position filter used to fetch the data.

### Batter

```json
{
  "success": true,
  "player": {
    "name": "Aaron Judge",
    "fangraphsId": "15640",
    "mlbamId": 592450,
    "position": "OF",
    "team": "NYY",
    "bats": "R",
    "throws": "R",
    "debut": "2016-08-13",
    "birthDate": "1992-04-26",
    "heightDisplay": "6'7\"",
    "weight": 282
  },
  "seasons": [
    {
      "season": 2024, "team": "Yankees",
      "G": 158, "PA": 704, "AB": 559, "H": 180, "HR": 58, "R": 122, "RBI": 144, "SB": 10,
      "BB%": 18.9, "K%": 24.3, "AVG": 0.322, "OBP": 0.458, "SLG": 0.701, "OPS": 1.159,
      "ISO": 0.379, "wOBA": 0.476, "xwOBA": 0.481, "wRC+": 220, "WAR": 11.3
    }
  ],
  "career": {
    "season": "Total", "team": "- - -",
    "G": 1193, "PA": 5215, "AB": 4278, "H": 1251, "HR": 384, "R": 912, "RBI": 860, "SB": 70,
    "BB%": 16.4, "K%": 27.4, "AVG": 0.292, "OBP": 0.412, "SLG": 0.614, "OPS": 1.027,
    "ISO": 0.322, "wOBA": 0.425, "xwOBA": 0.440, "wRC+": 177, "WAR": 63.9
  }
}
```

### Pitcher

```json
{
  "success": true,
  "player": {
    "name": "Gerrit Cole",
    "fangraphsId": "13125",
    "mlbamId": 543037,
    "position": "P",
    "team": "NYY",
    "bats": "R",
    "throws": "R",
    "debut": "2013-06-11",
    "birthDate": "1990-09-08"
  },
  "seasons": [
    {
      "season": 2013, "team": "Pirates",
      "W": 10, "L": 7, "G": 19, "GS": 19, "IP": 117.1,
      "SO": 100, "BB": 28, "H": 109, "HR": 7,
      "ERA": 3.22, "FIP": 2.91, "xFIP": 3.14, "WHIP": 1.17,
      "K/9": 7.7, "BB/9": 2.1, "WAR": 2.4
    }
  ],
  "career": { "season": "Total", "W": 153, "L": 79, "IP": 1900.0, "SO": 2200, "ERA": 3.10, "FIP": 2.95, "WAR": 47.0 }
}
```

### Not-found / error

```json
// Player name didn't surface a FanGraphs URL in the search
{ "success": false, "reason": "not_found", "name": "Bob Made-Up Player" }

// Stats API returned 404 or empty data[]
{ "success": false, "reason": "no_mlb_data", "name": "Aaron Judge", "fangraphsId": "15640", "queriedPosition": "P" }
```
