// Shared verifier toolkit. Every task's verify.mjs follows the protocol:
//   node verify.mjs --run-dir <traceDir>
//   → prints one JSON line {passed, checks: [{name, ok, detail}], reason}
// Pass/fail lives in the JSON; a nonzero exit means the verifier itself broke.

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRunOutput } from "../../lib/extract-output.mjs";

export function getRunDir() {
  const idx = process.argv.indexOf("--run-dir");
  if (idx === -1 || !process.argv[idx + 1]) {
    console.error("usage: node verify.mjs --run-dir <traceDir>");
    process.exit(1);
  }
  return path.resolve(process.argv[idx + 1]);
}

export function loadOutput(runDir) {
  return loadRunOutput(runDir);
}

// ── Check builders ──────────────────────────────────────────────────

export const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function check(name, ok, detail = "") {
  return { name, ok: !!ok, detail: String(detail).slice(0, 300) };
}

export function checkFuzzyMatch(name, actual, expected) {
  const a = norm(actual);
  const e = norm(expected);
  const ok = a && e && (a.includes(e) || e.includes(a));
  return check(name, ok, `actual="${actual}" expected≈"${expected}"`);
}

export function checkContains(name, haystack, needle) {
  return check(name, norm(haystack).includes(norm(needle)), `looking for "${needle}"`);
}

export function checkNumber(name, value, { eq, min, max } = {}) {
  const n = typeof value === "string" ? parseFloat(value.replace(/[^0-9.\-]/g, "")) : value;
  if (typeof n !== "number" || !isFinite(n)) return check(name, false, `not a number: ${JSON.stringify(value)}`);
  if (eq !== undefined) return check(name, Math.abs(n - eq) < 0.005, `got ${n}, expected ${eq}`);
  const ok = (min === undefined || n >= min) && (max === undefined || n <= max);
  return check(name, ok, `got ${n}, expected [${min ?? "-∞"}, ${max ?? "∞"}]`);
}

export function checkTime(name, value) {
  return check(name, /^([01]?\d|2[0-3]):[0-5]\d/.test(String(value ?? "").trim()), `got ${JSON.stringify(value)}`);
}

// ── Emit ────────────────────────────────────────────────────────────

export function emit(checks, { requireAll = true } = {}) {
  const failed = checks.filter((c) => !c.ok);
  const passed = requireAll ? failed.length === 0 : failed.length < checks.length;
  console.log(
    JSON.stringify({
      passed,
      checks,
      reason: passed ? "all checks passed" : failed.map((c) => `${c.name}: ${c.detail}`).join("; "),
    })
  );
  process.exit(0);
}

export function emitNoOutput() {
  console.log(JSON.stringify({ passed: false, checks: [], reason: "no parseable final JSON output in run" }));
  process.exit(0);
}

// Deterministic checkout-fixture confirmation code — must match the
// implementation in fixtures/checkout/index.html exactly.
export function checkoutCode(name, email, zip, shipping) {
  const s = `${name}|${email}|${zip}|${shipping}`.toLowerCase();
  let sum = 0;
  for (const ch of s) sum = (sum * 31 + ch.codePointAt(0)) % 100000;
  return `BB-${String(sum).padStart(5, "0")}`;
}
