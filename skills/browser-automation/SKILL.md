# Browser Automation Skill

Automate web browser interactions using the `stagehand` CLI for AI agents.

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
- **Daemon architecture** - Browser state persists between commands
- **Element references** - Snapshot creates refs like `@0-5` for easy clicking
- **Execute command** - Batch multiple operations in one turn (RECOMMENDED for multi-step tasks)
- **Multiple sessions** - Run parallel browser instances
- **Self-healing** - Auto-recovers from crashes
- **Environment modes** - LOCAL (your machine) or BROWSERBASE (remote cloud browser)

## Environment Selection

The CLI automatically detects which browser environment to use:

- **BROWSERBASE (remote cloud)** - Used when `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID` environment variables are set
- **LOCAL (your machine)** - Used when Browserbase credentials are not present

You can override auto-detection with the `--env` flag:

```bash
# Force local browser (on your machine)
stagehand --env LOCAL open https://example.com

# Force remote browser (Browserbase cloud)
stagehand --env BROWSERBASE open https://example.com
```

**When to use `--env BROWSERBASE`:**
- Running in CI/CD pipelines
- Need browser recordings for debugging
- Want residential proxies or stealth mode
- Testing across different geographies

**When to use `--env LOCAL`:**
- Rapid local development
- Need to see the browser visually (`--headed`)
- Testing on your specific machine configuration

## Performance Tip: Use Execute for Multi-Step Tasks

For workflows requiring multiple operations, use `stagehand execute` to batch them together. This reduces turns by 70-85% and prevents timeout issues.

**When to use execute:**
- Multi-step navigation (open → click → extract)
- Form workflows (fill multiple fields → submit → verify)
- Data extraction from multiple elements
- Any task requiring 3+ individual commands

## ⚠️ IMPORTANT: Always Use Browserbase

**ALL stagehand commands MUST include `--env BROWSERBASE` flag:**

```bash
stagehand --env BROWSERBASE open https://example.com
stagehand --env BROWSERBASE snapshot -c
stagehand --env BROWSERBASE stop
```

This ensures browser automation runs in the cloud (Browserbase) instead of locally.

## Quick Start

### Batched Approach (⭐ RECOMMENDED - Use for all tasks)

```bash
# Execute multiple operations in one turn - THIS IS THE DEFAULT APPROACH
stagehand --env BROWSERBASE execute '
  // Navigate and wait
  await page.goto("https://example.com");
  await page.waitForLoadState("domcontentloaded");

  // Extract data
  const data = await page.evaluate(() => ({
    title: document.title,
    links: Array.from(document.querySelectorAll("a")).map(a => a.textContent)
  }));

  return data;
'

# Stop browser when done
stagehand --env BROWSERBASE stop
```

### Simple Approach (Only for single operations)

```bash
# Use individual commands ONLY for simple 1-operation tasks
# For anything more complex, use execute above

# Navigate to a URL (browser starts automatically)
stagehand --env BROWSERBASE open https://example.com

# Get page structure with element refs
stagehand --env BROWSERBASE snapshot -c

# Click an element by ref
stagehand --env BROWSERBASE click @0-5

# Stop browser when done
stagehand --env BROWSERBASE stop
```

## Common Commands

### Navigation

```bash
# Open URL
stagehand --env BROWSERBASE open https://example.com
stagehand --env BROWSERBASE open https://example.com --wait networkidle --timeout 60000

# Browser history
stagehand --env BROWSERBASE reload
stagehand --env BROWSERBASE back
stagehand --env BROWSERBASE forward
```

### Page Inspection

```bash
# Get accessibility tree with element refs
stagehand --env BROWSERBASE snapshot
stagehand --env BROWSERBASE snapshot -c  # Compact output (tree only)

# Take screenshot
stagehand --env BROWSERBASE screenshot ./page.png
stagehand --env BROWSERBASE screenshot --full-page

# Get page info
stagehand get url
stagehand get title
stagehand get text @0-5
stagehand get html @0-5
```

### Interactions

```bash
# Click elements
stagehand --env BROWSERBASE click @0-5          # Click by ref
stagehand click_xy 100 200    # Click at coordinates

# Fill forms
stagehand fill @0-6 "value"          # Fill and press Enter
stagehand fill @0-6 "value" --no-press-enter

# Type text and press keys
stagehand type "Hello world"
stagehand press Enter
stagehand press "Cmd+A"

# Select options
stagehand select @0-8 value1 value2
```

### Waiting

```bash
# Wait for page load
stagehand wait load
stagehand wait load networkidle

# Wait for element
stagehand wait selector @0-5
stagehand wait selector ".button" --state visible --timeout 10000

# Wait fixed time
stagehand wait timeout 2000
```

### Multi-Tab

```bash
# List tabs
stagehand pages

# Create new tab
stagehand newpage https://example.com

# Switch tabs
stagehand tab_switch 0

# Close tab
stagehand tab_close 1
```

