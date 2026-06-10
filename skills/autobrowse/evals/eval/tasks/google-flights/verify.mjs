#!/usr/bin/env node
import { getRunDir, loadOutput, emit, emitNoOutput, check, checkNumber, checkTime } from "../_lib/checks.mjs";

const out = loadOutput(getRunDir());
if (!out) emitNoOutput();

// Live site — verify invariants, not exact prices. SFO→JFK nonstop one-way
// economy reliably exists and prices in a sane band.
const flights = Array.isArray(out.flights) ? out.flights : [];
const KNOWN_AIRLINES = ["alaska", "american", "delta", "jetblue", "united", "frontier", "hawaiian", "southwest", "spirit"];

const checks = [
  check("claimed success", out.success === true, JSON.stringify(out.success)),
  check("date echoed", String(out.date).startsWith("2026-08-12"), JSON.stringify(out.date)),
  check("≥1 flight", flights.length >= 1, `got ${flights.length}`),
  check("all nonstop", flights.length > 0 && flights.every((f) => f.nonstop === true), JSON.stringify(flights.map((f) => f.nonstop))),
  check(
    "airlines plausible",
    flights.length > 0 && flights.every((f) => KNOWN_AIRLINES.some((a) => String(f.airline).toLowerCase().includes(a))),
    flights.map((f) => f.airline).join(", ")
  ),
  ...flights.slice(0, 5).map((f, i) => checkNumber(`flight[${i}] price band`, f.price_usd, { min: 80, max: 1500 })),
  ...flights.slice(0, 5).map((f, i) => checkTime(`flight[${i}] depart time`, f.depart_time)),
  checkNumber("cheapest price band", out.cheapest_price_usd, { min: 80, max: 1500 }),
];

if (flights.length > 0) {
  const min = Math.min(...flights.map((f) => Number(f.price_usd)).filter((n) => isFinite(n)));
  checks.push(check("cheapest consistent with list", Number(out.cheapest_price_usd) <= min + 0.01, `cheapest=${out.cheapest_price_usd}, list min=${min}`));
}

emit(checks);
