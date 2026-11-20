#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import {
  chmod,
  mkdir,
  open as openFile,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer, request as httpRequest } from "node:http";
import { homedir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SKILL_DIR = path.dirname(path.dirname(SCRIPT_PATH));
const TEMPLATE_PATH = path.join(SKILL_DIR, "assets", "viewer.html");
const ROOT_DIR = path.join(homedir(), ".price-intelligence");
const CURRENT_PATH = path.join(ROOT_DIR, "current.json");
const START_LOCK_PATH = path.join(ROOT_DIR, "start.lock");
const CANCEL_PATH = path.join(ROOT_DIR, "cancel.json");
const MPP_CREATE_URL = "https://mpp.browserbase.com/browser/session/create";
const MPP_SESSION_URL = "https://mpp.browserbase.com/browser/session";
const DEFAULT_VENDORS = [
  { key: "amazon", label: "Amazon", domains: ["amazon.com"] },
  { key: "target", label: "Target", domains: ["target.com"] },
  { key: "walmart", label: "Walmart", domains: ["walmart.com"] },
  { key: "bestbuy", label: "Best Buy", domains: ["bestbuy.com"] },
  { key: "ebay", label: "eBay", domains: ["ebay.com"] },
];
const AVAILABILITIES = new Set([
  "in_stock",
  "out_of_stock",
  "backordered",
  "blocked",
  "unknown",
]);
const CONDITIONS = new Set(["new", "used", "refurbished", "unknown"]);

function parseArgs(argv) {
  const parsed = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      parsed._.push(value);
      continue;
    }
    const equals = value.indexOf("=");
    if (equals > 2) {
      parsed[value.slice(2, equals)] = value.slice(equals + 1);
      continue;
    }
    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function requireText(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function requireString(value, label, maximumLength = 1000, allowEmpty = false) {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  const normalized = value.trim();
  if (!allowEmpty && !normalized) throw new Error(`${label} is required`);
  if (value.length > maximumLength) {
    throw new Error(`${label} must be at most ${maximumLength} characters`);
  }
  return value;
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32) || "item";
}

function sanitize(value) {
  return String(value || "")
    .replaceAll(homedir(), "<home>")
    .replace(/wss?:\/\/\S+/gi, "<redacted-connect-url>")
    .replace(
      /https:\/\/mpp\.browserbase\.com\/browser\/session\/\S+/gi,
      "<redacted-mpp-session-url>",
    )
    .replace(/https?:\/\/\S*(?:debug|devtools|authToken|token)\S*/gi, "<redacted-live-url>")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, "<redacted-session-id>")
    .slice(0, 900);
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} did not return valid JSON`);
  }
}

async function readStdinObject(label) {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  const input = Buffer.concat(chunks).toString("utf8");
  if (!input.trim()) throw new Error(`${label} JSON is required on stdin`);
  const value = parseJson(input, label);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value;
}

function httpsUrl(value, label, allowEmpty = false) {
  const text = requireString(value, label, 2048, allowEmpty).trim();
  if (!text && allowEmpty) return "";
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error(`${label} must be a valid HTTPS URL`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error(`${label} must be an HTTPS URL without embedded credentials`);
  }
  return parsed.href;
}

function vendorForKey(key) {
  const vendor = DEFAULT_VENDORS.find((candidate) => candidate.key === key);
  if (!vendor) throw new Error("The assigned retailer is not configured");
  return vendor;
}

function retailerUrl(value, vendorKey, label, allowEmpty = false) {
  const url = httpsUrl(value, label, allowEmpty);
  if (!url && allowEmpty) return "";
  const hostname = new URL(url).hostname.toLowerCase().replace(/\.$/, "");
  const vendor = vendorForKey(vendorKey);
  if (!vendor.domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
    throw new Error(`${label} must stay on the assigned ${vendor.label} domain`);
  }
  return url;
}

async function atomicWrite(filePath, value, mode = 0o600) {
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, value, { mode });
  await rename(temporary, filePath);
  await chmod(filePath, mode);
}

async function writeJson(filePath, value) {
  await atomicWrite(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function readJson(filePath) {
  return parseJson(await readFile(filePath, "utf8"), filePath);
}

function childEnvironment(extra = {}) {
  const exactKeys = new Set([
    "path",
    "home",
    "user",
    "logname",
    "tmpdir",
    "tmp",
    "temp",
    "shell",
    "term",
    "lang",
    "xdg_config_home",
    "xdg_data_home",
    "xdg_cache_home",
    "ssl_cert_file",
    "ssl_cert_dir",
    "node_extra_ca_certs",
    "http_proxy",
    "https_proxy",
    "no_proxy",
    "systemroot",
    "windir",
    "comspec",
    "userprofile",
    "appdata",
    "localappdata",
    "pathext",
  ]);
  const allowedPrefixes = ["lc_", "browserbase_", "tempo_", "bb_"];
  const selected = {};
  for (const [key, value] of Object.entries(process.env)) {
    const normalizedKey = key.toLowerCase();
    if (
      exactKeys.has(normalizedKey) ||
      allowedPrefixes.some((prefix) => normalizedKey.startsWith(prefix))
    ) {
      selected[key] = value;
    }
  }
  return { ...selected, ...extra };
}

function launcherEnvironment() {
  const allowed = new Set([
    "path",
    "home",
    "user",
    "logname",
    "tmpdir",
    "tmp",
    "temp",
    "shell",
    "term",
    "lang",
    "display",
    "wayland_display",
    "xauthority",
    "dbus_session_bus_address",
    "xdg_runtime_dir",
    "desktop_session",
    "systemroot",
    "windir",
    "comspec",
    "userprofile",
    "appdata",
    "localappdata",
    "pathext",
  ]);
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) =>
      allowed.has(key.toLowerCase()) || key.toLowerCase().startsWith("lc_"),
    ),
  );
}

async function runCommand(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      cwd: options.cwd,
      env: childEnvironment(options.env),
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const result = {
        code: code ?? 1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };
      if (result.code !== 0 && !options.allowFailure) {
        reject(new Error(`${file} exited ${result.code}; sensitive subprocess output was suppressed`));
      } else {
        resolve(result);
      }
    });
  });
}

function tempoBin() {
  return process.env.TEMPO_BIN || "tempo";
}

function browseBin() {
  return process.env.BROWSE_BIN || "browse";
}

function vendorList(count) {
  if (DEFAULT_VENDORS.length < count) {
    throw new Error(`Only ${DEFAULT_VENDORS.length} vendors are configured for ${count} sessions`);
  }
  return DEFAULT_VENDORS.slice(0, count);
}

function extractBrowserbaseId(liveUrl) {
  const match = String(liveUrl).match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
  );
  return match?.[0] || null;
}

function splashPage(item, vendor, slot) {
  const safeItem = String(item)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
  const safeVendor = String(vendor)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#f8fafc;color:#000;font:16px "IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace;display:grid;place-items:center;height:100vh;overflow:hidden}.panel{width:80%;border:1px solid #5a78af;background:#fff;box-shadow:10px 10px 0 #c5d3e8;padding:28px}.eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:-.01em;color:#5a78af}.dot{width:11px;height:11px;border-radius:50%;background:#ff4500;display:inline-block;animation:pulse .8s infinite alternate}.vendor{font:600 42px/1.05 "Work Sans",Arial,sans-serif;letter-spacing:-.02em;margin:14px 0}.query{border-top:1px solid #c5d3e8;padding-top:14px;color:#000}.scan{height:4px;margin-top:24px;background:linear-gradient(90deg,transparent,#ff4500,transparent);animation:scan 1.4s infinite linear}@keyframes pulse{to{transform:scale(1.7);opacity:.45}}@keyframes scan{from{transform:translateX(-70%)}to{transform:translateX(70%)}}</style></head><body><main class="panel"><div class="eyebrow"><span class="dot"></span>&nbsp; browser ${slot} ready</div><div class="vendor">${safeVendor}</div><div class="query">Waiting to search: ${safeItem}</div><div class="scan"></div></main></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

async function walletPreflight(count, perSessionCap) {
  const result = await runCommand(tempoBin(), ["wallet", "whoami", "--format", "json"]);
  const wallet = parseJson(result.stdout, "Tempo wallet status");
  if (!wallet.ready) throw new Error("Tempo wallet is not ready; run tempo wallet login first");
  const available = Number(wallet.balance?.available);
  const required = count * perSessionCap;
  if (!Number.isFinite(available)) throw new Error("Tempo wallet did not report an available balance");
  if (available < required + 0.01) {
    throw new Error(
      `Tempo wallet has insufficient available balance for the ${(required + 0.01).toFixed(2)} required cap and fee buffer`,
    );
  }
  return { available, symbol: wallet.balance?.symbol || "USDC.e" };
}

async function purchaseSession({ runDir, slot, minutes, perSessionCap }) {
  const bodyPath = path.join(runDir, `.mpp-response-${slot}.json`);
  const metaPath = path.join(runDir, `.mpp-meta-${slot}.json`);
  await runCommand(
    tempoBin(),
    [
      "request",
      "-j",
      "--max-spend",
      perSessionCap.toFixed(2),
      "-X",
      "POST",
      "--json",
      JSON.stringify({ estimatedMinutes: minutes }),
      "--output",
      bodyPath,
      "--write-meta",
      metaPath,
      MPP_CREATE_URL,
    ],
    { allowFailure: true },
  );
  let payload = null;
  if (existsSync(bodyPath)) {
    const body = await readFile(bodyPath, "utf8");
    if (body.trim()) {
      try {
        payload = JSON.parse(body);
      } catch {
        payload = null;
      }
    }
  }
  if (!payload) {
    throw new Error(`MPP purchase failed for slot ${slot}; sensitive response output was suppressed`);
  }
  const gatewaySessionId = requireText(payload.sessionId, "MPP sessionId");
  const connectUrl = String(payload.connectUrl || "").trim() || null;
  const liveViewUrl = String(payload.liveUrl || "").trim() || "about:blank";
  return {
    gatewaySessionId,
    connectUrl,
    browserbaseSessionId: extractBrowserbaseId(liveViewUrl),
    liveViewUrl,
    paidMinutes: Number(payload.paidMinutes || minutes),
  };
}

async function removePaymentArtifacts(runDir, slot) {
  await rm(path.join(runDir, `.mpp-response-${slot}.json`), { force: true });
  await rm(path.join(runDir, `.mpp-meta-${slot}.json`), { force: true });
}

async function quarantinePaymentArtifacts(runDir, slot) {
  const quarantineDir = path.join(runDir, "unresolved");
  await mkdir(quarantineDir, { recursive: true, mode: 0o700 });
  await chmod(quarantineDir, 0o700).catch(() => {});
  const suffix = Date.now();
  for (const kind of ["response", "meta"]) {
    const source = path.join(runDir, `.mpp-${kind}-${slot}.json`);
    if (!existsSync(source)) continue;
    const destination = path.join(quarantineDir, `mpp-${kind}-${slot}-${suffix}.json`);
    await rename(source, destination);
    await chmod(destination, 0o600);
  }
}

async function recoverPaymentArtifacts(runDir, state) {
  const entries = await readdir(runDir).catch(() => []);
  const responseFiles = entries.filter((entry) => /^\.mpp-response-\d+\.json$/.test(entry));
  const recoveredSlots = [];
  const unrecoveredSlots = [];
  const vendors = vendorList(Number(state.count || DEFAULT_VENDORS.length));
  for (const entry of responseFiles) {
    const slot = Number(entry.match(/\d+/)?.[0]);
    state.sessions ||= [];
    const existing = state.sessions.find((session) => session.slot === slot);
    let payload;
    try {
      payload = await readJson(path.join(runDir, entry));
    } catch {
      (existing?.gatewaySessionId ? recoveredSlots : unrecoveredSlots).push(slot);
      continue;
    }
    const gatewaySessionId = String(payload.sessionId || "").trim();
    if (!gatewaySessionId) {
      (existing?.gatewaySessionId ? recoveredSlots : unrecoveredSlots).push(slot);
      continue;
    }
    const vendor = vendors[slot - 1] || { key: `slot-${slot}`, label: `Slot ${slot}` };
    if (existing) {
      existing.gatewaySessionId ||= gatewaySessionId;
    } else {
      state.sessions.push({
        slot,
        vendor: vendor.label,
        vendorKey: vendor.key,
        browseSession: `price-intel-${vendor.key}`,
        gatewaySessionId,
        browserStatus: "payment_recovered",
      });
    }
    recoveredSlots.push(slot);
  }
  state.sessions.sort((left, right) => left.slot - right.slot);
  return { recoveredSlots, unrecoveredSlots };
}

async function writeState(runDir, state, setCurrent = true) {
  await writeJson(path.join(runDir, "run.json"), state);
  if (setCurrent) await writeJson(CURRENT_PATH, { runDir });
}

async function resolveRun(value) {
  if (value && value !== "current") return path.resolve(value);
  if (!existsSync(CURRENT_PATH)) throw new Error("No current price-intelligence run exists");
  return path.resolve((await readJson(CURRENT_PATH)).runDir);
}

async function assertNoActiveRun() {
  if (!existsSync(CURRENT_PATH)) return;
  const current = await readJson(CURRENT_PATH);
  const runDir = path.resolve(current.runDir);
  const statePath = path.join(runDir, "run.json");
  if (!existsSync(statePath)) return;
  const state = await readJson(statePath);
  if (!["stopped", "stopped_with_warning", "self-test"].includes(state.status)) {
    throw new Error(
      "An active price-intelligence run already exists; inspect it with status and stop it before starting another",
    );
  }
}

function processIsRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== "ESRCH";
  }
}

async function acquireLifecycleLock({ cancelActive = false, allowStaleRetry = true } = {}) {
  await mkdir(ROOT_DIR, { recursive: true, mode: 0o700 });
  await chmod(ROOT_DIR, 0o700).catch(() => {});
  try {
    const handle = await openFile(START_LOCK_PATH, "wx", 0o600);
    const nonce = randomBytes(24).toString("base64url");
    try {
      await handle.writeFile(`${JSON.stringify({ pid: process.pid, nonce })}\n`);
      await rm(CANCEL_PATH, { force: true });
    } catch (error) {
      await handle.close().catch(() => {});
      await rm(START_LOCK_PATH, { force: true });
      throw error;
    }
    return { handle, nonce };
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    let owner = null;
    try {
      owner = await readJson(START_LOCK_PATH);
    } catch {
      throw new Error("Another price-intelligence lifecycle operation is acquiring the lock");
    }
    const ownerRunning = processIsRunning(Number(owner.pid));
    if (ownerRunning && cancelActive) {
      if (typeof owner.nonce !== "string" || !owner.nonce) {
        throw new Error("Cannot safely cancel the active price-intelligence start");
      }
      await writeJson(CANCEL_PATH, { nonce: owner.nonce });
      for (let attempt = 0; attempt < 600; attempt += 1) {
        if (!existsSync(START_LOCK_PATH)) return acquireLifecycleLock();
        const observed = await readJson(START_LOCK_PATH).catch(() => null);
        if (!observed || observed.nonce !== owner.nonce) {
          throw new Error("The lifecycle lock changed while cancellation was pending");
        }
        if (!processIsRunning(Number(owner.pid))) {
          await rm(START_LOCK_PATH, { force: true });
          return acquireLifecycleLock();
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error("Timed out waiting for the active start to cancel safely");
    }
    if (ownerRunning || !allowStaleRetry) {
      throw new Error("Another price-intelligence lifecycle operation is already in progress");
    }
    await rm(START_LOCK_PATH, { force: true });
    return acquireLifecycleLock({ cancelActive, allowStaleRetry: false });
  }
}

async function startWasCancelled(lock) {
  if (!existsSync(CANCEL_PATH)) return false;
  const request = await readJson(CANCEL_PATH).catch(() => null);
  return request?.nonce === lock.nonce;
}

async function assertStartNotCancelled(lock) {
  if (await startWasCancelled(lock)) throw new Error("Start cancelled by cleanup request");
}

async function releaseLifecycleLock(lock) {
  await lock.handle.close().catch(() => {});
  const owner = await readJson(START_LOCK_PATH).catch(() => null);
  if (owner?.nonce === lock.nonce) await rm(START_LOCK_PATH, { force: true });
  await rm(CANCEL_PATH, { force: true });
}

function openViewer(viewerUrl) {
  let command;
  let args;
  if (process.platform === "darwin") {
    command = "open";
    args = [viewerUrl];
  } else if (process.platform === "win32") {
    command = "cmd";
    args = ["/c", "start", "", viewerUrl];
  } else {
    command = "xdg-open";
    args = [viewerUrl];
  }
  const opener = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: launcherEnvironment(),
  });
  opener.on("error", () => {});
  opener.unref();
}

async function startServer(runDir, noOpen) {
  const logPath = path.join(runDir, "viewer.log");
  const log = await openFile(logPath, "a", 0o600);
  const child = spawn(process.execPath, [SCRIPT_PATH, "serve", "--run", runDir, "--port", "0"], {
    detached: true,
    stdio: ["ignore", log.fd, log.fd],
    env: childEnvironment(),
  });
  child.unref();
  await log.close();
  const serverPath = path.join(runDir, "server.json");
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (existsSync(serverPath)) {
      const info = await readJson(serverPath);
      const viewerUrl = `http://127.0.0.1:${info.port}/${info.token}/`;
      if (!noOpen) openViewer(viewerUrl);
      return { ...info, viewerUrl };
    }
    if (child.exitCode !== null) throw new Error("Live-view server exited during startup");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for live-view server startup");
}

