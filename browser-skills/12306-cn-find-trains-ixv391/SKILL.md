---
name: 12306-cn-find-trains-ixv391
title: China Railway 12306 — Find Trains
description: >-
  Query China Railway (12306.cn) for the train schedule between two stations on
  a given date — train number, departure/arrival station + time, journey
  duration, and per-class seat availability. Read-only; no login.
website: 12306.cn
category: travel
tags:
  - trains
  - rail
  - china
  - '12306'
  - schedule
  - read-only
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: hybrid
alternative_methods: []
verified: true
proxies: true
---
# China Railway 12306 — Find Trains

## Purpose

Return the list of trains running between two stations on a given date
on China Railway's official site (12306.cn) — train number, departure /
arrival station and time, journey duration, and per-class seat
availability. Schedule data only; ticket prices and booking require an
authenticated session and are out of scope. Read-only.

## When to Use

- "What trains run from Beijing to Shanghai on 2026-05-26?"
- Mainland China rail itinerary planning (Beijing/Shanghai/Guangzhou/
  Chengdu / any HSR or conventional rail city).
- Comparing G (high-speed) vs D (动车 EMU) vs Z/T/K (conventional) train
  options for a corridor.
- Any flow that needs schedule + seat-class availability without
  booking. Booking, real-time seat counts past 0/1, and ticket prices
  need a logged-in flow and a different skill.

## Workflow

12306 ships a public JSON endpoint at `kyfw.12306.cn/otn/leftTicket/queryO`
that returns the full schedule for any origin/destination/date — same
data the official web UI renders, no login, no captcha, no rate-limit
in normal use. **The English site `www.12306.cn/en/` is a marketing /
FAQ landing page only; its "Search" button does nothing useful for
querying schedules.** The Chinese-language `kyfw.12306.cn` is the only
surface that returns real data.

The complication: `kyfw.12306.cn` is not resolvable from a typical
non-China egress (DNS or TCP block depending on path). Browserbase's
remote browser pool routes through endpoints that do resolve it — so
the cheapest reliable path is:

1. **Spin up a remote session with proxies + verified stealth.**
   `--proxies` is required (without it, the kyfw subdomain often does
   not resolve). `--verified` keeps the session indistinguishable from
   a real browser; the kyfw site fingerprints aggressively, including
   the `nc.js` Alibaba anti-bot probe on `g.alicdn.com`.
   ```bash
   sid=$(browse cloud sessions create --keep-alive --verified --proxies \
     | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
   export BROWSE_SESSION="$sid"
   ```

2. **Resolve from / to station to 12306 telecodes.** The station-code
   dictionary is served as a JS literal at
   `https://www.12306.cn/en/js/core/framework/station_name.js`
   (~115 KB, no proxy needed — `www.12306.cn` resolves anywhere). The
   payload is one big string:
   ```
   var station_names = '@bjb|北京北|VAP|beijingbei|bjb|0@bjd|北京东|BOP|beijingdong|bjd|1@bji|北京|BJP|beijing|bj|2@bjn|北京南|VNP|beijingnan|bjn|3...';
   ```
   Per record: `pinyin_abbr|chinese_name|telecode|full_pinyin|short_pinyin|sort_idx`.
   Use the 3-letter `telecode` (BJP, VNP, AOH, SHH, ...) — that's what
   the query API consumes. Pin city-level codes (BJP=北京, SHH=上海) when
   the user gives a city name; pin specific-station codes (VNP=北京南,
   AOH=上海虹桥) when they specify the station. City-level codes return
   trains from **every** station in that city (verified: BJP→SHH and
   VNP→AOH return the same 54-train set for Beijing→Shanghai on
   2026-05-26 — the API treats top-N station codes as a city alias).

3. **Establish session cookies by opening any kyfw page.** The query
   endpoint needs the `JSESSIONID`, `BIGipServerotn`, and `route`
   cookies that any first `/otn/...` page sets. The cheapest path is
   the dedicated init page:
   ```bash
   browse open "https://kyfw.12306.cn/otn/leftTicket/init" --remote
   ```
   Wait 2–4 s for the page (it lazily fetches the anti-bot
   `g.alicdn.com/sd/ncpc/nc.js` probe; the JSON API works as soon as
   that finishes).

