---
name: xiaohongshu-com-get-trending-content-lrb8ax
title: Xiaohongshu Trending Short Videos
description: >-
  Extract the currently-trending short-video posts from Xiaohongshu's explore
  feed (homefeed_recommend), returning each as a 1-line title plus author, like
  count, duration, and canonical URL. Read-only — no login, like, or follow.
website: xiaohongshu.com
category: social
tags:
  - xiaohongshu
  - rednote
  - trending
  - short-video
  - social
  - ssr
  - read-only
source: 'browserbase: agent-runtime 2026-05-21'
updated: '2026-05-21'
recommended_method: browser
alternative_methods:
  - method: fetch
    rationale: >-
      Plain HTTP GET to /explore (browse cloud fetch --proxies) returns the SSR
      shell with feeds:[] empty — the EdgeOne CDN gates the populated feed on
      real-browser fingerprint. Do NOT use this path.
  - method: api
    rationale: >-
      POST /api/sns/web/v1/homefeed exists and works in-browser, but every call
      requires X-S / X-S-Common / X-t / x-rap-param headers signed by xhs-secsdk
      obfuscated JS. The algorithm rotates; not viable outside a real browser
      session.
verified: true
proxies: true
---
# Xiaohongshu Trending Short Videos

## Purpose

Return the currently-trending short-video posts on Xiaohongshu (小红书 / RedNote) as a list of 1-line descriptions plus structured metadata (author, like-count, duration, canonical URL). The data source is the `homefeed_recommend` channel — Xiaohongshu's algorithmic "for-you" feed served to logged-out visitors of `https://www.xiaohongshu.com/explore`, which is the platform's de-facto trending surface for unauthenticated traffic. Read-only — never click into a note, like, follow, comment, or attempt the login QR/SMS flow.

## When to Use

- "What's trending on Xiaohongshu right now?" / "Show me hot short-video posts."
- Daily / hourly snapshots of the explore feed for content-trend dashboards.
- Pre-screening trending videos by category (穿搭 / 美食 / 彩妆 / 影视 / 职场 / 情感 / 家居 / 游戏 / 旅行 / 健身) by switching the `category` slug.
- Anywhere you'd otherwise scrape rendered cards from `/explore`. The cards are noise; the underlying `window.__INITIAL_STATE__.feed.feeds[]` blob has everything in clean JSON.

## Workflow

The Xiaohongshu explore page is server-side-rendered with the first batch of feed items embedded inline in `window.__INITIAL_STATE__.feed.feeds[]`. **This is the cheap path** — one page-load gives you 20–30 ranked items (mix of `type: "video"` and `type: "normal"` (image)) with author, like count, video duration, and the `xsec_token` needed to construct canonical note URLs. **No homefeed API call is required and none is even fired during initial load** — the homefeed XHR only fires on scroll-to-load-more, and that request is signed (`X-S`, `X-S-Common`, `X-t`, `x-rap-param`) by Xiaohongshu's obfuscated `xhs-secsdk` bundle, so it's not callable from outside a real browser without re-implementing their signature scheme.

**Do NOT** call `browse cloud fetch` against `/explore` and try to parse the result — the same URL served to a non-browser client returns the SSR shell with `feeds: []` empty (verified 2026-05-21: shell is 596 KB but `feed.feeds` is empty arrays). The SSR server gates the populated feed on a real-browser fingerprint. Use `browse open … --remote` with a stealth + residential-proxy session.

### Recommended path — SSR initial-state extraction

1. **Create a stealth + residential-proxy Browserbase session.** Both flags are mandatory; bare sessions render the shell but the feed comes back empty (the EdgeOne edge gates by TLS/UA fingerprint).
   ```bash
   sid=$(browse cloud sessions create --keep-alive --verified --proxies \
     | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
   ```

2. **Open the explore page.** The login QR-code modal opens automatically — it's an overlay only; the feed is rendered behind it and the SSR JSON is already in the DOM. You can ignore the modal entirely (or press `Escape` for a clean screenshot — it doesn't affect data extraction).
   ```bash
   browse open "https://www.xiaohongshu.com/explore" --remote --session "$sid"
   browse wait load --remote --session "$sid"
   browse wait timeout 3000 --remote --session "$sid"   # let hydration settle
   ```

3. **Grab the rendered HTML body.**
   ```bash
   browse get html body --remote --session "$sid" > /tmp/explore.html
   ```

