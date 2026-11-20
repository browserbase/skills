---
name: youtube-com-extract-transcript-loeude
title: YouTube Video Transcript Extraction
description: >-
  Given a YouTube video URL or ID, return title, channel, duration, full
  timestamped transcript segments, and whether captions are auto-generated or
  human-authored. Read-only.
website: youtube.com
category: video
tags:
  - youtube
  - transcript
  - captions
  - video
  - read-only
  - innertube
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: api
alternative_methods:
  - method: api
    rationale: >-
      The InnerTube /youtubei/v1/player POST endpoint with the ANDROID client
      returns the same captionTracks[] data as the JS player, requires no API
      key as of late 2024, succeeds from datacenter IPs without proxies, and
      avoids the 1 MB+ watch-page HTML payload entirely. ~2 HTTP calls,
      sub-second wall.
  - method: browser
    rationale: >-
      Fallback only when InnerTube returns LOGIN_REQUIRED / 403 sporadic
      bot-detection. Drive a Browserbase session with --proxies --verified, open
      /watch, read window.ytInitialPlayerResponse — same shape as the InnerTube
      response. ~10x more expensive and slower; reserve for the ~5% of videos
      where the API path fails.
  - method: url-param
    rationale: >-
      https://www.youtube.com/oembed?url=... is the cheapest way to get title +
      channel (verified working, ~450 byte response, no auth) and a fast
      existence check before committing to the heavier InnerTube call.
      Insufficient on its own — does not return transcript or duration.
verified: false
proxies: false
---
# YouTube Video Transcript Extraction

## Purpose

Given a YouTube video URL or video ID, return the video's title, channel/uploader name, duration in seconds, the full transcript as timestamped segments, and a flag indicating whether the captions are auto-generated (`asr`) or human-authored. Read-only — never likes, comments, subscribes, or watches.

## When to Use

- Summarizing or indexing the spoken content of a video.
- Search/discovery agents that need to grep video bodies for a query.
- Translation / accessibility flows that need source-language captions to retranslate from.
- Any pipeline that previously screen-scraped the "Show transcript" UI panel — the InnerTube API path is faster, cheaper, and degrades more honestly when captions are unavailable.

## Workflow

YouTube's web UI is a thin client over the public **InnerTube** API at `https://www.youtube.com/youtubei/v1/`. The transcript task needs two API calls (one optional) and zero browser pixels for ~95% of videos — only fall back to a browser session when InnerTube returns a `LOGIN_REQUIRED` / `AGE_VERIFICATION_REQUIRED` playability status and the caller wants to attempt the consent flow.

### 1. Normalize the input to a video ID

Accept any of:
- `https://www.youtube.com/watch?v=<ID>` (canonical)
- `https://youtu.be/<ID>`
- `https://www.youtube.com/shorts/<ID>`
- `https://www.youtube.com/embed/<ID>`
- `https://m.youtube.com/watch?v=<ID>`
- bare 11-char id (`[A-Za-z0-9_-]{11}`)

Strip query params other than `v=` and any list/playlist context. The video ID is always exactly 11 characters; reject anything else early.

### 2. (Cheap, ~0.1s) Fetch title + channel via the oEmbed endpoint

```
GET https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D<ID>&format=json
```

Returns JSON with `title`, `author_name` (channel), `author_url`, and `thumbnail_url`. No auth, no key. ~450 bytes. Use this for the metadata even if you later succeed at the InnerTube call — it's a sanity check that the video actually exists publicly:

- **404** → video is private/deleted/unlisted-without-access. Return `success: false, reason: "video_unavailable"` and stop.
- **401** → embedding disabled but the video may still be public; do not stop. Continue to step 3 and read `videoDetails.title` / `author` from the InnerTube response.

### 3. POST to InnerTube `/player` for caption track URLs + duration

