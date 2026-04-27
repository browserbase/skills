#!/usr/bin/env node
// Start an observability capture against a Browserbase session.
//
// Usage:
//   node scripts/bb-capture.mjs --new [run-id] [interval-seconds]
//   node scripts/bb-capture.mjs <session-id> [run-id] [interval-seconds]
//
// Env:
//   BROWSERBASE_API_KEY   required
//   BB_SESSION_TIMEOUT    timeout for --new sessions, seconds (default: 600)
//   O11Y_ROOT, O11Y_DOMAINS — same as start-capture.mjs

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { runDir, readJson, writeJson, runCmd } from './lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.BROWSERBASE_API_KEY) {
  console.error('BROWSERBASE_API_KEY must be set');
  process.exit(1);
}

const [target, runIdArg, intervalArg] = process.argv.slice(2);
if (!target) {
  console.error('usage: bb-capture.mjs --new|<session-id> [run-id] [interval-seconds]');
  process.exit(2);
}

let sessionJson;
if (target === '--new') {
  const timeout = String(process.env.BB_SESSION_TIMEOUT || '600');
  const r = runCmd('bb', ['sessions', 'create', '--keep-alive', '--timeout', timeout]);
  if (!r.ok) { console.error(r.stderr || 'bb sessions create failed'); process.exit(1); }
  sessionJson = JSON.parse(r.stdout);
  console.log(`Created Browserbase session: ${sessionJson.id}`);
} else {
  const r = runCmd('bb', ['sessions', 'get', target]);
  if (!r.ok) { console.error(r.stderr || 'bb sessions get failed'); process.exit(1); }
  sessionJson = JSON.parse(r.stdout);
  if (sessionJson.status !== 'RUNNING') {
    console.error(`Session ${target} is not RUNNING (status=${sessionJson.status}). Recreate with --keep-alive.`);
    process.exit(1);
  }
}

const sessionId = sessionJson.id;
const connectUrl = sessionJson.connectUrl;

let debugJson = null;
const dbg = runCmd('bb', ['sessions', 'debug', sessionId]);
if (dbg.ok) {
  try { debugJson = JSON.parse(dbg.stdout); } catch {}
}

// Hand off to start-capture.mjs as a child process so it owns its own
// detached background processes (cdp + snapshot loop).
const startScript = path.join(__dirname, 'start-capture.mjs');
const startArgs = [startScript, connectUrl];
if (runIdArg)   startArgs.push(runIdArg);
if (intervalArg) startArgs.push(intervalArg);

const start = spawnSync(process.execPath, startArgs, { stdio: ['ignore', 'pipe', 'inherit'] });
if (start.status !== 0) process.exit(start.status ?? 1);

// start-capture writes a status block to stdout; surface it minus the noisy
// signed connectUrl, then add the BB-specific lines.
const lines = start.stdout.toString().split('\n').filter(l => l && !l.startsWith('target='));
for (const l of lines) console.log(l);

// Patch the manifest with Browserbase metadata so traversal queries can later
// join CDP events back to platform info (region, debugger URL, project, etc.).
const runId = (lines.find(l => l.startsWith('run_id=')) || '').slice('run_id='.length);
if (!runId) { console.error('could not parse run_id from start-capture output'); process.exit(1); }

const manifestPath = path.join(runDir(runId), 'manifest.json');
const manifest = readJson(manifestPath, {});
const debuggerUrl = debugJson?.debuggerFullscreenUrl ?? debugJson?.debuggerUrl ?? null;

manifest.browserbase = {
  session_id:   sessionJson.id,
  project_id:   sessionJson.projectId,
  region:       sessionJson.region,
  started_at:   sessionJson.startedAt,
  expires_at:   sessionJson.expiresAt,
  keep_alive:   sessionJson.keepAlive,
  debugger_url: debuggerUrl,
};
writeJson(manifestPath, manifest);

if (debuggerUrl) console.log(`Live debugger: ${debuggerUrl}`);
console.log(`session_id=${sessionId}`);
console.log(`connect_url=${(connectUrl || '').slice(0, 60)}…`);
