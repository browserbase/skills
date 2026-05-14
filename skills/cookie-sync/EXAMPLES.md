# Cookie Sync Examples

## Example 1: Basic Cookie Sync

**User request**: "Sync my Chrome cookies to a cloud browser"

```bash
bb sync
```

Output:
```json
{
  "contextId": "5d780360-7c8d-445c-ab22-509225a694b6",
  "cookiesSynced": 6154
}
```

Then browse an authenticated site:

```bash
browse open https://mail.google.com --context-id 5d780360-7c8d-445c-ab22-509225a694b6 --persist
```

## Example 2: Sync Specific Domains

**User request**: "Sync my GitHub and Google cookies"

```bash
bb sync --domains google.com,github.com
```

Output:
```json
{
  "contextId": "ctx_abc123",
  "cookiesSynced": 119,
  "domains": ["google.com", "github.com"]
}
```

## Example 3: Reuse Context Across Sessions

**User request**: "I already synced my cookies earlier, start a new session with them"

```bash
bb sync --context-id ctx_abc123
```

This re-exports fresh cookies from local Chrome into the existing context — keeping it up to date without creating a new one.

## Example 4: Take a Screenshot of an Authenticated Page

**User request**: "Go to my GitHub notifications and screenshot them"

```bash
# Step 1: Sync cookies
bb sync --domains github.com
# Note the contextId from the output

# Step 2: Browse and screenshot
browse open https://github.com/notifications --context-id <ctx-id> --persist
browse screenshot --output /tmp/notifications.png
browse stop
```

## Example 5: Stealth Mode with Proxy

**User request**: "Sync my Google cookies but avoid bot detection"

```bash
bb sync --domains google.com --stealth --proxy "San Francisco,CA,US"
```

The `--stealth` flag enables advanced bot detection evasion, and `--proxy` routes through a residential IP near your location so Google doesn't flag the session as suspicious.

## Example 6: Using with a Custom Browser

**User request**: "Sync cookies from Brave instead of Chrome"

Brave is auto-detected. If your browser stores DevToolsActivePort in a non-standard location:

```bash
export CDP_PORT_FILE="$HOME/Library/Application Support/MyBrowser/DevToolsActivePort"
bb sync
```

## Example 7: Scripting with JSON Output

**User request**: "Sync cookies and use the context ID in a script"

```bash
# Capture the context ID from bb sync's JSON output
CONTEXT_ID=$(bb sync --domains github.com 2>/dev/null | jq -r '.contextId')

# Use it downstream
browse open https://github.com --context-id "$CONTEXT_ID" --persist
```

The JSON output goes to stdout and progress messages go to stderr, so `2>/dev/null` suppresses progress while preserving the parseable output.

## Tips

- **First time?** Enable remote debugging in `chrome://flags/#allow-remote-debugging` and restart Chrome before running
- **Save your context ID** after the first sync to skip context creation in future sessions
- **One context per identity** — don't mix personal and work browser cookies in the same context
- **Pipe-friendly** — JSON on stdout, progress on stderr. Use `jq` to extract fields.
