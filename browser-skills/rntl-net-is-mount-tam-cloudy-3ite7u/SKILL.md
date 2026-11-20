---
name: rntl-net-is-mount-tam-cloudy-3ite7u
title: Is Mount Tam Cloudy? (Webcam Overcast Check)
description: >-
  Decide whether Mount Tamalpais is currently overcast by pulling the live
  snapshot JPEG from the rntl.net Mt. Tam Cam (Sigward / Muir Beach ipcamlive
  feed) and visually classifying the sky. Returns a sky-condition category,
  ridgeline-visibility flag, and a go/don't-go recommendation. Read-only.
website: rntl.net
category: weather
tags:
  - weather
  - webcam
  - outdoors
  - hiking
  - marin
  - read-only
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      Use only if ipcamlive.com's snapshot endpoint is unreachable. Open the
      rntl.net page in a Browserbase session with --proxies --verified and
      screenshot the rendered player. ~50× more expensive than the API path and
      the screenshot includes player chrome, which slightly degrades downstream
      visual classification.
  - method: hybrid
    rationale: >-
      Production deployments typically combine the API snapshot fetch with a
      multimodal vision model call for sky classification. The 'api' label here
      refers to the optimal *data acquisition* path; the downstream visual
      reasoning is the consumer's responsibility.
verified: false
proxies: true
---
# Is Mount Tam Cloudy? — Webcam Overcast Check

## Purpose

