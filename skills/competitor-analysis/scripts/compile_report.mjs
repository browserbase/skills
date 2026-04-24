#!/usr/bin/env node

// Compiles per-competitor markdown files into an HTML report + CSV.
// Produces four views: index.html (overview), competitors/*.html (deep dive),
// matrix.html (side-by-side feature/pricing grid), mentions.html (chronological feed).
//
// Usage: node compile_report.mjs <research-dir> [--user-company "Acme"] [--template <path>] [--open]

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  console.error(`Usage: node compile_report.mjs <research-dir> [--user-company "<name>"] [--template <path>] [--open]

Reads all .md files from <research-dir>, generates:
  - index.html  — overview: competitor table with tagline, pricing, features, strategic diff
  - competitors/<slug>.html — per-competitor deep dive pages
  - matrix.html — side-by-side feature/pricing grid across competitors
  - mentions.html — chronological feed of all external mentions with source-type filter
  - results.csv — flat spreadsheet

Options:
  --user-company <name>  Name of the user's company (used in comparison sections)
  --template <path>      Path to report-template.html (default: auto-detect)
  --open                 Open index.html in the default browser after generation
  --help, -h             Show this help message`);
  process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
}

const dir = args[0];
const shouldOpen = args.includes('--open');
const userCompanyIdx = args.indexOf('--user-company');
const userCompany = userCompanyIdx !== -1 ? args[userCompanyIdx + 1] : '';
const templateIdx = args.indexOf('--template');
let templatePath = templateIdx !== -1 ? args[templateIdx + 1] : null;

if (!templatePath) {
  const candidates = [
    join(__dirname, '..', 'references', 'report-template.html'),
    join(__dirname, 'report-template.html'),
  ];
  templatePath = candidates.find(p => existsSync(p));
  if (!templatePath) {
    console.error('Error: Could not find report-template.html. Use --template to specify path.');
    process.exit(1);
  }
}

const template = readFileSync(templatePath, 'utf-8');

let files;
try {
  files = readdirSync(dir).filter(f => f.endsWith('.md')).sort();
} catch (err) {
  console.error(`Error reading directory ${dir}: ${err.message}`);
  process.exit(1);
}

if (files.length === 0) {
  console.error(`No .md files found in ${dir}`);
  process.exit(1);
}

// ---------- Parsing ----------

function parseFrontmatter(content) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;
  const fields = {};
  for (const line of fmMatch[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (key && val) fields[key] = val;
    }
  }
  return fields;
}

function parseBody(content) {
  const bodyMatch = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)/);
  return bodyMatch ? bodyMatch[1].trim() : '';
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

// Parse Mentions section into structured entries.
// Format: `- **[SourceType]** Title | Snippet (source: URL, YYYY-MM-DD)`
function parseMentions(sectionText) {
  if (!sectionText) return [];
  const out = [];
  for (const raw of sectionText.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('- ')) continue;
    const typeM = line.match(/^-\s*\*\*\[([^\]]+)\]\*\*\s*(.*)$/);
    if (!typeM) continue;
    const sourceType = typeM[1].trim();
    let rest = typeM[2];

    let url = '';
    let date = '';
    const sourceM = rest.match(/\(source:\s*([^)]+)\)\s*$/);
    if (sourceM) {
      const sourceBlock = sourceM[1];
      const parts = sourceBlock.split(',').map(s => s.trim()).filter(Boolean);
      url = parts[0] || '';
      const dateCandidate = parts.slice(1).join(', ');
      if (dateCandidate && /\d{4}-\d{2}-\d{2}/.test(dateCandidate)) date = dateCandidate.match(/\d{4}-\d{2}-\d{2}/)[0];
      rest = rest.slice(0, sourceM.index).trim();
    }

    let title = rest;
    let snippet = '';
    const pipeIdx = rest.indexOf('|');
    if (pipeIdx !== -1) {
      title = rest.slice(0, pipeIdx).trim();
      snippet = rest.slice(pipeIdx + 1).trim();
    }

    out.push({ sourceType, title, snippet, url, date });
  }
  return out;
}

// Parse Benchmarks section into structured entries.
// Format: `- Title | Source | URL | Key finding`  or  `- **Title** — Source (URL): finding`
function parseBenchmarks(sectionText) {
  if (!sectionText) return [];
  const out = [];
  for (const raw of sectionText.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('- ')) continue;
    const rest = line.slice(2).trim();
    const parts = rest.split('|').map(s => s.trim()).filter(Boolean);
    let title = '', source = '', url = '', finding = '';
    if (parts.length >= 4) {
      [title, source, url, finding] = parts;
    } else if (parts.length === 3) {
      [title, url, finding] = parts;
    } else {
      title = rest;
      const urlM = rest.match(/https?:\/\/\S+/);
      if (urlM) url = urlM[0];
    }
    out.push({ title, source, url, finding });
  }
  return out;
}

