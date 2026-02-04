---
name: Browser Automation
description: Automate web browser interactions using natural language via CLI commands. Use when the user asks to browse websites, navigate web pages, extract data from websites, take screenshots, fill forms, click buttons, or interact with web applications. Triggers include "browse", "navigate to", "go to website", "extract data from webpage", "screenshot", "web scraping", "fill out form", "click on", "search for on the web". When taking actions be as specific as possible.
allowed-tools: Bash
---

# Browser Automation

Automate browser interactions using Stagehand CLI with Claude. This skill provides natural language control over a Chrome browser through command-line tools for navigation, interaction, data extraction, and screenshots.

## Overview

This skill uses a CLI-based approach where Claude Code calls browser automation commands via bash. The browser stays open between commands for faster sequential operations and preserves browser state (cookies, sessions, etc.).

## Setup Verification

**IMPORTANT: Before using any browser commands, you MUST check setup.json in this directory.**

### First-Time Setup Check

1. **Read `setup.json`** (located in `.claude/skills/browser-automation/setup.json`)
2. **Check `setupComplete` field**:
   - If `true`: All prerequisites are met, proceed with browser commands
   - If `false`: Setup required - follow the steps below

### If Setup is Required (`setupComplete: false`)

Run these commands in the plugin directory:

```bash
# 1. Install dependencies and build (REQUIRED)
# This automatically builds TypeScript
npm install
# or: pnpm install
# or: bun install

# 2. Link the browser command globally (REQUIRED)
npm link

# 3. Configure API key (REQUIRED)
# Option 1 (RECOMMENDED): Export in your terminal
export ANTHROPIC_API_KEY="your-api-key-here"

# Option 2: Or use .env file
cp .env.example .env
# Then edit .env and add: ANTHROPIC_API_KEY="your-api-key-here"

# 4. Verify Chrome is installed
# Chrome should be at standard location for your OS

# 5. Test the installation
browse navigate https://example.com

# 6. If test succeeds, update setup.json
# Set all "installed"/"configured" fields to true
# Set "setupComplete" to true
```

### Prerequisites Summary

- ✅ Google Chrome installed on your system
- ✅ Node.js dependencies installed and TypeScript built (`npm install` runs build automatically)
- ✅ Browser command globally available (`npm link` creates the global symlink)
- ✅ Anthropic API key configured (exported as `ANTHROPIC_API_KEY` environment variable or in `.env` file)

**DO NOT attempt to use browser commands if `setupComplete: false` in setup.json. Guide the user through setup first.**

## Available Commands

### Navigate to URLs
```bash
browse navigate <url>
```

**When to use**: Opening any website, loading a specific URL, going to a web page.

**Example usage**:
- `browse navigate https://example.com`
- `browse navigate https://news.ycombinator.com`

**Output**: JSON with success status, message, and screenshot path

### Interact with Pages
```bash
browse act "<action>"
```

**When to use**: Clicking buttons, filling forms, scrolling, selecting options, typing text.

**Example usage**:
- `browse act "click the Sign In button"`
- `browse act "fill in the email field with test@example.com"`
- `browse act "scroll down to the footer"`
- `browse act "type 'laptop' in the search box and press enter"`

**Important**: Be as specific as possible - details make a world of difference. When filling fields, you don't need to combine 'click and type'; the tool will perform a fill similar to Playwright's fill function.

**Output**: JSON with success status, message, and screenshot path

### Extract Data
```bash
browse extract "<instruction>" ['{"field": "type"}']
```

**When to use**: Scraping data, getting specific information, collecting structured content.

**Schema format** (optional): JSON object where keys are field names and values are types:
- `"string"` for text
- `"number"` for numeric values
- `"boolean"` for true/false values

**Note**: The schema parameter is optional. If omitted or if schema validation fails, extraction will proceed without type validation.

**Example usage**:
- `browse extract "get the product title and price" '{"title": "string", "price": "number"}'`
- `browse extract "get all article headlines" '{"headlines": "string"}'`
- `browse extract "get the page title"` (no schema)

**Output**: JSON with success status, extracted data, and screenshot path

### Discover Elements
```bash
browse observe "<query>"
```

**When to use**: Understanding page structure, finding what's clickable, discovering form fields.

**Example usage**:
- `browse observe "find all clickable buttons"`
- `browse observe "find all form fields"`
- `browse observe "find all navigation links"`

**Output**: JSON with success status, discovered elements, and screenshot path

### Take Screenshots
```bash
browse screenshot
```

**When to use**: Visual verification, documenting page state, debugging, creating records.

**Notes**:
- Screenshots are saved to the plugin directory's `agent/browser_screenshots/` folder
- Images larger than 2000x2000 pixels are automatically resized
- Filename includes timestamp for uniqueness

**Output**: JSON with success status and screenshot path

### Clean Up
```bash
browse close
```

**When to use**: After completing all browser interactions, to free up resources.

**Output**: JSON with success status and message

## Browser Behavior

**Persistent Browser**: The browser stays open between commands for faster sequential operations and to preserve browser state (cookies, sessions, etc.).

**Reuse Existing**: If Chrome is already running on port 9222, it will reuse that instance.

**Minimized Launch**: Chrome opens off-screen (position -9999,-9999) to avoid disrupting workflow.

**Safe Cleanup**: The browser only closes when you explicitly call the `close` command.

## Best Practices

1. **Always navigate first**: Before interacting with a page, navigate to the URL
2. **📸 Always view screenshots**: After each command (navigate, act, extract, observe), use the Read tool to view the screenshot and verify the command worked correctly
3. **Use natural language**: Describe actions as you would instruct a human
4. **Extract with clear schemas**: Define field names and types explicitly in JSON
5. **Handle errors gracefully**: Check the `success` field in JSON output; if an action fails, view the screenshot and try using `observe` to understand the page better
6. **Close when done**: Always clean up browser resources after completing tasks
7. **Be specific**: Use precise selectors in natural language ("the blue Submit button" vs "the button")
8. **Chain commands**: Run multiple commands sequentially without reopening the browser

## Common Patterns

### Simple browsing task
```bash
browse navigate https://example.com
browse act "click the login button"
browse screenshot
browse close
```

### Data extraction task
```bash
browse navigate https://example.com/products
browse act "wait for page to load"
browse extract "get all products" '{"name": "string", "price": "number"}'
# Or without schema:
# browse extract "get the page content"
browse close
```

### Multi-step interaction
```bash
browse navigate https://example.com/login
browse act "fill in email with user@example.com"
browse act "fill in password with mypassword"
browse act "click the submit button"
browse screenshot
browse close
```

### Debugging workflow
```bash
browse navigate https://example.com
browse screenshot
browse observe "find all buttons"
browse act "click the specific button"
browse screenshot
browse close
```

## Troubleshooting

**Page not loading**: Wait a few seconds after navigation before acting. You can explicitly: `browse act "wait for the page to fully load"`

**Element not found**: Use `observe` to discover what elements are actually available on the page

**Action fails**: Be more specific in natural language description. Instead of "click the button", try "click the blue Submit button in the form"

**Screenshots missing**: Check the plugin directory's `agent/browser_screenshots/` folder for saved files

**Chrome not found**: Install Google Chrome or the CLI will show an error with installation instructions

**Port 9222 in use**: Another Chrome debugging session is running. Close it or wait for timeout

For detailed examples, see [EXAMPLES.md](EXAMPLES.md).
For API reference and technical details, see [REFERENCE.md](REFERENCE.md).

## Dependencies

To use this skill, install these dependencies only if they aren't already present:

```bash
npm install
# or
pnpm install
# or
bun install
```
