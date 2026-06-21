#!/usr/bin/env node
// Generate a standalone HTML report from a bisected browser-trace run.
//
// Usage:
//   node scripts/report.mjs <run-id> [--open]
//
// Reads cdp/summary.json, per-page error data, screenshots, and the HTML
// template at references/report-template.html. Writes <run-dir>/report.html.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { runDir, readJson, readJsonl } from './lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.join(__dirname, '..', 'references', 'report-template.html');

const args = process.argv.slice(2);
const shouldOpen = args.includes('--open');
const runId = args.find(a => !a.startsWith('--'));

if (!runId) {
  console.error('usage: report.mjs <run-id> [--open]');
  process.exit(2);
}

const RD = runDir(runId);
const cdpDir = path.join(RD, 'cdp');
const summaryPath = path.join(cdpDir, 'summary.json');

if (!fs.existsSync(summaryPath)) {
  console.error(`no summary.json at ${summaryPath} — run bisect-cdp.mjs first`);
  process.exit(1);
}

const summary = readJson(summaryPath);
const manifest = readJson(path.join(RD, 'manifest.json'), {});
let template = fs.readFileSync(TEMPLATE_PATH, 'utf8');

// --- Collect errors across all pages ---
function collectErrors(pid) {
  const pdir = path.join(cdpDir, 'pages', String(pid).padStart(3, '0'));
  const errors = [];

  for (const ev of readJsonl(path.join(pdir, 'network/failed.jsonl'))) {
    errors.push({
      kind: 'network.failed',
      msg: `${ev?.params?.errorText ?? 'unknown'} — ${ev?.params?.type ?? ''} (reqId: ${ev?.params?.requestId ?? '?'})`,
    });
  }
  for (const ev of readJsonl(path.join(pdir, 'console/exceptions.jsonl'))) {
    const detail = ev?.params?.exceptionDetails;
    errors.push({
      kind: 'runtime.exception',
      msg: detail?.exception?.description ?? detail?.text ?? 'unknown exception',
    });
  }
  for (const ev of readJsonl(path.join(pdir, 'console/logs.jsonl'))) {
    if (ev?.params?.type !== 'error') continue;
    const arg0 = ev?.params?.args?.[0];
    errors.push({
      kind: 'console.error',
      msg: arg0?.value ?? arg0?.description ?? '',
    });
  }
  for (const ev of readJsonl(path.join(pdir, 'log/entries.jsonl'))) {
    if (ev?.params?.entry?.level !== 'error') continue;
    errors.push({
      kind: 'log.error',
      msg: `[${ev?.params?.entry?.source ?? '?'}] ${ev?.params?.entry?.text ?? ''}`,
    });
  }
  return errors;
}

// --- Compute totals ---
let totalRequests = 0;
let totalFailed = 0;
let totalErrors = 0;

const pageData = summary.pages.map(p => {
  const errors = collectErrors(p.pageId);
  const reqs = p.network?.requests ?? 0;
  const failed = p.network?.failed ?? 0;
  totalRequests += reqs;
  totalFailed += failed;
  totalErrors += errors.length;
  return { ...p, errors, netRequests: reqs, netFailed: failed };
});

const durationMs = summary.duration?.totalMs;
const durationStr = durationMs != null
  ? durationMs >= 60000
    ? `${(durationMs / 60000).toFixed(1)}m`
    : `${(durationMs / 1000).toFixed(1)}s`
  : '—';

const healthRate = totalRequests > 0
  ? Math.round(((totalRequests - totalFailed) / totalRequests) * 100)
  : 100;
const healthClass = healthRate >= 95 ? 'good' : healthRate >= 80 ? 'warn' : 'bad';

// --- Build meta line ---
const metaParts = [];
if (manifest.started_at) metaParts.push(new Date(manifest.started_at).toISOString().replace('T', ' ').replace(/\.\d+Z/, ' UTC'));
if (manifest.browserbase?.session_id) metaParts.push(`Session: ${manifest.browserbase.session_id.slice(0, 8)}…`);
if (manifest.target) metaParts.push(`Target: ${manifest.target}`);
const meta = metaParts.join(' · ') || `Run: ${runId}`;

// --- Build title ---
const sessionLabel = manifest.browserbase?.session_id
  ? `Session ${manifest.browserbase.session_id.slice(0, 8)}`
  : runId;
const title = sessionLabel;
const titleHtml = manifest.browserbase?.debugger_url
  ? `<a href="${esc(manifest.browserbase.debugger_url)}">${esc(sessionLabel)}</a>`
  : esc(sessionLabel);

// --- Collect screenshots ---
const screenshotsDir = path.join(RD, 'screenshots');
let screenshotsHtml = '';
if (fs.existsSync(screenshotsDir)) {
  const pngs = fs.readdirSync(screenshotsDir).filter(f => f.endsWith('.png')).sort();
  if (pngs.length > 0) {
    const thumbs = pngs.map(f => {
      const b64 = fs.readFileSync(path.join(screenshotsDir, f)).toString('base64');
      const ts = f.replace('.png', '');
      return `<div class="thumb"><img src="data:image/png;base64,${b64}" alt="${esc(ts)}"><div class="caption">${esc(ts)}</div></div>`;
    }).join('\n      ');

    screenshotsHtml = `
  <div class="section">
    <h2>Screenshots <span class="count">${pngs.length}</span></h2>
    <div class="screenshot-timeline">
      ${thumbs}
    </div>
  </div>`;
  }
}

