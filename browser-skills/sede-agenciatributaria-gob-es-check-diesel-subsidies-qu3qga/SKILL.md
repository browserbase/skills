---
name: sede-agenciatributaria-gob-es-check-diesel-subsidies-qu3qga
title: AEAT Diesel Subsidy Lookup (Devoluciones Gasóleo Profesional)
description: >-
  Look up Spain's professional-diesel excise-tax refund (Devolución gasóleo
  profesional, procedure DL03) on AEAT's Sede Electrónica: refund rate,
  eligibility, annual caps, authorised card issuers, and the auth-walled
  personal-refund query.
website: sede.agenciatributaria.gob.es
category: government
tags:
  - spain
  - tax
  - aeat
  - diesel
  - subsidy
  - clave
  - read-only
source: 'browserbase: agent-runtime 2026-05-20'
updated: '2026-05-20'
recommended_method: browser
alternative_methods:
  - method: url-param
    rationale: >-
      Public information pages (informacion-general.html,
      importe-devolucion.html, quienes-tienen-derecho-devolucion.html,
      SvEntQueryW) are static HTML reachable by deterministic URL — fetch
      directly with browse open. No anti-bot, no JS rendering required.
  - method: api
    rationale: >-
      Confirmed unavailable. The personal refund endpoint
      /wlpl/ADG0-JDIT/SvResQueryW is hard-walled behind Cl@ve / certificado
      electrónico / DNIe; direct GET returns 'Página no habilitada en internet
      público' (error id 273359764). No public REST/JSON API exists for the
      diesel-refund program.
verified: true
proxies: true
---
# AEAT — Check Diesel Subsidies (Devoluciones Gasóleo Profesional)

## Purpose

Look up the Spanish Tax Agency's *Devolución parcial del Impuesto sobre Hidrocarburos por el gasóleo de uso profesional* — the partial refund of the Hydrocarbons Excise Tax for professional diesel use, colloquially called the "diesel subsidy" / "subvención del gasóleo profesional". The skill returns one of two outcome shapes:

1. **Program information** (always available, no auth): refund rate, eligibility criteria, annual caps, regulatory basis, list of authorised professional-diesel card issuers.
2. **Personal refund balance** (Cl@ve / certificado electrónico / DNIe REQUIRED — agent cannot complete unaided): accumulated litres declared, refund amount processed, payment status, vehicle-by-vehicle breakdown.

Read-only — never files a new application, never submits supply declarations.

> **Scope assumption:** The user prompt "check diesel subsidies" is ambiguous between (a) "tell me about the Spanish diesel-refund program" and (b) "show me my personal refund balance". The skill handles (a) end-to-end; for (b) it leads the user to the authenticated Cl@ve flow but cannot complete it without their credentials. This is documented as an outcome branch in *Expected Output*.

## When to Use

- Answering questions like *"How much does Spain refund for professional diesel?"*, *"Who can claim the gasóleo profesional subsidy?"*, *"What's the cap per vehicle?"*
- Looking up the official list of authorised gasóleo-profesional card issuers (Solred, Cepsa, Galp, etc.) and their commercial card names.
- Pointing a Spanish transport operator / taxi driver at the correct AEAT sede page to query *their* accumulated refunds (Consulta de Devoluciones).
- Confirming the regulatory basis (Ley 38/1992 art. 52 bis, Orden HFP/941/2022) for legal/accounting workflows.
- **Do NOT use for**: applying for new beneficiary registration (`BenMantW`), submitting supply declarations (Modelo "gasóleo profesional"), or filing the annual kilometre report — those are write operations and out of scope.

## Workflow

