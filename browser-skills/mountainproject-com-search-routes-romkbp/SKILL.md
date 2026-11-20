---
name: mountainproject-com-search-routes-romkbp
title: Mountain Project Route Finder Search
description: >-
  Search mountainproject.com for climbing routes via the cookie-less Route
  Finder, returning structured per-route results (grade, type, pitches, length,
  stars, votes, area path, lat/lng) with the full filter surface: area, grading
  system + grade range, route style, pitches, min star rating, and sort.
website: mountainproject.com
category: climbing
tags:
  - climbing
  - rock-climbing
  - mountain-project
  - route-search
  - outdoor
  - read-only
source: 'browserbase: agent-runtime 2026-06-04'
updated: '2026-06-04'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      A Browserbase session navigating the same /route-finder results URL works
      and is the only way to read per-route vote counts inline, but it pays a
      large cost premium (the page is JS-heavy, ~1100 a11y refs, and route IDs
      only live in anchor hrefs, not the rendered text). Use only if the plain
      HTTP path is ever blocked — no anti-bot wall was observed in testing.
  - method: api
    rationale: >-
      The documented JSON data API (/data/get-routes,
      /data/get-routes-for-lat-lon) requires an apiKey from a logged-in profile
      and returns fewer fields than the CSV export. Do not use unless an apiKey
      is supplied; the cookie-less route-finder + export covers everything
      except first-ascent.
verified: false
proxies: false
---
# Mountain Project Route Finder Search

## Purpose

Search mountainproject.com for rock/ice/boulder climbing routes and return structured
per-route results — id, name, canonical URL, grade (raw + system), route type, pitch
count, length, average star rating, vote count, area breadcrumb, and crag lat/lng.
Read-only; never logs in, votes, or edits.

The entire query is expressible as a **cookie-less HTTP GET** against the Route Finder.
No API key, no login, no cookies, and no anti-bot stealth were required in testing.
Two surfaces back the same query string:

- `/route-finder-export` → **CSV** (up to 1000 rows in one request; has length + lat/lng).
- `/route-finder` → **HTML** results table (50 routes/page, paginated; the only surface
  that carries per-route vote counts).

## When to Use

- "Find trad routes 5.8–5.11a in Boulder Canyon with at least 2 stars."
- Bulk export of every route in an area/state matching a grade + type filter.
- Building a climbing-trip shortlist filtered by grade, style, pitches, and quality.
- Any flow that would otherwise scrape Mountain Project HTML — the GET surface is faster,
  cleaner, and cookie-less.

## Workflow

The Route Finder form itself is guarded by a reCAPTCHA and a `winnie-the-pooh` honeypot
field on POST — **never submit the form.** Instead build the results URL directly: the
complete filter set lives in the query string and is bookmark-stable. The GET path
bypasses the captcha entirely.

### 1. Resolve the area to a `selectedIds` value

`selectedIds` is a Mountain Project **area ID** (the number in `/area/<id>/<slug>`). It can
be any level of the hierarchy — country, state, area, sub-area, or crag — and scopes the
search to that node and everything under it.

- If the caller passes an area ID, use it directly.
- If the caller passes a free-form area name, resolve it: open
  `https://www.mountainproject.com/route/finder` is not needed — instead fetch the area
  page via the site search (`https://www.mountainproject.com/ajax/autocomplete?q=<name>`)
  or navigate to the area and read the `/area/<id>/` from the resulting URL. Known IDs from
  testing: Boulder Canyon, CO = `105744222`; Colorado (state) = `105708956`.
- **Omitting `selectedIds` searches the whole site** (very large; always pair with a tight
  grade/type/stars filter).

### 2. Pick the grading system with `type`, then the grade range

`type` selects which grading system the grade-range filter applies to — the grade range
works **within one system at a time**, never across systems:

| `type` | System | Grade params |
|---|---|---|
| `rock` | YDS (5.x) | `diffMinrock` / `diffMaxrock` |
| `boulder` | V-scale | `diffMinboulder` / `diffMaxboulder` |
| `ice` | WI **and** AI | `diffMinice` / `diffMaxice` |
| `mixed` | M | `diffMinmixed` / `diffMaxmixed` |
| `aid` | A/C | `diffMinaid` / `diffMaxaid` |

