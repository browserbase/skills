---
name: afip-constancia
description: |
  Fetch the official ARCA (ex-AFIP) Constancia de Inscripción for an Argentine
  CUIT from the PUBLIC web form (no Clave Fiscal, no login). Returns the parsed
  fiscal situation — régimen (monotributo + categoría / responsable inscripto /
  exento), domicilio fiscal, actividades CLAE, impuestos, fecha de inscripción —
  AND the official PDF document with its código verificador, as a single JSON
  envelope on stdout.
  Use when the user wants to: (1) get a CUIT's tax condition or monotributo
  category, (2) download/save the AFIP/ARCA constancia PDF for an alta de
  proveedor, KYC, expediente or licitación, (3) verify whether a CUIT is
  registered. Triggers: "constancia de inscripción", "constancia de AFIP",
  "constancia de ARCA", "es monotributista", "qué categoría de monotributo",
  "bajame el papel de AFIP del CUIT", "alta de proveedor AFIP".
license: MIT
compatibility: Requires browse CLI (`npm install -g browse`) and BROWSERBASE_API_KEY env var
allowed-tools: Bash
metadata:
  author: ar-agents
  version: "1.0.0"
  homepage: https://ar-agents.vercel.app
  companion-package: "@ar-agents/constancia"
---

# AFIP / ARCA Constancia de Inscripción

Drive the **public** ARCA Constancia de Inscripción form and return one JSON
envelope: the parsed constancia **plus the official PDF**. No Clave Fiscal —
this is the form any citizen can use with just a CUIT.

**Required**: `BROWSERBASE_API_KEY` env var and `browse` CLI installed.

**Typed companion**: the same lookup is available as a typed, testable npm
package — `@ar-agents/constancia`, part of the [`Arg` toolkit](https://ar-agents.vercel.app)
— for agents on the Vercel AI SDK. Both share the **Output contract** below
(`parseSkillOutput`). One artifact, two surfaces: use the package for
programmatic/Vercel-AI use, this skill for any browser-driving agent.

**When NOT to use this skill**: if the caller only needs the *data* (not the
PDF) and has an AFIP X.509 cert provisioned, the SOAP padrón webservice
(`@ar-agents/identity` `lookup_cuit_afip`) is faster and needs no browser. This
skill's edge is the **PDF artifact** and the **no-cert** path.

## Output contract (STRICT — the companion package parses this verbatim)

Print **exactly one** JSON object to stdout as the **last line**, nothing after
it. Shape:

```json
{
  "cuit": "20417581015",
  "found": true,
  "denominacion": "APELLIDO NOMBRE | RAZÓN SOCIAL",
  "tipoPersona": "fisica | juridica",
  "condicion": "Monotributo | Responsable Inscripto | Exento | No Alcanzado | Sin inscripción",
  "monotributoCategoria": "A",
  "domicilioFiscal": { "direccion": "", "localidad": "", "provincia": "", "codigoPostal": "" },
  "actividades": [{ "codigo": "620100", "descripcion": "", "principal": true }],
  "impuestos": [{ "descripcion": "MONOTRIBUTO", "desde": "2026-04-17" }],
  "fechaInscripcion": "2026-04-17",
  "estado": "ACTIVO",
  "pdf": { "base64": "JVBERi0x…", "url": "", "codigoVerificador": "" }
}
```

Rules:

- **CUIT not registered** → `{ "cuit": "...", "found": false }` (nothing else
  required). Do **not** invent a constancia.
- **Any failure** (navigation, captcha, ARCA down) → `{ "cuit": "...", "error":
  "<short reason>" }`. If the page literally says the CUIT no figura inscripto,
  put that text in `error` — the parser maps "no figura / not found /
  inexistente" to a clean `cuit_not_found`.
- `condicion` is free text — emit what the page shows; the parser normalizes it.
- `pdf.base64` is preferred (durable). `pdf.url` only if you cannot capture
  bytes (ARCA PDF URLs are short-lived). Include `codigoVerificador` when the
  document prints one.
- Never fabricate a field. Omit unknowns rather than guessing.

## Procedure

### Step 0 — Normalize and sanity-check the CUIT

```bash
CUIT_RAW="$1"
CUIT="$(printf '%s' "$CUIT_RAW" | tr -cd '0-9')"
```

If `CUIT` is not exactly 11 digits, emit
`{"cuit":"<raw>","error":"invalid_cuit: not 11 digits"}` and stop. Do not open
a browser for a malformed CUIT — browser runs are expensive and ARCA throttles.

### Step 1 — Open the public form

Start a cloud session and open the **public** entry point (no auth):

```bash
browse open "https://www.afip.gob.ar/genericos/constanciainscripcion/" --cloud
```

Do **not** hardcode internal POST endpoints — ARCA rotates them. Navigate via
the on-page elements. Locate the control that begins the consulta (a
"Consultar" / "Ingresar" button or a CUIT field) **semantically**, not by a
brittle fixed selector:

```bash
browse snapshot          # inspect the live DOM
```

### Step 2 — Submit the CUIT

Type the 11-digit `CUIT` into the CUIT/identification field and submit. If a
**captcha / "no soy un robot"** appears, rely on the Browserbase verified
session + CAPTCHA solving (see the `browser` skill); do not attempt to bypass
it manually. If it still blocks, emit
`{"cuit":"<cuit>","error":"captcha_blocked"}` and stop.

### Step 3 — Detect "no figura inscripto"

If the result page states the CUIT is not registered / "no figura inscripto" /
"inexistente", emit `{"cuit":"<cuit>","found":false}` and stop. This is a
normal, expected outcome — not an error.

### Step 4 — Extract the constancia

From the rendered constancia, read: denominación, persona física vs jurídica,
condición/régimen, monotributo categoría (if shown), domicilio fiscal,
actividades (código + descripción + which is principal), impuestos (+ fecha
desde), fecha de inscripción, estado, and the código verificador. Dump the raw
page text/DOM to a temp file — do not hand-parse in a fragile pipeline:

```bash
browse get markdown > /tmp/constancia_${CUIT}.txt
```

### Step 5 — Capture the PDF

Trigger the constancia's print/PDF action and capture the document as bytes:

```bash
browse pdf --output /tmp/constancia_${CUIT}.pdf
PDF_B64="$(base64 -i /tmp/constancia_${CUIT}.pdf | tr -d '\n')"
```

If byte capture is impossible, fall back to the visible PDF URL. A constancia
without its PDF is still useful — never discard the parsed data because the PDF
step failed; just omit `pdf` or set `error` only if *nothing* was obtained.

### Step 6 — Emit the envelope

Build the JSON per the **Output contract** from the extracted fields + the
base64 PDF, and print it as the final stdout line via the helper (it enforces
the exact shape the companion package expects):

```bash
node "$(dirname "$0")/scripts/emit_constancia.mjs" /tmp/constancia_fields_${CUIT}.json
```

## Gotchas

- **ARCA = ex-AFIP** (renamed 2025). The public form still lives under
  `afip.gob.ar`. Treat the names as interchangeable.
- ARCA changes the form layout without notice. Navigate semantically; if the
  page is unrecognizable, emit `error: "fetcher_unexpected_response: <detail>"`
  rather than guessing — the companion package treats wrong data as worse than
  no data.
- ARCA rate-limits. Do **one** attempt per CUIT per run. Never loop.
- Client-side scraping is CORS-blocked and trips anti-bot. Always run the
  browser server-side / in Browserbase (this skill does, via `--cloud`).
- The constancia is point-in-time. Emit what the form shows today; the caller
  decides freshness policy.
