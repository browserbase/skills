#!/usr/bin/env node

/**
 * export.mjs — Translate a graduated autobrowse task into a Stagehand script.
 *
 * Reads the most recent passing run's trace.json and pairs the successful
 * `browse` commands with intent prose from strategy.md, then emits a
 * deterministic TypeScript Stagehand script with cached Action descriptors
 * for every stable XPath/CSS selector that worked.
 *
 * Usage: node scripts/export.mjs --task <name> [--workspace ./autobrowse] [--run run-NNN] [--no-verify]
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

// ── CLI args ───────────────────────────────────────────────────────

function getArg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}
const hasFlag = (name) => process.argv.includes(`--${name}`);

const TASK = getArg("task");
const WORKSPACE = path.resolve(getArg("workspace", "autobrowse"));
const FORCED_RUN = getArg("run");
const VERIFY = !hasFlag("no-verify");

if (!TASK) {
  console.error("ERROR: --task <name> is required");
  console.error("Usage: node scripts/export.mjs --task <name> [--workspace ./autobrowse] [--run run-NNN] [--no-verify]");
  process.exit(1);
}

// ── Locate sources ────────────────────────────────────────────────

const taskDir = path.join(WORKSPACE, "tasks", TASK);
const tracesDir = path.join(WORKSPACE, "traces", TASK);
const outDir = path.join(taskDir, "stagehand");

const taskFile = path.join(taskDir, "task.md");
const strategyFile = path.join(taskDir, "strategy.md");

if (!fs.existsSync(taskFile)) {
  console.error(`ERROR: task.md not found at ${taskFile}`);
  process.exit(1);
}
if (!fs.existsSync(strategyFile)) {
  console.error(`ERROR: strategy.md not found at ${strategyFile} — run /autobrowse first`);
  process.exit(1);
}
if (!fs.existsSync(tracesDir)) {
  console.error(`ERROR: no traces at ${tracesDir} — run /autobrowse first`);
  process.exit(1);
}

// Find the run to export from. If --run was passed, use it. Otherwise walk
// runs newest-first and pick the most recent one whose summary shows
// `**Status:** completed` AND whose final JSON has `success: true`.
function listRuns() {
  return fs.readdirSync(tracesDir)
    .filter((d) => d.startsWith("run-"))
    .sort()
    .reverse();
}

function readSummary(runId) {
  const f = path.join(tracesDir, runId, "summary.md");
  return fs.existsSync(f) ? fs.readFileSync(f, "utf-8") : null;
}

function extractFinalJson(summary) {
  if (!summary) return null;
  const after = summary.split("## Agent Final Output")[1];
  if (!after) return null;
  const fence = after.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (!fence) return null;
  try { return JSON.parse(fence[1]); } catch { return null; }
}

function isPassing(runId) {
  const summary = readSummary(runId);
  if (!summary) return false;
  // Newer evaluate.mjs writes a "**Status:** completed" line; older versions
  // don't. We only require the final JSON to have success: true.
  const json = extractFinalJson(summary);
  return json && json.success === true;
}

let runId = FORCED_RUN;
if (!runId) {
  const candidate = listRuns().find(isPassing);
  if (!candidate) {
    console.error(`ERROR: no passing runs found in ${tracesDir}.`);
    console.error("Graduate the task with /autobrowse first, or pass --run <runId> to force.");
    process.exit(1);
  }
  runId = candidate;
}
const runDir = path.join(tracesDir, runId);
const tracePath = path.join(runDir, "trace.json");
const summaryPath = path.join(runDir, "summary.md");
if (!fs.existsSync(tracePath)) {
  console.error(`ERROR: ${tracePath} not found`);
  process.exit(1);
}

console.error(`[stagehand-export] task=${TASK} run=${runId} workspace=${WORKSPACE}`);

const trace = JSON.parse(fs.readFileSync(tracePath, "utf-8"));
const taskMd = fs.readFileSync(taskFile, "utf-8");
const strategyMd = fs.readFileSync(strategyFile, "utf-8");
const summaryMd = fs.readFileSync(summaryPath, "utf-8");

// ── Parse task.md → Zod schema ────────────────────────────────────

function extractOutputJson(md) {
  const after = md.split(/^##\s+Output\s*$/m)[1];
  if (!after) return null;
  const fence = after.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (!fence) return null;
  let raw = fence[1];
  // task.md templates use placeholders like <integer>, <string>, <ISO8601>,
  // <YYYY-MM-DD|null>, etc. These aren't valid JSON. Normalize them to
  // JSON sentinels so we can still infer field shapes. Heuristics:
  //   <integer>, <number>, <int>, <count> → 0
  //   <bool>, <boolean>                   → false
  //   <null>                              → null
  //   anything-else <...>                 → "" (string)
  raw = raw.replace(/"<[^>]*>"/g, "\"\"");
  raw = raw.replace(/<integer>|<number>|<int>|<count>/gi, "0");
  raw = raw.replace(/<bool>|<boolean>/gi, "false");
  raw = raw.replace(/<null>/gi, "null");
  raw = raw.replace(/<[^>]+>/g, "\"\"");
  // Strip trailing commas before } or ] (common in hand-written templates).
  raw = raw.replace(/,\s*([}\]])/g, "$1");
  try { return JSON.parse(raw); } catch { return null; }
}

function jsonToZod(value, indent = 2) {
  const pad = " ".repeat(indent);
  if (value === null) return "z.unknown().nullable()";
  if (Array.isArray(value)) {
    if (value.length === 0) return "z.array(z.unknown())";
    return `z.array(${jsonToZod(value[0], indent)})`;
  }
  switch (typeof value) {
    case "string": return "z.string()";
    case "number": return Number.isInteger(value) ? "z.number().int()" : "z.number()";
    case "boolean": return "z.boolean()";
    case "object": {
      const entries = Object.entries(value).map(([k, v]) => {
        const keyOut = /^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k);
        return `${pad}${keyOut}: ${jsonToZod(v, indent + 2)},`;
      });
      return `z.object({\n${entries.join("\n")}\n${" ".repeat(indent - 2)}})`;
    }
    default: return "z.unknown()";
  }
}

const outputShape = extractOutputJson(taskMd);
let zodSchema, schemaFieldCount = 0;
if (outputShape && typeof outputShape === "object" && !Array.isArray(outputShape)) {
  zodSchema = jsonToZod(outputShape);
  schemaFieldCount = Object.keys(outputShape).length;
} else {
  zodSchema = "z.object({ result: z.unknown() })";
}

// ── Parse strategy.md section turn ranges ─────────────────────────

// Strategy headers often carry "(turns N–M)" or "(turns N-M)" markers.
// Build [{ start, end, heading, prose }] so we can map a trace turn to
// its narrative section. The prose is the lines between this heading and
// the next.
function parseStrategySections(md) {
  const lines = md.split("\n");
  const sections = [];
  let cur = null;
  for (const line of lines) {
    const h = line.match(/^#{2,4}\s+(.+)$/);
    if (h) {
      if (cur) sections.push(cur);
      const range = h[1].match(/turns?\s+(\d+)\s*[–—\-]\s*(\d+)/i);
      cur = {
        heading: h[1].trim(),
        start: range ? parseInt(range[1], 10) : null,
        end: range ? parseInt(range[2], 10) : null,
        prose: [],
      };
    } else if (cur) {
      cur.prose.push(line);
    }
  }
  if (cur) sections.push(cur);
  return sections;
}
const sections = parseStrategySections(strategyMd);
function sectionForTurn(turn) {
  return sections.find((s) => s.start !== null && turn >= s.start && turn <= s.end);
}

// ── Walk trace, classify commands ──────────────────────────────────

// Split a shell-ish command into argv tokens that respect quotes.
function tokenize(cmd) {
  const out = [];
  let cur = "", q = null, esc = false, started = false;
  for (const ch of cmd.trim()) {
    if (esc) { cur += ch; esc = false; started = true; continue; }
    if (q) {
      if (ch === q) { q = null; }
      else if (q === "\"" && ch === "\\") { esc = true; }
      else cur += ch;
      started = true; continue;
    }
    if (ch === "'" || ch === "\"") { q = ch; started = true; continue; }
    if (ch === "\\") { esc = true; started = true; continue; }
    if (/\s/.test(ch)) {
      if (started) { out.push(cur); cur = ""; started = false; }
      continue;
    }
    cur += ch; started = true;
  }
  if (started) out.push(cur);
  return out;
}

const REF_RE = /^\[?\d+-\d+\]?$/;
const XPATH_RE = /^(\.?\/\/|\/)/;
const CSS_RE = /^[#.\[]|^[a-zA-Z][\w-]*[#.\[:]|^\*/;

