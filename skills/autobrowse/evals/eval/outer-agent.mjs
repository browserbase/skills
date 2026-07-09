import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { PROMPTS_DIR } from "./config.mjs";
import { costUsd } from "./lib/pricing.mjs";

// Scripted stand-in for the interactive Claude Code outer loop. One
// structured-output call per iteration: evidence in → {diagnosis, hypothesis,
// new_strategy} out. This is what makes the outer model and outer prompt
// sweepable eval variables, and what lets us meter outer-agent tokens (the
// interactive loop never records them).
//
// Fidelity note: the real outer loop can drill into trace.json and
// screenshots tool-by-tool. We approximate with a curated evidence pack
// (summary, verifier verdict, error lines). A Claude-Agent-SDK-driven outer
// agent with Read/Grep tools is the natural follow-up architecture variant.

const STRATEGY_SCHEMA = {
  type: "object",
  properties: {
    diagnosis: {
      type: "string",
      description: "What went wrong (or what is fragile), citing specific turns/errors from the evidence.",
    },
    hypothesis: {
      type: "string",
      description: "The ONE change being tested this iteration and why it should fix the diagnosis.",
    },
    new_strategy: {
      type: "string",
      description: "The complete new strategy.md file content.",
    },
  },
  required: ["diagnosis", "hypothesis", "new_strategy"],
  additionalProperties: false,
};

const clip = (s, n) => (s && s.length > n ? s.slice(0, n) + `\n...[clipped ${s.length - n} chars]` : s || "");

function collectErrorLines(traceDir, max = 15) {
  try {
    const trace = JSON.parse(fs.readFileSync(path.join(traceDir, "trace.json"), "utf-8"));
    return trace
      .filter((e) => e.role === "tool_result" && e.error)
      .map((e) => `turn ${e.turn}: ${e.command} → ${String(e.output).slice(0, 200)}`)
      .slice(-max);
  } catch {
    return [];
  }
}

let client = null;

export async function improveStrategy({ model, promptName, taskMd, strategyMd, runResult, verifierResult, mock, iter }) {
  if (mock) return improveStrategyMock({ strategyMd, iter });

  client ??= new Anthropic();
  const systemPrompt = fs.readFileSync(path.join(PROMPTS_DIR, `${promptName}.md`), "utf-8");

  const traceDir = runResult.trace_dir;
  let summary = "";
  try {
    summary = fs.readFileSync(path.join(traceDir, "summary.md"), "utf-8");
  } catch { /* missing summary is survivable */ }
  const errors = collectErrorLines(traceDir);

  const userMessage = [
    "# Task definition (task.md)\n", clip(taskMd, 4_000),
    "\n\n# Current strategy.md\n", clip(strategyMd, 8_000),
    "\n\n# Run evidence\n",
    `Status: ${runResult.status} (${runResult.stop_reason}) | Turns: ${runResult.turns} | Duration: ${runResult.duration_sec}s\n`,
    "\n## Verifier verdict (ground truth)\n```json\n", JSON.stringify(verifierResult, null, 2), "\n```\n",
    errors.length ? `\n## Failed commands\n${errors.join("\n")}\n` : "",
    "\n## Run summary (decision log + final output)\n", clip(summary, 14_000),
  ].join("");

  const response = await client.messages.create({
    model,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
    output_config: { format: { type: "json_schema", schema: STRATEGY_SCHEMA } },
  });

  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`outer agent returned unparseable output: ${err.message}: ${text.slice(0, 200)}`);
  }

  const tokensIn = response.usage.input_tokens;
  const tokensOut = response.usage.output_tokens;
  return {
    diagnosis: parsed.diagnosis,
    hypothesis: parsed.hypothesis,
    newStrategy: parsed.new_strategy,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cost_usd: costUsd(model, tokensIn, tokensOut),
  };
}

// Mock: 1st improvement adds a useless note (run still fails), 2nd adds the
// MOCK-FIX marker that flips the mock inner agent to passing.
function improveStrategyMock({ strategyMd, iter }) {
  const hasNote = strategyMd.includes("mock-note");
  const addition = hasNote
    ? "\n## MOCK-FIX\nApply the fix that makes mock runs pass.\n"
    : "\n## mock-note\nFirst hypothesis: wait longer. (mock — does not help)\n";
  return {
    diagnosis: "mock diagnosis",
    hypothesis: hasNote ? "add MOCK-FIX marker" : "add wait (will not help)",
    newStrategy: strategyMd + addition,
    tokens_in: 12_000,
    tokens_out: 1_500,
    cost_usd: costUsd("claude-opus-4-8", 12_000, 1_500),
  };
}
