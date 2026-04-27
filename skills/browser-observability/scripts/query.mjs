#!/usr/bin/env node
// Drill-down helper for a captured run.
//
// Usage:
//   node scripts/query.mjs <run-id> list                       List pages with id, url, duration, events.
//   node scripts/query.mjs <run-id> summary                    Print cdp/summary.json (full).
//   node scripts/query.mjs <run-id> page <pid>                 Print this page's summary.json.
//   node scripts/query.mjs <run-id> page <pid> <bucket>        Cat a per-page bucket file. e.g.
//                                                              network/requests, network/failed,
//                                                              console/logs, page/lifecycle, raw
//   node scripts/query.mjs <run-id> errors [pid|all]           All error rows (network failed,
//                                                              runtime exceptions, console errors,
//                                                              log errors). Each line tagged with
//                                                              pid + kind.
//   node scripts/query.mjs <run-id> hosts [pid|all]            Top hosts by request count.
//   node scripts/query.mjs <run-id> host <hostname> [pid|all]  Requests + responses for one host.
//   node scripts/query.mjs <run-id> timeline                   Compact navigation+lifecycle timeline.

import fs from 'node:fs';
import path from 'node:path';

import { runDir, readJson, readJsonl } from './lib.mjs';

const [runId, cmd, ...args] = process.argv.slice(2);
if (!runId || !cmd) usage();

const RD = runDir(runId);
const cdpDir = path.join(RD, 'cdp');
if (!fs.existsSync(cdpDir)) {
  console.error(`no run dir at ${RD}`);
  process.exit(1);
}

switch (cmd) {
  case 'list':     cmdList(); break;
  case 'summary':  cmdSummary(); break;
  case 'page':     cmdPage(args[0], args[1]); break;
  case 'errors':   cmdErrors(args[0]); break;
  case 'hosts':    cmdHosts(args[0]); break;
  case 'host':     cmdHost(args[0], args[1]); break;
  case 'timeline': cmdTimeline(); break;
  default:
    console.error(`unknown command: ${cmd}`);
    usage();
}

// ---------------------------------------------------------------------------

function usage() {
  console.error([
    'usage: query.mjs <run-id> <command> [args...]',
    '',
    '  list                          page table',
    '  summary                       full cdp/summary.json',
    '  page <pid>                    per-page summary',
    '  page <pid> <bucket>           cat pages/<pid>/<bucket>.jsonl  (e.g. network/failed, raw)',
    '  errors [pid|all]              unified errors with pid + kind',
    '  hosts [pid|all]               top hosts by request count',
    '  host <hostname> [pid|all]     all requests/responses for a hostname',
    '  timeline                      nav + lifecycle markers',
  ].join('\n'));
  process.exit(2);
}

function pageDir(pid) {
  return path.join(cdpDir, 'pages', String(pid).padStart(3, '0'));
}

function listPids(filter) {
  if (filter && filter !== 'all') return [Number(filter)];
  const root = path.join(cdpDir, 'pages');
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root)
    .filter(d => /^\d+$/.test(d))
    .map(Number)
    .sort((a, b) => a - b);
}

function emitJsonl(items) {
  for (const it of items) console.log(JSON.stringify(it));
}

// ---------------------------------------------------------------------------

function cmdList() {
  const summary = readJson(path.join(cdpDir, 'summary.json'));
  if (!summary) { console.error('no summary.json — run bisect-cdp.mjs first'); process.exit(1); }

  // Pad columns: pid, eventCount, durationSeconds, url.
  const rows = summary.pages.map(p => ([
    String(p.pageId),
    `${p.eventCount}evt`,
    `${((p.durationMs ?? 0) / 1000).toFixed(2)}s`,
    p.url,
  ]));
  const widths = rows[0]?.map((_, i) => Math.max(...rows.map(r => r[i].length))) ?? [];
  for (const r of rows) {
    console.log(r.map((c, i) => c.padEnd(widths[i])).join('  '));
  }
}

function cmdSummary() {
  const s = readJson(path.join(cdpDir, 'summary.json'));
  if (!s) { console.error('no summary.json — run bisect-cdp.mjs first'); process.exit(1); }
  console.log(JSON.stringify(s, null, 2));
}

