#!/usr/bin/env node
import { getRunDir, loadOutput, emit, emitNoOutput, check, checkNumber, checkFuzzyMatch } from "../_lib/checks.mjs";

const out = loadOutput(getRunDir());
if (!out) emitNoOutput();

// Ground truth fetched 2026-06-09 — books.toscrape.com is a static demo site
// that has not changed in years. 11 Travel books; cheapest "The Road to
// Little Dribbling" £23.21; most expensive "A Year in Provence" £56.88.
emit([
  check("claimed success", out.success === true, JSON.stringify(out.success)),
  checkNumber("count", out.count, { eq: 11 }),
  checkFuzzyMatch("cheapest title", out.cheapest?.title, "The Road to Little Dribbling"),
  checkNumber("cheapest price", out.cheapest?.price_gbp, { eq: 23.21 }),
  checkFuzzyMatch("most expensive title", out.most_expensive?.title, "A Year in Provence"),
  checkNumber("most expensive price", out.most_expensive?.price_gbp, { eq: 56.88 }),
]);