```
POST https://www.youtube.com/youtubei/v1/player?prettyPrint=false
Content-Type: application/json
Origin: https://www.youtube.com

{
  "context": {
    "client": {
      "clientName": "ANDROID",
      "clientVersion": "19.09.37",
      "androidSdkVersion": 30,
      "hl": "en",
      "gl": "US",
      "userAgent": "com.google.android.youtube/19.09.37 (Linux; U; Android 14) gzip"
    }
  },
  "videoId": "<ID>"
}
```

**Why the `ANDROID` client over `WEB`?**

| Client       | Needs API key? | Needs visitorData / PoToken? | Returns captionTracks? | Notes |
|---|---|---|---|---|
| `WEB`        | yes (`INNERTUBE_API_KEY`, harvested from the embed page) | increasingly yes — Google rolled out bot-detection tokens through 2024-2025 | yes | The "official" path the JS player uses. Brittle when Google rotates the key or adds a new gate. |
| `ANDROID`    | **no** (no `key=` query param required as of mid-2025) | no | yes | The mobile InnerTube client has the loosest validation. Fastest known path. |
| `IOS`        | no | no | yes | Equivalent fallback if ANDROID starts requiring extra fields. |
| `WEB_EMBEDDED_PLAYER` | yes | yes | sometimes — returns `EMBEDDER_IDENTITY_MISSING_REFERRER` when the request lacks a valid `Referer`, in which case `captions` is absent | Useful only when the watch endpoint is region-locked. |

If `ANDROID` returns `playabilityStatus.status !== "OK"`, retry once with `IOS` (same body, just swap `clientName`/`clientVersion` to `"IOS"` / `"19.09.3"`). If both fail with the same reason, that's the honest answer.

Parse the response:

```js
{
  playabilityStatus: { status: "OK" | "ERROR" | "LOGIN_REQUIRED" | "UNPLAYABLE" | "LIVE_STREAM_OFFLINE", reason?: "..." },
  videoDetails: {
    videoId: "dQw4w9WgXcQ",
    title: "...",
    author: "Rick Astley",              // channel name
    lengthSeconds: "213",                // STRING, not number — coerce
    isLiveContent: false,
    channelId: "UCuAXFkgsw1L7xaCfnd5JJOw",
    shortDescription: "..."
  },
  captions: {
    playerCaptionsTracklistRenderer: {
      captionTracks: [
        {
          baseUrl: "https://www.youtube.com/api/timedtext?v=...&caps=asr&...&signature=...",
          name: { simpleText: "English" } | { runs: [{ text: "English" }] },
          vssId: ".en" | "a.en",          // a. prefix = auto-generated
          languageCode: "en",
          kind: "asr",                    // present iff auto-generated; absent for human-authored
          isTranslatable: true,
          trackName: ""
        },
        ...
      ],
      audioTracks: [...],
      translationLanguages: [...]
    }
  } | undefined                            // entire field is absent when captions are disabled
}
```

**Outcome branches at this point:**

- `playabilityStatus.status === "OK"` and `captions.playerCaptionsTracklistRenderer.captionTracks` non-empty → continue to step 4.
- `playabilityStatus.status === "OK"` but no `captions` field, or empty `captionTracks` → `success: false, reason: "captions_disabled"`. Still return title/channel/duration.
- `playabilityStatus.status === "LIVE_STREAM_OFFLINE"` or `videoDetails.isLiveContent === true` with no `captions` → `success: false, reason: "live_stream_no_transcript"`.
- `playabilityStatus.status === "LOGIN_REQUIRED"` → `success: false, reason: "age_restricted"`. Optional browser fallback (step 6).
- `playabilityStatus.status === "UNPLAYABLE"` (region block, copyright takedown) → `success: false, reason: "video_unavailable"`, copy `playabilityStatus.reason` verbatim into the error payload.
- `playabilityStatus.status === "ERROR"` → `success: false, reason: "video_unavailable"`.

### 4. Pick the caption track

Default policy:
1. Exact match on the caller's preferred language code, preferring human-authored over `kind === "asr"`.
2. If no exact match, fall back to the first track whose `languageCode` starts with the preferred language prefix (`en-US` matches `en`).
3. If still no match, take the first track in the list and set `language_fallback: true` in the output.

