#!/usr/bin/env node

// Compiles per-company markdown research files into a deduplicated CSV.
// Parses YAML frontmatter for structured fields, extracts contact info
// and email drafts from markdown body sections.
//
// Usage: node compile_csv.mjs <research-dir> [output-file]
// Example: node compile_csv.mjs /tmp/cold_research ~/Desktop/leads.csv

import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  console.error(`Usage: node compile_csv.mjs <research-dir> [output-file]

Reads all .md files from <research-dir>, parses YAML frontmatter and
body sections (Contact, Email Draft), and writes a deduplicated CSV.

If no output file is specified, writes CSV to stdout.

Options:
  --help, -h  Show this help message

Examples:
  node compile_csv.mjs /tmp/cold_research
  node compile_csv.mjs /tmp/cold_research ~/Desktop/leads.csv`);
  process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
}

const dir = args[0];
const outputFile = args[1] || null;

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

const rows = [];

for (const file of files) {
  const content = readFileSync(join(dir, file), 'utf-8');

  // Parse YAML frontmatter
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) {
    console.error(`Warning: No frontmatter in ${file}, skipping`);
    continue;
  }
  const fields = {};
  for (const line of fmMatch[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (key && val) fields[key] = val;
    }
  }

  // Extract contact info from ## Contact section
  const contactMatch = content.match(/## Contact\n([\s\S]*?)(?=\n## |$)/);
  if (contactMatch && !contactMatch[1].includes('No contact found')) {
    const block = contactMatch[1];
    const nameM = block.match(/Name:\s*(.+)/);
    const titleM = block.match(/Title:\s*(.+)/);
    const emailM = block.match(/Email:\s*(.+)/);
    const linkedinM = block.match(/LinkedIn:\s*(.+)/);
    if (nameM) fields.contact_name = nameM[1].trim();
    if (titleM) fields.contact_title = titleM[1].trim();
    if (emailM) fields.estimated_email = emailM[1].trim();
    if (linkedinM && linkedinM[1].trim() !== '—') fields.linkedin_url = linkedinM[1].trim();
  }

  // Extract email draft from ## Email Draft section
  const emailMatch = content.match(/## Email Draft\n([\s\S]*?)(?=\n## |$)/);
  if (emailMatch) {
    fields.personalized_email = emailMatch[1].trim().replace(/\n/g, '\\n');
  }

  rows.push(fields);
}

if (rows.length === 0) {
  console.error('No valid research files found');
  process.exit(1);
}

// Deduplicate by normalized company name (keep highest ICP score)
const seen = new Map();
for (const row of rows) {
  const name = (row.company_name || '').toLowerCase().replace(/\s*(inc|llc|ltd|corp|co)\s*\.?$/i, '').trim();
  const score = parseInt(row.icp_fit_score) || 0;
  if (!seen.has(name) || score > (parseInt(seen.get(name).icp_fit_score) || 0)) {
    seen.set(name, row);
  }
}
const dedupedRows = [...seen.values()];

// Priority columns first, then rest alphabetically
const priority = [
  'company_name', 'website', 'product_description', 'icp_fit_score',
  'icp_fit_reasoning', 'contact_name', 'contact_title', 'estimated_email',
  'linkedin_url', 'personalized_email'
];
const allCols = [...new Set(dedupedRows.flatMap(r => Object.keys(r)))];
const cols = [
  ...priority.filter(c => allCols.includes(c)),
  ...allCols.filter(c => !priority.includes(c)).sort()
];

function csvEscape(v) {
  if (!v) return '';
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return '"' + v.replace(/"/g, '""') + '"';
  }
  return v;
}

const csvLines = [cols.join(',')];
for (const row of dedupedRows) {
  csvLines.push(cols.map(c => csvEscape(row[c] || '')).join(','));
}
const csvContent = csvLines.join('\n') + '\n';

if (outputFile) {
  writeFileSync(outputFile, csvContent);
} else {
  process.stdout.write(csvContent);
}

// Summary to stderr
const scores = dedupedRows.map(r => parseInt(r.icp_fit_score) || 0);
const high = scores.filter(s => s >= 8).length;
const medium = scores.filter(s => s >= 5 && s < 8).length;
const low = scores.filter(s => s < 5).length;
const withContacts = dedupedRows.filter(r => r.contact_name).length;
const dupsRemoved = rows.length - dedupedRows.length;

console.error(JSON.stringify({
  total_leads: dedupedRows.length,
  duplicates_removed: dupsRemoved,
  with_contacts: withContacts,
  score_distribution: { high_8_10: high, medium_5_7: medium, low_1_4: low },
  columns: cols,
  output_file: outputFile || 'stdout'
}, null, 2));