This task has **no API and no URL-param shortcut**. The AEAT *Sede Electrónica* is a classic Spanish-government e-office: every personalised query is gated by a Spanish national e-ID (Cl@ve Móvil / Cl@ve PIN / Certificado electrónico / DNIe). Public information pages are static HTML and can be read with a plain `browse open` — no stealth, no proxies required (the site is bot-friendly). The endpoint `https://www2.agenciatributaria.gob.es/wlpl/ADG0-JDIT/SvResQueryW` (the personal refund query) is explicitly disabled for unauthenticated public-internet access — direct GET returns *"Página no habilitada en internet público ADG0-JDIT/SvResQueryW. Desactivada temporalmente"*. The only legitimate entry is through `SelectorAccesos.html?ref=...&aut=CP`, which then performs the Cl@ve / certificate hand-off.

### 1. Decide which outcome shape the user wants

| Question style | Outcome shape | Auth needed? |
|---|---|---|
| "What is the refund rate / who's eligible / how much per litre?" | `program_info` | No |
| "Show me the list of authorised card issuers" | `card_issuers` | No |
| "How much have *I* been refunded? / What's *my* balance?" | `personal_refunds` | **Yes — Cl@ve / cert / DNIe** |

### 2. For `program_info` — fetch the static pages

Open these in order; harvest the indicated fields verbatim from the page text:

```
GET https://sede.agenciatributaria.gob.es/Sede/impuestos-especiales-medioambientales/devoluciones-gasoleo-profesional.html
  → top-level overview, list of "Gestiones destacadas"

GET .../devoluciones-gasoleo-profesional/informacion-general.html
  → § Información — regulatory basis (Ley 38/1992 art. 52 bis; Orden HFP/941/2022)

GET .../informacion-general/quienes-tienen-derecho-devolucion.html
  → § Eligibility — three vehicle classes (see Expected Output)

GET .../informacion-general/importe-devolucion.html
  → § Refund amount — €49 / 1000 L (since 2019-01-01),
    cap 50,000 L/vehicle/year (5,000 L/taxi/year)

GET .../devoluciones-gasoleo-profesional/preguntas-frecuentes.html
  → FAQ (general questions)

GET .../devoluciones-gasoleo-profesional/frecuently-asked-questions.html
  → English FAQ for non-Spain-resident beneficiaries
```

For non-resident EU beneficiaries also fetch `.../solicitud-devolucion-residentes-otros-estados-ue.html`.

**Localisation:** Replace the `/Sede/` path prefix with `/Sede/ca_es/`, `/Sede/gl_es/`, `/Sede/va_es/`, `/Sede/eu_es/`, or `/Sede/en_gb/` to get Catalan / Galician / Valencian / Basque / English versions. The English versions are abridged — Spanish is authoritative.

### 3. For `card_issuers` — fetch the public registry

```
GET https://www2.agenciatributaria.gob.es/wlpl/ADG0-JDIT/SvEntQueryW
```

This is a public, **unauthenticated** endpoint despite living under `wlpl/ADG0-JDIT/` (which is the same path family as the auth-walled `SvResQueryW`, `SvBenQueryW`, `SvLicFomentoQueryW` — but `SvEntQueryW` is whitelisted for public access). Returns an HTML table with columns:

- `Código` — internal AEAT issuer code (e.g. `E0001`).
- `Denominación de la Entidad Emisora` — legal name of the issuing company.
- `Denominación Comercial de la Tarjeta` — commercial card name (e.g. "Solred", "Cepsa Star Direct", "Galp Frota").

Sort options: by code, by entity name, by card name (query-string controlled). Parse the table rows with `browse get markdown body` then extract the markdown table — no AJAX, no JS rendering required.

### 4. For `personal_refunds` — surface the auth wall, do not attempt to bypass

This is the genuine "check my diesel subsidy" path. The agent **cannot** complete this without the user's Cl@ve credentials or an installed digital certificate — both are non-portable and tied to a Spanish citizen / company NIF.

Return the deep-link URL and instruct the user to complete the auth in their own browser:

```
https://sede.agenciatributaria.gob.es/static_files/common/html/selector_acceso/SelectorAccesos.html?ref=%2Fwlpl%2FADG0-JDIT%2FSvResQueryW&aut=CP
```

