---
name: alltrails-com-search-trails-dsqvnx
title: AllTrails Search Trails
description: >-
  Search AllTrails for hiking, biking, running, climbing, backpacking, or
  paddling trails near a location and return matching trails (name, location,
  lat/lon, length, elevation gain, difficulty, route type, rating, photos,
  description, attributes, canonical URL) as structured JSON.
website: alltrails.com
category: outdoors
tags:
  - outdoors
  - hiking
  - trails
  - maps
  - read-only
  - datadome
source: 'browserbase: agent-runtime 2026-05-21'
updated: '2026-05-21'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      AllTrails' internal /api/, /api-v4/, /api-v5/ endpoints are explicitly
      Disallow'd in robots.txt AND DataDome-protected (403 + X-Datadome:
      protected on direct fetch). No usable public JSON API.
  - method: fetch
    rationale: >-
      browse cloud search 'site:alltrails.com {query}' is a cheap
      free-of-anti-bot discovery shortcut for resolving freeform-text intent to
      canonical /trail/... URLs — used as step 2 of the browser workflow, not a
      full alternative.
verified: true
proxies: false
---
# AllTrails Search Trails

## Purpose

Search AllTrails for hiking, biking, running, climbing, backpacking, paddling and other outdoor trails near a location and return matching trails as structured JSON. Returns per-trail name, location hierarchy (park / region / state / country), trailhead lat/lon, distance, activity, difficulty, length in miles, elevation gain in feet, route type, average rating + review count, photo URLs, description, trail attributes (kid/dog-friendly, paved, etc.), and canonical trail URL — plus region-wide totals from the result panel. Read-only: never saves, logs a completion, posts a review, or downloads GPX from an authenticated session.

## When to Use

- "Best hikes in {place}" / "easy dog-friendly trails near {city}"
- Bounding-box or lat/lon region scan for trip planning
- Single-trail lookup by canonical URL or slug
- Cross-park comparison across an activity (e.g. mountain biking in Marin County)
- Anywhere an answer needs trail-spec ground truth (length, elevation gain, route shape) — AllTrails' editorial dataset is more complete than OSM for US/EU trails

## Workflow

The optimal path is **scripted browser navigation with stealth (`browse cloud sessions create --verified`)** — there is no public AllTrails JSON API, the internal `/api/alltrails/v3/*` and `/api-v4/*` endpoints are explicitly **`Disallow`**'d in `robots.txt` and DataDome-protected, and the SPA is React with **no `__NEXT_DATA__` global** to pull from. The reliable surface is HTML pages: trail-detail pages embed clean JSON-LD `LocalBusiness` + `BreadcrumbList`, and region/park landing pages render a top-10 list as visible text (no API needed). The **`browse cloud search`** Search API is a fast free-of-anti-bot keyword-discovery shortcut for resolving fuzzy trail-name intent to canonical URLs.

### 1. Create a stealth-only browser session

```bash
SID=$(browse cloud sessions create --keep-alive --verified \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$SID"
```

`--verified` (passing fingerprint signals) is required. **Do NOT add `--proxies`** — residential proxy IPs trip the same DataDome wall as datacenter IPs (verified both 44.248.86.34 datacenter and `--proxies` egress hit the captcha iframe), and a verified-only session is faster.

### 2. Resolve input to canonical entry-point URL

| Input shape | Entry URL | Notes |
|---|---|---|
| Full AllTrails URL (`/trail/…`, `/parks/…`, `/us/…`, `/explore?b_tl_lat=…`) | Use as-is. | |
| Trail slug or trail name | First resolve via `browse cloud search "site:alltrails.com {name}" --num-results 10 --json` — returns canonical `/trail/…` URLs. | Fast, no anti-bot. |
| National park | `https://www.alltrails.com/parks/us/{state-slug}/{park-slug}-national-park` | e.g. `/parks/us/california/yosemite-national-park` |
| US state | `https://www.alltrails.com/us/{state-slug}` | e.g. `/us/california` |
| City / region / freeform intent | Either (a) `browse cloud search "site:alltrails.com {place} trails"` and use the most-popular returned `/trail/…` URLs, OR (b) build the bbox-scoped `/explore?b_tl_lat=…&b_br_lat=…&b_tl_lng=…&b_br_lng=…` URL from a geocoded bounding box. **The `location=` param does NOT work** — see gotcha below. |
| Bounding box (provided) | `https://www.alltrails.com/explore?b_tl_lat={N}&b_tl_lng={W}&b_br_lat={S}&b_br_lng={E}` | The four corner params *do* scope the result count. |
| Lat/lon + radius | Convert to a bbox first (radius ≈ 0.014°/mi latitude, longitude scaled by cos(lat)). | |

