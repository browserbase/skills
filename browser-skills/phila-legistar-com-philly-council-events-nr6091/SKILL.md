---
name: phila-legistar-com-philly-council-events-nr6091
title: Philadelphia City Council Calendar Events
description: >-
  Extract Philadelphia City Council and committee meetings from
  phila.legistar.com — name, date, time, body, location, agenda/minutes URLs —
  filtered by year and/or meeting body via the public Legistar Web API. Browser
  fallback documented.
website: phila.legistar.com
category: civic-data
tags:
  - legistar
  - civic-data
  - philadelphia
  - city-council
  - calendar
  - open-data
source: 'browserbase: agent-runtime 2026-05-22'
updated: '2026-05-22'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      Drive Calendar.aspx, click year + body comboboxes, scrape RadGrid rows.
      Pays ~50× cost premium and needs --verified Browserbase session to dodge
      the occasional anti-bot challenge; only worth it if the API is unreachable
      from your network.
verified: true
proxies: true
---
# Philadelphia City Council Calendar Events

## Purpose

Return the list of Philadelphia City Council and committee meetings ("events") from `phila.legistar.com`, optionally filtered by year and/or meeting body — meeting name, date, time, body, location, links to agenda / minutes PDFs, and the canonical MeetingDetail.aspx URL. Read-only; never modifies, subscribes, or signs in.

## When to Use

- Monitoring upcoming City Council, Committee, or joint-committee meetings for a specific year.
- Bulk-extracting meeting history for civic-tech analysis (open data, journalism, transparency tooling).
- Resolving an `EventId` / `LEGID` from a meeting date + body, so a downstream skill can fetch the agenda items.
- Any time you'd otherwise drive the Calendar.aspx UI: the JSON/XML API is ~50× faster, has no anti-bot, and exposes fields the grid hides (EventGuid, EventBodyId, draft/final status).

## Workflow

Philadelphia Legistar (and every Granicus Legistar deployment) ships a fully public REST API at `https://webapi.legistar.com/v1/{client}/Events` with the `phila` client slug. No auth, no cookies, no anti-bot, no residential proxy required. OData query strings filter by year, body, and date range. The browser at `https://phila.legistar.com/Calendar.aspx` is a thin client over the same data — driving it costs ~10–15 turns per page of results vs. one HTTP call to the API, and the Telerik RadGrid that backs it requires anti-bot stealth that the API does not.

**Lead with the API.** Browser fallback (Step 4 below) is documented only for the case where the API is geo-blocked or rate-limited from your network.

### Step 1 — Hit the Events endpoint

```
GET https://webapi.legistar.com/v1/phila/Events
    ?$top=1000
    &$filter=year(EventDate) eq {YYYY}
    &$orderby=EventDate desc
Accept: application/json     # XML returned by default; set this header to get JSON
```

URL-encode the `$` (`%24`), `=` and spaces if your HTTP client doesn't auto-encode. Example with year=2025:

```
GET https://webapi.legistar.com/v1/phila/Events?%24top=1000&%24filter=year(EventDate)%20eq%202025&%24orderby=EventDate%20desc
```

Confirmed 2026-05-22: returns 154 events for `year(EventDate) eq 2025`, 150 events for `year(EventDate) eq 2024`, served in ~0.5–1.5s with no auth headers.

### Step 2 — Decode each event

JSON returns an array `[{ Event… }, …]`; XML wraps in `<ArrayOfGranicusEvent>…<GranicusEvent>…</GranicusEvent>…</ArrayOfGranicusEvent>`. Fields per event (same names in both formats):