The `SelectorAccesos.html` page presents two auth options:

- **Cl@ve Móvil** — APP Cl@ve push confirmation (recommended) or PIN-by-SMS fallback. Requires prior Cl@ve registration (`/Sede/clave.html`).
- **Certificado o DNI electrónico** — browser-installed personal certificate or Spanish e-DNI card with reader.

Procedure code is **DL03** (II.EE. Devolución de gasóleo profesional). The procedure record at `/Sede/procedimientos/DL03.shtml` lists three accepted ID systems: *DNI electrónico, Certificado electrónico, Clave PIN*, all "Nivel 4: Tramitación electrónica" (highest assurance).

Sister authenticated endpoints under the same procedure family (same auth wall):

- `SelectorAccesos.html?ref=%2Fwlpl%2FADG0-JDIT%2FSvBenQueryW&aut=CP` — vehicle & beneficiary lookup (which vehicles am I registered for?).
- `SelectorAccesos.html?ref=%2Fwlpl%2FADG0-JDIT%2FSvLicFomentoQueryW&aut=CP` — transport-licence registry lookup.

### 5. Browser flow (read-only program-info path, fallback)

If the static-fetch path fails (e.g. AEAT temporary outage — see "Horario de interrupciones de sede"), drive the browser:

```bash
sid=$(browse cloud sessions create --keep-alive | node -e "...")
export BROWSE_SESSION="$sid"
browse open "https://sede.agenciatributaria.gob.es/Sede/impuestos-especiales-medioambientales/devoluciones-gasoleo-profesional.html" --remote
browse get markdown body --remote
# Walk the three index pages via the "Siguiente" / "Anterior" links in the
# in-page paginator (URLs are deterministic — see step 2 list).
```

No stealth / residential proxy needed — the site does **not** anti-bot on public pages. A bare session is sufficient.

## Site-Specific Gotchas

