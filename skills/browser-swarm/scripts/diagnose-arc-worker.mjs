#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillDir = resolve(__dirname, "..");
const manifestPath = resolve(skillDir, "extension", "manifest.json");
const defaultArcProfile = resolve(
  process.env.HOME || "",
  "Library/Application Support/Arc/User Data/Default"
);
const fallbackExtensionId = "fnkkfpnldmkoglemodoamghhienkeodp";

function parseArgs(argv) {
  const opts = {
    host: process.env.BROWSER_SWARM_HOST || "127.0.0.1",
    port: Number(process.env.BROWSER_SWARM_PORT || 19989),
    profile: process.env.BROWSER_SWARM_ARC_PROFILE || defaultArcProfile,
    extensionId: process.env.BROWSER_SWARM_EXTENSION_ID,
    json: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--host") opts.host = argv[++i];
    else if (arg === "--port") opts.port = Number(argv[++i]);
    else if (arg === "--profile") opts.profile = argv[++i];
    else if (arg === "--extension-id") opts.extensionId = argv[++i];
    else if (arg === "--json") opts.json = true;
    else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return opts;
}

function usage() {
  console.log(`Usage: node scripts/diagnose-arc-worker.mjs [--host <host>] [--port <port>] [--profile <arc-profile>] [--extension-id <id>] [--json]

Read-only diagnostic for Arc's Browser Swarm MV3 worker state. It compares:
- the unpacked extension manifest,
- the connected relay /health extension version,
- Arc's Secure Preferences extension registration metadata,
- Arc's service-worker registration database strings.

It never edits the Arc profile.`);
}

async function tryHealth(host, port) {
  try {
    const response = await fetch(`http://${host}:${port}/health`);
    if (!response.ok) return { error: `HTTP ${response.status}` };
    return response.json();
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function readManifest() {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  return {
    name: manifest.name,
    version: manifest.version,
    serviceWorker: manifest.background?.service_worker || null,
  };
}

function walkFiles(dir, files = []) {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    const path = resolve(dir, entry);
    let stat;
    try {
      stat = statSync(path);
    } catch {
      continue;
    }
    if (stat.isDirectory()) walkFiles(path, files);
    else if (stat.isFile()) files.push(path);
  }
  return files;
}

function countBuffer(buffer, needle) {
  if (!needle) return 0;
  const needleBuffer = Buffer.from(needle);
  let count = 0;
  let offset = 0;
  while (offset < buffer.length) {
    const found = buffer.indexOf(needleBuffer, offset);
    if (found === -1) break;
    count += 1;
    offset = found + needleBuffer.length;
  }
  return count;
}

function scanServiceWorkerDatabase(profile, expectedWorker, extensionId) {
  const databaseDir = resolve(profile, "Service Worker", "Database");
  const oldWorker = "service-worker.js";
  const extensionOrigin = `chrome-extension://${extensionId}/`;
  const oldWorkerUrl = `${extensionOrigin}${oldWorker}`;
  const expectedWorkerUrl = expectedWorker ? `${extensionOrigin}${expectedWorker}` : null;
  const files = walkFiles(databaseDir);
  const matches = [];

  for (const file of files) {
    let buffer;
    try {
      buffer = readFileSync(file);
    } catch {
      continue;
    }
    const extensionHits = countBuffer(buffer, extensionOrigin);
    const expectedWorkerHits = countBuffer(buffer, expectedWorkerUrl);
    const oldWorkerHits = expectedWorker === oldWorker ? 0 : countBuffer(buffer, oldWorkerUrl);
    if (extensionHits || expectedWorkerHits || oldWorkerHits) {
      matches.push({
        file,
        extensionOriginHits: extensionHits,
        expectedWorkerHits,
        oldWorkerHits,
      });
    }
  }

  return {
    databaseDir,
    exists: existsSync(databaseDir),
    oldWorkerUrl,
    expectedWorkerUrl,
    filesScanned: files.length,
    matches,
  };
}

function readSecurePreferencesRegistration(profile, extensionId) {
  const securePreferencesPath = resolve(profile, "Secure Preferences");
  if (!existsSync(securePreferencesPath)) {
    return {
      path: securePreferencesPath,
      exists: false,
      found: false,
    };
  }

  try {
    const preferences = JSON.parse(readFileSync(securePreferencesPath, "utf8"));
    const settings = preferences.extensions?.settings?.[extensionId];
    if (!settings) {
      return {
        path: securePreferencesPath,
        exists: true,
        found: false,
      };
    }

    return {
      path: securePreferencesPath,
      exists: true,
      found: true,
      extensionPath: settings.path || null,
      location: settings.location ?? null,
      hasStartedServiceWorker: settings.has_started_service_worker ?? null,
      serviceWorkerRegistrationVersion: settings.service_worker_registration_info?.version || null,
      manifestVersion: settings.manifest?.version || null,
      manifestServiceWorker: settings.manifest?.background?.service_worker || null,
      lastUpdateTime: settings.last_update_time || null,
    };
  } catch (error) {
    return {
      path: securePreferencesPath,
      exists: true,
      found: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function summarize({ manifest, health, scan, securePreferences, extensionId }) {
  const connectedVersion = health?.extension?.version || null;
  const versionMatches = connectedVersion === manifest.version;
  const preferenceRegistrationVersion = securePreferences?.serviceWorkerRegistrationVersion || null;
  const preferenceRegistrationStale = Boolean(
    preferenceRegistrationVersion &&
    preferenceRegistrationVersion !== manifest.version
  );
  const oldWorkerHits = scan.matches.reduce((sum, match) => sum + match.oldWorkerHits, 0);
  const expectedWorkerHits = scan.matches.reduce((sum, match) => sum + match.expectedWorkerHits, 0);
  const staleRegistrationLikely = manifest.serviceWorker !== "service-worker.js"
    && (
      (oldWorkerHits > 0 && expectedWorkerHits === 0) ||
      preferenceRegistrationStale
    );

  let status = "OK";
  if (health?.error) status = "RELAY_UNAVAILABLE";
  else if (!health?.extensionConnected) status = "EXTENSION_DISCONNECTED";
  else if (!versionMatches && staleRegistrationLikely) status = "STALE_ARC_SERVICE_WORKER_REGISTRATION";
  else if (!versionMatches) status = "STALE_CONNECTED_EXTENSION";

  return {
    status,
    connectedVersion,
    expectedVersion: manifest.version,
    extensionId,
    versionMatches,
    preferenceRegistrationVersion,
    preferenceRegistrationStale,
    expectedWorker: manifest.serviceWorker,
    oldWorkerHits,
    expectedWorkerHits,
    staleRegistrationLikely,
  };
}

function printHuman(result) {
  console.log(`Browser Swarm Arc worker diagnosis

Status:             ${result.summary.status}
Relay health:       ${result.health?.error ? result.health.error : "available"}
Connected version:  ${result.summary.connectedVersion || "none"}
Expected version:   ${result.summary.expectedVersion}
Expected worker:    ${result.summary.expectedWorker}
Arc profile:        ${result.arcProfile}
Prefs registration: ${result.summary.preferenceRegistrationVersion || "none"}
SW database:        ${result.scan.databaseDir}
Files scanned:      ${result.scan.filesScanned}
Old worker hits:    ${result.summary.oldWorkerHits}
Expected hits:      ${result.summary.expectedWorkerHits}
`);

  if (result.summary.status === "STALE_ARC_SERVICE_WORKER_REGISTRATION") {
    console.log("Arc is still registered to the old MV3 service-worker.js. Restart Arc, then rerun this diagnostic and the Arc parallel-click e2e gate.");
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const manifest = readManifest();
  const health = await tryHealth(opts.host, opts.port);
  const extensionId = opts.extensionId || health?.extension?.id || fallbackExtensionId;
  const securePreferences = readSecurePreferencesRegistration(opts.profile, extensionId);
  const scan = scanServiceWorkerDatabase(opts.profile, manifest.serviceWorker, extensionId);
  const result = {
    manifest,
    health,
    extensionId,
    arcProfile: opts.profile,
    securePreferences,
    scan,
    summary: summarize({ manifest, health, scan, securePreferences, extensionId }),
  };

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHuman(result);
  }

  if (result.summary.status === "STALE_ARC_SERVICE_WORKER_REGISTRATION") {
    process.exitCode = 3;
  } else if (result.summary.status !== "OK") {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
