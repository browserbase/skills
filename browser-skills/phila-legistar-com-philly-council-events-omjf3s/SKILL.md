---
name: phila-legistar-com-philly-council-events-omjf3s
title: Philadelphia City Council Events
description: >-
  Extract Philadelphia City Council and committee meeting events from the
  Legistar calendar (phila.legistar.com), filterable by year and body. Returns a
  Zod-validated array of events with name, date, time, location, and
  agenda/minutes URLs. Read-only.
website: phila.legistar.com
category: government
tags:
  - government
  - legislative
  - philadelphia
  - legistar
  - calendar
  - civic-data
source: 'browserbase: agent-runtime 2026-05-20'
updated: '2026-05-20'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      When the public Legistar WebAPI (webapi.legistar.com) is unreachable at
      the network layer, navigate phila.legistar.com/Calendar.aspx, change the
      Telerik year dropdown to the target year, and scrape the resulting
      RadGrid. Costs ~10x more turns and depends on unstable a11y refs across
      ASP.NET postbacks.
verified: false
proxies: true
---
# Philadelphia City Council Events — Browser Skill

## Purpose

Extract Philadelphia City Council meeting events (City Council + all standing/joint committees) from the Legistar calendar — returning each event's name (meeting body), date, time, location, agenda/minutes status, and Legistar detail-page URL. Filterable by year and/or by specific body. Read-only — never opens agenda PDFs in write-mode, never modifies state.

The output is a Zod-validated array of event records. A reference Zod schema is included in `Expected Output`.

## When to Use

- Building a roster of upcoming or historical City Council and committee meetings for a given year.
- Backfilling a database of Philadelphia legislative meetings (the catalog goes back to 2000).
- Cross-referencing agenda packets / minutes URLs with a specific meeting date + body.
- Anywhere you'd otherwise scrape `phila.legistar.com/Calendar.aspx` HTML — the public Granicus Legistar **WebAPI is faster, cheaper, paginatable, and structurally more reliable**.

## Workflow

The phila.legistar.com Calendar.aspx page is a Telerik RadGrid built on top of an **unauthenticated, public Granicus Legistar WebAPI** at `https://webapi.legistar.com/v1/phila/`. The browser UI is a thin client over this API — every record visible in the grid is queryable directly via OData. Lead with the API; the browser flow is the fallback for when the API is unreachable from your network sandbox (no auth, no anti-bot — but some sandboxes block raw DNS for `webapi.legistar.com`).

### Recommended — Legistar WebAPI

1. **Endpoint discovery.** The Philadelphia tenant slug is `phila`. The Events endpoint is:
   ```
   GET https://webapi.legistar.com/v1/phila/Events
   ```
   No API key, no cookies, no Referer required. Verified 2026-05-20 — Microsoft IIS/10.0 + `Granicusserver: gasmp-legapi1/2`, ASP.NET WebAPI OData v3.

2. **Filter by year.** OData v3 `$filter` syntax — the field is `EventDate` (datetime, midnight UTC):
   ```
   GET https://webapi.legistar.com/v1/phila/Events
       ?$filter=EventDate ge datetime'2025-01-01' and EventDate lt datetime'2026-01-01'
       &$orderby=EventDate
       &$top=200
   ```
   URL-encode the `$` as `%24` and the apostrophes/spaces as needed; literal `+` for spaces works inside `$filter`. The `datetime'YYYY-MM-DD'` literal is the supported OData v3 form (NOT `datetimeoffset'...'` — that 400s).

3. **Filter by body.** Each meeting carries `EventBodyId` (integer) and `EventBodyName` (string). To restrict to "CITY COUNCIL" only (no committees), add:
   ```
   and EventBodyId eq 10
   ```
   Bodies discovered 2026-05-20 (sample): `BodyId=10 → "CITY COUNCIL"`, `4 → "Committee on Public Health and Human Services"`, `39 → "Committee of the Whole"`, `44 → "Committee on Legislative Oversight"`, `50 → "Committee on Law and Government"`. The full body list is at `GET https://webapi.legistar.com/v1/phila/Bodies` (filter on `BodyActiveFlag eq 1` for currently-meeting bodies).

