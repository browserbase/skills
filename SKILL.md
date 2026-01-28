---
name: browse
description: Complete guide for creating and deploying browser automation functions using the stagehand CLI
homepage: https://browserbase.com
metadata: {"moltbot":{"emoji":"🌐","requires":{"bins":["stagehand"],"env":["BROWSERBASE_API_KEY","BROWSERBASE_PROJECT_ID"]},"primaryEnv":"BROWSERBASE_API_KEY"}}
---

# Browser Automation & Functions Skill

Complete guide for creating and deploying browser automation functions using the `stagehand` CLI.

## When to Use

- User wants to automate a website task
- User needs to scrape data from a site
- User wants to create a Browserbase Function
- User wants to deploy automation to run on a schedule or via webhook

## Prerequisites

### Set Up Credentials

```bash
stagehand fn auth status  # Check if configured
stagehand fn auth login   # If needed - get credentials from https://browserbase.com/settings
```

## Complete Workflow

### Step 1: Explore the Site Interactively

Start a local browser session to understand the site structure:

```bash
stagehand session create --local
stagehand goto https://example.com
stagehand snapshot                    # Get DOM structure with refs
stagehand screenshot -o page.png      # Visual inspection
```

Test interactions manually:
```bash
stagehand click @0-5
stagehand fill @0-6 "value"
stagehand eval "document.querySelector('.price').textContent"
stagehand session end  # When done exploring
```

### Step 2: Initialize Function Project

```bash
stagehand fn init my-automation
cd my-automation
```

Creates:
- `package.json` - Dependencies
- `.env` - Credentials (from `~/.stagehand/config.json`)
- `index.ts` - Function template
- `tsconfig.json` - TypeScript config

### Step 3: ⚠️ FIX package.json IMMEDIATELY

**CRITICAL BUG**: `stagehand fn init` generates incomplete `package.json` that causes deployment to fail with "No functions were built."

**REQUIRED FIX** - Update `package.json` before doing anything else:

```json
{
  "name": "my-automation",
  "version": "1.0.0",
  "description": "My automation description",
  "main": "index.js",
  "type": "module",
  "packageManager": "pnpm@10.14.0",
  "scripts": {
    "dev": "pnpm bb dev index.ts",
    "publish": "pnpm bb publish index.ts"
  },
  "dependencies": {
    "@browserbasehq/sdk-functions": "^0.0.5",
    "playwright-core": "^1.58.0"
  },
  "devDependencies": {
    "@types/node": "^25.0.10",
    "typescript": "^5.9.3"
  }
}
```

**Key changes from generated file:**
- ✅ Add `description` and `main` fields
- ✅ Add `packageManager` field
- ✅ Change `"latest"` to pinned versions like `"^0.0.5"`
- ✅ Add `devDependencies` with TypeScript and types

Then install:
```bash
pnpm install
```

### Step 4: Write Automation Code

Edit `index.ts`:

```typescript
import { defineFn } from "@browserbasehq/sdk-functions";
import { chromium } from "playwright-core";

defineFn("my-automation", async (context) => {
  const { session, params } = context;
  console.log("Connecting to browser session:", session.id);

  const browser = await chromium.connectOverCDP(session.connectUrl);
  const page = browser.contexts()[0]!.pages()[0]!;

  // Your automation here
  await page.goto("https://example.com");
  await page.waitForLoadState("domcontentloaded");

  // Extract data
  const data = await page.evaluate(() => {
    // Complex extraction logic
    return Array.from(document.querySelectorAll('.item')).map(el => ({
      title: el.querySelector('.title')?.textContent,
      value: el.querySelector('.value')?.textContent,
    }));
  });

  // Return results (must be JSON-serializable)
  return {
    success: true,
    count: data.length,
    data,
    timestamp: new Date().toISOString(),
  };
});
```

