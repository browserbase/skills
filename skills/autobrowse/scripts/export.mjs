#!/usr/bin/env node

/**
 * export.mjs — Translate a graduated autobrowse task into a deterministic
 * runnable script.
 *
 * Supports --target playwright (default) and --target stagehand. Playwright
 * resolves every ARIA ref to a locator at export time; Stagehand-native
 * collapses every interaction op to `page.act(...)` and lets Stagehand
 * self-heal at replay time.
 *
 * Usage:
 *   node scripts/export.mjs --task <name> --target playwright \\
 *        [--workspace ./autobrowse] [--run run-NNN] \\
 *        [--output <dir>] [--no-verify]
 */

import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";

import { pickRun, listRuns } from "./lib/pick-run.mjs";
import { taskToSchema, parseStrategySections } from "./lib/parse-task.mjs";
import { walkTrace } from "./lib/command-mapping.mjs";
import {
  generatePlaywrightScript,
  playwrightPackageJson,
  playwrightTsconfig,
} from "./lib/codegen-playwright.mjs";
import {
  generateStagehandScript,
  stagehandPackageJson,
  stagehandTsconfig,
} from "./lib/codegen-stagehand.mjs";
import { verifyGenerated } from "./lib/verify.mjs";

const SUPPORTED_TARGETS = new Set(["playwright", "stagehand"]);

// ── CLI args ───────────────────────────────────────────────────────

function getArg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const hasFlag = (n) => process.argv.includes(`--${n}`);

if (hasFlag("help") || hasFlag("h")) {
  console.log(`autobrowse export — generate deterministic replay scripts from autobrowse traces

Usage: node scripts/export.mjs --task <name> [options]

Options:
  --task <name>          Task name — matches tasks/<name>/ (required)
  --target <kind>        playwright (default) | stagehand
  --workspace <dir>      Workspace root holding tasks/ and traces/ (default: ./autobrowse)
  --run <id>             Force a specific run (default: newest passing)
  --output <dir>         Output directory for generated files (default: <workspace>/tasks/<name>/<target>)
  --no-verify            Skip the npm install + tsx run verification step

Env:
  ANTHROPIC_API_KEY      Used for LLM-generated extract block. If unset, a TODO placeholder is emitted.
  BROWSERBASE_*          Pass through to the generated script at runtime.

Exit codes: 0 generated+verified, 2 generated but verify failed (or --no-verify), 1 generator error.`);
  process.exit(0);
}

const TASK = getArg("task");
const TARGET = getArg("target", "playwright");
const WORKSPACE = path.resolve(getArg("workspace", "autobrowse"));
const FORCED_RUN = getArg("run");
const VERIFY = !hasFlag("no-verify");
const OUTPUT = getArg("output");

if (!TASK) {
  console.error("ERROR: --task <name> is required");
  console.error("Run with --help for usage.");
  process.exit(1);
}
if (!SUPPORTED_TARGETS.has(TARGET)) {
  console.error(`ERROR: --target=${TARGET} not supported. Use one of: ${[...SUPPORTED_TARGETS].join(", ")}.`);
  process.exit(1);
}

// ── Locate sources ────────────────────────────────────────────────

const taskDir = path.join(WORKSPACE, "tasks", TASK);
const tracesDir = path.join(WORKSPACE, "traces", TASK);
const outDir = OUTPUT ? path.resolve(OUTPUT) : path.join(taskDir, TARGET);

const taskFile = path.join(taskDir, "task.md");
const strategyFile = path.join(taskDir, "strategy.md");

for (const [label, file] of [["task.md", taskFile], ["strategy.md", strategyFile]]) {
  if (!fs.existsSync(file)) {
    console.error(`ERROR: ${label} not found at ${file} — run autobrowse first.`);
    process.exit(1);
  }
}
if (!fs.existsSync(tracesDir)) {
  console.error(`ERROR: no traces at ${tracesDir} — run autobrowse first.`);
  process.exit(1);
}

const runId = pickRun(tracesDir, FORCED_RUN);
if (!runId) {
  console.error(`ERROR: no passing runs found in ${tracesDir}.`);
  console.error("Graduate the task with autobrowse first, or pass --run <id> to force.");
  console.error("Available runs:", listRuns(tracesDir).join(", ") || "(none)");
  process.exit(1);
}

