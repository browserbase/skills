---
name: cookie-sync
description: Sync cookies from local Chrome to a Browserbase persistent context so the browse CLI can access authenticated sites. Use when the user wants to browse as themselves, sync cookies, or log into sites via Browserbase.
---

# Cookie Sync — Local Chrome → Browserbase Context

Exports cookies from your local Chrome and saves them into a Browserbase **persistent context**. After syncing, use the `browse` CLI to open authenticated sessions with that context.

Supports **domain filtering** (only sync cookies you need) and **context reuse** (refresh cookies without creating a new context).

## Prerequisites

- Chrome (or Chromium, Brave, Edge) with remote debugging enabled
- If your browser build exposes `chrome://flags/#allow-remote-debugging`, enable it and restart the browser
- Otherwise, launch with `--remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug` and set `CDP_URL=ws://127.0.0.1:9222`
- At least one tab open in Chrome
- Node.js 22+
- Environment variable: `BROWSERBASE_API_KEY`

## Setup

Install dependencies before first use:

```bash
cd .claude/skills/cookie-sync && npm install
```

## Usage

### Basic — sync all cookies

```bash
node .claude/skills/cookie-sync/scripts/cookie-sync.mjs
```

Creates a persistent context with all your Chrome cookies. Outputs a context ID.

### Filter by domain — only sync specific sites

```bash
node .claude/skills/cookie-sync/scripts/cookie-sync.mjs --domains google.com,github.com
```

Matches the domain and all subdomains (e.g. `google.com` matches `accounts.google.com`, `mail.google.com`, etc.)

### Refresh cookies in an existing context

```bash
node .claude/skills/cookie-sync/scripts/cookie-sync.mjs --context ctx_abc123
```

Re-injects fresh cookies into a previously created context. Use this when cookies have expired.

### Advanced stealth mode

```bash
node .claude/skills/cookie-sync/scripts/cookie-sync.mjs --stealth
```

Enables Browserbase's advanced stealth mode to reduce bot detection. Recommended for sites like Google that fingerprint browsers.

### Residential proxy with geolocation

```bash
node .claude/skills/cookie-sync/scripts/cookie-sync.mjs --proxy "San Francisco,CA,US"
```

Routes through a residential proxy in the specified location. Format: `"City,ST,Country"` (state is 2-letter code). Helps match your local IP's geolocation so auth cookies aren't rejected.

### Combine flags

```bash
node .claude/skills/cookie-sync/scripts/cookie-sync.mjs --domains github.com,google.com --stealth --proxy "San Francisco,CA,US"
```

## Browsing Authenticated Sites

After syncing, use the `browse` CLI with the context ID:

```bash
browse open https://mail.google.com --context-id <ctx-id> --persist
```

The `--persist` flag saves any new cookies or state changes back to the context, keeping the session fresh for next time.

**Full workflow example:**

```bash
# Step 1: Sync cookies for Twitter
node .claude/skills/cookie-sync/scripts/cookie-sync.mjs --domains x.com,twitter.com
# Output: Context ID: ctx_abc123

# Step 2: Browse authenticated Twitter
browse open https://x.com/messages --context-id ctx_abc123 --persist
browse snapshot
browse screenshot
browse stop
```

## Reusing Contexts for Scheduled Jobs

Contexts persist across sessions, making them ideal for scheduled/recurring tasks:

1. **Once (laptop open):** Run cookie-sync → get a context ID
2. **Scheduled jobs:** Use `browse open <url> --context-id <ctx-id> --persist` — no local Chrome needed
3. **Re-sync as needed:** When cookies expire, run cookie-sync again with `--context <ctx-id>` to refresh

## Troubleshooting

- **"No DevToolsActivePort found"** → Enable `chrome://flags/#allow-remote-debugging` if your browser build exposes it, or launch with `--remote-debugging-port=9222` and set `CDP_URL=ws://127.0.0.1:9222`
- **"No open page targets found"** → Open at least one tab in Chrome
- **"WebSocket error"** → Chrome may be hung; force quit and reopen it
- **Cookies expired in context** → Re-run cookie-sync with `--context <id>` to refresh
- **Auth rejected by site** → Try adding `--stealth` and/or `--proxy` with a location near you
