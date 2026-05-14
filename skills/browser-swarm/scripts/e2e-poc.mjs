#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillDir = resolve(__dirname, "..");
const artifactsDir = "/tmp/browser-swarm-e2e";
const port = Number(process.env.BROWSER_SWARM_PORT || 19989);
const browseBin = process.env.BROWSER_SWARM_BROWSE_BIN || "browse";
const expectedExtension = JSON.parse(readFileSync(resolve(skillDir, "extension", "manifest.json"), "utf8"));
const workerSessions = [];
let samePageServer;

mkdirSync(artifactsDir, { recursive: true });
spawnSync("pkill", ["-f", "/tmp/browser-swarm-e2e-profile"], { stdio: "ignore" });

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || skillDir,
      env: { ...process.env, ...(options.env || {}) },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => stdout += chunk.toString());
    child.stderr.on("data", (chunk) => stderr += chunk.toString());
    child.on("exit", (code) => {
      const result = { command: [command, ...args].join(" "), code, stdout, stderr };
      if (code === 0) resolve(result);
      else reject(Object.assign(new Error(`${result.command} exited ${code}\n${stderr}`), { result }));
    });
  });
}

function parseJson(stdout) {
  return JSON.parse(stdout.trim());
}

function parseJsonOrText(stdout) {
  const text = stdout.trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function previewOutput(value) {
  if (typeof value === "string") return value.slice(0, 500);
  if (typeof value?.tree === "string") return value.tree.slice(0, 500);
  return JSON.stringify(value).slice(0, 500);
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

function startSamePageServer() {
  const html = `<!doctype html>
<html>
  <head><title>same-page-action-test</title></head>
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
        document.title = "same-page-action-test " + value;
      });
    </script>
  </body>
</html>`;

  samePageServer = createServer((req, res) => {
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    });
    res.end(html);
  });

  return new Promise((resolve, reject) => {
    samePageServer.once("error", reject);
    samePageServer.listen(0, "127.0.0.1", () => {
      const address = samePageServer.address();
      resolve(`http://127.0.0.1:${address.port}/same`);
    });
  });
}

async function waitForHealth(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      const json = await res.json();
      if (json.extensionConnected) return json;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Timed out waiting for relay and extension connection");
}

async function cdpProbe(wsUrl, commands) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });

  let nextId = 1;
  async function send(method, params = {}, sessionId = null) {
    const id = nextId++;
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((resolve, reject) => {
      const onMessage = (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.id !== id) return;
        ws.off("message", onMessage);
        resolve(message);
      };
      ws.on("message", onMessage);
      setTimeout(() => {
        ws.off("message", onMessage);
        reject(new Error(`Timed out waiting for ${method}`));
      }, 5000).unref();
    });
  }

  try {
    const results = {};
    for (const command of commands) {
      const sessionId = command.sessionIdFrom
        ? results[command.sessionIdFrom]?.result?.sessionId
        : command.sessionId;
      results[command.name] = await send(command.method, command.params || {}, sessionId);
    }
    return results;
  } finally {
    ws.close();
  }
}

async function cdpRootLifecycle(wsUrl, createUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });

  let nextId = 1;
  const events = [];
  const onAnyMessage = (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.method) events.push(message);
  };
  ws.on("message", onAnyMessage);

  async function send(method, params = {}, sessionId = null) {
    const id = nextId++;
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((resolve, reject) => {
      const onMessage = (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.id !== id) return;
        ws.off("message", onMessage);
        resolve(message);
      };
      ws.on("message", onMessage);
      setTimeout(() => {
        ws.off("message", onMessage);
        reject(new Error(`Timed out waiting for ${method}`));
      }, 5000).unref();
    });
  }

  try {
    const before = await send("Target.getTargets");
    const attachTargetId = before.result?.targetInfos?.[0]?.targetId;
    const attach = attachTargetId
      ? await send("Target.attachToTarget", { targetId: attachTargetId, flatten: true })
      : null;
    const sessionId = attach?.result?.sessionId;
    assert(sessionId, `Expected root attachToTarget to return a sessionId: ${JSON.stringify(attach)}`);
    const created = await send("Target.createTarget", { url: createUrl }, sessionId);
    const createdTargetId = created.result?.targetId;
    assert(createdTargetId, `Expected root createTarget to return a targetId: ${JSON.stringify(created)}`);
    const afterCreate = await send("Target.getTargets");
    const closed = await send("Target.closeTarget", { targetId: createdTargetId }, sessionId);
    const afterClose = await send("Target.getTargets");
    await new Promise((resolve) => setTimeout(resolve, 250));
    const detachEvents = events.filter((event) =>
      event.method === "Target.detachedFromTarget" &&
      event.params?.targetId === createdTargetId
    );
    return { before, attach, created, afterCreate, closed, afterClose, createdTargetId, detachEvents };
  } finally {
    ws.off("message", onAnyMessage);
    ws.close();
  }
}

