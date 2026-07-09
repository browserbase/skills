#!/usr/bin/env node
// parse_csv.mjs — read an event-attendee CSV, auto-detect column headers, and
// emit a normalized people.jsonl + seed_companies.txt + parse_stats.json.
//
// Usage: node parse_csv.mjs <input.csv> <output-dir> [--user-company <slug>]
//                          [--col-name <col>] [--col-email <col>]
//                          [--col-company <col>] [--col-title <col>]

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);
if (args.length < 2 || args.includes('--help')) {
  console.error(`Usage: parse_csv.mjs <input.csv> <output-dir> [--user-company <slug>]
                       [--col-name <col>] [--col-email <col>]
                       [--col-company <col>] [--col-title <col>]`);
  process.exit(1);
}

const inputPath = args[0];
const outDir = args[1];
const flag = (name) => { const i = args.indexOf(name); return i !== -1 ? args[i + 1] : null; };
const userCompany = flag('--user-company');
const overrides = {
  name: flag('--col-name'),
  email: flag('--col-email'),
  company: flag('--col-company'),
  title: flag('--col-title'),
};

// --- Header fuzzy match ---------------------------------------------------

// Each canonical key has an ordered list of header candidates. The first match
// wins. Casing/whitespace/underscores are normalized before matching.
const CANDIDATES = {
  email:    ['email', 'email address', 'work email', 'attendee email', 'contact email', 'e-mail'],
  name:     ['name', 'full name', 'attendee name', 'contact name'],
  first:    ['first name', 'firstname', 'given name', 'first'],
  last:     ['last name', 'lastname', 'surname', 'family name', 'last'],
  company:  ['company', 'company name', 'organization', 'organisation', 'org', 'employer', 'account', 'account name'],
  title:    ['title', 'job title', 'role', 'position', 'job role', 'jobtitle'],
  linkedin: ['linkedin', 'linkedin url', 'linkedin profile'],
  notes:    ['notes', 'note', 'comments', 'comment', 'team notes'],
  scanned_at: ['scanned at', 'badge scan', 'scan time', 'check-in time', 'checkin time', 'timestamp'],
  track:    ['track', 'event track', 'session track', 'topic'],
};

function normHeader(h) {
  return (h || '').toString().trim().toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ');
}

function detectColumns(headers) {
  const norm = headers.map(normHeader);
  const map = {};
  for (const [key, list] of Object.entries(CANDIDATES)) {
    for (const cand of list) {
      const idx = norm.indexOf(cand);
      if (idx !== -1) { map[key] = idx; break; }
    }
  }
  return map;
}

// --- CSV parser (RFC 4180-ish, handles quoted fields with commas/newlines) ---

function parseCSV(text) {
  // Strip UTF-8 BOM if present
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = [];
  let cur = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; } // escaped quote
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { cur.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; } // ignore CR; LF closes the row
    if (c === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; i++; continue; }
    field += c; i++;
  }
  // flush trailing field/row
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0].trim().length > 0));
}

// --- Field cleaning helpers ----------------------------------------------

function clean(s) {
  return (s == null ? '' : String(s)).trim();
}

function slugify(s) {
  return clean(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function emailDomain(email) {
  const m = clean(email).toLowerCase().match(/@([a-z0-9.-]+)$/);
  return m ? m[1] : null;
}

// Best-effort: derive a company name from an email domain when the CSV has no
// company column. Strips common public-mail providers and TLDs.
const PUBLIC_MAIL = new Set(['gmail.com','yahoo.com','outlook.com','hotmail.com','icloud.com','aol.com','proton.me','protonmail.com','live.com','me.com','msn.com']);
function companyFromEmail(email) {
  const d = emailDomain(email);
  if (!d || PUBLIC_MAIL.has(d)) return null;
  const root = d.replace(/^(www|mail|email)\./, '').split('.')[0];
  if (!root || root.length < 2) return null;
  // Title-case the slug for readability
  return root.charAt(0).toUpperCase() + root.slice(1);
}

// --- Main ----------------------------------------------------------------

const raw = readFileSync(inputPath, 'utf-8');
const rows = parseCSV(raw);
if (rows.length === 0) {
  console.error('CSV is empty');
  process.exit(1);
}

const headers = rows[0].map(clean);
const detected = detectColumns(headers);

// Apply user overrides (--col-name etc.) by header name lookup
function findCol(want) {
  if (!want) return null;
  const target = normHeader(want);
  return headers.findIndex(h => normHeader(h) === target);
}
for (const k of Object.keys(overrides)) {
  if (overrides[k]) {
    const i = findCol(overrides[k]);
    if (i !== -1) detected[k] = i; else console.error(`--col-${k} "${overrides[k]}" did not match any header`);
  }
}

if (detected.email == null) {
  console.error(`ERROR: could not auto-detect an email column. Headers found: ${headers.join(' | ')}`);
  console.error('Re-run with --col-email "<header name>" to specify.');
  process.exit(1);
}

const userCompanyLower = userCompany ? userCompany.toLowerCase() : null;

const dataRows = rows.slice(1);
const out = [];
const skipped = { no_email: 0, user_company: 0, dup: 0 };
const seenEmails = new Set();

for (const row of dataRows) {
  const get = (k) => detected[k] != null ? clean(row[detected[k]]) : '';

  const email = get('email').toLowerCase();
  if (!email || !email.includes('@')) { skipped.no_email++; continue; }
  if (seenEmails.has(email)) { skipped.dup++; continue; }
  seenEmails.add(email);

  // Build name from full Name OR first+last
  let name = get('name');
  if (!name) {
    const f = get('first'); const l = get('last');
    name = [f, l].filter(Boolean).join(' ').trim();
  }
  if (!name) name = email.split('@')[0]; // last-resort fallback

  let company = get('company');
  if (!company) company = companyFromEmail(email) || '';

  // Skip the user's own org employees — they aren't prospects
  if (userCompanyLower && company && company.toLowerCase() === userCompanyLower) {
    skipped.user_company++; continue;
  }
  // Also drop public-mail rows that ended up with no company at all (poor signal)
  if (!company) { /* keep but flag */ }

  const record = {
    name,
    email,
    company: company || null,
    title: get('title') || null,
    linkedin: get('linkedin') || null,
    notes: get('notes') || null,
    scanned_at: get('scanned_at') || null,
    track: get('track') || null,
    slug: slugify(name) || slugify(email.replace('@', '-at-')),
  };
  out.push(record);
}

writeFileSync(join(outDir, 'people.jsonl'), out.map(p => JSON.stringify(p)).join('\n') + '\n');

// Deduped, sorted company list (drop blanks and the user's own org)
const companies = [...new Set(out.map(p => p.company).filter(Boolean))].sort((a, b) => a.localeCompare(b));
writeFileSync(join(outDir, 'seed_companies.txt'), companies.join('\n') + '\n');

const stats = {
  input_path: inputPath,
  total_rows: dataRows.length,
  parsed: out.length,
  unique_companies: companies.length,
  skipped,
  detected_columns: Object.fromEntries(Object.entries(detected).map(([k, i]) => [k, headers[i]])),
  csv_headers: headers,
  user_company_filter: userCompany || null,
};
writeFileSync(join(outDir, 'parse_stats.json'), JSON.stringify(stats, null, 2));

console.error(`Parsed ${out.length} attendees / ${companies.length} unique companies → ${outDir}`);
console.log(JSON.stringify({ peopleCount: out.length, companyCount: companies.length, detected: stats.detected_columns }, null, 2));
