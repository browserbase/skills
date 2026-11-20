#!/usr/bin/env node

import crypto from 'node:crypto';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

import Browserbase from '@browserbasehq/sdk';
import { Stagehand } from '@browserbasehq/stagehand';
import AdmZip from 'adm-zip';

import { readCookiesFromKeychain } from './chrome-keychain-cookies.mjs';

const DEFAULT_PROFILE = resolve(
  process.env.HOME || '',
  'Library/Application Support/Google/Chrome/Default',
);

const CACHE_PREFIXES = [
  'Cache',
  'Code Cache',
  'GPUCache',
  'DawnGraphiteCache',
  'DawnWebGPUCache',
  'GrShaderCache',
  'GraphiteDawnCache',
  'ShaderCache',
];
const RUNTIME_NAMES = new Set([
  'DevToolsActivePort',
  'SingletonCookie',
  'SingletonLock',
  'SingletonSocket',
  'lockfile',
]);
const NON_PORTABLE_DATABASES = [
  'Cookies',
  'Network/Cookies',
  'Login Data',
  'Login Data For Account',
];
const SESSION_RESTORE_PREFIXES = [
  'Sessions',
  'Current Session',
  'Current Tabs',
  'Last Session',
  'Last Tabs',
];

function parseArgs(argv) {
  const options = {
    profileDir: DEFAULT_PROFILE,
    keychainService: 'Chrome Safe Storage',
    keychainAccount: null,
    contextId: null,
    domains: [],
    verified: false,
    proxy: null,
    allowLiveCopy: false,
    inspectOnly: false,
    upload: false,
  };
  const take = (flag, index) => {
    if (!argv[index + 1]) throw new Error(`${flag} requires a value`);
    return argv[index + 1];
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--profile-dir') {
      options.profileDir = resolve(take(arg, i));
      i += 1;
    } else if (arg === '--keychain-service') {
      options.keychainService = take(arg, i);
      i += 1;
    } else if (arg === '--keychain-account') {
      options.keychainAccount = take(arg, i);
      i += 1;
    } else if (arg === '--context') {
      options.contextId = take(arg, i);
      i += 1;
    } else if (arg === '--domains') {
      options.domains = take(arg, i).split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
      i += 1;
    } else if (arg === '--verified') {
      options.verified = true;
    } else if (arg === '--proxy') {
      const parts = take(arg, i).split(',').map((value) => value.trim());
      if (!parts[0] || !parts[1]) throw new Error('--proxy requires "City,State,Country"');
      options.proxy = { city: parts[0], state: parts[1], country: parts[2] || 'US' };
      i += 1;
    } else if (arg === '--allow-live-copy') {
      options.allowLiveCopy = true;
    } else if (arg === '--inspect-only') {
      options.inspectOnly = true;
    } else if (arg === '--upload') {
      options.upload = true;
    } else if (arg === '--help') {
      console.log(`Usage: node keychain-context-sync.mjs (--inspect-only | --upload) [options]\n\n` +
        `  --profile-dir <path>       Chrome profile directory\n` +
        `  --context <id>             Replace an existing Context\n` +
        `  --domains <a.com,b.com>    Limit imported cookies\n` +
        `  --keychain-service <name>  Keychain service\n` +
        `  --keychain-account <name>  Optional Keychain account\n` +
        `  --verified                 Use Browserbase Verified mode\n` +
        `  --proxy <City,ST,US>       Use a residential proxy\n` +
        `  --allow-live-copy          Accept inconsistent live-profile risk\n` +
        `  --inspect-only             Decrypt and inventory without upload\n` +
        `  --upload                   Create/upload and populate a Context\n`);
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (options.inspectOnly === options.upload) {
    throw new Error('Choose exactly one of --inspect-only or --upload');
  }
  return options;
}

function normalizePath(path) {
  return path.split(sep).join('/');
}

function isPathOrChild(path, prefix) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function shouldExclude(relativePath) {
  const rel = normalizePath(relativePath);
  const name = basename(rel);
  if (RUNTIME_NAMES.has(name)) return true;
  if (CACHE_PREFIXES.some((prefix) => isPathOrChild(rel, prefix))) return true;
  if (SESSION_RESTORE_PREFIXES.some((prefix) => isPathOrChild(rel, prefix))) return true;
  return NON_PORTABLE_DATABASES.some((prefix) => (
    rel === prefix || rel.startsWith(`${prefix}-`) || rel.startsWith(`${prefix}/`)
  ));
}

function collectProfileFiles(profileDir) {
  const files = [];
  let skipped = 0;
  function walk(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      const rel = relative(profileDir, path);
      if (shouldExclude(rel)) {
        skipped += 1;
        continue;
      }
      let stats;
      try {
        stats = lstatSync(path);
      } catch {
        skipped += 1;
        continue;
      }
      if (stats.isSymbolicLink()) {
        skipped += 1;
      } else if (stats.isDirectory()) {
        walk(path);
      } else if (stats.isFile()) {
        files.push({ path, rel, size: stats.size });
      }
    }
  }
  walk(profileDir);
  return { files, skipped };
}

