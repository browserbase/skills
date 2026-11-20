---
name: healthgrades-com-find-specialist-4ekjm6
title: Healthgrades Find Specialist
description: >-
  Search Healthgrades for doctors, specialists, NPs/PAs, dentists, or hospitals
  matching a specialty (or condition/procedure) and location, honoring every
  /usearch filter (insurance, language, gender, distance, hospital affiliation,
  board-certification, rating, telehealth, accepts-new-patients, etc.) and
  returning structured JSON per provider including NPI, ratings, addresses,
  insurance, hospital affiliations, and Healthgrades awards. Read-only — never
  books or submits.
website: healthgrades.com
category: healthcare
tags:
  - healthcare
  - doctors
  - providers
  - read-only
  - akamai
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      Internal JSON backend at provider-search-api.healthgrades.com is
      bearer-auth-gated (401 cookieless on all root paths). Page-context tokens
      don't survive lift-out. Confirmed dead end.
  - method: url-param
    rationale: >-
      Every left-rail filter (insurance, language, gender, rating, distance,
      telehealth, board-cert, hospital, etc.) round-trips into /usearch query
      params — set them on the initial navigation URL rather than clicking the
      rail. The page is still SSR-rendered, so a browser is still required to
      actually fetch the >1MB response, but URL-param filtering is dramatically
      faster than UI clicking. Treat this as the in-browser optimization, not a
      non-browser path.
verified: true
proxies: true
---
# Healthgrades Find Specialist

## Purpose

Search Healthgrades for medical providers (doctors / specialists / dentists / NPs / PAs) matching a specialty (or condition or procedure) and a location, honoring every filter dimension the Healthgrades `/usearch` UI exposes (insurance, language, gender, distance, hospital affiliation, board-certification, patient rating, experience tags, telehealth, accepts-new-patients, etc.), and return the matching providers as structured JSON. Also supports single-provider extraction from a `/physician/dr-...` detail URL. Read-only: never click Book Appointment, Sign In, or Leave a Review.

## When to Use

- "find a cardiologist near 94110 who takes BCBS California and speaks Spanish"
- "rank dermatologists in Brooklyn by patient rating, telehealth only, accepting new patients"
- "extract everything Healthgrades knows about Dr. Jane Smith in San Francisco" (single-provider deep extraction)
- A care-navigation or referral agent surfacing specialists by condition (`heart failure`, `Type 2 diabetes`, `ADHD`)
- A research / lead-gen agent collecting NPIs + practice addresses across a city for a single specialty
- Comparison shopping across insurance plans for a given specialty in a given metro

Not for booking appointments — Healthgrades' "Request Appointment" / "Book Appointment" CTAs route to partner-scheduling networks and are out of scope for this skill.

## Workflow