4. **Paginate.** Default page size for the Events endpoint is large but you should still cap with `$top` and step with `$skip` when iterating multi-year ranges:
   ```
   &$top=1000&$skip=0     # batch 1
   &$top=1000&$skip=1000  # batch 2
   ```
   2025 has 154 records (verified against the browser grid). A single `$top=1000` covers a full year safely.

5. **Parse the response.** **Default content-type is XML** (`application/xml; charset=utf-8`) — the OData `$format` query option is rejected (`"Query option 'Format' is not allowed"`), and the `Accept: application/json` header is silently ignored on this tenant (still returns XML). Parse the XML envelope `<ArrayOfGranicusEvent>` → `<GranicusEvent>` elements with these fields:

   | XML element | Type | Maps to |
   |---|---|---|
   | `EventId` | int | Stable meeting ID (e.g. `6115`) |
   | `EventGuid` | UUID | Alternate stable ID |
   | `EventBodyId` | int | See body-id table above |
   | `EventBodyName` | string | Meeting body / committee name |
   | `EventDate` | ISO datetime (date-only, midnight) | Meeting date |
   | `EventTime` | string | Display time, e.g. `"10:00 AM"`, `"2:00 PM"` |
   | `EventLocation` | string | e.g. `"Room 400, City Hall"` |
   | `EventAgendaFile` | URL or nil | Agenda PDF (may be `i:nil="true"`) |
   | `EventAgendaStatusName` | string | `"Final"` / `"Draft"` |
   | `EventMinutesFile` | URL or nil | Minutes PDF |
   | `EventMinutesStatusName` | string | `"Final"` / `"Draft"` |
   | `EventComment` | string or nil | Free-text annotations (cancellations, tabled-until notes) |
   | `EventInSiteURL` | URL | Legistar detail page: `https://phila.legistar.com/MeetingDetail.aspx?LEGID={EventId}&GID=30&G=...` |
   | `EventVideoStatus` | string | `"Public"` etc. |
   | `EventVideoPath` | URL or nil | Recorded-video URL |

6. **Zod-validate.** See the schema in `Expected Output`. Coerce `EventDate` to `Date`, parse `EventTime` separately, treat any element with `i:nil="true"` attribute as `null`.

### Browser fallback

Only use this when the WebAPI is blocked at the network layer (e.g. some sandboxes refuse outbound DNS for `webapi.legistar.com`). The same `browse cloud fetch` proxy path that works for `phila.legistar.com` also works for `webapi.legistar.com` — so 99% of the time the API path is reachable.

1. **Session setup.** A bare session is sufficient — no Akamai, no Cloudflare. `--proxies` adds resilience if your egress is rate-limited; `--verified` is not required.
   ```bash
   sid=$(browse cloud sessions create --keep-alive --proxies | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
   export BROWSE_SESSION="$sid"
   ```

2. **Open the calendar.**
   ```bash
   browse open "https://phila.legistar.com/Calendar.aspx" --remote
   browse wait load --remote
   browse wait timeout 2000 --remote
   ```
   Default state: `Calendar Year = "This Month"`, `Body = "City Council and All Committees"`. The page is a Telerik RadGrid (`ctl00_ContentPlaceHolder1_gridCalendar`) inside an ASP.NET WebForms postback model.

3. **Open the Year dropdown** by clicking the `cell: select` next to the year combobox (ref `~117` on a fresh snapshot — refs are NOT stable across postbacks, always re-snapshot):
   ```bash
   browse snapshot --remote
   browse click "@<select-cell-ref-next-to-year>" --remote
   browse wait timeout 1500 --remote
   ```

