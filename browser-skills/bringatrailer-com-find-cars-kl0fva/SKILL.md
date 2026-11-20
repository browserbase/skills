---
name: bringatrailer-com-find-cars-kl0fva
title: Find Below-Market Vintage Cars on Bring a Trailer
description: >-
  Scan Bring a Trailer's live auctions for collectible car models whose current
  bid is below the model's historical BaT sale median, returning each candidate
  with market comps, days left, and reserve status. Read-only.
website: bringatrailer.com
category: automotive
tags:
  - automotive
  - auctions
  - collector-cars
  - bring-a-trailer
  - below-market
  - price-comps
source: 'browserbase: agent-runtime 2026-07-07'
updated: '2026-07-07'
recommended_method: fetch
alternative_methods:
  - method: api
    rationale: >-
      The autocomplete REST endpoint
      (/wp-json/bringatrailer/1.0/data/autocomplete?term=) resolves a model name
      to its BaT model-page URL and is used as a sub-step. There is no public
      REST endpoint that returns the full current-auction feed or per-model sale
      history — those live only as inline JSON on the /auctions/ and model
      pages, so the primary method is a plain HTTP fetch + parse.
  - method: browser
    rationale: >-
      A remote browser can read the same data from
      window.auctionsCurrentInitialData / window.auctionsCompletedInitialData
      via `browse eval`, but it is ~100x slower and costlier than fetching the
      HTML and parsing the inline blob. Use only if Cloudflare ever starts
      challenging plain GETs.
verified: false
proxies: false
---
# Find Below-Market Vintage Cars on Bring a Trailer

## Purpose

Scan Bring a Trailer's live auctions for a set of collectible car models and surface
the ones whose **current bid is below that model's historical BaT sale median**,
along with the comps that justify the call. For each model it returns the market
band (p25 / median / p75 from past BaT sales), every currently-running auction that
matches the model, and per-listing signals — current bid, percent-of-median, days
left, and no-reserve flag — so the caller can judge whether a low number is a real
bargain or just an auction that hasn't been bid up yet. **Read-only: it never bids,
watches, comments, or logs in.**

## When to Use

- "Find first-gen Broncos / Datsun 240Zs / Pagoda SLs currently going below their usual BaT price."
- A collector or dealer monitoring live auctions for buying opportunities across a watchlist of models.
- Building an alerting agent that flags undervalued lots ending soon.
- Any time you'd otherwise hand-scrape BaT auction cards — the inline JSON feed is faster, complete, and structurally reliable.

## Workflow

BaT is a WordPress site that embeds everything you need as inline `<script>` JSON,
and **both the live-auction page and each model page return that JSON to a plain
HTTP GET** — no login, no cookies, no anti-bot stealth. The optimal method is
therefore `fetch` + parse, not scripted browsing. `browse cloud fetch <url>` returns
a JSON envelope `{statusCode, headers, contentType, encoding, content}`; the HTML is
in `.content`. `--proxies` is **not** required (bare GET returns 200 with the full
blob); add it only if Cloudflare ever challenges you.

1. **Pull the live-auction feed (one fetch).**
   `GET https://bringatrailer.com/auctions/` → in `.content`, find the marker
   `var auctionsCurrentInitialData = {` and brace-match the object. `.items` is the
   complete live set (~960 lots). Each item has: `title`, `current_bid` (integer),
   `current_bid_formatted`, `timestamp_end` (epoch **seconds**), `noreserve`, `year`,
   `url`, and — critically — **`keyword_pages`**: an array of model-page IDs that is
   the precise join key back to a model.

2. **Resolve each target to its BaT model page.** If you don't know the slug, hit the
   autocomplete endpoint:
   `GET https://bringatrailer.com/wp-json/bringatrailer/1.0/data/autocomplete?term=<urlenc-name>`
   (the param is `term` — `q`/`query`/`keyword` all return HTTP 400). `.content` is
   JSON whose `items[]` give `{title, url}`, e.g. `term=pagoda` →
   `mercedes-benz/w113`, `term=365` → four Ferrari 365 variants.

