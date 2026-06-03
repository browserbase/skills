#!/usr/bin/env node

/**
 * loop.mjs — Iterative autobrowse + Playwright verification.
 *
 * Wraps the existing evaluate.mjs and export.mjs into a single loop that
 * converges on a workflow which BOTH the LLM explorer and the deterministic
 * Playwright replay can complete. Each iteration:
 *
 *   1. Run evaluate.mjs (the inner LLM agent)
 *   2. If the trace passed (success: true in final JSON), run export.mjs to
 *      emit a Playwright script and replay it against a fresh BB session.
 *   3. If the Playwright replay also passed → record a pass.
 *      Else → distill the failure into strategy.md and continue.
 *   4. Graduate when Playwright has passed in 2 of the last 3 iterations.
 *
 * The shared `strategy.md` is the convergence point. The explorer reads it
 * each iteration. The codegen (eventually) reads its "Codegen Hints" section.
 * Playwright failures land in "Recent Playwright Failures".
 *
 * Usage:
 *   node scripts/loop.mjs --task <name> [--max-iterations N] [--max-turns-per-iter N]
 *                         [--workspace ./autobrowse] [--env local|remote]
 */

import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { distillFailure, appendToStrategy } from "./lib/distill-failure.mjs";
import { extractFinalJson, extractTrailingJsonObject, readSummary } from "./lib/pick-run.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(__dirname, "..");

// ── CLI ────────────────────────────────────────────────────────────

function getArg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const hasFlag = (n) => process.argv.includes(`--${n}`);

if (hasFlag("help") || hasFlag("h")) {
  console.log(`autobrowse loop — iterate evaluate + Playwright verification until convergence

Usage: node scripts/loop.mjs --task <name> [options]

Options:
  --task <name>              Task name — matches tasks/<name>/ (required)
  --max-iterations N         Cap on outer iterations (default: 8)
  --max-turns-per-iter N     Per-evaluate turn budget (default: 60)
  --workspace <dir>          Default: ./autobrowse
  --env local|remote         Default: local (use remote for bot-protected sites)
  --skip-verify              Skip the Playwright verify step (still emit script)

Convergence: graduates when the emitted Playwright script passes in 2 of the
last 3 iterations. Until then, each Playwright failure is distilled into
strategy.md so the next evaluate run can adapt.

Env vars:
  ANTHROPIC_API_KEY          Required for evaluate + distillation + LLM extract
  BROWSERBASE_API_KEY        Required for --env remote
  BROWSERBASE_PROJECT_ID     Required for --env remote
  BROWSERBASE_CONTEXT_ID     Optional — pre-authed context for both evaluate and Playwright`);
  process.exit(0);
}

const TASK = getArg("task");
const MAX_ITER = parseInt(getArg("max-iterations", "8"), 10);
const MAX_TURNS_PER_ITER = parseInt(getArg("max-turns-per-iter", "60"), 10);
const WORKSPACE = path.resolve(getArg("workspace", "autobrowse"));
const ENV = getArg("env", "local");
const SKIP_VERIFY = hasFlag("skip-verify");

if (!TASK) {
  console.error("ERROR: --task <name> is required. Run with --help.");
  process.exit(1);
}

// ── Paths ──────────────────────────────────────────────────────────

const evaluateScript = path.join(SKILL_DIR, "scripts", "evaluate.mjs");
const exportScript = path.join(SKILL_DIR, "scripts", "export.mjs");
const taskDir = path.join(WORKSPACE, "tasks", TASK);
const tracesDir = path.join(WORKSPACE, "traces", TASK);
const strategyPath = path.join(taskDir, "strategy.md");
const playwrightDir = path.join(taskDir, "playwright");
const playwrightScript = path.join(playwrightDir, `${TASK}.ts`);

if (!fs.existsSync(taskDir)) {
  console.error(`ERROR: ${taskDir} does not exist. Create task.md first (see SKILL.md).`);
  process.exit(1);
}

fs.mkdirSync(path.join(WORKSPACE, "reports"), { recursive: true });
const reportPath = path.join(
  WORKSPACE,
  "reports",
  `loop-${TASK}-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.md`,
);

