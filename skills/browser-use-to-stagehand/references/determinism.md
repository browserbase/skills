# Choosing the right determinism level

The single most important judgment in a browser-use → Stagehand migration is **how much AI to
keep at each step**. browser-use is agentic-by-default: the LLM decides every action, every run.
Stagehand lets you dial that down wherever the flow is known. This file is the decision framework
the `/browser-use-to-stagehand` skill applies.

---

## The spectrum (most → least agentic)

| Level | Stagehand surface | Use when | Cost / reliability |
|---|---|---|---|
| **1. Autonomous** | `stagehand.agent().execute("…")` | Task is open-ended; the path isn't known ahead of time; exploration. | Highest token cost, lowest determinism, hardest to debug. Closest to browser-use. |
| **2. Per-step AI** | `stagehand.act("…")`, `stagehand.extract("…", schema)` | You know the *steps* but not the exact selectors; pages change often. | One LLM call per action. Moderate cost. Each step is inspectable. |
| **3. Observe → act (cached)** | `observe("…")` → replay `act(action)` | You know the steps and want to resolve + reuse concrete selectors. | `act(action)` makes **no LLM call**. Fast, repeatable. |
| **4. Self-heal + cache** | `selfHeal: true`, `cacheDir`, `serverCache` | Production runs that should replay deterministically but recover when the DOM drifts. | Cheapest steady-state; AI only re-engages on a cache miss/break. |
| **5. Navigation (no AI)** | `page.goto(url)`, `page.url()` on the Stagehand page | Loading a known URL or reading the current location. | No AI, no cost. Element interactions live at Levels 2–4, not here. |

A good migration is usually a **mix**: `page.goto` for navigation, cached `observe`→`act` for the
repeatable skeleton (known forms, nav), per-step `act`/`extract` for the parts that genuinely vary,
and `agent()` reserved for the one open-ended stretch (if any). Determinism comes from Stagehand's
own caching — not from hand-written selectors.

---

## Decision tree (apply per browser-use step / sub-task)

```
Navigating to a known URL?
├─ YES → page.goto(url)                                                            (Level 5, no AI)
└─ NO  → Reading structured data off the page?
         ├─ YES → extract("…", schema)                                             (Level 2)
         └─ NO  → It's an on-page action (click / type / select).
                  Will this exact step repeat / need deterministic replay?
                  ├─ YES → observe("…") once, persist it, replay with act(action)   (Level 3/4, no LLM on replay)
                  └─ NO  → Is the route genuinely open-ended (LLM must decide)?
                           ├─ YES → stagehand.agent().execute(...)                  (Level 1)
                           └─ NO  → act("natural-language instruction")             (Level 2)
```

Reading data off a page is always `extract("…", schema)` (Level 2) — there is no reason to use a
full agent just to read structured data.

---

## How to read a browser-use script

A single `Agent(task="…")` usually hides several sub-tasks inside one natural-language prompt.
Split the task string into its implied steps, then place each step on the spectrum.

> **browser-use:** `Agent(task="Go to the store, search for 'wireless mouse', add the cheapest to cart, and checkout with my saved card")`

Decomposes to:
1. "Go to the store" → known URL → `page.goto(...)` (Level 5)
2. "search for 'wireless mouse'" → known field, varying markup → `act("search for 'wireless mouse'")` (Level 2)
3. "add the cheapest to cart" → needs reading + a decision → `extract` the prices, pick min in code, then `act` (Level 2 + plain code)
4. "checkout with saved card" → sensitive, repeatable → `observe`→`act` + `variables`, or a Browserbase Context (Level 3/4)

This is the core value of the migration: what was one opaque agent run becomes an inspectable,
mostly-deterministic pipeline — with AI used only where the page is actually unpredictable.

---

## When to KEEP `agent()`

Don't force decomposition where it doesn't fit. Keep an autonomous agent when:
- The task is **exploratory** ("find the contact email anywhere on this site").
- The **number/order of steps is unknown** at authoring time.
- The script is a **one-off** where authoring a deterministic pipeline isn't worth it.
- You're doing a **first-pass lift-and-shift** and want behavior parity before optimizing.

Even then, tighten it: set `maxSteps`, pass a `systemPrompt` with constraints, use `output` for a
typed result (**requires `experimental: true` on the constructor**, and `output` must be a zod
*object*; to avoid experimental mode, prefer running the agent then a separate `extract`), and
consider `executionModel` (a cheaper model for the agent's inner act/observe calls). For
computer-use-style visual tasks, `mode: "cua"`; otherwise the default `mode: "dom"`.

---

## The observe → act caching pattern (Level 3)

`observe()` turns a natural-language instruction into concrete `Action` objects (selector + method
+ args). Feeding an `Action` back into `act()` **executes it without another LLM call** — that's
how you get repeatability.

```typescript
// Resolve once (one LLM call)
const [loginButton] = await stagehand.observe("the login button");

// Replay deterministically (no LLM call) — persist `loginButton` to reuse across runs
if (loginButton) {
  await stagehand.act(loginButton);
}
```

Combine with caching for production:
```typescript
const stagehand = new Stagehand({
  env: "BROWSERBASE",
  selfHeal: true,            // re-resolve with AI only if a cached selector breaks
  cacheDir: "./stagehand-cache",
  // serverCache: true,      // default on under BROWSERBASE; key = instruction + page + options
});
// inspect with result.cacheStatus === "HIT" | "MISS"
```

---

## Best practices for deterministic runs

From Stagehand's own guidance — bake these into rewrites:
- **Wait for the page to settle** before an AI snapshot: `await page.waitForLoadState("domcontentloaded")`
  (or `"load"`). **Avoid `"networkidle"`** — it never fires on sites with continuous background
  traffic (Google, analytics, long-poll/websocket apps) and will throw a 15s timeout. When a specific
  element matters, wait for it explicitly instead of a global load state.
- **Scope** extractions/observations with `selector` (CSS or xpath) to cut noise and cost:
  `extract("…", schema, { selector: "//main" })`.
- **Lock the viewport** so cached selectors stay valid: `await page.setViewportSize(1280, 720)`
  (v3 takes **positional** args `setViewportSize(width, height)`, not Playwright's `{ width, height }` object).
- **Use `variables`** so different inputs share one cache entry (and keep secrets out of prompts).
- **Anchor prompts to visible UI labels** ("click the *Sign in* button"), not internal structure.
- **Iterating an extracted list** (browser-use's "open the links one by one" / loop-an-action
  patterns): `extract` the list first, then loop in plain TypeScript — there is no AI in the loop.
  Resolve relative hrefs to absolute before navigating: `new URL(href, page.url()).toString()` (a
  bare `page.goto("/foo")` or `goto("")` throws `Cannot navigate to invalid URL`). Wrap each
  iteration in try/catch so one dead link doesn't abort the run.

---

## What this buys the team (put this in the migration summary)

- **Determinism & debuggability** — each step is explicit and inspectable, vs one opaque agent loop.
- **Cost** — fewer/cheaper LLM calls; cached steps cost nothing.
- **Reliability** — self-heal recovers from DOM drift without a full re-plan.
- **Control** — secrets via `variables`, auth via Contexts, network controls via Browserbase.

The honest trade-off: decomposition is **more upfront authoring** than a single `task=` string.
Recommend it where the flow is known and the script runs repeatedly; keep `agent()` where it isn't.
