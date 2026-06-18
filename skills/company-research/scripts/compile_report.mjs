#!/usr/bin/env node

// Compiles per-company markdown research files into an HTML report + CSV.
// Reads the report template, fills in placeholders, generates index.html
// with a scored overview table linking to individual company pages.
//
// Usage: node compile_report.mjs <research-dir> [--template <path>]
// Example: node compile_report.mjs ~/Desktop/acme_research_2026-04-09

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  console.error(`Usage: node compile_report.mjs <research-dir> [--template <path>]

Reads all .md files from <research-dir>, generates:
  - index.html  — overview page with scored table
  - companies/<slug>.html — individual company research pages
  - results.csv — scored spreadsheet

Options:
  --template <path>  Path to report-template.html (default: auto-detect)
  --open             Open index.html in browser after generation
  --help, -h         Show this help message

Examples:
  node compile_report.mjs ~/Desktop/acme_research_2026-04-09
  node compile_report.mjs ~/Desktop/research --open`);
  process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
}

const dir = args[0];
const shouldOpen = args.includes('--open');
const templateIdx = args.indexOf('--template');
let templatePath = templateIdx !== -1 ? args[templateIdx + 1] : null;

// Auto-detect template
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

// Read and parse markdown files
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

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function scoreClass(score) {
  const s = parseInt(score) || 0;
  if (s >= 8) return 'high';
  if (s >= 5) return 'medium';
  return 'low';
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

  function closeList() {
    if (inList) { out.push('</ul>'); inList = false; }
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushPara();
      closeList();
      continue;
    }

    // Headings
    if (trimmed.startsWith('## ')) {
      flushPara(); closeList();
      out.push(`<h2>${escapeHtml(trimmed.slice(3))}</h2>`);
      continue;
    }
    if (trimmed.startsWith('### ')) {
      flushPara(); closeList();
      out.push(`<h3>${escapeHtml(trimmed.slice(4))}</h3>`);
      continue;
    }

    // List items
    if (trimmed.startsWith('- ')) {
      flushPara();
      if (!inList) { out.push('<ul>'); inList = true; }
      let text = escapeHtml(trimmed.slice(2));
      text = text.replace(/\*\*\[(\w+)\]\*\*/g, '<span class="confidence $1">[$1]</span>');
      text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      out.push(`<li>${text}</li>`);
      continue;
    }

    // Regular text — accumulate into paragraph
    closeList();
    paraLines.push(trimmed);
  }

  flushPara();
  closeList();
  return out.join('\n');
}

// Parse all companies
const companies = [];
for (const file of files) {
  const content = readFileSync(join(dir, file), 'utf-8');
  const fields = parseFrontmatter(content);
  if (!fields) continue;
  const body = parseBody(content);
  const slug = file.replace('.md', '');
  companies.push({ ...fields, body, slug, file });
}

// Sort by ICP score descending
companies.sort((a, b) => (parseInt(b.icp_fit_score) || 0) - (parseInt(a.icp_fit_score) || 0));

// Deduplicate
const seen = new Map();
for (const c of companies) {
  const name = (c.company_name || '').toLowerCase().replace(/[,\s]+(inc|llc|ltd|corp|co)\.?$/i, '').trim();
  if (!seen.has(name)) seen.set(name, c);
}
const deduped = [...seen.values()];

// Stats
const scores = deduped.map(c => parseInt(c.icp_fit_score) || 0);
const high = scores.filter(s => s >= 8).length;
const medium = scores.filter(s => s >= 5 && s < 8).length;
const low = scores.filter(s => s < 5).length;
const total = deduped.length;
const highPct = total > 0 ? Math.round((high / total) * 100) : 0;
const mediumPct = total > 0 ? Math.round((medium / total) * 100) : 0;
const lowPct = total > 0 ? 100 - highPct - mediumPct : 0;

// Derive title from directory name
const dirName = dir.split('/').pop();
const title = dirName.replace(/_/g, ' ').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

