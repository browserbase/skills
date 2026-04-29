#!/usr/bin/env node
// Stage 2 — Filter.
//
// Apply --include / --exclude / --origins on top of paired.jsonl. Default
// excludes scrub analytics, sourcemaps, fonts, and other static-asset noise
// that the load stage may have let through (e.g. when looksApiUrl matched).

import { readJsonl, writeJsonl, intermediatePath } from './lib/io.mjs';

const DEFAULT_EXCLUDES = [
  // Analytics / RUM / session replay
  /segment\.(io|com)/i,
  /mixpanel\.com/i,
  /google-analytics\.com/i,
  /googletagmanager\.com/i,
  /datadog(hq)?\.com/i,
  /sentry\.io/i,
  /amplitude\.com/i,
  /fullstory\.com/i,
  /hotjar\.com/i,
  /intercom\.io/i,
  /clarity\.ms/i,
  /cloudflareinsights\.com/i,
  /doubleclick\.net/i,
  /facebook\.com\/tr/i,
  // Static assets
  /\.(png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot|otf|css|map|mp4|webm|mp3|m4a)(\?|$)/i,
  // SW / metadata
  /\/sw\.js(\?|$)/i,
  /\/service-worker\.js(\?|$)/i,
  /\/manifest\.json(\?|$)/i,
  /\/robots\.txt(\?|$)/i,
  /\/favicon\.ico(\?|$)/i,
];

export function filter(outDir, opts = {}) {
  const { include = [], exclude = [], origins = [] } = opts;
  const includeRes = include.map(s => new RegExp(s));
  const excludeRes = [...DEFAULT_EXCLUDES, ...exclude.map(s => new RegExp(s))];
  const originSet = new Set(origins);

  const paired = readJsonl(intermediatePath(outDir, 'paired.jsonl'));
  const out = [];
  let droppedOrigin = 0, droppedExclude = 0, droppedInclude = 0;

  for (const row of paired) {
    if (originSet.size) {
      const host = row.origin ? new URL(row.origin).host : '';
      const matched = [...originSet].some(o => host === o || host.endsWith('.' + o));
      if (!matched) { droppedOrigin++; continue; }
    }
    if (excludeRes.some(re => re.test(row.url))) { droppedExclude++; continue; }
    if (includeRes.length && !includeRes.some(re => re.test(row.url))) { droppedInclude++; continue; }
    out.push(row);
  }

  writeJsonl(intermediatePath(outDir, 'filtered.jsonl'), out);
  return { kept: out.length, droppedOrigin, droppedExclude, droppedInclude };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2];
  if (!out) { console.error('usage: filter.mjs <out-dir>'); process.exit(2); }
  const stats = filter(out);
  console.log(`filter: kept ${stats.kept}, dropped ${stats.droppedExclude} (exclude) ${stats.droppedOrigin} (origin) ${stats.droppedInclude} (include)`);
}
