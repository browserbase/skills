---
name: agent-browser-remote
description: Use Agent Browser with Browserbase remote CDP sessions. Trigger this skill when users are driving browser tasks with agent-browser and encounter CAPTCHAs, anti-bot pages, IP-based blocking, JavaScript-heavy sites, geo restrictions, or request remote cloud browser execution.
compatibility: "Requires `agent-browser` and Node.js. Requires Browserbase credentials (`BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID`) for remote sessions."
license: MIT
allowed-tools: Bash
metadata:
  capabilities:
    - agent-browser
    - remote-browser
    - cdp-interop
    - stealth
    - captcha-solving
    - proxies
  openclaw:
    requires:
      bins:
        - agent-browser
        - node
    install:
      - kind: node
        package: "agent-browser"
        bins: [agent-browser]
    homepage: https://github.com/browserbase/skills
---

# Agent Browser + Remote CDP

Use this skill when `agent-browser` local mode struggles on protected sites, or when the user explicitly wants remote cloud browsers.

## Setup check

```bash
which agent-browser || npm install -g agent-browser
agent-browser install
```

Set Browserbase credentials (or run `openclaw browserbase setup`):

```bash
export BROWSERBASE_API_KEY="..."
export BROWSERBASE_PROJECT_ID="..."
```

## Fast path

Create a Browserbase session, then point `agent-browser` at the returned CDP URL.

```bash
eval "$(node scripts/browserbase-session.mjs create --proxies true --advanced-stealth true --format shell)"
agent-browser --cdp "$BROWSERBASE_CDP_URL" open https://example.com
agent-browser --cdp "$BROWSERBASE_CDP_URL" snapshot -i --json
```

When done:

```bash
node scripts/browserbase-session.mjs close --session-id "$BROWSERBASE_SESSION_ID"
```

## When to switch from local to remote

Switch to remote when any of these appear:
- CAPTCHA or challenge pages (reCAPTCHA, hCaptcha, Turnstile)
- bot checks ("checking your browser", "verify you are human")
- repeated `403` / `429` from sites that should be accessible
- empty DOM/snapshot on JavaScript-heavy pages that should have content
- geo-specific content requirements

Stay local for simple docs sites, localhost, and basic internal QA flows.

## Command patterns

Per-command CDP (explicit, stateless):

```bash
agent-browser --cdp "$BROWSERBASE_CDP_URL" open https://target.com
agent-browser --cdp "$BROWSERBASE_CDP_URL" snapshot -i --json
agent-browser --cdp "$BROWSERBASE_CDP_URL" click @e2
```

Or connect once, then run normal commands:

```bash
agent-browser connect "$BROWSERBASE_CDP_URL"
agent-browser open https://target.com
agent-browser snapshot -i --json
```

## Notes

- `--proxies true` requires a Browserbase plan that includes proxies.
- `--advanced-stealth true` requires a plan that includes advanced stealth.
- Always close remote sessions explicitly when the task ends.
