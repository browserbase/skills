#!/usr/bin/env node

/**
 * stagehand.mjs — Runner for the Stagehand codegen target.
 *
 * Identical contract to runners/playwright.mjs (spawn `npx tsx <task>.ts`,
 * parse the final {"success":boolean} JSON line). The only differences:
 *   - No PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD trick (Stagehand uses
 *     connectOverCDP without bundling a local chromium).
 *   - Requires ANTHROPIC_API_KEY in env (Stagehand's act/extract are
 *     LLM-driven).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

function getArg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

const OUT_DIR = getArg("out-dir");
const TASK = getArg("task");

if (!OUT_DIR || !TASK) {
  console.log(JSON.stringify({ passed: false, error: "runner missing --out-dir or --task" }));
  process.exit(2);
}

const scriptPath = path.join(OUT_DIR, `${TASK}.ts`);
if (!fs.existsSync(scriptPath)) {
  console.log(JSON.stringify({ passed: false, error: `script not found at ${scriptPath}` }));
  process.exit(2);
}

if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
  console.log(JSON.stringify({ passed: false, error: "ANTHROPIC_API_KEY required for Stagehand verify" }));
  process.exit(2);
}

if (!fs.existsSync(path.join(OUT_DIR, "node_modules"))) {
  process.stderr.write(`[runner.stagehand] installing deps in ${OUT_DIR}\n`);
  const install = spawnSync("npm", ["install", "--silent", "--no-audit", "--no-fund"], {
    cwd: OUT_DIR,
    stdio: ["ignore", "inherit", "inherit"],
    timeout: 3 * 60 * 1000,
  });
  if (install.status !== 0) {
    console.log(JSON.stringify({ passed: false, error: `npm install exited ${install.status}` }));
    process.exit(2);
  }
}

const screenshotDir = path.join(OUT_DIR, "screenshots", `verify-${Date.now()}`);
fs.mkdirSync(screenshotDir, { recursive: true });

process.stderr.write(`[runner.stagehand] running ${scriptPath}\n`);
const run = spawnSync("npx", ["tsx", `${TASK}.ts`], {
  cwd: OUT_DIR,
  encoding: "utf-8",
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, SCREENSHOT_DIR: screenshotDir },
  timeout: 5 * 60 * 1000,
});

const stdout = run.stdout ?? "";
const stderr = run.stderr ?? "";

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
