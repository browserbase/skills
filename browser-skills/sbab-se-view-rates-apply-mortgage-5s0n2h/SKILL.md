---
name: sbab-se-view-rates-apply-mortgage-5s0n2h
title: 'SBAB Rates, Mortgage Application & Savings Account'
description: >-
  Read SBAB's live mortgage list rates, effective rates,
  handpenningslån/överbryggningslån, Sparkonto and Fasträntekonto rates via six
  public JSON APIs (no auth), and walk a user up to the BankID gate for the
  lånelöfte (mortgage pre-approval) application or savings-account opening flow.
website: sbab.se
category: banking
tags:
  - banking
  - mortgage
  - savings
  - sweden
  - interest-rates
  - bankid
  - sbab
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: api
alternative_methods:
  - method: api
    rationale: >-
      Mortgage list rates, effective rates, handpenningslån/överbryggningslån,
      Sparkonto, and Fasträntekonto are all served by six public JSON endpoints
      under https://www.sbab.se/api/ — no auth, no Akamai challenge, no cookies,
      no Referer required. Sub-second responses. This is the dominant path for
      the read-rates job.
  - method: browser
    rationale: >-
      Required for the write-side jobs (mortgage application 'lånelöfte' and
      savings-account opening) because every write on sbab.se terminates at
      Mobilt BankID, which can only be completed on the end user's own device.
      The agent navigates the user to the correct deep-link and stops at the
      BankID QR screen. Browser is also the fallback for personalised LTV-aware
      mortgage rates, since the calculation API is POST-only and was not
      validated end-to-end during discovery.
  - method: url-param
    rationale: >-
      Deep-links into specific funnel steps are stable:
      /1/privat/lana/bolan/rakna_pa_bolan.html?content=first-start jumps
      straight to Step 1 of the 5-step mortgage wizard;
      secure.sbab.se/logga-in?dep=privat&redirect=/sparkonto/oppna&content={first-vs|second-vs}
      routes to Sparkonto vs Fasträntekonto opening after BankID.
verified: true
proxies: true
---
# SBAB Rates, Mortgage Application & Savings Account

## Purpose

