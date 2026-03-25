#!/usr/bin/env node
// cookie-sync — Export cookies from local Chrome into a Browserbase persistent context.
// Uses Stagehand for browser connections and @browserbasehq/sdk for API calls.
//
// Setup:
//   cd skills/cookie-sync && npm install
//
// Usage:
//   node scripts/cookie-sync.mjs                                        # sync all cookies into a new context
//   node scripts/cookie-sync.mjs --domains google.com,github.com        # only sync cookies for these domains
//   node scripts/cookie-sync.mjs --context ctx_abc123                   # refresh cookies in an existing context
//   node scripts/cookie-sync.mjs --stealth                              # enable advanced stealth mode
//   node scripts/cookie-sync.mjs --proxy "San Francisco,CA,US"          # use residential proxy with geolocation
//
// After syncing, use the browse CLI to open an authenticated session:
//   browse open https://example.com --context-id <ctx-id> --persist
//
// Env vars:
//   BROWSERBASE_API_KEY    — required
//   BROWSERBASE_CONTEXT_ID — optional, reuse an existing context
//   CDP_URL                — optional, Chrome debugging endpoint or browser WS URL
//   CDP_PORT_FILE          — optional, path to DevToolsActivePort if non-standard
//   CDP_HOST               — optional, host for DevToolsActivePort-based connections

import { Stagehand } from '@browserbasehq/stagehand';
import Browserbase from '@browserbasehq/sdk';
import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { homedir } from 'os';
import { resolve } from 'path';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { domains: [], contextId: null, stealth: false, proxy: null };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--domains' && args[i + 1]) {
      result.domains = args[++i].split(',').map(d => d.trim().toLowerCase()).filter(Boolean);
    } else if (args[i] === '--context' && args[i + 1]) {
      result.contextId = args[++i];
    } else if (args[i] === '--stealth') {
      result.stealth = true;
    } else if (args[i] === '--proxy' && args[i + 1]) {
      const parts = args[++i].split(',').map(s => s.trim());
      if (!parts[0] || !parts[1]) {
        console.error('Error: --proxy requires "City,State,Country" (e.g. "San Francisco,CA,US")');
        process.exit(1);
      }
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

if (!API_KEY) {
  console.error('Error: BROWSERBASE_API_KEY is required');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Find local Chrome DevTools WebSocket URL
// ---------------------------------------------------------------------------

async function resolveCdpUrl(cdpUrl) {
  if (/^wss?:\/\/.+\/devtools\/browser\//.test(cdpUrl)) {
    return cdpUrl;
  }

  const base = cdpUrl.replace(/^wss?/i, m => m.length === 3 ? 'https' : 'http').replace(/\/+$/, '');
  const versionUrl = base.endsWith('/json/version') ? base : `${base}/json/version`;
  const res = await fetch(versionUrl);

  if (!res.ok) {
    throw new Error(`Could not resolve CDP_URL via ${versionUrl} (${res.status})`);
  }

  const info = await res.json();
  if (!info.webSocketDebuggerUrl) {
    throw new Error(`CDP_URL did not expose webSocketDebuggerUrl at ${versionUrl}`);
  }

  return info.webSocketDebuggerUrl;
}

async function getLocalCdpUrl() {
  if (process.env.CDP_URL) {
    return resolveCdpUrl(process.env.CDP_URL);
  }

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
      'Or launch Chrome with --remote-debugging-port=9222 and set CDP_URL=ws://127.0.0.1:9222'
    );
  }

  const lines = readFileSync(portFile, 'utf8').trim().split(/\r?\n/);
  if (lines.length < 2 || !lines[0] || !lines[1]) {
    throw new Error(`Invalid DevToolsActivePort file: ${portFile}`);
  }

  const host = process.env.CDP_HOST || '127.0.0.1';
  return `ws://${host}:${lines[0]}${lines[1]}`;
}

// ---------------------------------------------------------------------------
// Chrome version check
// ---------------------------------------------------------------------------

