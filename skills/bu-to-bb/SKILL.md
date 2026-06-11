---
name: bu-to-bb
description: Migrate browser-use (Python) browser-automation scripts to Stagehand v3 (TypeScript) on Browserbase. Use when the user wants to convert, port, rewrite, or migrate a browser-use Agent script to Stagehand, map browser-use features/APIs to Stagehand primitives (act/extract/observe/agent), or move agentic browser automation onto Browserbase with more determinism. Triggers on "browser-use", "browser_use", or "Agent(task=...)".
compatibility: "The skill itself uses only Read/Write/Edit/Grep/Bash — no install step. The Stagehand code it generates needs Node 18+, `@browserbasehq/stagehand` (v3) and `zod`, plus `BROWSERBASE_API_KEY` / `BROWSERBASE_PROJECT_ID` and a model-provider key (e.g. `ANTHROPIC_API_KEY`) to run. The optional trace-assisted path uses the Browserbase SDK or the sibling `browser-trace` skill."
license: MIT
allowed-tools: Read, Write, Edit, Grep, Bash
---

# browser-use → Stagehand on Browserbase (`/bu-to-bb`)

Convert a browser-use (Python) script into an idiomatic **Stagehand v3 (TypeScript)** script on
**Browserbase**, choosing the right level of determinism at each step rather than producing a
one-to-one agentic copy.

**Core principle:** browser-use is agentic-by-default (the LLM decides every action). Stagehand
lets you choose how much AI to use. A good migration replaces opaque agent loops with an
inspectable, mostly-deterministic pipeline — using AI only where the page is genuinely
unpredictable. This is a refactor with judgment, not a transpile.

## Reference files (read as needed)

- [`references/api-mapping.md`](references/api-mapping.md) — the mechanical browser-use → Stagehand
  mapping: variant detection, the full feature table, before/after code, Browserbase platform
  options, and v3 version gotchas. **Read this for any non-trivial construct.**
- [`references/determinism.md`](references/determinism.md) — how to choose `agent()` vs
  `act`/`extract`/`observe` vs cached `observe`→`act`. The decision tree. **Read this when deciding
  how to translate an `Agent(task=…)`.**
- [`references/trace-assisted.md`](references/trace-assisted.md) — the optional "run it on
  Browserbase, read the logs, then rewrite" workflow for opaque/flaky scripts.
- [`references/guide.md`](references/guide.md) — the human migration guide: philosophy shift,
  feature mapping, the determinism spectrum, and a recommended migration path.
- [`references/prompt.md`](references/prompt.md) — a self-contained, tool-agnostic version of this
  skill; paste it into any AI assistant along with a browser-use script.
- [`EXAMPLES.md`](EXAMPLES.md) — before/after script pairs.

## Workflow

### 1. Get the source
Obtain the browser-use script(s). If the user only described a script, ask for the file(s). Note
the target: **TypeScript Stagehand on Browserbase** unless they say otherwise.

### 2. Detect the browser-use variant
Identify legacy (pre-0.12) vs stable (0.12.x) vs Rust beta (0.13 `browser_use.beta`) — see
api-mapping §1. Normalize legacy names mentally before translating. State which variant you found.

### 3. Inventory the script
Extract a structured inventory before writing any TypeScript:
- **Task(s)** — the `task=` string(s); split each into its implied ordered steps.
- **Model** — the `Chat*` provider + model id.
- **Browser config** — local vs `cdp_url`/Browserbase; headless; proxies; `user_data_dir`/`storage_state`.
- **Structured output** — any `output_model_schema` Pydantic models.
- **Secrets** — `sensitive_data`, env-var usage, login flows.
- **Guardrails** — `allowed_domains`, `max_steps`.
- **Custom actions** — `@tools.action` / `Controller` functions, and whether each is a deterministic
  side-effect or an agent capability.
- **Setup** — `initial_actions`, secondary models (`page_extraction_llm`, `planner_llm`).

### 4. Decide the determinism level per step
For each step from the inventory, apply the decision tree in determinism.md:
- Navigate to a known URL → `page.goto(url)` on the Stagehand page (no AI).
- On-page action → `act("…")`; if it repeats, `observe()` once then replay `act(action)` (no LLM call).
- Reading data → `extract("…", zodSchema)`.
- Genuinely open-ended → keep `stagehand.agent().execute(...)` (tightened with `maxSteps`/`systemPrompt`).

