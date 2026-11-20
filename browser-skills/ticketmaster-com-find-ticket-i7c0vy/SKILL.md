---
name: ticketmaster-com-find-ticket-i7c0vy
title: Ticketmaster Find Tickets
description: >-
  Find upcoming Ticketmaster events for an artist, team, or show — returns
  venue, date, on-sale window, presale times, sold-out/cancelled/postponed
  flags, and the canonical event URL. Read-only, uses Ticketmaster's
  unauthenticated internal artist-events API behind a residential proxy.
website: ticketmaster.com
category: tickets
tags:
  - tickets
  - events
  - concerts
  - sports
  - theater
  - read-only
  - anti-bot
source: 'browserbase: agent-runtime 2026-05-17'
updated: '2026-05-17'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      When the unauthenticated internal API is rate-limited or the proxy pool
      exit IPs are all blocked, fall back to rendering the artist page in a
      Verified + residential-proxy session and reading the same JSON out of the
      page's __NEXT_DATA__ island. Costs ~100× more wall-time; only invoke as
      fallback.
  - method: api
    rationale: >-
      The public Discovery API at app.ticketmaster.com/discovery/v2/ supports
      keyword search directly (no artistId resolution step needed), but requires
      a Consumer Key (apikey query param). Use it when you have one — it's the
      only path that exposes keyword-events search without the artist-resolution
      detour.
verified: false
proxies: true
---
# Ticketmaster Find Tickets

## Purpose

Given an artist, team, or show name (or any event keyword), return the upcoming Ticketmaster events as structured JSON — title, event ID, venue (name + city + state + country + lat/lon), event date, on-sale date + presale windows, sold-out / limited-availability / cancelled / postponed flags, and the canonical event URL. Read-only — never reserves seats, never enters the checkout / queue flow.

## When to Use

- "Are there any Olivia Rodrigo concerts in the US?"
- "When does Coldplay play London next?"
- Daily watcher for an artist's tour announcement.
- Pre-filtering candidates before a price-watcher hands off to a checkout skill.
- Sports / theater fans — Lakers games, Hamilton tour dates — these are modeled as "artists" in the same endpoint.

## Workflow

Ticketmaster's frontend pulls its event data from internal endpoints at `www.ticketmaster.com/api/...` that proxy the Discovery API behind a server-side OAuth handshake. **One of those internal endpoints — the artist-events list — is unauthenticated from the public internet.** It returns the exact JSON that powers the artist-page event grid: 20 events per page, no apikey, no cookies, no signed query. The only edge constraint is that Ticketmaster's anti-bot (Imperva-class, the `Tm-Bl: 1` block service at `epsf.ticketmaster.com`) blocks **every** datacenter IP — including AWS, GCP, Azure — at the L7. Adding `--proxies` to a Browserbase Fetch call routes through a residential IP and the same URLs return `200 application/json`. No browser session is required for the happy path.

### 1. Resolve name → artistId

There is no unauthenticated keyword-events endpoint. Resolve the name to a Ticketmaster `artistId` first by parsing the `topSuggestions` block out of the search-page server render:

```bash
NAME="Olivia Rodrigo"
HTML=$(browse cloud fetch "https://www.ticketmaster.com/search?q=$(printf %s "$NAME" | jq -sRr @uri)" --proxies | jq -r .content)
ARTIST_ID=$(python3 - <<'PY' "$NAME" <<<"$HTML"
import sys, json, re, unicodedata
name = sys.argv[1]
html = sys.stdin.read()
m = re.search(r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
data = json.loads(m.group(1))
qs = data['props']['pageProps']['initialReduxState']['api']['queries']
ts_key = next(k for k in qs if k.startswith('topSuggestions('))
results = qs[ts_key]['data']['results']

def norm(s):
    return unicodedata.normalize('NFKD', s).encode('ascii','ignore').decode().lower().strip()

target = norm(name)
# Priority: exact name match w/ events > exact name match > any with events > first result
exact_with_events = [r for r in results if norm(r['title']) == target and (r.get('count') or 0) > 0]
exact_any        = [r for r in results if norm(r['title']) == target]
with_events      = [r for r in results if (r.get('count') or 0) > 0]
chosen = (exact_with_events or exact_any or with_events or results)[0]
print(re.search(r'/artist/(\d+)', chosen['url']).group(1))
PY
)
```

