#!/usr/bin/env node

/**
 * loop.mjs — Iterative autobrowse + deterministic verification.
 *
 * Wraps the existing evaluate.mjs and export.mjs into a single loop that
 * converges on a workflow which BOTH the LLM explorer and the deterministic
 * replay can complete. Each iteration:
 *
 *   1. Run evaluate.mjs (the inner LLM agent)
 *   2. If the trace passed (success: true in final JSON), run export.mjs to
 *      emit a script for the chosen target (--target playwright|stagehand)
 *      and replay it against a fresh BB session.
 *   3. If the replay also passed → record a pass.
 *      Else → distill the failure into strategy.md and continue.
 *   4. Graduate when the replay has passed in 2 of the last 3 iterations.
 *
 * The shared `strategy.md` is the convergence point. The explorer reads it
 * each iteration. The codegen reads its "Codegen Hints" section. Replay
 * failures land in "Recent <Target> Failures".
 *
 * Usage:
 *   node scripts/loop.mjs --task <name> [--target playwright|stagehand]
 *                         [--max-iterations N] [--max-turns-per-iter N]
 *                         [--workspace ./autobrowse] [--env local|remote]
 */

import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { distillFailure, appendToStrategy } from "./lib/distill-failure.mjs";
import { pickRun } from "./lib/pick-run.mjs";
import { extractFinalJson, readSummary } from "./lib/pick-run.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(__dirname, "..");

// ── CLI ────────────────────────────────────────────────────────────

function getArg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const hasFlag = (n) => process.argv.includes(`--${n}`);

if (hasFlag("help") || hasFlag("h")) {
  console.log(`autobrowse loop — iterate evaluate + deterministic replay until convergence

Usage: node scripts/loop.mjs --task <name> [options]

Options:
  --task <name>              Task name — matches tasks/<name>/ (required)
  --target <kind>            playwright (default) | stagehand
  --max-iterations N         Cap on outer iterations (default: 8)
  --max-turns-per-iter N     Per-evaluate turn budget (default: 60)
  --workspace <dir>          Default: ./autobrowse
  --env local|remote         Default: local (use remote for bot-protected sites)
  --skip-verify              Skip the replay verify step (still emit script)

Convergence: graduates when the emitted script passes in 2 of the last 3
iterations. Until then, each replay failure is distilled into strategy.md so
the next evaluate run can adapt.

Env vars:
  ANTHROPIC_API_KEY          Required for evaluate + distillation + LLM extract
  BROWSERBASE_API_KEY        Required for --env remote
  BROWSERBASE_PROJECT_ID     Required for --env remote
  BROWSERBASE_CONTEXT_ID     Optional — pre-authed context for both evaluate and Playwright`);
  process.exit(0);
}

const TASK = getArg("task");
const TARGET = getArg("target", "playwright");
const MAX_ITER = parseInt(getArg("max-iterations", "8"), 10);
const MAX_TURNS_PER_ITER = parseInt(getArg("max-turns-per-iter", "60"), 10);
const WORKSPACE = path.resolve(getArg("workspace", "autobrowse"));
const ENV = getArg("env", "local");
const SKIP_VERIFY = hasFlag("skip-verify");

if (!TASK) {
  console.error("ERROR: --task <name> is required. Run with --help.");
  process.exit(1);
}
if (TARGET !== "playwright" && TARGET !== "stagehand") {
  console.error(`ERROR: --target=${TARGET} not supported. Use playwright or stagehand.`);
  process.exit(1);
}
const TARGET_LABEL = TARGET === "stagehand" ? "Stagehand" : "Playwright";

// ── Paths ──────────────────────────────────────────────────────────

const evaluateScript = path.join(SKILL_DIR, "scripts", "evaluate.mjs");
const exportScript = path.join(SKILL_DIR, "scripts", "export.mjs");
const taskDir = path.join(WORKSPACE, "tasks", TASK);
const tracesDir = path.join(WORKSPACE, "traces", TASK);
const strategyPath = path.join(taskDir, "strategy.md");
const targetDir = path.join(taskDir, TARGET);
const targetScript = path.join(targetDir, `${TASK}.ts`);

if (!fs.existsSync(taskDir)) {
  console.error(`ERROR: ${taskDir} does not exist. Create task.md first (see SKILL.md).`);
  process.exit(1);
}

fs.mkdirSync(path.join(WORKSPACE, "reports"), { recursive: true });
const reportPath = path.join(
  WORKSPACE,
  "reports",
  `loop-${TASK}-${TARGET}-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.md`,
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
  log(`exporting ${TARGET_LABEL} script from ${runId}…`);
  const args = [
    exportScript,
    "--task", TASK,
    "--workspace", WORKSPACE,
    "--target", TARGET,
    "--run", runId,
    "--no-verify", // we run the verification ourselves below so we can capture/distill output
  ];
  const result = spawnSync("node", args, {
    stdio: ["ignore", "inherit", "inherit"],
    env: process.env,
  });
  return result.status === 0;
}

