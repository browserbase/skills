---
name: cookie-sync
description: "[Experimental] Sync cookies from local Chrome to a Browserbase cloud session so it's authenticated as you. Use when the user wants to browse as themselves in the cloud, sync cookies, create an authenticated Browserbase session, or log into sites without manual credentials. Requires Chrome 146+ with remote debugging enabled, or any Chrome launched with --remote-debugging-port=9222."
license: MIT
allowed-tools: Bash
---

# Cookie Sync — Local Chrome → Browserbase

Exports all cookies from your local Chrome browser and injects them into a new Browserbase cloud session. After syncing, the cloud browser is logged into all the same sites as your local Chrome — with full session replay and observability.

> **Experimental**: This skill requires Chrome 146+ or a Chrome instance launched with remote debugging. Cookie lifetime depends on the target site's session policies.

## Prerequisites

1. **Chrome with remote debugging enabled** (one of):
   - Chrome 146+: enable `chrome://flags/#allow-remote-debugging`, then restart Chrome
   - Any Chrome: quit Chrome, then relaunch with `google-chrome --remote-debugging-port=9222` (or `/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222` on macOS)
   - Also works with Chromium, Brave, and Edge

2. **At least one non-chrome:// tab open** in the browser

3. **Node.js 22+** (uses built-in WebSocket and fetch)

4. **Environment variables**:
   ```bash
   export BROWSERBASE_API_KEY="your_api_key"
   export BROWSERBASE_PROJECT_ID="your_project_id"
   ```

## Usage

Run the sync script:

```bash
node .claude/skills/cookie-sync/scripts/cookie-sync.mjs
```

Output:

```
Connected to local Chrome
Exported 296 cookies
Created context: ctx_abc123
Created Browserbase session: sess_xyz789
Live view: https://www.browserbase.com/sessions/sess_xyz789
Session is running
Injected 296 cookies into cloud browser

Cookie sync complete.
  Session ID: sess_xyz789
  Context ID: ctx_abc123
  Live view:  https://www.browserbase.com/sessions/sess_xyz789
```

## Reusing Cookies Across Sessions (Contexts)

Cookie sync creates a Browserbase **Context** that persists browser state. To reuse cookies without re-syncing:

```bash
export BROWSERBASE_CONTEXT_ID=ctx_abc123
node .claude/skills/cookie-sync/scripts/cookie-sync.mjs
```

When `BROWSERBASE_CONTEXT_ID` is set, the script skips context creation and attaches the session to the existing context. Because sessions are created with `persist: true`, any new cookies or state changes are saved back to the context when the session ends.

**When to re-sync**: Website sessions expire based on the site's cookie policies (hours to weeks). If you get logged out, just run cookie-sync again without `BROWSERBASE_CONTEXT_ID` to create a fresh context.

## Navigating in the Synced Session

After syncing, use this Node one-liner to navigate within the session. Replace `SESSION_ID` and `TARGET_URL`:

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
    console.log('Navigated');
    setTimeout(() => process.exit(0), 1000);
  }
};
"
```

Do NOT use the `browse` CLI to navigate — it cannot reconnect to existing keepAlive sessions. Use the CDP one-liner above or connect via Playwright/Stagehand with the session ID.

## Troubleshooting

| Error | Fix |
|-------|-----|
| "No DevToolsActivePort found" | Enable remote debugging in `chrome://flags/#allow-remote-debugging` (Chrome 146+) and restart Chrome, or relaunch with `--remote-debugging-port=9222` and set `CDP_URL=ws://127.0.0.1:9222` |
| "No open page targets found" | Open at least one non-chrome:// tab in Chrome |
| "WebSocket error" | Chrome may be hung — force quit and reopen |
| "Timed out waiting for session" | Check your API key and project ID, and that you have available session capacity |
| Logged out after syncing | Cookies expired — run cookie-sync again to re-sync |

For detailed examples, see [EXAMPLES.md](EXAMPLES.md).
For technical reference, see [REFERENCE.md](REFERENCE.md).
