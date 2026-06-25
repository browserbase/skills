# browser-use → Stagehand + Browserbase: API Mapping

The authoritative, mechanical mapping the `/browser-use-to-stagehand` skill uses to translate code. Pair it
with [`determinism.md`](determinism.md) (which Stagehand primitive to reach for) and
[`trace-assisted.md`](trace-assisted.md) (the optional run-and-observe path).

Stagehand examples here target **v3** (`@browserbasehq/stagehand` ≥ 3.x), the current major
version. v3 is a rewrite — see the [Version notes](#version-notes-read-before-translating) at
the bottom before trusting any older snippet you find online.

> ⚠️ **This is a point-in-time snapshot (validated against Stagehand 3.6.x / browser-use 0.13.x,
> 2026-06), not a live spec.** Signatures and option names drift every release. The **live docs
> supersede this table on any conflict** — verify against the installed package
> (`node_modules/@browserbasehq/stagehand`) or <https://docs.stagehand.dev/v3> /
> <https://docs.browserbase.com> / <https://docs.browser-use.com> before relying on an exact signature.

---

## 1. Detect the browser-use variant first

browser-use is mid-transition across three API shapes. Identify which one the source script
uses before translating, because the imports and class names differ.

| Variant | Tell-tale imports / calls | Notes |
|---|---|---|
| **Legacy** (pre-0.12) | `from browser_use import Browser, BrowserConfig`; `Browser(config=BrowserConfig(...))`; `BrowserContext`; `Controller()`, `@controller.action` | Deprecated. Normalize to current names first (see §6), then translate. |
| **Stable** (0.12.x) | `from browser_use import Agent, Browser, BrowserProfile, Tools, ChatOpenAI` ; `Browser(browser_profile=BrowserProfile(...))` ; `Tools()`, `@tools.action` | What essentially all teams run today. The primary migration source. |
| **Rust beta** (0.13.x) | imports specifically from **`from browser_use.beta import ...`** | Opt-in new loop. The *only* reliable tell is the `browser_use.beta` import path. Translate the same way — the public surface (`Agent(task=, llm=)`, `agent.run()`) is identical. |

> **Note on 0.13.x:** the classic top-level `from browser_use import Agent, ChatBrowserUse, ChatOpenAI`
> surface is still the default in 0.13.x — `ChatBrowserUse` is browser-use's hosted-model class and
> appears in *stable* code, **not** just the beta. Don't classify a script as "Rust beta" just because
> it imports `ChatBrowserUse`; require a literal `browser_use.beta` import. When in doubt, use the
> stable mapping (all variants translate the same way anyway).

Key renames to recognize (all three may appear in a codebase):
- `Browser` is now an **alias for `BrowserSession`** — same class. Old `BrowserContext` is gone (folded into the session).
- `Controller` is a backwards-compat alias for **`Tools`**; `@controller.action` ≡ `@tools.action`.
- In custom actions, the injected browser param must be named exactly **`browser_session: BrowserSession`**.

---

## 2. Top-level mapping table

| browser-use (Python) | Stagehand v3 (TypeScript) / Browserbase |
|---|---|
| `Agent(task=..., llm=...)` + `await agent.run()` | **Decompose** into `stagehand.act` / `extract` / `observe` when the flow is known (preferred); else faithful `stagehand.agent().execute(...)`. See [determinism.md](determinism.md). |
| `llm=ChatAnthropic(model="claude-sonnet-4-6")` | `new Stagehand({ model: "anthropic/claude-sonnet-4-6" })` (or per-call `{ model }`) |
| `llm=ChatOpenAI(model="gpt-5")` | `model: "openai/gpt-5"` |
| `llm=ChatGoogle(model="gemini-2.5-flash")` | `model: "google/gemini-2.5-flash"` |
| `llm=ChatBrowserUse()` (default) | pick a provider string, e.g. `"google/gemini-2.5-flash"` (fast/cheap) or `"anthropic/claude-sonnet-4-6"` |
| `agent.run(max_steps=30)` | `agent().execute({ instruction, maxSteps: 30 })` |
| `output_model_schema=MyPydanticModel` | **Preferred:** decompose and `stagehand.extract("...", zodSchema)` for the typed read. For an agentic run, `agent().execute({ output: zodObjectSchema })` — but see the two gotchas below. |
| `history.final_result()` | `extract(...)` return value, or `result.message` from an agent run |
| `history.structured_output` | typed `extract(...)` return, or `result.output` from `agent().execute({ output })` (gotchas below) |

> **Agent `output` gotchas (both bite at runtime, not compile time — verified on 3.6.x):**
> 1. **Requires experimental mode.** `agent().execute({ output })` throws
>    `ExperimentalNotConfiguredError` unless the Stagehand constructor sets `experimental: true`.
>    Note experimental mode changes execution (it bypasses the managed Stagehand API path), so prefer
>    the alternative below for production. **This applies to three agent features — `output` schema,
>    custom `tools` (§3.5), and MCP `integrations` (§3.7) all require `experimental: true`** (validated
>    together at agent creation). If you keep any of them, set it on the constructor and note the
>    managed-API-bypass tradeoff in the migration summary.
> 2. **Must be a zod *object*** (`output?: StagehandZodObject`) — unlike `extract`, a top-level
>    `z.array(...)` is rejected. Wrap lists: `z.object({ items: z.array(...) })`.
>
> **Recommended non-experimental pattern for a typed result from an agentic task:** run the agent
> without `output`, then do a separate `stagehand.extract("...", zodSchema)` on the final page (or
> over `result.message`). This keeps the managed API path and lets `extract` use a top-level array.
| `Browser()` (local default) | `new Stagehand({ env: "LOCAL", localBrowserLaunchOptions: { ... } })` |
| `Browser(cdp_url=session.connect_url)` (Browserbase) | `new Stagehand({ env: "BROWSERBASE" })` — Stagehand creates & manages the session |
| `BrowserProfile(headless=False)` | `localBrowserLaunchOptions: { headless: false }` |
| `BrowserProfile(proxy=...)` / Browserbase proxies | `browserbaseSessionCreateParams: { proxies: true }` |
| `BrowserProfile(user_data_dir=...)` / `storage_state=...` | Browserbase **Context** (`browserSettings.context: { id, persist: true }`) or LOCAL `localBrowserLaunchOptions.userDataDir` |
| `BrowserProfile(allowed_domains=[...])` | No first-class equivalent — see [§5 Gaps](#5-gaps-no-clean-equivalent) |
| `sensitive_data={...}` | `act("...%key%...", { variables: { key } })` |
| `initial_actions=[...]` | plain deterministic code before the AI calls: `await page.goto(...)`, etc. |
| `Tools()` / `@tools.action(...)` | `agent({ tools: { name: tool({...}) } })` (Vercel AI SDK), or just plain TS for deterministic side-effects |
| `use_vision=True / False / "auto"` | agent `mode: "hybrid"/"cua"` (vision) vs `"dom"` (default, no vision) |
| `page_extraction_llm=...` | `extract("...", schema, { model })` |
| `planner_llm=...` | `agent({ model, executionModel })` — `model` plans, `executionModel` runs the inner act/observe |

---

## 3. Detailed translations

### 3.1 The Agent (the central decision)

A browser-use `Agent` is a fully-agentic loop: the LLM decides every click. In Stagehand you
choose how much of that to keep. **Default to decomposition** when the script's intent reveals a
concrete sequence; fall back to `agent()` only for genuinely open-ended tasks. Always note the
choice in the migration summary. (Full decision framework: [determinism.md](determinism.md).)

**Before — browser-use**
```python
from browser_use import Agent, ChatAnthropic

agent = Agent(
    task="Go to Hacker News and open the top story",
    llm=ChatAnthropic(model="claude-sonnet-4-6"),
)
history = await agent.run(max_steps=30)
print(history.final_result())
```

**After — decomposed (preferred: deterministic, debuggable, cheaper)**
```typescript
import { Stagehand } from "@browserbasehq/stagehand";

const stagehand = new Stagehand({ env: "BROWSERBASE", model: "anthropic/claude-sonnet-4-6" });
await stagehand.init();

const page = stagehand.context.pages()[0];
await page.goto("https://news.ycombinator.com");
await stagehand.act("click the top story link");

await stagehand.close();
```

**After — faithful agentic (when the flow is open-ended)**
```typescript
const stagehand = new Stagehand({ env: "BROWSERBASE", model: "anthropic/claude-sonnet-4-6" });
await stagehand.init();

const agent = stagehand.agent();
const result = await agent.execute({
  instruction: "Go to Hacker News and open the top story",
  maxSteps: 30,
});
console.log(result.message);

await stagehand.close();
```

### 3.2 Structured output → `extract()` with a zod schema

Pydantic models become zod schemas. v3 supports a **top-level array schema** (no wrapper object
needed). Prefer extracting *after* navigating to the page deterministically.

**Before**
```python
from pydantic import BaseModel
from browser_use import Agent, ChatOpenAI

class Story(BaseModel):
    title: str
    points: int

class Stories(BaseModel):
    stories: list[Story]

agent = Agent(
    task="Get the top 5 Hacker News stories with title and points",
    llm=ChatOpenAI(model="gpt-5"),
    output_model_schema=Stories,
)
history = await agent.run()
data = history.structured_output   # Stories instance
```

**After**
```typescript
import { z } from "zod";

const page = stagehand.context.pages()[0];
await page.goto("https://news.ycombinator.com");

const stories = await stagehand.extract(
  "extract the top 5 stories with their title and points",
  z.array(z.object({
    title: z.string(),
    points: z.number(),
  })),
);
// stories is fully typed: { title: string; points: number }[]
```

Use `.describe()` on fields to steer the model, mirroring Pydantic `Field(description=...)`:
```typescript
z.object({ price: z.string().describe("price including the currency symbol") })
```

### 3.3 Sensitive data / login → `variables`

browser-use's `sensitive_data` keeps secrets out of the prompt by injecting placeholder keys.
Stagehand's `variables` do the same: the `%key%` token is sent to the LLM, the real value is
substituted locally and never leaves your machine.

**Before**
```python
sensitive_data = {
    "https://example.com": {"x_user": "real@email.com", "x_pass": "s3cret"},
}
agent = Agent(
    task="Log into example.com with username x_user and password x_pass",
    llm=llm,
    sensitive_data=sensitive_data,
    use_vision=False,
    browser=Browser(allowed_domains=["https://*.example.com"]),
)
await agent.run()
```

**After**
```typescript
const page = stagehand.context.pages()[0];
await page.goto("https://example.com/login");

await stagehand.act("type %username% into the email field", {
  variables: { username: process.env.APP_USER! },
});
await stagehand.act("type %password% into the password field", {
  variables: { password: process.env.APP_PASS! },
});
await stagehand.act("click the sign in button");
```
For repeat runs, prefer a **Browserbase Context** so you log in once and reuse the authenticated
state (see §4) — this is the biggest reliability win in most migrations.

### 3.4 Browser configuration

**Local (dev)**
```python
# browser-use
browser = Browser(browser_profile=BrowserProfile(headless=False))
```
```typescript
// Stagehand
const stagehand = new Stagehand({
  env: "LOCAL",
  localBrowserLaunchOptions: { headless: false, viewport: { width: 1280, height: 720 } },
});
```

**Browserbase (prod)** — in browser-use you create the session yourself and pass `cdp_url`. In
Stagehand, `env: "BROWSERBASE"` creates and manages the session for you.
```python
# browser-use
bb = Browserbase(api_key=os.environ["BROWSERBASE_API_KEY"])
session = bb.sessions.create(project_id=os.environ["BROWSERBASE_PROJECT_ID"])
browser = Browser(browser_profile=BrowserProfile(cdp_url=session.connect_url))
```
```typescript
// Stagehand — apiKey/projectId default to BROWSERBASE_API_KEY / BROWSERBASE_PROJECT_ID env vars
const stagehand = new Stagehand({ env: "BROWSERBASE" });
```

### 3.5 Custom actions (`@tools.action`)

Decide whether the action is a **deterministic side-effect** (just write TypeScript) or a
**capability you want the autonomous agent to choose** (register a tool).

**Before**
```python
from browser_use import Tools, ActionResult, BrowserSession

tools = Tools()

@tools.action("Save the current URL to a file")
async def save_url(browser_session: BrowserSession) -> ActionResult:
    url = await browser_session.get_current_page_url()
    with open("url.txt", "w") as f:
        f.write(url)
    return ActionResult(extracted_content=f"saved {url}")

agent = Agent(task="...", llm=llm, tools=tools)
```

**After — option A: plain code (preferred for deterministic side-effects)**
```typescript
import { writeFile } from "node:fs/promises";

const page = stagehand.context.pages()[0];
const url = page.url();
await writeFile("url.txt", url);
```

**After — option B: a tool the agent can call** (uses the Vercel AI SDK `tool()`; **requires
`experimental: true`** — see the experimental callout below). **`ai` must be v5** (`"ai": "^5.0.0"`):
Stagehand 3.6.x types `tools` as the v5 `ToolSet` (schema field **`inputSchema`**); the v4 `tool()`
helper emits `parameters` and fails to type-check. If you can't pin v5, drop the `tool()` helper and
use a plain object `{ description, inputSchema: zodSchema, execute }` (satisfies the v5 `ToolSet`
regardless of the resolved `ai` major).
```typescript
import { tool } from "ai"; // add the "ai" package (Vercel AI SDK) to your deps
import { z } from "zod";
import { writeFile } from "node:fs/promises";

const stagehand = new Stagehand({
  env: "BROWSERBASE",
  experimental: true, // REQUIRED for agent `tools` (throws ExperimentalNotConfiguredError otherwise)
  model: "anthropic/claude-sonnet-4-6",
});
await stagehand.init();

const page = stagehand.context.pages()[0];

const agent = stagehand.agent({
  tools: {
    saveUrl: tool({
      description: "Save the current page URL to a file",
      // The original reads the URL from `browser_session`, NOT the LLM. So take
      // no model args and close over `page` — otherwise the model can pass a
      // guessed/hallucinated URL. (Only put a field in inputSchema when the value
      // genuinely has to come from the agent's reasoning.)
      inputSchema: z.object({}),
      execute: async () => {
        const url = page.url();
        await writeFile("url.txt", url);
        return `saved ${url}`;
      },
    }),
  },
});
await agent.execute("...");
```

**Custom-action gaps (flag for human review — no clean 1:1):**
- **Injected special params.** browser-use auto-wires `browser_session`, `cdp_client`,
  `page_extraction_llm`, `available_file_paths`, etc. into an action by signature. Stagehand tools
  get none of that — instead **close over** what you need in the `execute` body (capture the
  `stagehand` instance / `page`, call `stagehand.act/extract` inside the tool).
- **`domains=[...]` per-action filtering** — no equivalent; gate inside `execute` with a `page.url()`
  host check (same pattern as the `allowed_domains` gap in §5).
- **`terminates_sequence=True`** — no equivalent control-flow flag.

### 3.6 Secondary models

| browser-use | Stagehand v3 |
|---|---|
| `page_extraction_llm=ChatOpenAI(model="gpt-5-mini")` | `extract("...", schema, { model: "openai/gpt-5-mini" })` |
| `planner_llm=...` + main `llm=...` | `agent({ model: "<planner>", executionModel: "<cheaper inner model>" })` |

### 3.7 MCP integration

browser-use has MCP in **two directions** — map only the *client* direction.

**(a) browser-use as MCP _client_ (consumes an external MCP server)** → Stagehand
`agent({ integrations })` (**requires `experimental: true`**). Stagehand accepts either a URL string
or an MCP `Client` from `connectToMCPServer({ command, args, env })`, so both browser-use transports map:

**Before — browser-use (`MCPClient`, stdio/local server)**
```python
from browser_use.mcp.client import MCPClient
from browser_use import Tools, Agent, ChatOpenAI

tools = Tools()
mcp = MCPClient(server_name="filesystem", command="npx",
                args=["-y", "@modelcontextprotocol/server-filesystem", "/tmp"])
await mcp.connect()
await mcp.register_to_tools(tools)              # external MCP tools become agent actions
agent = Agent(task="...", llm=ChatOpenAI(model="gpt-4o"), tools=tools)
```
**After — Stagehand**
```typescript
import { Stagehand, connectToMCPServer } from "@browserbasehq/stagehand";

const stagehand = new Stagehand({
  env: "BROWSERBASE",
  experimental: true, // REQUIRED for `integrations`
  model: "openai/gpt-4.1-mini",
});
await stagehand.init();

// local/stdio MCP server -> Client instance:
const fsClient = await connectToMCPServer({
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
});
const agent = stagehand.agent({ integrations: [fsClient] });
// remote MCP server -> just the URL: integrations: ["https://mcp.example.com/mcp?key=..."]
```
- `register_to_tools(..., tool_filter=[...], prefix="...")` has **no equivalent** — Stagehand attaches
  all of the server's tools; flag if the source filtered/renamed them.

**(b) browser-use as MCP _server_** (`uvx browser-use --mcp`, exposing the browser as MCP tools to
Claude Desktop etc.) → **no Stagehand equivalent.** This is not a script migration — flag it as out of
scope rather than converting it.

For both MCP-client transports, dispose the connection in `finally`: an MCP `Client` exposes
`.close()` (the analog of browser-use's `await mcp.disconnect()`).

> ⚠️ **Known runtime bug (Stagehand 3.6.0, verified live):** passing a **`Client` instance** (i.e. a
> local/stdio server via `connectToMCPServer`) into `integrations` throws
> `TypeError: Converting circular structure to JSON` *before the agent runs* — `agent()` does
> `JSON.stringify(options.integrations)` for event logging and the Client object is circular
> (reproduced with two different MCP servers). A plain **URL-string** integration is unaffected, so
> prefer **remote/URL MCP** until this is fixed upstream; for a stdio-only server, flag that the
> migration is correct but blocked by this Stagehand bug.

### 3.8 Real-world patterns (embedded code, vision, legacy result handling)

Real browser-use lives inside apps, not clean `main()` scripts. Handle these explicitly:

- **Embedded / wrapped code** (a LangChain `BaseTool`, FastAPI route, Celery/queue task, an
  `Executor` class). Convert **only the browser-use surface** — `Agent(...)` construction,
  `agent.run()`, result handling, custom tools — and **preserve the surrounding app glue** (the class,
  decorators, routing, logging) as-is. The `init()`/`close()`-in-`main()` skeleton and "page via
  `context.pages()[0]`" checklist items don't apply verbatim to a wrapper; adapt them to the wrapper's
  lifecycle.
- **Sync-over-async.** Legacy embedded code often drives the async `agent.run()` from a sync method via
  `asyncio.new_event_loop()`. There's no faithful Node equivalent — the converted method becomes
  `async` and callers must `await` it. Note this in the migration summary.
- **Long-lived stateful executors.** A persistent mutable `self.agent` (`add_new_task`, `pause/resume`,
  mid-run controller swaps, EventBus re-init) has **no Stagehand analog** — Stagehand agents aren't
  long-lived mutable objects. Model continuity with the stateless `messages` array (`AgentResult.messages`
  → next `execute({ messages })`) and rebuild tools per `agent()` call. `pause/resume` ≈ `AbortSignal`;
  `rerun_history(plan)` ≈ observe→act caching, **not** a 1:1. Flag these.
- **Vision intent.** If the source LLM is a vision model (`vl_`/`ChatVL`-style, `use_vision=True`) but
  you map it to a text model string, you silently drop vision. Preserve the intent with agent
  `mode: "hybrid"` or `"cua"` (both need `experimental: true`), or flag it.
- **Legacy result API.** Besides `history.final_result()` (method), legacy code uses the attribute form
  `result.final_result` and `isinstance(result, AgentHistoryList)` coercion → all map to
  `result.message` / `result.output` from the Stagehand agent result.

---

## 4. Browserbase platform features

Everything you could set on a raw Browserbase session is reachable through
`browserbaseSessionCreateParams` (it is literally Browserbase's `SessionCreateParams`).

| Need | browser-use today | Stagehand v3 |
|---|---|---|
| Persistent auth / cookies | `storage_state` / `user_data_dir` | **Context**: `browserSettings.context: { id, persist: true }` |
| Proxies | profile proxy / BB session proxies | `proxies: true` (or array form for geo/domain rules) |
| Stealth / fingerprinting | (mostly via BB session) | `browserSettings.advancedStealth: true` (Scale plan); Verified Sessions |
| Captcha solving | BB session | `browserSettings.solveCaptchas: true` (on by default) |
| Ad blocking | — | `browserSettings.blockAds: true` |
| Region | — | `region: "us-east-1" | "us-west-2" | "eu-central-1" | "ap-southeast-1"` |
| Keep session alive | `keep_alive=True` | `keepAlive: true` |
| Downloads | — | `bb.sessions.downloads.list(id)` via `@browserbasehq/sdk` |

```typescript
const stagehand = new Stagehand({
  env: "BROWSERBASE",
  browserbaseSessionCreateParams: {
    projectId: process.env.BROWSERBASE_PROJECT_ID!,
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

## 5. Gaps (no clean equivalent)

Call these out explicitly in the migration summary — they are guardrails or behaviors that do
not transfer 1:1.

- **`allowed_domains`** — browser-use can hard-block navigation off an allow-list. Stagehand has
  no built-in domain firewall. Mitigations: (a) constrain the autonomous agent via `systemPrompt`
  ("only operate within example.com"); (b) use Browserbase proxy **domain rules**; (c) enforce in
  your own code — check `page.url()` before acting. If the source relied on `allowed_domains` as a
  security boundary (it pairs with `sensitive_data`), flag it as **needs human review**.
- **Per-step thinking / `use_thinking` / `flash_mode`** — browser-use exposes loop-level
  reasoning knobs. In Stagehand, decomposed `act`/`extract` calls are already targeted; for speed,
  use a fast model (`google/gemini-2.5-flash`) and decomposition rather than a "flash mode" flag.
- **`max_actions_per_step`** — no equivalent; decomposition makes each action explicit instead.
- **`initial_actions`** — there is no special field; it simply becomes ordinary code that runs
  before your first AI call.

---

## 6. Legacy browser-use patterns → current (normalize before translating)

| Legacy | Current browser-use |
|---|---|
| `Browser(config=BrowserConfig(...))` | `Browser(browser_profile=BrowserProfile(...))` or kwargs on `Browser(...)` |
| `BrowserContext` | gone — folded into `BrowserSession` |
| `Controller()` + `@controller.action` ; `controller=` | `Tools()` + `@tools.action` ; `tools=` |
| custom-action param `browser: Browser` | `browser_session: BrowserSession` |
| `cdp_url` inside `BrowserConfig` | `cdp_url` on `Browser` / `BrowserProfile` |

---

## Version notes (read before translating)

- **Stagehand v3 moved the AI methods onto the instance.** It is `stagehand.act(...)`,
  `stagehand.extract(...)`, `stagehand.observe(...)` — **not** `page.act(...)`. The page object
  (for `goto`, locators, etc.) is `stagehand.context.pages()[0]`. Most v2 examples online still
  show `page.act()` / `stagehand.page` — do not copy them verbatim.
- **Models are `"provider/model"` strings** (e.g. `"anthropic/claude-sonnet-4-6"`), set via the
  `model` constructor field. Prefer the string form; the object form
  `{ modelName, ...clientOptions }` still exists for passing client options, but the bare string is
  the idiomatic v3 path.
- **Page settling:** use `page.waitForLoadState("domcontentloaded")` / `"load"`, **not
  `"networkidle"`** (it times out on Google/analytics/long-poll pages).
- **Agent `output` schema requires `experimental: true`** on the constructor and must be a zod
  *object* (not a top-level array). See the "Agent `output` gotchas" callout in §2; prefer the
  agent-then-`extract` pattern to avoid experimental mode.
- **Caching:** `cacheDir` (local) and `serverCache` (Browserbase, default on) replace v2's
  `enableCaching`. `domSettleTimeoutMs` → `domSettleTimeout`.
- **zod is a peer dependency** (v3 or v4): the consuming project must `npm install zod`.
- Always confirm exact signatures against the installed version: <https://docs.stagehand.dev/v3>.
- browser-use model strings move fast; the **class names and `model=` parameter are stable**, the
  exact model ids are not. Pin them per the team's installed version.