// Generate table rows
const tableRows = deduped.map(c => {
  const sc = scoreClass(c.icp_fit_score);
  const hasDetail = c.body && c.body.length > 50;
  const nameHtml = hasDetail
    ? `<a href="companies/${c.slug}.html">${escapeHtml(c.company_name)}</a>`
    : escapeHtml(c.company_name);
  const websiteHtml = c.website
    ? `<br><a href="${escapeHtml(c.website)}" target="_blank" style="font-size:0.75rem;color:var(--muted);">${escapeHtml(c.website.replace(/^https?:\/\/(www\.)?/, ''))}</a>`
    : '';
  return `      <tr>
        <td><span class="score ${sc}">${escapeHtml(c.icp_fit_score || '—')}</span></td>
        <td>${nameHtml}${websiteHtml}</td>
        <td style="max-width:200px;">${escapeHtml(c.product_description || '')}</td>
        <td>${escapeHtml(c.industry || '')}</td>
        <td class="reasoning">${escapeHtml(c.icp_fit_reasoning || '')}</td>
      </tr>`;
}).join('\n');

// Fill index template
const escapedTitle = escapeHtml(title);
let indexHtml = template
  .replace(/\{\{TITLE\}\}/g, `Company Research — ${escapedTitle}`)
  .replace(/\{\{COMPANY_NAME\}\}/g, escapedTitle)
  .replace(/\{\{META\}\}/g, `${deduped.length} companies researched · ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`)
  .replace(/\{\{TOTAL\}\}/g, String(total))
  .replace(/\{\{HIGH_COUNT\}\}/g, String(high))
  .replace(/\{\{MEDIUM_COUNT\}\}/g, String(medium))
  .replace(/\{\{LOW_COUNT\}\}/g, String(low))
  .replace(/\{\{HIGH_PCT\}\}/g, String(highPct))
  .replace(/\{\{MEDIUM_PCT\}\}/g, String(mediumPct))
  .replace(/\{\{LOW_PCT\}\}/g, String(lowPct))
  .replace(/\{\{TABLE_ROWS\}\}/g, () => tableRows);

writeFileSync(join(dir, 'index.html'), indexHtml);

// Generate individual company pages
const { mkdirSync } = await import('fs');
try { mkdirSync(join(dir, 'companies'), { recursive: true }); } catch {}

