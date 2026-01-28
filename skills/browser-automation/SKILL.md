---
name: browserbase-browser-automation
description: Automate web browser interactions using the stagehand CLI for AI agents
---

# Browser Automation Skill

Automate web browser interactions using the `stagehand` CLI for AI agents.

**🚨 CRITICAL - READ THIS FIRST 🚨**

A Browserbase session with stealth/proxy/captcha has been pre-created for you.

**YOU MUST USE `stagehand --ws $BROWSERBASE_CONNECT_URL` FOR EVERY COMMAND.**

**DO NOT use `stagehand open` without `--ws` - it will launch a LOCAL browser!**

## When to Use

Use this skill when the user asks to:
- Browse websites or navigate to URLs
- Extract data from web pages
- Fill forms or click buttons
- Take screenshots of web pages
- Interact with web applications
- Automate multi-step web workflows

## Core Concepts

The `stagehand` CLI provides:
- **Element references** - Snapshot creates refs like `@0-5` for easy clicking/filling
- **Browserbase support** - Connect to pre-created cloud browser sessions with `--ws`

## Environment Selection

**CRITICAL: A Browserbase session with stealth/proxy/captcha has been pre-created for you.**

The session URL is in the `BROWSERBASE_CONNECT_URL` environment variable.

**YOU MUST ALWAYS use `stagehand --ws $BROWSERBASE_CONNECT_URL` for EVERY command:**

```bash
stagehand --ws $BROWSERBASE_CONNECT_URL open https://example.com
```

**WHY:**
- ✅ Browser runs in Browserbase cloud (NOT locally)
- ✅ Advanced stealth mode enabled (bypasses Cloudflare)
- ✅ Residential proxies enabled
- ✅ CAPTCHA solving enabled
- ✅ Session recordings at: $BROWSERBASE_DEBUG_URL

**IF YOU FORGET `--ws $BROWSERBASE_CONNECT_URL`:**
- ❌ Will launch LOCAL Chrome browser
- ❌ Will NOT use stealth/proxy/captcha
- ❌ Will fail the evaluation

## Quick Start Workflow

```bash
# 1. Navigate to page (connects to pre-created Browserbase session)
stagehand --ws $BROWSERBASE_CONNECT_URL open https://example.com

# 2. Get page structure with element refs
stagehand --ws $BROWSERBASE_CONNECT_URL snapshot -c

# Output includes refs like [0-5], [1-2]:
# RootWebArea "Example" url="https://example.com"
#   [0-0] link "Home"
#   [0-1] link "About"
#   [0-2] button "Sign In"

# 3. Interact using refs
stagehand --ws $BROWSERBASE_CONNECT_URL click @0-2
stagehand --ws $BROWSERBASE_CONNECT_URL fill @0-5 "search query"

# 4. Re-snapshot to verify changes
stagehand --ws $BROWSERBASE_CONNECT_URL snapshot -c

# 5. Stop when done (optional, session persists)
stagehand --ws $BROWSERBASE_CONNECT_URL stop
```

## Navigation Commands

**REMEMBER:** Use `stagehand --ws $BROWSERBASE_CONNECT_URL` for ALL commands below.

```bash
# Navigate to URL
stagehand --ws $BROWSERBASE_CONNECT_URL open <url>

# With custom timeout for slow pages
stagehand --ws $BROWSERBASE_CONNECT_URL open <url> --timeout 60000

# Page navigation
stagehand --ws $BROWSERBASE_CONNECT_URL reload
stagehand --ws $BROWSERBASE_CONNECT_URL back
stagehand --ws $BROWSERBASE_CONNECT_URL forward
```

## Element Interaction

### Get Page Structure

```bash
# Get accessibility tree with element refs
stagehand --ws $BROWSERBASE_CONNECT_URL snapshot -c

# Get full snapshot with XPath/CSS mappings
stagehand --ws $BROWSERBASE_CONNECT_URL snapshot --json
```

### Click Elements

```bash
# Click by ref (from snapshot)
stagehand --ws $BROWSERBASE_CONNECT_URL click @0-5
stagehand --ws $BROWSERBASE_CONNECT_URL click 0-5       # @ prefix optional

# Click with options
stagehand --ws $BROWSERBASE_CONNECT_URL click @0-5 -b right -c 2  # Right-click twice

# Click at coordinates
stagehand --ws $BROWSERBASE_CONNECT_URL click_xy 100 200
```