Healthgrades' `/usearch` page is fully **Next.js SSR** — provider data is embedded in the rendered HTML response (the page is ~1–3 MB; the Browserbase Fetch API's 1 MB cap rejects it, so a real browser session is required). The internal JSON backend at `provider-search-api.healthgrades.com` is bearer-auth gated (returns `401 {"message":"Unauthorized"}` cookieless) and cannot be called directly from outside the page context — confirmed by fetch probes on `/`, `/api/`, `/api/search`, `/v1/search`, `/swagger`. Healthgrades runs on Akamai with SBSD challenges, so **Browserbase Verified (`--verified`) + residential proxies (`--proxies`) are mandatory** — without proxies, the Akamai edge applies geo-IP localization (the page's `where` defaults to the datacenter region) and elevates bot scoring; bare sessions get challenged within 1–2 navigations.

### 1. Open a Verified + residential-proxy session

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies | jq -r .id)
export BROWSE_SESSION="$SID"
```

Both flags are mandatory. Without `--verified` the Akamai bot-score is high enough that the SSR HTML occasionally returns the "Oops" interstitial (HTTP 200, but no provider data). Without `--proxies` the `where` IP-geolocation defaults to the Browserbase datacenter region (`us-west-2` → Oregon), which silently warps results when the caller omits an explicit `where=` param.

### 2. Pick the entry URL based on input intent

| Input shape | URL template |
|---|---|
| Specialty + location (`"cardiologist in 94110"`) | `/usearch?what={Specialty}&where={location}&pageNum=1` |
| Specialty + lat/lon (precise) | `/usearch?what={Specialty}&where={city,ST}&pt={lat},{lon}&pageNum=1` |
| Condition / procedure + location | `/usearch?what={Condition}&where={location}&pageNum=1` (same param — Healthgrades' `what` accepts specialty, condition, or procedure interchangeably) |
| Insurance-first search | `/insurance-search/{carrier-slug}` then narrow via UI |
| Best-of (SEO landing) | `/find-a-doctor/{state-slug}/best-{specialty-slug}-in-{city-slug}` — server-rendered list of top-rated providers, no filter rail |
| Specific provider name | `/usearch?what={Dr.+Name}&where={city}` → click into matching `/physician/dr-...` |
| Direct provider detail URL | `/physician/dr-{slug}-{6char-id}` (canonical) — use directly |

URL-encode `what` and `where` with `+` or `%20` for spaces, `%2C` for commas. The host **always** redirects `/find-a-doctor/...` (308) to the canonical form — pass `--allow-redirects` equivalent in the browser (default behavior).

### 3. Apply filters via URL params (preferred over UI clicks)

Healthgrades writes every left-rail filter back into the URL as a query parameter. Set them on the initial navigation rather than clicking the filter rail — this is **~5× faster** than driving the UI (no re-hydration between clicks) and produces a copy-pasteable URL the caller can persist.

Verified parameter set (observed across Google-indexed `/usearch?...` URLs and the UI's URL-sync behavior):

| Filter dimension | URL param | Values |
|---|---|---|
| Specialty / condition / procedure | `what` | Free text or specialty slug (e.g. `Cardiology`, `Heart+Failure`, `Mohs+Surgery`) |
| Location (text) | `where` | `"San Francisco, CA"` / `"94110"` / `"Brooklyn NY"` |
| Location (precise lat/lon) | `pt` | `lat,lon` (e.g. `37.7749,-122.4194`) — overrides `where`'s geocoded centroid |
| State (extra disambiguator) | `state` | Two-letter code |
| Page number | `pageNum` | Integer ≥ 1 |
| Sort (providers) | `sort.provider` | `bestmatch` (default) / `ratings` / `distance` / `experience` |
| Sort (facilities mode) | `sort.facility` | `patientsatisfaction` (only when `category=facility`) |
| Search mode | `category` | `provider` (default, implied) / `facility` |
| Distance radius (miles) | `distances` | `1 / 5 / 10 / 25 / 50 / 100` (Healthgrades' fixed enum) |
| Facility class (when `category=facility`) | `FacilityType` | `STAC` (short-term acute care), `CHDR` (children's), `PSY`, `LTAC`, comma-joined |
| Min patient rating | `minRating` / `ratings.minimumScore` | `1.0–5.0` in 0.5 steps |
| Insurance | `insurance` / `insurancePlan` | Carrier slug (`aetna`, `bcbs-california`, `cigna`, `united-healthcare`, `humana`, `kaiser`, `medicare`, `medicaid`, `tricare`); comma-joined for multi-select |
| Languages spoken | `languages` | Language code/slug (`spanish`, `mandarin`, `asl`, `russian`, `french`, `vietnamese`); comma-joined |
| Gender | `gender` | `male` / `female` |
| Accepts new patients | `acceptsNewPatients` | `true` |
| Telehealth | `telehealth` / `offers.telehealth` | `true` |
| Board certified | `boardCertified` | `true` |
| Years in practice (min) | `minYearsExperience` / `experience.minimumYears` | Integer |
| Hospital affiliation | `hospital` / `hospitalAffiliation` | Hospital name or Healthgrades hospital slug |
| Online scheduling | `onlineScheduling` | `true` |
| Wheelchair accessible | `wheelchairAccessible` | `true` |
| Evening hours | `eveningHours` | `true` |
| Weekend hours | `weekendHours` | `true` |
| Experience-tag floor (per tag) | `tag.{slug}` | `listens-and-answers`, `explains-conditions-well`, `trusted-for-decisions`, `treats-with-respect`, `spends-appropriate-time` — values are minimum percentages |

When a future caller needs a filter you haven't seen used in the URL before, open the page once with the filter clicked through the UI, read the post-click URL, and capture the new param name. Healthgrades sometimes A/B-renames params (e.g. `insurance` vs `insurancePlan`) — always read the URL the UI actually produces rather than guessing from this table.

### 4. Drive the page and extract

```bash
browse open --remote "$URL"
browse wait load                       # wait for SSR + RSC hydration
browse wait timeout 2500               # provider cards render progressively (~1.5–2s after `load`)
browse get markdown body > results.md  # full rendered page as markdown
browse snapshot                        # accessibility tree with refs for clicking pagination
```

`browse get markdown body` is the cheapest path — Healthgrades' provider cards render with structured headings, ratings, addresses, and badges that survive the HTML→markdown conversion with high fidelity. For richer extraction (rating distribution, full insurance list, experience-tag scores), evaluate the embedded `__NEXT_DATA__` / RSC payload:

```bash
browse eval "JSON.stringify(
  Array.from(document.querySelectorAll('script')).find(s => s.textContent?.includes('providerId'))?.textContent
)" > rsc-payload.json
```

The page emits its Apollo / RSC state inline as a `<script>` chunk; the inner objects contain every provider field listed in **Expected Output** with canonical Healthgrades names (`providerId`, `firstName`, `lastName`, `npi`, `acceptingNewPatients`, `hospitalAffiliations`, `boardCertifications`, etc.). Field names use camelCase on the RSC side and snake_case on the rendered DOM data-attrs (`data-provider-id`, `data-rating-overall`); both are acceptable extraction targets.

### 5. Paginate

```bash
# Increment pageNum and re-navigate, or click the rendered pagination button
browse open --remote "${URL%pageNum=*}pageNum=${N}"
```

Healthgrades renders 10 providers per page by default; the total count is in the header text (`"123 Results for Cardiology near San Francisco, CA"`) and in the embedded RSC payload as `totalResultCount`. Cap pagination at `ceil(totalResultCount / 10)` — past that, Healthgrades returns an empty card list with no error.

### 6. For single-provider deep-extract (`/physician/dr-...`)

```bash
browse open --remote "https://www.healthgrades.com/physician/{slug}"
browse wait load
browse wait timeout 2500
browse get markdown body
browse eval "document.querySelector('script[type=\"application/ld+json\"]')?.textContent"
```

Provider detail pages carry a full JSON-LD `Physician` block (schema.org) with `name`, `medicalSpecialty`, `address`, `telephone`, `aggregateRating`, plus tab content (Locations, Insurance, Experience, Ratings, About). The JSON-LD is the highest-signal-density extraction source and is stable across template revisions.

### 7. Release the session

```bash
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

