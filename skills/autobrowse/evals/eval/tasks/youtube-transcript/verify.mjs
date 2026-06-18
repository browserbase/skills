#!/usr/bin/env node
import { getRunDir, loadOutput, emit, emitNoOutput, check, checkContains } from "../_lib/checks.mjs";

const out = loadOutput(getRunDir());
if (!out) emitNoOutput();

// 19-second 2005 video; content is immutable. Transcript famously mentions
// the elephants' "really really long trunks".
const segments = Array.isArray(out.segments) ? out.segments : [];
const fullText = segments.map((s) => s?.text ?? "").join(" ");

emit([
  check("claimed success", out.success === true, JSON.stringify(out.success)),
  checkContains("title", out.title, "Me at the zoo"),
  checkContains("channel", out.channel, "jawed"),
  check("has transcript", out.has_transcript === true, JSON.stringify(out.has_transcript)),
  check("≥2 segments", segments.length >= 2, `got ${segments.length}`),
  checkContains("transcript mentions elephants", fullText, "elephants"),
  checkContains("transcript mentions trunks", fullText, "trunks"),
]);
