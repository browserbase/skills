---
name: sobasearch-com-search-1z4u4v
title: Search Meetings & Recovery Providers by ZIP
description: >-
  Return recovery meetings (AA/NA/SMART/CMA/Al-Anon/etc.) and treatment/provider
  facilities indexed by SobaSearch near a given ZIP, city, or free-text location
  — names, schedules, addresses, phones, services, distance, and detail URLs.
website: sobasearch.com
category: health-recovery
tags:
  - recovery
  - aa
  - na
  - meetings
  - treatment
  - zip-search
  - samhsa
source: 'browserbase: agent-runtime 2026-05-20'
updated: '2026-05-20'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      Only if /api/v1/search returns non-2xx (not observed during testing —
      Cloudflare-cached, public, unauthenticated). The browser path drives
      /search?location={zip}, waits for the SPA to hydrate, and parses the
      rendered markdown. ~50× slower in turns than the direct API hit.
  - method: fetch
    rationale: >-
      Plain HTTPS fetch with no Authorization header reaches the same
      /api/v1/search endpoint successfully — listed as a degenerate case of the
      API method (no SDK / library required).
verified: true
proxies: true
---
# Search Meetings & Recovery Providers by ZIP Code

## Purpose

Return the recovery meetings and treatment / provider facilities indexed by SobaSearch within a given ZIP code (or city / free-text location), with each result's name, program type, address, distance, phone, schedule (for meetings), services (for providers), lat/lon, and canonical detail-page URL. Read-only; does not log in, save schedules, or contact providers.

## When to Use

- "Find AA / NA / SMART / CMA / Al-Anon meetings near ZIP 10001" — recovery-meeting locator queries.
- "What treatment centers / sober-living / detox / outpatient programs are near ZIP 80218?" — provider lookups.
- Building a localized recovery-resource list for a clinician, family member, or someone newly seeking help.
- Bulk extraction across many ZIPs (e.g. building a county-level recovery directory).
- Anywhere you'd otherwise scrape the SobaSearch results HTML — the public JSON API is faster, structurally clean, and explicitly served with `Cache-Control: public`.

## Workflow

The SobaSearch web app at `/search` is a thin Astro/SPA client over a **public, unauthenticated JSON API** at `https://sobasearch.com/api/v1/search`. No cookies, no auth header, no stealth browser, no proxy required — `browse cloud fetch` (or any HTTP client) hits it directly and returns full JSON. The `/search` HTML page is a shell that itself calls this same endpoint twice (once with `kind=meeting`, once with `kind=provider`) — so leading with the API is structurally identical to what the site does for its own UI. The browser path works too but pays a ~50× turn cost because results are fully client-rendered.

1. **Pick a location**. ZIP code is the canonical input (e.g. `10001`), but the `location` param also accepts city names (`Denver`), city+state (`Denver, CO`), or free text. Geocoding is server-side. **Bogus ZIPs like `00000` return `{"data":[],"next_cursor":null}` with HTTP 200 — not an error.** Omitting `location` entirely returns a nationwide sample (not an error either — silently falls back).

2. **Query meetings**:
   ```
   GET https://sobasearch.com/api/v1/search
       ?location={zip-or-city}
       &kind=meeting
       &limit=25
       &radius_miles=25
   ```
   Returns `{"data": [meeting, ...], "next_cursor": "<base64>" | null}`. `kind` defaults to `meeting` if omitted. `radius_miles` defaults to 25; bump to 50 / 100 for rural ZIPs where 25mi yields zero or few results. Each meeting carries: `id` (`mtg_<hex>`), `name`, `slug`, `program_type` (AA / NA / Al-Anon / CMA / RD / SMART / CR / OA / CoDA / ...), `days` (array of int — **0 = Sunday, 6 = Saturday**), `starts_at` / `ends_at` (HH:MM:SS local), `timezone` (IANA), `attendance_mode` (`online` | `in_person` | `hybrid`), `type_codes` (array of short codes — `O`=Open, `C`=Closed, `B`=Big Book, `D`=Discussion, `ONL`=Online, `ST`=Step study, `LGBTQ`, `BE`=Beginners, `MED`=Meditation, `LIT`=Literature, etc.), `city` / `state` / `postal_code` / `address` / `formatted_address`, `latitude` / `longitude`, `distance_miles`, and `detail_url` (relative path on sobasearch.com, e.g. `/meetings/us/new-york/aa/learning-to-live-i-6`).

