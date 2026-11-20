---
name: grants-illinois-gov-search-csfa-jewu3k
title: Illinois CSFA Funding Opportunity Search
description: >-
  Search the Illinois Catalog of State Financial Assistance (CSFA) for
  currently-posted funding opportunities by keyword, issuing agency, CSFA
  number, or award range — returns grant name, formal CSFA number, agency,
  posting period, award range, funding type, eligibility tags, unwrapped
  application-portal URL (AmpliFund / native CSFA NOFO), and attached NOFO PDF
  links. Read-only.
website: grants.illinois.gov
category: government-grants
tags:
  - illinois
  - grants
  - csfa
  - government
  - amplifund
  - asp-net
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: api
alternative_methods:
  - method: api
    rationale: >-
      OpportunityList.aspx returns the complete list of currently-posted
      opportunities (184 rows on 2026-05-18) in a single un-parameterised GET as
      static HTML. No __VIEWSTATE postbacks, no pagination, no anti-bot. Parse
      the table client-side and apply all filters post-parse.
  - method: browser
    rationale: >-
      Only needed for the AmpliFund-side drill-down on GMS-wrapped opportunities
      (74% of rows) when the caller requires program-detail fields (eligibility,
      description) that aren't surfaced in the OpportunityList row. AmpliFund is
      React-rendered — bare HTTP fetch returns an empty shell.
  - method: url-param
    rationale: >-
      For single-record CSFA-number lookups,
      ProgramList.aspx?Search={formal-csfa-number} is a server-side filter that
      returns the matching program row directly (verified — unlike
      OpportunityList.aspx, which silently ignores all query params).
verified: false
proxies: false
---
# Illinois CSFA Funding Opportunity Search

## Purpose

Return the list of currently-posted funding opportunities from the Illinois Catalog of State Financial Assistance (CSFA) — for each match, the grant title, formal CSFA number, issuing agency (full name + 3-digit ID), posting/due dates, award range, funding type, eligibility tags, the unwrapped application-portal URL (AmpliFund / SmartSheet / direct CSFA NOFO), and any attached NOFO PDF URLs. Supports keyword, agency, CSFA-number, and award-range filters; date-range and funding-type filters are applied after enriching each row with its NOFO detail page. Read-only — never submits an application or interest form.

## When to Use

- "What grants are currently open from the Illinois Department of Human Services?"
- "Find Illinois state grants matching 'early childhood' / 'public safety' / 'transportation'."
- "Look up CSFA `420-35-0083` — when does it close and where do I apply?"
- "List all currently-posted CSFA opportunities with award maxima above $1M."
- Any flow that needs structured CSFA opportunity data without the user clicking through the ASP.NET UI.

## Workflow

CSFA is hosted at `omb.illinois.gov/public/gata/csfa/*.aspx` (the bare `grants.illinois.gov` domain 1s-redirects to the GATA portal). The portal looks like a classic ASP.NET WebForms app — `__VIEWSTATE` / `__VIEWSTATEGENERATOR` hidden fields, `.aspx` endpoints — but **`OpportunityList.aspx` has no form filters and no postback machinery**. A single un-parameterised GET returns *every* currently-posted opportunity (184 rows on 2026-05-18) as one static HTML table. Verified across multiple probe queries: passing `?Search=transportation`, `?Agency=494`, etc. to `OpportunityList.aspx` is silently ignored — the response is byte-identical. **Filter client-side after parsing.** No `__EVENTTARGET` postbacks are required; no browser session is required; no proxies are required (public US government site, no anti-bot wall observed).

Lead with the HTTP/HTML path — it costs one round-trip (~1.5s, ~65 KB) and returns the full list. The browser fallback is only useful if `browse cloud fetch` itself is unavailable in your environment.

1. **Fetch the full opportunity list (one GET):**
   ```
   GET https://omb.illinois.gov/public/gata/csfa/OpportunityList.aspx
   ```
   Equivalently via the CLI: `browse cloud fetch "https://omb.illinois.gov/public/gata/csfa/OpportunityList.aspx"`. The response is `text/html; charset=utf-8`, Microsoft-IIS / ASP.NET 4.0. The total count is rendered as a literal element near the bottom: `<div id="divCount">Opportunities: 184</div>` — capture it so the caller knows the slice is the full universe (no pagination).

