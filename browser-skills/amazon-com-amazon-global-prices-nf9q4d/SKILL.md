---
name: amazon-com-amazon-global-prices-nf9q4d
title: Amazon Global Price Comparison
description: >-
  Compare an Amazon product price across multiple country storefronts by routing
  each Browserbase session through that country's geolocation proxy, then
  extract country, currency, price, title, and URL with a Stagehand/Zod schema.
  Read-only.
website: amazon.com
category: ecommerce
tags:
  - amazon
  - ecommerce
  - price-comparison
  - geolocation-proxy
  - international
  - stagehand
  - read-only
source: 'browserbase: agent-runtime 2026-06-04'
updated: '2026-06-04'
recommended_method: browser
alternative_methods:
  - method: fetch
    rationale: >-
      browse cloud fetch --proxies routes through a residential proxy but
      exposes no per-country geolocation control (defaults US) and cannot run
      Stagehand extract, so it can't produce native per-country locale/currency.
  - method: api
    rationale: >-
      Amazon has no public cross-region pricing API; the Product Advertising API
      requires per-marketplace Associate credentials and returns only your own
      locale, making ad-hoc multi-country comparison impractical.
verified: true
proxies: true
---
# Amazon Global Price Comparison

## Purpose

Given a product query (or an ASIN) and a list of country codes, search the matching **local Amazon storefront** for each country and return one structured record per country: `{ country, currency, price, title, url }`. Each country is fetched through its **own Browserbase session configured with that country's geolocation proxy**, because Amazon's display locale and currency follow the shopper's exit IP — not the storefront TLD and not the delivery address. Extraction uses a Stagehand `extract` call validated by a Zod schema (with a deterministic DOM-selector fallback).

**Read-only.** Never add to cart, never sign in, never proceed to checkout. Stop at the search-results / product page.

## When to Use

- Cross-border price comparison or arbitrage research ("is the Kindle Paperwhite cheaper on amazon.de or amazon.co.jp?").
- Building a per-region price table for one product or ASIN.
- Checking native local pricing/currency that a US-based shopper view would otherwise hide behind USD conversion.
- Any flow that needs *native* per-country prices, which requires routing each request through that country's IP.

## Workflow

This task **fundamentally requires per-country geolocation proxies.** Amazon decides the display language and currency from the shopper's exit IP (persisted in the `i18n-prefs` cookie). From a US IP, every storefront — amazon.de, amazon.co.uk, amazon.co.jp — renders in English (`/-/en/` paths) with `US$`/USD prices and a "Deliver to United States" banner, *even after* you set a local delivery postcode. There is no URL parameter, language toggle, or delivery-address change that produces native EUR/GBP/JPY from a US IP. The only lever that works is the exit IP. So: **one Browserbase session per country, each with that country's geolocation proxy.**

### 1. Map country codes → storefronts

| Code | Storefront host | Native currency |
|------|-----------------|-----------------|
| DE | www.amazon.de | EUR |
| GB | www.amazon.co.uk | GBP |
| JP | www.amazon.co.jp | JPY |
| FR | www.amazon.fr | EUR |
| IT | www.amazon.it | EUR |
| ES | www.amazon.es | EUR |
| CA | www.amazon.ca | CAD |
| US | www.amazon.com | USD |

### 2. Create one geolocation-proxy session per country

Proxy geolocation is fixed at session creation — you cannot change a session's proxy country afterward, so loop one session per country (sequential, or parallel for speed). Use the full-body form (the bare `--proxies` flag gives default/US geolocation):

```bash
BODY='{"keepAlive":true,"proxies":[{"type":"browserbase","geolocation":{"country":"DE"}}],"browserSettings":{"verified":true}}'
SID=$(browse cloud sessions create --body "$BODY" \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
```

- `country` is an ISO-3166 alpha-2 code, **uppercase**. Optional `city` (UPPERCASE_WITH_UNDERSCORES, e.g. `BERLIN`) and `state` (US only).
- `verified: true` adds stealth (recommended for Amazon).
- Equivalent via the Browserbase Node SDK: `bb.sessions.create({ projectId, keepAlive:true, proxies:[{type:"browserbase", geolocation:{country:"DE"}}] })`.

### 3. Navigate to the storefront search (or product) URL

```bash
browse open "https://www.amazon.de/s?k=Kindle+Paperwhite" --remote --session "$SID"
browse wait timeout 2500 --remote --session "$SID"
```

- For an exact product, use `/dp/<ASIN>` instead of `/s?k=`. Note ASINs are **region-specific** — the same physical product can have different ASINs per storefront, so a keyword search is usually the more robust cross-region matcher.
- If `browse get title` contains `503` / "Service Unavailable", wait ~4s and retry the open **once** (Amazon throttles rapid navigations from one IP).

### 4. Dismiss the cookie consent dialog (best-effort)

EU storefronts overlay a "Cookies and Advertising Choices" dialog on first load. It's non-fatal (results are in the DOM behind it), but dismiss it for clean screenshots:

```bash
browse click "#sp-cc-decline" --remote --session "$SID"   # "Decline"; ignore failure
```

### 5. Extract the first organic result

Preferred — Stagehand `extract` with a Zod schema (LLM-driven, resilient to markup drift):

```ts
import { z } from "zod";
const PerCountry = z.object({
  title: z.string(),
  price: z.string(),      // localized display string, e.g. "159,99 €"
  currency: z.string(),   // EUR | GBP | JPY | USD | ...
  url: z.string(),
});
const data = await stagehand.page.extract({
  instruction:
    "From the first NON-sponsored (organic) search result, return its product title, " +
    "its displayed price string (including the currency symbol), the inferred ISO currency code, " +
    "and the absolute product URL.",
  schema: PerCountry,
});
```

