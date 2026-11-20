---
name: in-bookmyshow-com-browse-cinema-showtimes-11k149
title: Browse Cinema Showtimes by Theatre (BookMyShow)
description: >-
  Enumerate every cinema in a BookMyShow city, then extract each theatre's full
  showtimes across all bookable dates — movies, formats (2D/3D/IMAX/4DX),
  per-showtime subtext (IMAX/Dolby/GOLD), availability, and prices — as clean
  JSON.
website: in.bookmyshow.com
category: entertainment
tags:
  - cinema
  - showtimes
  - bookmyshow
  - movies
  - ticketing
  - india
  - scraping
source: 'browserbase: agent-runtime 2026-07-10'
updated: '2026-07-10'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      Stealth Browserbase session (--proxies --verified) reading
      window.__INITIAL_STATE__ live via `browse eval`. Only needed if the SSR
      payload shape changes or client-side hydration is required; slower and
      costlier than the fetch path.
  - method: api
    rationale: >-
      An underlying getShowtimesByVenue REST endpoint exists (token + bmsId +
      appCode WEBV2 args are visible in the RTK-Query cache), but it is
      Cloudflare-protected and requires reverse-engineering rotating auth
      tokens. Not worth it: the data is already inlined in the server-rendered
      page, so a proxied HTTP fetch returns everything without any token
      handling.
verified: true
proxies: true
---
# Browse Cinema Showtimes by Theatre (BookMyShow India)

## Purpose

Enumerate every cinema in a BookMyShow city, then for each theatre extract the full showtimes schedule across **all bookable dates** the venue offers — every movie, every format variant (2D / 3D / IMAX 3D / 4DX / 4DX 3D / Dolby Atmos), and every individual showtime with its **subtext** (the small per-show experience label such as `IMAX`, `PLAYHOUSE`, `GOLD`, `DOLBY ATMOS`), screen/audi name, availability, price range, and session id. This is a **read-only** extraction — it never selects seats, books, or pays. The optimal path is a plain residential-proxy HTTP `fetch`: every theatre's showtimes page is server-side rendered and ships the complete dataset inline in `window.__INITIAL_STATE__`, so no scripted clicking or headless browser is required.

## When to Use

- "List all cinemas in Bengaluru (or Mumbai, Delhi, etc.) and pull every screening for every date."
- "What formats/experiences (IMAX, Dolby, 4DX, 3D) is a given movie playing in at theatre X, and at what times?"
- Building a citywide showtimes dataset / price-and-availability snapshot per theatre.
- Auditing which shows are `sold_out` vs `fast_filling` vs `available` at a venue.
- Any task that needs the per-showtime `subtext` label (it differs per showtime and is not derivable from the movie title alone).

## Workflow

BookMyShow is behind Cloudflare (the bare homepage returns `403`). Use Browserbase residential proxies for **every** request: `browse cloud fetch <url> --proxies --allow-redirects`. All showtimes data is embedded server-side, so this cheap HTTP path returns everything — you do **not** need a full browser session for extraction.

### Step 1 — Enumerate all cinemas in the city

Fetch the city cinemas directory (city is a URL slug, e.g. `bengaluru`, `mumbai`, `national-capital-region-ncr`):

```bash
browse cloud fetch "https://in.bookmyshow.com/bengaluru/cinemas" \
  --proxies --allow-redirects --output cinemas.html
```

Do **not** scrape `<a href>` anchors — only ~10 venues are hyperlinked in the SSR HTML. The **complete** venue list (125 for Bengaluru at time of authoring) lives in the embedded state at:

```
__INITIAL_STATE__.fetchVenuesListingApi.queries[<only key>].data.venues[]
```

Each venue object carries `VenueCode` (the 3–5 char theatre code, e.g. `PVFF`), `VenueName`, `VenueAddress`, `City`, `RegionCode` (e.g. `BANG` for Bengaluru), `VenueLatitude`, `VenueLongitude`, `SubRegionCode`. Collect `{VenueCode, VenueName, RegionCode}` for every entry.

