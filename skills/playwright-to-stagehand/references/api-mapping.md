# Playwright → Stagehand + Browserbase: API Mapping

The authoritative, mechanical mapping the `/playwright-to-stagehand` skill uses to translate code.
Pair it with [`determinism.md`](determinism.md) (keep vs upgrade) and [`guide.md`](guide.md) (the why).

> ⚠️ **Point-in-time snapshot — verified against `@browserbasehq/stagehand` 3.6.0 source
> (2026-06), not a live spec.** Signatures drift every release. The **live docs supersede this
> table on any conflict** — verify against the installed package
> (`node_modules/@browserbasehq/stagehand`) or <https://docs.stagehand.dev/v3> before relying on an
> exact signature.

> **The one thing to internalize:** Stagehand v3 does **not** run Playwright. It drives the browser
> with an internal CDP engine called **understudy** that exposes a **Playwright-*flavored* but only
> *partially* compatible** `page`/`locator`/`context` API. A migration is therefore three moves, not
> a copy: **Port** the compatible subset, **Rewrite** the deterministic-but-different constructs, and
> **Upgrade-or-flag** the ones with no equivalent. The tables below tell you which is which.

---

## 1. Detect the source flavor first

| Flavor | Tell-tale | Handling |
|---|---|---|
| **TS/JS, plain script** | `import { chromium } from "playwright"` / `require("playwright")`; `chromium.launch()` | Primary path. Same language as target. |
| **Python, plain script** | `from playwright.sync_api import ...` / `from playwright.async_api import ...` | Translate to TS (see §6). Target is still TS. |
| **`@playwright/test` (TS) or `expect` from `playwright.sync_api` (Py)** | `import { test, expect } from "@playwright/test"`; `test(...)`, fixtures `{ page }` | **Out of scope as a test.** Flag the runner scaffolding; convert only the browser logic (§4.7). |

State which you found before translating.

---

## 2. Lifecycle mapping

Playwright's `chromium.launch() → browser.newContext() → context.newPage()` collapses into a single
Stagehand construction + `init()`.

| Playwright | Stagehand v3 |
|---|---|
| `const browser = await chromium.launch({ headless })` | `const stagehand = new Stagehand({ env: "BROWSERBASE", model: "…" })` |
| `const context = await browser.newContext({ viewport, … })` | (no separate context construction — `init()` provisions it) |
| `const page = await context.newPage()` | `await stagehand.init(); const page = stagehand.context.pages()[0];` |
| `await browser.close()` | `await stagehand.close()` (put in `finally`) |
| second tab: `await context.newPage()` | `await stagehand.context.newPage(url?)` |
| `browser.newContext()` ×N (isolation) | **one Stagehand instance = one context.** For true isolation use multiple `Stagehand` instances. Flag. |

```typescript
import { Stagehand } from "@browserbasehq/stagehand";

const stagehand = new Stagehand({
  env: "BROWSERBASE",                    // or "LOCAL" for dev with a real Chrome
  model: "anthropic/claude-sonnet-4-6",  // "provider/model" string
  // selfHeal: true,                     // recover cached selectors from DOM drift
});
await stagehand.init();
const page = stagehand.context.pages()[0];   // the active page
```

> There is **no `stagehand.page` getter** — get the page from `stagehand.context.pages()[0]`. AI
> methods (`act`/`extract`/`observe`/`agent`) live on the **instance**, not the page.

**Constructor option names (v3.6.0, `lib/v3/types/public/options.ts`) — watch the v2→v3 renames:**
- `env: "LOCAL" | "BROWSERBASE"`, `apiKey`, `projectId`.
- LLM provider key: pass `model` as an object — `model: { modelName: "openai/gpt-5", apiKey: "…" }`.
  There is **no top-level `modelClientOptions`** (v2-ism).
- `selfHeal?`, `cacheDir?` (on-disk act cache), `serverCache?` (server-side, default on under BB),
  `experimental?`, `verbose?: 0|1|2`, `systemPrompt?`.
- `domSettleTimeout?` — **not** `domSettleTimeoutMs`.
- Browserbase session / proxy / stealth / context → `browserbaseSessionCreateParams` (§5).
- Local Chromium config → `localBrowserLaunchOptions` (§5).

---

## 3. The page-API compatibility table (the heart of the migration)

For each Playwright construct, the move is **Port** (works ~as-is), **Rewrite** (deterministic but a
different shape), or **Upgrade/Flag** (no deterministic equivalent → `act`/`extract` or human review).

