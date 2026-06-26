---
name: playwright-to-stagehand
description: Migrate Playwright browser-automation scripts (TypeScript/JavaScript or Python) to Stagehand v3 (TypeScript) on Browserbase. Use when the user wants to convert, port, rewrite, or migrate a Playwright script to Stagehand, move Playwright automation onto Browserbase, make brittle CSS/XPath selectors resilient with AI (act/extract/observe), or map Playwright APIs (chromium.launch, page.goto/click/fill/locator, getByRole) to Stagehand primitives. Triggers on "playwright", "@playwright/test", "chromium.launch", "sync_playwright".
compatibility: "The skill itself uses only Read/Write/Edit/Grep/Bash — no install step. The Stagehand code it generates needs Node 18+, `@browserbasehq/stagehand` (v3) and `zod`, plus `BROWSERBASE_API_KEY` / `BROWSERBASE_PROJECT_ID` and a model-provider key (e.g. `ANTHROPIC_API_KEY`) to run on Browserbase."
license: MIT
allowed-tools: Read, Write, Edit, Grep, Bash
---

# Playwright → Stagehand on Browserbase (`/playwright-to-stagehand`)

Convert a Playwright script (**TypeScript/JavaScript or Python**) into an idiomatic **Stagehand v3
(TypeScript)** script on **Browserbase**, keeping the deterministic skeleton and upgrading only the
brittle parts.

**Core principle:** Playwright is deterministic but **brittle** — hardcoded CSS/XPath selectors break
on DOM drift, and a local browser has no proxy/stealth/captcha/scale. Stagehand v3 drives the browser
with an internal CDP engine (*understudy*) that exposes a **Playwright-*flavored* but only *partially*
compatible** `page` API. So every step is one of three moves: **Port** the compatible subset
(`page.goto`, `page.locator(css/xpath).fill/click`, `evaluate`, `screenshot`); **Rewrite** the
different-shape constructs (`page.click(sel)`→`locator(sel).click()`, `$$eval`→`evaluate`,
`getByTestId`→`[data-testid]`, positional `setViewportSize`); and **Upgrade or flag** the rest
(brittle selectors & list scrapes → `act`/`extract`; semantic `getByRole/Text/Label` → `act`;
`route`/events/`waitForResponse`/`expect`/downloads → needs-human-review). Then move the session to
Browserbase. This is a *selective* refactor — **not** "wrap every step in AI," and **not** a verbatim copy.

> **Source of truth & versions.** The durable value here is the *judgment* — the keep-vs-upgrade
> selector triage — not the API specifics, which drift every release. The code mappings are a
> **snapshot validated against `@browserbasehq/stagehand` 3.6.x (2026-06)**. On any conflict the
> **live docs win** — verify against the installed package before emitting code:
> - Stagehand v3: <https://docs.stagehand.dev/v3>  ·  installed types: `node_modules/@browserbasehq/stagehand`
> - Browserbase: <https://docs.browserbase.com>  ·  Playwright: <https://playwright.dev>
>
> If the installed Stagehand major is **not 3**, treat this skill as conceptual only and follow the
> live docs for every signature.

## Reference files (read as needed)

