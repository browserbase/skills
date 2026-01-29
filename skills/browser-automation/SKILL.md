---
name: browserbase-browser-automation
description: Automate web browser interactions using the browse CLI for AI agents
requires:
  npm:
    - "@browserbasehq/browse-cli"
  env:
    - BROWSERBASE_API_KEY
    - BROWSERBASE_PROJECT_ID
    - BROWSERBASE_CONNECT_URL
---

# Browser Automation Skill

Automate web browser interactions using the `browse` CLI for AI agents.

**🚨 CRITICAL - READ THIS FIRST 🚨**

A Browserbase session with stealth/proxy/captcha has been pre-created for you.

**YOU MUST USE `browse --ws $BROWSERBASE_CONNECT_URL` FOR EVERY COMMAND.**

**DO NOT use `browse open` without `--ws` - it will launch a LOCAL browser!**

## Installation

```bash
npm install -g @browserbasehq/browse-cli
```

Requires Chrome/Chromium installed on the system.

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
- **Element references** - Snapshot creates refs like `@0-5` for easy clicking/filling
- **Browserbase support** - Connect to pre-created cloud browser sessions with `--ws`
- **Daemon architecture** - Fast, stateful interactions with auto-recovery

## Environment Selection

**CRITICAL: A Browserbase session with stealth/proxy/captcha has been pre-created for you.**

The session URL is in the `BROWSERBASE_CONNECT_URL` environment variable.

**YOU MUST ALWAYS use `browse --ws $BROWSERBASE_CONNECT_URL` for EVERY command:**

```bash
browse --ws $BROWSERBASE_CONNECT_URL open https://example.com
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

# 5. Stop when done (optional, session persists)
browse --ws $BROWSERBASE_CONNECT_URL stop
```

## Navigation Commands

**REMEMBER:** Use `browse --ws $BROWSERBASE_CONNECT_URL` for ALL commands below.

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
browse --ws $BROWSERBASE_CONNECT_URL snapshot -c

# Get full snapshot with XPath/CSS mappings
browse --ws $BROWSERBASE_CONNECT_URL snapshot --json
```

### Click Elements

```bash
# Click by ref (from snapshot)
browse --ws $BROWSERBASE_CONNECT_URL click @0-5
browse --ws $BROWSERBASE_CONNECT_URL click 0-5       # @ prefix optional

# Click with options
browse --ws $BROWSERBASE_CONNECT_URL click @0-5 -b right -c 2  # Right-click twice

# Click at coordinates
browse --ws $BROWSERBASE_CONNECT_URL click_xy 100 200
```

### Form Filling

```bash
# Fill input (clears existing value first)
browse --ws $BROWSERBASE_CONNECT_URL fill @0-5 "my value"

# Fill without pressing Enter
browse --ws $BROWSERBASE_CONNECT_URL fill @0-5 "my value" --no-press-enter

# Select dropdown options
browse --ws $BROWSERBASE_CONNECT_URL select @0-8 "Option 1" "Option 2"
```

### Typing

```bash
# Type text (appends to existing value)
browse --ws $BROWSERBASE_CONNECT_URL type "Hello, world!"

# Type with delay between characters
browse --ws $BROWSERBASE_CONNECT_URL type "slow typing" -d 100

# Press special keys
browse --ws $BROWSERBASE_CONNECT_URL press Enter
browse --ws $BROWSERBASE_CONNECT_URL press Tab
browse --ws $BROWSERBASE_CONNECT_URL press "Cmd+A"
```

## Data Extraction

```bash
# Get page info
browse --ws $BROWSERBASE_CONNECT_URL get url
browse --ws $BROWSERBASE_CONNECT_URL get title
browse --ws $BROWSERBASE_CONNECT_URL get text body
browse --ws $BROWSERBASE_CONNECT_URL get html @0-5

# Take screenshot
browse --ws $BROWSERBASE_CONNECT_URL screenshot page.png
browse --ws $BROWSERBASE_CONNECT_URL screenshot -f        # Full page
browse --ws $BROWSERBASE_CONNECT_URL screenshot --type jpeg

# Get element coordinates
browse --ws $BROWSERBASE_CONNECT_URL get box @0-5  # Returns center x,y
```

## Waiting

```bash
# Wait for page load
browse --ws $BROWSERBASE_CONNECT_URL wait load
browse --ws $BROWSERBASE_CONNECT_URL wait load networkidle

# Wait for element
browse --ws $BROWSERBASE_CONNECT_URL wait selector ".my-class"
browse --ws $BROWSERBASE_CONNECT_URL wait selector ".my-class" -t 10000 -s visible

# Wait for time
browse --ws $BROWSERBASE_CONNECT_URL wait timeout 2000
```

## Multi-Tab Support

```bash
# List all tabs
browse --ws $BROWSERBASE_CONNECT_URL pages

# Open new tab
browse --ws $BROWSERBASE_CONNECT_URL newpage https://example.com

# Switch tabs
browse --ws $BROWSERBASE_CONNECT_URL tab_switch 1

# Close tab
browse --ws $BROWSERBASE_CONNECT_URL tab_close 2
```

## Network Capture

Capture HTTP requests for inspection:

```bash
# Start capturing
browse --ws $BROWSERBASE_CONNECT_URL network on

