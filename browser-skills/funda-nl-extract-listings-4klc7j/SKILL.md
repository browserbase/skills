---
name: funda-nl-extract-listings-4klc7j
title: Funda Search Listings
description: >-
  Search Funda for Dutch residential listings (koop/huur) by free-form location,
  structured filter URL, or single listing/broker URL. Returns normalised JSON
  per listing — price + history, address, neighbourhood, energy label, area,
  rooms, build year, agent, photos, VvE, and status. Distinguishes results,
  zero_results, location_unparseable, listing_not_found, bot_block, paywalled,
  and fundainbusiness out-of-scope outcomes.
website: funda.nl
category: real-estate
tags:
  - real-estate
  - netherlands
  - listings
  - search
  - akamai
  - read-only
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: browser
alternative_methods:
  - method: hybrid
    rationale: >-
      Search-result pages and detail pages both expose server-rendered JSON-LD
      (ItemList + Product/BreadcrumbList) — browse cloud fetch --proxies returns
      these directly without full page-load. Use Fetch for cheap URL-list
      extraction and only spin up a remote session when the rendered H1
      result-count or the <dl> kenmerken table is needed.
  - method: api
    rationale: >-
      No public JSON API. Confirmed unreachable: the Pinia/Nuxt hydration
      payload is positional-array encoded with numeric label offsets and
      internal AJAX endpoints require an authenticated bm_sc cookie. Don't waste
      iterations trying to reverse-engineer it — the rendered DOM is cheaper and
      more reliable.
verified: true
proxies: true
---
# Funda Search Listings — Browser Skill

## Purpose

Search Funda for Dutch residential property listings (te koop / te huur) and return normalised JSON per listing — price + price history, address, neighbourhood, energy label, living and plot area, rooms/bedrooms, build year, agent/makelaar, photos, floorplans, VvE data, status (Beschikbaar / Onder bod / Verkocht / Verhuurd), and source URL. Accepts three input shapes:

1. **Free-form location query** (`"Amsterdam"`, `"Amsterdam, +5km"`, `"Utrecht centrum"`)
2. **Pre-built structured filter URL** (`https://www.funda.nl/zoeken/koop?…`)
3. **Single listing URL** (`https://www.funda.nl/detail/koop/…`) or broker URL (`https://www.funda.nl/makelaar/{id}/`)

Read-only. Never bids, never submits contact / bezichtigingsaanvraag forms, never saves to a Funda account.

## When to Use

- Daily property monitoring in a given gemeente, postcode, or neighbourhood.
- Comparison shopping across koop vs. huur, energy labels, price bands.
- Bulk extraction of a makelaar's huidig aanbod or recent verkochte transacties.
- Resolving a single Funda link a user pasted into a chat.

## Workflow

The fast path is **URL construction + structured-data extraction**, not interactive form-filling. Funda's `/zoeken/{koop|huur}` page accepts the full filter surface as URL parameters, exposes 15 listing URLs per page in a server-rendered `<script type="application/ld+json" data-hid="result-list-metadata">` block, and every detail page ships JSON-LD `Product` + a clean `<dl><dt>/<dd>` kenmerken table. No GraphQL / private JSON API is reachable from a cookieless session — Funda is built on Nuxt + Pinia and the hydration payload is positional-array-encoded (every label is a numeric index into a shared string pool), so decoding it is harder than just reading the rendered DOM.

Stealth + residential proxy is **mandatory** — Funda fronts everything behind Akamai Bot Manager. A bare session gets a `bm_sc` challenge and never receives full HTML. With `--proxies --verified` the Browserbase Fetch API alone reliably returns 200 on `/robots.txt`, `/zoeken/`, `/detail/` and `/makelaar/{id}/`.

### 1. Stealth + residential-proxy session

```bash
SID=$(browse cloud sessions create --keep-alive --proxies --verified \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$SID"
```

