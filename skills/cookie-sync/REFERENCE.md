# Cookie Sync Reference

## Table of Contents

- [Architecture](#architecture)
- [Environment Variables](#environment-variables)
- [How It Works](#how-it-works)
- [Browserbase Context Integration](#browserbase-context-integration)
- [Browser Compatibility](#browser-compatibility)
- [Security Considerations](#security-considerations)

## Architecture

Cookie sync is a single Node.js script with zero npm dependencies. It uses:

- **CDP (Chrome DevTools Protocol)** over WebSocket to extract cookies from local Chrome and inject them into the cloud browser
- **Browserbase REST API** to create sessions and contexts
- **Node 22+ built-ins** only: `WebSocket`, `fetch`, `fs`, `os`, `path`

```
Local Chrome (CDP) → cookie-sync.mjs → Browserbase API → Cloud Browser (CDP)
     ↓                                       ↓                    ↓
 getAllCookies              createContext + createSession    setCookies
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BROWSERBASE_API_KEY` | Yes | API key from https://browserbase.com/settings |
| `BROWSERBASE_PROJECT_ID` | Yes | Project ID from Browserbase dashboard |
| `BROWSERBASE_CONTEXT_ID` | No | Reuse an existing context instead of creating a new one |
| `CDP_URL` | No | Direct WebSocket URL to Chrome (e.g. `ws://127.0.0.1:9222`). Use when Chrome is launched with `--remote-debugging-port` and no `DevToolsActivePort` file exists |
| `CDP_PORT_FILE` | No | Custom path to DevToolsActivePort file |
| `CDP_HOST` | No | Custom host for local Chrome connection (default: `127.0.0.1`) |

## How It Works

### Step 1: Connect to Local Chrome

The script finds Chrome's DevTools WebSocket URL by reading the `DevToolsActivePort` file. This file is created when Chrome starts with remote debugging enabled and contains the port number and WebSocket path.

### Step 2: Export Cookies

Attaches to the first non-chrome:// page target and calls `Network.getAllCookies` via CDP. This returns all cookies from all domains stored in the browser — not just the active tab.

### Step 3: Create Context and Session

Creates a Browserbase Context (persistent state container) and a session attached to that context with `persist: true`. This means:
- Cookies injected during this session are saved to the context
- Future sessions using the same context ID start with those cookies
- The session uses `keepAlive: true` so it stays open until explicitly closed

### Step 4: Inject Cookies

Connects to the cloud browser via `wss://connect.browserbase.com` and calls `Network.setCookies` to inject all exported cookies.

## Browserbase Context Integration

Contexts persist browser state (cookies, localStorage, IndexedDB) across sessions.

### First sync (creates context)

```bash
node cookie-sync.mjs
# Output includes: Context ID: ctx_abc123
```

### Subsequent sessions (reuses context)

```bash
BROWSERBASE_CONTEXT_ID=ctx_abc123 node cookie-sync.mjs
```

### Context lifecycle

- Contexts don't expire on Browserbase's end
- Cookies within the context expire based on the website's cookie policies
- Use one context per user/identity to avoid session conflicts
- Avoid running multiple sessions with the same context simultaneously

## Browser Compatibility

### Supported Browsers

| Browser | macOS | Linux | Windows |
|---------|-------|-------|---------|
| Google Chrome | Yes | Yes | Yes |
| Chrome Beta | Yes | Yes | — |
| Chrome for Testing | Yes | — | — |
| Chromium | Yes | Yes | — |
| Brave | Yes | Yes | Yes |
| Microsoft Edge | Yes | Yes | Yes |
| Vivaldi | — | Yes | — |

### Enabling Remote Debugging

**Chrome 146+ (recommended)**:
1. Navigate to `chrome://flags/#allow-remote-debugging`
2. Set to "Enabled"
3. Restart Chrome

**Any Chrome version** (requires `--user-data-dir` and `CDP_URL`):
```bash
# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug
export CDP_URL=ws://127.0.0.1:9222

# Linux
google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug
export CDP_URL=ws://127.0.0.1:9222

# Windows
chrome.exe --remote-debugging-port=9222 --user-data-dir=%TEMP%\chrome-debug
set CDP_URL=ws://127.0.0.1:9222
```

Note: `--user-data-dir` is required because Chrome won't open the debugging port with an existing profile. This means the debug instance starts with a fresh profile — your real cookies are not available. The `chrome://flags` method (Chrome 146+) does not have this limitation.

## Security Considerations

- **Cookies are sensitive credentials.** The script transfers your authenticated sessions to a cloud browser. Only use with your own Browserbase account.
- Cookies are transmitted over secure WebSocket (`wss://`) to Browserbase.
- The script does not log, store, or transmit cookies anywhere other than the target Browserbase session.
- Sessions created with `keepAlive: true` persist until explicitly closed — remember to close sessions when done.