function splitPipes(s) {
  return (s || '').split('|').map(x => x.trim()).filter(Boolean);
}

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function mdToHtml(md) {
  const lines = md.split('\n');
  const out = [];
  let inList = false;
  let paraLines = [];

  function flushPara() {
    if (paraLines.length > 0) {
      let text = escapeHtml(paraLines.join(' ').trim());
      text = text.replace(/\*\*\[(\w+)\]\*\*/g, '<span class="confidence $1">[$1]</span>');
      text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      if (text) out.push(`<p>${text}</p>`);
      paraLines = [];
    }
  }
  function closeList() { if (inList) { out.push('</ul>'); inList = false; } }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { flushPara(); closeList(); continue; }
    if (trimmed.startsWith('## ')) { flushPara(); closeList(); out.push(`<h2>${escapeHtml(trimmed.slice(3))}</h2>`); continue; }
    if (trimmed.startsWith('### ')) { flushPara(); closeList(); out.push(`<h3>${escapeHtml(trimmed.slice(4))}</h3>`); continue; }
    if (trimmed.startsWith('- ')) {
      flushPara();
      if (!inList) { out.push('<ul>'); inList = true; }
      let text = escapeHtml(trimmed.slice(2));
      text = text.replace(/\*\*\[(\w+)\]\*\*/g, '<span class="confidence $1">[$1]</span>');
      text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      text = text.replace(/(https?:\/\/\S+)/g, '<a href="$1" target="_blank">$1</a>');
      out.push(`<li>${text}</li>`);
      continue;
    }
    closeList();
    paraLines.push(trimmed);
  }
  flushPara(); closeList();
  return out.join('\n');
}

// ---------- Load all competitor records ----------

const competitors = [];
for (const file of files) {
  const content = readFileSync(join(dir, file), 'utf-8');
  const fields = parseFrontmatter(content);
  if (!fields) continue;
  const body = parseBody(content);
  const sections = parseSections(body);
  const mentions = parseMentions(sections['Mentions']);
  const benchmarks = parseBenchmarks(sections['Benchmarks']);
  const slug = file.replace('.md', '');
  competitors.push({ ...fields, body, sections, mentions, benchmarks, slug, file });
}

// Deduplicate by normalized competitor name (keep first occurrence — richer data tends to come first alphabetically)
const seen = new Map();
for (const c of competitors) {
  const name = (c.competitor_name || '').toLowerCase().replace(/\s*(inc|llc|ltd|corp|co)\s*\.?$/i, '').trim();
  if (!seen.has(name)) seen.set(name, c);
}
const deduped = [...seen.values()].sort((a, b) => (a.competitor_name || '').localeCompare(b.competitor_name || ''));

// ---------- Aggregates ----------

const totalMentions = deduped.reduce((sum, c) => sum + c.mentions.length, 0);
const totalBenchmarks = deduped.reduce((sum, c) => sum + c.benchmarks.length, 0);
const withPricing = deduped.filter(c => c.pricing_tiers).length;

const dirName = dir.split('/').pop();
const title = dirName.replace(/_/g, ' ').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const genDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
const metaLine = `${deduped.length} competitors · ${totalMentions} mentions · ${totalBenchmarks} benchmarks · ${genDate}`;

// ---------- index.html (overview) ----------

function featurePills(featuresStr, max = 4) {
  const feats = splitPipes(featuresStr).slice(0, max);
  return feats.map(f => `<span class="pill pill-feature">${escapeHtml(f)}</span>`).join('');
}

const tableRows = deduped.map(c => {
  const hasDetail = c.body && c.body.length > 50;
  const nameHtml = hasDetail
    ? `<a href="competitors/${c.slug}.html">${escapeHtml(c.competitor_name)}</a>`
    : escapeHtml(c.competitor_name);
  const websiteHtml = c.website
    ? `<span class="muted-line"><a href="${escapeHtml(c.website)}" target="_blank" style="color:var(--muted);">${escapeHtml(c.website.replace(/^https?:\/\/(www\.)?/, ''))}</a></span>`
    : '';
  const pricingShort = splitPipes(c.pricing_tiers).slice(0, 3).join(' · ') || '—';
  return `      <tr>
        <td><strong>${nameHtml}</strong>${websiteHtml}</td>
        <td style="max-width:260px;">${escapeHtml(c.tagline || c.positioning || c.product_description || '')}</td>
        <td style="max-width:180px;">${escapeHtml(pricingShort)}</td>
        <td style="max-width:260px;">${featurePills(c.key_features)}</td>
        <td class="muted-line" style="max-width:260px;color:var(--muted);font-size:0.8125rem;">${escapeHtml(c.strategic_diff || '')}</td>
      </tr>`;
}).join('\n');

let indexHtml = template
  .replace(/\{\{TITLE\}\}/g, escapeHtml(`${title}`))
  .replace(/\{\{META\}\}/g, escapeHtml(metaLine))
  .replace(/\{\{TOTAL\}\}/g, String(deduped.length))
  .replace(/\{\{MENTION_COUNT\}\}/g, String(totalMentions))
  .replace(/\{\{BENCHMARK_COUNT\}\}/g, String(totalBenchmarks))
  .replace(/\{\{WITH_PRICING\}\}/g, String(withPricing))
  .replace(/\{\{TABLE_ROWS\}\}/g, tableRows);

