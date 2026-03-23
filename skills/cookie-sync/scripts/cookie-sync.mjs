#!/usr/bin/env node
// cookie-sync — Export cookies from local Chrome and inject into a Browserbase session.
// Zero npm dependencies. Node 22+ only (built-in WebSocket, fetch).
//
// Usage:
//   node cookie-sync.mjs                                                # sync all cookies, ephemeral session
//   node cookie-sync.mjs --domains google.com,github.com                # only sync cookies for these domains
//   node cookie-sync.mjs --persist                                      # create a persistent context (reusable)
//   node cookie-sync.mjs --context ctx_abc123                           # reuse an existing context
//   node cookie-sync.mjs --stealth                                      # enable advanced stealth mode
//   node cookie-sync.mjs --proxy "San Francisco,CA,US"                  # use residential proxy with geolocation
//   node cookie-sync.mjs --persist --domains github.com --stealth --proxy "San Francisco,CA,US"
//
// Env vars:
//   BROWSERBASE_API_KEY    — required
//   BROWSERBASE_PROJECT_ID — required
//   CDP_PORT_FILE          — optional, path to DevToolsActivePort if non-standard

import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { homedir } from 'os';
import { resolve } from 'path';

const BROWSERBASE_API = 'https://api.browserbase.com/v1';
const TIMEOUT = 15000;

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { domains: [], persist: false, contextId: null, stealth: false, proxy: null };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--domains' && args[i + 1]) {
      result.domains = args[++i].split(',').map(d => d.trim().toLowerCase()).filter(Boolean);
    } else if (args[i] === '--persist') {
      result.persist = true;
    } else if (args[i] === '--context' && args[i + 1]) {
      result.contextId = args[++i];
    } else if (args[i] === '--stealth') {
      result.stealth = true;
    } else if (args[i] === '--proxy' && args[i + 1]) {
      // Format: "City,ST,US" e.g. "San Francisco,CA,US"
      const parts = args[++i].split(',').map(s => s.trim());
      result.proxy = { city: parts[0], state: parts[1], country: parts[2] || 'US' };
    }
  }

  return result;
}

const CLI = parseArgs();

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
// Find local Chrome DevTools WebSocket URL (replicates cdp.mjs logic)
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
// Minimal CDP WebSocket client (same pattern as cdp.mjs)
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
// Cookie filtering
// ---------------------------------------------------------------------------

function filterCookies(cookies, domains) {
  if (domains.length === 0) return cookies;

  return cookies.filter(cookie => {
    // Cookie domain may have a leading dot (e.g. ".google.com")
    const cookieDomain = cookie.domain.replace(/^\./, '').toLowerCase();
    return domains.some(d => cookieDomain === d || cookieDomain.endsWith('.' + d));
  });
}

