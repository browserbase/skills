# Migrating from browser-use to Stagehand on Browserbase

A guide for teams moving browser automation from **browser-use** (Python) to **Stagehand**
(TypeScript) running on **Browserbase**. It focuses on mapping features and choosing the right
level of determinism — not a rigid line-by-line transpile, because real migrations differ by team,
tooling, and how much autonomy each workflow actually needs.

If you want an agent to do the rewriting for you, pair this guide with the **`/browser-use-to-stagehand` skill**,
which applies the mappings and determinism framework below to your actual scripts.

---

## TL;DR

- **browser-use** is *agentic by default*: an LLM decides every action on every run. Great for
  exploration; harder to make deterministic, cheap, and debuggable.
- **Stagehand** gives you a *spectrum*: cached `observe`→`act` for stable, repeatable steps,
  `act`/`extract` for the parts that vary, and a full `agent()` only when the path is open-ended.
- **Browserbase** is the cloud runtime under both. Stagehand in `env: "BROWSERBASE"` manages the
  session for you, and unlocks Contexts (persistent auth), proxies, stealth, and observability.
- The migration is a **refactor with judgment**: decide, per step, how much AI you actually need.
  The payoff is determinism, lower cost, and debuggability — at the price of more upfront authoring.

---

## 1. The philosophy shift

| | browser-use | Stagehand |
|---|---|---|
| Default control model | Fully agentic — LLM picks each action | You choose, per step, how much AI to use |
| Unit of work | A natural-language `task` | Primitives: `act`, `extract`, `observe`, `agent` |
| Page perception | Indexed DOM/accessibility tree (vision optional) | Targeted per-call; DOM by default, vision in agent `hybrid`/`cua` modes |
| Determinism | Hard — every run re-reasons | A dial: from cached, replayable actions to full agent |
| Best at | Open-ended exploration, prototyping | Production flows you want repeatable and cheap |
| Language | Python | TypeScript (also Python) |

Teams usually migrate because an agentic script that was perfect for a demo becomes expensive,
flaky, or impossible to debug in production. The fix isn't "a better agent" — it's *using AI only
where the page is actually unpredictable* and making everything else deterministic.

---

## 2. Mental model: the loop vs. the primitives

**browser-use** runs a perceive → decide → act loop. Each step it snapshots the page into an
indexed element tree, asks the LLM which action to take, executes it, and repeats until the task is
done or `max_steps` is hit. One `Agent(task="…")` can hide a dozen decisions.

**Stagehand** exposes four primitives you compose yourself:

- **`act(instruction)`** — perform one action ("click the login button"). One LLM call.
- **`extract(instruction, schema)`** — pull structured (zod-typed) data off the page.
- **`observe(instruction)`** — resolve an instruction into concrete actions *without doing them*;
  replay them later with no LLM call (the determinism trick).
- **`agent().execute(instruction)`** — the full autonomous loop, when you genuinely need it.

Navigation to known URLs is just `page.goto()` on the Stagehand page (no AI), and you lock in
repeatable steps by caching an `observe()` result and replaying it with `act()`. The migration is
mostly deciding which primitive each browser-use step becomes.

---

## 3. Feature mapping

The most-used mappings (see the skill's
[`api-mapping.md`](api-mapping.md) for the exhaustive table and
before/after code):

| browser-use | Stagehand v3 / Browserbase |
|---|---|
| `Agent(task=…)` + `agent.run()` | Decompose into `act`/`extract`/`observe` when the flow is known; else `stagehand.agent().execute(…)` |
| `llm=ChatAnthropic(model="claude-sonnet-4-6")` | `new Stagehand({ model: "anthropic/claude-sonnet-4-6" })` |
| `output_model_schema=PydanticModel` | `extract("…", zodSchema)` |
| `history.final_result()` / `.structured_output` | `extract(...)` return / `result.output` |
| `Browser()` (local) | `new Stagehand({ env: "LOCAL", localBrowserLaunchOptions })` |
| `Browser(cdp_url=session.connect_url)` | `new Stagehand({ env: "BROWSERBASE" })` |
| `sensitive_data={…}` | `act("…%key%…", { variables: { key } })` |
| `storage_state` / `user_data_dir` | Browserbase **Context** (`browserSettings.context: { id, persist: true }`) |
| proxies / stealth / captcha | `browserbaseSessionCreateParams` (`proxies`, `browserSettings.advancedStealth`, `solveCaptchas`) |
| `@tools.action` custom action | plain TS (deterministic), or `agent({ tools })` (agent capability) |
| `max_steps` | `agent().execute({ maxSteps })` |
| `allowed_domains` | ⚠️ no direct equivalent — see Gotchas |

