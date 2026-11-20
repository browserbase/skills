---
name: seatguru-com-get-seat-map-dog7jd
title: SeatGuru Seat Map (Site Offline)
description: >-
  SeatGuru.com was shut down by TripAdvisor on/around 2025-11-04. The homepage
  serves a static migration notice and every deep URL returns HTTP 301 to
  tripadvisor.com from a CloudFront edge function. This skill documents the wall
  and routes callers to the working alternatives (aerolopa.com, seatlink.com,
  flightseatmap.com, seatmaps.com).
website: seatguru.com
category: travel
tags:
  - aviation
  - seat-maps
  - site-offline
  - tripadvisor
  - deprecated
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: browser
alternative_methods:
  - method: browser
    rationale: >-
      Driving a real browser session against seatguru.com renders either the
      static 'SeatGuru has closed down' notice (on /) or follows a 301 to
      tripadvisor.com (on every other path). No seat data is ever returned. Do
      not waste a Browserbase session here.
  - method: api
    rationale: >-
      SeatGuru never exposed a public API; the only data path was
      server-rendered PHP. With the origin decommissioned, even the historical
      scraping endpoints third-party aggregators relied on are gone.
  - method: hybrid
    rationale: >-
      Route the caller to aerolopa.com (scaled geometry), seatlink.com
      (crowd-sourced comments — the closest functional successor to SeatGuru),
      flightseatmap.com (broad coverage), or seatmaps.com (multi-lingual). A
      successor skill targeting one of these domains is the right next step.
verified: true
proxies: true
---
# SeatGuru Seat Map Extraction

## Purpose

Originally this skill was meant to fetch a SeatGuru.com seat map for a given airline + aircraft (or flight number + date) and return structured per-seat data (color code, features, user comments, pitch/width/power/Wi-Fi metadata). **As of 2026-05-18, that is no longer possible: SeatGuru is offline.** TripAdvisor decommissioned the site on or around 2025-11-04, replacing the entire seatguru.com domain with a static migration notice on `/` and a blanket HTTP 301 to `https://www.tripadvisor.com/` on every other path. No seat data, no API, no DOM, no fallback subdomain remains. This skill exists to document that wall, prevent future agents from wasting iterations trying to scrape seatguru.com, and route the caller to the working alternatives that actually carry the data SeatGuru used to.

Read-only — but there is nothing to read on seatguru.com anymore.

## When to Use

- Any flow that historically reached for "get the SeatGuru map for UA 123 on this date" — the answer is "you can't, but here's where to go instead."
- Eval suites or regression tests that still target a seatguru.com URL — return the standard shutdown payload (see Expected Output) immediately, without burning a Browserbase session.
- Triage of older skills/agents that hard-code seatguru.com URLs — this skill is the canonical reference for why those URLs no longer work and what to replace them with.

## Workflow

The site is gone. Do not open a remote browser session. Do not pay for Verified + proxies. A single `browse cloud fetch` is sufficient to confirm the wall, and you can skip even that if you trust this skill.

### 1. (Optional) Confirm the shutdown is still in effect

If you want to verify nothing has changed:

```bash
browse cloud fetch "https://www.seatguru.com/" --proxies
```

Expected response (cached at CloudFront, `X-Cache: Hit from cloudfront`):

- `statusCode: 200`
- `Content-Type: text/html`
- Body is ~1.4 KB of static HTML containing the literal strings:
  - `<title>Travel News & Information - Tips, Deals, Gear, Airport & Airline News</title>`
  - `<meta http-equiv="refresh" content="5; url=https://www.tripadvisor.com">`
  - `<p class="title">SeatGuru has closed down, please visit Tripadvisor to plan your next trip</p>`
  - `<a class="second-button" href="https://www.tripadvisor.com">Go to Tripadvisor</a>`
- No `<script>`, no seat-map markup, no data-attributes, no embedded JSON.

Any deep URL (e.g. `/airlines/United_Airlines/United_Airlines_Boeing_777-200.php`, `/findseatmap/findseatmap.php`, `/browseairlines/browseairlines.php`, `/charts/longhaul.php`) returns:

- `statusCode: 301`
- `Location: https://www.tripadvisor.com/`
- `Server: CloudFront`, `X-Cache: FunctionGeneratedResponse from cloudfront`
- Empty body (`Content-Length: 0`)

The `X-Cache: FunctionGeneratedResponse from cloudfront` header is the signature of a CloudFront edge function — the 301 is generated at the edge and never reaches a real origin, so no amount of Verified, residential proxies, header tuning, captcha solving, sitemap discovery, or wayback-machine clever ever produces seat data from seatguru.com again. The data store behind the site has been decommissioned, not just the front end.

### 2. Emit the shutdown payload

