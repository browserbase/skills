---
name: rottentomatoes-com-get-rating-tr6mq7
title: Rotten Tomatoes Title Rating
description: >-
  Given a Rotten Tomatoes title URL, RT slug, or free-form title reference,
  return the current Tomatometer (critic) and Popcornmeter (audience) scores,
  certified flags, vote counts, sample critic reviews, full cast & crew with
  role names, synopsis, where-to-watch affiliates, and core title metadata as
  one JSON object. Handles movies, TV series (with series-wide averages and
  per-season URLs), TV seasons, pre-release no-score-yet titles, and ambiguous
  free-form queries.
website: rottentomatoes.com
category: entertainment
tags:
  - movies
  - tv
  - ratings
  - reviews
  - metadata
  - read-only
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      There is no public Rotten Tomatoes JSON API; the 'API' is the title page's
      embedded JSON blobs (`media-scorecard-json` + `application/ld+json`) which
      `bb fetch` can pull as static HTML — no JS, no browser, no proxy, no
      Verified. Reserve a remote browser session for the rare case `bb fetch`
      returns 403/captcha; the same JSON blobs render server-side into the live
      DOM and can be extracted identically.
verified: false
proxies: false
---
# Rotten Tomatoes Title Rating

## Purpose

Given a Rotten Tomatoes title URL, RT slug (`m/<slug>` or `tv/<slug>` / `tv/<slug>/s<N>`), or free-form title reference (`"The Matrix"`, `"Severance season 2"`), return current Tomatometer (critic) score, Popcornmeter / Audience score, certified flags, vote counts, sample critic reviews, full cast & crew, synopsis, where-to-watch affiliates, and core title metadata as one structured JSON object. Read-only — never clicks "Want to See", "Rate", "Sign In", or any audience-rating control.

## When to Use

- Spot-checking a movie / TV show's current Tomatometer and Popcornmeter (the canonical "should I watch this?" lookup).
- Bulk extraction across a list of titles for a recommendation engine, watchlist enricher, or release-monitoring agent.
- Resolving a free-form title string ("Severance season 2", "the matrix 1999") to a canonical RT page + score.
- Comparing critics vs audience sentiment for the same title.
- Pulling per-season Tomatometer + Popcornmeter for TV (the series page only surfaces a series-wide *average*; per-season scores live on the season URL).

## Workflow

Rotten Tomatoes is server-rendered HTML — the score, cast, synopsis, where-to-watch, and even the top critic-review cards are all in the initial HTML response. Two embedded JSON blobs do the heavy lifting:

- `<script ... id="media-scorecard-json" ... type="application/json">` — Tomatometer + Popcornmeter, sentiment, certified flags, rating counts, average rating, banded count, **and** the `overlay.audienceVerified` / `overlay.criticsTop` subsets when present.
- `<script type="application/ld+json">` — schema.org `Movie` / `TVSeries` / `TVSeason` with `aggregateRating`, `actor[]`, `director[]`, `producer[]`, `genre[]`, `contentRating` (MPAA / TV rating), `dateCreated` (release date), `containsSeason[]` (for TV series), `partOfSeries` (for TV season), `numberOfSeasons`, `image` (poster), and canonical `url`.

A `bb fetch` against the canonical URL returns 200 with all of this — no browser, no proxy, no Verified required. **There is no public JSON API**; this skill is "static-HTML-as-API." Lead with the fetch path; the browser path is a fallback if Akamai ever starts blocking (currently never observed during converged iters from the Browserbase Fetch API).

### 1. Resolve the URL

Three input shapes feed one canonical URL:

**(a) Full Rotten Tomatoes URL** — use as-is, but normalize: RT 301-redirects some legacy slugs (e.g. `/m/the_matrix` → `/m/matrix`). Follow the redirect (`bb fetch` does not auto-follow; check `statusCode === 301` and re-fetch the `Location` header).