const runDir = path.join(tracesDir, runId);
const tracePath = path.join(runDir, "trace.json");
if (!fs.existsSync(tracePath)) {
  console.error(`ERROR: trace.json missing at ${tracePath}`);
  process.exit(1);
}

console.error(`[export] task=${TASK} target=${TARGET} run=${runId} workspace=${WORKSPACE}`);

const trace = JSON.parse(fs.readFileSync(tracePath, "utf-8"));
const taskMd = fs.readFileSync(taskFile, "utf-8");
const strategyMd = fs.readFileSync(strategyFile, "utf-8");

// ── Schema + sections ──────────────────────────────────────────────

const { outputShape, zodSchema, schemaFieldCount } = taskToSchema(taskMd);
const sections = parseStrategySections(strategyMd);
const ops = walkTrace(trace, sections);

// Find the agent's final natural-language summary (for LLM extract grounding).
let finalReasoning = "";
for (let i = trace.length - 1; i >= 0; i--) {
  if (trace[i].role === "assistant" && trace[i].reasoning) {
    finalReasoning = trace[i].reasoning;
    break;
  }
}

// ── Generate script ────────────────────────────────────────────────

const generate = TARGET === "stagehand" ? generateStagehandScript : generatePlaywrightScript;
const { scriptCode, cachedActions, stats, extract } = await generate({
  task: TASK,
  runId,
  workspace: WORKSPACE,
  trace,
  ops,
  zodSchema,
  outputShape,
  taskMd,
  finalReasoning,
});

// ── Write outputs ──────────────────────────────────────────────────

fs.mkdirSync(outDir, { recursive: true });
const scriptPath = path.join(outDir, `${TASK}.ts`);
const cachePath = path.join(outDir, "selectors.cache.json");
const pkgPath = path.join(outDir, "package.json");
const tsconfigPath = path.join(outDir, "tsconfig.json");

fs.writeFileSync(scriptPath, scriptCode);
fs.writeFileSync(
  cachePath,
  JSON.stringify(
    {
      task: TASK,
      target: TARGET,
      generated_from: { workspace: WORKSPACE, run: runId },
      stats,
      extract,
      actions: cachedActions,
    },
    null,
    2,
  ),
);
const pkgGen = TARGET === "stagehand" ? stagehandPackageJson : playwrightPackageJson;
const tsconfigGen = TARGET === "stagehand" ? stagehandTsconfig : playwrightTsconfig;
if (!fs.existsSync(pkgPath)) {
  fs.writeFileSync(pkgPath, JSON.stringify(pkgGen(TASK), null, 2));
}
if (!fs.existsSync(tsconfigPath)) {
  fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfigGen(), null, 2));
}

console.error(`[export] wrote ${path.relative(process.cwd(), scriptPath)}`);
if (TARGET === "stagehand") {
  console.error(`[export] ops: ${ops.length} | deterministic: ${stats.deterministic} | act: ${stats.act} | ref_resolved: ${stats.ref_resolved} | ref_failed: ${stats.ref_failed} | dropped: ${stats.dropped}`);
} else {
  console.error(`[export] ops: ${ops.length} | cached: ${stats.cached} | ref_resolved: ${stats.ref_resolved} | ref_failed: ${stats.ref_failed} | dropped: ${stats.dropped}`);
}
console.error(`[export] schema fields: ${schemaFieldCount} | extract: ${extract.generated ? "LLM-generated" : `fallback (${extract.reason})`}`);

// ── Verify ─────────────────────────────────────────────────────────

const baseReport = {
  task: TASK,
  target: TARGET,
  run: runId,
  script: scriptPath,
  cache: cachePath,
  stats,
  schema_fields: schemaFieldCount,
  extract: { generated: extract.generated, reason: extract.reason },
};

if (!VERIFY) {
  console.log(JSON.stringify({ ...baseReport, verified: false }, null, 2));
  process.exit(0);
}

const v = verifyGenerated(outDir, `${TASK}.ts`);
const report = { ...baseReport, verified: true, passed: v.passed, exit_code: v.exit_code, run_log: v.run_log, output: v.output };
console.log(JSON.stringify(report, null, 2));
process.exit(v.passed ? 0 : 2);
