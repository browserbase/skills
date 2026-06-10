#!/usr/bin/env node
// run-matrix.mjs — eval orchestrator: condition × task × trial.
//
// Per cell: TRAIN (evaluate → verify → improve strategy, up to max_iters,
// early-stop on convergence) then HOLDOUT (freeze best strategy, N fresh
// runs, verify each). Every run appends one row to runs/results.jsonl.
//
// Usage:
//   node eval/run-matrix.mjs --conditions baseline --tasks fixture-checkout,books-toscrape
//   node eval/run-matrix.mjs --conditions baseline,inner-haiku --tasks all --trials 3
//   node eval/run-matrix.mjs --conditions baseline --tasks fixture-checkout --mock
//   Flags: --phase train|holdout|all (default all), --results <file>

import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import * as net from "node:net";
import { spawn } from "node:child_process";
import { loadCondition, loadTaskMeta, listTasks, TASKS_DIR, RUNS_DIR, RESULTS_FILE, FIXTURES_DIR } from "./config.mjs";
import { runInner } from "./lib/run-inner.mjs";
import { runVerifier } from "./lib/run-verifier.mjs";
import { loadRunOutput } from "./lib/extract-output.mjs";
import { traceStats } from "./lib/trace-stats.mjs";
import { appendResult } from "./lib/results.mjs";
import { costUsd } from "./lib/pricing.mjs";
import { improveStrategy } from "./outer-agent.mjs";

// ── CLI args ────────────────────────────────────────────────────────

function getArg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx !== -1 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith("--")) return process.argv[idx + 1];
  return fallback;
}
const hasFlag = (name) => process.argv.includes(`--${name}`);

const conditionIds = getArg("conditions", "baseline").split(",");
const taskArg = getArg("tasks", "all");
const trials = parseInt(getArg("trials", "1"), 10);
const trialOffset = parseInt(getArg("trial-offset", "0"), 10); // fresh trial numbers when adding runs later
const phase = getArg("phase", "all");
const mock = hasFlag("mock");
const resultsFile = getArg("results", RESULTS_FILE);

const tasks = taskArg === "all" ? listTasks() : taskArg.split(",");

// ── Fixture server (auto-start when a selected task needs it) ──────

const FIXTURE_PORT = 4173;

function portInUse(port) {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host: "127.0.0.1" }, () => { sock.destroy(); resolve(true); });
    sock.on("error", () => resolve(false));
  });
}

async function ensureFixtures(metas) {
  if (mock) return null;
  if (!metas.some((m) => (m.requires || []).includes("fixtures-server"))) return null;
  if (await portInUse(FIXTURE_PORT)) {
    console.error(`[matrix] fixtures server already running on :${FIXTURE_PORT}`);
    return null;
  }
  const child = spawn("node", [path.join(FIXTURES_DIR, "serve.mjs")], { stdio: "ignore", detached: false });
  await new Promise((r) => setTimeout(r, 600));
  console.error(`[matrix] started fixtures server on :${FIXTURE_PORT} (pid ${child.pid})`);
  return child;
}

// ── One eval cell: condition × task × trial ─────────────────────────

