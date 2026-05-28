---
name: browser-tunnel
description: Open a Browserbase cloud browser that can reach the user's localhost via an auth-gated cloudflared tunnel. Use when the user wants to run a cloud browser against a local dev server (e.g. localhost:3000), test a local app on a remote browser, or get a shareable Browserbase session link for a local-only URL. Solves the "BB sessions can't see my localhost" gap without exposing the dev server to the public internet via ngrok.
---

# Browser Tunnel — cloud browser → localhost

Run a **Browserbase cloud session** that can hit a `localhost` URL on this machine. The cloud browser sees a public `*.trycloudflare.com` URL that is gated by a random per-session secret, so only this BB session can use the tunnel. Random scrapers get `401 Unauthorized`.

**Use when the user says things like:**
- "test my localhost:3000 app on a cloud browser"
- "I want a Browserbase session that can hit my dev server"
- "give me a shareable BB replay of my local app"
- "test this on BB but the URL is localhost"

**Don't use when:**
- The target URL is already public — use the `browser` skill directly
- The user wants to use their local Chrome — use `cookie-sync` + local mode

## How It Works

```
BB cloud browser ──HTTPS──► xyz.trycloudflare.com ──HTTP──► local auth proxy (127.0.0.1:auto)
                                                                    │
                                                                    │ check: X-Tunnel-Auth header
                                                                    ▼
                                                            user's localhost:<port>
```

1. `cloudflared` exposes an ephemeral `*.trycloudflare.com` URL pointed at a local auth proxy
2. The auth proxy gates every request on `X-Tunnel-Auth: <random UUID>`
3. The launcher creates a Browserbase session and prints the tunnel URL + secret
4. You drive the BB session via Playwright/Stagehand, injecting the header via CDP
5. On exit, the launcher releases the BB session, kills cloudflared, closes the proxy

## Prerequisites

```bash
# One-time install of cloudflared
brew install cloudflared          # macOS
# or: see https://github.com/cloudflare/cloudflared/releases

# Env var
export BROWSERBASE_API_KEY="..."       # from browserbase.com/settings
```

The launcher uses your first Browserbase project automatically. Set `BROWSERBASE_PROJECT_ID` only if you want to pin a specific project.

Node.js 18+ required (uses built-in `fetch`).

## Step 1 — Launch the tunnel + session

Run the launcher in the **background**. It prints a single-line JSON config to stdout, then `---READY---`, then stays alive until killed.

