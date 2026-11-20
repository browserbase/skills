---
name: immobilienscout24-de-suche-njdsyc
title: Search Rental Apartments — Köln-Rodenkirchen (ImmobilienScout24)
description: >-
  Search ImmobilienScout24 for apartments to rent in the Köln (Cologne) district
  of Rodenkirchen, filtered by living space, room count, and monthly rent,
  returning the matching listings. Browser-driven; the result pages sit behind
  an AWS WAF wall that blocks datacenter/proxy automation.
website: immobilienscout24.de
category: real-estate
tags:
  - real-estate
  - rentals
  - immobilienscout24
  - germany
  - search
  - anti-bot
source: 'browserbase: agent-runtime 2026-06-30'
updated: '2026-06-30'
recommended_method: browser
alternative_methods:
  - method: fetch
    rationale: >-
      Plain HTTP fetch of any /Suche/ result URL (even through residential
      proxies) returns HTTP 401 with the AWS WAF 'Ich bin kein Roboter'
      challenge page — the page is fully JS/cookie gated. Not viable without
      executing the awswaf challenge.js in a real browser.
  - method: api
    rationale: >-
      ImmobilienScout24's data is exposed via the OAuth-protected mobile API
      (api.mobile.immobilienscout24.de) and the legacy REST Webservice
      (rest.immobilienscout24.de). Both require app/partner consumer credentials
      that are not publicly obtainable, so they are not usable for an
      unauthenticated agent.
verified: true
proxies: true
---
# Search Rental Apartments — Köln-Rodenkirchen (ImmobilienScout24)

## Purpose

Find apartments available **to rent** on ImmobilienScout24 in a Cologne (Köln) district — here **Rodenkirchen** — filtered by living space (Wohnfläche), number of rooms (Zimmer), and monthly cold rent (Kaltmiete), and return the matching result-list entries (title, rent, size, rooms, address, expose URL). Read-only: this skill only reads the public search results; it never contacts a landlord, sends an application, or logs in.

**Honesty up front:** the search **result pages** (`/Suche/...`) are gated behind an **AWS WAF JavaScript challenge** ("Ich bin kein Roboter"). During testing every Browserbase cloud session — `--verified --proxies`, `--verified` only, and a bare session — was held on the challenge and then hard-blocked within ~45s. The homepage, the location autocomplete, and the cookie-consent flow all work cleanly; only the result list is walled. The recommended path below is the correct browser flow and the exact URL/filter schema to use; expect the WAF wall and treat a real (non-datacenter) residential browser as the prerequisite for actually rendering results.

## When to Use

- A user wants current rental-apartment listings in a specific Köln district (Rodenkirchen, Sülz, Ehrenfeld, …) constrained by size, rooms, and budget.
- Monitoring new Mietwohnungen matching fixed criteria in a German city/district.
- Any task phrased as "Wohnung mieten in {district} mit {X}–{Y} m², {A}–{B} Zimmer, bis {price} €".
- Do **not** reach for this when you only have a residential proxy/datacenter egress — the WAF will block the result page (see Gotchas).

## Workflow

