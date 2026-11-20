---
name: volunteermatch-org-find-opportunities-0ycqah
title: VolunteerMatch Find Opportunities
description: >-
  Search for volunteer opportunities by location, cause/interest, skills,
  format, schedule, time commitment, and audience, and return each match as
  structured JSON. VolunteerMatch.org has sunset and 301-redirects to
  Idealist.org; this skill queries Idealist's public Algolia search index
  directly (the catalog VolunteerMatch postings were migrated into, with a
  `vmLegacyId` field preserving the old IDs).
website: volunteermatch.org
category: volunteering
tags:
  - volunteering
  - nonprofits
  - search
  - idealist
  - algolia
  - read-only
source: 'browserbase: agent-runtime 2026-05-16'
updated: '2026-05-16'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      The Idealist search UI (idealist.org/en/volunteer) is fully client-side
      rendered — initial HTML is a Remix shell with zero opportunity refs.
      Driving it pays a ~50-100x cost premium over the direct Algolia call. Use
      only if the Algolia endpoint is unreachable (verified working from cloud
      IPs without proxies/Verified).
  - method: url-param
    rationale: >-
      Legacy volunteermatch.org/search/?l=<location>&v=true URLs no longer
      return search data — they 301-redirect to
      idealist.org/en/volunteer-in-<city>, which still requires the Algolia XHR
      to actually fetch results. Use the URL only to parse the caller's intent,
      then issue the Algolia call directly.
verified: false
proxies: false
---
# VolunteerMatch Find Opportunities

## Purpose

Search for volunteer opportunities by location, cause/interest, skills, format, schedule, time commitment, and audience — and return each match as structured JSON (opportunity ID + VM legacy ID, title, host org, full description, cause/skill tags, format, location + lat/lon, schedule, time commitment, audience, group/family flags, photo, canonical URL). Read-only — never submits the "I Want to Help" / Apply form. Captures the region-wide total ("X opportunities matching your criteria") and supports pagination.

## When to Use

- Daily / weekly monitoring of new volunteer postings matching a cause + location.
- Bulk extraction of opportunities for a metro to feed an event-discovery or volunteer-matching agent.
- Single-opportunity detail extraction from a `volunteermatch.org/opp{ID}.jsp` URL or an Idealist `/volunteer-opportunity/{hash}-...` URL.
- Anywhere you'd otherwise scrape the VolunteerMatch search UI — the underlying search index is a public Algolia endpoint, faster and structurally richer than HTML scraping.

## Workflow

**Critical context: VolunteerMatch.org has sunset and 301-redirects every request to Idealist.org.** Idealist acquired VolunteerMatch and migrated the entire opportunity catalog (the legacy postings carry a `vmLegacyId` field). All searching now happens against Idealist's catalog, which is served by a public Algolia search index — no auth, no anti-bot, single HTTP GET per query.

