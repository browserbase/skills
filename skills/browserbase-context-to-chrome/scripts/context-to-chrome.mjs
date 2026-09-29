#!/usr/bin/env node
import Browserbase from '@browserbasehq/sdk';
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

function usage() {
  return `Usage: node scripts/context-to-chrome.mjs --context <id> --url <https://site> (--domains site.com,login.site.com | --all) [--profile <directory>] [--headless]`;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--headless' || key === '--all') {
      args[key.slice(2)] = true;
    } else if (['--context', '--url', '--domains', '--profile'].includes(key)) {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}\n${usage()}`);
      args[key.slice(2)] = value;
    } else {
      throw new Error(`Unknown argument: ${key}\n${usage()}`);
    }
  }
  if (!args.context || !args.url || (!!args.domains === !!args.all)) throw new Error(usage());
  if (!process.env.BROWSERBASE_API_KEY) throw new Error('BROWSERBASE_API_KEY is required');
  const url = new URL(args.url);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('URL must use http or https');
  args.url = url.href;
  args.profile = resolve(args.profile ?? '.browserbase-chrome-profile');
  args.domains = args.domains?.split(',').map(s => s.trim().toLowerCase().replace(/^\./, '')).filter(Boolean);
  if (args.domains && (args.domains.length === 0 || args.domains.some(d => !/^[a-z0-9.-]+$/.test(d)))) {
    throw new Error('Invalid --domains value');
  }
  if (args.domains && !args.domains.some(d => url.hostname === d || url.hostname.endsWith(`.${d}`))) {
    throw new Error('The URL host must be included in --domains');
  }
  return args;
}

function siteMatches(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

function filterState(state, domains) {
  if (!domains) return state;
  const keepOrigin = origin => domains.some(d => siteMatches(new URL(origin).hostname, d));
  const keepCookie = cookie => {
    const host = cookie.domain.replace(/^\./, '').toLowerCase();
    return domains.some(d => siteMatches(host, d) || siteMatches(d, host));
  };
  return {
    cookies: state.cookies.filter(keepCookie),
    origins: state.origins.filter(item => keepOrigin(item.origin)),
  };
}

async function releaseSession(id) {
  const response = await fetch(`https://api.browserbase.com/v1/sessions/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: {
      'X-BB-API-Key': process.env.BROWSERBASE_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: 'REQUEST_RELEASE' }),
  });
  if (!response.ok) throw new Error(`Could not release Browserbase session (${response.status})`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const marker = join(args.profile, '.browserbase-context-to-chrome');
  if (existsSync(args.profile) && readdirSync(args.profile).length && !existsSync(marker)) {
    throw new Error(`Profile is not managed by this skill: ${args.profile}`);
  }
  mkdirSync(args.profile, { recursive: true, mode: 0o700 });

  const bb = new Browserbase();
  const session = await bb.sessions.create({
    keepAlive: true,
    browserSettings: { context: { id: args.context, persist: false } },
  });
  let state;
  try {
    const remote = await chromium.connectOverCDP(session.connectUrl);
    const source = remote.contexts()[0];
    if (!source) throw new Error('Browserbase session has no browser context');
    const sourcePage = source.pages()[0] ?? await source.newPage();
    await sourcePage.goto(args.url, { waitUntil: 'domcontentloaded' });
    state = filterState(await source.storageState({ indexedDB: true }), args.domains);
  } finally {
    await releaseSession(session.id);
  }
  if (!state.cookies.length && !state.origins.length) {
    throw new Error('No cookies or site storage matched the requested domains');
  }

  writeFileSync(marker, 'Managed by browserbase-context-to-chrome\n', { mode: 0o600 });
  const local = await chromium.launchPersistentContext(args.profile, {
    channel: 'chrome',
    headless: !!args.headless,
  });
  try {
    await local.setStorageState(state);
    const page = local.pages()[0] ?? await local.newPage();
    await page.goto(args.url, { waitUntil: 'domcontentloaded' });
    console.log(`Transferred ${state.cookies.length} cookies and ${state.origins.length} origins to ${args.profile}`);
    console.log(`Opened ${page.url()}`);
    if (!args.headless) {
      console.log('Chrome is ready for use. Close its window or press Ctrl-C to finish.');
      await Promise.race([
        new Promise(resolve => local.once('close', resolve)),
        new Promise(resolve => process.once('SIGINT', resolve)),
      ]);
    }
  } finally {
    if (!local.isClosed()) await local.close();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