### Navigation & document
| Playwright | Move | Stagehand v3 |
|---|---|---|
| `page.goto(url, { waitUntil })` | **Port (signature diff)** | `page.goto(url, { waitUntil, timeoutMs })` — option is **`timeoutMs`** not `timeout`; returns `Response\|null`; `waitUntil` defaults to `"domcontentloaded"` |
| `page.url()`, `page.title()` | **Port** | same |
| `page.reload/goBack/goForward` | **Port** | `reload/goBack/goForward({ waitUntil, timeoutMs })` |
| `page.content()` | **Rewrite** | `page.evaluate(() => document.documentElement.outerHTML)` — no `content()` |

### Selector actions — **page-level selector methods do NOT exist; route through `locator`**
| Playwright | Move | Stagehand v3 |
|---|---|---|
| `page.click("#sel")` | **Rewrite** | `page.locator("#sel").click()` — page-level `click(x, y)` is **coordinate-based** |
| `page.fill("#sel", v)` | **Rewrite** | `page.locator("#sel").fill(v)` |
| `page.type("#sel", t)` | **Rewrite** | `page.locator("#sel").type(t)` — page-level `type(text)` types at current focus |
| `page.selectOption("#sel", v)` | **Rewrite** | `page.locator("#sel").selectOption(v)` |
| `page.hover("#sel")` | **Rewrite** | `page.locator("#sel").hover()` |
| `page.check/uncheck("#sel")` | **Rewrite/Upgrade** | locator has **no `.check()`** — `act("check the … box")`, or `locator(sel).click()` if it toggles |
| `page.press("#sel", "Enter")` | **Rewrite** | focus via `locator(sel).click()` then `page.keyPress("Enter")` (no `page.keyboard`, no `locator.press`) |

### Locators
| Playwright | Move | Stagehand v3 |
|---|---|---|
| `page.locator(css/xpath)` | **Port** | `page.locator(selector)` |
| `.fill/.type/.hover/.click/.selectOption` | **Port** (`.click({button,clickCount})` only) | same |
| `.textContent/.innerText/.inputValue/.isVisible/.isChecked/.count/.first/.nth/.setInputFiles` | **Port** | same (note: `.innerHtml()` is lower-case-h) |
| `.last()` | **Rewrite** | `.nth((await loc.count()) - 1)` — no `.last()` |
| `.getAttribute(name)` | **Rewrite** | `page.evaluate((el)=>el.getAttribute(name), <handle>)` or `extract(…)` — no `locator.getAttribute` |
| `.filter()/.all()/.waitFor()/.isEnabled()/.focus()/.press()` | **Rewrite/Upgrade** | not on understudy locator — restructure, `evaluate`, or `act` |
| `locator(a).locator(b)` chaining | **Rewrite** | compose one selector string `locator("a b")` — locators don't chain |
| `page.getByRole/getByText/getByLabel/getByPlaceholder` | **Upgrade** | **no semantic getBy\*** — `act("click the 'Login' button")` / `extract(…)`, or a CSS/XPath approximation |
| `page.getByTestId("x")` | **Rewrite (stays deterministic)** | `page.locator('[data-testid="x"]')` |

> **Playwright selector engines** (`text=`, `role=`, `:has-text()`, `:nth-match()`) are **not**
> understood by understudy's `locator()` — it resolves CSS/XPath. Convert engine selectors to plain
> CSS/XPath, or to `act()`/`extract()`.

### Reads / scraping
| Playwright | Move | Stagehand v3 |
|---|---|---|
| `page.$$eval(sel, fn)` / `$eval` | **Rewrite or Upgrade** | `page.evaluate(...)` for a 1:1 deterministic read; **prefer `extract("…", zodSchema)`** for any brittle/list scrape |
| `page.$(sel)` / `page.$$(sel)` | **Rewrite** | no `$`/`$$` — use `page.locator(sel)` (+ `.nth()`/`.count()`) or `page.evaluate` |
| `locator.allInnerTexts()` / list reads | **Upgrade** | `extract("…", z.array(z.object({…})))` |

### Waits
| Playwright | Move | Stagehand v3 |
|---|---|---|
| `page.waitForSelector(sel, { state })` | **Port (returns boolean)** | `page.waitForSelector(sel, { state, timeout, pierceShadow })` → `boolean` (not an ElementHandle) |
| `page.waitForLoadState(state)` | **Port (positional timeout)** | `page.waitForLoadState(state, timeoutMs?)` |
| `page.waitForTimeout(ms)` | **Port — but prefer to remove** | exists; replace arbitrary sleeps with a real wait |
| `page.waitForURL/waitForNavigation` | **Rewrite** | poll `page.url()` after the action, or `waitForLoadState` — no `waitForURL` |
| `page.waitForFunction` | **Rewrite** | loop on `page.evaluate(...)` |
| `page.waitForResponse/waitForRequest/waitForEvent` | **Flag** | no equivalent (see §4.6) |

