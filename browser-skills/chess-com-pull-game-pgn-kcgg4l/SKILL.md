---
name: chess-com-pull-game-pgn-kcgg4l
title: Chess.com Export Game PGN
description: >-
  Given a chess.com game URL, return the game's full standard PGN (headers plus
  SAN move list with clock annotations) by reading chess.com's public JSON
  endpoints rather than scraping the JS-rendered board.
website: chess.com
category: chess
tags:
  - chess
  - pgn
  - chess-com
  - games
  - export
source: 'browserbase: agent-runtime 2026-06-03'
updated: '2026-06-03'
recommended_method: api
alternative_methods:
  - method: fetch
    rationale: >-
      The same two public JSON GETs work over plain HTTP through a residential
      proxy (e.g. `browse cloud fetch --proxies`); no headless browser is
      required. Use this when you just need the bytes and not a full browser
      session.
  - method: browser
    rationale: >-
      Last resort only. The board is a JS SPA that never renders the PGN in page
      text; the PGN lives behind the Share dialog's 'Download' tab, which the
      public API exposes directly. Drive the browser only if both JSON hosts are
      unreachable.
verified: false
proxies: true
---
# Chess.com Export Game PGN

## Purpose

Given the URL of a finished chess.com game (e.g. `https://www.chess.com/game/live/169227053782`), return the game's complete **standard PGN** — the seven-tag-roster headers plus the full SAN move list with `{[%clk ...]}` clock annotations and the final result token. Read-only; nothing is posted, edited, or downloaded into an account. The recommended path uses chess.com's public JSON endpoints (no login, no API key), because the game board itself is a client-rendered SPA that never puts the PGN in page text.

## When to Use

- You have a chess.com game URL and need its PGN for analysis, an opening database, an engine, or archival.
- Bulk-exporting many games where scraping the rendered board would be slow and brittle.
- Anywhere you'd otherwise click Share → Download in the chess.com UI — the public API returns the identical PGN string without a session.

## Workflow

The chess.com web board is a JavaScript SPA: `browse snapshot` returns 0 a11y refs and the PGN appears in **no** page text node. Do **not** scrape the board. Instead use the two public JSON endpoints below. Both sit behind Cloudflare, so route requests through a **residential proxy** (`browse cloud fetch --proxies`, or a Browserbase session with `proxies: true`). No auth, cookies, or `--verified` stealth were needed in testing — a residential IP alone clears Cloudflare.

1. **Parse the game URL.** It is `https://www.chess.com/game/{type}/{id}` where `{type}` is `live` (real-time games) or `daily` (correspondence), and `{id}` is the trailing integer (e.g. `169227053782`). Both pieces are needed for step 2.

