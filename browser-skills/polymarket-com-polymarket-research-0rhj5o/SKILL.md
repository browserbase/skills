---
name: polymarket-com-polymarket-research-0rhj5o
title: Polymarket Topic Research
description: >-
  Search Polymarket for prediction markets matching a topic, open the most
  relevant one, and return Zod-validated structured metadata: question, current
  YES/NO implied probabilities, USD volume (cumulative + rolling windows),
  resolution date, and top traders (largest holders per outcome).
website: polymarket.com
category: prediction-markets
tags:
  - polymarket
  - prediction-markets
  - odds
  - research
  - read-only
  - api
source: 'browserbase: agent-runtime 2026-05-21'
updated: '2026-05-21'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      Polymarket's public Gamma + Data REST APIs (gamma-api.polymarket.com,
      data-api.polymarket.com) are unauthenticated, CORS-open, and serve the
      exact data the polymarket.com UI consumes. Scraping the /event/{slug} page
      works only as a degraded fallback — holder amounts arrive as abbreviated
      strings ('11.2K') in the HTML and require clicking the Top Holders tab to
      even render. Use the API.
verified: false
proxies: false
---
# Polymarket Topic Research

## Purpose

Given a free-text topic (e.g. "trump", "bitcoin $150k", "Iran nuclear deal"), search Polymarket for matching prediction markets, pick the most relevant event, and return a Zod-validated structured payload containing the market question, current YES/NO odds (implied probability + last trade price + best bid/ask), volume, resolution / end date, and the top traders (largest holders) on each side. Read-only — never places an order, never signs a wallet transaction, never interacts with the order book.

## When to Use

- A research / due-diligence agent compiling a snapshot of crowd-sourced odds on a current-events topic.
- A dashboard that needs "current Polymarket consensus for X" alongside other signals.
- Comparing implied probability with traditional sportsbook / pollster numbers.
- Any flow that would otherwise scrape `polymarket.com/event/...` HTML — the public Gamma + Data APIs return everything the UI shows, in JSON, with no auth.

## Workflow

Polymarket exposes a fully public, **unauthenticated, CORS-open** REST surface that the polymarket.com front-end itself consumes. Three hosts cover this task end-to-end:

| Host | Purpose |
|---|---|
| `gamma-api.polymarket.com` | Search, event metadata, market metadata, prices |
| `data-api.polymarket.com` | Top holders (per-outcome leaderboard), recent trades, positions |
| `clob.polymarket.com` | Order book / live spread (only needed if you want raw L2 depth) |

No API key, no JWT, no cookies, no `Referer` games, no residential proxy — a vanilla `fetch` from any IP works. Lead with the API. Browser scraping is a **last-resort fallback** that costs ~30× more turns for strictly less data (holder amounts, event metadata blob, and the AI-generated "context_description" are exposed only on the JSON side).

### 1. Search for matching markets

```
GET https://gamma-api.polymarket.com/public-search
    ?q={url-encoded query}
    &limit_per_type={N}
    &events_status=active            # optional: 'active' | 'resolved' | omit for both
```

Response shape:

```json
{
  "events": [ { "id", "slug", "title", "description", "endDate", "volume",
                "liquidity", "openInterest", "commentCount", "tags": [...],
                "markets": [ {...market objects...} ],
                "eventMetadata": { "context_description": "AI-generated..." } } ],
  "tags":     [],
  "profiles": [],
  "pagination": {...}
}
```

Each `event` may contain **one market** (binary Yes/No question — `markets.length === 1`) or **many markets** (categorical / multi-outcome event — each child market is a Yes/No on a single option, with the human-readable option in `groupItemTitle`, e.g. "Japan / Korea", "Friend of mine").

### 2. Pick the most relevant event

`public-search` already returns events ordered by an internal relevance score. The first non-archived, non-closed event in `events[]` is the default "most relevant". Optionally re-rank by combining score with `volume` if you want to bias toward liquid markets:

```js
const top = events
  .filter(e => !e.closed && !e.archived)
  .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))[0];   // or keep API order
```

### 3. Extract market metadata

Pull the chosen event's `markets[]`. For each market:

