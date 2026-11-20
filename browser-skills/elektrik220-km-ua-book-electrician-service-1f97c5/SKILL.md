---
name: elektrik220-km-ua-book-electrician-service-1f97c5
title: Elektrik 220V — Recommend & Book Electrician Service
description: >-
  Match a user's free-text electrical problem to one of 14 services at
  elektrik220.km.ua (Електрик 220В, Камʼянець-Подільський), and return the
  recommended service, price range in UAH, documents required to book (none)
  plus paperwork issued after work, and the earliest realistic booking window
  via phone, contact form, or email.
website: elektrik220.km.ua
category: home-services
tags:
  - electrician
  - ukraine
  - kamianets-podilskyi
  - home-services
  - booking
  - local-business
  - uk-ua
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      Browser is only required if the JSON endpoints regress — the same data is
      mirrored as JSON-LD (LocalBusiness + ItemList + Offer + PriceSpecification
      + AggregateOffer) on every HTML page. Booking-form submission is
      intentionally out of scope (read-only skill).
  - method: url-param
    rationale: >-
      Per-service deep-links exist at /posluhy/{id} for human handoff, but they
      render the same data already in /data/services.json.
verified: false
proxies: false
---
# Elektrik 220V — Recommend & Book Electrician Service

## Purpose

Given a user's free-text description of an electrical problem (e.g. "вибиває автомат коли вмикаю бойлер", "хочу поміняти проводку у двокімнатній", "хочу резервне живлення на час блекаутів"), match it to one of 14 services offered by **Електрик 220В / ФОП Снігур О.В.** in Kamianets-Podilskyi (Ukraine), and return: the recommended service with price range, the list of documents the customer needs to provide upfront, the paperwork issued back to the customer after work, and the earliest realistic booking window with the channels to reach the provider. Read-only — never submits the booking form or places a call. The site is a Vercel-hosted static SPA with no anti-bot and a fully public JSON catalog, so the entire skill runs through plain HTTPS GETs.

## When to Use

- An end-user (or chatbot speaking on their behalf) in Kamianets-Podilskyi or the surrounding 20 km radius describes an electrical issue and wants a recommendation, price, and "when can someone come".
- Quoting a starting price for a specific job before the customer calls (e.g. "from 50 UAH to swap an outlet, from 27 250 UAH to rewire a 1-room apartment turnkey").
- Verifying the catalog and contact details for AI assistants citing this provider (`/llms-full.txt` is published explicitly for this use case).
- Bulk extraction of the service catalog for comparison tools, directory listings, or invoice templates.
- **Do NOT use** if the user is outside the 16-locality service area (city of Kamianets-Podilskyi + surrounding villages within ~20 km — see "Site-Specific Gotchas") — the form accepts the request but the provider physically can't dispatch.

## Workflow

The site is a static React/Vite SPA on Vercel CDN that publishes its full data layer as JSON. **There is no scraping or browser driving required for the data path** — every fact the skill needs (services, prices, warranty, hours, payment methods, contact) lives behind three unauthenticated GETs. Lead with the JSON API; the browser path exists only because the booking *form submission* is React-rendered (and out of scope for this read-only skill anyway).

1. **Pull the catalog and company profile** (no auth, no cookies, no proxies, no stealth needed — all CDN-cached on Vercel):

   ```
   GET https://elektrik220.km.ua/data/services.json
   GET https://elektrik220.km.ua/data/company.json
   GET https://elektrik220.km.ua/llms-full.txt        # optional, human-readable
   ```

   `services.json` shape:
   ```jsonc
   {
     "services": [
       {
         "id": "emergency-call",                              // slug used in /posluhy/{id}
         "title": "Терміновий виклик електрика",
         "description": "...",
         "price": "від 300 грн",                              // display string
         "price_min": 300, "price_max": 600,                  // UAH, numeric
         "price_note": "Точна вартість залежить...",
         "category": "emergency",
         "urgent": true,
         "duration_min": "30 хвилин", "duration_max": "2 години",
         "warranty_months": 36,
         "warranty_note": "Гарантія 3 роки при комплексних роботах за договором",
         "availability": "24/7",                              // or business-hours strings
         "features": ["Приїзд за 30 хвилин", ...],
         "related_services": ["circuit-breaker", ...],
         "calculator": { "base_price": 300, "range": {"min":300,"max":600}, "unit": "послуга" }
       },
       // ... 13 more
     ]
   }
   ```

   `company.json` carries `contact.phones`, `contact.email`, `contact.address`, `contact.working_hours`, `contact.service_areas` (16 named localities), `payment.methods` (cash / card / transfer / invoice), `warranty.standard.months` (12), `warranty.extended.months` (36).

