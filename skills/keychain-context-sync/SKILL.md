---
name: keychain-context-sync
description: Copy a macOS Chrome profile into a Browserbase Context without source CDP by decrypting cookies through user-approved Keychain access, uploading durable profile state, and importing cookies in memory. Use for offline or at-rest Chrome migration, Chrome Safe Storage consent flows, or full Browserbase Context creation from local history, bookmarks, site storage, service workers, preferences, extensions, and cookies.
license: MIT
allowed-tools: Bash
---

# Keychain Context Sync

Use the bundled workflow to migrate a macOS Chrome profile into a Browserbase Context without connecting to the local browser over CDP.

## Safety

- Explain that the profile and cookies contain sensitive browsing and authentication data.
- Ask before triggering the macOS Keychain dialog or uploading anything.
- Let macOS collect Keychain authorization; never request or log the login password.
- Ask the user to close Chrome for a consistent SQLite/LevelDB snapshot.
- Never print cookie values, names, domains, Safe Storage material, signed upload URLs, or decrypted JSON.
- Start with `--inspect-only`; run `--upload` only after the inspection reports zero decryption failures.
- Prefer a dedicated Chrome profile over a personal primary profile.

## Setup

```bash
cd .claude/skills/keychain-context-sync
npm install
export BROWSERBASE_API_KEY="..."
```

## Inspect without uploading

```bash
node scripts/keychain-context-sync.mjs \
  --profile-dir "$HOME/Library/Application Support/Google/Chrome/Default" \
  --inspect-only
```

macOS displays a consent dialog for `Chrome Safe Storage`. Choose **Allow**, not **Always Allow**, during initial testing. The command reports aggregate cookie and profile-state counts only.

## Create and upload a Context

After a clean inspection and explicit user approval:

```bash
node scripts/keychain-context-sync.mjs \
  --profile-dir "$HOME/Library/Application Support/Google/Chrome/Default" \
  --upload
```

The command:

1. archives durable profile state as Browserbase's `Default` profile;
2. excludes disposable caches, runtime locks, tab-restore files, raw cookie/login databases, and saved passwords;
3. decrypts cookies in memory using the user-approved Keychain item;
4. envelope-encrypts and uploads the profile ZIP to a new Browserbase Context;
5. opens a persistent Browserbase session and imports the cookies;
6. removes temporary archives and clears Keychain-derived buffers.

Use `--context <id>` to replace an existing Context only when custom Context updates are enabled. Use `--domains a.com,b.com` to limit cookies, and optionally `--verified` or `--proxy "City,ST,US"` for the import session.

`--allow-live-copy` permits a running Chrome profile but risks an inconsistent snapshot. Use it only with explicit acceptance.

## Persistence boundary

The archive includes localStorage, IndexedDB, Cache Storage, service workers, OPFS/File System, bookmarks, populated history, preferences, and extension state when present. It does not resume open tabs, back-forward stacks, live DOM/JavaScript state, active connections, saved passwords, passkeys, or reliable `sessionStorage`.

Read [references/chrome-crypto.md](references/chrome-crypto.md) before changing cryptography. Read [references/context-upload.md](references/context-upload.md) before changing archive, encryption, or upload behavior.

## Validate

```bash
node --test scripts/chrome-keychain-cookies.test.mjs
node --check scripts/chrome-keychain-cookies.mjs
node --check scripts/keychain-context-sync.mjs
```