4. **Extract `window.__INITIAL_STATE__` and parse `feed.feeds[]`.** The blob is JSON-shaped (Vue SSR serialization), the `feeds:[ … ]` array sits inside `state.feed`. Walk brackets from the `"feeds":[` literal until depth returns to 0 — substring extraction is more reliable than regex on this 45 KB blob.
   ```js
   const html = fs.readFileSync('/tmp/explore.html', 'utf8');
   const m = html.match(/window\.__INITIAL_STATE__=(\{[\s\S]*?\})<\/script>/);
   const blob = m[1];
   const fi = blob.indexOf('"feeds":[');
   let depth = 0, start = fi + 8, end = start;
   for (let i = start; i < blob.length; i++) {
     if (blob[i] === '[') depth++;
     else if (blob[i] === ']') { if (--depth === 0) { end = i + 1; break; } }
   }
   const feeds = JSON.parse(blob.slice(start, end));
   ```

5. **Filter to videos and project the fields.** `noteCard.type === "video"` is the video filter; `"normal"` is an image-only post. `displayTitle` is the 1-line description we want.
   ```js
   const videos = feeds
     .filter(f => f?.noteCard?.type === 'video')
     .map(f => ({
       title: f.noteCard.displayTitle,                       // the 1-liner
       author: f.noteCard.user.nickname || f.noteCard.user.nickName,
       like_count: f.noteCard.interactInfo.likedCount,       // pre-formatted CN string e.g. "1.4万"
       duration_seconds: f.noteCard.video?.capa?.duration,
       note_id: f.id,
       xsec_token: f.xsecToken,
       url: `https://www.xiaohongshu.com/explore/${f.id}?xsec_token=${f.xsecToken}&xsec_source=pc_feed`,
       note_type: 'video'
     }));
   ```

6. **Release the session.**
   ```bash
   browse cloud sessions update "$sid" --status REQUEST_RELEASE
   ```

### Optional — category filter

To restrict the feed to a single category instead of the default homefeed_recommend mix, append `?channel_id={category}` to the URL. Observed category ids (from `state.channel.categories[]` on the same page load):

| `channel_id` | Category |
|---|---|
| `homefeed_recommend` | 推荐 (default — mixed) |
| `homefeed.fashion_v3` | 穿搭 |
| `homefeed.food_v3` | 美食 |
| `homefeed.cosmetics_v3` | 彩妆 |
| `homefeed.movie_and_tv_v3` | 影视 |
| `homefeed.career_v3` | 职场 |
| `homefeed.love_v3` | 情感 |
| `homefeed.household_product_v3` | 家居 |
| `homefeed.gaming_v3` | 游戏 |
| `homefeed.travel_v3` | 旅行 |
| `homefeed.fitness_v3` | 健身 |

There is **no** `homefeed.video_feed_v3` channel — all categories are mixed video+image, filter client-side on `noteCard.type === "video"`.

### Want more than 25 items? (Not recommended)

Each SSR load returns 20–30 ranked items. Subsequent items come from `POST https://edith.xiaohongshu.com/api/sns/web/v1/homefeed`, but every request must carry valid `X-S`, `X-S-Common`, `X-t`, and `x-rap-param` headers computed by Xiaohongshu's obfuscated client signature SDK. **Reproducing those headers outside the browser is not viable** — they rotate the algorithm regularly. If you genuinely need more than one SSR-page worth of items, drive the browser further: scroll the live page (`browse mouse scroll 400 400 0 3000`) and the JS will fire the signed `homefeed` POST itself, then re-extract `feed.feeds[]` from the updated DOM (it's mutated in place).

## Site-Specific Gotchas

