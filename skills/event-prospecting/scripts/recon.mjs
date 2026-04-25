#!/usr/bin/env node
// recon.mjs — probe an event URL, identify the platform, persist a recon.json
// describing how to extract people. Output dir is the second arg or stdout.
//
// Usage: node recon.mjs <event-url> [output-dir]
//
// Detection priority:
//   1. Next.js __NEXT_DATA__ (custom Next sites — Stripe Sessions class)
//   2. Sessionize generator meta or sessionz.io script
//   3. Lu.ma og:site_name
//   4. Eventbrite og:site_name
//   5. JSON-LD Event block
//   6. Fall through to markdown-extraction strategy

import { execFileSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);
if (args.length < 1 || args.includes('--help')) {
  console.error(`Usage: node recon.mjs <event-url> [output-dir]`);
  process.exit(1);
}

const url = args[0];
const outDir = args[1];

function browse(...subargs) {
  return execFileSync('browse', subargs, {
    encoding: 'utf-8', maxBuffer: 8 * 1024 * 1024, timeout: 60000,
  });
}

function probe() {
  // Navigate + settle
  browse('goto', url);
  browse('wait', 'timeout', '2500');
  const titleRes = JSON.parse(browse('get', 'title'));
  const title = titleRes.title || '';

  // Probe in priority order via a single eval — cheaper than N calls.
  const probeJs = `(() => {
    const nd = document.getElementById('__NEXT_DATA__');
    const meta = document.querySelector('meta[name="generator"]');
    const og = document.querySelector('meta[property="og:site_name"]');
    const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map(s => { try { return JSON.parse(s.textContent); } catch { return null; }})
      .filter(Boolean);
    return {
      hasNextData: !!nd,
      nextDataLen: nd ? nd.textContent.length : 0,
      generator: meta ? meta.content : null,
      ogSite: og ? og.content : null,
      jsonLdEvents: jsonLd.filter(j => j['@type'] === 'Event').length,
      hostname: location.hostname
    };
  })()`;
  const evalRes = JSON.parse(browse('eval', probeJs));
  const r = evalRes.result || {};

  // Decide platform
  let platform = 'custom';
  let strategy = 'markdown';
  let nextDataPaths = null;

  if (r.hasNextData) {
    platform = 'next-data';
    strategy = 'next-data-eval';
    // Find arrays of speaker-like objects inside __NEXT_DATA__
    const findJs = `(() => {
      const data = JSON.parse(document.getElementById('__NEXT_DATA__').textContent);
      const out = [];
      function walk(o, path='') {
        if (Array.isArray(o)) {
          if (o.length > 3 && typeof o[0] === 'object' && o[0] !== null) {
            const keys = Object.keys(o[0]);
            const hasName = keys.some(k => /name/i.test(k));
            const hasLinkedIn = JSON.stringify(o[0]).match(/linkedin/i);
            if (hasName && hasLinkedIn) out.push({ path, len: o.length, keys: keys.slice(0,12) });
          }
          o.forEach((v,i) => walk(v, path+'['+i+']'));
        } else if (o && typeof o === 'object') {
          Object.keys(o).forEach(k => walk(o[k], path+'.'+k));
        }
      }
      walk(data);
      // Keep only top-level (non-nested) speaker arrays — drop talks[N].speakers
      return out.filter(x => !/\\.talks\\[\\d+\\]\\.speakers/.test(x.path)).slice(0, 5);
    })()`;
    const findRes = JSON.parse(browse('eval', findJs));
    nextDataPaths = (findRes.result || []).map(x => x.path);
  } else if (r.generator && /sessionize/i.test(r.generator)) {
    platform = 'sessionize';
    strategy = 'sessionize-api';
  } else if (r.hostname && /lu\.ma/.test(r.hostname)) {
    platform = 'luma';
    strategy = 'json-ld';
  } else if (r.ogSite && /eventbrite/i.test(r.ogSite)) {
    platform = 'eventbrite';
    strategy = 'json-ld';
  } else if (r.jsonLdEvents > 0) {
    platform = 'json-ld';
    strategy = 'json-ld';
  }

  return {
    url,
    title,
    platform,
    strategy,
    nextDataPaths,
    signals: r,
    probedAt: new Date().toISOString(),
  };
}

const result = probe();

if (outDir) {
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, 'recon.json');
  writeFileSync(path, JSON.stringify(result, null, 2));
  console.error(`recon.json written → ${path}`);
}
console.log(JSON.stringify(result, null, 2));