Return the structured `site_offline` response shape under "Expected Output" so the caller can branch on it. Include the alternative-source list verbatim — callers expect a deterministic alternatives array.

### 3. Route the caller to a working source

If the caller's intent was "give me a seat map for X," redirect them to one of the four live replacements. Match on what they need:

| Caller wants… | Recommended replacement | Notes |
|---|---|---|
| Scaled, accurate seat geometry (window positions, lavatory + galley footprints, exact pitch in cm) | **aerolopa.com** | Hobbyist-run UK site, no ads, widely endorsed (Head for Points, NerdWallet, Smart With Points). Considered the highest-quality successor. No public API; static per-aircraft pages. |
| Crowd-sourced "good/bad seat" verdicts and per-seat user comments (the thing SeatGuru was actually known for) | **seatlink.com** | Beta product, but the largest surviving crowdsourced seat-review corpus. URL pattern `https://www.seatlink.com/airlines/<airline>/`. |
| "I just want the seat map for this airline + aircraft, give me any reasonable one" | **flightseatmap.com** or **seatmaps.com** | flightseatmap.com claims "6161+ airlines"; seatmaps.com advertises 3244 updated aircraft and is multi-lingual. Both render seat-map images + a textual cabin layout. |
| Live availability for an actual booked flight | The operating airline's own site / app | Per the HfP shutdown post-mortem: "airlines had begun to do a better job of showing life-like seat maps on their own sites" — this is largely why SeatGuru couldn't sustain itself. |

A successor skill targeting any of those four domains is a sensible follow-up. Do **not** treat this skill as a place-holder waiting for SeatGuru to come back — there is no public indication TripAdvisor plans to restore it, and the existing message frames the closure as permanent.

### Browser fallback

There is no browser fallback. Driving a real Browserbase session against `https://www.seatguru.com/` renders the same static "SeatGuru has closed down" notice (with a 5-second meta-refresh to tripadvisor.com). Driving it against any deep URL follows the 301 to `https://www.tripadvisor.com/` — TripAdvisor's homepage, not a seat-map page. Don't do it; you will spend Verified + proxy budget for nothing.

## Site-Specific Gotchas

- **The shutdown is enforced at CloudFront, not at the origin.** Every non-root path on `seatguru.com` and `www.seatguru.com` returns a 301 → `https://www.tripadvisor.com/` from a CloudFront edge function (`X-Cache: FunctionGeneratedResponse from cloudfront`). There is nothing to scrape. Verified, proxies, captcha solvers, header rewriting, and IP rotation all return the same 301 because the response is generated at the edge before any origin lookup. Confirmed 2026-05-18.
- **Don't waste a Browserbase session.** A remote `browse open --remote https://www.seatguru.com/...` will succeed (HTTP-wise) and render either the migration notice or the TripAdvisor homepage. Neither contains seat data. The skill should short-circuit at the fetch layer.
- **Don't try the Wayback Machine as a live data source.** `web.archive.org` snapshots of seatguru.com pages exist (the most recent useful ones are from mid-2024 through October 2025), but they are static historical captures with no per-seat color attributes recomputed for current aircraft configurations and no comments newer than the snapshot date. They are acceptable for offline research or "what did this aircraft look like in 2024?" historical lookups, but they are **not** a substitute for live seat data, and many JS-driven map elements never render in the archive. If a caller truly needs SeatGuru-era data for a frozen historical aircraft config, snapshot URLs are of the form `https://web.archive.org/web/<timestamp>/https://www.seatguru.com/airlines/<airline>/<aircraft>.php`.
- **There is no `seatguru.com` API and there never was a public one.** SeatGuru's old data was an internal MySQL store rendered server-side as PHP into static-feeling pages with no documented JSON endpoints. Searching for "SeatGuru API" surfaces only third-party aggregators that scraped the rendered HTML, all of which are now broken downstream of the 2025-11 shutdown.
- **TripAdvisor never absorbed the seat-map data into tripadvisor.com.** The 301 lands on the TripAdvisor homepage, not a "seat maps" landing page. Don't go hunting for a `/seatmaps/` path on tripadvisor.com — it doesn't exist.
- **The site domain still resolves and still has a TLS certificate.** Do not interpret "DNS resolves + HTTPS handshake succeeds" as "site is up." Always check status + body content. A 200 on `/` looks healthy unless you read the body.
- **Subdomains tried in iter-1 also redirect.** `www.seatguru.com` and bare `seatguru.com` behave identically. There is no surviving `api.seatguru.com`, `m.seatguru.com`, `seatmaps.seatguru.com`, or similar. Don't enumerate subdomains hoping to find a side door.
- **No tripadvisor.co.uk / .de / regional locales preserve the data either.** TripAdvisor's regional locales never hosted SeatGuru content; the closure is global.
- **This skill's `recommended_method: none` is intentional.** It is *not* a `browser` skill, an `api` skill, or a `hybrid` skill — there is no method that returns seat data from seatguru.com today, and pretending otherwise misleads the agent runtime. Future agents reading this should treat the canonical answer as "redirect the caller to one of the live alternatives," not "iterate harder."

