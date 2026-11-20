---
name: faa-gov-lookup-aircraft-8xuamw
title: FAA Aircraft Registry Lookup
description: >-
  Look up a US-registered aircraft in the FAA Aircraft Registry by N-number,
  manufacturer serial, registrant name, or make/model. Returns full registration
  record (owner, aircraft, airworthiness, Mode-S, status) via direct HTTP GET —
  no browser, no anti-CSRF dance.
website: faa.gov
category: aviation
tags:
  - aviation
  - aircraft
  - faa
  - registry
  - tail-number
  - read-only
  - government
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: url-param
alternative_methods:
  - method: browser
    rationale: >-
      Use only as fallback if Akamai Bot Manager (latent on every page, dormant
      during testing) upgrades to active blocking. Browser session with
      --proxies --verified submits the form interactively at ~30x the cost of
      the direct GET.
  - method: cli
    rationale: >-
      For batch lookups (>50/day), the FAA's daily Releasable Aircraft Database
      flat-file dump at https://registry.faa.gov/database/ReleasableAircraft.zip
      is the right answer — contains MASTER, DEREG, RESERVED, ACFTREF, ENGINE,
      DEALER tables. The web inquiry does NOT expose deregistration or
      prior-registrant history; the bulk dump does.
verified: true
proxies: true
---
# FAA Aircraft Registry Lookup

## Purpose

Given an aircraft N-number (tail number), manufacturer serial number, registrant name, or make/model, return the FAA Aircraft Registry record(s) for that aircraft — including N-number, serial, manufacturer/model/year, aircraft + engine type, Mode-S code (hex + octal), registered owner name + address, registrant type, certificate/expiration/last-action dates, current registration status, airworthiness class/category/date, and the canonical detail-page URL. Read-only; never submits any change-of-address, sale, or re-registration form.

## When to Use

- Convert a tail number spotted on a flight tracker, ramp photo, or ADS-B Mode-S hex into the registered owner + aircraft type.
- Reverse-lookup a hex Mode-S code → N-number (search by Mode-S range, or scan the bulk database).
- Audit who owns an aircraft serial across all N-numbers it has ever worn (older airframes get re-registered with new tail numbers over their lifetime).
- Find every aircraft owned by a person or LLC (e.g. "what does FALCON LANDING LLC own?").
- Verify a registration is `Valid` vs `Expired`/`Sale Reported`/`Revoked` before a transaction.
- Pre-flight insurance underwriting, title research, ramp identification.

## Workflow