- **`browse cloud fetch` returns the empty SSR shell.** Same URL, same `--proxies` flag, but the EdgeOne / Tencent CDN gates the populated feed on a real-browser fingerprint (TLS, UA, sec-ch-ua headers). Verified 2026-05-21: cloud fetch returned 596 KB of HTML with `"feeds":[]` in the initial state, while a `browse open` browser session got the populated 25-item feed inline. **Always use a full browser session.**
- **Stealth + residential proxy is mandatory.** A bare Browserbase session loads `/explore` but the SSR-embedded feed is empty. Both `--verified` and `--proxies` flags are required.
- **The login QR modal is cosmetic, not a wall.** It overlays the feed but the data is already in the DOM behind it. You do not need to dismiss it for extraction. Press `Escape` only if you want a clean screenshot.
- **`likedCount` is a pre-formatted Chinese-style string, not an integer.** Values like `"1.4万"` (14,000), `"9.2万"` (92,000), `"1185"`, `"2万"` (20,000). If you need a numeric value, parse: trim `"万"` and multiply by 10,000; `"亿"` × 100,000,000.
- **`displayTitle` may be truncated.** Cards show ~22 Chinese chars before truncation (the card is fixed-width). The SSR JSON does NOT contain a separate full-title field — `displayTitle` is what you get. For the full body text, you'd need to GET `/explore/{noteId}?xsec_token=…` and parse the note-detail page (out of scope for trending).
- **`xsec_token` is mandatory in the canonical URL.** Direct `/explore/{noteId}` without the token redirects to the explore root or returns a 404-like state. Always carry the `xsecToken` from the same SSR snapshot — tokens are scoped to the request session and may stop working after a few hours.
- **`noteCard.type` values observed:** `"video"` (short video, has `video.capa.duration` seconds) and `"normal"` (image post, no video block). No other types seen in the recommend feed. Default mix is roughly 50/50 video/image (verified iter-1: 12 video / 13 normal out of 25).
- **`user.nickname` vs `user.nickName`** — both fields exist on the same object and usually have the same value, but for some users only `nickName` is populated (camelCase) and for others only `nickname` (lowercase). Always coalesce: `user.nickname || user.nickName`.
- **The `feeds` array starts at SSR index 0** but Xiaohongshu marks individually-loaded items with `ssrRendered: true`. Items appended later by the signed homefeed XHR do not carry this flag — useful for telling "first paint" items apart from scroll-loaded items if you ever extend the skill.
- **No `homefeed.video_feed_v3` channel exists** despite plausible-looking task hints. Video isolation is client-side only. (The task prompt may suggest this URL — it returns the same mixed recommend feed.)
- **Direct calls to `POST /api/sns/web/v1/homefeed` are non-viable.** They require `X-S` / `X-S-Common` / `X-t` / `x-rap-param` signatures generated by `xhs-secsdk` / `mnscore` obfuscated JS. Don't waste time trying to reverse-engineer the signature scheme — it rotates. Use the browser path.
- **The `/website/hot-list` endpoint** (热搜 / hot search) is a different thing — it lists trending search **keywords**, not trending **videos**. Don't confuse it with this skill's surface.
- **Scrolling-triggered API calls return 204 first, then 200** — the 204 is the CORS preflight (OPTIONS), the 200 is the actual POST. Both must succeed for the in-browser scroll-to-load-more to populate the next batch.
- **Geographic accessibility:** Xiaohongshu is open globally without a CN-IP requirement (verified from US-region residential-proxy session, 2026-05-21). The login wall only blocks personalized features (search, follow, save) — public trending feed is anonymous-readable.

## Expected Output

```json
{
  "success": true,
  "source": "explore-ssr-initial-state",
  "channel": "homefeed_recommend",
  "fetched_at": "2026-05-21T23:02:30Z",
  "video_count": 12,
  "videos": [
    {
      "title": "李若彤｜好吃不胖更抗炎～再不为三餐发愁",
      "author": "李若彤",
      "like_count": "8664",
      "duration_seconds": 244,
      "note_id": "6453db04000000001300c1bb",
      "xsec_token": "ABmEUv4MbDhlwDICDI6NNR8RoC0SFuGxPHWnM2uq0iBuU=",
      "url": "https://www.xiaohongshu.com/explore/6453db04000000001300c1bb?xsec_token=ABmEUv4MbDhlwDICDI6NNR8RoC0SFuGxPHWnM2uq0iBuU=&xsec_source=pc_feed",
      "note_type": "video"
    },
    {
      "title": "新疆旅行vlog🍃是我梦里才会出现的场景啊",
      "author": "林森Live",
      "like_count": "1.4万",
      "duration_seconds": 286,
      "note_id": "6479822c0000000013002886",
      "xsec_token": "ABtkcQnFP-73URrNUeGSyeTRerpGI9UYTnt_w79xFVNqw=",
      "url": "https://www.xiaohongshu.com/explore/6479822c0000000013002886?xsec_token=ABtkcQnFP-73URrNUeGSyeTRerpGI9UYTnt_w79xFVNqw=&xsec_source=pc_feed",
      "note_type": "video"
    },
    {
      "title": "加油啊，宝………",
      "author": "鹿十元",
      "like_count": "9.2万",
      "duration_seconds": 287,
      "note_id": "644fb4db0000000007038e63",
      "xsec_token": "ABbpHsLUVDfzFGQhVGvLVuGtVX4bVBjsmPJILobMCubdg=",
      "url": "https://www.xiaohongshu.com/explore/644fb4db0000000007038e63?xsec_token=ABbpHsLUVDfzFGQhVGvLVuGtVX4bVBjsmPJILobMCubdg=&xsec_source=pc_feed",
      "note_type": "video"
    }
  ],
  "error_reasoning": null
}
```

Failure outcomes (less common — the SSR path is stable):

```json
// Stealth-less session: shell renders but feed is empty
{ "success": false, "videos": [], "error_reasoning": "SSR returned empty feeds[] — session is missing --verified/--proxies stealth or was fingerprinted as bot." }

// Non-browser fetch path: same symptom as above
{ "success": false, "videos": [], "error_reasoning": "browse cloud fetch returns empty feed; must use browse open with a real browser session." }
```