Recommended method: **browser** (the result data is only reachable by executing the site's JS in a real browser; the HTTP/fetch and public-API paths are dead ends — see Gotchas). Drive a stealth Browserbase session; ideally from a genuine residential browser fingerprint, because the `/Suche/` pages run an AWS WAF challenge that datacenter/proxy IPs fail.

1. **Open the homepage first to seed cookies.** Navigate to `https://www.immobilienscout24.de/`. It returns HTTP 200 with no challenge. Title: *"ImmoScout24 – Mit über 6,5 Mio. Immobilien."*

2. **Accept the cookie/consent dialog.** A GDPR dialog ("Wir verwenden Cookies…") renders shortly after load. Click the **"Alle akzeptieren"** button (accessibility label `button: Alle akzeptieren`). This is required for the search UI to behave and for the WAF cookie (`aws-waf-token`) to be storable.

3. **Resolve the location to a Bezirk.** Click the location combobox (`combobox: Gib ein, wonach du suchst, und starte deine Suche`), type `Köln Rodenkirchen`, wait ~2–3s for the autocomplete list, and pick the **`Köln - Rodenkirchen (Bezirk)`** option (this is the borough/district; there is also a smaller `(Ortsteil)` variant and street matches — pick **Bezirk** for the whole district). The Bezirk option is usually pre-highlighted `[selected]`.

4. **Ensure property type = "Wohnung Mieten"** (apartment to rent — the homepage default) and click the **`Suchen`** button. The UI builds and navigates to the canonical result URL:
   `https://www.immobilienscout24.de/Suche/de/nordrhein-westfalen/koeln/rodenkirchen/wohnung-mieten?enteredFrom=one_step_search`

5. **Apply the filters via URL query params** (these are the long-standing IS24 filter params; min and max are joined with a hyphen and use `.0` decimals). Navigate to:
   ```
   https://www.immobilienscout24.de/Suche/de/nordrhein-westfalen/koeln/rodenkirchen/wohnung-mieten
       ?numberofrooms=2.0-3.0      # rooms 2–3
       &price=0.0-1800.0           # monthly Kaltmiete 0–1800 €
       &livingspace=60.0-90.0      # living space 60–90 m²
       &enteredFrom=result_list
   ```
   You can also set the filters in the result-page filter bar (Zimmer / Wohnfläche / Preis) instead of editing the URL; the URL above is the deterministic equivalent. Note: `price` on a `wohnung-mieten` search is the **Kaltmiete** (cold rent), not Warmmiete.

6. **Wait for the WAF challenge to clear, then read results.** If the page title is *"Ich bin kein Roboter - ImmobilienScout24"*, the AWS WAF challenge is in progress — its `challenge.js` polls `AwsWafIntegration.hasToken()` ~every 200ms for ~10s and self-reloads once a token is issued. **Do not re-navigate** while waiting (re-navigation resets the challenge). Once cleared, the page title becomes a results title (contains *"Wohnung … mieten … Köln"* / a count).

7. **Extract the result cards.** On the rendered result list, each listing is a result card exposing: title, **Kaltmiete** (e.g. `1.250 €`), **Wohnfläche** (`72 m²`), **Zimmer** (`3 Zi.`), address/district line, and a link to the detail page `…/expose/{exposeId}`. Read them via `browse get text body` / `browse snapshot` and the per-card anchor hrefs (`/expose/<numeric-id>`). Paginate with the `&pagenumber=N` query param if more than one page of results exists. Emit the JSON in **Expected Output**.

### Verifying you are on the right search

- URL path is `/Suche/de/nordrhein-westfalen/koeln/rodenkirchen/wohnung-mieten` (NRW → Köln → Rodenkirchen → rent-apartment).
- Result count / heading mentions Köln and the active filters; cards show `€`, `m²`, and `Zi.`.
- A persistent filter chip bar reflects `2-3 Zimmer`, `60-90 m²`, `bis 1.800 €`.

## Site-Specific Gotchas

- **AWS WAF wall on `/Suche/` result pages is the headline blocker.** Every result URL serves an AWS WAF interstitial titled *"Ich bin kein Roboter - ImmobilienScout24"* loading `https://…edge.sdk.awswaf.com/.../challenge.js`. In testing it **never cleared** on Browserbase and converted to a terminal hard-block within ~45s, across **all three** session configs: `--verified --proxies`, `--verified` only, and bare. The homepage and autocomplete are NOT walled — only the result list is.
- **Two challenge variants — know the difference.** The page body contains a `fetch("/gk-id/t")` handler and a polling/auto-reload script while it is still *retrying* (recoverable). When it switches to `fetch("/gk-id/b")` with the copy *"…hat unser System dich fälschlicherweise als Roboter identifiziert… Bitte überprüfe deine Einstellungen oder kontaktiere unseren Support"* and **no polling script**, the IP/session has been **hard-blocked** — abandon it and start a fresh session (preferably a different egress).
- **Plain fetch is useless here.** `browse cloud fetch <result-url> --proxies` returns **HTTP 401** with the same WAF HTML. The result page is fully JS- and cookie-gated; there is no static HTML to scrape and no JSON endpoint reachable without executing `challenge.js`. Don't waste turns fetching result URLs.
- **Public APIs are auth-walled — confirmed dead ends.** The mobile API `api.mobile.immobilienscout24.de` (OAuth1.0a, app consumer keys) and legacy `rest.immobilienscout24.de` Webservice both require partner/app credentials that are not publicly obtainable. There is no unauthenticated JSON search API.
- **robots.txt disallows the geocode/radius search forms** (`Disallow: /*?*geocodes=`, `/immobilienpreise/radius/`). Use the **SEO district path** (`/Suche/de/<bundesland>/<stadt>/<bezirk>/wohnung-mieten`) rather than a `?geocodes=` URL — it's both allowed and the form the UI itself generates. (ClaudeBot/GPTBot are `Allow: /` for the rest of the site.)
- **District path slug ≠ what you'd guess.** Selecting "Köln - Rodenkirchen **(Bezirk)**" yields path `…/koeln/rodenkirchen/…` (single `rodenkirchen` segment under `koeln`), not `…/koeln-rodenkirchen/…`. Resolve the slug through the autocomplete rather than hand-constructing it; a hand-built `koeln-rodenkirchen` may redirect or 404. There is also a smaller **(Ortsteil)** Rodenkirchen — pick **Bezirk** for the whole district unless the user clearly wants the smaller Ortsteil.
- **Filter param schema:** `numberofrooms=<min>.0-<max>.0`, `livingspace=<min>.0-<max>.0` (m²), `price=<min>.0-<max>.0`. On `wohnung-mieten`, `price` = **Kaltmiete** (cold rent). Min/max joined by `-`, both with `.0` decimals; open-ended ranges drop one side (e.g. `price=0.0-1800.0`). `enteredFrom` is telemetry only (`one_step_search` from the homepage, `result_list` when editing filters) and does not affect results.
- **Cookie consent is mandatory before the form works** — accept "Alle akzeptieren". An ad iframe ("Advertisement") may also appear on the homepage; ignore it.
- **German number formatting:** rents render as `1.250 €` (dot = thousands separator), sizes as `72 m²`, rooms as `3 Zi.`. Parse the dot as a thousands grouping, not a decimal point.

## Expected Output

Successful extraction (one object per result card). `cold_rent_eur` is the Kaltmiete; include `warm_rent_eur` only if the card shows a Warmmiete/Gesamtmiete line.

```json
{
  "success": true,
  "search": {
    "city": "Köln",
    "district": "Rodenkirchen",
    "bezirk_path": "/Suche/de/nordrhein-westfalen/koeln/rodenkirchen/wohnung-mieten",
    "filters": { "rooms": "2-3", "livingspace_m2": "60-90", "cold_rent_eur": "0-1800" }
  },
  "total_results": 12,
  "listings": [
    {
      "expose_id": "158923471",
      "title": "Helle 3-Zimmer-Wohnung mit Balkon in Köln-Rodenkirchen",
      "cold_rent_eur": 1250,
      "warm_rent_eur": 1480,
      "livingspace_m2": 78,
      "rooms": 3,
      "address": "50996 Köln (Rodenkirchen)",
      "url": "https://www.immobilienscout24.de/expose/158923471"
    }
  ]
}
```

Blocked outcome (what this skill actually hit from Browserbase — datacenter/proxy egress):

```json
{
  "success": false,
  "search": {
    "city": "Köln",
    "district": "Rodenkirchen",
    "filters": { "rooms": "2-3", "livingspace_m2": "60-90", "cold_rent_eur": "0-1800" }
  },
  "total_results": 0,
  "listings": [],
  "error_reasoning": "AWS WAF challenge ('Ich bin kein Roboter - ImmobilienScout24', awswaf challenge.js) never cleared on the /Suche/ result page and hard-blocked (gk-id/b) within ~45s across verified+proxies, verified-only and bare Browserbase sessions. Homepage + autocomplete + cookie consent succeed; only the result list is walled. A genuine residential browser fingerprint is required to render results."
}
```
