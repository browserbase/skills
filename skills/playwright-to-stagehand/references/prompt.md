# Self-contained prompt: migrate a Playwright script to Stagehand v3

Paste this whole block into any AI assistant, followed by your Playwright script. It's a
tool-agnostic distillation of the `/playwright-to-stagehand` skill. (Signatures are a Stagehand
3.6.x snapshot — tell the assistant to verify against the installed package / live docs.)

---

You are migrating a **Playwright** browser-automation script (TypeScript/JavaScript **or** Python)
to an idiomatic **Stagehand v3 (TypeScript)** script running on **Browserbase**. The target is always
TypeScript, even if the source is Python.

**Mental model.** Stagehand v3 does **not** run Playwright. It uses an internal CDP engine
("understudy") with a **Playwright-flavored but only partially compatible** page API. Every step is
one of three moves:

1. **Port** (works ~as-is): `page.goto`, `page.locator(css/xpath).fill/click/textContent/selectOption/count/nth/isVisible`,
   `page.evaluate`, `page.screenshot`, `page.frames`, `page.waitForSelector` (returns boolean),
   `page.waitForLoadState`. AI methods are on the **instance** (`stagehand.act/extract/observe`), not the page.
2. **Rewrite** (deterministic, different shape): page-level `page.click(sel)`/`fill(sel)`/`type`/`hover`/`selectOption`
   → `page.locator(sel).click()/.fill()/…` (page-level click/type are coordinate/focus-based);
   `page.$$eval`/`$eval`/`$`/`$$`/`page.content()` → `page.evaluate(...)`; `getByTestId("x")` →
   `locator('[data-testid="x"]')`; `setViewportSize({w,h})` → positional `setViewportSize(w,h)`;
   `goto(url,{timeout})` → `{timeoutMs}`; `page.keyboard`/`page.mouse` → `page.keyPress`/`page.click(x,y)`;
   `page.waitForURL` → poll `page.url()`.
3. **Upgrade or flag** (no deterministic equivalent — but a stable-selector scrape is NOT this; that's
   a deterministic `page.evaluate(...)` rewrite, above):
   - brittle selectors (long CSS, `nth-child`, text-coupled XPath) → `stagehand.act("…")`,
     `stagehand.observe()`→`act(action)` (cached);
   - **brittle or variable-markup reads, or reads you want to survive DOM drift** → `stagehand.extract("…", zodSchema)`
     (reserve for fragile pages — a stable table should stay a deterministic `page.evaluate`);
   - semantic `getByRole`/`getByText`/`getByLabel`/`getByPlaceholder` and `text=`/`role=` engine
     selectors (no understudy equivalent) → `act()` or a CSS/XPath `locator()`;
   - **flag needs-human-review** (no surface): `page.route()`/request mocking, `waitForResponse`/`waitForRequest`,
     `page.on(event)` (only `"console"` is supported), `expect()` assertions, downloads
     (`waitForEvent('download')`), `page.pdf`, multiple `browser.newContext()` isolation.

**Scope gate first.** If the source imports `@playwright/test` (TS) or `expect` from
`playwright.sync_api` (Py), it's a **test**, not an automation script. The test runner — `test()`,
`describe`, fixtures (`{ page }`), projects, retries, reporters, web-first `expect()` — has no
Stagehand equivalent. Flag the scaffolding as out of scope and convert only the browser logic;
map `expect(locator).toContainText("x")` to: read `locator.textContent()` (or `extract`) and `throw`
on mismatch.

**Lifecycle.** `chromium.launch()` + `browser.newContext()` + `context.newPage()` collapse to:
```typescript
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod"; // when extracting
const stagehand = new Stagehand({ env: "BROWSERBASE", model: "anthropic/claude-sonnet-4-6" });
await stagehand.init();
try {
  const page = stagehand.context.pages()[0];   // no stagehand.page getter
  // … ported / rewritten / upgraded steps …
} finally {
  await stagehand.close();
}
```
Browserbase session options (proxies, stealth, captcha, persistent context) go in
`browserbaseSessionCreateParams`; local Chromium options in `localBrowserLaunchOptions`.

**Rules.**
- Model is a `"provider/model"` string (`"anthropic/claude-sonnet-4-6"`, `"openai/gpt-5"`, …).
- Default `env: "BROWSERBASE"`; show `env: "LOCAL"` as the dev option.
- `extract` takes `(instruction, zodSchema, options?)` and supports a top-level `z.array(...)`.
- Secrets out of source via `process.env`. For a **stable** field, fill deterministically —
  `page.locator("#password").fill(process.env.PASS!)` (no LLM call, secret never enters a prompt).
  Use `act("…%key%…", { variables: { key } })` only when the field needs AI resolution.
- Replace `waitForTimeout` sleeps with real waits; never use `waitUntil: "networkidle"` (use `"domcontentloaded"`).
- Don't over-AI-ify deterministic code: a stable `$$eval` scrape → `page.evaluate` (not `extract`); a
  stable `#id` fill/click stays a `locator` (not `act`). And don't copy `getBy*`/`page.click(sel)`/`$$eval`/`expect` verbatim.

**Output:**
1. The runnable Stagehand v3 TypeScript (plus `package.json` + `.env` if asked).
2. A **migration summary**: source flavor (TS/JS or Python; plain vs `@playwright/test`); each step's
   move (port/rewrite/upgrade) with reasoning; **needs-human-review** items (route/interception,
   `waitForResponse`, test scaffolding, downloads, multi-context); and the recommended next step
   (a Browserbase Context for auth, `selfHeal`/caching for production, proxies/stealth for protected targets).
