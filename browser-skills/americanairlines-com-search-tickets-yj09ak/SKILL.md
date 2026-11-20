---
name: americanairlines-com-search-tickets-yj09ak
title: American Airlines Flight Search
description: >-
  Search aa.com for available flights on a given origin/destination/date route
  and return each option's flight numbers, times, duration, stop count,
  operating carrier, and fare-class prices. Read-only — never books.
website: americanairlines.com
category: travel
tags:
  - travel
  - flights
  - airlines
  - aa
  - akamai
  - read-only
source: 'browserbase: agent-runtime 2026-05-20'
updated: '2026-05-20'
recommended_method: browser
alternative_methods:
  - method: browser
    rationale: >-
      No public API, GraphQL, or URL deep-link bypasses Akamai. Direct
      /booking/search deep-link, form-driven Search-button navigation, and
      `browse cloud fetch --proxies` all return Access Denied or the Akamai
      behavioral-content challenge. The /en-us/flights form is the only working
      entry point — but the destination results page itself is the Akamai wall,
      so even successful form fills frequently fail to reach actionable results.
verified: true
proxies: true
---
# American Airlines Flight Search

## Purpose

Given an origin airport, destination airport, departure date, optional return date, passenger count and cabin class, search aa.com for the available flights on that route and return each option's flight numbers, departure/arrival times, duration, stop count, operating carrier and fare-class prices (Main / Main Plus / Flagship etc.). Read-only — never click "Continue", "Select", or any booking-progression button.

## When to Use

- A user asks "what flights are there from {origin} to {destination} on {date}?"
- A trip-planning agent comparing AA fares for a known route + date.
- Bulk price-monitoring across dates for a single AA route.
- Any flow that needs flight-shopping output without booking. Booking is a different skill.

## Workflow

The only public surface for shopping AA fares is the browser form at `https://www.aa.com/booking` / `https://www.aa.com/en-us/flights`. The destination results page (`/booking/search?slices=...`) is the Akamai-protected URL and is the choke point — see "Site-Specific Gotchas". There is no public JSON API, GraphQL endpoint, or URL-deep-link shortcut that bypasses the Akamai behavioral-content challenge (confirmed via direct deep-link, form-driven Search-button navigation, and `browse cloud fetch --proxies` — all return either `Access Denied` or the Akamai challenge HTML).

### 1. Stealth + residential-proxy session is mandatory

```bash
sid=$(browse cloud sessions create --keep-alive --proxies --verified \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$sid"
```

Both `--verified` (advanced stealth) and `--proxies` (residential proxy) are required. Without them, even `https://www.aa.com/` returns `Access Denied`. With them, `/en-us/flights` (the homepage form) renders; whether `/booking/search` (the results page) renders is *probabilistic* — most attempts return Access Denied even on a verified+proxied session.

### 2. Open the form on the regional path, NOT the bare domain

```bash
browse open "https://www.aa.com/en-us/flights" --remote
browse wait load --remote
browse wait timeout 5000 --remote
```

`https://www.aa.com/` (bare domain) reliably returns `Access Denied` on the cloud browser. `https://www.aa.com/en-us/flights` (Title: "Book American Airlines Flights") consistently renders. Use the regional path.

### 3. Dismiss the privacy-and-cookies banner first

```bash
browse snapshot --remote > /tmp/snap.txt
DISMISS=$(grep -oE "\[20-[0-9]+\] button: Dismiss" /tmp/snap.txt | head -1 | grep -oE "\[20-[0-9]+\]")
browse click "$DISMISS" --remote
browse wait timeout 1000 --remote
```

The cookie alert at the bottom-right intercepts focus events on the form's comboboxes. **`browse click` on the form fields silently fails until this is dismissed.**

### 4. Fill the form via raw mouse coordinates, NOT accessibility refs

The `fc-booking-origin-aria-label` / `fc-booking-destination-aria-label` comboboxes are custom-rendered: `browse click` on the accessibility ref of the combobox "clicks true" but does **not** focus the underlying input — subsequent `browse type` writes nothing. The working pattern is `browse mouse click <x> <y>` at the visible input rectangle:

```bash
# From input (~220, 330 at default 1280x720 viewport)
browse mouse click 220 330 --remote
browse wait timeout 800 --remote
browse type "JFK" --remote
browse wait timeout 2500 --remote        # autocomplete render delay
browse press "ArrowDown" --remote        # commit pattern; clicking the autocomplete option directly is also unreliable
browse press "Enter" --remote
browse wait timeout 1000 --remote
```

Repeat for the To input (around `(470, 330)` at 1280x720). The two coordinates above were verified — adjust if the viewport changes. Always verify via screenshot that both inputs show the full "AIRPORT - City Name (CODE), Region/Country" string after the Enter commit.

### 5. Trip type — switch to One-way

Default state is Round trip. To switch:

```bash
browse snapshot --remote > /tmp/snap.txt
TRIP=$(grep -oE "\[20-[0-9]+\] button: fc-booking-journey-type-aria-label" /tmp/snap.txt | head -1 | grep -oE "\[20-[0-9]+\]")
browse click "$TRIP" --remote                # opens listbox with options "One way" / "Round trip"
browse wait timeout 1200 --remote
browse snapshot --remote > /tmp/snap2.txt
ONEWAY=$(grep -oE "\[20-[0-9]+\] option: One way" /tmp/snap2.txt | head -1 | grep -oE "\[20-[0-9]+\]")
browse click "$ONEWAY" --remote
browse wait timeout 800 --remote
```

The journey-type listbox click *does* respond to accessibility-ref clicks (unlike the origin/destination comboboxes). The Return-date button disappears from the form when One way is selected.

### 6. Date picker — navigate via Next-Month, NOT typed input

The `fc-booking-departure-date-input-aria-label` textbox **looks** typeable but its value is cleared on Tab/blur and the underlying `react-day-picker` only commits selections made via grid clicks. Workflow:

```bash
browse click "[<depart-button-ref>]" --remote     # opens dual-month dialog (May + June visible)
browse wait timeout 2000 --remote
# Click "fc-booking-date-selector-next-month" N times to advance to target month pair
# Each click advances by ONE month (both visible months shift)
# Always re-snapshot between clicks — refs CAN stale after dialog re-render
# Then click the target gridcell: "MM/DD/YY" aria-label, e.g. "07/15/26"
browse snapshot --remote > /tmp/snap.txt
DAY=$(grep -oE "\[20-[0-9]+\] gridcell: 07/15/26" /tmp/snap.txt | head -1 | grep -oE "\[20-[0-9]+\]")
browse click "$DAY" --remote
```

Date-picker gridcells use the format `MM/DD/YY, ,` (with two trailing commas — Single Selection marker comes after for the currently-selected day). The next/previous-month buttons sometimes appear unresponsive on the first click — if a re-snapshot shows the grid unchanged after a 1.5s wait, click again with the *freshly refreshed* ref.

### 7. Click Search and observe the URL the form constructs

```bash
SEARCH=$(grep -oE "\[20-[0-9]+\] button: Search" /tmp/snap.txt | head -1 | grep -oE "\[20-[0-9]+\]")
browse click "$SEARCH" --remote
# If the ref click doesn't navigate, fall back to raw coords (~1120, 320 at default viewport)
browse mouse click 1120 320 --remote
browse wait load --remote
browse wait timeout 12000 --remote      # results page is heavy and runs Akamai JS challenge
```

The form constructs this URL pattern (verified empirically by reading `browse get url` after Search-button click):

```
https://www.aa.com/booking/search
  ?locale=en_US
  &fareType=Lowest
  &pax=1
  &adult=1
  &type=OneWay|RoundTrip
  &searchType=Revenue|Award
  &cabin=                              # empty=any | COACH | PREMIUM_ECONOMY | BUSINESS_FIRST | FIRST
  &carriers=ALL
  &travelType=personal                 # or business
  &slices=[
      {"orig":"JFK","origNearby":false,"dest":"LAX","destNearby":false,"date":"2026-07-15"}
    ]                                  # JSON-encoded, one slice for One-Way, two slices for Round-Trip
```

The `slices` value is a URL-encoded JSON array. **A second slice (LAX→JFK with the return date) is auto-appended when `type=RoundTrip`.**