| Field on `market` object | Meaning |
|---|---|
| `question` | The literal Yes/No question (string) |
| `outcomes` | **JSON-string** array, e.g. `'["Yes", "No"]'` — `JSON.parse` it |
| `outcomePrices` | **JSON-string** array of stringified floats `'["0.9995", "0.0005"]'` — `JSON.parse` then `parseFloat`. These are the **implied probabilities** (0..1), not USD prices |
| `lastTradePrice` | Float, last trade midprice (probability) |
| `bestBid` / `bestAsk` | Floats, current order-book quote |
| `spread` | `bestAsk - bestBid` |
| `volumeNum` / `volume` | Cumulative USD volume (number; the string `volume` is the same value) |
| `volume24hr` / `volume1wk` / `volume1mo` / `volume1yr` | Rolling-window USD volumes |
| `liquidityNum` / `liquidityClob` | Current CLOB liquidity (USD) |
| `endDate` / `endDateIso` | ISO-8601 resolution date |
| `conditionId` | `0x…` 32-byte hex — **primary key** for the Data API |
| `clobTokenIds` | JSON-string array of **two** large decimal token IDs — `clobTokenIds[0]` = YES token, `clobTokenIds[1]` = NO token |
| `closed` / `active` / `archived` | Lifecycle flags |
| `groupItemTitle` | Set when the event is multi-outcome; the human label for this option |
| `umaResolutionStatuses` | JSON-string array; contains `"proposed"` / `"disputed"` during resolution windows |
| `description` | Full resolution-rules text |

The event-level `eventMetadata.context_description` is an **AI-generated trader-context blurb** updated every few hours — useful as a "why is this market moving" summary.

### 4. Fetch top traders (top holders) per outcome

```
GET https://data-api.polymarket.com/holders
    ?market={conditionId}             # the 0x… hex from step 3
    &limit={N}                        # default returns top ~10 per outcome
```

The `market` query param is the **conditionId**, not the integer market id and not a CLOB token id. The endpoint will 400 if the param is missing.

Response shape — array of **one entry per outcome token** (Yes/No → 2 entries; multi-outcome neg-risk markets → N entries):

```json
[
  { "token": "40323545806742...",
    "holders": [
      { "proxyWallet": "0x2785…",
        "name": "poorsob",                     // public display name; may be empty
        "pseudonym": "Oddball-Maniac",         // auto-generated fallback; always set
        "amount": 2989847.91,                  // shares held (numeric)
        "outcomeIndex": 0,                     // 0 → Yes, 1 → No (binary markets)
        "verified": false,
        "displayUsernamePublic": true,
        "bio": "", "profileImage": "" }
    ] },
  { "token": "5845206889...", "holders": [ … outcomeIndex: 1 → No side … ] }
]
```

`outcomeIndex` maps positionally to the `outcomes` / `outcomePrices` arrays from the Gamma payload, so token 0 = Yes, token 1 = No on standard binary markets. To get a wallet's profile URL: `https://polymarket.com/profile/{proxyWallet}`.

Optional: `&sort=value` ranks by USD value instead of share count (default sorts by raw `amount`).

### 5. (Optional) Recent activity / trade feed

```
GET https://data-api.polymarket.com/trades
    ?market={conditionId}
    &limit={N}
```

Returns per-trade rows with `proxyWallet`, `side` (BUY/SELL), `outcome` ("Yes"/"No"), `size`, `price`, `timestamp` (Unix seconds), and the trader's `name`/`pseudonym`. Useful when "top traders" should mean "most recently active" rather than "largest current holders".

### 6. Assemble the Zod-validated payload

See `## Expected Output` for the canonical Zod schema. Key transforms vs. raw API:

- `JSON.parse` both `outcomes` and `outcomePrices` (they ship as JSON-encoded strings inside a JSON response — yes, double-encoded).
- Convert numeric strings (`volume`, `liquidity`) to floats; the API serves both `volume` (string) and `volumeNum` (number) — prefer `volumeNum`.
- Resolve trader display name: `holder.name || holder.pseudonym`.
- Compose `marketUrl` = `https://polymarket.com/event/{event.slug}` (event page, not per-child-market — Polymarket has no per-market URL for multi-outcome events; the `/event/...` slug is the canonical permalink).

