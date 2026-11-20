---
name: yahoo-co-jp-homepage-news-trends-weather-e79vav
title: Yahoo! JAPAN Homepage Briefing
description: >-
  Briefing of the four above-the-fold modules on the Yahoo! JAPAN homepage: 8
  main news topics, 5 realtime trending search keywords with stay/rise/fall
  direction, today/tomorrow weather for the IP-defaulted ward, and the day's NPB
  scoreboard. Single static HTML fetch — no JS, no auth, no anti-bot.
website: yahoo.co.jp
category: news-aggregator
tags:
  - news
  - japan
  - weather
  - trending
  - sports
  - homepage
  - read-only
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: api
alternative_methods:
  - method: api
    rationale: >-
      The homepage is fully server-rendered HTML. A single unauthenticated GET
      https://www.yahoo.co.jp/ returns all four modules (news / realtime trends
      / weather / scoreboard) in ~150 KB of static HTML. No GraphQL, no
      __NEXT_DATA__, no client-side hydration — parsing the HTML is the API.
  - method: browser
    rationale: >-
      Reliable fallback when raw HTTP is blocked. Same heading-text-anchored
      selectors work via `browse get markdown body` or `browse eval`. No stealth
      or proxies needed — Yahoo! JAPAN does not anti-bot the homepage.
verified: true
proxies: true
---
# Yahoo! JAPAN Homepage Briefing

## Purpose

Return a compact briefing of the four "above-the-fold" modules on the Yahoo! JAPAN homepage (`https://www.yahoo.co.jp/`): the **8 main news topics** (主要 ニュース), the **5 realtime trending search keywords** (リアルタイム検索で話題のキーワード) with their trend direction, the **today/tomorrow weather summary** for the IP-defaulted location, and the **sports scoreboard** (NPB baseball + J.League soccer matches scheduled for the day). Read-only — never logs in, follows pickup/article links, or alters any state.

## When to Use

- Daily "Japanese news at a glance" briefings for a user-facing agent.
- Detecting breaking-news pickup items by polling the top 8 (each `pickup/N` ID is unique and monotonically increases).
- Surfacing realtime trending search terms (the closest Japanese-language analogue to "what is X-trending in Japan right now") with their stay/rise/fall direction.
- Pulling NPB/J-League scheduled or in-progress games for the day without hitting the deeper Sportsnavi sub-sites.
- Any workflow that previously scraped multiple Yahoo! JAPAN subdomain pages (news.yahoo.co.jp + weather.yahoo.co.jp + search.yahoo.co.jp/realtime + sports.yahoo.co.jp) when a single homepage request returns all four blocks already aggregated.

## Workflow

The Yahoo! JAPAN homepage is **fully server-side rendered** — every value visible above the fold is already in the initial HTML response. There is no GraphQL endpoint, no `__NEXT_DATA__` blob, no client-side hydration. A single unauthenticated `GET https://www.yahoo.co.jp/` returns all four modules. No anti-bot challenge, no JavaScript execution required, no captcha, no Akamai. **Stealth and residential proxies are not required.** Both bare HTTP and residential-proxy fetches return identical structural data (only the IP-defaulted weather ward differs — see Gotchas).

### Recommended path — HTTP fetch + HTML parse

1. **Fetch the homepage** with any standard HTTP client (the response is brotli-compressed; modern clients handle this automatically). No headers beyond a normal `User-Agent` are needed.
   ```bash
   browse cloud fetch https://www.yahoo.co.jp/
   # or any equivalent: curl, node fetch, python requests, etc.
   ```
   The response is ~150 KB of HTML, status 200, `Content-Type: text/html; charset=UTF-8`. Two `Set-Cookie` headers (`A=…`, `B=…`) are returned but **do not need to be persisted** for subsequent requests.

2. **Locate the 4 module containers**. Each module is anchored by a Japanese `<h1>` whose text content (whitespace-stripped) matches one of these strings. The CSS class names on wrapper `<div>`/`<section>` elements are CSS-modules hashes (e.g. `_2pjWfyGnbTPxsLzERUiAmE`) that rotate on every release — **do not match by class name; match by heading text**, then walk up to the nearest `<section>` or `<article>` ancestor.
   - `主要ニュース` → 8 news topics (wraps `<section>`)
   - `リアルタイム検索で話題のキーワード` → 5 trending keywords (wraps `<section>`)
   - `今日明日の天気` → weather block (wraps `<article>`)
   - `スコアボード` → sports scoreboard (wraps `<article>`)

