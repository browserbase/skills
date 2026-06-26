# Playwright → Stagehand on Browserbase: the migration guide

The human-readable companion to the `/playwright-to-stagehand` skill. Read this for the *why*; read
[`api-mapping.md`](api-mapping.md) for the mechanical *how* and [`determinism.md`](determinism.md)
for the per-step decision.

---

## The philosophy shift

Playwright and browser-use sit at opposite ends of the same spectrum, so the two migrations pull in
opposite directions:

- **browser-use is agentic-by-default** — an LLM decides every action. Migrating it *removes* AI
  wherever the flow is actually known.
- **Playwright is deterministic-by-default** — you wrote every selector and every step. It's fast,
  cheap, and inspectable. Its weaknesses are **brittleness** (hardcoded CSS/XPath selectors break the
  moment the DOM shifts) and **no cloud story** (a local browser has no proxy/stealth/captcha/scale).

A Playwright → Stagehand migration is therefore **not** "sprinkle AI on everything," and it is **not**
a verbatim copy either. Stagehand v3 does **not** run Playwright — it drives the browser with an
internal CDP engine called **understudy** that exposes a **Playwright-*flavored* but only *partially*
compatible** page API. So every step is one of three moves:

1. **Port** — the compatible subset moves over ~1:1: `page.goto`, `page.locator(css/xpath)` +
   `.fill/.click/.textContent/.selectOption/.count/.nth`, `page.evaluate`, `page.screenshot`,
   `page.frames`, `waitForSelector`/`waitForLoadState`.
2. **Rewrite** — deterministic constructs that exist in a *different shape*: page-level
   `page.click("#x")` → `page.locator("#x").click()` (page-level click is coordinate-based);
   `$$eval`/`$`/`$$`/`page.content()` → `page.evaluate(...)`; `getByTestId("x")` →
   `locator('[data-testid="x"]')`; `setViewportSize({w,h})` → positional `(w,h)`.
3. **Upgrade or flag** — constructs with *no deterministic equivalent*:
   - brittle selectors / list scrapes → **upgrade** to `act()` / `observe()→act()` / `extract()`;
   - semantic `getByRole`/`getByText`/`getByLabel` (no understudy equivalent) → `act()` or a CSS/XPath
     locator;
   - `page.route()`, network interception, `waitForResponse`, `page.on(event)`, `expect()`
     assertions, downloads, multi-context, `@playwright/test` scaffolding → **flag needs-human-review**
     (with a CDP/Browserbase-platform substitute where one exists).

Then move the session to **Browserbase** for proxies, stealth, captcha-solving, contexts, and scale.

The judgment that makes a migration good (or bad) is **classifying each step into the right move** —
especially not over-AI-ifying what has a clean deterministic port/rewrite, and not faking what's
genuinely a gap.

---

## The triage table

| Source construct | Move | Notes |
|---|---|---|
| `page.goto`, `page.evaluate`, `page.screenshot`, `page.frames`, `waitForSelector/LoadState` | **Port** | mind small signature diffs (`timeoutMs`, positional, boolean returns) |
| `page.locator("#id"/css/xpath).fill/click/textContent/selectOption/count/nth/isVisible` | **Port** | the compatible locator subset |
| `page.getByTestId("x")` | **Rewrite (stays deterministic)** | `locator('[data-testid="x"]')` |
| `page.click("#x")` / `page.fill("#x")` (page-level selector actions) | **Rewrite** | → `page.locator("#x").click()/.fill()` — page-level click/type are coordinate/focus-based |
| `$$eval`/`$eval`/`$`/`$$`, `page.content()` | **Rewrite (deterministic) or Upgrade (if brittle)** | `page.evaluate(...)` for a stable read; `extract()` for a fragile/list scrape |
| `setViewportSize({w,h})`, `goto({timeout})`, `page.keyboard`/`page.mouse` | **Rewrite (signature)** | positional `setViewportSize(w,h)`; `timeoutMs`; `page.keyPress`/`page.click(x,y)` |
| `getByRole`/`getByText`/`getByLabel`/`getByPlaceholder`, `text=`/`role=` engine selectors | **Upgrade (usually `act`)** | no semantic locators / PW engines in understudy → `act()`, or CSS/XPath if obvious |
| brittle CSS chains / `nth-child` / text-coupled XPath / list scrapes | **Upgrade** | `act()` / `observe→act` / `extract()` — the resilience win |
| `locator.getAttribute/.check/.press/.filter/.all/.waitFor`, `locator(a).locator(b)` chaining | **Rewrite/Upgrade** | not on understudy locator → `evaluate`/`act`/compose one selector |
| `page.route`/`on(event)`/`waitForResponse`/`waitForRequest`, `expect()`, downloads, multi-context, `@playwright/test` | **Flag (needs human review)** | CDP passthrough or Browserbase platform feature where possible |

