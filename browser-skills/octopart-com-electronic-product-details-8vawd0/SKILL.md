---
name: octopart-com-electronic-product-details-8vawd0
title: Octopart Electronic Product Search
description: >-
  Search Octopart's electronic-component catalog by keyword, MPN, or tech spec
  and return clean JSON: part identity, specs, distributor stock, and
  per-quantity pricing across DigiKey/Mouser/Arrow/Avnet/Farnell and 30+ other
  distributors. Recommended path is the Nexar GraphQL API (free with OAuth2
  registration) — Octopart's public web UI is universally PerimeterX-walled on
  Browserbase.
website: octopart.com
category: electronics-sourcing
tags:
  - electronics
  - components
  - pricing
  - bom
  - octopart
  - nexar
  - perimeterx
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      Not viable on Browserbase as configured — /search,
      /electronic-parts/{category}, and /part/{mfr}/{mpn} are all PerimeterX
      'Press & Hold Human Challenge'-walled on default sessions, on --verified
      --proxies stealth sessions, and on fresh-session direct-to-detail
      navigation (verified 2026-05-19, 4 iterations). The homepage / is the only
      page reachable on the first request of a session. Do not waste iterations
      trying to scrape /search.
  - method: hybrid
    rationale: >-
      browse cloud fetch does bypass PX (different fingerprint than headless
      Chrome and confirmed to receive real Octopart HTML rather than a challenge
      page) but is capped at 1 MB response body, and part-detail pages are
      ~1.5-3 MB JS-rendered. If the cap is raised in future tooling, parse the
      embedded <script type='application/ld+json'> Product block on
      /part/{mfr}/{mpn} for headline (qty=1) pricing — per-tier breaks remain
      API-only.
verified: true
proxies: true
---
# Octopart Electronic Product Search

## Purpose

Search Octopart's catalog of electronic components by keyword, part number, or technical spec, and return a clean JSON object containing each matching part's identity (MPN + manufacturer), specs, distributor availability, and current pricing tiers across distributors (DigiKey, Mouser, Arrow, Avnet, Farnell, etc.). Read-only — never adds to cart, never submits orders.

## When to Use

- Engineer/buyer needs to compare prices for an MPN (e.g. `LM358`, `STM32F103C8T6`, `ERJ-2RKF1002X`) across 30+ authorized distributors in one query.
- Sourcing automation that decides which distributor to procure from based on current stock + price-break tiers.
- Component cross-reference: given an MPN, find alternatives + their pricing.
- BOM pricing rollups when you have a list of MPNs and need unit cost + stock at quantity break.
- Any flow that would otherwise scrape `octopart.com/search?q=...` HTML — the Nexar GraphQL API is faster, structurally cleaner, and is the only path that reliably bypasses Octopart's PerimeterX (PX) bot wall.

## Workflow

Octopart's public web UI (`/search`, `/electronic-parts/...`, `/part/{mfr-slug}/{mpn}`) is fronted by PerimeterX human-challenge — verified blocked across default Browserbase, `--verified --proxies` stealth, and fresh-session direct-to-detail navigation (4 iterations, all PX-walled). **The supported path is the Nexar API.** Altium operates Octopart's data as the public face of the Nexar GraphQL API at `https://api.nexar.com/graphql` — same dataset, no PX. The Nexar API is free for low volume after registering an application; OAuth2 client credentials are required.

### 1. One-time setup: register a Nexar API application

1. Sign up at `https://nexar.com/` (free).
2. Go to `https://portal.nexar.com/` → Applications → New Application.
3. Pick the **Supply** scope (`supply.domain`) — this scope grants the Octopart product-search/pricing queries (`supSearch`, `supSearchMpn`, `supParts`).
4. Copy `clientId` and `clientSecret` — store these in your agent's secret store, **not** in the SKILL.md or task input.

### 2. Acquire an OAuth2 access token

```bash
TOKEN=$(curl -sS -X POST https://identity.nexar.com/connect/token \
  -d "grant_type=client_credentials" \
  -d "client_id=${NEXAR_CLIENT_ID}" \
  -d "client_secret=${NEXAR_CLIENT_SECRET}" \
  -d "scope=supply.domain" \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).access_token))")
```

Tokens are valid for ~24 hours. Cache and reuse — don't request a new one per query.

### 3. Run the search query

For a free-text search ("LM358", "10nf,25v,10%,X7R,0402", or "STM32" partial MPN), use `supSearch`:

```graphql
query SearchProducts($q: String!, $limit: Int = 10) {
  supSearch(q: $q, limit: $limit, inStockOnly: false) {
    hits
    results {
      part {
        id
        mpn
        manufacturer { name }
        shortDescription
        category { name path }
        bestDatasheet { url }
        bestImage { url }
        medianPrice1000 { price currency }
        specs { attribute { shortname name group } displayValue }
        sellers {
          company { name }
          country
          offers {
            sku
            inventoryLevel
            moq
            packaging
            clickUrl
            prices { quantity price currency }
            updated
          }
        }
      }
    }
  }
}
```

For a guaranteed exact-MPN match (no fuzzy expansion), use `supSearchMpn` with the same selection set — it returns 1 hit per exact MPN.

POST to the GraphQL endpoint:

```bash
curl -sS -X POST https://api.nexar.com/graphql \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"...above...\", \"variables\": {\"q\": \"LM358\", \"limit\": 5}}"
```

### 4. Reshape the response into the clean JSON contract

Map each `results[].part` into the output shape under `## Expected Output`. Key rules:

- **Sort offers within a seller** by `prices[0].quantity` ascending — the API doesn't guarantee order.
- **Pick the lowest-quantity-1 price across all sellers** as the "best price" rollup field. If a seller's lowest tier is `quantity > 1`, fall back to their lowest tier.
- **Drop `inventoryLevel: 0` offers** unless `include_out_of_stock: true` was requested.
- **Normalize all prices to USD** if needed — Nexar returns prices in the seller's listed currency. `medianPrice1000` is pre-normalized in USD for the "best estimate" rollup.

### Browser fallback

**Not viable on Browserbase as configured.** PerimeterX (`/kdRQnL15/` proxying endpoints in `robots.txt` confirms the deployment) issues a "Press & Hold Human Challenge" iframe on every non-homepage request, including:

- `/search?q=...` — blocked on default, blocked on `--verified --proxies`
- `/electronic-parts/{category}` — blocked
- `/part/{manufacturer-slug}/{mpn}` — blocked even via direct navigation on a brand-new session

Browserbase `cloud fetch` does receive real HTML (no PX challenge) but the per-response 1 MB cap blocks return (`502 The response body exceeded the maximum allowed size of 1MB`). If your runtime ever upgrades the Fetch API limit, the JSON-LD `<script type="application/ld+json">` block embedded in `/part/{mfr}/{mpn}` carries the `Product` schema.org graph with `name`, `mpn`, `brand`, `offers[].price`, `offers[].priceCurrency`, `offers[].availability`, `offers[].seller` — parse that instead of the visual DOM. Until then, do not attempt browser scraping; it will burn iterations on PX walls.

## Site-Specific Gotchas

- **PerimeterX is universally deployed on data pages.** Verified 2026-05-19 across 4 iterations: `/search?q=LM358` returned `Block Type: PX, Reference: a0af2040-5340-...` on default Browserbase, on `browse cloud sessions create --verified --proxies` (residential proxy IP `108.41.189.122`, also blocked), and on a fresh stealth session navigating *directly* to `/part/te-connectivity/66105-3`. The homepage `/` is the **only** universally-reachable page on the first request of a session.
- **The PX flag is sticky to the session.** Once any data page is challenged, subsequent loads (even of `/`) on the same session return PX too. There is no recovery within a session — release and create a new one, but the new one will still block at `/search`.
- **Don't waste iterations on selectors/CSS for `/search`.** No selector strategy survives the challenge iframe. The skill exits at the PX wall, not at a render race.
- **`browse cloud fetch` bypasses PX** (different fingerprint than headless Chrome) but is capped at 1 MB response body, and Octopart part-detail pages are ~1.5-3 MB of JS-rendered HTML + inline JSON. Fetch returns `502 body exceeded ... 1MB` reliably. The sitemap index (`product-sitemap-index.xml`) and `robots.txt` are small and *do* return — useful for enumerating MPN coverage but they contain no pricing data.
- **`/part/{old-mpn-slug}-{numeric-id}` 301-redirects to `/part/{mfr-slug}/{mpn}`** — both URL forms resolve to the same detail page. The newer canonical form is `/part/{mfr-slug}/{mpn}`.
- **Nexar API rate limits**: free tier is ~1,000 queries/month and ~20 QPS. For a single search-and-extract this is generous; for daily BOM pricing across hundreds of MPNs, request a paid tier or batch via `supParts(ids: [...])`.
- **Nexar OAuth2 endpoint is `identity.nexar.com`, not `api.nexar.com`.** Common mistake — the GraphQL endpoint and the token endpoint live on different subdomains.
- **`supSearch` does fuzzy MPN expansion.** Searching `STM32` returns ~10k hits across the STM32 family — use `supSearchMpn` for exact MPN, or pass `filters: { manufacturer_id: { eq: <id> } }` to narrow.
- **`medianPrice1000` is null for many parts** — it's an aggregate that requires enough distributor signal. Fall back to the lowest `sellers[].offers[].prices[]` tier when computing a "current price" field.
- **`sellers[].offers[].prices[]` is per quantity break.** A single seller may list 5–8 quantity breaks (1, 10, 100, 1000, 5000, 10000). Always pass through all tiers in the output, then surface a `best_unit_price` rollup at qty=1 for convenience.
- **`inventoryLevel` of `null` ≠ 0.** `null` means the distributor didn't report stock to Octopart; `0` is reported zero. Treat them differently when filtering for available parts.
- **Octopart was acquired by Altium and rolled into the Nexar product family in 2018.** Some older support docs (pre-2020) reference an `octopart.com/api/v3/...` REST API — that surface is now deprecated, `robots.txt` Disallows `/api/v1/*` through `/api/v4/*`, and the v3 keys no longer authenticate. The Nexar GraphQL endpoint is the only supported programmatic surface today.