**(b) Slug** (`m/the_matrix`, `tv/severance`, `tv/severance/s02`) — prepend `https://www.rottentomatoes.com/` and treat as case (a).

**(c) Free-form title** — hit the search results page:
```
GET https://www.rottentomatoes.com/search?search=<URL-encoded query>
```
The search page is also server-rendered. Each match is a `<search-page-media-row>` web component with **attributes** carrying the disambiguation signals:
```
release-year="1999"
start-year="" end-year=""           (TV: "2022" "2026")
cast="Keanu Reeves,Laurence Fishburne,Carrie-Anne Moss"
tomatometer-score="83"
tomatometer-is-certified="true"
tomatometer-sentiment="POSITIVE"
```
…with `<a href="https://www.rottentomatoes.com/m/matrix" data-qa="thumbnail-link">` carrying the canonical URL. Sections are split by `<search-page-result type="movie|tvSeries">`. The page also surfaces filter counts: `Movies (68) | TV Shows (11704)`. For a query like "Severance season 2", pick the TV-show result then construct the season URL `/tv/<slug>/sNN` (or take the slug from the `containsSeason[]` array on the series page).

If the query has a year token, prefer the row whose `release-year` matches. If a `season N` is in the query and the matched TV row has multiple seasons, fetch the series page first to read `containsSeason[].url` and pick the right `/sNN` URL.

### 2. Fetch the title page

```bash
bb fetch "https://www.rottentomatoes.com/m/matrix"
# or "https://www.rottentomatoes.com/tv/severance"
# or "https://www.rottentomatoes.com/tv/severance/s02"
```

Returns `{ statusCode: 200, content: "<full HTML>" }`. **`--proxies` is NOT required** — direct `bb fetch` succeeds from `api.browserbase.com`'s Fetch API. Add `--proxies` only if a 403 / "Access Denied" surfaces (rare; Akamai is configured permissively for these pages).

### 3. Extract the scores

Match the scorecard JSON (note the multi-line attribute layout — `[\s\S]*?` between `<script` and `id="..."`):

```js
const re = /<script[\s\S]*?id="media-scorecard-json"[\s\S]*?>([\s\S]*?)<\/script>/;
const j = JSON.parse(html.match(re)[1]);
```

`j.criticsScore`:
- `score` (string `"83"`) → Tomatometer 0–100
- `sentiment` ∈ `"POSITIVE" | "NEGATIVE"` (missing for no-score)
- `certified: true` → `Certified Fresh` status
- `ratingCount` → number of critic reviews
- `averageRating` (string `"7.90"`) → average critic numerical rating out of 10
- `likedCount`, `notLikedCount` → fresh-vs-rotten review tally

`j.audienceScore`:
- `score` (string `"85"`) → Popcornmeter 0–100
- `sentiment` ∈ `"POSITIVE" | "NEGATIVE"` (missing for no-score)
- `certified: true` → audience-side "Verified Hot" tier (also signalled by `j.audienceScore.certifiedFresh === "certified"`)
- `scoreType` ∈ `"ALL" | "VERIFIED"` — which subset is the primary surface on this page
- `reviewCount` → exact audience rating count
- `bandedRatingCount` (string `"250,000+ Ratings"` / `"5,000+ Ratings"`) → display-friendly bucket
- `averageRating` (string `"3.6"`) → audience average out of 5
- `likedCount`, `notLikedCount` → liked-vs-disliked tally

`j.overlay` (the score-details popup payload — usually richer than the primary surface):
- `criticsAll` / `criticsTop` — full critic pool vs top-critics-only subset
- `audienceAll` / `audienceVerified` — full audience pool vs verified-purchasers subset (RT splits these; the primary `audienceScore` block mirrors whichever subset the page chose to highlight)
- `mediaType` ∈ `"Movie" | "TvSeries" | "TvSeason"` — definitive title-type signal

**Status string derivation** (RT uses these labels publicly; emit them in your output):

