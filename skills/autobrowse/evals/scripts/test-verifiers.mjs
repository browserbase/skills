#!/usr/bin/env node
// Verifier self-test. For every task: its mock-output.json (a documented
// known-good output) MUST pass its verifier, and a garbage claimed-success
// output MUST fail it. Catches both broken verifiers and verifiers an agent
// could trivially reward-hack with {"success": true}.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { listTasks, TASKS_DIR } from "../eval/config.mjs";
import { runVerifier } from "../eval/lib/run-verifier.mjs";

const GARBAGE = { success: true, note: "fabricated", value: 42 };

function makeRunDir(output) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-test-"));
  fs.writeFileSync(path.join(dir, "result.json"), JSON.stringify({ parsed: output, raw: JSON.stringify(output), parse_error: null }));
  return dir;
}

let failures = 0;
for (const task of listTasks()) {
  const mockOutput = JSON.parse(fs.readFileSync(path.join(TASKS_DIR, task, "mock-output.json"), "utf-8"));

  const good = runVerifier(task, makeRunDir(mockOutput));
  const bad = runVerifier(task, makeRunDir(GARBAGE));

  const goodOk = good.passed === true;
  const badOk = bad.passed === false;
  if (!goodOk || !badOk) failures++;

  console.log(
    `${goodOk && badOk ? "✅" : "❌"} ${task.padEnd(24)} known-good ${goodOk ? "passes" : `FAILS (${good.reason})`}; garbage ${badOk ? "rejected" : "ACCEPTED (verifier is hackable!)"}`
  );
}

if (failures) {
  console.error(`\n${failures} verifier(s) broken`);
  process.exit(1);
}
console.log("\nAll verifiers sound.");
