# Browser Automation Examples

Common browser automation workflows using the `browse` CLI. Each example demonstrates a distinct pattern using real commands.

For localhost and other local dev flows, start with `browse open <url> --local` for a clean isolated browser. Use `browse open <url> --auto-connect` only when the agent should attach to an existing debuggable Chrome session for cookies or login state.

## Example 1: Extract Data from a Page

**User request**: "Get the product details from example.com/product/123"

```bash
browse open https://example.com/product/123
browse snapshot                          # read page structure + element refs
browse get text "body"                   # extract all visible text content
browse stop
```

Parse the text output to extract structured data (name, price, description, etc.).

For a specific section, use a CSS selector:

```bash
browse get text ".product-details"       # text from a specific container
```

**Note**: `browse get text` requires a CSS selector — use `"body"` for all page text.

## Example 2: Fill and Submit a Form

**User request**: "Fill out the contact form on example.com with my information"

```bash
browse open https://example.com/contact
browse snapshot                          # find form fields and their refs
browse click @0-3                        # click the Name input (ref from snapshot)
browse type "John Doe"
browse press Tab                         # move to next field
browse type "john@example.com"
browse fill "#message" "I would like to inquire about your services"
browse snapshot                          # verify fields are filled
browse click @0-8                        # click Submit button (ref from snapshot)
browse snapshot                          # confirm submission result
browse stop
```

**Key pattern**: Use `browse snapshot` before interacting to discover element refs, then `browse click <ref>` and `browse type` to interact.

## Example 3: Multi-Step Navigation

**User request**: "Get headlines from the first 3 pages of results on example.com/news"

```bash
browse open https://example.com/news
browse snapshot                          # read page 1 content
browse get text ".headline"              # extract headlines

browse snapshot                          # find "Next" button ref
browse click @0-12                       # click Next (ref from snapshot)
browse wait load                         # wait for page 2 to load
browse get text ".headline"              # extract page 2 headlines

browse snapshot                          # find Next again (ref may change)
browse click @0-15                       # click Next
browse wait load
browse get text ".headline"              # extract page 3 headlines

browse stop
```

**Key pattern**: Re-run `browse snapshot` after each navigation because element refs change when the page updates.

## Example 4: Escalate to Remote Mode

**User request**: "Scrape pricing from competitor.com" (a site with Cloudflare protection)

```bash
# Attempt 1: local mode
browse open https://competitor.com/pricing --local
browse snapshot
# Output shows: "Checking your browser..." (Cloudflare interstitial)
# or: page content is empty / access denied
browse stop
```

The agent detects bot protection and tells the user:

> This site has Cloudflare bot detection. Browserbase remote mode can use Browserbase Identity with a Verified browser and residential proxies. Want me to set it up?

If the user agrees:

```bash
# Set Browserbase credentials
export BROWSERBASE_API_KEY="bb_live_..."

# Retry in remote mode
browse open https://competitor.com/pricing --remote
browse snapshot                          # full page content now accessible
browse get text ".pricing-table"
browse stop
```

## Example 5: Persist Login with Context ID

**User request**: "Log into my dashboard and save the session so I don't have to log in again next time"

This uses Browserbase contexts to persist cookies and storage across sessions. Requires remote mode.

```bash
# Session 1: Log in and persist state
SESSION_JSON="$(browse cloud sessions create --context-id ctx_abc123 --persist --keep-alive)"
SESSION_ID="$(echo "$SESSION_JSON" | jq -r .id)"
CONNECT_URL="$(echo "$SESSION_JSON" | jq -r .connectUrl)"

browse open https://app.example.com/login --cdp "$CONNECT_URL"
browse snapshot                          # find login form fields
browse click @0-3                        # click email input
browse type "user@example.com"
browse press Tab
browse type "my-password"
browse click @0-7                        # click Sign In button
browse wait load
browse snapshot                          # confirm logged-in dashboard
browse stop
browse cloud sessions update "$SESSION_ID" --status REQUEST_RELEASE  # state is saved back to ctx_abc123
```

In a later session, reuse the same context — already authenticated:

```bash
# Session 2: Resume with saved state (already logged in)
SESSION_JSON="$(browse cloud sessions create --context-id ctx_abc123 --keep-alive)"
SESSION_ID="$(echo "$SESSION_JSON" | jq -r .id)"
CONNECT_URL="$(echo "$SESSION_JSON" | jq -r .connectUrl)"

browse open https://app.example.com/dashboard --cdp "$CONNECT_URL"
browse snapshot                          # dashboard loads — no login needed
browse get text ".welcome-message"
browse stop
browse cloud sessions update "$SESSION_ID" --status REQUEST_RELEASE
```

**Key pattern**: Use `browse cloud sessions create --context-id <id> --persist` for the first Browserbase session to save auth state, then attach with `browse open ... --cdp "$CONNECT_URL"`. On subsequent sessions, create with the same `--context-id` and omit `--persist` if you don't want changes saved back.

## Tips

- **Snapshot first**: Always run `browse snapshot` before interacting — it gives you the accessibility tree with element refs
- **Use refs to click**: `browse click @0-5` is more reliable than trying to describe elements
- **Re-snapshot after actions**: Element refs change when the page updates
- **`get text` for data extraction**: Use `browse get text [selector]` to pull text content from specific elements
- **`stop` when done**: Always `browse stop` to clean up the browser session
- **Prefer snapshot over screenshot**: Snapshot is fast and structured; screenshot is slow and uses vision tokens. Only screenshot when you need visual context (layout, images, debugging)