function checkChromeVersion() {
  if (process.env.CDP_URL || process.env.CDP_PORT_FILE) return;

  const chromePaths = [
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    // Linux (resolved via PATH)
    'google-chrome',
    'google-chrome-stable',
    'chromium-browser',
    'chromium',
  ];
  for (const p of chromePaths) {
    try {
      const out = execSync(`"${p}" --version`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      const match = out.match(/(\d+)\./);
      if (match) {
        const major = parseInt(match[1], 10);
        if (major < 146) {
          console.warn(`Chrome ${major} detected. Chrome 146+ supports the allow-remote-debugging flag.`);
          console.warn('For older Chrome, launch with --remote-debugging-port=9222 and set CDP_URL=ws://127.0.0.1:9222.');
          return;
        }
        console.log(`Chrome ${major} detected`);
        return;
      }
    } catch { /* try next */ }
  }
}

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

function filterCookies(cookies, domains) {
  if (domains.length === 0) return cookies;
  return cookies.filter(cookie => {
    const cookieDomain = cookie.domain.replace(/^\./, '').toLowerCase();
    return domains.some(d => cookieDomain === d || cookieDomain.endsWith('.' + d));
  });
}

function toCookieParams(cookies) {
  return cookies.map(c => {
    const param = {
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      httpOnly: c.httpOnly,
      secure: c.secure,
    };
    if (c.expires > 0) param.expires = c.expires;
    if (c.sameSite === 'Strict' || c.sameSite === 'Lax') {
      param.sameSite = c.sameSite;
    } else if (c.sameSite === 'None' && c.secure) {
      param.sameSite = 'None';
    }
    return param;
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  checkChromeVersion();

  // Step 1: Connect to local Chrome via Stagehand and export cookies
  const cdpUrl = await getLocalCdpUrl();
  const local = new Stagehand({
    env: 'LOCAL',
    localBrowserLaunchOptions: { cdpUrl },
    verbose: 0,
    disablePino: true,
  });
  await local.init();
  console.log('Connected to local Chrome');

  const allCookies = await local.context.cookies();
  console.log(`Exported ${allCookies.length} cookies from local Chrome`);
  await local.close();

  // Step 2: Filter cookies by domain if requested
  const cookies = filterCookies(allCookies, CLI.domains);
  if (CLI.domains.length > 0) {
    console.log(`Filtered to ${cookies.length} cookies matching: ${CLI.domains.join(', ')}`);
  }
  if (cookies.length === 0) {
    console.warn('Warning: No cookies to sync. Check your domain filters or Chrome login state.');
    process.exit(0);
  }

  // Step 3: Set up context (create new or reuse existing)
  const bb = new Browserbase({ apiKey: API_KEY });
  let contextId = CLI.contextId || process.env.BROWSERBASE_CONTEXT_ID;

  if (!contextId) {
    const ctx = await bb.contexts.create({});
    contextId = ctx.id;
    console.log(`Created context: ${contextId}`);
  } else {
    console.log(`Using existing context: ${contextId}`);
  }

  // Step 4: Create a temporary Browserbase session to inject cookies
  const browserSettings = { context: { id: contextId, persist: true } };
  if (CLI.stealth) browserSettings.advancedStealth = true;

  const cloud = new Stagehand({
    env: 'BROWSERBASE',
    apiKey: API_KEY,
    disableAPI: true,
    browserbaseSessionCreateParams: {
      browserSettings,
      ...(CLI.proxy && {
        proxies: [{ type: 'browserbase', geolocation: CLI.proxy }],
      }),
    },
    verbose: 0,
    disablePino: true,
  });
  await cloud.init();
  console.log(`Injecting cookies via session: ${cloud.browserbaseSessionID}`);

  // Step 5: Inject cookies and close the session (context persists independently)
  const cookieParams = toCookieParams(cookies);
  await cloud.context.addCookies(cookieParams);
  console.log(`Injected ${cookies.length} cookies into context`);
  await cloud.close();

  // Step 6: Summary
  console.log('');
  console.log('Cookies synced to context.');
  console.log(`Context ID: ${contextId}`);
  console.log('');
  console.log('Browse authenticated sites with:');
  console.log(`  browse open <url> --context-id ${contextId} --persist`);
  console.log('');
  console.log('To refresh cookies later:');
  console.log(`  node cookie-sync.mjs --context ${contextId}`);

  process.exit(0);
}

main().catch(e => {
  console.error(`Error: ${e.message}`);
  process.exit(1);
});
