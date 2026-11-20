#!/usr/bin/env node

import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_PROFILE = resolve(
  process.env.HOME || '',
  'Library/Application Support/Google/Chrome/Default',
);
const DEFAULT_SERVICE = 'Chrome Safe Storage';
const SALT = Buffer.from('saltysalt', 'ascii');
const IV = Buffer.alloc(16, 0x20);
const MAX_SQLITE_OUTPUT = 256 * 1024 * 1024;

function parseArgs(argv) {
  const options = {
    profileDir: DEFAULT_PROFILE,
    keychainService: DEFAULT_SERVICE,
    keychainAccount: null,
    inspectOnly: false,
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
    } else if (arg === '--inspect-only') {
      options.inspectOnly = true;
    } else if (arg === '--help') {
      console.log(`Usage: node chrome-keychain-cookies.mjs --inspect-only [options]\n\n` +
        `  --profile-dir <path>       Chrome profile directory\n` +
        `  --keychain-service <name>  Keychain service (default: Chrome Safe Storage)\n` +
        `  --keychain-account <name>  Optional Keychain account selector\n` +
        `  --inspect-only             Decrypt in memory and print counts only\n`);
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (!options.inspectOnly) {
    throw new Error('Only --inspect-only is enabled during interactive testing; upload is disabled');
  }
  return options;
}

export function deriveChromeKey(safeStoragePassword) {
  const password = Buffer.isBuffer(safeStoragePassword)
    ? safeStoragePassword
    : Buffer.from(safeStoragePassword, 'utf8');
  return crypto.pbkdf2Sync(password, SALT, 1003, 16, 'sha1');
}

export function decryptChromeCookie(encryptedValue, hostKey, schemaVersion, key) {
  if (!Buffer.isBuffer(encryptedValue)) throw new Error('encrypted value must be a Buffer');
  if (encryptedValue.length < 4 || encryptedValue.subarray(0, 3).toString('ascii') !== 'v10') {
    throw new Error('unsupported Chrome cookie encryption version');
  }
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, IV);
  let plaintext = Buffer.concat([
    decipher.update(encryptedValue.subarray(3)),
    decipher.final(),
  ]);

  if (schemaVersion >= 24) {
    if (plaintext.length < 32) throw new Error('missing cookie host digest');
    const expected = crypto.createHash('sha256').update(hostKey, 'utf8').digest();
    const actual = plaintext.subarray(0, 32);
    if (!crypto.timingSafeEqual(actual, expected)) throw new Error('cookie host digest mismatch');
    plaintext = plaintext.subarray(32);
  }
  return plaintext.toString('utf8');
}

function trimTrailingNewline(buffer) {
  let end = buffer.length;
  while (end > 0 && (buffer[end - 1] === 0x0a || buffer[end - 1] === 0x0d)) end -= 1;
  return buffer.subarray(0, end);
}

function requestSafeStoragePassword(service, account) {
  const args = ['find-generic-password', '-w', '-s', service];
  if (account) args.push('-a', account);
  const output = execFileSync('/usr/bin/security', args, {
    encoding: 'buffer',
    stdio: ['ignore', 'pipe', 'inherit'],
    maxBuffer: 1024 * 1024,
  });
  const password = trimTrailingNewline(output);
  if (password.length === 0) throw new Error('Keychain returned an empty Safe Storage password');
  return password;
}

function sqlite(database, sql) {
  return execFileSync('/usr/bin/sqlite3', ['-readonly', '-json', database, sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: MAX_SQLITE_OUTPUT,
  });
}

function snapshotCookieDatabase(source, destination) {
  const escaped = destination.replaceAll("'", "''");
  execFileSync('/usr/bin/sqlite3', ['-readonly', source, `.backup '${escaped}'`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 1024 * 1024,
  });
}

function readRows(database) {
  const versionRows = JSON.parse(sqlite(database, "SELECT value FROM meta WHERE key = 'version'"));
  const schemaVersion = Number(versionRows[0]?.value || 0);
  const rows = JSON.parse(sqlite(database, `
    SELECT
      host_key,
      name,
      path,
      value,
      hex(encrypted_value) AS encrypted_hex,
      expires_utc,
      is_secure,
      is_httponly,
      samesite
    FROM cookies
  `));
  return { schemaVersion, rows };
}

export function decryptCookieRows(rows, schemaVersion, key) {
  const cookies = [];
  let encrypted = 0;
  let plaintext = 0;
  let failed = 0;

  for (const row of rows) {
    let value = row.value || '';
    if (row.encrypted_hex) {
      encrypted += 1;
      try {
        value = decryptChromeCookie(Buffer.from(row.encrypted_hex, 'hex'), row.host_key, schemaVersion, key);
      } catch {
        failed += 1;
        continue;
      }
    } else {
      plaintext += 1;
    }
    cookies.push({
      name: row.name,
      value,
      domain: row.host_key,
      path: row.path || '/',
      expires: chromeTimeToUnixSeconds(row.expires_utc),
      httpOnly: Boolean(row.is_httponly),
      secure: Boolean(row.is_secure),
      sameSite: chromeSameSite(row.samesite),
    });
  }
  return { cookies, encrypted, plaintext, failed };
}

function chromeTimeToUnixSeconds(value) {
  const micros = Number(value || 0);
  if (!Number.isFinite(micros) || micros <= 0) return -1;
  return Math.floor(micros / 1_000_000 - 11_644_473_600);
}

function chromeSameSite(value) {
  if (value === 0) return 'None';
  if (value === 1) return 'Lax';
  if (value === 2) return 'Strict';
  return undefined;
}

export function readCookiesFromKeychain(options) {
  if (process.platform !== 'darwin') throw new Error('Keychain inspection is supported only on macOS');
  const source = join(options.profileDir, 'Cookies');
  if (!existsSync(source)) throw new Error(`Chrome cookie database not found: ${source}`);

  const workDir = mkdtempSync(join(tmpdir(), 'keychain-context-sync-'));
  const snapshot = join(workDir, 'Cookies.snapshot');
  let safeStoragePassword;
  let key;
  try {
    snapshotCookieDatabase(source, snapshot);
    const { schemaVersion, rows } = readRows(snapshot);
    safeStoragePassword = requestSafeStoragePassword(options.keychainService, options.keychainAccount);
    key = deriveChromeKey(safeStoragePassword);
    const result = decryptCookieRows(rows, schemaVersion, key);
    return {
      cookies: result.cookies,
      summary: {
        schemaVersion,
        rows: rows.length,
        decrypted: result.encrypted - result.failed,
        plaintext: result.plaintext,
        failed: result.failed,
      },
    };
  } finally {
    safeStoragePassword?.fill(0);
    key?.fill(0);
    rmSync(workDir, { recursive: true, force: true });
  }
}

async function inspect(options) {
  const { summary } = readCookiesFromKeychain(options);
  console.log('Chrome cookie database inspected without CDP.');
  console.log(`Schema version: ${summary.schemaVersion}`);
  console.log(`Rows: ${summary.rows}`);
  console.log(`Decrypted encrypted rows: ${summary.decrypted}`);
  console.log(`Plaintext rows: ${summary.plaintext}`);
  console.log(`Failures: ${summary.failed}`);
  console.log('No cookie values, names, domains, or secrets were printed or written.');
  if (summary.failed > 0) process.exitCode = 2;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    await inspect(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}