For pure HTML reads (no JS hydration needed for the JSON-LD payload) `browse cloud fetch <url> --proxies` is ~3× cheaper than a full page-load session. Use `browse open --remote` only when you need the H1 result-count (rendered client-side) or the rendered kenmerken `<dl>` table.

### 2. Classify the input

| Input shape | Routing |
|---|---|
| URL starts with `https://www.funda.nl/zoeken/` | **structured-search path** — go to step 4 |
| URL starts with `https://www.funda.nl/detail/` | **single-listing path** — go to step 6 |
| URL starts with `https://www.funda.nl/makelaar/` | **broker path** — go to step 7 |
| URL starts with `https://www.fundainbusiness.nl/` | **out of scope** — emit `{"error":"out_of_scope","domain":"fundainbusiness.nl","suggestion":"Use a separate funda-business skill for commercial listings"}` and stop |
| Free-form location string | **location-resolution path** — go to step 3 |

### 3. Build the search URL from the free-form query + filters

Base path:
- Koop: `https://www.funda.nl/zoeken/koop`
- Huur: `https://www.funda.nl/zoeken/huur`

Query parameter shape (each value is **double-quoted inside the URL-encoded JSON-array literal** — yes, this is Funda's actual format):

| Filter | Parameter | Example URL-encoded value | Notes |
|---|---|---|---|
| Location | `selected_area` | `["amsterdam"]` → `%5B%22amsterdam%22%5D` | Lowercase gemeente/city slug. **Multi-location combos are robots-disallowed** (`/zoeken/koop/*,*` — keep it to one area at a time). |
| Location + radius | `selected_area` | `["amsterdam,+5km"]` → `%5B%22amsterdam%2C%2B5km%22%5D` | The `,+Nkm` suffix is part of the same array element, not a separate param. Allowed radii: 0, 1, 2, 3, 5, 10, 15, 25, 30, 50 km. |
| Postcode-prefix | `selected_area` | `["1011"]` → `%5B%221011%22%5D` | First four digits of NL postcode. |
| Neighbourhood | `selected_area` | `["amsterdam/jordaan"]` | `{city}/{buurt-slug}` path inside the array. |
| Price range | `price` | `"500000-1000000"` → `%22500000-1000000%22` | EUR. Open-ended: `"500000-"` or `"-1000000"`. |
| Object type | `object_type` | `["house"]`, `["apartment"]`, `["parking"]`, `["land"]` | Lowercase English literals. |
| House sub-type (woningtype) | `house_type` | `["semi-detached_house"]`, `["detached_house"]`, `["town_house"]` | Only meaningful when `object_type=["house"]`. |
| Living area (m²) | `floor_area` | `"80-150"` → `%2280-150%22` | `floor_area` not `living_area`. |
| Plot area (m²) | `plot_area` | `"200-"` | Land surface, koop only. |
| Rooms | `rooms` | `"3-"` | Total rooms. |
| Bedrooms | `bedrooms` | `"2-"` | |
| Energy label | `energy_label` | `["A","B"]` → `%5B%22A%22%2C%22B%22%5D` | Values: `"A+++++"`–`"A+"`, `"A"`–`"G"`. |
| Build period | `construction_period` | `["after_2000"]`, `["1900_to_1930"]` | Underscore-separated periods. |
| New-construction flag | `construction_type` | `["newly_built"]` or `["existing"]` | |
| Garden orientation | `exterior_space_garden_orientation` | `["south","west"]` | Lowercase English compass. |
| Availability / status | `availability` | `["available"]`, `["negotiations"]`, `["unavailable"]` | `unavailable` = verkocht/verhuurd. |
| Sort | `sort` | `"date_down"`, `"price_up"`, `"price_down"`, `"floor_area_down"` | |
| Pagination | `search_result` | `2`, `3`, … | 15 results per page. Over-paginating silently returns the last valid page with H1 unchanged. |

Construct the URL, then `browse cloud fetch <url> --proxies` (cheap) or `browse open <url> --remote --session "$SID"` + `wait load` + `wait timeout 2500` (when you need rendered totals).

**Verify location parsed correctly before extracting results** — see *location_unparseable* in Site-Specific Gotchas.

### 4. Extract listings from the search page

Read the JSON-LD block:

```bash
browse eval 'document.querySelector("script[data-hid=\"result-list-metadata\"]").textContent' \
  --remote --session "$SID"
```

The block parses as:

```json
{
  "@type": ["ItemList", "WebPage"],
  "url": "https://www.funda.nl/zoeken/koop?selected_area=[\"amsterdam\"]",
  "itemListElement": [
    {"@type":"ListItem","position":1,"url":"https://www.funda.nl/detail/koop/amsterdam/appartement-...-2-t/44451286/"},
    …  // exactly 15 entries on a non-final page
  ]
}
```

For result counts and metadata not in JSON-LD, read the rendered H1:

```bash
browse eval 'document.querySelector("h1")?.textContent.trim()' --remote --session "$SID"
# → "331 koopwoningen in Amsterdam"   (filtered total)
# → "0 koopwoningen binnen jouw zoekwensen in Amsterdam"   (zero results, area valid)
# → "0 koopwoningen binnen jouw zoekwensen op Funda"   (location_unparseable — selected_area was silently dropped)
```

If you need each listing's pre-fetched card data (price label, rough address, makelaar) without 15 follow-up requests, scrape it off the cards by anchor pattern instead of selector class (the Tailwind hashes rotate):

```js
const cards = Array.from(document.querySelectorAll('a[href*="/detail/koop/"]'))
  .map(a => a.closest('article, li, div[class*="rounded"]'))
  .filter(Boolean);
```

For full fidelity (price history, VvE, energy validity, floorplans) you have to open each detail page — step 6.

### 5. Paginate

Add `search_result=N` for page N. Stop when `JSON.parse(jsonLd).itemListElement.length < 15` OR when `H1` count is reached. **Funda silently floors over-paginated requests to the last valid page** with the H1 text unchanged — always also check `itemListElement.length` to detect end-of-results.

### 6. Extract a single listing detail page

```bash
browse open "https://www.funda.nl/detail/koop/{city}/{slug}/{listingId}/" --remote --session "$SID"
browse wait load --remote --session "$SID"
browse wait timeout 2500 --remote --session "$SID"
```

Read three data sources and merge:

**Source A: JSON-LD Product** — `script[type="application/ld+json"]` (first one, not `BreadcrumbList`):

```json
{
  "@type": ["Appartement","Product"],
  "url": "...",
  "name": "Van Leijenberghlaan 2-T",
  "address": {"streetAddress":"Van Leijenberghlaan 2-T","addressLocality":"Amsterdam","addressRegion":"Noord-Holland"},
  "offers": {"@type":"Offer","priceCurrency":"EUR","price":800000},
  "photo": [{"contentUrl":"https://cloud.funda.nl/valentina_media/.../564_1440x960.jpg"}, …]
}
```

**Source B: BreadcrumbList JSON-LD** — gives the neighbourhood (third `<ListItem>`) and a canonical `selected_area` deep-link for the buurt:

```json
{"position":3,"item":{"@id":"https://www.funda.nl/zoeken/koop?selected_area=[\"amsterdam/gelderlandpleinbuurt\"]","name":"Gelderlandpleinbuurt"}}
```

**Source C: Rendered `<dl>` kenmerken table** — the full Dutch labels. Parse every `<dl>` on the page; for each, zip `dt`→`dd`:

```js
const kk = {};
document.querySelectorAll('dl').forEach(d => {
  const dts = d.querySelectorAll('dt'); const dds = d.querySelectorAll('dd');
  for (let i=0; i<Math.min(dts.length, dds.length); i++) {
    kk[dts[i].textContent.trim()] = dds[i].textContent.trim().replace(/\s+/g,' ');
  }
});
```

Field mapping (observed, not exhaustive):

| Dutch label | Output field | Parse hint |
|---|---|---|
| `Vraagprijs` | `price.asking_eur` | `"€ 800.000 kosten koper"` → strip `€`, dots, suffix |
| `Vraagprijs per m²` | `price.per_m2_eur` | |
| `Laatste vraagprijs` | `price.last_asking_eur` | Appears on sold/verkocht only |
| `Status` | `status` | One of `Beschikbaar` / `Onder bod` / `Verkocht` / `Verhuurd` |
| `Aangeboden sinds` | `offered_since` | `"20 april 2026"` — **paywalled on live listings**, emit `null` if value is `"Log in om te bekijken"` |
| `Verkoopdatum` | `sold_date` | Sold only |
| `Looptijd` | `time_on_market` | Sold only |
| `Wonen` | `area.living_m2` | `"117 m²"` → 117 |
| `Perceeloppervlakte` | `area.plot_m2` | Houses with land |
| `Externe bergruimte` | `area.storage_m2` | |
| `Inhoud` | `area.volume_m3` | `"352 m³"` |
| `Aantal kamers` | `rooms.total` / `rooms.bedrooms` | `"3 kamers (2 slaapkamers)"` — regex out both numbers |
| `Aantal badkamers` | `rooms.bathrooms` | |
| `Bouwjaar` | `build_year` | int |
| `Soort bouw` | `build_type` | `"Bestaande bouw"` / `"Nieuwbouw"` |
| `Energielabel` | `energy.label` | Just the letter — validity date is separate, see gotcha |
| `Isolatie` | `energy.insulation` | |
| `Verwarming` | `energy.heating` | |
| `Eigendomssituatie` | `ownership` | Detects `erfpacht` (leasehold) here |
| `Lasten` | `ownership_costs` | erfpacht canon date |
| `Bijdrage VvE` | `vve.monthly_eur` | `"€ 358,79 per maand"` |
| `Inschrijving KvK` / `Reservefonds aanwezig` / `Onderhoudsplan` / `Opstalverzekering` / `Jaarlijkse vergadering` / `Periodieke bijdrage` | `vve.{flags}` | All `Ja`/`Nee` |
| Breadcrumb position 3 | `neighbourhood.name` + `neighbourhood.url` | From Source B |

**Agent / makelaar:** scrape the `<a href="https://www.funda.nl/makelaar/{id}">` link in the agent block — it's the only stable selector. Capture both the numeric ID and the rendered name.

**Floorplans + photos beyond what JSON-LD lists:** the JSON-LD `photo[]` usually covers the gallery, but floorplans live under `/media/plattegrond/` — read by `Array.from(document.querySelectorAll('a[href*="plattegrond"], img[src*="plattegrond"]'))`.

**Bouwnummer / nieuwbouw projects:** detect by `bouwnr-{N}` segment in URL slug (e.g. `huis-vrijstaand-dijck-bouwnr-3`). When present, emit as a project-level record with a `units[]` array. Sibling units are not linked from the page — derive them by stripping `-bouwnr-{N}` from the slug and re-searching that prefix on the city's `/zoeken/koop?` results.

### 7. Broker / makelaar URL

```bash
browse open "https://www.funda.nl/makelaar/{id}/" --remote --session "$SID"
```

H1 = makelaar name. The current aanbod is loaded into client-side tabs (`Aanbod` / `Verkocht` / `Verhuurd`) — listing anchors are rendered as `a[href*="/detail/"]` inside each tab's panel. Skip if not the primary use case; the marketplace expects the detail-page flow.

Note: the legacy `/makelaars/{city}/{id}-{name}/` URL form returns 404 — Funda has consolidated to `/makelaar/{id}/`. The `/makelaars/` plural is now only used inside breadcrumbs and as a region landing (e.g. `/makelaars/amsterdam/` redirects to `/makelaar-zoeken/zoek/amsterdam/`).

### 8. Release the session

```bash
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

## Site-Specific Gotchas

- **Stealth + residential proxy is mandatory.** `--proxies --verified` on the session (or `--proxies` on `browse cloud fetch`) is required. A bare session bounces off Akamai's `bm_sc` challenge and never gets to the JSON-LD block. `bot_block` outcome shape is reserved for the case where even stealth+proxy returns the Akamai challenge HTML — verify by grepping the response for `bm-verify` / `bm_sc` cookies + `<title>` containing `"Access Denied"`.
- **`selected_area` is silently dropped on unparseable locations.** If you POST a string Funda doesn't recognise as a gemeente/postcode/buurt, it strips the param and returns the country-wide page — URL after navigation rewrites to `/zoeken/koop` (no `selected_area=`) and H1 reads `"X koopwoningen binnen jouw zoekwensen op Funda"` (note `op Funda`, not `in {city}`). **Always verify the navigated URL still contains `selected_area=` and the H1 contains `" in "` before emitting results** — otherwise emit `{"outcome":"location_unparseable"}`. Differentiate from `zero_results`: zero-results retains `selected_area` in the URL and `" in {city}"` in the H1.
- **Multi-area combos are robots-disallowed.** `robots.txt` disallows `/zoeken/koop/*,*` and `/zoeken/huur/*,*` (multiple comma-separated areas in the path). Stick to one `selected_area` entry at a time — combine results client-side if needed.
- **Pagination over-flows silently.** Requesting `search_result=999` on a 22-result search returns the last valid page with H1 unchanged. Always also check `itemListElement.length < 15` to know you're past the end.
- **JSON-LD ItemList is exactly 15 entries per page** — non-final pages are 15, final page is whatever's left. Both robots-allowed `/zoeken/` paths (koop and huur) expose the same `data-hid="result-list-metadata"` script.
- **`Aangeboden sinds` is paywalled on live listings.** The value `"Log in om te bekijken"` is Funda Pro gating — emit `offered_since: null` and don't try to scrape it from elsewhere on the page. Sold/verkocht listings render the actual date (because the privacy reason is gone).
- **`Status` enum is rendered, not class-named.** Read the `<dd>` value of the `<dt>Status</dt>` row, not a CSS class or badge. Observed values: `Beschikbaar`, `Onder bod`, `Verkocht`, `Verhuurd`, and (for new construction) `Beschikbaar voor inschrijving`.
- **The hydration payload is intentionally hostile.** Funda ships a Pinia/Nuxt payload where every kenmerk label is a numeric offset into a shared string pool (`"energielabel":402` etc.) — don't try to decode it. The rendered `<dl>` is the authoritative source for kenmerken values; the JSON-LD blocks are the authoritative source for price + identity + photos.
- **No reachable GraphQL / private JSON.** Multiple probes confirm Funda does not expose a cookieless JSON list endpoint analogous to Craigslist's `sapi.craigslist.org`. The `bm_sc`-cookied AJAX endpoints (`/admin/`, `/internal/`) return 401 without an authenticated session and are not worth pursuing.
- **Tailwind class names rotate.** Don't pin selectors to `flex max-w-[243px] min-w-[232px]` etc.; the build hash changes per release. Pin instead to data anchors (`a[href*="/detail/koop/"]`) and semantic landmarks (`h1`, `dl`, `dt`, `dd`, `script[data-hid="result-list-metadata"]`).
- **Title is reliable for navigation state, not for content.** `document.title` is updated client-side post-hydration to include the locality (`"Koopwoningen Amsterdam - huizen te koop in Amsterdam | Funda"`). The pre-hydration SSR title is blank-cityed (`"Koopwoningen  - huizen te koop in  | Funda"`) and shows up if you read via `browse cloud fetch` instead of `browse open` + `wait load`.
- **Detail URLs hold long-lived numeric IDs.** The 8-digit listingId at the end of the path is the stable identifier across slug changes. Cache by listingId, not by full URL.
- **Listing-not-found is a hard 404.** Both via `browse cloud fetch` (`"statusCode": 404`) and `browse open` (H1 = `"Deze pagina kunnen we niet vinden"`, page title = `"Deze pagina kunnen we niet vinden | Funda"`). Emit `{"outcome":"listing_not_found","listingId":"..."}`.
- **fundainbusiness.nl is a separate site.** Commercial listings live at `https://www.fundainbusiness.nl/` with a completely different layout, a different 404 title (`"Pagina niet gevonden - funda in business"`), and is explicitly out of scope. Detect by hostname and emit the structured `out_of_scope` error in the schema below — do not attempt the same scrape pattern, it will not work.
- **`/makelaars/{city}/{id}-{name}/` is dead.** Consolidated to `/makelaar/{id}/`. The `/makelaars/{city}/` plural URL 301s to `/makelaar-zoeken/zoek/{city}/` (a search-form page, not a listing). The numeric ID without trailing slug works (`/makelaar/24697` → 301 → `/makelaar/24697/`).
- **Cookie-consent dialog is annoying but non-blocking.** The `dialog: Welkom bij Funda Toestemmingsbeheer` overlay appears on every fresh session but does not gate the underlying JSON-LD or rendered HTML — you can read everything without clicking through it. Don't waste turns dismissing it.
- **Energy-label validity date is not in the kenmerken `<dl>`.** Funda renders the label letter with a small `Wat betekent dit?` tooltip but the explicit `geldig tot` date is inside the Pinia payload under `EnergyData` — unreachable from cookieless scrape. Emit `energy.valid_until: null`.
- **Photos URLs come in two CDN-resized variants.** JSON-LD `photo[].contentUrl` is `https://cloud.funda.nl/valentina_media/{a}/{b}/{c}_1440x960.jpg`. Strip `_1440x960` for the original-size variant if needed (other observed: `_720x480`, `_360x240`).
- **Bouwnummer URL slug pattern.** New-construction project units carry `-bouwnr-{N}` in the slug (e.g. `huis-vrijstaand-dijck-bouwnr-3`). The bouwnummer detail page contains the kenmerk `Soort bouw: Nieuwbouw` and references `nieuwbouwproject` in body text, but does *not* link to a project-aggregate URL — sibling units must be discovered by re-querying the city's listings with the slug prefix.

## Expected Output

Six distinct outcome shapes. Always include a top-level `outcome` discriminator.

```json
// results — search returned 1..N listings
{
  "outcome": "results",
  "query": { "location": "Amsterdam", "filters": { "price": "500000-1000000", "object_type": "house" } },
  "url": "https://www.funda.nl/zoeken/koop?selected_area=%5B%22amsterdam%22%5D&price=%22500000-1000000%22&object_type=%5B%22house%22%5D",
  "total_results": 331,
  "page": 1,
  "results_per_page": 15,
  "listings": [
    {
      "listing_id": "44451286",
      "deal_type": "koop",
      "url": "https://www.funda.nl/detail/koop/amsterdam/appartement-van-leijenberghlaan-2-t/44451286/",
      "address": {
        "street": "Van Leijenberghlaan 2-T",
        "postcode": "1082 GM",
        "city": "Amsterdam",
        "region": "Noord-Holland"
      },
      "neighbourhood": {
        "name": "Gelderlandpleinbuurt",
        "url": "https://www.funda.nl/zoeken/koop?selected_area=%5B%22amsterdam/gelderlandpleinbuurt%22%5D"
      },
      "object_type": "appartement",
      "object_subtype": "Bovenwoning",
      "status": "Beschikbaar",
      "price": {
        "asking_eur": 800000,
        "per_m2_eur": 6838,
        "kind": "kosten koper",
        "last_asking_eur": null,
        "history": []
      },
      "area": { "living_m2": 117, "plot_m2": null, "storage_m2": 17, "volume_m3": 352 },
      "rooms": { "total": 3, "bedrooms": 2, "bathrooms": 1 },
      "build": { "year": 2004, "type": "Bestaande bouw" },
      "energy": { "label": "A+", "insulation": "Volledig geïsoleerd", "heating": "Cv-ketel", "valid_until": null },
      "ownership": { "kind": "erfpacht", "details": "Gemeentelijk eigendom belast met erfpacht", "end_date": "2053-01-31", "buyout_status": "Afgekocht tot 31-01-2053" },
      "vve": { "monthly_eur": 358.79, "kvk_registered": true, "reserve_fund": true, "maintenance_plan": true, "building_insurance": true, "annual_meeting": true },
      "agent": { "id": "24697", "name": "Lunshof Makelaardij Amsterdam", "url": "https://www.funda.nl/makelaar/24697/" },
      "photos": ["https://cloud.funda.nl/valentina_media/229/046/564_1440x960.jpg", "..."],
      "floorplans": [],
      "offered_since": null,
      "is_new_construction": false,
      "project": null
    }
  ]
}

// zero_results — filters parsed correctly but matched 0 listings
{
  "outcome": "zero_results",
  "query": { "location": "Amsterdam", "filters": { "price": "1-50000", "floor_area": "1000-" } },
  "url": "https://www.funda.nl/zoeken/koop?...",
  "total_results": 0,
  "h1": "0 koopwoningen binnen jouw zoekwensen in Amsterdam"
}

// location_unparseable — selected_area was silently dropped
{
  "outcome": "location_unparseable",
  "query": { "location": "zzzzzzfakecity_xyz999" },
  "navigated_url": "https://www.funda.nl/zoeken/koop",
  "h1": "0 koopwoningen binnen jouw zoekwensen op Funda",
  "hint": "Funda dropped selected_area from the URL; the query string does not match a known gemeente, postcode prefix, or neighbourhood slug."
}

// listing_not_found — direct /detail/ URL 404s
{
  "outcome": "listing_not_found",
  "url": "https://www.funda.nl/detail/koop/amsterdam/appartement-doesnotexist-9999/99999999/",
  "listing_id": "99999999",
  "h1": "Deze pagina kunnen we niet vinden",
  "status_code": 404
}

// bot_block — Akamai challenge persists despite stealth+proxy
{
  "outcome": "bot_block",
  "url": "...",
  "evidence": { "title": "Access Denied", "cookies": ["bm_sc", "bm-verify"] },
  "retry_after_seconds": 60
}

// paywalled — entire listing is gated behind Funda Pro login (rare; field-level paywalling is silent — see gotchas)
{
  "outcome": "paywalled",
  "url": "...",
  "listing_id": "...",
  "hint": "Funda Pro required for this surface; partial data may still be present in JSON-LD."
}

// out_of_scope — fundainbusiness.nl handler
{
  "outcome": "out_of_scope",
  "domain": "fundainbusiness.nl",
  "url": "...",
  "suggestion": "Use a separate funda_business skill for commercial listings."
}
```

Nieuwbouw projects emit a `project` block on each unit and an `is_new_construction: true` flag; when explicitly searched at the project level, aggregate as:

```json
{
  "outcome": "results",
  "project": {
    "name": "Vrijstaand - Dijck",
    "city": "Driebruggen",
    "units": [
      { "listing_id": "43353325", "bouwnummer": 3, "url": "...", "price": {...}, "status": "Beschikbaar" },
      { "listing_id": "43353323", "bouwnummer": 2, "url": "...", "price": {...}, "status": "Verkocht" }
    ]
  }
}
```
