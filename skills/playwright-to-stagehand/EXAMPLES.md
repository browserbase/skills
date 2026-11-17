# Examples: Playwright → Stagehand

Before/after pairs showing the migration moves. Each "before" is a Playwright script (TS or Python);
each "after" is its Stagehand v3 (TypeScript) rewrite on Browserbase. Illustrative — validate against
your real site and verify signatures against the installed package (see [api-mapping.md](references/api-mapping.md)).

See [SKILL.md](SKILL.md) for the workflow, [the guide](references/guide.md) for the philosophy, and
[references/determinism.md](references/determinism.md) for the port/rewrite/upgrade decision.

## Running an "after" example

```bash
npm install @browserbasehq/stagehand zod
npm install -D tsx dotenv
```

`.env`:
```bash
BROWSERBASE_API_KEY=...
BROWSERBASE_PROJECT_ID=...
ANTHROPIC_API_KEY=...   # or OPENAI_API_KEY, matching the model string in the file
```

```bash
npx tsx example.ts
```

Swap `env: "BROWSERBASE"` for `env: "LOCAL"` (with Chrome installed) to run locally during dev.

---

## 1. Brittle list scrape (TS) → `extract()`

A `$$eval` with per-element CSS — the classic thing that breaks on DOM drift. `$$eval` has no
understudy equivalent anyway, so this is the highest-value **upgrade**.

**Before — Playwright (TS)**
```typescript
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("https://quotes.toscrape.com/", { waitUntil: "networkidle" });

const quotes = await page.$$eval("div.quote", (els) =>
  els.slice(0, 5).map((el) => ({
    text: el.querySelector("span.text")?.textContent?.trim() ?? "",
    author: el.querySelector("small.author")?.textContent?.trim() ?? "",
  })),
);
console.log(quotes);
await browser.close();
```

**After — Stagehand v3 (default: deterministic `page.evaluate`)**
`$$eval` has no understudy equivalent, but the selectors here are stable, so the right port is a
deterministic `page.evaluate` — no LLM call, no cost, same result.
```typescript
import "dotenv/config";
import { Stagehand } from "@browserbasehq/stagehand";

async function main() {
  const stagehand = new Stagehand({ env: "BROWSERBASE", model: "anthropic/claude-sonnet-4-6" });
  await stagehand.init();
  try {
    const page = stagehand.context.pages()[0];
    await page.goto("https://quotes.toscrape.com/");          // ported; dropped "networkidle"

    const quotes = await page.evaluate(() =>                   // $$eval → evaluate (deterministic)
      Array.from(document.querySelectorAll("div.quote")).slice(0, 5).map((el) => ({
        text: el.querySelector("span.text")?.textContent?.trim() ?? "",
        author: el.querySelector("small.author")?.textContent?.trim() ?? "",
      })),
    );
    console.log(quotes);
  } finally {
    await stagehand.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
```

**Alternative — `extract` (only if the markup is brittle/variable, or you want DOM-drift resilience)**
Trades an LLM call per read for resilience. Don't use it for a stable table like this one.
```typescript
import { z } from "zod";
// const page = stagehand.context.pages()[0]; await page.goto(...); await page.waitForLoadState("domcontentloaded");
const quotes = await stagehand.extract(
  "extract the first 5 quotes with their text and author",
  z.array(z.object({ text: z.string(), author: z.string() })),
);
```

---

## 2. Login form (TS): `#id` selectors kept deterministic, secrets → `process.env`, `expect` → read + throw

