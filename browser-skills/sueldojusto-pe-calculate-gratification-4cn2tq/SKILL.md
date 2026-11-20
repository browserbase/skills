---
name: sueldojusto-pe-calculate-gratification-4cn2tq
title: Calculate Peruvian Gratificación
description: >-
  Compute a Peruvian worker's statutory July/December gratificación (Ley 27735)
  on the SueldoJusto calculator — returns the computable base, extraordinary
  bonus (9% EsSalud / 6.75% EPS), and total to receive.
website: sueldojusto.pe
category: finance
tags:
  - peru
  - payroll
  - gratificacion
  - labor-law
  - calculator
  - sueldojusto
source: 'browserbase: agent-runtime 2026-07-15'
updated: '2026-07-15'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      None available — the calculator computes entirely in client-side
      JavaScript with no backend endpoint to call. Driving the page is the only
      method.
verified: false
proxies: false
---
# Calculate Peruvian Gratificación (Statutory Semi-Annual Bonus)

## Purpose

Compute a Peruvian worker's legal *gratificación* — the mandatory bonus paid each July (Fiestas Patrias) and December (Navidad) under Ley 27735 — using the SueldoJusto calculator at `sueldojusto.pe`. Given a monthly gross salary plus a few labor parameters (labor regime, health-insurance type, family allowance, months worked, unexcused absences), it returns the computable base, the extraordinary bonus (9% EsSalud / 6.75% EPS), and the total to receive. Read-only: it only reads the calculator's output, never submits personal data anywhere.

## When to Use

- A worker or advisor wants to estimate the July or December gratificación for a given salary.
- You need to model different scenarios: general vs. small-enterprise (MYPE) regimes, EsSalud vs. EPS, with/without family allowance, partial semesters, or absence deductions.
- Anywhere you'd otherwise reimplement the Ley 27735 formula by hand — the calculator applies the current-year constants (RMV 2026 = S/1,130; asignación familiar = S/113.00) and regime factors for you.

## Workflow

This is a **fully client-side calculator** (Astro + React). There is **no API, no network request, and no submitted form** — the result is computed in-browser after you click "Calcular Gratificación". So the only method is driving the page; there is no fetch/API shortcut to prefer. A plain Browserbase remote session passes the site's Cloudflare layer with no `--proxies` or `--verified` needed (verified empirically — see Gotchas).

1. **Open the calculator directly**: `browse open https://sueldojusto.pe/herramientas/calculadora-gratificacion/ --remote`. Then `browse wait timeout 2000` and `browse snapshot`.
2. **Dismiss the cookie dialog**: click the button labeled **"Entendido"** (dialog "Aviso de cookies y publicidad"). Snapshot again — refs shift after it closes.
3. **Salary**: `browse fill "#salary" <amount>` (e.g. `3000`). This is the "Sueldo Mensual Bruto (S/)" field, a plain numeric input (id `salary`).
4. **Labor regime** (default already "Régimen General (100%)"): to change, click the combobox labeled **"Régimen Laboral"**, then click one of the listbox options: `Régimen General (100%)`, `Pequeña Empresa (50%)`, or `Microempresa (0%)`.
5. **Health insurance** (default "EsSalud (bonificación 9%)"): to change, click the **"Tipo de Seguro de Salud"** combobox, then click `EsSalud (bonificación 9%)` or `EPS (bonificación 6.75%)`.
6. **Family allowance** (Asignación Familiar): click the checkbox labeled **"Recibo Asignación Familiar (+S/ 113.00)"**. Verify in the next snapshot that it reads `[checked]`. Adds S/113.00 to the computable base.
7. **Months worked** (default 6): the "Tiempo Trabajado en el Semestre" section has a listbox of 1–6 completed months (or a "Usar fechas exactas" mode for exact ingreso/cese dates). Leave at 6 for a full semester.
8. **Unexcused absences** (default 0): the "Días de Inasistencia Injustificada" numeric field. Each absence deducts 1/30 of the gratificación.
9. **Calculate**: click the button **"Calcular Gratificación"**. Then `browse wait timeout 1500` and `browse snapshot`.
10. **Read the results card** (heading "Tu Gratificación de Julio/Diciembre"):
    - `Sueldo base:` — the entered salary.
    - `Base de gratificación:` — computable remuneration = salary + asignación familiar (+ any regular-income average).
    - `Bonificación extraordinaria (9% | 6.75%): +S/ …` — the tax-free extraordinary bonus.
    - `Tiempo trabajado: 180 días (6.0 meses)`.
    - `TOTAL A RECIBIR: S/ …` — the final amount to receive.

    A "Copiar resultado" button copies the full breakdown to clipboard.