async function deleteMppSession(gatewaySessionId) {
  if (!gatewaySessionId) return { code: 1, stdout: "", stderr: "missing session id" };
  const nullDevice = process.platform === "win32" ? "NUL" : "/dev/null";
  return runCommand(
    tempoBin(),
    ["request", "-t", "-X", "DELETE", "--output", nullDevice, `${MPP_SESSION_URL}/${gatewaySessionId}`],
    { allowFailure: true },
  );
}

async function stopOwnedViewer(serverInfo) {
  if (!serverInfo?.pid) return { complete: true, stopped: false };
  if (!processIsRunning(Number(serverInfo.pid))) return { complete: true, stopped: false };
  if (!Number.isInteger(serverInfo.port) || typeof serverInfo.token !== "string") {
    return { complete: false, stopped: false };
  }
  try {
    const health = await fetch(
      `http://127.0.0.1:${serverInfo.port}/${serverInfo.token}/health`,
      { signal: AbortSignal.timeout(1000) },
    ).then((response) => response.json());
    if (health?.ok !== true || Number(health.pid) !== Number(serverInfo.pid)) {
      return { complete: false, stopped: false };
    }
    process.kill(serverInfo.pid, "SIGTERM");
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (!processIsRunning(Number(serverInfo.pid))) return { complete: true, stopped: true };
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return { complete: false, stopped: false };
  } catch {
    return { complete: false, stopped: false };
  }
}

