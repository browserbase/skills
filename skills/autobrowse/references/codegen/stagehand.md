# Stagehand codegen reference

Spec for the `stagehand.ts` file an outer agent writes when codegenning a
runnable script from a converged autobrowse trace. The outer agent should
read this file, draft the script with the `Write` tool, then verify it with
`Bash` (`npm install && npx tsx stagehand.ts`) against a fresh Browserbase
session — iterating on failure using its own judgment.

This targets **Stagehand v3** (`@browserbasehq/stagehand` 3.x). The v3 API
differs from older examples — follow the patterns below exactly.

## When NOT to write a Stagehand script

Stagehand fundamentally needs a browser session, so it doesn't fit
HTTP-only workflows. If `recommended_method` in metadata.json is `api`,
`mcp`, `fetch`, or `url-param`, skip Stagehand and ship only the Playwright
variant. Same for `cli`.

## Hard constraints

- **Self-contained.** Runs with `BROWSERBASE_API_KEY` and `ANTHROPIC_API_KEY`
  in the env.
- **Stagehand owns its own Browserbase session.** Construct it with
  `env: "BROWSERBASE"` and let it create the session — do NOT pre-create a
  session via the `browse` CLI and do NOT pass `browserbaseSessionID`.
- **Top-level `apiKey` is the Browserbase key, not the Anthropic key.** The
  project is inferred from it. There is no `browserbaseAPIKey` field. Using
  the Anthropic key as `apiKey` makes session lookup fail with a 404.
- **Get the page from `stagehand.context`, not `stagehand.page`.**
- **`act` and `extract` are methods on the `stagehand` instance, not the page.**
- **One natural-language action per `act` call.** Don't compound
  ("click X and fill Y"); chain individual `act` calls so each is retryable.
- **Schema-backed extract.** Define Zod schemas mirroring the `# Output`
  section of task.md and validate before emitting the final `success: true`
  line.
- **Tear down with `await stagehand.close()` in `finally`.** Since Stagehand
  created and owns the session, `close()` is the correct teardown — do NOT
  use `browse cloud sessions update … REQUEST_RELEASE` (that's only for the
  CDP-attach pattern in `playwright.ts`).
- **Snap on errors.** Wrap the body in
  `try { … } catch (err) { await snap(page, '99-error'); throw err; }`,
  honoring `process.env.SCREENSHOT_DIR`. `snap` is a no-op when the dir is
  unset.
- **Final stdout line is JSON.** Emit `{"success":true,"data":...}` on
  success or `{"success":false,"error":"..."}` on failure as the last line
  on stdout.

## Constructor shape

```typescript
const stagehand = new Stagehand({
  env: "BROWSERBASE",
  apiKey: process.env.BROWSERBASE_API_KEY,        // ← BROWSERBASE key; project inferred from it
  model: {                                        // ← LLM config lives here, not at top level
    modelName: "anthropic/claude-sonnet-4-6",     // ← provider-prefixed; do not invent model names
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
});
await stagehand.init();
const page = stagehand.context.pages()[0] ?? (await stagehand.context.newPage());
await page.goto(url, { waitUntil: "domcontentloaded" });

// Actions:
await stagehand.act("click the Continue button");

// Data:
const data = await stagehand.extract("<instruction>", zodSchema);
```

Use the descriptors from the trace as natural-language hints: where a
descriptor shows `accessibleName: "Continue"`, the corresponding `act`
should say `"click the Continue button"`. Specific locators aren't
required — Stagehand picks them at runtime.

## Imports

```typescript
import { Stagehand } from "@browserbasehq/stagehand";
import { join } from "node:path";
import { z } from "zod";
import "dotenv/config";
```

Only `@browserbasehq/stagehand`, `zod`, `dotenv`, and `tsx` should appear
in `package.json`. Don't add other runtime deps.

## Scaffold

Write `package.json` alongside `stagehand.ts` (in the same directory):

```json
{
  "name": "<task>-stagehand",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": { "start": "tsx stagehand.ts" },
  "dependencies": {
    "@browserbasehq/stagehand": "3.4.0",
    "dotenv": "16.4.5",
    "tsx": "4.22.3",
    "zod": "4.4.3"
  }
}
```

If `playwright.ts` is being written into the same directory, **merge** the
dependencies rather than overwriting the existing `package.json` —
otherwise the second framework's deps get lost. Use a single combined
`package.json` with both `playwright` and `@browserbasehq/stagehand` listed.

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

**Install with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`** if Playwright is also
in the same `package.json` (its postinstall would otherwise fetch chromium
binaries the sandbox can't reach).

```bash
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --silent --no-audit --no-fund
npx tsx stagehand.ts
```

## Verify contract

Run the script against a fresh Browserbase session and read the trailing
JSON line on stdout. Pass if `success === true`; fail otherwise. On
failure, feed the stderr tail back into your next attempt and iterate.

If verify still fails after 2-3 retries, **delete `stagehand.ts`** before
the upload — the upload script globs for `playwright.ts stagehand.ts` and
will ship whatever is on disk. Shipping a broken Stagehand variant is
worse than shipping just Playwright.