The optimal path is **direct Algolia search** against the `idealist7-production-action-opps` index using the publicly-embedded search-only API key. Browser fallback (driving Idealist's search UI) works but pays a ~100× cost premium because the search page is fully CSR (initial HTML returns a Remix shell with zero opportunity refs; results render after Algolia XHRs fire client-side). Lead with the API.

### 1. Resolve inputs

| Input shape | Action |
|---|---|
| Full `volunteermatch.org/search/?...` URL | Treat it as a legacy redirect — parse `l=`/`v=`/`k=`/`o=` params, map to Idealist filters (table below), then issue the Algolia call. The 301 lands on `idealist.org/en/volunteer-in-<city>` which is just the UI route, not the API. |
| Full `idealist.org/en/volunteer?...` URL | Parse `q=`, `locationName=`, `radius=`, `sort=`, `page=`, and the faceted param names listed below; pass through. |
| Free-form location (city + state, ZIP, "Brooklyn, NY", "Remote") | Geocode to lat/lon (cache locally, e.g. `Brooklyn, NY → 40.6782,-73.9442`). For "Remote"/"Virtual" use `filters=locationType:REMOTE` and skip `aroundLatLng`. |
| Lat/lon + radius | Drop into `aroundLatLng=<lat>,<lng>` and `aroundRadius=<meters>` (radius is meters; 25 mi = 40000). |
| Direct opportunity URL (`/en/volunteer-opportunity/<32-hex>-<slug>` or legacy `/opp{id}.jsp`) | Skip search. For Idealist URLs, the 32-hex segment is the `objectID` — call `/1/indexes/{INDEX}/{objectID}` directly. For VM legacy URLs (`opp1234567.jsp`), use the `numericFilters=vmLegacyId=<id>` search trick (see Gotchas — `vmLegacyId` is **not** a facet, only a numeric filter). |

### 2. Map cause / interest area to Idealist's `areasOfFocus` taxonomy

Idealist uses an expanded but mostly compatible taxonomy. Apply this mapping when the caller asks for a VolunteerMatch cause name:

| VolunteerMatch cause | Idealist `areasOfFocus` value(s) |
|---|---|
| Animals | `ANIMALS` |
| Arts & Culture | `ARTS_MUSIC` |
| Children & Youth | `CHILDREN_YOUTH` |
| Community | `COMMUNITY_DEVELOPMENT` |
| Computers & Technology | `SCIENCE_TECHNOLOGY` |
| Crisis Support | `MENTAL_HEALTH`, `CRIME_SAFETY`, `VICTIM_SUPPORT` (OR them together) |
| Disaster Relief | `DISASTER_RELIEF` |
| Education & Literacy | `EDUCATION` |
| Emergency & Safety | `CRIME_SAFETY` |
| Employment | `JOB_WORKPLACE`, `ECONOMIC_DEVELOPMENT` |
| Environment | `ENVIRONMENT`, `CLIMATE_CHANGE` |
| Faith-Based | `RELIGION_SPIRITUALITY` |
| Health & Medicine | `HEALTH_MEDICINE` |
| Homeless & Housing | `HOUSING_HOMELESSNESS` |
| Hunger | `HUNGER_FOOD_SECURITY` |
| Immigrants & Refugees | `IMMIGRANTS_OR_REFUGEES` |
| International | `INTERNATIONAL_RELATIONS` |
| Justice & Legal | `LEGAL_ASSISTANCE`, `HUMAN_RIGHTS_CIVIL_LIBERTIES` |
| LGBTQ+ | `LGBTQ` |
| Media & Broadcasting | `MEDIA`, `COMMUNICATIONS_ACCESS` |
| People with Disabilities | `DISABILITY` |
| Politics | `POLICY`, `CIVIC_ENGAGEMENT` |
| Race & Ethnicity | `RACE_ETHNICITY` |
| Seniors | `SENIORS_RETIREMENT` |
| Sports & Recreation | `SPORTS_RECREATION` |
| Veterans & Military Families | `VETERANS` |
| Women | `WOMEN` |

Full enum (56 values, sorted by population): `COMMUNITY_DEVELOPMENT, HEALTH_MEDICINE, SENIORS_RETIREMENT, VOLUNTEERING, EDUCATION, HUNGER_FOOD_SECURITY, VETERANS, HOUSING_HOMELESSNESS, MENTAL_HEALTH, ARTS_MUSIC, DISABILITY, HUMAN_RIGHTS_CIVIL_LIBERTIES, INTERNATIONAL_RELATIONS, CHILDREN_YOUTH, WOMEN, ANIMALS, DISASTER_RELIEF, ENVIRONMENT, CRIME_SAFETY, RELIGION_SPIRITUALITY, SCIENCE_TECHNOLOGY, FAMILY, IMMIGRANTS_OR_REFUGEES, SPORTS_RECREATION, POVERTY, CIVIC_ENGAGEMENT, LEGAL_ASSISTANCE, ECONOMIC_DEVELOPMENT, MEDIA, CLIMATE_CHANGE, PHILANTHROPY, RACE_ETHNICITY, POLICY, LGBTQ, RURAL_AREAS, ENTREPRENEURSHIP, JOB_WORKPLACE, COMMUNICATIONS_ACCESS, VICTIM_SUPPORT, AGRICULTURE, RESEARCH_SOCIAL_SCIENCE, URBAN_AREAS, FINANCIAL_LITERACY_PERSONAL_FINANCE, TRANSPORTATION, CONFLICT_RESOLUTION, MEN, PRISON_REFORM, SEXUAL_ABUSE_HUMAN_TRAFFICKING, TRAVEL_HOSPITALITY, WATER_SANITATION, SUBSTANCE_ABUSE_ADDICTION, TRANSPARENCY_OVERSIGHT, REPRODUCTIVE_HEALTH_RIGHTS, CONSUMER_PROTECTION, ENERGY, MICROFINANCE`.

### 3. Build the Algolia request

Endpoint (search), `GET`:

```
https://nsv3auess7-dsn.algolia.net/1/indexes/{INDEX}
    ?query={q}
    &hitsPerPage={1-100, default 20}
    &page={0-based}
    &filters={URL-encoded facet filter expression}
    &numericFilters={URL-encoded numeric filter}
    &aroundLatLng={lat},{lng}
    &aroundRadius={meters}     // OR aroundRadius=all to disable distance scoring
    &facets=*                  // optional — returns facet counts for refinement UI
    &maxValuesPerFacet=100
    &x-algolia-application-id=NSV3AUESS7
    &x-algolia-api-key=c2730ea10ab82787f2f3cc961e8c1e06
```

Index name depends on sort order:

| Sort | Index name |
|---|---|
| Best Match / Relevance (default) | `idealist7-production-action-opps` |
| Most Recent / Newest | `idealist7-production-action-opps-published-desc` |

(There is **no** "Closest" sort replica — Idealist relies on Algolia's geo-ranking built into the relevance index when `aroundLatLng` is set. "Sort by distance" is implicit in the relevance index whenever a geo filter is present.)

The `NSV3AUESS7` app ID and `c2730ea10ab82787f2f3cc961e8c1e06` search API key are public, embedded in Idealist's initial HTML at `/en/volunteer` (look for the `"algolia":{"appId":...}` block in the SSR payload). Both are search-only keys — they cannot mutate or read non-search indices. Treat them as long-lived constants but re-extract from the initial HTML if a 403 ever fires (key rotation has not been observed in the wild but Idealist could change them).

### 4. Filter expression syntax

Multi-value facets use `OR`, multi-facet conjunction uses `AND`, group with parens:

```
(areasOfFocus:ANIMALS OR areasOfFocus:ENVIRONMENT) AND locationType:ONSITE AND canBeDoneInADay:true AND welcome:FAMILIES
```

URL-encode the entire expression and pass as `filters=`. Filterable attributes (verified):

| Attribute | Type | Values |
|---|---|---|
| `areasOfFocus` | string array | 56 enum values (see table §2) |
| `functions` | string array | 98 enum values — Idealist's skill taxonomy; key ones: `MENTOR_TUTOR`, `TEACHING_AND_INSTRUCTION`, `TECHNOLOGY_SUPPORT_WEB_DESIGN`, `GRAPHIC_DESIGN`, `LANGUAGES`, `FUNDRAISING`, `MARKETING`, `SOCIAL_MEDIA`, `LEGAL`, `MEDICAL`/`HEALTHCARE_PROVIDER_PRACTITIONER`, `WRITING_EDITORIAL`, `DATA_ANALYSIS`, `EVENT_SUPPORT`, `CASE_SOCIAL_WORK`, `COUNSELING`. Use `browse cloud fetch` of `?facets=*` for the full enum. |
| `locationType` | string | `ONSITE`, `REMOTE`, `HYBRID` |
| `remoteZone` | string | `CITY`, `STATE`, `COUNTRY`, `WORLD` — only meaningful when `locationType:REMOTE` |
| `remoteCountry`, `remoteState` | string | ISO country code / US state abbreviation — scoping remote opportunities to a region |
| `country` | string | ISO country code (e.g. `US`, `GB`, `CA`) |
| `state` | string | US state abbreviation (e.g. `NY`, `CA`) — only set for `ONSITE`/`HYBRID` |
| `welcome` | string array | `FAMILIES`, `GROUPS`, `TEENS`, `AGE_55_PLUS`, `INTL`, `PRIVATE_CORP_GROUPS` |
| `canBeDoneInADay` | boolean | `true`/`false` — proxy for "less than a full day" time commitment |
| `welcomeFamilies`, `welcomeGroups` | boolean | redundant with `welcome:FAMILIES`/`welcome:GROUPS` but cheaper to filter |
| `actionType` | string | `VOLOP`, `EVENT` — VOLOP is the recurring posting, EVENT is a one-off scheduled date |
| `type` | string | `VOLOP`, `IMPORTED`, `EVENT` — `IMPORTED` is third-party sources (e.g. NYC Parks) |
| `source` | string | `IDEALIST`, `GOLDEN`, `NYCPARKS` — content provenance |
| `fromVm` | boolean | `true` selects the 870-ish opportunities migrated from VolunteerMatch (keep `vmLegacyId`) |
| `isIdealistDay` | boolean | Featured Idealist Day campaigns |
| `locale` | string | `en`, `es`, `pt` — opportunity language |
| `hasLocation` | boolean | `true` if the opp has any location (onsite + remote with region scope); `false` is rare |
| `orgID` | string | 32-char hex — scope to a single host org |

**Date filtering** — `starts` and `ends` are numeric Unix epoch facets, use `numericFilters`:

```
numericFilters=starts >= 1780000000,ends <= 1782592000
```

URL-encode the whole expression. Comma separates AND clauses. Useful date params (the Idealist UI calls them `endsGT` "ends greater than" and `startsLT` "starts less than" but they boil down to `numericFilters`):

- "Available this weekend" → `numericFilters=ends >= <fri_epoch>,starts <= <sun_epoch>`
- "Available within the next 30 days" → `numericFilters=ends >= <now>,starts <= <now+2592000>`
- "Ongoing" (no fixed dates) → results where `starts` and `ends` are `null` — filter client-side rather than via Algolia (numeric filters can't match null).

### 5. Geo + radius

```
aroundLatLng=40.6782,-73.9442&aroundRadius=40000   # Brooklyn, NY · 25 mi
```

Radius is **meters**. Conversions: 5 mi = 8000, 10 mi = 16000, 25 mi = 40000, 50 mi = 80000, 100 mi = 160000. Omit `aroundRadius` (or set `aroundRadius=all`) to drop the distance filter while still using `aroundLatLng` for ranking.

Free-form locations should be geocoded with Idealist's own location resolver (the search UI POSTs to its `/api/v3/locations/search` endpoint to convert "Brooklyn, NY" → lat/lng), or with any third-party geocoder. The result-page URL param `locationName=Brooklyn%2C+NY%2C+USA` is purely a UI breadcrumb — it does not affect the Algolia call; the lat/lon does.

### 6. Pagination

`hitsPerPage` max **100**, default **20**. `page` is 0-based. **Total fetchable hits are capped at 1000** (page=49 at hitsPerPage=20, or page=9 at hitsPerPage=100). Above that, Algolia returns `{message: "you can only fetch the 1000 hits for this query…"}`. The `/browse` cursor method is blocked for this search-only key (403). To extract more than 1000 results, **narrow the query with additional filters or a tighter geo radius** until the result set drops below 1000.

### 7. Decode each hit

`response.hits[i]` schema (verified fields):

| Field | Meaning |
|---|---|
| `objectID` | 32-char hex — Idealist opportunity ID. Build canonical URL as `https://www.idealist.org/en/volunteer-opportunity/{objectID}`; the slug suffix is SEO-only and **optional** (verified: bare-objectID URL 200s and returns the same page as the full slug URL). |
| `vmLegacyId` | integer or `null` — the original VolunteerMatch posting ID. Legacy URL was `https://www.volunteermatch.org/opp{vmLegacyId}.jsp` (now 301s to Idealist). |
| `name` | opportunity title |
| `description` | full body (HTML stripped, line breaks may be missing — preserve as-is) |
| `areasOfFocus` | string array — cause/interest tags (see §2) |
| `keywords` | string array — human-readable skill labels (e.g. `["Communications","Reading / Writing"]`) |
| `functions` | string array — machine skill enum (parallel to `keywords`) |
| `locationType` | `ONSITE` / `REMOTE` / `HYBRID` |
| `city`, `state`, `country`, `stateStr` | location fields for `ONSITE`/`HYBRID` (city/state are `null` for `REMOTE`) |
| `_geoloc` | `{lat, lng}` — present for `ONSITE`/`HYBRID`; for remote opps it often points to the host org's HQ (use `locationType` to disambiguate "where to show up" vs "where the org is") |
| `remoteOk`, `remoteZone`, `remoteCountry`, `remoteState` | remote scope (e.g. `remoteZone:WORLD` means open to volunteers globally) |
| `starts`, `ends` | Unix epoch seconds — start/end window. `null` for ongoing opportunities. |
| `startDate`, `endDate`, `startTime`, `endTime`, `timezone` | human-readable schedule. `startsLocal`/`endsLocal` are the local-timezone versions. |
| `welcome` | array of `GROUPS`, `FAMILIES`, `TEENS`, `INTL`, `AGE_55_PLUS`, `PRIVATE_CORP_GROUPS` |
| `welcomeFamilies`, `welcomeGroups` | bool shortcuts |
| `canBeDoneInADay` | bool — short time-commitment proxy |
| `detailsTrainingProvided`, `detailsStipendProvided`, `detailsAcademicCreditAvailable`, `detailsHousingAvailable` | bool — extra-detail flags surfaced in VM's old UI |
| `hasAts` | bool — opportunity uses Idealist's applicant-tracking system (so "Apply" works in-app rather than redirecting) |
| `hasFileRequestedAttachments` | bool — resume/cover-letter required to apply |
| `isPostedAnonymously` | bool — host org not surfaced publicly |
| `image` | `{handle, mimetype, width, height}` — primary photo. CDN URL: `https://cdn.filestackcontent.com/resize=width:1200,height:1200,fit:max/quality=value:90/{handle}` |
| `logo`, `logoHandle` | org logo handle (same CDN pattern) |
| `orgID` | 32-char hex |
| `orgName` | org display name |
| `orgType` | `NONPROFIT`, `RECRUITER`, `CONSULTANT`, `GOVERNMENT_AGENCY`, etc. |
| `orgUrl.en` | path to org page; build canonical: `https://www.idealist.org{orgUrl.en}` |
| `published` | epoch seconds when opportunity was published (use for "Most Recent" sort timestamp) |
| `source` | `IDEALIST`, `GOLDEN`, `NYCPARKS` — provenance |
| `url.en`, `url.es`, `url.pt` | locale-specific paths; canonical = `https://www.idealist.org{url.en}` |

`response.nbHits` is the region-wide total. `response.nbPages` is min(`ceil(nbHits/hitsPerPage)`, 50). Pagination beyond `nbPages-1` returns empty `hits` not an error.

### 8. Fetch org detail (optional)

Idealist's org pages are SSR and embed structured org data in two places:

1. **JSON-LD `<script type="application/ld+json">`** at the top of the page — `@type:"Organization"` block with `name`, `url`, `description` (mission HTML), `address` (PostalAddress: `streetAddress`, `addressLocality`, `addressRegion`, `postalCode`, `addressCountry`), `areaServed`, `knowsAbout` (human-readable cause labels).
2. **Algolia org index** `idealist7-org-production` — same `appId`/`searchApiKey` work. Fetch by `objectID`:
   ```
   GET https://nsv3auess7-dsn.algolia.net/1/indexes/idealist7-org-production/{orgID}
       ?x-algolia-application-id=NSV3AUESS7&x-algolia-api-key=c2730ea10ab82787f2f3cc961e8c1e06
   ```
   Returns org fields including `website`, `phone`, `facebookUrl`, `twitterUrl`, `linkedinUrl`, `yearFounded`, `ein`, and total opportunity counts.

### 9. Read-only — never click apply

The "I Want to Help" / "Apply Now" button on either VolunteerMatch's legacy detail page or Idealist's opp detail page launches a multi-step modal that posts to `/api/v3/applications`. **Never click it, never POST to that endpoint.** Stop at the search results + detail extraction.

### Browser fallback

If for some reason the Algolia endpoint is unreachable (highly unlikely — it's served by Algolia's global CDN, not Idealist), drive the UI:

1. `browse cloud sessions create --keep-alive` (bare session — no Verified or proxy needed; verified by direct REST calls succeeding without either).
2. `browse cloud browse --connect "$SID" open "https://www.idealist.org/en/volunteer?q=<urlenc-query>&locationName=<urlenc-location>&radius=<miles>&areasOfFocus=<UPPER_ENUM>&locationType=ONSITE&sort=newest&page=2"`.
3. `browse cloud browse --connect "$SID" wait load`, then `wait timeout 3000` (search XHR takes 1–3 seconds after `load`).
4. `browse cloud browse --connect "$SID" snapshot` — extract opportunity cards from the rendered DOM. The cards are `<article data-qa-id="search-hit">` blocks; each contains a `<a href="/en/volunteer-opportunity/...">` (the canonical URL), title, org name, and a snippet.
5. Cost premium is ~50–100× the API call — only use as a last resort.

## Site-Specific Gotchas

- **VolunteerMatch.org is dead — 301 redirects everywhere.** Confirmed 2026-05-16: every path under `volunteermatch.org` returns `301` with `Location: https://www.idealist.org/...`. The redirect map: `/` → `/volunteermatch` (landing page), `/search/?l=<location>` → `/en/volunteer-in-<city>` (geo-aware), `/search` (no params) → `/en/volunteer`, `/about`/`/orgs`/`/api/*` → `/volunteermatch`. **There is no live VolunteerMatch API to call.** The entire catalog has been merged into Idealist's Algolia index. Posts that originated on VM carry `fromVm:true` and a populated `vmLegacyId`.
- **Algolia search-only key is public and stable.** `NSV3AUESS7` / `c2730ea10ab82787f2f3cc961e8c1e06` are embedded in Idealist's SSR HTML by design. They're rate-limited but un-versioned. If a 403 ever fires, re-fetch `https://www.idealist.org/en/volunteer` and re-parse the `"algolia":{...}` JSON block — it's in the initial HTML, no JS execution needed.
- **`vmLegacyId` is NOT a facet filter — only a numeric filter.** `filters=vmLegacyId:1234567` returns 0 hits. Use `numericFilters=vmLegacyId=1234567` (or `numericFilters=vmLegacyId%3D1234567` URL-encoded). This is the only way to look up an opportunity by its old VM ID via search.
- **1000-hit pagination cap.** `hitsPerPage * (page+1) ≤ 1000`. Beyond that, Algolia returns `{message: "you can only fetch the 1000 hits for this query"}`. The `/browse` cursor endpoint is **blocked** for this key (403 "Method not allowed"). To extract more than 1000, narrow filters until total drops below the cap. Practical pattern: paginate by `published` timestamp window (e.g. last 7 days, then previous 7, etc.) using `numericFilters=published >= <a>,published <= <b>`.
- **`aroundRadius` is meters, not miles.** The Idealist URL uses miles (`radius=25`), but the Algolia API takes meters (`aroundRadius=40000`). Don't pass through the URL value blindly — multiply by 1609.
- **Geo on remote opps is misleading.** For `locationType:REMOTE` opportunities, `_geoloc` is usually the host org's HQ coordinates, not where the volunteer needs to be. The volunteer can be anywhere within `remoteZone`. Always check `locationType` before treating `_geoloc` as "where you go".
- **Sort options are just two: `relevance` and `newest`.** No "Closest" replica exists. When `aroundLatLng` is set, the relevance index already factors distance into ranking (Algolia's built-in geo-ranking). For pure-distance sort, fetch `hitsPerPage=100&aroundLatLng=...` and re-sort client-side by `_rankingInfo.geoDistance` (request `getRankingInfo=true` to surface that field).
- **The full opportunity body is in `description` on the search hit.** No detail-page fetch needed for the body — Algolia returns the entire description with each hit (verified at 2000+ chars). Detail-page fetch is only needed for JSON-LD breadcrumbs and the host-org contact card.
- **Canonical URL slug is optional.** `https://www.idealist.org/en/volunteer-opportunity/{32-hex-objectID}` 200s and serves the same page as the full `/en/volunteer-opportunity/{objectID}-{slug}` URL. Build URLs with the slug for SEO/sharing but the bare-ID form is what to canonicalize against.
- **Three locales — `en`, `es`, `pt`.** Each hit carries `url.en`, `url.es`, `url.pt` paths. Filter `locale:en` to limit to English-language postings; default index returns all three.
- **`canBeDoneInADay` is the closest proxy for "Less than 2 hours" / "Half day" / "Full day" buckets.** Idealist collapsed VM's four time-commitment buckets into a single boolean. If callers ask for "Less than 2 hours" specifically, return `canBeDoneInADay:true` results and document that finer-grained time-commitment data is no longer indexed.
- **`welcome:TEENS` is the only age-restriction filter — Idealist does not separate "Kids (under 13)" from "Teens (13-17)".** VM's "Kids" filter has no Idealist equivalent; if callers ask for it, fall back to `welcome:FAMILIES` (which generally implies "kid-friendly").
- **No skill-level-of-detail filter for "tutoring" vs "ESL tutoring".** Idealist's `functions` enum has `MENTOR_TUTOR`, `TEACHING_AND_INSTRUCTION`, `ESL`, `EDUCATION`, `READING_WRITING` — they're separate values, not hierarchical. Pass them all in an OR clause for "tutoring" intent.
- **`source:IDEALIST` is the dominant provenance.** `GOLDEN` and `NYCPARKS` are third-party content imports. `fromVm:true` selects the legacy VM migration cohort (about 870 postings as of 2026-05-16). If a caller specifically wants "VolunteerMatch listings" rather than "all volunteer listings" — surface both `fromVm:true` results AND the broader Idealist catalog, but flag the distinction in the response (e.g. `"provenance": "vm_legacy" | "idealist_native"`).
- **No anti-bot, no proxies, no Verified needed.** Direct `browse cloud fetch` against `nsv3auess7-dsn.algolia.net` works from a cloud IP. Idealist's own pages also serve cleanly without Verified — verified by fetching the search-results SSR HTML and the opp/org detail pages without any 403/captcha.
- **Detail-page JSON-LD is `@type: "JobPosting"`, not "VolunteerOpportunity".** Idealist (re-)uses Google's JobPosting schema for SEO regardless of the listing being volunteer/unpaid. The `employmentType` field reads `"VOLUNTEER"` so you can disambiguate. Don't be fooled by the schema name.
- **The volunteer "Apply" flow goes through Idealist's own ATS.** `hasAts:true` opportunities apply in-app via a POST to `/api/v3/applications`. `hasAts:false` (rare) redirects to the org's external apply URL — but **both paths are write operations and outside this skill's scope**.

## Expected Output

```json
{
  "query": {
    "q": "education",
    "locationName": "Brooklyn, NY, USA",
    "lat": 40.6782,
    "lng": -73.9442,
    "radius_miles": 25,
    "areasOfFocus": ["EDUCATION", "CHILDREN_YOUTH"],
    "functions": ["MENTOR_TUTOR"],
    "locationType": ["ONSITE", "HYBRID"],
    "welcome": ["FAMILIES"],
    "canBeDoneInADay": true,
    "starts_after": null,
    "ends_before": null,
    "sort": "relevance",
    "page": 0,
    "hitsPerPage": 20
  },
  "total_results": 561,
  "page": 0,
  "pages_available": 29,
  "pagination_capped_at_1000": false,
  "opportunities": [
    {
      "opportunity_id": "0e5666777017431d8b5b02185195192c",
      "vm_legacy_id": null,
      "provenance": "idealist_native",
      "title": "Transport Volunteer",
      "description": "Need help with transport between New York City and the airport: LaGuardia, JFK, and/or Newark to help transport several cats or puppies at various times and days.",
      "url": "https://www.idealist.org/en/volunteer-opportunity/0e5666777017431d8b5b02185195192c-transport-volunteer-inky-blue-sea-companion-animal-rescue-inc-new-york",
      "format": "ONSITE",
      "remote": { "ok": false, "zone": null, "country": null, "state": null },
      "location": {
        "street": null,
        "city": "New York",
        "state": "NY",
        "country": "US",
        "zip": null,
        "lat": 40.712775,
        "lng": -74.005973
      },
      "areas_of_focus": ["ANIMALS"],
      "skills": {
        "labels": ["Transportation"],
        "functions": ["TRANSPORTATION"]
      },
      "schedule": {
        "starts": null,
        "ends": null,
        "start_date": null,
        "end_date": null,
        "start_time": null,
        "end_time": null,
        "timezone": null,
        "is_ongoing": true,
        "can_be_done_in_a_day": false
      },
      "audience_welcome": ["GROUPS", "AGE_55_PLUS"],
      "good_for_families": false,
      "good_for_groups": true,
      "details": {
        "training_provided": false,
        "stipend_provided": false,
        "academic_credit_available": false,
        "housing_available": false
      },
      "image_url": "https://cdn.filestackcontent.com/resize=width:1200,height:1200,fit:max/quality=value:90/Jfc2jbKdSbOxS6Rk66VH",
      "background_check_required": null,
      "how_to_apply": "Apply via Idealist (hasAts=true) at the canonical URL.",
      "contact": { "public_email": null, "public_phone": null },
      "published_at_epoch_seconds": 1778768576,
      "source": "IDEALIST",
      "organization": {
        "org_id": "768534ac839940dfaba088cc19219b2d",
        "name": "Inky Blue Sea Companion Animal Rescue, Inc.",
        "type": "NONPROFIT",
        "url": "https://www.idealist.org/en/nonprofit/768534ac839940dfaba088cc19219b2d-inky-blue-sea-companion-animal-rescue-inc-new-york",
        "logo_url": "https://cdn.filestackcontent.com/resize=width:1200,height:1200,fit:max/quality=value:90/m3rSpRSSvaRIqnFGbvXj"
      }
    }
  ],
  "organizations_seen": [
    {
      "org_id": "768534ac839940dfaba088cc19219b2d",
      "name": "Inky Blue Sea Companion Animal Rescue, Inc.",
      "url": "https://www.idealist.org/en/nonprofit/768534ac839940dfaba088cc19219b2d-inky-blue-sea-companion-animal-rescue-inc-new-york",
      "mission": "<p>...mission HTML from JSON-LD description...</p>",
      "address": {
        "street": "58 FAIR OAKS ST",
        "city": "SAN FRANCISCO",
        "state": "CA",
        "zip": "94110",
        "country": "US"
      },
      "phone": null,
      "website": null,
      "social": { "facebook": null, "twitter": null, "linkedin": null },
      "year_founded": null,
      "ein": null,
      "type": "NONPROFIT",
      "opportunities_posted": null
    }
  ]
}
```

For a single-opportunity detail extraction (caller passed a direct URL), return the same `opportunities[0]` shape wrapped as `{ "opportunity": {...}, "organization": {...} }` — no pagination metadata needed.