- **Bare endpoint to the personal query returns a confusing 200-with-error-body**: hitting `https://www2.agenciatributaria.gob.es/wlpl/ADG0-JDIT/SvResQueryW` directly (no SelectorAccesos referer) returns HTML with `<title>Gestión de errores</title>` and the message *"Página no habilitada en internet público ADG0-JDIT/SvResQueryW. Desactivada temporalmente"*, plus error id `273359764`. This is **not** a real outage — it's the standard "no auth context, no allow-list" response. Don't waste time retrying. The only entry is `SelectorAccesos.html?ref=...&aut=CP`.
- **Same wlpl path family, different access rules**: `SvResQueryW` / `SvBenQueryW` / `SvLicFomentoQueryW` require auth, but `SvEntQueryW` (entidades emisoras) is publicly readable. Don't assume the whole `/wlpl/ADG0-JDIT/` namespace is walled — test each endpoint with a bare GET.
- **`aut=CP` is the auth-mode hint**: in `SelectorAccesos.html?ref=...&aut=CP`, `CP` means *Certificado + Cl@ve Permanente / PIN*. The exact set of presented identity options depends on this flag. Don't strip it.
- **URL-encoded `%2F` inside `ref=`**: the `SelectorAccesos.html?ref=%2Fwlpl%2F...` URL keeps the inner path percent-encoded. Decoding to literal slashes breaks the gateway. Pass the URL through unchanged.
- **Refund amount is fixed at €49/1000 L since 2019-01-01** (article 52 bis.6 Ley 38/1992). Earlier rates exist (€48 for 2018, etc.) — the AEAT page only states the current rate. If asked for historical rates, point to the BOE consolidated text of Ley 38/1992 art. 52 bis: `https://www.boe.es/buscar/act.php?id=BOE-A-1992-28741#a52bis`.
- **Annual cap is per-vehicle, not per-NIF**: 50,000 L per vehicle per year (5,000 L for taxis). A beneficiary with N trucks gets up to N × 50,000 L × €0.049/L = N × €2,450/year refund capacity.
- **Eligibility is binary on three vehicle classes**: trucks ≥7.5 t MMA (own-account or for-hire), M2/M3 passenger transport (per EU Directive 70/156/EEC), and taxi-licensed taxicabs with taximeter. Light commercial vans (≤7.5 t) and ride-hail VTC are **not** eligible.
- **"Devoluciones gasóleo profesional" ≠ "Devoluciones gasóleo agrícola"**: they're separate programs with separate procedures, separate orders (Orden HFP/941/2022 vs. Orden EHA/993/2010), and separate refund rates. The agricultural-diesel page sits at `.../devoluciones-gasoleo-agricola.html`. Don't confuse them when the user says "diesel subsidy".
- **The procedure code DL03 is the refund itself; DM02 is the census of beneficiaries**. Both surface on `/Sede/procedimientos/` and `/Sede/procedimientoini/`. Reference DL03 in any user-facing answer about refunds.
- **Cl@ve registration is a separate prerequisite**: a user without Cl@ve credentials cannot bootstrap from inside the AEAT site — they must register first via `/Sede/clave.html` or in-person at an AEAT office. Surface this if the user says "I don't have Cl@ve".
- **No anti-bot, no rate-limit observed** on public pages. The cloud-search index already covers every URL in the diesel-refund tree, so `browse cloud search "sede agencia tributaria gasoleo profesional consulta devolucion"` is the fastest way to enumerate sub-pages.
- **"Asistencia digital (ADI)" call-back service** (`https://www2.agenciatributaria.gob.es/wlpl/TOCP-ADMI/Asistente?tipoEntrada=S&procedimiento=G281`) lets a beneficiary request a phone call from AEAT to help with the refund process — surface this URL if the user is stuck on form completion.
- **Multilingual URL pattern**: every `/Sede/...` path mirrors at `/Sede/ca_es/...`, `/Sede/gl_es/...`, `/Sede/va_es/...`, `/Sede/eu_es/...`, `/Sede/en_gb/...`. The English version of the FAQ is at `.../frecuently-asked-questions.html` (note the AEAT-original typo "Frecuently") and is explicitly aimed at non-Spain-resident EU beneficiaries.

## Expected Output

The skill emits one of three JSON shapes depending on the user's intent.

### Shape A — Program information (no auth)

```json
{
  "outcome": "program_info",
  "program": {
    "name_es": "Devolución parcial del Impuesto sobre Hidrocarburos por el gasóleo de uso profesional",
    "name_en": "Partial refund of the Hydrocarbons Excise Tax on professional-use diesel",
    "colloquial": "subvención del gasóleo profesional / diesel subsidy",
    "procedure_code": "DL03",
    "agency": "Agencia Estatal de Administración Tributaria (AEAT)",
    "legal_basis": [
      "Ley 38/1992, de 28 de diciembre, de Impuestos Especiales — art. 52 bis",
      "Orden HFP/941/2022, de 3 de octubre"
    ]
  },
  "refund_rate": {
    "amount_eur_per_1000_l": 49,
    "effective_since": "2019-01-01",
    "rate_source": "Ley 38/1992 art. 52 bis.6"
  },
  "caps": {
    "general_vehicle_max_litres_per_year": 50000,
    "taxi_max_litres_per_year": 5000,
    "max_refund_eur_per_vehicle_per_year": 2450.0,
    "max_refund_eur_per_taxi_per_year": 245.0
  },
  "eligible_vehicle_classes": [
    "Trucks ≥7.5 t MMA for road haulage (own-account or for-hire)",
    "M2 / M3 passenger transport (Directive 70/156/EEC categories)",
    "Licensed municipal taxis with taximeter"
  ],
  "resolution_window_months": 6,
  "auth_required_for_personal_query": true,
  "source_urls": {
    "landing": "https://sede.agenciatributaria.gob.es/Sede/impuestos-especiales-medioambientales/devoluciones-gasoleo-profesional.html",
    "procedure": "https://sede.agenciatributaria.gob.es/Sede/procedimientos/DL03.shtml",
    "info_general": "https://sede.agenciatributaria.gob.es/Sede/impuestos-especiales-medioambientales/devoluciones-gasoleo-profesional/informacion-general.html",
    "eligibility": "https://sede.agenciatributaria.gob.es/Sede/impuestos-especiales-medioambientales/devoluciones-gasoleo-profesional/informacion-general/quienes-tienen-derecho-devolucion.html",
    "refund_amount": "https://sede.agenciatributaria.gob.es/Sede/impuestos-especiales-medioambientales/devoluciones-gasoleo-profesional/informacion-general/importe-devolucion.html",
    "boe_law": "https://www.boe.es/buscar/act.php?id=BOE-A-1992-28741#a52bis",
    "boe_order": "https://www.boe.es/buscar/doc.php?id=BOE-A-2022-16192"
  }
}
```

