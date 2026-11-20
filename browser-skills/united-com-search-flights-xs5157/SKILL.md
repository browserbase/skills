---
name: united-com-search-flights-xs5157
title: United Airlines Flight Search
description: >-
  Search United Airlines flights between two airports for given dates and a trip
  type (one-way or round-trip), returning each result's times, duration, stops,
  flight numbers, cabin, fare brand, and price. Read-only — never books.
website: united.com
category: travel
tags:
  - travel
  - flights
  - airlines
  - united
  - read-only
  - akamai
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: browser
alternative_methods:
  - method: url-param
    rationale: >-
      The /en/us/fsr/choose-flights deep-link with f/t/d/r/tt/px/clm params is
      the recommended browser entry point — it bypasses the homepage typeahead
      form. It is NOT a standalone API path: the response is the React SPA shell
      with zero embedded flight data, so a real browser session is still
      required to harvest results. Surfaced here as a 'shortcut into the right
      page state', not a JSON endpoint.
  - method: api
    rationale: >-
      United's internal /api/flight/recentSearch returns 405 Method Not Allowed
      to GET and only accepts authenticated POSTs from the SPA's signed-session
      context. /api/airports/lookup/search returns 404. No usable out-of-band
      JSON surface for cash-fare search was found — don't waste time
      reverse-engineering.
verified: true
proxies: true
---
# United Airlines Flight Search

## Purpose

Given an origin airport, destination airport, depart date (and optionally a return date), trip type (one-way or round-trip), and a passenger count, return the list of available United Airlines flights for those parameters — each flight's departure / arrival times, duration, stop count, flight number(s), cabin class, fare brand, and price. **Read-only — never click "Select", "Continue", or any seat / fare / book button. Stop at the results page (`/en/us/fsr/choose-flights`).**

## When to Use

- "What are the cheapest non-stops SFO → JFK on July 15?"
- "Compare one-way vs round-trip pricing on LAX → ORD next Friday."
- Daily price-watch across a fixed origin/destination/date.
- Any flow that needs UA's published fares + schedules **without** committing to a booking.
- Do **not** use this skill for award-mile / MileagePlus searches — those live on a different surface (`/ual/en/us/flight-search/book-a-flight/results`) and have a different fare model.

## Workflow

The United flight-search UI is a JavaScript SPA. The cleanest path is to **navigate directly to the search-results deep-link URL** (`/en/us/fsr/choose-flights?f=...&t=...&d=...&r=...&tt=...`) instead of filling the homepage's typeahead form — this skips airport autocomplete, date-picker, and trip-type radio entirely, and avoids the typeahead-timing bugs that the form path is prone to. The page is still client-side rendered, so a real browser session is required to harvest the flight cards; the URL is just a shortcut into the right page state.

A residential-proxy + verified (Verified) Browserbase session is mandatory — the site is fronted by Akamai and a bare datacenter IP gets cookie / `_abck` challenges before any results render.

### 1. Verified + residential-proxy session

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies | jq -r .id)
export BROWSE_SESSION="$SID"
```

Both `--verified` (Verified browsers) and `--proxies` (residential proxy pool) are required. Confirmed via `browse cloud fetch` evidence: `_abck` and `bm_*` Akamai cookies are set on every response, and a bare-IP session gets a challenge page in place of the SPA shell.

### 2. Construct the deep-link URL

```
https://www.united.com/en/us/fsr/choose-flights
  ?f={ORIGIN_IATA}
  &t={DEST_IATA}
  &d={DEPART_YYYY-MM-DD}
  &r={RETURN_YYYY-MM-DD}          # omit for one-way
  &tt={1|0|2}                      # 1=round-trip, 0=one-way, 2=multi-city
  &sc=7                            # search-class — keep 7 for cash fares
  &px={PASSENGER_COUNT}            # integer, 1–9
  &taxng=1                         # show all-in (taxes included) pricing
  &clm=7                           # cabin: 7=Economy, 6=Premium Economy, 4=Business, 3=First
  &st=bestmatches                  # bestmatches | priceasc | departtime | arrivetime | duration
  &newDateOverride=true            # use new date logic — safer on cross-month dates
```

Examples (both validated as `200 OK` via `browse cloud fetch --proxies` against the production host):

```
# Round-trip SFO → JFK, depart 2026-07-15, return 2026-07-22, 1 adult, Economy
https://www.united.com/en/us/fsr/choose-flights?f=SFO&t=JFK&d=2026-07-15&r=2026-07-22&tt=1&sc=7&px=1&taxng=1&clm=7&st=bestmatches

