#!/usr/bin/env node
// Start an observability capture against a CDP target.
//
// Usage:
//   node scripts/start-capture.mjs <port|ws-url> [run-id] [interval-seconds]
//
// Env:
//   O11Y_ROOT     base directory for runs (default: .o11y)
//   O11Y_DOMAINS  space-separated CDP domains (default: "Network Console Runtime Log Page")

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  runDir, ensureDir, isoUtcSeconds, isAlive, sleepMs, writeJson,
} from './lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const [target, runIdArg, intervalArg] = process.argv.slice(2);
if (!target) {
  console.error('usage: start-capture.mjs <port|ws-url> [run-id] [interval-seconds]');
  process.exit(2);
}

const runId = runIdArg || isoUtcSeconds().replace(/[-:]/g, '');
const interval = Number(intervalArg) || 2;
const domainsList = (process.env.O11Y_DOMAINS || 'Network Console Runtime Log Page').trim().split(/\s+/);
const domainArgs = domainsList.flatMap(d => ['--domain', d]);

const RD = runDir(runId);
ensureDir(path.join(RD, 'cdp'));
ensureDir(path.join(RD, 'screenshots'));
ensureDir(path.join(RD, 'dom'));

writeJson(path.join(RD, 'manifest.json'), {
  run_id: runId,
  target,
  domains: domainsList.join(' '),
  interval_seconds: interval,
  started_at: isoUtcSeconds(),
});

// Spawn the CDP firehose in the background. Detach + unref so it survives this
// process exiting. browse cdp writes one JSON object per line to stdout.
const rawFd = fs.openSync(path.join(RD, 'cdp', 'raw.ndjson'), 'w');
const errFd = fs.openSync(path.join(RD, 'cdp', 'stderr.log'), 'w');
const cdp = spawn('browse', ['cdp', target, ...domainArgs], {
  detached: true,
  stdio: ['ignore', rawFd, errFd],
});
cdp.unref();
fs.writeFileSync(path.join(RD, '.cdp.pid'), String(cdp.pid));

// Spawn the periodic screenshot/DOM/url sampler (separate process so it can
// be SIGTERM'd independently from the CDP stream).
const loopFd = fs.openSync(path.join(RD, 'snapshot-loop.log'), 'w');
const loopScript = path.join(__dirname, 'snapshot-loop.mjs');
const loop = spawn(process.execPath, [loopScript, target, RD, String(interval)], {
  detached: true,
  stdio: ['ignore', loopFd, loopFd],
});
loop.unref();
fs.writeFileSync(path.join(RD, '.loop.pid'), String(loop.pid));

// Give both children a beat to fail loudly on bad targets so the user sees
// the real error instead of a silent zero-event capture. The snapshot loop
// is checked too: a syntax error or missing dep there would otherwise leave
// the run with CDP events but no DOM/screenshots, and the user would only
// notice after stop-capture.
await sleepMs(1000);
if (!isAlive(cdp.pid)) {
  console.error(`browse cdp exited immediately — check ${RD}/cdp/stderr.log`);
  try { console.error(fs.readFileSync(path.join(RD, 'cdp', 'stderr.log'), 'utf8')); } catch {}
  try { process.kill(loop.pid); } catch {}
  process.exit(1);
}
if (!isAlive(loop.pid)) {
  console.error(`snapshot-loop exited immediately — check ${RD}/snapshot-loop.log`);
  try { console.error(fs.readFileSync(path.join(RD, 'snapshot-loop.log'), 'utf8')); } catch {}
  try { process.kill(cdp.pid); } catch {}
  process.exit(1);
}

console.log(`run_id=${runId}`);
console.log(`run_dir=${RD}`);
console.log(`target=${target}`);
console.log(`cdp_pid=${cdp.pid}`);
console.log(`loop_pid=${loop.pid}`);
