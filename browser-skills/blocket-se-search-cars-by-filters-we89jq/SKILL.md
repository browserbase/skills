---
name: blocket-se-search-cars-by-filters-we89jq
title: Blocket Car Search by Filters
description: >-
  Search Blocket.se for cars matching user-supplied filters — make, model, price
  range, year, mileage, fuel, transmission, body type, region, equipment,
  dealer-vs-private — and return matching listings with full per-car metadata.
  Read-only; uses Blocket's public JSON API.
website: blocket.se
category: marketplace
tags:
  - cars
  - marketplace
  - sweden
  - blocket
  - automotive
  - search
source: 'browserbase: agent-runtime 2026-05-22'
updated: '2026-05-22'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      When the JSON API is unavailable (rare — no auth, no anti-bot, no cookies
      needed today), fall back to the human-facing /mobility/search/car page
      with the same URL filter params. Identical data shape (the page hydrates
      from the same /api/search/SEARCH_ID_CAR_USED endpoint) but ~30× slower
      wall-clock due to React hydration and ad-stack noise.
verified: false
proxies: false
---
# Blocket Car Search by Filters

## Purpose

Search Sweden's largest classifieds site, Blocket, for used / new / leasing cars matching user-supplied filters — make, model, price range, model year, mileage, fuel type, transmission, body type, region, equipment, dealer-vs-private, colour, free-text query — and return the matching listings with full per-car metadata (make / model / model spec, year, mileage, price in SEK, fuel, transmission, dealer segment, registration number, VIN, location with lat/lon, dealer name, canonical URL, image URL, posting timestamp). Read-only — never opens listings, contacts sellers, or submits saved-search alerts.

## When to Use

- "Find me used Volvos in the 150,000–300,000 kr range from 2018 or later under 8,000 mil."
- Daily / hourly monitoring of new listings matching saved search criteria.
- Cross-region market analysis (price-per-year curves, supply by län/region).
- Anywhere a user wants to filter Blocket's `/mobility/search/car` UI by structured criteria, including drilling down to specific series (e.g. Volvo V60-Serie) or specific models (e.g. Audi A4 Avant).

## Workflow

Blocket's React app is a thin client over a **public JSON API** at `https://www.blocket.se/mobility/search/api/search/SEARCH_ID_CAR_USED` — no auth, no cookies, no anti-bot, no residential proxy required. Direct `browse cloud fetch` returns 200 with the full result set including a complete enum-of-filters block. Lead with the API path; the browser path is a slow, identical-data fallback (you'd be parsing the same JSON the page hydrates from). Both `--verified` and `--proxies` flags are unnecessary for the API.

### 1. Map user-supplied filter inputs to Blocket's parameter schema

| User input | URL parameter | Value format | Notes |
|---|---|---|---|
| make (single or multi) | `variant` | `0.{brandId}` | Repeat `&variant=` for multi-make. **See brand→id table in Site-Specific Gotchas.** |
| series within make | `variant` | `1.{brandId}.{seriesId}` | E.g. Volvo V60-Serie = `1.818.2843` |
| specific model | `variant` | `2.{brandId}.{seriesId}.{modelId}` | E.g. Abarth 595 = `2.8093.2476.2000413` |
| min/max price (SEK) | `price_from` / `price_to` | integer | Slider step 10000, max 700000 (700k+) |
| min/max model year | `year_from` / `year_to` | integer | Range 1950–2027, includes future model years |
| min/max mileage | `mileage_from` / `mileage_to` | integer in **mil** (Swedish miles) | **1 mil = 10 km** — pre-convert km÷10 |
| fuel type | `fuel` | integer enum | 1=Bensin, 2=Diesel, 4=El, 2441=Etanol (FFV), 3=Fordonsgas (CNG); more for hybrids |
| transmission | `transmission` | 1=Manuell, 2=Automatisk, 583=Sekventiell | |
| body type | `body_type` | 1=Halvkombi 3-d, 2=Halvkombi 5-d, 5=Familjebuss, 6=Coupé, 7=Cabriolet, … | Full list in `filters[].filter_items` of any response |
| dealer / private | `dealer_segment` | 2=Företag (dealer), 3=Privat | |
| sales form | `sales_form` | 1=Used, 2=New, 5=Leasing | Default returns all three |
| wheel drive | `wheel_drive` | 1=RWD (Bakhjuls), 2=AWD (Fyrhjuls), 3=FWD (Framhjuls), 1729=Tvåhjulsdriven | |
| exterior colour | `exterior_colour` | integer enum (1=Beige, 2=Blå, 4=Brun, 6=Grå, …) | |
| location (län/region) | `location` | `0.{regionId}` (län) or `1.{regionId}.{kommunId}` | E.g. Stockholm län = `0.300001`, Göteborg-Kungsbacka-radius via `polylocation`+`radius` |
| free-text query | `q` | URL-encoded string | Matches across heading + model_specification |
| sort order | `sort` | `PUBLISHED_DESC` (default), `PRICE_ASC`, `PRICE_DESC`, `YEAR_ASC`, `YEAR_DESC` | `PUBLISHED_ASC` is silently rejected and falls back to `PUBLISHED_DESC` |
| page | `page` | integer ≥ 1 | |
| page size | `rows` | integer (default 49, max practical ≈ 100) | |

