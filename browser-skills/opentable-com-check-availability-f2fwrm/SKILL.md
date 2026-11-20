---
name: opentable-com-check-availability-f2fwrm
title: OpenTable Availability Check
description: >-
  Look up OpenTable restaurant availability for a party size + date + time,
  returning slots when present and distinguishing sold-out,
  restaurant-not-bookable, restaurant-not-found, ambiguous-name, metro-override,
  and slot-extraction-blocked outcomes. Read-only — never books.
website: opentable.com
category: restaurants
tags:
  - restaurants
  - reservations
  - dining
  - read-only
  - akamai
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      Confirmed blocked. dapi/fe/gql operations (RestaurantsAvailability,
      Autocomplete, LocationPicker) are Akamai-walled — verified across multiple
      call paths in the prior reference run and indirectly here
      (window.__INITIAL_STATE__.availability.loading stays true and
      restaurantsAvailability stays empty for 30+ seconds because the React
      client's XHR is silently 403'd). The /booking/restref/availability
      endpoint returns an Akamai sensor-data challenge page instead of real
      data.
  - method: browser
    rationale: >-
      Only working surface —
      /s/?metroId=<X>&term=<name>&dateTime=<iso>&covers=<n> with --verified
      --proxies. Returns restaurant identity, pinned-card status, and 'find next
      available' link. Note: as of May 2026 the search page no longer renders
      inline slot-time buttons (reproduced across 7 restaurants in 2 metros),
      and the /r/<slug> detail page is Akamai-blocked even from a warmed
      session. Slot-time extraction is currently in a degraded state — see
      SKILL.md Site-Specific Gotchas.
verified: true
proxies: true
---
# OpenTable Availability Check

## Purpose

Given a natural-language reservation query — restaurant name + city + date + time + party size — query OpenTable and return one of:

- bookable slot times for the requested params (`success: true, slots: [...]`)
- sold-out for the requested params (`success: true, slots: [], sold_out: true`)
- restaurant present on OpenTable but no online availability surfaced for the date (`success: true, slots: [], status: "no_online_availability"`)
- restaurant present on OpenTable but not bookable through their network (`success: false, reason: "not_on_booking_network"`)
- restaurant not found on OpenTable in the metro (`success: false, reason: "restaurant_not_found"`)
- ambiguous name — multiple top-tier matches in the metro (`success: false, reason: "ambiguous_name"`)
- slot extraction blocked by Akamai (`success: false, reason: "slots_blocked", details: ...`)

**Read-only — never click a slot, never reach a booking-confirmation page.**

## When to Use

- "any 8pm Saturday at {restaurant} in {city}?"
- A scheduling agent comparing slot availability across restaurants for a date.
- A concierge agent verifying that a restaurant *exists* on OpenTable for a given metro before recommending it.
- Any flow that needs slot times without booking. Booking is a different (intentionally separate) skill.

## Workflow

OpenTable has no usable public availability API — `dapi/fe/gql` (RestaurantsAvailability, Autocomplete, LocationPicker) and `/booking/restref/availability` are all Akamai-blocked at the request level (verified — see Gotchas). The only surface is `opentable.com/s/?` with a stealth + residential-proxy browser session.