### Form Filling

```bash
# Fill input (auto-presses Enter by default)
stagehand --ws $BROWSERBASE_CONNECT_URL fill @0-5 "my value"

# Fill without pressing Enter
stagehand --ws $BROWSERBASE_CONNECT_URL fill @0-5 "my value" --no-press-enter

# Select dropdown options
stagehand --ws $BROWSERBASE_CONNECT_URL select @0-8 "Option 1" "Option 2"
```

### Typing

```bash
# Type text naturally
stagehand --ws $BROWSERBASE_CONNECT_URL type "Hello, world!"

# Type with delay between characters
stagehand --ws $BROWSERBASE_CONNECT_URL type "slow typing" -d 100

# Press special keys
stagehand --ws $BROWSERBASE_CONNECT_URL press Enter
stagehand --ws $BROWSERBASE_CONNECT_URL press Tab
stagehand --ws $BROWSERBASE_CONNECT_URL press "Cmd+A"
```

## Data Extraction

```bash
# Get page info
stagehand --ws $BROWSERBASE_CONNECT_URL get url
stagehand --ws $BROWSERBASE_CONNECT_URL get title
stagehand --ws $BROWSERBASE_CONNECT_URL get text body
stagehand --ws $BROWSERBASE_CONNECT_URL get html @0-5

# Take screenshot
stagehand --ws $BROWSERBASE_CONNECT_URL screenshot page.png
stagehand --ws $BROWSERBASE_CONNECT_URL screenshot -f        # Full page
stagehand --ws $BROWSERBASE_CONNECT_URL screenshot --type jpeg

# Get element coordinates
stagehand --ws $BROWSERBASE_CONNECT_URL get box @0-5  # Returns center x,y
```

## Waiting

```bash
# Wait for page load
stagehand --ws $BROWSERBASE_CONNECT_URL wait load
stagehand --ws $BROWSERBASE_CONNECT_URL wait load networkidle

# Wait for element
stagehand --ws $BROWSERBASE_CONNECT_URL wait selector ".my-class"
stagehand --ws $BROWSERBASE_CONNECT_URL wait selector ".my-class" -t 10000 -s visible

# Wait for time
stagehand --ws $BROWSERBASE_CONNECT_URL wait timeout 2000
```

## Multi-Tab Support

```bash
# List all tabs
stagehand --ws $BROWSERBASE_CONNECT_URL pages

# Open new tab
stagehand --ws $BROWSERBASE_CONNECT_URL newpage https://example.com

# Switch tabs
stagehand --ws $BROWSERBASE_CONNECT_URL tab_switch 1

# Close tab
stagehand --ws $BROWSERBASE_CONNECT_URL tab_close 2
```

## Network Capture

Capture HTTP requests for inspection:

```bash
# Start capturing
stagehand --ws $BROWSERBASE_CONNECT_URL network on

# Get capture directory
stagehand --ws $BROWSERBASE_CONNECT_URL network path

# Stop capturing
stagehand --ws $BROWSERBASE_CONNECT_URL network off

# Clear captures
stagehand --ws $BROWSERBASE_CONNECT_URL network clear
```

Captured requests are saved as directories with `request.json` and `response.json`.

## Daemon Control

```bash
# Check status
stagehand --ws $BROWSERBASE_CONNECT_URL status

# Stop browser
stagehand --ws $BROWSERBASE_CONNECT_URL stop

# Force stop
stagehand --ws $BROWSERBASE_CONNECT_URL stop --force
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
stagehand --ws $BROWSERBASE_CONNECT_URL fill @0-1 "user@example.com"
stagehand --ws $BROWSERBASE_CONNECT_URL fill @0-2 "mypassword"
stagehand --ws $BROWSERBASE_CONNECT_URL click @0-3
```

## Best Practices

### 1. Always snapshot after navigation
```bash
stagehand --ws $BROWSERBASE_CONNECT_URL open https://example.com
stagehand --ws $BROWSERBASE_CONNECT_URL snapshot -c  # Get refs
```