### Sessions

```bash
# Multiple browser sessions
BROWSE_SESSION=session1 stagehand open https://google.com
BROWSE_SESSION=session2 stagehand open https://github.com

# Or use --session flag
stagehand --session work open https://slack.com
```

## Workflow Patterns

### Pattern 1: Simple Single-Step Tasks (Individual Commands)

Use individual commands for simple 1-2 operation tasks:

```bash
# Navigate
stagehand --env BROWSERBASE open https://example.com

# Get element refs
stagehand --env BROWSERBASE snapshot -c

# Click
stagehand --env BROWSERBASE click @0-2

# Stop
stagehand --env BROWSERBASE stop
```

### Pattern 2: Multi-Step Tasks (Execute - RECOMMENDED)

Use execute for tasks requiring 3+ operations:

```bash
stagehand execute '
  // 1. Navigate and explore
  await page.goto("https://example.com");
  await page.waitForLoadState("domcontentloaded");

  // 2. Interact with elements
  await page.deepLocator("button.sign-in").click();
  await page.waitForLoadState("domcontentloaded");

  // 3. Extract data
  const data = await page.evaluate(() => ({
    title: document.title,
    url: location.href,
    hasLoginForm: !!document.querySelector("form[action*=\"login\"]")
  }));

  // 4. Return results
  return data;
'
```

### Pattern 3: Complex Navigation + Data Extraction

```bash
stagehand execute '
  // Navigate to target page
  await page.goto("https://example.com/products");
  await page.waitForLoadState("domcontentloaded");

  // Find and click category
  const categoryLink = page.deepLocator("a:has-text(\"Electronics\")");
  await categoryLink.click();
  await page.waitForLoadState("domcontentloaded");

  // Extract product data
  const products = await page.evaluate(() => {
    return Array.from(document.querySelectorAll(".product")).map(p => ({
      name: p.querySelector(".product-name")?.textContent,
      price: p.querySelector(".product-price")?.textContent,
      inStock: p.querySelector(".in-stock") !== null
    }));
  });

  return {
    category: "Electronics",
    productCount: products.length,
    products: products.slice(0, 10) // First 10
  };
'
```

### Pattern 4: Form Submission Workflow

```bash
stagehand execute '
  // Fill multiple form fields
  await page.deepLocator("input[name=\"username\"]").fill("testuser");
  await page.deepLocator("input[name=\"email\"]").fill("test@example.com");
  await page.deepLocator("textarea[name=\"message\"]").fill("Hello world");

  // Submit form
  await page.deepLocator("button[type=\"submit\"]").click();
  await page.waitForLoadState("domcontentloaded");

  // Verify submission
  const success = await page.evaluate(() => {
    const successMsg = document.querySelector(".success-message");
    return {
      submitted: !!successMsg,
      message: successMsg?.textContent,
      url: location.href
    };
  });

  return success;
'
```

## Advanced Features

### Network Capture

```bash
# Enable network monitoring
stagehand network on

# Captured requests go to filesystem
stagehand network path

# Clear captured data
stagehand network clear

# Disable capture
stagehand network off
```

### Coordinate Actions

```bash
# Hover at coordinates
stagehand hover 100 200

# Scroll at coordinates
stagehand scroll 100 200 0 500

# Drag from one point to another
stagehand drag 100 100 200 200 --steps 20
```

### JavaScript Evaluation

```bash
# Run JavaScript in browser context (limited)
stagehand eval "document.title"
stagehand eval "Array.from(document.querySelectorAll('a')).map(a => a.href)"
```

### Execute Node.js Code (Recommended)

Execute Node.js code with full Stagehand API access. Use this for multi-step workflows.

```bash
# Simple execution
stagehand execute 'return { url: page.url(), title: await page.title() }'

# Complex workflow
stagehand execute '
  // Navigate
  await page.goto("https://example.com");
  await page.waitForLoadState("domcontentloaded");

  // Interact with page
  await page.deepLocator("input[name=\"search\"]").fill("query");
  await page.deepLocator("button[type=\"submit\"]").click();
  await page.waitForLoadState("domcontentloaded");

  // Extract results
  const results = await page.evaluate(() => {
    return Array.from(document.querySelectorAll(".result")).map(r => ({
      title: r.querySelector("h3")?.textContent,
      url: r.querySelector("a")?.href
    }));
  });

  return { results, count: results.length };
'
```

**Available in execute context:**
- `page` - Current browser page
- `context` - Browser context (for multi-page workflows)
- `stagehand` - Full Stagehand API (act, extract, observe, agent)

### Visual Cursor

```bash
# Enable cursor overlay for debugging
stagehand cursor
```

## Example: Search Workflow