### Step 2 — For each venue, get its showtimes + the list of bookable dates

The showtimes page URL is:

```
https://in.bookmyshow.com/cinemas/{city}/{any-slug}/buytickets/{VENUE_CODE}/{YYYYMMDD}
```

The `{any-slug}` segment is cosmetic — BookMyShow 301-redirects to the canonical slug based on `VENUE_CODE`, so pass `--allow-redirects` and any placeholder (e.g. `x`) works. Fetch **today's** date first to discover the full date list:

```bash
browse cloud fetch "https://in.bookmyshow.com/cinemas/bengaluru/x/buytickets/PVFF/20260710" \
  --proxies --allow-redirects --output venue-today.html
```

Extract the RTK-Query cache entry (key format `getShowtimesByVenue-{VENUE_CODE}-{YYYYMMDD}`):

```
__INITIAL_STATE__.venueShowtimesFunctionalApi.queries["getShowtimesByVenue-PVFF-20260710"].data
```

`data.ShowDatesArray[]` is the authoritative list of **all bookable dates** for this venue (each has `DateCode` = `YYYYMMDD`, `DispDate`, `Day`, `isDisabled`). Note dates are **not** contiguous — a venue may sell Fri/Sat/Sun this week and skip ahead to the next Fri, so always iterate `ShowDatesArray`, never a generated calendar range.

### Step 3 — Iterate every bookable date

For each `DateCode` in `ShowDatesArray` where `isDisabled === false`, fetch the same URL with that date and parse `data.showDetailsTransformed` (see Step 4). You already have today's payload from Step 2 — reuse it, only fetch the remaining dates.

### Step 4 — Parse `showDetailsTransformed` into clean JSON

`data.showDetailsTransformed.Event[]` is the list of movies. **The movie title is on the Event, but rating/genre/language/format/showtimes live on its `ChildEvents`.** Structure:

- `Event[].EventTitle` — movie title (e.g. `Moana`). Event-level `EventCensor`/`EventGenre`/`EventDuration` are **empty** — read them from ChildEvents.
- `Event[].ChildEvents[]` — one entry per **format × language** variant. Fields: `EventDimension` (`2D`, `3D`, `IMAX 3D`, `4DX`, `4DX 3D`, …), `EventLanguage`, `EventCensor` (`UA 7+`), `EventGenre` (object whose keys are genre names), `EventCode` (`ET00506144`), `EventName` (`Moana (IMAX 3D) - English`), `EventUrl`, `EventIsAtmosEnabled`.
- `ChildEvents[].ShowTimes[]` — the individual showtimes. Key fields:
  - `ShowTime` — display time (`07:30 PM`); `ShowDateTime` — `YYYYMMDDHHMM`.
  - **`Attributes` → this is the per-showtime `subtext`** the UI renders under each time pill (`IMAX`, `PLAYHOUSE`, `GOLD`, `DOLBY ATMOS`, …). Empty string means no subtext. `ScreenName` (`AUDI 1 IMAX`) is the raw audi and often contains the same signal.
  - `AvailStatus` — `3` = available (green), `1`/`2` = fast filling (orange), `0` = sold out (grey). `SessionId`, `ShowTimeCode`, `MinPrice`/`MaxPrice`, `Categories[]` (per-tier price/availability), `CutOffDateTime`.

Emit the JSON shape shown in **Expected Output**.

### Extracting `__INITIAL_STATE__` from the HTML

The state is assigned via `window.__INITIAL_STATE__ = {…};`. Locate the marker and brace-match the object (a naive regex will truncate on nested braces). Reference extractor:

```js
function extractState(html){
  const m = html.match(/window\.__INITIAL_STATE__\s*=\s*/);
  if(!m) return null;
  let i=m.index+m[0].length, depth=0, start=-1, inStr=false, esc=false;
  for(;i<html.length;i++){ const c=html[i];
    if(start===-1){ if(c==='{'){start=i;depth=1;} continue; }
    if(esc){esc=false;continue;} if(c==='\\'){esc=true;continue;}
    if(c==='"'){inStr=!inStr;continue;} if(inStr)continue;
    if(c==='{')depth++; else if(c==='}'){ if(--depth===0) return html.slice(start,i+1); }
  }
  return null;
}
const state = JSON.parse(extractState(html));
```

### Browser fallback

Only needed if the SSR payload shape changes or you must trigger client-side hydration. Create a **stealth** cloud session (Cloudflare blocks bare sessions), navigate, and read the same state object live:

```bash
sid=$(browse cloud sessions create --keep-alive --proxies --verified --region ap-southeast-1 \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$sid"
browse open "https://in.bookmyshow.com/cinemas/bengaluru/x/buytickets/PVFF/20260710" --remote --session "$sid"
browse eval --remote --session "$sid" "JSON.stringify(window.__INITIAL_STATE__.venueShowtimesFunctionalApi.queries)"
browse cloud sessions update "$sid" --status REQUEST_RELEASE   # always release when done
```

The DOM renders each time pill with only the time text as an accessible node; the subtext label is a styled child, so **read `Attributes` from state rather than trying to scrape the pill** — DOM scraping loses the subtext reliably.

## Site-Specific Gotchas

- **Cloudflare wall.** The site is fronted by Cloudflare + WAF; the bare homepage probe returns `403`. Residential proxies (`--proxies` on fetch, or `--proxies --verified` on a session) are mandatory. With proxies, `browse cloud fetch` returned `200` with the full embedded state on every request during testing — no CAPTCHA/challenge encountered.
- **`recommended_method: fetch`, not browser.** Everything is server-side rendered into `window.__INITIAL_STATE__`. A single proxied HTTP GET per (venue, date) yields all data. Spinning up a headless browser and clicking date tabs is slower, costlier, and unnecessary. Confirmed working.
- **Subtext = `ShowTimes[].Attributes`.** The user-visible per-showtime subtext (IMAX / PLAYHOUSE / GOLD / DOLBY ATMOS) is the `Attributes` string. It is **per showtime**, differs within the same movie, and is `""` for plain shows. Do not confuse it with the movie-row format label, which is `ChildEvents[].EventDimension` (`4DX 3D`, `IMAX 3D`, `3D`, `2D`).
- **Data lives on ChildEvents, not Event.** `Event.EventCensor/EventGenre/EventDuration/EventLanguage` are empty; the populated values are on each `ChildEvent`. One movie = one `Event` with N `ChildEvents` (one per format×language).
- **Full cinema list is in state, not in anchors.** The `/{city}/cinemas` HTML hyperlinks only ~10 venues; the complete 100+ venue list is in `fetchVenuesListingApi.queries[<key>].data.venues`. Scraping anchors silently under-counts.
- **Dates are sparse.** `ShowDatesArray` is authoritative and non-contiguous (e.g. 10, 11, 12, then 17, 18, 19 Jul). Iterate the array; never assume "next 7 days". Skip entries with `isDisabled: true`.
- **Slug is cosmetic.** `/cinemas/{city}/{slug}/buytickets/{CODE}/{DATE}` canonicalizes off `{CODE}`; a wrong/placeholder slug yields a `301` — pass `--allow-redirects` and it resolves. Fetching without redirects returns `301` with no body.
- **Query-cache key format.** `getShowtimesByVenue-{VENUE_CODE}-{YYYYMMDD}` for showtimes; the venues query key is a stringified arg object — grab it dynamically with `Object.keys(...queries)[0]` rather than hard-coding.
- **Region code.** Read `RegionCode` (`BANG`, etc.) from any venue object if you need it for other BookMyShow endpoints; you do not need it for the fetch pipeline above (venue code + date suffice).
- **No-shows / down venue.** When a venue has no sellable shows, `data.Event` is empty and `data.DownCinemasMessage` / `DownCinemasTitle` / `AllShowDatesDisabled: true` are populated — treat as an empty `movies: []` with a `notice` field rather than an error.
- **`__NEXT_DATA__` is absent** — this is a custom SSR app (React Router + RTK Query), not Next.js. Look for `window.__INITIAL_STATE__` only.
- Ad/analytics network noise is heavy (DoubleClick, CleverTap, Branch, Sentry, GA); there is **no** client XHR to a showtimes JSON endpoint — the data arrives inline with the document, which is why the cheap fetch works.

