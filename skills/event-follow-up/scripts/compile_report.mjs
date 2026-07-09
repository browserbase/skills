#!/usr/bin/env node

// Compiles per-company + per-person markdown research files into a follow-up
// HTML report (index.html) grouped by sales-readiness, plus people.html and
// companies.html alternate views.
//
// Reads:
//   <research-dir>/companies/*.md  — one per company (frontmatter + body)
//   <research-dir>/people/*.md     — one per attendee (frontmatter + body, with sales_readiness + email)
//
// Writes:
//   <research-dir>/index.html      — attendees grouped by sales-readiness (HOT → WARM → NURTURE → COLD)
//   <research-dir>/people.html     — filterable attendee list (chips: sales-readiness, ICP band, role, company)
//   <research-dir>/companies.html  — ICP-ranked company table with expandable attendees
//   <research-dir>/companies/<slug>.html — individual company research pages
//   <research-dir>/results.csv     — one row per attendee (name, email, company, sales_readiness, email_subject, email_body, ...)
//
// Usage: node compile_report.mjs <research-dir> [--template <path>] [--open]

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  console.error(`Usage: node compile_report.mjs <research-dir> [--template <path>] [--open]

Reads companies/*.md and people/*.md from <research-dir>, generates:
  - index.html      — people grouped by company (ranked by company ICP)
  - people.html     — filterable people list (chips: company, role, ICP band)
  - companies.html  — ICP-ranked company table with expandable attendees
  - companies/<slug>.html — individual company research pages
  - results.csv     — scored spreadsheet

Options:
  --template <path>      Path to report-template.html (default: auto-detect)
  --open                 Open index.html in browser after generation
  --help, -h             Show this help message`);
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

// ----- Frontmatter / body parsing (shared) ---------------------------------

function parseFrontmatter(content) {
  // Tolerant frontmatter match: prefer closing ---, but if a subagent forgot it,
  // fall back to stopping at the first markdown heading (e.g. ## Product) so the
  // file still parses instead of vanishing from the report.
  const fmMatch = content.match(/^---\n([\s\S]*?)(?:\n---\s*\n|\n(?=## ))/);
  if (!fmMatch) return null;
  const fields = {};
  const lines = fmMatch[1].split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Multi-line YAML pipe scalar:  key: |
    //                                 line one
    //                                 line two
    const pipeMatch = line.match(/^([a-zA-Z_][\w]*)\s*:\s*\|\s*$/);
    if (pipeMatch) {
      const key = pipeMatch[1];
      const buf = [];
      i++;
      while (i < lines.length && /^\s{2,}/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s{2}/, ''));
        i++;
      }
      fields[key] = buf.join('\n').trim();
      continue;
    }
    // Nested block (e.g. links: with indented children)
    const nestedHeadMatch = line.match(/^([a-zA-Z_][\w]*)\s*:\s*$/);
    if (nestedHeadMatch && i + 1 < lines.length && /^\s{2,}\S/.test(lines[i + 1])) {
      const key = nestedHeadMatch[1];
      const child = {};
      i++;
      while (i < lines.length && /^\s{2,}\S/.test(lines[i])) {
        const c = lines[i].trim();
        const idx = c.indexOf(':');
        if (idx > 0) {
          const ck = c.slice(0, idx).trim();
          const cv = c.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
          child[ck] = (cv === 'null' || cv === '') ? null : cv;
        }
        i++;
      }
      fields[key] = child;
      continue;
    }
    const idx = line.indexOf(':');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (key) fields[key] = val;
    }
    i++;
  }
  return fields;
}