writeFileSync(join(dir, 'index.html'), indexHtml);

// ---------- competitors/{slug}.html ----------

try { mkdirSync(join(dir, 'competitors'), { recursive: true }); } catch {}

const perCompetitorCss = `
  :root { --brand:#F03603; --blue:#4DA9E4; --black:#100D0D; --gray:#514F4F; --border:#edebeb; --bg:#F9F6F4; --card:#ffffff; --text:#100D0D; --muted:#514F4F; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; background:var(--bg); color:var(--text); line-height:1.6; font-size:16px; }
  .container { max-width:880px; margin:0 auto; padding:2rem 1.5rem; }
  a { color:var(--brand); text-decoration:none; }
  a:hover { text-decoration:underline; }
  .back { font-size:0.875rem; color:var(--muted); margin-bottom:1.5rem; display:inline-block; }
  .back:hover { color:var(--brand); }
  header { margin-bottom:2rem; }
  header h1 { font-size:1.5rem; font-weight:600; margin-bottom:0.25rem; }
  header .meta { color:var(--muted); font-size:0.875rem; }
  .fields { background:var(--card); border:1px solid var(--border); border-radius:4px; padding:1.25rem; margin-bottom:2rem; display:grid; grid-template-columns:auto 1fr; gap:0.375rem 1rem; font-size:0.875rem; }
  .fields dt { color:var(--muted); font-weight:500; }
  .fields dd { color:var(--text); }
  .research { background:var(--card); border:1px solid var(--border); border-radius:4px; padding:1.5rem; margin-bottom:1.25rem; }
  .research h2 { font-size:1.125rem; font-weight:600; margin:1.5rem 0 0.5rem 0; color:var(--black); }
  .research h2:first-child { margin-top:0; }
  .research p { margin-bottom:0.75rem; }
  .research ul { margin:0.5rem 0 1rem 1.25rem; }
  .research li { margin-bottom:0.375rem; font-size:0.875rem; }
  .confidence { font-size:0.75rem; font-weight:600; padding:1px 6px; border-radius:2px; }
  .confidence.high { background:rgba(144,201,77,0.12); color:#5a8a1a; }
  .confidence.medium { background:rgba(244,186,65,0.12); color:#9a7520; }
  .confidence.low { background:rgba(240,54,3,0.08); color:var(--brand); }
  .mention-item { display:flex; gap:0.5rem; align-items:flex-start; padding:0.5rem 0; border-bottom:1px solid var(--border); font-size:0.875rem; }
  .mention-item:last-child { border-bottom:none; }
  .src-pill { font-size:0.6875rem; font-weight:600; padding:2px 8px; border-radius:999px; white-space:nowrap; border:1px solid; }
  .src-Benchmark { background:rgba(77,169,228,0.12); color:#2172a3; border-color:rgba(77,169,228,0.4); }
  .src-Comparison { background:rgba(240,54,3,0.10); color:var(--brand); border-color:rgba(240,54,3,0.4); }
  .src-News { background:#f2f2f2; color:var(--black); border-color:#ddd; }
  .src-Reddit { background:#fff2eb; color:#d84300; border-color:#ffd4b7; }
  .src-HN { background:#fff4e5; color:#c95500; border-color:#ffcc99; }
  .src-LinkedIn { background:#e7f1fa; color:#0a66c2; border-color:#b3d4ee; }
  .src-YouTube { background:#ffebee; color:#c4302b; border-color:#f7b2ae; }
  .src-Review { background:rgba(144,201,77,0.12); color:#5a8a1a; border-color:rgba(144,201,77,0.4); }
  .src-Podcast { background:#efe7fa; color:#6236c2; border-color:#d1bde9; }
  .src-X { background:#eef2f7; color:#111; border-color:#cfd9e5; }
  .src-Twitter { background:#eef2f7; color:#111; border-color:#cfd9e5; }
  .src-DevTo { background:#f3f3f6; color:#0a0a0a; border-color:#dcdce0; }
  .src-Hashnode { background:#eef4ff; color:#2962ff; border-color:#c6d8ff; }
  .src-Substack { background:#fff4e5; color:#ff6719; border-color:#ffd4b7; }
  .src-Blog { background:#f6f3ee; color:#6a5d45; border-color:#e1dbcc; }
  .shots { margin-bottom:1.5rem; }
  .shot { background:var(--card); border:1px solid var(--border); border-radius:4px; overflow:hidden; }
  .shot-label { font-size:0.6875rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--muted); font-weight:600; padding:0.5rem 0.75rem; border-bottom:1px solid var(--border); background:#fafafa; }
  .shot img { display:block; width:100%; height:auto; }
  footer { margin-top:3rem; padding-top:1.5rem; border-top:1px solid var(--border); text-align:center; font-size:0.75rem; color:var(--muted); }
  footer a { color:var(--brand); text-decoration:none; font-weight:500; }
`;