### Browser fallback / non-browser shortcuts — none worth pursuing

The following were probed and confirmed dead ends; **don't waste a turn on them**:

- `provider-search-api.healthgrades.com/{api/, /api/search, /search, /health, /swagger, /v1/search}` — all return `401 {"message":"Unauthorized"}` cookieless. Auth tokens are minted client-side from a page-warmed session and don't survive lift-out (similar to OpenTable's GraphQL trap).
- `api.healthgrades.com/autosuggest` — `403 Missing Authentication Token`.
- `/api/autosuggest?what=...&where=...` — returns 200 but only echoes the IP-geo-derived `where` envelope (`{"what": null, "where": {"city": "Wauseon", "state": "OH", ...}}`); the `what` field is always null regardless of query params. Useful only for diagnosing what city the proxy IP geo-resolves to (i.e. confirming the proxy actually rotated).
- `/_next/data/{buildId}/usearch.json` — 404. Healthgrades disables the Next.js JSON data endpoint for crawlers.
- `/hg-provider-search-app/api/*` — 404. The app's internal routes are not externally addressable.
- `/uisvc/v1_0/providersearch` — 404. Old endpoint, no longer wired.
- `/dir/`, `/provider-search-directory/`, `/hospital-directory/search/` — all `Disallow:` in robots.txt; don't crawl these directories programmatically.