function parseBody(content) {
  // Mirror parseFrontmatter's tolerance — body starts after closing --- if present,
  // else at the first ## heading.
  const closed = content.match(/^---\n[\s\S]*?\n---\s*\n([\s\S]*)/);
  if (closed) return closed[1].trim();
  const fallback = content.match(/^---\n[\s\S]*?\n(## [\s\S]*)/);
  return fallback ? fallback[1].trim() : '';
}

// Pull a markdown section's content given its heading text. Used as a fallback when
// person-enrichment subagents wrote hook/dm_opener/etc. as ## sections instead of YAML.
function extractSection(body, heading) {
  if (!body) return null;
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^##\\s+${escaped}\\s*\\n+([\\s\\S]*?)(?=\\n##\\s|$)`, 'im');
  const m = body.match(re);
  return m ? m[1].trim() : null;
}

function escapeHtml(str) {
  return (str || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/\n/g, '&#10;');
}

function scoreClass(score) {
  const s = parseInt(score) || 0;
  if (s >= 8) return 'high';
  if (s >= 5) return 'medium';
  return 'low';
}

function icpBand(score) {
  const s = parseInt(score) || 0;
  if (s >= 8) return 'high';
  if (s >= 6) return 'mid';
  return 'low';
}

function slugify(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function roleBucket(title) {
  const t = (title || '').toLowerCase();
  if (/(ceo|founder|co-?founder|president|chief)/.test(t)) return 'Founder/CXO';
  if (/(vp|vice president|head of|director)/.test(t)) return 'VP/Director';
  if (/(engineer|developer|programmer|architect|sre|devops)/.test(t)) return 'Engineering';
  if (/(product|pm|product manager)/.test(t)) return 'Product';
  if (/(design|ux|ui)/.test(t)) return 'Design';
  if (/(market|growth|content)/.test(t)) return 'Marketing';
  if (/(sales|account|revenue|gtm)/.test(t)) return 'Sales/GTM';
  if (/(research|scientist|ml|ai)/.test(t)) return 'Research/AI';
  return 'Other';
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

    if (trimmed.startsWith('- ')) {
      flushPara();
      if (!inList) { out.push('<ul>'); inList = true; }
      let text = escapeHtml(trimmed.slice(2));
      text = text.replace(/\*\*\[(\w+)\]\*\*/g, '<span class="confidence $1">[$1]</span>');
      text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      out.push(`<li>${text}</li>`);
      continue;
    }

    closeList();
    paraLines.push(trimmed);
  }

  flushPara();
  closeList();
  return out.join('\n');
}

// ----- Read companies + people --------------------------------------------

function readMdDir(p) {
  if (!existsSync(p)) return [];
  let entries = [];
  try { entries = readdirSync(p); } catch { return []; }
  return entries.filter(f => f.endsWith('.md')).sort().map(f => {
    const content = readFileSync(join(p, f), 'utf-8');
    const fields = parseFrontmatter(content);
    if (!fields) return null;
    const body = parseBody(content);
    const slug = f.replace('.md', '');
    return { ...fields, body, slug, file: f };
  }).filter(Boolean);
}

const companiesDir = join(dir, 'companies');
let companies = readMdDir(companiesDir);

// Legacy fallback: top-level *.md files = companies (company-research's format)
if (companies.length === 0) {
  companies = readMdDir(dir);
}

const peopleDir = join(dir, 'people');
const people = readMdDir(peopleDir);

if (companies.length === 0 && people.length === 0) {
  console.error(`No .md files found in ${dir} (looked in companies/, people/, and top-level)`);
  process.exit(1);
}

// Sort companies by ICP score descending
companies.sort((a, b) => (parseInt(b.icp_fit_score) || 0) - (parseInt(a.icp_fit_score) || 0));

// Deduplicate companies by normalized name
const seen = new Map();
for (const c of companies) {
  const name = (c.company_name || '').toLowerCase().replace(/[,\s]+(inc|llc|ltd|corp|co)\.?$/i, '').trim();
  if (!name) continue;
  if (!seen.has(name)) seen.set(name, c);
}
const deduped = [...seen.values()];

// Build company lookup: slug → company, name(lowered) → company
const companyBySlug = new Map();
const companyByName = new Map();
for (const c of deduped) {
  if (c.slug) companyBySlug.set(c.slug, c);
  if (c.company_name) companyByName.set(c.company_name.toLowerCase().trim(), c);
}

function resolveCompany(person) {
  if (person.company_slug && companyBySlug.has(person.company_slug)) return companyBySlug.get(person.company_slug);
  if (person.company) {
    const k = person.company.toLowerCase().trim();
    if (companyByName.has(k)) return companyByName.get(k);
    const slugGuess = slugify(person.company);
    if (companyBySlug.has(slugGuess)) return companyBySlug.get(slugGuess);
  }
  return null;
}

// Augment each person with effective company + score for sorting
for (const p of people) {
  const comp = resolveCompany(p);
  p._company = comp;
  // Effective ICP: company score wins (per the plan), else person frontmatter, else -1 (last)
  const cs = comp ? parseInt(comp.icp_fit_score) : NaN;
  const ps = parseInt(p.icp_fit_score);
  p._effectiveScore = !isNaN(cs) ? cs : (!isNaN(ps) ? ps : -1);
}

// Sort people: sales-readiness bucket (HOT → WARM → NURTURE → COLD), then ICP
// score desc within each bucket, then name. Buckets with no readiness field
// default to COLD.
const READINESS_ORDER = { HOT: 0, WARM: 1, NURTURE: 2, COLD: 3 };
people.sort((a, b) => {
  const ra = READINESS_ORDER[(a.sales_readiness || 'COLD').toUpperCase()] ?? 3;
  const rb = READINESS_ORDER[(b.sales_readiness || 'COLD').toUpperCase()] ?? 3;
  if (ra !== rb) return ra - rb;
  if (b._effectiveScore !== a._effectiveScore) return b._effectiveScore - a._effectiveScore;
  return (a.name || '').localeCompare(b.name || '');
});

// ----- Stats --------------------------------------------------------------

const scores = deduped.map(c => parseInt(c.icp_fit_score) || 0);
const high = scores.filter(s => s >= 8).length;
const medium = scores.filter(s => s >= 5 && s < 8).length;
const low = scores.filter(s => s < 5).length;
const total = deduped.length;
const highPct = total > 0 ? Math.round((high / total) * 100) : 0;
const mediumPct = total > 0 ? Math.round((medium / total) * 100) : 0;
const lowPct = total > 0 ? 100 - highPct - mediumPct : 0;

const dirName = dir.split('/').filter(Boolean).pop() || 'event';
const title = dirName.replace(/_/g, ' ').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

// ----- Person card render --------------------------------------------------

function initials(name) {
  return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

const READINESS_LABELS = {
  HOT:     { label: 'HOT',     emoji: '🔥', desc: 'book a meeting' },
  WARM:    { label: 'WARM',    emoji: '🌡️', desc: 'qualify in nurture' },
  NURTURE: { label: 'NURTURE', emoji: '🌱', desc: 'educational content' },
  COLD:    { label: 'COLD',    emoji: '❄️', desc: 'skip / no follow-up' },
};

function readinessBucket(person) {
  const r = (person.sales_readiness || '').toString().toUpperCase().trim();
  if (READINESS_LABELS[r]) return r;
  return 'COLD';
}

function renderPersonCard(person, company) {
  const c = company || {};
  const links = (person.links && typeof person.links === 'object') ? person.links : {
    linkedin: person.linkedin || null,
    x: person.x || person.twitter || null,
    github: person.github || null,
    blog: person.blog || null,
    podcast: person.podcast || null,
  };
  const linkPills = ['linkedin', 'x', 'github', 'blog', 'podcast']
    .filter(k => links[k])
    .map(k => `<a class="link-pill link-${k}" href="${escapeHtml(links[k])}" target="_blank" rel="noopener">${k.toUpperCase()}</a>`)
    .join(' ');

  const score = c.icp_fit_score || person.icp_fit_score || '?';
  const band = icpBand(score);
  const bucket = readinessBucket(person);
  const hook = person.hook || extractSection(person.body, 'Hook') || '';
  const roleReason = person.role_reason || extractSection(person.body, 'Why the person') || '';
  const readinessReason = person.sales_readiness_reason || '';

  // Email fields with body-section fallback for tolerance to subagent format drift.
  const emailSubject = person.email_subject || extractSection(person.body, 'Email Subject') || '';
  const emailBody = person.email_body || extractSection(person.body, 'Email') || extractSection(person.body, 'Email Body') || '';
  const photo = person.image
    ? `<img class="photo" src="${escapeHtml(person.image)}" alt="${escapeHtml(person.name || '')}" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'photo photo-placeholder',textContent:'${escapeAttr(initials(person.name))}'}))">`
    : `<div class="photo photo-placeholder">${escapeHtml(initials(person.name))}</div>`;

  const emailBlock = (emailSubject || emailBody) ? `
      <div class="email-block">
        ${emailSubject ? `<div class="email-subject"><span class="label">Subject:</span> ${escapeHtml(emailSubject)}</div>` : ''}
        ${emailBody ? `<div class="email-body">${escapeHtml(emailBody).replace(/\n/g, '<br>')}</div>` : ''}
        <div class="card-actions">
          ${emailSubject ? `<button class="btn-copy" data-clipboard="${escapeAttr(emailSubject)}">Copy subject</button>` : ''}
          ${emailBody ? `<button class="btn-copy" data-clipboard="${escapeAttr(emailBody)}">Copy email</button>` : ''}
          ${person.email ? `<a class="btn-mailto" href="mailto:${escapeAttr(person.email)}?subject=${encodeURIComponent(emailSubject || '')}&body=${encodeURIComponent(emailBody || '')}">Open in mail</a>` : ''}
        </div>
      </div>` : (bucket === 'COLD' ? `<div class="email-block email-skip">No follow-up email — bucket is COLD${readinessReason ? ` (${escapeHtml(readinessReason)})` : ''}.</div>` : '');

  return `<div class="person-card" data-slug="${escapeHtml(person.slug)}" data-company="${escapeHtml((person.company || '').toLowerCase())}" data-role="${escapeHtml(roleBucket(person.title))}" data-readiness="${bucket}" data-icpband="${band}" data-icp-score="${escapeHtml(String(score))}">
    ${photo}
    <div class="card-body">
      <div class="card-header">
        <h3>${escapeHtml(person.name || person.slug)}</h3>
        <div class="badges">
          <span class="readiness-badge readiness-${bucket}">${READINESS_LABELS[bucket].emoji} ${bucket}</span>
          <span class="icp-badge icp-${band}">ICP ${escapeHtml(String(score))}</span>
        </div>
      </div>
      <div class="card-meta">${escapeHtml(person.title || '')}${person.title && person.company ? ' &middot; ' : ''}${escapeHtml(person.company || '')}${person.email ? ` &middot; <a href="mailto:${escapeAttr(person.email)}">${escapeHtml(person.email)}</a>` : ''}</div>
      ${linkPills ? `<div class="card-links">${linkPills}</div>` : ''}
      <ul class="card-why">
        ${readinessReason ? `<li><strong>Why ${bucket}:</strong> ${escapeHtml(readinessReason)}</li>` : ''}
        ${roleReason ? `<li><strong>Role:</strong> ${escapeHtml(roleReason)}</li>` : ''}
        ${hook ? `<li><strong>Hook:</strong> ${escapeHtml(hook)}</li>` : ''}
      </ul>
      ${emailBlock}
    </div>
  </div>`;
}

// ----- Shared CSS for the event-follow-up UI ------------------------------

const eventCss = `
  .nav-bar { display:flex; gap:0.5rem; margin-bottom:1.25rem; font-size:0.875rem; }
  .nav-bar a { padding:0.4rem 0.85rem; border:1px solid var(--border); border-radius:4px; background:var(--card); color:var(--muted); font-weight:500; text-decoration:none; }
  .nav-bar a.active { background:var(--brand); color:#fff; border-color:var(--brand); }
  .filter-bar { display:flex; gap:0.75rem; flex-wrap:wrap; margin-bottom:1.25rem; align-items:center; }
  .filter-group { display:flex; gap:0.4rem; flex-wrap:wrap; align-items:center; padding:0.4rem 0.6rem; background:var(--card); border:1px solid var(--border); border-radius:4px; }
  .filter-group .label { font-size:0.7rem; color:var(--muted); text-transform:uppercase; letter-spacing:0.05em; font-weight:600; margin-right:0.25rem; }
  .chip { display:inline-block; padding:0.2rem 0.6rem; border:1px solid var(--border); border-radius:999px; background:#fafafa; font-size:0.7rem; color:var(--muted); cursor:pointer; user-select:none; }
  .chip.active { background:var(--brand); color:#fff; border-color:var(--brand); }
  .chip:hover { border-color:var(--brand); }
  .person-grid { display:flex; flex-direction:column; gap:0.75rem; }
  .person-card { background:var(--card); border:1px solid var(--border); border-radius:6px; padding:1rem 1.1rem; display:flex; flex-direction:row; gap:1rem; align-items:stretch; }
  .person-card.hidden { display:none; }
  .person-card .photo { width:96px; height:96px; flex:0 0 96px; border-radius:6px; object-fit:cover; background:#f0eeec; }
  .person-card .photo-placeholder { display:flex; align-items:center; justify-content:center; font-weight:700; font-size:1.5rem; color:var(--muted); letter-spacing:0.04em; }
  .card-body { flex:1; min-width:0; display:flex; flex-direction:column; gap:0.45rem; }
  .card-header { display:flex; justify-content:space-between; align-items:flex-start; gap:0.5rem; }
  .card-header h3 { font-size:1rem; font-weight:600; color:var(--black); margin:0; }
  .company-groups { display:flex; flex-direction:column; gap:1.5rem; }
  .company-group { background:transparent; }
  .company-header { display:flex; flex-direction:column; gap:0.25rem; padding:0.5rem 0.1rem 0.75rem; border-bottom:1px solid var(--border); margin-bottom:0.75rem; }
  .company-header-row { display:flex; align-items:center; gap:0.6rem; }
  .company-header h2 { font-size:1.05rem; font-weight:600; color:var(--black); margin:0; }
  .company-header .company-meta { font-size:0.75rem; color:var(--muted); margin:0; }
  .company-header .company-fit { font-size:0.8125rem; color:var(--text); margin:0.15rem 0 0; }
  .company-header a { color:var(--brand); text-decoration:none; }
  .company-header a:hover { text-decoration:underline; }
  .company-people { display:flex; flex-direction:column; gap:0.6rem; }
  .readiness-groups { display:flex; flex-direction:column; gap:1.75rem; }
  .readiness-group { background:transparent; }
  .readiness-header { padding:0.5rem 0.1rem 0.75rem; border-bottom:2px solid var(--border); margin-bottom:0.85rem; }
  .readiness-header-row { display:flex; align-items:baseline; gap:0.6rem; flex-wrap:wrap; }
  .readiness-header h2 { font-size:1.1rem; font-weight:700; color:var(--black); margin:0; letter-spacing:0.02em; }
  .readiness-header .readiness-count { font-size:0.8125rem; color:var(--muted); }
  .readiness-people { display:flex; flex-direction:column; gap:0.6rem; }
  .badges { display:flex; gap:0.4rem; align-items:center; flex-shrink:0; }
  .readiness-badge { font-size:0.7rem; font-weight:700; padding:2px 8px; border-radius:3px; white-space:nowrap; letter-spacing:0.04em; }
  .readiness-badge.readiness-HOT     { background:rgba(240,54,3,0.12); color:#c4410d; }
  .readiness-badge.readiness-WARM    { background:rgba(244,186,65,0.18); color:#9a7520; }
  .readiness-badge.readiness-NURTURE { background:rgba(144,201,77,0.16); color:#5a8a1a; }
  .readiness-badge.readiness-COLD    { background:rgba(81,79,79,0.10); color:var(--muted); }
  .email-block { background:#fafafa; border:1px solid var(--border); border-radius:4px; padding:0.6rem 0.75rem; margin-top:0.4rem; font-size:0.8125rem; }
  .email-block .email-subject { font-weight:600; margin-bottom:0.3rem; color:var(--black); }
  .email-block .email-subject .label { font-weight:500; color:var(--muted); margin-right:0.25rem; }
  .email-block .email-body { white-space:normal; line-height:1.5; color:var(--text); }
  .email-block.email-skip { color:var(--muted); font-style:italic; }
  .email-block .card-actions { margin-top:0.5rem; padding-top:0; }
  .email-block .btn-mailto { font:inherit; font-size:0.75rem; font-weight:600; padding:0.4rem 0.7rem; border-radius:4px; border:1px solid var(--border); background:var(--card); color:var(--text); cursor:pointer; text-decoration:none; }
  .email-block .btn-mailto:hover { background:var(--brand); color:#fff; border-color:var(--brand); }
  @media (max-width: 640px) {
    .person-card { flex-direction:column; }
    .person-card .photo { width:80px; height:80px; flex-basis:80px; }
  }
  .icp-badge { font-size:0.7rem; font-weight:700; padding:2px 8px; border-radius:3px; white-space:nowrap; }
  .icp-badge.icp-high { background:rgba(144,201,77,0.14); color:#5a8a1a; }
  .icp-badge.icp-mid { background:rgba(244,186,65,0.14); color:#9a7520; }
  .icp-badge.icp-low { background:rgba(240,54,3,0.10); color:var(--low); }
  .card-meta { font-size:0.8125rem; color:var(--muted); }
  .card-links { display:flex; flex-wrap:wrap; gap:0.3rem; }
  .link-pill { font-size:0.7rem; font-weight:600; padding:2px 8px; border-radius:3px; text-decoration:none; border:1px solid var(--border); color:var(--text); background:#fafafa; letter-spacing:0.04em; }
  .link-pill:hover { background:var(--brand); color:#fff; border-color:var(--brand); }
  .card-why { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:0.3rem; font-size:0.8125rem; color:var(--text); }
  .card-why li { line-height:1.45; }
  .card-why strong { color:var(--black); font-weight:600; }
  .card-actions { display:flex; gap:0.5rem; margin-top:auto; padding-top:0.5rem; }
  .card-actions button { font:inherit; font-size:0.75rem; font-weight:600; padding:0.4rem 0.7rem; border-radius:4px; border:1px solid var(--border); background:var(--card); color:var(--text); cursor:pointer; }
  .card-actions button:hover { background:var(--brand); color:#fff; border-color:var(--brand); }
  .card-actions button.copied { background:var(--high); color:#fff; border-color:var(--high); }
  details.attendees { margin-top:0.4rem; }
  details.attendees summary { cursor:pointer; color:var(--brand); font-size:0.8125rem; font-weight:500; }
  details.attendees ul { margin:0.4rem 0 0 1rem; padding:0; list-style:disc; }
  details.attendees li { font-size:0.8125rem; color:var(--text); margin-bottom:0.2rem; }
`;

const clipboardScript = `
<script>
document.addEventListener('click', e => {
  const btn = e.target.closest('button[data-clipboard]');
  if (!btn) return;
  const text = btn.getAttribute('data-clipboard') || '';
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch {}
    ta.remove();
  }
  const orig = btn.textContent;
  btn.classList.add('copied');
  btn.textContent = 'Copied';
  setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 1200);
});

// Filter chips (people.html)
document.addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  const group = chip.closest('.filter-group');
  if (!group) return;
  group.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  applyFilters();
});

function applyFilters() {
  const grid = document.querySelector('.person-grid');
  if (!grid) return;
  const active = {};
  document.querySelectorAll('.filter-group').forEach(g => {
    const key = g.dataset.filter;
    const chip = g.querySelector('.chip.active');
    active[key] = chip ? chip.dataset.value : '';
  });
  grid.querySelectorAll('.person-card').forEach(card => {
    let show = true;
    for (const k in active) {
      const v = active[k];
      if (!v) continue;
      if ((card.dataset[k] || '') !== v) { show = false; break; }
    }
    card.classList.toggle('hidden', !show);
  });
}
</script>`;

// ----- Person grid + filter chips -----------------------------------------

function renderPeopleGrid(personList) {
  if (personList.length === 0) {
    return '<p style="color:var(--muted);">No people found.</p>';
  }
  return `<div class="person-grid">
${personList.map(p => renderPersonCard(p, p._company)).join('\n')}
</div>`;
}

// Index page: attendees grouped by sales-readiness (HOT → WARM → NURTURE → COLD),
// then by company ICP score desc within each bucket. Empty buckets are skipped.
function renderGroupedByReadiness(personList) {
  if (personList.length === 0) {
    return '<p style="color:var(--muted);">No people found.</p>';
  }
  const order = ['HOT', 'WARM', 'NURTURE', 'COLD'];
  const buckets = Object.fromEntries(order.map(b => [b, []]));
  for (const p of personList) {
    buckets[readinessBucket(p)].push(p);
  }
  // Within each bucket, sort by company ICP score desc, then by name.
  for (const b of order) {
    buckets[b].sort((a, b2) => {
      const sa = a._company ? (parseInt(a._company.icp_fit_score) || 0) : -1;
      const sb = b2._company ? (parseInt(b2._company.icp_fit_score) || 0) : -1;
      if (sb !== sa) return sb - sa;
      return (a.name || '').localeCompare(b2.name || '');
    });
  }

  const sections = order
    .filter(bucket => buckets[bucket].length > 0)
    .map(bucket => {
      const members = buckets[bucket];
      const meta = READINESS_LABELS[bucket];
      return `<section class="readiness-group" data-readiness="${bucket}">
      <header class="readiness-header">
        <div class="readiness-header-row">
          <h2>${meta.emoji} ${meta.label}</h2>
          <span class="readiness-count">${members.length} attendee${members.length === 1 ? '' : 's'} &middot; ${meta.desc}</span>
        </div>
      </header>
      <div class="readiness-people">
        ${members.map(p => renderPersonCard(p, p._company)).join('\n')}
      </div>
    </section>`;
    });

  return `<div class="readiness-groups">\n${sections.join('\n')}\n</div>`;
}

function uniqValues(list, fn) {
  return [...new Set(list.map(fn).filter(Boolean))].sort();
}

// people.html filter chips: ICP band, role bucket, company.
// Activating a chip applies a single-value filter against the matching
// data-* attribute on each .person-card. Click handlers are in clipboardScript.
function renderFilterBar(personList) {
  const compNames = uniqValues(personList, p => p.company);
  const roles = uniqValues(personList, p => roleBucket(p.title));
  const readinessOrder = ['HOT', 'WARM', 'NURTURE', 'COLD'];
  const bands = ['high', 'mid', 'low'];

  const chip = (val, label) => `<span class="chip${val === '' ? ' active' : ''}" data-value="${escapeHtml(val)}">${escapeHtml(label)}</span>`;

  const bandLabels = { high: 'High (8-10)', mid: 'Mid (6-7)', low: 'Low (1-5)' };

  return `<div class="filter-bar">
    <div class="filter-group" data-filter="readiness">
      <span class="label">Sales</span>
      ${chip('', 'All')}
      ${readinessOrder.map(r => chip(r, `${READINESS_LABELS[r].emoji} ${r}`)).join(' ')}
    </div>
    <div class="filter-group" data-filter="icpband">
      <span class="label">ICP</span>
      ${chip('', 'All')}
      ${bands.map(b => chip(b, bandLabels[b])).join(' ')}
    </div>
    <div class="filter-group" data-filter="role">
      <span class="label">Role</span>
      ${chip('', 'All')}
      ${roles.map(r => chip(r, r)).join(' ')}
    </div>
    <div class="filter-group" data-filter="company">
      <span class="label">Company</span>
      ${chip('', 'All')}
      ${compNames.map(c => chip(c.toLowerCase(), c)).join(' ')}
    </div>
  </div>`;
}

// ----- Companies table with attendees expandable ---------------------------

function renderCompaniesTable() {
  // Group people by company slug or name (lowered) so each row can show its attendees.
  const byCompany = new Map();
  for (const p of people) {
    const key = p._company ? (p._company.slug || (p._company.company_name || '').toLowerCase()) : null;
    if (!key) continue;
    if (!byCompany.has(key)) byCompany.set(key, []);
    byCompany.get(key).push(p);
  }

  return deduped.map(c => {
    const sc = scoreClass(c.icp_fit_score);
    const hasDetail = c.body && c.body.length > 50;
    const nameHtml = hasDetail
      ? `<a href="companies/${c.slug}.html">${escapeHtml(c.company_name)}</a>`
      : escapeHtml(c.company_name);
    const websiteHtml = c.website
      ? `<br><a href="${escapeHtml(c.website)}" target="_blank" style="font-size:0.75rem;color:var(--muted);">${escapeHtml(c.website.replace(/^https?:\/\/(www\.)?/, ''))}</a>`
      : '';
    const key = c.slug || (c.company_name || '').toLowerCase();
    const attendees = byCompany.get(key) || [];
    const attendeeBlock = attendees.length ? `
        <details class="attendees">
          <summary>${attendees.length} attendee${attendees.length === 1 ? '' : 's'}</summary>
          <ul>${attendees.map(a => `<li><strong>${escapeHtml(a.name || a.slug)}</strong>${a.title ? ' &mdash; ' + escapeHtml(a.title) : ''}${(a.links && a.links.linkedin) ? ` &middot; <a href="${escapeHtml(a.links.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>` : ''}</li>`).join('')}</ul>
        </details>` : '';
    return `      <tr>
        <td><span class="score ${sc}">${escapeHtml(c.icp_fit_score || '—')}</span></td>
        <td>${nameHtml}${websiteHtml}${attendeeBlock}</td>
        <td style="max-width:200px;">${escapeHtml(c.product_description || '')}</td>
        <td>${escapeHtml(c.industry || '')}</td>
        <td class="reasoning">${escapeHtml(c.icp_fit_reasoning || '')}</td>
      </tr>`;
  }).join('\n');
}

// ----- Compose final pages -------------------------------------------------

const escapedTitle = escapeHtml(title);
const metaLine = `${people.length} speakers &middot; ${deduped.length} companies &middot; ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`;

const navHtml = (active) => `<div class="nav-bar">
  <a href="index.html" class="${active === 'index' ? 'active' : ''}">People</a>
  <a href="people.html" class="${active === 'people' ? 'active' : ''}">People (filterable)</a>
  <a href="companies.html" class="${active === 'companies' ? 'active' : ''}">Companies</a>
</div>`;

function injectCss(html) {
  return html.replace('</style>', `${eventCss}\n</style>`);
}

function injectScript(html) {
  return html.replace('</body>', `${clipboardScript}\n</body>`);
}

function renderShell(activeNav, contentHtml, pageTitle) {
  let html = template
    .replace(/\{\{TITLE\}\}/g, escapeHtml(pageTitle))
    .replace(/\{\{COMPANY_NAME\}\}/g, escapedTitle)
    .replace(/\{\{META\}\}/g, metaLine)
    .replace(/\{\{TOTAL\}\}/g, String(total))
    .replace(/\{\{HIGH_COUNT\}\}/g, String(high))
    .replace(/\{\{MEDIUM_COUNT\}\}/g, String(medium))
    .replace(/\{\{LOW_COUNT\}\}/g, String(low))
    .replace(/\{\{HIGH_PCT\}\}/g, String(highPct))
    .replace(/\{\{MEDIUM_PCT\}\}/g, String(mediumPct))
    .replace(/\{\{LOW_PCT\}\}/g, String(lowPct))
    .replace(/\{\{TABLE_ROWS\}\}/g, () => '');

  // Replace the entire <table>...</table> block with our content
  html = html.replace(/<table class="results-table">[\s\S]*?<\/table>/, `<div class="page-content">${navHtml(activeNav)}\n${contentHtml}</div>`);

  html = injectCss(html);
  html = injectScript(html);
  return html;
}

const indexHtml = renderShell('index', renderGroupedByReadiness(people), `Event Follow-Up — ${title}`);
writeFileSync(join(dir, 'index.html'), indexHtml);

const peopleHtml = renderShell(
  'people',
  `${renderFilterBar(people)}\n${renderPeopleGrid(people)}`,
  `People — ${title}`
);
writeFileSync(join(dir, 'people.html'), peopleHtml);

const companiesContent = `<table class="results-table">
    <thead>
      <tr>
        <th>Score</th>
        <th>Company</th>
        <th>Product</th>
        <th>Industry</th>
        <th>Fit Reasoning</th>
      </tr>
    </thead>
    <tbody>
${renderCompaniesTable()}
    </tbody>
  </table>`;
const companiesHtml = renderShell('companies', companiesContent, `Companies — ${title}`);
writeFileSync(join(dir, 'companies.html'), companiesHtml);

// ----- Per-company detail pages -------------------------------------------

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
<footer>Generated by <a href="https://github.com/browserbase/skills">event-follow-up</a> · Powered by <a href="https://browserbase.com">Browserbase</a></footer>
</body>
</html>`;

  writeFileSync(join(dir, 'companies', `${c.slug}.html`), companyHtml);
}

// ----- CSV ----------------------------------------------------------------
// One row per attendee — the primary deliverable for direct CRM import.

function csvEscape(v) {
  if (v == null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

const csvCols = [
  'sales_readiness', 'name', 'email', 'company', 'title',
  'icp_fit_score', 'email_subject', 'email_body', 'email_cta',
  'sales_readiness_reason', 'hook', 'role_reason',
  'linkedin', 'company_website', 'icp_fit_reasoning',
];
const csvLines = [csvCols.join(',')];
for (const p of people) {
  const c = p._company || {};
  const links = (p.links && typeof p.links === 'object') ? p.links : {};
  const row = {
    sales_readiness: (p.sales_readiness || 'COLD').toUpperCase(),
    name: p.name || '',
    email: p.email || '',
    company: p.company || c.company_name || '',
    title: p.title || '',
    icp_fit_score: c.icp_fit_score || p.icp_fit_score || '',
    email_subject: p.email_subject || '',
    email_body: p.email_body || extractSection(p.body, 'Email') || '',
    email_cta: p.email_cta || '',
    sales_readiness_reason: p.sales_readiness_reason || '',
    hook: p.hook || '',
    role_reason: p.role_reason || '',
    linkedin: links.linkedin || p.linkedin || '',
    company_website: c.website || '',
    icp_fit_reasoning: c.icp_fit_reasoning || '',
  };
  csvLines.push(csvCols.map(k => csvEscape(row[k])).join(','));
}
writeFileSync(join(dir, 'results.csv'), csvLines.join('\n') + '\n');

// ----- Summary ------------------------------------------------------------

const readinessCounts = { HOT: 0, WARM: 0, NURTURE: 0, COLD: 0 };
for (const p of people) readinessCounts[readinessBucket(p)]++;

console.error(JSON.stringify({
  total_companies: deduped.length,
  total_people: people.length,
  icp: { high_fit: high, medium_fit: medium, low_fit: low },
  sales_readiness: readinessCounts,
  files_generated: {
    index: join(dir, 'index.html'),
    people: join(dir, 'people.html'),
    companies: join(dir, 'companies.html'),
    company_pages: deduped.filter(c => c.body && c.body.length > 50).length,
    csv: join(dir, 'results.csv')
  }
}, null, 2));

console.log(join(dir, 'index.html'));

if (shouldOpen) {
  const { execSync } = await import('child_process');
  try { execSync(`open "${join(dir, 'index.html')}"`); } catch {}
}
