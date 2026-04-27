---
name: browser-swarm
description: Coordinate multiple agents working in separate tabs of one local Chrome via Browserbase CLI auto-connect. Use for experimental same-browser multi-agent browsing, multi-tab task decomposition, /swarm-style workflows, or derisking whether a browser task can run in tandem across Gmail, expense tools, research sites, and other authenticated pages.
compatibility: "Requires Browserbase CLI (`bb browse`) or browse CLI, Chrome with remote debugging available, and `env local --auto-connect`. True concurrent tab ownership is safest with targetId-bound CDP, Playwright, or Stagehand scripting until browse CLI exposes target-scoped commands."
license: MIT
allowed-tools: Bash Agent
metadata:
  author: browserbase
  homepage: https://github.com/browserbase/skills
---

# Browser Swarm

Run multiple browser workstreams in separate tabs of the same user-owned Chrome session. Prefer `bb browse`; if the installed CLI only exposes `browse`, use the same subcommands without the `bb browse` prefix.

## Operating model

- Use one Chrome instance, many tabs, and one CLI session per workstream.
- Always start with `env local --auto-connect`; this is the product path being exercised.
- Treat the run as experimental until every session reports `localSource: "attached-existing"` and the same `resolvedCdpUrl`/browser websocket.
- Tabs do not need OS focus if an agent holds a target-specific page handle. They do need careful ownership if commands are routed through the active page.
- Subagent creation is an orchestrator-level responsibility. Do not assume a spawned worker can recursively create more workers; if nested agents are unavailable, the top-level agent should spawn all workstream agents itself.
- Do not submit purchases, payments, expense reports, reservations, emails, or irreversible forms without explicit user approval.

## Setup

Check the CLI:

```bash
which bb
bb browse --help
```

If `bb browse` is unavailable:

```bash
which browse
browse --help
```

Ask the user to open Chrome with remote debugging enabled if needed. If Chrome shows an "Allow remote debugging?" prompt, the user must approve it before auto-connect sessions can inspect or control tabs.

The installed CLI must include reliable auto-connect discovery. If `curl http://127.0.0.1:<port>/json/version` shows a debuggable browser but `status` still reports `localSource: "isolated-fallback"`, treat that as a CLI gap or stale CLI version and retest with the fixed/newer CLI before claiming the swarm works.

## Swarm workflow

Create one named session per workstream:

```bash
bb browse --session swarm-gmail env local --auto-connect
bb browse --session swarm-ramp env local --auto-connect
bb browse --session swarm-research env local --auto-connect
```

Verify all sessions are attached to the same browser:

```bash
bb browse --session swarm-gmail status
bb browse --session swarm-ramp status
bb browse --session swarm-research status
bb browse --session swarm-gmail pages
```

Use the final `status` output as the source of truth; the immediate `env local --auto-connect` response may only report `localStrategy: "auto"`. Proceed only if every session reports an attached existing local browser and the same browser websocket. If any session reports `localSource: "isolated-fallback"`, a fallback reason, or a different websocket, stop and fix auto-connect before continuing.

Create or identify one tab per workstream. Prefer `newpage` when claiming tabs because `open`/`goto` navigates the current active page and can race under parallel agents:

```bash
bb browse --session swarm-gmail newpage https://mail.google.com/
bb browse --session swarm-ramp newpage https://ramp.com/
bb browse --session swarm-research newpage https://www.google.com/search?q=san+diego+restaurants
```

When target ownership matters, derive the HTTP origin from the shared browser websocket and list targets directly:

```bash
curl -s http://127.0.0.1:9222/json/list | jq '.[] | {id, type, title, url}'
```

For low-risk reconnaissance, separate agents may use their named sessions to collect snapshots, page titles, screenshots, and status. For real concurrent mutation, give each agent an explicit target identity and require target-bound scripting instead of index-based tab switching.

## Parallel agent contract

The agent invoking this skill should be the top-level orchestrator. If the runtime exposes an Agent/subagent tool, spawn one worker per workstream from that top-level agent. If the skill is already running inside a spawned worker and no nested Agent tool is available, report that nested agents are unavailable and ask the parent/orchestrator to spawn the workers instead.

When spawning workers, give each one:

- The exact `--session` name it owns.
- The specific tab URL/title/targetId it owns.
- The user-visible limits, especially "do not submit" boundaries.
- The proof artifact it must return: status output, targetId, final URL/title, and screenshot path.

Use wording like:

```text
You own session swarm-gmail and targetId <target-id>. Stay in that tab. Do not use tab_switch by index. Use target-bound CDP/Playwright/Stagehand operations for mutations. Return evidence only; do not submit irreversible forms.
```

Do not substitute Browserbase Autonomous Agent sessions for Codex/Claude subagents unless the user explicitly asks for that product path; they are different execution models and do not prove editor-agent swarm orchestration.

## Target-bound fallback

Current browser CLIs can race when multiple agents rely on "current page" or `tab_switch <index>`. For robust tandem operation, attach to Chrome over CDP and operate on a specific target/page handle.

Stagehand/Understudy pattern:

```js
const { Stagehand } = require("@browserbasehq/stagehand");

const stagehand = new Stagehand({
  env: "LOCAL",
  localBrowserLaunchOptions: { cdpUrl },
});

await stagehand.init();
const page = stagehand.context.pages().find((candidate) => {
  return candidate.targetId && candidate.targetId() === targetId;
});

await stagehand.act("click the search box", { page });
await stagehand.extract("summarize the visible result", { page });
```

Playwright CDP pattern:

```js
const { chromium } = require("playwright");

const browser = await chromium.connectOverCDP(cdpUrl);
const context = browser.contexts()[0];
const page = context.pages().find((candidate) => {
  return candidate.url().includes("mail.google.com");
});

await page.fill("input[name='q']", "receipt OR itinerary");
await page.keyboard.press("Enter");
```

Prefer these patterns when agents must click, type, or extract in parallel. Do not rely on foreground focus for correctness.

## Known gaps to report

Report these as browse CLI gaps when they block a swarm:

- Commands route through the active page instead of a claimed target/page.
- Parallel `open`/`goto` calls can navigate the same active tab; use `newpage` plus targetId ownership instead.
- `tab_switch <index>` is not stable under parallel agents and focuses the tab.
- There is no first-class `claim target` / targetId-scoped command surface yet.
- Chrome may require a remote-debugging approval prompt for each new attaching process.

## Proof checklist

A successful run should include:

- Each session's `status` showing `localSource: "attached-existing"`.
- The shared `resolvedCdpUrl` or browser websocket for all sessions.
- A page list with the expected workstream tabs.
- Per-agent evidence: owned target/tab, final URL/title, and screenshot.
- Any gaps or CLI primitives needed before the workflow is safe to productize.
