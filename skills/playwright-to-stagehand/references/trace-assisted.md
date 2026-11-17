# The trace-assisted path (optional)

Most Playwright migrations are a static rewrite — Playwright scripts are explicit, so the source code
tells you everything. Reach for this run-and-observe path **only** when a static rewrite is
unreliable:

- the script leans on **network interception** (`page.route` / `waitForResponse`) you can't cleanly
  drop, and you need to see what actually loads;
- it's **flaky** or timing-dependent and you can't tell which waits matter;
- it uses **semantic/engine selectors** (`getByRole`, `text=`) and you want to confirm what the AI
  resolves them to before committing to `act()` vs a CSS locator;
- the page is heavily dynamic and you're unsure whether a step needs `act()` or a stable `locator`.

**Never run anything without the user's go-ahead.**

---

## Workflow

1. **Do the static rewrite first.** Produce the best Port/Rewrite/Upgrade version from the source.
   Mark the steps you're unsure about (the gaps and the `act()` guesses).

2. **Run it on Browserbase.** With `env: "BROWSERBASE"`, every run is a real cloud session with a
   replayable trace. Run the converted script (or the original, if you also want a baseline).

3. **Read the session trace / logs.** Pull what happened and compare it to your assumptions:
   - **Browserbase session inspector / replay** — the visual replay + network panel for the session.
   - **`@browserbasehq/sdk`** — `bb.sessions.logs.list(sessionId)` for the structured event log, and
     `bb.sessions.downloads.list(sessionId)` if the original captured downloads.
   - **The sibling `browser-trace` skill** — a fuller CDP trace (network firehose, screenshots, DOM
     dumps) bucketed per page, if you want deeper signal than the session logs.
   - Stagehand's own `verbose: 2` logging and `cacheStatus` on `act`/`observe` results (HIT/MISS).

4. **Refine from observed behavior.** Use the trace to:
   - confirm which `act()` calls resolved to the intended element (and whether a stable CSS/XPath
     `locator` would be tighter/cheaper);
   - replace any `act()` whose resolved selector is stable with an `observe()→act(action)` cached pair;
   - see which XHR/responses the dropped `route`/`waitForResponse` actually depended on, and decide
     whether to read the rendered result with `extract` or fall back to `page.sendCDP("Network.…")`;
   - find the real settle signal to replace a brittle wait.

5. **Re-verify.** Re-run the refined script; confirm the outcome matches the original's intent. Note
   in the migration summary what the trace changed.

---

## When NOT to bother

If the source is a clean, deterministic Playwright script with stable selectors and no interception,
a static rewrite is faster and just as correct — skip the trace pass. This path costs a live session
and a round-trip; spend it only where the source's behavior is genuinely opaque.