2. **Parse the result table.** The DOM contains one `<table id="tblList">` with a 4-column header (`Opportunity Title | Agency | Application Date Range | Award Range`) and one `<tr>` per opportunity. The cell shapes are stable across runs:
   - **col 1** — title cell. Two flavours, distinguished by an `<i class='gms'>GMS</i>` prefix:
     - **GMS-wrapped (74% of rows, 2026-05-18)**: `<i Class='gms'>GMS</i>&nbsp;<a href='GMS.aspx?url=<URL-ENC-AmpliFund>&title=<URL-ENC-title>' target='_blank'>{title}</a>`. **Unwrap**: URL-decode the `url=` query param to get the inner `https://il.amplifund.com/Public/Opportunities/Details/{guid}` URL. That guid is the AmpliFund opportunity ID and is the only stable identifier for these rows (no CSFA `nofo` id exists in the OpportunityList row for GMS-wrapped entries — you must drill into AmpliFund to get the formal CSFA number).
     - **Native CSFA NOFO (26%)**: `<a href='Opportunity.aspx?nofo={N}'>{title}</a>`. Capture the integer `nofo` query param — it's the row PK for `Opportunity.aspx`.
   - **col 2** — agency: `{LETTER_CODE} ({3-DIGIT_ID})`, e.g. `AG (406)`, `AGE (402)`, `DCEO (420)`, `DHS (444)`, `DOT (494)`. The letter code is a non-standard shorthand (`AGE` = "Department On Aging", not "AGEncy") — **always cross-reference the numeric ID, never the letters**, against the agency map in step 3.
   - **col 3** — application date range: `MM/DD/YYYY - MM/DD/YYYY` *or* `MM/DD/YYYY - No end date` (open-ended announcements). Parse as `{posted_date, due_date}` with `due_date = null` when the literal string is `No end date`.
   - **col 4** — award range: `$X - $Y` with **no thousands separators** (e.g. `$83853 - $1151270`). Strip `$`, parse as integers in USD.

3. **Map the agency id to a full name (one-time GET, cached):**
   ```
   GET https://omb.illinois.gov/public/gata/csfa/AgencyList.aspx
   ```
   The page contains 31 anchors of the form `<a href='ProgramList.aspx?Agency={id}'>{Full Name} ({id})</a>`. Build a `{id → full_name}` dict once per session and reuse for every opportunity. The full names match what end users expect ("Department Of Human Services (444)", "Department Of Transportation (494)"); the letter shorthand in column 2 of `OpportunityList` does not.

4. **Apply filters client-side on the parsed list.** The OpportunityList page exposes **no server-side filtering** — every filter the caller supplies is a post-parse operation:
   - **keyword** — case-insensitive substring match against the title. (To also cover the program-level short description / objective text, you must fetch the per-NOFO `Program.aspx` page in step 5; the list view never carries the short description.)
   - **issuing-agency name** — fuzzy-match the supplied agency name against the values from step 3 to derive the numeric id, then keep rows whose col-2 numeric id equals that id. Aliases worth normalising before matching: `ISBE`→586, `DHS`→444, `IDOT`→494, `IEMA`→588, `DCEO`→420, `DCFS`→418, `ICCB`→684, `DNR`→422, `IDPH`→482.
   - **CSFA-number** (`NNN-NN-NNNN`) — first try a substring match on the title (titles often embed the formal CSFA number, e.g. `"FY26 406-46-0552 Partners for Conservation"`). If no hit, drill into each row's NOFO detail (step 5) and match against `div_CSFA_Number`. The first prefix segment of a CSFA number is always the issuing-agency id, so you can short-circuit by filtering to rows whose col-2 id matches that prefix before drilling.
   - **award range** — parse col 4 to `award_min` / `award_max` integers and apply numeric predicates.
   - **due-by date** — parse col 3 right-hand side; treat `No end date` as `+∞`.
   - **posted-after date** — parse col 3 left-hand side.
   - **funding type** (Grant / Loan / Cooperative Agreement) — not surfaced in the list view; must drill into `Opportunity.aspx?nofo=N` and read `div_Assistance_Type`. For GMS-wrapped rows this means fetching the AmpliFund detail page (which uses a different schema and is JS-rendered — see gotcha).
   - **posting status** — `OpportunityList.aspx` only ever returns "Currently posted" opportunities. The CSFA public surface does not expose closed or anticipated opportunities — if the caller asked for those, return `{"results": [], "note": "status=closed|anticipated is not retrievable via the public OpportunityList page"}`.

