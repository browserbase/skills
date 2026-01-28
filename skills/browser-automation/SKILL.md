# Browser Automation Skill

Automate web browser interactions using the `browse` CLI for AI agents.

**🔑 CRITICAL:** A Browserbase session is pre-created with stealth/proxy/captcha. Use `--ws $BROWSERBASE_CONNECT_URL` in ALL commands (not `--env BROWSERBASE`).

## When to Use

Use this skill when the user asks to:
- Browse websites or navigate to URLs
- Extract data from web pages
- Fill forms or click buttons
- Take screenshots of web pages
- Interact with web applications
- Automate multi-step web workflows

## Core Concepts

The `browse` CLI provides:
- **Daemon architecture** - Browser state persists between commands
- **Element references** - Snapshot creates refs like `@0-5` for easy clicking/filling
- **Self-healing** - Auto-recovers from crashes
- **Multiple sessions** - Run parallel browser instances
- **Browserbase support** - Uses `--env BROWSERBASE` for remote cloud browsers

## Environment Selection

**IMPORTANT: A Browserbase session with stealth/proxy/captcha has been pre-created for you.**

The session URL is available in the `BROWSERBASE_CONNECT_URL` environment variable.

**ALWAYS use `--ws $BROWSERBASE_CONNECT_URL` to connect:**

```bash
browse --ws $BROWSERBASE_CONNECT_URL open https://example.com
```

This ensures:
- Browser runs in Browserbase cloud (not locally)
- Advanced stealth mode enabled (bypasses Cloudflare)
- Residential proxies enabled
- CAPTCHA solving enabled
- Session recordings for debugging at: $BROWSERBASE_DEBUG_URL

## Quick Start Workflow

```bash
# 1. Navigate to page (browser auto-starts, connects to pre-created session)
browse --ws $BROWSERBASE_CONNECT_URL open https://example.com

# 2. Get page structure with element refs
browse --ws $BROWSERBASE_CONNECT_URL snapshot -c

# Output includes refs like [0-5], [1-2]:
# RootWebArea "Example" url="https://example.com"
#   [0-0] link "Home"
#   [0-1] link "About"
#   [0-2] button "Sign In"

# 3. Interact using refs
browse --ws $BROWSERBASE_CONNECT_URL click @0-2
browse --ws $BROWSERBASE_CONNECT_URL fill @0-5 "search query"

# 4. Re-snapshot to verify changes
browse --ws $BROWSERBASE_CONNECT_URL snapshot -c

# 5. Stop when done
browse --ws $BROWSERBASE_CONNECT_URL stop
```

## Navigation Commands

**NOTE:** Use `browse --ws $BROWSERBASE_CONNECT_URL` for all commands below.

```bash
# Navigate to URL
browse --ws $BROWSERBASE_CONNECT_URL open <url>

# With custom timeout for slow pages
browse --ws $BROWSERBASE_CONNECT_URL open <url> --timeout 60000

# Page navigation
browse --ws $BROWSERBASE_CONNECT_URL reload
browse --ws $BROWSERBASE_CONNECT_URL back
browse --ws $BROWSERBASE_CONNECT_URL forward
```

## Element Interaction

### Get Page Structure

```bash
# Get accessibility tree with element refs
browse --env BROWSERBASE snapshot -c

# Get full snapshot with XPath/CSS mappings
browse --env BROWSERBASE snapshot --json
```

### Click Elements

```bash
# Click by ref (from snapshot)
browse --env BROWSERBASE click @0-5
browse --env BROWSERBASE click 0-5       # @ prefix optional

# Click with options
browse --env BROWSERBASE click @0-5 -b right -c 2  # Right-click twice

# Click at coordinates
browse --env BROWSERBASE click_xy 100 200
```

### Form Filling

```bash
# Fill input (auto-presses Enter by default)
browse --env BROWSERBASE fill @0-5 "my value"

# Fill without pressing Enter
browse --env BROWSERBASE fill @0-5 "my value" --no-press-enter

# Select dropdown options
browse --env BROWSERBASE select @0-8 "Option 1" "Option 2"
```

### Typing

```bash
# Type text naturally
browse --env BROWSERBASE type "Hello, world!"

# Type with delay between characters
browse --env BROWSERBASE type "slow typing" -d 100

# Press special keys
browse --env BROWSERBASE press Enter
browse --env BROWSERBASE press Tab
browse --env BROWSERBASE press "Cmd+A"
```

## Data Extraction

```bash
# Get page info
browse --env BROWSERBASE get url
browse --env BROWSERBASE get title
browse --env BROWSERBASE get text body
browse --env BROWSERBASE get html @0-5

# Take screenshot
browse --env BROWSERBASE screenshot page.png
browse --env BROWSERBASE screenshot -f        # Full page
browse --env BROWSERBASE screenshot --type jpeg

# Get element coordinates
browse --env BROWSERBASE get box @0-5  # Returns center x,y
```

## Waiting

```bash
# Wait for page load
browse --env BROWSERBASE wait load
browse --env BROWSERBASE wait load networkidle

# Wait for element
browse --env BROWSERBASE wait selector ".my-class"
browse --env BROWSERBASE wait selector ".my-class" -t 10000 -s visible

# Wait for time
browse --env BROWSERBASE wait timeout 2000
```