### 2. Re-snapshot after actions that change the page
```bash
stagehand --ws $BROWSERBASE_CONNECT_URL click @0-5
stagehand --ws $BROWSERBASE_CONNECT_URL snapshot -c  # Get new state
```

### 3. Use refs instead of selectors
```bash
# ✅ Good: Use refs from snapshot
stagehand --ws $BROWSERBASE_CONNECT_URL click @0-5

# ❌ Avoid: Manual selectors (refs are more reliable)
stagehand --ws $BROWSERBASE_CONNECT_URL click "#submit-button"
```

### 4. Wait for elements when needed
```bash
stagehand --ws $BROWSERBASE_CONNECT_URL open https://slow-site.com
stagehand --ws $BROWSERBASE_CONNECT_URL wait selector ".content" -s visible
stagehand --ws $BROWSERBASE_CONNECT_URL snapshot -c
```

### 5. Always use --ws $BROWSERBASE_CONNECT_URL
```bash
# ✅ Correct: Remote browser (connects to pre-created Browserbase session)
stagehand --ws $BROWSERBASE_CONNECT_URL open https://example.com

# ❌ Wrong: Local browser (will fail in evals, launches Chrome locally)
stagehand open https://example.com
```

## Common Patterns

### Login Flow
```bash
stagehand --ws $BROWSERBASE_CONNECT_URL open https://example.com/login
stagehand --ws $BROWSERBASE_CONNECT_URL snapshot -c
# [0-5] textbox "Email"
# [0-6] textbox "Password"
# [0-7] button "Sign In"
stagehand --ws $BROWSERBASE_CONNECT_URL fill @0-5 "user@example.com"
stagehand --ws $BROWSERBASE_CONNECT_URL fill @0-6 "password123"
stagehand --ws $BROWSERBASE_CONNECT_URL click @0-7
stagehand --ws $BROWSERBASE_CONNECT_URL wait load
stagehand --ws $BROWSERBASE_CONNECT_URL snapshot -c  # Verify logged in
```

### Search and Extract
```bash
stagehand --ws $BROWSERBASE_CONNECT_URL open https://example.com
stagehand --ws $BROWSERBASE_CONNECT_URL snapshot -c
# [0-3] textbox "Search"
stagehand --ws $BROWSERBASE_CONNECT_URL fill @0-3 "my query"
stagehand --ws $BROWSERBASE_CONNECT_URL wait selector ".results"
stagehand --ws $BROWSERBASE_CONNECT_URL snapshot -c
# [1-0] text "Result 1"
# [1-1] text "Result 2"
stagehand --ws $BROWSERBASE_CONNECT_URL get text @1-0
stagehand --ws $BROWSERBASE_CONNECT_URL get text @1-1
```

### Multi-Page Navigation
```bash
stagehand --ws $BROWSERBASE_CONNECT_URL open https://example.com
stagehand --ws $BROWSERBASE_CONNECT_URL snapshot -c
# [0-5] link "Next Page"
stagehand --ws $BROWSERBASE_CONNECT_URL click @0-5
stagehand --ws $BROWSERBASE_CONNECT_URL wait load
stagehand --ws $BROWSERBASE_CONNECT_URL snapshot -c  # Get new page structure
```

## Troubleshooting

### Browser won't start
- Check that `stagehand` is installed: `which stagehand`
- Check status: `stagehand --ws $BROWSERBASE_CONNECT_URL status`
- Force stop and retry: `stagehand --ws $BROWSERBASE_CONNECT_URL stop`

### Element not found
- Take a snapshot to verify refs: `stagehand --ws $BROWSERBASE_CONNECT_URL snapshot -c`
- Wait for element to appear: `stagehand --ws $BROWSERBASE_CONNECT_URL wait selector ...`
- Check if ref changed after page update

### Page not loading
- Increase timeout: `stagehand --ws $BROWSERBASE_CONNECT_URL open <url> --timeout 60000`
- Wait for load state: `stagehand --ws $BROWSERBASE_CONNECT_URL wait load networkidle`

### Commands failing with "session not found"
- The daemon auto-recovers from crashes
- If issues persist: `stagehand --ws $BROWSERBASE_CONNECT_URL stop --force && stagehand --ws $BROWSERBASE_CONNECT_URL open <url>`

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