## Expected Output

Top-level result: the city, the date the crawl was anchored on, and one entry per cinema. Each cinema lists its bookable dates and, per date, the movies → formats → showtimes (with `subtext`).

```json
{
  "city": "bengaluru",
  "region_code": "BANG",
  "crawled_on": "20260710",
  "cinema_count": 125,
  "cinemas": [
    {
      "venue_code": "PVFF",
      "venue_name": "PVR: Nexus (Formerly Forum), Koramangala",
      "address": "Nexus Mall, 21-22, Adugodi Main Road, Koramangala, Bengaluru, Karnataka 560095, India",
      "available_dates": ["20260710","20260711","20260712","20260717","20260718","20260719","20260730","20260731","20260801","20260802"],
      "schedule": [
        {
          "date": "20260710",
          "movies": [
            {
              "title": "Moana",
              "formats": [
                {
                  "format": "IMAX 3D",
                  "language": "English",
                  "rating": "UA 7+",
                  "genre": ["Adventure","Comedy","Fantasy"],
                  "event_code": "ET00506144",
                  "showtimes": [
                    { "time": "07:30 PM", "datetime": "202607101930", "subtext": "IMAX", "screen": "AUDI 1 IMAX", "session_id": "51022", "availability": "available", "min_price": 470, "max_price": 620 },
                    { "time": "10:00 PM", "datetime": "202607102200", "subtext": "IMAX", "screen": "AUDI 1 IMAX", "session_id": "51023", "availability": "available", "min_price": 490, "max_price": 590 }
                  ]
                },
                {
                  "format": "4DX 3D",
                  "language": "English",
                  "rating": "UA 7+",
                  "genre": ["Adventure","Comedy","Fantasy"],
                  "event_code": "ET00506627",
                  "showtimes": [
                    { "time": "06:25 PM", "datetime": "202607101825", "subtext": null, "screen": "AUDI 2 4DX", "session_id": "51025", "availability": "available", "min_price": 580, "max_price": 670 }
                  ]
                }
              ]
            },
            {
              "title": "Welcome To The Jungle",
              "formats": [
                {
                  "format": "2D",
                  "language": "Hindi",
                  "rating": "UA16+",
                  "genre": ["Comedy"],
                  "event_code": "ET00369379",
                  "showtimes": [
                    { "time": "06:30 PM", "datetime": "202607101830", "subtext": "GOLD", "screen": "AUDI 10 GOLD", "session_id": "51170", "availability": "sold_out", "min_price": 900, "max_price": 900 },
                    { "time": "10:10 PM", "datetime": "202607102210", "subtext": null, "screen": "AUDI 5", "session_id": "50984", "availability": "available", "min_price": 280, "max_price": 750 }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

`availability` is derived from `AvailStatus`: `3` → `available`, `1`/`2` → `fast_filling`, `0` → `sold_out`. `subtext` is `ShowTimes[].Attributes` (`null` when empty).

Empty/down venue shape:

```json
{
  "venue_code": "XXXX",
  "venue_name": "Some Theatre",
  "available_dates": [],
  "schedule": [],
  "notice": "No shows currently available at this cinema."
}
```
