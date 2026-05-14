---
name: browser-swarm
description: Coordinate multiple browser agents in one real Chromium-family profile through a Chrome extension bridge, browser-managed tabs, and target-bound browse CLI endpoints.
compatibility: "Requires Node.js 20+, a Chromium-family browser with extension support, the browse CLI with --cdp and --session support, a locally loaded browser-swarm Chrome extension, and the /browser skill for CLI command reference."
license: MIT
allowed-tools: Bash
---

# Browser Swarm

Use this skill when one task benefits from several independent browser workstreams that should share the user's real browser profile, cookies, and extensions.

The top-level agent owns the user intent, decomposition, business logic, synthesis, and approval gates. Worker agents own one bounded browser workstream each. The browser-swarm adapter owns the worker-to-tab mapping and gives each worker a scoped browser capability.

This is tab capability isolation, not full browser identity isolation. All workers share the same real browser profile, cookies, local storage, extensions, and logged-in user state. The isolation promise is that each worker's browse endpoint exposes only its assigned tab.

## Architecture

The swarm has three parts:

1. A local adapter script in `scripts/swarm-relay.mjs`.
2. A Manifest V3 Chrome extension in `extension/`.
3. One unique `browse --session <worker-session> --cdp <target-bound-url>` context per worker.

Flow:

```text
top-level agent
  -> starts/checks browser-swarm adapter
  -> ensures N labeled tabs
  -> spawns worker agents with one command contract each
  <- receives evidence and synthesizes final answer

worker agent
  -> browse ... --session <worker-session> --cdp <target-bound-url>
  -> sees only its assigned tab
```

The extension is browser transport and tab control. The `browse` CLI remains the worker-facing browser API. The adapter exposes one target-bound CDP URL per tab so each worker keeps a stable active-page model without cross-agent tab races. Chrome tab groups are only visual organization when the browser supports them cleanly; they are not part of the isolation boundary.

## Setup

From the skills repo:

```bash
cd skills/browser-swarm
npm install
```

Start the real-browser setup helper:

```bash
node scripts/setup-real-browser.mjs
```

## Readiness Check

Before creating a swarm, the top-level agent must verify that the local adapter and browser extension are ready:

```bash
curl -s http://127.0.0.1:19989/health
```

If the relay is down, start the real-browser setup helper:

```bash
node scripts/setup-real-browser.mjs
```

If the relay is up but `extensionConnected` is `false`, guide the user through the manual extension install instead of trying to install silently:

```text
I need the Browser Swarm extension loaded in the browser you want controlled.

In Arc or Chrome:
1. Enable Developer Mode.
2. Click "Load unpacked".
3. Select:
   <printed skills/browser-swarm/extension path>
4. Leave this setup command running until extensionConnected is true.
```

For Arc specifically:

```bash
node scripts/setup-real-browser.mjs --browser arc
```

For Chrome specifically:

```bash
node scripts/setup-real-browser.mjs --browser chrome
```

Proceed to `Create A Swarm` only after `/health` reports `extensionConnected: true`.

### Real Browser Mode

Use this mode when the user wants the swarm in their own browser profile, for example Arc, Chrome, Chrome Canary, Chromium, or Chrome for Testing.

By default the helper opens `chrome://extensions` through the OS URL opener using the cross-platform `open` package. On a user's machine this should land in their default Chromium-family browser; for example Arc may route it to `arc://extensions`. This is not profile detection. If the opened browser/profile is not the one the user wants controlled, stop and rerun with an explicit browser.

The setup helper starts the relay if needed, opens the extension management page, prints the unpacked extension path, and waits until the extension connects:

```bash
node scripts/setup-real-browser.mjs
node scripts/setup-real-browser.mjs --browser arc
node scripts/setup-real-browser.mjs --browser chrome
node scripts/setup-real-browser.mjs --browser canary
node scripts/setup-real-browser.mjs --browser chromium
node scripts/setup-real-browser.mjs --browser chrome-for-testing
node scripts/setup-real-browser.mjs --extensions-url arc://extensions
```

The user must still approve/install the extension in the browser they want controlled:

1. Enable developer mode if needed.
2. Click "Load unpacked".
3. Select the printed `skills/browser-swarm/extension` path.
4. Wait for the helper or confirm manually:

```bash
curl -s http://127.0.0.1:19989/health
```

Proceed only when `extensionConnected` is `true`. If it is false, ask the user to confirm the extension is installed and enabled in the chosen browser/profile.

Do not try to install an unpacked extension into an already-running personal browser profile without the user's approval. The only automated install path in this POC is launching a separate browser process with `--load-extension`, which creates a separate test browser rather than using the user's active browser.

The default supported relay port is `19989`. The current extension connects to that port by default; non-default ports are only supported after the extension has been explicitly configured to use that port.

Arc Spaces caveat: Arc is Chromium-based, but Arc Spaces are not Chrome tab groups. In Arc real-browser mode, create swarms with `--no-group` so the extension never calls `chrome.tabGroups.*` or `chrome.tabs.group`. Worker isolation still comes from target-bound endpoints, not from Arc's visual grouping.

After changing the extension files, manually reload Browser Swarm Bridge in `arc://extensions` before judging Arc behavior. If pointer or keyboard submission is inconsistent in Arc background tabs, prefer DOM-level writes such as `browse fill` followed by a target-bound `browse eval 'document.querySelector("form").requestSubmit()'`, or serialize the irreversible action through the top-level harness.

