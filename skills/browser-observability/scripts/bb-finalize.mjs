#!/usr/bin/env node
// After stop-capture.mjs, pull final Browserbase-side artifacts (session
// metadata, server logs, downloads) into the run dir. Logs are best-effort —
// they're often sparse.
//
// Usage:
//   node scripts/bb-finalize.mjs <run-id> [--release]
//
//   --release  send `bb sessions update --status REQUEST_RELEASE` after
//              finalizing (use only when this run owns the session).

import fs from 'node:fs';
import path from 'node:path';

import { runDir, readJson, ensureDir, runCmd } from './lib.mjs';

if (!process.env.BROWSERBASE_API_KEY) {
  console.error('BROWSERBASE_API_KEY must be set');
  process.exit(1);
}

const [runId, ...rest] = process.argv.slice(2);
if (!runId) {
  console.error('usage: bb-finalize.mjs <run-id> [--release]');
  process.exit(2);
}
const release = rest.includes('--release');

const RD = runDir(runId);
const manifestPath = path.join(RD, 'manifest.json');
const manifest = readJson(manifestPath);
if (!manifest) {
  console.error(`manifest not found at ${RD}`);
  process.exit(1);
}

const sessionId = manifest?.browserbase?.session_id;
if (!sessionId) {
  console.error('manifest has no .browserbase.session_id — was this run captured via bb-capture.mjs?');
  process.exit(1);
}

const bbDir = path.join(RD, 'browserbase');
ensureDir(bbDir);

// Final session metadata — proxyBytes, status, ended_at all settle here.
{
  const r = runCmd('bb', ['sessions', 'get', sessionId]);
  if (r.ok) {
    fs.writeFileSync(path.join(bbDir, 'session.json'), r.stdout);
    console.log('wrote session.json');
  } else {
    console.error('warn: bb sessions get failed');
  }
}

// Server-side logs. Often empty — the firehose in cdp/raw.ndjson is the source of truth.
{
  const r = runCmd('bb', ['sessions', 'logs', sessionId]);
  if (r.ok) {
    fs.writeFileSync(path.join(bbDir, 'logs.json'), r.stdout);
    let n = '?';
    try { n = String(JSON.parse(r.stdout).length ?? '?'); } catch {}
    console.log(`wrote logs.json (${n} entries)`);
  }
}

// Downloads. An empty session yields a 22-byte EOCD-only zip; any real
// content is always larger.
{
  const out = path.join(bbDir, 'downloads.zip');
  const r = runCmd('bb', ['sessions', 'downloads', 'get', sessionId, '--output', out]);
  if (r.ok && fs.existsSync(out)) {
    const size = fs.statSync(out).size;
    if (size <= 22) {
      fs.unlinkSync(out);
      console.log('no downloads');
    } else {
      console.log(`wrote downloads.zip (${size} bytes)`);
    }
  } else if (fs.existsSync(out)) {
    fs.unlinkSync(out);
  }
}

if (release) {
  const r = runCmd('bb', ['sessions', 'update', sessionId, '--status', 'REQUEST_RELEASE']);
  if (r.ok) console.log(`released session ${sessionId}`);

  // Re-snapshot session.json so it reflects the final COMPLETED state with
  // settled proxyBytes and endedAt instead of the pre-release values.
  const r2 = runCmd('bb', ['sessions', 'get', sessionId]);
  if (r2.ok) {
    fs.writeFileSync(path.join(bbDir, 'session.json'), r2.stdout);
    console.log('refreshed session.json (post-release)');
  }
}

console.log(`finalized: ${bbDir}`);
for (const f of fs.readdirSync(bbDir)) console.log(f);