for (const c of deduped) {
  if (!c.body || c.body.length < 50) continue;

  const mentionsHtml = c.mentions.length
    ? c.mentions.map(m => {
        const dateStr = m.date ? `<span class="muted-line" style="color:var(--muted);font-size:0.75rem;margin-left:auto;">${escapeHtml(m.date)}</span>` : '';
        const linkText = m.url ? `<a href="${escapeHtml(m.url)}" target="_blank">${escapeHtml(m.title || m.url)}</a>` : escapeHtml(m.title);
        const snippet = m.snippet ? ` — <span style="color:var(--muted);">${escapeHtml(m.snippet)}</span>` : '';
        return `<div class="mention-item"><span class="src-pill src-${escapeHtml(m.sourceType)}">${escapeHtml(m.sourceType)}</span><div style="flex:1;">${linkText}${snippet}</div>${dateStr}</div>`;
      }).join('\n')
    : '<p style="color:var(--muted);font-size:0.875rem;">No mentions collected.</p>';

  const benchmarksHtml = c.benchmarks.length
    ? `<ul>${c.benchmarks.map(b => {
        const link = b.url ? `<a href="${escapeHtml(b.url)}" target="_blank">${escapeHtml(b.title || b.url)}</a>` : escapeHtml(b.title);
        const src = b.source ? ` <span style="color:var(--muted);">(${escapeHtml(b.source)})</span>` : '';
        const finding = b.finding ? ` — ${escapeHtml(b.finding)}` : '';
        return `<li>${link}${src}${finding}</li>`;
      }).join('')}</ul>`
    : '';

  const productHtml = c.sections['Product'] ? `<h2>Product</h2>${mdToHtml(c.sections['Product'])}` : '';
  const pricingHtml = c.sections['Pricing'] ? `<h2>Pricing</h2>${mdToHtml(c.sections['Pricing'])}` : '';
  const featuresHtml = c.sections['Features'] ? `<h2>Features</h2>${mdToHtml(c.sections['Features'])}` : '';
  const positioningHtml = c.sections['Positioning'] ? `<h2>Positioning</h2>${mdToHtml(c.sections['Positioning'])}` : '';
  const comparisonKey = Object.keys(c.sections).find(k => k.startsWith('Comparison'));
  const comparisonHtml = comparisonKey ? `<h2>${escapeHtml(comparisonKey)}</h2>${mdToHtml(c.sections[comparisonKey])}` : '';
  const findingsHtml = c.sections['Research Findings'] ? `<h2>Research Findings</h2>${mdToHtml(c.sections['Research Findings'])}` : '';

  // Screenshot — filename matches capture_screenshots.mjs output.
  const heroShot = existsSync(join(dir, 'screenshots', `${c.slug}-hero.png`));
  const screenshotsHtml = heroShot ? `
  <div class="shots">
    <div class="shot shot-hero"><div class="shot-label">Homepage</div><img src="../screenshots/${escapeHtml(c.slug)}-hero.png" alt="${escapeHtml(c.competitor_name)} homepage hero" loading="lazy"></div>
  </div>` : '';

  const companyHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(c.competitor_name)} — Competitor Analysis</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${perCompetitorCss}</style>
</head>
<body>
<div class="container">
  <a href="../index.html" class="back">&larr; Back to overview</a>
  <header>
    <h1>${escapeHtml(c.competitor_name)}</h1>
    <div class="meta">
      ${c.website ? `<a href="${escapeHtml(c.website)}" target="_blank">${escapeHtml(c.website)}</a>` : ''}
      ${c.tagline ? ` · ${escapeHtml(c.tagline)}` : ''}
    </div>
  </header>${screenshotsHtml}
  <dl class="fields">
    ${c.positioning ? `<dt>Positioning</dt><dd>${escapeHtml(c.positioning)}</dd>` : ''}
    ${c.product_description ? `<dt>Product</dt><dd>${escapeHtml(c.product_description)}</dd>` : ''}
    ${c.target_customer ? `<dt>Target Customer</dt><dd>${escapeHtml(c.target_customer)}</dd>` : ''}
    ${c.pricing_model ? `<dt>Pricing Model</dt><dd>${escapeHtml(c.pricing_model)}</dd>` : ''}
    ${c.pricing_tiers ? `<dt>Pricing Tiers</dt><dd>${escapeHtml(c.pricing_tiers)}</dd>` : ''}
    ${c.key_features ? `<dt>Key Features</dt><dd>${escapeHtml(c.key_features)}</dd>` : ''}
    ${c.integrations ? `<dt>Integrations</dt><dd>${escapeHtml(c.integrations)}</dd>` : ''}
    ${c.headquarters ? `<dt>HQ</dt><dd>${escapeHtml(c.headquarters)}</dd>` : ''}
    ${c.founded ? `<dt>Founded</dt><dd>${escapeHtml(c.founded)}</dd>` : ''}
    ${c.employee_estimate ? `<dt>Employees</dt><dd>${escapeHtml(c.employee_estimate)}</dd>` : ''}
    ${c.funding_info ? `<dt>Funding</dt><dd>${escapeHtml(c.funding_info)}</dd>` : ''}
    ${c.strategic_diff ? `<dt>Strategic Diff</dt><dd>${escapeHtml(c.strategic_diff)}</dd>` : ''}
  </dl>
  <div class="research">
    ${productHtml}
    ${pricingHtml}
    ${featuresHtml}
    ${positioningHtml}
    ${comparisonHtml}
  </div>
  <div class="research">
    <h2>Mentions</h2>
    ${mentionsHtml}
  </div>
  ${c.benchmarks.length ? `<div class="research"><h2>Benchmarks</h2>${benchmarksHtml}</div>` : ''}
  ${findingsHtml ? `<div class="research">${findingsHtml}</div>` : ''}
