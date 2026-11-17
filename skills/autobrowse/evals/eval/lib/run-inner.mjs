import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { resolveAutobrowseDir, TASKS_DIR } from "../config.mjs";

// Run isolation: kill any existing browse daemon so a stale session (e.g. a
// leftover REMOTE Browserbase session that can't reach localhost fixtures)
// doesn't poison the run. Active sessions don't switch local/remote on their
// own — the pilot run failed exactly this way.
function browseStop() {
  try {
    spawnSync("browse", ["stop"], { encoding: "utf-8", timeout: 30_000 });
  } catch {
    /* no daemon running is fine */
  }
}

function createCloudSession() {
  const created = spawnSync(
    "browse",
    ["cloud", "sessions", "create", "--keep-alive", "--verified", "--proxies"],
    { encoding: "utf-8", timeout: 120_000 }
  );
  const id = JSON.parse(created.stdout).id;
  const got = spawnSync("browse", ["cloud", "sessions", "get", id], { encoding: "utf-8", timeout: 60_000 });
  return { id, connectUrl: JSON.parse(got.stdout).connectUrl };
}

function releaseCloudSession(id) {
  try {
    spawnSync("browse", ["cloud", "sessions", "update", id, "--status", "REQUEST_RELEASE"], {
      encoding: "utf-8",
      timeout: 60_000,
    });
  } catch {
    /* keep-alive sessions also expire server-side eventually */
  }
}

// Mode-default shim: on this machine `browse open` without a flag defaults to
// REMOTE (Browserbase creds present), so an inner agent that drops --local
// silently gets a cloud browser that can't reach localhost fixtures. The shim
// appends the task's required mode flag to `browse open` ONLY when the agent
// passed neither --local nor --remote — explicit agent choices still win.
// Same spirit as evaluate.mjs's own --cdp/--session arg rewriting.
function makeBrowseShim(workspace, env) {
  const realBrowse = spawnSync("which", ["browse"], { encoding: "utf-8" }).stdout.trim();
  if (!realBrowse) return null;
  const binDir = path.join(workspace, ".bin");
  fs.mkdirSync(binDir, { recursive: true });
  const flag = env === "remote" ? "--remote" : "--local";
  const shim = `#!/bin/sh
REAL="${realBrowse}"
if [ "$1" = "open" ]; then
  for a in "$@"; do
    if [ "$a" = "--local" ] || [ "$a" = "--remote" ]; then exec "$REAL" "$@"; fi
  done
  exec "$REAL" "$@" ${flag}
fi
exec "$REAL" "$@"
`;
  const shimPath = path.join(binDir, "browse");
  fs.writeFileSync(shimPath, shim, { mode: 0o755 });
  return binDir;
}

// Run one inner-agent attempt (evaluate.mjs) and return its structured
// result: {status, stop_reason, duration_sec, turns, tokens_in, tokens_out,
// trace_dir, ...}. stderr (the live decision log) is teed to a log file.
export function runInner({ task, workspace, env, model, maxTurns, timeoutMin, mock, iter, logFile }) {
  if (mock) return runInnerMock({ task, workspace, iter });

  const autobrowseDir = resolveAutobrowseDir();
  let cloud = null;
  let shimDir = null;

  if (env === "remote") {
    // Remote isolation + bot-protection: pre-create a verified+proxied
    // Browserbase session and hand its connectUrl to evaluate.mjs, which
    // rewrites every inner browse call to attach via --cdp with a
    // connectUrl-hashed daemon session name. Concurrent runs never collide,
    // and plain `browse open --remote` (which can't request --verified /
    // --proxies and gets Akamai-walled on e.g. OpenTable) is bypassed.
    try {
      cloud = createCloudSession();
    } catch (err) {
      return {
        status: "harness_error",
        stop_reason: `cloud session create failed: ${err.message}`,
        duration_sec: null, turns: null, tokens_in: 0, tokens_out: 0, trace_dir: null,
      };
    }
  } else {
    browseStop();
    shimDir = makeBrowseShim(workspace, env);
    // Pre-warm the local daemon: Chrome cold-start can exceed evaluate.mjs's
    // 30s exec timeout, which kills the agent's first `browse open`
    // mid-handshake and strands the session (~20 wasted turns recovering).
    spawnSync("browse", ["open", "about:blank", "--local", "--timeout", "90000"], {
      encoding: "utf-8",
      timeout: 120_000,
    });
  }

  const args = [
    path.join(autobrowseDir, "scripts", "evaluate.mjs"),
    "--task", task,
    "--workspace", workspace,
    "--env", env,
    "--model", model,
    ...(cloud ? ["--connect-url", cloud.connectUrl] : []),
  ];
  let res;
  try {
    res = spawnSync("node", args, {
      encoding: "utf-8",
      timeout: (timeoutMin ?? 20) * 60 * 1000,
      maxBuffer: 32 * 1024 * 1024,
      env: {
        ...process.env,
        MAX_TURNS: String(maxTurns ?? 30),
        ...(shimDir ? { PATH: `${shimDir}:${process.env.PATH}` } : {}),
      },
    });
  } finally {
    if (cloud) releaseCloudSession(cloud.id);
  }

  if (logFile) {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.writeFileSync(logFile, (res.stderr || "") + "\n--- stdout ---\n" + (res.stdout || ""));
  }

  // evaluate.mjs prints exactly one JSON line on stdout (diagnostics → stderr).
  const lines = (res.stdout || "").trim().split("\n").filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(lines[i]);
      if (parsed && parsed.trace_dir) return parsed;
    } catch {
      /* keep scanning */
    }
  }
  return {
    status: "harness_error",
    stop_reason: res.error ? String(res.error) : `exit=${res.status}`,
    duration_sec: null, turns: null, tokens_in: 0, tokens_out: 0, trace_dir: null,
  };
}