---

## 4. The determinism spectrum (the important part)

Every browser-use step lands somewhere on this spectrum. Choosing well is the whole game. (The
skill's [`determinism.md`](determinism.md) has the decision tree.)

| Level | Stagehand | Use when | Cost / determinism |
|---|---|---|---|
| **1. Autonomous** | `agent().execute("…")` | Path is open-ended / unknown | Highest cost, lowest determinism (≈ browser-use) |
| **2. Per-step AI** | `act("…")`, `extract("…", schema)` | Steps known, markup varies | One call/step; inspectable |
| **3. Observe → act** | `observe()` then `act(action)` | Known steps you want to replay | `act(action)` makes **no** LLM call |
| **4. Self-heal + cache** | `selfHeal`, `cacheDir`, `serverCache` | Production replay that tolerates DOM drift | Cheapest steady state |
| **5. Navigation (no AI)** | `page.goto(url)`, `page.url()` | Loading a known URL (element interactions are Levels 2–4) | No AI, no cost |

A healthy rewrite is a **mix**: `page.goto` for navigation + cached `observe`→`act` for the
repeatable skeleton + per-step `act`/`extract` for the variable bits + a Context for auth. Reserve
`agent()` for the one genuinely open-ended stretch, if any.

> **Example decomposition.** browser-use:
> `Agent(task="Go to the store, search 'wireless mouse', add the cheapest to cart, checkout with my saved card")`
> becomes: `page.goto(store)` (L5) → `act("search 'wireless mouse'")` (L2) → `extract` prices, pick
> the min in code, `act("add to cart")` (L2 + code) → checkout via a Browserbase **Context** so the
> card/session is already authenticated (L3/4). One opaque agent run → an inspectable pipeline.

---

## 5. A recommended migration path

You don't have to rewrite everything at once. A low-risk sequence:

1. **Lift-and-shift onto Browserbase (no rewrite).** Point the existing browser-use script at a
   Browserbase session via `cdp_url=session.connect_url`. You immediately gain observability,
   proxies, and stealth, and you establish a behavior baseline. *(Optional but recommended first
   step — it de-risks everything after.)*
2. **Observe (optional, for opaque scripts).** Run it once on Browserbase and read the **Session
   Logs API** (`sessions.logs.list`) to see the real navigations and network calls. Use the video
   recording for human QA. See the skill's
   [`trace-assisted.md`](trace-assisted.md).
3. **Rewrite incrementally in Stagehand.** Translate the skeleton — navigation to `page.goto`,
   repeatable steps to cached `observe`→`act` — the variable steps to `act`/`extract`, and only the
   open-ended parts to `agent()`. Move auth to a **Context**, secrets to `variables`.
4. **Validate against the baseline.** Run the Stagehand version on Browserbase and compare logs and
   end state to step 1. Reuse the same Context so you're comparing like with like.
5. **Harden for production.** Turn on `selfHeal` + caching, pin models, scope extracts with
   `selector`, lock the viewport, wait for `domcontentloaded` (never `networkidle`) before AI snapshots.

---

## 6. A worked example

**Before — browser-use (Python)**
```python
from pydantic import BaseModel
from browser_use import Agent, ChatOpenAI

class Story(BaseModel):
    title: str
    points: int

class Stories(BaseModel):
    stories: list[Story]

agent = Agent(
    task="Go to Hacker News and return the top 5 stories with their title and points",
    llm=ChatOpenAI(model="gpt-5"),
    output_model_schema=Stories,
)
history = await agent.run()
print(history.structured_output)
```

**After — Stagehand v3 (TypeScript) on Browserbase**
```typescript
import "dotenv/config";
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";

async function main() {
  const stagehand = new Stagehand({ env: "BROWSERBASE", model: "openai/gpt-5" });
  await stagehand.init();
  try {
    const page = stagehand.context.pages()[0];
    await page.goto("https://news.ycombinator.com");          // deterministic

    const stories = await stagehand.extract(                   // structured read
      "extract the top 5 stories with their title and points",
      z.array(z.object({ title: z.string(), points: z.number() })),
    );
    console.log(stories);
  } finally {
    await stagehand.close();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
```

The navigation that the agent used to "decide" is now an explicit `page.goto`, and the data read is
a single typed `extract` instead of a full agent loop — faster, cheaper, and deterministic. See
[`EXAMPLES.md`](../EXAMPLES.md) for more before/after pairs (simple task, structured extraction, login).

---

## 7. What you gain from Browserbase

These are often the real reason to migrate, beyond determinism:

- **Contexts** — persist auth/cookies across runs; log in once, reuse everywhere. The biggest
  reliability win in most migrations (no more brittle login flows every run).
- **Proxies** — residential/datacenter, with geo and domain rules.
- **Stealth & Verified Sessions** — maintained fingerprints for sites that fight automation.
- **Captcha solving** — on by default.
- **Observability** — Session Replay (video), Session Inspector, and the Logs API (CDP
  network/console/lifecycle events) for debugging and validation.

All reachable from Stagehand via `browserbaseSessionCreateParams`.

---

## 8. Gotchas & version notes

- **Stagehand v3 is a rewrite.** AI methods are on the **instance** (`stagehand.act/extract/observe`),
  not the page; get the page via `stagehand.context.pages()[0]`; models are `"provider/model"`
  strings. Most examples online are v2 (`page.act()`, `stagehand.page`) — don't copy them. See the
  [v2→v3 migration guide](https://docs.stagehand.dev/v3/migrations/v2).
- **browser-use has three API shapes** — legacy (pre-0.12), stable (0.12.x), and the 0.13 Rust beta
  (`browser_use.beta`). Identify which the source uses before translating; class names differ
  (`Browser` ≡ `BrowserSession`, `Controller` → `Tools`).
- **`allowed_domains` has no Stagehand equivalent.** browser-use can hard-block off-domain
  navigation (and pairs it with `sensitive_data` as a security boundary). In Stagehand, constrain
  the agent via `systemPrompt`, use Browserbase proxy domain rules, or check `page.url()` in code —
  and treat it as a deliberate review item, not an automatic drop.
- **Don't translate everything into `agent()`.** That just reproduces browser-use's
  non-determinism. Decompose where the flow is known.
- **Secrets** — use `variables` + environment variables; never hardcode. Prefer Contexts for auth.

---

## 9. Resources

**Stagehand**
- Docs: <https://docs.stagehand.dev/v3>
- act / extract / observe / agent: <https://docs.stagehand.dev/v3/basics/act>
- Configuration (browser, models): <https://docs.stagehand.dev/v3/configuration/browser>
- Caching & determinism: <https://docs.stagehand.dev/v3/best-practices/caching>
- v2 → v3 migration: <https://docs.stagehand.dev/v3/migrations/v2>

**Browserbase**
- Docs: <https://docs.browserbase.com>
- Stagehand on Browserbase: <https://docs.browserbase.com/introduction/stagehand>
- Sessions & CDP: <https://docs.browserbase.com/fundamentals/using-browser-session>
- Contexts: <https://docs.browserbase.com/features/contexts>
- Observability (logs/replay): <https://docs.browserbase.com/features/observability>

**browser-use**
- Docs: <https://docs.browser-use.com>
- Remote browser / CDP: <https://docs.browser-use.com/customize/browser/remote>
- Browserbase integration: <https://docs.browserbase.com/integrations/browseruse/python>
