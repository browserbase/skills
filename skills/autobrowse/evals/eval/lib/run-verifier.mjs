import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { TASKS_DIR } from "../config.mjs";

// Verifier protocol (mirrors the codegen runner protocol in autobrowse):
//   node eval/tasks/<task>/verify.mjs --run-dir <traceDir>
// prints exactly one JSON line: {passed: bool, checks: [{name, ok, detail}], reason}
export function runVerifier(task, runDir) {
  const verifier = path.join(TASKS_DIR, task, "verify.mjs");
  const res = spawnSync("node", [verifier, "--run-dir", runDir], {
    encoding: "utf-8",
    timeout: 5 * 60 * 1000, // some verifiers re-check live state
    maxBuffer: 8 * 1024 * 1024,
  });
  const lines = (res.stdout || "").trim().split("\n").filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(lines[i]);
      if (parsed && typeof parsed.passed === "boolean") return parsed;
    } catch {
      /* keep scanning */
    }
  }
  return {
    passed: false,
    checks: [],
    reason: `verifier did not emit a {passed:boolean} JSON line; exit=${res.status} stderr=${(res.stderr || "").slice(0, 300)}`,
    verifier_error: true,
  };
}
