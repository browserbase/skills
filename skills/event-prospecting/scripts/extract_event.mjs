#!/usr/bin/env node
// extract_event.mjs — enhanced with deduplication, CSV export, and stats

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

function normalizeLinkedIn(url) {
  if (!url) return null;
  const m = url.match(/linkedin\.com\/in\/([\w-]+)/i);
  return m ? `https://www.linkedin.com/in/${m[1]}/` : url;
}

function extractFromNextData(paths) {
  const js = `(() => {
    const data = JSON.parse(document.getElementById('__NEXT_DATA__').textContent);
    function get(obj, path) {
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
      const re = /portrait|headshot|photo|image|picture|avatar|thumbnail/i;
      const keys = Object.keys(s).filter(k => re.test(k));
      keys.sort((a, b) => (/mono|grey|gray|black/i.test(a) ? 1 : 0) - (/mono|grey|gray|black/i.test(b) ? 1 : 0));
      function unwrap(v) {
        if (!v) return null;
        if (typeof v === 'string') return v;
        if (Array.isArray(v)) return v.map(unwrap).find(Boolean) || null;
        if (typeof v === 'object') return v.url || v.src || (v.asset && v.asset.url) || (v.fields && v.fields.file && v.fields.file.url) || null;
        return null;
      }
      for (const k of keys) {
        const got = unwrap(s[k]);
        if (got) return got;
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
  browse('goto', recon.url);
  browse('wait', 'timeout', '2000');
  const evalRes = JSON.parse(browse('eval', js));
  return evalRes.result || [];
}

function extractFromMarkdown() {
  browse('goto', recon.url);
  browse('wait', 'timeout', '2500');
  const md = JSON.parse(browse('get', 'markdown')).markdown || '';
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

let people = recon.strategy === 'next-data-eval'
  ? extractFromNextData(recon.nextDataPaths || [])
  : extractFromMarkdown();

const eventOrigin = (() => { try { return new URL(recon.url).origin; } catch { return null; } })();
const resolveImage = src => !src ? null : /^https?:\/\//i.test(src) ? src : src.startsWith('//') ? 'https:' + src : src.startsWith('/') && eventOrigin ? eventOrigin + src : src;

const slugCounts = new Map();
people = people.map(p => {
  const base = slugify(p.name);
  const n = (slugCounts.get(base) || 0) + 1;
  slugCounts.set(base, n);
  return { ...p, linkedin: normalizeLinkedIn(p.linkedin), image: resolveImage(p.image), slug: n === 1 ? base : `${base}-${n}` };
});

// 🔥 NEW: Deduplicate
const seen = new Set();
people = people.filter(p => {
  const key = p.linkedin || p.name;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

// Filtering
const hostOrg = (() => {
  try {
    const h = new URL(recon.url).hostname.replace(/^www\./, '').toLowerCase();
    const parts = h.split('.');
    const sld = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
    const stripped = sld.replace(/(?:sessions?|conf(?:erence)?|summit|events?)$/, '');
    return (stripped !== sld && stripped.length >= 5) ? stripped : sld;
  } catch { return null; }
})();

const userCompanyArg = (() => {
  const i = process.argv.indexOf('--user-company');
  return i !== -1 ? process.argv[i + 1] : null;
})();

const dropList = new Set([hostOrg && slugify(hostOrg), userCompanyArg && slugify(userCompanyArg)].filter(Boolean));

people = people.filter(p => !p.company || !dropList.has(slugify(p.company)));

// Write JSONL
const peopleFile = join(outDir, 'people.jsonl');
writeFileSync(peopleFile, people.map(p => JSON.stringify(p)).join('\n') + '\n');

// 🔥 NEW: CSV Export
const csv = ['name,title,company,linkedin,image'].concat(
  people.map(p => `"${p.name}","${p.title}","${p.company}","${p.linkedin}","${p.image}"`)
).join('\n');
writeFileSync(join(outDir, 'people.csv'), csv);

// Unique companies
const companies = [...new Set(people.map(p => p.company).filter(Boolean))].sort();
writeFileSync(join(outDir, 'seed_companies.txt'), companies.join('\n') + '\n');

// 🔥 NEW: Stats
const stats = {
  total: people.length,
  missingLinkedIn: people.filter(p => !p.linkedin).length,
  missingImages: people.filter(p => !p.image).length
};

console.error(`Stats:`, stats);
console.log(JSON.stringify({ peopleCount: people.length, companyCount: companies.length, stats, peopleFile }, null, 2));        else cur = cur[parseInt(t.slice(1, -1), 10)];
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
      // Unwrap a single image value (string, object, or array of either —
      // Sanity / custom CMSes sometimes use plural keys like \`images: [{url}]\`).
      function unwrap(v) {
        if (!v) return null;
        if (typeof v === 'string') return v;
        if (Array.isArray(v)) {
          for (const item of v) {
            const got = unwrap(item);
            if (got) return got;
          }
          return null;
        }
        if (typeof v === 'object') {
          if (typeof v.url === 'string') return v.url;
          if (typeof v.src === 'string') return v.src;
          if (v.asset && typeof v.asset.url === 'string') return v.asset.url;
          if (v.fields && v.fields.file && typeof v.fields.file.url === 'string') return v.fields.file.url;
        }
        return null;
      }
      for (const k of keys) {
        const got = unwrap(s[k]);
        if (got) return got;
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
  // Don't JSON.parse goto's output — `browse goto` can emit non-JSON banners,
  // and we don't use the return value. The matching `extractFromMarkdown` path
  // ignores it the same way.
  browse('goto', recon.url);
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

// Add a slug + normalize image URL. Disambiguate duplicate names with -2, -3,
// etc. so a later subagent's people/{slug}.md write doesn't silently overwrite
// a previous speaker who happens to share a name.
const slugCounts = new Map();
people = people.map(p => {
  const base = slugify(p.name);
  const n = (slugCounts.get(base) || 0) + 1;
  slugCounts.set(base, n);
  const slug = n === 1 ? base : `${base}-${n}`;
  return { ...p, image: resolveImage(p.image), slug };
});

// Filter event-host employees and obvious noise. The host org is derived from
// the event URL — for `stripesessions.com` that's stripe; for subdomain-hosted
// events like `events.stripe.com` we want stripe (not "events"). We take the
// registrable-domain chunk (parts[-2]) and try to strip a single event-platform
// suffix. Guarded by a min-length check on the result so `devconf.io` doesn't
// collapse to `dev` (and silently filter speakers from DEV / dev.to), and
// `aiconf.io` doesn't collapse to `ai`. Falls down on .co.uk-style public
// suffixes; v0.1 accepts that.
const hostOrg = (() => {
  try {
    const h = new URL(recon.url).hostname.replace(/^www\./, '').toLowerCase();
    const parts = h.split('.');
    const sld = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
    const stripped = sld.replace(/(?:sessions?|conf(?:erence)?|summit|events?)$/, '');
    return (stripped !== sld && stripped.length >= 5) ? stripped : sld;
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
