#!/usr/bin/env node

/**
 * playwright.mjs — Runner for the Playwright codegen target.
 *
 * Invoked by codegen.mjs's verify step. Installs deps if needed, runs the
 * emitted <task>.ts via tsx against a fresh BB session, and emits a JSON
 * result line.
 *
 * Contract:
 *   - Reads --out-dir <path>      (the scaffolded output dir)
 *   - Reads --script <basename>   (file inside --out-dir to run, e.g. acme.ts)
 *   - Spawns `npx tsx <basename>` with PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
 *   - SCREENSHOT_DIR is set so the script can call snap() into a per-run dir
 *   - Returns: prints a single JSON line {"passed":boolean, ...} on stdout
 *
 * The script being run is expected to print a `{"success":true,"data":...}`
 * JSON line as its last stdout. We parse that to determine pass/fail.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

function getArg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

const OUT_DIR = getArg("out-dir");
const SCRIPT = getArg("script");

if (!OUT_DIR || !SCRIPT) {
  console.log(JSON.stringify({ passed: false, error: "runner missing --out-dir or --script" }));
  process.exit(2);
}

const scriptPath = path.join(OUT_DIR, SCRIPT);
if (!fs.existsSync(scriptPath)) {
  console.log(JSON.stringify({ passed: false, error: `script not found at ${scriptPath}` }));
  process.exit(2);
}

// ── npm install once per outDir ───────────────────────────────────

if (!fs.existsSync(path.join(OUT_DIR, "node_modules"))) {
  process.stderr.write(`[runner.playwright] installing deps in ${OUT_DIR}\n`);
  const install = spawnSync("npm", ["install", "--silent", "--no-audit", "--no-fund"], {
    cwd: OUT_DIR,
    stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1" },
    timeout: 3 * 60 * 1000,
  });
  if (install.status !== 0) {
    console.log(JSON.stringify({ passed: false, error: `npm install exited ${install.status}` }));
    process.exit(2);
  }
}

// ── run the script ────────────────────────────────────────────────

const screenshotDir = path.join(OUT_DIR, "screenshots", `verify-${Date.now()}`);
fs.mkdirSync(screenshotDir, { recursive: true });

process.stderr.write(`[runner.playwright] running ${scriptPath}\n`);
const run = spawnSync("npx", ["tsx", SCRIPT], {
  cwd: OUT_DIR,
  encoding: "utf-8",
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1",
    SCREENSHOT_DIR: screenshotDir,
  },
  timeout: 5 * 60 * 1000,
});

const stdout = run.stdout ?? "";
const stderr = run.stderr ?? "";

// Final stdout line should be {"success":true,...} or {"success":false,...}.
let parsed = null;
const lines = stdout.trim().split("\n").filter(Boolean);
for (let i = lines.length - 1; i >= 0; i--) {
  try {
    const candidate = JSON.parse(lines[i]);
    if (typeof candidate?.success === "boolean") {
      parsed = candidate;
      break;
    }
  } catch {}
}

const passed = run.status === 0 && parsed?.success === true;
const result = {
  passed,
  exit_code: run.status,
  script_output: parsed,
  screenshot_dir: screenshotDir,
  stderr_tail: stderr.slice(-2000),
};
if (!passed) {
  result.error = parsed?.error || (run.status !== 0 ? `script exited ${run.status}` : "script did not emit success:true");
}
console.log(JSON.stringify(result));
process.exit(passed ? 0 : 2);