# One-way SFO → JFK, depart 2026-07-15, 1 adult, Economy
https://www.united.com/en/us/fsr/choose-flights?f=SFO&t=JFK&d=2026-07-15&tt=0&sc=7&px=1&taxng=1&clm=7&st=bestmatches
```

The URL accepts the airport as **IATA code only** (`SFO`, `JFK`, `LAX`, `ORD`, `EWR`, `LHR`, ...). City names, station IDs, or anything else gets coerced to a "no flights" state. If the caller hands you a city name, resolve it to an IATA code first (United's airport-lookup API at `/api/airports/lookup/search` returns `404` — not a usable surface — so resolve client-side from a static IATA table).

### 3. Open the URL and wait for cards to render

```bash
browse open "$URL" --remote
browse wait load
browse wait timeout 4000          # SPA hydrates results ~2–4s after `load`
browse snapshot
```

The first paint of the results grid is **client-side** — `browse wait load` alone is not sufficient; flight cards aren't in the DOM until the `searchFsr` XHR resolves. Empirically 3–4 seconds covers the long tail. If the snapshot returns 0 flight-card refs, sleep another 2s and retry once before declaring failure.

### 4. Branch on what the snapshot shows

| Snapshot signal | Outcome |
|---|---|
| List of flight cards with depart/arrive times + price buttons | **success** — extract |
| "We're unable to process your request" banner | **fail** — `error_reasoning: "site_error_banner"` |
| Captcha / "verify you are a human" / Akamai 403 page | **fail** — `error_reasoning: "akamai_challenge"`. Session is burned; release and create a fresh one |
| "No flights available for the dates you selected" | **success** with empty `results: []` and `no_flights_for_dates: true` |
| Date-picker overlay re-appearing | The `d=` or `r=` value was rejected. Confirm the date format is `YYYY-MM-DD` and that it's ≥ today |
| Page header city ≠ requested route | The `f` / `t` codes were unrecognized — retry with verified IATA codes |

### 5. Extract flight cards

Each card on the results grid exposes:

- **Depart time** — first time string in the card (`08:30`, in the rendered local airport time).
- **Arrive time** — second time string.
- **Duration** — explicit text like `5h 35m` (or `5h 35m +1d` for next-day arrivals).
- **Stop count** — text like `Nonstop`, `1 stop`, `2 stops`. Parse to an integer.
- **Flight numbers** — text like `UA 232` (or `UA 232, UA 7411` on multi-leg). Capture the full list.
- **Cabin / fare options** — typically Basic Economy / Economy / Premium Plus / Business / First, with one price each. Capture the **lowest-cabin price** unless the caller specified a higher cabin via `clm`.
- **Price** — USD number, sometimes shown as `$348.20*` (the `*` indicates a Saver/award-mix fare — strip when emitting clean numbers, surface as `flags: ["saver"]`).

For round-trip, the page renders **outbound** cards first; after the user selects an outbound, **return** cards render on a follow-up screen. To stay read-only, extract **only the outbound** cards and emit them as `results`. If the caller wants return-leg pricing too, run a second one-way search with `f` / `t` swapped and `d=<return date>`.

### 6. Release the session

```bash
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

### Form-fill fallback (only if the deep-link URL stops working)

If United changes the FSR URL schema and the deep-link returns the homepage redirect or a date-picker overlay on every load, fall back to driving the homepage form:

1. `browse open https://www.united.com/ --remote`
2. Wait for the "Book travel" widget to mount (`browse wait timeout 3000`).
3. Click the trip-type radio: `One-way` or `Round-trip` (default is `Round-trip`).
4. Click the **From** field, type the IATA code (`SFO`), wait `2000ms` for the typeahead dropdown, then click the first option matching the code. **Do not use `browse fill` — it auto-presses Enter, which submits the field before the typeahead surfaces.** Use `click` → `type` → `wait timeout 2000` → `click <suggestion-ref>`.
5. Repeat step 4 for the **To** field.
6. Click the **Depart** date field; the date-picker overlay opens. Navigate to the target month with the `>` button, click the target day. For round-trip, the picker stays open; navigate + click the return day. Confirm with the picker's `Done` / `Apply` button.
7. (Optional) Update passenger count + cabin via the **Travelers** / **Cabin** dropdown.
8. Click `Find flights`. Page navigates to `/en/us/fsr/choose-flights?...` with the params URL-encoded. From here continue at step 3 of the deep-link path.

Form-fill is ~3× slower than the deep-link path and adds two failure modes (typeahead-race, date-picker-month-overshoot), so use only when the deep-link is confirmed broken.

## Site-Specific Gotchas

