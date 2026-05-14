# Browserbase Functions Reference

## Table of Contents

- [Invoking Deployed Functions](#invoking-deployed-functions)
- [Common Patterns](#common-patterns)
- [Troubleshooting](#troubleshooting)

## Invoking Deployed Functions

### Via CLI

```bash
bb functions invoke FUNCTION_ID --params '{"url": "https://example.com"}'
bb functions invoke FUNCTION_ID --params '{"url": "https://example.com"}' --no-wait
bb functions invoke --check-status INVOCATION_ID
```

If `bb` is not installed: `npm install -g @browserbasehq/cli`

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

## Troubleshooting

### "Missing API key"
```bash
# Check .env file has credentials
cat .env

# Or set for current shell
export BROWSERBASE_API_KEY="your_key"
export BROWSERBASE_PROJECT_ID="your_project"
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