// ── Helpers ────────────────────────────────────────────────────────

function log(msg) {
  console.error(`[loop] ${msg}`);
}

function runEvaluate(iter) {
  log(`iter ${iter}: running evaluate.mjs (max-turns ${MAX_TURNS_PER_ITER})…`);
  const args = [
    evaluateScript,
    "--task", TASK,
    "--workspace", WORKSPACE,
    "--env", ENV,
    "--max-turns", String(MAX_TURNS_PER_ITER),
  ];
  const result = spawnSync("node", args, {
    stdio: ["ignore", "pipe", "inherit"],
    encoding: "utf-8",
    env: process.env,
  });
  if (result.status !== 0) {
    log(`iter ${iter}: evaluate.mjs exited ${result.status}`);
  }
  // evaluate.mjs prints a JSON line to stdout with run id + cost
  let evalReport = null;
  try {
    const lastBrace = (result.stdout || "").lastIndexOf("{");
    if (lastBrace >= 0) evalReport = JSON.parse(result.stdout.slice(lastBrace));
  } catch {
    /* leave null */
  }
  return { status: result.status, evalReport };
}

function tracePassed(runId) {
  const summary = readSummary(tracesDir, runId);
  if (!summary) return false;
  const final = extractFinalJson(summary);
  return final && final.success === true;
}

function runExport(runId) {
  log(`exporting Playwright script from ${runId}…`);
  const args = [
    exportScript,
    "--task", TASK,
    "--workspace", WORKSPACE,
    "--target", "playwright",
    "--run", runId,
    "--no-verify", // we run the verification ourselves below so we can capture/distill output
  ];
  // Capture export.mjs's stdout instead of letting it inherit — export.mjs
  // writes its own JSON report to stdout under --no-verify, and loop.mjs
  // emits its own structured JSON at the very end. Mixing them would break
  // any consumer that JSON.parses our stdout. Tail the export's stdout into
  // stderr (which the user does see) so the inner progress isn't invisible.
  const result = spawnSync("node", args, {
    stdio: ["ignore", "pipe", "inherit"],
    encoding: "utf-8",
    env: process.env,
  });
  if (result.stdout) process.stderr.write(`[export] ${result.stdout.trim()}\n`);
  return result.status === 0;
}