### Browser fallback (only if the Gamma API is unreachable)

If `gamma-api.polymarket.com` ever returns a non-2xx, fall back to scraping. A **stealth + residential-proxy** session is mandatory only because the marketing site sits behind Cloudflare; the API hosts themselves do not require stealth.

```bash
sid=$(browse cloud sessions create --keep-alive --verified --proxies \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$sid"

# Search: /markets?_q={topic} redirects to /predictions/{slug} when the topic is a tag,
# OR returns a generic list page. Prefer the API.
browse open "https://polymarket.com/markets?_q=trump" --remote --session "$sid"
browse wait load --remote --session "$sid"
browse wait timeout 3000 --remote --session "$sid"
browse get markdown body --remote --session "$sid"     # parse cards from markdown

# Detail page (must visit /event/{slug} — not /market/...)
browse open "https://polymarket.com/event/trump-kiss-by-may-31" --remote --session "$sid"
browse wait load --remote --session "$sid"
browse wait timeout 4000 --remote --session "$sid"
browse snapshot --remote --session "$sid"
# Click the "Top Holders" tab to render the holder list in the DOM:
browse click <Top Holders heading ref> --remote --session "$sid"
browse wait timeout 2500 --remote --session "$sid"
browse get markdown body --remote --session "$sid"
```

The HTML carries question / volume / end date / odds and (after clicking the "Top Holders" tab) the holder list — but extracting holder amounts cleanly from markdown is brittle (numbers are abbreviated to "11.2K", "6.0K", etc.). Use the API for the structured numbers; only use the browser to confirm the page exists.

## Site-Specific Gotchas