5. **(Optional) Enrich each match with per-NOFO detail.** Only do this for the filtered subset — drilling all 184 costs 184 extra GETs.
   - **Native CSFA NOFO** (`nofo_id` present): `GET https://omb.illinois.gov/public/gata/csfa/Opportunity.aspx?nofo={N}` returns a `<table id="tblMain">` with named `<div id="div_*">` fields. The stable ones: `div_Awarding_Agency_Name`, `div_Awarding_Agency_Contact`, `div_Type_Announcement`, `div_Assistance_Type` (Grant/Loan/Cooperative Agreement), `div_Agency_Opportunity_Number`, `div_Agency_Opportunity_Title`, `div_CSFA_Number` (formal `NNN-NN-NNNN`), `div_CSFA_Popular_Name`, `div_Anticipated_Awards`, `div_Estimated_Total_Award_Amount`, `div_Single_Award_Range`, `div_Funding_Source`, `div_Cost_Sharing_Match_Required`, `div_Indirect_Cost_Allowed`, `div_Posted_Date`, `div_Application_Range`, `div_Grant_Application_URL` (often a SmartSheet/AmpliFund/external link, sometimes prefixed by literal "Please copy the entire address below and paste it into the browser..." instruction text — strip it), `div_Technical_Assistance_Session`, `div_Attachments`. The attachments cell contains zero-or-more `<a href='FileView.aspx?nofo={N}' target='_blank'>{filename}.pdf</a>` — these are the **NOFO PDF URLs**.
   - **Program-level data** (Short Description, Objective, Eligible Applicants tags, statutory authority) lives one level up, at `Program.aspx?csfa={CSFA_PK}`. The link to it is in the breadcrumb of `Opportunity.aspx`: `<a href="Program.aspx?csfa={N}" id="lnk_Program">Program</a>`. The Program page has: `div_Short_Desc`, `div_Objective`, `div_Eligible_Applicants` (semicolon-separated tags like `"Nonprofit Organizations; Education Organizations;"`), `div_Applicant_Eligibility` (long narrative), `div_Fed_Authorization`, `div_IL_Statute_Authorization`, `div_Agency_Contact`. **Important — the `csfa=` query value on `Program.aspx` is a row PK, not the formal `NNN-NN-NNNN` number.** To go from a formal CSFA number to a program page, prefer `GET ProgramList.aspx?Search={formal-csfa-number}` and read the `Program.aspx?csfa={pk}` href out of the result row.
   - **GMS-wrapped row** (no `nofo_id`): fetch the unwrapped AmpliFund URL from step 2 — `https://il.amplifund.com/Public/Opportunities/Details/{guid}`. AmpliFund is JS-rendered, so the bare HTTP fetch returns a thin shell with no opportunity data — **this is the one case that needs a browser session** (open with `browse open --remote` against a Browserbase session). The AmpliFund page exposes a "Eligibility" sidebar, a downloadable NOFO PDF, and the formal CSFA number under "Internal ID". If you only need the dates/award/agency that are already in the OpportunityList row, skip the AmpliFund drill entirely.