| Tomatometer (critic) | Condition |
|---|---|
| `Certified Fresh` | `criticsScore.certified === true` |
| `Fresh` | `criticsScore.sentiment === "POSITIVE"` and not certified |
| `Rotten` | `criticsScore.sentiment === "NEGATIVE"` |
| `No score yet` | `criticsScore.score` is undefined / `ratingCount === 0` |

| Popcornmeter (audience) | Condition |
|---|---|
| `Verified Hot` | `audienceScore.certified === true` (or `audienceScore.certifiedFresh === "certified"`) |
| `Upright` | `audienceScore.sentiment === "POSITIVE"` and not certified |
| `Spilled` | `audienceScore.sentiment === "NEGATIVE"` |
| `No score yet` | `audienceScore.score` is undefined |

### 4. Extract title metadata (JSON-LD)

Match the JSON-LD block:
```js
const ldRe = /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g;
```

Keys used:
- `@type` ∈ `"Movie" | "TVSeries" | "TVSeason"` — title type. (Note: `j.overlay.mediaType` in the scorecard says `"Movie" | "TvSeries" | "TvSeason"` — same info, different casing.)
- `name` — primary title
- `contentRating` — MPAA / TV rating (`"R"`, `"PG-13"`, `"TV-MA"`, …)
- `dateCreated` — release date (`"1999-03-31"`); series shows the original series start, season shows that season's premiere
- `genre[]` — list of strings
- `actor[]` — top-billed cast as `{name, sameAs (RT celebrity URL), image}`. **Character/role names are NOT in JSON-LD** — pull them from the cast section HTML (step 6).
- `director[]`, `producer[]` — names + RT URLs
- `image` — poster URL (full-res Flixster CDN)
- `description` — RT's SEO blurb; replace with `j.description` from the scorecard JSON for the proper synopsis body
- `numberOfSeasons` — TV series only
- `containsSeason[]` — TV series only; `[{@type:"TVSeason", name:"Season 1", url:"https://www.rottentomatoes.com/tv/severance/s01"}, …]`. Use this to enumerate season URLs.
- `partOfSeries` — TV season only; `{@type:"TVSeries", name:"Severance", startDate:"2022-02-18", url:"…/tv/severance"}`. Use this to backlink the season to its parent.

### 5. Extract media-info (runtime / distributor / production / release / box office)

These live in the "Media Info" section as `<dt>` / `<dd>` pairs. Each item is wrapped as:
```html
<div class="category-wrap" data-qa="item">
  <dt class="key">… <rt-text … data-qa="item-label">Runtime</rt-text> </dt>
  <dd data-qa="item-value-group">
    <rt-text data-qa="item-value">2h 16m</rt-text>
  </dd>
</div>
```

Pull label/value pairs with one regex sweep:
```js
const itemRe = /<rt-text[^>]+data-qa="item-label">([^<]+)<\/rt-text>[\s\S]*?<dd[^>]+data-qa="item-value-group">([\s\S]*?)<\/dd>/g;
```
…then strip nested tags from each value. Known labels (case-stable): `Runtime`, `Original Language`, `Release Date (Theaters)`, `Release Date (Streaming)`, `Rerelease Date (Theaters)`, `Distributor`, `Production Co`, `Sound Mix`, `Aspect Ratio`, `Box Office (Gross USA)`, `Most Popular at Home`. For TV: `Premiere Date`, `Network`, `Genre`, `Executive Producer`, etc.

### 6. Extract cast tiles (with character/role names)

Cast tiles in `data-qa="section:cast-and-crew"` carry name + role inline:
```html
<a href="/celebrity/keanu_reeves" data-qa="person-item">
  …
  <div slot="inset-text" aria-label="Keanu Reeves, Thomas &quot;Neo&quot; Anderson">
    <p class="name" data-qa="person-name">Keanu Reeves</p>
    <p class="role" data-qa="person-role">Thomas &quot;Neo&quot; Anderson</p>
  </div>
</a>
```
Each tile is one of: a director, a writer, or a cast member with a character role. Pair `data-qa="person-name"` and `data-qa="person-role"` within the same `data-qa="person-item"` anchor.