## Site-Specific Gotchas

- **No API / no submit round-trip.** The calculation runs entirely in client-side JS; there is no backend endpoint to call and nothing to intercept. Driving the page is the only method — don't waste time hunting for a JSON API.
- **Cloudflare present but permissive.** The homepage sits behind Cloudflare, but both `browse cloud fetch --proxies` and a plain `browse open --remote` (Browserbase default stealth, **no `--proxies`, no `--verified`**) returned HTTP 200 and rendered the calculator. The pre-run probe flagged `likelyNeedsProxies: true`, but that was not borne out — a bare remote session works. Proxies remain a safe fallback if the site tightens.
- **Custom Radix controls, not native `<select>`.** Régimen, Tipo de Seguro, and Meses are custom listbox comboboxes; Asignación Familiar is a custom checkbox. There *is* a hidden native `<select>` (aria-hidden, off-screen) for each, but **setting the native select via `browse select` does NOT update React state** — the result won't change. Always click the visible combobox trigger, then click the option from the a11y snapshot; toggle the checkbox by its labeled ref and confirm `[checked]`.
- **You must click "Calcular Gratificación".** The result card does not auto-update on every keystroke; snapshot again after clicking — the result card's refs (11-2xxx range) are freshly created each calculation.
- **Pequeña Empresa (50%) display quirk.** For the small-enterprise regime, the card still shows the *full* computable in "Base de gratificación" (e.g. S/3,113.00), but the gratificación actually paid — and the amount the bonus is computed on — is **50% of it**. Only the "TOTAL A RECIBIR" reflects the halving. Don't read "Base de gratificación" as the payable gratificación for MYPE. Microempresa (0%) yields no legal gratificación.
- **Bonus base.** The extraordinary bonus (9% EsSalud / 6.75% EPS) is applied to the *regime-adjusted* gratificación, not the raw computable. E.g. Pequeña + EPS on S/3,113 computable → gratificación S/1,556.50 → bonus 6.75% = S/105.06.
- **Current-year constants are baked in.** The page is stamped "Actualizado 2026 · Ley 27735"; asignación familiar = S/113.00 (10% of RMV S/1,130). These update yearly with the minimum wage — read them off the live page rather than hardcoding.
- **Deterministic.** Same inputs always produce the same output; no randomness, so a single clean run is authoritative.

## Expected Output

Régimen General + EsSalud + Asignación Familiar, salary S/3,000, 6 months, 0 absences (verified by both a manual `browse` run and an independent autobrowse run):

```json
{
  "success": true,
  "inputs": {
    "regimen": "general",
    "salary": 3000,
    "tipo_seguro": "essalud",
    "asignacion_familiar": true,
    "months_worked": 6,
    "absences": 0
  },
  "sueldo_base": 3000.00,
  "base_gratificacion": 3113.00,
  "gratificacion_bruta": 3113.00,
  "bonificacion_extraordinaria": 280.17,
  "total_a_recibir": 3393.17,
  "currency": "PEN",
  "period": "julio",
  "error_reasoning": null
}
```

Pequeña Empresa (50%) + EPS (6.75%), same salary/months (distinct outcome shape — regime halving + EPS rate):

```json
{
  "success": true,
  "inputs": {
    "regimen": "pequena",
    "salary": 3000,
    "tipo_seguro": "eps",
    "asignacion_familiar": true,
    "months_worked": 6,
    "absences": 0
  },
  "sueldo_base": 3000.00,
  "base_gratificacion": 3113.00,
  "gratificacion_bruta": 1556.50,
  "bonificacion_extraordinaria": 105.06,
  "total_a_recibir": 1661.56,
  "currency": "PEN",
  "period": "julio",
  "error_reasoning": null
}
```

Failure shape (page blocked or calculator failed to render):

```json
{
  "success": false,
  "inputs": null,
  "total_a_recibir": null,
  "currency": "PEN",
  "error_reasoning": "Describe what went wrong (e.g. Cloudflare challenge, calculator did not render)."
}
```
