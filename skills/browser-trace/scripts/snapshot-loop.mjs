#!/usr/bin/env node
// Periodic screenshot + DOM HTML + URL sampler. Invoked by start-capture.mjs;
// not meant to be run directly.
//
// Each tick samples the traced CDP target through browse. Passing --cdp here
// ensures this helper attaches to the traced target even when it runs outside
// the user's main automation flow.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { isoStampForFilename, sleepMs } from './lib.mjs';

const [target, RD, intervalArg] = process.argv.slice(2);
if (!target || !RD) {
  console.error('usage: snapshot-loop.mjs <target> <run-dir> [interval-seconds]');
  process.exit(2);
}

const intervalMs = (Number(intervalArg) || 2) * 1000;
const indexPath = path.join(RD, 'index.jsonl');

let stopping = false;
process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT',  () => { stopping = true; });

function getJsonField(stdout, field) {
  if (!stdout) return '';
  try {
    const parsed = JSON.parse(stdout);
    return typeof parsed?.[field] === 'string' ? parsed[field] : '';
  } catch {
    return '';
  }
}

while (!stopping) {
  const ts   = isoStampForFilename();
  const png  = path.join(RD, 'screenshots', `${ts}.png`);
  const html = path.join(RD, 'dom',         `${ts}.html`);
  const tmp  = `${html}.partial`;

  // Best-effort screenshot. If browse fails we just don't get one this tick.
  spawnSync('browse', ['screenshot', '--cdp', target, '--path', png], { stdio: 'ignore' });
  if (fs.existsSync(png) && fs.statSync(png).size === 0) {
    fs.unlinkSync(png);
  }

  // DOM dump via temp file → rename, so we never leave a 0-byte HTML behind.
  try {
    const r = spawnSync('browse', ['get', 'html', 'body', '--cdp', target], { encoding: 'utf8' });
    const htmlBody = getJsonField(r.stdout, 'html');
    if (htmlBody) {
      fs.writeFileSync(tmp, htmlBody);
      fs.renameSync(tmp, html);
    }
  } catch { /* best-effort */ }
  // Cleanup any leftover .partial from a previous interrupted iteration.
  if (fs.existsSync(tmp)) {
    try { fs.unlinkSync(tmp); } catch {}
  }

  // URL from the traced target. Returns {"url": "..."}.
  let urlValue = '';
  const u = spawnSync('browse', ['get', 'url', '--cdp', target], { encoding: 'utf8' });
  urlValue = getJsonField(u.stdout, 'url');

  const screenshotRel = fs.existsSync(png)  ? `screenshots/${ts}.png` : '';
  const domRel        = fs.existsSync(html) ? `dom/${ts}.html`        : '';
  fs.appendFileSync(indexPath,
    JSON.stringify({ ts, screenshot: screenshotRel, dom: domRel, url: urlValue }) + '\n');

  await sleepMs(intervalMs);
}
