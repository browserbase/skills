#!/usr/bin/env node
import { getRunDir, loadOutput, emit, emitNoOutput, check, checkNumber, checkoutCode } from "../_lib/checks.mjs";

const out = loadOutput(getRunDir());
if (!out) emitNoOutput();

const expectedCode = checkoutCode("Ada Lovelace", "ada@example.com", "94107", "express");

emit([
  check("claimed success", out.success === true, JSON.stringify(out.success)),
  check("confirmation code", String(out.confirmation_code).trim() === expectedCode, `got ${out.confirmation_code}, expected ${expectedCode}`),
  checkNumber("total", out.total_usd, { eq: 47.48 }),
  check("shipping", String(out.shipping).toLowerCase() === "express", JSON.stringify(out.shipping)),
]);
