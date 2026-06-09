# bu-to-bb

Migrate **browser-use** (Python) automation to **Stagehand v3** (TypeScript) on **Browserbase**,
choosing the right level of determinism per step instead of a one-to-one agentic copy.

## Contents

- **[SKILL.md](SKILL.md)** — the skill: detect the browser-use variant, decide the determinism level
  per step, emit Stagehand v3 TypeScript + a migration summary.
- **[GUIDE.md](GUIDE.md)** — human migration guide: the philosophy shift, feature mapping, the
  determinism spectrum, and a recommended migration path.
- **[PROMPT.md](PROMPT.md)** — a self-contained, tool-agnostic version of the skill. Paste it into
  any AI assistant (Cursor, Windsurf, ChatGPT, Claude) with a browser-use script.
- **[EXAMPLES.md](EXAMPLES.md)** — before/after script pairs (simple task, structured extraction, login).
- **[references/](references/)** — the mechanical detail the skill consults:
  - [api-mapping.md](references/api-mapping.md) — exhaustive browser-use → Stagehand mapping + v3 gotchas.
  - [determinism.md](references/determinism.md) — the decision framework (agent vs act/extract/observe vs Playwright).
  - [trace-assisted.md](references/trace-assisted.md) — optional run-on-Browserbase + Session Logs path (pairs with the [`browser-trace`](../browser-trace/SKILL.md) skill).

## Why

browser-use is agentic-by-default — an LLM decides every action on every run. Stagehand lets you
choose how much AI to use: deterministic code for the known skeleton, `act`/`extract`/`observe` for
the parts that vary, and `agent()` only when the path is genuinely open-ended. The migration trades
a little upfront authoring for determinism, lower cost, and debuggability.

Targets Stagehand v3 (verified against the live docs) and was validated by running the skill on
fresh scripts a clean agent had never seen.
