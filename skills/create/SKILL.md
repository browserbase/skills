---
name: browserbase-create
description: Guide Claude through creating new browser automation scripts using the stagehand CLI
---

# Create Automation Skill

Guide Claude through creating new browser automation scripts using the `stagehand` CLI.

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
stagehand session create --local
stagehand goto https://example.com
```

Use snapshot to understand the DOM:
```bash
stagehand snapshot
```

Take screenshots to see the visual layout:
```bash
stagehand screenshot -o exploration.png
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
stagehand fill @0-6 "test@example.com"
stagehand fill @0-7 "password123"
stagehand click @0-5
stagehand wait networkidle
stagehand snapshot
```

### 5. Enable Network Capture (if needed)

For API-based automations or debugging:
```bash
stagehand network on
# perform actions
stagehand network list
stagehand network show 0
```

### 6. Create the Function

Once you understand the flow, create a full function project:

```bash
stagehand fn init my-automation
cd my-automation
```

This creates a complete project with:
- `package.json` with dependencies
- `.env` with credentials (from `~/.stagehand/config.json` if available)
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
# or: stagehand fn dev index.ts
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
# or: stagehand fn publish index.ts
```

### 9. Test Production

Invoke the deployed function:
```bash
stagehand fn invoke <function-id> -p '{"email": "test@example.com"}'
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