- **READ-ONLY.** Never click `Select`, `Continue`, `Book`, `Add to cart`, or a fare-option price button — any of these starts the booking funnel and may hold inventory.
- **Akamai is on every path.** Both `/` and `/en/us/fsr/choose-flights?...` set `_abck`, `bm_ss`, `bm_s`, `bm_mi`, and `akacd_NS_AB` cookies on the first response. A datacenter-IP session without Verified will be challenged on the second navigation. `--verified --proxies` is the minimum viable session config.
- **Pure SPA — no embedded results state.** `browse cloud fetch` of the deep-link returns the React shell HTML (~75 KB) with **zero** flight data embedded. There is no scraping shortcut that skips the browser; you must let the page hydrate. Verified by grepping the fetched body for `searchContext|fareFamily|cabinClass|currentSearchCriteria` — zero matches.
- **`/api/flight/recentSearch` returns `405 Method Not Allowed` to GET.** The endpoint exists internally but only accepts authenticated POSTs from the SPA's signed-session context. **Don't waste time trying to reverse-engineer United's internal `searchFsr` JSON endpoint** — it's behind anti-tamper headers + session cookies that aren't reproducible from an out-of-band fetch. Drive the browser instead.
- **`/api/airports/lookup/search` returns `404`.** The airport-typeahead endpoint is not at the obvious path. If you need IATA-code lookup, use a static IATA table (carry one in the skill harness) rather than trying to hit a United-side resolver.
- **Date format must be `YYYY-MM-DD`.** The URL parser accepts `2026-07-15`; anything else (`07/15/2026`, `15-Jul-2026`, ISO with timezone) silently drops back to the date-picker overlay.
- **`tt=1` is round-trip, `tt=0` is one-way, `tt=2` is multi-city.** Counter-intuitive direction. `tt=2` requires a different param layout (`f1`/`t1`/`d1`, `f2`/`t2`/`d2`, ...) and is out of scope for this skill.
- **Cross-month / past dates → date-picker re-opens.** If the date-picker overlay re-appears instead of cards rendering, the requested date was rejected. Common causes: date in the past, date > 11 months out (UA's booking window), or wrong format.
- **`taxng=1` is important.** Without it, the listed prices are base-fare-only (no taxes/fees), which gives misleadingly low quotes. Always include it for "what does this cost?" queries.
- **`*` on prices = Saver / mixed-cabin fare.** Strip the asterisk when emitting numeric prices; surface as `flags: ["saver"]`.
- **"No flights available" is a valid success.** Combinations like (very short window) + (small regional pair) + (high cabin class) frequently return an empty grid. Emit `success: true, results: [], no_flights_for_dates: true` — not a failure.
- **The deep-link can also accept `noflex=true`** to disable the flexible-date calendar above the grid (saves ~1s on hydration). Optional.
- **Award-mile pricing is on a different URL.** `/ual/en/us/flight-search/book-a-flight/results` is the award flow; do **not** confuse the two surfaces — they have different fare models, different cabin enums, and a different results DOM.
- **Round-trip cards only show outbound on the first page.** The return-leg grid only renders after an outbound is selected, which is a click this skill must NOT make. If both legs are needed, do two one-way searches and combine client-side.

## Expected Output

```json
{
  "success": true,
  "trip_type": "round-trip",
  "origin": "SFO",
  "destination": "JFK",
  "depart_date": "2026-07-15",
  "return_date": "2026-07-22",
  "passengers": 1,
  "cabin": "economy",
  "results_url": "https://www.united.com/en/us/fsr/choose-flights?f=SFO&t=JFK&d=2026-07-15&r=2026-07-22&tt=1&sc=7&px=1&taxng=1&clm=7&st=bestmatches",
  "results": [
    {
      "depart_time": "08:30",
      "depart_airport": "SFO",
      "arrive_time": "17:05",
      "arrive_airport": "JFK",
      "next_day_arrival": false,
      "duration": "5h 35m",
      "stops": 0,
      "flight_numbers": ["UA 232"],
      "cabin_class": "Economy",
      "fare_brand": "Basic Economy",
      "price_usd": 348.20,
      "flags": []
    },
    {
      "depart_time": "10:15",
      "depart_airport": "SFO",
      "arrive_time": "21:48",
      "arrive_airport": "JFK",
      "next_day_arrival": false,
      "duration": "8h 33m",
      "stops": 1,
      "flight_numbers": ["UA 481", "UA 1722"],
      "cabin_class": "Economy",
      "fare_brand": "Economy",
      "price_usd": 412.40,
      "flags": ["saver"]
    }
  ],
  "no_flights_for_dates": false,
  "error_reasoning": null
}
```

Distinct outcome shapes:

```json
// Success — flights returned (canonical case)
{ "success": true, "results": [ /* ≥1 flight */ ], "no_flights_for_dates": false, "error_reasoning": null, ... }

// Success — no flights for the requested dates / cabin / route
{ "success": true, "results": [], "no_flights_for_dates": true, "error_reasoning": null, ... }

// Failure — Akamai challenge (session burned, retry with a fresh Verified session)
{ "success": false, "results": [], "error_reasoning": "akamai_challenge", ... }

// Failure — invalid input (unrecognized IATA, malformed date, past date)
{ "success": false, "results": [], "error_reasoning": "invalid_input: <field>=<value>", ... }

// Failure — site error banner ("We're unable to process your request")
{ "success": false, "results": [], "error_reasoning": "site_error_banner", ... }
```