## Multi-Tab Support

```bash
# List all tabs
browse --env BROWSERBASE pages

# Open new tab
browse --env BROWSERBASE newpage https://example.com

# Switch tabs
browse --env BROWSERBASE tab_switch 1

# Close tab
browse --env BROWSERBASE tab_close 2
```

## Network Capture

Capture HTTP requests for inspection:

```bash
# Start capturing
browse --env BROWSERBASE network on

# Get capture directory
browse --env BROWSERBASE network path

# Stop capturing
browse --env BROWSERBASE network off

# Clear captures
browse --env BROWSERBASE network clear
```

Captured requests are saved as directories with `request.json` and `response.json`.

## Daemon Control

```bash
# Check status
browse --env BROWSERBASE status

# Stop browser
browse --env BROWSERBASE stop

# Force stop
browse --env BROWSERBASE stop --force
```

## Element References

After `snapshot`, elements have refs you can use:

```
RootWebArea "Login Page"
  [0-0] heading "Welcome"
  [0-1] textbox "Email" name="email"
  [0-2] textbox "Password" name="password"
  [0-3] button "Sign In"
```

Use these refs directly:
```bash
browse --env BROWSERBASE fill @0-1 "user@example.com"
browse --env BROWSERBASE fill @0-2 "mypassword"
browse --env BROWSERBASE click @0-3
```

## Best Practices

### 1. Always snapshot after navigation
```bash
browse --env BROWSERBASE open https://example.com
browse --env BROWSERBASE snapshot -c  # Get refs
```

### 2. Re-snapshot after actions that change the page
```bash
browse --env BROWSERBASE click @0-5
browse --env BROWSERBASE snapshot -c  # Get new state
```

### 3. Use refs instead of selectors
```bash
# ✅ Good: Use refs from snapshot
browse --env BROWSERBASE click @0-5

# ❌ Avoid: Manual selectors (refs are more reliable)
browse --env BROWSERBASE click "#submit-button"
```

### 4. Wait for elements when needed
```bash
browse --env BROWSERBASE open https://slow-site.com
browse --env BROWSERBASE wait selector ".content" -s visible
browse --env BROWSERBASE snapshot -c
```

### 5. Always use --env BROWSERBASE
```bash
# ✅ Correct: Remote browser
browse --env BROWSERBASE open https://example.com

# ❌ Wrong: Local browser (will fail in evals)
browse open https://example.com
```

## Common Patterns

### Login Flow
```bash
browse --env BROWSERBASE open https://example.com/login
browse --env BROWSERBASE snapshot -c
# [0-5] textbox "Email"
# [0-6] textbox "Password"
# [0-7] button "Sign In"
browse --env BROWSERBASE fill @0-5 "user@example.com"
browse --env BROWSERBASE fill @0-6 "password123"
browse --env BROWSERBASE click @0-7
browse --env BROWSERBASE wait load
browse --env BROWSERBASE snapshot -c  # Verify logged in
```

### Search and Extract
```bash
browse --env BROWSERBASE open https://example.com
browse --env BROWSERBASE snapshot -c
# [0-3] textbox "Search"
browse --env BROWSERBASE fill @0-3 "my query"
browse --env BROWSERBASE wait selector ".results"
browse --env BROWSERBASE snapshot -c
# [1-0] text "Result 1"
# [1-1] text "Result 2"
browse --env BROWSERBASE get text @1-0
browse --env BROWSERBASE get text @1-1
```

### Multi-Page Navigation
```bash
browse --env BROWSERBASE open https://example.com
browse --env BROWSERBASE snapshot -c
# [0-5] link "Next Page"
browse --env BROWSERBASE click @0-5
browse --env BROWSERBASE wait load
browse --env BROWSERBASE snapshot -c  # Get new page structure
```

## Troubleshooting

### Browser won't start
- Check that `browse` is installed: `which browse`
- Check status: `browse status`
- Force stop and retry: `browse stop --force`

### Element not found
- Take a snapshot to verify refs: `browse --env BROWSERBASE snapshot -c`
- Wait for element to appear: `browse --env BROWSERBASE wait selector ...`
- Check if ref changed after page update

### Page not loading
- Increase timeout: `browse --env BROWSERBASE open <url> --timeout 60000`
- Wait for load state: `browse --env BROWSERBASE wait load networkidle`

### Commands failing with "session not found"
- The daemon auto-recovers from crashes
- If issues persist: `browse --env BROWSERBASE stop --force && browse --env BROWSERBASE open <url>`

## Performance Tips

1. **Use compact snapshots** (`-c`) for faster parsing
2. **Wait strategically** - only wait when needed
3. **Stop browser when done** to free resources
4. **Use refs over selectors** - faster and more reliable

## Important Notes

- Browser state persists between commands (cookies, refs, etc.)
- Refs are invalidated when the page changes significantly
- Always take a new snapshot after navigation or major DOM changes
- The daemon auto-starts on first command
- Multiple sessions supported via `--session` flag or `BROWSE_SESSION` env var
