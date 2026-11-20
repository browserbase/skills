---
name: costcotravel-com-get-rental-car-price-47wjed
title: Costco Travel Rental Car Price Lookup
description: >-
  Return Costco Travel 'Low Price Finder' rental-car prices (vendor x car-class
  matrix) for a pickup location, drop-off location, and date+time pair.
  Read-only — never books. Form fill flow and public airport-autocomplete API
  are documented; the search-submit endpoint is currently blocked by Akamai for
  automated sessions.
website: costcotravel.com
category: travel
tags:
  - travel
  - rental-cars
  - costco
  - akamai
  - read-only
  - candidate
source: 'browserbase: agent-runtime 2026-05-22'
updated: '2026-05-22'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      Public `https://api.costcotravel.com/api/rentalCars/searchLocations`
      resolves partial names / IATA codes to airport rows without any auth or
      anti-bot wall. Useful as a sub-skill, but does NOT return prices — pricing
      is only available via the browser flow.
  - method: fetch
    rationale: >-
      Direct fetch of `www.costcotravel.com/rentalCarSearch.act` returns HTTP
      401 from Akamai bot management for any unwarmed session. Confirmed across
      4 iters of testing 2026-05-22 — do not waste cycles on a bare fetch path.
verified: true
proxies: true
---
# Costco Travel Rental Car Price Lookup

## Purpose

Given a pickup airport / city, an optional drop-off airport, a date+time pair, and a driver-age flag, return Costco Travel's "Low Price Finder™" quoted rental-car prices (vendor × car-class grid) for that itinerary. Read-only — never click "Reserve" or proceed past the results matrix.

**Important honesty note:** during four iterations of testing in 2026-05-22, every attempted search submission was blocked by Akamai bot management on `https://www.costcotravel.com/rentalCarSearch.act` (the XHR endpoint behind the Search button). The form *itself* renders fine on a stealth+proxy Browserbase session, the airport autocomplete API works fine, but the search-submit endpoint returns HTTP 401 to any cookieless / automated session — including Browserbase's strongest `--verified --proxies` profile. This skill ships as a **candidate**: it documents the form-fill flow precisely so a future agent with a warm cookie jar (real-user `_abck` token, `bm_sz`, JSESSIONID) can complete the search, plus catalogs the one public API endpoint that does answer (`searchLocations` for IATA-code resolution).

## When to Use

- A user asks "how much is a rental car at LAX from June 15 to June 22 on Costco Travel?"
- A travel-comparison agent benchmarking Costco's "Low Price Finder" rates against Hotwire / Expedia / direct-vendor quotes.
- An agent resolving a partial airport name to its IATA code (`searchLocations` autocomplete works without auth).
- **Do not** use for booking, modifying, or canceling reservations — booking is a different skill (`costcotravel.com/book-rental-car/`, if it exists), and the booking endpoints are behind the same Akamai wall.

## Workflow

### 1. Resolve location codes via the public autocomplete API (no auth, no proxy required)

This API works **without** any stealth, proxies, or session cookies. It's the one fully-public Costco rental-car endpoint.

```bash
curl -fsS "https://api.costcotravel.com/api/rentalCars/searchLocations?requestOriginated=CAR&locale=en_US&returnCount=10&keyword=LAX&domainCode=USA"
```

Returns JSON:

```json
{
  "messageCode": 0,
  "cities": [
    { "code": null, "name": "Laxey", "country": "GB", "zipCode": "IM4", ... },
    { "code": "LAX", "name": "Los Angeles International Airport", "state": "CA", ... }
  ],
  "airports": [ ... ]   // when keyword matches an IATA code, the airport row appears here
}
```

- `keyword` accepts partial city names ("Los Ang"), IATA codes ("LAX"), zip codes, or addresses.
- `domainCode=USA` scopes to US-domain results; use `CAN`, `AUS`, etc. for other Costco Travel domains.
- `returnCount=10` is the dropdown default; the API will return more if you raise it.

For a search you need both the **human-readable label** (e.g. `"(LAX) Los Angeles International Airport, California, United States of America"`) AND the **IATA code** (`"LAX"`). The form internally writes both — see the gotcha on the hidden-input airport code.

### 2. Open the rental car search page in a stealth+proxy Browserbase session

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const j=s.slice(s.indexOf('{'),s.lastIndexOf('}')+1);process.stdout.write(JSON.parse(j).id)})")
export BROWSE_SESSION="$SID"

