#!/usr/bin/env node
// Stage 5 — Emit.
//
// Build the OpenAPI 3.1 document, hoist repeated schemas into components, and
// write openapi.yaml, openapi.json, report.md, confidence.json.

import path from 'node:path';
import { readJsonl, writeJson, writeText, intermediatePath, readJson } from './lib/io.mjs';
import { structuralHash } from './lib/schema-merge.mjs';
import { toYaml } from './lib/yaml.mjs';

function confidenceBucket(ep) {
  const s = ep.sampleCount;
  const flagged = ep.normalizationFlags.length > 0;
  const multiStatus = ep.statusCodes.length >= 2;
  if (s <= 2 || flagged) return 'low';
  if (s >= 10 && multiStatus) return 'high';
  return 'medium';
}

// Hoist structurally-identical inline schemas into components.schemas. We use a
// stable structural hash and bias names off the endpoint path so refs are
// readable (e.g. "Item" instead of "Schema7"). Recurses into nested object/array
// schemas so a Post that appears once at the top level and once as the items of
// a list still hoists as a single component.
function buildComponents(endpoints) {
  const byHash = new Map();      // hash -> { name, schema, hint }
  const refCount = new Map();    // hash -> count of sites referencing it

  function isObjectSchema(s) {
    if (!s || typeof s !== 'object') return false;
    if (s.type === 'object') return true;
    if (Array.isArray(s.type) && s.type.includes('object')) return true;
    return false;
  }
  function isArraySchema(s) {
    if (!s || typeof s !== 'object') return false;
    if (s.type === 'array') return true;
    if (Array.isArray(s.type) && s.type.includes('array')) return true;
    return false;
  }

  function visit(schema, hint) {
    if (!schema || typeof schema !== 'object') return;
    if (isObjectSchema(schema)) {
      const h = structuralHash(schema);
      refCount.set(h, (refCount.get(h) || 0) + 1);
      if (!byHash.has(h)) byHash.set(h, { name: null, schema, hint });
      for (const [k, child] of Object.entries(schema.properties || {})) {
        visit(child, propHint(hint, k));
      }
    } else if (isArraySchema(schema) && schema.items) {
      visit(schema.items, hint);
    }
  }

  for (const ep of endpoints) {
    if (ep.requestSchema) visit(ep.requestSchema, schemaHintFromPath(ep.path) + 'Request');
    for (const [, sch] of Object.entries(ep.responseSchemas || {})) {
      visit(sch, schemaHintFromPath(ep.path));
    }
  }

  // Hoist when (a) referenced by ≥ 2 sites, OR (b) it's an object with ≥ 4 properties.
  const components = {};
  let counter = 0;
  for (const [h, info] of byHash.entries()) {
    const refs = refCount.get(h) || 0;
    const propCount = Object.keys(info.schema.properties || {}).length;
    if (refs < 2 && propCount < 4) continue;
    let name = info.hint || `Schema${++counter}`;
    if (components[name]) name = `${name}_${++counter}`;
    info.name = name;
    components[name] = info.schema;
  }

  // refOrInline rewrites a schema, replacing any nested object schema that
  // matches a hoisted component with a $ref. Arrays have their items rewritten.
  function refOrInline(schema) {
    if (!schema || typeof schema !== 'object') return schema;
    if (isObjectSchema(schema)) {
      const h = structuralHash(schema);
      const info = byHash.get(h);
      if (info && info.name) return { $ref: `#/components/schemas/${info.name}` };
      if (!schema.properties) return schema;
      const rewritten = { ...schema, properties: {} };
      for (const [k, child] of Object.entries(schema.properties)) {
        rewritten.properties[k] = refOrInline(child);
      }
      return rewritten;
    }
    if (isArraySchema(schema) && schema.items) {
      return { ...schema, items: refOrInline(schema.items) };
    }
    return schema;
  }

  // Inline-rewrite the components themselves so nested objects within
  // components also use $refs.
  for (const [name, sch] of Object.entries(components)) {
    if (sch.properties) {
      components[name] = { ...sch, properties: Object.fromEntries(
        Object.entries(sch.properties).map(([k, c]) => [k, refOrInline(c)]),
      )};
    }
  }

  return { components, refOrInline };
}

function propHint(parentHint, key) {
  const cap = key.replace(/[^A-Za-z0-9]/g, '').replace(/^./, c => c.toUpperCase());
  return cap || (parentHint ? parentHint + 'Inner' : 'Schema');
}

function schemaHintFromPath(p) {
  if (!p) return 'Schema';
  const parts = p.split('/').filter(s => s && !s.startsWith('{'));
  if (!parts.length) return 'Root';
  const last = parts[parts.length - 1];
  return last.replace(/[^A-Za-z0-9]/g, '').replace(/^./, c => c.toUpperCase()) || 'Schema';
}

