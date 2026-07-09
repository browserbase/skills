#!/usr/bin/env node
import { getRunDir, loadOutput, emit, emitNoOutput, check, checkContains, checkNumber } from "../_lib/checks.mjs";

const out = loadOutput(getRunDir());
if (!out) emitNoOutput();

// Live site — invariants. Tartine has held ~4 stars with >8,000 reviews for
// years; per-review structure is the real fabrication check.
const reviews = Array.isArray(out.reviews) ? out.reviews : [];

emit([
  check("claimed success", out.success === true, JSON.stringify(out.success)),
  checkContains("name", out.name, "tartine"),
  checkNumber("rating band", out.rating, { min: 3.0, max: 5.0 }),
  checkNumber("review count", out.review_count, { min: 5000, max: 50000 }),
  check("≥3 reviews", reviews.length >= 3, `got ${reviews.length}`),
  ...reviews.slice(0, 5).map((r, i) => checkNumber(`review[${i}] rating`, r?.rating, { min: 1, max: 5 })),
  ...reviews.slice(0, 5).map((r, i) => check(`review[${i}] has text`, String(r?.text ?? "").length >= 40, `len=${String(r?.text ?? "").length}`)),
  ...reviews.slice(0, 5).map((r, i) => check(`review[${i}] has date`, /\d{4}/.test(String(r?.date ?? "")), JSON.stringify(r?.date))),
]);