function profileLooksLive(userDataDir) {
  return ['SingletonLock', 'SingletonSocket', 'SingletonCookie'].some((name) => {
    try {
      lstatSync(join(userDataDir, name));
      return true;
    } catch {
      return false;
    }
  });
}

function filterCookies(cookies, domains) {
  const now = Date.now() / 1000;
  return cookies.filter((cookie) => {
    if (cookie.expires > 0 && cookie.expires <= now) return false;
    if (domains.length === 0) return true;
    const cookieDomain = cookie.domain.replace(/^\./, '').toLowerCase();
    return domains.some((domain) => cookieDomain === domain || cookieDomain.endsWith(`.${domain}`));
  });
}

function toCookieParams(cookies) {
  return cookies.map((cookie) => {
    const result = {
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
    };
    if (cookie.expires > 0) result.expires = cookie.expires;
    if (cookie.sameSite === 'Strict' || cookie.sameSite === 'Lax') result.sameSite = cookie.sameSite;
    if (cookie.sameSite === 'None' && cookie.secure) result.sameSite = 'None';
    return result;
  });
}

async function makeArchive(files, outputPath) {
  const zip = new AdmZip();
  for (const file of files) {
    const archivePath = normalizePath(join('Default', file.rel));
    zip.addLocalFile(file.path, dirname(archivePath), basename(archivePath));
  }
  await zip.writeZipPromise(outputPath, { overwrite: true });
}

async function encryptArchive(inputPath, outputPath, materials) {
  const aesKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(materials.initializationVectorSize);
  const encryptedAesKey = crypto.publicEncrypt(materials.publicKey, aesKey);
  const cipher = crypto.createCipheriv(materials.cipherAlgorithm.toLowerCase(), aesKey, iv);
  const input = createReadStream(inputPath);
  const output = createWriteStream(outputPath);
  await new Promise((resolveEncryption, reject) => {
    input.on('error', reject);
    output.on('error', reject);
    output.on('finish', resolveEncryption);
    output.write(Buffer.concat([encryptedAesKey, iv]));
    input.pipe(cipher).pipe(output);
  });
}

async function getUploadMaterials(client, contextId) {
  if (!contextId) return client.contexts.create({});
  try {
    return await client.contexts.update(contextId);
  } catch (error) {
    throw new Error(`Could not update Context ${contextId}; omit --context to create a new one. ${error.message}`);
  }
}

async function uploadArchive(uploadUrl, encryptedPath) {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/zip' },
    body: readFileSync(encryptedPath),
  });
  if (!response.ok) throw new Error(`Context archive upload failed (${response.status} ${response.statusText})`);
}

