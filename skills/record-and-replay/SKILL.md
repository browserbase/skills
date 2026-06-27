---
name: record-and-replay
description: Record a human browser flow on a Browserbase session and replay it as a self-healing test. Use when you want to "show, don't prompt" a bug or workflow — capture clicks/typing/scrolls in a live cloud browser, save them as a Chrome DevTools Recorder file, then re-run them (with optional healing) to verify a flow still works. Triggers on "record this flow", "replay the recording", "record and replay", "turn this into a browser test".
compatibility: "Requires Node 18+ and the browse CLI (`npm install -g browse`). Cloud sessions need `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID`. Replay is zero-dependency (it drives the browse CLI); record uses `@browserbasehq/sdk` + `playwright-core`, so run `npm install` in this skill dir first."
license: MIT
allowed-tools: Bash, Read
---

# Record & Replay

"Show the bug instead of prompting it." Capture a human browser flow, get back a
portable recording, then replay it deterministically with selector healing.
Sessions run on Browserbase cloud browsers with a live, interactive view.

## Fundamental logic

- **Record** — attach to a Browserbase session over CDP, inject a listener that
  captures each human action as a *semantic step* (a priority-ordered list of
  selectors: `aria/Name` → `text/Label` → CSS path → XPath — plus value and
  timestamp). The fallback list IS the healing.
- **Replay** — drive every step through deterministic `browse` CLI subcommands,
  resolving each step highest-confidence-first:
  1. **semantic** — a recorded `aria/` or `text/` selector matched to a live
     accessibility-snapshot ref (survives dynamic-id churn, e.g. Google's `#cNNN`),
  2. **recorded** — the recorded XPath, then CSS, each *verified* with
     `browse get visible` before acting (`browse click` reports success even on a
     no-match, so a selector is never trusted blind),
  3. **heal** (`RR_HEAL=1`) — match the step's typed value (or the value typed
     just before) to a snapshot ref; this is what rescues unlabeled autocomplete
     picks whose only recorded selector was a dynamic id,
  4. **coords** (`RR_HEAL=1`) — last resort: `browse get box` a recorded selector
     and click its center.

Output is **Chrome DevTools Recorder** compatible, so recordings are also runnable
by `@puppeteer/replay`.

## Setup (once)

```bash
cd skills/record-and-replay && npm install   # only needed for `record`
npm install -g browse                         # the replay/record driver CLI
export BROWSERBASE_API_KEY=...  BROWSERBASE_PROJECT_ID=...
```

## Record

```bash
RR_URL="https://www.saucedemo.com" RR_OUT=/tmp/rec.json RR_TITLE="login flow" \
  node --env-file=.env scripts/record.mjs
```

1. The script prints a **live view URL** — open it and perform the flow (click, type, scroll).
2. Stop and save by pressing **ENTER** (interactive), creating the stop file
   (`touch /tmp/rr-stop`, lets an agent stop it conversationally), or setting
   `RR_SECONDS=30` to auto-stop.
3. A recording is written to `RR_OUT`.

| Var | Default | Meaning |
|-----|---------|---------|
| `RR_URL` | `https://example.com` | start URL |
| `RR_OUT` | `/tmp/recording-<ts>.json` | output recording path |
| `RR_TITLE` | `Recorded flow` | recording title |
| `RR_STOP` | `/tmp/rr-stop` | create this file to stop recording |
| `RR_SECONDS` | _(none)_ | auto-stop after N seconds instead of ENTER |

## Replay

```bash
RR_FILE=/tmp/rec.json RR_HEAL=1 \
  node --env-file=.env scripts/replay.mjs
```

Prints a per-step pass/fail report (with the resolution path used per step:
`semantic` / `xpath` / `css` / `healed`), a best-effort live-view URL, and saves a
screenshot of every step to `RR_SHOTS`.

| Var | Default | Meaning |
|-----|---------|---------|
| `RR_FILE` | _(required)_ | recording to replay |
| `RR_HEAL` | `0` | `1` = snapshot-ref + coordinate healing on selector miss |
| `RR_SHOTS` | `/tmp/replay-<ts>` | screenshot output dir |
| `RR_SESSION` | `rr-<ts>` | browse CLI session name |

## Recording shape

```json
{
  "title": "login flow",
  "source": "browserbase-record-replay",
  "startUrl": "https://www.saucedemo.com",
  "steps": [
    { "type": "navigate", "url": "https://www.saucedemo.com" },
    { "type": "change", "selectors": [["aria/Username"], ["#user-name"]], "value": "standard_user" },
    { "type": "click",  "selectors": [["text/Login"], ["#login-button"]] }
  ]
}
```