function makeOperation(ep, refOrInline) {
  const params = [];
  for (const p of ep.pathParams || []) params.push(p);
  for (const p of ep.queryParams || []) params.push(p);

  const op = {
    summary: `${ep.method} ${ep.path}`,
    operationId: makeOpId(ep),
  };
  if (params.length) op.parameters = params;

  if (ep.requestSchema && (ep.method === 'POST' || ep.method === 'PUT' || ep.method === 'PATCH' || ep.method === 'DELETE')) {
    op.requestBody = {
      content: {
        [ep.requestContentType || 'application/json']: {
          schema: refOrInline(ep.requestSchema),
          ...(ep.requestExample ? { example: ep.requestExample } : {}),
        },
      },
    };
  }

  const responses = {};
  const statuses = ep.statusCodes.length ? ep.statusCodes : [200];
  for (const status of statuses) {
    const ct = (ep.responseContentTypes && ep.responseContentTypes[status]) || 'application/json';
    const schema = ep.responseSchemas?.[String(status)];
    const entry = { description: defaultDescriptionFor(status) };
    if (schema || ep.responseExample) {
      entry.content = {
        [ct]: {
          ...(schema ? { schema: refOrInline(schema) } : {}),
          ...(status === ep.statusCodes[0] && ep.responseExample ? { example: ep.responseExample } : {}),
        },
      };
    }
    responses[String(status)] = entry;
  }
  op.responses = responses;

  // Extensions
  op['x-confidence'] = {
    samples: ep.sampleCount,
    statusCodes: ep.statusCodes,
    normalizationFlags: ep.normalizationFlags,
    confidence: confidenceBucket(ep),
  };
  op['x-sample-count'] = ep.sampleCount;
  if (ep.observedAuthHeaders?.length) op['x-observed-auth'] = ep.observedAuthHeaders;
  op['x-origin'] = ep.origin;

  return op;
}

function defaultDescriptionFor(status) {
  const n = Number(status);
  if (n >= 200 && n < 300) return 'Success';
  if (n >= 300 && n < 400) return 'Redirect';
  if (n === 400) return 'Bad request';
  if (n === 401) return 'Unauthorized';
  if (n === 403) return 'Forbidden';
  if (n === 404) return 'Not found';
  if (n >= 400 && n < 500) return 'Client error';
  if (n >= 500) return 'Server error';
  return `Status ${status}`;
}

function makeOpId(ep) {
  const parts = ep.path.split('/').filter(Boolean).map(s => s.replace(/[{}]/g, ''));
  const tail = parts.map(p => p.replace(/[^A-Za-z0-9]/g, '_')).join('_');
  return `${ep.method.toLowerCase()}_${tail || 'root'}`;
}

export function emit(outDir, opts = {}) {
  const minSamples = opts.minSamples || 1;
  const format = opts.format || 'both';
  const titleOverride = opts.title || null;

  const endpoints = readJsonl(intermediatePath(outDir, 'endpoints.with-schemas.jsonl'));
  const kept = endpoints.filter(e => e.sampleCount >= minSamples);
  const dropped = endpoints.filter(e => e.sampleCount < minSamples);

  // Servers: one entry per distinct origin, sorted by frequency.
  const originCounts = new Map();
  for (const e of kept) originCounts.set(e.origin, (originCounts.get(e.origin) || 0) + e.sampleCount);
  const servers = [...originCounts.entries()].sort((a, b) => b[1] - a[1]).map(([url]) => ({ url }));

  const primary = servers[0]?.url || '';
  const title = titleOverride || (primary ? `${new URL(primary).host} (discovered)` : 'Discovered API');

  const { components, refOrInline } = buildComponents(kept);

  // Build paths: one keyed entry per templated path; each method becomes an
  // operation. When the same (path, method) is observed on multiple origins
  // (common for third-party analytics endpoints fanned across vendors), keep
  // the highest-sample-count operation and record the other origins under
  // `x-also-served-from` so no data is silently dropped.
  const paths = {};
  const collisions = {}; // pathKey -> [{origin, samples}]
  for (const ep of kept) {
    const m = ep.method.toLowerCase();
    if (!paths[ep.path]) paths[ep.path] = {};
    const existing = paths[ep.path][m];
    if (!existing) {
      paths[ep.path][m] = makeOperation(ep, refOrInline);
    } else {
      const key = `${m} ${ep.path}`;
      if (!collisions[key]) collisions[key] = [{ origin: existing['x-origin'], samples: existing['x-sample-count'] }];
      collisions[key].push({ origin: ep.origin, samples: ep.sampleCount });
      if (ep.sampleCount > (existing['x-sample-count'] || 0)) {
        paths[ep.path][m] = makeOperation(ep, refOrInline);
      }
    }
  }
  for (const [key, origins] of Object.entries(collisions)) {
    const [m, p] = key.split(' ');
    const op = paths[p][m];
    const winner = op['x-origin'];
    op['x-also-served-from'] = origins.filter(o => o.origin !== winner).map(o => o.origin);
  }

  const doc = {
    openapi: '3.1.0',
    info: {
      title,
      version: '0.1.0-discovered',
      description: 'Spec discovered from a browser-trace capture by the browser-to-api skill. Inductive, not contractual — see `report.md` and `x-confidence` extensions for caveats.',
    },
    servers,
    paths,
  };
  if (Object.keys(components).length) doc.components = { schemas: components };

  if (format === 'yaml' || format === 'both') {
    writeText(path.join(outDir, 'openapi.yaml'), toYaml(doc));
  }
  if (format === 'json' || format === 'both') {
    writeJson(path.join(outDir, 'openapi.json'), doc);
  }

  // confidence.json
  const confidence = {
    endpoints: endpoints.map(ep => ({
      key: ep.endpointKey,
      samples: ep.sampleCount,
      statusCodes: ep.statusCodes,
      requestBodyKnown: ep.requestBodyKnown,
      responseBodyKnown: ep.responseBodyKnown,
      normalizationFlags: ep.normalizationFlags,
      confidence: confidenceBucket(ep),
      includedInSpec: ep.sampleCount >= minSamples,
    })),
  };
  writeJson(path.join(outDir, 'confidence.json'), confidence);

  // report.md
  const redaction = readJson(intermediatePath(outDir, 'redaction-stats.json'), { headers: 0, bodyKeys: 0, bodyValues: 0 });
  writeText(path.join(outDir, 'report.md'), buildReport({ kept, dropped, servers, redaction, minSamples }));

  return {
    endpoints: kept.length,
    droppedLowSample: dropped.length,
    servers: servers.length,
    components: Object.keys(components).length,
  };
}

