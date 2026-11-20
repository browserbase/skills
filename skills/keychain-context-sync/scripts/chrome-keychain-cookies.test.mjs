import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import { decryptChromeCookie, deriveChromeKey } from './chrome-keychain-cookies.mjs';

const IV = Buffer.alloc(16, 0x20);

function encryptFixture(value, host, schemaVersion, password) {
  const key = deriveChromeKey(password);
  const payload = schemaVersion >= 24
    ? Buffer.concat([crypto.createHash('sha256').update(host).digest(), Buffer.from(value)])
    : Buffer.from(value);
  const cipher = crypto.createCipheriv('aes-128-cbc', key, IV);
  return Buffer.concat([Buffer.from('v10'), cipher.update(payload), cipher.final()]);
}

test('decrypts legacy v10 cookie values', () => {
  const encrypted = encryptFixture('legacy-value', '.example.com', 23, 'fixture-password');
  const actual = decryptChromeCookie(
    encrypted,
    '.example.com',
    23,
    deriveChromeKey('fixture-password'),
  );
  assert.equal(actual, 'legacy-value');
});

test('verifies and strips the schema 24 host digest', () => {
  const encrypted = encryptFixture('bound-value', '.example.com', 24, 'fixture-password');
  const actual = decryptChromeCookie(
    encrypted,
    '.example.com',
    24,
    deriveChromeKey('fixture-password'),
  );
  assert.equal(actual, 'bound-value');
});

test('rejects a mismatched host digest', () => {
  const encrypted = encryptFixture('bound-value', '.example.com', 24, 'fixture-password');
  assert.throws(() => decryptChromeCookie(
    encrypted,
    '.different.example',
    24,
    deriveChromeKey('fixture-password'),
  ), /host digest mismatch/);
});