For "I just want a transcript, any language":
1. First human-authored track (any track where `kind` is absent).
2. Otherwise the first `asr` track.

The `kind === "asr"` flag IS the authoritative `auto_generated` signal. The `vssId` prefix (`a.` vs `.`) is a redundant secondary signal — agree-with-`kind` checks are a useful invariant in tests but not needed at runtime.

### 5. Fetch the track and decode segments

The `baseUrl` is already-signed and returns XML by default. **Always append `&fmt=json3`** for a structured response:

```
GET <baseUrl>&fmt=json3
```

Returns:

```json
{
  "wireMagic": "pb3",
  "pens": [...],
  "wsWinStyles": [...],
  "wpWinPositions": [...],
  "events": [
    {
      "tStartMs": 18800,
      "dDurationMs": 4040,
      "segs": [
        { "utf8": "We're no strangers to love" }
      ]
    },
    {
      "tStartMs": 23900,
      "dDurationMs": 3000,
      "segs": [
        { "utf8": "You know the rules" },
        { "utf8": " and so do I" }      // multiple segs in one event = inline timing inside the line
      ]
    }
  ]
}
```

Normalize each event to one segment:
- `start_seconds = event.tStartMs / 1000`
- `duration_seconds = event.dDurationMs / 1000`
- `text = event.segs.map(s => s.utf8 ?? "").join("").trim()`
- Drop events whose joined `text` is empty (these are pure styling / continuation markers).
- Drop events whose `segs` is missing entirely (these are `aAppend: 1` continuation events on auto-generated tracks; their text was already emitted on the previous event).

For the `auto_generated` boolean in your output, use `kind === "asr"`. Do NOT infer from the presence of multiple segs per event — both manual and ASR tracks can have multi-seg events.