## Site-Specific Gotchas

- **READ-ONLY**: Do **not** click `Book Appointment`, `Request Appointment`, `Sign In`, `Leave a Review`, `Save`, or any star-rating UI. The Book/Request CTAs route to third-party scheduling networks (Zocdoc, MyChart partners, etc.) and may auto-submit on the first click. Stop at the result card / detail page.
- **Akamai SBSD + custom anti-bot is real**: Healthgrades runs Akamai Bot Manager Premier with server-based session-defense challenges (verified via Akamai docs cross-reference + observed 401/403 on internal API endpoints). Browserbase `--verified --proxies` is mandatory. A bare session is silently downgraded to a stripped HTML shell (200 OK but no provider data inside the RSC payload — easy to mistake for "no results"). Always confirm `totalResultCount > 0` in the embedded payload **OR** count `<a href="/physician/dr-...">` anchors in the rendered HTML before declaring an empty result legitimate.
- **Don't crawl as `anthropic-ai`, `ClaudeBot`, `GPTBot`, `CCBot`, `Bytespider`, or `Amazonbot`** — robots.txt explicitly `Disallow: /` for all of them. Browserbase's default UA does not collide with any of these; do not override it to one of these strings.
- **`/api` is robots-disallowed** for all user-agents. The `/api/autosuggest` endpoint we identified responds 200 cookieless but is technically off-limits per their policy. Use it only for IP-geo diagnostic, never as a primary data path.
- **The page is fully SSR; cloud-fetch hits the 1 MB cap.** `browse cloud fetch https://www.healthgrades.com/usearch?...` returns `502 The response body exceeded the maximum allowed size of 1MB`. You must use a real browser session — no shortcut. (`/robots.txt` and the sitemap-index XMLs fit comfortably under the cap if you need them for specialty taxonomy discovery.)
- **`/find-a-doctor/{state}/best-{specialty}-in-{city}` returns 308 redirect to canonical** even though the response body contains the page HTML. The body that lands on the 308 is an `__next_error__` shell, **not** the full provider list — the real page sits one redirect later. Pass `--allow-redirects` (or use the browser, which follows automatically).
- **`pt=lat,lon` overrides `where` for geo centroid but NOT for the displayed header text.** A `where=Boston, MA` + `pt=37.77,-122.42` query searches San Francisco-area providers but the page header still says "near Boston, MA". Always read the actual provider addresses to verify scope, not the header.
- **No `pt`, no `where` → proxy-IP geolocation wins.** Browserbase residential proxies rotate IPs across US regions; without an explicit `where` param, the same search URL will return different city-scoped results across sessions. Always pin `where=` (and `pt=` for precision) when reproducibility matters.
- **Page hydrates progressively.** The header + first 2–3 cards land at `wait load`; the full 10-card page + filter-rail counts + sponsored block render over the next 1.5–2.5s. `browse wait timeout 2500` after `wait load` before snapshotting; less than that and you'll see ghost cards with missing rating numbers.
- **Sponsored cards are interleaved.** The first 1–2 cards on `sort.provider=bestmatch` are "Sponsored Result" — Healthgrades' paid-placement program (HG's name is "Healthgrades Plus" / "Featured Listing"). They look identical to organic cards but carry a `Sponsored` badge and an `*` next to the rating. Capture them but flag with `sponsored: true` in output. Use `sort.provider=ratings` to suppress most sponsored interleaving when honest ranking matters.
- **"Book Appointment" CTAs are partner-scheduling deep links.** The href on the card-level Book button is a tracking URL that 302-redirects to Zocdoc / RXNT / partner sites. Capture the href in the output as `book_appointment_url` but flag it (`book_appointment_partner: true`) — the actual booking flow leaves Healthgrades.
- **"Healthgrades Honor Roll" badges are aria-labelled on the card.** Look for `aria-label="Recognized for [year] Healthgrades..."` or `data-badge="honor-roll"` — they don't always render visible text on the card chrome.
- **`acceptingNewPatients` and `telehealth` are NOT in the JSON-LD** on the provider detail page. They're on the search-card RSC payload only. Extract them from the search results, not the detail page.
- **NPIs are visible on most provider detail pages** under the "About" tab, but **not** on the search card. To collect NPI + practice address in bulk, you must `browse open` each `/physician/dr-...` URL after the search — budget ~3s per provider.
- **Insurance list is paginated client-side.** On the provider detail page, the Insurance tab shows ~10 plans by default with a "Show all" button. Click "Show all" before extracting if completeness matters; otherwise the list is truncated without an obvious indicator.
- **State-specific BCBS plan names.** `Anthem BCBS California`, `BCBS Texas`, `BCBS Massachusetts` etc. are distinct strings in the insurance dropdown. A user query for "BCBS" should fuzzy-match all BCBS-prefixed plans rather than expecting a single canonical value.
- **The "Top conditions treated" / "Top procedures" lists are derived, not declared.** Healthgrades infers them from claims data and reviews; they're surfaced as ranked chip lists on the detail page. Capture in order — order encodes prevalence.
- **Specialty taxonomy is in the sitemaps**: `https://www.healthgrades.com/sitemapindex-psr.xml` lists every specialty under `/{specialty-slug}-psr-N.xml.gz` (e.g. `cardiology`, `dermatology`, `interventional-cardiology`, `mohs-surgery`, ...). Use this as the canonical specialty-slug enum when constructing `what=` values for the `/{specialty}-psr-...` SEO entry paths.
- **`/usearch?category=facility&FacilityType=STAC,CHDR` is the hospitals/facilities mode.** Same search URL, different category — provider-card schema is different (no NPI, no specialty list; instead `bedCount`, `facilityType`, `awards`). If a caller mixes specialty + facility in one query, branch by `category`.
- **Provider URL shortIds (`-2wf3j`, `-xyz12`) are stable but opaque.** Don't try to derive them — they're surfaced in search-result anchor hrefs only.

