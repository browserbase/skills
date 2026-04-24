#!/usr/bin/env node

// Capture homepage hero screenshot for each competitor in the research directory.
// Reads per-competitor markdown files, extracts `website` from frontmatter, navigates
// via `browse`, and writes one PNG per competitor to `{OUTPUT_DIR}/screenshots/`.
//
// Requires: `browse` CLI (`npm install -g @browserbasehq/browse-cli`), either local Chrome
// or a Browserbase remote session (`browse env remote`).
//
// Usage: node capture_screenshots.mjs <research-dir> [--env remote|local] [--concurrency 2]

import { readdirSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  console.error(`Usage: node capture_screenshots.mjs <research-dir> [options]

Reads all .md files in <research-dir>, extracts the "website" field from each
competitor's YAML frontmatter, and captures a 1280x800 viewport screenshot of the
homepage. Writes one PNG per competitor as {slug}-hero.png.

Output goes to <research-dir>/screenshots/.

Options:
  --env <remote|local>   Which browse env to use (default: remote)
  --concurrency <n>      How many competitors to capture in parallel (default: 1)
                         (screenshot takes ~3s; serial is usually fine)
  --skip-existing        Skip competitors that already have screenshots
  --help, -h             Show this help message`);
  process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
}

const dir = args[0];
const envIdx = args.indexOf('--env');
const browseEnv = envIdx !== -1 ? args[envIdx + 1] : 'remote';
const concurrencyIdx = args.indexOf('--concurrency');
const concurrency = concurrencyIdx !== -1 ? parseInt(args[concurrencyIdx + 1], 10) : 1;
const skipExisting = args.includes('--skip-existing');

const shotsDir = join(dir, 'screenshots');
mkdirSync(shotsDir, { recursive: true });

function parseFrontmatter(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const fields = {};
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const k = line.slice(0, idx).trim();
      const v = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (k && v) fields[k] = v;
    }
  }
  return fields;
}

function run(cmd, args, { timeout = 30000 } = {}) {
  return spawnSync(cmd, args, { encoding: 'utf-8', timeout, maxBuffer: 4 * 1024 * 1024 });
}

// Ensure the browse env is set to the requested mode (one-time config).
const envRes = run('browse', ['env', browseEnv]);
if (envRes.status !== 0) {
  console.error(`Warning: could not set browse env to ${browseEnv}: ${envRes.stderr || envRes.stdout}`);
}

async function captureOne(slug, website) {
  const heroPath = join(shotsDir, `${slug}-hero.png`);
  const result = { slug, hero: null, errors: [] };

  if (skipExisting && existsSync(heroPath)) {
    return { ...result, hero: heroPath, skipped: true };
  }

  // Hero: viewport 1280x800, single-screen shot
  try {
    run('browse', ['goto', website], { timeout: 30000 });
    run('browse', ['viewport', '1280', '800']);
    run('browse', ['wait', 'timeout', '1500']); // let the hero settle
    const r = run('browse', ['screenshot', '--no-animations', heroPath]);
    if (r.status === 0 && existsSync(heroPath)) result.hero = heroPath;
    else result.errors.push(`hero: ${r.stderr || r.stdout}`);
  } catch (err) { result.errors.push(`hero exception: ${err.message}`); }

  return result;
}

// Load competitor records
const files = readdirSync(dir).filter(f => f.endsWith('.md')).sort();
const jobs = [];
for (const f of files) {
  const content = readFileSync(join(dir, f), 'utf-8');
  const fm = parseFrontmatter(content);
  if (!fm || !fm.website) continue;
  const slug = f.replace('.md', '');
  jobs.push({ slug, website: fm.website });
}

console.error(`Capturing hero screenshots for ${jobs.length} competitors → ${shotsDir}`);

const results = [];
const queue = [...jobs];
async function worker() {
  while (queue.length > 0) {
    const job = queue.shift();
    const started = Date.now();
    const r = await captureOne(job.slug, job.website);
    results.push(r);
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    const mark = r.hero ? 'H' : '-';
    console.error(`  [${mark}] ${job.slug.padEnd(24)} ${elapsed}s ${r.skipped ? '(skipped)' : ''}`);
    if (r.errors.length) for (const e of r.errors) console.error(`       ! ${e.slice(0, 120)}`);
  }
}
await Promise.all(Array(Math.min(concurrency, jobs.length || 1)).fill(0).map(worker));

const okHero = results.filter(r => r.hero).length;
console.error(`\nDone: ${okHero}/${jobs.length} hero`);
console.log(JSON.stringify({ total: jobs.length, hero: okHero, outputDir: shotsDir }));
