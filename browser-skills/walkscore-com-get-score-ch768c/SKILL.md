---
name: walkscore-com-get-score-ch768c
title: Walk Score / Transit / Bike Lookup
description: >-
  Given a US or Canadian street address (or a walkscore.com /score URL), return
  the Walk Score, Transit Score, Bike Score, qualitative tier labels,
  neighborhood/city area label, lat/lon, and canonical URL. Per-category amenity
  counts available via the browser fallback path.
website: walkscore.com
category: real-estate
tags:
  - walkability
  - real-estate
  - transit
  - biking
  - geocoding
  - read-only
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: api
alternative_methods:
  - method: url-param
    rationale: >-
      Constructing /score/{slug} directly and following one 301 redirect is the
      canonical path — the slug is fuzzy-matched server-side, so URL-encoding
      the raw user address is enough. Use this when calling from a sandbox that
      cannot reach the Browserbase fetch API (any proxied HTTP client will do).
  - method: browser
    rationale: >-
      Required only when the caller needs per-category amenity counts
      (Restaurants, Coffee, Groceries, Shopping, Errands, Parks, Schools,
      Entertainment) — those hydrate from the Google Maps marker layer ~2-3s
      after `initialize()` runs and are not present in the initial server HTML.
      Skip otherwise; a CDP session costs ~100x what the Fetch path costs and
      the scores+labels+lat/lon are already in the static HTML.
verified: false
proxies: false
---
# Walk Score Lookup

## Purpose

Given a US/Canadian street address (or any walkscore.com `/score/...` URL), return the **Walk Score (0–100)**, **Transit Score (0–100, when published for the city)**, **Bike Score (0–100, when published)**, the qualitative tier label for each (e.g. `Walker's Paradise`, `Very Walkable`, `Somewhat Walkable`, `Car-Dependent`, `Rider's Paradise`, `Biker's Paradise`), the area / neighborhood label, geocoded latitude/longitude, and the canonical Walk Score URL. Read-only — never submits feedback, edits a place, or signs in.

> **Amenity counts**: The task prompt lists per-category amenity counts (Restaurants, Coffee, Groceries, etc.). These counts are **not** rendered in the initial server HTML — they hydrate from a follow-up `pp.walk.sc` map-marker fetch inside the embedded Google Maps widget. The static HTML only carries the "At this address" featured-place card (a single curated POI). To return per-category counts, fall back to a JS-rendered fetch (browser path below). Default-emit `null` for unavailable counts and document this in the output.

## When to Use

- A user asks "how walkable is {address}?"
- Real-estate / rental agents comparing walkability across listings.
- Pre-filling a relocation worksheet (commute mode mix, transit, bike).
- Bulk scoring of a list of addresses (the API path costs ~0.8–1.3s/request and tolerates ≥1 req/s).

## Workflow

The walkscore.com consumer detail page is **fully server-rendered for the score numbers, tier labels, lat/lon, and area label** — every value the task asks for is in the initial HTML. **Lead with a single HTTP GET to `https://www.walkscore.com/score/{slug}`** via Browserbase's `/v1/fetch` API (or a plain proxied HTTP client). Do not spin up a CDP browser unless you specifically need amenity-by-category counts (see "Browser fallback" below — they require JS hydration of the embedded Google Maps marker layer).

### 1. Construct the score URL from the user-supplied address

The site accepts `+` or `%20` for spaces and normalizes free-form addresses via a 301 redirect to the canonical hyphenated slug. **You do not need to reproduce the homepage's `encodeAddress()` function** — just URL-encode the user input.

```bash
ADDR="1600 Pennsylvania Ave NW, Washington, DC 20500"
SLUG=$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote_plus(sys.argv[1]))' "$ADDR")
URL="https://www.walkscore.com/score/${SLUG}"
```