# Get capture directory
browse --ws $BROWSERBASE_CONNECT_URL network path

# Stop capturing
browse --ws $BROWSERBASE_CONNECT_URL network off

# Clear captures
browse --ws $BROWSERBASE_CONNECT_URL network clear
```

Captured requests are saved as directories with `request.json` and `response.json`.

## Daemon Control

```bash
# Check status
browse --ws $BROWSERBASE_CONNECT_URL status

# Stop browser
browse --ws $BROWSERBASE_CONNECT_URL stop

# Force stop
browse --ws $BROWSERBASE_CONNECT_URL stop --force
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
browse --ws $BROWSERBASE_CONNECT_URL fill @0-1 "user@example.com"
browse --ws $BROWSERBASE_CONNECT_URL fill @0-2 "mypassword"
browse --ws $BROWSERBASE_CONNECT_URL click @0-3
```

## Best Practices

### 1. Always snapshot after navigation
```bash
browse --ws $BROWSERBASE_CONNECT_URL open https://example.com
browse --ws $BROWSERBASE_CONNECT_URL snapshot -c  # Get refs
```

### 2. Re-snapshot after actions that change the page
```bash
browse --ws $BROWSERBASE_CONNECT_URL click @0-5
browse --ws $BROWSERBASE_CONNECT_URL snapshot -c  # Get new state
```

### 3. Use refs instead of selectors
```bash
# ✅ Good: Use refs from snapshot
browse --ws $BROWSERBASE_CONNECT_URL click @0-5

# ❌ Avoid: Manual selectors (refs are more reliable)
browse --ws $BROWSERBASE_CONNECT_URL click "#submit-button"
```

### 4. Wait for elements when needed
```bash
browse --ws $BROWSERBASE_CONNECT_URL open https://slow-site.com
browse --ws $BROWSERBASE_CONNECT_URL wait selector ".content" -s visible
browse --ws $BROWSERBASE_CONNECT_URL snapshot -c
```

### 5. Always use --ws $BROWSERBASE_CONNECT_URL
```bash
# ✅ Correct: Remote browser (connects to pre-created Browserbase session)
browse --ws $BROWSERBASE_CONNECT_URL open https://example.com

# ❌ Wrong: Local browser (will fail in evals, launches Chrome locally)
browse open https://example.com
```

## Common Patterns

### Login Flow
```bash
browse --ws $BROWSERBASE_CONNECT_URL open https://example.com/login
browse --ws $BROWSERBASE_CONNECT_URL snapshot -c
# [0-5] textbox "Email"
# [0-6] textbox "Password"
# [0-7] button "Sign In"
browse --ws $BROWSERBASE_CONNECT_URL fill @0-5 "user@example.com"
browse --ws $BROWSERBASE_CONNECT_URL fill @0-6 "password123"
browse --ws $BROWSERBASE_CONNECT_URL click @0-7
browse --ws $BROWSERBASE_CONNECT_URL wait load
browse --ws $BROWSERBASE_CONNECT_URL snapshot -c  # Verify logged in
```

### Search and Extract
```bash
browse --ws $BROWSERBASE_CONNECT_URL open https://example.com
browse --ws $BROWSERBASE_CONNECT_URL snapshot -c
# [0-3] textbox "Search"
browse --ws $BROWSERBASE_CONNECT_URL fill @0-3 "my query"
browse --ws $BROWSERBASE_CONNECT_URL wait selector ".results"
browse --ws $BROWSERBASE_CONNECT_URL snapshot -c
# [1-0] text "Result 1"
# [1-1] text "Result 2"
browse --ws $BROWSERBASE_CONNECT_URL get text @1-0
browse --ws $BROWSERBASE_CONNECT_URL get text @1-1
```

### Multi-Page Navigation
```bash
browse --ws $BROWSERBASE_CONNECT_URL open https://example.com
browse --ws $BROWSERBASE_CONNECT_URL snapshot -c
# [0-5] link "Next Page"
browse --ws $BROWSERBASE_CONNECT_URL click @0-5
browse --ws $BROWSERBASE_CONNECT_URL wait load
browse --ws $BROWSERBASE_CONNECT_URL snapshot -c  # Get new page structure
```

## Troubleshooting

### Browser won't start
- Check that `browse` is installed: `which browse`
- Check status: `browse --ws $BROWSERBASE_CONNECT_URL status`
- Force stop and retry: `browse --ws $BROWSERBASE_CONNECT_URL stop`

### Element not found
- Take a snapshot to verify refs: `browse --ws $BROWSERBASE_CONNECT_URL snapshot -c`
- Wait for element to appear: `browse --ws $BROWSERBASE_CONNECT_URL wait selector ...`
- Check if ref changed after page update

### Page not loading
- Increase timeout: `browse --ws $BROWSERBASE_CONNECT_URL open <url> --timeout 60000`
- Wait for load state: `browse --ws $BROWSERBASE_CONNECT_URL wait load networkidle`

### Commands failing with "session not found"
- The daemon auto-recovers from crashes
- If issues persist: `browse --ws $BROWSERBASE_CONNECT_URL stop --force && browse --ws $BROWSERBASE_CONNECT_URL open <url>`

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
