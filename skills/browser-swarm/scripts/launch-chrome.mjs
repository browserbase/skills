#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillDir = resolve(__dirname, "..");
const extensionDir = resolve(skillDir, "extension");
const defaultRelayPort = 19989;

function parseArgs(argv) {
  const opts = {
    profile: "/tmp/browser-swarm-chrome-profile",
    url: "about:blank",
    fresh: false,
    relayPort: Number(process.env.BROWSER_SWARM_PORT || defaultRelayPort)
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--profile") opts.profile = argv[++i];
    else if (arg === "--url") opts.url = argv[++i];
    else if (arg === "--fresh") opts.fresh = true;
    else if (arg === "--relay-port") opts.relayPort = Number(argv[++i]);
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: launch-chrome.mjs [--profile <dir>] [--url <url>] [--fresh] [--relay-port <port>]`);
      process.exit(0);
    }
  }
  return opts;
}

function chromePath() {
  const playwrightChromium = findPlaywrightChromium();
  const candidates = [
    process.env.CHROME_PATH,
    playwrightChromium,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "google-chrome",
    "chromium",
    "chromium-browser"
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate.includes("/") && existsSync(candidate)) return candidate;
    if (!candidate.includes("/") && commandExists(candidate)) return candidate;
  }
  throw new Error("Could not find Chrome. Set CHROME_PATH.");
}

function commandExists(command) {
  const result = spawnSync("sh", ["-lc", "command -v \"$1\"", "sh", command], {
    stdio: "ignore"
  });
  return result.status === 0;
}

function findPlaywrightChromium() {
  const cacheDir = `${process.env.HOME}/Library/Caches/ms-playwright`;
  if (!existsSync(cacheDir)) return null;
  const installs = readdirSync(cacheDir)
    .filter((name) => name.startsWith("chromium-"))
    .sort()
    .reverse();
  for (const install of installs) {
    const candidate = `${cacheDir}/${install}/chrome-mac/Chromium.app/Contents/MacOS/Chromium`;
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function extensionDirForPort(port) {
  if (!port || port === defaultRelayPort) return extensionDir;

  const patchedDir = `/tmp/browser-swarm-extension-${port}`;
  rmSync(patchedDir, { recursive: true, force: true });
  cpSync(extensionDir, patchedDir, { recursive: true });

  const workerPath = resolve(patchedDir, "service-worker.js");
  const worker = readFileSync(workerPath, "utf8");
  writeFileSync(
    workerPath,
    worker.replace(`const DEFAULT_PORT = ${defaultRelayPort};`, `const DEFAULT_PORT = ${port};`)
  );
  return patchedDir;
}

const opts = parseArgs(process.argv.slice(2));
if (opts.fresh && existsSync(opts.profile)) {
  rmSync(opts.profile, { recursive: true, force: true });
}
mkdirSync(opts.profile, { recursive: true });

const activeExtensionDir = extensionDirForPort(opts.relayPort);
const args = [
  `--user-data-dir=${opts.profile}`,
  `--load-extension=${activeExtensionDir}`,
  `--disable-extensions-except=${activeExtensionDir}`,
  "--disable-features=DisableLoadExtensionCommandLineSwitch",
  "--no-first-run",
  "--no-default-browser-check",
  opts.url
];

const child = spawn(chromePath(), args, {
  detached: true,
  stdio: "ignore"
});
child.unref();

console.log(JSON.stringify({
  launched: true,
  pid: child.pid,
  profile: opts.profile,
  extensionDir: activeExtensionDir,
  relayPort: opts.relayPort
}, null, 2));
