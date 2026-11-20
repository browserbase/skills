---
name: firebox-eu-firebox-gift-recommender-wxeg65
title: Firebox Personalised Gift Recommender
description: >-
  Recommend Firebox.eu products for a recipient profile (interests, budget,
  occasion, recipient role). Uses the storefront's Algolia index for
  facet-filtered scoring (product_tags, categories.level1, gift_gender,
  price.EUR.default, personalizable) and returns ranked picks with title, price,
  url, and a rationale grounded in matched facets. Read-only.
website: firebox.eu
category: shopping
tags:
  - shopping
  - gifts
  - recommendation
  - algolia
  - personalisation
source: 'browserbase: agent-runtime 2026-05-20'
updated: '2026-05-20'
recommended_method: api
alternative_methods:
  - method: api
    rationale: >-
      The Algolia POST /query endpoint backing Firebox returns rich per-product
      metadata (product_tags, categories.level0..3, gift_gender, personalizable,
      price.EUR.default) that is exactly the signal needed for profile-based
      scoring. The per-session secured API key is extractable from
      window.algoliaConfig or by regex on the homepage HTML — no auth, no
      browser required once the key is in hand. ~3-6 themed queries × <500ms
      each.
  - method: fetch
    rationale: >-
      Curated category pages (/gifts-for-dad, /60th-birthday-gifts, /wine-gifts,
      etc.) are server-rendered, so `browse cloud fetch <url>` returns enough
      HTML to scrape title + slug + price without a browser. Lacks the
      product_tags / gift_gender / personalizable facets, so scoring degrades to
      title-keyword matching.
  - method: browser
    rationale: >-
      Only needed when neither outbound DNS to *-dsn.algolia.net works nor bare
      HTML fetch of category pages is sufficient. /catalogsearch/result/?q=… is
      fully client-rendered by Algolia JS and requires a real session; `browse
      cloud fetch` on those URLs returns <5 product cards. Most expensive path.
verified: false
proxies: false
---
# Firebox Personalised Gift Recommender

## Purpose

Given a recipient profile — interests (free text), budget (min/max EUR), occasion (e.g. "60th birthday", "wedding", "Christmas"), and optionally recipient role ("dad", "girlfriend", "mum") and gender — return a ranked list of Firebox products that fit the profile. Each pick comes back with `title`, `price_eur`, `url`, and a `rationale` explaining which signals (occasion category, recipient category, interest tag, price band, personalisable flag) caused it to rank.

The skill is **read-only** — never adds to cart, never posts to wishlist, never hits checkout. Firebox's catalog is small (~715 active products on the EU storefront) and is fully indexed in Algolia, so a single recommendation pass typically issues 3–6 themed queries and returns 5–10 picks.

## When to Use

