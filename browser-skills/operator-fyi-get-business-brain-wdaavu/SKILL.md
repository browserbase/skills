---
name: operator-fyi-get-business-brain-wdaavu
title: Operator Business Brain Profile
description: >-
  Resolve any business name, URL, city, or trade into Operator's full public
  Brain profile: 0-100 brain score with component breakdown, market rank, review
  sentiment from Google/Yelp/Meta, services + privacy-protected contact, top 3
  competitors with scores, AI narrative, USD valuation range (vertical-multiple
  comparables), per-business MCP endpoint, and canonical /biz/{slug}/ URL.
  Read-only.
website: operator.fyi
category: business-intelligence
tags:
  - business-intelligence
  - directory
  - local-business
  - mcp
  - brain-score
  - valuation
  - competitive-analysis
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: api
alternative_methods:
  - method: mcp
    rationale: >-
      Operator publishes its own MCP server at https://operator.fyi/api/mcp (and
      per-business descriptor at /mcp/biz/{slug}/). If the calling agent is
      MCP-capable, mounting Operator's server natively gives identical data via
      the get_business_details / get_brain_score / get_review_intelligence
      tools, with the same 100 req/day free tier and no key required.
  - method: browser
    rationale: >-
      Two public profile pages render the same data with no anti-bot wall:
      https://operator.fyi/biz/{slug}/ (brain dashboard) and
      https://operator.fyi/{niche}/{city_slug}/{slug}/ (vertical listing with
      health-score breakdown + top-5 competitor leaderboard). Only worth driving
      when the REST API is degraded (search-index supabase_timeout fallback) or
      when a pixel screenshot is required.
verified: true
proxies: true
---
# Operator Business Brain Profile

## Purpose

Resolve a free-text business reference (name, website domain, city, or trade) into a single structured "Brain profile" from Operator's public substrate of 35.2M US local businesses. Returns: brain score (0–100) with six weighted components, market position (rank within city + trade), recent review sentiment aggregated from Google/Yelp/Meta, services + contact info (phone/address public; email privacy-protected), top 3 same-market competitors with brain scores only, the AI-generated `why` narrative, the `operator_estimate_low/mid/high` valuation band (USD, vertical-aware multiple drawn from Operator's own broker comparables — they cite Empire Flippers / Flippa / BizBuySell on the marketing page), the canonical `/biz/{slug}/` URL, and the per-business MCP descriptor URL at `/mcp/biz/{slug}/`. Read-only — no booking, claiming, or activation calls.

## When to Use

- A user pastes a business name, website URL, or `"plumber in austin"`-style phrase and wants the full Operator dossier.
- An agent needs a single JSON view of a local-services business before deciding to recommend, contact, or compare it.
- A downstream MCP-aware client needs the per-business tool/resource manifest at `/mcp/biz/{slug}/` to delegate further calls.
- Lightweight competitive benchmarking: top-3 same-trade-same-city peers with brain scores and valuation bands.
- ARR / valuation estimation for SMB acquisition research (the `operator_estimate_*` fields are the vertical-multiple band).

## Workflow

Operator exposes a stable, **unauthenticated** REST API at `https://operator.fyi/api/v1/` with a 100 req/day free-tier ceiling, no key required (see `https://operator.fyi/developers/` and OpenAPI 3.0.3 spec at `https://operator.fyi/api/v1/openapi.json`). The full brain profile is assembled from five GET calls in parallel after slug resolution. **Do not drive a browser for this task** — the same data backs the rendered `/biz/{slug}/` and `/{niche}/{city_slug}/{slug}/` pages and there is no anti-bot wall in front of the API.

