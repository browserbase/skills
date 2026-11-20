---
name: bankrate-com-compare-savings-rates-5kxzox
title: 'Bankrate Compare Savings, Money Market & CD Rates'
description: >-
  Return ranked Bankrate savings, money-market, and CD rates as structured JSON
  — bank name, account name, APY, minimums, fees, FDIC/NCUA status, Bankrate
  score, editorial copy, last-updated timestamp, and affiliate Open Account URLs
  (captured, never followed). Lead with a Browserbase Fetch of the editorial
  best-of article; fall back to a remote browser session for the dynamic WRT
  (Wealth Rate Table) widget when filter dimensions exceed what static HTML
  exposes.
website: bankrate.com
category: personal-finance
tags:
  - banking
  - savings
  - cd-rates
  - money-market
  - rates-comparison
  - fdic
  - read-only
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: url-param
alternative_methods:
  - method: hybrid
    rationale: >-
      The optimal end-to-end skill combines URL-param fetch of editorial best-of
      articles (covers 80%+ of queries — 8-13 ranked institutions in static
      HTML) with a remote browser session for the WRT (Wealth Rate Table) widget
      when the user needs filter dimensions only the widget exposes (custom min
      APY, ZIP-localized credit unions, compounding-frequency, institution-type
      toggle, ATM access, mobile-app rating).
  - method: browser
    rationale: >-
      Required when the target page exceeds the 1 MB Browserbase Fetch ceiling
      (e.g., the canonical HYS rate-table at
      /banking/savings/best-high-yield-interests-savings-accounts/), or when the
      user query needs filter dimensions not surfaced on the editorial 'best of'
      articles. WRT widget hydrates ~1-2s after page load.
  - method: api
    rationale: >-
      NOT recommended. No public REST/GraphQL API exists. The WRT widget
      hydrates via a private BGQL endpoint at wealth-rt.bankrate.com that is
      auth-middlewared via a 'Bankrate Boost' JWT (ZIP + email lead-gen funnel).
      Probes against /api/v1, /api/v2, api.bankrate.com/graphql,
      /api/next/savings, /api/savings/rates all returned 404. Do not waste turns
      trying to find an unauth API path — confirmed absent.
verified: false
proxies: false
---
# Bankrate Compare Savings, Money Market & CD Rates

## Purpose

Return ranked savings-account, money-market, and CD rates from Bankrate.com as structured JSON — including bank name, account name, APY, minimum opening deposit, minimum balance to earn APY, monthly fee, compounding frequency, FDIC/NCUA insurance status, Bankrate score / star rating, editorial "Why this bank?" copy, "Best for…" tag, promotional bonus, last-updated timestamp, "Open Account" affiliate URL, canonical Bankrate account URL, and bank logo URL. Read-only — never clicks Open Account / Apply / Sign In / any conversion CTA; affiliate hrefs are captured but not followed.

## When to Use

- "What are the best high-yield savings rates today?" / "Find me a 1-year CD over 4% APY."
- Daily / weekly monitoring of HYS / CD / MMA top-rate movement for a tracker.
- Comparing a specific bank's account (e.g., `Ally Bank savings`, `Marcus by Goldman Sachs CD`) to peer rates.
- Sourcing the Bankrate-editorial picks for a finance newsletter / personal-finance agent.
- Anywhere you'd otherwise scrape a generic "rates comparison" site — Bankrate is the canonical editorial source and is scrape-friendly (no CAPTCHA, no anti-bot wall, gzip-cached at the edge).

## Workflow

Bankrate ships **two** rate surfaces on the same domain. Pick by query depth:

| Surface | Where | When |
|---|---|---|
| **Editorial "best of" articles** — 8-15 ranked institutions, full data in static HTML | `/banking/{cds,savings,money-market}/best-*-rates/` | Default. Covers 80%+ of natural queries ("best HYS", "best 1-yr CD", "best no-penalty CD"). Fetchable, no auth, ~700KB each, parse `<article id="institution-details-{id}">` blocks. |
| **WRT (Wealth Rate Table) widget** — dynamic rate-comparison UI with full filter surface (deposit amount, ZIP, institution type, min APY, etc.) | `/banking/savings/rates/`, `/banking/money-market/rates/`, `/banking/cds/cd-rates/` (and `/landing/savings/rates`) | Use when a query needs filter dimensions the editorial page doesn't expose (custom min-APY, ZIP-localized credit unions, compounding-frequency filter, ATM-access toggle). Requires a remote browser session — pages are >1MB and the inventory is client-hydrated via a private GraphQL endpoint. |

### 1. Map the query to the right URL

Bankrate's `recommended_method` is **`url-param`** for the editorial path — every account-type / term combination has a canonical, fetchable "best of" URL. Map the user's intent to one:

| Intent | URL |
|---|---|
| High-yield savings (default) | `https://www.bankrate.com/banking/savings/best-high-yield-interests-savings-accounts/` *(>1MB — fetch fails; use browser, or use the `landing/savings/rates` variant ~430KB which has the WRT widget only)* |
| Money-market rates | `https://www.bankrate.com/banking/money-market/rates/` |
| 6-month CD | `https://www.bankrate.com/banking/cds/best-6-month-cd-rates/` |
| 1-year CD | `https://www.bankrate.com/banking/cds/best-1-year-cd-rates/` |
| 5-year CD | `https://www.bankrate.com/banking/cds/best-5-year-cd-rates/` |
| No-penalty CD | `https://www.bankrate.com/banking/cds/best-no-penalty-cds/` *(301 → `…best-no-penalty-cd-rates/`)* |
| Jumbo CD | `https://www.bankrate.com/banking/cds/best-jumbo-cd-rates/` |
| Specific bank profile + product line | `https://www.bankrate.com/banking/reviews/{bank-slug}/` (linked from each rate card's "Read review" anchor) |

`/banking/savings/rates/` 301-redirects to `/banking/savings/best-high-yield-interests-savings-accounts/`. Always send `--allow-redirects` when following a `/rates/` shortcut.

### 2. Fetch the page (Browserbase Fetch API)

```bash
browse cloud fetch \
  "https://www.bankrate.com/banking/cds/best-1-year-cd-rates/" \
  --allow-redirects \
  --output rates.html
```

No `--proxies` needed. No `--verified` / Verified session needed. Bankrate has minimal anti-bot — pages are gzip-cached at Fastly + Varnish and return 200 to a bare HTTPS GET in 200-400ms. (If the rare 429 surfaces, retry with `--proxies` — the residential-proxy path resolves it.)

**The Fetch API caps responses at 1 MB.** Several Bankrate URLs exceed that:
- `/banking/savings/best-high-yield-interests-savings-accounts/` ≈ 1.05 MB → 502 from fetch.
- `/banking/savings/best-online-savings-accounts/` ≈ 1.0 MB → 502 from fetch.
- `/landing/cd-rates-{d,f,g}/` → all 502 from fetch.

For those, use the browser-session fallback in step 5. The 1-year-CD, 5-year-CD, 6-month-CD, no-penalty-CD, jumbo-CD, and money-market-rates pages are all under 1 MB and fetch cleanly today (May 2026).

### 3. Parse the rate cards

The static-HTML rate cards live under `<div class="wealth-dynamic-rate-block">` as a sequence of `<article id="institution-details-{numeric_id}">` blocks. Each article carries one ranked institution with all required fields. Use straight regex / HTML parser — there are no JS-rendered fields inside an article.

Extraction targets per `<article id="institution-details-{id}">`:

| Field | Selector / regex (within the article block) |
|---|---|
| Institution numeric id | `id="institution-details-(\d+)"` (use for `pinned`-style dedup / matching across pages) |
| Bank logo URL | `<img\s+src="([^"]+)"\s+alt="([^"]*)_logo"` |
| Bank name | `<h3 class="heading-4[^"]*">([^<]+)</h3>` |
| Bankrate review URL | `<a class="Button Button--secondary" href="([^"]+)"[^>]*>Read review` (e.g. `/banking/reviews/morgan-stanley-private/`) |
| Bankrate score / rating | `<span class="sr-only">Rating: (\d+(?:\.\d+)?) stars out of 5</span>` **and** the visible score: `<span class="heading-4 text-base">(\d+(?:\.\d+)?)</span>\s*<span[^>]*>Bankrate (?:CD\|savings\|MMA\|checking) score</span>` |
| APY (decimal — primary) | `<h4 class="text-base mb-2">Annual percentage yield</h4>\s*<div>([^<]+)</div>` |
| Minimum opening deposit | `<h4 class="text-base mb-2">\s*Min\. deposit to open</h4>\s*<div>([^<]+)</div>` |
| Term (CDs only) | `<h4 class="text-base mb-2">\s*Term</h4>\s*<div>([^<]+)</div>` |
| Editorial "Why X?" copy | `<h4 class="text-base mb-4">Why ([^<?]+)\?</h4>\s*<p[^>]*>([^<]+)</p>` |
| All-terms accordion (CD only) | The next `<div class="table-container wealth-product-rate-list">` after the `Why X?` block contains a `<table>` with one row per term: `<tr>\s*<td>([^<]+)</td>\s*<td>\s*([\d.]+%\s*APY)</td>\s*<td>\s*([^<]+)</td>` → `term`, `apy`, `min_deposit` |

Each article block is ~10-12 KB; a typical "best of" page yields 8-13 cards. Iterate articles in document order — that order is the editorial ranking (slot #1 first).

### 4. Pull page-level editorial metadata

These live in `<script type="application/ld+json">` blocks and page `<meta>` tags:

- **Last-rate-updated timestamp**: the `Article` ld+json block's `"dateModified":"..."` (e.g. `"2026-05-13T14:54:00.894Z"`). Treat this as the authoritative "as of" date for every rate on the page.
- **Page canonical URL**: `<link rel="canonical" href="...">` — use as `bankrate_account_url` when the per-card URL collapses to the page anchor (`#institution-details-{id}`).
- **Editorial headline / "Up to X.XX%" summary**: the `Article.headline` field (`"Best 1-Year CD Rates for May 2026 - Up to 4.10% \| Bankrate"`).
- **Author + reviewer**: `Article.mainEntity.reviewedBy` (`{"@type":"Person","name":"Greg McBride, CFA","jobTitle":"…"}`).
- **Breadcrumb / category**: the `BreadcrumbList` ld+json (`Banking → CDs → Best 1-Year CD Rates`).

### 5. Browser fallback — when the static path won't work

Use a Browserbase remote session when:
- The target URL is the HYS rate-table redirect (`/banking/savings/best-high-yield-interests-savings-accounts/`) — fetch hits the 1 MB ceiling.
- The user asked for a filter dimension not covered by the editorial page (custom min-APY, ZIP-localized credit unions, compounding-frequency, ATM-access, mobile-app-rating). Those live exclusively in the WRT widget.
- The query needs the personalized "Bankrate Boost" overlay (ZIP + email + deposit + accountsHeld → JWT-gated wider inventory). The skill should NOT submit a real email — Boost is read-only-incompatible. Skip Boost entirely and read the unauth WRT default-state inventory.

Session shape:

```bash
sid=$(browse cloud sessions create --keep-alive | jq -r .id)
export BROWSE_SESSION="$sid"
browse open "https://www.bankrate.com/banking/cds/cd-rates/" --remote
browse wait load
browse wait timeout 3000     # WRT widget hydrates ~1-2s after load
browse snapshot              # WRT rate-cards become accessible refs
```

The WRT widget controls (use snapshot refs and `browse click` / `browse fill`):

| Control | Notes |
|---|---|
| `Deposit amount` text input | Default `50,000`. Filters cards to those whose `Min. balance for APY` ≤ deposit. |
| `Zip code` text input | Default IP-derived (observed `97818` on a us-west-2 session). **This drives surface of local credit unions / community banks** — set explicitly for any geo-scoped query. Validated against `https://wealth-zip-service.bankrate.com/us/{zip}` (200 = valid). |
| `Product type` collapsible — `Savings`, `MMAs`, `Checking`, `CDs` checkboxes | Multi-select. For CDs, an additional **term range** appears: `3 mo`, `6 mo`, `9 mo`, `1 yr`, `18 mo`, `2 yr`, `3 yr`, `4 yr`, `5 yr`, `7 yr`, `10 yr`, plus `No-penalty`, `Bump-up`, `Step-up`, `Jumbo`. |
| `Filters` button (gear icon, mobile-style modal) | Opens the wider filter panel: min APY, monthly fee ($0 toggle), FDIC/NCUA toggle, compounding (Daily/Monthly/Quarterly), institution type (Online / National / Credit union / Community / Brick-and-mortar), ATM access (MMA/checking), mobile-app rating. |
| `Update results` button | Re-issues the BGQL request with the new filter state. |
| Sort dropdown (above results) | `Highest APY` (default), `Lowest min deposit`, `Lowest fees`, `Bankrate score`, `Featured`. |

Each hydrated WRT card carries the same data shape as a static `institution-details-{id}` article. Parse via `browse get markdown body` and the same regex set, OR via a11y snapshot refs and per-card `browse get html` slices.

### 6. Capture the "Open Account" affiliate href — never follow it

Every rate card has a primary CTA — usually `<a class="Button Button--primary" href="...">Open account</a>` — that points at Bankrate's `/hlink_redirects/` or partner-redirect path. **Capture the href value** as `open_account_url` and flag it with `"is_affiliate": true`. Bankrate's `robots.txt` explicitly Disallows `/hlink_redirects/`, `/affiliates/`, `/partners/`, and `/credit-card-offers/transfer-page/` — do not navigate to these URLs, do not follow redirects through them, do not load them with the Browserbase Fetch API. The downstream is a partner application funnel and constitutes a mutation surface.

### 7. Release the session (browser fallback only)

```bash
browse cloud sessions update "$sid" --status REQUEST_RELEASE
```

## Site-Specific Gotchas

- **The Browserbase Fetch API caps response bodies at 1 MB.** Bankrate's flagship HYS rate-table (`/banking/savings/best-high-yield-interests-savings-accounts/`) and online-savings overview (`/banking/savings/best-online-savings-accounts/`) both exceed 1 MB and return `502 The response body exceeded the maximum allowed size of 1MB`. The CD "best of" pages (1yr ≈ 738 KB, 5yr ≈ 712 KB, no-penalty ≈ 581 KB) and the money-market rates page (≈ 702 KB) are all under the ceiling and fetch cleanly. For >1 MB pages, fall back to a browser session.
- **`/banking/savings/rates/` is a 301**, not the rate table itself. It redirects to `/banking/savings/best-high-yield-interests-savings-accounts/`. Always pass `--allow-redirects` to `browse cloud fetch`, or hard-code the canonical target.
- **`Vary: X-Geo-PostalCode` on rate-table responses.** Bankrate localizes some rate data by source-IP postal code. Two consequences: (a) Fastly's cache key is partitioned by ZIP, so cached responses are ZIP-specific (you may see different rate ordering across sessions originating in different US regions); (b) to force a specific ZIP, you must use the WRT widget — there is no `?zip=` query param on the editorial article URLs. (Verified: appending `?zip=10001` to `/banking/cds/best-1-year-cd-rates/` is silently ignored — same body served.)
- **Two parallel data surfaces — pick the right one.** The editorial "best of" article has 8-13 ranked institutions in static HTML (`<article id="institution-details-*">`). The WRT widget on the same page renders a separate, larger, filter-driven inventory client-side via Bankrate's private BGQL endpoint. They overlap heavily but are NOT identical; if the user asks for a specific filter combination (min APY, institution type, compounding), the WRT inventory is the source of truth — not the editorial 8-13.
- **The WRT widget hydrates via a private GraphQL backend, NOT a public REST API.** The widget POSTs to a `wealth-rt.bankrate.com`-domain BGQL endpoint with these variables: `accountTypeCategory`, `cdProducts`, `cdTermRange`, `checkingProducts`, `depositAmount`, `enableWrmSorting`, `ignoreBudget`, `includeCd`, `includeChecking`, `includeSavingsMma`, `listingType`, `pid: "br3"`, `savingsMmaProducts`, `zipCode`, `tclass: "BR_TRAFFIC"`, `editorialTag: "RATE_TABLE"`, `allowScrapedRates: true`, `boost_token`. **Do NOT try to call BGQL directly** — the endpoint URL is constructed dynamically from a minified JS chunk, and `boost_token` is plumbed through anti-bot middleware. Use the browser session and let WRT issue the request.
- **"Bankrate Boost" is a lead-gen funnel, not an unlock.** A modal asks for ZIP + email + deposit amount + accountsHeld and returns a `boost_token` JWT (`POST https://wealth-rt.bankrate.com/api/boost`) that widens the GraphQL inventory. **Never submit an email** — Boost is a writeable conversion. Skip the modal and read the unauth default-state WRT inventory (call passes `boost_token: ""` empty string and still returns rates). Closing the modal via the X button in the upper right is safe.
- **`zipCode: "90210"` is an internal sentinel** — passing it triggers Bankrate's `declinePage` branch in the Boost flow. Don't use 90210 as a default; pick `10001` (NYC) or `97818` (the IP-derived default observed from us-west-2) if no user ZIP is supplied.
- **WRT widget defaults are us-west-2-flavored.** On a fresh session the widget pre-fills `Deposit amount: 50,000` and `Zip code: 97818` (rural Oregon — likely the egress IP's postal). To localize, fill the ZIP field and click `Update results` before reading cards.
- **`/banking/cds/best-no-penalty-cds/` is a 301** → `/banking/cds/best-no-penalty-cd-rates/`. The destination page has rate data in a DIFFERENT HTML structure than the other "best of" pages — it uses `<table class="Table table-content">` rate-list tables inside the body copy, NOT `<article id="institution-details-*">` blocks. Parse via the rate-list selector (see step 3, last row) instead of the institution-details regex when this URL is the target.
- **`<article id="institution-details-*">` ids are stable across pages and time.** The numeric id is Bankrate's internal `advertiserId` / institution PK. `5390` is E*TRADE; `5068` is Ally Bank; `1966` is First Internet Bank of Indiana; `1774` is UFB Direct. Use the id to dedup the same bank's CD vs. savings product across pages. Bank logos at `https://www.brimg.net/system/img/inst/{advertiserId}.png` and partner logos at `https://www.brimg.net/advertiser/logos/{advertiserId}.png?width=240&format=auto` follow the same id space.
- **Star ratings are rendered as SVG fills, not text.** The numeric score appears in two places: `<span class="sr-only">Rating: 4.5 stars out of 5</span>` (screen-reader text) and `<span class="heading-4 text-base">4.5</span><span>Bankrate {CD\|MMA\|savings\|checking} score</span>` (visible numeric next to "Bankrate X score"). Prefer the visible numeric — it's emitted as plain text and immune to a11y-string drift. The 5 individual star glyphs use inline `<svg>` with `style="width: 100%"` for filled and `style="width: 50%"` for half-filled, but parsing those is unnecessary.
- **`/hlink_redirects/`, `/affiliates/`, `/partners/`, `/credit-card-offers/transfer-page/` are robots.txt-Disallow and they are partner-redirect funnels.** Capture the href as `open_account_url` with `is_affiliate: true`. Do NOT follow, do NOT pass to `browse cloud fetch`, and do NOT click in a browser session — the next hop is the partner bank's account-opening application, which is a mutation surface.
- **Bankrate has NO meaningful anti-bot.** No CAPTCHA, no Akamai-style 403, no rate-limit on `browse cloud fetch` observed (10+ sequential fetches in <5s succeeded). A bare keep-alive session without `--verified` or `--proxies` works fine. If you ever see a 4xx from Bankrate, it's almost certainly a redirect that wasn't followed or a real 404.
- **`Vary: Accept-Encoding` is present** — Fastly serves gzip. `browse cloud fetch` decompresses transparently, but if you ever script a raw `curl`, send `Accept-Encoding: gzip` to match production behavior (some Fastly nodes serve identity at 5-10x the byte cost).
- **Money-market and checking accounts include an ATM-access bullet** that the editorial articles render as a separate `<li>` in the Pros list (search `<h4>Pros</h4>` → adjacent `<ul>`). CDs never have ATM access. Don't try to extract `atm_access` from a CD card — it's not there.
- **Promotional bonus copy appears inline in the "Why X?" paragraph**, not as a structured field. Heuristic: search the editorial-copy `<p>` for `\$\d+\s*(?:bonus|cash bonus|new account bonus|welcome offer)` and `\d+(?:,\d{3})*\s*(?:points|miles)` to extract.
- **"Best for…" tags** appear as a small chip above the bank name (e.g., `BEST FOR NO MINIMUM DEPOSIT`). Selector: a `<div>` or `<span>` with class containing `eyebrow` or `tag` immediately preceding the `<h3 class="heading-4">`. Not every card has one — make the field optional in your output schema.
- **Established date / total bank assets / mobile-app rating / customer-support channels** are NOT on the rate-card page itself. They live on the institution's `Bankrate review` sub-page (`/banking/reviews/{bank-slug}/`). The rate card has a `Read review` anchor that points there. If the user requested these fields, follow the review URL with a second `browse cloud fetch` per institution — review pages are under 1 MB and fetchable.
- **The `/landing/savings/rates` URL is a WRT-only shell (no static institution-details).** It's smaller (~432 KB) and contains only the WRT widget chrome. Useful as a "where is the WRT widget" probe but useless for static parsing. The `/landing/cd-rates-{d,f,g}/` variants are the marketing landers — all >1 MB.
- **No public REST/GraphQL API exists for Bankrate rate data.** Probes against `/api/v{1,2}/...`, `api.bankrate.com/{graphql,deposit-products,savings-accounts}`, `/api/next/savings/...` all returned 404. The only programmatic path is the editorial-article HTML (this skill) or the WRT GraphQL middleware (which is auth-gated and not designed for third-party access — don't try to use it directly).
- **DNS for `connect.{region}.browserbase.com` may be REFUSED on some sandboxed agents.** If `browse open --remote` fails with `getaddrinfo ENOTFOUND connect.usw2.browserbase.com`, the sandbox can reach the REST API (`api.browserbase.com`) but not the CDP WebSocket layer. In that case, the editorial-fetch path is the only working surface — gracefully degrade and return what static HTML provides, flagging in the response that custom-filter dimensions are unavailable.

## Expected Output

Three distinct outcome shapes.

### Outcome A — editorial best-of fetch succeeded (`source: "editorial-fetch"`)

```json
{
  "success": true,
  "source": "editorial-fetch",
  "page_url": "https://www.bankrate.com/banking/cds/best-1-year-cd-rates/",
  "page_title": "Best 1-Year CD Rates for May 2026 - Up to 4.10% | Bankrate",
  "account_type": "CD",
  "term_filter": "1 yr",
  "as_of": "2026-05-13T14:54:00.894Z",
  "reviewed_by": { "name": "Greg McBride, CFA", "jobTitle": "Former Chief Financial Analyst" },
  "filters_applied": { "account_type": "CD", "term": "1 yr", "sort": "editorial-ranking" },
  "filters_unavailable_on_this_surface": ["custom_min_apy", "compounding_frequency", "institution_type", "atm_access", "mobile_app_rating", "zip_localized_credit_unions"],
  "results": [
    {
      "rank": 1,
      "institution_id": "5390",
      "bank_name": "E*TRADE",
      "account_name": "E*TRADE 1-Year CD",
      "account_type": "CD",
      "term_months": 12,
      "apy": 0.0410,
      "min_opening_deposit": 0,
      "min_balance_for_apy": 0,
      "monthly_fee": 0,
      "monthly_fee_waiver_conditions": null,
      "compounding_frequency": "Daily",
      "fdic_insured": true,
      "ncua_insured": false,
      "insurance_limit_usd": 250000,
      "early_withdrawal_penalty": "3 months interest",
      "bankrate_score": 4.5,
      "bankrate_score_label": "Bankrate CD score",
      "stars_out_of_5": 4.5,
      "best_for_tag": null,
      "editorial_copy": "E*TRADE from Morgan Stanley offers CDs in terms from six months to five years, all of which earn competitive rates. These CDs have no minimum deposit requirement, making them accessible to most savers.",
      "promo_bonus": null,
      "all_term_rates": [
        { "term": "6 months", "apy": 0.0405, "min_deposit_text": "No minimum" },
        { "term": "1 year",  "apy": 0.0410, "min_deposit_text": "No minimum" },
        { "term": "2 years", "apy": 0.0375, "min_deposit_text": "No minimum" },
        { "term": "3 years", "apy": 0.0375, "min_deposit_text": "No minimum" },
        { "term": "5 years", "apy": 0.0385, "min_deposit_text": "No minimum" }
      ],
      "bank_logo_url": "https://www.bankrate.com/2022/03/17155858/Morgan-Stanley-logo.jpg?auto=webp&fit=&width=200&format=pjpg",
      "bankrate_review_url": "https://www.bankrate.com/banking/reviews/morgan-stanley-private/",
      "bankrate_account_url": "https://www.bankrate.com/banking/cds/best-1-year-cd-rates/#institution-details-5390",
      "open_account_url": "https://www.bankrate.com/hlink_redirects/?...",
      "is_affiliate": true
    }
  ]
}
```

### Outcome B — WRT widget (browser-session) read succeeded (`source: "wrt-browser"`)

Same per-card shape as Outcome A; the envelope changes:

```json
{
  "success": true,
  "source": "wrt-browser",
  "page_url": "https://www.bankrate.com/banking/cds/cd-rates/",
  "account_type": "CD",
  "filters_applied": {
    "account_type": "CD",
    "cd_term": "1 yr",
    "deposit_amount": 10000,
    "zip_code": "10001",
    "min_apy": 0.04,
    "monthly_fee_zero_only": true,
    "fdic_or_ncua": true,
    "institution_type": ["Online bank", "Credit union"],
    "compounding": "Daily",
    "sort": "Highest APY"
  },
  "filters_unavailable_on_this_surface": [],
  "result_count": 23,
  "results": [ /* same per-card shape as Outcome A */ ]
}
```

### Outcome C — static-fetch and browser-fallback both unavailable (`success: false`)

```json
{
  "success": false,
  "reason": "fetch_size_limit_exceeded_and_browser_unavailable",
  "page_url": "https://www.bankrate.com/banking/savings/best-high-yield-interests-savings-accounts/",
  "details": "Page is 1.05 MB (above the 1 MB Browserbase Fetch ceiling) and the agent's session could not reach connect.{region}.browserbase.com for CDP. Suggest retry from a sandbox with full Browserbase connectivity, or use the smaller /banking/cds/best-1-year-cd-rates/ surface for CD queries."
}
```

Other `reason` values: `page_not_found` (404 on a stale "best of" URL), `unknown_account_type_intent` (user query didn't map to a known canonical URL), `affiliate_url_only_capture_requested_but_no_cards_found` (page structure changed and the institution-details regex returned zero matches).
