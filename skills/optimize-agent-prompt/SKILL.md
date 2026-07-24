---
name: optimize-agent-prompt
description: Builds and improves Browserbase Agent API demos through an Autobrowse-style outer loop: run a fixed task, collect Agent messages and session logs, score the result, revise one system-prompt heuristic, and confirm convergence. Use when creating a Browserbase Agents demo or POC, optimizing an Agent system prompt, diagnosing flaky Agent runs, or applying auto-research/autobrowse to the Browserbase Agents API.
license: MIT
compatibility: "Requires Node.js 18+ and BROWSERBASE_API_KEY. Uses only Node built-ins."
allowed-tools: Bash Read Write Edit Grep Glob
---

# Optimize Agent Prompt

Optimize a Browserbase Agent's `systemPrompt` while holding its task, result schema, variables, and evaluation criteria fixed. Treat the outer agent as the teacher and each Browserbase Agent run as an inner-agent rollout.

## Set up the experiment

Choose a short experiment name and create an isolated workspace inside the demo or POC repository:

```bash
node <skill-dir>/scripts/optimize_agent_prompt.mjs init \
  --workspace ./agent-prompt-optimization/<experiment-name> \
  --name <experiment-name>
```

Edit the generated files:

- `task.json`: keep `task`, `resultSchema`, variables, browser settings, and evaluation oracle stable across iterations.
- `prompts/iteration-001.md`: write the minimal baseline system prompt. Include irreversible-action guardrails when applicable.

Use concrete success criteria. Prefer a strict JSON Schema with required fields and `null` for unavailable facts. Add known-field regexes and factuality-warning regexes under `evaluation` when a truth oracle exists. Read [references/evaluation.md](references/evaluation.md) when designing the task or score.

## Run the baseline

```bash
node <skill-dir>/scripts/optimize_agent_prompt.mjs run \
  --workspace ./agent-prompt-optimization/<experiment-name> \
  --prompt prompts/iteration-001.md \
  --label iteration-001
```

The harness creates one reusable Browserbase Agent, updates its `systemPrompt` on later iterations, starts the run, polls messages and status, and writes:

```text
runs/<label>/
├── system-prompt.md
├── created-run.json
├── run.json
├── messages.json
├── session-logs.json
└── summary.json
```

It stops a run after the configured message budget instead of paying for an unproductive spiral. Use `--max-messages`, `--timeout-ms`, `--proxies`, or `--verified` only when the task needs different values from `task.json`.

## Diagnose from observable evidence

Start with the compact trajectory:

```bash
node <skill-dir>/scripts/optimize_agent_prompt.mjs inspect \
  --workspace ./agent-prompt-optimization/<experiment-name> \
  --label iteration-001
```

Then read `summary.json` and drill into `messages.json` at the first wrong or wasted turn. Agent messages expose ordered tool calls, tool results, errors, and final output. A `reasoning` part may contain no readable text; never require hidden chain-of-thought for the teacher loop.

Read `session-logs.json` only when browser-level evidence can distinguish the cause—for example, a redirect, 403, failed request, console error, or hidden endpoint. Empty session logs can mean the Agent completed with search/fetch tools and never drove its browser.

See [references/api.md](references/api.md) for endpoint shapes, pagination, result normalization, and trace caveats.

## Improve one heuristic

Find the earliest consequential failure and state one counterfactual:

> If the system prompt had instructed X, the Agent would have avoided Y, as shown by tool result Z.

Copy the current prompt to `prompts/iteration-NNN.md` and make one attributable change. Typical improvements are:

- cap retries after a repeated block or identical error;
- distinguish public identifiers from private/internal IDs;
- prefer search/fetch before launching a browser when interaction is unnecessary;
- separate current snapshots from dated historical events;
- define when a qualified fallback counts as completed;
- require `null` instead of guessed values;
- add a tool-call or evidence budget.

Keep wins. If the new run regresses, restore the previous prompt and test a different hypothesis rather than stacking more rules.

## Judge and converge

Generate the comparison table after each run:

```bash
node <skill-dir>/scripts/optimize_agent_prompt.mjs report \
  --workspace ./agent-prompt-optimization/<experiment-name>
```

Judge more than field completeness. Require:

- terminal status `COMPLETED`;
- required fields populated or explicitly nullable;
- known-fact checks passing when available;
- no factuality-warning match;
- provenance and safety constraints preserved;
- fewer messages or lower duration without quality loss.

Once a prompt wins, run it again unchanged with a new label. Converge only after it passes at least two of the last three runs and one pass is an unchanged confirmation. Do not call a prompt globally optimal from one task; describe it as the best prompt for the tested task distribution.

## Graduate into the demo

Use the confirmed prompt as the Agent's production `systemPrompt`. Keep the strict result schema and per-run variables. Preserve the experiment workspace or its report so reviewers can audit why each instruction exists.

In the final handoff, report:

- baseline versus winning score, duration, and message count;
- the first wrong turn each prompt change fixed;
- whether session logs added evidence;
- the winning prompt path;
- confirmation-run results;
- limitations and the next holdout matrix.