### Disposable Test Browser Mode

Use this mode only for e2e tests, demos, and throwaway profiles. It launches a separate browser profile:

```bash
node scripts/launch-chrome.mjs
node scripts/launch-chrome.mjs --relay-port 19990
```

The relay listens only on `127.0.0.1`. Use `--relay-port` when another installed Browser Swarm extension, for example Arc, is already connected to the default port; the launcher creates a temporary extension copy pointed at the requested port.

## Prerequisites

The `/browser` skill contains the canonical `browse` CLI command reference. Ensure it is installed, then read it:

```bash
# Install if not already present
npx skills add browserbase/skills --skill browser -a '*' -g -y

# Load the command reference into context
cat ~/.agents/skills/browser/SKILL.md
```

Use only commands from that reference and the worker contract below. Do not invent flags or subcommands.

## Create A Swarm

Allocate one tab per workstream:

```bash
node scripts/swarm-relay.mjs ensure \
  --count 3 \
  --label flights \
  --label rentals \
  --label dinner \
  --url "https://www.google.com/travel/flights" \
  --url "https://www.google.com/search?q=san+diego+surfing+rentals+downtown" \
  --url "https://www.kayak.com/San-Diego.10760.guide" \
  --json
```

The response contains a `wsUrl` per target. The top-level agent must create one unique browse session name per worker and hand exactly one `wsUrl` plus one session name to each worker.

When the controlled browser is Arc, always disable visual tab grouping:

```bash
node scripts/swarm-relay.mjs ensure \
  --no-group \
  --count 2 \
  --label research-a \
  --label research-b \
  --json
```

Session naming pattern:

```text
browser-swarm-<label>-<short-id>
```

## Worker Contract

Every worker must:

- Use only its assigned `wsUrl` by passing `--cdp "<wsUrl>"` on every `browse` command.
- Use only its assigned session by passing `--session "<session>"` on every `browse` command.
- Never use `browse tab new`, `browse tab close`, or `browse tab switch`.
- Only use commands documented in the `/browser` skill.
- Return concrete evidence: final URL, title, useful extracted facts, and screenshot path when relevant.
- Avoid irreversible actions such as purchases, reservations, or form submission without explicit user confirmation.

The top-level harness should launch independent workers in parallel and require a structured final report from each worker. The minimum report is:

```json
{
  "status": "ok",
  "label": "<worker-label>",
  "currentAction": "<what the worker just did>",
  "title": "<final page title>",
  "url": "<final page URL>",
  "tabCount": 1,
  "targetId": "<assigned target id>",
  "evidence": ["<facts, paths, or extracted values>"]
}
```

The harness should verify important worker claims through the same target-bound endpoint before synthesizing the final answer.

Worker prompt shape:

```text
You own the "<label>" browser-swarm tab.

For every browse command, include both flags exactly:
--session "<session>"
--cdp "<wsUrl>"

<Include the Commands section from ~/.agents/skills/browser/SKILL.md here>

Do not create, close, or switch tabs. Do not use any other browser target.
Do not invent browse flags or commands. Only use commands from the reference above.
Find options, collect evidence, and report concise structured results.
```

Example worker commands:

```bash
browse get title --session "browser-swarm-flights-a1b2c3d4" --cdp "ws://127.0.0.1:19989/devtools/browser/<targetId>"
browse snapshot --compact --session "browser-swarm-flights-a1b2c3d4" --cdp "ws://127.0.0.1:19989/devtools/browser/<targetId>"
browse screenshot --path /tmp/browser-swarm/flights.png --session "browser-swarm-flights-a1b2c3d4" --cdp "ws://127.0.0.1:19989/devtools/browser/<targetId>"
```

## Offsite Pattern

For a task like "plan an offsite to San Diego next week - we need flights booked, surfing rentals and dinner near downtown":

1. Create three tabs: `flights`, `rentals`, `dinner`.
2. Spawn one worker per tab.
3. Assign `flights` to Google Flights or Kayak flights.
4. Assign `rentals` to San Diego surf rental search/results.
5. Assign `dinner` to restaurants near downtown San Diego.
6. Aggregate worker evidence into one plan and list any actions requiring approval before booking.

## Adapter Isolation Contract

The adapter must preserve the worker-owned-tab model:

- `Target.getTargets` on a target-bound endpoint returns only the assigned tab.
- `Target.getTargetInfo` and `Target.attachToTarget` reject sibling target IDs.
- Worker endpoints reject tab creation and closing. Tab lifecycle belongs to the top-level browser-swarm harness.
- Events are forwarded only to clients that own the event target.

This contract is what keeps subagents from racing over Chrome's active tab state. If a worker is handed a raw, unscoped ModCDP or browser CDP endpoint, this isolation contract no longer holds.

## Future ModCDP Substrate

ModCDP is a promising replacement for the hand-rolled extension transport and CDP forwarding code. Do not make workers connect directly to a generic ModCDP proxy as the final browser-swarm interface. The final shape should remain:

```text
browse CLI -> browser-swarm adapter -> ModCDP or extension transport -> real browser tab
```

ModCDP should become the lower-level substrate only after an adapter spike proves it can preserve the target-bound worker isolation behavior above.