3. **Parse the 主要 ニュース block**. Inside the section, every `a[href*="news.yahoo.co.jp/pickup/"]` is a topic link (exactly 8 of them in this section — there are also 64+ pickup URLs scattered elsewhere on the page in "おすすめの記事" and "もっと見る" lists, so **always scope the selector to the section ancestor**, never the whole document).
   - **Headline + comment count + NEW marker** are concatenated in the anchor's text. Strip the trailing comment count (regex `(\d+)$`) and the literal "NEW" tag (regex `NEW(\d+)$`) to recover the clean headline. The "NEW" suffix indicates the topic was posted in the last few hours.
   - **Pickup ID**: parse the trailing integer from the href path. URLs are stable canonical IDs (`https://news.yahoo.co.jp/pickup/6580871`).
   - **Update timestamp**: the section's text contains a string matching `\d+/\d+\([日月火水木金土]\)\s*\d+:\d+更新` (e.g. `5/20(水) 6:23更新`). This is JST and updates every ~5 minutes.

4. **Parse the リアルタイム検索 block**. Inside the section, every `a[href*="search.yahoo.co.jp/realtime/search?rkf=1"]` is a trending keyword link (5 of them). The link text is a concatenation of (in order): rank digit, trend-direction marker (`stay` / `rise` / `fall`), keyword, optional `写真あり` photo flag, then optional `関連ワード{related keywords concatenated with no delimiter}`.
   - **Keyword** (clean): URL-decode the `p=` query-string parameter of the anchor's `href` — this gives the keyword unambiguously, free of the concatenated trend tags and rank prefix.
   - **Rank**: the first `<span>` child of the anchor contains the rank as plain text (`"1"` … `"5"`).
   - **Trend direction**: the third `<span>` child contains literally `stay`, `rise`, or `fall`.
   - **Has photo**: presence of the text `写真あり` in the link text indicates an attached trending image.
   - **Related words**: extract by string-removing the rank + trend + keyword + `写真あり` from the anchor text; whatever remains after `関連ワード` is the related-words blob (no delimiter — Japanese search terms are usually short, so a heuristic split on katakana/hiragana/kanji boundaries works, or just emit the raw blob).
   - **Update timestamp**: the section's text contains a string matching `\d+:\d+更新` (e.g. `6:35更新`). HH:MM only (date is implicit = today JST).

5. **Parse the 今日明日の天気 block**. The article contains:
   - **Location name**: an `a[href*="weather.yahoo.co.jp/weather/jp/"]` link whose text is *only* the ward name (e.g. `港区` / `新宿区`) — distinguishable from the weather-data links by having no `℃` or `%` in its text. The href encodes the location IDs: `/jp/{prefectureCode}/{areaCode}/{wardCode}.html`.
   - **Today / tomorrow forecasts**: two more weather links whose text matches the pattern `(今日|明日)の天気最高気温\d+℃最低気温\d+℃降水確率\d+%`. Tomorrow's link has the fragment `#yjw_pinpoint_tomorrow`.
   - **Weather icon / condition string**: each forecast link contains a child `<img>` whose `alt` attribute is the Japanese weather phrase (`晴`, `雨`, `晴のち雨`, `くもり時々雨`, etc.) and whose `src` ends in `/general/next/{code}_day.png` — the `{code}` is a stable Yahoo internal weather-state ID (e.g. `114_day` = 晴のち雨, `300_day` = 雨). Extract the `alt` for human-readable condition.
   - **Pollen forecast** (花粉予報): an adjacent `a[href*="weather/pollen/"]` link with text like `花粉予報少ない` (少ない/やや多い/多い/非常に多い). Present year-round but the level is most meaningful Feb–May.

6. **Parse the スコアボード block**. Inside the article:
   - **Date label**: text matches `\d+/\d+（[日月火水木金土]）の試合` — note the full-width parentheses `（）`. May be absent on off-days (no games scheduled).
   - **Sport tabs**: the heading row contains anchors `a[href="https://baseball.yahoo.co.jp/npb/"]` (`プロ野球`) and `a[href*="soccer.yahoo.co.jp/jleague"]` (`Jリーグ`). The **active tab's content is what's rendered** — by default this is プロ野球 (NPB baseball). To get J.League fixtures you must hit a sub-page on `soccer.yahoo.co.jp/jleague` — the homepage embed always shows the default tab only.
   - **Per-game block**: each game is a `<dl>` containing two `a[href*="baseball.yahoo.co.jp/npb/teams/"]` anchors (home team, then away team — order corresponds to "home 対 away") separated by a `<span>` with text `対`, followed by an `a[href*="baseball.yahoo.co.jp/npb/game/"]` anchor whose text is the start time (`HH:MM` JST) and a second `見どころ` (preview) anchor pointing to the same game URL. There are typically 5 games per day (6 NPB teams × 2 leagues split into 3 + 3 pairings; on inter-league weeks or off-days the count varies).
   - **Game ID**: the trailing path segment of the game URL (e.g. `2021038884`) is a stable Yahoo NPB game ID.
   - **Live state**: a game's anchor text changes from a start-time string (e.g. `18:00`) to a score string (e.g. `3 - 2`) and finally to `試合終了` once it concludes. Detect the format with a regex check — `^\d{1,2}:\d{2}$` = scheduled, `^\d+\s*-\s*\d+$` = in-progress or final, presence of `試合終了` text in the dl = final.

