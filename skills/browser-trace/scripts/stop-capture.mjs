#!/usr/bin/env node
// Stop an in-progress capture and stamp the manifest with stopped_at.
//
// Usage:
//   node scripts/stop-capture.mjs <run-id>

import fs from 'node:fs';
import path from 'node:path';

import { runDir, readJson, writeJson, isoUtcSeconds, isAlive, sleepMs } from './lib.mjs';

const [runId] = process.argv.slice(2);
if (!runId) {
  console.error('usage: stop-capture.mjs <run-id>');
  process.exit(2);
}

const RD = runDir(runId);
if (!fs.existsSync(RD)) {
  console.error(`run dir not found: ${RD}`);
  process.exit(1);
}

for (const pidFile of ['.cdp.pid', '.loop.pid']) {
  const p = path.join(RD, pidFile);
  if (!fs.existsSync(p)) continue;
  const pid = parseInt(fs.readFileSync(p, 'utf8').trim(), 10);
  if (!Number.isInteger(pid)) { fs.unlinkSync(p); continue; }

  try { process.kill(pid, 'SIGTERM'); } catch {}
  for (let i = 0; i < 3 && isAlive(pid); i++) {
    await sleepMs(1000);
  }
  if (isAlive(pid)) {
    try { process.kill(pid, 'SIGKILL'); } catch {}
  }
  fs.unlinkSync(p);
}

const manifestPath = path.join(RD, 'manifest.json');
const manifest = readJson(manifestPath);
if (manifest) {
  manifest.stopped_at = isoUtcSeconds();
  writeJson(manifestPath, manifest);
}

// Sweep half-written DOM dumps if the loop got SIGTERM'd mid-write.
const domDir = path.join(RD, 'dom');
if (fs.existsSync(domDir)) {
  for (const f of fs.readdirSync(domDir)) {
    if (f.endsWith('.partial')) {
      try { fs.unlinkSync(path.join(domDir, f)); } catch {}
    }
  }
}

console.log(`stopped: ${RD}`);
