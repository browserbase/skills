#!/usr/bin/env node
// Stage 3 — Normalize.
//
// Group paired samples by (origin, method, templated path), collect query-param
// schemas, and detect when normalization is collapsing structurally divergent
// endpoints (flagged for the report).

import { readJsonl, writeJsonl, intermediatePath } from './lib/io.mjs';
import { templatize, templatizeWithSlugs } from './lib/path-template.mjs';

function inferQueryType(values) {
  // Lightweight type inference for query-string values (always strings on the
  // wire, but we can hint).
  if (values.every(v => /^-?\d+$/.test(v))) return { type: 'integer' };
  if (values.every(v => /^-?\d+(\.\d+)?$/.test(v))) return { type: 'number' };
  if (values.every(v => v === 'true' || v === 'false')) return { type: 'boolean' };
  return { type: 'string' };
}

function statusSignature(rows) {
  // A coarse "shape signature" used to detect when two raw paths that
  // templatize to the same template actually behave differently.
  const ct = new Set(rows.map(r => (r.contentType || '').split(';')[0].trim().toLowerCase()).filter(Boolean));
  const status = new Set(rows.map(r => (r.status != null ? Math.floor(r.status / 100) + 'xx' : 'none')));
  return [...ct].sort().join(',') + '|' + [...status].sort().join(',');
}

export function normalize(outDir) {
  const filtered = readJsonl(intermediatePath(outDir, 'filtered.jsonl'));

  // Pass 1: bucket by (origin, method, single-pass template).
  const buckets = new Map();
  for (const row of filtered) {
    const t = templatize(row.path);
    const key = `${row.method} ${row.origin}${t.template}`;
    let b = buckets.get(key);
    if (!b) { b = { origin: row.origin, method: row.method, template: t.template, params: t.params, rows: [], rawPaths: new Set() }; buckets.set(key, b); }
    b.rows.push(row);
    b.rawPaths.add(row.path);
  }

  // Pass 2: re-templatize each bucket using its raw-path set so slugs can be
  // detected. This may further collapse buckets that share the same underlying
  // template once slugs are recognized.
  const refined = new Map();
  for (const [, b] of buckets) {
    const rawPaths = [...b.rawPaths];
    const t = rawPaths.length > 1 ? templatizeWithSlugs(rawPaths) : { template: b.template, params: b.params };
    const key = `${b.method} ${b.origin}${t.template}`;
    let r = refined.get(key);
    if (!r) {
      r = { origin: b.origin, method: b.method, template: t.template, params: t.params, rows: [], rawPaths: new Set(), originalKeys: [] };
      refined.set(key, r);
    }
    r.rows.push(...b.rows);
    for (const p of b.rawPaths) r.rawPaths.add(p);
    r.originalKeys.push({ template: b.template, sig: statusSignature(b.rows) });
  }

  // Build endpoint records.
  const endpoints = [];
  for (const [, e] of refined) {
    const flags = [];

    // Divergent-shape check: if the bucket was collapsed from multiple pass-1
    // templates that had structurally different responses, flag it.
    const sigs = new Set(e.originalKeys.map(k => k.sig));
    if (sigs.size > 1) flags.push('divergent-response-shape');

    if (e.rows.length === 1) flags.push('single-sample');
    const statuses = new Set(e.rows.map(r => r.status).filter(s => s != null));
    if (statuses.size === 1) flags.push('single-status');
    const cts = new Set(e.rows.map(r => (r.contentType || '').split(';')[0].trim()).filter(Boolean));
    if (cts.size > 1) flags.push('mixed-content-types');
    const withBody = e.rows.filter(r => r.reqBody != null).length;
    if (withBody > 0 && withBody < e.rows.length) flags.push('request-body-only-on-some-samples');

    // Query parameter schema: collect names + sample values.
    const qSamples = new Map();
    for (const r of e.rows) {
      for (const k of Object.keys(r.query || {})) {
        if (!qSamples.has(k)) qSamples.set(k, []);
        qSamples.get(k).push(r.query[k]);
      }
    }
    const queryParams = [];
    for (const [name, values] of qSamples.entries()) {
      const present = e.rows.filter(r => name in (r.query || {})).length;
      queryParams.push({
        name,
        in: 'query',
        required: present === e.rows.length,
        schema: inferQueryType(values),
      });
    }

    endpoints.push({
      endpointKey: `${e.method} ${e.origin}${e.template}`,
      origin: e.origin,
      method: e.method,
      path: e.template,
      pathParams: e.params.map(p => ({ name: p.name, in: 'path', required: true, schema: p.schema })),
      queryParams,
      statusCodes: [...new Set(e.rows.map(r => r.status).filter(s => s != null))].sort((a, b) => a - b),
      sampleRows: e.rows,                      // kept on the in-memory record; trimmed before write
      sampleCount: e.rows.length,
      rawPaths: [...e.rawPaths],
      normalizationFlags: flags,
    });
  }

  // Drop the heavy in-memory rows from the persisted form; infer.mjs needs
  // them so we keep a parallel sidecar file.
  const persisted = endpoints.map(({ sampleRows, ...rest }) => rest);
  writeJsonl(intermediatePath(outDir, 'endpoints.jsonl'), persisted);

  const sidecar = endpoints.map(e => ({ endpointKey: e.endpointKey, samples: e.sampleRows }));
  writeJsonl(intermediatePath(outDir, 'endpoint-samples.jsonl'), sidecar);

  return { endpoints: endpoints.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2];
  if (!out) { console.error('usage: normalize.mjs <out-dir>'); process.exit(2); }
  const stats = normalize(out);
  console.log(`normalize: ${stats.endpoints} endpoints`);
}