// Network.setCookies silently drops secure cookies unless each cookie has a
// `url` field that tells CDP which origin to associate it with. We derive the
// URL from domain + path + secure flag so every cookie lands correctly.
function addUrlsToCookies(cookies) {
  return cookies.map(cookie => {
    const scheme = cookie.secure ? 'https' : 'http';
    const domain = cookie.domain.replace(/^\./, '');
    const path = cookie.path || '/';
    return { ...cookie, url: `${scheme}://${domain}${path}` };
  });
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

  body.browserSettings = {};

  if (CLI.stealth) {
    body.browserSettings.advancedStealth = true;
  }

  if (CLI.proxy) {
    body.proxies = [{ type: 'browserbase', geolocation: CLI.proxy }];
  }

  if (contextId) {
    body.browserSettings.context = {
      id: contextId,
      persist: true,
    };
  }

  return bbFetch('/sessions', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function getDebugUrl(sessionId) {
  return bbFetch(`/sessions/${sessionId}/debug`);
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

function checkChromeVersion() {
  const chromePaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  for (const p of chromePaths) {
    if (existsSync(p)) {
      try {
        const out = execSync(`"${p}" --version`, { encoding: 'utf8' }).trim();
        const match = out.match(/(\d+)\./);
        if (match) {
          const major = parseInt(match[1], 10);
          if (major < 146) {
            console.error(`Chrome ${major} detected. Version 146+ is required for cookie sync.`);
            console.error('Update Chrome or install Chrome Beta: https://www.google.com/chrome/beta/');
            process.exit(1);
          }
          console.log(`Chrome ${major} detected`);
          return;
        }
      } catch { /* try next */ }
    }
  }
  // If we can't detect version, continue and let CDP connection fail with a clear error if needed
}

async function main() {
  // Step 0: Verify Chrome version supports remote debugging
  checkChromeVersion();

  // Step 1: Connect to local Chrome and export cookies
  const localWsUrl = getLocalWsUrl();
  const localCdp = new CDP();
  await localCdp.connect(localWsUrl);
  console.log('Connected to local Chrome');

  // Need to attach to a page target to access Network domain
  const { targetInfos } = await localCdp.send('Target.getTargets');
  const page = targetInfos.find(t => t.type === 'page' && !t.url.startsWith('chrome://'));
  if (!page) {
    throw new Error('No open page targets found. Open at least one tab in Chrome.');
  }
  const { sessionId: localSession } = await localCdp.send('Target.attachToTarget', {
    targetId: page.targetId, flatten: true,
  });

  const { cookies: allCookies } = await localCdp.send('Network.getAllCookies', {}, localSession);
  console.log(`Exported ${allCookies.length} cookies from local Chrome`);
  localCdp.close();

  // Step 2: Filter cookies by domain if requested
  const cookies = filterCookies(allCookies, CLI.domains);

  if (CLI.domains.length > 0) {
    console.log(`Filtered to ${cookies.length} cookies matching: ${CLI.domains.join(', ')}`);
  }

  if (cookies.length === 0) {
    console.warn('Warning: No cookies to sync. Check your domain filters or Chrome login state.');
    process.exit(0);
  }

  // Step 3: Set up context (create new, reuse existing, or skip)
  let contextId = CLI.contextId;

  if (!contextId && CLI.persist) {
    const ctx = await createContext();
    contextId = ctx.id;
    console.log(`Created persistent context: ${contextId}`);
  }

  if (contextId) {
    console.log(`Using context: ${contextId} (persist: true)`);
  }

  // Step 4: Create Browserbase session (with context if available)
  const session = await createSession(contextId);
  const sessionId = session.id;
  console.log(`Created Browserbase session: ${sessionId}`);

  const viewerUrl = `https://www.browserbase.com/sessions/${sessionId}`;
  console.log(`Live view: ${viewerUrl}`);

  // Wait for session to be ready
  await waitForSessionRunning(sessionId);
  console.log('Session is running');

  // Step 5: Connect to cloud browser and inject cookies
  const connectUrl = `wss://connect.browserbase.com?apiKey=${API_KEY}&sessionId=${sessionId}`;
  const cloudCdp = new CDP();
  await cloudCdp.connect(connectUrl);

  const { targetInfos: cloudTargets } = await cloudCdp.send('Target.getTargets');
  const cloudPage = cloudTargets.find(t => t.type === 'page');
  if (!cloudPage) throw new Error('No page target found in Browserbase session');
  const { sessionId: cloudSession } = await cloudCdp.send('Target.attachToTarget', {
    targetId: cloudPage.targetId, flatten: true,
  });

  const cookiesWithUrls = addUrlsToCookies(cookies);
  await cloudCdp.send('Network.setCookies', { cookies: cookiesWithUrls }, cloudSession);
  console.log(`Injected ${cookies.length} cookies into cloud browser`);
  cloudCdp.close();

  // Step 6: Summary
  console.log('');
  console.log('Cloud browser is now authenticated.');
  console.log(`Session ID: ${sessionId}`);

  if (contextId) {
    console.log(`Context ID: ${contextId}`);
    console.log('');
    console.log('To reuse this auth in future sessions:');
    console.log(`  node cookie-sync.mjs --context ${contextId}`);
    console.log('');
    console.log('Or create a session directly via API with this context:');
    console.log('  POST /v1/sessions { browserSettings: { context: { id: "' + contextId + '", persist: true } } }');
  } else {
    console.log('Session has keepAlive: true — it will stay open until explicitly closed.');
    console.log('Tip: use --persist to save auth across sessions.');
  }
}

main().catch(e => {
  console.error(`Error: ${e.message}`);
  process.exit(1);
});
