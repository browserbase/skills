---
name: justwatch-com-browse-new-content-ratings-cp26tg
title: JustWatch ES New Content with IMDb Ratings
description: >-
  Return JustWatch's daily 'Nuevo' feed for Spain (/es/nuevo) grouped by
  streaming platform, with each title's IMDb score, vote count, TMDB score, and
  Rotten Tomatoes meter pulled from the page's embedded Apollo cache — no
  per-title page visit needed.
website: justwatch.com
category: streaming
tags:
  - streaming
  - justwatch
  - imdb
  - ratings
  - spain
  - new-releases
source: 'browserbase: agent-runtime 2026-05-21'
updated: '2026-05-21'
recommended_method: hybrid
alternative_methods:
  - method: browser
    rationale: >-
      Load /es/nuevo in a headless browser and read
      window.__APOLLO_STATE__.defaultClient. This is the path the SKILL
      documents and is the cheapest reliable surface.
  - method: api
    rationale: >-
      JustWatch's public GraphQL at apis.justwatch.com/graphql is callable but
      introspection is disabled and the webapp's operation strings change
      between builds. The SSR Apollo cache is strictly cheaper for this task;
      only call GraphQL directly if you need pagination beyond what the initial
      SSR cache exposes.
  - method: fetch
    rationale: >-
      Plain HTTP GET of /es/nuevo returns the same SSR HTML with the Apollo
      cache inlined in a <script> tag — works without a browser if you only need
      the first 8 buckets and can parse the inline JSON. Anti-bot is not active
      on this route.
verified: true
proxies: true
---
# JustWatch New Content with IMDb Ratings (ES)

## Purpose

Return JustWatch's daily "Nuevo" page for Spain (`/es/nuevo`) grouped by streaming platform, with each title's IMDb score and vote count (plus TMDB score and Rotten Tomatoes meter, all already in the same payload). The page lists what was added in the last day on each provider in Spain (Netflix, Filmin, Atresplayer, RTVE Play, Plex, Amazon Prime, Disney+, Hayu Amazon Channel, …). Read-only — never logs in, never clicks watchlist/like buttons, never follows the `e.justwatch.com` outbound click-out links.

## When to Use

- Daily monitoring of new movies / seasons / episodes added to streaming platforms in Spain.
- Building a "what's new and worth watching" feed where IMDb rating gates inclusion (e.g. only surface ≥ 7.0 with ≥ 1000 votes).
- Anywhere you'd otherwise scrape `/es/nuevo` HTML — the Apollo state embedded in the SSR HTML is fully structured JSON and skips DOM parsing entirely.

## Workflow

The page is a Vue/Apollo SPA that ships its full GraphQL cache inline as `window.__APOLLO_STATE__.defaultClient`. **Every title visible on the page already has `imdbScore`, `imdbVotes`, `tmdbScore`, `tomatoMeter` in that cache** — no per-title page visit needed. The optimal path is: load the page once, walk the Apollo cache, return structured JSON. There is no public REST endpoint; the underlying GraphQL (`https://apis.justwatch.com/graphql`) is operational but introspection is disabled and persisted-operation hashes change between webapp builds, so calling it directly is more brittle than reading the SSR-hydrated cache.

1. **Create a session** (a bare Browserbase session is fine — JustWatch does not gate `/es/nuevo` behind anti-bot). Stealth/proxies are not required.
   ```bash
   sid=$(browse cloud sessions create --keep-alive \
     | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
   export BROWSE_SESSION="$sid"
   ```

2. **Open the page and wait for hydration.** The Apollo cache is populated by the time `load` fires.
   ```bash
   browse open "https://www.justwatch.com/es/nuevo" --remote
   ```