`topSuggestions.results[]` items include `{title, url, count, image, category}`. `count` is the upcoming-event total — `0` means no current tour and the resolver should usually skip it.

### 2. Fetch events

```bash
# US-only, sorted by date
browse cloud fetch "https://www.ticketmaster.com/api/search/events/artist/${ARTIST_ID}?page=0&countryCodes=US" --proxies \
  | jq -r .content | jq .
```

The response shape:

```json
{
  "total": 95,
  "totalLocal": 0,
  "totalInternational": 0,
  "events": [ { ... 20 events ... } ]
}
```

Paginate by incrementing `page=N` until either `events: []` is returned or you've collected `total` events (page size is fixed at 20).

### 3. Filter parameters

Accepted query-string parameters on `/api/search/events/artist/{id}` (verified 2026-05-17, all returned 200):

| Param | Example | Effect |
|---|---|---|
| `page` | `0`, `1`, … | Pagination (size 20) |
| `countryCodes` | `US`, `US,CA`, `GB` | ISO-2 comma-separated allow-list |
| `sort` | `date` | Order events (default is also date-ascending) |
| `startDate` / `endDate` | `2026-05-16` / `2026-05-17` | Inclusive ISO date window |
| `productStatuses` | `onsale,offsale,rescheduled` | Filter by ticketing status |
| `spanMultipleDays` | `no` | Exclude residencies / multi-day passes |
| `distance` / `distanceUnit` | `6214` / `miles` | Distance scoping; the value `6214 miles` is the in-app "anywhere" sentinel |
| `region` | `200` | Region ID (`200` = USA-major; observed on artist-page default query) |
| `useLocationBoost` | `false` | Disable IP-geo re-ranking |
| `useStrictDateRange` | `true` | Require events fully inside the date window |

Unknown parameters are silently dropped — verify with a probe request before assuming.

### 4. Decode each event

The JSON is already named (unlike Craigslist's positional arrays). Useful fields per `events[i]`:

```json
{
  "title": "Olivia Rodrigo: The Unraveled Tour",
  "id": "06006474F3F0AFBC",            // Ticketmaster eventId (use in canonical URL + checkout flows)
  "discoveryId": "vv1AkZkoVGkdSH1XH",  // Discovery API eventId (different namespace; required if you later call discovery.json/v2 with an apikey)
  "dates": {
    "startDate": "2026-09-25T23:30:00Z",
    "onsaleDate": "2026-05-07T15:00:00Z",
    "dateDisplay": "showDateTime",       // others: "showDate", "showTime", "tba"
    "spanMultipleDays": false
  },
  "presaleDates": [ { "name": "Artist Presale", "startDateTime": "...", "endDateTime": "..." } ],
  "venue": {
    "name": "PeoplesBank Arena", "city": "Hartford", "state": "CT",
    "countryCode": "US", "countryName": "United States",
    "addressLineOne": "...", "code": "06103",
    "latitude": 41.02, "longitude": -92.41,
    "url": "https://www.ticketmaster.com/.../venue/49371",
    "imageUrl": "https://s1.ticketm.net/dbimages/21716v.jpg"
  },
  "timeZone": "America/New_York",
  "cancelled": false, "postponed": false, "rescheduled": false, "tba": false,
  "soldOut": false, "limitedAvailability": false,
  "eventChangeStatus": "none",           // "rescheduled" | "cancelled" | "postponed" | "none"
  "ticketingStatus": "UNKNOWN",          // also: "ONSALE" | "OFFSALE"
  "partnerEvent": false, "isPartner": false,
  "virtual": false, "local": true, "sameRegion": false,
  "artists": [ {"name": "...", "url": "...", "imageUrls": {...}} ],
  "url": "https://www.ticketmaster.com/.../event/06006474F3F0AFBC",
  "majorCategory": "Music"
}
```

### 5. Browser fallback

If the JSON API is unreachable (regional block, rate-limit, or the response payload is missing a field you need), fall back to rendering the artist page itself with a Verified + proxied Browserbase session and reading the **same JSON** out of the page's `__NEXT_DATA__` island — every field above is mirrored under `initialReduxState.api.queries['artistEvents(...)']`.

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies --region us-west-2 | jq -r .id)
browse cloud browse --connect "$SID" open "https://www.ticketmaster.com/${SLUG}-tickets/artist/${ARTIST_ID}"
browse cloud browse --connect "$SID" wait load
browse cloud browse --connect "$SID" eval "JSON.parse(document.getElementById('__NEXT_DATA__').textContent).props.pageProps.initialReduxState.api.queries"
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