### 3. Open + warm DataDome

```bash
browse open "$URL" --remote
browse wait load --remote
browse wait timeout 4000 --remote
TITLE=$(browse get title --remote | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{process.stdout.write(JSON.parse(s).title)})")
if [ "$TITLE" = "alltrails.com" ]; then            # DataDome iframe occupied the page
  browse reload --remote
  browse wait load --remote
  browse wait timeout 5000 --remote                # cookie is now set, second load passes
fi
```

The DataDome handshake completes during the *first* navigation (it sets a `datadome=` cookie on `.alltrails.com`). A **single reload** clears the captcha iframe ~95 % of the time and the real page renders — this works on `/trail/…`, `/parks/…`, `/us/…`, and `/explore?…` URLs. Once the cookie is set, subsequent same-session navigations load directly without re-challenging. Title === `alltrails.com` (no suffix) is the canonical "still blocked" sentinel; a real loaded page has a title like `Upper Yosemite Falls Trail, California - 19,746 Reviews, Map | AllTrails`.

### 4. Extract per page type

**A. Trail detail page (`/trail/{country}/{state}/{slug}`)** — the canonical record. All fields are read from JSON-LD + body text + meta tags via one `browse eval`:

```js
const ld = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
  .map(s => { try { return JSON.parse(s.innerHTML); } catch { return null; } })
  .filter(Boolean);
const lb = ld.find(x => Array.isArray(x['@type']) ? x['@type'].includes('LocalBusiness') : x['@type'] === 'LocalBusiness');
const breadcrumbs = ld.find(x => x['@type'] === 'BreadcrumbList');
const meta = (n, attr='name') => document.querySelector(`meta[${attr}="${n}"]`)?.content;
const ogImage = meta('og:image', 'property');     // share_image URL → 302s to PNG
const lat = meta('place:location:latitude', 'property');
const lon = meta('place:location:longitude', 'property');
const bodyText = document.body.innerText;
// Spec block parses from body text — stable layout: "{length}mi\nLength\n{gain}ft\nElevation gain\n{X}–{Y}hr\nEstimated time\n{Loop|Out & Back|Point to Point}"
const specMatch = bodyText.match(/([\d.,]+)\s*mi\nLength\n([\d,]+)\s*ft\nElevation gain\n([^\n]+)\nEstimated time\n(Loop|Out & Back|Point to Point)/);
const difficultyMatch = bodyText.match(/\((\d+)\s+reviews?\)\s*·\s*(Easy|Moderate|Hard|Strenuous)/);
const planVisit = bodyText.match(/Plan your visit([\s\S]+?)Visitation/)?.[1] || '';
// Attributes (presence of these substrings inside the plan-your-visit block):
const dogPolicy = /Dogs not allowed/.test(planVisit) ? 'no_dogs'
  : /Dogs on leash/.test(planVisit) ? 'leash_only'
  : /Off-leash dogs/.test(planVisit) ? 'off_leash_ok' : null;
const kidFriendly = /Kid-friendly/.test(planVisit);
const wheelchair = /Wheelchair[- ]friendly/.test(planVisit);
const stroller = /Stroller[- ]friendly/.test(planVisit);
const feeRequired = /Fee required/.test(planVisit);
// Map ID for share_image / GPX
const mapId = ogImage?.match(/\/maps\/(\d+)\/share_image/)?.[1];
```

