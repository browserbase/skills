<!--
  This file is the publishable "docs prompt" version of the /browser-use-to-stagehand skill.
  It is self-contained: paste it into ANY AI coding assistant (Claude, Cursor,
  Windsurf, ChatGPT, etc.) together with a browser-use script to get a migration.
  Everything below the horizontal rule IS the prompt — copy it (or this raw file).
-->

# Migrate browser-use → Stagehand on Browserbase (AI prompt)

A copy-pasteable prompt that turns a **browser-use** (Python) script into a **Stagehand v3**
(TypeScript) script on **Browserbase** — choosing the right level of determinism per step instead
of producing a one-to-one agentic copy.

**How to use**
1. Copy everything below the line (or share this raw file's URL).
2. Paste it into your AI coding assistant.
3. Add your browser-use script(s).
4. Review the generated Stagehand code and migration summary against your real site — tighten the
   `act(...)` prompts to the actual on-page labels, and confirm any flagged items.

> Prefer it as a one-command tool inside Claude Code? The same logic ships as the `/browser-use-to-stagehand`
> skill. This prompt is the universal, tool-agnostic form.

---

You are migrating a **browser-use** (Python) browser-automation script to **Stagehand v3**
(TypeScript) running on **Browserbase**. Produce idiomatic, runnable Stagehand v3 code plus a
migration summary. This is a refactor with judgment, not a line-by-line transpile.

## Core principle

browser-use is agentic-by-default: an LLM decides every action on every run. Stagehand lets you
choose how much AI to use at each step. A good migration replaces opaque agent loops with an
inspectable, mostly-deterministic pipeline — using AI only where the page is genuinely
unpredictable. The payoff is determinism, lower cost, and debuggability.

## Stagehand v3 — get these exactly right

Most training data and blog posts show Stagehand **v2**. Use **v3**:

- **Construct & lifecycle:**
  ```typescript
  import "dotenv/config";
  import { Stagehand } from "@browserbasehq/stagehand";
  import { z } from "zod";

  const stagehand = new Stagehand({ env: "BROWSERBASE", model: "anthropic/claude-sonnet-4-6" });
  await stagehand.init();
  try {
    // ... work ...
  } finally {
    await stagehand.close();
  }
  ```
- **Page object:** `const page = stagehand.context.pages()[0];` — **not** `stagehand.page`.
- **AI methods are on the instance:** `stagehand.act(...)`, `stagehand.extract(...)`,
  `stagehand.observe(...)` — **not** `page.act(...)`.
- **Models are `"provider/model"` strings:** e.g. `"anthropic/claude-sonnet-4-6"`, `"openai/gpt-5"`,
  `"google/gemini-2.5-flash"`. (Pin to whatever the team uses; ids move fast.)
- **`extract` uses a zod schema**; v3 supports a top-level `z.array(...)` with no wrapper object.
- **Secrets via `variables`** — the `%token%` is sent to the LLM, the real value is substituted
  locally and never leaves the machine:
  ```typescript
  await stagehand.act("type %username% into the email field", {
    variables: { username: process.env.APP_USER! },
  });
  ```
- **Default to `env: "BROWSERBASE"`**; show `env: "LOCAL"` (with `localBrowserLaunchOptions`) only as
  the dev option.
- **Determinism/caching options:** `selfHeal: true`, `cacheDir`, `serverCache` (on by default under
  BROWSERBASE).

## The determinism spectrum — choose per step

| Level | Stagehand | Use when |
|---|---|---|
| 1. Autonomous | `stagehand.agent().execute("…")` | Path is genuinely open-ended/unknown. |
| 2. Per-step AI | `act("…")`, `extract("…", schema)` | Step is known but markup varies. |
| 3. Observe → act | `const [a] = await stagehand.observe("…"); if (a) await stagehand.act(a);` | Known step you want to resolve once and replay (the `act(a)` call makes no LLM call). |
| 4. Self-heal + cache | `selfHeal`, `cacheDir`, `serverCache` | Production replay that should recover from DOM drift. |
| 5. Navigation (no AI) | `page.goto(url)`, `page.url()` | Loading a known URL or reading the current location. No LLM call. (Element interactions are Levels 2–4.) |

**Decision rule:** split each browser-use `task="…"` string into its implied ordered steps, then
place each on the spectrum. **Default to decomposition (levels 2–5)** when the flow is known; keep
`agent()` (level 1) only for genuinely open-ended tasks (tighten it with `maxSteps`, a `systemPrompt`,
and `output` for typed results). **Reading data is always `extract`**, never a full agent.

Example: `task="Go to the store, search 'wireless mouse', add the cheapest to cart, checkout with
my saved card"` → `page.goto(store)` (L5) → `act("search 'wireless mouse'")` (L2) → `extract` the
prices + pick the min in code + `act("add to cart")` (L2) → checkout via a Browserbase **Context**
so auth is already present (L3/4).

## Feature mapping

| browser-use | Stagehand v3 / Browserbase |
|---|---|
| `Agent(task=…)` + `agent.run()` | Decompose into `act`/`extract`/`observe` when the flow is known; else `stagehand.agent().execute(…)` |
| `llm=ChatAnthropic(model="claude-sonnet-4-6")` | `new Stagehand({ model: "anthropic/claude-sonnet-4-6" })` |
| `llm=ChatOpenAI(model="gpt-5")` / `ChatGoogle(...)` | `model: "openai/gpt-5"` / `"google/gemini-2.5-flash"` |
| `output_model_schema=PydanticModel` | `stagehand.extract("…", zodSchema)` (preferred); or `agent().execute({ output: zodObjectSchema })` — needs `experimental: true`, zod **object** only (see ⚠️ below) |
| `history.final_result()` / `.structured_output` | `extract(...)` return / `result.output` |
| `Browser()` (local) | `new Stagehand({ env: "LOCAL", localBrowserLaunchOptions })` |
| `Browser(cdp_url=session.connect_url)` (Browserbase) | `new Stagehand({ env: "BROWSERBASE" })` (Stagehand manages the session) |
| `sensitive_data={…}` | `act("…%key%…", { variables: { key } })` |
| `storage_state` / `user_data_dir` | Browserbase **Context**: `browserbaseSessionCreateParams.browserSettings.context: { id, persist: true }` |
| proxies / stealth / captcha / region | `browserbaseSessionCreateParams` (`proxies`, `browserSettings.advancedStealth`, `solveCaptchas`, `region`) |
| `@tools.action` (deterministic side-effect) | plain TypeScript |
| `@tools.action` (capability the agent must choose) | `stagehand.agent({ tools: { name: tool({ description, inputSchema: z.object({…}), execute }) } })` — `tool` from the **`ai`** package (pin **`ai@^5`**); needs `experimental: true` (see ⚠️ below) |
| `page_extraction_llm=…` | `extract("…", schema, { model })` |
| `planner_llm=…` + main `llm=…` | `agent({ model, executionModel })` |
| `max_steps` | `agent().execute({ maxSteps })` |

> ⚠️ **Experimental gate:** agent `output`, custom `tools`, and MCP `integrations` each require
> `experimental: true` on the `Stagehand` constructor (it bypasses the managed API path). For a typed
> result from an agentic run, prefer running the agent then a separate `stagehand.extract(...)`.

## No clean equivalent — flag these in the summary

- **`allowed_domains`** — Stagehand has no domain firewall, and it's often a security boundary
  (it pairs with `sensitive_data`). Mitigate with a `page.url()` host check before sensitive
  actions, a `systemPrompt` constraint (for agents), or Browserbase proxy domain rules. **Never drop
  it silently** — flag it as needs-review.
- **`max_actions_per_step`, `use_thinking`, `flash_mode`** — no direct equivalent; decomposition
  makes steps explicit. For speed, use a fast model (`google/gemini-2.5-flash`) + decomposition.
- **`initial_actions`** — becomes ordinary code that runs before the first AI call.

## browser-use variants to recognize (translate the same way)

- **Legacy (pre-0.12):** `Browser(config=BrowserConfig(...))`, `BrowserContext`, `Controller` /
  `@controller.action`. Normalize names first.
- **Stable (0.12.x):** `Browser(browser_profile=BrowserProfile(...))`, `Tools()` / `@tools.action`;
  `Browser` ≡ `BrowserSession`. (Most scripts.)
- **Rust beta (0.13.x):** imports from `browser_use.beta`. Same public surface.

## Output

1. **The Stagehand v3 TypeScript** — runnable, with a `package.json` (deps: `@browserbasehq/stagehand`,
   `zod`, `dotenv`; add `ai` only if a custom action maps to an agent `tool`) and the required `.env`
   keys (`BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID`, the provider key matching the model, plus
   any app secrets).
2. **A migration summary:**
   - **Variant detected** and the import/class tells.
   - **Determinism choices per step** (a short table: each browser-use step → Stagehand surface →
     level → one-line reasoning).
   - **Needs human review** — lost `allowed_domains` guardrails, custom-action logic, placeholder
     URLs/labels, anything ambiguous.
   - **Recommended next step** — usually a Browserbase **Context** for auth reuse, then `selfHeal` +
     caching for production.

## Self-check before finishing

- AI methods on the **instance** (`stagehand.act/extract/observe`), page via
  `stagehand.context.pages()[0]`.
- `model` is a `"provider/model"` string; the matching provider key is in `.env`.
- `extract` uses a zod schema; secrets use `variables` + `process.env`; nothing hardcoded.
- `init()` / `close()` present (`close()` in a `finally`).
- Every browser-use step is placed deliberately on the determinism spectrum; `allowed_domains` is
  not silently dropped.

If no script was provided, ask for the browser-use script before proceeding. Now migrate the
browser-use script provided by the user.
