---
name: functions
description: "Deploy serverless browser automation as cloud functions using Browserbase. Use when the user wants to deploy browser automation to run on a schedule or cron, create a webhook endpoint for browser tasks, run automation in the cloud instead of locally, or asks about Browserbase Functions."
compatibility: "Requires the browse CLI (`npm install -g browse`), Node.js 18+ with pnpm or npm, and BROWSERBASE_API_KEY."
license: MIT
allowed-tools: Bash Read Write Edit
---

# Browserbase Functions

Deploy serverless browser automation using the official `browse` CLI.

## Prerequisites

Get an API key from: https://browserbase.com/settings

```bash
export BROWSERBASE_API_KEY="your_api_key"
```

## Creating a Function Project

### 1. Initialize

```bash
browse functions init my-function
cd my-function
```

This creates:
```
my-function/
├── package.json
├── index.ts        # Your function code
└── .env            # Add credentials here
```

### 2. Add Credentials to .env

```bash
echo "BROWSERBASE_API_KEY=$BROWSERBASE_API_KEY" >> .env
```

### 3. Install Dependencies

```bash
pnpm install
```

## Function Structure

```typescript
import { defineFn } from "@browserbasehq/sdk-functions";
import { chromium } from "playwright-core";

defineFn("my-function", async (context) => {
  const { session, params } = context;

  // Connect to browser
  const browser = await chromium.connectOverCDP(session.connectUrl);
  const page = browser.contexts()[0]!.pages()[0]!;

  // Your automation
  await page.goto(params.url || "https://example.com");
  const title = await page.title();

  // Return JSON-serializable result
  return { success: true, title };
});
```

**Key objects:**
- `context.session.connectUrl` - CDP endpoint to connect Playwright
- `context.params` - Input parameters from invocation

## Development Workflow

### 1. Start Dev Server

```bash
browse functions dev index.ts
```

Server runs at `http://127.0.0.1:14113`

### 2. Test Locally

```bash
curl -X POST http://127.0.0.1:14113/v1/functions/my-function/invoke \
  -H "Content-Type: application/json" \
  -d '{"params": {"url": "https://news.ycombinator.com"}}'
```

### 3. Iterate

The dev server auto-reloads on file changes. Use `console.log()` for debugging - output appears in the terminal.

## Deploying

```bash
browse functions publish index.ts
```

Output:
```
Function published successfully
Build ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
Function ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

**Save the Function ID** - you need it to invoke.

## Quick Reference

| Command | Description |
|---------|-------------|
| `browse functions init <name>` | Create new project |
| `browse functions dev <file>` | Start local dev server |
| `browse functions publish <file>` | Deploy to Browserbase |

For invocation examples, common patterns, and troubleshooting, see [REFERENCE.md](REFERENCE.md).
