#!/usr/bin/env node
import { getRunDir, loadOutput, emit, emitNoOutput, check, checkContains, norm } from "../_lib/checks.mjs";

const out = loadOutput(getRunDir());
if (!out) emitNoOutput();

// Live marketplace — invariant checks. This shoe has traded ~$150–$400 for
// years; a wide band still catches fabricated or wrong-product prices.
const product = norm(out.product);
const price = [out.last_sale_usd, out.lowest_ask_usd]
  .map(Number)
  .find((n) => isFinite(n) && n > 0);

emit([
  check("claimed success", out.success === true, JSON.stringify(out.success)),
  check("product is Jordan 1", product.includes("jordan 1"), out.product),
  check("product is Chicago L&F", product.includes("chicago") && (product.includes("lost") || product.includes("found")), out.product),
  checkContains("style code", out.style_code, "DZ5485-612"),
  check("a price populated", price !== undefined, JSON.stringify({ last_sale: out.last_sale_usd, lowest_ask: out.lowest_ask_usd })),
  check("price plausible", price !== undefined && price >= 100 && price <= 1000, `got ${price}`),
]);
