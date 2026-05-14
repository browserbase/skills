# Browser Swarm Running Test Notes

This file tracks issues found while stress-testing browser-swarm and the evidence used to close them.

## Fixed Issues

### Arc tab grouping crashes Arc

- Repro: Arc 1.146.0 crashed after the grouped path called `chrome.tabGroups.query` / `chrome.tabs.group`.
- Fix: Added `--no-group` mode and documented Arc as no-group only.
- Evidence: Arc no-group smoke and multi-tab real-world research both passed without extension warnings or an Arc crash.

### Disposable Chrome relay port conflicts with installed real-browser extension

- Repro: Arc's installed browser-swarm extension can connect to the default relay port while disposable Chrome tests are running.
- Fix: Added `--relay-port` / `BROWSER_SWARM_PORT` support and temporary extension patching in `launch-chrome.mjs`.
- Evidence: `BROWSER_SWARM_PORT=19990 BROWSER_SWARM_BROWSE_BIN=/Users/shrey/Developer/cli/bin/run.js npm run e2e` launched disposable Chrome with `/tmp/browser-swarm-extension-19990` and passed.

### E2E write assertions treated `browse get` results as strings

- Repro: `browse get title/text/value` returns JSON objects like `{ "title": "..." }`, `{ "text": "..." }`, and `{ "value": "..." }`; the new write test initially compared the whole object.
- Fix: Added `parseGetField()` to assert the specific returned field.
- Evidence: Parser checks passed and the e2e progressed to real browser behavior assertions.

### Parallel same-page input submission was flaky

- Repro: Three target-bound worker sessions on the same URL/title filled distinct values in parallel, but parallel submit via `fill --press-enter`, explicit `press Enter`, or `click #submit` left the third tab unsubmitted before the transport fix.
- Root cause: Chrome's visible input surface needs tab activation/serialization for `Input.*` CDP commands when multiple background tabs receive input concurrently through the extension debugger transport.
- Fix: The extension now activates the owning tab and serializes forwarded `Input.*` commands before sending them through `chrome.debugger.sendCommand`.
- Evidence: The Chrome e2e now passes with three same-page worker tabs, parallel `fill`, parallel `click #submit`, distinct title/text/value results, and one visible target per worker.

## Current Evidence

- Chrome disposable grouped e2e: PASS on relay port `19990`.
- Chrome raw CDP isolation: PASS; worker endpoint sees only its target and rejects sibling/lifecycle commands.
- Chrome same-page read/write workflow: PASS; three workers write distinct values to identical pages in parallel.
- Codex subagents: PASS in prior live stress; three real Codex `worker` agents each operated through a distinct target-bound endpoint and reported title/url/tab evidence plus screenshots.
- Claude Code CLI agent smoke: PASS with `claude -p --permission-mode bypassPermissions --allowedTools Bash --output-format json`.
- Mixed Codex + Claude Code live workflow: PASS; one Codex worker and one Claude Code agent operated concurrently in the same disposable Chrome profile against identical same-page tabs, each reported distinct title/text/value/url/tab evidence, and the main harness independently verified one visible target per worker.
- Arc no-group read/write workflow: PARTIAL PASS; target isolation, `fill`, `get`, and DOM `eval` submission worked on two identical Arc tabs without tab-group calls or Arc crash.

## Remaining Issues

### Arc no-group pointer click did not submit the second background tab

- Repro: Two Arc no-group worker tabs on `http://127.0.0.1:18082/same` filled distinct values in parallel. `click #submit` submitted the first tab, but the second stayed at title `arc-swarm-write-page` with `#result` as `empty` even though `#box` held `arc-beta-worker`.
- Workaround verified: `browse eval 'document.getElementById("form").requestSubmit(); document.title'` on the second target submitted the correct value and preserved target isolation.
- Likely cause: Arc was still running the previously loaded unpacked extension service worker. The installed skill has been synced with the input-command queue fix, but Computer Use cannot reload Arc here (`Apple event error -1743`), so the latest extension worker could not be confirmed in Arc.
- Follow-up: manually reload Browser Swarm Bridge in `arc://extensions`, confirm version `0.1.1`, and rerun the Arc pointer-click write test.

## Open Checks

- Manually reload the Arc extension and rerun the Arc pointer-click write test.