### 7. Extract critic reviews

Top critic reviews are rendered as `<review-card-critic>` web components in the `data-qa="section:critics-reviews"` section. Each card has named slots:
```html
<review-card-critic approved-critic approved-publication top-critic top-publication>
  <rt-link slot="name" href="https://www.rottentomatoes.com/critic/joe-morgenstern"> Joe Morgenstern </rt-link>
  <rt-text slot="publication"> Wall Street Journal </rt-text>
  <span slot="timestamp">07/13/2023</span>
  <div slot="rating">
    <score-icon-critics sentiment="POSITIVE"></score-icon-critics>
    <span>2.5/4</span>
  </div>
  <span slot="review">Though The Matrix ultimately overdoses on gloom-and-doom grunge…</span>
  <rt-link slot="review-link" href="https://web.archive.org/web/…/lfilm598.htm">Go to Full Review</rt-link>
</review-card-critic>
```

The card-level attributes are signal flags: `top-critic`, `top-publication`, `approved-critic`, `approved-publication`. Use them to weight the sample. About 10 cards render per title page; the full list is at `/m/<slug>/reviews` (or `/reviews/top-critics`) if a larger sample is required.

The critics' consensus blurb is at `id="critics-consensus" class="consensus"` as a single `<p>`.

### 8. Extract "Where to Watch" (streaming-available-on)

```js
const wtw = JSON.parse(html.match(/<script id="where-to-watch-json"[^>]*>([\s\S]*?)<\/script>/)[1]);
// wtw.affiliates: [{icon:"fandango-at-home", url:"…", isSponsoredLink:false, text:"Fandango at Home"}, …]
// wtw.affiliatesText: "Rent The Matrix on Fandango at Home, or buy it on Fandango at Home."
// wtw.hasShowtimes, wtw.showtimesUrl — populated only for currently-in-theaters titles
```

### 9. (Optional) Audience review samples

A second JSON script (no `id`, but contains `"audienceScore"` + `"reviews":[…]` at the top level — ~6th `<script type="application/json">` on a typical page) holds the first ~5 audience reviews with `displayName`, `displayDate`, `rating` (out of 5), `review` body, and `isVerified` flag. Skip this unless explicitly requested — the task is critic-led.

### Browser fallback

Browser-driving is **not** required for any observed page state. If `bb fetch` ever starts returning 403, recover with:

```bash
SID=$(bb sessions create --keep-alive --verified --proxies | <id-extract>)
browse --connect "$SID" open "https://www.rottentomatoes.com/m/<slug>"
browse --connect "$SID" wait load
HTML=$(browse --connect "$SID" get html body)
bb sessions update "$SID" --status REQUEST_RELEASE
```

The same JSON blobs render server-side into the live DOM — extract identically. Add `--verified` only if a bare proxied session still 403s.

## Site-Specific Gotchas

