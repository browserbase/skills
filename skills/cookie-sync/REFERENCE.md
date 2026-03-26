# Cookie Sync Reference

## Table of Contents

- [Command Reference](#command-reference)
- [Environment Variables](#environment-variables)
- [How It Works](#how-it-works)
- [Browserbase Context Integration](#browserbase-context-integration)
- [Browser Compatibility](#browser-compatibility)
- [Security Considerations](#security-considerations)

## Command Reference

```
bb sync [options]
```

| Flag | Description |
|------|-------------|
| `--domains <domains>` | Comma-separated list of domains to filter cookies. Matches subdomains. |
| `--context-id <id>` | Reuse an existing Browserbase context instead of creating a new one. |
| `--stealth` | Enable advanced stealth mode on the cloud session. |
| `--proxy <geo>` | Residential proxy geolocation: `"City,State,Country"`. |
| `--api-key <key>` | Override the Browserbase API key. |
| `--base-url <url>` | Override the Browserbase API base URL. |

### Output

`bb sync` outputs JSON to stdout with the sync result:

```json
{
  "contextId": "5d780360-7c8d-445c-ab22-509225a694b6",
  "cookiesSynced": 119,
  "domains": ["google.com", "github.com"]
}
```

Progress messages are written to stderr.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BROWSERBASE_API_KEY` | Yes | API key from https://browserbase.com/settings |
| `BROWSERBASE_CONTEXT_ID` | No | Reuse an existing context (alternative to `--context-id` flag) |
| `CDP_URL` | No | Direct WebSocket URL to Chrome (e.g. `ws://127.0.0.1:9222`). Use when Chrome is launched with `--remote-debugging-port` |
| `CDP_PORT_FILE` | No | Custom path to DevToolsActivePort file |
| `CDP_HOST` | No | Custom host for local Chrome connection (default: `127.0.0.1`) |

## How It Works

### Step 1: Connect to Local Chrome

`bb sync` finds Chrome's DevTools WebSocket URL in one of two ways:

- If `CDP_URL` is set, it resolves the browser WebSocket endpoint from that debugging endpoint (or uses the full browser WebSocket URL directly)
- Otherwise, it reads the `DevToolsActivePort` file created by browsers that expose remote debugging through their normal profile

### Step 2: Export Cookies

Connects to local Chrome via Stagehand and calls `context.cookies()` to export all cookies from all domains — not just the active tab.

### Step 3: Create Context and Session

Creates a Browserbase Context (persistent state container) and a session attached to that context with `persist: true`. This means:
- Cookies injected during this session are saved to the context
- Future sessions using the same context ID start with those cookies

### Step 4: Inject Cookies

Calls `context.addCookies()` to inject all exported cookies into the cloud browser. Once complete, the session is released and the context persists independently.

## Browserbase Context Integration

Contexts persist browser state (cookies, localStorage, IndexedDB) across sessions.

### First sync (creates context)

```bash
bb sync
# Output includes: "contextId": "ctx_abc123"
```

### Subsequent syncs (refreshes context)

```bash
bb sync --context-id ctx_abc123
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

**Any Chrome version** (requires `CDP_URL`):
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

- **Cookies are sensitive credentials.** The command transfers your authenticated sessions to a cloud browser. Only use with your own Browserbase account.
- Cookies are transmitted over secure WebSocket (`wss://`) to Browserbase.
- The command does not log, store, or transmit cookies anywhere other than the target Browserbase session.
- Sessions are automatically released after cookie injection — no lingering sessions consuming resources.
