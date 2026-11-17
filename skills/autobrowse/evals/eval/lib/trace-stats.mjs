import * as fs from "node:fs";
import * as path from "node:path";

// Split a run's wall clock into browser time (sum of browse-CLI command
// durations recorded in trace.json) and model time (the remainder).
export function traceStats(runDir, durationSec) {
  const out = { browser_ms: null, model_ms: null, tool_errors: 0, tool_calls: 0 };
  const tracePath = path.join(runDir, "trace.json");
  if (!fs.existsSync(tracePath)) return out;
  try {
    const trace = JSON.parse(fs.readFileSync(tracePath, "utf-8"));
    let browserMs = 0;
    for (const entry of trace) {
      if (entry.role === "tool_result") {
        out.tool_calls++;
        browserMs += entry.duration_ms || 0;
        if (entry.error) out.tool_errors++;
      }
    }
    out.browser_ms = browserMs;
    if (durationSec != null) out.model_ms = Math.max(0, Math.round(durationSec * 1000 - browserMs));
  } catch {
    /* leave nulls */
  }
  return out;
}