3. **Get the model's market price + join IDs.**
   `GET https://bringatrailer.com/{make}/{model}/` → extract
   `var auctionsCompletedInitialData = {`.
   - **Market band:** prefer `stats.sold[].amount` — the model's *entire* BaT sale
     history in one array — and take the median (and p25/p75). Filter amounts
     `>= $3000` to drop parts/wheels/seats lots that share the model tag.
   - **Join key:** `base_filter.keyword_pages` — the model's page ID(s).

4. **Match live auctions to each target.** A live item belongs to a target **iff its
   `keyword_pages` intersects the model page's `base_filter.keyword_pages`.** This is
   far more reliable than title/keyword regex.

5. **Flag + rank.** Mark matched live lots with `current_bid < median` as
   below-market candidates. Compute `pct_of_median = current_bid / median * 100` and
   `days_left = (timestamp_end*1000 - now) / 86400000`. **Always surface `days_left`
   and `no_reserve`** — a bid at 20% of median with 6 days left is not a bargain, it
   just hasn't been bid up. The strongest signals are lots **ending within ~1 day**
   still well under median, and no-reserve lots (guaranteed to sell).

### Resolving broad "family" models (generation drill-down)

Some names map to a *family* page with `stats_enabled:false` and an **empty `stats`
object** — you cannot get a market price from it directly. These include Camaro,
Bronco, Porsche 356, Porsche 911 GT3, and Mercedes Geländewagen. On the family page,
each generation is listed in a `data-items="[...]"` HTML attribute (HTML-entity
encoded — decode `&quot;`→`"`, `&#8211;`→`-`, `&amp;`→`&`) as `{id, title, url}`.
Pick the generation matching the requested era and fetch *that* page:
- First-gen Camaro (1967-1969) → `chevrolet/camaro-1967-1969`
- First-gen Bronco (1966-1977) → `ford/bronco-u13-u14-u15-1966-1977`
- First-gen G-Wagen (W460) → `mercedes-benz/w460-gelandewagen`
- Porsche 356 → per-variant pages (`356a`, `356b`, `356c`, `356-speedster`, …)
- 911 GT3 → per-generation pages (`991-gt3`, `992-gt3`, `996-gt3`, `997-gt3`)

### Browser fallback

If plain GETs ever get Cloudflare-challenged: open a remote session
(`browse open <url> --remote`), let the page render, then read the same objects with
`browse eval 'JSON.stringify(window.auctionsCurrentInitialData)'` and
`window.auctionsCompletedInitialData`. Same fields, ~100x the cost — avoid unless forced.

## Site-Specific Gotchas

- **`browse cloud fetch` returns an envelope, not raw HTML.** Parse the outer JSON and
  read the page from `.content`. Inside `.content` the inline blobs use normal
  (unescaped) quotes — brace-match from the first `{` after `var NAME = `.
- **`stats.sold` is served intermittently (edge-cache variance).** The same model URL
  may return a full `stats.sold` array on one fetch and omit it (empty `stats`) on the
  next — observed on `mercedes-benz/w113` (absent 3× then 569 sales on the 4th) and
  `ford/bronco-u13-…` (1234 sales, then absent). **Retry the fetch up to ~6× until
  `stats.sold` is present.** If it never appears, fall back to the 24 `items[]` on
  completed page 1 (recent comps, lower confidence) and label the source.
- **Family pages have `stats_enabled:false` and empty `stats`.** Don't try to price
  Camaro/Bronco/356/911-GT3/Geländewagen from the family page — drill into a
  generation page (see above). `items_total` is populated but the money data is not.
