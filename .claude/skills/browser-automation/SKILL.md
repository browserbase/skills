---
name: browse
description: Browser automation CLI for AI agents - create, test, and deploy web automations
---

# Browse - Browser Automation CLI

Browser automation CLI for AI agents. Create, test, and deploy web automations using the `browse` CLI.

## Setup (Run First!)

Before using this skill, install the required CLIs:

```bash
npm install -g @browserbasehq/browse-cli @browserbasehq/sdk-functions
```

Set your credentials:
```bash
export BROWSERBASE_API_KEY="your_api_key"
export BROWSERBASE_PROJECT_ID="your_project_id"
```

Get credentials from: https://browserbase.com/settings

## When to Use

Use this skill when:
- User wants to automate a website task
- User needs to scrape data from a site
- User wants to create a Browserbase Function
- Starting from scratch on a new automation

## Workflow

### 1. Understand the Goal

Ask clarifying questions:
- What website/URL are you automating?
- What's the end goal (extract data, submit forms, monitor changes)?
- Does it require authentication?
- Should this run on a schedule or on-demand?

### 2. Explore the Site Interactively

Start a local browser session to understand the site structure:

```bash
browse open https://example.com
```

Use snapshot to understand the DOM:
```bash
browse snapshot
```

Take screenshots to see the visual layout:
```bash
browse screenshot exploration.png
```

### 3. Identify Key Elements

For each step of the automation, identify:
- Selectors for interactive elements
- Wait conditions needed
- Data to extract

Use the accessibility tree refs to understand element relationships:
```
[@0-5] button: "Submit"
[@0-6] textbox: "Email"
[@0-7] textbox: "Password"
```

### 4. Test Interactions Manually

Before writing code, verify each step works:

```bash
browse fill @0-6 "test@example.com"
browse fill @0-7 "password123"
browse click @0-5
browse wait load networkidle
browse snapshot
```

### 5. Enable Network Capture (if needed)

For API-based automations or debugging:
```bash
browse network on
# perform actions
browse network path
# inspect captured requests in the directory
```

### 6. Create the Function

Once you understand the flow, create a full function project:

```bash
pnpm dlx @browserbasehq/sdk-functions init my-automation
cd my-automation
```

This creates a complete project with:
- `package.json` with dependencies
- `.env` for credentials
- `tsconfig.json`
- `index.ts` template

Edit `index.ts` with your automation logic:

```typescript
import { defineFn } from "@browserbasehq/sdk-functions";
import { chromium } from "playwright-core";

defineFn("my-automation", async (context) => {
  const { session } = context;
  const browser = await chromium.connectOverCDP(session.connectUrl);
  const page = browser.contexts()[0]!.pages()[0]!;

  // Your automation steps here
  await page.goto("https://example.com");
  await page.fill('input[name="email"]', context.params.email);
  await page.click('button[type="submit"]');
  
  // Extract and return data
  const result = await page.textContent('.result');
  return { success: true, result };
});
```

### 7. Test Locally

Start the local development server:
```bash
pnpm bb dev index.ts
```

Then invoke locally via curl:
```bash
curl -X POST http://127.0.0.1:14113/v1/functions/my-automation/invoke \
  -H "Content-Type: application/json" \
  -d '{"params": {"email": "test@example.com"}}'
```

### 8. Deploy to Browserbase

When ready for production:
```bash
pnpm bb publish index.ts
```

### 9. Test Production

Invoke the deployed function via API:
```bash
curl -X POST https://api.browserbase.com/v1/functions/<function-id>/invoke \
  -H "Content-Type: application/json" \
  -H "x-bb-api-key: $BROWSERBASE_API_KEY" \
  -d '{"params": {"email": "test@example.com"}}'
```

## Best Practices

### Selectors
- Prefer data attributes (`data-testid`) over CSS classes
- Use text content as fallback (`text=Submit`)
- Avoid fragile selectors like nth-child

### Waiting
- Always wait for navigation/network after clicks
- Use `waitForSelector` for dynamic content
- Set reasonable timeouts

### Error Handling
- Wrap risky operations in try/catch
- Return structured error information
- Log intermediate steps for debugging

### Data Extraction
- Use `page.evaluate()` for complex extraction
- Validate extracted data before returning
- Handle missing elements gracefully

## Example: E-commerce Price Monitor

```typescript
defineFn("price-monitor", async (context) => {
  const { session, params } = context;
  const browser = await chromium.connectOverCDP(session.connectUrl);
  const page = browser.contexts()[0]!.pages()[0]!;

  await page.goto(params.productUrl);
  await page.waitForSelector('.price');

  const price = await page.evaluate(() => {
    const el = document.querySelector('.price');
    return el?.textContent?.replace(/[^0-9.]/g, '');
  });

  return {
    url: params.productUrl,
    price: parseFloat(price || '0'),
    timestamp: new Date().toISOString(),
  };
});
```