### Viewport / capture / scripting
| Playwright | Move | Stagehand v3 |
|---|---|---|
| `page.setViewportSize({ width, height })` | **Rewrite (positional!)** | `page.setViewportSize(width, height)` — positional args, not an object |
| `page.screenshot(opts)` | **Port** | `page.screenshot(options?)` → `Buffer` |
| `page.pdf()` | **Flag** | not implemented |
| `page.evaluate(fn, arg)` | **Port** | same (PW-compatible) |
| `page.setExtraHTTPHeaders` / `page.addInitScript` | **Port** | same (also on `context`) |
| `page.setDefaultTimeout` | **Rewrite** | per-call timeouts only — pass `timeout`/`timeoutMs` per call |

### Keyboard / mouse / frames
| Playwright | Move | Stagehand v3 |
|---|---|---|
| `page.keyboard.press/type` | **Rewrite** | `page.keyPress(key, { delay })` — no `keyboard` object |
| `page.mouse.*` | **Rewrite** | `page.click(x, y)`, `page.hover(x, y)`, `page.scroll(...)`, `page.dragAndDrop(...)` |
| `page.frames()` / `page.frameLocator(sel)` | **Port** | same; plus Stagehand-only `page.deepLocator()` for cross-iframe |

### Interception / events / assertions — **flag these**
| Playwright | Move | Stagehand v3 |
|---|---|---|
| `page.route()` / `unroute()` (request mocking/blocking) | **Flag** | no interception. Fall back to `page.sendCDP("Network.…")`, or restructure. Needs human review |
| `page.on('request'/'response'/'download'/'dialog'/'popup'/…)` | **Flag** | `.on()` supports **only `"console"`** — flag other listeners |
| `expect(locator).toHaveText(...)` (`@playwright/test`) | **Rewrite** | `expect` is **not exported** — read the value (`locator.textContent()` / `page.url()` / `extract`) and `throw` on mismatch; loses auto-retry/auto-wait |
| `page.waitForEvent('download')` / file chooser open | **Flag** | no download event; uploads via `locator.setInputFiles`. Downloads → Browserbase session-downloads API |

---

## 4. Detailed translations

### 4.1 Brittle list scrape → `extract()` (the highest-value upgrade)

**Before — Playwright (TS)**
```typescript
const quotes = await page.$$eval("div.quote", (els) =>
  els.slice(0, 5).map((el) => ({
    text: el.querySelector("span.text")?.textContent?.trim(),
    author: el.querySelector("small.author")?.textContent?.trim(),
  })),
);
```
**After — Stagehand**
```typescript
import { z } from "zod";
const quotes = await stagehand.extract(
  "extract the first 5 quotes with their text and author",
  z.array(z.object({ text: z.string(), author: z.string() })),
);
```
`$$eval` has no understudy equivalent, and the per-element CSS chain is exactly what breaks on DOM
drift. One schema'd read replaces it. (A deterministic `$$eval` with *stable* selectors can instead
be a 1:1 `page.evaluate(...)` — only upgrade when the selectors are brittle.)

### 4.2 Page-level selector action → `locator` (mechanical rewrite, stays deterministic)

```typescript
// Playwright
await page.click("#submit");
await page.fill("#email", "a@b.com");
// Stagehand — page-level click/type are coordinate/focus-based; route through locator
await page.locator("#submit").click();
await page.locator("#email").fill("a@b.com");
```

### 4.3 Semantic locator (`getBy*`) → `act()` or CSS

```typescript
// Playwright (resilient, but no understudy equivalent)
await page.getByRole("button", { name: "Login" }).click();
await page.getByLabel("Username").fill("tomsmith");
// Stagehand — no getBy*; use act() (AI resolves the accessible UI), or a CSS/XPath locator if obvious
await stagehand.act("click the Login button");
await page.locator("#username").fill("tomsmith"); // when the underlying id is known
// getByTestId stays deterministic:
await page.locator('[data-testid="submit"]').click();
```
This is the one place migrating *from* Playwright legitimately *adds* AI: Playwright's
role/text/label engines don't exist in understudy, so a semantic locator with no obvious CSS
equivalent becomes an `act()`.

