#!/usr/bin/env node

// Merges per-lane partial markdown files into one consolidated file per competitor.
//
// The 5-lane subagent fan-out writes partials to: {OUTPUT_DIR}/partials/{slug}.{lane}.md
//   lane ∈ { marketing, discussion, social, news, technical }
//
// Each partial has its own YAML frontmatter + sections. The marketing partial owns
// the canonical frontmatter (pricing, features, etc.); other lanes contribute only
// Mentions / Benchmarks / Findings bullets. The merge:
//   1. Starts from marketing.md's frontmatter as the canonical header
//   2. Appends body sections in the canonical order (Product, Pricing, Features,
//      Positioning, Comparison, Mentions, Benchmarks, Research Findings)
//   3. Unions all Mentions bullets across lanes, dedups by URL, sorts by date desc
//   4. Unions all Research Findings bullets across lanes
//   5. Unions all Benchmarks bullets
//   6. Writes the consolidated file to {OUTPUT_DIR}/{slug}.md
//
// Usage: node merge_partials.mjs <research-dir>

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  console.error(`Usage: node merge_partials.mjs <research-dir>

Reads {dir}/partials/{slug}.{lane}.md files and writes consolidated
{dir}/{slug}.md per competitor. Lanes: marketing, discussion, social, news, technical.`);
  process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
}

const dir = args[0];
const partialsDir = join(dir, 'partials');

const LANES = ['marketing', 'discussion', 'social', 'news', 'technical'];

function parseFrontmatter(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return { fm: null, body: content };
  const fields = {};
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const k = line.slice(0, idx).trim();
      const v = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (k && v) fields[k] = v;
    }
  }
  const bodyMatch = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)/);
  return { fm: fields, body: bodyMatch ? bodyMatch[1].trim() : '' };
}

function parseSections(body) {
  const sections = {};
  const lines = body.split('\n');
  let currentKey = null;
  let buffer = [];
  for (const line of lines) {
    const m = line.match(/^## (.+)$/);
    if (m) {
      if (currentKey !== null) sections[currentKey] = buffer.join('\n').trim();
      currentKey = m[1].trim();
      buffer = [];
    } else if (currentKey !== null) {
      buffer.push(line);
    }
  }
  if (currentKey !== null) sections[currentKey] = buffer.join('\n').trim();
  return sections;
}

function extractBullets(sectionText) {
  if (!sectionText) return [];
  return sectionText.split('\n').map(l => l.trim()).filter(l => l.startsWith('- '));
}

function urlOf(bullet) {
  const m = bullet.match(/\(source:\s*([^,)]+)/);
  return m ? m[1].trim() : null;
}

function dateOf(bullet) {
  const m = bullet.match(/\(source:\s*[^,)]+,\s*(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

let files;
try { files = readdirSync(partialsDir); } catch {
  console.error(`No partials directory at ${partialsDir} — nothing to merge.`);
  process.exit(0);
}

// Group partials by slug
const bySlug = new Map();
for (const f of files) {
  if (!f.endsWith('.md')) continue;
  const m = f.match(/^(.+)\.([a-z]+)\.md$/);
  if (!m) continue;
  const slug = m[1];
  const lane = m[2];
  if (!LANES.includes(lane)) continue;
  if (!bySlug.has(slug)) bySlug.set(slug, {});
  const content = readFileSync(join(partialsDir, f), 'utf-8');
  bySlug.get(slug)[lane] = parseFrontmatter(content);
}

let merged = 0;
for (const [slug, lanes] of bySlug.entries()) {
  const marketing = lanes.marketing;
  if (!marketing || !marketing.fm) {
    console.error(`[skip] ${slug}: no marketing partial — cannot form canonical frontmatter`);
    continue;
  }

  // Union body sections
  const allSections = {};
  for (const lane of LANES) {
    if (!lanes[lane]) continue;
    const secs = parseSections(lanes[lane].body);
    for (const [k, v] of Object.entries(secs)) {
      if (!allSections[k]) allSections[k] = [];
      allSections[k].push(v);
    }
  }

  // Dedup Mentions by URL, sort by date desc
  const mentionBullets = (allSections['Mentions'] || []).flatMap(s => extractBullets(s));
  const seenUrls = new Set();
  const dedupedMentions = [];
  for (const b of mentionBullets) {
    const u = urlOf(b);
    const key = u || b; // fallback to bullet text if no URL
    if (seenUrls.has(key)) continue;
    seenUrls.add(key);
    dedupedMentions.push(b);
  }
  dedupedMentions.sort((a, b) => {
    const da = dateOf(a), db = dateOf(b);
    if (da && db) return db.localeCompare(da);
    if (da) return -1;
    if (db) return 1;
    return 0;
  });

  // Dedup Benchmarks by URL
  const benchmarkBullets = (allSections['Benchmarks'] || []).flatMap(s => extractBullets(s));
  const seenBench = new Set();
  const dedupedBench = [];
  for (const b of benchmarkBullets) {
    const m = b.match(/https?:\/\/\S+/);
    const key = m ? m[0] : b;
    if (seenBench.has(key)) continue;
    seenBench.add(key);
    dedupedBench.push(b);
  }

  // Dedup Findings loosely (by exact text)
  const findingBullets = (allSections['Research Findings'] || []).flatMap(s => extractBullets(s));
  const dedupedFindings = [...new Set(findingBullets)];

  // Merge/prefer marketing for Product/Pricing/Features/Positioning/Comparison
  function first(key) {
    const arr = allSections[key] || [];
    return arr.length ? arr[0] : '';
  }

  // Rebuild frontmatter (marketing's FM wins; other lanes may add `pricing_url` or `strategic_diff`)
  const mergedFm = { ...marketing.fm };
  for (const lane of LANES) {
    if (!lanes[lane] || !lanes[lane].fm) continue;
    for (const [k, v] of Object.entries(lanes[lane].fm)) {
      if (!mergedFm[k] && v) mergedFm[k] = v;
    }
  }

  const fmLines = Object.entries(mergedFm).map(([k, v]) => `${k}: ${v}`).join('\n');

  // Comparison heading may be "Comparison vs Browserbase" etc — find any key starting with "Comparison"
  const comparisonKey = Object.keys(allSections).find(k => k.startsWith('Comparison'));

  const out = [
    '---',
    fmLines,
    '---',
    '',
    first('Product') ? `## Product\n${first('Product')}\n` : '',
    first('Pricing') ? `## Pricing\n${first('Pricing')}\n` : '',
    first('Features') ? `## Features\n${first('Features')}\n` : '',
    first('Positioning') ? `## Positioning\n${first('Positioning')}\n` : '',
    comparisonKey && allSections[comparisonKey].length ? `## ${comparisonKey}\n${allSections[comparisonKey][0]}\n` : '',
    dedupedMentions.length ? `## Mentions\n${dedupedMentions.join('\n')}\n` : '',
    dedupedBench.length ? `## Benchmarks\n${dedupedBench.join('\n')}\n` : '',
    dedupedFindings.length ? `## Research Findings\n${dedupedFindings.join('\n')}\n` : '',
  ].filter(Boolean).join('\n');

  writeFileSync(join(dir, `${slug}.md`), out);
  merged += 1;
  console.error(`[ok]   ${slug}: ${dedupedMentions.length} mentions, ${dedupedBench.length} benchmarks, ${dedupedFindings.length} findings`);
}

console.log(JSON.stringify({ merged, competitors: bySlug.size }));
