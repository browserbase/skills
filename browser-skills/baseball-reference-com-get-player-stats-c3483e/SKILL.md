---
name: baseball-reference-com-get-player-stats-c3483e
title: Baseball-Reference Player Stats
description: >-
  Resolve an MLB player by URL, bbref ID, or name, then extract canonical meta
  plus the requested stat scope (standard, advanced, value, pitching, fielding,
  postseason, salaries, splits, game log) as structured JSON. Disambiguates
  common names; preserves verbatim column schema per table.
website: baseball-reference.com
category: sports
tags:
  - baseball
  - mlb
  - stats
  - sabermetrics
  - read-only
  - html-tables
source: 'browserbase: agent-runtime 2026-05-15'
updated: '2026-05-15'
recommended_method: url-param
alternative_methods:
  - method: hybrid
    rationale: >-
      browse cloud fetch handles 99% of player pages (under the 1MB Fetch API cap). For
      ~20+ season careers (e.g., Justin Verlander) the response exceeds 1MB and
      a Browserbase browser session must be used to retrieve the same HTML.
  - method: browser
    rationale: >-
      Live browser session is only required when the Fetch API 1MB cap is hit.
      No JS rendering is required to read any stat table — they are all
      server-rendered into the initial HTML (some wrapped in HTML comments).
verified: false
proxies: false
---
# Baseball-Reference Player Stats

## Purpose

Given a player identifier — a Baseball-Reference URL, a `bbref` player ID (`troutmi01`), a free-form name (`"Mike Trout"`), or a name + disambiguator (`"Frank Thomas, 1990s White Sox"`) — return the canonical player meta block plus the requested stat scope as structured JSON. Scopes cover `standard`, `advanced`, `value`, `pitching`, `fielding`, `appearances`, `postseason`, `salaries`, single-year `game log`, and `batting splits` / `pitching splits` (vs LHP/RHP, home/away, day/night, by month, by count, by pitch type, by leverage, etc.). Read-only — never click Subscribe, Stathead, or any account/mutation control; never submit forms.

## When to Use

- One-off lookups: "What was Mike Trout's 2024 OPS+ and WAR?"
- Career-table extraction for downstream analysis (CSV/JSON pipelines, fantasy tools, sabermetric notebooks).
- Disambiguation of common names ("Frank Thomas" — there are five in MLB history).
- Year-by-year time series, single-season splits, or game-by-game logs.
- Hall of Fame / awards / contract / service-time enrichment alongside stats.
- Two-way players (Ohtani) where both batting and pitching tables are needed in one pass.

## Workflow

Baseball-Reference has **no public JSON API**, but it does have a clean URL contract and predictable HTML structure that makes scripted browsing unnecessary in almost all cases. **Lead with `browse cloud fetch`** (the Browserbase Fetch API — cheap, no live browser session needed). Each player page is a fully-rendered static HTML document; tables expose canonical column keys via `data-stat="<key>"` on every `<td>`, and high-precision sort values via `csk="<float>"`. Some tables are wrapped in `<!-- ... -->` comments to defeat naive scrapers — strip comment markers before parsing, don't try to render them. **Full-browser scripting via `browse cloud browse --connect` is only needed when the HTML response exceeds the 1MB Fetch-API cap** (long-career players — see gotcha) or when JS-only widgets are involved (none for the stat tables this skill targets).

### 1. Resolve the player to a canonical `bbref_id` + URL

Three input shapes, three paths:

**a. URL given:** Parse the bbref ID directly. The canonical shape is `https://www.baseball-reference.com/players/<letter>/<bbref_id>.shtml` where `<letter>` is the first letter of the bbref ID. Reject any other URL shape (e.g., `/register/`, `/minors/`) — those are minor-league pages with a different table schema and are out of scope.

**b. `bbref_id` given (`troutmi01`):** Construct the URL: `https://www.baseball-reference.com/players/{bbref_id[0]}/{bbref_id}.shtml`.

**c. Free-form name (`"Mike Trout"`, `"Frank Thomas, 1990s White Sox"`):** Hit the search endpoint:
```
GET https://www.baseball-reference.com/search/search.fcgi?search=<URL-encoded name>
```
Two possible responses:

- **302 redirect** to a single canonical `/players/<letter>/<id>.shtml` URL → unambiguous. Use that ID directly. Pass `--allow-redirects` to `browse cloud fetch` to follow it, or read the `Location` header and refetch.
- **200 HTML** with a `<div id="players" class="current">` block → ambiguous. Inside, every match is a `<div class="search-item">` containing:
  - `<a href="/players/.../*.shtml">Name (YYYY-YYYY)</a>` — bbref URL + active-year range
  - Optional `<span class="search-badge search-hof">Hall of Fame</span>` + `<span class="search-badge search-allstar">All-Star</span>`
  - `<div class="search-item-alt-names">given: <em>Given Name</em>, nickname: <em>Nick</em></div>`
  - `<div class="search-item-team">Franchises: CHW,TOR,OAK</div>`

  **If the caller supplied a disambiguator** (era, team, franchise), filter the list by year-range and/or `search-item-team` text. **If the result is still ambiguous, return the full list verbatim** rather than picking one — surfacing the choice is the correct behavior.

### 2. Fetch the player page

```bash
browse cloud fetch "https://www.baseball-reference.com/players/<letter>/<id>.shtml" --output /tmp/player.html
```

For players with very long careers (15+ MLB seasons, or two-way players with 20+ combined-discipline rows) the response can exceed 1 MB — see the gotcha. In that case fall back to a Browserbase browser session:
```bash
SID=$(browse cloud sessions create --keep-alive | jq -r .id)
browse cloud browse --connect "$SID" open "https://www.baseball-reference.com/players/<letter>/<id>.shtml"
browse cloud browse --connect "$SID" wait load
browse cloud browse --connect "$SID" get html body > /tmp/player.html
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```
The HTML payload is identical; only the transport changes.

### 3. Extract the meta block

`<div id="meta">` contains everything the caller needs about the player. Pull these fields:

| JSON field | Source pattern |
|---|---|
| `name` | `<h1><span>...</span></h1>` |
| `bbref_id` | derived from URL or `data-soc-sum-entity-id` attribute on tables |
| `position` | `<strong>Position:</strong> <text>` |
| `bats`, `throws` | `<strong>Bats: </strong>Right`, `<strong>Throws: </strong>Right` |
| `height`, `weight` | `<p><span>6-1</span>,&nbsp;<span>235lb</span>` |
| `current_team` | `<strong>Team:</strong> <a href="/teams/LAA/2026.shtml">Los Angeles Angels</a>` |
| `date_of_birth` | `<span id="necro-birth" data-birth="1991-08-07">` |
| `birthplace` | text inside the birth `<span>` after the city link |
| `debut_date` | `<strong><a href="/leagues/majors/{year}-debuts.shtml">Debut:</a></strong> <a ...>July 8, 2011</a>` |
| `last_game_date` | `<strong><a href="/leagues/majors/{year}-lastgame.shtml">Last Game:</a></strong> ...` (present only for retired/inactive) |
| `draft` | `<p><strong>Draft</strong>: ...` (free text — preserve verbatim) |
| `high_school` / `college` | `<strong>High School:</strong>` / `<strong>School:</strong>` |
| `contract_status` | `<strong>{YYYY} Contract Status</strong>: ...` |
| `service_time` | `<strong>Service Time (MM/YYYY)</strong>: <years.days>` |
| `full_name` | `<strong>Full Name:</strong> Michael Nelson Trout` |
| `nicknames` | `<strong>Nicknames:</strong> ...` |
| `hall_of_fame` | check `div#bling` / Hall-of-Fame badge on the page, or look for the `hof_other` table div |
| `mlb_teams` | enumerate distinct `team_name_abbr` values across the `players_standard_*` table rows, paired with year ranges |
| `canonical_url` | `https://www.baseball-reference.com/players/<letter>/<id>.shtml` |

### 4. Locate the stat table for the requested scope

Every stat table is wrapped in `<div id="all_<table_id>"><div id="div_<table_id>">...<table id="<table_id>">`. The `<table>` element may live **directly in the DOM** or **inside an HTML comment** (`<!-- ... -->`) — same parent `<div id="all_*">` either way. Always strip `<!--` / `-->` before parsing.

