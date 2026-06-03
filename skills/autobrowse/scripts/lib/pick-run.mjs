// pick-run.mjs — choose which autobrowse run to mine for export.
//
// A run is "passing" when its summary.md's final JSON has `success: true`.
// Lifted from stagehand-export/scripts/export.mjs.

import * as fs from "node:fs";
import * as path from "node:path";

export function listRuns(tracesDir) {
  if (!fs.existsSync(tracesDir)) return [];
  return fs
    .readdirSync(tracesDir)
    .filter((d) => d.startsWith("run-"))
    .sort()
    .reverse();
}

export function readSummary(tracesDir, runId) {
  const f = path.join(tracesDir, runId, "summary.md");
  return fs.existsSync(f) ? fs.readFileSync(f, "utf-8") : null;
}

export function extractFinalJson(summary) {
  if (!summary) return null;
  const after = summary.split("## Agent Final Output")[1];
  if (!after) return null;
  const fence = after.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (!fence) return null;
  try {
    return JSON.parse(fence[1]);
  } catch {
    return null;
  }
}

export function isPassing(tracesDir, runId) {
  const summary = readSummary(tracesDir, runId);
  if (!summary) return false;
  const json = extractFinalJson(summary);
  return json && json.success === true;
}

// Returns the run-id to export from, or null if none found.
export function pickRun(tracesDir, forcedRunId) {
  if (forcedRunId) return forcedRunId;
  return listRuns(tracesDir).find((r) => isPassing(tracesDir, r)) ?? null;
}

// Find the last balanced { … } block at the end of `text`. Used to parse a
// generated script's final JSON status. Walks backward from the last `}` and
// brace-balances to its matching `{`, ignoring braces inside JSON strings.
// Robust to pretty-printed (multi-line, nested) output — unlike `lastIndexOf
// ("{")`, which locks onto the deepest inner `{` for nested objects.
export function extractTrailingJsonObject(text) {
  if (!text) return null;
  const end = text.lastIndexOf("}");
  if (end < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = end; i >= 0; i--) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (inString) {
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "}") depth++;
    else if (ch === "{") {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(text.slice(i, end + 1)); } catch { return null; }
      }
    }
  }
  return null;
}
