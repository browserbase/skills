---
name: browser-record
description: Record a human browser flow on a Browserbase session and distill it into a reusable, parameterized task skill. Captures clicks/typing/screenshots (plus an optional full CDP trace), then an agent reasons about what the human *meant* — collapsing corrections, dropping abandoned actions — and writes an intent-level SKILL.md that replays against the live page. Use for "show, don't prompt": record a flow once and turn it into a skill. Triggers on "record this flow", "turn this into a skill", "record a browser workflow", "browser record".
compatibility: "Requires Node 18+ and the browse CLI (`npm install -g browse`), plus `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID`. Record uses `@browserbasehq/sdk` + `playwright-core` — run `npm install` in this skill dir. Pairs with the `browser-trace` skill for the full CDP firehose."
license: MIT
allowed-tools: Bash, Read, Grep
---

# Browser Record

"Show the bug instead of prompting it." Record a human flow once, then turn it
into a **reusable, parameterized task skill** an agent can replay against the live
page.

The pipeline is **capture wide, reason narrow**:

```
record (interaction stream + screenshots)              ← semantic spine
  + browser-trace (CDP firehose: network/console/DOM)  ← full observability
  → distill = teacher agent reasons about INTENT       ← collapses corrections,
  → skills/<task>/SKILL.md                                drops abandoned actions
```

The key idea: a recording is **mechanics** ("typed 'new yo', clicked `#c307`").
What you want is **intent** ("destination = New York"). Recovering intent —
including spotting that the user typed San Francisco, erased it, and chose Los
Angeles, or applied a filter then removed it — is a judgment, so the distiller is
**an agent, not a script** (see `references/distill.md`).

## 1. Capture

Record produces the **semantic spine**: each click/type with the acted element's
accessible `name` + `role` + committed value, plus a screenshot per step.

```bash
RR_URL="https://www.saucedemo.com" RR_OUT=/tmp/rec.json RR_TITLE="login flow" \
  node --env-file=.env scripts/record.mjs
```

Open the printed **live view URL**, perform the flow, then stop with ENTER,
`touch /tmp/rr-stop`, or `RR_SECONDS=30`. Output: `RR_OUT` + `<RR_OUT>-shots/`.

**For full observability**, attach `browser-trace` so the teacher agent can also
query network/console/DOM. Create one keep-alive session, point both at it:

```bash
node ../browser-trace/scripts/bb-capture.mjs --new myflow   # session + CDP firehose
SID=$(jq -r .browserbase.session_id .o11y/myflow/manifest.json)
CONNECT_URL=$(browse cloud sessions get "$SID" | jq -r .connectUrl)
RR_CONNECT_URL="$CONNECT_URL" RR_URL="https://site.com" RR_OUT=/tmp/rec.json \
  node --env-file=.env scripts/record.mjs                   # attaches to same session
# after stopping the recording:
node ../browser-trace/scripts/stop-capture.mjs myflow && node ../browser-trace/scripts/bisect-cdp.mjs myflow
```

| Var | Default | Meaning |
|-----|---------|---------|
| `RR_URL` | `https://example.com` | start URL |
| `RR_OUT` | `/tmp/recording-<ts>.json` | output recording path |
| `RR_CONNECT_URL` | _(none)_ | attach to an existing session (e.g. browser-trace's) instead of creating one |
| `RR_TITLE` / `RR_STOP` / `RR_SECONDS` | — | title / stop-file / auto-stop |

## 2. Distill (the agent does this)

Read `references/distill.md`, then **act as the teacher agent**: read
`recording.json` + the screenshots, query the `browser-trace` buckets as needed,
and reconstruct the *smallest set of intents that explains the session* —
collapsing corrections, dropping abandoned/undone actions, parameterizing the
values the user supplied. Write the result as `skills/<task>/`.

Each step's headline is the value the field **committed to** (the acted element's
`name`), never the keystrokes or a dynamic selector. The committed value is also
the step's verification check.

### What the generated task skill must contain

- `SKILL.md` — intent steps (shape below).
- `screenshots/NN-<label>.png` — the committed-state shot for each intent step,
  curated from the recording and referenced per step. This is the visual oracle.
- `recording.json` — the raw mechanics, last-resort fallback only.

### Task skill shape

Each step states the **intent**, names the **recorded target** (the element's
accessible name/role, and its selector if useful) as a *hint*, explicitly grants
the agent **agency to use whatever element achieves the intent**, points at the
screenshot, and gives a verification check.

```markdown
---
name: <task>
description: <what it does + when to fire, with triggers>
license: MIT
---
# <Task>
Realize each intent against the live UI — do NOT replay keystrokes or dynamic
selectors. The "recorded target" is a hint; if the live page differs, use any
element that achieves the intent. Verify each step.

Inputs: origin, destination, depart

1. Set destination = {destination}.
   Recorded target: combobox "Where to?" (aria/Where to?) → suggestion option.
   See screenshots/03-destination.png · ✅ field reads {destination}, not "Anywhere".
...
Fallback: screenshots/ (oracle) · recording.json (raw mechanics, last resort)
```

## 3. Replay

Replay = **invoke the generated task skill** like any skill (a natural-language
request that matches its triggers). The agent realizes each intent via `browse`,
using the per-step screenshots as the oracle and verifying committed values.
Because it replays *intent*, it survives dynamic-id churn and minor layout change.

## Recording shape

```json
{
  "title": "login flow",
  "startUrl": "https://www.saucedemo.com",
  "shots": "/tmp/rec-shots",
  "steps": [
    { "type": "navigate", "url": "https://www.saucedemo.com" },
    { "type": "change", "name": "Username", "role": "textbox", "value": "standard_user",
      "selectors": [["aria/Username"], ["#user-name"]], "screenshot": "/tmp/rec-shots/step-02.png" },
    { "type": "click", "name": "Login", "role": "button", "selectors": [["text/Login"], ["#login-button"]] }
  ]
}
```
