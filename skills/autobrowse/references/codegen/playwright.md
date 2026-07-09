# Playwright codegen reference

Spec for the `playwright.ts` file an outer agent writes when codegenning a
runnable script from a converged autobrowse trace. The outer agent should
read this file, draft the script with the `Write` tool, then verify it with
`Bash` (`npm install && npx tsx playwright.ts`) against a fresh Browserbase
session — iterating on failure using its own judgment.

The companion file is `references/playwright-cdp-bridge.md`, which has the
canonical create-session / connectOverCDP / release dance. Read that too.

## Hard constraints

- **Self-contained.** Runs with only `BROWSERBASE_API_KEY` in the env. No
  reliance on autobrowse state, no reading from workspace files.
- **CDP attach, never `chromium.launch()`.** Follow the cdp-bridge reference
  verbatim for create-session / `connectOverCDP` / release.
- **No `browser.close()`.** Release the session via
  `browse cloud sessions update <id> --status REQUEST_RELEASE` in `finally`.
  `browser.close()` on a `connectOverCDP` attachment tears down the remote
  session prematurely.
- **Final stdout line is JSON.** Emit `{"success":true,"data":...}` on
  success or `{"success":false,"error":"..."}` on failure as the last line
  on stdout. The verify command parses the trailing JSON line — don't emit
  any other JSON-looking lines after it.
- **Snap on errors.** Wrap `main()` in
  `try { … } catch (err) { await snap(page, '99-error'); throw err; }`.
  `snap` honors `process.env.SCREENSHOT_DIR` and is a no-op when unset.
- **Locator priority:** `data-testid` → role + accessible name → id → text
  → xpath. Prefer Playwright's auto-waiting (`locator.click()`,
  `locator.fill()`) over explicit sleeps.
- **Use the descriptor data when available.** Each `descriptors.ndjson`
  entry from the trace describes the actual DOM target the agent interacted
  with — pick locators from those `attributes` / `role` / `accessibleName`
  fields rather than inventing them.
- **Use the trace's network signals.** Where the unified events show a slow
  XHR after an action, insert `page.waitForResponse(...)` rather than
  arbitrary sleeps.

## Output schema

Define a Zod schema mirroring the `# Output` section of `task.md`, and
validate the extracted data through it before printing the final
`success: true` line.

## Imports

```typescript
import { chromium, type Browser, type Page } from "playwright";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { z } from "zod";
import "dotenv/config";
```

Only `playwright`, `zod`, `dotenv`, and `tsx` should appear in
`package.json`. Don't add other runtime deps.

## Scaffold

Write `package.json` alongside `playwright.ts` (in the same directory):

```json
{
  "name": "<task>-playwright",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": { "start": "tsx playwright.ts" },
  "dependencies": {
    "dotenv": "16.4.5",
    "playwright": "1.50.0",
    "tsx": "4.22.3",
    "zod": "4.4.3"
  }
}
```

And `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

**Install with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`** — we always connect
over CDP to a remote Browserbase session, so the bundled chromium download
is pure waste (and the sandbox's network allowlist blocks the CDN anyway).

```bash
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --silent --no-audit --no-fund
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npx tsx playwright.ts
```

## Verify contract

Run the script against a fresh Browserbase session and read the trailing
JSON line on stdout. Pass if `success === true`; fail otherwise. On
failure, feed the stderr tail back into your next attempt and iterate.

## When the workflow is HTTP-only

If the trace shows the task can be accomplished via HTTP requests with no
DOM interaction (api / fetch / url-param `recommended_method`), use
Playwright's `request` API instead of opening a browser:

```typescript
import { request, type APIRequestContext } from "playwright";

async function main() {
  const ctx = await request.newContext({
    extraHTTPHeaders: { "user-agent": "..." },
  });
  const res = await ctx.get("https://example.com/api/foo");
  // ... parse, validate via Zod, emit success line ...
}
```

You still emit the same trailing JSON success/failure line. No
`connectOverCDP`, no session, no `snap`.
