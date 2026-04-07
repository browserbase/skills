/**
 * evaluate.ts — Inner agent harness.
 *
 * Runs a browsing agent using the raw Anthropic API with a single `execute`
 * tool. The agent calls browse CLI commands to navigate websites. Full trace
 * is captured incrementally and written to disk.
 *
 * Usage: tsx evaluate.ts --task <task-name> [--run-number N] [--model <model>]
 *
 * Example: tsx evaluate.ts --task google-flights
 *          tsx evaluate.ts --task amazon-checkout --model claude-sonnet-4-6
 */

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

// ── Config ─────────────────────────────────────────────────────────

const DEFAULT_MODEL = "claude-sonnet-4-6";
const MAX_TURNS = 30;
const MAX_TOKENS = 4096;
const EXEC_TIMEOUT_MS = 30_000;

// ── Types ──────────────────────────────────────────────────────────

interface TraceEntry {
  turn: number;
  timestamp: string;
  role: "assistant" | "tool_result";
  reasoning?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  command?: string;
  output?: string;
  error?: boolean;
  duration_ms?: number;
  input_tokens?: number;
  output_tokens?: number;
}

// ── Tool definition ────────────────────────────────────────────────

const TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "execute",
    description:
      "Execute a shell command. Use this to run browse CLI commands for browser automation.\n\n" +
      "Browse commands:\n" +
      "  browse env local|remote    — Switch browser environment\n" +
      "  browse open <url>          — Navigate to URL\n" +
      "  browse snapshot            — Get accessibility tree with @ref IDs (primary perception)\n" +
      "  browse screenshot <path>   — Save screenshot to file\n" +
      "  browse click <ref>         — Click element by @ref from snapshot\n" +
      "  browse type <text>         — Type into focused element\n" +
      "  browse fill <sel> <value>  — Fill input (clears first — preferred over type)\n" +
      "  browse press <key>         — Keyboard: Enter, Tab, Escape, ArrowRight, ArrowLeft...\n" +
      "  browse scroll down/up      — Scroll page\n" +
      "  browse select <sel> <val>  — Select dropdown option\n" +
      "  browse wait <condition>    — Wait: load, selector, text, or ms\n" +
      "  browse get url/title/text  — Get page info\n" +
      "  browse drag <x1> <y1> <x2> <y2> — Drag (for sliders)\n" +
      "  browse back/reload/stop    — Navigation/session control\n\n" +
      "Critical: Always `browse snapshot` after every action — refs invalidate on DOM changes.",
    input_schema: {
      type: "object" as const,
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute",
        },
      },
      required: ["command"],
    },
  },
];

// ── CLI args ───────────────────────────────────────────────────────