| Field | Type | Notes |
|---|---|---|
| `EventId` | int | Stable per-meeting id (a.k.a. `LEGID`) — use this for joining to other Legistar endpoints. |
| `EventGuid` | string (UUID) | Stable global id. |
| `EventBodyId` | int | Foreign key to `/Bodies` — `10` = `CITY COUNCIL`, see Bodies catalog below. |
| `EventBodyName` | string | Human-readable body, e.g. `CITY COUNCIL`, `Committee on Public Safety`, `Joint Committees on Education and Children & Youth`. **Casing varies** — `CITY COUNCIL` is uppercase, committees are Title Case. |
| `EventDate` | ISO 8601 | Midnight in *local civil time* (`2025-12-11T00:00:00`). **No timezone offset** — these are wall-clock dates in America/New_York. Do not interpret as UTC. |
| `EventTime` | string | Free-form display string: `"10:00 AM"`, `"9:15 AM"`, occasionally `"1:30 PM"`. Always parse defensively. |
| `EventLocation` | string \| null | E.g. `"Room 400, City Hall"`, sometimes with HTML-stripped trailing notes. |
| `EventInSiteURL` | string | Canonical link to the meeting detail page. |
| `EventAgendaFile` | string \| null | PDF URL on `philadelphia.legistar1.com` (CDN host, **different domain**), or `null` when not yet published. |
| `EventAgendaStatusName` | string | `Final`, `Draft`, or `Cancelled` — cancellations don't remove the row, they re-status it. |
| `EventMinutesFile` | string \| null | PDF URL once minutes are published; null for upcoming or recent meetings. |
| `EventMinutesStatusName` | string | `Final`, `Draft`. |
| `EventComment` | string \| null | Free-text notes — often holds cancellation reasons (`"THIS MEETING HAS BEEN CANCELED"`) or tabled-until dates. Always check this before treating a row as "occurred". |
| `EventVideoPath` | string \| null | Public-meeting video URL when available. |
| `EventVideoStatus` | string | `Public` or `Private`. |
| `EventLastModifiedUtc` | ISO 8601 | UTC; useful for incremental sync. |

### Step 3 — Filter further (optional)

Compose additional OData predicates with `and`:

| Goal | Filter clause |
|---|---|
| One body only (City Council) | `EventBodyId eq 10` |
| All committees, no Council | `EventBodyId ne 10` |
| Date range | `EventDate ge datetime'2025-01-01' and EventDate le datetime'2025-06-30'` |
| Just non-cancelled meetings | `EventAgendaStatusName ne 'Cancelled'` |
| Combined: City Council 2025 only | `year(EventDate) eq 2025 and EventBodyId eq 10` |

The body id catalog is fetched once from `https://webapi.legistar.com/v1/phila/Bodies` (returns every `GranicusBody` with `BodyId`, `BodyName`, `BodyTypeName`). Known stable ids: `10` City Council, `39` Committee of the Whole, `37` Committee on Public Safety, `42` Committee on Public Property and Public Works, `51` Committee on Appropriations, `94` Committee on Fiscal Stability and Intergovernmental Cooperation. New committees get new ids each council session; don't hardcode beyond `10`.

### Step 4 — Paginate (only when expected > 1000 rows)

The default page is the full filtered result up to `$top`. `$top` accepts values up to **~1000** — `$top=2000` returns HTTP 400 (`ObjectContent serialization failed`). Use `$skip` to walk further:

```
GET …?$top=100&$skip=0&$orderby=EventDate&$filter=…
GET …?$top=100&$skip=100&$orderby=EventDate&$filter=…
```

A year of Philadelphia events fits comfortably in one page (max observed ~250). Pagination is only relevant for full-archive sweeps across all years (since 2000).

### Browser fallback

Use only if the API is unreachable from your network. The grid is fully JS-rendered Telerik RadGrid — `browse snapshot` does work after the page settles (we observed 18 grid rows in default `This Month` view, 100 per page when filtered to `2025`).