```bash
# 1. Navigate to search page
stagehand --env BROWSERBASE open https://www.google.com

# 2. Get page structure
stagehand --env BROWSERBASE snapshot -c
# Output shows: [0-5] textbox: Search

# 3. Fill search box
stagehand fill @0-5 "stagehand browser automation"

# 4. Wait for results
stagehand wait load

# 5. Get results
stagehand --env BROWSERBASE snapshot -c

# 6. Take screenshot
stagehand --env BROWSERBASE screenshot search-results.png

# 7. Extract specific data
stagehand get text @1-3

# 8. Clean up
stagehand --env BROWSERBASE stop
```

## Example: Form Submission

```bash
# Navigate to form
stagehand --env BROWSERBASE open https://example.com/form

# Get form structure
stagehand --env BROWSERBASE snapshot -c
# Output: [0-10] textbox: Name
#         [0-11] textbox: Email
#         [0-12] button: Submit

# Fill fields
stagehand fill @0-10 "John Doe" --no-press-enter
stagehand fill @0-11 "john@example.com" --no-press-enter

# Submit
stagehand --env BROWSERBASE click @0-12

# Verify submission
stagehand wait load
stagehand get title
```

## Example: Multi-Page Scraping

```bash
# Open first page
stagehand --env BROWSERBASE open https://example.com/page1
stagehand --env BROWSERBASE snapshot -c
stagehand get text @0-5 > data1.txt

# Open second page in new tab
stagehand newpage https://example.com/page2
stagehand --env BROWSERBASE snapshot -c
stagehand get text @0-5 > data2.txt

# Switch back to first tab
stagehand tab_switch 0
stagehand get url
```

## Troubleshooting

### Browser Won't Start

```bash
# Check Chrome is installed
which google-chrome
# macOS: /Applications/Google Chrome.app/Contents/MacOS/Google Chrome

# Force stop stale daemon
stagehand stop --force
```

### Element Not Found

```bash
# Always snapshot first to get current refs
stagehand --env BROWSERBASE snapshot -c

# Refs expire when page changes - re-snapshot after navigation
stagehand --env BROWSERBASE open https://new-page.com
stagehand --env BROWSERBASE snapshot -c  # Get fresh refs
```

### Timeout Errors

```bash
# Increase timeout for slow pages
stagehand --env BROWSERBASE open https://slow-site.com --timeout 60000

# Wait for specific state
stagehand wait load networkidle
```

## Best Practices

1. ✅ **Use execute for multi-step tasks** - Reduces turns by 70-85%, prevents timeouts
2. ✅ **Batch related operations** - Combine navigate → interact → extract in one execute call
3. ✅ **Wait for page loads** - Always use `await page.waitForLoadState("domcontentloaded")`
4. ✅ **Extract data efficiently** - Use `page.evaluate()` to get multiple elements at once
5. ✅ **Use deepLocator for selectors** - More reliable than CSS selectors alone
6. ✅ **Return structured data** - Return objects with clear result structure
7. ✅ **Clean up sessions** - Run `stagehand stop` when done
8. ✅ **Handle errors gracefully** - Wrap complex operations in try/catch

### When to Use Individual Commands vs Execute

**Use individual commands:**
- Single operation (open one URL, take one screenshot)
- Quick debugging (check current page state)
- Simple verification (is element visible?)

**Use execute (RECOMMENDED):**
- Multi-step workflows (navigate → click → extract)
- Form submissions (fill multiple fields → submit → verify)
- Data extraction from multiple sources
- Any task requiring 3+ commands
- Complex interactions with waits and conditions

## Quick Reference

| Task | Command |
|------|---------|
| **Execute code** | `stagehand execute 'code'` ⭐ RECOMMENDED |
| Open URL | `stagehand open <url>` |
| Get elements | `stagehand snapshot -c` |
| Click element | `stagehand click @ref` |
| Fill form | `stagehand fill @ref "value"` |
| Get text | `stagehand get text @ref` |
| Screenshot | `stagehand screenshot file.png` |
| Wait for load | `stagehand wait load` |
| Stop browser | `stagehand stop` |

### Execute Command Examples

```bash
# Simple page info
stagehand execute 'return { url: page.url(), title: await page.title() }'

# Navigate and extract
stagehand execute '
  await page.goto("https://example.com");
  await page.waitForLoadState("domcontentloaded");
  return await page.evaluate(() => ({ title: document.title }));
'

# Multi-step workflow
stagehand execute '
  await page.deepLocator("button.menu").click();
  await page.waitForLoadState("domcontentloaded");
  const items = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".menu-item")).map(i => i.textContent)
  );
  return { items };
'
```

## Notes

- Browser auto-starts on first command
- State persists between commands (cookies, refs, etc.)
- Multiple sessions supported via `--session` flag
- All commands output JSON when using `--json` flag
- Daemon auto-recovers from crashes
- Commands timeout after 60 seconds by default