**Key Concepts:**
- `context.session` - Browser session info (id, connectUrl)
- `context.params` - Input parameters from invocation
- Return JSON-serializable data
- 15 minute max execution time

### Step 5: Test Locally

Start dev server:
```bash
pnpm bb dev index.ts
```

Server runs at `http://127.0.0.1:14113`

Invoke with curl:
```bash
curl -X POST http://127.0.0.1:14113/v1/functions/my-automation/invoke \
  -H "Content-Type: application/json" \
  -d '{"params": {"url": "https://example.com"}}'
```

Dev server auto-reloads on file changes. Check terminal for logs.

### Step 6: Deploy to Browserbase

```bash
pnpm bb publish index.ts
# or: stagehand fn publish index.ts
```

**Expected output:**
```
✓ Build completed successfully
Build ID: xxx-xxx-xxx
Function ID: yyy-yyy-yyy  ← Save this!
```

**If you see "No functions were built"** → Your package.json is incomplete (see Step 3).

### Step 7: Test Production

```bash
stagehand fn invoke <function-id> -p '{"param": "value"}'
```

Or via API:
```bash
curl -X POST https://api.browserbase.com/v1/functions/<function-id>/invoke \
  -H "Content-Type: application/json" \
  -H "x-bb-api-key: $BROWSERBASE_API_KEY" \
  -d '{"params": {}}'
```

## Complete Working Example: Hacker News Scraper

```typescript
import { defineFn } from "@browserbasehq/sdk-functions";
import { chromium } from "playwright-core";

defineFn("hn-scraper", async (context) => {
  const { session } = context;
  console.log("Connecting to browser session:", session.id);

  const browser = await chromium.connectOverCDP(session.connectUrl);
  const page = browser.contexts()[0]!.pages()[0]!;

  await page.goto("https://news.ycombinator.com");
  await page.waitForLoadState("domcontentloaded");

  // Extract top 10 stories
  const stories = await page.evaluate(() => {
    const storyRows = Array.from(document.querySelectorAll('.athing')).slice(0, 10);

    return storyRows.map((row) => {
      const titleLine = row.querySelector('.titleline a');
      const subtext = row.nextElementSibling?.querySelector('.subtext');
      const commentsLink = Array.from(subtext?.querySelectorAll('a') || []).pop();

      return {
        rank: row.querySelector('.rank')?.textContent?.replace('.', '') || '',
        title: titleLine?.textContent || '',
        url: titleLine?.getAttribute('href') || '',
        points: subtext?.querySelector('.score')?.textContent?.replace(' points', '') || '0',
        author: subtext?.querySelector('.hnuser')?.textContent || '',
        time: subtext?.querySelector('.age')?.textContent || '',
        comments: commentsLink?.textContent?.replace(/\u00a0comments?/, '').trim() || '0',
        id: row.id,
      };
    });
  });

  return {
    success: true,
    count: stories.length,
    stories,
    timestamp: new Date().toISOString(),
  };
});
```

## Common Patterns

### Parameterized Scraping
```typescript
defineFn("scrape", async (context) => {
  const { session, params } = context;
  const { url, selector } = params;  // Accept params from invocation

  const browser = await chromium.connectOverCDP(session.connectUrl);
  const page = browser.contexts()[0]!.pages()[0]!;

  await page.goto(url);
  const data = await page.$$eval(selector, els =>
    els.map(el => el.textContent)
  );

  return { url, data };
});
```

### Authentication
```typescript
defineFn("auth-action", async (context) => {
  const { session, params } = context;
  const { username, password } = params;

  const browser = await chromium.connectOverCDP(session.connectUrl);
  const page = browser.contexts()[0]!.pages()[0]!;

  await page.goto("https://example.com/login");
  await page.fill('input[name="email"]', username);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard");

  const data = await page.textContent('.user-data');
  return { success: true, data };
});
```