2. **Resolve the game id → player + month** via the callback endpoint (no auth):
   ```
   GET https://www.chess.com/callback/{type}/game/{id}
   ```
   This returns JSON. The needle is `game.pgnHeaders`:
   - `game.pgnHeaders.White` → the white player's username (case-insensitive; lowercase it for step 3).
   - `game.pgnHeaders.Date` → `"YYYY.MM.DD"`; split on `.` to get year + month.

   This endpoint also carries `game.moveList` (chess.com's proprietary **TCN** encoding, *not* SAN), `game.moveTimestamps`, ratings, and `game.gameEndReason`. There is **no ready-made PGN string here** — TCN would require a full move generator to convert to SAN, so don't try; step 3 returns the real PGN for free.

3. **Fetch the player's monthly archive and match by id** (chess.com Published-Data API, public):
   ```
   GET https://api.chess.com/pub/player/{white_username_lowercased}/games/{YYYY}/{MM}
   ```
   Returns `{ "games": [ ... ] }`. Each game object has a `url` field like `https://www.chess.com/game/live/169227053782`. **Find the game whose `url`'s last path segment equals `{id}`** — this is an exact match, not a substring guess. That object's `.pgn` field is the complete standard PGN. Return it verbatim. (The object also exposes `white`, `black`, `eco`, `time_control`, `fen`, `tcn`, and `end_time` if you want structured fields alongside the PGN.)

   The archive holds the player's whole month (hundreds of games — ~MBs of JSON), so parse it with a JSON parser and `.find()`; don't try to eyeball it or dump it into a small context window.

**Why white, not black?** Either player's archive contains the game, but the callback's `pgnHeaders.White` is the reliable, always-present username to key on. (Black's archive works identically if you prefer.)

### Browser fallback

Only if both JSON hosts are unreachable. Open the game URL, dismiss the result modal, click the **Share** icon under the Moves panel, and read the PGN from the dialog's **Download / PGN** tab. This is slow, may require dismissing overlays/ads, and on some games prompts a login — the API path above avoids all of it. Treat the browser purely as a transport for the same data the API already gives you.

## Site-Specific Gotchas

- **The PGN is never in the rendered board's text.** The Moves panel shows SAN visually but not as extractable text; `browse get text body` on the game page does not yield a PGN. Use the API.
- **`game.moveList` from the callback is TCN, not PGN.** It's a 2-chars-per-ply proprietary encoding. Converting it to SAN needs a full legal-move generator and disambiguation logic — not worth it. The monthly archive hands you finished SAN PGN directly.
- **Match the archive game by the last path segment of `url`, not by `uuid`.** The callback returns a `uuid` too, but the archive objects' `url` ends in the same integer id as the input URL, making `url.split('/').pop() === id` the cleanest join.
- **Lowercase the username.** `pgnHeaders.White` may be mixed-case (`LeonLiur`); the `api.chess.com/pub/player/{user}/...` path is case-insensitive in practice but lowercasing is the documented convention and avoids edge cases.
- **Cloudflare fronts `www.chess.com`; use a residential proxy.** Direct datacenter-IP requests can be challenged. `browse cloud fetch --proxies` (or Browserbase `proxies: true`) cleared it in testing; `--verified` stealth was **not** required. `api.chess.com` (the Published-Data host) is friendlier but route it through the proxy too for consistency.
- **No single-game PGN endpoint exists.** Confirmed 404 on `…/callback/live/game/{id}/pgn`, `…/game/live/{id}/pgn`, and `api.chess.com/pub/game/live/{id}` ("Data provider not found"). The month archive is the canonical PGN source — there is no per-id shortcut.
- **`{type}` matters.** A `daily` (correspondence) game must use `…/callback/daily/game/{id}`; using `live` for a daily id (or vice-versa) returns the wrong/empty payload. Parse the segment from the URL, don't assume `live`.
- **Archives are partitioned by month, keyed off the game's own Date.** A game played 2026.05.25 lives in `…/games/2026/05`. Don't guess the current month — read it from `pgnHeaders.Date`.
- **`browse` CLI prints an "Update available" banner to stderr.** It's intermittent and harmless for the API path, but a browser-driving agent that conflates stderr with command failure will thrash on it — read stdout only.
- **Rate-limit politeness:** the Published-Data API is public but unthrottled clients get blocked. Keep ≤ ~1 req/s for bulk exports; archives are cacheable per month.

## Expected Output

Success — full PGN extracted (clock comments preserved as chess.com returns them):

```json
{
  "success": true,
  "game_id": "169227053782",
  "white": "LeonLiur",
  "black": "PLAYING_FROM_WORK",
  "result": "1/2-1/2",
  "pgn": "[Event \"Live Chess\"]\n[Site \"Chess.com\"]\n[Date \"2026.05.25\"]\n[Round \"-\"]\n[White \"LeonLiur\"]\n[Black \"PLAYING_FROM_WORK\"]\n[Result \"1/2-1/2\"]\n[CurrentPosition \"8/1R6/8/8/k7/8/1p2K3/2r2R2 b - - 33 81\"]\n[ECO \"B00\"]\n[ECOUrl \"https://www.chess.com/openings/Nimzowitsch-Defense-Kennedy-Paulsen-Attack\"]\n[UTCDate \"2026.05.25\"]\n[UTCTime \"17:45:36\"]\n[WhiteElo \"1304\"]\n[BlackElo \"1286\"]\n[TimeControl \"600\"]\n[Termination \"Game drawn by agreement\"]\n[Link \"https://www.chess.com/game/live/169227053782\"]\n\n1. e4 {[%clk 0:09:59.9]} 1... e5 {[%clk 0:09:59.1]} 2. d4 ... 81. Ke2 {[%clk 0:00:49.1]} 1/2-1/2",
  "error_reasoning": null
}
```

Failure — game id not present in the resolved archive (e.g. wrong `{type}`, deleted game, or username/month mismatch):

```json
{
  "success": false,
  "game_id": "169227053782",
  "white": null,
  "black": null,
  "result": null,
  "pgn": null,
  "error_reasoning": "Game 169227053782 not found in leonliur's 2026/05 archive"
}
```

Notes on the PGN string: it is the standard PGN tag roster plus extra chess.com tags (`CurrentPosition`, `ECOUrl`, `UTCDate`/`UTCTime`, `Link`), followed by the SAN movetext with per-move `{[%clk H:MM:SS.s]}` clock comments and a terminal result token (`1-0`, `0-1`, or `1/2-1/2`). Pass it unmodified to any PGN parser.
