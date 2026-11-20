# Browserbase Context upload

Create or update a Context to receive an ID, signed upload URL, RSA public key, cipher algorithm, and initialization-vector size.

Build a ZIP whose root is the Chromium user-data directory. Map the selected local profile to `Default/` so Browserbase launches it deterministically. Exclude:

- `Default/Cache`, code/GPU/shader caches, and related recreatable data;
- singleton locks, sockets, and `DevToolsActivePort`;
- `Sessions` and other tab-restore files;
- raw `Cookies` and `Login Data` databases.

Encrypt the ZIP as:

1. RSA-encrypted random 32-byte AES key;
2. random initialization vector;
3. AES-CBC-encrypted ZIP bytes.

PUT the result to the signed upload URL with `Content-Type: application/zip`.

Create a Browserbase session using `{ context: { id, persist: true } }`, import the cookies through the browser API, and close the session so Browserbase writes them using the destination runtime's encryption environment.

Do not run concurrent sessions against the same Context. Do not claim this disk-backed Context is a live process or VM snapshot.