The FAA Aircraft Inquiry at `registry.faa.gov/AircraftInquiry/` is built on **ASP.NET MVC** (the prompt's mention of `__VIEWSTATE`/`__EVENTVALIDATION` refers to the legacy `.aspx` version that has been retired). The current site uses anti-forgery tokens (`__RequestVerificationToken`) for POST submissions, **but every `Search/*Result` endpoint also accepts the same field as a plain GET query string** — so the optimal path is a one-shot HTTP GET with no browser, no cookies, no token. A residential-proxy fetch (`browse cloud fetch --proxies`) handles all observed Akamai-Bot-Manager challenges without a real session.

### 1. Lookup by N-number (single record, richest output)

```
GET https://registry.faa.gov/AircraftInquiry/Search/NNumberResult?NNumbertxt={N}
```

- `{N}` may be supplied with or without a leading `N` — both `N12345` and `12345` work.
- Field name is case-sensitive: `NNumbertxt` (lowercase trailing `txt`). The internal links elsewhere on the FAA site use the variant `NNumberTxt` (capital `T`); both currently resolve to the same handler, but stick with `NNumbertxt` to match what the live form posts.
- An invalid N-number (too long, illegal character, etc.) responds **302 redirect** to `/AircraftInquiry/Search/NNumberInquiry?error=<reason>&nnumber=<echo>` — check the `Location` header to distinguish "bad input" from "no record".

Parse the HTML response. The canonical detail page is the request URL itself (`/AircraftInquiry/Search/NNumberResult?NNumbertxt=N12345`).

### 2. Lookup by serial number, registrant name, or make/model (list output)

```
GET https://registry.faa.gov/AircraftInquiry/Search/SerialNumberResult?Serialtxt={s}&sort_option={1|2|3|4}
GET https://registry.faa.gov/AircraftInquiry/Search/NameResult?nametxt={n}&sort_option={1|2|3|4}
GET https://registry.faa.gov/AircraftInquiry/Search/MakeModelResult?Maketxt={mfr}&Modeltxt={model}&sort_option={1|2|3|4}
```

`sort_option` values are identical across inquiries: `1=N-Number, 2=Manufacturer Name, 3=Model Name, 4=Name (registrant)`.

These return paginated HTML tables. Each row is a partial summary (N-Number, serial, manufacturer + model, registrant name + address) with a link to the per-aircraft detail page (`/AircraftInquiry/Search/NNumberResult?NNumberTxt=<n>`). To get full detail per result, follow each link.

**Tip — skip HTML parsing on multi-result inquiries by using the built-in CSV export:** the result page exposes two RPC endpoints that produce machine-readable downloads. Two-step:

```
# 1. Trigger generation — returns JSON { data: "<filename>.csv", server: "<prefix>" }
GET https://registry.faa.gov/AircraftInquiry/BusinessLogic/CreateSerialNumberCSVFile?FileName=SerialNumber&serial=6177
# 2. Download the CSV from a date-stamped directory
GET https://registry.faa.gov/AircraftInquiry/SpreadSheets/{MM-DD-YYYY}/SerialNumber{MM-DD-YYYY}.csv
```

Equivalent endpoints exist for `CreateNameCSVFile`, `CreateMakeModelCSVFile`, `CreateNNumberCSVFile`, and a `…ExcelFile` variant of each. The CSV has fixed-width-padded columns (right-padded with spaces) — strip trailing whitespace per cell.

### 3. Parse the N-Number result HTML

The detail page is a series of `<table class="devkit-table">` blocks, each preceded by a `<caption class="devkit-table-title">` naming the section. The reliable cell-extraction pattern is "label-cell followed by value-cell"; rows alternate left-pair / right-pair so a single row carries two field/value pairs.

Sections that appear, in order:
- `Aircraft Description` — `Serial Number`, `Status`, `Manufacturer Name`, `Certificate Issue Date`, `Model`, `Expiration Date`, `Type Aircraft`, `Type Engine`, `Pending Number Change`, `Dealer`, `Date Change Authorized`, `Mode S Code (base 8 / Oct)`, `MFR Year`, `Mode S Code (Base 16 / Hex)`, `Type Registration`, `Fractional Owner`.
- `Registered Owner` — `Name`, `Street`, `City`, `State`, `County`, `Zip Code`, `Country`.
- An airworthiness block (no caption — title is the all-caps disclaimer about not using this data for airworthiness determinations) — `Type Certificate Data Sheet`, `Type Certificate Holder`, `Engine Manufacturer`, `Classification`, `Engine Model`, `Category`, `A/W Date`, `Exception Code`.
- `Other Owner Names` — table of co-owners (or "None").
- `Temporary Certificates` — `Certificate Number`, `Issue Date`, `Expiration Date` (or "None").
- `Fuel Modifications` — usually "None".

Map `Type Registration` to the registrant-type taxonomy: `Individual / Partnership / Corporation / Co-Owned / Government / LLC / Non-Citizen Corp / Non-Citizen Co-Owned`. Map `Status` to one of `Valid / Pending / Expired / Sale Reported / Revoked / De-Registered / Reserved` etc. Map `Type Aircraft` to `Fixed Wing Single-Engine / Fixed Wing Multi-Engine / Rotorcraft / Glider / Balloon / Airship / Weight-Shift / Powered-Parachute / Hybrid Lift`.

### 4. Branch on the leading sentence

The result page opens with one of these one-liners — use it as a fast branch hint before walking tables:

| Lead text | Meaning | Schema |
|---|---|---|
| `{N} is Assigned` | Currently registered, single record | Full `assigned` output |
| `{N} has Assigned/Multiple Records` | Currently registered AND has historical/deregistered records | Full `assigned` output, set `has_prior_records: true` |
| `{N} is Deregistered` / `{N} is De-registered` | Last registration was cancelled | `deregistered` output (current `Status` reflects the cancel reason) |
| (Reserved N-Number table only) | Number is reserved but no aircraft assigned yet | `reserved` output: `Type Reservation`, `Mode S Code`, `Reserved Date`, `Renewal Date`, `Purge Date`, `Pending Number Change`, `Date Change Authorized`, `Reserving Party Name` |
| 302 → `/NNumberInquiry?error=…` | Invalid input format | `error` output, surface the URL-encoded reason |

### 5. Releasing data the web inquiry does NOT expose

The web inquiry returns **only the current record**. Despite the prompt's request for deregistration record (cancel date + reason) and the full chain of prior registrants, the FAA `AircraftInquiry` site does **not** surface either on `NNumberResult` — the `has Assigned/Multiple Records` lead text is informational only and is **not a link**. There is no "History" tab on the current site. Two honest fallbacks:

1. **`https://registry.faa.gov/database/ReleasableAircraft.zip`** — the FAA's full Releasable Aircraft Database, rebuilt every federal working day. Contains `MASTER.txt`, `ACFTREF.txt`, `ENGINE.txt`, `DEREG.txt` (deregistered records), `RESERVED.txt`, and `DEALER.txt`. Use this for any batch query or any query that needs deregistration history. A single download is ~70 MB and covers the entire US civil register.
2. **`https://aircraft.faa.gov/e.gov/nd/` — Request For Aircraft Records** — official FOIA-style channel to order a copy of the historical paper record for a specific N-number (paid, mail-back). Not scriptable.

If the user wants prior-registrant chain on a specific N-number with no flat-file pipeline available, surface a `has_prior_records: true` flag with the `ReleasableAircraft.zip` reference and stop — don't fabricate history from the current record.

### 6. (Browser fallback) only when the GET endpoint is blocked

Should Akamai upgrade from latent to active blocking (it is currently dormant — see Gotchas), drop down to a browser session with stealth + residential proxy and submit the form interactively:

```bash
sid=$(browse cloud sessions create --keep-alive --proxies --verified \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$sid"
browse open "https://registry.faa.gov/AircraftInquiry/Search/NNumberInquiry" --remote
browse fill --remote @<NNumbertxt-ref> "N628TS"
browse click --remote @<submit-ref>
browse get markdown body --remote
browse cloud sessions update "$sid" --status REQUEST_RELEASE
```

Browser fallback pays ~30s wall + a session cost per lookup vs. the ~1s direct GET — only worth it if direct fetches return 200 OK with an Akamai challenge body or 403 for several consecutive attempts.

## Site-Specific Gotchas

- **Anti-CSRF tokens are POST-only.** `__RequestVerificationToken` (cookie + hidden field) is required for the form's POST submission, but every `Search/*Result` endpoint also accepts the field as a `GET` query parameter with no token. Verified 2026-05-19 on `NNumberResult`, `SerialNumberResult`, `NameResult`. Always prefer GET — it eliminates the cookie/CSRF dance entirely.
- **Akamai Bot Manager IS present but dormant.** Every result page includes the Akamai sensor (`<script>bazadebezolkohpepadr=…` + `/akam/13/{path}` script tag). During this skill's iteration we observed zero active challenges from a residential-proxy `browse cloud fetch` — all requests returned 200 OK with full data. Treat 403/timeout as evidence the protection has been activated, **not** as a sign your URL is wrong, and switch to a stealth browser session.
- **Field name case-mismatch.** The form's actual input is `NNumbertxt` (lowercase `txt`). Internal anchors on result tables link with `NNumberTxt` (capital `T`). ASP.NET MVC's model-binder is case-insensitive on parameter names, so both work — but if you compose URLs by hand, use the lowercase form to match the canonical form-submission.
- **Leading `N` is optional.** `NNumbertxt=N12345` and `NNumbertxt=12345` both resolve to the same record. The result page always echoes the input back as "N-Number Entered: 12345" (without the `N`) regardless.
- **`has Assigned/Multiple Records` is informational text, not a link.** It signals that the FAA's database has historical/deregistered records under this N-number — but they are **not navigable** from the web inquiry. The text is plain `<p>`, not an `<a>`. See Workflow §5 for how to actually retrieve those records.
- **Invalid input returns 302, not 4xx.** Anything that fails the format validator (`>5` characters, illegal alpha pattern, etc.) responds `302 Location: /AircraftInquiry/Search/NNumberInquiry?error=...&nnumber=...`. Don't treat the redirect as an HTTP failure — the human-readable reason is in the `error` query param of the `Location` header.
- **CSV download is a two-hop indirection.** `BusinessLogic/Create*CSVFile` returns JSON `{ data: "<filename>", server: "<prefix>" }` that points to a date-stamped path under `/AircraftInquiry/SpreadSheets/{MM-DD-YYYY}/`. The CSV is staged at request time; don't expect a stable URL across days.
- **CSV cells are space-right-padded to fixed widths.** Strip trailing whitespace on every value. Address cells embed a literal newline-equivalent — the CSV writer concatenates "City, State Zip" with a double-space separator inside the quoted cell.
- **Multiple aircraft can share a serial number.** Serial numbers are unique within a (manufacturer, model) pair but not globally — e.g. serial `6177` matches 7 aircraft across BOMBARDIER, PIPER, CAMERON BALLOONS, DOUGLAS, GULFSTREAM, TAYLORCRAFT, CESSNA. Always pair `Serialtxt` with the manufacturer when the user supplies one.
- **`MFR Year`, `A/W Date`, `Engine Manufacturer`, etc. are commonly `None`/`Unknown`.** Drone-class registrations (DJI, Skydio, Autel) routinely lack airworthiness data because they're operated under 14 CFR Part 107 and don't carry standard airworthiness certificates. Don't treat absence as an error.
- **Mode-S code is published in both octal (`base 8 / Oct`) and hex (`Base 16 / Hex`).** These are the same 24-bit ICAO address rendered in two bases. Hex (`A061D9`) is what ADS-B trackers use; octal (`50060731`) is the legacy FAA format. Both are emitted on every record.
- **Reserved N-numbers have a completely different table schema.** Don't try to apply the assigned-aircraft parser to a reserved-number page — `Reserving Party Name`, `Type Reservation`, `Reserved Date`, `Renewal Date`, `Purge Date` replace the aircraft/owner fields.
- **`Type Registration` enum is the source of truth for registrant type.** Observed values: `Individual`, `Partnership`, `Corporation`, `Co-Owned`, `Government`, `LLC`, `Non Citizen Corporation`, `Non Citizen Co-Owned`. Other dimensions (`Dealer`, `Fractional Owner`) are separate Yes/No fields, not subtypes.
- **Data is updated each federal working day at midnight (Central).** A registration submitted today won't appear in the web inquiry or the bulk download until the next morning. Don't retry under one second hoping for new data.
- **`registry.faa.gov` redirects to a static landing first.** A bare `GET https://registry.faa.gov/` returns a 10-second-meta-refresh splash page, not the inquiry app. Skip it — go directly to `/AircraftInquiry/Search/NNumberInquiry` (form) or `/AircraftInquiry/Search/NNumberResult?...` (result).
- **No batch API.** There is no documented or undocumented batch-lookup endpoint on `registry.faa.gov`. For more than a few dozen lookups per day, download `ReleasableAircraft.zip` and query it locally — that is what every commercial aircraft-data product does.

## Expected Output

Four primary outcome shapes for an N-number lookup. List-lookups (serial/name/make-model) emit `{ "matches": [<assigned-shape-summary>, …] }`.

```json
// Active assignment (single record) — N628TS
{
  "success": true,
  "outcome": "assigned",
  "has_prior_records": false,
  "n_number": "N628TS",
  "detail_url": "https://registry.faa.gov/AircraftInquiry/Search/NNumberResult?NNumbertxt=N628TS",
  "aircraft": {
    "serial_number": "6177",
    "manufacturer": "GULFSTREAM AEROSPACE CORP",
    "model": "GVI (G650ER)",
    "year_manufactured": 2015,
    "type_aircraft": "Fixed Wing Multi-Engine",
    "type_engine": "Turbo-fan",
    "engine_manufacturer": "ROLLS DEUT",
    "engine_model": "BR700-725A112",
    "mode_s_hex": "A835AF",
    "mode_s_octal": "52032657"
  },
  "registration": {
    "status": "Valid",
    "type_registration": "LLC",
    "certificate_issue_date": "2016-03-31",
    "expiration_date": "2029-03-31",
    "dealer": false,
    "fractional_owner": false,
    "pending_number_change": null,
    "date_change_authorized": null
  },
  "registered_owner": {
    "name": "FALCON LANDING LLC",
    "street": "1 ROCKET RD",
    "city": "HAWTHORNE",
    "state": "CALIFORNIA",
    "county": "LOS ANGELES",
    "zip": "90250-6844",
    "country": "UNITED STATES"
  },
  "airworthiness": {
    "type_certificate_data_sheet": "T00015AT",
    "type_certificate_holder": "GULFSTREAM AEROSPACE CORP",
    "classification": "Standard",
    "category": "Transport",
    "airworthiness_date": "2015-03-31",
    "exception_code": true
  },
  "other_owner_names": [],
  "temporary_certificates": [
    { "certificate_number": "T252216", "issue_date": "2025-02-26", "expiration_date": "2025-03-28" }
  ],
  "fuel_modifications": [],
  "kit_manufacturer": null,
  "kit_model": null
}
```

```json
// Active assignment with historical records (web inquiry exposes ONLY the current record) — N12345
{
  "success": true,
  "outcome": "assigned",
  "has_prior_records": true,
  "n_number": "N12345",
  "detail_url": "https://registry.faa.gov/AircraftInquiry/Search/NNumberResult?NNumbertxt=N12345",
  "aircraft": {
    "serial_number": "08QCE5J012001T",
    "manufacturer": "DJI",
    "model": "MAVIC PRO",
    "year_manufactured": null,
    "type_aircraft": "Rotorcraft",
    "type_engine": "Electric",
    "engine_manufacturer": null,
    "engine_model": null,
    "mode_s_hex": "A061D9",
    "mode_s_octal": "50060731"
  },
  "registration": {
    "status": "Valid",
    "type_registration": "Individual",
    "certificate_issue_date": "2017-08-22",
    "expiration_date": "2027-08-31",
    "dealer": false,
    "fractional_owner": false
  },
  "registered_owner": {
    "name": "GUTTERMAN ADAM D",
    "street": "100 HOGAN POINT RD",
    "city": "HILTON",
    "state": "NEW YORK",
    "county": "MONROE",
    "zip": "14468-8917",
    "country": "UNITED STATES"
  },
  "prior_registrants_note": "FAA web inquiry does NOT expose the prior-registrant chain for this N-number. Retrieve the full history from https://registry.faa.gov/database/ReleasableAircraft.zip (DEREG.txt + MASTER.txt) or order paper records via https://aircraft.faa.gov/e.gov/nd/."
}
```

```json
// Reserved (number is held but no aircraft assigned yet)
{
  "success": true,
  "outcome": "reserved",
  "n_number": "N1Q",
  "detail_url": "https://registry.faa.gov/AircraftInquiry/Search/NNumberResult?NNumbertxt=N1Q",
  "reservation": {
    "type_reservation": "Fee Paid",
    "mode_s_octal": "50000540",
    "reserved_date": "2026-02-28",
    "renewal_date": null,
    "purge_date": "2027-03-28",
    "pending_number_change": null,
    "date_change_authorized": null,
    "reserving_party_name": "AIR SANSONE LLC"
  }
}
```

```json
// Invalid input — server 302-redirects with the validator reason
{
  "success": false,
  "outcome": "invalid_input",
  "n_number_input": "ZZZZZZ",
  "reason": "N-Number is More than 5 characters",
  "redirect_url": "https://registry.faa.gov/AircraftInquiry/Search/NNumberInquiry?error=N-Number%20is%20More%20than%205%20characters&nnumber=zzzzzz"
}
```

```json
// List output for serial / name / make-model — array of N-number summaries
{
  "success": true,
  "outcome": "list",
  "query": { "serial": "6177", "sort_option": 1 },
  "total_matches": 7,
  "matches": [
    { "n_number": "250QS",  "serial": "6177", "manufacturer": "BOMBARDIER INC",        "model": "CL-600-2B16", "registrant": null,                "detail_url": "https://registry.faa.gov/AircraftInquiry/Search/NNumberResult?NNumbertxt=250QS" },
    { "n_number": "628TS",  "serial": "6177", "manufacturer": "GULFSTREAM AEROSPACE CORP", "model": "GVI (G650ER)", "registrant": "FALCON LANDING LLC", "detail_url": "https://registry.faa.gov/AircraftInquiry/Search/NNumberResult?NNumbertxt=628TS" },
    { "n_number": "35157",  "serial": "6177", "manufacturer": "PIPER",                "model": "J3C-65",      "registrant": "JONES DEWEY",        "detail_url": "https://registry.faa.gov/AircraftInquiry/Search/NNumberResult?NNumbertxt=35157" }
  ]
}
```
