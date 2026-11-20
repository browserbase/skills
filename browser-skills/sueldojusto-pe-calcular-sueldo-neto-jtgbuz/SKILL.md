---
name: sueldojusto-pe-calcular-sueldo-neto-jtgbuz
title: Calcular Sueldo Neto en Perú (SueldoJusto.pe)
description: >-
  Calcula el sueldo neto mensual peruano a partir del bruto usando el calculador
  de sueldojusto.pe, con desglose de AFP/ONP, comisión, seguro de invalidez,
  asignación familiar e impuesto a la renta de 5ta categoría según los valores
  oficiales 2026 (UIT S/5,500, RMV S/1,130).
website: sueldojusto.pe
category: personal-finance
tags:
  - peru
  - payroll
  - salary
  - tax
  - afp
  - onp
  - sueldo-neto
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      Confirmed not available — the calculator is client-side React with no
      backend endpoint. Network panel shows zero requests on Calculate click.
  - method: url-param
    rationale: >-
      Confirmed not available — ?sueldo=… and ?regimen=… are ignored; spinbutton
      always loads to default 2500.
  - method: mcp
    rationale: >-
      No SueldoJusto MCP server exists. The manual formula documented in
      SKILL.md can be used offline if needed.
verified: true
proxies: true
---
# Calcular Sueldo Neto Perú (SueldoJusto.pe)

## Purpose

Convert a Peruvian gross monthly salary (sueldo bruto) into the net take-home amount (sueldo neto / líquido) by driving the on-page calculator at `https://sueldojusto.pe/herramientas/calculadora-sueldo-neto/`. Returns gross, total deductions, net, and a per-line breakdown of AFP/ONP contributions and 5ta-categoría income tax. Read-only: the page is a client-side React calculator with no public API, no URL-param prefill, and no backend submission — every field must be driven in the browser. The result section reflects 2026 statutory values (UIT S/5,500, RMV S/1,130, 7 UIT income-tax floor at S/38,500/year).

## When to Use

- A user supplies a monthly gross salary in soles and asks for their net take-home in Peru.
- A user wants the breakdown of pension contribution (AFP or ONP), 5ta-categoría income tax, and asignación familiar.
- A user is comparing AFP vendors (Habitat / Integra / Prima / Profuturo) and wants the line-by-line deduction for each at their salary level.
- A user wants to validate their payroll deductions against an independent calculator.
- A user wants the effect of toggling asignación familiar (+S/ 113.00) on their net.

Do NOT use this skill for:
- CTS, gratificación, liquidación, or utilidades calculations — those have separate calculators on sueldojusto.pe.
- Régimen de honorarios (4ta categoría) — this calculator is for 5ta categoría (planilla) only.
- Regímenes especiales (Pequeña Empresa, Microempresa, Construcción Civil, Agrario, Minero) — calculator assumes Régimen General; ask the user to confirm before reporting results for non-general regimes.

## Workflow

1. **Open the calculator page.**
   ```
   browse open "https://sueldojusto.pe/herramientas/calculadora-sueldo-neto/" --remote
   ```
   The page loads to the same form regardless of URL query string — `?sueldo=…&regimen=…` style params are **not** honored. The spinbutton defaults to `2500`.

2. **Take an accessibility snapshot to capture the field refs.**
   ```
   browse snapshot --remote
   ```
   Refs are assigned per-page-load (e.g. `[4-32]` on first load) and change after most interactions. **Always re-snapshot after toggling AFP/ONP** — the AFP sub-controls (combobox, radio group) only render under the AFP branch and only exist in the tree once that branch is active.

3. **Fill the gross monthly salary.** The spinbutton is a controlled React input — `browse fill` alone will fail silently if the field has a pre-existing value (the visible default `2500` will remain). Clear it first:
   ```
   browse click @<spinbutton-ref> --remote
   browse press "Control+A" --remote
   browse press "Delete"     --remote
   browse fill  @<spinbutton-ref> "<gross-soles>" --remote
   ```
   Use integers (e.g. `4500`), not decimals. No "S/" prefix, no thousands separator.

4. **Pick the pension regime.** Two pill buttons toggle between branches:
   - AFP (Privado) — default selected; reveals AFP combobox + comisión radio group.
   - ONP (13%) — flat 13% deduction, no further inputs.

   Click whichever the user is on. The page does NOT auto-recalculate on toggle.

5. **(AFP branch only) Pick the AFP vendor and comisión type.**
   - Combobox values: `AFP Habitat` (default), `AFP Integra`, `AFP Prima`, `AFP Profuturo`. Drive with `browse fill @<combobox-ref> "AFP Integra"` or click the combobox and select.
   - Comisión radios: `Sobre Flujo (1.47% / 1.55% / 1.60% / 1.69%)` (default) or `Mixta (0.00% flujo + saldo)`. **Mixta returns 0.00% on the monthly slip** — the actual fee is annual on the accumulated balance, which this calculator cannot show. If the user is on Mixta, warn them the displayed monthly comisión of S/0.00 understates their true cost.