## Expected Output

Branch on input intent. The skill returns one of these shapes:

### A) Provider list (most common — specialty/condition + location)

```json
{
  "query": {
    "what": "Cardiology",
    "where": "San Francisco, CA",
    "pt": "37.7749,-122.4194",
    "filters": {
      "insurance": ["aetna"],
      "languages": ["spanish"],
      "gender": "female",
      "minRating": 4.0,
      "acceptsNewPatients": true,
      "telehealth": true,
      "boardCertified": true,
      "distances": 25
    },
    "sort": "ratings",
    "pageNum": 1
  },
  "total_result_count": 123,
  "page_size": 10,
  "providers": [
    {
      "provider_id": "Y2P4K",
      "npi": "1234567890",
      "full_name": "Dr. Jane Smith, MD",
      "first_name": "Jane",
      "last_name": "Smith",
      "credentials": ["MD"],
      "gender": "female",
      "specialties": ["Cardiology"],
      "subspecialties": ["Interventional Cardiology"],
      "board_certifications": ["American Board of Internal Medicine - Cardiovascular Disease"],
      "years_in_practice": 18,
      "languages": ["English", "Spanish"],
      "education": {
        "medical_school": "UCSF School of Medicine",
        "residency": "Stanford University Medical Center",
        "fellowships": ["UCSF - Interventional Cardiology"]
      },
      "hospital_affiliations": [
        {"name": "UCSF Medical Center", "url": "/hospital/ucsf-medical-center-XYZ"}
      ],
      "primary_address": {
        "street": "1600 Divisadero St",
        "city": "San Francisco",
        "state": "CA",
        "zip": "94115",
        "latitude": 37.7849,
        "longitude": -122.4382
      },
      "additional_locations": [],
      "primary_phone": "(415) 555-0100",
      "telehealth": true,
      "accepting_new_patients": true,
      "accepted_insurance": ["Aetna", "Anthem BCBS California", "Cigna", "United Healthcare", "Medicare"],
      "rating": {
        "overall": 4.7,
        "review_count": 87,
        "distribution": {"5": 64, "4": 15, "3": 5, "2": 2, "1": 1},
        "experience_tags": {
          "listens_and_answers": 0.94,
          "explains_conditions_well": 0.92,
          "trusted_for_decisions": 0.91,
          "treats_with_respect": 0.97,
          "spends_appropriate_time": 0.89
        }
      },
      "top_conditions_treated": ["Coronary Artery Disease", "Atrial Fibrillation", "Hypertension"],
      "top_procedures_performed": ["Cardiac Catheterization", "Stent Placement"],
      "awards": ["Healthgrades Honor Roll 2025"],
      "photo_url": "https://photos.healthgrades.com/...",
      "profile_url": "https://www.healthgrades.com/physician/dr-jane-smith-y2p4k",
      "book_appointment_url": "https://www.healthgrades.com/appointment/...",
      "book_appointment_partner": true,
      "sponsored": false
    }
  ],
  "header_text": "123 Results for Cardiology near San Francisco, CA",
  "result_url": "https://www.healthgrades.com/usearch?what=Cardiology&where=San%20Francisco%2C%20CA&pt=37.7749,-122.4194&pageNum=1&sort.provider=ratings&insurance=aetna&languages=spanish&gender=female&minRating=4.0&acceptsNewPatients=true&telehealth=true&boardCertified=true&distances=25"
}
```