- [`references/api-mapping.md`](references/api-mapping.md) — the mechanical Playwright → Stagehand
  mapping: lifecycle, the full page-API support table (what maps 1:1, what differs, what's missing),
  before/after code, Browserbase platform options, Python-source specifics, and v3 gotchas.
  **Read this for any non-trivial construct.**
- [`references/determinism.md`](references/determinism.md) — the keep-vs-upgrade decision tree:
  which selectors to leave deterministic vs move to `act`/`extract`/`observe`. **Read this when
  deciding how to translate each step.**
- [`references/guide.md`](references/guide.md) — the human migration guide: the philosophy shift,
  selector triage, what you gain/trade, and a recommended path.
- [`references/prompt.md`](references/prompt.md) — a self-contained, tool-agnostic version of this
  skill; paste it into any AI assistant along with a Playwright script.
- [`EXAMPLES.md`](EXAMPLES.md) — before/after script pairs (TS and Python sources).

## Workflow

### 1. Get the source
Obtain the Playwright script(s). If the user only described a script, ask for the file(s). Note the
target: **TypeScript Stagehand on Browserbase** unless they say otherwise — including when the source
is **Python**.

> **First, gate on scope.** If the source imports from **`@playwright/test`** (TS) or uses
> `expect` from **`playwright.sync_api`** (Python), it is a **test**, not an automation script.
> The test-runner surface (`test()`, `test.describe`, fixtures like `{ page }`, projects, retries,
> reporters, web-first `expect()` assertions) has **no Stagehand equivalent** — Stagehand is
> automation, not a test framework. **Flag the test scaffolding as out of scope**, then convert only
> the browser logic inside it (page-object methods, navigation/fill/click steps), mapping assertions
> to explicit checks. See guide.md "`@playwright/test` files are out of scope".

### 2. Detect the source language + shape
- **TypeScript/JavaScript** (`import { chromium } from "playwright"`) — same language as the target;
  the page API maps closest to 1:1.
- **Python** (`from playwright.sync_api import ...` / `async_api`) — translate to TS: snake_case →
  camelCase (`wait_for_selector` → `waitForSelector`, `query_selector_all` → `$$`/`locator`),
  `sync_playwright()` context-manager → `init()`/`close()`, sync calls → `await`. See api-mapping §6.
- **Plain script vs `@playwright/test`** — see the scope gate in step 1.

State which you found.

### 3. Inventory the script
Before writing any TypeScript, extract:
- **Lifecycle** — `chromium.launch()` options (headless, args), `browser.newContext()` (viewport,
  userAgent, storageState, proxy, locale), `newPage()`, multiple contexts/pages.
- **Navigations** — every `goto` (+ `waitUntil`), `waitForURL`, `waitForNavigation`.
- **Selectors + actions** — every `locator`/`$`/`getBy*` + `click`/`fill`/`type`/`select`/`check`,
  noting whether each selector is **stable** or **brittle** (this drives step 4).
- **Reads** — `textContent`/`innerText`/`$$eval`/`getAttribute` and list/table scrapes.
- **Assertions** — `expect(...)` usage (web-first or standalone).
- **Secrets** — hardcoded credentials, tokens, env usage, login flows.
- **Platform / gaps** — `page.route()`, `waitForResponse`/`waitForRequest`, downloads, file chooser,
  `page.on(...)` events, proxies, storage state.
- **Waits** — `waitForTimeout` sleeps (flag to replace), `waitForLoadState` (watch for `networkidle`).

### 4. Triage every step: port, rewrite, or upgrade
Apply the decision tree in determinism.md. For each step:
- **Port** — native calls understudy implements (`goto`, `screenshot`, `evaluate`, `waitForLoadState`,
  `frames`) and stable `page.locator(css/xpath).fill/click/textContent/…`. Keep ~1:1 (mind signature diffs).
- **Rewrite** — deterministic but different shape: page-level `page.click(sel)`/`fill(sel)` →
  `page.locator(sel).click()/.fill()`; **stable-selector reads** `$$eval`/`$`/`$$`/`content()` →
  `page.evaluate(...)` (deterministic, zero AI — the **default** for scrapes whose selectors don't
  change); `getByTestId("x")` → `locator('[data-testid="x"]')`; `setViewportSize({w,h})` → positional `(w,h)`.
- **Upgrade** — only what's genuinely fragile/semantic: brittle selectors (long CSS, `nth-child`,
  text-XPath) → `act("…")` / `observe()`→`act()`; **brittle or variable-markup reads, or reads you
  want to survive DOM drift** → `extract("…", zodSchema)`; semantic `getByRole/getByText/getByLabel`
  (no understudy equivalent) → `act()` or a CSS/XPath locator.