function getArg(name: string, fallback?: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function getTaskName(): string {
  const task = getArg("task");
  if (!task) {
    console.error("ERROR: --task <name> is required");
    console.error("Usage: tsx evaluate.ts --task google-flights");
    console.error("\nAvailable tasks:");
    const tasksDir = path.resolve("tasks");
    if (fs.existsSync(tasksDir)) {
      const dirs = fs.readdirSync(tasksDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => `  - ${d.name}`);
      console.error(dirs.length > 0 ? dirs.join("\n") : "  (none — create tasks/<name>/task.md)");
    } else {
      console.error("  (no tasks/ directory found)");
    }
    process.exit(1);
  }
  return task;
}

// ── Helpers ─────────────────────────────────────────────────────────

function getNextRunNumber(tracesDir: string): number {
  const n = getArg("run-number");
  if (n) { const num = parseInt(n, 10); if (!isNaN(num)) return num; }
  if (!fs.existsSync(tracesDir)) return 1;
  const dirs = fs.readdirSync(tracesDir).filter((d) => d.startsWith("run-"));
  if (dirs.length === 0) return 1;
  const nums = dirs.map((d) => parseInt(d.replace("run-", ""), 10)).filter((n) => !isNaN(n));
  if (nums.length === 0) return 1;
  return Math.max(...nums) + 1;
}

const ALLOWED_COMMANDS = ["browse "];

function executeCommand(command: string): { output: string; error: boolean; duration_ms: number } {
  // Security: only allow browse CLI commands to prevent prompt injection
  if (!ALLOWED_COMMANDS.some((prefix) => command.trimStart().startsWith(prefix))) {
    return { output: `BLOCKED: only browse commands are allowed. Got: ${command.slice(0, 50)}`, error: true, duration_ms: 0 };
  }
  const start = Date.now();
  try {
    const output = execSync(command, {
      encoding: "utf-8",
      timeout: EXEC_TIMEOUT_MS,
      stdio: ["pipe", "pipe", "pipe"],
      maxBuffer: 1024 * 1024,
    });
    return { output: output.trim(), error: false, duration_ms: Date.now() - start };
  } catch (err: unknown) {
    const e = err as { stderr?: string; stdout?: string; message?: string };
    const output = e.stderr || e.stdout || e.message || String(err);
    return { output: output.trim(), error: true, duration_ms: Date.now() - start };
  }
}

function buildSystemPrompt(strategy: string, traceDir: string, browseEnv: string): string {
  const envDesc = browseEnv === "remote"
    ? `Use **remote mode** (Browserbase) — anti-bot stealth, CAPTCHA solving, residential proxies:
\`\`\`
browse stop
browse env remote
\`\`\`
Always run \`browse stop\` first to kill any existing local session before switching to remote.`
    : `Use **local mode** — runs on local Chrome:
\`\`\`
browse env local
\`\`\``;

  return `You are a browser automation agent. You navigate websites using the browse CLI via the execute tool.

# Browser Automation via Browse CLI

All browser interaction happens through the \`browse\` command, run via the execute tool.

## Environment

${envDesc}

## Commands

### Navigation
- \`browse open <url>\` — Go to URL
- \`browse reload\` — Reload page
- \`browse back\` / \`browse forward\` — History navigation

### Page State (prefer snapshot over screenshot)
- \`browse snapshot\` — Get accessibility tree with @ref element identifiers (FAST, structured — PRIMARY perception tool)
- \`browse screenshot ${traceDir}/screenshots/step-NN.png\` — Save visual screenshot (for debugging only)
- \`browse get url\` / \`browse get title\` — Page info
- \`browse get text <selector>\` — Get text content ("body" for all)
- \`browse get value <selector>\` — Get form field value

### Interaction
- \`browse click <ref>\` — Click element by @ref from snapshot (e.g., @0-5)
- \`browse type <text>\` — Type text into focused element
- \`browse fill <selector> <value>\` — Fill input AND press Enter (clears existing text — PREFERRED over type)
- \`browse select <selector> <values...>\` — Select dropdown option(s)
- \`browse press <key>\` — Press key: Enter, Tab, Escape, ArrowRight, ArrowLeft, ArrowUp, ArrowDown, Cmd+A
- \`browse drag <fromX> <fromY> <toX> <toY>\` — Drag (useful for sliders)
- \`browse scroll <x> <y> <deltaX> <deltaY>\` — Scroll at coordinates
- \`browse wait <type> [arg]\` — Wait for: load, selector, text, or timeout in ms

### Session
- \`browse stop\` — Close browser
- \`browse status\` — Check daemon status
- \`browse pages\` — List open tabs
- \`browse tab_switch <index>\` — Switch tabs

## Workflow Pattern
1. \`browse env ${browseEnv}\` — set browser environment
2. \`browse open <url>\` — navigate to page
3. \`browse snapshot\` — read accessibility tree, get element refs
4. \`browse click <ref>\` / \`browse fill <sel> <val>\` / \`browse press <key>\` — interact using refs
5. \`browse snapshot\` — confirm action worked (refs invalidate after DOM changes!)
6. Repeat 4-5 until done
7. \`browse stop\` — clean up

## Critical Rules
1. **Always start with \`browse env ${browseEnv}\` then \`browse open <url>\`**
2. **ALWAYS snapshot after every action** — refs like @0-5 invalidate when the DOM changes
3. **Use fill, not type, for input fields** — fill clears existing text first
4. **Use refs from the LATEST snapshot only** — old refs are stale
5. **Save screenshots at key decision points** — \`browse screenshot ${traceDir}/screenshots/step-NN.png\`
6. **When an action fails**, run \`browse snapshot\` to see current state and try a different approach
7. **When done, output your final answer as a JSON code block**

## Troubleshooting
- **Action fails / element not found**: Run \`browse snapshot\` to see available elements
- **Page seems empty**: Try \`browse wait selector "body"\` then \`browse snapshot\`
- **Dropdown didn't open**: Wait briefly, then snapshot to check
- **Slider won't move with click**: Use \`browse press ArrowRight\` / \`browse press ArrowLeft\` after clicking the slider thumb

# Current Navigation Strategy

The following strategy has been learned from previous iterations. Follow these guidelines:

${strategy}

# Important
- Your goal is to complete the task and return the result as a JSON code block.
- Save screenshots to: ${traceDir}/screenshots/
- If you get stuck on an approach, try something different rather than repeating the same failing action.
`;
}

// ── Main agent loop ────────────────────────────────────────────────

async function main() {
  const taskName = getTaskName();
  const model = getArg("model", DEFAULT_MODEL)!;
  const taskDir = path.resolve("tasks", taskName);
  const tracesDir = path.resolve("traces", taskName);

  // Validate task exists
  const taskFile = path.join(taskDir, "task.md");
  const strategyFile = path.join(taskDir, "strategy.md");

  if (!fs.existsSync(taskFile)) {
    console.error(`ERROR: tasks/${taskName}/task.md not found`);
    console.error(`Create it with your task description.`);
    process.exit(1);
  }
  if (!fs.existsSync(strategyFile)) {
    // Create empty strategy.md if it doesn't exist
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(strategyFile, `# ${taskName} Navigation Skill\n\n(This will grow as the agent learns through iterations)\n`);
    console.log(`Created empty strategy.md for task "${taskName}"`);
  }

  const browseEnv = getArg("env", "local")!;
  const client = new Anthropic();
  const runNumber = getNextRunNumber(tracesDir);
  const runId = `run-${String(runNumber).padStart(3, "0")}`;
  const traceDir = path.join(tracesDir, runId);

  fs.mkdirSync(path.join(traceDir, "screenshots"), { recursive: true });

  const strategy = fs.readFileSync(strategyFile, "utf-8");
  const task = fs.readFileSync(taskFile, "utf-8");
  const systemPrompt = buildSystemPrompt(strategy, traceDir, browseEnv);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  AUTOBROWSE — ${taskName} — Run ${runNumber}`);
  console.log(`${"=".repeat(60)}`);
  console.log(`Model: ${model} | Env: ${browseEnv} | Max turns: ${MAX_TURNS} | Trace: ${traceDir}\n`);

  const trace: TraceEntry[] = [];
  const messages: Anthropic.Messages.MessageParam[] = [
    { role: "user", content: task },
  ];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let turn = 0;
  let lastAssistantText = "";
  const startTime = Date.now();

  while (turn < MAX_TURNS) {
    turn++;

    const response = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    });

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    const toolUseBlocks: Anthropic.Messages.ToolUseBlock[] = [];
    let reasoningText = "";

    for (const block of response.content) {
      if (block.type === "text") {
        reasoningText += block.text;
        lastAssistantText = block.text;
      }
      if (block.type === "tool_use") {
        toolUseBlocks.push(block);
      }
    }

    if (reasoningText) {
      const short = reasoningText.slice(0, 200).replace(/\n/g, " ");
      console.log(`  [${turn}] 💭 ${short}${reasoningText.length > 200 ? "..." : ""}`);
      trace.push({
        turn,
        timestamp: new Date().toISOString(),
        role: "assistant",
        reasoning: reasoningText,
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      });
    }

    if (response.stop_reason === "end_turn" || toolUseBlocks.length === 0) {
      console.log(`  [${turn}] ✅ Agent finished (${response.stop_reason})`);
      // Append final response so messages.json has the complete conversation
      messages.push({ role: "assistant", content: response.content });
      break;
    }

    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      const input = toolUse.input as { command: string };
      const command = input.command;
      const isSnapshot = command.includes("browse snapshot");
      const isScreenshot = command.includes("browse screenshot");

      console.log(`  [${turn}] 🔧 ${command.slice(0, 120)}`);

      const { output, error, duration_ms } = executeCommand(command);

      if (isSnapshot) {
        const refCount = (output.match(/@/g) || []).length;
        console.log(`  [${turn}] 📸 snapshot: ${refCount} refs (${duration_ms}ms)`);
      } else if (isScreenshot) {
        console.log(`  [${turn}] 📷 screenshot saved (${duration_ms}ms)`);
      } else if (error) {
        console.log(`  [${turn}] ❌ error: ${output.slice(0, 100)}`);
      } else {
        console.log(`  [${turn}] ✓ ${output.slice(0, 100)} (${duration_ms}ms)`);
      }

      trace.push({
        turn,
        timestamp: new Date().toISOString(),
        role: "assistant",
        tool_name: "execute",
        tool_input: { command },
      });
      trace.push({
        turn,
        timestamp: new Date().toISOString(),
        role: "tool_result",
        command,
        output,
        error,
        duration_ms,
      });

      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: output.slice(0, 50_000),
        is_error: error,
      });
    }

    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });

    // Write trace incrementally
    fs.writeFileSync(path.join(traceDir, "trace.json"), JSON.stringify(trace, null, 2));
  }

  // ── Write final artifacts ──────────────────────────────────────
  const durationSec = (Date.now() - startTime) / 1000;
  // Pricing per million tokens (input/output)
  const pricing: Record<string, [number, number]> = {
    "claude-opus-4-6": [15, 75],
    "claude-sonnet-4-6": [3, 15],
    "claude-haiku-4-5-20251001": [0.80, 4],
  };
  const [inputRate, outputRate] = pricing[model] ?? [3, 15];
  const costUsd = (totalInputTokens * inputRate + totalOutputTokens * outputRate) / 1_000_000;

  const summaryLines: string[] = [
    `# ${taskName} — Run ${runId} Summary`,
    "",
    `**Duration:** ${durationSec.toFixed(1)}s | **Turns:** ${turn} | **Cost:** ~$${costUsd.toFixed(2)}`,
    `**Tokens:** ${totalInputTokens.toLocaleString()} in / ${totalOutputTokens.toLocaleString()} out`,
    "",
    "## Decision Log",
    "",
  ];

  for (const entry of trace) {
    if (entry.role === "assistant" && entry.reasoning) {
      const short = entry.reasoning.slice(0, 150).replace(/\n/g, " ");
      summaryLines.push(`Turn ${entry.turn}: [reasoning] "${short}${entry.reasoning.length > 150 ? "..." : ""}"`);
    }
    if (entry.role === "assistant" && entry.tool_name) {
      summaryLines.push(`Turn ${entry.turn}: [execute] \`${(entry.tool_input as any)?.command}\``);
    }
    if (entry.role === "tool_result") {
      const isSnapshot = entry.command?.includes("snapshot");
      const isError = entry.error;
      if (isSnapshot) {
        const refs = (entry.output?.match(/@/g) || []).length;
        summaryLines.push(`Turn ${entry.turn}: [snapshot] ${refs} refs (${entry.duration_ms}ms)`);
      } else if (isError) {
        summaryLines.push(`Turn ${entry.turn}: [error] ${entry.output?.slice(0, 100)}`);
      } else {
        summaryLines.push(`Turn ${entry.turn}: [result] ${entry.output?.slice(0, 100)} (${entry.duration_ms}ms)`);
      }
    }
  }

  if (lastAssistantText) {
    summaryLines.push("", "## Agent Final Output", "", lastAssistantText);
  }

  const summary = summaryLines.join("\n");

  fs.writeFileSync(path.join(traceDir, "summary.md"), summary);
  fs.writeFileSync(path.join(traceDir, "trace.json"), JSON.stringify(trace, null, 2));
  fs.writeFileSync(path.join(traceDir, "messages.json"), JSON.stringify(messages, null, 2));

  // Update latest symlink
  const latestLink = path.join(tracesDir, "latest");
  try { if (fs.existsSync(latestLink)) fs.unlinkSync(latestLink); fs.symlinkSync(runId, latestLink); } catch {}

  console.log(`\n${summary}`);
  console.log(`\n${"=".repeat(60)}`);
  console.log(`task: ${taskName}`);
  console.log(`duration_sec: ${durationSec.toFixed(1)}`);
  console.log(`cost_usd: ${costUsd.toFixed(2)}`);
  console.log(`turns: ${turn}`);
  console.log(`tokens_in: ${totalInputTokens}`);
  console.log(`tokens_out: ${totalOutputTokens}`);
  console.log(`trace: ${traceDir}/summary.md`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