async function runCell(cond, meta, trial) {
  const task = meta.task;
  const workspace = path.join(RUNS_DIR, cond.id, task, `trial-${trial}`);
  const wsTaskDir = path.join(workspace, "tasks", task);
  fs.mkdirSync(wsTaskDir, { recursive: true });
  fs.copyFileSync(path.join(TASKS_DIR, task, "task.md"), path.join(wsTaskDir, "task.md"));
  const strategyFile = path.join(wsTaskDir, "strategy.md");
  if (!fs.existsSync(strategyFile)) fs.writeFileSync(strategyFile, `# ${task} Navigation Skill\n\n(learned through iterations)\n`);

  const taskMd = fs.readFileSync(path.join(wsTaskDir, "task.md"), "utf-8");
  const base = {
    condition_id: cond.id, task, tier: meta.tier, trial, env: meta.env,
    inner_model: cond.inner_model, outer_model: cond.outer_model, mock,
  };

  const recordRun = (phaseName, iter, runResult, verifierResult, extra = {}) => {
    const output = runResult.trace_dir ? loadRunOutput(runResult.trace_dir) : null;
    const claimed = output?.success === true;
    const stats = runResult.trace_dir ? traceStats(runResult.trace_dir, runResult.duration_sec) : {};
    const row = {
      ...base,
      phase: phaseName, iter,
      run_id: runResult.run ?? null,
      verified_pass: verifierResult.passed,
      claimed_success: claimed,
      false_success: claimed && !verifierResult.passed,
      verifier_reason: verifierResult.reason ?? null,
      status: runResult.status, stop_reason: runResult.stop_reason,
      turns: runResult.turns, duration_sec: runResult.duration_sec,
      ...stats,
      tokens_in: runResult.tokens_in, tokens_out: runResult.tokens_out,
      inner_cost_usd: +costUsd(cond.inner_model, runResult.tokens_in || 0, runResult.tokens_out || 0).toFixed(4),
      ...extra,
    };
    appendResult(row, resultsFile);
    return row;
  };

  // ── TRAIN ─────────────────────────────────────────────────────────
  const trainPasses = [];
  let lastPassingStrategyIter = null;

  if (phase !== "holdout") {
    for (let iter = 1; iter <= cond.max_iters; iter++) {
      // Snapshot the strategy this run will use (versioned for revert/holdout).
      fs.copyFileSync(strategyFile, path.join(wsTaskDir, `strategy.iter-${iter}.md`));

      console.error(`[matrix] ${cond.id}/${task}/trial-${trial} TRAIN iter ${iter}/${cond.max_iters}`);
      const runResult = runInner({
        task, workspace, env: meta.env, model: cond.inner_model,
        maxTurns: meta.max_turns, timeoutMin: meta.timeout_min, mock, iter,
        logFile: path.join(workspace, "logs", `train-iter-${iter}.log`),
      });
      const verifierResult = runResult.trace_dir
        ? runVerifier(task, runResult.trace_dir)
        : { passed: false, checks: [], reason: "no trace dir (harness error)" };

      trainPasses.push(verifierResult.passed);
      if (verifierResult.passed) lastPassingStrategyIter = iter;

      const window = trainPasses.slice(-cond.converge_window);
      const converged =
        verifierResult.passed &&
        window.filter(Boolean).length >= cond.converge_passes &&
        trainPasses.length >= 2;

      const regression = iter > 1 && trainPasses[iter - 2] === true && verifierResult.passed === false;

      let improvement = null;
      if (!converged && iter < cond.max_iters) {
        // Revert a regressing edit before improving again (SKILL.md policy).
        if (regression) {
          fs.copyFileSync(path.join(wsTaskDir, `strategy.iter-${iter - 1}.md`), strategyFile);
          console.error(`[matrix]   regression — reverted strategy to iter ${iter - 1}`);
        }
        const strategyMd = fs.readFileSync(strategyFile, "utf-8");
        try {
          improvement = await improveStrategy({
            model: cond.outer_model, promptName: cond.outer_prompt,
            taskMd, strategyMd, runResult, verifierResult, mock, iter,
          });
          fs.writeFileSync(strategyFile, improvement.newStrategy);
        } catch (err) {
          console.error(`[matrix]   outer agent error: ${err.message}`);
          improvement = { hypothesis: `OUTER-AGENT-ERROR: ${err.message}`, tokens_in: 0, tokens_out: 0, cost_usd: 0 };
        }
      }

      recordRun("train", iter, runResult, verifierResult, {
        regression,
        converged_at: converged ? iter : null,
        hypothesis: improvement?.hypothesis ?? null,
        outer_tokens_in: improvement?.tokens_in ?? 0,
        outer_tokens_out: improvement?.tokens_out ?? 0,
        outer_cost_usd: improvement ? +improvement.cost_usd.toFixed(4) : 0,
      });

      if (converged) {
        console.error(`[matrix]   converged at iter ${iter}`);
        break;
      }
    }
  }

  // ── HOLDOUT ───────────────────────────────────────────────────────
  if (phase !== "train") {
    // Freeze the best strategy: the last version that produced a verified
    // pass; else whatever training ended with.
    if (lastPassingStrategyIter !== null) {
      const best = path.join(wsTaskDir, `strategy.iter-${lastPassingStrategyIter}.md`);
      // The passing run used the strategy *as snapshotted before that run*,
      // unless it was also improved after — the snapshot is the right artifact.
      fs.copyFileSync(best, strategyFile);
    }
    fs.copyFileSync(strategyFile, path.join(wsTaskDir, "strategy.holdout.md"));

    for (let h = 1; h <= cond.holdout_runs; h++) {
      console.error(`[matrix] ${cond.id}/${task}/trial-${trial} HOLDOUT ${h}/${cond.holdout_runs}`);
      const runResult = runInner({
        task, workspace, env: meta.env, model: cond.inner_model,
        maxTurns: meta.max_turns, timeoutMin: meta.timeout_min, mock, iter: 99,
        logFile: path.join(workspace, "logs", `holdout-${h}.log`),
      });
      const verifierResult = runResult.trace_dir
        ? runVerifier(task, runResult.trace_dir)
        : { passed: false, checks: [], reason: "no trace dir (harness error)" };
      recordRun("holdout", h, runResult, verifierResult);
    }
  }
}

// ── Main ────────────────────────────────────────────────────────────

const conditions = conditionIds.map(loadCondition);
const metas = tasks.map(loadTaskMeta);
const fixturesChild = await ensureFixtures(metas);

console.error(`[matrix] ${conditions.length} condition(s) × ${tasks.length} task(s) × ${trials} trial(s)${mock ? " [MOCK]" : ""}`);
console.error(`[matrix] results → ${resultsFile}`);

try {
  const cells = [];
  for (const cond of conditions) {
    for (const meta of metas) {
      for (let trial = trialOffset + 1; trial <= trialOffset + trials; trial++) {
        cells.push({ cond, meta, trial });
      }
    }
  }

  // Concurrency: remote cells each get their own pre-created Browserbase
  // session (isolated CDP attach), so they can run in parallel. Local mode is
  // a single Chrome daemon — force sequential when any local task is selected.
  let concurrency = Math.max(1, parseInt(getArg("concurrency", "1"), 10));
  if (!mock && concurrency > 1 && metas.some((m) => m.env === "local")) {
    console.error("[matrix] local task selected — forcing --concurrency 1 (single Chrome daemon)");
    concurrency = 1;
  }

  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, cells.length) }, async () => {
      while (true) {
        const i = next++;
        if (i >= cells.length) break;
        const { cond, meta, trial } = cells[i];
        try {
          await runCell(cond, meta, trial);
        } catch (err) {
          console.error(`[matrix] cell ${cond.id}/${meta.task}/trial-${trial} crashed: ${err.message}`);
        }
      }
    })
  );
} finally {
  if (fixturesChild) fixturesChild.kill();
}

console.error("[matrix] done. Run: node eval/report.mjs");
