#!/usr/bin/env node
// Snapshot the `browse network` bodies dir into a run before the next capture
// overwrites it.
//
// Usage:
//   node scripts/snapshot-bodies.mjs <run-id> [--no-off] [--bodies <path>]
//
// What it does:
//   1. Resolves the `browse network` capture dir (live, via `browse network path`,
//      or an explicit `--bodies <path>` override).
//   2. Copies its contents into `<run>/cdp/network/bodies/`.
//   3. Calls `browse network off` so a future `browse network on` starts clean
//      (skip with `--no-off`).
//
// The manual `cp -r "$(browse network path | jq -r .path)" <run>/cdp/network/bodies`
// pattern is fragile across BSD vs GNU `cp` (trailing-slash semantics differ and
// the parent dir must already exist). This script encodes the safe path so the
// docs can refer to one command.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { runDir, ensureDir } from './lib.mjs';

const args = process.argv.slice(2);
if (args.length === 0 || args[0].startsWith('--')) {
  console.error('usage: snapshot-bodies.mjs <run-id> [--no-off] [--bodies <path>]');
  process.exit(2);
}
const runId = args[0];
let bodiesOverride = null;
let runOff = true;
for (let i = 1; i < args.length; i++) {
  if (args[i] === '--no-off') { runOff = false; continue; }
  if (args[i] === '--bodies') { bodiesOverride = args[++i]; continue; }
  console.error(`unknown arg: ${args[i]}`);
  process.exit(2);
}

const RD = runDir(runId);
if (!fs.existsSync(RD)) {
  console.error(`run dir not found: ${RD}`);
  process.exit(1);
}

let src = bodiesOverride;
if (!src) {
  const out = spawnSync('browse', ['network', 'path', '--json'], { encoding: 'utf8' });
  if (out.status !== 0) {
    console.error('failed to resolve `browse network path`:');
    console.error(out.stderr || out.stdout);
    process.exit(1);
  }
  try {
    src = JSON.parse(out.stdout).path;
  } catch {
    // older `browse` versions don't take --json; fall back to plain stdout.
    src = (spawnSync('browse', ['network', 'path'], { encoding: 'utf8' }).stdout || '').trim();
  }
}
if (!src || !fs.existsSync(src)) {
  console.error(`bodies source dir not found: ${src ?? '(unresolved)'}`);
  console.error('Did you run `browse network on` before capturing?');
  process.exit(1);
}

const dest = path.join(RD, 'cdp', 'network', 'bodies');
ensureDir(path.dirname(dest));
// fs.cpSync avoids the BSD-vs-GNU cp portability footgun: cp's trailing-slash
// and missing-parent semantics differ across macOS and Linux. Node's recursive
// copy is the same everywhere.
fs.cpSync(src, dest, { recursive: true });
const fileCount = fs.readdirSync(dest).length;

if (runOff) {
  const off = spawnSync('browse', ['network', 'off'], { encoding: 'utf8' });
  if (off.status !== 0) {
    console.error('warning: `browse network off` failed (continuing):');
    console.error(off.stderr || off.stdout);
  }
}

console.log(JSON.stringify({
  run_id: runId,
  bodies_src: src,
  bodies_dest: dest,
  files: fileCount,
  ran_off: runOff,
}));