Deterministic DOM fallback (faster, cheaper — used by the generated scripts):

- First organic container: `div[data-component-type="s-search-result"][data-asin]:not([data-asin=""])`, skipping sponsored tiles (`.s-sponsored-label-info-icon`, `[aria-label*="Sponsored"]`, `data-component-type="sp-sponsored-result"`).
- Title: `… h2`
- Price string: `… .a-price .a-offscreen` (full localized string, e.g. `159,99 €`, `£159.99`, `￥28,980`)
- URL: `… h2 a` href, or build `https://<host>/dp/<data-asin>`.

Infer currency from the price symbol: `€`/EUR, `£`/GBP, `¥`/`円`/JPY, `US$`/`$`/USD.

### 6. Collect into the output array

One record per country; include a record with an `error` field for any storefront that blocked or returned no results.

### Generated runnable scripts

`playwright.ts` (verified) and `stagehand.ts` accompany this skill. Both implement the per-country loop, sponsored-result filtering, cookie dismissal, 503 retry, currency inference, and Zod-validated output. **Note:** the generated scripts connect to a single default Browserbase session for all countries (so on a US-exit session they return USD for every storefront). To get native currency, create the script's session with the per-country geolocation proxy from Step 2 (one session per country).

## Site-Specific Gotchas

- **Currency follows the exit IP, not the TLD or the delivery address — this is the whole ballgame.** Verified on amazon.de and amazon.co.jp: from a US datacenter IP both showed `US$`/USD and the `/-/en/` English locale. Setting "Deliver to Berlin 10115" changed the delivery banner but **prices stayed in USD** — currency is keyed to the `i18n-prefs` cookie seeded from the exit IP. Native EUR/GBP/JPY requires a country-matched geolocation proxy. Don't waste time on language params or delivery-address hacks.
- **One proxy country per session.** Geolocation is fixed at creation; multi-country = a session per country.
- **⚠️ Proxy-provisioning caveat (verify on your infra).** In the sandbox used to build this skill, Browserbase managed proxies did **not** route on CDP/page-driving sessions — every variant (CLI `--proxies` flag, `--body` geolocation array, and the Browserbase Node SDK, with and without `--verified`) exited via the **AWS us-west-2 datacenter IP**, confirmed against `ipinfo.io` and `api.country.is`. As a result native non-USD currency could not be confirmed end-to-end here. (`browse cloud fetch --proxies` *did* route through a residential US IP, but the Fetch API exposes no per-country geolocation control and can't run Stagehand.) The geolocation config above is the correct, documented path; **if your sessions also exit US, fix proxy provisioning before trusting any currency value** — and treat a "Deliver to United States" banner / `US$` price as a red flag that the proxy isn't routing.
- **503 throttling.** amazon.co.uk returned a `503 Service Unavailable` after rapid back-to-back storefront navigations on one IP. Use a fresh session per country, pace requests, and retry once after ~4s.
- **Cookie consent overlay.** "Cookies and Advertising Choices" dialog appears on first EU-storefront load; Decline button id is `#sp-cc-decline`. Non-fatal.
- **Sponsored results come first.** Filter sponsored tiles or you'll compare an ad placement instead of the product.
- **Decimal formats differ.** EU storefronts use a decimal comma (`159,99 €`); UK/JP use a dot/none (`£159.99`, `￥28,980`). Keep the raw localized string; normalize to a number only when you need arithmetic.
- **`browse snapshot` is unreliable under the autobrowse CDP-attach harness** (returns only the CLI "Update available" banner). Use `browse get text/html` with CSS selectors instead. Direct `browse … --remote` snapshots work fine — this is a harness artifact, not an Amazon behavior.

## Expected Output

```json
{
  "success": true,
  "query": "Kindle Paperwhite",
  "results": [
    {
      "country": "DE",
      "currency": "EUR",
      "price": "159,99 €",
      "title": "Amazon Kindle Paperwhite (16 GB) – Jetzt mit 7‑Zoll‑Display und doppelter Akkulaufzeit",
      "url": "https://www.amazon.de/dp/B0CFPWLGF2"
    },
    {
      "country": "GB",
      "currency": "GBP",
      "price": "£159.99",
      "title": "Amazon Kindle Paperwhite (16 GB) – Now with a 7\" display and weeks of battery life",
      "url": "https://www.amazon.co.uk/dp/B0CFPWLGF2"
    },
    {
      "country": "JP",
      "currency": "JPY",
      "price": "￥28,980",
      "title": "Amazon Kindle Paperwhite (16GB) 6.8インチディスプレイ 広告なし",
      "url": "https://www.amazon.co.jp/dp/B0CFPWLGF2"
    }
  ],
  "error_reasoning": null
}
```

Per-storefront failure record (e.g. throttled):

```json
{ "country": "GB", "currency": "UNKNOWN", "error": "503 Service Unavailable" }
```

US-locale fallback shape (what you get when the country proxy is NOT routing — a US exit IP collapses every storefront to USD; treat as a misconfiguration signal, not a valid comparison):

```json
{
  "country": "DE",
  "currency": "USD",
  "price": "US$ 209.30",
  "title": "Amazon Kindle Paperwhite (16 GB) ...",
  "url": "https://www.amazon.de/-/en/dp/B0CFPWLGF2"
}
```