function classifySelector(s) {
  if (!s) return "none";
  if (REF_RE.test(s)) return "ref";
  if (XPATH_RE.test(s)) return "xpath";
  if (CSS_RE.test(s) || /^[a-zA-Z][\w-]*$/.test(s)) return "css";
  return "unknown";
}

// Walk trace entries, pairing each tool_use with its preceding reasoning
// (same turn). We only emit for successful tool_results.
const ops = []; // { kind, ...payload, turn, intent }
let lastReasoning = "";
let lastTurn = -1;
const traceByTurn = {};
for (const e of trace) {
  if (!traceByTurn[e.turn]) traceByTurn[e.turn] = [];
  traceByTurn[e.turn].push(e);
}

const turns = Object.keys(traceByTurn).map(Number).sort((a, b) => a - b);
for (const turn of turns) {
  const entries = traceByTurn[turn];
  // First grab the assistant reasoning for this turn (if any).
  const reasoningEntry = entries.find((e) => e.role === "assistant" && e.reasoning);
  const turnReasoning = reasoningEntry?.reasoning?.split("\n")[0]?.trim() ?? "";
  const section = sectionForTurn(turn);
  const intent = (turnReasoning || section?.heading || `turn ${turn}`).slice(0, 160);

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.role !== "assistant" || !e.tool_input) continue;
    const next = entries[i + 1];
    const success = next && next.role === "tool_result" && next.error === false;
    if (!success) continue;

    const tokens = tokenize(e.tool_input.command);
    if (tokens.length < 2 || tokens[0] !== "browse") continue;
    // Skip leading flags like `--connect <sid>` between `browse` and the verb.
    // Flags that take a value (e.g., --connect) consume the next token.
    const flagsWithValue = new Set(["--connect", "--session"]);
    let vi = 1;
    while (vi < tokens.length && tokens[vi].startsWith("--")) {
      const flag = tokens[vi];
      vi += flagsWithValue.has(flag) ? 2 : 1;
    }
    if (vi >= tokens.length) continue;
    const verb = tokens[vi];
    const args = tokens.slice(vi + 1);

    const base = { turn, intent, section: section?.heading ?? null, command: e.tool_input.command };

    switch (verb) {
      case "stop":
      case "status":
      case "pages":
      case "env":
        // session lifecycle — replaced by Stagehand init/close
        ops.push({ kind: "session", verb, args, ...base });
        break;
      case "open":
      case "newpage":
        ops.push({ kind: "goto", url: args[0], ...base });
        break;
      case "wait": {
        const sub = args[0];
        if (sub === "load") ops.push({ kind: "wait_load", ...base });
        else if (sub === "timeout") ops.push({ kind: "wait_timeout", ms: parseInt(args[1] || "1000", 10), ...base });
        else if (sub === "selector") ops.push({ kind: "wait_selector", selector: args[1], ...base });
        break;
      }
      case "snapshot":
      case "screenshot":
      case "get":
        // perception — drop; Stagehand handles perception per call
        ops.push({ kind: "perception", verb, args, ...base });
        break;
      case "click": {
        const target = args[0];
        const klass = classifySelector(target);
        if (klass === "xpath" || klass === "css") {
          ops.push({ kind: "act", method: "click", selector: target, arguments: [], ...base });
        } else if (klass === "ref") {
          ops.push({ kind: "observe_act", method: "click", arguments: [], ...base });
        }
        break;
      }
      case "fill": {
        const selector = args[0];
        // strip flags like --no-press-enter
        const positional = args.slice(1).filter((a) => !a.startsWith("--"));
        const value = positional.join(" ");
        const klass = classifySelector(selector);
        if (klass === "xpath" || klass === "css") {
          ops.push({ kind: "act", method: "fill", selector, arguments: [value], ...base });
        } else {
          ops.push({ kind: "observe_act", method: "fill", arguments: [value], ...base });
        }
        break;
      }
      case "select": {
        const selector = args[0];
        const value = args.slice(1).join(" ");
        ops.push({ kind: "act", method: "selectOptionFromDropdown", selector, arguments: [value], ...base });
        break;
      }
      case "type":
        ops.push({ kind: "type_focused", text: args.join(" "), ...base });
        break;
      case "press":
        ops.push({ kind: "press", key: args[0], ...base });
        break;
      case "scroll":
        ops.push({ kind: "scroll", coords: args.map(Number), ...base });
        break;
      case "back":
      case "forward":
      case "reload":
        ops.push({ kind: "page_nav", verb, ...base });
        break;
      default:
        ops.push({ kind: "unhandled", verb, args, ...base });
    }
  }
}