async function cleanupState(runDir, state, quiet = false, setCurrent = true) {
  let browseStopped = 0;
  let mppDeleted = 0;
  const recovered = await recoverPaymentArtifacts(runDir, state);
  const sessions = state.sessions || [];
  const stoppedSessions = await Promise.all(
    sessions
      .filter((session) => session.browseSession)
      .map((session) =>
        runCommand(
          browseBin(),
          ["stop", "--session", session.browseSession, "--force"],
          { allowFailure: true },
        ).catch(() => ({ code: 1, stdout: "", stderr: "browse stop failed" })),
      ),
  );
  browseStopped = stoppedSessions.filter((result) => result.code === 0).length;
  const deletionResults = new Map();
  for (const session of sessions) {
    if (!session.gatewaySessionId) continue;
    const deleted = await deleteMppSession(session.gatewaySessionId).catch(() => ({
      code: 1,
      stdout: "",
      stderr: "MPP deletion failed",
    }));
    deletionResults.set(session.slot, deleted.code === 0);
    if (deleted.code === 0) mppDeleted += 1;
  }
  const viewerCleanup = await stopOwnedViewer(state.server);
  state.sessions = sessions.map((session) => {
    const {
      gatewaySessionId,
      connectUrl,
      browserbaseSessionId,
      liveViewUrl,
      ...safeSession
    } = session;
    const deletionSucceeded = !gatewaySessionId || deletionResults.get(session.slot) === true;
    return {
      ...safeSession,
      ...(deletionSucceeded ? {} : { gatewaySessionId }),
      mppStatus: deletionSucceeded ? "deleted" : "delete_failed",
      capabilitiesScrubbed: true,
    };
  });
  state.server = viewerCleanup.complete ? null : state.server;
  if (viewerCleanup.complete) await rm(path.join(runDir, "server.json"), { force: true });
  const unresolvedPaymentSlots = new Set([
    ...(state.unresolvedPaymentSlots || []),
    ...recovered.unrecoveredSlots,
  ]);
  for (const slot of recovered.unrecoveredSlots) {
    await quarantinePaymentArtifacts(runDir, slot);
  }
  state.unresolvedPaymentSlots = [...unresolvedPaymentSlots].sort((left, right) => left - right);
  const failedSlots = new Set([
    ...state.sessions
      .filter((session) => session.mppStatus === "delete_failed")
      .map((session) => session.slot),
  ]);
  const failedCleanupItems = failedSlots.size + (viewerCleanup.complete ? 0 : 1);
  state.status = failedCleanupItems > 0
    ? "cleanup_failed"
    : unresolvedPaymentSlots.size > 0
      ? "stopped_with_warning"
      : "stopped";
  state.cleanupAttemptedAt = new Date().toISOString();
  if (["stopped", "stopped_with_warning"].includes(state.status)) {
    state.stoppedAt = state.cleanupAttemptedAt;
  }
  await writeState(runDir, state, setCurrent);
  for (const session of sessions) {
    if (!failedSlots.has(session.slot) && !unresolvedPaymentSlots.has(session.slot)) {
      await removePaymentArtifacts(runDir, session.slot);
    }
  }
  if (!quiet) {
    console.log(
      `Stopped ${browseStopped}/${sessions.length} Browse daemons; deleted ${mppDeleted} MPP sessions; ${viewerCleanup.complete ? "completed" : "could not verify"} localhost viewer cleanup.`,
    );
    if (failedCleanupItems > 0) {
      console.log(
        `Cleanup incomplete: ${failedCleanupItems} cleanup item(s) must be retried with stop --run current.`,
      );
    }
    if (unresolvedPaymentSlots.size > 0) {
      console.log(
        `Cleanup warning: ${unresolvedPaymentSlots.size} malformed payment response(s) were retained privately for diagnosis; no session identifier was available, and future runs remain available.`,
      );
    }
  }
  return {
    browseStopped,
    mppDeleted,
    failedCleanupItems,
    unresolvedPayments: unresolvedPaymentSlots.size,
  };
}