Default to **decomposition** when the flow is known; keep `agent()` only where it isn't. For a
first lift-and-shift, a faithful `agent()` translation is acceptable — say so and note the
optimization path.

### 5. Produce the Stagehand v3 rewrite
Emit runnable TypeScript. Always:
- `import { Stagehand } from "@browserbasehq/stagehand";` and `import { z } from "zod";` when extracting.
- Get the page via `const page = stagehand.context.pages()[0];`.
- Call AI methods on the **instance**: `stagehand.act(...)`, `stagehand.extract(...)`,
  `stagehand.observe(...)` — **never** `page.act(...)`.
- Set the model as a `"provider/model"` string.
- Default to `env: "BROWSERBASE"`; show `env: "LOCAL"` as the dev option.
- Pass secrets via `variables` and `process.env`, never hardcoded.
- `await stagehand.init()` at the start, `await stagehand.close()` in a `finally`.

Include the project setup so it runs (see the templates below).

### 6. Write the migration summary
Alongside the code, produce a short summary:
- **Variant detected** and the determinism choices made (which steps became deterministic vs AI vs agent), with the reasoning.
- **Needs human review** — anything that didn't map 1:1: lost `allowed_domains` guardrails,
  custom-action logic, secondary-model intent, ambiguous task strings.
- **Recommended next step** — Browserbase Context for auth reuse, caching for production, or the
  trace-assisted path if the flow was opaque.

### 7. Offer the trace-assisted path (only if warranted)
If the source was one large opaque `agent(task=…)`, was flaky, or your rewrite can't be confidently
mapped, offer the trace-assisted workflow (trace-assisted.md): run the original on Browserbase, pull
`sessions.logs.list`, and rewrite from observed behavior. Don't run anything without the user's go-ahead.

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
> Add `"ai"` (Vercel AI SDK) to dependencies only if a custom browser-use action maps to an agent `tool`.

**`.env`**
```bash
BROWSERBASE_API_KEY=...
BROWSERBASE_PROJECT_ID=...
ANTHROPIC_API_KEY=...   # or the provider matching your model string
```

**`index.ts` skeleton** (decomposed, the preferred shape)
```typescript
import "dotenv/config";
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";

async function main() {
  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    model: "anthropic/claude-sonnet-4-6",
  });
  await stagehand.init();
  try {
    const page = stagehand.context.pages()[0];

    await page.goto("https://example.com");          // deterministic skeleton
    await stagehand.act("…");                          // AI where the page varies
    const data = await stagehand.extract("…", z.object({ /* … */ }));  // structured reads

    console.log(data);
  } finally {
    await stagehand.close();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
```

## Validation checklist (before declaring done)
- [ ] AI methods are on the **instance** (`stagehand.act/extract/observe`), not the page.
- [ ] Page obtained via `stagehand.context.pages()[0]`.
- [ ] Model is a `"provider/model"` string; the matching provider key is in `.env`.
- [ ] `extract` uses a zod schema; `zod` is in dependencies.
- [ ] Secrets use `variables` + `process.env`; nothing hardcoded.
- [ ] `init()` / `close()` present; `close()` in `finally`.
- [ ] Each browser-use step is accounted for, placed deliberately on the determinism spectrum.
- [ ] Migration summary lists determinism choices and "needs human review" items.

## Common mistakes to avoid
- **Copying v2 syntax** (`page.act()`, `stagehand.page`, `modelName`/`modelClientOptions`,
  `enableCaching`) from old blog posts. Use v3 — see api-mapping "Version notes".
- **Translating every step into `act()`** — navigate with `page.goto` and cache repeatable steps via `observe`→`act`; don't spend an LLM call on every action.
- **Defaulting everything to `agent()`** — that just reproduces browser-use's non-determinism in a
  new framework. Decompose where the flow is known.
- **Silently dropping `allowed_domains`** — Stagehand has no domain firewall; flag it for review.
- **Inventing Browserbase/Stagehand options** — if unsure of a field, check
  <https://docs.stagehand.dev/v3> / <https://docs.browserbase.com> rather than guessing.
