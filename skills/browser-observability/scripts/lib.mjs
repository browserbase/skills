// Shared helpers for the browser-observability scripts.
//
// All scripts read O11Y_ROOT (default ".o11y") so runs land under
// $O11Y_ROOT/<run-id>/. No third-party deps; node stdlib only.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export function runRoot() {
  return process.env.O11Y_ROOT || '.o11y';
}

export function runDir(runId) {
  return path.join(runRoot(), runId);
}

export function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

// Wall-clock ISO seconds, no fractional part — same shape as `date -u +%Y-%m-%dT%H:%M:%SZ`.
export function isoUtcSeconds(d = new Date()) {
  return d.toISOString().replace(/\.\d+/, '');
}

// Compact UTC stamp suitable for filenames: 20260427T175533Z (no separators).
export function isoStampForFilename(d = new Date()) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
}

export function readJson(p, fallback = null) {
  if (!fs.existsSync(p)) return fallback;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return fallback; }
}

export function writeJson(p, obj) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}

// Stream a JSONL file line-by-line. Returns parsed objects, skipping bad lines.
export function readJsonl(p) {
  if (!fs.existsSync(p)) return [];
  const out = [];
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    if (!line) continue;
    try { out.push(JSON.parse(line)); } catch { /* skip */ }
  }
  return out;
}

// Atomic-ish JSONL write: caller has already mutated the array as desired.
// `skipEmpty: true` removes the file if there's nothing to write — used by per-page bucketing.
export function writeJsonl(p, items, { skipEmpty = false } = {}) {
  if (skipEmpty && items.length === 0) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
    return;
  }
  ensureDir(path.dirname(p));
  const body = items.length ? items.map(o => JSON.stringify(o)).join('\n') + '\n' : '';
  fs.writeFileSync(p, body);
}

export function isAlive(pid) {
  if (!Number.isInteger(pid)) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

// Wrap execFileSync so transient "exit non-zero" doesn't kill the caller.
// Returns { ok, stdout, stderr, status }.
export function runCmd(cmd, args, opts = {}) {
  try {
    const stdout = execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    return { ok: true, stdout, stderr: '', status: 0 };
  } catch (err) {
    return {
      ok: false,
      stdout: err.stdout?.toString?.() ?? '',
      stderr: err.stderr?.toString?.() ?? String(err.message || err),
      status: err.status ?? 1,
    };
  }
}

export function sleepMs(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Bucket map shared by bisect (session-wide + per-page) and query helpers.
// Format: [bucketRelativePath, predicate(method)].
export const BUCKETS = [
  ['network/requests',    m => m === 'Network.requestWillBeSent'],
  ['network/responses',   m => m === 'Network.responseReceived'],
  ['network/finished',    m => m === 'Network.loadingFinished'],
  ['network/failed',      m => m === 'Network.loadingFailed'],
  ['network/websocket',   m => m.startsWith('Network.webSocket')],
  ['console/logs',        m => m === 'Runtime.consoleAPICalled'],
  ['console/exceptions',  m => m === 'Runtime.exceptionThrown'],
  ['runtime/all',         m => m.startsWith('Runtime.')],
  ['log/entries',         m => m === 'Log.entryAdded'],
  ['page/navigations',    m => m === 'Page.frameNavigated'],
  ['page/lifecycle',      m => m === 'Page.lifecycleEvent'],
  ['page/dialogs',        m => m.startsWith('Page.javascriptDialog')],
  ['page/frames',         m => m.startsWith('Page.frame')],
  ['page/all',            m => m.startsWith('Page.')],
  ['dom/all',             m => m.startsWith('DOM.')],
  ['target/attached',     m => m === 'Target.attachedToTarget'],
  ['target/detached',     m => m === 'Target.detachedFromTarget'],
];

// Top-level frameNavigated detector (parentId null/empty == top frame).
export function isTopNav(ev) {
  if (ev?.method !== 'Page.frameNavigated') return false;
  const parent = ev?.params?.frame?.parentId ?? null;
  return parent === null || parent === '';
}