6. **Single-record lookup by formal CSFA number** (`NNN-NN-NNNN` input shape): the fastest path skips `OpportunityList.aspx` and goes:
   ```
   GET https://omb.illinois.gov/public/gata/csfa/ProgramList.aspx?Search={formal-csfa-number}
   ```
   This *is* a server-side filter (verified — `?Search=Specialty+Crop` returns 1 row, `?Search=transportation` returns N rows). The response is a single-row table with `<a href='Program.aspx?csfa={pk}'>{name}</a>` — follow it. To find currently-open opportunities for that program, the Program page's breadcrumb back to `OpportunityList` and the Active Opportunities column on `ProgramList` indicate count; the per-program opportunity drill-down requires either parsing GATA's GMS portal or matching back into `OpportunityList.aspx` by agency id + program title substring.

### Browser fallback

Only useful if `browse cloud fetch` is blocked or rate-limited (not observed on this site as of 2026-05-18). The page is iframe-embeddable (the body emits `parent.postMessage(document.body.scrollHeight, "*")` on load) and renders entirely server-side, so it works fine in a bare Browserbase session — no `--proxies`, no `--verified`:

```bash
sid=$(browse cloud sessions create --keep-alive | jq -r .id)
export BROWSE_SESSION="$sid"
browse open "https://omb.illinois.gov/public/gata/csfa/OpportunityList.aspx" --remote
browse wait load --remote
browse get html body --remote > /tmp/opplist.html
# … then parse the same `<table id="tblList">` as in step 2.
browse cloud sessions update "$sid" --status REQUEST_RELEASE
```

The `browse snapshot` accessibility tree is overkill — the table is fully present in the rendered HTML, and grabbing the raw body via `browse get html body` skips a11y-tree assembly cost.

## Site-Specific Gotchas

