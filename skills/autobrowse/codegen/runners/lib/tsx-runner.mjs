// tsx-runner.mjs — shared logic for codegen target runners that boot a tsx
// script in a scaffolded output dir and parse its trailing JSON line.
//
// Playwright and Stagehand runners (and any future TS target that follows the
// same {"success":boolean,"data":...} contract) call runTsxTarget with their
// per-framework tweaks: a label for stderr prefix, extra env (e.g.
// PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1), and an optional preflight check (e.g.
// "ANTHROPIC_API_KEY required for Stagehand").

import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

export function getArg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

// Emit a JSON result line on stdout and exit. Centralized so the contract
// (single {passed:bool,...} JSON line, exit 0/2) is consistent across runners.
function emitAndExit(result) {
  console.log(JSON.stringify(result));
  process.exit(result.passed ? 0 : 2);
}

/**
 * Run a tsx target script against a fresh BB session.
 *
 * @param {object} opts
 * @param {string} opts.label                 stderr prefix, e.g. "playwright"
 * @param {Record<string,string>} [opts.extraEnv]  merged into the run's env
 * @param {Record<string,string>} [opts.installEnv] merged into npm install's env
 * @param {() => string|null} [opts.preflight]  return error message to fail fast
 */
export function runTsxTarget(opts) {
  const { label, extraEnv = {}, installEnv = {}, preflight } = opts;
  const outDir = getArg("out-dir");
  const script = getArg("script");

  if (!outDir || !script) {
    emitAndExit({ passed: false, error: "runner missing --out-dir or --script" });
  }

  const scriptPath = path.join(outDir, script);
  if (!fs.existsSync(scriptPath)) {
    emitAndExit({ passed: false, error: `script not found at ${scriptPath}` });
  }

  if (preflight) {
    const err = preflight();
    if (err) emitAndExit({ passed: false, error: err });
  }

  // Install deps once per outDir (the scaffold's package.json pins versions).
  if (!fs.existsSync(path.join(outDir, "node_modules"))) {
    process.stderr.write(`[runner.${label}] installing deps in ${outDir}\n`);
    const install = spawnSync("npm", ["install", "--silent", "--no-audit", "--no-fund"], {
      cwd: outDir,
      stdio: ["ignore", "inherit", "inherit"],
      env: { ...process.env, ...installEnv },
      timeout: 3 * 60 * 1000,
    });
    if (install.status !== 0) {
      emitAndExit({ passed: false, error: `npm install exited ${install.status}` });
    }
  }

  // Per-run screenshot dir, exposed to the script via SCREENSHOT_DIR so its
  // snap() helper can write progress / failure shots somewhere we can find.
  const screenshotDir = path.join(outDir, "screenshots", `verify-${Date.now()}`);
  fs.mkdirSync(screenshotDir, { recursive: true });

  process.stderr.write(`[runner.${label}] running ${scriptPath}\n`);
  const run = spawnSync("npx", ["tsx", script], {
    cwd: outDir,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...extraEnv, SCREENSHOT_DIR: screenshotDir },
    timeout: 5 * 60 * 1000,
  });

  const stdout = run.stdout ?? "";
  const stderr = run.stderr ?? "";

  // Parse the script's trailing JSON line — walk backward through lines and
  // take the last one that parses as JSON with a boolean `success` field.
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
    result.error = parsed?.error
      || (run.status !== 0 ? `script exited ${run.status}` : "script did not emit success:true");
  }
  emitAndExit(result);
}