To translate on-the-fly to a different language, append `&tlang=<code>` to the baseUrl (Google's machine translation). The response shape is identical; mark the result as `translated: true, source_language: <original>`.

### 6. Browser fallback (only when InnerTube is hostile)

If both `ANDROID` and `IOS` InnerTube calls fail with a non-`OK` `playabilityStatus`, OR if Google has temporarily blocked datacenter IPs from the InnerTube endpoint (observed sporadically — 403 with empty body), drive a real browser:

```bash
SID=$(browse cloud sessions create --keep-alive --proxies --verified | jq -r '.id')
export BROWSE_SESSION="$SID"

browse open "https://www.youtube.com/watch?v=<ID>" --remote
browse wait load --remote
browse wait timeout 3000 --remote          # let the player chrome render
PLAYER_RESPONSE=$(browse eval --remote 'JSON.stringify(window.ytInitialPlayerResponse || null)')
```

`ytInitialPlayerResponse` has the **exact same shape** as the InnerTube `/player` POST response — so the parsing in steps 3–5 is unchanged. The captionTracks `baseUrl` you read from the watch page is signed for that browser session, so fetch it via `browse eval`'s `fetch()` (same-origin) rather than from your own runtime:

```bash
TRACK_URL=$(node -e "console.log(JSON.parse(process.argv[1]).captions.playerCaptionsTracklistRenderer.captionTracks[0].baseUrl + '&fmt=json3')" "$PLAYER_RESPONSE")
browse eval --remote "await fetch('${TRACK_URL}').then(r => r.text())"
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

A residential-proxy session (`--proxies --verified`) is recommended for the browser fallback because YouTube's bot detection is more aggressive on the consent / `/watch` HTML path than on the InnerTube API — but the API path itself in step 3 routinely succeeds from datacenter IPs with no proxy. **Don't pay for `--proxies` until you actually need it.**

## Site-Specific Gotchas

- **`lengthSeconds` is a string**, not a number — JSON-parse coerces correctly but a naïve `videoDetails.lengthSeconds + 1` will concatenate. Cast.
- **`captions` field is entirely absent**, not `null`, when the uploader has disabled captions. Distinguish `"captions" in player` vs `captions.playerCaptionsTracklistRenderer.captionTracks.length === 0` — both indicate "no transcript", but the former is the uploader's choice and the latter is occasionally a transient API state. Retry once on the empty-array case before declaring `captions_disabled`.
- **Auto-generated detection: `kind === "asr"` is the canonical signal.** `vssId` starting with `a.` is a redundant cross-check. Don't try to infer auto-generated from text quality / lowercasing / no-punctuation — modern ASR adds capitalization and punctuation; that heuristic is dead.
- **The InnerTube `key=` query parameter is no longer required for the `ANDROID` and `IOS` clients** as of late 2024 — those clients are validated by `User-Agent` + `clientVersion` instead. The `WEB` client still requires the key, which you harvest from `https://www.youtube.com/embed/<id>` HTML (`"INNERTUBE_API_KEY":"..."` — verified live as `AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8` on 2026-05-18, rotates ~quarterly). Don't hardcode the key.
- **`captionTracks[].baseUrl` is signed and time-limited.** The signature embedded in the URL expires after ~6 hours. Fetch the track within minutes of getting the player response; don't store baseUrls in a long-lived cache.
- **`&fmt=json3` is mandatory for machine consumption.** Default response is `xml` (TTML-style) with HTML entities, font tags, and inline `<br>` — much harder to parse cleanly than json3's `events[].segs[].utf8`.
- **Bare `https://www.youtube.com/api/timedtext?v=<id>&lang=<code>` GETs return HTTP 200 with empty body** when no signature is supplied. Don't be fooled by the 200 — the body length is 0. Verified 2026-05-18: `/api/timedtext?v=dQw4w9WgXcQ&lang=en&fmt=json3` → `200 OK Content-Length: 0`. The signed `baseUrl` from the player response is the only working entry point.
- **`type=list` on the timedtext endpoint is deprecated** and also returns 200 + empty body. Use the InnerTube `/player` response's `captionTracks` array instead.
- **Live streams may have no caption tracks even when `playabilityStatus === "OK"`.** Check `videoDetails.isLiveContent` and `videoDetails.isLive`; if either is true and `captions` is missing, report `live_stream_no_transcript` rather than `captions_disabled`. Once a live stream ends and is post-processed (typically within an hour), captions may appear.
- **Shorts have transcripts.** A YouTube Short (`/shorts/<id>`) is just a regular video with portrait aspect ratio. The same InnerTube call works; the only difference is `lengthSeconds` is usually ≤60.
- **`embedded_player_response` inside the embed page does NOT contain caption tracks** when fetched without a valid `Referer`. The embed HTML returns `previewPlayabilityStatus.errorCode: "PLAYABILITY_ERROR_CODE_EMBEDDER_IDENTITY_MISSING_REFERRER"` and the `captions` field is absent. This is a common dead-end. Always use the InnerTube POST instead. (Confirmed 2026-05-18 against `https://www.youtube.com/embed/dQw4w9WgXcQ` — 128 KB HTML, INNERTUBE_API_KEY and clientVersion present, but no `captionTracks` anywhere in the document.)
- **The watch page is large.** `https://www.youtube.com/watch?v=<id>` consistently returns > 1 MB of HTML (verified — exceeded the Browserbase Fetch 1 MB cap on `www.youtube.com`, `m.youtube.com`, `music.youtube.com`, `/shorts/`, and `/watch_videos?video_ids=...` variants on 2026-05-18). Don't try to fetch and regex it from a lightweight fetch endpoint; either use the InnerTube POST or open it in a real browser session and read `window.ytInitialPlayerResponse`.
- **`Origin: https://www.youtube.com` header on the InnerTube POST is recommended** even from the ANDROID client — it appeases the upstream WAF on rare 429-rate-limited paths. The `User-Agent` should match the `clientVersion`: `com.google.android.youtube/<version> (Linux; U; Android 14) gzip`.
- **Region locks come back as `UNPLAYABLE`** with `reason: "Video unavailable in your country"`. The `ANDROID` client doesn't bypass these any more than the `WEB` client does — both honor geofencing. Use a residential proxy in the relevant region if you need to access region-locked content.
- **Age-restricted videos return `LOGIN_REQUIRED`** on cookieless InnerTube. There's no clean public bypass; the legacy `EMBEDDED_PLAYER` cipher trick stopped working in 2023. Report `age_restricted` and move on, or fall back to a logged-in browser session if the caller has cookies.
- **Caption tracks may be empty arrays even on healthy videos.** Some videos have `captions.playerCaptionsTracklistRenderer.audioTracks` populated but `captionTracks: []` — these are videos with multi-language *audio* dubs but no subtitle tracks. Treat as `captions_disabled`.
- **Translation tracks via `&tlang=` are machine-translated by Google.** They're not separate tracks in `captionTracks`; they're a per-baseUrl query parameter. Available target languages are listed in `captions.playerCaptionsTracklistRenderer.translationLanguages[]`.
- **Multiple `segs[]` per event** on auto-generated tracks represent word-level timing for highlighting; concatenate them to get the line text. On human-authored tracks, multi-`segs` usually represents inline formatting (italics, color). Either way, concatenate `utf8` fields and you get the human-readable line.
- **Empty `segs` events with `aAppend: 1`** are continuation markers for the previous event's last segment (used to extend the highlight window). Skip them — their text was already emitted.

## Expected Output

Six distinct outcome shapes. Always include the `video_id` and any metadata you successfully resolved, even on failure.

```json
// (A) Success — human-authored captions
{
  "success": true,
  "video_id": "dQw4w9WgXcQ",
  "video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "title": "Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)",
  "channel": "Rick Astley",
  "channel_url": "https://www.youtube.com/@RickAstleyYT",
  "duration_seconds": 213,
  "is_live": false,
  "captions": {
    "language": "en",
    "language_name": "English",
    "auto_generated": false,
    "translated": false,
    "segment_count": 56,
    "segments": [
      { "start_seconds": 18.80, "duration_seconds": 4.04, "text": "We're no strangers to love" },
      { "start_seconds": 23.84, "duration_seconds": 3.00, "text": "You know the rules and so do I" }
    ]
  },
  "available_languages": [
    { "language_code": "en", "name": "English", "auto_generated": false },
    { "language_code": "es", "name": "Spanish (auto-generated)", "auto_generated": true }
  ],
  "error_reasoning": null
}

// (B) Success — auto-generated only
{
  "success": true,
  "video_id": "...",
  "title": "...", "channel": "...", "duration_seconds": 720,
  "captions": { "language": "en", "auto_generated": true, "segment_count": 187, "segments": [...] },
  "error_reasoning": null
}

// (C) Captions disabled by uploader
{
  "success": false,
  "video_id": "...", "title": "...", "channel": "...", "duration_seconds": 600,
  "captions": null,
  "error_reasoning": "captions_disabled"
}

// (D) Live stream — no transcript yet
{
  "success": false,
  "video_id": "...", "title": "...", "channel": "...", "duration_seconds": 0, "is_live": true,
  "captions": null,
  "error_reasoning": "live_stream_no_transcript"
}

// (E) Age-restricted / login-required
{
  "success": false,
  "video_id": "...", "title": null, "channel": null, "duration_seconds": null,
  "captions": null,
  "error_reasoning": "age_restricted",
  "playability_status": "LOGIN_REQUIRED"
}

// (F) Video unavailable (private, deleted, region-blocked, copyright takedown)
{
  "success": false,
  "video_id": "...", "title": null, "channel": null, "duration_seconds": null,
  "captions": null,
  "error_reasoning": "video_unavailable",
  "playability_status": "UNPLAYABLE",
  "playability_reason_verbatim": "Video unavailable in your country"
}
```