### 2. Hit the API

```bash
URL="https://www.blocket.se/mobility/search/api/search/SEARCH_ID_CAR_USED?variant=0.818&price_from=150000&price_to=300000&year_from=2018&mileage_to=8000&fuel=2&sort=PRICE_ASC&rows=20"
browse cloud fetch "$URL"
```

Note: despite the name `SEARCH_ID_CAR_USED`, this is the **only** valid `SEARCH_ID_CAR_*` key — `SEARCH_ID_CAR`, `SEARCH_ID_CAR_NEW`, `SEARCH_ID_CAR_LEASING`, `SEARCH_ID_CAR_ALL` all return HTTP 400. New cars and leasing are surfaced inside the same endpoint via the `sales_form` filter (1=used, 2=new, 5=leasing). No header tweaking required — a bare `GET` works.

### 3. Decode the response

```jsonc
{
  "docs": [ /* up to `rows` listings */ ],
  "filters": [ /* full enum of all available filters and their hit counts at the current scope */ ],
  "metadata": {
    "result_size": { "match_count": 17571, "group_count": 17571 },
    "paging":      { "param": "page", "current": 1, "last": 50 },
    "selected_filters": [{ "filter_name": "variant", "display_name": "Volvo", … }],
    "sort": "PRICE_ASC",
    "title": "Volvo",
    "uuid": "1f8fa589-…",
    "is_end_of_paging": false
  }
}
```

- **Total match count** is `metadata.result_size.match_count` (NOT `docs.length`, which is just the current page).
- **Pagination**: keep requesting `&page=N` until `current === last` or `is_end_of_paging === true`. Last page is `metadata.paging.last`.
- **Filter validation**: `metadata.selected_filters[].display_name` echoes back the friendly name Blocket resolved (e.g. `"Volvo"` for `variant=0.818`). If `display_name` equals the raw value (e.g. `"0.7088"`), Blocket didn't recognize the code — the filter was silently dropped, returning a larger result set than expected. **Always cross-check `selected_filters` against the inputs you sent.**

### 4. Per-listing fields (each `docs[i]`)

```jsonc
{
  "type": "motor",
  "ad_id": 22734541,
  "id":   "22734541",                                  // same as ad_id, as string
  "main_search_key": "SEARCH_ID_CAR_USED",
  "heading":      "Volvo V60",
  "facade_title": "Volvo V60",                         // duplicate of heading
  "make":  "Volvo",
  "series": "V60-Serie",
  "model": "V60",
  "model_specification": "Recharge T6 AWD Geartronic", // trim level / engine
  "year": 2020,
  "mileage": 15680,
  "mileage_unit": "SCANDINAVIAN_MILE",                 // = mil = 10 km
  "price": { "amount": 248000, "currency_code": "SEK", "price_unit": "kr" },
  "fuel": "Plug-in Bensin",                            // human-readable, not enum id
  "transmission": "Automatisk",
  "dealer_segment": "Privat",                          // or "Företag"
  "organisation_name": "Bilbolaget Uppsala Kungsgatan",// only when dealer_segment === "Företag"
  "org_id": "9351069",                                 // dealer org id (or seller id for private)
  "regno":  "GRJ17P",                                  // Swedish registration number
  "chassis_number": "YV1ZWBFUDL1381720",               // VIN
  "registration_class": { "id": 1, "value": "Personbil" },
  "location": "Stora Höga",                            // city / locality (Swedish)
  "coordinates": { "lat": 58.02042, "lon": 11.81809, "accuracy": 5 },
  "canonical_url": "https://www.blocket.se/mobility/item/22734541",
  "image": { "url": "https://images.blocketcdn.se/dynamic/default/item/.../...", "width": 4032, "height": 3024, "aspect_ratio": 1.333 },
  "timestamp": 1779471110000,                          // ms since epoch — posting time
  "service_documents": ["Service"],                    // array; ["Service"] means full service history advertised
  "used_car_of_the_year": [],
  "sales_form": 1,                                     // 1=used, 2=new, 5=leasing
  "driving_range": 50,                                 // EV/PHEV-only, in km
  "extras": [],
  "labels": [],
  "flags": [],
  "ad_type": 20
}
```