Canonical table IDs (as of 2026-05-15):

| Scope | Table ID |
|---|---|
| Standard batting (career-by-season) | `players_standard_batting` |
| Advanced batting | `players_advanced_batting` |
| Value batting (WAR breakdown) | `players_value_batting` |
| Standard pitching | `players_standard_pitching` |
| Advanced pitching | `players_advanced_pitching` |
| Value pitching | `players_value_pitching` |
| Standard fielding | `players_standard_fielding` |
| Postseason batting (season) | `players_standard_batting_post`, `players_advanced_batting_post` |
| Postseason batting (game) | `players_batting_postseason` |
| Postseason pitching (season) | `players_standard_pitching_post`, `players_advanced_pitching_post` |
| Postseason pitching (game) | `players_pitching_postseason` |
| Postseason fielding | `players_standard_fielding_post` |
| Appearances by position | `appearances`, `appearances_post` |
| Salary history | `br-salaries` |
| Last-5-games snapshot | `last5` (batters), `last5_b` / `last5_p` (two-way) |

**Which tables sit in HTML comments depends on the player's primary discipline:**

- **Pure batter** (Trout): batting tables are visible DOM; `appearances`, `br-salaries`, and all `*_postseason` game-level tables are HTML-commented; no pitching tables exist.
- **Pure pitcher** (Verlander): pitching tables are visible DOM; same comment pattern for appearances/salaries/postseason-game.
- **Two-way** (Ohtani): batting tables visible DOM; **all pitching tables HTML-commented**; both `last5_b` and `last5_p` exist.

Don't hardcode "this table is always in a comment" — check `<!--` ancestry per fetch.

### 5. Parse rows

Every row is a `<tr>` with one `<th data-stat="year_id">` and one `<td data-stat="<key>">` per column. Extract columns in document order — bbref preserves a stable, schema-encoded column order per table.

```python
# Pseudocode
soup = BeautifulSoup(html, "html.parser")
# Strip comment markers so commented tables become parseable
for c in soup.find_all(string=lambda t: isinstance(t, Comment)):
    c.replace_with(BeautifulSoup(c, "html.parser"))

table = soup.find("table", id="players_standard_batting")
thead_stats = [th["data-stat"] for th in table.thead.find_all("th") if th.get("data-stat")]
rows = []
for tr in table.tbody.find_all("tr"):
    if "thead" in tr.get("class", []): continue   # mid-table sub-headers
    row = {}
    for cell in tr.find_all(["th", "td"]):
        k = cell.get("data-stat"); if not k: continue
        # Prefer csk (high-precision sort key) when present, fall back to text
        v = cell.get("csk") or cell.get_text(strip=True)
        row[k] = v
    row["_table"] = "players_standard_batting"
    rows.append(row)
```

**Always preserve column order verbatim** — different tables expose different `data-stat` keys; downstream callers need to know the shape. Tag every row with the source `_table` field.

### 6. Year-range filtering, per-game derivation

- Single year: filter rows where `year_id == "2024"`.
- Year range `2018-2024`: filter where year falls in range.
- Career: keep all rows; the final `<tfoot>` row contains career totals (162-game pace, per-PA rates etc. depending on table).
- Per-162 / per-PA: bbref provides per-162 only in the `players_value_*` table (`b_waa_win_perc_162`). For per-game derivations not in the table, the caller must compute from counting + games columns.

### 7. Splits (when requested)

```bash
browse cloud fetch "https://www.baseball-reference.com/players/split.fcgi?id=<bbref_id>&year=<YYYY>&t=<b|p|f>" --output /tmp/splits.html
```
`t` selects discipline: `b` = batting, `p` = pitching, `f` = fielding. Year is required (career-splits pages exist but use a different schema — out of scope for this skill).