- **`keyword_pages` join pulls in parts & projects.** Chassis, seats, tube-frame
  race cars, and engine-swap projects share a model's `keyword_pages`. The `>= $3000`
  floor removes most parts, but inspect `title` before calling something a
  "below-market car" (e.g. a "$101 Camaro-bodied tube-frame track car" or a "$39,500
  chassis for Bronco" are not cars).
- **Trim levels have no dedicated page.** "911 GT3 Touring" is a trim, not a model —
  use the generation page (`porsche/992-gt3`) and filter `title` by `/touring/i`.
  Same pattern for other sub-trims.
- **Ambiguous model names resolve to several pages.** `term=365` returns 365 GT 2+2,
  365 GTC, 365 GTC/4, and 365 GT4/400/412 — pick the intended one or price each.
- **Thin markets → low-confidence median.** Ferrari 365 GTC/4 (~11 sales) and INEOS
  Grenadier (~24 sales) have too few comps for a stable median; report `n` so the
  caller can weight it.
- **`current_bid` mid-auction ≠ final price.** BaT auctions get most of their action
  in the final minutes. A live bid far below median with days left is expected, not a
  deal. Gate "below-market" confidence on `days_left` (and prefer no-reserve lots).
- **`timestamp_end` is epoch seconds**, and `current_bid` on *completed* items is the
  final hammer price (`sold_text` distinguishes "Sold for $X" from a no-sale/reserve-
  not-met listing where `sold_text` is empty).
- **Autocomplete param is `term`.** `?term=` → 200; `?q=`/`?query=`/`?keyword=` → 400.
- **No anti-bot wall observed.** Plain GET (no proxies, no stealth) returned HTTP 200
  with the full inline feed across every page tested. `--proxies` is an optional
  safety net, not a requirement.

## Expected Output

One object; `results[]` has one entry per target model. Live auctions with
`below_market: true` are the candidates; use `days_left` + `no_reserve` to rank
confidence.

```json
{
  "success": true,
  "generated": "2026-07-07T23:00:00Z",
  "live_total": 960,
  "results": [
    {
      "target": "Datsun 240Z",
      "model_page": "https://bringatrailer.com/datsun/240z/",
      "market": { "n": 553, "source": "stats.sold(full history)", "p25": 17500, "median": 25000, "p75": 36500 },
      "live_auctions": [
        {
          "title": "1972 Datsun 240Z 4-Speed",
          "current_bid": 22500,
          "ends": "2026-07-08",
          "days_left": 0.8,
          "no_reserve": false,
          "pct_of_median": 90,
          "below_market": true,
          "url": "https://bringatrailer.com/listing/1972-datsun-240z-.../"
        }
      ]
    },
    {
      "target": "Mercedes-Benz W113 SL (Pagoda)",
      "model_page": "https://bringatrailer.com/mercedes-benz/w113/",
      "market": { "n": 555, "source": "stats.sold(full history)", "p25": 49900, "median": 66500, "p75": 88500 },
      "live_auctions": [
        {
          "title": "30-Years-Family-Owned 1970 Mercedes-Benz 280SL 4-Speed",
          "current_bid": 40000,
          "ends": "2026-07-11",
          "days_left": 3.8,
          "no_reserve": true,
          "pct_of_median": 60,
          "below_market": true,
          "url": "https://bringatrailer.com/listing/..."
        }
      ]
    },
    {
      "target": "First-gen Chevrolet Camaro (1967-1969)",
      "model_page": "https://bringatrailer.com/chevrolet/camaro-1967-1969/",
      "market": { "n": 876, "source": "stats.sold(full history)", "p25": 40000, "median": 55000, "p75": 77500 },
      "live_auctions": [
        {
          "title": "1967 Chevrolet Camaro RS/SS Coupe L35 396/325 4-Speed",
          "current_bid": 43150,
          "ends": "2026-07-13",
          "days_left": 5.8,
          "no_reserve": false,
          "pct_of_median": 78,
          "below_market": true,
          "url": "https://bringatrailer.com/listing/..."
        }
      ]
    }
  ],
  "error_reasoning": null
}
```

Model with no live auctions returns an empty `live_auctions: []` (e.g. INEOS
Grenadier and Ferrari 365 GTC/4 had zero live lots in the validation run). On total
failure: `{ "success": false, "results": [], "error_reasoning": "<what broke>" }`.