1. **Open** `https://phila.legistar.com/Calendar.aspx` with a **verified Browserbase session and residential proxies** (`browse cloud sessions create --keep-alive --verified --proxies`). Without `--verified` the session sometimes serves a hardened challenge page; with it, the calendar loads cleanly.
2. **Snapshot** the page. The year combobox is the cell containing the current selection (default `"This Month"`, ref e.g. `[1-146]`) and its trigger link (`[1-374]`-ish, label `select`). Click the trigger to open the dropdown.
3. **Re-snapshot** to find the year option. Snapshot labels include `2026`, `2025`, `2024`, …, `All Years`, `This Year`, `This Month`, `Next Year`. Click the option's `StaticText` ref directly — `browse click [1-385]` selected `2025` in the iter-1 run.
4. **Wait 2–3s** for the RadAjax refresh — the grid swaps in-place, no full navigation. `browse wait timeout 2500` is enough; `browse wait selector` against the grid is fragile because the grid id is constant across loads.
5. **Re-snapshot** and walk the `[1-NNN] row` nodes under the `tbody`. Each row has cells in this fixed order: Name, Meeting Date, ICS (Export-to-iCalendar), Meeting Time, Meeting Location, Meeting Details (link), Agenda (link), Accessible Agenda, Agenda Packet, Minutes, Accessible Minutes.
6. **Pagination**: the grid says `"Page 1 of N, items 1 to 100 of M"`. The `M` total *can exceed the API count for the same year* (observed 426 in UI vs 154 in API for 2025) — the UI appears to count agenda-item-bearing rows differently. **Treat the API count as canonical** if the two disagree.

## Site-Specific Gotchas

- **The CDN host is different from the API host**. Agenda + minutes PDFs live on `philadelphia.legistar1.com` (note the `1`, the city slug rendered out, and `.com` not `.com/Calendar.aspx`). The HTML calendar lives on `phila.legistar.com`. Don't conflate them when validating URLs.
- **`$select` is broken in XML output** — `?$select=EventId,EventDate` returns HTTP 500 `XmlMediaTypeFormatter.WriteToStreamAsync` failure. Request all fields (the response is small) or set `Accept: application/json` first if you need projection.
- **`$format=json` is rejected** — `Query option 'Format' is not allowed`. Use the `Accept: application/json` header to control format; query-string format negotiation is disabled on this server.
- **`$inlinecount=allpages` is silently ignored** — the XML payload has no count wrapper. Count by issuing a parallel `$top=1` call and counting client-side, or estimate from `$top`.
- **`$top` ceiling is between 1000 and 2000** — `$top=1000` works, `$top=2000` returns HTTP 400 with `ObjectContent serialization failed`. Keep page size at 1000 max.
- **`EventDate` carries no timezone**. The ISO 8601 string `2025-12-11T00:00:00` is wall-clock America/New_York. Combining it with `EventTime` (`"10:00 AM"`) requires manual parsing — there is no `EventDateTime` field. The Legistar API has had this shape since at least 2018-12-14 (`EventLastModifiedUtc` on the earliest events).
- **`EventBodyName` casing is inconsistent** — `CITY COUNCIL` is uppercase but every committee is mixed case (`Committee on…`). Compare body names case-insensitively. The numeric `EventBodyId` is the only stable foreign key.
- **Cancelled meetings stay in the result set** — `EventAgendaStatusName: "Cancelled"` with a comment in `EventComment` (`"THIS MEETING HAS BEEN CANCELED"`). Filter them client-side if you want only meetings that occurred.
- **Old-archive sentinel rows**: meetings from 2000–2002 sometimes have `EventTime: "9:00 AM"`/`"10:00 AM"` and `EventComment` describing a tabling that re-scheduled the meeting (`"Council President tabled meeting until Feb 10, 2000 at 2:00 P.M."`). These are first-class rows, not duplicates.
- **No residential proxy required for the API**. The API endpoint is reachable from any IP; only the `phila.legistar.com` UI needs `--verified --proxies` on Browserbase to avoid a challenge page (and even then the challenge is uncommon).
- **UI grid total disagrees with API total**. `Calendar.aspx` filtered to `2025` shows `Page 1 of 5, items 1 to 100 of 426`, but `?$filter=year(EventDate) eq 2025` returns 154 distinct events. The UI count appears to include some other axis (possibly agenda items or duplicated joint-committee rows). **The API count is canonical for "distinct meetings".**
- **The browser calendar default is `This Month` + `City Council and All Committees`**. To get a full year you must click into the year combobox — there is no `?year=2025` query param shortcut on `Calendar.aspx`. The API is materially less work.

## Expected Output

A Zod-validated array of events. Schema (TypeScript):

