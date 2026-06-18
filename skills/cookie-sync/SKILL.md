---
name: cookie-sync
description: Sync cookies from local Chrome to a Browserbase persistent context so the browse CLI can access authenticated sites. Use when the user wants to browse as themselves, sync cookies, or log into sites via Browserbase.
compatibility: "Requires Node.js 22+, a local Chromium-based browser (Chrome, Brave, Edge) with remote debugging enabled, and BROWSERBASE_API_KEY. Run `npm install` in the skill directory before first use."
license: MIT
allowed-tools: Bash
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

### Verified browser mode

```bash
node .claude/skills/cookie-sync/scripts/cookie-sync.mjs --verified
```

Enables Browserbase Identity with a Verified browser to improve access on protected sites. Recommended for sites like Google that fingerprint browsers.

### Residential proxy with geolocation

```bash
node .claude/skills/cookie-sync/scripts/cookie-sync.mjs --proxy "San Francisco,CA,US"
```

Routes through a residential proxy in the specified location. Format: `"City,ST,Country"` (state is 2-letter code). Helps match your local IP's geolocation so auth cookies aren't rejected.

### Combine flags

```bash
node .claude/skills/cookie-sync/scripts/cookie-sync.mjs --domains github.com,google.com --verified --proxy "San Francisco,CA,US"
```

## Browsing Authenticated Sites

After syncing, use the `browse` CLI with the context ID:

```bash
SESSION_JSON="$(browse cloud sessions create --context-id <ctx-id> --persist --keep-alive)"
SESSION_ID="$(echo "$SESSION_JSON" | jq -r .id)"
CONNECT_URL="$(echo "$SESSION_JSON" | jq -r .connectUrl)"

browse open https://mail.google.com --cdp "$CONNECT_URL"
```

The `--persist` flag on `browse cloud sessions create` saves any new cookies or state changes back to the context when the cloud session is released, keeping the session fresh for next time.

**Full workflow example:**

```bash
# Step 1: Sync cookies for Twitter
node .claude/skills/cookie-sync/scripts/cookie-sync.mjs --domains x.com,twitter.com
# Output: Context ID: ctx_abc123

# Step 2: Browse authenticated Twitter
SESSION_JSON="$(browse cloud sessions create --context-id ctx_abc123 --persist --keep-alive)"
SESSION_ID="$(echo "$SESSION_JSON" | jq -r .id)"
CONNECT_URL="$(echo "$SESSION_JSON" | jq -r .connectUrl)"

browse open https://x.com/messages --cdp "$CONNECT_URL"
browse snapshot
browse screenshot
browse stop
browse cloud sessions update "$SESSION_ID" --status REQUEST_RELEASE
```

## Reusing Contexts for Scheduled Jobs

Contexts persist across sessions, making them ideal for scheduled/recurring tasks:

1. **Once (laptop open):** Run cookie-sync → get a context ID
2. **Scheduled jobs:** Create a Browserbase session with `browse cloud sessions create --context-id <ctx-id> --persist --keep-alive`, then attach with `browse open <url> --cdp <connectUrl>` — no local Chrome needed
3. **Re-sync as needed:** When cookies expire, run cookie-sync again with `--context <ctx-id>` to refresh

## Troubleshooting

- **"No DevToolsActivePort found"** → Enable `chrome://flags/#allow-remote-debugging` if your browser build exposes it, or launch with `--remote-debugging-port=9222` and set `CDP_URL=ws://127.0.0.1:9222`
- **"No open page targets found"** → Open at least one tab in Chrome
- **"WebSocket error"** → Chrome may be hung; force quit and reopen it
- **Cookies expired in context** → Re-run cookie-sync with `--context <id>` to refresh
- **Auth rejected by site** → Try adding `--verified` and/or `--proxy` with a location near you
