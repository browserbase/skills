# Cookie Sync Examples

## Example 1: Basic Cookie Sync

**User request**: "Sync my Chrome cookies to a cloud browser"

```bash
export BROWSERBASE_API_KEY="bb_live_xxx"
export BROWSERBASE_PROJECT_ID="proj_xxx"
node .claude/skills/cookie-sync/scripts/cookie-sync.mjs
```

After syncing, navigate to a site:

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
    send('Page.navigate', { url: 'https://mail.google.com' }, msg.result.sessionId);
  }
  if (msg.id === 3) {
    console.log('Navigated to Gmail');
    setTimeout(() => process.exit(0), 1000);
  }
};
"
```

## Example 2: Reuse Context Across Sessions

**User request**: "I already synced my cookies earlier, start a new session with them"

```bash
export BROWSERBASE_CONTEXT_ID="ctx_abc123"
node .claude/skills/cookie-sync/scripts/cookie-sync.mjs
```

This creates a new session using the saved context — no need to re-export cookies from Chrome (though the script still does to ensure freshness).

## Example 3: Take a Screenshot of an Authenticated Page

**User request**: "Go to my GitHub notifications and screenshot them"

After cookie sync, navigate and screenshot:

```bash
node -e "
const fs = require('fs');
const WS_URL = 'wss://connect.browserbase.com?apiKey=' + process.env.BROWSERBASE_API_KEY + '&sessionId=SESSION_ID';
const ws = new WebSocket(WS_URL);
let id = 0, sid;
const send = (method, params = {}) => {
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
    sid = msg.result.sessionId;
    send('Page.navigate', { url: 'https://github.com/notifications' });
  }
  if (msg.id === 3) {
    setTimeout(() => send('Page.captureScreenshot', { format: 'png' }), 3000);
  }
  if (msg.id === 4) {
    fs.writeFileSync('/tmp/screenshot.png', Buffer.from(msg.result.data, 'base64'));
    console.log('Screenshot saved to /tmp/screenshot.png');
    process.exit(0);
  }
};
"
```

## Example 4: Using with a Custom Browser

**User request**: "Sync cookies from Brave instead of Chrome"

Brave is auto-detected. If your browser stores DevToolsActivePort in a non-standard location:

```bash
export CDP_PORT_FILE="$HOME/Library/Application Support/MyBrowser/DevToolsActivePort"
node .claude/skills/cookie-sync/scripts/cookie-sync.mjs
```

## Tips

- **First time?** Enable remote debugging in `chrome://flags/#allow-remote-debugging` and restart Chrome before running
- **Save your context ID** after the first sync to skip context creation in future sessions
- **One context per identity** — don't mix personal and work browser cookies in the same context
- **Close sessions when done** — keepAlive sessions persist until explicitly closed and consume resources
- **Watch the live view** — open the viewer URL to see the cloud browser in real time