3. **Walk `window.__APOLLO_STATE__.defaultClient`** via `browse eval`. The cache is keyed by GraphQL field-with-arguments strings. The relevant root keys are everything under `ROOT_QUERY` starting with `newTitles(` that contains `"packages":["<3-letter pkg>"]` — each one is a single (date, package) bucket. The 8 SSR-prefilled buckets share the most-recent date in the cache (one bucket per platform).

   ```js
   // Run inside browse eval --remote
   (() => {
     const apollo = window.__APOLLO_STATE__.defaultClient;
     const root = apollo['ROOT_QUERY'];
     // Index packages by short-name (e.g. "nfx" -> "Netflix")
     const packages = {};
     Object.keys(apollo).forEach(k => {
       if (k.startsWith('Package:')) {
         const p = apollo[k];
         if (p.shortName) packages[p.shortName] = p.clearName || p.technicalName;
       }
     });
     // Collect buckets — keys look like:
     //   newTitles({"country":"ES","date":"YYYY-MM-DD","filter":{... "packages":["nfx"] ...},"first":10,"pageType":"NEW",...})
     const bucketKeys = Object.keys(root)
       .filter(k => k.startsWith('newTitles(') && k.includes('packages'));
     const result = [];
     for (const bkey of bucketKeys) {
       const date = (bkey.match(/"date":"([0-9-]+)"/) || [])[1];
       const pkg  = (bkey.match(/"packages":\["([a-z]+)"\]/) || [])[1];
       const ref  = root[bkey];                        // {type:"id", generated:true, id:"$ROOT_QUERY..."}
       const conn = apollo[ref.id];                    // NewTitlesConnection
       const items = [];
       for (const edgeRef of conn.edges) {
         const edge    = apollo[edgeRef.id];           // NewTitlesEdge
         const node    = apollo[edge.node.id];         // Movie | Show | Season
         const cKey    = Object.keys(node).find(k => k.startsWith('content('));
         const content = apollo[node[cKey].id];        // MovieContent | ShowContent | SeasonContent
         const scoring = content.scoring && content.scoring.id
                          ? apollo[content.scoring.id] : null;
         items.push({
           id:           node.id,                      // "tm…" movie, "ts…" show, "tss…" season
           type:         node.__typename,              // "Movie" | "Show" | "Season"
           title:        content.title,
           url:          'https://www.justwatch.com' + content.fullPath,
           imdb_score:   scoring && scoring.imdbScore,
           imdb_votes:   scoring && scoring.imdbVotes,
           tmdb_score:   scoring && scoring.tmdbScore,
           tomato_meter: scoring && scoring.tomatoMeter,
         });
       }
       result.push({ date, package: pkg, platform: packages[pkg] || pkg, items });
     }
     return result;
   })()
   ```

   Returns an array of `{ date, package, platform, items[] }`. `date` is a `YYYY-MM-DD` string in JustWatch's bucket-date convention (this is what the site labels under headers like "Ayer" / "Hace dos días"). `imdb_score`/`imdb_votes` may both be `null` for titles IMDb does not list (Spanish daytime TV in particular often has `imdb_score:null` with `tmdb_score` only).

4. **(Optional) Paginate for older days or more platforms.** The initial SSR cache contains only 8 buckets — one per top platform for the latest day. To get more (older dates, smaller providers), scroll/click the day-navigation in the UI; each user-triggered fetch lands as another `newTitleBuckets({"after":"<cursor>",…})` and `newTitles({…})` entry in the Apollo cache. After each interaction, re-run step 3 to pick up the newly hydrated buckets.

   Cursor source: `ROOT_QUERY['newTitleBuckets({…}).pageInfo'].endCursor` (base64-encoded `YYYY-MM-DD_<offset>`). `hasNextPage:true` means more buckets exist; trigger the SPA's "scroll past last bucket" sentinel or click a deeper-day link.

5. **Release the session.**
   ```bash
   browse cloud sessions update "$sid" --status REQUEST_RELEASE
   ```

### Browser fallback (DOM scrape — only if SSR state is missing)