- **Slug redirects**: Several canonical-feeling slugs 301 to a shorter form — `/m/the_matrix` → `/m/matrix` is the textbook example. `bb fetch` does **not** auto-follow; detect `statusCode === 301` and re-fetch `headers.Location`. Always emit the *final* URL as the canonical one.
- **Multi-line script attributes break naïve regex**: The `<script id="media-scorecard-json" …>` tag is laid out across multiple lines on movie / TV-show pages (not minified). A regex like `/<script id="media-scorecard-json"[^>]*>/` *fails* on these pages because `[^>]` does not match the newline-prefixed attribute layout. **Use** `/<script[\s\S]*?id="media-scorecard-json"[\s\S]*?>([\s\S]*?)<\/script>/`. Verified on `the_odyssey_2026` (pre-release) and `avatar_fire_and_ash` (released): single-line on some, multi-line on others, presumably depending on which Next.js page template hits.
- **TV series page shows *averaged* scores, not the latest season**: On `/tv/<slug>` the scorecard `criticsScore.title` is `"Avg. Tomatometer"` and `audienceScore.title` is `"Avg. Popcornmeter"` — these are aggregates across all seasons. For a specific season's score, fetch `/tv/<slug>/sNN` and read the scorecard there (its `title` will be the unprefixed `"Tomatometer"` / `"Popcornmeter"`). When the user asks for "Severance ratings" without specifying a season, return both: the series average (with `is_average: true`) and the latest season (from `containsSeason[].url`).
- **`audienceScore` mirrors a chosen subset**: `audienceScore.scoreType` switches between `"ALL"` and `"VERIFIED"` per page. The page chooses which subset to display prominently — typically `"VERIFIED"` when verified ratings cross a threshold (Avatar 3: `VERIFIED` selected with 10,000+ verified ratings out of 25,000+ total). The full `overlay.audienceAll` and `overlay.audienceVerified` blocks are *always* present when both exist — read both and emit both subsets in the output JSON, not just the primary surface.
- **`certified: true` means different things on each side**: On `criticsScore` it's the classic "Certified Fresh" (≥75 % score + 80 reviews including 5 top-critic reviews). On `audienceScore` it's the newer "Verified Hot" / "Certified Audience" tier (high verified-purchase rating). The field name is the same; the semantics aren't. Emit them as separate `tomatometer_status` and `audience_status` fields.
- **No score yet ≠ zero score**: A pre-release / under-reviewed title shows `criticsScore: {likedCount:0, notLikedCount:0, ratingCount:0, reviewCount:0, title:"Tomatometer"}` with **no** `score` / `sentiment` field. Don't coerce missing to `0` — emit `null` (or omit) and set status to `"No score yet"`. Same applies on the audience side (`reviewCount:0`, no `score`, `certifiedFresh:"none"`).
- **JSON-LD `actor[]` has no character names**: It only carries actor names + RT celebrity URLs + headshots. Cast roles ("Neo", "Morpheus", "Trinity") live in the HTML cast tiles under `<p class="role" data-qa="person-role">`. If your output schema needs role names, you must parse the HTML — JSON-LD alone is not enough.
- **JSON-LD `description` is SEO copy**: It reads `"Discover reviews, ratings, and trailers for The Matrix on Rotten Tomatoes…"` — meta-description fluff, not the actual synopsis. The real synopsis is `j.description` on the scorecard JSON (or `j.overlay` payload). Don't surface the LD `description` to users.
- **`dateCreated` semantics shift by title type**: For a `Movie` it's theatrical release. For a `TVSeries` it's the original series premiere (e.g. Severance: `2022-02-18`). For a `TVSeason` it's that season's premiere (Severance S2: `2025-01-17`). The HTML `Release Date (Theaters)` / `Premiere Date` media-info fields carry the same value in human-friendly form.
- **`bb fetch` does not require `--proxies` and is NOT rate-limited in normal usage**: Verified across 7 consecutive fetches with no 403/429 from a US-region Browserbase egress. The page-level Akamai config is permissive for read paths. Reserve `--proxies` and `--verified` for genuine failure recovery; don't add them prophylactically (they're slower).
- **Search results are server-rendered web components, not JS-hydrated cards**: `<search-page-media-row>` attribute strings already contain the disambiguation signals (`release-year`, `cast`, `tomatometer-score`). You don't need a snapshot/eval/JS-hydration step — the raw HTML attributes are enough to pick the right row.
- **Free-form search with multiple top hits**: A query like `"the matrix"` returns 68 movie matches and ~11,700 TV matches (reboots, parodies, indie titles using the word). Always disambiguate by `release-year` when the user gave a year, by media type when the user said "show" / "season" / "movie", or by cast intersection. If still ambiguous, return the top-3 candidates with their RT URLs and scores rather than guessing.
- **Some streaming affiliates are sponsored**: `wtw.affiliates[].isSponsoredLink === true` flags paid placements (often Fandango at Home for older titles RT still owns). The user-meaningful affiliates (Netflix / Max / Disney+ / etc.) are non-sponsored. Filter or annotate accordingly when emitting `streaming_available_on`.
- **READ-ONLY**: Never click `Want to See`, `Not Interested`, `Sign In`, the star-rating widgets in audience-review composer, or the `Submit your review` button. The skill purpose is observation only.

