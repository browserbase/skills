---
name: fotmob-com-find-stats-y2yyf7
title: FotMob Match & Player Stats
description: >-
  Find a football match on FotMob and extract team match stats, per-player stats
  within that match, and a player's general (season/career) stats. Read-only.
website: fotmob.com
category: sports
tags:
  - sports
  - football
  - soccer
  - stats
  - fotmob
  - read-only
source: 'browserbase: agent-runtime 2026-06-07'
updated: '2026-06-07'
recommended_method: hybrid
alternative_methods:
  - method: fetch
    rationale: >-
      The search API (apigw.fotmob.com/searchapi/suggest) and player pages
      (/players/{id}) are reliably server-rendered with full JSON — fetch +
      parse __NEXT_DATA__ needs no browser. Match pages embed full stats in
      __NEXT_DATA__ only for pre-rendered (popular/recent) matches; deferred
      matches return an empty shell.
  - method: browser
    rationale: >-
      Universal fallback for match stats: drive a session to the match page, let
      the app generate the x-mas-signed matchDetails XHR, and read the rendered
      body text. Works for every match regardless of pre-render state.
  - method: api
    rationale: >-
      apigw.fotmob.com/matchDetails and /playerData return 404 without the
      client-generated x-mas header — not usable directly. Confirmed dead end.
verified: false
proxies: false
---
# FotMob Match & Player Stats

## Purpose

Given a free-text query (team / fixture / player name), find a specific football match on FotMob and return:
- **Team match stats** — possession, expected goals (xG), shots, passes, defence, duels, discipline, etc., as home/away pairs.
- **Per-player match stats** — every player's rating, minutes, goals/assists, passing, duels, physical metrics, plus shotmap, for that single match.
- **Player general stats** — a player's current-season league summary and full per-season/per-competition breakdown, recent matches, career history, traits and bio.

Read-only. Never follows, subscribes, or posts. The fast path uses FotMob's public search API and server-rendered page data (no auth, no anti-bot); a browser fallback covers the minority of match pages that defer their data to a client-side, token-signed request.

## When to Use

- "What were the match stats for {home} vs {away}?" — possession, xG, shots, cards.
- "How did {player} play in {match}?" — single-match player rating and stat line.
- "Give me {player}'s season numbers" — appearances, goals, assists, rating per competition.
- Bulk/automated harvesting of match or player statistics where you'd otherwise scrape FotMob HTML.

## Workflow

FotMob serves no anti-bot challenge on these surfaces — a **bare** cloud session (no `--verified`, no `--proxies`) and plain HTTP fetches both work. The recommended path is **hybrid**: pull search results and player data with cheap `fetch` calls, and pull match stats from the match page's embedded JSON, dropping to a browser only when a given match page ships an empty shell.

### Step 1 — Find the match (and player IDs) via the search API

```
GET https://apigw.fotmob.com/searchapi/suggest?term=<url-encoded query>&lang=en
```

Returns JSON (no headers/auth needed; CORS-open). Read:
- `matchSuggest[].options[].payload` → `id` (the numeric **matchId**), `homeName`, `awayName`, `leagueName`, `leagueId`, `matchDate`, `homeScore`, `awayScore`, `statusId`.
- `teamSuggest[].options[].payload` → team `id` + `name`.
- `squadMemberSuggest[].options[].payload` → player `id` + `name` + `teamName` (use this to resolve a player by name).

Pick the matchId you want. A two-word `term` (e.g. `arsenal paris`) narrows multi-fixture rivalries; a bare team name returns that team's recent/upcoming matches.

### Step 2 — Get match stats + per-player match stats from the match page

Resolve the canonical URL — `https://www.fotmob.com/match/<matchId>` issues a **308** redirect whose `Location` is `https://www.fotmob.com/matches/<slug>/<code>`. Fetch that canonical URL and parse the `<script id="__NEXT_DATA__" type="application/json">` blob:

- **Match metadata**: `props.pageProps.general` → `matchId`, `matchName`, `leagueName`, `homeTeam`, `awayTeam`, `finished`, `matchTimeUTC`.
- **Team match stats**: `props.pageProps.content.stats.Periods.All.stats[]` — an array of groups (`Top stats`, `Shots`, `Expected goals (xG)`, `Physical performance`, `Passes`, `Defence`, `Duels`, `Discipline`). Each group has `stats[]`, and each entry is `{ title, key, stats: [home, away], format, type }`. (`Periods` also has `FirstHalf`, `SecondHalf`, `FirstExtraHalf`, `SecondExtraHalf`.)
- **Per-player match stats**: `props.pageProps.content.playerStats` is an **object keyed by playerId**. Each value is `{ name, id, optaId, teamId, teamName, isGoalkeeper, shirtNumber, usualPosition, stats: [groups...], shotmap: [...] }`. Each stat group's `stats` is an object keyed by label → `{ key, stat: { value, total?, type } }` (e.g. `Top stats → "FotMob rating" → {value: 7.26}`, `"Accurate passes" → {value: 88, total: 95}`). **Players who did not play have `stats: []`** — skip them.
- Also available: `content.lineup`, `content.shotmap`, `content.momentum`, `content.h2h`, `content.matchFacts`.

**Pre-render caveat (important):** match `__NEXT_DATA__` carries `content` only for **pre-rendered** matches (popular/recent fixtures). For deferred matches the blob is just `{ fetchingLeagueData: true, fallback: {...}, translations: {...} }` with **no `general`/`content`** — the app loads the data client-side. Detect this (missing `props.pageProps.content`) and switch to the **Browser fallback** below.

### Step 3 — Get the player's general (season/career) stats from the player page

```
GET https://www.fotmob.com/players/<playerId>
```

