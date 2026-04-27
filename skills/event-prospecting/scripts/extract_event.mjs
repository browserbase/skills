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
    function pickImage(s) {
      // Detect image fields by KEY NAME regex (across Next.js / Sanity / Sessionize / custom CMS shapes).
      // Matches anything containing portrait/headshot/photo/image/picture/avatar/thumbnail (case-insensitive).
      // Prefer color over monochrome by sorting matched keys (color* < mono*).
      // Object values get unwrapped via .url, .src, .asset.url, or fields.file.url.
      const re = /portrait|headshot|photo|image|picture|avatar|thumbnail/i;
      const keys = Object.keys(s).filter(k => re.test(k));
      // Push monochrome/grayscale variants to the end so colour wins.
      keys.sort((a, b) => {
        const aMono = /mono|grey|gray|black/i.test(a) ? 1 : 0;
        const bMono = /mono|grey|gray|black/i.test(b) ? 1 : 0;
        return aMono - bMono;
      });
      for (const k of keys) {
        const v = s[k];
        if (!v) continue;
        if (typeof v === 'string') return v;
        if (typeof v === 'object') {
          if (typeof v.url === 'string') return v.url;
          if (typeof v.src === 'string') return v.src;
          if (v.asset && typeof v.asset.url === 'string') return v.asset.url;
          if (v.fields && v.fields.file && typeof v.fields.file.url === 'string') return v.fields.file.url;
        }
      }
      return null;
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
      image: pickImage(s),
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

// Resolve relative image URLs against the event origin (some Next sites store
// `/images/speakers/foo.jpg` instead of an absolute CDN URL).
const eventOrigin = (() => { try { return new URL(recon.url).origin; } catch { return null; } })();
function resolveImage(src) {
  if (!src) return null;
  if (/^https?:\/\//i.test(src)) return src;
  if (src.startsWith('//')) return 'https:' + src;
  if (src.startsWith('/') && eventOrigin) return eventOrigin + src;
  return src;
}

// Add a slug + normalize image URL
people = people.map(p => ({ ...p, image: resolveImage(p.image), slug: slugify(p.name) }));

// Filter event-host employees and obvious noise. The host org is derived from
// the event URL — for `stripesessions.com` that's stripe; for subdomain-hosted
// events like `events.stripe.com` we want stripe (not "events"). We take the
// registrable-domain chunk (parts[-2]) and strip event-platform suffixes from
// it. Falls down on .co.uk-style public suffixes; v0.1 accepts that.
const hostOrg = (() => {
  try {
    const h = new URL(recon.url).hostname.replace(/^www\./, '').toLowerCase();
    const parts = h.split('.');
    const sld = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
    return sld
      .replace(/sessions?$/, '')
      .replace(/conf(?:erence)?$/, '')
      .replace(/summit$/, '')
      .replace(/events?$/, '');
  } catch { return null; }
})();

const filterArgs = process.argv.slice(2);
const userCompanyArg = (() => {
  const i = filterArgs.indexOf('--user-company');
  return i !== -1 ? filterArgs[i + 1] : null;
})();

// Compare via slugify on both sides so a profile slug like "acme-corp" matches a
// speaker's `company` of "Acme Corp" (which lower-cases to "acme corp" and would
// otherwise miss).
const dropList = new Set([
  hostOrg && slugify(hostOrg),
  userCompanyArg && slugify(userCompanyArg),
].filter(Boolean));

const filtered = people.filter(p => {
  if (!p.company) return true; // keep "unknown company" — synth assigns later
  return !dropList.has(slugify(p.company));
});

console.error(`Filtered ${people.length - filtered.length} host-org / user-company employees`);
people = filtered;

// Write people.jsonl
const peopleFile = join(outDir, 'people.jsonl');
writeFileSync(peopleFile, people.map(p => JSON.stringify(p)).join('\n') + '\n');

// Roll up to unique companies
const companies = [...new Set(people.map(p => p.company).filter(Boolean))].sort();
writeFileSync(join(outDir, 'seed_companies.txt'), companies.join('\n') + '\n');

console.error(`Extracted ${people.length} people, ${companies.length} unique companies → ${outDir}`);
console.log(JSON.stringify({ peopleCount: people.length, companyCount: companies.length, peopleFile }, null, 2));