## Expected Output

Single object covering all three title types. Fields not applicable to the type are `null` or omitted.

```json
{
  "url": "https://www.rottentomatoes.com/m/matrix",
  "slug": "m/matrix",
  "title": "The Matrix",
  "original_title": null,
  "title_type": "movie",
  "media_type_raw": "Movie",
  "release_year": 1999,
  "year_range": null,
  "release_date_theaters": "1999-03-31",
  "release_date_streaming": "2009-01-01",
  "content_rating": "R",
  "runtime_minutes": 136,
  "runtime_display": "2h 16m",
  "episode_count": null,
  "season_count": null,
  "genres": ["Sci-Fi", "Action", "Mystery & Thriller"],
  "synopsis": "Neo believes that Morpheus, an elusive figure considered to be the most dangerous man alive, can answer his question -- What is the Matrix? …",
  "poster_url": "https://resizing.flixster.com/…ems.cHJkLWVtcy1hc3NldHMvbW92aWVzL2EwMGEwNmQxLTE1MGYtNGQwYS04ZDhlLWQ0MzYwOTQ5M2JlMC5qcGc=",
  "studio": ["Warner Bros.", "Village Roadshow Prod.", "Silver Pictures"],
  "distributor": "Warner Bros. Pictures",

  "tomatometer": {
    "score": 83,
    "status": "Certified Fresh",
    "sentiment": "POSITIVE",
    "certified": true,
    "rating_count": 209,
    "review_count": 209,
    "average_rating": 7.9,
    "liked_count": 173,
    "not_liked_count": 36,
    "reviews_page_url": "https://www.rottentomatoes.com/m/matrix/reviews",
    "top_critics": {
      "score": 71, "rating_count": 58, "certified": true,
      "reviews_page_url": "https://www.rottentomatoes.com/m/matrix/reviews/top-critics"
    }
  },

  "popcornmeter": {
    "score": 85,
    "status": "Upright",
    "sentiment": "POSITIVE",
    "certified": false,
    "score_type": "ALL",
    "review_count": 1307885,
    "banded_rating_count": "250,000+ Ratings",
    "average_rating": 3.6,
    "liked_count": 142778,
    "not_liked_count": 24632,
    "reviews_page_url": "https://www.rottentomatoes.com/m/matrix/reviews/all-audience",
    "verified_only": null
  },

  "critics_consensus": "Thanks to the Wachowskis' imaginative vision, The Matrix is a smartly crafted combination of spectacular action and groundbreaking special effects.",

  "directors": [
    {"name": "Lilly Wachowski", "url": "https://www.rottentomatoes.com/celebrity/lilly_wachowski"},
    {"name": "Lana Wachowski",  "url": "https://www.rottentomatoes.com/celebrity/lana_wachowski"}
  ],
  "writers": [],
  "cast": [
    {"name": "Keanu Reeves",       "role": "Thomas \"Neo\" Anderson", "url": "https://www.rottentomatoes.com/celebrity/keanu_reeves"},
    {"name": "Laurence Fishburne", "role": "Morpheus",                "url": "https://www.rottentomatoes.com/celebrity/larry_fishburne"},
    {"name": "Carrie-Anne Moss",   "role": "Trinity",                 "url": "https://www.rottentomatoes.com/celebrity/carrie_anne_moss"},
    {"name": "Hugo Weaving",       "role": "Agent Smith",             "url": "https://www.rottentomatoes.com/celebrity/hugo_weaving"}
  ],

  "critic_reviews_sample": [
    {
      "critic": "Joe Morgenstern",
      "publication": "Wall Street Journal",
      "is_top_critic": true,
      "sentiment": "POSITIVE",
      "rating": "2.5/4",
      "date": "07/13/2023",
      "quote": "Though The Matrix ultimately overdoses on gloom-and-doom grunge…",
      "original_review_url": "https://web.archive.org/web/19990508122457/http://www.usatoday.com/life/enter/movies/lfilm598.htm",
      "critic_url": "https://www.rottentomatoes.com/critic/joe-morgenstern"
    }
  ],

  "streaming_available_on": [
    {"name": "Fandango at Home", "icon": "fandango-at-home", "url": "https://athome.fandango.com/content/browse/details/The-Matrix/9254?cmp=rt_where_to_watch", "is_sponsored": false}
  ],
  "has_showtimes": false,
  "showtimes_url": null
}
```