7. **(Optional) For deeper details** — pickup story body, full weather forecast for a custom ward, J.League fixtures — follow the link URLs surfaced above. These are out of scope for the homepage-briefing skill but the canonical URLs are useful for chaining.

### Browser fallback

If for any reason the static HTML fetch is unavailable (network restriction, IP-blocked, etc.), the same selectors work in a browser session. No stealth or residential proxy is needed.

```bash
sid=$(browse cloud sessions create --keep-alive | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$sid"
browse open --remote https://www.yahoo.co.jp/
browse wait --remote timeout 1500    # generous; the page is server-rendered, no hydration to wait for
browse get --remote markdown body    # captures all four sections in one snapshot
# Or use `browse eval` with the heading-text-anchored selectors above for structured extraction.
browse cloud sessions update "$sid" --status REQUEST_RELEASE
```

The browser path is reliable but ~10× slower and costs Browserbase session-time. Prefer the static-fetch path unless you need to interact with the page.

## Site-Specific Gotchas

- **Weather location is determined by the request's source IP geolocation, not by any URL param or cookie on the homepage.** A US-datacenter IP defaults to `13/4410/13103` (港区, Minato Ward, Tokyo); a Japanese residential proxy IP defaults to `13/4410/13104` (新宿区, Shinjuku Ward, Tokyo) — both inside central Tokyo. Anonymous unauthenticated users **cannot pick a custom city from the homepage block** without logging in. If a specific city is needed, fetch `https://weather.yahoo.co.jp/weather/jp/{pref}/{area}/{ward}.html` directly with the desired location codes — that's a different skill, not solvable from the homepage. **Always emit the location name (e.g. `港区`) alongside the temperatures so downstream consumers know what locality the numbers refer to.**
- **CSS class names are hashed and rotate on every release** (e.g. `_2pjWfyGnbTPxsLzERUiAmE`, `JP_5HSOWr6XeS0joNfYde`). Never select by class. Always anchor on Japanese heading text (`主要ニュース`, `リアルタイム検索で話題のキーワード`, `今日明日の天気`, `スコアボード`) then walk to the nearest `<section>`/`<article>`. The heading strings themselves are stable.
- **Pickup URLs appear ~64 times across the homepage HTML**, but only 8 are in the 主要 ニュース section. The rest are "おすすめの記事" (recommended/sponsored), "もっと見る" preview lists, and category headers. Scope the selector to the 主要ニュース section ancestor; do not query the whole document.
- **Topic link text concatenates headline + optional `NEW` + comment count with no delimiter** (e.g. `行方不明の小4女児 23年続く捜査NEW28`). Comment count is the trailing integer; `NEW` indicates a topic posted in the last few hours. Strip both to recover the clean headline.
- **Realtime keyword anchors include a "pickup" feature article** as the first realtime-search link in the HTML (e.g. `https://search.yahoo.co.jp/realtime/search/pickup/70093`) — this is **not** one of the 5 trending keywords; it's a sponsored editorial card. Filter on `href*="search.yahoo.co.jp/realtime/search?rkf=1"` (note `?rkf=1`) to get only the 5 ranked trending entries, not the pickup feature.
- **The trend-direction marker (`stay`/`rise`/`fall`) is the literal English text inside the third `<span>` of each keyword anchor** — it's rendered as a colored arrow icon visually but the underlying text is the English word. There is no Japanese equivalent in the DOM.
- **The `p=` URL-encoded query parameter is the canonical way to recover the keyword.** The anchor's visible text is a concatenation of rank + trend + keyword + photo flag + related-words with no separator; URL-decoding `p=` gives the keyword unambiguously.
- **Scoreboard default tab is NPB baseball.** The J.League tab (`Jリーグ`) is rendered in the HTML as a navigation link, but the embedded scoreboard content always shows プロ野球 unless a user clicks the tab (and that state is not URL-persistent — opening the homepage fresh always lands on プロ野球). If you need J.League fixtures, navigate to `https://soccer.yahoo.co.jp/jleague` directly.
- **Scoreboard date label uses full-width parentheses** (`5/20（水）の試合` with `（）`, not `()`). Match accordingly.
- **No games scheduled = no scoreboard block.** On scheduled NPB off-days (Mondays during regular season, all-star break, season boundary days), the scoreboard block may be absent or show "本日試合なし" (no games today). Don't error; emit `games: []`.
- **All times are JST (UTC+9).** The homepage does not localize for the viewer's timezone. Update timestamps (`6:23更新`, `6:35更新`) are JST clock times.
- **No `__NEXT_DATA__`, no GraphQL, no internal API.** The homepage is plain server-rendered HTML — there is no faster machine-readable endpoint to chase. The HTML parse *is* the optimal path.
- **No rate limit observed at 1 req/min**. Yahoo! JAPAN sets only a session cookie (`A=…`) which is not required for subsequent requests. Avoid hammering — the homepage refreshes its data on the server every ~5 minutes, so polling faster than that yields no new data.
- **Browser fetch from a US-region Browserbase session works fine** (no Akamai, no JS-challenge, no captcha) — but the served weather location reflects the session's exit IP. If you need to match a Japanese user's experience exactly (e.g. for QA), use `--proxies` to get a Japanese residential IP; otherwise omit and save the cost.