1. **Resolve free-text input to a slug.** Hit `GET https://operator.fyi/api/v1/recommend/?query={url-encoded-text}`. The response auto-detects `niche` + `city` + `state` and returns up to 3 `recommendations` with `name`, `rating`, `reviews`, `phone`, `address`, `url` (the vertical listing URL — derive the slug from the trailing path segment), `trust_score`, and a one-sentence `why` (this is the AI narrative the task asks for). If the caller supplied a slug already, skip this step.
2. **Fetch the canonical profile.** `GET /api/v1/business/?slug={slug}` → `data` contains `id` (UUID), `name`, `slug`, `niche`, `city`, `city_slug`, `state`, `address`, `phone`, `website`, `rating`, `review_count`, `description` (the long-form AI narrative blurb), `services[]`, `photos[]`, `business_hours`, `claimed`, `listing_url`, `google_maps_url`, `same_as[]`. Note `data.reviews` is an empty array in the free tier — review *text* is gated; aggregate sentiment is not.
3. **Fetch brain score.** `GET /api/v1/health-score/?slug={slug}` → `data.overall_score` (0–100), `data.grade` (A-F), and `data.components` with six weighted sub-scores: `trust_layer` (0.20), `review_signal` (0.25), `market_position` (0.20), `digital_presence` (0.20), `demand_signal` (0.15). This is the MCP-canonical brain score — the `get_brain_score` MCP tool resolves to exactly this endpoint.
4. **Fetch market position.** `GET /api/v1/market-position/?slug={slug}` → `data.rank`, `data.total_in_market`, `data.percentile`, `data.composite_score`, plus market-average rating / review-count / years-in-business and `gap_to_next_rank.advice` (a short coaching string). Use this for the "market position rank within (city, trade)" field.
5. **Fetch review intelligence.** `GET /api/v1/review-intelligence/?slug={slug}` → `data.overall_sentiment` (`very_positive` | `positive` | `mixed` | `negative` | `very_negative`), `data.rating_distribution` (1–5 star counts), `data.themes[]` (theme extraction; often empty on unclaimed listings — see Gotchas), `data.market_comparison` (your-vs-market rating + review-count + verdict strings like `"above"` / `"below"`).
6. **Fetch peer set + valuation band.** `GET /api/v1/markets/{city_slug}/{niche}/` returns `businesses[]` (up to ~50, sorted by Operator's own ranking). For each business you get `id`, `name`, `slug`, `rating`, `review_count`, `market_rank` (often `null` while indexing — see Gotchas), `operator_verified_score` (this is the publicly-exposed brain score per peer), and three valuation fields: `operator_estimate_low`, `operator_estimate_mid`, `operator_estimate_high` (USD, vertical-multiple). To build "top 3 competitors": find the queried business by slug, drop it from the array, take the next 3 highest-`operator_verified_score` (fall back to highest rating × log(reviews) if scores are null), and emit only `{ name, slug, brain_score, canonical_url }` — no detailed intel, per the task contract. The queried business's own row carries its valuation band — store `{ low, mid, high }`.
7. **Construct canonical URL + MCP endpoint.** Canonical: `https://operator.fyi/biz/{slug}/` (always — verify with `HEAD` if paranoid). Per-business MCP descriptor: `https://operator.fyi/mcp/biz/{slug}/` returns JSON with `mcp.server.url` (`https://operator.fyi/api/mcp-v2`), `mcp.tools[]` (4 tools incl. `scan_business`, `get_brain_score`, `claim_business`, `get_review_intelligence`), `mcp.resources[]` (links back to business_profile, market_rankings, public_profile_html), and `mcp.prompts[]` (3 pre-built prompts). Pass that URL through to the caller so downstream MCP clients can mount it directly.
8. **Emit one JSON object** matching the Expected Output schema. ARR-with-confidence-band is *not* an explicit field anywhere in the Operator API — derive it (or omit it) from `operator_estimate_mid` divided by a vertical-typical revenue multiple (1.5–3× ARR for service trades on BizBuySell / Empire Flippers comparables); flag confidence as `low` when `operator_estimate_mid` is null or when `health-score.components.demand_signal` is 0. Be explicit in the output that ARR is *derived*, not directly returned by Operator.

### Browser fallback

If the API is degraded (the `/api/v1/search/` index falls back to `supabase_timeout_then_fallback_http_500` intermittently — see Gotchas), open one of the two public profile pages and screenshot/extract:
- `https://operator.fyi/biz/{slug}/` — modern "Brain dashboard" with 6-segment radial, profile completeness 0–100, brain level L0–L6, `operator://...` activity ledger.
- `https://operator.fyi/{niche}/{city_slug}/{slug}/` — long-form vertical listing with full health-score component breakdown, top-5 competitor leaderboard already rendered, services / specialties / certifications / service areas. The `listing_url` returned by `/api/v1/business` points here.

Both render server-side, no anti-bot wall, no JS execution needed for content. Use Browserbase only if you need pixel screenshots; otherwise `browse cloud fetch` is sufficient.

## Site-Specific Gotchas

- **Every `/api/v1/*` path requires a trailing slash.** Hitting `https://operator.fyi/api/v1/business?slug=X` returns a 308 redirect to `/api/v1/business/?slug=X` and (worse) the redirect Location URL-encodes the query string a second time, so a naive client follow can produce a 400. Always include the trailing slash explicitly.
- **`/api/v1/businesses/` (the plural list endpoint) returns `500 Internal server error` as of 2026-05-19**, regardless of filters. Use `/api/v1/recommend/` or `/api/v1/markets/{city_slug}/{niche}/` for list-style needs.
- **`/api/v1/search/?q=...` is flaky** — falls back to `search_index_fallback` with `fallback_reason: "supabase_timeout_then_fallback_http_500"` and `results: []` for queries that have working `/recommend` matches. Prefer `/recommend?query=...` as the slug-resolver; only use `/search` for known-exact name matches and treat empty results as transient.
- **`/api/v1/competitors/?slug=X` returns `{"ok": true, "gated": true, "unlocked": true, "content": null}` on the free tier** — confirmed null even with a valid slug. Don't waste calls on it; derive competitors from `/api/v1/markets/{city_slug}/{niche}/` instead.
- **Three different "brain"/"health" scores can appear for the same business.** `/api/v1/health-score` is the MCP-canonical one (52 for Roto-Rooter on 2026-05-19). The `/biz/{slug}/` HTML dashboard shows a *separate* "BRAIN" number derived from profile completeness + ledger activity (75 for the same business). The `/{niche}/{city_slug}/{slug}/` listing page shows a *third* "Health score" snapshot with its own component breakdown (98 in the same window). For programmatic use, **trust `/api/v1/health-score`**; cite the date stamp on the listing page if you need a human-friendly grade.
- **`market_rank` in `/api/v1/markets/...` is frequently `null`** ("Unranked" on the HTML, "Market rank refreshing") even for #1-by-`composite_score` businesses. Use `/api/v1/market-position?slug=X`'s `rank` + `total_in_market` + `percentile` for the rank field instead; that endpoint always computes a synthetic rank from the composite score.
- **`data.reviews: []` is by-design on the free tier** — Operator gates the full review text behind an enrichment key. `/api/v1/review-intelligence/` still returns aggregate sentiment + rating distribution + market comparison, which is what the task actually asks for. Don't interpret the empty array as "no reviews exist".
- **Contact email is intentionally privacy-protected.** `data.email` is never returned by `/api/v1/business/`; the HTML profile shows "Contact this business" instead of an address. Phone + street address are public. The skill output should mirror this: emit `phone` + `address` but leave `email` as `null` or omit it.
- **Two public profile URLs both work and both look canonical.** `/biz/{slug}/` (brain dashboard) and `/{niche}/{city_slug}/{slug}/` (vertical listing). The task spec says canonical is `/biz/{slug}/`; the API's `listing_url` field returns the vertical-listing form. Emit `/biz/{slug}/` as `canonical_url` and the vertical form as `listing_url` to satisfy both.
- **The `/mcp/biz/{slug}` endpoint also needs a trailing slash** (308 redirect otherwise). The returned manifest references `https://operator.fyi/api/mcp-v2` (a different server URL than `/api/mcp` used on the marketing page) — pass through whatever the per-business endpoint returns rather than hard-coding.
- **No authentication, no key, no signup** — the 100 req/day free-tier ceiling is per-IP. The full brain-profile assemble for one business is 5–6 GETs; budget accordingly when batch-processing.
- **`operator_estimate_*` is a USD *valuation* band, not ARR**, despite the field naming. Roto-Rooter's mid was $9.78M with low $6.5M / high $13M on 2026-05-19 — that's a sale-price comparable, not an annual-revenue figure. The task asks for both ARR and valuation; only valuation is directly served. If you must emit ARR, derive it (`operator_estimate_mid / 2.0` is a reasonable vertical-blind midpoint for service trades) and tag the confidence band as `derived` / `low`.
- **`operator_estimate_*` is `null` for many listings** (~25% of the Honolulu plumbing peer set on 2026-05-19, including `Waialae Plumbing & Construction`). When null, emit `valuation_range: null` rather than fabricating a band.

## Expected Output

One JSON object per business lookup. Fields with no corresponding Operator data are explicitly `null` (do not omit them). Example for the canonical test case `roto-rooter-plumbing-water-cleanup-4b2ca5ed`:

```json
{
  "slug": "roto-rooter-plumbing-water-cleanup-4b2ca5ed",
  "id": "4b2ca5ed-e54d-41bc-a3b0-dd10a55c1ed1",
  "name": "Roto-Rooter Plumbing & Water Cleanup",
  "niche": "plumbing",
  "city": "Honolulu",
  "city_slug": "honolulu",
  "state": "HI",
  "canonical_url": "https://operator.fyi/biz/roto-rooter-plumbing-water-cleanup-4b2ca5ed/",
  "listing_url": "https://operator.fyi/plumbing/honolulu/roto-rooter-plumbing-water-cleanup-4b2ca5ed/",
  "mcp_endpoint": "https://operator.fyi/mcp/biz/roto-rooter-plumbing-water-cleanup-4b2ca5ed/",
  "brain_score": {
    "overall": 52,
    "grade": "D",
    "components": {
      "trust_layer":      { "score": 0,   "weight": 0.20 },
      "review_signal":    { "score": 80,  "weight": 0.25 },
      "market_position":  { "score": 100, "weight": 0.20 },
      "digital_presence": { "score": 60,  "weight": 0.20 },
      "demand_signal":    { "score": 0,   "weight": 0.15 }
    },
    "source": "https://operator.fyi/api/v1/health-score?slug=roto-rooter-plumbing-water-cleanup-4b2ca5ed"
  },
  "market_position": {
    "rank": 1,
    "total_in_market": 114,
    "percentile": 100,
    "composite_score": 36.85,
    "market_avg_rating": 4.54,
    "market_avg_review_count": 41.81,
    "gap_to_next_rank": "You are #1 in your market"
  },
  "review_intelligence": {
    "overall_sentiment": "very_positive",
    "rating": 4.8,
    "review_count": 2159,
    "rating_distribution": { "1": 70, "2": 139, "3": 279, "4": 557, "5": 1114 },
    "themes": [],
    "market_comparison": {
      "rating_vs_market": "above",
      "reviews_vs_market": "above",
      "market_avg_rating": 4.53,
      "market_avg_review_count": 153
    }
  },
  "services": [
    "Emergency plumbing services", "Plumbing and drain cleaning",
    "Water cleanup", "Backflow services", "Commercial plumbing",
    "Excavation", "Pipe restoration", "Garbage disposal service",
    "Grease trap service", "Leak detection",
    "Water heater plumbing support", "Sewer line service"
  ],
  "contact": {
    "phone": "(808) 842-5680",
    "address": "3049 Ualena St Ste 713, Honolulu, HI 96819, USA",
    "website": "https://www.rotorooter.com/honolulu/",
    "email": null,
    "google_maps_url": "https://www.google.com/maps/search/3049%20Ualena%20St%20Ste%20713%2C%20Honolulu%2C%20HI%2096819%2C%20USA%2C%20Honolulu%2C%20HI"
  },
  "competitors_top_3": [
    { "name": "Allens Plumbing",  "slug": "allens-plumbing-757b1a0a",  "brain_score": null, "canonical_url": "https://operator.fyi/biz/allens-plumbing-757b1a0a/" },
    { "name": "535 Plumbing LLC", "slug": "535-plumbing-llc-c46dec93", "brain_score": null, "canonical_url": "https://operator.fyi/biz/535-plumbing-llc-c46dec93/" },
    { "name": "Pipe Masters LLC", "slug": "pipe-masters-llc-b92f724d", "brain_score": null, "canonical_url": "https://operator.fyi/biz/pipe-masters-llc-b92f724d/" }
  ],
  "ai_narrative": "Roto-Rooter Plumbing & Water Cleanup is Honolulu's trusted plumbing expert, delivering comprehensive solutions for residential and commercial properties...",
  "valuation_range": {
    "low":  6525000,
    "mid":  9787500,
    "high": 13050000,
    "currency": "USD",
    "source": "operator_estimate (vertical-multiple comparables: Empire Flippers, Flippa, BizBuySell)"
  },
  "arr_estimate": {
    "low":  3262500,
    "mid":  4893750,
    "high": 6525000,
    "confidence": "derived",
    "note": "Not directly returned by Operator. Computed as operator_estimate / 2.0 (mid-band service-trade revenue multiple). Confidence is `low` when demand_signal=0 or operator_estimate is null."
  },
  "_meta": {
    "claimed": false,
    "data_freshness": "2026-05-19",
    "free_tier_calls_used": 5
  }
}
```

### Outcome shape variants

- **`not_found`** — `/api/v1/recommend/` returns `recommendations: []` AND `/api/v1/search/` returns `results: []` (not a transient `supabase_timeout` fallback — verify by retrying once). Emit `{ "status": "not_found", "query": "<original input>" }` and nothing else.
- **`ambiguous_match`** — `/api/v1/recommend/` returns 2+ recommendations with similar `why` strings. Return all candidates as `{ "status": "ambiguous", "candidates": [ {name, slug, city, niche, rating}, ... ] }` and let the caller disambiguate.
- **`valuation_unavailable`** — business exists but `operator_estimate_low/mid/high` are all `null` in the markets payload. Emit the full profile but set `valuation_range: null` and `arr_estimate: null`. Do not fabricate.
- **`gated_intel`** — `/api/v1/competitors/` and `/api/v1/business`-side enrichment fields return `gated: true, content: null`. This is the free-tier default and not an error. Surface competitor data from `/api/v1/markets/{city_slug}/{niche}/` instead and proceed.