(Canadian addresses follow the same form but must end in `…-bc-canada`, `…-on-canada`, etc. The server's 301 handler fills the `-canada` suffix in for you — see Gotchas.)

### 2. Fetch the page via Browserbase Fetch API (preferred — no session, no CDP)

```bash
curl -fsS -X POST https://api.browserbase.com/v1/fetch \
  -H "x-bb-api-key: $BB_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"$URL\",\"proxies\":false}"   # proxies optional; site is lightly bot-walled
```

Plain `proxies:false` works for one-off lookups. Set `proxies:true` only if you see a 403/Akamai-style block (none observed in 4-iter testing — three sequential bare requests all returned 200 in <1.3s).

### 3. Handle the 301 redirect (Browserbase `/v1/fetch` does NOT auto-follow)

```bash
STATUS=$(jq -r .statusCode <<<"$RESP")
if [ "$STATUS" = "301" ]; then
  CANONICAL=$(jq -r '.headers.Location' <<<"$RESP")
  # Re-fetch CANONICAL with the same call shape
fi
```

The server applies redirects for: spaces → hyphens, "Avenue" → "ave", "Fifth" → "5th", "Street" → "st", missing zip → nearest canonical with zip, BC-only → BC-Canada, and approximate fuzzy matches (e.g. `4-private-rd-jackson-wy-83001` 301s to `125-e-pearl-ave-jackson-wy-83001`). Always re-fetch the `Location` header and use that body for extraction. The redirect chain is at most one hop in observed cases.

### 4. Extract from the canonical 200 response

All five required values come from straightforward regex / DOM scans on the HTML:

| Field | Pattern |
|---|---|
| `walk_score` | Integer in `<img src="//pp.walk.sc/badge/walk/score/{N}.svg">` |
| `transit_score` | Integer in `//pp.walk.sc/badge/transit/score/{N}.svg` (absent → `null`, see gotcha) |
| `bike_score` | Integer in `//pp.walk.sc/badge/bike/score/{N}.svg` (absent → `null`) |
| `walk_label` / `transit_label` / `bike_label` | First `<h5 class='tight-bot'>{LABEL}</h5>` appearing after each badge img. Decode `&rsquo;` → `'`. |
| `lat` / `lng` | `data-lat="{N}" data-lng="{N}"` on the `.commute-summary` element. Stable single occurrence per page. |
| `area_label` (neighborhood + city) | `data-label="{LABEL}"` on the same `.commute-summary` element (e.g. `Downtown Washington, DC`, `Downtown Manhattan`, `Downtown Vancouver`). |
| `address` | `<title>{ADDRESS} - Walk Score</title>` — already normalized to the canonical form ("Avenue Northwest" not "Ave NW"). |
| `canonical_url` | `<link rel="canonical" href="{PATH}">` (note: site emits a path, not absolute URL — prepend `https://www.walkscore.com`). |

Pseudo-extractor (Node, no DOM lib needed):

```js
const html = response.content;
const num = (type) => parseInt((html.match(new RegExp(`badge/${type}/score/(\\d+)`)) || [])[1]) || null;
const tierFor = (type) => {
  const idx = html.indexOf(`badge/${type}/score/`);
  if (idx < 0) return null;
  const m = html.slice(idx, idx + 2000).match(/<h5\s+class=['"]tight-bot['"]>([^<]+)<\/h5>/);
  return m ? m[1].replace(/&rsquo;/g, "'") : null;
};
const out = {
  walk_score: num('walk'), transit_score: num('transit'), bike_score: num('bike'),
  walk_label: tierFor('walk'), transit_label: tierFor('transit'), bike_label: tierFor('bike'),
  lat: parseFloat((html.match(/data-lat="([^"]+)"/) || [])[1]) || null,
  lng: parseFloat((html.match(/data-lng="([^"]+)"/) || [])[1]) || null,
  area_label: (html.match(/data-label="([^"]+)"\s+class=['"]commute-summary/) || [])[1] || null,
  address: (html.match(/<title>([^<]+)\s*-\s*Walk Score<\/title>/) || [])[1] || null,
  canonical_url: 'https://www.walkscore.com' + ((html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/) || [])[1] || ''),
};
```

### 5. Branch on the response status

- **200 + populated badges** → success, return scores. If `transit_score` or `bike_score` is `null`, that city simply doesn't have Walk Score's Transit / Bike Score published — return `null` for both score and label (not zero).
- **301** → follow Location once, then re-extract.
- **404** → emit `{ success: false, error_reasoning: "address_not_found" }`. The 404 page title is `404 Page Not Found - Walk Score`.
- **200 + missing badges** → only seen when the URL is the lat/lng metro-centroid form (`/score/loc/lat=X/lng=Y`); treat as `success: false, error_reasoning: "address_not_geocoded"`.

### Browser fallback (only when amenity-by-category counts are required)

The amenity counts (Restaurants, Coffee, Groceries, Shopping, Errands, Parks, Schools, Entertainment) come from the Google Maps marker layer that hydrates after `initialize()` runs. To capture them:

```bash
SID=$(curl -sS -X POST https://api.browserbase.com/v1/sessions \
  -H "x-bb-api-key: $BB_API_KEY" -H "Content-Type: application/json" \
  -d "{\"projectId\":\"$BB_PROJECT_ID\",\"keepAlive\":true}" | jq -r .id)
browse env remote
browse --connect "$SID" open "$URL" --wait load
browse --connect "$SID" wait timeout 3000           # markers hydrate ~2–3s after load
browse --connect "$SID" eval '(function(){
  // Sidebar nav exposes category counts as <a class="tab" data-type="X"><span class="count">N</span></a>
  const out = {};
  document.querySelectorAll(".sidebar-nav a.tab, .ws-amenities-tabs li").forEach(el => {
    const t = el.getAttribute("data-type") || el.querySelector(".label")?.textContent?.trim();
    const c = el.querySelector(".count")?.textContent?.trim();
    if (t && c) out[t] = parseInt(c) || 0;
  });
  return out;
})()'
```

The exact selectors for the amenity tab list can drift; verify against a `snapshot` first. **Do not click amenity tabs / map markers / "Get a quote" buttons** — read-only is the rule.

## Site-Specific Gotchas

- **`/v1/fetch` does not follow 301s.** The single most common reason a first extraction returns all-nulls is forgetting to follow the redirect — the 301 body is a tiny "Redirecting..." stub with no badges. Always re-fetch on `statusCode == 301` and read from the 200 body.
- **Transit / Bike score absence is a real outcome, not an error.** Cities without Walk Score's transit data (Jackson WY, most exurbs, many small Canadian cities) simply omit the `badge/transit/score/{N}` markup. Emit `null` for both the score and label — do not default to 0.
- **Tier labels use HTML entities.** `Rider's Paradise` ships as `Rider&rsquo;s Paradise` (likewise `Biker&rsquo;s Paradise`, `Walker&rsquo;s Paradise`). Decode `&rsquo;` → `'` before returning. The five Walk Score tiers are `Walker's Paradise` (90–100), `Very Walkable` (70–89), `Somewhat Walkable` (50–69), `Car-Dependent` (25–49), `Car-Dependent` again at lower scores ("Almost all errands require a car"). Transit tiers: `Rider's Paradise` (90+), `Excellent Transit` (70–89), `Good Transit` (50–69), `Some Transit` (25–49), `Minimal Transit` (<25). Bike tiers: `Biker's Paradise` (90+), `Very Bikeable` (70–89), `Bikeable` (50–69), `Somewhat Bikeable` (<50). Emit the literal label from the page rather than re-deriving from the integer — the boundaries shift occasionally and the page is authoritative.
- **Canadian addresses need `-canada` in the slug**, but the 301 handler will add it for you. `https://www.walkscore.com/score/200-burrard-st-vancouver-bc` → 301 → `…-vancouver-bc-canada`. Don't bother detecting Canadian addresses client-side; just submit the raw form and follow.
- **Server fuzzy-matches addresses very aggressively.** `4-private-rd-jackson-wy-83001` (a nonsense rural address) 301s to `125-e-pearl-ave-jackson-wy-83001` (the nearest known address). Returned scores reflect the **redirected** address, not the original input. **Always emit the canonical_url and the extracted `<title>` address so callers can detect when the lookup snapped to a different point.** If `address` differs meaningfully from the user's input, flag it.
- **`/score/loc/lat=X/lng=Y` is NOT a per-address lookup.** It returns the score for the **metro centroid** nearest those coordinates, not the building at that point. E.g. `lat=40.7580/lng=-73.9855` (real Times Square) returns the generic "Manhattan NY" page with `data-lat=40.7208, data-lng=-74.0006` (Tribeca) and metro-default scores 100/100/92. Use this URL form only for "what's it like in {neighborhood}?" queries — never for street-address lookups. Prefer the slug path.
- **`<title>` city is double-printed.** Observed: `"1600 Pennsylvania Avenue Northwest, Washington, DC DC - Walk Score"` — the state abbreviation appears twice. This is a Walk Score template bug; if you parse city/state from the title, dedupe the trailing token.
- **`encodeAddress()` is defined inline on the homepage** in a `onsubmit` handler that we did not need to reproduce — URL-encoding the raw user input plus a 301 follow is functionally equivalent and avoids depending on the homepage JS surviving.
- **Lat/lng on the page is the geocoded centroid of the addressed property**, not a commute target. The `.commute-summary` element happens to live in the commute widget but its `data-lat`/`data-lng` is the address point. Stable single occurrence per page (one address = one geocode).
- **Amenity counts are not in the static HTML.** The static page only carries one "At this address" featured place (curated POI like "White House Rose Garden"). The Restaurants / Coffee / Groceries / Shopping / Errands / Parks / Schools / Entertainment counts come from the Google Maps marker layer (`maps.googleapis.com/maps/api/js?...&libraries=places&callback=initialize`) populated after a follow-up XHR to `walkscore.com` — if your task needs them, take the browser-fallback path.
- **No formal rate limit observed.** Three sequential bare-IP requests for the same score page returned 200 in 0.7–1.3s each with no captcha. The site's robots.txt and 60-second `Cache-Control: public, max-age=60` header suggest sustained ≥1 req/s is fine, but pace politely (the SKILL spec says "lookups should pace politely"). For bulk runs >100 addresses, add a 0.5s jitter and route via `proxies:true` to avoid surface contention.
- **No bot wall for read-only score pages.** GET on `/score/...` works without `--verified` or `--proxies`. Reserve those flags for the browser-fallback path if you hit interactive Akamai.
- **Two distinct `&copy;` notices** in the footer reference Walk Score data and the Google Maps imagery — `Walk Score &copy; 2026` is the dynamic year; don't use it as a freshness signal.
- **Do NOT use this skill to submit feedback, edit places, or click the "Get a quote" / "Apartments for rent" leadgen widgets.** Those break the read-only contract and trigger downstream affiliate analytics.

## Expected Output

```json
{
  "success": true,
  "address": "1600 Pennsylvania Avenue Northwest, Washington, DC 20500",
  "input_address": "1600 Pennsylvania Ave NW, Washington, DC 20500",
  "walk_score": 84,
  "walk_label": "Very Walkable",
  "transit_score": 100,
  "transit_label": "Rider's Paradise",
  "bike_score": 79,
  "bike_label": "Very Bikeable",
  "area_label": "Downtown Washington, DC",
  "latitude": 38.9037406,
  "longitude": -77.0362967,
  "amenities": null,
  "canonical_url": "https://www.walkscore.com/score/1600-pennsylvania-ave-nw-washington-dc-20500",
  "redirected": false,
  "error_reasoning": null
}
```

### Outcome shapes

**A. Full-coverage US/CA address (Walk + Transit + Bike all published)**
```json
{ "success": true, "walk_score": 100, "walk_label": "Walker's Paradise",
  "transit_score": 100, "transit_label": "Rider's Paradise",
  "bike_score": 92, "bike_label": "Biker's Paradise",
  "area_label": "Downtown Manhattan", "latitude": 40.7208595, "longitude": -74.0006686,
  "canonical_url": "https://www.walkscore.com/score/350-5th-ave-new-york-ny-10118",
  "redirected": true, "amenities": null, "error_reasoning": null }
```

**B. Address with no transit data published (small/exurban city)**
```json
{ "success": true, "walk_score": 88, "walk_label": "Very Walkable",
  "transit_score": null, "transit_label": null,
  "bike_score": 74, "bike_label": "Very Bikeable",
  "area_label": "Downtown Jackson", "latitude": 43.4799291, "longitude": -110.7624282,
  "canonical_url": "https://www.walkscore.com/score/125-e-pearl-ave-jackson-wy-83001",
  "redirected": true, "amenities": null, "error_reasoning": null }
```

**C. Canadian address (auto-`-canada` redirect)**
```json
{ "success": true, "walk_score": 97, "walk_label": "Walker's Paradise",
  "transit_score": 100, "transit_label": "Rider's Paradise",
  "bike_score": 69, "bike_label": "Bikeable",
  "area_label": "Downtown Vancouver", "latitude": 49.281954, "longitude": -123.1170744,
  "canonical_url": "https://www.walkscore.com/score/200-burrard-st-vancouver-bc-canada",
  "redirected": true, "amenities": null, "error_reasoning": null }
```

**D. Address fuzzy-snapped to a different building (warn caller)**
```json
{ "success": true, "input_address": "4 Private Rd, Jackson, WY 83001",
  "address": "125 East Pearl Avenue, Jackson WY",
  "walk_score": 88, "walk_label": "Very Walkable",
  "transit_score": null, "bike_score": 74, "bike_label": "Very Bikeable",
  "canonical_url": "https://www.walkscore.com/score/125-e-pearl-ave-jackson-wy-83001",
  "redirected": true, "warning": "input_address_snapped_to_nearest_known_point",
  "error_reasoning": null }
```

**E. Address not found**
```json
{ "success": false, "input_address": "99999 Fakestreet, Fakecity, ZZ 00000",
  "error_reasoning": "address_not_found" }
```

**F. With amenity counts (browser-fallback path only)**
```json
{ "success": true, "walk_score": 84, ...,
  "amenities": { "Restaurants": 25, "Coffee": 19, "Groceries": 4,
                 "Shopping": 32, "Errands": 28, "Parks": 17, "Schools": 9, "Entertainment": 21 },
  "canonical_url": "https://www.walkscore.com/score/1600-pennsylvania-ave-nw-washington-dc-20500" }
```
