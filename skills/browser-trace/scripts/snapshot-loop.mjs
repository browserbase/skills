#!/usr/bin/env node
// Periodic screenshot + DOM HTML + URL sampler. Invoked by start-capture.mjs;
// not meant to be run directly.
//
// Each tick opens a one-shot CDP connection via `browse --ws <target> ...`
// (bypasses the `browse` daemon so it doesn't fight the main automation).
//
// Lifecycle: stop-capture sends SIGTERM and then waits up to ~3 seconds
// before falling back to SIGKILL. The loop must therefore wake from its
// inter-iteration sleep promptly when SIGTERM arrives, otherwise long
// `interval-seconds` settings cause SIGKILL to fire mid-iteration and the
// run loses its last DOM/screenshot pair.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { isoStampForFilename } from './lib.mjs';

// Per-call timeout for `browse --ws ...` invocations. A hung browse CLI
// would otherwise block this loop indefinitely until the parent SIGKILL
// arrives, leaving the run truncated. Tunable via env so tests / heavy
// pages can extend it.
const SNAPSHOT_TIMEOUT_MS = Number(process.env.O11Y_SNAPSHOT_TIMEOUT_MS) || 30_000;

// Run as a CLI only when invoked directly. Letting the module be imported
// (e.g. from snapshot-loop.test.mjs) keeps the stop-signal helper unit-
// testable without booting the full sampler loop.
const isEntry = (() => {
  if (!process.argv[1]) return false;
  try {
    return fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
  } catch {
    return false;
  }
})();
if (isEntry) await runSampler();

async function runSampler() {
  const [target, RD, intervalArg] = process.argv.slice(2);
  if (!target || !RD) {
    console.error('usage: snapshot-loop.mjs <target> <run-dir> [interval-seconds]');
    process.exit(2);
  }

  const intervalMs = (Number(intervalArg) || 2) * 1000;
  const indexPath = path.join(RD, 'index.jsonl');

  // Single shared stop signal. SIGTERM/SIGINT both flip `stopping` and
  // resolve the promise so any in-flight wait can short-circuit.
  const stop = createStopSignal();

  while (!stop.stopping) {
  const ts   = isoStampForFilename();
  const png  = path.join(RD, 'screenshots', `${ts}.png`);
  const html = path.join(RD, 'dom',         `${ts}.html`);
  const tmp  = `${html}.partial`;

  // Best-effort screenshot. If browse fails we just don't get one this tick.
  spawnSync('browse', ['--ws', target, 'screenshot', png], {
    stdio: 'ignore',
    timeout: SNAPSHOT_TIMEOUT_MS,
  });
  if (fs.existsSync(png) && fs.statSync(png).size === 0) {
    fs.unlinkSync(png);
  }
  if (stop.stopping) break;

  // DOM dump via temp file → rename, so we never leave a 0-byte HTML behind.
  try {
    const r = spawnSync('browse', ['--ws', target, 'get', 'html', 'body'], {
      encoding: 'utf8',
      timeout: SNAPSHOT_TIMEOUT_MS,
    });
    if (r.stdout && r.stdout.length) {
      fs.writeFileSync(tmp, r.stdout);
      fs.renameSync(tmp, html);
    }
  } catch { /* best-effort */ }
  // Cleanup any leftover .partial from a previous interrupted iteration.
  if (fs.existsSync(tmp)) {
    try { fs.unlinkSync(tmp); } catch {}
  }
  if (stop.stopping) break;

  // URL via the daemon-bypassing one-shot. Returns {"url": "..."}.
  let urlValue = '';
  const u = spawnSync('browse', ['--ws', target, '--json', 'get', 'url'], {
    encoding: 'utf8',
    timeout: SNAPSHOT_TIMEOUT_MS,
  });
  if (u.stdout) {
    try { urlValue = JSON.parse(u.stdout).url || ''; } catch {}
  }
  if (stop.stopping) break;

  const screenshotRel = fs.existsSync(png)  ? `screenshots/${ts}.png` : '';
  const domRel        = fs.existsSync(html) ? `dom/${ts}.html`        : '';
  fs.appendFileSync(indexPath,
    JSON.stringify({ ts, screenshot: screenshotRel, dom: domRel, url: urlValue }) + '\n');

  await stop.sleep(intervalMs);
  }
}

// ---------------------------------------------------------------------------

// Build a stop signal that listens once for SIGTERM/SIGINT, exposes a
// boolean view, and provides an abortable sleep so the inter-iteration
// pause wakes immediately when the user calls stop-capture.
//
// Exported as a factory rather than a module-level mutable so a test can
// drive it deterministically without messing with the live process's
// signal handlers.
export function createStopSignal() {
  let stopping = false;
  let resolveStop;
  const stopPromise = new Promise((resolve) => { resolveStop = resolve; });

  const trigger = () => {
    if (stopping) return;
    stopping = true;
    resolveStop();
  };
  process.on('SIGTERM', trigger);
  process.on('SIGINT',  trigger);

  function sleep(ms) {
    if (stopping) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      stopPromise.then(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  return {
    get stopping() { return stopping; },
    sleep,
    // Test-only entry point. Production code relies on the signal handlers.
    _trigger: trigger,
  };
}