async function injectCookies(contextId, cookies, apiKey, options) {
  if (cookies.length === 0) return null;
  const browserSettings = { context: { id: contextId, persist: true } };
  if (options.verified) browserSettings.verified = true;
  const cloud = new Stagehand({
    env: 'BROWSERBASE',
    apiKey,
    disableAPI: true,
    browserbaseSessionCreateParams: {
      browserSettings,
      ...(options.proxy ? { proxies: [{ type: 'browserbase', geolocation: options.proxy }] } : {}),
    },
    verbose: 0,
    disablePino: true,
  });
  await cloud.init();
  const sessionId = cloud.browserbaseSessionID;
  await cloud.context.addCookies(toCookieParams(cookies));
  await cloud.close();
  return sessionId;
}

function printProfileInventory(profileDir, files, skipped) {
  const total = files.reduce((sum, file) => sum + file.size, 0);
  const rels = files.map(({ rel }) => normalizePath(rel));
  const has = (prefix) => rels.some((rel) => isPathOrChild(rel, prefix));
  console.log(`Profile: ${profileDir}`);
  console.log(`Archive files: ${files.length} (${(total / 1024 / 1024).toFixed(1)} MiB before compression)`);
  console.log(`Excluded entries: ${skipped}`);
  console.log('Durable state detected:');
  for (const [name, present] of Object.entries({
    localStorage: has('Local Storage'),
    indexedDB: has('IndexedDB'),
    cacheStorage: has('Service Worker/CacheStorage'),
    serviceWorkers: has('Service Worker'),
    opfsOrFileSystem: has('File System'),
    bookmarks: has('Bookmarks'),
    history: has('History'),
    preferences: has('Preferences'),
    extensions: has('Extensions') || has('Local Extension Settings') || has('Extension State'),
  })) console.log(`  ${present ? 'yes' : 'no '}  ${name}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!existsSync(options.profileDir) || !statSync(options.profileDir).isDirectory()) {
    throw new Error(`Chrome profile not found: ${options.profileDir}`);
  }
  const userDataDir = dirname(options.profileDir);
  if (profileLooksLive(userDataDir) && !options.allowLiveCopy) {
    throw new Error('Chrome appears to be using this profile. Close Chrome first, or explicitly accept risk with --allow-live-copy.');
  }

  const { files, skipped } = collectProfileFiles(options.profileDir);
  printProfileInventory(options.profileDir, files, skipped);
  const keychainResult = readCookiesFromKeychain(options);
  if (keychainResult.summary.failed > 0) {
    throw new Error(`Cookie decryption failed for ${keychainResult.summary.failed} row(s); refusing to upload`);
  }
  const cookies = filterCookies(keychainResult.cookies, options.domains);
  console.log(`Cookies decrypted in memory: ${keychainResult.cookies.length}`);
  console.log(`Cookies eligible for import: ${cookies.length}`);
  console.log('No cookie values, names, domains, or Keychain secrets were logged or written.');
  if (options.inspectOnly) return;

  const apiKey = process.env.BROWSERBASE_API_KEY;
  if (!apiKey) throw new Error('BROWSERBASE_API_KEY is required for --upload');
  const workDir = join(tmpdir(), `keychain-context-sync-${crypto.randomUUID()}`);
  mkdirSync(workDir, { recursive: true });
  const zipPath = join(workDir, 'profile.zip');
  const encryptedPath = join(workDir, 'profile.encrypted.zip');
  let contextId = options.contextId;
  try {
    await makeArchive(files, zipPath);
    const client = new Browserbase({ apiKey });
    const materials = await getUploadMaterials(client, contextId);
    contextId = materials.id;
    console.log(`${options.contextId ? 'Updating' : 'Created'} Context: ${contextId}`);
    await encryptArchive(zipPath, encryptedPath, materials);
    await uploadArchive(materials.uploadUrl, encryptedPath);
    console.log('Encrypted durable-profile archive uploaded');
    const sessionId = await injectCookies(contextId, cookies, apiKey, options);
    if (sessionId) console.log(`Cookies imported through persistent session: ${sessionId}`);
    console.log(`Context sync complete: ${contextId}`);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
