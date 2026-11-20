---
name: ns-nl-plan-trip-x5is7w
title: Plan a Train Trip on NS (Dutch Railways)
description: >-
  Plan a train journey between two stations on the NS (ns.nl) journey planner
  and return travel options with departure/arrival times, duration, track,
  transfers, train types, live delays, crowding, and fare/supplement notes.
  Read-only.
website: ns.nl
category: transportation
tags:
  - trains
  - travel
  - journey-planner
  - ns
  - netherlands
  - read-only
  - transit
source: 'browserbase: agent-runtime 2026-06-17'
updated: '2026-06-17'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      The SPA's own backend, NS's official reisinformatie-api/api/v3/trips on
      gateway.apiportal.ns.nl, returns 200 JSON and is the cleanest path — but
      it requires a registered Ocp-Apim-Subscription-Key (free at
      apiportal.ns.nl). With a key, call it directly and skip the browser.
      Without one, the embedded website key is not reliably extractable and
      reusing it would breach NS API terms, so the deep-link browser path is
      recommended.
  - method: browser
    rationale: >-
      Form-interaction fallback for when a deep link fails to resolve an
      ambiguous station name: fill the from/to typeaheads (pick the 'Railway
      station' suggestion), set date/time, click Plan.
verified: false
proxies: false
---
# Plan a Train Trip on NS (Dutch Railways)

## Purpose

Plan a domestic (or international-via-NS) train journey between two stations on the NS journey planner at `ns.nl` and return the available travel options: per-option departure/arrival times, total travel time, departure track, number of transfers, train type(s) (Intercity / Sprinter / Intercity direct / Eurocity Direct / metro / bus legs), real-time delays, crowding indication, and any fare/supplement notes. Read-only — never books, buys, or checks in.

## When to Use

- "What trains run from Amsterdam Centraal to Rotterdam Centraal around 9am tomorrow?"
- "When do I need to leave Eindhoven to arrive at Schiphol Airport by 17:00?"
- Comparing departure options, transfer counts, or travel times between two Dutch stations.
- Surfacing live delays / disruptions on a specific route at a specific time.
- Any flow that needs train travel options without purchasing a ticket.

## Workflow

The NS journey planner is an Angular SPA whose state is fully encoded in the **URL hash** — so the optimal path is to **construct a deep-link URL directly and read the rendered results, with zero form interaction**. A bare Browserbase session (no stealth, no proxy) is sufficient: the homepage and the planner load cleanly and the underlying trips API returns `200` without geo-restriction (verified from a non-NL outbound IP over two iterations). The site sits behind Akamai (`ak_bmsc` cookie) but did not challenge plain navigation.

### 1. Build the deep-link URL

```
https://www.ns.nl/en/journeyplanner/#/?vertrek=<FROM>&vertrektype=treinstation&aankomst=<TO>&aankomsttype=treinstation&type=<vertrek|aankomst>&tijd=<YYYY-MM-DDTHH:mm>&firstMileModality=PUBLIC_TRANSPORT&lastMileModality=PUBLIC_TRANSPORT
```

| Param | Meaning |
|---|---|
| `vertrek` | Origin station name, URL-encoded (e.g. `Amsterdam%20Centraal`). Use the canonical NS name. |
| `aankomst` | Destination station name, URL-encoded. |
| `vertrektype` / `aankomsttype` | `treinstation` for a train station (other values exist for bus stops / addresses — stick to `treinstation`). |
| `type` | `vertrek` = depart **at** `tijd`; `aankomst` = arrive **by** `tijd`. |
| `tijd` | Local (Europe/Amsterdam) ISO datetime, minute precision, no seconds/zone: `2026-06-18T09:00`. |
| `firstMileModality` / `lastMileModality` | `PUBLIC_TRANSPORT` (default). |

Use the **English** planner (`/en/journeyplanner/`) for English UI labels; the Dutch planner lives at `/reisplanner/` and uses the identical param names.

### 2. Navigate and wait for the SPA to render

```bash
browse open "<deep-link>" --remote --session "$sid"
browse wait load --remote --session "$sid"
browse wait timeout 5000 --remote --session "$sid"   # Angular fetches + renders trip cards 2-5s after load
```

### 3. Read the results

```bash
browse snapshot --remote --session "$sid"
```

Each travel option appears as a single accessibility-tree `StaticText` summary with a predictable shape:

```
departure 17:18 arrival 18:08 travel time 0:50 track 14a You travel with Sprinter Intercity direct
departure 17:19 with 2 minutes delay arrival 18:34 travel time 1:13 track 4b You travel with Sprinter
Shorter train, extra busy and possibly full departure 17:27 with 1 minute delay arrival 18:18 travel time 0:50 with 1 time transfers You travel with metro line 52 Intercity direct
```

Parse from that string:
- `departure HH:MM` / `arrival HH:MM` / `travel time H:MM`
- `track <n>` → departure track/platform (may be absent for some itineraries — emit `null`)
- `with N minute(s) delay` → real-time delay in minutes (absent ⇒ `0`)
- `with N time transfers` → transfer count (absent ⇒ `0`)
- `You travel with <…>` → the train/modality types in order (e.g. `Intercity`, `Sprinter`, `Intercity direct`, `Eurocity Direct`, `metro line 52`)
- Crowding prefix such as `Shorter train, extra busy and possibly full` → crowding note
- A leg/option marked `Supplement` (e.g. Intercity direct, Eurocity Direct) carries a surcharge — expand "Show details" to read the exact amount (e.g. `€3.20`).

For full per-leg detail (intermediate stops, walk-to-platform transfers, per-leg tracks, fare breakdown like `€20.20` full / `€12.12` off-peak), click an option's **"Show details"** button and re-snapshot.

### 4. Notes on result windowing

Results are anchored on `tijd`: for `type=vertrek` the list starts at/just after the requested time; for `type=aankomst` the list ends at/just before it (last option's arrival ≤ requested time, verified). A few earlier options may be hidden behind an "Earlier travel options" control — click it only if you need departures before the anchor.

### Browser fallback (form interaction)

If a deep link ever fails to populate (e.g. an ambiguous station name that doesn't auto-resolve), drive the form:

1. `browse open "https://www.ns.nl/en/journeyplanner/#/"`.
2. Dismiss the cookie dialog — click **Reject** (or **Accept**); it overlays the page on first visit.
3. Click the **from** combobox, `browse type "<origin>"`, wait ~2s, then click the first suggestion labelled **"Railway station"** in the suggestions listbox (avoid the look-alike **"Bus station"** option).
4. Repeat for the **to** combobox.
5. Optionally set the Departure/Arrival radio, date, and time fields.
6. Click **Plan** (or **Show Travel options**). The URL rewrites itself into the canonical deep link from step 1 — capture it for reuse.
7. Wait and read results as in step 3.

## Site-Specific Gotchas

- **No anti-bot escalation needed.** A bare session (no `--verified`, no `--proxies`) loaded the planner and returned full results across both validation iterations from a non-Dutch IP. Akamai is present (`ak_bmsc` cookie) but did not challenge. Don't waste budget enabling stealth/proxy unless you actually observe a 403/Access-Denied.
- **The URL hash IS the state.** Everything is after `#/`, so changing only the hash on an already-loaded planner may not re-trigger a fetch — do a full `browse open` of the new deep link (or `browse reload`) to force a fresh search.
- **Wait after `load`.** The trips XHR fires 2–5s *after* `wait load` resolves. Snapshotting too early returns the empty form. Always `wait timeout 5000` (or poll the snapshot until option rows appear).
- **`type` is the depart-vs-arrive switch**, not a UI radio you must click — set it in the URL. `vertrek` = leave-at, `aankomst` = arrive-by.
- **`tijd` is local Amsterdam time, minute precision, no timezone suffix.** `2026-06-18T09:00`. Adding seconds or a `Z`/offset can cause the SPA to fall back to "now".
- **Typeahead has bus-stop look-alikes.** When using the form fallback, the suggestions list shows both a `Railway station` and a `Bus station` entry for the same city name (e.g. "Amsterdam, Centraal Station" is a *bus* station). Always pick the one tagged **Railway station**.
- **Supplement trains.** "Intercity direct" (Amsterdam–Rotterdam–Breda HSL) and "Eurocity Direct" legs require a surcharge (observed `€3.20`); the option is tagged `Supplement`. Surface this — it changes the real price.
- **Crowding & shorter-train warnings** are prepended to the option text ("Shorter train, extra busy and possibly full"). Capture them as advisory metadata.
- **Underlying API needs a key — see Expected Output's note.** The SPA fetches `https://gateway.apiportal.ns.nl/reisinformatie-api/api/v3/trips` (returns `200`, JSON, ~11 KB). This is NS's official, documented API (apiportal.ns.nl) and requires a registered `Ocp-Apim-Subscription-Key` header. If you have a free NS API key, call it directly (params below) and skip the browser entirely. Without a key, the deep-link browser path is the recommended route — the website's embedded key is not reliably extractable and reusing it would violate NS's API terms.
- **Cookie dialog only appears in the form flow / first visit.** Deep-link navigation renders results behind/around it without needing dismissal, but if a snapshot looks blocked, dismiss the `dialog: Your cookie preferences` first.

## Expected Output

```json
{
  "success": true,
  "from": "Amsterdam Centraal",
  "to": "Rotterdam Centraal",
  "search_type": "departure",
  "search_time": "2026-06-18T09:00",
  "options": [
    {
      "departure": "09:18",
      "arrival": "10:08",
      "duration": "0:50",
      "departure_track": "14a",
      "transfers": 1,
      "train_types": ["Sprinter", "Intercity direct"],
      "delay_minutes": 0,
      "crowding_note": null,
      "supplement": "€3.20"
    },
    {
      "departure": "09:36",
      "arrival": "10:48",
      "duration": "1:12",
      "departure_track": "2a",
      "transfers": 0,
      "train_types": ["Intercity"],
      "delay_minutes": 0,
      "crowding_note": null,
      "supplement": null
    }
  ],
  "error_reasoning": null
}
```

`search_type` is `"departure"` (depart-at) or `"arrival"` (arrive-by). For arrive-by queries the options' `arrival` values cluster at/just before `search_time`.

Failure shape (e.g. unresolvable station, no service on the route/date):

```json
{
  "success": false,
  "from": "…",
  "to": "…",
  "options": [],
  "error_reasoning": "No travel options returned — station name did not resolve / no service for the requested date-time."
}
```

**Direct-API alternative (requires a free NS API subscription key):**

```
GET https://gateway.apiportal.ns.nl/reisinformatie-api/api/v3/trips
    ?fromStation=Amsterdam Centraal
    &originUicCode=8400058
    &toStation=Rotterdam Centraal
    &destinationUicCode=8400530
    &dateTime=2026-06-18T09:00:00
    &lang=en
    &product=OVCHIPKAART_ENKELE_REIS
Header: Ocp-Apim-Subscription-Key: <your NS apiportal.ns.nl key>
```

Returns structured JSON trip objects (legs, stops, fares, real-time delays) — register at `apiportal.ns.nl` for a key. UIC station codes are discoverable via the same portal's `nsapp-stations` / `places-api` endpoints.