Over-AI-ifying is a real failure mode: turning a stable `page.locator("#id").click()` into
`act("click the button")` adds latency, cost, and *non-determinism* for zero benefit. But the inverse
trap exists too — `getByRole`/`getByText` have **no** understudy equivalent, so leaving them as a
plain `locator()` won't work; those genuinely need `act()` or a real CSS/XPath. Classify honestly.

---

## What you gain (put this in the migration summary)

- **Resilience** — `act`/`extract` + `selfHeal` survive DOM drift that breaks a hardcoded selector.
- **Cloud + scale** — Browserbase sessions: proxies, advanced stealth, captcha solving, parallelism.
- **Auth reuse** — Browserbase **Contexts** persist login across runs (vs re-running a fragile login).
- **Structured reads** — `extract("…", zodSchema)` returns typed data without per-field selectors.
- **Determinism where it matters** — ported selectors and cached `observe→act` cost no LLM calls.

The honest trade-offs to name in the summary:

- **Cost/latency** on any step moved to AI. Keep the deterministic path where the selector is stable.
- **No test runner.** Stagehand is automation, not `@playwright/test`. `test()`, fixtures, projects,
  retries, reporters, and `expect()` web-first assertions have **no equivalent** — see below.
- **No network interception.** `page.route()` / mocking / `waitForResponse` don't map — flag them.
- **Partial page API.** `getBy*`, `$$eval`, `keyboard`/`mouse` objects, `waitForURL`, etc. need a
  rewrite, not a copy (api-mapping §3).

---

## `@playwright/test` files are out of scope (convert the browser logic only)

If the source imports from `@playwright/test` (or Python `playwright.sync_api`'s `expect`), it's a
**test**, not an automation script. The test framework — `test()`, `test.describe`, `beforeEach`,
fixtures (`{ page }`), projects, retries, reporters, `expect(locator).toHaveText(...)` — has no
Stagehand equivalent. Don't fabricate one. Instead:

1. **Flag** the test scaffolding as out of scope / needs-human-review.
2. **Extract and convert only the browser logic** (page-object methods, navigation/fill/click steps)
   into a plain Stagehand script.
3. Map web-first assertions to honest checks: `expect(locator).toContainText("x")` → read the value
   (`locator.textContent()` or `extract`) and `throw` if it doesn't match. Note that this loses
   Playwright's auto-retry/auto-wait — add an explicit `waitForSelector` first if needed.

---

## A recommended migration path

1. **Inventory** the script: launch/context/page setup, every navigation, every selector + action,
   every read, every assertion, and any network/route/download/test-runner usage.
2. **Classify each step** Port / Rewrite / Upgrade-or-flag with the triage table.
3. **Map the lifecycle**: `chromium.launch()` + `newContext()` + `newPage()` → one
   `new Stagehand({ env: "BROWSERBASE" })` + `init()`; page via `stagehand.context.pages()[0]`.
4. **Port** the compatible skeleton; **rewrite** the different-shape constructs; **upgrade** the
   brittle/semantic ones; **flag** the gaps.
5. **Verify against the installed package** before emitting — signatures drift; the live docs win.
6. **Summarize**: each step's move (with reasoning), gaps flagged, and the recommended next step
   (a Context for auth, `selfHeal`/caching for production, proxies/stealth for protected targets).