function cmdPage(pidArg, bucketArg) {
  if (pidArg === undefined) { console.error('page id required'); process.exit(2); }
  const pdir = pageDir(pidArg);
  if (!fs.existsSync(pdir)) { console.error(`no such page: ${pidArg}`); process.exit(1); }

  if (!bucketArg) {
    const s = readJson(path.join(pdir, 'summary.json'));
    if (!s) { console.error(`no summary.json for page ${pidArg}`); process.exit(1); }
    console.log(JSON.stringify(s, null, 2));
    return;
  }

  if (bucketArg === 'raw') {
    const raw = path.join(pdir, 'raw.jsonl');
    if (!fs.existsSync(raw)) { console.error('(empty)'); return; }
    process.stdout.write(fs.readFileSync(raw));
    return;
  }

  const file = path.join(pdir, `${bucketArg}.jsonl`);
  if (!fs.existsSync(file)) { console.error(`(empty: ${bucketArg} for page ${pidArg})`); return; }
  process.stdout.write(fs.readFileSync(file));
}

function cmdErrors(filter) {
  for (const pid of listPids(filter)) {
    const pdir = pageDir(pid);

    for (const ev of readJsonl(path.join(pdir, 'network/failed.jsonl'))) {
      console.log(JSON.stringify({
        pid, kind: 'network.failed',
        rid: ev?.params?.requestId,
        errorText: ev?.params?.errorText,
        type: ev?.params?.type,
      }));
    }
    for (const ev of readJsonl(path.join(pdir, 'console/exceptions.jsonl'))) {
      console.log(JSON.stringify({
        pid, kind: 'runtime.exception',
        text: ev?.params?.exceptionDetails?.text,
        message: ev?.params?.exceptionDetails?.exception?.description,
      }));
    }
    for (const ev of readJsonl(path.join(pdir, 'console/logs.jsonl'))) {
      if (ev?.params?.type !== 'error') continue;
      const arg0 = ev?.params?.args?.[0];
      console.log(JSON.stringify({
        pid, kind: 'console.error',
        msg: arg0?.value ?? arg0?.description ?? '',
      }));
    }
    for (const ev of readJsonl(path.join(pdir, 'log/entries.jsonl'))) {
      if (ev?.params?.entry?.level !== 'error') continue;
      console.log(JSON.stringify({
        pid, kind: 'log.error',
        source: ev?.params?.entry?.source,
        text: ev?.params?.entry?.text,
      }));
    }
  }
}

function cmdHosts(filter) {
  const counts = new Map();
  for (const pid of listPids(filter)) {
    for (const ev of readJsonl(path.join(pageDir(pid), 'network/requests.jsonl'))) {
      const url = ev?.params?.request?.url;
      if (!url) continue;
      let host;
      try { host = new URL(url).host; } catch { host = ''; }
      counts.set(host, (counts.get(host) ?? 0) + 1);
    }
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [host, n] of sorted) {
    console.log(`${String(n).padStart(4)} ${host}`);
  }
}

function cmdHost(hostname, filter) {
  if (!hostname) { console.error('hostname required'); process.exit(2); }
  for (const pid of listPids(filter)) {
    const pdir = pageDir(pid);
    for (const ev of readJsonl(path.join(pdir, 'network/requests.jsonl'))) {
      const url = ev?.params?.request?.url ?? '';
      if (!url.startsWith(`http://${hostname}`) && !url.startsWith(`https://${hostname}`)) continue;
      console.log(JSON.stringify({
        pid, kind: 'request',
        method: ev?.params?.request?.method,
        url,
        type: ev?.params?.type,
      }));
    }
    for (const ev of readJsonl(path.join(pdir, 'network/responses.jsonl'))) {
      const url = ev?.params?.response?.url ?? '';
      if (!url.startsWith(`http://${hostname}`) && !url.startsWith(`https://${hostname}`)) continue;
      console.log(JSON.stringify({
        pid, kind: 'response',
        status: ev?.params?.response?.status,
        url,
      }));
    }
  }
}

function cmdTimeline() {
  for (const ev of readJsonl(path.join(cdpDir, 'page/navigations.jsonl'))) {
    console.log(`[NAV ${ev?.params?.frame?.url ?? '?'}]`);
  }
  for (const ev of readJsonl(path.join(cdpDir, 'page/lifecycle.jsonl'))) {
    console.log(`[${ev?.params?.name ?? '?'}]`);
  }
}
