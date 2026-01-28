---
name: browserbase-functions
description: Guide Claude through deploying serverless browser automation using the official bb CLI
---

# Browserbase Functions Skill

Guide Claude through deploying serverless browser automation using the official `bb` CLI.

## When to Use

Use this skill when:
- User wants to deploy automation to run on a schedule
- User needs a webhook endpoint for browser automation
- User wants to run automation in the cloud (not locally)
- User asks about Browserbase Functions

## Prerequisites

### 1. Get Credentials

Get API key and Project ID from: https://browserbase.com/settings

### 2. Set Environment Variables

Either store for reuse:
```bash
stagehand fn auth login
# Enter API key and Project ID when prompted
```

Then export for the current session:
```bash
eval "$(stagehand fn auth export)"
```

Or set directly:
```bash
export BROWSERBASE_API_KEY="your_api_key"
export BROWSERBASE_PROJECT_ID="your_project_id"
```

## Creating a Function Project

### 1. Initialize with Official CLI

```bash
pnpm dlx @browserbasehq/sdk-functions init my-function
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
# Copy from stored credentials
echo "BROWSERBASE_API_KEY=$BROWSERBASE_API_KEY" >> .env
echo "BROWSERBASE_PROJECT_ID=$BROWSERBASE_PROJECT_ID" >> .env
```

Or manually edit `.env`:
```
BROWSERBASE_API_KEY=your_api_key
BROWSERBASE_PROJECT_ID=your_project_id
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
pnpm bb dev index.ts
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

### Publish to Browserbase

```bash
pnpm bb publish index.ts
```

Output:
```
Function published successfully
Build ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
Function ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

**Save the Function ID** - you need it to invoke.

## Invoking Deployed Functions

### Via curl

```bash
# Start invocation
curl -X POST "https://api.browserbase.com/v1/functions/FUNCTION_ID/invoke" \
  -H "Content-Type: application/json" \
  -H "x-bb-api-key: $BROWSERBASE_API_KEY" \
  -d '{"params": {"url": "https://example.com"}}'

# Response: {"id": "INVOCATION_ID"}

# Poll for result
curl "https://api.browserbase.com/v1/functions/invocations/INVOCATION_ID" \
  -H "x-bb-api-key: $BROWSERBASE_API_KEY"
```

### Via Code

```typescript
async function invokeFunction(functionId: string, params: object) {
  // Start invocation
  const invokeRes = await fetch(
    `https://api.browserbase.com/v1/functions/${functionId}/invoke`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-bb-api-key': process.env.BROWSERBASE_API_KEY!,
      },
      body: JSON.stringify({ params }),
    }
  );
  const { id: invocationId } = await invokeRes.json();

  // Poll until complete
  while (true) {
    await new Promise(r => setTimeout(r, 5000));
    
    const statusRes = await fetch(
      `https://api.browserbase.com/v1/functions/invocations/${invocationId}`,
      { headers: { 'x-bb-api-key': process.env.BROWSERBASE_API_KEY! } }
    );
    const result = await statusRes.json();
    
    if (result.status === 'COMPLETED') return result.results;
    if (result.status === 'FAILED') throw new Error(result.error);
  }
}
```

## Common Patterns

### Parameterized Scraping

```typescript
defineFn("scrape", async ({ session, params }) => {
  const browser = await chromium.connectOverCDP(session.connectUrl);
  const page = browser.contexts()[0]!.pages()[0]!;
  
  await page.goto(params.url);
  await page.waitForSelector(params.selector);
  
  const items = await page.$$eval(params.selector, els => 
    els.map(el => el.textContent?.trim())
  );
  
  return { url: params.url, items };
});
```

### With Authentication

```typescript
defineFn("authenticated-action", async ({ session, params }) => {
  const browser = await chromium.connectOverCDP(session.connectUrl);
  const page = browser.contexts()[0]!.pages()[0]!;
  
  // Login
  await page.goto("https://example.com/login");
  await page.fill('[name="email"]', params.email);
  await page.fill('[name="password"]', params.password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard');
  
  // Do authenticated work
  const data = await page.textContent('.user-data');
  return { data };
});
```

### Error Handling

```typescript
defineFn("safe-scrape", async ({ session, params }) => {
  const browser = await chromium.connectOverCDP(session.connectUrl);
  const page = browser.contexts()[0]!.pages()[0]!;
  
  try {
    await page.goto(params.url, { timeout: 30000 });
    await page.waitForSelector(params.selector, { timeout: 10000 });
    
    const data = await page.textContent(params.selector);
    return { success: true, data };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
});
```

## CLI Reference

| Command | Description |
|---------|-------------|
| `pnpm dlx @browserbasehq/sdk-functions init <name>` | Create new project |
| `pnpm bb dev <file>` | Start local dev server |
| `pnpm bb publish <file>` | Deploy to Browserbase |

## Troubleshooting

### "Missing API key"
```bash
# Check credentials
stagehand fn auth status

# Set for current shell
eval "$(stagehand fn auth export)"

# Or add to .env in project directory
```

### Dev server won't start
```bash
# Make sure SDK is installed
pnpm add @browserbasehq/sdk-functions

# Or use npx
npx @browserbasehq/sdk-functions dev index.ts
```

### Function times out
- Max execution time is 15 minutes
- Add specific timeouts to page operations
- Use `waitForSelector` instead of sleep

### Can't connect to browser
- Check `session.connectUrl` is being used correctly
- Ensure you're using `chromium.connectOverCDP()` not `chromium.launch()`