async function commandStartLocked(args, lock) {
  const input = await readStdinObject("start request");
  const item = requireString(input.item, "item", 500).trim();
  const count = Number(args.count || 5);
  const minutes = Number(args.minutes || 10);
  if (!Number.isInteger(count) || count < 1 || count > DEFAULT_VENDORS.length) {
    throw new Error(`count must be an integer from 1 to ${DEFAULT_VENDORS.length}`);
  }
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 10) {
    throw new Error("minutes must be an integer from 5 to 10");
  }
  await assertNoActiveRun();
  await assertStartNotCancelled(lock);
  const vendors = vendorList(count);
  const perSessionCap = Number((Math.ceil(minutes * 0.2) / 100).toFixed(2));
  await walletPreflight(count, perSessionCap);
  await assertStartNotCancelled(lock);

  await mkdir(path.join(ROOT_DIR, "runs"), { recursive: true, mode: 0o700 });
  await chmod(ROOT_DIR, 0o700).catch(() => {});
  const runKey = `${new Date().toISOString().replace(/[:.]/g, "-")}-${slug(item)}`;
  const runDir = path.join(ROOT_DIR, "runs", runKey);
  await mkdir(path.join(runDir, "results"), { recursive: true, mode: 0o700 });
  await chmod(runDir, 0o700);

  const state = {
    version: 2,
    status: "paying",
    item,
    createdAt: new Date().toISOString(),
    minutes,
    count,
    perSessionCap,
    sessions: [],
  };
  await writeState(runDir, state);
  console.log(`Price Intelligence: ${item}`);
  console.log(`[payments] Starting ${count} paid browser sessions sequentially…`);

  try {
    const paymentsStartedAt = Date.now();
    for (let index = 0; index < vendors.length; index += 1) {
      await assertStartNotCancelled(lock);
      const slot = index + 1;
      const vendor = vendors[index];
      const paymentStartedAt = Date.now();
      console.log(`[payment ${slot}/${count}] ${vendor.label}: requesting ${minutes}-minute session…`);
      const paid = await purchaseSession({ runDir, slot, minutes, perSessionCap });
      const browseSession = `price-intel-${vendor.key}`;
      state.sessions.push({
        slot,
        vendor: vendor.label,
        vendorKey: vendor.key,
        browseSession,
        gatewaySessionId: paid.gatewaySessionId,
        connectUrl: paid.connectUrl,
        browserbaseSessionId: paid.browserbaseSessionId,
        liveViewUrl: paid.liveViewUrl,
        paidMinutes: paid.paidMinutes,
        browserStatus: "paid",
      });
      await writeState(runDir, state);
      await assertStartNotCancelled(lock);
      await removePaymentArtifacts(runDir, slot);
      const paymentSeconds = ((Date.now() - paymentStartedAt) / 1000).toFixed(1);
      console.log(`[payment ${slot}/${count}] ${vendor.label}: confirmed in ${paymentSeconds}s`);
    }

    await assertStartNotCancelled(lock);
    const paymentSeconds = ((Date.now() - paymentsStartedAt) / 1000).toFixed(1);
    state.status = "attaching";
    state.paymentsCompletedAt = new Date().toISOString();
    await writeState(runDir, state);
    console.log(`[payments] Complete: ${count}/${count} sessions paid in ${paymentSeconds}s`);
    console.log(`[browsers] Attaching ${count} isolated Browse sessions in parallel…`);

    const attachmentResults = await Promise.allSettled(
      state.sessions.map(async (session) => {
        await assertStartNotCancelled(lock);
        const connectUrl = requireText(session.connectUrl, `MPP connectUrl for ${session.vendor}`);
        await runCommand(
          browseBin(),
          ["stop", "--session", session.browseSession, "--force"],
          { allowFailure: true },
        );
        await runCommand(browseBin(), [
          "open",
          splashPage(item, session.vendor, session.slot),
          "--cdp",
          connectUrl,
          "--session",
          session.browseSession,
          "--timeout",
          "45000",
        ]);
        await assertStartNotCancelled(lock);
        console.log(`[browser ${session.slot}/${count}] ${session.vendor}: attached`);
        return { ...session, browserStatus: "ready" };
      }),
    );
    const attachmentFailure = attachmentResults.find((result) => result.status === "rejected");
    if (attachmentFailure) {
      throw new Error("One or more Browse sessions failed to attach; details were suppressed");
    }
    const attached = attachmentResults.map((result) => result.value);
    state.sessions = attached.sort((left, right) => left.slot - right.slot);
    state.status = "searching";
    await assertStartNotCancelled(lock);
    state.server = await startServer(runDir, Boolean(args["no-open"]));
    await writeState(runDir, state);
    console.log(`[viewer] Opened after all ${count} payments completed`);
    console.log(`Live comparison: ${state.server.viewerUrl}`);
    console.log(`Watching ${count} vendors. Results will appear below as they are found.`);
  } catch (error) {
    console.error(`Startup failed: ${sanitize(error.message)}`);
    const cleanup = await cleanupState(runDir, state, true, false);
    if (cleanup.failedCleanupItems > 0) {
      console.error(
        `Cleanup incomplete: ${cleanup.failedCleanupItems} paid-session cleanup item(s) require stop --run current.`,
      );
    }
    if (cleanup.unresolvedPayments > 0) {
      console.error(
        `Cleanup warning: ${cleanup.unresolvedPayments} malformed payment response(s) were retained privately without blocking future runs.`,
      );
    }
    throw error;
  }
}

