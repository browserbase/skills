#!/usr/bin/env node
// extract_event.mjs — read recon.json, dispatch to platform-specific extractor,
// write people.jsonl (one speaker per line) and seed_companies.txt.
//
// Usage: node extract_event.mjs <output-dir>

import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const outDir = process.argv[2];
if (!outDir) { console.error('Usage: extract_event.mjs <output-dir>'); process.exit(1); }

const recon = JSON.parse(readFileSync(join(outDir, 'recon.json'), 'utf-8'));

function browse(...subargs) {
  return execFileSync('browse', subargs, {
    encoding: 'utf-8', maxBuffer: 16 * 1024 * 1024, timeout: 60000,
  });
}

function slugify(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function extractFromNextData(paths) {
  // Build a JS expression that walks __NEXT_DATA__ for each path and unions the arrays.
  const js = `(() => {
    const data = JSON.parse(document.getElementById('__NEXT_DATA__').textContent);
    function get(obj, path) {
      // path like '.props.pageProps.foo[0].bar' — naive parser, sufficient
      const tokens = path.match(/\\.[a-zA-Z_$][\\w$]*|\\[\\d+\\]/g) || [];
      let cur = obj;
      for (const t of tokens) {
        if (!cur) return null;
        if (t.startsWith('.')) cur = cur[t.slice(1)];
        else cur = cur[parseInt(t.slice(1, -1), 10)];
      }
      return cur;
    }
    const all = [];
    ${JSON.stringify(paths)}.forEach(p => {
      const arr = get(data, p);
      if (Array.isArray(arr)) all.push(...arr);
    });
    return all.map(s => ({
      name: s.name || s.fullName || null,
      title: s.title || s.role || null,
      company: s.companyName || s.company || s.org || null,
      linkedin: s.linkedInProfile || s.linkedinUrl || s.linkedin || null,
      bio: s.bio || s.description || null,
    }));
  })()`;
  const res = JSON.parse(browse('goto', recon.url));
  browse('wait', 'timeout', '2000');
  const evalRes = JSON.parse(browse('eval', js));
  return evalRes.result || [];
}

function extractFromMarkdown() {
  browse('goto', recon.url);
  browse('wait', 'timeout', '2500');
  const md = JSON.parse(browse('get', 'markdown')).markdown || '';
  // Naive: find blocks of "#### {Name}\n\n{Role}\n\n{Company}\n\n[LinkedIn]({url})"
  // This is a fallback — coverage is best-effort.
  const blocks = md.split(/\n#{2,4} /);
  const out = [];
  for (const b of blocks) {
    const lines = b.split(/\n+/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;
    const name = lines[0];
    if (!/^[A-Z]/.test(name)) continue;
    const linkedinMatch = b.match(/linkedin\.com\/in\/([\w-]+)/i);
    out.push({
      name,
      title: lines[1] || null,
      company: lines[2] || null,
      linkedin: linkedinMatch ? `https://www.linkedin.com/in/${linkedinMatch[1]}/` : null,
    });
  }
  return out;
}

let people = [];
if (recon.strategy === 'next-data-eval') {
  people = extractFromNextData(recon.nextDataPaths || []);
} else if (recon.strategy === 'markdown') {
  people = extractFromMarkdown();
} else {
  console.error(`Strategy ${recon.strategy} not implemented in v0.1; falling back to markdown.`);
  people = extractFromMarkdown();
}

// Add a slug
people = people.map(p => ({ ...p, slug: slugify(p.name) }));

// Write people.jsonl
const peopleFile = join(outDir, 'people.jsonl');
writeFileSync(peopleFile, people.map(p => JSON.stringify(p)).join('\n') + '\n');

// Roll up to unique companies
const companies = [...new Set(people.map(p => p.company).filter(Boolean))].sort();
writeFileSync(join(outDir, 'seed_companies.txt'), companies.join('\n') + '\n');

console.error(`Extracted ${people.length} people, ${companies.length} unique companies → ${outDir}`);
console.log(JSON.stringify({ peopleCount: people.length, companyCount: companies.length, peopleFile }, null, 2));