function buildReport({ kept, dropped, servers, redaction, minSamples }) {
  const lines = [];
  lines.push('# Discovered API\n');
  lines.push('## Servers\n');
  for (const s of servers) lines.push(`- ${s.url}`);
  if (!servers.length) lines.push('_(none)_');
  lines.push('');

  lines.push('## Endpoints\n');
  lines.push('| Method | Path | Samples | Statuses | Confidence | Flags |');
  lines.push('|---|---|---|---|---|---|');
  const sorted = [...kept].sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  for (const ep of sorted) {
    const flags = ep.normalizationFlags.length ? ep.normalizationFlags.join(', ') : '—';
    lines.push(`| ${ep.method} | \`${ep.path}\` | ${ep.sampleCount} | ${ep.statusCodes.join(', ') || '—'} | ${confidenceBucket(ep)} | ${flags} |`);
  }
  if (!kept.length) lines.push('| — | — | — | — | — | — |');
  lines.push('');

  if (dropped.length) {
    lines.push(`## Dropped (below --min-samples=${minSamples})\n`);
    for (const ep of dropped) lines.push(`- \`${ep.method} ${ep.path}\` (${ep.sampleCount} sample${ep.sampleCount === 1 ? '' : 's'})`);
    lines.push('');
  }

  lines.push('## Coverage caveats\n');
  const noResp = kept.filter(e => !e.responseBodyKnown);
  if (noResp.length) {
    lines.push(`- **${noResp.length}** endpoint${noResp.length === 1 ? '' : 's'} have no response-body schema. \`browse cdp\` does not embed response bodies; pair with \`browse network on\` to capture them.`);
  }
  const singleSample = kept.filter(e => e.sampleCount === 1);
  if (singleSample.length) {
    lines.push(`- **${singleSample.length}** endpoint${singleSample.length === 1 ? '' : 's'} were observed only once. Drive the same flow again to gain confidence.`);
  }
  const noBodyOnPost = kept.filter(e => ['POST', 'PUT', 'PATCH'].includes(e.method) && !e.requestBodyKnown);
  if (noBodyOnPost.length) {
    lines.push(`- **${noBodyOnPost.length}** mutation endpoint${noBodyOnPost.length === 1 ? '' : 's'} have no request body in the trace (form-encoded? non-JSON? not captured?).`);
  }

  lines.push('');
  lines.push('## Redaction\n');
  lines.push(`- Headers redacted: ${redaction.headers}`);
  lines.push(`- Body keys redacted: ${redaction.bodyKeys}`);
  lines.push(`- Body values redacted by pattern: ${redaction.bodyValues}`);
  lines.push('');

  lines.push('## Suggested follow-up flows\n');
  const status404 = kept.filter(e => e.statusCodes.includes(404));
  if (status404.length) {
    lines.push(`- Endpoints that returned 404: ${status404.slice(0, 5).map(e => '`' + e.method + ' ' + e.path + '`').join(', ')}. Re-run with valid IDs to widen the success-path schema.`);
  }
  if (singleSample.length) {
    lines.push('- Re-exercise the single-sample endpoints listed above to promote them out of `low` confidence.');
  }
  if (!status404.length && !singleSample.length) {
    lines.push('- The captured flow looks reasonably balanced. Add an authenticated session if the unauth view is what was captured.');
  }
  return lines.join('\n') + '\n';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2];
  if (!out) { console.error('usage: emit.mjs <out-dir>'); process.exit(2); }
  const stats = emit(out);
  console.log(`emit: ${stats.endpoints} endpoints, ${stats.servers} server(s), ${stats.components} components${stats.droppedLowSample ? `, ${stats.droppedLowSample} dropped (low sample)` : ''}`);
}