### Multi-Page Workflow
```typescript
defineFn("multi-page", async (context) => {
  const { session, params } = context;
  const browser = await chromium.connectOverCDP(session.connectUrl);
  const page = browser.contexts()[0]!.pages()[0]!;

  const results = [];
  for (const url of params.urls) {
    await page.goto(url);
    await page.waitForLoadState("domcontentloaded");

    const title = await page.title();
    results.push({ url, title });
  }

  return { results };
});
```

## Troubleshooting

### 🔴 "No functions were built. Please check your entrypoint and function exports."

**This is the #1 error!**

**Cause:** Generated `package.json` from `stagehand fn init` is incomplete.

**Fix:**
1. Update `package.json` (see Step 3 above)
2. Add all required fields: `description`, `main`, `packageManager`
3. Change `"latest"` to pinned versions like `"^0.0.5"`
4. Add `devDependencies` section with TypeScript and types
5. Run `pnpm install`
6. Try deploying again

**Quick check:** Compare your `package.json` to `bitcoin-functions/package.json` in the codebase.

### Local dev server won't start

```bash
# Check credentials
stagehand fn auth status

# Re-login if needed
stagehand fn auth login

# Install SDK globally
pnpm add -g @browserbasehq/sdk-functions
```

### Function works locally but fails on deploy

**Common causes:**
1. Missing `devDependencies` (TypeScript won't compile)
2. Using `"latest"` instead of pinned versions
3. Missing required fields in `package.json`

**Solution:** Fix package.json as described in Step 3.

### Cannot extract data from page

1. Take screenshot: `stagehand screenshot -o debug.png`
2. Get snapshot: `stagehand snapshot`
3. Use `page.evaluate()` to log what's in the DOM
4. Check if selectors match actual HTML structure

### "Invocation timed out"

- Functions have 15 minute max
- Use specific waits instead of long sleeps
- Check if page is actually loading

## Best Practices

1. ✅ **Fix package.json immediately** after `stagehand fn init`
2. ✅ **Explore interactively first** - Use local browser session to understand site
3. ✅ **Test manually** - Verify each step works before writing code
4. ✅ **Test locally** - Use dev server before deploying
5. ✅ **Return meaningful data** - Include timestamps, counts, URLs
6. ✅ **Handle errors gracefully** - Try/catch around risky operations
7. ✅ **Use specific selectors** - Prefer data attributes over CSS classes
8. ✅ **Add logging** - `console.log()` helps debug deployed functions
9. ✅ **Validate parameters** - Check `params` before using
10. ✅ **Set reasonable timeouts** - Don't wait forever

## Quick Checklist

- [ ] Explore site with `stagehand session create --local`
- [ ] Test interactions manually
- [ ] Create project: `stagehand fn init <name>`
- [ ] **Fix package.json immediately** (Step 3)
- [ ] Run `pnpm install`
- [ ] Write automation in `index.ts`
- [ ] Test locally: `pnpm bb dev index.ts`
- [ ] Verify with curl
- [ ] Deploy: `pnpm bb publish index.ts`
- [ ] Test production: `stagehand fn invoke <function-id>`
- [ ] Save function ID

## Code Fix Needed (For Maintainers)

**File:** `/src/commands/functions.ts`
**Lines:** 146-158
**Function:** `initFunction()`

Replace the current `packageJson` object with:

```typescript
const packageJson = {
  name,
  version: '1.0.0',
  description: `${name} function`,
  main: 'index.js',
  type: 'module',
  packageManager: 'pnpm@10.14.0',
  scripts: {
    dev: 'pnpm bb dev index.ts',
    publish: 'pnpm bb publish index.ts',
  },
  dependencies: {
    '@browserbasehq/sdk-functions': '^0.0.5',
    'playwright-core': '^1.58.0',
  },
  devDependencies: {
    '@types/node': '^25.0.10',
    'typescript': '^5.9.3',
  },
};
```

This will eliminate the "No functions were built" error for all new projects.
