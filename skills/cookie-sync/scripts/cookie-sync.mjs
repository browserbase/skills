#!/usr/bin/env node
// cookie-sync — Export cookies from local Chrome and inject into a Browserbase session.
// Zero npm dependencies. Node 22+ only (built-in WebSocket, fetch).
//
// Usage:
//   BROWSERBASE_API_KEY=xxx BROWSERBASE_PROJECT_ID=yyy node cookie-sync.mjs
//
// Env vars:
//   BROWSERBASE_API_KEY    — required
//   BROWSERBASE_PROJECT_ID — required
//   CDP_PORT_FILE          — optional, path to DevToolsActivePort if non-standard
//   BROWSERBASE_CONTEXT_ID — optional, reuse an existing context

import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { resolve } from 'path';

const BROWSERBASE_API = 'https://api.browserbase.com/v1';
const TIMEOUT = 15000;

// ---------------------------------------------------------------------------
// Env validation
// ---------------------------------------------------------------------------

const API_KEY = process.env.BROWSERBASE_API_KEY;
const PROJECT_ID = process.env.BROWSERBASE_PROJECT_ID;

if (!API_KEY) {
  console.error('Error: BROWSERBASE_API_KEY is required');
  process.exit(1);
}
if (!PROJECT_ID) {
  console.error('Error: BROWSERBASE_PROJECT_ID is required');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Find local Chrome DevTools WebSocket URL
// ---------------------------------------------------------------------------

function getLocalWsUrl() {
  const home = homedir();
  const IS_WINDOWS = process.platform === 'win32';

  const macBrowsers = [
    'Google/Chrome', 'Google/Chrome Beta', 'Google/Chrome for Testing',
    'Chromium', 'BraveSoftware/Brave-Browser', 'Microsoft Edge',
  ];
  const linuxBrowsers = [
    'google-chrome', 'google-chrome-beta', 'chromium',
    'vivaldi', 'vivaldi-snapshot',
    'BraveSoftware/Brave-Browser', 'microsoft-edge',
  ];

  const candidates = [
    process.env.CDP_PORT_FILE,
    ...macBrowsers.flatMap(b => [
      resolve(home, 'Library/Application Support', b, 'DevToolsActivePort'),
      resolve(home, 'Library/Application Support', b, 'Default/DevToolsActivePort'),
    ]),
    ...linuxBrowsers.flatMap(b => [
      resolve(home, '.config', b, 'DevToolsActivePort'),
      resolve(home, '.config', b, 'Default/DevToolsActivePort'),
    ]),
    ...(IS_WINDOWS ? ['Google/Chrome', 'BraveSoftware/Brave-Browser', 'Microsoft/Edge'].flatMap(b => {
      const base = process.env.LOCALAPPDATA || resolve(home, 'AppData/Local');
      return [
        resolve(base, b, 'User Data/DevToolsActivePort'),
        resolve(base, b, 'User Data/Default/DevToolsActivePort'),
      ];
    }) : []),
  ].filter(Boolean);

  const portFile = candidates.find(p => existsSync(p));
  if (!portFile) {
    throw new Error(
      'No DevToolsActivePort found.\n' +
      'Enable remote debugging: chrome://flags/#allow-remote-debugging (Chrome 146+)\n' +
      'Or launch Chrome with --remote-debugging-port=9222'
    );
  }

  const lines = readFileSync(portFile, 'utf8').trim().split('\n');
  if (lines.length < 2 || !lines[0] || !lines[1]) {
    throw new Error(`Invalid DevToolsActivePort file: ${portFile}`);
  }

  const host = process.env.CDP_HOST || '127.0.0.1';
  return `ws://${host}:${lines[0]}${lines[1]}`;
}

// ---------------------------------------------------------------------------
// Minimal CDP WebSocket client
// ---------------------------------------------------------------------------

class CDP {
  #ws; #id = 0; #pending = new Map();

  connect(wsUrl) {
    return new Promise((res, rej) => {
      this.#ws = new WebSocket(wsUrl);
      this.#ws.onopen = () => res();
      this.#ws.onerror = (e) => rej(new Error('WebSocket error: ' + (e.message || e.type)));
      this.#ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id && this.#pending.has(msg.id)) {
          const { resolve, reject } = this.#pending.get(msg.id);
          this.#pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      };
    });
  }

  send(method, params = {}, sessionId) {
    const id = ++this.#id;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      const msg = { id, method, params };
      if (sessionId) msg.sessionId = sessionId;
      this.#ws.send(JSON.stringify(msg));
      setTimeout(() => {
        if (this.#pending.has(id)) {
          this.#pending.delete(id);
          reject(new Error(`Timeout: ${method}`));
        }
      }, TIMEOUT);
    });
  }

  close() { this.#ws.close(); }
}