```typescript
const EventSchema = z.object({
  event_id: z.number().int(),                        // EventId
  event_guid: z.string().uuid(),                     // EventGuid
  body_id: z.number().int(),                         // EventBodyId
  meeting_body: z.string(),                          // EventBodyName
  meeting_date: z.string(),                          // "YYYY-MM-DD" (date portion of EventDate)
  meeting_time: z.string(),                          // "10:00 AM" — EventTime as-is
  meeting_location: z.string().nullable(),           // EventLocation
  detail_url: z.string().url(),                      // EventInSiteURL
  agenda_url: z.string().url().nullable(),           // EventAgendaFile
  agenda_status: z.string(),                         // EventAgendaStatusName: Final | Draft | Cancelled
  minutes_url: z.string().url().nullable(),          // EventMinutesFile
  minutes_status: z.string(),                        // EventMinutesStatusName
  video_url: z.string().url().nullable(),            // EventVideoPath
  comment: z.string().nullable(),                    // EventComment
  last_modified_utc: z.string(),                     // EventLastModifiedUtc
});

const OutputSchema = z.object({
  source: z.literal("legistar-webapi-v1"),
  client: z.literal("phila"),
  year_filter: z.number().int().nullable(),          // null = no year filter applied
  body_filter: z.number().int().nullable(),          // null = all bodies
  event_count: z.number().int(),
  events: z.array(EventSchema),
});
```

Example output (year_filter = 2025, body_filter = 10 → City Council only, truncated to 2 events):

```json
{
  "source": "legistar-webapi-v1",
  "client": "phila",
  "year_filter": 2025,
  "body_filter": 10,
  "event_count": 5,
  "events": [
    {
      "event_id": 6288,
      "event_guid": "F8B07668-09DD-443A-B770-8C38F335AA88",
      "body_id": 10,
      "meeting_body": "CITY COUNCIL",
      "meeting_date": "2025-12-11",
      "meeting_time": "10:00 AM",
      "meeting_location": "Room 400, City Hall",
      "detail_url": "https://phila.legistar.com/MeetingDetail.aspx?LEGID=6288&GID=30&G=A5947DFE-5A17-435B-A57D-5F0923C2343D",
      "agenda_url": "https://philadelphia.legistar1.com/philadelphia/meetings/2025/12/6288_A_CITY_COUNCIL_25-12-11_City_Council_Calendar.pdf",
      "agenda_status": "Final",
      "minutes_url": "https://philadelphia.legistar1.com/philadelphia/meetings/2025/12/6288_M_CITY_COUNCIL_25-12-11_Meeting_Minutes_%28Long%29.pdf",
      "minutes_status": "Final",
      "video_url": null,
      "comment": null,
      "last_modified_utc": "2026-01-13T20:29:20.243"
    },
    {
      "event_id": 6093,
      "event_guid": "BCAFB815-DC0D-4423-AAFE-44150A03BBFA",
      "body_id": 10,
      "meeting_body": "CITY COUNCIL",
      "meeting_date": "2025-01-23",
      "meeting_time": "10:00 AM",
      "meeting_location": "Room 400, City Hall",
      "detail_url": "https://phila.legistar.com/MeetingDetail.aspx?LEGID=6093&GID=30&G=A5947DFE-5A17-435B-A57D-5F0923C2343D",
      "agenda_url": "https://philadelphia.legistar1.com/philadelphia/meetings/2025/1/6093_A_CITY_COUNCIL_25-01-23_City_Council_Calendar.pdf",
      "agenda_status": "Final",
      "minutes_url": "https://philadelphia.legistar1.com/philadelphia/meetings/2025/1/6093_M_CITY_COUNCIL_25-01-23_Meeting_Minutes_%28Long%29.pdf",
      "minutes_status": "Final",
      "video_url": null,
      "comment": null,
      "last_modified_utc": "2025-01-30T15:19:51.813"
    }
  ]
}
```

Cancellation example (single event):

```json
{
  "event_id": 5904,
  "meeting_body": "CITY COUNCIL",
  "meeting_date": "2024-09-19",
  "meeting_time": "10:00 AM",
  "agenda_status": "Cancelled",
  "comment": "THIS MEETING HAS BEEN CANCELED",
  "agenda_url": null,
  "minutes_url": null
}
```