### 1. Stealth + residential-proxy session

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
export BROWSE_SESSION="$SID"
```

Both `--verified` and `--proxies` are mandatory. A bare session gets Akamai-served "Access Denied" HTML on most page loads, including the search page. (Note: the Browserbase CLI reads `BROWSERBASE_API_KEY` — bridge from `BB_API_KEY` if your env only exports the short name.)

### 2. Pick the right OpenTable domain

| Target city is in… | Use domain |
|---|---|
| US / Canada / Mexico | `opentable.com` |
| UK | `opentable.co.uk` |
| Germany / Switzerland / Austria | `opentable.de` |
| Other Europe | `opentable.co.uk` (general gateway) |
| Australia | `opentable.com.au` |
| Japan | `opentable.jp` |
| Hong Kong / Asia-Pacific | `opentable.com.hk` |

For unknown locales, default to `.com` and check whether the search header shows the target metro. If not, fall back to `.co.uk`.

### 3. Resolve metroId

The skill is driven by `metroId`. Look it up from this table; if missing, use the discovery procedure below.

| metroId | City |
|---|---|
| 1 | Atlanta |
| 3 | Chicago |
| 4 | San Francisco Bay Area |
| 6 | Los Angeles |
| 7 | Greater Boston |
| 8 | New York City |
| 9 | Washington DC |
| 10 | Las Vegas |
| 11 | Portland |
| 12 | Houston |
| 13 | Philadelphia County |
| 14 | New Orleans |
| 16 | Toronto |
| 20 | Dallas - Fort Worth |
| 62 | Pittsburgh |
| 73 | Vancouver / British Columbia |
| 87 | Wichita |
| 291 | Hong Kong (`opentable.com`) |
| 72 | London (`opentable.co.uk` — separate ID space from .com) |

(Discovered values from real runs. Not exhaustive.)

**Discovery procedure — term-intent rewrite (fast path):**

OpenTable's search-page intent parser does the discovery for you when you POST a city name as a search term — one navigation, ~3 seconds.

```bash
browse open "https://<domain>/s/?term=<URL-encoded city name>" --remote
browse wait load --remote
browse wait timeout 2500 --remote
URL_AFTER=$(browse get url --remote | python3 -c "import sys,json; print(json.load(sys.stdin)['url'])")
METRO_ID=$(echo "$URL_AFTER" | grep -oE 'metroId=[0-9]+' | head -1 | cut -d= -f2)
```

The URL after navigation also reveals `latitude=` / `longitude=` and `queryUnderstandingType=location` when the intent parser fires.

Persist discovered metroIds to a local cache so each city is discovered exactly once.

### 4. Build and open the search URL

```bash
URL="https://www.opentable.com/s/?covers=<N>&dateTime=<ISO>&metroId=<X>&term=<urlenc-name>"
browse open "$URL" --remote
browse wait load --remote
browse wait timeout 3500 --remote     # initial DOM render
```

The URL after navigation will look something like:

```
…&corrid=<uuid>&intentModifiedTerm=<lowercased>&originalTerm=<input>&pinnedRid=<NNNN>&queryUnderstandingType=default&showMap=true&sortBy=web_conversion
```

The presence and value of `pinnedRid=<NNNN>` is the cleanest "yes, OpenTable matched a specific restaurant" signal. **Read this URL first** — it tells you which branch you're in before you even look at the DOM.

Verified `pinnedRid` examples (May 2026 run): Carbone NYC=104293, Pastis NYC=7941, Buddakan NYC=5002, The Capital Grille Dallas Uptown=15723.

### 5. Branch on the page state

Take a `browse snapshot --remote` and an h2 read:

```bash
HEAD=$(browse eval --remote "document.querySelector('h2')?.textContent || ''" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['result'])")
```

| Heading / DOM state | Outcome |
|---|---|
| `You searched for "<x>" in <Target Metro>` + pinned card heading "Your top match. Book soon!" or "<N> people have booked your top choice today. Book soon!" + a `link: Find next available` underneath the card | Pinned card matched, but no inline slot widget for this date. Return `success: true, slots: [], status: "no_online_availability"` along with restaurant identity. |
| Pinned card + message "not on the OpenTable reservation network. Call the restaurant directly" | `success: false, reason: "not_on_booking_network"` with restaurant name + neighborhood. |
| `0 restaurants match "<term>"` static text under the page heading | `success: false, reason: "restaurant_not_found"`. |
| Two or more cards under a `Top match` heading with no single pinned `Book soon` card | `success: false, reason: "ambiguous_name"` with a `matches: []` list of names. |
| Page heading city ≠ target city (compare `You searched for "<x>" in <City>` against your input) | Term-intent rewrite kicked the search to a different metro. **Do NOT silently return slots** — surface a `metro_override` warning. See Gotchas. |
| `Access Denied` page (Akamai 403 HTML, no banner) | `success: false, reason: "slots_blocked", details: "akamai_403_on_search_page"`. Should not happen with `--verified --proxies` — if it does, retry once with a fresh session. |

### 6. Slot-time extraction — known degraded path

**As of May 2026, OpenTable no longer renders inline slot-time buttons on the search-result page.** The pinned restaurant card surfaces identity + a `Find next available` link to `/r/<slug>`. Across 7 reproductions in iter 1 (NYC, Dallas; mainstream + casual; 1-day-out through 21-day-out) zero slot buttons rendered. See Gotchas for the failure modes I confirmed on every other availability surface.

If you nonetheless want to attempt slot extraction (in case the UI gets restored or your specific restaurant happens to render slots):

```bash
# Slot buttons, when rendered, look like accessibility tree refs of the form
#   [N-M] button: 6:30 PM
#   [N-M] button: 7:00 PM*
# (Asterisk = "special" slot — Resy points, prix-fixe, etc. Strip or pass through as a flag.)
browse snapshot --remote > /tmp/snap.json
python3 -c "
import json, re
t = json.load(open('/tmp/snap.json'))['tree']
slots = re.findall(r'button: (\d{1,2}:\d{2} ?(?:AM|PM)\*?)', t)
print(slots)
"
```

If `slots` is non-empty, that's your `success: true, slots: [...]` payload. Otherwise return the `no_online_availability` shape from step 5.

### 7. Verify before emitting

- Read the URL after navigation. If `metroId=` was rewritten by the term-intent parser, surface that — do NOT silently treat a different-metro result as authoritative.
- Read the heading text. If the city doesn't match the target, same.
- Strip query-string entropy (`corrid`, attribution tokens) before logging the URL — only `metroId`, `pinnedRid`, `term`, `dateTime`, `covers` are stable.

### 8. Release the session

```bash
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

