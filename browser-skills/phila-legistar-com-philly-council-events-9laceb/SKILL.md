---
name: phila-legistar-com-philly-council-events-9laceb
title: Philadelphia City Council Calendar Events
description: >-
  Extract Philadelphia City Council meetings and committee hearings from
  phila.legistar.com/Calendar.aspx — meeting body name, date, time, location,
  event ID/GUID, and canonical detail URL. Year-filterable. Zod-validated array.
website: phila.legistar.com
category: government
tags:
  - government
  - legistar
  - philadelphia
  - city-council
  - calendar
  - civic-data
source: 'browserbase: agent-runtime 2026-05-23'
updated: '2026-05-23'
recommended_method: api
alternative_methods:
  - method: api
    rationale: >-
      Granicus Legistar Web API at https://webapi.legistar.com/v1/phila/Events
      is unauthenticated, OData-filterable, and structurally cleaner than
      scraping the rendered grid. Returns XML only ($format=json rejected,
      CORS-blocks in-browser fetch), so must be called from server-side code.
  - method: browser
    rationale: >-
      Drive Calendar.aspx directly when the WebAPI is unreachable or the
      consuming environment can only run a browser. Year filter uses a Telerik
      RadComboBox postback; pagination is 100/page via __doPostBack. No
      anti-bot, no stealth needed.
verified: false
proxies: false
---
# Philadelphia City Council Calendar Events

## Purpose

Return a list of Philadelphia City Council meetings and committee hearings published on `phila.legistar.com/Calendar.aspx` — one record per event with the meeting body name, date, time, location, plus stable identifiers (event ID, GUID) and the canonical `MeetingDetail.aspx` URL. Read-only; never books, edits, or submits anything. Output is a Zod-validated array.

## When to Use

- Watching the Philadelphia City Council calendar for new committee hearings or full-council sessions to attend / cover / track.
- Building a date-bounded archive of every meeting the City Council and its committees held in a given year (or "All Years" for the full back-catalog to 2000).
- Filtering by meeting body (CITY COUNCIL, Committee on Finance, joint committees, special committees, etc.) for downstream legislative-tracking pipelines.
- Anywhere you'd otherwise scrape the Legistar HTML grid — the Granicus Legistar Web API (see step 1) is faster, paginated by OData, and structurally cleaner.

## Workflow

phila.legistar.com is a hosted Granicus Legistar instance. **The same data the calendar grid renders is also exposed by the Granicus Legistar Web API at `https://webapi.legistar.com/v1/phila/Events` — no auth, no cookies, no anti-bot, no stealth needed.** Lead with the API path. The browser path works and is the *literal* task description ("navigate calendar, filter by year") — keep it as the documented fallback because the API returns XML only and CORS-blocks in-browser `fetch()`, so any deployment that can't reach `webapi.legistar.com` from server-side code has to drive the calendar grid.

### Recommended — Granicus Legistar Web API

1. **GET the year-bounded slice**:
   ```
   GET https://webapi.legistar.com/v1/phila/Events
       ?$filter=EventDate ge datetime'YYYY-01-01' and EventDate lt datetime'YYYY+1-01-01'
       &$orderby=EventDate desc
       &$top=1000
   ```
   (Spaces in `$filter` must be URL-encoded as `%20` or `+`. Single-quotes must be literal — they're part of OData's `datetime'…'` syntax.) For *all* years, drop the `$filter`. Returns `application/xml` (`<ArrayOfGranicusEvent>` containing `<GranicusEvent>` children).

2. **Parse XML**. Field map per `<GranicusEvent>`:
   - `EventBodyName` → meeting body / committee name (e.g. `CITY COUNCIL`, `Committee on Finance`, `Joint Committees on …`)
   - `EventDate` → ISO date `YYYY-MM-DDT00:00:00` (always midnight; time is in a separate field)
   - `EventTime` → free-text time string (`9:00 AM`, `1:30 PM`, occasionally blank)
   - `EventLocation` → free-text location (`Room 400, City Hall`, sometimes with trailing notes)
   - `EventId` → integer, stable Legistar primary key
   - `EventGuid` → uppercase UUID, stable
   - `EventBodyId` → integer body ID (e.g. `10` = CITY COUNCIL, `39` = Committee of the Whole)
   - `EventInSiteURL` → canonical `MeetingDetail.aspx?LEGID=<id>&GID=30&G=<root-guid>` URL
   - `EventAgendaFile` / `EventMinutesFile` → PDF URLs (nilled with `i:nil="true"` when not published)
   - `EventComment` → notes ("No Calendar for Today", "tabled until …"); often nil

3. **Validate** with the Zod schema below and emit the array.

4. **Paginate** if you set `$top` lower than the year's record count: use `$skip=<n>&$top=<m>` with the same `$filter` + `$orderby`. The 2025 record count is ~154; the API will happily return all of them in a single `$top=1000` call. For "All Years" (≥50k records), `$top` defaults to ~1000 server-side; paginate explicitly.

### Browser fallback — drive `Calendar.aspx`

