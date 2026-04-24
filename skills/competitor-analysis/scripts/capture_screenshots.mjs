#!/usr/bin/env node

// Capture hero + pricing screenshots for each competitor in the research directory.
// Reads per-competitor markdown files, extracts `website` and optional `pricing_url`
// frontmatter, navigates via `browse`, and writes PNGs to `{OUTPUT_DIR}/screenshots/`.
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

Reads all .md files in <research-dir>, extracts website + pricing URLs from the YAML
frontmatter, and captures two screenshots per competitor:
  - {slug}-hero.png      — 1280x800 viewport of the homepage
  - {slug}-pricing.png   — full-page screenshot of the pricing page

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

// Try common pricing URL patterns if the frontmatter doesn't list one explicitly.
function pricingCandidates(website) {
  const base = website.replace(/\/$/, '');
  return [`${base}/pricing`, `${base}/plans`, `${base}/pricing-plans`, base];
}

function run(cmd, args, { timeout = 30000 } = {}) {
  return spawnSync(cmd, args, { encoding: 'utf-8', timeout, maxBuffer: 4 * 1024 * 1024 });
}

// Ensure the browse env is set to the requested mode (one-time config).
const envRes = run('browse', ['env', browseEnv]);
if (envRes.status !== 0) {
  console.error(`Warning: could not set browse env to ${browseEnv}: ${envRes.stderr || envRes.stdout}`);
}

async function captureOne(slug, website, pricingUrl) {
  const heroPath = join(shotsDir, `${slug}-hero.png`);
  const pricingPath = join(shotsDir, `${slug}-pricing.png`);
  const result = { slug, hero: null, pricing: null, errors: [] };

  if (skipExisting && existsSync(heroPath) && existsSync(pricingPath)) {
    return { ...result, hero: heroPath, pricing: pricingPath, skipped: true };
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

  // Pricing: full-page; try explicit URL first, then common fallbacks
  const urlsToTry = pricingUrl ? [pricingUrl, ...pricingCandidates(website)] : pricingCandidates(website);
  let pricingOk = false;
  for (const url of urlsToTry) {
    try {
      const gotoRes = run('browse', ['goto', url], { timeout: 30000 });
      if (gotoRes.status !== 0) continue;
      run('browse', ['wait', 'timeout', '1500']);
      const r = run('browse', ['screenshot', '--full-page', '--no-animations', pricingPath]);
      if (r.status === 0 && existsSync(pricingPath)) { result.pricing = pricingPath; pricingOk = true; break; }
    } catch {}
  }
  if (!pricingOk) result.errors.push('pricing: no candidate URL captured');

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
  jobs.push({ slug, website: fm.website, pricingUrl: fm.pricing_url });
}

console.error(`Capturing screenshots for ${jobs.length} competitors → ${shotsDir}`);

const results = [];
const queue = [...jobs];
async function worker() {
  while (queue.length > 0) {
    const job = queue.shift();
    const started = Date.now();
    const r = await captureOne(job.slug, job.website, job.pricingUrl);
    results.push(r);
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    const marks = [r.hero ? 'H' : '-', r.pricing ? 'P' : '-'].join('');
    console.error(`  [${marks}] ${job.slug.padEnd(24)} ${elapsed}s ${r.skipped ? '(skipped)' : ''}`);
    if (r.errors.length) for (const e of r.errors) console.error(`       ! ${e.slice(0, 120)}`);
  }
}
await Promise.all(Array(Math.min(concurrency, jobs.length || 1)).fill(0).map(worker));

const okHero = results.filter(r => r.hero).length;
const okPricing = results.filter(r => r.pricing).length;
console.error(`\nDone: ${okHero}/${jobs.length} hero · ${okPricing}/${jobs.length} pricing`);
console.log(JSON.stringify({ total: jobs.length, hero: okHero, pricing: okPricing, outputDir: shotsDir }));
