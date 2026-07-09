#!/usr/bin/env node
import { getRunDir, loadOutput, emit, emitNoOutput, check, checkNumber, checkFuzzyMatch } from "../_lib/checks.mjs";

const out = loadOutput(getRunDir());
if (!out) emitNoOutput();

// Ground truth seeded in fixtures/flightdeck/index.html: cheapest nonstop
// SFO→JFK is Meridian Air MA 214, $218, departing 07:05. Traps: a $189
// one-stop on the same route and a $149 nonstop SFO→BOS.
emit([
  check("claimed success", out.success === true, JSON.stringify(out.success)),
  checkFuzzyMatch("airline", out.airline, "Meridian Air"),
  check("flight number", String(out.flight_number).replace(/\s+/g, "") === "MA214", JSON.stringify(out.flight_number)),
  checkNumber("price", out.price_usd, { eq: 218 }),
  check("depart time", String(out.depart_time).includes("07:05") || String(out.depart_time).includes("7:05"), JSON.stringify(out.depart_time)),
  check("nonstop", out.nonstop === true, JSON.stringify(out.nonstop)),
]);