// --- Build errors section ---
let errorsHtml = '';
if (totalErrors > 0) {
  const allErrors = pageData.flatMap(p =>
    p.errors.map(e => ({ ...e, pageId: p.pageId, url: p.url }))
  );
  const items = allErrors.map(e => `
      <div class="error-item">
        <span class="error-kind">${esc(e.kind)}</span> · Page ${e.pageId} · <code>${esc(truncate(e.url, 60))}</code>
        <div class="error-msg">${esc(e.msg)}</div>
      </div>`).join('');

  errorsHtml = `
  <div class="section">
    <h2>Errors <span class="count">${totalErrors}</span></h2>
    ${items}
  </div>`;
}

// --- Build pages section ---
const pageCards = pageData.map(p => {
  const hasErrors = p.errors.length > 0;
  const cardClass = hasErrors ? 'has-errors' : 'clean';
  const badgeClass = hasErrors ? 'error' : 'clean';
  const badgeText = hasErrors ? `${p.errors.length} error${p.errors.length > 1 ? 's' : ''}` : 'clean';
  const dur = p.durationMs != null ? `${(p.durationMs / 1000).toFixed(2)}s` : '—';

  // Domain chips
  const domainChips = Object.entries(p.domains || {}).map(([name, d]) => {
    let extra = '';
    if (d.errors) extra += `<div class="domain-errors">${d.errors} error${d.errors > 1 ? 's' : ''}</div>`;
    if (d.warnings) extra += `<div class="domain-warnings">${d.warnings} warning${d.warnings > 1 ? 's' : ''}</div>`;
    return `<div class="domain-chip"><div class="domain-name">${esc(name)}</div><div class="domain-count">${d.count}</div>${extra}</div>`;
  }).join('');

  // Network bar
  let networkHtml = '';
  if (p.netRequests > 0) {
    const okPct = Math.round(((p.netRequests - p.netFailed) / p.netRequests) * 100);
    const failPct = 100 - okPct;
    const typeLabels = Object.entries(p.network?.byType || {}).map(([t, c]) => `<span>${esc(t)}: ${c}</span>`).join('');
    networkHtml = `
      <div style="font-size:0.8125rem;margin-top:0.75rem;">
        <strong>Network:</strong> ${p.netRequests} requests, ${p.netFailed} failed
        <div class="network-bar"><div class="seg seg-ok" style="width:${okPct}%"></div><div class="seg seg-fail" style="width:${failPct}%"></div></div>
        <div class="network-types">${typeLabels}</div>
      </div>`;
  }

  // Per-page errors
  let pageErrorsHtml = '';
  if (hasErrors) {
    const items = p.errors.map(e =>
      `<div class="error-item"><span class="error-kind">${esc(e.kind)}</span><div class="error-msg">${esc(e.msg)}</div></div>`
    ).join('');
    pageErrorsHtml = `<div class="error-list">${items}</div>`;
  }

  return `
    <details class="page-card ${cardClass}"${hasErrors ? ' open' : ''}>
      <summary>
        <span class="badge page-id">#${p.pageId}</span>
        <span class="badge ${badgeClass}">${badgeText}</span>
        <span class="page-url">${esc(truncate(p.url, 60))}</span>
        <span class="page-meta">${p.eventCount} events · ${dur}</span>
      </summary>
      <div class="body">
        <div class="domain-grid">${domainChips}</div>
        ${networkHtml}
        ${pageErrorsHtml}
      </div>
    </details>`;
}).join('\n');

const pagesHtml = `
  <div class="section">
    <h2>Pages <span class="count">${pageData.length}</span></h2>
    ${pageCards}
  </div>`;

// --- Replace template placeholders ---
template = template
  .replace('{{TITLE}}', esc(title))
  .replace('{{TITLE_HTML}}', titleHtml)
  .replace('{{META}}', esc(meta))
  .replace('{{PAGE_COUNT}}', String(pageData.length))
  .replace('{{TOTAL_EVENTS}}', String(summary.totalEvents))
  .replace('{{TOTAL_REQUESTS}}', String(totalRequests))
  .replace('{{TOTAL_ERRORS}}', String(totalErrors))
  .replace('{{DURATION}}', durationStr)
  .replace('{{HEALTH_RATE}}', String(healthRate))
  .replace(/\{\{HEALTH_RATE\}\}/g, String(healthRate))
  .replace('{{HEALTH_CLASS}}', healthClass)
  .replace('{{ERRORS_SECTION}}', errorsHtml)
  .replace('{{PAGES_SECTION}}', pagesHtml)
  .replace('{{SCREENSHOTS_SECTION}}', screenshotsHtml);

// --- Write report ---
const outPath = path.join(RD, 'report.html');
fs.writeFileSync(outPath, template);
console.log(`report written to ${outPath}`);

if (shouldOpen) {
  try {
    execSync(`open "${outPath}"`, { stdio: 'ignore' });
  } catch {
    console.log('(could not auto-open — open the file manually)');
  }
}

// --- Helpers ---

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function truncate(s, max) {
  if (!s || s.length <= max) return s || '';
  return s.slice(0, max - 1) + '…';
}