When emitting clean output, normalize mileage to km (`mileage * 10`) and posted-at to ISO 8601 (`new Date(timestamp).toISOString()`).

### Browser fallback (when the API is unavailable, e.g. CDN incident)

The same query params work on the human-facing URL — Blocket's React app reads them at hydration time, then re-issues the same `/mobility/search/api/search/SEARCH_ID_CAR_USED?…` GET that returns the JSON the agent could have fetched directly. Use only if the API itself is failing:

1. `browse cloud sessions create --keep-alive` (no `--verified` or `--proxies` needed — Blocket has no anti-bot wall).
2. `browse open "https://www.blocket.se/mobility/search/car?variant=0.818&price_from=150000&price_to=300000&year_from=2018"`.
3. First visit only: accept the Vend cookie banner inside the `Cookieinställningar` iframe — `browse click @<ref-for-Godkänn alla>`. Subsequent loads reuse the session's `euconsent-v2` cookie.
4. `browse wait load`, then `browse wait timeout 3000` (lists hydrate ~2s after `load`).
5. `browse get title` → result count is in the title text (`"… | 22 426 bilar | Blocket"`); or `browse snapshot` → article refs are `[N-M] article` per listing.
6. Same per-listing fields are readable from each article — heading, price (`kr`), location, mileage, year — but at ~30× the wall-clock cost of the direct API hit (~15s vs ~0.5s).

## Site-Specific Gotchas

- **Mileage is in `mil` (Swedish miles), not kilometers** — `mileage_unit: "SCANDINAVIAN_MILE"` in responses, and `mileage_from` / `mileage_to` URL params take **mil** values where 1 mil = 10 km. A listing with `mileage: 15680` means 156,800 km. Slider max is 20,000 mil (200,000 km). **Pre-convert user-supplied kilometer thresholds by dividing by 10** before passing them to the API. Forgetting this produces a result set off by 10×.
- **Brand filter is encoded as a hierarchical `variant` code, NOT `make` / `brand` / `manufacturer`** — none of the obvious URL param names work (verified: `make=Volvo`, `brand=Volvo`, `manufacturer=Volvo`, `fabrikat=Volvo`, `marke=Volvo`, `make_model=Volvo`, `make[]=Volvo` are all silently dropped and return the unfiltered 144k-car set). The actual param is `variant=0.{brandId}` with these confirmed IDs (extracted from `/api/search` `filters[name=variant].filter_items[]`, 2026-05-22):

  | Brand | variant | Brand | variant | Brand | variant |
  |---|---|---|---|---|---|
  | Audi | `0.744` | BMW | `0.749` | Mercedes-Benz | `0.785` |
  | Volvo | `0.818` | Volkswagen | `0.817` | Skoda | `0.808` |
  | Toyota | `0.813` | Tesla | `0.8078` | Ford | `0.767` |
  | Kia | `0.777` | Hyundai | `0.772` | Nissan | `0.792` |
  | Mazda | `0.784` | Honda | `0.771` | Lexus | `0.782` |
  | Renault | `0.804` | Peugeot | `0.796` | Citroen | `0.757` |
  | Opel | `0.795` | Subaru | `0.810` | Porsche | `0.801` |
  | Saab | `0.806` | Mitsubishi | `0.787` | Jaguar | `0.775` |
  | Land Rover | `0.781` | Chevrolet | `0.753` | Alfa Romeo | `0.3233` |

  Full 150-brand table lives in any response's `filters[name=variant].filter_items[]`. **Always fetch the variant tree once to discover unmapped brands** (cheaper / Cupra / BYD / Aston Martin / etc. use the same encoding but unfamiliar IDs). **Series and specific-model selectors use longer codes**: `1.{brand}.{series}` (e.g. Volvo V60-Serie = `1.818.2843`) and `2.{brand}.{series}.{model}` (e.g. Abarth 595 = `2.8093.2476.2000413`). Multi-brand search works by repeating `&variant=` — they OR together.

