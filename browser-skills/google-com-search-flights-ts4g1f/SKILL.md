---
name: google-com-search-flights-ts4g1f
title: Google Flights Cheapest-Itinerary Search
description: >-
  Search Google Flights for one-way or round-trip itineraries between two
  airports on given dates via a tfs deep-link, returning the cheapest options
  with airline, total duration, stops, depart/arrive times, and a booking link.
  Read-only.
website: google.com
category: travel
tags:
  - travel
  - flights
  - google-flights
  - search
  - read-only
  - deep-link
source: 'browserbase: agent-runtime 2026-06-04'
updated: '2026-06-04'
recommended_method: browser
alternative_methods:
  - method: browser
    rationale: >-
      If the tfs deep-link schema changes, fall back to filling the homepage
      form (trip type, origin, destination, date) and reading the same results
      list. Same extraction logic applies; costs a few extra turns.
  - method: api
    rationale: >-
      No usable public JSON API. Google Flights' internal GRPC/batchexecute
      endpoints are obfuscated and unauthenticated-hostile; the tfs-encoded
      results page is the stable surface.
verified: true
proxies: true
---
# Google Flights — Search Cheapest Itineraries

## Purpose

Given an origin airport, a destination airport, and travel date(s), return the
cheapest Google Flights itineraries — each with price, airline(s), total
duration, number of stops, departure/arrival times (with next-day markers), and
a shareable booking link. Works for both one-way and round-trip searches.
**Read-only — never selects a flight or proceeds to booking/payment.**

## When to Use

- "What's the cheapest one-way flight from SFO to JFK on July 15?"
- Round-trip fare comparison between two airports across a date pair.
- Daily/scheduled price monitoring for a route.
- Any flow needing the cheapest fare + itinerary details without booking.

## Workflow

The optimal path is **not** the homepage form — it is a direct `tfs` deep-link
to the results page. Google Flights encodes the entire search (airports, dates,
trip type, passengers, cabin) into a single base64url-encoded protobuf passed as
the `tfs` URL parameter. Build it deterministically, navigate once, read the
rendered results list, sort by price client-side. No form filling, no clicks.

### 1. Build the `tfs` parameter

The `tfs` value is a protobuf serialized in this wire-tag order, then
base64url-encoded (`+`→`-`, `/`→`_`, strip `=` padding):

| Field | Wire type | Value |
|---|---|---|
| `f2` | varint | `0` (seat placeholder) |
| `f3` | message (repeated, one per leg) | `{ f2: "YYYY-MM-DD" (date), f13: {f1:1, f2:"<ORIGIN>"}, f14: {f1:1, f2:"<DEST>"} }` |
| `f8` | varint | `1` (passengers — 1 adult) |
| `f9` | varint | `1` (cabin — 1=economy, 2=premium economy, 3=business, 4=first) |
| `f19` | varint | **trip type: `1`=round trip, `2`=one way** |

- **One-way** → exactly ONE `f3` leg, `f19=2`.
- **Round-trip** → TWO `f3` legs (the second reverses airports and uses the return date), `f19=1`.

> ⚠️ `f19` is the trip-type field, NOT `f2`. Setting `f19=1` (or omitting it)
> renders round-trip fares even with a single leg — the prices then carry a
> "round trip" label. For one-way you MUST set `f19=2`.

Node builder (drop-in):