```bash
nohup node .claude/skills/browser-tunnel/scripts/launch.mjs --port 3000 \
  > /tmp/bb-localhost.log 2>&1 &
echo $! > /tmp/bb-localhost.pid

# Wait until the sentinel appears (usually 3-6s)
until grep -q "^---READY---$" /tmp/bb-localhost.log 2>/dev/null; do sleep 0.5; done

# Read the JSON config (the line starting with `{`)
CONFIG_JSON=$(grep -m1 '^{' /tmp/bb-localhost.log)
echo "$CONFIG_JSON" | jq .
```

The JSON has these fields:

| Field | What it is |
|---|---|
| `tunnelUrl` | The `https://*.trycloudflare.com` URL the BB browser should hit |
| `secret` | UUID — must be sent as `X-Tunnel-Auth` on every request |
| `headerName` | `X-Tunnel-Auth` (the header name to use) |
| `sessionId` | Browserbase session ID |
| `connectUrl` | `wss://...` — for `chromium.connectOverCDP()` |
| `dashboardUrl` | `https://www.browserbase.com/sessions/<id>` — share with the user |

Always show the user the `dashboardUrl` so they can watch live.

### Launcher options

```
--port <n>          (required) local port to expose
--host <h>          (default: 127.0.0.1) local host
--env prod|dev      (default: prod) which BB environment
```

## Step 2 — Drive the BB session

The crucial bit: you must inject `X-Tunnel-Auth: <secret>` via CDP's `Network.setExtraHTTPHeaders`. A framework-level helper like Playwright's `page.setExtraHTTPHeaders()` only covers top-level navigations, so subresources (JS/CSS/API calls) will 401. Any CDP-capable driver works — Playwright and Stagehand below are equivalent, so use whichever your project already has. They inject the header the same way.

### Option A — Playwright

```javascript
import { chromium } from "playwright-core";

const { connectUrl, tunnelUrl, secret } = JSON.parse(configJson);

const browser = await chromium.connectOverCDP(connectUrl);
const context = browser.contexts()[0];
const page = context.pages()[0] || (await context.newPage());

// Inject auth header on every request via CDP
const client = await context.newCDPSession(page);
await client.send("Network.enable");
await client.send("Network.setExtraHTTPHeaders", {
  headers: { "X-Tunnel-Auth": secret },
});

await page.goto(tunnelUrl + "/login", { waitUntil: "domcontentloaded" });
console.log("Title:", await page.title());
await page.screenshot({ path: "/tmp/login.png", fullPage: true });

await browser.close();
```

### Option B — Stagehand

Same idea — inject headers via CDP before any `page.goto()` calls, then navigate to `tunnelUrl` instead of `localhost:<port>`.

```javascript
const stagehand = new Stagehand({
  env: "BROWSERBASE",
  browserbaseSessionID: sessionId,   // reuse the session created by the launcher
});
await stagehand.init();
const page = stagehand.page;

const client = await page.context().newCDPSession(page);
await client.send("Network.setExtraHTTPHeaders", {
  headers: { "X-Tunnel-Auth": secret },
});

await page.goto(tunnelUrl);
await stagehand.act({ action: "click the login button" });
```

### Option C — `browse` CLI (not yet supported)

The `browse` CLI would be the simplest path, but it can't inject `X-Tunnel-Auth` on every request today — so subresources (JS/CSS/API calls) through the tunnel will 401. Until the CLI supports per-request header injection, use Playwright or Stagehand (above) for any tunnel flow.

> **Known gap / feature request:** add per-request extra-header support to the `browse` CLI (e.g. `--header "X-Tunnel-Auth: <secret>"` wired to CDP `Network.setExtraHTTPHeaders`). That would make the CLI the primary, one-command path for this skill.

A single bare navigation can still be done, but it will only load the root document:

```bash
SESSION_ID=$(echo "$CONFIG_JSON" | jq -r .sessionId)
TUNNEL_URL=$(echo "$CONFIG_JSON" | jq -r .tunnelUrl)
browse --connect "$SESSION_ID" open "$TUNNEL_URL"
```

## Step 3 — Clean up

```bash
# SIGINT the launcher — it ends the BB session, kills cloudflared, closes the proxy
kill -SIGINT $(cat /tmp/bb-localhost.pid)
rm -f /tmp/bb-localhost.pid /tmp/bb-localhost.log
```

Verify the BB session is released:

```bash
curl -s "https://api.browserbase.com/v1/sessions/$SESSION_ID" \
  -H "x-bb-api-key: $BROWSERBASE_API_KEY" | jq '.status'   # → "COMPLETED"
```

## Security Model

What you can tell a security-minded user:

- The `*.trycloudflare.com` URL exists during the session, **but** every request requires `X-Tunnel-Auth: <random UUID>` — anyone without the secret gets 401
- The secret lives in exactly two places: the launcher process on the user's machine, and the headers injected into the BB session via CDP. It is never logged, never sent over the public URL, and never persisted
- The local proxy strips the auth header before forwarding upstream, so the dev server never sees `X-Tunnel-Auth`
- The proxy listens only on `127.0.0.1`, never on a public interface
- Tunnel dies when the launcher exits or the BB session ends
- Cloudflare-the-company terminates TLS at their edge, so trust includes them. For stricter guarantees (no public URL existing at all), the long-term answer is a native `bb tunnel` with a VPC-internal relay. This skill is the v0.

## End-to-End Example

A complete "test my localhost on a cloud browser, screenshot, share the replay" flow:

```bash
# 1. Launch
nohup node .claude/skills/browser-tunnel/scripts/launch.mjs --port 3000 \
  > /tmp/bb-localhost.log 2>&1 &
echo $! > /tmp/bb-localhost.pid
until grep -q "^---READY---$" /tmp/bb-localhost.log 2>/dev/null; do sleep 0.5; done

CONFIG_JSON=$(grep -m1 '^{' /tmp/bb-localhost.log)
TUNNEL_URL=$(echo "$CONFIG_JSON" | jq -r .tunnelUrl)
SECRET=$(echo "$CONFIG_JSON" | jq -r .secret)
SESSION_ID=$(echo "$CONFIG_JSON" | jq -r .sessionId)
DASHBOARD_URL=$(echo "$CONFIG_JSON" | jq -r .dashboardUrl)

echo "Watch live: $DASHBOARD_URL"

# 2. Drive (your script of choice — Playwright/Stagehand here)
node -e "
import('playwright-core').then(async ({ chromium }) => {
  const browser = await chromium.connectOverCDP('$(echo "$CONFIG_JSON" | jq -r .connectUrl)');
  const context = browser.contexts()[0];
  const page = context.pages()[0] || await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Network.setExtraHTTPHeaders', { headers: { 'X-Tunnel-Auth': '$SECRET' } });
  await page.goto('$TUNNEL_URL', { waitUntil: 'domcontentloaded' });
  console.log('Title:', await page.title());
  await page.screenshot({ path: '/tmp/local-on-bb.png', fullPage: true });
  await browser.close();
});
"

# 3. Clean up
kill -SIGINT $(cat /tmp/bb-localhost.pid)
rm -f /tmp/bb-localhost.pid /tmp/bb-localhost.log

echo "Replay: $DASHBOARD_URL"
```

## Common Pitfalls

| Symptom | Fix |
|---|---|
| `cloudflared not found` | `brew install cloudflared` |
| 401 on every request from BB | You forgot to inject `X-Tunnel-Auth` via CDP. Use `Network.setExtraHTTPHeaders`, **not** `page.setExtraHTTPHeaders` |
| Root HTML loads but JS/CSS 401 | Same root cause — Playwright's helper only applies to top-level navs. Switch to CDP |
| Tunnel URL takes 5-10s to be reachable from BB | Normal — cloudflared edge needs to register. Retry once on 502 |
| Local dev server isn't reached | `curl http://localhost:<port>` first to confirm the dev server is actually up |
| `BROWSERBASE_API_KEY not set` | `export BROWSERBASE_API_KEY=...` and `BROWSERBASE_PROJECT_ID=...` |
| WebSockets don't work | The proxy supports HTTP upgrade — make sure your client uses `wss://` (cloudflared quick tunnels are HTTPS-only) |
| Launcher hangs at "starting quick tunnel" | Network or DNS issue reaching `trycloudflare.com`. `cloudflared tunnel --url http://example.com` to test cloudflared standalone |

## When NOT to Use

- **The URL is already public** (Vercel preview, staging, prod) — use the `browser` skill directly
- **You need video recording from a local-Chrome session** — that's a different product gap; this skill replaces local with cloud, it doesn't mirror local
- **Bank/healthcare strict-security customer that disallows any public URL** — even auth-gated. They need a native `bb tunnel` with VPC-internal relay, which doesn't exist yet