Grade labels map to **internal numeric IDs, and the min and max scales differ for the same
label** (the min ID is the floor of a grade band, the max ID is the ceiling). Use these
verified maps:

**YDS — `diffMinrock`:** `3rd`=800 `4th`=900 5.0=1000 5.1=1100 5.2=1200 5.3=1300 5.4=1400
5.5=1500 5.6=1600 5.7=1800 5.8=2000 5.9=2300 5.10a=2600 5.10b=2700 5.10c=3100 5.10d=3300
5.11a=4600 5.11b=4800 5.11c=5100 5.11d=5300 5.12a=6600 5.12b=6700 5.12c=7100 5.12d=7300
5.13a=8600 5.13b=8700 5.13c=9200 5.13d=9500 5.14a=10500 5.14b=10900 5.14c=11200 5.14d=11500
5.15a=11600 5.15b=11900 5.15c=12100 5.15d=12400

**YDS — `diffMaxrock`:** `3rd`=800 `4th`=900 5.0=1000 5.1=1100 5.2=1200 5.3=1300 5.4=1400
5.5=1500 5.6=1600 5.7=1900 5.8=2200 5.9=2500 5.10a=2800 5.10b=3100 5.10c=3400 5.10d=3500
5.11a=4800 5.11b=5100 5.11c=5400 5.11d=5500 5.12a=6800 5.12b=7100 5.12c=7400 5.12d=7500
5.13a=8700 5.13b=8900 5.13c=9300 5.13d=9500 5.14a=10500 5.14b=10900 5.14c=11200 5.14d=11500
5.15a=11600 5.15b=11900 5.15c=12100 5.15d=12400

**V-scale `diffMinboulder`:** V0=20000 V1=20050 V2=20150 V3=20250 V4=20350 V5=20450 V6=20550
V7=20650 V8=20750 V9=20850 V10=20950 V11=21050 V12=21150 V13=21250 V14=21350 V15=21450
V16=21550 V17=21650. **`diffMaxboulder`** shifts by one step: V0=20050 V1=20150 … V16=21650 V17=21700.

**Ice `diffMinice`:** WI1=30000 WI2=30750 WI3=31500 WI4=32500 WI5=33500 WI6=34500 WI7=35500
WI8=36500 AI1=38000 AI2=38100 AI3=38200 AI4=38300 AI5=38400 AI6=38500 (WI and AI share the
`ice` system). **Mixed `diffMinmixed`:** M1=50000 M2=50500 M3=51500 … M16=64900.
**Aid `diffMinaid`:** A0/C0=70000 A1/C1=70500 A2/C2=71500 A3/C3=72500 A4/C4=73500 A5/C5=74500;
`diffMaxaid` A0/C0=70510 … A5/C5=75260.

The diff params for the *other* systems can be left at their full-range defaults (they're
ignored unless `type` selects them). Safe wide defaults seen in the wild: `diffMinboulder=20000`
`diffMaxboulder=21700` `diffMinaid=70000` `diffMaxaid=75260` `diffMinice=30000` `diffMaxice=38500`
`diffMinmixed=50000` `diffMaxmixed=65050`.

### 3. Add the remaining filters

- **Route style (rock only):** `is_trad_climb=1`, `is_sport_climb=1`, `is_top_rope=1`
  (multi-select; omit a flag to exclude that style). These only apply when `type=rock`.
  Boulder / ice / mixed / aid route categories come from the `type` selector itself.
- **Min star rating — `stars`:** a *discrete* set whose values are offset from the label —
  pass the **value**, not the label number: `0`=All, `1.8`=1+, `2.3`=1.5+, `2.8`=2+,
  `3.3`=2.5+, `3.8`=3+ (out of 4). I.e. to require "≥2 stars" pass `stars=2.8`.
- **Pitches — `pitches`:** `0`=any, `1`=exactly 1 (single-pitch only), `2`=at least 2
  (multi-pitch only), `3`=≥3, `4`=≥4, `5`=≥5, `6`=6+. There is **no max-pitch cap**.