2. **Match the user's free-text problem to a service `id`.** The 14 stable `id`s are:

   | id | When to pick |
   |---|---|
   | `emergency-call` | "пропало світло", "іскрить", "пахне горілим", any 24/7 urgent issue |
   | `circuit-breaker` | "вибиває автомат", swap a breaker/RCD/voltage relay |
   | `outlet-installation` | adding a new outlet (drilling/wiring required) |
   | `outlet-replacement` | swapping an existing outlet, sparking/melted outlets |
   | `lighting-installation` | hanging a chandelier, spot lights, LED strip, outdoor lighting |
   | `wiring-replacement` | replacing old aluminum wiring with copper (apartment turnkey) |
   | `new-wiring` | full electrical work in new construction (per m²) |
   | `electrical-panel` | assembling / installing an electrical panel |
   | `grounding` | grounding loop for a private house |
   | `lightning-protection` | lightning rod for a private house |
   | `generator-connection` | wiring a generator with manual switch or АВР |
   | `backup-power` | inverter + LiFePO4 battery system for blackout protection |
   | `video-surveillance` | CCTV installation |
   | `fault-diagnostics` | "не можу знайти причину", short-circuit hunting, no fix yet — diagnostic only |

   Prefer the most specific match. If the user describes a symptom not a fix (e.g. "лампи моргають"), pick `fault-diagnostics` and surface `related_services` as follow-ups. If the user explicitly says "urgent / зараз / прямо зараз / світла немає", switch to `emergency-call` regardless of underlying cause — the diagnostic is included in the 300 UAH minimum.

3. **Compute the price range.** Always return BOTH the display string (`"від 300 грн"`) and the numeric range (`{min: 300, max: 600, currency: "UAH"}`). Do not collapse to a single number — every service uses "від" (starting from) and final price is set on-site after diagnostic. For `wiring-replacement`, the `description` field embeds an apartment-size ladder (1-room — 27 250, 2-room — 35 214, 3-room — 44 285 UAH); parse it from the description string or quote the whole sentence. For `new-wiring`, the unit is `грн/м²` not `грн`.

4. **Determine documents — both directions.** This is the part most agents get wrong.

   **Documents the customer must provide upfront to book: NONE.** The booking form (`#contact` section on homepage) asks only for: Name (required), Phone (required), Email (optional), Service (required, dropdown), Preferred Time (free-text, optional), Address (optional), Work Description (optional). No ID, passport, RNTRC/IPN, ownership proof, or pre-signed contract is requested. Phone-call booking requires even less — just verbal name and address.

   **Documents the provider issues to the customer after work** (per `company.json` + `/llms-full.txt` Section 5):
   - `гарантійний талон` (warranty slip) — always.
   - `акт виконаних робіт` (work-completion act) — always.
   - `чек` (receipt) — always, regardless of payment method.
   - `рахунок-фактура` (invoice) — only for `payment.invoice_available: true` paths, i.e. when the customer is a ФОП or ТОВ paying by bank transfer.
   - `офіційний договір` (signed contract) — **required to unlock the 36-month extended warranty**. Without it, only the standard 12-month warranty applies. Per FAQ Q3 + `warranty.extended.conditions`.