The splits page contains ~25 small tables, one per split dimension. Common table IDs:
- `plato` — vs LHP / vs RHP (platoon)
- `hmvis` — home / away
- `half` — first half / second half
- `month` — by month
- `count` — by count (0-0, 0-1, 1-2, full, ahead, behind, two-strikes, ...)
- `outs` — by outs (0, 1, 2)
- `bases` — by baserunner state
- `clutc` — clutch / late & close / tied-or-close
- `lever` — high / medium / low leverage
- `innng` — by inning
- `times` — by times faced (1st PA / 2nd PA / 3rd PA / 4+)
- `power` — pitch power (fastball, breaking, off-speed velocity bins)
- `gbfb` — by batted-ball type
- `hitlo` — by hit location
- `traj` — by trajectory (GB / LD / FB / PU)
- `oppon` — by opponent team
- `stad` — by stadium
- `site` — by venue (home / away / neutral)

Each row in each split table uses the same `data-stat` schema as the season-level table for that discipline. Tag rows with both `_table` and `_split` (the row's `<th data-stat="split_name">` or equivalent header cell).

### 8. Game log (when requested)

```bash
browse cloud fetch "https://www.baseball-reference.com/players/gl.fcgi?id=<bbref_id>&year=<YYYY>&t=<b|p|f>" --output /tmp/gamelog.html
```
Single table per discipline: `players_standard_batting` / `players_standard_pitching` / `players_standard_fielding` (same id namespace as the player page, but the rows are per-game). Year is required.

### 9. Rate-limit and User-Agent

robots.txt enforces `Crawl-delay: 3` — keep ≤ 1 request per 3 seconds sustained, and back off on any 429/503. `browse cloud fetch` already presents a descriptive User-Agent (Browserbase Fetch); no additional UA spoofing is needed. **A residential proxy is NOT required** — Cloudflare cache-hits are the dominant response (`Cf-Cache-Status: HIT` on player pages), and the site does not gate per-IP for non-admin paths.

## Site-Specific Gotchas

- **READ-ONLY.** Never click Subscribe, Stathead, "Subscribe to Stathead", "Add to Stathead", "Bookmark Player", or any account/share/mutation control. Never submit a form (the only form on player pages is the search box — and we use the GET-side `search.fcgi?search=` URL directly, not the form).
- **Many tables are wrapped in HTML comments.** Baseball-Reference's longstanding anti-naive-scraper measure: `appearances`, `br-salaries`, all `*_postseason` game-level tables, and **the entire non-primary discipline for two-way players** (e.g., Ohtani's pitching tables) live inside `<!-- ... -->` comments. Strip `<!--` / `-->` markers BEFORE feeding the chunk to your HTML parser, or use the parser's comment-traversal API. Cheerio/BeautifulSoup both ignore comment contents by default.
- **The Fetch-API 1 MB response cap bites long-career players.** `browse cloud fetch` returns `502 The response body exceeded the maximum allowed size of 1MB. Use a browser session to handle large responses.` for players with ~20+ MLB seasons (verified: Justin Verlander's page is ~1.05 MB). `--output` does NOT bypass the cap — it's enforced at the Browserbase Fetch API edge, not on stdout. Fall back to a live session: `browse cloud browse --connect $SID get html body > /tmp/player.html`. The resulting HTML is byte-identical; only the transport changes. Pure batters typically peak around 900 KB even with 15-season careers; two-way players (Ohtani) sit ~820 KB. **Trigger the fallback heuristic when:** player has ≥ 15 seasons of either discipline, OR player has both batting + pitching tables with ≥ 7 seasons each.
- **`/search/search.fcgi?search=<name>` returns 302 for unambiguous, 200 disambig page for ambiguous.** A single common name like "Frank Thomas" returns 44 search-items; "Mike Trout" 302-redirects directly. Always check status before parsing — a parser expecting a `<div id="meta">` block on a 200-disambig response will silently fail.
- **The `csk` attribute is the high-precision underlying value.** Display text shows `.220`; `csk="0.2195121951"` is the unrounded number. Prefer `csk` over `.get_text()` for any numeric stat the caller intends to use for math.
- **`<strong><em>X</em></strong>` and `<strong>X</strong>` are league-leader markers.** `<strong><em>` = led league; `<strong>` = qualified leader. Strip these wrappers when emitting clean values, or surface them as a `flags: ["led_league"]` / `flags: ["qualified_leader"]` sidecar field.
- **Career-totals row lives in `<tfoot>`, not `<tbody>`.** It has its own `tr` and uses the same `data-stat` schema. Skip it for year-filtered queries; emit it as a `career` row when the caller asked for `year_filter: "career"`.
- **`/players/split.cgi` is robots-disallowed, `/players/split.fcgi` is not.** Same for `gl.fcgi` vs `gl.cgi`. The site's own internal links go to the `.fcgi` variants — use those.
- **Splits + game logs are year-scoped only.** `split.fcgi` and `gl.fcgi` require `year=YYYY`. There is no career-aggregated splits page in the same schema. If a caller asks for career splits, fetch each season's split page and aggregate client-side — or refuse and document the limitation.
- **Two-way players have `last5_b` AND `last5_p`.** Pure batters have `last5`; pure pitchers have `last5`. Branching on the primary table id is wrong — enumerate `div_last5*` IDs and union them.
- **The `players_advanced_*` table includes Statcast-enriched columns when available** (`b_avg_exit_velo`, `b_hard_hit_perc`, `b_ld_perc`, `b_gb_perc`, `b_fb_perc`, `b_pull_perc`, `b_center_perc`, `b_oppo_perc`). These are populated only for 2015-onward seasons (Statcast era). Pre-2015 rows have those columns present but empty — emit `null`, not `""`.
- **`players_value_*` is the WAR-breakdown table** (`b_runs_batting`, `b_runs_baserunning`, `b_runs_double_plays`, `b_runs_fielding`, `b_runs_position`, `b_raa`, `b_waa`, `b_runs_replacement`, `b_rar`, `b_war`, `b_waa_win_perc`, `b_waa_win_perc_162`, `b_war_off`, `b_war_def`, `b_rar_off`). It does NOT contain HR, AVG, OPS, etc. — those live in `players_standard_batting`. Don't conflate them.
- **`team_name_abbr` is a 3-letter Baseball-Reference franchise code, NOT the MLB Statcast/StatsAPI abbreviation.** Examples that differ: `CHW` (bbref) vs `CWS` (MLBAM) for the White Sox; `WSN` (bbref) vs `WSH` for the Nationals; `KCR` vs `KC`; `TBR` vs `TB`. If the caller wants MLBAM-compatible codes, map them post-extraction.
- **Cloudflare caches aggressively (`Cf-Cache-Status: HIT`), so a freshly-updated stat may be stale by minutes.** For in-game / same-day data, expect ≤ 5-minute staleness on counting stats. Card pages (career-totals) update overnight.
- **HOF status appears in two places:** the `hof_other` table div (career voting history) and the `bling` block at top-of-page (badges for HOF, MVP, AS counts, etc.). Use the badge for `hall_of_fame: true|false`; use `hof_other` if the caller wants ballot history (year, votes, percentage).
- **Salary history is partial and US-payroll-only.** `br-salaries` (HTML-commented) starts at the year salary data became public per the BBPA agreement, includes ESCALATORS / OPTIONS columns, and may lag the current season by 1-2 months. Treat absent rows as "not reported," not "$0."
- **CDP/WebSocket egress to `connect.*.browserbase.com` may be blocked in restricted sandboxes** (verified during this skill's authoring: `getaddrinfo ENOTFOUND connect.usw2.browserbase.com`). `browse cloud fetch` (which targets `api.browserbase.com` over HTTPS) works fine. If you need the live-browser fallback for the 1MB-cap case and CDP is unreachable, your sandbox is misconfigured — the consuming agent's runtime should not be.

## Expected Output

The response is a single JSON object with the player meta block, the table rows for the requested scope(s), and any disambig list if the input was ambiguous. Three distinct outcome shapes:

```json
// 1. Success — player resolved, stats extracted
{
  "success": true,
  "player": {
    "bbref_id": "troutmi01",
    "name": "Mike Trout",
    "full_name": "Michael Nelson Trout",
    "nicknames": [],
    "position": "Centerfielder",
    "bats": "Right",
    "throws": "Right",
    "height": "6-1",
    "weight": "235lb",
    "height_cm": 185,
    "weight_kg": 106,
    "date_of_birth": "1991-08-07",
    "birthplace": "Vineland, NJ",
    "debut_date": "2011-07-08",
    "last_game_date": null,
    "draft": "Drafted by the Los Angeles Angels of Anaheim in the 1st round (25th) of the 2009 MLB June Amateur Draft from Millville Senior HS (Millville, NJ).",
    "high_school": "Millville Senior HS (Millville, NJ)",
    "college": null,
    "current_team": "Los Angeles Angels",
    "contract_status": "Signed thru 2030, 12 yrs/$426.5M (19-30)",
    "service_time_years_days": "14.070",
    "hall_of_fame": false,
    "mlb_teams": [{"team": "LAA", "first_year": 2011, "last_year": 2026}],
    "canonical_url": "https://www.baseball-reference.com/players/t/troutmi01.shtml"
  },
  "scope": "standard",
  "year_filter": "career",
  "tables": [
    {
      "table": "players_standard_batting",
      "columns": ["year_id","age","team_name_abbr","comp_name_abbr","b_war","b_games","b_pa","b_ab","b_r","b_h","b_doubles","b_triples","b_hr","b_rbi","b_sb","b_cs","b_bb","b_so","b_batting_avg","b_onbase_perc","b_slugging_perc","b_onbase_plus_slugging","b_onbase_plus_slugging_plus","b_roba","b_rbat_plus","b_tb","b_gidp","b_hbp","b_sh","b_sf","b_ibb","pos","awards"],
      "rows": [
        {"year_id": "2011", "age": "19", "team_name_abbr": "LAA", "comp_name_abbr": "AL", "b_war": "0.5", "b_war_csk": "0.47", "b_games": "40", "b_pa": "135", "b_ab": "123", "b_r": "20", "b_h": "27", "b_hr": "5", "b_rbi": "16", "b_sb": "4", "b_batting_avg": ".220", "b_batting_avg_csk": "0.2195121951", "b_onbase_plus_slugging": ".672", "b_onbase_plus_slugging_plus": "89", "pos": "897/HD", "awards": "", "flags": []},
        {"year_id": "2012", "age": "20", "team_name_abbr": "LAA", "b_war": "10.5", "b_hr": "30", "b_sb": "49", "b_batting_avg": ".326", "b_onbase_plus_slugging_plus": "168", "awards": "MVP-2,ROY-1,AS,SS", "flags": ["led_league:b_war","led_league:b_r","led_league:b_sb","led_league:b_roba","qualified_leader:b_onbase_plus_slugging_plus"]}
      ],
      "footer": {"year_id": "Career", "b_war": "84.2", "b_games": "1564", "b_hr": "378", "b_batting_avg": ".299"}
    }
  ]
}

// 2. Ambiguous name — surface the disambig list, do NOT pick
{
  "success": false,
  "reason": "ambiguous_name",
  "query": "Frank Thomas",
  "matches": [
    {"bbref_id": "thomafr04", "name": "Frank Thomas", "active_years": "1990-2008", "franchises": ["CHW","TOR","OAK"], "badges": ["Hall of Fame","All-Star"], "given_name": "Frank Edward", "nickname": "Big Hurt", "url": "https://www.baseball-reference.com/players/t/thomafr04.shtml"},
    {"bbref_id": "thomafr03", "name": "Frank Thomas", "active_years": "1951-1966", "franchises": ["PIT","NYM","CHC"], "badges": ["All-Star"], "given_name": "Frank Joseph", "nickname": "Big Donkey, The Original", "url": "https://www.baseball-reference.com/players/t/thomafr03.shtml"},
    {"bbref_id": "thomafr01", "name": "Frank Thomas", "active_years": "...", "url": "..."}
  ]
}

// 3. Not found — search returned 200 but with zero players in the disambig list
{
  "success": false,
  "reason": "player_not_found",
  "query": "Asdfgh Qwertyu"
}
```

For multi-scope requests (e.g., `standard + advanced + value + splits`), `tables` is an array of one entry per `_table`, each preserving the row-and-column-order schema above. For two-way players, batting tables and pitching tables both appear, each tagged with its own `_table` id. For game-log requests, `tables[].rows` are per-game rather than per-season; the column schema is otherwise identical to the season table.
