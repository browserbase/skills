#!/usr/bin/env node
// Emit the STRICT constancia output envelope on stdout (last line).
//
// Input: a JSON file of raw extracted fields (loose shape — whatever the
// runbook scraped). This script normalizes it into the exact contract the
// companion npm package `@ar-agents/constancia` parses via `parseSkillOutput`.
// Keeping the shaping here (not in a fragile inline `sed` pipeline) is the
// same discipline the browserbase/skills `company-research` skill uses.
//
// Usage: node emit_constancia.mjs /tmp/constancia_fields_<cuit>.json
//
// Zero dependencies. Node builtins only.

import { readFileSync } from "node:fs";

function fail(cuit, msg) {
  process.stdout.write(
    JSON.stringify({ cuit: String(cuit ?? ""), error: String(msg) }) + "\n",
  );
  process.exit(0); // a reported error is a normal outcome, not a crash
}

const path = process.argv[2];
if (!path) fail("", "emit_constancia: no input file argument");

let raw;
try {
  raw = JSON.parse(readFileSync(path, "utf-8"));
} catch (e) {
  fail("", `emit_constancia: cannot read/parse ${path}: ${e.message}`);
}

const cuit = String(raw.cuit ?? "").replace(/\D/g, "");
if (cuit.length !== 11) fail(raw.cuit, "invalid_cuit: not 11 digits");

if (raw.found === false || raw.notRegistered === true) {
  process.stdout.write(JSON.stringify({ cuit, found: false }) + "\n");
  process.exit(0);
}
if (raw.error) fail(cuit, raw.error);

const s = (v) => {
  const t = typeof v === "string" ? v.trim() : "";
  return t.length ? t : undefined;
};

const out = { cuit, found: true };

const den = s(raw.denominacion ?? raw.razonSocial ?? raw.nombre);
if (!den) fail(cuit, "fetcher_unexpected_response: missing denominacion");
out.denominacion = den;

out.tipoPersona =
  raw.tipoPersona === "juridica" ||
  /sociedad|s\.?a\.?|s\.?r\.?l\.?|asociaci/i.test(den)
    ? "juridica"
    : "fisica";

if (s(raw.condicion)) out.condicion = s(raw.condicion);
if (s(raw.monotributoCategoria))
  out.monotributoCategoria = s(raw.monotributoCategoria);

const dom = raw.domicilioFiscal ?? raw.domicilio;
if (dom && typeof dom === "object") {
  const d = {};
  for (const k of ["direccion", "localidad", "provincia", "codigoPostal"]) {
    if (s(dom[k])) d[k] = s(dom[k]);
  }
  if (Object.keys(d).length) out.domicilioFiscal = d;
}

if (Array.isArray(raw.actividades)) {
  const acts = raw.actividades
    .map((a) => ({
      codigo: s(a?.codigo) ?? "",
      descripcion: s(a?.descripcion) ?? "",
      principal: a?.principal === true,
    }))
    .filter((a) => a.codigo || a.descripcion);
  if (acts.length) out.actividades = acts;
}

if (Array.isArray(raw.impuestos)) {
  const imps = raw.impuestos
    .map((i) =>
      typeof i === "string"
        ? { descripcion: s(i) }
        : { descripcion: s(i?.descripcion), desde: s(i?.desde) },
    )
    .filter((i) => i.descripcion)
    .map((i) => (i.desde ? i : { descripcion: i.descripcion }));
  if (imps.length) out.impuestos = imps;
}

if (s(raw.fechaInscripcion)) out.fechaInscripcion = s(raw.fechaInscripcion);
if (s(raw.estado)) out.estado = s(raw.estado);

const pdf = {};
if (s(raw.pdfBase64) || s(raw.pdf?.base64))
  pdf.base64 = s(raw.pdfBase64) ?? s(raw.pdf?.base64);
if (s(raw.pdfUrl) || s(raw.pdf?.url)) pdf.url = s(raw.pdfUrl) ?? s(raw.pdf?.url);
if (s(raw.codigoVerificador) || s(raw.pdf?.codigoVerificador))
  pdf.codigoVerificador =
    s(raw.codigoVerificador) ?? s(raw.pdf?.codigoVerificador);
if (Object.keys(pdf).length) out.pdf = pdf;

process.stdout.write(JSON.stringify(out) + "\n");