Three jobs against [sbab.se](https://www.sbab.se) (Swedish online bank — bolån / sparkonto specialist):

1. **Read live mortgage interest rates** (list rates "listräntor", personalised LTV-aware rates, Grönt Bolån rates, handpenningslån / överbryggningslån) and savings-account rates (Sparkonto with free withdrawals + Fasträntekonto with 3 mån / 6 mån / 1–5 år fixed terms).
2. **Walk a user up to the start of a mortgage application** ("lånelöfte" — pre-approval / loan-promise) so they can complete BankID identification themselves.
3. **Walk a user up to the start of a savings-account opening flow** so they can sign with BankID.

Read-only for rates (free, unauthenticated, sub-second). Application/account creation **cannot be completed by an automated agent** — both terminate at Swedish BankID, which requires the end user's personal device. This skill drives up to, but never past, the BankID screen.

## When to Use

- "What's SBAB's current 3-month mortgage rate?" / "Show me all of SBAB's binding-period rates."
- "What rate would I get with a 60% LTV on a 4 MSEK home?" (personalised list-rate calculation)
- "Compare SBAB's Sparkonto rate to Fasträntekonto 1-year."
- A user wants to apply for a mortgage pre-approval (lånelöfte) and needs to be handed off to SBAB's BankID-gated flow.
- A user wants to open a savings account and needs to be handed off to BankID.
- Any flow where you would otherwise scrape sbab.se's HTML for rates — the JSON APIs are faster, cheaper, and structurally stable.

## Workflow

### Recommended path — JSON APIs (no auth, no anti-bot, no proxy)

SBAB's web UI is a thin client over six public JSON endpoints on `https://www.sbab.se/api/`. All return `200 application/json` with no headers, no cookies, no session, and **no Akamai challenge** (the site is on Akamai but these endpoints are explicitly whitelisted). Verified live 2026-05-19.

#### A. Mortgage list rates (annonserade räntor)

```
GET https://www.sbab.se/api/interest-mortgage-service/api/external/v1/interest
```

Response:
```json
{"listInterests":[
  {"period":"P_3_MONTHS","interestRate":"3.20","validFrom":"2026-03-31"},
  {"period":"P_1_YEAR",  "interestRate":"3.62","validFrom":"2026-03-31"},
  {"period":"P_2_YEARS", "interestRate":"3.84","validFrom":"2026-03-31"},
  {"period":"P_3_YEARS", "interestRate":"3.99","validFrom":"2026-03-31"},
  {"period":"P_4_YEARS", "interestRate":"4.09","validFrom":"2026-03-31"},
  {"period":"P_5_YEARS", "interestRate":"4.19","validFrom":"2026-03-31"},
  {"period":"P_7_YEARS", "interestRate":"4.38","validFrom":"2026-03-31"},
  {"period":"P_10_YEARS","interestRate":"4.59","validFrom":"2026-03-31"}
]}
```

Eight binding periods (3 mån — 10 år). `interestRate` is a string in Swedish percent (period-separated decimal). `validFrom` is the rate-change date — **not** today.

#### B. Mortgage effective interest (årsränta with end-date)

```
GET https://www.sbab.se/api/interest-mortgage-service/api/v1/interest/effective
```

Adds `effectiveInterestRate` (the "effektiv ränta" disclosure incl. monthly compounding & paper-invoice fees), `referenceId` (`LIS_BO_03M`, `LIS_BO_01Y`, …, `LIS_BO_10Y` — the internal SKU codes), `interestPeriod` in months (3, 12, 24, …, 120), and `termsEndDate` for fixed-period contracts. Use this when you need the legally-required `effektiv ränta`.

#### C. Handpenningslån / Överbryggningslån (down-payment + bridge loan)

```
GET https://www.sbab.se/api/interest-assistance-service/api/v1/products/rates
```

Returns the two short-term auxiliary loan products:
```json
{"assistanceProducts":[
  {"name":"Handpenningslån",   "id":"A02","rate":"3.20","validFrom":"2026-03-31"},
  {"name":"Överbryggningslån", "id":"A03","rate":"3.20","validFrom":"2026-03-31"}
]}
```

#### D. Savings account rates (Sparkonto Privat + corporate SBAB-konto)

```
GET https://www.sbab.se/api/interest-account-service/api/external/v1/products
```

Returns Sparkonto Privat (single-tier, currently 1.25%) plus the corporate "SBAB-konto Ftg/Brf" four-tier ladder (≤25M, 25–50M, 50–200M, >200M SEK). Each item carries `interestRate`, `validFrom`, **`interestRateChange`** (delta vs. previous period in percentage points — useful for "rate cut" or "rate hike" framing), and a `previous` block with the prior rate + its valid-from date.

#### E. Fasträntekonto (fixed-term deposit)

```
GET https://www.sbab.se/api/interest-account-service/api/external/v2/products/fixed_term_deposit/rates?with-changes=true
```

Returns the full Fasträntekonto Privat (id `F03`) ladder: 3 mån / 6 mån / 1 år / 2 år / 3 år / 4 år / 5 år. Each tier has `bindingPeriod` (months), `interestRate`, `interestRateValidFrom`, `interestRateTermsEndDate` (the date a contract opened today would mature), `interestRateChange`, `previous{interestRate,validFrom}`, plus `minAmount: 10000` and `maxAmount: 50000000` SEK. `?with-changes=true` enables the `interestRateChange` + `previous` fields; omit it for just the current rate.

#### F. Personalised mortgage rate (LTV-aware) — UI tool, no public GET surface

The on-page calculator at `/1/privat/vara_rantor.html` (Bostadens värde + Lånebelopp inputs) shows three columns per binding period: **Din räntesats** (your rate with LTV discount), **Grönt Bolån** (green-mortgage rate, ~0.10pp lower for certified energy-efficient properties), and **Listränta** (list rate). The personalised rate is computed client-side from list rate − LTV-bucket discount; the calculation API (`/api/interest-calculation-service/api/v1/effective-interest/mortgage` POST) returns 400 to bare GET and was not validated end-to-end via cURL during this skill's discovery — for now, read these numbers off the page DOM after setting the two textboxes (refs `[textbox: Bostadens värde]` and `[textbox: Önskat lånebelopp]`) and waiting ~2s for the table to repaint.

### Workflow — read all current rates (read-only)

1. `GET` endpoint A → 8 mortgage list rates. Quote `period` (or convert: `P_3_MONTHS`→"3 mån", `P_N_YEAR(S)`→"N år"), `interestRate`, `validFrom`. If the user wants the effective rate, use endpoint B instead.
2. `GET` endpoint D → Sparkonto Privat rate (the savings_account product). Optionally also surface the corporate tiers from the same response.
3. `GET` endpoint E → Fasträntekonto ladder (3 mån, 6 mån, 1–5 år).
4. (Optional) `GET` endpoint C → handpenningslån / överbryggningslån rates if the user is asking about short-term bridge financing.
5. Emit one merged JSON shape (see Expected Output). Total wall time across all four calls: ~1–2 seconds.

### Workflow — start a mortgage application (lånelöfte / pre-approval)

The agent **cannot complete the application** — it terminates at BankID. The job is to deliver the user to the correct starting URL.

1. **Hand-off URL**: `https://www.sbab.se/1/privat/lana/bolan/ansok_om_lanelofte.html` — the marketing landing page with the "Ansök om lånelöfte" CTA.
2. (Optional) Skip the marketing page and deep-link straight to the pre-application gate: `https://www.sbab.se/1/privat/lana/bolan/ansok_om_lanelofte/ansok_om_lanelofte.html`. This page shows a "Bra att veta innan du fortsätter" notice (credit check disclosure, dual-BankID requirement for co-applicants) and a **"Fortsätt med ansökan"** button.
3. (Optional) Deep-link the calculator/wizard itself: `https://www.sbab.se/1/privat/lana/bolan/rakna_pa_bolan.html?content=first-start` — this is **Step 1 of 5** of the loan-promise flow ("Bolånekalkyl"). The wizard collects:
   - Step 1: How far along in the purchase (`Letar efter bostad eller är i budgivning` / `Har vunnit en budgivning` / `Redan skrivit kontrakt`) + property type (`Villa` / `Bostadsrätt` / `Fritidshus`).
   - Steps 2–5: Property value, loan amount, applicant income, optional co-applicant, BankID signing.
4. After step ~4 the flow redirects to `https://secure.sbab.se/logga-in?dep=privat&redirect=…` for BankID. **Stop here.** Tell the user "Open the BankID app on your phone, scan the QR code on the screen, and continue the application yourself."

For users who have an existing SBAB customer relationship the flow is at `https://secure.sbab.se/logga-in` and they update an existing lånelöfte; for new customers the rakna_pa_bolan calculator collects everything before requiring BankID.

### Workflow — open a savings account (Sparkonto or Fasträntekonto)

1. **Hand-off URL (Sparkonto, new customer)**: `https://secure.sbab.se/logga-in?dep=privat&redirect=/sparkonto/oppna&content=first-vs`
2. **Hand-off URL (Fasträntekonto, new customer)**: `https://secure.sbab.se/logga-in?dep=privat&redirect=/sparkonto/oppna&content=second-vs`
3. **Hand-off URL (existing customer)**: `https://secure.sbab.se/logga-in?dep=privat&redirect=/sparkonto/oppna&content=kalkyl` — same destination, the `content=*` param is an analytics breadcrumb.
4. The redirect lands on a chooser ("Logga in på SBAB som" — Privatperson / Företag & Bostadsrättsförening / Första gången på SBAB?). For private savings, the user picks **Privatperson**, which renders the **Mobilt BankID QR-code** screen (`/logga-in/privat/other-device/CONTINUE`). The user scans with their BankID app on their phone, then the post-auth flow at `/sparkonto/oppna` walks: choose product → confirm personal data → e-sign with BankID → account opens immediately.
5. To open a child-savings account (Barnsparkonto) or joint account (Gemensamt sparkonto), the marketing pages are `/1/privat/spara/sparkonto/barnsparkonto.html` and `/1/privat/spara/sparkonto/gemensamt_sparkonto.html`; both terminate at the same `/sparkonto/oppna` BankID gate.

### Browser fallback (only if the JSON APIs ever 4xx)

The list-rate table and Fasträntekonto table both render server-side in the page HTML — they don't require JS. If endpoints A/D/E are ever blocked:

```bash
browse cloud fetch "https://www.sbab.se/1/privat/vara_rantor.html"
browse cloud fetch "https://www.sbab.se/1/privat/spara/sparkonto/sparrantor.html"
```

Both come back as 200 HTML. The list-rate table starts at the substring `Bindningstid Listränta, maj` and rows match `<td>(3 mån|N år)</td>...<td>(\d+,\d+)\s*%</td>`. The personalised "Din räntesats" column is hydrated client-side from the static list rate + a JS LTV table — it will be missing from a bare fetch. **A residential proxy is not required.**

## Site-Specific Gotchas

- **The six JSON APIs are public, unauthenticated, and uncached at the edge** (`Akamai-Cache-Status: NotCacheable from child`, `Cache-Control: no-store`). No `Referer`, `Origin`, or cookie is required — verified with `browse cloud fetch` from the sandbox. No rate-limit observed, but be polite (≤1 req/s sustained, the data only changes ~quarterly).
- **The list-rate API is the source of truth — never scrape the HTML when you can hit the API.** The HTML page also embeds a stale-looking static value (e.g. `Sparränta 2,00 % Senast ändrad 2022-11-17` in the body text) that the JS layer overwrites with the live API rate (`1,25 %`) at render time. A naïve HTML-text scrape will return the wrong number.
- **`validFrom` ≠ today.** Each rate carries the date it was last changed (e.g. `2026-03-31` even when fetched in mid-May). Don't render `validFrom` as "today's rate date" — render it as "rate effective from" / "senast ändrad".
- **Numeric format**: all rates are strings, period-separated (`"3.20"` not `3.20`). The website displays them as comma-separated Swedish style (`3,20 %`). Convert at the presentation layer; never parseFloat without `.replace(',', '.')` when reading off the rendered page.
- **`P_*` enum is positional, not numeric.** `P_3_MONTHS` (not `P_03_MONTHS`), `P_1_YEAR` (singular), `P_2_YEARS`–`P_10_YEARS` (plural). The companion `/v1/interest/effective` uses `interestPeriod` in **months** (3, 12, 24, 36, 48, 60, 84, 120) and `referenceId` SKU codes (`LIS_BO_03M`, `LIS_BO_01Y` … `LIS_BO_10Y`) — note the **`01Y`** form, not `1Y`.
- **Three different rate columns on the rates page**, easy to confuse: **Din räntesats** (LTV-discounted personal rate the user would actually pay), **Grönt Bolån** (≈10bps below "Din räntesats" for energy-class-A/B/C properties — eligibility requires the property's energy certificate), and **Listränta** (the headline list/sticker rate, what the JSON API returns). When a user asks "what's the rate?" without context, the **list rate** is the safe default — that's what banks legally advertise.
- **The calculator's personalised-rate API is POST-only.** `GET /api/interest-calculation-service/api/v1/effective-interest/mortgage` returns `400 {"error":"Request method 'GET' is not supported"}`. The page's JS posts `{loanAmount, propertyValue, period}` to it on input change. A `browse cloud fetch` is GET-only, so personalised rates must be read off the page DOM or via a `browse eval` POST through page-context `fetch()`. Endpoint payload schema was not end-to-end validated during this skill's discovery; if you need personalised rates programmatically, drive the page calculator instead and read the `[table]` rows.
- **Snittränta (monthly average actual customer rate) is a separate disclosure** that loads in a tab. It is the regulatory monthly-average rate banks publish per Finansinspektionen rules. Don't conflate with `listInterests` — the list rate is the headline, the snittränta is the historical actual-paid average. The snittränta tab lives behind the `button: Genomsnittsräntor` toggle on the rates page; the data is loaded async and was not isolated to a dedicated public endpoint during this run (paths like `/api/interest-mortgage-service/api/external/v1/interest/average` return the same list rates, not the snittränta).
- **The mortgage application is a 5-step wizard, NOT a single form.** Step indicator at the top reads `meter: Steg 1 av 5 - Bolånekalkyl`. Don't promise the user "click apply and you're done" — set expectations for a multi-step flow ending at BankID.
- **`bolanekalkylen.html` is robots.txt-disallowed** for crawlers. The actual production calculator path is `rakna_pa_bolan.html` (the `bolanekalkylen` URLs are legacy and intentionally blocked from indexing). Use `rakna_pa_bolan.html?content=first-start`.
- **All BankID flows terminate the agent's run.** Mortgage application, savings opening, joint accounts, child accounts — every write operation on sbab.se sits behind Mobilt BankID. There is **no API-key, OAuth, or public dev portal for personal banking** (the `developer.sbab.se` portal exposes only Open Banking APIs — AIS/PIS — for verified PSD2 third parties, not direct customer onboarding). Tell the user this is a regulatory hard requirement (Swedish FFFS 2014:5 / strong customer authentication), not a UX choice.
- **`https://www.sbab.se/1/privat/spara/sparkonto.html` is a 404.** The actual product page is `/1/privat/spara/sparkonto/vart_sparkonto.html` and the rates page is `/1/privat/spara/sparkonto/sparrantor.html`. Don't assume kebab → segment URL mapping.
- **`http://www.sbab.se/2.130/2.149/2.637`** (the indexed-by-Google legacy Sitevision URL) **301-redirects** to `https://www.sbab.se/1/privat/vara_rantor.html`. Use the destination URL directly to save a round-trip.
- **Cookie banner blocks first click on overlay buttons.** The "Samtycke gällande användning av cookies" modal traps clicks until dismissed. If driving via `browse click @<ref>` and the click silently no-ops (no nav, no state change), accept cookies first via `browse click <accept-rekommenderade-ref>` or use `browse eval` to call `.click()` on the underlying button (bypasses some pointer-events traps).
- **Pages are in Swedish only** for personal banking. The `/1/in_english/` tree exists but is summary-marketing only; rates, applications, and the savings open flow are all Swedish. If your user prefers English, surface labels in English but keep the underlying values + URLs intact.
- **No anti-bot on www.sbab.se.** Verified with non-stealth bare fetches. The `--verified --proxies` flags this skill's discovery used were defensive defaults; subsequent runs may drop both to save cost. Akamai serves the site but does not challenge.

## Expected Output

### Shape 1 — Read current rates (the dominant outcome)

```json
{
  "success": true,
  "fetched_at": "2026-05-19T19:21:00Z",
  "mortgage": {
    "list_rates": [
      { "period": "3 mån",  "period_code": "P_3_MONTHS", "interest_rate_pct": 3.20, "effective_interest_rate_pct": 3.25, "valid_from": "2026-03-31" },
      { "period": "1 år",   "period_code": "P_1_YEAR",   "interest_rate_pct": 3.62, "effective_interest_rate_pct": 3.68, "valid_from": "2026-03-31" },
      { "period": "2 år",   "period_code": "P_2_YEARS",  "interest_rate_pct": 3.84, "effective_interest_rate_pct": 3.91, "valid_from": "2026-03-31" },
      { "period": "3 år",   "period_code": "P_3_YEARS",  "interest_rate_pct": 3.99, "effective_interest_rate_pct": 4.06, "valid_from": "2026-03-31" },
      { "period": "4 år",   "period_code": "P_4_YEARS",  "interest_rate_pct": 4.09, "effective_interest_rate_pct": 4.17, "valid_from": "2026-03-31" },
      { "period": "5 år",   "period_code": "P_5_YEARS",  "interest_rate_pct": 4.19, "effective_interest_rate_pct": 4.27, "valid_from": "2026-03-31" },
      { "period": "7 år",   "period_code": "P_7_YEARS",  "interest_rate_pct": 4.38, "effective_interest_rate_pct": 4.47, "valid_from": "2026-03-31" },
      { "period": "10 år",  "period_code": "P_10_YEARS", "interest_rate_pct": 4.59, "effective_interest_rate_pct": 4.69, "valid_from": "2026-03-31" }
    ],
    "assistance_products": [
      { "name": "Handpenningslån",   "id": "A02", "rate_pct": 3.20, "valid_from": "2026-03-31" },
      { "name": "Överbryggningslån", "id": "A03", "rate_pct": 3.20, "valid_from": "2026-03-31" }
    ],
    "notes": "List rates ('listräntor'). Personal rate is lower depending on loan-to-value bucket and Grönt Bolån eligibility."
  },
  "savings": {
    "sparkonto": {
      "name": "Sparkonto Privat",
      "interest_rate_pct": 1.25,
      "change_pp": -0.25,
      "valid_from": "2025-09-24",
      "previous": { "interest_rate_pct": 1.50, "valid_from": "2025-07-21" },
      "free_withdrawals": true,
      "deposit_insurance_covered": true
    },
    "fastrantekonto": [
      { "binding_months": 3,  "label": "3 mån", "interest_rate_pct": 2.35, "change_pp": 0.15, "valid_from": "2026-03-31", "terms_end_date": "2026-08-19" },
      { "binding_months": 6,  "label": "6 mån", "interest_rate_pct": 2.40, "change_pp": 0.15, "valid_from": "2026-03-31", "terms_end_date": "2026-11-19" },
      { "binding_months": 12, "label": "1 år",  "interest_rate_pct": 2.60, "change_pp": 0.20, "valid_from": "2026-03-31", "terms_end_date": "2027-05-19" },
      { "binding_months": 24, "label": "2 år",  "interest_rate_pct": 2.80, "change_pp": 0.20, "valid_from": "2026-03-31", "terms_end_date": "2028-05-19" },
      { "binding_months": 36, "label": "3 år",  "interest_rate_pct": 2.90, "change_pp": 0.20, "valid_from": "2026-03-31", "terms_end_date": "2029-05-18" },
      { "binding_months": 48, "label": "4 år",  "interest_rate_pct": 3.00, "change_pp": 0.20, "valid_from": "2026-03-31", "terms_end_date": "2030-05-17" },
      { "binding_months": 60, "label": "5 år",  "interest_rate_pct": 3.10, "change_pp": 0.20, "valid_from": "2026-03-31", "terms_end_date": "2031-05-16" }
    ]
  }
}
```

### Shape 2 — Mortgage application hand-off

```json
{
  "success": true,
  "action": "mortgage_application_handoff",
  "product": "lanelofte",
  "next_url": "https://www.sbab.se/1/privat/lana/bolan/ansok_om_lanelofte/ansok_om_lanelofte.html",
  "wizard_url": "https://www.sbab.se/1/privat/lana/bolan/rakna_pa_bolan.html?content=first-start",
  "steps": ["Bolånekalkyl", "Preliminärt besked", "Om dig & medsökande", "Inkomst & utgifter", "BankID-signering"],
  "auth_required": "Mobilt BankID",
  "user_instructions": "Öppna länken, fyll i kalkylen, signera ansökan med Mobilt BankID. Vid två sökande måste båda vara på samma plats för BankID-signering."
}
```

### Shape 3 — Savings-account opening hand-off

```json
{
  "success": true,
  "action": "savings_account_handoff",
  "product": "sparkonto",
  "next_url": "https://secure.sbab.se/logga-in?dep=privat&redirect=/sparkonto/oppna&content=first-vs",
  "alternatives": {
    "fastrantekonto": "https://secure.sbab.se/logga-in?dep=privat&redirect=/sparkonto/oppna&content=second-vs",
    "barnsparkonto": "https://www.sbab.se/1/privat/spara/sparkonto/barnsparkonto.html",
    "gemensamt_sparkonto": "https://www.sbab.se/1/privat/spara/sparkonto/gemensamt_sparkonto.html"
  },
  "auth_required": "Mobilt BankID",
  "user_instructions": "Öppna länken, välj 'Privatperson' (eller 'Första gången på SBAB?' om du saknar SBAB-kundkonto), skanna QR-koden med BankID-appen på din telefon, följ stegen och signera kontoöppningen."
}
```

### Shape 4 — Rate-fetch failure (rare; only if all six API endpoints AND the HTML fallback fail)

```json
{
  "success": false,
  "reason": "rate_fetch_failed",
  "attempts": ["interest-mortgage-service/v1/interest", "interest-account-service/v1/products", "interest-account-service/v2/products/fixed_term_deposit/rates", "html_fallback_vara_rantor"],
  "last_status_code": 503,
  "user_message": "SBAB:s räntor är tillfälligt otillgängliga. Försök igen om en stund."
}
```
