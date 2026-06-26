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
├─ YES → Port onto the Stagehand page (mind signature diffs)                      (Level 0)
└─ NO  → Is it a READ (scrape / get text / list)?
         ├─ YES → Are the selectors stable (#id, data-*, clean CSS/XPath)?
         │        ├─ YES → page.evaluate(...) — deterministic, zero AI, zero cost (Level 1r)  ← DEFAULT
         │        └─ NO  → brittle/variable markup, OR you explicitly want DOM-drift
         │                 resilience → extract("…", zodSchema)                   (Level 4)
         └─ NO → it's an ACTION on an element. Does understudy support the call as written?
                 ├─ Stable selector, needs reshaping (page.click(sel)→locator(sel).click();
                 │   getByTestId→[data-testid]) → Rewrite                          (Level 1r)
                 ├─ Stable CSS/XPath selector → page.locator(sel).<action>         (Level 1)
                 └─ Brittle selector / semantic getByRole/Text/Label / no clean selector:
                          repeats & needs replay? → observe("…") once, replay act(action)  (Level 2/3)
                          else                    → act("natural-language instruction")     (Level 4)
```

**Reads default to deterministic, not AI.** `$$eval`/`querySelectorAll` have no understudy
equivalent, but the right port for **stable** selectors is `page.evaluate(...)` — it's free, instant,
and exactly as deterministic as the original. Only reach for `extract("…", schema)` when the markup is
**brittle/variable**, or when you specifically want the scrape to survive DOM drift (the resilience
trade-off: an LLM call per read). Don't spend an LLM call to read a table whose selectors never change.

---

## The three failure modes to avoid

1. **Over-AI-ifying** — turning deterministic code into AI calls for no reason. The three common
   slips: (a) a stable-selector scrape (`$$eval`) → `extract()` instead of `page.evaluate(...)`;
   (b) a stable `page.click("#id")` → `act("click …")`; (c) filling a stable field via
   `act("type %password%…", {variables})` when `page.locator("#password").fill(process.env.PASS)` is
   deterministic **and** keeps the secret out of every prompt (no LLM sees it). Each adds latency,
   token cost, and non-determinism for nothing. Keep Levels 0–1r where the selector is stable; reserve
   `act`/`extract` for brittle/semantic/variable steps or when you explicitly want DOM-drift resilience.
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
- **Secrets** move out of source into `process.env`. For a **stable** field, fill deterministically:
  `page.locator("#password").fill(process.env.PASS!)` — no LLM call, and the secret never reaches a
  prompt. Use `act("…%key%…", { variables: { key } })` only when the field itself needs AI resolution
  (brittle/semantic selector); `variables` keeps the value out of the prompt in that case.
- **Anchor `act` prompts to visible UI labels** ("click the *Sign in* button"), not internal structure.