### TV series (series-wide aggregate)

```json
{
  "url": "https://www.rottentomatoes.com/tv/severance",
  "slug": "tv/severance",
  "title": "Severance",
  "title_type": "tvSeries",
  "media_type_raw": "TvSeries",
  "release_year": 2022,
  "year_range": "2022–",
  "content_rating": "TV-MA",
  "season_count": 2,
  "runtime_minutes": null,
  "tomatometer":  { "score": 95, "status": "Fresh", "is_average": true,  "rating_count": 242,   "average_rating": 8.7 },
  "popcornmeter": { "score": 80, "status": "Upright", "is_average": true, "banded_rating_count": "5,000+ Ratings" },
  "seasons": [
    {"season_number": 1, "url": "https://www.rottentomatoes.com/tv/severance/s01"},
    {"season_number": 2, "url": "https://www.rottentomatoes.com/tv/severance/s02"}
  ]
}
```

### TV season (specific season's actual score)

```json
{
  "url": "https://www.rottentomatoes.com/tv/severance/s02",
  "slug": "tv/severance/s02",
  "title": "Severance: Season 2",
  "title_type": "tvSeason",
  "media_type_raw": "TvSeason",
  "season_number": 2,
  "parent_series": {
    "slug": "tv/severance",
    "title": "Severance",
    "url": "https://www.rottentomatoes.com/tv/severance",
    "series_start_date": "2022-02-18"
  },
  "premiere_date": "2025-01-17",
  "content_rating": "TV-MA",
  "tomatometer":  { "score": 94, "status": "Certified Fresh", "certified": true, "is_average": false, "rating_count": 228 },
  "popcornmeter": { "score": 74, "status": "Upright",         "is_average": false, "banded_rating_count": "5,000+ Ratings" }
}
```

### No-score-yet (pre-release)

```json
{
  "url": "https://www.rottentomatoes.com/m/the_odyssey_2026",
  "title": "The Odyssey",
  "title_type": "movie",
  "release_year": 2026,
  "tomatometer":  { "score": null, "status": "No score yet", "rating_count": 0 },
  "popcornmeter": { "score": null, "status": "No score yet", "review_count": 0 }
}
```

### Free-form-title disambiguation (multiple matches)

```json
{
  "success": false,
  "reason": "ambiguous_title",
  "query": "the matrix",
  "candidates": [
    {"title": "The Matrix",        "type": "movie",    "release_year": 1999, "url": "https://www.rottentomatoes.com/m/matrix",        "tomatometer_score": 83},
    {"title": "The Matrix Resurrections", "type": "movie", "release_year": 2021, "url": "https://www.rottentomatoes.com/m/the_matrix_resurrections", "tomatometer_score": 63},
    {"title": "The Matrix Reloaded","type": "movie",   "release_year": 2003, "url": "https://www.rottentomatoes.com/m/matrix_reloaded","tomatometer_score": 73}
  ]
}
```