4. **Click the target year.** Options: `All Years`, `2026`, `2025`, ..., `2000`, `Last Year`, `Last Month`, `Last Week`, `This Year`, `This Month`, `This Week`, `Today`, `Next Week`, `Next Month`, `Next Year`. Use `browse snapshot` to locate the `listitem` ref for the target year, then `click`. The page does a full ASP.NET postback — wait for `load` and an extra 3000ms before re-snapshotting.

5. **Extract the grid.** Each grid row is a `[1-X] row` containing 11 cells in order: BodyName, MeetingDate, ExportToCalendar (iCal), MeetingTime, MeetingLocation, MeetingDetails (link), Agenda (link or "Not available"), AccessibleAgendaHTML, AgendaPacket, Minutes, AccessibleMinutesHTML. Iterate `[1-X] cell:` children inside each row. Read the record-count header (`menuitem: NNN records`) to validate completeness before parsing.

6. **Paginate.** The grid defaults to 100 rows per page. If the record count > 100, click the pager's "Next page" button at the bottom and re-snapshot. 2025 = 154 records = 2 pages.

7. **Body filter (optional).** Same pattern as year: click the body combobox `select` cell, click the desired body in the dropdown list. The body dropdown is ~115 options long.

8. **Release the session.**
   ```bash
   browse cloud sessions update "$sid" --status REQUEST_RELEASE
   ```

## Site-Specific Gotchas