Stable `#id` selectors are **ported** through `locator` (page-level `page.fill(sel)` doesn't exist).
The password is stable too, so it's a **deterministic** `locator.fill(process.env…)` — that keeps the
secret out of any prompt without an LLM call (no `act` needed). `expect()` isn't available — read and throw.

**Before — Playwright (TS)**
```typescript
import { chromium } from "playwright";
import { expect } from "@playwright/test";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("https://the-internet.herokuapp.com/login");
await page.fill("#username", "tomsmith");
await page.fill("#password", "SuperSecretPassword!");
await page.click("button[type='submit']");
await expect(page.locator("#flash")).toContainText("You logged into a secure area!");
await browser.close();
```

**After — Stagehand v3**
```typescript
import "dotenv/config";
import { Stagehand } from "@browserbasehq/stagehand";

async function main() {
  const stagehand = new Stagehand({ env: "BROWSERBASE", model: "anthropic/claude-sonnet-4-6" });
  await stagehand.init();
  try {
    const page = stagehand.context.pages()[0];
    await page.goto("https://the-internet.herokuapp.com/login");

    // Stable #id fields → deterministic locator.fill; secrets from process.env (never sent to an LLM).
    await page.locator("#username").fill(process.env.APP_USER ?? "tomsmith");
    await page.locator("#password").fill(process.env.APP_PASS ?? "SuperSecretPassword!");
    await page.locator("button[type='submit']").click();      // page.click(sel) → locator(sel).click()
    // (Only if the field had no clean selector would you reach for
    //  stagehand.act("type %password%…", { variables: { password } }) to let AI locate it.)

    // expect() has no equivalent → read + throw (add waitForSelector since #flash appears post-nav)
    await page.waitForSelector("#flash");
    const flash = (await page.locator("#flash").textContent())?.trim() ?? "";
    if (!flash.includes("You logged into a secure area!")) {
      throw new Error(`login assertion failed: ${flash}`);
    }
    console.log("login ok:", flash.split("\n")[0]);
  } finally {
    await stagehand.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
```

> **Migration summary note:** `expect()` → manual read loses Playwright's auto-retry. For repeat runs,
> reuse a Browserbase **Context** to skip re-login. Consider `selfHeal: true` for production.

---

## 3. Semantic locators (`getByRole`/`getByLabel`) → `act()`

Playwright's role/label/text engines have **no understudy equivalent**. Where an obvious underlying
selector exists, use a CSS `locator`; otherwise `act()`. This is where migrating *from* Playwright
legitimately adds AI.

**Before — Playwright (TS)**
```typescript
await page.getByRole("link", { name: "Form Authentication" }).click();
await page.getByLabel("Username").fill("tomsmith");
await page.getByRole("button", { name: "Login" }).click();
```

**After — Stagehand v3**
```typescript
await stagehand.act("click the 'Form Authentication' link");   // no getByRole → act
await page.locator("#username").fill("tomsmith");               // label maps to a known id → port
await stagehand.act("click the Login button");                  // no getByRole → act
```

---

## 4. Python (sync) scrape → Stagehand TypeScript

Cross-language: `sync_playwright()` + snake_case + `query_selector_all` (`page.$$`, no equivalent)
become an async TS `extract`.

**Before — Playwright (Python, sync)**
```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.set_viewport_size({"width": 1280, "height": 720})
    page.goto("https://quotes.toscrape.com/", wait_until="networkidle")
    for q in page.query_selector_all("div.quote")[:5]:
        print(q.query_selector("small.author").inner_text())
    browser.close()
```

**After — Stagehand v3 (TypeScript)**
```typescript
import "dotenv/config";
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";

async function main() {
  const stagehand = new Stagehand({ env: "BROWSERBASE", model: "anthropic/claude-sonnet-4-6" });
  await stagehand.init();
  try {
    const page = stagehand.context.pages()[0];
    await page.setViewportSize(1280, 720);                    // positional, not an object
    await page.goto("https://quotes.toscrape.com/");          // dropped "networkidle"
    await page.waitForLoadState("domcontentloaded");

    const authors = await stagehand.extract(                  // query_selector_all scrape → extract
      "the authors of the first 5 quotes, in order",
      z.array(z.object({ author: z.string() })),
    );
    for (const a of authors) console.log(a.author);
  } finally {
    await stagehand.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
```

---

## 5. `@playwright/test` spec → flag the scaffold, convert the browser logic

The test runner (`test`, fixtures, `expect`, page-objects) is **out of scope**. Lift the browser
logic into a plain Stagehand script; map assertions to read + throw.

**Before — Playwright Test**
```typescript
import { test, expect } from "@playwright/test";

test("valid login", async ({ page }) => {
  await page.goto("https://the-internet.herokuapp.com/login");
  await page.fill("#username", "tomsmith");
  await page.fill("#password", "SuperSecretPassword!");
  await page.click("button[type='submit']");
  await expect(page.locator("#flash")).toContainText("You logged into a secure area!");
});
```

**After — Stagehand v3** (+ a migration note)
```typescript
// NOTE (needs human review): the @playwright/test scaffolding — test(), the { page } fixture, and
// expect() — has no Stagehand equivalent. Stagehand is automation, not a test runner. Below is the
// browser logic lifted into a plain script; re-wrap it in your own runner if you need test reporting.
import "dotenv/config";
import { Stagehand } from "@browserbasehq/stagehand";

async function main() {
  const stagehand = new Stagehand({ env: "BROWSERBASE", model: "anthropic/claude-sonnet-4-6" });
  await stagehand.init();
  try {
    const page = stagehand.context.pages()[0];
    await page.goto("https://the-internet.herokuapp.com/login");
    await page.locator("#username").fill("tomsmith");
    await page.locator("#password").fill("SuperSecretPassword!");
    await page.locator("button[type='submit']").click();

    await page.waitForSelector("#flash");
    const flash = (await page.locator("#flash").textContent())?.trim() ?? "";
    if (!flash.includes("You logged into a secure area!")) throw new Error(`assertion failed: ${flash}`);
    console.log("valid login: ok");
  } finally {
    await stagehand.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
```

---

## 6. Network interception (`route` + `waitForResponse`) → restructure or flag

`page.route()` and `page.waitForResponse()` have **no Stagehand surface**. Prefer to drop incidental
interception and read the rendered result instead; flag anything load-bearing.

**Before — Playwright (TS)**
```typescript
await page.route("**/*.{png,jpg}", (r) => r.abort());          // block images for speed
const resp = page.waitForResponse((r) => r.url().includes("/api/quotes"));
await page.goto("https://quotes.toscrape.com/scroll");
const json = await (await resp).json();
console.log(json.quotes.slice(0, 5));
```

**After — Stagehand v3** (+ a migration note)
```typescript
// NOTE (needs human review): page.route() (image blocking) and waitForResponse() (sniffing the
// /api/quotes XHR) have no Stagehand equivalent. Image blocking is incidental — Browserbase handles
// perf, and blockAds:true is available. Instead of sniffing the XHR, read the rendered quotes.
import "dotenv/config";
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";

async function main() {
  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    model: "anthropic/claude-sonnet-4-6",
    browserbaseSessionCreateParams: { browserSettings: { blockAds: true } },
  });
  await stagehand.init();
  try {
    const page = stagehand.context.pages()[0];
    await page.goto("https://quotes.toscrape.com/scroll");
    await page.waitForLoadState("domcontentloaded");

    const quotes = await stagehand.extract(
      "extract the first 5 quotes with their text and author",
      z.array(z.object({ text: z.string(), author: z.string() })),
    );
    console.log(quotes);
    // If you truly must read the raw API response, use CDP passthrough: page.sendCDP("Network.enable").
  } finally {
    await stagehand.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
```