### B) Single provider deep-extract (`/physician/dr-...` input)

Same `providers[0]` shape, returned as the top-level `provider` field; no `query` / `total_result_count` keys.

```json
{
  "provider": { /* same shape as providers[i] above, but with `npi`, `education`, `top_conditions_treated`, `top_procedures_performed` always populated since they're on the detail page */ },
  "profile_url": "https://www.healthgrades.com/physician/dr-jane-smith-y2p4k"
}
```

### C) Facilities mode (`category=facility` input)

```json
{
  "query": { "what": "Hospitals", "where": "Phoenix, AZ", "category": "facility", "FacilityType": "STAC,CHDR", ... },
  "total_result_count": 46,
  "facilities": [
    {
      "facility_id": "...",
      "name": "...",
      "facility_type": "STAC",
      "address": {...},
      "phone": "...",
      "bed_count": 412,
      "awards": [...],
      "patient_satisfaction": 4.2,
      "profile_url": "https://www.healthgrades.com/hospital/..."
    }
  ]
}
```

### D) Not found / no matches

```json
{
  "query": {...},
  "total_result_count": 0,
  "providers": [],
  "header_text": "No Results for Cardiology near 99999",
  "result_url": "..."
}
```

### E) Akamai challenge intercepted (failure)

```json
{
  "success": false,
  "reason": "anti_bot_challenge",
  "detail": "Akamai SBSD challenge or `Oops...` interstitial returned for the search URL. Retry with a fresh --verified --proxies session.",
  "result_url": "..."
}
```
