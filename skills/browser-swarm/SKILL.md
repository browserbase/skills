---
name: browser-swarm
description: Coordinate multiple browser agents in one real Chrome profile through a Chrome extension bridge, a colored tab group, and target-bound browse CLI endpoints.
compatibility: "Requires Node.js 20+, Chrome, the browse CLI (`npm install -g @browserbasehq/browse-cli`), and a locally loaded browser-swarm Chrome extension."
license: MIT
allowed-tools: Bash
---

# Browser Swarm

Use this skill when one task benefits from several independent browser workstreams that should share the user's real Chrome profile, cookies, and extensions.

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

Start the relay:

```bash
node scripts/swarm-relay.mjs serve --port 19989
```

Load the extension:

```bash
node scripts/launch-chrome.mjs
```

For a persistent install, load `skills/browser-swarm/extension` from `chrome://extensions` as an unpacked extension. The relay listens only on `127.0.0.1`.

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

- Use only its assigned `wsUrl`.
- Never use `tab_switch`.
- Return concrete evidence: final URL, title, useful extracted facts, and screenshot path when relevant.
- Avoid irreversible actions such as purchases, reservations, or form submission without explicit user confirmation.

Worker prompt shape:

```text
You own the "flights" browser-swarm tab.
Use browse with this exact target-bound CDP endpoint:
<wsUrl>

Run commands like:
browse --ws "<wsUrl>" snapshot --compact --json
browse --ws "<wsUrl>" open "https://www.google.com/travel/flights" --json
browse --ws "<wsUrl>" get title --json

Do not switch tabs. Do not use any other browser target. Find options, collect evidence, and report concise results.
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

