#!/usr/bin/env node

// Deduplicates discovery URLs from bb search JSON output files.
// Usage: node list_urls.mjs /tmp [--prefix competitor]
// Reads all {prefix}_discovery_batch_*.json files, deduplicates by domain,
// outputs one URL per line to stdout, stats to stderr.

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  console.error(`Usage: node list_urls.mjs <directory> [--prefix <prefix>]

Reads all <prefix>_discovery_batch_*.json files from <directory>,
deduplicates URLs by domain, and outputs one URL per line to stdout.

Options:
  --prefix <prefix>  Batch file prefix (default: "competitor")
  --help, -h         Show this help message

Examples:
  node list_urls.mjs /tmp
  node list_urls.mjs /tmp --prefix competitor`);
  process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
}

const dir = args[0];
const prefixIdx = args.indexOf('--prefix');
const prefix = prefixIdx !== -1 && args[prefixIdx + 1] ? args[prefixIdx + 1] : 'competitor';

const pattern = new RegExp(`^${prefix}_discovery_batch_.*\\.json$`);

let files;
try {
  files = readdirSync(dir)
    .filter(f => pattern.test(f))
    .sort();
} catch (err) {
  console.error(`Error reading directory ${dir}: ${err.message}`);
  process.exit(1);
}

if (files.length === 0) {
  console.error(`No ${prefix}_discovery_batch_*.json files found in ${dir}`);
  process.exit(1);
}

const seenDomains = new Set();
const urls = [];
let totalResults = 0;

for (const file of files) {
  try {
    const data = JSON.parse(readFileSync(join(dir, file), 'utf-8'));
    const results = Array.isArray(data) ? data : (data.results || []);
    totalResults += results.length;

    for (const result of results) {
      const url = result.url;
      if (!url) continue;

      try {
        const hostname = new URL(url).hostname.replace(/^www\./, '');
        if (!seenDomains.has(hostname)) {
          seenDomains.add(hostname);
          urls.push(url);
        }
      } catch {
        // Skip invalid URLs
      }
    }
  } catch (err) {
    console.error(`Warning: Failed to parse ${file}: ${err.message}`);
  }
}

for (const url of urls) {
  console.log(url);
}

console.error(`\n${files.length} files, ${totalResults} total results, ${urls.length} unique domains`);
