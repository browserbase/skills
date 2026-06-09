# Trace-assisted migration (optional, advanced)

A static read of a browser-use script tells you *what it was asked to do*. Running it once on
Browserbase tells you *what it actually did* — the real URLs, network calls, and page transitions.
For opaque or flaky scripts, that observed behavior makes the Stagehand rewrite far more accurate.

This is the optional path. Skip it for simple scripts; reach for it when the source is a large
`agent(task="…")` blob whose actual flow is unclear, or when a migration's first rewrite doesn't
reproduce the original behavior.

> **Sibling skill:** this repo's [`browser-trace`](../../browser-trace/SKILL.md) productizes CDP
> trace capture — the full DevTools firehose, screenshots, and DOM dumps, bisected into per-page
> searchable buckets, and able to attach to a live Browserbase session. Use it to capture the
> browser-use run, then feed the per-page summaries into the rewrite. The Session Logs API below is
> the lighter-weight alternative when you just need navigations + network calls.

---

## Important reframe: what the "trace" actually is

The original idea was "attach a browser-trace as a CDP listener." On Browserbase, the
machine-readable trace is the **Session Logs API**, not the session recording:

- **Session Logs API** — `bb.sessions.logs.list(sessionId)` returns **CDP events**: network
  activity, console logs, and page lifecycle (navigations). **This is the structured trace** you
  parse to reconstruct the flow.
- **Session Recording / Replay** — now H.264 video (HLS segments), *not* an rrweb/DOM event
  stream. Great for **human QA** ("did it do the right thing?"), not for programmatic diffing.

So: **logs to drive the rewrite, video to eyeball it.** Don't promise a DOM-event stream from the
recording — it isn't that anymore.

---

## The workflow

### Step 1 — Run the existing browser-use script on Browserbase, unmodified

browser-use connects to any remote browser via `cdp_url`, and Browserbase is officially supported.
Point the existing script at a Browserbase session; record it and tag it for later retrieval.

```python
import os
from browserbase import Browserbase
from browser_use import Agent, Browser, BrowserProfile, ChatAnthropic

bb = Browserbase(api_key=os.environ["BROWSERBASE_API_KEY"])
session = bb.sessions.create(
    project_id=os.environ["BROWSERBASE_PROJECT_ID"],
    browser_settings={"record_session": True},      # keep recording on (default)
    user_metadata={"framework": "browser-use", "migration": "true"},
)
print(f"Session: https://www.browserbase.com/sessions/{session.id}")

# The ONLY change to the original script: hand it the Browserbase CDP endpoint
browser = Browser(browser_profile=BrowserProfile(cdp_url=session.connect_url))

agent = Agent(task="<the original task, unchanged>", llm=ChatAnthropic(model="claude-sonnet-4-6"), browser=browser)
await agent.run()
await browser.stop()
```

Notes:
- You must connect promptly — a new session terminates if nothing connects within ~5 minutes.
- Configure proxies/stealth/region on the **Browserbase session**, not on browser-use.
- Keep `session.id` — it's how you pull logs and the recording next.

### Step 2 — Pull the trace after the run

```python
logs = bb.sessions.logs.list(session.id)        # CDP network / console / lifecycle events
recording = bb.sessions.recording.retrieve(session.id)   # video (for human QA)
```
TypeScript equivalent with `@browserbasehq/sdk`:
```typescript
const logs = await bb.sessions.logs.list(sessionId);
```

From the logs, extract the spine of the flow:
- **Navigations** (page lifecycle events) → the `page.goto(...)` calls in the rewrite, and the URLs
  to anchor each phase.
- **Network calls** → which requests actually mattered (and whether some data could be read from an
  API response instead of scraped — sometimes a cleaner rewrite).
- **Console errors** → fragile spots to handle explicitly.

You can also open the **Session Inspector** in the dashboard for an Events/Pages timeline and, if
the run used Stagehand, act/extract results and token usage.

### Step 3 — Author the Stagehand rewrite from observed behavior

Map what you observed onto the determinism spectrum (see [determinism.md](determinism.md)):
- Observed fixed navigations → deterministic `page.goto(...)`.
- Observed interactions on varying markup → `act("…")`, or `observe()`→`act()` for repeatable steps.
- Observed data reads → `extract("…", schema)`.
- Reuse the same `browserbaseSessionCreateParams` (region/proxies/context) so behavior matches the
  baseline run.

### Step 4 — Validate against the baseline

Run the Stagehand rewrite under `env: "BROWSERBASE"` and compare its logs/recording to the
browser-use baseline: same navigations, same end state, same extracted data. Reuse the same
**Context** so auth carries over and you're comparing like with like.

---

## When to use this vs. skip it

| Use trace-assisted | Skip (static rewrite is enough) |
|---|---|
| One giant `agent(task="…")` whose real flow is unclear | Script already reads as clear, ordered steps |
| Script is flaky / behavior varies run to run | Deterministic, well-understood script |
| First static rewrite doesn't reproduce the original | Simple task / extraction |
| Auth, redirects, or heavy network make the path opaque | No login, single domain |

---

## Caveats

- The recording is **video**, not DOM events — use the **Logs API** for anything programmatic.
- Logs are retrieved **after** the run completes.
- A live CDP listener attaches on *your* side of the connection and suits JS/TS automation; for a
  Python browser-use run, prefer the post-run Logs API (or the `browser-trace` skill) over wiring up
  live listeners.
- Running the script incurs real LLM + browser cost — it's a deliberate, opt-in step.