## Expected Output

```json
{
  "fetched_at_utc": "2026-05-19T21:46:00Z",
  "homepage_url": "https://www.yahoo.co.jp/",
  "news": {
    "updated_jst": "5/20(水) 6:23",
    "topics": [
      {
        "rank": 1,
        "headline": "AIミュトスに危機感 政府が対応案",
        "is_new": false,
        "comment_count": 596,
        "pickup_id": "6580871",
        "url": "https://news.yahoo.co.jp/pickup/6580871"
      },
      {
        "rank": 3,
        "headline": "行方不明の小4女児 23年続く捜査",
        "is_new": true,
        "comment_count": 28,
        "pickup_id": "6580884",
        "url": "https://news.yahoo.co.jp/pickup/6580884"
      }
    ]
  },
  "trending_keywords": {
    "updated_jst": "6:35",
    "keywords": [
      {
        "rank": 1,
        "keyword": "アーセナル優勝",
        "trend": "stay",
        "has_photo": true,
        "related_words_raw": "本当に優勝22年ぶりArsenal",
        "search_url": "https://search.yahoo.co.jp/realtime/search?rkf=1&p=%E3%82%A2%E3%83%BC%E3%82%BB%E3%83%8A%E3%83%AB%E5%84%AA%E5%8B%9D"
      },
      {
        "rank": 4,
        "keyword": "学マ水曜日",
        "trend": "rise",
        "has_photo": false,
        "related_words_raw": null,
        "search_url": "https://search.yahoo.co.jp/realtime/search?rkf=1&p=%E5%AD%A6%E3%83%9E%E6%B0%B4%E6%9B%9C%E6%97%A5"
      }
    ]
  },
  "weather": {
    "location_name": "港区",
    "location_path": "/13/4410/13103",
    "today": {
      "condition": "晴のち雨",
      "icon_code": "114_day",
      "high_c": 30,
      "low_c": 20,
      "precip_pct": 50
    },
    "tomorrow": {
      "condition": "雨",
      "icon_code": "300_day",
      "high_c": 22,
      "low_c": 16,
      "precip_pct": 80
    },
    "pollen": "少ない"
  },
  "scoreboard": {
    "sport": "npb_baseball",
    "date_label": "5/20（水）の試合",
    "games": [
      {
        "game_id": "2021038884",
        "home_team": "阪神",
        "away_team": "中日",
        "start_time_jst": "18:00",
        "status": "scheduled",
        "score": null,
        "url": "https://baseball.yahoo.co.jp/npb/game/2021038884/index"
      },
      {
        "game_id": "2021038888",
        "home_team": "オリックス",
        "away_team": "ソフトバンク",
        "start_time_jst": "18:00",
        "status": "scheduled",
        "score": null,
        "url": "https://baseball.yahoo.co.jp/npb/game/2021038888/index"
      }
    ]
  }
}
```

**Alternate scoreboard shapes**:

```json
// Game in progress
{ "game_id": "...", "home_team": "巨人", "away_team": "ヤクルト",
  "start_time_jst": null, "status": "in_progress", "score": {"home": 3, "away": 2}, "url": "..." }

// Game ended
{ "game_id": "...", "home_team": "ロッテ", "away_team": "西武",
  "start_time_jst": null, "status": "final", "score": {"home": 5, "away": 1}, "url": "..." }

// No games scheduled (off-day)
{ "scoreboard": { "sport": "npb_baseball", "date_label": null, "games": [] } }
```