6. **(Optional) Toggle "Recibo Asignación Familiar (+S/ 113.00)".** Click the checkbox. The S/113 is added to the deduction base (not just paid out separately) — i.e. ONP becomes `13% × (gross + 113)`, not `13% × gross`. See the Gotchas for the display vs base inconsistency.

7. **(Optional) Fill "Otros Ingresos Anuales".** Leave at `0` for automatic 5ta-categoría projection from `gross × 14` (12 months + 2 gratificaciones). Fill if the user reports additional bonuses or variable income to fold into the annual projection.

8. **Click "Calcular Sueldo Neto"** — the recalc button at the bottom of the form. The result panel renders below with id `Tu Sueldo Neto Mensual`. There is no loading state and no network round-trip; computation is synchronous client-side.

9. **Read the result.** Extract these fields from the result panel (see Expected Output for the JSON shape):
   - `Bruto` — the input gross (NOTE: does not include asignación familiar even when checked).
   - `- Descuentos` — total deduction sum.
   - `Neto` — take-home.
   - The "% recibes" / "% descontado" pair.
   - Desglose lines: `Aporte AFP (10%)` or `Aporte ONP (13%)`, `Comisión <vendor> (flujo|mixta)`, `Seguro de invalidez (1.37%)`, `Impuesto 5ta categoría (aprox)` (may be missing if annual projection ≤ 7 UIT).

10. **Return the JSON.** Always include the disclaimer: "cálculo referencial, no es liquidación oficial".

### No browser fallback exists

There is no public API, no GraphQL endpoint, no URL-deep-link, no SueldoJusto MCP server, and no documented CLI. The calculation runs entirely in client-side JavaScript on the calculadora page. If running the browser is not possible, the formulas are documented on the same page and can be applied manually:

```
net = (gross + asignación_familiar_or_0)
      - aporte_pensión
      - impuesto_5ta_categoría

aporte_pensión:
  ONP:           0.13 × (gross + asig)
  AFP flujo:     0.10 × (gross + asig)             # aporte
               + flujo_pct × (gross + asig)         # comisión
               + 0.0137 × (gross + asig)            # seguro
  AFP mixta:     0.10 × (gross + asig)              # comisión sobre flujo = 0
               + 0.0137 × (gross + asig)

flujo_pct: Habitat 0.0147 | Integra 0.0155 | Prima 0.0160 | Profuturo 0.0169

impuesto_5ta_categoría:
  anual_proyectado = (gross + asig) × 14 + otros_ingresos_anuales
  base_imponible   = max(0, anual_proyectado - 7 × 5500)   # 7 UIT = S/38,500
  tax_anual = piecewise on base_imponible:
    8%   on the first  5 UIT (S/27,500)
    14%  on the next  15 UIT (S/82,500)
    17%  on the next  15 UIT (S/82,500)
    20%  on the next  10 UIT (S/55,000)
    30%  on the rest
  retención_mensual = tax_anual / 12
```

This manual formula is what the site itself documents in its "Fórmula oficial 2026" section. **Prefer the calculator** — the page handles tax-bracket edge cases and rounding consistent with what the user will see if they verify themselves.

## Site-Specific Gotchas