- **No anti-bot, no proxies needed.** `omb.illinois.gov` is a public US-government IIS site that serves the full HTML directly to anonymous requests with no JS challenge, no CAPTCHA, no rate-limit observed across the probe runs (4 fetches of the 65 KB OpportunityList in under 60 s, all 200 OK, no `--proxies`, no `--verified`). Don't waste budget on Verified sessions for this site.
- **`OpportunityList.aspx` is *not* a real WebForms search page** — despite the `__VIEWSTATE` / `__VIEWSTATEGENERATOR` hidden inputs and the `<form method="post" action="./OpportunityList.aspx">` wrapper, the page exposes **zero `<select>` / `<input type='text'>` filter controls**. The form is vestigial; the entire table is rendered server-side from the underlying `dbo.NOFO` query unfiltered. Posting back `__EVENTTARGET` does nothing. Pretending it's a postback-driven form is the #1 trap a future agent will fall into (the user-supplied task description suggests this; reality contradicts it).
- **Query parameters on `OpportunityList.aspx` are silently ignored.** `?Agency=NNN`, `?Search=keyword`, `?CSFA=...`, `?Status=...` all return the byte-identical 184-row response. Don't infer filter support from CSFA's other pages — `ProgramList.aspx` *does* honor `?Agency=` and `?Search=`, but `OpportunityList.aspx` does not.
- **The list is "currently posted" only.** Closed and "Anticipated" opportunities don't appear on `OpportunityList.aspx` at all. There's no public surface for them on CSFA. If a caller asks for Closed/Anticipated, fail honestly with an explanatory note (see step 4 above).
- **The agency column letter code is non-standard.** `AGE` = "Department On Aging" (not Agency), `SBEL` = "State Board Of Elections", `ICCB` = "Illinois Community College Board", etc. Map by the **numeric id** in parens — that's the stable foreign key into `AgencyList.aspx`. Some agencies (e.g. `DCEO`) match popular acronyms; never assume the letter code does.
- **GMS-wrapped rows (74% of the table) hide the formal CSFA number.** The OpportunityList row for a GMS opportunity has no `nofo` id and no formal CSFA number on the row — the agency id is the only structured field. To recover the CSFA number you either (a) regex it out of the title string (many AmpliFund titles embed it, e.g. `"FY26 406-46-0552 Partners for Conservation"`), or (b) drive AmpliFund (JS-rendered) to read "Internal ID" off the opportunity page. Path (a) is ~80% reliable based on the titles seen; path (b) is reliable but costs a browser session.
- **`GMS.aspx` is a *redirect wrapper*, not a data page.** Hitting `GMS.aspx?url=...` returns a meta-refresh / JS redirect to AmpliFund. URL-decode the `url=` query param **client-side** to get the inner AmpliFund URL — don't fetch `GMS.aspx` itself.
- **AmpliFund is JS-rendered.** `https://il.amplifund.com/Public/Opportunities/Details/{guid}` returns a thin React shell to bare HTTP — body content (eligibility, description, attachments) is loaded async. If you need AmpliFund-side data, open with a real browser session (`browse open --remote`) and wait for `load`; bare `browse cloud fetch` is not sufficient. Conversely, **everything in the OpportunityList row (title, agency, dates, award range) is authoritative server-side** — for the 80% case you can stay entirely on `omb.illinois.gov`.
- **Award range numbers have no thousands separators.** `$83853` not `$83,853`. Naïve `$` + comma stripping won't bite, but a regex anchored on `\$[\d,]+` will produce confusing matches. Use `\$(\d+)` instead.
- **Open-ended announcements: `"MM/DD/YYYY - No end date"`.** Treat the right side as `null` / open. ~5–10% of rows in the 2026-05-18 sample had no end date.
- **`Program.aspx?csfa={pk}` uses a row PK, not the formal CSFA number.** The `csfa=20` you see in `<a href='Program.aspx?csfa=20'>10.555 National School Lunch Program</a>` is **not** `402-03-0020` — it's the database integer PK. Going from formal `NNN-NN-NNNN` → Program page requires the `ProgramList.aspx?Search={formal-num}` intermediate.
- **`Opportunity.aspx` contact emails are wrapped in literal display text.** Example: `<div id="div_Awarding_Agency_Contact">Ericka A. White (Ericka.White@illinois.gov)</div>`. Parse out the email with `<>` or `()` delimiters depending on the row.
- **`Grant_Application_URL` is sometimes a SmartSheet form, not an AmpliFund URL.** Example seen: `https://app.smartsheet.com/b/form/2e2ff9e69bc64acdb64eb5894c672f01`. Treat it as a generic external URL — do not assume AmpliFund.
- **`FileView.aspx?nofo={N}` returns the NOFO PDF directly.** Content-type `application/pdf`, attachment disposition. Filename is in the `div_Attachments` anchor text. If `div_Attachments` is empty, the NOFO PDF is on the AmpliFund side (for GMS-wrapped rows) — see the "GMS-wrapped" gotcha.
- **`grants.illinois.gov` is a 1s meta-refresh redirect to `gata.illinois.gov`.** The CSFA app itself lives at `omb.illinois.gov/public/gata/csfa/`. Always navigate to the `omb.illinois.gov` URL directly; the redirect chain wastes a round-trip and `gata.illinois.gov/grantee-portal/csfa.html` 404s.
- **READ-ONLY.** Some `Grant_Application_URL` links go to one-click SmartSheet interest forms. Never auto-fill or submit those — stop at the detail page.

## Expected Output