The browser path costs ~100× more wall-time and is only needed when (a) the IP-restricted Fetch path is throttled, or (b) you need a field the API strips that the page render does include — none observed during validation, but the `recommendations()` and `artistEnhanced()` queries that ship in the same `__NEXT_DATA__` carry related-artist suggestions and richer media.

## Site-Specific Gotchas

- **Residential proxy mandatory on every request.** Datacenter IPs (AWS, GCP, Azure) hit Ticketmaster's anti-bot wall on **every** URL — homepage, search, artist API, event pages. The block returns `403` with header `Tm-Bl: 1` and the `epsf.ticketmaster.com` "Let's Get Your Identity Verified" HTML body. Confirmed 2026-05-17 from a us-west-2 AWS IP: `browse cloud fetch <artist-api-url>` without `--proxies` 403s even though the endpoint itself requires no authentication. **Always pass `--proxies` to `browse cloud fetch`, and `--proxies --verified` to any `browse cloud sessions create`.** Verified on its own is not enough — the IP is the discriminator.
- **Event detail pages (`/event/{id}`) are blocked even with proxies.** A `browse cloud fetch --proxies` to a real event URL consistently returns `401 Tm-Bl: 1`, not 200. The artist-events JSON carries every field a discovery flow needs; treat event-detail HTML as gated. Don't waste turns retrying. Only the seat-map / availability / checkout endpoints behind the event page require an active reserve flow, and that's a separate skill anyway (out of scope — `recommended_method` for this skill is read-only discovery).
- **The public Discovery API (`app.ticketmaster.com/discovery/v2/events.json`) requires an `apikey`.** Calls without one return `401 {"errorcode":"steps.oauth.v2.FailedToResolveAPIKey"}`. The internal proxy `www.ticketmaster.com/api/search/events/artist/{id}` is unauthenticated and returns the same data — prefer it. If you DO have a Consumer Key, the public Discovery API supports keyword search directly (`?keyword=`), which the internal proxy does not — that's the one case where the public API beats the internal one.
- **Suggestion ordering is by upcoming-event count, not by name match.** Searching `"Beyonce"` returns `"JAŸ-Z"` (4 upcoming events) first, with `"Beyoncé"` (0 events) second. Always sort `topSuggestions.results[]` by (1) accent-folded exact name match with `count > 0`, then (2) exact name match with any count, then (3) first result with `count > 0`, then (4) original order. **Naïvely taking `results[0]` will hand you the wrong artist for any inactive name.**
- **`topSuggestions.results[].count` is the upcoming-event count.** `count: 0` ⇒ no current tour. Use this to short-circuit before calling the events endpoint.
- **The keyword search-suggest endpoints `/api/search/search-suggest` and `/api/search/top-suggestions` return 404 from external clients.** They're intra-Next-only and only accessible during SSR. The data is available — but only through the `__NEXT_DATA__` of `/search?q=...`. Don't burn turns probing those URLs directly.
- **Internal keyword-events and venue-events endpoints also 404 externally.** `/api/search/events?keyword=...`, `/api/search/events/keyword`, `/api/search/events/venue/{id}`, `/api/venue/{id}/info` — all 404 with `text/html`. Only `/api/search/events/artist/{id}` is exposed.
- **Pagination: 20 events per page, fixed.** `page=0` is first. Last page is partial. Querying `page` beyond `ceil(total/20)` returns `events: []` (not 404). Stop when `events.length === 0` OR when you've collected `total` items.
- **Read `total`, `totalLocal`, `totalInternational` separately.** `total` is the global event count (subject to `countryCodes` when supplied). `totalLocal` / `totalInternational` only populate when `useLocationBoost=true` is sent — otherwise both are 0 even when `total` is nonzero.
- **Event status is split across multiple booleans.** Surface all of: `cancelled`, `postponed`, `rescheduled`, `tba`, `soldOut`, `limitedAvailability`, and `eventChangeStatus` (which mirrors the first four into a single enum). `soldOut: true` ⇒ no GA tickets; `limitedAvailability: true` ⇒ partial; `ticketingStatus: "OFFSALE"` ⇒ tickets pulled for a non-status reason (often pre-on-sale state). Distinguish carefully before reporting "no tickets."
- **`isPartner: true` ⇒ the listing lives on a partner site.** The `url` may redirect to AXS, vivenu, or another partner outside Ticketmaster's checkout flow. Surface this flag so downstream automation routes correctly.
- **Sports teams and theater shows are modeled as "artists."** Lakers = `artist/805962`. Hamilton Touring = `artist/2336213`. Same resolution + events flow — no special-casing needed.
- **`distance=6214&distanceUnit=miles&region=200&useLocationBoost=false` is the captured "give me everything, no IP scoping" preset** from the artist page's default `artistEvents()` query. Include these when you want the full global event list regardless of the proxy exit IP's region.
- **The `discoveryId` field is the Discovery API's eventId, distinct from `id`.** If a downstream skill chains into the public Discovery API (e.g. to pull seatmap metadata with an apikey), it needs `discoveryId`, not `id`. Carry both through.