- **Flag** — `page.route()`/interception, `waitForResponse/Request`, `page.on(event)`, `expect()`
  assertions, downloads, multiple contexts → needs-human-review (api-mapping §7).
- **Secrets** — for a **stable** field, fill deterministically: `page.locator("#password").fill(process.env.PASS!)`
  (no LLM call, secret never enters a prompt). Use `act("…%key%…", { variables })` only when the field
  needs AI resolution.
- **Arbitrary sleep** (`waitForTimeout`) → replace with a real wait.

Default to **port/rewrite** for stable selectors and stable reads; reach for `act`/`extract` only when
a step is fragile, semantic, or you explicitly want DOM-drift resilience. Two symmetric failures:
**over-AI-ifying** deterministic code (a stable `$$eval` → `extract`, a stable `#id` fill → `act`), and
**copying what doesn't exist** (`getBy*`/`page.click(sel)`/`$$eval` verbatim — not on understudy).

### 5. Produce the Stagehand v3 rewrite
**First, verify the API.** Confirm the exact signatures against the installed package
(`node_modules/@browserbasehq/stagehand` types) or <https://docs.stagehand.dev/v3>. The mappings are a
3.6.x snapshot; the installed version wins. Then emit runnable TypeScript. Always:
- `import { Stagehand } from "@browserbasehq/stagehand";` and `import { z } from "zod";` when extracting.
- Map `chromium.launch()` + `newContext()` + `newPage()` → one `new Stagehand({ env: "BROWSERBASE" })`
  + `await stagehand.init()`. Get the page via `const page = stagehand.context.pages()[0];`.
- Call AI methods on the **instance**: `stagehand.act(...)`, `stagehand.extract(...)`,
  `stagehand.observe(...)` — **never** `page.act(...)`.
- Keep ported page calls on that page object: `page.goto`, `page.locator(sel).click()/.fill()`,
  `page.evaluate`, `page.screenshot`, `page.waitForSelector`/`page.waitForLoadState`. **Selector
  actions go through `page.locator(sel)`** — page-level `page.click(sel)`/`page.fill(sel)` don't
  exist (page-level click is coordinate-based).
- Set the model as a `"provider/model"` string; default `env: "BROWSERBASE"` (show `LOCAL` as the dev option).
- Pass secrets via `variables` + `process.env`, never hardcoded.
- `await stagehand.init()` at the start, `await stagehand.close()` in a `finally`.

Include the project setup so it runs (see templates below).

### 6. Write the migration summary
Alongside the code:
- **Source detected** (TS/JS or Python; plain vs `@playwright/test`) and the **keep-vs-upgrade
  decisions** per step, with reasoning.
- **Needs human review** — anything that didn't map 1:1: `page.route()`/network interception,
  `waitForResponse`/`waitForRequest`, test-runner scaffolding, multiple contexts, downloads,
  `page.on(...)` listeners, storage-state files.
- **Recommended next step** — a Browserbase Context for auth reuse, `selfHeal`/caching for production,
  proxies/stealth for protected targets.

### 7. Offer the trace-assisted path (only if warranted)
If the rewrite can't be confidently mapped (heavy network interception, an opaque flow, flakiness),
offer the trace-assisted workflow (trace-assisted.md): run on Browserbase, read the session logs,
then refine from observed behavior. Don't run anything without the user's go-ahead.

## Output templates

**`package.json`**
```json
{
  "name": "stagehand-migration",
  "type": "module",
  "scripts": { "start": "tsx index.ts" },
  "dependencies": {
    "@browserbasehq/stagehand": "^3.0.0",
    "dotenv": "^16.0.0",
    "zod": "^3.25.0"
  },
  "devDependencies": { "tsx": "^4.0.0", "typescript": "^5.0.0" }
}
```

**`.env`**
```bash
BROWSERBASE_API_KEY=...
BROWSERBASE_PROJECT_ID=...
ANTHROPIC_API_KEY=...   # or the provider matching your model string
```

