#!/usr/bin/env node
import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import open, { apps } from "open";

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillDir = resolve(__dirname, "..");
const extensionDir = resolve(skillDir, "extension");
const DEFAULT_PORT = 19989;
const DEFAULT_HOST = "127.0.0.1";

const BROWSERS = {
  arc: {
    label: "Arc",
    appName: process.platform === "darwin" ? "Arc" : "arc",
    extensionsUrl: "arc://extensions",
  },
  chrome: {
    label: "Google Chrome",
    appName: apps.chrome,
    extensionsUrl: "chrome://extensions",
  },
  canary: {
    label: "Google Chrome Canary",
    appName: process.platform === "darwin" ? "Google Chrome Canary" : "google-chrome-canary",
    extensionsUrl: "chrome://extensions",
  },
  chromium: {
    label: "Chromium",
    appName: process.platform === "darwin" ? "Chromium" : ["chromium", "chromium-browser"],
    extensionsUrl: "chrome://extensions",
  },
  "chrome-for-testing": {
    label: "Chrome for Testing",
    appName: process.platform === "darwin"
      ? "Google Chrome for Testing"
      : ["chrome-for-testing", "google-chrome-for-testing"],
    extensionsUrl: "chrome://extensions",
  },
  default: {
    label: "default browser for chrome:// URLs",
    extensionsUrl: "chrome://extensions",
  },
};

function usage() {
  console.log(`Usage:
  node scripts/setup-real-browser.mjs [--browser <arc|chrome|canary|chromium|chrome-for-testing|default>]

Options:
  --browser <name>        Browser to open. Defaults to OS URL handler for chrome://extensions.
  --extensions-url <url>  Override the extensions page URL.
  --port <port>           Relay port. Default: ${DEFAULT_PORT}
  --host <host>           Relay host. Default: ${DEFAULT_HOST}
  --no-open               Print instructions without opening the browser.
  --no-start-relay        Do not auto-start the relay if it is down.
  --no-wait               Do not poll for extensionConnected.
  --timeout <seconds>     Wait time for extension connection. Default: 180
  --json                  Print the final status as JSON.

This helper does not install the unpacked extension for the user. It starts or checks the
localhost relay, opens the chosen browser's extensions page, prints the extension path,
and waits until the user-approved extension connects.`);
}

function parseArgs(argv) {
  const opts = {
    browser: process.env.BROWSER_SWARM_BROWSER || "default",
    extensionsUrl: process.env.BROWSER_SWARM_EXTENSIONS_URL,
    port: DEFAULT_PORT,
    host: DEFAULT_HOST,
    open: true,
    startRelay: true,
    wait: true,
    timeoutSeconds: 180,
    json: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--browser") opts.browser = argv[++i];
    else if (arg === "--extensions-url") opts.extensionsUrl = argv[++i];
    else if (arg === "--port") opts.port = Number(argv[++i]);
    else if (arg === "--host") opts.host = argv[++i];
    else if (arg === "--no-open") opts.open = false;
    else if (arg === "--no-start-relay") opts.startRelay = false;
    else if (arg === "--no-wait") opts.wait = false;
    else if (arg === "--timeout") opts.timeoutSeconds = Number(argv[++i]);
    else if (arg === "--json") opts.json = true;
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }

  return opts;
}

async function health(host, port) {
  const response = await fetch(`http://${host}:${port}/health`);
  if (!response.ok) throw new Error(`Relay health returned HTTP ${response.status}`);
  return response.json();
}

async function tryHealth(host, port) {
  try {
    return await health(host, port);
  } catch {
    return null;
  }
}

function startRelay({ host, port }) {
  const logDir = "/tmp/browser-swarm";
  mkdirSync(logDir, { recursive: true });
  const logPath = `${logDir}/relay-${port}.log`;
  const logFd = openSync(logPath, "a");
  let child;
  try {
    child = spawn("node", ["scripts/swarm-relay.mjs", "serve", "--host", host, "--port", String(port)], {
      cwd: skillDir,
      detached: true,
      stdio: ["ignore", logFd, logFd],
    });
  } finally {
    closeSync(logFd);
  }
  child.unref();
  return { pid: child.pid, logPath };
}