- "Find me a gift for my dad's 60th birthday, he loves wine and BBQs, budget €30–60."
- "Wedding gift for a couple who's into cosy nights in, under €50."
- "Last-minute Christmas Secret Santa for a coworker — quirky / funny, ~€15."
- Any flow where you have a recipient sketch and need 5–10 themed candidate gifts with rationales.
- Use a **different** skill if the user already knows the exact product name (that's just product lookup, not recommendation).

## Workflow

The optimal path is the **Algolia POST API** that the Firebox storefront uses internally. Firebox runs on Magento + the official `algolia/algoliasearch-magento-2` extension; the storefront exposes a per-session secured Algolia API key in `window.algoliaConfig.apiKey` (also reachable by regex on the homepage HTML — no JS needed). Hitting the public Algolia DSN with that key returns rich JSON: name, url, `price.EUR.default`, `categories.level0..3`, `product_tags`, `gift_gender`, `personalizable`, `objectID`. That metadata is what lets you score against the profile cheaply.

The browser-rendered `/catalogsearch/result/?q=…` UI is the fallback when you can't run JSON-over-HTTPS (e.g. no DNS to `*-dsn.algolia.net`). Bare `browse cloud fetch` on a category slug (`/gifts-for-dad`, `/wine-gifts`) also works — Firebox SSRs category pages — but search-result pages are client-rendered by Algolia and require a real browser.

### 1. Extract a fresh Algolia API key

The key rotates roughly every 24h (the base64 payload encodes `validUntil=<unix-ts>`). **Do not hardcode it.** Pull it from the homepage HTML — no browser, no proxy, no stealth required:

```bash
HTML=$(browse cloud fetch "https://firebox.eu/" --output /tmp/firebox-home.html && cat /tmp/firebox-home.html)
APP_ID=$(echo "$HTML" | grep -oE '"applicationId":"[^"]+"' | head -1 | cut -d'"' -f4)
INDEX=$(echo "$HTML"  | grep -oE '"indexName":"[^"]+"'    | head -1 | cut -d'"' -f4)
API_KEY=$(echo "$HTML" | grep -oE '"apiKey":"[A-Za-z0-9=+/]+"' | head -1 | cut -d'"' -f4)
# APP_ID    : XNJ6P9R22S  (stable)
# INDEX     : LIVE_fireboxeu  (stable, base — append "_products" for the search index)
# API_KEY   : <base64, rotates ~daily>
```

Sanity-check by base64-decoding the key: it should end in `&validUntil=<epoch>` greater than `date +%s`. If not, refetch.

### 2. Generate themed queries from the profile

This is the LLM step. Map the profile to a small set of disjoint Algolia queries that each hit a different facet axis. Don't lean on the free-text `query` field — Firebox's Algolia ranking is biased toward popularity, so `query=wine` against personalised gifts surfaces top-selling bathrobes and blankets above actual wine items. Use **facets** as the primary filter and reserve `query` for very specific terms (brand names, fandoms like "Harry Potter"/"Star Wars", "aperol"/"gin").

Mapping rules (verified against the live facet enumeration):

| Profile axis | Algolia field | Example values |
|---|---|---|
| **Recipient role** | `categories.level1` | `Recipient /// Gifts for Dad`, `… for Mum`, `… for Him`, `… for Her`, `… for Friends`, `… for Couples`, `… for Kids` |
| **Occasion** | `categories.level1` | `Occasion /// Wedding Gifts`, `… Anniversary Gifts`, `… Valentines Day Gifts`, `… Fathers Day Gifts`, `… Easter Gifts`, `… Housewarming Gifts`, `… Leaving Gifts` |
| **Birthday milestone** | `categories.level1` | `Birthday Gifts /// 30th Birthday Gifts`, `… 60th Birthday Gifts`, `… Birthday Gifts for Him`, `… for Her` |
| **Christmas** | `categories.level1` | `Christmas Gifts /// Christmas Gifts for Dad`, `… for Boyfriends`, `… Stocking Fillers`, `… Secret Santa Gifts`, `… Personalised Christmas Gifts` |
| **Interest** | `product_tags` | `Wine`, `Beer`, `Gin`, `BBQs`, `Cooking`, `Boozing`, `Cosy`, `Humour`, `Romance`, `Self-Care`, `Office`, `Geeky Gear`, `Gaming`, `Sport & Fitness`, `Gardening`, `Music`, `Film & TV`, `Harry Potter`, `Star Wars`, `Disney`, `Animal`, `Outdoors`, `Party Games`, `Kitsch`, `NSFW`, `Dad who has everything` |
| **Gender preference** | `gift_gender` | `Male`, `Female`, `Both` |
| **Personalisable** | `personalizable` | `Yes`, `No` |
| **Budget** | `filters` | `price.EUR.default >= 20 AND price.EUR.default <= 50` |

**LLM prompt template** (paraphrased):

> "Given the recipient profile {profile}, output 3–6 themed Algolia query specs. Each spec is `{theme, query, facetFilters, mustHaveTag?}`. Theme names should be short (e.g. `wine-personalised`, `bbq-dad`, `60th-milestone`, `cosy-romance`). Use `query=` only for brand/fandom names; otherwise leave it empty and rely on `facetFilters`. Always include the recipient and occasion facets if known. Spread tags across queries — do NOT put 5 tags in one disjunctive facetFilter group."

### 3. Issue one Algolia POST per theme

```bash
APP_HOST="$(echo "$APP_ID" | tr '[:upper:]' '[:lower:]')-dsn.algolia.net"
URL="https://${APP_HOST}/1/indexes/${INDEX}_products/query"

# Example theme: "wine-personalised" for a dad, €30-60, must be personalisable
PARAMS=$(jq -n --arg q "" '{
  query: $q,
  hitsPerPage: 8,
  attributesToRetrieve: ["name","url","price","product_tags","gift_gender","personalizable","categories","objectID"],
  filters: "price.EUR.default >= 30 AND price.EUR.default <= 60",
  facetFilters: [
    ["categories.level1:Recipient /// Gifts for Dad"],
    ["product_tags:Wine","product_tags:Boozing"],
    ["personalizable:Yes"]
  ]
}' | jq -c '{params: (. | to_entries | map("\(.key)=\(.value|tojson|@uri)") | join("&"))}')

curl -fsS "$URL" \
  -H "X-Algolia-API-Key: $API_KEY" \
  -H "X-Algolia-Application-Id: $APP_ID" \
  -H "Content-Type: application/json" \
  -d "$PARAMS"
```

`facetFilters` is `[group1, group2, group3]` where groups are conjunctive (AND across groups) and arrays within a group are disjunctive (OR within group). Recipient OR occasion goes in its own group; interest tags go in another (OR'd); personalisable is its own conjunctive constraint.

**If running inside a Browserbase session instead** (e.g. host runtime has no outbound DNS to `*-dsn.algolia.net`), call the same endpoint via page-context fetch — the browser's network is unaffected:

```bash
SID=$(browse cloud sessions create --keep-alive | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const m=s.match(/\"id\"\\s*:\\s*\"([^\"]+)\"/);process.stdout.write(m?m[1]:'')})")
export BROWSE_SESSION="$SID"
browse open "https://firebox.eu/" --remote >/dev/null
browse wait load --remote >/dev/null
# Then read the key + POST from page context:
browse eval --remote 'fetch("https://" + window.algoliaConfig.applicationId.toLowerCase() + "-dsn.algolia.net/1/indexes/" + window.algoliaConfig.indexName + "_products/query", { method:"POST", headers:{ "X-Algolia-API-Key": window.algoliaConfig.apiKey, "X-Algolia-Application-Id": window.algoliaConfig.applicationId, "Content-Type":"application/json" }, body: JSON.stringify({ params: "query=&hitsPerPage=8&..." }) }).then(r=>r.json()).then(j=>JSON.stringify(j))'
```

A bare session (no `--verified`, no `--proxies`) is sufficient — Firebox's Cloudflare doesn't anti-bot the homepage or the Algolia traffic.

### 4. Score each hit against the profile

Per-hit scoring is the part you actually want from an LLM. A simple deterministic baseline that works well:

```
score = 0
score += 3 * (recipient-facet matched in categories.level1)
score += 3 * (occasion-facet matched in categories.level1)
score += 2 * |intersection(profile.interests, hit.product_tags)|
score += 1 * (price within budget)
score += 1 * (personalizable == profile.wantsPersonalised)
score -= 5 * (gift_gender ⊥ profile.gender, e.g. Male-only product to Female recipient)
```

Then dedupe across themes by `objectID`, sort by score, and return top N (typically 5–10).

The `rationale` per pick is straightforward to assemble from the matched facets — e.g. *"60th birthday + Gifts for Dad + product tag Wine + €39.99 within budget + personalisable."* The LLM can polish the wording, but the rationale should be grounded in the actual matched facets, not invented.

### 5. Emit the output

See `## Expected Output` below.

### Browser fallback (when JSON-over-HTTPS is not possible)

If no path to `*-dsn.algolia.net` exists from the calling runtime AND no Browserbase session is available, two thinner fallbacks remain:

1. **Bare HTML fetch of curated category pages** (no browser, no JS). Firebox SSRs `/gifts-for-{dad,mum,him,her,kids,couples,friends}`, `/{30th,40th,50th,60th}-birthday-gifts`, `/{wedding,valentines-day,fathers-day,christmas,hen-and-stag,wine,aperol,beer,office,funny,bath-beauty,kitchen-accessories,film-tv}-gifts`, etc. Pull with `browse cloud fetch <url>` and parse anchors of the form `<a … href="https://firebox.eu/{slug}" aria-label="{title}">`. Use `?product_list_order=price&product_list_dir=asc` (or `desc`) to sort — verified working despite robots.txt disallowing those params for crawlers.
2. **Browser-rendered `/catalogsearch/result/?q={q}`** — only works inside a real session; `browse cloud fetch` on the search URL returns 2 product cards (vs. the 12+ that render client-side). Selector: `.product-item` (60+ per page on category landings, ~12 per page on search). Title is in the anchor's `aria-label` attribute or the `.item-name` div; price is in `[data-price-amount]` (numeric) or the `.price` text. Pagination: `&page=N`.

These fallbacks lose the `product_tags` / `gift_gender` / `personalizable` metadata, which means scoring degrades to "does the title contain interest keywords" — usable, but markedly worse than the Algolia path.

## Site-Specific Gotchas

- **The Algolia API key is per-session and rotates.** Decoded payload format: `<64-char hex>tagFilters=&validUntil=<unix-ts>`. Typical TTL is ~24h. Extract it fresh on each run — caching across days will 403 with `"Validity period expired"`. Source of truth is `window.algoliaConfig.apiKey` (live page) or a regex on the homepage HTML (`"apiKey":"[^"]+"`).
- **The secured key only allows `POST /query` and `POST /queries`.** GET `/browse` returns `403 Method not allowed with this API key`. POSTs with `X-Algolia-API-Key` + `X-Algolia-Application-Id` headers and a JSON `{params: "<urlencoded>"}` body are the only working shape.
- **`query=<text>` is a popularity-skewed match, NOT a strict filter.** A `query=wine` search returns ~96 hits where the top results are popular blankets and bathrobes that happen to be tagged with related interests; literal wine glasses appear further down. Always combine `query` with a `facetFilters` group that pins the relevant `product_tags` / `categories.level1`, or skip `query` entirely and filter purely by facets.
- **`product_tags` has whitespace-dirty values.** Some tag values in the underlying data have trailing spaces (`"Animal "`, `"Outdoors "`, `"Cake Toppers "`). The Algolia facet enumeration trims them, but `_highlightResult` and raw `product_tags` arrays on hits sometimes preserve the trailing space. Match case-insensitively and `.trim()` both sides. There is also a literal `"false"` tag value (6 products) — almost certainly a data-entry bug; filter it out.
- **`gift_gender` is multi-valued.** A product can carry `["Male","Female","Both"]` simultaneously; "Both" appears alongside one or both of the others. Treat presence of "Both" (or both "Male" and "Female") as gender-neutral. Don't filter Female recipients against `gift_gender:Male` strictly without also accepting "Both".
- **`price.EUR.default` of 0.00 on configurable products.** Personalised products with a `from €X` price (e.g. variants by size) often appear in the index with `price.EUR.default = 0.00`. The "real" lower bound shows up in the page HTML as `from €12.99`. When filtering by budget, treat 0.00 as missing and either skip those items or fetch the product page to get the actual `from` price. Verified in iter-1: `Personalised Poster with 8 Photos and Text` shows `€0.00` in the listing's `data-price-amount` while the wishlist onclick reveals a true price of `€99.95`.
- **`categories.level1` strings use a literal triple-slash separator (` /// `).** Match exact strings — `categories.level1:Recipient /// Gifts for Dad` is the working shape. The categories enumeration shows `Birthday Gifts /// 30th Birthday Gifts` and so on; copy these as literals.
- **Robots.txt disallows `?product_list_order=`, `?product_list_dir=`, `?gift_gender=`, etc.** Disallow means crawlers shouldn't index those URLs — the params still work for live navigation. We confirmed sort-by-price ascending works on `/gifts-for-dad?product_list_order=price&product_list_dir=asc`.
- **No anti-bot wall on the homepage or Algolia endpoint.** A bare `browse cloud sessions create` (no `--verified`, no `--proxies`) and a bare `browse cloud fetch https://firebox.eu/` both succeed; Cloudflare passes through. Save your stealth/proxy budget — this site doesn't need it.
- **Gift-finder page is not an interactive quiz API.** `/gift-finder` is just a curated landing page with featured products; it does NOT expose a recipient-profile form whose submission returns a tailored set. Treat it purely as marketing copy. The recommendation logic lives entirely in your LLM + Algolia.
- **The catalog is small (~715 products).** That sets expectations: very specific interests (e.g. "vintage typewriter parts") will draw zero hits even via raw `query`. Always fan out across 3–6 themes rather than gambling on one specific query, and gracefully degrade to broader facets (interest-only, then recipient-only, then the bestsellers fallback at `/best-sellers`).
- **Algolia DSN host is not always resolvable from sandbox runtimes.** `xnj6p9r22s-dsn.algolia.net` failed DNS in this sandbox's bare-curl context but resolved fine from the Browserbase session's page-context fetch. If you get `Could not resolve host`, switch to the page-context fetch pattern in step 3.
- **Don't waste time on Magento REST/GraphQL endpoints.** `/rest/V1/products/…` and `/graphql` exist but require a customer or admin token; the public guest token only returns 401 on most product queries, and what does return omits the product_tags/gift_gender facets that make this skill worth doing. Algolia is the source of structured product data.
- **`{indexName}_products` is the searchable index, not `{indexName}` itself.** `window.algoliaConfig.indexName` returns `LIVE_fireboxeu` — you must append `_products` to get the searchable products index. Sort replicas: `LIVE_fireboxeu_products_price_default_asc`, `…_price_default_desc`, `…_created_at_desc`.

## Expected Output

```json
{
  "profile": {
    "recipient": "dad",
    "occasion": "60th birthday",
    "interests": ["wine", "bbq"],
    "budget_eur": { "min": 30, "max": 60 },
    "personalised_preferred": true,
    "gender": "Male"
  },
  "themes_searched": [
    { "theme": "wine-personalised-dad",  "facetFilters": [["categories.level1:Recipient /// Gifts for Dad"], ["product_tags:Wine","product_tags:Boozing"]], "hits": 12 },
    { "theme": "bbq-dad",                "facetFilters": [["categories.level1:Recipient /// Gifts for Dad"], ["product_tags:BBQs","product_tags:Cooking"]], "hits": 4 },
    { "theme": "60th-milestone",         "facetFilters": [["categories.level1:Birthday Gifts /// 60th Birthday Gifts"]], "hits": 258 },
    { "theme": "dad-who-has-everything", "facetFilters": [["product_tags:Dad who has everything"]], "hits": 100 }
  ],
  "picks": [
    {
      "title": "Personalised Grill Caddy",
      "price_eur": 39.99,
      "url": "https://firebox.eu/personalised-grill-caddy",
      "object_id": "78867",
      "matched_signals": {
        "recipient": "Gifts for Dad",
        "occasion": null,
        "interests": ["BBQs", "Cooking", "Dad who has everything"],
        "personalizable": true,
        "gender": "Male/Both"
      },
      "rationale": "BBQ-themed personalised caddy directly tagged BBQs + Cooking + 'Dad who has everything'; sits in the €30–60 band; personalisable as requested.",
      "score": 11
    },
    {
      "title": "Personalised Bottle Opener with Message",
      "price_eur": 14.99,
      "url": "https://firebox.eu/bottle-opener-with-personalised-message",
      "object_id": "…",
      "matched_signals": {
        "recipient": "Gifts for Dad",
        "occasion": "60th Birthday Gifts",
        "interests": ["Boozing", "Beer"],
        "personalizable": true,
        "gender": "Male/Both"
      },
      "rationale": "Boozing-tagged personalised opener that hits both the recipient and 60th-birthday facets; under budget so flag as 'low spend' alternative.",
      "score": 9
    }
  ],
  "fallback_used": null,
  "notes": "Filtered out 1 product with price.EUR.default = 0.00 (configurable variant placeholder)."
}
```

Outcome variants:

```json
// No hits matched any theme (very narrow profile / niche interest)
{ "picks": [], "themes_searched": [...], "fallback_used": "broadened to bestsellers", "notes": "Profile interests {…} drew 0 hits in any theme; degraded to /best-sellers landing page top 5." }

// Algolia DSN unreachable, used browser fallback
{ "picks": [...], "fallback_used": "browser:/catalogsearch/result/?q=...", "notes": "API DNS resolution failed from runtime; fell back to browser-rendered search. product_tags / gift_gender not available — scoring used title keyword match only." }
```