### Shape B — Authorised card-issuer registry (no auth)

```json
{
  "outcome": "card_issuers",
  "source_url": "https://www2.agenciatributaria.gob.es/wlpl/ADG0-JDIT/SvEntQueryW",
  "issuers": [
    {
      "code": "E0001",
      "entity_name": "<legal name of the issuing company>",
      "card_commercial_name": "<commercial card brand>"
    }
  ],
  "issuer_count": 47,
  "harvested_at": "2026-05-20T13:30:11Z"
}
```

(Issuer codes / names are emitted verbatim from the SvEntQueryW table; example placeholders only.)

### Shape C — Personal refund query (auth wall — agent cannot complete)

```json
{
  "outcome": "personal_refunds_auth_required",
  "auth_wall": true,
  "deep_link": "https://sede.agenciatributaria.gob.es/static_files/common/html/selector_acceso/SelectorAccesos.html?ref=%2Fwlpl%2FADG0-JDIT%2FSvResQueryW&aut=CP",
  "endpoint_codename": "SvResQueryW",
  "procedure_code": "DL03",
  "accepted_auth_methods": [
    "Cl@ve Móvil (APP Cl@ve push or PIN-by-SMS)",
    "Certificado electrónico (browser-installed)",
    "DNI electrónico (Spanish e-ID card + reader)",
    "Cl@ve PIN"
  ],
  "prerequisite": "User must already be registered in Cl@ve OR have a valid AEAT-recognised digital certificate. Cl@ve registration is bootstrapped at https://sede.agenciatributaria.gob.es/Sede/clave.html and is not completable inside this skill.",
  "what_the_authed_query_returns": [
    "Accumulated litres of gasóleo profesional declared per registered vehicle",
    "Refund amount processed (€) per period",
    "Payment status (pending / paid)",
    "Per-vehicle, per-supply breakdown of declared volumes"
  ],
  "user_instruction": "Abra el enlace deep_link en su propio navegador y autentíquese con Cl@ve, certificado o DNIe. El agente no puede completar este paso por usted."
}
```

### Shape D — Direct-endpoint diagnostic (defensive: covers the confusing bare-GET response)

```json
{
  "outcome": "direct_endpoint_disabled",
  "endpoint": "https://www2.agenciatributaria.gob.es/wlpl/ADG0-JDIT/SvResQueryW",
  "aeat_error_message_es": "Página no habilitada en internet público ADG0-JDIT/SvResQueryW. Desactivada temporalmente.",
  "aeat_error_id": "273359764",
  "interpretation": "Not an outage. This is the standard response when SvResQueryW is hit without going through SelectorAccesos.html. Use the deep_link from outcome 'personal_refunds_auth_required' instead.",
  "remediation_url": "https://sede.agenciatributaria.gob.es/static_files/common/html/selector_acceso/SelectorAccesos.html?ref=%2Fwlpl%2FADG0-JDIT%2FSvResQueryW&aut=CP"
}
```