### 4.4 Login / secrets → `variables`

```typescript
// Playwright: hardcoded creds + #id fills
await page.fill("#username", "tomsmith");
await page.fill("#password", "SuperSecretPassword!");
await page.click("button[type='submit']");
```
```typescript
// Stagehand: keep the stable #id fills; move secrets out of source
await page.locator("#username").fill(process.env.APP_USER!);
await stagehand.act("type %password% into the password field", {
  variables: { password: process.env.APP_PASS! },
});
await page.locator("button[type='submit']").click();
```
For repeat runs prefer a **Browserbase Context** (§5) so you log in once and reuse the auth state.

### 4.5 Assertions (`expect`) → explicit checks

```typescript
// Playwright
await expect(page.locator("#flash")).toContainText("You logged into a secure area!");
```
```typescript
// Stagehand — expect() is not available; read + throw
const flash = (await page.locator("#flash").textContent())?.trim() ?? "";
if (!flash.includes("You logged into a secure area!")) {
  throw new Error(`assertion failed: ${flash}`);
}
```
Note in the summary that this loses Playwright's web-first auto-retry; add an explicit
`waitForSelector("#flash")` first if the element appears asynchronously.

### 4.6 Network interception / `waitForResponse` (gap — flag)

`page.route(...)` (blocking/mocking) and `page.waitForResponse(...)` have **no Stagehand surface**.
Honest treatments, in order of preference:
1. **Drop it if incidental** (e.g. `route` only blocked images for speed — Browserbase already
   handles perf; `blockAds: true` covers ad noise).
2. **Restructure** to not depend on interception — e.g. read the rendered result with `extract`
   instead of sniffing the XHR JSON.
3. **CDP passthrough** — `page.sendCDP("Network.enable", …)` exists for raw control.
4. Otherwise **flag needs-human-review** and keep the original behavior documented.

### 4.7 `@playwright/test` files (out of scope as a test)

The test-runner surface — `test()`, `test.describe`, `beforeEach`/fixtures (`{ page }`), projects,
retries, reporters, `expect()` web-first assertions — has **no Stagehand equivalent**. Don't fake a
test runner. Instead:
1. **Flag** the scaffolding as out of scope.
2. **Lift the browser logic** (page-object methods, the navigation/fill/click steps) into a plain
   Stagehand `main()` script.
3. Map `expect()` → explicit read + throw (§4.5).

---

## 5. Browserbase platform features