**`index.ts` skeleton** (kept skeleton + upgraded brittle steps)
```typescript
import "dotenv/config";
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";

async function main() {
  const stagehand = new Stagehand({
    env: "BROWSERBASE",                       // "LOCAL" for dev with a real Chrome
    model: "anthropic/claude-sonnet-4-6",
    // selfHeal: true,                        // recover cached selectors from DOM drift
  });
  await stagehand.init();
  try {
    const page = stagehand.context.pages()[0];

    await page.goto("https://example.com");                 // kept: navigation (no AI)
    await page.locator("#id-that-is-stable").click();        // kept: stable selector (no AI)
    await stagehand.act("click the brittle thing");          // upgraded: was a fragile selector
    const data = await stagehand.extract("…", z.array(z.object({ /* … */ }))); // upgraded: list scrape

    console.log(data);
  } finally {
    await stagehand.close();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
```

## Validation checklist (before declaring done)
- [ ] Lifecycle mapped: `launch`/`newContext`/`newPage` → `new Stagehand()` + `init()`; page via `stagehand.context.pages()[0]`.
- [ ] AI methods are on the **instance** (`stagehand.act/extract/observe`), not the page.
- [ ] Selector actions routed through `page.locator(sel)` (no page-level `page.click(sel)`/`page.fill(sel)`); `getBy*`/`$$eval`/`page.content()` rewritten (locator/`evaluate`) or upgraded (`act`/`extract`).
- [ ] Stable selectors ported deterministically; only **brittle/semantic** ones upgraded to `act`/`extract`.
- [ ] Stable-selector reads use deterministic `page.evaluate(...)`; `extract` + zod reserved for brittle/variable markup or wanted DOM-drift resilience (`zod` in deps when used).
- [ ] Model is a `"provider/model"` string; the matching provider key is in `.env`.
- [ ] Secrets out of source via `process.env`; **stable** fields filled deterministically (`locator(sel).fill(process.env…)`), `act`+`variables` only for AI-resolved fields; nothing hardcoded.
- [ ] `waitForTimeout` sleeps replaced with real waits; no `"networkidle"`.
- [ ] `init()` / `close()` present; `close()` in `finally`.
- [ ] Gaps flagged in the summary: `route()`/network interception, `waitForResponse`, `@playwright/test` scaffolding, multi-context, downloads.

## Common mistakes to avoid
- **Over-AI-ifying** — turning deterministic code into AI calls: a stable-selector `$$eval` scrape →
  `extract()` (use `page.evaluate(...)`); a stable `page.locator("#id").click()` → `act()`; a stable
  `#password` fill → `act("type %password%…")` (use `locator("#password").fill(process.env.PASS!)` —
  deterministic and the secret never enters a prompt). Adds cost/latency/non-determinism for nothing.
- **Emitting APIs understudy doesn't have** — `page.click(sel)` (page-level is coordinate-based),
  `page.getByRole/getByText/getByLabel`, `page.$$eval`/`$`/`$$`, `page.keyboard`/`page.mouse`,
  `page.waitForResponse`, `expect()`. Rewrite to `locator`/`evaluate`/`keyPress`/`act`, or flag the
  gap (api-mapping §3, §7).
- **Under-migrating** — copying brittle CSS/XPath verbatim onto the Stagehand page. It runs, but you
  kept the brittleness and gained only a cloud browser. Upgrade fragile selectors.
- **Putting AI methods on the page** (`page.act()`) — v3 AI methods live on the **instance**.
- **Carrying `waitUntil: "networkidle"`** — it times out on analytics/long-poll pages; use `"domcontentloaded"`.
- **Converting `@playwright/test` into a fake test** — there's no Stagehand test runner; flag the
  scaffolding, convert only the browser logic.
- **Inventing network interception** — `page.route()` / `waitForResponse` have no Stagehand equivalent;
  flag them for human review rather than faking them.
- **Inventing Stagehand/Browserbase options** — verify against <https://docs.stagehand.dev/v3> /
  <https://docs.browserbase.com> rather than guessing.
```