// ── Detect env (LOCAL vs BROWSERBASE) from session ops ─────────────

const envOp = ops.find((o) => o.kind === "session" && o.verb === "env");
// Detect Browserbase from either the legacy `browse env remote` op or the
// modern pattern (bb sessions create / browse --connect <sid> in the raw trace).
const usesBrowserbase = (envOp && envOp.args[0] === "remote") ||
  trace.some((e) => typeof e.command === "string" &&
    (/^bb\s+sessions\s+create/.test(e.command) || /browse\s+--connect\s+/.test(e.command)));
const STAGEHAND_ENV = usesBrowserbase ? "BROWSERBASE" : "LOCAL";

// First goto URL
const firstGoto = ops.find((o) => o.kind === "goto");

// Auth heuristic — flag if task mentions credentials/cookies/auth so we
// emit a TODO instead of silently dropping auth context.
const NEEDS_AUTH = /\b(login|password|cookie|auth|credential|signed?\s*in)\b/i.test(taskMd);

// ── Emit script ────────────────────────────────────────────────────

let cachedActionCount = 0;
let observeFallbackCount = 0;
const cachedActions = []; // for selectors.cache.json

function esc(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}
function escSingle(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

const body = [];
for (const op of ops) {
  const sec = op.section ? `// [${op.section}]` : "";
  const intent = op.intent?.replace(/[\r\n]+/g, " ") ?? "";
  switch (op.kind) {
    case "session":
    case "perception":
      // dropped from output, but kept as a trace comment for the curious
      body.push(`  // skip: \`${esc(op.command)}\``);
      break;
    case "goto":
      body.push(`  ${sec}`);
      body.push(`  await page.goto('${escSingle(op.url)}');`);
      break;
    case "wait_load":
      body.push(`  await page.waitForLoadState('load');`);
      break;
    case "wait_timeout":
      body.push(`  await page.waitForTimeout(${op.ms});`);
      break;
    case "wait_selector":
      body.push(`  await page.waitForSelector('${escSingle(op.selector)}');`);
      break;
    case "act": {
      cachedActionCount++;
      const action = {
        description: intent,
        selector: op.selector,
        method: op.method,
        arguments: op.arguments,
      };
      cachedActions.push({ ...action, turn: op.turn, section: op.section });
      body.push(`  ${sec}`);
      body.push(`  await stagehand.act(${JSON.stringify(action, null, 2).split("\n").map((l, i) => i === 0 ? l : "  " + l).join("\n")});`);
      break;
    }
    case "observe_act": {
      observeFallbackCount++;
      const desc = intent || `click element (turn ${op.turn})`;
      body.push(`  ${sec}`);
      body.push(`  {`);
      body.push(`    const actions = await stagehand.observe('${escSingle(desc)}');`);
      if (op.method === "fill" && op.arguments?.[0] != null) {
        body.push(`    await stagehand.act({ ...actions[0], method: 'fill', arguments: [${JSON.stringify(op.arguments[0])}] });`);
      } else {
        body.push(`    await stagehand.act(actions[0]);`);
      }
      body.push(`  }`);
      break;
    }
    case "type_focused":
      body.push(`  await page.keyboard.type(${JSON.stringify(op.text)});`);
      break;
    case "press":
      body.push(`  await page.keyboard.press(${JSON.stringify(op.key)});`);
      break;
    case "scroll": {
      const [x, y, dx, dy] = op.coords;
      body.push(`  await page.mouse.move(${x}, ${y});`);
      body.push(`  await page.mouse.wheel(${dx}, ${dy});`);
      break;
    }
    case "page_nav":
      if (op.verb === "back") body.push(`  await page.goBack();`);
      else if (op.verb === "forward") body.push(`  await page.goForward();`);
      else if (op.verb === "reload") body.push(`  await page.reload();`);
      break;
    case "unhandled":
      body.push(`  // TODO: unhandled browse verb '${op.verb}' (turn ${op.turn}): \`${esc(op.command)}\``);
      break;
  }
}

const tsxScript = `// Generated by /stagehand-export from ${runId}.
// Source: ${WORKSPACE}/tasks/${TASK}/{task.md, strategy.md} + traces/${TASK}/${runId}/trace.json
// Hand-edit freely. selectors.cache.json mirrors the cached Action descriptors.
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";
import "dotenv/config";

const OutputSchema = ${zodSchema};
type Output = z.infer<typeof OutputSchema>;

async function main(): Promise<Output> {
  const stagehand = new Stagehand({
    env: "${STAGEHAND_ENV}",
    model: process.env.STAGEHAND_MODEL ?? "openai/gpt-4.1-mini",
    verbose: 1,
    cacheDir: "./.stagehand-cache",
  });
${NEEDS_AUTH ? `\n  // TODO: wire up authed context — task.md references credentials/cookies.\n  // For Browserbase, set browserbaseSessionCreateParams.context above, or sync\n  // cookies via /cookie-sync before running.\n` : ""}
  await stagehand.init();
  const page = stagehand.context.pages()[0];

  try {
${body.map((l) => l.split("\n").map((ln) => (ln.length ? "  " + ln : ln)).join("\n")).join("\n")}

    const result = await stagehand.extract(
      "extract the final task result as JSON matching the provided schema",
      OutputSchema,
    );
    return result;
  } finally {
    await stagehand.close();
  }
}