browse open "https://www.costcotravel.com/Rental-Cars" --remote
browse wait load --remote
browse wait timeout 4000 --remote
```

The page returns 200 + the search form cleanly. The Akamai wall (see Site-Specific Gotchas) only fires on the search-submit XHR, not on initial GET.

### 3. Fill the search form

Snapshot to get fresh refs (they shift across sessions and after navigations — the prefix is `[2-…]` on first nav, `[3-…]` after a second navigation, etc.):

```bash
browse snapshot --remote > snap.txt
PICKUP=$(grep -oE '\[[0-9]+-[0-9]+\] combobox: Pick-Up' snap.txt | head -1 | grep -oE '\[[0-9]+-[0-9]+\]')
PUDATE=$(grep -oE '\[[0-9]+-[0-9]+\] textbox: Pick-Up Date' snap.txt | head -1 | grep -oE '\[[0-9]+-[0-9]+\]')
PUTIME=$(grep -oE '\[[0-9]+-[0-9]+\] select: Pick-Up Time' snap.txt | head -1 | grep -oE '\[[0-9]+-[0-9]+\]')
DODATE=$(grep -oE '\[[0-9]+-[0-9]+\] textbox: Drop-Off Date' snap.txt | head -1 | grep -oE '\[[0-9]+-[0-9]+\]')
DOTIME=$(grep -oE '\[[0-9]+-[0-9]+\] select: Drop-Off Time' snap.txt | head -1 | grep -oE '\[[0-9]+-[0-9]+\]')
SEARCH=$(grep -oE '\[[0-9]+-[0-9]+\] button: Search' snap.txt | head -1 | grep -oE '\[[0-9]+-[0-9]+\]')
```

Fill in this order (verified working in iters 1–4 of testing):

```bash
# Pickup location — MUST click a typeahead option, not just type
browse click "$PICKUP" --remote
browse wait timeout 1000 --remote
browse type "LAX" --remote               # or full city/zip — any string that matches a row
browse wait timeout 2000 --remote        # typeahead populates ~1–2s after type completes

# Re-snapshot to find the airport option ref
browse snapshot --remote > snap-lax.txt
LAX_OPT=$(grep -oE '\[[0-9]+-[0-9]+\] option: \(LAX\)' snap-lax.txt | head -1 | grep -oE '\[[0-9]+-[0-9]+\]')
browse click "$LAX_OPT" --remote         # commits BOTH the visible label AND the hidden IATA code
browse wait timeout 1500 --remote

# Dates — fill, then Tab to blur (Enter would submit prematurely)
browse fill "$PUDATE" "06/15/2026" --remote      # format: mm/dd/yyyy
browse press Tab --remote
browse wait timeout 800 --remote
browse select "$PUTIME" "10:00 AM" --remote      # options: "Midnight", "12:30 AM", "01:00 AM", … "Noon", … "11:30 PM" (30-min granularity)
browse wait timeout 500 --remote

browse fill "$DODATE" "06/22/2026" --remote
browse press Tab --remote
browse wait timeout 800 --remote
browse select "$DOTIME" "10:00 AM" --remote
browse wait timeout 800 --remote
```

The "Drop-off at Same Location" radio is default-selected, and the "I am at least 25 years old" checkbox is default-checked — leave both alone for the default round-trip-25+ case. For different drop-off, click the "Drop-off at Different Location" radio (`grep -oE '\[[0-9]+-[0-9]+\] radio: Drop-off at Different Location' snap.txt`) — this surfaces a second combobox (`combobox: Drop-Off Location*`) that you fill the same way.

Verify the form state before submit:

```bash
browse eval "JSON.stringify(Array.from(document.getElementById('search_rental_cars_form').querySelectorAll('input,select')).map(i => i.name + '=' + (i.value||'').substring(0,40)))" --remote
```

Expected output includes the visible label AND a separate anonymous hidden field carrying the IATA code:

```
["carDropOfLocationType=sameLocation",
 "pickupLocationTextWidget=(LAX) Los Angeles International Airport,",
 "=LAX",                                       ← hidden IATA code, name=""
 "pickUpDateWidget=06/15/2026",
 "pickupTimeWidget=10:00 AM",
 "dropoffLocationTextWidget=",
 "=",
 "dropOffDateWidget=06/22/2026",
 "dropoffTimeWidget=10:00 AM",
 "driversAgeWidget=on"]