3. **Query providers** (treatment centers, sober living, therapists, interventionists, detox):
   ```
   GET https://sobasearch.com/api/v1/search
       ?location={zip-or-city}
       &kind=provider
       &limit=25
       &radius_miles=25
   ```
   Each provider carries: `id` (`prv_<hex>`), `name`, `provider_type` (`facility` and a few others), `services` (array of free-text service names — "Outpatient", "Cognitive behavioral therapy", "Telemedicine/telehealth therapy", ...), `specialties` (array), `populations_served` (often null), `insurance_accepted` (often null — payment info lives in the **detail** record, not the search result), `address` / `city` / `state` / `postal_code`, `phone`, `website`, `email`, `verified` (bool), `credentials`, `source_name` ("SAMHSA FindTreatment.gov" is the dominant upstream), `latitude` / `longitude`, `distance_miles`. Provider results sort by distance, not by day-of-week.

4. **Optional filters**:
   - `q=<text>` — substring/program filter. `q=AA` returns only AA meetings; `q=NA` returns only NA. Works on both kinds.
   - `limit=<n>` — default 25, can request more (tested 50, 100 — both work). Server caps somewhere; if you ask for an absurd number it just returns what it has.
   - `radius_miles=<n>` — default 25. Use 50 for suburban ZIPs, 100+ for rural.

5. **Paginate** if `next_cursor` is not null:
   ```
   GET https://sobasearch.com/api/v1/search?location=...&kind=...&cursor=<next_cursor>
   ```
   `next_cursor` is base64 of `{"offset": N}` — opaque, just pass it back verbatim. **A bad cursor silently resets to offset 0 — no error.** Keep fetching until `next_cursor === null`.

6. **(Optional) Fetch detail records** for richer data per item:
   - `GET https://sobasearch.com/api/v1/meetings/{id}` — adds `conference_url` (Zoom etc.), `conference_phone`, `location_name`, `entity` (host org), `raw_record` (the upstream catalog row).
   - `GET https://sobasearch.com/api/v1/providers/{id}` — adds `payment_options` (Cash, Medicaid, Medicare, Private insurance, SAMHSA block grants, State-financed, sliding scale, ...), `source_url`, `external_id`, full `raw_record`.

### Browser fallback

Use only if `/api/v1/search` 4xx's, 5xx's, or is rate-limited (none of these were observed during testing — the endpoint is public, Cloudflare-cached, and returned 200 in every probe):

1. `browse open https://sobasearch.com/search?location={zip}` — the page client-side appends `&lat=&lng=` and renders. No special stealth needed; Cloudflare let `browse cloud fetch` through without a proxy, and the page itself loads without a JS challenge.
2. Wait ~3s for hydration (the SPA renders both tabs in parallel from the same API).
3. The **Meetings** tab is default. To get providers, `browse click @<ref>` the "Treatment & Providers" button (look up via `browse snapshot`).
4. `browse get markdown body` extracts the result list as a markdown stream. Each item is a single line of the form `time · duration · program_type attendance_mode · type_codes Name day(s) address · distance Select › ` followed by the relative detail URL inside `](...)` brackets. Split on `](/meetings/` or `](/providers/`.
5. Click "Load more meetings" / "Load more providers" to paginate.