```json
{
  "total_currently_posted": 184,
  "total_matched": 3,
  "filters_applied": {
    "keyword": "specialty crop",
    "agency_name": null,
    "agency_id": null,
    "csfa_number": null,
    "award_min_floor": null,
    "award_max_ceiling": null,
    "posted_after": null,
    "due_before": null,
    "funding_type": null
  },
  "results": [
    {
      "grant_name": "FY27 Specialty Crop Block Grant Program",
      "csfa_number": "406-32-0039",
      "issuing_agency": {
        "id": 406,
        "letter_code": "AG",
        "full_name": "Department Of Agriculture"
      },
      "opportunity_status": "currently_posted",
      "posting_period": {
        "posted_date": "2026-05-07",
        "due_date": "2026-06-05"
      },
      "funding_range_usd": {
        "award_min": 0,
        "award_max": 75000
      },
      "funding_type": "Grant",
      "short_description": null,
      "eligibility_tags": null,
      "detail_page_url": "https://il.amplifund.com/Public/Opportunities/Details/7a9e3a6d-9f4d-4e86-899a-e62c203caf2d",
      "source_row_type": "gms_amplifund",
      "csfa_opportunity_url": null,
      "nofo_pdf_urls": []
    },
    {
      "grant_name": "Community Development Block Grant Disaster Response Program",
      "csfa_number": "420-22-2010",
      "issuing_agency": {
        "id": 420,
        "letter_code": "DCEO",
        "full_name": "Department Of Commerce And Economic Opportunity"
      },
      "opportunity_status": "currently_posted",
      "posting_period": {
        "posted_date": "2022-04-05",
        "due_date": null
      },
      "funding_range_usd": {
        "award_min": 0,
        "award_max": 250000
      },
      "funding_type": "Grant",
      "short_description": "Disaster response block grants distributed to units of local government in declared-disaster areas.",
      "eligibility_tags": ["Government Organizations"],
      "detail_page_url": "https://omb.illinois.gov/public/gata/csfa/Opportunity.aspx?nofo=2010",
      "source_row_type": "csfa_native",
      "csfa_opportunity_url": "https://omb.illinois.gov/public/gata/csfa/Opportunity.aspx?nofo=2010",
      "nofo_pdf_urls": [
        "https://omb.illinois.gov/public/gata/csfa/FileView.aspx?nofo=2010"
      ]
    }
  ],
  "notes": [
    "OpportunityList.aspx returns only currently-posted opportunities; Closed and Anticipated statuses are not retrievable from the public surface.",
    "GMS-wrapped rows (74% of the table on 2026-05-18) do not carry a formal CSFA number in the list view — recover it from the title regex or by drilling into AmpliFund."
  ]
}
```

Fields that are `null` indicate "not surfaced in the list view; would require per-NOFO drill-down to populate". The skill can run in two modes — **list-only** (one GET, ~1.5 s, ~65 KB; nulls for description / funding_type / eligibility_tags / nofo_pdf_urls on GMS rows) and **enriched** (one GET per matched native NOFO; AmpliFund drill for GMS rows if requested). Return `source_row_type: "gms_amplifund" | "csfa_native"` so the caller knows which fields are authoritative.

### Single-record CSFA-number lookup output

```json
{
  "lookup_csfa_number": "420-35-0083",
  "program": {
    "csfa_number": "420-35-0083",
    "csfa_popular_name": "SBDC",
    "program_name": "Small Business Development Centers",
    "agency": { "id": 420, "full_name": "Department Of Commerce And Economic Opportunity" },
    "short_description": "Seeking qualified host organizations to operate Small Business Development Centers and Satellite Centers and provide program services.",
    "eligibility_tags": ["Nonprofit Organizations", "Education Organizations"],
    "federal_authorization": "Section 21 of the Small Business Act (15 U.S.C. § 648)",
    "il_statute_authorization": "20 ILCS 605/605-500",
    "program_page_url": "https://omb.illinois.gov/public/gata/csfa/Program.aspx?csfa=83"
  },
  "active_opportunities": [
    {
      "grant_name": "Small Business Development Centers — FY26-2",
      "agency_opportunity_number": "FY26-2",
      "funding_type": "Grant",
      "posting_period": { "posted_date": "2025-12-19", "due_date": null },
      "funding_range_usd": { "award_min": 80000, "award_max": 525000 },
      "detail_page_url": "https://omb.illinois.gov/public/gata/csfa/Opportunity.aspx?nofo=4224",
      "nofo_pdf_urls": ["https://omb.illinois.gov/public/gata/csfa/FileView.aspx?nofo=4224"]
    }
  ]
}
```

### Empty / no-match output

```json
{
  "total_currently_posted": 184,
  "total_matched": 0,
  "filters_applied": { "keyword": "quantum computing", "...": "..." },
  "results": [],
  "notes": ["No currently-posted CSFA opportunity matched the supplied filters. OpportunityList.aspx returns only currently-posted; ask about ProgramList.aspx for the broader program catalog."]
}
```