async function waitForRelay(host, port, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = await tryHealth(host, port);
    if (status) return status;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for relay on http://${host}:${port}`);
}

async function waitForExtension(host, port, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = await health(host, port);
    if (status.extensionConnected) return status;
    await sleep(1000);
  }
  return health(host, port);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readExpectedExtension() {
  const manifestPath = resolve(extensionDir, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  return {
    name: manifest.name,
    version: manifest.version,
    serviceWorker: manifest.background?.service_worker,
  };
}

async function openBrowser(browser) {
  const url = browser.extensionsUrl;
  try {
    if (browser.appName) {
      await open(url, { app: { name: browser.appName } });
      return { opened: true, target: url, app: browser.appName };
    }
    await open(url);
    return { opened: true, target: url, app: "default" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to open ${url}: ${message}. Open it manually in the browser you want to use.`);
  }
}

function extensionVersionMatches(status, expectedExtension) {
  return status?.extension?.version === expectedExtension.version;
}

function printInstructions({ browser, host, port, relayStarted, initialHealth, expectedExtension }) {
  console.log(`Browser Swarm real-browser setup

Browser: ${browser.label}
Relay:   http://${host}:${port}
Status:  ${initialHealth ? JSON.stringify(initialHealth) : "starting"}
${relayStarted ? `Relay log: ${relayStarted.logPath}` : ""}
Expected extension: ${expectedExtension.name} ${expectedExtension.version}
Expected worker:    ${expectedExtension.serviceWorker}

Extension path:
${extensionDir}

In ${browser.label}:
1. Enable Developer Mode if it is not already enabled.
2. Click "Load unpacked".
3. Select the extension path above.
4. Leave this terminal running until it reports extensionConnected: true.
`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    usage();
    return;
  }
  if (!existsSync(extensionDir)) {
    throw new Error(`Missing extension directory: ${extensionDir}`);
  }
  const expectedExtension = readExpectedExtension();
  const browserKey = opts.browser.toLowerCase();
  const browserTemplate = BROWSERS[browserKey];
  if (!browserTemplate) {
    throw new Error(`Unknown browser: ${opts.browser}. Supported: ${Object.keys(BROWSERS).join(", ")}`);
  }
  const browser = { ...browserTemplate };
  if (opts.extensionsUrl) browser.extensionsUrl = opts.extensionsUrl;

  let initialHealth = await tryHealth(opts.host, opts.port);
  let relayStarted = null;
  if (!initialHealth && opts.startRelay) {
    relayStarted = startRelay(opts);
    initialHealth = await waitForRelay(opts.host, opts.port);
  } else if (!initialHealth) {
    throw new Error(`Relay is not running on http://${opts.host}:${opts.port}`);
  }

  printInstructions({ browser, host: opts.host, port: opts.port, relayStarted, initialHealth, expectedExtension });

  let openResult = null;
  if (opts.open) {
    openResult = await openBrowser(browser);
    console.log(`Opened extensions page: ${JSON.stringify(openResult)}\n`);
  }

  let finalHealth = initialHealth;
  if (opts.wait) {
    finalHealth = await waitForExtension(opts.host, opts.port, opts.timeoutSeconds * 1000);
    if (finalHealth.extensionConnected) {
      console.log(`Connected: ${JSON.stringify(finalHealth, null, 2)}`);
      if (!extensionVersionMatches(finalHealth, expectedExtension)) {
        console.error(`Stale extension worker detected: connected version ${finalHealth.extension?.version || "unknown"} does not match unpacked manifest version ${expectedExtension.version}. Reload Browser Swarm Bridge in the browser extension manager. If it still reports the old version, restart the browser to force the MV3 service worker registration to refresh.`);
        process.exitCode = 3;
      }
    } else {
      console.log(`Not connected yet: ${JSON.stringify(finalHealth, null, 2)}`);
      process.exitCode = 2;
    }
  }

  if (opts.json) {
    console.log(JSON.stringify({
      browser: browserKey,
      extensionDir,
      relayStarted,
      openResult,
      expectedExtension,
      health: finalHealth,
      versionMatches: extensionVersionMatches(finalHealth, expectedExtension),
    }, null, 2));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
