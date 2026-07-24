#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const API_BASE = process.env.BROWSERBASE_API_BASE ?? "https://api.browserbase.com/v1";
const TERMINAL = new Set(["COMPLETED", "FAILED", "STOPPED", "TIMED_OUT"]);

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const values = { command };
  const boolean = new Set(["proxies", "verified"]);
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    values[key] = boolean.has(key) ? true : rest[++i];
  }
  return values;
}

function requireArg(args, key) {
  if (!args[key]) throw new Error(`--${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} is required`);
  return args[key];
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function writeJson(file, value) {
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function api(apiKey, pathname, init = {}) {
  const response = await fetch(`${API_BASE}${pathname}`, {
    ...init,
    headers: {
      "X-BB-API-Key": apiKey,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${pathname} returned ${response.status}: ${text.slice(0, 1000)}`);
  return body;
}

async function optionalApi(apiKey, pathname) {
  try { return await api(apiKey, pathname); } catch (error) { return { _error: error.message }; }
}

function score(run, taskConfig) {
  const output = run.result?.output ?? run.result ?? {};
  const required = taskConfig.resultSchema?.required ?? [];
  const present = required.filter((key) => output[key] !== null && output[key] !== undefined && output[key] !== "");
  const coverage = required.length ? present.length / required.length : 1;
  const checks = Object.entries(taskConfig.evaluation?.fieldPatterns ?? {}).map(([key, pattern]) => ({
    key,
    passed: new RegExp(pattern, "i").test(String(output[key] ?? "")),
  }));
  const warnings = (taskConfig.evaluation?.factualityWarnings ?? []).filter((pattern) => new RegExp(pattern, "i").test(JSON.stringify(output)));
  const accuracy = checks.length ? checks.filter((item) => item.passed).length / checks.length : 1;
  const total = Math.max(0, Math.round(100 * (0.45 * coverage + 0.4 * accuracy + 0.15 * (run.status === "COMPLETED" ? 1 : 0)) - warnings.length * 10));
  return { total, requiredPresent: present, requiredMissing: required.filter((key) => !present.includes(key)), accuracyChecks: checks, factualityWarnings: warnings, completed: run.status === "COMPLETED" };
}

function summarizeMessages(messages) {
  const roles = {};
  let toolCalls = 0;
  let toolResults = 0;
  let readableReasoningParts = 0;
  for (const entry of messages) {
    const role = entry.message?.role ?? "unknown";
    roles[role] = (roles[role] ?? 0) + 1;
    for (const part of entry.message?.content ?? []) {
      if (part.type === "tool-call") toolCalls += 1;
      if (part.type === "tool-result") toolResults += 1;
      if (part.type === "reasoning" && part.text?.trim()) readableReasoningParts += 1;
    }
  }
  return { count: messages.length, roles, toolCalls, toolResults, readableReasoningParts };
}

function summarizeLogs(logs) {
  if (!Array.isArray(logs)) return { count: 0, methods: {}, retrievalError: logs?._error ?? null };
  const methods = {};
  for (const entry of logs) methods[entry.method] = (methods[entry.method] ?? 0) + 1;
  return { count: logs.length, methods: Object.fromEntries(Object.entries(methods).sort((a, b) => b[1] - a[1])) };
}

async function loadOrCreateAgent(apiKey, workspace, prompt, config, name) {
  const stateFile = path.join(workspace, "state.json");
  let state;
  try { state = await readJson(stateFile); } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (!state?.agentId) {
    const agent = await api(apiKey, "/agents", { method: "POST", body: JSON.stringify({ name, systemPrompt: prompt, resultSchema: config.resultSchema }) });
    await writeJson(stateFile, { agentId: agent.agentId, createdAt: new Date().toISOString() });
    return agent;
  }
  return api(apiKey, `/agents/${state.agentId}`, { method: "PATCH", body: JSON.stringify({ systemPrompt: prompt, resultSchema: config.resultSchema }) });
}

async function poll(apiKey, runId, { pollMs, timeoutMs, maxMessages }) {
  const started = Date.now();
  const messages = [];
  let since;
  let stopRequested = false;
  while (Date.now() - started < timeoutMs) {
    const query = new URLSearchParams({ all: "true" });
    if (since) query.set("since", since);
    const page = await api(apiKey, `/agents/runs/${runId}/messages?${query}`);
    if (page.data?.length) messages.push(...page.data);
    if (page.nextSince) since = page.nextSince;
    const run = await api(apiKey, `/agents/runs/${runId}`);
    process.stderr.write(`\r${run.status.padEnd(10)} messages=${messages.length}`);
    if (TERMINAL.has(run.status)) { process.stderr.write("\n"); return { run, messages }; }
    if (!stopRequested && messages.length >= maxMessages) {
      await api(apiKey, `/agents/runs/${runId}/stop`, { method: "POST" });
      stopRequested = true;
      process.stderr.write(" stop=requested");
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  if (!stopRequested) await api(apiKey, `/agents/runs/${runId}/stop`, { method: "POST" });
  throw new Error(`Run ${runId} exceeded timeout ${timeoutMs}ms; stop requested`);
}

async function initWorkspace(args) {
  const workspace = path.resolve(requireArg(args, "workspace"));
  const name = requireArg(args, "name");
  await fs.mkdir(path.join(workspace, "prompts"), { recursive: true });
  await fs.mkdir(path.join(workspace, "runs"), { recursive: true });
  const taskFile = path.join(workspace, "task.json");
  const promptFile = path.join(workspace, "prompts", "iteration-001.md");
  try { await fs.access(taskFile); } catch {
    await writeJson(taskFile, {
      name,
      task: "TODO: Describe one fixed browser research or workflow task.",
      resultSchema: { type: "object", additionalProperties: false, required: ["outcome", "evidence"], properties: { outcome: { type: "string" }, evidence: { type: "array", items: { type: "string" } } } },
      variables: {},
      browserSettings: { proxies: true, verified: true },
      evaluation: { fieldPatterns: {}, factualityWarnings: [] },
    });
  }
  try { await fs.access(promptFile); } catch {
    await fs.writeFile(promptFile, "You are a careful browser agent. Complete the user's task and return only evidence-backed facts.\n");
  }
  console.log(JSON.stringify({ workspace, name, taskFile, promptFile }, null, 2));
}

async function runIteration(args) {
  const apiKey = process.env.BROWSERBASE_API_KEY;
  if (!apiKey) throw new Error("BROWSERBASE_API_KEY is required");
  const workspace = path.resolve(requireArg(args, "workspace"));
  const config = await readJson(path.join(workspace, "task.json"));
  const promptPath = path.resolve(workspace, requireArg(args, "prompt"));
  const prompt = (await fs.readFile(promptPath, "utf8")).trim();
  const label = args.label ?? path.basename(promptPath, path.extname(promptPath));
  const runDir = path.join(workspace, "runs", label);
  await fs.mkdir(runDir, { recursive: true });
  try { await fs.access(path.join(runDir, "created-run.json")); throw new Error(`Label already has a run: ${label}`); } catch (error) { if (error.code !== "ENOENT") throw error; }
  await fs.writeFile(path.join(runDir, "system-prompt.md"), `${prompt}\n`);
  const agent = await loadOrCreateAgent(apiKey, workspace, prompt, config, args.agentName ?? `Prompt optimization: ${config.name ?? path.basename(workspace)}`);
  const browserSettings = { ...(config.browserSettings ?? {}) };
  if (args.proxies) browserSettings.proxies = true;
  if (args.verified) browserSettings.verified = true;
  const body = { agentId: agent.agentId, task: config.task, resultSchema: config.resultSchema };
  if (Object.keys(config.variables ?? {}).length) body.variables = config.variables;
  if (Object.keys(browserSettings).length) body.browserSettings = browserSettings;
  const created = await api(apiKey, "/agents/runs", { method: "POST", body: JSON.stringify(body) });
  await writeJson(path.join(runDir, "created-run.json"), created);
  console.log(`run=${created.runId}`);
  const { run, messages } = await poll(apiKey, created.runId, {
    pollMs: Number(args.pollMs ?? 3000),
    timeoutMs: Number(args.timeoutMs ?? 12 * 60_000),
    maxMessages: Number(args.maxMessages ?? 100),
  });
  const logs = run.sessionId ? await optionalApi(apiKey, `/sessions/${run.sessionId}/logs`) : [];
  const summary = {
    label,
    status: run.status,
    durationMs: run.startedAt && run.endedAt ? Date.parse(run.endedAt) - Date.parse(run.startedAt) : null,
    normalizedResult: run.result?.output ?? run.result ?? null,
    cause: run.cause ?? null,
    score: score(run, config),
    messages: summarizeMessages(messages),
    sessionLogs: summarizeLogs(logs),
  };
  await Promise.all([
    writeJson(path.join(runDir, "run.json"), run),
    writeJson(path.join(runDir, "messages.json"), messages),
    writeJson(path.join(runDir, "session-logs.json"), logs),
    writeJson(path.join(runDir, "summary.json"), summary),
  ]);
  console.log(JSON.stringify(summary, null, 2));
}

async function inspectRun(args) {
  const workspace = path.resolve(requireArg(args, "workspace"));
  const label = requireArg(args, "label");
  const messages = await readJson(path.join(workspace, "runs", label, "messages.json"));
  let index = 0;
  for (const entry of messages) {
    for (const part of entry.message?.content ?? []) {
      if (part.type === "tool-call") console.log(`${++index}\tCALL\t${part.toolName}\t${JSON.stringify(part.input).slice(0, 500)}`);
      if (part.type === "tool-result") console.log(`${++index}\tRESULT\t${part.toolName}\t${JSON.stringify(part.output).slice(0, 1000)}`);
    }
  }
}

async function report(args) {
  const workspace = path.resolve(requireArg(args, "workspace"));
  const entries = await fs.readdir(path.join(workspace, "runs"), { withFileTypes: true });
  const rows = [];
  for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    try { rows.push(await readJson(path.join(workspace, "runs", entry.name, "summary.json"))); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  const lines = [
    "| Run | Status | Score | Duration | Messages | Browser logs | Missing required fields |",
    "|---|---:|---:|---:|---:|---:|---|",
    ...rows.map((row) => `| ${row.label} | ${row.status} | ${row.score.total} | ${row.durationMs == null ? "n/a" : `${Math.round(row.durationMs / 1000)}s`} | ${row.messages.count} | ${row.sessionLogs.count} | ${row.score.requiredMissing.join(", ") || "none"} |`),
  ];
  const markdown = `${lines.join("\n")}\n`;
  await fs.writeFile(path.join(workspace, "REPORT.md"), markdown);
  console.log(markdown);
}

function usage() {
  console.log(`Usage:
  optimize_agent_prompt.mjs init --workspace PATH --name NAME
  optimize_agent_prompt.mjs run --workspace PATH --prompt FILE [--label NAME] [--max-messages N]
  optimize_agent_prompt.mjs inspect --workspace PATH --label NAME
  optimize_agent_prompt.mjs report --workspace PATH`);
}

const args = parseArgs(process.argv.slice(2));
if (args.command === "init") await initWorkspace(args);
else if (args.command === "run") await runIteration(args);
else if (args.command === "inspect") await inspectRun(args);
else if (args.command === "report") await report(args);
else usage();
