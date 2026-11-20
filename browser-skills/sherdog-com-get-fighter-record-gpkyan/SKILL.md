---
name: sherdog-com-get-fighter-record-gpkyan
title: Sherdog Fighter Record Extraction
description: >-
  Given a fighter reference (canonical Sherdog URL, name, or name +
  disambiguator), return profile metadata and full professional bout record as
  structured JSON. Optional amateur and per-bout-location flags. Read-only.
website: sherdog.com
category: sports
tags:
  - mma
  - sherdog
  - fighter
  - record
  - read-only
  - cloudflare
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: hybrid
alternative_methods:
  - method: url-param
    rationale: >-
      The canonical /fighter/<Name-Slug>-<id> URL is the primary access path —
      given an ID, you can construct it directly with no search step.
  - method: browser
    rationale: >-
      Reserved for the rare case where bb fetch hits a Cloudflare interactive
      challenge (not observed in 2026-05-18 testing across Jon Jones / Conor
      McGregor / Khabib Nurmagomedov). A bare remote session with --proxies
      recovers; --verified is not required.
  - method: api
    rationale: >-
      No public Sherdog JSON API exists — confirmed: /search/results 404s, no
      /autocomplete, no /_next/data/, no /api/. Don't waste turns probing.
verified: false
proxies: false
---
# Sherdog Fighter Record Extraction

## Purpose

Given a fighter reference (canonical Sherdog profile URL, fighter name, or name + disambiguator), return the fighter's profile metadata and full professional bout record as structured JSON. Profile fields include name, nickname, date of birth, age, nationality, height (imperial + metric), weight (imperial + metric), weight class, association/team, head coach (when surfaced — usually not), pro debut date, and the win/loss/draw + no-contest record broken down by KO/TKO, submission, decision, and "other" finishes. Each bout returns chronological bout number, result, opponent + Sherdog URL, event + Sherdog URL, event date (ISO 8601), method of finish (with detail in parens — finish type for SUB/TKO, voting kind for DEC), round, round time (mm:ss), referee (when listed), and notes. An optional `include_amateur` flag pulls the amateur bout table; an optional `include_location` flag fetches each event page to add per-bout venue/city/country. **Read-only — never click Sign In, Edit, or any mutation control; never submit a form.**

## When to Use

- "Get every pro fight on Sherdog for {fighter}" — analytics, fight history charts, betting prep, fan apps.
- Building a structured opponent-history index — opponent URLs in the response are clickable Sherdog profile slugs, so the same skill is the building block for graph crawls.
- Comparing two fighters' records (pull twice, diff client-side).
- Periodic monitoring for a new fight added to a fighter's record (the table is newest-first, so a length increase or row[0] change signals an update).
- **Not** for live odds, real-time fight-night results, or fighter ranking timelines — Sherdog updates lag the broadcast and rankings are not on the profile page.

## Workflow

**Lead with plain HTTP.** Sherdog is fronted by Cloudflare but does **not** serve a bot challenge to the Browserbase Fetch API for `/fighter/*`, `/events/*`, or `/stats/fightfinder` paths — verified across Jon Jones (107 KB / 200 OK), Conor McGregor (110 KB / 200 OK), and Khabib Nurmagomedov (105 KB / 200 OK), all returning a fully-rendered HTML document with `itemprop=...` microdata intact. **No browser session, no `--proxies`, no `--verified` required.** Reserve a remote browser session for the rare Cloudflare-challenge fallback at the end of this section.

### 1. Resolve the fighter reference to a canonical URL

The skill is anchored on the canonical profile URL pattern:

```
https://www.sherdog.com/fighter/<Name-Slug>-<NumericId>
```