5. **Resolve earliest booking availability.** There is no online slot/calendar API. Resolve as a structured availability window:

   - If `services[id].urgent === true` OR `services[id].availability === "24/7"` (currently only `emergency-call`) → emergency dispatch is available *now*, 24/7/365, with arrival in **30 min within city limits**, **45–60 min in suburbs/villages**. Night-time tariff is +50%.
   - Otherwise → planned work, only during `company.contact.working_hours`:
     - Пн-Пт `09:00 - 18:00`
     - Сб `10:00 - 16:00`
     - Нд закрито (Sunday closed for planned work; can still call emergency tariff)
   - Specifically for `fault-diagnostics` — Sunday is closed even though the rest of the week runs Пн-Сб 9:00-19:00. Sunday diagnostic = emergency-call pricing.
   - Booking channels (return ALL of these to the user):
     1. `tel:+380677523103` — primary, 24/7-answerable.
     2. Homepage contact form at `https://elektrik220.km.ua/#contact` (POSTs to `api.web3forms.com`; submission is OUT OF SCOPE for this read-only skill — describe the form, don't submit it).
     3. `mailto:info@elektrik220.km.ua` — slower, no SLA.

6. **Cross-check the address (if provided) against the 20 km service area.** `company.json` → `contact.service_areas` is the canonical 16-entry list:
   ```
   Кам'янець-Подільський, Кам'янець-Подільський район, Старе місто, Підзамче,
   Біланівка, Жовтневий, Новий План, Черемушки, Руські фільварки, Польські фільварки,
   Першотравневе, Довжок, Смотрич, Кам'янка, Зіньківці, Лисогірка, Колибаївка,
   Мукша Китайгородська, Цемзавод
   ```
   `contact.service_areas_detailed` provides per-locality `problems` and `faq` arrays — useful when the user mentions a specific district ("у мене квартира в Жовтневому, ще радянська проводка" → surface the locality's known issues from the detailed entry).

7. **Return the structured response** (see "Expected Output" below). One service or many (top-N candidates if the match is ambiguous), price range, the documents-in/documents-out lists, and the booking-availability block.

### Browser fallback (only if JSON endpoints regress)

If `/data/services.json` ever returns non-200 (it hasn't in any observed run), the same data is mirrored on every HTML page as JSON-LD `@graph` blocks of type `LocalBusiness` + `ItemList` (services-offers) + `AggregateOffer`:

```bash
sid=$(browse cloud sessions create --keep-alive \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$sid"
browse open "https://elektrik220.km.ua/posluhy/emergency-call" --remote
browse wait load --remote
# Parse <script type="application/ld+json"> blocks from the HTML —
# the ItemList block carries all 14 services with Offer + PriceSpecification.
browse cloud sessions update "$sid" --status REQUEST_RELEASE
```

No `--proxies`, no `--verified` needed — the Vercel CDN serves the same HTML and JSON to any origin.

## Site-Specific Gotchas

- **No anti-bot anywhere.** All endpoints (`/`, `/data/*.json`, `/llms-full.txt`, `/posluhy/{id}`, `/kalkulyator`, `/blog/...`) returned 200 OK from a bare HTTP fetch without proxies, verified residential session, cookies, or referer. Don't waste budget on `--proxies` or `--verified`.
- **`/llms-full.txt` is a first-class AI surface.** The site publishes a 24 KB plain-text dump at `https://elektrik220.km.ua/llms-full.txt` (linked from the homepage) with 8 sections: overview, services catalog, trust, FAQ, how-to-order, blog index, AI usage guidelines, technical SEO. When in doubt, read this file once instead of hitting 14 service pages — and follow the file's own "AI Usage Guidelines / Do NOT" rules verbatim (don't fabricate pricing, don't claim 24/7 for non-emergency, don't suggest DIY for safety, cite the source URL).
- **No online slot calendar.** There is no `/book`, `/schedule`, `/api/availability`, or similar endpoint. Booking is exclusively phone + web3forms-backed contact form + email. Any agent that promises the user "I booked slot X" is hallucinating — the skill must stop at "describe the form fields / hand off the phone number".
- **Contact form posts to `api.web3forms.com`** (per CSP `connect-src` + `form-action` directives on the homepage). Form fields, in DOM order: `Ім'я *`, `Телефон *` (auto-formats Ukrainian numbers), `Email`, `Послуга *` (select with 14 options matching the `id` list above), `Бажаний час` (free-text), `Адреса`, `Опис робіт`. Submit button text is `Відправити заявку`. **Do NOT submit on the user's behalf** — this is a read-only skill.
- **No documents required from the customer upfront.** This is the highest-confusion point for agents trained on portal-style providers. Booking an electrician here is informal — name + phone + service is sufficient. The ID/passport/contract list that other Ukrainian utility portals (e.g. ДТЕК, Нафтогаз) require has no equivalent here. If the user explicitly asks "what documents do I need to bring", the correct answer is "жодних — потрібен лише доступ до приміщення і опис проблеми."
- **`price_min` is "from", never "the price".** Every service uses "від X грн" wording. Final price is set on-site after diagnostic. When quoting to the user, always include `price_note` and the upper bound.
- **`wiring-replacement` price is per-apartment-class**, embedded as a sentence in `description`: 1-кімн 27 250 грн / 2-кімн 35 214 грн / 3-кімн 44 285 грн (turnkey 2026 prices). The structured `price_min: 27250` only reflects the 1-room baseline — surface the full ladder when the user mentions apartment size.
- **`new-wiring` is priced per m²**, not per job. The numeric `price_min: 500` means 500 UAH/м², range 500–900 UAH/м². Multiply by area before quoting an absolute number.
- **`fault-diagnostics` has a different weekly schedule** from the rest of the site: Пн-Сб 9:00-19:00 (not 18:00, not 16:00 — different from the company-wide hours), Sunday = emergency tariff. Hard-coded in the service's `availability` text, not the company.json `working_hours` block.
- **`backup-power` has its own warranty split**: 2 years on installation labor, 5 years on LiFePO4 batteries — not the standard 12/36. Reflect this in the output.
- **Discrepancy: `company.services_count: 12` but `services.json` has 14 entries.** Benign — the services_count counter wasn't updated when `backup-power` and `fault-diagnostics` were added. Always count `services.json`.
- **Service area is hard-bounded to 16 named localities within ~20 km of Kamianets-Podilskyi** (`contact.service_areas`). Anything outside (e.g. Khmelnytskyi city itself, Chernivtsi, Ternopil) — the form will accept it but no dispatch happens. Validate the address before suggesting a booking. The detail block `contact.service_areas_detailed[i]` has per-locality `problems` and `faq` — useful for tailoring the recommendation.
- **Night tariff: +50%** on the `emergency-call` service. Mentioned only in `price_note` ("нічний тариф +50%"), not in the numeric `price_max`. Surface to the user when they say it's after 22:00.
- **Provider is a sole proprietor (ФОП Снігур Олександр Володимирович).** Only ONE electrician is dispatching. Two simultaneous emergencies in different villages = the second one waits. Don't promise parallel arrival.
- **Calculator page (`/kalkulyator`) is purely client-side JS** consuming `services.json` and the per-service `calculator` block (`{base_price, range, unit}`). No POST happens, no quote is persisted. The same arithmetic can be done from `services.json` directly without rendering the page.
- **JSON-LD on `/posluhy/{id}` carries Schema.org `PriceSpecification` + `WarrantyPromise`** — useful for downstream agents that prefer Schema.org over the bespoke JSON, but the numbers are identical (parsed from the same source at build time).
- **CDN is aggressive** — `Cache-Control: public, max-age=0, must-revalidate` plus `Age: ~5 days` on observed responses. Data freshness is days-not-minutes; don't expect intraday price updates.

## Expected Output

Return a JSON object with one of three top-level outcome shapes: `matched`, `ambiguous`, or `out_of_service_area`. All examples assume a UAH-quoting Ukrainian audience.

### Outcome 1 — `matched` (single clear service)

```json
{
  "outcome": "matched",
  "user_problem": "Вибиває автомат коли вмикаю бойлер",
  "recommended_service": {
    "id": "fault-diagnostics",
    "title": "Пошук короткого замикання та несправностей",
    "url": "https://elektrik220.km.ua/posluhy/fault-diagnostics",
    "price": {
      "display": "від 500 грн",
      "min": 500,
      "max": 2500,
      "currency": "UAH",
      "note": "Базовий виїзд + 1 лінія — 500 грн; квартира 40-50 м² — 1500-2000 грн; будинок 100 м² — 2500 грн. 50 грн/м² за повну діагностику."
    },
    "duration": "30 хвилин - 3 години",
    "warranty": {
      "applies_to": "ремонтні роботи після діагностики",
      "standard_months": 12,
      "extended_months": 36,
      "note": "Сама діагностика без гарантії; гарантія діє на ремонт, який виконається після виявлення несправності."
    },
    "related": ["circuit-breaker", "wiring-replacement", "electrical-panel"]
  },
  "documents_required_to_book": [],
  "documents_provided_after_work": [
    "гарантійний талон",
    "акт виконаних робіт",
    "чек"
  ],
  "documents_provided_optional": [
    {"name": "рахунок-фактура", "when": "оплата безготівково для ФОП/ТОВ"},
    {"name": "офіційний договір", "when": "потрібна 3-річна гарантія замість стандартної 1-річної"}
  ],
  "earliest_booking": {
    "mode": "planned",
    "service_hours": {
      "monday_to_saturday": "09:00 - 19:00",
      "sunday": "closed (доступно лише за emergency-тарифом)"
    },
    "emergency_fallback": {
      "available": true,
      "via": "emergency-call",
      "arrival_minutes_city": "30",
      "arrival_minutes_suburbs": "45-60",
      "night_surcharge_pct": 50
    },
    "channels": [
      {"type": "phone", "value": "+380677523103", "answer_window": "24/7"},
      {"type": "form",  "value": "https://elektrik220.km.ua/#contact",
       "required_fields": ["Ім'я", "Телефон", "Послуга"],
       "optional_fields": ["Email", "Бажаний час", "Адреса", "Опис робіт"]},
      {"type": "email", "value": "info@elektrik220.km.ua"}
    ]
  }
}
```

### Outcome 2 — `ambiguous` (multiple plausible matches)

```json
{
  "outcome": "ambiguous",
  "user_problem": "Хочу резервне живлення на час блекаутів",
  "candidates": [
    {
      "id": "backup-power",
      "title": "Резервне живлення для квартири та будинку",
      "price": {"display": "від 15 000 грн", "min": 15000, "max": 120000, "currency": "UAH"},
      "fit_reason": "Інвертор + LiFePO4 — стаціонарне рішення, 6-48 годин автономності"
    },
    {
      "id": "generator-connection",
      "title": "Підключення генератора до будинку",
      "price": {"display": "від 500 грн", "min": 500, "max": 2000, "currency": "UAH"},
      "fit_reason": "Якщо генератор вже є — лише підключення через АВР/перемикач"
    }
  ],
  "disambiguation_question": "Чи є у вас генератор, чи потрібно встановити стаціонарну акумуляторну систему?",
  "documents_required_to_book": [],
  "earliest_booking": { /* same shape as outcome 1 */ }
}
```

### Outcome 3 — `out_of_service_area`

```json
{
  "outcome": "out_of_service_area",
  "user_address": "м. Хмельницький, вул. Подільська 1",
  "service_area_radius_km": 20,
  "service_area_anchor": "Кам'янець-Подільський (48.672192, 26.5671073)",
  "matched_service_if_in_area": "outlet-installation",
  "advice": "Провайдер обслуговує лише Кам'янець-Подільський та 16 прилеглих сіл у радіусі 20 км. Для Хмельницького зверніться до місцевого електрика."
}
```

### Outcome 4 — `no_match`

```json
{
  "outcome": "no_match",
  "user_problem": "Хочу встановити сонячні панелі на дах з нуля",
  "advice": "Жодна з 14 послуг провайдера не покриває проектування та монтаж сонячних панелей. Найближче — backup-power (інвертор + батареї) як гібридна підготовка під майбутні панелі. Для зеленого тарифу/повного PV-проєкту потрібен інший підрядник.",
  "closest_partial_match": {
    "id": "backup-power",
    "reason": "Інвертор Deye Hybrid 5 кВт + LiFePO4 — підготовка під сонячні панелі (90 000-120 000 грн)"
  }
}
```