(Some CLI versions of `browse` v0.7.x reject this flag with a validation error against the API — if that happens, the session auto-expires in 30 minutes. Not blocking.)

## Site-Specific Gotchas

- **READ-ONLY.** Never click a time-slot button, never click a Reserve / Book button, never reach `/confirm` — that starts a booking flow.

- **Stealth + residential proxy is mandatory.** A bare session gets Akamai "Access Denied" HTML at `/s/?`. `--verified --proxies` on session create is the working baseline. Verified during this run: same flag combination produced 200s across 7 search-page navigations.

- **Search-page no longer renders inline slot times (NEW, since the reference was written).** OpenTable replaced the inline slot widget on `/s/?` results with a single `Find next available` link pointing to `/r/<slug>`. Reproduced across NYC and Dallas metros, mainstream and casual restaurants, dates from 1 day to 21 days out, party sizes 2 and 4. **Don't assume a "Book soon!" pinned card means slots will appear** — they don't anymore.

- **`/r/<restaurant-slug>` is Akamai-blocked even from a warmed session.** Verified twice: direct `browse open "https://www.opentable.com/r/becco-new-york"` after a successful `/s/?` load returns `Access Denied` HTML; click-through from the `Find next available` link in the warmed session ALSO returns `Access Denied` (Reference #18.d823d517...). The session cookie does not bypass the per-path Akamai rule for `/r/`. Don't waste retries here.

- **`/booking/restref/availability?restRef=<rid>&...` returns an Akamai bot-challenge page, not real data.** Out-of-band fetch via `browse cloud fetch --proxies` returns status 200 with 2.5 KB of HTML containing the Akamai sensor-data script (`/qA-dBR8Iyg/L-ZLq2/3e2B/...`) — i.e. the page that tries to fingerprint you and then 200s with an empty payload until you "pass". Don't bother.

- **The internal GraphQL endpoint is a trap.** `dapi/fe/gql` operations `RestaurantsAvailability`, `Autocomplete`, `LocationPicker` are all Akamai-blocked from cookieless POST and page-context fetch. Verified at scale in the prior reference run (19 calls, all 403) and indirectly here: even on a warmed page where the React client kicks off these calls, `window.__INITIAL_STATE__.availability.loading` stays `true` and `restaurantsAvailability` stays `{}` forever (waited 33s, never populated). The XHR fails silently.

- **`window.__INITIAL_STATE__.availability` looks promising but is empty.** The slice exists with the right keys (`restaurantsAvailability`, `nextAvailableSlots`, etc.) but is populated only by the client-side GraphQL call that Akamai blocks. Reading it post-load returns the SSR skeleton (`loading: true`, empty maps) every time. Don't build on it.

- **OpenTable's term parser can override `metroId`.** When the search term contains a city or country name (e.g., "Joe's Shanghai", "Cafe Beijing"), the `queryUnderstandingType=location` intent layer reroutes the search to that city's metro despite the `metroId` URL param. **The skill cannot bypass this from the URL layer alone.** Workarounds: (a) try a more-specific term that doesn't include a city name (e.g., a known neighborhood: "Joe's Shanghai Flushing"), or (b) confirm `intentModifiedTerm=` and `metroId=` in the URL *after* navigation before trusting the result.

- **The location picker UI does not lock metro for subsequent searches.** Clicking through the picker re-renders the homepage with new metro state, but a follow-up `/s/?` URL ignores that state unless the URL itself includes `metroId=<X>`. The picker is only useful for *discovering* an unknown city's metroId — and the term-intent rewrite (above) is usually faster anyway.

- **`/metro/<city>-restaurants` is not directly navigable.** Direct `browse open` to that URL renders OpenTable's "Well, this is embarrassing" error page. The URL only renders correctly when reached via the picker click flow. Search via `/s/?metroId=<N>` (no `term=`) is the supported metro-browse path.

- **`fill` skips the typeahead.** `browse fill <ref> <value>` auto-presses Enter, which submits before the dropdown surfaces. If you need to use the autocomplete: `click` then `type` separately, then `wait timeout 2000` for the dropdown.

- **`pinnedRid` aliases.** OpenTable canonicalizes some restaurant IDs (e.g., 4485 → 45625; 3496 → 3638). Pass either; the response is the same. Don't treat differing `pinnedRid`s across runs as different restaurants without checking the canonical slug.

- **Asterisks on slot times.** Slots like `4:15 PM*` — the `*` indicates a special slot (Resy points, prix-fixe, etc.). Strip when emitting clean times, or pass through as a `flags: ["special"]` field. (Carry-over from the prior reference — relevant if/when inline slots return.)

- **`wait timeout 3000–5000` after `wait load` is required** before snapshotting — the search-results widget renders 2–4 s after `load` fires. The h2 "You searched for …" heading is a reliable readiness signal.

- **Header text is the single source of truth for "did the search succeed".** The pinned card's "Top match" label fires regardless of slot availability, so don't use it alone — combine with the `pinnedRid=` URL parameter and the explicit "no online availability" message presence.

- **"Restaurant present + no slot widget" is NOT the same as `restaurant_not_found`.** It's `no_online_availability`. Until the inline-slot UI returns or a workaround is found, this is the most common outcome shape on the current site.

## Expected Output

Seven distinct outcome shapes, plus the new degraded-state shape introduced by the May 2026 UI change.

```json
// 1. Slots returned (legacy success — inline-slot UI; not currently reproducible
//    on /s/? results, kept for forward compatibility)
{
  "success": true,
  "slots": ["6:30 PM", "6:45 PM", "7:00 PM*"],
  "sold_out": false,
  "restaurantName": "Carbone",
  "neighborhood": "Greenwich Village",
  "metroId": 8,
  "pinnedRid": 104293,
  "url": "https://www.opentable.com/s/?covers=2&dateTime=2026-05-24T19:00:00&metroId=8&term=Carbone"
}

// 2. Sold-out for the requested time (no slots, slot widget rendered, all greyed)
{
  "success": true,
  "slots": [],
  "sold_out": true,
  "restaurantName": "Carbone",
  "neighborhood": "Greenwich Village",
  "metroId": 8,
  "pinnedRid": 104293
}

// 3. Restaurant present, no online availability surfaced (the current default
//    shape on the live UI for matched restaurants — May 2026)
{
  "success": true,
  "slots": [],
  "sold_out": false,
  "status": "no_online_availability",
  "restaurantName": "Carbone",
  "neighborhood": "Greenwich Village",
  "rating": 4.5,
  "reviewCount": 673,
  "price": "$$$$",
  "cuisine": "Italian",
  "metroId": 8,
  "pinnedRid": 104293,
  "findNextAvailableUrl": "https://www.opentable.com/r/carbone"
}

// 4. Restaurant present, not bookable through OpenTable
{
  "success": false,
  "reason": "not_on_booking_network",
  "restaurantName": "...",
  "neighborhood": "...",
  "metroId": 8
}

// 5. Restaurant not found in this metro
{
  "success": false,
  "reason": "restaurant_not_found",
  "targetCity": "New York City",
  "metroId": 8,
  "searchedTerm": "Junior's Times Square",
  "intentModifiedTerm": "juniors"
}

// 6. Ambiguous — multiple top-tier matches
{
  "success": false,
  "reason": "ambiguous_name",
  "matches": [
    {"name": "Maggiano's - Northpark", "neighborhood": "Park Cities", "pinnedRid": null},
    {"name": "Maggiano's - Dallas Love Field", "neighborhood": "Tolar", "pinnedRid": null}
  ]
}

// 7. Term-intent rewrote the metro (DO NOT silently emit slots)
{
  "success": false,
  "reason": "metro_override",
  "requestedMetroId": 8,
  "actualMetroId": 288,
  "actualMetroLabel": "Shanghai, China",
  "searchedTerm": "Joe's Shanghai",
  "intentModifiedTerm": "joe's shanghai"
}

// 8. Slot extraction blocked (new — May 2026 degraded state)
{
  "success": false,
  "reason": "slots_blocked",
  "details": "inline_slot_widget_not_rendered_on_search_page",
  "restaurantFound": true,
  "restaurantName": "Maggiano's - Northpark",
  "metroId": 20,
  "pinnedRid": null,
  "findNextAvailableUrl": "https://www.opentable.com/r/maggianos-northpark",
  "note": "Restaurant detail page (/r/<slug>) is Akamai-blocked; client-side GraphQL is Akamai-blocked. No surface returns slot times today."
}
```