## Expected Output

```json
{
  "query": "Olivia Rodrigo",
  "artist": {
    "id": "2836194",
    "name": "Olivia Rodrigo",
    "url": "https://www.ticketmaster.com/olivia-rodrigo-tickets/artist/2836194",
    "category": "Pop"
  },
  "filters": { "countryCodes": "US", "page": 0 },
  "total": 95,
  "events": [
    {
      "id": "06006474F3F0AFBC",
      "discoveryId": "vv1AkZkoVGkdSH1XH",
      "title": "Olivia Rodrigo: The Unraveled Tour",
      "startDate": "2026-09-25T23:30:00Z",
      "onsaleDate": "2026-05-07T15:00:00Z",
      "presaleDates": [
        { "name": "Artist Presale", "startDateTime": "2026-05-05T15:00:00Z", "endDateTime": "2026-05-07T04:59:00Z" }
      ],
      "timeZone": "America/New_York",
      "venue": {
        "name": "PeoplesBank Arena",
        "city": "Hartford", "state": "CT",
        "countryCode": "US", "countryName": "United States",
        "lat": 41.7637, "lon": -72.6873,
        "url": "https://www.ticketmaster.com/.../venue/49371"
      },
      "url": "https://www.ticketmaster.com/.../event/06006474F3F0AFBC",
      "soldOut": false,
      "limitedAvailability": false,
      "cancelled": false,
      "postponed": false,
      "rescheduled": false,
      "tba": false,
      "ticketingStatus": "ONSALE",
      "isPartner": false,
      "majorCategory": "Music"
    }
  ]
}
```

Alternative outcome shapes:

```json
// Artist found, no upcoming events
{ "query": "Coldplay", "artist": {"id":"806431","name":"Coldplay","url":"..."}, "total": 0, "events": [] }

// Keyword resolves to no artist with upcoming events AND no exact name match
{ "query": "asdkjasdkj", "artist": null, "total": 0, "events": [], "reason": "artist_not_found" }

// Multiple top-tier matches — surface candidates and let caller pick
{
  "query": "Beyonce",
  "artist": null,
  "candidates": [
    { "id": "894191", "name": "Beyoncé", "count": 0, "url": "..." },
    { "id": "781009", "name": "JAŸ-Z",   "count": 4, "url": "..." }
  ],
  "reason": "ambiguous_name"
}

// Anti-bot wall (datacenter IP, missing --proxies, or proxy pool exhausted)
{ "success": false, "reason": "anti_bot_blocked", "tm_bl": 1, "status_code": 403, "remediation": "Retry with --proxies, or rotate the Browserbase proxy pool." }
```
