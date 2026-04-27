#!/usr/bin/env node
// Slice cdp/raw.ndjson into per-bucket and per-page JSONL files, then write a
// structured cdp/summary.json with a top-level overview and a pages[] array.
//
// Usage:
//   node scripts/bisect-cdp.mjs <run-id>
//
// Layout produced:
//   cdp/summary.json                  {sessionId, duration, totalEvents, pages[]}
//   cdp/<domain>/...                  session-wide buckets (legacy layout, always written)
//   cdp/pages/<pid>/                  per-page slices, only non-empty buckets written
//     url.txt, summary.json, raw.jsonl
//     network/, console/, page/, runtime/, log/, target/, dom/

import fs from 'node:fs';
import path from 'node:path';

import {
  runDir, ensureDir, readJson, readJsonl, writeJson, writeJsonl,
  BUCKETS, isTopNav,
} from './lib.mjs';

const [runId] = process.argv.slice(2);
if (!runId) {
  console.error('usage: bisect-cdp.mjs <run-id>');
  process.exit(2);
}

const RD = runDir(runId);
const cdpDir = path.join(RD, 'cdp');
const rawPath = path.join(cdpDir, 'raw.ndjson');
if (!fs.existsSync(rawPath)) {
  console.error(`raw.ndjson not found at ${rawPath}`);
  process.exit(1);
}

const events = readJsonl(rawPath);
const manifest = readJson(path.join(RD, 'manifest.json'), {});

// CDP exposes two clocks under .params.timestamp depending on the domain:
//   Network/Page              → MonotonicTime, seconds since browser start (small)
//   Console.messageAdded etc. → TimeSinceEpoch in ms (large, > 1e9)
// Anchor only on monotonic so wall-clock conversion stays consistent.
const isMonotonic = ts => ts != null && ts < 1e9;
const anchorCdp = events
  .map(e => e?.params?.timestamp)
  .find(isMonotonic) ?? null;

const startedMs = manifest.started_at ? new Date(manifest.started_at).getTime() : null;
const stoppedMs = manifest.stopped_at ? new Date(manifest.stopped_at).getTime() : null;

function toMs(ts) {
  if (ts == null || anchorCdp == null || startedMs == null) return null;
  return Math.floor((ts - anchorCdp) * 1000 + startedMs);
}

// Walk events in order. Each top-level Page.frameNavigated bumps the page
// counter. Events emitted before the first navigation are clamped to pid 0
// so they fold into the first concrete page (their requests really are part
// of loading that first page).
let pid = -1;
for (const ev of events) {
  if (isTopNav(ev)) pid += 1;
  ev._pid = pid < 0 ? 0 : pid;
}

// ---- session-wide buckets (always written, including empty files) ----
ensureDir(cdpDir);
for (const [bucket, predicate] of BUCKETS) {
  const matched = events
    .filter(e => predicate(e.method ?? ''))
    .map(stripPid);
  writeJsonl(path.join(cdpDir, `${bucket}.jsonl`), matched);
}

// ---- per-page slices ----
const pagesRoot = path.join(cdpDir, 'pages');
if (fs.existsSync(pagesRoot)) fs.rmSync(pagesRoot, { recursive: true, force: true });
ensureDir(pagesRoot);

// Group events by pid. If the run had zero events we still create page 0
// so the run dir has a predictable shape.
const pageMap = new Map();
for (const ev of events) {
  if (!pageMap.has(ev._pid)) pageMap.set(ev._pid, []);
  pageMap.get(ev._pid).push(ev);
}
if (pageMap.size === 0) pageMap.set(0, []);