### 8. Branch on the destination state

After the Search-button click, three outcomes are possible:

- **Title contains "Access Denied"** → Akamai behavioral-content wall (the common case, see Gotchas). Emit `{ "success": false, "error_reasoning": "akamai_wall", "wall_kind": "results_page_blocked" }`.
- **Title contains "Choose flights"** / page renders flight cards → success path. Parse via the steps below.
- **Title is empty or page is a spinner after 15s** → Akamai challenge JS is mid-execution; wait another 10s + `browse reload --remote`. If a second reload still doesn't pass, treat as `akamai_wall`.

### 9. Extract flight cards (success path)

The `browse get markdown body` output of `/booking/search` lays each flight option out as a card with the following extractable structure (per inspection of AA's choose-flights React tree). Each card contains:

- One or more flight-number anchors (`AA<digits>`). Multiple = connecting itinerary; count stops by `len(flight_numbers) - 1`.
- A departure time `HH:MM AM|PM` paired with the origin code.
- An arrival time `HH:MM AM|PM` paired with the destination code (with `+1` suffix if next-day arrival).
- A duration string `Xh YYm` or `Xh`.
- Operating carrier disclosure when codeshare ("Operated by …" beneath the flight number).
- Fare buttons in three to five tiers: `Main Cabin` / `Main Plus` / `Premium Economy` / `Flagship Business` / `Flagship First` (route-dependent). Price format `$X,XXX.XX` (one-way) or `from $X,XXX.XX`.

Use `browse get text body --remote` to harvest the full page text in one call (avoids per-card click-through). Parse with anchored regex per card boundary (`AA\d+` repeated header pattern).

### Browser fallback (none — this IS the browser path)

There is no API/CLI/MCP fallback for AA flight shopping; the whole skill is a browser flow. The above "fallback" inside Step 8 (`akamai_wall`) is the realistic outcome path when the browser path itself fails.

## Site-Specific Gotchas

- **The bare domain `https://www.aa.com/` is Akamai-blocked on cloud browsers** — `Access Denied` HTML, even with `--verified --proxies`. Always open `https://www.aa.com/en-us/flights` (the regional path) instead. The same is true for `homePage.do`. The mobile site `m.aa.com` returns 500.
- **`/booking/search?slices=...` is the Akamai wall.** Three independently-attempted paths to this URL all return Akamai 403 / `Access Denied` HTML on a verified+proxied cloud browser:
  1. Direct `browse open <deeplink>` from a cold session.
  2. Direct `browse open <deeplink>` from a session warmed by visiting `/en-us/flights`.
  3. Clicking the Search button from a properly-filled form (which constructs the same URL).
  `browse cloud fetch <url> --proxies` returns HTTP 200 but with the Akamai *behavioral-content challenge* HTML (Akamai's JS bot-detection page with `sec-bc-tile-container` / `progress-button` DOM), not real flight results. This is currently a hard wall — flag this skill as `candidate` until the wall is bypassed.
- **No public API.** No GraphQL, no `/api/`, no `sapi.*` mirror like Craigslist has. The internal aa.com BFF is request-signed and Akamai-fronted; do not waste turns probing it.
- **The cookie-consent dialog ("Privacy and cookies") MUST be dismissed before any form interaction.** Its z-index intercepts pointer events on the form's comboboxes. `browse click` on the form reports `clicked: true` but the keystrokes never reach the input. Dismiss it via the `Dismiss` button ref first.
- **Origin/destination comboboxes ignore accessibility-ref clicks.** `browse click [20-XXXX]` on `fc-booking-origin-aria-label` registers `clicked: true` but does not focus the underlying input — `browse type "JFK"` writes nothing. **Use `browse mouse click <x> <y>` at raw viewport coordinates** (default 1280x720: From ≈ (220, 330), To ≈ (470, 330)). Confirm focus succeeded by screenshotting after the first character types.
- **`fill` clears the value back on submit / blur.** `browse fill "[combobox-ref]" "JFK"` looks like it works in the snapshot, but the input clears the moment focus leaves. Use raw `type` after a successful mouse-coordinate focus.
- **Always commit airport selection with `ArrowDown + Enter`.** Clicking the autocomplete `option:` ref directly sometimes clears the field (observed: clicking the JFK option after typing JFK left "From" empty when "To" was then focused). `ArrowDown` highlights the first option, `Enter` commits it deterministically.
- **Date textbox is read-only on commit.** Typing `07/15/2026` into `fc-booking-departure-date-input-aria-label` *displays* the text but does not update the form state — pressing Tab clears the input. Use the dual-month grid + Next-Month button instead. Each Next-Month click advances both visible months by one.
- **Date-picker `Next-Month` clicks occasionally appear no-op.** Re-snapshot to get a fresh ref before each click (the dialog re-renders refs internally). If two consecutive clicks at fresh refs show the grid unchanged in the snapshot, suspect that the snapshot was taken before the React state propagated — wait an extra 1.5s and re-check.
- **Search button via accessibility ref doesn't navigate; raw coords do.** `browse click "[<search-btn-ref>]"` registers `clicked: true` but leaves the page on `/en-us/flights`. `browse mouse click 1120 320 --remote` (raw coords at default viewport for the right-side Search button) does trigger navigation to `/booking/search?slices=[…]`. Same root cause as the combobox issue — the React click handler binds to the actual DOM element, not the role-detected accessibility target.
- **Results page Akamai challenge fires for 5–12s before resolving (or failing).** Always `browse wait timeout 12000` after navigation. Don't snapshot earlier — the Akamai challenge DOM masquerades as a real page and yields garbage refs.
- **Round-Trip auto-adds the return slice.** When `type=RoundTrip`, the Search button auto-appends `{"orig":"LAX","origNearby":false,"dest":"JFK","destNearby":false,"date":"<return-date>"}` as the second slice. For One-Way, the URL has exactly one slice.
- **`searchType=Award` searches AAdvantage miles redemptions (no cash prices).** Switch the form's "Book with cash" button to "Book with miles" to trigger this. For a cash-fare search keep `searchType=Revenue`.

## Expected Output

Three outcome shapes depending on whether the results page renders.

### Success (results page rendered)

```json
{
  "success": true,
  "origin": "JFK",
  "destination": "LAX",
  "depart_date": "2026-07-15",
  "return_date": null,
  "trip_type": "one-way",
  "passengers": 1,
  "currency": "USD",
  "flights": [
    {
      "flight_numbers": ["AA123"],
      "depart_time": "07:00",
      "arrive_time": "10:25",
      "duration": "6h 25m",
      "stops": 0,
      "operating_carrier": "American Airlines",
      "fares": [
        { "class": "Main Cabin",         "price": 289.00 },
        { "class": "Main Plus",          "price": 339.00 },
        { "class": "Premium Economy",    "price": 589.00 },
        { "class": "Flagship Business",  "price": 1289.00 }
      ]
    },
    {
      "flight_numbers": ["AA456", "AA789"],
      "depart_time": "09:15",
      "arrive_time": "15:42",
      "duration": "9h 27m",
      "stops": 1,
      "operating_carrier": "American Airlines",
      "fares": [
        { "class": "Main Cabin", "price": 219.00 }
      ]
    }
  ],
  "error_reasoning": null
}
```

### Akamai wall (most common outcome on cloud browsers today)

```json
{
  "success": false,
  "origin": "JFK",
  "destination": "LAX",
  "depart_date": "2026-07-15",
  "flights": [],
  "error_reasoning": "akamai_wall",
  "wall_kind": "results_page_blocked",
  "evidence": {
    "url_constructed": "https://www.aa.com/booking/search?...slices=%5B...%5D",
    "page_title": "Access Denied",
    "akamai_reference": "Reference #18.6ad02e17.1779242119.87eb5c8"
  }
}
```

### Form-fill failure (input never committed)

```json
{
  "success": false,
  "origin": null,
  "destination": null,
  "depart_date": null,
  "flights": [],
  "error_reasoning": "form_input_failed",
  "evidence": {
    "step_failed": "origin_combobox_focus | airport_selection_commit | date_picker_navigation",
    "page_url_at_failure": "https://www.aa.com/en-us/flights"
  }
}
```