for (const c of deduped) {
  if (!c.body || c.body.length < 50) continue;
  const sc = scoreClass(c.icp_fit_score);
  const bodyHtml = mdToHtml(c.body);

  const companyHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(c.company_name)} — Research</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root { --brand:#F03603; --high:#90C94D; --medium:#F4BA41; --low:#F03603; --black:#100D0D; --gray:#514F4F; --border:#edebeb; --bg:#F9F6F4; --card:#ffffff; --text:#100D0D; --muted:#514F4F; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; background:var(--bg); color:var(--text); line-height:1.6; font-size:16px; }
  .container { max-width:800px; margin:0 auto; padding:2rem 1.5rem; }
  a { color:var(--brand); text-decoration:none; }
  a:hover { text-decoration:underline; }
  .back { font-size:0.875rem; color:var(--muted); margin-bottom:1.5rem; display:inline-block; }
  .back:hover { color:var(--brand); }
  header { margin-bottom:2rem; }
  header h1 { font-size:1.5rem; font-weight:600; margin-bottom:0.25rem; }
  header .meta { color:var(--muted); font-size:0.875rem; }
  .score-badge { display:inline-block; font-size:0.875rem; font-weight:700; padding:4px 14px; border-radius:4px; margin-right:0.75rem; }
  .score-badge.high { background:rgba(144,201,77,0.12); color:#5a8a1a; border:1px solid rgba(144,201,77,0.3); }
  .score-badge.medium { background:rgba(244,186,65,0.12); color:#9a7520; border:1px solid rgba(244,186,65,0.3); }
  .score-badge.low { background:rgba(240,54,3,0.08); color:var(--low); border:1px solid rgba(240,54,3,0.2); }
  .fields { background:var(--card); border:1px solid var(--border); border-radius:4px; padding:1.25rem; margin-bottom:2rem; display:grid; grid-template-columns:auto 1fr; gap:0.375rem 1rem; font-size:0.875rem; }
  .fields dt { color:var(--muted); font-weight:500; }
  .fields dd { color:var(--text); }
  .research { background:var(--card); border:1px solid var(--border); border-radius:4px; padding:1.5rem; }
  .research h2 { font-size:1.125rem; font-weight:600; margin:1.5rem 0 0.5rem 0; color:var(--black); }
  .research h2:first-child { margin-top:0; }
  .research p { margin-bottom:0.75rem; }
  .research ul { margin:0.5rem 0 1rem 1.25rem; }
  .research li { margin-bottom:0.375rem; font-size:0.875rem; }
  .confidence { font-size:0.75rem; font-weight:600; padding:1px 6px; border-radius:2px; }
  .confidence.high { background:rgba(144,201,77,0.12); color:#5a8a1a; }
  .confidence.medium { background:rgba(244,186,65,0.12); color:#9a7520; }
  .confidence.low { background:rgba(240,54,3,0.08); color:var(--low); }
  footer { margin-top:3rem; padding-top:1.5rem; border-top:1px solid var(--border); text-align:center; font-size:0.75rem; color:var(--muted); }
</style>
</head>
<body>
<div class="container">
  <a href="../index.html" class="back">&larr; Back to overview</a>
  <header>
    <h1>${escapeHtml(c.company_name)}</h1>
    <div class="meta">
      <span class="score-badge ${sc}">ICP Score: ${escapeHtml(c.icp_fit_score || '—')}</span>
      ${c.website ? `<a href="${escapeHtml(c.website)}" target="_blank">${escapeHtml(c.website)}</a>` : ''}
    </div>
  </header>
  <dl class="fields">
    ${c.product_description ? `<dt>Product</dt><dd>${escapeHtml(c.product_description)}</dd>` : ''}
    ${c.industry ? `<dt>Industry</dt><dd>${escapeHtml(c.industry)}</dd>` : ''}
    ${c.target_audience ? `<dt>Target Audience</dt><dd>${escapeHtml(c.target_audience)}</dd>` : ''}
    ${c.key_features ? `<dt>Key Features</dt><dd>${escapeHtml(c.key_features)}</dd>` : ''}
    ${c.employee_estimate ? `<dt>Employees</dt><dd>${escapeHtml(c.employee_estimate)}</dd>` : ''}
    ${c.funding_info ? `<dt>Funding</dt><dd>${escapeHtml(c.funding_info)}</dd>` : ''}
    ${c.headquarters ? `<dt>HQ</dt><dd>${escapeHtml(c.headquarters)}</dd>` : ''}
    ${c.icp_fit_reasoning ? `<dt>Fit Reasoning</dt><dd>${escapeHtml(c.icp_fit_reasoning)}</dd>` : ''}
  </dl>
  <div class="research">
    ${bodyHtml}
  </div>
</div>
<footer>Generated by <a href="https://github.com/anthropics/skills">company-research</a> · Powered by <a href="https://browserbase.com">Browserbase</a></footer>
</body>
</html>`;

  writeFileSync(join(dir, 'companies', `${c.slug}.html`), companyHtml);
}

// Generate CSV
const priority = [
  'company_name', 'website', 'product_description', 'icp_fit_score',
  'icp_fit_reasoning', 'industry', 'target_audience', 'key_features',
  'employee_estimate', 'funding_info', 'headquarters'
];
const allCols = [...new Set(deduped.flatMap(r => Object.keys(r)).filter(k => k !== 'body' && k !== 'slug' && k !== 'file'))];
const cols = [...priority.filter(c => allCols.includes(c)), ...allCols.filter(c => !priority.includes(c)).sort()];

function csvEscape(v) {
  if (!v) return '';
  if (v.includes(',') || v.includes('"') || v.includes('\n')) return '"' + v.replace(/"/g, '""') + '"';
  return v;
}

const csvLines = [cols.join(',')];
for (const row of deduped) {
  csvLines.push(cols.map(c => csvEscape(row[c] || '')).join(','));
}
writeFileSync(join(dir, 'results.csv'), csvLines.join('\n') + '\n');

// Summary
console.error(JSON.stringify({
  total: deduped.length,
  high_fit: high,
  medium_fit: medium,
  low_fit: low,
  files_generated: {
    index: join(dir, 'index.html'),
    company_pages: deduped.filter(c => c.body && c.body.length > 50).length,
    csv: join(dir, 'results.csv')
  }
}, null, 2));

console.log(join(dir, 'index.html'));

// Open in browser if requested
if (shouldOpen) {
  const { execSync } = await import('child_process');
  try { execSync(`open "${join(dir, 'index.html')}"`); } catch {}
}
