---
name: browse-fleet-subagents
description: Orchestrate high-volume browser tasks by decomposing one objective into many independent units and fanning out execution through sub-agents, each owning its own browser workflow. Use when users need parallel browser work such as competitive monitoring, account sweeps, QA matrix checks, regression checks across many URLs, or load-style deterministic actions.
compatibility: "Requires the `browse` CLI. For protected targets, set Browserbase credentials (`BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID`) to use remote mode."
license: MIT
allowed-tools: Bash
metadata:
  capabilities:
    - parallel-subagents
    - task-decomposition
    - subagent-orchestration
    - retry-control
  openclaw:
    requires:
      bins:
        - browse
    install:
      - kind: node
        package: "@browserbasehq/browse-cli"
        bins: [browse]
    homepage: https://github.com/browserbase/skills
---

# Browser Fleet Orchestration

Use this skill for parallel browser operations, not single interactive tasks.

## Core rule

Treat "fleet" as an orchestration pattern, not a CLI primitive.
Run fanout through sub-agents.

## Sub-agent fanout (default)

Use this for multi-step tasks per target/account.

1. Build a worklist of independent units (URLs, account IDs, vendors, claims).
2. Give each sub-agent exactly one unit.
3. Require strict structured output from each sub-agent (JSON object).
4. Aggregate results and retry only failed units.

Suggested sub-agent prompt contract:

```text
Use /browser for exactly one target.
Steps:
1) open target URL
2) snapshot -c -i --main-frame
3) perform required action(s)
4) return JSON: {target, success, key_data, evidence, error}
Do not process multiple targets in one run.
```

## Deterministic batch pattern

1. Generate a normalized worklist (`[{id,url,goal}]`).
2. Spawn one sub-agent per work item.
3. Keep each sub-agent deterministic with strict step order.
4. Merge outputs and run retries on failures only.

## Research/exploratory pattern

1. Generate a coarse worklist.
2. Spawn sub-agents with bounded budgets (turns/timeouts).
3. Require each sub-agent to return confidence + evidence.
4. Escalate low-confidence items to a second pass.

## Recommended hybrid pattern

1. Run a broad first pass over all items.
2. Classify `ok / retry / escalate`.
3. Retry transient failures (timeouts, temporary blocks).
4. Escalate hard cases to sub-agents for deeper reasoning.

This keeps cost low while preserving high success on messy targets.

## Concurrency and reliability guardrails

- Start with conservative concurrency (5-15 workers), then ramp.
- For anti-bot targets, switch to Browserbase remote mode before fanning out.
- Cap each unit by timeout and max retries.
- Keep result schema stable across all workers.

## Cleanup

Always clean up browser state after fanout:

```bash
browse stop --force
pkill -f "browse.*daemon" || true
pkill -f "chrom(e|ium).*browse-" || true
```
