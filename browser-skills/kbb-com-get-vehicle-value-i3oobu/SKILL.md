---
name: kbb-com-get-vehicle-value-i3oobu
title: KBB Get Vehicle Value
description: >-
  Look up a vehicle's Kelley Blue Book market values (Trade-In, Private Party,
  Typical Listing Price, Fair Purchase Price) plus original MSRP, 5-Year Cost to
  Own breakdown, and resolved trim specs, given year/make/model/trim or a full
  KBB URL plus mileage, ZIP, and condition. Read-only — never engages the
  Instant Cash Offer or dealer-lead funnels.
website: kbb.com
category: automotive
tags:
  - automotive
  - vehicles
  - valuation
  - kbb
  - pricing
  - trade-in
source: 'browserbase: agent-runtime 2026-05-16'
updated: '2026-05-16'
recommended_method: hybrid
alternative_methods:
  - method: api
    rationale: >-
      Kelley Blue Book's public Price Advisor widget
      (upa.syndication.kbb.com/{usedcar,newcar}/?format=json) returns clean Fair
      Purchase Price + Typical Listing Price + MSRP values using a hardcoded
      public API key embedded in every KBB page. No auth, no anti-bot challenge
      observed across 4 verification fetches. Used to retrieve the
      dealer-context values (FPP, Retail, MSRP).
  - method: url-param
    rationale: >-
      The trim page itself, when fetched with ?intent=trade-in-sell, inlines the
      condition-banded Trade-In and Private Party values as a
      pricing.{tradein,privateparty}.{fair,good,verygood,excellent} JSON blob —
      and the syndication API does not expose these. Used to retrieve the
      individual-seller-context values.
  - method: browser
    rationale: >-
      Fallback only — drive the value-picker form via browse cloud browse with
      --verified --proxies if Akamai challenges the page-fetch path. Not
      needed for the canonical flow.
verified: true
proxies: true
---
# KBB Get Vehicle Value

## Purpose

Given a vehicle identification (year/make/model/trim, full KBB URL, VIN, or free-form description) plus mileage, ZIP, and condition, return Kelley Blue Book's market values as structured JSON. Surfaces all four KBB value contexts (Trade-In, Private Party, Typical Listing Price / Suggested Retail, Fair Purchase Price), the resolved canonical vehicle (body style, drivetrain, engine, transmission), original MSRP, the 5-Year Cost to Own breakdown when available, standard / optional equipment, and the canonical KBB value-page URL. Read-only — never engages the Instant Cash Offer / Sell My Car / dealer-lead funnels.

## When to Use

- Trade-in negotiations, private-party listings, dealer-asking-price sanity checks, and used-car shopping baselines.
- Fleet valuation, insurance total-loss disputes, depreciation modelling, lease residual estimation.
- Anywhere you'd otherwise scrape the KBB value page or pay for the KBB B2B Vehicle Pricing API — the public syndication endpoint described below returns the same FPP/Retail values the marketing pages display, and the public trim page JSON exposes the condition-banded Trade-In / Private Party values.
- New-car shopping when you want KBB's Fair Purchase Price for a specific trim before stepping into a dealer.

## Workflow

KBB has no documented public API — the official B2B pricing API requires a paid partnership. However, **two undocumented surfaces back the marketing pages and require no auth**: (a) `upa.syndication.kbb.com/{usedcar,newcar}/?format=json` (the Price Advisor widget endpoint, called with a hardcoded public API key embedded in every KBB page), and (b) the trim-page HTML itself, which inlines a `pricing.{tradein,privateparty}.{fair,good,verygood,excellent}` JSON blob when fetched with `?intent=trade-in-sell`. Lead with this hybrid path — one API call + one page fetch — and fall back to scripted browsing only if both endpoints are blocked (no evidence of that in 4 verification fetches across 3 vehicles).

### 1. Resolve the canonical trim slug + vehicleId

KBB value URLs have the shape `https://www.kbb.com/{make-slug}/{model-slug}/{year}/{trim-style-slug}/` where slugs are lowercase, hyphen-separated, and `-style-` is the body style (e.g. `lx-sedan-4d`, `ex-coupe-2d`, `ex-l-hatchback-4d`). If the user gave you:

- **A full KBB URL** — use as-is. Skip to step 2.
- **A `{year, make, model, trim}` tuple or free-form description** — fetch `https://www.kbb.com/{make}/{model}/{year}/` and extract the matching trim URL from `href="/{make}/{model}/{year}/{trim-style-slug}/"` anchors. If multiple body styles share a trim (sedan vs coupe vs hatchback), append `?bodystyle={sedan|coupe|hatchback}` or pick the most-specific slug (`-sedan-4d`, `-coupe-2d`, `-hatchback-4d`, `-suv-4d`, `-pickup-truck`).
- **A VIN** — KBB resolves VIN via the value-picker UI; the canonical entry point is `https://www.kbb.com/whats-my-car-worth/vin/` but the VIN-decode endpoint is gated behind a one-shot anonymous-session token. For VIN flows, fall back to the browser path (step 4). Once you've extracted `{year, make, model, trim}` from the VIN, return to step 1's tuple path.

Once on the trim page, the canonical `vehicleId` is the unique integer that appears in `vehicleid=<int>` query parameters within the page HTML (look in the embedded `priceAdvisorQuery` block or the `tradeInSellPath` link). Used vehicles and new vehicles use the same `vehicleId` namespace but route to different APIs in step 2.

### 2. Fetch Fair Purchase Price + Typical Listing Price via the syndication API