- **No URL-param prefill.** Adding `?sueldo=5000&regimen=onp` or any other query string to the calculator URL does nothing — the spinbutton still loads to its default `2500`. Confirmed against the live page. Don't waste time crafting a deep-link.
- **No API endpoint.** All deductions are computed in client JS. There is no XHR/fetch to a backend for the result. Network panel shows zero requests on "Calcular" click.
- **Spinbutton fill needs an explicit clear.** A bare `browse fill @<spinbutton> "4500"` against the existing `2500` may leave the visible value as `2500` and produce a result based on the wrong number. The reliable sequence is `click → Control+A → Delete → fill`. Always confirm the result panel's `Bruto:` line matches the value you intended before reporting.
- **Toggling AFP/ONP does not recalculate.** The result panel persists with stale numbers after you switch regime. You MUST click "Calcular Sueldo Neto" again. The visible breakdown labels will flip (e.g. "Aporte ONP (13%)" → "Aporte AFP (10%)") but the sum is unchanged until recalculation.
- **AFP-branch refs are conditionally rendered.** The AFP combobox, comisión radio group, and Calculate button only exist in the snapshot tree when the AFP pill is active. If you snapshot under ONP and try to use the AFP combobox ref, the call fails silently. Re-snapshot after each branch switch.
- **The displayed "Bruto" excludes asignación familiar, but the deduction base includes it.** With S/1,500 gross + asignación checked: `Bruto: S/ 1,500.00` shown, but ONP 13% = S/209.69, which is `0.13 × 1,613` (i.e. `0.13 × (1500 + 113)`). Net = `1500 + 113 - 209.69 = S/ 1,403.31`. When reporting to the user, expose this — the page's "Bruto" line is a misleading label and they will not be able to reconcile the numbers from it alone.
- **Comisión Mixta shows S/0.00 on the monthly breakdown.** The page intentionally renders comisión Mixta as `-S/ 0.00` because the actual Mixta fee is annual on the accumulated balance, not monthly on the flow. The calculator does NOT model this annual saldo fee, so for Mixta-affiliated users the result understates true cost. Mention this explicitly when returning a Mixta calculation.
- **5ta-categoría kicks in at gross ≈ S/2,750/month.** Below that (`gross × 14 ≤ 7 × 5,500 = 38,500`), the "Impuesto 5ta categoría" line is omitted from the desglose entirely (not rendered as 0). Don't rely on the line's presence to detect tax — branch on the annual projection.
- **2026-specific constants are hard-coded into the page.** UIT S/5,500 (D.S. 301-2025-EF), RMV S/1,130 (D.S. 006-2024-TR), Asignación Familiar S/113.00. If these change in 2027, the page will be updated server-side but the SKILL.md formulas under "browser fallback" above will need a refresh.
- **Page renders fine without stealth.** No anti-bot wall. The skill works equally on `browse cloud sessions create` (no flags) and with `--verified --proxies`. The verified+proxies session this skill was authored against was overkill for this site — stealth-off is fine.
- **The "Copiar resultado" button exists** — clicking it places a plaintext summary in the clipboard. Not needed for agent use (read the result panel directly via snapshot/markdown), but worth knowing if a user asks for a "copy/paste-able" version.
- **No site-specific anti-bot, captcha, or rate-limit issues observed.** Page returned 200 on direct `browse cloud fetch` without proxies.

## Expected Output

Return one JSON object. All currency fields are floats in soles (S/). The `deductions` map is partial — keys are present only when the corresponding line exists in the page's desglose.

```json
{
  "gross_monthly": 4500.00,
  "regime": "AFP",
  "afp": {
    "vendor": "Habitat",
    "comision_type": "flujo"
  },
  "asignacion_familiar": false,
  "otros_ingresos_anuales": 0.00,
  "deductions": {
    "aporte_pension": 450.00,
    "comision_afp": 66.15,
    "seguro_invalidez": 61.65,
    "impuesto_5ta_categoria": 163.33
  },
  "total_deductions": 741.13,
  "net_monthly": 3758.87,
  "pct_received": 83.5,
  "pct_deducted": 16.5,
  "disclaimer": "Cálculo referencial. No constituye liquidación oficial ni asesoría contable. Consulta con RRHH de tu empresa.",
  "source": "sueldojusto.pe/herramientas/calculadora-sueldo-neto",
  "year": 2026,
  "constants_used": {
    "uit": 5500,
    "rmv": 1130,
    "asignacion_familiar_amount": 113.00,
    "tope_5ta_anual": 38500
  }
}
```

### Outcome shapes (one example per branch)

**ONP, no asignación, salary above 7 UIT projection — both pension and 5ta apply:**
```json
{
  "gross_monthly": 4500.00,
  "regime": "ONP",
  "asignacion_familiar": false,
  "deductions": {
    "aporte_pension": 585.00,
    "impuesto_5ta_categoria": 163.33
  },
  "total_deductions": 748.33,
  "net_monthly": 3751.67,
  "pct_received": 83.4
}
```

**ONP, asignación familiar checked, salary below 7 UIT projection — only pension applies:**
```json
{
  "gross_monthly": 1500.00,
  "regime": "ONP",
  "asignacion_familiar": true,
  "deductions": {
    "aporte_pension": 209.69
  },
  "total_deductions": 209.69,
  "net_monthly": 1403.31,
  "pct_received": 87.0,
  "notes": [
    "Aporte ONP de S/ 209.69 = 13% × (gross + asignación) = 13% × S/ 1,613. La página muestra Bruto: S/ 1,500.00 pero la base de descuento incluye los S/ 113 de asignación."
  ]
}
```

**AFP Mixta — emit a notes warning:**
```json
{
  "gross_monthly": 4500.00,
  "regime": "AFP",
  "afp": { "vendor": "Integra", "comision_type": "mixta" },
  "deductions": {
    "aporte_pension": 450.00,
    "comision_afp": 0.00,
    "seguro_invalidez": 61.65,
    "impuesto_5ta_categoria": 163.33
  },
  "total_deductions": 674.98,
  "net_monthly": 3825.02,
  "notes": [
    "Comisión Mixta aparece como S/ 0.00 en la boleta mensual. La comisión real es anual sobre el saldo acumulado en tu cuenta AFP, y no está incluida en este cálculo. Tu costo total real será mayor."
  ]
}
```
