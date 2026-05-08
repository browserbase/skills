---
name: browser-swarm
description: Coordinate multiple browser agents in one real Chromium-family profile through a Chrome extension bridge, a colored tab group, and target-bound browse CLI endpoints.
compatibility: "Requires Node.js 20+, a Chromium-family browser with extension support, the browse CLI (`npm install -g @browserbasehq/browse-cli`), a locally loaded browser-swarm Chrome extension, and the `/browser` skill for CLI command reference."
license: MIT
allowed-tools: Bash
---

# Browser Swarm

Use this skill when one task benefits from several independent browser workstreams that should share the user's real browser profile, cookies, and extensions.

The swarm has three parts:

1. A local relay script in `scripts/swarm-relay.mjs`.
2. A bare Manifest V3 Chrome extension in `extension/`.
3. One `browse --ws <target-bound-url>` context per worker.

The extension is transport and scope. The `browse` CLI is still the agent-facing browser API. Each worker gets a target-bound CDP URL that exposes only its assigned tab, so `browse` can keep using its active-page model without cross-agent tab races.

## Setup

From the skills repo:

```bash
cd skills/browser-swarm
npm install
```

Start the real-browser setup helper with the browser the user chose:

```bash
node scripts/setup-real-browser.mjs --browser arc
```

### Real Browser Mode

Use this mode when the user wants the swarm in their own browser profile, for example Arc, Chrome, Chrome Canary, Chromium, or Chrome for Testing.

Do not guess which browser/profile to use. If the user has not named one, ask. Default-browser detection is not enough because it does not identify the desired profile, space, or test browser. On macOS it may come from LaunchServices, on Windows from default app registry associations, and on Linux from `xdg-settings`, but those are only hints. Use `--browser default` only when the user explicitly asks to open the OS default browser.

The setup helper starts the relay if needed, opens the chosen browser's extension management page, prints the unpacked extension path, and waits until the extension connects:

```bash
node scripts/setup-real-browser.mjs --browser arc
node scripts/setup-real-browser.mjs --browser chrome
node scripts/setup-real-browser.mjs --browser canary
node scripts/setup-real-browser.mjs --browser chromium
node scripts/setup-real-browser.mjs --browser chrome-for-testing
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

### Disposable Test Browser Mode

Use this mode only for e2e tests, demos, and throwaway profiles. It launches a separate browser profile:

```bash
node scripts/launch-chrome.mjs
```

The relay listens only on `127.0.0.1`.

## Prerequisites

The `/browser` skill contains the canonical `browse` CLI command reference. Ensure it is installed, then read it:

```bash
# Install if not already present
npx skills add browserbase/skills --skill browser -a '*' -g -y

# Load the command reference into context
cat ~/.agents/skills/browser/SKILL.md
```

Use only commands from that reference. Do not invent flags or subcommands.

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

The response contains a `wsUrl` per target. Hand exactly one `wsUrl` to each worker.

## Worker Contract

Every worker must:

- Use only its assigned `wsUrl` by passing `--ws "<wsUrl>"` on every `browse` command.
- Never use `tab_switch`.
- Only use commands documented in the `/browser` skill.
- Return concrete evidence: final URL, title, useful extracted facts, and screenshot path when relevant.
- Avoid irreversible actions such as purchases, reservations, or form submission without explicit user confirmation.

When writing worker prompts, read the `/browser` skill's SKILL.md and include its Commands section in each worker prompt so the worker agent knows exact syntax. Workers are subagents with no prior context.

Worker prompt shape:

```text
You own the "<label>" browser-swarm tab.
Use browse with this exact target-bound CDP endpoint:
<wsUrl>

<Include the Commands section from ~/.agents/skills/browser/SKILL.md here>

All browse commands must include: --ws "<wsUrl>"
Do not switch tabs. Do not use any other browser target.
Do not invent browse flags or commands. Only use commands from the reference above.
Find options, collect evidence, and report concise results.
```

## Offsite Pattern

For a task like "plan an offsite to San Diego next week - we need flights booked, surfing rentals and dinner near downtown":

1. Create three tabs: `flights`, `rentals`, `dinner`.
2. Spawn one worker per tab.
3. Assign `flights` to Google Flights or Kayak flights.
4. Assign `rentals` to San Diego surf rental search/results.
5. Assign `dinner` to restaurants near downtown San Diego.
6. Aggregate worker evidence into one plan and list any actions requiring approval before booking.

## Why This POC Does Not Require `browse --target`

First-class target-scoped browse commands are still the long-term API. This POC derisks the bridge without waiting for that patch by making the relay expose a separate virtual browser endpoint per tab:

```bash
browse --ws "ws://127.0.0.1:19989/devtools/browser/<targetId>"
```

That endpoint advertises only one target to Playwright/Stagehand, so the existing `browse` active-page commands resolve to the owned tab. This is the next-best solution until `browse --target <targetId>` lands.
