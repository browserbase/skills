# Browser Automation Examples

Common browser automation workflows using the `browse` CLI. Each example demonstrates a distinct pattern using real commands.

For localhost and other local dev flows, start with `browse env local` for a clean isolated browser. Use `browse env local --auto-connect` only when the agent should reuse your existing local Chrome session, cookies, or login state.

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
browse env local
browse open https://competitor.com/pricing
browse snapshot
# Output shows: "Checking your browser..." (Cloudflare interstitial)
# or: page content is empty / access denied
browse stop
```

The agent detects bot protection and tells the user:

> This site has Cloudflare bot detection. Browserbase remote mode can bypass this with anti-bot stealth and residential proxies. Want me to set it up?

If the user agrees:

```bash
# Set Browserbase credentials
export BROWSERBASE_API_KEY="bb_live_..."

# Retry in remote mode
browse env remote
browse open https://competitor.com/pricing
browse snapshot                          # full page content now accessible
browse get text ".pricing-table"
browse stop
```

## Example 5: Persist Login with Context ID

**User request**: "Log into my dashboard and save the session so I don't have to log in again next time"

This uses Browserbase contexts to persist cookies and storage across sessions. Requires remote mode.

```bash
# Session 1: Log in and persist state
browse env remote
browse open https://app.example.com/login --context-id ctx_abc123 --persist
browse snapshot                          # find login form fields
browse click @0-3                        # click email input
browse type "user@example.com"
browse press Tab
browse type "my-password"
browse click @0-7                        # click Sign In button
browse wait load
browse snapshot                          # confirm logged-in dashboard
browse stop                              # state is saved back to ctx_abc123
```

In a later session, reuse the same context — already authenticated:

```bash
# Session 2: Resume with saved state (already logged in)
browse env remote
browse open https://app.example.com/dashboard --context-id ctx_abc123
browse snapshot                          # dashboard loads — no login needed
browse get text ".welcome-message"
browse stop
```

**Key pattern**: Use `--context-id <id> --persist` on the first session to save auth state. On subsequent sessions, use `--context-id <id>` (with or without `--persist`) to resume where you left off. Omit `--persist` if you don't want changes from that session saved back.

## Example 6: Attach to an Existing Browserbase Session

**User request**: "Connect to this running Browserbase session and check its state"

Use `--connect` to attach the CLI to a Browserbase session that was created outside the CLI (via the API, dashboard, or another tool). The CLI connects without creating a new session, and `browse stop` disconnects without killing it.

```bash
# Attach to the existing session
browse --connect bb_sess_abc123 open https://app.example.com/dashboard
browse snapshot                          # inspect the page
browse get text ".status"                # extract data
browse stop                              # disconnect — session stays alive on Browserbase
```

**Key pattern**: `--connect` is for sessions you don't own — the CLI is a guest. `browse stop` only disconnects, it does not terminate the remote session. Cannot be combined with `--context-id`.

## Tips

- **Snapshot first**: Always run `browse snapshot` before interacting — it gives you the accessibility tree with element refs
- **Use refs to click**: `browse click @0-5` is more reliable than trying to describe elements
- **Re-snapshot after actions**: Element refs change when the page updates
- **`get text` for data extraction**: Use `browse get text [selector]` to pull text content from specific elements
- **`stop` when done**: Always `browse stop` to clean up the browser session
- **Prefer snapshot over screenshot**: Snapshot is fast and structured; screenshot is slow and uses vision tokens. Only screenshot when you need visual context (layout, images, debugging)
