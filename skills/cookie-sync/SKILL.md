---
name: cookie-sync
description: Sync cookies from local Chrome to a new Browserbase cloud session so it's authenticated as you. Use when the user wants to create an authenticated cloud browser, sync cookies, or log into Browserbase as themselves.
---

# Cookie Sync — Local Chrome → Browserbase

Exports cookies from your local Chrome and injects them into a Browserbase cloud session. After running, the cloud browser is logged into the same sites as your local Chrome.

Supports **domain filtering** (only sync cookies you need) and **persistent contexts** (reuse auth across sessions without re-syncing).

## Prerequisites

- Chrome (or Chromium, Brave, Edge) with remote debugging enabled
- If your browser build exposes `chrome://flags/#allow-remote-debugging`, enable it and restart the browser
- Otherwise, launch with `--remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug` and set `CDP_URL=ws://127.0.0.1:9222`
- At least one tab open in Chrome
- Node.js 22+
- Environment variables: `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID`

## Setup

Install dependencies before first use:

```bash
cd .claude/skills/cookie-sync && npm install
```

## Usage

### Basic — sync all cookies (ephemeral session)

```bash
node .claude/skills/cookie-sync/scripts/cookie-sync.mjs
```

### Filter by domain — only sync specific sites

```bash
node .claude/skills/cookie-sync/scripts/cookie-sync.mjs --domains google.com,github.com
```

Matches the domain and all subdomains (e.g. `google.com` matches `accounts.google.com`, `mail.google.com`, etc.)

### Persistent context — reuse auth across sessions

```bash
node .claude/skills/cookie-sync/scripts/cookie-sync.mjs --persist
```

This creates a Browserbase **Context** and sets `persist: true`. The context stores the browser state (cookies, localStorage, etc.) so future sessions start pre-authenticated — even from scheduled jobs with no local Chrome.

### Reuse an existing context

```bash
node .claude/skills/cookie-sync/scripts/cookie-sync.mjs --context ctx_abc123
```

Attaches to a previously created context and re-injects fresh cookies into it.

### Advanced stealth mode

```bash
node .claude/skills/cookie-sync/scripts/cookie-sync.mjs --stealth
```

Enables Browserbase's advanced stealth mode to reduce bot detection. Recommended for sites like Google that fingerprint browsers.

### Residential proxy with geolocation

```bash
node .claude/skills/cookie-sync/scripts/cookie-sync.mjs --proxy "San Francisco,CA,US"
```

Routes the cloud browser through a residential proxy in the specified location. Format: `"City,ST,Country"` (state is 2-letter code). Helps match your local IP's geolocation so auth cookies aren't rejected.

### Combine flags

```bash
node .claude/skills/cookie-sync/scripts/cookie-sync.mjs --persist --domains github.com,google.com --stealth --proxy "San Francisco,CA,US"
```

## Persistent Contexts for Scheduled Jobs

The `--persist` flag is designed for use with scheduled/recurring tasks (like Claude Code's `/schedule`). The workflow:

1. **Once (laptop open):** Run `cookie-sync --persist --domains github.com` → get a context ID
2. **Scheduled jobs:** Create sessions using that context ID — no local Chrome needed
   ```json
   POST /v1/sessions
   {
     "projectId": "...",
     "browserSettings": {
       "context": { "id": "ctx_abc123", "persist": true }
     }
   }
   ```
3. **Re-sync as needed:** When cookies expire, run cookie-sync again with `--context ctx_abc123` to refresh

## Navigating in the Cookie-Synced Session

**IMPORTANT:** After syncing, use this Node one-liner to navigate to a URL within the session. Do NOT use the `browse` CLI — it cannot reconnect to existing keepAlive sessions.

```bash
node -e "
const WS_URL = 'wss://connect.browserbase.com?apiKey=' + process.env.BROWSERBASE_API_KEY + '&sessionId=SESSION_ID';
const ws = new WebSocket(WS_URL);
let id = 0;
const send = (method, params = {}, sid) => {
  const msg = { id: ++id, method, params };
  if (sid) msg.sessionId = sid;
  ws.send(JSON.stringify(msg));
};
ws.onopen = () => send('Target.getTargets');
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id === 1) {
    const page = msg.result.targetInfos.find(t => t.type === 'page');
    send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
  }
  if (msg.id === 2) {
    send('Page.navigate', { url: 'TARGET_URL' }, msg.result.sessionId);
  }
  if (msg.id === 3) {
    console.log('Navigated to TARGET_URL');
    setTimeout(() => process.exit(0), 1000);
  }
};
"
```

Replace `SESSION_ID` with the session ID from cookie-sync output, and `TARGET_URL` with the destination URL.

## Troubleshooting

- **"No DevToolsActivePort found"** → Enable `chrome://flags/#allow-remote-debugging` if your browser build exposes it, or launch with `--remote-debugging-port=9222` and set `CDP_URL=ws://127.0.0.1:9222`
- **"No open page targets found"** → Open at least one tab in Chrome
- **"WebSocket error"** → Chrome may be hung; force quit and reopen it
- **Cookies expired in context** → Re-run cookie-sync with `--context <id>` to refresh