- **No JSON.** `$format=json` query option is explicitly rejected by the Granicus WebAPI (`"Query option 'Format' is not allowed"` 400). The `Accept: application/json` header is silently ignored. Parse XML. Don't waste time looking for a JSON toggle — there isn't one.
- **`$inlinecount=allpages` is rejected** on Events. To get a total count, fetch with `$top=1000` and count entries in the response (or scrape the browser grid's `menuitem: NNN records` header). Verified 2026-05-20 — `$inlinecount` returns 200 but the count metadata is not present in the XML output.
- **OData v3 datetime literal form.** Use `datetime'2025-01-01'` (no time portion, no Z, no offset). `datetimeoffset'...'` 400s. ISO-8601 raw strings 400.
- **`EventDate` is date-only (midnight UTC).** The actual meeting wall-clock time is in `EventTime` as a display string (`"10:00 AM"`). To produce a single canonical timestamp, combine `EventDate` + `EventTime` in America/New_York (Philadelphia's timezone) — do NOT add `EventTime` to `EventDate` as UTC.
- **`i:nil="true"` attribute = null.** Any GranicusEvent field can be empty; the API marks empties with `<EventAgendaFile i:nil="true" />` rather than omitting the element. Map to `null` in your Zod schema.
- **Browser refs are NOT stable across postbacks.** Every Telerik RadComboBox interaction is a full ASP.NET `__doPostBack`, which regenerates the entire a11y tree (the grid re-snapshot grew from `[1-940]` to `[1-5306]` after a single year-filter click). Always re-`browse snapshot` before each `browse click` in the fallback flow.
- **Default page state is "This Month".** First page load returns 2 records (the current week's meetings). Don't conclude "the calendar is empty" — change the year filter to `All` or a specific year first.
- **Body dropdown is ~115 entries** including standing committees, joint committees ("Joint Committees on X and Y"), and special committees. The full enum is in the `RadComboBox` `itemData` array embedded in Calendar.aspx HTML; the WebAPI `Bodies` endpoint is the canonical list (filter `BodyActiveFlag eq 1, BodyMeetFlag eq 1` for currently-meeting bodies).
- **Cookie-based settings.** Calendar.aspx persists filter state in cookies (`Setting-30-Calendar Year`, `Setting-30-Calendar Body`, `Setting-30-Calendar Options`). These travel across page reloads in the same session. Useful if you want to lock a year selection without re-clicking the dropdown — but irrelevant when using the WebAPI.
- **`EventInSiteURL` includes session-bound parameters.** The `G=A5947DFE-...` GUID is a tenant-static identifier, NOT a per-user session token — safe to cache and reuse across runs. The `LEGID=` parameter is the canonical `EventId`.
- **`EventComment` carries meeting-state metadata.** Look for strings like `"No Calendar for Today"`, `"Council President tabled meeting until ..."`, `"CANCELLED"`. The grid UI displays these as inline notes. Surface them in the output schema so consumers can distinguish a scheduled-but-cancelled meeting from one that actually occurred.
- **Joint committees have free-text names in the dropdown but normalized names in the API.** The Calendar.aspx itemData has explicit `text` overrides like `"Joint Committees on Children & Youth and Education"` for some joint bodies; the WebAPI returns the same string in `EventBodyName`. Treat `EventBodyName` as the source of truth.
- **Catalog depth.** Years 2000 through 2026 are queryable. Pre-2000 events return empty.

## Expected Output

A Zod-validated array of event records:

```typescript
import { z } from "zod";

export const PhilaCouncilEventSchema = z.object({
  eventId: z.number().int(),
  eventGuid: z.string().uuid(),
  bodyId: z.number().int(),
  bodyName: z.string(),                    // e.g. "CITY COUNCIL", "Committee on Law and Government"
  date: z.coerce.date(),                   // EventDate, midnight UTC
  time: z.string(),                        // EventTime display string, e.g. "10:00 AM"
  location: z.string(),                    // e.g. "Room 400, City Hall"
  agendaFile: z.string().url().nullable(),
  agendaStatus: z.enum(["Draft", "Final"]),
  minutesFile: z.string().url().nullable(),
  minutesStatus: z.enum(["Draft", "Final"]),
  comment: z.string().nullable(),          // e.g. "CANCELLED", "tabled until ..."
  videoStatus: z.string(),                 // e.g. "Public"
  videoPath: z.string().url().nullable(),
  detailUrl: z.string().url(),             // EventInSiteURL
});

export const PhilaCouncilEventsSchema = z.array(PhilaCouncilEventSchema);
```

Example output (2 records from year=2025):

```json
[
  {
    "eventId": 6115,
    "eventGuid": "0C3EC3DE-5220-4E73-8D14-47FA1D2C4EFA",
    "bodyId": 50,
    "bodyName": "Committee on Law and Government",
    "date": "2025-01-22T00:00:00.000Z",
    "time": "10:00 AM",
    "location": "Room 400, City Hall",
    "agendaFile": "https://philadelphia.legistar1.com/philadelphia/meetings/2025/1/6115_A_Committee_on_Law_and_Government_25-01-22_Public_Hearing_Notice.pdf",
    "agendaStatus": "Final",
    "minutesFile": null,
    "minutesStatus": "Draft",
    "comment": null,
    "videoStatus": "Public",
    "videoPath": null,
    "detailUrl": "https://phila.legistar.com/MeetingDetail.aspx?LEGID=6115&GID=30&G=A5947DFE-5A17-435B-A57D-5F0923C2343D"
  },
  {
    "eventId": 6093,
    "eventGuid": "BCAFB815-DC0D-4423-AAFE-44150A03BBFA",
    "bodyId": 10,
    "bodyName": "CITY COUNCIL",
    "date": "2025-01-23T00:00:00.000Z",
    "time": "10:00 AM",
    "location": "Room 400, City Hall",
    "agendaFile": "https://philadelphia.legistar1.com/philadelphia/meetings/2025/1/6093_A_CITY_COUNCIL_25-01-23_City_Council_Calendar.pdf",
    "agendaStatus": "Final",
    "minutesFile": "https://philadelphia.legistar1.com/philadelphia/meetings/2025/1/6093_M_CITY_COUNCIL_25-01-23_Meeting_Minutes_%28Long%29.pdf",
    "minutesStatus": "Final",
    "comment": null,
    "videoStatus": "Public",
    "videoPath": null,
    "detailUrl": "https://phila.legistar.com/MeetingDetail.aspx?LEGID=6093&GID=30&G=A5947DFE-5A17-435B-A57D-5F0923C2343D"
  }
]
```

If the requested year has no events (e.g., a year before 2000), return `[]`.