If `window.__APOLLO_STATE__.defaultClient` is empty (rare — only seen if the page returns a soft-error skeleton), fall back to DOM parsing on `/es/nuevo`:
- Day section headers render as plain text like `"Ayer"` / `"Hace 2 días"` / a localized date — these have **no stable selector**, so prefer reading from the Apollo `date` field above.
- Per-platform rows: each platform header `<img title="<platform-name>">` followed by an `<a href="/es/{pelicula|serie}/...">` per item.
- DOM scrape gives you titles + platform grouping but **no IMDb rating** — you'd have to visit each title page and parse the `imdb-score` span (`<span class="imdb-score">7.5 (20k)</span>`). That's 1 fetch per title vs. zero in the Apollo path, so only use as a last resort.

## Site-Specific Gotchas

- **`window.__APOLLO_STATE__` has only one top-level key — `defaultClient`.** All cache entries live underneath it. Don't expect `__APOLLO_STATE__[<typename>:<id>]` directly; it's always `__APOLLO_STATE__.defaultClient[…]`.
- **No `window.__NUXT__`** — JustWatch is Vue 2 + Apollo, not Nuxt. The hint that misleads is the SSR script ID; trust the actual `window` keys (`__APOLLO_STATE__`, `__DATA__`, `__INITIAL_SSR_USER__`, …).
- **Apollo cache uses Apollo Client v2 normalized-cache id-reference format**, not a flat object graph. Every nested object that has a `__typename` is stored as a separate key and replaced inline with a `{type:"id", generated:true, id:"…"}` reference. The walker MUST dereference each `.id` lookup (see `apollo[edge.node.id]`, `apollo[content.scoring.id]`). Treating the references as inline objects gets you `{type, generated, id}` strings instead of titles.
- **`Season` nodes use a season-level scoring**, not the parent show's. For new-episode releases the IMDb score is usually present at the season level (e.g. "Ley y orden: UVE T23" → `imdbScore:8.1, imdbVotes:143604`). If you want the show-level average instead, follow `node.show.id` to the parent `Show:ts…` entry and read its content scoring.
- **`content.title` on a `Season` is often just `"Temporada N"` or `"season-1"` (debug-shaped)** — to get the human-readable show name, look up the parent show via the season's `show` reference OR derive from `fullPath` (`/es/serie/<show-slug>/temporada-<n>`). The first-level "title" shown on the page is built by concatenating show-display-name + season number; in the Apollo cache the show-display-name lives on the parent `Show.content.title`.
- **`imdb_score` and `imdb_votes` are both `null` on titles IMDb does not track** (e.g. RTVE-only Spanish productions). Don't drop them — pass through with explicit `null` and rely on `tmdb_score` as a fallback signal.
- **The SSR cache is locale-locked.** `content({"country":"ES","language":"es"})` is the only content variant in the cache for `/es/nuevo`. Hitting `/us/new` or `/de/neu` yields a different `(country, language)` tuple. The walker pattern is the same; just don't hardcode the key.
- **Platform short-codes are an opaque 3-letter enum** (`nfx`=Netflix, `fil`=Filmin, `atr`=Atresplayer, `rtv`=RTVE Play, `plx`=Plex, `azp`=Amazon Prime Video, `dnp`=Disney+, `ahy`=Hayu Amazon Channel, …). Always resolve via the `Package:<id>` entries in the cache (`shortName` → `clearName`) rather than hardcoding — the codes are consistent across countries but the displayed `clearName` is localized ("Disney Plus" vs "Disney+").
- **Date bucket label vs. system date can be off by one.** JustWatch's bucket-date is "when the platform crawl detected the addition", which can be UTC-shifted vs. the user's local "today". The page labels them with relative Spanish strings ("Ayer" = yesterday) computed off the bucket date, not the system date. Always trust the `date` field from the cache key, never re-derive from the page label.
- **`newTitleBuckets.endCursor` is base64(`YYYY-MM-DD_<offset>`).** If you ever decode it, the trailing offset is the slot index within that day's platform list — not a global cursor. The `first:8` request param is the **number of buckets per page**, not titles per bucket; titles per bucket is `first:10` on the inner `newTitles` query.
- **Apollo GraphQL endpoint at `apis.justwatch.com/graphql` is callable from the page context but introspection is disabled** (`{"errors":[{"message":"introspection disabled"}]}`). The published webapp doesn't use persisted queries — operations go through as full `query { … }` strings — so you *can* call it directly if you reconstruct the operation from a captured request. We did not pursue this in iteration because the SSR-cache path is strictly cheaper (zero extra round-trips) and not version-coupled to JustWatch's GraphQL schema.
- **No anti-bot.** `/es/nuevo` loads cleanly from a bare session with no `--verified` / `--proxies`. Snapshot/eval/screenshot all work first-shot. There is a Cookiebot/Usercentrics consent banner overlay (`__ucCmp`) that does **not** block content rendering or the Apollo cache — ignore it.
- **The slug structure differs for movies vs. shows.** Movies live at `/es/pelicula/<slug>`, shows at `/es/serie/<slug>`, and seasons at `/es/serie/<slug>/temporada-<n>`. Use `node.__typename` (`Movie` | `Show` | `Season`) instead of slug-parsing — the `Show` typename surfaces only when an entire show was added new (rare); most "new content" buckets are `Season` (a new episode of an ongoing show) or `Movie`.
- **Outbound clickout links (`e.justwatch.com/a?…`) carry a base64-encoded analytics envelope.** Don't click them — they fire conversion tracking and redirect to the platform's product page. The streaming `monetizationType` (FLATRATE / FREE / RENT / BUY) and presentation (HD/4K) are already in the Apollo cache under `Movie:<id>.offers(…)` if you need them; never traverse the clickout URL.