Use this when the WebAPI is unreachable (proxy / firewall / DNS) or when the consuming environment can't run server-side HTTP and only has a browser session.

1. **Open** `https://phila.legistar.com/Calendar.aspx`. Default view is **"This Month"** with body filter **"City Council and All Committees"**. No stealth required — the site has no anti-bot.

2. **Change the Year filter**. The control is a Telerik RadComboBox at `[id*=lstYears]`. Click the dropdown's "select" link (an anchor inside `cell: select` in the snapshot, adjacent to the year input), wait ~800ms for the option list to render, then click the listitem whose StaticText matches the target — `2025`, `2024`, …, `All Years`, or a relative preset (`This Year`, `Last Year`, `This Month`, `Today`, etc.). This triggers an ASP.NET full-page postback (~2-3s).

3. **Confirm filter applied**. Read `document.querySelector("[id*=lstYears] input[id*=Input]").value` — must equal the year you picked. The page also persists a cookie `Setting-30-Calendar Year=<value>` for subsequent visits in the same session.

4. **Extract page 1** from `table[id*=gridCalendar]`. Filter out pager rows (`tr.querySelectorAll("td").length <= 5`). Data row columns by index:
   - `td[0]` — meeting body name (`CITY COUNCIL`, `Committee on Finance`, …)
   - `td[1]` — meeting date as `M/D/YYYY`
   - `td[2]` — iCalendar export anchor (`a[href*="View.ashx?M=IC"]`)
   - `td[3]` — meeting time `H:MM AM/PM` (occasionally blank)
   - `td[4]` — location, sometimes followed by a `<br>` + emphasized note
   - `td[5]` — Meeting Details anchor → `MeetingDetail.aspx?ID=<EventId>&GUID=<EventGuid>&Options=info|&Search=`
   - `td[6..7]` — Agenda + Accessible Agenda anchors (or "Not available")
   - `td[8..10]` — Agenda Packet, Minutes, Accessible Minutes (often "Not available")

5. **Paginate**. Read `document.body.innerText.match(/Page (\d+) of (\d+)/)` (the string appears twice — once per pager, top + bottom — so dedupe). For pages 2..N, trigger the page postback:
   ```js
   __doPostBack("ctl00$ContentPlaceHolder1$gridCalendar$ctl00$ctl02$ctl00$ctl04", "");
   ```
   The control ID encodes the page number in the trailing `ctl04` → page 2, `ctl05` → page 3, etc. Discover the exact ID by selecting the anchor whose `innerText` matches the target page number under `#ctl00_ContentPlaceHolder1_gridCalendar_ctl00NPPHTop`. Wait ~2-3s for postback completion before re-extracting.

6. **Stop** when the pager shows `items A to B of N` with `B === N` or the page number equals the total. Concatenate, dedupe by `EventId` if you ran into the rare pager overlap, validate with Zod, emit.

## Site-Specific Gotchas