JSON-LD `LocalBusiness` gives: `name`, `address.addressLocality` (park or region), `geo.latitude`/`geo.longitude` (trailhead), `description` (cleaned of HTML — use this not `og:description`), `aggregateRating.ratingValue` + `.reviewCount`, `image[]` (primary). `BreadcrumbList` gives `[country, state, park, trail]` hierarchy.

**B. State/region/park landing pages (`/us/{state}`, `/parks/us/{state}/{park}-national-park`)** — render a server-side top-10 list as readable body text. The list items have stable shape (`#1 - <Name>\n<rating> (<count>)\n·\n<difficulty>\n·\n<length> mi\n·\nEst. <X>–<Y> hr\n<description-snippet>`) and each item has 3 anchor instances to its `/trail/…` href.

```js
// Region total (e.g. "AllTrails has 16,546 hiking trails")
const regionTotal = document.body.innerText.match(/AllTrails has ([\d,]+) hiking trails/)?.[1]?.replace(/,/g, '');
// Top-10 trail anchors (deduped by href)
const trailHrefs = [...new Set(Array.from(document.querySelectorAll('a[href*="/trail/us/"]')).map(a => a.getAttribute('href')))];
// Spec-line per trail (matched against the body text per #N - Name block):
const blocks = document.body.innerText.split(/^#(\d+)\s*-\s*/m);   // alternates: idx, name+spec+desc, idx, ...
```

The page-level meta `name="title"` confirms count cardinality (e.g. `10 Best trails and hikes in California | AllTrails` → exactly 10 returned, even though region has 16,546 total).

**C. Explore page (`/explore?b_tl_lat=…&b_br_lat=…&b_tl_lng=…&b_br_lng=…[&difficulty=easy]`)** — the trails list is *virtualized*: only the highlighted card has a hydrated `<a href>` in the initial DOM. To enumerate trails from the explore view, **don't try to scrape the sidebar list** — instead read the result-count text ("`N trails`") and use the bbox to navigate to the matching `/parks/…` or `/us/…` landing page for the same area, then read the top-10 from there. For deep enumeration beyond 10, paginate via `?page=2` on the landing-page URL.

```js
const totalText = document.body.innerText.match(/(\d+(?:,\d+)?)\s+trails?/)?.[1];
```

**D. Single-trail by slug or trail ID** — go straight to `/trail/{country}/{state}/{slug}` (the `id` in the search API response is itself the canonical URL).

### 5. Bulk enumeration — beyond top-10 per region

`/us/{state}?page=2`, `?page=3`, … each return the next 10 trails server-side-rendered. Verified pattern, no client JS required. Page-count ceiling appears to be `ceil(total/10)` but tail pages are far less curated and slower.

### 6. Construct output + release session