</div>
<footer>Generated by <a href="https://github.com/anthropics/skills">competitor-analysis</a> · Powered by <a href="https://browserbase.com">Browserbase</a></footer>
</body>
</html>`;

  writeFileSync(join(dir, 'competitors', `${c.slug}.html`), companyHtml);
}

// ---------- matrix.html (side-by-side) ----------

// Prefer a curated taxonomy from `matrix.json` when present — subagents write
// heterogeneous prose into key_features/integrations frontmatter, so the raw
// split-by-pipe axis is one-blob-per-competitor (no overlap, no comparison).
// `matrix.json` defines a shared axis of atomic features and a yes/no mapping
// per competitor, producing a real comparison.
let curatedMatrix = null;
try {
  const p = join(dir, 'matrix.json');
  if (existsSync(p)) curatedMatrix = JSON.parse(readFileSync(p, 'utf-8'));
} catch (err) {
  console.error(`Warning: matrix.json present but unreadable — falling back to pipe split. ${err.message}`);
}

function buildMatrixAxisFromCurated(kind) {
  if (!curatedMatrix || !curatedMatrix[kind]) return [];
  return curatedMatrix[kind].map(entry => {
    const label = entry.name;
    let count = 0;
    for (const c of deduped) {
      const compKey = curatedMatrix.competitors[c.slug];
      if (compKey && compKey[kind] && compKey[kind][label]) count += 1;
    }
    return { label, count, description: entry.description || '' };
  });
}

function buildMatrixAxisFromPipes(field) {
  const counts = new Map();
  for (const c of deduped) {
    for (const item of splitPipes(c[field])) {
      const key = item.toLowerCase();
      if (!counts.has(key)) counts.set(key, { label: item, count: 0 });
      counts.get(key).count += 1;
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 18);
}

const featureAxis = curatedMatrix
  ? buildMatrixAxisFromCurated('features')
  : buildMatrixAxisFromPipes('key_features');
const integrationAxis = curatedMatrix
  ? buildMatrixAxisFromCurated('integrations')
  : buildMatrixAxisFromPipes('integrations');

function competitorHas(c, field, label) {
  // Curated mode: look up in matrix.json (field is 'features' or 'integrations').
  if (curatedMatrix) {
    const compEntry = curatedMatrix.competitors[c.slug];
    return !!(compEntry && compEntry[field] && compEntry[field][label]);
  }
  // Fallback: raw pipe-split match.
  const rawField = field === 'features' ? 'key_features' : field;
  return splitPipes(c[rawField]).some(x => x.toLowerCase() === label.toLowerCase());
}

function matrixSection(heading, axis, field) {
  if (!axis.length) return '';
  // Horizontal competitor-name headers — simpler to read than rotated. Row label (feature name) is
  // the sticky left column so users can scroll horizontally without losing context on wide tables.
  const header = `<tr>
    <th class="mx-feature-h">${escapeHtml(heading)}</th>
    ${deduped.map(c => `<th class="mx-comp-h"><a href="competitors/${escapeHtml(c.slug)}.html">${escapeHtml(c.competitor_name)}</a></th>`).join('')}
  </tr>`;
  const rows = axis.map(a => {
    const cells = deduped.map(c => competitorHas(c, field, a.label)
      ? `<td class="mx-cell mx-yes" title="${escapeHtml(c.competitor_name)} has ${escapeHtml(a.label)}">●</td>`
      : `<td class="mx-cell mx-no">·</td>`).join('');
    return `<tr>
      <td class="mx-feature"><span class="mx-feature-label">${escapeHtml(a.label)}</span><span class="mx-count">${a.count}</span></td>
      ${cells}
    </tr>`;
  }).join('\n');
  return `<section class="mx-section">
    <h2 class="mx-heading">${escapeHtml(heading)}</h2>
    <div class="mx-scroll">
      <table class="mx-table">${header}${rows}</table>
    </div>
  </section>`;
}

const pricingRows = deduped.map(c => `<tr><td style="font-weight:500;">${escapeHtml(c.competitor_name)}</td><td style="color:var(--muted);font-size:0.8125rem;">${escapeHtml(c.pricing_model || '')}</td><td style="font-size:0.8125rem;">${escapeHtml(c.pricing_tiers || '—')}</td><td style="font-size:0.8125rem;">${escapeHtml(c.target_customer || '')}</td></tr>`).join('');

const matrixHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Feature Matrix — ${escapeHtml(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root { --brand:#F03603; --black:#100D0D; --border:#edebeb; --bg:#F9F6F4; --card:#ffffff; --text:#100D0D; --muted:#514F4F; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:Inter,system-ui,sans-serif; background:var(--bg); color:var(--text); line-height:1.5; font-size:15px; }
  .container { max-width:1400px; margin:0 auto; padding:2rem 1.5rem; }
  header { margin-bottom:1.5rem; }
  header h1 { font-size:1.5rem; font-weight:600; margin-bottom:0.25rem; }
  header .meta { color:var(--muted); font-size:0.875rem; }
  nav.views { display:flex; gap:0.5rem; margin-bottom:2rem; }
  nav.views a { background:var(--card); border:1px solid var(--border); border-radius:4px; padding:0.5rem 0.875rem; font-size:0.8125rem; color:var(--muted); text-decoration:none; font-weight:500; }
  nav.views a:hover { border-color:var(--brand); color:var(--brand); }
  nav.views a.active { background:var(--brand); color:#fff; border-color:var(--brand); }
  table { border-collapse:collapse; background:var(--card); border:1px solid var(--border); border-radius:4px; overflow:hidden; margin-bottom:1.5rem; }
  th, td { border:1px solid var(--border); padding:0.5rem 0.625rem; }
  th { background:#fafafa; font-size:0.75rem; color:var(--muted); text-transform:uppercase; letter-spacing:0.04em; }

  /* Feature matrix — sticky first column + tilted competitor headers */
  .mx-section { margin:1.5rem 0; }
  .mx-heading { font-size:1rem; font-weight:600; margin:0 0 0.5rem; color:var(--black); }
  .mx-scroll { background:var(--card); border:1px solid var(--border); border-radius:4px; overflow-x:auto; }
  .mx-table { border-collapse:collapse; width:auto; margin:0; background:var(--card); border:none; border-radius:0; }
  .mx-table th, .mx-table td { border:1px solid var(--border); padding:0; }
  .mx-table tr:hover td:not(.mx-feature) { background:#fdf7f5; }
  .mx-table tr:hover .mx-feature { background:#fdfcfb; }
  .mx-feature-h { position:sticky; left:0; z-index:3; background:#fafafa; text-align:left; min-width:240px; padding:0.75rem !important; border-bottom:1px solid var(--border); font-size:0.6875rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--muted); font-weight:600; }
  .mx-comp-h { padding:0.75rem 0.5rem !important; background:#fafafa; min-width:110px; max-width:140px; border-bottom:1px solid var(--border); text-align:center; font-size:0.8125rem; font-weight:600; text-transform:none; letter-spacing:0; color:var(--text); white-space:nowrap; }
  .mx-comp-h a { color:var(--text); text-decoration:none; }
  .mx-comp-h a:hover { color:var(--brand); }
  .mx-feature { position:sticky; left:0; z-index:2; background:var(--card); min-width:240px; font-size:0.8125rem; padding:0.45rem 0.75rem !important; display:flex; align-items:center; justify-content:space-between; gap:0.5rem; }
  .mx-feature-label { flex:1; }
  .mx-count { color:var(--muted); font-size:0.7rem; font-weight:600; background:#f4f1ee; padding:0 6px; border-radius:999px; }
  .mx-cell { text-align:center; font-weight:700; min-width:110px; max-width:140px; padding:0.5rem 0 !important; font-size:0.95rem; }
  .mx-yes { color:#5a8a1a; background:rgba(144,201,77,0.06); }
  .mx-no  { color:#e0dcd7; }

  footer { margin-top:3rem; padding-top:1.5rem; border-top:1px solid var(--border); text-align:center; font-size:0.75rem; color:var(--muted); }
  footer a { color:var(--brand); text-decoration:none; }
</style>
</head>
<body>
<div class="container">
  <header>
    <h1>Feature & Pricing Matrix</h1>
    <div class="meta">${escapeHtml(metaLine)}</div>
  </header>
  <nav class="views">
    <a href="index.html">Overview</a>
    <a href="matrix.html" class="active">Matrix</a>
    <a href="mentions.html">Mentions</a>
  </nav>

  <section>
    <h2 style="font-size:1rem;font-weight:600;margin:0 0 0.5rem;">Pricing</h2>
    <table style="width:100%;">
      <thead><tr><th style="text-align:left;">Competitor</th><th style="text-align:left;">Model</th><th style="text-align:left;">Tiers</th><th style="text-align:left;">Target Customer</th></tr></thead>
      <tbody>${pricingRows}</tbody>
    </table>
  </section>

  ${matrixSection('Features', featureAxis, 'features')}
  ${matrixSection('Integrations', integrationAxis, 'integrations')}
</div>
<footer>Generated by <a href="https://github.com/anthropics/skills">competitor-analysis</a> · Powered by <a href="https://browserbase.com">Browserbase</a></footer>
</body>
</html>`;

