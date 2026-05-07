#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillDir = resolve(__dirname, "..");
const artifactsDir = "/tmp/browser-swarm-e2e";
const port = Number(process.env.BROWSER_SWARM_PORT || 19989);

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
    "/tmp/browser-swarm-e2e-profile"
  ]);

  const health = await waitForHealth();
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
  for (const target of swarm.targets.slice(0, 3)) {
    const title = await run("browse", ["--ws", target.wsUrl, "get", "title", "--json"]);
    const url = await run("browse", ["--ws", target.wsUrl, "get", "url", "--json"]);
    const snapshot = await run("browse", ["--ws", target.wsUrl, "snapshot", "--compact", "--json"]);
    const screenshotPath = resolve(artifactsDir, `${target.label || target.targetId}.png`);
    const screenshot = await run("browse", ["--ws", target.wsUrl, "screenshot", screenshotPath, "--json"]);
    browseResults.push({
      label: target.label,
      targetId: target.targetId,
      wsUrl: target.wsUrl,
      title: JSON.parse(title.stdout),
      url: JSON.parse(url.stdout),
      snapshotPreview: JSON.parse(snapshot.stdout).tree.slice(0, 500),
      screenshot: JSON.parse(screenshot.stdout)
    });
  }

  const report = {
    prompt: "plan an offsite to san diego next week - we need flights booked, surfing rentals and dinner near downtown",
    launch: JSON.parse(launch.stdout),
    health,
    targets: swarm.targets.map((target) => ({
      label: target.label,
      targetId: target.targetId,
      wsUrl: target.wsUrl,
      url: target.targetInfo.url,
      title: target.targetInfo.title
    })),
    browseResults
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
  relay.kill("SIGTERM");
  spawnSync("pkill", ["-f", "/tmp/browser-swarm-e2e-profile"], { stdio: "ignore" });
}