- **Sort — `sort1` / `sort2`:** `popularity desc`=Popularity (default), `rating`=Difficulty,
  `title`=Name, `area`=Area. Use a two-key sort, e.g. `sort1=popularity+desc&sort2=rating`.
- **Pagination — `page=N`:** HTML returns 50 routes/page; increment `page` for more.

### 4. Fetch and parse

**Primary (CSV, up to 1000 rows, cookie-less HTTP GET):**

```
GET https://www.mountainproject.com/route-finder-export?selectedIds=105744222&type=rock&diffMinrock=2000&diffMaxrock=4800&diffMinboulder=20000&diffMaxboulder=21700&diffMinaid=70000&diffMaxaid=75260&diffMinice=30000&diffMaxice=38500&diffMinmixed=50000&diffMaxmixed=65050&is_trad_climb=1&is_sport_climb=1&stars=2.8&pitches=0&sort1=popularity+desc&sort2=rating
```

Returns `text/csv` with header:
`Route, Location, URL, "Avg Stars", "Your Stars", "Route Type", Rating, Pitches, Length, "Area Latitude", "Area Longitude"`.
Map columns → output fields. `Location` is the area breadcrumb **most-specific-first**
(`"Bell Buttress - Main Crag > ... > Boulder Canyon > Boulder > Colorado"`) — reverse it for
a broad→specific `area_path`. Extract `id` from the `/route/<id>/<slug>` URL. `Avg Stars` is
the 0–4 rating; `Your Stars` is always `-1` cookie-less (ignore). Unrated routes sort last
with `Avg Stars = -1.0`.

**Vote counts (HTML only):** the CSV has no vote count. If you need it, also fetch the same
query string at `/route-finder` and read each route row's trailing grey number, then join to
the CSV rows by route URL/ID. Per-route HTML row lives in `table.route-table.hidden-sm-up
tr.route-row`: `<strong>` = name, `.rateYDS` (+ `.rateFrench`, `.rateUIAA`, `.rateEwbanks`,
`.rateBritish`, `.rateZA`) = grades, count of `.scoreStars img` (`starBlue.svg`=1,
`starBlueHalf.svg`=0.5) = rating, the `<span class="text-muted small">` number after the
stars = vote count, the `Trad N pitches` line = type+pitches, `/area/` anchors = breadcrumb.

**Vote-count gating:** Mountain Project's Route Finder has **no min-votes filter** — passing
`minVotes` is silently ignored. Gate on `vote_count` client-side after fetching.

### Browser fallback

Only if the HTTP path is ever blocked. Create a Browserbase session (a bare session
sufficed — no `--verified`/`--proxies` needed in testing), `browse open` the same
`/route-finder?...` results URL, `browse wait load`, then read route rows from the HTML.
**Do not `browse open` the `/route-finder-export` URL** — in a browser it is a file download,
so the page just re-renders the finder HTML (it does not display the CSV). Route IDs live in
anchor `href`s, not the rendered text, so `browse get text` alone is insufficient — read the
snapshot's `urlMap` (or `browse get html body`) to recover `/route/<id>/` links. Never click
"Change Settings" / submit the form (captcha) — always rebuild the URL.

## Site-Specific Gotchas

- **Grade range is single-system.** It works only within the system chosen by `type`
  (rock=YDS, boulder=V, ice=WI/AI, mixed=M, aid=A/C). You cannot ask for "5.10 OR V5" in one
  query — run one query per system and merge client-side.
- **Min vs. max grade IDs differ for the same label.** `5.8` is `diffMinrock=2000` but
  `diffMaxrock=2200`; `5.11a` is min=4600 / max=4800. Use the two maps above; do not reuse
  one ID for both ends.
- **`stars` values are offset from their labels.** "≥2 stars" is `stars=2.8`, "≥3 stars" is
  `stars=3.8`. Only the six discrete values exist in the UI. (Passing an arbitrary float may
  work but is unverified — prefer the documented values.)
- **No min-votes filter exists.** `minVotes` is accepted but ignored (verified: identical row
  counts for `minVotes=0/50/500`). Filter by `vote_count` client-side.