async function commandStart(args) {
  const lock = await acquireLifecycleLock();
  try {
    return await commandStartLocked(args, lock);
  } finally {
    await releaseLifecycleLock(lock);
  }
}

async function resultForSlot(runDir, slot) {
  const resultPath = path.join(runDir, "results", `${slot}.json`);
  return existsSync(resultPath) ? readJson(resultPath) : null;
}

function isRecommendationEligible(result) {
  if (!(
    result?.eligible === true &&
    result?.exactMatch === true &&
    result?.availability === "in_stock" &&
    result?.currency === "USD" &&
    Number.isFinite(result?.price) &&
    typeof result?.url === "string" &&
    typeof result?.vendorKey === "string"
  )) return false;
  try {
    return retailerUrl(result.url, result.vendorKey, "recommendation URL") === result.url;
  } catch {
    return false;
  }
}

async function publicRunState(runDir, includeLiveViews = false) {
  const state = await readJson(path.join(runDir, "run.json"));
  const sessions = await Promise.all(
    state.sessions.map(async (session) => ({
      slot: session.slot,
      vendor: session.vendor,
      ...(includeLiveViews ? { liveViewUrl: session.liveViewUrl } : {}),
      result: await resultForSlot(runDir, session.slot),
    })),
  );
  const eligible = sessions
    .map((session) => session.result)
    .filter(isRecommendationEligible);
  eligible.sort((a, b) => a.price - b.price || a.slot - b.slot);
  return {
    item: state.item,
    status: state.status,
    sessions,
    recommendation: eligible[0] || null,
  };
}

