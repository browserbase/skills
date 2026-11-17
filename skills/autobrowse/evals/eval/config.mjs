import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, "..");
export const EVAL_DIR = path.join(ROOT, "eval");
export const TASKS_DIR = path.join(EVAL_DIR, "tasks");
export const CONDITIONS_DIR = path.join(EVAL_DIR, "conditions");
export const PROMPTS_DIR = path.join(EVAL_DIR, "prompts");
export const FIXTURES_DIR = path.join(ROOT, "fixtures");
export const RUNS_DIR = path.join(ROOT, "runs");
export const RESULTS_FILE = path.join(RUNS_DIR, "results.jsonl");

const AUTOBROWSE_CANDIDATES = [
  process.env.AUTOBROWSE_DIR,
  path.resolve(ROOT, ".."), // evals/ ships inside the autobrowse skill
  path.join(ROOT, "vendor", "skills", "skills", "autobrowse"),
].filter(Boolean);

export function resolveAutobrowseDir() {
  for (const dir of AUTOBROWSE_CANDIDATES) {
    if (fs.existsSync(path.join(dir, "scripts", "evaluate.mjs"))) return dir;
  }
  throw new Error(
    "autobrowse skill not found. Set AUTOBROWSE_DIR to the directory containing scripts/evaluate.mjs " +
    "(e.g. a checkout of github.com/browserbase/skills at skills/autobrowse)."
  );
}

export function loadCondition(idOrPath) {
  const p = idOrPath.endsWith(".json")
    ? path.resolve(idOrPath)
    : path.join(CONDITIONS_DIR, `${idOrPath}.json`);
  const cond = JSON.parse(fs.readFileSync(p, "utf-8"));
  // Defaults
  return {
    max_iters: 5,
    holdout_runs: 3,
    converge_window: 3,
    converge_passes: 2,
    outer_prompt: "outer-default",
    browser_trace: false,
    ...cond,
  };
}

export function loadTaskMeta(task) {
  const p = path.join(TASKS_DIR, task, "meta.json");
  const meta = JSON.parse(fs.readFileSync(p, "utf-8"));
  return { env: "local", max_turns: 30, timeout_min: 20, ...meta, task };
}

export function listTasks() {
  return fs
    .readdirSync(TASKS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
    .map((d) => d.name)
    .sort();
}