Always server-rendered (200, no redirect). Parse `__NEXT_DATA__` `props.pageProps.data`:
- `mainLeague` → `{ leagueId, leagueName, season, stats: [{ title, value }] }` — current-season summary (Matches, Started, Goals, Assists, Minutes played, Rating, cards).
- `statSeasons[]` → per season, `tournaments[]` with `{ name, tournamentId, entryId, hasDeepStats }`.
- `playerInformation[]` → height, shirt, age, preferred foot, country, market value.
- `primaryTeam`, `recentMatches[]` (each carries that match's `matchId`, `minutesPlayed`, `goals`, `assists`, `rating`), `careerHistory`, `trophies`, `marketValues`, `traits`.

`recentMatches[]` is a handy shortcut: a player's recent single-match stat lines are already on the player page, so you can often skip Step 2 when you only need a player's line for a recent match.

### Browser fallback (universal — required for deferred match pages)

When a match page's `__NEXT_DATA__` has no `content`:

1. Create a **bare** session: `browse cloud sessions create --keep-alive` (no stealth/proxies).
2. `browse open "https://www.fotmob.com/match/<matchId>"` — let it follow the redirect.
3. `browse wait timeout 3000` — the app fetches `matchDetails` (with its client-generated `x-mas` header) and hydrates.
4. `browse get text body` — the rendered text reliably contains the full stat tables (possession, xG, shots…) and the per-player ratings table for both teams, regardless of pre-render state. Parse the labelled values from it. (You can also re-read `browse get text script#__NEXT_DATA__`, which may now be populated.)
5. For the player page, the same `browse open https://www.fotmob.com/players/<id>` + `browse get text body` works, but Step 3's plain fetch is normally sufficient.

Do **not** use `browse snapshot`/`click` to read stats — FotMob is heavily JS-driven and snapshot returns empty/error. Navigate by URL and read body text or `__NEXT_DATA__`.

## Site-Specific Gotchas

- **No anti-bot on these surfaces.** Bare session + plain fetch both succeed; the pre-run probe and live runs needed neither `--verified` nor `--proxies`. Don't add stealth/proxies — they only slow it down.
- **`apigw.fotmob.com/matchDetails` and `/playerData` are a dead end without the `x-mas` header.** Both return **404** when called directly (the token is generated by FotMob's obfuscated client JS per request). Confirmed across multiple attempts. Use page-embedded `__NEXT_DATA__` (or the rendered body in a browser, which generates `x-mas` for you) instead — do not waste time trying to forge `x-mas`.
- **Old `www.fotmob.com/api/...` paths are gone.** `www.fotmob.com/api/matches`, `/api/searchapi/...` etc. now 404 (handled by the Next.js app, not the API). The live API host is `apigw.fotmob.com`; only `searchapi/suggest` (and `searchapi/search`) are usable unauthenticated.
- **Match `__NEXT_DATA__` is populated only for pre-rendered matches.** Verified live: the CL final (`/matches/arsenal-vs-paris-saint-germain/377nyb`, matchId 5205834) returns 8 stat groups + 46 players; the semifinal (`/matches/paris-saint-germain-vs-arsenal/3775bz`, 4737577) returns an empty shell (`fetchingLeagueData: true`, no `content`). Always check for `props.pageProps.content` before parsing; fall back to the browser otherwise.
- **`/match/<id>` is a 308 redirect, not the page.** A plain fetcher that doesn't follow redirects gets a 54-byte body whose payload IS the canonical path (`/matches/<slug>/<code>`). Either follow the redirect or read that `Location` and fetch the canonical URL.
- **`playerStats` is keyed by playerId, not an array**, and bench players who didn't appear have `stats: []`. Resolve your target player by `name`/`id` and skip empty stat lines.
- **Stat values are positional `[home, away]` pairs** under `content.stats.Periods.All.stats[].stats[].stats`. Map `home`/`away` using `general.homeTeam`/`general.awayTeam`. `xG` values come as strings (`"1.72"`), most others as integers.
- **Search ranking ≠ relevance you want.** `matchSuggest` may surface a related fixture (e.g. the semifinal before the final). Disambiguate using `payload.matchDate`, `leagueName`, and `homeScore`/`awayScore` before committing to a matchId.
- **In a browser, navigate by URL — never rely on `browse snapshot`/`click`.** FotMob is fully client-rendered; the accessibility snapshot is empty/unreliable. Tabs (Stats, Lineup) can be reached by clicking the tab via `browse eval` if a screenshot of a specific view is needed, but data extraction should use `browse get text body` / `__NEXT_DATA__`.

## Expected Output

```json
{
  "success": true,
  "matchId": "5205834",
  "matchName": "Paris Saint-Germain vs Arsenal",
  "league": "Champions League",
  "matchDate": "2026-05-30T16:00:00Z",
  "home": "Paris Saint-Germain",
  "away": "Arsenal",
  "matchStats": {
    "Ball possession": [75, 25],
    "Expected goals (xG)": [1.72, 0.51],
    "Total shots": [21, 7],
    "Shots on target": [4, 1],
    "Touches in opposition box": [42, 16],
    "Big chances": [3, 1],
    "Accurate passes": [809, 196],
    "Corners": [11, 3],
    "Fouls committed": [11, 17],
    "Yellow cards": [2, 4]
  },
  "player": {
    "id": 267365,
    "name": "Marquinhos",
    "teamName": "Paris Saint-Germain",
    "matchStats": {
      "FotMob rating": 7.26,
      "Minutes played": 105,
      "Goals": 0,
      "Assists": 0,
      "Accurate passes": { "value": 88, "total": 95 },
      "Chances created": 2,
      "Distance covered": 10442
    },
    "seasonStats": {
      "league": "Ligue 1",
      "season": "2025/2026",
      "matches": 14,
      "started": 11,
      "goals": 0,
      "assists": 0,
      "minutesPlayed": 1049,
      "rating": 6.88,
      "yellowCards": 0,
      "redCards": 0
    }
  },
  "error_reasoning": null
}
```

Failure / not-found shape:

```json
{
  "success": false,
  "matchId": null,
  "error_reasoning": "No match in searchapi/suggest matchSuggest matched the query 'foo vs bar'."
}
```
