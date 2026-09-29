---
name: browserbase-context-to-chrome
description: Copy cookies and site storage from a Browserbase persistent context into a separate local Chrome profile for a person to use. Use when asked to move Browserbase login state to a human browser or reverse cookie-sync.
compatibility: "Requires Node.js 22+, local Google Chrome, and BROWSERBASE_API_KEY. Run `npm ci` in the skill directory before first use."
license: MIT
allowed-tools: Bash
---

# Browserbase context to Chrome

Use `scripts/context-to-chrome.mjs` to copy a Browserbase context into a dedicated local Chrome profile. The script starts a temporary Browserbase session, reads Playwright storage state, filters it to requested domains, and opens local Chrome with that state. It does not modify the normal Chrome profile.

## Before running

- Require a Browserbase context ID and the destination site URL. If either is missing, ask for it.
- Use `--domains` to name the site domains to transfer. Include login/SSO domains when needed. Use `--all` only when the user explicitly wants every cookie and every storage origin visible to Playwright in the restored session.
- Browserbase credentials come from `BROWSERBASE_API_KEY`; never print the key or the copied cookies. Do not save storage state to a JSON file.
- The destination profile is dedicated to this transfer. Reusing it replaces its stored cookies and site storage. Never point `--profile` at the user's normal Chrome data directory.

## Setup and run

From this skill directory, run `npm ci` once. Then:

```bash
node scripts/context-to-chrome.mjs \
  --context ctx_abc123 \
  --url https://app.example.com \
  --domains example.com,login.example.com \
  --profile /absolute/path/to/dedicated-profile
```

The profile path defaults to `.browserbase-chrome-profile` in the current directory. The script opens Chrome for the human and stays attached until Ctrl-C or the window closes. The profile persists and can later be opened with Chrome using `--user-data-dir=<profile>`.

The profile contains login credentials and should stay private. Session cookies may be discarded by local Chrome after the window closes.

For a noninteractive check, add `--headless`. This applies and saves state, navigates to the URL, then closes Chrome.

## Limits

Playwright storage state includes cookies, localStorage, and IndexedDB. The script opens the requested URL before capture so that origin's localStorage is available; storage for sites never opened in the restored session may be absent. It does not reproduce every Browserbase context feature, such as service workers, sessionStorage, browser preferences, or Browserbase's network identity. A site may still require login because of browser or IP checks. A Browserbase Live View is the simpler choice when the person only needs to interact with the cloud browser.
