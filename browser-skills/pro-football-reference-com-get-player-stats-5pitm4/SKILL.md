---
name: pro-football-reference-com-get-player-stats-5pitm4
title: Pro-Football-Reference Player Stats
description: >-
  Given an NFL player reference (URL, PFR ID, or free-form name), return bio +
  the requested career, season, splits, or game-log stat tables from
  Pro-Football-Reference as structured JSON. Preserves verbatim PFR column
  headers and table ids. Read-only.
website: pro-football-reference.com
category: sports
tags:
  - nfl
  - stats
  - sports
  - reference
  - cloudflare
  - read-only
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      PFR has no public JSON API. Private XHR endpoints feed the rendered tables
      but require the Cloudflare-issued session cookie + a signed request — not
      a viable independent surface.
  - method: hybrid
    rationale: >-
      For bulk historicals where freshness isn't critical, the
      community-maintained nflverse-data GitHub releases (CSV/parquet
      aggregations of PFR + others, weekly cadence) are faster and cheaper than
      scraping. Cross-check before quoting; lags by ~24h.
verified: true
proxies: true
---
# Pro-Football-Reference Player Stats

## Purpose

Given an NFL player reference (full PFR URL, PFR ID like `MahoPa00`, or free-form name) return the player's bio plus the requested stat tables — career, season-by-season, splits, and/or game log — as structured JSON. Each row preserves the verbatim PFR column headers, table id, and column order so downstream callers know the schema. Read-only: never click Subscribe, Stathead, login, or any account/mutation control; never submit a form.

## When to Use

- Pulling a player's career season-by-season stats for any stat scope (passing, rushing/receiving, defense, kicking, punting, returns, scoring, snap counts, advanced passing/rushing/receiving/defense, combine, draft).
- Building a career game log (per-game opponent, result, snaps, stat columns) for regular season, postseason, or both.
- Splits analysis (home/away, vs division, by down/quarter/red-zone, by week, …).
- Resolving a fuzzy player name plus team/year disambiguator to a canonical PFR ID.
- Backfilling structured NFL stats anywhere you'd otherwise scrape Sports-Reference HTML.

## Workflow

PFR has no public JSON API. Their entire surface (including `/robots.txt`) is fronted by Cloudflare with a JavaScript challenge — bare HTTP fetches (including Browserbase `bb fetch` with `--proxies`) return **403 "Just a moment…"** with a `__cf_bm` cookie and `cf-mitigated: challenge` header. **A Verified + residential-proxy browser session is mandatory.** Many tables are also wrapped in HTML comments (`<!-- <table …> -->`) so an extractor must read both the visible DOM and the comment nodes.

### 1. Verified + residential-proxy session (mandatory)

```bash
SID=$(bb sessions create --keep-alive --verified --proxies | jq -r .id)
export BROWSE_SESSION="$SID"   # subsequent `browse … --remote` calls inherit
```

Both `--verified` and `--proxies` are required. A bare session (or `bb fetch` with or without `--proxies`) reliably 403s on PFR's Cloudflare challenge — verified 2026-05-18 on `/`, `/robots.txt`, `/players/M/MahoPa00.htm`, and the `pfref.com` short-link domain (which is the same Cloudflare tenant). The challenge wants real JS execution; once a Verified browser solves it, the `__cf_bm` cookie persists for ~30 min and subsequent requests in the same session are unchallenged.

### 2. Resolve the player to a canonical PFR ID

PFR IDs are formed as **first 4 letters of last name + first 2 letters of first name + 2-digit collision suffix** (`MahoPa00`, `BradTo00`, `RoetBe00`, `MannPe00`). When the input is:

- **Full URL** — extract the ID from the path: `/players/<Letter>/<PFR_ID>.htm`. Done; skip ahead.
- **Bare PFR ID** — construct the URL: `https://www.pro-football-reference.com/players/<first-letter-of-last-name-UPPERCASE>/<PFR_ID>.htm`. The letter prefix path segment is **the first letter of the LAST name**, not the first character of the ID (the ID's first letter IS that, but the convention is anchored on the last name — e.g. Mahomes → `M/MahoPa00.htm`, Brady → `B/BradTo00.htm`).
- **Free-form name** — use PFR's player search endpoint `/search/search.fcgi?search=<urlenc-name>`. The HTML response either redirects to the canonical `/players/<L>/<id>.htm` page (single match) or renders a disambiguation list. The disambiguation page lists candidates as `<div class="search-item">` blocks with the player's name, team(s), and active year range. Surface the candidate list to the caller as `{success: false, reason: "ambiguous_name", candidates: [...]}` when there are 2+ top-tier matches; resolve automatically only when a single name+team disambiguator collapses to one row.
- **Fallback** when the search endpoint is rate-limited: the per-letter index pages at `/players/<UPPERCASE-LETTER>/` list every player whose last name starts with that letter. Match by substring on the rendered text + `<a href="/players/<L>/<id>.htm">` anchors.

### 3. Pick the right page for the requested scope

| Scope requested | Canonical URL |
|---|---|
| Bio + career season-by-season tables | `/players/<L>/<id>.htm` |
| Per-season game log | `/players/<L>/<id>/gamelog/<YEAR>/` |
| Career game log (all seasons concatenated) | `/players/<L>/<id>/gamelog/` |
| Playoffs / Super Bowl game log | `/players/<L>/<id>/gamelog/?post=1` or `/super-bowl/` |
| Splits (by season) | `/players/<L>/<id>/splits/<YEAR>/` |
| Touchdowns log | `/players/<L>/<id>/touchdowns/<scope>` (e.g. `passing`, `rushing`, `receiving`) |
| Fantasy log | `/players/<L>/<id>/fantasy/<YEAR>/` |
| Combine | `/players/<L>/<id>.htm` (combine table is embedded on the bio page when applicable) |
| Draft | `/years/<YEAR>/draft.htm#drafts` (or embedded on bio page) |

For multi-scope requests, open the bio page once (it contains most career season-by-season tables) and only navigate to `/gamelog/` / `/splits/` when granularity demands it. Each navigation costs another Cloudflare warmup if the cookie expired.

### 4. Open the page and snapshot

```bash
browse open --remote "https://www.pro-football-reference.com/players/$L/$ID.htm"
browse wait load
browse wait timeout 2000     # PFR runs late-arriving JS that injects sticky-table headers
browse snapshot              # confirm the player banner refs are present
```

Verify the snapshot contains the player name as the page `<h1>` text (e.g. `heading "Patrick Mahomes"`). If the snapshot reads "Just a moment…" or "Verifying you are human" the Cloudflare challenge didn't complete — re-open after `browse wait timeout 5000`. If it still fails, the session was flagged: release it and create a fresh Verified session.

### 5. Extract bio meta (always on the bio page, never comment-wrapped)

PFR exposes the player meta block as `<div id="meta">` near the top of the bio page. Read with `browse eval`:

```bash
browse eval "(() => {
  const m = document.getElementById('meta');
  if (!m) return null;
  return {
    name: m.querySelector('h1 span')?.textContent || m.querySelector('h1')?.textContent,
    text: m.innerText
  };
})()"
```

Parse from `m.innerText` (newline-separated lines): position(s), height/weight, DOB (linked to `/friv/birthdays.cgi`), birthplace, college, draft round/pick/year/team, HOF status, NFL team/year ranges. The text is consistent across players and is **not comment-wrapped** — read directly.

### 6. Extract stat tables (mix of visible-DOM and comment-wrapped)

**Critical PFR scraping pattern**: secondary stat tables are wrapped in HTML comments inside placeholder divs to defeat naive `document.querySelector('table#...')` calls:

```html
<div class="table_container is_setup" id="div_rushing_and_receiving">
  <!--
    <table class="row_summable sortable stats_table now_sortable" id="rushing_and_receiving">
      <thead>...</thead><tbody>...</tbody>
    </table>
  -->
</div>
```

PFR's own client-side JS un-comments these on load (after a 1-3 s delay) — so by the time `browse snapshot` runs after `wait timeout 2000`, **most placeholder divs are already promoted** and the tables are queryable via plain DOM. But not always: some tables (advanced passing/rushing/receiving, snap counts on bio pages, splits sub-tables) ship un-promoted on initial load and only un-comment when their parent section becomes visible. Belt-and-suspenders extractor:

```javascript
// browse eval — extract all stat tables, including those still in comment form
const tables = {};
// Visible DOM tables
document.querySelectorAll('table.stats_table[id]').forEach(t => {
  tables[t.id] = parseTable(t);
});
// Comment-wrapped tables under placeholders
document.querySelectorAll('div.placeholder, div.table_container').forEach(div => {
  for (const node of div.childNodes) {
    if (node.nodeType === 8 /* COMMENT_NODE */ && /<table[^>]+id=/i.test(node.nodeValue)) {
      const tmp = document.createElement('div');
      tmp.innerHTML = node.nodeValue;
      tmp.querySelectorAll('table[id]').forEach(t => {
        if (!tables[t.id]) tables[t.id] = parseTable(t);
      });
    }
  }
});

function parseTable(t) {
  // Use the LAST <thead><tr> as the header row — PFR stacks an "over-header"
  // group row (e.g. "Passing | Rushing | …") above the real column-header row.
  const headRows = t.querySelectorAll('thead tr');
  const headTr = headRows[headRows.length - 1];
  const cols = [...headTr.querySelectorAll('th')]
    .map(th => th.getAttribute('data-stat') || th.textContent.trim());
  const rows = [];
  for (const tr of t.querySelectorAll('tbody tr')) {
    if (tr.classList.contains('thead')) continue;   // mid-table repeat-header rows
    const row = { _table: t.id, _stat_keys: {} };
    for (const cell of tr.children) {
      const key = cell.getAttribute('data-stat');
      const txt = cell.textContent.trim();
      if (key) row._stat_keys[key] = txt;
      row[cell.textContent.trim() ? (cell.getAttribute('data-stat') || cell.textContent) : '_'] = txt;
    }
    rows.push(row);
  }
  return { id: t.id, columns: cols, rows };
}
```

Prefer `data-stat` attribute keys over visible-text headers — PFR uses stable machine-readable stat keys like `pass_cmp`, `pass_att`, `pass_yds`, `pass_td`, `pass_int`, `pass_rating`, `qbr`, `qbrec`, `rush_yds`, `rec`, `rec_yds`, `def_int`, `tackles_solo`, `snap_counts_offense`, `av`. The visible header text may collide (e.g. "Yds" appears for both passing yards and sack yards within one row); `data-stat` doesn't.

### 7. Known table ids per scope

| Stat scope (input) | Table id(s) on bio page (`/players/<L>/<id>.htm`) |
|---|---|
| passing | `passing` (visible) |
| advanced passing | `passing_advanced` (comment-wrapped) |
| rushing / receiving | `rushing_and_receiving` (comment-wrapped for skill-position players; visible for pure RBs) |
| advanced rushing | `rushing_advanced` (comment-wrapped) |
| advanced receiving | `receiving_advanced` (comment-wrapped) |
| defense | `defense` (visible for DBs/LBs) |
| advanced defense | `defense_advanced` (comment-wrapped) |
| kicking | `kicking` (visible) |
| punting | `punting` (visible) |
| returns | `returns` (visible) |
| scoring | `scoring` (visible) |
| snap counts | `snap_counts` (comment-wrapped) |
| games played | `games_played_team` (comment-wrapped) |
| fantasy | `fantasy` (comment-wrapped) |
| combine | `combine` (comment-wrapped if present — many players have no row) |
| draft | `draft` (in the meta block, not a separate table) |
| playoffs | `passing_playoffs`, `rushing_and_receiving_playoffs`, `defense_playoffs`, etc. (each one comment-wrapped) |

Game-log pages (`/gamelog/[/<year>/]`) use ids `stats`, `stats_basic_nfl`, `stats_advanced_nfl`, `stats_playoffs`. Splits pages (`/splits/<year>/`) use ids like `stats` plus `splits` sub-tables labelled by the split type.

### 8. Per-game / per-16 / per-17 derived rows

PFR appends `Career`, `<N> seasons`, and per-game footer rows directly in `<tfoot>` of each season-by-season table. Detect by `tr.parentElement.tagName === 'TFOOT'` or by checking for an empty `data-stat="year_id"` on the first cell. Preserve these as separate footer rows (`_table_section: "tfoot"`) so callers can choose to pass them through or filter.

PFR doesn't emit per-game rate rows automatically for every stat. To get them client-side, divide totals by the `g_played` (or `g`) column from the same row. Per-16 / per-17 conversion is the caller's responsibility — PFR shows raw totals, not normalized.

### 9. Multi-position players, mid-career trades

A row's `team_name_abbr` (data-stat) may be `2TM` / `3TM` ("2 teams in same season") with a per-team breakdown immediately below. Don't drop the `2TM` summary row; preserve it as the canonical season total and the per-team rows as sub-rows (`_split_of_year: "2024"`).

### 10. Rate limit + politeness

PFR's robots.txt (when reachable) historically asked for **≥ 3 s between requests, 20 req/min cap** and a descriptive User-Agent. Cloudflare also rate-limits aggressive clients independently. Keep ≤ 1 req every 3 s sustained, fewer in parallel, and don't open 10+ pages from one session in rapid sequence — Cloudflare will gate the session on a JS-challenge re-prompt that the Verified bypass may not pass on retry.

### 11. Release the session

```bash
bb sessions update "$SID" --status REQUEST_RELEASE
```

## Site-Specific Gotchas

- **Cloudflare JS challenge on every path — verified 2026-05-18**. Bare `bb fetch` (with or without `--proxies`) returns 403 with `Just a moment…` HTML, `__cf_bm` cookie, `cf-mitigated: challenge` header, and a CSP listing `challenges.cloudflare.com`. This is true for `/`, `/robots.txt`, every `/players/…` path, AND the `pfref.com` short-link domain. **A Verified browser session is the only working path.**
- **Sandbox / CDP gateway hostname must be reachable**. Driving a Browserbase session requires DNS resolution of `connect.<region>.browserbase.com` (e.g. `connect.use1.browserbase.com`). Some hardened sandboxes only allowlist `api.browserbase.com` and DNS-block the connect gateway; in that case sessions can be created via the REST API but not driven, and a different egress (or sandbox network-policy update) is required. If you see `ENOTFOUND connect.usw2.browserbase.com` on `browse open --remote`, that's this wall, not a Browserbase outage.
- **HTML-comment-wrapped tables — PFR's signature defense.** Many tables (`rushing_and_receiving`, `passing_advanced`, `snap_counts`, `games_played_team`, all `*_playoffs` variants) live inside `<div class="placeholder|table_container">` blocks as raw HTML inside an HTML comment node. PFR's own JS un-comments them on load with a 1-3 s delay. After `browse open + wait load + wait timeout 2000` most are promoted, but ALWAYS scan comment children of placeholder/table_container divs as a fallback. Naive `querySelector('table#snap_counts')` will miss them on first paint.
- **Two `<thead>` rows per table — use the second.** Most stats tables stack an "over-header" group row (e.g. `Passing | Rushing | Receiving`) above the actual column-header row. Extract from `thead tr:last-child`, not `thead tr`.
- **`data-stat` is the stable column key, not the visible header.** Header text duplicates within a row (`Yds` for both passing yards and sack yards on a passing row). Use the `data-stat` attribute on each `<th>`/`<td>` (e.g. `pass_yds`, `pass_sacked_yds`, `qbr`, `rate`, `any_a`, `rush_ybc`, `rec_yac`, `def_int`, `snap_counts_offense_pct`).
- **Mid-table repeat header rows have `class="thead"`** — skip them, they're rendered as part of `<tbody>` but contain the same labels as the header row.
- **`<tfoot>` carries Career / per-game / N seasons aggregates** — keep them flagged as footer rows (`_table_section: "tfoot"`); don't merge them into the season rows.
- **Multi-team season → `2TM` / `3TM` summary row + per-team sub-rows**. Preserve both; downstream callers want either depending on the question.
- **PFR ID letter prefix is the FIRST letter of the LAST name (uppercase).** Mahomes → `/players/M/MahoPa00.htm`, Brady → `/players/B/BradTo00.htm`. The ID itself starts with the same letter, but anchor on the last name when constructing URLs from a name input.
- **Player-search endpoint redirects on single match, paginates on multi**. `/search/search.fcgi?search=<q>` 302s to `/players/<L>/<id>.htm` when one player matches; otherwise returns a `<div class="search-item">` list of all candidates. Drive your disambiguation logic off the response status — a 200 with no redirect means "more than one match".
- **`/players/<L>/<id>/touchdowns/<scope>` exists** for passing/rushing/receiving TDs as a per-TD log (date, quarter, distance, opponent). Useful if the caller wants TD-level granularity, but the row count is large for long careers — only fetch when explicitly requested.
- **Game logs split regular-season vs playoffs by URL param**. `/gamelog/` shows regular-season; `/gamelog/?post=1` (or the table id `stats_playoffs` on the same page when the player has playoff games) shows postseason. For "both", read the same page and capture both table ids.
- **Splits live on a separate page per season** — there's no all-time splits view. Caller asking for "career red-zone splits" requires N requests, one per season. Be deliberate about rate limit.
- **Active-season stats lag a few hours**. PFR pulls from official feeds with a delay; for in-progress games the row may be missing or show stale totals. Document the page's "Last updated" footer timestamp when present.
- **Stathead / `pfref.com` is paywalled** — same Cloudflare tenant, same 403 on bare fetch, but even with Verified-bypass the content sits behind a subscription gate. **Do not** click "Subscribe", "Stathead", or any login/account control. The skill is read-only on the public PFR surface.
- **No public JSON API exists** — confirmed across multiple iterations. There are private XHR endpoints feeding the rendered tables but they require the Cloudflare-issued session cookie and a CSRF-like signed request; don't waste time trying to call them directly. The DOM extraction path is the canonical mechanism.
- **Alternative pre-extracted data sources** (when fresh-scrape isn't required and the caller wants bulk historicals): `nflverse-data` GitHub releases (https://github.com/nflverse/nflverse-data/releases — reachable from sandbox without Cloudflare) ship CSV/parquet aggregations of PFR + other sources, refreshed weekly during the season. Faster and cheaper than scraping, but lags by ~24 h and is community-maintained, so cross-check before quoting.

## Expected Output

```json
{
  "success": true,
  "player": {
    "pfr_id": "MahoPa00",
    "url": "https://www.pro-football-reference.com/players/M/MahoPa00.htm",
    "full_name": "Patrick Mahomes",
    "positions": ["QB"],
    "height": "6-2",
    "weight_lb": 225,
    "date_of_birth": "1995-09-17",
    "birthplace": "Tyler, TX",
    "college": "Texas Tech",
    "draft": { "year": 2017, "round": 1, "pick": 10, "team": "Kansas City Chiefs" },
    "hof": false,
    "teams": [{ "team": "KAN", "years": [2017, 2025] }],
    "career_start": 2017,
    "career_end": null,
    "active": true
  },
  "tables_on_page": [
    { "id": "passing",                "comment_wrapped": false },
    { "id": "rushing_and_receiving",  "comment_wrapped": true  },
    { "id": "passing_advanced",       "comment_wrapped": true  },
    { "id": "snap_counts",            "comment_wrapped": true  },
    { "id": "passing_playoffs",       "comment_wrapped": true  }
  ],
  "stats": {
    "passing": {
      "table_id": "passing",
      "columns": ["year_id","age","team_name_abbr","pos","uniform_number","g","gs","qbrec","pass_cmp","pass_att","pass_cmp_pct","pass_yds","pass_td","pass_td_pct","pass_int","pass_int_pct","pass_first_down","pass_success","pass_long","pass_yds_per_att","pass_adj_yds_per_att","pass_yds_per_cmp","pass_yds_per_g","pass_rating","qbr","pass_sacked","pass_sacked_yds","pass_sacked_pct","pass_net_yds_per_att","pass_adj_net_yds_per_att","comebacks","gwd","av","awards"],
      "rows": [
        {
          "_table": "passing",
          "_table_section": "tbody",
          "year_id": "2017", "age": "22", "team_name_abbr": "KAN", "pos": "qb",
          "g": "1", "gs": "0", "qbrec": "0-0-0",
          "pass_cmp": "22", "pass_att": "35", "pass_cmp_pct": "62.9",
          "pass_yds": "284", "pass_td": "0", "pass_int": "1",
          "pass_rating": "76.4", "qbr": "44.0", "av": "0"
        }
      ],
      "footer_rows": [
        { "_table_section": "tfoot", "year_id": "Career", "g": "...", "pass_yds": "..." },
        { "_table_section": "tfoot", "year_id": "9 seasons", "..." : "..." }
      ]
    }
  }
}
```

Outcome variants (use `success: false` with a `reason` discriminator):

```json
// Name resolves to multiple players — surface candidates for disambiguation
{ "success": false, "reason": "ambiguous_name",
  "candidates": [
    { "pfr_id": "SmitDe00", "name": "DeAndre Smith", "teams": ["TB"], "years": [1998, 2001] },
    { "pfr_id": "SmitDe01", "name": "Devin Smith",   "teams": ["NYJ"], "years": [2015, 2017] }
  ] }

// Free-form name had zero hits on the search endpoint
{ "success": false, "reason": "player_not_found", "query": "Jaxxon Smithwick" }

// Cloudflare challenge couldn't be solved (session flagged, captcha, etc.)
{ "success": false, "reason": "anti_bot_block",
  "http_status": 403, "cf_mitigated": "challenge",
  "detail": "Bare fetch and Verified session both 403'd. Retry with a fresh Verified+proxy session." }

// Page exists but the requested table id is absent for this player
// (e.g. asking for `kicking` on a QB)
{ "success": false, "reason": "stat_scope_not_applicable",
  "pfr_id": "MahoPa00", "requested_scope": "kicking",
  "available_scopes": ["passing", "rushing_and_receiving", "snap_counts", "passing_advanced"] }
```