async function commandServe(args) {
  const runDir = await resolveRun(requireText(args.run, "run"));
  const token = randomBytes(24).toString("base64url");
  const basePath = `/${token}`;
  const template = await readFile(TEMPLATE_PATH, "utf8");
  const initial = await publicRunState(runDir, true);
  const bootstrap = JSON.stringify({ item: initial.item, sessions: initial.sessions }).replaceAll("<", "\\u003c");
  const html = template
    .replace("__BOOTSTRAP_JSON__", bootstrap)
    .replace("__STATE_PATH_JSON__", JSON.stringify(`${basePath}/api/state`));
  let boundPort = null;
  const server = createServer(async (request, response) => {
    const allowedHost = `127.0.0.1:${boundPort}`;
    if (request.headers.host !== allowedHost) {
      response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      response.end("Forbidden");
      return;
    }
    const url = new URL(request.url || "/", "http://127.0.0.1");
    const commonHeaders = {
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "permissions-policy": "camera=(), microphone=(), geolocation=()",
    };
    if (url.pathname === `${basePath}/` || url.pathname === basePath) {
      response.writeHead(200, {
        ...commonHeaders,
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": "default-src 'none'; frame-src https:; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'",
      });
      response.end(html);
      return;
    }
    if (url.pathname === `${basePath}/api/state`) {
      response.writeHead(200, { ...commonHeaders, "content-type": "application/json" });
      response.end(JSON.stringify(await publicRunState(runDir)));
      return;
    }
    if (url.pathname === `${basePath}/health`) {
      response.writeHead(200, { ...commonHeaders, "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true, pid: process.pid }));
      return;
    }
    response.writeHead(404, { ...commonHeaders, "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  });
  const requestedPort = Number(args.port || 0);
  await new Promise((resolve) => server.listen(requestedPort, "127.0.0.1", resolve));
  const address = server.address();
  boundPort = address.port;
  await writeJson(path.join(runDir, "server.json"), { pid: process.pid, port: boundPort, token });
  const close = () => server.close(() => process.exit(0));
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
}

async function commandBrowse(args) {
  const input = await readStdinObject("browse request");
  const runDir = await resolveRun(args.run);
  const state = await readJson(path.join(runDir, "run.json"));
  if (!["searching", "attaching"].includes(state.status)) {
    throw new Error("The paid browser run is not active");
  }
  const sessionName = requireString(input.session, "session", 80).trim();
  const assignedSession = state.sessions.find((session) => session.browseSession === sessionName);
  if (!assignedSession) {
    throw new Error("The requested Browse session is not part of the current run");
  }
  const action = requireString(input.action, "action", 20).trim();
  let browseArgs;
  if (action === "open") {
    const url = retailerUrl(input.url, assignedSession.vendorKey, "url");
    browseArgs = ["open", "--session", sessionName, "--timeout", "45000", "--", url];
  } else if (action === "fill") {
    const selector = requireString(input.selector, "selector", 500).trim();
    const value = requireString(input.value, "value", 1000, true);
    browseArgs = [
      "fill",
      "--session",
      sessionName,
      ...(input.pressEnter === true ? ["--press-enter"] : []),
      "--",
      selector,
      value,
    ];
  } else {
    throw new Error("action must be open or fill");
  }
  await runCommand(browseBin(), browseArgs);
  console.log(JSON.stringify(
    action === "open"
      ? { opened: true, retailer: assignedSession.vendor }
      : { filled: true, pressedEnter: input.pressEnter === true },
  ));
}

async function commandRecord(args) {
  const input = await readStdinObject("record request");
  const runDir = await resolveRun(args.run);
  const state = await readJson(path.join(runDir, "run.json"));
  const slot = Number(input.slot);
  if (!Number.isInteger(slot)) throw new Error("slot must be an integer");
  const session = state.sessions.find((candidate) => candidate.slot === slot);
  if (!session) throw new Error(`No session exists for slot ${slot}`);
  const price = input.price === null ? null : Number(input.price);
  if (price !== null && (!Number.isFinite(price) || price < 0)) {
    throw new Error("price must be a non-negative number or null");
  }
  const currency = requireString(input.currency, "currency", 3).toUpperCase();
  if (currency !== "USD") throw new Error("currency must be USD");
  const availability = requireString(input.availability, "availability", 30).trim();
  if (!AVAILABILITIES.has(availability)) throw new Error("availability is invalid");
  const condition = requireString(input.condition, "condition", 20).trim();
  if (!CONDITIONS.has(condition)) throw new Error("condition is invalid");
  if (typeof input.exactMatch !== "boolean") throw new Error("exactMatch must be a boolean");
  if (typeof input.eligible !== "boolean") throw new Error("eligible must be a boolean");
  const url = retailerUrl(input.url, session.vendorKey, "url", true);
  if (input.eligible && (!input.exactMatch || availability !== "in_stock" || price === null || !url)) {
    throw new Error("eligible results must be exact, in stock, priced, and have a direct HTTPS URL");
  }
  const result = {
    slot,
    vendor: session.vendor,
    vendorKey: session.vendorKey,
    item: state.item,
    price,
    currency,
    availability,
    exactMatch: input.exactMatch,
    eligible: input.eligible,
    url,
    title: requireString(input.title, "title", 500, true),
    seller: requireString(input.seller, "seller", 300, true),
    condition,
    evidence: requireString(input.evidence, "evidence", 1000, true),
    error: requireString(input.error, "error", 500, true),
    recordedAt: new Date().toISOString(),
  };
  await writeJson(path.join(runDir, "results", `${slot}.json`), result);
  console.log(`Recorded ${session.vendor}: ${price === null ? "no price" : `${result.currency} ${price.toFixed(2)}`}`);
}

function money(result) {
  if (!Number.isFinite(result?.price)) return "—";
  return `${result.currency === "USD" ? "$" : `${result.currency} `}${result.price.toFixed(2)}`;
}

function table(rows) {
  const headers = ["Site", "Price", "Availability", "Exact", "Eligible", "Product link"];
  const values = rows.map((row) => [
    row.vendor,
    money(row),
    row.availability || "unknown",
    row.exactMatch ? "yes" : "no",
    row.eligible ? "yes" : "no",
    row.url || "—",
  ]);
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...values.map((row) => String(row[index]).length)),
  );
  const render = (row) => row.map((value, index) => String(value).padEnd(widths[index])).join(" | ");
  return [render(headers), widths.map((width) => "-".repeat(width)).join("-|-"), ...values.map(render)].join("\n");
}

async function commandReportLocked(args) {
  const runDir = await resolveRun(args.run);
  const state = await readJson(path.join(runDir, "run.json"));
  const rows = [];
  let recordedResults = 0;
  for (const session of state.sessions) {
    const result = await resultForSlot(runDir, session.slot);
    if (result) recordedResults += 1;
    rows.push(result || {
      slot: session.slot,
      vendor: session.vendor,
      price: null,
      availability: "not reported",
      exactMatch: false,
      eligible: false,
      url: "",
      currency: "USD",
    });
  }
  console.log(`\nPrice intelligence: ${state.item}\n`);
  console.log(table(rows));
  const eligible = rows.filter(isRecommendationEligible);
  eligible.sort((a, b) => a.price - b.price || a.slot - b.slot);
  if (eligible.length) {
    const winner = eligible[0];
    console.log(`\nRecommended vendor: ${winner.vendor} at ${money(winner)}`);
    console.log(`Product link: ${winner.url}`);
  } else {
    console.log("\nNo exact, purchasable result was found. Do not recommend an unavailable or uncertain listing.");
  }
  if (
    state.sessions.length > 0 &&
    recordedResults === state.sessions.length &&
    !["stopped", "stopped_with_warning", "self-test"].includes(state.status)
  ) {
    console.log("\nComparison complete. Cleaning up paid browsers and viewer…");
    const cleanup = await cleanupState(runDir, state);
    if (cleanup.failedCleanupItems > 0) {
      throw new Error("Cleanup is incomplete; retry stop --run current");
    }
  } else if (recordedResults < state.sessions.length) {
    console.log(`\nRun incomplete: ${recordedResults}/${state.sessions.length} vendors reported. Resources remain active.`);
  }
}

async function commandReport(args) {
  const lock = await acquireLifecycleLock();
  try {
    return await commandReportLocked(args);
  } finally {
    await releaseLifecycleLock(lock);
  }
}

async function commandStatus(args) {
  const runDir = await resolveRun(args.run);
  const publicState = await publicRunState(runDir);
  console.log(JSON.stringify(publicState, null, 2));
}

async function commandStopLocked(args) {
  const runDir = await resolveRun(args.run);
  const state = await readJson(path.join(runDir, "run.json"));
  const cleanup = await cleanupState(runDir, state);
  if (cleanup.failedCleanupItems > 0) {
    throw new Error("Cleanup is incomplete; retry stop --run current");
  }
}

async function commandStop(args) {
  const lock = await acquireLifecycleLock({ cancelActive: true });
  try {
    return await commandStopLocked(args);
  } finally {
    await releaseLifecycleLock(lock);
  }
}

async function commandViewerLocked(args) {
  const runDir = await resolveRun(args.run);
  const state = await readJson(path.join(runDir, "run.json"));
  if (["stopped", "stopped_with_warning"].includes(state.status)) {
    throw new Error("Cannot reopen the viewer for a stopped run");
  }
  if (state.server?.pid) {
    const viewerCleanup = await stopOwnedViewer(state.server);
    if (!viewerCleanup.complete) {
      throw new Error("Refusing to signal an unverified viewer process");
    }
  }
  await rm(path.join(runDir, "server.json"), { force: true });
  state.server = await startServer(runDir, Boolean(args["no-open"]));
  await writeState(runDir, state);
  console.log(`Live comparison: ${state.server.viewerUrl}`);
}

async function commandViewer(args) {
  const lock = await acquireLifecycleLock();
  try {
    return await commandViewerLocked(args);
  } finally {
    await releaseLifecycleLock(lock);
  }
}

async function requestStatusWithHost(url, host) {
  const parsed = new URL(url);
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      hostname: parsed.hostname,
      port: parsed.port,
      path: `${parsed.pathname}${parsed.search}`,
      headers: { host },
    }, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode));
    });
    request.on("error", reject);
    request.end();
  });
}

