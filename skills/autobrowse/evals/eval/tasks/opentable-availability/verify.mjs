#!/usr/bin/env node
import { getRunDir, loadOutput, emit, emitNoOutput, check, checkContains, checkTime } from "../_lib/checks.mjs";

const out = loadOutput(getRunDir());
if (!out) emitNoOutput();

// Live availability changes run to run — verify structural invariants and
// internal consistency, not specific slots.
const slots = Array.isArray(out.slots) ? out.slots : null;

emit([
  check("claimed success", out.success === true, JSON.stringify(out.success)),
  checkContains("restaurant", out.restaurant, "arquet"),
  check("date echoed", String(out.date).startsWith("2026-08-15"), JSON.stringify(out.date)),
  check("party size", Number(out.party_size) === 2, JSON.stringify(out.party_size)),
  check("slots is array", slots !== null, JSON.stringify(out.slots)),
  check(
    "availability consistent",
    (out.has_availability === true && slots?.length > 0) || (out.has_availability === false && slots?.length === 0),
    `has_availability=${out.has_availability}, slots=${slots?.length}`
  ),
  ...(slots ?? []).slice(0, 8).map((s, i) => checkTime(`slot[${i}] format`, s)),
  ...(slots ?? []).slice(0, 8).map((s, i) => {
    const [h] = String(s).split(":").map(Number);
    return check(`slot[${i}] in dinner window`, h >= 16 && h <= 22, String(s));
  }),
]);
