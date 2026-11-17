import * as fs from "node:fs";
import * as path from "node:path";
import { RESULTS_FILE } from "../config.mjs";

// One results.jsonl record per inner-agent run (training iteration, holdout
// run) — append-only, everything downstream is a query over this file.
//
// Schema (all rows):
//   ts, condition_id, task, tier, trial, phase: "train"|"holdout", iter,
//   run_id, env, inner_model, outer_model,
//   verified_pass, claimed_success, false_success, verifier_reason,
//   status, stop_reason, turns, duration_sec, browser_ms, model_ms,
//   tool_calls, tool_errors, tokens_in, tokens_out, inner_cost_usd,
//   outer_tokens_in, outer_tokens_out, outer_cost_usd, hypothesis,
//   converged_at (train rows on the converging iteration), mock

export function appendResult(record, file = RESULTS_FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify({ ts: new Date().toISOString(), ...record }) + "\n");
}

export function readResults(file = RESULTS_FILE) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
