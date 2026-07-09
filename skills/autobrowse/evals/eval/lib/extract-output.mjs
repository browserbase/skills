import * as fs from "node:fs";
import * as path from "node:path";

// Pull the last fenced ```json block (or last bare {...}) from text.
// Mirrors extractFinalJson in the newer evaluate.mjs.
export function extractJsonFromText(text) {
  if (!text) return null;
  const fences = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  let candidate = fences.length ? fences[fences.length - 1][1].trim() : null;
  if (!candidate) {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first !== -1 && last > first) candidate = text.slice(first, last + 1);
  }
  if (!candidate) return null;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

// Load the inner agent's final structured output from a run's trace dir.
// Newer evaluate.mjs writes result.json ({parsed, raw, parse_error});
// fall back to parsing summary.md's "Agent Final Output" section for the
// upstream version that doesn't.
export function loadRunOutput(runDir) {
  const resultPath = path.join(runDir, "result.json");
  if (fs.existsSync(resultPath)) {
    try {
      const r = JSON.parse(fs.readFileSync(resultPath, "utf-8"));
      if (r && "parsed" in r) return r.parsed;
      return r;
    } catch {
      /* fall through */
    }
  }
  const summaryPath = path.join(runDir, "summary.md");
  if (fs.existsSync(summaryPath)) {
    const summary = fs.readFileSync(summaryPath, "utf-8");
    const idx = summary.indexOf("## Agent Final Output");
    const tail = idx === -1 ? summary : summary.slice(idx);
    const parsed = extractJsonFromText(tail);
    if (parsed) return parsed;
  }
  return null;
}