// ---------------------------------------------------------------------------
// Browserbase API helpers
// ---------------------------------------------------------------------------

async function bbFetch(path, options = {}) {
  const res = await fetch(`${BROWSERBASE_API}${path}`, {
    ...options,
    headers: {
      'x-bb-api-key': API_KEY,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Browserbase API ${res.status}: ${body}`);
  }
  return res.json();
}

async function createContext() {
  return bbFetch('/contexts', {
    method: 'POST',
    body: JSON.stringify({ projectId: PROJECT_ID }),
  });
}

async function createSession(contextId) {
  const body = {
    projectId: PROJECT_ID,
    keepAlive: true,
  };
  if (contextId) {
    body.browserSettings = {
      context: { id: contextId, persist: true },
    };
  }
  return bbFetch('/sessions', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function waitForSessionRunning(sessionId, maxWaitMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const session = await bbFetch(`/sessions/${sessionId}`);
    if (session.status === 'RUNNING') return session;
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('Timed out waiting for Browserbase session to start');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Step 1: Connect to local Chrome and export cookies
  const localWsUrl = getLocalWsUrl();
  const localCdp = new CDP();
  await localCdp.connect(localWsUrl);
  console.log('Connected to local Chrome');

  const { targetInfos } = await localCdp.send('Target.getTargets');
  const page = targetInfos.find(t => t.type === 'page' && !t.url.startsWith('chrome://'));
  if (!page) {
    throw new Error('No open page targets found. Open at least one tab in Chrome.');
  }
  const { sessionId: localSession } = await localCdp.send('Target.attachToTarget', {
    targetId: page.targetId, flatten: true,
  });

  const { cookies } = await localCdp.send('Network.getAllCookies', {}, localSession);
  console.log(`Exported ${cookies.length} cookies`);
  localCdp.close();

  if (cookies.length === 0) {
    console.warn('Warning: No cookies found. Is Chrome running and logged into sites?');
  }

  // Step 2: Create or reuse a context
  let contextId = process.env.BROWSERBASE_CONTEXT_ID;
  if (!contextId) {
    const context = await createContext();
    contextId = context.id;
    console.log(`Created context: ${contextId}`);
  } else {
    console.log(`Reusing context: ${contextId}`);
  }

  // Step 3: Create Browserbase session with context
  const session = await createSession(contextId);
  const sessionId = session.id;
  console.log(`Created Browserbase session: ${sessionId}`);

  const viewerUrl = `https://www.browserbase.com/sessions/${sessionId}`;
  console.log(`Live view: ${viewerUrl}`);

  await waitForSessionRunning(sessionId);
  console.log('Session is running');

  // Step 4: Connect to cloud browser and inject cookies
  const connectUrl = `wss://connect.browserbase.com?apiKey=${API_KEY}&sessionId=${sessionId}`;
  const cloudCdp = new CDP();
  await cloudCdp.connect(connectUrl);

  const { targetInfos: cloudTargets } = await cloudCdp.send('Target.getTargets');
  const cloudPage = cloudTargets.find(t => t.type === 'page');
  if (!cloudPage) throw new Error('No page target found in Browserbase session');
  const { sessionId: cloudSession } = await cloudCdp.send('Target.attachToTarget', {
    targetId: cloudPage.targetId, flatten: true,
  });

  await cloudCdp.send('Network.setCookies', { cookies }, cloudSession);
  console.log(`Injected ${cookies.length} cookies into cloud browser`);
  cloudCdp.close();

  // Step 5: Summary
  console.log('');
  console.log('Cookie sync complete.');
  console.log(`  Session ID: ${sessionId}`);
  console.log(`  Context ID: ${contextId}`);
  console.log(`  Live view:  ${viewerUrl}`);
  console.log('');
  console.log('The cloud browser is now authenticated with your local Chrome cookies.');
  console.log('Session has keepAlive — it stays open until explicitly closed.');
  console.log(`To reuse this context later: export BROWSERBASE_CONTEXT_ID=${contextId}`);
}

main().catch(e => {
  console.error(`Error: ${e.message}`);
  process.exit(1);
});
