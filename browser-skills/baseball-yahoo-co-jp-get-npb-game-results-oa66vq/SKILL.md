---
name: baseball-yahoo-co-jp-get-npb-game-results-oa66vq
title: NPB Game Results by Date
description: >-
  Given a date, return every Nippon Professional Baseball (NPB) game on that day
  with final score, both teams + team IDs, venue, winning / losing / save
  pitchers, game status, and the canonical Yahoo game_id — parsed from
  baseball.yahoo.co.jp's weekly schedule page.
website: baseball.yahoo.co.jp
category: sports
tags:
  - sports
  - baseball
  - npb
  - japan
  - schedule
  - read-only
source: 'browserbase: agent-runtime 2026-05-20'
updated: '2026-05-20'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      Functionally equivalent — the page is server-rendered and every field
      lives in the initial HTML. Use only if the fetch path is ever blocked (it
      isn't today: 200 OK with no anti-bot, no auth, no proxies needed). Browser
      pays ~50× the cost for zero added information.
verified: false
proxies: false
---
# NPB Game Results by Date

## Purpose

Given a calendar date, return every NPB (Nippon Professional Baseball / 日本プロ野球) regular-season and pre-season game on that date — final score, both teams (with team IDs), venue, winning / losing / save pitchers, game status, and the canonical `game_id` that links to Yahoo's game-detail page. Source is Yahoo Japan's Sportsnavi weekly schedule (`baseball.yahoo.co.jp/npb/schedule/`). Read-only — never posts, comments, or interacts with users.

## When to Use

- Building a daily NPB results digest / RSS / Slack bot.
- Backfilling a season database with scores, pitchers of record, and venues from any single date.
- Discovering the `game_id` for downstream skills that scrape box scores, play-by-play, or stats (e.g. `/npb/game/{game_id}/score`, `/npb/game/{game_id}/stats`).
- Pulling tomorrow's matchups + probable starters (the same page shows pre-game rows with announced pitchers prefixed with `(予)`).

## Workflow

The site is a server-rendered Vue page with **no anti-bot, no auth, no cookies, no rate-limit gate**. Every game-row data point (teams, score, pitcher tags, venue, game-id) is in the initial HTML — `browse cloud fetch` returns 200 with the full markup in ~400 ms. Lead with the fetch path; the rendered browser path is a strict-equivalent fallback that pays a ~50× cost premium for zero added information.

### 1. Fetch the weekly schedule page

```
GET https://baseball.yahoo.co.jp/npb/schedule/?date=YYYY-MM-DD
```

- The `date=` query param positions the page to the **week containing that date** (Mon–Sun, e.g. `?date=2026-05-19` returns the row block `5月18日（月） 〜 5月24日（日）`). Confirm via the `<li class="bb-scheduleNavi__item">` element.
- Equivalent (verified identical body): `https://baseball.yahoo.co.jp/npb/schedule/first/all?date=YYYY-MM-DD`. The `og:url` canonicalizes both to `/npb/schedule/?date=…`.
- Farm-league (2軍 / minor-league) schedule lives at `/npb/schedule/farm/all?date=…` — same HTML shape, different teams.
- No `--proxies`, no `--verified`, no special headers required. Plain `curl` works; `browse cloud fetch <url>` is the cleanest entry point inside the agent.

### 2. Parse rows from the schedule table

Each game is one `<tr class="bb-scheduleTable__row">` (the row also gets `bb-scheduleTable__row--today` for the day that matches the server's current date — informational only, do not key on it). Capture these per row:

| Field | Selector / regex | Notes |
|---|---|---|
| Date | `<th class="bb-scheduleTable__head" … rowspan="N">5月19日（火）</th>` | **Only present on the first row of each date**; subsequent rows in that date inherit it via the `rowspan`. Carry forward as you iterate top-to-bottom. |
| Home team name + id | `bb-scheduleTable__homeName` → `<a href="/npb/teams/{id}/index">{name}</a>` | id is the integer in the team URL. |
| Away team name + id | `bb-scheduleTable__awayName` → same pattern | — |
| Home pitchers | `<ul class="bb-scheduleTable__homePlayer">` → `<li class="bb-scheduleTable__player">(TAG)NAME</li>` | Multiple `<li>` per side. TAG is in parens. See pitcher-tag table below. |
| Away pitchers | `<ul class="bb-scheduleTable__awayPlayer">` → same | — |
| Score | `<p class="bb-scheduleTable__score">  HOME <span class="bb-scheduleTable__center">-</span> AWAY  </p>` | Whitespace-padded numbers; empty for un-played / cancelled games. **Score order is home–away** (matches the surrounding home / away DOM blocks). |
| Start time (pre-game) | `<div class="bb-scheduleTable__info"><span>HH:MM</span>` | Only present for un-started games. Absent on `試合終了` and `試合中止` rows. |
| Game status + game_id + game URL | `<p class="bb-scheduleTable__status"><a href="/npb/game/{game_id}/index">{status}</a></p>` | See status enum below. The link target is always `/npb/game/{game_id}/index`; the live game page may redirect to `/top`, `/score`, `/live`, `/stats` etc. — `{game_id}` itself is the stable handle. |
| Venue | `<td class="bb-scheduleTable__data bb-scheduleTable__data--stadium">神宮</td>` | Last cell of each row. |
| No-game days | `<td class="bb-scheduleTable__data bb-scheduleTable__data--nogame" colspan="8">試合はありません</td>` | Whole row, no game data. Skip and continue. |

**Pitcher tag enum** (the character inside the leading parens of each `<li class="bb-scheduleTable__player">`):

| Tag | Meaning | Encoding note |
|---|---|---|
| `勝` | Winning pitcher | half-width kanji |
| `敗` | Losing pitcher | half-width kanji |
| `Ｓ` | Save | **full-width Latin S** (U+FF33) — `===` `'S'.charCodeAt(0) === 65` will NOT match. Use `Ｓ` or check for both. |
| `予` | Probable / announced starter (pre-game only) | becomes irrelevant once the game finishes. |
| `H` | Hold (rare, mostly minor leagues) | half-width Latin H. |

Tags only appear on rows with status `試合終了`. Pre-game rows show `(予)山野` style placeholders; cancelled rows show neither score nor pitchers.

**Status enum** (text inside the `bb-scheduleTable__status` link):

| Status (ja) | Romaji | Meaning |
|---|---|---|
| `試合終了` | shiai shūryō | Final — score + W/L/S pitchers populated. |
| `試合中止` | shiai chūshi | Cancelled (rain-out, etc.). Score is empty; no pitchers. Often re-scheduled — the same `game_id` may resurface later in the season. |
| `見どころ` | midokoro | "Highlights / Preview" — same-day game that hasn't started yet. The page shows projected starters tagged `(予)`. |
| `試合前` | shiai-mae | Future game (later this week). Same shape as `見どころ`. |
| `試合中` | shiai-chū | In-progress (live). Score reflects current inning. (Not seen in our sample but documented in the page's JS bundle.) |

### 3. Filter by the requested date

The HTTP response is **week-scoped, not day-scoped**, even when `?date=` names a specific day. Carry the inherited `<th class="bb-scheduleTable__head">` value forward through subsequent rows in that date block, then filter the parsed `games[]` array to entries whose `date` matches the requested day (format: `M月D日（曜）`, e.g. `5月19日（火）`). The page also has a `<h2 class="bb-head01__title">5月19日（火）</h2>` showing the focused day in Japanese — useful for sanity-checking your filter key.

### 4. (Optional) Hydrate game details

For each `game_id`, the canonical detail entry point is:

```
https://baseball.yahoo.co.jp/npb/game/{game_id}/index
```

which auto-redirects to `/top` once the game has started. Sibling paths under the same id: `/score` (box score), `/stats` (player stats), `/live` (play-by-play), `/preview` (lineups + probables), `/text` (text-cast log). These are **out of scope** for this skill — fetch them only when downstream callers explicitly need more than the schedule-page row.

### Browser fallback

If the fetch path is ever blocked (it isn't today), open the same URL in a `browse cloud sessions create` session — **no `--verified` / `--proxies` needed** — then `browse get html body` and apply the same regex set. `browse snapshot` / `browse get text body` also work but are noisier than the raw HTML because the table renders inside layout chrome.

## Site-Specific Gotchas

- **`(Ｓ) = Save` uses full-width `Ｓ` (U+FF33), not ASCII `S`.** A naïve `tag === 'S'` check silently drops every save pitcher. Match `/[ＳS]/` or compare codepoints. Verified across iter-1 (2026-05-19, 5 games with saves: 大勢, 岩崎, ハーン, etc.).
- **`?date=` is week-scoped.** The response always contains the full Mon–Sun block surrounding the requested date — never just that single day. Always filter the parsed rows by the date header before returning. Cross-week ranges require multiple fetches stepping by 7 days.
- **Date headers use Japanese formatting with `rowspan` inheritance.** The `<th class="bb-scheduleTable__head">` appears once per date and `rowspan`s over the day's game rows. Subsequent rows in the same date block omit the `<th>` entirely — you must carry forward the most recently-seen date label as you iterate. Filtering by `date` requires the Japanese key (`5月19日（火）`), not an ISO string; build a Japanese-formatter helper or regex-extract `(\d+)月(\d+)日` and compare numerically.
- **Out-of-season dates fall back, they don't 404.** `?date=2025-06-15` (a past-but-not-current-season date in our 2026-server-time world) returns the closest in-range week (`2月2日 〜 2月8日`) with `statusCode=200`. Always verify the returned week header matches the requested date before parsing.
- **Rakuten's team_id is `376`, not in the 1–12 sequence.** All other NPB clubs map cleanly to ids 1–12 (`1=巨人, 2=ヤクルト, 3=DeNA, 4=中日, 5=阪神, 6=広島, 7=西武, 8=日本ハム, 9=ロッテ, 11=オリックス, 12=ソフトバンク`), but Rakuten Eagles is `376`. Don't validate-with-a-range-check; trust the `/npb/teams/{id}/index` URL as the source of truth.
- **Cancelled-game rows have a slightly different DOM.** `試合中止` rows use `bb-scheduleTable__home--preGame` / `bb-scheduleTable__away--preGame` classes (with the `--preGame` suffix) instead of the plain `bb-scheduleTable__home` / `bb-scheduleTable__away`, omit the pitcher `<ul>`s entirely, and have an empty `<p class="bb-scheduleTable__score">`. A regex that requires `bb-scheduleTable__homeName` (substring, not exact-class) still catches them because the team-name child div retains its non-suffixed class. Match on `homeName` / `awayName`, not on the parent's exact class string.
- **`bb-scheduleTable__row--today` is a UI hint, not a filter.** It marks the day the server considers "today" (which may differ from your `?date=` target). Do **not** use it to filter — use the date header text. (Observed during 2026-05-20 fetch: today-row was 5/21, not 5/20; the page rolls over before midnight JST.)
- **`/npb/schedule/`, `/npb/schedule/first/all`, and `/npb/schedule/?` all serve identical first-team (1軍) data.** The canonical form (per `og:url`) is `/npb/schedule/?date=…`. Use that to dedup if you cache.
- **Farm league is at `/npb/schedule/farm/all?date=…`** with the same HTML shape but Eastern + Western League teams. Out of scope for the default first-team skill unless the caller explicitly asks.
- **`(予)NAME` pitcher entries are projections, not facts.** Once the game's status flips to `試合終了`, the `(予)` rows are replaced by actual `(勝)/(敗)/(Ｓ)/(H)` tags. Do not emit `(予)` pitchers in the final-results payload — they are pre-game noise.
- **No structured JSON endpoint observed.** The Sportsnavi mobile / app API (`sportsnavi-app-category` Vary header) is gated by Yahoo Japan app credentials and not callable from a browser session. The HTML page is the canonical public source.

## Expected Output

```json
{
  "requested_date": "2026-05-19",
  "week_range_ja": "5月18日（月） 〜 5月24日（日）",
  "league": "first",
  "games": [
    {
      "date_ja": "5月19日（火）",
      "date_iso": "2026-05-19",
      "game_id": "2021038878",
      "game_url": "https://baseball.yahoo.co.jp/npb/game/2021038878/index",
      "status": "試合終了",
      "status_en": "final",
      "start_time_local": null,
      "venue": "いわき",
      "home": {
        "team_id": "2",
        "name": "ヤクルト",
        "score": 0,
        "pitchers": [{ "tag": "敗", "name": "高橋" }]
      },
      "away": {
        "team_id": "1",
        "name": "巨人",
        "score": 2,
        "pitchers": [
          { "tag": "勝", "name": "戸郷" },
          { "tag": "Ｓ", "name": "大勢" }
        ]
      },
      "winning_pitcher": "戸郷",
      "losing_pitcher": "高橋",
      "save_pitcher": "大勢",
      "hold_pitchers": []
    }
  ]
}
```

Additional outcome shapes the parser must handle without throwing:

```json
// Cancelled / rained-out game — both scores null, no pitchers.
{
  "date_ja": "4月15日（水）", "game_id": "2021038717",
  "status": "試合中止", "status_en": "cancelled", "venue": "甲子園",
  "home": { "team_id": "5", "name": "阪神",   "score": null, "pitchers": [] },
  "away": { "team_id": "1", "name": "巨人",   "score": null, "pitchers": [] },
  "winning_pitcher": null, "losing_pitcher": null, "save_pitcher": null
}
```

```json
// Pre-game (今日 or future date) — score null, start_time set, pitchers are projections.
{
  "date_ja": "5月21日（木）", "game_id": "2021038889",
  "status": "見どころ", "status_en": "preview",
  "start_time_local": "18:00", "venue": "神宮",
  "home": { "team_id": "2", "name": "ヤクルト", "score": null, "pitchers": [{ "tag": "予", "name": "山野" }] },
  "away": { "team_id": "1", "name": "巨人",     "score": null, "pitchers": [{ "tag": "予", "name": "田中将" }] },
  "winning_pitcher": null, "losing_pitcher": null, "save_pitcher": null
}
```

```json
// No-game day (e.g. Monday off-day) — game array filtered to []; week_range_ja still populated.
{
  "requested_date": "2026-05-18",
  "week_range_ja": "5月18日（月） 〜 5月24日（日）",
  "games": []
}
```