## Expected Output

The skill returns one of two payload shapes. The site-offline shape is the only one this version ever produces; the legacy seat-map shape is documented for completeness and for any future re-targeted version against an alternative domain.

### `site_offline` (the only live shape as of 2026-05-18)

```json
{
  "success": false,
  "reason": "site_offline",
  "site": "seatguru.com",
  "shutdown_observed_at": "2026-05-18T16:17:00Z",
  "shutdown_announced": "2025-11-04",
  "evidence": {
    "homepage_status": 200,
    "homepage_body_excerpt": "SeatGuru has closed down, please visit Tripadvisor to plan your next trip",
    "homepage_meta_refresh": "https://www.tripadvisor.com",
    "deep_url_status": 301,
    "deep_url_location": "https://www.tripadvisor.com/",
    "cloudfront_marker": "X-Cache: FunctionGeneratedResponse from cloudfront",
    "probed_paths": [
      "/",
      "/findseatmap/findseatmap.php",
      "/airlines/Delta_Airlines/Delta_Airlines_Boeing_737-800.php",
      "/airlines/American_Airlines/American_Airlines_Boeing_777-300ER.php",
      "/airlines/United_Airlines/United_Airlines_Boeing_777-200.php",
      "/airlines/Lufthansa/Lufthansa_Airbus_A380.php",
      "/browseairlines/browseairlines.php",
      "/charts/longhaul.php"
    ]
  },
  "alternatives": [
    {
      "domain": "aerolopa.com",
      "rank": 1,
      "best_for": "scaled, accurate seat geometry (window positions, lavatory + galley footprints, exact pitch)",
      "has_user_comments": false,
      "notes": "Hobbyist-run UK site, no ads, widely endorsed as the SeatGuru successor."
    },
    {
      "domain": "seatlink.com",
      "rank": 2,
      "best_for": "crowdsourced per-seat reviews and good/bad seat verdicts",
      "has_user_comments": true,
      "notes": "Beta product; largest surviving crowdsourced seat-review corpus."
    },
    {
      "domain": "flightseatmap.com",
      "rank": 3,
      "best_for": "broad coverage across airlines + aircraft, simple visual map",
      "has_user_comments": false,
      "notes": "Self-reports 6161+ airlines covered."
    },
    {
      "domain": "seatmaps.com",
      "rank": 4,
      "best_for": "multi-lingual seat-map lookup",
      "has_user_comments": false,
      "notes": "Self-reports 3244 updated aircraft."
    },
    {
      "domain": "<operating-airline>.com",
      "rank": 5,
      "best_for": "live, booking-specific seat availability for an actual flight",
      "has_user_comments": false,
      "notes": "Airlines now ship credible seat maps in their own apps and booking flows; this is what cannibalised SeatGuru."
    }
  ],
  "source_url": "https://www.seatguru.com/"
}
```

### `seat_map_success` (legacy shape, retained for future re-targeted versions — not produced today)

```json
{
  "success": true,
  "airline": "United Airlines",
  "aircraft": "Boeing 777-200 (Two Class)",
  "layout_summary": "2-5-2",
  "source": "<one of: aerolopa.com | seatlink.com | flightseatmap.com | seatmaps.com>",
  "source_url": "<canonical URL on that site>",
  "cabins": [
    { "class": "Business", "rows": "1-12" },
    { "class": "Economy",  "rows": "13-40" }
  ],
  "seats": [
    {
      "seat": "12A",
      "class": "Business",
      "color_code": "green",
      "features": ["window", "extra legroom", "bulkhead"],
      "pros": ["Lots of legroom due to bulkhead"],
      "cons": ["No floor storage during takeoff/landing"]
    }
  ],
  "metadata": {
    "seat_pitch_inches": 31,
    "seat_width_inches": 17.3,
    "in_seat_power": "AC universal + USB-A",
    "wifi": "Panasonic eXConnect, paid",
    "ife_screen": "9-inch seatback",
    "lavatory_rows": [12, 40],
    "galley_rows": [12, 40],
    "exit_rows": [20, 21]
  }
}
```

The `color_code` enum (when re-targeted against a source that uses it): `"green" | "yellow" | "red" | "standard" | "unavailable"`. Only seatlink.com inherits anything resembling SeatGuru's three-tier crowd verdict; aerolopa.com, flightseatmap.com, and seatmaps.com use different visual conventions and the agent must normalise into this enum. **Do not invent comments or pros/cons when sourcing from a site that doesn't carry them — leave the arrays empty.** Faked qualitative data is worse than missing data.
