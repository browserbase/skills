#!/usr/bin/env node
import { execFile, spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const execFileP = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const skillDir = resolve(__dirname, "..");
const manifest = JSON.parse(readFileSync(resolve(skillDir, "extension", "manifest.json"), "utf8"));

const port = Number(process.env.BROWSER_SWARM_PORT || 19989);
const host = process.env.BROWSER_SWARM_HOST || "127.0.0.1";
const browseBin = process.env.BROWSER_SWARM_BROWSE_BIN || "browse";
const allowExistingTargets = process.env.BROWSER_SWARM_ALLOW_EXISTING_TARGETS === "1";

let samePageServer;
let relayProcess;
let startedRelay = false;
let targets = [];
let sessions = [];

function run(command, args, options = {}) {
  return execFileP(command, args, {
    cwd: options.cwd || skillDir,
    env: { ...process.env, ...(options.env || {}) },
    maxBuffer: 20_000_000,
  });
}

function parseJson(stdout) {
  return JSON.parse(stdout.trim());
}

function parseGetField(stdout, field) {
  const parsed = parseJson(stdout);
  if (typeof parsed === "string") return parsed;
  if (parsed && typeof parsed === "object" && field in parsed) return parsed[field];
  if (parsed && typeof parsed === "object" && "value" in parsed) return parsed.value;
  return parsed;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tryHealth() {
  try {
    const response = await fetch(`http://${host}:${port}/health`);
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

async function waitForHealth(timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const health = await tryHealth();
    if (health?.extensionConnected) return health;
    await sleep(500);
  }
  throw new Error("Timed out waiting for Arc Browser Swarm extension connection");
}

async function ensureRelay() {
  const existing = await tryHealth();
  if (existing) return { started: false, initialHealth: existing };

  relayProcess = spawn(process.execPath, [
    "scripts/swarm-relay.mjs",
    "serve",
    "--host",
    host,
    "--port",
    String(port),
  ], {
    cwd: skillDir,
    stdio: ["ignore", "ignore", "pipe"],
  });
  startedRelay = true;
  relayProcess.stderr.on("data", (chunk) => process.stderr.write(chunk));
  await sleep(500);
  return { started: true, initialHealth: await tryHealth() };
}

function startSamePageServer() {
  const html = `<!doctype html>
<html>
  <head><title>arc-parallel-click-test</title></head>
  <body>
    <form id="form">
      <label for="box">Worker value</label>
      <input id="box" name="box" autocomplete="off" autofocus />
      <button id="submit" type="submit">Submit</button>
    </form>
    <output id="result">empty</output>
    <script>
      document.getElementById("form").addEventListener("submit", (event) => {
        event.preventDefault();
        const value = document.getElementById("box").value;
        document.body.dataset.workerValue = value;
        document.getElementById("result").textContent = value;
        document.title = "arc-parallel-click-test " + value;
      });
    </script>
  </body>
</html>`;

  samePageServer = createServer((req, res) => {
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(html);
  });

  return new Promise((resolve, reject) => {
    samePageServer.once("error", reject);
    samePageServer.listen(0, "127.0.0.1", () => {
      resolve(`http://127.0.0.1:${samePageServer.address().port}/same`);
    });
  });
}

async function cdpRoot(method, params = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${host}:${port}/devtools/browser`);
    const id = Math.floor(Math.random() * 1_000_000_000);
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error(`Timed out waiting for ${method}`));
    }, 5000);

    ws.once("open", () => ws.send(JSON.stringify({ id, method, params })));
    ws.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.id !== id) return;
      clearTimeout(timer);
      ws.close();
      if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
      else resolve(message.result);
    });
    ws.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function killBrowseDaemons() {
  for (const session of sessions) {
    spawnSync("pkill", ["-f", `daemon --session ${session}`], { stdio: "ignore" });
  }
}

async function cleanup() {
  for (const target of targets) {
    try {
      await cdpRoot("Target.closeTarget", { targetId: target.targetId });
    } catch {}
  }
  killBrowseDaemons();
  if (samePageServer) samePageServer.close();
  if (startedRelay && relayProcess) relayProcess.kill();
}

async function main() {
  const relay = await ensureRelay();
  const health = await waitForHealth();
  const connectedVersion = health.extension?.version || null;

  if (connectedVersion !== manifest.version) {
    console.log(JSON.stringify({
      status: "BLOCKED_STALE_EXTENSION",
      message: "Arc is connected to a stale Browser Swarm service worker. Reload Browser Swarm Bridge or restart Arc, then rerun this command.",
      relayStarted: relay.started,
      expectedExtensionVersion: manifest.version,
      connectedExtensionVersion: connectedVersion,
      health,
    }, null, 2));
    process.exitCode = 3;
    return;
  }

  if (!allowExistingTargets && health.targetCount !== 0) {
    throw new Error(
      `Refusing to run Arc parallel-click smoke with ${health.targetCount} existing browser-swarm targets. ` +
      "Close/release them first or set BROWSER_SWARM_ALLOW_EXISTING_TARGETS=1."
    );
  }

  const samePageUrl = await startSamePageServer();
  const ensure = await run("node", [
    "scripts/swarm-relay.mjs",
    "ensure",
    "--port",
    String(port),
    "--host",
    host,
    "--no-group",
    "--count",
    "2",
    "--label",
    "arc-parallel-a",
    "--label",
    "arc-parallel-b",
    "--url",
    samePageUrl,
    "--url",
    samePageUrl,
    "--json",
  ]);
  targets = parseJson(ensure.stdout).targets;
  assert(targets.length === 2, `Expected 2 Arc targets, got ${targets.length}`);

  sessions = targets.map((target, index) =>
    `bs-arcpar-${index}-${target.targetId.slice(0, 4).toLowerCase()}`
  );
  const values = ["arc-parallel-alpha", "arc-parallel-beta"];

  const fillResults = await Promise.all(targets.map((target, index) => run(browseBin, [
    "fill",
    "#box",
    values[index],
    "--session",
    sessions[index],
    "--cdp",
    target.wsUrl,
  ])));

  const clickResults = await Promise.all(targets.map((target, index) => run(browseBin, [
    "click",
    "#submit",
    "--session",
    sessions[index],
    "--cdp",
    target.wsUrl,
  ])));

  const evidence = [];
  for (let i = 0; i < targets.length; i++) {
    const title = parseGetField((await run(browseBin, [
      "get",
      "title",
      "--session",
      sessions[i],
      "--cdp",
      targets[i].wsUrl,
    ])).stdout, "title");
    const resultText = parseGetField((await run(browseBin, [
      "get",
      "text",
      "#result",
      "--session",
      sessions[i],
      "--cdp",
      targets[i].wsUrl,
    ])).stdout, "text");
    const inputValue = parseGetField((await run(browseBin, [
      "get",
      "value",
      "#box",
      "--session",
      sessions[i],
      "--cdp",
      targets[i].wsUrl,
    ])).stdout, "value");
    const tabList = parseJson((await run(browseBin, [
      "tab",
      "list",
      "--session",
      sessions[i],
      "--cdp",
      targets[i].wsUrl,
    ])).stdout);

    assert(tabList.tabs.length === 1, `Expected ${sessions[i]} to see exactly one tab`);
    assert(tabList.tabs[0].targetId === targets[i].targetId, `Expected ${sessions[i]} target isolation`);
    assert(title === `arc-parallel-click-test ${values[i]}`, `Unexpected title for ${sessions[i]}: ${title}`);
    assert(resultText === values[i], `Unexpected result text for ${sessions[i]}: ${resultText}`);
    assert(inputValue === values[i], `Unexpected input value for ${sessions[i]}: ${inputValue}`);

    evidence.push({
      label: targets[i].label,
      targetId: targets[i].targetId,
      session: sessions[i],
      title,
      resultText,
      inputValue,
      tabCount: tabList.tabs.length,
    });
  }

  console.log(JSON.stringify({
    status: "PASS",
    relayStarted: relay.started,
    expectedExtensionVersion: manifest.version,
    health,
    samePageUrl,
    fillResults: fillResults.map((result) => parseJson(result.stdout)),
    clickResults: clickResults.map((result) => parseJson(result.stdout)),
    evidence,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
}).finally(cleanup);