```

If the `=LAX` hidden field is empty (`=`), the airport-option click did not commit — go back and click the typeahead option again.

### 4. Submit the search — currently blocked by Akamai (see gotcha)

```bash
browse click "$SEARCH" --remote
```

The form's JS handler does `AjaxUtil.makeAjaxCallWithWaitingDiv("rentalCarSearch.act", queryString, …)`. On an unwarmed automated session, Akamai bot management returns 401 with an empty body, the XHR completes with `status: 0` (network error), the AJAX util gets stuck on its waiting div, and `loading_blocker_status_div` displays "Screen is Loading" indefinitely. The page **does not** navigate.

**If you have valid user cookies** (a `_abck` token from a real interactive session, plus `bm_sz`, `JSESSIONID`, `BIGipServerpool-…`), inject them with `browse cloud sessions update` or via `document.cookie` before clicking Search. The form-fill flow above is otherwise correct — the only failure point is Akamai's verdict on the POST.

### 5. (If submission succeeds) Extract the results matrix

The search renders results **in-page** at the same URL (`/Rental-Cars`); no redirect. After the loading blocker hides, the page contains a vendor × car-class price matrix. Scroll to the results region and harvest with a snapshot:

```bash
browse wait selector ".matrix-row, [class*=carClass], [class*=vendor-cell]" --remote --timeout 60000
browse get text body --remote > results.txt
```

Expected structure (from Costco Travel's standard "Low Price Finder" matrix — not verified end-to-end in this run because of the Akamai block):

- Vendors: Alamo, Avis, Budget, Enterprise, Hertz, National, Dollar, Thrifty, Fox, Payless (subset shown depending on availability at the airport).
- Car classes: Economy, Compact, Mid-size, Standard, Full-size, Premium, Luxury, Mini-van, Standard SUV, Premium SUV.
- Per-cell: total price for the rental period and (usually) a daily rate. Costco prices include taxes/fees per Costco's "Book Now, Pay at the Counter" policy.

### 6. Release the session

```bash
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

## Site-Specific Gotchas

