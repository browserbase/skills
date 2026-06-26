# Keep, rewrite, or upgrade: the per-step decision

The central judgment in a Playwright → Stagehand migration is, for **each step**, which of three
moves applies. Playwright is already at the deterministic end of the spectrum, but Stagehand v3's
page API (the *understudy* CDP engine) is only **partially** Playwright-compatible — so "keep" isn't
always "copy." The three moves:

- **Port** — works ~as-is on the Stagehand page (mind small signature diffs).
- **Rewrite** — deterministic, but understudy spells it differently (route through `locator`, use
  `evaluate`, positional args).
- **Upgrade** — no deterministic equivalent, or the selector is brittle → `act`/`extract`/`observe`.
  (A subset of these are pure **gaps** to flag: `route`, events, `expect`, downloads — see api-mapping §7.)

---

## The spectrum (least → most AI)

| Level | Stagehand surface | Use when | Cost / reliability |
|---|---|---|---|
| **0. Port — native page calls** | `page.goto`, `page.url()`, `page.screenshot`, `page.evaluate`, `page.waitForLoadState`, `page.frames` | Playwright did it with no selector ambiguity and understudy implements it. | No AI, no cost. |
| **1. Port — stable locator** | `page.locator("#id" / css / xpath).fill/click/textContent/...` | The selector is stable (`#id`, `data-testid` via `[data-testid=…]`, a clean CSS/XPath). | No AI, no cost, deterministic. **Default for stable selectors.** |
| **1r. Rewrite — same intent, different shape** | page-level `click("#x")` → `locator("#x").click()`; `$$eval` → `evaluate`; `getByTestId` → `[data-testid]`; positional `setViewportSize` | The Playwright construct doesn't exist on understudy but has a deterministic equivalent. | No AI; mechanical. |
| **2. Observe → act (cached)** | `observe("…")` → replay `act(action)` | A brittle selector for a *repeatable* step; you want a concrete resolved action to persist. | One LLM call to resolve, **zero** on replay. |
| **3. Self-heal + cache** | `selfHeal: true`, `cacheDir` / `serverCache` | Production runs that replay deterministically but recover when the DOM drifts. | Cheapest steady-state; AI only on a cache miss/break. |
| **4. Per-step AI** | `stagehand.act("…")`, `stagehand.extract("…", schema)` | Brittle selector, a list scrape, a `getByRole/Text/Label` with no clean CSS equivalent, or markup that varies. | One LLM call per step. Inspectable. |
| **5. Autonomous** | `stagehand.agent().execute("…")` | The flow is open-ended / unknown at authoring time. **Rare** — a Playwright source already encodes the steps. | Highest cost, lowest determinism. Use sparingly. |

A good Playwright migration lives mostly at **Levels 0–1r** (port/rewrite what works) and reaches for
**2–4** only on brittle or semantic steps. Level 5 is uncommon: if the original was a fully scripted
flow, don't throw that determinism away for an agent loop.

---

## Decision tree (apply per Playwright step)

```
Is it a native page call understudy implements (goto, screenshot, evaluate, waitForLoadState, frames)?
├─ YES → Port it onto the Stagehand page (mind signature diffs)                 (Level 0)
└─ NO  → It selects/acts on an element. Does understudy support that exact call?
         ├─ NO, but there's a deterministic equivalent
         │   (page.click(sel)→locator(sel).click(); $$eval→evaluate; getByTestId→[data-testid]) → Rewrite  (Level 1r)
         └─ It resolves an element by selector. Is the selector stable AND CSS/XPath-expressible?
            ├─ YES → Port: page.locator(sel).<action/read>                       (Level 1)
            └─ NO  → brittle CSS / nth-child / text-XPath, OR a semantic getByRole/Text/Label, OR a list scrape.
                     Is it a structured READ?
                     ├─ YES → extract("…", zodSchema)                            (Level 4)
                     └─ NO  → action. Repeats / needs replay?
                              ├─ YES → observe("…") once, persist, replay act(action)  (Level 2/3)
                              └─ NO  → act("natural-language instruction")        (Level 4)
```

Reading a list/table is **always** `extract("…", schema)` — never reproduce a `$$eval` with
per-element selectors when one schema'd read survives markup churn.

---

## The three failure modes to avoid

1. **Over-AI-ifying** — replacing a stable `page.locator("#id").click()` with `act()`. Adds latency,
   token cost, and non-determinism for nothing. Keep Levels 0–1r where the selector is stable.
2. **Under-migrating** — copying brittle CSS/XPath verbatim. It compiles and runs, but you carried the
   brittleness over and gained only a cloud browser. Upgrade fragile selectors.
3. **Copying what doesn't exist** — emitting `page.click("#x")`, `page.getByRole(...)`, `page.$$eval`,
   `page.keyboard.*`, or `expect(...)` as if understudy supported them. It won't compile (or won't
   behave). Rewrite (Level 1r) or upgrade (Level 4), or flag the gap.

---

## The observe → act caching pattern (Level 2/3)

`observe()` turns a natural-language instruction into a concrete `Action` (selector + method + args).
Feeding that `Action` back into `act()` executes it **without another LLM call** — deterministic
replay for a brittle-but-repeatable step.

```typescript
// Resolve once (one LLM call)
const [submit] = await stagehand.observe("the submit button");
// Replay deterministically (no LLM call) — persist `submit` to reuse across runs
if (submit) await stagehand.act(submit);
```

For production, layer caching + self-heal so steady-state runs are deterministic but recover from drift:

```typescript
const stagehand = new Stagehand({
  env: "BROWSERBASE",
  selfHeal: true,        // re-resolve with AI only when a cached selector breaks
  // serverCache defaults on under BROWSERBASE; cacheDir for local persistence
});
```

---

## Best practices to bake into rewrites

- **Replace arbitrary sleeps.** `page.waitForTimeout(3000)` → `page.waitForSelector(...)` or
  `page.waitForLoadState("domcontentloaded")`.
- **Avoid `"networkidle"`.** Playwright sources love `waitUntil: "networkidle"`; it times out on
  Google/analytics/long-poll pages. Use `"domcontentloaded"` / `"load"`, or wait for a specific element.
- **AI methods are on the instance** — `stagehand.act/extract/observe`, **not** `page.act`. The page
  (`stagehand.context.pages()[0]`) is only for native + locator calls.
- **Scope `extract`/`observe`** with `{ selector: "//main" }` to cut noise/cost on big pages.
- **Lock the viewport** so cached selectors stay valid: `page.setViewportSize(width, height)` —
  **positional** args, not Playwright's `{ width, height }` object.
- **Secrets** move from hardcoded strings into `act("…%key%…", { variables: { key } })` + `process.env`.
- **Anchor `act` prompts to visible UI labels** ("click the *Sign in* button"), not internal structure.