function runPlaywright() {
  log(`replaying Playwright script…`);
  // Ensure deps are installed (first iter only is slow; npm caches after).
  if (!fs.existsSync(path.join(playwrightDir, "node_modules"))) {
    const install = spawnSync("npm", ["install", "--silent"], {
      cwd: playwrightDir,
      stdio: ["ignore", "inherit", "inherit"],
    });
    if (install.status !== 0) {
      return { passed: false, exitCode: install.status, stdout: "", stderr: "npm install failed" };
    }
  }
  const run = spawnSync("npx", ["tsx", `${TASK}.ts`], {
    cwd: playwrightDir,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  const stdout = run.stdout ?? "";
  const stderr = run.stderr ?? "";
  // Parse the script's final JSON result. The emitted Playwright script
  // uses JSON.stringify(result, null, 2), so the output is pretty-printed
  // across multiple lines and the trailing `}` is what we want to anchor
  // on. Walk back from the LAST `}` and brace-balance to its matching `{`
  // — works for both flat (chess.com-style) and nested (mountainproject-
  // style) output schemas. Fall back to the prior heuristic only if
  // balancing fails.
  const parsed = extractTrailingJsonObject(stdout);
  const passed = run.status === 0 && parsed?.success === true;
  return { passed, exitCode: run.status, stdout, stderr, parsed };
}

// ── Main loop ──────────────────────────────────────────────────────

const history = []; // [{ iter, runId, evalPassed, pwPassed, distillReason }]

async function main() {
  log(`task=${TASK} workspace=${WORKSPACE} env=${ENV} max-iter=${MAX_ITER}`);

  for (let iter = 1; iter <= MAX_ITER; iter++) {
    log(`──────── iteration ${iter}/${MAX_ITER} ────────`);

    // 1. Run evaluate
    const { status: evalStatus, evalReport } = runEvaluate(iter);
    const runId = evalReport?.run ?? null;
    const evalPassed = runId ? tracePassed(runId) : false;
    log(`iter ${iter}: evaluate ${evalPassed ? "✅ passed" : "❌ no success: true"} (run=${runId ?? "?"})`);

    const hist = { iter, runId, evalPassed, pwPassed: false, distillReason: null };
    history.push(hist);

    if (!evalPassed) {
      log(`iter ${iter}: skipping Playwright (trace not passing) — agent will iterate next round`);
      continue;
    }

    // 2. Emit Playwright (overwrites previous if any)
    const exportOk = runExport(runId);
    if (!exportOk) {
      log(`iter ${iter}: export failed; treating as Playwright fail`);
      hist.distillReason = "export script returned non-zero";
      continue;
    }

    if (SKIP_VERIFY) {
      log(`iter ${iter}: --skip-verify set; not running Playwright`);
      continue;
    }

    // 3. Run Playwright
    const pw = runPlaywright();
    hist.pwPassed = pw.passed;
    log(`iter ${iter}: Playwright ${pw.passed ? "✅ passed" : `❌ failed (exit=${pw.exitCode})`}`);

    if (!pw.passed) {
      // 4. Distill the failure into strategy.md
      log(`iter ${iter}: distilling Playwright failure into strategy.md…`);
      const { addendum, generated, reason } = await distillFailure({
        iteration: iter,
        taskName: TASK,
        scriptPath: playwrightScript,
        exitCode: pw.exitCode,
        stdout: pw.stdout,
        stderr: pw.stderr,
      });
      appendToStrategy(strategyPath, addendum);
      hist.distillReason = generated ? "LLM-summarized" : `fallback: ${reason}`;
      log(`iter ${iter}: strategy.md updated (${hist.distillReason})`);
    }

    // 5. Convergence check — Playwright passed in 2 of last 3 iterations?
    if (graduationReached(history)) {
      const last3 = history.slice(-3);
      const passes = last3.filter((h) => h.pwPassed).length;
      log(`🎓 GRADUATED: Playwright passed in ${passes} of last ${last3.length} iterations`);
      break;
    }
  }

  // ── Write report ─────────────────────────────────────────────────
  // Graduation is the strict "last-3" criterion, not raw pass count — two
  // successes separated by many failures don't graduate. Use the same rule
  // here as inside the loop to keep report / flag / exit code aligned.
  const graduated = graduationReached(history);
  const passedCount = history.filter((h) => h.pwPassed).length;
  const lines = [
    `# autobrowse loop report — ${TASK}`,
    ``,
    `**Total iterations:** ${history.length}`,
    `**Playwright passes:** ${passedCount}`,
    `**Final status:** ${graduated ? "✅ graduated" : "❌ did not converge"}`,
    ``,
    `## Per-iteration`,
    ``,
    `| Iter | Run | Trace passed | Playwright passed | Distill |`,
    `|------|-----|--------------|-------------------|---------|`,
    ...history.map((h) =>
      `| ${h.iter} | ${h.runId ?? "?"} | ${h.evalPassed ? "✅" : "❌"} | ${h.pwPassed ? "✅" : "❌"} | ${h.distillReason ?? "—"} |`,
    ),
    ``,
    `Strategy file: \`${strategyPath}\``,
    passedCount >= 1 ? `Latest emitted script: \`${playwrightScript}\`` : "",
  ];
  fs.writeFileSync(reportPath, lines.filter(Boolean).join("\n") + "\n");
  log(`wrote report → ${reportPath}`);

  // Final structured stdout
  console.log(JSON.stringify({
    task: TASK,
    iterations: history.length,
    pw_passes: passedCount,
    graduated,
    history,
    report: reportPath,
    script: passedCount >= 1 ? playwrightScript : null,
  }, null, 2));

  process.exit(graduated ? 0 : 2);
}

// Graduation = Playwright passed in ≥2 of the last 3 iterations, with at
// least 2 iterations on the record. Single source of truth for the
// mid-loop break, the report's "Final status", the JSON `graduated`
// field, and the process exit code.
function graduationReached(history) {
  if (history.length < 2) return false;
  const last3 = history.slice(-3);
  return last3.filter((h) => h.pwPassed).length >= 2;
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