```js
function v(n){const o=[];while(n>127){o.push((n&0x7f)|0x80);n>>>=7;}o.push(n&0x7f);return Buffer.from(o);}
function tag(f,w){return v((f<<3)|w);}
function vf(f,n){return Buffer.concat([tag(f,0),v(n)]);}
function sf(f,s){const b=Buffer.from(s);return Buffer.concat([tag(f,2),v(b.length),b]);}
function mf(f,b){return Buffer.concat([tag(f,2),v(b.length),b]);}
const airport = c => Buffer.concat([vf(1,1), sf(2,c)]);
const leg = (date,from,to) => Buffer.concat([sf(2,date), mf(13,airport(from)), mf(14,airport(to))]);
function tfs({oneway, origin, dest, depart, ret}) {
  const p = [vf(2,0), mf(3, leg(depart, origin, dest))];
  if (!oneway) p.push(mf(3, leg(ret, dest, origin)));
  p.push(vf(8,1), vf(9,1), vf(19, oneway ? 2 : 1));
  return Buffer.concat(p).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
// one-way SFO→JFK 2026-07-15 → "EAAaHhIKMjAyNi0wNy0xNWoHCAESA1NGT3IHCAESA0pGS0ABSAGYAQI"
```

### 2. Navigate to the results URL

```
https://www.google.com/travel/flights/search?tfs=<TFS>&curr=USD&hl=en
```

`&curr=USD` forces USD pricing; `&hl=en` forces English. Use a Browserbase
session created with `--verified --proxies`.

```bash
browse open "https://www.google.com/travel/flights/search?tfs=<TFS>&curr=USD&hl=en" --remote
browse wait load --remote
browse wait timeout 4000 --remote     # results render 2–4 s AFTER load fires
browse get title --remote             # e.g. "San Francisco to New York | Google Flights" — confirms routing
```

### 3. Extract every result row

Read the whole results region in one shot — it is compact (~3 KB) and complete:

```bash
browse get text "[role=main]" --remote
```

Each flight is a line block, e.g.:
`2:35 PM – 11:20 PM JetBlue 5 hr 45 min SFO–JFK Nonstop 414 kg CO2e … $205`.
Multi-stop rows add `1 stop` and a connection like `50 min PHX`.

Parse per row: depart time, arrive time (a trailing `+1` = next-day arrival),
airline, total duration, stops (`Nonstop`=0 / `N stop(s)`), route `XXX–XXX`,
price `$NNN`.

If you control a CDP `page.evaluate` (Playwright) instead of the `browse` CLI,
`document.querySelectorAll('li.pIav2d')` gives the rows directly — see the
generated `playwright.ts`.

### 4. Sort by price and emit the cheapest

The list defaults to Google's **"Best"** ranking, NOT price — the cheapest fare
usually sits a few rows down. Dedupe (rows are duplicated in the DOM — see
gotchas), sort ascending by price, and return the lowest N. Use the deep-link
URL as the `booking_link`. Emit the JSON schema in **Expected Output**.

### Browser fallback (only if the tfs schema changes)

1. `browse open "https://www.google.com/travel/flights?hl=en&curr=USD"`.
2. Set trip type (One way / Round trip dropdown), type origin → pick the airport
   suggestion, type destination → pick suggestion, set date(s) in the date
   picker, click **Search/Explore**.
3. From the results page, run steps 3–4 above (identical extraction).

This costs a handful of extra turns but the read/parse logic is unchanged.

## Site-Specific Gotchas

- **`f19` is the trip-type field, not `f2`.** A single-leg link with `f19=1`
  (or no `f19`) renders ROUND-TRIP fares (prices labeled "round trip"). One-way
  requires `f19=2`. This was the single biggest trap during development.
- **Default sort is "Best", not cheapest.** There is a "Cheapest" tab (shows
  "from $NNN"), but the most robust approach is to read all rows and sort by
  price client-side — the cheapest fare is rarely the first row.
- **`browse snapshot` is useless here** — it returns an empty accessibility tree
  (only the CLI "Update available" notice) and is flagged as an error. Never
  snapshot Google Flights; use `browse get text "[role=main]"`.
- **`browse get text ".pIav2d"` returns ONLY the first row.** Read
  `[role=main]` to get all rows in one compact (~3 KB) call. The per-row class
  `li.pIav2d` is correct for `querySelectorAll` (DOM/Playwright), just not for
  `browse get text`.
