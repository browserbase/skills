---
name: caravangroup-com-cross-border-trucking-quote-cbsb4e
title: Caravan Group Cross-Border Trucking Capacity & Quote
description: >-
  Discover Caravan Group of Companies' Canada↔USA cross-border trucking capacity
  (asset-based 450+ tractor fleet plus non-asset/3PL brokerage) and stage a
  JotForm-backed Rate Request for pricing. Caravan publishes no online rates;
  this skill maps service offerings, terminals, certifications, and the full
  quote-form field set.
website: caravangroup.com
category: logistics
tags:
  - logistics
  - trucking
  - cross-border
  - freight
  - ftl-ltl
  - quote-request
  - canada-usa
source: 'browserbase: agent-runtime 2026-05-20'
updated: '2026-05-20'
recommended_method: hybrid
alternative_methods:
  - method: url-param
    rationale: >-
      Capacity / coverage / asset-vs-non-asset / terminals / certifications all
      live in pre-rendered static HTML on six /services/* + /about/logistics/ +
      /contact-us/locations/ pages. Bare HTTP GET (no proxy, no stealth, no JS)
      returns 200 OK with the meaningful prose inside <main>. This is the
      fastest path when only capacity info is needed.
  - method: browser
    rationale: >-
      The Rate Request form is a JotForm embed (form id 81999264940977) —
      accessible directly at form.jotform.com/81999264940977. Field structure is
      deterministic and documented in SKILL.md, but the CAPTCHA gate blocks pure
      HTTP submission. Browser path is required only when an actual submission
      (not just staging) is authorized and a CAPTCHA solver (OCR or human) is
      available.
  - method: api
    rationale: >-
      Investigated and confirmed absent: no /wp-json/, /api/, /rate-quote.php,
      or GraphQL surface exposes pricing or capacity programmatically. Do not
      re-investigate.
verified: false
proxies: true
---
# Caravan Group — Cross-Border Trucking Capacity & Quote Request

## Purpose

Given a Canada↔USA cross-border freight shipment of interest, return (a) Caravan Group of Companies' **published capacity profile** (asset-based fleet inventory, brokered/3PL coverage, equipment types, geographic lanes, terminal network, certifications) and (b) the **canonical path to obtain pricing** — Caravan does **not** publish real-time rates on the website, so "pricing" resolves to either a populated/staged Rate Request submission or the published toll-free / e-mail contact channels with a structured rate-request payload. Read-only: never click *Get a Rate!* — stop after the form is staged or after fetching the public capacity pages.

## When to Use

- A shipper / broker wants to know whether Caravan covers their lane, equipment type, or commodity before contacting sales.
- A 3PL / TMS integration needs to populate a carrier-capability record for Caravan (asset-based + non-asset, fleet count, terminals, bonded status, CTPAT/PIP).
- An agent has been asked "is Caravan a fit for my Canada–US load, and how do I get a quote from them?"
- Any flow that needs to differentiate Caravan's **asset arm** (Caravan Logistics fleet, ~450 tracked power units) from its **non-asset / brokerage arm** ("Caravan's logistics department" with 3PL carrier-partners) — both arms are documented under the same domain.

## Workflow

**Capacity discovery is purely static-HTML fetch — no JavaScript, no anti-bot, no proxy required.** The Caravan site is a WordPress install (Apache + PHP/7.4 + Genesis "business-pro-theme") that serves complete pre-rendered HTML for every services page. Pricing, however, is **not exposed online at all** — there is no public rates API and no instant-quote calculator. The only quote path is the JotForm-hosted Rate Request form (CAPTCHA-gated → cannot complete end-to-end as a pure HTTP/headless flow without OCR or human-in-the-loop), or the toll-free phone / e-mail. Lead with the fetch path for capacity; for pricing, stage the JotForm payload and either (i) hand the captcha to a human/OCR step, or (ii) emit the structured rate-request bundle alongside the phone/e-mail fallback.

### 1. Capacity & coverage (HTTP GET — no session needed)

The information that answers "what can Caravan haul, on which lanes, with which equipment, asset vs. non-asset?" lives on five static service pages plus a locations page. Fetch them in parallel:

```
GET https://caravangroup.com/services/cross-border/
GET https://caravangroup.com/services/full-truckload/
GET https://caravangroup.com/services/less-than-truckload/
GET https://caravangroup.com/services/temperature-controlled/
GET https://caravangroup.com/services/just-in-time/
GET https://caravangroup.com/services/cross-dock-warehousing/
GET https://caravangroup.com/about/logistics/             # ← brokerage / 3PL arm
GET https://caravangroup.com/contact-us/locations/        # ← terminal network
```

Each page is < 50 KB, returns `200 OK` to a bare `curl` (no `User-Agent` filtering, no Cloudflare/Akamai), and the meaningful prose is inside `<main>...</main>`. Extract by stripping `<style>`, `<script>`, and remaining tags. Key facts to lift, by page:

| Page | Facts to extract |
|---|---|
| `services/cross-border/` | 20+ yr trans-border experience; FTL + LTL between Canada and all 48 mainland US states; primary lanes Mid-West, Eastern Seaboard / Great Lakes, California / west coast; **US and Canadian bonded warehouses**; equipment age < 5 yrs; e-logs; on-site driver training. |
| `services/full-truckload/` | **Modern fleet of over 450 satellite-tracked power units** (asset side); 24/7 single-point-of-contact; dry / cold / frozen / heated; CTPAT and PIP; rear disc brakes; team drivers available; complete EDI. |
| `services/less-than-truckload/` | LTL Canada↔US + intra-Canada; **over 50,000 sq ft of cross-dock / warehousing** at HQ; bonded; single and team drivers. |
| `services/temperature-controlled/` | Reefer for cold/frozen/heated freight; California produce inbound; 24/7 personal CS team. |
| `services/just-in-time/` | JIT FTL, LTL, and reefer; same lane list. |
| `about/logistics/` | **Non-asset / brokerage arm** — "Caravan's logistics department" places freight with **3PL carrier-partners** across Canada and cross-border to mainland USA. LTL / TL / flatbed / temperature controlled. EDI + in-cab scanners. |
| `contact-us/locations/` | Terminal addresses, phones, hours. |

The asset/non-asset distinction is fundamental to this task: **Caravan operates both models simultaneously and the website surfaces each on a different page.** Do not conflate. Asset-based capacity is the 450-tractor fleet documented on the FTL/LTL/temp/JIT/cross-border pages; non-asset/brokerage capacity is the 3PL-partner network documented on `/about/logistics/`.

### 2. Pricing — stage the Rate Request form

Caravan publishes **no rates anywhere on the public site**. The single online quoting path is `https://caravangroup.com/rate-request/`, which loads a JotForm (form id **`81999264940977`**) via:

```html
<script src="//www.jotform.com/jsform/81999264940977?redirect=1"></script>
```

The form-server source is also directly fetchable at `https://form.jotform.com/81999264940977` and `https://www.jotform.com/form/81999264940977` (both return the same HTML). Use either to discover field structure programmatically rather than driving the embed.

**Field map** (names are the literal `name="..."` attributes JotForm's POST endpoint expects):

| `name` | Label on page | Required | Type / values |
|---|---|---|---|
| `q34_companyName` | Company Name | ✅ | text |
| `q19_fullName[first]` | Full Name → First | ✅ | text |
| `q19_fullName[last]` | Full Name → Last | ✅ | text |
| `q22_email` | E-mail | ✅ | email |
| `q21_phoneNumber[area]`, `q21_phoneNumber[phone]` | Phone Number | optional | text (area / 7-digit split) |
| `q35_faxNumber[area]`, `q35_faxNumber[phone]` | Fax Number | optional | text |
| `q36_pickupDate[month]`, `[day]`, `[year]` | Pickup Date | ✅ (red asterisk in UI, not in `jf-required` class — UI is authoritative) | numeric `mm-dd-yyyy` |
| `q37_dropoffDate[month]`, `[day]`, `[year]` | Dropoff Date | optional | numeric |
| `q20_shipmentOrigin[addr_line1]`, `[addr_line2]`, `[city]`, `[state]`, `[postal]`, `[country]` | Shipment Origin | ✅ | address group; `country` defaults to `"United States"` |
| `q27_shipmentDestination[addr_line1]`, `[addr_line2]`, `[city]`, `[state]`, `[postal]`, `[country]` | Shipment Destination | ✅ | address group |
| `q28_commodityType` | Commodity Type | optional | text (alphabetic validator) |
| `q29_approximateWeight29` | Approximate Weight | optional | text (alphanumeric — accepts "40000 lb", "18000 kg", etc.) |
| `q31_capacity31` | Capacity | optional but expected | radio: `"Full Truck Load (FTL)"` \| `"Less Than Truck Load (LTL"` ⚠️ (the LTL value is literally truncated server-side — closing paren is missing; submit the value byte-for-byte as shown) |
| `q33_numberOf` | Number of skids/pallets | optional (UI hides this until LTL is selected; you can submit it directly bypassing the JS gate) | number |
| `q18_comments` | Comments | optional | textarea (use this to convey any field the form doesn't model: temperature range, hazmat, oversized/flatbed, specific equipment, target rate window, broker reference, etc.) |
| `captcha` + `captcha_id` | image CAPTCHA | ✅ | image-to-text — **blocks end-to-end automation; see Gotchas** |

**JotForm submit endpoint** (observed in the form's `<form action>`):

```
POST https://submit.jotform.com/submit/81999264940977
Content-Type: application/x-www-form-urlencoded
```

The page also embeds two anti-bot fields that the inline `<script>` populates client-side: `simple_spc = "81999264940977-81999264940977"` (literal) and a hidden honeypot `name="website"` that must remain empty. POSTing without first GETting `/jsform/81999264940977` (to obtain a CAPTCHA session cookie) will be rejected.

**Read-only stop point.** Stage the payload — set every value, validate it against the table above, snapshot the form. **Do not click `Get a Rate!`** unless a human operator has authorized the actual submission and supplied the CAPTCHA text. Submission triggers a JotForm e-mail to Caravan sales and a redirect to `caravangroup.com/rate-request/?redirect=1`; treat it the same way you would a booking confirmation in other browse.sh skills.

### 3. Fallback channels for pricing (always include in the response)

Even when the form path succeeds, surface these out-of-band channels — they are how a human rep ultimately replies, and they are the only realistic path when CAPTCHA-driven automation is not available:

- **Toll-free**: `1-888-828-1727` (24/7 Oakville HQ; quote desk hours not published but support is 24/7).
- **General e-mail**: `info@caravangroup.com` — e-mail with the same field set the form collects (origin, destination, pickup date, commodity, weight, FTL vs LTL, comments).
- **Customer login (existing accounts only)**: `https://caravanlogistics.freightassist.com` — a FreightAssist TMS instance. Requires credentials issued by Caravan; the public site does not offer self-service signup. Useful to mention but unreachable for a new prospect.

### Browser fallback

If the JotForm embed fails to render (rare — observed reliable across `browse cloud fetch --proxies` and a stealth-free remote browser session in iter-1), open `https://form.jotform.com/81999264940977` directly in a remote session. The form is the same; the wrapping caravangroup.com chrome is the only difference. The iframe a11y root is `[0-*]` and the fields above are typed exactly as shown — e.g. `browse fill @0-3 "ACME Corp"` for Company Name, `@0-4` first name, `@0-5` last name, `@0-6` e-mail, etc. (refs verified iter-1, but JotForm renumbers across page-loads; re-snapshot rather than caching.)

## Site-Specific Gotchas

- **Asset vs non-asset is split across two URLs.** The asset-based fleet (~450 tractors) is described on every `/services/*` page. The non-asset/brokerage arm is **only** on `/about/logistics/`. An agent that fetches only the services menu will silently miss the 3PL capability. Always include `/about/logistics/` when the prompt mentions "non-asset", "brokerage", or "3PL".
- **The LTL radio value is byte-truncated.** The `q31_capacity31` LTL option's literal `value` attribute is `"Less Than Truck Load (LTL"` — closing `)` is missing. Confirmed in both the raw `/jsform/` HTML and the browser-rendered iframe. Submit it character-for-character or the option will not register.
- **`q33_numberOf` is hidden by default.** JotForm hides the skids/pallets input until the LTL radio is clicked. Direct POSTs can include it unconditionally; browser-driven flows must click the LTL radio first or the field stays `display:none`.
- **Pickup Date is required per the UI but not flagged in the `jf-required` class list.** Trust the red asterisk in the rendered form, not the static HTML class set. (Iter-1 evidence: screenshot `02-jotform-rendered.png` shows the red `*` next to "Pickup Date" while the source `<li id="id_36">` lacks `jf-required`.)
- **CAPTCHA blocks pure HTTP automation.** The `<input name="captcha">` is required and validated server-side against an image at `https://cdn.jotfor.ms/...`. There is no Turnstile / reCAPTCHA / hCaptcha bypass; an end-to-end automated submission needs OCR (JotForm CAPTCHAs are simple 5–6 char alphanumerics — feasible with Tesseract or a vision model) or a human-in-the-loop step.
- **`q36_pickupDate` accepts `mm-dd-yyyy`, not ISO.** The placeholder in the rendered input is literally `mm-dd-yyyy`. Sending `2026-06-15` will fail HTML5 validation client-side; split into `month=06`, `day=15`, `year=2026`.
- **Country dropdown default is United States.** Both `q20_shipmentOrigin[country]` and `q27_shipmentDestination[country]` pre-select `United States`. Cross-border-from-Canada loads must explicitly set origin country to `Canada` — otherwise the rep gets a malformed inquiry that needs follow-up to disambiguate.
- **`/customer-login` is not a public path.** The footer's "CUSTOMER LOGIN" link goes off-domain to `caravanlogistics.freightassist.com`. Do not waste turns trying to use it for prospect quote discovery; it is a TMS portal for existing accounts.
- **The map at `/service-map/` is a Google-Maps embed via the `uscanadahtmlmap` WP plugin — pin data is not in the page HTML.** If you need the actual terminal lat/lons, scrape them from the locations text on `/contact-us/locations/` (full addresses listed in plain text) and geocode separately. The map UI is for human eyes only.
- **WordPress / WooCommerce vestigials.** The site bundles a WooCommerce store (`/caravan-shop/`) and a Site-Kit GA tag (`GT-5NGV43ZG`). The currency reported by `googlesitekit.wcdata.currency` is `"GBP"` — leftover misconfiguration; **do not treat as a pricing signal**. All actual quotes are in USD or CAD per the rep, not GBP.
- **No `robots.txt` Disallow blocks the service pages.** Fetching with a plain `User-Agent` works; `bb cloud fetch --proxies` is sufficient for any rate-limit safety margin. Stealth/`--verified` are not needed.
- **The toll-free 1-888-828-1727 is the same across every Canadian terminal page.** Each terminal also lists a direct local number; for sales/quote the toll-free is the right channel. (Calgary uses a different toll-free, `1-800-268-3045`, but routes to the same dispatch.)
- **No instant-rate API has been confirmed.** Checked: no JSON endpoint under `/wp-json/`, no GraphQL surface, no `/api/`, no `/rate-quote.php`. The FreightAssist back-end likely has one (FreightAssist is a Trimple/McLeod-style TMS) but it is not exposed to anonymous traffic. **Do not waste iterations probing for one** — confirmed absent.

## Expected Output

The skill emits a single JSON object combining (a) the capacity card and (b) the staged or submitted rate-request payload. Three terminal shapes:

### Shape A — capacity card only (no rate request requested)

```json
{
  "carrier": {
    "legal_name": "Caravan Group of Companies",
    "hq_address": "2284 Wyecroft Road, Oakville, ON L6L 6M1, Canada",
    "founded": 1997,
    "domain": "caravangroup.com",
    "asset_based": true,
    "non_asset_based": true,
    "asset_description": "Modern fleet of 450+ satellite-tracked power units, equipment age <5 years, rear disc brakes, e-logs",
    "non_asset_description": "In-house logistics / brokerage department placing freight with vetted 3PL carrier-partners across Canada and cross-border to mainland USA",
    "capacity": {
      "full_truckload": true,
      "less_than_truckload": true,
      "temperature_controlled": ["cold", "frozen", "heated"],
      "flatbed": true,
      "dedicated": true,
      "just_in_time": true,
      "cross_dock_warehousing_sqft": 50000
    },
    "geography": {
      "intra_canada": "all provinces",
      "cross_border": "Canada ↔ 48 mainland US states",
      "primary_lanes": ["Midwest", "Eastern Seaboard / Great Lakes", "California / US West Coast"]
    },
    "terminals": [
      {"country": "CA", "province": "ON", "city": "Oakville", "address": "2284 Wyecroft Road, L6L 6M1", "role": "HQ"},
      {"country": "CA", "province": "ON", "city": "London", "address": "3960 Commerce Rd., N6N 1P8"},
      {"country": "CA", "province": "QC", "city": "Vaudreuil-Dorion", "address": "500 Montée Labossière, J7V 8P2"},
      {"country": "CA", "province": "MB", "city": "Winnipeg", "address": "68 Bergen Cutoff Road, R3C 2E6"},
      {"country": "CA", "province": "SK", "city": "Regina", "address": "12202 Rotary Avenue, S4M 0A1"},
      {"country": "CA", "province": "AB", "city": "Calgary (Rocky View)", "address": "290244 High Plains Road, T4A 0T8"},
      {"country": "US", "state": "IL", "city": "Chicago", "address": "100 S State St, Suite 400A, 60603", "role": "Caravan Supply Chain"}
    ],
    "certifications": ["CTPAT", "PIP", "US-bonded warehouse", "Canadian-bonded warehouse"],
    "tech": ["EDI", "satellite tracking", "e-logs", "in-cab scanners", "FreightAssist TMS"],
    "contact": {
      "toll_free": "1-888-828-1727",
      "direct": "905-338-5885",
      "email": "info@caravangroup.com",
      "rate_request_url": "https://caravangroup.com/rate-request/",
      "customer_portal": "https://caravanlogistics.freightassist.com"
    }
  },
  "pricing": {
    "online_instant_quote": false,
    "rationale": "Caravan does not publish or expose any real-time rate. Pricing requires a Rate Request form submission or direct contact with a Caravan sales representative."
  }
}
```

### Shape B — capacity card + staged rate-request payload (form filled, not submitted)

```json
{
  "carrier": { "...": "as Shape A" },
  "rate_request": {
    "status": "staged",
    "submitted": false,
    "reason_not_submitted": "captcha_required",
    "form_id": "81999264940977",
    "form_url": "https://caravangroup.com/rate-request/",
    "fields": {
      "q34_companyName": "ACME Manufacturing Inc.",
      "q19_fullName[first]": "Jane",
      "q19_fullName[last]": "Doe",
      "q22_email": "jane.doe@acme.example",
      "q21_phoneNumber[area]": "416",
      "q21_phoneNumber[phone]": "555-0142",
      "q36_pickupDate[month]": "06",
      "q36_pickupDate[day]": "15",
      "q36_pickupDate[year]": "2026",
      "q20_shipmentOrigin[city]": "Toronto",
      "q20_shipmentOrigin[state]": "ON",
      "q20_shipmentOrigin[postal]": "M5V 1A1",
      "q20_shipmentOrigin[country]": "Canada",
      "q27_shipmentDestination[city]": "Chicago",
      "q27_shipmentDestination[state]": "IL",
      "q27_shipmentDestination[postal]": "60601",
      "q27_shipmentDestination[country]": "United States",
      "q28_commodityType": "Auto parts",
      "q29_approximateWeight29": "38000 lb",
      "q31_capacity31": "Full Truck Load (FTL)",
      "q18_comments": "Dry van, no temperature requirement. Standard 53' trailer. Please quote spot + contract."
    },
    "captcha_required": true,
    "next_step": "Hand off CAPTCHA solve to operator, then POST to https://submit.jotform.com/submit/81999264940977"
  }
}
```

### Shape C — capacity-out-of-scope (lane or service Caravan does not advertise)

```json
{
  "carrier": { "legal_name": "Caravan Group of Companies", "domain": "caravangroup.com" },
  "match": {
    "in_scope": false,
    "reason": "no_advertised_coverage",
    "detail": "Requested service was 'Hawaii intermodal container drayage'; Caravan's published lanes cover Canada and the 48 contiguous US states only. No mention of Hawaii, Alaska, intermodal/rail, Mexico, or ocean drayage on any /services/* page.",
    "suggested_alternative_inquiry": "Submit a Rate Request with the unusual lane in the Comments field — Caravan may broker via their non-asset arm (/about/logistics/) even when not advertised — but do not assume coverage."
  }
}
```