This path is **slow** (~5-10 turns to get one ZIP's worth of meetings + providers vs. 2 HTTP requests on the API path). Only use as a last-resort fallback.

## Site-Specific Gotchas

- **The API is public and unauthenticated.** No `Authorization`, no cookie, no `X-Api-Key`, no CSRF token — `browse cloud fetch` (or `curl`) hits it directly and gets full JSON. Mentioned `API access` link in the footer goes to `/pricing` and appears to be aspirational rather than enforced; the v1 endpoint is wide-open at time of writing.
- **`kind=meeting` is the default.** Omitting `kind` returns meetings only — provider results need an explicit `kind=provider` request. To return both you must make **two requests** and merge client-side; there is no `kind=all`.
- **`days[]` array uses 0-indexed Sunday–Saturday, not 1-indexed Monday.** `days:[0]` = Sunday-only; `days:[1]` = Monday-only; `days:[2,4,5]` = Tue/Thu/Fri. Confirmed against the rendered HTML schedule sections.
- **`type_codes` is an undocumented enum of short codes.** Most common: `O`=Open, `C`=Closed, `B`=Big Book, `D`=Discussion, `ONL`=Online, `BE`=Beginners, `ST`=Step study, `MED`=Meditation, `LIT`=Literature, `LGBTQ`, `POC`, `NL`=Spanish-language, `12x12`, `11`=Eleventh-Step / Meditation. There's no decode table in the response — these are stable AA-tradition abbreviations. The rendered UI just shows them as `·`-separated chips.
- **`postal_code`, `address`, `formatted_address`, `ends_at`, `country` are nullable** — frequently for community-hosted meetings whose upstream catalog row lacks a precise street address. Always null-check before string-formatting.
- **Bogus ZIP → empty array, HTTP 200.** `?location=00000` returns `{"data":[],"next_cursor":null}` — there is no 400/404 for "no such location". If `data` is empty and you supplied a valid-looking ZIP, the ZIP genuinely has no nearby results within `radius_miles`; retry with a larger radius.
- **Missing `location` does NOT 400.** It returns a nationwide sample (first 25 alphabetical-ish meetings). Always pass `location=` explicitly so an accidental missing param doesn't silently return the wrong region.
- **Bad `cursor` silently resets to offset 0.** Passing `cursor=garbage` returns the first page again — no `400 invalid_cursor`. If your pagination loop looks like it's restarting, verify you're forwarding `next_cursor` verbatim and not stringifying the JSON yourself.
- **Provider `insurance_accepted` and `populations_served` are usually null on search responses** even though the rendered UI offers "Medicaid / Medicare / Aetna / Cigna / BCBS / Self-pay sliding" filter chips. Payment data lives in `raw_record.payment_options` on the **detail** endpoint (`/api/v1/providers/{id}`) — fetch that if you need insurance-acceptance info.
- **Distance is great-circle in statute miles**, computed from the geocoded `location` to each row's `latitude`/`longitude`. The default `radius_miles=25` is generous for urban ZIPs (typical urban ZIP returns the "25+" cap immediately) but tight for rural ones — bump to 50 or 100 for sparsely populated areas.
- **`detail_url` is a relative path.** Always prefix with `https://sobasearch.com` if you want an absolute URL — e.g. `https://sobasearch.com/meetings/us/new-york/aa/learning-to-live-i-6`.
- **`source_name: "SAMHSA FindTreatment.gov"` is the dominant upstream for providers.** SobaSearch enriches it with their own `verified` flag and contact-handler routing, but the underlying facility data, services, and payment options trace back to the federal SAMHSA Treatment Locator.
- **`robots.txt` disallows `/search` for bots**, but explicitly **allows `/`** and serves the search endpoint via Cloudflare cache (`Cache-Control: public, max-age=60, stale-while-revalidate=300`). Honor the spirit by keeping request rates reasonable (≤ 1 req/s sustained); the API is unlikely to ratelimit at low volume but `Cloudflare` is in front so abusive traffic will get challenged.
- **No `Cloudflare BrowserRenderingCrawler` allowed in robots.txt** — but this concerns indexing, not human-supervised agent traffic. The site has no CAPTCHA / JS-challenge for normal page loads.

## Expected Output

For a typical ZIP lookup, agents should produce a structure that merges both kinds, e.g.:

```json
{
  "location_query": "10001",
  "resolved_lat": 40.7536854,
  "resolved_lon": -73.9991637,
  "radius_miles": 25,
  "meetings_count": 25,
  "providers_count": 25,
  "meetings": [
    {
      "id": "mtg_8209368bffec15eb90b4d028ae590e60",
      "name": "Commuters Special",
      "program_type": "AA",
      "days": [1],
      "starts_at": "18:00:00",
      "ends_at": "19:00:00",
      "timezone": "America/New_York",
      "attendance_mode": "online",
      "type_codes": ["C", "ONL"],
      "city": "New York", "state": "NY", "postal_code": "10001",
      "address": null,
      "formatted_address": "New York, NY 10001, USA",
      "latitude": 40.7536854, "longitude": -73.9991637,
      "distance_miles": 0.20,
      "url": "https://sobasearch.com/meetings/us/new-york/aa/commuters-special"
    }
  ],
  "providers": [
    {
      "id": "prv_c1f63ce14b64ceb97305666c854c73c1",
      "name": "Postgraduate Center for Mental Health - CCBHC",
      "provider_type": "facility",
      "services": [
        "Outpatient",
        "Cognitive behavioral therapy",
        "Outpatient methadone/buprenorphine or naltrexone treatment",
        "Telemedicine/telehealth therapy"
      ],
      "specialties": ["Substance use treatment", "Buprenorphine used in Treatment"],
      "address": "213 West 35th Street",
      "city": "New York", "state": "NY", "postal_code": "10001",
      "phone": "212-889-5500",
      "website": "http://www.pgcmh.org",
      "email": null,
      "verified": false,
      "source_name": "SAMHSA FindTreatment.gov",
      "latitude": 40.7522262, "longitude": -73.9913934,
      "distance_miles": 0.27,
      "url": "https://sobasearch.com/providers/prv_c1f63ce14b64ceb97305666c854c73c1"
    }
  ],
  "next_cursors": {
    "meeting": "eyJvZmZzZXQiOjI1fQ",
    "provider": "eyJvZmZzZXQiOjI1fQ"
  }
}
```

Empty result shape (valid but un-indexed location, e.g. `00000`):

```json
{
  "location_query": "00000",
  "radius_miles": 25,
  "meetings_count": 0,
  "providers_count": 0,
  "meetings": [],
  "providers": [],
  "next_cursors": { "meeting": null, "provider": null },
  "note": "No meetings or providers indexed within radius_miles of the supplied location. Try a wider radius or verify the ZIP/city is real."
}
```