async function commandSelfTest(args) {
  const item = requireText(args.item || "Example Product", "item");
  const testDir = path.join(ROOT_DIR, "self-test", `${Date.now()}-${slug(item)}`);
  await mkdir(path.join(testDir, "results"), { recursive: true, mode: 0o700 });
  const sessions = DEFAULT_VENDORS.map((vendor, index) => ({
    slot: index + 1,
    vendor: vendor.label,
    vendorKey: vendor.key,
    browseSession: `self-test-${vendor.key}`,
    gatewaySessionId: `self-test-${index + 1}`,
    browserbaseSessionId: `self-test-${index + 1}`,
    liveViewUrl: "about:blank",
  }));
  await writeJson(path.join(testDir, "run.json"), {
    version: 2,
    status: "self-test",
    item,
    createdAt: new Date().toISOString(),
    minutes: 10,
    count: 5,
    perSessionCap: 0.02,
    sessions,
  });
  for (const session of sessions) {
    await writeJson(path.join(testDir, "results", `${session.slot}.json`), {
      slot: session.slot,
      vendor: session.vendor,
      vendorKey: session.vendorKey,
      item,
      price: session.slot === 1 ? 499.99 : 500 + session.slot,
      currency: "USD",
      availability: session.slot === 5 ? "out_of_stock" : "in_stock",
      exactMatch: true,
      eligible: session.slot !== 5,
      url: `https://www.${vendorForKey(session.vendorKey).domains[0]}/example-product`,
    });
  }
  await commandReportLocked({ run: testDir });
  const rendered = (await readFile(TEMPLATE_PATH, "utf8")).includes("__BOOTSTRAP_JSON__");
  if (!rendered) throw new Error("Viewer template bootstrap marker is missing");
  if (isRecommendationEligible({
    eligible: true,
    exactMatch: true,
    availability: "in_stock",
    currency: "USD",
    price: 1,
    vendorKey: "amazon",
    url: "https://example.com/not-amazon",
  })) {
    throw new Error("Off-retailer recommendation URL was accepted");
  }
  const server = await startServer(testDir, true);
  try {
    const health = await fetch(`${server.viewerUrl}health`).then((response) => response.json());
    const viewer = await fetch(server.viewerUrl).then((response) => response.text());
    const reboundStatus = await requestStatusWithHost(server.viewerUrl, "attacker.example");
    if (
      !health.ok ||
      !viewer.includes(item) ||
      !viewer.includes("Price intelligence") ||
      reboundStatus !== 403
    ) {
      throw new Error(
        `Viewer smoke test failed (health=${health.ok === true}, html=${viewer.includes(item) && viewer.includes("Price intelligence")}, untrustedHostStatus=${reboundStatus})`,
      );
    }
    console.log("Viewer smoke test passed: health and HTML work, while an untrusted Host is rejected.");
  } finally {
    const viewerCleanup = await stopOwnedViewer(server);
    if (!viewerCleanup.complete) throw new Error("Self-test viewer cleanup could not verify its process");
    await rm(path.join(testDir, "server.json"), { force: true });
  }
  console.log("\nSelf-test passed.");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (!command || ["help", "--help", "-h"].includes(command)) {
    console.log(`Usage:
  controller.mjs start [--minutes 10] [--count 5]                 # JSON item on stdin
  controller.mjs browse --run current                            # JSON browser action on stdin
  controller.mjs record --run current                            # JSON result on stdin
  controller.mjs report --run current
  controller.mjs status --run current
  controller.mjs viewer --run current
  controller.mjs stop --run current
  controller.mjs self-test --item "<item>"`);
    return;
  }
  if (command === "start") return commandStart(args);
  if (command === "serve") return commandServe(args);
  if (command === "browse") return commandBrowse(args);
  if (command === "record") return commandRecord(args);
  if (command === "report") return commandReport(args);
  if (command === "status") return commandStatus(args);
  if (command === "viewer") return commandViewer(args);
  if (command === "stop") return commandStop(args);
  if (command === "self-test") return commandSelfTest(args);
  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(`price-intelligence: ${sanitize(error.message)}`);
  process.exitCode = 1;
});
