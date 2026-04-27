#!/usr/bin/env node
// enrich_person.mjs — given a person record, run a sequence of bb searches and
// emit a structured enrichment record. Used by the per-person subagent.
//
// Usage: enrich_person.mjs --name "Greg Brockman" --company "OpenAI" --linkedin "https://..." --depth deep

import { execFileSync } from 'child_process';

function flag(name, def) {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : def;
}

const name = flag('--name');
const company = flag('--company', '');
const linkedinIn = flag('--linkedin', '');
const depth = flag('--depth', 'deep');

if (!name) { console.error('--name required'); process.exit(1); }

function bbSearch(query, n = 5) {
  const out = execFileSync('bb', ['search', query, '--num-results', String(n)], {
    encoding: 'utf-8', maxBuffer: 4 * 1024 * 1024, timeout: 20000,
  });
  return JSON.parse(out);
}

function harvestLinks(results) {
  const links = { linkedin: linkedinIn || null, x: null, github: null, blog: null, podcast: null };
  for (const r of results) {
    const u = r.url || '';
    if (!links.linkedin && /linkedin\.com\/in\//.test(u)) links.linkedin = u;
    if (!links.x && /(x|twitter)\.com/.test(u)) links.x = u;
    if (!links.github && /github\.com/.test(u)) links.github = u;
    if (!links.podcast && /(spotify|podcast|simplecast|transistor)/.test(u)) links.podcast = u;
    if (!links.blog && /(medium|substack|hashnode|dev\.to|\.blog)/.test(u)) links.blog = u;
  }
  return links;
}

const out = { name, company, linkedin: linkedinIn, hooks: [], links: {} };

// Lane 1 — LinkedIn verify (always)
const r1 = bbSearch(`${name} ${company} linkedin`);
out.links = harvestLinks(r1.results || []);

// Lane 2 — Recent activity (deep+)
if (depth === 'deep' || depth === 'deeper') {
  const r2 = bbSearch(`"${name}" podcast OR talk OR blog 2026`);
  out.recentActivity = (r2.results || []).slice(0, 3).map(r => ({ title: r.title, url: r.url }));
}

// Lane 3 — GitHub + X (deeper)
if (depth === 'deeper') {
  const r3 = bbSearch(`"${name}" github`);
  const r4 = bbSearch(`"${name}" site:x.com OR site:twitter.com`);
  // Only fill in fields Lane 1 didn't already find — harvestLinks returns null for
  // missing keys, so a naive spread would clobber known LinkedIn/X URLs.
  const more = harvestLinks([...(r3.results || []), ...(r4.results || [])]);
  for (const [k, v] of Object.entries(more)) {
    if (v && !out.links[k]) out.links[k] = v;
  }
}

console.log(JSON.stringify(out, null, 2));