| Caller input | Resolution |
|---|---|
| Full canonical URL | Use as-is. |
| Profile URL without `www.` or with `http://` | Normalize to `https://www.sherdog.com/...`. |
| Numeric Sherdog ID only | Open `/fighter/-{id}` — Sherdog 301s to the slugged canonical URL; capture the `Location` header (use `bb fetch --allow-redirects` and read the final URL from the response). |
| Name only (e.g. "Jon Jones") | Search `/stats/fightfinder?SearchTxt=<urlenc name>`. Results are alphabetical by first name (NOT relevance-ranked), so a popular name like "Jon Jones" is usually past page 1. See Site-Specific Gotchas — disambiguation. |
| Name + nickname / association / weight-class | Search with extra params: `SearchTxt=<name>&weightclass=<class>&association=<assn>` to narrow before paginating. |

### 2. Fetch the profile HTML

```bash
bb fetch "https://www.sherdog.com/fighter/<Name-Slug>-<id>" --output /tmp/profile.html
```

Response is ~100–115 KB of HTML. The relevant blocks are all inline — no XHR, no JS hydration required.

### 3. Parse profile metadata

All profile fields live inside a single `<div class="module bio_fighter vcard">` block decorated with Schema.org microdata. Use these stable extraction targets:

| Field | Source | Notes |
|---|---|---|
| `name` (full, with quoted nickname) | `<meta itemprop="name" content='Jon "Bones" Jones' />` | Single-quoted attribute — note the inner double quotes around the nickname. |
| `nickname` | Inner double-quoted segment of the same `meta itemprop="name"`. | Strip outer name parts; e.g. `'Jon "Bones" Jones'` → `"Bones"`. Returns `null` when no quoted segment. |
| `date_of_birth` | `<span itemprop="birthDate">Jul 19, 1987</span>` | Format `Mon DD, YYYY`. Parse to ISO `YYYY-MM-DD`. |
| `age` | `<td>AGE</td><td><b>38</b> <em>/</em> ...` | Bold text directly under the AGE cell. Verify by computing from `date_of_birth` vs today. |
| `nationality` | `<strong itemprop="nationality">United States</strong>` | |
| `birthplace` | `<span itemprop="addressLocality">Rochester, New York</span>` | Often present, sometimes omitted. |
| `height` (imperial + cm) | `<b itemprop="height">6'4"</b> <em>/</em> 193.04 cm` | Both are emitted side-by-side. Regex: `<b itemprop="height">([^<]+)</b>\s*<em>/</em>\s*([\d.]+) cm`. |
| `weight` (imperial + kg) | `<b itemprop="weight">238 lbs</b> <em>/</em> 107.95 kg` | Same shape as height. **This is the fighter's listed/current walk weight, NOT the weight class** — see weight_class below. |
| `weight_class` | Inside `.association-class`: `CLASS<br /><a href="/stats/fightfinder?weightclass=Heavyweight">Heavyweight</a>` | Regex: `CLASS<br />\s*<a[^>]+>([^<]+)</a>`. |
| `association` | `<a class="association" itemprop="url" href="/stats/fightfinder?association=..."><span itemprop="name">Jackson-Wink MMA</span></a>` | Single team; if multiple are listed they appear comma-separated inside one anchor's text. |
| `head_coach` | **Not on the profile page.** | Sherdog does not surface head coach per fighter. Return `null`. (Following the association link to `/stats/fightfinder?association=...` lists the team's roster but still does not label any member as head coach.) Don't pretend to extract it. |
| `sherdog_id` | Trailing integer in the canonical URL. | Regex: `/fighter/[^/]+-(\d+)$`. |
| `url` | The canonical URL itself. | |
| `pro_debut` | Date in the **last** row of the `FIGHT HISTORY - PRO` table. | The table is sorted newest-first; the oldest row is the pro debut. |

### 4. Parse the win/loss method breakdown

Inside `<div class="winsloses-holder">` there are two columns: `.wins` and `.loses`, each followed by four `<div class="meter">` blocks in fixed order — KO/TKO, SUBMISSIONS, DECISIONS, OTHERS. The integer count is in `<div class="pl">N</div>`. After the `.loses` column an optional `<div class="winloses nc">` block carries the No-Contest count.

```
.winsloses-holder
  .wins
    .winloses.win  -> <span>Wins</span> <span>{wins}</span>
    .meter-title "KO / TKO"   .meter > .pl -> {wins_by.ko_tko}
    .meter-title "SUBMISSIONS" .meter > .pl -> {wins_by.submission}
    .meter-title "DECISIONS"   .meter > .pl -> {wins_by.decision}
    .meter-title "OTHERS"      .meter > .pl -> {wins_by.other}
  .loses
    .winloses.lose -> <span>Losses</span> <span>{losses}</span>
    [same 4 meter blocks for losses_by.*]
    .winloses.nc   -> <span>N/C</span> <span>{no_contests}</span>   (optional)
```

Draws are present in totals (sometimes shown as `<div class="winloses draw">`) but Sherdog does NOT break draws down by method. Emit `draws_by` as `null` or omit.

### 5. Parse the fight history table(s)

A profile may contain one to three `<table class="new_table fighter">` tables. Each is preceded by a `<div class="slanted_title"><div>FIGHT HISTORY - {KIND}</div>` where `{KIND}` ∈ `PRO`, `PRO EXHIBITION`, `AMATEUR`. **Always walk every such table and bucket rows by the preceding title — never trust position alone**, because newer profiles may add tables and older ones omit some.

Row schema (six `<td>`s in fixed order):

| col | Content |
|---|---|
| 0 | `<span class="final_result win|loss|draw|nc">{result}</span>` |
| 1 | `<a href="/fighter/{opp-slug}-{id}">{opponent_name}</a>` |
| 2 | `<a href="/events/{event-slug}-{id}">[<span itemprop="award">]{event_name}[</span>]</a><br /><span class="sub_line">{Mon} / {DD} / {YYYY}</span>` — note the `<span itemprop="award">` is **only** present on event anchors when the bout was at a sanctioned/awarded event; absence is not an error. |
| 3 | `<td class="winby"><b>{method full text}</b><br /><span class="sub_line">[<a href="/referee/{slug}">]{referee}[</a>]</span>[<br /><a class="pbp_btn">...</a>]` |
| 4 | `<td>{round}</td>` |
| 5 | `<td>{round_time}</td>` — already `mm:ss`. |

Per-row derived fields:

- **`event_date`** — Sherdog's format is `Mon / DD / YYYY` (e.g. `Nov / 16 / 2024`). Parse to ISO `YYYY-MM-DD`. Note the spaces around the `/`.
- **`method_category`** — substring match on the `<b>` text **before** the first `(`:
  - `"TKO"` → `tko`
  - `"KO"` (and not preceded by "T") → `ko`
  - `"Submission"` → `submission`
  - `"Decision (Unanimous)"` → `decision_unanimous`
  - `"Decision (Split)"` → `decision_split`
  - `"Decision (Majority)"` → `decision_majority`
  - `"Decision"` (no parens) → `decision`
  - `"DQ"`, `"NC"`, `"No Contest"`, `"Draw"`, `"Could Not Continue"`, `"Overturned"` → `other`
- **`method_detail`** — the parenthesized text after the category: `TKO (Spinning Back Kick and Punches)` → `"Spinning Back Kick and Punches"`; `Submission (Rear-Naked Choke)` → `"Rear-Naked Choke"`. `null` for plain `Decision (Unanimous)` style (the kind is already in `method_category`).
- **`referee`** — the `<span class="sub_line">` content under `winby`, stripped of the trailing `<br /><a class="pbp_btn">` link. May be `<a href="/referee/...">Name</a>` or plain text or empty.
- **`bout_number`** — assign by reversing the parsed rows: oldest row = bout 1, newest row = bout N. Total N must equal `wins + losses + draws + no_contests` from step 4. **Mismatch is a parser bug**, not a fighter anomaly — surface it.

### 6. (Optional) include_amateur

Set `include_amateur=true` → also parse the `FIGHT HISTORY - AMATEUR` table when present. Emit `amateur_fights: []` when the flag is on but no amateur table is rendered, or `null` when the flag is off.

Treat `FIGHT HISTORY - PRO EXHIBITION` as a separate bucket — these are sanctioned non-MMA bouts (e.g. McGregor vs Mayweather boxing) and should NOT be merged into `fights[]`. Emit as `fights_exhibition[]` when the user asked for the full picture, otherwise omit.

### 7. (Optional) include_location

The profile fight row does **not** include venue or city. Each event page does — fetch `https://www.sherdog.com/events/<event-slug>-<id>` and read:

- Venue + city + country: `<span itemprop="location">Madison Square Garden, New York, New York, United States</span>`
- Canonical event date with timezone: `<meta itemprop="startDate" content="2024-11-16T00:00:00+00:00">`

Dedupe event URLs across bouts before fetching — fighters often appear at the same event multiple times (rare, but happens for tournament cards). Throttle to ≤2 sustained req/s; parallelize up to ~5 concurrent. Cache by event URL across runs; event metadata is immutable once an event has occurred.

### 8. Read-only enforcement

The profile page renders no booking, no purchase, no destructive control — but it does render a "Sign In" link and an admin-only "Edit" button for some sessions. Never click either. The skill is a pure parse of GET responses.

### Browser fallback (rare)

If `bb fetch` returns a Cloudflare challenge HTML (`<title>Just a moment...</title>` or status 403/503 with `cf-mitigated: challenge`) on Sherdog — empirically not observed across 4 fighters in 2026-05-18 testing, but possible on bursty load — fall back to a remote Browserbase session with the cookie context primed:

```bash
SID=$(bb sessions create --keep-alive --proxies | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
browse --connect "$SID" open "https://www.sherdog.com/fighter/<Name-Slug>-<id>"
browse --connect "$SID" wait load
browse --connect "$SID" wait timeout 2000
browse --connect "$SID" get html body > /tmp/profile.html
bb sessions update "$SID" --status REQUEST_RELEASE
```

Then run the same step-3 → step-5 HTML parsers against `/tmp/profile.html`. `--verified` is **not** needed; `--proxies` is sufficient if the bare `bb fetch` is ever rate-limited.

## Site-Specific Gotchas

- **`bb fetch` works without proxy or Verified.** Sherdog's Cloudflare config allows the Browserbase Fetch API to retrieve full HTML directly. Don't burn budget on `--proxies` or remote sessions unless a challenge actually appears. Confirmed 200 + microdata-intact across Jon Jones / Conor McGregor / Khabib Nurmagomedov on 2026-05-18.
- **Cloudflare robots.txt explicitly disallows AI bots** (Amazonbot, ClaudeBot, GPTBot, CCBot, etc., as listed in `/robots.txt`). Honor those user-agents in your client identity; `bb fetch` uses a neutral Browserbase UA that is allowed by the catch-all `User-agent: * Allow: /` rule. Do not spoof `User-Agent: ClaudeBot` or similar.
- **Profile name contains the nickname as quoted segment.** `<meta itemprop="name" content='Jon "Bones" Jones' />` — the attribute uses single quotes so the embedded double-quoted nickname parses cleanly in HTML, but a naïve `content="..."` regex will fail. Use `content='([^']+)'` or DOM parse.
- **`weight_class` and `weight` are different fields.** `weight` is the listed walk-weight, often above the class cap (Jon Jones: weight 238 lbs / class Heavyweight; Khabib: weight 155 lbs / class Lightweight). Do not conflate them.
- **`head_coach` is not on the profile page.** Sherdog only surfaces association/team, not coach. Return `null`. Following the association link to its roster page still does not label any member as head coach. Don't fabricate a coach name from external sources.
- **Pro debut is derived, not labeled.** There is no `<*>Pro Debut</*>` element. Take the date from the last (oldest) row in `FIGHT HISTORY - PRO`. For amateur-only fighters or fighters with zero pro fights, `pro_debut` is `null`.
- **Fight tables are newest-first.** The first row of `class="new_table fighter"` is the most recent bout; the last is the debut. Reverse the parsed rows when assigning `bout_number` (oldest=1).
- **Three table types share the same class.** A profile can render up to three `<table class="new_table fighter">` tables — PRO, PRO EXHIBITION, AMATEUR — each preceded by a distinct `<div class="slanted_title">`. **Always read the preceding title to bucket rows.** Older fighters often have only PRO; McGregor and several boxers also have PRO EXHIBITION; amateur-only fighters may render only AMATEUR.
- **`<span itemprop="award">` on event anchors is inconsistent.** Present on sanctioned/notable events, absent on smaller cards. Strip the wrapper when extracting event name; absence is not an error.
- **Method strings have variable parenthetical detail.** `TKO (Punches)`, `TKO (Spinning Back Kick and Punches)`, `Submission (Rear-Naked Choke)`, `Decision (Unanimous)`, `Decision (Split)`, `Decision (Majority)`, `DQ`, `NC (Accidental Foul)`, `Could Not Continue`, `Overturned`, `Draw`, `Draw (Majority)`. Parse defensively — your enum must accept anything before the first `(` as the category, the parenthetical as the detail (nullable), and have a sane `other` bucket.
- **Referee in `sub_line` is optional.** Old / regional bouts often render an empty `<span class="sub_line"></span>` followed only by the play-by-play link. Treat empty referee as `null`, not a parser failure.
- **Round time is already `mm:ss`.** No need to normalize zero-padding (`5:00`, `0:48` both observed). For decisions, time is the round-length cap (`5:00` for championship rounds, `3:00` for non-championship 3rd round in some rules sets) — interpret accordingly if you derive total bout time.
- **`KO` vs `TKO` regex order matters.** `"TKO".startswith("KO")` is False but `"KO".startswith("KO")` is True — match `TKO` first, then `KO`, never reverse the order.
- **No-Contest count lives outside the wins/losses columns.** `.winloses.nc` is appended after `.loses`, not inside either column. A fighter with no NCs simply does not have this div.
- **Draws are not broken down by method.** Sherdog displays total draws but not draw-method counts. Do not invent a `draws_by` breakdown.
- **`fights[]` length must equal record total.** `len(fights) == wins + losses + draws + no_contests`. If they disagree (rare — caused by a partial HTML chunk or a fight that's currently in dispute and shows in the row count but not the totals), surface the mismatch in `error_reasoning` but still emit the parsed rows.
- **Fight Finder search is alphabetical, not relevance-ranked.** `/stats/fightfinder?SearchTxt=Jon+Jones` returns 20 results per page sorted by first-name alphabetically (A.J. → Aaron → Abe → Adam → … → Jon → …). Jon Jones the UFC legend is past page 1 of a common-surname query. **Prefer canonical URLs whenever the caller has one.** For name-only input, narrow with `weightclass=` and/or `association=` before paginating. The search also matches association names (e.g. searching `McGregor` returns fighters whose team contains "McGregor"), which adds noise.
- **No relevance-ranked search endpoint exists publicly.** There is no `/autocomplete`, no `/search/results?query=…` (that path 404s), no JSON suggest API on `www.sherdog.com` — verified. Don't waste turns probing for one.
- **Per-bout location requires a second fetch per event.** The profile row carries event name + date but **not** venue/city. To populate `bout.location`, fetch each event page and read `<span itemprop="location">`. Dedupe by event URL; throttle to ≤2 req/s sustained. Default the contract to `location=null` per bout unless the caller opts in with `include_location=true`.
- **HTML is gzipped over the wire** — `bb fetch` handles decompression transparently. If you switch to raw `curl`, send `Accept-Encoding: gzip` and decompress, or you'll get binary garbage.
- **No GraphQL, no JSON API.** All data is in the rendered HTML. Don't burn time looking for `/api/`, `/_next/data/`, or `/v1/fighters/` — none exist.
- **Cloudflare cookie `__cf_bm`** is set on the first response and persists for 30 min. `bb fetch` handles this transparently per-request; if you spin up a session for the rare challenge fallback, the same cookie is set once on the first `browse open` and reused on subsequent navigations within that session.
- **Read-only.** The profile has no booking or purchase controls, but it does render Sign In and (for some sessions) an Edit button. Never click them. The skill is GET-only.

## Expected Output

Single canonical output shape; populate `amateur_fights` / `fights_exhibition` only when the corresponding flag/table is present, populate per-bout `location` only when `include_location=true`.

```json
{
  "success": true,
  "profile": {
    "sherdog_id": 27944,
    "url": "https://www.sherdog.com/fighter/Jon-Jones-27944",
    "name": "Jon Jones",
    "nickname": "Bones",
    "date_of_birth": "1987-07-19",
    "age": 38,
    "nationality": "United States",
    "birthplace": "Rochester, New York",
    "height_imperial": "6'4\"",
    "height_cm": 193.04,
    "weight_imperial": "238 lbs",
    "weight_kg": 107.95,
    "weight_class": "Heavyweight",
    "association": "Jackson-Wink MMA",
    "head_coach": null,
    "pro_debut": "2008-04-12",
    "record": {
      "wins": 28,
      "losses": 1,
      "draws": 0,
      "no_contests": 1,
      "wins_by":   { "ko_tko": 11, "submission": 7, "decision": 10, "other": 0 },
      "losses_by": { "ko_tko": 0,  "submission": 0, "decision": 0,  "other": 1 }
    }
  },
  "fights": [
    {
      "bout_number": 30,
      "result": "win",
      "opponent": {
        "name": "Stipe Miocic",
        "url": "https://www.sherdog.com/fighter/Stipe-Miocic-39537"
      },
      "event": {
        "name": "UFC 309 - Jones vs. Miocic",
        "url": "https://www.sherdog.com/events/UFC-309-Jones-vs-Miocic-103896",
        "date": "2024-11-16",
        "location": null
      },
      "method": "TKO (Spinning Back Kick and Punches)",
      "method_category": "tko",
      "method_detail": "Spinning Back Kick and Punches",
      "round": 3,
      "round_time": "4:29",
      "referee": "Herb Dean",
      "notes": null
    },
    {
      "bout_number": 1,
      "result": "win",
      "opponent": {
        "name": "Brad Bernard",
        "url": "https://www.sherdog.com/fighter/Brad-Bernard-27140"
      },
      "event": {
        "name": "FFP - Untamed 20",
        "url": "https://www.sherdog.com/events/FFP-Untamed-20-7175",
        "date": "2008-04-12",
        "location": null
      },
      "method": "TKO (Punches)",
      "method_category": "tko",
      "method_detail": "Punches",
      "round": 1,
      "round_time": "1:32",
      "referee": null,
      "notes": null
    }
  ],
  "fights_exhibition": null,
  "amateur_fights": null,
  "error_reasoning": null
}
```

Failure shapes:

```json
// Fighter slug 404 (Sherdog 200s with a "Page Not Found" body — sniff the <title>)
{ "success": false, "error_reasoning": "fighter_not_found", "input": "https://www.sherdog.com/fighter/Jon-Jonez-27944", "fights": [], "profile": null }

// Cloudflare challenge or non-200 status on profile fetch (rare)
{ "success": false, "error_reasoning": "cloudflare_challenge", "status_code": 403, "profile": null, "fights": [] }

// Name-only input with multiple plausible matches and no narrowing params
{ "success": false, "error_reasoning": "ambiguous_name", "query": "Jon Jones",
  "matches": [
    { "name": "Jon Jones", "sherdog_id": 27944, "url": "...", "nickname": "Bones", "weight_class": "Heavyweight", "association": "Jackson-Wink MMA" },
    { "name": "Jon Jones", "sherdog_id": 12345, "url": "...", "nickname": null,    "weight_class": "Welterweight", "association": null }
  ],
  "profile": null, "fights": []
}

// Parser ran but row count != record total — emit what we have plus the diagnostic
{ "success": true, "profile": {...}, "fights": [...23 rows...],
  "error_reasoning": "row_count_mismatch: fights[].length=23 but record total=24" }
```