const pageSummaries = [];
for (const [thisPid, pageEvents] of [...pageMap.entries()].sort((a, b) => a[0] - b[0])) {
  const padded = String(thisPid).padStart(3, '0');
  const pdir = path.join(pagesRoot, padded);
  ensureDir(pdir);

  // URL: first top-level frameNavigated in this page; "(initial)" if none.
  const navEv = pageEvents.find(isTopNav);
  const url = navEv?.params?.frame?.url ?? '(initial)';
  fs.writeFileSync(path.join(pdir, 'url.txt'), url + '\n');

  // raw.jsonl for this page, _pid stripped.
  writeJsonl(path.join(pdir, 'raw.jsonl'), pageEvents.map(stripPid));

  // Per-bucket slices, only writing files that have content.
  for (const [bucket, predicate] of BUCKETS) {
    const matched = pageEvents
      .filter(e => predicate(e.method ?? ''))
      .map(stripPid);
    writeJsonl(path.join(pdir, `${bucket}.jsonl`), matched, { skipEmpty: true });
  }

  const summary = computePageSummary(thisPid, url, pageEvents);
  writeJson(path.join(pdir, 'summary.json'), summary);
  pageSummaries.push(summary);
}

// ---- top-level summary.json ----
const sessionId = manifest?.browserbase?.session_id || manifest.run_id || runId;
const summary = {
  sessionId,
  duration: {
    startMs: startedMs,
    endMs: stoppedMs,
    totalMs: (startedMs != null && stoppedMs != null) ? stoppedMs - startedMs : null,
  },
  totalEvents: events.length,
  pages: pageSummaries,
};
writeJson(path.join(cdpDir, 'summary.json'), summary);

// Compact stdout view (full file is on disk).
console.log(JSON.stringify({
  sessionId,
  duration: summary.duration,
  totalEvents: summary.totalEvents,
  pages: pageSummaries.map(p => ({
    pageId: p.pageId,
    url: p.url,
    durationMs: p.durationMs,
    eventCount: p.eventCount,
  })),
}, null, 2));

// ---------------------------------------------------------------------------

function stripPid(ev) {
  const { _pid, ...rest } = ev;
  return rest;
}

function computePageSummary(pid, url, pageEvents) {
  const ts = pageEvents
    .map(e => e?.params?.timestamp)
    .filter(isMonotonic);
  const start = ts[0] ?? null;
  const end = ts[ts.length - 1] ?? null;
  const startMs = toMs(start);
  const endMs = toMs(end);

  // Per-CDP-domain rollup with optional errors/warnings keys.
  const counts = new Map();        // domain -> count
  const errors = new Map();        // domain -> errors
  const warnings = new Map();      // domain -> warnings
  const netTypes = new Map();      // resourceType -> count
  let netRequests = 0;
  let netFailed = 0;

  const inc = (m, k, by = 1) => m.set(k, (m.get(k) ?? 0) + by);

  for (const ev of pageEvents) {
    const method = ev.method;
    if (!method) continue;
    const domain = method.split('.')[0];
    inc(counts, domain);

    if (method === 'Network.loadingFailed') {
      inc(errors, 'Network');
      netFailed += 1;
    } else if (method === 'Network.requestWillBeSent') {
      netRequests += 1;
      inc(netTypes, ev?.params?.type ?? 'Other');
    } else if (method === 'Runtime.exceptionThrown') {
      inc(errors, 'Runtime');
    } else if (method === 'Runtime.consoleAPICalled') {
      const t = ev?.params?.type;
      if (t === 'error') inc(errors, 'Console');
      else if (t === 'warning' || t === 'warn') inc(warnings, 'Console');
    } else if (method === 'Log.entryAdded') {
      const level = ev?.params?.entry?.level;
      if (level === 'error') inc(errors, 'Log');
      else if (level === 'warning') inc(warnings, 'Log');
    }
  }

  const domains = {};
  for (const [d, c] of [...counts.entries()].sort()) {
    const block = { count: c };
    if (errors.get(d))   block.errors   = errors.get(d);
    if (warnings.get(d)) block.warnings = warnings.get(d);
    domains[d] = block;
  }

  const out = {
    pageId: pid,
    url,
    startMs,
    endMs,
    durationMs: (startMs != null && endMs != null) ? endMs - startMs : null,
    eventCount: pageEvents.length,
    domains,
  };

  if (netRequests > 0 || netFailed > 0) {
    const byType = {};
    for (const [t, c] of [...netTypes.entries()].sort()) byType[t] = c;
    out.network = { requests: netRequests, failed: netFailed, byType };
  }

  return out;
}