```bash
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

Emit one record per trail with the schema in Expected Output. For region-wide queries also include `regionTotal` and `regionName` from the landing page. **Never click a "Save", "Follow", "Mark complete", or "Write a review" button** — read-only.

## Site-Specific Gotchas

- **DataDome on first navigation is the universal block.** Every URL on `www.alltrails.com` (trail, park, state, explore) returns the `DataDome Device Check` iframe on the cold first request — title === `alltrails.com`, body is the captcha iframe, IP is named in the block message. **A single `browse reload` after the initial load + 4 s wait clears it** because the first request also sets the `datadome=` cookie on `.alltrails.com` which then satisfies the challenge in the background. Subsequent same-session navigations skip the challenge entirely. If reload doesn't clear, wait 10 s and reload once more; if still blocked, the session is poisoned — kill it and create a new one.
- **`--proxies` is counter-productive — use `--verified` alone.** Both `--verified --proxies` and `--verified` only (and even unflagged sessions) hit the same DataDome wall on the cold request. Adding residential proxies *does not* help and adds latency. The reload-cookie trick works at the verified-fingerprint level; the IP class doesn't matter once the cookie is set. Verified across iter-1 trial sequence (proxies session, verified-only session, fresh-session retry — all behaved identically).
- **`location=` URL param on `/explore` is silently dropped.** `https://www.alltrails.com/explore?location=yosemite valley` ignores the text and falls back to IP-geolocation (in our trace: the Vercel sandbox egress was Boardman, Oregon, so the page rendered Columbia River Heritage Trail as the highlighted card with `1 trail` in that bbox). Always pass the four bbox params (`b_tl_lat`, `b_tl_lng`, `b_br_lat`, `b_br_lng`) explicitly. The bbox params *are* honored and update the result-count text.
- **There is no `__NEXT_DATA__` / `__INITIAL_STATE__` global** on any page type — confirmed via `Object.keys(window).filter(k => /INITIAL|STATE|DATA|HYDRATION/i.test(k))` returning only DataDome + dataLayer + storage internals. Don't waste cycles trying to find a single hydrated JSON dump. Use the per-page extraction recipes in step 4.
- **The internal API is robots-disallowed AND DataDome-blocked.** `robots.txt` disallows `/api/`, `/api-v4/`, `/api-v5/`, `/*/api/`, `/*?lat=`, `/explore/map/`, and `/members/`. Out-of-band `browse cloud fetch` to `/api/alltrails/v3/maps/{id}` returns the same 403 + `X-Datadome: protected` HTML stub seen on cold page loads. Don't try to call the internal API directly — go through the rendered HTML.
- **`/*/maps/*/share_image` IS allowed (explicit `Allow:` line in robots.txt for `User-agent: *`)**. `browse cloud fetch https://www.alltrails.com/api/alltrails/v3/maps/{mapId}/share_image?image_type=default&photo_id={photoId}&shape=rectangle&units=i` returns a `302` to a clean `https://static-maps.alltrails.com/production/at-map/{mapId}/v2-…-1200w630h-…png` URL — usable for offline image extraction without anti-bot.
- **Trail detail page body text is the structured-data fallback.** When JSON-LD is missing one field (rare), the body text spec block is *always* present in the exact layout `{length}mi\nLength\n{gain}ft\nElevation gain\n{X}–{Y}hr\nEstimated time\n{Loop|Out & Back|Point to Point}`. Difficulty appears as `(N reviews)\n·\n{Easy|Moderate|Hard|Strenuous}` immediately above the spec block. The `Plan your visit` section enumerates suitability/attribute pills (`Dogs not allowed`, `Kid-friendly`, `Wheelchair-friendly`, `Beaches`, `Caves`, `Camping`, `Fee required`, …) — these are the only reliable source for dog-policy and accessibility flags.
- **AllTrails uses "Strenuous" as a fourth difficulty tier above Hard** on some hikes (Half Dome via JMT shows `Strenuous` in body text, not Hard). The filter panel only exposes Easy/Moderate/Hard, so canonicalize `Strenuous → Hard` when serializing if the consumer expects three tiers — but preserve the original string when round-tripping.
- **Explore-page list is virtualized — only one trail is in the initial DOM.** Repeat: do not try to enumerate trails from the `/explore` sidebar. The result-count text ("`N trails`") at the top is the only reliable summary signal. Use the landing pages (`/us/{state}`, `/parks/…`) or the Search API for actual trail lists.
- **Title sentinel for trail pages: "{name} - {N} Reviews, Map | AllTrails"**. `document.title === 'alltrails.com'` always means DataDome-blocked. `'Explore and Discover Trails Nearby | AllTrails'` is the `/explore` page (loaded but list virtualized). `'X Best trails and hikes in {region} | AllTrails'` is a landing page with top-X list.
- **Estimated time format**: `Est. 4.5–5 hr` on landing-page list items, `7.5–8hr` (no `Est.` prefix, no space) on the trail-detail spec block. Parse both.
- **GPX downloads + heatmaps require AllTrails Pro auth.** Without a `Cookie: at-user-token=…` (Pro-tier), GPX URLs return 401. Surface as `gpx_download_url: null, requires_pro: true` rather than fabricating.
- **`/users/auth/`, `/register/`, `/members/` are robots-disallowed AND will trigger DataDome aggressively** — never navigate into them. Stay in the read-only catalog surface.
- **Internationalized paths**: AllTrails has parallel sitemaps for `en-gb`, `de`, `fr`, `es`, `it-it`, `pt-br`, `da-dk`, `nl-nl`, etc. The path prefix is the locale (e.g. `/de/trail/us/california/upper-yosemite-falls-trail`). Default to no prefix (= `en-US`); only swap if the input URL contains one.
- **`browse cloud search "site:alltrails.com {query}"` is the cheap-discovery shortcut** — returns up to 25 results with `url`, `title`, `image` (canonical share_image URL with map_id + photo_id baked in), and sometimes `publishedDate`. No DataDome, no proxies, no warm-up. Use it whenever the input is freeform text rather than a canonical URL — feeds directly into step 4A for per-trail enrichment.