// ── Mock mode ───────────────────────────────────────────────────────
// Fabricates a plausible run without browse/Anthropic. Behavior: the run
// passes iff strategy.md contains the marker "MOCK-FIX" (which the mock
// outer agent adds on its second improvement). Failing runs CLAIM success
// with garbage output, deliberately exercising the false-success metric.
function runInnerMock({ task, workspace, iter }) {
  const tracesDir = path.join(workspace, "traces", task);
  fs.mkdirSync(tracesDir, { recursive: true });
  const runNumber = fs.readdirSync(tracesDir).filter((d) => d.startsWith("run-")).length + 1;
  const runId = `run-${String(runNumber).padStart(3, "0")}`;
  const traceDir = path.join(tracesDir, runId);
  fs.mkdirSync(traceDir, { recursive: true });

  const strategyFile = path.join(workspace, "tasks", task, "strategy.md");
  fs.mkdirSync(path.dirname(strategyFile), { recursive: true });
  if (!fs.existsSync(strategyFile)) fs.writeFileSync(strategyFile, `# ${task} Navigation Skill\n`);
  const strategy = fs.readFileSync(strategyFile, "utf-8");
  const passes = strategy.includes("MOCK-FIX");

  let output;
  if (passes) {
    const mockOutputPath = path.join(TASKS_DIR, task, "mock-output.json");
    output = JSON.parse(fs.readFileSync(mockOutputPath, "utf-8"));
  } else {
    output = { success: true, note: "fabricated-by-mock-failure", value: 42 };
  }

  const turns = passes ? 9 : 24;
  const trace = [];
  for (let t = 1; t <= Math.min(turns, 6); t++) {
    trace.push({ turn: t, role: "assistant", tool_name: "execute", tool_input: { command: "browse snapshot" } });
    trace.push({ turn: t, role: "tool_result", command: "browse snapshot", output: "[0-1] mock", error: !passes && t === 4, duration_ms: 800 + t * 120 });
  }
  fs.writeFileSync(path.join(traceDir, "trace.json"), JSON.stringify(trace, null, 2));
  fs.writeFileSync(path.join(traceDir, "result.json"), JSON.stringify({ parsed: output, raw: JSON.stringify(output), parse_error: null }, null, 2));
  fs.writeFileSync(
    path.join(traceDir, "summary.md"),
    `# ${task} — ${runId} (MOCK)\n\n**Status:** ${passes ? "completed" : "max_turns"}\n\n## Agent Final Output\n\n\`\`\`json\n${JSON.stringify(output, null, 2)}\n\`\`\`\n`
  );

  const tokensIn = passes ? 40_000 : 140_000;
  const tokensOut = passes ? 2_000 : 7_000;
  return {
    task, run: runId,
    status: passes ? "completed" : "max_turns",
    stop_reason: passes ? "end_turn" : "max_turns",
    duration_sec: passes ? 45.0 : 210.0,
    turns,
    tokens_in: tokensIn, tokens_out: tokensOut,
    trace_dir: traceDir,
    mock: true,
  };
}
