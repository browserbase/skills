---
name: app-utrsports-net-search-tennis-utr-fev3t1
title: UTR Search Tennis Players
description: >-
  Search Universal Tennis Rating (UTR) for players by name and return each
  match's UTR (singles + doubles), three-month rating, profile id, nationality,
  location, pro status, and third-party rankings via the public
  api.utrsports.net REST API.
website: app.utrsports.net
category: sports
tags:
  - tennis
  - utr
  - rankings
  - search
  - sports-data
  - player-lookup
source: 'browserbase: agent-runtime 2026-05-17'
updated: '2026-05-17'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      Only useful if api.utrsports.net is unreachable from your egress (not
      observed). The SPA at app.utrsports.net is a thin React client over the
      same /v2/search/players endpoint; the rendered DOM contains a strict
      subset of the API response (masked ratings for non-pros are masked
      server-side, so the browser can't reveal more).
verified: false
proxies: false
---
# UTR Search Tennis Players

## Purpose

Return one or more tennis players matching a name query on app.utrsports.net (Universal Tennis Rating), with each player's UTR (singles + doubles), three-month rating, profile id, gender, nationality, location, pro status, third-party rankings (ATP/WTA pro rank, country rank), and profile image path. Read-only — never claims, edits, or messages a profile. Designed as the "lookup a player and grab their rating" primitive other agents can chain (e.g. before fetching match history, college roster, or event entry lists).

## When to Use

- An agent or user asks for a player's UTR by name ("what's Carlos Alcaraz's UTR?").
- Bulk-rating a list of player names (recruiting, fantasy, bracket seeding).
- Disambiguating a common name (multiple "Roger Federer" accounts exist — the API returns location, nationality, age range, and `isPro` to pick the right one).
- Feeding downstream calls that need a UTR `playerId` (the profile/results endpoints all key off it).
- Anywhere you'd otherwise scrape `app.utrsports.net/search` — the public REST API is one HTTP GET and skips the SPA entirely.

## Workflow

`app.utrsports.net` is a thin React SPA over a public REST API at `https://api.utrsports.net`. The search box on the site UI fires `GET /v2/search/players?query=...` against that API and renders the JSON — there is no anti-bot, no auth, no captcha, and no rate-limit headers on read-only search/profile reads from a clean residential IP. **Always use the API.** The browser path costs ~50× more turns (snapshot returns mostly empty until React hydrates, and result cards lazy-load) and yields a strict subset of the data.

### Step 1 — Search by name (one HTTP GET, no auth)

```
GET https://api.utrsports.net/v2/search/players
    ?query={name}
    &top={pageSize, default 10, max observed 50}
    &skip={offset, default 0}
    [&gender=M|F]
    [&utrMin={float}&utrMax={float}]
    [&ageMin={int}&ageMax={int}]
    [&searchOrigin=searchPage]
```

URL-encode `query` (spaces → `+` or `%20`). No headers required — but if calls start 429-ing, send `Origin: https://app.utrsports.net` and `Referer: https://app.utrsports.net/` to mimic the SPA.

The response shape:

```json
{
  "total": 184,
  "totalAllowed": 10000,
  "maxScore": 9964.6,
  "aggregations": {},
  "hits": [
    {
      "id": "3569175",
      "score": 9777.84,
      "index": "prod_players-v1",
      "source": { /* player record — see Step 2 */ }
    }
  ]
}
```

`total` is the unpaginated match count; `hits.length` is what was returned this page. Paginate with `skip` until `skip >= total` or until you've returned enough matches for the disambiguation task.

### Step 2 — Pull the fields you need from `hits[].source`

Each hit's `source` object holds everything the search-results card renders. The fields that matter for almost every downstream task:

| Field | Type | Notes |
|---|---|---|
| `id` | int | The canonical `playerId`. Same as `hits[].id` (the outer is a string copy). Use this for follow-up endpoints. |
| `profileId` | int | Separate profile-pages id. Some endpoints use this, some use `id`. When in doubt, try `id` first. |
| `displayName` | string | "Carlos Alcaraz". Already normalized — don't compose from `firstName`+`lastName` (the order varies by locale). |
| `singlesUtr`, `doublesUtr` | float | The verified UTR. **See "Masking" gotcha below — non-pros are returned as integers (e.g. `6.0`).** |
| `singlesUtrDisplay`, `doublesUtrDisplay` | string | What the website renders (e.g. `"16.23"` for pros, `"6.xx"` when the actual decimals are paywalled). Prefer this for user-facing display. |
| `threeMonthRating` | float | 90-day rolling UTR. **This field leaks the unrounded decimal even for non-pros** (e.g. `6.21` for a player whose `singlesUtr` shows `6.0`). |
| `threeMonthRatingChangeDetails` | object | `{rating, ratingDisplay, ratingDifference, changeDirection: "up"\|"down"\|"flat"}`. Use for trend arrows. |
| `ratingStatusSingles` | enum | `"Rated"`, `"Unrated"`, `"Projected"`. Players with `"Unrated"` have no matches in the system yet. |
| `ratingProgressSingles` | float | 0-100. Reliability — 100 = fully rated, lower = projected. |
| `gender` | enum | `"Male"`, `"Female"`. |
| `nationality` | string | 3-letter IOC code (`"USA"`, `"ESP"`, `"CHN"`). |
| `location.display` | string | "Plano, TX", "Spain", "Hong Kong" — already-formatted. Other location subfields (`cityName`, `countryName`, etc.) are often null. |
| `isPro` | bool | True for ATP/WTA-level pros. **Required signal — pros are the only players whose `singlesUtr` is returned unmasked.** |
| `showDecimals` | bool | Mirrors `isPro` in practice — `true` means the float is real, `false` means it's been rounded to the integer. |
| `ageRange` | string | `"14-18"`, `"19-22"`, etc. (Exact `age` is null for most accounts — privacy.) |
| `rankings` | array | Third-party + UTR power-rank entries. `[{rankListId, rank, rankingCategories: [...]}, ...]`. `rankListId: 46` = global pro singles; categories carry gender / location / division / age tags. |
| `thirdPartyRankings` | array | ATP/WTA/ITF ranks if the profile is linked. Usually `[]` for non-pros. |
| `profileImage` | string | Relative path like `"747083/images/profile/{uuid}.png"`. Prepend `https://utrprodusrwest.blob.core.windows.net/avatars/` to render (verify via SPA network trace in your locale — CDN host changes by region). |
| `clubMemberships` | array | `[{id, clubId, name, roleId}]`. Useful for "find players at club X" follow-ups. |

### Step 3 — (Optional) Full profile by `id`

If you need bio, residence, racket brand, banner image, college affiliation, or a slightly fresher rating than the search index, follow up with the **unauthenticated v1 profile endpoint**:

```
GET https://api.utrsports.net/v1/player/{id}/profile
```

Returns ~50 fields including `singlesUtr`, `doublesUtr`, `threeMonthRating`, `description`, `playerBio`, `residence`, `locationNationality`, `racketBrand`/`racketType`, `apparelBrand`, `shoesBrand`/`shoesType`, `college`, `gradYearCollege`, `gradYearHighSchool`, `atpOrWtaRank`, `photoCount`, `totalResults`, `resultCountsSingles`. Note: ratings here can be **~0.01 fresher** than the search index (e.g. Alcaraz: search `16.23` vs profile `16.24`) — the search index is rebuilt on a slower cadence.

The non-`/profile` paths require a bearer token:
- `GET /v1/player/{id}` → `400 Token is missing`.
- `GET /v2/player/{id}` → `400 Token is missing`.
- `GET /v2/player/{id}/profile` → `400 Token is missing`.

So **only `/v1/player/{id}/profile` is open**. Do not waste cycles trying the v2 variants.

### Step 4 — Disambiguate

For common names, expect many hits with `score` ranging from ~9000 (exact name match) to ~10 (fuzzy / partial match). The score is large because the API uses Elasticsearch BM25 — pick the top hit only if `score > 8000` AND `displayName` exactly matches the query (case-insensitive). Otherwise return the top-N for the caller to disambiguate using `nationality`, `location.display`, `ageRange`, `isPro`, and `rankings`. Real ATP/WTA pros surface near the top because their hits get boosted by the `isPro` field weighting.

### Browser fallback

Only relevant if `api.utrsports.net` is regionally unreachable from your egress (none observed during 5 test calls — but Verified + residential proxy `BR-AS9080` blocks have been reported on tennis sites generally).

1. `browse cloud sessions create --verified --proxies` (UTR's web tier is fronted by Azure Front Door — bare egress is fine for read-only, but enable Verified before any login flow).
2. `browse cloud browse --connect $sid newpage https://app.utrsports.net/search?query={urlencode(name)}&type=player`.
3. `browse cloud browse --connect $sid wait selector "[data-testid=player-row], a[href*='/profile/']"` — the result cards render only after the SPA hydrates and fires the search XHR.
4. `browse cloud browse --connect $sid snapshot` and harvest each card's `displayName`, displayed UTR, location, country flag alt-text, and the `/profile/{id}` href.

The browser path will **only** give you the visible (masked) rating for non-pros — the unmasked values are not in the DOM, they're filtered server-side before render. So even when falling back to the browser, the resulting data is identical to or worse than the API.

## Site-Specific Gotchas

- **Rating masking is server-side, not client-side.** Both the `/v2/search/players` response and the rendered card show `singlesUtrDisplay: "6.xx"` for non-pros. The actual decimal is never returned over the wire. `threeMonthRating` is the only float field that leaks the unrounded value (and only because UTR uses it for the trend-arrow change calculation). If a user needs decimal precision for a non-pro, that data does not exist outside an authenticated session belonging to the player or their coach.
- **`showDecimals` is the authoritative flag for "can I trust the float?"** — not `isPro`. They almost always agree, but `showDecimals` is what the SPA reads. Treat `singlesUtr` as integer-only whenever `showDecimals: false`.
- **`displayName` is "FirstName LastName" in some locales and "LastName FirstName" in others.** Most US profiles render `"Carlos Alcaraz"`, but Chinese, Brazilian, and some Hong Kong accounts render `"Federer Chan"` style with surname first. The `playerFirstName` / `playerLastName` fields are not consistently ordered either — the source of truth is `displayName`. Don't try to canonicalize.
- **`id` vs `profileId`.** The search response's `source.id` (also `hits[].id`) is the **player** id and is what every public endpoint (`/v1/player/{id}/profile`, `/v1/player/{id}/results/...`) consumes. `profileId` is a separate internal key used for the public profile page URL slug `app.utrsports.net/profiles/{profileId}` — confusingly, the same SPA route also accepts the player id and silently redirects. **Always use `id` for API calls** and treat `profileId` as a display-only opaque value.
- **Empty `query` returns the index sort order.** A blank `query=` doesn't error — it returns players sorted by an internal Elasticsearch `_score`. Likely-useless results for a search task. Validate the query is non-empty before calling.
- **`total` is capped at `totalAllowed: 10000`.** Wide queries (single common letters, popular surnames) report `total: 10000` even if there are more matches. To page deeper, narrow the query with `gender=`, `utrMin=`, or `ageMin=` filters — `skip > 10000` returns an empty `hits` array.
- **The unified `/v2/search` endpoint searches every index at once** — players, events, virtualEvents, clubs, colleges, highSchools — and returns each as a separate top-level key (e.g. `response.players.hits[]`, `response.events.hits[]`). Useful when a query string is ambiguous ("stanford" hits a college + several players + a club). Each sub-result has the same `{hits, total, totalAllowed}` shape as the per-index endpoint.
- **Sibling search indices use identical shape:** `/v2/search/events`, `/v2/search/clubs`, `/v2/search/colleges`, `/v2/search/highSchools`. Same `query`/`top`/`skip` params. Useful if the user asks for a tournament or a college team instead of a player.
- **`v1` is mostly retired.** `/v1/search/players` and `/v1/search/*` return `410 endpoint_gone` with body `{"error":{"code":"endpoint_gone","replacement":"/v2/search"}}`. **The one exception is `/v1/player/{id}/profile`** which is unauthenticated and current — do not try `/v2/player/{id}/profile` (returns 400 "Token is missing"). Do not waste cycles probing `/v1` for anything else.
- **Azure Front Door backs the API.** Responses include `X-Azure-Ref`, `Strict-Transport-Security: max-age=31536000`, and a `TiPMix` cookie. None of these affect access. The infra hostname `prod-utr-api-eastus-platform-azapp.azurewebsites.net` is the origin — don't call it directly; routing rules at the Front Door (e.g. `/v1/player/{id}` auth check) are enforced at the edge.
- **The web SPA at `https://app.utrsports.net/` returns near-empty HTML before JS hydration.** Plain `curl` or `browse cloud fetch` on the SPA URL is a dead end for content extraction — the entire DOM is React-rendered at runtime from the same API call you can make directly.
- **`/v2/search/players?query=federer` returns `total: 71`, but `query=roger+federer` returns `total: 5795`** — two-token queries are OR'd internally and fan out much wider. Pre-tokenize and choose your query string carefully if total count matters.
- **No anti-bot or captcha observed across 12 test calls (search + profile, range of queries).** No `--proxies`, no `--verified`, no `User-Agent` spoofing needed for read-only search/profile. The Browserbase Fetch API was used from us-west-2 egress with no blocks.

## Expected Output

Return one of these shapes:

### Single best match (high-confidence pro lookup)

```json
{
  "result": "match",
  "player": {
    "id": 3569175,
    "displayName": "Carlos Alcaraz",
    "gender": "Male",
    "nationality": "ESP",
    "location": "Spain",
    "isPro": true,
    "showDecimals": true,
    "singlesUtr": 16.23,
    "singlesUtrDisplay": "16.23",
    "doublesUtr": 15.25,
    "doublesUtrDisplay": "15.25",
    "threeMonthRating": 16.12,
    "ratingChange": { "difference": 0.0, "direction": "flat" },
    "ratingStatusSingles": "Rated",
    "ratingProgressSingles": 100.0,
    "ageRange": null,
    "atpOrWtaRank": false,
    "rankings": [
      { "list": "pro-male-global", "rank": 2 }
    ]
  },
  "queryEcho": "alcaraz",
  "totalMatches": 184,
  "searchScore": 9777.84
}
```

### Multiple matches (caller must disambiguate)

```json
{
  "result": "ambiguous",
  "queryEcho": "roger federer",
  "totalMatches": 5795,
  "candidates": [
    {
      "id": 3100657,
      "displayName": "Roger Federer",
      "nationality": "AUS",
      "location": "Perth, Australia",
      "ageRange": "30+",
      "isPro": false,
      "singlesUtrDisplay": "0.xx",
      "ratingStatusSingles": "Unrated",
      "score": 9650.12
    },
    {
      "id": 2616620,
      "displayName": "Roger Federer",
      "nationality": "SUI",
      "location": "Switzerland",
      "ageRange": null,
      "isPro": false,
      "singlesUtrDisplay": "0.xx",
      "ratingStatusSingles": "Unrated",
      "score": 9601.34
    }
  ]
}
```

### Non-pro rated player (rating masked)

```json
{
  "result": "match",
  "player": {
    "id": 5732573,
    "displayName": "Federer Chan",
    "gender": "Male",
    "nationality": "USA",
    "location": "Plano, TX",
    "isPro": false,
    "showDecimals": false,
    "singlesUtr": 6.0,
    "singlesUtrDisplay": "6.xx",
    "doublesUtr": 6.0,
    "doublesUtrDisplay": "6.xx",
    "threeMonthRating": 6.21,
    "ratingStatusSingles": "Rated",
    "ratingProgressSingles": 100.0,
    "ageRange": "14-18"
  },
  "queryEcho": "federer chan",
  "totalMatches": 1,
  "searchScore": 9777.84,
  "note": "singlesUtr/doublesUtr are integer-rounded because showDecimals is false. threeMonthRating (6.21) preserves the unrounded value."
}
```

### No hits

```json
{
  "result": "not_found",
  "queryEcho": "qwx zzqxxq",
  "totalMatches": 0,
  "candidates": []
}
```