## Expected Output

```json
{
  "query": "LM358",
  "method": "nexar-api",
  "hits": 1247,
  "results": [
    {
      "octopart_id": "518",
      "mpn": "LM358N",
      "manufacturer": "Texas Instruments",
      "short_description": "Dual operational amplifier, 8-Pin PDIP",
      "category": {
        "name": "Linear Amplifiers - Op Amps",
        "path": ["Electronic Parts", "Integrated Circuits (ICs)", "Linear ICs", "Linear Amplifiers - Op Amps"]
      },
      "datasheet_url": "https://datasheet.octopart.com/LM358N-Texas-Instruments-datasheet-9646.pdf",
      "image_url": "https://sigma.octopart.com/.../LM358N.jpg",
      "specs": {
        "supply_voltage": "3 V to 32 V",
        "operating_temperature": "0 °C to 70 °C",
        "package": "PDIP-8",
        "channels": "2",
        "rohs": "Compliant"
      },
      "best_unit_price_usd": 0.42,
      "median_price_1000_usd": 0.18,
      "sellers": [
        {
          "name": "DigiKey",
          "country": "US",
          "offers": [
            {
              "sku": "296-1395-5-ND",
              "stock": 18432,
              "moq": 1,
              "packaging": "Tube",
              "click_url": "https://octopart.com/click/...",
              "prices": [
                { "qty": 1, "price": 0.49, "currency": "USD" },
                { "qty": 10, "price": 0.44, "currency": "USD" },
                { "qty": 100, "price": 0.31, "currency": "USD" },
                { "qty": 1000, "price": 0.21, "currency": "USD" }
              ],
              "updated": "2026-05-18T22:14:00Z"
            }
          ]
        },
        {
          "name": "Mouser",
          "country": "US",
          "offers": [
            {
              "sku": "595-LM358N",
              "stock": 9624,
              "moq": 1,
              "packaging": "Tube",
              "click_url": "https://octopart.com/click/...",
              "prices": [
                { "qty": 1, "price": 0.42, "currency": "USD" },
                { "qty": 10, "price": 0.39, "currency": "USD" },
                { "qty": 100, "price": 0.29, "currency": "USD" },
                { "qty": 1000, "price": 0.19, "currency": "USD" }
              ],
              "updated": "2026-05-18T23:01:00Z"
            }
          ]
        }
      ]
    }
  ]
}
```

If the browser-fallback path is ever unblocked (PX softens or the Fetch API cap is raised), the same shape is reconstructible from the `<script type="application/ld+json">` `Product` block on `/part/{mfr-slug}/{mpn}` — `name → mpn`, `brand.name → manufacturer`, `description → short_description`, `offers[].price/.priceCurrency/.availability/.seller.name → sellers[].offers[].prices[0]`. The browser path will NOT yield per-quantity break tiers (only the headline qty=1 price is in JSON-LD) — that's an API-only capability.

If the query yields zero hits:

```json
{ "query": "totally-fake-mpn-123", "method": "nexar-api", "hits": 0, "results": [] }
```

If the Nexar token request fails (bad credentials, scope mismatch):

```json
{ "query": "LM358", "method": "nexar-api", "error": "auth_failed", "detail": "invalid_client" }
```