main()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result?.success === true ? 0 : 2);
  })
  .catch((err) => {
    console.error("FATAL:", err);
    process.exit(1);
  });
`;

// ── Write outputs ──────────────────────────────────────────────────

fs.mkdirSync(outDir, { recursive: true });
const scriptPath = path.join(outDir, `${TASK}.ts`);
const cachePath = path.join(outDir, "selectors.cache.json");
const pkgPath = path.join(outDir, "package.json");
const tsconfigPath = path.join(outDir, "tsconfig.json");

fs.writeFileSync(scriptPath, tsxScript);
fs.writeFileSync(cachePath, JSON.stringify({
  task: TASK,
  generated_from: { workspace: WORKSPACE, run: runId },
  actions: cachedActions,
}, null, 2));

if (!fs.existsSync(pkgPath)) {
  fs.writeFileSync(pkgPath, JSON.stringify({
    name: `${TASK}-stagehand`,
    version: "0.0.1",
    private: true,
    type: "module",
    scripts: { start: `tsx ${TASK}.ts` },
    dependencies: {
      "@browserbasehq/stagehand": "latest",
      // Stagehand's LLMProvider eager-loads these even when only one is used.
      "@ai-sdk/openai": "^1.0.0",
      "@ai-sdk/anthropic": "^1.0.0",
      zod: "^3.23.0",
      dotenv: "^16.4.0",
    },
    devDependencies: { tsx: "^4.7.0", typescript: "^5.4.0" },
  }, null, 2));
}
if (!fs.existsSync(tsconfigPath)) {
  fs.writeFileSync(tsconfigPath, JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "Bundler",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
    },
  }, null, 2));
}

console.error(`[stagehand-export] wrote ${path.relative(process.cwd(), scriptPath)}`);
console.error(`[stagehand-export] cached actions: ${cachedActionCount}`);
console.error(`[stagehand-export] observe() fallbacks: ${observeFallbackCount}`);
console.error(`[stagehand-export] schema fields inferred: ${schemaFieldCount}`);

// ── Verification ───────────────────────────────────────────────────

if (!VERIFY) {
  console.log(JSON.stringify({
    task: TASK,
    run: runId,
    script: scriptPath,
    cache: cachePath,
    cached_actions: cachedActionCount,
    observe_fallbacks: observeFallbackCount,
    schema_fields: schemaFieldCount,
    verified: false,
  }));
  process.exit(0);
}

console.error("[stagehand-export] running npm install (silent)…");
const install = spawnSync("npm", ["install", "--silent"], { cwd: outDir, stdio: ["ignore", "inherit", "inherit"] });
if (install.status !== 0) {
  console.error("[stagehand-export] npm install failed");
  process.exit(install.status ?? 1);
}

console.error(`[stagehand-export] running: npx tsx ${TASK}.ts`);
const runLogPath = path.join(outDir, "run.log");
const run = spawnSync("npx", ["tsx", `${TASK}.ts`], {
  cwd: outDir,
  encoding: "utf-8",
  stdio: ["ignore", "pipe", "pipe"],
});
fs.writeFileSync(runLogPath, `STDOUT:\n${run.stdout ?? ""}\n\nSTDERR:\n${run.stderr ?? ""}\n`);

let parsedOutput = null;
try {
  // The script prints OutputSchema JSON to stdout as the last block.
  const stdout = run.stdout ?? "";
  const lastBrace = stdout.lastIndexOf("{");
  if (lastBrace >= 0) parsedOutput = JSON.parse(stdout.slice(lastBrace));
} catch { /* leave null */ }

const passed = run.status === 0 && parsedOutput?.success === true;
const report = {
  task: TASK,
  run: runId,
  script: scriptPath,
  cache: cachePath,
  cached_actions: cachedActionCount,
  observe_fallbacks: observeFallbackCount,
  schema_fields: schemaFieldCount,
  verified: true,
  passed,
  exit_code: run.status,
  run_log: runLogPath,
  output: parsedOutput,
};

console.error(passed
  ? `[stagehand-export] ✅ verification passed`
  : `[stagehand-export] ❌ verification failed (exit=${run.status}) — see ${runLogPath}`);
console.log(JSON.stringify(report, null, 2));
process.exit(passed ? 0 : 2);