Decide whether Mount Tamalpais (Marin County, CA) is currently overcast by visually inspecting the live webcam feed published on `rntl.net/mt-tam-cam-tamalpais-webcam`. Returns a categorical sky condition (`clear` / `partly_cloudy` / `overcast` / `fogged_in` / `night_unreadable`), a `go_recommendation` (boolean — go vs. don't go for a view-quality hike), the captured camera timestamp, and the snapshot URL. **Read-only**; never posts, never controls the camera, never books anything.

## When to Use

- "Should I drive up to East Peak / Rock Spring / Pantoll today, or will I be inside a cloud?"
- A morning briefing agent assembling weather context for Bay Area outdoor plans.
- A trail-condition aggregator pairing this signal with NWS forecasts and AQI for Marin County.
- Anywhere the question is **"is the sky clear right now over Mt. Tam"** answered from real-time imagery, not a forecast.

## Workflow

The `rntl.net` page is a long WordPress index of Bay Area webcams; its **primary "Mt. Tam Cam"** iframe is an `ipcamlive.com` player (the Sigward / Muir Beach camera facing south across the southwestern flank of Mt. Tam toward Sutro Tower and Ocean Beach). The optimal path **bypasses both `rntl.net` and the JS-heavy iframe player** and pulls the still JPEG directly from `ipcamlive.com`'s snapshot endpoint, then hands the image to a multimodal model for sky classification. This is ~50× cheaper than driving the page in a headless browser and avoids the WebSocket/HLS streaming pipeline entirely.

1. **Resolve the camera alias.** The primary Mt. Tam Cam alias is `608dc4709bc06` (Sigward / Muir Beach, south-facing — the headline camera on the rntl.net page). A secondary bay-facing cam alias `5e863c6e0e66d` is also embedded on the same page and can be used as a cross-check. If you need to re-discover or verify the alias, do one cheap HTTP fetch of the page and grep for `ipcamlive.com/player/player.php?alias=([a-f0-9]+)` — the first match is the headline cam. No browser session is needed.

   ```bash
   ALIAS=608dc4709bc06          # Sigward / Muir Beach – primary
   ALIAS_SECONDARY=5e863c6e0e66d # Bay-facing cross-check cam
   ```

2. **Pull the snapshot JPEG.** The ipcamlive snapshot endpoint issues a 302 to a per-stream `snapshot.jpg` on a numbered edge host (`s73.ipcamlive.com` at time of writing — do not hardcode; follow the redirect). The JPEG is served with `Access-Control-Allow-Origin: *`, `Cache-Control: no-cache`, and a `Last-Modified` header that is the **exact capture timestamp** of the still. Use a residential-proxy HTTP fetch (`browse cloud fetch --proxies`) — no Browserbase browser session is required.

   ```bash
   browse cloud fetch "https://g1.ipcamlive.com/player/snapshot.php?alias=$ALIAS" --proxies
   # → 302 Location: https://s73.ipcamlive.com/streams/<streamId>/snapshot.jpg
   browse cloud fetch "https://s73.ipcamlive.com/streams/<streamId>/snapshot.jpg" --proxies
   # → 200, content-type: image/jpeg, body is base64 in the fetch envelope's `content` field
   ```

   Decode the base64 `content` to bytes; the result is a ~1280×720 JPEG ≈ 25–135 KB.

3. **Read the burned-in timestamp.** The primary Sigward cam stamps the frame in its bottom-left corner as `YYYY-MM-DD HH:MM:SS <DayName>` in Pacific time. Cross-check it against the response's `Last-Modified` header to confirm the stream is live (not a stale image). If the two differ by more than ~5 minutes, treat the feed as stale and either retry after 60 s or fail soft with `night_unreadable` / `feed_stale`.

4. **Visually classify the sky.** Pass the JPEG to a multimodal model with a structured prompt:

   > "Look at the upper third of this Mt. Tam / Marin coast webcam image. Classify the sky as exactly one of: `clear` (mostly blue, < 25% cloud cover), `partly_cloudy` (25–75% cloud cover or scattered clouds), `overcast` (> 75% uniform gray cloud cover or low ceiling obscuring distant ridgelines), `fogged_in` (camera lens is in cloud — distant features invisible, image is mostly uniform gray), or `night_unreadable` (frame is too dark to judge). Also report whether distant ridgelines / Sutro Tower across the bay are visible. Respond as JSON: `{condition, ridgelines_visible: boolean, notes: string}`."

   Apply the decision rule: `go_recommendation = condition ∈ {clear, partly_cloudy}` AND `ridgelines_visible === true`. Both `overcast` and `fogged_in` should map to `go_recommendation: false`. `night_unreadable` should set `go_recommendation: null` and explain that the feed cannot be visually judged at this hour — defer to a forecast.

5. **(Optional) Cross-check with the secondary cam.** When the answer is borderline (`partly_cloudy` with ambiguous ridgeline visibility) or when the primary cam's last-modified is stale, repeat steps 2–4 with `ALIAS_SECONDARY=5e863c6e0e66d` and reconcile. Disagreement between the two cams (one clear, one fogged) usually means a low marine layer along the coast — flag this as `notes: "marine_layer_likely"` and lean toward `partly_cloudy`.

### Browser fallback

Only use this if `ipcamlive.com` is unreachable or the snapshot endpoint stops responding (no observed instances as of 2026-05-18):

```bash
SID=$(browse cloud sessions create --keep-alive --proxies --verified | jq -r .id)
browse open "https://www.rntl.net/mt-tam-cam-tamalpais-webcam/" --remote --session "$SID"
browse wait load --remote --session "$SID"
browse wait timeout 4000 --remote --session "$SID"   # iframe player streams in
browse screenshot --remote --session "$SID" --path /tmp/mt-tam.png
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

Then hand `/tmp/mt-tam.png` to the same multimodal classifier from step 4. This costs roughly two orders of magnitude more (Browserbase session + proxy minutes) and the resulting image is a screenshot of a player UI, not the raw camera frame — accuracy suffers because the player overlays controls. Prefer the API path.

## Site-Specific Gotchas

- **The "Mt. Tam Cam" branding is misleading.** The headline iframe on `rntl.net/mt-tam-cam-tamalpais-webcam` is the Sigward Muir Beach cam (`608dc4709bc06`) — it points **south from the Muir Beach headlands toward Sutro Tower and Ocean Beach**, not up at the Mt. Tam summit. It is a valid proxy for "is the western Marin coast under marine layer / overcast today?" but it is *not* a summit cam. The image's burned-in caption confirms this: "Muir Beach www.sigward.com — Webcamera facing south to Sutro Tower and Ocean Beach in San Francisco west of Golden Gate". Document this in the user-facing output as `vantage: "Muir Beach S-facing"` so the consumer doesn't assume summit conditions.
- **Snapshot endpoint = 302 redirect; follow it.** `GET https://g1.ipcamlive.com/player/snapshot.php?alias=<ALIAS>` returns `302 Location: https://s<N>.ipcamlive.com/streams/<streamId>/snapshot.jpg`. The numbered edge host (`s73`, `s74`, …) is not stable across cameras and may rebalance over time — always follow the redirect, never hardcode the edge.
- **No auth, no cookies, no anti-bot.** Both `rntl.net` (Cloudflare front, served `DYNAMIC` cache status) and `ipcamlive.com` (Apache, no challenge) accept proxy fetches with no friction. `--verified` stealth is unnecessary for the snapshot path; `--proxies` alone is sufficient. The browser fallback uses `--verified --proxies` purely for resilience against the multi-iframe page.
- **`Last-Modified` vs. burned-in timestamp.** The response's `Last-Modified` header is roughly accurate to the second the snapshot was generated server-side, but the timestamp burned into the frame (bottom-left, white text) is the camera's own clock and is the authoritative capture time. Use the burned-in time for user-facing display.
- **Snapshot refresh cadence ≈ 30–60 seconds.** Repeated polls within ~30 seconds return the same JPEG (same `Etag`). If you need a *truly* fresh frame, space requests ≥ 60 s apart.
- **Night frames are mostly unreadable.** The Sigward cam is not IR-equipped — after sunset (roughly 19:30–06:30 PT depending on season) frames go nearly black except for a few Marin/SF light points. Don't attempt overcast classification at night; return `night_unreadable` and defer to NWS marine forecast (`weather.gov/mtr`). The secondary cam (`5e863c6e0e66d`) is similarly dark at night.
- **Marine layer ≠ overcast for hiking decisions.** A common Bay Area pattern is a low marine layer sitting on the coast (Muir Beach fogged in) while Mt. Tam's summit (~2,571 ft) is in clear sun above it. If the primary cam shows uniform gray with invisible distant ridgelines but the secondary bay-facing cam is clear, the *summit* may still be a great destination above the inversion. Surface this as `notes: "marine_layer_likely_summit_may_be_above"` rather than a flat "don't go".
- **Page is a giant index of cams, not a single cam.** `rntl.net/mt-tam-cam-tamalpais-webcam` embeds 10+ iframes including YouTube live streams (`FLoSUN_Vrz4`, `CO4lgqL7Fhg`), CBS Salesforce Tower cams, Ventusky wind embed, and a `boardsportscalifornia.com/coyotecam.jpg` still. The two `ipcamlive.com` iframes (`608dc4709bc06` and `5e863c6e0e66d`) are the only ones with a documented public snapshot endpoint; the YouTube embeds would require frame extraction via streamlink/yt-dlp and are not worth the cost.
- **JPEG carries no EXIF.** Don't try to read GPS / timestamp metadata from the JPEG bytes — the camera strips it. The burned-in caption and the response headers are the only metadata channels.
- **Browserbase WebSocket connect (`connect.usw2.browserbase.com`) is reachable from the agent sandbox via the SDK proxy but not via raw DNS.** This is why the recommended path uses `browse cloud fetch` (Browserbase Fetch API, HTTPS-only) rather than `browse open --remote` (CDP over WSS). If you do need the browser fallback, ensure your environment supports the Browserbase connect URL — local-mode `browse` without `--remote` will not have residential proxying.

## Expected Output

Five distinct outcome shapes — return exactly one:

```json
// Clear or partly cloudy — go
{
  "condition": "clear",
  "ridgelines_visible": true,
  "go_recommendation": true,
  "captured_at": "2026-05-18T15:33:13-07:00",
  "captured_at_source": "burned_in_timestamp",
  "vantage": "Muir Beach S-facing (Sigward cam)",
  "snapshot_url": "https://s73.ipcamlive.com/streams/49vri5j7owhgsudrs/snapshot.jpg",
  "alias": "608dc4709bc06",
  "notes": "Blue sky with light horizon haze."
}
```

```json
// Overcast — don't go for views
{
  "condition": "overcast",
  "ridgelines_visible": false,
  "go_recommendation": false,
  "captured_at": "2026-05-18T07:12:00-07:00",
  "captured_at_source": "burned_in_timestamp",
  "vantage": "Muir Beach S-facing (Sigward cam)",
  "snapshot_url": "https://s73.ipcamlive.com/streams/49vri5j7owhgsudrs/snapshot.jpg",
  "alias": "608dc4709bc06",
  "notes": "Uniform gray sky, distant ridges invisible."
}
```

```json
// Fogged in at the coast — summit may be above the marine layer
{
  "condition": "fogged_in",
  "ridgelines_visible": false,
  "go_recommendation": false,
  "captured_at": "2026-05-18T08:45:00-07:00",
  "captured_at_source": "burned_in_timestamp",
  "vantage": "Muir Beach S-facing (Sigward cam)",
  "snapshot_url": "https://s73.ipcamlive.com/streams/49vri5j7owhgsudrs/snapshot.jpg",
  "alias": "608dc4709bc06",
  "notes": "marine_layer_likely_summit_may_be_above — cross-check secondary cam (5e863c6e0e66d) and consider East Peak which often sits above the inversion."
}
```

```json
// Night — defer
{
  "condition": "night_unreadable",
  "ridgelines_visible": null,
  "go_recommendation": null,
  "captured_at": "2026-05-18T22:33:00-07:00",
  "captured_at_source": "burned_in_timestamp",
  "vantage": "Muir Beach S-facing (Sigward cam)",
  "snapshot_url": "https://s73.ipcamlive.com/streams/49vri5j7owhgsudrs/snapshot.jpg",
  "alias": "608dc4709bc06",
  "notes": "Frame too dark for visual classification — defer to weather.gov/mtr forecast."
}
```

```json
// Feed stale / unreachable
{
  "condition": "feed_stale",
  "ridgelines_visible": null,
  "go_recommendation": null,
  "captured_at": "2026-05-18T03:00:00-07:00",
  "captured_at_source": "burned_in_timestamp",
  "vantage": "Muir Beach S-facing (Sigward cam)",
  "snapshot_url": "https://s73.ipcamlive.com/streams/49vri5j7owhgsudrs/snapshot.jpg",
  "alias": "608dc4709bc06",
  "notes": "Last-Modified header > 1 hour ago; image likely stale. Retried 60 s later, same Etag — try secondary cam or fall back to forecast."
}
```