Everything you'd set on a raw Browserbase session is reachable through
`browserbaseSessionCreateParams` (it is Browserbase's `SessionCreateParams`); local Chromium config
goes in `localBrowserLaunchOptions`.

| Need | Playwright | Stagehand v3 |
|---|---|---|
| Headless / args / executable | `chromium.launch({ headless, args, executablePath })` | `localBrowserLaunchOptions: { headless, args, executablePath }` (LOCAL) |
| Viewport | `newContext({ viewport })` | `localBrowserLaunchOptions.viewport` (LOCAL) / `browserSettings.viewport` (BB); or `page.setViewportSize(w,h)` |
| Persistent auth / cookies | `newContext({ storageState })` | **Context**: `browserSettings.context: { id, persist: true }`, or `context.addCookies([...])` |
| Proxies | `newContext({ proxy })` | `proxies: true` (managed) or `[{ type, geolocation }]` |
| Stealth / fingerprint | (extra libs) | `browserSettings.advancedStealth: true` (Scale plan), `fingerprint`, Verified Sessions |
| Captcha solving | — | `browserSettings.solveCaptchas: true` (on by default) |
| Ad blocking | — | `browserSettings.blockAds: true` |
| Region | — | `region: "us-east-1" \| "us-west-2" \| "eu-central-1" \| "ap-southeast-1"` |
| Keep session alive | — | `keepAlive: true` |
| Downloads | `waitForEvent('download')` | `@browserbasehq/sdk` → `bb.sessions.downloads.list(id)` |

```typescript
const stagehand = new Stagehand({
  env: "BROWSERBASE",
  browserbaseSessionCreateParams: {
    region: "us-east-1",
    proxies: true,
    keepAlive: true,
    browserSettings: {
      blockAds: true,
      solveCaptchas: true,
      context: { id: process.env.BB_CONTEXT_ID!, persist: true },
    },
  },
});
```

---

## 6. Python Playwright → TypeScript (the cross-language path)

Target is always Stagehand **TypeScript**. Translate:

- **Lifecycle**: `with sync_playwright() as p:` / `async with async_playwright() as p:` +
  `p.chromium.launch()` / `browser.new_context()` / `context.new_page()` → `new Stagehand()` +
  `await init()` + `stagehand.context.pages()[0]`, in a `try/finally { await close() }`.
- **Sync→async**: Python sync API has no `await` (`page.goto(...)`); Stagehand TS is **always
  `await`** in an `async` function. Async-API Python already awaits.
- **snake_case → camelCase**, applying the §3 moves:
  - `wait_for_selector`→`waitForSelector` (boolean), `wait_for_load_state`→`waitForLoadState`,
    `wait_for_timeout`→`waitForTimeout`.
  - `set_viewport_size({"width":w,"height":h})` → `setViewportSize(w, h)` (**positional**).
  - `query_selector`/`query_selector_all` (`page.$`/`$$`) → **no equivalent** → `page.locator()`
    (+`.nth()`/`.count()`) or `page.evaluate()`, or `extract()` for scrapes.
  - `inner_text`→`innerText`, `text_content`→`textContent`, `inner_html`→`innerHtml`,
    `input_value`→`inputValue`, `is_visible`/`is_checked`→`isVisible`/`isChecked`.
  - `get_attribute` → **missing on locator** → `evaluate`/`extract`. `is_enabled` → missing.
  - `select_option`→`selectOption`, `set_input_files`→`locator.setInputFiles`.
  - `get_by_role`/`get_by_text`/`get_by_label`/`get_by_test_id` → **no getBy\*** → `act()` /
    CSS-XPath `locator()` (`get_by_test_id` → `[data-testid=…]`).
  - `set_extra_http_headers`→`setExtraHTTPHeaders`, `add_init_script`→`addInitScript`.
- **Assertions**: `from playwright.sync_api import expect`; `expect(loc).to_have_text(...)` → read +
  throw (§4.5).
- **Schemas**: Pydantic models in an `extract` task → zod schemas.

---

## 7. Gaps (no clean equivalent — call these out in the summary)

- **Network interception / `route` / `waitForResponse` / `waitForRequest`** — no surface; CDP
  passthrough or restructure (§4.6).
- **`expect()` / `@playwright/test` runner** — not a test framework; convert to read+throw and flag
  the scaffolding (§4.5, §4.7).
- **Semantic `getBy*` locators & PW selector engines (`text=`/`role=`/`:has-text`)** — `act()` or
  CSS/XPath (§4.3).
- **`page.$`/`$$`/`$eval`/`$$eval`, `page.content()`** — `page.evaluate()` or `extract()`.
- **`locator.getAttribute/.check/.uncheck/.press/.filter/.all/.waitFor/.isEnabled/.focus`,
  `locator.locator()` chaining** — rewrite via `evaluate`/`act`/selector composition.
- **`page.keyboard`/`page.mouse` objects** — `page.keyPress`, `page.click(x,y)`/`page.scroll`.
- **`page.waitForURL/waitForNavigation/waitForFunction`** — poll `page.url()` / loop `evaluate`.
- **`page.pdf`, `setDefaultTimeout`, `exposeFunction`, `bringToFront`** — missing; substitute or flag.
- **Downloads / file-chooser events** — Browserbase downloads API; uploads via `locator.setInputFiles`.
- **Multiple `browser.newContext()` (isolation)** — one Stagehand = one context; use multiple instances.

---

## Version notes (read before translating)

- **AI methods are on the instance** — `stagehand.act/extract/observe` (and `stagehand.agent()`),
  **not** `page.act()`. The page (`stagehand.context.pages()[0]`) is only for native page calls.
- **Signatures (3.6.0):** `act(string | Action, options?)`; `extract(instruction, schema, options?)`
  positional; `observe(instruction, options?)` returns `Action[]`; `stagehand.agent(config).execute(...)`.
- **Models are `"provider/model"` strings** (e.g. `"anthropic/claude-sonnet-4-6"`) via the `model`
  field; the object form `{ modelName, apiKey, … }` carries client options.
- **Page settling:** `page.waitForLoadState("domcontentloaded")` / `"load"` — **not `"networkidle"`**
  (Playwright sources love `waitUntil: "networkidle"`; it times out on analytics/long-poll pages).
- **`setViewportSize` is positional** `(width, height)`; **`goto` timeout option is `timeoutMs`**;
  **`waitForSelector` returns a boolean**.
- **zod is a peer dependency** (`^3.25.76 || ^4.2.0`): the consuming project must install `zod`.
- Confirm exact signatures against the installed version: <https://docs.stagehand.dev/v3>.