- **`outcomes` and `outcomePrices` are double-encoded JSON.** They arrive as strings like `'["Yes", "No"]'` inside the JSON response. Forgetting to `JSON.parse` them silently yields strings where you expected arrays — the most common bug when consuming this API for the first time.
- **`outcomePrices` are implied probabilities (0..1), not USD prices.** `0.9995` means "the market thinks YES is 99.95% likely", not "$0.9995 per share" (though Polymarket's UI conveniently lets you read them either way — shares pay $1 on resolution, so probability == price). Multiply by 100 if your downstream consumer wants percent.
- **`market` param on `/holders` is the `conditionId` (0x… hex), NOT the integer `id` and NOT the `clobTokenIds` decimal.** Passing the wrong one returns `400 {"error":"required query param 'market' not provided"}` (misleading — the param IS present, just unrecognized).
- **`public-search` never returns "no results".** When the query has no good match, the endpoint returns the top globally-ranked events as a fallback (e.g. searching `xyzzy_no_such_thing` returned a Golden Globes event). To detect "no real hits", check whether `events[0].title` contains the query tokens (case-insensitive), or filter by `volume > threshold` + a fuzzy-match score. Don't treat a 200 + non-empty `events[]` as proof the query was relevant.
- **`/markets` (Gamma) is deprecated, `Sunset: Fri, 01 May 2026`.** Use `/markets/keyset` for paginated listing or `/public-search` / `/events` for everything else. The deprecated endpoint still responds with `200` + `Warning: 299 - "use /markets/keyset"` and `Deprecation: true` headers — don't ignore them in long-lived code.
- **Multi-outcome events are an event with many child markets, not a single market with many outcomes.** For a question like *"What will Trump say during bilateral events with Xi Jinping?"*, the event has 33 separate Yes/No markets (one per phrase), each with its own `conditionId` and `groupItemTitle`. The "current odds" for option *"Japan / Korea"* is `outcomePrices[0]` (Yes) of *that child market*, not a column in a parent market. `negRisk: true` is a hint that the children are mutually exclusive (only one can resolve Yes), but `negRisk: false` multi-market events also exist (independent Yes/No on each option). Schema accordingly.
- **`conditionId` survives event mutation; `id` and `slug` do not.** Polymarket occasionally re-slugs events (typo fixes, re-launches). Cache markets by `conditionId` if you persist anything across sessions.
- **`/event/{slug}` is the canonical URL — `/market/{...}` does not exist on the public site.** For multi-outcome events, every child market shares the same `/event/{slug}` page; there's no per-child-market URL.
- **Holders endpoint `outcomeIndex` is 0=Yes/1=No on binary markets, but is 0..N-1 on multi-outcome NEG-risk events** — there's no "neg-risk" flag in the holder response itself. Read `outcomeIndex` against the parent market's `outcomes` array to get the human label.
- **"Top traders" is ambiguous — pick a definition.** This skill returns *top current holders by share count* (largest positions still open). Alternative definitions: (a) top holders by USD value (`&sort=value`), (b) most recent trades (`/trades?market=...`), (c) all-time PnL leaders (no public endpoint — would require summing trades over history). Document which you used.
- **`pseudonym` is always set; `name` is often empty.** Some traders haven't set a display name; their wallet shows as `Oddball-Maniac`-style auto-generated handles. Use `name || pseudonym` as the resolved display label.
- **`umaResolutionStatuses` signals an in-progress resolution.** A non-empty array like `["proposed"]` or `["disputed"]` means UMA (the optimistic oracle) is mid-resolving — the `outcomePrices` may show `0.9995 / 0.0005` long before the market is actually `closed: true`. If your downstream consumer needs "is the answer final?", check `closed === true`, not just whether prices are pegged.
- **No API rate limit observed up to ~1 req/s.** Cloudflare fronts both `gamma-api` and `data-api`; cache hits return in ~50ms and bypass any origin throttle. Don't blast — be polite.
- **`/predictions/{topic}` is a marketing-SEO page**, not search. It returns hand-curated events tagged with that topic (e.g. `/predictions/trump`), not full-text matches. The browser-fallback's `/markets?_q={query}` URL **silently rewrites to `/predictions/{slug}`** when `{slug}` matches a known tag — the search experience is "tag-first, full-text fallback". The Gamma API's `public-search` is the only full-text path.
- **Browser path: capturing the "Top Holders" panel requires clicking the tab.** The detail page has "Comments | Top Holders | Positions | Activity" tabs. Default view is Comments, and the Holders DOM is not rendered until that tab is clicked. Adds ~2.5s wait for the holder rows to mount.

## Expected Output

The skill returns one of three shapes. Zod schema:

```ts
import { z } from "zod";

const Trader = z.object({
  proxyWallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  displayName: z.string(),                              // name || pseudonym
  pseudonym: z.string(),
  amount: z.number().nonnegative(),                     // shares held
  outcomeIndex: z.number().int().min(0),                // 0=Yes, 1=No (binary)
  outcomeLabel: z.string(),                             // "Yes" / "No" / "Japan / Korea" / ...
  verified: z.boolean(),
  profileUrl: z.string().url(),                         // https://polymarket.com/profile/{proxyWallet}
});

const Market = z.object({
  conditionId: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  question: z.string(),
  groupItemTitle: z.string().nullable(),                // populated for multi-outcome children
  outcomes: z.array(z.string()),                        // e.g. ["Yes","No"]
  prices: z.object({                                    // implied probabilities, 0..1
    yes: z.number().min(0).max(1),
    no:  z.number().min(0).max(1),
    lastTrade: z.number().min(0).max(1).nullable(),
    bestBid:   z.number().min(0).max(1).nullable(),
    bestAsk:   z.number().min(0).max(1).nullable(),
    spread:    z.number().min(0).max(1).nullable(),
  }),
  volume: z.object({
    total:   z.number().nonnegative(),
    day:     z.number().nonnegative().nullable(),
    week:    z.number().nonnegative().nullable(),
    month:   z.number().nonnegative().nullable(),
    year:    z.number().nonnegative().nullable(),
  }),
  liquidity: z.number().nonnegative().nullable(),
  endDate: z.string().datetime(),                       // ISO-8601
  closed: z.boolean(),
  active: z.boolean(),
  topTraders: z.array(Trader),                          // typically top 5-10 per side, concatenated
});

const ResearchResult = z.discriminatedUnion("status", [
  // 1. Found a clearly relevant binary market
  z.object({
    status: z.literal("ok"),
    query: z.string(),
    event: z.object({
      id: z.string(),
      slug: z.string(),
      title: z.string(),
      url: z.string().url(),                            // https://polymarket.com/event/{slug}
      description: z.string(),
      contextDescription: z.string().nullable(),        // eventMetadata.context_description
      tags: z.array(z.object({ id: z.string(), label: z.string(), slug: z.string() })),
      volume: z.number().nonnegative(),
      liquidity: z.number().nonnegative(),
      openInterest: z.number().nonnegative().nullable(),
    }),
    markets: z.array(Market).min(1),                    // 1 entry for binary, N for multi-outcome
    multiOutcome: z.boolean(),                          // true iff markets.length > 1
    fetchedAt: z.string().datetime(),
  }),
  // 2. Search returned events but none look relevant (top result doesn't contain query tokens)
  z.object({
    status: z.literal("no_relevant_match"),
    query: z.string(),
    topGuess: z.object({ slug: z.string(), title: z.string(), url: z.string().url() }),
    reason: z.string(),                                 // e.g. "top result title does not contain any query token"
  }),
  // 3. Hard failure (API non-2xx after retries)
  z.object({
    status: z.literal("error"),
    query: z.string(),
    httpStatus: z.number().int(),
    message: z.string(),
  }),
]);
```

Example `status: "ok"` payload (binary market):

```json
{
  "status": "ok",
  "query": "trump kiss",
  "event": {
    "id": "59112",
    "slug": "trump-kiss-by-may-31",
    "title": "Trump kiss by May 31?",
    "url": "https://polymarket.com/event/trump-kiss-by-may-31",
    "description": "This market will resolve to \"Yes\" if Donald Trump and any other person kiss by the specified date…",
    "contextDescription": "A recent viral video capturing Donald Trump exchanging a kiss…",
    "tags": [{ "id": "2", "label": "Politics", "slug": "politics" }],
    "volume": 6310760.45,
    "liquidity": 8945123.0,
    "openInterest": null
  },
  "markets": [
    {
      "conditionId": "0xcef981d46a1039b6ae02f578d2208302a8a3d63465d24363a1d65a86835a1ae8",
      "question": "Trump kiss by May 31?",
      "groupItemTitle": null,
      "outcomes": ["Yes", "No"],
      "prices": {
        "yes": 0.9995, "no": 0.0005,
        "lastTrade": 0.9995, "bestBid": 0.999, "bestAsk": 1.0, "spread": 0.001
      },
      "volume": { "total": 6310760.45, "day": 532019.1, "week": 6310760.45, "month": 6310760.45, "year": 6310760.45 },
      "liquidity": 8945123.0,
      "endDate": "2026-05-31T00:00:00Z",
      "closed": false,
      "active": true,
      "topTraders": [
        { "proxyWallet": "0x2785e7022dc20757108204b13c08cea8613b70ae",
          "displayName": "poorsob", "pseudonym": "Oddball-Maniac",
          "amount": 2989847.91, "outcomeIndex": 0, "outcomeLabel": "Yes",
          "verified": false, "profileUrl": "https://polymarket.com/profile/0x2785e7022dc20757108204b13c08cea8613b70ae" },
        { "proxyWallet": "0x558ee6...", "displayName": "perseusplus", "pseudonym": "...",
          "amount": 4044588.47, "outcomeIndex": 1, "outcomeLabel": "No",
          "verified": false, "profileUrl": "https://polymarket.com/profile/0x558ee6..." }
      ]
    }
  ],
  "multiOutcome": false,
  "fetchedAt": "2026-05-21T00:08:00Z"
}
```

Example `status: "no_relevant_match"` payload:

```json
{
  "status": "no_relevant_match",
  "query": "xyzzy_no_such_thing",
  "topGuess": {
    "slug": "golden-globes-best-motion-picture-musical-or-comedy-winner",
    "title": "Golden Globes: Best Motion Picture – Musical or Comedy Winner",
    "url": "https://polymarket.com/event/golden-globes-best-motion-picture-musical-or-comedy-winner"
  },
  "reason": "top result title does not contain any query token; Polymarket public-search returns a fallback ranking when no good match exists"
}
```