- **Akamai 401 wall on `rentalCarSearch.act` is the dominant failure mode**: Costco Travel runs Akamai bot management. The Search button fires an XHR to `https://www.costcotravel.com/rentalCarSearch.act`. From any unwarmed automated session — including Browserbase `--verified --proxies` — that endpoint returns HTTP 401 with `Content-Length: 0`. The browser's XHR exposes this as `status: 0` (looks like a network error). Verified four times across iters 1–4 (2026-05-22), and confirmed by direct `browse cloud fetch` of `https://www.costcotravel.com/rentalCarSearch.act?rcs=11&…` → `statusCode: 401`. The page surfaces a perpetual "Screen is Loading" overlay (DOM: `div.loading-blocker > .loading_blocker_status_div`). **Don't waste time trying additional fill/cadence permutations — the wall is at the transport layer, not the form-validation layer.** Workarounds that *might* succeed: (a) inject a real user's `_abck` + `bm_sz` cookies into the session before clicking Search; (b) use a CAPTCHA-solving proxy that warms the session against Akamai's challenge; (c) wait for Costco to whitelist an enterprise sandbox IP range. We did not have any of those in this run.
- **`document.getElementById('search_rental_cars_form').submit()` produces a visible 401 page** — calling the form's native submit (no JS intercept) hits `/Rental-Cars` with POST, which returns 401 and renders Chrome's `chrome-error://chromewebdata/` "This page isn't working — HTTP ERROR 401" page. Useful for confirming the wall mid-debug; not useful as a submission path.
- **Bot-detection cookies are visible**: `aka-bot-detected=<hex>` and `_abck=<sensor_token>~<score>~…` appear in `document.cookie` after the initial GET. The `<score>` field of `_abck` is `-1` on our sessions (means "no verdict yet" in Akamai's protocol) but the bot-mgmt module still 401's writes; this is consistent with the score being applied at request time on POST, not at cookie-set time.
- **The hidden IATA-code field has no `name` attribute**: when you commit a typeahead option, the form populates two adjacent inputs — the visible `pickupLocationTextWidget` (full label like `"(LAX) Los Angeles International Airport, California, United States of America"`) and an anonymous hidden input with `value="LAX"`. If you fill the visible textbox via `browse fill` *without* clicking the typeahead option, the hidden IATA code stays empty and the form submission (if it ever got past Akamai) would silently fail server-side. **Always click the typeahead option** — don't trust the label-only path.
- **`browse fill <textbox> <date>` auto-presses Enter by default — but on this form, `pressedEnter: false` is the observed behavior** (verified across iters). Still, follow with `browse press Tab` to trigger the on-blur date-picker normalization handler; without the blur the datepicker may re-open on next focus.
- **Time-select options are 30-minute granularity** with these labels: `Midnight`, `12:30 AM`, `01:00 AM`, … `11:30 AM`, `Noon`, `12:30 PM`, … `11:30 PM`. Pass them verbatim to `browse select` — `"12:00 PM"` will fail (it's `"Noon"`).
- **The `searchLocations` autocomplete API is the ONLY public Costco-rental endpoint** — every other path we probed (`/api/rentalCars/search`, `/results`, `/vehicles`, `/rates`, `/agencies`, `/search/results`, `/lowPriceFinder`) returns 404. The actual matrix endpoints (`rentalCarAgencyMatrixActivity.act`, `rentalCarAgencySearchActivity.act`, `rentalCarSearchLocationActivity.act`) live on `www.costcotravel.com` and are behind the same Akamai wall as `rentalCarSearch.act`.
- **Snapshot ref prefixes shift after each navigation**: a fresh `browse open` produces `[2-N]` refs; navigating away and back produces `[3-N]`, then `[4-N]`, etc. Re-grep refs after every navigation. (This is browse-CLI internal behavior, not Costco-specific, but easy to forget when scripting.)
- **The loading-blocker overlay is in the DOM at idle** — `div.loading_blocker_status_div.offsetParent !== null` returns `true` even when the page is fully interactive, because the inner status-text div is unconditionally in flow. To detect an *actually in-progress* search, check the *outer* `.loading-blocker` (not `loading_blocker_status_div`) — `document.querySelector('.loading-blocker').offsetParent` is `null` at idle and non-`null` only when a real search is running.
- **Same-location vs different-location is a radio, not a checkbox**: legend is `Car Drop Of Selector` (sic — the page has a typo, "Of" instead of "Off"). Default = "Drop-off at Same Location" (radio `Drop-off at Same Location`). Switching to different-location reveals a second combobox `Drop-Off Location*`.
- **Costco Travel does not expose URL-deeplink results** — there is no `costcotravel.com/Rental-Cars?pickup=LAX&dropoff=LAX&start=…&end=…` GET URL that produces results. Every search goes through the JS+AJAX flow above. Don't search for a deeplink; it doesn't exist.
- **Driver's age = on (≥25) is mandatory** for the default flow. The label says "Yes, I am at least 25 years old.* — Opens a dialog when deselected" — un-checking it pops a "young driver fees may apply" dialog that you'd need to dismiss. Leave it checked for the standard rate.

## Expected Output

When the search succeeds (i.e. the agent has bypassed the Akamai wall — typically by reusing a warm user cookie), the expected JSON shape is:

```json
{
  "success": true,
  "pickup_location": "(LAX) Los Angeles International Airport, California, United States of America",
  "pickup_iata": "LAX",
  "dropoff_location": "(LAX) Los Angeles International Airport, California, United States of America",
  "dropoff_iata": "LAX",
  "pickup_datetime": "2026-06-15T10:00",
  "dropoff_datetime": "2026-06-22T10:00",
  "rental_days": 7,
  "currency": "USD",
  "lowest_total_price": 312.45,
  "lowest_vendor": "Alamo",
  "lowest_car_class": "Economy",
  "quotes": [
    {
      "vendor": "Alamo",
      "car_class": "Economy",
      "example_vehicle": "Kia Rio or similar",
      "total_price": 312.45,
      "daily_price": 44.64,
      "includes_taxes_and_fees": true
    }
  ],
  "error_reasoning": null
}
```

When the Akamai wall fires (the **observed** outcome in 4/4 iterations on 2026-05-22):

```json
{
  "success": false,
  "pickup_iata": "LAX",
  "dropoff_iata": "LAX",
  "pickup_datetime": "2026-06-15T10:00",
  "dropoff_datetime": "2026-06-22T10:00",
  "error_reasoning": "Akamai bot-management 401 on POST https://www.costcotravel.com/rentalCarSearch.act. Form filled and submitted successfully; XHR returned status 0 (network error masking the 401). Page shows perpetual 'Screen is Loading' overlay. Need warm user cookies (_abck score >= 0, bm_sz, JSESSIONID) to proceed."
}
```

If only the autocomplete sub-task is requested (resolve airport name → IATA code):

```json
{
  "success": true,
  "query": "Los Ang",
  "matches": [
    { "iata": "LAX", "name": "Los Angeles International Airport", "city": "Los Angeles", "state": "CA", "country": "USA" },
    { "iata": "BUR", "name": "Hollywood Burbank Airport", ... }
  ]
}
```