const relay = spawn("node", ["scripts/swarm-relay.mjs", "serve", "--port", String(port)], {
  cwd: skillDir,
  stdio: ["ignore", "pipe", "pipe"]
});

let relayLog = "";
relay.stdout.on("data", (chunk) => relayLog += chunk.toString());
relay.stderr.on("data", (chunk) => relayLog += chunk.toString());

try {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const launch = await run("node", [
    "scripts/launch-chrome.mjs",
    "--fresh",
    "--profile",
    "/tmp/browser-swarm-e2e-profile",
    "--relay-port",
    String(port)
  ]);

  const health = await waitForHealth();
  assert(health.extension?.version === expectedExtension.version, `Expected extension version ${expectedExtension.version}, got ${health.extension?.version}`);
  assert(health.extension?.id, "Expected extension /health metadata to include runtime id");
  assert(
    health.extension?.serviceWorker === expectedExtension.background?.service_worker,
    `Expected extension worker ${expectedExtension.background?.service_worker}, got ${health.extension?.serviceWorker}`
  );
  const ensure = await run("node", [
    "scripts/swarm-relay.mjs",
    "ensure",
    "--port",
    String(port),
    "--count",
    "3",
    "--label",
    "flights",
    "--label",
    "rentals",
    "--label",
    "dinner",
    "--url",
    "https://www.google.com/travel/flights",
    "--url",
    "https://www.google.com/search?q=san+diego+surfboard+rentals+downtown",
    "--url",
    "https://www.kayak.com/San-Diego.10760.guide",
    "--json"
  ]);

  const swarm = JSON.parse(ensure.stdout);
  const browseResults = [];
  for (const [index, target] of swarm.targets.slice(0, 3).entries()) {
    const session = `browser-swarm-e2e-${target.label || `worker-${index + 1}`}-${target.targetId.slice(0, 8)}`;
    workerSessions.push(session);

    const title = await run(browseBin, ["get", "title", "--session", session, "--cdp", target.wsUrl]);
    const url = await run(browseBin, ["get", "url", "--session", session, "--cdp", target.wsUrl]);
    const snapshot = await run(browseBin, ["snapshot", "--compact", "--session", session, "--cdp", target.wsUrl]);
    const tabList = await run(browseBin, ["tab", "list", "--session", session, "--cdp", target.wsUrl]);
    const screenshotPath = resolve(artifactsDir, `${target.label || target.targetId}.png`);
    const screenshot = await run(browseBin, ["screenshot", "--path", screenshotPath, "--session", session, "--cdp", target.wsUrl]);

    const parsedTabs = parseJson(tabList.stdout).tabs;
    const parsedSnapshot = parseJsonOrText(snapshot.stdout);
    assert(parsedTabs.length === 1, `Expected ${session} to see exactly one tab, saw ${parsedTabs.length}`);
    assert(parsedTabs[0].targetId === target.targetId, `Expected ${session} tab list to expose only ${target.targetId}`);

    browseResults.push({
      label: target.label,
      targetId: target.targetId,
      session,
      wsUrl: target.wsUrl,
      title: parseJson(title.stdout),
      url: parseJson(url.stdout),
      tabList: parseJson(tabList.stdout),
      snapshotPreview: previewOutput(parsedSnapshot),
      screenshot: parseJsonOrText(screenshot.stdout)
    });
  }

  const [firstTarget, secondTarget] = swarm.targets;
  const isolation = await cdpProbe(firstTarget.wsUrl, [
    { name: "visible", method: "Target.getTargets" },
    { name: "attachOwn", method: "Target.attachToTarget", params: { targetId: firstTarget.targetId, flatten: true } },
    { name: "visibleWithSession", method: "Target.getTargets", sessionIdFrom: "attachOwn" },
    { name: "attachOther", method: "Target.attachToTarget", params: { targetId: secondTarget.targetId, flatten: true } },
    { name: "attachOtherWithSession", method: "Target.attachToTarget", sessionIdFrom: "attachOwn", params: { targetId: secondTarget.targetId, flatten: true } },
    { name: "infoOther", method: "Target.getTargetInfo", params: { targetId: secondTarget.targetId } },
    { name: "infoOtherWithSession", method: "Target.getTargetInfo", sessionIdFrom: "attachOwn", params: { targetId: secondTarget.targetId } },
    { name: "createTarget", method: "Target.createTarget", params: { url: "https://example.net/#worker-created" } },
    { name: "closeOwn", method: "Target.closeTarget", params: { targetId: firstTarget.targetId } },
    { name: "createWithSession", method: "Target.createTarget", sessionIdFrom: "attachOwn", params: { url: "https://example.net/#session-worker-created" } },
    { name: "closeWithSession", method: "Target.closeTarget", sessionIdFrom: "attachOwn", params: { targetId: firstTarget.targetId } },
    { name: "unknownSessionEval", method: "Runtime.evaluate", sessionId: "browser-swarm-stale-session", params: { expression: "location.href", returnByValue: true } }
  ]);
  const visibleTargets = isolation.visible.result?.targetInfos || [];
  const visibleTargetsWithSession = isolation.visibleWithSession.result?.targetInfos || [];
  assert(visibleTargets.length === 1, `Expected raw CDP probe to see one target, saw ${visibleTargets.length}`);
  assert(visibleTargets[0].targetId === firstTarget.targetId, "Raw CDP probe saw the wrong target");
  assert(visibleTargetsWithSession.length === 1, `Expected session-scoped Target.getTargets to see one target, saw ${visibleTargetsWithSession.length}`);
  assert(visibleTargetsWithSession[0].targetId === firstTarget.targetId, "Session-scoped Target.getTargets saw the wrong target");
  assert(!isolation.attachOwn.error, `Expected attaching own target to succeed: ${JSON.stringify(isolation.attachOwn)}`);
  assert(isolation.attachOther.error, "Expected attaching sibling target to fail");
  assert(isolation.attachOtherWithSession.error, "Expected attaching sibling target with sessionId to fail");
  assert(isolation.infoOther.error, "Expected reading sibling target info to fail");
  assert(isolation.infoOtherWithSession.error, "Expected reading sibling target info with sessionId to fail");
  assert(isolation.createTarget.error, "Expected worker Target.createTarget to be blocked");
  assert(isolation.closeOwn.error, "Expected worker Target.closeTarget to be blocked");
  assert(isolation.createWithSession.error, "Expected worker Target.createTarget with sessionId to be blocked");
  assert(isolation.closeWithSession.error, "Expected worker Target.closeTarget with sessionId to be blocked");
  assert(isolation.unknownSessionEval.error, "Expected unknown sessionId to fail instead of falling back to the worker target");

  const samePageUrl = await startSamePageServer();
  const rootLifecycle = await cdpRootLifecycle(`ws://127.0.0.1:${port}/devtools/browser`, `${samePageUrl}#root-created`);
  const afterCreateTargets = rootLifecycle.afterCreate.result?.targetInfos || [];
  const afterCloseTargets = rootLifecycle.afterClose.result?.targetInfos || [];
  assert(afterCreateTargets.some((target) => target.targetId === rootLifecycle.createdTargetId), "Expected root-created target to appear after createTarget");
  assert(!afterCloseTargets.some((target) => target.targetId === rootLifecycle.createdTargetId), "Expected root-created target to be absent after closeTarget");
  assert(rootLifecycle.detachEvents.length === 1, `Expected exactly one root detach event, saw ${rootLifecycle.detachEvents.length}`);

  const relayScreenshotPath = resolve(artifactsDir, "relay-screenshot.png");
  const relayScreenshot = await run("node", [
    "scripts/swarm-relay.mjs",
    "screenshot",
    "--port",
    String(port),
    "--target-id",
    firstTarget.targetId,
    "--path",
    relayScreenshotPath,
    "--json"
  ]);
  const relayScreenshotResult = parseJson(relayScreenshot.stdout);
  const relayScreenshotBytes = statSync(relayScreenshotPath).size;
  assert(relayScreenshotBytes > 0, "Expected relay screenshot CLI to write a non-empty image");

  const writeTargets = swarm.targets.slice(0, 3);
  await Promise.all(writeTargets.map((target) => run("node", [
    "scripts/swarm-relay.mjs",
    "navigate",
    "--port",
    String(port),
    "--target-id",
    target.targetId,
    samePageUrl
  ])));
  await new Promise((resolve) => setTimeout(resolve, 500));

  const writeValues = ["alpha-worker", "beta-worker", "gamma-worker"];
  const fillResults = await Promise.all(writeTargets.map((target, index) => run(browseBin, [
    "fill",
    "#box",
    writeValues[index],
    "--session",
    browseResults[index].session,
    "--cdp",
    target.wsUrl
  ])));
  const submitResults = await Promise.all(writeTargets.map((target, index) => run(browseBin, [
    "click",
    "#submit",
    "--session",
    browseResults[index].session,
    "--cdp",
    target.wsUrl
  ])));
  const writeEvidence = await Promise.all(writeTargets.map(async (target, index) => {
    const session = browseResults[index].session;
    const title = await run(browseBin, ["get", "title", "--session", session, "--cdp", target.wsUrl]);
    const resultText = await run(browseBin, ["get", "text", "#result", "--session", session, "--cdp", target.wsUrl]);
    const inputValue = await run(browseBin, ["get", "value", "#box", "--session", session, "--cdp", target.wsUrl]);
    const tabList = await run(browseBin, ["tab", "list", "--session", session, "--cdp", target.wsUrl]);
    const parsedTabs = parseJson(tabList.stdout).tabs;
    assert(parsedTabs.length === 1, `Expected same-page ${session} to see exactly one tab, saw ${parsedTabs.length}`);
    assert(parsedTabs[0].targetId === target.targetId, `Expected same-page ${session} tab list to expose only ${target.targetId}`);

    const expected = writeValues[index];
    const parsedTitle = parseGetField(title.stdout, "title");
    const parsedText = parseGetField(resultText.stdout, "text");
    const parsedValue = parseGetField(inputValue.stdout, "value");
    assert(parsedTitle === `same-page-action-test ${expected}`, `Expected title for ${session} to include ${expected}, got ${parsedTitle}`);
    assert(parsedText === expected, `Expected #result for ${session} to be ${expected}, got ${parsedText}`);
    assert(parsedValue === expected, `Expected #box for ${session} to be ${expected}, got ${parsedValue}`);

    return {
      label: target.label,
      targetId: target.targetId,
      session,
      value: expected,
      title: parsedTitle,
      resultText: parsedText,
      inputValue: parsedValue,
      tabList: parseJson(tabList.stdout)
    };
  }));

  const report = {
    prompt: "plan an offsite to san diego next week - we need flights booked, surfing rentals and dinner near downtown",
    browseBin,
    launch: JSON.parse(launch.stdout),
    health,
    targets: swarm.targets.map((target) => ({
      label: target.label,
      targetId: target.targetId,
      wsUrl: target.wsUrl,
      url: target.targetInfo.url,
      title: target.targetInfo.title
    })),
    browseResults,
    isolation: {
      visibleTargets: visibleTargets.map((target) => ({
        targetId: target.targetId,
        url: target.url,
        title: target.title
      })),
      visibleTargetsWithSession: visibleTargetsWithSession.map((target) => ({
        targetId: target.targetId,
        url: target.url,
        title: target.title
      })),
      attachOwn: isolation.attachOwn,
      attachOther: isolation.attachOther,
      attachOtherWithSession: isolation.attachOtherWithSession,
      infoOther: isolation.infoOther,
      infoOtherWithSession: isolation.infoOtherWithSession,
      createTarget: isolation.createTarget,
      closeOwn: isolation.closeOwn,
      createWithSession: isolation.createWithSession,
      closeWithSession: isolation.closeWithSession,
      unknownSessionEval: isolation.unknownSessionEval
    },
    rootLifecycle: {
      createdTargetId: rootLifecycle.createdTargetId,
      sessionId: rootLifecycle.attach.result?.sessionId,
      beforeCount: rootLifecycle.before.result?.targetInfos?.length,
      afterCreateCount: afterCreateTargets.length,
      afterCloseCount: afterCloseTargets.length,
      detachEventCount: rootLifecycle.detachEvents.length,
      closed: rootLifecycle.closed
    },
    relayScreenshot: {
      path: relayScreenshotPath,
      result: relayScreenshotResult,
      bytes: relayScreenshotBytes
    },
    samePageWrite: {
      url: samePageUrl,
      fillResults: fillResults.map((result) => parseJsonOrText(result.stdout)),
      submitResults: submitResults.map((result) => parseJsonOrText(result.stdout)),
      evidence: writeEvidence
    }
  };
  const reportPath = resolve(artifactsDir, "report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: "PASS", reportPath, report }, null, 2));
} catch (error) {
  const reportPath = resolve(artifactsDir, "failure.log");
  writeFileSync(reportPath, [
    error instanceof Error ? error.stack : String(error),
    "",
    "Relay log:",
    relayLog
  ].join("\n"));
  console.error(JSON.stringify({ status: "FAIL", reportPath, error: error.message }, null, 2));
  process.exitCode = 1;
} finally {
  for (const session of workerSessions) {
    spawnSync(browseBin, ["stop", "--session", session], { stdio: "ignore" });
  }
  if (samePageServer) samePageServer.close();
  relay.kill("SIGTERM");
  spawnSync("pkill", ["-f", "/tmp/browser-swarm-e2e-profile"], { stdio: "ignore" });
}