- **Granicus Legistar Web API exists and is unauthenticated** — `https://webapi.legistar.com/v1/phila/Events` is the canonical fast-path. Standard OData (`$filter`, `$orderby`, `$top`, `$skip`, `$select`, `$count`). The `phila` segment is the Legistar client slug; other Legistar cities use the same API shape under their own slug (e.g. `nyc`, `chicago`, `seattle`). **No `phila.legistar.com` cookies or session needed** to hit the API — it's a separate origin.
- **API returns XML only.** `$format=json` is explicitly rejected (`400 — Query option 'Format' is not allowed`). Setting `Accept: application/json` does not switch the response. Parse the XML — every field is a simple `<EventX>value</EventX>` tag, no attributes (except `i:nil="true"` on missing values), so `fast-xml-parser` or a regex strategy both work.
- **API is CORS-blocked from in-browser `fetch()`.** A `fetch("https://webapi.legistar.com/...")` from a page on `phila.legistar.com` (or any other origin) fails with `TypeError: Failed to fetch`. The API must be called from server-side code (Node `fetch`, `curl`, Playwright `request` context — anything that isn't a browser-page-context fetch).
- **`EventDate` is always midnight (`T00:00:00`).** The wall-clock time is a separate string in `EventTime` (`"9:00 AM"`, `"1:30 PM"`, occasionally blank or `"TBD"`). Combine them client-side if you need a full datetime; don't trust `EventDate`'s time component.
- **`EventTime` is free-text, not parseable as a fixed format.** Most values are `H:MM AM/PM`. Some events have `EventTime` blank (especially older records and "No Calendar for Today" placeholders). The grid also shows blank time for the same events.
- **HTML date format is `M/D/YYYY`, not `MM/DD/YYYY`.** No zero-padding (`5/4/2026` not `05/04/2026`). Parse defensively.
- **The calendar grid defaults to "This Month" + "All committees".** A fresh `GET /Calendar.aspx` returns ~18 rows (the current month). The Year dropdown must be set explicitly to pull a full year. The body dropdown defaults to "City Council and All Committees" which is *all* events; narrowing to "CITY COUNCIL" alone filters out committee meetings.
- **ASP.NET WebForms postbacks, not URL-driven filters.** Year, body, search, sort, and pagination all go through `__doPostBack(...)` with `__VIEWSTATE` cookies — there is no `?year=2025` URL param. You can't deep-link to a filtered view; cookies persist filter state but only across requests in the same session (`Setting-30-Calendar Year=2025`, `Setting-30-Calendar Body=All`, `Setting-30-ASP.calendar_aspx.gridCalendar.SortExpression=MeetingStartDate DESC`).
- **Telerik RadComboBox quirks.** The Year and Body dropdowns are not native `<select>` elements. Open them by clicking the small "select" anchor adjacent to the textbox (cell role `select`, ref like `[1-381]` in the a11y tree). Options render in a floating div outside the table cell. `<select name=…>` selectors do not work.
- **Pagination chunk is 100 rows.** Pager text `Page X of Y, items A to B of N` appears *twice* (top + bottom pager) — the regex matches both; dedupe before parsing. Total record count is the `N` at the end. Pages > 1 are reached via `__doPostBack("ctl00$ContentPlaceHolder1$gridCalendar$ctl00$ctl02$ctl00$ctl<NN>", "")` where `<NN>` encodes the page number — discover the literal control ID by querying the pager anchors rather than guessing.
- **"All Years" returns the full back-catalog (~50,000 events from 2000 onward).** Don't accidentally pick it for a single-year extraction — both the browser path (500 pages) and the API path (50k records over N $skip pages) get expensive. Always pass an explicit year filter unless you actually want everything.
- **"Joint Committees" event names are long.** Examples: "Joint Committees on Public Health & Human Services and Public Safety", "Joint Special Committee on Gun Violence Prevention & Committee on Children and Youth". Display-width truncation in the rendered table is a CSS concern only — the underlying `EventBodyName` (API) or `td[0].innerText` (browser) contains the full string.
- **`EventBodyName` is the authoritative meeting-body field.** The browser path renders the same string into `td[0]`; both are consistent. Do not derive body from `EventBodyId` — body IDs are stable but not human-readable.
- **Location cell has trailing emphasis notes.** For CITY COUNCIL rows, `td[4]` reads `Room 400, City Hall` followed by `<br>` + an italicized "_PLEASE USE THE AGENDA PDF to select an item for PUBLIC COMMENT, not the MEETING DETAILS._" When extracting a clean location, take the first line of the innerText only. Budget hearings on Committee of the Whole append `_BUDGET_` similarly.
- **No anti-bot / no stealth.** The site is bare ASP.NET WebForms on Microsoft-IIS/10.0 served via Granicus. `--proxies`/`--verified` are *not* required — they cost extra and offer no benefit. Default to a bare cloud session.
- **iCalendar export per event.** Each row has an `View.ashx?M=IC&ID=<EventId>&GUID=<EventGuid>` link that returns a standalone `.ics` file. Useful as a stable per-event permalink alongside `MeetingDetail.aspx`.

## Expected Output

A flat array of event objects, Zod-validated. One outcome shape:

```json
[
  {
    "name": "CITY COUNCIL",
    "date": "2025-12-11",
    "time": "10:00 AM",
    "body": "CITY COUNCIL",
    "location": "Room 400, City Hall",
    "eventId": 6288,
    "eventGuid": "F8B07668-09DD-443A-B770-8C38F335AA88",
    "meetingDetailUrl": "https://phila.legistar.com/MeetingDetail.aspx?LEGID=6288&GID=30&G=A5947DFE-5A17-435B-A57D-5F0923C2343D",
    "icsUrl": "https://phila.legistar.com/View.ashx?M=IC&ID=6288&GUID=F8B07668-09DD-443A-B770-8C38F335AA88"
  },
  {
    "name": "Committee on Public Property and Public Works",
    "date": "2025-12-11",
    "time": "9:15 AM",
    "body": "Committee on Public Property and Public Works",
    "location": "Room 400, City Hall",
    "eventId": 6283,
    "eventGuid": "1EA4C2FB-060C-4EF3-9AC1-E19A1510067C",
    "meetingDetailUrl": "https://phila.legistar.com/MeetingDetail.aspx?ID=6283&GUID=1EA4C2FB-060C-4EF3-9AC1-E19A1510067C",
    "icsUrl": "https://phila.legistar.com/View.ashx?M=IC&ID=6283&GUID=1EA4C2FB-060C-4EF3-9AC1-E19A1510067C"
  }
]
```

Zod schema (also emitted to `output_schema.ts` alongside this SKILL.md):

```typescript
import { z } from "zod";

const EventSchema = z.object({
  name: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string(),                          // may be empty for "No Calendar" placeholders
  body: z.string().min(1),                   // same as name in this dataset, kept distinct for downstream filters
  location: z.string(),
  eventId: z.number().int().positive(),
  eventGuid: z.string().regex(/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/),
  meetingDetailUrl: z.string().url(),
  icsUrl: z.string().url().optional(),
});

export const OutputSchema = z.array(EventSchema);
```