4. **Call the schedule API from the page context.** This is the data
   extraction step — no UI interaction is needed.
   ```bash
   browse eval --remote "
     fetch('https://kyfw.12306.cn/otn/leftTicket/queryO' +
           '?leftTicketDTO.train_date=2026-05-26' +
           '&leftTicketDTO.from_station=VNP' +
           '&leftTicketDTO.to_station=AOH' +
           '&purpose_codes=ADULT',
           { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
       .then(r => r.json())
   "
   ```
   The endpoint set is `queryO` (all train types — preferred default),
   `queryG` (high-speed only — G/D/C trains), `queryA` and `queryE`
   (legacy aliases, behave identically to `queryO` as of 2026-05). The
   page-context fetch automatically attaches the right cookies and a
   same-origin `Referer`.

5. **Parse the response.** Top-level shape:
   ```json
   {
     "httpstatus": 200,
     "data": {
       "result": ["<train1-pipe-string>", "<train2-pipe-string>", ...],
       "map": { "VNP": "北京南", "AOH": "上海虹桥", "SHH": "上海", ... },
       "flag": "1", "level": "...", "sametlc": "..."
     }
   }
   ```
   Each entry in `data.result[]` is a single `|`-separated positional
   string of ~50 fields. Reference field positions (0-indexed, after
   `split('|')`):
   | idx | field | example |
   |---|---|---|
   | 0  | `secret_str` (URL-encoded book token) | `4NMzznPw13...` |
   | 1  | `button_text` (`预订`=Book / `候补`=Waitlist / `--`=N/A) | `预订` |
   | 2  | `train_no` (internal id) | `240000G54700` |
   | 3  | `station_train_code` (user-visible) | `G547` |
   | 4  | `start_station_telecode` (line origin) | `VNP` |
   | 5  | `end_station_telecode` (line terminus) | `AOH` |
   | 6  | `from_station_telecode` (this query's origin) | `VNP` |
   | 7  | `to_station_telecode` (this query's destination) | `AOH` |
   | 8  | `start_time` (HH:MM) | `06:18` |
   | 9  | `arrive_time` (HH:MM) | `12:11` |
   | 10 | `lishi` (duration HH:MM, may span next day) | `05:53` |
   | 11 | `can_web_buy` (Y/N) | `Y` |
   | 12 | `yp_info` (URL-encoded encrypted seat-price block) | `siXk2hk%2F...` |
   | 13 | `start_train_date` (YYYYMMDD) | `20260526` |
   | 14 | `train_seat_feature` | `3` |
   | 15 | `location_code` | `P3` |
   | 16 | `from_station_no` (stop index of from_station on the train's route) | `01` |
   | 17 | `to_station_no` | `13` |
   | 18 | `is_support_card` | `1` |
   | 19 | `controlled_train_flag` | `0` |
   | 32 | `swz_num` (商务座 — Business) | `1` / `有` / `无` / `""` |
   | 33 | `tz_num`  (特等座 — Special, on D/Z trains) | `""` |
   | 34 | `zy_num`  (一等座 — First Class) | `有` |
   | 35 | `ze_num`  (二等座 — Second Class) | `有` |
   | 36 | `gr_num`  (高级软卧 — Premier Soft Sleeper) | `""` |
   | 37 | `rw_num`  (软卧 — Soft Sleeper) | `""` |
   | 38 | `yw_num`  (硬卧 — Hard Sleeper) | `""` |
   | 39 | `rz_num`  (软座 — Soft Seat) | `""` |
   | 40 | `yz_num`  (硬座 — Hard Seat) | `""` |
   | 41 | `wz_num`  (无座 — Standing / No Seat) | `无` |
   | 44 | `seat_discount_info` | `""` |
   | 45 | `seat_types` (compact class-list — each char = one class) | `9MOO` |
   Seat-count values: an integer (exact remaining count when the
   railway publishes it — typically only 0–20 are exposed precisely),
   `有` (available, exact count not disclosed), `无` (sold out), or `""`
   (class not offered on this train). The `seat_types` enum chars at
   index 45 map to: `9`=商务座, `P`=特等座, `M`=一等座, `O`=二等座,
   `6`=高级软卧, `4`=软卧, `F`=动卧, `3`=硬卧, `2`=软座, `1`=硬座,
   `W`=无座, `D`=其他/动卧 variants. Use `seat_types` to know which
   classes a given train *can* offer; cross-check against the
   per-class fields to know which are sold out / sold-out / available.

   **Map `from_station_telecode` and `to_station_telecode` to display
   names via `data.map`** — that response sub-object is keyed by
   telecode and only contains the stations actually referenced in
   the result set (typically 5–10 entries, not the full dictionary).
   If a telecode in the result is not in `data.map` (rare; small or
   freight stations), fall back to the global `station_name.js`
   dictionary.

6. **Optional filters.** The API returns the full schedule
   unconditionally — there are no server-side filter params for train
   class, departure time, or seat class. Filter client-side:
   - High-speed only → keep rows where `station_train_code` starts with
     `G`, `D`, or `C`. (Equivalent to calling `queryG` instead of
     `queryO`.)
   - Available only → drop rows where every seat field in 32..41 is
     `无` or `""` (and `button_text` is not `预订`).

7. **Release the session.**
   ```bash
   browse cloud sessions update "$sid" --status REQUEST_RELEASE
   ```

### Browser fallback

When the JSON API is unavailable (Alibaba probe fails / session denied
mid-query), the same data is fetched into the page's results table at
`https://kyfw.12306.cn/otn/leftTicket/init`. Set four cookies before
navigation:
```js
document.cookie = "_jc_save_fromStation=" + encodeURIComponent("北京") + "%2CBJP; path=/";
document.cookie = "_jc_save_toStation="   + encodeURIComponent("上海") + "%2CSHH; path=/";
document.cookie = "_jc_save_fromDate=2026-05-26; path=/";
document.cookie = "_jc_save_wfdc_flag=dc; path=/";
```
Then open `/otn/leftTicket/init?linktypeid=dc` and click `查询` (the
search button — visible-text selector `text=查询` or the button with
class `.btn92s`). The same `queryO` XHR fires from the JS bundle and
populates a table; extract via `browse get markdown body` and parse
the rendered rows. This costs ~5× more turns than the direct API path
because the table renders progressively and per-row seat cells use
font-icon spans.

## Site-Specific Gotchas

- **`kyfw.12306.cn` is geo-IP / DNS restricted from most non-China
  egress.** Direct `curl` from the sandbox fails with
  `Could not resolve host: kyfw.12306.cn`. Browserbase residential
  proxies (`--proxies`) route requests through endpoints that resolve
  it — that flag is **mandatory** for any direct API call. The
  marketing host `www.12306.cn` (used for `station_name.js` and the
  English info pages) is reachable everywhere.
- **English-language site is a decoy for schedule queries.**
  `https://www.12306.cn/en/index.html` has a `From / To / Date /
  Search` form but its Search button is not wired to the production
  query API — it dead-ends. Do not waste turns trying to drive the
  English UI; use the Chinese `kyfw.12306.cn` JSON API.
- **City-code = top-N-station alias.** Passing the city-level telecode
  (`BJP` for Beijing, `SHH` for Shanghai, `CDU` for Chengdu, ...)
  returns the same result set as passing the city's primary HSR
  station (`VNP`, `AOH`, `IPH`, ...). It does **not** restrict to
  trains terminating at the small "main" station. Verified
  2026-05-19: `BJP→SHH`, `BJP→AOH`, and `VNP→AOH` all returned the
  identical 54-train set for 2026-05-26. To filter to a specific
  station, post-filter the result on `from_station_telecode` /
  `to_station_telecode` (indices 6 and 7).
- **`queryG` vs `queryO` vs `queryA` / `queryE`.** All four endpoints
  exist and return the same JSON shape. `queryG` is what the official
  UI calls when "High-speed only" is checked — but it actually returns
  the same rows as `queryO` (it filters client-side in the JS bundle;
  the API response is identical). Default to `queryO`. The endpoint
  name appears to flip occasionally during 12306 schedule-version
  rollovers — if one 404s or 302s to `mormhweb/logFiles/error.html`,
  try the next one in `[queryO, queryG, queryA, queryE]`.
- **`/mormhweb/logFiles/error.html` 302 = session missing.**
  Calling `queryO` without first hitting any `/otn/...` page in the
  same browser session returns `302 → error.html` because the
  load-balancer cookies (`BIGipServerotn`, `JSESSIONID`, `route`) are
  not set. Always open `https://kyfw.12306.cn/otn/leftTicket/init`
  (or any `/otn/` path) once per session before calling the API.
- **`g.alicdn.com/sd/ncpc/nc.js` runs on every page load.** This is
  Alibaba's anti-bot probe (the same `nc.js` that backs Taobao's
  slider captcha). It does not gate the schedule API in our trace —
  but it does run, takes ~2 s, and can stall the page-context fetch
  if the session is too obviously synthetic. `--verified` is what
  keeps the probe quiet; without it the session sees the slider
  captcha within ~5 page loads.
- **Prices are not in the public response.** Field 12 (`yp_info`) is a
  URL-encoded base64 blob; decryption requires the per-session AES key
  that 12306 ships only after login. The unauthenticated
  `/otn/leftTicketPrice/queryAllPublicPrice?...` endpoint returns
  200 OK with `data: []` (verified 2026-05-19) — confirmed dead end.
  Document price as `null` in the schema and tell users to check the
  app for fares. Booking is a strictly authenticated, captcha-gated
  flow that this read-only skill does **not** attempt.
- **Seat-count semantics are deliberately fuzzy.** The Railway
  publishes exact remaining seats only when the count is low (commonly
  0–20). Above that threshold the field is `有` ("available, count
  redacted") regardless of whether 30 or 800 seats remain. `无` =
  truly sold out. Empty string = the train does not offer that class.
  Do not paper over this — surface `available_count` as `int | "有" |
  "无" | null` in the JSON output, not as a coerced integer.
- **Date precision: depart date only.** The query has no time-window
  filter. Trains crossing midnight are included; `arrive_time`'s clock
  rolls past `start_time` and `lishi` (duration) is the source of
  truth for overnight detection.
- **Booking-window cutoff.** China Railway opens 15-day forward
  booking. Queries for dates beyond `today + 15 days` return
  `data.result: []` with a `messages` warning string. Within the
  window, even unscheduled days (very early-morning queries on the
  day-of-opening) can briefly return empty before the daily seat
  release at 5:00 AM China time.
- **Station-code dictionary versions.** The path
  `/en/js/core/framework/station_name.js` is stable; the
  Chinese-language path includes a `_v<N>` suffix
  (`/index/script/core/common/station_name_v10198.js`) that
  rev-locks and 302s to `error.html` on a stale version. Always use
  the un-versioned English-side URL.
- **Don't bother with `browse snapshot` for the results table.** The
  `<table>` populates from JS after the XHR, with per-class seat
  status rendered as styled `<td>` text — but the snapshot accessibility
  tree returns ~280–400 refs and the table cells aren't reliably
  enumerated as a list. Read the JSON directly; only fall back to
  `browse get markdown body` parsing if the API path itself is
  blocked (we did not observe a block in 2 iters of testing).

## Expected Output

Three distinct outcome shapes:

```json
// Success — schedule returned
{
  "success": true,
  "from": { "telecode": "VNP", "name": "北京南", "name_en": "Beijing South", "city": "Beijing" },
  "to":   { "telecode": "AOH", "name": "上海虹桥", "name_en": "Shanghai Hongqiao", "city": "Shanghai" },
  "date": "2026-05-26",
  "queried_at_utc": "2026-05-19T18:11:30Z",
  "train_count": 54,
  "trains": [
    {
      "train_no": "G547",
      "train_no_internal": "240000G54700",
      "from": { "telecode": "VNP", "name": "北京南" },
      "to":   { "telecode": "AOH", "name": "上海虹桥" },
      "start_time": "06:18",
      "arrive_time": "12:11",
      "duration": "05:53",
      "from_stop_index": 1,
      "to_stop_index": 13,
      "can_web_buy": true,
      "seat_types_offered": ["business", "first_class", "second_class"],
      "seats": {
        "business":     { "status": "available", "count": 1,    "price_cny": null },
        "first_class":  { "status": "available", "count": "有", "price_cny": null },
        "second_class": { "status": "available", "count": "有", "price_cny": null }
      },
      "button_text": "预订"
    }
  ],
  "error_reasoning": null
}

// No trains — date out of booking window or no service
{
  "success": true,
  "from": { "telecode": "VNP", "name": "北京南" },
  "to":   { "telecode": "AOH", "name": "上海虹桥" },
  "date": "2026-07-15",
  "train_count": 0,
  "trains": [],
  "messages": ["请您选择正确的查询日期，您还可预订15天内的车票。"],
  "error_reasoning": "Outside 15-day booking window"
}

// Blocked — session denied / anti-bot wall
{
  "success": false,
  "from": { "telecode": "VNP", "name": "北京南" },
  "to":   { "telecode": "AOH", "name": "上海虹桥" },
  "date": "2026-05-26",
  "trains": [],
  "error_reasoning": "queryO 302→/mormhweb/logFiles/error.html — session cookies missing or kyfw.12306.cn unreachable (proxy required)"
}
```

Note: per-class `price_cny` is always `null` for unauthenticated
queries — the encrypted `yp_info` blob (field 12) requires a logged-in
AES key to decrypt. Surface `null` honestly; do not guess.