- **Result rows are duplicated in the DOM.** Each itinerary appears twice — once
  fully (with airline + `XXX–XXX` airport codes) and once condensed (no airline,
  no codes). When parsing, skip rows lacking an airline name or airport codes,
  then dedupe by (depart, arrive, airline, price).
- **Flight numbers are NOT in the list view.** They only appear after expanding a
  row's chevron (detail panel shows "Operated by … as … flight NNNN"). For a
  cheapest-list result, `flight_numbers` is typically `null` unless you click to
  expand each row. Expanding is read-only and safe, but costs extra turns.
- **Times are local to each airport.** A `+1` suffix on the arrival time means it
  lands the next calendar day. Durations already account for timezone offset
  (e.g. SFO 8:15 AM → JFK 9:00 PM is "9 hr 45 min" across PT→ET).
- **Currency/locale follow the IP unless pinned.** Always append `&curr=USD&hl=en`
  (or your desired currency) so a residential proxy's geo doesn't change the
  currency or language.
- **Stealth:** `--verified --proxies` loaded the site cleanly across multiple
  runs — no captcha, no 403. Proxies are recommended mainly to keep
  currency/locale stable and avoid anti-bot drift, not because a hard wall was hit.
- **No usable JSON API.** Google Flights' internal `batchexecute`/GRPC endpoints
  are obfuscated and unauthenticated-hostile. Don't waste time hunting for one —
  the tfs-encoded results page is the stable surface.
- **Read-only.** Never click "Select flight" or proceed past the results list.

## Expected Output

```json
{
  "success": true,
  "trip_type": "one-way",
  "origin": "SFO",
  "destination": "JFK",
  "depart_date": "2026-07-15",
  "return_date": null,
  "currency": "USD",
  "results": [
    {
      "price": 179,
      "airlines": ["American"],
      "flight_numbers": null,
      "total_duration": "7 hr 52 min",
      "stops": 1,
      "depart_time": "6:55 PM",
      "arrive_time": "5:47 AM+1",
      "booking_link": "https://www.google.com/travel/flights/search?tfs=EAAaHhIKMjAyNi0wNy0xNWoHCAESA1NGT3IHCAESA0pGS0ABSAGYAQI&curr=USD&hl=en"
    },
    {
      "price": 205,
      "airlines": ["JetBlue"],
      "flight_numbers": null,
      "total_duration": "5 hr 45 min",
      "stops": 0,
      "depart_time": "2:35 PM",
      "arrive_time": "11:20 PM",
      "booking_link": "https://www.google.com/travel/flights/search?tfs=EAAaHhIKMjAyNi0wNy0xNWoHCAESA1NGT3IHCAESA0pGS0ABSAGYAQI&curr=USD&hl=en"
    }
  ],
  "error_reasoning": null
}
```

Round-trip shape (note `trip_type`, `return_date`, and that `price` is the total
round-trip fare carrying a "round trip" label on the page):

```json
{
  "success": true,
  "trip_type": "round-trip",
  "origin": "SFO",
  "destination": "JFK",
  "depart_date": "2026-07-15",
  "return_date": "2026-07-22",
  "currency": "USD",
  "results": [
    {
      "price": 442,
      "airlines": ["American"],
      "flight_numbers": null,
      "total_duration": "7 hr 52 min",
      "stops": 1,
      "depart_time": "6:55 PM",
      "arrive_time": "5:47 AM+1",
      "booking_link": "https://www.google.com/travel/flights/search?tfs=<round-trip-tfs>&curr=USD&hl=en"
    }
  ],
  "error_reasoning": null
}
```

No-results / invalid-route shape:

```json
{
  "success": false,
  "trip_type": "one-way",
  "origin": "SFO",
  "destination": "ZZZ",
  "depart_date": "2026-07-15",
  "currency": "USD",
  "results": [],
  "error_reasoning": "No flights found for the requested route/date (results region rendered 0 priced rows)."
}
```