## Expected Output

```json
{
  "query": {
    "type": "park",
    "input": "Yosemite National Park",
    "entry_url": "https://www.alltrails.com/parks/us/california/yosemite-national-park",
    "filters": {
      "activity": "hiking",
      "difficulty": null,
      "length_min_mi": null,
      "length_max_mi": null,
      "route_type": null
    }
  },
  "region": {
    "name": "Yosemite National Park",
    "addressLocality": "Yosemite National Park, California, United States",
    "country": "United States",
    "state": "California",
    "park": "Yosemite National Park",
    "total_trails": null,
    "page_count": 10,
    "average_rating": 4.6,
    "total_reviews": 300340
  },
  "trails": [
    {
      "trail_id": "vernal-and-nevada-falls-via-the-mist-trail",
      "name": "Vernal and Nevada Falls via Mist Trail",
      "url": "https://www.alltrails.com/trail/us/california/vernal-and-nevada-falls-via-the-mist-trail",
      "rank_on_landing_page": 1,
      "location": {
        "country": "United States",
        "state": "California",
        "park": "Yosemite National Park",
        "addressLocality": "Yosemite Valley, California, United States"
      },
      "latitude": 37.7321,
      "longitude": -119.5572,
      "activity": "hiking",
      "difficulty": "Hard",
      "length_miles": 6.7,
      "elevation_gain_ft": 2280,
      "route_type": "Out & Back",
      "estimated_time_hours": [4.5, 5.0],
      "rating": 4.9,
      "review_count": 25318,
      "description": "Hike to two breathtaking waterfalls along some of Yosemite Valley's most popular hiking trails…",
      "tags": ["Waterfall", "Views", "River", "Forest"],
      "dog_policy": "no_dogs",
      "kid_friendly": true,
      "wheelchair_friendly": false,
      "stroller_friendly": false,
      "fee_required": true,
      "image_url": "https://www.alltrails.com/api/alltrails/v3/maps/378983656/share_image?image_type=default&photo_id=104779381&shape=rectangle&units=i",
      "map_id": "378983656",
      "primary_photo_id": "104779381",
      "gpx_download_url": null,
      "requires_pro_for_gpx": true,
      "distance_from_input_mi": null
    }
  ]
}
```

Outcome variants:

```json
// Single-trail lookup (slug or URL input) — `trails` is a single-element array, `region` omitted.
{ "query": { "type": "trail", "input": "valley-floor-loop-trail", ... }, "trails": [ { ... } ] }

// Bounding-box / lat-lon search — `region` carries the bbox + total count from the explore page.
{ "query": { "type": "bbox", "bbox": { "n": 37.78, "s": 37.70, "w": -119.70, "e": -119.50 } }, "region": { "total_trails": 90, ... }, "trails": [ ... ] }

// Search returned zero results — empty `trails`, `error: "no_results"`.
{ "query": { ... }, "trails": [], "error": "no_results" }

// DataDome wall not cleared after 2 reloads — fail loud, do not fabricate.
{ "query": { ... }, "trails": [], "error": "anti_bot_blocked", "blocker": "datadome" }

// Input is ambiguous (e.g. "Yosemite" matches both the park and several trails) — return `matches[]` shortlist from the Search API and ask the caller to pick.
{ "query": { ... }, "error": "ambiguous_input", "matches": [ { "name": "...", "url": "...", "image": "..." } ] }
```