- **No max-pitch cap and a limited sort set.** Pitches only supports "exactly 1" or "at least
  N". Sort offers only Popularity / Difficulty / Name / Area — there is **no** "highest-rated"
  or "recently added" sort. Sort by `star_rating` or recency client-side if needed.
- **CSV is capped at 1000 rows.** Larger result sets are truncated — narrow the filters or
  paginate the HTML (`page=N`, 50/page) to get everything.
- **CSV vs. HTML field split:** CSV has `Length` + `Area Latitude/Longitude` (the *crag's*
  coordinates, not the exact route) but **no vote count**; the HTML list has vote counts but
  **no length or coordinates**. Neither surface returns `first_ascent` — that requires the
  individual `/route/<id>` detail page.
- **`/route-finder-export` is a download in-browser.** It returns the CSV only over plain
  HTTP GET; navigating to it in a real browser yields a file download, and the page shows the
  finder HTML instead. Use an HTTP client for the CSV.
- **The results URL is fully bookmark-stable.** The whole filter set round-trips in the query
  string (verified: the URL after navigation still contains every diff/stars/type param).
  There is no separate short `route-finder/<id>` saved-search URL for anonymous users — the
  query string *is* the shareable artifact.
- **Form POST is captcha-guarded.** The form carries a reCAPTCHA and a `winnie-the-pooh`
  honeypot. The GET results URL bypasses both — never submit the form.
- **lat/lng + radius is not supported by the Route Finder.** Radius search requires the
  documented JSON data API `/data/get-routes-for-lat-lon` (lat/lon/maxDistance), which needs
  an apiKey from a logged-in profile — out of scope for the cookie-less path.
- **No anti-bot wall observed.** All HTML/CSV fetches returned HTTP 200 cookie-less across the
  run; heavy pagination did not trigger a login or captcha wall.

## Expected Output

```json
{
  "total_count": 556,
  "page": 1,
  "per_page": 50,
  "applied_filters": {
    "selectedIds": "105744222",
    "area_name": "Boulder Canyon, Colorado",
    "type": "rock",
    "grade_system": "YDS",
    "grade_min": "5.8",
    "grade_max": "5.11a",
    "diffMinrock": 2000,
    "diffMaxrock": 4800,
    "styles": ["trad", "sport"],
    "pitches": "any",
    "min_stars": 2.0,
    "min_votes": 0,
    "sort": "popularity"
  },
  "results": [
    {
      "id": "105750457",
      "name": "Cosmosis",
      "url": "https://www.mountainproject.com/route/105750457/cosmosis",
      "grade": "5.10a",
      "grade_system": "YDS",
      "type": ["trad"],
      "pitches": 2,
      "length_ft": null,
      "star_rating": 3.6,
      "vote_count": 372,
      "area_path": ["Colorado", "Boulder", "Boulder Canyon", "Bell Buttress Massif", "Bell Buttress - Main Crag"],
      "lat": 40.0011,
      "lng": -105.413,
      "first_ascent": null
    },
    {
      "id": "105761271",
      "name": "Lust",
      "url": "https://www.mountainproject.com/route/105761271/lust",
      "grade": "5.10c",
      "grade_system": "YDS",
      "type": ["sport"],
      "pitches": 1,
      "length_ft": 90,
      "star_rating": 3.4,
      "vote_count": 210,
      "area_path": ["Colorado", "Boulder", "Boulder Canyon", "Avalon", "Second Tier", "Tarot Wall"],
      "lat": 39.999,
      "lng": -105.4122,
      "first_ascent": null
    }
  ]
}
```

Notes on field provenance:
- `grade_system` is derived from the `type` param (`rock`→`YDS`, `boulder`→`V`, `ice`→`WI`/`AI`,
  `mixed`→`M`, `aid`→`Aid`).
- `type` (per route) comes from the CSV `Route Type` / HTML `Trad|Sport|TR` text; a route can
  carry multiple (e.g. `["trad","top rope"]` from `"Trad, TR"`).
- `length_ft`, `lat`, `lng` come from the CSV; `vote_count` comes from the HTML list; both can
  be `null` when absent. `first_ascent` is always `null` from the search surface (detail-page only).
- `total_count` is the result-set size (read from the HTML results header / page count); the CSV
  is capped at 1000 even when `total_count` is larger.