writeFileSync(join(dir, 'matrix.html'), matrixHtml);

// ---------- mentions.html (feed + filter) ----------

const allMentions = [];
for (const c of deduped) {
  for (const m of c.mentions) {
    allMentions.push({ ...m, competitor: c.competitor_name, slug: c.slug });
  }
}
// Sort by date desc (empty dates last)
allMentions.sort((a, b) => {
  if (a.date && b.date) return b.date.localeCompare(a.date);
  if (a.date) return -1;
  if (b.date) return 1;
  return 0;
});

const sourceTypes = [...new Set(allMentions.map(m => m.sourceType))].sort();
const sourceFilterButtons = ['All', ...sourceTypes].map(t =>
  `<button class="filter-btn${t === 'All' ? ' active' : ''}" data-filter="${escapeHtml(t)}">${escapeHtml(t)}</button>`
).join('');

const mentionItems = allMentions.map(m => {
  const link = m.url ? `<a href="${escapeHtml(m.url)}" target="_blank">${escapeHtml(m.title || m.url)}</a>` : escapeHtml(m.title);
  const snippet = m.snippet ? `<div class="snippet">${escapeHtml(m.snippet)}</div>` : '';
  const date = m.date ? `<span class="date">${escapeHtml(m.date)}</span>` : '';
  return `<div class="mention" data-type="${escapeHtml(m.sourceType)}">
    <span class="src-pill src-${escapeHtml(m.sourceType)}">${escapeHtml(m.sourceType)}</span>
    <div class="body">
      <div class="header-line">
        <a href="competitors/${escapeHtml(m.slug)}.html" class="competitor-chip">${escapeHtml(m.competitor)}</a>
        ${date}
      </div>
      <div class="title">${link}</div>
      ${snippet}
    </div>
  </div>`;
}).join('\n');

const mentionsHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Mentions Feed — ${escapeHtml(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root { --brand:#F03603; --blue:#4DA9E4; --black:#100D0D; --border:#edebeb; --bg:#F9F6F4; --card:#ffffff; --text:#100D0D; --muted:#514F4F; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:Inter,system-ui,sans-serif; background:var(--bg); color:var(--text); line-height:1.5; font-size:15px; }
  .container { max-width:900px; margin:0 auto; padding:2rem 1.5rem; }
  header { margin-bottom:1.5rem; }
  header h1 { font-size:1.5rem; font-weight:600; margin-bottom:0.25rem; }
  header .meta { color:var(--muted); font-size:0.875rem; }
  nav.views { display:flex; gap:0.5rem; margin-bottom:1.5rem; }
  nav.views a { background:var(--card); border:1px solid var(--border); border-radius:4px; padding:0.5rem 0.875rem; font-size:0.8125rem; color:var(--muted); text-decoration:none; font-weight:500; }
  nav.views a:hover { border-color:var(--brand); color:var(--brand); }
  nav.views a.active { background:var(--brand); color:#fff; border-color:var(--brand); }
  .filters { display:flex; gap:0.375rem; margin-bottom:1rem; flex-wrap:wrap; }
  .filter-btn { background:var(--card); border:1px solid var(--border); border-radius:999px; padding:0.25rem 0.75rem; font-size:0.75rem; color:var(--muted); cursor:pointer; font-weight:500; font-family:inherit; }
  .filter-btn:hover { border-color:var(--brand); color:var(--brand); }
  .filter-btn.active { background:var(--brand); color:#fff; border-color:var(--brand); }
  .mention { display:flex; gap:0.75rem; align-items:flex-start; padding:0.875rem; background:var(--card); border:1px solid var(--border); border-radius:4px; margin-bottom:0.5rem; }
  .mention.hidden { display:none; }
  .mention .body { flex:1; min-width:0; }
  .header-line { display:flex; gap:0.75rem; align-items:center; margin-bottom:0.25rem; font-size:0.8125rem; }
  .competitor-chip { color:var(--muted); font-weight:500; text-decoration:none; }
  .competitor-chip:hover { color:var(--brand); }
  .date { color:var(--muted); font-size:0.75rem; margin-left:auto; }
  .title { font-size:0.9375rem; margin-bottom:0.25rem; }
  .title a { color:var(--text); text-decoration:none; font-weight:500; }
  .title a:hover { color:var(--brand); text-decoration:underline; }
  .snippet { color:var(--muted); font-size:0.8125rem; }
  .src-pill { font-size:0.6875rem; font-weight:600; padding:3px 9px; border-radius:999px; white-space:nowrap; border:1px solid; flex-shrink:0; align-self:flex-start; }
  .src-Benchmark { background:rgba(77,169,228,0.12); color:#2172a3; border-color:rgba(77,169,228,0.4); }
  .src-Comparison { background:rgba(240,54,3,0.10); color:var(--brand); border-color:rgba(240,54,3,0.4); }
  .src-News { background:#f2f2f2; color:var(--black); border-color:#ddd; }
  .src-Reddit { background:#fff2eb; color:#d84300; border-color:#ffd4b7; }
  .src-HN { background:#fff4e5; color:#c95500; border-color:#ffcc99; }
  .src-LinkedIn { background:#e7f1fa; color:#0a66c2; border-color:#b3d4ee; }
  .src-YouTube { background:#ffebee; color:#c4302b; border-color:#f7b2ae; }
  .src-Review { background:rgba(144,201,77,0.12); color:#5a8a1a; border-color:rgba(144,201,77,0.4); }
  .src-Podcast { background:#efe7fa; color:#6236c2; border-color:#d1bde9; }
  .src-X { background:#eef2f7; color:#111; border-color:#cfd9e5; }
  .src-Twitter { background:#eef2f7; color:#111; border-color:#cfd9e5; }
  .src-DevTo { background:#f3f3f6; color:#0a0a0a; border-color:#dcdce0; }
  .src-Hashnode { background:#eef4ff; color:#2962ff; border-color:#c6d8ff; }
  .src-Substack { background:#fff4e5; color:#ff6719; border-color:#ffd4b7; }
  .src-Blog { background:#f6f3ee; color:#6a5d45; border-color:#e1dbcc; }
  .empty { text-align:center; color:var(--muted); padding:3rem 1rem; font-size:0.875rem; }
  footer { margin-top:3rem; padding-top:1.5rem; border-top:1px solid var(--border); text-align:center; font-size:0.75rem; color:var(--muted); }
  footer a { color:var(--brand); text-decoration:none; }
</style>
</head>
<body>
<div class="container">
  <header>
    <h1>Mentions Feed</h1>
    <div class="meta">${allMentions.length} mentions across ${deduped.length} competitors · ${escapeHtml(genDate)}</div>
  </header>
  <nav class="views">
    <a href="index.html">Overview</a>
    <a href="matrix.html">Matrix</a>
    <a href="mentions.html" class="active">Mentions</a>
  </nav>
  <div class="filters">${sourceFilterButtons}</div>
  <div id="mentions-list">
    ${mentionItems || '<div class="empty">No mentions collected — try running in deep or deeper mode.</div>'}
  </div>
</div>
<footer>Generated by <a href="https://github.com/anthropics/skills">competitor-analysis</a> · Powered by <a href="https://browserbase.com">Browserbase</a></footer>
<script>
  (function () {
    const buttons = document.querySelectorAll('.filter-btn');
    const items = document.querySelectorAll('.mention');
    buttons.forEach(btn => btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const f = btn.dataset.filter;
      items.forEach(el => {
        el.classList.toggle('hidden', f !== 'All' && el.dataset.type !== f);
      });
    }));
  })();
</script>
</body>
</html>`;

writeFileSync(join(dir, 'mentions.html'), mentionsHtml);

// ---------- CSV ----------

const priority = [
  'competitor_name', 'website', 'tagline', 'positioning', 'product_description',
  'target_customer', 'pricing_model', 'pricing_tiers', 'key_features', 'integrations',
  'headquarters', 'founded', 'employee_estimate', 'funding_info', 'strategic_diff'
];
const flatRows = deduped.map(c => {
  const row = {};
  for (const k of Object.keys(c)) {
    if (['body', 'sections', 'mentions', 'benchmarks', 'slug', 'file'].includes(k)) continue;
    row[k] = c[k];
  }
  row.mention_count = String(c.mentions.length);
  row.benchmark_count = String(c.benchmarks.length);
  return row;
});
const allCols = [...new Set(flatRows.flatMap(r => Object.keys(r)))];
const cols = [...priority.filter(c => allCols.includes(c)), ...allCols.filter(c => !priority.includes(c)).sort()];

function csvEscape(v) {
  v = String(v || '');
  if (v.includes(',') || v.includes('"') || v.includes('\n')) return '"' + v.replace(/"/g, '""') + '"';
  return v;
}

const csvLines = [cols.join(',')];
for (const row of flatRows) csvLines.push(cols.map(c => csvEscape(row[c] || '')).join(','));
writeFileSync(join(dir, 'results.csv'), csvLines.join('\n') + '\n');

// ---------- Summary ----------

console.error(JSON.stringify({
  total: deduped.length,
  mentions: totalMentions,
  benchmarks: totalBenchmarks,
  with_pricing: withPricing,
  user_company: userCompany,
  files_generated: {
    index: join(dir, 'index.html'),
    matrix: join(dir, 'matrix.html'),
    mentions: join(dir, 'mentions.html'),
    competitors: deduped.filter(c => c.body && c.body.length > 50).length,
    csv: join(dir, 'results.csv')
  }
}, null, 2));

console.log(join(dir, 'index.html'));

if (shouldOpen) {
  const { execSync } = await import('child_process');
  try { execSync(`open "${join(dir, 'index.html')}"`); } catch {}
}
