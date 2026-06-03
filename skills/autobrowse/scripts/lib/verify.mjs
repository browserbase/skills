// verify.mjs — install deps + run the generated script + parse its final JSON.
//
// Pass = exit 0 AND last JSON block on stdout has `success: true`.

import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

import { extractTrailingJsonObject } from "./pick-run.mjs";

export function verifyGenerated(outDir, scriptFilename) {
  const log = (msg) => console.error(`[verify] ${msg}`);
  log(`running npm install (silent) in ${outDir}…`);
  const install = spawnSync("npm", ["install", "--silent"], {
    cwd: outDir,
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (install.status !== 0) {
    log(`npm install failed (exit ${install.status})`);
    return {
      passed: false,
      exit_code: install.status ?? 1,
      run_log: null,
      output: null,
      stage: "install",
    };
  }

  log(`running: npx tsx ${scriptFilename}`);
  const runLogPath = path.join(outDir, "run.log");
  const run = spawnSync("npx", ["tsx", scriptFilename], {
    cwd: outDir,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  fs.writeFileSync(runLogPath, `STDOUT:\n${run.stdout ?? ""}\n\nSTDERR:\n${run.stderr ?? ""}\n`);

  // Brace-balanced trailing-JSON extraction — robust to pretty-printed
  // (multi-line, nested) script output, unlike `lastIndexOf("{")` which
  // locks onto the deepest inner `{`.
  const parsed = extractTrailingJsonObject(run.stdout ?? "");

  const passed = run.status === 0 && parsed?.success === true;
  log(passed ? `✅ verification passed` : `❌ verification failed (exit=${run.status}) — see ${runLogPath}`);
  return {
    passed,
    exit_code: run.status,
    run_log: runLogPath,
    output: parsed,
    stage: "run",
  };
}