- **`SEARCH_ID_CAR_USED` is the only valid path segment** — `SEARCH_ID_CAR`, `SEARCH_ID_CAR_NEW`, `SEARCH_ID_CAR_LEASING`, `SEARCH_ID_CAR_ALL` all return HTTP 400. The path name is misleading: it's actually the universal car-search endpoint, and new/leasing listings are surfaced by setting `sales_form=2` or `sales_form=5` respectively. By default (no `sales_form`) all three are returned.
- **Validate `metadata.selected_filters` before trusting the result count.** Blocket silently drops unrecognized values — pass `variant=0.7088` (a non-existent brand id) and the API returns a 200 with an effectively-unfiltered ~144k results, but the `selected_filters` block echoes back `display_name: "0.7088"` instead of a brand name. If `display_name` equals the raw code, the filter didn't take.
- **The on-page URL doesn't always update when filters are toggled via clicks**. Clicking the Volvo checkbox in the sidebar swaps the page title to `"Volvo till salu | Blocket"` but the address bar still shows the bare URL plus an A/B-test `variant=0.818` param (which happens to also be Volvo's brand id — confusing but coincidental in the bare case). The filter IS active in app state; it just isn't reflected in `window.location` until the next navigation. **For the browser fallback, always construct the URL with all filter params explicitly** rather than scripting clicks.
- **`PUBLISHED_ASC` sort is silently rejected** and falls back to `PUBLISHED_DESC`. Other invalid sort values appear to be similarly silent — verify via `metadata.sort` in the response.
- **`fuel` is returned as a human-readable Swedish string in `docs[i]`**, not the enum id — e.g. `"Plug-in Bensin"`, `"Diesel"`, `"El"`. The filter input still takes the integer id. Mapping the two sides requires the `filters[name=fuel].filter_items[]` table from any response.
- **`location` field in `docs[i]` is a free-text city/locality** (`"Stora Höga"`, `"Hässelby"`), not a structured region code. The structured region is only on the input side (`location` param, hierarchical `0.{länId}` or `1.{länId}.{kommunId}`). For agents that need län-level grouping on output, do the bucketing client-side using `coordinates.lat`/`lon`.
- **Cookie consent iframe is required only for the browser path**, never for `browse cloud fetch`. The `Cookieinställningar` dialog (Vend / TCF v2 iframe) appears on first DOM visit; click "Godkänn alla" inside the iframe (a11y ref `[2-1983]` at the time of writing) — afterwards the `euconsent-v2` cookie carries through the session.
- **Range slider boundaries from `filters[name=*].min_value` / `max_value`**: price 0–700,000 kr (step 10,000), year 1950–2027 (step 1), mileage 0–20,000 mil (step 500). Sending values outside these clamps is accepted but silently capped.
- **No rate-limit observed**, but Blocket's terms forbid systematic scraping (`Innehållet skyddas av upphovsrättslagen…`). Stay ≤ 1 req/s sustained.
- **The `browser-trace` skill conflicts with `browse open` on the same Browserbase session** — both attach as CDP clients and only one can drive the page at a time. Either stop the trace capture before opening pages or skip trace capture for this skill (the API path doesn't need browser observability).

## Expected Output

```json
{
  "search": {
    "make":         "Volvo",
    "variant_code": "0.818",
    "price_from":   150000,
    "price_to":     300000,
    "year_from":    2018,
    "year_to":      null,
    "mileage_from_km": null,
    "mileage_to_km":   80000,
    "fuel":         "Diesel",
    "transmission": null,
    "region":       null,
    "sort":         "PRICE_ASC",
    "page":         1,
    "page_size":    20
  },
  "total_results": 1132,
  "page_count":    57,
  "listings": [
    {
      "ad_id": 22734541,
      "url":   "https://www.blocket.se/mobility/item/22734541",
      "title": "Volvo V60",
      "make":  "Volvo",
      "model": "V60",
      "model_specification": "Recharge T6 AWD Geartronic",
      "year": 2020,
      "mileage_km": 156800,
      "price_sek": 248000,
      "fuel": "Plug-in Bensin",
      "transmission": "Automatisk",
      "dealer_segment": "Privat",
      "dealer_name":   null,
      "regno": "GRJ17P",
      "vin":   "YV1ZWBFUDL1381720",
      "location": "Stora Höga",
      "lat":  58.02042,
      "lon":  11.81809,
      "image_url": "https://images.blocketcdn.se/dynamic/default/item/22734541/3cfef64a-408b-497b-86d9-6be434c3df43",
      "posted_at_iso": "2026-05-18T05:31:50.000Z"
    }
  ]
}
```

If the API returns zero matches:
```json
{
  "search":        { "...": "..." },
  "total_results": 0,
  "listings":      []
}
```

If a filter was silently dropped (`selected_filters[].display_name === raw value`):
```json
{
  "search":         { "...": "..." },
  "warning":        "Unrecognized filter value(s) dropped by Blocket: variant=0.7088",
  "total_results":  144153,
  "listings":       [ "..." ]
}
```
