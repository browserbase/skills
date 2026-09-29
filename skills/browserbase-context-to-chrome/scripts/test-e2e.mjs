#!/usr/bin/env node
import Browserbase from '@browserbasehq/sdk';
import { chromium } from 'playwright';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

if (!process.env.BROWSERBASE_API_KEY) throw new Error('BROWSERBASE_API_KEY is required');

const bb = new Browserbase();
const site = 'https://example.com/';
const testValue = randomUUID();
const profile = await mkdtemp(join(tmpdir(), 'bb-context-to-chrome-'));
let context;
let session;

async function release(id) {
  const response = await fetch(`https://api.browserbase.com/v1/sessions/${id}`, {
    method: 'POST',
    headers: {
      'X-BB-API-Key': process.env.BROWSERBASE_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: 'REQUEST_RELEASE' }),
  });
  if (!response.ok) throw new Error(`Session release failed: ${response.status}`);
}

try {
  context = await bb.contexts.create({ name: `context-to-chrome-test-${randomUUID()}` });
  session = await bb.sessions.create({
    keepAlive: true,
    browserSettings: { context: { id: context.id, persist: true } },
  });
  const remote = await chromium.connectOverCDP(session.connectUrl);
  const source = remote.contexts()[0];
  const page = await source.newPage();
  await page.goto(site, { waitUntil: 'domcontentloaded' });
  await source.addCookies([{ name: 'bb_context_to_chrome_test', value: testValue, domain: 'example.com', path: '/', expires: Math.floor(Date.now() / 1000) + 3600 }]);
  await source.addCookies([{ name: 'bb_excluded_test', value: testValue, domain: 'example.org', path: '/', expires: Math.floor(Date.now() / 1000) + 3600 }]);
  await page.evaluate(value => localStorage.setItem('bb_context_to_chrome_test', value), testValue);
  const before = await source.storageState({ indexedDB: true });
  console.log(`Seeded ${before.cookies.length} cookies and ${before.origins.length} origins`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await new Promise(resolve => setTimeout(resolve, 1000));
  await remote.close();
  await release(session.id).catch(() => {});
  session = null;

  const script = join(dirname(fileURLToPath(import.meta.url)), 'context-to-chrome.mjs');
  let result;
  for (let attempt = 0; attempt < 5; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    result = spawnSync(process.execPath, [script, '--context', context.id, '--url', site,
      '--domains', 'example.com', '--profile', profile, '--headless'], { encoding: 'utf8' });
    if (result.status === 0) break;
  }
  if (result.status !== 0) throw new Error(`Transfer failed: ${result.stderr}`);
  console.log(result.stdout.trim());

  const local = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true });
  try {
    const checkPage = await local.newPage();
    await checkPage.goto(site, { waitUntil: 'domcontentloaded' });
    const cookie = (await local.cookies(site)).find(x => x.name === 'bb_context_to_chrome_test');
    const excluded = (await local.cookies('https://example.org/')).find(x => x.name === 'bb_excluded_test');
    const stored = await checkPage.evaluate(() => localStorage.getItem('bb_context_to_chrome_test'));
    if (cookie?.value !== testValue || stored !== testValue || excluded) {
      throw new Error(`State mismatch: cookie=${cookie?.value === testValue}, localStorage=${stored === testValue}, excluded=${!excluded}`);
    }
    console.log('PASS: cookie and localStorage survived; unrelated cookie was excluded');
  } finally {
    await local.close();
  }
} finally {
  if (session) await release(session.id).catch(() => {});
  if (context) await bb.contexts.delete(context.id).catch(() => {});
  await rm(profile, { recursive: true, force: true });
}