function runReplay() {
  log(`replaying ${TARGET_LABEL} script…`);
  // Ensure deps are installed (first iter only is slow; npm caches after).
  if (!fs.existsSync(path.join(targetDir, "node_modules"))) {
    const install = spawnSync("npm", ["install", "--silent"], {
      cwd: targetDir,
      stdio: ["ignore", "inherit", "inherit"],
    });
    if (install.status !== 0) {
      return { passed: false, exitCode: install.status, stdout: "", stderr: "npm install failed" };
    }
  }
  const run = spawnSync("npx", ["tsx", `${TASK}.ts`], {
    cwd: targetDir,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  const stdout = run.stdout ?? "";
  const stderr = run.stderr ?? "";
  // Parse the last JSON line for success
  let parsed = null;
  try {
    const lastBrace = stdout.lastIndexOf("{");
    if (lastBrace >= 0) parsed = JSON.parse(stdout.slice(lastBrace));
  } catch {
    /* leave null */
  }
  const passed = run.status === 0 && parsed?.success === true;
  return { passed, exitCode: run.status, stdout, stderr, parsed };
}

// ── Main loop ──────────────────────────────────────────────────────

const history = []; // [{ iter, runId, evalPassed, replayPassed, distillReason }]

async function main() {
  log(`task=${TASK} target=${TARGET} workspace=${WORKSPACE} env=${ENV} max-iter=${MAX_ITER}`);

  for (let iter = 1; iter <= MAX_ITER; iter++) {
    log(`──────── iteration ${iter}/${MAX_ITER} ────────`);

    // 1. Run evaluate
    const { status: evalStatus, evalReport } = runEvaluate(iter);
    const runId = evalReport?.run ?? null;
    const evalPassed = runId ? tracePassed(runId) : false;
    log(`iter ${iter}: evaluate ${evalPassed ? "✅ passed" : "❌ no success: true"} (run=${runId ?? "?"})`);

    const hist = { iter, runId, evalPassed, replayPassed: false, distillReason: null };
    history.push(hist);

    if (!evalPassed) {
      log(`iter ${iter}: skipping ${TARGET_LABEL} (trace not passing) — agent will iterate next round`);
      continue;
    }

    // 2. Emit script (overwrites previous if any)
    const exportOk = runExport(runId);
    if (!exportOk) {
      log(`iter ${iter}: export failed; treating as ${TARGET_LABEL} fail`);
      hist.distillReason = "export script returned non-zero";
      continue;
    }

    if (SKIP_VERIFY) {
      log(`iter ${iter}: --skip-verify set; not replaying ${TARGET_LABEL}`);
      continue;
    }

    // 3. Run replay
    const replay = runReplay();
    hist.replayPassed = replay.passed;
    log(`iter ${iter}: ${TARGET_LABEL} ${replay.passed ? "✅ passed" : `❌ failed (exit=${replay.exitCode})`}`);

    if (!replay.passed) {
      // 4. Distill the failure into strategy.md
      log(`iter ${iter}: distilling ${TARGET_LABEL} failure into strategy.md…`);
      const { addendum, generated, reason } = await distillFailure({
        iteration: iter,
        taskName: TASK,
        target: TARGET,
        scriptPath: targetScript,
        exitCode: replay.exitCode,
        stdout: replay.stdout,
        stderr: replay.stderr,
      });
      appendToStrategy(strategyPath, addendum, TARGET);
      hist.distillReason = generated ? "LLM-summarized" : `fallback: ${reason}`;
      log(`iter ${iter}: strategy.md updated (${hist.distillReason})`);
    }

    // 5. Convergence check — replay passed in 2 of last 3 iterations?
    const last3 = history.slice(-3);
    const passes = last3.filter((h) => h.replayPassed).length;
    if (passes >= 2 && history.length >= 2) {
      log(`🎓 GRADUATED: ${TARGET_LABEL} passed in ${passes} of last ${last3.length} iterations`);
      break;
    }
  }

  // ── Write report ─────────────────────────────────────────────────
  const passedCount = history.filter((h) => h.replayPassed).length;
  const lines = [
    `# autobrowse loop report — ${TASK} (${TARGET})`,
    ``,
    `**Total iterations:** ${history.length}`,
    `**${TARGET_LABEL} passes:** ${passedCount}`,
    `**Final status:** ${passedCount >= 2 ? "✅ graduated" : "❌ did not converge"}`,
    ``,
    `## Per-iteration`,
    ``,
    `| Iter | Run | Trace passed | ${TARGET_LABEL} passed | Distill |`,
    `|------|-----|--------------|----------------------|---------|`,
    ...history.map((h) =>
      `| ${h.iter} | ${h.runId ?? "?"} | ${h.evalPassed ? "✅" : "❌"} | ${h.replayPassed ? "✅" : "❌"} | ${h.distillReason ?? "—"} |`,
    ),
    ``,
    `Strategy file: \`${strategyPath}\``,
    passedCount >= 1 ? `Latest emitted script: \`${targetScript}\`` : "",
  ];
  fs.writeFileSync(reportPath, lines.filter(Boolean).join("\n") + "\n");
  log(`wrote report → ${reportPath}`);

  // Final structured stdout
  console.log(JSON.stringify({
    task: TASK,
    target: TARGET,
    iterations: history.length,
    replay_passes: passedCount,
    graduated: passedCount >= 2,
    history,
    report: reportPath,
    script: passedCount >= 1 ? targetScript : null,
  }, null, 2));

  process.exit(passedCount >= 2 ? 0 : 2);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
