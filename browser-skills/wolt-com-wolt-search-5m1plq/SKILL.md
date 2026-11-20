---
name: wolt-com-wolt-search-5m1plq
title: Wolt Restaurant Search
description: >-
  Search Wolt for restaurants in a given city by cuisine, dish, or restaurant
  name and return a ranked list with name, slug, URL, cuisine tagline, delivery
  fee, delivery time, price tier, and customer rating. Read-only.
website: wolt.com
category: food-delivery
tags:
  - food-delivery
  - restaurants
  - search
  - wolt
  - read-only
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      Wolt's public REST surface (restaurant-api.wolt.com/v1/*,
      consumer-api.wolt.com/v1/*) returns 410 Gone with a 'please update the
      app' body, and v2/v3 routes are 404. The current internal traffic goes
      through gatekeeper.wolt.com/v1/storefront and /v1/consumer but route names
      are not enumerable from the SSR HTML and require SPA-minted auth tokens.
      Confirmed dead-end 2026-05-19 — do not retry.
verified: true
proxies: true
---
# Wolt Restaurant Search

## Purpose

Given a city (Wolt city slug + country code) and a free-text query — typically a cuisine ("sushi", "ramen"), dish ("pizza"), or restaurant name — return the ranked list of restaurants that Wolt surfaces for that query on its consumer site, with the name, slug, canonical URL, cuisine tagline, delivery fee, estimated delivery time range, price tier, and customer rating. Read-only — never opens a cart, applies a coupon, or places an order.

## When to Use

- "Find good sushi restaurants in Tel Aviv" / "What ramen places does Wolt deliver in Helsinki?" — agent needs a ranked list of restaurants matching a cuisine or dish in a specific Wolt-served city.
- Building a comparison table across multiple cuisines (search the same city N times) or across multiple cities (same query, N cities).
- Pre-checking whether a named restaurant ("Ze Sushi", "Kansai Sushi") is on Wolt before suggesting it to a user.
- Anywhere you'd otherwise click the magnifying-glass icon in the Wolt UI and type a query. The skill replaces the entire interactive flow with a single URL fetch.

**Do not use this skill** for menu/dish-level lookup inside a single restaurant (that requires opening the restaurant page and parsing its menu), or for placing orders.

## Workflow

Wolt's consumer site exposes a clean URL pattern that performs a search inside a known city without requiring login, delivery-address capture, or cookie state:

```
https://wolt.com/en/{country_code}/{city_slug}/search?q={url_encoded_query}
```

The page is client-rendered (Next.js, no server-side data in the initial HTML), so a headless browser must execute JavaScript before the restaurant list appears. The public REST APIs that the legacy mobile clients used (`restaurant-api.wolt.com/v1/pages/search`, `consumer-api.wolt.com/v1/pages/search`) now return `410 Gone` with a "please update the app" body, and newer `gatekeeper.wolt.com/v1/*` route names are not publicly enumerable — **don't waste turns on direct REST**. Drive the page with `browse` against a Browserbase session with stealth + residential proxy enabled.

1. **Resolve the city slug.** Wolt uses ISO-3 country codes plus an English-kebab-case city slug. Common Israeli slugs: `tel-aviv`, `jerusalem`, `haifa`, `beer-sheva`, `eilat`, `netanya`, `ramat-gan`. Common patterns elsewhere: `helsinki`, `stockholm`, `berlin`, `prague`, `warsaw`, `athens`, `budapest`, `zagreb`, `tbilisi`, `tokyo`. Validate by opening `https://wolt.com/en/{country_code}/{city_slug}` first if uncertain — invalid slugs render a 404-style landing page.

2. **Create a stealth + residential-proxy session** (Wolt sits behind Cloudflare/Akamai-class fingerprinting; a bare session intermittently gets blocked, especially on rapid follow-up fetches):
   ```bash
   sid=$(browse cloud sessions create --keep-alive --verified --proxies \
     | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
   export BROWSE_SESSION="$sid"
   ```

3. **Open the search URL and wait for the client-side render:**
   ```bash
   browse open "https://wolt.com/en/isr/tel-aviv/search?q=sushi" --remote
   browse wait timeout 2500 --remote
   ```
   The `wait timeout 2500` is required — the restaurant grid is hydrated 1.5–2.5 s after `load` fires, and snapshotting earlier yields an empty `## Restaurants and stores` section.

4. **Detect the no-results branch first.** If the rendered markdown contains the literal heading `# No results found`, emit the empty-result outcome shape and skip parsing. Wolt surfaces this when the query has zero matches in the city; the rest of the page is just app-download promos and footer links.

5. **Extract structured results from `browse get markdown body`.** Each restaurant renders as a repeating block in this exact order:
   ```
   * [![](image_url)](/en/{cc}/{city}/restaurant/{slug})
   {badge}                                ← optional, e.g. "KOSHER", "Vegan friendly"
   {N}₪ delivery fee                      ← N is the delivery fee in local currency
   [{name}](/en/{cc}/{city}/restaurant/{slug})
   {tagline}                              ← cuisine description, e.g. "Asian Sushi Bar"
   {tagline}                              ← line duplicated (mobile/desktop variants in DOM)
   {min}-{max}                            ← delivery time range in minutes
   min
   ₪{min_order}.00$$$$                    ← min order in currency, followed by 1–4 $ price tier
   {rating}                               ← e.g. "8.4" on a 0–10 scale; OMITTED if too few reviews
   ```
   Parse heuristic: split the markdown on the regex `^\* \[!\[\]\(.+\)\]\((\/en\/[a-z]{3}\/[a-z0-9-]+\/restaurant\/[a-z0-9-]+)\)` to get one chunk per restaurant. Within each chunk:
   - **slug + canonical URL** — captured by the splitter. Canonical URL is `https://wolt.com{path}`.
   - **name** — first `[name](/en/.../restaurant/{same-slug})` markdown anchor in the chunk.
   - **delivery_fee_text** — match `(\d+)₪ delivery fee` (or `\d+\.\d+₪` for non-integer fees in EUR markets, where the currency symbol may be `€`).
   - **time_min` / `time_max`** — match `^(\d+)-(\d+)$` immediately followed by a `min` line.
   - **price_tier** — count `$` characters in the `₪…$$$$` line (1–4, where `$$$$` means top tier).
   - **rating** — last line of the chunk if it matches `^\d+(\.\d+)?$` and is in `[0, 10]`. Absent means "not enough reviews" — surface as `null`, not 0.
   - **tagline / cuisine** — the duplicated description line. De-duplicate.
   - **badges** — any non-empty line between the image anchor and the `₪ delivery fee` line (e.g. `KOSHER`).

6. **Default sort is "Recommended"** (Wolt's internal score, surfaced as a `Sorted byRecommended` widget at the top of the list). For "good" / "best" / "top-rated" intent, **re-sort client-side by `rating DESC`**, breaking ties by `delivery_time_max ASC` then `delivery_fee ASC`. Filter out entries with `rating == null` first if the user explicitly asked for "good" ratings — those are unrated rather than zero-rated.

7. **Release the session** when done:
   ```bash
   browse cloud sessions update "$sid" --status REQUEST_RELEASE
   ```

### Optional enrichment (per restaurant detail page)

If the caller needs full address, opening hours, or menu, navigate to `https://wolt.com{slug}` for each result. Same stealth/proxy session works. Detail pages render server-side enough that `browse get markdown body` after `wait timeout 2000` returns address + hours reliably. Each enrichment is ~1.5–3 s — budget accordingly when enriching >10 restaurants.

## Site-Specific Gotchas

- **`/search?q=` is the only working URL pattern.** Wolt redirects `/restaurants?q=sushi` to bare `/{city}?q=sushi` (drops the search context entirely — the query string survives in the URL but no search runs). Always use the explicit `/search` segment after the city slug.
- **Public REST APIs are dead.** `restaurant-api.wolt.com/v1/*` and `consumer-api.wolt.com/v1/*` return `410 Gone` with body `"We've updated the Wolt app! …"` (verified 2026-05-19 via residential-proxy fetch from US IPs). `restaurant-api.wolt.com/v2/*`, `restaurant-api.wolt.com/v3/*`, `consumer-api.wolt.com/v3/*` return `404 Not Found`. The current internal traffic goes through `gatekeeper.wolt.com/v1/storefront` and `gatekeeper.wolt.com/v1/consumer`, but the exact route names aren't enumerable from the SSR HTML and require auth tokens minted by the SPA on page load. Drive the browser; don't try to reverse-engineer the gateway.
- **SSR HTML carries no restaurant data.** `bb fetch https://wolt.com/en/isr/tel-aviv/search?q=sushi` returns `200 OK` with ~720 KB of HTML — and zero `/restaurant/{slug}` anchors in it. The grid is hydrated client-side from a gatekeeper XHR after JS executes. You must use a real headless browser; `browse cloud fetch` alone is insufficient.
- **City scoping is from the URL only.** No IP-based fallback, no cookie state, no "your last city" memory across sessions. If the city slug is wrong (e.g. `telaviv` without the hyphen), Wolt renders a generic landing page with the country's default city instead of a 404 — silently mis-scoping the search. Always validate the slug if the result count is suspicious (e.g. <5 results for a major cuisine in a city you know is well-served).
- **Anonymous searches return city-wide deliverable restaurants** ("TLV - Herzliya area" for Tel Aviv, displayed in the header). The full set returns; once a user sets a specific delivery address, the in-app search filters down to addresses that can be served. The skill operates anonymously by design, so results are a superset of what any individual address would see.
- **Rating absence ≠ rating zero.** Restaurants with <~20 reviews omit the trailing rating line entirely. Emit `rating: null`, not `0` — confusing the two will hide genuinely new highly-rated restaurants and inflate "1 star" filter results.
- **Default sort is "Recommended", not by rating.** Wolt's recommendation model blends popularity, sponsored placement, delivery distance, and rating. If the user said "good"/"best"/"top-rated", re-sort by rating client-side and break ties on delivery time + fee.
- **Currency symbol varies by country.** Israel uses `₪` (NIS), EUR markets show `€`, Nordics show `€` or local symbols. The delivery-fee regex needs to be currency-agnostic: `(\d+(?:[.,]\d+)?)\s*[₪€$kr£]\s*delivery fee` (and friends). Same for the min-order line in step 5 — the `$$$$` price-tier suffix is currency-independent (always literal `$`), but the leading minimum-order value is local.
- **The `$$$$` price tier is always 4 dollar signs literal, with 1–4 of them filled.** Don't parse as currency — count the `$` characters. (Wolt displays them as light/dark on the page; the markdown extractor returns them all as literal `$`.) Sometimes the line is `₪0.00$$$$` even though the displayed tier is 2/4 — the leading currency value is the min-order, not the price tier; do not double-count.
- **Tagline lines duplicate.** Each restaurant's cuisine description appears twice in the markdown back-to-back. This is a desktop+mobile dual render in the DOM, not a parse bug. De-duplicate.
- **Image proxy domain.** Restaurant photos resolve through `imageproxy.wolt.com/assets/{id}` or `imageproxy.wolt.com/mes-image/{uuid}/{uuid}`. Both are stable; either is safe to expose to downstream consumers.
- **A non-stealth session sometimes succeeds for the first fetch and then 403s on the next.** Wolt's fingerprinting tolerates one cold request but flags consistent headless traits on subsequent calls. Always use `--verified --proxies` from the start — switching mid-flow does not recover.
- **No formal rate limit observed, but** sustained >1 search/sec against the same session causes the page to render with delayed hydration (results appear 4–6 s after `load` instead of 1.5–2.5 s). Either bump the `wait timeout` to 6000 ms under load, or pace requests to ≤ 0.5/s. Verified during iter-1 with back-to-back Tel Aviv + Jerusalem queries.

## Expected Output

Three distinct outcome shapes.

### Results returned

```json
{
  "success": true,
  "city": { "country_code": "isr", "slug": "tel-aviv", "display_name": "TLV - Herzliya area" },
  "query": "sushi",
  "result_count": 50,
  "sorted_by": "recommended",
  "restaurants": [
    {
      "name": "Ze Sushi | Bazel",
      "slug": "ze-sushi-bazel",
      "url": "https://wolt.com/en/isr/tel-aviv/restaurant/ze-sushi-bazel",
      "image_url": "https://imageproxy.wolt.com/mes-image/9b0cc273-2d6f-4e2a-abb8-90bfd27a6fd9/af0cf33c-ad30-43b4-b08d-84107843f8db",
      "tagline": "Classic Japanese Sushi Since 2004",
      "badges": [],
      "delivery_fee": { "amount": 0, "currency": "ILS", "display": "0₪" },
      "delivery_time_min_minutes": 30,
      "delivery_time_max_minutes": 40,
      "min_order": { "amount": 0, "currency": "ILS", "display": "₪0.00" },
      "price_tier": 2,
      "rating": 8.0
    },
    {
      "name": "Kansai Sushi | Tel Aviv",
      "slug": "kansai-sushi",
      "url": "https://wolt.com/en/isr/tel-aviv/restaurant/kansai-sushi",
      "image_url": "https://imageproxy.wolt.com/assets/67332fbac59f3326de5432dd",
      "tagline": "The sushi of modern Japan | Kosher Chief Rabbinate Tel Aviv",
      "badges": ["KOSHER"],
      "delivery_fee": { "amount": 0, "currency": "ILS", "display": "0₪" },
      "delivery_time_min_minutes": 35,
      "delivery_time_max_minutes": 45,
      "min_order": { "amount": 0, "currency": "ILS", "display": "₪0.00" },
      "price_tier": 3,
      "rating": 8.2
    }
  ]
}
```

### No results

```json
{
  "success": true,
  "city": { "country_code": "isr", "slug": "tel-aviv", "display_name": "TLV - Herzliya area" },
  "query": "zzzqqqxxxx",
  "result_count": 0,
  "restaurants": [],
  "reason": "no_results"
}
```

### Invalid city / slug not recognized

```json
{
  "success": false,
  "reason": "invalid_city_slug",
  "attempted_url": "https://wolt.com/en/isr/telaviv/search?q=sushi",
  "hint": "Wolt slugs are kebab-case English. Try 'tel-aviv' (with hyphen). Validate with /en/{cc}/{slug} before searching."
}
```
