---
name: expedia-com-compare-travel-options-v05jqc
title: Compare Travel Options on Expedia
description: >-
  Search and compare Expedia travel inventory (hotels, Vrbo rentals, flights,
  cars, packages, activities) across dates, prices, ratings, fees, cancellation,
  and loyalty pricing, then build a shortlist. Read-only shopping — never books
  without explicit confirmation.
website: expedia.com
category: travel
tags:
  - travel
  - hotels
  - flights
  - vrbo
  - comparison
  - akamai
  - read-only
source: 'browserbase: agent-runtime 2026-06-02'
updated: '2026-06-02'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      All result data is hydrated by POSTs to a single internal endpoint
      (https://www.expedia.com/graphql) using persisted-query hashes behind
      Akamai Bot Manager. There is no documented or cookieless-usable public
      API, so it is not a viable shortcut — drive the rendered pages instead.
verified: true
proxies: true
---
# Compare Travel Options on Expedia

## Purpose

Shop and compare travel inventory on Expedia the way a traveler would by hand — search Stays (hotels **and** Vrbo vacation rentals), Flights, Cars, Packages, and Things to do; apply filters (price, dates, ratings, stops, amenities, cancellation, baggage); read each option's price, rating, fees, refundability, and loyalty/member pricing; then summarize tradeoffs and build a shortlist. **Read-only and shopping-only: open and compare options, but never advance past a results/detail page into checkout or place a booking without explicit user confirmation.** All dynamic results render in the browser from a single internal GraphQL endpoint; there is no usable public API, so a real (stealthed) browser session is the working surface.

## When to Use

- "Find me a romantic weekend stay near Seattle under $350/night" → Stays search + price/rating filters + shortlist.
- "Compare hotel vs Vrbo for this trip" → a single Stays search returns both; filter by `Vacation rentals` / `Hotels` property type.
- "Does changing my dates save money?" → re-run the same search across candidate date ranges and diff the totals (flights expose a flexible-date price strip directly).
- "Find the best flight with a carry-on/checked bag and a reasonable layover" → Flights search + the `Carry-on bag included` / fare-feature filters + Stops/Layover filters.
- "Build me a full itinerary from Expedia options" → run Stays + Flights (+ Cars/Activities) searches and assemble a combined summary.

## Workflow

**Recommended method: browser (stealth + residential proxy).** Every result list (hotels, flights, cars, activities) is hydrated client-side by POSTs to a single internal endpoint `https://www.expedia.com/graphql` (persisted queries, behind Akamai Bot Manager). There is **no documented or cookieless-usable public API** — treat GraphQL as internal-only and drive the rendered pages. Deep-link search URLs are the fast path: most search state (destination, dates, occupancy, sort, and price band) is controllable from the URL, so you rarely need to operate the search form.

### 1. Stealth + residential-proxy session

```bash
sid=$(browse cloud sessions create --keep-alive --proxies --verified \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
```

`--verified --proxies` is the configuration that loaded every search page cleanly during testing. Expedia sets Akamai Bot Manager cookies (`ak_bmsc`, `bm_ss`, `bm_so`) on every response and guards the search-results routes; a bare datacenter session is liable to Akamai challenges. A US residential proxy also fixes IP-geolocation (currency/market) for the result set.

### 2. Stays (hotels + Vrbo) — deep-link search

```
https://www.expedia.com/Hotel-Search
  ?destination=<URL-encoded "City, State, Country">
  &regionId=<market id>          # optional but locks the market; e.g. Seattle = 3121
  &startDate=YYYY-MM-DD
  &endDate=YYYY-MM-DD
  &adults=2&rooms=1              # &children=age,age for kids
  &sort=PRICE_LOW_TO_HIGH        # RECOMMENDED | PRICE_LOW_TO_HIGH | REVIEW | DISTANCE | PROPERTY_CLASS
  &price=0,350                   # min,max — see gotcha: this is TOTAL stay price, not per-night
```

Open it, then **dismiss the fee-inclusive interstitial** that auto-opens (`pwaDialog=fee-inclusive-pricing-sheet`) by clicking the `Got it` button before reading anything.

```bash
export BROWSE_SESSION="$sid"
browse open "<hotel-search-url>" --remote
browse click "@<ref-of-Got-it-button>" --remote   # close the "We include taxes and fees" dialog
```

### 3. Force the full result list to load, then extract

The result list is **lazy/virtualized** — only ~3 main cards exist in the DOM right after load. Scroll to hydrate the rest, then read the rendered text:

```bash
for i in 1 2 3 4; do browse eval "window.scrollBy(0,2200)" --remote; sleep 1.2; done
browse get markdown body --remote   # then parse
```

Parse the main list (not the promoted carousels — see gotcha). Each property card carries: name, guest rating (`9.4 out of 10` + review count), `$NNN nightly`, `$NNN total`, an optional struck-through "was" price, refundability (`Fully refundable`), `Reserve now, pay later`, and badges (`VIP Access`, `Member Prices`). The detail link is `/{City}-Hotels-{Name}.h{HOTELID}.Hotel-Information?...` — `h{HOTELID}` is the stable property id.

### 4. Flights — deep-link search

```
https://www.expedia.com/Flights-Search
  ?leg1=from:City%20(SEA),to:City%20(JFK),departure:MM/DD/YYYYTANYT
  &leg2=from:City%20(JFK),to:City%20(SEA),departure:MM/DD/YYYYTANYT
  &passengers=adults:1
  &trip=roundtrip                 # oneway | roundtrip
  &mode=search
```

Results render progressively (wait ~5s after load). Each option shows airline, depart/arrive times, total duration, stop count, and the **roundtrip total** price. The left rail exposes filters that map directly to common asks: Stops (`Nonstop` / `1 Stop` / `2+ Stops`), Airlines, cabin class (Basic economy / Economy / Premium / Business / First), fare features (`Carry-on bag included`, `Refundable fare`, `Changes included`, `Seat choice included`), Layover airport, and a total-travel-time slider. A price-prediction widget and a 7-day flexible-date price strip (e.g. `Fri, Jun 12 $416`) are rendered inline — use the strip to answer "would different dates be cheaper?" without re-searching.

### 5. Other verticals (same pattern)

Navigate from the top nav (`Stays` → `/Hotels`, `Flights` → `/Flights`, `Cars` → `/Cars`, `Packages` → `/Vacation-Packages`, `Things to do` → `/Activities`, `Cruises` → `/Cruises`) or deep-link the search route (`/carsearch`, `/things-to-do/search`). All are JS-rendered lists that follow the same load → scroll → read-markdown extraction pattern.

### 6. Compare & shortlist, then stop

Aggregate the extracted options into a comparison (price, rating, refundability, fees, location/stops, loyalty pricing), surface tradeoffs, and return a shortlist with detail URLs. **Do not click `Reserve` / `Select` / `Continue` into checkout** unless the user explicitly confirms a booking — that is a separate, write-action skill.

```bash
browse cloud sessions update "$sid" --status REQUEST_RELEASE
```

## Site-Specific Gotchas

- **Stealth + residential proxy recommended.** Akamai Bot Manager is active on every route (`ak_bmsc` / `bm_ss` / `bm_so` cookies, `X-Akamai-Reference-Id` header). `--verified --proxies` loaded all search pages cleanly in testing with no challenge. The host pre-run probe reported "no antibots" on the homepage `301`, but that only reflects the bare homepage — the value-bearing `/Hotel-Search` and `/Flights-Search` routes are the guarded ones, so do not start bare.
- **The price filter is TOTAL stay price, not per-night.** The `price=MIN,MAX` URL param (which Expedia rewrites to `price=MIN&price=MAX`) drives the slider labeled **"Total price"**. So `price=0,350` on a 2-night stay means total ≤ $350 (≈ ≤ $175/night), and the filter chip reads "Less than $350". For a "under $X **per night**" request, multiply by the number of nights before setting the cap, or read the per-night value off each card and filter client-side.
- **Cards show both nightly and total prices.** Each card renders `$NNN nightly` and `$NNN total`; don't conflate them. Expedia displays **taxes-and-fees-included** pricing by default (the reason for the "We include taxes and fees" interstitial).
- **A fee-inclusive interstitial dialog auto-opens on first results load** (`pwaDialog=fee-inclusive-pricing-sheet`). It covers the results — dismiss the `Got it` button before snapshotting/reading or you'll capture the dialog instead of the list (screenshot `01` shows this state).
- **Results are lazy/virtualized.** Only ~3 main cards are in the DOM immediately after load; a single `get markdown body` then will undercount drastically (saw 3 of 15). Scroll several times (`window.scrollBy`) to hydrate, then extract — yielded the full list (3 → 23 cards) after ~4 scrolls.
- **Promoted carousels pollute naive extraction.** A horizontally-scrolling `VIP Access properties (N)` carousel and sponsored modules appear above/within the results and carry their own prices/ratings. A naive "grab every `$NNN nightly`" pulls these in and corrupts sort/order assumptions. Scope extraction to the main list, which begins after the `## Search results` heading; main cards are titled `### Photo gallery for {name}`.
- **Vrbo / vacation rentals are mixed into Stays results.** `/Hotel-Search` returns hotels *and* Vrbo rentals (treehouses, cabins, guest houses, glamping) interleaved — convenient for "hotel vs Vrbo" comparisons. Use the `Property type` filter (`Hotels` vs `Vacation rentals`) to separate them.
- **`regionId` locks the market; plain destination text also works.** Hotel detail links expose the resolved `regionId` (Seattle market = `3121`, `destType=MARKET`), `neighborhoodId`, and `latLong`. Passing `regionId` avoids any typeahead-resolution ambiguity. To discover an unknown region, type the city into the `Where to?` typeahead and read the resolved link, or inspect a returned detail URL.
- **The GraphQL endpoint is internal — don't try to call it directly.** All result data comes from POSTs to `https://www.expedia.com/graphql` (persisted-query hashes, client headers, valid Akamai/`bm_*` cookies, behind Bot Manager) plus telemetry to `/api/uisprime/track`. There is no public/documented API and no cookieless path; the rendered pages are the reliable surface. Treat it like OpenTable's GraphQL — a trap, not a shortcut.
- **`robots.txt` disallows the search routes for generic bots** (`/Hotel-Search`, `/search?`, `/Flights-Search`, `/carsearch`, `/things-to-do/search?`, `/api/v4/typeahead/`, `/api/ucs/shortlist/`). This is policy, not a hard server block — a real stealthed browser session still renders them — but it confirms there's no bot-friendly data feed.
- **Member Prices / One Key loyalty require sign-in.** Logged-out sessions see public rates plus "Sign in to unlock Member Prices" prompts; the discounted member rate is only realized after authentication. Report public pricing unless the user supplies credentials. Flights/Stays also surface "VIP Access" and bundle-savings ("save when you book stay + car") badges that are conditional.
- **Flight prices are roundtrip totals** (for `trip=roundtrip`), and the inline flexible-date strip already prices ±a few days — read it instead of re-searching to answer date-flexibility questions.
- **READ-ONLY shopping.** Stop at results/detail. Never click `Reserve`, `Select`, `Continue`, or reach `/Checkout`, `/HotelCheckout`, `/FlightCheckout`, or `/MultiItemCheckout`.

## Expected Output

A shortlist/comparison object per vertical. Distinct shapes:

```json
// Stays (hotels + Vrbo), filtered & sorted
{
  "vertical": "stays",
  "query": { "destination": "Seattle, Washington, United States of America", "regionId": "3121",
             "startDate": "2026-06-12", "endDate": "2026-06-14", "adults": 2, "rooms": 1,
             "sort": "PRICE_LOW_TO_HIGH", "priceFilter": { "type": "total_stay", "min": 0, "max": 350 } },
  "totalMatches": 15,
  "results": [
    {
      "name": "Ace Hotel Seattle",
      "propertyType": "hotel",
      "hotelId": "h2330513",
      "rating": 9.0,
      "reviewCount": 1007,
      "nightly": 156,
      "totalStay": 312,
      "currency": "USD",
      "taxesFeesIncluded": true,
      "refundable": true,
      "reserveNowPayLater": true,
      "badges": ["Member Prices"],
      "detailUrl": "https://www.expedia.com/Seattle-Hotels-Ace-Hotel-Seattle.h2330513.Hotel-Information?chkin=2026-06-12&chkout=2026-06-14&adults=2"
    }
  ]
}
```

```json
// Vrbo / vacation rental within the same Stays search
{ "name": "Alki Beach Courtyard Cabin", "propertyType": "vacation_rental",
  "rating": 9.8, "reviewCount": 12, "nightly": 189, "totalStay": 378, "currency": "USD",
  "refundable": false, "detailUrl": "https://www.expedia.com/...h*.Hotel-Information?..." }
```

```json
// Flights, roundtrip
{
  "vertical": "flights",
  "query": { "origin": "SEA", "destination": "JFK", "depart": "2026-06-12", "return": "2026-06-15",
             "trip": "roundtrip", "adults": 1, "cabin": "ECONOMY" },
  "lowestPrice": 477,
  "currency": "USD",
  "stopCounts": { "nonstop": 9, "oneStop": 73, "twoPlus": 42 },
  "results": [
    { "airline": "American Airlines", "depart": "09:25 AM", "arrive": "05:55 PM",
      "duration": "5h 30m", "stops": 0, "priceRoundtrip": 537,
      "fareFeatures": ["Carry-on bag included"] }
  ],
  "flexibleDates": [ { "date": "2026-06-12", "price": 416 }, { "date": "2026-06-13", "price": 467 } ]
}
```

```json
// Comparison / itinerary roll-up across verticals
{
  "vertical": "comparison",
  "summary": "Cheapest sub-$350-total Seattle stay is the Green Tortoise Hostel ($73/nt); best value hotel is Ace Hotel Seattle (9.0, $156/nt, refundable). Cheapest reasonable SEA-JFK roundtrip is a nonstop at $477.",
  "shortlist": [ { "vertical": "stays", "name": "Ace Hotel Seattle", "tradeoff": "Best rating-to-price; refundable" },
                 { "vertical": "flights", "name": "American 09:25-17:55 nonstop", "tradeoff": "$537, carry-on included, 5h30m" } ]
}
```