## Expected Output

A list of per-platform, per-day buckets with titles and IMDb ratings:

```json
{
  "country": "ES",
  "source": "https://www.justwatch.com/es/nuevo",
  "fetched_at": "2026-05-21T14:11:00Z",
  "buckets": [
    {
      "date": "2026-05-21",
      "package": "nfx",
      "platform": "Netflix",
      "items": [
        {
          "id": "tss420399",
          "type": "Season",
          "title": "Pop Culture Jeopardy! - Temporada 1",
          "url": "https://www.justwatch.com/es/serie/pop-culture-jeopardy-2026/temporada-1",
          "imdb_score": null,
          "imdb_votes": null,
          "tmdb_score": 7.4,
          "tomato_meter": null
        },
        {
          "id": "tss420398",
          "type": "Season",
          "title": "The Boroughs: Jubilación rebelde - Temporada 1",
          "url": "https://www.justwatch.com/es/serie/the-boroughs/temporada-1",
          "imdb_score": 7.8,
          "imdb_votes": 412,
          "tmdb_score": 7.5,
          "tomato_meter": null
        }
      ]
    },
    {
      "date": "2026-05-21",
      "package": "fil",
      "platform": "Filmin",
      "items": [
        {
          "id": "tm1477321",
          "type": "Movie",
          "title": "La Semilla del fruto sagrado",
          "url": "https://www.justwatch.com/es/pelicula/the-seed-of-the-sacred-fig",
          "imdb_score": 7.5,
          "imdb_votes": 19621,
          "tmdb_score": 7.5,
          "tomato_meter": 97
        }
      ]
    },
    {
      "date": "2026-05-21",
      "package": "atr",
      "platform": "Atres Player",
      "items": [
        {
          "id": "tss237674",
          "type": "Season",
          "title": "La Ley y el Orden: Unidad de Víctimas Especiales - Temporada 23",
          "url": "https://www.justwatch.com/es/serie/ley-y-orden-unidad-de-victimas-especiales/temporada-23",
          "imdb_score": 8.1,
          "imdb_votes": 143604,
          "tmdb_score": 7.939,
          "tomato_meter": 78
        }
      ]
    }
  ]
}
```

Each `item` is guaranteed to carry `id`, `type`, `title`, `url`. `imdb_score`, `imdb_votes`, `tmdb_score`, `tomato_meter` are all nullable — only `tmdb_score` is reliably populated for niche Spanish-domestic titles.
