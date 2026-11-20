# Chrome cookie encryption on macOS

Chrome stores cookie metadata in the profile's SQLite `Cookies` database. Protected values use the operating-system crypt layer.

For the macOS `v10` format:

- request the Safe Storage password from macOS Keychain;
- derive a 16-byte key with PBKDF2-HMAC-SHA1, salt `saltysalt`, and 1003 iterations;
- strip the three-byte `v10` marker;
- decrypt with AES-128-CBC and an IV containing sixteen ASCII spaces;
- let the crypto library validate and remove PKCS#7 padding.

For cookie database schema version 24 and later, decrypted payloads begin with `SHA256(host_key)`. Verify and remove that 32-byte binding before treating the remainder as the cookie value. Reject mismatches.

Keychain service names vary by Chromium product. Google Chrome normally uses `Chrome Safe Storage`. Add browser-specific service/account mappings only after verifying the installed product.

This mechanism is macOS-specific. Windows App-Bound Encryption and Linux Secret Service/KWallet require separate adapters.

Never persist the Safe Storage password, derived key, or plaintext cookie export. Do not accept a user's macOS login password through CLI arguments or standard input.