The KBB Price Advisor widget that renders on every value page is backed by `upa.syndication.kbb.com`. Append `&format=json` (instead of the page's `&format=svg`) to get a clean JSON response with no scraping.

**Used vehicles** (model year ≤ current year - 1):

```
GET https://upa.syndication.kbb.com/usedcar/
    ?apikey=76a9532b-fa54-4d02-8e6a-91c3fb85376c
    &zipcode={zip}
    &vehicleid={vehicleId}
    &pricetype=retail
    &condition={excellent|verygood|good|fair}
    &mileage={miles}
    &format=json
```

**New vehicles** (current or future model year):

```
GET https://upa.syndication.kbb.com/newcar/
    ?apikey=76a9532b-fa54-4d02-8e6a-91c3fb85376c
    &zipcode={zip}
    &vehicleid={vehicleId}
    &pricetype=retail
    &format=json
```

The `apikey` is hardcoded across every KBB page (search the page HTML for `apikey=` to confirm) and is not user-keyed — it's the public-web syndication key, distinct from the paid B2B Vehicle Pricing API key. Treat it as a published constant.

Response shape (relevant portion):

```json
{
  "Data": {
    "APIData": {
      "vehicle": {
        "dataVersion": { "requestDate": "2026-05-15T00:00:00Z", "versionNumber": 12345 },
        "values": [
          { "type": "FPP",    "source": "VRS",  "low": 15290, "high": 17290, "value": 16290 },
          { "type": "Retail", "source": "VRS",  "low": 15930, "high": 17930, "value": 16930 },
          { "type": "MSRP",   "source": "VRS",  "low": null,  "high": null,  "value": 25400 },
          { "type": "Asking", "source": "None", "error": "value.notAvailable" }
        ]
      }
    },
    "overlay": { "infoAndDefinitions": { "footer": "© 2026 Kelley Blue Book ... 05/15/2026 Edition for GA 30307." } }
  }
}
```

- `type: "FPP"` → **Fair Purchase Price** (mid-point + low/high = Fair Market Range) — what a consumer can reasonably expect to pay this week buying from a dealer.
- `type: "Retail"` → **Typical Listing Price** (formerly Suggested Retail Price) — dealer asking price with reconditioning + dealer profit baked in.
- `type: "MSRP"` → original Manufacturer's Suggested Retail Price (new-car endpoint only; null for used).
- `type: "Asking"` → individual seller's asking price; populated only when query was made with `&askingPrice=`.

Data-freshness timestamp = `Data.APIData.vehicle.dataVersion.requestDate` (weekly cadence — KBB publishes Mondays). The footer string also surfaces the human-readable edition (`05/15/2026 Edition for GA 30307`).

### 3. Fetch Trade-In + Private Party values via the trim page

The syndication API only returns dealer-context values (FPP, Retail, MSRP). For the individual-seller-context values (Trade-In and Private Party), the kbb.com trim page itself embeds them as JSON — but only when navigated with `?intent=trade-in-sell`.

```
GET https://www.kbb.com/{make}/{model}/{year}/{trim-style-slug}/
    ?intent=trade-in-sell
    &mileage={miles}
    &zipcode={zip}
```

Grep the response body for `"pricing":{`:

```json
"pricing": {
  "privateparty": { "fair": 11990, "good": 13240, "verygood": 13740, "excellent": 14190 },
  "tradein":      { "fair": 10020, "good": 11120, "verygood": 11520, "excellent": 11920 }
}
```

Each band is a **single dollar value per condition**, not a low/mid/high range. Pick the value for the user's attested condition. If the user gave a range or didn't specify, default to `good` (KBB's documented default: "Has some repairable cosmetic defects, free of major mechanical problems, ~50% of all cars we value").

The same fetch also exposes:

- `info.bodyStyle` (`Sedan`, `Coupe`, `Hatchback`, `SUV`, `Pickup Truck`, `Convertible`, `Wagon`, `Van/Minivan`).
- `info.driveTrain` (`FWD`, `RWD`, `AWD`, `4WD`).
- `info.fuelType`, `info.transmission`, `info.engineType`.
- `info.chromeStyleId` and `info.trimId` (KBB internal identifiers — preserve if you'll re-query later, since they're sticky across editions).
- `selectedOptionsData.groups[].sections[].options[]` — the full standard + optional equipment list with `isTypical`, `isSelected`, `isConfigurable` flags.
- JSON-LD block (`<script type="application/ld+json">`) with `name`, `model`, `brand`, `image`, dimensions (`width`, `height`), `offers.price`, and an expert-review excerpt.

### 4. (Optional) Fetch 5-Year Cost to Own — new vehicles only

For current-and-future model years (2025+), KBB publishes a cost-to-own page:

```
GET https://www.kbb.com/{make}/{model}/{year}/cost-to-own/
```

Grep for each category — each is a `{year1,year2,year3,year4,year5,total}` block:

```
depreciation, fuel, insurance, maintenance, repairs, financing, stateFees, costtoown
```

The aggregate `totalCostToOwn` value also appears at the top. Used-vehicle pages (year ≤ current - 1) do NOT have a `/cost-to-own/` subroute — KBB only publishes 5-year forward projections for new cars. For used vehicles, surface `depreciation.totalThreeYearDepreciation` and `depreciation.historicalValues[]` (annual resaleValue + tradeInValue back-history) from the trim page instead.

### 5. (Optional) Fetch original MSRP for used vehicles

The `/newcar/` syndication endpoint returns null `MSRP` for used vehicles. To recover the original MSRP of a used vehicle, hit the matching new-vehicle endpoint with the same `vehicleId` but using `/usedcar/` — the `Retail` value approximates current dealer asking, not historical MSRP. For true original MSRP on a used vehicle, scrape the trim page's `<script type="application/ld+json">` block (`offers.price`) — the JSON-LD `offers.price` field carries the historical sticker price for the model year.

### Browser fallback

If both the syndication API and the trim-page HTML are blocked (Akamai 403 — not observed in our testing, but the site does sit behind Akamai Bot Manager and `_abck`/`bm_sz` cookies are set on every response), drive the value-picker form via `browse cloud browse` with `--verified --proxies`:

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies | jq -r '.id')
browse cloud browse --connect "$SID" open "https://www.kbb.com/whats-my-car-worth/"
# Pick year → make → model → style; type mileage + ZIP; choose condition.
# Each step is a click on a typeahead/select. Use `browse cloud browse snapshot` between steps.
browse cloud browse --connect "$SID" snapshot
# Final value page URL will be /{make}/{model}/{year}/{trim-style-slug}/?vehicleid=...&intent=trade-in-sell
browse cloud browse --connect "$SID" get url     # capture canonical URL
browse cloud browse --connect "$SID" get html body > value-page.html  # then parse as in step 3
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

**Do NOT click** "Get My Cash Offer", "Sell My Car to a Dealer", "Connect with Dealer", "Get Pre-Qualified", "Apply for Financing", or any control that opens a lead-gen form. Submitting a real VIN to the Instant Cash Offer flow lands the user on a dealer-lead funnel that captures name/email/phone — read the offer range from the displayed widget and stop. ZIP is the only PII allowed in the anonymous valuation form.

## Site-Specific Gotchas

- **The syndication `apikey` is public, not user-keyed.** `76a9532b-fa54-4d02-8e6a-91c3fb85376c` appears verbatim in every KBB page's HTML and is unchanged across regions, makes, and years (verified 2026-05-15 across Civic 2018 / Camry 2020 / Civic 2025). It's the "Price Advisor widget" syndication key — distinct from the paid B2B Vehicle Pricing API key (which requires partnership). Don't request a key from KBB; just use this one.
- **Condition does NOT affect FPP / Retail values from the syndication API.** Verified 2026-05-15: the same vehicleId + ZIP + mileage with `condition=` cycled through `excellent/verygood/good/fair` returns identical FPP and Retail values. FPP and Retail are mileage-and-region-banded, not condition-banded — they represent dealer-reconditioned asking prices. The `condition=` parameter only changes the SVG widget's prose footer ("Good (50% of all cars we value)" vs. "Excellent (3% of all cars)"). Trade-In and Private Party (from the trim page, step 3) ARE condition-banded — those are the values that vary with the user's attested condition.
- **Trade-In / Private Party live in the trim page, NOT the syndication API.** Only the `usedcar/` endpoint's FPP and Retail are exposed via syndication. To get TradeIn/PrivateParty you MUST fetch the trim page with `?intent=trade-in-sell`. Without that query param, the page renders the buy-used context and the `pricing.tradein` / `pricing.privateparty` JSON is omitted.
- **`?intent=trade-in-sell` flips the page context but does NOT trigger a dealer-lead form.** It's safe to read — the lead form only opens when the user clicks "Get Cash Offer" or "Find a Dealer". The URL alone is read-only.
- **Used vs. new endpoint routing.** Use `/usedcar/?...` for prior model years and `/newcar/?...` for the current and future model years. Hitting the wrong endpoint returns 404 or null values. Heuristic: if `year >= currentYear` use `/newcar/`, else `/usedcar/`. For the most-recent model year that's still being sold new alongside the next model year (e.g. 2025 in May 2026), try `/newcar/` first; if values are null, retry with `/usedcar/`.
- **5-Year Cost to Own only for new-and-future model years.** The `/cost-to-own/` subroute exists only when KBB still publishes a forward-looking 5-year projection. Used vehicles (year ≤ currentYear - 1) return 404 on `/cost-to-own/` — surface 3-year historical depreciation from the trim page instead (`depreciation.totalThreeYearDepreciation` + `historicalValues[]`).
- **`bodyStyle` disambiguation on multi-style trims.** Some models (Honda Civic LX, Toyota RAV4 LE, BMW 3-Series) have a trim available in multiple body styles (sedan/coupe/hatchback). The trim slug already encodes the style (`lx-sedan-4d` vs `lx-coupe-2d` vs `lx-hatchback-4d`), but the model page lists both `href="/honda/civic/2018/lx-sedan-4d/"` AND `href="/honda/civic/2018/lx-coupe-2d/"` for the same trim name. Disambiguate via the user-supplied body style; if absent, default to the most popular style for that model (sedan for cars, suv-4d for SUVs, pickup-truck for trucks).
- **Akamai is in front of kbb.com, but the syndication subdomain is permissive.** `_abck`, `bm_sz`, `bm_mi`, `ak_bmsc` cookies are set on every kbb.com response. In 4 verification fetches across Civic / Camry / 2 years / 2 ZIPs (97818 OR, 30307 GA), we got clean 200s with no challenge interstitials. The site does have a "200 OK with redirect to anti-bot challenge page" failure mode that other reports cite — if you see HTML starting with `<html lang="en"><head><title>kbb.com</title>` and no value JSON, fall back to step 4 (browser with Verified + proxy). `upa.syndication.kbb.com` is served by a different infra stack and has not exhibited bot challenges in any test.
- **ZIP geolocation: query param wins over cookie wins over IP.** KBB respects `&zipcode=` on both the syndication API and the trim page URL; without it, the page sticks the request-IP's edgescape ZIP into a `ZipCode` cookie (we saw `OR 97818` defaulted to Boardman, Oregon — likely a Browserbase or upstream proxy egress). Always pass `&zipcode=` explicitly; trust the response's `infoAndDefinitions.footer` string (`Edition for GA 30307`) to confirm scope.
- **`vehicleid` is not stable across model-year editions.** Civic LX Sedan 4D was `vehicleid=431246` for the 2018 model year and a different ID for 2019+. Re-resolve from the trim page each time; don't cache the vehicleId without also pinning the year.
- **Mileage = 0 returns "typical mileage" values.** The syndication API treats `&mileage=0` (or omitted) as "use the typical mileage for this year". KBB's published "typical mileage" is roughly 12,000 mi/yr × age, e.g. ~96,000 mi for an 8-year-old vehicle. Pass real mileage when known; pass 0 explicitly when you want the "average car of this vintage" baseline.
- **The KBB Instant Cash Offer (ICO) flow is a lead-capture funnel — `success: true` does not mean "you got an offer".** ICO requires a real VIN, ZIP, and email/phone before showing the cash offer number. The skill is read-only; do not progress past the ZIP-and-VIN screen. The "Cash Offer range" that the value page sometimes shows in a small widget (`$X,XXX – $Y,YYY`) is a non-binding estimate and is safe to read without engaging the funnel.
- **Browser-connect via Browserbase WebSocket from this generator sandbox is currently DNS-restricted.** During iter-1, `connect.usw2.browserbase.com` was not resolvable from the generator's egress (only `api.browserbase.com` is on the allow-list), so live-browser screenshots could not be captured. The API-led workflow above completed end-to-end without ever needing the live-browser path. Consumers of this skill running in a normal Browserbase environment will have full `browse cloud browse` available; the fallback in step 4 is written assuming they do.
- **5-Year Cost to Own categories cover everything `task.md` requested except "opportunity cost".** KBB's current breakdown is `depreciation + fuel + insurance + maintenance + repairs + financing + stateFees + (sum) costtoown`. They retired the explicit "opportunity cost" line item in a 2024 rework — it's folded into `financing` (assumed APR 5.09% / 60 mo / typical down payment, per `financingDescription`). Surface `financing` as the line item; note that opportunity cost is no longer reported separately.

## Expected Output

```json
{
  "success": true,
  "query": {
    "year": 2018,
    "make": "Honda",
    "model": "Civic",
    "trim": "LX",
    "bodyStyle": "Sedan",
    "mileage": 65000,
    "zipcode": "30307",
    "condition": "good"
  },
  "resolved": {
    "year": 2018,
    "make": "Honda",
    "model": "Civic",
    "trim": "LX Sedan 4D",
    "trimSlug": "lx-sedan-4d",
    "vehicleId": 431246,
    "chromeStyleId": "397407",
    "bodyStyle": "Sedan",
    "drivetrain": "FWD",
    "engine": "4-Cyl, i-VTEC, 2.0 Liter",
    "transmission": "Automatic, CVT",
    "fuelType": "gasoline",
    "originalMSRP": { "value": 19150, "currency": "USD", "source": "json-ld" },
    "kbbUrl": "https://www.kbb.com/honda/civic/2018/lx-sedan-4d/"
  },
  "values": {
    "tradeIn": {
      "currency": "USD",
      "byCondition": { "fair": 10020, "good": 11120, "verygood": 11520, "excellent": 11920 },
      "selected": { "condition": "good", "value": 11120 }
    },
    "privateParty": {
      "currency": "USD",
      "byCondition": { "fair": 11990, "good": 13240, "verygood": 13740, "excellent": 14190 },
      "selected": { "condition": "good", "value": 13240 }
    },
    "typicalListingPrice": {
      "currency": "USD",
      "low": 15930,
      "mid": 16930,
      "high": 17930,
      "label": "Typical Listing Price (formerly Suggested Retail)"
    },
    "fairPurchasePrice": {
      "currency": "USD",
      "low": 15290,
      "mid": 16290,
      "high": 17290,
      "label": "Kelley Blue Book Fair Purchase Price"
    },
    "instantCashOffer": null
  },
  "fiveYearCostToOwn": null,
  "depreciation": {
    "totalThreeYearDepreciation": 2454,
    "currentResaleValue": 13150,
    "currentTradeInValue": 11050,
    "historicalValues": [
      { "year": 2023, "resaleValue": 15604, "tradeInValue": 13811, "annualDepreciation": 3119 }
    ]
  },
  "features": {
    "standard": [
      { "category": "Entertainment", "items": ["MP3 Player", "Bluetooth Streaming Audio"] },
      { "category": "Safety", "items": ["..."] }
    ],
    "optional": []
  },
  "dataFreshness": {
    "requestDate": "2026-05-15T00:00:00Z",
    "edition": "05/15/2026 Edition for GA 30307",
    "versionNumber": 12345
  }
}
```

### Outcome shapes for non-happy paths

```json
// Trim could not be resolved from year/make/model (no matching slug in the model page)
{ "success": false, "reason": "trim_not_found", "candidates": ["lx-sedan-4d", "lx-coupe-2d", "lx-hatchback-4d"] }

// Vehicle is too new — no FPP/MSRP yet (next-year model not yet priced)
{ "success": false, "reason": "values_not_published", "year": 2027, "make": "Honda", "model": "Civic" }

// Akamai challenge on the trim page (browser fallback required)
{ "success": false, "reason": "anti_bot_challenge", "remediation": "Retry with --verified --proxies via browser path" }
```

### New-vehicle response (current/future model year, includes 5-Year Cost to Own)

```json
{
  "success": true,
  "resolved": {
    "year": 2025, "make": "Honda", "model": "Civic", "trim": "LX",
    "vehicleId": 474112,
    "kbbUrl": "https://www.kbb.com/honda/civic/2025/lx/"
  },
  "values": {
    "msrp":              { "currency": "USD", "value": 25400 },
    "fairPurchasePrice": { "currency": "USD", "low": 23600, "mid": 24300, "high": 24900 },
    "typicalListingPrice": null,
    "invoice":           null
  },
  "fiveYearCostToOwn": {
    "currency": "USD",
    "total": 43351,
    "byCategory": {
      "depreciation": { "year1": 5294, "year2": 1404, "year3": 1765, "year4": 2146, "year5": 2547, "total": 13156 },
      "fuel":         { "year1": 1021, "year2":  872, "year3":  863, "year4":  866, "year5":  857, "total":  4479 },
      "insurance":    { "year1": 3293, "year2": 3293, "year3": 3293, "year4": 3293, "year5": 3293, "total": 16465 },
      "maintenance":  { "year1":    0, "year2": 1034, "year3":  519, "year4": 2051, "year5":  519, "total":  4123 },
      "repairs":      { "year1":    0, "year2":    0, "year3":  385, "year4":  641, "year5":  641, "total":  1667 },
      "financing":    { "year1": 1022, "year2":  817, "year3":  601, "year4":  373, "year5":  134, "total":  2947 },
      "stateFees":    { "year1":  242, "year2":    0, "year3":  136, "year4":    0, "year5":  136, "total":   514 }
    },
    "notes": "Opportunity cost was retired from KBB's breakdown in 2024 — it's now folded into the 'financing' line item (assumed APR 5.09% / 60-mo term)."
  }
}
```
